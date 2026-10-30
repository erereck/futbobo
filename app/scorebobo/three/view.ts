// Cena 3D do Scorebobo: monta o estádio da fase, os bonecos e a bola, desenha
// o traço do jogador e dirige a câmera. Só LÊ o estado da simulação.
//
// Orçamento: ~45 draw calls no quadro (céu, gramado, tigela, LED, torcida em
// 3 malhas, gol, rede, bandeirinhas, bonecos, bola, traço, efeitos), sombra
// só da luz principal sobre o campo (nenhuma no modo desempenho), pixel ratio
// até 1,75 (1 no desempenho, com orçamento de pixels), que a resolução
// adaptável pode baixar até 1,3 (0,7 no desempenho) em aparelho fraco.

import * as THREE from "three";
import { PITCH, type GameState, type KickPlan, type ScoreboboViewApi, type ScoreLevel, type ScoreTeams, type SimEvent, type Vec2, type Vec3 } from "../types";
import { BallActor } from "./ball";
import { CameraDirector } from "./camera";
import { Crowd } from "./crowd";
import { Effects } from "./effects";
import { Squad } from "./figures";
import { Goal } from "./goal";
import { Pitch } from "./pitch";
import { RunMarks } from "./runs";
import { SkyDome } from "./sky";
import { Stadium, stadiumSeats } from "./stadium";
import { StrokeView } from "./stroke";
import { applyEnv, clamp, clamp01, createEnvUniforms, hashString, SKY_LOOKS, type SkyLook } from "./util";

export type ScoreboboViewOptions = {
  /** Modo desempenho 3D: menos torcida, sem sombra projetada, resolução menor. */
  performance: boolean;
  reducedMotion: boolean;
  /** O WebGL caiu (o Scorebobo é só 3D: quem usa mostra o aviso e oferece recarregar). */
  onContextLost?: () => void;
  /** O navegador devolveu o contexto: a cena não volta sozinha, quem usa remonta a visão. */
  onContextRestored?: () => void;
};

/** Devolve a vez ao navegador entre as partes da montagem (a bola do "carregando" segue girando). */
function yieldNow(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Sombra PCF do three r186 com uma leitura só (o filtro de comparação já faz
 * um 2×2 no hardware): mesma troca da partida 3D. Idempotente.
 */
function applySingleTapShadows() {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const taps = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!taps.test(chunk)) return;
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(taps, "shadow = texture( shadowMap, vec3( shadowCoord.xy, shadowCoord.z ) );");
}

/** Lado que o WebGLShadowMap usa no material de profundidade (o avesso do material). */
const SHADOW_SIDE: Record<THREE.Side, THREE.Side> = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };

export type ScoreboboViewStats = { calls: number; triangles: number; points: number; cpuMs: number; pixelRatio: number; width: number; height: number };

export class ScoreboboView implements ScoreboboViewApi {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 1400);
  private readonly env = createEnvUniforms();
  private readonly hemi = new THREE.HemisphereLight("#ffffff", "#334422", 1);
  private readonly key = new THREE.DirectionalLight("#ffffff", 2.5);
  private readonly fill = new THREE.DirectionalLight("#ffffff", 1);
  private readonly director: CameraDirector;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), PITCH.goalLineZ);
  private readonly hitPoint = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly coarse: boolean;
  private sky: SkyDome | null = null;
  private pitch: Pitch | null = null;
  private goal: Goal | null = null;
  private stadium: Stadium | null = null;
  private crowd: Crowd | null = null;
  private squad: Squad | null = null;
  private ball: BallActor | null = null;
  private stroke: StrokeView | null = null;
  private runs: RunMarks | null = null;
  private effects: Effects | null = null;
  /** Plano horizontal na altura da bola no ar (traço do cabeceio/voleio). */
  private readonly airPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private look: SkyLook = SKY_LOOKS.night;
  private ready = false;
  private disposed = false;
  private contextLost = false;
  private width = 0;
  private height = 0;
  private pixelRatio = 1;
  /** O canvas mudou de tamanho (ResizeObserver): só então o quadro lê clientWidth. */
  private sizeDirty = true;
  private alwaysMeasure = false;
  // Resolução adaptável: `basePixelRatio` é o teto de sempre; a escala só desce
  // em aparelho que não segura 48 quadros por segundo, até `minPixelRatio`.
  private basePixelRatio = 1;
  private minPixelRatio = 1;
  private resolutionScale = 1;
  /** Escala nova esperando um quadro calmo (ou um corte) para trocar o buffer. */
  private resolutionPending = false;
  private frameAverage = 1 / 60;
  private resolutionClock = 0;
  private averageBeforeDrop: number | null = null;
  private scaleBeforeDrop = 1;
  private resolutionMisses = 0;
  private worldTime = 0;
  private lastHit: Vec3 = { x: 0, y: 1.2, z: PITCH.goalLineZ + 1.5 };
  private lastPhase: GameState["phase"] | null = null;
  /** Tempo real desde o gol e quem fez (estouro de confete em volta dele na festa). */
  private goalClock = -1;
  private lastReplayAngle = -1;
  private scorerBurst = false;
  private frameIndex = 0;
  private scorerId: string | null = null;
  private lastStats: ScoreboboViewStats = { calls: 0, triangles: 0, points: 0, cpuMs: 0, pixelRatio: 1, width: 0, height: 0 };
  /** Mapa de sombra R8 criado aqui (null no modo desempenho). */
  private shadowTarget: THREE.WebGLRenderTarget | null = null;
  /** Materiais de profundidade que só servem para compilar o passe de sombra na montagem. */
  private readonly depthStandIns: THREE.Material[] = [];
  private readonly cleanup: Array<() => void> = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly options: ScoreboboViewOptions,
  ) {
    applySingleTapShadows();
    const performance = options.performance;
    this.coarse = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 600);
    // MSAA: no celular resolve no tile (quase de graça); no desktop do modo desempenho sai.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !performance || this.coarse, powerPreference: "high-performance", alpha: false });
    this.renderer.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = !performance;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.director = new CameraDirector(this.camera, options.reducedMotion);

    this.scene.add(this.hemi);
    this.key.castShadow = !performance;
    const shadowSize = this.coarse ? 1024 : 2048;
    this.key.shadow.mapSize.set(shadowSize, shadowSize);
    if (!performance) {
      // Mapa de sombra com cor R8 no lugar do RGBA8 padrão: a sombra PCF só lê a
      // textura de profundidade, e limpar a cor de 4 canais era quase todo o custo
      // do passe. Preso ao three 0.186 (WebGLShadowMap só recria o mapa quando ele é
      // null ou o tipo de sombra muda; WebGLLights lê depthTexture fora do VSM): ao
      // atualizar o three, conferir o aviso de desenvolvimento no prepare().
      const target = new THREE.WebGLRenderTarget(shadowSize, shadowSize, { format: THREE.RedFormat, type: THREE.UnsignedByteType, generateMipmaps: false });
      const depth = new THREE.DepthTexture(shadowSize, shadowSize, THREE.UnsignedIntType);
      depth.format = THREE.DepthFormat;
      depth.compareFunction = this.renderer.state.buffers.depth.getReversed() ? THREE.GreaterEqualCompare : THREE.LessEqualCompare;
      depth.minFilter = THREE.LinearFilter;
      depth.magFilter = THREE.LinearFilter;
      target.depthTexture = depth;
      this.key.shadow.map = target;
      this.shadowTarget = target;
    }
    this.key.shadow.bias = -0.0005;
    // Refeita sob demanda: com o tempo congelado, um quadro em três basta.
    this.key.shadow.autoUpdate = false;
    this.key.shadow.needsUpdate = true;
    this.key.shadow.normalBias = 0.03;
    this.scene.add(this.key, this.key.target, this.fill, this.fill.target);

    const onLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      this.options.onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    this.cleanup.push(() => canvas.removeEventListener("webglcontextlost", onLost));
    const onRestored = () => this.options.onContextRestored?.();
    canvas.addEventListener("webglcontextrestored", onRestored);
    this.cleanup.push(() => canvas.removeEventListener("webglcontextrestored", onRestored));

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        this.sizeDirty = true;
      });
      observer.observe(canvas);
      this.cleanup.push(() => observer.disconnect());
    } else {
      // Sem ResizeObserver, mede todo quadro como antes.
      this.alwaysMeasure = true;
    }
    // Giro do Android ou janela mudando: o evento chega antes dos callbacks de
    // rAF do mesmo quadro (o ResizeObserver só depois deles), então o render
    // desse quadro já mede e sai no tamanho novo, como quando media sempre.
    const onViewport = () => {
      this.sizeDirty = true;
    };
    window.addEventListener("resize", onViewport);
    window.addEventListener("orientationchange", onViewport);
    this.cleanup.push(() => {
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("orientationchange", onViewport);
    });
  }

  // ---------------------------------------------------------------- montagem

  async prepare(level: ScoreLevel, teams: ScoreTeams, state: GameState): Promise<void> {
    if (this.disposed) return;
    const performance = this.options.performance;
    const seed = hashString(level.id) % 100000;
    this.look = SKY_LOOKS[level.sky] ?? SKY_LOOKS.night;
    const look = this.look;
    applyEnv(this.env, look);
    this.scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
    this.scene.background = new THREE.Color(look.horizon);
    this.hemi.color.set(look.hemiSky);
    this.hemi.groundColor.set(look.hemiGround);
    this.hemi.intensity = look.hemiIntensity;
    this.key.color.set(look.keyColor);
    this.key.intensity = look.keyIntensity;
    this.renderer.toneMappingExposure = look.exposure;
    this.fill.color.set(look.fillColor);
    this.fill.intensity = look.fillIntensity;
    this.fill.target.position.set(0, 0, 30);
    this.fill.position.set(-look.keyDir.x * 100, look.keyDir.y * 70 + 20, -look.keyDir.z * 100 + 30);
    this.fitShadow(look);

    // A montagem vai em pedaços, devolvendo a vez ao navegador entre eles: no
    // celular era um travamento só de meio segundo (nada aparece antes do `ready`).
    this.sky = new SkyDome(look, this.env.uTime);
    this.scene.add(this.sky.mesh);
    this.pitch = new Pitch(look, performance);
    this.scene.add(this.pitch.mesh);
    await yieldNow();
    if (this.disposed || this.contextLost) return;
    this.goal = new Goal({ flagColor: "#ffd23f" });
    this.scene.add(this.goal.group);
    await yieldNow();
    if (this.disposed || this.contextLost) return;
    const colors = { homeA: teams.home.primary, homeB: teams.home.secondary, awayA: teams.away.primary, awayB: teams.away.secondary };
    this.stadium = new Stadium(this.env, colors, performance);
    this.stadium.setLook(look.lights);
    this.scene.add(this.stadium.group);
    await yieldNow();
    if (this.disposed || this.contextLost) return;
    this.crowd = new Crowd(stadiumSeats(performance, seed), colors, this.env, { calm: this.options.reducedMotion, seed });
    this.scene.add(this.crowd.group);
    await yieldNow();
    if (this.disposed || this.contextLost) return;
    this.squad = new Squad(state, teams, performance, seed);
    this.scene.add(this.squad.group);
    const squad = this.squad;
    this.director.focusOf = (id, out) => squad.centerOf(id, out);
    // Fase de chute direto (falta sem passe): a mira é de chute, com o gol grande.
    this.director.shootOnly = (level.require ?? []).some((rule) => rule.kind === "maxPasses" && rule.max === 0);
    await yieldNow();
    if (this.disposed || this.contextLost) return;
    this.ball = new BallActor(performance);
    this.scene.add(this.ball.group);
    this.stroke = new StrokeView(this.camera, this.env.uTime);
    this.scene.add(this.stroke.group);
    this.runs = new RunMarks(this.env.uTime);
    this.scene.add(this.runs.mesh);
    this.effects = new Effects({ reducedMotion: this.options.reducedMotion, performance, colors: [teams.home.primary, teams.home.secondary] });
    this.scene.add(this.effects.group);
    await yieldNow();
    if (this.disposed || this.contextLost) return;

    // Pose inicial da câmera (o primeiro quadro já sai enquadrado) e texturas na GPU.
    this.resize(true);
    this.director.update(state, [], 0, this.lastHit);
    for (const texture of [...this.squad.textures(), ...this.ball.textures()]) this.renderer.initTexture(texture);
    try {
      // A sombra antes: ela troca o alvo para o mapa de sombra e o devolve antes da cena compilar.
      const shadow = this.compileShadowDepth();
      await Promise.all([this.renderer.compileAsync(this.scene, this.camera), shadow]);
    } catch {
      // Sem compilação paralela: compila no primeiro quadro.
    }
    if (this.disposed || this.contextLost) return;
    this.ready = true;
    this.renderer.render(this.scene, this.camera);
    if (process.env.NODE_ENV !== "production" && this.key.castShadow && this.key.shadow.map?.texture.format !== THREE.RedFormat) {
      console.warn("[scorebobo] o three trocou o mapa de sombra R8 pelo dele: revisar o atalho no construtor da ScoreboboView.");
    }
  }

  /**
   * Os dois programas do passe de sombra (bonecos e o resto dos casters)
   * compilavam travando o primeiro quadro. Compilam junto com os outros: uma
   * cena de mentira com as mesmas variantes de material que o WebGLShadowMap
   * vai pedir (regra do getDepthMaterial do three 0.186) e o mapa de sombra
   * como alvo (sem tone mapping, como no passe de verdade). O material de
   * profundidade padrão é um só e fica com o programa do primeiro caster que
   * passa (trocar mapa ou lado não recompila), por isso vale o primeiro.
   */
  private compileShadowDepth(): Promise<unknown> | null {
    const target = this.shadowTarget;
    if (!this.key.castShadow || !target || this.key.shadow.map !== target) return null;
    const proxies = new THREE.Scene();
    const seen = new Set<string>();
    this.scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.castShadow || Array.isArray(mesh.material)) return;
      const source = mesh.material as THREE.MeshStandardMaterial;
      const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
      const side = source.shadowSide ?? SHADOW_SIDE[source.side];
      const alphaTest = source.alphaToCoverage ? 0.5 : source.alphaTest;
      const custom = mesh.customDepthMaterial;
      const key = `${custom ? custom.uuid : "depth"}:${skinned}`;
      if (seen.has(key)) return;
      seen.add(key);
      let depth = custom as THREE.MeshDepthMaterial | undefined;
      if (!depth) {
        depth = new THREE.MeshDepthMaterial();
        this.depthStandIns.push(depth);
      }
      depth.side = side;
      depth.map = source.map ?? null;
      depth.alphaMap = source.alphaMap ?? null;
      depth.alphaTest = alphaTest;
      depth.displacementMap = source.displacementMap ?? null;
      depth.displacementScale = source.displacementScale ?? 1;
      depth.displacementBias = source.displacementBias ?? 0;
      proxies.add(skinned ? new THREE.SkinnedMesh(mesh.geometry, depth) : new THREE.Mesh(mesh.geometry, depth));
    });
    // Luzes da cena de verdade, mas sem a neblina: o passe de sombra desenha numa cena vazia.
    const previous = this.renderer.getRenderTarget();
    const fog = this.scene.fog;
    this.scene.fog = null;
    this.renderer.setRenderTarget(target);
    try {
      return this.renderer.compileAsync(proxies, this.key.shadow.camera, this.scene);
    } finally {
      this.renderer.setRenderTarget(previous);
      this.scene.fog = fog;
    }
  }

  /** Caixa da sombra justa na metade de ataque (texels de ~3 cm). */
  private fitShadow(look: SkyLook) {
    const center = new THREE.Vector3(0, 0, 30);
    this.key.target.position.copy(center);
    this.key.position.copy(center).addScaledVector(look.keyDir, 120);
    this.key.updateMatrixWorld();
    this.key.target.updateMatrixWorld();
    const shadowCamera = this.key.shadow.camera;
    const view = new THREE.Matrix4().lookAt(this.key.position, center, new THREE.Vector3(0, 1, 0));
    const inverse = view.clone().invert();
    const box = new THREE.Box3();
    const corner = new THREE.Vector3();
    for (const x of [-PITCH.halfWidth - 2, PITCH.halfWidth + 2]) {
      for (const z of [2, PITCH.goalLineZ + 4]) {
        for (const y of [0, 4]) {
          corner.set(x, y, z).sub(this.key.position).applyMatrix4(inverse.clone().setPosition(0, 0, 0));
          box.expandByPoint(corner);
        }
      }
    }
    shadowCamera.left = box.min.x;
    shadowCamera.right = box.max.x;
    shadowCamera.bottom = box.min.y;
    shadowCamera.top = box.max.y;
    shadowCamera.near = 1;
    shadowCamera.far = 260;
    shadowCamera.updateProjectionMatrix();
  }

  private resize(force = false) {
    // Ler clientWidth logo depois do React mexer no HUD força layout: só lê quando o tamanho mudou.
    if (!force && !this.sizeDirty) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.sizeDirty = false;
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const dpr = window.devicePixelRatio || 1;
    // Modo desempenho: no máximo 1 e um orçamento de pixels (~0,45 MP no celular, ~1 MP no desktop).
    const budget = this.options.performance ? (this.coarse ? 4.5e5 : 1e6) : 4.2e6;
    const cap = this.options.performance ? 1 : 1.75;
    this.basePixelRatio = Math.max(0.6, Math.min(dpr, cap, Math.sqrt(budget / (width * height))));
    // Piso da resolução adaptável (nunca acima do teto: em tela de dpr 1 ela nem mexe).
    this.minPixelRatio = Math.min(this.basePixelRatio, this.options.performance ? 0.7 : Math.min(dpr, 1.3));
    this.applyPixelRatio();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.director.setAspect(width / height);
  }

  /** Um buffer novo só (setPixelRatio + setSize alocavam o backbuffer com MSAA duas vezes). */
  private applyPixelRatio() {
    this.pixelRatio = Math.max(this.minPixelRatio, this.basePixelRatio * this.resolutionScale);
    this.resolutionPending = false;
    this.resolutionClock = 0;
    this.renderer.setDrawingBufferSize(this.width, this.height, this.pixelRatio);
  }

  /**
   * Resolução adaptável (mesma regra da partida 3D): quadro pesado (abaixo de
   * ~48 por segundo) desce um degrau; com folga por alguns segundos, sobe. Se
   * descer não melhorou nada, o gargalo é a CPU: volta o degrau e, na segunda
   * vez, para de descer (imagem borrada sem ganho não serve). No máximo uma
   * troca a cada 1,5 s, e o buffer só troca num quadro calmo ou num corte.
   * `frameDt` = tempo real entre quadros desenhados (s).
   */
  adaptResolution(frameDt: number): void {
    if (!this.ready || frameDt <= 0 || frameDt > 0.25) return;
    this.frameAverage += (frameDt - this.frameAverage) * 0.06;
    // Troca esperando a vez: o efeito dela só é medido depois que entrar.
    if (this.resolutionPending) return;
    this.resolutionClock += frameDt;
    if (this.resolutionClock < 1.5) return;
    // Tela presa em 30 Hz (economia de energia) com o render folgado: não é peso.
    const powerSaver = Math.abs(this.frameAverage - 1 / 30) < 0.0015 && this.lastStats.cpuMs < 6;
    const lowest = this.minPixelRatio / this.basePixelRatio;
    let next = this.resolutionScale;
    if (this.averageBeforeDrop !== null) {
      const helped = this.frameAverage < this.averageBeforeDrop * 0.95;
      this.averageBeforeDrop = null;
      if (!helped) {
        // Descer não ajudou: o gargalo não é pixel. Volta o degrau.
        this.resolutionMisses += 1;
        next = this.scaleBeforeDrop;
      }
    } else if (this.frameAverage > 1 / 48 && !powerSaver && this.resolutionMisses < 2 && this.resolutionScale > lowest + 0.001) {
      next = Math.max(lowest, this.resolutionScale - 0.1);
      this.averageBeforeDrop = this.frameAverage;
      this.scaleBeforeDrop = this.resolutionScale;
    } else if (this.frameAverage < 1 / 57 && this.resolutionClock > 4 && this.resolutionScale < 1 - 0.001) {
      next = Math.min(1, this.resolutionScale + 0.05);
    } else {
      return;
    }
    this.resolutionClock = 0;
    if (Math.abs(next - this.resolutionScale) < 0.001) return;
    this.resolutionScale = next;
    this.resolutionPending = true;
  }

  /** A resolução adaptável chegou no piso: não há mais o que baixar. */
  get atResolutionFloor(): boolean {
    return this.pixelRatio <= this.minPixelRatio + 1e-3;
  }

  /**
   * Baixar a resolução já não resolve: chegou no piso, ou desceu duas vezes sem
   * melhorar (o gargalo é a CPU e baixar mais não adianta).
   */
  get resolutionExhausted(): boolean {
    return this.atResolutionFloor || this.resolutionMisses >= 2;
  }

  /**
   * Mira parada: câmera assentada, nenhum fade do traço, das setas ou dos
   * efeitos em andamento e nada de festa. O laço pode desenhar menos quadros.
   */
  get calm(): boolean {
    const { stroke, effects, runs } = this;
    if (!this.ready || !stroke || !effects || !runs) return false;
    return this.lastPhase === "aim" && this.goalClock < 0 && !this.sizeDirty && this.director.settled && stroke.settled && effects.settled && runs.settled;
  }

  // ---------------------------------------------------------------- entrada

  private ray(x: number, y: number) {
    // Tamanho guardado no último resize (ler clientWidth aqui forçava layout no meio do quadro).
    const width = this.width || 1;
    const height = this.height || 1;
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray;
  }

  project(x: number, y: number, airY?: number): { ground: Vec2 | null; goal: Vec3 | null; air?: Vec2 | null } {
    // Traço começando com a câmera ainda indo para a mira: ela chega na hora.
    if (this.lastPhase === "aim") this.director.snapToAim();
    const ray = this.ray(x, y);
    let ground: Vec2 | null = null;
    // Só o gramado até as placas: o raio que passa por cima delas está mirando a arquibancada.
    if (ray.direction.y < -1e-4 && ray.intersectPlane(this.groundPlane, this.hitPoint)) {
      const p = this.hitPoint;
      if (Math.abs(p.x) <= PITCH.halfWidth + 6 && Math.abs(p.z) <= PITCH.goalLineZ + 6) ground = { x: p.x, z: p.z };
    }
    let goal: Vec3 | null = null;
    // Plano do gol só perto da boca (até ~3 m para fora das traves e acima do travessão).
    if (ray.direction.z > 1e-4 && ray.intersectPlane(this.goalPlane, this.hitPoint)) {
      const p = this.hitPoint;
      if (Math.abs(p.x) <= PITCH.goalHalfWidth + 3 && p.y >= -0.5 && p.y <= PITCH.goalHeight + 2.5) {
        goal = { x: p.x, y: Math.max(0, p.y), z: PITCH.goalLineZ };
      }
    }
    if (airY === undefined) return { ground, goal };
    // Bola no ar: o traço no plano da altura dela (no gramado a projeção cai metros adiante).
    let air: Vec2 | null = null;
    this.airPlane.constant = -airY;
    if (ray.direction.y < -1e-4 && ray.intersectPlane(this.airPlane, this.hitPoint)) {
      const p = this.hitPoint;
      if (Math.abs(p.x) <= PITCH.halfWidth + 6 && Math.abs(p.z) <= PITCH.goalLineZ + 6) air = { x: p.x, z: p.z };
    }
    return { ground, goal, air };
  }

  screenOf(point: Vec3): { x: number; y: number } | null {
    const p = this.projected.set(point.x, point.y, point.z);
    // Atrás da câmera: nada.
    const view = this.hitPoint.copy(p).applyMatrix4(this.camera.matrixWorldInverse);
    if (view.z > -this.camera.near) return null;
    p.project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height };
  }

  setStroke(points: Vec3[] | null, plan: KickPlan | null): void {
    this.stroke?.set(points, plan);
    this.squad?.setReceiver(points ? plan?.receiver ?? null : null);
  }

  /** Mira: o jogador gira a câmera em volta da bola (a bola fica no mesmo ponto da tela). */
  turnAim(radians: number): void {
    if (this.lastPhase !== "aim" || !Number.isFinite(radians)) return;
    this.director.turnAim(radians);
  }

  resetAimTurn(): void {
    this.director.resetAimTurn();
  }

  get aimTurn(): number {
    return this.director.aimTurn;
  }

  // ---------------------------------------------------------------- quadro

  render(state: GameState, dt: number, events: SimEvent[]): void {
    if (!this.ready || this.disposed || this.contextLost) return;
    const started = performance.now();
    if (this.alwaysMeasure) this.sizeDirty = true;
    this.resize();
    const realDt = clamp(dt, 0, 0.1);
    const phase = state.phase;
    const frozen = phase === "aim";
    const scale = clamp(state.timeScale, 0, 2);
    const gameDt = frozen ? 0 : realDt * scale;
    // O mundo (torcida, bandeiras, LED) quase para com o tempo congelado.
    this.worldTime += realDt * (phase === "aim" ? 0.12 : Math.max(0.25, scale));
    this.env.uTime.value = this.worldTime;

    const squad = this.squad!;
    const ball = this.ball!;
    const goal = this.goal!;
    const stadium = this.stadium!;
    const effects = this.effects!;
    const stroke = this.stroke!;

    if (phase !== this.lastPhase) this.enterPhase(state, this.lastPhase);
    this.lastPhase = phase;
    this.handleEvents(state, events);

    // Bonecos: congelados (quase) na mira; o herói arma a perna no tempo real.
    const animDt = phase === "aim" ? realDt * 0.1 : gameDt;
    squad.update(state, animDt, realDt, stroke.aimRatio);
    const inFlight = phase === "flight" || phase === "outcome" || phase === "replay";
    ball.setShot(state.plan?.shot ?? false);
    ball.update(state.ball, gameDt, realDt, this.camera, inFlight);
    goal.update(this.worldTime, gameDt, state.ball);

    // Torcida: levanta com a bola indo para o gol.
    let tension = 0;
    if (phase === "flight" && state.plan?.shot) {
      const toLine = PITCH.goalLineZ - state.ball.pos.z;
      tension = clamp01(1 - toLine / 30);
    } else if (phase === "aim") {
      const hero = state.actors.find((actor) => actor.id === state.heroId);
      tension = hero ? clamp01(1 - (PITCH.goalLineZ - hero.pos.z) / 40) * 0.35 : 0;
    }
    stadium.setTension(THREE.MathUtils.damp(stadium.tensionAmount, tension, 3, realDt));
    stadium.update(realDt * Math.max(0.35, scale));
    this.crowd?.update({ cheer: stadium.cheer, cheerT: stadium.goalShowTime, ooh: stadium.oohAmount, tension: stadium.tensionAmount, ball: state.ball.pos });

    const hero = state.actors.find((actor) => actor.id === state.heroId);
    const receiverId = phase === "aim" ? stroke.receiverId : null;
    const receiver = receiverId ? state.actors.find((actor) => actor.id === receiverId) : null;
    // O traço vira giz fraco na jogada e some nos planos de cinema.
    const shot = this.director.shot;
    const dim = phase === "aim" ? 1 : phase === "flight" && shot === "follow" ? 0.4 : 0;
    stroke.update(realDt, phase === "aim" && hero ? hero.pos : null, receiver ? receiver.pos : null, dim);
    this.runs?.update(state, realDt, stroke.drawing);

    effects.setFreeze(phase === "aim" ? 1 : 0);
    effects.setBars(phase === "replay");
    // À noite a borda do quadro fica no escuro (o gramado aceso no meio é o que diz "jogo de noite").
    const baseVignette = this.look.lights > 0.9 ? 0.4 : 0.18;
    effects.setVignette(phase === "outcome" && state.timeScale < 0.8 ? 0.7 : phase === "replay" ? Math.max(0.35, baseVignette) : phase === "flight" && state.timeScale < 0.8 ? 0.5 : baseVignette);
    if (this.goalClock >= 0) {
      this.goalClock += realDt;
      // O artilheiro para e faz a comemoração dele: chuva de confete em cima dele.
      const scorer = state.actors.find((actor) => actor.id === this.scorerId);
      if (!this.scorerBurst && scorer && phase !== "replay" && ((scorer.pose === "celebrate" && this.goalClock > 0.8) || this.goalClock > 2.6)) {
        this.scorerBurst = true;
        effects.burst({ x: scorer.pos.x, y: 2.5, z: scorer.pos.z }, this.options.performance ? 60 : 130, 2.6);
      }
      if (this.goalClock > 12 || phase === "aim") this.goalClock = -1;
    }
    effects.update(gameDt, realDt);

    this.director.update(state, events, realDt, this.lastHit);
    if (this.director.cutRequested) {
      effects.dipToBlack();
      // Troca de ângulo do replay = o lance recomeça: bonecos e rastro do zero.
      if (phase === "replay" && this.lastReplayAngle !== (state.replay?.angle ?? -1)) {
        this.squad?.settle(state);
        this.ball?.reset();
      }
      this.lastReplayAngle = state.replay?.angle ?? -1;
    }
    // Resolução adaptável: o buffer novo entra com a mira parada ou escondido no corte.
    if (this.resolutionPending && (this.director.cutRequested || this.calm)) this.applyPixelRatio();
    this.sky!.follow(this.camera);

    // Escala dos pontos (px por metro a 1 m de distância).
    const pointScale = (this.height * this.pixelRatio * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    stadium.setPointScale(pointScale);
    effects.setPointScale(pointScale, this.camera.aspect);

    this.frameIndex += 1;
    if (this.key.castShadow) this.key.shadow.needsUpdate = phase !== "aim" || this.frameIndex % 3 === 0;
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info.render;
    this.lastStats = {
      calls: info.calls,
      triangles: info.triangles,
      points: info.points,
      cpuMs: performance.now() - started,
      pixelRatio: this.pixelRatio,
      width: this.width,
      height: this.height,
    };
  }

  private enterPhase(state: GameState, previous: GameState["phase"] | null) {
    if (state.phase === "aim" && previous !== "aim") {
      this.stadium?.calm();
    }
    if (state.phase === "replay" || previous === "replay") {
      this.ball?.reset();
      if (state.phase === "replay") this.effects?.clear();
      // Todo replay assenta os bonecos no primeiro corte (o "Ver replay" começa no ângulo em que o anterior pode ter sido pulado).
      if (state.phase === "replay") this.lastReplayAngle = -1;
      // Saindo do replay (volta ao estado ao vivo). A entrada assenta no corte de câmera.
      if (previous === "replay") this.squad?.settle(state);
    }
    // Recomeço (nova tentativa ou "Recomeçar" no meio da festa): nada da jogada anterior sobra.
    const restarted = state.phase === "intro" && previous !== null && previous !== "intro";
    if (restarted) {
      this.goalClock = -1;
      this.stadium?.calm();
    }
    if (restarted || (state.phase === "aim" && (previous === "outcome" || previous === "replay" || previous === "done"))) {
      // Nova tentativa: some com confete e rastro da anterior.
      this.ball?.reset();
      this.effects?.clear();
      this.squad?.settle(state);
    }
  }

  private handleEvents(state: GameState, events: SimEvent[]) {
    const effects = this.effects!;
    const replay = state.phase === "replay";
    for (const event of events) {
      switch (event.type) {
        case "kick": {
          const actor = state.actors.find((item) => item.id === event.actor);
          this.squad?.kicked(event.actor, event.power);
          if (actor) {
            const v = state.ball.vel;
            const flat = Math.hypot(v.x, v.z) || 1;
            effects.kick({ x: state.ball.pos.x, y: 0, z: state.ball.pos.z }, { x: v.x / flat, z: v.z / flat }, clamp01(event.power));
          }
          if (!replay) effects.pulse(0.06);
          break;
        }
        case "receive":
          this.squad?.received(event.actor);
          break;
        case "net": {
          // A força vem da velocidade com que a bola chegou (encostada, a rede quase não mexe).
          const speed = event.speed ?? Math.hypot(state.ball.vel.x, state.ball.vel.y, state.ball.vel.z);
          this.lastHit = { ...event.point };
          this.goal?.hit(event.point, Math.max(0.12, clamp01(speed / 28)));
          if (speed > 4) effects.netPuff(event.point);
          break;
        }
        case "goal": {
          if (!this.lastHitFresh(state)) this.goal?.hit(state.ball.pos, 0.7);
          if (replay) break;
          if (event.valid === false) {
            // Entrou, mas não valeu: o estádio murcha em vez de explodir.
            this.stadium?.ooh();
            break;
          }
          this.goalClock = 0;
          this.scorerBurst = false;
          this.scorerId = event.scorer;
          this.stadium?.goal();
          effects.goal();
          this.director.punch(1);
          break;
        }
        case "post": {
          const p = state.ball.pos;
          effects.spark({ x: clamp(p.x, -PITCH.goalHalfWidth - 0.1, PITCH.goalHalfWidth + 0.1), y: p.y, z: PITCH.goalLineZ });
          if (!replay) this.stadium?.ooh();
          break;
        }
        case "save":
          if (!replay) this.stadium?.ooh();
          effects.pulse(0.12);
          break;
        case "miss":
          if (!replay && event.reason !== "short") this.stadium?.ooh();
          break;
        default:
          break;
      }
    }
  }

  /** O último "net" foi agora (a rede já estufou pelo evento próprio). */
  private lastHitFresh(state: GameState) {
    const ball = state.ball.pos;
    return Math.hypot(ball.x - this.lastHit.x, ball.y - this.lastHit.y, ball.z - this.lastHit.z) < 1.5;
  }

  /** Números do último quadro (laboratório e ajuste fino). */
  stats(): ScoreboboViewStats {
    return this.lastStats;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const release of this.cleanup) release();
    this.sky?.dispose();
    this.pitch?.dispose();
    this.goal?.dispose();
    this.stadium?.dispose();
    this.crowd?.dispose();
    this.squad?.dispose();
    this.ball?.dispose();
    this.stroke?.dispose();
    this.runs?.dispose();
    this.effects?.dispose();
    for (const material of this.depthStandIns) material.dispose();
    this.key.shadow.map?.depthTexture?.dispose();
    this.key.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

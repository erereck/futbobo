// Palco 3D da despedida: o estádio de botão à noite, lotado na cor do clube,
// o corredor de companheiros aplaudindo e a lenda indo até o círculo central.
//
// Quem usa: `FarewellCutscene` carrega este módulo sob demanda, chama
// `prepare()` antes do primeiro quadro e depois `render(tempo, dt)` a cada
// quadro com o relógio do roteiro (`farewell-script.ts`). Mesma direção da
// apresentação do reforço: trilhas por boneco, planos de câmera em função do
// tempo e salto (Pular/Rever) que deixa cada um no gesto certo.

import * as THREE from "three";
import { DEFAULT_BOTAO_RULES, type BotaoMatchSetup, type BotaoTeam } from "../botao/types";
import {
  PlayerFigure,
  idleIntent,
  releaseSharedFigureResources,
  retainSharedFigureResources,
  type FigureAction,
  type FigureIntent,
} from "../botao/three/character";
import { STADIUM_MOOD, Stadium } from "../botao/three/stadium";
import { FAREWELL_MARKS, FAREWELL_PLACES, crowdLevel, seededRandom, type FarewellTimeline } from "./farewell-script";

export type FarewellStageOptions = {
  /** Modo desempenho 3D: sem sombra, sem torcida de bonecos, resolução menor. */
  performance: boolean;
  /** Sem câmera na mão, sem estrobo das placas e sem ola. */
  reducedMotion: boolean;
  /** O WebGL caiu: quem usa troca para a versão 2D. */
  onContextLost?: () => void;
};

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth01 = (value: number) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const mix = (from: number, to: number, k: number) => from + (to - from) * k;
const progress = (time: number, from: number, to: number) => clamp01((time - from) / Math.max(0.01, to - from));
const yawTo = (ax: number, az: number, bx: number, bz: number) => Math.atan2(bx - ax, bz - az);

/** Pré-rodagem depois de um salto: passo e teto (s). Passo máximo das molas do boneco. */
const PREROLL_STEP = 1 / 30;
const PREROLL_MAX = 2.4;
const FIGURE_STEP = 0.05;
const M = FAREWELL_MARKS;
const P = FAREWELL_PLACES;
/** De frente para a arquibancada principal (do outro lado do túnel). */
const MAIN_STAND = -Math.PI / 2;

// --------------------------------------------------------------- direção

type ActorPose = { x: number; z: number; face: number; walking: boolean; speed: number; heading: number; action: FigureAction | null; since: number };
const emptyPose = (): ActorPose => ({ x: 0, z: 0, face: 0, walking: false, speed: 0, heading: 0, action: null, since: 0 });
type Walk = { start: number; end: number; ax: number; az: number; bx: number; bz: number };

/** Roteiro de um boneco: caminhadas, para onde vira e o que faz. Ler não aloca nada. */
class ActorTrack {
  private readonly walks: Walk[] = [];
  private readonly faces: Array<{ at: number; yaw: number }> = [];
  private readonly acts: Array<{ at: number; action: FigureAction | null }> = [];

  constructor(private readonly homeX: number, private readonly homeZ: number, private readonly homeYaw: number) {}

  walk(start: number, end: number, x: number, z: number) {
    const last = this.walks[this.walks.length - 1];
    this.walks.push({ start, end, ax: last ? last.bx : this.homeX, az: last ? last.bz : this.homeZ, bx: x, bz: z });
    return this;
  }

  face(at: number, yaw: number) {
    this.faces.push({ at, yaw });
    this.faces.sort((a, b) => a.at - b.at);
    return this;
  }

  act(at: number, action: FigureAction | null) {
    this.acts.push({ at, action });
    this.acts.sort((a, b) => a.at - b.at);
    return this;
  }

  sample(time: number, out: ActorPose): ActorPose {
    let x = this.homeX;
    let z = this.homeZ;
    let since = 0;
    out.walking = false;
    for (const walk of this.walks) {
      if (time < walk.start) break;
      if (time < walk.end) {
        // Passo com arrancada e chegada suaves (ninguém para seco).
        const k = smooth01((time - walk.start) / (walk.end - walk.start));
        x = mix(walk.ax, walk.bx, k);
        z = mix(walk.az, walk.bz, k);
        out.walking = true;
        out.heading = Math.atan2(walk.bx - walk.ax, walk.bz - walk.az);
        out.speed = (Math.hypot(walk.bx - walk.ax, walk.bz - walk.az) / (walk.end - walk.start)) * 1.25;
        since = walk.start;
        break;
      }
      x = walk.bx;
      z = walk.bz;
      since = walk.end;
    }
    let face = this.homeYaw;
    for (const item of this.faces) {
      if (item.at > time) break;
      face = item.yaw;
      since = Math.max(since, item.at);
    }
    let action: FigureAction | null = null;
    for (const item of this.acts) {
      if (item.at > time) break;
      action = item.action;
      since = Math.max(since, item.at);
    }
    out.x = x;
    out.z = z;
    if (out.walking) {
      out.face = out.heading;
      out.action = null;
    } else {
      out.face = face;
      out.speed = 0;
      out.heading = face;
      out.action = action;
    }
    out.since = since;
    return out;
  }
}

// ---------------------------------------------------------------- câmera

type Cam = { px: number; py: number; pz: number; tx: number; ty: number; tz: number; fov: number; shake: number };
const newCam = (): Cam => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 30, shake: 0 });
type View = { aspect: number; free: number; portrait: boolean };
type Shot = { start: number; blend: number; at: (time: number, out: Cam) => void };

const MAX_DISTANCE = 900;
const MAX_FOV = 64;

/**
 * Enquadra `w × h` unidades em volta de (cx, cy, cz), olhando de `yaw` (0 =
 * da torcida de +z) e `pitch` (positivo = de cima). A distância sai da
 * proporção da tela: o mesmo plano funciona deitado e em pé.
 */
function frame(out: Cam, view: View, cx: number, cy: number, cz: number, w: number, h: number, yaw: number, pitch: number, fov: number, shake: number, push = 0) {
  let tanV = Math.tan((fov * Math.PI) / 360);
  const width = view.portrait ? w * 0.72 : w;
  let fit = Math.max(h / 2 / (tanV * view.free), width / 2 / (tanV * view.aspect));
  if (fit > MAX_DISTANCE) {
    tanV = Math.min(Math.tan((MAX_FOV * Math.PI) / 360), Math.max(h / 2 / (MAX_DISTANCE * view.free), width / 2 / (MAX_DISTANCE * view.aspect)));
    fov = (Math.atan(tanV) * 360) / Math.PI;
    fit = Math.max(h / 2 / (tanV * view.free), width / 2 / (tanV * view.aspect));
  }
  const distance = fit * (1 - push);
  const flat = Math.cos(pitch);
  out.px = cx + Math.sin(yaw) * flat * distance;
  out.py = cy + Math.sin(pitch) * distance;
  out.pz = cz + Math.cos(yaw) * flat * distance;
  out.tx = cx;
  out.ty = cy;
  out.tz = cz;
  out.fov = fov;
  out.shake = shake;
}

function copyCam(out: Cam, from: Cam) {
  out.px = from.px;
  out.py = from.py;
  out.pz = from.pz;
  out.tx = from.tx;
  out.ty = from.ty;
  out.tz = from.tz;
  out.fov = from.fov;
  out.shake = from.shake;
}

function mixCam(out: Cam, a: Cam, b: Cam, k: number) {
  out.px = mix(a.px, b.px, k);
  out.py = mix(a.py, b.py, k);
  out.pz = mix(a.pz, b.pz, k);
  out.tx = mix(a.tx, b.tx, k);
  out.ty = mix(a.ty, b.ty, k);
  out.tz = mix(a.tz, b.tz, k);
  out.fov = mix(a.fov, b.fov, k);
  out.shake = mix(a.shake, b.shake, k);
}

/** Câmera na mão: senoides em frequências que não batem (nunca repete igual). */
function wobble(time: number, frequency: number, phase: number) {
  return Math.sin(time * frequency + phase) * 0.6 + Math.sin(time * frequency * 2.31 + phase * 1.7) * 0.28 + Math.sin(time * frequency * 4.13 + phase * 2.9) * 0.12;
}

// ----------------------------------------------------------------- papel

/**
 * Papel picado caindo do alto do estádio depois do "Obrigado". Cada papel é
 * função do tempo (início, queda, balanço sorteados uma vez), então o salto
 * do relógio já mostra a chuva no ponto certo: nada de simulação passo a passo.
 */
class PaperRain {
  readonly mesh: THREE.InstancedMesh;
  private readonly start: Float32Array;
  private readonly origin: Float32Array;
  private readonly fall: Float32Array;
  private readonly sway: Float32Array;
  private readonly spin: Float32Array;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly count: number;

  constructor(count: number, colors: string[], seed: number, private readonly from: number, private readonly loop: number) {
    this.count = count;
    const geometry = new THREE.PlaneGeometry(2.6, 1.6);
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.start = new Float32Array(count);
    this.origin = new Float32Array(count * 3);
    this.fall = new Float32Array(count);
    this.sway = new Float32Array(count * 2);
    this.spin = new Float32Array(count * 2);
    const random = seededRandom(seed ^ 0xc0ffee);
    const color = new THREE.Color();
    for (let index = 0; index < count; index += 1) {
      this.start[index] = random() * loop;
      // Cai em volta do círculo central e um pouco sobre as arquibancadas.
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 230;
      this.origin[index * 3] = Math.cos(angle) * radius;
      this.origin[index * 3 + 1] = 150 + random() * 70;
      this.origin[index * 3 + 2] = Math.sin(angle) * radius * 1.2;
      this.fall[index] = 24 + random() * 16;
      this.sway[index * 2] = 6 + random() * 10;
      this.sway[index * 2 + 1] = random() * Math.PI * 2;
      this.spin[index * 2] = (3 + random() * 5) * (random() < 0.5 ? -1 : 1);
      this.spin[index * 2 + 1] = random() * Math.PI;
      color.set(colors[index % colors.length]);
      this.mesh.setColorAt(index, color);
    }
  }

  update(time: number) {
    const local = time - this.from;
    if (local < 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    // Depois da primeira chuva, o papel continua caindo em laço.
    const period = this.loop + 6;
    for (let index = 0; index < this.count; index += 1) {
      let age = local - this.start[index] * 0.35;
      if (age > period) age %= period;
      const height = this.origin[index * 3 + 1] - age * this.fall[index];
      if (age < 0 || height < 0.4) {
        this.scale.setScalar(0);
        this.position.set(0, -50, 0);
      } else {
        const sway = this.sway[index * 2];
        const phase = this.sway[index * 2 + 1] + age * 2.1;
        this.position.set(this.origin[index * 3] + Math.sin(phase) * sway, height, this.origin[index * 3 + 2] + Math.cos(phase * 0.8) * sway * 0.6);
        const spin = this.spin[index * 2] * age + this.spin[index * 2 + 1];
        this.euler.set(spin, spin * 0.7, Math.sin(phase) * 0.6);
        this.quaternion.setFromEuler(this.euler);
        this.scale.setScalar(1);
      }
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

// ----------------------------------------------------------------- elenco

type Actor = { figure: PlayerFigure; track: ActorTrack; pose: ActorPose; intent: FigureIntent };

/** Deixas do estádio (ola, festa, flashes, placas): disparam quando o relógio cruza o instante. */
type StadiumCue = { at: number; fire: (stadium: Stadium, sinceCue: number) => void; window: number };

// ----------------------------------------------------------------- palco

export class FarewellStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 2, 4000);
  private readonly cleanup: Array<() => void> = [];
  private stadium: Stadium | null = null;
  private player: Actor | null = null;
  private readonly actors: Actor[] = [];
  private rain: PaperRain | null = null;
  private tunnel: THREE.Group | null = null;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly spot: THREE.SpotLight | null;
  private readonly eye = new THREE.DirectionalLight("#ffe9d2", 0.32);
  private readonly cues: StadiumCue[] = [];
  private shots: Shot[] = [];
  private view: View = { aspect: 16 / 9, free: 0.7, portrait: false };
  private readonly cam = newCam();
  private readonly camPrevious = newCam();
  private readonly camBlend = newCam();
  private readonly lookAt = new THREE.Vector3();
  private readonly scratchPose = emptyPose();
  private width = 0;
  private height = 0;
  private lastTime = -1;
  private pendingDt = 0;
  private frameCount = 0;
  private ready = false;
  private disposed = false;
  private contextLost = false;
  private retained = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly timeline: FarewellTimeline,
    readonly options: FarewellStageOptions,
  ) {
    const lite = options.performance;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite || coarse, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.75));
    this.renderer.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = STADIUM_MOOD.exposure;
    this.renderer.shadowMap.enabled = !lite;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(STADIUM_MOOD.background);
    this.scene.fog = new THREE.Fog(STADIUM_MOOD.fog, 1100, 2600);

    // A luz da transmissão noturna de sempre (a mesma da partida).
    const mood = STADIUM_MOOD;
    this.hemisphere = new THREE.HemisphereLight(mood.hemisphereSky, mood.hemisphereGround, mood.hemisphereIntensity);
    this.sun = new THREE.DirectionalLight(mood.sun, mood.sunIntensity);
    this.sun.position.set(mood.sunOffset[0], mood.sunOffset[1], mood.sunOffset[2]);
    this.sun.castShadow = !lite;
    if (!lite) {
      // Sombra só onde a cena acontece (túnel, corredor e círculo central).
      const small = Math.min(window.innerWidth, window.innerHeight) < 600;
      this.sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
      const shadow = this.sun.shadow.camera;
      shadow.left = -150;
      shadow.right = 150;
      shadow.top = 240;
      shadow.bottom = -240;
      shadow.near = 100;
      shadow.far = 1100;
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.5;
      // A sombra é refeita a 30 Hz (e em todo salto): os bonecos mexem pouco entre dois quadros.
      this.sun.shadow.autoUpdate = false;
    }
    this.fill = new THREE.DirectionalLight(mood.fill, mood.fillIntensity);
    this.fill.position.set(mood.fillPosition[0], mood.fillPosition[1], mood.fillPosition[2]);
    // Canhão de luz no homenageado quando o estádio escurece um pouco.
    // Sem queda com a distância (decay 0): a intensidade é a do palco, de longe.
    this.spot = lite ? null : new THREE.SpotLight("#fff4dc", 0, 0, 0.12, 0.6, 0);
    if (this.spot) {
      this.spot.position.set(-120, 520, 140);
      this.scene.add(this.spot, this.spot.target);
    }
    this.scene.add(this.hemisphere, this.sun, this.sun.target, this.fill, this.eye, this.eye.target);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      this.options.onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    this.cleanup.push(() => canvas.removeEventListener("webglcontextlost", onContextLost));
  }

  /** Monta estádio, bonecos e papel e compila os shaders: aguarde antes do primeiro `render`. */
  async prepare(): Promise<void> {
    if (this.disposed) return;
    const lite = this.options.performance;
    const reduced = this.options.reducedMotion;
    const { input, seed } = this.timeline;
    const club = input.club;
    retainSharedFigureResources();
    this.retained = true;

    // ------------------------------------------------------------ estádio
    // As duas torcidas são do clube: o estádio inteiro na cor dele.
    const team: BotaoTeam = { id: club.id, name: club.name, shortName: club.shortName, abbr: club.abbr, primary: club.primary, secondary: club.secondary, strength: 80, badge: club.badge };
    const setup: BotaoMatchSetup = {
      matchId: `farewell-${seed}`,
      seed,
      competitionName: "Despedida",
      stageName: "Homenagem",
      neutralVenue: false,
      userIsHost: true,
      player: { name: input.player.name, number: input.player.number, position: "MC", overall: 80 },
      userTeam: { ...team, badge: club.badge },
      cpuTeam: { ...team, id: `${team.id}-casa`, badge: club.badge },
      difficulty: 3,
      rules: DEFAULT_BOTAO_RULES,
      fieldTheme: "classic",
    };
    const stadium = new Stadium(setup, this.renderer.capabilities.getMaxAnisotropy(), { reducedMotion: reduced, performance: lite });
    this.stadium = stadium;
    this.scene.add(stadium.group);
    stadium.tribute(this.timeline.board, club.primary);
    stadium.prepare(this.renderer);

    this.tunnel = buildTunnel(club.primary, club.secondary);
    this.scene.add(this.tunnel);

    // ------------------------------------------------------------- elenco
    const pattern = this.timeline.kitPattern;
    const player = new PlayerFigure({
      appearance: { ...input.player.appearance, kitPattern: pattern },
      primary: club.primary,
      secondary: club.secondary,
      number: input.player.number,
      captain: input.stats.captain,
      seed: 23,
      performance: lite,
      outfit: { kind: "kit" },
    });
    const start = { x: P.tunnel.x - 10, z: P.tunnel.z };
    const playerTrack = new ActorTrack(start.x, start.z, MAIN_STAND)
      .walk(M.walkStart, M.walkEnd, P.center.x, P.center.z)
      .face(M.walkEnd - 0.1, MAIN_STAND)
      .act(0, "nervous")
      .act(M.walkEnd + 0.15, null)
      .act(M.heart, "handOnHeart")
      .act(M.kiss, "crestKiss")
      .act(M.kiss + 1.05, "applaud")
      .act(M.wave, "wave")
      .face(M.wave + 0.05, MAIN_STAND + 1.15)
      .face(M.wave + 1.3, MAIN_STAND - 1.15)
      .face(M.sky - 0.4, MAIN_STAND)
      .act(M.sky, "pointSky")
      .act(this.timeline.duration + 0.4, "handOnHeart");
    this.player = this.createActor(player, playerTrack);

    // Corredor: duas filas na saída do túnel; depois que ele passa, cada fila vai
    // para um lado dele no círculo central (um "V" aberto para a arquibancada
    // principal: a câmera de trás vê ele no meio) e continua aplaudindo.
    const mates = input.teammates.slice(0, lite ? 6 : 10);
    const perSide = Math.ceil(mates.length / 2);
    const walkSpan = M.walkEnd - M.walkStart;
    mates.forEach((mate, index) => {
      const side = index % 2 === 0 ? 1 : -1;
      const slot = Math.floor(index / 2);
      const x = mix(P.corridorFrom, P.corridorTo, perSide > 1 ? slot / (perSide - 1) : 0.5);
      const z = side * P.corridorHalf;
      // Quando ele passa por este companheiro (a caminhada é suave: aproximado pela fração do caminho).
      const passed = M.walkStart + walkSpan * clamp01((start.x - x) / (start.x - P.center.x)) + 0.35;
      // Ninguém à frente dele (x < -6): as duas filas abrem para os lados e para trás.
      const ax = 34 - slot * 10;
      const az = side * (30 + slot * 10);
      const leave = Math.max(passed + 0.4, M.walkEnd - 0.6) + slot * 0.12;
      const track = new ActorTrack(x, z, yawTo(x, z, x, 0))
        .act(0.6 + index * 0.07, "applaud")
        .face(passed, yawTo(x, z, P.center.x, P.center.z))
        .walk(leave, leave + 2.3, ax, az)
        .face(leave + 2.3, yawTo(ax, az, P.center.x - 30, P.center.z))
        .act(leave + 2.35, "applaud")
        .act(M.sky + 0.15 + (index % 4) * 0.1, index % 3 === 0 ? "fistPump" : "applaud");
      const figure = new PlayerFigure({
        appearance: { ...mate.appearance, kitPattern: pattern },
        primary: club.primary,
        secondary: club.secondary,
        number: mate.number,
        seed: 101 + index * 17,
        performance: lite,
        outfit: { kind: "kit" },
      });
      this.createActor(figure, track);
    });

    // ------------------------------------------------------------- papel
    const paperColors = [club.primary, club.secondary, "#ffffff", club.primary];
    this.rain = new PaperRain(reduced ? 90 : lite ? 160 : 320, paperColors, seed, M.sky + 0.2, 7);
    this.scene.add(this.rain.mesh);

    this.buildCues();
    this.resize(true);
    this.applyTime(0, 0, true);
    // Compila tudo, inclusive o que nasce escondido.
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (!object.visible) {
        hidden.push(object);
        object.visible = true;
      }
    });
    for (const actor of this.actors) for (const texture of actor.figure.textureList()) this.renderer.initTexture(texture);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // Sem compilação paralela, compila no primeiro quadro.
    }
    if (this.disposed || this.contextLost) return;
    if (this.sun.castShadow) this.sun.shadow.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    for (const object of hidden) object.visible = false;
    this.applyTime(0, 0, true);
    this.ready = true;
    this.lastTime = -1;
  }

  render(time: number, dt: number): void {
    if (!this.ready || this.disposed || this.contextLost) return;
    const jump = dt <= 0 || this.lastTime < 0 || Math.abs(time - this.lastTime - dt) > 0.25;
    const previous = this.lastTime;
    this.lastTime = time;
    if (jump) this.pendingDt = 0;
    else this.pendingDt += dt;
    // Atrás do cartão final a cena só respira: meia taxa de quadros poupa bateria.
    this.frameCount += 1;
    if (!jump && time > this.timeline.duration + 2 && this.frameCount % 2 === 1) return;
    const step = Math.min(0.1, this.pendingDt);
    this.pendingDt = 0;
    this.resize(false);
    this.fireCues(previous, time, jump);
    this.applyTime(time, step, jump);
    if (this.sun.castShadow && (jump || this.frameCount % 2 === 0)) this.sun.shadow.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    for (const release of this.cleanup.splice(0)) release();
    for (const actor of this.actors) actor.figure.dispose();
    this.stadium?.dispose();
    this.rain?.dispose();
    this.tunnel?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    this.hemisphere.dispose();
    this.sun.dispose();
    this.fill.dispose();
    this.spot?.dispose();
    this.eye.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.retained) releaseSharedFigureResources();
    this.retained = false;
  }

  // ------------------------------------------------------------ elenco

  private createActor(figure: PlayerFigure, track: ActorTrack): Actor {
    this.scene.add(figure.root);
    const actor: Actor = { figure, track, pose: emptyPose(), intent: idleIntent() };
    this.actors.push(actor);
    return actor;
  }

  private stageActor(actor: Actor, time: number) {
    const pose = actor.track.sample(time, actor.pose);
    actor.figure.root.position.set(pose.x, 0, pose.z);
    const intent = actor.intent;
    intent.state = pose.walking ? "run" : "idle";
    intent.speed = pose.speed;
    intent.heading = pose.heading;
    intent.faceYaw = pose.face;
    intent.action = pose.action;
    return pose;
  }

  // ------------------------------------------------------------- estádio

  private buildCues() {
    const board = this.timeline.board;
    const color = this.timeline.input.club.primary;
    const reduced = this.options.reducedMotion;
    const add = (at: number, window: number, fire: StadiumCue["fire"]) => this.cues.push({ at, window, fire });
    // A ola dá a volta enquanto a câmera passeia pelo estádio.
    if (!reduced) add(0.3, 6.5, (stadium) => stadium.wave());
    // Ele aparece na boca do túnel: a torcida dele vibra.
    add(M.walkStart + 0.2, 2, (stadium) => stadium.crowdReact("cheer", "user"));
    // Mão no peito: o estádio explode.
    add(M.roar, 6, (stadium, since) => {
      stadium.celebrate("user", Math.max(0.5, 6 - since));
      stadium.cameraFlashes("user", Math.max(0.4, 3.6 - since));
      if (since < 1) stadium.tribute(board, color);
    });
    add(M.kiss + 0.35, 2.4, (stadium, since) => stadium.cameraFlashes("user", Math.max(0.3, 2.4 - since)));
    add(M.sky, 6, (stadium, since) => {
      stadium.celebrate("user", Math.max(0.5, 6 - since));
      stadium.cameraFlashes("user", Math.max(0.4, 4.2 - since));
      if (since < 1) stadium.tribute(board, color);
      if (!reduced && since < 0.5) stadium.wave();
    });
    add(this.timeline.duration + 1, 4, (stadium, since) => stadium.celebrate("user", Math.max(0.5, 4 - since)));
    this.cues.sort((a, b) => a.at - b.at);
  }

  /** Correndo: o que cruzou o instante dispara. Num salto: só o que ainda estaria acontecendo. */
  private fireCues(previous: number, time: number, jump: boolean) {
    const stadium = this.stadium;
    if (!stadium) return;
    for (const cue of this.cues) {
      if (jump) {
        if (time >= cue.at && time < cue.at + cue.window) cue.fire(stadium, time - cue.at);
      } else if (cue.at > previous && cue.at <= time) cue.fire(stadium, time - cue.at);
    }
  }

  private applyTime(time: number, dt: number, jump: boolean) {
    const stadium = this.stadium;
    const player = this.player;
    if (!stadium || !player) return;
    const actors = this.actors;
    if (jump) {
      for (const actor of actors) {
        const pose = this.stageActor(actor, time);
        actor.figure.snapYaw(pose.face);
      }
      for (const actor of actors) {
        const span = Math.min(PREROLL_MAX, Math.max(0.3, time - actor.pose.since));
        const steps = Math.ceil(span / PREROLL_STEP);
        for (let index = 0; index < steps; index += 1) actor.figure.update(span / steps, actor.intent);
      }
    } else {
      for (const actor of actors) {
        this.stageActor(actor, time);
        const steps = Math.max(1, Math.ceil(dt / FIGURE_STEP));
        for (let index = 0; index < steps; index += 1) actor.figure.update(dt / steps, actor.intent);
      }
    }

    // Torcida de pé e cada vez mais alta; o estádio "escurece" um pouco e o canhão de luz acende nele.
    const level = crowdLevel(time);
    stadium.setTension(0.55 + 0.45 * level);
    stadium.update(jump ? 0 : dt, time);
    const focus = smooth01(progress(time, M.walkEnd - 0.8, M.heart + 0.6)) * (1 - 0.35 * smooth01(progress(time, this.timeline.duration, this.timeline.duration + 2)));
    this.hemisphere.intensity = STADIUM_MOOD.hemisphereIntensity * (1 - 0.32 * focus);
    this.sun.intensity = STADIUM_MOOD.sunIntensity * (1 - 0.3 * focus);
    if (this.spot) {
      this.spot.intensity = 2.4 * focus;
      const pose = player.pose;
      this.spot.target.position.set(pose.x, 14, pose.z);
    }
    player.figure.setHighlight(0.1 + 0.12 * focus, "#fff2d6");
    this.rain?.update(time);
    this.updateCamera(time);
  }

  // ------------------------------------------------------------ câmera

  private buildShots() {
    const view = this.view;
    const reduced = this.options.reducedMotion;
    const duration = this.timeline.duration;
    const playerAt = (time: number) => this.player?.track.sample(time, this.scratchPose) ?? null;
    const shots: Shot[] = [];

    // 1. Noite de casa cheia: grua alta atravessando o estádio até a boca do túnel.
    shots.push({
      start: 0,
      blend: 0,
      at: (time, out) => {
        const u = smooth01(progress(time, 0, M.walkStart + 0.9));
        frame(out, view, mix(-20, 120, u), mix(20, 18, u), mix(40, 0, u), mix(560, 260, u), mix(420, 170, u), mix(2.5, 1.95, u), mix(0.62, 0.36, u), 34, 0.25);
      },
    });
    // 2. Corredor: câmera baixa à frente dele, recuando no ritmo do passo, os companheiros nas bordas.
    shots.push({
      start: M.walkStart + 0.9,
      blend: 0.9,
      at: (time, out) => {
        const pose = playerAt(time);
        const x = pose ? pose.x : P.center.x;
        const z = pose ? pose.z : P.center.z;
        const u = smooth01(progress(time, M.walkStart + 0.9, M.walkEnd));
        // De frente e por cima das cabeças: as duas filas convergindo nele.
        frame(out, view, x - 10, 18, z, mix(150, 96, u), mix(86, 62, u), MAIN_STAND + mix(0.5, 0.28, u), mix(0.46, 0.3, u), 32, 0.45);
      },
    });
    // 3. De trás dele, no círculo central: a silhueta contra a arquibancada que canta o nome.
    shots.push({
      start: M.heart - 0.2,
      blend: 1.1,
      at: (time, out) => {
        const u = smooth01(progress(time, M.heart - 0.2, M.kiss - 0.2));
        frame(out, view, mix(-30, -60, u), 30, 0, mix(200, 150, u), mix(104, 86, u), MAIN_STAND + Math.PI - 0.3 + 0.12 * u, mix(0.07, 0.1, u), 30, 0.35);
      },
    });
    // 4. Beijo no escudo: plano fechado de frente, quase parado.
    shots.push({
      start: M.kiss - 0.2,
      blend: 0.5,
      at: (time, out) => {
        // De três quartos: o beijo no escudo se lê de perfil, com a arquibancada atrás.
        const u = progress(time, M.kiss - 0.2, M.wave);
        frame(out, view, P.center.x, 27, P.center.z, mix(52, 44, u), mix(46, 40, u), MAIN_STAND + 0.62 - 0.12 * u, 0.06, 28, 0.35);
      },
    });
    // 5. Volta olímpica da câmera: ele acenando, o estádio em volta, as placas piscando o nome.
    shots.push({
      start: M.wave,
      blend: 1.2,
      at: (time, out) => {
        const u = smooth01(progress(time, M.wave, M.sky + 0.6));
        // Pela frente do "V" de companheiros (ninguém entre a câmera e ele).
        frame(out, view, 0, 26, 0, mix(120, 200, u), mix(80, 110, u), MAIN_STAND - 0.55 + (reduced ? 0.5 : 1.1) * u, mix(0.16, 0.24, u), 32, 0.35);
      },
    });
    // 6. Aponta para o céu: a grua sobe com o papel picado caindo e abre o estádio inteiro.
    shots.push({
      start: M.sky + 0.6,
      blend: 1.3,
      at: (time, out) => {
        const u = smooth01(progress(time, M.sky + 0.6, duration));
        frame(out, view, 0, mix(30, 24, u), 0, mix(110, 620, u), mix(80, 360, u), MAIN_STAND + 0.55 + 0.45 * u, mix(0.3, 0.82, u), 34, 0.2);
      },
    });
    // Fim: estádio inteiro, deriva lenta atrás do cartão final.
    shots.push({
      start: duration,
      blend: 1.8,
      at: (time, out) => {
        const drift = reduced ? 0 : 0.08 * Math.sin(0.12 * (time - duration));
        frame(out, view, 0, 20, 0, 640, 380, MAIN_STAND + 1.5 + drift, 0.84, 34, 0);
      },
    });
    this.shots = shots;
  }

  private sampleCamera(time: number, out: Cam) {
    const shots = this.shots;
    let index = 0;
    for (let cursor = 0; cursor < shots.length; cursor += 1) {
      if (shots[cursor].start <= time) index = cursor;
      else break;
    }
    const shot = shots[index];
    shot.at(time, out);
    if (index > 0 && shot.blend > 0 && time < shot.start + shot.blend) {
      shots[index - 1].at(time, this.camPrevious);
      mixCam(this.camBlend, this.camPrevious, out, smooth01((time - shot.start) / shot.blend));
      copyCam(out, this.camBlend);
    }
  }

  private updateCamera(time: number) {
    if (!this.shots.length) return;
    const shot = this.cam;
    this.sampleCamera(time, shot);
    let { px, py, pz, tx, ty } = shot;
    const tz = shot.tz;
    if (!this.options.reducedMotion && shot.shake > 0) {
      const distance = Math.hypot(px - tx, py - ty, pz - tz);
      const amount = 0.0018 * distance * shot.shake;
      px += wobble(time, 0.71, 1.3) * amount;
      py += wobble(time, 0.53, 2.1) * amount * 0.7;
      pz += wobble(time, 0.61, 3.7) * amount * 0.5;
      tx += wobble(time, 0.83, 4.4) * amount * 0.6;
      ty += wobble(time, 0.67, 5.9) * amount * 0.5;
    }
    this.camera.position.set(px, Math.max(6, py), pz);
    this.lookAt.set(tx, ty, tz);
    this.camera.lookAt(this.lookAt);
    this.eye.position.set(px, py + 30, pz);
    this.eye.target.position.copy(this.lookAt);
    if (Math.abs(this.camera.fov - shot.fov) > 0.001) {
      this.camera.fov = shot.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Proporção e área livre para o assunto (entre a tarja de cima e a legenda; mesma conta do CSS). */
  private resize(force: boolean) {
    const width = this.canvas.clientWidth || this.width || 1;
    const height = this.canvas.clientHeight || this.height || 1;
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    const portrait = width / height < 0.75;
    const bar = portrait ? Math.max(34, Math.min(60, height * 0.07)) : Math.max(30, Math.min(84, height * 0.085));
    const caption = Math.max(height * (portrait ? 0.24 : 0.19), Math.min(220, height * 0.2) + 10);
    const top = bar + 6;
    const bottom = Math.max(top + height * 0.34, height - bar - caption);
    this.view = { aspect: width / height, free: (bottom - top) / height, portrait };
    this.camera.aspect = width / height;
    this.camera.setViewOffset(width, height, 0, height / 2 - (top + bottom) / 2, width, height);
    this.camera.updateProjectionMatrix();
    this.buildShots();
  }
}

/** Boca do túnel na lateral: pilares e marquise na cor do clube, o fundo escuro. */
function buildTunnel(primary: string, secondary: string) {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshLambertMaterial({ color: primary });
  const trimMaterial = new THREE.MeshLambertMaterial({ color: secondary });
  const darkMaterial = new THREE.MeshBasicMaterial({ color: "#020304" });
  const width = 34;
  const height = 30;
  const depth = 14;
  const x = P.tunnel.x + 4;
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(depth, height, 4), frameMaterial);
    pillar.position.set(x, height / 2, side * (width / 2 + 2));
    group.add(pillar);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(depth + 4, 5, width + 8), frameMaterial);
  roof.position.set(x, height + 2.5, 0);
  group.add(roof);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(depth + 4.4, 1.4, width + 8.4), trimMaterial);
  trim.position.set(x, height - 0.2, 0);
  group.add(trim);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(width, height), darkMaterial);
  mouth.rotation.y = -Math.PI / 2;
  mouth.position.set(x + depth / 2 - 0.5, height / 2, 0);
  group.add(mouth);
  return group;
}

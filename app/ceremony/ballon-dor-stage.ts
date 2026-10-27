// Palco 3D da Bola de Ouro: a gala inteira com os bonecos da partida, de terno.
//
// Quem usa: `BallonDorCeremony` carrega este módulo sob demanda, chama
// `prepare()` antes do primeiro quadro e depois `render(tempo, dt)` a cada
// quadro com o relógio do roteiro (`ballon-dor-script.ts`).
//
// Montagem: o teatro (telão, holofotes, plateia, poeira, confete, troféu) é
// do `GalaSet` (`stage-set.ts`); a direção (`stage-direction`) diz onde cada
// boneco está e o que faz; os planos (`stage-shots`) dizem para onde a câmera
// e os canhões apontam. Tudo sai do instante do roteiro. Só a animação dos
// bonecos tem memória (mistura de poses); num salto ("Pular", "Rever") ela é
// pré-rodada no estado novo, então cada um aparece já no meio do gesto certo.

import * as THREE from "three";
import { PlayerFigure, idleIntent, type FigureIntent, type FigureOutfit } from "../botao/three/character";
import { beatAt, focusAt, type CeremonyTimeline } from "./ballon-dor-script";
import {
  FIGURE_SEEDS,
  STAGE,
  WINNER_SPOT,
  applauseAt,
  buildStagePlan,
  clamp01,
  emptyPose,
  mix,
  smooth01,
  type ActorPlan,
  type ActorPose,
  type StagePlan,
} from "./stage-direction";
import { SPOT, audienceHeadTop, buildGalaSet, type GalaScreenContent, type GalaSet } from "./stage-set";
import { buildShots, type ShotPlan, type ShotView } from "./stage-shots";
import { TROPHY_GRIP } from "./stage-trophy";

export type BallonDorStageOptions = {
  /** Modo desempenho 3D: sem sombra projetada, plateia menor, resolução menor. */
  performance: boolean;
  /** Sem tremida de câmera nem flashes fortes. */
  reducedMotion: boolean;
  /** O WebGL caiu: quem usa troca para a versão 2D. */
  onContextLost?: () => void;
};

/**
 * Sombra PCF do three r186 com uma leitura só (o mesmo ajuste da partida em
 * `Botao3DView`): o filtro linear de comparação já dá um PCF 2×2 no hardware.
 * Se o three mudar o trecho, o original continua valendo.
 */
function applySingleTapShadows() {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const taps = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!taps.test(chunk)) return;
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(taps, "shadow = texture( shadowMap, vec3( shadowCoord.xy, shadowCoord.z ) );");
}
applySingleTapShadows();

type Suit = Extract<FigureOutfit, { kind: "suit" }>;

/** O jogador: azul-meia-noite com gravata dourada. */
const USER_SUIT: Suit = { kind: "suit", jacket: "#141d38", shirt: "#f4f1ea", tie: "#d9a83f", pants: "#111a30", tieStyle: "tie" };
/** Rivais: smoking preto, veludo bordô, grafite, veludo verde (dois por noite, pela semente). */
const RIVAL_SUITS: readonly Suit[] = [
  { kind: "suit", jacket: "#0f0f13", shirt: "#f6f5f1", tie: "#0a0a0c", pants: "#0f0f13", tieStyle: "bow" },
  { kind: "suit", jacket: "#4c1522", shirt: "#f2eee6", tie: "#141215", pants: "#18131a", tieStyle: "tie" },
  { kind: "suit", jacket: "#2d3137", shirt: "#f4f4f2", tie: "#a3abb5", pants: "#212429", tieStyle: "tie" },
  { kind: "suit", jacket: "#123b2d", shirt: "#f3f1ea", tie: "#0d0f0e", pants: "#0f1613", tieStyle: "bow" },
];
/** Apresentador: smoking branco (separa do elenco de longe). */
const PRESENTER_SUIT: Suit = { kind: "suit", jacket: "#ebe6d9", shirt: "#ffffff", tie: "#121215", pants: "#141417", tieStyle: "bow" };

/** Clarão da revelação: luz pontual dourada em cima do vencedor (decay 0: alcance fixo). */
const BURST_INTENSITY = 1.8;
/** Pré-rodagem depois de um salto: passo e teto (s). */
const PREROLL_STEP = 1 / 30;
const PREROLL_MAX = 2.4;
/** Passo máximo de animação dos bonecos (as molas do boneco são estáveis até 0,05). */
const FIGURE_STEP = 0.05;
/** Folga da câmera acima das cabeças sentadas, quando o plano cai no meio da plateia. */
const HEAD_CLEARANCE = 6.5;
/**
 * Cabelo alto engole as mãos na taça erguida (as mãos ficam no topo da
 * cabeça): a taça sobe mais para continuar à vista. Unidades do mundo, por
 * `hairStyle` (moicano, black power, topete, coque, faux hawk, arrepiado,
 * hi-top, dois coques, moicano espetado, afro gigante). Conferido no
 * laboratório: o pé da taça fica ~1,5 acima do topo do cabelo, como sem cabelo.
 */
const TALL_HAIR_LIFT: Readonly<Record<number, number>> = { 3: 2, 4: 3.5, 8: 2, 10: 2.5, 15: 1.5, 24: 2.5, 26: 3.5, 28: 2.5, 30: 5, 31: 7 };

type Actor = {
  figure: PlayerFigure;
  plan: ActorPlan;
  pose: ActorPose;
  intent: FigureIntent;
};

/** Clarão com raios (a explosão de luz da revelação), pintado uma vez. */
function flareTexture(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const centre = size / 2;
  const glow = context.createRadialGradient(centre, centre, 0, centre, centre, centre);
  glow.addColorStop(0, "rgba(255, 246, 214, 1)");
  glow.addColorStop(0.12, "rgba(255, 214, 120, 0.85)");
  glow.addColorStop(0.4, "rgba(255, 170, 60, 0.22)");
  glow.addColorStop(1, "rgba(255, 150, 40, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = "lighter";
  context.translate(centre, centre);
  for (let index = 0; index < 12; index += 1) {
    context.rotate((Math.PI * 2) / 12);
    const long = index % 2 === 0;
    const ray = context.createLinearGradient(0, 0, centre, 0);
    ray.addColorStop(0, `rgba(255, 226, 150, ${long ? 0.7 : 0.4})`);
    ray.addColorStop(1, "rgba(255, 200, 90, 0)");
    context.fillStyle = ray;
    context.beginPath();
    context.moveTo(0, -2.2);
    context.lineTo(centre * (long ? 1 : 0.7), 0);
    context.lineTo(0, 2.2);
    context.closePath();
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class BallonDorStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 2, 3000);
  private readonly plan: StagePlan;
  private readonly cleanup: Array<() => void> = [];
  private shots: ShotPlan | null = null;
  private view: ShotView = { aspect: 16 / 9, free: 0.7, portrait: false };
  private set: GalaSet | null = null;
  private finalists: Actor[] = [];
  private presenter: Actor | null = null;
  /** Luz de olho: sai da câmera, fraca, só para o rosto nunca sumir no escuro (pele escura inclusive). */
  private readonly eye = new THREE.DirectionalLight("#ffe6c8", 0.35);
  private readonly burst = new THREE.PointLight("#ffc04a", 0, 260, 0);
  private flare: THREE.Sprite | null = null;
  private flareMap: THREE.Texture | null = null;
  private readonly socket = new THREE.Vector3();
  private screenKey = "";
  private width = 0;
  private height = 0;
  private lastTime = -1;
  private pendingDt = 0;
  private frame = 0;
  private ready = false;
  private disposed = false;
  private contextLost = false;
  private readonly lookAt = new THREE.Vector3();
  private readonly handA = new THREE.Vector3();
  private readonly handB = new THREE.Vector3();
  private readonly gripFrom = new THREE.Vector3();
  private readonly gripTo = new THREE.Vector3();
  private readonly spotTarget = new THREE.Vector3();

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly timeline: CeremonyTimeline,
    readonly options: BallonDorStageOptions,
  ) {
    const lite = options.performance;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite || coarse, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.75));
    this.renderer.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor("#030204", 1);
    // Sombra só aqui, e PCF (o mesmo da partida): o r186 troca PCFSoft por PCF
    // no primeiro quadro de sombra, o que muda a chave de todo shader já compilado.
    this.renderer.shadowMap.enabled = !lite;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.plan = buildStagePlan(timeline);

    // Perda de contexto (Android): para de desenhar e avisa a cerimônia, que segue em 2D.
    // O dispose tira este ouvinte antes de forçar a perda, então ele não se dispara sozinho.
    const onContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      this.options.onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    this.cleanup.push(() => canvas.removeEventListener("webglcontextlost", onContextLost));
  }

  /** Monta bonecos e cenário e compila os shaders: aguarde antes do primeiro `render`. */
  async prepare(): Promise<void> {
    if (this.disposed) return;
    const lite = this.options.performance;
    const input = this.timeline.input;

    const set = buildGalaSet({
      season: input.season,
      performance: lite,
      reducedMotion: this.options.reducedMotion,
      finalists: input.finalists.map((finalist) => ({ id: finalist.id, name: finalist.name, club: finalist.club })),
      seed: input.seed,
      // Sem figurantes de verdade: as cadeiras vagas do teatro ficam no meio da
      // primeira fila e, de pé, tapariam a foto oficial. A ovação é a da plateia.
      reserveFrontRow: 0,
    });
    this.set = set;
    set.attach(this.scene, this.renderer);
    this.socket.set(set.marks.pedestal.x, set.marks.pedestal.top, set.marks.pedestal.z);

    // Luz de olho e clarão da revelação (o resto da luz é do teatro).
    this.burst.position.set(WINNER_SPOT.x, 40, WINNER_SPOT.z + 30);
    this.scene.add(this.eye, this.eye.target, this.burst);
    this.flareMap = flareTexture();
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flareMap,
      color: "#ffe0a0",
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }));
    flare.renderOrder = 10;
    flare.visible = false;
    this.flare = flare;
    this.scene.add(flare);

    // ------------------------------------------------------------ elenco
    const offset = Math.abs(input.seed) % RIVAL_SUITS.length;
    let rival = 0;
    this.finalists = input.finalists.map((finalist, index) => {
      const outfit = finalist.isUser ? USER_SUIT : RIVAL_SUITS[(offset + rival++) % RIVAL_SUITS.length];
      return this.createActor(
        new PlayerFigure({
          appearance: finalist.appearance,
          primary: finalist.club.primary,
          secondary: finalist.club.secondary,
          number: finalist.number,
          seed: FIGURE_SEEDS.finalists[index],
          performance: lite,
          outfit,
        }),
        this.plan.finalists[index],
      );
    });
    this.presenter = this.createActor(
      new PlayerFigure({
        appearance: input.presenter.appearance,
        primary: "#e9c46a",
        secondary: "#111111",
        number: 1,
        seed: FIGURE_SEEDS.presenter,
        performance: lite,
        outfit: PRESENTER_SUIT,
      }),
      this.plan.presenter,
    );

    this.resize(true);
    this.applyTime(0, 0, true);
    // Compila tudo, inclusive o que nasce escondido (confete, celulares, clarão):
    // o compile do three pula o invisível.
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (!object.visible) {
        hidden.push(object);
        object.visible = true;
      }
    });
    const textures = [...set.textures()];
    if (this.flareMap) textures.push(this.flareMap);
    for (const actor of [...this.finalists, this.presenter]) textures.push(...actor.figure.textureList());
    for (const texture of textures) this.renderer.initTexture(texture);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // Sem compilação paralela, compila no primeiro quadro.
    }
    if (this.disposed || this.contextLost) return;
    // Quadro descartável (o "Preparando a gala…" está por cima): sobe buffers e compila a sombra.
    this.renderer.render(this.scene, this.camera);
    for (const object of hidden) object.visible = false;
    this.applyTime(0, 0, true);
    this.ready = true;
    this.lastTime = -1;
  }

  /**
   * Desenha a cena no instante `time` (s) do roteiro. `dt` é o tempo real desde
   * o quadro anterior (0 depois de um salto). Pular para a frente (botão
   * "Pular") tem que deixar cada boneco no estado do beat novo.
   */
  render(time: number, dt: number): void {
    if (!this.ready || this.disposed || this.contextLost) return;
    const jump = dt <= 0 || this.lastTime < 0 || Math.abs(time - this.lastTime - dt) > 0.25;
    this.lastTime = time;
    if (jump) this.pendingDt = 0;
    else this.pendingDt += dt;
    // Atrás do cartão final a cena só respira: meia taxa de quadros poupa bateria.
    this.frame += 1;
    if (!jump && time > this.timeline.duration + 3 && this.frame % 2 === 1) return;
    const step = Math.min(0.1, this.pendingDt);
    this.pendingDt = 0;
    this.resize(false);
    this.applyTime(time, step, jump);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    for (const release of this.cleanup.splice(0)) release();
    for (const actor of this.finalists) actor.figure.dispose();
    this.presenter?.figure.dispose();
    // O teatro solta o troféu junto.
    this.set?.dispose();
    (this.flare?.material as THREE.Material | undefined)?.dispose();
    this.flareMap?.dispose();
    this.eye.dispose();
    this.burst.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ------------------------------------------------------------ elenco

  private createActor(figure: PlayerFigure, plan: ActorPlan): Actor {
    this.scene.add(figure.root);
    figure.handAnchor("left");
    figure.handAnchor("right");
    return { figure, plan, pose: emptyPose(), intent: idleIntent() };
  }

  private updateActor(actor: Actor, time: number, dt: number, jump: boolean) {
    const pose = actor.plan.sample(time, actor.pose);
    const figure = actor.figure;
    figure.root.position.set(pose.x, pose.y, pose.z);
    const intent = actor.intent;
    intent.state = pose.state;
    intent.speed = pose.speed;
    intent.heading = pose.heading;
    intent.faceYaw = pose.face;
    intent.action = pose.action;
    intent.look = pose.look;
    if (jump) {
      // Salto: vira já para o lado certo e pré-roda o pedido atual (a ação aparece no meio).
      figure.snapYaw(pose.face);
      const span = Math.min(PREROLL_MAX, Math.max(0.3, time - pose.since));
      const steps = Math.ceil(span / PREROLL_STEP);
      for (let index = 0; index < steps; index += 1) figure.update(span / steps, intent);
      return;
    }
    const steps = Math.max(1, Math.ceil(dt / FIGURE_STEP));
    for (let index = 0; index < steps; index += 1) figure.update(dt / steps, intent);
  }

  // ------------------------------------------------------------- troféu

  /** Ponto entre as palmas do boneco (mundo). */
  private palms(actor: Actor, out: THREE.Vector3) {
    actor.figure.handAnchor("left").getWorldPosition(this.handA);
    actor.figure.handAnchor("right").getWorldPosition(this.handB);
    return out.copy(this.handA).add(this.handB).multiplyScalar(0.5);
  }

  /** Coluna → mãos do apresentador → mãos do vencedor, tudo pelo relógio. */
  private updateTrophy(time: number) {
    const set = this.set;
    const presenter = this.presenter;
    if (!set || !presenter) return;
    const trophy = set.trophy;
    const plan = this.plan;
    const winner = this.finalists[plan.firstIndex];
    const root = trophy.root;
    // Erguida, a taça fica em pé nas mãos; no colo, as mãos abraçam a base.
    const lift = smooth01((time - plan.liftAt) / 0.45) * (1 - smooth01((time - plan.beats.endStart - 0.6) / 0.45));
    const hair = TALL_HAIR_LIFT[this.timeline.first.appearance.hairStyle] ?? 0;
    const grip = mix(TROPHY_GRIP.cradle, TROPHY_GRIP.lift - hair, lift);
    if (time < plan.pickAt) {
      root.position.copy(this.socket);
      root.rotation.y = 0;
    } else if (time < plan.pickDone) {
      const k = smooth01((time - plan.pickAt) / (plan.pickDone - plan.pickAt));
      this.palms(presenter, this.gripTo).y -= TROPHY_GRIP.cradle;
      root.position.copy(this.socket).lerp(this.gripTo, k);
      root.position.y += Math.sin(Math.PI * k) * 1.5;
      root.rotation.y = mix(0, presenter.figure.yaw, k);
    } else if (time < plan.handoffAt) {
      this.palms(presenter, root.position).y -= TROPHY_GRIP.cradle;
      root.rotation.y = presenter.figure.yaw;
    } else if (time < plan.handoffDone) {
      const k = smooth01((time - plan.handoffAt) / (plan.handoffDone - plan.handoffAt));
      this.palms(presenter, this.gripFrom).y -= TROPHY_GRIP.cradle;
      this.palms(winner, this.gripTo).y -= grip;
      root.position.copy(this.gripFrom).lerp(this.gripTo, k);
      root.position.y += Math.sin(Math.PI * k) * 1.5;
      root.rotation.y = mix(presenter.figure.yaw, winner.figure.yaw, k);
    } else {
      this.palms(winner, root.position).y -= grip;
      root.rotation.y = winner.figure.yaw;
    }
  }

  // ------------------------------------------------------------- telão

  /** Arte do telão no instante (só manda trocar quando muda). */
  private updateScreen(time: number) {
    const set = this.set;
    if (!set) return;
    const timeline = this.timeline;
    const beat = beatAt(timeline, time);
    const focus = beat.id === "duel" ? focusAt(timeline, time) : beat.focus;
    const revealed = beat.revealAt !== undefined && time >= beat.revealAt;
    const key = `${timeline.beats.indexOf(beat)}|${focus}|${revealed ? 1 : 0}`;
    if (key === this.screenKey) return;
    this.screenKey = key;
    const season = timeline.input.season;
    const card = (id: string): GalaScreenContent => {
      const finalist = timeline.input.finalists.find((item) => item.id === id) ?? timeline.first;
      return { kind: "nominee", name: finalist.name, club: finalist.club.name, primary: finalist.club.primary };
    };
    let content: GalaScreenContent;
    switch (beat.id) {
      case "establish":
        content = { kind: "title", season };
        break;
      case "nominee":
        content = card(focus);
        break;
      case "presenter":
        content = { kind: "suspense", text: "O top 3 do mundo" };
        break;
      case "third":
        content = revealed ? { kind: "place", place: 3, name: timeline.third.name } : { kind: "suspense", text: "Em terceiro lugar..." };
        break;
      case "duel":
        content = focus === "presenter" ? { kind: "suspense", text: `Bola de Ouro ${season}` } : card(focus);
        break;
      case "reveal":
        content = revealed ? { kind: "winner", name: timeline.first.name } : { kind: "suspense", text: "A Bola de Ouro vai para..." };
        break;
      default:
        content = { kind: "winner", name: timeline.first.name };
    }
    set.setScreen(content);
  }

  // ------------------------------------------------------------- quadro

  private applyTime(time: number, dt: number, jump: boolean) {
    const plan = this.plan;
    const set = this.set;
    if (!set || !this.shots) return;
    const reduced = this.options.reducedMotion;
    const beats = plan.beats;
    const RW = beats.winnerReveal;

    // Elenco e troféu.
    for (const actor of this.finalists) this.updateActor(actor, time, dt, jump);
    if (this.presenter) this.updateActor(this.presenter, time, dt, jump);
    // Contorno dourado no vencedor depois do nome.
    this.finalists.forEach((actor, index) => {
      actor.figure.setHighlight(index === plan.firstIndex && time >= RW ? 0.28 : 0, "#ffc94d");
    });
    this.updateTrophy(time);

    // Pulsos: coração no duelo (até o nome) e o clarão das revelações.
    let heart = 0;
    if (time >= beats.duelStart && time < RW) {
      const local = (time - beats.duelStart) % 0.86;
      heart = Math.exp(-(((local - 0.02) / 0.07) ** 2)) + 0.6 * Math.exp(-(((local - 0.24) / 0.07) ** 2));
    }
    const decay = (at: number, rate: number) => (time >= at ? Math.exp(-(time - at) * rate) : 0);
    const flash = Math.max(decay(RW, 2.2), 0.5 * decay(plan.liftAt, 2.4), 0.3 * decay(beats.thirdReveal, 3)) * (reduced ? 0.45 : 1);

    // Luzes do plano, com o coração e o clarão por cima. Pouco clarão: os
    // quatro contras do fundo são luz de verdade e já cercam o vencedor.
    const lights = this.shots.lights(time);
    lights.washI = lights.washI * (1 + 0.6 * heart) + 0.25 * flash;
    lights.keyI *= 1 + 0.12 * flash;
    lights.screen = Math.min(1.3, lights.screen * (1 + 0.2 * heart) + 0.15 * flash);
    lights.house = clamp01(lights.house + 0.15 * flash);
    if (jump) set.snap();
    set.applyLights(lights);
    // Os dois móveis do fundo varrem a plateia na abertura e na festa (na foto
    // e no fim, virados para a câmera, ofuscariam o vencedor).
    const sweeping = time < beats.establishEnd - 0.6 || (time >= RW + 0.4 && time < beats.reactionStart - 0.4);
    SPOT.sweepers.forEach((index, order) => {
      const side = order === 0 ? -1 : 1;
      this.spotTarget.set(side * 200 * Math.sin(time * 0.5 + side), STAGE.pit, 300 + 190 * Math.sin(time * 0.37 + side * 1.3));
      set.aim(index, this.spotTarget, true);
      set.setSpot(index, { intensity: sweeping ? (time < RW ? 0.85 : 0.5) : 0 }, jump);
    });

    // Telão, plateia e confete.
    this.updateScreen(time);
    set.applause(applauseAt(plan, time), plan.standing.some(([from, to]) => time >= from && time < to));
    set.phones(time >= beats.duelStart);
    // Confete: um estouro no nome (atrás da marca dele, entre ela e o telão: o
    // papel cai no fundo dos closes, não na lente) e chuva atrás do praticável
    // com a taça no alto. Antes do nome o estouro fica "no futuro" (invisível).
    const winnerHome = plan.finalists[plan.firstIndex].home;
    set.burst({ x: winnerHome.x * 0.6, y: 0, z: winnerHome.z - 75 }, time >= RW ? RW + 0.15 : 1e9);
    set.rain(time >= plan.liftAt + 0.1 ? (time >= beats.endStart ? 0.3 : 0.6) : 0, { x: WINNER_SPOT.x, y: 0, z: WINNER_SPOT.z - 40 });
    set.trophy.setGlow(Math.max(decay(RW, 1.2), time >= plan.liftAt ? 0.35 + 0.3 * decay(plan.liftAt, 1.5) : 0));

    // Clarão dourado.
    const winner = this.finalists[plan.firstIndex];
    if (winner) {
      const at = winner.figure.root.position;
      this.burst.position.set(at.x, at.y + 34, at.z + 26);
    }
    this.burst.intensity = BURST_INTENSITY * flash;
    this.renderer.toneMappingExposure = 1.05 + (reduced ? 0.03 : 0.1) * decay(RW, 3);
    this.updateFlare(time, flash);

    this.updateCamera(time);
    set.update(time, jump ? 0 : dt);
  }

  private updateFlare(time: number, flash: number) {
    const flare = this.flare;
    const winner = this.finalists[this.plan.firstIndex];
    if (!flare || !winner) return;
    const age = time - this.plan.beats.winnerReveal;
    const on = age >= 0 && age < 1.6;
    flare.visible = on;
    if (!on) return;
    const at = winner.figure.root.position;
    const k = clamp01(age / 1.6);
    // Atrás dele: o boneco recorta o clarão (halo), em vez de sumir no branco.
    flare.position.set(at.x, at.y + 28, at.z - 14);
    flare.scale.setScalar(80 + 170 * smooth01(k));
    (flare.material as THREE.SpriteMaterial).opacity = (this.options.reducedMotion ? 0.4 : 0.85) * Math.min(1, flash * 1.2) * (1 - k);
  }

  // ------------------------------------------------------------- câmera

  private updateCamera(time: number) {
    if (!this.shots) return;
    const shot = this.shots.camera(time);
    let px = shot.px;
    let py = shot.py;
    let pz = shot.pz;
    let tx = shot.tx;
    let ty = shot.ty;
    const tz = shot.tz;
    if (!this.options.reducedMotion && shot.shake > 0) {
      // Câmera na mão: senoides em frequências que não batem (nunca repete igual).
      const distance = Math.hypot(px - tx, py - ty, pz - tz);
      const amount = 0.0022 * distance * shot.shake;
      const wobble = (frequency: number, phase: number) =>
        Math.sin(time * frequency + phase) * 0.6 + Math.sin(time * frequency * 2.31 + phase * 1.7) * 0.28 + Math.sin(time * frequency * 4.13 + phase * 2.9) * 0.12;
      px += wobble(0.71, 1.3) * amount;
      py += wobble(0.53, 2.1) * amount * 0.7;
      pz += wobble(0.61, 3.7) * amount * 0.5;
      tx += wobble(0.83, 4.4) * amount * 0.6;
      ty += wobble(0.67, 5.9) * amount * 0.5;
    }
    // Plano que cai no meio da plateia passa por cima das cabeças (só o topo delas no pé do quadro).
    py = Math.max(py, audienceHeadTop(pz) + HEAD_CLEARANCE);
    this.camera.position.set(px, py, pz);
    this.lookAt.set(tx, ty, tz);
    this.camera.lookAt(this.lookAt);
    this.eye.position.set(px, py + 20, pz);
    this.eye.target.position.copy(this.lookAt);
    if (Math.abs(this.camera.fov - shot.fov) > 0.001) {
      this.camera.fov = shot.fov;
      this.camera.updateProjectionMatrix();
    }
    // De perto, o ar dentro dos fachos brilha menos (não lava o rosto).
    const distance = Math.hypot(px - tx, py - ty, pz - tz);
    this.set?.setBeamStrength(0.45 + 0.3 * clamp01((distance - 90) / 180));
  }

  /**
   * Proporção e a área livre para o assunto (entre a tarja de cima e a
   * legenda; mesma conta do CSS e da versão 2D). O alvo de cada plano vai para
   * o meio dessa área com um deslocamento da projeção.
   */
  private resize(force: boolean) {
    // Sem tamanho de layout (WebView no meio de um redimensionamento), fica o
    // último: `canvas.width` já vem multiplicado pela densidade e, reaplicado a
    // cada quadro, o buffer cresceria sem parar.
    const width = this.canvas.clientWidth || this.width || 1;
    const height = this.canvas.clientHeight || this.height || 1;
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    const portrait = width / height < 0.75;
    const bar = portrait ? Math.max(34, Math.min(60, height * 0.07)) : Math.max(30, Math.min(84, height * 0.085));
    const title = Math.max(34, Math.min(92, width * 0.062));
    const caption = Math.max(height * (portrait ? 0.26 : 0.2), height * 0.026 + title * (portrait ? 3.4 : 2.4) + 20);
    const top = bar + 6;
    const bottom = Math.max(top + height * 0.3, height - bar - caption);
    this.view = { aspect: width / height, free: (bottom - top) / height, portrait };
    this.camera.aspect = width / height;
    this.camera.setViewOffset(width, height, 0, height / 2 - (top + bottom) / 2, width, height);
    this.camera.updateProjectionMatrix();
    this.shots = buildShots(this.plan, this.view, this.options.reducedMotion);
  }
}

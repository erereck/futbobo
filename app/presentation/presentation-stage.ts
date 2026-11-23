// Palco 3D da apresentação do reforço: o boneco da partida chega pelo tapete,
// recebe do diretor a camisa com o nome e o número e a ergue para os
// fotógrafos.
//
// Quem usa: `SigningPresentation` carrega este módulo sob demanda, chama
// `prepare()` antes do primeiro quadro e depois `render(tempo, dt)` a cada
// quadro com o relógio do roteiro (`presentation-script.ts`).
//
// A camisa é do palco, não do boneco: o roteiro diz onde ela está (na frente
// de quem segura, entre os dois na entrega, no alto na foto) e as palmas de
// quem segura vão até os ombros dela pela cinemática inversa do boneco
// (`reach`). Assim as mãos nunca escorregam do tecido, em qualquer pose.

import * as THREE from "three";
import {
  PX,
  PlayerFigure,
  idleIntent,
  releaseSharedFigureResources,
  retainSharedFigureResources,
  type FigureAction,
  type FigureIntent,
  type FigureOutfit,
  type FigureReach,
} from "../botao/three/character";
import { HELD_SHIRT, createHeldShirtTextures, luminance } from "../botao/three/textures";
import { MARKS, arrivalOutfit, directorAppearance, type PresentationTimeline } from "./presentation-script";
import { DIRECTOR_ASIDE, DIRECTOR_MARK, ENTRY, FLOOR_Y, PLAYER_MARK, PresentationSet } from "./presentation-set";

export type PresentationStageOptions = {
  /** Modo desempenho 3D: sem sombra, menos flashes, resolução menor. */
  performance: boolean;
  /** Sem câmera na mão, flashes suaves. */
  reducedMotion: boolean;
  /** O WebGL caiu: quem usa troca para a versão 2D. */
  onContextLost?: () => void;
};

/**
 * Sombra PCF do three r186 com uma leitura só (o mesmo ajuste da partida e da
 * gala): o filtro linear de comparação já dá um PCF 2×2 no hardware.
 */
function applySingleTapShadows() {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const taps = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!taps.test(chunk)) return;
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(taps, "shadow = texture( shadowMap, vec3( shadowCoord.xy, shadowCoord.z ) );");
}
applySingleTapShadows();

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth01 = (value: number) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const mix = (from: number, to: number, k: number) => from + (to - from) * k;
const progress = (time: number, from: number, to: number) => clamp01((time - from) / Math.max(0.01, to - from));
const yawTo = (ax: number, az: number, bx: number, bz: number) => Math.atan2(bx - ax, bz - az);
function angleLerp(from: number, to: number, k: number) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * k;
}

/** Pré-rodagem depois de um salto: passo e teto (s). Passo máximo das molas do boneco. */
const PREROLL_STEP = 1 / 30;
const PREROLL_MAX = 2.4;
const FIGURE_STEP = 0.05;
/** Lado do quadrado da camisa: os ombros dela ficam a 11 px um do outro (mãos no tronco a ±5,5). */
const SHIRT_SIDE_PX = 11 / (1 - HELD_SHIRT.shoulderX * 2);
const SHIRT_SIDE = SHIRT_SIDE_PX * PX;
/** Ombros da camisa (onde as mãos seguram), no espaço da camisa. */
const GRIP_X = (0.5 - HELD_SHIRT.shoulderX) * SHIRT_SIDE;
/** Meio da camisa abaixo da linha das mãos (braço do pêndulo). */
const SWING_ARM = ((HELD_SHIRT.hemY - HELD_SHIRT.shoulderY) / 2) * SHIRT_SIDE;
/** Na entrega, a frente da camisa gira para as câmeras (rad): mais que isso, uma das mãos não alcança. */
const HANDOVER_TURN = 0.55;
/** Quanto cada um segura a camisa (0..1) e a mão do diretor no ombro do jogador, pelo relógio. */
const DIRECTOR_HOLD = [MARKS.release, 1, MARKS.release + 0.3, 0];
const PLAYER_HOLD = [MARKS.reach, 0, MARKS.reach + 0.32, 1];
const DIRECTOR_TOUCH = [MARKS.shoulder, 0, MARKS.shoulder + 0.4, 1, MARKS.shoulderOff, 1, MARKS.shoulderOff + 0.3, 0];

// --------------------------------------------------------------- direção

type ActorPose = {
  x: number;
  z: number;
  face: number;
  walking: boolean;
  /** Andando de costas (passo curto, o corpo continua virado para `face`). */
  backwards: boolean;
  speed: number;
  heading: number;
  action: FigureAction | null;
  /** Desde quando vale o pedido atual (pré-rodagem depois de um salto). */
  since: number;
};

const emptyPose = (): ActorPose => ({ x: 0, z: 0, face: 0, walking: false, backwards: false, speed: 0, heading: 0, action: null, since: 0 });

type Walk = { start: number; end: number; ax: number; az: number; bx: number; bz: number; backwards: boolean };

/** Lê uma trilha [t0, v0, t1, v1, ...] com suavização entre as chaves. */
function sampleKeys(keys: readonly number[], time: number) {
  if (time <= keys[0]) return keys[1];
  for (let index = 2; index < keys.length; index += 2) {
    if (time <= keys[index]) {
      const t0 = keys[index - 2];
      const v0 = keys[index - 1];
      return v0 + (keys[index + 1] - v0) * smooth01((time - t0) / Math.max(0.0001, keys[index] - t0));
    }
  }
  return keys[keys.length - 1];
}

/** Roteiro de um boneco: caminhadas, para onde vira e o que faz. Ler não aloca nada. */
class ActorTrack {
  private readonly walks: Walk[] = [];
  private readonly faces: Array<{ at: number; yaw: number }> = [];
  private readonly acts: Array<{ at: number; action: FigureAction | null }> = [];

  constructor(private readonly homeX: number, private readonly homeZ: number, private readonly homeYaw: number) {}

  /** Anda até (x, z) entre `start` e `end`. De costas: passo curto, sem virar o corpo. */
  walk(start: number, end: number, x: number, z: number, backwards = false) {
    const last = this.walks[this.walks.length - 1];
    this.walks.push({ start, end, ax: last ? last.bx : this.homeX, az: last ? last.bz : this.homeZ, bx: x, bz: z, backwards });
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
    let backwards = false;
    out.walking = false;
    out.backwards = false;
    for (const walk of this.walks) {
      if (time < walk.start) break;
      if (time < walk.end) {
        const k = (time - walk.start) / (walk.end - walk.start);
        x = mix(walk.ax, walk.bx, k);
        z = mix(walk.az, walk.bz, k);
        out.walking = true;
        backwards = walk.backwards;
        out.backwards = backwards;
        out.heading = Math.atan2(walk.bx - walk.ax, walk.bz - walk.az);
        out.speed = Math.hypot(walk.bx - walk.ax, walk.bz - walk.az) / (walk.end - walk.start);
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
      out.face = backwards ? face : out.heading;
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

/** Até onde a câmera recua (o piso acaba em z ≈ 600) e a lente mais aberta. */
const MAX_DISTANCE = 300;
const MAX_FOV = 62;

/**
 * Enquadra `w × h` unidades em volta de (cx, cy, cz), olhando de `yaw` (0 = da
 * frente, dos fotógrafos) e `pitch` (positivo = de cima). A distância sai da
 * proporção da tela: o mesmo plano funciona deitado e em pé. Em pé a largura
 * pode sobrar para os lados, menos com `whole` (ninguém cortado na borda).
 */
function frame(out: Cam, view: View, cx: number, cy: number, cz: number, w: number, h: number, yaw: number, pitch: number, fov: number, shake: number, push: number, whole = false) {
  let tanV = Math.tan((fov * Math.PI) / 360);
  const width = view.portrait && !whole ? w * 0.7 : w;
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

/** Câmera na mão: senoides em frequências que não batem (nunca repete igual). */
function wobble(time: number, frequency: number, phase: number) {
  return Math.sin(time * frequency + phase) * 0.6 + Math.sin(time * frequency * 2.31 + phase * 1.7) * 0.28 + Math.sin(time * frequency * 4.13 + phase * 2.9) * 0.12;
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

type Shot = { start: number; blend: number; at: (time: number, out: Cam) => void };

// ----------------------------------------------------------------- elenco

type Actor = {
  figure: PlayerFigure;
  track: ActorTrack;
  pose: ActorPose;
  intent: FigureIntent;
  reach: FigureReach;
};

function loadImage(url: string, timeout: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    // Escudo só da mesma origem (ou data URL): outro domínio sujaria o canvas da textura.
    image.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => resolve(null), timeout);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image.naturalWidth > 0 ? image : null);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = url;
  });
}

/** Fonte condensada do jogo (Barlow Condensed via next/font), carregada antes de pintar o nome. */
async function shirtFont(timeout: number) {
  const fallback = "\"Barlow Condensed\", \"Arial Narrow\", Impact, sans-serif";
  const family = getComputedStyle(document.body).getPropertyValue("--font-barlow-condensed").trim();
  const font = family ? `${family}, "Arial Narrow", Impact, sans-serif` : fallback;
  if (!document.fonts?.load) return font;
  await Promise.race([
    document.fonts.load(`900 64px ${font}`).catch(() => undefined),
    new Promise((resolve) => window.setTimeout(resolve, timeout)),
  ]);
  return font;
}

// ----------------------------------------------------------------- palco

export class PresentationStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 2, 2000);
  private readonly cleanup: Array<() => void> = [];
  private set: PresentationSet | null = null;
  private player: Actor | null = null;
  private director: Actor | null = null;
  private readonly actors: Actor[] = [];
  private readonly bufferSize = new THREE.Vector2();
  private shots: Shot[] = [];
  private view: View = { aspect: 16 / 9, free: 0.7, portrait: false };
  /** Luz de olho: sai da câmera, fraca, só para o rosto nunca sumir no escuro. */
  private readonly eye = new THREE.DirectionalLight("#ffe9d2", 0.28);

  // Camisa: raiz (linha das mãos), balanço (pêndulo em volta dessa linha) e a malha.
  private readonly shirtRoot = new THREE.Group();
  private readonly shirtSwing = new THREE.Group();
  private shirt: THREE.Mesh | null = null;
  private shirtTextures: { front: THREE.Texture; back: THREE.Texture } | null = null;
  private readonly gripPlus = new THREE.Vector3();
  private readonly gripMinus = new THREE.Vector3();
  private readonly touch = new THREE.Vector3();
  private readonly gripPrev = new THREE.Vector3();
  private readonly gripVelocity = new THREE.Vector3();
  private readonly scratchA = new THREE.Vector3();
  private readonly scratchB = new THREE.Vector3();
  private swing = 0;
  private swingVelocity = 0;
  private swingFresh = true;

  // Pontos fixos da encenação (mundo).
  private readonly middle = { x: 0, z: 0 };
  private readonly faceEach = { player: 0, director: 0 };

  private readonly cam = newCam();
  private readonly camPrevious = newCam();
  private readonly camBlend = newCam();
  private readonly lookAt = new THREE.Vector3();
  private readonly scratchPose2 = emptyPose();
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
    readonly timeline: PresentationTimeline,
    readonly options: PresentationStageOptions,
  ) {
    const lite = options.performance;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite || coarse, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.75));
    this.renderer.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setClearColor("#050507", 1);
    this.renderer.shadowMap.enabled = !lite;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.fog = new THREE.Fog("#050507", 320, 760);

    // Perda de contexto (Android): para de desenhar e avisa, que segue em 2D.
    const onContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      this.options.onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    this.cleanup.push(() => canvas.removeEventListener("webglcontextlost", onContextLost));
  }

  /** Monta cenário, bonecos e camisa e compila os shaders: aguarde antes do primeiro `render`. */
  async prepare(): Promise<void> {
    if (this.disposed) return;
    const lite = this.options.performance;
    const { input, seed } = this.timeline;
    const club = input.club;
    retainSharedFigureResources();
    this.retained = true;

    const [crest, font] = await Promise.all([
      club.badge ? loadImage(club.badge, 2500) : Promise.resolve(null),
      shirtFont(1500),
    ]);
    if (this.disposed) return;

    // ------------------------------------------------------------ cenário
    const set = new PresentationSet({
      primary: club.primary,
      secondary: club.secondary,
      abbr: club.abbr,
      shortName: club.shortName,
      city: club.city,
      crest,
      font,
      performance: lite,
      seed,
    });
    this.set = set;
    this.scene.add(set.group, this.eye, this.eye.target);

    // ------------------------------------------------------------- elenco
    const P = PLAYER_MARK;
    const D = DIRECTOR_MARK;
    this.middle.x = (P.x + D.x) / 2;
    this.middle.z = (P.z + D.z) / 2;
    this.faceEach.player = yawTo(P.x, P.z, D.x, D.z);
    this.faceEach.director = yawTo(D.x, D.z, P.x, P.z);
    const duration = this.timeline.duration;

    const playerTrack = new ActorTrack(ENTRY.x, ENTRY.z, yawTo(ENTRY.x, ENTRY.z, P.x, P.z))
      .walk(MARKS.walkStart, MARKS.walkEnd, P.x, P.z)
      .face(MARKS.walkEnd - 0.08, this.faceEach.player)
      .face(MARKS.turn, 0)
      .act(MARKS.walkEnd, "nervous")
      .act(MARKS.reach - 0.05, "shirtHold")
      .act(MARKS.raise, "shirtPresent")
      .act(MARKS.cheer, "shirtCheer")
      .act(duration + 0.6, "shirtPresent");
    const directorTrack = new ActorTrack(D.x, D.z, -0.4)
      .walk(MARKS.release + 0.4, MARKS.release + 1.05, DIRECTOR_ASIDE.x, DIRECTOR_ASIDE.z, true)
      .face(MARKS.walkEnd - 0.4, this.faceEach.director)
      .face(MARKS.release + 0.35, -0.3)
      .act(0, "shirtHold")
      .act(MARKS.release + 0.2, "applaud")
      .act(MARKS.shoulder - 0.05, "handOnHeart")
      .act(MARKS.shoulderOff + 0.15, "applaud");

    // Peneira: chega com o colete do treino (fugindo da cor do clube); contratação: de terno.
    const appearance = input.player.appearance;
    const arrival = arrivalOutfit(input);
    const playerOutfit: FigureOutfit = arrival.kind === "kit"
      ? { kind: "kit" }
      : { kind: "suit", jacket: arrival.primary, shirt: arrival.secondary, tie: "#0f1218", pants: "#141821", tieStyle: "none" };
    const tie = luminance(club.primary) > 0.85 ? club.secondary : club.primary;
    this.player = this.createActor(new PlayerFigure({
      appearance: arrival.kind === "kit" ? { ...appearance, kitPattern: 1 } : appearance,
      primary: arrival.primary,
      secondary: arrival.secondary,
      number: input.player.number,
      seed: 23,
      performance: lite,
      outfit: playerOutfit,
    }), playerTrack);
    this.director = this.createActor(new PlayerFigure({
      appearance: directorAppearance(seed),
      primary: club.primary,
      secondary: club.secondary,
      number: 1,
      seed: 61,
      performance: lite,
      outfit: { kind: "suit", jacket: "#1c2230", shirt: "#f3f1ec", tie, pants: "#151a24", tieStyle: "tie" },
    }), directorTrack);
    this.actors.push(this.player, this.director);

    // ------------------------------------------------------------- camisa
    this.shirtTextures = createHeldShirtTextures({
      pattern: this.timeline.kitPattern,
      primary: club.primary,
      secondary: club.secondary,
      name: input.player.shortName || input.player.name,
      number: input.player.number,
      abbr: club.abbr,
      crest,
      font,
      size: lite ? 384 : 512,
    });
    this.shirt = this.buildShirt(this.shirtTextures);
    this.shirt.castShadow = !lite;
    this.shirtSwing.add(this.shirt);
    this.shirtRoot.add(this.shirtSwing);
    this.scene.add(this.shirtRoot);

    this.resize(true);
    this.applyTime(0, 0, true);
    // Compila tudo, inclusive o que nasce escondido: o compile do three pula o invisível.
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (!object.visible) {
        hidden.push(object);
        object.visible = true;
      }
    });
    const textures = [...set.textures(), this.shirtTextures.front, this.shirtTextures.back];
    for (const actor of [this.player, this.director]) textures.push(...actor.figure.textureList());
    for (const texture of textures) this.renderer.initTexture(texture);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // Sem compilação paralela, compila no primeiro quadro.
    }
    if (this.disposed || this.contextLost) return;
    // Quadro descartável (o "Preparando…" está por cima): sobe buffers e compila a sombra.
    this.renderer.render(this.scene, this.camera);
    for (const object of hidden) object.visible = false;
    this.applyTime(0, 0, true);
    this.ready = true;
    this.lastTime = -1;
  }

  /**
   * Desenha a cena no instante `time` (s). `dt` é o tempo real desde o quadro
   * anterior (0 depois de um salto): pular deixa cada boneco no gesto certo.
   */
  render(time: number, dt: number): void {
    if (!this.ready || this.disposed || this.contextLost) return;
    const jump = dt <= 0 || this.lastTime < 0 || Math.abs(time - this.lastTime - dt) > 0.25;
    this.lastTime = time;
    if (jump) this.pendingDt = 0;
    else this.pendingDt += dt;
    // Atrás do cartão final a cena só respira: meia taxa de quadros poupa bateria.
    this.frameCount += 1;
    if (!jump && time > this.timeline.duration + 2 && this.frameCount % 2 === 1) return;
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
    this.player?.figure.dispose();
    this.director?.figure.dispose();
    this.set?.dispose();
    if (this.shirt) {
      this.shirt.geometry.dispose();
      (this.shirt.material as THREE.Material).dispose();
    }
    this.shirtTextures?.front.dispose();
    this.shirtTextures?.back.dispose();
    this.eye.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.retained) releaseSharedFigureResources();
    this.retained = false;
  }

  // ------------------------------------------------------------ elenco

  private createActor(figure: PlayerFigure, track: ActorTrack): Actor {
    this.scene.add(figure.root);
    figure.handAnchor("left");
    figure.handAnchor("right");
    return { figure, track, pose: emptyPose(), intent: idleIntent(), reach: { left: null, right: null, weight: 0 } };
  }

  /** Pedido do instante (posição, giro, ação), sem as mãos guiadas. */
  private stageActor(actor: Actor, time: number) {
    const pose = actor.track.sample(time, actor.pose);
    actor.figure.root.position.set(pose.x, FLOOR_Y, pose.z);
    const intent = actor.intent;
    intent.state = pose.walking && !pose.backwards ? "run" : "idle";
    intent.speed = pose.speed;
    intent.heading = pose.heading;
    intent.faceYaw = pose.face;
    intent.action = pose.action;
    intent.reach = null;
    return pose;
  }

  private stepActor(actor: Actor, dt: number) {
    const steps = Math.max(1, Math.ceil(dt / FIGURE_STEP));
    for (let index = 0; index < steps; index += 1) actor.figure.update(dt / steps, actor.intent);
  }

  /** Mãos guiadas: refaz a pose do instante (dt 0, nada anda) com as palmas nos alvos. */
  private applyReach(actor: Actor) {
    if (actor.reach.weight <= 0.001) return;
    actor.intent.reach = actor.reach;
    actor.figure.update(0, actor.intent);
    actor.intent.reach = null;
  }

  // ------------------------------------------------------------ camisa

  private buildShirt(textures: { front: THREE.Texture; back: THREE.Texture }) {
    const geometry = new THREE.PlaneGeometry(SHIRT_SIDE, SHIRT_SIDE, 10, 12);
    // A linha das mãos (ombros da camisa) passa pela origem.
    geometry.translate(0, -(0.5 - HELD_SHIRT.shoulderY) * SHIRT_SIDE, 0);
    const position = geometry.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      const u = position.getX(index) / SHIRT_SIDE + 0.5;
      const v = HELD_SHIRT.shoulderY - position.getY(index) / SHIRT_SIDE;
      const depth = clamp01((v - HELD_SHIRT.shoulderY) / (HELD_SHIRT.hemY - HELD_SHIRT.shoulderY));
      // Dobras moles e a barra caindo um pouco para o lado das costas (longe de quem segura).
      position.setZ(index, SHIRT_SIDE * (0.012 * Math.sin(u * Math.PI * 5) * depth + 0.03 * depth * depth));
    }
    geometry.computeVertexNormals();
    // Um plano só, dos dois lados: a face da frente do plano mostra as costas da
    // camisa (nome e número); a de trás, a frente (escudo), espelhada para ler certo.
    const material = new THREE.MeshStandardMaterial({ map: textures.back, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 });
    const uniforms = { mapFront: { value: textures.front } };
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <map_pars_fragment>", "#include <map_pars_fragment>\nuniform sampler2D mapFront;")
        .replace(
          "#include <map_fragment>",
          "#ifdef USE_MAP\n  vec4 sampledDiffuseColor = gl_FrontFacing ? texture2D( map, vMapUv ) : texture2D( mapFront, vec2( 1.0 - vMapUv.x, vMapUv.y ) );\n  diffuseColor *= sampledDiffuseColor;\n#endif",
        );
    };
    material.customProgramCacheKey = () => "futbobo-held-shirt";
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Ponto no espaço de quem segura (px de boneco: x à esquerda dele, y para cima, z à frente) → mundo. */
  private holderPoint(actor: Actor, x: number, y: number, z: number, out: THREE.Vector3) {
    const root = actor.figure.root;
    const yaw = root.rotation.y;
    const lx = x * PX;
    const lz = z * PX;
    return out.set(root.position.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), root.position.y + y * PX, root.position.z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
  }

  /** Onde a camisa está no instante: nas mãos do diretor, entre os dois, nas do jogador. */
  private placeShirt(time: number) {
    const player = this.player;
    const director = this.director;
    if (!player || !director) return;
    const root = this.shirtRoot;
    const middle = this.scratchB.set(this.middle.x, FLOOR_Y + 19.5 * PX, this.middle.z);
    const duration = this.timeline.duration;
    if (time < MARKS.pull) {
      // Com o diretor: segura na frente da barriga, estende até o meio dos dois e passa.
      // Na entrega a frente da camisa abre um pouco para as câmeras (as quatro mãos ainda alcançam).
      const offer = smooth01((time - MARKS.offer) / 0.5);
      const held = this.holderPoint(director, 0, 19, 7, this.scratchA);
      root.position.copy(held).lerp(middle, offer);
      root.rotation.set(0, angleLerp(director.figure.root.rotation.y + Math.PI, this.faceEach.player + HANDOVER_TURN, offer), 0);
      return;
    }
    // Com o jogador: traz para junto do corpo, ergue para as câmeras e pula com ela.
    let y = 18;
    let z = 6.5;
    const up = smooth01((time - MARKS.raise) / 0.45);
    y = mix(y, 23.3, up);
    z = mix(z, 7.5, up);
    if (time >= MARKS.cheer && time < duration + 0.9) {
      const t = time - MARKS.cheer;
      const k = smooth01(t / 0.3) * (1 - smooth01((time - duration - 0.6) / 0.3));
      const pump = t > 0.15 ? 0.5 - 0.5 * Math.cos(Math.PI * 2 * 1.5 * (t - 0.15)) : 0;
      y += k * (1.2 * (1 - pump) - 0.55 * pump);
      z += 0.5 * k;
    }
    const held = this.holderPoint(player, 0, y, z, this.scratchA);
    const pull = smooth01((time - MARKS.pull) / (MARKS.pullEnd - MARKS.pull));
    root.position.copy(middle).lerp(held, pull);
    root.rotation.set(0, angleLerp(this.faceEach.player + HANDOVER_TURN, player.figure.root.rotation.y, pull), 0);
  }

  /** Pêndulo em volta da linha das mãos: a camisa balança com o tranco de quem segura. */
  private swingShirt(time: number, dt: number, jump: boolean) {
    const withPlayer = time >= MARKS.pull;
    // Barra um pouco para longe de quem segura (o lado de +z da camisa é o do jogador... ou o do diretor).
    const rest = withPlayer ? -0.05 : 0.05;
    const grip = this.shirtRoot.position;
    if (jump || this.swingFresh || dt <= 0) {
      this.swing = rest;
      this.swingVelocity = 0;
      this.gripPrev.copy(grip);
      this.gripVelocity.set(0, 0, 0);
      this.swingFresh = false;
      this.shirtSwing.rotation.x = rest;
      return;
    }
    const velocity = this.scratchA.copy(grip).sub(this.gripPrev).divideScalar(dt);
    const accel = this.scratchB.copy(velocity).sub(this.gripVelocity).divideScalar(dt);
    this.gripPrev.copy(grip);
    this.gripVelocity.copy(velocity);
    const yaw = this.shirtRoot.rotation.y;
    // Aceleração na direção da normal da camisa (+z local) e para cima.
    const normal = Math.max(-900, Math.min(900, accel.x * Math.sin(yaw) + accel.z * Math.cos(yaw)));
    const lift = Math.max(-900, Math.min(900, accel.y));
    const omega = Math.sqrt(216 / SWING_ARM);
    const damping = 2 * 0.32 * omega;
    let remaining = Math.min(dt, 0.1);
    while (remaining > 0) {
      const h = Math.min(remaining, 1 / 120);
      remaining -= h;
      // Empurrão para a frente joga a barra para trás (ângulo positivo leva a barra para -z).
      const drive = (normal / SWING_ARM) * Math.cos(this.swing) * 0.6;
      const gravity = (1 + lift / 216) * omega * omega * Math.sin(this.swing - rest);
      this.swingVelocity += (drive - gravity - damping * this.swingVelocity) * h;
      this.swing += this.swingVelocity * h;
    }
    this.swing = Math.max(-0.45, Math.min(0.45, this.swing));
    this.shirtSwing.rotation.x = this.swing;
  }

  /** Ombros da camisa (mundo) para as palmas de quem segura. */
  private updateGrips(time: number) {
    const player = this.player;
    const director = this.director;
    if (!player || !director) return;
    this.shirtRoot.updateMatrixWorld(true);
    this.shirtRoot.localToWorld(this.gripPlus.set(GRIP_X, 0, 0));
    this.shirtRoot.localToWorld(this.gripMinus.set(-GRIP_X, 0, 0));
    // Jogador: a esquerda dele (+x) no ombro +x da camisa. Diretor: a camisa vira para o outro lado.
    player.reach.left = this.gripPlus;
    player.reach.right = this.gripMinus;
    player.reach.weight = sampleKeys(PLAYER_HOLD, time);
    const touch = sampleKeys(DIRECTOR_TOUCH, time);
    if (touch > 0.001) {
      // Mão direita do diretor no ombro esquerdo do jogador (a foto com o dirigente).
      this.holderPoint(player, 6.3, 24.4, -0.4, this.touch);
      director.reach.left = null;
      director.reach.right = this.touch;
      director.reach.weight = touch;
    } else {
      director.reach.left = this.gripMinus;
      director.reach.right = this.gripPlus;
      director.reach.weight = sampleKeys(DIRECTOR_HOLD, time);
    }
  }

  // ------------------------------------------------------------ quadro

  private applyTime(time: number, dt: number, jump: boolean) {
    const set = this.set;
    const player = this.player;
    const director = this.director;
    if (!set || !player || !director) return;
    const reduced = this.options.reducedMotion;
    const actors = this.actors;

    if (jump) {
      // Salto: cada um já virado para o lado certo, a camisa no lugar e o gesto
      // pré-rodado com as mãos nela (a ação aparece no meio, como estaria).
      for (const actor of actors) {
        const pose = this.stageActor(actor, time);
        actor.figure.snapYaw(pose.face);
      }
      this.placeShirt(time);
      this.swingShirt(time, 0, true);
      this.updateGrips(time);
      for (const actor of actors) {
        const span = Math.min(PREROLL_MAX, Math.max(0.3, time - actor.pose.since));
        const steps = Math.ceil(span / PREROLL_STEP);
        actor.intent.reach = actor.reach.weight > 0.001 ? actor.reach : null;
        for (let index = 0; index < steps; index += 1) actor.figure.update(span / steps, actor.intent);
        actor.intent.reach = null;
      }
    } else {
      for (const actor of actors) {
        this.stageActor(actor, time);
        this.stepActor(actor, dt);
      }
      this.placeShirt(time);
      this.swingShirt(time, dt, false);
      this.updateGrips(time);
      for (const actor of actors) this.applyReach(actor);
    }

    // Flashes: brilho de cada um, a luz no palco e o soco de exposição.
    const level = set.update(time, this.timeline.flashes, reduced, this.renderer.getDrawingBufferSize(this.bufferSize).y, this.camera.fov);
    this.renderer.toneMappingExposure = 1 + (reduced ? 0.03 : 0.14) * Math.min(1, level);
    // Contorno de luz no jogador na hora da foto.
    player.figure.setHighlight(time >= MARKS.storm ? 0.12 : 0, "#ffffff");

    this.updateCamera(time);
  }

  // ------------------------------------------------------------ câmera

  private buildShots() {
    const view = this.view;
    const reduced = this.options.reducedMotion;
    const duration = this.timeline.duration;
    const P = PLAYER_MARK;
    const M = this.middle;
    const playerAt = (time: number) => this.player?.track.sample(time, this.scratchPose2) ?? null;
    const shots: Shot[] = [];

    // 1. Chegada: travelling de frente, um pouco à direita, acompanhando o passo.
    shots.push({
      start: 0,
      blend: 0,
      at: (time, out) => {
        const pose = playerAt(time);
        const x = pose ? pose.x : P.x;
        const z = pose ? pose.z : P.z;
        const k = smooth01((time - 1.9) / 0.85);
        frame(out, view, mix(x + 7, M.x, k), FLOOR_Y + mix(23, 24, k), mix(z, M.z, k), mix(42, 62, k), 44, mix(0.42, 0.16, k), 0.03, 38, 0.35, 0.08 * (1 - smooth01(time / 2.2)));
      },
    });
    // 2. Entrega: por cima do ombro do jogador, o diretor de frente estendendo a camisa.
    shots.push({
      start: 2.75,
      blend: 0.7,
      at: (time, out) => frame(out, view, M.x, FLOOR_Y + 23, M.z, 46, 36, mix(-0.2, -0.08, progress(time, 2.75, 4.3)), 0.12, 34, 0.3, 0.1 * progress(time, 2.75, 4.3)),
    });
    // 3. O rosto dele com a camisa nas mãos (do lado do diretor: as costas da camisa aparecem de relance).
    shots.push({
      start: 4.3,
      blend: 0.6,
      at: (time, out) => frame(out, view, P.x + 2, FLOOR_Y + 31, P.z, 26, 23, mix(0.62, 0.5, progress(time, 4.3, MARKS.cut)), 0.02, 34, 0.3, 0.06 * progress(time, 4.3, MARKS.cut)),
    });
    // 4. A foto: corte seco para a frente, do corredor dos fotógrafos, subindo devagar.
    shots.push({
      start: MARKS.cut,
      blend: 0,
      at: (time, out) => {
        const u = smooth01(progress(time, MARKS.cut, MARKS.cheer));
        const kick = !reduced && time >= MARKS.storm ? 0.05 * Math.exp(-(time - MARKS.storm) * 6) : 0;
        frame(out, view, P.x, FLOOR_Y + 24.5, P.z, 30, 37, mix(-0.02, 0.06, u), mix(-0.03, 0.04, u), 28, 0.7, 0.06 + 0.12 * u + kick);
      },
    });
    // 5. Festa: a grua sobe e abre, o painel do clube e o diretor entram no quadro.
    shots.push({
      start: MARKS.cheer,
      blend: 1.5,
      at: (time, out) => {
        const u = smooth01(progress(time, MARKS.cheer, duration));
        frame(out, view, mix(P.x, P.x + 9, u), FLOOR_Y + mix(26, 30, u), mix(P.z, P.z - 6, u), mix(34, 78, u), mix(38, 60, u), mix(0.02, 0.2, u), mix(0.03, 0.2, u), 30, 0.4, 0, true);
      },
    });
    // Fim: plano aberto, deriva lenta atrás do cartão final.
    shots.push({
      start: duration,
      blend: 1.8,
      at: (time, out) => {
        const drift = reduced ? 0 : 0.06 * Math.sin(0.15 * (time - duration));
        frame(out, view, 8, FLOOR_Y + 32, -4, 96, 70, 0.2 + drift, 0.16, 32, 0.2, 0, true);
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
      const amount = 0.0022 * distance * shot.shake;
      px += wobble(time, 0.71, 1.3) * amount;
      py += wobble(time, 0.53, 2.1) * amount * 0.7;
      pz += wobble(time, 0.61, 3.7) * amount * 0.5;
      tx += wobble(time, 0.83, 4.4) * amount * 0.6;
      ty += wobble(time, 0.67, 5.9) * amount * 0.5;
    }
    this.camera.position.set(px, Math.max(6, py), pz);
    this.lookAt.set(tx, ty, tz);
    this.camera.lookAt(this.lookAt);
    this.eye.position.set(px, py + 20, pz);
    this.eye.target.position.copy(this.lookAt);
    if (Math.abs(this.camera.fov - shot.fov) > 0.001) {
      this.camera.fov = shot.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Proporção e área livre para o assunto (entre a tarja de cima e a legenda;
   * mesma conta do CSS). O alvo de cada plano vai para o meio dessa área.
   */
  private resize(force: boolean) {
    // Sem tamanho de layout (WebView no meio de um redimensionamento), fica o último.
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

// Visão 3D da partida. Só LÊ o `BotaoMatchState`: posição, velocidade, fase e
// vez saem do mesmo motor da mesa 2D, então a jogabilidade é idêntica. Tudo
// o que existe aqui (corrida, chute, comemoração, rede estufando, torcida) é
// leitura do estado, nunca escrita.

import * as THREE from "three";
import {
  FIELD,
  GOAL_LEFT,
  GOAL_RIGHT,
  distanceForSpeed,
  penaltyKeeper,
  penaltyShooter,
  shotSpeedFor,
  usesSquads,
  type BotaoBody,
  type BotaoEvent,
  type BotaoMatchState,
  type BotaoPenaltyState,
} from "../engine";
import { playSignatureSound } from "../signature-audio";
import { goalCelebrationExtensionMs } from "../celebration-timing";
import { botaoTraceEnabled } from "../dev-trace";
import { celebrationIdOf, teamKitPattern, randomPlayerAppearance, type PlayerAppearance } from "../../player-appearance";
import { bodyAppearance, type BotaoRenderView } from "../render";
import type { BotaoMatchSetup, BotaoSide } from "../types";
import { BallView } from "./ball";
import { FIGURE_HEIGHT, PlayerFigure, angleDelta, idleIntent, type FigureAction, type FigureIntent } from "./character";
import { Choreographer, goalCelebrationOf, squadCelebrationFor, type Actor, type CameraShot, type Directive } from "./choreography";
import { CelebrationFx } from "./celebration-fx";
import { Effects } from "./effects";
import { GOAL_HEIGHT, HALF_H, HALF_W, Stadium } from "./stadium";
import { fieldThemeForMatch } from "../field-themes";
import { kitDistance, readableInk } from "../kits";
import { labelTexture, mixHex } from "./textures";

const DEFAULT_PITCH = 0.5;
const SUN_INTENSITY = 2.35;
const HEMISPHERE_INTENSITY = 1.05;
const HEMISPHERE_SKY = "#d6ecff";
const MIN_PITCH = 0.08;
const MAX_PITCH = 1.05;
const PICK_HEIGHT = 12;
/**
 * Sombra PCF do three r186: 5 leituras com disco de Vogel, ruído e trigonometria
 * em todo pixel que recebe sombra (gramado, tabelas, bonecos). Uma leitura só,
 * com o filtro linear de comparação, já dá um PCF 2×2 no hardware: a borda fica
 * ~1 texel mais firme (imperceptível no desktop, ~1,5 px no celular). Se o three
 * mudar o trecho, o original continua valendo.
 */
function applySingleTapShadows() {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const taps = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!taps.test(chunk)) return;
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(taps, "shadow = texture( shadowMap, vec3( shadowCoord.xy, shadowCoord.z ) );");
}
applySingleTapShadows();

const POWER_SEGMENTS = 64;
/** Piso da resolução adaptável do modo desempenho (fração dos pixels CSS). */
const MIN_PIXEL_RATIO = 0.7;
const STAMINA_SEGMENTS = 64;
const KEEPER_COLORS = ["#c6ff3d", "#ff8c1a", "#8a5cff", "#20e0c0", "#ff4fa3", "#22272e"];

export type Botao3DOptions = {
  landscape: boolean;
  hideUserMarker?: boolean;
  reducedMotion?: boolean;
  /** Modo desempenho 3D: sem torcida nem sombra projetada, resolução adaptável, efeitos enxutos. */
  performance?: boolean;
  /** Dois dedos na tela: a partida cancela a mira em andamento. */
  onGesture?: () => void;
  /** Recriação depois de perder o contexto: sem a entrada de transmissão de novo. */
  skipIntro?: boolean;
  /** O WebGL caiu (Android apertando memória): a partida recria a visão. */
  onContextLost?: () => void;
  /** Bobonline: câmera do outro lado do campo (o convidado vê o próprio time atacando para cima). */
  flip?: boolean;
};

/** Drama do pênalti da CPU: o batedor espera estes passos atrás da bola até o fim da contagem. */
const WINDUP_STEP_BACK = 22;
/** Com menos que isto para o chute, ele já corre para a bola. */
const WINDUP_RUN_IN_S = 0.35;
/** O rufar dura ~1,6 s e o acento final cai no chute. */
const WINDUP_DRUMROLL_S = 1.6;
// Drama do pênalti da CPU, só no 3D (Math.random, nunca a rng da partida): a
// câmera vira para trás do batedor e a torcida segura a respiração.
const CPU_PENALTY_DRAMA_MS = 1300;
const CPU_PENALTY_DRAMA_JITTER_MS = 1000;
const CAMERA_SETTLE_POLL_MS = 100;
const CAMERA_SETTLE_MAX_MS = 700;

/**
 * Relógio do drama do pênalti da CPU no caminho offline. A BotaoMatch o guarda e
 * conta `elapsedMs` em tempo de jogo (a pausa congela; a vista pode ser refeita no
 * meio); a vista só o cria e diz quanto esperar a câmera.
 */
export type CpuPenaltyWindup = { shooterId: string; totalMs: number; elapsedMs: number; settleMs: number };

/**
 * Chave do último rufar do drama (uma vez por cobrança, quando faltam WINDUP_DRUMROLL_S). Rufa quando ela muda
 * para uma não vazia. Pênaltis por demora repetem a mesma chave (rodada 1, ninguém bateu): fora da cena do
 * pênalti ela volta a "", e a próxima cobrança rufa de novo.
 */
export function drumrollKeyAfter(lastKey: string, penaltyScene: boolean, penalties: BotaoPenaltyState | null, remainingS: number): string {
  if (!penaltyScene) return "";
  if (!penalties || remainingS > WINDUP_DRUMROLL_S) return lastKey;
  return `${penalties.round}|${penalties.turn}|${penalties.results.user.length}|${penalties.results.cpu.length}`;
}

const smoothstep01 = (value: number) => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};

type Entry = {
  id: string;
  figure: PlayerFigure;
  /** Base de botão no gramado, nas cores do time: é ela que diz de quem é o boneco. */
  plate: THREE.Mesh | null;
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  stamina: THREE.Mesh | null;
  staminaValue: number;
  marker: THREE.Group | null;
  side: BotaoSide | null;
  appearanceKey: string;
  x: number;
  z: number;
  engineX: number;
  engineZ: number;
  chaseSpeed: number;
  chasing: boolean;
  /** Resto do trote quando a física começa: assenta no disco em ~0,2s em vez de pular. */
  offX: number;
  offZ: number;
  /** Afastamento visual para ninguém atravessar ninguém no trote (nunca na física). */
  sepX: number;
  sepZ: number;
  /** Identidade da peça; a aparência só é recalculada quando ela muda. */
  identity: string;
  seen: boolean;
  /** Tempo de animação guardado (modo desempenho: boneco parado anima a meia taxa). */
  idleDt: number;
};

const toWorldX = (x: number) => x - HALF_W;
const toWorldZ = (y: number) => y - HALF_H;

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function bodyIdentity(body: BotaoBody) {
  return `${body.id}|${body.playerId ?? ""}|${body.number}`;
}

function rgba(hex: string, alpha: number) {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(value)) return `rgba(128,128,128,${alpha})`;
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/**
 * Base de botão vista de cima: miolo vazado (o boneco cobre), corpo na cor
 * principal e aro na secundária — como a peça de mesa que o boneco substituiu.
 * O time do jogador ganha o reflexo de verniz; o adversário fica fosco.
 */
function plateTexture(primary: string, secondary: string, glossy: boolean) {
  const size = 128;
  const center = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const circle = (radius: number) => {
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
  };
  // Contorno escuro fino: separa a base do gramado de qualquer cor.
  circle(center - 1);
  ctx.fillStyle = "rgba(4,10,7,0.5)";
  ctx.fill();
  const rim = kitDistance(primary, secondary) < 70 ? readableInk(primary) : secondary;
  circle(center - 3.5);
  ctx.fillStyle = rgba(rim, 0.95);
  ctx.fill();
  const body = ctx.createRadialGradient(center, center, center * 0.38, center, center, center * 0.84);
  body.addColorStop(0, rgba(primary, 0));
  body.addColorStop(0.42, rgba(primary, glossy ? 0.62 : 0.5));
  body.addColorStop(1, rgba(primary, 0.92));
  // Dentro do aro o corpo substitui (não soma): o miolo fica de fato vazado.
  ctx.save();
  circle(center * 0.84);
  ctx.clip();
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  if (glossy) {
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(center, center, center * 0.72, Math.PI * 1.08, Math.PI * 1.55);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, center * 0.9, Math.PI * 0.12, Math.PI * 0.42);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function yawToward(dx: number, dz: number) {
  return Math.atan2(dx, dz);
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}

// ----------------------------------------------------------- confete

type Paper = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  spin: number;
  sway: number;
  swayPhase: number;
  terminal: number;
  sx: number;
  sy: number;
  life: number;
  delay: number;
  r: number;
  g: number;
  b: number;
};

/**
 * Confete de papel: dois canhões nas traves, papel e serpentina misturados,
 * caindo devagar e balançando, e brilhando quando vira para a luz. Um único
 * InstancedMesh com material básico — o "brilho" é a cor, sem iluminação.
 */
class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly items: Paper[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly euler = new THREE.Euler();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();
  private cursor = 0;
  private active = false;

  constructor(count = 240) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count);
    this.mesh.frustumCulled = false;
    for (let index = 0; index < count; index += 1) {
      this.items.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, sway: 0, swayPhase: 0, terminal: -28, sx: 1, sy: 1, life: 0, delay: 0, r: 1, g: 1, b: 1 });
      this.mesh.setColorAt(index, this.color.set("#ffffff"));
    }
    this.hideAll();
    // Sem papel no ar, nem entra na fila de desenho (240 instâncias de escala zero custavam um draw).
    this.mesh.visible = false;
  }

  private hideAll() {
    this.scale.setScalar(0);
    for (let index = 0; index < this.items.length; index += 1) {
      this.matrix.compose(this.position.set(0, -100, 0), this.quaternion, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
    }
    this.scale.setScalar(1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private next(colors: string[], index: number): Paper {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    this.color.set(colors[index % colors.length]);
    item.r = this.color.r;
    item.g = this.color.g;
    item.b = this.color.b;
    const streamer = Math.random() < 0.3;
    item.sx = streamer ? 0.32 : 1;
    item.sy = streamer ? 3.2 : 1;
    item.spin = (streamer ? 8 + Math.random() * 8 : 3 + Math.random() * 5) * (Math.random() < 0.5 ? -1 : 1);
    item.sway = 14 + Math.random() * 12;
    item.swayPhase = Math.random() * Math.PI * 2;
    item.terminal = -(22 + Math.random() * 12);
    item.rx = Math.random() * Math.PI;
    item.ry = Math.random() * Math.PI;
    item.life = 2.6 + Math.random() * 1.4;
    item.delay = 0;
    this.active = true;
    this.mesh.visible = true;
    return item;
  }

  /** Dois canhões nas traves do gol, disparando para o alto e para dentro do campo. */
  burst(_x: number, z: number, towardZ: number, colors: string[]) {
    const half = this.items.length >> 1;
    for (let index = 0; index < half; index += 1) {
      const item = this.next(colors, index);
      const side = index % 2 ? 1 : -1;
      const spread = (Math.random() - 0.5) * 0.5;
      const speed = 210 + Math.random() * 90;
      item.x = side * (FIELD.goalWidth / 2);
      item.y = 4;
      item.z = z;
      item.vx = (side * -0.25 + spread) * speed * 0.6;
      item.vy = speed * (0.9 + Math.random() * 0.15);
      item.vz = towardZ * speed * 0.5;
      // Os canhões soltam o papel ao longo de ~0,35s, não tudo no mesmo quadro.
      item.delay = (index / half) * 0.35;
    }
  }

  /** Chuva caindo em volta de quem comemora — é o que aparece no plano fechado. */
  rain(x: number, z: number, colors: string[]) {
    const count = Math.min(60, this.items.length >> 2);
    for (let index = 0; index < count; index += 1) {
      const item = this.next(colors, index);
      item.x = x + (Math.random() - 0.5) * 140;
      item.z = z + (Math.random() - 0.5) * 140;
      item.y = 60 + Math.random() * 50;
      item.vx = 0;
      item.vz = 0;
      item.vy = -10;
      item.delay = Math.random() * 0.4;
    }
  }

  update(dt: number) {
    if (!this.active || dt <= 0) return;
    let alive = 0;
    const colors = this.mesh.instanceColor;
    this.items.forEach((item, index) => {
      if (item.life <= 0) return;
      alive += 1;
      if (item.delay > 0) {
        item.delay -= dt;
        this.scale.setScalar(0);
        this.matrix.compose(this.position.set(item.x, item.y, item.z), this.quaternion, this.scale);
        this.mesh.setMatrixAt(index, this.matrix);
        return;
      }
      item.life -= dt;
      item.vy = Math.max(item.terminal, item.vy - 230 * dt);
      const drag = Math.exp(-dt * 2.2);
      item.vx *= drag;
      item.vz *= drag;
      // Papel cai balançando de um lado para o outro (só quando já está caindo).
      const falling = item.vy < 0 ? 1 : 0;
      item.x += item.vx * dt + Math.sin(item.life * 5.5 + item.swayPhase) * item.sway * dt * falling;
      item.y += item.vy * dt;
      item.z += item.vz * dt;
      item.rx += item.spin * dt;
      item.ry += item.spin * 0.6 * dt;
      if (item.y < 0.3) {
        item.y = 0.3;
        item.vx = 0;
        item.vz = 0;
        item.vy = 0;
        item.spin = 0;
        item.rx = Math.PI / 2;
      }
      const visible = item.life > 0 ? Math.min(1, item.life / 0.6) : 0;
      this.scale.set(item.sx * visible, item.sy * visible, 1);
      this.quaternion.setFromEuler(this.euler.set(item.rx, item.ry, 0));
      this.matrix.compose(this.position.set(item.x, item.y, item.z), this.quaternion, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
      // Brilha quando a face vira para cima (para a luz das torres).
      const shine = 0.55 + 0.75 * Math.abs(Math.cos(item.rx) * Math.cos(item.ry));
      if (colors) colors.setXYZ(index, item.r * shine, item.g * shine, item.b * shine);
    });
    this.scale.set(1, 1, 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colors) colors.needsUpdate = true;
    if (alive === 0) {
      this.active = false;
      this.hideAll();
      this.mesh.visible = false;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    disposeMaterial(this.mesh.material);
    this.mesh.dispose();
  }
}

// ------------------------------------------------------------- mira

/**
 * Tracejado de uma linha reta de 2 pontos. O computeLineDistances do three cria
 * um atributo novo (buffer novo na GPU) a cada chamada; aqui ele é criado uma
 * vez e só o comprimento muda.
 */
function setDashLength(geometry: THREE.BufferGeometry, length: number) {
  let distances = geometry.getAttribute("lineDistance") as THREE.BufferAttribute | undefined;
  if (!distances) {
    distances = new THREE.Float32BufferAttribute([0, 0], 1);
    geometry.setAttribute("lineDistance", distances);
  }
  if (distances.getX(1) === length) return;
  distances.setX(1, length);
  distances.needsUpdate = true;
}

class AimView {
  readonly group = new THREE.Group();
  private readonly shaft: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly arrowMaterial: THREE.MeshBasicMaterial;
  private readonly lane: THREE.Mesh;
  private readonly laneMaterial: THREE.MeshBasicMaterial;
  private readonly stopRing: THREE.Mesh;
  private readonly stopMaterial: THREE.MeshBasicMaterial;
  private readonly powerTrack: THREE.Mesh;
  private readonly powerArc: THREE.Mesh;
  private readonly powerMaterial: THREE.MeshBasicMaterial;
  private readonly band: THREE.Line;
  private readonly bandMaterial: THREE.LineDashedMaterial;
  private readonly bandGeometry: THREE.BufferGeometry;
  private readonly path: THREE.Line;
  private readonly pathMaterial: THREE.LineDashedMaterial;
  private readonly pathGeometry: THREE.BufferGeometry;
  private lastArc = -1;
  private readonly oriented: THREE.Mesh[];

  constructor() {
    const flat = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
      const result = new THREE.Mesh(geometry, material);
      result.rotation.x = -Math.PI / 2;
      result.position.y = y;
      result.renderOrder = 5;
      return result;
    };
    this.arrowMaterial = new THREE.MeshBasicMaterial({ color: "#ffc72c", transparent: true, depthWrite: false });
    const shaftGeometry = new THREE.PlaneGeometry(1, 1);
    shaftGeometry.translate(0.5, 0, 0);
    this.shaft = flat(shaftGeometry, this.arrowMaterial, 0.5);
    const headShape = new THREE.Shape();
    headShape.moveTo(0, 6.5);
    headShape.lineTo(11, 0);
    headShape.lineTo(0, -6.5);
    headShape.closePath();
    this.head = flat(new THREE.ShapeGeometry(headShape), this.arrowMaterial, 0.5);

    this.laneMaterial = new THREE.MeshBasicMaterial({ color: "#ffc72c", transparent: true, opacity: 0.14, depthWrite: false });
    const laneGeometry = new THREE.PlaneGeometry(1, 1);
    laneGeometry.translate(0.5, 0, 0);
    this.lane = flat(laneGeometry, this.laneMaterial, 0.35);

    this.stopMaterial = new THREE.MeshBasicMaterial({ color: "#f5f7f2", transparent: true, opacity: 0.45, depthWrite: false });
    this.stopRing = flat(new THREE.RingGeometry(FIELD.discRadius - 1, FIELD.discRadius + 0.6, 40), this.stopMaterial, 0.45);

    this.powerTrack = flat(new THREE.RingGeometry(FIELD.discRadius + 6, FIELD.discRadius + 9.5, 48), new THREE.MeshBasicMaterial({ color: "#06110d", transparent: true, opacity: 0.55, depthWrite: false }), 0.55);
    this.powerMaterial = new THREE.MeshBasicMaterial({ color: "#ffc72c", transparent: true, depthWrite: false, side: THREE.DoubleSide });
    // Anel inteiro criado uma vez: a força só muda o drawRange (nada de geometria nova no arraste).
    // Começa em cima (π/2) e, espelhado em x, cresce no sentido horário na tela.
    this.powerArc = flat(new THREE.RingGeometry(FIELD.discRadius + 6, FIELD.discRadius + 9.5, POWER_SEGMENTS, 1, Math.PI / 2, Math.PI * 2), this.powerMaterial, 0.6);
    this.powerArc.scale.x = -1;

    this.bandMaterial = new THREE.LineDashedMaterial({ color: "#f5f7f2", dashSize: 4, gapSize: 4, transparent: true, opacity: 0.55, depthWrite: false });
    this.bandGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.band = new THREE.Line(this.bandGeometry, this.bandMaterial);
    this.band.renderOrder = 6;
    this.pathMaterial = new THREE.LineDashedMaterial({ color: "#f5f7f2", dashSize: 3, gapSize: 6, transparent: true, opacity: 0.4, depthWrite: false });
    this.pathGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.path = new THREE.Line(this.pathGeometry, this.pathMaterial);
    this.path.renderOrder = 5;

    this.group.add(this.lane, this.shaft, this.head, this.stopRing, this.powerTrack, this.powerArc, this.band, this.path);
    this.group.visible = false;
    this.oriented = [this.shaft, this.head, this.lane];
  }

  update(disc: BotaoBody | null, aim: BotaoRenderView["aim"]) {
    if (!disc || !aim) {
      this.group.visible = false;
      return;
    }
    const dx = disc.x - aim.dragX;
    const dy = disc.y - aim.dragY;
    const length = Math.hypot(dx, dy);
    if (length < 2) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const nx = dx / length;
    const ny = dy / length;
    const x = toWorldX(disc.x);
    const z = toWorldZ(disc.y);
    const angle = Math.atan2(ny, nx);
    const color = aim.valid ? (aim.ratio > 0.82 ? "#ff7a45" : "#ffc72c") : "#9aa39d";
    this.arrowMaterial.color.set(color);
    this.arrowMaterial.opacity = aim.valid ? 0.95 : 0.45;
    this.powerMaterial.color.set(color);
    this.laneMaterial.color.set(color);

    const reach = 40 + aim.ratio * 150;
    const start = disc.radius + 3;
    for (const piece of this.oriented) {
      piece.position.x = x;
      piece.position.z = z;
      // Plano deitado: girar em Z local equivale a girar no chão.
      piece.rotation.z = -angle;
    }
    this.shaft.scale.set(Math.max(0.1, reach - start), 3.2, 1);
    this.shaft.position.x = x + nx * start;
    this.shaft.position.z = z + ny * start;
    this.head.position.x = x + nx * reach;
    this.head.position.z = z + ny * reach;

    const travel = aim.valid ? distanceForSpeed(shotSpeedFor(disc.power) * aim.ratio) : 0;
    this.lane.visible = aim.valid;
    this.stopRing.visible = aim.valid;
    this.path.visible = aim.valid;
    if (aim.valid) {
      this.lane.scale.set(Math.max(0.1, travel - start), disc.radius * 1.5, 1);
      this.lane.position.x = x + nx * start;
      this.lane.position.z = z + ny * start;
      this.stopRing.position.set(x + nx * travel, 0.45, z + ny * travel);
      const pathPositions = this.pathGeometry.getAttribute("position") as THREE.BufferAttribute;
      pathPositions.setXYZ(0, x, 0.7, z);
      pathPositions.setXYZ(1, x + nx * travel, 0.7, z + ny * travel);
      pathPositions.needsUpdate = true;
      setDashLength(this.pathGeometry, travel);
    }

    this.powerTrack.position.set(x, 0.55, z);
    const arc = Math.round(aim.ratio * POWER_SEGMENTS);
    if (arc !== this.lastArc) {
      this.lastArc = arc;
      // RingGeometry com 1 anel radial: 6 índices por segmento.
      this.powerArc.geometry.setDrawRange(0, arc * 6);
    }
    this.powerArc.position.set(x, 0.6, z);

    // Elástico: da cintura do jogador até onde o dedo está.
    const bandPositions = this.bandGeometry.getAttribute("position") as THREE.BufferAttribute;
    bandPositions.setXYZ(0, x, PICK_HEIGHT, z);
    bandPositions.setXYZ(1, toWorldX(aim.dragX), PICK_HEIGHT, toWorldZ(aim.dragY));
    bandPositions.needsUpdate = true;
    setDashLength(this.bandGeometry, Math.hypot(toWorldX(aim.dragX) - x, toWorldZ(aim.dragY) - z));
  }

  dispose() {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        disposeMaterial(object.material);
      }
    });
  }
}

// ------------------------------------------------------------- rastro

class Trail {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly max = 16;
  private readonly tangent = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly mix = new THREE.Color();
  private readonly gold = new THREE.Color("#ffd23f");
  private readonly white = new THREE.Color("#ffffff");

  constructor() {
    this.positions = new Float32Array(this.max * 2 * 3);
    this.colors = new Float32Array(this.max * 2 * 4);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4));
    const indices: number[] = [];
    for (let index = 0; index < this.max - 1; index += 1) {
      const a = index * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /**
   * Fita virada para a câmera (não some quando a câmera desce), aditiva, na cor
   * de quem tocou por último; chute muito forte esquenta para dourado/laranja.
   */
  update(points: Array<{ x: number; y: number }>, radius: number, eye: THREE.Vector3, tint: THREE.Color, fast: boolean) {
    const count = Math.min(points.length, this.max);
    // Sem rastro (quase a partida inteira), fora da fila de desenho e sem upload.
    this.mesh.visible = count >= 2;
    if (count < 2) return;
    this.colors.fill(0);
    const start = points.length - count;
    for (let index = 0; index < count; index += 1) {
      const point = points[start + index];
      const next = points[Math.min(points.length - 1, start + index + 1)];
      const previous = points[Math.max(start, start + index - 1)];
      const x = toWorldX(point.x);
      const z = toWorldZ(point.y);
      this.tangent.set(next.x - previous.x, 0, next.y - previous.y);
      this.toEye.set(eye.x - x, eye.y - radius, eye.z - z);
      this.side.crossVectors(this.tangent, this.toEye);
      if (this.side.lengthSq() < 1e-6) this.side.set(-this.tangent.z, 0, this.tangent.x);
      this.side.normalize();
      const fade = (index + 1) / count;
      const width = radius * (0.2 + 0.8 * Math.pow(fade, 0.7));
      this.positions[index * 6] = x - this.side.x * width;
      this.positions[index * 6 + 1] = radius - this.side.y * width;
      this.positions[index * 6 + 2] = z - this.side.z * width;
      this.positions[index * 6 + 3] = x + this.side.x * width;
      this.positions[index * 6 + 4] = radius + this.side.y * width;
      this.positions[index * 6 + 5] = z + this.side.z * width;
      if (fast) {
        // Cauda laranja, meio dourado, cabeça branca.
        this.mix.set("#ff6a2a").lerp(this.gold, Math.min(1, fade * 1.6)).lerp(this.white, Math.max(0, fade - 0.6) * 2.5);
      } else {
        this.mix.copy(tint).lerp(this.white, 0.55 * fade);
      }
      const alpha = Math.min(0.8, fade * fade);
      for (let offset = 0; offset <= 4; offset += 4) {
        this.colors[index * 8 + offset] = this.mix.r;
        this.colors[index * 8 + offset + 1] = this.mix.g;
        this.colors[index * 8 + offset + 2] = this.mix.b;
        this.colors[index * 8 + offset + 3] = alpha;
      }
    }
    this.geometry.setDrawRange(0, (count - 1) * 6);
    (this.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    disposeMaterial(this.mesh.material);
  }
}

// --------------------------------------------------------------- visão

export class Botao3DView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 5, 5000);
  private readonly stadium: Stadium;
  private readonly ball: BallView;
  private readonly aim = new AimView();
  private readonly trail = new Trail();
  private readonly confetti: Confetti;
  private readonly entries = new Map<string, Entry>();
  private readonly keepers: Partial<Record<BotaoSide, Entry>> = {};
  private readonly raycaster = new THREE.Raycaster();
  private readonly pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PICK_HEIGHT);
  private readonly ringGeometry = new THREE.RingGeometry(FIELD.discRadius - 1.6, FIELD.discRadius + 0.5, 48);
  private readonly plateGeometry = new THREE.CircleGeometry(FIELD.discRadius + 1.6, 48);
  private plateMaterials: Partial<Record<BotaoSide, THREE.MeshBasicMaterial>> = {};
  private readonly markerTexture: THREE.Texture;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  /**
   * Clima de luz sem luz nova: o gol tinge o céu com a cor do time e a festa
   * escurece o estádio para o holofote do autor brilhar. Trocar intensidade é
   * só uniform; uma PointLight a mais pesaria em todo pixel a partida inteira.
   */
  private glow = 0;
  private readonly glowColor = new THREE.Color();
  private readonly skyColor = new THREE.Color(HEMISPHERE_SKY);
  private dim = 0;
  private readonly cleanup: Array<() => void> = [];
  private readonly projected = new THREE.Vector3();
  private readonly fitPoints: THREE.Vector3[];

  private width = 0;
  private height = 0;
  // Enquadramento: centro do campo no jogo corrido, a área no pênalti.
  private readonly target = new THREE.Vector3();
  private readonly targetGoal = new THREE.Vector3();
  private focusZoom = 1;
  private focusZoomGoal = 1;
  private cameraKey = "";
  private cameraEase = 8;
  private yaw = 0;
  private yawTarget: number | null = null;
  private pitch = DEFAULT_PITCH;
  private pitchTarget: number | null = null;
  private zoom = 1;
  /** Zoom para onde a câmera desliza (volta do modo foto); roda e pinça mexem direto. */
  private zoomTarget: number | null = null;
  private baseYaw = 0;
  private fitKey = "";
  private fitDistance = 900;
  private shake = 0;
  private hoverId: string | null = null;
  private orbit: { x: number; y: number; yaw: number; pitch: number } | null = null;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private gesture: { angle: number; distance: number; yaw: number; zoom: number } | null = null;
  private gestureLatched = false;

  // Leitura do estado entre quadros.
  private lastPhase = "";
  private lastTurns = -1;
  private lastBallX = 0;
  private lastBallZ = 0;
  private ballVX = 0;
  private ballVZ = 0;
  private ballDisplayX = 0;
  private ballDisplayZ = 0;
  private ballInNet: { vx: number; vz: number; top: boolean; hit: boolean } | null = null;
  private ballInitialized = false;
  private penaltyOutcome: "scored" | "saved" | null = null;
  private penaltyKey = "";
  private time = 0;

  // Comemorações: quem corre para onde, câmera de perto, câmera lenta do gol.
  private readonly choreo = new Choreographer();
  private readonly effects: Effects;
  /** Raio, aura e brilhos das comemorações de assinatura (dirigidos pelas marcas do boneco). */
  private readonly fx: CelebrationFx;
  /** Drama do pênalti da CPU em andamento (a câmera fecha depois de assentar atrás do batedor). */
  private windupActive = false;
  private windupFraming = false;
  private drumrollKey = "";
  private directives: Map<string, Directive> | null = null;
  private slowMo = -1;
  private showYawBase = 0;
  private yawBeforeShow: number | null = null;
  private finalStarted = false;
  private goalShowStarted = false;
  /** A câmera já devolveu a vista de jogo nesta festa: não volta a mergulhar nela. */
  private showReleased = false;
  /** Pênalti por demora convertido: o motor tira o goleiro, a tela o mantém até a saída. */
  private heldKeeperSide: BotaoSide | null = null;
  /** Rastro congelado na hora em que o pênalti se decide (o motor segue rolando a bola). */
  private frozenTrail: Array<{ x: number; y: number }> | null = null;
  private lastPenaltyShooterId: string | null = null;
  private photo = false;
  private photoSaved: { yaw: number; pitch: number; zoom: number } | null = null;
  /** Mexeu na câmera durante a pausa (roda, pinça, botão direito): o modo foto para de puxar zoom e altura. */
  private photoTouched = false;
  private contextLost = false;
  /** Texturas esperando subir para a GPU em momento calmo (mira), 2 por quadro. */
  private readonly prewarm: THREE.Texture[] = [];
  private calmFrames = 0;
  private rain: { colors: string[]; in: number } | null = null;
  private readonly trailTint = new THREE.Color();
  private keeperDiveLatch: number | null = null;
  private anticipatedKick = "";
  private lastKeeperDive = 0;
  private penaltyBallSpeed = 0;
  private nearMiss: BotaoSide | null = null;
  private postThisShot = false;
  private sizeDirty = true;
  private alwaysMeasure = false;
  private readonly sunOffset = new THREE.Vector3(-170, 430, 210);
  private readonly shadowCenter = new THREE.Vector3();
  /** Onde estava a caixa da sombra no último mapa desenhado. */
  private readonly shadowDrawn = new THREE.Vector3(Infinity, 0, Infinity);
  private shadowDrawnExtent = 0;
  private shadowParity = false;
  private readonly markerWorld = new THREE.Vector3();
  private readonly cameraRight = new THREE.Vector3();
  private sparkleClock = 0;
  /** Reações curtas fora da comemoração (trave: mãos na cabeça). */
  private readonly reactions = new Map<string, { action: FigureAction; until: number }>();
  private readonly lastVelocity = new Map<string, { vx: number; vz: number }>();
  private readonly trotters: Entry[] = [];
  /** Modo desempenho 3D (fixo por visão: a partida refaz a visão para trocar). */
  private readonly lite: boolean;
  private disposed = false;
  /** Tela de toque (celular/tablet): orçamento de pixels menor e MSAA mantido no modo desempenho. */
  private readonly coarse: boolean;
  /** Teto de pixels pelo tamanho do canvas; no modo desempenho a resolução anda abaixo dele. */
  private maxPixelRatio: number;
  private pixelRatio: number;
  private frameAverage = 1 / 60;
  /** CPU gasta no render (média): separa "aparelho lento" de "tela travada em 30 Hz". */
  private renderCost = 0;
  private resolutionClock = 0;
  /** Ritmo antes da última descida: se baixar a resolução não ajudou, o gargalo é a CPU. */
  private averageBeforeDrop: number | null = null;
  private resolutionMisses = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly setup: BotaoMatchSetup,
    private options: Botao3DOptions,
  ) {
    const lite = options.performance === true;
    this.lite = lite;
    this.coarse = window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 600;
    // Modo desempenho: sem o passe de sombra e com orçamento de pixels. No
    // celular o MSAA resolve dentro do tile da GPU (quase de graça) e fica; no
    // desktop ele custa banda de memória e sai (o contexto já nasce assim).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite || this.coarse, powerPreference: "high-performance" });
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    // Conferir cada shader compilado custa uma ida e volta síncrona à GPU; só em desenvolvimento.
    this.renderer.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.renderer.shadowMap.enabled = !lite;
    // PCF direto: o r186 tirou o PCFSoft e trocava por PCF no primeiro quadro de
    // sombra, mudando a chave de todo shader (o compileAsync compilava à toa).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color("#0a1219");
    this.scene.fog = new THREE.Fog("#0a1219", 900, 2400);

    this.hemisphere = new THREE.HemisphereLight(HEMISPHERE_SKY, "#1d3322", HEMISPHERE_INTENSITY);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight("#fff3df", SUN_INTENSITY);
    this.sun.position.set(-170, 430, 210);
    this.sun.castShadow = !lite;
    // O mapa de sombra é refeito sob demanda (ver render): parado, não refaz.
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -230;
    shadowCamera.right = 230;
    shadowCamera.top = 300;
    shadowCamera.bottom = -300;
    shadowCamera.near = 100;
    shadowCamera.far = 1100;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight("#9cc3ff", 0.55);
    fill.position.set(220, 260, -260);
    this.scene.add(fill);

    this.stadium = new Stadium(setup, this.renderer.capabilities.getMaxAnisotropy(), { reducedMotion: options.reducedMotion, performance: lite });
    this.scene.add(this.stadium.group);
    // Placas de LED e flashes sobem para a GPU agora, não no quadro do gol.
    this.stadium.prepare(this.renderer);
    this.ball = new BallView(FIELD.ballRadius, { reducedMotion: options.reducedMotion, performance: lite });
    this.scene.add(this.ball.root, this.aim.group, this.trail.mesh);
    this.confetti = new Confetti(options.reducedMotion ? 80 : lite ? 110 : 240);
    this.scene.add(this.confetti.mesh);
    this.effects = new Effects({
      surface: fieldThemeForMatch(setup) === "futsal-blue" ? "futsal" : "grass",
      reducedMotion: options.reducedMotion,
      lowPower: small,
      performance: lite,
    });
    this.scene.add(this.effects.group);
    this.fx = new CelebrationFx(this.effects, { lite, reducedMotion: options.reducedMotion === true });
    this.markerTexture = labelTexture("VC", "#10271d", "#ffc72c");
    // A torcida faz uma ola enquanto a câmera desce para a mesa.
    if (!options.reducedMotion) this.stadium.wave();

    this.fitPoints = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.fitPoints.push(new THREE.Vector3(sx * (HALF_W + 8), 0, sz * (HALF_H + FIELD.goalDepth + 6)));
        this.fitPoints.push(new THREE.Vector3(sx * HALF_W, FIGURE_HEIGHT * 0.8, sz * HALF_H));
      }
    }
    for (const sz of [-1, 1]) this.fitPoints.push(new THREE.Vector3(0, GOAL_HEIGHT, sz * HALF_H));

    this.setLandscape(options.landscape);
    this.installDevHook();
    // Entrada de transmissão: começa baixa e de lado, e desce até a mesa.
    if (!options.reducedMotion && !options.skipIntro) {
      this.yaw = this.baseYaw - 0.95;
      this.pitch = 1.0;
      this.focusZoom = 1.55;
      this.cameraEase = 1.9;
    } else {
      this.yaw = this.baseYaw;
    }
    this.bindInput();
  }

  // ------------------------------------------------------------ câmera

  setLandscape(landscape: boolean) {
    this.options = { ...this.options, landscape };
    // Convidado do Bobonline: a vista padrão é do outro gol (meia-volta), deitada ou em pé.
    const turn = (landscape ? Math.PI / 2 : 0) + (this.options.flip ? Math.PI : 0) - this.baseYaw;
    this.baseYaw += turn;
    // O que estava guardado para depois (festa, modo foto) gira junto com o campo.
    if (this.yawBeforeShow !== null) this.yawBeforeShow += turn;
    // O ângulo do pênalti é o de trás do batedor, não depende do lado da tela.
    if (this.photoSaved && !this.cameraKey.startsWith("penalty")) this.photoSaved.yaw += turn;
    // Festa, pênalti e modo foto têm enquadramento próprio; o novo ângulo vale na volta.
    if (this.photo || this.cameraKey.startsWith("show") || this.cameraKey.startsWith("penalty")) return;
    this.yawTarget = this.baseYaw;
    this.pitchTarget = DEFAULT_PITCH;
  }

  /**
   * A câmera chegou ao enquadramento pedido: giro a menos de 0,05 rad do alvo e
   * centro a menos de 6 unidades. O drama do pênalti da CPU espera isto (a volta
   * de 180° depois do chute do humano, a entrada do pênalti por demora).
   */
  cameraSettled(): boolean {
    const yawDone = this.yawTarget === null || Math.abs(angleDelta(this.yaw, this.yawTarget)) < 0.05;
    return yawDone && this.target.distanceTo(this.targetGoal) < 6;
  }

  /**
   * Pênalti da CPU no 3D: suspense de 1,3 a 2,3 s além de `baseMs`. Math.random e não a
   * rng da partida: o chute gasta a mesma rng no 2D e no 3D, só o momento (e o goleiro
   * naquele instante) muda.
   */
  cpuPenaltyWindup(shooterId: string, baseMs: number): CpuPenaltyWindup {
    return { shooterId, totalMs: baseMs + (CPU_PENALTY_DRAMA_MS + Math.random() * CPU_PENALTY_DRAMA_JITTER_MS), elapsedMs: 0, settleMs: 0 };
  }

  /** Tempo do drama acabado: quanto ainda esperar a câmera chegar atrás do batedor (0 = bate já; no máximo 700 ms no todo). */
  windupSettleWait(windup: CpuPenaltyWindup): number {
    if (windup.settleMs >= CAMERA_SETTLE_MAX_MS || this.cameraSettled()) return 0;
    windup.settleMs += CAMERA_SETTLE_POLL_MS;
    return CAMERA_SETTLE_POLL_MS;
  }

  /**
   * Quanto a comemoração longa do autor do último gol (Kamehameha, Super Saiyajin)
   * estica a pausa do gol e o apito final. Fora do online só o 3D espera por ela,
   * então a conta mora aqui, no pedaço do 3D, e não no pacote das rotas offline.
   */
  celebrationExtensionMs(state: BotaoMatchState): number {
    return goalCelebrationExtensionMs(state.setup, state, { scorerId: state.touches.at(-1)?.bodyId ?? null, ownGoal: state.lastGoal?.ownGoal ?? false });
  }

  resetCamera() {
    if (this.photo) {
      // Pausado, o modo foto continua girando; o ângulo centralizado vale ao retomar.
      this.photoSaved = { yaw: this.baseYaw, pitch: DEFAULT_PITCH, zoom: 1 };
      if (this.yawBeforeShow !== null) this.yawBeforeShow = this.baseYaw;
      this.photoTouched = false;
      return;
    }
    this.zoomTarget = 1;
    // Reaplica o enquadramento do momento (jogo corrido ou pênalti).
    this.cameraKey = "";
    this.yawBeforeShow = this.baseYaw;
    this.yawTarget = this.baseYaw;
    this.pitchTarget = DEFAULT_PITCH;
  }

  /** Muda o enquadramento quando o momento da partida muda; o giro do jogador continua livre. */
  private frameMoment(state: BotaoMatchState, shot: CameraShot | null) {
    // Modo foto (pausa): a órbita lenta manda; nada de reenquadrar.
    if (this.photo) return;
    // Comemoração: a câmera desce e acompanha quem está no centro da festa.
    if (shot) {
      const key = `show|${this.choreo.kind}`;
      if (key !== this.cameraKey) {
        // O ângulo do pênalti não é do jogador: depois da festa a vista volta ao padrão.
        if (!this.cameraKey.startsWith("show")) {
          this.yawBeforeShow = this.cameraKey.startsWith("penalty") ? null : this.yawTarget ?? this.yaw;
        }
        this.showYawBase = this.yaw;
        this.cameraKey = key;
      }
      const calm = this.options.reducedMotion;
      const orbit = calm ? 0 : shot.orbit;
      this.targetGoal.set(shot.x, 0, shot.z);
      this.focusZoomGoal = calm ? Math.min(1.7, shot.zoom) : shot.zoom;
      if (this.orbit || this.gesture) {
        // O botão direito continua mandando: a órbita da câmera parte de onde ele deixar.
        this.showYawBase = this.yaw - orbit;
        this.yawTarget = null;
        this.pitchTarget = null;
      } else {
        this.pitchTarget = shot.pitch;
        this.yawTarget = this.showYawBase + orbit;
      }
      return;
    }
    const penalties = state.phase === "penalties" ? state.penalties : null;
    const key = penalties ? `penalty|${penalties.round}|${penalties.turn}` : "play";
    if (key === this.cameraKey) return;
    const previous = this.cameraKey;
    this.cameraKey = key;
    if (penalties) {
      // Atrás e um pouco ao lado do batedor, para ele não cobrir a bola.
      const top = penalties.turn === "user";
      this.targetGoal.set(0, 0, (top ? -1 : 1) * HALF_H * 0.74);
      this.focusZoomGoal = 2.05;
      this.yawTarget = (top ? 0 : Math.PI) + 0.42;
      this.pitchTarget = 0.82;
    } else {
      this.targetGoal.set(0, 0, 0);
      this.focusZoomGoal = 1;
      if (previous.startsWith("penalty") || previous === "") {
        this.yawTarget = this.baseYaw;
        this.pitchTarget = DEFAULT_PITCH;
      } else if (previous.startsWith("show")) {
        // Fim da festa: devolve o ângulo que o jogador tinha escolhido.
        this.yawTarget = this.yawBeforeShow ?? this.baseYaw;
        this.pitchTarget = DEFAULT_PITCH;
      }
      this.yawBeforeShow = null;
    }
  }

  /**
   * Pausa no 3D vira "modo foto": tudo congela no meio da pose (até o confete
   * no ar) e a câmera gira devagar em volta — bom para falar com quem assiste.
   * Ao despausar, volta ao ângulo de antes.
   */
  private updatePhotoMode(paused: boolean, dt: number) {
    if (paused !== this.photo) {
      this.photo = paused;
      if (paused) {
        this.photoTouched = false;
        this.photoSaved = { yaw: this.yawTarget ?? this.yaw, pitch: this.pitchTarget ?? this.pitch, zoom: this.zoomTarget ?? this.zoom };
      } else if (this.photoSaved) {
        this.yawTarget = this.photoSaved.yaw;
        this.pitchTarget = this.photoSaved.pitch;
        this.zoomTarget = this.photoSaved.zoom;
        this.photoSaved = null;
      }
    }
    if (!this.photo || this.options.reducedMotion || this.orbit || this.gesture) return;
    this.yawTarget = null;
    this.yaw += dt * 0.14;
    if (this.photoTouched) return;
    this.zoomTarget = null;
    this.pitchTarget = 0.82;
    this.zoom += (1.3 - this.zoom) * (1 - Math.exp(-dt * 1.5));
  }

  private placeCamera(distance: number, target?: THREE.Vector3) {
    const sinPitch = Math.sin(this.pitch);
    this.camera.position.set(
      Math.sin(this.yaw) * sinPitch * distance,
      Math.cos(this.pitch) * distance,
      Math.cos(this.yaw) * sinPitch * distance,
    );
    if (target) this.camera.position.add(target);
    this.camera.up.set(0, 1, 0);
    // Olhando quase reto para baixo o "para cima" da tela segue o yaw.
    if (this.pitch < 0.02) this.camera.up.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (target) this.camera.lookAt(target);
    else this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  /** Distância que enquadra a mesa inteira para o giro e a proporção atuais. */
  private fit() {
    const key = `${this.yaw.toFixed(3)}|${this.pitch.toFixed(3)}|${this.camera.aspect.toFixed(3)}`;
    if (key === this.fitKey) return this.fitDistance;
    let distance = this.fitDistance;
    for (let iteration = 0; iteration < 6; iteration += 1) {
      this.placeCamera(distance);
      let extent = 0;
      for (const point of this.fitPoints) {
        this.projected.copy(point).project(this.camera);
        extent = Math.max(extent, Math.abs(this.projected.x), Math.abs(this.projected.y));
      }
      distance *= extent / 0.96;
    }
    this.fitKey = key;
    this.fitDistance = distance;
    return distance;
  }

  private updateCamera(dt: number) {
    // A entrada começa lenta e o resto da partida responde rápido.
    this.cameraEase = Math.min(8, this.cameraEase + dt * 2.2);
    const turn = 1 - Math.exp(-dt * this.cameraEase);
    // Com o botão direito ou dois dedos no canvas quem manda é a mão: os alvos
    // ficam guardados e só valem quando ela soltar (senão a câmera treme entre os dois).
    const dragging = this.orbit !== null || this.gesture !== null;
    if (this.zoomTarget !== null && !dragging) {
      this.zoom += (this.zoomTarget - this.zoom) * turn;
      if (Math.abs(this.zoomTarget - this.zoom) < 0.002) {
        this.zoom = this.zoomTarget;
        this.zoomTarget = null;
      }
    }
    if (this.yawTarget !== null && !dragging) {
      const delta = angleDelta(this.yaw, this.yawTarget);
      this.yaw += delta * turn;
      if (Math.abs(delta) < 0.002) {
        this.yaw = this.yawTarget;
        this.yawTarget = null;
      }
    }
    if (this.pitchTarget !== null && !dragging) {
      this.pitch += (this.pitchTarget - this.pitch) * turn;
      if (Math.abs(this.pitchTarget - this.pitch) < 0.002) {
        this.pitch = this.pitchTarget;
        this.pitchTarget = null;
      }
    }
    // Seguindo um jogador a câmera anda um pouco mais rápido (atraso de cinegrafista).
    const follow = this.choreo.active ? 4.2 : 3.2;
    const ease = 1 - Math.exp(-dt * Math.min(follow, this.cameraEase));
    this.target.lerp(this.targetGoal, ease);
    this.focusZoom += (this.focusZoomGoal - this.focusZoom) * ease;
    const distance = this.fit() / (this.zoom * this.focusZoom);
    this.placeCamera(distance, this.target);
    // Neblina medida a partir da câmera: no celular em pé ela estava a 1.300 de
    // distância e a neblina fixa (começando em 900) apagava o fundo do campo.
    const fog = this.scene.fog as THREE.Fog;
    fog.near = distance + 350;
    fog.far = distance + 1700;
    // Sombra nítida no close: a caixa da sombra encolhe junto com o plano.
    const extent = Math.max(150, Math.min(300, 300 / Math.max(1, this.focusZoom * this.zoom * 0.8)));
    const shadow = this.sun.shadow.camera;
    if (Math.abs(shadow.top - extent) > 2) {
      shadow.top = extent;
      shadow.bottom = -extent;
      shadow.left = -extent * 0.77;
      shadow.right = extent * 0.77;
      shadow.updateProjectionMatrix();
    }
    // Câmera inclinada vê mais chão além do alvo do que aquém: no close a caixa
    // da sombra anda para o fundo do quadro (na vista inteira ela já cobre tudo).
    // Fica dentro do campo: perto da linha de fundo, deslocar jogaria a caixa na arquibancada
    // (e no pênalti ela ainda precisa alcançar a fila do meio-campo).
    const beyond = (300 - extent) * 0.45 * Math.sin(this.pitch);
    this.shadowCenter.set(
      Math.max(-HALF_W + 50, Math.min(HALF_W - 50, this.target.x - Math.sin(this.yaw) * beyond)),
      0,
      Math.max(-HALF_H + 100, Math.min(HALF_H - 100, this.target.z - Math.cos(this.yaw) * beyond)),
    );
    this.sun.position.copy(this.shadowCenter).add(this.sunOffset);
    this.sun.target.position.copy(this.shadowCenter);
    this.sun.target.updateMatrixWorld();
    if (this.shake > 0 && !this.options.reducedMotion) {
      // Proporcional à distância: no close a mesma tremida seria 4–5× mais violenta.
      const amount = this.shake * this.shake * 5 * Math.min(1, distance / this.fitDistance);
      this.camera.position.x += (Math.random() - 0.5) * amount;
      this.camera.position.y += (Math.random() - 0.5) * amount;
      this.camera.position.z += (Math.random() - 0.5) * amount;
      this.camera.updateMatrixWorld();
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  // ------------------------------------------------------------ entrada

  private bindInput() {
    const canvas = this.canvas;
    const onContextMenu = (event: Event) => event.preventDefault();
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.touches.size === 2) this.startGesture();
        return;
      }
      if (event.button === 2) {
        this.orbit = { x: event.clientX, y: event.clientY, yaw: this.yaw, pitch: this.pitch };
        this.yawTarget = null;
        this.pitchTarget = null;
        if (this.photo) this.photoTouched = true;
        try { canvas.setPointerCapture(event.pointerId); } catch { /* captura é opcional */ }
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        if (!this.touches.has(event.pointerId)) return;
        this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.gesture && this.touches.size >= 2) this.moveGesture();
        return;
      }
      if (!this.orbit) return;
      if ((event.buttons & 2) === 0) {
        this.orbit = null;
        return;
      }
      const dx = event.clientX - this.orbit.x;
      const dy = event.clientY - this.orbit.y;
      this.yaw = this.orbit.yaw - dx * 0.0085;
      this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.orbit.pitch + dy * 0.0042));
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        this.touches.delete(event.pointerId);
        if (this.touches.size < 2) this.gesture = null;
        if (this.touches.size === 0) this.gestureLatched = false;
        return;
      }
      if ((event.buttons & 2) === 0) this.orbit = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      this.zoomTarget = null;
      if (this.photo) this.photoTouched = true;
      this.zoom = Math.max(0.7, Math.min(2.6, this.zoom * Math.exp(-event.deltaY * 0.0011)));
    };
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
    // Perda de contexto (Android): para de desenhar e avisa a partida, que recria a visão.
    // O dispose remove este ouvinte antes de forçar a perda, então ele não se dispara sozinho.
    const onContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      this.options.onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    this.cleanup.push(() => canvas.removeEventListener("webglcontextlost", onContextLost));
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    this.cleanup.push(() => {
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    });
  }

  private touchPair() {
    const [a, b] = [...this.touches.values()];
    return { angle: Math.atan2(b.y - a.y, b.x - a.x), distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
  }

  private startGesture() {
    const pair = this.touchPair();
    this.gesture = { angle: pair.angle, distance: pair.distance, yaw: this.yaw, zoom: this.zoom };
    this.gestureLatched = true;
    this.yawTarget = null;
    this.zoomTarget = null;
    if (this.photo) this.photoTouched = true;
    this.options.onGesture?.();
  }

  private moveGesture() {
    if (!this.gesture) return;
    const pair = this.touchPair();
    this.yaw = this.gesture.yaw + angleDelta(this.gesture.angle, pair.angle);
    this.zoom = Math.max(0.7, Math.min(2.6, this.gesture.zoom * (pair.distance / this.gesture.distance)));
  }

  /** Dois dedos (ou o resto deles) não podem virar mira. */
  isGesturing() {
    return this.gestureLatched || this.touches.size >= 2;
  }

  isOrbiting() {
    return this.orbit !== null;
  }

  private ray(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }

  /** Ponto do campo sob o cursor, na altura da cintura dos bonecos. */
  fieldPoint(clientX: number, clientY: number): { x: number; y: number } {
    const hit = new THREE.Vector3();
    const ray = this.ray(clientX, clientY);
    if (!ray.intersectPlane(this.pickPlane, hit)) {
      return { x: -9999, y: -9999 };
    }
    return { x: hit.x + HALF_W, y: hit.z + HALF_H };
  }

  /** Boneco sob o cursor (cabeça, tronco ou pés). */
  pickBodyId(clientX: number, clientY: number): string | null {
    const ray = this.ray(clientX, clientY);
    const bottom = new THREE.Vector3();
    const top = new THREE.Vector3();
    const onRay = new THREE.Vector3();
    // Acerto em cheio (o raio passa pelo corpo): vale o da frente, que tapa o de trás.
    // De raspão (só dentro da base de botão): vale o mais centrado, não o mais perto
    // da câmera — senão um companheiro na frente rouba o toque no peito do outro.
    const onAxis = new THREE.Vector3();
    const reach = FIELD.discRadius + 2;
    let direct: { id: string; along: number } | null = null;
    let graze: { id: string; distanceSq: number } | null = null;
    for (const entry of this.entries.values()) {
      if (!entry.figure.root.visible || entry.side === null) continue;
      // Trotando para a formação, vale onde o disco já está (é de lá que sai o chute).
      const x = entry.chasing ? entry.engineX : entry.x;
      const z = entry.chasing ? entry.engineZ : entry.z;
      bottom.set(x, 0, z);
      top.set(x, FIGURE_HEIGHT, z);
      const distanceSq = ray.distanceSqToSegment(bottom, top, onRay, onAxis);
      if (distanceSq > reach * reach) continue;
      // Na altura dos braços o boneco é mais largo do que na cabeça e nas pernas.
      const body = onAxis.y > FIGURE_HEIGHT * 0.36 && onAxis.y < FIGURE_HEIGHT * 0.78 ? 10 : 6;
      if (distanceSq <= body * body) {
        const along = onRay.distanceTo(ray.origin);
        if (!direct || along < direct.along) direct = { id: entry.id, along };
      } else if (!graze || distanceSq < graze.distanceSq) {
        graze = { id: entry.id, distanceSq };
      }
    }
    return direct?.id ?? graze?.id ?? null;
  }

  setHover(id: string | null) {
    this.hoverId = id;
  }

  // ------------------------------------------------------------ eventos

  handleEvents(events: BotaoEvent[], state: BotaoMatchState) {
    for (const event of events) {
      if (event.type === "goal") this.celebrateGoal(state, event.side, event.ownGoal);
      if (event.type === "post") {
        const ball = state.bodies.find((body) => body.kind === "ball");
        if (!ball) continue;
        const top = ball.y < FIELD.height / 2;
        this.postThisShot = true;
        this.stadium.goal(top ? "top" : "bottom").wobble();
        this.stadium.crowdReact("ooh", event.side);
        const postX = ball.x < FIELD.width / 2 ? toWorldX(GOAL_LEFT) : toWorldX(GOAL_RIGHT);
        this.effects.impact(postX, FIELD.ballRadius, top ? -HALF_H : HALF_H, 1, "#fff6cf");
        this.shake = Math.max(this.shake, 0.35);
        // Quem atacou leva as mãos à cabeça; o goleiro adversário respira.
        for (const body of state.bodies) {
          if (body.kind !== "disc" || body.side !== event.side) continue;
          if (Math.hypot(body.vx, body.vy) > 30) continue;
          this.reactions.set(body.id, { action: "handsOnHead", until: this.time + 1.3 });
        }
      }
    }
  }

  /** Tudo que um gol dispara no 3D: estádio, luz, confete e a coreografia. */
  private celebrateGoal(state: BotaoMatchState, side: BotaoSide, ownGoal: boolean, scorerOverride: string | null = null) {
    this.shake = 1;
    this.stadium.celebrate(side);
    const top = side === "user";
    const team = side === "user" ? this.setup.userTeam : this.setup.cpuTeam;
    const ball = state.bodies.find((body) => body.kind === "ball");
    const x = ball ? Math.max(-FIELD.goalWidth / 2, Math.min(FIELD.goalWidth / 2, toWorldX(ball.x))) : 0;
    const goalZ = top ? -HALF_H : HALF_H;
    const colors = [team.primary, team.secondary, "#ffc72c", "#ffffff"];
    this.confetti.burst(x, goalZ, top ? 1 : -1, colors);
    // Meio segundo depois chove papel em volta de quem marcou (o close já está nele).
    this.rain = { colors, in: 0.55 };
    this.glow = 1;
    this.glowColor.set(team.primary);
    this.stadium.goalShow(side, team.primary);
    this.stadium.cameraFlashes(side, 3.2);
    this.stadium.crowdReact("groan", side === "user" ? "cpu" : "user");
    this.effects.shockwave(x, goalZ + (top ? 4 : -4), team.primary, 70);
    this.startGoalShow(state, side, ownGoal, scorerOverride);
  }

  /** Monta a festa do gol a partir das posições que estão na tela agora. */
  private startGoalShow(state: BotaoMatchState, side: BotaoSide, ownGoal: boolean, scorerOverride: string | null) {
    const lastTouch = scorerOverride ?? state.touches.at(-1)?.bodyId ?? null;
    const actors = this.actors(state);
    const total = state.score.user + state.score.cpu;
    const seed = hashString(`${this.setup.matchId}|${total}|${state.timeline.length}`);
    // Elenco nomeado (Bobonline): cada botão tem a comemoração que o dono escolheu ("Variada" sorteia no bolo do Bobonline).
    const setup = this.setup;
    const signatureFor = usesSquads(setup)
      ? (actorId: string) => {
          const body = state.bodies.find((candidate) => candidate.id === actorId);
          return squadCelebrationFor(celebrationIdOf(body ? bodyAppearance(setup, body) : null), actorId, seed);
        }
      : undefined;
    this.choreo.startGoal({
      side,
      scorerId: ownGoal ? null : lastTouch,
      ownGoalId: ownGoal ? lastTouch : null,
      ball: { x: this.ballDisplayX, z: this.ballDisplayZ },
      actors,
      cameraYaw: this.yaw,
      seed,
      signature: this.signatureCelebration(state),
      signatureFor,
      aspect: this.camera.aspect,
    });
    this.goalShowStarted = true;
    this.showReleased = false;
    this.reactions.clear();
    // Câmera lenta só no instante em que a bola entra.
    if (!this.options.reducedMotion) this.slowMo = 0;
  }

  /**
   * Comemoração que o usuário escolheu para o próprio jogador no criador. A
   * coreografia só usa quando é ele quem marca; null (ou "Variada") mantém o sorteio.
   */
  private signatureCelebration(state: BotaoMatchState) {
    const body = state.bodies.find((candidate) => candidate.kind === "disc" && candidate.isUserPlayer);
    if (!body) return null;
    // Com os personagens desligados o rosto some, mas a comemoração escolhida continua valendo.
    return goalCelebrationOf(celebrationIdOf(bodyAppearance(this.setup, body) ?? this.setup.visuals?.player ?? null));
  }

  /** Quem está em campo agora, na posição que aparece na tela. */
  private actors(state: BotaoMatchState): Actor[] {
    const actors: Actor[] = [];
    for (const body of state.bodies) {
      if (body.kind !== "disc") continue;
      const entry = this.entries.get(body.id);
      if (!entry) continue;
      actors.push({ id: entry.id, side: body.side, x: entry.x, z: entry.z, isUser: body.isUserPlayer });
    }
    for (const keeper of Object.values(this.keepers)) {
      if (keeper?.figure.root.visible) actors.push({ id: keeper.id, side: keeper.side, x: keeper.x, z: keeper.z, keeper: true });
    }
    return actors;
  }

  // ------------------------------------------------------------ figuras

  private readonly appearanceKeys = new WeakMap<PlayerAppearance, string>();

  private appearanceFor(body: BotaoBody): { appearance: PlayerAppearance; key: string } {
    const team = body.side === "user" ? this.setup.userTeam : this.setup.cpuTeam;
    const real = bodyAppearance(this.setup, body);
    if (real) {
      let serialized = this.appearanceKeys.get(real);
      if (!serialized) {
        serialized = JSON.stringify(real);
        this.appearanceKeys.set(real, serialized);
      }
      return { appearance: real, key: `${body.playerId ?? body.id}|${serialized}` };
    }
    // Sem personagens ligados: cada camisa ganha um rosto fixo da própria equipe.
    const seed = hashString(`${this.setup.seed}|${team.id}|${body.side}|${body.number}`);
    const appearance = { ...randomPlayerAppearance(seed), kitPattern: teamKitPattern(this.setup.seed, team.id) };
    return { appearance, key: `${body.id}|${body.number}|generated` };
  }

  private keeperColor(side: BotaoSide) {
    const own = side === "user" ? this.setup.userTeam : this.setup.cpuTeam;
    const rival = side === "user" ? this.setup.cpuTeam : this.setup.userTeam;
    return KEEPER_COLORS
      .map((color) => ({ color, distance: Math.min(kitDistance(color, own.primary), kitDistance(color, rival.primary)) }))
      .sort((a, b) => b.distance - a.distance)[0].color;
  }

  /** Um material por time, dividido por todos os bonecos dele. */
  private plateMaterial(side: BotaoSide) {
    let material = this.plateMaterials[side];
    if (!material) {
      const team = side === "user" ? this.setup.userTeam : this.setup.cpuTeam;
      const glossy = side === "user" && !this.options.hideUserMarker;
      // Camisa da cor do piso (verde na grama, azul no futsal) sumiria na base:
      // clareia só o disco, o uniforme continua o mesmo.
      const floor = fieldThemeForMatch(this.setup) === "futsal-blue" ? "#126795" : "#145c3a";
      const body = kitDistance(team.primary, floor) < 90 ? mixHex(team.primary, "#ffffff", 0.38) : team.primary;
      material = new THREE.MeshBasicMaterial({ map: plateTexture(body, team.secondary, glossy), transparent: true, depthWrite: false });
      this.plateMaterials[side] = material;
    }
    return material;
  }

  private createEntry(id: string, body: BotaoBody, keeper: boolean): Entry {
    const side = body.side;
    const team = side === "user" ? this.setup.userTeam : this.setup.cpuTeam;
    const { appearance, key } = keeper
      ? { appearance: { ...randomPlayerAppearance(hashString(`${this.setup.seed}|keeper|${team.id}`)), kitPattern: 1 }, key: `keeper-${side}` }
      : this.appearanceFor(body);
    const figure = new PlayerFigure({
      appearance,
      primary: team.primary,
      secondary: team.secondary,
      number: keeper ? 1 : body.number,
      keeper,
      keeperColor: keeper && side ? this.keeperColor(side) : undefined,
      captain: body.isUserPlayer && !this.options.hideUserMarker,
      performance: this.lite,
      seed: hashString(`${id}|${body.number}`),
    });
    let plate: THREE.Mesh | null = null;
    if (!keeper && side) {
      plate = new THREE.Mesh(this.plateGeometry, this.plateMaterial(side));
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = 0.18;
      plate.renderOrder = 2;
      figure.root.add(plate);
    }
    const ringMaterial = new THREE.MeshBasicMaterial({ color: team.primary, transparent: true, opacity: 0.35, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    ring.renderOrder = 3;
    figure.root.add(ring);
    let marker: THREE.Group | null = null;
    if (body.isUserPlayer && !this.options.hideUserMarker) {
      marker = new THREE.Group();
      // Só o selo, sem seta: vista quase de cima, a altura vira pouca distância na tela.
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTexture, depthTest: false, transparent: true }));
      label.scale.set(15, 7.5, 1);
      label.position.y = 16;
      label.renderOrder = 10;
      marker.add(label);
      marker.position.y = FIGURE_HEIGHT + 12;
      figure.root.add(marker);
    }
    this.scene.add(figure.root);
    // Rostos de grito/tristeza só aparecem no gol: sobem para a GPU antes, aos poucos.
    this.prewarm.push(...figure.textureList());
    const x = toWorldX(body.x);
    const z = toWorldZ(body.y);
    figure.root.position.set(x, 0, z);
    const facing = side === "user" ? Math.PI : 0;
    figure.snapYaw(facing);
    return {
      id,
      figure,
      plate,
      ring,
      ringMaterial,
      stamina: null,
      staminaValue: -1,
      marker,
      side,
      appearanceKey: key,
      x,
      z,
      engineX: x,
      engineZ: z,
      chaseSpeed: 0,
      chasing: false,
      offX: 0,
      offZ: 0,
      sepX: 0,
      sepZ: 0,
      identity: bodyIdentity(body),
      seen: true,
      idleDt: 0,
    };
  }

  private disposeEntry(entry: Entry) {
    this.scene.remove(entry.figure.root);
    entry.figure.dispose();
    entry.ringMaterial.dispose();
    if (entry.stamina) {
      entry.stamina.geometry.dispose();
      disposeMaterial(entry.stamina.material);
    }
    entry.marker?.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
        disposeMaterial(object.material);
      }
    });
  }

  private entryFor(body: BotaoBody): Entry {
    if (body.kind === "keeper" && body.side) {
      let keeper = this.keepers[body.side];
      if (!keeper) {
        keeper = this.createEntry(`keeper-${body.side}`, body, true);
        this.keepers[body.side] = keeper;
      }
      return keeper;
    }
    let entry = this.entries.get(body.id);
    // Só quando a peça muda (substituição no modo técnico) vale olhar a aparência de novo.
    const identity = bodyIdentity(body);
    if (entry && entry.identity !== identity) {
      if (entry.appearanceKey !== this.appearanceFor(body).key) {
        this.disposeEntry(entry);
        this.entries.delete(body.id);
        entry = undefined;
      } else {
        entry.identity = identity;
      }
    }
    if (!entry) {
      entry = this.createEntry(body.id, body, false);
      this.entries.set(body.id, entry);
    }
    return entry;
  }

  private updateStamina(entry: Entry, body: BotaoBody) {
    if (!body.playerId) return;
    const value = Math.round(Math.max(0, Math.min(100, body.stamina)));
    if (value === entry.staminaValue) return;
    entry.staminaValue = value;
    const color = value < 35 ? "#ff7c6e" : value < 60 ? "#ffc72c" : "#e6ebe6";
    if (!entry.stamina) {
      // Anel inteiro criado uma vez; o fôlego só muda o drawRange (6 índices por segmento).
      const geometry = new THREE.RingGeometry(FIELD.discRadius + 2, FIELD.discRadius + 3.6, STAMINA_SEGMENTS, 1, Math.PI / 2, Math.PI * 2);
      entry.stamina = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
      entry.stamina.rotation.x = -Math.PI / 2;
      entry.stamina.position.y = 0.3;
      entry.figure.root.add(entry.stamina);
    }
    entry.stamina.geometry.setDrawRange(0, Math.round((value / 100) * STAMINA_SEGMENTS) * 6);
    (entry.stamina.material as THREE.MeshBasicMaterial).color.set(color);
  }

  // ------------------------------------------------------------- quadro

  /**
   * `dt` é o tempo do jogo (0 quando pausado); `cameraDt` é o tempo real, para a
   * câmera continuar viva na pausa (modo foto) e fluida na câmera lenta.
   * `paused` vem da partida: um quadro com dt zero não liga o modo foto sozinho.
   * `throttled`: a partida desenha devagar de propósito (mesa coberta).
   */
  render(state: BotaoMatchState, view: BotaoRenderView, dt: number, cameraDt = dt, paused = dt === 0 && cameraDt > 0, throttled = false) {
    if (this.contextLost || this.disposed) return;
    const started = performance.now();
    const step = Math.min(dt, 0.05);
    const cameraStep = Math.min(cameraDt, 0.05);
    if (this.alwaysMeasure) this.sizeDirty = true;
    // Mesa coberta (intervalo, trocas): a partida desenha devagar de propósito; não é peso.
    if (this.lite && !paused && !throttled) this.adaptResolution(cameraDt);
    else if (throttled) {
      // Uma descida ainda sem avaliação não pode ficar para sempre: volta o degrau.
      if (this.averageBeforeDrop !== null) {
        this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
        this.renderer.setPixelRatio(this.pixelRatio);
      }
      this.resolutionClock = 0;
      this.averageBeforeDrop = null;
      this.frameAverage = 1 / 60;
    }
    this.updatePhotoMode(paused, cameraStep);
    // Câmera lenta do gol: só o desenho desacelera (o motor já está parado).
    let scale = 1;
    if (this.slowMo >= 0) {
      this.slowMo += step;
      scale = this.slowMo < 0.22 ? 0.28 : Math.min(1, 0.28 + ((this.slowMo - 0.22) / 0.2) * 0.72);
      if (this.slowMo > 0.42) this.slowMo = -1;
    }
    const sceneDt = step * scale;
    this.time += sceneDt;
    this.resize();

    // Igual ao 2D: goleiro e batedor só existem na fase de cobrança.
    const penaltyMode = state.phase === "penalties";
    const penalties = state.penalties;
    const shooter = penaltyMode && penalties ? penaltyShooter(state) : null;
    const keeperBody = penaltyMode && penalties ? penaltyKeeper(state) : null;
    const ball = state.bodies.find((body) => body.kind === "ball") ?? null;
    // Fim da disputa: o goleiro continua em cena para a festa (lido sem mexer no estado).
    const shootoutOver = state.phase === "finished" && state.result?.decision === "penalties";
    const stagedKeeper = keeperBody ?? (shootoutOver ? state.bodies.find((body) => body.kind === "keeper") ?? null : null);
    if (shooter) this.lastPenaltyShooterId = shooter.id;
    // Na última cobrança da disputa o resultado continua valendo: a bola fica na rede (ou na tabela).
    const penaltyScene = penaltyMode || shootoutOver;
    if (!penaltyScene) {
      // Pênaltis por demora repetem a mesma chave: cada cobrança começa limpa.
      this.penaltyKey = "";
      this.penaltyOutcome = null;
    }
    if (!penaltyScene || !this.penaltyOutcome) this.frozenTrail = null;
    // Drama do pênalti da CPU (§9): só com a cobrança armada e o batedor ainda parado.
    // O tempo chega cru (a BotaoMatch e o driver só guardam o relógio dele): progresso e segundos restantes saem aqui.
    const rawWindup = penaltyMode && penalties && !penalties.shotInFlight ? view.penaltyWindup ?? null : null;
    const windup = rawWindup
      ? {
          shooterId: rawWindup.shooterId,
          progress: Math.min(1, rawWindup.elapsedMs / Math.max(1, rawWindup.totalMs)),
          remainingS: Math.max(0, (rawWindup.totalMs - rawWindup.elapsedMs) / 1000),
        }
      : null;
    const keeperLook = windup && keeperBody ? { x: toWorldX(keeperBody.x), z: toWorldZ(keeperBody.y) } : null;
    if (windup && penalties) {
      // Banco de quem bate roendo as unhas, banco do goleiro batendo palmas.
      for (const body of state.bodies) {
        if (body.kind !== "disc" || body === shooter || !body.side) continue;
        this.reactions.set(body.id, { action: body.side === penalties.turn ? "nervous" : "clap", until: this.time + 0.25 });
      }
    }
    // Rufar do drama: uma vez por cobrança, e de novo no próximo pênalti por demora.
    const drumrollKey = drumrollKeyAfter(this.drumrollKey, penaltyScene, windup ? penalties : null, windup?.remainingS ?? Infinity);
    if (drumrollKey && drumrollKey !== this.drumrollKey) playSignatureSound("drumroll", 0.35);
    this.drumrollKey = drumrollKey;
    // Pênalti por demora convertido vira "goal" sem emitir evento: a festa sai daqui.
    if (state.phase === "goal" && state.lastGoal && !this.goalShowStarted) {
      this.celebrateGoal(state, state.lastGoal.side, state.lastGoal.ownGoal, this.lastPenaltyShooterId);
    }

    // ------------------------------------------------------------- bola
    // O resultado do pênalti sai antes da bola: no gol ela entra na rede neste mesmo quadro.
    if (penaltyMode && penalties) this.trackPenaltyOutcome(state, penalties.round, penalties.turn, ball, shooter, keeperBody);
    if (ball) this.updateBall(state, ball, sceneDt, step, penaltyScene);
    const ballLook = { x: this.ballDisplayX, z: this.ballDisplayZ };

    // Quem comemora e quem lamenta (reserva caso a coreografia não esteja rodando).
    let celebrateSide: BotaoSide | null = null;
    let scorerId: string | null = null;
    if (state.phase === "goal" && state.lastGoal) {
      celebrateSide = state.lastGoal.side;
      if (!state.lastGoal.ownGoal) scorerId = state.touches.at(-1)?.bodyId ?? null;
    } else if (state.phase === "finished" && state.result) {
      celebrateSide = state.result.outcome === "win" ? "user" : state.result.outcome === "loss" ? "cpu" : null;
    }
    this.updateShows(state, penaltyMode);
    const showing = this.choreo.active;
    this.directives = showing ? this.choreo.update(sceneDt, ballLook) : null;

    // Novo toque: arranque de quem foi tacado.
    const newShot = state.turns !== this.lastTurns && state.phase === "resolving";
    this.lastTurns = state.turns;

    const activeSide = state.phase === "aim" || state.phase === "kickoff" ? state.turn : null;
    const pulse = (Math.sin(this.time * 5.2) + 1) / 2;
    for (const entry of this.entries.values()) entry.seen = false;
    this.trotters.length = 0;

    const benchSlots: Record<BotaoSide, number> = { user: 0, cpu: 0 };
    let anyChasing = false;
    const penaltyGoalTop = penalties ? penalties.turn === "user" : true;

    for (const body of state.bodies) {
      if (body.kind !== "disc" && body.kind !== "keeper") continue;
      if (body.kind === "keeper" && body !== stagedKeeper) continue;
      const entry = this.entryFor(body);
      entry.seen = true;
      // Quem estava fora de cena (goleiro pré-montado, reserva que entrou) aparece já no lugar.
      const wasHidden = !entry.figure.root.visible;
      entry.figure.root.visible = true;
      const directive = this.directives?.get(entry.id) ?? null;

      // Posição de destino: o motor, ou a fila no meio-campo durante os pênaltis.
      let targetX = toWorldX(body.x);
      let targetZ = toWorldZ(body.y);
      // Drama: o batedor da CPU espera uns passos atrás da bola e só corre no fim da contagem.
      if (windup && body === shooter && windup.remainingS > WINDUP_RUN_IN_S) targetZ += penaltyGoalTop ? WINDUP_STEP_BACK : -WINDUP_STEP_BACK;
      let benched = false;
      if (penaltyMode && body.kind === "disc" && body !== shooter && body.side) {
        benched = true;
        const slot = benchSlots[body.side]++;
        const towards = body.side === "user" ? -1 : 1;
        targetX = towards * (18 + slot * 17);
        targetZ = penaltyGoalTop ? 22 : -22;
      }
      const engineJump = Math.hypot(targetX - entry.engineX, targetZ - entry.engineZ);
      entry.engineX = targetX;
      entry.engineZ = targetZ;
      // Só quem o motor está mexendo: o resto termina o trote em paz mesmo com a jogada rolando.
      const engineMoving = body.vx !== 0 || body.vy !== 0 || body.id === state.activeShotBodyId;
      const physicsMoving = (state.phase === "resolving" && !benched && engineMoving) || (penaltyMode && penalties?.shotInFlight && body === shooter);
      if (wasHidden && !directive) {
        entry.x = targetX;
        entry.z = targetZ;
        entry.chasing = false;
      }
      const away = Math.hypot(targetX - entry.x, targetZ - entry.z);
      if (directive) {
        // Comemoração: a posição na tela é da coreografia até a jogada voltar.
        entry.chasing = false;
        entry.x = directive.x;
        entry.z = directive.z;
      } else if (physicsMoving) {
        // A CPU pode tocar antes do trote acabar: o resto vira um deslocamento que some rápido.
        if (entry.chasing) {
          entry.offX = entry.x - targetX;
          entry.offZ = entry.z - targetZ;
          entry.chasing = false;
        }
        const settle = Math.exp(-step * (body.id === state.activeShotBodyId ? 26 : 12));
        entry.offX *= settle;
        entry.offZ *= settle;
        entry.x = targetX + entry.offX;
        entry.z = targetZ + entry.offZ;
      } else if (body.kind === "keeper") {
        // O goleiro é palheta: anda o tempo todo, sem trote. Um trote atrasado
        // (quadro longo no Android) o deixaria longe de onde ele de fato defende.
        entry.chasing = false;
        entry.x = targetX;
        entry.z = targetZ;
      } else if (!entry.chasing && engineJump <= 6 && (entry.offX !== 0 || entry.offZ !== 0)) {
        // Parou de ser empurrado: o resto do deslocamento some do mesmo jeito.
        const settle = Math.exp(-step * 12);
        entry.offX *= settle;
        entry.offZ *= settle;
        if (Math.abs(entry.offX) + Math.abs(entry.offZ) < 0.05) {
          entry.offX = 0;
          entry.offZ = 0;
        }
        entry.x = targetX + entry.offX;
        entry.z = targetZ + entry.offZ;
      } else if (engineJump > 6 || entry.chasing || away > 4) {
        // Teletransporte do motor (formação nova, pênalti) ou volta da festa: vira trote.
        if (!entry.chasing && away > 4) {
          entry.chasing = true;
          // A CPU toca ~0,43s depois de montar a cobrança (e na saída do 2º tempo):
          // quem pode ser tacado logo chega antes disso, os outros trotam com calma.
          const seconds = penaltyMode && body === shooter ? (windup ? 0.8 : 0.34) : state.phase === "kickoff" && !state.clockPausedForKickoff ? 0.42 : 0.8;
          entry.chaseSpeed = Math.max(95, away / seconds);
          entry.offX = 0;
          entry.offZ = 0;
        }
        if (entry.chasing) {
          const move = entry.chaseSpeed * sceneDt;
          if (away <= move || away < 0.5) {
            entry.x = targetX;
            entry.z = targetZ;
            entry.chasing = false;
          } else {
            entry.x += ((targetX - entry.x) / away) * move;
            entry.z += ((targetZ - entry.z) / away) * move;
          }
        } else {
          entry.x = targetX;
          entry.z = targetZ;
        }
      } else {
        entry.x = targetX;
        entry.z = targetZ;
      }
      if (entry.chasing) anyChasing = true;
      const flexible = !directive && !physicsMoving;
      if (flexible) this.trotters.push(entry);
      else {
        entry.sepX = 0;
        entry.sepZ = 0;
      }
      entry.figure.root.position.set(entry.x + entry.sepX, 0, entry.z + entry.sepZ);

      // ------------------------------------------------- intenção
      const natural = () => this.intentFor(state, view, body, entry, {
        celebrateSide,
        scorerId,
        activeSide,
        penaltyMode,
        shooter,
        benched,
        ballLook,
        penaltyGoalTop,
        windup,
        keeperLook,
      });
      let intent = directive?.intent ?? natural();
      // Pênalti decidido no meio do mergulho: o goleiro termina o mergulho antes de reagir.
      if (directive && body.kind === "keeper" && directive.intent.state === "keeper") {
        intent = { ...directive.intent, dive: natural().dive };
      }
      const reaction = directive ? null : this.reactions.get(body.id);
      if (reaction) {
        if (reaction.until < this.time) this.reactions.delete(body.id);
        else if (intent.state === "idle" || intent.state === "ready") intent = { ...intent, action: reaction.action };
      }
      if (newShot && state.activeShotBodyId === body.id) {
        entry.figure.triggerLunge();
        const speed = Math.hypot(body.vx, body.vy) || 1;
        // Torrão levanta atrás do pé de apoio no arranque.
        this.effects.kickPuff(entry.x, entry.z, Math.min(1, speed / 700), -body.vx / speed, -body.vy / speed);
      }
      if (penaltyMode && penalties?.shotInFlight && body === shooter && this.lastPhase !== "flight") {
        entry.figure.triggerLunge();
      }
      // O pé chega na bola ~0,12s depois do comando: quem foi tacado começa o
      // chute antes do contato previsto, para o golpe e a batida coincidirem.
      const kicking = (state.phase === "resolving" && state.activeShotBodyId === body.id) || (penaltyMode && penalties?.shotInFlight && body === shooter);
      const shotKey = `${state.turns}|${this.penaltyKey}|${body.id}`;
      if (kicking && ball && this.anticipatedKick !== shotKey) {
        const rx = ball.x - body.x;
        const ry = ball.y - body.y;
        const distance = Math.hypot(rx, ry);
        const closing = ((body.vx - ball.vx) * rx + (body.vy - ball.vy) * ry) / Math.max(1, distance);
        const gap = distance - body.radius - ball.radius;
        if (closing > 60 && gap / closing < 0.12) {
          this.anticipatedKick = shotKey;
          entry.figure.triggerKick(Math.min(1, closing / 520), "strike");
        }
      }
      // Pausa (modo foto): a pose está congelada, recalcular daria o mesmo resultado.
      // Modo desempenho: boneco parado respirando anima a meia taxa (o passo dobra).
      const still = this.lite && !directive && !physicsMoving && !entry.chasing && (intent.state === "idle" || intent.state === "ready") && !intent.action;
      if (still && !wasHidden && entry.idleDt === 0 && sceneDt > 0) {
        entry.idleDt = sceneDt;
      } else if (!paused || wasHidden) {
        entry.figure.update(sceneDt + entry.idleDt, intent);
        entry.idleDt = 0;
      }
      if (directive?.sliding) {
        this.effects.slideTrail(entry.x, entry.z, Math.sin(directive.intent.heading), Math.cos(directive.intent.heading), sceneDt);
      }
      const landing = entry.figure.takeLanding();
      if (landing > 0) this.effects.kickPuff(entry.x, entry.z, landing);

      // ------------------------------------------------- anel no chão
      const isUser = body.isUserPlayer && !this.options.hideUserMarker;
      const selected = view.selectedId === body.id;
      const hovered = this.hoverId === body.id && !selected;
      const ready = activeSide !== null && body.side === activeSide && body.kind === "disc";
      // Na comemoração o chão fica limpo: sem bases nem anéis de botão.
      entry.ring.visible = !benched && !showing;
      // Base e fôlego não giram com o boneco: o verniz fica do lado da luz e o arco começa sempre no mesmo ponto.
      const counterYaw = -entry.figure.root.rotation.y;
      if (entry.plate) {
        entry.plate.visible = !benched && !showing;
        entry.plate.rotation.z = counterYaw;
      }
      if (entry.stamina) {
        entry.stamina.visible = !benched && !showing;
        entry.stamina.rotation.z = counterYaw;
      }
      // Contorno de luz: no jogo contra a CPU é o seu time; no X1 local, o time da vez.
      const lit = this.options.hideUserMarker
        ? activeSide !== null && body.side === activeSide
        : body.side === "user";
      // Mais forte na sua vez (são eles que você vai tacar), discreto na vez do outro.
      const yourTurn = activeSide !== null && body.side === activeSide;
      entry.figure.setHighlight(lit && body.kind === "disc" ? (this.options.hideUserMarker ? 0.5 : yourTurn ? 0.45 : 0.3) : 0);
      if (selected) {
        entry.ringMaterial.color.set("#f5f7f2");
        entry.ringMaterial.opacity = 0.95;
        entry.ring.scale.setScalar(1.12);
      } else if (isUser) {
        entry.ringMaterial.color.set("#ffc72c");
        entry.ringMaterial.opacity = 0.55 + pulse * 0.4;
        entry.ring.scale.setScalar(1 + pulse * 0.06);
      } else if (hovered) {
        entry.ringMaterial.color.set("#f5f7f2");
        entry.ringMaterial.opacity = 0.7;
        entry.ring.scale.setScalar(1.06);
      } else if (ready && view.highlight) {
        entry.ringMaterial.color.set(body.side === "user" ? this.setup.userTeam.primary : this.setup.cpuTeam.primary);
        entry.ringMaterial.opacity = 0.42 + pulse * 0.3;
        entry.ring.scale.setScalar(1);
      } else {
        // Sem estado especial a base de botão já diz tudo; o anel some.
        entry.ring.visible = false;
      }
      if (entry.marker) {
        entry.marker.visible = !benched && !showing;
        entry.marker.position.y = FIGURE_HEIGHT + 12 + Math.sin(this.time * 3.4) * 1.8;
        entry.marker.rotation.y = this.time * 2.2 - entry.figure.root.rotation.y;
        this.fadeMarkerOverBall(entry.marker, cameraStep);
      }
      this.updateStamina(entry, body);
    }
    if (state.phase === "resolving") this.detectImpacts(state);
    else this.lastVelocity.clear();
    this.separateTrotters(sceneDt);
    this.warmUp(state);
    this.lastPhase = penaltyMode && penalties?.shotInFlight ? "flight" : state.phase;

    for (const entry of this.entries.values()) if (!entry.seen) entry.figure.root.visible = false;
    // Pênalti por demora convertido: o motor tira o goleiro no mesmo passo em que
    // vira gol. Na tela ele continua lá, lamentando, até a saída de bola.
    if (stagedKeeper?.side) this.heldKeeperSide = state.phase === "penalties" && state.penaltyReason === "inactivity" ? stagedKeeper.side : null;
    // (Se esse gol bateu o limite, a partida acaba no mesmo passo e ele fica até o fim.)
    else if (state.phase !== "goal" && !(state.phase === "finished" && state.result?.decision === "goal-limit")) this.heldKeeperSide = null;
    const heldKeeper = !stagedKeeper && this.heldKeeperSide ? this.keepers[this.heldKeeperSide] ?? null : null;
    for (const side of ["user", "cpu"] as const) {
      const keeper = this.keepers[side];
      if (keeper) keeper.figure.root.visible = stagedKeeper?.side === side || keeper === heldKeeper;
    }
    // Continua sentado como a festa do pênalti o deixou.
    if (heldKeeper) heldKeeper.figure.update(sceneDt, idleIntent({ state: "sad", action: "sitDown", faceYaw: null, look: ballLook }));

    // Quem encostou na bola chuta (inclusive no pênalti, que não emite "touch").
    if (ball) this.detectKicks(state, ball, step);

    const aimDisc = view.aim ? state.bodies.find((body) => body.id === view.aim?.bodyId) ?? null : null;
    this.aim.update(aimDisc, view.aim);
    const toucher = state.touches.at(-1)?.side;
    this.trailTint.set(toucher === "cpu" ? this.setup.cpuTeam.primary : toucher === "user" ? this.setup.userTeam.primary : "#f7f9f4");
    // Pênalti decidido: o motor segue rolando a bola além da linha até a cobrança
    // fechar. O rastro para onde a bola da tela parou e se apaga sozinho.
    let trailPoints = view.trail;
    if (penaltyScene && this.penaltyOutcome) {
      if (!this.frozenTrail) this.frozenTrail = view.trail.slice();
      else if (this.frozenTrail.length > 0) this.frozenTrail.shift();
      trailPoints = this.frozenTrail;
    }
    const ballSpeed = ball ? Math.hypot(ball.vx, ball.vy) : 0;
    this.trail.update(trailPoints, FIELD.ballRadius, this.camera.position, this.trailTint, ballSpeed > 540);

    this.watchNearMiss(state, ball, newShot);

    // Torcida acompanha o perigo: bola rondando a área deixa a arquibancada de pé.
    if (ball) {
      const nearGoal = Math.min(ball.y, FIELD.height - ball.y);
      const danger = Math.max(0, 1 - nearGoal / 150);
      // No drama a arquibancada vai se levantando até o chute (no modo desempenho não há torcida).
      this.stadium.setTension(windup ? 0.45 + 0.45 * windup.progress : state.phase === "resolving" ? danger : danger * 0.45);
    }
    // A câmera da festa solta ~0,45s antes da saída de bola: quando o jogo volta, a vista já é a de jogo.
    // Gol com o relógio zerado não tem saída de bola depois (vem intervalo ou apito): segura até o fim.
    // Depois de soltar, não mergulha de novo se a saída atrasar (prompt do ex-clube, pausa).
    const resumesPlay = state.phase === "goal" && state.clock > 0;
    if (resumesPlay && view.goalEndsIn !== null && view.goalEndsIn !== undefined && view.goalEndsIn <= 0.45) this.showReleased = true;
    const shot = !this.showReleased && !this.photo ? this.choreo.camera(this.camera.aspect) : null;
    if (this.rain) {
      this.rain.in -= sceneDt;
      if (this.rain.in <= 0) {
        const focus = this.choreo.camera(this.camera.aspect);
        if (focus && !this.options.reducedMotion) this.confetti.rain(focus.x, focus.z, this.rain.colors);
        this.rain = null;
      }
    }
    // Brilhos em volta de quem está no centro da festa.
    const partySide = this.choreo.side;
    if (shot && partySide && !this.options.reducedMotion) {
      this.sparkleClock += sceneDt;
      if (this.sparkleClock > 0.32) {
        this.sparkleClock = 0;
        const color = partySide === "user" ? this.setup.userTeam.primary : this.setup.cpuTeam.primary;
        this.effects.sparkle(shot.x, FIGURE_HEIGHT * 0.9, shot.z, color, 6);
      }
    }

    // Comemorações de assinatura: lê as marcas que o boneco do foco soltou neste quadro.
    const fxKind = this.goalShowStarted ? this.choreo.kind : null;
    const fxFocus = fxKind && this.choreo.focus ? this.entries.get(this.choreo.focus) ?? null : null;
    const fxSide = this.choreo.side;
    const fxOut = this.fx.update(sceneDt, {
      kind: fxKind,
      focus: fxFocus ? { figure: fxFocus.figure, x: fxFocus.x, z: fxFocus.z, yaw: fxFocus.figure.yaw } : null,
      side: fxSide,
      teamColor: fxSide === "cpu" ? this.setup.cpuTeam.primary : this.setup.userTeam.primary,
      stadium: this.stadium,
      aspect: this.camera.aspect,
    });
    this.shake = Math.max(this.shake, fxOut.shake);
    if (fxOut.glowColor && fxOut.glow >= this.glow) this.glowColor.set(fxOut.glowColor);
    this.glow = Math.max(this.glow, fxOut.glow);

    // Luz: pulso na cor do time no gol e estádio escurecendo para o holofote da festa.
    this.glow *= Math.exp(-sceneDt * 1.6);
    // No drama do pênalti o estádio escurece um pouco (0,5 da festa) e o holofote fica na bola.
    const windupDim = windup && !shot && !this.options.reducedMotion ? 0.5 : 0;
    const wantDim = shot && !this.options.reducedMotion && this.choreo.kind !== "final" ? 1 : windupDim;
    this.dim += (wantDim - this.dim) * (1 - Math.exp(-cameraStep * (wantDim ? 2.6 : 3.5)));
    this.sun.intensity = SUN_INTENSITY * (1 - 0.3 * this.dim);
    this.hemisphere.intensity = HEMISPHERE_INTENSITY * (1 - 0.24 * this.dim) + 0.5 * this.glow;
    this.hemisphere.color.copy(this.skyColor).lerp(this.glowColor, 0.32 * this.glow);
    this.effects.setSpotlight(shot && wantDim ? { x: shot.x, z: shot.z } : windupDim ? { x: this.ballDisplayX, z: this.ballDisplayZ } : null);
    this.frameMoment(state, shot);
    this.frameWindup(windup, shot);
    this.stadium.update(sceneDt, this.time);
    this.confetti.update(sceneDt);
    this.updateCamera(cameraStep);
    this.effects.update(sceneDt, this.camera);
    this.scheduleShadow(state, ball, sceneDt, anyChasing);
    this.renderer.render(this.scene, this.camera);
    this.renderCost += ((performance.now() - started) / 1000 - this.renderCost) * 0.06;
  }

  /**
   * Drama do pênalti da CPU: com a câmera já atrás do batedor, ela fecha (2,05 → 2,35)
   * e abaixa um pouco (0,82 → 0,76) acompanhando a contagem. No chute volta ao normal.
   */
  private frameWindup(windup: { progress: number } | null, shot: CameraShot | null) {
    if (windup && !shot && !this.photo && this.cameraKey.startsWith("penalty")) {
      this.windupActive = true;
      if (!this.windupFraming && this.cameraSettled()) this.windupFraming = true;
      if (!this.windupFraming) return;
      const eased = smoothstep01(windup.progress);
      this.focusZoomGoal = 2.05 + 0.3 * eased;
      if (!this.orbit && !this.gesture) this.pitchTarget = 0.82 - 0.06 * eased;
      return;
    }
    if (!this.windupActive) return;
    this.windupActive = false;
    this.windupFraming = false;
    if (this.cameraKey.startsWith("penalty")) {
      this.focusZoomGoal = 2.05;
      this.pitchTarget = 0.82;
    }
  }

  /** Gancho de desenvolvimento (?botaotrace=1 em loopback): projeta a ponta do raio para o teste de enquadramento. */
  private devHook: Window["__botao3d"] | undefined;
  private installDevHook() {
    if (!botaoTraceEnabled()) return;
    const projected = new THREE.Vector3();
    this.devHook = {
      projectBeamEnd: () => {
        const end = this.fx.beamEnd();
        if (!end) return null;
        projected.set(end.x, end.y, end.z).project(this.camera);
        return { x: projected.x, y: projected.y };
      },
      kind: () => (this.goalShowStarted || this.choreo.active ? this.choreo.kind : null),
    };
    window.__botao3d = this.devHook;
  }

  /**
   * O mapa de sombra (um passe com todos os bonecos, traves e bola) só é refeito
   * quando algo mudou: a caixa andou, ou a cena se mexeu. Na mira, com a bola
   * parada e ninguém trotando, os bonecos só respiram e meia taxa basta. Na
   * pausa (cena congelada) a sombra continua valendo enquanto a caixa não anda.
   */
  private scheduleShadow(state: BotaoMatchState, ball: BotaoBody | null, sceneDt: number, anyChasing: boolean) {
    if (this.lite) return;
    const shadowCamera = this.sun.shadow.camera;
    // Rede estufando ou trave tremendo também mexem na sombra.
    const boxMoved = this.stadium.shadowsChanged()
      || Math.abs(this.shadowCenter.x - this.shadowDrawn.x) > 0.5
      || Math.abs(this.shadowCenter.z - this.shadowDrawn.z) > 0.5
      || Math.abs(shadowCamera.top - this.shadowDrawnExtent) > 0.5;
    const calm = (state.phase === "aim" || state.phase === "kickoff")
      && !this.choreo.active
      && !anyChasing
      && (!ball || (ball.vx === 0 && ball.vy === 0));
    this.shadowParity = !this.shadowParity;
    const update = boxMoved || (sceneDt > 0 && (!calm || this.shadowParity));
    this.sun.shadow.needsUpdate = update;
    if (update) {
      this.shadowDrawn.copy(this.shadowCenter);
      this.shadowDrawnExtent = shadowCamera.top;
    }
  }

  /**
   * O selo do jogador fica por cima de tudo (sem teste de profundidade); com a
   * bola logo atrás dele na tela, ele fica translúcido para não escondê-la.
   */
  private fadeMarkerOverBall(marker: THREE.Group, dt: number) {
    const label = marker.children[0] as THREE.Sprite | undefined;
    if (!label) return;
    // Centro do selo e a borda dele (meia largura + raio da bola) medidos na tela.
    label.getWorldPosition(this.markerWorld);
    this.cameraRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.projected.copy(this.markerWorld).addScaledVector(this.cameraRight, label.scale.x / 2 + FIELD.ballRadius).project(this.camera);
    const edgeX = this.projected.x * this.camera.aspect;
    const edgeY = this.projected.y;
    this.projected.copy(this.markerWorld).project(this.camera);
    const markerX = this.projected.x * this.camera.aspect;
    const markerY = this.projected.y;
    const reach = Math.hypot(edgeX - markerX, edgeY - markerY);
    this.projected.set(this.ballDisplayX, FIELD.ballRadius, this.ballDisplayZ).project(this.camera);
    const gap = Math.hypot(markerX - this.projected.x * this.camera.aspect, markerY - this.projected.y);
    const covering = gap < reach;
    const material = label.material;
    material.opacity += ((covering ? 0.3 : 1) - material.opacity) * (1 - Math.exp(-dt * 12));
  }

  /** Liga e desliga as festas conforme a fase da partida. */
  private updateShows(state: BotaoMatchState, penaltyMode: boolean) {
    const kind = this.choreo.kind;
    // Gol: vale na fase "goal" e segue no "finished" quando o gol encerrou a partida.
    if (this.goalShowStarted && state.phase !== "goal" && state.phase !== "finished") {
      this.choreo.stop();
      this.fx.stop();
      this.goalShowStarted = false;
    }
    if (!this.choreo.active) this.showReleased = false;
    // Pênalti: some quando a próxima cobrança é montada ou a disputa acaba.
    if (kind?.startsWith("penalty") && (!penaltyMode || !this.penaltyOutcome)) {
      this.choreo.stop();
    }
    if (state.phase !== "finished") {
      this.finalStarted = false;
      return;
    }
    if (this.finalStarted) return;
    this.finalStarted = true;
    // O gol que bate o limite encerra a partida no mesmo passo: a festa dele já é a festa final.
    // Gol no último lance com o apito logo depois (até de quem perdeu) ganha a cena do apito.
    if (this.goalShowStarted && this.choreo.active && state.result?.decision === "goal-limit") return;
    // Emendando na festa do gol: a câmera segue do close em que estava e quem marcou continua no centro.
    const goalShot = this.goalShowStarted && this.choreo.active ? this.choreo.camera() : null;
    const goalStar = goalShot ? this.choreo.focus : null;
    this.goalShowStarted = false;
    const outcome = state.result?.outcome;
    const winner: BotaoSide | null = outcome === "win" ? "user" : outcome === "loss" ? "cpu" : null;
    this.choreo.startFinal({ winner, actors: this.actors(state), cameraYaw: this.yaw, fromZoom: goalShot?.zoom, starId: goalStar });
    this.showReleased = false;
    if (winner) {
      const team = winner === "user" ? this.setup.userTeam : this.setup.cpuTeam;
      this.stadium.celebrate(winner);
      this.stadium.cameraFlashes(winner, 3.5);
      this.stadium.goalShow(winner, team.primary, "fim");
      const colors = [team.primary, team.secondary, "#ffc72c", "#ffffff"];
      this.confetti.rain(0, winner === "user" ? 40 : -40, colors);
      this.confetti.rain(0, winner === "user" ? -60 : 60, colors);
    }
  }

  /**
   * "Uuuh!": bola forte passando raspando a boca do gol sem entrar. Quando a
   * jogada termina sem gol (e sem trave, que já tem a própria reação), a
   * torcida põe a mão na cabeça e quem atacou também.
   */
  private watchNearMiss(state: BotaoMatchState, ball: BotaoBody | null, newShot: boolean) {
    if (newShot) {
      this.nearMiss = null;
      this.postThisShot = false;
    }
    if (state.phase === "resolving" && ball) {
      const fast = Math.hypot(ball.vx, ball.vy) > 200;
      const nearMouth = Math.abs(ball.x - FIELD.width / 2) < FIELD.goalWidth / 2 + 30;
      if (fast && nearMouth && ball.y < 42 && ball.vy < 0) this.nearMiss = "user";
      if (fast && nearMouth && ball.y > FIELD.height - 42 && ball.vy > 0) this.nearMiss = "cpu";
      return;
    }
    if (!this.nearMiss) return;
    const attacker = this.nearMiss;
    this.nearMiss = null;
    if (this.postThisShot || (state.phase !== "aim" && state.phase !== "kickoff")) return;
    this.stadium.crowdReact("ooh", attacker, "QUASE!");
    for (const body of state.bodies) {
      if (body.kind === "disc" && body.side === attacker) {
        this.reactions.set(body.id, { action: "handsOnHead", until: this.time + 1.2 });
      }
    }
  }

  /**
   * Pré-aquecimento para o primeiro gol não engasgar no Android: com a partida
   * parada na mira, sobe as texturas pendentes para a GPU e monta os goleiros
   * do pênalti escondidos (um por quadro).
   */
  private warmUp(state: BotaoMatchState) {
    const calm = state.phase === "aim" || state.phase === "kickoff";
    this.calmFrames = calm ? this.calmFrames + 1 : 0;
    if (this.calmFrames < 20) return;
    for (let index = 0; index < 2 && this.prewarm.length > 0; index += 1) {
      const texture = this.prewarm.pop();
      if (texture) this.renderer.initTexture(texture);
    }
    if (this.prewarm.length > 0) return;
    for (const side of ["user", "cpu"] as const) {
      if (this.keepers[side]) continue;
      this.stageKeeper(side);
      return;
    }
  }

  /** Programas de shader já compilados (a vigia de quadros ignora o quadro que compila um novo). */
  get compiledPrograms() {
    return this.renderer.info.programs?.length ?? 0;
  }

  /** Goleiro do pênalti montado escondido, antes de precisar dele. */
  private stageKeeper(side: BotaoSide) {
    const placeholder = {
      id: "keeper",
      kind: "keeper",
      side,
      x: FIELD.width / 2,
      y: side === "user" ? FIELD.height : 0,
      vx: 0,
      vy: 0,
      number: 1,
      isUserPlayer: false,
    } as BotaoBody;
    const keeper = this.createEntry(`keeper-${side}`, placeholder, true);
    keeper.figure.root.visible = false;
    this.keepers[side] = keeper;
  }

  /**
   * Antes de mostrar a cena: monta bonecos e goleiros, sobe as texturas e
   * compila todos os shaders (mira, efeitos e goleiros escondidos inclusive),
   * em paralelo quando o navegador deixa. Sem isso o primeiro quadro, a
   * primeira mira e o primeiro gol travavam compilando — e a vigia de quadros
   * tomava esse engasgo por lentidão. Um quadro descartável compila a sombra.
   */
  async prepare(state: BotaoMatchState) {
    for (const body of state.bodies) if (body.kind === "disc") this.entryFor(body);
    for (const side of ["user", "cpu"] as const) if (!this.keepers[side]) this.stageKeeper(side);
    for (const texture of this.prewarm.splice(0)) this.renderer.initTexture(texture);
    // Mira e confete nascem escondidos; o compile do three já percorre os invisíveis.
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // Sem compilação paralela, compila no primeiro quadro como antes.
    }
    // A partida pode ter saído (ou o contexto caído) durante a compilação.
    if (this.contextLost || this.disposed) return;
    this.resize();
    this.updateCamera(0);
    this.sun.shadow.needsUpdate = true;
    // Pools de efeito ficam visíveis só neste quadro descartável (sobe atlas e buffers).
    this.fx.prepare();
    this.effects.prepare(this.renderer);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Quem trota para a formação nova desvia ombro a ombro em vez de atravessar
   * o colega. É só deslocamento de desenho: parado, disco nunca encosta em
   * disco, então isso fica em zero durante o jogo.
   */
  private separateTrotters(dt: number) {
    const list = this.trotters;
    const decay = Math.exp(-dt * 6);
    for (const entry of list) {
      entry.sepX *= decay;
      entry.sepZ *= decay;
    }
    const minimum = 22;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (!a.chasing && !b.chasing) continue;
        const dx = b.x + b.sepX - (a.x + a.sepX);
        const dz = b.z + b.sepZ - (a.z + a.sepZ);
        const distance = Math.hypot(dx, dz);
        if (distance >= minimum || distance < 0.001) continue;
        const push = (minimum - distance) * 0.5;
        a.sepX -= (dx / distance) * push;
        a.sepZ -= (dz / distance) * push;
        b.sepX += (dx / distance) * push;
        b.sepZ += (dz / distance) * push;
      }
    }
    for (const entry of list) entry.figure.root.position.set(entry.x + entry.sepX, 0, entry.z + entry.sepZ);
  }

  /** Dois bonecos que mudam de velocidade de uma vez, colados, bateram. */
  private detectImpacts(state: BotaoMatchState) {
    const changed: Array<{ entry: Entry; change: number }> = [];
    for (const body of state.bodies) {
      if (body.kind !== "disc") continue;
      const previous = this.lastVelocity.get(body.id);
      this.lastVelocity.set(body.id, { vx: body.vx, vz: body.vy });
      if (!previous) continue;
      const change = Math.hypot(body.vx - previous.vx, body.vy - previous.vz);
      const entry = this.entries.get(body.id);
      if (entry && change > 140) changed.push({ entry, change });
    }
    for (let i = 0; i < changed.length; i += 1) {
      for (let j = i + 1; j < changed.length; j += 1) {
        const a = changed[i];
        const b = changed[j];
        if (Math.hypot(a.entry.x - b.entry.x, a.entry.z - b.entry.z) > FIELD.discRadius * 2 + 4) continue;
        const strength = Math.min(1, Math.max(a.change, b.change) / 700);
        this.effects.impact((a.entry.x + b.entry.x) / 2, 16, (a.entry.z + b.entry.z) / 2, strength);
        if (strength > 0.55) this.shake = Math.max(this.shake, strength * 0.3);
      }
    }
  }

  /**
   * O gol que bate o limite pula a fase "goal" (o motor vai direto para
   * "finished" no mesmo passo); a festa e a rede valem para ele também.
   */
  private goalMoment(state: BotaoMatchState) {
    return Boolean(state.lastGoal && (state.phase === "goal" || (state.phase === "finished" && state.result?.decision === "goal-limit")));
  }

  private updateBall(state: BotaoMatchState, ball: BotaoBody, dt: number, realDt: number, penaltyMode: boolean) {
    const x = toWorldX(ball.x);
    const z = toWorldZ(ball.y);
    const jump = Math.hypot(x - this.lastBallX, z - this.lastBallZ);
    const resting = ball.vx === 0 && ball.vy === 0;
    const teleported = this.ballInitialized && jump > 30 && resting;
    // Velocidade medida no tempo real: o motor anda no relógio de verdade, mesmo em câmera lenta.
    if (realDt > 0 && !teleported && this.ballInitialized) {
      this.ballVX = (x - this.lastBallX) / realDt;
      this.ballVZ = (z - this.lastBallZ) / realDt;
    }

    // Gol (ou pênalti convertido): o motor para a bola na linha — ou, no pênalti,
    // deixa ela seguir reto até a cobrança fechar. Aqui ela entra e estufa a rede.
    const penaltyGoal = penaltyMode && this.penaltyOutcome === "scored";
    // Gol no último lance: o apito vem logo depois (fase "finished") e a bola continua no fundo da rede.
    const inGoal = this.goalMoment(state) || penaltyGoal || (this.ballInNet !== null && state.phase === "finished");
    if (inGoal && !this.ballInNet && this.ballInitialized) {
      const top = penaltyGoal ? state.penalties?.turn === "user" : state.lastGoal?.side === "user";
      const speed = Math.hypot(this.ballVX, this.ballVZ);
      const minimum = 160;
      const scale = speed < minimum ? minimum / Math.max(1, speed) : 1;
      this.ballInNet = { vx: this.ballVX * scale * 0.85, vz: (top ? -1 : 1) * Math.max(minimum, Math.abs(this.ballVZ * scale)), top, hit: false };
      this.ballDisplayX = Math.max(-FIELD.goalWidth / 2 + 8, Math.min(FIELD.goalWidth / 2 - 8, x));
      this.ballDisplayZ = (top ? -1 : 1) * Math.min(Math.abs(z), HALF_H + 1);
    }
    if (!inGoal) this.ballInNet = null;

    if (this.ballInNet) {
      const net = this.ballInNet;
      const backZ = (net.top ? -1 : 1) * (HALF_H + FIELD.goalDepth - FIELD.ballRadius - 1);
      this.ballDisplayX += net.vx * dt;
      this.ballDisplayZ += net.vz * dt;
      net.vx *= Math.exp(-dt * 3);
      net.vz *= Math.exp(-dt * 1.2);
      this.ballDisplayX = Math.max(-FIELD.goalWidth / 2 + 8, Math.min(FIELD.goalWidth / 2 - 8, this.ballDisplayX));
      if (!net.hit && (net.top ? this.ballDisplayZ <= backZ : this.ballDisplayZ >= backZ)) {
        net.hit = true;
        const strength = Math.min(1.4, Math.abs(net.vz) / 260);
        this.stadium.goal(net.top ? "top" : "bottom").ripple(this.ballDisplayX + HALF_W, strength);
        this.effects.netHit(this.ballDisplayX, FIELD.ballRadius + 2, backZ, strength);
        // A bola amassa contra a rede.
        this.ball.impact(0, net.top ? 1 : -1, Math.min(1, strength));
        this.shake = Math.max(this.shake, 0.55);
        net.vz = -net.vz * 0.18;
        net.vx *= 0.4;
      }
      if (net.hit) this.ballDisplayZ = net.top ? Math.max(backZ, Math.min(-HALF_H - 2, this.ballDisplayZ)) : Math.min(backZ, Math.max(HALF_H + 2, this.ballDisplayZ));
    } else {
      this.ballDisplayX = x;
      this.ballDisplayZ = z;
      // Pênalti para fora: o motor deixa a bola seguir; na tela ela para na tabela.
      if (penaltyMode && this.penaltyOutcome) {
        this.ballDisplayX = Math.max(-HALF_W + FIELD.ballRadius, Math.min(HALF_W - FIELD.ballRadius, this.ballDisplayX));
        this.ballDisplayZ = Math.max(-HALF_H + FIELD.ballRadius, Math.min(HALF_H - FIELD.ballRadius, this.ballDisplayZ));
      }
    }
    if (teleported && this.ballInNet) {
      // A bola do motor voltou ao centro, mas a da tela ainda está no fundo da rede.
    } else if (teleported && !penaltyMode) this.ball.drop(state.phase === "kickoff" ? 80 : 40);
    else if (teleported) this.ball.drop(26);
    this.ball.update(this.ballDisplayX, this.ballDisplayZ, dt, teleported && !this.ballInNet);
    this.lastBallX = x;
    this.lastBallZ = z;
    this.ballInitialized = true;
  }

  private previousBallVX = 0;
  private previousBallVZ = 0;

  private detectKicks(state: BotaoMatchState, ball: BotaoBody, dt: number) {
    if (dt <= 0) return;
    const before = Math.hypot(this.previousBallVX, this.previousBallVZ);
    const change = Math.hypot(ball.vx - this.previousBallVX, ball.vy - this.previousBallVZ);
    const previousX = this.previousBallVX;
    const previousZ = this.previousBallVZ;
    this.previousBallVX = ball.vx;
    this.previousBallVZ = ball.vy;
    // No gol a bola é zerada pelo motor: isso não é chute de ninguém.
    if (change < 45 || this.ballInNet || this.goalShowStarted) return;
    // Só atrito (mesma direção, mais devagar) também não: em celular lento ele passa de 45 num quadro.
    const after = Math.hypot(ball.vx, ball.vy);
    if (before > 1 && after > 1 && after < before && (previousX * ball.vx + previousZ * ball.vy) / (before * after) > 0.985) return;
    const bx = toWorldX(ball.x);
    const bz = toWorldZ(ball.y);
    let nearest: Entry | null = null;
    let nearestDistance = Infinity;
    const candidates = [...this.entries.values(), ...Object.values(this.keepers)];
    for (const entry of candidates) {
      if (!entry || !entry.figure.root.visible) continue;
      const distance = Math.hypot(entry.x - bx, entry.z - bz);
      if (distance < nearestDistance) {
        nearest = entry;
        nearestDistance = distance;
      }
    }
    const near = nearest && nearestDistance < FIELD.discRadius + FIELD.ballRadius + 5;
    if (!near || !nearest) return;
    const speed = Math.hypot(ball.vx, ball.vy) || 1;
    const strength = Math.min(1, change / 600);
    if (nearest.id.startsWith("keeper")) {
      // Defesa: estalo de luva em vez de torrão.
      this.effects.impact(bx, 12, bz, Math.max(0.5, strength), "#ffffff");
      return;
    }
    // Quem vinha na direção da bola chuta; quem só levou a bolada amortece.
    const kickerId = nearest.id;
    const body = state.bodies.find((candidate) => candidate.id === kickerId);
    const towardBall = body ? body.vx * (ball.x - body.x) + body.vy * (ball.y - body.y) : 0;
    const struck = Boolean(body && Math.hypot(body.vx, body.vy) > 40 && towardBall > 0);
    nearest.figure.triggerKick(change / 520, struck ? "strike" : "block");
    this.effects.kickPuff(bx, bz, struck ? strength : strength * 0.5, ball.vx / speed, ball.vy / speed);
    // Chute forte tira a bola do chão por um instante (só no desenho).
    if (change > 380 && !this.options.reducedMotion) this.ball.hop(Math.min(9, 2 + change / 140));
  }

  private trackPenaltyOutcome(
    state: BotaoMatchState,
    round: number,
    turn: BotaoSide,
    ball: BotaoBody | null,
    shooter: BotaoBody | null,
    keeper: BotaoBody | null,
  ) {
    const key = `${round}|${turn}|${state.penalties?.results.user.length}|${state.penalties?.results.cpu.length}`;
    if (key !== this.penaltyKey) {
      this.penaltyKey = key;
      this.penaltyOutcome = null;
      this.keeperDiveLatch = null;
      this.penaltyBallSpeed = 0;
    }
    if (!state.penalties?.shotInFlight || !ball || this.penaltyOutcome) return;
    const goalTop = turn === "user";
    const crossed = goalTop ? ball.y <= 0 : ball.y >= FIELD.height;
    if (crossed) {
      this.penaltyOutcome = ball.x > FIELD.width / 2 - FIELD.goalWidth / 2 && ball.x < FIELD.width / 2 + FIELD.goalWidth / 2 ? "scored" : "saved";
      if (this.penaltyOutcome === "scored") {
        const team = turn === "user" ? this.setup.userTeam : this.setup.cpuTeam;
        this.stadium.goal(goalTop ? "top" : "bottom").ripple(ball.x, 1);
        this.stadium.celebrate(turn);
        this.stadium.cameraFlashes(turn, 1.6);
        this.effects.shockwave(toWorldX(ball.x), goalTop ? -HALF_H : HALF_H, team.primary, 50);
      }
    } else {
      // Bola que vinha forte e parou de uma vez foi o goleiro que segurou (o motor já decidiu).
      const caught = ball.vx === 0 && ball.vy === 0 && this.penaltyBallSpeed > 60;
      this.penaltyBallSpeed = Math.hypot(ball.vx, ball.vy);
      const stopped = ball.vx === 0 && ball.vy === 0 && (state.resolveElapsed > 0.4 || caught);
      const away = goalTop ? ball.vy > 20 : ball.vy < -20;
      if (!stopped && !(away && state.resolveElapsed > 0.1)) return;
      this.penaltyOutcome = "saved";
      this.stadium.celebrate(turn === "user" ? "cpu" : "user");
      this.stadium.crowdReact("groan", turn);
    }
    // Decidido: quem bateu e o goleiro reagem, e a fila do meio-campo também.
    const keeperEntry = keeper?.side ? this.keepers[keeper.side] : undefined;
    if (shooter && keeperEntry) {
      this.choreo.startPenalty({
        scored: this.penaltyOutcome === "scored",
        shooterId: shooter.id,
        keeperId: keeperEntry.id,
        shootingSide: turn,
        actors: this.actors(state),
        benchZ: goalTop ? 22 : -22,
        // Quem mergulhou ainda está no ar: só levanta depois de cair.
        keeperDove: Math.abs(this.lastKeeperDive) > 0.3,
      });
      this.showReleased = false;
    }
  }

  private intentFor(
    state: BotaoMatchState,
    view: BotaoRenderView,
    body: BotaoBody,
    entry: Entry,
    context: {
      celebrateSide: BotaoSide | null;
      scorerId: string | null;
      activeSide: BotaoSide | null;
      penaltyMode: boolean;
      shooter: BotaoBody | null;
      benched: boolean;
      ballLook: { x: number; z: number };
      penaltyGoalTop: boolean;
      windup?: { shooterId: string; progress: number; remainingS: number } | null;
      keeperLook?: { x: number; z: number } | null;
    },
  ): FigureIntent {
    const lookAtBall = { x: context.ballLook.x, z: context.ballLook.z };
    const faceBall = yawToward(context.ballLook.x - entry.x, context.ballLook.z - entry.z);

    // Trote de reposicionamento.
    if (entry.chasing) {
      const dx = entry.engineX - entry.x;
      const dz = entry.engineZ - entry.z;
      const heading = yawToward(dx, dz);
      return idleIntent({ state: "run", speed: entry.chaseSpeed, heading, faceYaw: heading, look: null });
    }

    // Goleiro do pênalti.
    if (body.kind === "keeper") {
      const facing = context.penaltyGoalTop ? 0 : Math.PI;
      let dive = 0;
      const penalties = state.penalties;
      if (this.penaltyOutcome) {
        // Decidido: o mergulho fica onde estava (não flutua seguindo a bola que volta).
        this.keeperDiveLatch ??= this.lastKeeperDive;
        dive = this.keeperDiveLatch;
      } else if (penalties?.shotInFlight) {
        const ball = state.bodies.find((candidate) => candidate.kind === "ball");
        if (ball) {
          const towardGoal = context.penaltyGoalTop ? ball.vy < -20 : ball.vy > 20;
          const gap = Math.abs(ball.y - body.y);
          if (towardGoal && gap < 95) {
            // Mergulha para onde a bola VAI cruzar a linha dele, não para onde ela está.
            const time = Math.abs(ball.vy) > 1 ? Math.min(0.6, gap / Math.abs(ball.vy)) : 0;
            const crossing = ball.x + ball.vx * time;
            // A palheta segue andando durante o voo: compara com onde ele VAI estar.
            const reach = FIELD.goalWidth / 2 - body.radius - 2;
            const keeperAt = penalties
              ? Math.max(FIELD.width / 2 - reach, Math.min(FIELD.width / 2 + reach, body.x + penalties.keeperDirection * penalties.keeperSpeed * time))
              : body.x;
            const local = (crossing - keeperAt) * (context.penaltyGoalTop ? 1 : -1);
            dive = Math.max(-1, Math.min(1, local / 14));
            if (Math.abs(dive) < 0.35) dive = 0;
          }
        }
        // Mergulho começado não se desfaz no meio da cobrança: na defesa o motor
        // zera a bola e a decisão do 3D ainda leva alguns quadros para sair.
        if (dive === 0) dive = this.lastKeeperDive;
        this.lastKeeperDive = dive;
      } else {
        this.lastKeeperDive = 0;
      }
      if (this.penaltyOutcome === "saved" && Math.abs(dive) < 0.2) {
        return idleIntent({ state: "celebrate", faceYaw: facing, look: null });
      }
      if (this.penaltyOutcome === "scored" && !penalties?.shotInFlight) {
        return idleIntent({ state: "sad", faceYaw: facing });
      }
      const shuffle = penalties ? penalties.keeperDirection * penalties.keeperSpeed * (context.penaltyGoalTop ? 1 : -1) : 0;
      // Com a bola no ar ele continua andando de lado até mergulhar (o motor não para a palheta).
      const stepping = !this.penaltyOutcome && dive === 0;
      const keeperIntent = idleIntent({ state: "keeper", faceYaw: facing, look: lookAtBall, dive, shuffle: stepping ? shuffle : 0 });
      // Drama do pênalti da CPU: o goleiro provoca de braços abertos (por cima do passinho).
      if (context.windup) keeperIntent.action = "keeperTaunt";
      return keeperIntent;
    }

    // Pênaltis: a fila no meio-campo assiste; o batedor encara o gol.
    if (context.penaltyMode) {
      const goalYaw = context.penaltyGoalTop ? Math.PI : 0;
      if (context.benched) {
        if (this.penaltyOutcome && body.side) {
          const shootingSide = state.penalties?.turn;
          const happy = (this.penaltyOutcome === "scored") === (body.side === shootingSide);
          return idleIntent({ state: happy ? "celebrate" : "sad", faceYaw: goalYaw });
        }
        return idleIntent({ state: "idle", faceYaw: goalYaw, look: lookAtBall });
      }
      if (body === context.shooter) {
        if (view.aim?.bodyId === body.id) return this.aimIntent(body, view);
        const speed = Math.hypot(body.vx, body.vy);
        if (state.penalties?.shotInFlight && speed > 5) {
          const heading = yawToward(body.vx, body.vy);
          return idleIntent({ state: "run", speed, heading, faceYaw: heading, look: lookAtBall });
        }
        if (this.penaltyOutcome === "scored") return idleIntent({ state: "scorer", faceYaw: goalYaw });
        if (this.penaltyOutcome === "saved") return idleIntent({ state: "sad", faceYaw: goalYaw });
        // Drama: concentrado, mãos na cintura e olho no goleiro, até a hora de correr.
        // Online o batedor do outro aparelho fica assim até a primeira prévia de mira chegar.
        if ((context.windup && context.windup.remainingS > WINDUP_RUN_IN_S) || (view.penaltyFocusId === body.id && !state.penalties?.shotInFlight)) {
          return idleIntent({ state: "ready", action: "penaltyFocus", faceYaw: goalYaw, look: context.keeperLook ?? lookAtBall });
        }
        return idleIntent({ state: "ready", faceYaw: goalYaw, look: lookAtBall });
      }
    }

    // Gol e fim de jogo.
    if (context.celebrateSide && body.side) {
      if (body.side === context.celebrateSide) {
        if (body.id === context.scorerId) return idleIntent({ state: "scorer", faceYaw: null });
        const scorer = context.scorerId ? this.entries.get(context.scorerId) : null;
        const faceYaw = scorer ? yawToward(scorer.x - entry.x, scorer.z - entry.z) : null;
        return idleIntent({ state: "celebrate", faceYaw });
      }
      return idleIntent({ state: "sad", faceYaw: null });
    }

    if (view.aim?.bodyId === body.id) return this.aimIntent(body, view);

    const speed = Math.hypot(body.vx, body.vy);
    if (speed > 6) {
      const heading = yawToward(body.vx, body.vy);
      if (state.activeShotBodyId === body.id && state.phase === "resolving") {
        return idleIntent({ state: "run", speed, heading, faceYaw: heading, look: lookAtBall });
      }
      return idleIntent({ state: "pushed", speed, heading, faceYaw: null, look: lookAtBall });
    }

    const ready = context.activeSide !== null && body.side === context.activeSide;
    return idleIntent({ state: ready ? "ready" : "idle", faceYaw: faceBall, look: lookAtBall });
  }

  private aimIntent(body: BotaoBody, view: BotaoRenderView): FigureIntent {
    const aim = view.aim!;
    const dx = body.x - aim.dragX;
    const dy = body.y - aim.dragY;
    const faceYaw = Math.hypot(dx, dy) > 3 ? yawToward(dx, dy) : null;
    return idleIntent({ state: "aim", faceYaw, aimRatio: aim.valid ? aim.ratio : aim.ratio * 0.5, look: null });
  }

  /**
   * Modo desempenho: a resolução acompanha o aparelho. Quadro pesado (abaixo de
   * ~48 por segundo) desce um degrau; com folga por alguns segundos, sobe. Se
   * descer não melhorou nada, o gargalo é a CPU: volta o degrau e para de
   * descer por um tempo (imagem borrada sem ganho não serve). Trocar o tamanho
   * do buffer custa, então no máximo uma troca a cada 1,5 s.
   */
  private adaptResolution(frameDt: number) {
    if (frameDt <= 0 || frameDt > 0.25) return;
    this.frameAverage += (frameDt - this.frameAverage) * 0.06;
    this.resolutionClock += frameDt;
    if (this.resolutionClock < 1.5) return;
    // Tela presa em 30 Hz (economia de energia) com o render folgado: não é peso.
    const powerSaver = Math.abs(this.frameAverage - 1 / 30) < 0.0015 && this.renderCost < 0.006;
    let next = this.pixelRatio;
    if (this.averageBeforeDrop !== null) {
      const helped = this.frameAverage < this.averageBeforeDrop * 0.95;
      this.averageBeforeDrop = null;
      if (!helped) {
        // Duas descidas sem ganho: o gargalo não é pixel. Para de descer nesta partida.
        this.resolutionMisses += 1;
        next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
      }
    } else if (this.frameAverage > 1 / 48 && !powerSaver && this.resolutionMisses < 2 && this.pixelRatio > MIN_PIXEL_RATIO + 0.001) {
      next = Math.max(MIN_PIXEL_RATIO, this.pixelRatio - 0.1);
      this.averageBeforeDrop = this.frameAverage;
    } else if (this.frameAverage < 1 / 57 && this.resolutionClock > 4 && this.pixelRatio < this.maxPixelRatio - 0.001) {
      next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.05);
    } else {
      return;
    }
    this.resolutionClock = 0;
    if (Math.abs(next - this.pixelRatio) < 0.001) return;
    this.pixelRatio = next;
    this.renderer.setPixelRatio(next);
  }

  private resize() {
    // Ler clientWidth logo depois do React mexer no HUD força layout: só lê quando o tamanho mudou.
    if (!this.sizeDirty) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.sizeDirty = false;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    // Teto de pixels pelo tamanho. O modo desempenho tem orçamento próprio
    // (~0,45 MP no celular, ~1 MP no desktop) e a resolução adaptável anda abaixo dele.
    const dpr = window.devicePixelRatio || 1;
    const budget = this.lite ? (this.coarse ? 4.5e5 : 1e6) : 8.3e6;
    const capped = Math.min(dpr, this.lite ? 1.5 : 2, Math.sqrt(budget / (width * height)));
    // Fora do modo desempenho o teto só morde em canvas gigante (acima de ~4K
    // físico) e nunca desce de min(dpr, 1,5): a nitidez fica como sempre foi.
    this.maxPixelRatio = this.lite ? Math.max(MIN_PIXEL_RATIO, capped) : Math.max(Math.min(dpr, 1.5), capped);
    this.pixelRatio = this.lite ? Math.min(this.pixelRatio, this.maxPixelRatio) : this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Celular em pé: um pouco mais de abertura para caber o campo sem afastar demais.
    this.camera.fov = this.camera.aspect < 0.8 ? 32 : 28;
    this.camera.updateProjectionMatrix();
    this.fitKey = "";
  }

  dispose() {
    this.disposed = true;
    for (const release of this.cleanup) release();
    for (const entry of this.entries.values()) this.disposeEntry(entry);
    for (const keeper of Object.values(this.keepers)) if (keeper) this.disposeEntry(keeper);
    this.entries.clear();
    this.stadium.dispose();
    this.ball.dispose();
    this.aim.dispose();
    this.trail.dispose();
    this.confetti.dispose();
    this.fx.dispose();
    this.effects.dispose();
    if (botaoTraceEnabled() && window.__botao3d === this.devHook) delete window.__botao3d;
    this.ringGeometry.dispose();
    this.plateGeometry.dispose();
    for (const material of Object.values(this.plateMaterials)) {
      material?.map?.dispose();
      material?.dispose();
    }
    this.markerTexture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

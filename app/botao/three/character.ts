// Boneco de blocos (linha Block Strike) com esqueleto simples e animação
// procedural. Nada de clipe pronto: cada pose é uma soma ponderada de poucos
// ângulos, o que deixa as transições sempre suaves — o jogador pode sair de
// "mirando" para "correndo" para "chutando" no meio do caminho sem estalo.
//
// Unidades: o modelo é desenhado em "pixels" de boneco (cabeça 8×8×8, corpo
// 8×12×4, 32 de altura) e escalado por PX para unidades de campo.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PlayerAppearance } from "../../player-appearance";
import {
  atlasBoxGeometry,
  createHeadTextures,
  createKitTextures,
  mixHex,
  radialTexture,
  resolveLook,
  shadeHex,
  sleeveColor,
  stripeTexture,
  type FaceMood,
  type HeadTextures,
  type ResolvedLook,
} from "./textures";

export const PX = 1.24;
export const FIGURE_HEIGHT = 32 * PX;

// ------------------------------------------------------------ geometria

const boxCache = new Map<string, THREE.BoxGeometry>();

function box(width: number, height: number, depth: number) {
  const key = `${width}|${height}|${depth}`;
  let geometry = boxCache.get(key);
  if (!geometry) {
    geometry = new THREE.BoxGeometry(width, height, depth);
    boxCache.set(key, geometry);
  }
  return geometry;
}

function solid(color: string, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) {
  const result = new THREE.Mesh(geometry, material);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

/** `Object3D.add` devolve o pai; isto devolve a peça já posicionada. */
function place(parent: THREE.Object3D, child: THREE.Mesh, y: number) {
  child.position.y = y;
  parent.add(child);
  return child;
}

let blobTexture: THREE.Texture | null = null;
let blobGeometry: THREE.PlaneGeometry | null = null;

function contactShadow() {
  blobTexture ??= radialTexture("rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
  blobGeometry ??= new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false });
  const blob = new THREE.Mesh(blobGeometry, material);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.12;
  blob.renderOrder = 1;
  return blob;
}

// ---------------------------------------------------------------- cabelo

/**
 * Volumes de cabelo em blocos, fundidos num único mesh (um draw call por
 * cabeça). A textura cuida da linha do cabelo; isto dá a silhueta vista de cima.
 */
function buildHair(look: ResolvedLook, material: THREE.Material): THREE.Mesh | null {
  const parts: THREE.Object3D[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, rotX = 0, rotZ = 0) => {
    const part = new THREE.Mesh(box(w, h, d));
    part.position.set(x, y, z);
    part.rotation.set(rotX, 0, rotZ);
    parts.push(part);
    return part;
  };
  const shell = (height = 1.1, size = 8.5) => add(size, height, size, 0, 8 + height / 2 - 0.15, 0);
  switch (look.hairStyle) {
    case 0: shell(); break;
    case 1: shell(); add(8.5, 1.5, 0.9, 0, 7.4, 4.05); break;
    case 2:
      shell(1.4, 8.7);
      for (const [x, z] of [[-2.6, -2.6], [0, -2.8], [2.6, -2.4], [-2.8, 0], [0.2, 0.1], [2.7, 0.3], [-2.4, 2.6], [0.1, 2.8], [2.6, 2.5]]) {
        add(2, 1.2, 2, x, 9.5, z);
      }
      break;
    case 3: add(1.9, 3.1, 8.8, 0, 9.3, 0); break;
    case 4: add(10.6, 5.4, 10.6, 0, 8.3, -0.3); break;
    case 6:
      shell(0.9, 8.4);
      for (const x of [-3, -1, 1, 3]) add(1, 4.2, 1, x, 4.6, -4.35);
      break;
    case 7: shell(1.1); add(5.4, 0.9, 8.7, 1.6, 9.1, 0); break;
    case 8: shell(1.1); add(6.4, 2.4, 3.2, 0, 9.6, 2.5, -0.35); break;
    case 9:
      shell(1.2, 8.7);
      for (const [x, z, length] of [[-4.2, -2, 7], [-4.2, 1, 6], [4.2, -2, 7], [4.2, 1, 6], [-2.6, -4.2, 8], [-0.8, -4.2, 8.5], [1, -4.2, 8], [2.8, -4.2, 7.5]]) {
        add(1.2, length, 1.2, x, 8.4 - length / 2, z);
      }
      break;
    case 10: shell(0.9, 8.4); add(3.2, 3, 3.2, 0, 10.2, -1.6); break;
    case 11: shell(); break;
    case 13: shell(); add(7.4, 4.8, 1.1, 0, 4.2, -4.4); break;
    case 14: add(8.9, 3.5, 8.9, 0, 7.2, 0); break;
    case 15: add(3.6, 2.1, 8.8, 0, 8.9, 0); break;
    case 16:
      shell(0.9, 8.4);
      for (let x = -3; x <= 3; x += 2) for (let z = -3; z <= 3; z += 2) add(1.3, 1.6, 1.3, x, 9.4, z);
      break;
    case 17: shell(); add(5.2, 3, 0.9, 1.4, 6.8, 4.05); break;
    case 18: add(7.4, 1.8, 8.4, 0, 8.7, 0); break;
    case 19: {
      shell(0.9, 8.4);
      const tail = add(2.1, 5.6, 2.1, 0, 4.8, -5.1, 0.32);
      tail.position.y = 5.4;
      add(2.4, 0.9, 2.4, 0, 7.8, -4.6);
      break;
    }
    case 21: add(9.3, 2.5, 9.3, 0, 8.9, 0); break;
    default: break;
  }
  if (parts.length === 0) return null;
  const geometries = parts.map((part) => {
    part.updateMatrix();
    return (part as THREE.Mesh).geometry.clone().applyMatrix4(part.matrix);
  });
  const merged = mergeGeometries(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  return merged ? mesh(merged, material) : null;
}

// ------------------------------------------------------------------ pose

const POSE_KEYS = [
  "bodyY", "bodyX", "bodyZ", "bodyRotX", "bodyRotZ",
  "torsoX", "torsoY", "torsoZ",
  "neckX", "neckY",
  "shLX", "shLZ", "shRX", "shRZ", "elL", "elR",
  "hipLX", "hipLZ", "hipRX", "hipRZ", "kneeL", "kneeR",
] as const;

type PoseKey = (typeof POSE_KEYS)[number];
type Pose = Record<PoseKey, number>;

function zeroPose(): Pose {
  return Object.fromEntries(POSE_KEYS.map((key) => [key, 0])) as Pose;
}

function addPose(target: Pose, source: Partial<Pose>, weight: number) {
  if (weight <= 0.0001) return;
  for (const key in source) {
    target[key as PoseKey] += (source[key as PoseKey] ?? 0) * weight;
  }
}

function blendPose(target: Pose, source: Partial<Pose>, weight: number) {
  if (weight <= 0.0001) return;
  for (const key in source) {
    const k = key as PoseKey;
    target[k] += ((source[k] ?? 0) - target[k]) * weight;
  }
}

function approach(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function angleDelta(from: number, to: number) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

const smooth = (value: number) => value * value * (3 - 2 * value);

// ---------------------------------------------------------------- figura

export type FigureState =
  | "idle"
  | "ready"
  | "aim"
  | "run"
  | "pushed"
  | "celebrate"
  | "scorer"
  | "sad"
  | "keeper";

export type FigureIntent = {
  state: FigureState;
  /** Velocidade de deslocamento em unidades de campo/s (para a passada). */
  speed: number;
  /** Direção do movimento no mundo (radianos, mesma convenção de yaw). */
  heading: number;
  /** Para onde o corpo deve virar; `null` mantém. */
  faceYaw: number | null;
  /** Ponto que a cabeça acompanha (normalmente a bola). */
  look: { x: number; z: number } | null;
  aimRatio: number;
  /** Goleiro: -1..1 para o mergulho, 0 parado. */
  dive: number;
  /** Goleiro: deslocamento lateral por segundo (passinho). */
  shuffle: number;
};

export type FigureOptions = {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  number: number;
  keeper?: boolean;
  keeperColor?: string;
  captain?: boolean;
  seed?: number;
};

const BOOT_COLORS = ["#141414", "#141414", "#f4f4f2", "#141414", "#ff5a36", "#2f7bff", "#ffd23f", "#2fd38a", "#141414", "#e8e8e8"];
const CELEBRATIONS = ["jump", "fist", "clap", "jump", "fist"] as const;
const SADNESS = ["head", "knees", "head", "slump"] as const;

export class PlayerFigure {
  readonly root = new THREE.Group();
  readonly model = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly shoulderL = new THREE.Group();
  private readonly shoulderR = new THREE.Group();
  private readonly elbowL = new THREE.Group();
  private readonly elbowR = new THREE.Group();
  private readonly hipL = new THREE.Group();
  private readonly hipR = new THREE.Group();
  private readonly kneeL = new THREE.Group();
  private readonly kneeR = new THREE.Group();
  private readonly blob: THREE.Mesh;
  private readonly faceMaterial: THREE.MeshStandardMaterial;
  private readonly headTextures: HeadTextures;
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  /** Cabelo fundido é geometria própria de cada boneco (o resto é compartilhado). */
  private hairGeometry: THREE.BufferGeometry | null = null;

  yaw = 0;
  private spin = 0;
  private time = Math.random() * 10;
  private readonly offset: number;
  private runPhase = 0;
  private stepPhase = 0;
  private mood: FaceMood = "normal";
  private blinkIn = 2 + Math.random() * 3;
  private blinkFor = 0;
  private kickT = -1;
  private kickPower = 1;
  private lungeT = -1;
  private tremble = 0;
  private readonly celebration: (typeof CELEBRATIONS)[number];
  private readonly sadness: (typeof SADNESS)[number];
  private readonly weights: Record<FigureState | "step", number> = {
    idle: 1, ready: 0, aim: 0, run: 0, pushed: 0, celebrate: 0, scorer: 0, sad: 0, keeper: 0, step: 0,
  };
  private aimRatio = 0;
  private dive = 0;
  private shuffle = 0;
  private headYaw = 0;
  private headPitch = 0;
  private pushLocalX = 0;
  private pushLocalZ = 0;
  private readonly pose = zeroPose();

  constructor(options: FigureOptions) {
    const seed = options.seed ?? options.number * 7919;
    this.offset = (seed % 997) / 97;
    this.celebration = CELEBRATIONS[seed % CELEBRATIONS.length];
    this.sadness = SADNESS[(seed >> 3) % SADNESS.length];
    const look = resolveLook(options.appearance);
    const pattern = look.kitPattern;
    const shirtPrimary = options.keeper ? options.keeperColor ?? "#c6ff3d" : options.primary;
    const shirtSecondary = options.keeper ? shadeHex(shirtPrimary, -70) : options.secondary;

    // ------------------------------------------------------------- materiais
    // Cabeça e camisa usam atlas: uma textura e um draw call por caixa.
    this.headTextures = createHeadTextures(look);
    this.textures.push(...Object.values(this.headTextures));
    const track = <T extends THREE.Material>(material: T) => {
      this.materials.push(material);
      return material;
    };
    this.faceMaterial = track(new THREE.MeshStandardMaterial({ map: this.headTextures.normal, roughness: 0.78 }));
    const kit = createKitTextures({ pattern: options.keeper ? 1 : pattern, primary: shirtPrimary, secondary: shirtSecondary, number: options.number });
    this.textures.push(kit.torso);
    const torsoMaterial = track(new THREE.MeshStandardMaterial({ map: kit.torso, roughness: 0.86 }));
    const skin = track(solid(look.skin, 0.75));
    const hand = track(solid(shadeHex(look.skin, -10), 0.75));
    const sleeve = track(solid(options.keeper ? shirtPrimary : sleeveColor(pattern, shirtPrimary, shirtSecondary), 0.86));
    const shortsColor = options.keeper ? "#1d2228" : shirtSecondary === shirtPrimary ? shadeHex(shirtPrimary, -40) : shirtSecondary;
    const shorts = track(solid(shortsColor, 0.88));
    const sockMap = stripeTexture([[options.keeper ? "#1d2228" : shirtSecondary, 0.22], [options.keeper ? shadeHex(shirtPrimary, -20) : shirtPrimary, 0.78]]);
    const bootMap = stripeTexture([[BOOT_COLORS[seed % BOOT_COLORS.length], 0.74], ["#2b2b2b", 0.26]]);
    this.textures.push(sockMap, bootMap);
    const socks = track(new THREE.MeshStandardMaterial({ map: sockMap, roughness: 0.9 }));
    const boots = track(new THREE.MeshStandardMaterial({ map: bootMap, roughness: 0.5 }));
    const gloves = track(solid(mixHex(shirtPrimary, "#ffffff", 0.35), 0.6));
    const hairMaterial = track(solid(look.hairTop, 0.92));
    const armband = track(new THREE.MeshStandardMaterial({ color: "#ffc72c", emissive: "#6b4b00", roughness: 0.4, metalness: 0.3 }));

    // ------------------------------------------------------------- esqueleto
    this.root.add(this.model);
    this.model.scale.setScalar(PX);
    this.model.add(this.body);

    const hips = new THREE.Group();
    hips.position.y = 12;
    this.body.add(hips);
    hips.add(this.torso);
    place(this.torso, mesh(atlasBoxGeometry(8, 12, 4), torsoMaterial), 6);

    this.neck.position.y = 12;
    this.torso.add(this.neck);
    place(this.neck, mesh(atlasBoxGeometry(8, 8, 8), this.faceMaterial), 4);
    const hair = buildHair(look, hairMaterial);
    if (hair) {
      this.neck.add(hair);
      this.hairGeometry = hair.geometry;
    }

    // Peças pequenas não projetam sombra: metade dos draw calls do passe de sombra.
    const small = (piece: THREE.Mesh) => {
      piece.castShadow = false;
      return piece;
    };
    const arm = (shoulder: THREE.Group, elbow: THREE.Group, side: 1 | -1) => {
      shoulder.position.set(6 * side, 11.5, 0);
      this.torso.add(shoulder);
      place(shoulder, mesh(box(4, 5.2, 4), sleeve), -2.4);
      if (options.captain && side === 1) place(shoulder, small(mesh(box(4.3, 1.2, 4.3), armband)), -3.6);
      elbow.position.y = -4.9;
      shoulder.add(elbow);
      place(elbow, mesh(box(3.6, 5, 3.6), skin), -2.4);
      place(elbow, small(options.keeper ? mesh(box(4.6, 3, 4.6), gloves) : mesh(box(3.8, 2.2, 3.8), hand)), -5.6);
    };
    arm(this.shoulderL, this.elbowL, 1);
    arm(this.shoulderR, this.elbowR, -1);

    const leg = (hip: THREE.Group, knee: THREE.Group, side: 1 | -1) => {
      hip.position.set(2.05 * side, 0.4, 0);
      hips.add(hip);
      place(hip, mesh(box(4.25, 5.6, 4.3), shorts), -2.5);
      knee.position.y = -5.6;
      hip.add(knee);
      place(knee, mesh(box(3.75, 4.9, 3.75), socks), -1.9);
      const boot = mesh(box(4.05, 2.6, 5.25), boots);
      boot.position.set(0, -5.4, 0.55);
      knee.add(boot);
    };
    leg(this.hipL, this.kneeL, 1);
    leg(this.hipR, this.kneeR, -1);

    this.blob = contactShadow();
    this.blob.scale.set(24, 24, 1);
    this.root.add(this.blob);
    this.materials.push(this.blob.material as THREE.Material);
  }

  // ------------------------------------------------------------- gatilhos

  /** Contato com a bola: o chute em si (perna de trás vem e varre). */
  triggerKick(power = 1) {
    if (this.kickT >= 0 && this.kickT < 0.55) return;
    this.kickT = 0;
    this.kickPower = Math.max(0.45, Math.min(1, power));
  }

  /** Arranque ao soltar o estilingue: inclina e joga os braços para trás. */
  triggerLunge() {
    this.lungeT = 0;
  }

  /** Teletransporte (troca de formação, pênalti): esquece o embalo. */
  snapYaw(yaw: number) {
    this.yaw = yaw;
    this.root.rotation.y = yaw;
  }

  // ------------------------------------------------------------ animação

  update(dt: number, intent: FigureIntent) {
    this.time += dt;
    const t = this.time + this.offset;
    const w = this.weights;

    // Alvos de mistura: um estado dominante, mais corrida conforme a velocidade.
    const moving = Math.min(1, intent.speed / 105);
    const targets: Record<FigureState | "step", number> = {
      idle: 0, ready: 0, aim: 0, run: 0, pushed: 0, celebrate: 0, scorer: 0, sad: 0, keeper: 0, step: 0,
    };
    if (intent.state === "pushed") targets.pushed = Math.max(0.35, moving);
    else if (intent.state === "run") targets.run = moving;
    else if (intent.state !== "idle") targets[intent.state] = 1;
    if (intent.state === "ready" || intent.state === "idle") {
      // Andando na troca de posição, mesmo sem ser "run", a passada aparece.
      targets.run = Math.max(targets.run, moving);
    }
    const occupied = targets.ready + targets.aim + targets.run + targets.pushed + targets.celebrate + targets.scorer + targets.sad + targets.keeper;
    targets.idle = Math.max(0, 1 - occupied);
    if (intent.state === "ready" || intent.state === "idle") targets[intent.state] = Math.max(targets[intent.state], 1 - targets.run);

    // Giro do corpo. Mirando o giro é quase instantâneo; parado é um passinho.
    let turnRate = 5;
    if (intent.state === "aim") turnRate = 16;
    else if (intent.state === "run" || moving > 0.4) turnRate = 10;
    else if (intent.state === "pushed") turnRate = 0;
    let turning = 0;
    if (intent.faceYaw !== null && turnRate > 0) {
      const delta = angleDelta(this.yaw, intent.faceYaw);
      const step = Math.sign(delta) * Math.min(Math.abs(delta), turnRate * dt);
      this.yaw += step;
      turning = Math.abs(step) / Math.max(dt, 0.0001);
    }
    targets.step = intent.speed < 20 && turning > 0.6 && intent.state !== "aim" && intent.state !== "celebrate" && intent.state !== "scorer" ? 1 : 0;
    if (intent.state === "scorer") this.spin += dt * 2.6;
    else this.spin = approach(this.spin, Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2, 4, dt);

    const blendRate = intent.state === "aim" ? 14 : 9;
    for (const key of Object.keys(w) as Array<keyof typeof w>) w[key] = approach(w[key], targets[key], blendRate, dt);
    this.aimRatio = approach(this.aimRatio, intent.aimRatio, 22, dt);
    this.dive = approach(this.dive, intent.dive, intent.dive !== 0 ? 11 : 4, dt);
    this.shuffle = approach(this.shuffle, intent.shuffle, 8, dt);

    // Passada: a frequência acompanha a velocidade até um sprint convincente.
    const frequency = Math.min(3.7, 1.1 + intent.speed / 95);
    this.runPhase += dt * Math.PI * 2 * frequency;
    this.stepPhase += dt * Math.PI * 2 * (targets.step > 0 || w.step > 0.05 ? 2.4 : 0);

    // Empurrão: o tronco fica para trás em relação ao deslocamento.
    const localHeading = intent.heading - this.yaw;
    this.pushLocalX = approach(this.pushLocalX, Math.sin(localHeading) * moving, 8, dt);
    this.pushLocalZ = approach(this.pushLocalZ, Math.cos(localHeading) * moving, 8, dt);

    // Cabeça acompanha a bola (com limite de pescoço).
    let wantYaw = 0;
    let wantPitch = 0.08;
    if (intent.look) {
      const dx = intent.look.x - this.root.position.x;
      const dz = intent.look.z - this.root.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 2) {
        wantYaw = Math.max(-1.05, Math.min(1.05, angleDelta(this.yaw + this.spin, Math.atan2(dx, dz))));
        wantPitch = Math.max(0.05, Math.min(0.5, 14 / Math.max(14, distance) * 0.9));
      }
    }
    const lookWeight = 1 - Math.min(1, w.celebrate + w.scorer + w.sad + w.aim * 0.8);
    this.headYaw = approach(this.headYaw, wantYaw * lookWeight, 7, dt);
    this.headPitch = approach(this.headPitch, wantPitch * lookWeight, 5, dt);

    // ------------------------------------------------------- composição
    const pose = this.pose;
    for (const key of POSE_KEYS) pose[key] = 0;

    const breath = Math.sin(t * 2.3);
    addPose(pose, {
      bodyY: 0.12 * breath,
      torsoX: 0.02 * breath,
      shLZ: 0.08 + 0.02 * breath, shRZ: -0.08 - 0.02 * breath,
      shLX: 0.04 * Math.sin(t * 0.9), shRX: -0.04 * Math.sin(t * 0.9),
      elL: -0.12, elR: -0.12,
      hipLZ: 0.03 * Math.sin(t * 0.7), hipRZ: 0.03 * Math.sin(t * 0.7),
      bodyRotZ: 0.025 * Math.sin(t * 0.7),
    }, w.idle);

    const bounce = Math.abs(Math.sin(t * Math.PI * 1.9));
    addPose(pose, {
      bodyY: -0.85 + bounce * 0.45,
      torsoX: 0.2,
      neckX: -0.12,
      hipLX: -0.22, hipRX: -0.22, kneeL: 0.42, kneeR: 0.42,
      hipLZ: 0.07, hipRZ: -0.07,
      shLX: -0.32, shRX: -0.32, shLZ: 0.28, shRZ: -0.28, elL: -0.7, elR: -0.7,
    }, w.ready);

    const ratio = this.aimRatio;
    this.tremble = ratio > 0.82 ? Math.sin(t * 64) * 0.18 * (ratio - 0.82) / 0.18 : 0;
    addPose(pose, {
      bodyY: -1.5 - ratio * 0.6,
      bodyX: this.tremble * 0.6,
      torsoX: 0.28 + ratio * 0.12,
      torsoY: 0.18 * ratio,
      neckX: -0.22,
      shLX: -0.25 - ratio * 0.3, shLZ: 0.7 + ratio * 0.35, elL: -0.35,
      shRX: 0.2 + ratio * 0.45, shRZ: -0.55 - ratio * 0.2, elR: -0.3,
      hipLX: -0.32, kneeL: 0.48,
      hipRX: 0.25 + ratio * 0.95, kneeR: 0.55 + ratio * 0.95,
    }, w.aim);

    // Corrida.
    const runS = Math.sin(this.runPhase);
    const runC = Math.cos(this.runPhase);
    const stride = 0.55 + 0.45 * moving;
    addPose(pose, {
      bodyY: 0.9 * Math.abs(runC) - 0.4,
      torsoX: 0.12 + 0.22 * moving,
      torsoY: 0.16 * runS,
      neckX: -0.1 - 0.1 * moving,
      hipLX: 0.85 * runS * stride, hipRX: -0.85 * runS * stride,
      kneeL: 0.2 + 1.15 * Math.max(0, -runC) * stride, kneeR: 0.2 + 1.15 * Math.max(0, runC) * stride,
      shLX: -0.85 * runS * stride, shRX: 0.85 * runS * stride,
      shLZ: 0.12, shRZ: -0.12,
      elL: -1.05, elR: -1.05,
    }, w.run);

    // Passinho de giro no lugar.
    const stepS = Math.sin(this.stepPhase);
    addPose(pose, {
      hipLX: 0.32 * stepS, hipRX: -0.32 * stepS,
      kneeL: 0.35 * Math.max(0, stepS), kneeR: 0.35 * Math.max(0, -stepS),
      bodyY: 0.25 * Math.abs(stepS),
    }, w.step * (1 - w.run));

    // Empurrado: corpo atrasado, braços se debatendo.
    const flail = Math.sin(t * 17);
    addPose(pose, {
      bodyRotX: -0.42 * this.pushLocalZ,
      bodyRotZ: 0.42 * this.pushLocalX,
      shLX: -1 + 0.7 * flail, shRX: -1 - 0.7 * flail,
      shLZ: 1 + 0.35 * flail, shRZ: -1 + 0.35 * flail,
      elL: -0.4, elR: -0.4,
      hipLX: 0.35 * Math.sin(t * 21), hipRX: -0.35 * Math.sin(t * 21),
      kneeL: 0.3, kneeR: 0.3,
    }, w.pushed);

    // Comemoração.
    const beat = t * Math.PI * 2 * 1.6;
    const hop = Math.max(0, Math.sin(beat));
    if (this.celebration === "jump") {
      addPose(pose, {
        bodyY: 6.5 * hop,
        shLX: -2.85, shRX: -2.85 + 0.25 * Math.sin(beat * 2), shLZ: 0.3, shRZ: -0.3,
        elL: -0.25 * (1 - hop), elR: -0.25 * (1 - hop),
        hipLX: -0.55 * hop, hipRX: -0.55 * hop, kneeL: 1.1 * hop, kneeR: 1.1 * hop,
        neckX: -0.3,
      }, w.celebrate);
    } else if (this.celebration === "fist") {
      addPose(pose, {
        bodyY: 0.8 * hop,
        shRX: -2.55 + 0.4 * Math.sin(beat * 1.5), shRZ: -0.25, elR: -1.15 + 0.5 * Math.sin(beat * 1.5),
        shLX: -0.4, shLZ: 0.3, elL: -1.3,
        torsoX: -0.16, neckX: -0.35, torsoY: 0.2,
        hipLX: -0.15, kneeL: 0.25,
      }, w.celebrate);
    } else {
      const clap = Math.abs(Math.sin(beat * 1.3));
      addPose(pose, {
        bodyY: 0.6 * hop,
        shLX: -1.45, shRX: -1.45, shLZ: -0.05 + 0.45 * clap, shRZ: 0.05 - 0.45 * clap,
        elL: -0.5, elR: -0.5,
        neckX: -0.15,
      }, w.celebrate);
    }

    // Autor do gol: avião girando.
    addPose(pose, {
      bodyY: 0.6 * Math.abs(Math.sin(t * 7)),
      bodyRotZ: 0.28 * Math.sin(t * 3.2),
      torsoX: 0.18,
      shLZ: 1.48, shRZ: -1.48, shLX: -0.1, shRX: -0.1,
      hipLX: 0.5 * Math.sin(t * 13), hipRX: -0.5 * Math.sin(t * 13),
      kneeL: 0.5 * Math.max(0, -Math.cos(t * 13)), kneeR: 0.5 * Math.max(0, Math.cos(t * 13)),
      neckX: -0.25,
    }, w.scorer);

    // Gol sofrido.
    if (this.sadness === "head") {
      addPose(pose, {
        shLX: -2.45, shRX: -2.45, shLZ: 0.62, shRZ: -0.62, elL: -2.05, elR: -2.05,
        neckX: 0.45, torsoX: -0.08,
      }, w.sad);
    } else if (this.sadness === "knees") {
      addPose(pose, {
        bodyY: -2.2, torsoX: 0.75, neckX: 0.2,
        hipLX: -0.55, hipRX: -0.55, kneeL: 1.05, kneeR: 1.05,
        shLX: -0.85, shRX: -0.85, shLZ: 0.12, shRZ: -0.12, elL: -0.05, elR: -0.05,
      }, w.sad);
    } else {
      addPose(pose, {
        torsoX: 0.3, neckX: 0.62, bodyY: -0.4,
        shLZ: 0.05, shRZ: -0.05, shLX: 0.1, shRX: 0.1,
        kneeL: 0.12, kneeR: 0.12,
      }, w.sad);
    }

    // Goleiro: base larga, luvas para cima, passinho lateral.
    const shuffleBeat = Math.sin(t * 15) * Math.min(1, Math.abs(this.shuffle) / 120);
    addPose(pose, {
      bodyY: -1.8 + Math.abs(shuffleBeat) * 0.6,
      torsoX: 0.36,
      neckX: -0.3,
      hipLZ: 0.26 + 0.12 * shuffleBeat, hipRZ: -0.26 + 0.12 * shuffleBeat,
      hipLX: -0.3, hipRX: -0.3,
      kneeL: 0.62, kneeR: 0.62,
      shLX: -0.75, shRX: -0.75, shLZ: 0.85, shRZ: -0.85, elL: -0.95, elR: -0.95,
    }, w.keeper);

    // Arranque logo depois de soltar.
    if (this.lungeT >= 0) {
      this.lungeT += dt / 0.3;
      const envelope = Math.sin(Math.min(1, this.lungeT) * Math.PI);
      addPose(pose, { torsoX: 0.4, shLX: 0.9, shRX: 0.9, bodyY: -0.6 }, envelope);
      if (this.lungeT >= 1) this.lungeT = -1;
    }

    // Chute: sobrepõe as pernas (não soma) para o golpe ficar limpo.
    if (this.kickT >= 0) {
      this.kickT += dt / 0.36;
      const u = Math.min(1, this.kickT);
      const envelope = u < 0.12 ? smooth(u / 0.12) : u > 0.7 ? smooth((1 - u) / 0.3) : 1;
      let hipR: number;
      let kneeR: number;
      if (u < 0.18) {
        const k = smooth(u / 0.18);
        hipR = 0.4 + 0.65 * k;
        kneeR = 0.6 + 0.7 * k;
      } else if (u < 0.45) {
        const k = 1 - Math.pow(1 - (u - 0.18) / 0.27, 3);
        hipR = 1.05 - (1.05 + 1.35 * this.kickPower) * k;
        kneeR = 1.3 - 1.25 * k;
      } else {
        const k = smooth((u - 0.45) / 0.55);
        hipR = -1.35 * this.kickPower * (1 - k);
        kneeR = 0.05 + 0.25 * k;
      }
      blendPose(pose, {
        hipRX: hipR, kneeR, hipLX: -0.12, kneeL: 0.32,
        torsoX: -0.22 * this.kickPower, torsoY: -0.25,
        shLX: -0.85, shLZ: 1.05, elL: -0.35,
        shRX: 0.6, shRZ: -0.75, elR: -0.3,
        bodyY: -0.3 + 0.8 * Math.sin(u * Math.PI),
      }, envelope);
      if (this.kickT >= 1) this.kickT = -1;
    }

    // Mergulho do goleiro: tudo vira para o lado da bola.
    const dive = this.dive;
    if (Math.abs(dive) > 0.01) {
      const amount = Math.min(1, Math.abs(dive));
      const side = Math.sign(dive);
      blendPose(pose, {
        bodyRotZ: -side * 1.2,
        bodyY: 4.5,
        bodyX: side * 6,
        torsoX: 0.05,
        shLX: -2.95, shRX: -2.95, shLZ: 0.15, shRZ: -0.15, elL: 0, elR: 0,
        hipLX: -0.2, hipRX: 0.25, kneeL: 0.4, kneeR: 0.2,
        hipLZ: 0.2 * side, hipRZ: 0.2 * side,
      }, amount);
    }

    pose.neckY += this.headYaw;
    pose.neckX += -this.headPitch * 0.8;

    // ------------------------------------------------------------ aplica
    this.root.rotation.y = this.yaw + this.spin;
    this.body.position.set(pose.bodyX, pose.bodyY, pose.bodyZ);
    this.body.rotation.set(pose.bodyRotX, 0, pose.bodyRotZ);
    this.torso.rotation.set(pose.torsoX, pose.torsoY, pose.torsoZ);
    this.neck.rotation.set(pose.neckX, pose.neckY, 0);
    this.shoulderL.rotation.set(pose.shLX, 0, pose.shLZ);
    this.shoulderR.rotation.set(pose.shRX, 0, pose.shRZ);
    this.elbowL.rotation.x = pose.elL;
    this.elbowR.rotation.x = pose.elR;
    this.hipL.rotation.set(pose.hipLX, 0, pose.hipLZ);
    this.hipR.rotation.set(pose.hipRX, 0, pose.hipRZ);
    this.kneeL.rotation.x = pose.kneeL;
    this.kneeR.rotation.x = pose.kneeR;

    // Sombra de contato encolhe no pulo.
    const lift = Math.max(0, pose.bodyY) * PX;
    const blobScale = 25 * (1 - Math.min(0.45, lift / 22)) + Math.abs(pose.bodyX) * 0.6;
    this.blob.scale.set(blobScale, blobScale, 1);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = 1 - Math.min(0.5, lift / 18);

    // Rosto: piscar, grito de gol, tristeza.
    let mood: FaceMood = "normal";
    if (w.celebrate + w.scorer > 0.5) mood = "shout";
    else if (w.sad > 0.5) mood = "sad";
    else {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkFor = 0.13;
        this.blinkIn = 1.8 + Math.random() * 3.6;
      }
      if (this.blinkFor > 0) {
        this.blinkFor -= dt;
        mood = "blink";
      }
    }
    if (mood !== this.mood) {
      this.mood = mood;
      this.faceMaterial.map = this.headTextures[mood];
      this.faceMaterial.needsUpdate = true;
    }
  }

  dispose() {
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.hairGeometry?.dispose();
  }
}

export function idleIntent(overrides: Partial<FigureIntent> = {}): FigureIntent {
  return {
    state: "idle",
    speed: 0,
    heading: 0,
    faceYaw: null,
    look: null,
    aimRatio: 0,
    dive: 0,
    shuffle: 0,
    ...overrides,
  };
}

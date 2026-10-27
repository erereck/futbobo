// Boneco de blocos (linha Block Strike) com esqueleto simples e animação
// procedural. Nada de clipe pronto: cada pose é uma soma ponderada de poucos
// ângulos, o que deixa as transições sempre suaves — o jogador pode sair de
// "mirando" para "correndo" para "chutando" no meio do caminho sem estalo.
//
// Camadas, de baixo para cima: estados (parado, mira, corrida, goleiro...),
// mola do tronco, freada, tiques de quem está parado, AÇÕES declarativas
// (comemorações e reações pedidas pela coreografia), arranque, chute e
// mergulho do goleiro. Tudo escreve no mesmo `Pose` reaproveitado: nenhuma
// alocação por quadro.
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
  headBoxGeometry,
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

const TAU = Math.PI * 2;
/** Altura (px) do pivô de giro do corpo: quadril, não os pés (mortal, mergulho). */
const PIVOT_H = 13;

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

// ------------------------------------------------------- contorno de luz

const RIM_DEFAULT = "#fff1c2";
const RIM_PROGRAM_KEY = "futbobo-figure-rim-v2";
const RIM_MAX = 0.6;
/** Raio (unidades de campo) da cápsula pé→cabeça que define a borda do boneco. */
const RIM_RADIUS = 10.5;

type RimUniforms = {
  uRimStrength: { value: number };
  uRimColor: { value: THREE.Color };
  /** Eixo do boneco no mundo (perto dos pés → perto do topo da cabeça). */
  uRimA: { value: THREE.Vector3 };
  uRimB: { value: THREE.Vector3 };
};

const RIM_VERTEX_HEAD = "#include <common>\nuniform vec3 uRimA;\nuniform vec3 uRimB;\nvarying vec2 vRimA;\nvarying vec2 vRimB;";
const RIM_VERTEX_BODY = [
  "#include <project_vertex>",
  "vRimA = ( viewMatrix * vec4( uRimA, 1.0 ) ).xy;",
  "vRimB = ( viewMatrix * vec4( uRimB, 1.0 ) ).xy;",
].join("\n");
const RIM_FRAGMENT_HEAD = "#include <common>\nuniform float uRimStrength;\nuniform vec3 uRimColor;\nvarying vec2 vRimA;\nvarying vec2 vRimB;";
const RIM_FRAGMENT_BODY = [
  "if ( uRimStrength > 0.001 ) {",
  // Distância, na tela, até o eixo do boneco: só a faixa de fora acende.
  "  vec2 rimP = -vViewPosition.xy;",
  "  vec2 rimAB = vRimB - vRimA;",
  "  float rimH = clamp( dot( rimP - vRimA, rimAB ) / max( dot( rimAB, rimAB ), 1e-4 ), 0.0, 1.0 );",
  `  float rimEdge = smoothstep( 0.3, 0.85, length( rimP - vRimA - rimAB * rimH ) / ${RIM_RADIUS.toFixed(1)} );`,
  // Fresnel da face: só as faces de raspão (a silhueta) acendem, com recorte limpo.
  "  float rimFresnel = smoothstep( 0.42, 0.88, 1.0 - saturate( dot( normalize( normal ), normalize( vViewPosition ) ) ) );",
  "  outgoingLight += uRimColor * ( 1.9 * uRimStrength * rimEdge * rimFresnel );",
  "}",
  "#include <opaque_fragment>",
].join("\n");

/**
 * Luz de recorte nas bordas do boneco: destaca o time sem seta nem plaqueta.
 * Em boneco de caixas o fresnel puro acende faces inteiras; aqui ele é
 * recortado por uma cápsula em volta do eixo do boneco (na tela), então só a
 * silhueta brilha, de qualquer ângulo de câmera. Os uniforms são do boneco e
 * divididos por todos os materiais dele; a chave fixa de programa faz todos os
 * bonecos usarem os mesmos shaders (nenhum programa novo por boneco).
 */
function installRim(material: THREE.MeshStandardMaterial, uniforms: RimUniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimStrength = uniforms.uRimStrength;
    shader.uniforms.uRimColor = uniforms.uRimColor;
    shader.uniforms.uRimA = uniforms.uRimA;
    shader.uniforms.uRimB = uniforms.uRimB;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", RIM_VERTEX_HEAD)
      .replace("#include <project_vertex>", RIM_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", RIM_FRAGMENT_HEAD)
      .replace("#include <opaque_fragment>", RIM_FRAGMENT_BODY);
  };
  material.customProgramCacheKey = () => RIM_PROGRAM_KEY;
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
  "bodyX", "bodyY", "bodyZ", "bodyRotX", "bodyRotZ",
  // Giro em volta do quadril (mortal, mergulho) e meia-volta do modelo (siuuu).
  "pivX", "pivZ", "spinY",
  "hipsY",
  "torsoX", "torsoY", "torsoZ",
  "neckX", "neckY", "neckZ",
  "shLX", "shLY", "shLZ", "shRX", "shRY", "shRZ", "elL", "elR",
  "hipLX", "hipLZ", "hipRX", "hipRZ", "kneeL", "kneeR", "ankleL", "ankleR",
] as const;

type PoseKey = (typeof POSE_KEYS)[number];
type Pose = Record<PoseKey, number>;

const KEY_COUNT = POSE_KEYS.length;
const ARM_KEYS: readonly PoseKey[] = ["shLX", "shLY", "shLZ", "shRX", "shRY", "shRZ", "elL", "elR"];
const TRUNK_KEYS: readonly PoseKey[] = ["torsoX", "torsoY", "torsoZ", "neckX", "neckY", "neckZ"];
const LOWER_KEYS: readonly PoseKey[] = [
  "bodyX", "bodyY", "bodyZ", "bodyRotX", "bodyRotZ", "pivX", "pivZ", "spinY", "hipsY",
  "hipLX", "hipLZ", "hipRX", "hipRZ", "kneeL", "kneeR", "ankleL", "ankleR",
];
const KICK_KEYS: readonly PoseKey[] = [
  "bodyY", "torsoX", "torsoY", "neckX",
  "shLX", "shLY", "shLZ", "shRX", "shRY", "shRZ", "elL", "elR",
  "hipLX", "hipLZ", "hipRX", "hipRZ", "kneeL", "kneeR", "ankleL", "ankleR",
];
const LUNGE_KEYS: readonly PoseKey[] = [
  "bodyY", "torsoX", "shLX", "shLZ", "elL", "shRX", "shRZ", "elR", "hipLX", "kneeL", "hipRX", "kneeR",
];
/** Tudo menos a meia-volta (o mergulho manda no corpo inteiro). */
const BODY_KEYS: readonly PoseKey[] = POSE_KEYS.filter((key) => key !== "spinY");
const BRAKE_KEYS: readonly PoseKey[] = [
  "bodyY", "bodyRotX", "torsoX", "torsoZ", "hipsY",
  "shLX", "shLY", "shLZ", "shRX", "shRY", "shRZ", "elL", "elR",
  "hipLX", "hipLZ", "hipRX", "hipRZ", "kneeL", "kneeR", "ankleL", "ankleR",
];
const MIRROR_SWAP: ReadonlyArray<readonly [PoseKey, PoseKey]> = [
  ["shLX", "shRX"], ["shLY", "shRY"], ["shLZ", "shRZ"], ["elL", "elR"],
  ["hipLX", "hipRX"], ["hipLZ", "hipRZ"], ["kneeL", "kneeR"], ["ankleL", "ankleR"],
];
const MIRROR_NEGATE: readonly PoseKey[] = [
  "shLY", "shRY", "shLZ", "shRZ", "hipLZ", "hipRZ",
  "torsoY", "torsoZ", "neckY", "neckZ", "bodyX", "bodyRotZ", "pivZ", "spinY", "hipsY",
];

function zeroPose(): Pose {
  return Object.fromEntries(POSE_KEYS.map((key) => [key, 0])) as Pose;
}

function clearPose(pose: Pose) {
  for (let index = 0; index < KEY_COUNT; index += 1) pose[POSE_KEYS[index]] = 0;
}

function copyPose(target: Pose, source: Pose) {
  for (let index = 0; index < KEY_COUNT; index += 1) {
    const key = POSE_KEYS[index];
    target[key] = source[key];
  }
}

function addPose(target: Pose, source: Pose, weight: number) {
  if (weight <= 0.0001) return;
  for (let index = 0; index < KEY_COUNT; index += 1) {
    const key = POSE_KEYS[index];
    target[key] += source[key] * weight;
  }
}

/** Puxa só as chaves pedidas de `target` em direção a `source`. */
function blendKeys(target: Pose, source: Pose, weight: number, keys: readonly PoseKey[]) {
  if (weight <= 0.0001) return;
  const amount = Math.min(1, weight);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    target[key] += (source[key] - target[key]) * amount;
  }
}

/** Troca esquerda e direita (canhoto, ajoelhar no outro joelho...). */
function mirrorPose(pose: Pose) {
  for (let index = 0; index < MIRROR_SWAP.length; index += 1) {
    const pair = MIRROR_SWAP[index];
    const value = pose[pair[0]];
    pose[pair[0]] = pose[pair[1]];
    pose[pair[1]] = value;
  }
  for (let index = 0; index < MIRROR_NEGATE.length; index += 1) pose[MIRROR_NEGATE[index]] *= -1;
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

const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (value: number) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};
const easeOut = (value: number) => {
  const x = 1 - clamp01(value);
  return 1 - x * x;
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, start: number, end: number) => clamp01((t - start) / (end - start));
/** Ângulo levado para (-π, π] (o mortal termina em -2π ≡ 0 sem girar de volta). */
const wrapAngle = (value: number) => value - TAU * Math.round(value / TAU);

// ------------------------------------------------------------ keyframes

/** Trilha [t0, v0, t1, v1, ...] com suavização entre as chaves. */
type Track = readonly number[];
type KeyTrack = readonly [PoseKey, Track];

function sampleTrack(track: Track, t: number) {
  const count = track.length;
  if (t <= track[0]) return track[1];
  for (let index = 2; index < count; index += 2) {
    if (t <= track[index]) {
      const t0 = track[index - 2];
      const v0 = track[index - 1];
      const k = (t - t0) / (track[index] - t0);
      return v0 + (track[index + 1] - v0) * (k * k * (3 - 2 * k));
    }
  }
  return track[count - 1];
}

function applyTracks(out: Pose, tracks: readonly KeyTrack[], t: number) {
  for (let index = 0; index < tracks.length; index += 1) {
    const entry = tracks[index];
    out[entry[0]] = sampleTrack(entry[1], t);
  }
}

/** A mesma trilha nos dois lados; `negate` para os eixos que espelham (Y/Z). */
function both(left: PoseKey, right: PoseKey, track: Track, negate = false): KeyTrack[] {
  return [[left, track], [right, negate ? track.map((value, index) => (index % 2 ? -value : value)) : track]];
}

// ----------------------------------------------------------- braços prontos

/** Ângulos do braço ESQUERDO (x, y, z, cotovelo); o direito é o espelho. */
type Arm = readonly [number, number, number, number];

// Calculados por cinemática inversa no esqueleto (ombro em ±6, 11.5; braço 4.9 + 5.6).
const ARM_REST: Arm = [0, 0, 0.09, -0.14];
const ARM_HIPS: Arm = [0.72, -1.01, 0.66, -0.84];
const ARM_HEAD: Arm = [-1.41, -1.33, 1.78, -1.03];
const ARM_HEAD_LOW: Arm = [-1.36, -1.19, 1.81, -1.32];
const ARM_CLAP: Arm = [-0.87, -0.77, -0.23, -1.06];
const ARM_CLAP_OPEN: Arm = [-0.43, -0.48, 0.24, -1.45];
const ARM_HUG: Arm = [-0.49, -0.84, 1.1, -1.34];
const ARM_SOCK: Arm = [-1.14, -1.46, -0.43, -0.59];

function putL(out: Pose, a: Arm, b: Arm = a, k = 0) {
  out.shLX = mix(a[0], b[0], k);
  out.shLY = mix(a[1], b[1], k);
  out.shLZ = mix(a[2], b[2], k);
  out.elL = mix(a[3], b[3], k);
}

function putR(out: Pose, a: Arm, b: Arm = a, k = 0) {
  out.shRX = mix(a[0], b[0], k);
  out.shRY = -mix(a[1], b[1], k);
  out.shRZ = -mix(a[2], b[2], k);
  out.elR = mix(a[3], b[3], k);
}

/** Braço "da mão boa" (direito, ou esquerdo no canhoto) com ângulos do lado direito. */
function putMain(out: Pose, side: number, x: number, y: number, z: number, e: number) {
  if (side > 0) {
    out.shRX = x; out.shRY = y; out.shRZ = z; out.elR = e;
  } else {
    out.shLX = x; out.shLY = -y; out.shLZ = -z; out.elL = e;
  }
}

/** O outro braço, com ângulos do lado esquerdo. */
function putOff(out: Pose, side: number, x: number, y: number, z: number, e: number) {
  if (side > 0) {
    out.shLX = x; out.shLY = y; out.shLZ = z; out.elL = e;
  } else {
    out.shRX = x; out.shRY = -y; out.shRZ = -z; out.elR = e;
  }
}

/** De pé, relaxado, respirando. */
function stand(out: Pose, t: number) {
  const breath = Math.sin(t * 2.3);
  out.bodyY = 0.1 * breath;
  out.torsoX = 0.02 * breath;
  putL(out, ARM_REST);
  putR(out, ARM_REST);
}

// ---------------------------------------------------------------- ações

/**
 * Ações declarativas: a coreografia pede pelo nome em `intent.action` e o
 * boneco toca. Mudou o valor, recomeça do zero (entra em 0,12 s, sai em 0,18 s).
 */
export type FigureAction =
  | "fistPump"
  | "kneeSlide"
  | "kneelCheer"
  | "flagDance"
  | "airplane"
  | "pointSky"
  | "siuu"
  | "backflip"
  | "crestKiss"
  | "jumpCheer"
  | "hug"
  | "highFive"
  | "clap"
  | "handsOnHead"
  | "handsOnHips"
  | "kneelSad"
  | "kickGround"
  | "sitDown";

/** Tiques de quem está parado esperando a vez (internos). */
type FidgetId = "lookAround" | "stretch" | "legSwing" | "fixSock" | "bounceToes" | "tapBoot" | "neckRoll";
type ActionId = FigureAction | FidgetId;

type ActionContext = {
  /** Pose montada até esta camada (leitura). */
  base: Pose;
  /** Peso da locomoção (0 parado, 1 correndo). */
  moving: number;
  /** Estado "sad" pedido junto com a ação. */
  sad: boolean;
  /** 0..1 fixo por boneco (fase, variação). */
  variant: number;
  /** 1 destro, -1 canhoto: lado da mão/perna boa. */
  side: number;
};

type ActionBody = "full" | "upper" | "overlay";

type ActionDef = {
  /** Duração das ações de uma vez só (s); 0 = laço. Ao fim fica na pose final. */
  duration: number;
  /**
   * full: corpo inteiro. upper: braços e tronco; com o boneco andando as pernas
   * são da corrida, parado a ação também manda nas pernas. overlay: retoque
   * sobre a pose de baixo (tiques).
   */
  body: ActionBody;
  /** Rosto; null deixa o normal (com piscadas). */
  mood: FaceMood | null | ((t: number, ctx: ActionContext) => FaceMood | null);
  /** Quanto a cabeça ainda acompanha a bola (0 = nada). */
  look: number;
  /** Ação de corpo inteiro que espelha no canhoto. */
  mirror?: boolean;
  /** Pancadas no chão (instante, força 0..1) para o takeLanding. */
  impacts?: ReadonlyArray<readonly [number, number]>;
  sample: (t: number, out: Pose, ctx: ActionContext) => void;
};

// --- siuuu: agacha, salta girando meia-volta e cai de pernas abertas.
const SIUU_TRACKS: readonly KeyTrack[] = [
  ...both("hipLX", "hipRX", [0, 0, 0.14, -0.6, 0.38, -0.75, 0.62, -0.3, 0.69, -0.42, 0.8, -0.18]),
  ...both("kneeL", "kneeR", [0, 0, 0.14, 1.2, 0.38, 1.1, 0.62, 0.35, 0.69, 0.8, 0.8, 0.38]),
  ...both("hipLZ", "hipRZ", [0, 0, 0.14, 0.04, 0.45, 0.1, 0.62, 0.36, 0.8, 0.32], true),
  ["torsoX", [0, 0, 0.14, 0.35, 0.4, 0.04, 0.62, -0.08, 0.69, 0.1, 0.82, -0.22]],
  ["neckX", [0, 0, 0.14, 0.12, 0.5, -0.22, 0.7, -0.3, 0.85, -0.42]],
  ...both("shLX", "shRX", [0, 0, 0.14, 0.78, 0.45, 0.22, 0.62, 0.2, 0.82, 0.4]),
  ...both("shLZ", "shRZ", [0, 0.09, 0.14, 0.25, 0.45, 0.9, 0.62, 1.05, 0.82, 0.8], true),
  ...both("elL", "elR", [0, -0.14, 0.14, -0.3, 0.5, -0.1, 0.82, 0]),
];
const SIUU_LAND: Track = [0.62, 0, 0.69, -1.8, 0.8, -0.8];

// --- mortal para trás com pivô no quadril.
const BACKFLIP_TRACKS: readonly KeyTrack[] = [
  ...both("hipLX", "hipRX", [0, 0, 0.16, -0.7, 0.24, -0.1, 0.34, -1.7, 0.52, -1.7, 0.62, -0.45, 0.7, -0.75, 0.86, -0.3, 1, -0.1]),
  ...both("kneeL", "kneeR", [0, 0, 0.16, 1.35, 0.24, 0.2, 0.34, 2.1, 0.52, 2.1, 0.62, 0.55, 0.7, 1.25, 0.86, 0.55, 1, 0.2]),
  ["torsoX", [0, 0, 0.16, 0.45, 0.24, -0.12, 0.34, 0.32, 0.52, 0.32, 0.62, 0.05, 0.7, 0.35, 0.86, 0.05, 1, -0.15]],
  ["neckX", [0, 0, 0.16, 0.15, 0.3, 0.25, 0.62, 0, 0.8, -0.15, 1, -0.35]],
  ...both("shLX", "shRX", [0, 0, 0.16, 0.9, 0.24, -2.6, 0.34, -1.1, 0.52, -1.1, 0.62, -1.5, 0.7, -1.25, 0.86, -2.2, 1, -2.6]),
  ...both("shLZ", "shRZ", [0, 0.09, 0.16, 0.2, 0.24, 0.35, 0.34, 0.25, 0.62, 0.55, 0.7, 0.5, 1, 0.62], true),
  ...both("elL", "elR", [0, -0.14, 0.16, -0.2, 0.24, -0.1, 0.34, -1.3, 0.52, -1.3, 0.62, -0.2, 1, -0.1]),
];
const BACKFLIP_LAND: Track = [0.66, 0, 0.73, -2.6, 0.86, -1, 1, -0.3];

// --- beijo no escudo (peito esquerdo) e dedo para o céu.
const CREST_TRACKS: readonly KeyTrack[] = [
  ["shRX", [0, 0, 0.3, -1.1]],
  ["shRY", [0, 0, 0.3, 1.15]],
  ["shRZ", [0, -0.09, 0.3, 0.6]],
  ["elR", [0, -0.14, 0.3, -1.35]],
  ["shLX", [0, 0, 0.3, -0.1, 0.62, -0.2, 0.9, -2.85]],
  ["shLZ", [0, 0.09, 0.3, 0.38, 0.62, 0.38, 0.9, 0.22]],
  ["elL", [0, -0.14, 0.3, -0.5, 0.62, -0.5, 0.9, -0.05]],
  ["torsoX", [0, 0, 0.3, 0.12, 0.45, 0.3, 0.62, 0.28, 0.85, -0.14]],
  ["neckX", [0, 0, 0.3, 0.28, 0.45, 0.6, 0.62, 0.58, 0.85, -0.5]],
  ["neckY", [0, 0, 0.45, 0.15, 0.7, 0]],
  ["bodyY", [0, 0, 0.3, -0.3, 0.62, -0.4, 0.9, 0]],
  ...both("kneeL", "kneeR", [0, 0, 0.3, 0.12, 0.62, 0.15, 0.9, 0.05]),
];

// --- high five no ar (mão boa = direita; a função espelha para o canhoto).
const HIGH_FIVE_MAIN_X: Track = [0, 0, 0.16, -2.3, 0.25, -2.85, 0.5, -1.45];
const HIGH_FIVE_MAIN_Z: Track = [0, -0.09, 0.16, -0.35, 0.25, -0.18, 0.5, -0.42];
const HIGH_FIVE_MAIN_E: Track = [0, -0.14, 0.16, -1.4, 0.25, -0.05, 0.5, -1.65];
const HIGH_FIVE_OFF_X: Track = [0, 0, 0.2, -0.3, 0.5, -0.25];
const HIGH_FIVE_OFF_Z: Track = [0, 0.09, 0.2, 0.32, 0.5, 0.3];
const HIGH_FIVE_OFF_E: Track = [0, -0.14, 0.2, -1.2, 0.5, -1.25];
const HIGH_FIVE_LEGS: readonly KeyTrack[] = [
  ...both("kneeL", "kneeR", [0, 0, 0.16, 0.55, 0.26, 0.25, 0.36, 0.1, 0.42, 0.45, 0.5, 0.15]),
  ...both("hipLX", "hipRX", [0, 0, 0.16, -0.25, 0.26, -0.3, 0.36, -0.05, 0.42, -0.2, 0.5, -0.08]),
  ["neckX", [0, 0, 0.16, -0.2, 0.25, -0.45, 0.5, -0.2]],
];
const HIGH_FIVE_TORSO: Track = [0, 0, 0.16, 0.12, 0.25, -0.15, 0.5, -0.05];
const HIGH_FIVE_DIP: Track = [0.36, 0, 0.42, -0.7, 0.5, -0.2];

// --- chute no gramado de raiva e mãos na cintura.
const KICK_GROUND_TRACKS: readonly KeyTrack[] = [
  ["hipRX", [0, 0, 0.2, 0.75, 0.3, -0.75, 0.45, -0.2, 0.62, 0]],
  ["kneeR", [0, 0, 0.2, 1.15, 0.3, 0.1, 0.45, 0.25, 0.62, 0.06]],
  ["hipLX", [0, 0, 0.2, -0.1, 0.3, -0.15, 0.62, 0]],
  ["kneeL", [0, 0, 0.2, 0.25, 0.3, 0.38, 0.62, 0.12]],
  ["bodyY", [0, 0, 0.2, -0.5, 0.3, -0.9, 0.62, -0.25]],
  ["torsoX", [0, 0, 0.2, 0.12, 0.3, 0.3, 0.62, 0.14]],
  ["torsoY", [0, 0, 0.2, 0.15, 0.3, -0.22, 0.62, 0]],
  ["neckX", [0, 0, 0.3, 0.35, 0.8, 0.48]],
  ["shLX", [0, 0, 0.25, -0.6, 0.5, -0.3, 0.8, ARM_HIPS[0]]],
  ["shLY", [0, 0, 0.5, 0, 0.8, ARM_HIPS[1]]],
  ["shLZ", [0, 0.09, 0.25, 0.5, 0.5, 0.4, 0.8, ARM_HIPS[2]]],
  ["elL", [0, -0.14, 0.25, -0.4, 0.5, -0.6, 0.8, ARM_HIPS[3]]],
  ["shRX", [0, 0, 0.25, 0.5, 0.5, 0.2, 0.8, ARM_HIPS[0]]],
  ["shRY", [0, 0, 0.5, 0, 0.8, -ARM_HIPS[1]]],
  ["shRZ", [0, -0.09, 0.25, -0.4, 0.5, -0.4, 0.8, -ARM_HIPS[2]]],
  ["elR", [0, -0.14, 0.25, -0.3, 0.5, -0.6, 0.8, ARM_HIPS[3]]],
];

// --- senta no gramado, antebraços nos joelhos.
const SIT_TRACKS: readonly KeyTrack[] = [
  ["bodyY", [0, 0, 0.35, -4.2, 0.62, -9.8]],
  ...both("hipLX", "hipRX", [0, 0, 0.35, -1.05, 0.62, -2]),
  ...both("kneeL", "kneeR", [0, 0, 0.35, 1.7, 0.62, 0.9]),
  ...both("hipLZ", "hipRZ", [0, 0, 0.62, 0.12], true),
  ["torsoX", [0, 0, 0.35, 0.45, 0.62, 0.3]],
  ["neckX", [0, 0, 0.62, 0.5]],
  ...both("shLX", "shRX", [0, 0, 0.35, -0.9, 0.62, -0.22]),
  ...both("shLY", "shRY", [0, 0, 0.35, 0, 0.62, -0.19], true),
  ...both("shLZ", "shRZ", [0, 0.09, 0.35, 0.3, 0.62, -0.35], true),
  ...both("elL", "elR", [0, -0.14, 0.35, -0.6, 0.62, -1.29]),
];

// --- ajoelha num joelho só, antebraço no outro.
const KNEEL_SAD_TRACKS: readonly KeyTrack[] = [
  ["bodyY", [0, 0, 0.45, -4.65]],
  ["hipRX", [0, 0, 0.25, -0.9, 0.45, -1.45]],
  ["kneeR", [0, 0, 0.45, 1.45]],
  ["hipLX", [0, 0, 0.2, -0.3, 0.45, 0.05]],
  ["kneeL", [0, 0, 0.2, 0.6, 0.45, 1.6]],
  ["torsoX", [0, 0, 0.45, 0.35]],
  ["neckX", [0, 0, 0.45, 0.55]],
  ["shRX", [0, 0, 0.45, -0.44]],
  ["shRY", [0, 0, 0.45, 0.97]],
  ["shRZ", [0, -0.09, 0.45, 0.07]],
  ["elR", [0, -0.14, 0.45, -0.83]],
  ["shLX", [0, 0, 0.45, -0.3]],
  ["shLZ", [0, 0.09, 0.45, 0.14]],
  ["elL", [0, -0.14, 0.45, -0.4]],
];

const LOOK_AROUND: Track = [0, 0, 0.35, 0.75, 0.8, 0.75, 1.15, -0.7, 1.5, -0.7, 1.8, 0];
const STRETCH_ENV: Track = [0, 0, 0.45, 1, 2.15, 1, 2.6, 0];
const STRETCH_SIDE: Track = [0, 0, 0.6, 0, 1, 0.3, 1.35, 0.3, 1.75, -0.3, 2.1, -0.3, 2.45, 0];
const LEG_SWING_ENV: Track = [0, 0, 0.3, 1, 1.9, 1, 2.2, 0];
const SOCK_ENV: Track = [0, 0, 0.4, 1, 1.7, 1, 2.1, 0];
const TAP_ENV: Track = [0, 0, 0.25, 1, 1.05, 1, 1.3, 0];

/** Saída reaproveitada de `hopCycle` (nada de objeto novo por quadro). */
const HOP = { lift: 0, crouch: 0 };

/** Pulos de comemoração: no ar 55% do ciclo, agachadinha no resto. */
function hopCycle(t: number, rate: number, offset: number) {
  const cycle = (t * rate + offset) % 1;
  if (cycle < 0.55) {
    const s = cycle / 0.55;
    HOP.lift = 4 * s * (1 - s);
    HOP.crouch = 0;
  } else {
    HOP.lift = 0;
    HOP.crouch = Math.sin(Math.PI * ((cycle - 0.55) / 0.45));
  }
  return HOP;
}

const ACTIONS: Record<ActionId, ActionDef> = {
  // ----------------------------------------------------- comemorações
  fistPump: {
    duration: 0,
    body: "upper",
    mood: "shout",
    look: 0,
    sample(t, o, c) {
      const pump = Math.pow(0.5 + 0.5 * Math.sin(TAU * 1.9 * t + c.variant * 3), 1.6);
      putMain(o, c.side, -2.2 - 0.5 * pump, 0, -0.28 + 0.06 * pump, -1.5 + 1.1 * pump);
      putOff(o, c.side, 0.15 - 0.35 * pump, 0, 0.32, -1.45);
      o.torsoX = c.base.torsoX - 0.14;
      o.torsoZ = c.base.torsoZ + 0.05 * pump * c.side;
      o.neckX = -0.32;
      o.bodyY = 0.7 * pump - 0.35;
      o.hipLX = o.hipRX = -0.12 * (1 - pump);
      o.kneeL = o.kneeR = 0.12 + 0.25 * (1 - pump);
    },
  },
  kneeSlide: {
    duration: 0,
    body: "full",
    mood: "shout",
    look: 0,
    impacts: [[0.1, 0.55]],
    sample(t, o) {
      const drop = smooth(t / 0.16);
      const rattle = Math.exp(-t * 2.4);
      o.bodyY = mix(-1.5, -5.5, drop) + 0.18 * Math.sin(t * 47) * rattle;
      o.hipLX = o.hipRX = mix(-0.6, -0.4, drop);
      o.hipLZ = 0.12;
      o.hipRZ = -0.12;
      o.kneeL = o.kneeR = mix(1.2, 2.15, drop);
      o.torsoX = mix(0.1, -0.55, smooth(t / 0.3));
      o.neckX = -0.42;
      const arms = smooth((t - 0.05) / 0.3);
      const wave = Math.sin(t * 5.5) * 0.12 * arms;
      o.shLX = mix(-1.2, -2.55, arms) + wave;
      o.shRX = mix(-1.2, -2.55, arms) - wave;
      o.shLZ = mix(0.4, 0.78, arms);
      o.shRZ = -o.shLZ;
      o.elL = o.elR = mix(-0.9, -0.15, arms);
    },
  },
  kneelCheer: {
    duration: 0,
    body: "full",
    mood: "shout",
    look: 0,
    sample(t, o) {
      const beat = TAU * 1.5 * t;
      const a = 0.5 + 0.5 * Math.sin(beat);
      const b = 1 - a;
      o.bodyY = -4.7 + 0.15 * Math.sin(beat * 2);
      o.hipLX = o.hipRX = 0.02;
      o.hipLZ = 0.1;
      o.hipRZ = -0.1;
      o.kneeL = o.kneeR = 1.6;
      o.shRX = -1.7 - 1.05 * a;
      o.shRZ = -0.32;
      o.elR = -1.55 + 1.3 * a;
      o.shLX = -1.7 - 1.05 * b;
      o.shLZ = 0.32;
      o.elL = -1.55 + 1.3 * b;
      o.torsoX = -0.28 + 0.04 * Math.sin(beat * 2);
      o.torsoZ = 0.06 * Math.sin(beat);
      o.neckX = -0.45;
      o.neckZ = -0.05 * Math.sin(beat);
    },
  },
  flagDance: {
    duration: 0,
    body: "full",
    mood: "shout",
    look: 0,
    mirror: true,
    sample(t, o) {
      const beat = TAU * 2.2 * t;
      const sway = Math.sin(beat);
      o.bodyX = 1.2 * sway;
      o.bodyY = -0.6 + 0.35 * Math.abs(Math.cos(beat));
      o.hipsY = 0.22 * sway;
      o.torsoY = -0.3 * sway;
      o.torsoZ = 0.06 * sway;
      o.kneeL = 0.25 + 0.35 * Math.max(0, sway);
      o.kneeR = 0.25 + 0.35 * Math.max(0, -sway);
      o.hipLX = -0.12 - 0.15 * Math.max(0, sway);
      o.hipRX = -0.12 - 0.15 * Math.max(0, -sway);
      putL(o, ARM_HIPS);
      // Laço girando por cima da cabeça.
      o.shRX = -2.6 + 0.12 * Math.cos(beat * 2);
      o.shRZ = -0.35 + 0.3 * Math.sin(beat * 2);
      o.elR = -0.3 - 0.2 * Math.sin(beat * 2);
      o.neckX = -0.2;
      o.neckZ = 0.12 * sway;
    },
  },
  airplane: {
    duration: 0,
    body: "upper",
    mood: "shout",
    look: 0,
    sample(t, o, c) {
      const rock = Math.sin(TAU * 0.55 * t + c.variant * 4);
      o.shLX = o.shRX = -0.12;
      o.shLY = o.shRY = 0;
      o.shLZ = 1.45 + 0.12 * rock;
      o.shRZ = -1.45 + 0.12 * rock;
      o.elL = o.elR = -0.05;
      // As asas inclinam juntas, como avião fazendo curva.
      o.torsoZ = c.base.torsoZ + 0.16 * rock;
      o.torsoY = c.base.torsoY * 0.3;
      o.torsoX = c.base.torsoX - 0.04;
      o.neckX = -0.2;
      o.neckZ = 0.1 * rock;
      o.bodyY = 0.1 * Math.sin(t * 2.3);
    },
  },
  pointSky: {
    duration: 0,
    body: "full",
    mood: "shout",
    look: 0,
    sample(t, o) {
      stand(o, t);
      const rise = smooth(t / 0.45);
      const beat = Math.sin(TAU * 0.8 * t) * 0.06 * rise;
      o.shLX = mix(-1, -2.95, rise) + beat;
      o.shRX = mix(-1, -2.95, rise) - beat;
      o.shLZ = mix(0.4, 0.2, rise);
      o.shRZ = -o.shLZ;
      o.elL = o.elR = mix(-1.4, -0.05, rise);
      o.torsoX = -0.15 * rise;
      o.neckX = -0.6 * rise;
    },
  },
  siuu: {
    duration: 1.1,
    body: "full",
    mood: "shout",
    look: 0,
    sample(t, o) {
      applyTracks(o, SIUU_TRACKS, t);
      if (t < 0.14) o.bodyY = -3 * smooth(t / 0.14);
      else if (t < 0.62) {
        // Voo balístico: sai de -3, sobe até ~10 px e volta ao chão.
        const s = (t - 0.14) / 0.48;
        o.bodyY = -3 + 48.8 * s - 45.8 * s * s;
      } else if (t < 0.8) o.bodyY = sampleTrack(SIUU_LAND, t);
      else {
        o.bodyY = -0.8 + 0.08 * Math.sin(t * 2.3);
        // Tensão de quem grita: os braços tremem de leve.
        o.shLZ += 0.015 * Math.sin(t * 31);
        o.shRZ -= 0.015 * Math.sin(t * 29);
      }
      o.spinY = Math.PI * smooth(seg(t, 0.16, 0.6));
    },
  },
  backflip: {
    duration: 1,
    body: "full",
    mood: "shout",
    look: 0,
    sample(t, o) {
      applyTracks(o, BACKFLIP_TRACKS, t);
      if (t < 0.16) o.bodyY = -3.2 * smooth(t / 0.16);
      else if (t < 0.66) {
        const s = (t - 0.16) / 0.5;
        o.bodyY = -3.2 + 61.4 * s - 58.2 * s * s;
      } else if (t < 1) o.bodyY = sampleTrack(BACKFLIP_LAND, t);
      else o.bodyY = -0.3 + 0.08 * Math.sin(t * 2.3);
      o.pivX = wrapAngle(-TAU * smooth(seg(t, 0.2, 0.64)));
    },
  },
  crestKiss: {
    duration: 1,
    body: "full",
    mood: (t) => (t > 0.36 && t < 0.66 ? "blink" : "shout"),
    look: 0,
    sample(t, o) {
      stand(o, t);
      applyTracks(o, CREST_TRACKS, t);
      if (t > 1) {
        // Bate no escudo de tempos em tempos.
        const thump = Math.max(0, Math.sin(TAU * 0.8 * (t - 1)));
        o.shRZ += 0.12 * thump * thump;
        o.elR -= 0.08 * thump;
        o.shLX += 0.06 * Math.sin(TAU * 0.8 * t);
      }
    },
  },
  jumpCheer: {
    duration: 0,
    body: "upper",
    mood: "shout",
    look: 0,
    sample(t, o, c) {
      const { lift, crouch } = hopCycle(t, 1.45, c.variant);
      const up = 1 - 0.35 * crouch;
      o.shLX = o.shRX = -2.75 * up;
      o.shLY = o.shRY = 0;
      o.shLZ = 0.38;
      o.shRZ = -0.38;
      o.elL = o.elR = -0.2 - 0.6 * crouch;
      o.torsoX = c.base.torsoX * c.moving + (1 - c.moving) * (-0.1 + 0.25 * crouch);
      o.neckX = -0.35;
      o.bodyY = 5.5 * lift - 1.4 * crouch;
      o.hipLX = o.hipRX = -0.15 - 0.45 * crouch - 0.5 * lift;
      o.kneeL = o.kneeR = 0.1 + 0.95 * crouch + 0.9 * lift;
    },
  },
  hug: {
    duration: 0,
    body: "full",
    mood: "shout",
    look: 0,
    sample(t, o, c) {
      stand(o, t);
      const bounce = Math.abs(Math.sin(TAU * 1.3 * t + c.variant * 2));
      const rock = Math.sin(TAU * 0.65 * t);
      o.bodyY = 1.6 * bounce - 0.3;
      o.kneeL = o.kneeR = 0.28 - 0.2 * bounce;
      o.hipLX = o.hipRX = -0.1;
      // Braços abertos à frente, na altura dos ombros: o abraço chegando.
      const squeeze = 0.12 * Math.sin(TAU * 1.3 * t + c.variant * 2);
      putL(o, ARM_HUG);
      putR(o, ARM_HUG);
      o.shLZ += 0.08 * rock - squeeze;
      o.shRZ += 0.08 * rock + squeeze;
      o.torsoX = 0.18;
      o.torsoZ = 0.08 * rock;
      o.neckX = -0.15;
      o.neckY = 0.3 * Math.sin(TAU * 0.3 * t + c.variant * 5);
    },
  },
  highFive: {
    duration: 0.5,
    body: "upper",
    mood: "shout",
    look: 0,
    sample(t, o, c) {
      putMain(o, c.side, sampleTrack(HIGH_FIVE_MAIN_X, t), 0, sampleTrack(HIGH_FIVE_MAIN_Z, t), sampleTrack(HIGH_FIVE_MAIN_E, t));
      putOff(o, c.side, sampleTrack(HIGH_FIVE_OFF_X, t), 0, sampleTrack(HIGH_FIVE_OFF_Z, t), sampleTrack(HIGH_FIVE_OFF_E, t));
      applyTracks(o, HIGH_FIVE_LEGS, t);
      o.torsoX = c.base.torsoX + sampleTrack(HIGH_FIVE_TORSO, t);
      if (t < 0.16) o.bodyY = -1.2 * smooth(t / 0.16);
      else if (t < 0.36) {
        const s = (t - 0.16) / 0.2;
        o.bodyY = -1.2 + 15.5 * s - 14.3 * s * s;
      } else if (t < 0.5) o.bodyY = sampleTrack(HIGH_FIVE_DIP, t);
      else {
        o.bodyY = -0.2 + 0.1 * Math.sin(t * 2.3);
        // Depois do tapa, o punho fica pulsando no ombro.
        const pulse = 0.08 * Math.sin(TAU * 1.6 * t);
        if (c.side > 0) o.shRX += pulse;
        else o.shLX += pulse;
      }
    },
  },
  clap: {
    duration: 0,
    body: "upper",
    mood: (_t, c) => (c.sad ? null : "shout"),
    look: 0.3,
    sample(t, o, c) {
      const cycle = (t * 2.4 + c.variant) % 1;
      const k = cycle < 0.3 ? smooth(cycle / 0.3) : 1 - smooth((cycle - 0.3) / 0.7);
      putL(o, ARM_CLAP_OPEN, ARM_CLAP, k);
      putR(o, ARM_CLAP_OPEN, ARM_CLAP, k);
      o.bodyY = 0.35 * k - 0.1;
      o.kneeL = o.kneeR = 0.1;
    },
  },
  // ----------------------------------------------------------- lamentos
  handsOnHead: {
    duration: 0,
    body: "upper",
    mood: (_t, c) => (c.sad ? "sad" : "surprised"),
    look: 0,
    sample(t, o, c) {
      const reach = smooth(t / 0.22);
      const arm = c.sad ? ARM_HEAD_LOW : ARM_HEAD;
      putL(o, ARM_REST, arm, reach);
      putR(o, ARM_REST, arm, reach);
      const shake = Math.sin(TAU * 1.6 * t) * Math.exp(-t * 0.6) * 0.22;
      o.neckX = c.sad ? 0.42 : mix(-0.35, 0.05, smooth((t - 0.9) / 0.8));
      o.neckY = shake;
      o.torsoX = c.base.torsoX + (c.sad ? 0.08 : -0.12);
      // Parado: o susto dá um passo para trás.
      o.hipRX = c.sad ? 0 : 0.22 * reach;
      o.kneeR = c.sad ? 0.1 : 0.18 * reach;
      o.kneeL = 0.1;
      o.bodyY = -0.2 * reach;
    },
  },
  handsOnHips: {
    duration: 0,
    body: "upper",
    mood: (_t, c) => (c.sad ? "sad" : null),
    look: 0.3,
    sample(t, o, c) {
      const k = smooth(t / 0.25);
      putL(o, ARM_REST, ARM_HIPS, k);
      putR(o, ARM_REST, ARM_HIPS, k);
      // Balança a cabeça de vez em quando ("não acredito").
      const cycle = (t + c.variant * 3) % 3.6;
      const shake = cycle < 1.2 ? Math.sin((Math.PI * cycle) / 1.2) : 0;
      o.neckY = 0.3 * Math.sin(TAU * 2.2 * t) * shake;
      o.neckX = c.sad ? 0.38 : 0.12;
      o.torsoX = c.base.torsoX + 0.05;
      // Peso numa perna só.
      o.hipsY = 0.08 * k;
      o.bodyX = 0.4 * k;
      o.hipLZ = 0.06 * k;
      o.hipRZ = -0.12 * k;
      o.kneeR = 0.2 * k;
      o.bodyY = 0.08 * Math.sin(t * 2.3) - 0.1 * k;
    },
  },
  kneelSad: {
    duration: 0,
    body: "full",
    mood: "sad",
    look: 0,
    mirror: true,
    sample(t, o) {
      applyTracks(o, KNEEL_SAD_TRACKS, t);
      if (t > 0.45) {
        o.torsoX += 0.05 * Math.sin(TAU * 0.22 * t);
        o.neckY = 0.12 * Math.sin(TAU * 0.1 * t);
      }
    },
  },
  kickGround: {
    duration: 0.8,
    body: "full",
    mood: "sad",
    look: 0,
    mirror: true,
    impacts: [[0.27, 0.35]],
    sample(t, o) {
      stand(o, t);
      applyTracks(o, KICK_GROUND_TRACKS, t);
      if (t > 0.8) {
        const cycle = (t - 0.8) % 3.4;
        const shake = cycle < 1 ? Math.sin(Math.PI * cycle) : 0;
        o.neckY = 0.25 * Math.sin(TAU * 2 * t) * shake;
      }
    },
  },
  sitDown: {
    duration: 0,
    body: "full",
    mood: "sad",
    look: 0,
    impacts: [[0.6, 0.3]],
    sample(t, o) {
      applyTracks(o, SIT_TRACKS, t);
      if (t > 0.62) {
        o.torsoX += 0.05 * Math.sin(TAU * 0.2 * t);
        o.neckY = 0.15 * Math.sin(TAU * 0.13 * t);
      }
    },
  },
  // -------------------------------------------------------------- tiques
  lookAround: {
    duration: 1.8,
    body: "overlay",
    mood: null,
    look: 0,
    sample(t, o, c) {
      const turn = sampleTrack(LOOK_AROUND, t);
      o.neckY = c.base.neckY + turn;
      o.torsoY = c.base.torsoY + 0.22 * turn;
    },
  },
  stretch: {
    duration: 2.6,
    body: "overlay",
    mood: null,
    look: 0,
    sample(t, o, c) {
      const k = sampleTrack(STRETCH_ENV, t);
      const side = sampleTrack(STRETCH_SIDE, t);
      o.shLX = mix(c.base.shLX, -2.95, k);
      o.shRX = mix(c.base.shRX, -2.95, k);
      o.shLZ = mix(c.base.shLZ, -0.12, k);
      o.shRZ = mix(c.base.shRZ, 0.12, k);
      o.elL = mix(c.base.elL, -0.05, k);
      o.elR = mix(c.base.elR, -0.05, k);
      o.torsoZ = c.base.torsoZ + side;
      o.neckZ = 0.4 * side;
    },
  },
  legSwing: {
    duration: 2.2,
    body: "overlay",
    mood: null,
    look: 0.5,
    sample(t, o, c) {
      const env = sampleTrack(LEG_SWING_ENV, t);
      const swing = Math.sin(TAU * 1.25 * Math.max(0, t - 0.3)) * env;
      o.hipRX = -0.85 * swing;
      o.hipRZ = -0.06 * env;
      o.kneeR = 0.12 * env + 0.35 * (1 - Math.abs(swing)) * env;
      o.kneeL = c.base.kneeL + 0.12 * env;
      o.bodyX = 0.5 * env;
      o.bodyRotZ = c.base.bodyRotZ - 0.04 * env;
      o.shLZ = c.base.shLZ + 0.4 * env;
      o.shRZ = c.base.shRZ - 0.3 * env;
      o.shRX = c.base.shRX + 0.35 * swing;
      o.shLX = c.base.shLX - 0.35 * swing;
    },
  },
  fixSock: {
    duration: 2.1,
    body: "overlay",
    mood: null,
    look: 0,
    sample(t, o, c) {
      const env = sampleTrack(SOCK_ENV, t);
      o.hipRX = -1.75 * env;
      o.kneeR = 1.85 * env;
      o.kneeL = c.base.kneeL + 0.15 * env;
      o.torsoX = c.base.torsoX + 0.6 * env;
      o.neckX = c.base.neckX + 0.35 * env;
      o.bodyX = 0.4 * env;
      o.bodyRotZ = c.base.bodyRotZ - 0.03 * env;
      const tug = 0.1 * Math.sin(TAU * 4 * t) * seg(t, 0.55, 0.7) * (1 - seg(t, 1.4, 1.55));
      putR(o, ARM_REST, ARM_SOCK, env);
      o.shRX += tug;
      o.shLX = mix(c.base.shLX, -0.2, env);
      o.shLZ = mix(c.base.shLZ, 0.7, env);
      o.elL = mix(c.base.elL, -0.3, env);
    },
  },
  bounceToes: {
    duration: 1.4,
    body: "overlay",
    mood: null,
    look: 1,
    sample(t, o, c) {
      const env = Math.sin((Math.PI * Math.min(t, 1.4)) / 1.4);
      o.bodyY = c.base.bodyY + 0.55 * Math.abs(Math.sin(TAU * 2.3 * t)) * env;
      o.kneeL = c.base.kneeL + 0.1 * env;
      o.kneeR = c.base.kneeR + 0.1 * env;
      o.shLZ = c.base.shLZ + 0.07 * Math.sin(TAU * 4.6 * t) * env;
      o.shRZ = c.base.shRZ - 0.07 * Math.sin(TAU * 4.6 * t) * env;
    },
  },
  tapBoot: {
    duration: 1.3,
    body: "overlay",
    mood: null,
    look: 0,
    sample(t, o, c) {
      const env = sampleTrack(TAP_ENV, t);
      const tap = Math.max(0, Math.sin(TAU * 3.2 * Math.max(0, t - 0.25))) * seg(t, 0.25, 0.3) * (1 - seg(t, 0.95, 1.05));
      o.hipRX = 0.25 * env;
      o.kneeR = (1 - 0.4 * tap) * env;
      o.ankleR = 0.65 * env;
      o.neckX = c.base.neckX + 0.25 * env;
      o.neckY = c.base.neckY - 0.3 * env;
      o.torsoX = c.base.torsoX + 0.05 * env;
    },
  },
  neckRoll: {
    duration: 1.4,
    body: "overlay",
    mood: null,
    look: 0,
    sample(t, o, c) {
      const angle = (TAU * Math.min(t, 1.4)) / 1.4;
      const env = Math.sin(angle / 2);
      o.neckX = c.base.neckX + 0.28 * Math.sin(angle) * env;
      o.neckZ = 0.28 * Math.cos(angle) * env;
    },
  },
};

/** Duração (s, 0 = laço) e se a ação combina com corrida ("upper"). */
export const FIGURE_ACTION_INFO: Readonly<Record<FigureAction, { duration: number; body: "full" | "upper" }>> = (() => {
  const info = {} as Record<FigureAction, { duration: number; body: "full" | "upper" }>;
  for (const id of Object.keys(ACTIONS) as ActionId[]) {
    const def = ACTIONS[id];
    if (def.body === "overlay") continue;
    info[id as FigureAction] = { duration: def.duration, body: def.body };
  }
  return info;
})();

/** Sorteio dos tiques: [id, duração, peso]. */
const FIDGETS: ReadonlyArray<readonly [ActionId, number, number]> = [
  ["lookAround", 1.8, 3],
  ["bounceToes", 1.4, 2],
  ["tapBoot", 1.3, 1.5],
  ["stretch", 2.6, 1.4],
  ["neckRoll", 1.4, 1.2],
  ["legSwing", 2.2, 1.1],
  ["handsOnHips", 2.6, 1.1],
  ["fixSock", 2.1, 1],
];
const FIDGET_TOTAL = FIDGETS.reduce((sum, item) => sum + item[2], 0);

type Layer = {
  id: ActionId | null;
  t: number;
  w: number;
  /** +1 entrando, -1 saindo. */
  dir: number;
  /** Duração-limite (tiques); 0 = enquanto pedirem. */
  until: number;
  /** A meia-volta desta ação já foi passada para o yaw. */
  spinBaked: boolean;
  /** Meia-volta aplicada no último quadro (rad). */
  spin: number;
  /**
   * Versão "triste" da ação. A camada que está saindo guarda o valor que
   * tinha: trocar o estado no meio da mistura não muda a pose dela de repente.
   */
  sad: boolean;
};

const newLayer = (): Layer => ({ id: null, t: 0, w: 0, dir: 0, until: 0, spinBaked: false, spin: 0, sad: false });

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
  /** Ação por cima do estado; trocar o valor recomeça do zero. */
  action?: FigureAction | null;
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

export type KickKind = "strike" | "block";

const BOOT_COLORS = ["#141414", "#141414", "#f4f4f2", "#141414", "#ff5a36", "#2f7bff", "#ffd23f", "#2fd38a", "#141414", "#e8e8e8"];
const CELEBRATIONS = ["jump", "fist", "clap", "jump", "fist"] as const;
const SADNESS = ["head", "knees", "head", "slump"] as const;
const STATE_KEYS = ["idle", "ready", "aim", "run", "pushed", "celebrate", "scorer", "sad", "keeper", "step"] as const;
type WeightKey = (typeof STATE_KEYS)[number];

const ACTION_IN = 0.12;
const ACTION_OUT = 0.18;
const KICK_STRIKE = 0.5;
const KICK_BLOCK = 0.32;
const BRAKE_TIME = 0.4;
/** Passo máximo das molas (tronco e achatamento): estáveis até aqui. */
const SPRING_STEP = 0.05;

/** Gerador pseudoaleatório por boneco (mulberry32). */
function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class PlayerFigure {
  readonly root = new THREE.Group();
  readonly model = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly hips = new THREE.Group();
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
  private readonly ankleL = new THREE.Group();
  private readonly ankleR = new THREE.Group();
  private readonly blob: THREE.Mesh;
  private readonly blobMaterial: THREE.MeshBasicMaterial;
  private readonly faceMaterial: THREE.MeshStandardMaterial;
  private readonly headTextures: HeadTextures;
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly allTextures: THREE.Texture[] = [];
  /** Cabelo fundido é geometria própria de cada boneco (o resto é compartilhado). */
  private hairGeometry: THREE.BufferGeometry | null = null;

  // Destaque do time (contorno de luz).
  private readonly rim: RimUniforms = {
    uRimStrength: { value: 0 },
    uRimColor: { value: new THREE.Color(RIM_DEFAULT) },
    uRimA: { value: new THREE.Vector3() },
    uRimB: { value: new THREE.Vector3(0, FIGURE_HEIGHT, 0) },
  };
  private readonly rimUp = new THREE.Vector3();
  private rimTarget = 0;
  private rimColorKey = RIM_DEFAULT;

  yaw = 0;
  private spin = 0;
  private time = Math.random() * 10;
  private readonly offset: number;
  private readonly random: () => number;
  private readonly variant: number;
  /** 1 destro, -1 canhoto (um em cinco). */
  private readonly side: number;
  /** Atraso de reação ao virar o corpo (cabeça vai antes). */
  private readonly reaction: number;
  private mood: FaceMood = "normal";
  private blinkIn = 2 + Math.random() * 3;
  private blinkFor = 0;
  private readonly celebration: (typeof CELEBRATIONS)[number];
  private readonly sadness: (typeof SADNESS)[number];
  private readonly weights: Record<WeightKey, number> = {
    idle: 1, ready: 0, aim: 0, run: 0, pushed: 0, celebrate: 0, scorer: 0, sad: 0, keeper: 0, step: 0,
  };
  private readonly targets: Record<WeightKey, number> = {
    idle: 0, ready: 0, aim: 0, run: 0, pushed: 0, celebrate: 0, scorer: 0, sad: 0, keeper: 0, step: 0,
  };
  /**
   * Peso das poses de reserva (comemoração/lamento sem ação pedida). Com ação
   * pedida elas não sobem: senão aparecem por um instante por baixo da ação
   * que ainda está entrando (braço que pisca para cima, pulinho).
   */
  private readonly reserve = { celebrate: 0, scorer: 0, sad: 0 };
  /** Triste até voltar ao jogo: o "run" para a própria área continua triste. */
  private sadMood = false;
  private aimRatio = 0;
  private shuffle = 0;
  private headYaw = 0;
  private headPitch = 0;
  private pushLocalX = 0;
  private pushLocalZ = 0;
  private lazyTurning = false;
  private turnWait = 0;

  // Locomoção.
  private runPhase = 0;
  private stepPhase = 0;
  private shufflePhase = 0;
  private locoSpeed = 0;
  /** Velocidade que dá a forma da passada: suavizada, para parar sem estalo. */
  private gaitSpeed = 0;
  private velX = 0;
  private velZ = 0;
  private accFastX = 0;
  private accFastZ = 0;
  private accSlowX = 0;
  private accSlowZ = 0;
  private bank = 0;
  private pitch = 0;
  private pitchVel = 0;
  private roll = 0;
  private rollVel = 0;
  private neckLag = 0;
  private prevSpeed = 0;
  private peakSpeed = 0;
  private lastHeading = 0;
  private lastState: FigureState = "idle";
  private brakeT = -1;
  private brakeFront = 1;
  private brakeAmount = 1;

  // Ações.
  private actionId: FigureAction | null = null;
  private current: Layer = newLayer();
  private previous: Layer = newLayer();
  private readonly fidget: Layer = newLayer();
  private fidgetIn: number;
  private lastFidget = -1;
  private readonly context: ActionContext;

  // Gatilhos.
  private kickT = -1;
  private kickPower = 1;
  private kickKind: KickKind = "strike";
  private kickSide = 1;
  private lungeT = -1;

  // Goleiro: mergulho travado no disparo (0 nada, 1 no ar/no chão, 2 levantando).
  private diveMode = 0;
  private diveT = 0;
  private diveSide = 1;
  private diveReach = 0;
  private riseT = 0;

  // Contato com o chão.
  private landing = 0;
  private airPeak = 0;
  private prevAir = 0;
  private squash = 0;
  private squashVel = 0;

  private readonly pose = zeroPose();
  private readonly layer = zeroPose();

  constructor(options: FigureOptions) {
    const seed = options.seed ?? options.number * 7919;
    this.offset = (seed % 997) / 97;
    this.random = seededRandom(Math.imul(seed, 2654435761));
    this.variant = this.random();
    this.side = this.random() < 0.2 ? -1 : 1;
    this.reaction = 0.08 + this.random() * 0.22;
    this.fidgetIn = 2 + this.random() * 6;
    this.celebration = CELEBRATIONS[seed % CELEBRATIONS.length];
    this.sadness = SADNESS[(seed >> 3) % SADNESS.length];
    this.context = { base: this.pose, moving: 0, sad: false, variant: this.variant, side: this.side };
    const look = resolveLook(options.appearance);
    const pattern = look.kitPattern;
    const shirtPrimary = options.keeper ? options.keeperColor ?? "#c6ff3d" : options.primary;
    const shirtSecondary = options.keeper ? shadeHex(shirtPrimary, -70) : options.secondary;

    // ------------------------------------------------------------- materiais
    // Cabeça e camisa usam atlas: uma textura e um draw call por caixa.
    this.headTextures = createHeadTextures(look);
    this.textures.push(...Object.values(this.headTextures));
    const track = <T extends THREE.MeshStandardMaterial>(material: T) => {
      installRim(material, this.rim);
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

    this.hips.position.y = 12;
    this.body.add(this.hips);
    this.hips.add(this.torso);
    place(this.torso, mesh(atlasBoxGeometry(8, 12, 4), torsoMaterial), 6);

    this.neck.position.y = 12;
    this.torso.add(this.neck);
    place(this.neck, mesh(headBoxGeometry(), this.faceMaterial), 4);
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

    const leg = (hip: THREE.Group, knee: THREE.Group, ankle: THREE.Group, side: 1 | -1) => {
      hip.position.set(2.05 * side, 0.4, 0);
      this.hips.add(hip);
      place(hip, mesh(box(4.25, 5.6, 4.3), shorts), -2.5);
      knee.position.y = -5.6;
      hip.add(knee);
      place(knee, mesh(box(3.75, 4.9, 3.75), socks), -1.9);
      // Tornozelo: a chuteira fica plana no chão ao agachar (sem afundar a ponta).
      ankle.position.y = -4.3;
      knee.add(ankle);
      const boot = mesh(box(4.05, 2.6, 5.25), boots);
      boot.position.set(0, -1.1, 0.55);
      ankle.add(boot);
    };
    leg(this.hipL, this.kneeL, this.ankleL, 1);
    leg(this.hipR, this.kneeR, this.ankleR, -1);

    this.blob = contactShadow();
    this.blob.scale.set(24, 24, 1);
    this.root.add(this.blob);
    this.blobMaterial = this.blob.material as THREE.MeshBasicMaterial;
    this.materials.push(this.blobMaterial);
    this.allTextures.push(...this.textures);
    if (blobTexture) this.allTextures.push(blobTexture);
  }

  // ------------------------------------------------------------- gatilhos

  /**
   * Contato com a bola. "strike": chute de verdade (arma, golpe seco,
   * acompanha e pulinho no pé de apoio). "block": quem só levou a bolada
   * amortece no peito/coxa (~0,3 s).
   */
  triggerKick(power = 1, kind: KickKind = "strike") {
    if (this.kickT >= 0) {
      // Não interrompe um chute no meio; bloqueio nunca corta chute.
      if (this.kickKind === "strike" && this.kickT < 0.3) return;
      if (kind === "block" && this.kickKind === "strike" && this.kickT < KICK_STRIKE) return;
      if (this.kickKind === "block" && this.kickT < 0.16) return;
    }
    this.kickT = 0;
    this.kickKind = kind;
    this.kickPower = clamp(power, 0.45, 1);
    if (kind === "strike") {
      // Correndo, chuta a perna que está atrás (já armada); parado, a boa.
      this.kickSide = this.weights.run > 0.3 ? (Math.sin(this.runPhase) > 0 ? 1 : -1) : this.side;
    } else {
      this.kickSide = this.random() < 0.5 ? 1 : -1;
    }
  }

  /** Arranque ao soltar o estilingue: braço contrário à frente, perna de impulso estendida. */
  triggerLunge() {
    this.lungeT = 0;
    // A perna armada na mira é a primeira a vir à frente.
    this.runPhase = this.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.squashVel += 0.9;
  }

  /** Teletransporte (troca de formação, pênalti): esquece o embalo. */
  snapYaw(yaw: number) {
    this.yaw = yaw;
    this.root.rotation.y = yaw;
    this.velX = 0;
    this.velZ = 0;
    this.accFastX = this.accFastZ = this.accSlowX = this.accSlowZ = 0;
    this.pitch = this.pitchVel = this.roll = this.rollVel = this.bank = 0;
    this.lazyTurning = false;
  }

  /** Contorno de luz do time. 0 apaga; até 0,6. A transição é suave. Sem cor, volta à padrão. */
  setHighlight(strength: number, color: string = RIM_DEFAULT) {
    this.rimTarget = Number.isFinite(strength) ? clamp(strength, 0, RIM_MAX) : 0;
    if (color !== this.rimColorKey) {
      this.rimColorKey = color;
      this.rim.uRimColor.value.set(color);
    }
  }

  /** Força (0..1) da última pancada no chão; zera ao ler. */
  takeLanding() {
    const value = this.landing;
    this.landing = 0;
    return value;
  }

  /** Todas as texturas do boneco (para subir para a GPU antes de precisar). */
  textureList(): THREE.Texture[] {
    return this.allTextures;
  }

  private land(strength: number) {
    const value = clamp01(strength);
    if (value <= 0) return;
    this.landing = Math.max(this.landing, value);
    this.squashVel -= 1.5 * value;
  }

  // ------------------------------------------------------------ animação

  update(dt: number, intent: FigureIntent) {
    this.time += dt;
    const t = this.time + this.offset;
    const w = this.weights;
    const targets = this.targets;
    const state = intent.state;
    const action = intent.action ?? null;
    const speed = Math.max(0, intent.speed);
    // Só anda quem está andando: "hold" da comemoração pode chegar com velocidade velha.
    const walks = state === "run" || state === "idle" || state === "ready";
    const loco = walks ? speed : 0;
    this.locoSpeed = loco;
    // A forma da passada segue a velocidade suavizada: parar de correr não
    // troca a pose de corrida pela de andar num quadro (joelho/braço estalando).
    this.gaitSpeed = approach(this.gaitSpeed, loco, 10, dt);
    if (state === "sad") this.sadMood = true;
    else if (state !== "run" && state !== "pushed") this.sadMood = false;

    // ---------------------------------------------------- pesos dos estados
    for (let index = 0; index < STATE_KEYS.length; index += 1) targets[STATE_KEYS[index]] = 0;
    const moving = Math.min(1, speed / 105);
    const stride = Math.min(1, loco / 25);
    if (state === "pushed") targets.pushed = Math.max(0.35, moving);
    else if (state === "run") targets.run = stride;
    else if (state !== "idle") targets[state] = 1;
    if (state === "ready" || state === "idle") targets.run = stride;
    const occupied = targets.ready + targets.aim + targets.run + targets.pushed + targets.celebrate + targets.scorer + targets.sad + targets.keeper;
    targets.idle = Math.max(0, 1 - occupied);
    if (state === "ready" || state === "idle") targets[state] = Math.max(targets[state], 1 - targets.run);

    // ------------------------------------------------------------- giro
    let turnRate = 5;
    if (state === "aim") turnRate = 16;
    else if (state === "run" || loco > 40) turnRate = 10;
    else if (state === "pushed") turnRate = 0;
    let turning = 0;
    // Parado, a cabeça vai antes: o corpo só gira quando o pescoço não alcança.
    const lazy = (state === "idle" || state === "ready") && loco < 20 && !action && this.diveMode === 0;
    if (intent.faceYaw !== null && turnRate > 0) {
      const delta = angleDelta(this.yaw, intent.faceYaw);
      let allow = true;
      if (lazy) {
        if (!this.lazyTurning) {
          if (Math.abs(delta) > (state === "ready" ? 0.3 : 0.55)) {
            this.turnWait -= dt;
            if (this.turnWait <= 0) this.lazyTurning = true;
          } else this.turnWait = this.reaction;
        }
        allow = this.lazyTurning;
        if (Math.abs(delta) < 0.04) this.lazyTurning = false;
      } else {
        this.lazyTurning = false;
        this.turnWait = this.reaction;
      }
      if (allow) {
        const step = Math.sign(delta) * Math.min(Math.abs(delta), turnRate * dt);
        this.yaw += step;
        turning = Math.abs(step) / Math.max(dt, 0.0001);
      }
    }
    targets.step = loco < 20 && turning > 0.6 && state !== "aim" && state !== "celebrate" && state !== "scorer" ? 1 : 0;
    // O giro do aviãozinho é da reserva: com ação pedida o corpo não roda junto.
    if (state === "scorer" && !action) this.spin += dt * 2.6;
    else this.spin = approach(this.spin, Math.round(this.spin / TAU) * TAU, 4, dt);

    const blendRate = state === "aim" ? 14 : 9;
    for (let index = 0; index < STATE_KEYS.length; index += 1) {
      const key = STATE_KEYS[index];
      w[key] = approach(w[key], targets[key], blendRate, dt);
    }
    const reserve = this.reserve;
    const free = action ? 0 : 1;
    reserve.celebrate = Math.min(w.celebrate, approach(reserve.celebrate, targets.celebrate * free, blendRate, dt));
    reserve.scorer = Math.min(w.scorer, approach(reserve.scorer, targets.scorer * free, blendRate, dt));
    reserve.sad = Math.min(w.sad, approach(reserve.sad, targets.sad * free, blendRate, dt));
    this.aimRatio = approach(this.aimRatio, intent.aimRatio, 22, dt);
    this.shuffle = approach(this.shuffle, intent.shuffle, 8, dt);

    // ------------------------------------------------------- passada
    // Fase guiada pela distância: o pé fica plantado no gramado.
    if (loco > 0.5) {
      const cycle = clamp(22 + 0.26 * loco, 26, 95);
      this.runPhase += TAU * Math.min(4.4, loco / cycle) * dt;
    }
    this.stepPhase += dt * TAU * (targets.step > 0 || w.step > 0.05 ? 2.4 : 0);
    this.shufflePhase += (TAU * Math.abs(this.shuffle) * dt) / 16;

    // Empurrão: o tronco fica para trás em relação ao deslocamento.
    const localHeading = intent.heading - this.yaw;
    this.pushLocalX = approach(this.pushLocalX, Math.sin(localHeading) * moving, 8, dt);
    this.pushLocalZ = approach(this.pushLocalZ, Math.cos(localHeading) * moving, 8, dt);
    if (speed > 6) this.lastHeading = intent.heading;

    const travel = state === "pushed" ? speed : loco;
    this.updateInertia(dt, speed, intent.heading, state, travel);

    // Cabeça acompanha a bola (com limite de pescoço).
    let wantYaw = 0;
    let wantPitch = 0.08;
    if (intent.look) {
      const dx = intent.look.x - this.root.position.x;
      const dz = intent.look.z - this.root.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 2) {
        wantYaw = clamp(angleDelta(this.yaw + this.spin, Math.atan2(dx, dz)), -1.05, 1.05);
        wantPitch = clamp((14 / Math.max(14, distance)) * 0.9, 0.05, 0.5);
      }
    }

    // ------------------------------------------------------- composição
    const pose = this.pose;
    const layer = this.layer;
    clearPose(pose);
    this.composeStates(t, pose, layer);
    this.applyInertia(pose);
    this.applyBrake(dt, pose, layer, travel, state);

    // Tiques e ações declarativas.
    this.context.moving = w.run;
    this.updateFidget(dt, state, action);
    this.updateActions(dt, action);
    let lookWeight = 1 - Math.min(1, w.celebrate + w.scorer + w.sad + w.aim * 0.8);
    lookWeight *= this.applyLayer(this.fidget, pose);
    lookWeight *= this.applyLayer(this.previous, pose);
    lookWeight *= this.applyLayer(this.current, pose);
    this.headYaw = approach(this.headYaw, wantYaw * lookWeight, 7, dt);
    this.headPitch = approach(this.headPitch, wantPitch * lookWeight, 5, dt);

    this.applyLunge(dt, pose, layer);
    this.applyKick(dt, pose, layer);
    this.applyDive(dt, pose, layer, intent);

    pose.neckY += this.headYaw;
    pose.neckX += -this.headPitch * 0.8;

    this.lastState = state;
    this.applyPose(dt, pose);
    this.updateFace(dt);

    // Contorno de luz suavizado: só uniform, nada recompila.
    const rim = this.rim;
    rim.uRimStrength.value = approach(rim.uRimStrength.value, this.rimTarget, 6, dt);
    if (rim.uRimStrength.value > 0.001) this.updateRimAxis();
  }

  /** Eixo da cápsula do contorno: segue o corpo (deitado no mergulho, de cabeça para baixo no mortal). */
  private updateRimAxis() {
    this.hips.updateWorldMatrix(true, false);
    const hips = this.hips.matrixWorld.elements;
    const body = this.body.matrixWorld.elements;
    const up = this.rimUp.set(body[4], body[5], body[6]).normalize();
    const scale = PX;
    this.rim.uRimA.value.set(hips[12], hips[13], hips[14]).addScaledVector(up, -7 * scale);
    this.rim.uRimB.value.set(hips[12], hips[13], hips[14]).addScaledVector(up, 14 * scale);
  }

  // ---------------------------------------------------------- estados

  private composeStates(t: number, pose: Pose, s: Pose) {
    const w = this.weights;
    const reserve = this.reserve;
    // O que a ação esconde das poses de reserva fica de pé, parado.
    const idleWeight = w.idle + (w.celebrate - reserve.celebrate) + (w.scorer - reserve.scorer) + (w.sad - reserve.sad);

    if (idleWeight > 0.0001) {
      clearPose(s);
      const breath = Math.sin(t * 2.3);
      s.bodyY = 0.12 * breath;
      s.torsoX = 0.02 * breath;
      s.shLZ = 0.08 + 0.02 * breath;
      s.shRZ = -0.08 - 0.02 * breath;
      s.shLX = 0.04 * Math.sin(t * 0.9);
      s.shRX = -0.04 * Math.sin(t * 0.9);
      s.elL = s.elR = -0.12;
      s.hipLZ = s.hipRZ = 0.03 * Math.sin(t * 0.7);
      s.bodyRotZ = 0.025 * Math.sin(t * 0.7);
      addPose(pose, s, idleWeight);
    }

    if (w.ready > 0.0001) {
      clearPose(s);
      const bounce = Math.abs(Math.sin(t * Math.PI * 1.9));
      s.bodyY = -0.75 + bounce * 0.45;
      s.torsoX = 0.2;
      s.neckX = -0.12;
      s.hipLX = s.hipRX = -0.22;
      s.kneeL = s.kneeR = 0.42;
      s.hipLZ = 0.07;
      s.hipRZ = -0.07;
      s.shLX = s.shRX = -0.32;
      s.shLZ = 0.28;
      s.shRZ = -0.28;
      s.elL = s.elR = -0.7;
      addPose(pose, s, w.ready);
    }

    if (w.aim > 0.0001) {
      clearPose(s);
      const ratio = this.aimRatio;
      const tremble = ratio > 0.82 ? (Math.sin(t * 64) * 0.18 * (ratio - 0.82)) / 0.18 : 0;
      s.bodyY = -1.1 - ratio * 0.45;
      s.bodyX = tremble * 0.6;
      s.torsoX = 0.28 + ratio * 0.12;
      s.torsoY = 0.18 * ratio;
      s.neckX = -0.22;
      s.shLX = -0.25 - ratio * 0.3;
      s.shLZ = 0.7 + ratio * 0.35;
      s.elL = -0.35;
      s.shRX = 0.2 + ratio * 0.45;
      s.shRZ = -0.55 - ratio * 0.2;
      s.elR = -0.3;
      s.hipLX = -0.32;
      s.kneeL = 0.48;
      s.hipRX = 0.25 + ratio * 0.95;
      s.kneeR = 0.55 + ratio * 0.95;
      s.ankleR = 0.3 * ratio;
      if (this.side < 0) mirrorPose(s);
      addPose(pose, s, w.aim);
    }

    if (w.run > 0.0001) {
      this.locomotion(s);
      addPose(pose, s, w.run);
    }

    // Passinho de giro no lugar.
    const stepWeight = w.step * (1 - w.run);
    if (stepWeight > 0.0001) {
      clearPose(s);
      const stepS = Math.sin(this.stepPhase);
      s.hipLX = 0.32 * stepS;
      s.hipRX = -0.32 * stepS;
      s.kneeL = 0.35 * Math.max(0, stepS);
      s.kneeR = 0.35 * Math.max(0, -stepS);
      s.bodyY = 0.25 * Math.abs(stepS);
      addPose(pose, s, stepWeight);
    }

    // Empurrado: corpo atrasado, braços se debatendo.
    if (w.pushed > 0.0001) {
      clearPose(s);
      const flail = Math.sin(t * 17);
      s.bodyRotX = -0.42 * this.pushLocalZ;
      s.bodyRotZ = 0.42 * this.pushLocalX;
      s.shLX = -1 + 0.7 * flail;
      s.shRX = -1 - 0.7 * flail;
      s.shLZ = 1 + 0.35 * flail;
      s.shRZ = -1 + 0.35 * flail;
      s.elL = s.elR = -0.4;
      s.hipLX = 0.35 * Math.sin(t * 21);
      s.hipRX = -0.35 * Math.sin(t * 21);
      s.kneeL = s.kneeR = 0.3;
      addPose(pose, s, w.pushed);
    }

    // Comemoração sem ação pedida (reserva).
    if (reserve.celebrate > 0.0001) {
      clearPose(s);
      const beat = t * TAU * 1.6;
      const hop = Math.max(0, Math.sin(beat));
      if (this.celebration === "jump") {
        s.bodyY = 6.5 * hop;
        s.shLX = -2.85;
        s.shRX = -2.85 + 0.25 * Math.sin(beat * 2);
        s.shLZ = 0.3;
        s.shRZ = -0.3;
        s.elL = s.elR = -0.25 * (1 - hop);
        s.hipLX = s.hipRX = -0.55 * hop;
        s.kneeL = s.kneeR = 1.1 * hop;
        s.neckX = -0.3;
      } else if (this.celebration === "fist") {
        s.bodyY = 0.8 * hop;
        s.shRX = -2.55 + 0.4 * Math.sin(beat * 1.5);
        s.shRZ = -0.25;
        s.elR = -1.15 + 0.5 * Math.sin(beat * 1.5);
        s.shLX = -0.4;
        s.shLZ = 0.3;
        s.elL = -1.3;
        s.torsoX = -0.16;
        s.neckX = -0.35;
        s.torsoY = 0.2;
        s.hipLX = -0.15;
        s.kneeL = 0.25;
      } else {
        const clap = Math.abs(Math.sin(beat * 1.3));
        s.bodyY = 0.6 * hop;
        putL(s, ARM_CLAP_OPEN, ARM_CLAP, clap);
        putR(s, ARM_CLAP_OPEN, ARM_CLAP, clap);
        s.neckX = -0.15;
      }
      addPose(pose, s, reserve.celebrate);
    }

    // Autor do gol sem coreografia: avião girando.
    if (reserve.scorer > 0.0001) {
      clearPose(s);
      s.bodyY = 0.6 * Math.abs(Math.sin(t * 7));
      s.bodyRotZ = 0.28 * Math.sin(t * 3.2);
      s.torsoX = 0.18;
      s.shLZ = 1.48;
      s.shRZ = -1.48;
      s.shLX = s.shRX = -0.1;
      s.hipLX = 0.5 * Math.sin(t * 13);
      s.hipRX = -0.5 * Math.sin(t * 13);
      s.kneeL = 0.5 * Math.max(0, -Math.cos(t * 13));
      s.kneeR = 0.5 * Math.max(0, Math.cos(t * 13));
      s.neckX = -0.25;
      addPose(pose, s, reserve.scorer);
    }

    // Gol sofrido sem ação pedida.
    if (reserve.sad > 0.0001) {
      clearPose(s);
      if (this.sadness === "head") {
        putL(s, ARM_HEAD_LOW);
        putR(s, ARM_HEAD_LOW);
        s.neckX = 0.45;
        s.torsoX = 0.05;
      } else if (this.sadness === "knees") {
        s.bodyY = -2.2;
        s.torsoX = 0.75;
        s.neckX = 0.2;
        s.hipLX = s.hipRX = -0.55;
        s.kneeL = s.kneeR = 1.05;
        s.shLX = s.shRX = -0.85;
        s.shLZ = 0.12;
        s.shRZ = -0.12;
        s.elL = s.elR = -0.05;
      } else {
        s.torsoX = 0.3;
        s.neckX = 0.62;
        s.bodyY = -0.4;
        s.shLZ = 0.05;
        s.shRZ = -0.05;
        s.shLX = s.shRX = 0.1;
        s.kneeL = s.kneeR = 0.12;
      }
      addPose(pose, s, reserve.sad);
    }

    // Goleiro: base larga, luvas para cima, passinho lateral guiado pela distância.
    if (w.keeper > 0.0001) {
      clearPose(s);
      const amount = Math.min(1, Math.abs(this.shuffle) / 90);
      const phase = this.shufflePhase;
      const open = Math.cos(phase) * amount;
      s.bodyY = -1.1 + Math.abs(Math.sin(phase)) * 0.55 * amount + 0.12 * Math.sin(t * 2.3);
      s.torsoX = 0.36;
      s.neckX = -0.3;
      s.hipLZ = 0.26 + 0.1 * open;
      s.hipRZ = -0.26 - 0.1 * open;
      s.hipLX = s.hipRX = -0.3;
      s.kneeL = s.kneeR = 0.62;
      s.shLX = s.shRX = -0.75 + 0.08 * Math.sin(t * 3.1);
      s.shLZ = 0.85 + 0.12 * amount * Math.sin(t * 6);
      s.shRZ = -0.85 - 0.12 * amount * Math.sin(t * 6);
      s.elL = s.elR = -0.95;
      addPose(pose, s, w.keeper);
    }
  }

  /** Andar → trotar → correr → disparada, tudo pela velocidade. */
  private locomotion(s: Pose) {
    clearPose(s);
    const v = this.gaitSpeed;
    const phase = this.runPhase;
    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);
    const gait = smooth((v - 55) / 70);
    const sprint = smooth((v - 230) / 120);
    const cycle = clamp(22 + 0.26 * v, 26, 95);
    const duty = 0.85 - 0.25 * smooth((v - 80) / 120);
    // Amplitude do quadril para o pé varrer o mesmo que o corpo anda no apoio.
    const amp = clamp(Math.asin(Math.min(1, (cycle * duty) / 51.85)), 0.3, 0.95) + 0.08 * sprint;
    // A perna esquerda vai à frente com sin > 0; a direita, com sin < 0.
    s.hipLX = -amp * sinP - 0.06 * gait;
    s.hipRX = amp * sinP - 0.06 * gait;
    const swingL = Math.max(0, Math.cos(phase + 0.3));
    const swingR = Math.max(0, -Math.cos(phase + 0.3));
    const kneeBase = 0.12 + 0.13 * gait;
    const kneeAmp = 0.55 + 0.75 * gait + 0.35 * sprint;
    s.kneeL = kneeBase + kneeAmp * swingL + 0.22 * gait * swingR;
    s.kneeR = kneeBase + kneeAmp * swingR + 0.22 * gait * swingL;
    // Andando o ponto alto é na passagem; correndo, no voo depois do impulso.
    const walkBob = 0.38 * Math.abs(cosP) - 0.25;
    const runBob = 1.05 * Math.abs(Math.sin(phase - 0.25)) - 0.75 - 0.5 * sprint;
    s.bodyY = mix(walkBob, runBob, gait);
    s.bodyRotZ = 0.035 * sinP * (1 - gait);
    // Braços contra as pernas; dobram mais ao vir à frente.
    const armAmp = (0.32 + 0.55 * gait) * (amp / 0.9) + 0.12 * sprint;
    s.shLX = armAmp * sinP;
    s.shRX = -armAmp * sinP;
    s.shLZ = 0.1 + 0.04 * gait - 0.08 * gait * Math.max(0, -sinP);
    s.shRZ = -(0.1 + 0.04 * gait - 0.08 * gait * Math.max(0, sinP));
    const elbow = -0.22 - 0.85 * gait - 0.3 * sprint;
    s.elL = elbow - 0.3 * gait * Math.max(0, -sinP);
    s.elR = elbow - 0.3 * gait * Math.max(0, sinP);
    // Quadril e ombros giram em sentidos opostos.
    const twist = 0.4 + 0.6 * gait;
    s.hipsY = -0.1 * sinP * twist;
    s.torsoY = 0.17 * sinP * twist;
    s.torsoX = 0.05 + 0.13 * gait + 0.26 * sprint;
    s.neckX = -0.6 * s.torsoX;
    s.neckY = -0.5 * (s.hipsY + s.torsoY);
  }

  // ------------------------------------------------- inércia e freada

  /** Mola do tronco: atrasa nos trancos (arranque, batida, curva) e volta. */
  private updateInertia(dt: number, speed: number, heading: number, state: FigureState, travel: number) {
    if (dt <= 0) return;
    const vx = speed * Math.sin(heading);
    const vz = speed * Math.cos(heading);
    const ax = clamp((vx - this.velX) / dt, -4000, 4000);
    const az = clamp((vz - this.velZ) / dt, -4000, 4000);
    this.velX = vx;
    this.velZ = vz;
    this.accFastX = approach(this.accFastX, ax, 30, dt);
    this.accFastZ = approach(this.accFastZ, az, 30, dt);
    this.accSlowX = approach(this.accSlowX, ax, 3, dt);
    this.accSlowZ = approach(this.accSlowZ, az, 3, dt);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const impX = this.accFastX - this.accSlowX;
    const impZ = this.accFastZ - this.accSlowZ;
    const forward = impX * sinY + impZ * cosY;
    const lateral = impX * cosY - impZ * sinY;
    // Inclina para dentro da curva quando corre.
    const slowLateral = this.accSlowX * cosY - this.accSlowZ * sinY;
    const bankTarget = state === "pushed" ? 0 : clamp(-slowLateral * 0.00045, -0.3, 0.3) * this.weights.run;
    this.bank = approach(this.bank, bankTarget, 6, dt);
    const omega = 16;
    const damping = 2 * 0.4 * omega;
    const pitchTarget = clamp(-forward * 0.00035, -0.3, 0.3);
    const rollTarget = clamp(lateral * 0.0004, -0.25, 0.25);
    // Euler explícito desta mola diverge acima de ~0,085 s por passo: limita o passo.
    const h = Math.min(dt, SPRING_STEP);
    this.pitchVel += (omega * omega * (pitchTarget - this.pitch) - damping * this.pitchVel) * h;
    this.pitch += this.pitchVel * h;
    this.rollVel += (omega * omega * (rollTarget - this.roll) - damping * this.rollVel) * h;
    this.roll += this.rollVel * h;
    this.neckLag = approach(this.neckLag, this.pitch, 10, dt);

    // Freada: a passada cruza para baixo de 28 depois de um embalo de verdade.
    const previous = this.prevSpeed;
    this.prevSpeed = travel;
    this.peakSpeed = travel > this.peakSpeed ? travel : approach(this.peakSpeed, travel, 1.2, dt);
    const wasMoving = this.lastState === "run" || this.lastState === "pushed" || this.weights.run > 0.5;
    if (wasMoving && previous >= 28 && travel < 28 && this.peakSpeed > 70 && this.brakeT < 0) {
      if (Math.cos(angleDelta(this.yaw, this.lastHeading)) > 0.4) {
        this.brakeT = 0;
        this.brakeAmount = clamp(this.peakSpeed / 220, 0.45, 1);
        this.brakeFront = Math.sin(this.runPhase) > 0 ? 1 : -1;
      }
    }
  }

  private applyInertia(pose: Pose) {
    pose.torsoX += this.pitch;
    pose.torsoZ += this.roll;
    pose.neckX += 0.5 * (this.neckLag - this.pitch);
    pose.bodyRotZ += this.bank;
  }

  private applyBrake(dt: number, pose: Pose, s: Pose, speed: number, state: FigureState) {
    if (this.brakeT < 0) return;
    // Mirar ou ser empurrado de novo cancela.
    if (state === "aim" || (speed > 40 && this.brakeT > 0.05)) {
      this.brakeT = -1;
      return;
    }
    this.brakeT += dt;
    const bt = this.brakeT;
    const envelope = Math.min(1, bt / 0.06) * (1 - smooth((bt - 0.24) / 0.16));
    clearPose(s);
    // Pé da frente finca (ponta para cima), o de trás arrasta a ponta.
    s.bodyY = -1.4;
    s.bodyRotX = -0.08;
    s.torsoX = -0.12;
    s.hipLX = -0.55;
    s.kneeL = 0.15;
    s.ankleL = -0.35;
    s.hipRX = 0.35;
    s.kneeR = 0.9;
    s.ankleR = 0.45;
    s.shLX = -0.7;
    s.shLZ = 0.6;
    s.elL = -0.5;
    s.shRX = -0.4;
    s.shRZ = -0.7;
    s.elR = -0.4;
    if (this.brakeFront < 0) mirrorPose(s);
    blendKeys(pose, s, envelope * this.brakeAmount, BRAKE_KEYS);
    if (bt >= BRAKE_TIME) {
      this.brakeT = -1;
      // Parou: o tronco segue à frente e assenta (follow-through).
      this.pitchVel += 2.6 * this.brakeAmount;
    }
  }

  // ------------------------------------------------------------ ações

  private updateActions(dt: number, action: FigureAction | null) {
    if (action !== this.actionId) {
      this.actionId = action;
      let incoming = this.current;
      if (incoming.id) {
        const outgoing = incoming;
        // A meia-volta do siuuu vira o novo "para frente": nada gira de volta.
        // Sempre "assada", mesmo zero: a ação cortada antes do giro não gira enquanto some.
        this.yaw += outgoing.spin;
        outgoing.spinBaked = true;
        outgoing.dir = -1;
        // Troca rápida (A→B→C): fica saindo a camada que mais pesa na pose; a
        // outra é reaproveitada para a nova (some a de menor peso, não a maior).
        const fading = this.previous;
        if (!fading.id || fading.w <= outgoing.w) {
          this.current = fading;
          this.previous = outgoing;
          incoming = fading;
        }
      }
      incoming.id = action;
      incoming.t = 0;
      incoming.w = 0;
      incoming.dir = action ? 1 : 0;
      incoming.spin = 0;
      incoming.spinBaked = false;
    }
    const current = this.current;
    if (current.id) {
      current.sad = this.sadMood;
      const def = ACTIONS[current.id];
      const before = current.t;
      current.t += dt;
      current.w = Math.min(1, current.w + dt / ACTION_IN);
      const impacts = def.impacts;
      if (impacts) {
        for (let index = 0; index < impacts.length; index += 1) {
          const impact = impacts[index];
          if (before < impact[0] && current.t >= impact[0]) this.land(impact[1]);
        }
      }
    }
    const previous = this.previous;
    if (previous.id) {
      previous.t += dt;
      previous.w -= dt / ACTION_OUT;
      if (previous.w <= 0) {
        previous.id = null;
        previous.w = 0;
      }
    }
  }

  private updateFidget(dt: number, state: FigureState, action: FigureAction | null) {
    const fidget = this.fidget;
    const ok = state === "idle" && !action && this.locoSpeed < 1 && this.weights.idle > 0.85
      && this.diveMode === 0 && this.kickT < 0 && this.lungeT < 0 && this.brakeT < 0;
    if (fidget.id) {
      fidget.t += dt;
      if (!ok) fidget.dir = -1;
      if (fidget.dir > 0 && fidget.t >= fidget.until) fidget.dir = -1;
      fidget.w += fidget.dir > 0 ? dt / 0.2 : -dt / (ok ? 0.25 : 0.15);
      if (fidget.w >= 1) fidget.w = 1;
      if (fidget.w <= 0) {
        fidget.id = null;
        fidget.w = 0;
        this.fidgetIn = 4 + this.random() * 5;
      }
      return;
    }
    if (!ok) {
      this.fidgetIn = Math.max(this.fidgetIn, 1.2);
      return;
    }
    this.fidgetIn -= dt;
    if (this.fidgetIn > 0) return;
    let pick = this.random() * FIDGET_TOTAL;
    let index = 0;
    for (; index < FIDGETS.length - 1; index += 1) {
      pick -= FIDGETS[index][2];
      if (pick <= 0) break;
    }
    if (index === this.lastFidget) index = (index + 1) % FIDGETS.length;
    this.lastFidget = index;
    fidget.id = FIDGETS[index][0];
    fidget.until = FIDGETS[index][1];
    fidget.t = 0;
    fidget.w = 0;
    fidget.dir = 1;
  }

  /** Mistura uma camada de ação na pose. Devolve o quanto a cabeça ainda segue a bola. */
  private applyLayer(layer: Layer, pose: Pose) {
    layer.spin = 0;
    if (!layer.id || layer.w <= 0.0001) return 1;
    const def = ACTIONS[layer.id];
    const weight = smooth(layer.w);
    const out = this.layer;
    const ctx = this.context;
    ctx.sad = layer.sad;
    if (def.body === "full") clearPose(out);
    else if (def.body === "overlay") copyPose(out, pose);
    else {
      // Braços e tronco partem da pose de baixo; pernas, de pé parado.
      clearPose(out);
      for (let index = 0; index < ARM_KEYS.length; index += 1) out[ARM_KEYS[index]] = pose[ARM_KEYS[index]];
      for (let index = 0; index < TRUNK_KEYS.length; index += 1) out[TRUNK_KEYS[index]] = pose[TRUNK_KEYS[index]];
      out.bodyY = 0.1 * Math.sin(layer.t * 2.3);
    }
    def.sample(layer.t, out, ctx);
    if (def.mirror && this.side < 0) mirrorPose(out);
    if (layer.spinBaked) out.spinY = 0;
    const legs = def.body === "upper" ? weight * (1 - ctx.moving) : weight;
    blendKeys(pose, out, weight, ARM_KEYS);
    blendKeys(pose, out, weight, TRUNK_KEYS);
    blendKeys(pose, out, legs, LOWER_KEYS);
    layer.spin = out.spinY * Math.min(1, legs);
    return 1 - weight * (1 - def.look);
  }

  // ------------------------------------------------- arranque e chute

  private applyLunge(dt: number, pose: Pose, s: Pose) {
    if (this.lungeT < 0) return;
    this.lungeT += dt / 0.3;
    const envelope = Math.sin(Math.min(1, this.lungeT) * Math.PI);
    clearPose(s);
    // Braço contrário à perna da frente vai à frente, como um velocista.
    s.torsoX = 0.45;
    s.bodyY = -0.6;
    s.shRX = -1;
    s.shRZ = -0.15;
    s.elR = -1.2;
    s.shLX = 0.9;
    s.shLZ = 0.15;
    s.elL = -0.3;
    s.hipRX = 0.6;
    s.kneeR = 0.05;
    s.hipLX = -0.5;
    s.kneeL = 0.5;
    if (this.side < 0) mirrorPose(s);
    blendKeys(pose, s, envelope * 0.85, LUNGE_KEYS);
    if (this.lungeT >= 1) this.lungeT = -1;
  }

  private applyKick(dt: number, pose: Pose, s: Pose) {
    if (this.kickT < 0) return;
    this.kickT += dt;
    const k = this.kickT;
    const p = this.kickPower;
    clearPose(s);
    let envelope: number;
    if (this.kickKind === "strike") {
      // Arma (0,05) → golpe seco (0,07) → acompanha (0,22) → solta (0,16).
      envelope = smooth(k / 0.035) * (1 - smooth((k - 0.34) / 0.16));
      let hip: number;
      let knee: number;
      let ankle = 0;
      if (k < 0.05) {
        const a = smooth(k / 0.05);
        hip = mix(0.5, 1, a);
        knee = mix(0.7, 1.25, a);
      } else if (k < 0.12) {
        const a = (k - 0.05) / 0.07;
        const accel = a * a;
        hip = mix(1, -(0.35 + 0.35 * p), accel);
        knee = mix(1.25, 0.08, accel);
        ankle = 0.4 * accel;
      } else {
        const a = easeOut((k - 0.12) / 0.22);
        hip = mix(-(0.35 + 0.35 * p), -(0.9 + 0.55 * p), a);
        knee = mix(0.08, 0.3, a);
        ankle = 0.4;
      }
      const hop = k > 0.1 ? Math.sin(Math.PI * clamp01((k - 0.1) / 0.3)) : 0;
      s.hipRX = hip;
      s.kneeR = knee;
      s.ankleR = ankle;
      s.hipLX = -0.12;
      s.kneeL = 0.32;
      s.bodyY = -0.3 + 1.2 * p * hop;
      s.torsoX = -0.22 * p * smooth((k - 0.06) / 0.1) + 0.12 * (1 - smooth(k / 0.08));
      s.torsoY = -0.25;
      s.neckX = 0.15;
      // Braços em contrapeso: o do lado do chute vai para trás e abre.
      s.shRX = 0.55;
      s.shRZ = -0.75;
      s.elR = -0.3;
      s.shLX = -0.85;
      s.shLZ = 1.05;
      s.elL = -0.35;
      if (k >= KICK_STRIKE) this.kickT = -1;
    } else {
      // Bloqueio: amortece de peito aberto, coxa sobe para matar a bola.
      envelope = smooth(k / 0.06) * (1 - smooth((k - 0.16) / 0.16));
      const cushion = Math.sin(Math.PI * clamp01(k / 0.22));
      s.hipRX = -0.7 * cushion;
      s.kneeR = 0.95 * cushion;
      s.ankleR = -0.25 * cushion;
      s.hipLX = -0.05;
      s.kneeL = 0.25;
      s.bodyY = -0.4;
      s.torsoX = -0.18 - 0.12 * p;
      s.torsoY = 0;
      s.neckX = 0.25;
      s.shLX = s.shRX = -0.35;
      s.shLZ = 0.75;
      s.shRZ = -0.75;
      s.elL = s.elR = -0.6;
      if (k >= KICK_BLOCK) this.kickT = -1;
    }
    if (this.kickSide < 0) mirrorPose(s);
    blendKeys(pose, s, envelope, KICK_KEYS);
  }

  // ---------------------------------------------------------- goleiro

  private applyDive(dt: number, pose: Pose, s: Pose, intent: FigureIntent) {
    const want = intent.dive;
    if (this.diveMode === 0 && Math.abs(want) > 0.3) {
      // Trava lado e alcance no disparo: a bola desviada não arrasta o goleiro.
      this.diveMode = 1;
      this.diveT = 0;
      this.diveSide = Math.sign(want);
      this.diveReach = Math.min(1, Math.abs(want));
    }
    if (this.diveMode === 0) return;
    let weight = 1;
    if (this.diveMode === 1) {
      const before = this.diveT;
      this.diveT += dt;
      if (this.diveT < 0.08) this.diveReach = Math.max(this.diveReach, Math.min(1, Math.abs(want)));
      if (before < 0.42 && this.diveT >= 0.42) this.land(1);
      if (this.diveT > 0.9 && Math.abs(want) < 0.05) {
        this.diveMode = 2;
        this.riseT = 0;
      }
    } else {
      this.riseT += dt;
      weight = 1 - smooth(this.riseT / 0.5);
      if (this.riseT >= 0.5) {
        this.diveMode = 0;
        return;
      }
    }
    const d = this.diveT;
    const side = this.diveSide;
    const reach = 7 + 9 * this.diveReach;
    clearPose(s);
    if (d < 0.07) {
      // Carga: afunda e joga o peso para o lado contrário (antecipação).
      const k = smooth(d / 0.07);
      s.bodyY = -2.2 * k;
      s.bodyX = -side * k;
      s.hipLX = s.hipRX = -0.5 * k;
      s.kneeL = s.kneeR = 0.9 * k;
      s.torsoX = 0.36;
      s.shLX = s.shRX = -0.9;
      s.shLZ = 0.85;
      s.shRZ = -0.85;
      s.elL = s.elR = -0.9;
    } else {
      const fly = clamp01((d - 0.07) / 0.35);
      const e = smooth(fly);
      const arms = smooth(fly / 0.35);
      // Arco: sobe, deita de lado em volta do quadril e cai a ~4 px do chão.
      s.bodyX = side * reach * easeOut(fly) - side * (1 - arms);
      s.bodyY = mix(-2.2, -9, e) + 10 * Math.sin(Math.PI * fly);
      s.pivZ = -side * 1.45 * e;
      s.torsoX = mix(0.36, 0.05, arms);
      s.torsoZ = -side * 0.15 * e;
      s.neckX = -0.2;
      s.neckZ = side * 0.25 * e;
      s.shLX = s.shRX = mix(-0.9, -2.95, arms);
      s.shLZ = mix(0.85, 0.2, arms);
      s.shRZ = -s.shLZ;
      s.elL = s.elR = mix(-0.9, 0, arms);
      s.hipLX = -0.3 * e;
      s.hipRX = 0.35 * e;
      s.kneeL = mix(0.9, 0.4, e);
      s.kneeR = mix(0.9, 0.2, e);
      if (d > 0.42) {
        // No chão: o quique do impacto e depois a respiração.
        const settle = d - 0.42;
        s.bodyY += 0.6 * Math.sin(Math.min(settle / 0.13, 1) * Math.PI) * Math.exp(-settle * 4);
        s.shLX += 0.1 * Math.sin(settle * 3);
        s.torsoX += 0.04 * Math.sin(settle * 2.3);
      }
    }
    blendKeys(pose, s, weight, BODY_KEYS);
  }

  // ------------------------------------------------------------ aplica

  private applyPose(dt: number, pose: Pose) {
    this.root.rotation.y = this.yaw + this.spin + pose.spinY;

    // Giro do corpo: inclinações (bodyRot) giram nos pés; mortal e mergulho (piv), no quadril.
    const rx = pose.bodyRotX;
    const rz = pose.bodyRotZ;
    const ax = rx + pose.pivX;
    const az = rz + pose.pivZ;
    const h = PIVOT_H;
    const footX = -h * Math.sin(rz);
    const footY = h * Math.cos(rz) * Math.cos(rx);
    const footZ = h * Math.cos(rz) * Math.sin(rx);
    const totalX = -h * Math.sin(az);
    const totalY = h * Math.cos(az) * Math.cos(ax);
    const totalZ = h * Math.cos(az) * Math.sin(ax);
    this.body.position.set(pose.bodyX + footX - totalX, pose.bodyY + footY - totalY, pose.bodyZ + footZ - totalZ);
    this.body.rotation.set(ax, 0, az);
    this.hips.rotation.y = pose.hipsY;
    this.torso.rotation.set(pose.torsoX, pose.torsoY, pose.torsoZ);
    this.neck.rotation.set(pose.neckX, pose.neckY, pose.neckZ);
    this.shoulderL.rotation.set(pose.shLX, pose.shLY, pose.shLZ);
    this.shoulderR.rotation.set(pose.shRX, pose.shRY, pose.shRZ);
    this.elbowL.rotation.x = pose.elL;
    this.elbowR.rotation.x = pose.elR;
    this.hipL.rotation.set(pose.hipLX, 0, pose.hipLZ);
    this.hipR.rotation.set(pose.hipRX, 0, pose.hipRZ);
    this.kneeL.rotation.x = pose.kneeL;
    this.kneeR.rotation.x = pose.kneeR;
    // Chuteira plana enquanto a canela está perto da vertical; correndo, só metade.
    const flatWeight = 1 - 0.55 * this.weights.run;
    const shinL = rx + pose.hipLX + pose.kneeL;
    const shinR = rx + pose.hipRX + pose.kneeR;
    const flatL = (1 - smooth((Math.abs(shinL) - 0.7) / 0.6)) * flatWeight;
    const flatR = (1 - smooth((Math.abs(shinR) - 0.7) / 0.6)) * flatWeight;
    this.ankleL.rotation.set(pose.ankleL - shinL * flatL, 0, -pose.hipLZ * flatL);
    this.ankleR.rotation.set(pose.ankleR - shinR * flatR, 0, -pose.hipRZ * flatR);

    // Aterrissagem: o corpo estava no ar e voltou ao chão.
    const air = this.diveMode === 0 ? Math.max(0, pose.bodyY) : 0;
    if (air > this.airPeak) this.airPeak = air;
    if (this.prevAir > 0.6 && air <= 0.6) {
      if (this.airPeak > 2.5) this.land((this.airPeak - 1) / 10);
      this.airPeak = 0;
    } else if (air <= 0.6) this.airPeak = 0;
    this.prevAir = air;

    // Achata de leve ao cair e estica no arranque (mola, no máximo ~8%).
    const omega = 22;
    const springStep = Math.min(dt, SPRING_STEP);
    this.squashVel += (-omega * omega * this.squash - 2 * 0.35 * omega * this.squashVel) * springStep;
    this.squash = clamp(this.squash + this.squashVel * springStep, -0.09, 0.07);
    const squash = this.squash;
    this.model.scale.set(PX * (1 - 0.5 * squash), PX * (1 + squash), PX * (1 - 0.5 * squash));

    // Sombra de contato encolhe no pulo e acompanha o mergulho.
    const lift = Math.max(0, pose.bodyY) * PX;
    const blobScale = 25 * (1 - Math.min(0.45, lift / 22)) + Math.abs(pose.pivZ) * 6;
    this.blob.scale.set(blobScale, blobScale, 1);
    this.blob.position.x = (pose.bodyX - Math.sin(pose.pivZ) * 4) * PX;
    this.blobMaterial.opacity = 1 - Math.min(0.5, lift / 18);
  }

  private updateFace(dt: number) {
    const w = this.weights;
    let mood: FaceMood | null = null;
    const current = this.current;
    if (current.id && current.w > 0.5) {
      const def = ACTIONS[current.id];
      this.context.sad = current.sad;
      mood = typeof def.mood === "function" ? def.mood(current.t, this.context) : def.mood;
    }
    if (!mood) {
      if (this.kickT >= 0 && this.kickKind === "strike") mood = "grit";
      else if (this.kickT >= 0 && this.kickPower > 0.75) mood = "surprised";
      else if (this.diveMode === 1 && this.diveT < 0.6) mood = "grit";
      else if (w.celebrate + w.scorer > 0.5) mood = "shout";
      else if (w.sad > 0.5) mood = "sad";
      else if (w.aim > 0.5 && this.aimRatio > 0.8) mood = "grit";
      else if (w.run > 0.5 && this.locoSpeed > 300) mood = "grit";
    }
    if (!mood || mood === "normal") {
      mood = "normal";
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkFor = 0.13;
        this.blinkIn = 1.8 + this.random() * 3.6;
      }
      if (this.blinkFor > 0) {
        this.blinkFor -= dt;
        mood = "blink";
      }
    }
    if (mood !== this.mood) {
      this.mood = mood;
      // Trocar o map por outro do mesmo formato não precisa recompilar o material.
      this.faceMaterial.map = this.headTextures[mood];
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
    action: null,
    ...overrides,
  };
}

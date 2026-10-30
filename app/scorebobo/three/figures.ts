// Os bonecos da partida (PlayerFigure do Modo 3D) em metros: um por ator,
// com o uniforme do time, o goleiro de cor própria, o herói com contorno
// dourado. Cada quadro traduz pose/velocidade/olhar do ator da simulação em
// intenção e ações do boneco (corrida, mira, chute, cabeceio, mergulho,
// comemoração, lamento).

import * as THREE from "three";
import {
  FIGURE_ACTION_INFO,
  FIGURE_HEIGHT,
  FIGURE_RIG,
  PX,
  PlayerFigure,
  angleDelta,
  figurePose,
  idleIntent,
  releaseSharedFigureResources,
  retainSharedFigureResources,
  type FigureAction,
  type FigureIntent,
  type FigurePose,
  type FigureReach,
} from "../../botao/three/character";
import type { FaceMood } from "../../botao/three/textures";
import { teamKitPattern } from "../../player-appearance";
import type { Actor, GameState, ScoreTeams } from "../types";
import { clamp, clamp01, hashString, mix, smooth } from "./util";

/** Boneco de 1,8 m (FIGURE_HEIGHT unidades de campo). */
export const FIGURE_SCALE = 1.8 / FIGURE_HEIGHT;
const UNITS = 1 / FIGURE_SCALE;

const KEEPER_COLORS = ["#c6ff3d", "#ff8c1a", "#8a5cff", "#20e0c0", "#ff4fa3"];
const HERO_RIM = "#ffd76a";
const RECEIVER_RIM = "#6ff3ff";
const MATE_RIM = "#d8fbff";

const TEAM_CHEERS: FigureAction[] = ["jumpCheer", "fistPump", "clap", "pointSky", "jumpCheer", "fistPump"];
const SADNESS: FigureAction[] = ["handsOnHead", "kneelSad", "handsOnHips", "handsOnHead", "disbelief"];

/** O skinIndex do boneco é Uint8: um esqueleto só para o time cabe até 255 ossos (21 bonecos). */
const MAX_SHARED_BONES = 255;
/** Sombras de contato instanciadas a partir desse tanto de bonecos (com dois, os dois draws não economizam nada). */
const MIN_BLOB_DRAW = 3;
/**
 * ...e até esse tanto: cada uma leva uma matriz e uma opacidade em uniform (5
 * vetores; 24 dão 120, mais uns 30 do material, bem abaixo dos 256 que o
 * WebGL2 garante no vertex shader de qualquer celular).
 */
const MAX_BLOB_DRAW = 24;
const BLOB_PROGRAM_KEY = "scorebobo-squad-blobs-v1";
/**
 * Modo desempenho: no voo os bonecos longe do lance animam em quadro sim,
 * quadro não (desfecho e replay já desenham a 30 no LevelPlayer).
 */
const THIN_PHASES: ReadonlySet<GameState["phase"]> = new Set(["flight"]);
/** Só alterna com o jogo acima de ~40 quadros por segundo (abaixo, eles já animam a ~30 Hz ou menos). */
const THIN_MAX_DT = 1 / 40;
/** Quem está a menos disso da bola (m, no chão) anima todo quadro. */
const THIN_NEAR_BALL = 6;
/** Teto do passo acumulado de quem pulou quadros (o mesmo do `update` do boneco). */
const THIN_MAX_STEP = 0.1;

const BLOB_VERTEX_HEAD = [
  "#include <common>",
  "uniform mat4 uBlobView[ BLOB_COUNT ];",
  "uniform float uBlobOpacity[ BLOB_COUNT ];",
  "flat varying float vBlobOpacity;",
].join("\n");
// As contas do project_vertex, com a modelView de cada sombra no lugar da do objeto.
const BLOB_PROJECT_VERTEX = [
  "vec4 mvPosition = vec4( transformed, 1.0 );",
  "mvPosition = uBlobView[ gl_InstanceID ] * mvPosition;",
  "gl_Position = projectionMatrix * mvPosition;",
  "vBlobOpacity = uBlobOpacity[ gl_InstanceID ];",
].join("\n");
const BLOB_FRAGMENT_HEAD = ["#include <common>", "flat varying float vBlobOpacity;"].join("\n");

/**
 * Um esqueleto só para o time inteiro: o three atualiza cada Skeleton uma vez
 * por quadro (e o passe de sombra reaproveita), então em vez de 9 texturas de
 * ossos 8x8 sobe uma 24x24 por quadro. Cada boneco tem a própria geometria
 * (builder.build()), então o skinIndex de cada um ganha o deslocamento dos
 * ossos dele sem mexer em nada compartilhado; a bindMatrix é a identidade e as
 * inversas são as do boneco, então a conta de cada osso sai a mesma. Esfera de
 * recorte e âncoras das mãos não dependem do esqueleto. null: passou do limite
 * do Uint8 (cada boneco fica com o seu, como antes).
 */
function shareSkeleton(figures: PlayerFigure[]): THREE.Skeleton | null {
  const meshes = figures.map((figure) => figure.skinnedMesh);
  const total = meshes.reduce((sum, mesh) => sum + mesh.skeleton.bones.length, 0);
  if (meshes.length < 2 || total > MAX_SHARED_BONES) return null;
  const bones: THREE.Bone[] = [];
  const inverses: THREE.Matrix4[] = [];
  for (const mesh of meshes) {
    const base = bones.length;
    const own = mesh.skeleton;
    for (let index = 0; index < own.bones.length; index += 1) {
      bones.push(own.bones[index]);
      inverses.push(own.boneInverses[index].clone());
    }
    // Um osso por vértice (peso 1 no x): só o x conta.
    const skinIndex = mesh.geometry.getAttribute("skinIndex") as THREE.BufferAttribute;
    const indices = skinIndex.array;
    for (let index = 0; index < indices.length; index += 4) indices[index] += base;
    skinIndex.needsUpdate = true;
  }
  const skeleton = new THREE.Skeleton(bones, inverses);
  for (const mesh of meshes) mesh.bind(skeleton, mesh.bindMatrix);
  return skeleton;
}

/** Um draw instanciado de sombras: a matriz modelView e a opacidade de cada uma em uniforms. */
type BlobDraw = {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshBasicMaterial>;
  views: Float32Array;
  opacities: Float32Array;
};

function blobDraw(source: THREE.Mesh, count: number, renderOrder: number): BlobDraw {
  const views = new Float32Array(count * 16);
  const opacities = new Float32Array(count);
  const plane = source.geometry;
  const geometry = new THREE.InstancedBufferGeometry();
  if (plane.index) geometry.setIndex(plane.index.clone());
  geometry.setAttribute("position", plane.getAttribute("position").clone());
  geometry.setAttribute("uv", plane.getAttribute("uv").clone());
  geometry.instanceCount = 0;
  // Mesmo mapa, transparência, neblina e depthWrite da sombra do boneco; o programa é um só para os dois draws.
  const material = (source.material as THREE.MeshBasicMaterial).clone();
  material.defines = { BLOB_COUNT: count };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlobView = { value: views };
    shader.uniforms.uBlobOpacity = { value: opacities };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", BLOB_VERTEX_HEAD)
      .replace("#include <project_vertex>", BLOB_PROJECT_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", BLOB_FRAGMENT_HEAD)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse, vBlobOpacity );");
  };
  material.customProgramCacheKey = () => BLOB_PROGRAM_KEY;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  return { mesh, views, opacities };
}

/**
 * As sombras de contato do time em dois draws instanciados (era um por
 * boneco). As de cada boneco continuam na cena, escondidas: o three segue
 * calculando a matriz de mundo delas e o boneco segue mexendo em escala,
 * posição e opacidade (modo desempenho incluído). Na hora do draw (câmera e
 * matrizes do quadro já prontas), cada sombra que o three desenharia vira uma
 * instância, com a modelView feita com a mesma conta dele e na mesma ordem de
 * trás para frente (z do recorte do centro, depois id). A sombra da bola tem o
 * mesmo renderOrder e o three a põe no meio das dos bonecos pela distância: as
 * que ficam atrás dela vão no draw `back` (renderOrder meio ponto abaixo: sai
 * logo antes dela) e as outras no `front` (logo depois). Nenhum outro objeto da
 * cena tem renderOrder entre esses dois, então o quadro sai igual ao de antes.
 */
class SquadBlobs {
  readonly back: BlobDraw;
  readonly front: BlobDraw;
  private readonly order: number[];
  private readonly depth: Float64Array;
  private readonly projScreen = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  private readonly modelView = new THREE.Matrix4();
  private readonly point = new THREE.Vector4();
  /** O outro transparente da cena com o renderOrder das sombras (hoje só a sombra da bola), achado no primeiro draw. */
  private peer: THREE.Mesh | null | undefined;

  constructor(
    private readonly blobs: THREE.Mesh[],
    private readonly owner: THREE.Object3D,
  ) {
    const count = blobs.length;
    const source = blobs[0];
    this.order = new Array<number>(count).fill(0);
    this.depth = new Float64Array(count);
    this.back = blobDraw(source, count, source.renderOrder - 0.5);
    this.front = blobDraw(source, count, source.renderOrder + 0.5);
    // O de trás desenha primeiro: monta os dois.
    this.back.mesh.onBeforeRender = (_renderer, scene, camera) => this.sync(scene, camera);
    for (const blob of blobs) blob.visible = false;
  }

  /** O que o three faria com cada sombra (visível? em que ordem? com que matriz?), refeito para a câmera do draw. */
  private sync(scene: THREE.Object3D, camera: THREE.Camera) {
    if (this.peer === undefined) this.peer = this.findPeer(scene);
    const projScreen = this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(projScreen, THREE.WebGLCoordinateSystem, camera.reversedDepth);
    const order = this.order;
    const depth = this.depth;
    let count = 0;
    for (let index = 0; index < this.blobs.length; index += 1) {
      const blob = this.blobs[index];
      if (!this.shows(blob, camera)) continue;
      // z do recorte do centro (regra de ordem do three): o de trás primeiro; empate, o id menor.
      const z = this.point.set(0, 0, 0, 1).applyMatrix4(blob.matrixWorld).applyMatrix4(projScreen).z;
      let at = count;
      while (at > 0) {
        const previous = order[at - 1];
        if (depth[previous] > z || (depth[previous] === z && this.blobs[previous].id < blob.id)) break;
        order[at] = previous;
        at -= 1;
      }
      order[at] = index;
      depth[index] = z;
      count += 1;
    }
    // Corte na sombra da bola, pela mesma regra (fora do quadro ela não desenha e qualquer corte serve).
    let split = count;
    const peer = this.peer;
    if (peer) {
      const center = peer.geometry.boundingSphere?.center;
      const z = this.point.set(center?.x ?? 0, center?.y ?? 0, center?.z ?? 0, 1).applyMatrix4(peer.matrixWorld).applyMatrix4(projScreen).z;
      split = 0;
      while (split < count && (depth[order[split]] > z || (depth[order[split]] === z && this.blobs[order[split]].id < peer.id))) split += 1;
    }
    this.fill(this.back, 0, split, camera);
    this.fill(this.front, split, count, camera);
  }

  private fill(draw: BlobDraw, from: number, to: number, camera: THREE.Camera) {
    for (let slot = 0; slot < to - from; slot += 1) {
      const blob = this.blobs[this.order[from + slot]];
      this.modelView.multiplyMatrices(camera.matrixWorldInverse, blob.matrixWorld).toArray(draw.views, slot * 16);
      draw.opacities[slot] = (blob.material as THREE.MeshBasicMaterial).opacity;
    }
    draw.mesh.geometry.instanceCount = to - from;
  }

  private findPeer(scene: THREE.Object3D): THREE.Mesh | null {
    const renderOrder = this.blobs[0].renderOrder;
    const own = new Set<THREE.Object3D>(this.blobs);
    let peer: THREE.Mesh | null = null;
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (peer || !mesh.isMesh || mesh.renderOrder !== renderOrder || own.has(mesh) || Array.isArray(mesh.material)) return;
      if (mesh.material.transparent) peer = mesh;
    });
    return peer;
  }

  /**
   * A sombra própria está escondida: vale a visibilidade dos pais dela (o
   * boneco) até o time e o mesmo recorte pelo frustum do three (fora do quadro
   * ela não vira instância: um lado só com sombras fora da tela daria um draw a mais).
   */
  private shows(blob: THREE.Mesh, camera: THREE.Camera) {
    if (!blob.layers.test(camera.layers) || !(blob.material as THREE.Material).visible) return false;
    for (let node = blob.parent; node && node !== this.owner; node = node.parent) {
      if (!node.visible) return false;
    }
    return !blob.frustumCulled || blob.intersectsFrustum(this.frustum);
  }

  dispose() {
    for (const draw of [this.back, this.front]) {
      draw.mesh.removeFromParent();
      draw.mesh.geometry.dispose();
      draw.mesh.material.dispose();
    }
    this.peer = null;
  }
}

function isAction(id: string): id is FigureAction {
  return Object.prototype.hasOwnProperty.call(FIGURE_ACTION_INFO, id);
}

/** Id de CELEBRATION_OPTIONS (ou FigureAction direto) → ação do boneco. */
export function celebrationAction(id: string | undefined, seed: number): FigureAction {
  if (id === "cornerFlag") return "flagDance";
  if (id === "crest") return "crestKiss";
  if (id && id !== "auto" && isAction(id)) return id;
  const pool: FigureAction[] = ["kneeSlide", "siuu", "airplane", "pointSky", "fistPump", "backflip", "heart", "dance"];
  return pool[seed % pool.length];
}

function contrastKeeper(teams: ScoreTeams, seed: number) {
  const avoid = [teams.home.primary, teams.away.primary].map((hex) => new THREE.Color(hex));
  const scored = KEEPER_COLORS.map((hex, index) => {
    const color = new THREE.Color(hex);
    const distance = Math.min(...avoid.map((other) => Math.abs(color.r - other.r) + Math.abs(color.g - other.g) + Math.abs(color.b - other.b)));
    return { hex, score: distance + ((seed + index) % 5) * 0.01 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].hex;
}

// ---------------------------------------------------------------- goleiro

/** px de boneco por metro (1,8 m = 32 px). */
const M2PX = 1 / (PX * FIGURE_SCALE);
const RIG = FIGURE_RIG;
const POSE_KEYS = Object.keys(figurePose()) as Array<keyof FigurePose>;
const GRAVITY_PX = 9.8 * M2PX;
/** Pivô (quadril) de pé na base, deitado de lado no gramado e ajoelhado (m). */
const KEEPER_STAND_Y = (RIG.pivot - 1.3) / M2PX;
const KEEPER_LIE_Y = 0.24;
const KEEPER_KNEEL_BODY_Y = -4.9;
/** Do quadril até a palma com os braços quase esticados acima da cabeça (m). */
const KEEPER_REACH = 1.16;
/** Largura da base (m, entre os pés) e a do "set" no chute. */
const STANCE_WIDTH = 0.5;
const SET_WIDTH = 0.6;
/** O pé sai do lugar quando fica mais longe que isso do ponto dele (m). */
const STEP_TRIGGER = 0.11;
/** Acima disso, fora de um chute, ele corre de verdade (m/s). */
const KEEPER_RUN = 2.4;
/** Passinho de preparação (set) no chute: afunda, sobe, cai e amortece (s de jogo). */
const HOP_TIME = 0.3;
/** Mãos em volta da bola agarrada: meia distância entre as palmas (m). */
const CLUTCH_HALF = 0.125;
const GET_UP = 0.8;
/**
 * Passo fixo da simulação (s de jogo, o FIXED_DT do game.ts). Ela não
 * interpola: na câmera lenta um quadro de 1/60 anda 0 ou 1 passo, e o corpo
 * guiado direto por ela anda aos degraus. A cena desenha entre os passos
 * (até um passo atrás da simulação).
 */
const SIM_STEP = 1 / 120;
/** Mola das palmas (1/s): o desvio de um alvo que pulou some criticamente amortecido, sem tranco no começo. */
const PALM_SPRING = 30;
/** Passo lateral rápido (cobrindo o gol): o corpo anda isso por ciclo (m) e cada pé abre e fecha isso (m). */
const SHUFFLE_STRIDE = 0.75;
const SHUFFLE_SWING = 0.15;

/** A curva das mãos do mergulho na simulação (cápsula): 1 - (1 - t)². */
const diveEase = (u: number) => 1 - (1 - clamp01(u)) ** 2;
const wrapAngle = (value: number) => value - Math.PI * 2 * Math.round(value / (Math.PI * 2));

/**
 * Um passo da mola criticamente amortecida de `lag` (com velocidade `vel`) indo a zero:
 * x(t) = (x0 + (v0 + w·x0)·t)·e^(-w·t). Quase zero vira zero: o decaimento sem fim cai em
 * números subnormais, e conta com eles é dezenas de vezes mais lenta.
 */
function settleLag(lag: THREE.Vector3, vel: THREE.Vector3, rate: number, dt: number) {
  if (lag.x === 0 && lag.y === 0 && lag.z === 0 && vel.x === 0 && vel.y === 0 && vel.z === 0) return;
  if (lag.lengthSq() < 1e-12 && vel.lengthSq() < 1e-10) {
    lag.set(0, 0, 0);
    vel.set(0, 0, 0);
    return;
  }
  const decay = Math.exp(-rate * dt);
  const jx = (vel.x + rate * lag.x) * dt;
  const jy = (vel.y + rate * lag.y) * dt;
  const jz = (vel.z + rate * lag.z) * dt;
  lag.set((lag.x + jx) * decay, (lag.y + jy) * decay, (lag.z + jz) * decay);
  vel.set((vel.x - rate * jx) * decay, (vel.y - rate * jy) * decay, (vel.z - rate * jz) * decay);
}

function copyFigurePose(to: FigurePose, from: FigurePose) {
  for (let index = 0; index < POSE_KEYS.length; index += 1) to[POSE_KEYS[index]] = from[POSE_KEYS[index]];
}

function mixFigurePose(out: FigurePose, a: FigurePose, b: FigurePose, k: number) {
  for (let index = 0; index < POSE_KEYS.length; index += 1) {
    const key = POSE_KEYS[index];
    out[key] = a[key] + (b[key] - a[key]) * k;
  }
}

/**
 * Base do goleiro (corpo sem giro): agachado, peso na ponta dos pés, luvas à
 * frente e abertas. `set` 0..1: o "set" do chute (mais baixo, mãos mais
 * baixas e à frente). As pernas saem daqui só como ponto de partida: quem está
 * de pé as refaz com os pés plantados (legTo).
 */
function keeperStance(o: FigurePose, t: number, set: number) {
  const breath = Math.sin(t * 2.3);
  o.bodyX = 0;
  // O fôlego fica no tronco: o quadril parado deixa as pernas (pés plantados) iguais de um quadro para o outro.
  o.bodyY = mix(-1.3, -2.2, set);
  o.bodyZ = 0;
  o.bodyRotX = o.bodyRotZ = o.pivX = o.pivZ = o.spinY = o.hipsY = 0;
  o.torsoX = mix(0.34, 0.46, set) + 0.03 * breath;
  o.torsoY = o.torsoZ = 0;
  o.neckX = mix(-0.3, -0.42, set);
  o.neckY = o.neckZ = 0;
  o.shLX = o.shRX = mix(-0.72, -0.55, set) + 0.06 * Math.sin(t * 3.1);
  o.shLY = o.shRY = 0;
  o.shLZ = mix(0.72, 0.5, set);
  o.shRZ = -o.shLZ;
  o.elL = o.elR = mix(-1, -0.85, set);
  o.hipLX = o.hipRX = -0.3;
  o.hipLZ = 0.26;
  o.hipRZ = -0.26;
  o.kneeL = o.kneeR = 0.62;
  o.ankleL = o.ankleR = 0;
}

/** Deitado de lado depois do mergulho (`side` = lado do mergulho no x do boneco): braços esticados no gramado. */
function keeperLying(o: FigurePose, side: number, t: number) {
  o.bodyY = KEEPER_LIE_Y * M2PX - RIG.pivot;
  o.bodyRotX = o.bodyRotZ = o.pivX = o.spinY = o.hipsY = 0;
  o.pivZ = -side * 1.5;
  o.torsoX = 0.08 + 0.04 * Math.sin(t * 2.3);
  o.torsoY = 0;
  o.torsoZ = side * 0.06;
  o.neckX = -0.2;
  o.neckY = 0;
  o.neckZ = side * 0.25;
  o.shLX = o.shRX = -2.85;
  o.shLY = o.shRY = 0;
  o.shLZ = 0.22;
  o.shRZ = -0.22;
  o.elL = o.elR = -0.1;
  o.hipLX = -0.3;
  o.hipRX = 0.3;
  o.hipLZ = 0.06;
  o.hipRZ = -0.06;
  o.kneeL = 0.45;
  o.kneeR = 0.25;
  o.ankleL = o.ankleR = 0;
}

/** De joelhos, tronco em pé: com a bola agarrada no peito, ou o soco no chão do gol sofrido. */
function keeperKneel(o: FigurePose, lean: number) {
  o.bodyX = o.bodyZ = 0;
  o.bodyY = KEEPER_KNEEL_BODY_Y;
  o.bodyRotX = o.bodyRotZ = o.pivX = o.pivZ = o.spinY = o.hipsY = 0;
  o.torsoX = lean;
  o.torsoY = o.torsoZ = 0;
  o.neckX = 0.1;
  o.neckY = o.neckZ = 0;
  o.shLX = o.shRX = -0.6;
  o.shLY = o.shRY = 0;
  o.shLZ = 0.35;
  o.shRZ = -0.35;
  o.elL = o.elR = -1.3;
  o.hipLX = o.hipRX = 0.05;
  o.hipLZ = 0.14;
  o.hipRZ = -0.14;
  o.kneeL = o.kneeR = 1.62;
  o.ankleL = o.ankleR = 0.5;
}

/** Meio do levantar: agachado, um joelho perto do chão, mãos empurrando o gramado. */
function keeperGetUp(o: FigurePose, from: FigurePose) {
  o.bodyX = from.bodyX * 0.5;
  o.bodyY = -5.5;
  o.bodyZ = from.bodyZ * 0.5;
  o.bodyRotX = o.bodyRotZ = o.pivX = o.spinY = o.hipsY = 0;
  o.pivZ = from.pivZ * 0.25;
  o.torsoX = 0.85;
  o.torsoY = 0;
  o.torsoZ = 0;
  o.neckX = -0.35;
  o.neckY = o.neckZ = 0;
  o.shLX = o.shRX = -0.5;
  o.shLY = o.shRY = 0;
  o.shLZ = 0.45;
  o.shRZ = -0.45;
  o.elL = o.elR = -0.3;
  o.hipLX = o.hipRX = -1.25;
  o.hipLZ = 0.2;
  o.hipRZ = -0.2;
  o.kneeL = 1.75;
  o.kneeR = 1.45;
  o.ankleL = o.ankleR = 0;
}

/**
 * Perna até a sola em (x, y, z) px no espaço do modelo, com o corpo sem giro:
 * quadril (flexão e abertura) e joelho de dois ossos. O tornozelo fica acima
 * da sola (o bico da chuteira vai 0,55 à frente) e o boneco já mantém a
 * chuteira plana.
 */
function legTo(o: FigurePose, left: boolean, sx: number, sy: number, sz: number) {
  const thigh = RIG.thigh;
  const shin = RIG.shin;
  const ax0 = sx - (o.bodyX + (left ? RIG.hipX : -RIG.hipX));
  const ay0 = sy + RIG.foot - (o.bodyY + RIG.hips + RIG.hipY);
  const az0 = sz - 0.55 - o.bodyZ;
  const raw = Math.sqrt(ax0 * ax0 + ay0 * ay0 + az0 * az0) || 1;
  const dist = clamp(raw, 1, thigh + shin - 0.01);
  const scale = dist / raw;
  const ax = ax0 * scale;
  const ay = ay0 * scale;
  const az = az0 * scale;
  const cosKnee = clamp((dist * dist - thigh * thigh - shin * shin) / (2 * thigh * shin), -1, 1);
  const knee = Math.acos(cosKnee);
  const py = -thigh - shin * cosKnee;
  const pz = -shin * Math.sin(knee);
  const open = Math.asin(clamp(-ax / py, -1, 1));
  const flex = wrapAngle(Math.atan2(az, ay) - Math.atan2(pz, py * Math.cos(open)));
  if (left) {
    o.hipLX = flex;
    o.hipLZ = open;
    o.kneeL = knee;
  } else {
    o.hipRX = flex;
    o.hipRZ = open;
    o.kneeR = knee;
  }
}

/** Um pé plantado (x, z do mundo) ou dando o passo (de `from` até `to`). */
type Foot = { x: number; z: number; fromX: number; fromZ: number; toX: number; toZ: number; t: number; dur: number; lift: number };
const newFoot = (): Foot => ({ x: 0, z: 0, fromX: 0, fromZ: 0, toX: 0, toZ: 0, t: -1, dur: 0.14, lift: 0 });

type KeeperMode = "stand" | "dive" | "fall" | "down" | "catch" | "rise" | "hold" | "native";
type KeeperAfter = "stand" | "hold" | "native";

/**
 * O goleiro do Scorebobo guiado pela simulação, por cima do PlayerFigure
 * (pose de fora + mãos por cinemática inversa). De pé: base com os pés
 * plantados (passinho lateral sem deslizar), o "set" (pulinho) no chute e as
 * mãos indo na bola nas defesas em pé. No mergulho as mãos seguem as da
 * simulação (cápsula: tempo, lado e altura do `dive`), com o corpo apontando
 * para elas: alto esticado com a mão de cima no ângulo, baixo deitado rente ao
 * chão, meia altura o clássico. Agarrou: as luvas vão para a bola (que a
 * simulação põe no peito dele) e ele cai de joelhos com ela; espalmou ou
 * tomou o gol: cai de lado, fica no chão e levanta (gol sofrido: soca o chão
 * antes). Correndo (saída, cobertura), comemorando ou lamentando: o boneco de
 * sempre. Tudo o que vem da simulação (passo fixo, sem interpolação) passa
 * antes pelo relógio contínuo da cena (`track`): liso na câmera lenta.
 */
class KeeperMotion {
  private readonly pose = figurePose();
  private readonly from = figurePose();
  private readonly mid = figurePose();
  private readonly goal = figurePose();
  private readonly palmL = new THREE.Vector3();
  private readonly palmR = new THREE.Vector3();
  private readonly palmJump = new THREE.Vector3();
  private readonly reach: FigureReach = { left: this.palmL, right: this.palmR, weight: 0 };
  /** Onde as palmas deveriam estar agora e o desvio que some aos poucos (o alvo pulou: sem estalo). */
  private readonly wantL = new THREE.Vector3();
  private readonly wantR = new THREE.Vector3();
  private readonly lagL = new THREE.Vector3();
  private readonly lagR = new THREE.Vector3();
  private readonly lagVelL = new THREE.Vector3();
  private readonly lagVelR = new THREE.Vector3();
  /** Palmas presas ao corpo na queda e no chão: ao longo do eixo quadril -> mãos, de lado e de frente (m), esquerda e direita. */
  private readonly carry = new Float64Array(6);
  // ---------------------------------------------- relógio contínuo (track)
  /** Tempo da simulação (s de jogo) na amostra atual e na anterior (passos vistos). */
  private simT = NaN;
  private lastT = NaN;
  /**
   * Onde a cena desenha em relação à amostra atual (s de jogo; 0 fora do lance ao vivo e no
   * replay): um passo atrás do relógio da simulação, então entre a penúltima amostra e a
   * última (interpola, nunca passa do que a simulação fez: ela pode parar ou virar num passo).
   * accLo..accHi: o que dá para saber do acumulador dela; cada quadro ele ganha o dt e perde
   * um passo por passo dado, e fica sempre em [0, SIM_STEP).
   */
  private lead = 0;
  private accLo = 0;
  private accHi = SIM_STEP;
  /** Amostra atual e a anterior: x, z e facing do goleiro e a velocidade da bola. A reta entre elas estende o movimento. */
  private readonly now = new Float64Array(6);
  private readonly was = new Float64Array(6);
  /** A reta da bola vale (mesmo tempo, sem pancada no meio); a do goleiro, sem salto (corte, teleporte). */
  private ballLinked = false;
  private keeperLinked = false;
  /** Lance ao vivo (a simulação dá passos); fora dele (replay, mira) o estado já vem contínuo. */
  private live = false;
  private nowPose: Actor["pose"] | null = null;
  /** O ator e a bola contínuos: é o que o corpo segue (a raiz desenhada também). */
  private posX = 0;
  private posZ = 0;
  private velX = NaN;
  private velZ = NaN;
  private facing = 0;
  /** Giro do boneco depois deste quadro (o `update` vira para o facing pedido a 5 rad/s). */
  private yaw = 0;
  /** Para onde ele pede para virar (segue o alvo como mola criticamente amortecida: sem tranco ao começar a correr ou parar) e a velocidade disso. */
  private faceY = NaN;
  private faceV = 0;
  private readonly ball = new THREE.Vector3();
  private readonly ballVel = new THREE.Vector3();
  // ---------------------------------------------- mergulho
  /** Mãos da simulação nas duas últimas mudanças (progresso u em que chegaram, x, y): a cena desliza entre elas. */
  private readonly hands = new Float64Array(6).fill(NaN);
  private diveFromX = NaN;
  // ---------------------------------------------- defesa em pé
  /** Peso da defesa em pé (segue o alvo sem pular quando a bola some ou rebate) e o encontro do último quadro válido. */
  private saveW = 0;
  private saveSide = 0;
  private saveLow = 0;
  private saveHigh = 0;
  /** Ponto da trajetória da bola em `pathAt` (e a distância² ao peito). */
  private pathX = 0;
  private pathY = 0;
  private pathZ = 0;
  private readonly chest = new THREE.Vector3();
  private readonly feet: [Foot, Foot] = [newFoot(), newFoot()];
  /** Pernas do último quadro de pé e o que as definiu (raiz, giro, corpo, pés): parado, não refaz a conta. */
  private readonly legKey = new Float64Array(11).fill(NaN);
  private readonly legAngles = new Float64Array(6);
  /** Pernas dos pés plantados (antes de misturar com o passo rápido) e a fase do passo rápido. */
  private readonly plantedLegs = new Float64Array(6);
  private shufflePhase = 0;
  private mode: KeeperMode = "stand";
  private modeT = 0;
  private clock = 0;
  private weight = 1;
  private reachWeight = 0;
  private mood: FaceMood | null = null;
  private feetReady = false;
  private hopT = -1;
  private hopArmed = true;
  private set = 0;
  /** Lado do mergulho no x do boneco (+1 esquerda dele) e no x do mundo. */
  private side = 1;
  private diveDir = 1;
  private beaten = false;
  private after: KeeperAfter = "stand";
  private landed = false;

  constructor(private readonly figure: PlayerFigure) {}

  /** Raiz desenhada (m): o ator contínuo, não o do último passo. */
  get x() {
    return this.posX;
  }

  get z() {
    return this.posZ;
  }

  /** Corte no tempo (replay, tentativa nova): de pé na base, pés no lugar. */
  reset() {
    this.mode = "stand";
    this.modeT = 0;
    this.weight = 1;
    this.reachWeight = 0;
    this.mood = null;
    this.feetReady = false;
    this.hopT = -1;
    this.hopArmed = true;
    this.set = 0;
    this.beaten = false;
    this.saveW = 0;
    this.lagL.set(0, 0, 0);
    this.lagR.set(0, 0, 0);
    this.lagVelL.set(0, 0, 0);
    this.lagVelR.set(0, 0, 0);
    // O relógio contínuo recomeça na próxima amostra (sem reta velha).
    this.simT = NaN;
    this.lastT = NaN;
    this.lead = 0;
    this.nowPose = null;
    this.keeperLinked = false;
    this.ballLinked = false;
    this.velX = this.velZ = NaN;
    this.faceY = NaN;
    this.diveFromX = NaN;
    // A pose de fora volta para a base: se o boneco de sempre assumir logo (fim do
    // replay na comemoração/lamento), ela some a partir dele em pé, não do mergulho velho.
    keeperStance(this.pose, this.clock, 0);
  }

  private enter(mode: KeeperMode) {
    if (mode === this.mode) return;
    copyFigurePose(this.from, this.pose);
    this.mode = mode;
    this.modeT = 0;
    this.landed = false;
    if (mode === "stand" || mode === "hold") this.feetReady = false;
    // A defesa em pé recomeça do zero (sem o encontro velho de outro lance).
    if (mode === "stand") this.saveW = 0;
  }

  /**
   * Relógio contínuo. A simulação anda em passos fixos de 1/120 s sem
   * interpolar: na câmera lenta um quadro anda 0 ou 1 passo (e no tempo
   * normal, pelo arredondamento, às vezes 1 e 3), então posição, poseT, mãos
   * e bola chegam aos degraus. A cena guarda as duas últimas amostras e
   * desenha entre elas, no ponto que o seu relógio (o mesmo tempo de jogo que
   * alimenta o acumulador da simulação) marca menos um passo: anda liso e
   * nunca passa do que ela fez. No replay a gravação já vem interpolada.
   */
  private track(actor: Actor, state: GameState, dt: number) {
    const now = this.now;
    const was = this.was;
    let ahead = 0;
    this.live = state.phase === "flight" || state.phase === "outcome";
    if (this.live) {
      const t = state.time;
      let steps = 0;
      if (t !== this.simT) {
        const gap = t - this.simT;
        const fresh = gap > 0 && gap <= 0.05;
        // Sem salto (corte, teleporte) a reta entre as amostras vale; senão começa do zero.
        const bv = state.ball.vel;
        this.keeperLinked = fresh && this.nowPose !== null && Math.abs(actor.pos.x - now[0]) + Math.abs(actor.pos.z - now[1]) < 0.6;
        this.ballLinked = fresh && Math.abs(bv.x - now[3]) + Math.abs(bv.y - now[4]) + Math.abs(bv.z - now[5]) < 2;
        was.set(now);
        now[0] = actor.pos.x;
        now[1] = actor.pos.z;
        now[2] = actor.facing;
        now[3] = bv.x;
        now[4] = bv.y;
        now[5] = bv.z;
        this.nowPose = actor.pose;
        this.lastT = fresh ? this.simT : NaN;
        this.simT = t;
        if (fresh) steps = Math.round(gap / SIM_STEP);
        else {
          // Lance novo (ou corte): o acumulador pode estar em qualquer ponto do passo.
          this.accLo = 0;
          this.accHi = SIM_STEP;
          this.lead = -SIM_STEP * 0.5;
          steps = -1;
        }
      }
      if (steps >= 0) {
        // O relógio da cena anda o dt e cede os passos dados; a faixa do acumulador também, presa a [0, passo).
        const shift = dt - steps * SIM_STEP;
        this.accLo = Math.max(0, this.accLo + shift);
        this.accHi = Math.min(SIM_STEP, this.accHi + shift);
        if (this.accLo > this.accHi) {
          this.accLo = 0;
          this.accHi = SIM_STEP;
        }
        // Fora da faixa (o tempo normal não diz em que ponto do passo ela está; a câmera lenta diz):
        // volta para dentro aos poucos (até 35% do dt por quadro), sem pulo no movimento.
        const lead = this.lead + shift;
        const fix = clamp(lead, this.accLo - SIM_STEP, this.accHi - SIM_STEP) - lead;
        this.lead = clamp(lead + clamp(fix, -0.35 * dt, 0.35 * dt), this.accLo - 2 * SIM_STEP, this.accHi);
      }
      if (this.lastT === this.lastT) ahead = this.lead / (this.simT - this.lastT);
    } else {
      this.simT = NaN;
      this.lastT = NaN;
      this.lead = 0;
      this.nowPose = null;
      this.keeperLinked = false;
      this.ballLinked = false;
    }
    const ballAhead = this.ballLinked ? ahead : 0;
    if (!this.keeperLinked) ahead = 0;
    // Sem reta (ahead 0) é o próprio ator.
    this.posX = actor.pos.x + (now[0] - was[0]) * ahead;
    this.posZ = actor.pos.z + (now[1] - was[1]) * ahead;
    // Velocidade (inclinação do passinho, passada): a da simulação freia e acelera em degraus a
    // cada passo (vai e volta perto do alvo); o corpo segue uma média curta dela (~0,07 s de jogo).
    if (this.velX === this.velX && (this.keeperLinked || !this.live)) {
      const follow = 1 - Math.exp(-dt * 15);
      this.velX += (actor.vel.x - this.velX) * follow;
      this.velZ += (actor.vel.z - this.velZ) * follow;
      // Chegou: fica igual (parado, as pernas saem do cache em vez de refazer a conta todo quadro).
      if (Math.abs(this.velX - actor.vel.x) + Math.abs(this.velZ - actor.vel.z) < 1e-5) {
        this.velX = actor.vel.x;
        this.velZ = actor.vel.z;
      }
    } else {
      this.velX = actor.vel.x;
      this.velZ = actor.vel.z;
    }
    this.facing = actor.facing + (ahead !== 0 ? angleDelta(was[2], now[2]) * ahead : 0);
    // Bola: no ar, segue a velocidade até o instante desenhado; agarrada, vai com ele.
    const b = state.ball;
    const lead = this.lead;
    if (b.owner === actor.id) this.ball.set(b.pos.x + this.posX - actor.pos.x, b.pos.y, b.pos.z + this.posZ - actor.pos.z);
    else this.ball.set(b.pos.x + b.vel.x * lead, b.pos.y + b.vel.y * lead, b.pos.z + b.vel.z * lead);
    this.ballVel.set(b.vel.x + (now[3] - was[3]) * ballAhead, b.vel.y + (now[4] - was[4]) * ballAhead, b.vel.z + (now[5] - was[5]) * ballAhead);
  }

  /** Progresso contínuo do mergulho (0..1): o da simulação no instante desenhado (no fim, o fim: ela para em 1). */
  private diveU(actor: Actor) {
    if (actor.poseT >= 1) return 1;
    const dur = Math.max(0.2, actor.dive?.dur ?? 0.45);
    return clamp01(actor.poseT + this.lead / dur);
  }

  /** Lida com a pose de agora. Devolve false só no mergulho sem os dados novos (o mergulho genérico de antes). */
  drive(actor: Actor, state: GameState, dt: number, intent: FigureIntent, speedMs: number): boolean {
    const pose = actor.pose;
    const dive = actor.dive;
    const guided = pose === "dive" && dive?.fromX !== undefined && dive.handX !== undefined && dive.handY !== undefined;
    // Primeiro quadro do mergulho: a sim já trocou a pose, mas só escreve `dive` no passo
    // seguinte. Segue no modo de agora até os dados chegarem (sem cair no genérico nem zerar).
    const pending = pose === "dive" && !dive;
    if (pose === "dive" && !guided && !pending) {
      intent.layer = null;
      intent.layerWeight = 0;
      intent.reach = null;
      intent.mood = null;
      this.reset();
      return false;
    }
    this.track(actor, state, dt);
    this.clock += dt;
    this.modeT += dt;
    if (state.phase === "aim" || state.phase === "intro") this.hopArmed = true;
    const owned = state.ball.owner === actor.id;
    const lying = this.mode === "dive" || this.mode === "fall" || this.mode === "down" || this.mode === "catch";
    // Chute valendo (no replay também: o lance gravado é o mesmo).
    const shotLive = (state.phase === "flight" || state.phase === "replay") && !!state.plan?.shot;

    // ------------------------------------------------ qual modo
    if (guided) {
      if (owned) this.enter("catch");
      else if (this.mode === "dive") {
        if (this.diveU(actor) >= 1) this.enter("fall");
      } else if (this.mode !== "fall" && this.mode !== "down" && this.mode !== "catch") {
        this.enter("dive");
        this.weight = 1;
      }
    } else if (pending) {
      // fica no modo de agora
    } else if (pose === "keeperHold" || owned) {
      if (lying) this.rise("hold", false);
      else if (this.mode !== "rise") this.enter("hold");
    } else if (pose === "keeperReady") {
      if (lying) this.rise("stand", false);
      else if (this.mode !== "rise") this.enter(speedMs > KEEPER_RUN && !shotLive ? "native" : "stand");
    } else if (lying) this.rise("native", pose === "dejected");
    else if (this.mode !== "rise") this.enter("native");

    // ------------------------------------------------ giro
    // Caindo, deitado ou de joelhos com a bola ele não gira no chão (a simulação segue olhando a bola).
    // `yaw`: o giro depois do `update` deste quadro (vira a 5 rad/s, o do estado "keeper"): o corpo e
    // os pés plantados são contados já nele, senão rodam em volta da raiz quando ele se vira.
    // Correndo (saída, cobertura) ele vira para onde vai; o pedido segue o alvo como mola (a
    // virada começa e termina macia, sem o tranco de girar a 10 rad/s de uma vez).
    const still = this.mode === "fall" || this.mode === "down" || this.mode === "catch";
    const running = this.mode === "native" && speedMs > 0.6 && pose !== "celebrate" && pose !== "dejected";
    if (still || this.faceY !== this.faceY) {
      this.faceY = still ? this.figure.yaw : this.facing;
      this.faceV = 0;
    } else {
      const target = running ? Math.atan2(this.velX, this.velZ) : this.facing;
      const rate = 14;
      const decay = Math.exp(-rate * dt);
      const off = angleDelta(target, this.faceY);
      const kick = (this.faceV + rate * off) * dt;
      this.faceY = wrapAngle(target + (off + kick) * decay);
      this.faceV = (this.faceV - rate * kick) * decay;
      if (Math.abs(angleDelta(target, this.faceY)) < 1e-5 && Math.abs(this.faceV) < 1e-4) {
        this.faceY = target;
        this.faceV = 0;
      }
    }
    const faceYaw = this.faceY;
    const turn = angleDelta(this.figure.yaw, faceYaw);
    this.yaw = this.figure.yaw + Math.sign(turn) * Math.min(Math.abs(turn), 5 * Math.min(dt, 0.1));
    intent.faceYaw = faceYaw;

    // ------------------------------------------------ pose
    const o = this.pose;
    let reachTarget = 0;
    this.mood = null;
    intent.state = "keeper";
    intent.speed = 0;
    intent.shuffle = 0;
    intent.action = null;
    switch (this.mode) {
      case "stand":
        reachTarget = this.stand(state, dt, shotLive);
        break;
      case "hold":
        reachTarget = this.hold(state, dt);
        break;
      case "dive":
        reachTarget = this.dive(actor);
        break;
      case "fall":
        reachTarget = this.fall();
        break;
      case "down":
        keeperLying(o, this.side, this.clock);
        o.bodyX = this.from.bodyX;
        o.bodyZ = this.from.bodyZ;
        // Quique da pancada e o fôlego.
        o.bodyY += 0.6 * Math.sin(Math.min(this.modeT / 0.13, 1) * Math.PI) * Math.exp(-this.modeT * 4);
        // As palmas (enquanto ainda pesam) ficam onde o mergulho as deixou, presas ao corpo.
        if (this.reachWeight > 0) this.carryPalms(false);
        break;
      case "catch":
        reachTarget = this.catchDown();
        break;
      case "rise":
        reachTarget = this.getUp(dt);
        // Levantou para o boneco de sempre (comemoração, lamento): ele já assume neste quadro.
        if ((this.mode as KeeperMode) === "native") this.native(actor, intent, speedMs);
        break;
      case "native":
        this.native(actor, intent, speedMs);
        break;
    }
    // Saindo do boneco de sempre (parou de correr): por baixo da pose que entra ele segue no que
    // fazia até ela cobrir tudo; trocar o estado dele de uma vez (corrida -> parado) dá um tranco.
    if (this.mode !== "native" && this.weight < 0.999 && this.mode !== "rise") this.native(actor, intent, speedMs);
    // Peso da pose de fora: inteira nos modos dele, some (0,2 s) quando o boneco de sempre assume.
    const wantWeight = this.mode === "native" ? 0 : 1;
    this.weight = wantWeight > this.weight ? Math.min(wantWeight, this.weight + dt / 0.15) : Math.max(wantWeight, this.weight - dt / 0.2);
    // Mãos entrando: no mergulho elas saem da base para a linha das da simulação (longe), mais devagar.
    const reachIn = this.mode === "dive" ? 0.16 : 0.1;
    this.reachWeight = reachTarget > this.reachWeight ? Math.min(reachTarget, this.reachWeight + dt / reachIn) : Math.max(reachTarget, this.reachWeight - dt / 0.15);
    // Alvo das palmas sem estalo: o desvio de um alvo que pulou some como mola (sem tranco).
    settleLag(this.lagL, this.lagVelL, PALM_SPRING, dt);
    settleLag(this.lagR, this.lagVelR, PALM_SPRING, dt);
    this.palmL.copy(this.wantL).add(this.lagL);
    this.palmR.copy(this.wantR).add(this.lagR);
    // As rampas lineares dos pesos saem em S (sem quina no começo e no fim).
    const weight = smooth(this.weight);
    this.reach.weight = smooth(this.reachWeight) * weight;
    intent.layer = o;
    intent.layerWeight = weight;
    intent.reach = this.reach;
    intent.mood = this.mood;
    // No chão (deitado, de joelhos, levantando) a cabeça segue o corpo: o pescoço girando de lado parece quebrado.
    if (this.mode === "fall" || this.mode === "down" || this.mode === "catch" || this.mode === "rise") intent.look = null;
    return true;
  }

  /**
   * Palmas novas. Se o alvo pulou (a bola agarrada vai para o peito, troca de
   * modo), a diferença para onde as mãos estavam vira um desvio que some como
   * mola (~0,15 s); `snap`: o alvo anda rápido mas sem pulos (mergulho), não
   * cria desvio novo (o que já havia continua sumindo).
   */
  private aim(lx: number, ly: number, lz: number, rx: number, ry: number, rz: number, snap = false) {
    const left = this.palmL;
    const right = this.palmR;
    if (this.reachWeight <= 0.01) {
      this.lagL.set(0, 0, 0);
      this.lagR.set(0, 0, 0);
      this.lagVelL.set(0, 0, 0);
      this.lagVelR.set(0, 0, 0);
    } else if (!snap) {
      // Troca de modo ou alvo que pulou (> 25 cm num quadro: a bola foi para o peito): as mãos
      // partem de onde estavam. Um alvo que só anda rápido (a bola chegando) é seguido.
      const fresh = this.modeT === 0;
      if (fresh || this.wantL.distanceToSquared(this.palmJump.set(lx, ly, lz)) > 0.0625) this.lagL.set(left.x - lx, left.y - ly, left.z - lz);
      if (fresh || this.wantR.distanceToSquared(this.palmJump.set(rx, ry, rz)) > 0.0625) this.lagR.set(right.x - rx, right.y - ry, right.z - rz);
    }
    this.wantL.set(lx, ly, lz);
    this.wantR.set(rx, ry, rz);
  }

  /**
   * Palmas presas ao corpo (queda, chão): `store` guarda onde estão agora em
   * relação ao quadril e ao eixo do corpo (o giro pivZ); depois elas vão com
   * ele, coerentes com os braços esticados da pose.
   */
  private carryPalms(store: boolean) {
    const o = this.pose;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    // Quadril no espaço do boneco (m) e o eixo do corpo (quadril -> mãos) no plano dele.
    const hipX = o.bodyX / M2PX;
    const hipY = (o.bodyY + RIG.pivot) / M2PX;
    const hipZ = o.bodyZ / M2PX;
    const axisX = -Math.sin(o.pivZ);
    const axisY = Math.cos(o.pivZ);
    const carry = this.carry;
    for (let index = 0; index < 2; index += 1) {
      const palm = index === 0 ? this.palmL : this.palmR;
      const want = index === 0 ? this.wantL : this.wantR;
      const at = index * 3;
      if (store) {
        const dx = palm.x - this.posX;
        const dz = palm.z - this.posZ;
        const rx = dx * cos - dz * sin - hipX;
        const ry = palm.y - hipY;
        carry[at] = rx * axisX + ry * axisY;
        carry[at + 1] = rx * axisY - ry * axisX;
        carry[at + 2] = dx * sin + dz * cos - hipZ;
      }
      const lx = hipX + carry[at] * axisX + carry[at + 1] * axisY;
      const lz = hipZ + carry[at + 2];
      want.set(this.posX + lx * cos + lz * sin, Math.max(0.06, hipY + carry[at] * axisY - carry[at + 1] * axisX), this.posZ - lx * sin + lz * cos);
    }
    this.lagL.set(0, 0, 0);
    this.lagR.set(0, 0, 0);
    this.lagVelL.set(0, 0, 0);
    this.lagVelR.set(0, 0, 0);
  }

  // ------------------------------------------------------------ de pé

  private stand(state: GameState, dt: number, shotLive: boolean) {
    const o = this.pose;
    const ball = state.ball;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    // Set: o pulinho sai quando quem chuta arma a perna (a bola ainda parada).
    if (this.hopArmed && shotLive && Math.abs(ball.vel.x) + Math.abs(ball.vel.y) + Math.abs(ball.vel.z) < 0.05) {
      for (let index = 0; index < state.actors.length; index += 1) {
        const kicker = state.actors[index];
        if (kicker.id !== state.heroId) continue;
        if ((kicker.pose === "kick" || kicker.pose === "volley" || kicker.pose === "header") && kicker.poseT < 0.5) {
          this.hopT = 0;
          this.hopArmed = false;
        }
      }
    }
    let hopLift = 0;
    let dip = 0;
    if (this.hopT >= 0) {
      this.hopT += dt;
      const t = this.hopT;
      if (t < 0.05) dip = -0.8 * smooth(t / 0.05);
      else if (t < 0.17) {
        const k = (t - 0.05) / 0.12;
        hopLift = 0.07 * Math.sin(Math.PI * k);
        dip = -0.8 * (1 - smooth(k / 0.4));
      } else dip = -1.2 * Math.sin(Math.PI * clamp01((t - 0.17) / (HOP_TIME - 0.17)));
      if (t >= HOP_TIME) this.hopT = -1;
    }
    const setOn = shotLive && !this.hopArmed ? 1 : 0;
    this.set += (setOn - this.set) * (1 - Math.exp(-dt * 8));
    // Chegou: fica no alvo (o resto sem fim cai em subnormais, lentos).
    if (Math.abs(setOn - this.set) < 1e-6) this.set = setOn;
    keeperStance(o, this.clock, this.set);
    o.bodyY += dip + hopLift * M2PX;
    // Passinho lateral: mais baixo quanto mais rápido (a perna alcança mais longe), inclinado para o lado.
    const lateral = this.velX * cos - this.velZ * sin;
    o.bodyX = clamp(lateral * 0.3, -1, 1);
    o.bodyY -= Math.min(2.2, Math.abs(lateral) * 0.65);
    o.torsoZ = clamp(-lateral * 0.035, -0.12, 0.12);
    this.mood = this.set > 0.5 ? "grit" : null;
    const reach = this.standReach(state, cos, sin, dt);
    this.plantFeet(dt, cos, sin, mix(STANCE_WIDTH, SET_WIDTH, this.set), hopLift);
    return reach;
  }

  /** Ponto da trajetória da bola daqui a `t` s (reta + gravidade, rente ao chão no mínimo) em path*; devolve a distância² ao peito. */
  private pathAt(t: number) {
    const p = this.ball;
    const v = this.ballVel;
    this.pathX = p.x + v.x * t;
    this.pathY = Math.max(0.11, p.y + v.y * t - 4.9 * t * t);
    this.pathZ = p.z + v.z * t;
    const c = this.chest;
    return (this.pathX - c.x) ** 2 + (this.pathY - c.y) ** 2 + (this.pathZ - c.z) ** 2;
  }

  /**
   * Bola chegando nele (chute em cima, cruzamento): as luvas vão onde ela vai
   * passar mais perto do peito, e o corpo acompanha (agacha na rasteira, estica
   * e sobe na alta, inclina para o lado). O encontro sai da bola contínua e é
   * refinado entre as amostras de tempo (anda liso, não aos pulos); o peso
   * sobe junto com o alvo e, quando a bola some ou rebate, desce sem pular.
   */
  private standReach(state: GameState, cos: number, sin: number, dt: number) {
    const o = this.pose;
    const ball = state.ball;
    // O ponto de encontro fica à frente do peito (as luvas pegam antes do corpo).
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let want = 0;
    const v = this.ballVel;
    this.chest.set(this.posX + fx * 0.3, 1.15, this.posZ + fz * 0.3);
    // Em 0,45 s a bola anda no máximo |v|·0,45 + a queda (1 m): mais longe que isso + o alcance, nem procura.
    const near = 1.45 + Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 0.45 + 1;
    if (!ball.owner && !ball.inNet && state.phase !== "aim" && state.phase !== "intro" && this.ball.distanceToSquared(this.chest) < near * near) {
      let best = this.pathAt(0);
      let bestStep = 0;
      for (let step = 1; step <= 18; step += 1) {
        const d = this.pathAt(step * 0.025);
        if (d < best) {
          best = d;
          bestStep = step;
        }
      }
      let bestT = bestStep * 0.025;
      // Refina pela parábola dos vizinhos (exata na reta): o encontro não salta de amostra em amostra.
      if (bestStep > 0 && bestStep < 18) {
        const before = this.pathAt(bestT - 0.025);
        const after = this.pathAt(bestT + 0.025);
        const curve = before - 2 * best + after;
        if (curve > 1e-9) bestT += clamp((0.5 * (before - after)) / curve, -1, 1) * 0.025;
      }
      best = this.pathAt(bestT);
      const p = this.ball;
      // Só bola vindo de frente (a mais perto ainda está por vir) e ao alcance; as bordas em rampa.
      const front = (p.x - this.posX) * fx + (p.z - this.posZ) * fz;
      if (bestT > 0) {
        want = smooth((0.45 - bestT) / 0.3) * smooth((1.45 - Math.sqrt(best)) / 0.3) * smooth((front + 0.1) / 0.25);
      }
      if (want > 0) {
        const bx = this.pathX;
        const by = this.pathY;
        const bz = this.pathZ;
        const dx = bx - this.posX;
        const dz = bz - this.posZ;
        this.saveSide = dx * cos - dz * sin;
        this.saveLow = clamp01((0.75 - by) / 0.5);
        // Na altura do rosto ou acima: tronco para trás (as luvas na frente da cara) e sobe.
        this.saveHigh = clamp01((by - 1.25) / 0.8);
        // Luvas uma de cada lado da bola, um pouco atrás dela, nunca dentro do corpo; na rasteira, por baixo.
        const ahead = dx * fx + dz * fz;
        const push = Math.max(0, 0.24 - ahead);
        const half = 0.12;
        const back = 0.05 - push;
        const drop = 0.05 * this.saveLow;
        this.aim(
          bx + cos * half - fx * back, by - drop, bz - sin * half - fz * back,
          bx - cos * half - fx * back, by - drop, bz + sin * half - fz * back,
        );
      }
    }
    // Subindo, o peso é o do alvo (já contínuo); caindo (bola rebateu, passou, sumiu), desce em ~0,1 s.
    this.saveW = want >= this.saveW ? want : want + (this.saveW - want) * Math.exp(-dt * 12);
    if (this.saveW < 1e-4) this.saveW = 0;
    const w = this.saveW;
    if (w <= 0) return 0;
    const side = this.saveSide;
    const low = this.saveLow;
    const high = this.saveHigh;
    o.bodyX += clamp(side * M2PX * 0.35, -2.5, 2.5) * w;
    o.torsoZ += clamp(-side * 0.3, -0.3, 0.3) * w;
    o.bodyY += (-4.5 * low + 3.2 * high) * w;
    o.torsoX += (0.45 * low - 0.4 * high) * w;
    o.neckX += 0.2 * high * w;
    this.mood = "grit";
    return w;
  }

  /** Pés plantados: cada um só sai do lugar quando fica longe do ponto dele, um de cada vez, com um passinho. */
  private plantFeet(dt: number, cos: number, sin: number, width: number, hopLift: number) {
    const o = this.pose;
    const rootX = this.posX;
    const rootZ = this.posZ;
    const half = width / 2;
    const feet = this.feet;
    if (!this.feetReady) {
      for (let index = 0; index < 2; index += 1) {
        const foot = feet[index];
        const s = index === 0 ? 1 : -1;
        foot.x = rootX + cos * half * s;
        foot.z = rootZ - sin * half * s;
        foot.t = -1;
        foot.lift = 0;
      }
      this.feetReady = true;
    }
    const speed = Math.sqrt(this.velX * this.velX + this.velZ * this.velZ);
    // Passo lateral rápido (cobrindo o gol, acima de ~1,4 m/s): um pé só pisa quando o outro já
    // pisou e os plantados não acompanham (as pernas se debatem). Aí entra o passo em ciclo:
    // os pés abrem e fecham guiados pela distância, o que vai no sentido do corpo levantado.
    const lateral = this.velX * cos - this.velZ * sin;
    const fastK = smooth((Math.abs(lateral) - 1.4) / 1.0);
    let stepping = false;
    let worst = -1;
    let worstErr = STEP_TRIGGER;
    for (let index = 0; index < 2; index += 1) {
      const foot = feet[index];
      const s = index === 0 ? 1 : -1;
      const wantX = rootX + cos * half * s;
      const wantZ = rootZ - sin * half * s;
      if (foot.t >= 0) {
        foot.t += dt;
        const k = clamp01(foot.t / foot.dur);
        // O destino acompanha o corpo e cai meio passo à frente do ponto dele: o corpo
        // passa por cima enquanto o outro pé anda (assim nenhum fica para trás).
        foot.toX = wantX + this.velX * foot.dur * 0.5;
        foot.toZ = wantZ + this.velZ * foot.dur * 0.5;
        foot.x = mix(foot.fromX, foot.toX, smooth(k));
        foot.z = mix(foot.fromZ, foot.toZ, smooth(k));
        foot.lift = 0.05 * Math.sin(Math.PI * k);
        if (k >= 1) {
          foot.t = -1;
          foot.lift = 0;
        } else stepping = true;
        continue;
      }
      const err = Math.sqrt((foot.x - wantX) ** 2 + (foot.z - wantZ) ** 2);
      // Longe demais (corte, giro grande): vai direto.
      if (err > 1.2) {
        foot.x = wantX;
        foot.z = wantZ;
      } else if (err > worstErr) {
        worstErr = err;
        worst = index;
      }
    }
    if (!stepping && worst >= 0 && this.hopT < 0 && fastK < 0.999) {
      const foot = feet[worst];
      foot.t = 0;
      foot.dur = clamp(0.17 - speed * 0.025, 0.09, 0.17);
      foot.fromX = foot.x;
      foot.fromZ = foot.z;
    }
    // No pulinho os dois saem do chão e caem já na base mais aberta.
    for (let index = 0; index < 2; index += 1) {
      const foot = feet[index];
      if (this.hopT >= 0 && foot.t < 0) {
        const s = index === 0 ? 1 : -1;
        foot.x += (rootX + cos * half * s - foot.x) * Math.min(1, dt * 14);
        foot.z += (rootZ - sin * half * s - foot.z) * Math.min(1, dt * 14);
      }
    }
    if (fastK > 0) this.shuffleGait(dt, cos, sin, half, lateral, fastK, hopLift);
    // Parado (mira, abertura): tudo igual ao quadro anterior, as pernas também.
    const key = this.legKey;
    const legs = this.legAngles;
    const same = !stepping && hopLift === 0 && fastK === 0 && key[0] === rootX && key[1] === rootZ && key[2] === cos && key[3] === sin && key[4] === o.bodyX
      && key[5] === o.bodyY && key[6] === o.bodyZ && key[7] === feet[0].x && key[8] === feet[0].z && key[9] === feet[1].x && key[10] === feet[1].z;
    if (same) {
      o.hipLX = legs[0];
      o.hipLZ = legs[1];
      o.kneeL = legs[2];
      o.hipRX = legs[3];
      o.hipRZ = legs[4];
      o.kneeR = legs[5];
      return;
    }
    for (let index = 0; index < 2; index += 1) {
      const foot = feet[index];
      const dx = foot.x - rootX;
      const dz = foot.z - rootZ;
      legTo(o, index === 0, (dx * cos - dz * sin) * M2PX, (foot.lift + hopLift) * M2PX, (dx * sin + dz * cos) * M2PX);
    }
    key[0] = rootX;
    key[1] = rootZ;
    key[2] = cos;
    key[3] = sin;
    key[4] = o.bodyX;
    key[5] = o.bodyY;
    key[6] = o.bodyZ;
    key[7] = feet[0].x;
    key[8] = feet[0].z;
    key[9] = feet[1].x;
    key[10] = feet[1].z;
    legs[0] = o.hipLX;
    legs[1] = o.hipLZ;
    legs[2] = o.kneeL;
    legs[3] = o.hipRX;
    legs[4] = o.hipRZ;
    legs[5] = o.kneeR;
    if (fastK > 0) this.blendShuffle(fastK);
  }

  /**
   * Pés do passo rápido (fase pela distância lateral) para as pernas guardadas em plantedLegs
   * depois. Com o ciclo inteiro (os plantados não aparecem) eles ficam onde os do ciclo estão:
   * ao frear, partem dali sem pular.
   */
  private shuffleGait(dt: number, cos: number, sin: number, half: number, lateral: number, fastK: number, hopLift: number) {
    this.shufflePhase = (this.shufflePhase + (Math.PI * 2 * Math.abs(lateral) * dt) / SHUFFLE_STRIDE) % (Math.PI * 2);
    const wave = Math.sin(this.shufflePhase);
    const swing = Math.cos(this.shufflePhase) * Math.sign(lateral);
    const legs = this.plantedLegs;
    const o = this.pose;
    // As pernas dos plantados ainda não existem: guarda o ciclo aqui e mistura no fim (blendShuffle).
    const save0 = o.hipLX;
    const save1 = o.hipLZ;
    const save2 = o.kneeL;
    const save3 = o.hipRX;
    const save4 = o.hipRZ;
    const save5 = o.kneeR;
    for (let index = 0; index < 2; index += 1) {
      const sideSign = index === 0 ? 1 : -1;
      // Esquerdo (+x) abre com a onda e o direito também (para -x): abrem e fecham juntos, levantando
      // o pé que anda no sentido do corpo (sem escorregar no apoio).
      const lx = sideSign * (half + SHUFFLE_SWING * wave);
      const up = Math.max(0, sideSign * swing);
      legTo(o, index === 0, lx * M2PX, (0.06 * up * up + hopLift) * M2PX, 0);
      if (fastK >= 0.999) {
        const foot = this.feet[index];
        foot.x = this.posX + cos * lx;
        foot.z = this.posZ - sin * lx;
        foot.t = -1;
        foot.lift = 0;
      }
    }
    legs[0] = o.hipLX;
    legs[1] = o.hipLZ;
    legs[2] = o.kneeL;
    legs[3] = o.hipRX;
    legs[4] = o.hipRZ;
    legs[5] = o.kneeR;
    o.hipLX = save0;
    o.hipLZ = save1;
    o.kneeL = save2;
    o.hipRX = save3;
    o.hipRZ = save4;
    o.kneeR = save5;
  }

  /** Mistura as pernas dos pés plantados (na pose) com as do passo rápido (em plantedLegs). */
  private blendShuffle(fastK: number) {
    const o = this.pose;
    const legs = this.plantedLegs;
    o.hipLX = mix(o.hipLX, legs[0], fastK);
    o.hipLZ = mix(o.hipLZ, legs[1], fastK);
    o.kneeL = mix(o.kneeL, legs[2], fastK);
    o.hipRX = mix(o.hipRX, legs[3], fastK);
    o.hipRZ = mix(o.hipRZ, legs[4], fastK);
    o.kneeR = mix(o.kneeR, legs[5], fastK);
  }

  // ------------------------------------------------------------ com a bola

  /** Em pé com a bola: luvas dos dois lados dela (a simulação a põe no peito dele), tronco por cima. */
  private hold(state: GameState, dt: number) {
    const o = this.pose;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    keeperStance(o, this.clock, 0);
    // Amortece a bolada e se ajeita.
    o.bodyY += -1.2 * Math.sin(Math.PI * clamp01(this.modeT / 0.35));
    o.torsoX = 0.25 + 0.08 * Math.sin(Math.PI * clamp01(this.modeT / 0.35));
    this.clutch(cos, sin);
    this.plantFeet(dt, cos, sin, STANCE_WIDTH, 0);
    // Agarrou em pé: sai da pose da defesa (corpo e pernas) em vez de pular para a base.
    const k = smooth(this.modeT / 0.2);
    if (k < 1) mixFigurePose(o, this.from, o, k);
    this.mood = this.modeT < 0.4 ? "grit" : null;
    return 1;
  }

  /** Palmas dos dois lados da bola (a contínua, que vai com ele), um pouco atrás do centro. */
  private clutch(cos: number, sin: number) {
    const b = this.ball;
    const fx = sin;
    const fz = cos;
    const back = 0.03;
    this.aim(
      b.x + cos * CLUTCH_HALF - fx * back, b.y + 0.02, b.z - sin * CLUTCH_HALF - fz * back,
      b.x - cos * CLUTCH_HALF - fx * back, b.y + 0.02, b.z + sin * CLUTCH_HALF - fz * back,
    );
  }

  /** Agarrou no ar: as luvas trazem a bola e ele desce de joelhos com ela no peito. */
  private catchDown() {
    const o = this.pose;
    keeperKneel(this.goal, 0.25);
    // Rápido: a simulação já pôs a bola no peito dele (na altura de quem está de joelhos).
    const k = smooth(this.modeT / 0.22);
    mixFigurePose(o, this.from, this.goal, k);
    if (k >= 1 && !this.landed) {
      this.landed = true;
      this.figure.bump(0.4);
    }
    this.clutch(Math.cos(this.yaw), Math.sin(this.yaw));
    this.mood = this.modeT < 0.5 ? "grit" : null;
    return 1;
  }

  // ------------------------------------------------------------ mergulho

  /**
   * Mãos nas da simulação (cápsula: de (fromX, 1,25) até (handX, handY) pela
   * curva dela), quadril vindo da base até onde o corpo esticado aponta para
   * elas, com um arco (no baixo, direto para o chão). O progresso é o
   * contínuo (diveU) e as mãos, que a simulação ajusta no ar a cada passo,
   * deslizam entre as duas últimas mudanças; lado, altura (alto, meia, baixo)
   * e o "de cima" das palmas não viram no meio do mergulho.
   */
  private dive(actor: Actor) {
    const dive = actor.dive!;
    const o = this.pose;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const fromX = dive.fromX!;
    const dur = Math.max(0.2, dive.dur ?? 0.45);
    const u = this.diveU(actor);
    // Mãos da simulação: guarda as duas últimas mudanças (no progresso em que chegaram) e
    // desliza entre elas (ao vivo o progresso já vem um passo atrás). No replay a gravação troca
    // o mergulho no quadro mais perto (no meio do caminho) e o progresso vem interpolado: aí o
    // atraso de um passo fica aqui.
    const hands = this.hands;
    const fresh = this.modeT === 0 || fromX !== this.diveFromX;
    if (fresh) {
      this.diveFromX = fromX;
      hands[0] = hands[1] = hands[2] = NaN;
      hands[3] = actor.poseT;
      hands[4] = dive.handX!;
      hands[5] = dive.handY!;
    } else if (dive.handX !== hands[4] || dive.handY !== hands[5]) {
      hands[0] = hands[3];
      hands[1] = hands[4];
      hands[2] = hands[5];
      hands[3] = actor.poseT;
      hands[4] = dive.handX!;
      hands[5] = dive.handY!;
    }
    let handX = hands[4];
    let handY = hands[5];
    const span = hands[3] - hands[0];
    if (span > 1e-6) {
      const delay = this.live ? 0 : SIM_STEP / dur;
      const k = clamp01((u - delay - hands[0]) / span);
      handX = mix(hands[1], hands[4], k);
      handY = mix(hands[2], hands[5], k);
    }
    const e = diveEase(u);
    const dx = handX - fromX;
    const hx = fromX + dx * e;
    const hy = 1.25 + (handY - 1.25) * e;
    const rootX = this.posX;
    const kz = this.posZ;
    // Lado do mergulho no mundo (x) e no boneco: decidido na saída (no meio dele não vira).
    if (fresh) {
      if (Math.abs(dx) > 0.05) this.diveDir = Math.sign(dx);
      this.side = this.diveDir * (Math.sign(cos) || 1);
    }
    const worldSide = this.diveDir;
    const side = this.side;
    // Alto (acima de ~1,85 m) e baixo (abaixo de ~0,55 m) em rampa: o ajuste no ar não troca a pose de uma vez.
    const highK = smooth((handY - 1.75) / 0.2);
    const lowK = smooth((0.65 - handY) / 0.2);
    // Onde o quadril termina: o corpo esticado, do quadril da simulação para as mãos.
    const simHipX = fromX + dx * 0.5;
    const simHipY = Math.max(0.32, handY * 0.62);
    let ax = handX - simHipX;
    let ay = handY - simHipY;
    const len = Math.sqrt(ax * ax + ay * ay);
    if (len < 1e-3) {
      ax = 0;
      ay = 1;
    } else {
      ax /= len;
      ay /= len;
    }
    const bodyLen = clamp(len, 0.95, KEEPER_REACH);
    let endX = handX - ax * bodyLen;
    let endY = handY - ay * bodyLen;
    if (endY < KEEPER_LIE_Y) {
      endY = KEEPER_LIE_Y;
      const rise = clamp((handY - KEEPER_LIE_Y) / bodyLen, -0.5, 1);
      endX = handX - worldSide * bodyLen * Math.sqrt(1 - rise * rise);
    }
    const arc = 0.1 * Math.sin(Math.PI * e) * (1 - lowK);
    const load = 0.06 * Math.sin(Math.PI * clamp01(u / 0.16));
    const px = fromX + (endX - fromX) * e;
    const py = KEEPER_STAND_Y + (endY - KEEPER_STAND_Y) * e + arc - load;
    // Para o espaço do boneco (raiz = ator, no plano dele).
    const plx = (px - rootX) * cos;
    const plz = (px - rootX) * sin;
    const hlx = (hx - rootX) * cos + 0.05 * sin;
    const axisX = hlx - plx;
    const axisY = hy - py;
    const tilt = Math.atan2(axisX, axisY);
    // Corpo inteiro: pivô no quadril, girado para as mãos.
    o.bodyX = plx * M2PX;
    o.bodyY = py * M2PX - RIG.pivot;
    o.bodyZ = plz * M2PX;
    o.bodyRotX = o.bodyRotZ = o.pivX = o.spinY = o.hipsY = 0;
    o.pivZ = -tilt;
    o.torsoX = 0.12;
    o.torsoY = 0;
    o.torsoZ = -side * 0.1 * e;
    o.neckX = -0.15;
    o.neckY = 0;
    o.neckZ = side * 0.12 * e;
    // Pernas: empurra com as duas e no ar a de cima dobra (a de baixo segue o corpo).
    const air = smooth(e / 0.35);
    const topBend = mix(1.05, 0.5, lowK);
    const topHip = mix(-0.25, mix(-0.7, -0.35, lowK), air);
    const topKnee = mix(0.45, topBend, air);
    const bottomHip = mix(-0.2, 0.05, air);
    const bottomKnee = mix(0.4, 0.25, air);
    if (side > 0) {
      o.hipLX = bottomHip;
      o.kneeL = bottomKnee;
      o.hipRX = topHip;
      o.kneeR = topKnee;
      o.hipLZ = 0.12;
      o.hipRZ = -0.04;
    } else {
      o.hipRX = bottomHip;
      o.kneeR = bottomKnee;
      o.hipLX = topHip;
      o.kneeL = topKnee;
      o.hipRZ = -0.12;
      o.hipLZ = 0.04;
    }
    o.ankleL = o.ankleR = 0;
    // Braços da pose: os da base na saída (a cinemática inversa assume em rampa saindo deles, mão e
    // cotovelo; se a pose já subisse os braços, a mão faria a volta por trás) e, com ela inteira, vão
    // esticando por cima da cabeça como os dela: a queda e o levantar partem de braços coerentes.
    const stretch = smooth((u - 0.35) / 0.35);
    o.shLX = o.shRX = mix(-0.55, -2.9, stretch);
    o.shLY = o.shRY = 0;
    o.shLZ = mix(0.5, 0.2, stretch);
    o.shRZ = -o.shLZ;
    o.elL = o.elR = mix(-0.85, 0, stretch);
    // Palmas: na frente das mãos da simulação. Alto: a de cima no ângulo, a de baixo
    // atrás; meia altura: as duas juntas; baixo: a de baixo rente ao chão.
    const bwx = hx - px;
    const bwy = hy - py;
    const bl = Math.sqrt(bwx * bwx + bwy * bwy) || 1;
    const dX = bwx / bl;
    const dY = bwy / bl;
    // Normal do lado de cima do corpo (pelo lado do mergulho: não vira com o corpo na vertical).
    const nX = -dY * worldSide;
    const nY = dX * worldSide;
    const fx = sin;
    const fz = cos;
    const hz = kz - 0.05;
    const baseX = hx + fx * 0.08;
    const baseY = hy;
    const baseZ = hz + fz * 0.08;
    // Meia altura: as duas juntas; alto: a de cima no ângulo, a de baixo atrás; baixo: a de baixo rente ao chão.
    let topX = baseX + nX * 0.07;
    let topY = baseY + nY * 0.07;
    let botX = baseX - nX * 0.07;
    let botY = baseY - nY * 0.07;
    if (highK > 0) {
      topX = mix(topX, baseX + dX * 0.03, highK);
      topY = mix(topY, baseY + dY * 0.03, highK);
      botX = mix(botX, baseX - dX * 0.24 - nX * 0.14, highK);
      botY = mix(botY, baseY - dY * 0.24 - nY * 0.14, highK);
    }
    if (lowK > 0) {
      topX = mix(topX, baseX + nX * 0.1 - dX * 0.06, lowK);
      topY = mix(topY, baseY + nY * 0.1 - dY * 0.06, lowK);
      botX = mix(botX, baseX, lowK);
      botY = mix(botY, baseY, lowK);
    }
    botY = Math.max(0.1, botY);
    topY = Math.max(0.12, topY);
    // A mão de cima é a do lado de lá: mergulhando para a esquerda dele (+x), a direita.
    // No 1º quadro as palmas partem de onde estavam (mola); depois seguem na hora.
    const snap = this.modeT > 0;
    if (side > 0) this.aim(botX, botY, baseZ, topX, topY, baseZ, snap);
    else this.aim(topX, topY, baseZ, botX, botY, baseZ, snap);
    // Entra no mergulho a partir de onde estava (alguns quadros).
    const k = smooth(this.modeT / 0.08);
    if (k < 1) mixFigurePose(o, this.from, o, k);
    this.mood = "grit";
    return 1;
  }

  /** Depois do mergulho (sem agarrar): cai de lado no gramado e bate no chão (as palmas vão presas ao corpo). */
  private fall() {
    const o = this.pose;
    const from = this.from;
    keeperLying(this.goal, this.side, this.clock);
    const lieY = this.goal.bodyY;
    const height = Math.max(0, from.bodyY - lieY);
    const tFall = Math.sqrt((2 * height) / GRAVITY_PX);
    const t = this.modeT;
    const k = tFall > 0.02 ? clamp01(t / tFall) : 1;
    mixFigurePose(o, from, this.goal, smooth(k));
    o.bodyY = Math.max(lieY, from.bodyY - 0.5 * GRAVITY_PX * t * t);
    o.bodyX = from.bodyX + this.side * 0.2 * M2PX * smooth(k);
    o.bodyZ = from.bodyZ;
    this.mood = "grit";
    // As palmas vão presas ao corpo enquanto o peso delas some: os braços esticados da pose
    // (os mesmos do fim do mergulho) assumem sem pulo e a IK descansa no chão.
    if (this.modeT === 0 || this.reachWeight > 0) this.carryPalms(this.modeT === 0);
    if (k >= 1) {
      this.figure.bump(clamp(0.3 + height / 14, 0.3, 1));
      copyFigurePose(this.from, o);
      this.mode = "down";
      this.modeT = 0;
    }
    return 0;
  }

  // ------------------------------------------------------------ levantar

  private rise(after: KeeperAfter, beaten: boolean) {
    if (this.mode === "rise") return;
    this.enter("rise");
    this.after = after;
    this.beaten = beaten;
  }

  /** Do chão (ou de joelhos) até a base; gol sofrido: soca o chão de joelhos antes. */
  private getUp(dt: number) {
    const o = this.pose;
    const t = this.modeT;
    const holding = this.after === "hold";
    let reach = 0;
    let done = false;
    if (holding) {
      // De joelhos com a bola até em pé com ela.
      keeperStance(this.goal, this.clock, 0);
      this.goal.torsoX = 0.25;
      const k = smooth(t / 0.55);
      mixFigurePose(o, this.from, this.goal, k);
      this.clutch(Math.cos(this.yaw), Math.sin(this.yaw));
      reach = 1;
      done = t >= 0.55;
    } else if (this.beaten) {
      // De joelhos, soca o gramado duas vezes e levanta de cabeça baixa.
      keeperKneel(this.mid, 0.55);
      if (t < 0.35) mixFigurePose(o, this.from, this.mid, smooth(t / 0.35));
      else if (t < 1.05) {
        copyFigurePose(o, this.mid);
        const beat = ((t - 0.35) / 0.35) % 1;
        const before = ((t - dt - 0.35) / 0.35) % 1;
        const swing = beat < 0.55 ? smooth(beat / 0.55) : 1 - smooth((beat - 0.55) / 0.45);
        // Os socos entram e saem em rampa: o braço sai da pose de joelhos e volta para ela (sem pulo).
        const env = smooth((t - 0.35) / 0.12) * (1 - smooth((t - 0.93) / 0.12));
        const mid = this.mid;
        o.torsoX = 0.55 + 0.45 * swing * env;
        o.neckX = mix(mid.neckX, 0.35, env);
        // O braço de cima sobe e desce no chão à frente do joelho.
        const up = 1 - swing;
        if (this.side > 0) {
          o.shRX = mix(mid.shRX, mix(-0.35, -2.3, up), env);
          o.shRZ = mix(mid.shRZ, -0.25, env);
          o.elR = mix(mid.elR, mix(-0.15, -1.2, up), env);
        } else {
          o.shLX = mix(mid.shLX, mix(-0.35, -2.3, up), env);
          o.shLZ = mix(mid.shLZ, 0.25, env);
          o.elL = mix(mid.elL, mix(-0.15, -1.2, up), env);
        }
        if (before < 0.55 && beat >= 0.55 && t - dt >= 0.35) this.figure.bump(0.3);
        this.mood = "sad";
      } else {
        keeperStance(this.goal, this.clock, 0);
        this.goal.torsoX = 0.5;
        this.goal.neckX = 0.3;
        mixFigurePose(o, this.mid, this.goal, smooth((t - 1.05) / 0.5));
        this.mood = "sad";
      }
      done = t >= 1.55;
    } else {
      // Rola para a frente, apoia as mãos e um joelho e sobe.
      keeperGetUp(this.mid, this.from);
      keeperStance(this.goal, this.clock, 0);
      const split = GET_UP * 0.45;
      if (t < split) mixFigurePose(o, this.from, this.mid, smooth(t / split));
      else mixFigurePose(o, this.mid, this.goal, smooth((t - split) / (GET_UP - split)));
      done = t >= GET_UP;
    }
    // Sem a bola: as palmas vão presas ao corpo enquanto o peso delas some (os braços da pose assumem sem pulo).
    if (!holding && this.reachWeight > 0) this.carryPalms(t === 0);
    if (done) this.enter(this.after);
    return reach;
  }

  // ------------------------------------------------------------ boneco de sempre

  private native(actor: Actor, intent: FigureIntent, speedMs: number) {
    const moving = speedMs > 0.6;
    intent.speed = moving ? speedMs / FIGURE_SCALE : 0;
    switch (actor.pose) {
      case "celebrate": {
        const own = actor.celebration ? celebrationAction(actor.celebration, 0) : "fistPump";
        intent.state = moving ? "run" : "celebrate";
        intent.action = own;
        intent.look = null;
        break;
      }
      case "dejected":
        // A lamentação que a simulação escolheu para ele (chuta o chão, mãos na cintura, senta).
        intent.state = moving ? "run" : "sad";
        intent.action = moving ? "handsOnHead" : actor.celebration && isAction(actor.celebration) ? actor.celebration : "handsOnHead";
        break;
      default:
        // Saída do gol, cobertura: corre de frente para onde vai (o pedido de giro vem do drive).
        intent.state = moving ? "run" : "keeper";
    }
  }
}

type Entry = {
  actor: Actor;
  figure: PlayerFigure;
  intent: FigureIntent;
  lastPose: Actor["pose"] | null;
  lastX: number;
  lastZ: number;
  kickAge: number;
  /** Inclinação do cabeceio (rad, em volta do eixo lateral do boneco). */
  pitch: number;
  seed: number;
  receiving: boolean;
  /** Onde o boneco está desenhado (o herói na mira anda até o ponto dele em vez de pular). */
  drawX: number;
  drawZ: number;
  /** Modo desempenho: tempo de jogo dos quadros em que ele não animou (entra no próximo). */
  pendingDt: number;
  /** Goleiro: o corpo guiado pela simulação (null nos outros). */
  keeper: KeeperMotion | null;
};

export class Squad {
  readonly group = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private heroId = "";
  private receiverId: string | null = null;
  private readonly look = { x: 0, z: 0 };
  private released = false;
  private skeleton: THREE.Skeleton | null;
  private blobs: SquadBlobs | null;
  private frame = 0;

  constructor(
    state: GameState,
    teams: ScoreTeams,
    private readonly performance: boolean,
    seed: number,
  ) {
    // Cada fase tem renderer próprio: ao sair, a sombra de contato e o material
    // de sombra compartilhados soltam esse renderer (senão ele fica preso na memória).
    retainSharedFigureResources();
    const homePattern = teamKitPattern(seed, teams.home.name);
    const awayPattern = teamKitPattern(seed, teams.away.name);
    const keeperColor = contrastKeeper(teams, seed);
    const figures: PlayerFigure[] = [];
    for (const actor of state.actors) {
      const team = actor.team === "home" ? teams.home : teams.away;
      const keeper = actor.role === "keeper";
      const figureSeed = (hashString(actor.id) ^ seed) % 99991 || 7;
      const figure = new PlayerFigure({
        appearance: { ...actor.appearance, kitPattern: actor.team === "home" ? homePattern : awayPattern },
        primary: team.primary,
        secondary: team.secondary,
        number: actor.number,
        keeper,
        keeperColor,
        captain: actor.role === "hero",
        seed: figureSeed,
        performance,
      });
      figure.root.scale.setScalar(FIGURE_SCALE);
      // Cabeceio inclina em volta do eixo lateral do próprio boneco (depois do yaw).
      figure.root.rotation.order = "YXZ";
      figure.root.position.set(actor.pos.x, 0, actor.pos.z);
      figure.snapYaw(actor.facing);
      this.group.add(figure.root);
      figures.push(figure);
      this.entries.set(actor.id, {
        actor,
        figure,
        intent: idleIntent(),
        lastPose: null,
        lastX: actor.pos.x,
        lastZ: actor.pos.z,
        kickAge: 9,
        pitch: 0,
        seed: figureSeed,
        receiving: false,
        drawX: actor.pos.x,
        drawZ: actor.pos.z,
        pendingDt: 0,
        keeper: keeper ? new KeeperMotion(figure) : null,
      });
    }
    this.skeleton = shareSkeleton(figures);
    // Os dois draws das sombras já na cena antes do prepare() compilar: o programa deles sai pronto.
    this.blobs = figures.length >= MIN_BLOB_DRAW && figures.length <= MAX_BLOB_DRAW ? new SquadBlobs(figures.map((figure) => figure.contactShadowMesh), this.group) : null;
    if (this.blobs) this.group.add(this.blobs.back.mesh, this.blobs.front.mesh);
  }

  textures(): THREE.Texture[] {
    return [...this.entries.values()].flatMap((entry) => entry.figure.textureList());
  }

  figureOf(id: string) {
    return this.entries.get(id)?.figure ?? null;
  }

  private readonly handL = new THREE.Vector3();
  private readonly handR = new THREE.Vector3();

  /**
   * Centro visual do boneco (entre as mãos e o pé, na altura do peito): no
   * mergulho o corpo sai de cima do ponto do ator, e o close tem de achá-lo.
   */
  centerOf(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    const figure = this.entries.get(id)?.figure;
    if (!figure) return null;
    figure.handAnchor("left").getWorldPosition(this.handL);
    figure.handAnchor("right").getWorldPosition(this.handR);
    const root = figure.root.position;
    out.addVectors(this.handL, this.handR).multiplyScalar(0.5);
    out.x = out.x * 0.6 + root.x * 0.4;
    out.z = out.z * 0.6 + root.z * 0.4;
    out.y = Math.max(0.45, Math.min(1.5, out.y + 0.3));
    return out;
  }

  /**
   * Corte no tempo (replay voltando, tentativa nova): o boneco não pode
   * continuar deitado do mergulho nem no meio de um chute de antes. Avança a
   * animação 1,6 s parado na pose de espera (mergulho termina e levanta).
   */
  settle(state: GameState) {
    for (const actor of state.actors) {
      const entry = this.entries.get(actor.id);
      if (!entry) continue;
      entry.lastPose = null;
      entry.kickAge = 9;
      entry.pitch = 0;
      entry.lastX = actor.pos.x;
      entry.lastZ = actor.pos.z;
      entry.drawX = actor.pos.x;
      entry.drawZ = actor.pos.z;
      entry.pendingDt = 0;
      entry.keeper?.reset();
      const figure = entry.figure;
      figure.root.rotation.x = 0;
      figure.root.position.set(actor.pos.x, 0, actor.pos.z);
      figure.snapYaw(actor.facing);
      const intent = idleIntent({ state: actor.role === "keeper" ? "keeper" : "ready", faceYaw: actor.facing });
      // Goleiro guiado: assenta já na pose dele (base, pés), senão o quadro seguinte pula do boneco de sempre para ela.
      entry.keeper?.drive(actor, state, 0, intent, Math.hypot(actor.vel.x, actor.vel.z));
      for (let step = 0; step < 16; step += 1) figure.update(0.1, intent);
    }
  }

  /** Recebedor do passe em mira (contorno azul) ou null. */
  setReceiver(id: string | null) {
    this.receiverId = id;
  }

  /** O chute saiu agora (evento): garante o movimento da perna mesmo se a pose pulou. */
  kicked(actorId: string, power: number) {
    const entry = this.entries.get(actorId);
    if (!entry || entry.kickAge < 0.35) return;
    entry.figure.triggerKick(clamp(power, 0.45, 1), "strike");
    entry.kickAge = 0;
  }

  received(actorId: string) {
    const entry = this.entries.get(actorId);
    if (!entry || entry.kickAge < 0.25) return;
    entry.figure.triggerKick(0.6, "block");
    entry.kickAge = 0;
  }

  /**
   * `animDt`: tempo de jogo para os bonecos (câmera lenta incluída). `heroDt`:
   * o herói na mira anda no tempo real (a perna armando acompanha o traço).
   */
  update(state: GameState, animDt: number, heroDt: number, aimRatio: number) {
    this.heroId = state.heroId;
    const ball = state.ball.pos;
    // Modo desempenho, com a bola rolando: quem está longe do lance anima em
    // quadro sim, quadro não (metade de cada vez, pela paridade); o lugar dele
    // anda todo quadro e o tempo pulado entra no quadro seguinte.
    this.frame += 1;
    const thin = this.performance && heroDt < THIN_MAX_DT && THIN_PHASES.has(state.phase);
    const receiver = state.plan?.receiver ?? null;
    for (let index = 0; index < state.actors.length; index += 1) {
      const actor = state.actors[index];
      const entry = this.entries.get(actor.id);
      if (!entry) continue;
      entry.actor = actor;
      const hero = actor.id === state.heroId;
      let dt = hero && state.phase === "aim" ? heroDt : animDt;
      if (thin && ((this.frame + index) & 1) === 1 && !hero && actor.role !== "keeper" && actor.id !== state.ball.owner && actor.id !== receiver) {
        const dx = actor.pos.x - ball.x;
        const dz = actor.pos.z - ball.z;
        if (dx * dx + dz * dz > THIN_NEAR_BALL * THIN_NEAR_BALL) {
          entry.pendingDt += dt;
          entry.drawX = actor.pos.x;
          entry.drawZ = actor.pos.z;
          entry.figure.root.position.x = actor.pos.x;
          entry.figure.root.position.z = actor.pos.z;
          continue;
        }
      }
      if (entry.pendingDt > 0) {
        dt = Math.min(THIN_MAX_STEP, dt + entry.pendingDt);
        entry.pendingDt = 0;
      }
      this.drive(entry, actor, state, dt, hero ? aimRatio : 0, ball);
    }
  }

  private drive(entry: Entry, actor: Actor, state: GameState, dt: number, aimRatio: number, ball: { x: number; y: number; z: number }) {
    const figure = entry.figure;
    const root = figure.root;
    entry.kickAge += dt;
    // Salto grande num quadro (replay, nova tentativa): sem embalo velho.
    const jumped = Math.hypot(actor.pos.x - entry.lastX, actor.pos.z - entry.lastZ) > 2.5;
    if (jumped) {
      figure.snapYaw(actor.facing);
      entry.lastPose = null;
      entry.keeper?.reset();
    }
    entry.lastX = actor.pos.x;
    entry.lastZ = actor.pos.z;

    const speedMs = Math.hypot(actor.vel.x, actor.vel.z);
    const heading = speedMs > 0.05 ? Math.atan2(actor.vel.x, actor.vel.z) : actor.facing;
    const lookAt = actor.look ?? ball;
    // Olhar em unidades do boneco: a distância conta para a inclinação da cabeça.
    this.look.x = actor.pos.x + (lookAt.x - actor.pos.x) * UNITS;
    this.look.z = actor.pos.z + (lookAt.z - actor.pos.z) * UNITS;
    const intent = entry.intent;
    intent.speed = speedMs * UNITS;
    intent.heading = heading;
    intent.faceYaw = actor.facing;
    intent.look = this.look;
    intent.aimRatio = 0;
    intent.dive = 0;
    intent.shuffle = 0;
    intent.action = null;

    const pose = actor.pose;
    const entered = pose !== entry.lastPose;
    entry.lastPose = pose;
    let lift = actor.jump ?? 0;
    let pitchTarget = 0;
    const moving = speedMs > 0.6;

    // Goleiro: o corpo guiado pela simulação (mergulho, mãos, pés); a altura vem da pose.
    const steered = entry.keeper?.drive(actor, state, dt, intent, speedMs) ? entry.keeper : null;
    if (steered) lift = 0;
    else switch (pose) {
      case "idle":
        intent.state = moving ? "run" : "idle";
        break;
      case "ready":
        intent.state = moving ? "run" : "ready";
        break;
      case "run":
        intent.state = "run";
        break;
      case "aim":
        intent.state = "aim";
        intent.aimRatio = aimRatio;
        intent.look = null;
        break;
      case "kick":
      case "volley":
        intent.state = moving ? "run" : "ready";
        if (entered && entry.kickAge > 0.3) {
          figure.triggerKick(pose === "volley" ? 1 : 0.85, "strike");
          entry.kickAge = 0;
        }
        if (pose === "volley") {
          // De primeira no ar: o corpo deita para trás no golpe.
          lift = Math.max(lift, 0.25 * Math.sin(Math.PI * clamp01(actor.poseT)));
          pitchTarget = -0.28 * Math.sin(Math.PI * clamp01(actor.poseT));
        }
        break;
      case "header": {
        intent.state = "ready";
        const t = clamp01(actor.poseT);
        // Arma o pescoço para trás subindo e chicoteia para a frente no contato (~meio).
        pitchTarget = t < 0.5 ? -0.3 * Math.sin((t / 0.5) * Math.PI * 0.5) : 0.42 * Math.sin(((t - 0.5) / 0.5) * Math.PI);
        if (lift === 0) lift = 0.55 * Math.sin(Math.PI * t);
        break;
      }
      case "receive":
        intent.state = moving ? "run" : "ready";
        if (entered && entry.kickAge > 0.25) {
          figure.triggerKick(0.6, "block");
          entry.kickAge = 0;
        }
        break;
      case "wall":
        intent.state = "ready";
        intent.action = "nervous";
        break;
      case "jump":
        intent.state = "ready";
        intent.action = "nervous";
        if (lift === 0) lift = 0.45 * Math.sin(Math.PI * clamp01(actor.poseT));
        break;
      case "keeperReady":
        intent.state = "keeper";
        // Passinho lateral: velocidade no eixo lateral do goleiro (unidades/s).
        intent.shuffle = (actor.vel.x * Math.cos(actor.facing) - actor.vel.z * Math.sin(actor.facing)) * UNITS;
        break;
      case "dive": {
        intent.state = "keeper";
        const side = actor.dive?.side ?? 0;
        const height = actor.dive?.height ?? 0;
        // A simulação dá side = -dx/2,6 (dx = para onde vão as mãos, em x do
        // mundo); o dive +1 do boneco vai para o +x local dele, que no mundo é
        // cos(facing). Converte pelo mundo: vale para qualquer lado que ele olhe.
        const worldX = -Math.sign(side);
        const localSign = Math.sign(Math.cos(actor.facing)) || -1;
        intent.dive = side === 0 ? 0 : worldX * localSign * clamp(0.55 + Math.abs(side) * 0.45, 0.4, 1);
        lift = Math.max(lift, height * 1.1 * Math.sin(Math.PI * clamp01(actor.poseT * 1.15)));
        break;
      }
      case "keeperHold":
        intent.state = "ready";
        intent.action = "cradle";
        break;
      case "celebrate": {
        const own = actor.celebration ? celebrationAction(actor.celebration, entry.seed) : TEAM_CHEERS[entry.seed % TEAM_CHEERS.length];
        // Correndo para a festa: a ação de corpo inteiro espera ele parar.
        const full = FIGURE_ACTION_INFO[own]?.body === "full";
        if (moving && full) {
          intent.state = "run";
          intent.action = "airplane";
        } else {
          intent.state = moving ? "run" : "celebrate";
          intent.action = own;
        }
        intent.look = null;
        break;
      }
      case "dejected":
        intent.state = moving ? "run" : "sad";
        intent.action = moving ? "handsOnHead" : SADNESS[entry.seed % SADNESS.length];
        break;
      default:
        intent.state = "idle";
    }

    entry.pitch += (pitchTarget - entry.pitch) * (1 - Math.exp(-dt * 18));
    root.rotation.x = entry.pitch;
    // Na mira o herói gira em volta da bola seguindo o traço (e se ajeita ao
    // dominar): dá o passinho até lá em vez de teleportar.
    if (pose === "aim" && state.phase === "aim" && !jumped) {
      const k = 1 - Math.exp(-dt * 12);
      entry.drawX += (actor.pos.x - entry.drawX) * k;
      entry.drawZ += (actor.pos.z - entry.drawZ) * k;
    } else if (steered) {
      // Goleiro guiado: a raiz é a contínua (a mesma que o corpo dele usou), não a do último passo.
      entry.drawX = steered.x;
      entry.drawZ = steered.z;
    } else {
      entry.drawX = actor.pos.x;
      entry.drawZ = actor.pos.z;
    }
    root.position.set(entry.drawX, Math.max(0, lift), entry.drawZ);

    // Contorno: herói dourado na mira; recebedor do passe em azul.
    if (actor.id === this.heroId && (state.phase === "aim" || state.phase === "intro")) figure.setHighlight(0.42, HERO_RIM);
    else if (actor.id === this.receiverId && state.phase === "aim") figure.setHighlight(0.5, RECEIVER_RIM);
    // Companheiros com um contorno leve na mira: no meio dos zagueiros, quem é seu se lê de longe.
    else if (actor.role === "mate" && state.phase === "aim") figure.setHighlight(0.2, MATE_RIM);
    else figure.setHighlight(0);

    figure.update(Math.min(dt, 0.1), intent);
  }

  dispose() {
    for (const entry of this.entries.values()) entry.figure.dispose();
    this.entries.clear();
    this.skeleton?.dispose();
    this.skeleton = null;
    this.blobs?.dispose();
    this.blobs = null;
    if (this.released) return;
    this.released = true;
    releaseSharedFigureResources();
  }
}

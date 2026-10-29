// Os bonecos da partida (PlayerFigure do Modo 3D) em metros: um por ator,
// com o uniforme do time, o goleiro de cor própria, o herói com contorno
// dourado. Cada quadro traduz pose/velocidade/olhar do ator da simulação em
// intenção e ações do boneco (corrida, mira, chute, cabeceio, mergulho,
// comemoração, lamento).

import * as THREE from "three";
import {
  FIGURE_ACTION_INFO,
  FIGURE_HEIGHT,
  PlayerFigure,
  idleIntent,
  releaseSharedFigureResources,
  retainSharedFigureResources,
  type FigureAction,
  type FigureIntent,
} from "../../botao/three/character";
import { teamKitPattern } from "../../player-appearance";
import type { Actor, GameState, ScoreTeams } from "../types";
import { clamp, clamp01, hashString } from "./util";

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
      const figure = entry.figure;
      figure.root.rotation.x = 0;
      figure.root.position.set(actor.pos.x, 0, actor.pos.z);
      figure.snapYaw(actor.facing);
      const intent = idleIntent({ state: actor.role === "keeper" ? "keeper" : "ready", faceYaw: actor.facing });
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

    switch (pose) {
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

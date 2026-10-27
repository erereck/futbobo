// Visão 3D da partida. Só LÊ o `BotaoMatchState`: posição, velocidade, fase e
// vez saem do mesmo motor da mesa 2D, então a jogabilidade é idêntica. Tudo
// o que existe aqui (corrida, chute, comemoração, rede estufando, torcida) é
// leitura do estado, nunca escrita.

import * as THREE from "three";
import {
  FIELD,
  distanceForSpeed,
  penaltyKeeper,
  penaltyShooter,
  shotSpeedFor,
  type BotaoBody,
  type BotaoEvent,
  type BotaoMatchState,
} from "../engine";
import { teamKitPattern, randomPlayerAppearance, type PlayerAppearance } from "../../player-appearance";
import { bodyAppearance, type BotaoRenderView } from "../render";
import type { BotaoMatchSetup, BotaoSide } from "../types";
import { BallView } from "./ball";
import { FIGURE_HEIGHT, PlayerFigure, angleDelta, idleIntent, type FigureIntent } from "./character";
import { GOAL_HEIGHT, HALF_H, HALF_W, Stadium } from "./stadium";
import { kitDistance } from "../kits";
import { labelTexture } from "./textures";

const DEFAULT_PITCH = 0.5;
const MIN_PITCH = 0.08;
const MAX_PITCH = 1.05;
const PICK_HEIGHT = 12;
const KEEPER_COLORS = ["#c6ff3d", "#ff8c1a", "#8a5cff", "#20e0c0", "#ff4fa3", "#22272e"];

export type Botao3DOptions = {
  landscape: boolean;
  hideUserMarker?: boolean;
  reducedMotion?: boolean;
  /** Dois dedos na tela: a partida cancela a mira em andamento. */
  onGesture?: () => void;
};

type Entry = {
  id: string;
  figure: PlayerFigure;
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
  seen: boolean;
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

function yawToward(dx: number, dz: number) {
  return Math.atan2(dx, dz);
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}

// ----------------------------------------------------------- confete

class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly items: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; spin: number; life: number }> = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly euler = new THREE.Euler();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private active = false;

  constructor(count = 240) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 }), count);
    this.mesh.frustumCulled = false;
    for (let index = 0; index < count; index += 1) {
      this.items.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, life: 0 });
      this.mesh.setColorAt(index, new THREE.Color("#ffffff"));
    }
    this.hideAll();
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

  burst(x: number, z: number, towardZ: number, colors: string[]) {
    const color = new THREE.Color();
    this.items.forEach((item, index) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 110;
      item.x = x + (Math.random() - 0.5) * 60;
      item.y = 4 + Math.random() * 20;
      item.z = z;
      item.vx = Math.cos(angle) * speed * 0.7;
      item.vz = towardZ * (30 + Math.random() * 110) + Math.sin(angle) * 30;
      item.vy = 120 + Math.random() * 150;
      item.rx = Math.random() * Math.PI;
      item.ry = Math.random() * Math.PI;
      item.spin = (Math.random() - 0.5) * 18;
      item.life = 2.4 + Math.random() * 1.4;
      color.set(colors[index % colors.length]);
      this.mesh.setColorAt(index, color);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.active = true;
  }

  update(dt: number) {
    if (!this.active) return;
    let alive = 0;
    this.items.forEach((item, index) => {
      if (item.life <= 0) return;
      item.life -= dt;
      item.vy -= 210 * dt;
      const drag = Math.exp(-dt * 2.2);
      item.vx *= drag;
      item.vz *= drag;
      item.vy = Math.max(item.vy, -38);
      item.x += item.vx * dt + Math.sin(item.life * 6 + index) * 0.4;
      item.y += item.vy * dt;
      item.z += item.vz * dt;
      item.rx += item.spin * dt;
      item.ry += item.spin * 0.7 * dt;
      if (item.y < 0.3) {
        item.y = 0.3;
        item.vy = 0;
        item.vx = 0;
        item.vz = 0;
        item.spin = 0;
        item.rx = Math.PI / 2;
      }
      const visible = item.life > 0 ? Math.min(1, item.life / 0.5) : 0;
      this.scale.setScalar(visible);
      this.quaternion.setFromEuler(this.euler.set(item.rx, item.ry, 0));
      this.matrix.compose(this.position.set(item.x, item.y, item.z), this.quaternion, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
      alive += 1;
    });
    this.scale.setScalar(1);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (alive === 0) {
      this.active = false;
      this.hideAll();
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    disposeMaterial(this.mesh.material);
    this.mesh.dispose();
  }
}

// ------------------------------------------------------------- mira

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
  private powerArc: THREE.Mesh;
  private readonly powerMaterial: THREE.MeshBasicMaterial;
  private readonly band: THREE.Line;
  private readonly bandMaterial: THREE.LineDashedMaterial;
  private readonly bandGeometry: THREE.BufferGeometry;
  private readonly path: THREE.Line;
  private readonly pathMaterial: THREE.LineDashedMaterial;
  private readonly pathGeometry: THREE.BufferGeometry;
  private lastArc = -1;

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
    this.powerArc = flat(new THREE.RingGeometry(FIELD.discRadius + 6, FIELD.discRadius + 9.5, 48, 1, 0, 0.01), this.powerMaterial, 0.6);

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
    for (const piece of [this.shaft, this.head, this.lane]) {
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
      this.path.computeLineDistances();
    }

    this.powerTrack.position.set(x, 0.55, z);
    const arc = Math.round(aim.ratio * 64);
    if (arc !== this.lastArc) {
      this.lastArc = arc;
      this.powerArc.geometry.dispose();
      // Começa "em cima" na tela padrão (-Z) e cresce no sentido horário.
      this.powerArc.geometry = new THREE.RingGeometry(FIELD.discRadius + 6, FIELD.discRadius + 9.5, 48, 1, Math.PI / 2 - (arc / 64) * Math.PI * 2, Math.max(0.01, (arc / 64) * Math.PI * 2));
    }
    this.powerArc.position.set(x, 0.6, z);

    // Elástico: da cintura do jogador até onde o dedo está.
    const bandPositions = this.bandGeometry.getAttribute("position") as THREE.BufferAttribute;
    bandPositions.setXYZ(0, x, PICK_HEIGHT, z);
    bandPositions.setXYZ(1, toWorldX(aim.dragX), PICK_HEIGHT, toWorldZ(aim.dragY));
    bandPositions.needsUpdate = true;
    this.band.computeLineDistances();
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
    this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  update(points: Array<{ x: number; y: number }>, radius: number) {
    const count = Math.min(points.length, this.max);
    this.colors.fill(0);
    if (count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const start = points.length - count;
    for (let index = 0; index < count; index += 1) {
      const point = points[start + index];
      const next = points[Math.min(points.length - 1, start + index + 1)];
      const previous = points[Math.max(start, start + index - 1)];
      let dx = next.x - previous.x;
      let dy = next.y - previous.y;
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      const fade = (index + 1) / count;
      const width = radius * (0.25 + 0.6 * fade);
      const x = toWorldX(point.x);
      const z = toWorldZ(point.y);
      this.positions.set([x - dy * width, radius, z + dx * width, x + dy * width, radius, z - dx * width], index * 6);
      const alpha = fade * fade * 0.55;
      this.colors.set([1, 1, 0.95, alpha, 1, 1, 0.95, alpha], index * 8);
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
  private readonly markerTexture: THREE.Texture;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly flashLight: THREE.PointLight;
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly setup: BotaoMatchSetup,
    private options: Botao3DOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color("#0a1219");
    this.scene.fog = new THREE.Fog("#0a1219", 900, 2400);

    this.hemisphere = new THREE.HemisphereLight("#d6ecff", "#1d3322", 1.05);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight("#fff3df", 2.35);
    this.sun.position.set(-170, 430, 210);
    this.sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
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
    this.flashLight = new THREE.PointLight("#ffc72c", 0, 520, 1.2);
    this.flashLight.position.set(0, 90, 0);
    this.scene.add(this.flashLight);

    this.stadium = new Stadium(setup, this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.stadium.group);
    this.ball = new BallView(FIELD.ballRadius);
    this.scene.add(this.ball.root, this.aim.group, this.trail.mesh);
    this.confetti = new Confetti(options.reducedMotion ? 80 : 240);
    this.scene.add(this.confetti.mesh);
    this.markerTexture = labelTexture("VC", "#10271d", "#ffc72c");

    this.fitPoints = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.fitPoints.push(new THREE.Vector3(sx * (HALF_W + 8), 0, sz * (HALF_H + FIELD.goalDepth + 6)));
        this.fitPoints.push(new THREE.Vector3(sx * HALF_W, FIGURE_HEIGHT * 0.8, sz * HALF_H));
      }
    }
    for (const sz of [-1, 1]) this.fitPoints.push(new THREE.Vector3(0, GOAL_HEIGHT, sz * HALF_H));

    this.setLandscape(options.landscape);
    // Entrada de transmissão: começa baixa e de lado, e desce até a mesa.
    if (!options.reducedMotion) {
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
    this.baseYaw = landscape ? Math.PI / 2 : 0;
    this.yawTarget = this.baseYaw;
    this.pitchTarget = DEFAULT_PITCH;
  }

  resetCamera() {
    this.zoom = 1;
    // Reaplica o enquadramento do momento (jogo corrido ou pênalti).
    this.cameraKey = "";
    this.yawTarget = this.baseYaw;
    this.pitchTarget = DEFAULT_PITCH;
  }

  /** Muda o enquadramento quando o momento da partida muda; o giro do jogador continua livre. */
  private frameMoment(state: BotaoMatchState) {
    const penalties = state.phase === "penalties" ? state.penalties : null;
    const key = penalties
      ? `penalty|${penalties.round}|${penalties.turn}`
      : state.phase === "goal" && state.lastGoal
        ? `goal|${state.lastGoal.side}`
        : "play";
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
    } else if (key.startsWith("goal")) {
      const top = state.lastGoal?.side === "user";
      this.targetGoal.set(0, 0, (top ? -1 : 1) * HALF_H * 0.42);
      this.focusZoomGoal = 1.32;
    } else {
      this.targetGoal.set(0, 0, 0);
      this.focusZoomGoal = 1;
      if (previous.startsWith("penalty") || previous === "") {
        this.yawTarget = this.baseYaw;
        this.pitchTarget = DEFAULT_PITCH;
      }
    }
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
    if (this.yawTarget !== null) {
      const delta = angleDelta(this.yaw, this.yawTarget);
      this.yaw += delta * turn;
      if (Math.abs(delta) < 0.002) {
        this.yaw = this.yawTarget;
        this.yawTarget = null;
      }
    }
    if (this.pitchTarget !== null) {
      this.pitch += (this.pitchTarget - this.pitch) * turn;
      if (Math.abs(this.pitchTarget - this.pitch) < 0.002) {
        this.pitch = this.pitchTarget;
        this.pitchTarget = null;
      }
    }
    const ease = 1 - Math.exp(-dt * Math.min(3.2, this.cameraEase));
    this.target.lerp(this.targetGoal, ease);
    this.focusZoom += (this.focusZoomGoal - this.focusZoom) * ease;
    const distance = this.fit() / (this.zoom * this.focusZoom);
    this.placeCamera(distance, this.target);
    if (this.shake > 0 && !this.options.reducedMotion) {
      const amount = this.shake * this.shake * 5;
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
      this.zoom = Math.max(0.7, Math.min(2.6, this.zoom * Math.exp(-event.deltaY * 0.0011)));
    };
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
    let best: { id: string; distance: number } | null = null;
    for (const entry of this.entries.values()) {
      if (!entry.figure.root.visible || entry.side === null) continue;
      bottom.set(entry.x, 0, entry.z);
      top.set(entry.x, FIGURE_HEIGHT, entry.z);
      const distanceSq = ray.distanceSqToSegment(bottom, top, onRay);
      const reach = FIELD.discRadius + 2;
      if (distanceSq > reach * reach) continue;
      const along = onRay.distanceTo(ray.origin);
      if (!best || along < best.distance) best = { id: entry.id, distance: along };
    }
    return best?.id ?? null;
  }

  setHover(id: string | null) {
    this.hoverId = id;
  }

  // ------------------------------------------------------------ eventos

  handleEvents(events: BotaoEvent[], state: BotaoMatchState) {
    for (const event of events) {
      if (event.type === "goal") {
        this.shake = 1;
        this.stadium.celebrate(event.side);
        const top = event.side === "user";
        const team = event.side === "user" ? this.setup.userTeam : this.setup.cpuTeam;
        const ball = state.bodies.find((body) => body.kind === "ball");
        const x = ball ? toWorldX(ball.x) : 0;
        this.confetti.burst(x, top ? -HALF_H : HALF_H, top ? 1 : -1, [team.primary, team.secondary, "#ffc72c", "#ffffff"]);
        this.flashLight.color.set(event.side === "user" ? "#ffc72c" : "#ff5a4e");
        this.flashLight.position.set(x, 80, top ? -HALF_H + 30 : HALF_H - 30);
        this.flashLight.intensity = 700;
      }
      if (event.type === "post") {
        const ball = state.bodies.find((body) => body.kind === "ball");
        if (ball) this.stadium.goal(ball.y < FIELD.height / 2 ? "top" : "bottom").wobble();
      }
    }
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
      seed: hashString(`${id}|${body.number}`),
    });
    const ringMaterial = new THREE.MeshBasicMaterial({ color: team.primary, transparent: true, opacity: 0.35, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    ring.renderOrder = 2;
    figure.root.add(ring);
    let marker: THREE.Group | null = null;
    if (body.isUserPlayer && !this.options.hideUserMarker) {
      marker = new THREE.Group();
      // Vista quase de cima: altura vira pouca distância na tela, então o selo sobe bem.
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTexture, depthTest: false, transparent: true }));
      label.scale.set(16, 8, 1);
      label.position.y = 22;
      label.renderOrder = 10;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(2.8, 6, 4), new THREE.MeshBasicMaterial({ color: "#ffc72c", depthTest: false, transparent: true }));
      arrow.rotation.x = Math.PI;
      arrow.position.y = 8;
      arrow.renderOrder = 10;
      marker.add(label, arrow);
      marker.position.y = FIGURE_HEIGHT + 12;
      figure.root.add(marker);
    }
    this.scene.add(figure.root);
    const x = toWorldX(body.x);
    const z = toWorldZ(body.y);
    figure.root.position.set(x, 0, z);
    const facing = side === "user" ? Math.PI : 0;
    figure.snapYaw(facing);
    return {
      id,
      figure,
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
      seen: true,
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
    const key = this.appearanceFor(body).key;
    if (entry && entry.appearanceKey !== key) {
      this.disposeEntry(entry);
      this.entries.delete(body.id);
      entry = undefined;
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
    const geometry = new THREE.RingGeometry(FIELD.discRadius + 2, FIELD.discRadius + 3.6, 48, 1, Math.PI / 2, Math.max(0.01, (value / 100) * Math.PI * 2));
    if (!entry.stamina) {
      entry.stamina = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
      entry.stamina.rotation.x = -Math.PI / 2;
      entry.stamina.position.y = 0.3;
      entry.figure.root.add(entry.stamina);
    } else {
      entry.stamina.geometry.dispose();
      entry.stamina.geometry = geometry;
      (entry.stamina.material as THREE.MeshBasicMaterial).color.set(color);
    }
  }

  // ------------------------------------------------------------- quadro

  render(state: BotaoMatchState, view: BotaoRenderView, dt: number) {
    const step = Math.min(dt, 0.05);
    this.time += step;
    this.resize();

    // Igual ao 2D: goleiro e batedor só existem na fase de cobrança.
    const penaltyMode = state.phase === "penalties";
    const penalties = state.penalties;
    const shooter = penaltyMode && penalties ? penaltyShooter(state) : null;
    const keeperBody = penaltyMode && penalties ? penaltyKeeper(state) : null;
    const ball = state.bodies.find((body) => body.kind === "ball") ?? null;

    // ------------------------------------------------------------- bola
    if (ball) this.updateBall(state, ball, step, penaltyMode);
    const ballLook = { x: this.ballDisplayX, z: this.ballDisplayZ };

    // Quem comemora e quem lamenta.
    let celebrateSide: BotaoSide | null = null;
    let scorerId: string | null = null;
    if (state.phase === "goal" && state.lastGoal) {
      celebrateSide = state.lastGoal.side;
      if (!state.lastGoal.ownGoal) scorerId = state.touches.at(-1)?.bodyId ?? null;
    } else if (state.phase === "finished" && state.result) {
      celebrateSide = state.result.outcome === "win" ? "user" : state.result.outcome === "loss" ? "cpu" : null;
    }
    if (penaltyMode && penalties) this.trackPenaltyOutcome(state, penalties.round, penalties.turn, ball);

    // Novo toque: arranque de quem foi tacado.
    const newShot = state.turns !== this.lastTurns && state.phase === "resolving";
    this.lastTurns = state.turns;

    const activeSide = state.phase === "aim" || state.phase === "kickoff" ? state.turn : null;
    const pulse = (Math.sin(this.time * 5.2) + 1) / 2;
    for (const entry of this.entries.values()) entry.seen = false;

    const benchSlots: Record<BotaoSide, number> = { user: 0, cpu: 0 };
    const penaltyGoalTop = penalties ? penalties.turn === "user" : true;

    for (const body of state.bodies) {
      if (body.kind !== "disc" && body.kind !== "keeper") continue;
      if (body.kind === "keeper" && (!penaltyMode || body !== keeperBody)) continue;
      const entry = this.entryFor(body);
      entry.seen = true;
      entry.figure.root.visible = true;

      // Posição de destino: o motor, ou a fila no meio-campo durante os pênaltis.
      let targetX = toWorldX(body.x);
      let targetZ = toWorldZ(body.y);
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
      const physicsMoving = (state.phase === "resolving" && !benched) || (penaltyMode && penalties?.shotInFlight && body === shooter);
      if (physicsMoving) {
        entry.chasing = false;
        entry.x = targetX;
        entry.z = targetZ;
      } else if (body.kind === "keeper") {
        // O goleiro é palheta: anda o tempo todo, sem trote.
        entry.x = targetX;
        entry.z = targetZ;
      } else if (engineJump > 6 || entry.chasing) {
        // Teletransporte do motor (gol, troca de formação, pênalti): vira trote.
        const distance = Math.hypot(targetX - entry.x, targetZ - entry.z);
        if (!entry.chasing && distance > 6) {
          entry.chasing = true;
          entry.chaseSpeed = Math.max(95, distance / 0.85);
        }
        if (entry.chasing) {
          const move = entry.chaseSpeed * step;
          if (distance <= move || distance < 0.5) {
            entry.x = targetX;
            entry.z = targetZ;
            entry.chasing = false;
          } else {
            entry.x += ((targetX - entry.x) / distance) * move;
            entry.z += ((targetZ - entry.z) / distance) * move;
          }
        }
      } else {
        entry.x = targetX;
        entry.z = targetZ;
      }
      entry.figure.root.position.set(entry.x, 0, entry.z);

      // ------------------------------------------------- intenção
      const intent = this.intentFor(state, view, body, entry, {
        celebrateSide,
        scorerId,
        activeSide,
        penaltyMode,
        shooter,
        benched,
        ballLook,
        penaltyGoalTop,
      });
      if (newShot && state.activeShotBodyId === body.id) entry.figure.triggerLunge();
      if (penaltyMode && penalties?.shotInFlight && body === shooter && this.lastPhase !== "flight") {
        entry.figure.triggerLunge();
      }
      entry.figure.update(step, intent);

      // ------------------------------------------------- anel no chão
      const isUser = body.isUserPlayer && !this.options.hideUserMarker;
      const selected = view.selectedId === body.id;
      const hovered = this.hoverId === body.id && !selected;
      const ready = activeSide !== null && body.side === activeSide && body.kind === "disc";
      entry.ring.visible = !benched;
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
        entry.ringMaterial.color.set(body.side === "user" ? this.setup.userTeam.primary : this.setup.cpuTeam.primary);
        entry.ringMaterial.opacity = body.kind === "keeper" ? 0 : 0.22;
        entry.ring.scale.setScalar(1);
      }
      if (entry.marker) {
        entry.marker.visible = !benched;
        entry.marker.position.y = FIGURE_HEIGHT + 12 + Math.sin(this.time * 3.4) * 1.8;
        entry.marker.rotation.y = this.time * 2.2 - entry.figure.root.rotation.y;
      }
      this.updateStamina(entry, body);
    }
    this.lastPhase = penaltyMode && penalties?.shotInFlight ? "flight" : state.phase;

    for (const entry of this.entries.values()) if (!entry.seen) entry.figure.root.visible = false;
    for (const side of ["user", "cpu"] as const) {
      const keeper = this.keepers[side];
      if (keeper) keeper.figure.root.visible = penaltyMode && keeperBody?.side === side;
    }

    // Quem encostou na bola chuta (inclusive no pênalti, que não emite "touch").
    if (ball) this.detectKicks(ball, step);

    const aimDisc = view.aim ? state.bodies.find((body) => body.id === view.aim?.bodyId) ?? null : null;
    this.aim.update(aimDisc, view.aim);
    this.trail.update(view.trail, FIELD.ballRadius);

    this.flashLight.intensity *= Math.exp(-step * 2.2);
    this.frameMoment(state);
    this.stadium.update(step, this.time);
    this.confetti.update(step);
    this.updateCamera(step);
    this.renderer.render(this.scene, this.camera);
  }

  private updateBall(state: BotaoMatchState, ball: BotaoBody, dt: number, penaltyMode: boolean) {
    const x = toWorldX(ball.x);
    const z = toWorldZ(ball.y);
    const jump = Math.hypot(x - this.lastBallX, z - this.lastBallZ);
    const resting = ball.vx === 0 && ball.vy === 0;
    const teleported = this.ballInitialized && jump > 30 && resting;
    if (dt > 0 && !teleported && this.ballInitialized) {
      this.ballVX = (x - this.lastBallX) / dt;
      this.ballVZ = (z - this.lastBallZ) / dt;
    }

    // Gol: o motor para a bola na linha; aqui ela segue até estufar a rede.
    if (state.phase === "goal" && !this.ballInNet && this.ballInitialized) {
      const top = state.lastGoal?.side === "user";
      const speed = Math.hypot(this.ballVX, this.ballVZ);
      const minimum = 160;
      const scale = speed < minimum ? minimum / Math.max(1, speed) : 1;
      this.ballInNet = { vx: this.ballVX * scale * 0.85, vz: (top ? -1 : 1) * Math.max(minimum, Math.abs(this.ballVZ * scale)), top, hit: false };
      this.ballDisplayX = x;
      this.ballDisplayZ = z;
    }
    if (state.phase !== "goal" && state.phase !== "finished") this.ballInNet = null;

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
        this.stadium.goal(net.top ? "top" : "bottom").ripple(this.ballDisplayX + HALF_W, Math.min(1.4, Math.abs(net.vz) / 260));
        net.vz = -net.vz * 0.18;
        net.vx *= 0.4;
      }
      if (net.hit) this.ballDisplayZ = net.top ? Math.max(backZ, Math.min(-HALF_H - 2, this.ballDisplayZ)) : Math.min(backZ, Math.max(HALF_H + 2, this.ballDisplayZ));
    } else {
      this.ballDisplayX = x;
      this.ballDisplayZ = z;
    }
    if (teleported && !penaltyMode) this.ball.drop(state.phase === "kickoff" ? 80 : 40);
    else if (teleported) this.ball.drop(26);
    this.ball.update(this.ballDisplayX, this.ballDisplayZ, dt, teleported);
    this.lastBallX = x;
    this.lastBallZ = z;
    this.ballInitialized = true;
  }

  private previousBallVX = 0;
  private previousBallVZ = 0;

  private detectKicks(ball: BotaoBody, dt: number) {
    if (dt <= 0) return;
    const change = Math.hypot(ball.vx - this.previousBallVX, ball.vy - this.previousBallVZ);
    this.previousBallVX = ball.vx;
    this.previousBallVZ = ball.vy;
    if (change < 45 || this.ballInNet) return;
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
    if (nearest && nearestDistance < FIELD.discRadius + FIELD.ballRadius + 5 && !nearest.id.startsWith("keeper")) {
      nearest.figure.triggerKick(change / 520);
    }
  }

  private trackPenaltyOutcome(state: BotaoMatchState, round: number, turn: BotaoSide, ball: BotaoBody | null) {
    const key = `${round}|${turn}|${state.penalties?.results.user.length}|${state.penalties?.results.cpu.length}`;
    if (key !== this.penaltyKey) {
      this.penaltyKey = key;
      this.penaltyOutcome = null;
    }
    if (!state.penalties?.shotInFlight || !ball || this.penaltyOutcome) return;
    const goalTop = turn === "user";
    const crossed = goalTop ? ball.y <= 0 : ball.y >= FIELD.height;
    if (crossed) {
      this.penaltyOutcome = ball.x > FIELD.width / 2 - FIELD.goalWidth / 2 && ball.x < FIELD.width / 2 + FIELD.goalWidth / 2 ? "scored" : "saved";
      if (this.penaltyOutcome === "scored") {
        this.stadium.goal(goalTop ? "top" : "bottom").ripple(ball.x, 1);
        this.stadium.celebrate(turn);
      }
      return;
    }
    const stopped = ball.vx === 0 && ball.vy === 0 && state.resolveElapsed > 0.4;
    const away = goalTop ? ball.vy > 20 : ball.vy < -20;
    if (stopped || (away && state.resolveElapsed > 0.1)) {
      this.penaltyOutcome = "saved";
      this.stadium.celebrate(turn === "user" ? "cpu" : "user");
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
    },
  ): FigureIntent {
    const lookAtBall = { x: context.ballLook.x, z: context.ballLook.z };
    const faceBall = yawToward(context.ballLook.x - entry.x, context.ballLook.z - entry.z);

    // Trote de reposicionamento.
    if (entry.chasing) {
      const dx = entry.engineX - entry.x;
      const dz = entry.engineZ - entry.z;
      const heading = yawToward(dx, dz);
      return idleIntent({ state: "run", speed: Math.min(entry.chaseSpeed, 260), heading, faceYaw: heading, look: null });
    }

    // Goleiro do pênalti.
    if (body.kind === "keeper") {
      const facing = context.penaltyGoalTop ? 0 : Math.PI;
      let dive = 0;
      const penalties = state.penalties;
      if (penalties?.shotInFlight) {
        const ball = state.bodies.find((candidate) => candidate.kind === "ball");
        if (ball) {
          const towardGoal = context.penaltyGoalTop ? ball.vy < -20 : ball.vy > 20;
          const gap = Math.abs(ball.y - body.y);
          if ((towardGoal && gap < 95) || this.penaltyOutcome) {
            const local = (ball.x - body.x) * (context.penaltyGoalTop ? 1 : -1);
            dive = Math.max(-1, Math.min(1, local / 14));
            if (Math.abs(dive) < 0.35) dive = 0;
          }
        }
      }
      if (this.penaltyOutcome === "saved" && Math.abs(dive) < 0.2) {
        return idleIntent({ state: "celebrate", faceYaw: facing, look: null });
      }
      if (this.penaltyOutcome === "scored" && !penalties?.shotInFlight) {
        return idleIntent({ state: "sad", faceYaw: facing });
      }
      const shuffle = penalties ? penalties.keeperDirection * penalties.keeperSpeed * (context.penaltyGoalTop ? 1 : -1) : 0;
      return idleIntent({ state: "keeper", faceYaw: facing, look: lookAtBall, dive, shuffle: penalties?.shotInFlight ? 0 : shuffle });
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

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Celular em pé: um pouco mais de abertura para caber o campo sem afastar demais.
    this.camera.fov = this.camera.aspect < 0.8 ? 32 : 28;
    this.camera.updateProjectionMatrix();
    this.fitKey = "";
  }

  dispose() {
    for (const release of this.cleanup) release();
    for (const entry of this.entries.values()) this.disposeEntry(entry);
    for (const keeper of Object.values(this.keepers)) if (keeper) this.disposeEntry(keeper);
    this.entries.clear();
    this.stadium.dispose();
    this.ball.dispose();
    this.aim.dispose();
    this.trail.dispose();
    this.confetti.dispose();
    this.ringGeometry.dispose();
    this.markerTexture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

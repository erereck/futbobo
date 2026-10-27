// Arquitetura do teatro da gala: palco de piso preto brilhante com o anel
// dourado embutido, praticável, escada, boca de cena com arco e colunas de
// ouro, cortinas de veludo, telão emoldurado, treliça, púlpito, coluna do
// troféu e a sala (fileiras em degrau, camarotes, teto).
//
// Tudo estático é juntado por material: um piso (emissivo pelo canvas das
// linhas de ouro), um escuro (paredes, degraus, sala), um ouro (metal com
// reflexo do ambiente), um de luzes (fitas de LED, sem iluminação) e um de
// veludo (shader próprio, dobras pintadas por vértice). Cinco draw calls.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GlowSpec } from "./stage-gala-fx";

export type GalaArchitectureLayout = {
  stage: { left: number; right: number; back: number; front: number; pit: number };
  riser: { left: number; right: number; back: number; front: number; top: number; stepFront: number; stepTop: number };
  screen: { z: number; width: number; bottom: number; height: number };
  columns: { x: number; z: number; bottom: number; width: number; height: number };
  marks: Array<{ x: number; z: number }>;
  winner: { x: number; z: number };
  ring: { x: number; z: number; radius: number };
  lectern: { x: number; z: number; yaw: number; y: number };
  pedestal: { x: number; z: number; y: number; top: number };
  proscenium: { z: number; halfWidth: number; sideTop: number; crown: number; columnX: number };
  truss: { y: number; z: number; halfWidth: number };
  hall: { halfWidth: number; backZ: number; ceiling: number; rows: Array<{ z: number; y: number }>; rowDepth: number };
  stairs: { halfWidth: number; tread: number; steps: number };
  balconies: number[];
  season: number;
};

// ------------------------------------------------------------ juntador

/** Junta peças (posição, normal, cor por vértice) para virar uma malha só. */
class Bag {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly color = new THREE.Color();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);

  add(source: THREE.BufferGeometry, color: string, intensity = 1, matrix?: THREE.Matrix4) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    if (matrix) geometry.applyMatrix4(matrix);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
    }
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    geometry.clearGroups();
    this.color.set(color).multiplyScalar(intensity);
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      colors[index * 3] = this.color.r;
      colors[index * 3 + 1] = this.color.g;
      colors[index * 3 + 2] = this.color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.parts.push(geometry);
  }

  /** Geometria já com cor por vértice (cortinas com as dobras pintadas). */
  addColored(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    for (const name of Object.keys(flat.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "color") flat.deleteAttribute(name);
    }
    this.parts.push(flat);
  }

  /** Caixa centrada em (x, y, z), girada `yaw` (e `pitch`, em x) em volta do centro. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, options: { yaw?: number; pitch?: number; intensity?: number; parent?: THREE.Matrix4 } = {}) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    this.euler.set(options.pitch ?? 0, options.yaw ?? 0, 0, "YXZ");
    this.quaternion.setFromEuler(this.euler);
    this.matrix.compose(this.position.set(x, y, z), this.quaternion, this.scale);
    if (options.parent) this.matrix.premultiply(options.parent);
    this.add(geometry, color, options.intensity ?? 1, this.matrix);
  }

  /** Cilindro de pé com base em y0. */
  cylinder(rTop: number, rBottom: number, height: number, x: number, y0: number, z: number, color: string, segments = 24, intensity = 1) {
    const geometry = new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1, false);
    geometry.translate(x, y0 + height / 2, z);
    this.add(geometry, color, intensity);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    merged.computeBoundingSphere();
    return merged;
  }
}

// --------------------------------------------------------------- veludo

const VELVET_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vColor = color;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const VELVET_FRAGMENT = /* glsl */ `
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uAmbient;
  uniform float uSheen;
  uniform float uFootY;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    if (dot(n, v) < 0.0) n = -n;
    float wrap = max(0.0, (dot(n, uKeyDir) + 0.35) / 1.35);
    // Veludo: escuro de frente, a luz aparece rasante nas bordas das dobras.
    float sheen = pow(1.0 - max(0.0, dot(n, v)), 2.6);
    // Luz de ribalta: mais quente perto do chão do palco, apagando para cima.
    float foot = exp(-max(0.0, vWorld.y - uFootY) * 0.012);
    vec3 light = uAmbient + uKeyColor * wrap * (0.45 + 0.55 * foot);
    vec3 color = vColor * light + vColor * uSheen * sheen * (0.6 + foot) * 2.2;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/**
 * Pano com dobras verticais. `xa`/`xb` dão as bordas em função da altura
 * (v: 0 embaixo, 1 em cima): onde o pano estreita (amarrado), as dobras ficam
 * mais fundas e juntas. A cor já sai com a sombra das dobras.
 */
function drape(options: {
  xa: (v: number) => number;
  xb: (v: number) => number;
  y0: number;
  y1: number;
  z: number;
  folds: number;
  depth: number;
  color: string;
  cols?: number;
  rows?: number;
  bottom?: (u: number) => number;
  horizontal?: number;
}) {
  const cols = options.cols ?? 96;
  const rows = options.rows ?? 14;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const base = new THREE.Color(options.color);
  const reference = Math.abs(options.xb(1) - options.xa(1));
  for (let j = 0; j <= rows; j += 1) {
    const v = j / rows;
    const xa = options.xa(v);
    const xb = options.xb(v);
    const width = Math.max(1, Math.abs(xb - xa));
    const gather = Math.min(2.4, Math.sqrt(reference / width));
    for (let i = 0; i <= cols; i += 1) {
      const u = i / cols;
      const x = xa + (xb - xa) * u;
      const bottom = options.bottom ? options.bottom(u) : options.y0;
      const y = bottom + (options.y1 - bottom) * v;
      const phase = u * options.folds * Math.PI * 2 + Math.sin(u * 13.1) * 0.6;
      let wave = 0.5 + 0.5 * Math.sin(phase);
      if (options.horizontal) wave = 0.6 * wave + 0.4 * (0.5 + 0.5 * Math.sin(v * options.horizontal * Math.PI * 2 + u * 3));
      const z = options.z + options.depth * gather * wave;
      positions.push(x, y, z);
      const shade = 0.42 + 0.58 * Math.pow(wave, 0.8);
      colors.push(base.r * shade, base.g * shade, base.b * shade);
    }
  }
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 2;
      const d = a + cols + 1;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ----------------------------------------------------------------- piso

/** Quadrado do piso coberto pelo canvas das linhas de ouro (centro e meia-largura). */
const FLOOR_MAP = { x: 0, z: -27, half: 240 };

function arcText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, radius: number, spacing: number, bottom: boolean) {
  const letters = Array.from(text);
  const widths = letters.map((letter) => ctx.measureText(letter).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (letters.length - 1);
  const span = total / radius;
  let angle = bottom ? Math.PI / 2 + span / 2 : -Math.PI / 2 - span / 2;
  letters.forEach((letter, index) => {
    const step = (widths[index] / 2) / radius;
    angle += bottom ? -step : step;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.rotate(bottom ? angle - Math.PI / 2 : angle + Math.PI / 2);
    ctx.fillText(letter, 0, 0);
    ctx.restore();
    angle += bottom ? -(step + spacing / radius) : step + spacing / radius;
  });
}

/**
 * Linhas de ouro do piso (mapa emissivo): o anel com "BALLON D'OR" e o ano,
 * o sol de raios finos no meio, as marcas dos finalistas, a moldura e a
 * estrela do praticável e o filete da boca do palco. Fundo preto = não brilha.
 */
function floorTexture(layout: GalaArchitectureLayout, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const unit = size / (FLOOR_MAP.half * 2);
  const px = (x: number) => (x - (FLOOR_MAP.x - FLOOR_MAP.half)) * unit;
  const pz = (z: number) => (z - (FLOOR_MAP.z - FLOOR_MAP.half)) * unit;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const gold = "#ffcd72";
  ctx.strokeStyle = gold;
  ctx.fillStyle = gold;
  ctx.shadowColor = "rgba(255,180,70,0.9)";
  ctx.shadowBlur = 2.2 * unit;
  const circle = (x: number, z: number, r: number, width: number, alpha = 1, dash: number[] = []) => {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width * unit;
    ctx.setLineDash(dash.map((value) => value * unit));
    ctx.beginPath();
    ctx.arc(px(x), pz(z), r * unit, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  };
  const line = (x0: number, z0: number, x1: number, z1: number, width: number, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width * unit;
    ctx.beginPath();
    ctx.moveTo(px(x0), pz(z0));
    ctx.lineTo(px(x1), pz(z1));
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  // Anel principal.
  const { x: rx, z: rz, radius } = layout.ring;
  circle(rx, rz, radius, 0.9);
  circle(rx, rz, radius - 1.5, 0.3);
  circle(rx, rz, radius - 11, 0.5);
  circle(rx, rz, radius - 12.2, 0.22);
  circle(rx, rz, radius + 12, 0.3, 0.55, [2.2, 2.2]);
  // Sol de raios finos dentro do anel.
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 0.18 * unit;
  for (let index = 0; index < 72; index += 1) {
    const angle = (index / 72) * Math.PI * 2;
    const r0 = index % 2 ? 9 : 6;
    const r1 = radius - 14;
    ctx.beginPath();
    ctx.moveTo(px(rx + Math.cos(angle) * r0), pz(rz + Math.sin(angle) * r0));
    ctx.lineTo(px(rx + Math.cos(angle) * r1), pz(rz + Math.sin(angle) * r1));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  circle(rx, rz, 5, 0.4);
  // Letreiro: embaixo (lado da plateia) "BALLON D'OR"; em cima o ano.
  const textRadius = radius - 6;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${7 * unit}px 'Didot', 'Bodoni MT', Georgia, 'Times New Roman', serif`;
  arcText(ctx, "BALLON D'OR", px(rx), pz(rz), textRadius * unit, 2.2 * unit, true);
  ctx.font = `700 ${5.6 * unit}px 'Didot', 'Bodoni MT', Georgia, 'Times New Roman', serif`;
  arcText(ctx, `✦  ${layout.season}  ✦`, px(rx), pz(rz), textRadius * unit, 1.6 * unit, false);
  // Losangos nas laterais do letreiro.
  for (const side of [-1, 1]) {
    const cx = px(rx + side * textRadius);
    const cy = pz(rz);
    const r = 1.8 * unit;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
  }

  // Marcas dos finalistas das pontas (a do meio está dentro do anel).
  for (const mark of layout.marks) {
    if (Math.hypot(mark.x - rx, mark.z - rz) < radius) continue;
    circle(mark.x, mark.z, 9, 0.45, 0.85);
    circle(mark.x, mark.z, 7.6, 0.18, 0.6);
  }

  // Filete na boca do palco e linhas que levam ao praticável.
  line(layout.stage.left + 4, layout.stage.front - 3, layout.stage.right - 4, layout.stage.front - 3, 0.5, 0.9);
  line(layout.stage.left + 4, layout.stage.front - 4.6, layout.stage.right - 4, layout.stage.front - 4.6, 0.18, 0.6);

  // Praticável: moldura dupla e a estrela do vencedor.
  const r = layout.riser;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 0.5 * unit;
  ctx.strokeRect(px(r.left + 4), pz(r.back + 4), (r.right - r.left - 8) * unit, (r.front - r.back - 8) * unit);
  ctx.lineWidth = 0.2 * unit;
  ctx.strokeRect(px(r.left + 6), pz(r.back + 6), (r.right - r.left - 12) * unit, (r.front - r.back - 12) * unit);
  ctx.globalAlpha = 1;
  const w = layout.winner;
  circle(w.x, w.z, 14, 0.7);
  circle(w.x, w.z, 12.4, 0.25);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let index = 0; index < 16; index += 1) {
    const angle = -Math.PI / 2 + (index / 16) * Math.PI * 2;
    const rr = (index % 2 ? 3.2 : 10.5) * unit;
    const x = px(w.x) + Math.cos(angle) * rr;
    const y = pz(w.z) + Math.sin(angle) * rr;
    if (index) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Plano horizontal em y com UV planar do mapa do piso. */
function floorPlane(x0: number, x1: number, z0: number, z1: number, y: number) {
  const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    uv.setXY(index, (x - (FLOOR_MAP.x - FLOOR_MAP.half)) / (FLOOR_MAP.half * 2), 1 - (z - (FLOOR_MAP.z - FLOOR_MAP.half)) / (FLOOR_MAP.half * 2));
  }
  return geometry;
}

// ------------------------------------------------------------ montagem

const WINE = "#3a0b12";
const WINE_DARK = "#24070b";
const BLACK = "#0c0c0f";
const GOLD = "#e8b452";
const GOLD_PALE = "#f3d48a";
const LED = "#ffbf55";
const VELVET_RED = "#8c0f1d";
const VELVET_BLACK = "#121014";

/** Contorno da boca de cena: laterais retas e arco elíptico no alto. */
function archPoints(halfWidth: number, sideTop: number, crown: number, steps = 40) {
  const points: Array<[number, number]> = [[-halfWidth, 0], [-halfWidth, sideTop]];
  for (let index = 1; index < steps; index += 1) {
    const angle = Math.PI - (index / steps) * Math.PI;
    points.push([Math.cos(angle) * halfWidth, sideTop + Math.sin(angle) * (crown - sideTop)]);
  }
  points.push([halfWidth, sideTop], [halfWidth, 0]);
  return points;
}

export type GalaArchitecture = {
  group: THREE.Group;
  floor: THREE.Mesh;
  /** Materiais de metal que precisam do mapa de ambiente. */
  metals: THREE.MeshStandardMaterial[];
  glows: GlowSpec[];
  /** Luz no veludo e nas paredes: `house` 0..1 e o palco aceso 0..1. */
  setLighting(house: number, stage: number): void;
  textures: THREE.Texture[];
  dispose(): void;
};

export function buildArchitecture(layout: GalaArchitectureLayout, options: { performance: boolean }): GalaArchitecture {
  const group = new THREE.Group();
  group.name = "gala-architecture";
  const dark = new Bag();
  const gold = new Bag();
  const led = new Bag();
  const velvet = new Bag();
  const glows: GlowSpec[] = [];
  const { stage, riser, hall, proscenium: pro } = layout;

  // ---------------------------------------------------------------- palco
  // Frente do palco com fita de LED no alto e ribalta.
  const stageWidth = stage.right - stage.left;
  dark.box(stageWidth, -stage.pit - 0.1, 2, (stage.left + stage.right) / 2, stage.pit / 2 - 0.05, stage.front - 1, BLACK);
  led.box(stageWidth - 4, 0.7, 0.7, 0, -0.6, stage.front + 0.1, LED, { intensity: 2.2 });
  gold.box(stageWidth, 1.2, 1.4, 0, -2.2, stage.front + 0.3, GOLD);
  for (let x = stage.left + 18; x < stage.right - 10; x += 26) {
    if (Math.abs(x) < layout.stairs.halfWidth + 6) continue;
    glows.push({ position: [x, -8, stage.front + 1.2], color: "#ffcf8a", intensity: 1.1, size: 7, group: 1 });
    dark.box(5, 2.2, 2, x, -8, stage.front + 0.4, "#1a1612");
  }
  // Laterais e fundo do palco (o fundo fica atrás do veludo preto).
  dark.box(4, -stage.pit, stage.front - stage.back, stage.left - 2, stage.pit / 2, (stage.front + stage.back) / 2, BLACK);
  dark.box(4, -stage.pit, stage.front - stage.back, stage.right + 2, stage.pit / 2, (stage.front + stage.back) / 2, BLACK);

  // Escada central da boca do palco até a plateia, com focinho de LED.
  const stepRise = -stage.pit / (layout.stairs.steps + 1);
  for (let index = 1; index <= layout.stairs.steps; index += 1) {
    const top = -stepRise * index;
    const z0 = stage.front + layout.stairs.tread * (index - 1);
    const height = top - stage.pit;
    dark.box(layout.stairs.halfWidth * 2, height, layout.stairs.tread, 0, stage.pit + height / 2, z0 + layout.stairs.tread / 2, "#101014");
    led.box(layout.stairs.halfWidth * 2 - 2, 0.45, 0.45, 0, top - 0.25, z0 + layout.stairs.tread - 0.1, LED, { intensity: 1.6 });
  }

  // Praticável com degrau: frentes escuras e focinhos de LED.
  const riserWidth = riser.right - riser.left;
  dark.box(riserWidth, riser.top, riser.stepFront - riser.back, 0, riser.top / 2 - 0.02, (riser.back + riser.front) / 2, "#0e0e12");
  dark.box(riserWidth, riser.stepTop, riser.stepFront - riser.front, 0, riser.stepTop / 2 - 0.02, (riser.front + riser.stepFront) / 2, "#0e0e12");
  led.box(riserWidth - 1, 0.5, 0.5, 0, riser.top - 0.3, riser.front + 0.05, LED, { intensity: 2 });
  led.box(riserWidth - 1, 0.5, 0.5, 0, riser.stepTop - 0.3, riser.stepFront + 0.05, LED, { intensity: 1.7 });
  for (const side of [-1, 1]) {
    led.box(0.5, 0.5, riser.front - riser.back, side * (riser.right + 0.05), riser.top - 0.3, (riser.back + riser.front) / 2, LED, { intensity: 1.6 });
  }

  // ---------------------------------------------------------- telão e LED
  const s = layout.screen;
  const screenTop = s.bottom + s.height;
  dark.box(s.width + 12, s.height + 12, 3, 0, s.bottom + s.height / 2, s.z - 1.8, "#050506");
  const frame = (cx: number, bottom: number, width: number, height: number, z: number) => {
    gold.box(width + 4, 1.4, 1.2, cx, bottom + height + 2, z, GOLD);
    gold.box(width + 4, 1.4, 1.2, cx, bottom - 2, z, GOLD);
    gold.box(1.4, height + 4, 1.2, cx - width / 2 - 2, bottom + height / 2, z, GOLD);
    gold.box(1.4, height + 4, 1.2, cx + width / 2 + 2, bottom + height / 2, z, GOLD);
  };
  frame(0, s.bottom, s.width, s.height, s.z + 0.3);
  const c = layout.columns;
  for (const side of [-1, 1]) {
    dark.box(c.width + 6, c.height + 6, 3, side * c.x, c.bottom + c.height / 2, c.z - 1.8, "#050506");
    frame(side * c.x, c.bottom, c.width, c.height, c.z + 0.3);
  }
  // Pé do telão até o chão (o praticável fica na frente).
  dark.box(s.width + 12, s.bottom, 3, 0, s.bottom / 2, s.z - 1.8, "#08080a");

  // Fundo: veludo preto com cortina de estrelas e fitas de ouro verticais.
  velvet.addColored(drape({ xa: () => stage.left - 20, xb: () => stage.right + 20, y0: 0, y1: 330, z: stage.back + 1, folds: 26, depth: 3.5, color: VELVET_BLACK, cols: 160, rows: 6 }));
  for (const side of [-1, 1]) {
    for (const x of [212, 226]) {
      led.box(0.9, 300, 0.9, side * x, 150, stage.back + 6, LED, { intensity: 1.25 });
    }
  }
  let star = 1;
  for (let index = 0; index < (options.performance ? 70 : 150); index += 1) {
    star = (star * 16807) % 2147483647;
    const x = ((star / 2147483647) - 0.5) * 2 * (stage.right + 10);
    star = (star * 16807) % 2147483647;
    const y = 8 + (star / 2147483647) * 300;
    // Fora do telão e das colunas.
    if (Math.abs(x) < s.width / 2 + 10 && y < screenTop + 12) continue;
    if (Math.abs(Math.abs(x) - c.x) < c.width && y < c.bottom + c.height + 8) continue;
    glows.push({ position: [x, y, stage.back + 6], color: "#fff4e0", intensity: 1.2, size: 2.4, group: 1, twinkle: 0.2 + (index % 17) / 17 });
  }

  // Pernas de veludo preto (mascaram as coxias).
  for (const z of [-24, -78]) {
    for (const side of [-1, 1]) {
      const inner = side * 198;
      const outer = side * 262;
      velvet.addColored(drape({ xa: () => Math.min(inner, outer), xb: () => Math.max(inner, outer), y0: 0, y1: 320, z, folds: 7, depth: 3, color: VELVET_BLACK, cols: 40, rows: 4 }));
    }
  }

  // Treliça do fundo (em cima do telão): quatro banzos e travessas.
  const t = layout.truss;
  for (const [dy, dz] of [[-4.5, -4.5], [-4.5, 4.5], [4.5, -4.5], [4.5, 4.5]] as const) {
    dark.box(t.halfWidth * 2, 1.4, 1.4, 0, t.y + dy, t.z + dz, "#2b2b31");
  }
  for (let x = -t.halfWidth; x <= t.halfWidth; x += 12) {
    dark.box(0.9, 9, 0.9, x, t.y, t.z - 4.5, "#2b2b31", { pitch: 0 });
    dark.box(0.9, 9, 0.9, x, t.y, t.z + 4.5, "#2b2b31");
    dark.box(0.9, 0.9, 9, x, t.y + 4.5, t.z, "#2b2b31");
    dark.box(0.9, 0.9, 9, x, t.y - 4.5, t.z, "#2b2b31");
  }
  // Correntes até o teto.
  for (const x of [-t.halfWidth + 10, -60, 60, t.halfWidth - 10]) dark.box(0.8, 120, 0.8, x, t.y + 64, t.z, "#1d1d22");

  // ---------------------------------------------------------- boca de cena
  const arch = archPoints(pro.halfWidth, pro.sideTop, pro.crown);
  const wall = new THREE.Shape();
  wall.moveTo(-hall.halfWidth, stage.pit);
  wall.lineTo(hall.halfWidth, stage.pit);
  wall.lineTo(hall.halfWidth, hall.ceiling);
  wall.lineTo(-hall.halfWidth, hall.ceiling);
  wall.closePath();
  const hole = new THREE.Path();
  // O vão desce um pouco abaixo do piso do palco: a face de baixo do recorte
  // fica escondida sob o piso (no mesmo y ela brigaria com ele no depth).
  hole.moveTo(arch[0][0], -3);
  for (let index = 1; index < arch.length; index += 1) hole.lineTo(arch[index][0], arch[index][1] === 0 ? -3 : arch[index][1]);
  hole.closePath();
  wall.holes.push(hole);
  const wallGeometry = new THREE.ExtrudeGeometry(wall, { depth: 8, bevelEnabled: false, curveSegments: 4 });
  wallGeometry.translate(0, 0, pro.z - 4);
  dark.add(wallGeometry, WINE);
  // Abaixo do vão (entre o piso do palco e a plateia) a parede vira a frente do palco.
  // Moldura de ouro do arco: dois filetes e o friso.
  for (const [offset, radius] of [[0, 2.4], [7, 1.1]] as const) {
    const path = new THREE.CurvePath<THREE.Vector3>();
    const outline = archPoints(pro.halfWidth + offset, pro.sideTop + offset * 0.4, pro.crown + offset, 48);
    for (let index = 1; index < outline.length; index += 1) {
      path.add(new THREE.LineCurve3(
        new THREE.Vector3(outline[index - 1][0], Math.max(0, outline[index - 1][1]), pro.z + 4.6),
        new THREE.Vector3(outline[index][0], Math.max(0, outline[index][1]), pro.z + 4.6),
      ));
    }
    gold.add(new THREE.TubeGeometry(path, 220, radius, 8, false), offset ? GOLD_PALE : GOLD);
  }
  // Fio de LED entre os dois filetes de ouro do arco.
  {
    const path = new THREE.CurvePath<THREE.Vector3>();
    const outline = archPoints(pro.halfWidth + 3.6, pro.sideTop + 1.4, pro.crown + 3.6, 48);
    for (let index = 1; index < outline.length; index += 1) {
      path.add(new THREE.LineCurve3(
        new THREE.Vector3(outline[index - 1][0], Math.max(0, outline[index - 1][1]), pro.z + 4.3),
        new THREE.Vector3(outline[index][0], Math.max(0, outline[index][1]), pro.z + 4.3),
      ));
    }
    led.add(new THREE.TubeGeometry(path, 220, 0.45, 5, false), LED, 1.6);
  }
  // Colunas de ouro caneladas com base e capitel, e a cornija.
  const fluted = new THREE.CylinderGeometry(7, 7.6, 1, 40, 1, true);
  {
    const position = fluted.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const angle = Math.atan2(z, x);
      const scale = 1 - 0.07 * Math.pow(0.5 + 0.5 * Math.cos(angle * 20), 2);
      position.setXYZ(index, x * scale, position.getY(index), z * scale);
    }
    fluted.computeVertexNormals();
  }
  const columnHeight = pro.sideTop + 8;
  for (const side of [-1, 1]) {
    const x = side * pro.columnX;
    const z = pro.z + 8;
    const shaft = fluted.clone();
    shaft.scale(1, columnHeight - 18, 1);
    shaft.translate(x, 9 + (columnHeight - 18) / 2, z);
    gold.add(shaft, GOLD);
    gold.box(19, 6, 19, x, 3, z, GOLD);
    gold.box(17, 3, 17, x, 7.5, z, GOLD_PALE);
    gold.box(18, 3, 18, x, columnHeight - 7.5, z, GOLD_PALE);
    gold.box(21, 6, 21, x, columnHeight - 3, z, GOLD);
    dark.box(23, -stage.pit, 23, x, stage.pit / 2, z, WINE_DARK);
  }
  fluted.dispose();
  gold.box(hall.halfWidth * 2, 5, 3, 0, columnHeight + 2.5, pro.z + 5.5, GOLD);
  gold.box(hall.halfWidth * 2, 1.4, 2, 0, columnHeight + 8, pro.z + 5, GOLD_PALE);
  // Medalhão no alto do arco: a bola dourada.
  {
    const ball = new THREE.SphereGeometry(9, 28, 18);
    ball.translate(0, pro.crown + 26, pro.z + 9);
    gold.add(ball, GOLD);
    const ring = new THREE.TorusGeometry(15, 1.3, 8, 48);
    ring.translate(0, pro.crown + 26, pro.z + 6);
    gold.add(ring, GOLD_PALE);
    glows.push({ position: [0, pro.crown + 26, pro.z + 4], color: "#ffbe5a", intensity: 0.5, size: 60, group: 1 });
  }

  // Bambolina (sanefa) e cortinas vermelhas amarradas.
  velvet.addColored(drape({
    xa: () => -pro.halfWidth,
    xb: () => pro.halfWidth,
    y0: pro.sideTop - 6,
    y1: pro.crown + 30,
    z: pro.z - 7,
    folds: 34,
    depth: 2.6,
    color: VELVET_RED,
    cols: 180,
    rows: 10,
    horizontal: 3,
    bottom: (u) => pro.sideTop - 4 + (pro.crown - pro.sideTop) * Math.sin(Math.PI * u) * 0.78 - 13 * Math.sin(Math.PI * ((u * 5) % 1)),
  }));
  for (const side of [-1, 1]) {
    // Borda de dentro: em cima perto do meio, aperta no laço e abre de novo embaixo.
    const inner = (v: number) => {
      const tie = 0.36;
      const width = v > tie ? 8 + 34 * Math.pow((v - tie) / (1 - tie), 0.7) : 8 + 14 * (1 - v / tie);
      return side * (pro.halfWidth - width);
    };
    const outer = () => side * (pro.halfWidth + 6);
    velvet.addColored(drape({
      xa: side < 0 ? outer : inner,
      xb: side < 0 ? inner : outer,
      y0: 0,
      y1: pro.crown + 20,
      z: pro.z - 9,
      folds: 9,
      depth: 3.4,
      color: VELVET_RED,
      cols: 54,
      rows: 26,
    }));
    // Laço dourado.
    gold.box(3, 5, 6, inner(0.36) + side * 1.5, (pro.crown + 20) * 0.36, pro.z - 6, GOLD, { yaw: 0.2 * side });
  }

  // ------------------------------------------------------------- púlpito
  {
    const l = layout.lectern;
    const parent = new THREE.Matrix4().compose(new THREE.Vector3(l.x, l.y, l.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.yaw), new THREE.Vector3(1, 1, 1));
    dark.box(15, 20, 6.5, 0, 10, 0, "#0b0b0e", { parent });
    dark.box(18, 1.4, 9, 0, 21, -0.6, "#121216", { parent, pitch: -0.24 });
    dark.box(18, 1.2, 9, 0, 0.6, 0, "#121216", { parent });
    gold.box(16, 0.9, 0.9, 0, 19.6, 3.6, GOLD, { parent });
    gold.box(16, 0.9, 0.9, 0, 1.6, 3.6, GOLD, { parent });
    for (const sx of [-7.6, 7.6]) gold.box(0.9, 18, 0.9, sx, 10.6, 3.4, GOLD, { parent });
    const emblem = new THREE.SphereGeometry(2.6, 20, 14);
    emblem.translate(0, 12, 3.6);
    gold.add(emblem, GOLD, 1, parent);
    const ring = new THREE.TorusGeometry(4, 0.4, 6, 32);
    ring.translate(0, 12, 3.5);
    led.add(ring, LED, 1.8, parent);
    const glowAt = new THREE.Vector3(0, 12, 5).applyMatrix4(parent);
    glows.push({ position: [glowAt.x, glowAt.y, glowAt.z], color: "#ffc066", intensity: 0.6, size: 18, group: 1 });
  }

  // ------------------------------------------------------- coluna do troféu
  {
    const p = layout.pedestal;
    gold.cylinder(8.6, 9, 1.6, p.x, p.y, p.z, GOLD, 32);
    dark.cylinder(6.6, 7.6, 1.4, p.x, p.y + 1.6, p.z, "#0b0b0e", 32);
    dark.cylinder(5.2, 6, p.top - p.y - 6.6, p.x, p.y + 3, p.z, "#0b0b0e", 32);
    gold.cylinder(6.4, 6.4, 1, p.x, p.top - 3.6, p.z, GOLD, 32);
    dark.cylinder(7.4, 6.8, 2.6, p.x, p.top - 2.6, p.z, "#0b0b0e", 32);
    const lip = new THREE.TorusGeometry(7.4, 0.35, 6, 40);
    lip.rotateX(Math.PI / 2);
    lip.translate(p.x, p.top, p.z);
    gold.add(lip, GOLD_PALE);
    const halo = new THREE.TorusGeometry(6.5, 0.28, 6, 40);
    halo.rotateX(Math.PI / 2);
    halo.translate(p.x, p.top - 4.2, p.z);
    led.add(halo, LED, 2.4);
  }

  // ------------------------------------------------------------------ sala
  const hallFront = stage.front;
  dark.box(hall.halfWidth * 2, 2, hall.backZ - hallFront, 0, stage.pit - 1, (hall.backZ + hallFront) / 2, "#1d0a0e");
  // Degraus das fileiras (cada fileira num patamar).
  hall.rows.forEach((row, index) => {
    if (index === 0 || row.y <= stage.pit + 0.1) return;
    const next = hall.rows[index + 1];
    const back = next ? (row.z + next.z) / 2 : hall.backZ;
    const front = row.z - layout.hall.rowDepth / 2;
    const height = row.y - stage.pit;
    dark.box(hall.halfWidth * 2 - 4, height, back - front, 0, stage.pit + height / 2, (front + back) / 2, "#1a090c");
    // Luz de degrau no corredor do meio.
    led.box(28, 0.3, 0.3, 0, row.y + 0.2, front + 0.2, "#ff9a4a", { intensity: 0.5 });
  });
  // Paredes laterais com pilastras de ouro e camarotes.
  for (const side of [-1, 1]) {
    const x = side * hall.halfWidth;
    dark.box(4, hall.ceiling - stage.pit, hall.backZ - pro.z, x + side * 2, (hall.ceiling + stage.pit) / 2, (hall.backZ + pro.z) / 2, WINE);
    for (let z = pro.z + 50; z < hall.backZ; z += 72) {
      gold.box(2.4, hall.ceiling - stage.pit, 3, x - side * 1.2, (hall.ceiling + stage.pit) / 2, z, GOLD);
    }
    for (const floorY of layout.balconies) {
      const depth = 34;
      const bx = x - side * depth / 2;
      const z0 = pro.z + 70;
      const z1 = hall.backZ - 30;
      dark.box(depth, 5, z1 - z0, bx, floorY - 2.5, (z0 + z1) / 2, "#1a080b");
      dark.box(2.4, 15, z1 - z0, x - side * depth, floorY + 7.5, (z0 + z1) / 2, WINE);
      gold.box(3.2, 1.4, z1 - z0, x - side * depth, floorY + 15.4, (z0 + z1) / 2, GOLD);
      gold.box(3, 0.8, z1 - z0, x - side * depth, floorY + 2, (z0 + z1) / 2, GOLD);
      // Arandelas na parede do camarote.
      for (let z = z0 + 28; z < z1; z += 56) {
        glows.push({ position: [x - side * 2.5, floorY + 34, z], color: "#ffb768", intensity: 1.4, size: 9, group: 0 });
        glows.push({ position: [x - side * depth - side * 0.5, floorY + 11, z + 12], color: "#ffcf96", intensity: 0.6, size: 4, group: 0 });
      }
    }
  }
  // Fundo da sala (cabine de luz) e teto.
  dark.box(hall.halfWidth * 2, hall.ceiling - stage.pit, 4, 0, (hall.ceiling + stage.pit) / 2, hall.backZ + 2, WINE_DARK);
  led.box(120, 18, 0.5, 0, 210, hall.backZ - 0.4, "#3a4a66", { intensity: 0.35 });
  {
    const ceiling = new THREE.PlaneGeometry(hall.halfWidth * 2, hall.backZ - pro.z);
    ceiling.rotateX(Math.PI / 2);
    ceiling.translate(0, hall.ceiling, (hall.backZ + pro.z) / 2);
    dark.add(ceiling, "#0b0709");
  }
  // Lustre: anéis de cristal (pontos de luz da sala).
  const lustre = { x: 0, y: hall.ceiling - 46, z: (pro.z + hall.backZ) / 2 };
  for (const [radius, count, drop] of [[34, 28, 0], [22, 18, -10], [11, 10, -18]] as const) {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      glows.push({ position: [lustre.x + Math.cos(angle) * radius, lustre.y + drop, lustre.z + Math.sin(angle) * radius], color: "#ffe2b0", intensity: 1.3, size: 5, group: 0, twinkle: 0.1 + index * 0.07 });
    }
  }
  gold.cylinder(1, 1, 46, lustre.x, lustre.y, lustre.z, GOLD, 8);
  {
    const ring = new THREE.TorusGeometry(34, 0.8, 6, 64);
    ring.rotateX(Math.PI / 2);
    ring.translate(lustre.x, lustre.y + 1.5, lustre.z);
    gold.add(ring, GOLD);
  }

  // ---------------------------------------------------------------- malhas
  const floorTexture1 = floorTexture(layout, options.performance ? 1024 : 2048);
  const floorGeometry = mergeGeometries([
    floorPlane(stage.left, stage.right, stage.back, stage.front, 0),
    floorPlane(riser.left, riser.right, riser.back, riser.front, riser.top),
    floorPlane(riser.left, riser.right, riser.front, riser.stepFront, riser.stepTop),
  ].map((geometry) => {
    const flat = geometry.toNonIndexed();
    geometry.dispose();
    return flat;
  }), false);
  floorGeometry.computeBoundingSphere();
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: "#17171c",
    roughness: 0.2,
    metalness: 0.2,
    emissive: new THREE.Color("#ffffff"),
    emissiveMap: floorTexture1,
    emissiveIntensity: 1.25,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.name = "gala-floor";
  floor.receiveShadow = true;

  const darkMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 });
  const goldMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 1, envMapIntensity: 0.85 });
  const ledMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const velvetMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uKeyDir: { value: new THREE.Vector3(0.15, 0.55, 1).normalize() },
      uKeyColor: { value: new THREE.Color("#ffd2a0") },
      uAmbient: { value: new THREE.Color("#140c10") },
      uSheen: { value: 0.35 },
      uFootY: { value: 0 },
    }]),
    vertexShader: VELVET_VERTEX,
    fragmentShader: VELVET_FRAGMENT,
    vertexColors: true,
    side: THREE.DoubleSide,
    fog: true,
  });

  const meshes: THREE.Mesh[] = [floor];
  const geometries: THREE.BufferGeometry[] = [floorGeometry];
  const materials: THREE.Material[] = [floorMaterial, darkMaterial, goldMaterial, ledMaterial, velvetMaterial];
  for (const [bag, material, name, receive] of [
    [dark, darkMaterial, "gala-structure", true],
    [gold, goldMaterial, "gala-gold", false],
    [led, ledMaterial, "gala-led", false],
    [velvet, velvetMaterial, "gala-velvet", false],
  ] as const) {
    const geometry = bag.build();
    if (!geometry) continue;
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = receive;
    meshes.push(mesh);
  }
  group.add(...meshes);

  return {
    group,
    floor,
    metals: [goldMaterial],
    glows,
    setLighting(house: number, stageLevel: number) {
      const uniforms = velvetMaterial.uniforms;
      (uniforms.uKeyColor.value as THREE.Color).setRGB(1, 0.78, 0.6).multiplyScalar(0.12 + 0.3 * stageLevel);
      (uniforms.uAmbient.value as THREE.Color).setRGB(0.03, 0.018, 0.022).multiplyScalar(0.4 + 1.6 * house);
      uniforms.uSheen.value = 0.12 + 0.3 * stageLevel;
    },
    textures: [floorTexture1],
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      floorTexture1.dispose();
    },
  };
}

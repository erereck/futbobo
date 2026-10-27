// Peças comuns da cidade da festa: sorteio, cores, o montador que funde tudo
// em poucas malhas e os dois materiais da cidade (sólidos e fachadas).
//
// Tudo que é parado vira UMA malha por material, já em coordenadas do mundo
// (matriz identidade): cada material custa um draw call, por mais prédios,
// postes e bandeirinhas que existam. Janelas, brilho noturno, bandeiras ao
// vento e luzes piscando saem do shader (atributos por vértice), sem textura.

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ------------------------------------------------------------- sorteio

export type Rand = () => number;

/** mulberry32: barato e com sequência estável por semente. */
export function makeRand(seed: number): Rand {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashText(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export const between = (rand: Rand, min: number, max: number) => min + (max - min) * rand();
export const pickOne = <T,>(rand: Rand, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/** Cor (espaço linear do three) a partir do hex, com ajuste de brilho/saturação/matiz em HSL. */
export function tone(hex: string, light = 0, saturation = 0, hue = 0) {
  const color = new THREE.Color(hex);
  if (light || saturation || hue) color.offsetHSL(hue, saturation, light);
  return color;
}

/** Cor de festa: a da seleção, mas clara e saturada o bastante para brilhar (azul-marinho vira azul). */
export function festive(hex: string) {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.s < 0.12) return color.setHSL(hsl.h, hsl.s, Math.max(0.82, hsl.l));
  return color.setHSL(hsl.h, Math.max(0.75, hsl.s), Math.min(0.62, Math.max(0.5, hsl.l)));
}

// ------------------------------------------------------------- moldes

export type Template = {
  /** Versão com normais de face (fachadas, que não são facetadas no shader). */
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array | null;
  count: number;
  /** Versão enxuta indexada, sem normal (o material sólido faceta pela derivada). */
  compact: { position: Float32Array; index: Uint32Array; count: number };
};

const templates = new Map<string, Template>();

function toTemplate(geometry: THREE.BufferGeometry, flat: boolean): Template {
  const bare = new THREE.BufferGeometry();
  bare.setAttribute("position", geometry.getAttribute("position").clone());
  if (geometry.index) bare.setIndex(geometry.index.clone());
  const merged = mergeVertices(bare, 1e-4);
  bare.dispose();
  const compactIndex = merged.index ? Uint32Array.from(merged.index.array as ArrayLike<number>) : Uint32Array.from({ length: merged.getAttribute("position").count }, (_, i) => i);
  const compact = { position: Float32Array.from(merged.getAttribute("position").array as ArrayLike<number>), index: compactIndex, count: merged.getAttribute("position").count };
  merged.dispose();

  let source = geometry;
  if (flat && source.index) {
    source = source.toNonIndexed();
    geometry.dispose();
  }
  if (flat || !source.getAttribute("normal")) source.computeVertexNormals();
  const position = Float32Array.from(source.getAttribute("position").array as ArrayLike<number>);
  const normal = Float32Array.from(source.getAttribute("normal").array as ArrayLike<number>);
  const index = source.index ? Uint32Array.from(source.index.array as ArrayLike<number>) : null;
  source.dispose();
  return { position, normal, index, count: position.length / 3, compact };
}

/** Molde guardado por nome: só números (nada na GPU), feito uma vez por sessão. */
export function shape(key: string, make: () => THREE.BufferGeometry, flat = false) {
  let template = templates.get(key);
  if (!template) {
    template = toTemplate(make(), flat);
    templates.set(key, template);
  }
  return template;
}

/** Telhado de duas águas: base 1×1 no chão, cumeeira ao longo de x na altura 1. */
function gableGeometry() {
  const p = [
    // águas
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    // oitões
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  return geometry;
}

/** Mansarda corrida: base 1×1, laje no alto (1) com 55% da profundidade, pontas retas ao longo de x. */
function mansardGeometry() {
  const t = 0.275;
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...b, ...c, ...a, ...c, ...d];
  const p = [
    ...quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, t], [-0.5, 1, t]),
    ...quad([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -t], [0.5, 1, -t]),
    ...quad([-0.5, 1, t], [0.5, 1, t], [0.5, 1, -t], [-0.5, 1, -t]),
    ...quad([0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -t], [0.5, 1, t]),
    ...quad([-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, t], [-0.5, 1, -t]),
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  return geometry;
}

/** Os moldes usados pela cidade (base no chão, pegada 1×1, altura 1, salvo dito). */
export const SHAPES = {
  box: () => shape("box", () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  /** Caixa centrada. */
  cube: () => shape("cube", () => new THREE.BoxGeometry(1, 1, 1)),
  cyl6: () => shape("cyl6", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1).translate(0, 0.5, 0)),
  cyl8: () => shape("cyl8", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).translate(0, 0.5, 0)),
  cyl16: () => shape("cyl16", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1).translate(0, 0.5, 0)),
  /** Tronco de cone com topo `top` (fração do raio da base). */
  taper: (top: number, sides = 8) => shape(`taper-${top}-${sides}`, () => new THREE.CylinderGeometry(0.5 * top, 0.5, 1, sides, 1).translate(0, 0.5, 0)),
  /** Pirâmide de base quadrada 1×1. */
  pyramid: () => shape("pyramid", () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), true),
  /** Tronco de pirâmide de base quadrada (telhado de quatro águas). */
  frustum: (top: number) =>
    shape(`frustum-${top}`, () => new THREE.CylinderGeometry(Math.SQRT1_2 * top, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), true),
  cone8: () => shape("cone8", () => new THREE.ConeGeometry(0.5, 1, 8, 1).translate(0, 0.5, 0)),
  /** Bola facetada de raio 1, centrada. */
  ico: (detail: number) => shape(`ico-${detail}`, () => new THREE.IcosahedronGeometry(1, detail)),
  /** Meia esfera (cúpula) de raio 1 com base no chão. */
  dome: () => shape("dome", () => new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
  /** Cuia: meia esfera de baixo, aberta para cima, borda na altura 1. */
  bowl: () => shape("bowl", () => new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, 1, 0)),
  gable: () => shape("gable", gableGeometry, true),
  mansard: () => shape("mansard", mansardGeometry, true),
  disc: () => shape("disc", () => new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2)),
};

// ------------------------------------------------------------ montador

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _local = new THREE.Vector3();
const _paint = new THREE.Color();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Matriz montada (compartilhada: use na hora). Giro em y (rumo), depois x e z. */
export function at(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  _euler.set(rx, ry, rz, "YXZ");
  _quat.setFromEuler(_euler);
  return _matrix.compose(_pos.set(x, y, z), _quat, _scale.set(sx, sy, sz));
}

/** Matriz que estica um molde de base no chão (altura 1) de `from` até `to`. */
export function along(from: THREE.Vector3, to: THREE.Vector3, width: number, depth = width, spin = 0) {
  const length = _v.subVectors(to, from).length();
  _quat.setFromUnitVectors(_up, _v.divideScalar(Math.max(length, 1e-6)));
  if (spin) _quat.multiply(_spin.setFromAxisAngle(_up, spin));
  return _matrix.compose(_pos.copy(from), _quat, _scale.set(width, length, depth));
}

/** Pinta vértice a vértice: muda `color` e `values` (já com os valores padrão). */
export type Painter = (world: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color, values: number[], local: THREE.Vector3) => void;

/** Float32Array que cresce dobrando (sem array de JS no meio: metade da memória na montagem). */
class Floats {
  data: Float32Array;
  length = 0;
  constructor(capacity: number) {
    this.data = new Float32Array(capacity);
  }
  reserve(extra: number) {
    if (this.length + extra <= this.data.length) return;
    let capacity = this.data.length * 2;
    while (capacity < this.length + extra) capacity *= 2;
    const next = new Float32Array(capacity);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  done() {
    return this.data.slice(0, this.length);
  }
}

/**
 * Junta moldes transformados numa geometria só. `extras` são os atributos
 * próprios do material (ex.: `aFx` vec4); `values` em cada chamada traz os
 * valores de todos eles em sequência. Sem `withNormal` (material facetado),
 * usa os moldes indexados enxutos e não guarda normal.
 */
export class MeshBuilder {
  private readonly position = new Floats(1 << 15);
  private readonly normal: Floats | null;
  private readonly color = new Floats(1 << 15);
  private readonly uv: Floats | null;
  private readonly extra: Floats[];
  private index = new Uint32Array(1 << 15);
  private indexLength = 0;
  private readonly stride: number;
  private readonly scratch: number[];

  constructor(
    private readonly extras: ReadonlyArray<{ name: string; size: number }>,
    withUv: boolean,
    withNormal = true,
  ) {
    this.stride = extras.reduce((sum, item) => sum + item.size, 0);
    this.scratch = new Array(this.stride).fill(0);
    this.normal = withNormal ? new Floats(1 << 15) : null;
    this.uv = withUv ? new Floats(1 << 14) : null;
    this.extra = extras.map((item) => new Floats(item.size << 13));
  }

  get vertexCount() {
    return this.position.length / 3;
  }

  private grow(vertices: number, indices: number) {
    this.position.reserve(vertices * 3);
    this.normal?.reserve(vertices * 3);
    this.color.reserve(vertices * 3);
    this.uv?.reserve(vertices * 2);
    this.extras.forEach((item, k) => this.extra[k].reserve(vertices * item.size));
    if (this.indexLength + indices > this.index.length) {
      let capacity = this.index.length * 2;
      while (capacity < this.indexLength + indices) capacity *= 2;
      const next = new Uint32Array(capacity);
      next.set(this.index.subarray(0, this.indexLength));
      this.index = next;
    }
  }

  private vertex(p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, values: readonly number[], u: number, v: number) {
    const pos = this.position;
    pos.data[pos.length++] = p.x;
    pos.data[pos.length++] = p.y;
    pos.data[pos.length++] = p.z;
    const normal = this.normal;
    if (normal) {
      normal.data[normal.length++] = n.x;
      normal.data[normal.length++] = n.y;
      normal.data[normal.length++] = n.z;
    }
    const color = this.color;
    color.data[color.length++] = c.r;
    color.data[color.length++] = c.g;
    color.data[color.length++] = c.b;
    const uv = this.uv;
    if (uv) {
      uv.data[uv.length++] = u;
      uv.data[uv.length++] = v;
    }
    let offset = 0;
    for (let k = 0; k < this.extra.length; k += 1) {
      const target = this.extra[k];
      const size = this.extras[k].size;
      for (let i = 0; i < size; i += 1) target.data[target.length++] = values[offset + i] ?? 0;
      offset += size;
    }
  }

  private indices(...values: number[]) {
    for (const value of values) this.index[this.indexLength++] = value;
  }

  /** Molde inteiro com a matriz `matrix`. Sem `uv` próprio, a fachada recebe (0, altura). */
  add(template: Template, matrix: THREE.Matrix4, color: THREE.Color, values: readonly number[], paint?: Painter) {
    const lean = !this.normal;
    const position = lean ? template.compact.position : template.position;
    const count = lean ? template.compact.count : template.count;
    const index = lean ? template.compact.index : template.index;
    this.grow(count, index ? index.length : count);
    if (!lean) _normalMatrix.getNormalMatrix(matrix);
    const base = this.vertexCount;
    for (let i = 0; i < count; i += 1) {
      _local.fromArray(position, i * 3);
      _v.copy(_local).applyMatrix4(matrix);
      if (!lean) _n.fromArray(template.normal, i * 3).applyMatrix3(_normalMatrix).normalize();
      if (paint) {
        _paint.copy(color);
        for (let k = 0; k < this.stride; k += 1) this.scratch[k] = values[k] ?? 0;
        paint(_v, _n, _paint, this.scratch, _local);
        this.vertex(_v, _n, _paint, this.scratch, 0, _v.y);
      } else this.vertex(_v, _n, color, values, 0, _v.y);
    }
    if (index) for (let i = 0; i < index.length; i += 1) this.index[this.indexLength++] = base + index[i];
    else for (let i = 0; i < count; i += 1) this.index[this.indexLength++] = base + i;
  }

  /** Quadrilátero a-b-c-d no sentido anti-horário visto da frente; uv = [u0, v0, u1, v1]. */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color, values: readonly number[], uv?: readonly [number, number, number, number]) {
    this.grow(4, 6);
    if (this.normal) _n.crossVectors(_ab.subVectors(b, a), _ac.subVectors(c, a)).normalize();
    const base = this.vertexCount;
    const u0 = uv ? uv[0] : 0;
    const v0 = uv ? uv[1] : a.y;
    const u1 = uv ? uv[2] : 0;
    const v1 = uv ? uv[3] : c.y;
    this.vertex(a, _n, color, values, u0, v0);
    this.vertex(b, _n, color, values, u1, v0);
    this.vertex(c, _n, color, values, u1, v1);
    this.vertex(d, _n, color, values, u0, v1);
    this.indices(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color, values: readonly number[], colorC?: THREE.Color, valuesC?: readonly number[]) {
    this.grow(3, 3);
    if (this.normal) _n.crossVectors(_ab.subVectors(b, a), _ac.subVectors(c, a)).normalize();
    const base = this.vertexCount;
    this.vertex(a, _n, color, values, 0, a.y);
    this.vertex(b, _n, color, values, 0, b.y);
    this.vertex(c, _n, colorC ?? color, valuesC ?? values, 0, c.y);
    this.indices(base, base + 1, base + 2);
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const count = this.vertexCount;
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position.done(), 3));
    if (this.normal) geometry.setAttribute("normal", new THREE.BufferAttribute(this.normal.done(), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.color.done(), 3));
    if (this.uv) geometry.setAttribute("uv", new THREE.BufferAttribute(this.uv.done(), 2));
    this.extras.forEach((item, k) => geometry.setAttribute(item.name, new THREE.BufferAttribute(this.extra[k].done(), item.size)));
    const index = this.index.subarray(0, this.indexLength);
    geometry.setIndex(new THREE.BufferAttribute(count > 65535 ? index.slice() : Uint16Array.from(index), 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

// --------------------------------------------------------- atributos

/** Valores do material sólido (`aFx`): brilho noturno, pisca (fase), balanço (m), escala da névoa. */
export const fx = (glow = 0, blink = 0, sway = 0, fog = 1) => [glow, blink, sway, fog];
export const FX_PLAIN = fx();

/** Estilos de janela da fachada (o shader desenha cada um). */
export const WIN = {
  none: 0,
  punched: 1,
  ribbon: 2,
  glass: 3,
  colonial: 4,
  european: 5,
  arcade: 6,
  balcony: 7,
  gothic: 8,
} as const;

/** Valores da fachada: estilo, largura da coluna, altura do andar, semente, escala da névoa. */
export const win = (style: number, column: number, floor: number, seed: number, fog = 1) => [style, column, floor, seed, fog];
export const WIN_ROOF = win(0, 1, 1, 0);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * Prédio-caixa com janelas: quatro paredes com uv em metros (u ao longo da
 * parede, v para cima a partir de `vBase`) e laje de cobertura lisa. Sem a
 * face de baixo. `rotY` gira em volta do centro da base.
 */
export function facadeBox(
  builder: MeshBuilder,
  x: number,
  y0: number,
  z: number,
  w: number,
  h: number,
  d: number,
  wall: THREE.Color,
  roof: THREE.Color | null,
  values: readonly number[],
  rotY = 0,
  vBase = 0,
) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const corner = (out: THREE.Vector3, lx: number, y: number, lz: number) => out.set(x + lx * cos + lz * sin, y, z - lx * sin + lz * cos);
  const hw = w / 2;
  const hd = d / 2;
  const y1 = y0 + h;
  const v0 = vBase;
  const v1 = vBase + h;
  // +z, +x, -z, -x (cada uma vista de fora, anti-horário)
  builder.quad(corner(_a, -hw, y0, hd), corner(_b, hw, y0, hd), corner(_c, hw, y1, hd), corner(_d, -hw, y1, hd), wall, values, [0, v0, w, v1]);
  builder.quad(corner(_a, hw, y0, hd), corner(_b, hw, y0, -hd), corner(_c, hw, y1, -hd), corner(_d, hw, y1, hd), wall, values, [0, v0, d, v1]);
  builder.quad(corner(_a, hw, y0, -hd), corner(_b, -hw, y0, -hd), corner(_c, -hw, y1, -hd), corner(_d, hw, y1, -hd), wall, values, [0, v0, w, v1]);
  builder.quad(corner(_a, -hw, y0, -hd), corner(_b, -hw, y0, hd), corner(_c, -hw, y1, hd), corner(_d, -hw, y1, -hd), wall, values, [0, v0, d, v1]);
  if (roof) builder.quad(corner(_a, -hw, y1, hd), corner(_b, hw, y1, hd), corner(_c, hw, y1, -hd), corner(_d, -hw, y1, -hd), roof, WIN_ROOF, [0, v1 + 60, 0, v1 + 60]);
}

// ----------------------------------------------------------- materiais

export type CityUniforms = {
  uTime: { value: number };
  /** Ganho do brilho próprio (postes, monumentos iluminados): 0 de dia, 1 à noite. */
  uGlow: { value: number };
  /** Quanto das janelas acende (0 de dia, 1 à noite). */
  uNight: { value: number };
  /** Fração das janelas acesas. */
  uLit: { value: number };
  uReflLow: { value: THREE.Color };
  uReflHigh: { value: THREE.Color };
  /** Poças de luz dos postes no chão: espaçamento, |z| dos postes, raio, intensidade. */
  uPool: { value: THREE.Vector4 };
  uPoolRange: { value: THREE.Vector2 };
  uPoolColor: { value: THREE.Color };
};

export function cityUniforms(): CityUniforms {
  return {
    uTime: { value: 0 },
    uGlow: { value: 0 },
    uNight: { value: 0 },
    uLit: { value: 0 },
    uReflLow: { value: new THREE.Color() },
    uReflHigh: { value: new THREE.Color() },
    uPool: { value: new THREE.Vector4(30, 12, 8, 0) },
    uPoolRange: { value: new THREE.Vector2(0, 1) },
    uPoolColor: { value: new THREE.Color("#ffb46a") },
  };
}

// Névoa com escala por vértice: marcos distantes (montanha, pirâmides, Cristo)
// atravessam a névoa como silhueta em vez de sumir.
const FOG_SCALED = /* glsl */ `
#ifdef USE_FOG
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth * vCityFog);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;

/**
 * Lambert facetado com cor por vértice e `aFx`: brilho noturno, luz piscando,
 * balanço ao vento (bandeiras, bandeirinhas, folhas) e névoa por vértice.
 * Um programa para chão, ruas, postes, árvores e todos os monumentos.
 */
export function solidMaterial(uniforms: CityUniforms) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uGlow = uniforms.uGlow;
    shader.uniforms.uPool = uniforms.uPool;
    shader.uniforms.uPoolRange = uniforms.uPoolRange;
    shader.uniforms.uPoolColor = uniforms.uPoolColor;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 aFx;\nuniform float uTime;\nvarying vec4 vFx;\nvarying vec3 vCityPos;\nvarying float vCityFog;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vFx = aFx;
        vCityFog = aFx.w;
        if (aFx.z > 0.0) {
          vec3 sw = position;
          transformed += aFx.z * vec3(
            sin(uTime * 2.4 + sw.x * 0.31 + sw.z * 0.17),
            0.35 * sin(uTime * 3.3 + sw.x * 0.53 + sw.y),
            0.6 * cos(uTime * 1.9 + sw.z * 0.29 + sw.x * 0.11));
        }
        vCityPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uGlow;
        uniform vec4 uPool;
        uniform vec2 uPoolRange;
        uniform vec3 uPoolColor;
        varying vec4 vFx;
        varying vec3 vCityPos;
        varying float vCityFog;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          float glow = vFx.x;
          if (vFx.y > 0.0) glow *= 0.08 + 0.92 * step(0.6, fract(uTime * 0.85 + vFx.y));
          totalEmissiveRadiance += diffuseColor.rgb * glow * uGlow;
          if (uPool.w > 0.0 && vCityPos.y < 0.5) {
            float lx = mod(vCityPos.x - uPoolRange.x, uPool.x) - 0.5 * uPool.x;
            float lz = abs(vCityPos.z) - uPool.y;
            float inside = step(uPoolRange.x - 12.0, vCityPos.x) * step(vCityPos.x, uPoolRange.y + 12.0);
            float pool = exp(-(lx * lx + lz * lz) / (uPool.z * uPool.z));
            totalEmissiveRadiance += uPoolColor * diffuseColor.rgb * (uPool.w * inside * pool);
          }
        }`,
      )
      .replace("#include <fog_fragment>", FOG_SCALED);
  };
  material.customProgramCacheKey = () => "parade-city-solid";
  return material;
}

/**
 * Fachadas: Lambert com janelas desenhadas no shader a partir do uv em metros
 * (sem textura nenhuma). De dia o vidro reflete o céu; à noite parte das
 * janelas acende (sorteio por janela). De longe o desenho vira a média, sem
 * cintilar.
 */
export function facadeMaterial(uniforms: CityUniforms) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uniforms.uNight;
    shader.uniforms.uLit = uniforms.uLit;
    shader.uniforms.uReflLow = uniforms.uReflLow;
    shader.uniforms.uReflHigh = uniforms.uReflHigh;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 aWin;\nattribute float aFog;\nvarying vec2 vFacade;\nvarying vec4 vWin;\nvarying float vCityFog;",
      )
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvFacade = uv;\nvWin = aWin;\nvCityFog = aFog;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uNight;
        uniform float uLit;
        uniform vec3 uReflLow;
        uniform vec3 uReflHigh;
        varying vec2 vFacade;
        varying vec4 vWin;
        varying float vCityFog;
        float cityHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float cityRect(vec2 f, vec4 r, vec2 aa) {
          vec2 lo = smoothstep(r.xy - aa, r.xy + aa, f);
          vec2 hi = 1.0 - smoothstep(r.zw - aa, r.zw + aa, f);
          return lo.x * lo.y * hi.x * hi.y;
        }`,
      )
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${FACADE_WINDOWS}`)
      .replace("#include <fog_fragment>", FOG_SCALED);
  };
  material.customProgramCacheKey = () => "parade-city-facade";
  return material;
}

const FACADE_WINDOWS = /* glsl */ `
{
  float style = floor(vWin.x + 0.5);
  vec3 wall = diffuseColor.rgb;
  // Pé do prédio lavado pela luz da rua à noite.
  totalEmissiveRadiance += wall * (uNight * 0.2 * exp(-max(vFacade.y, 0.0) * 0.2));
  if (style > 0.5) {
    vec2 cellSize = vWin.yz;
    vec2 g = vFacade / cellSize;
    vec2 cell = floor(g);
    vec2 f = g - cell;
    vec2 fw = max(fwidth(g), vec2(0.0001));
    // 1 perto, 0 quando a janela já tem poucos pixels: aí vale a média.
    float near = 1.0 - smoothstep(0.18, 0.55, max(fw.x, fw.y));
    vec2 aa = fw * 0.75;
    float seed = vWin.w;
    float rnd = cityHash(cell + seed * 7.31);
    float rnd2 = cityHash(cell.yx * 1.37 + seed * 3.17 + 11.0);
    float ground = step(cell.y, 0.5);
    vec4 r = vec4(0.22, 0.26, 0.78, 0.84);
    float refl = 0.6;
    float trim = 0.0;
    float open = 0.0;
    float arcade = 0.0;
    if (style < 1.5) {
      r = mix(r, vec4(0.06, 0.04, 0.94, 0.8), ground);
    } else if (style < 2.5) {
      r = mix(vec4(-0.1, 0.34, 1.1, 0.86), vec4(-0.1, 0.0, 1.1, 0.9), ground);
      refl = 0.85;
    } else if (style < 3.5) {
      r = vec4(0.035, 0.05, 0.965, 0.97);
      refl = 1.0;
      rnd = mix(rnd, cityHash(vec2(cell.y, seed)), 0.75);
    } else if (style < 4.5) {
      r = mix(vec4(0.3, 0.16, 0.7, 0.76), vec4(0.3, 0.0, 0.7, 0.74), ground);
      trim = 1.0;
      refl = 0.25;
    } else if (style < 5.5) {
      r = mix(vec4(0.29, 0.1, 0.71, 0.76), vec4(0.12, 0.0, 0.88, 0.8), ground);
      trim = 0.55;
      refl = 0.45;
    } else if (style < 6.5) {
      refl = 0.0;
      if (cell.y > 2.5) {
        r = vec4(0.4, 0.35, 0.6, 0.62);
      } else {
        arcade = 1.0;
        vec2 q = vec2((f.x - 0.5) / 0.32, (f.y - 0.55) * cellSize.y / (cellSize.x * 0.32));
        float arch = (1.0 - smoothstep(0.85, 1.15, length(q))) * step(0.0, q.y);
        open = max(cityRect(f, vec4(0.18, -0.1, 0.82, 0.55), aa), arch);
      }
    } else if (style < 7.5) {
      r = mix(vec4(0.06, 0.22, 0.94, 0.86), vec4(0.04, 0.0, 0.96, 0.82), ground);
      refl = 0.4;
      float slab = 1.0 - smoothstep(0.16 - aa.y, 0.16 + aa.y, f.y);
      wall = mix(wall * 0.8, wall * 1.1, mix(0.16, slab, near));
    } else {
      r = vec4(0.36, 0.08, 0.64, 0.92);
      refl = 0.2;
    }
    float window = cityRect(f, r, aa) * (1.0 - arcade);
    float area = clamp(min(r.z, 1.0) - max(r.x, 0.0), 0.0, 1.0) * (r.w - r.y) * (1.0 - arcade);
    window = mix(area, window, near);
    open = mix(0.3 * arcade, open, near);
    float frame = trim * near * clamp(cityRect(f, r + vec4(-0.07, -0.05, 0.07, 0.05), aa) - window, 0.0, 1.0);
    vec3 glass = wall * 0.1 + vec3(0.018, 0.022, 0.03);
    vec3 col = mix(wall, glass, window);
    col = mix(col, vec3(0.86, 0.84, 0.8), frame);
    col = mix(col, wall * 0.16, open);
    diffuseColor.rgb = col;
    // Reflexo do céu no vidro (emissivo: não depende do sol).
    float facing = 1.0 - abs(dot(normalize(vViewPosition), normal));
    vec3 sky = mix(uReflLow, uReflHigh, clamp(f.y * 0.45 + rnd2 * 0.55, 0.0, 1.0));
    float reflAmt = refl * (0.3 + 0.7 * facing * facing) * (0.7 + 0.6 * rnd2) * (1.0 - 0.85 * uNight);
    float lit = step(rnd, uLit + ground * 0.45);
    lit = mix(uLit, lit, near);
    vec3 lamp = mix(vec3(1.0, 0.68, 0.34), vec3(1.0, 0.86, 0.62), rnd2);
    lamp = mix(lamp, vec3(0.6, 0.78, 1.0), step(0.86, rnd2));
    float shine = lit * uNight * (0.55 + 0.9 * rnd2);
    // Luz de dentro quente e contida: forte demais vira um tabuleiro branco e preto.
    totalEmissiveRadiance += window * (sky * reflAmt + lamp * shine * 1.05) + open * uNight * vec3(1.0, 0.6, 0.28) * 0.9;
  }
}
`;

// Ferramentas da festa do título: sorteio com semente, montador de malha
// mesclada (várias peças num draw call só) e trechos de shader comuns.
//
// Os shaders próprios (pontos, LEDs, fumaça, papel picado) leem as MESMAS luzes
// da cena que os materiais Lambert/Standard: com `lights: true` o three envia
// os uniforms, e `PARADE_LIGHT_PARS` refaz só a parte difusa (hemisfério +
// direcional), sem sombra. Assim tudo escurece junto à noite sem o diretor
// precisar avisar ninguém.

import * as THREE from "three";

/** Sorteio determinístico (mulberry32): a mesma semente dá a mesma festa. */
export function rng(seed: number) {
  let state = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Random = ReturnType<typeof rng>;

export function pick<T>(random: Random, list: readonly T[]): T {
  return list[Math.floor(random() * list.length) % list.length];
}

/** Cor com brilho/saturação mexidos (variação de tecido, desbotado, sombra). */
export function shade(hex: THREE.ColorRepresentation, lightness: number, saturation = 0) {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s + saturation, 0, 1), THREE.MathUtils.clamp(hsl.l + lightness, 0, 1));
  return color;
}

export function luminanceOf(hex: THREE.ColorRepresentation) {
  const color = new THREE.Color(hex);
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

/** Duas cores parecidas demais (texto some no fundo, listra some na camisa). */
export function tooClose(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return Math.abs(ca.r - cb.r) + Math.abs(ca.g - cb.g) + Math.abs(ca.b - cb.b) < 0.35;
}

// ------------------------------------------------------- malha mesclada

type Extra = { size: number; data: number[]; value: number[] };

/**
 * Junta caixas, cilindros e quads numa BufferGeometry só, com cor por vértice
 * e atributos extras (acabamento, pulso do alto-falante, modo do LED...). Cada
 * peça usa a `matrix` atual, então dá para girar/posicionar grupos inteiros.
 */
export class GeoBuilder {
  readonly color = new THREE.Color(1, 1, 1);
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];
  private readonly extras = new Map<string, Extra>();
  private readonly matrix = new THREE.Matrix4();
  private readonly normalMatrix = new THREE.Matrix3();
  private identity = true;
  private readonly v = new THREE.Vector3();
  private readonly n = new THREE.Vector3();

  constructor(extras: Record<string, number> = {}) {
    for (const [name, size] of Object.entries(extras)) this.extras.set(name, { size, data: [], value: new Array(size).fill(0) });
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  setColor(hex: THREE.ColorRepresentation) {
    this.color.set(hex);
    return this;
  }

  set(name: string, ...values: number[]) {
    const extra = this.extras.get(name);
    if (!extra) throw new Error(`atributo extra desconhecido: ${name}`);
    for (let index = 0; index < extra.size; index += 1) extra.value[index] = values[index] ?? 0;
    return this;
  }

  setTransform(matrix?: THREE.Matrix4) {
    if (matrix) {
      this.matrix.copy(matrix);
      this.normalMatrix.getNormalMatrix(matrix);
      this.identity = false;
    } else {
      this.matrix.identity();
      this.normalMatrix.identity();
      this.identity = true;
    }
    return this;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u = 0, v = 0) {
    this.v.set(x, y, z);
    this.n.set(nx, ny, nz);
    if (!this.identity) {
      this.v.applyMatrix4(this.matrix);
      this.n.applyMatrix3(this.normalMatrix).normalize();
    }
    this.positions.push(this.v.x, this.v.y, this.v.z);
    this.normals.push(this.n.x, this.n.y, this.n.z);
    this.colors.push(this.color.r, this.color.g, this.color.b);
    this.uvs.push(u, v);
    for (const extra of this.extras.values()) for (let index = 0; index < extra.size; index += 1) extra.data.push(extra.value[index]);
    return this.positions.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number) {
    this.indices.push(a, b, c);
  }

  /** Quad a-b-c-d (anti-horário visto de frente) com normal da face. */
  quad(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, d: THREE.Vector3Like, normal: THREE.Vector3Like, uv: [number, number, number, number] = [0, 0, 1, 1]) {
    const [u0, v0, u1, v1] = uv;
    const ia = this.vertex(a.x, a.y, a.z, normal.x, normal.y, normal.z, u0, v0);
    const ib = this.vertex(b.x, b.y, b.z, normal.x, normal.y, normal.z, u1, v0);
    const ic = this.vertex(c.x, c.y, c.z, normal.x, normal.y, normal.z, u1, v1);
    const id = this.vertex(d.x, d.y, d.z, normal.x, normal.y, normal.z, u0, v1);
    this.indices.push(ia, ib, ic, ia, ic, id);
  }

  /**
   * Caixa centrada em (cx, cy, cz). `skip` tira faces que nunca aparecem:
   * t (topo), b (baixo), f (+z), k (-z), l (-x), r (+x).
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, skip = "") {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const P = (x: number, y: number, z: number) => ({ x: cx + x, y: cy + y, z: cz + z });
    if (!skip.includes("f")) this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), { x: 0, y: 0, z: 1 });
    if (!skip.includes("k")) this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), { x: 0, y: 0, z: -1 });
    if (!skip.includes("r")) this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), { x: 1, y: 0, z: 0 });
    if (!skip.includes("l")) this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), { x: -1, y: 0, z: 0 });
    if (!skip.includes("t")) this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), { x: 0, y: 1, z: 0 });
    if (!skip.includes("b")) this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), { x: 0, y: -1, z: 0 });
  }

  /** Cilindro em pé (eixo y), com tampas opcionais. */
  cylinder(cx: number, cy: number, cz: number, radiusTop: number, radiusBottom: number, height: number, segments: number, caps = true) {
    const y0 = cy - height / 2;
    const y1 = cy + height / 2;
    const slope = (radiusBottom - radiusTop) / height;
    const ring: number[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const length = Math.hypot(1, slope);
      ring.push(this.vertex(cx + cos * radiusBottom, y0, cz + sin * radiusBottom, cos / length, slope / length, sin / length, index / segments, 0));
      ring.push(this.vertex(cx + cos * radiusTop, y1, cz + sin * radiusTop, cos / length, slope / length, sin / length, index / segments, 1));
    }
    for (let index = 0; index < segments; index += 1) {
      const a = ring[index * 2];
      const b = ring[index * 2 + 1];
      const c = ring[index * 2 + 2];
      const d = ring[index * 2 + 3];
      this.indices.push(a, b, d, a, d, c);
    }
    if (!caps) return;
    for (const [y, radius, up] of [[y1, radiusTop, 1], [y0, radiusBottom, -1]] as const) {
      if (radius <= 0) continue;
      const center = this.vertex(cx, y, cz, 0, up, 0, 0.5, 0.5);
      const first = this.vertexCount;
      for (let index = 0; index <= segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        this.vertex(cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius, 0, up, 0);
      }
      for (let index = 0; index < segments; index += 1) {
        if (up > 0) this.indices.push(center, first + index + 1, first + index);
        else this.indices.push(center, first + index, first + index + 1);
      }
    }
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    for (const [name, extra] of this.extras) geometry.setAttribute(name, new THREE.Float32BufferAttribute(extra.data, extra.size));
    geometry.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// ------------------------------------------------------------- shaders

/**
 * Luz difusa igual à do Lambert do three (hemisfério + direcionais, sem
 * sombra), para os shaders próprios. Normal em espaço de vista.
 */
export const PARADE_LIGHT_PARS = /* glsl */ `
uniform vec3 ambientLightColor;
#if NUM_DIR_LIGHTS > 0
struct DirectionalLight { vec3 direction; vec3 color; };
uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
struct HemisphereLight { vec3 direction; vec3 skyColor; vec3 groundColor; };
uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
#endif
vec3 paradeIrradiance(vec3 viewNormal) {
  vec3 irradiance = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
    float w = 0.5 * dot(viewNormal, hemisphereLights[i].direction) + 0.5;
    irradiance += mix(hemisphereLights[i].groundColor, hemisphereLights[i].skyColor, w);
  }
  #endif
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    irradiance += directionalLights[i].color * max(dot(viewNormal, directionalLights[i].direction), 0.0);
  }
  #endif
  return irradiance * 0.3183099;
}
`;

/** Uniforms de luz + névoa para um ShaderMaterial com `lights: true, fog: true`. */
export function litUniforms<T extends Record<string, THREE.IUniform>>(own: T): T & Record<string, THREE.IUniform> {
  return { ...THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog]), ...own };
}

/** Fim de todo fragment shader próprio: tom, espaço de cor e névoa como os materiais do three. */
export const PARADE_FRAGMENT_END = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
`;

/** Tamanho do buffer de desenho (px) para pontos com tamanho em metros. */
export function trackDrawingBuffer(object: THREE.Object3D, uniform: THREE.IUniform<number>) {
  const size = new THREE.Vector2();
  object.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(size);
    uniform.value = size.y;
  };
}

/**
 * Névoa e tamanho de tela para materiais aditivos (luz não pode misturar com
 * a cor da névoa: ela some com a distância). `fade` recebe (perto, longe).
 */
export function trackFogFade(object: THREE.Object3D, fade: THREE.IUniform<THREE.Vector2>, screen?: THREE.IUniform<number>) {
  const size = new THREE.Vector2();
  object.onBeforeRender = (renderer, scene) => {
    if (screen) {
      renderer.getDrawingBufferSize(size);
      screen.value = size.y;
    }
    const fog = scene.fog;
    if (fog && (fog as THREE.Fog).isFog) fade.value.set((fog as THREE.Fog).near, (fog as THREE.Fog).far);
    else if (fog && (fog as THREE.FogExp2).isFogExp2) fade.value.set(0, 2.2 / Math.max((fog as THREE.FogExp2).density, 1e-5));
    else fade.value.set(1e5, 2e5);
  };
}

/** Desfaz geometrias e materiais de um grupo (texturas vão à parte). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}

/** Ajusta o tamanho da fonte para o texto caber em `maxWidth`. */
export function fitFont(context: CanvasRenderingContext2D, text: string, weight: string, size: number, maxWidth: number, family = "'Arial Black', 'Helvetica Neue', Arial, sans-serif") {
  let current = size;
  context.font = `${weight} ${current}px ${family}`;
  while (current > 8 && context.measureText(text).width > maxWidth) {
    current -= 2;
    context.font = `${weight} ${current}px ${family}`;
  }
  return current;
}

/** Estrela de 5 pontas (cartazes, painel de LED). */
export function drawStar(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const r = index % 2 === 0 ? radius : radius * 0.42;
    if (index === 0) context.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    else context.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  context.closePath();
  context.fill();
}

export const ORDINAL_SHOUTS = ["", "CAMPEÃO", "BI", "TRI", "TETRA", "PENTA", "HEXA", "HEPTA", "OCTA"];

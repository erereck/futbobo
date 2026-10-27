// Efeitos do modo 3D: poeira, grama, estrelas de impacto, ondas no gramado,
// brilhos da festa e o holofote do autor do gol.
//
// Tudo sai de quatro malhas fixas criadas no construtor: dois pools de
// partículas instanciadas (um com mistura normal, outro aditivo), um conjunto
// de anéis no chão e o holofote. No pior caso são 4 draw calls; parado, zero.
// Nada projeta sombra e nada aqui lê ou escreve o motor: é só desenho.

import * as THREE from "three";
import { FIELD } from "../engine";

export type EffectsOptions = { surface: "grass" | "futsal"; reducedMotion?: boolean; lowPower?: boolean };

// ------------------------------------------------------------- atlas

const CELL_PUFF = 0;
const CELL_STAR = 1;
const CELL_RING = 2;
const CELL_CHIP = 3;
const CELL_BLADE = 4;
const CELL_GLINT = 5;
const CELL_SKID = 6;
const CELL_DISC = 7;
const ATLAS_CELL = 64;

/** NaN vira 0: um NaN que chegasse ao balde de fichas travaria os efeitos para sempre. */
function clamp01(value: number) {
  return !(value > 0) ? 0 : value > 1 ? 1 : value;
}

/** smoothstep que também aceita borda invertida (edge0 > edge1 = descendo). */
function smooth(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Raio afinando até a ponta: base das estrelas. */
function ray(along: number, across: number, length: number, width: number) {
  const t = Math.abs(along) / length;
  if (t >= 1) return 0;
  const half = width * (1 - t);
  return smooth(half, 0, Math.abs(across)) * Math.pow(1 - t, 1.3);
}

/**
 * Forma de cada célula em (u, v) ∈ [-1, 1], v para cima (= +y local do quad).
 * Tudo zera antes de r≈0.95 para o mipmap não sangrar entre células.
 */
function cellAlpha(cell: number, u: number, v: number, grain: number) {
  const r = Math.hypot(u, v);
  const d1 = (u + v) * Math.SQRT1_2;
  const d2 = (u - v) * Math.SQRT1_2;
  switch (cell) {
    case CELL_PUFF: {
      // Borda manchada: nuvem de poeira, não bolinha perfeita.
      const angle = Math.atan2(v, u);
      const edge = 0.8 + 0.08 * Math.sin(3 * angle + 0.7) + 0.05 * Math.sin(5 * angle + 2.1);
      const body = 1 - smooth(0.05, edge, r);
      return body * (0.8 + 0.2 * Math.sin(7 * u + 3) * Math.sin(6 * v + 1));
    }
    case CELL_STAR:
      return ray(v, u, 0.95, 0.11) + ray(u, v, 0.95, 0.11)
        + 0.5 * (ray(d1, d2, 0.5, 0.07) + ray(d2, d1, 0.5, 0.07))
        + Math.exp(-(r * r) / 0.02) + 0.3 * Math.exp(-(r * r) / 0.1);
    case CELL_RING:
      return Math.exp(-(((r - 0.7) / 0.11) ** 2));
    case CELL_CHIP:
      // Risco com a cabeça (+v) mais clara: alinhado à velocidade vira faísca.
      return smooth(0.34, 0.14, Math.abs(u)) * smooth(0.94, 0.7, Math.abs(v)) * (0.4 + 0.6 * (v * 0.5 + 0.5));
    case CELL_BLADE: {
      // Folha afinando da base (-v) à ponta (+v), levemente curva.
      const t = (v + 0.9) / 1.82;
      if (t < 0 || t > 1) return 0;
      const half = 0.36 * Math.pow(1 - t, 0.7) + 0.02;
      return smooth(half, half * 0.5, Math.abs(u - 0.18 * t * t)) * smooth(0, 0.06, t);
    }
    case CELL_GLINT:
      return ray(v, u, 0.95, 0.06) + ray(u, v, 0.95, 0.06)
        + 0.6 * (ray(d1, d2, 0.42, 0.05) + ray(d2, d1, 0.42, 0.05))
        + Math.exp(-(r * r) / 0.012) + 0.45 * Math.exp(-(r * r) / 0.06);
    case CELL_SKID: {
      // Duas faixas paralelas (os dois joelhos) com grão: esticadas viram risco.
      const stripe = Math.max(smooth(0.2, 0.06, Math.abs(u + 0.4)), smooth(0.2, 0.06, Math.abs(u - 0.4)));
      return stripe * smooth(0.96, 0.55, Math.abs(v)) * (0.6 + 0.4 * grain);
    }
    case CELL_DISC:
      return Math.exp(-r * r * 4) * smooth(0.98, 0.7, r);
    default:
      return 0;
  }
}

/**
 * Atlas 4×2 de máscaras num canal só (R8, 32 KB). Calculado pixel a pixel,
 * sem canvas: o mesmo resultado em qualquer WebView.
 */
function createAtlas() {
  const width = ATLAS_CELL * 4;
  const height = ATLAS_CELL * 2;
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j += 1) {
    // Linha 0 da textura é a de baixo (flipY desligado): célula da linha de cima do atlas = j alto.
    const row = 1 - Math.floor(j / ATLAS_CELL);
    const v = (((j % ATLAS_CELL) + 0.5) / ATLAS_CELL) * 2 - 1;
    for (let i = 0; i < width; i += 1) {
      const cell = Math.floor(i / ATLAS_CELL) + row * 4;
      const u = (((i % ATLAS_CELL) + 0.5) / ATLAS_CELL) * 2 - 1;
      const noise = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
      const grain = noise - Math.floor(noise);
      data[j * width + i] = Math.round(clamp01(cellAlpha(cell, u, v, grain)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// ------------------------------------------------------------ shaders

// Aditivo não pode "misturar" com a cor da névoa (somaria cinza): só apaga.
const ADDITIVE_FOG = /* glsl */ `
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor.a *= 1.0 - fogFactor;
  #endif
`;

// GLSL só com ASCII (alguns drivers recusam acento até em comentário).
// iA = x, y, z, rotação; iB = largura, altura, célula, modo (0 billboard,
// 1 deitado no chão, 2 em pé no plano XY); iC = rgb, alfa.
// Billboard: o quad é puxado um pouco para a câmera, senão a nuvem corta reto
// no gramado. Deitado: o mesmo giro de rotation.x = -PI/2 (+y local vira -Z).
const POOL_VERTEX = /* glsl */ `
  attribute vec4 iA;
  attribute vec4 iB;
  attribute vec4 iC;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    float c = cos(iA.w);
    float s = sin(iA.w);
    vec2 p = position.xy * iB.xy;
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    vec4 mvPosition;
    if (iB.w < 0.5) {
      mvPosition = modelViewMatrix * vec4(iA.xyz, 1.0);
      mvPosition.xy += p;
      mvPosition.z += min(0.35 * max(iB.x, iB.y), -mvPosition.z * 0.25);
    } else if (iB.w < 1.5) {
      mvPosition = modelViewMatrix * vec4(iA.xyz + vec3(p.x, 0.0, -p.y), 1.0);
    } else {
      mvPosition = modelViewMatrix * vec4(iA.xyz + vec3(p.x, p.y, 0.0), 1.0);
    }
    gl_Position = projectionMatrix * mvPosition;
    float cell = floor(iB.z + 0.5);
    float row = floor(cell / 4.0 + 0.01);
    float col = cell - row * 4.0;
    vUv = (uv + vec2(col, 1.0 - row)) * vec2(0.25, 0.5);
    vColor = iC;
    #include <fog_vertex>
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(vColor.rgb, vColor.a * texture2D(map, vUv).r);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #ifdef ADDITIVE
      ${ADDITIVE_FOG}
    #else
      #include <fog_fragment>
    #endif
  }
`;

// rA = x, z, raio, espessura; rB = rgb, alfa. position.y diz se o vértice é
// da borda de dentro (0) ou de fora (1). No fragment, a frente da onda é nítida
// e o rastro some macio para dentro.
const RING_VERTEX = /* glsl */ `
  attribute vec4 rA;
  attribute vec4 rB;
  uniform float uY;
  varying float vSide;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    float radius = max(0.0, rA.z + (position.y - 0.5) * rA.w);
    vec3 world = vec3(rA.x + position.x * radius, uY, rA.y + position.z * radius);
    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vSide = position.y;
    vColor = rB;
    #include <fog_vertex>
  }
`;

const RING_FRAGMENT = /* glsl */ `
  varying float vSide;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    float band = smoothstep(0.0, 0.8, vSide) * (1.0 - smoothstep(0.8, 1.0, vSide));
    gl_FragColor = vec4(vColor.rgb, vColor.a * band);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    ${ADDITIVE_FOG}
  }
`;

// aKind = 0 poça no chão, 1 cone; aT = raio 0..1 na poça, altura 0..1 no cone.
// A malha só translada, então a normal do objeto já é a do mundo.
// Cone como feixe de volume: mais denso no miolo (de frente) e sumindo na
// silhueta. Com a câmera alta o feixe viraria uma faixa clara atravessando o
// campo, então ele só aparece nos planos baixos; de cima fica só a poça.
const SPOT_VERTEX = /* glsl */ `
  attribute float aKind;
  attribute float aT;
  varying float vKind;
  varying float vT;
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normal;
    vKind = aKind;
    vT = aT;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const SPOT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPool;
  uniform float uBeam;
  varying float vKind;
  varying float vT;
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_fragment>
  void main() {
    float alpha;
    if (vKind < 0.5) {
      alpha = uPool * (1.0 - smoothstep(0.6, 1.0, vT));
    } else {
      vec3 toCamera = normalize(cameraPosition - vWorld);
      float facing = abs(dot(normalize(vNormal), toCamera));
      // smoothstep com borda invertida e indefinido no GLSL ES: alguns drivers erram.
      float lowView = 1.0 - smoothstep(0.6, 0.95, toCamera.y);
      alpha = uBeam * lowView * pow(facing, 1.6) * pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.05, vT);
    }
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    ${ADDITIVE_FOG}
  }
`;

function fogUniforms() {
  // merge clona: cada material tem os próprios uniforms de névoa.
  return THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
}

function uploadRange(attribute: THREE.BufferAttribute, count: number) {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count);
  attribute.needsUpdate = true;
}

// --------------------------------------------------------- partículas

/** Partícula a nascer: um objeto só, reaproveitado, para não alocar por disparo. */
class Spawn {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  life = 1;
  /** Largura no começo e no fim (no "pop", o fim é o pico). */
  size0 = 1;
  size1 = 1;
  /** Altura ÷ largura do quad. */
  aspect = 1;
  pop = false;
  rot = 0;
  spin = 0;
  r0 = 1;
  g0 = 1;
  b0 = 1;
  r1 = 1;
  g1 = 1;
  b1 = 1;
  alpha = 1;
  /** Fração da vida para acender. */
  fadeIn = 0;
  /** Expoente do apagar: 1 linear, alto segura e some no fim. */
  fadeOut = 1;
  gravity = 0;
  drag = 0;
  /** Quique no chão; negativo = atravessa (não testa o chão). */
  bounce = -1;
  cell = 0;
  flat = 0;
  /** >0: alinha o quad à velocidade na tela e estica com ela. */
  streak = 0;

  reset() {
    this.x = this.y = this.z = 0;
    this.vx = this.vy = this.vz = 0;
    this.life = 1;
    this.size0 = this.size1 = 1;
    this.aspect = 1;
    this.pop = false;
    this.rot = Math.random() * Math.PI * 2;
    this.spin = 0;
    this.r0 = this.g0 = this.b0 = this.r1 = this.g1 = this.b1 = 1;
    this.alpha = 1;
    this.fadeIn = 0;
    this.fadeOut = 1;
    this.gravity = 0;
    this.drag = 0;
    this.bounce = -1;
    this.cell = 0;
    this.flat = 0;
    this.streak = 0;
    return this;
  }

  color(color: THREE.Color, intensity = 1) {
    this.r0 = this.r1 = color.r * intensity;
    this.g0 = this.g1 = color.g * intensity;
    this.b0 = this.b1 = color.b * intensity;
    return this;
  }

  fadeTo(color: THREE.Color, intensity = 1) {
    this.r1 = color.r * intensity;
    this.g1 = color.g * intensity;
    this.b1 = color.b * intensity;
    return this;
  }
}

// Campos de cada partícula num Float32Array só: matar é um copyWithin.
const P_X = 0;
const P_Y = 1;
const P_Z = 2;
const P_VX = 3;
const P_VY = 4;
const P_VZ = 5;
const P_AGE = 6;
const P_LIFE = 7;
const P_S0 = 8;
const P_S1 = 9;
const P_ASPECT = 10;
const P_ROT = 11;
const P_SPIN = 12;
const P_R0 = 13;
const P_G0 = 14;
const P_B0 = 15;
const P_R1 = 16;
const P_G1 = 17;
const P_B1 = 18;
const P_ALPHA = 19;
const P_FADE_IN = 20;
const P_FADE_OUT = 21;
const P_GRAVITY = 22;
const P_DRAG = 23;
const P_BOUNCE = 24;
const P_CELL = 25;
const P_FLAT = 26;
const P_STREAK = 27;
const P_POP = 28;
const P_STRIDE = 29;

const FLOOR_Y = 0.5;
/** Teto do billboard: acima disso é só overdraw (o gargalo real no Android). */
const MAX_BILLBOARD = 60;

/**
 * Pool de quads instanciados num draw call. Vivas ficam compactadas no começo;
 * cheio, a nova toma o lugar da que está mais perto de morrer.
 */
class FxPool {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly attrA: THREE.InstancedBufferAttribute;
  private readonly attrB: THREE.InstancedBufferAttribute;
  private readonly attrC: THREE.InstancedBufferAttribute;
  private readonly data: Float32Array;
  private readonly slots: number;
  private alive = 0;
  private written = 0;

  constructor(private readonly capacity: number, extra: number, atlas: THREE.Texture, additive: boolean, renderOrder: number) {
    this.slots = capacity + extra;
    this.data = new Float32Array(capacity * P_STRIDE);
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setIndex(plane.getIndex());
    this.geometry.setAttribute("position", plane.getAttribute("position"));
    this.geometry.setAttribute("uv", plane.getAttribute("uv"));
    const attribute = () => new THREE.InstancedBufferAttribute(new Float32Array(this.slots * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.attrA = attribute();
    this.attrB = attribute();
    this.attrC = attribute();
    this.geometry.setAttribute("iA", this.attrA);
    this.geometry.setAttribute("iB", this.attrB);
    this.geometry.setAttribute("iC", this.attrC);
    // Vazio = 0 instâncias: o programa compila no primeiro quadro (sem engasgo no
    // primeiro chute) e o three pula o draw enquanto não houver nada.
    this.geometry.instanceCount = 0;

    const uniforms = fogUniforms();
    uniforms.map = { value: atlas };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: POOL_VERTEX,
      fragmentShader: POOL_FRAGMENT,
      defines: additive ? { ADDITIVE: "" } : {},
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
      // Dupla face sem a segunda passada que o three faz para transparentes.
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    // A esfera de limite é a do quad unitário na origem: sem isso o pool some da tela.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
  }

  spawn(spec: Spawn) {
    let index = this.alive;
    if (index < this.capacity) this.alive += 1;
    else index = this.closestToDeath();
    const d = this.data;
    const o = index * P_STRIDE;
    d[o + P_X] = spec.x;
    d[o + P_Y] = spec.y;
    d[o + P_Z] = spec.z;
    d[o + P_VX] = spec.vx;
    d[o + P_VY] = spec.vy;
    d[o + P_VZ] = spec.vz;
    d[o + P_AGE] = 0;
    d[o + P_LIFE] = Math.max(0.02, spec.life);
    d[o + P_S0] = spec.size0;
    d[o + P_S1] = spec.size1;
    d[o + P_ASPECT] = spec.aspect;
    d[o + P_ROT] = spec.rot;
    d[o + P_SPIN] = spec.spin;
    d[o + P_R0] = spec.r0;
    d[o + P_G0] = spec.g0;
    d[o + P_B0] = spec.b0;
    d[o + P_R1] = spec.r1;
    d[o + P_G1] = spec.g1;
    d[o + P_B1] = spec.b1;
    d[o + P_ALPHA] = spec.alpha;
    d[o + P_FADE_IN] = spec.fadeIn;
    d[o + P_FADE_OUT] = spec.fadeOut;
    d[o + P_GRAVITY] = spec.gravity;
    d[o + P_DRAG] = spec.drag;
    d[o + P_BOUNCE] = spec.bounce;
    d[o + P_CELL] = spec.cell;
    d[o + P_FLAT] = spec.flat;
    d[o + P_STREAK] = spec.streak;
    d[o + P_POP] = spec.pop ? 1 : 0;
  }

  private closestToDeath() {
    const d = this.data;
    let best = 0;
    let bestRatio = -1;
    for (let index = 0; index < this.alive; index += 1) {
      const o = index * P_STRIDE;
      const ratio = d[o + P_AGE] / d[o + P_LIFE];
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = index;
      }
    }
    return best;
  }

  step(dt: number) {
    if (dt <= 0) return;
    const d = this.data;
    let index = 0;
    while (index < this.alive) {
      const o = index * P_STRIDE;
      const age = d[o + P_AGE] + dt;
      if (age >= d[o + P_LIFE]) {
        this.alive -= 1;
        if (index !== this.alive) d.copyWithin(o, this.alive * P_STRIDE, this.alive * P_STRIDE + P_STRIDE);
        continue;
      }
      d[o + P_AGE] = age;
      let vx = d[o + P_VX];
      let vy = d[o + P_VY] - d[o + P_GRAVITY] * dt;
      let vz = d[o + P_VZ];
      const drag = d[o + P_DRAG];
      if (drag > 0) {
        const keep = 1 / (1 + drag * dt);
        vx *= keep;
        vy *= keep;
        vz *= keep;
      }
      let y = d[o + P_Y] + vy * dt;
      if (d[o + P_BOUNCE] >= 0 && y < FLOOR_Y) {
        y = FLOOR_Y;
        if (vy < 0) {
          // Quique curto e atrito: a lasca assenta em vez de deslizar para sempre.
          vy = -vy * d[o + P_BOUNCE];
          if (vy < 14) vy = 0;
          vx *= 0.55;
          vz *= 0.55;
          d[o + P_SPIN] *= 0.4;
        }
      }
      d[o + P_X] += vx * dt;
      d[o + P_Y] = y;
      d[o + P_Z] += vz * dt;
      d[o + P_VX] = vx;
      d[o + P_VY] = vy;
      d[o + P_VZ] = vz;
      if (d[o + P_STREAK] === 0) d[o + P_ROT] += d[o + P_SPIN] * dt;
      index += 1;
    }
  }

  begin() {
    this.written = 0;
  }

  /** Quad avulso (marcas no gramado) escrito antes das partículas: fica por baixo. */
  quad(x: number, y: number, z: number, rot: number, width: number, height: number, cell: number, flat: number, r: number, g: number, b: number, a: number) {
    if (this.written >= this.slots) return;
    const k = this.written * 4;
    const A = this.attrA.array as Float32Array;
    const B = this.attrB.array as Float32Array;
    const C = this.attrC.array as Float32Array;
    A[k] = x;
    A[k + 1] = y;
    A[k + 2] = z;
    A[k + 3] = rot;
    B[k] = width;
    B[k + 1] = height;
    B[k + 2] = cell;
    B[k + 3] = flat;
    C[k] = r;
    C[k + 1] = g;
    C[k + 2] = b;
    C[k + 3] = a;
    this.written += 1;
  }

  /** right/up: eixos da câmera no mundo, para alinhar faíscas ao movimento na tela. */
  writeParticles(rx: number, ry: number, rz: number, ux: number, uy: number, uz: number) {
    const d = this.data;
    for (let index = 0; index < this.alive; index += 1) {
      const o = index * P_STRIDE;
      const t = d[o + P_AGE] / d[o + P_LIFE];
      const s0 = d[o + P_S0];
      const s1 = d[o + P_S1];
      let size: number;
      if (d[o + P_POP] > 0) {
        // Estala até o pico em 1/4 da vida e murcha no resto.
        if (t < 0.25) {
          const q = t / 0.25;
          size = s0 + (s1 - s0) * (1 - (1 - q) * (1 - q));
        } else {
          size = s1 + (s0 - s1) * Math.pow((t - 0.25) / 0.75, 1.4);
        }
      } else {
        size = s0 + (s1 - s0) * (1 - (1 - t) * (1 - t));
      }
      const fadeIn = d[o + P_FADE_IN];
      let alpha = d[o + P_ALPHA] * (1 - Math.pow(t, d[o + P_FADE_OUT]));
      if (fadeIn > 0 && t < fadeIn) alpha *= t / fadeIn;
      let width = size;
      let height = size * d[o + P_ASPECT];
      let rot = d[o + P_ROT];
      const streak = d[o + P_STREAK];
      if (streak > 0) {
        const vx = d[o + P_VX];
        const vy = d[o + P_VY];
        const vz = d[o + P_VZ];
        const screenX = vx * rx + vy * ry + vz * rz;
        const screenY = vx * ux + vy * uy + vz * uz;
        const speed = Math.hypot(screenX, screenY);
        if (speed > 1) {
          // +y local = (-sen, cos) depois do giro: aponta a cabeça para onde vai.
          rot = Math.atan2(-screenX, screenY);
          d[o + P_ROT] = rot;
          height *= 1 + Math.min(2.5, (streak * speed) / 120);
        }
      }
      const flat = d[o + P_FLAT];
      if (flat === 0) {
        if (width > MAX_BILLBOARD) width = MAX_BILLBOARD;
        if (height > MAX_BILLBOARD) height = MAX_BILLBOARD;
      }
      this.quad(
        d[o + P_X], d[o + P_Y], d[o + P_Z], rot, width, height, d[o + P_CELL], flat,
        d[o + P_R0] + (d[o + P_R1] - d[o + P_R0]) * t,
        d[o + P_G0] + (d[o + P_G1] - d[o + P_G0]) * t,
        d[o + P_B0] + (d[o + P_B1] - d[o + P_B0]) * t,
        alpha,
      );
    }
  }

  end() {
    const count = this.written;
    this.geometry.instanceCount = count;
    if (count === 0) return;
    // Sobe só o trecho em uso (sem range, o three mandaria o buffer inteiro).
    uploadRange(this.attrA, count * 4);
    uploadRange(this.attrB, count * 4);
    uploadRange(this.attrC, count * 4);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// --------------------------------------------------------------- anéis

const R_X = 0;
const R_Z = 1;
const R_AGE = 2;
const R_LIFE = 3;
const R_DELAY = 4;
const R_R0 = 5;
const R_R1 = 6;
const R_W0 = 7;
const R_W1 = 8;
const R_RED = 9;
const R_GREEN = 10;
const R_BLUE = 11;
const R_ALPHA = 12;
const R_STRIDE = 13;
const RING_Y = 0.4;

/**
 * Anéis no chão (onda do gol, impacto, aterrissagem). Faixa de verdade em vez
 * de quad com textura: um anel de 70 de raio num quad cobriria a tela de overdraw.
 */
class RingSet {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly attrA: THREE.InstancedBufferAttribute;
  private readonly attrB: THREE.InstancedBufferAttribute;
  private readonly data: Float32Array;
  private count = 0;

  constructor(private readonly capacity: number, segments: number) {
    this.data = new Float32Array(capacity * R_STRIDE);
    const positions = new Float32Array((segments + 1) * 2 * 3);
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      positions.set([c, 0, s, c, 1, s], index * 6);
    }
    const indices: number[] = [];
    for (let index = 0; index < segments; index += 1) {
      const inner = index * 2;
      const outer = inner + 1;
      // Ordem anti-horária vista de cima: face da frente para o céu.
      indices.push(inner, inner + 2, outer, outer, inner + 2, outer + 2);
    }
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setIndex(indices);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.attrA = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.attrB = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("rA", this.attrA);
    this.geometry.setAttribute("rB", this.attrB);
    this.geometry.instanceCount = 0;
    const uniforms = fogUniforms();
    uniforms.uY = { value: RING_Y };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.matrixAutoUpdate = false;
  }

  add(x: number, z: number, r0: number, r1: number, w0: number, w1: number, life: number, delay: number, color: THREE.Color, intensity: number, alpha: number) {
    let index = this.count;
    if (index < this.capacity) this.count += 1;
    else {
      // Cheio: troca o mais adiantado (anel ainda no atraso tem razão negativa).
      let best = -Infinity;
      index = 0;
      for (let i = 0; i < this.capacity; i += 1) {
        const o = i * R_STRIDE;
        const ratio = (this.data[o + R_AGE] - this.data[o + R_DELAY]) / this.data[o + R_LIFE];
        if (ratio > best) {
          best = ratio;
          index = i;
        }
      }
    }
    const d = this.data;
    const o = index * R_STRIDE;
    d[o + R_X] = x;
    d[o + R_Z] = z;
    d[o + R_AGE] = 0;
    d[o + R_LIFE] = Math.max(0.05, life);
    d[o + R_DELAY] = delay;
    d[o + R_R0] = r0;
    d[o + R_R1] = r1;
    d[o + R_W0] = w0;
    d[o + R_W1] = w1;
    d[o + R_RED] = color.r * intensity;
    d[o + R_GREEN] = color.g * intensity;
    d[o + R_BLUE] = color.b * intensity;
    d[o + R_ALPHA] = alpha;
  }

  update(dt: number) {
    const d = this.data;
    const A = this.attrA.array as Float32Array;
    const B = this.attrB.array as Float32Array;
    let written = 0;
    let index = 0;
    while (index < this.count) {
      const o = index * R_STRIDE;
      const age = d[o + R_AGE] + dt;
      const local = age - d[o + R_DELAY];
      if (local >= d[o + R_LIFE]) {
        this.count -= 1;
        if (index !== this.count) d.copyWithin(o, this.count * R_STRIDE, this.count * R_STRIDE + R_STRIDE);
        continue;
      }
      d[o + R_AGE] = age;
      index += 1;
      if (local < 0) continue;
      const t = local / d[o + R_LIFE];
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);
      const k = written * 4;
      A[k] = d[o + R_X];
      A[k + 1] = d[o + R_Z];
      A[k + 2] = d[o + R_R0] + (d[o + R_R1] - d[o + R_R0]) * ease;
      A[k + 3] = d[o + R_W0] + (d[o + R_W1] - d[o + R_W0]) * t;
      B[k] = d[o + R_RED];
      B[k + 1] = d[o + R_GREEN];
      B[k + 2] = d[o + R_BLUE];
      B[k + 3] = d[o + R_ALPHA] * Math.pow(1 - t, 1.5) * Math.min(1, t / 0.05);
      written += 1;
    }
    this.geometry.instanceCount = written;
    if (written === 0) return;
    uploadRange(this.attrA, written * 4);
    uploadRange(this.attrB, written * 4);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ------------------------------------------------------------ holofote

const SPOT_SEGMENTS = 32;
const SPOT_POOL_RADIUS = 42;
const SPOT_BEAM_RADIUS = 28;
const SPOT_BEAM_TOP = 3;
const SPOT_BEAM_HEIGHT = 300;
const SPOT_POOL = 0.3;
const SPOT_BEAM = 0.13;

/**
 * Poça de luz quente no gramado + cone translúcido vindo do alto, numa malha
 * só (um draw call). Sem luz de verdade: uma SpotLight entraria no cálculo de
 * todo pixel de todo material e recompilaria tudo ao ligar.
 */
class Spotlight {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private amount = 0;
  private wanted = 0;
  private targetX = 0;
  private targetZ = 0;

  constructor(withBeam: boolean) {
    const positions: number[] = [];
    const normals: number[] = [];
    const kinds: number[] = [];
    const ts: number[] = [];
    const indices: number[] = [];
    const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number, kind: number, t: number) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      kinds.push(kind);
      ts.push(t);
      return kinds.length - 1;
    };
    // Poça: leque com centro, levemente acima do gramado.
    const center = vertex(0, 0.5, 0, 0, 1, 0, 0, 0);
    for (let index = 0; index <= SPOT_SEGMENTS; index += 1) {
      const angle = (index / SPOT_SEGMENTS) * Math.PI * 2;
      vertex(Math.cos(angle) * SPOT_POOL_RADIUS, 0.5, Math.sin(angle) * SPOT_POOL_RADIUS, 0, 1, 0, 0, 1);
    }
    for (let index = 0; index < SPOT_SEGMENTS; index += 1) indices.push(center, center + 2 + index, center + 1 + index);
    if (withBeam) {
      // Tronco de cone (topo com raio pequeno evita a normal indefinida no ápice).
      const slope = (SPOT_BEAM_RADIUS - SPOT_BEAM_TOP) / SPOT_BEAM_HEIGHT;
      const first = kinds.length;
      for (let index = 0; index <= SPOT_SEGMENTS; index += 1) {
        const angle = (index / SPOT_SEGMENTS) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const length = Math.hypot(1, slope);
        vertex(c * SPOT_BEAM_RADIUS, 0, s * SPOT_BEAM_RADIUS, c / length, slope / length, s / length, 1, 0);
        vertex(c * SPOT_BEAM_TOP, SPOT_BEAM_HEIGHT, s * SPOT_BEAM_TOP, c / length, slope / length, s / length, 1, 1);
      }
      for (let index = 0; index < SPOT_SEGMENTS; index += 1) {
        const bottom = first + index * 2;
        const top = bottom + 1;
        // Face da frente para fora do cone.
        indices.push(bottom, top, bottom + 2, bottom + 2, top, top + 2);
      }
    }
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setIndex(indices);
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    this.geometry.setAttribute("aKind", new THREE.Float32BufferAttribute(kinds, 1));
    this.geometry.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
    // 0/1 instância liga e desliga sem trocar .visible (programa já compilado).
    this.geometry.instanceCount = 0;
    const uniforms = fogUniforms();
    uniforms.uColor = { value: new THREE.Color("#fff2d0") };
    uniforms.uPool = { value: 0 };
    uniforms.uBeam = { value: 0 };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SPOT_VERTEX,
      fragmentShader: SPOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
  }

  set(point: { x: number; z: number } | null) {
    // Ponto inválido apaga: NaN na posição só sairia depois de um apagar completo.
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      this.wanted = 0;
      return;
    }
    this.wanted = 1;
    this.targetX = point.x;
    this.targetZ = point.z;
    // Acendendo do zero: nasce em cima de quem comemora, sem deslizar do último lugar.
    if (this.amount < 0.02) this.mesh.position.set(point.x, 0, point.z);
  }

  update(dt: number) {
    if (dt > 0) {
      if (this.amount < this.wanted) this.amount = Math.min(this.wanted, this.amount + dt / 0.35);
      else if (this.amount > this.wanted) this.amount = Math.max(this.wanted, this.amount - dt / 0.4);
      const follow = 1 - Math.exp(-12 * dt);
      this.mesh.position.x += (this.targetX - this.mesh.position.x) * follow;
      this.mesh.position.z += (this.targetZ - this.mesh.position.z) * follow;
    }
    const eased = this.amount * this.amount * (3 - 2 * this.amount);
    this.material.uniforms.uPool.value = SPOT_POOL * eased;
    this.material.uniforms.uBeam.value = SPOT_BEAM * eased;
    this.geometry.instanceCount = eased > 0.002 ? 1 : 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ------------------------------------------------------------- efeitos

const MAX_MARKS = 6;
const M_X0 = 0;
const M_Z0 = 1;
const M_X1 = 2;
const M_Z1 = 3;
const M_DX = 4;
const M_DZ = 5;
const M_AGE = 6;
const M_ALIVE = 7;
const M_STRIDE = 8;
const MARK_LIFE = 4;
const MARK_MAX_LENGTH = 90;

/** Luz média que o gramado recebe: lasca sem iluminação precisa disso para não sair escura. */
const LIT = 1.1;
/** Intervalo mínimo entre clarões de impacto: choque em cadeia não pisca acima de 2.5 Hz. */
const FLASH_GAP = 0.4;
const WHITE = new THREE.Color(1, 1, 1);

export class Effects {
  readonly group = new THREE.Group();
  private readonly atlas: THREE.DataTexture;
  private readonly soft: FxPool;
  private readonly glow: FxPool;
  private readonly rings: RingSet;
  private readonly spot: Spotlight;
  private readonly spec = new Spawn();
  private readonly futsal: boolean;
  private readonly reduced: boolean;
  private readonly low: boolean;
  /** Multiplicador de quantidade (metade no celular fraco). */
  private readonly amount: number;

  // Teto global: balde de fichas. Rajadas cabem; spam (bola colada no pé) não.
  private readonly rate: number;
  private readonly burst: number;
  private tokens: number;

  private clock = 0;
  private lastKickX = 0;
  private lastKickZ = 0;
  private lastKickT = -1;
  private lastKickS = 0;
  private lastFlash = -1;
  private slideChips = 0;
  private slidePuffs = 0;
  private readonly marks = new Float32Array(MAX_MARKS * M_STRIDE);

  private readonly grass: THREE.Color[];
  private readonly dustColor: THREE.Color;
  private readonly lightStreak = new THREE.Color("#dfe8f2");
  private readonly markColor: THREE.Color;
  private readonly markAlpha: number;
  private readonly fiber = new THREE.Color("#f4f6f2");
  private readonly hot = new THREE.Color("#fff6e0");
  private readonly colorCache = new Map<string, THREE.Color>();
  private readonly tintA = new THREE.Color();
  private readonly tintB = new THREE.Color();

  constructor(options: EffectsOptions) {
    this.futsal = options.surface === "futsal";
    this.reduced = Boolean(options.reducedMotion);
    this.low = Boolean(options.lowPower);
    this.amount = this.low ? 0.5 : 1;
    this.rate = this.low ? 200 : 400;
    this.burst = this.low ? 75 : 150;
    this.tokens = this.burst;

    this.grass = ["#3d7a35", "#5c9a45", "#2e5e2a"].map((hex) => new THREE.Color(hex));
    this.dustColor = new THREE.Color(this.futsal ? "#dfe8f2" : "#d9e4c0");
    this.markColor = new THREE.Color(this.futsal ? "#dfe8f2" : "#24401f");
    this.markAlpha = this.futsal ? 0.2 : 0.4;

    this.atlas = createAtlas();
    // Normal por baixo (poeira, grama, marcas), aditivo por cima (estrelas, brilhos).
    this.soft = new FxPool(this.low ? 128 : 256, MAX_MARKS, this.atlas, false, 4);
    this.glow = new FxPool(this.low ? 192 : 384, 0, this.atlas, true, 8);
    this.rings = new RingSet(this.low ? 8 : 16, this.low ? 48 : 64);
    this.spot = new Spotlight(!this.low);
    this.group.add(this.rings.mesh, this.soft.mesh, this.spot.mesh, this.glow.mesh);
  }

  // ------------------------------------------------------------ util

  private count(value: number) {
    return Math.max(1, Math.round(value * this.amount));
  }

  /** Quantas partículas cabem agora no teto global. */
  private take(wanted: number) {
    if (!(wanted > 0)) return 0;
    const allowed = Math.max(0, Math.min(wanted, Math.floor(this.tokens)));
    this.tokens -= allowed;
    return allowed;
  }

  /** Libera um clarão (estrela + halo) se o último já tem FLASH_GAP de idade. */
  private flashReady() {
    if (this.lastFlash >= 0 && this.clock - this.lastFlash < FLASH_GAP) return false;
    this.lastFlash = this.clock;
    return true;
  }

  /** Sprite principal de um evento (estrela, halo): pode furar um pouco o teto. */
  private takeOne() {
    if (this.tokens < -20) return false;
    this.tokens -= 1;
    return true;
  }

  /** Cor do time clareada; cor escura demais ganha luz extra (no aditivo ela sumiria). */
  private tint(hex: string, whiten: number, out: THREE.Color) {
    let base = this.colorCache.get(hex);
    if (!base) {
      if (this.colorCache.size > 24) this.colorCache.clear();
      base = new THREE.Color(hex);
      this.colorCache.set(hex, base);
    }
    out.copy(base);
    const lum = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
    return out.lerp(WHITE, Math.min(1, whiten + (lum < 0.06 ? 0.35 : 0)));
  }

  private random(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  /** Nuvenzinhas de poeira (pool normal). dirX/dirZ = 0 espalha em roda. */
  private dust(x: number, z: number, wanted: number, strength: number, dirX: number, dirZ: number) {
    const n = this.take(wanted);
    const radial = dirX === 0 && dirZ === 0;
    const base = Math.atan2(dirZ, dirX);
    for (let index = 0; index < n; index += 1) {
      const angle = radial ? ((index + Math.random() * 0.6) / Math.max(1, n)) * Math.PI * 2 : base + this.random(-0.9, 0.9);
      const speed = this.random(8, 20) + 12 * strength;
      const s = this.spec.reset();
      s.cell = CELL_PUFF;
      s.x = x + Math.cos(angle) * 3 + this.random(-1.5, 1.5);
      s.z = z + Math.sin(angle) * 3 + this.random(-1.5, 1.5);
      s.y = this.random(2, 3.5);
      s.vx = Math.cos(angle) * speed;
      s.vz = Math.sin(angle) * speed;
      s.vy = this.random(5, 12);
      s.gravity = -4;
      s.drag = 2.6;
      s.life = this.random(0.45, 0.75) + 0.2 * strength;
      s.size0 = 3 + 2 * strength;
      s.size1 = this.random(9, 13) + 10 * strength;
      s.spin = this.random(-0.8, 0.8);
      s.color(this.dustColor, LIT);
      s.alpha = (0.2 + 0.14 * strength) * (this.reduced ? 0.7 : 1) * (this.futsal ? 0.6 : 1);
      s.fadeIn = 0.12;
      s.fadeOut = 1.2;
      this.soft.spawn(s);
    }
  }

  // ----------------------------------------------------------- API

  /** Toque na bola / arranque / aterrissagem: poeira + tufos de grama (no futsal, riscos claros) na direção (dirX,dirZ) se houver. strength 0..1. */
  kickPuff(x: number, z: number, strength: number, dirX?: number, dirZ?: number) {
    const s = clamp01(strength);
    // Bola encostada no pé dispara vários "toques" seguidos no mesmo lugar.
    if (this.lastKickT >= 0 && this.clock - this.lastKickT < 0.07 && Math.abs(x - this.lastKickX) + Math.abs(z - this.lastKickZ) < 10 && s <= this.lastKickS + 0.25) return;
    this.lastKickT = this.clock;
    this.lastKickX = x;
    this.lastKickZ = z;
    this.lastKickS = s;

    let dx = 0;
    let dz = 0;
    if (dirX !== undefined && dirZ !== undefined) {
      const length = Math.hypot(dirX, dirZ);
      if (length > 1e-4) {
        dx = dirX / length;
        dz = dirZ / length;
      }
    }
    const directed = dx !== 0 || dz !== 0;
    this.dust(x, z, this.reduced ? 2 : this.count((directed ? 2 : 3) + 3 * s), s, dx, dz);
    if (this.reduced) return;

    const base = Math.atan2(dz, dx);
    if (this.futsal) {
      // Quadra não solta grama: riscos claros rentes ao piso.
      const n = this.take(this.count(3 + 3 * s));
      for (let index = 0; index < n; index += 1) {
        const angle = directed ? base + this.random(-0.5, 0.5) : Math.random() * Math.PI * 2;
        const speed = this.random(70, 130) * (0.6 + 0.5 * s);
        const p = this.spec.reset();
        p.cell = CELL_CHIP;
        p.streak = 1;
        p.x = x + Math.cos(angle) * 2;
        p.z = z + Math.sin(angle) * 2;
        p.y = 1;
        p.vx = Math.cos(angle) * speed;
        p.vz = Math.sin(angle) * speed;
        p.vy = this.random(10, 26);
        p.gravity = 220;
        p.bounce = 0.15;
        p.life = this.random(0.25, 0.38);
        p.size0 = p.size1 = 1.6;
        p.aspect = 2.5;
        p.color(this.lightStreak, 1.1);
        p.alpha = 0.85;
        p.fadeOut = 1.5;
        this.soft.spawn(p);
      }
      if (directed && s > 0.35 && this.takeOne()) {
        const p = this.spec.reset();
        p.cell = CELL_CHIP;
        p.flat = 1;
        p.x = x;
        p.y = 0.3;
        p.z = z;
        p.rot = Math.atan2(-dx, -dz);
        p.size0 = p.size1 = 2.2;
        p.aspect = 6;
        p.life = 0.7;
        p.color(this.lightStreak, 1);
        p.alpha = 0.25;
        p.fadeIn = 0.05;
        this.soft.spawn(p);
      }
    } else {
      const n = this.take(this.count(directed ? 4 + 9 * s : 2 + 5 * s));
      for (let index = 0; index < n; index += 1) {
        const angle = directed ? base + this.random(-0.55, 0.55) : Math.random() * Math.PI * 2;
        const speed = this.random(25, 70) * (0.55 + 0.6 * s);
        const p = this.spec.reset();
        p.cell = CELL_BLADE;
        p.x = x + Math.cos(angle) * 2;
        p.z = z + Math.sin(angle) * 2;
        p.y = 1.2;
        p.vx = Math.cos(angle) * speed;
        p.vz = Math.sin(angle) * speed;
        p.vy = this.random(40, 95) + 30 * s;
        p.gravity = 320;
        p.drag = 0.6;
        p.bounce = 0.2;
        p.life = this.random(0.55, 0.9);
        p.size0 = p.size1 = this.random(2.6, 3.6);
        p.aspect = 1.6;
        p.spin = this.random(-11, 11);
        p.color(this.grass[index % 3], LIT);
        p.fadeOut = 4;
        this.soft.spawn(p);
      }
    }
    // Chute forte (ou queda de um pulo alto) marca o chão com um anel curto.
    if (s > 0.6) {
      this.rings.add(x, z, 3, 10 + 14 * s, 4, 1.5, 0.3, 0, this.hot, 1, 0.22 + 0.25 * s);
    }
  }

  /** Carrinho de joelho: chamado a cada quadro enquanto desliza; spray de grama para a frente + marca no gramado que some em ~4s (máx. 6 marcas). */
  slideTrail(x: number, z: number, dirX: number, dirZ: number, dt: number) {
    if (!(dt > 0)) return;
    const length = Math.hypot(dirX, dirZ);
    if (!(length > 1e-4)) return;
    const dx = dirX / length;
    const dz = dirZ / length;
    // Joelhos ficam um pouco atrás do centro do corpo.
    this.extendMark(x - dx * 3, z - dz * 3, dx, dz);

    this.slidePuffs += (this.reduced ? 5 : 9) * this.amount * dt;
    const puffs = Math.floor(this.slidePuffs);
    if (puffs > 0) {
      this.slidePuffs -= puffs;
      this.dust(x - dx * 2, z - dz * 2, puffs, 0.4, dx * 0.5, dz * 0.5);
    }
    if (this.reduced) return;

    this.slideChips += (this.futsal ? 14 : 36) * this.amount * dt;
    const wanted = Math.floor(this.slideChips);
    if (wanted <= 0) return;
    this.slideChips -= wanted;
    const n = this.take(wanted);
    const base = Math.atan2(dz, dx);
    for (let index = 0; index < n; index += 1) {
      const angle = base + this.random(-0.45, 0.45);
      const p = this.spec.reset();
      p.x = x + dx * 7 + this.random(-3, 3);
      p.z = z + dz * 7 + this.random(-3, 3);
      p.y = 1;
      if (this.futsal) {
        const speed = this.random(60, 110);
        p.cell = CELL_CHIP;
        p.streak = 1;
        p.vx = Math.cos(angle) * speed;
        p.vz = Math.sin(angle) * speed;
        p.vy = this.random(10, 25);
        p.gravity = 220;
        p.bounce = 0.15;
        p.life = 0.3;
        p.size0 = p.size1 = 1.5;
        p.aspect = 2.5;
        p.color(this.lightStreak, 1.1);
        p.alpha = 0.8;
        p.fadeOut = 1.5;
      } else {
        const speed = this.random(50, 100);
        p.cell = CELL_BLADE;
        p.vx = Math.cos(angle) * speed;
        p.vz = Math.sin(angle) * speed;
        p.vy = this.random(30, 75);
        p.gravity = 300;
        p.drag = 0.6;
        p.bounce = 0.2;
        p.life = this.random(0.5, 0.8);
        p.size0 = p.size1 = this.random(2.4, 3.4);
        p.aspect = 1.6;
        p.spin = this.random(-12, 12);
        p.color(this.grass[index % 3], LIT);
        p.fadeOut = 4;
      }
      this.soft.spawn(p);
    }
  }

  /** Marca contínua: o mesmo carrinho estica a marca em vez de carimbar várias. */
  private extendMark(x: number, z: number, dx: number, dz: number) {
    const m = this.marks;
    let open = -1;
    let nearest = 16;
    for (let index = 0; index < MAX_MARKS; index += 1) {
      const o = index * M_STRIDE;
      if (m[o + M_ALIVE] === 0 || m[o + M_AGE] > 0.25) continue;
      const gap = Math.hypot(m[o + M_X1] - x, m[o + M_Z1] - z);
      const span = Math.hypot(m[o + M_X1] - m[o + M_X0], m[o + M_Z1] - m[o + M_Z0]);
      if (gap < nearest && span < MARK_MAX_LENGTH) {
        nearest = gap;
        open = index;
      }
    }
    if (open >= 0) {
      const o = open * M_STRIDE;
      m[o + M_X1] = x;
      m[o + M_Z1] = z;
      m[o + M_DX] = dx;
      m[o + M_DZ] = dz;
      m[o + M_AGE] = 0;
      return;
    }
    // Nova marca: vaga livre ou a mais antiga (no máximo 6 no gramado).
    let slot = 0;
    let oldest = -1;
    for (let index = 0; index < MAX_MARKS; index += 1) {
      const o = index * M_STRIDE;
      if (m[o + M_ALIVE] === 0) {
        slot = index;
        break;
      }
      if (m[o + M_AGE] > oldest) {
        oldest = m[o + M_AGE];
        slot = index;
      }
    }
    const o = slot * M_STRIDE;
    m[o + M_X0] = m[o + M_X1] = x;
    m[o + M_Z0] = m[o + M_Z1] = z;
    m[o + M_DX] = dx;
    m[o + M_DZ] = dz;
    m[o + M_AGE] = 0;
    m[o + M_ALIVE] = 1;
  }

  /** Choque forte (bonecos, trave, luva do goleiro): estrela/anel na altura y; color opcional (padrão branco quente). strength 0..1. */
  impact(x: number, y: number, z: number, strength: number, color = "#fff4dc") {
    const s = clamp01(strength);
    const onGround = y < 40;
    if (this.reduced) {
      if (onGround) this.dust(x, z, 2, 0.3 + 0.4 * s, 0, 0);
      return;
    }
    const core = this.tint(color, 0.45, this.tintA);
    const edge = this.tint(color, 0, this.tintB);
    // Choque logo depois de outro: só faíscas e anel no chão, sem novo clarão.
    const flash = this.flashReady();
    if (flash && this.takeOne()) {
      const p = this.spec.reset();
      p.cell = CELL_STAR;
      p.pop = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.size0 = 2;
      p.size1 = 14 + 22 * s;
      p.life = 0.17 + 0.08 * s;
      p.spin = this.random(-3, 3);
      p.color(core, 1.9).fadeTo(edge, 1.1);
      p.fadeOut = 1.4;
      this.glow.spawn(p);
    }
    if (flash && this.takeOne()) {
      const p = this.spec.reset();
      p.cell = CELL_DISC;
      p.x = x;
      p.y = y;
      p.z = z;
      p.size0 = 8;
      p.size1 = 24 + 26 * s;
      p.life = 0.22;
      p.color(core, 1.1);
      p.alpha = 0.25 + 0.3 * s;
      p.fadeOut = 1.5;
      this.glow.spawn(p);
    }
    if (flash && s > 0.3 && this.takeOne()) {
      const p = this.spec.reset();
      p.cell = CELL_RING;
      p.x = x;
      p.y = y;
      p.z = z;
      p.size0 = 6;
      p.size1 = 20 + 26 * s;
      p.life = 0.26;
      p.color(core, 1.2);
      p.alpha = 0.15 + 0.4 * s;
      this.glow.spawn(p);
    }
    const sparks = this.take(this.count(3 + 7 * s));
    for (let index = 0; index < sparks; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const lift = this.random(0.15, 0.95);
      const flat = Math.sqrt(1 - lift * lift);
      const speed = this.random(60, 150) + 80 * s;
      const p = this.spec.reset();
      p.cell = CELL_CHIP;
      p.streak = 1;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(angle) * flat * speed;
      p.vz = Math.sin(angle) * flat * speed;
      p.vy = lift * speed;
      p.gravity = 300;
      p.drag = 1.6;
      p.bounce = 0.3;
      p.life = this.random(0.22, 0.44);
      p.size0 = p.size1 = this.random(1.1, 1.6);
      p.aspect = 3;
      p.color(this.hot, 1.7).fadeTo(edge, 1.1);
      p.fadeOut = 1.4;
      this.glow.spawn(p);
    }
    if (onGround) {
      this.rings.add(x, z, 4, 16 + 22 * s, 5, 2, 0.3, 0, core, 1, 0.35 + 0.35 * s);
      if (s > 0.35) this.dust(x, z, this.count(2), s, 0, 0);
    }
  }

  /** Onda no gramado saindo de (x,z) na cor dada até ~radius (padrão 70): anéis expandindo (use RingGeometry dedicado, não quad gigante). */
  shockwave(x: number, z: number, color: string, radius = 70) {
    const reach = Math.max(10, Number.isFinite(radius) ? radius : 70);
    const team = this.tint(color, 0.15, this.tintA);
    if (this.reduced) {
      this.rings.add(x, z, 4, reach, 8, 3, 1.1, 0, team, 1, 0.4);
      return;
    }
    // Pouco HDR: forte demais o ACES lava a cor do time para branco.
    this.rings.add(x, z, 4, reach, 11, 3, 0.95, 0, team, 1.15, 0.85);
    this.rings.add(x, z, 4, reach * 0.72, 7, 2, 0.8, 0.16, this.tint(color, 0.7, this.tintB), 1, 0.45);
    if (!this.low) this.rings.add(x, z, 3, reach * 0.48, 5, 1.5, 0.65, 0.32, team, 1, 0.35);
    if (this.takeOne()) {
      // Clarão rente ao chão no ponto de partida.
      const p = this.spec.reset();
      p.cell = CELL_DISC;
      p.flat = 1;
      p.x = x;
      p.y = 0.6;
      p.z = z;
      p.size0 = 10;
      p.size1 = Math.min(60, reach * 0.8);
      p.life = 0.4;
      p.color(team, 1.2);
      p.alpha = 0.4;
      p.fadeOut = 1.4;
      this.glow.spawn(p);
    }
  }

  /** Brilhos subindo em volta de (x,y,z) na cor dada; count padrão 6. Chamado a cada ~0.3s durante comemorações. */
  sparkle(x: number, y: number, z: number, color: string, count = 6) {
    // count 0 pede nenhum brilho (count() arredondaria para 1).
    if (this.reduced || !(count > 0)) return;
    const n = this.take(this.count(count));
    const team = this.tint(color, 0.45, this.tintA);
    for (let index = 0; index < n; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = this.random(7, 21);
      const p = this.spec.reset();
      p.x = x + Math.cos(angle) * distance;
      p.z = z + Math.sin(angle) * distance;
      p.y = Math.max(2, y * this.random(0.3, 1.1));
      p.vx = Math.cos(angle) * this.random(4, 10);
      p.vz = Math.sin(angle) * this.random(4, 10);
      p.vy = this.random(14, 32);
      p.gravity = -8;
      p.drag = 1.1;
      if (index % 3 !== 2) {
        // Um "pop" por brilho, em fases soltas: cintila sem piscar a tela.
        p.cell = CELL_GLINT;
        p.pop = true;
        p.size0 = 0.5;
        p.size1 = this.random(5.5, 9);
        // Vida bem espalhada: os picos (1/4 da vida) não caem juntos e a leva
        // chamada a cada ~0.3 s não pulsa no ritmo da chamada.
        p.life = this.random(0.7, 1.6);
        p.spin = this.random(-1.5, 1.5);
        if (index % 2 === 0) p.color(team, 1.6);
        else p.color(this.hot, 1.5);
        p.fadeOut = 2;
      } else {
        p.cell = CELL_DISC;
        p.size0 = p.size1 = this.random(1.8, 3);
        p.life = this.random(0.7, 1);
        p.color(team, 1.3);
        p.alpha = 0.8;
        p.fadeIn = 0.15;
        p.fadeOut = 1.5;
      }
      this.glow.spawn(p);
    }
  }

  /** Bola estufando o fundo da rede: estrela branca + fibras voando para trás. */
  netHit(x: number, y: number, z: number, strength: number) {
    const s = clamp01(strength);
    // "Para trás" = para fora do campo, no sentido do gol atingido.
    const back = z < 0 ? -1 : 1;
    const netZ = z + back * (FIELD.ballRadius + 1);
    if (this.reduced) {
      this.dust(x, netZ - back * 2, 2, 0.3, 0, 0);
      return;
    }
    // Gol é raro e merece o clarão; os choques logo depois esperam o intervalo.
    this.lastFlash = this.clock;
    if (this.takeOne()) {
      const p = this.spec.reset();
      p.cell = CELL_STAR;
      p.pop = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.size0 = 3;
      p.size1 = (26 + 14 * s) * (0.75 + 0.25 * s);
      p.life = 0.22;
      p.spin = this.random(-2, 2);
      p.color(WHITE, 1.8).fadeTo(this.hot, 1.1);
      p.fadeOut = 1.2;
      this.glow.spawn(p);
    }
    if (this.takeOne()) {
      const p = this.spec.reset();
      p.cell = CELL_DISC;
      p.x = x;
      p.y = y;
      p.z = z;
      p.size0 = 18;
      p.size1 = 44;
      p.life = 0.24;
      p.color(WHITE, 1);
      p.alpha = 0.4;
      p.fadeOut = 1.5;
      this.glow.spawn(p);
    }
    if (this.takeOne()) {
      // Ondinha no plano da rede (vertical, de frente para o eixo Z), 1 unidade
      // para dentro: a rede é alphaTest e escreve profundidade, coplanar tremeria.
      const p = this.spec.reset();
      p.cell = CELL_RING;
      p.flat = 2;
      p.x = x;
      p.y = y;
      p.z = netZ - back;
      p.size0 = 6;
      p.size1 = 34 + 10 * s;
      p.life = 0.35;
      p.color(WHITE, 1.2);
      p.alpha = 0.6;
      this.glow.spawn(p);
    }
    const fibers = this.take(this.count(8 + 6 * s));
    for (let index = 0; index < fibers; index += 1) {
      const p = this.spec.reset();
      p.cell = CELL_CHIP;
      p.streak = 0.6;
      p.x = x + this.random(-3, 3);
      p.y = y + this.random(-3, 3);
      p.z = netZ;
      p.vx = this.random(-45, 45);
      p.vy = this.random(40, 110);
      p.vz = back * this.random(60, 130) * (0.6 + 0.4 * s);
      p.gravity = 260;
      p.drag = 1.2;
      p.bounce = 0.2;
      p.life = this.random(0.45, 0.65);
      p.size0 = p.size1 = 1.1;
      p.aspect = 4.5;
      p.color(this.fiber, LIT);
      p.fadeOut = 3;
      this.soft.spawn(p);
    }
  }

  /** Holofote que segue quem comemora: poça de luz quente no gramado + cone translúcido vindo do alto (fade in ~0.35s, fade out ~0.4s quando receber null). Posição suavizada. */
  setSpotlight(point: { x: number; z: number } | null) {
    this.spot.set(point);
  }

  /** dt já vem escalado (câmera lenta). camera para billboard. */
  update(dt: number, camera: THREE.Camera) {
    // Aba voltando do fundo não pode despejar meio segundo de física de uma vez.
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.clock += step;
    this.tokens = Math.min(this.burst, this.tokens + this.rate * step);

    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const rightLength = Math.hypot(e[0], e[1], e[2]) || 1;
    const upLength = Math.hypot(e[4], e[5], e[6]) || 1;

    this.soft.step(step);
    this.glow.step(step);

    this.soft.begin();
    const m = this.marks;
    for (let index = 0; index < MAX_MARKS; index += 1) {
      const o = index * M_STRIDE;
      if (m[o + M_ALIVE] === 0) continue;
      const age = m[o + M_AGE] + step;
      if (age >= MARK_LIFE) {
        m[o + M_ALIVE] = 0;
        continue;
      }
      m[o + M_AGE] = age;
      let dx = m[o + M_X1] - m[o + M_X0];
      let dz = m[o + M_Z1] - m[o + M_Z0];
      const span = Math.hypot(dx, dz);
      if (span < 0.5) {
        dx = m[o + M_DX];
        dz = m[o + M_DZ];
      }
      const alpha = this.markAlpha * (1 - smooth(0.55, 1, age / MARK_LIFE));
      this.soft.quad(
        (m[o + M_X0] + m[o + M_X1]) / 2, 0.3, (m[o + M_Z0] + m[o + M_Z1]) / 2,
        // +y local do quad deitado = (-sen, -cos) no chão: aponta ao longo da marca.
        Math.atan2(-dx, -dz), 8, span + 7, CELL_SKID, 1,
        this.markColor.r, this.markColor.g, this.markColor.b, alpha,
      );
    }
    this.soft.writeParticles(e[0] / rightLength, e[1] / rightLength, e[2] / rightLength, e[4] / upLength, e[5] / upLength, e[6] / upLength);
    this.soft.end();

    this.glow.begin();
    this.glow.writeParticles(e[0] / rightLength, e[1] / rightLength, e[2] / rightLength, e[4] / upLength, e[5] / upLength, e[6] / upLength);
    this.glow.end();

    this.rings.update(step);
    this.spot.update(step);
  }

  dispose() {
    this.soft.dispose();
    this.glow.dispose();
    this.rings.dispose();
    this.spot.dispose();
    this.atlas.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}

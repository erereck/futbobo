// Estádio em volta do campo, em metros: arquibancada em tigela (retângulo de
// cantos redondos) com dois anéis, faixa de camarotes envidraçada, cobertura
// com a borda iluminada, quatro torres de refletores, placas de LED com
// anunciantes fictícios (e o show do gol) e a torcida "tapete" pintada no
// shader nos degraus sem bonecos 3D: milhares de torcedores de graça, com
// pulo, braços para cima e flashes de celular.
//
// Arquibancada, cobertura e torres são UMA malha (um draw call); o LED é outra.

import * as THREE from "three";
import { PITCH } from "../types";
import { ENV_FOG, type EnvUniforms, seeded } from "./util";

// ------------------------------------------------------------ desenho da tigela

/** Contorno de base da arquibancada (offset 0) e raio dos cantos. */
const BOWL_A = PITCH.halfWidth + 8.2;
const BOWL_B = PITCH.goalLineZ + 9.2;
const BOWL_R = 13;

export const LOWER_ROWS = 22;
export const UPPER_ROWS = 20;
const LOWER_DEPTH = 0.8;
const LOWER_RISE = 0.42;
const LOWER_BASE = 1.35;
const UPPER_START = LOWER_ROWS * LOWER_DEPTH + 1.2;
const UPPER_DEPTH = 0.85;
const UPPER_RISE = 0.6;
const UPPER_BASE = LOWER_BASE + (LOWER_ROWS - 1) * LOWER_RISE + 5.2;
const BACK_OFFSET = UPPER_START + UPPER_ROWS * UPPER_DEPTH;
const BACK_TOP = UPPER_BASE + (UPPER_ROWS - 1) * UPPER_RISE + 4.2;
const ROOF_FRONT = 11;
const ROOF_FRONT_Y = BACK_TOP + 2.2;

export type LoopSample = { x: number; z: number; nx: number; nz: number };

/** Amostras do contorno (anti-horário visto de cima), normal apontando para fora. */
function bowlLoop(): LoopSample[] {
  const samples: LoopSample[] = [];
  const corners: Array<[number, number, number]> = [
    [BOWL_A - BOWL_R, BOWL_B - BOWL_R, 0],
    [-(BOWL_A - BOWL_R), BOWL_B - BOWL_R, Math.PI / 2],
    [-(BOWL_A - BOWL_R), -(BOWL_B - BOWL_R), Math.PI],
    [BOWL_A - BOWL_R, -(BOWL_B - BOWL_R), Math.PI * 1.5],
  ];
  const straight = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.round(length / 2.6));
    for (let index = 0; index < steps; index += 1) {
      const t = index / steps;
      samples.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, nx, nz });
    }
  };
  const arc = (cx: number, cz: number, start: number) => {
    const steps = 10;
    for (let index = 0; index < steps; index += 1) {
      const angle = start + (index / steps) * (Math.PI / 2);
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      samples.push({ x: cx + nx * BOWL_R, z: cz + nz * BOWL_R, nx, nz });
    }
  };
  // Lado +x subindo em z, canto, fundo +z indo para -x, e assim por diante.
  straight(BOWL_A, -(BOWL_B - BOWL_R), BOWL_A, BOWL_B - BOWL_R, 1, 0);
  arc(corners[0][0], corners[0][1], corners[0][2]);
  straight(BOWL_A - BOWL_R, BOWL_B, -(BOWL_A - BOWL_R), BOWL_B, 0, 1);
  arc(corners[1][0], corners[1][1], corners[1][2]);
  straight(-BOWL_A, BOWL_B - BOWL_R, -BOWL_A, -(BOWL_B - BOWL_R), -1, 0);
  arc(corners[2][0], corners[2][1], corners[2][2]);
  straight(-(BOWL_A - BOWL_R), -BOWL_B, BOWL_A - BOWL_R, -BOWL_B, 0, -1);
  arc(corners[3][0], corners[3][1], corners[3][2]);
  return samples;
}

export type Seat = { x: number; y: number; z: number; yaw: number; row: number; u: number; tier: 0 | 1 };

/** Quantas fileiras de baixo têm bonecos 3D naquele ponto do contorno (o resto é tapete). */
export function solidRows(z: number, performance: boolean) {
  if (performance) return z > PITCH.goalLineZ - 4 ? 7 : z > 12 ? 4 : 0;
  return z > 8 ? 13 : z > -14 ? 8 : 0;
}

/**
 * Lugares da torcida 3D (fileiras da frente do anel de baixo, metade de
 * ataque). O tapete do shader cobre o resto: mesma grade de colunas.
 */
export function stadiumSeats(performance: boolean, seed: number): Seat[] {
  const loop = bowlLoop();
  const random = seeded(seed);
  const seats: Seat[] = [];
  const spacing = 0.62;
  for (let row = 0; row < LOWER_ROWS; row += 1) {
    const offset = row * LOWER_DEPTH + LOWER_DEPTH * 0.55;
    const y = LOWER_BASE + row * LOWER_RISE;
    let carry = random() * spacing;
    for (let index = 0; index < loop.length; index += 1) {
      const a = loop[index];
      const b = loop[(index + 1) % loop.length];
      const ax = a.x + a.nx * offset;
      const az = a.z + a.nz * offset;
      const bx = b.x + b.nx * offset;
      const bz = b.z + b.nz * offset;
      const length = Math.hypot(bx - ax, bz - az);
      let t = carry;
      while (t < length) {
        const k = t / length;
        const x = ax + (bx - ax) * k;
        const z = az + (bz - az) * k;
        if (row < solidRows(z, performance)) {
          // Lugares vazios aqui e ali (e corredores a cada ~22 m).
          const aisle = Math.abs(((Math.atan2(z, x) / (Math.PI * 2)) * 60) % 1) < 0.06;
          if (!aisle && random() < 0.93) {
            const nx = a.nx + (b.nx - a.nx) * k;
            const nz = a.nz + (b.nz - a.nz) * k;
            const jitter = (random() - 0.5) * 0.12;
            seats.push({ x: x + nz * jitter, y, z: z - nx * jitter, yaw: Math.atan2(-nx, -nz), row, u: 0, tier: 0 });
          }
        }
        t += spacing;
      }
      carry = t - length;
    }
  }
  return seats;
}

// ------------------------------------------------------------ construtor de malha

class Builder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly seats: number[] = [];
  readonly indices: number[] = [];
  private readonly color = new THREE.Color();

  /** Quadrilátero a-b-c-d (anti-horário visto de fora) com `seat` (u, v, tipo) por vértice. */
  quad(
    points: ReadonlyArray<readonly [number, number, number]>,
    normal: readonly [number, number, number],
    color: string | THREE.Color,
    seat: ReadonlyArray<readonly [number, number, number]>,
  ) {
    const base = this.positions.length / 3;
    const c = typeof color === "string" ? this.color.set(color) : color;
    for (let index = 0; index < 4; index += 1) {
      const p = points[index];
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.colors.push(c.r, c.g, c.b);
      const s = seat[index];
      this.seats.push(s[0], s[1], s[2]);
    }
    // Enrolamento pela normal pedida: a face da frente é sempre a que olha para ela.
    const [p0, p1, p2] = points;
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * normal[0] + cy * normal[1] + cz * normal[2] >= 0) this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("aSeat", new THREE.Float32BufferAttribute(this.seats, 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

// Tipos de superfície (aSeat.z): 0 estrutura, 1 tapete de torcida, 2 vidro dos
// camarotes, 3 faixa de luz da cobertura, 4 painel de refletor, 5 assento vazio.
const KIND_PLAIN = 0;
const KIND_CROWD = 1;
const KIND_GLASS = 2;
const KIND_STRIP = 3;
const KIND_LAMP = 4;

function buildBowl(performance: boolean) {
  const loop = bowlLoop();
  const builder = new Builder();
  const n = loop.length;
  const riserColor = new THREE.Color("#6d737c");
  const seatColor = new THREE.Color("#28324a");
  const concrete = new THREE.Color("#8a9099");
  const dark = new THREE.Color("#2b3038");
  const glass = new THREE.Color("#22324a");
  const roofUnder = new THREE.Color("#31363f");
  const roofTop = new THREE.Color("#7c858f");
  const fascia = new THREE.Color("#d8dce2");

  const at = (sample: LoopSample, offset: number) => [sample.x + sample.nx * offset, sample.z + sample.nz * offset] as const;

  // Comprimento ao longo do contorno, por offset (as colunas do tapete seguem a fileira).
  const arcLengths = (offset: number) => {
    const out: number[] = [0];
    for (let index = 1; index <= n; index += 1) {
      const [ax, az] = at(loop[index - 1], offset);
      const [bx, bz] = at(loop[index % n], offset);
      out.push(out[index - 1] + Math.hypot(bx - ax, bz - az));
    }
    return out;
  };

  const ring = (
    rows: number,
    start: number,
    depth: number,
    base: number,
    rise: number,
    tier: 0 | 1,
    firstBottom: number,
  ) => {
    for (let row = 0; row < rows; row += 1) {
      const front = start + row * depth;
      const back = front + depth;
      const top = base + row * rise;
      const bottom = row === 0 ? firstBottom : top - rise;
      const sFront = arcLengths(front);
      const sBack = arcLengths(back);
      for (let index = 0; index < n; index += 1) {
        const a = loop[index];
        const b = loop[(index + 1) % n];
        const midZ = (a.z + b.z) / 2;
        const solid = tier === 0 && row < solidRows(midZ, performance);
        const kind = solid ? KIND_PLAIN : KIND_CROWD;
        const [afx, afz] = at(a, front);
        const [bfx, bfz] = at(b, front);
        const [abx, abz] = at(a, back);
        const [bbx, bbz] = at(b, back);
        const v0 = row + tier * 100;
        // Espelho (de frente para o campo): normal para dentro.
        const nx = -(a.nx + b.nx) / 2;
        const nz = -(a.nz + b.nz) / 2;
        builder.quad(
          [[afx, bottom, afz], [bfx, bottom, bfz], [bfx, top, bfz], [afx, top, afz]],
          [nx, 0, nz],
          row === 0 ? concrete : solid ? riserColor : riserColor,
          [[sFront[index], v0, kind], [sFront[index + 1], v0, kind], [sFront[index + 1], v0 + 0.5, kind], [sFront[index], v0 + 0.5, kind]],
        );
        // Piso do degrau (assentos).
        builder.quad(
          [[afx, top, afz], [bfx, top, bfz], [bbx, top, bbz], [abx, top, abz]],
          [0, 1, 0],
          solid ? seatColor : seatColor,
          [[sFront[index], v0 + 0.5, kind], [sFront[index + 1], v0 + 0.5, kind], [sBack[index + 1], v0 + 1, kind], [sBack[index], v0 + 1, kind]],
        );
      }
    }
  };

  ring(LOWER_ROWS, 0, LOWER_DEPTH, LOWER_BASE, LOWER_RISE, 0, 0);

  // Camarotes: parede envidraçada entre os anéis e a laje do anel de cima.
  const lowerTop = LOWER_BASE + (LOWER_ROWS - 1) * LOWER_RISE;
  const lowerBack = LOWER_ROWS * LOWER_DEPTH;
  for (let index = 0; index < n; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % n];
    const nx = -(a.nx + b.nx) / 2;
    const nz = -(a.nz + b.nz) / 2;
    const s = arcLengths(lowerBack);
    const [ax, az] = at(a, lowerBack);
    const [bx, bz] = at(b, lowerBack);
    builder.quad(
      [[ax, lowerTop, az], [bx, lowerTop, bz], [bx, UPPER_BASE - 1.2, bz], [ax, UPPER_BASE - 1.2, az]],
      [nx, 0, nz],
      glass,
      [[s[index], 0, KIND_GLASS], [s[index + 1], 0, KIND_GLASS], [s[index + 1], 1, KIND_GLASS], [s[index], 1, KIND_GLASS]],
    );
    // Testeira do anel de cima (faixa clara na frente da laje).
    const [cx, cz] = at(a, UPPER_START - 0.3);
    const [dx, dz] = at(b, UPPER_START - 0.3);
    builder.quad(
      [[cx, UPPER_BASE - 1.2, cz], [dx, UPPER_BASE - 1.2, dz], [dx, UPPER_BASE, dz], [cx, UPPER_BASE, cz]],
      [nx, 0, nz],
      concrete,
      [[0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN]],
    );
    // Laje entre a parede de vidro e a testeira.
    builder.quad(
      [[ax, UPPER_BASE - 1.2, az], [cx, UPPER_BASE - 1.2, cz], [dx, UPPER_BASE - 1.2, dz], [bx, UPPER_BASE - 1.2, bz]],
      [0, -1, 0],
      dark,
      [[0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN]],
    );
  }

  ring(UPPER_ROWS, UPPER_START, UPPER_DEPTH, UPPER_BASE, UPPER_RISE, 1, UPPER_BASE - 1.2);

  // Parede do fundo, cobertura (de baixo e de cima) e a testeira iluminada.
  const upperTop = UPPER_BASE + (UPPER_ROWS - 1) * UPPER_RISE;
  for (let index = 0; index < n; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % n];
    const nx = -(a.nx + b.nx) / 2;
    const nz = -(a.nz + b.nz) / 2;
    const [ax, az] = at(a, BACK_OFFSET);
    const [bx, bz] = at(b, BACK_OFFSET);
    const plain: Array<[number, number, number]> = [[0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN]];
    builder.quad([[ax, upperTop, az], [bx, upperTop, bz], [bx, BACK_TOP, bz], [ax, BACK_TOP, az]], [nx, 0, nz], dark, plain);
    const [fx, fz] = at(a, ROOF_FRONT);
    const [gx, gz] = at(b, ROOF_FRONT);
    // Por baixo (visto do campo).
    builder.quad([[fx, ROOF_FRONT_Y, fz], [gx, ROOF_FRONT_Y, gz], [bx, BACK_TOP, bz], [ax, BACK_TOP, az]], [nx * 0.2, -1, nz * 0.2], roofUnder, plain);
    // Por cima (aparece nas câmeras altas da apresentação).
    builder.quad([[ax, BACK_TOP + 1.4, az], [bx, BACK_TOP + 1.4, bz], [gx, ROOF_FRONT_Y + 1.6, gz], [fx, ROOF_FRONT_Y + 1.6, fz]], [-nx * 0.1, 1, -nz * 0.1], roofTop, plain);
    // Testeira da cobertura com a faixa de luz.
    const s = arcLengths(ROOF_FRONT);
    builder.quad(
      [[fx, ROOF_FRONT_Y, fz], [gx, ROOF_FRONT_Y, gz], [gx, ROOF_FRONT_Y + 1.6, gz], [fx, ROOF_FRONT_Y + 1.6, fz]],
      [nx, 0, nz],
      fascia,
      [[s[index], 0, KIND_STRIP], [s[index + 1], 0, KIND_STRIP], [s[index + 1], 1, KIND_STRIP], [s[index], 1, KIND_STRIP]],
    );
    // Fecho da parede de trás até a cobertura (silhueta contra o céu).
    builder.quad([[ax, BACK_TOP, az], [bx, BACK_TOP, bz], [bx, BACK_TOP + 1.4, bz], [ax, BACK_TOP + 1.4, az]], [nx, 0, nz], dark, plain);
  }

  // Torres de refletores nos quatro cantos, por fora da tigela.
  const towers: THREE.Vector3[] = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    const cx = sx * (BOWL_A - BOWL_R);
    const cz = sz * (BOWL_B - BOWL_R);
    const nx = sx * Math.SQRT1_2;
    const nz = sz * Math.SQRT1_2;
    const reach = BOWL_R + BACK_OFFSET + 6;
    const base = new THREE.Vector3(cx + nx * reach, 0, cz + nz * reach);
    const height = 62;
    const head = new THREE.Vector3(base.x, height, base.z);
    towers.push(head);
    // Mastro: caixa afinando (quatro faces).
    const w0 = 1.6;
    const w1 = 0.8;
    const tx = -nz;
    const tz = nx;
    const corner = (w: number, y: number, a: number, b: number): [number, number, number] => [base.x + tx * w * a + nx * w * b, y, base.z + tz * w * a + nz * w * b];
    const sides: Array<[number, number, number, number]> = [[1, 1, -1, 1], [-1, 1, -1, -1], [-1, -1, 1, -1], [1, -1, 1, 1]];
    for (const [a0, b0, a1, b1] of sides) {
      const mx = (tx * (a0 + a1) + nx * (b0 + b1)) / 2;
      const mz = (tz * (a0 + a1) + nz * (b0 + b1)) / 2;
      builder.quad(
        [corner(w0, 0, a0, b0), corner(w0, 0, a1, b1), corner(w1, height - 3, a1, b1), corner(w1, height - 3, a0, b0)],
        [mx, 0, mz],
        dark,
        [[0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN]],
      );
    }
    // Cabeça: painel de lâmpadas inclinado para o centro do campo.
    const toward = new THREE.Vector3(-base.x, 0, -base.z).normalize();
    const side = new THREE.Vector3(-toward.z, 0, toward.x);
    const up = new THREE.Vector3(0, 1, 0);
    const tilt = 0.45;
    const face = toward.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(up, -Math.sin(tilt));
    const panelUp = new THREE.Vector3().crossVectors(face, side).normalize().multiplyScalar(-1);
    if (panelUp.y < 0) panelUp.multiplyScalar(-1);
    const hw = 6;
    const hh = 3.2;
    const p = (a: number, b: number): [number, number, number] => [
      head.x + side.x * a + panelUp.x * b,
      head.y + side.y * a + panelUp.y * b,
      head.z + side.z * a + panelUp.z * b,
    ];
    builder.quad([p(hw, -hh), p(-hw, -hh), p(-hw, hh), p(hw, hh)], [face.x, face.y, face.z], "#f5f3e8", [[0, 0, KIND_LAMP], [1, 0, KIND_LAMP], [1, 1, KIND_LAMP], [0, 1, KIND_LAMP]]);
    const back = (a: number, b: number): [number, number, number] => {
      const q = p(a, b);
      return [q[0] - face.x * 0.8, q[1] - face.y * 0.8, q[2] - face.z * 0.8];
    };
    builder.quad([back(-hw, -hh), back(hw, -hh), back(hw, hh), back(-hw, hh)], [-face.x, -face.y, -face.z], dark, [[0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN]]);
    builder.quad([back(-hw, hh), back(hw, hh), p(hw, hh), p(-hw, hh)], [panelUp.x, panelUp.y, panelUp.z], dark, [[0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN], [0, 0, KIND_PLAIN]]);
  }

  // Luzes da testeira (para os brilhos): a cada ~12 m do contorno da cobertura.
  const strip: THREE.Vector3[] = [];
  const s = arcLengths(ROOF_FRONT);
  const total = s[n];
  const count = Math.round(total / 12);
  for (let k = 0; k < count; k += 1) {
    const target = (k / count) * total;
    let index = 0;
    while (index < n - 1 && s[index + 1] < target) index += 1;
    const a = loop[index];
    const b = loop[(index + 1) % n];
    const t = (target - s[index]) / Math.max(1e-3, s[index + 1] - s[index]);
    const [ax, az] = at(a, ROOF_FRONT);
    const [bx, bz] = at(b, ROOF_FRONT);
    strip.push(new THREE.Vector3(ax + (bx - ax) * t, ROOF_FRONT_Y + 0.5, az + (bz - az) * t));
  }

  return { geometry: builder.build(), towers, strip };
}

// ------------------------------------------------------------ shader da tigela

const BOWL_PARS_VERTEX = /* glsl */ `
attribute vec3 aSeat;
varying vec3 vSeat;
varying float vDepth;
`;

const BOWL_VERTEX = /* glsl */ `
vSeat = aSeat;
`;

const BOWL_DEPTH_VERTEX = /* glsl */ `
vDepth = -mvPosition.z;
`;

const BOWL_PARS_FRAGMENT = /* glsl */ `
varying vec3 vSeat;
varying float vDepth;
uniform float uTime;
uniform float uCheer;
uniform float uCheerT;
uniform float uOoh;
uniform float uTension;
uniform float uFlash;
uniform float uLights;
uniform vec3 uHomeA;
uniform vec3 uHomeB;
uniform vec3 uAwayA;
uniform vec3 uAwayB;
float bHash(vec2 p) { return fract(sin(dot(p, vec2(41.37, 289.13))) * 23421.631); }
`;

/**
 * Tapete de torcida: célula de 0,62 m por fileira; o corpo (camisa), a cabeça
 * (pele, cabelo) e, na festa, os braços para cima. O degrau inteiro (espelho +
 * piso) é a altura de uma pessoa; o pulo desloca o desenho dentro dela.
 */
const BOWL_COLOR_FRAGMENT = /* glsl */ `
float bKind = vSeat.z;
vec3 bFlash = vec3(0.0);
if (bKind > 0.5 && bKind < 1.5) {
  float col = floor(vSeat.x / 0.62);
  float row = floor(vSeat.y);
  float f = fract(vSeat.y);
  vec2 id = vec2(col, row);
  float h1 = bHash(id);
  float h2 = bHash(id + 17.3);
  float h3 = bHash(id + 41.9);
  float lx = fract(vSeat.x / 0.62) - 0.5;
  // Quem está ali (8% vazio). Camisa: casa (principal/secundária), branco, visitante.
  float present = step(0.08, h3);
  vec3 shirt = h1 < 0.5 ? uHomeA : h1 < 0.72 ? uHomeB : h1 < 0.82 ? vec3(0.85) : h1 < 0.9 ? uAwayA : vec3(0.08, 0.09, 0.12);
  vec3 skin = mix(vec3(0.95, 0.72, 0.55), vec3(0.32, 0.19, 0.12), h2);
  // Pulo: na festa todo mundo pula (sincroniza depois de ~1 s); parado, balanço leve.
  float sync = smoothstep(0.8, 1.6, uCheerT);
  float jump = mix(max(0.0, sin(uCheerT * 8.5 * (0.8 + h2 * 0.5) + h1 * 6.28)), max(0.0, sin(uCheerT * 13.0 + row * 0.35)), sync) * uCheer;
  float rise = uTension * 0.12 + uOoh * 0.1;
  float bob = 0.04 * sin(uTime * (1.4 + h2) + h1 * 6.28) + jump * 0.28 + rise;
  float y = f - bob;
  float body = step(abs(lx), 0.36) * step(0.05, y) * step(y, 0.62);
  vec2 hp = vec2(lx, (y - 0.78) * 1.3);
  float head = step(length(hp), 0.2);
  float hair = head * step(0.06, hp.y) * step(h2, 0.75);
  float armsUp = max(uCheer, uOoh) * step(0.45, h1 * 0.6 + h3 * 0.4 + uCheer * 0.3);
  float arms = armsUp * step(0.3, abs(lx)) * step(abs(lx), 0.46) * step(0.5, y) * step(y, 1.05);
  vec3 seat = diffuseColor.rgb * 0.8;
  vec3 crowd = seat;
  crowd = mix(crowd, shirt, max(body, arms));
  crowd = mix(crowd, skin, head);
  crowd = mix(crowd, vec3(0.05, 0.04, 0.03), hair);
  diffuseColor.rgb = mix(seat, crowd, present);
  // Longe demais, o desenho vira média (sem cintilar).
  float far = smoothstep(90.0, 160.0, vDepth);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(seat, uHomeA * 0.7 + skin * 0.15, 0.75), far);
  // Flash de celular: uma célula aqui e ali, muito mais na hora do gol.
  float slot = floor(uTime * 6.0 + h1 * 37.0);
  float spark = bHash(id + slot * 1.37);
  float rate = 0.0015 + uFlash * 0.03;
  bFlash = vec3(1.0, 0.97, 0.9) * step(1.0 - rate, spark) * head * present * 6.0;
}
`;

const BOWL_EMISSIVE_FRAGMENT = /* glsl */ `
if (bKind > 1.5 && bKind < 2.5) {
  // Camarotes: vidro escuro com reflexo e uma janela acesa aqui e ali (montantes a cada 1,6 m).
  float paneId = floor(vSeat.x / 1.6);
  float pane = step(0.1, fract(vSeat.x / 1.6)) * step(0.12, vSeat.y) * step(vSeat.y, 0.8);
  float lit = step(0.45, bHash(vec2(paneId, 3.0))) * (0.5 + 0.5 * bHash(vec2(paneId, 9.0)));
  vec3 warm = mix(vec3(1.0, 0.78, 0.5), vec3(0.75, 0.88, 1.0), step(0.8, bHash(vec2(paneId, 5.0))));
  totalEmissiveRadiance += warm * pane * lit * (0.05 + uLights * 0.32);
  totalEmissiveRadiance += vec3(0.25, 0.32, 0.4) * pane * smoothstep(0.8, 0.2, vSeat.y) * 0.04;
}
if (bKind > 2.5 && bKind < 3.5) {
  // Faixa de luz da cobertura: segmentos brilhantes.
  float seg = step(0.2, fract(vSeat.x / 6.0)) * step(0.35, vSeat.y) * step(vSeat.y, 0.7);
  totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * seg * uLights * 3.0;
}
if (bKind > 3.5) {
  // Painel do refletor: grade de lâmpadas.
  vec2 cell = fract(vSeat.xy * vec2(8.0, 4.0)) - 0.5;
  float bulb = smoothstep(0.42, 0.18, length(cell));
  totalEmissiveRadiance += vec3(1.0, 0.98, 0.92) * (0.3 + bulb * 6.0) * uLights;
}
totalEmissiveRadiance += bFlash;
`;

// ------------------------------------------------------------ LED

const LED_ADS: ReadonlyArray<{ text: string; sub?: string; bg: [string, string]; ink: string; accent: string; font: string }> = [
  { text: "SCOREBOBO", bg: ["#0b2a7a", "#1146d9"], ink: "#ffffff", accent: "#ffd23f", font: "900" },
  { text: "FUTBOBO", sub: "o jogo da sua carreira", bg: ["#0a5a2a", "#13a44b"], ink: "#ffe14d", accent: "#ffffff", font: "900" },
  { text: "BOBO COLA", sub: "gelada desde 1998", bg: ["#9b0d14", "#e3222b"], ink: "#ffffff", accent: "#ffd6d6", font: "italic 900" },
  { text: "GALÁXIA TELECOM", bg: ["#2a0b56", "#5c1fb8"], ink: "#7ff6ff", accent: "#ffffff", font: "800" },
  { text: "TURBO PNEUS", bg: ["#f7c400", "#ffdd33"], ink: "#111111", accent: "#d01818", font: "italic 900" },
  { text: "CAFÉ DO CRAQUE", bg: ["#3b2213", "#6b3f22"], ink: "#ffe9c4", accent: "#ffb35a", font: "800" },
  { text: "PIPOCA BANK", bg: ["#d65a00", "#ff8a1a"], ink: "#ffffff", accent: "#fff0b3", font: "900" },
  { text: "CHUTEIRA VELOZ", bg: ["#0b0b0f", "#1d1f27"], ink: "#ffffff", accent: "#ff2f4f", font: "italic 900" },
];
const LED_AD_WIDTH = 320;
const LED_ROW = 128;
/** Metros de placa por anúncio. */
const LED_AD_METERS = 6.4;

function ledTexture(goalInk: string, goalBg: string) {
  const width = LED_AD_WIDTH * LED_ADS.length;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = LED_ROW * 2;
  const ctx = canvas.getContext("2d")!;
  LED_ADS.forEach((ad, index) => {
    const x = index * LED_AD_WIDTH;
    const gradient = ctx.createLinearGradient(x, 0, x + LED_AD_WIDTH, LED_ROW);
    gradient.addColorStop(0, ad.bg[0]);
    gradient.addColorStop(1, ad.bg[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, LED_AD_WIDTH, LED_ROW);
    ctx.fillStyle = ad.accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, LED_ROW - 10, LED_AD_WIDTH, 10);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ad.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 64;
    const family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.font = `${ad.font} ${size}px ${family}`;
    while (ctx.measureText(ad.text).width > LED_AD_WIDTH - 28 && size > 20) {
      size -= 2;
      ctx.font = `${ad.font} ${size}px ${family}`;
    }
    ctx.fillText(ad.text, x + LED_AD_WIDTH / 2, ad.sub ? LED_ROW * 0.4 : LED_ROW * 0.48);
    if (ad.sub) {
      ctx.font = `600 22px ${family}`;
      ctx.fillStyle = ad.accent;
      ctx.fillText(ad.sub, x + LED_AD_WIDTH / 2, LED_ROW * 0.74);
    }
    if (index === 0) {
      // Bolinha do Scorebobo antes do nome.
      ctx.beginPath();
      ctx.arc(x + 22, LED_ROW / 2, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  });
  // Linha de baixo: o show do gol.
  for (let index = 0; index < LED_ADS.length; index += 1) {
    const x = index * LED_AD_WIDTH;
    ctx.fillStyle = index % 2 === 0 ? goalBg : "#0a0a0a";
    ctx.fillRect(x, LED_ROW, LED_AD_WIDTH, LED_ROW);
    ctx.fillStyle = index % 2 === 0 ? goalInk : "#ffd23f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `italic 900 ${index % 2 === 0 ? 92 : 58}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    ctx.fillText(index % 2 === 0 ? "GOOOL!" : "SCOREBOBO", x + LED_AD_WIDTH / 2, LED_ROW * 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/**
 * Contorno das placas (fecha em volta do campo, com chanfro nos cantos). O
 * sentido faz o texto correr da esquerda para a direita visto de dentro.
 */
function ledPath(): THREE.Vector2[] {
  const zx = PITCH.goalLineZ + 5.3;
  const xx = PITCH.halfWidth + 4.6;
  const cx = PITCH.halfWidth + 1.5;
  const cz = PITCH.goalLineZ + 2.2;
  return [
    new THREE.Vector2(-cx, zx),
    new THREE.Vector2(cx, zx),
    new THREE.Vector2(xx, cz),
    new THREE.Vector2(xx, -cz),
    new THREE.Vector2(cx, -zx),
    new THREE.Vector2(-cx, -zx),
    new THREE.Vector2(-xx, -cz),
    new THREE.Vector2(-xx, cz),
  ].reverse();
}

function ledGeometry() {
  const path = ledPath();
  const positions: number[] = [];
  const uvs: number[] = [];
  const faces: number[] = [];
  const indices: number[] = [];
  const height = 0.95;
  const lean = 0.12;
  let s = 0;
  const push = (x: number, y: number, z: number, u: number, v: number, face: number) => {
    positions.push(x, y, z);
    uvs.push(u, v);
    faces.push(face);
    return positions.length / 3 - 1;
  };
  for (let index = 0; index < path.length; index += 1) {
    const a = path[index];
    const b = path[(index + 1) % path.length];
    const length = a.distanceTo(b);
    // Normal para dentro do campo (o contorno anda no sentido horário visto de cima).
    const dx = (b.x - a.x) / length;
    const dz = (b.y - a.y) / length;
    const nx = dz;
    const nz = -dx;
    const inward = nx * -a.x + nz * -a.y > 0 ? 1 : -1;
    const ix = nx * inward;
    const iz = nz * inward;
    const steps = Math.max(1, Math.ceil(length / 4));
    for (let step = 0; step < steps; step += 1) {
      const t0 = step / steps;
      const t1 = (step + 1) / steps;
      const x0 = a.x + (b.x - a.x) * t0;
      const z0 = a.y + (b.y - a.y) * t0;
      const x1 = a.x + (b.x - a.x) * t1;
      const z1 = a.y + (b.y - a.y) * t1;
      const u0 = s + length * t0;
      const u1 = s + length * t1;
      // Frente (LED), levemente inclinada para trás.
      const p0 = push(x0, 0.02, z0, u0, 0, 0);
      const p1 = push(x1, 0.02, z1, u1, 0, 0);
      const p2 = push(x1 - ix * lean, height, z1 - iz * lean, u1, 1, 0);
      const p3 = push(x0 - ix * lean, height, z0 - iz * lean, u0, 1, 0);
      indices.push(p0, p2, p1, p0, p3, p2);
      // Tampa e costas (carcaça escura).
      const back = 0.35;
      const q0 = push(x0 - ix * (lean + back), height, z0 - iz * (lean + back), u0, 1, 1);
      const q1 = push(x1 - ix * (lean + back), height, z1 - iz * (lean + back), u1, 1, 1);
      const r2 = push(x1 - ix * lean, height, z1 - iz * lean, u1, 1, 1);
      const r3 = push(x0 - ix * lean, height, z0 - iz * lean, u0, 1, 1);
      indices.push(r3, q1, r2, r3, q0, q1);
      const b0 = push(x0 - ix * (lean + back), 0, z0 - iz * (lean + back), u0, 0, 1);
      const b1 = push(x1 - ix * (lean + back), 0, z1 - iz * (lean + back), u1, 0, 1);
      indices.push(b0, q1, b1, b0, q0, q1);
    }
    s += length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aFace", new THREE.Float32BufferAttribute(faces, 1));
  geometry.setIndex(indices);
  return geometry;
}

const LED_VERTEX = /* glsl */ `
attribute float aFace;
varying vec2 vUv;
varying float vFace;
varying float vDepth;
void main() {
  vUv = uv;
  vFace = aFace;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const LED_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uGoal;
uniform float uGoalT;
uniform float uGain;
uniform vec3 uChaseA;
uniform vec3 uChaseB;
varying vec2 vUv;
varying float vFace;
varying float vDepth;
${ENV_FOG}
void main() {
  if (vFace > 0.5) {
    gl_FragColor = vec4(envFog(vec3(0.035, 0.04, 0.05), vDepth), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  float meters = vUv.x;
  float total = ${(LED_AD_METERS * LED_ADS.length).toFixed(2)};
  // Anúncios andando devagar; no gol, o show corre rápido.
  float u = meters / total + uTime * 0.012;
  vec3 ads = texture2D(uMap, vec2(u, 0.5 + vUv.y * 0.5)).rgb;
  float gu = meters / total * 1.5 - uGoalT * 0.35;
  vec3 show = texture2D(uMap, vec2(gu, vUv.y * 0.5)).rgb;
  // Perseguição de luz por cima do show.
  float chase = step(0.5, fract(meters / 3.0 - uGoalT * 2.4));
  vec3 strobe = mix(uChaseA, uChaseB, chase);
  show = mix(show, strobe, 0.28 * (0.5 + 0.5 * sin(uGoalT * 9.0)));
  vec3 color = mix(ads, show, uGoal);
  // Grade de LED quando a placa está perto (some com a distância).
  vec2 cell = abs(fract(vec2(meters * 40.0, vUv.y * 38.0)) - 0.5);
  float dots = smoothstep(0.5, 0.32, max(cell.x, cell.y));
  float close = 1.0 - smoothstep(6.0, 22.0, vDepth);
  color *= mix(1.0, 0.55 + 0.6 * dots, close);
  color *= uGain;
  gl_FragColor = vec4(envFog(color, vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------ brilhos e flashes

const GLOW_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uScale;
uniform float uTime;
uniform float uRate;
uniform float uOn;
uniform float uFlashMode;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float alpha = uOn;
  if (uFlashMode > 0.5) {
    // Flash de máquina: acende ~0,07 s numa posição sorteada no tempo.
    float cycle = uTime * (0.15 + uRate * 1.6) + aPhase * 17.0;
    float k = fract(cycle);
    float pick = fract(sin(floor(cycle) * 12.9898 + aPhase * 78.233) * 43758.5453);
    alpha = step(0.55 - uRate * 0.4, pick) * smoothstep(0.08, 0.0, k) * (0.4 + uRate);
  }
  vAlpha = alpha;
  gl_PointSize = min(aSize * uScale / max(1.0, -mv.z), 420.0);
  if (alpha < 0.01) gl_PointSize = 0.0;
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float core = exp(-r * r * 18.0);
  float halo = exp(-r * 3.2) * 0.45;
  // Estrela de quatro pontas (lente).
  float streak = exp(-abs(p.x) * 40.0) * exp(-abs(p.y) * 2.2) + exp(-abs(p.y) * 40.0) * exp(-abs(p.x) * 2.2);
  float glow = (core + halo + streak * 0.5) * vAlpha * (1.0 - smoothstep(0.85, 1.0, r));
  if (glow < 0.003) discard;
  gl_FragColor = vec4(uColor * glow, 1.0);
}
`;

function glowPoints(points: THREE.Vector3[], sizes: number[], color: string, flash: boolean, time: { value: number }) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(points.length * 3);
  points.forEach((point, index) => point.toArray(positions, index * 3));
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(points.map((_, index) => (index * 0.61803) % 1), 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniforms: {
      uScale: { value: 600 },
      uTime: time,
      uRate: { value: 0 },
      uOn: { value: 1 },
      uFlashMode: { value: flash ? 1 : 0 },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return mesh;
}

// ------------------------------------------------------------ estádio

export type StadiumColors = { homeA: string; homeB: string; awayA: string; awayB: string };

export class Stadium {
  readonly group = new THREE.Group();
  readonly towerHeads: THREE.Vector3[];
  private readonly bowl: THREE.Mesh;
  private readonly led: THREE.Mesh;
  private readonly glare: THREE.Points;
  private readonly flashes: THREE.Points;
  private readonly bowlUniforms;
  private readonly ledUniforms;
  private goalT = 99;
  private goalLevel = 0;
  private cheerLevel = 0;
  private oohLevel = 0;
  private oohLeft = 0;
  private tension = 0;
  private flash = 0;
  private flashTarget = 0;

  constructor(
    env: EnvUniforms,
    colors: StadiumColors,
    private readonly performance: boolean,
  ) {
    const { geometry, towers, strip } = buildBowl(performance);
    this.towerHeads = towers;
    this.bowlUniforms = {
      uTime: env.uTime,
      uCheer: { value: 0 },
      uCheerT: { value: 99 },
      uOoh: { value: 0 },
      uTension: { value: 0 },
      uFlash: { value: 0 },
      uLights: env.uLights,
      uHomeA: { value: new THREE.Color(colors.homeA) },
      uHomeB: { value: new THREE.Color(colors.homeB) },
      uAwayA: { value: new THREE.Color(colors.awayA) },
      uAwayB: { value: new THREE.Color(colors.awayB) },
    };
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.bowlUniforms);
      // A tigela não recebe a sombra projetada (o mapa cobre só o campo).
      shader.vertexShader = `#undef USE_SHADOWMAP\n${shader.vertexShader}`
        .replace("#include <common>", `#include <common>\n${BOWL_PARS_VERTEX}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${BOWL_VERTEX}`)
        .replace("#include <project_vertex>", `#include <project_vertex>\n${BOWL_DEPTH_VERTEX}`);
      shader.fragmentShader = `#undef USE_SHADOWMAP\n${shader.fragmentShader}`
        .replace("#include <common>", `#include <common>\n${BOWL_PARS_FRAGMENT}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${BOWL_COLOR_FRAGMENT}`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${BOWL_EMISSIVE_FRAGMENT}`);
    };
    this.bowl = new THREE.Mesh(geometry, material);
    this.group.add(this.bowl);

    this.ledUniforms = {
      uMap: { value: ledTexture("#ffffff", colors.homeA) },
      uTime: env.uTime,
      uGoal: { value: 0 },
      uGoalT: { value: 0 },
      uGain: { value: 1 },
      uChaseA: { value: new THREE.Color(colors.homeA) },
      uChaseB: { value: new THREE.Color("#ffffff") },
      uFogColor: env.uFogColor,
      uFogNear: env.uFogNear,
      uFogFar: env.uFogFar,
    };
    this.led = new THREE.Mesh(
      ledGeometry(),
      new THREE.ShaderMaterial({ vertexShader: LED_VERTEX, fragmentShader: LED_FRAGMENT, uniforms: this.ledUniforms, side: THREE.DoubleSide }),
    );
    this.group.add(this.led);

    // Brilho dos refletores (torres grandes, testeira pequena).
    const glarePoints = [...towers, ...strip.filter((_, index) => index % (performance ? 3 : 2) === 0)];
    const glareSizes = glarePoints.map((_, index) => (index < towers.length ? 46 : 9));
    this.glare = glowPoints(glarePoints, glareSizes, "#fff6e4", false, env.uTime);
    this.group.add(this.glare);

    // Flashes de máquina nas fileiras de baixo da metade de ataque.
    const random = seeded(777);
    const flashPoints: THREE.Vector3[] = [];
    const loop = bowlLoop();
    const total = performance ? 90 : 220;
    while (flashPoints.length < total) {
      const sample = loop[Math.floor(random() * loop.length)];
      if (sample.z < -10) continue;
      const row = Math.floor(random() * (LOWER_ROWS + UPPER_ROWS));
      const upper = row >= LOWER_ROWS;
      const r = upper ? row - LOWER_ROWS : row;
      const offset = upper ? UPPER_START + r * UPPER_DEPTH + 0.4 : r * LOWER_DEPTH + 0.4;
      const y = (upper ? UPPER_BASE + r * UPPER_RISE : LOWER_BASE + r * LOWER_RISE) + 1.5;
      flashPoints.push(new THREE.Vector3(sample.x + sample.nx * offset, y, sample.z + sample.nz * offset));
    }
    this.flashes = glowPoints(flashPoints, flashPoints.map(() => 2.4), "#f4f7ff", true, env.uTime);
    this.group.add(this.flashes);
  }

  setLook(lights: number) {
    (this.glare.material as THREE.ShaderMaterial).uniforms.uOn.value = lights;
    this.glare.visible = lights > 0.05;
    // LED: de dia precisa de mais ganho para não parecer apagado contra o sol.
    this.ledUniforms.uGain.value = lights > 0.9 ? 1.25 : lights > 0.3 ? 1.35 : 1.6;
  }

  /** Escala dos pontos (px por metro a 1 m): segue a altura do canvas e o fov. */
  setPointScale(scale: number) {
    (this.glare.material as THREE.ShaderMaterial).uniforms.uScale.value = scale;
    (this.flashes.material as THREE.ShaderMaterial).uniforms.uScale.value = scale;
  }

  /** Gol: estouro na torcida, show no LED, chuva de flashes. */
  goal() {
    this.goalT = 0;
    this.flashTarget = 1;
  }

  /** Quase: "uuuh" (mãos na cabeça) por ~2 s. */
  ooh() {
    this.oohLeft = 2.2;
  }

  /** 0..1: a bola indo para o gol (a torcida levanta). */
  setTension(value: number) {
    this.tension = value;
  }

  calm() {
    this.goalT = 99;
    this.flashTarget = 0;
  }

  get cheer() {
    return this.cheerLevel;
  }

  get oohAmount() {
    return this.oohLevel;
  }

  get tensionAmount() {
    return this.tension;
  }

  get flashAmount() {
    return this.flash;
  }

  get goalShowTime() {
    return this.goalT;
  }

  update(dt: number) {
    this.goalT += dt;
    const cheering = this.goalT < 9;
    this.cheerLevel = THREE.MathUtils.damp(this.cheerLevel, cheering ? 1 : 0, cheering ? 6 : 1.2, dt);
    this.goalLevel = THREE.MathUtils.damp(this.goalLevel, this.goalT < 7 ? 1 : 0, this.goalT < 7 ? 10 : 2, dt);
    this.oohLeft = Math.max(0, this.oohLeft - dt);
    this.oohLevel = THREE.MathUtils.damp(this.oohLevel, this.oohLeft > 0 ? 1 : 0, this.oohLeft > 0 ? 7 : 2, dt);
    if (!cheering) this.flashTarget = 0;
    this.flash = THREE.MathUtils.damp(this.flash, this.flashTarget * (this.goalT < 4 ? 1 : 0.45), 3, dt);
    const u = this.bowlUniforms;
    u.uCheer.value = this.cheerLevel;
    u.uCheerT.value = this.goalT;
    u.uOoh.value = this.oohLevel;
    u.uTension.value = this.tension;
    u.uFlash.value = this.flash;
    this.ledUniforms.uGoal.value = this.goalLevel;
    this.ledUniforms.uGoalT.value = this.goalT;
    const flashes = (this.flashes.material as THREE.ShaderMaterial).uniforms;
    flashes.uRate.value = this.performance ? this.flash * 0.7 : this.flash;
  }

  dispose() {
    this.bowl.geometry.dispose();
    (this.bowl.material as THREE.Material).dispose();
    this.led.geometry.dispose();
    this.ledUniforms.uMap.value.dispose();
    (this.led.material as THREE.Material).dispose();
    for (const points of [this.glare, this.flashes]) {
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    }
  }
}

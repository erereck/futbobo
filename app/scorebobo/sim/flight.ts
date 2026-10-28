// O voo "desenhado" da bola: segue o plano (caminho no chão com curva, perfil
// de altura do tipo de chute) com física plausível — o caminho é uma Bézier
// cúbica cuja curva aperta no fim (como o Magnus quando a bola perde
// velocidade), o avanço desacelera como o arrasto do ar (e o atrito da grama,
// rolando) e a altura é balística. Ao fim do voo (ou numa batida), a física
// livre (physics.ts) assume com a mesma velocidade.

import type { KickKind, Vec2, Vec3 } from "../types";
import { clamp, norm2, right2, hypot } from "./math";
import { DRAG_K, G, MAGNUS, R, ROLL_DECEL } from "./physics";

export type FlightSpec = {
  kind: KickKind;
  from: Vec3;
  /** Ponto de chegada (y = altura em que a bola chega lá). */
  target: Vec3;
  /** Desvio lateral máximo do caminho (m), sinal = lado (direita de quem chuta). */
  curve: number;
  /** Velocidade horizontal inicial (chutes, passes rasteiros). */
  speed: number;
  /** Altura máxima (bolas por cima: a duração vem dela). */
  apex: number;
  /** Rasteira: rola na grama o caminho todo. */
  grounded: boolean;
  /** A duração sai do `apex` (cruzamento, lançamento, cavadinha). */
  lofted: boolean;
};

export type Flight = {
  spec: FlightSpec;
  /** Duração do voo desenhado (s); depois disso, física livre. */
  T: number;
  /** Comprimento do caminho no chão até onde o voo desenhado acaba. */
  L: number;
  v0: number;
  vy0: number;
  y0: number;
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
  /** Tabela comprimento ↔ parâmetro da Bézier. */
  arcS: Float64Array;
  arcLen: Float64Array;
  /** Rasteira que para antes do alvo (passe fraco). */
  stopsShort: boolean;
  /** Efeito para o desenho da bola e para a física que assume depois. */
  spin: { x: number; y: number };
  phi0: number;
  cosPhi0: number;
};

export type FlightGeometry = { p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2; arcS: Float64Array; arcLen: Float64Array; total: number };

// Controles da Bézier: o primeiro desvia menos que o segundo, então a bola sai
// quase reta e fecha a curva no fim. O fator normaliza o desvio máximo para 1.
const C1_ALONG = 0.3;
const C2_ALONG = 0.72;
const C1_SIDE = 0.95;
const C2_SIDE = 1.35;
const SIDE_NORM = (() => {
  let max = 0;
  for (let i = 0; i <= 200; i += 1) {
    const s = i / 200;
    const f = 3 * (1 - s) * (1 - s) * s * C1_SIDE + 3 * (1 - s) * s * s * C2_SIDE;
    if (f > max) max = f;
  }
  return 1 / max;
})();
const ARC_SAMPLES = 48;
/** Parâmetro da Bézier em cada amostra da tabela (i/48): igual em todo voo e só lido, então é um só. */
const ARC_S = (() => {
  const s = new Float64Array(ARC_SAMPLES + 1);
  for (let i = 0; i <= ARC_SAMPLES; i += 1) s[i] = i / ARC_SAMPLES;
  return s;
})();

function bezier(f: Pick<Flight, "p0" | "p1" | "p2" | "p3">, s: number): Vec2 {
  const u = 1 - s;
  const a = u * u * u;
  const b = 3 * u * u * s;
  const c = 3 * u * s * s;
  const d = s * s * s;
  return {
    x: a * f.p0.x + b * f.p1.x + c * f.p2.x + d * f.p3.x,
    z: a * f.p0.z + b * f.p1.z + c * f.p2.z + d * f.p3.z,
  };
}

function bezierD1(f: Pick<Flight, "p0" | "p1" | "p2" | "p3">, s: number): Vec2 {
  const u = 1 - s;
  return {
    x: 3 * u * u * (f.p1.x - f.p0.x) + 6 * u * s * (f.p2.x - f.p1.x) + 3 * s * s * (f.p3.x - f.p2.x),
    z: 3 * u * u * (f.p1.z - f.p0.z) + 6 * u * s * (f.p2.z - f.p1.z) + 3 * s * s * (f.p3.z - f.p2.z),
  };
}

function bezierD2(f: Pick<Flight, "p0" | "p1" | "p2" | "p3">, s: number): Vec2 {
  const u = 1 - s;
  return {
    x: 6 * u * (f.p2.x - 2 * f.p1.x + f.p0.x) + 6 * s * (f.p3.x - 2 * f.p2.x + f.p1.x),
    z: 6 * u * (f.p2.z - 2 * f.p1.z + f.p0.z) + 6 * s * (f.p3.z - 2 * f.p2.z + f.p1.z),
  };
}

const PW = Math.sqrt(ROLL_DECEL * DRAG_K);
const PK = Math.sqrt(DRAG_K / ROLL_DECEL);
const PV = Math.sqrt(ROLL_DECEL / DRAG_K);
/** Distância percorrida e velocidade no instante t (ar: arrasto; chão: arrasto + grama). */
function progress(grounded: boolean, v0: number, t: number) {
  if (!grounded) {
    const q = 1 + DRAG_K * v0 * t;
    return { d: Math.log(q) / DRAG_K, v: v0 / q };
  }
  const w = PW;
  const phi0 = Math.atan(v0 * PK);
  const phi = Math.max(0, phi0 - w * t);
  return { d: Math.log(Math.cos(phi) / Math.cos(phi0)) / DRAG_K, v: PV * Math.tan(phi) };
}
/** Só a distância (a posição não precisa da velocidade); phi0/cosPhi0 do voo já calculados. */
function progressD(f: Flight, t: number) {
  if (!f.spec.grounded) return Math.log(1 + DRAG_K * f.v0 * t) / DRAG_K;
  const phi = Math.max(0, f.phi0 - PW * t);
  return Math.log(Math.cos(phi) / f.cosPhi0) / DRAG_K;
}

/** Velocidade inicial de uma rasteira que chega a `L` metros com `arrive` m/s. */
export function groundSpeedFor(L: number, arrive: number) {
  const ak = ROLL_DECEL / DRAG_K;
  return Math.sqrt((arrive * arrive + ak) * Math.exp(2 * DRAG_K * L) - ak);
}

/** Até onde uma rasteira com v0 rola. */
export function groundReach(v0: number) {
  const phi0 = Math.atan(v0 * Math.sqrt(DRAG_K / ROLL_DECEL));
  return -Math.log(Math.cos(phi0)) / DRAG_K;
}

/** Tempo de voo (ar) para `L` metros com v0. */
export function airTime(L: number, v0: number) {
  return (Math.exp(DRAG_K * L) - 1) / (DRAG_K * v0);
}

/** Bézier e tabela de comprimento: só dependem de from/target/curve (a busca por velocidade/altura reaproveita). */
export function flightGeometry(spec: Pick<FlightSpec, "from" | "target" | "curve">): FlightGeometry {
  const p0 = { x: spec.from.x, z: spec.from.z };
  const p3 = { x: spec.target.x, z: spec.target.z };
  const chord = { x: p3.x - p0.x, z: p3.z - p0.z };
  const D = Math.max(0.05, hypot(chord.x, chord.z));
  const dir = norm2(chord);
  const side = right2(dir);
  const o1 = spec.curve * SIDE_NORM * C1_SIDE;
  const o2 = spec.curve * SIDE_NORM * C2_SIDE;
  const p1 = { x: p0.x + chord.x * C1_ALONG + side.x * o1, z: p0.z + chord.z * C1_ALONG + side.z * o1 };
  const p2 = { x: p0.x + chord.x * C2_ALONG + side.x * o2, z: p0.z + chord.z * C2_ALONG + side.z * o2 };
  const arcLen = new Float64Array(ARC_SAMPLES + 1);
  let prevX = p0.x;
  let prevZ = p0.z;
  let total = 0;
  for (let i = 0; i <= ARC_SAMPLES; i += 1) {
    // A mesma conta de bezier(), sem um objeto por amostra.
    const s = ARC_S[i];
    const u = 1 - s;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;
    const x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
    const z = a * p0.z + b * p1.z + c * p2.z + d * p3.z;
    total += hypot(x - prevX, z - prevZ);
    arcLen[i] = total;
    prevX = x;
    prevZ = z;
  }
  void D;
  return { p0, p1, p2, p3, arcS: ARC_S, arcLen, total };
}

export function designFlight(spec: FlightSpec, g: FlightGeometry = flightGeometry(spec)): Flight {
  const { p0, p1, p2, p3, arcS, arcLen } = g;
  const geo = g;
  const pathLen = Math.max(0.05, g.total);

  const y0 = spec.from.y;
  let v0 = Math.max(0.5, spec.speed);
  let T: number;
  let vy0 = 0;
  let L = pathLen;
  let stopsShort = false;
  if (spec.grounded) {
    const reach = groundReach(v0);
    if (reach < pathLen) {
      stopsShort = true;
      L = reach;
      T = Math.atan(v0 * Math.sqrt(DRAG_K / ROLL_DECEL)) / Math.sqrt(ROLL_DECEL * DRAG_K);
    } else {
      const w = Math.sqrt(ROLL_DECEL * DRAG_K);
      const phi0 = Math.atan(v0 * Math.sqrt(DRAG_K / ROLL_DECEL));
      T = (phi0 - Math.acos(clamp(Math.cos(phi0) * Math.exp(DRAG_K * pathLen), -1, 1))) / w;
    }
  } else if (spec.lofted) {
    const apex = Math.max(spec.apex, y0 + 0.3, spec.target.y + 0.3);
    vy0 = Math.sqrt(2 * G * (apex - y0));
    T = vy0 / G + Math.sqrt((2 * (apex - spec.target.y)) / G);
    v0 = (Math.exp(DRAG_K * pathLen) - 1) / (DRAG_K * T);
  } else {
    T = airTime(pathLen, v0);
    vy0 = (spec.target.y - y0 + (G * T * T) / 2) / T;
  }

  const phi0 = Math.atan(v0 * PK);
  const flight: Flight = { spec, T: Math.max(0.05, T), L, v0, vy0, y0, p0, p1, p2, p3, arcS, arcLen, stopsShort, spin: { x: 0, y: 0 }, phi0, cosPhi0: Math.cos(phi0) };
  // Efeito: o giro lateral que, pela física livre, mantém a curva do fim do voo.
  const sEnd = paramAt(flight, L * 0.88);
  const d1 = bezierD1(geo, sEnd);
  const d2 = bezierD2(geo, sEnd);
  const sp = hypot(d1.x, d1.z);
  const kappaRight = sp > 1e-6 ? (d2.x * d1.z - d2.z * d1.x) / (sp * sp * sp) : 0;
  const vEnd = progress(spec.grounded, v0, flight.T * 0.88).v;
  const aRight = kappaRight * vEnd * vEnd;
  const spinY = spec.grounded ? 0 : clamp(aRight / (MAGNUS * Math.max(4, vEnd)), -90, 90);
  const spinX = spec.grounded
    ? v0 / R
    : spec.kind === "chip" ? -16 : spec.lofted ? -9 : spec.kind === "header" ? 2 : 7;
  flight.spin = { x: spinX, y: spinY };
  return flight;
}

function paramAt(f: Flight, d: number) {
  const { arcLen, arcS } = f;
  if (d <= 0) return 0;
  const last = arcLen.length - 1;
  if (d >= arcLen[last]) return 1;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arcLen[mid] < d) lo = mid;
    else hi = mid;
  }
  const span = arcLen[hi] - arcLen[lo];
  const k = span > 1e-9 ? (d - arcLen[lo]) / span : 0;
  return arcS[lo] + (arcS[hi] - arcS[lo]) * k;
}

/** Posição e velocidade do voo desenhado em t (0..T). */
export function flightAt(f: Flight, t: number): { pos: Vec3; vel: Vec3 } {
  const tt = clamp(t, 0, f.T);
  const pr = progress(f.spec.grounded, f.v0, tt);
  const d = Math.min(pr.d, f.L);
  const s = paramAt(f, d);
  const xz = bezier(f, s);
  const tan = norm2(bezierD1(f, s));
  const v = f.stopsShort && tt >= f.T ? 0 : pr.v;
  const y = f.spec.grounded ? R : f.y0 + f.vy0 * tt - (G * tt * tt) / 2;
  const vy = f.spec.grounded ? 0 : f.vy0 - G * tt;
  return {
    pos: { x: xz.x, y: Math.max(R, y), z: xz.z },
    vel: { x: tan.x * v, y: vy, z: tan.z * v },
  };
}

/** Só a posição do voo em t (sem velocidade nem objetos intermediários); igual a flightAt(f, t).pos. */
export function flightPos(f: Flight, t: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const tt = clamp(t, 0, f.T);
  const d = Math.min(progressD(f, tt), f.L);
  const s = paramAt(f, d);
  const u = 1 - s;
  const a = u * u * u;
  const b = 3 * u * u * s;
  const c = 3 * u * s * s;
  const e = s * s * s;
  const y = f.spec.grounded ? R : f.y0 + f.vy0 * tt - (G * tt * tt) / 2;
  out.x = a * f.p0.x + b * f.p1.x + c * f.p2.x + e * f.p3.x;
  out.y = Math.max(R, y);
  out.z = a * f.p0.z + b * f.p1.z + c * f.p2.z + e * f.p3.z;
  return out;
}

/** Altura da bola quando o caminho passa mais perto de `p` (para limpar zagueiros). */
export function heightNear(f: Flight, p: Vec2) {
  let best = { dist: Infinity, t: 0, along: 0, point: { x: 0, z: 0 } as Vec2 };
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {
    const t = (f.T * i) / steps;
    const st = flightAt(f, t);
    const dd = hypot(st.pos.x - p.x, st.pos.z - p.z);
    if (dd < best.dist) best = { dist: dd, t, along: i / steps, point: { x: st.pos.x, z: st.pos.z } };
  }
  const st = flightAt(f, best.t);
  return { ...best, y: st.pos.y };
}

/** Caminho previsto para a cena desenhar (sem o erro). */
export function previewOf(f: Flight, points = 30): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= points; i += 1) {
    out.push(flightPos(f, (f.T * i) / points));
  }
  return out;
}

/** Altura máxima do voo desenhado. */
export function apexOf(f: Flight) {
  if (f.spec.grounded) return R;
  const tPeak = clamp(f.vy0 / G, 0, f.T);
  return Math.max(f.y0, f.y0 + f.vy0 * tPeak - (G * tPeak * tPeak) / 2, f.spec.target.y);
}

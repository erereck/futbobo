// Utilitários puros da simulação (sem three.js): vetores, sorteio com semente.

import type { Vec2, Vec3 } from "../types";

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 2;

export const dist2 = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
export const norm2 = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.z);
  return l > 1e-9 ? { x: a.x / l, z: a.z / l } : { x: 0, z: 1 };
};
/** Direita de quem anda em `d` (para +z, a direita é +x — a convenção do contrato). */
export const right2 = (d: Vec2): Vec2 => ({ x: d.z, z: -d.x });

/** Yaw do contrato: 0 olha +z, positivo gira de +z para +x. */
export const yawOf = (d: Vec2) => Math.atan2(d.x, d.z);
export const angleDelta = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
export const turnToward = (from: number, to: number, maxStep: number) => from + clamp(angleDelta(from, to), -maxStep, maxStep);

/** Ponto mais próximo de `p` no segmento ab (plano do chão): devolve o parâmetro 0..1 e a distância. */
export function closestOnSegment2(p: Vec2, a: Vec2, b: Vec2) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;
  const t = l2 > 1e-9 ? clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1) : 0;
  const x = a.x + abx * t;
  const z = a.z + abz * t;
  return { t, point: { x, z }, dist: Math.hypot(p.x - x, p.z - z) };
}

/** Distância de um ponto a um segmento em 3D (corpo do goleiro, cápsulas). */
export function closestOnSegment3(p: Vec3, a: Vec3, b: Vec3) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 1e-9 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2, 0, 1) : 0;
  const point = { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t };
  return { t, point, dist: Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z) };
}

// ------------------------------------------------------------------ sorteio

/** Hash estável (FNV-1a + mistura) de partes quaisquer. */
export function hashParts(...parts: Array<string | number>) {
  let h = 2166136261 >>> 0;
  const text = parts.join("|");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** mulberry32: rápido, determinístico, bom o bastante para jogo. */
export function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quase-normal (soma de uniformes), cortada em ±limit para não sair absurdo. */
export function gaussian(rand: () => number, limit = 2.2) {
  const g = (rand() + rand() + rand() + rand() - 2) * 1.732;
  return clamp(g, -limit, limit);
}

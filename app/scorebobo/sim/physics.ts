// Física da bola "solta" (depois do voo desenhado ou de uma batida): gravidade,
// arrasto quadrático, Magnus do efeito, quique, rolagem, traves e rede.
// Tudo em metros/segundos, passo fixo pequeno (ver FIXED_DT em game.ts).

import { PITCH, type BallState, type Vec3 } from "../types";
import { clamp } from "./math";

export const G = 9.81;
/** Arrasto quadrático por metro (½ρCdA/m de uma bola oficial, ~0,0125). */
export const DRAG_K = 0.0125;
/** Desaceleração da bola rolando na grama (m/s²), além do arrasto do ar. */
export const ROLL_DECEL = 0.85;
/** a = MAGNUS · (ω × v): com 40 rad/s a 25 m/s dá ~4,5 m/s² de curva. */
export const MAGNUS = 0.0045;
export const GROUND_RESTITUTION = 0.55;
export const POST_RESTITUTION = 0.62;
export const R = PITCH.ballRadius;

/** Centro das traves (eixo dos cilindros) e do travessão. */
export const POST_X = PITCH.goalHalfWidth + PITCH.postRadius;
export const BAR_Y = PITCH.goalHeight + PITCH.postRadius;
const NET_BACK_Z = PITCH.goalLineZ + PITCH.goalDepth;
/** Placas de publicidade: a bola não some da tela atrás do gol nem na lateral. */
const BOARD_Z = PITCH.goalLineZ + 5.5;
const BOARD_X = PITCH.halfWidth + 3.5;

const NET_K = 1700;
const NET_C = 26;
/** Na volta a rede quase não devolve (amortecimento perto do crítico): a bola morre dentro do gol em vez de voltar para o campo. */
const NET_C_OUT = 72;

export type FrameHit = { part: "post" | "bar"; point: Vec3 };
/** `speed`: velocidade da bola entrando na rede (normal ao pano); parada encostada, ~0. */
export type NetHit = { point: Vec3; plane: "back" | "side" | "roof"; speed: number };

/** Bola rolando (no chão, sem velocidade vertical relevante). */
export function isRolling(ball: BallState) {
  return ball.pos.y <= R + 0.004 && Math.abs(ball.vel.y) < 0.6;
}

/**
 * Um passo de física livre. Devolve se quicou no chão (para o som/pó).
 * `inGoal` liga as paredes de rede por dentro.
 */
export function freeStep(ball: BallState, dt: number) {
  const p = ball.pos;
  const v = ball.vel;
  let bounced = false;
  if (isRolling(ball)) {
    p.y = R;
    v.y = 0;
    const speed = Math.hypot(v.x, v.z);
    if (speed > 1e-4) {
      const next = Math.max(0, speed - (ROLL_DECEL + DRAG_K * speed * speed) * dt);
      const f = next / speed;
      v.x *= f;
      v.z *= f;
    } else {
      v.x = 0;
      v.z = 0;
    }
    p.x += v.x * dt;
    p.z += v.z * dt;
    // Rolando, o efeito vira giro de rolagem: o desenho da bola acompanha a velocidade.
    ball.spin.y *= Math.exp(-3 * dt);
    ball.spin.x = Math.hypot(v.x, v.z) / R;
  } else {
    const speed = Math.hypot(v.x, v.y, v.z);
    const wy = ball.spin.y;
    // ω = (0, wy, 0): ω × v = (wy·vz, 0, −wy·vx).
    const ax = -DRAG_K * speed * v.x + MAGNUS * wy * v.z;
    const ay = -G - DRAG_K * speed * v.y;
    const az = -DRAG_K * speed * v.z - MAGNUS * wy * v.x;
    v.x += ax * dt;
    v.y += ay * dt;
    v.z += az * dt;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    ball.spin.y *= Math.exp(-0.35 * dt);
    if (p.y < R) {
      p.y = R;
      if (v.y < 0) {
        bounced = -v.y > 1.2;
        v.y = -v.y * GROUND_RESTITUTION;
        if (v.y < 0.9) v.y = 0;
        // Atrito no quique: perde horizontal e parte do efeito.
        v.x *= 0.84;
        v.z *= 0.84;
        ball.spin.y *= 0.55;
        ball.spin.x = Math.hypot(v.x, v.z) / R * 0.6;
      }
    }
  }
  // Placas: a bola volta mansa em vez de sumir.
  // A placa amortece quase tudo (a bola que voltava forte entrava no gol por trás).
  if (p.z > BOARD_Z && v.z > 0) {
    p.z = BOARD_Z;
    v.z = -v.z * 0.15;
    v.x *= 0.5;
  }
  if (Math.abs(p.x) > BOARD_X && Math.sign(v.x) === Math.sign(p.x)) {
    p.x = Math.sign(p.x) * BOARD_X;
    v.x = -v.x * 0.3;
  }
  return bounced;
}

/** Colisão com um cilindro de eixo ab e raio rc. Reflete a velocidade. */
function collideCylinder(ball: BallState, a: Vec3, b: Vec3, rc: number, restitution: number) {
  const p = ball.pos;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2, 0, 1);
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  let nx = p.x - cx;
  let ny = p.y - cy;
  let nz = p.z - cz;
  const d = Math.hypot(nx, ny, nz);
  const minD = rc + R;
  if (d >= minD || d < 1e-6) return null;
  nx /= d;
  ny /= d;
  nz /= d;
  // Empurra para fora e reflete só a componente que entra.
  p.x = cx + nx * minD;
  p.y = cy + ny * minD;
  p.z = cz + nz * minD;
  const v = ball.vel;
  const vn = v.x * nx + v.y * ny + v.z * nz;
  if (vn < 0) {
    v.x -= (1 + restitution) * vn * nx;
    v.y -= (1 + restitution) * vn * ny;
    v.z -= (1 + restitution) * vn * nz;
    v.x *= 0.92;
    v.y *= 0.92;
    v.z *= 0.92;
    ball.spin.y *= -0.4;
  }
  return { x: cx, y: cy, z: cz };
}

/** Traves e travessão. Só a primeira batida do passo conta. */
export function collideFrame(ball: BallState): FrameHit | null {
  const gz = PITCH.goalLineZ;
  if (Math.abs(ball.pos.z - gz) > 0.6 || ball.pos.y > BAR_Y + 0.5) return null;
  for (const side of [-1, 1]) {
    const hit = collideCylinder(ball, { x: side * POST_X, y: 0, z: gz }, { x: side * POST_X, y: BAR_Y, z: gz }, PITCH.postRadius, POST_RESTITUTION);
    if (hit) return { part: "post", point: hit };
  }
  const bar = collideCylinder(ball, { x: -POST_X, y: BAR_Y, z: gz }, { x: POST_X, y: BAR_Y, z: gz }, PITCH.postRadius, POST_RESTITUTION);
  if (bar) return { part: "bar", point: bar };
  return null;
}

/**
 * Rede: mola amortecida (a rede estica ~0,4 m e "segura" a bola). `inside`
 * diz se a bola entrou pela boca do gol (paredes por dentro) ou está do lado
 * de fora (rede lateral/teto por fora).
 */
export function collideNet(ball: BallState, inside: boolean, dt: number): NetHit | null {
  const p = ball.pos;
  const v = ball.vel;
  const hw = PITCH.goalHalfWidth;
  const gh = PITCH.goalHeight;
  const gz = PITCH.goalLineZ;
  let hit: NetHit | null = null;
  // vn > 0 entrando na rede, < 0 voltando.
  const spring = (pen: number, vn: number) => -NET_K * pen - (vn > 0 ? NET_C : NET_C_OUT) * vn;
  const damp = Math.exp(-5 * dt);
  if (inside) {
    const back = p.z + R - NET_BACK_Z;
    if (back > 0) {
      const vn = v.z;
      v.z += spring(back, vn) * dt;
      v.x *= damp;
      v.y *= damp;
      hit = { point: { x: p.x, y: p.y, z: NET_BACK_Z }, plane: "back", speed: Math.max(0, vn) };
    }
    if (p.z > gz + R) {
      const side = Math.abs(p.x) + R - hw;
      if (side > 0) {
        const s = Math.sign(p.x);
        const vn = v.x * s;
        v.x += s * spring(side, vn) * dt;
        v.z *= damp;
        hit ??= { point: { x: s * hw, y: p.y, z: p.z }, plane: "side", speed: Math.max(0, vn) };
      }
    }
    const roof = p.y + R - gh;
    if (roof > 0 && p.z > gz + R) {
      const vn = v.y;
      v.y += spring(roof, vn) * dt;
      v.x *= damp;
      v.z *= damp;
      hit ??= { point: { x: p.x, y: gh, z: p.z }, plane: "roof", speed: Math.max(0, vn) };
    }
    // A rede não deixa sair por trás nem pelos lados, mesmo com passo grande.
    p.z = Math.min(p.z, NET_BACK_Z + 0.55 - R);
    p.x = clamp(p.x, -hw - 0.5 + R, hw + 0.5 - R);
    return hit;
  }
  // Por fora: rede lateral e teto.
  if (p.z > gz + 0.05 && p.z < NET_BACK_Z + R) {
    const s = Math.sign(p.x) || 1;
    const out = hw + R - Math.abs(p.x);
    if (out > 0 && out < 0.5 && p.y < gh) {
      const vn = -v.x * s;
      v.x -= s * spring(out, Math.max(0, vn)) * dt;
      v.z *= damp;
      hit = { point: { x: s * hw, y: p.y, z: p.z }, plane: "side", speed: Math.max(0, vn) };
    }
    const top = gh + R - p.y;
    if (top > 0 && top < 0.5 && Math.abs(p.x) < hw) {
      const vn = -v.y;
      v.y -= spring(top, Math.max(0, vn)) * dt;
      v.x *= damp;
      v.z *= damp;
      hit ??= { point: { x: p.x, y: gh, z: p.z }, plane: "roof", speed: Math.max(0, vn) };
    }
  }
  // Por fora: a rede de trás (bola que volta da placa não entra no gol pelas costas).
  if (p.z > NET_BACK_Z - 0.6 && p.z - R < NET_BACK_Z && v.z < 0 && Math.abs(p.x) < hw + R && p.y < gh + R) {
    const vn = -v.z;
    p.z = NET_BACK_Z + R;
    v.z = vn * 0.2;
    v.x *= 0.7;
    hit ??= { point: { x: p.x, y: p.y, z: NET_BACK_Z }, plane: "back", speed: vn };
  }
  return hit;
}

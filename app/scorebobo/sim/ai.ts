// IA de linha: companheiros (corridas desenhadas na fase, ajuste para receber)
// e zagueiros (segurar a linha, pressionar, marcar, barreira, cortar o passe).

import { PITCH, type Actor, type BallState, type Vec2, type Vec3 } from "../types";
import { clamp, dist2, yawOf, turnToward, hypot } from "./math";

export const RUN_SPEED = 7.2;
export const SPRINT_SPEED = 8.2;
export const DEFENDER_SPEED = 6.6;
/** Altura da cabeça de um jogador em pé (m) e do salto máximo. */
export const HEAD_Y = 1.82;
export const JUMP_MAX = 0.5;
const JUMP_TIME = 0.62;

export type MateBrain = {
  actor: Actor;
  run: Vec2[];
  runIdx: number;
  /** Indo receber um passe: chega em `target` no tempo `at` (tempo de jogo). */
  receive: { target: Vec2; at: number } | null;
  /** Depois de passar: corrida de apoio (tabela). */
  support: Vec2 | null;
  jumpStart: number | null;
};

export type DefenderBrain = {
  actor: Actor;
  behavior: "hold" | "press" | "wall" | "markNearest";
  home: Vec2;
  mark: string | null;
  jumpStart: number | null;
  /** Instante em que ele reage à bola solta (tempo de jogo). */
  reactAt: number;
  /** Ponto do caminho da bola que ele está tentando cortar. */
  chase: Vec2 | null;
};

/** Anda/corre até `target` com aceleração limitada; vira o corpo para onde corre (ou para `face`). */
export function moveToward(a: Actor, target: Vec2, maxSpeed: number, dt: number, face: Vec2 | null, accel = 11) {
  const dx = target.x - a.pos.x;
  const dz = target.z - a.pos.z;
  const d = hypot(dx, dz);
  // Chega freando, sem passar do ponto.
  const want = d < 0.05 ? 0 : Math.min(maxSpeed, Math.sqrt(2 * accel * 0.8 * d), d / dt);
  const wx = d > 1e-6 ? (dx / d) * want : 0;
  const wz = d > 1e-6 ? (dz / d) * want : 0;
  const maxDv = accel * dt;
  a.vel.x += clamp(wx - a.vel.x, -maxDv, maxDv);
  a.vel.z += clamp(wz - a.vel.z, -maxDv, maxDv);
  a.pos.x += a.vel.x * dt;
  a.pos.z += a.vel.z * dt;
  const speed = hypot(a.vel.x, a.vel.z);
  const yaw = speed > 2.2 || !face ? (speed > 0.3 ? yawOf(a.vel) : a.facing) : yawOf({ x: face.x - a.pos.x, z: face.z - a.pos.z });
  a.facing = turnToward(a.facing, yaw, dt * 9);
  return speed;
}

/** Olha para (x, y, z) reaproveitando o objeto do olhar (a gravação e o replay copiam os valores). */
export function lookAt(a: Actor, x: number, y: number, z: number) {
  const look = a.look;
  if (look) {
    look.x = x;
    look.y = y;
    look.z = z;
  } else a.look = { x, y, z };
}

export function settlePose(a: Actor, speed: number) {
  if (speed > 1.1) {
    a.pose = "run";
    a.poseT = clamp(speed / SPRINT_SPEED, 0, 1);
  } else {
    a.pose = a.role === "keeper" ? "keeperReady" : "ready";
    a.poseT = 0;
  }
}

/** Salto (cabeceio/barreira): altura no instante. */
export function jumpHeight(start: number | null, time: number, max = JUMP_MAX) {
  if (start === null) return 0;
  const u = (time - start) / JUMP_TIME;
  if (u <= 0 || u >= 1) return 0;
  return max * Math.sin(Math.PI * u);
}

/** Quanto um companheiro corre em `t` s (quem sai parado perde um pouco até embalar, ~9 m/s²). */
export function runDistanceAfter(m: MateBrain, t: number, speed = RUN_SPEED) {
  const v0 = hypot(m.actor.vel.x, m.actor.vel.z);
  const startup = Math.max(0, speed - v0) ** 2 / (2 * 9);
  return Math.max(0, Math.max(0, t) * speed - startup);
}

/** Ponto da corrida de um companheiro `t` segundos à frente (andando na velocidade de corrida); `out` evita alocar. */
export function runPositionAfter(m: MateBrain, t: number, speed = RUN_SPEED, out: Vec2 = { x: 0, z: 0 }): Vec2 {
  let x = m.actor.pos.x;
  let z = m.actor.pos.z;
  let left = runDistanceAfter(m, t, speed);
  for (let i = m.runIdx; i < m.run.length && left > 0; i += 1) {
    const wp = m.run[i];
    const d = hypot(x - wp.x, z - wp.z);
    if (d <= left) {
      left -= d;
      x = wp.x;
      z = wp.z;
    } else {
      x = x + ((wp.x - x) * left) / d;
      z = z + ((wp.z - z) * left) / d;
      left = 0;
    }
  }
  out.x = x;
  out.z = z;
  return out;
}

export function updateMate(m: MateBrain, dt: number, time: number, ball: BallState, playing: boolean) {
  const a = m.actor;
  const ballXZ = { x: ball.pos.x, z: ball.pos.z };
  lookAt(a, ball.pos.x, ball.pos.y, ball.pos.z);
  a.jump = jumpHeight(m.jumpStart, time, 0.55);
  if (m.jumpStart !== null && time - m.jumpStart > JUMP_TIME) m.jumpStart = null;
  if (!playing) {
    settlePose(a, moveToward(a, a.pos, 0, dt, ballXZ));
    return;
  }
  let speed: number;
  if (m.receive) {
    // Chega um pouco antes da bola (atrasado, ela passa na frente dele).
    const left = Math.max(0.05, m.receive.at - time - 0.25);
    const d = dist2(a.pos, m.receive.target);
    // Chega na hora: nem antes (fica parado esperando) nem tarde.
    const need = clamp(d / left, d > 0.4 ? 2.5 : 0, SPRINT_SPEED);
    speed = moveToward(a, m.receive.target, need, dt, ballXZ);
    // Ainda na corrida: avança os pontos já passados.
    while (m.runIdx < m.run.length && dist2(a.pos, m.run[m.runIdx]) < 1.5) m.runIdx += 1;
  } else if (m.support) {
    speed = moveToward(a, m.support, RUN_SPEED * 0.85, dt, ballXZ);
    if (dist2(a.pos, m.support) < 0.4) m.support = null;
  } else if (m.runIdx < m.run.length) {
    const wp = m.run[m.runIdx];
    speed = moveToward(a, wp, RUN_SPEED, dt, ballXZ, 9);
    if (dist2(a.pos, wp) < 0.6) m.runIdx += 1;
  } else {
    speed = moveToward(a, a.pos, 0, dt, ballXZ);
  }
  settlePose(a, speed);
  if (a.jump && a.jump > 0.02) {
    a.pose = "header";
    a.poseT = clamp((time - (m.jumpStart ?? time)) / JUMP_TIME, 0, 0.45);
  } else if (m.receive && ball.pos.y < 0.7) {
    // Bola rasteira chegando: ajeita o corpo para dominar.
    const near = hypot(ball.pos.x - a.pos.x, ball.pos.z - a.pos.z);
    if (near < 3.5) {
      a.pose = "receive";
      a.poseT = clamp(1 - near / 3.5, 0, 0.5);
    }
  }
}

/** Caminho da bola nos próximos instantes (o jogo fornece: voo desenhado ou balística). */
export type BallForecast = (dt: number) => Vec3;

export function updateDefender(
  d: DefenderBrain,
  dt: number,
  time: number,
  ball: BallState,
  mates: MateBrain[],
  forecast: BallForecast | null,
  playing: boolean,
) {
  const a = d.actor;
  const ballXZ = { x: ball.pos.x, z: ball.pos.z };
  lookAt(a, ball.pos.x, ball.pos.y, ball.pos.z);
  a.jump = jumpHeight(d.jumpStart, time, d.behavior === "wall" ? 0.42 : JUMP_MAX);
  if (d.jumpStart !== null && time - d.jumpStart > JUMP_TIME) d.jumpStart = null;
  if (d.behavior === "wall") {
    a.vel = { x: 0, z: 0 };
    a.facing = turnToward(a.facing, yawOf({ x: ballXZ.x - a.pos.x, z: ballXZ.z - a.pos.z }), dt * 6);
    a.pose = a.jump > 0.02 ? "jump" : "wall";
    a.poseT = a.jump > 0.02 ? clamp((time - (d.jumpStart ?? time)) / JUMP_TIME, 0, 1) : 0;
    return;
  }
  if (!playing) {
    settlePose(a, moveToward(a, a.pos, 0, dt, ballXZ));
    return;
  }
  let target: Vec2 = d.home;
  let maxSpeed = DEFENDER_SPEED * 0.75;
  const goal = { x: 0, z: PITCH.goalLineZ };
  if (d.behavior === "hold") {
    // Linha: acompanha a bola de lado e recua quando ela avança.
    const shift = clamp((ball.pos.x - d.home.x) * 0.2, -3.5, 3.5);
    const drop = clamp((ball.pos.z - (d.home.z - 14)) * 0.22, 0, 4);
    target = { x: d.home.x + shift, z: Math.min(PITCH.goalLineZ - 3, d.home.z + drop) };
  } else if (d.behavior === "press") {
    const toGoal = { x: goal.x - ballXZ.x, z: goal.z - ballXZ.z };
    const l = hypot(toGoal.x, toGoal.z) || 1;
    target = { x: ballXZ.x + (toGoal.x / l) * 1.3, z: ballXZ.z + (toGoal.z / l) * 1.3 };
    maxSpeed = DEFENDER_SPEED * 0.9;
  } else if (d.behavior === "markNearest") {
    const mark = mates.find((m) => m.actor.id === d.mark)?.actor;
    if (mark) {
      // Marca reagindo: segue onde o atacante ESTAVA (~0,4 s atrás). Parado, fica
      // colado; numa corrida em diagonal, o atacante abre espaço — é a graça da corrida.
      const seen = { x: mark.pos.x - mark.vel.x * 0.4, z: mark.pos.z - mark.vel.z * 0.4 };
      const toGoal = { x: goal.x - seen.x, z: goal.z - seen.z };
      const l = hypot(toGoal.x, toGoal.z) || 1;
      const toBall = { x: ballXZ.x - seen.x, z: ballXZ.z - seen.z };
      const lb = hypot(toBall.x, toBall.z) || 1;
      target = {
        x: seen.x + (toGoal.x / l) * 1.0 + (toBall.x / lb) * 0.5,
        z: seen.z + (toGoal.z / l) * 1.0 + (toBall.z / lb) * 0.5,
      };
      maxSpeed = DEFENDER_SPEED * 0.94;
    }
  }
  // Bola solta passando por perto: tenta cortar.
  d.chase = null;
  if (forecast && time >= d.reactAt) {
    for (let k = 1; k <= 16; k += 1) {
      const ahead = k * 0.06;
      const p = forecast(ahead);
      if (p.y > HEAD_Y + JUMP_MAX + 0.1) continue;
      const gap = hypot(p.x - a.pos.x, p.z - a.pos.z) - 0.7;
      if (gap <= DEFENDER_SPEED * 0.92 * ahead && gap < 2.6) {
        d.chase = { x: p.x, z: p.z };
        target = d.chase;
        maxSpeed = DEFENDER_SPEED;
        break;
      }
    }
  }
  const speed = moveToward(a, target, maxSpeed, dt, ballXZ);
  settlePose(a, speed);
  if (a.jump > 0.02) {
    a.pose = "jump";
    a.poseT = clamp((time - (d.jumpStart ?? time)) / JUMP_TIME, 0, 1);
  }
}

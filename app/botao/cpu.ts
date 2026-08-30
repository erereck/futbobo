// Adversário controlado pela máquina.
//
// A CPU não trapaceia: ela gera toques candidatos, simula cada um no mesmo
// motor que o jogador usa e escolhe o melhor por heurística. A dificuldade muda
// quantos candidatos ela enxerga, quanto erro de avaliação ela comete e quanto
// a mão dela treme na hora de bater.

import {
  FIELD,
  GOAL_LEFT,
  GOAL_RIGHT,
  attackGoalY,
  ballOf,
  beginShot,
  cloneMatch,
  discsOf,
  managerRosterFor,
  otherSide,
  ownGoalY,
  shotSpeedForBody,
  speedForDistance,
  substitutePlayer,
  substitutionCount,
  stepMatch,
  type BotaoBody,
  type BotaoMatchState,
} from "./engine";
import type { Rng } from "./rng";
import type { BotaoDifficulty, BotaoShot, BotaoSide } from "./types";

type CpuProfile = {
  candidates: number;
  /** Ruído na avaliação: a CPU fraca confunde um lance bom com um ruim. */
  noise: number;
  blunder: number;
  aimJitter: number;
  powerJitter: number;
};

const CPU_PROFILES: Record<BotaoDifficulty, CpuProfile> = {
  1: { candidates: 10, noise: 900, blunder: 0.3, aimJitter: 0.16, powerJitter: 0.28 },
  2: { candidates: 16, noise: 620, blunder: 0.2, aimJitter: 0.11, powerJitter: 0.2 },
  3: { candidates: 24, noise: 400, blunder: 0.12, aimJitter: 0.07, powerJitter: 0.14 },
  // Nem no nível 5 a CPU é perfeita: mesa de botão tem trave, rebote e azar.
  4: { candidates: 32, noise: 300, blunder: 0.08, aimJitter: 0.05, powerJitter: 0.11 },
  5: { candidates: 42, noise: 190, blunder: 0.05, aimJitter: 0.032, powerJitter: 0.08 },
};

const ROLLOUT_DT = 1 / 50;
const ROLLOUT_SECONDS = 3.2;

/**
 * Habilidade contínua (1..5) a partir da força do clube.
 *
 * A escada inteira de 1 a 5 tem degraus grandes: um nível a mais vale uns 14
 * pontos percentuais de vitória. Com limiares fixos, 80,9 de rating virava
 * nível 4 e 80,4 virava 3 — o balanceamento dependia de arredondamento. Aqui a
 * habilidade varia de forma suave e os perfis são interpolados.
 */
export function difficultyScore(strength: number): number {
  return Math.max(1, Math.min(5, 1 + (strength - 66) / 5));
}

/** Versão arredondada, para exibir na interface. */
export function difficultyFromStrength(strength: number): BotaoDifficulty {
  return Math.round(difficultyScore(strength)) as BotaoDifficulty;
}

/** Habilidade com que a CPU joga o próprio lado. */
export function cpuSkillFor(cpuStrength: number): number {
  return difficultyScore(cpuStrength);
}

/** Interpola entre os perfis inteiros vizinhos. */
export function cpuProfileFor(level: number): CpuProfile {
  const clamped = Math.max(1, Math.min(5, level));
  const low = Math.floor(clamped) as BotaoDifficulty;
  const high = Math.min(5, low + 1) as BotaoDifficulty;
  const ratio = clamped - low;
  const from = CPU_PROFILES[low];
  const to = CPU_PROFILES[high];
  const mix = (a: number, b: number) => a + (b - a) * ratio;
  return {
    candidates: Math.round(mix(from.candidates, to.candidates)),
    noise: mix(from.noise, to.noise),
    blunder: mix(from.blunder, to.blunder),
    aimJitter: mix(from.aimJitter, to.aimJitter),
    powerJitter: mix(from.powerJitter, to.powerJitter),
  };
}

type Point = { x: number; y: number };

/** O toque realmente encosta na bola? Testa a distância da bola até a reta do toque. */
function aimHitsBall(disc: BotaoBody, ball: BotaoBody, aim: Point): boolean {
  const dx = aim.x - disc.x;
  const dy = aim.y - disc.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return false;
  const nx = dx / length;
  const ny = dy / length;
  const toBallX = ball.x - disc.x;
  const toBallY = ball.y - disc.y;
  const projection = toBallX * nx + toBallY * ny;
  if (projection <= 0) return false;
  const perpendicular = Math.abs(toBallX * ny - toBallY * nx);
  return perpendicular < disc.radius + ball.radius - 1;
}

/** Ponto de contato para empurrar a bola em direção a `target`. */
function contactPoint(ball: BotaoBody, discRadius: number, target: Point): Point {
  const dx = target.x - ball.x;
  const dy = target.y - ball.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: ball.x - (dx / length) * (discRadius + ball.radius) * 0.92,
    y: ball.y - (dy / length) * (discRadius + ball.radius) * 0.92,
  };
}

function shotTowards(disc: BotaoBody, aim: Point, ratio: number): BotaoShot {
  const dx = aim.x - disc.x;
  const dy = aim.y - disc.y;
  const length = Math.hypot(dx, dy) || 1;
  const speed = shotSpeedForBody(disc) * ratio;
  return { bodyId: disc.id, vx: (dx / length) * speed, vy: (dy / length) * speed };
}

function attackTargets(side: BotaoSide): Point[] {
  const goalY = attackGoalY(side);
  return [
    { x: FIELD.width / 2, y: goalY },
    { x: GOAL_LEFT + 14, y: goalY },
    { x: GOAL_RIGHT - 14, y: goalY },
  ];
}

function buildCandidates(state: BotaoMatchState, side: BotaoSide, profile: CpuProfile, rng: Rng): BotaoShot[] {
  const ball = ballOf(state);
  const discs = discsOf(state, side);
  const mates = discs.slice();
  const byDistance = discs
    .map((disc) => ({ disc, distance: Math.hypot(disc.x - ball.x, disc.y - ball.y) }))
    .sort((a, b) => a.distance - b.distance);

  const candidates: BotaoShot[] = [];
  const targets = attackTargets(side);

  // Toques na bola: chute ao gol, tabela e passe para os companheiros adiantados.
  for (const { disc } of byDistance.slice(0, 4)) {
    const passTargets = mates
      .filter((mate) => mate.id !== disc.id)
      .map((mate) => ({ x: mate.x, y: mate.y }));
    const allTargets = [...targets, ...passTargets.slice(0, 3)];
    for (const target of allTargets) {
      const contact = contactPoint(ball, disc.radius, target);
      if (!aimHitsBall(disc, ball, contact)) continue;
      for (const ratio of [1, 0.72, 0.48]) {
        candidates.push(shotTowards(disc, contact, ratio));
      }
    }
    // Pancada direta na bola: alívio quando não há ângulo.
    if (aimHitsBall(disc, ball, { x: ball.x, y: ball.y })) {
      candidates.push(shotTowards(disc, { x: ball.x, y: ball.y }, 1));
      candidates.push(shotTowards(disc, { x: ball.x, y: ball.y }, 0.6));
    }
  }

  // Reposicionamento: fechar a linha entre a bola e o próprio gol.
  const guardY = ownGoalY(side);
  const guard: Point = { x: (ball.x + FIELD.width / 2) / 2, y: (ball.y + guardY) / 2 };
  for (const { disc, distance } of byDistance.slice(2)) {
    if (distance < 60) continue;
    const travel = Math.hypot(guard.x - disc.x, guard.y - disc.y);
    if (travel < 20) continue;
    // Reposicionamento curto gerava toque fraco demais para ser legal; se a
    // burrada da CPU escolhesse justo esse, o turno dela morria sem nada acontecer.
    const speed = Math.max(shotSpeedForBody(disc) * 0.085, speedForDistance(travel));
    const length = travel || 1;
    candidates.push({
      bodyId: disc.id,
      vx: ((guard.x - disc.x) / length) * speed,
      vy: ((guard.y - disc.y) / length) * speed,
    });
  }

  if (candidates.length === 0) {
    // Nada viável: dá um toque em direção à bola com o disco mais próximo.
    const disc = byDistance[0]?.disc;
    if (disc) candidates.push(shotTowards(disc, { x: ball.x, y: ball.y }, 0.8));
  }

  if (candidates.length <= profile.candidates) return candidates;
  // Mantém os primeiros (mais intencionais) e sorteia o resto.
  const kept = candidates.slice(0, Math.ceil(profile.candidates * 0.6));
  const pool = candidates.slice(kept.length);
  while (kept.length < profile.candidates && pool.length > 0) {
    kept.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  }
  return kept;
}

function evaluate(state: BotaoMatchState, side: BotaoSide, before: { user: number; cpu: number }, touchedBall: boolean): number {
  const opponent = otherSide(side);
  const ball = ballOf(state);
  let score = 0;

  score += 4200 * (state.score[side] - before[side]);
  score -= 5400 * (state.score[opponent] - before[opponent]);

  const goalY = attackGoalY(side);
  score -= Math.hypot(ball.x - FIELD.width / 2, ball.y - goalY) * 1.4;

  const mine = discsOf(state, side);
  const theirs = discsOf(state, opponent);
  const nearestMine = Math.min(...mine.map((disc) => Math.hypot(disc.x - ball.x, disc.y - ball.y)));
  const nearestTheirs = Math.min(...theirs.map((disc) => Math.hypot(disc.x - ball.x, disc.y - ball.y)));
  score += (nearestTheirs - nearestMine) * 1.2;

  const dangerY = ownGoalY(side);
  const danger = Math.hypot(ball.x - FIELD.width / 2, ball.y - dangerY);
  if (danger < 160) score -= (160 - danger) * 2.4;

  // Manter gente entre a bola e o próprio gol.
  const covering = mine.filter((disc) => (dangerY === 0 ? disc.y < ball.y : disc.y > ball.y)).length;
  score += Math.min(covering, 2) * 30;

  if (!touchedBall) score -= 140;
  return score;
}

/** Roda o toque em uma cópia do estado e devolve a nota. */
function rollout(state: BotaoMatchState, shot: BotaoShot, side: BotaoSide): number {
  const clone = cloneMatch(state);
  const before = { ...clone.score };
  const touchesBefore = clone.touches.length;
  if (!beginShot(clone, shot)) return Number.NEGATIVE_INFINITY;
  let elapsed = 0;
  while (clone.phase === "resolving" && elapsed < ROLLOUT_SECONDS) {
    stepMatch(clone, ROLLOUT_DT);
    elapsed += ROLLOUT_DT;
  }
  const touchedBall = clone.touches.length > touchesBefore;
  return evaluate(clone, side, before, touchedBall);
}

function jitterShot(shot: BotaoShot, disc: BotaoBody, profile: CpuProfile, rng: Rng): BotaoShot {
  const speed = Math.hypot(shot.vx, shot.vy);
  if (speed < 1) return shot;
  const precision = 1 - disc.control / 220;
  const angle = Math.atan2(shot.vy, shot.vx) + rng.range(-1, 1) * profile.aimJitter * precision;
  const power = speed * (1 + rng.range(-1, 1) * profile.powerJitter * precision);
  const capped = Math.max(shotSpeedForBody(disc) * 0.12, Math.min(power, shotSpeedForBody(disc)));
  return { bodyId: shot.bodyId, vx: Math.cos(angle) * capped, vy: Math.sin(angle) * capped };
}

/** Escolhe o toque da CPU para o turno atual. `skill` aceita valor fracionário. */
export function chooseCpuShot(state: BotaoMatchState, skill: number, rng: Rng, side: BotaoSide = "cpu"): BotaoShot | null {
  const profile = cpuProfileFor(skill);
  const candidates = buildCandidates(state, side, profile, rng);
  if (candidates.length === 0) return null;

  let best: BotaoShot | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const score = rollout(state, candidate, side) + rng.range(-profile.noise, profile.noise);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  const chosen = rng.chance(profile.blunder) ? rng.pick(candidates) : best;
  if (!chosen) return null;
  const disc = state.bodies.find((body) => body.id === chosen.bodyId);
  return disc ? jitterShot(chosen, disc, profile, rng) : chosen;
}

/** A CPU só troca quando é a vez dela e o motor está pronto para um novo toque. */
export function chooseCpuSubstitution(state: BotaoMatchState, side: BotaoSide, rng: Rng): boolean {
  const roster = managerRosterFor(state, side);
  if (!roster || state.phase !== "aim" && state.phase !== "kickoff" || state.turn !== side || substitutionCount(state, side) >= 3) return false;
  if (roster.bench.length === 0) return false;
  const active = discsOf(state, side)
    .filter((disc) => Boolean(disc.playerId))
    .sort((a, b) => a.stamina - b.stamina);
  const outgoing = active[0];
  if (!outgoing || outgoing.stamina > 38) return false;
  const outgoingRating = outgoing.power + outgoing.control;
  const viable = roster.bench
    .filter((player) => player.id)
    .filter((player) => (player.power ?? player.overall) + (player.control ?? player.overall) >= outgoingRating - 16)
    .sort((a, b) => b.overall - a.overall);
  const incoming = viable[0] ?? roster.bench[0];
  if (!incoming?.id) return false;
  // Um pouco de personalidade: a CPU nem sempre troca no primeiro frame de fadiga.
  if (outgoing.stamina > 28 && rng.next() < 0.35) return false;
  return substitutePlayer(state, side, outgoing.id, incoming.id);
}

/** Cobrança de pênalti da CPU: mira no canto mais longe do goleiro. */
export function chooseCpuPenaltyShot(
  state: BotaoMatchState,
  shooter: BotaoBody,
  keeper: BotaoBody,
  skill: number,
  rng: Rng,
): BotaoShot {
  const ball = ballOf(state);
  const goalY = attackGoalY(state.penalties?.turn ?? "cpu");
  const keeperOnLeft = keeper.x < FIELD.width / 2;
  const baseX = keeperOnLeft ? GOAL_RIGHT - 16 : GOAL_LEFT + 16;
  const spread = 46 - skill * 7;
  const target = { x: baseX + rng.range(-spread, spread), y: goalY };
  const contact = contactPoint(ball, shooter.radius, target);
  const shot = shotTowards(shooter, contact, 0.94);
  return jitterShot(shot, shooter, cpuProfileFor(skill), rng);
}

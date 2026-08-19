import {
  FIELD,
  GOAL_BOTTOM,
  GOAL_TOP,
  attackGoalX,
  ballOf,
  beginShot,
  cloneMatch,
  discsOf,
  minShotSpeed,
  otherSide,
  ownGoalX,
  shotSpeedFor,
  speedForDistance,
  stepMatch,
} from "./engine";
import { createRng, hashSeed, type Rng } from "./rng";
import type { Body, MatchState, Shot, Side } from "./types";

type Point = { x: number; y: number };

type Candidate = Shot & { kind: "attack" | "pass" | "clear" | "shape" };

function shotTowards(disc: Body, point: Point, ratio: number, kind: Candidate["kind"]): Candidate {
  const dx = point.x - disc.x;
  const dy = point.y - disc.y;
  const length = Math.hypot(dx, dy) || 1;
  const speed = shotSpeedFor(disc.power) * ratio;
  return { bodyId: disc.id, vx: dx / length * speed, vy: dy / length * speed, kind };
}

function goalTargets(side: Side): Point[] {
  const x = attackGoalX(side);
  const mid = (GOAL_TOP + GOAL_BOTTOM) / 2;
  return [
    { x, y: mid },
    { x, y: GOAL_TOP + 34 },
    { x, y: GOAL_BOTTOM - 34 },
  ];
}

function contactPoint(ball: Body, disc: Body, target: Point): Point {
  const dx = target.x - ball.x;
  const dy = target.y - ball.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: ball.x - dx / length * (ball.radius + disc.radius) * 0.94,
    y: ball.y - dy / length * (ball.radius + disc.radius) * 0.94,
  };
}

function lineCanReachBall(disc: Body, ball: Body, point: Point) {
  const dx = point.x - disc.x;
  const dy = point.y - disc.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return false;
  const nx = dx / length;
  const ny = dy / length;
  const toBallX = ball.x - disc.x;
  const toBallY = ball.y - disc.y;
  const projection = toBallX * nx + toBallY * ny;
  if (projection <= 0) return false;
  const perpendicular = Math.abs(toBallX * ny - toBallY * nx);
  return perpendicular <= disc.radius + ball.radius - 1;
}

function buildCandidates(state: MatchState, side: Side, rng: Rng): Candidate[] {
  const ball = ballOf(state);
  const discs = discsOf(state, side);
  const byDistance = discs
    .map((disc) => ({ disc, distance: Math.hypot(disc.x - ball.x, disc.y - ball.y) }))
    .sort((a, b) => a.distance - b.distance);
  const candidates: Candidate[] = [];

  // 1) As peças mais próximas tentam finalizar ou progredir a bola.
  for (const { disc } of byDistance.slice(0, 7)) {
    const attackTargets = goalTargets(side);
    const forwardMates = discs
      .filter((mate) => mate.id !== disc.id)
      .sort((a, b) => side === "user" ? b.x - a.x : a.x - b.x)
      .slice(0, 4)
      .map((mate) => ({ x: mate.x, y: mate.y }));
    const targets = [...attackTargets, ...forwardMates];
    targets.forEach((target, index) => {
      const contact = contactPoint(ball, disc, target);
      if (!lineCanReachBall(disc, ball, contact)) return;
      const kind: Candidate["kind"] = index < attackTargets.length ? "attack" : "pass";
      candidates.push(shotTowards(disc, contact, 1, kind));
      candidates.push(shotTowards(disc, contact, kind === "attack" ? 0.72 : 0.56, kind));
    });

    if (lineCanReachBall(disc, ball, ball)) {
      candidates.push(shotTowards(disc, ball, 0.9, "clear"));
    }
  }

  // 2) Peças distantes fecham linhas ou avançam a estrutura.
  const ownX = ownGoalX(side);
  const attackX = attackGoalX(side);
  for (const { disc, distance } of byDistance.slice(4)) {
    if (disc.role === "GK" && distance > 280) continue;
    const towardOwnGoal = {
      x: ball.x * 0.62 + ownX * 0.38,
      y: ball.y * 0.72 + FIELD.height / 2 * 0.28,
    };
    const forward = {
      x: disc.x + (attackX > ownX ? 1 : -1) * 112,
      y: disc.y + rng.range(-76, 76),
    };
    [towardOwnGoal, forward].forEach((target) => {
      const dx = target.x - disc.x;
      const dy = target.y - disc.y;
      const travel = Math.hypot(dx, dy);
      if (travel < 24) return;
      const speed = Math.max(minShotSpeed(disc.power) * 1.05, Math.min(shotSpeedFor(disc.power) * 0.5, speedForDistance(travel)));
      candidates.push({ bodyId: disc.id, vx: dx / travel * speed, vy: dy / travel * speed, kind: "shape" });
    });
  }

  if (!candidates.length && byDistance[0]) {
    candidates.push(shotTowards(byDistance[0].disc, ball, 0.75, "clear"));
  }

  // Mantém variedade sem transformar cada turno em um benchmark de física.
  const attack = candidates.filter((candidate) => candidate.kind === "attack").slice(0, 12);
  const others = candidates.filter((candidate) => candidate.kind !== "attack");
  const picked = [...attack];
  while (picked.length < 30 && others.length) {
    const index = Math.floor(rng.next() * others.length);
    picked.push(others.splice(index, 1)[0]);
  }
  return picked;
}

function evaluate(state: MatchState, side: Side, before: Record<Side, number>) {
  const opponent = otherSide(side);
  const ball = ballOf(state);
  const attackX = attackGoalX(side);
  const ownX = ownGoalX(side);
  let score = 0;

  score += (state.score[side] - before[side]) * 100_000;
  score -= (state.score[opponent] - before[opponent]) * 120_000;

  const goalY = (GOAL_TOP + GOAL_BOTTOM) / 2;
  const attackDistance = Math.hypot(ball.x - attackX, (ball.y - goalY) * 0.65);
  const ownDistance = Math.hypot(ball.x - ownX, (ball.y - goalY) * 0.65);
  score -= attackDistance * 2.2;
  if (ownDistance < 360) score -= (360 - ownDistance) * 4.8;

  const mine = discsOf(state, side);
  const theirs = discsOf(state, opponent);
  const nearestMine = Math.min(...mine.map((disc) => Math.hypot(disc.x - ball.x, disc.y - ball.y)));
  const nearestTheirs = Math.min(...theirs.map((disc) => Math.hypot(disc.x - ball.x, disc.y - ball.y)));
  score += (nearestTheirs - nearestMine) * 1.4;

  // Presença entre bola e gol próprio, mas sem premiar ônibus completo.
  const covering = mine.filter((disc) => side === "user" ? disc.x < ball.x : disc.x > ball.x).length;
  score += Math.min(covering, 5) * 34;

  // Espalhamento: evita onze peças amontoadas no mesmo ponto.
  let spacing = 0;
  for (let i = 0; i < mine.length; i += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let j = 0; j < mine.length; j += 1) {
      if (i === j) continue;
      nearest = Math.min(nearest, Math.hypot(mine[i].x - mine[j].x, mine[i].y - mine[j].y));
    }
    spacing += Math.min(nearest, 165);
  }
  score += spacing * 0.08;
  return score;
}

function rollout(state: MatchState, candidate: Candidate, side: Side) {
  const clone = cloneMatch(state);
  const before = { ...clone.score };
  if (!beginShot(clone, candidate)) return Number.NEGATIVE_INFINITY;
  let elapsed = 0;
  while (clone.phase === "resolving" && elapsed < 1.7) {
    stepMatch(clone, 1 / 45);
    elapsed += 1 / 45;
  }
  return evaluate(clone, side, before);
}

function jitter(candidate: Candidate, disc: Body, strength: number, rng: Rng): Shot {
  const speed = Math.hypot(candidate.vx, candidate.vy);
  const angle = Math.atan2(candidate.vy, candidate.vx);
  const skill = Math.max(0, Math.min(1, (strength - 58) / 34));
  const control = disc.control / 100;
  const error = (1 - skill * 0.62 - control * 0.25);
  const nextAngle = angle + rng.range(-0.055, 0.055) * Math.max(0.15, error);
  const nextSpeed = speed * (1 + rng.range(-0.09, 0.09) * Math.max(0.2, error));
  return { bodyId: candidate.bodyId, vx: Math.cos(nextAngle) * nextSpeed, vy: Math.sin(nextAngle) * nextSpeed };
}

export function chooseCpuShot(state: MatchState, side: Side = "cpu") {
  const rng = createRng(hashSeed(state.setup.seed, "cpu11", state.turns, state.score.user, state.score.cpu));
  const candidates = buildCandidates(state, side, rng);
  let best: Candidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const strength = side === "cpu" ? state.setup.cpuTeam.strength : state.setup.userTeam.strength;

  for (const candidate of candidates) {
    const noise = rng.range(-1, 1) * (92 - strength) * 5.5;
    const score = rollout(state, candidate, side) + noise;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  if (!best) return null;
  const disc = state.bodies.find((body) => body.id === best?.bodyId);
  return disc ? jitter(best, disc, strength, rng) : best;
}

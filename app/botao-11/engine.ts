import { formationById } from "./formations";
import { createRng, hashSeed } from "./rng";
import type { Body, MatchSetup, MatchState, Shot, Side } from "./types";

export const FIELD = {
  width: 1160,
  height: 720,
  inset: 34,
  goalWidth: 196,
  goalDepth: 36,
  discRadius: 15,
  keeperRadius: 17,
  ballRadius: 8,
  postRadius: 5,
  centerRadius: 92,
  areaDepth: 176,
  areaWidth: 356,
};

export const GOAL_TOP = (FIELD.height - FIELD.goalWidth) / 2;
export const GOAL_BOTTOM = GOAL_TOP + FIELD.goalWidth;
export const MAX_PULL = 154;

const DISC_FRICTION = 1.36;
const BALL_FRICTION = 0.93;
const STOP_SPEED = 10;
const MAX_SPEED = 1080;
const MAX_RESOLVE_SECONDS = 7.5;
const RESTITUTION_DISC_DISC = 0.86;
const RESTITUTION_DISC_BALL = 0.95;
const RESTITUTION_WALL = 0.68;
const RESTITUTION_POST = 0.78;
const MIN_SHOT_RATIO = 0.075;

export function otherSide(side: Side): Side {
  return side === "user" ? "cpu" : "user";
}

export function attackGoalX(side: Side) {
  return side === "user" ? FIELD.width : 0;
}

export function ownGoalX(side: Side) {
  return side === "user" ? 0 : FIELD.width;
}

export function ballOf(state: MatchState) {
  const ball = state.bodies.find((body) => body.kind === "ball");
  if (!ball) throw new Error("botao11: partida sem bola");
  return ball;
}

export function discsOf(state: MatchState, side: Side) {
  return state.bodies.filter((body) => body.kind === "disc" && body.side === side);
}

export function movingBodies(state: MatchState) {
  return state.bodies.filter((body) => body.kind === "disc" || body.kind === "ball");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function teamPower(strength: number) {
  return clamp(53 + (strength - 60) * 0.9, 42, 94);
}

function teamControl(strength: number) {
  return clamp(49 + (strength - 60) * 0.95, 40, 95);
}

export function shotSpeedFor(power: number) {
  return 510 + clamp(power, 0, 100) * 2.65;
}

export function minShotSpeed(power: number) {
  return shotSpeedFor(power) * MIN_SHOT_RATIO;
}

export function speedForDistance(distance: number) {
  return Math.max(0, distance) * DISC_FRICTION;
}

export function distanceForSpeed(speed: number) {
  return Math.max(0, speed) / DISC_FRICTION;
}

function createDisc(args: {
  id: string;
  side: Side;
  number: number;
  role: Body["role"];
  power: number;
  control: number;
}): Body {
  const keeper = args.role === "GK";
  return {
    id: args.id,
    kind: "disc",
    side: args.side,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: keeper ? FIELD.keeperRadius : FIELD.discRadius,
    mass: keeper ? 1.16 : 1,
    friction: DISC_FRICTION,
    number: args.number,
    role: args.role,
    power: keeper ? args.power * 0.94 : args.power,
    control: args.control,
  };
}

function createBall(): Body {
  return {
    id: "ball",
    kind: "ball",
    side: null,
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    radius: FIELD.ballRadius,
    mass: 0.38,
    friction: BALL_FRICTION,
    number: 0,
    power: 0,
    control: 0,
  };
}

function createPost(id: string, x: number, y: number): Body {
  return {
    id,
    kind: "post",
    side: null,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: FIELD.postRadius,
    mass: Number.POSITIVE_INFINITY,
    friction: 0,
    number: 0,
    power: 0,
    control: 0,
  };
}

const NUMBERS = [1, 2, 4, 5, 3, 6, 8, 10, 7, 9, 11];

function placeSide(state: MatchState, side: Side) {
  const formation = formationById(side === "user" ? state.setup.userFormationId : state.setup.cpuFormationId);
  const discs = discsOf(state, side);
  const rng = createRng(hashSeed(state.setup.seed, side, state.turns, state.score.user, state.score.cpu));
  discs.forEach((disc, index) => {
    const slot = formation.slots[index];
    const usableHalf = FIELD.width / 2 - FIELD.inset * 1.8;
    const depth = FIELD.inset * 1.3 + slot.depth * usableHalf;
    disc.x = side === "user" ? depth : FIELD.width - depth;
    disc.y = FIELD.inset + slot.lane * (FIELD.height - FIELD.inset * 2);
    disc.x += rng.range(-5.5, 5.5);
    disc.y += rng.range(-5.5, 5.5);
    disc.vx = 0;
    disc.vy = 0;
  });
}

function separateBodies(state: MatchState) {
  const dynamic = movingBodies(state);
  for (let iteration = 0; iteration < 16; iteration += 1) {
    let moved = false;
    for (let i = 0; i < dynamic.length; i += 1) {
      for (let j = i + 1; j < dynamic.length; j += 1) {
        const a = dynamic[i];
        const b = dynamic[j];
        const min = a.radius + b.radius + 1.5;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= min) continue;
        if (dist < 0.001) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const overlap = min - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        const aShare = a.kind === "ball" ? 0.7 : 0.5;
        const bShare = b.kind === "ball" ? 0.7 : 0.5;
        a.x -= nx * overlap * aShare;
        a.y -= ny * overlap * aShare;
        b.x += nx * overlap * bShare;
        b.y += ny * overlap * bShare;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

export function createMatch(setup: MatchSetup): MatchState {
  const userPower = teamPower(setup.userTeam.strength);
  const userControl = teamControl(setup.userTeam.strength);
  const cpuPower = teamPower(setup.cpuTeam.strength);
  const cpuControl = teamControl(setup.cpuTeam.strength);
  const userFormation = formationById(setup.userFormationId);
  const cpuFormation = formationById(setup.cpuFormationId);
  const bodies: Body[] = [createBall()];

  userFormation.slots.forEach((slot, index) => {
    bodies.push(createDisc({
      id: `user-${index}`,
      side: "user",
      number: NUMBERS[index],
      role: slot.role,
      power: userPower,
      control: userControl,
    }));
  });
  cpuFormation.slots.forEach((slot, index) => {
    bodies.push(createDisc({
      id: `cpu-${index}`,
      side: "cpu",
      number: NUMBERS[index],
      role: slot.role,
      power: cpuPower,
      control: cpuControl,
    }));
  });
  bodies.push(
    createPost("post-left-top", 0, GOAL_TOP),
    createPost("post-left-bottom", 0, GOAL_BOTTOM),
    createPost("post-right-top", FIELD.width, GOAL_TOP),
    createPost("post-right-bottom", FIELD.width, GOAL_BOTTOM),
  );

  const state: MatchState = {
    setup,
    phase: "aim",
    turn: "user",
    bodies,
    score: { user: 0, cpu: 0 },
    clock: setup.matchSeconds,
    turns: 0,
    resolveElapsed: 0,
    events: [],
    lastTouch: null,
    version: 0,
  };
  placeSide(state, "user");
  placeSide(state, "cpu");
  separateBodies(state);
  return state;
}

export function cloneMatch(state: MatchState): MatchState {
  return {
    ...state,
    setup: { ...state.setup, userTeam: { ...state.setup.userTeam }, cpuTeam: { ...state.setup.cpuTeam } },
    bodies: state.bodies.map((body) => ({ ...body })),
    score: { ...state.score },
    events: [],
    lastTouch: state.lastTouch ? { ...state.lastTouch } : null,
  };
}

export function resetKickoff(state: MatchState, kickoffSide: Side) {
  placeSide(state, "user");
  placeSide(state, "cpu");
  const ball = ballOf(state);
  ball.x = FIELD.width / 2;
  ball.y = FIELD.height / 2;
  ball.vx = 0;
  ball.vy = 0;
  separateBodies(state);
  state.turn = kickoffSide;
  state.lastTouch = null;
  state.phase = "aim";
  state.resolveElapsed = 0;
  state.version += 1;
}

export function resumeAfterGoal(state: MatchState) {
  if (state.phase !== "goal") return;
  const lastGoal = [...state.events].reverse().find((event) => event.type === "goal");
  const kickoff = lastGoal && lastGoal.type === "goal" ? otherSide(lastGoal.side) : "user";
  resetKickoff(state, kickoff);
}

export function beginShot(state: MatchState, shot: Shot) {
  if (state.phase !== "aim") return false;
  const body = state.bodies.find((candidate) => candidate.id === shot.bodyId);
  if (!body || body.kind !== "disc" || body.side !== state.turn) return false;
  const rawSpeed = Math.hypot(shot.vx, shot.vy);
  const max = shotSpeedFor(body.power);
  if (rawSpeed < minShotSpeed(body.power)) return false;
  const scale = rawSpeed > max ? max / rawSpeed : 1;
  body.vx = shot.vx * scale;
  body.vy = shot.vy * scale;
  state.phase = "resolving";
  state.resolveElapsed = 0;
  state.turns += 1;
  state.lastTouch = null;
  state.version += 1;
  return true;
}

function resolveCollision(a: Body, b: Body) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distance = Math.hypot(dx, dy);
  const minimum = a.radius + b.radius;
  if (distance >= minimum) return false;
  if (distance < 0.0001) {
    dx = 0.6;
    dy = 0.8;
    distance = 1;
  }
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minimum - distance;
  const invA = Number.isFinite(a.mass) ? 1 / a.mass : 0;
  const invB = Number.isFinite(b.mass) ? 1 / b.mass : 0;
  const invSum = invA + invB || 1;
  a.x -= nx * overlap * (invA / invSum);
  a.y -= ny * overlap * (invA / invSum);
  b.x += nx * overlap * (invB / invSum);
  b.y += ny * overlap * (invB / invSum);

  const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relative >= 0) return true;
  const restitution = a.kind === "post" || b.kind === "post"
    ? RESTITUTION_POST
    : a.kind === "ball" || b.kind === "ball"
      ? RESTITUTION_DISC_BALL
      : RESTITUTION_DISC_DISC;
  const impulse = -(1 + restitution) * relative / invSum;
  a.vx -= impulse * nx * invA;
  a.vy -= impulse * ny * invA;
  b.vx += impulse * nx * invB;
  b.vy += impulse * ny * invB;
  return true;
}

function checkGoal(state: MatchState) {
  const ball = ballOf(state);
  const withinMouth = ball.y > GOAL_TOP + FIELD.postRadius && ball.y < GOAL_BOTTOM - FIELD.postRadius;
  if (!withinMouth) return false;
  let scoring: Side | null = null;
  if (ball.x - ball.radius <= 0) scoring = "cpu";
  if (ball.x + ball.radius >= FIELD.width) scoring = "user";
  if (!scoring) return false;
  state.score[scoring] += 1;
  const scorer = state.lastTouch?.side === scoring
    ? state.bodies.find((body) => body.id === state.lastTouch?.bodyId)?.role ?? "?"
    : "gol contra";
  state.events.push({ type: "goal", side: scoring, scorer });
  movingBodies(state).forEach((body) => {
    body.vx = 0;
    body.vy = 0;
  });
  state.phase = "goal";
  state.version += 1;
  return true;
}

function walls(body: Body) {
  if (body.kind === "post") return;
  if (body.y - body.radius < 0) {
    body.y = body.radius;
    body.vy = Math.abs(body.vy) * RESTITUTION_WALL;
  } else if (body.y + body.radius > FIELD.height) {
    body.y = FIELD.height - body.radius;
    body.vy = -Math.abs(body.vy) * RESTITUTION_WALL;
  }

  const inMouth = body.y > GOAL_TOP + FIELD.postRadius && body.y < GOAL_BOTTOM - FIELD.postRadius;
  if (!inMouth) {
    if (body.x - body.radius < 0) {
      body.x = body.radius;
      body.vx = Math.abs(body.vx) * RESTITUTION_WALL;
    } else if (body.x + body.radius > FIELD.width) {
      body.x = FIELD.width - body.radius;
      body.vx = -Math.abs(body.vx) * RESTITUTION_WALL;
    }
  } else if (body.kind === "disc") {
    if (body.x - body.radius < 0) {
      body.x = body.radius;
      body.vx = Math.abs(body.vx) * RESTITUTION_WALL;
    } else if (body.x + body.radius > FIELD.width) {
      body.x = FIELD.width - body.radius;
      body.vx = -Math.abs(body.vx) * RESTITUTION_WALL;
    }
  }
}

function friction(body: Body, dt: number) {
  if (body.kind === "post") return;
  const factor = Math.exp(-body.friction * dt);
  body.vx *= factor;
  body.vy *= factor;
  const speed = Math.hypot(body.vx, body.vy);
  if (speed < STOP_SPEED) {
    body.vx = 0;
    body.vy = 0;
  } else if (speed > MAX_SPEED) {
    const ratio = MAX_SPEED / speed;
    body.vx *= ratio;
    body.vy *= ratio;
  }
}

function detectBallTouch(state: MatchState, a: Body, b: Body) {
  const disc = a.kind === "disc" && b.kind === "ball" ? a : b.kind === "disc" && a.kind === "ball" ? b : null;
  if (disc?.side) state.lastTouch = { side: disc.side, bodyId: disc.id };
}

function integrate(state: MatchState, dt: number) {
  const movable = movingBodies(state);
  movable.forEach((body) => {
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    walls(body);
  });

  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < state.bodies.length; i += 1) {
      const a = state.bodies[i];
      if (a.kind === "post" && pass > 0) continue;
      for (let j = i + 1; j < state.bodies.length; j += 1) {
        const b = state.bodies[j];
        if (a.kind === "post" && b.kind === "post") continue;
        const hit = resolveCollision(a, b);
        if (hit) detectBallTouch(state, a, b);
      }
    }
  }

  movable.forEach((body) => friction(body, dt));
}

export function stepMatch(state: MatchState, dt: number) {
  const safeDt = clamp(dt, 0, 0.032);
  if (state.phase === "finished") return;

  if (state.phase === "aim" || state.phase === "resolving") {
    state.clock = Math.max(0, state.clock - safeDt);
    if (state.clock <= 0 && state.phase !== "resolving") {
      state.phase = "finished";
      state.events.push({ type: "match-end" });
      state.version += 1;
      return;
    }
  }

  if (state.phase !== "resolving") return;
  state.resolveElapsed += safeDt;
  integrate(state, safeDt);
  if (checkGoal(state)) return;

  const stillMoving = movingBodies(state).some((body) => body.vx !== 0 || body.vy !== 0);
  if (!stillMoving || state.resolveElapsed >= MAX_RESOLVE_SECONDS) {
    movingBodies(state).forEach((body) => {
      body.vx = 0;
      body.vy = 0;
    });
    if (state.clock <= 0) {
      state.phase = "finished";
      state.events.push({ type: "match-end" });
    } else {
      state.turn = otherSide(state.turn);
      state.phase = "aim";
      state.events.push({ type: "settled" }, { type: "turn", side: state.turn });
    }
    state.resolveElapsed = 0;
    state.version += 1;
  }
}

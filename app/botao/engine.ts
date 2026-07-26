// Motor do futebol de botão: física de discos, regras, cronômetro e pênaltis.
//
// Regras desta versão: 1 toque alternado, 5 botões de cada lado, mesa com
// tabelas (a bola só sai em gol), 3 gols encerram na hora, 2 tempos de 70s,
// prorrogação e pênaltis. A formação dos dois times muda a cada gol.
//
// O estado é MUTÁVEL de propósito: são 11 corpos a 120Hz em celular, e a CPU
// roda centenas de simulações por turno. A UI guarda o estado em um ref e
// re-renderiza o HUD por um contador de versão.

import { createRng, hashSeed, type Rng } from "./rng";
import { formationByIndex, slotIndexForPosition, type BotaoFormation } from "./formations";
import type {
  BotaoDecision,
  BotaoMatchResult,
  BotaoMatchSetup,
  BotaoShot,
  BotaoSide,
  BotaoSideStats,
  BotaoTimelineEntry,
} from "./types";

export const FIELD = {
  width: 300,
  height: 460,
  goalWidth: 96,
  goalDepth: 20,
  discRadius: 13.5,
  ballRadius: 6.2,
  postRadius: 3.6,
  areaWidth: 176,
  areaDepth: 78,
  centerRadius: 54,
  penaltyDistance: 92,
};

export const GOAL_LEFT = (FIELD.width - FIELD.goalWidth) / 2;
export const GOAL_RIGHT = GOAL_LEFT + FIELD.goalWidth;
export const MAX_PULL = 122;

const DISC_FRICTION = 1.55;
const BALL_FRICTION = 1.12;
const STOP_SPEED = 16;
const RESTITUTION_DISC_BALL = 0.94;
const RESTITUTION_DISC_DISC = 0.86;
const RESTITUTION_WALL = 0.6;
const RESTITUTION_POST = 0.72;
const MAX_RESOLVE_SECONDS = 5;
const MAX_SPEED = 1000;
const MIN_SHOT_RATIO = 0.08;
const KEEPER_RADIUS = 15;
const IDLE_TURNS_FOR_RESET = 6;

export type BotaoBodyKind = "disc" | "ball" | "post" | "keeper";

export type BotaoBody = {
  id: string;
  kind: BotaoBodyKind;
  side: BotaoSide | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  friction: number;
  /** O botão que representa o jogador da carreira. */
  isUserPlayer: boolean;
  number: number;
  label: string;
  power: number;
  control: number;
  slot: number;
};

export type BotaoPhase =
  | "kickoff"
  | "aim"
  | "resolving"
  | "goal"
  | "interval"
  /** Escolhendo em qual das cobranças o jogador da carreira vai bater. */
  | "penalty-setup"
  | "penalties"
  | "finished";

export type BotaoEvent =
  | { type: "touch"; side: BotaoSide; bodyId: string }
  | { type: "hit"; strength: number }
  | { type: "post"; side: BotaoSide }
  | { type: "goal"; side: BotaoSide; scorer: string; assist: string | null; byUser: boolean; ownGoal: boolean }
  | { type: "settled" }
  | { type: "idle-reset" }
  | { type: "inactivity-penalty" }
  | { type: "period-end"; period: number }
  | { type: "formation"; userFormation: string; cpuFormation: string }
  | { type: "penalty"; side: BotaoSide; scored: boolean }
  | { type: "match-end"; decision: BotaoDecision };

export type BotaoPenaltyState = {
  round: number;
  turn: BotaoSide;
  score: { user: number; cpu: number };
  results: { user: Array<boolean | null>; cpu: Array<boolean | null> };
  /** Ordem das cobranças por lado: um botão diferente bate cada uma. */
  order: { user: string[]; cpu: string[] };
  /** Cobrança em que o jogador da carreira bate (1..5). */
  playerRound: number;
  suddenDeath: boolean;
  /** Cobrança já foi batida e a bola está em movimento. */
  shotInFlight: boolean;
  keeperDirection: number;
  keeperSpeed: number;
};

export type BotaoMatchState = {
  setup: BotaoMatchSetup;
  rng: Rng;
  bodies: BotaoBody[];
  phase: BotaoPhase;
  turn: BotaoSide;
  period: number;
  totalPeriods: number;
  clock: number;
  periodSeconds: number;
  score: { user: number; cpu: number };
  playerGoals: number;
  playerAssists: number;
  turns: number;
  idleTurns: number;
  formationIndex: { user: number; cpu: number };
  formationId: { user: string; cpu: string };
  userSlot: number;
  touches: Array<{ bodyId: string; side: BotaoSide }>;
  /** Contador monotônico de toques na bola. `touches` é aparado, este não. */
  ballTouches: number;
  /** Valor de `ballTouches` no início do turno, para detectar toque no vazio. */
  turnTouchMark: number;
  stats: { user: BotaoSideStats; cpu: BotaoSideStats };
  timeline: BotaoTimelineEntry[];
  resolveElapsed: number;
  lastGoal: { side: BotaoSide; scorer: string; byUser: boolean; ownGoal: boolean } | null;
  penalties: BotaoPenaltyState | null;
  penaltyReason: "shootout" | "inactivity" | null;
  /** Reposição depois de gol não consome o relógio até o primeiro toque. */
  clockPausedForKickoff: boolean;
  result: BotaoMatchResult | null;
  /** Sobe a cada mutação relevante; a UI usa como chave de re-render. */
  version: number;
};

// ---------------------------------------------------------------------------
// Geometria auxiliar
// ---------------------------------------------------------------------------

/** Gol que o lado ataca. */
export function attackGoalY(side: BotaoSide): number {
  return side === "user" ? 0 : FIELD.height;
}

/** Gol que o lado defende. */
export function ownGoalY(side: BotaoSide): number {
  return side === "user" ? FIELD.height : 0;
}

export function otherSide(side: BotaoSide): BotaoSide {
  return side === "user" ? "cpu" : "user";
}

export function ballOf(state: BotaoMatchState): BotaoBody {
  const ball = state.bodies.find((body) => body.kind === "ball");
  if (!ball) throw new Error("botao: partida sem bola");
  return ball;
}

export function discsOf(state: BotaoMatchState, side: BotaoSide): BotaoBody[] {
  return state.bodies.filter((body) => body.kind === "disc" && body.side === side);
}

export function userPlayerDisc(state: BotaoMatchState): BotaoBody | null {
  return state.bodies.find((body) => body.isUserPlayer) ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function inGoalMouth(x: number): boolean {
  return x > GOAL_LEFT && x < GOAL_RIGHT;
}

// ---------------------------------------------------------------------------
// Criação da partida
// ---------------------------------------------------------------------------

// A força do clube pesa, mas não decide sozinha: botão bom não ganha jogo,
// senão time pequeno nunca daria zebra em final.
function teamDiscPower(strength: number): number {
  return clamp(52 + (strength - 58) * 0.95, 40, 92);
}

function teamDiscControl(strength: number): number {
  return clamp(46 + (strength - 58) * 1.05, 38, 94);
}

/** Potência máxima do toque, em unidades de campo por segundo. */
export function shotSpeedFor(power: number): number {
  return 430 + (clamp(power, 0, 100) / 100) * 230;
}

/**
 * Velocidade inicial para um disco parar depois de percorrer `distance`.
 * Com atrito exponencial o alcance total é exatamente v0 / atrito.
 */
export function speedForDistance(distance: number): number {
  return Math.max(0, distance) * DISC_FRICTION;
}

/** Velocidade mínima para um toque ser aceito por `beginShot`. */
export function minShotSpeed(power: number): number {
  return shotSpeedFor(power) * MIN_SHOT_RATIO;
}

/** Inverso: até onde um disco vai com essa velocidade, ignorando colisões. */
export function distanceForSpeed(speed: number): number {
  return Math.max(0, speed) / DISC_FRICTION;
}

function createDisc(args: {
  id: string;
  side: BotaoSide;
  number: number;
  label: string;
  power: number;
  control: number;
  isUserPlayer: boolean;
  slot: number;
}): BotaoBody {
  return {
    id: args.id,
    kind: "disc",
    side: args.side,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: FIELD.discRadius,
    mass: 1,
    friction: DISC_FRICTION,
    isUserPlayer: args.isUserPlayer,
    number: args.number,
    label: args.label,
    power: args.power,
    control: args.control,
    slot: args.slot,
  };
}

function createBall(): BotaoBody {
  return {
    id: "ball",
    kind: "ball",
    side: null,
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    radius: FIELD.ballRadius,
    mass: 0.4,
    friction: BALL_FRICTION,
    isUserPlayer: false,
    number: 0,
    label: "Bola",
    power: 0,
    control: 0,
    slot: -1,
  };
}

function createPost(id: string, x: number, y: number): BotaoBody {
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
    isUserPlayer: false,
    number: 0,
    label: "Trave",
    power: 0,
    control: 0,
    slot: -1,
  };
}

export function createMatch(setup: BotaoMatchSetup): BotaoMatchState {
  const rng = createRng(hashSeed(setup.seed, setup.matchId));
  const userPower = setup.player.power ?? clamp(44 + (setup.player.overall - 58) * 1.6, 34, 100);
  const userControl = setup.player.control ?? clamp(40 + (setup.player.overall - 58) * 1.5, 32, 100);
  const matePower = teamDiscPower(setup.userTeam.strength);
  const mateControl = teamDiscControl(setup.userTeam.strength);
  const cpuPower = teamDiscPower(setup.cpuTeam.strength);
  const cpuControl = teamDiscControl(setup.cpuTeam.strength);

  const formation = formationByIndex(0);
  const userSlot = slotIndexForPosition(formation, setup.player.position);

  // Só o jogador da carreira tem nome. O resto é o time — como em botão de
  // verdade, onde a peça é a camisa e não um personagem inventado.
  const bodies: BotaoBody[] = [createBall()];
  for (let slot = 0; slot < formation.slots.length; slot += 1) {
    const isPlayer = slot === userSlot;
    const number = isPlayer ? setup.player.number : 2 + slot;
    bodies.push(
      createDisc({
        id: `user-${slot}`,
        side: "user",
        number,
        label: isPlayer ? setup.player.name : `#${number}`,
        power: isPlayer ? userPower : matePower,
        control: isPlayer ? userControl : mateControl,
        isUserPlayer: isPlayer,
        slot,
      }),
    );
  }
  for (let slot = 0; slot < formation.slots.length; slot += 1) {
    bodies.push(
      createDisc({
        id: `cpu-${slot}`,
        side: "cpu",
        number: 2 + slot,
        label: `#${2 + slot}`,
        power: cpuPower,
        control: cpuControl,
        isUserPlayer: false,
        slot,
      }),
    );
  }
  bodies.push(createPost("post-top-left", GOAL_LEFT, -1), createPost("post-top-right", GOAL_RIGHT, -1));
  bodies.push(
    createPost("post-bottom-left", GOAL_LEFT, FIELD.height + 1),
    createPost("post-bottom-right", GOAL_RIGHT, FIELD.height + 1),
  );

  const state: BotaoMatchState = {
    setup,
    rng,
    bodies,
    phase: "kickoff",
    turn: setup.userIsHost ? "user" : "cpu",
    period: 1,
    totalPeriods: setup.rules.halves,
    clock: setup.rules.halfSeconds,
    periodSeconds: setup.rules.halfSeconds,
    score: { user: 0, cpu: 0 },
    playerGoals: 0,
    playerAssists: 0,
    turns: 0,
    idleTurns: 0,
    formationIndex: { user: 0, cpu: rng.int(0, 5) },
    formationId: { user: formation.id, cpu: formationByIndex(0).id },
    userSlot,
    touches: [],
    ballTouches: 0,
    turnTouchMark: 0,
    stats: { user: { flicks: 0, touches: 0, posts: 0 }, cpu: { flicks: 0, touches: 0, posts: 0 } },
    timeline: [],
    resolveElapsed: 0,
    lastGoal: null,
    penalties: null,
    penaltyReason: null,
    clockPausedForKickoff: false,
    result: null,
    version: 0,
  };
  state.formationId.cpu = formationByIndex(state.formationIndex.cpu).id;
  placeTeams(state);
  state.phase = "aim";
  return state;
}

/** Cópia rasa e rápida usada pelas simulações da CPU. */
export function cloneMatch(state: BotaoMatchState): BotaoMatchState {
  return {
    ...state,
    rng: createRng(hashSeed(state.setup.seed, state.turns, state.rng.cursor())),
    bodies: state.bodies.map((body) => ({ ...body })),
    score: { ...state.score },
    formationIndex: { ...state.formationIndex },
    formationId: { ...state.formationId },
    stats: { user: { ...state.stats.user }, cpu: { ...state.stats.cpu } },
    touches: state.touches.map((touch) => ({ ...touch })),
    timeline: [],
    penalties: state.penalties
      ? {
          ...state.penalties,
          score: { ...state.penalties.score },
          results: { user: [...state.penalties.results.user], cpu: [...state.penalties.results.cpu] },
          order: { user: [...state.penalties.order.user], cpu: [...state.penalties.order.cpu] },
        }
      : null,
    result: null,
  };
}

// ---------------------------------------------------------------------------
// Posicionamento
// ---------------------------------------------------------------------------

const MIN_DEPTH = 0.09;

function slotToField(side: BotaoSide, lane: number, depth: number): { x: number; y: number } {
  const normalizedDepth = (MIN_DEPTH + depth * (1 - MIN_DEPTH)) * (FIELD.height / 2);
  if (side === "user") {
    return { x: lane * FIELD.width, y: FIELD.height - normalizedDepth };
  }
  return { x: FIELD.width - lane * FIELD.width, y: normalizedDepth };
}

function placeSide(state: BotaoMatchState, side: BotaoSide, formation: BotaoFormation, playerSlot: number) {
  const discs = discsOf(state, side);
  const available: number[] = [];
  for (let index = 0; index < formation.slots.length; index += 1) {
    if (index !== playerSlot) available.push(index);
  }
  let cursor = 0;
  discs.forEach((disc) => {
    const slot = disc.isUserPlayer && playerSlot >= 0 ? playerSlot : available[cursor++] ?? 0;
    disc.slot = slot;
    const target = formation.slots[slot];
    const point = slotToField(side, target.lane, target.depth);
    const jitter = 3.4;
    disc.x = clamp(point.x + state.rng.range(-jitter, jitter), disc.radius + 2, FIELD.width - disc.radius - 2);
    disc.y = clamp(point.y + state.rng.range(-jitter, jitter), disc.radius + 2, FIELD.height - disc.radius - 2);
    disc.vx = 0;
    disc.vy = 0;
  });
}

/** Recoloca os dois times e devolve a bola ao centro. */
export function placeTeams(state: BotaoMatchState) {
  const userFormation = formationByIndex(state.formationIndex.user);
  const cpuFormation = formationByIndex(state.formationIndex.cpu);
  state.formationId.user = userFormation.id;
  state.formationId.cpu = cpuFormation.id;
  state.userSlot = slotIndexForPosition(userFormation, state.setup.player.position);
  placeSide(state, "user", userFormation, state.userSlot);
  placeSide(state, "cpu", cpuFormation, -1);

  const ball = ballOf(state);
  ball.x = FIELD.width / 2;
  ball.y = FIELD.height / 2;
  ball.vx = 0;
  ball.vy = 0;
  separateBodies(state, ball.id, 2);
  state.touches = [];
  state.version += 1;
}

/** Empurra corpos sobrepostos até ninguém encostar em ninguém (bola fixa). */
function separateBodies(state: BotaoMatchState, pinnedId: string, extraGap: number) {
  const movable = state.bodies.filter((body) => body.kind === "disc" || body.kind === "keeper");
  const all = state.bodies.filter((body) => body.kind !== "post");
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let moved = false;
    for (const body of movable) {
      for (const other of all) {
        if (body === other) continue;
        const minimum = body.radius + other.radius + extraGap;
        let dx = other.x - body.x;
        let dy = other.y - body.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minimum) continue;
        if (distance < 0.0001) {
          dx = 0.6;
          dy = 0.8;
          distance = 1;
        }
        const overlap = minimum - distance;
        const nx = dx / distance;
        const ny = dy / distance;
        const bodyShare = other.id === pinnedId || other.kind === "ball" ? 1 : 0.5;
        body.x -= nx * overlap * bodyShare;
        body.y -= ny * overlap * bodyShare;
        if (bodyShare < 1) {
          other.x += nx * overlap * 0.5;
          other.y += ny * overlap * 0.5;
        }
        moved = true;
      }
      body.x = clamp(body.x, body.radius + 1, FIELD.width - body.radius - 1);
      body.y = clamp(body.y, body.radius + 1, FIELD.height - body.radius - 1);
    }
    if (!moved) break;
  }
}

// ---------------------------------------------------------------------------
// Toque do jogador
// ---------------------------------------------------------------------------

export type BotaoAim = { vx: number; vy: number; ratio: number; valid: boolean };

/**
 * Traduz um arraste (estilingue) em velocidade inicial. O dedo puxa para trás
 * do botão e a força cresce com o comprimento do arraste.
 */
export function aimFromDrag(disc: BotaoBody, dragX: number, dragY: number): BotaoAim {
  const dx = disc.x - dragX;
  const dy = disc.y - dragY;
  const length = Math.hypot(dx, dy);
  if (length < 4) return { vx: 0, vy: 0, ratio: 0, valid: false };
  const pull = Math.min(length, MAX_PULL);
  const ratio = pull / MAX_PULL;
  const speed = shotSpeedFor(disc.power) * ratio;
  return { vx: (dx / length) * speed, vy: (dy / length) * speed, ratio, valid: ratio >= MIN_SHOT_RATIO };
}

export function canShoot(state: BotaoMatchState, bodyId: string): boolean {
  if (state.phase !== "aim" && state.phase !== "kickoff") return false;
  const body = state.bodies.find((candidate) => candidate.id === bodyId);
  return Boolean(body && body.kind === "disc" && body.side === state.turn);
}

/**
 * Desvio do toque por qualidade do botão. É o que faz o `control` valer para o
 * jogador humano também: o seu botão vai onde você aponta, o do reserva escorrega
 * um grau. Sutil de propósito — dá motivo para usar você mesmo sem virar sorteio.
 */
export function slipFor(control: number): number {
  return clamp((88 - control) / 88, 0, 1) * 0.075;
}

export function beginShot(state: BotaoMatchState, shot: BotaoShot): boolean {
  if (!canShoot(state, shot.bodyId)) return false;
  const disc = state.bodies.find((body) => body.id === shot.bodyId);
  if (!disc) return false;
  const speed = Math.hypot(shot.vx, shot.vy);
  if (speed < shotSpeedFor(disc.power) * MIN_SHOT_RATIO) return false;
  const capped = Math.min(speed, MAX_SPEED);
  const slip = slipFor(disc.control);
  const angle = Math.atan2(shot.vy, shot.vx) + (slip > 0 ? state.rng.range(-1, 1) * slip : 0);
  disc.vx = Math.cos(angle) * capped;
  disc.vy = Math.sin(angle) * capped;
  state.phase = "resolving";
  state.clockPausedForKickoff = false;
  state.resolveElapsed = 0;
  state.turns += 1;
  state.turnTouchMark = state.ballTouches;
  if (disc.side) state.stats[disc.side].flicks += 1;
  state.version += 1;
  return true;
}

// ---------------------------------------------------------------------------
// Física
// ---------------------------------------------------------------------------

function integrate(state: BotaoMatchState, dt: number) {
  for (const body of state.bodies) {
    if (body.kind === "post") continue;
    if (body.vx === 0 && body.vy === 0) continue;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    const decay = Math.exp(-body.friction * dt);
    body.vx *= decay;
    body.vy *= decay;
    if (Math.hypot(body.vx, body.vy) < STOP_SPEED) {
      body.vx = 0;
      body.vy = 0;
    }
  }
}

/** Devolve o lado que FEZ o gol, ou null. `user` ataca y=0, `cpu` ataca y=height. */
function resolveWalls(state: BotaoMatchState): BotaoSide | null {
  let scoringSide: BotaoSide | null = null;
  for (const body of state.bodies) {
    if (body.kind === "post") continue;
    const radius = body.radius;
    if (body.x < radius) {
      body.x = radius;
      body.vx = Math.abs(body.vx) * RESTITUTION_WALL;
    } else if (body.x > FIELD.width - radius) {
      body.x = FIELD.width - radius;
      body.vx = -Math.abs(body.vx) * RESTITUTION_WALL;
    }
    // Dentro da boca do gol a bola ignora a linha de fundo: ou entra, ou volta na trave.
    if (body.kind === "ball" && inGoalMouth(body.x)) {
      if (body.y <= 0) {
        scoringSide = "user";
        continue;
      }
      if (body.y >= FIELD.height) {
        scoringSide = "cpu";
        continue;
      }
      if (body.y < FIELD.height / 2 ? body.vy < 0 : body.vy > 0) continue;
    }
    if (body.y < radius) {
      body.y = radius;
      body.vy = Math.abs(body.vy) * RESTITUTION_WALL;
    } else if (body.y > FIELD.height - radius) {
      body.y = FIELD.height - radius;
      body.vy = -Math.abs(body.vy) * RESTITUTION_WALL;
    }
  }
  return scoringSide;
}

function collide(state: BotaoMatchState, a: BotaoBody, b: BotaoBody, events: BotaoEvent[]) {
  const minimum = a.radius + b.radius;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distance = Math.hypot(dx, dy);
  if (distance >= minimum) return;
  if (distance < 0.0001) {
    dx = 1;
    dy = 0;
    distance = 1;
  }
  const nx = dx / distance;
  const ny = dy / distance;
  const invA = Number.isFinite(a.mass) ? 1 / a.mass : 0;
  const invB = Number.isFinite(b.mass) ? 1 / b.mass : 0;
  const invSum = invA + invB;
  if (invSum === 0) return;

  const overlap = minimum - distance;
  a.x -= nx * overlap * (invA / invSum);
  a.y -= ny * overlap * (invA / invSum);
  b.x += nx * overlap * (invB / invSum);
  b.y += ny * overlap * (invB / invSum);

  const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relative > 0) return;

  const isBallPair = a.kind === "ball" || b.kind === "ball";
  const hasPost = a.kind === "post" || b.kind === "post";
  const restitution = hasPost ? RESTITUTION_POST : isBallPair ? RESTITUTION_DISC_BALL : RESTITUTION_DISC_DISC;
  const impulse = (-(1 + restitution) * relative) / invSum;
  a.vx -= nx * impulse * invA;
  a.vy -= ny * impulse * invA;
  b.vx += nx * impulse * invB;
  b.vy += ny * impulse * invB;

  events.push({ type: "hit", strength: Math.min(1, Math.abs(relative) / 700) });

  if (isBallPair) {
    const toucher = a.kind === "ball" ? b : a;
    if ((toucher.kind === "disc" || toucher.kind === "keeper") && toucher.side) {
      const last = state.touches[state.touches.length - 1];
      if (!last || last.bodyId !== toucher.id) {
        state.touches.push({ bodyId: toucher.id, side: toucher.side });
        if (state.touches.length > 6) state.touches.shift();
        state.stats[toucher.side].touches += 1;
        events.push({ type: "touch", side: toucher.side, bodyId: toucher.id });
      }
      state.ballTouches += 1;
    }
    if (hasPost) {
      const post = a.kind === "post" ? a : b;
      // Trave no gol de cima é chute de quem ataca para cima: o jogador.
      const shooter: BotaoSide = post.y < FIELD.height / 2 ? "user" : "cpu";
      state.stats[shooter].posts += 1;
      events.push({ type: "post", side: shooter });
    }
  }
}

function resolveCollisions(state: BotaoMatchState, events: BotaoEvent[]) {
  const bodies = state.bodies;
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j];
      if (a.kind === "post" && b.kind === "post") continue;
      // As traves só existem para a bola: discos batem na linha de fundo normal.
      if ((a.kind === "post" && b.kind !== "ball") || (b.kind === "post" && a.kind !== "ball")) continue;
      collide(state, a, b, events);
    }
  }
}

function everythingStopped(state: BotaoMatchState): boolean {
  return state.bodies.every((body) => body.kind === "post" || (body.vx === 0 && body.vy === 0));
}

// ---------------------------------------------------------------------------
// Fluxo de turno
// ---------------------------------------------------------------------------

function periodLabel(state: BotaoMatchState): number {
  return state.period;
}

function registerGoal(state: BotaoMatchState, side: BotaoSide, events: BotaoEvent[]) {
  const touches = state.touches;
  const lastTouch = touches[touches.length - 1];
  const scorerBody = lastTouch ? state.bodies.find((body) => body.id === lastTouch.bodyId) ?? null : null;
  const ownGoal = Boolean(scorerBody && scorerBody.side !== side);
  let assistBody: BotaoBody | null = null;
  if (scorerBody && !ownGoal) {
    for (let index = touches.length - 2; index >= 0; index -= 1) {
      const candidate = touches[index];
      if (candidate.bodyId === scorerBody.id) continue;
      if (candidate.side === side) {
        assistBody = state.bodies.find((body) => body.id === candidate.bodyId) ?? null;
      }
      break;
    }
  }
  // Sem nome inventado: quem não é você é identificado pela camisa e pelo time.
  const nameOf = (body: BotaoBody | null) => {
    if (!body) return "bate-rebate";
    if (body.isUserPlayer) return body.label;
    const team = body.side === "user" ? state.setup.userTeam : state.setup.cpuTeam;
    return `${team.shortName} ${body.label}`;
  };
  const assist = assistBody ? nameOf(assistBody) : null;
  const byUser = Boolean(scorerBody?.isUserPlayer) && !ownGoal;
  const scorerName = ownGoal ? `${nameOf(scorerBody)} (contra)` : nameOf(scorerBody);

  state.score[side] += 1;
  if (byUser) state.playerGoals += 1;
  if (assistBody?.isUserPlayer && side === "user") state.playerAssists += 1;
  state.lastGoal = { side, scorer: scorerName, byUser, ownGoal };
  state.timeline.push({
    period: periodLabel(state),
    clock: Math.max(0, Math.round(state.clock)),
    side,
    kind: ownGoal ? "own-goal" : "goal",
    scorer: scorerName,
    assist,
    byUser,
    text: ownGoal
      ? `Gol contra de ${nameOf(scorerBody)}`
      : `${scorerName} marcou${assist ? ` (assistência de ${assist})` : ""}`,
  });
  events.push({ type: "goal", side, scorer: scorerName, assist, byUser, ownGoal });

  const ball = ballOf(state);
  ball.vx = 0;
  ball.vy = 0;
  for (const body of state.bodies) {
    body.vx = 0;
    body.vy = 0;
  }
  state.phase = "goal";
  state.idleTurns = 0;
  state.version += 1;

  const limit = state.setup.rules.goalLimit;
  const inRegulation = state.period <= state.setup.rules.halves;
  if (limit > 0 && inRegulation && state.score[side] >= limit) {
    finishMatch(state, "goal-limit", events);
  }
}

/** Chamado pela UI depois da comemoração; roda a troca de formação. */
export function resumeAfterGoal(state: BotaoMatchState): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  if (state.phase !== "goal" || !state.lastGoal) return events;
  const conceded = otherSide(state.lastGoal.side);
  state.lastGoal = null;
  // Se o gol saiu com o tempo estourado, quem recoloca os botões é o próximo
  // tempo — avançar a formação aqui adiantaria a troca duas vezes.
  if (state.clock <= 0) {
    endPeriod(state, events);
    state.version += 1;
    return events;
  }
  state.formationIndex.user += 1;
  state.formationIndex.cpu += 1;
  placeTeams(state);
  events.push({ type: "formation", userFormation: state.formationId.user, cpuFormation: state.formationId.cpu });
  state.turn = conceded;
  state.phase = "kickoff";
  state.clockPausedForKickoff = true;
  state.version += 1;
  return events;
}

function endPeriod(state: BotaoMatchState, events: BotaoEvent[]) {
  state.clock = 0;
  state.timeline.push({
    period: periodLabel(state),
    clock: 0,
    side: "user",
    kind: "period-end",
    scorer: "",
    assist: null,
    byUser: false,
    text: state.period === state.totalPeriods ? "Fim do tempo normal" : `Fim do ${state.period}º tempo`,
  });
  events.push({ type: "period-end", period: state.period });

  const rules = state.setup.rules;
  const drawn = state.score.user === state.score.cpu;
  const regulationOver = state.period >= rules.halves;
  const extraOver = state.period >= rules.halves + rules.extraHalves;

  if (!regulationOver) {
    state.phase = "interval";
    return;
  }
  if (!drawn) {
    finishMatch(state, state.period > rules.halves ? "extra-time" : "regulation", events);
    return;
  }
  if (!extraOver && rules.extraHalves > 0) {
    state.phase = "interval";
    return;
  }
  if (rules.penalties) {
    startPenalties(state);
    return;
  }
  finishMatch(state, state.period > rules.halves ? "extra-time" : "regulation", events);
}

/** Avança do intervalo para o próximo tempo. */
export function startNextPeriod(state: BotaoMatchState): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  if (state.phase !== "interval") return events;
  const rules = state.setup.rules;
  state.period += 1;
  state.periodSeconds = state.period > rules.halves ? rules.extraSeconds : rules.halfSeconds;
  state.clock = state.periodSeconds;
  state.formationIndex.user += 1;
  state.formationIndex.cpu += 1;
  placeTeams(state);
  events.push({ type: "formation", userFormation: state.formationId.user, cpuFormation: state.formationId.cpu });
  // A cada tempo troca quem sai jogando.
  const firstSide: BotaoSide = state.setup.userIsHost ? "user" : "cpu";
  state.turn = state.period % 2 === 1 ? firstSide : otherSide(firstSide);
  state.phase = "kickoff";
  state.clockPausedForKickoff = false;
  state.version += 1;
  return events;
}

function settleTurn(state: BotaoMatchState, events: BotaoEvent[]) {
  const touchedThisTurn = state.ballTouches > state.turnTouchMark;
  state.idleTurns = touchedThisTurn ? 0 : state.idleTurns + 1;
  if (state.idleTurns >= IDLE_TURNS_FOR_RESET) {
    const ball = ballOf(state);
    ball.x = FIELD.width / 2;
    ball.y = FIELD.height / 2;
    separateBodies(state, ball.id, 2);
    state.idleTurns = 0;
    events.push({ type: "idle-reset" });
  }
  if (state.clock <= 0) {
    endPeriod(state, events);
    state.version += 1;
    return;
  }
  state.turn = otherSide(state.turn);
  state.phase = "aim";
  state.version += 1;
}

/**
 * Corre o relógio em tempo real, fora da física.
 *
 * O cronômetro corre enquanto se mira, o adversário pensa e a bola rola. A
 * única pausa é a reposição depois de um gol: o relógio volta a andar no
 * primeiro toque. Se o tempo acaba com a bola rolando, o lance termina antes —
 * a vantagem é resolvida em `settleTurn`.
 */
export function advanceClock(state: BotaoMatchState, seconds: number): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  if (seconds <= 0) return events;
  if (state.phase !== "aim" && state.phase !== "kickoff") return events;
  if (state.phase === "kickoff" && state.clockPausedForKickoff) return events;
  state.clock = Math.max(0, state.clock - seconds);
  if (state.clock <= 0) {
    endPeriod(state, events);
  }
  state.version += 1;
  return events;
}

/**
 * Passa a vez sem tacar. Só existe como rede de segurança: se por qualquer
 * motivo um lado não conseguir produzir um toque legal, a partida segue em vez
 * de travar. Conta como turno gasto.
 */
export function skipTurn(state: BotaoMatchState): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  if (state.phase !== "aim" && state.phase !== "kickoff") return events;
  state.turns += 1;
  state.turnTouchMark = state.ballTouches;
  settleTurn(state, events);
  return events;
}

/**
 * Avança a física em um passo fixo. Deve ser chamado em loop enquanto
 * `phase === "resolving"`. Devolve os eventos do passo.
 */
export function stepMatch(state: BotaoMatchState, dt: number): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  if (state.phase !== "resolving") return events;

  integrate(state, dt);
  resolveCollisions(state, events);
  const scoringSide = resolveWalls(state);
  state.resolveElapsed += dt;
  state.clock = Math.max(0, state.clock - dt * state.setup.rules.clockScale);

  if (scoringSide) {
    registerGoal(state, scoringSide, events);
    return events;
  }
  if (everythingStopped(state) || state.resolveElapsed >= MAX_RESOLVE_SECONDS) {
    for (const body of state.bodies) {
      body.vx = 0;
      body.vy = 0;
    }
    events.push({ type: "settled" });
    settleTurn(state, events);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Pênaltis
// ---------------------------------------------------------------------------

/**
 * Monta a fila de cobranças de um lado: cada botão bate uma, na ordem.
 * No lado do jogador, `playerRound` decide em qual delas ele entra — o resto
 * do time preenche as outras. Em morte súbita a fila recomeça do começo.
 */
export function buildPenaltyOrder(state: BotaoMatchState, side: BotaoSide, playerRound: number): string[] {
  const discs = discsOf(state, side);
  const player = side === "user" ? discs.find((disc) => disc.isUserPlayer) : undefined;
  if (!player) return discs.map((disc) => disc.id);
  const others = discs.filter((disc) => !disc.isUserPlayer);
  const slot = clamp(Math.round(playerRound), 1, discs.length);
  const order: string[] = [];
  let cursor = 0;
  for (let round = 1; round <= discs.length; round += 1) {
    if (round === slot) order.push(player.id);
    else order.push(others[cursor++]?.id ?? player.id);
  }
  return order;
}

function startPenalties(state: BotaoMatchState) {
  const defaultRound = Math.min(5, discsOf(state, "user").length);
  state.penalties = {
    round: 1,
    turn: state.setup.userIsHost ? "user" : "cpu",
    score: { user: 0, cpu: 0 },
    results: { user: [], cpu: [] },
    order: { user: buildPenaltyOrder(state, "user", defaultRound), cpu: buildPenaltyOrder(state, "cpu", 0) },
    playerRound: defaultRound,
    suddenDeath: false,
    shotInFlight: false,
    keeperDirection: state.rng.chance(0.5) ? 1 : -1,
    keeperSpeed: 96 + state.setup.difficulty * 26,
  };
  state.penaltyReason = "shootout";
  // A bola só rola depois que o jogador escolher a cobrança dele.
  state.phase = "penalty-setup";
  state.version += 1;
}

/** Confirma em qual cobrança o jogador bate e começa a disputa. */
export function confirmPenaltyOrder(state: BotaoMatchState, playerRound: number): boolean {
  const penalties = state.penalties;
  if (!penalties || state.phase !== "penalty-setup") return false;
  penalties.playerRound = clamp(Math.round(playerRound), 1, discsOf(state, "user").length);
  penalties.order.user = buildPenaltyOrder(state, "user", penalties.playerRound);
  state.phase = "penalties";
  setupPenaltyShot(state);
  state.version += 1;
  return true;
}

/** Vai direto para a decisão por pênaltis. Serve ao modo de teste da antessala. */
export function jumpToPenalties(state: BotaoMatchState) {
  if (state.phase === "finished" || state.penalties) return;
  state.clock = 0;
  startPenalties(state);
}

/** Pune dez segundos sem ação do jogador com uma cobrança real para a CPU. */
export function awardInactivityPenalty(state: BotaoMatchState): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  if ((state.phase !== "aim" && state.phase !== "kickoff") || state.turn !== "user" || state.penalties) return events;
  const defaultRound = Math.min(5, discsOf(state, "user").length);
  state.penalties = {
    round: 1,
    turn: "cpu",
    score: { user: 0, cpu: 0 },
    results: { user: [], cpu: [] },
    order: { user: buildPenaltyOrder(state, "user", defaultRound), cpu: buildPenaltyOrder(state, "cpu", 0) },
    playerRound: defaultRound,
    suddenDeath: false,
    shotInFlight: false,
    keeperDirection: state.rng.chance(0.5) ? 1 : -1,
    keeperSpeed: 96 + state.setup.difficulty * 26,
  };
  state.penaltyReason = "inactivity";
  state.clockPausedForKickoff = false;
  state.phase = "penalties";
  setupPenaltyShot(state);
  state.version += 1;
  events.push({ type: "inactivity-penalty" });
  return events;
}

/** Monta a mesa reduzida do pênalti: batedor, bola, goleiro e traves. */
export function setupPenaltyShot(state: BotaoMatchState) {
  const penalties = state.penalties;
  if (!penalties) return;
  const shooting = penalties.turn;
  const goalY = attackGoalY(shooting);
  const towards = goalY === 0 ? 1 : -1;
  const ball = ballOf(state);
  ball.x = FIELD.width / 2;
  ball.y = goalY + towards * FIELD.penaltyDistance;
  ball.vx = 0;
  ball.vy = 0;

  const shooter = penaltyShooter(state);
  const keeper = penaltyKeeper(state);
  shooter.x = FIELD.width / 2;
  shooter.y = ball.y + towards * 26;
  shooter.vx = 0;
  shooter.vy = 0;
  keeper.x = FIELD.width / 2;
  keeper.y = goalY + towards * 22;
  keeper.vx = 0;
  keeper.vy = 0;
  state.touches = [];
  state.resolveElapsed = 0;
}

/**
 * Botão que bate a cobrança da vez. As cobranças são alternadas: cada peça
 * bate a sua, seguindo a fila montada em `buildPenaltyOrder`.
 */
export function penaltyShooter(state: BotaoMatchState): BotaoBody {
  const penalties = state.penalties;
  const side: BotaoSide = penalties ? penalties.turn : "user";
  const discs = discsOf(state, side);
  if (!penalties) return discs[0];
  const order = penalties.order[side];
  if (order.length === 0) return discs[(penalties.round - 1) % discs.length];
  const id = order[(penalties.round - 1) % order.length];
  return state.bodies.find((body) => body.id === id) ?? discs[0];
}

/**
 * Goleiro do pênalti é um corpo próprio, não um botão de linha reaproveitado.
 * Reaproveitar quebrava carreira de goleiro: o disco do jogador era inflado para
 * defender e voltava gigante na hora de bater.
 */
export function penaltyKeeper(state: BotaoMatchState): BotaoBody {
  const defending = otherSide(state.penalties ? state.penalties.turn : "user");
  let keeper = state.bodies.find((body) => body.kind === "keeper");
  if (!keeper) {
    keeper = {
      id: "keeper",
      kind: "keeper",
      side: defending,
      x: FIELD.width / 2,
      y: 0,
      vx: 0,
      vy: 0,
      radius: KEEPER_RADIUS,
      mass: 7,
      friction: DISC_FRICTION,
      isUserPlayer: false,
      number: 1,
      label: "Goleiro",
      power: 0,
      control: 0,
      slot: -1,
    };
    state.bodies.push(keeper);
  }
  keeper.side = defending;
  return keeper;
}

function penaltyBodies(state: BotaoMatchState): BotaoBody[] {
  const shooter = penaltyShooter(state);
  const keeper = penaltyKeeper(state);
  const ball = ballOf(state);
  const posts = state.bodies.filter((body) => body.kind === "post");
  return [ball, shooter, keeper, ...posts];
}

export function beginPenaltyShot(state: BotaoMatchState, shot: BotaoShot): boolean {
  const penalties = state.penalties;
  if (!penalties || penalties.shotInFlight || state.phase !== "penalties") return false;
  const shooter = penaltyShooter(state);
  if (shot.bodyId !== shooter.id) return false;
  const speed = Math.hypot(shot.vx, shot.vy);
  if (speed < shotSpeedFor(shooter.power) * MIN_SHOT_RATIO) return false;
  shooter.vx = shot.vx;
  shooter.vy = shot.vy;
  state.resolveElapsed = 0;
  penalties.shotInFlight = true;
  state.version += 1;
  return true;
}

/**
 * Goleiro vai e volta entre as traves — não é física, é palheta na mão.
 * A UI chama isso todo frame para o batedor poder cronometrar o toque.
 */
export function stepPenaltyKeeper(state: BotaoMatchState, dt: number) {
  const penalties = state.penalties;
  if (!penalties) return;
  const keeper = penaltyKeeper(state);
  const leftLimit = GOAL_LEFT + keeper.radius + 2;
  const rightLimit = GOAL_RIGHT - keeper.radius - 2;
  const nextX = keeper.x + penalties.keeperDirection * penalties.keeperSpeed * dt;
  if (nextX < leftLimit || nextX > rightLimit) penalties.keeperDirection *= -1;
  const previousX = keeper.x;
  keeper.x = clamp(keeper.x + penalties.keeperDirection * penalties.keeperSpeed * dt, leftLimit, rightLimit);
  keeper.vx = (keeper.x - previousX) / dt;
  keeper.vy = 0;
}

/** Passo de física do pênalti; devolve `null` enquanto a cobrança não terminou. */
export function stepPenalty(state: BotaoMatchState, dt: number): { scored: boolean } | null {
  const penalties = state.penalties;
  if (!penalties || !penalties.shotInFlight) return null;
  const bodies = penaltyBodies(state);
  const keeper = penaltyKeeper(state);
  const ball = ballOf(state);
  const goalY = attackGoalY(penalties.turn);

  stepPenaltyKeeper(state, dt);

  for (const body of bodies) {
    if (body.kind === "post" || body === keeper) continue;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    const decay = Math.exp(-body.friction * dt);
    body.vx *= decay;
    body.vy *= decay;
    if (Math.hypot(body.vx, body.vy) < STOP_SPEED) {
      body.vx = 0;
      body.vy = 0;
    }
    if (body.x < body.radius) {
      body.x = body.radius;
      body.vx = Math.abs(body.vx) * RESTITUTION_WALL;
    } else if (body.x > FIELD.width - body.radius) {
      body.x = FIELD.width - body.radius;
      body.vx = -Math.abs(body.vx) * RESTITUTION_WALL;
    }
  }

  const events: BotaoEvent[] = [];
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      if (a.kind === "post" && b.kind === "post") continue;
      if ((a.kind === "post" && b.kind !== "ball") || (b.kind === "post" && a.kind !== "ball")) continue;
      collide(state, a, b, events);
    }
  }
  keeper.vx = 0;

  const crossed = goalY === 0 ? ball.y <= 0 : ball.y >= FIELD.height;
  if (crossed && inGoalMouth(ball.x)) return { scored: true };

  state.resolveElapsed += dt;
  const ballStopped = ball.vx === 0 && ball.vy === 0;
  const wentBackwards = goalY === 0 ? ball.y > FIELD.penaltyDistance + 60 : ball.y < FIELD.height - FIELD.penaltyDistance - 60;
  if (state.resolveElapsed > 3 || (ballStopped && state.resolveElapsed > 0.35) || wentBackwards) {
    return { scored: false };
  }
  return null;
}

/** Fecha a cobrança e prepara a próxima (ou encerra a decisão). */
export function commitPenalty(state: BotaoMatchState, scored: boolean): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  const penalties = state.penalties;
  if (!penalties) return events;
  const side = penalties.turn;
  penalties.results[side].push(scored);
  if (scored) penalties.score[side] += 1;
  state.timeline.push({
    period: state.period,
    clock: 0,
    side,
    kind: scored ? "penalty-goal" : "penalty-miss",
    scorer: penaltyShooter(state).label,
    assist: null,
    byUser: side === "user" && penaltyShooter(state).isUserPlayer,
    text: `Pênalti ${penalties.round}: ${scored ? "na rede" : "perdeu"}`,
  });
  events.push({ type: "penalty", side, scored });

  if (state.penaltyReason === "inactivity") {
    const keeperIndex = state.bodies.findIndex((body) => body.kind === "keeper");
    if (keeperIndex >= 0) state.bodies.splice(keeperIndex, 1);
    state.penalties = null;
    state.penaltyReason = null;
    state.turn = "user";
    if (scored) {
      state.score.cpu += 1;
      state.lastGoal = { side: "cpu", scorer: "Pênalti por demora", byUser: false, ownGoal: false };
      state.phase = "goal";
      state.clockPausedForKickoff = false;
      const limit = state.setup.rules.goalLimit;
      const inRegulation = state.period <= state.setup.rules.halves;
      if (limit > 0 && inRegulation && state.score.cpu >= limit) finishMatch(state, "goal-limit", events);
    } else {
      state.formationIndex.user += 1;
      state.formationIndex.cpu += 1;
      placeTeams(state);
      events.push({ type: "formation", userFormation: state.formationId.user, cpuFormation: state.formationId.cpu });
      state.phase = "kickoff";
      state.clockPausedForKickoff = true;
    }
    state.version += 1;
    return events;
  }

  const decision = penaltyDecision(state);
  if (decision) {
    finishMatch(state, "penalties", events);
    return events;
  }
  if (side === (state.setup.userIsHost ? "cpu" : "user")) {
    penalties.round += 1;
    if (penalties.round > state.setup.rules.penaltyRounds) penalties.suddenDeath = true;
  }
  penalties.turn = otherSide(side);
  penalties.shotInFlight = false;
  setupPenaltyShot(state);
  state.version += 1;
  return events;
}

/** Devolve o vencedor quando a série de pênaltis já está decidida. */
export function penaltyDecision(state: BotaoMatchState): BotaoSide | null {
  const penalties = state.penalties;
  if (!penalties) return null;
  const rounds = state.setup.rules.penaltyRounds;
  const userTaken = penalties.results.user.length;
  const cpuTaken = penalties.results.cpu.length;
  const userScore = penalties.score.user;
  const cpuScore = penalties.score.cpu;

  if (userTaken === cpuTaken && (penalties.suddenDeath || userTaken >= rounds) && userTaken > 0 && userScore !== cpuScore) {
    return userScore > cpuScore ? "user" : "cpu";
  }
  if (userTaken <= rounds && cpuTaken <= rounds) {
    const userRemaining = Math.max(0, rounds - userTaken);
    const cpuRemaining = Math.max(0, rounds - cpuTaken);
    if (userScore > cpuScore + cpuRemaining) return "user";
    if (cpuScore > userScore + userRemaining) return "cpu";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Encerramento
// ---------------------------------------------------------------------------

function finishMatch(state: BotaoMatchState, decision: BotaoDecision, events: BotaoEvent[]) {
  const penalties = state.penalties;
  const penaltyFor = penalties ? penalties.score.user : null;
  const penaltyAgainst = penalties ? penalties.score.cpu : null;
  let outcome: BotaoMatchResult["outcome"] = "draw";
  if (state.score.user !== state.score.cpu) {
    outcome = state.score.user > state.score.cpu ? "win" : "loss";
  } else if (penaltyFor !== null && penaltyAgainst !== null && penaltyFor !== penaltyAgainst) {
    outcome = penaltyFor > penaltyAgainst ? "win" : "loss";
  }
  const won = outcome === "win";
  state.result = {
    matchId: state.setup.matchId,
    simulated: false,
    outcome,
    goalsFor: state.score.user,
    goalsAgainst: state.score.cpu,
    penaltyFor,
    penaltyAgainst,
    playerGoals: state.playerGoals,
    playerAssists: state.playerAssists,
    manOfTheMatch: won && state.playerGoals + state.playerAssists >= 1,
    decision,
    turns: state.turns,
    stats: { user: { ...state.stats.user }, cpu: { ...state.stats.cpu } },
    timeline: state.timeline.slice(),
    champion: won,
  };
  state.phase = "finished";
  state.version += 1;
  events.push({ type: "match-end", decision });
}

export function forceFinish(state: BotaoMatchState): BotaoMatchResult {
  if (!state.result) finishMatch(state, state.period > state.setup.rules.halves ? "extra-time" : "regulation", []);
  return state.result as BotaoMatchResult;
}

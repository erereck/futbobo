// Gancho de desenvolvimento do modo botão: rastro determinístico da partida
// para a regressão (scripts/botao-regression.mjs) e para os testes E2E.
//
// Só liga com `?botaotrace=1` num endereço de loopback COM porta
// (127.x.x.x:PORTA, localhost:PORTA): no site, no itch e no APK nada aqui roda.
// Não importa nada do Bobonline e só usa o que o motor já exportava antes dele,
// para o mesmo arquivo entrar igual numa cópia antiga do repositório (a base
// que a regressão compara).
//
// - `window.__botaoTrace`: eventos do motor e o hash do estado a cada descanso.
// - `window.__botaoInject(shot)`: toque { bodyId, dragX, dragY } que entra pelo
//   mesmo caminho do soltar do dedo, no próximo quadro.
// - `window.__botaoPilot = { seed, sides }`: piloto automático determinístico
//   (sem Math.random): espera alguns quadros e toca pelos lados pedidos; também
//   aperta "Começar a disputa"/"Continuar" quando a mesa fica coberta.
//   Opcionais do E2E: `striker` (o botão em melhor ângulo empurra a bola para o
//   gol, com força cheia) e `power` (fator do puxão: 0,3 = toques fracos).

import { aimFromDrag, ballOf, penaltyShooter, attackGoalY, GOAL_LEFT, GOAL_RIGHT, MAX_PULL, type BotaoEvent, type BotaoMatchState } from "./engine";
import type { BotaoSide } from "./types";

type TraceEntry = { f: number; k: string } & Record<string, unknown>;
export type BotaoInjectShot = { bodyId: string; dragX: number; dragY: number };
type Pilot = { seed: number; sides: BotaoSide[]; minFrames?: number; maxFrames?: number; buttons?: boolean; striker?: boolean; power?: number };
type Botao3dHook = { projectBeamEnd(): { x: number; y: number } | null; kind(): string | null };

declare global {
  interface Window {
    __botaoTrace?: TraceEntry[];
    __botaoInject?: (shot: BotaoInjectShot) => void;
    __botaoPilot?: Pilot;
    __botaoState?: () => unknown;
    __botao3d?: Botao3dHook;
  }
}

let enabled: boolean | null = null;

/** `?botaotrace=1` em loopback com porta. Lido uma vez por página. */
export function botaoTraceEnabled(): boolean {
  if (enabled !== null) return enabled;
  enabled = false;
  try {
    if (typeof window === "undefined") return false;
    const { hostname, port, search } = window.location;
    const loopback = hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
    enabled = loopback && port !== "" && new URLSearchParams(search).get("botaotrace") === "1";
  } catch {
    enabled = false;
  }
  return enabled;
}

// FNV-1a de 32 bits sobre um texto (o JSON de números é exato: ida e volta sem perda).
function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Hash do estado do motor (sem `version`, `setup` e `result`): mesma ideia do hashMatch, sem depender dele. */
export function botaoStateHash(state: BotaoMatchState): string {
  const pen = state.penalties;
  return fnv(JSON.stringify([
    state.phase, state.turn, state.period, state.totalPeriods, state.clock, state.periodSeconds,
    state.score.user, state.score.cpu, state.turns, state.idleTurns, state.ballTouches, state.turnTouchMark,
    state.formationIndex.user, state.formationIndex.cpu, state.userSlot, state.rng.cursor(), state.timeline.length,
    state.stats, state.clockPausedForKickoff, state.finalShotGrace, state.lastGoal?.side ?? null,
    state.touches.map((touch) => touch.bodyId),
    state.bodies.filter((body) => body.kind !== "post").map((body) => [body.id, body.x, body.y, body.vx, body.vy, body.stamina, body.slot, body.distanceActive]),
    pen ? [pen.round, pen.turn, pen.score, pen.results, pen.order, pen.keeperDirection, pen.keeperSpeed, pen.shotInFlight, pen.suddenDeath] : null,
    state.penaltyReason,
  ]));
}

/** Momentos em que o estado fica parado e vale tirar o hash. */
const REST_EVENTS = new Set(["settled", "goal", "period-end", "penalty", "match-end", "inactivity-penalty", "idle-reset", "formation"]);

let frameNo = 0;
let lastCursor = 0;
let lastInFlight = false;
let lastShow: string | null = null;
let pilotRandom: (() => number) | null = null;
let pilotSeed: number | null = null;
let pilotWait: number | null = null;
let buttonWait: number | null = null;
const injected: BotaoInjectShot[] = [];

function push(entry: Omit<TraceEntry, "f">) {
  (window.__botaoTrace ??= []).push({ f: frameNo, ...entry } as TraceEntry);
}

function mulberry(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Toque do piloto: puxa o botão para trás na direção da bola (ou do gol, no pênalti). */
function pilotShot(state: BotaoMatchState, side: BotaoSide, random: () => number, pilot: Pilot): BotaoInjectShot | null {
  const power = pilot.power ?? 1;
  if (state.phase === "penalties" && state.penalties) {
    const shooter = penaltyShooter(state);
    const targetX = GOAL_LEFT + 6 + random() * (GOAL_RIGHT - GOAL_LEFT - 12);
    const angle = Math.atan2(attackGoalY(side) - shooter.y, targetX - shooter.x);
    const pull = (40 + random() * 70) * power;
    return { bodyId: shooter.id, dragX: shooter.x - Math.cos(angle) * pull, dragY: shooter.y - Math.sin(angle) * pull };
  }
  const discs = state.bodies.filter((body) => body.kind === "disc" && body.side === side);
  if (discs.length === 0) return null;
  const ball = ballOf(state);
  if (pilot.striker) {
    // Bola de sinuca: o botão mira o ponto atrás da bola, na linha bola→gol, e o de melhor ângulo bate.
    const goalX = (GOAL_LEFT + GOAL_RIGHT) / 2 + (random() - 0.5) * (GOAL_RIGHT - GOAL_LEFT) * 0.5;
    const gx = goalX - ball.x;
    const gy = attackGoalY(side) - ball.y;
    const gl = Math.hypot(gx, gy) || 1;
    let best: { disc: (typeof discs)[number]; angle: number; cost: number } | null = null;
    for (const disc of discs) {
      const cx = ball.x - (gx / gl) * (disc.radius + ball.radius) * 0.92 - disc.x;
      const cy = ball.y - (gy / gl) * (disc.radius + ball.radius) * 0.92 - disc.y;
      const cl = Math.hypot(cx, cy);
      const cos = cl > 1 ? (cx * gx + cy * gy) / (cl * gl) : -1;
      if (cos < 0.35) continue;
      const cost = cl * (2 - cos);
      if (!best || cost < best.cost) best = { disc, angle: Math.atan2(cy, cx), cost };
    }
    if (best) {
      const pull = MAX_PULL * power;
      const drag = { bodyId: best.disc.id, dragX: best.disc.x - Math.cos(best.angle) * pull, dragY: best.disc.y - Math.sin(best.angle) * pull };
      if (aimFromDrag(best.disc, drag.dragX, drag.dragY).valid) return drag;
    }
  }
  const disc = discs[Math.floor(random() * discs.length) % discs.length];
  const angle = Math.atan2(ball.y - disc.y, ball.x - disc.x) + (random() - 0.5) * 0.5;
  const pull = (30 + random() * 90) * power;
  const drag = { bodyId: disc.id, dragX: disc.x - Math.cos(angle) * pull, dragY: disc.y - Math.sin(angle) * pull };
  return aimFromDrag(disc, drag.dragX, drag.dragY).valid ? drag : null;
}

export const botaoTrace = {
  /** Eventos do motor (chamado no começo do handleEvents da partida). */
  events(events: BotaoEvent[], state: BotaoMatchState) {
    if (!botaoTraceEnabled() || events.length === 0) return;
    let rest = false;
    for (const event of events) {
      const { type, ...data } = event;
      push({ k: type, ...data });
      if (REST_EVENTS.has(type)) rest = true;
    }
    if (rest) push({ k: "hash", h: botaoStateHash(state), rc: state.rng.cursor() });
  },

  /**
   * Um quadro do laço (antes do relógio e da física). `shoot` solta o toque pelo
   * mesmo caminho do dedo (onPointerUp). Também anota cada cobrança de pênalti
   * com o quanto a rng da partida andou nela.
   */
  frame(state: BotaoMatchState, shoot: (shot: BotaoInjectShot) => void) {
    if (!botaoTraceEnabled()) return;
    frameNo += 1;
    window.__botaoInject ??= (shot) => void injected.push(shot);
    window.__botaoState ??= () => ({ frame: frameNo, trace: window.__botaoTrace?.length ?? 0 });
    const inFlight = Boolean(state.penalties?.shotInFlight);
    const cursor = state.rng.cursor();
    if (inFlight && !lastInFlight) push({ k: "kick", side: state.penalties?.turn ?? null, d: cursor - lastCursor });
    lastInFlight = inFlight;
    lastCursor = cursor;
    const show = window.__botao3d?.kind() ?? null;
    if (show !== lastShow) {
      lastShow = show;
      if (show) push({ k: "show", kind: show });
    }
    const pending = injected.shift();
    if (pending) {
      shoot(pending);
      return;
    }
    const pilot = window.__botaoPilot;
    if (!pilot) return;
    if (pilotSeed !== pilot.seed) {
      pilotSeed = pilot.seed;
      pilotRandom = mulberry(pilot.seed);
    }
    const random = pilotRandom as () => number;
    const covered = state.phase === "penalty-setup" || state.phase === "interval";
    if (covered && pilot.buttons !== false) {
      buttonWait ??= frameNo + 20;
      if (frameNo >= buttonWait) {
        buttonWait = null;
        document.querySelector<HTMLButtonElement>(".botao-overlay .botao-primary")?.click();
      }
      return;
    }
    buttonWait = null;
    const pen = state.penalties;
    const side: BotaoSide | null = state.phase === "aim" || state.phase === "kickoff"
      ? state.turn
      : state.phase === "penalties" && pen && !pen.shotInFlight ? pen.turn : null;
    if (!side || !pilot.sides.includes(side)) {
      pilotWait = null;
      return;
    }
    const min = pilot.minFrames ?? 14;
    const max = pilot.maxFrames ?? 90;
    pilotWait ??= frameNo + min + Math.floor(random() * (max - min + 1));
    if (frameNo < pilotWait) return;
    pilotWait = null;
    const shot = pilotShot(state, side, random, pilot);
    if (shot) shoot(shot);
  },

  /** Resultado entregue pela partida (onFinish). */
  finish(state: BotaoMatchState) {
    if (!botaoTraceEnabled() || !state.result) return;
    push({ k: "finish", outcome: state.result.outcome, score: [state.score.user, state.score.cpu], pens: [state.result.penaltyFor, state.result.penaltyAgainst], h: botaoStateHash(state) });
  },
};

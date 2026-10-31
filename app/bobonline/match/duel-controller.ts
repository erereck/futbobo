// Controlador de uma partida online (§5): implementa BotaoMatchLink em cima da sessão.
//
// O driver (app/botao/online-driver.ts) aplica as ações; aqui mora tudo o que é rede:
// - o log único de ações (as minhas, as do outro lado e as que o próprio controlador escreve:
//   reivindicação, auto-idle depois do cutucão e `porder`), entregue ao driver por `peek`;
// - descansos: a autoridade manda o estado inteiro (`m:rest`), o seguidor compara o hash e adota;
// - largada (`m:setup` → `m:ready` → `m:go`), aperto de mão de volta (`m:hello`, `m:sync`,
//   `m:sync-up`, `m:resume`), congelamento e faixas, reservas de 90 s, W.O., rota sem caminho,
//   reivindicações da autoridade, autoridade travada, ordem dos batedores, espectadores;
// - checkpoints (§5.9) e o placar ao vivo.
// O controlador nunca toca no estado da partida: lê o objeto que o driver relata no descanso.

import {
  ballOf,
  canShoot,
  createMatch,
  discsOf,
  penaltyKeeper,
  penaltyShooter,
  placePenaltyKeeper,
  resumeAfterGoal,
  shotSpeedForBody,
  startNextPeriod,
  type BotaoMatchState,
} from "../../botao/engine";
import { chooseCpuPenaltyShot, chooseCpuShot } from "../../botao/cpu";
import { hashJson, hashMatch, matchKey, restoreMatch, serializeMatch, validateRemoteShot, type SerializedMatch } from "../../botao/match-codec";
import type {
  BotaoMatchLink,
  BotaoSideControl,
  DuelAction,
  DuelBanner,
  DuelDirective,
  DuelLocalProgress,
  DuelPresentation,
  DuelStatus,
  RemoteAim,
} from "../../botao/match-link";
import { ONLINE_TIMING } from "../../botao/online-timing";
import { createRng, hashSeed, type Rng } from "../../botao/rng";
import type { BotaoMatchResult, BotaoMatchSetup, BotaoShot, BotaoSide } from "../../botao/types";
import { T, type MatchBodies, type MatchProgress, type PeerHealth } from "../protocol";
import type { BobSession } from "../net/session";
import { realClock, type NetClock } from "../net/transport";
import type { DuelLaunch } from "../room/room-api";
import type { LiveInfo } from "../types";
import type { CheckpointStore, MatchCheckpoint } from "./checkpoint";

export type { DuelLaunch } from "../room/room-api";

export type DuelRole = "authority" | "follower" | "spectator" | "solo";

export type DuelOutcome =
  | { kind: "result"; result: BotaoMatchResult /* lado user */ }
  | { kind: "walkover"; winner: BotaoSide; reason: "timeout" | "abandon" | "stall" | "double" }
  /** Um W.O. que este aparelho pediu (timeout/stall) foi retirado: o anfitrião recusou ou o outro voltou. */
  | { kind: "withdrawn" };

/** O pedaço da sessão que a partida usa (os testes podem passar outra implementação). */
export type DuelSession = Pick<BobSession, "playerId" | "send" | "sendLossy" | "setProgress" | "health" | "progressOf" | "online" | "rejoin">;

export type DuelControllerArgs = {
  session: DuelSession; matchId: string; bracketId: string;
  role: DuelRole;
  setup: BotaoMatchSetup; sides: Record<BotaoSide, string /* playerId | "cpu" */>; names: Record<BotaoSide, string>;
  cpuSkill?: number; checkpoints: CheckpointStore; restore?: MatchCheckpoint | null;
  now?: () => number;                                       // testes
  onOutcome: (o: DuelOutcome) => void;                      // resultado/W.O. para o room controller (único caminho de relatório)
  onLive: (info: LiveInfo) => void;
  // Extensões (opcionais) além do §5.1:
  /** Código da sala (vai no checkpoint). */
  roomCode?: string;
  /** Relógio dos timers (o virtual do transporte em memória nos testes). Padrão: realClock. */
  clock?: NetClock;
  /** Hora de parede do checkpoint (`savedAt`). */
  wallNow?: () => number;
  /** Reserva de ausência por jogador, em segundos (dev: `?grace=10`). Padrão: GRACE_POOL_S. */
  graceS?: number;
  /** Quem pode assistir (a sala: membro atual que não joga esta partida). Sem isto, qualquer um. */
  canSpectate?: (playerId: string) => boolean;
  /**
   * Autoridade montada sem checkpoint numa partida que já corria (recarregou e o checkpoint se perdeu):
   * pode não ter o próprio passado e o pede ao seguidor no aperto de mão. Sem isto (largada nova), só o
   * que ela mesma escreve vale do lado dela.
   */
  resuming?: boolean;
};

type Phase = "setup" | "countdown" | "live" | "paused" | "watch" | "ended";
type LogEntry = { action: DuelAction; by: "me" | "peer" | "ctrl"; checked: boolean };
type Rest = { n: number; h: string | null; match: SerializedMatch; pres: DuelPresentation | null; phase: string; clock: number; key: string };
/**
 * `observedMs`: tempo descongelado desde que o turno abriu aqui (sem o corte do piso da reivindicação).
 * `floors`: voltas que já baixaram o timer da reivindicação neste turno (no máximo MAX_CREDITED_RESUMES).
 */
type Opened = { n: number; side: BotaoSide; clock: number; key: string; unfrozenMs: number; observedMs: number; hbAt: number; hbOk: number; floors: number };
/** Extensões do m:sync: `why` (o motivo, para a diretiva) e `full` (transmissão cheia, §4.8). */
type SyncBody = MatchBodies["m:sync"] & { why?: DuelDirective["reason"]; full?: true };
type ActBody = DuelAction & { matchId?: string };

const SIDES: readonly BotaoSide[] = ["user", "cpu"];
const TICK_MS = 250;
const USER_DECISION_SECONDS = 7;
const MAX_SPECTATORS = 6;
const HELLO_LOG = 8;
const HELLO_REPEAT_MS = 3000;
const SYNC_RETRY_MS = 3000;
const GAP_PATIENCE_MS = 3000;
const PROGRESS_FRESH_MS = 2500;
const NOTICE_MS = 4000;
const NUDGE_REPEAT_MS = 5000;
/** Folga do clamp do relógio de um toque remoto: 7 s + 1,5 s (§5.2). */
const CLOCK_SLACK_S = USER_DECISION_SECONDS + 1.5;
/** Folga sobre o tempo que a autoridade viu passar no turno (rede e quadros). */
const OBSERVED_SLACK_S = 1.5;
/** Quanto à frente do aplicado uma ação pode chegar: do seguidor (a autoridade nunca fica tão atrás) e da autoridade (espectador alcançando). */
const MAX_AHEAD_FOLLOWER = HELLO_LOG;
const MAX_AHEAD_AUTHORITY = HELLO_LOG * 8;
/** W.O. pedido e o outro "ok" por este tempo sem decisão do anfitrião: retira e volta a jogar. */
const CLAIM_WITHDRAW_MS = 15_000;
/** Depois de um W.O. retirado, o próximo pedido espera isto. */
const CLAIM_RETRY_MS = 10_000;
/** Espectador sem sinal por mais que isto perde a vaga (fechou a aba sem spec:leave). */
const SPECTATOR_LOST_MS = 30_000;
/**
 * Voltas de congelamento que dão crédito por turno (o piso de 3 s no timer da reivindicação e no relógio
 * do dono). Além disso, voltar de novo não compra mais tempo: um seguidor que força voltas sem parar
 * acaba reivindicado como qualquer vez parada.
 */
const MAX_CREDITED_RESUMES = 2;
/** Autoridade viva: no máximo um m:resume por este tempo para os hellos em dia do seguidor. */
const RESUME_ANSWER_MS = 1000;
/** Relógio que applyRemoteClock nunca usa (min com o relógio local): idle sem relógio válido. */
const NO_CLOCK = 1e9;
const FALLBACK_SHOT_RATIO = 0.6;

const other = (side: BotaoSide): BotaoSide => (side === "user" ? "cpu" : "user");
const isInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);

/** "1:05" (segundos inteiros, arredondados para cima). */
export function mmss(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Moeda determinística da partida (W.O. duplo, §4.5): os dois aparelhos chegam ao mesmo lado sem conversar. */
export function matchCoin(setup: Pick<BotaoMatchSetup, "seed">): BotaoSide {
  return createRng(hashSeed(setup.seed, "sorteio")).chance(0.5) ? "user" : "cpu";
}

/** Uma ação que chegou pela rede, com forma mínima conferida (o resto o motor recusa na hora de aplicar). */
function parseAction(value: unknown): DuelAction | null {
  const body = record(value);
  if (!body || !isInt(body.n) || typeof body.k !== "string" || typeof body.se !== "number") return null;
  const side = body.side === "user" || body.side === "cpu" ? body.side : null;
  switch (body.kind) {
    case "shot":
    case "pshot":
    case "idle":
    case "expire":
    case "pmiss":
      if (!side) return null;
      break;
    case "porder": {
      const orders = record(body.orders);
      if (!orders || !Array.isArray(orders.user) || !Array.isArray(orders.cpu)) return null;
      break;
    }
    default:
      return null;
  }
  const action = { ...body } as Record<string, unknown>;
  delete action.matchId;
  return action as DuelAction;
}

/**
 * Toque com número não finito vira `idle` (jogo) ou `pmiss` (pênalti), igual em todo aparelho:
 * o JSON transforma NaN/Infinity em null no caminho.
 */
function normalizeAction(action: DuelAction): DuelAction {
  const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  if (action.kind === "shot") {
    const shot = action.shot as Partial<BotaoShot> | null;
    if (!shot || typeof shot.bodyId !== "string" || !finite(shot.vx) || !finite(shot.vy)) {
      return { kind: "idle", n: action.n, k: action.k, se: action.se, side: action.side, clock: finite(action.clock) ? action.clock : NO_CLOCK };
    }
    if (!finite(action.clock)) return { ...action, clock: NO_CLOCK, grace: Boolean(action.grace) };
  } else if (action.kind === "pshot") {
    const shot = action.shot as Partial<BotaoShot> | null;
    if (!shot || typeof shot.bodyId !== "string" || !finite(shot.vx) || !finite(shot.vy)) {
      return { kind: "pmiss", n: action.n, k: action.k, se: action.se, side: action.side };
    }
  } else if (action.kind === "idle" && !finite(action.clock)) {
    return { ...action, clock: NO_CLOCK };
  }
  return action;
}

const sameAction = (a: DuelAction, b: DuelAction) => hashJson(a) === hashJson(b);

/** O toque de emergência da CPU (mesma regra do driver), para o espelho do cérebro reconhecer. */
function fallbackShot(state: BotaoMatchState, side: BotaoSide): BotaoShot | null {
  const ball = ballOf(state);
  let best: { id: string; distance: number; dx: number; dy: number; speed: number } | null = null;
  for (const disc of discsOf(state, side)) {
    if (!canShoot(state, disc.id)) continue;
    const dx = ball.x - disc.x;
    const dy = ball.y - disc.y;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { id: disc.id, distance, dx, dy, speed: shotSpeedForBody(disc) * FALLBACK_SHOT_RATIO };
  }
  if (!best) return null;
  const length = Math.max(1e-6, best.distance);
  return { bodyId: best.id, vx: (best.dx / length) * best.speed, vy: (best.dy / length) * best.speed };
}

const sameShot = (a: BotaoShot | null, b: BotaoShot) => !!a && a.bodyId === b.bodyId && a.vx === b.vx && a.vy === b.vy;

/**
 * De quem é a vez para este tipo de ação no estado de agora (as mesmas fases que o driver aceita):
 * o lado; null para `porder` (sem dono); undefined quando esse tipo não cabe agora.
 */
function ownerFor(state: BotaoMatchState, kind: DuelAction["kind"]): BotaoSide | null | undefined {
  switch (kind) {
    case "shot":
    case "idle":
    case "expire":
      return state.phase === "aim" || state.phase === "kickoff" ? state.turn : undefined;
    case "pshot":
    case "pmiss":
      return state.phase === "penalties" && state.penalties && !state.penalties.shotInFlight ? state.penalties.turn : undefined;
    case "porder":
      return state.phase === "penalty-setup" ? null : undefined;
  }
  return undefined;
}

export class DuelController implements BotaoMatchLink {
  readonly matchId: string;
  readonly bracketId: string;
  readonly role: DuelRole;
  readonly setup: BotaoMatchSetup;
  readonly sides: Record<BotaoSide, string>;
  readonly names: Record<BotaoSide, string>;

  private readonly session: DuelSession;
  private readonly checkpoints: CheckpointStore;
  private readonly onOutcome: (o: DuelOutcome) => void;
  private readonly onLive: (info: LiveInfo) => void;
  private readonly clock: NetClock;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private readonly roomCode: string;
  private readonly graceS: number;
  private readonly cpuSkill: number;
  /** Lado que este aparelho joga (null: espectador). */
  private readonly mySide: BotaoSide | null;
  /** playerId do outro humano (duelo), da autoridade (espectador) ou null (solo). */
  private readonly opponent: string | null;
  private readonly restored: MatchCheckpoint | null;
  private launchValue: DuelLaunch | null = null;

  private phase: Phase;
  private readonly log = new Map<number, LogEntry>();
  /** Próxima ação que o driver vai aplicar (o `n` dele). */
  private appliedN = 0;
  private lastConsumed: number | null = null;
  private restN = -1;
  private restHash = "";
  private lastRest: Rest | null = null;
  private state: BotaoMatchState | null = null;
  private progress: DuelLocalProgress | null = null;
  private se = 0;
  private readonly directives: DuelDirective[] = [];
  private opened: Opened | null = null;

  // Seguidor e espectador: descansos da autoridade e os meus.
  private readonly authRests = new Map<number, { h: string; match: SerializedMatch; pres: DuelPresentation | null }>();
  private readonly localHashes = new Map<number, string>();
  private lastAuthRest: { n: number; match: SerializedMatch } | null = null;
  private authRestN = -1;
  /** Último descanso em que o meu hash bateu com o da autoridade (ou que adotei). */
  private agreedRestN = -1;

  // Ordem dos batedores.
  private orders: Partial<Record<BotaoSide, string[]>> = {};
  private myOrder: { side: BotaoSide; order: string[] } | null = null;
  /** O n em que a escolha dos batedores começou a contar o prazo (pelo estado vivo, com ou sem descanso nela). */
  private orderEntryN: number | null = null;
  private orderMs = 0;

  // Largada e volta.
  private setupSentAt = Number.NEGATIVE_INFINITY;
  private countdown: { kind: "start" | "resume"; until: number } | null = null;
  private needResume = false;
  private helloAt = Number.NEGATIVE_INFINITY;
  private syncWanted: { reason: DuelDirective["reason"]; at: number } | null = null;
  /** Autoridade: manda m:sync (se + 1) no próximo descanso, com este motivo. */
  private syncAfterRest: "fork" | "stuck" | null = null;
  private lostPending = false;
  /**
   * Autoridade que pode não ter o próprio passado (montada de um checkpoint, ou sem ele numa partida que
   * já corria, até o aperto de mão fechar): só então aceita do seguidor ações do lado dela e o estado dele
   * (m:sync-up). Numa largada nova nunca vale (nada do passado dela pode faltar). Cai na primeira contagem
   * (largada ou volta); daí em diante a autoridade viva só confia no próprio log.
   */
  private recovering = false;
  /** Autoridade viva: quando respondeu por último um hello em dia com m:resume. */
  private resumeAnsweredAt = Number.NEGATIVE_INFINITY;
  /** Autoridade: a pausa atual veio de um hello/m:ready do seguidor que nunca sumiu para mim (não de uma ausência). */
  private helloPause = false;
  private gapSince: number | null = null;
  private forkPending = false;
  private peerHello: { n: number; at: number } | null = null;
  private specJoinAt = Number.NEGATIVE_INFINITY;
  private specFull = false;

  // Presença, reservas, rota, travamento.
  private pools: Record<string, number> = {};
  private hidden = false;
  private hiddenAt = 0;
  /** Desde quando este aparelho está sem rede (para o aviso da volta). */
  private offlineSince: number | null = null;
  private route: { since: number; lastRejoin: number } | null = null;
  private stall: { n: number; ms: number; peerN: number | null; nudgedAt: number } | null = null;
  private stalled = false;
  private selfLoss = false;
  private outcomeSent = false;
  /** W.O. que este aparelho pediu e o anfitrião ainda não decidiu: congelado, mas responde hello/resume (provisório). */
  private claimPending: { reason: "timeout" | "stall"; okMs: number } | null = null;
  private claimRetryAt = Number.NEGATIVE_INFINITY;
  /** Voltas de congelamento desde o último descanso (cada uma dá ao dono o piso de 3 s). */
  private resumesSinceRest = 0;
  private frozenAtTick = true;
  private notice: { id: number; text: string; until: number } | null = null;
  private noticeSeq = 0;

  // Mira e "segurando" do outro lado.
  private aim: { n: number; aim: RemoteAim } | null = null;
  private hold: { n: number; holding: boolean } | null = null;

  // Autoridade/solo.
  private readonly spectators = new Set<string>();
  /** Desde quando cada espectador está sem sinal ("lost"). */
  private readonly spectatorLostAt = new Map<string, number>();
  private readonly canSpectate: ((playerId: string) => boolean) | null;
  private readonly claimLog: DuelAction[] = [];
  private liveAt = Number.NEGATIVE_INFINITY;
  private timerSavedAt = Number.NEGATIVE_INFINITY;
  /** Solo: espelho do cérebro da CPU (o cursor vai no checkpoint). */
  private mirror: { rng: Rng | null } = { rng: null };
  private readonly mirrorQueue: Array<{ rest: SerializedMatch; action: DuelAction }> = [];
  private mirrorHandle: unknown = null;

  private readonly listeners = new Set<() => void>();
  private statusValue: DuelStatus = { frozen: true, banner: null, notice: null, opponentIdleS: null };
  private statusKey = "";
  private tickHandle: unknown = null;
  private lastTickAt: number;
  private disposed = false;
  private started = false;

  constructor(args: DuelControllerArgs) {
    this.session = args.session;
    this.matchId = args.matchId;
    this.bracketId = args.bracketId;
    this.role = args.role;
    this.setup = args.setup;
    this.sides = { ...args.sides };
    this.names = args.names;
    this.checkpoints = args.checkpoints;
    this.onOutcome = args.onOutcome;
    this.onLive = args.onLive;
    this.clock = args.clock ?? realClock;
    const clock = this.clock;
    this.now = args.now ?? (() => clock.now());
    this.wallNow = args.wallNow ?? (() => Date.now());
    this.roomCode = args.roomCode ?? args.matchId.split("-")[0] ?? "";
    this.graceS = args.graceS ?? T.GRACE_POOL_S;
    this.cpuSkill = args.cpuSkill ?? 3;
    this.canSpectate = args.canSpectate ?? null;
    this.mySide = args.role === "authority" || args.role === "solo" ? "user" : args.role === "follower" ? "cpu" : null;
    this.opponent = args.role === "authority" ? this.sides.cpu : args.role === "solo" ? null : this.sides.user;
    this.lastTickAt = this.now();

    for (const side of SIDES) {
      const id = this.sides[side];
      if (id && id !== "cpu") this.pools[id] = this.graceS;
    }

    const restore = args.restore && args.restore.matchId === args.matchId ? args.restore : null;
    this.restored = restore;
    this.recovering = args.role === "authority" && (restore !== null || args.resuming === true);
    if (restore) {
      for (const action of restore.log) {
        const parsed = parseAction(action);
        if (parsed && parsed.n >= restore.n) this.log.set(parsed.n, { action: parsed, by: "me", checked: true });
      }
      this.appliedN = restore.n;
      this.se = restore.se;
      this.orders = { ...restore.orders };
      this.lastAuthRest = restore.lastAuthRest;
      for (const [id, left] of Object.entries(restore.pools)) if (id in this.pools && Number.isFinite(left)) this.pools[id] = Math.max(0, Math.min(this.graceS, left));
      const match = restore.match;
      this.lastRest = { n: restore.n, h: null, match, pres: null, phase: match.phase, clock: match.clock, key: "" };
    }
    if (this.role === "solo") this.mirror.rng = this.brainAt(restore?.cpuCursor ?? 0);
    this.phase = this.role === "spectator" ? "watch" : "setup";
  }

  // =========================================================================
  // API do room controller
  // =========================================================================

  /** O que a tela da partida monta (§5.1). Sempre o mesmo objeto. */
  launch(): DuelLaunch {
    if (this.launchValue) return this.launchValue;
    const role = this.role;
    const controls: Record<BotaoSide, BotaoSideControl> =
      role === "authority" ? { user: "local", cpu: "remote" }
        : role === "follower" ? { user: "remote", cpu: "local" }
          : role === "solo" ? { user: "local", cpu: "cpu" }
            : { user: "remote", cpu: "remote" };
    const restore = this.restored;
    const launch: DuelLaunch = {
      key: this.matchId,
      matchId: this.matchId,
      setup: this.setup,
      controls,
      perspective: role === "spectator" ? "neutral" : role === "follower" ? "cpu" : "user",
      names: this.names,
      link: this,
    };
    if (restore) launch.restore = { match: restore.match, n: restore.n, cpuCursor: restore.cpuCursor, timers: restore.timers };
    if (role === "solo") launch.cpuBrain = { seed: this.brainSeed(), cursor: restore?.cpuCursor ?? 0, skill: this.cpuSkill };
    this.launchValue = launch;
    return launch;
  }

  /** Autoridade: m:setup (reenvia a cada 3 s) → espera m:ready → m:go. Os outros papéis armam a própria largada. */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    const restored = this.restored !== null;
    if (this.role === "authority") {
      this.sendSetup();
      if (restored) {
        this.phase = "paused";
        this.needResume = true;
        this.sendHello();
      }
    } else if (this.role === "follower") {
      if (restored) {
        this.phase = "paused";
        this.send("m:ready", { matchId: this.matchId, h0: this.h0(), restoredN: this.restored?.n });
        this.sendHello();
      }
    } else if (this.role === "solo") {
      this.startCountdown(restored ? "resume" : "start");
    } else {
      this.joinAsSpectator();
    }
    this.scheduleTick();
    this.refresh();
  }

  /** Seguidor: m:* desta partida que chegaram antes do snapshot dizer "playing" (guardados até MATCH_BUFFER_MS). */
  feedBuffered(messages: Array<{ kind: string; body: unknown; from?: string }>): void {
    for (const message of messages) this.receive(message.from ?? (this.opponent ?? ""), message.kind, message.body);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.tickHandle !== null) this.clock.clearTimeout(this.tickHandle);
    this.tickHandle = null;
    if (this.mirrorHandle !== null) this.clock.clearTimeout(this.mirrorHandle);
    this.mirrorHandle = null;
    if (this.role === "spectator" && this.opponent) this.session.send(this.opponent, "spec:leave", { matchId: this.matchId });
    this.session.setProgress(null);
  }

  /** Mensagem de partida roteada pela sala (m:*, spec:*, match:forfeit do adversário). */
  receive(from: string, kind: string, body: unknown): void {
    if (this.disposed) return;
    const data = record(body);
    if (!data) return;
    if (kind === "m:act") {
      if (data.matchId !== undefined && data.matchId !== this.matchId) return;
    } else if (data.matchId !== this.matchId) return;
    try {
      this.handle(from, kind, data);
    } catch (error) {
      console.error("[bobonline] partida", kind, error);
    }
    this.refresh();
  }

  /** A saúde de algum par mudou (sessão): reavalia congelamento e faixas já, sem esperar o tick. */
  healthChanged(): void {
    if (this.disposed) return;
    this.updatePresence(0);
    this.refresh();
  }

  /** Link novo/religado/reiniciado com alguém (sessão). */
  linkChanged(playerId: string): void {
    if (this.disposed) return;
    if (playerId === this.opponent) {
      this.route = null;
      if (this.role === "authority" && this.phase === "setup") this.sendSetup();
      if (this.role === "spectator") {
        this.specJoinAt = Number.NEGATIVE_INFINITY;
        this.joinAsSpectator();
      } else if (this.role !== "solo") {
        this.sendHello();
        if (this.role === "follower") this.resendOrder();
      }
    }
    this.refresh();
  }

  /** A sessão viu SDP trocado sem caminho ICE com este jogador (§4.5, `route`). */
  noteJoinError(playerId: string | null): void {
    if (this.disposed || this.role === "solo" || this.role === "spectator" || playerId === null || playerId !== this.opponent) return;
    if (this.phase === "ended" || this.matchOver()) return;
    if (!this.route) {
      const now = this.now();
      this.route = { since: now, lastRejoin: now };
      this.pause();
    }
    this.refresh();
  }

  /** Página visível ou não (visibilitychange, pause/resume do Capacitor, simulateBackground). */
  setVisible(visible: boolean): void {
    if (this.disposed || this.hidden === !visible) return;
    const now = this.now();
    if (!visible) {
      this.hidden = true;
      this.hiddenAt = now;
      this.saveCheckpoint(true);
      this.pause();
    } else {
      this.hidden = false;
      const away = Math.max(0, (now - this.hiddenAt) / 1000);
      const me = this.session.playerId;
      if (me in this.pools && !this.matchOver() && this.role !== "spectator") {
        this.pools[me] = Math.max(0, this.pools[me] - away);
        if (away >= 1) this.flash(`Você ficou fora ${mmss(away)} · ainda tem ${mmss(this.pools[me])} nesta partida`);
      }
      if (this.role === "solo") {
        if (this.phase === "paused") this.startCountdown("resume");
      } else if (this.role === "spectator") {
        // Escondido, sem quadros: posso ter saído da lista (30 s sem sinal) ou ficado longe demais do
        // aplicado. O estado de novo (spec:join, no máximo a cada 3 s) cobre os dois.
        this.joinAsSpectator();
      } else {
        this.sendHello();
      }
      this.checkSelfPool();
    }
    this.refresh();
  }

  /** Salva já (pagehide / antes de recarregar). */
  flushCheckpoint(): void {
    this.saveCheckpoint(true);
  }

  /** Desisti (Desistir/Sair do torneio): a sala manda o match:forfeit; aqui a partida só para. */
  stop(): void {
    if (this.disposed) return;
    this.outcomeSent = true;
    this.claimPending = null;
    this.phase = "ended";
    this.refresh();
  }

  /** O anfitrião recusou o W.O. que pedi (vê o outro presente): retiro e a partida volta pelo aperto de mão. */
  claimRejected(): void {
    if (this.disposed) return;
    this.withdrawClaim();
    this.refresh();
  }

  /** Reserva de ausência que este aparelho vê para um jogador (segundos). */
  poolOf(playerId: string): number | null {
    return playerId in this.pools ? this.pools[playerId] : null;
  }

  /** Este aparelho perdeu por não voltar a tempo (§4.5): a sala nunca relata outro resultado. */
  lostByTimeout(): boolean {
    return this.selfLoss;
  }

  /** A partida acabou AQUI (motor em "finished", W.O./desistência, ou descartada): a sala pode soltá-la. */
  finishedHere(): boolean {
    return this.disposed || this.phase === "ended" || this.state?.phase === "finished";
  }

  /** Reivindicações que este controlador escreveu na vez do seguidor (diagnóstico e testes). */
  claims(): DuelAction[] {
    return this.claimLog.slice();
  }

  /** Para o host conferir um W.O. de travamento e para testes: o progresso que eu relato. */
  localProgress(): DuelLocalProgress | null {
    return this.progress;
  }

  // =========================================================================
  // BotaoMatchLink
  // =========================================================================

  submit(action: DuelAction): void {
    if (this.disposed || this.role === "spectator") return;
    const existing = this.log.get(action.n);
    if (existing && !sameAction(existing.action, action)) {
      if (this.role === "follower") {
        // A autoridade já escreveu outra ação n (reivindicação): o log dela vale.
        this.requestFork();
        return;
      }
      // Autoridade: o driver voltou e jogou por cima do que o controlador escreveu (auto-idle,
      // porder). O estado do driver é a verdade; o seguidor adota no próximo descanso.
      this.syncAfterRest = "fork";
    }
    this.log.set(action.n, { action, by: "me", checked: true });
    this.appliedN = Math.max(this.appliedN, action.n + 1);
    if (this.role === "follower") this.send("m:act", this.actBody(action));
    else {
      if (this.role === "authority") this.send("m:act", this.actBody(action));
      this.toSpectators("m:act", this.actBody(action));
      if (this.role === "solo" && action.kind !== "porder" && action.side === "cpu") this.queueMirror(action);
    }
    this.saveCheckpoint(false);
    this.refresh();
  }

  peek(n: number): DuelAction | null {
    const entry = this.log.get(n);
    if (!entry) return null;
    // Ação do seguidor sem conferir: só sai daqui conferida no estado em que vai ser aplicada.
    if (!entry.checked && this.role === "authority") return this.validate(entry) ? entry.action : null;
    return entry.action;
  }

  consume(n: number): void {
    const entry = this.log.get(n);
    this.lastConsumed = n;
    this.appliedN = Math.max(this.appliedN, n + 1);
    if (entry && entry.by !== "me" && (this.role === "authority" || this.role === "solo")) this.toSpectators("m:act", this.actBody(entry.action));
  }

  aheadOf(n: number): number {
    // Só o que dá para drenar: a sequência contínua depois de n. Uma ação além de um buraco nunca sai
    // antes de o buraco fechar (e uma forjada lá na frente não deixa a autoridade em alcance).
    let count = 0;
    if (this.log.has(n)) for (let key = n + 1; this.log.has(key); key += 1) count += 1;
    const peerRest = this.peerRestN();
    // A autoridade viva nunca está atrás do seguidor: o descanso que ele diz ter só conta na recuperação.
    if (peerRest !== null && peerRest > this.restN + 1 && (this.role !== "authority" || this.recovering)) count += 1;
    return count;
  }

  reportRest(n: number, state: BotaoMatchState, pres: DuelPresentation | null): void {
    if (this.disposed) return;
    this.state = state;
    this.restN = n;
    this.appliedN = Math.max(this.appliedN, n);
    for (const key of [...this.log.keys()]) if (key < n - HELLO_LOG) this.log.delete(key);
    const h = hashMatch(state);
    this.restHash = h;
    this.resumesSinceRest = 0;
    if (state.phase !== "penalty-setup") {
      this.orders = {};
      this.myOrder = null;
    }
    if (this.role === "authority" || this.role === "solo") this.authorityRest(n, state, h, pres);
    else this.followerRest(n, state, h, pres);
    this.checkFinished();
    this.refresh();
  }

  turnOpened(n: number, side: BotaoSide, clock: number, key: string): void {
    if (this.opened?.n === n) return;
    this.opened = { n, side, clock, key, unfrozenMs: 0, observedMs: 0, hbAt: 0, hbOk: 0, floors: 0 };
    this.stall = null;
    this.stalled = false;
    this.refresh();
  }

  reportProgress(p: DuelLocalProgress): void {
    if (this.disposed || this.role === "spectator") return;
    this.progress = { ...p, own: p.own ? { ...p.own } : null };
    const progress: MatchProgress = { matchId: this.matchId, ...this.progress };
    this.session.setProgress(progress);
  }

  takeDirective(): DuelDirective | null {
    return this.directives.shift() ?? null;
  }

  requestSync(reason: "stuck"): void {
    void reason;
    if (this.disposed) return;
    if (this.role === "authority") {
      // O driver descartou uma ação do seguidor que o motor recusou (consume + requestSync).
      const dropped = this.lastConsumed;
      const entry = dropped !== null ? this.log.get(dropped) : undefined;
      if (dropped !== null && entry && entry.by !== "me") {
        this.log.delete(dropped);
        this.appliedN = Math.min(this.appliedN, dropped);
      }
      if (this.lastRest && this.lastRest.n === this.appliedN) this.sendSync("stuck");
      else this.syncAfterRest = "stuck";
      return;
    }
    if (this.role === "solo") return;
    this.askSync("stuck");
  }

  syncEpoch(): number {
    return this.se;
  }

  status(): DuelStatus {
    return this.statusValue;
  }

  proposePenaltyOrder(side: BotaoSide, order: string[]): void {
    if (this.disposed || this.role === "spectator") return;
    const clean = order.filter((id) => typeof id === "string").slice(0, 16);
    if (this.role === "follower") {
      if (side !== this.mySide) return;
      this.myOrder = { side, order: clean };
      this.send("m:order", { matchId: this.matchId, side, order: clean });
      return;
    }
    if (side !== this.mySide) return;
    this.orders[side] = clean;
    this.maybeWriteOrders(false);
    this.saveCheckpoint(false);
  }

  sendAim(aim: RemoteAim | null): void {
    if (this.disposed || this.role === "spectator") return;
    const body: MatchBodies["m:aim"] = aim
      ? { matchId: this.matchId, n: this.appliedN, bodyId: aim.bodyId, dragX: aim.dragX, dragY: aim.dragY, ...(aim.keeperX !== undefined ? { keeperX: aim.keeperX } : {}), ...(aim.keeperDir !== undefined ? { keeperDir: aim.keeperDir } : {}) }
      : { matchId: this.matchId, n: this.appliedN, clear: true };
    if (this.opponent && this.role !== "solo") this.session.sendLossy(this.opponent, "m:aim", body);
    if (this.role !== "follower") for (const id of this.spectators) this.session.sendLossy(id, "m:aim", body);
  }

  sendHold(holding: boolean): void {
    if (this.disposed || this.role === "spectator") return;
    const body: MatchBodies["m:hold"] = { matchId: this.matchId, n: this.appliedN, holding };
    if (this.opponent && this.role !== "solo") this.session.sendLossy(this.opponent, "m:hold", body);
    if (this.role !== "follower") for (const id of this.spectators) this.session.sendLossy(id, "m:hold", body);
  }

  remoteAim(): RemoteAim | null {
    return this.aim && this.aim.n === this.appliedN ? this.aim.aim : null;
  }

  remoteHolding(): boolean {
    return !!this.hold && this.hold.n === this.appliedN && this.hold.holding;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // =========================================================================
  // Mensagens
  // =========================================================================

  private handle(from: string, kind: string, data: Record<string, unknown>): void {
    const fromAuthority = from === this.sides.user;
    const fromFollower = from === this.sides.cpu;
    switch (kind) {
      case "m:setup":
        if (this.role === "follower" && fromAuthority) this.onSetup();
        return;
      case "m:ready":
        if (this.role === "authority" && fromFollower) this.onReady(data);
        return;
      case "m:go":
        if (this.role === "follower" && fromAuthority && (this.phase === "setup" || (this.phase === "paused" && this.appliedN === 0))) this.startCountdown("start");
        return;
      case "m:act": {
        const parsed = parseAction(data);
        if (!parsed) return;
        if (this.role === "authority" && fromFollower) this.acceptFollowerAction(parsed);
        else if ((this.role === "follower" || this.role === "spectator") && fromAuthority) this.acceptAuthorityAction(parsed);
        return;
      }
      case "m:rest":
        if ((this.role === "follower" || this.role === "spectator") && fromAuthority) this.onAuthorityRest(data);
        return;
      case "m:hello":
        if ((this.role === "authority" && fromFollower) || (this.role === "follower" && fromAuthority)) this.onHello(data);
        return;
      case "m:sync-req":
        if (this.role === "authority" && fromFollower) this.onSyncRequest(data);
        else if (this.role === "follower" && fromAuthority && data.reason === "lost") this.sendSyncUp();
        // Espectador travado (ex.: recebeu uma ação do seguidor que a autoridade depois descartou): o descanso de novo, só para ele.
        else if ((this.role === "authority" || this.role === "solo") && this.spectators.has(from)) this.sendSync("spectate", from);
        return;
      case "m:sync":
        if ((this.role === "follower" || this.role === "spectator") && fromAuthority) this.onSync(data as unknown as SyncBody);
        return;
      case "m:sync-up":
        if (this.role === "authority" && fromFollower) this.onSyncUp(data);
        return;
      case "m:resume":
        if (this.role === "follower" && fromAuthority) this.onResume(data);
        return;
      case "m:order":
        if (this.role === "authority" && fromFollower && data.side === "cpu" && Array.isArray(data.order)) {
          this.orders.cpu = (data.order as unknown[]).filter((id): id is string => typeof id === "string").slice(0, 16);
          this.maybeWriteOrders(false);
          this.saveCheckpoint(false);
        }
        return;
      case "m:nudge":
        if (this.role === "authority" && fromFollower && isInt(data.n)) this.onNudge(data.n);
        return;
      case "m:aim":
        if (this.fromOwnerSide(from) && isInt(data.n)) this.onAim(from, data);
        return;
      case "m:hold":
        if (this.fromOwnerSide(from) && isInt(data.n) && typeof data.holding === "boolean") {
          this.hold = { n: data.n, holding: data.holding };
          if (this.role === "authority") for (const id of this.spectators) this.session.sendLossy(id, "m:hold", data);
        }
        return;
      case "spec:join":
        if (this.role === "authority" || this.role === "solo") this.onSpectatorJoin(from);
        return;
      case "spec:leave":
        this.spectators.delete(from);
        this.spectatorLostAt.delete(from);
        return;
      case "match:forfeit":
        // O adversário desistiu (ou concedeu por não voltar a tempo): a sala (anfitrião) registra o W.O.; aqui a partida para.
        if (from !== this.opponent || this.role === "spectator" || !this.mySide) return;
        if (this.claimPending) {
          // Eu já tinha pedido o W.O.: o anfitrião decide com o meu pedido e a concessão dele.
          this.claimPending = null;
          this.phase = "ended";
        } else if (!this.matchOver()) {
          this.emitOutcome({ kind: "walkover", winner: this.mySide, reason: "abandon" });
        }
        return;
    }
  }

  private fromOwnerSide(from: string): boolean {
    if (this.role === "spectator") return from === this.opponent;
    return from === this.opponent;
  }

  private onSetup(): void {
    const restoredN = this.appliedN > 0 ? this.appliedN : undefined;
    this.send("m:ready", { matchId: this.matchId, h0: this.h0(), ...(restoredN !== undefined ? { restoredN } : {}) });
    if (restoredN !== undefined || this.phase !== "setup") this.sendHello();
  }

  private onReady(data: Record<string, unknown>): void {
    const restoredN = isInt(data.restoredN) ? data.restoredN : 0;
    if (this.phase === "setup") {
      if (typeof data.h0 === "string" && data.h0 !== this.h0()) this.sendSync("hash");
      const fresh = !this.restored && this.appliedN === 0 && restoredN === 0;
      if (fresh) {
        this.send("m:go", { matchId: this.matchId });
        this.startCountdown("start");
      } else {
        this.phase = "paused";
        this.needResume = true;
        this.sendHello();
      }
      return;
    }
    // m:ready fora da largada: o seguidor recomeçou (com ou sem checkpoint).
    if (!this.matchOver()) {
      if (this.phase === "live") this.helloPause = !!this.opponent && this.session.health(this.opponent) === "ok";
      this.pause();
      this.needResume = true;
      this.sendHello();
    }
  }

  private acceptFollowerAction(raw: DuelAction): void {
    const action = normalizeAction(raw);
    if (action.kind === "porder" || action.side !== "cpu") return;
    if (action.se < this.se) return; // escrita num galho que a autoridade já trocou
    const existing = this.log.get(action.n);
    if (existing) {
      if (!sameAction(existing.action, action)) this.syncAfterRest ??= "fork"; // reivindicação ganhou: o seguidor adota
      return;
    }
    if (action.n < this.appliedN || action.n > this.appliedN + MAX_AHEAD_FOLLOWER) return;
    this.log.set(action.n, { action, by: "peer", checked: false });
    this.gapSince = null;
  }

  private acceptAuthorityAction(raw: DuelAction): void {
    const action = normalizeAction(raw);
    if (action.n > this.appliedN + MAX_AHEAD_AUTHORITY) {
      // Longe demais do aplicado (aba em segundo plano, sem quadros): nunca descarta calado. O espectador
      // pede o estado de novo (spec:join, no máximo a cada 3 s); o seguidor pede um m:sync.
      if (this.role === "spectator") this.joinAsSpectator();
      else this.askSync("gap");
      return;
    }
    const existing = this.log.get(action.n);
    if (existing) {
      if (sameAction(existing.action, action)) return;
      if (existing.by === "me" && this.role === "follower") {
        this.log.set(action.n, { action, by: "peer", checked: true });
        this.requestFork();
      }
      return;
    }
    if (action.n < this.appliedN) return;
    this.log.set(action.n, { action, by: "peer", checked: true });
    this.gapSince = null;
  }

  /**
   * Autoridade, na hora de aplicar: confere e corrige a ação do seguidor (§5.2) no estado em que ela vai
   * valer. Só confere com o descanso n relatado (até lá a fila não a entrega) e o estado aceitando esse
   * tipo de ação (senão ela sai sem conferir e o driver não a aplica). Vez que não é do lado da ação (a autoridade nunca joga pelo seguidor nem o contrário),
   * botão de outro time, cobrador errado ou `expire` com relógio sobrando: descarta e o seguidor recebe
   * m:sync (nunca vira pênalti contra ele). Número não finito já virou idle/pmiss na chegada.
   * true = pode aplicar.
   */
  private validate(entry: LogEntry): boolean {
    const state = this.state;
    const action = entry.action;
    const n = action.n;
    if (!state || (this.restN !== n && this.lastRest?.n !== n)) return false;
    const owner = ownerFor(state, action.kind);
    // Fase de outro tipo de ação: sai sem conferir. O driver nunca a aplica aqui (accepts() vê as mesmas
    // fases); parado num descanso estável ele a descarta (consume + requestSync); em jogada ou pausa espera.
    if (owner === undefined) return true;
    if (action.kind !== "porder" && action.side !== owner) return this.dropFollowerAction(n);
    const base = this.opened && this.opened.n === n ? this.opened.clock : state.clock;
    const spent = this.allowedSpentS(n);
    const clampClock = (clock: number) => (clock === NO_CLOCK ? clock : Math.max(base - spent, Math.min(base, clock)));
    if (action.kind === "shot") {
      const disc = state.bodies.find((body) => body.id === action.shot.bodyId);
      if (!disc || disc.kind !== "disc" || disc.side !== action.side) return this.dropFollowerAction(n);
      const shot = validateRemoteShot(state, action.shot, "open", action.k);
      if (shot) entry.action = { ...action, shot, clock: clampClock(action.clock) };
    } else if (action.kind === "pshot") {
      if (penaltyShooter(state).id !== action.shot.bodyId) return this.dropFollowerAction(n);
      const shot = validateRemoteShot(state, action.shot, "penalty", action.k);
      if (shot) entry.action = { ...action, shot };
    } else if (action.kind === "idle") {
      entry.action = { ...action, clock: clampClock(action.clock) };
    } else if (action.kind === "expire" && !state.finalShotGrace && base - spent > 0) {
      // O relógio do dono só acaba se o tempo que ele pode ter gasto no turno cobre o que sobrava.
      return this.dropFollowerAction(n);
    }
    entry.checked = true;
    return true;
  }

  /**
   * Quanto relógio o dono pode ter gasto no turno n: os 7 s + folga, ou o que a autoridade viu passar
   * descongelado + folga, mais o piso de 3 s de cada volta de congelamento desde o descanso (§5.5), até
   * MAX_CREDITED_RESUMES voltas.
   */
  private allowedSpentS(n: number): number {
    const observed = this.opened && this.opened.n === n ? this.opened.observedMs / 1000 : 0;
    return Math.max(CLOCK_SLACK_S, observed + OBSERVED_SLACK_S) + T.RESUME_TIMER_FLOOR_S * Math.min(this.resumesSinceRest, MAX_CREDITED_RESUMES);
  }

  /** Ação do seguidor recusada antes de aplicar: sai do log e ele adota o descanso de n (m:sync, se + 1). */
  private dropFollowerAction(n: number): false {
    this.log.delete(n);
    if (this.lastRest && this.lastRest.n === this.appliedN) this.sendSync("stuck");
    else this.syncAfterRest = "stuck";
    return false;
  }

  private onAuthorityRest(data: Record<string, unknown>): void {
    if (!isInt(data.n) || typeof data.h !== "string" || !record(data.match)) return;
    const n = data.n;
    const match = data.match as unknown as SerializedMatch;
    const pres = (record(data.pres) as DuelPresentation | null) ?? null;
    this.authRests.set(n, { h: data.h, match, pres });
    this.authRestN = Math.max(this.authRestN, n);
    if (this.role === "follower" && (!this.lastAuthRest || n >= this.lastAuthRest.n)) this.lastAuthRest = { n, match };
    for (const key of [...this.authRests.keys()]) if (key < n - HELLO_LOG) this.authRests.delete(key);
    this.compareRest(n);
  }

  /** Seguidor/espectador: o meu descanso n e o da autoridade existem → compara (§5.3). */
  private compareRest(n: number): void {
    const theirs = this.authRests.get(n);
    const mine = this.localHashes.get(n);
    if (!theirs || mine === undefined) return;
    this.authRests.delete(n);
    if (theirs.h !== mine) {
      if (this.appliedN === n) {
        this.directives.push({ type: "sync", n, se: this.se, match: theirs.match, pres: theirs.pres, reason: "hash" });
        this.lastRest = { n, h: theirs.h, match: theirs.match, pres: theirs.pres, phase: theirs.match.phase, clock: theirs.match.clock, key: "" };
        this.restHash = theirs.h;
        this.localHashes.set(n, theirs.h);
        this.agreedRestN = n;
        if (this.role === "follower") this.saveCheckpoint(false);
      }
      return;
    }
    this.agreedRestN = n;
  }

  private onHello(data: Record<string, unknown>): void {
    if (!isInt(data.n) || !Array.isArray(data.log)) return;
    const peerN = data.n;
    this.peerHello = { n: peerN, at: this.now() };
    if (this.role === "authority") {
      const orders = record(data.orders);
      if (orders && Array.isArray(orders.cpu) && !this.orders.cpu) {
        this.orders.cpu = (orders.cpu as unknown[]).filter((id): id is string => typeof id === "string");
        this.maybeWriteOrders(false);
      }
    } else if (this.state?.phase === "penalty-setup") {
      this.resendOrder();
    }
    const end = this.logEnd();
    const entries = (data.log as unknown[]).slice(0, HELLO_LOG * 2).map(parseAction).filter((action): action is DuelAction => action !== null);
    if (this.role === "authority" && this.phase === "live" && !this.matchOver() && this.helloInStep(data, end, entries)) {
      // Seguidor em dia com a autoridade viva: ele só precisa do m:resume para sair da pausa dele. A
      // autoridade não congela (um hello forjado nunca a para nem compra crédito de volta); o timer da
      // reivindicação ganha o piso da volta dele, dentro do limite do turno.
      const now = this.now();
      if (now - this.resumeAnsweredAt >= RESUME_ANSWER_MS) {
        this.resumeAnsweredAt = now;
        this.send("m:resume", { matchId: this.matchId, pools: { ...this.pools } });
        this.applyClaimFloor();
      }
      return;
    }
    // Conflito no mesmo índice: o log da autoridade vale.
    for (const entry of entries) {
      const mine = this.log.get(entry.n);
      if (!mine || sameAction(mine.action, normalizeAction(entry))) continue;
      if (this.role === "follower") {
        this.log.set(entry.n, { action: normalizeAction(entry), by: "peer", checked: true });
        this.requestFork();
        return;
      }
    }
    if (peerN > end) {
      const byN = new Map(entries.map((entry) => [entry.n, entry]));
      // O hello leva só as últimas HELLO_LOG: um buraco maior nunca é coberto (sem laço pelo n que veio).
      let covered = peerN - end <= HELLO_LOG;
      for (let index = end; covered && index < peerN; index += 1) if (!byN.has(index)) covered = false;
      if (covered) {
        for (let index = end; index < peerN; index += 1) {
          const entry = byN.get(index) as DuelAction;
          if (this.role === "authority") this.acceptFollowerActionFromHello(entry);
          else this.acceptAuthorityAction(entry);
        }
        if (this.role === "authority" && this.logEnd() < peerN) covered = false; // o que só a autoridade escreve, fora da recuperação
      }
      if (!covered) {
        if (this.role === "follower") this.askSync("gap");
        else if (this.recovering) this.askLost();
        // Autoridade viva: o seguidor não pode estar mais de uma ação à frente; ele adota o meu estado.
        else this.sendSync("gap");
      }
    }
    if (this.role === "follower" && this.phase === "setup" && peerN > 0) this.phase = "paused";
    // O seguidor está voltando (só manda hello parado ou ao religar): a autoridade para junto e
    // refaz a volta. Já em contagem, o m:resume dela está a caminho.
    if (this.role === "authority" && !this.matchOver()) {
      if (this.phase === "live") {
        this.pause();
        // Pausa pedida por um seguidor que nunca sumiu para mim (hello fora de dia com ele "ok").
        this.helloPause = !!this.opponent && this.session.health(this.opponent) === "ok";
      }
      if (this.phase === "paused") this.needResume = true;
    }
  }

  /**
   * Autoridade: o hello do seguidor está em dia com o meu log (o mesmo fim, o mesmo descanso e hash, a
   * mesma época, nada diferente no mesmo índice) e ele está "ok" para mim.
   */
  private helloInStep(data: Record<string, unknown>, end: number, entries: DuelAction[]): boolean {
    if (!this.opponent || this.session.health(this.opponent) !== "ok") return false;
    if (data.n !== end || data.restN !== this.restN || data.h !== this.restHash || data.se !== this.se) return false;
    return entries.every((entry) => {
      const mine = this.log.get(entry.n);
      return !mine || sameAction(mine.action, normalizeAction(entry));
    });
  }

  /**
   * Gap preenchido pelo hello do seguidor. As dele entram como um m:act; as do meu lado (e o `porder`)
   * só enquanto recupero o meu passado, e mesmo assim conferidas na hora de aplicar.
   */
  private acceptFollowerActionFromHello(raw: DuelAction): void {
    const action = normalizeAction(raw);
    if (this.log.has(action.n) || action.n < this.appliedN || action.n > this.appliedN + MAX_AHEAD_FOLLOWER) return;
    const follower = action.kind !== "porder" && action.side === "cpu";
    if (!follower && !this.recovering) return;
    this.log.set(action.n, { action, by: follower ? "peer" : "ctrl", checked: false });
  }

  private onSyncRequest(data: Record<string, unknown>): void {
    const reason = data.reason;
    if (reason === "fork" || reason === "gap" || reason === "stuck" || reason === "hash") this.sendSync(reason);
  }

  private onSync(body: SyncBody): void {
    if (body.full) {
      this.specFull = true;
      return;
    }
    if (!isInt(body.n) || !record(body.match) || !Array.isArray(body.log)) return;
    const why = ["hash", "fork", "gap", "stuck", "lost", "spectate"].includes(body.why as string) ? body.why : null;
    const reason: DuelDirective["reason"] = this.role === "spectator" ? "spectate" : this.syncWanted?.reason ?? (this.forkPending ? "fork" : why ?? "gap");
    this.specFull = false;
    if (this.role === "follower" && typeof body.se === "number") this.se = body.se;
    for (const key of [...this.log.keys()]) if (key >= body.n) this.log.delete(key);
    for (const raw of body.log.slice(0, MAX_AHEAD_AUTHORITY)) {
      const action = parseAction(raw);
      if (action && action.n >= body.n && action.n <= body.n + MAX_AHEAD_AUTHORITY) this.log.set(action.n, { action: normalizeAction(action), by: "peer", checked: true });
    }
    this.directives.push({ type: "sync", n: body.n, se: this.se, match: body.match, pres: body.pres ?? null, reason });
    this.appliedN = body.n;
    this.forkPending = false;
    this.syncWanted = null;
    this.gapSince = null;
    this.lastRest = { n: body.n, h: null, match: body.match, pres: body.pres ?? null, phase: body.match.phase, clock: body.match.clock, key: "" };
    if (this.role === "follower") {
      this.lastAuthRest = { n: body.n, match: body.match };
      if (this.phase === "setup") this.phase = "paused";
      this.saveCheckpoint(false);
    }
    this.restN = body.n;
    this.agreedRestN = body.n;
  }

  /**
   * Autoridade recuperando: o estado que o seguidor guardou dela. Nunca volta para antes do que eu já
   * tenho; o descanso que eu ainda conheço tem de bater; tudo do log é conferido na hora de aplicar.
   */
  private onSyncUp(data: Record<string, unknown>): void {
    if (!this.lostPending || !this.recovering || !isInt(data.n) || !record(data.match) || !Array.isArray(data.log)) return;
    const n = data.n;
    const match = data.match as unknown as SerializedMatch;
    // Partida acabada já foi relatada e fechada na chave: nunca volta por aqui (um estado "finished"
    // inventado viraria o resultado da autoridade).
    if (match.phase === "finished") return;
    if (n < (this.lastRest?.n ?? 0)) return;
    if (this.lastRest && this.lastRest.n === n && this.lastRest.h) {
      try {
        if (hashMatch(restoreMatch(this.setup, match)) !== this.lastRest.h) return;
      } catch {
        return;
      }
    }
    this.lostPending = false;
    for (const key of [...this.log.keys()]) if (key >= n) this.log.delete(key);
    for (const raw of data.log.slice(0, MAX_AHEAD_AUTHORITY)) {
      const action = parseAction(raw);
      if (!action || action.n < n || action.n > n + MAX_AHEAD_AUTHORITY) continue;
      const fromFollower = action.kind !== "porder" && action.side === "cpu";
      this.log.set(action.n, { action: normalizeAction(action), by: fromFollower ? "peer" : "ctrl", checked: false });
    }
    this.directives.push({ type: "sync", n, se: this.se, match, pres: null, reason: "lost" });
    this.appliedN = n;
    this.restN = n;
    this.lastRest = { n, h: null, match, pres: null, phase: match.phase, clock: match.clock, key: "" };
    this.gapSince = null;
    this.needResume = true;
  }

  private onResume(data: Record<string, unknown>): void {
    const pools = record(data.pools);
    if (pools) {
      for (const [id, left] of Object.entries(pools)) {
        if (id in this.pools && typeof left === "number" && Number.isFinite(left)) this.pools[id] = Math.max(0, Math.min(this.pools[id], left));
      }
    }
    // A autoridade voltou e está pronta: o W.O. que eu pedi e o anfitrião não decidiu cai; jogamos.
    if (this.claimPending) this.withdrawClaim();
    if (this.matchOver()) return;
    this.startCountdown(this.phase === "setup" && this.appliedN === 0 ? "start" : "resume");
  }

  private onNudge(n: number): void {
    // O seguidor viu a minha vez parada por 13 s: se a ação n ainda não existe, o controlador joga o idle (§5.5).
    if (n !== this.appliedN || this.log.has(n) || this.matchOver()) return;
    const state = this.state;
    if (!state || (state.phase !== "aim" && state.phase !== "kickoff") || state.turn !== "user" || this.restN !== n) return;
    const opened = this.opened && this.opened.n === n ? this.opened : null;
    const clock = opened ? opened.clock : this.lastRest?.clock ?? state.clock;
    const key = opened ? opened.key : matchKey(state);
    this.writeControl({ kind: "idle", n, k: key, se: this.se, side: "user", clock: Math.max(0, clock - USER_DECISION_SECONDS) });
  }

  private onAim(from: string, data: Record<string, unknown>): void {
    const n = data.n as number;
    if (data.clear === true) this.aim = null;
    else if (typeof data.bodyId === "string" && typeof data.dragX === "number" && typeof data.dragY === "number") {
      const aim: RemoteAim = { bodyId: data.bodyId, dragX: data.dragX, dragY: data.dragY };
      if (typeof data.keeperX === "number") aim.keeperX = data.keeperX;
      if (data.keeperDir === 1 || data.keeperDir === -1) aim.keeperDir = data.keeperDir;
      this.aim = { n, aim };
    }
    if (this.role === "authority" && from === this.opponent) for (const id of this.spectators) this.session.sendLossy(id, "m:aim", data);
    // Sem notify aqui: o receive() chama o refresh() logo depois, e a chave dele já tem a mira remota
    // (avisar aqui também redesenhava a partida duas vezes a cada mira que aparece ou some, §11.6).
  }

  private onSpectatorJoin(from: string): void {
    if (from === this.opponent || from === this.session.playerId) return;
    if (this.canSpectate && !this.canSpectate(from)) return;
    // Só quem ainda tem sinal ocupa vaga (quem fechou a aba sem spec:leave sai em SPECTATOR_LOST_MS).
    const active = [...this.spectators].filter((id) => this.session.health(id) !== "lost").length;
    if (!this.spectators.has(from) && active >= MAX_SPECTATORS) {
      this.session.send(from, "m:sync", { matchId: this.matchId, full: true } as unknown as MatchBodies["m:sync"]);
      return;
    }
    this.spectators.add(from);
    this.spectatorLostAt.delete(from);
    this.sendSync("spectate", from);
  }

  /** Autoridade/solo: espectador sem sinal por SPECTATOR_LOST_MS sai da lista (sem fila confiável para ninguém). */
  private pruneSpectators(now: number): void {
    for (const id of this.spectators) {
      if (this.session.health(id) !== "lost") {
        this.spectatorLostAt.delete(id);
        continue;
      }
      const since = this.spectatorLostAt.get(id) ?? now;
      this.spectatorLostAt.set(id, since);
      if (now - since >= SPECTATOR_LOST_MS) {
        this.spectators.delete(id);
        this.spectatorLostAt.delete(id);
      }
    }
  }

  private joinAsSpectator(): void {
    if (!this.opponent) return;
    const now = this.now();
    if (now - this.specJoinAt < SYNC_RETRY_MS) return;
    this.specJoinAt = now;
    this.session.send(this.opponent, "spec:join", { matchId: this.matchId });
  }

  // =========================================================================
  // Descansos
  // =========================================================================

  private authorityRest(n: number, state: BotaoMatchState, h: string, pres: DuelPresentation | null): void {
    const match = serializeMatch(state);
    this.lastRest = { n, h, match, pres, phase: state.phase, clock: state.clock, key: matchKey(state) };
    const body: MatchBodies["m:rest"] = { matchId: this.matchId, n, h, match, pres };
    if (this.role === "authority") this.send("m:rest", body);
    this.toSpectators("m:rest", body);
    if (this.syncAfterRest) {
      const reason = this.syncAfterRest;
      this.syncAfterRest = null;
      this.sendSync(reason);
    }
    this.maybeWriteOrders(false);
    this.saveCheckpoint(false);
    this.sendLive(state);
  }

  private followerRest(n: number, state: BotaoMatchState, h: string, pres: DuelPresentation | null): void {
    this.localHashes.set(n, h);
    for (const key of [...this.localHashes.keys()]) if (key < n - HELLO_LOG) this.localHashes.delete(key);
    if (this.role === "follower") {
      this.lastRest = { n, h, match: serializeMatch(state), pres, phase: state.phase, clock: state.clock, key: matchKey(state) };
      this.saveCheckpoint(false);
    }
    this.compareRest(n);
  }

  /**
   * Fim de jogo (no descanso ou numa transição local depois dele, ex.: o gol que vira apito).
   * Autoridade/solo relatam na hora; o seguidor só depois de o descanso dele bater com o da
   * autoridade (ou de adotar o dela), para nunca relatar um placar que derivou.
   */
  private checkFinished(): void {
    const state = this.state;
    if (this.outcomeSent || !state || state.phase !== "finished" || !state.result || this.role === "spectator") return;
    if (this.role === "follower" && (this.agreedRestN !== this.restN || this.directives.length > 0)) return;
    this.emitOutcome({ kind: "result", result: state.result });
  }

  // =========================================================================
  // Sincronia
  // =========================================================================

  /** Autoridade → seguidor (`se + 1`) ou → um espectador (mesmo `se`). */
  private sendSync(reason: DuelDirective["reason"], to: string | null = null): void {
    const target = to ?? this.opponent;
    if (!target || this.role === "follower") return;
    const rest = this.lastRest ?? this.initialRest();
    const log: DuelAction[] = [];
    const keys = [...this.log.keys()].filter((key) => key >= rest.n).sort((a, b) => a - b);
    for (const key of keys) log.push((this.log.get(key) as LogEntry).action);
    if (to === null && this.role === "authority") this.se += 1;
    const body: SyncBody = { matchId: this.matchId, n: rest.n, se: this.se, match: rest.match, pres: rest.pres, log, why: reason };
    this.session.send(target, "m:sync", body);
  }

  private initialRest(): Rest {
    const state = createMatch(this.setup);
    return { n: 0, h: hashMatch(state), match: serializeMatch(state), pres: null, phase: state.phase, clock: state.clock, key: matchKey(state) };
  }

  /** Seguidor/espectador: pede o estado da autoridade e espera (entrada congelada). */
  private askSync(reason: "fork" | "gap" | "stuck" | "hash"): void {
    if (!this.opponent) return;
    const now = this.now();
    if (this.syncWanted && now - this.syncWanted.at < SYNC_RETRY_MS) return;
    this.syncWanted = { reason, at: now };
    this.send("m:sync-req", { matchId: this.matchId, reason });
  }

  private requestFork(): void {
    this.forkPending = true;
    this.askSync("fork");
  }

  /** Autoridade sem o próprio passado (checkpoint perdido): pede ao seguidor (`m:sync-up`). */
  private askLost(): void {
    const now = this.now();
    if (this.lostPending && this.syncWanted && now - this.syncWanted.at < SYNC_RETRY_MS) return;
    this.lostPending = true;
    this.syncWanted = { reason: "lost", at: now };
    this.send("m:sync-req", { matchId: this.matchId, reason: "lost" });
  }

  /** Seguidor: devolve à autoridade o último descanso dela e tudo o que veio depois. */
  private sendSyncUp(): void {
    const base = this.lastAuthRest ?? { n: 0, match: serializeMatch(createMatch(this.setup)) };
    const log: DuelAction[] = [];
    for (const key of [...this.log.keys()].filter((index) => index >= base.n).sort((a, b) => a - b)) log.push((this.log.get(key) as LogEntry).action);
    this.send("m:sync-up", { matchId: this.matchId, n: base.n, match: base.match, log });
  }

  private sendHello(): void {
    if (this.role === "solo" || this.role === "spectator") return;
    this.helloAt = this.now();
    const end = this.logEnd();
    const log: DuelAction[] = [];
    for (let index = Math.max(0, end - HELLO_LOG); index < end; index += 1) {
      const entry = this.log.get(index);
      if (entry) log.push(entry.action);
    }
    const orders: Partial<Record<BotaoSide, string[]>> = this.role === "authority" ? { ...this.orders } : this.myOrder ? { [this.myOrder.side]: this.myOrder.order } : {};
    this.send("m:hello", {
      matchId: this.matchId,
      n: end,
      h: this.restHash,
      restN: Math.max(0, this.restN),
      se: this.se,
      log,
      orders,
    });
  }

  private sendSetup(): void {
    this.setupSentAt = this.now();
    this.send("m:setup", { matchId: this.matchId, bracketId: this.bracketId, setup: this.setup, sides: this.sides, names: this.names });
  }

  private resendOrder(): void {
    if (this.myOrder) this.send("m:order", { matchId: this.matchId, side: this.myOrder.side, order: this.myOrder.order });
  }

  /** Primeiro índice a partir do aplicado que este aparelho ainda não tem. */
  private logEnd(): number {
    let end = this.appliedN;
    while (this.log.has(end)) end += 1;
    return end;
  }

  // =========================================================================
  // Ações escritas pelo controlador (autoridade/solo)
  // =========================================================================

  private writeControl(action: DuelAction): void {
    if (this.log.has(action.n)) return;
    this.log.set(action.n, { action, by: "ctrl", checked: true });
    if (this.role === "authority") this.send("m:act", this.actBody(action));
    this.saveCheckpoint(false);
  }

  /** `porder` com as duas ordens, ou com a padrão de quem faltou no prazo (solo: a CPU usa a padrão na hora). */
  private maybeWriteOrders(deadline: boolean): void {
    if (this.role !== "authority" && this.role !== "solo") return;
    const state = this.state;
    if (!state || state.phase !== "penalty-setup" || !state.penalties || this.restN !== this.appliedN || this.log.has(this.appliedN)) return;
    const user = this.orders.user;
    const cpu = this.orders.cpu ?? (this.role === "solo" ? state.penalties.order.cpu.slice() : undefined);
    if (!deadline && (!user || !cpu)) return;
    const orders: Record<BotaoSide, string[]> = {
      user: user ?? state.penalties.order.user.slice(),
      cpu: cpu ?? state.penalties.order.cpu.slice(),
    };
    this.writeControl({ kind: "porder", n: this.appliedN, k: matchKey(state), se: this.se, orders });
  }

  // =========================================================================
  // Tempo
  // =========================================================================

  private scheduleTick(): void {
    if (this.disposed) return;
    this.tickHandle = this.clock.setTimeout(() => {
      this.tickHandle = null;
      if (this.disposed) return;
      try {
        this.tick();
      } catch (error) {
        console.error("[bobonline] partida (tick)", error);
      }
      this.scheduleTick();
    }, TICK_MS);
  }

  private tick(): void {
    const now = this.now();
    const dt = Math.max(0, Math.min(5000, now - this.lastTickAt));
    this.lastTickAt = now;
    this.updatePresence(dt);
    if (this.notice && now >= this.notice.until) this.notice = null;

    if (this.countdown && now >= this.countdown.until) {
      this.countdown = null;
      if (this.phase === "countdown") {
        this.phase = "live";
        this.applyClaimFloor();
      }
    }

    this.checkFinished();
    const frozen = this.isFrozen();
    // Tempo que a autoridade vê passar no turno aberto e as voltas de congelamento (o clamp do relógio, §5.2).
    if (!frozen && this.opened && this.opened.n === this.appliedN) this.opened.observedMs += dt;
    if (this.frozenAtTick && !frozen) this.resumesSinceRest += 1;
    this.frozenAtTick = frozen;
    if (this.role === "authority") this.authorityTick(now, dt, frozen);
    else if (this.role === "follower") this.followerTick(now, dt, frozen);
    else if (this.role === "spectator") {
      if (this.lastRest === null && !this.specFull) this.joinAsSpectator();
    }
    if (this.role === "solo") this.soloTick(now, dt, frozen);
    if (this.role === "authority" || this.role === "solo") this.pruneSpectators(now);
    if ((this.role === "authority" || this.role === "solo") && !this.matchOver() && now - this.liveAt >= T.LIVE_EVERY_MS && this.state) this.sendLive(this.state);
    if (this.role !== "spectator" && this.ownTurnOpen() && now - this.timerSavedAt >= T.TIMER_CHECKPOINT_MS) this.saveCheckpoint(true);
    this.refresh();
  }

  private authorityTick(now: number, dt: number, frozen: boolean): void {
    if (this.phase === "setup" && now - this.setupSentAt >= T.SETUP_RESEND_MS) this.sendSetup();
    if (this.phase === "paused" && this.needResume) this.evaluateResume(now);
    // Prazo da ordem dos batedores pelo estado vivo: a disputa pode começar sem descanso nela
    // (gol de empate no 0:00 → pausa do gol → pênaltis), e o prazo vale do mesmo jeito.
    if (this.state?.phase === "penalty-setup" && !this.log.has(this.appliedN)) {
      if (this.orderEntryN !== this.appliedN) {
        this.orderEntryN = this.appliedN;
        this.orderMs = 0;
      }
      if (!frozen) this.orderMs += dt;
      if (this.orderMs >= T.PENALTY_ORDER_DEADLINE_MS) this.maybeWriteOrders(true);
    }
    this.watchGap(now);
    this.claimTick(dt, frozen);
  }

  private followerTick(now: number, dt: number, frozen: boolean): void {
    if (this.phase === "paused" && !this.blocked() && now - this.helloAt >= HELLO_REPEAT_MS) this.sendHello();
    if (this.syncWanted && now - this.syncWanted.at >= SYNC_RETRY_MS) {
      const reason = this.syncWanted.reason;
      this.syncWanted = null;
      if (reason !== "lost" && reason !== "spectate") this.askSync(reason);
    }
    this.watchGap(now);
    this.stallTick(now, dt, frozen);
  }

  private soloTick(now: number, dt: number, frozen: boolean): void {
    void now;
    if (!frozen && this.state?.phase === "penalty-setup") this.maybeWriteOrders(false);
    void dt;
  }

  /** Durante o aperto de mão: o outro lado relata um n que eu não tenho e nada chega → pede (gap/lost). */
  private watchGap(now: number): void {
    if (this.phase !== "paused" || this.blocked()) {
      this.gapSince = null;
      return;
    }
    const peer = this.peerProgress();
    if (!peer || peer.n <= this.logEnd()) {
      this.gapSince = null;
      return;
    }
    if (this.gapSince === null) this.gapSince = now;
    if (now - this.gapSince < GAP_PATIENCE_MS) return;
    this.gapSince = now;
    if (this.role === "follower") this.askSync("gap");
    else if (this.recovering) this.askLost();
    else this.sendSync("gap"); // autoridade viva: o n que o seguidor diz ter não existe aqui; ele adota o meu
  }

  /** Autoridade: os dois no mesmo n e no mesmo descanso → m:resume (com m:sync antes se o hash diferir). */
  private evaluateResume(now: number): void {
    if (this.blocked() || this.lostPending || this.matchOver() || this.claimPending) return;
    const peer = this.peerProgress();
    if (!peer) {
      if (now - this.helloAt >= HELLO_REPEAT_MS) this.sendHello();
      return;
    }
    const mine = this.progress;
    const myN = mine?.n ?? this.appliedN;
    const myRest = mine?.restN ?? this.restN;
    const myHash = mine?.h ?? this.restHash;
    if (peer.n !== myN || peer.restN !== myRest || this.restN < 0) {
      if (now - this.helloAt >= HELLO_REPEAT_MS) this.sendHello();
      return;
    }
    if (peer.h !== myHash) this.sendSync("hash");
    this.send("m:resume", { matchId: this.matchId, pools: { ...this.pools } });
    this.needResume = false;
    this.startCountdown("resume");
  }

  /** Reivindicação da autoridade: o seguidor está provadamente parado na vez dele (§5.5). */
  private claimTick(dt: number, frozen: boolean): void {
    const opened = this.opened;
    const state = this.state;
    if (!opened || !state || opened.side !== "cpu" || opened.n !== this.appliedN || this.log.has(opened.n) || this.matchOver()) return;
    const follower = this.opponent;
    if (frozen) {
      // Voltas além do teto do turno que o seguidor pediu sem nunca sumir (hello fora de dia com ele "ok"):
      // a contagem também conta. Quem força pausa e volta sem parar não compra tempo, e a reivindicação chega.
      if (this.helloPause && this.phase === "countdown" && opened.floors >= MAX_CREDITED_RESUMES && follower && this.session.health(follower) === "ok") opened.unfrozenMs += dt;
      return;
    }
    opened.unfrozenMs += dt;
    if (!follower || this.session.health(follower) !== "ok") return;
    const progress = this.session.progressOf(follower);
    const p = progress?.p;
    const penalties = state.phase === "penalties";
    if (progress && p && progress.at !== opened.hbAt) {
      opened.hbAt = progress.at;
      const out = penalties ? p.own?.kickLeft !== null && p.own?.kickLeft !== undefined && p.own.kickLeft <= 0 : p.own !== null && p.own.idleLeft <= 0;
      opened.hbOk = p.matchId === this.matchId && p.opened === opened.n && out ? opened.hbOk + 1 : 0;
    }
    if (!progress || !p || p.matchId !== this.matchId || this.now() - progress.at > PROGRESS_FRESH_MS || p.n !== opened.n) return;
    const soft = (penalties ? ONLINE_TIMING.KICK_LIMIT_S + T.KICK_CLAIM_SLACK_S : USER_DECISION_SECONDS + T.IDLE_CLAIM_SLACK_S) * 1000;
    const hard = (penalties ? T.KICK_CLAIM_HARD_S : T.IDLE_CLAIM_HARD_S) * 1000;
    if (opened.unfrozenMs < soft || (opened.hbOk < 2 && opened.unfrozenMs < hard)) return;
    let claim: DuelAction | null = null;
    if (penalties) claim = { kind: "pmiss", n: opened.n, k: opened.key, se: this.se, side: "cpu" };
    else if (state.phase === "aim" || state.phase === "kickoff") {
      claim = { kind: "idle", n: opened.n, k: opened.key, se: this.se, side: "cpu", clock: Math.max(0, opened.clock - USER_DECISION_SECONDS) };
    }
    if (claim) {
      this.claimLog.push(claim);
      this.writeControl(claim);
    }
  }

  /** Seguidor: a autoridade está ok mas não joga a vez dela (§5.5) → cutucão, faixa e reserva dela correndo. */
  private stallTick(now: number, dt: number, frozen: boolean): void {
    const opened = this.opened;
    const authority = this.opponent;
    if (!opened || !authority || opened.side !== "user" || opened.n !== this.appliedN || this.log.has(opened.n) || this.matchOver()
      || frozen || this.session.health(authority) !== "ok") {
      if (!opened || opened.n !== this.appliedN || this.log.has(opened.n)) {
        this.stall = null;
        this.stalled = false;
      }
      return;
    }
    const p = this.session.progressOf(authority)?.p;
    const peerN = p && p.matchId === this.matchId ? p.n : null;
    if (!this.stall || this.stall.n !== opened.n || (peerN !== null && this.stall.peerN !== null && peerN !== this.stall.peerN)) {
      this.stall = { n: opened.n, ms: 0, peerN, nudgedAt: Number.NEGATIVE_INFINITY };
      this.stalled = false;
    }
    if (peerN !== null && peerN > opened.n) return; // a autoridade já aplicou a ação n: ela está em trânsito
    this.stall.peerN = peerN;
    this.stall.ms += dt;
    if (this.stall.ms < T.AUTHORITY_STALL_S * 1000) return;
    this.stalled = true;
    if (now - this.stall.nudgedAt >= NUDGE_REPEAT_MS) {
      this.stall.nudgedAt = now;
      this.send("m:nudge", { matchId: this.matchId, n: opened.n });
    }
  }

  /**
   * Fim de uma contagem: o timer da reivindicação recomeça com pelo menos 3 s + folga (§5.5), nas
   * primeiras MAX_CREDITED_RESUMES voltas do turno (depois ele segue contando de onde estava).
   */
  private applyClaimFloor(): void {
    const opened = this.opened;
    if (opened && this.state) {
      const penalties = this.state.phase === "penalties";
      const soft = (penalties ? ONLINE_TIMING.KICK_LIMIT_S + T.KICK_CLAIM_SLACK_S : USER_DECISION_SECONDS + T.IDLE_CLAIM_SLACK_S) * 1000;
      const slack = (penalties ? T.KICK_CLAIM_SLACK_S : T.IDLE_CLAIM_SLACK_S) * 1000;
      if (opened.floors < MAX_CREDITED_RESUMES) {
        opened.floors += 1;
        opened.unfrozenMs = Math.min(opened.unfrozenMs, soft - (T.RESUME_TIMER_FLOOR_S * 1000 + slack));
      }
      opened.hbOk = 0;
    }
    if (this.stall) this.stall.ms = 0;
  }

  // =========================================================================
  // Presença, reservas, congelamento
  // =========================================================================

  private opponentHealth(): PeerHealth | null {
    if (!this.opponent || this.role === "solo") return null;
    return this.session.health(this.opponent);
  }

  /** Algo impede jogar agora (o outro sumiu, eu sem rede, rota, página escondida). */
  private blocked(): boolean {
    if (this.hidden) return true;
    if (this.role === "solo" || this.role === "spectator") return false;
    const health = this.opponentHealth();
    return health === "lost" || health === "away" || this.route !== null || !this.session.online();
  }

  private pause(): void {
    if (this.role === "spectator" || this.phase === "ended") return;
    if (this.phase === "live" || this.phase === "countdown") {
      this.phase = "paused";
      this.countdown = null;
      if (this.role === "authority") this.needResume = true;
    }
  }

  private updatePresence(dt: number): void {
    if (this.role === "spectator" || this.phase === "ended") return;
    const now = this.now();
    if (this.blocked()) {
      this.pause();
      this.helloPause = false; // ausência de verdade (ou eu sem rede): a volta não é forçada
    }
    if (this.role === "solo") return;
    const health = this.opponentHealth();
    if (this.claimPending) {
      // W.O. pedido, anfitrião sem decidir: com o outro de volta (ok) por um tempo, retiro e jogamos.
      // O de travamento só cai pela recusa do anfitrião (o outro está "ok" por definição).
      if (this.claimPending.reason === "timeout" && health === "ok" && !this.hidden && this.session.online()) {
        this.claimPending.okMs += dt;
        if (this.claimPending.okMs >= CLAIM_WITHDRAW_MS) this.withdrawClaim();
      } else this.claimPending.okMs = 0;
      return;
    }
    if (this.route) {
      // Só um link novo encerra a rota (o "ok" logo depois do erro é o silêncio velho ainda curto).
      if (now - this.route.lastRejoin >= T.REJOIN_RETRY_MS) {
        this.route.lastRejoin = now;
        void this.session.rejoin().catch(() => undefined);
      }
      if (now - this.route.since >= T.DOUBLE_ABSENT_S * 1000 && !this.matchOver()) {
        this.emitOutcome({ kind: "walkover", winner: matchCoin(this.setup), reason: "double" });
      }
      return; // sem caminho entre dois vivos: nenhuma reserva corre
    }
    if (this.matchOver() || this.hidden || dt <= 0) return;
    const seconds = dt / 1000;
    const online = this.session.online();
    const me = this.session.playerId;
    if (!online) {
      this.offlineSince ??= now;
      if (me in this.pools) this.pools[me] = Math.max(0, this.pools[me] - seconds);
      this.checkSelfPool();
      return;
    }
    if (this.offlineSince !== null) {
      // Voltei da queda de rede: quanto fiquei fora e quanto ainda tenho.
      const away = (now - this.offlineSince) / 1000;
      this.offlineSince = null;
      if (away >= 2 && me in this.pools) this.flash(`Você ficou fora ${mmss(away)} · ainda tem ${mmss(this.pools[me])} nesta partida`);
    }
    const opponent = this.opponent;
    if (!opponent) return;
    const absent = health === "lost" || health === "away" || (this.stalled && this.role === "follower");
    if (absent && opponent in this.pools) {
      this.pools[opponent] = Math.max(0, this.pools[opponent] - seconds);
      if (this.pools[opponent] <= 0 && this.mySide && now >= this.claimRetryAt) {
        this.emitOutcome({ kind: "walkover", winner: this.mySide, reason: this.stalled && health === "ok" ? "stall" : "timeout" });
      }
    }
  }

  private checkSelfPool(): void {
    const me = this.session.playerId;
    if (this.role === "solo" || this.role === "spectator" || !(me in this.pools) || this.pools[me] > 0 || this.matchOver() || this.claimPending || !this.mySide) return;
    // Não voltei a tempo: derrota por W.O. Ao reconectar nunca relato outro resultado; a sala concede
    // (o outro lado pode ver a minha reserva com sobra e nunca pedir o W.O.).
    this.selfLoss = true;
    this.emitOutcome({ kind: "walkover", winner: other(this.mySide), reason: "timeout" });
  }

  /** O W.O. que pedi cai (recusado, ou o outro voltou): a partida volta pelo aperto de mão de sempre. */
  private withdrawClaim(): void {
    if (!this.claimPending) return;
    this.claimPending = null;
    this.outcomeSent = false;
    // A reserva dele já tinha acabado na minha conta: a próxima ausência decide na hora (depois do intervalo).
    if (this.opponent && this.opponent in this.pools) this.pools[this.opponent] = 0;
    this.claimRetryAt = this.now() + CLAIM_RETRY_MS;
    this.pause();
    if (this.role === "authority") this.needResume = true;
    else this.sendHello();
    try {
      this.onOutcome({ kind: "withdrawn" });
    } catch (error) {
      console.error("[bobonline] resultado da partida", error);
    }
  }

  private isFrozen(): boolean {
    if (this.role === "spectator") return false;
    if (this.phase !== "live" || this.hidden || this.forkPending || this.claimPending) return true;
    if (this.role === "solo") return false;
    return this.blocked();
  }

  private startCountdown(kind: "start" | "resume"): void {
    if (this.phase === "ended") return;
    this.countdown = { kind, until: this.now() + (kind === "start" ? ONLINE_TIMING.START_COUNTDOWN_MS : ONLINE_TIMING.RESUME_COUNTDOWN_MS) };
    this.phase = "countdown";
    this.recovering = false; // o aperto de mão fechou: daqui em diante só o que eu mesmo escrevo vale do meu lado
  }

  private ownTurnOpen(): boolean {
    const opened = this.opened;
    return !!opened && opened.n === this.appliedN && opened.side === this.mySide && !this.log.has(opened.n) && !!this.progress?.own;
  }

  /** A partida acabou aqui (um W.O. pedido e ainda sem decisão não conta: pode voltar). */
  private matchOver(): boolean {
    return (this.outcomeSent && !this.claimPending) || this.state?.phase === "finished";
  }

  private emitOutcome(outcome: DuelOutcome): void {
    if (this.outcomeSent) return;
    this.outcomeSent = true;
    if (outcome.kind === "walkover") {
      // Vitória por W.O. (tempo ou travamento) é um pedido ao anfitrião: fica provisória até ele decidir.
      const claim = outcome.winner === this.mySide && (outcome.reason === "timeout" || outcome.reason === "stall");
      if (claim) {
        this.claimPending = { reason: outcome.reason === "stall" ? "stall" : "timeout", okMs: 0 };
        this.pause();
      } else this.phase = "ended";
    }
    try {
      this.onOutcome(outcome);
    } catch (error) {
      console.error("[bobonline] resultado da partida", error);
    }
    this.refresh();
  }

  private flash(text: string): void {
    this.noticeSeq += 1;
    this.notice = { id: this.noticeSeq, text, until: this.now() + NOTICE_MS };
  }

  // =========================================================================
  // Faixas e status
  // =========================================================================

  private banner(): DuelBanner | null {
    if (this.role === "spectator") {
      return this.specFull ? { kind: "route", text: "Transmissão cheia" } : null;
    }
    if (this.phase === "ended") {
      return this.selfLoss ? { kind: "route", text: "Você não voltou a tempo: derrota por W.O." } : null;
    }
    if (this.claimPending) return { kind: "unstable", text: "Vitória por W.O.: confirmando com o anfitrião…" };
    const name = this.mySide ? this.names[other(this.mySide)] : "";
    const me = this.session.playerId;
    const now = this.now();
    if (this.role !== "solo" && !this.matchOver()) {
      if (this.route) return { kind: "route", text: "A conexão entre vocês não fechou. Tentando de novo…" };
      if (!this.session.online()) {
        const left = this.pools[me] ?? 0;
        return { kind: "reconnecting", text: `Sem conexão. Reconectando… · você ainda tem ${mmss(left)}`, secondsLeft: Math.ceil(left) };
      }
      const health = this.opponentHealth();
      const left = this.opponent ? this.pools[this.opponent] ?? 0 : 0;
      if (health === "lost") return { kind: "waiting", text: `${name} caiu. Esperando voltar · ${mmss(left)}`, secondsLeft: Math.ceil(left) };
      if (health === "away") return { kind: "waiting", text: `${name} saiu do app. Esperando voltar · ${mmss(left)}`, secondsLeft: Math.ceil(left) };
      if (this.stalled) return { kind: "waiting", text: `${name} não está jogando · W.O. em ${mmss(left)}`, secondsLeft: Math.ceil(left) };
    }
    if (this.countdown) {
      const secondsLeft = Math.max(1, Math.ceil((this.countdown.until - now) / 1000));
      return { kind: "countdown", text: `${this.countdown.kind === "start" ? "Começa em" : "Voltando em"} ${secondsLeft}…`, secondsLeft };
    }
    if (this.phase === "setup") return { kind: "countdown", text: "Começa em 3…", secondsLeft: 3 };
    if (this.phase === "paused" || this.forkPending) return { kind: "unstable", text: "Conexão instável…" };
    if (this.opponentHealth() === "unstable") return { kind: "unstable", text: "Conexão instável…" };
    return null;
  }

  private opponentIdle(): number | null {
    if (!this.opponent || this.role === "solo" || this.role === "spectator") return null;
    const p = this.session.progressOf(this.opponent)?.p;
    if (!p || p.matchId !== this.matchId || p.n !== this.appliedN || p.opened !== this.appliedN || !p.own) return null;
    const left = p.own.idleLeft;
    return left <= 3 && left > 0 ? Math.max(1, Math.ceil(left)) : null;
  }

  private refresh(): void {
    if (this.disposed) return;
    const frozen = this.isFrozen();
    const banner = this.banner();
    const notice = this.notice ? { id: this.notice.id, text: this.notice.text } : null;
    const opponentIdleS = frozen ? null : this.opponentIdle();
    const key = `${frozen ? 1 : 0}|${banner ? `${banner.kind}:${banner.text}` : "-"}|${notice?.id ?? "-"}|${opponentIdleS ?? "-"}|${this.remoteAim() ? 1 : 0}|${this.remoteHolding() ? 1 : 0}`;
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.statusValue = { frozen, banner, notice, opponentIdleS };
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("[bobonline] ouvinte da partida", error);
      }
    }
  }

  // =========================================================================
  // Progresso do outro lado
  // =========================================================================

  private peerProgress(): MatchProgress | null {
    if (!this.opponent) return null;
    const p = this.session.progressOf(this.opponent)?.p ?? null;
    return p && p.matchId === this.matchId ? p : null;
  }

  private peerRestN(): number | null {
    if (this.role === "spectator") return this.authRestN >= 0 ? this.authRestN : null;
    return this.peerProgress()?.restN ?? null;
  }

  // =========================================================================
  // Saída: rede, ao vivo, checkpoint
  // =========================================================================

  private send<K extends keyof MatchBodies>(kind: K, body: MatchBodies[K]): void {
    if (!this.opponent || this.role === "solo") return;
    this.session.send(this.opponent, kind, body);
  }

  private toSpectators<K extends keyof MatchBodies>(kind: K, body: MatchBodies[K]): void {
    for (const id of this.spectators) this.session.send(id, kind, body);
  }

  private actBody(action: DuelAction): MatchBodies["m:act"] {
    const body: ActBody = { ...action, matchId: this.matchId };
    return body;
  }

  private sendLive(state: BotaoMatchState): void {
    this.liveAt = this.now();
    const pen = state.penalties;
    const text = state.timeline.length ? state.timeline[state.timeline.length - 1].text : null;
    try {
      this.onLive({
        matchId: this.matchId,
        bracketId: this.bracketId,
        score: { home: state.score.user, away: state.score.cpu },
        pens: pen && state.penaltyReason !== "inactivity" ? { home: pen.score.user, away: pen.score.cpu } : null,
        clock: state.clock,
        period: state.period,
        phase: state.phase,
        text,
      });
    } catch (error) {
      console.error("[bobonline] ao vivo", error);
    }
  }

  private saveCheckpoint(withTimers: boolean): void {
    if (this.disposed || this.role === "spectator") return;
    const rest = this.lastRest;
    if (!rest) return;
    this.drainMirror();
    const log: DuelAction[] = [];
    for (const key of [...this.log.keys()].filter((index) => index >= rest.n).sort((a, b) => a - b)) log.push((this.log.get(key) as LogEntry).action);
    let timers: MatchCheckpoint["timers"] = null;
    if (withTimers || this.ownTurnOpen()) {
      const own = this.progress?.own;
      const opened = this.opened;
      if (own && opened && this.ownTurnOpen() && this.state) {
        timers = { turnN: opened.n, ownerClock: this.state.clock, idleLeft: own.idleLeft, kickLeft: own.kickLeft };
      }
      this.timerSavedAt = this.now();
    }
    const cp: MatchCheckpoint = {
      v: 1,
      roomCode: this.roomCode,
      bracketId: this.bracketId,
      matchId: this.matchId,
      role: this.role === "follower" ? "follower" : this.role === "solo" ? "solo" : "authority",
      setup: this.setup,
      sides: this.sides,
      names: this.names,
      n: rest.n,
      match: rest.match,
      log,
      lastAuthRest: this.role === "follower" ? this.lastAuthRest : null,
      se: this.se,
      orders: this.role === "follower" ? (this.myOrder ? { [this.myOrder.side]: this.myOrder.order } : {}) : { ...this.orders },
      timers,
      cpuCursor: this.role === "solo" ? this.mirror.rng?.cursor() ?? null : null,
      pools: { ...this.pools },
      savedAt: this.wallNow(),
    };
    try {
      this.checkpoints.save(cp);
    } catch {
      // Cota/modo privado: o aperto de mão recupera pelo outro lado.
    }
  }

  // =========================================================================
  // Solo: espelho do cérebro da CPU (o cursor que vai no checkpoint)
  // =========================================================================

  private brainSeed(): number {
    return hashSeed(this.setup.seed, "cpu-brain");
  }

  private brainAt(cursor: number | null): Rng | null {
    if (cursor === null || !Number.isFinite(cursor) || cursor < 0) return null;
    const rng = createRng(this.brainSeed());
    for (let index = 0; index < cursor; index += 1) rng.next();
    return rng;
  }

  private queueMirror(action: DuelAction): void {
    const rest = this.lastRest;
    if (!this.mirror.rng || !rest || rest.n !== action.n) {
      this.mirror.rng = null;
      return;
    }
    this.mirrorQueue.push({ rest: rest.match, action });
    // Fora do quadro: o espelho roda as mesmas simulações da IA (alguns ms).
    if (this.mirrorHandle === null) {
      this.mirrorHandle = this.clock.setTimeout(() => {
        this.mirrorHandle = null;
        this.drainMirror();
      }, 0);
    }
  }

  /** Refaz a decisão da CPU no estado do descanso com a rng espelho: o cursor anda igual ao do driver. */
  private drainMirror(): void {
    while (this.mirrorQueue.length) {
      const { rest, action } = this.mirrorQueue.shift() as { rest: SerializedMatch; action: DuelAction };
      const rng = this.mirror.rng;
      if (!rng) {
        this.mirrorQueue.length = 0;
        return;
      }
      try {
        const probe = restoreMatch(this.setup, rest);
        // O driver decide depois das transições locais do descanso (fim da pausa do gol ou do intervalo):
        // o espelho refaz as mesmas antes de perguntar à IA.
        for (let guard = 0; guard < 4; guard += 1) {
          if (probe.phase === "goal") resumeAfterGoal(probe);
          else if (probe.phase === "interval") startNextPeriod(probe);
          else break;
        }
        if (action.kind === "pshot" || action.kind === "pmiss") {
          if (action.kind === "pshot") placePenaltyKeeper(probe, action.keeperX, action.keeperDir);
          const shot = chooseCpuPenaltyShot(probe, penaltyShooter(probe), penaltyKeeper(probe), this.cpuSkill, rng);
          if (action.kind === "pshot" && !sameShot(shot, action.shot)) this.mirror.rng = null;
        } else if (action.kind === "shot" || action.kind === "idle") {
          const chosen = chooseCpuShot(probe, this.cpuSkill, rng, "cpu");
          if (action.kind === "shot" && !sameShot(chosen, action.shot) && !sameShot(fallbackShot(probe, "cpu"), action.shot)) this.mirror.rng = null;
        }
      } catch {
        this.mirror.rng = null;
      }
    }
  }

  private h0Value: string | null = null;
  private h0(): string {
    this.h0Value ??= hashMatch(createMatch(this.setup));
    return this.h0Value;
  }
}

export function createDuelController(args: DuelControllerArgs): DuelController {
  return new DuelController(args);
}

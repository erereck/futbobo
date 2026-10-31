// Cliente da sala do Bobonline (§3.7, §4): a sala e o torneio por cima da sessão.
//
// - Anfitrião: dono do snapshot (membros, ajustes, pronto, chave, resultados, série). Admite e
//   recusa entradas, publica `room:snap` versionado (epoch, version), leva cada partida da chave por
//   espera do resultado → "pronto?" → jogando → fim, simula CPU × CPU num Worker e lacra o
//   resultado, corre as reservas de quem some no "pronto?" e no solo, aceita relatórios e W.O.
// - Membro: adota o snapshot mais novo, guarda os resultados vistos (fatos) e os reenvia a uma
//   linhagem nova, reivindica o posto de anfitrião quando ninguém mais o ouve (maioria, veto),
//   e roda a SUA partida (DuelController) ou a que está assistindo.
// - Tudo o que é hora no snapshot é relógio do anfitrião; as telas convertem com `toLocal`.
// As telas (B6) leem `getState()` (imutável por versão, para useSyncExternalStore) e chamam os
// métodos em eventos.

import { hashSeed } from "../../botao/rng";
import type { BotaoMatchResult, BotaoMatchSetup, BotaoSide } from "../../botao/types";
import { BOB_PROTOCOL, T, type HelloInfo, type MatchBodies, type PeerHealth, type RoomBodies, type RoomRejectReason } from "../protocol";
import {
  clearSession as clearSavedSession,
  cryptoAvailable,
  loadIdentity,
  playerIdFor,
  saveSession as saveSavedSession,
  type Identity,
  type SavedSession,
} from "../net/identity";
import { isPlayerIdLike, isValidRoomCode, makeRoomCode, passwordProof } from "../net/codes";
import { BobLifecycle } from "../net/lifecycle";
import { DEFAULT_NET_CONFIG, loadNetConfig, type NetConfig } from "../net/net-config";
import { BobSession, localHelloInfo } from "../net/session";
import { defaultTransportFactory, realClock, type NetClock, type TransportFactory } from "../net/transport";
import { devProfile } from "../storage";
import { cpuTeamFor, newSeed } from "../teams/generator";
import { BOB_RULE_PRESETS, buildDuelSetup, roundStageName } from "../teams/match-setup";
import { LIMITS, sanitizeNickname, sanitizeTeam, teamHash } from "../teams/model";
import {
  advanceBracket,
  bracketResultHash,
  createBracket,
  matchById,
  nextMatchFor,
  previousMatchOf,
  rematchMatch,
} from "../tournament/bracket";
import type {
  BobTeam,
  Bracket,
  BracketEntrant,
  BracketMatch,
  BracketResult,
  LiveInfo,
  RoomMember,
  RoomSettings,
  RoomSnapshot,
  RoomTeams,
  WalkoverKind,
} from "../types";
import { localCheckpointStore, type CheckpointStore } from "../match/checkpoint";
import { DuelController, matchCoin, type DuelControllerArgs, type DuelOutcome, type DuelRole } from "../match/duel-controller";
import { bracketResultFrom, regulationSecondsOf, sealCpuResult, simulateCpuMatch } from "./cpu-sim";
import type {
  BobRoomClientApi,
  CreateRoomArgs,
  DuelHandle,
  JoinError,
  JoinRoomArgs,
  ResultFact,
  ResumeRoomArgs,
  RoomClientState,
} from "./room-api";
import { factKey, factsOf, localRoomStore, mergeFacts, type PersistedRoom, type RoomStore } from "./room-store";

/** O que a sala usa de um duelo (o DuelController real; os testes da sala passam um falso). */
export type DuelLike = Pick<DuelController,
  "matchId" | "bracketId" | "role" | "launch" | "start" | "feedBuffered" | "dispose" | "receive" | "healthChanged"
  | "linkChanged" | "noteJoinError" | "setVisible" | "flushCheckpoint" | "stop" | "poolOf" | "localProgress" | "finishedHere"
  | "claimRejected">;

/**
 * Dependências injetáveis (testes em Node e ferramentas). Em produção nenhuma é passada:
 * identidade e net.json do aparelho, relógio real, localStorage, Worker de simulação.
 */
export type RoomDeps = {
  identity?: Identity;
  incarnation?: number;
  netConfig?: NetConfig;
  /** Relógio de parede deste aparelho (testes: deslocado para simular celular com hora errada). */
  wallNow?: () => number;
  roomStore?: RoomStore;
  checkpoints?: CheckpointStore;
  simulate?: (setup: BotaoMatchSetup) => Promise<BotaoMatchResult>;
  createDuel?: (args: DuelControllerArgs) => DuelLike;
  saveSession?: (session: SavedSession) => void;
  clearSession?: () => void;
  /** Escada de ciclo de vida (visibilitychange, pause/resume). Padrão: ligada quando há `document`. */
  lifecycle?: boolean;
  /** Reserva de ausência em segundos (dev: `?grace=10`). */
  graceS?: number;
  /** Código fixo (testes). */
  code?: string;
  /** Semente da sala (testes). */
  seed?: number;
  /** O que este aparelho diz rodar no hello (testes de versão). Padrão: localHelloInfo(). */
  hello?: HelloInfo;
};

type Mode = "create" | "join" | "resume";
type CreateArgs = CreateRoomArgs & { transportFactory?: TransportFactory };
type JoinArgs = JoinRoomArgs & { transportFactory?: TransportFactory };
type ResumeArgs = ResumeRoomArgs & { transportFactory?: TransportFactory };
/** Extensões opcionais do fio (campos a mais; quem não conhece ignora). */
type JoinBody = RoomBodies["room:join"] & { pub?: string };
type ReportBody = RoomBodies["match:report"] & { sides?: [string, string] };
/** room:reject "iniciada" leva os ajustes da sala (a tela diz X1 × torneio e só oferece Assistir quando pode). */
type RejectBody = RoomBodies["room:reject"] & { settings?: RoomSettings };
/** match:forfeit `reason: "timeout"`: concessão de quem não voltou a tempo (W.O. por tempo, não abandono). */
type ForfeitBody = RoomBodies["match:forfeit"] & { reason?: "timeout" };
/** host:claim `why`: o anfitrião sumiu ("lost") ou está em segundo plano ("away"). */
type ClaimBody = RoomBodies["host:claim"] & { why?: "lost" | "away" };
/** match:wo-no: o anfitrião recusou o W.O. pedido (vê o ausente presente). */
type WoNoBody = { bracketId: string; matchId: string };
type Toast = RoomClientState["toasts"][number];

const TICK_MS = 250;
const CLAIM_EVERY_MS = 1000;
const PRESENCE_EVERY_MS = 1000;
const HOST_RESUME_WINDOW_MS = 5000;
const JOIN_ERROR_GRACE_MS = 1500;
/** Fim normal: quanto a partida ainda recebe depois do resultado na chave (o mesmo prazo da tela). */
const RESULT_LINGER_MS = 8000;
const MAX_TOASTS = 12;
const DOUBLE_STAKE = 3;
/** Relatórios, W.O., concessões e fatos ainda não vistos no snapshot voltam ao anfitrião neste ritmo. */
const RESEND_MS = 4000;
/** Procurando a sala: uma recusa (ou versão diferente) só vale se nenhuma boas-vindas chegar neste prazo. */
const REJECT_GRACE_MS = 2500;
/**
 * Entrando pelo link com o id do anfitrião (&h=): até aqui na busca só ele responde (boas-vindas, recusa,
 * versão). Depois, as respostas de outro par que esperaram valem (o anfitrião pode ter mudado).
 */
const LINK_HOST_WAIT_MS = T.JOIN_STAGES_MS[0];
/** Respostas de outros pares guardadas nessa espera (uma por par e tipo). */
const DEFERRED_ANSWERS_CAP = 8;
/** Espectadores (membros) por sala; o que some por SPECTATOR_DROP_MS sai da lista. */
const MAX_SPECTATOR_MEMBERS = 8;
const SPECTATOR_DROP_MS = 120_000;
/** Sem maioria possível (os outros sumiram também): só reivindica sozinho depois disto, com a sinalização no ar. */
const LONE_CLAIM_MS = 60_000;
/** Todos os outros jogadores sumiram dentro disto: quem caiu provavelmente fui eu. */
const ISOLATION_SPREAD_MS = 5000;
/** Reivindicação vetada: a próxima espera (dobrando a cada veto). */
const CLAIM_BACKOFF_MS = 5000;
const CLAIM_BACKOFF_MAX_MS = 60_000;
/** Folga da janela do veto além de HOST_VETO_FRESH_MS + 2 × RTT. */
const VETO_SLACK_MS = 500;
/** Anfitrião que fica com a linhagem dele: no máximo um veto tardio por reivindicador neste tempo. */
const LATE_VETO_EVERY_MS = 3000;
/** Sondagem do anfitrião (room:join de membro): sem boas-vindas neste prazo, ele já não hospeda a minha linhagem. */
const HOST_PROBE_MS = 5000;
/** Autoridade montada sem checkpoint mais que isto depois do começo da partida: estava voltando (pode não ter o passado). */
const AUTHORITY_RESUME_MS = 20_000;
/** X1: "Voltar à sala" com o jogo ainda sem registro espera o relatório da autoridade no máximo isto. */
const TO_LOBBY_HOLD_MS = 3000;
/** Teto de times aceitos de uma vez (room:teams/room:welcome/room:state). */
const MAX_TEAMS_IN = 64;
const MAX_GOALS = 99;
const DECISIONS = new Set(["goal-limit", "regulation", "extra-time", "penalties", "walkover"]);
const WALKOVERS = new Set(["abandon", "timeout", "double", "bye"]);

const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value)) as V;
const isCpu = (entrantId: string) => entrantId.startsWith("cpu:");
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);

/** Tamanho da sala pelo formato. */
const CAPACITY: Record<RoomSettings["format"], number> = { x1: 2, t4: 4, t8: 8 };

const REJECT_ERROR: Record<RoomRejectReason, JoinError> = {
  cheia: "cheia", senha: "senha", "senha-errada": "senha-errada", iniciada: "iniciada", removido: "removido",
  time: "time", versao: "versao", "outra-aba": "outra-aba",
};

function presenceOf(health: PeerHealth): RoomMember["presence"] {
  return health === "ok" ? "online" : health === "unstable" ? "unstable" : health === "away" ? "away" : "offline";
}

/** (epoch, version) maior; epoch igual com outro anfitrião: o de menor joinOrder ganha. */
function newer(a: RoomSnapshot, b: RoomSnapshot): boolean {
  if (a.epoch !== b.epoch) return a.epoch > b.epoch;
  if (a.hostId === b.hostId) return a.version > b.version;
  const order = (snap: RoomSnapshot) => snap.members.find((member) => member.playerId === snap.hostId)?.joinOrder ?? Number.MAX_SAFE_INTEGER;
  return order(a) < order(b);
}

function isSnapshot(value: unknown): value is RoomSnapshot {
  const snap = record(value) as Partial<RoomSnapshot> | null;
  return !!snap && snap.v === 1 && typeof snap.code === "string" && Number.isSafeInteger(snap.epoch) && Number.isSafeInteger(snap.version)
    && typeof snap.hostId === "string" && Array.isArray(snap.members) && Array.isArray(snap.banned) && !!snap.settings
    && typeof snap.hostNow === "number" && Number.isFinite(snap.hostNow);
}

const goalCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_GOALS;

/**
 * Resultado que veio pela rede: placar e pênaltis inteiros de 0 a 99, decisão e W.O. conhecidos, e o
 * vencedor coerente com o placar (pênaltis no empate; W.O. decide sozinho).
 */
function isResult(value: unknown): value is BracketResult {
  const result = record(value) as Partial<BracketResult> | null;
  if (!result || typeof result.matchId !== "string" || (result.winner !== "home" && result.winner !== "away")) return false;
  if (!goalCount(result.homeGoals) || !goalCount(result.awayGoals)) return false;
  const homePens = result.homePens ?? null;
  const awayPens = result.awayPens ?? null;
  if ((homePens !== null && !goalCount(homePens)) || (awayPens !== null && !goalCount(awayPens))) return false;
  if (typeof result.decision !== "string" || !DECISIONS.has(result.decision)) return false;
  if (result.walkover !== undefined && (typeof result.walkover !== "string" || !WALKOVERS.has(result.walkover))) return false;
  if (result.decision === "walkover") return result.walkover !== undefined;
  if (result.walkover !== undefined) return false;
  if (result.homeGoals !== result.awayGoals) return (result.homeGoals > result.awayGoals) === (result.winner === "home");
  // Empate: decide nos pênaltis; sem eles (regra quebrada), o mandante leva (bracketResultFrom).
  if (homePens !== null && awayPens !== null && homePens !== awayPens) return (homePens > awayPens) === (result.winner === "home");
  return result.winner === "home";
}

/** Fato guardado por um membro (room:state): partida, lados e um resultado com forma válida. */
function isFact(value: unknown): value is ResultFact {
  const fact = record(value) as Partial<ResultFact> | null;
  return !!fact && typeof fact.bracketId === "string" && Array.isArray(fact.sides) && fact.sides.length === 2
    && fact.sides.every((side) => typeof side === "string") && isResult(fact.result);
}

/** Nome de exibição único na sala ("Fominha" → "Fominha 2"). */
function dedupNickname(nickname: string, members: RoomMember[], self: string): string {
  const taken = new Set(members.filter((member) => member.playerId !== self && !member.left).map((member) => member.nickname.toLocaleLowerCase("pt-BR")));
  if (!taken.has(nickname.toLocaleLowerCase("pt-BR"))) return nickname;
  for (let index = 2; index < 100; index += 1) {
    const suffix = ` ${index}`;
    const base = nickname.slice(0, LIMITS.nickname[1] - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase("pt-BR"))) return candidate;
  }
  return nickname;
}

/** Os ajustes que vêm no room:reject "iniciada" (extensão), conferidos; sem eles, null. */
function rejectSettings(value: unknown): RoomSettings | null {
  const raw = record(value);
  if (!raw || (raw.format !== "x1" && raw.format !== "t4" && raw.format !== "t8") || typeof raw.allowSpectators !== "boolean") return null;
  return {
    format: raw.format,
    rules: raw.rules === "flash" || raw.rules === "marathon" ? raw.rules : "classic",
    cpuLevel: raw.cpuLevel === 2 || raw.cpuLevel === 4 ? raw.cpuLevel : 3,
    fillWithCpu: raw.fillWithCpu === true,
    allowSpectators: raw.allowSpectators,
    locked: raw.locked === true,
  };
}

/**
 * Snapshot só de vitrine para quem foi recusado com "iniciada": leva os ajustes da sala e mais nada
 * (época -1: qualquer snapshot de verdade é mais novo). O cliente já está em "error" e nunca o usa.
 */
function previewSnapshot(code: string, hostId: string, settings: RoomSettings): RoomSnapshot {
  return {
    v: 1, code, epoch: -1, version: 0, hostId, hostNow: 0, seed: 0, settings, passwordProof: null,
    members: [], nextJoinOrder: 0, banned: [], stage: "running", bracket: null, series: null, rematch: null, createdAt: 0,
  };
}

/** Por que esta entrada nova não cabe na sala agora (null: cabe). Membro voltando não passa por aqui. */
function admissionError(snapshot: RoomSnapshot, spectator: boolean, body: JoinBody, team: BobTeam | null): RoomRejectReason | null {
  if (spectator) {
    if (!snapshot.settings.allowSpectators) return "iniciada";
    const watching = snapshot.members.filter((member) => member.role === "spectator" && !member.left).length;
    if (watching >= MAX_SPECTATOR_MEMBERS) return "cheia";
  } else {
    if (snapshot.stage !== "lobby") return "iniciada";
    const players = snapshot.members.filter((member) => member.role === "player" && !member.left).length;
    if (players >= CAPACITY[snapshot.settings.format]) return "cheia";
  }
  if (snapshot.passwordProof) {
    if (!body.passwordProof) return "senha";
    if (body.passwordProof !== snapshot.passwordProof) return "senha-errada";
  }
  return team ? null : "time";
}

/** O time limpo (ou o que veio, se a limpeza não mexeu em nada que conte) tem o hash anunciado. */
function teamMatchesHash(team: BobTeam, raw: unknown, hash: string): boolean {
  if (teamHash(team) === hash) return true;
  try {
    return teamHash(raw as BobTeam) === hash;
  } catch {
    return false;
  }
}

/** Resultado de W.O. (3×0 para quem venceu). */
function walkoverResult(matchId: string, winner: "home" | "away", kind: WalkoverKind, reportedBy: string, at: number): BracketResult {
  const base = {
    matchId,
    winner,
    homeGoals: winner === "home" ? DOUBLE_STAKE : 0,
    awayGoals: winner === "away" ? DOUBLE_STAKE : 0,
    homePens: null,
    awayPens: null,
    decision: "walkover" as const,
    walkover: kind,
  };
  return { ...base, resultHash: bracketResultHash(base), reportedBy, at };
}

export class BobRoomClient implements BobRoomClientApi {
  // =========================================================================
  // Fábricas (§3.7)
  // =========================================================================

  // As três devolvem o cliente assim que ele existe (fase "connecting"): identidade, net.json e
  // conexão andam depois, e progresso e erros chegam pelo estado (nunca rejeitam).

  static async create(args: CreateArgs, deps: RoomDeps = {}): Promise<BobRoomClient> {
    return BobRoomClient.open("create", args, deps);
  }

  static async join(args: JoinArgs, deps: RoomDeps = {}): Promise<BobRoomClient> {
    return BobRoomClient.open("join", args, deps);
  }

  static async resume(saved: SavedSession, args: ResumeArgs, deps: RoomDeps = {}): Promise<BobRoomClient> {
    return BobRoomClient.open("resume", { ...args, code: saved.code, password: saved.password, saved }, deps);
  }

  private static open(mode: Mode, args: Partial<CreateArgs & JoinArgs & ResumeArgs> & { saved?: SavedSession }, deps: RoomDeps): BobRoomClient {
    const client = new BobRoomClient(mode, args, deps);
    client.booting = client.boot();
    return client;
  }

  // =========================================================================
  // Estado
  // =========================================================================

  private readonly mode: Mode;
  private readonly deps: RoomDeps;
  private readonly transportFactory: TransportFactory | null;
  private readonly password: string | null;
  private readonly asSpectator: boolean;
  private readonly createSettings: RoomSettings | null;
  private readonly saved: SavedSession | null;
  private team: BobTeam;
  private nickname: string;
  private code: string;
  private identity: Identity | null = null;
  private me = "";
  private session: BobSession | null = null;
  private clock: NetClock = realClock;
  private readonly wallNow: () => number;
  private readonly roomStore: RoomStore;
  private readonly checkpoints: CheckpointStore;
  private netConfig: NetConfig = DEFAULT_NET_CONFIG;
  private proof: string | null = null;
  private lifecycle: BobLifecycle | null = null;
  private readonly graceS: number;

  private phase: RoomClientState["phase"] = "connecting";
  private joinStage: 0 | 1 | 2 = 0;
  private error: JoinError | null = null;
  private incompatible: RoomClientState["incompatible"] = null;
  private snapshot: RoomSnapshot | null = null;
  private snapshotAt = 0;
  private teams: RoomTeams = {};
  private facts: ResultFact[] = [];
  private readonly health: Record<string, PeerHealth> = {};
  private live: RoomClientState["live"] = {};
  private toasts: Toast[] = [];
  private toastSeq = 0;
  private duel: DuelLike | null = null;
  private duelHandle: DuelHandle | null = null;
  /** Relógio até quando a partida que já acabou na chave continua viva aqui (null: não está nessa espera). */
  private lingerUntil: number | null = null;
  /** Partidas que este aparelho perdeu por não voltar a tempo: nunca relata outro resultado delas. */
  private readonly lostLocally = new Set<string>();
  private readonly buffers = new Map<string, Array<{ from: string; kind: string; body: unknown; at: number }>>();

  private startedAt = 0;
  private everSignaled = false;
  private joinErrorAt: number | null = null;
  private hidden = false;
  private tickHandle: unknown = null;
  private lastClaimAt = Number.NEGATIVE_INFINITY;
  private lastPresenceAt = Number.NEGATIVE_INFINITY;
  private disposed = false;

  // Membro: relatórios ainda não vistos no snapshot, linhagem, reivindicação.
  private readonly pendingReports = new Map<string, ReportBody>();
  private readonly pendingWo = new Map<string, RoomBodies["match:wo"]>();
  /** Concessões (não voltei a tempo) ainda não vistas no snapshot. */
  private readonly pendingForfeit = new Map<string, ForfeitBody>();
  /** Fatos (factKey) ainda não confirmados nesta linhagem e quando foram mandados por último. */
  private readonly replayQueue = new Map<string, number>();
  private flushingReplay = false;
  private lastResendAt = Number.NEGATIVE_INFINITY;
  /** Saí da tela de resultado antes de o resultado chegar ao snapshot: solto o duelo quando chegar. */
  private clearOnDone: { bracketId: string; matchId: string } | null = null;
  private lineage: string | null = null;
  private hostAwaySince: number | null = null;
  /** `at`: relógio deste aparelho quando reivindiquei (a janela do veto conta daí). */
  private myClaim: { epoch: number; before: RoomSnapshot; at: number } | null = null;
  /** Reivindiquei: o room:snap da época nova só sai depois da janela do veto (quem veta nunca fica preso nela). */
  private claimHoldUntil: number | null = null;
  private claimToast: string | null = null;
  private claimBackoffMs = 0;
  private beforeClaim: { claimant: string; snapshot: RoomSnapshot } | null = null;
  /** Procurando a sala: recusa (ou versão diferente) que só vale se nenhuma boas-vindas chegar a tempo. */
  private pendingReject: { reason: RoomRejectReason; settings: RoomSettings | null; from: string; at: number } | null = null;
  private pendingVersion: number | null = null;
  /** O anfitrião que veio no link (só ao entrar): procurando, a resposta de outro par espera LINK_HOST_WAIT_MS. */
  private readonly linkHost: string | null;
  private deferredAnswers: Array<{ from: string; kind: "room:welcome" | "room:reject"; data: Record<string, unknown> | null }> = [];
  private resumeUntil: number | null = null;
  /** Já ouvi o anfitrião (welcome/snap) desde que esta página abriu. */
  private confirmed = false;
  /**
   * Membro: room:join {resume} mandado ao meu anfitrião (volta de uma queda, ou linhagem mais nova aos
   * saltos com ele ainda ouvido). Sem as boas-vindas dele em HOST_PROBE_MS, ele já não hospeda a minha
   * linhagem: a mais nova vale, e `newer` (quem a mandou) recebe o meu room:join.
   */
  private hostProbe: { hostId: string; at: number; newer: string | null; answered: boolean } | null = null;
  /** Relógio de quando cada par ficou "lost" por último. */
  private readonly lostAt = new Map<string, number>();
  /** Desde quando ouço cada par sem parar (ok, instável ou em segundo plano); some quando ele fica "lost". */
  private readonly heardSince = new Map<string, number>();
  /** Desde quando esta página está visível (sem nunca ter ido para segundo plano). */
  private visibleSince = Number.NEGATIVE_INFINITY;
  /** A sessão salva e a sala guardada são desta sala (voltando para ela, ou já gravadas por este cliente). */
  private ownsSaved = false;

  // Anfitrião: o que não vai no snapshot.
  private readonly teamsSent = new Map<string, Set<string>>();
  private readonly hostPools = new Map<string, { left: number; at: number }>();
  private readonly lastOk = new Map<string, number>();
  /**
   * O `n` do hb.m da autoridade: `since` desde quando está parado; `ownedSince` desde quando está parado
   * com a vez aberta e sendo DELA (null: a vez é do seguidor ou não está aberta); `unrestedSince` desde
   * quando está parado sem chegar ao descanso n (motor travado no meio da jogada). Os dois últimos só
   * contam com a autoridade presente (em segundo plano a reserva dela é que corre).
   */
  private readonly authorityN = new Map<string, { n: number; since: number; ownedSince: number | null; unrestedSince: number | null }>();
  /** Reivindicador → quando vetei por último a linhagem dele (anfitrião que fica com a dele). */
  private readonly lateVetoAt = new Map<string, number>();
  /** X1: "Voltar à sala" pedido com o jogo ainda sem registro (relógio do pedido). */
  private toLobbyAt: number | null = null;
  private readonly bothAbsentSince = new Map<string, number>();
  private readonly followerReports = new Map<string, { result: BracketResult; from: string }>();
  private readonly authorityAbsentSince = new Map<string, number>();
  /** Concessão recebida e segurada WO_EVIDENCE_MS: se o outro lado também conceder, vira moeda. */
  private readonly concessions = new Map<string, { player: string; at: number }>();
  /** W.O. duplo relatado por um lado (o seguidor): vale com a prova do anfitrião ou do outro lado. */
  private readonly doubleReports = new Map<string, Set<string>>();
  /** match:free que chegou antes do resultado da partida (bracketId da partida → jogadores). */
  private readonly pendingFree = new Map<string, Set<string>>();
  /** Espectador admitido (relógio): quem nunca deu sinal também sai. */
  private readonly spectatorSince = new Map<string, number>();
  private readonly simulating = new Set<string>();
  private liveCpuAt = Number.NEGATIVE_INFINITY;

  private readonly listeners = new Set<() => void>();
  private stateValue: RoomClientState | null = null;

  private constructor(mode: Mode, args: Partial<CreateArgs & JoinArgs & ResumeArgs> & { saved?: SavedSession }, deps: RoomDeps) {
    this.mode = mode;
    this.deps = deps;
    this.transportFactory = args.transportFactory ?? null;
    this.team = args.team as BobTeam;
    this.nickname = sanitizeNickname(args.nickname, deps.seed ?? 1);
    this.password = args.password ? String(args.password) : null;
    this.asSpectator = args.asSpectator === true;
    this.createSettings = args.settings ?? null;
    this.saved = args.saved ?? null;
    this.code = mode === "create" ? deps.code ?? "" : String(args.code ?? "").toUpperCase();
    this.linkHost = mode === "join" && isPlayerIdLike(args.hostId) ? args.hostId : null;
    this.wallNow = deps.wallNow ?? (() => Date.now());
    this.roomStore = deps.roomStore ?? localRoomStore();
    this.checkpoints = deps.checkpoints ?? localCheckpointStore({ now: this.wallNow });
    this.graceS = deps.graceS ?? devGrace() ?? T.GRACE_POOL_S;
    this.ownsSaved = mode === "resume";
  }

  /** A abertura (identidade, net.json, sessão) terminou ou desistiu. Só testes e ferramentas esperam por isso. */
  whenBooted(): Promise<void> {
    return this.booting;
  }

  private booting: Promise<void> = Promise.resolve();

  /**
   * Abre a sessão. Erros viram `phase: "error"` (a tela mostra e oferece de novo). Quem fechar o
   * cliente no meio (Cancelar) para a abertura no próximo passo: nenhuma conexão sobra aberta.
   */
  private async boot(): Promise<void> {
    if (!this.deps.identity && !cryptoAvailable()) {
      this.fail("cripto");
      return;
    }
    if (this.mode !== "create" && !isValidRoomCode(this.code)) {
      this.fail("nao-encontrada");
      return;
    }
    try {
      this.identity = this.deps.identity ?? (await loadIdentity());
      if (this.disposed) return;
      this.me = this.identity.playerId;
      this.netConfig = this.deps.netConfig ?? (await loadNetConfig());
      if (this.disposed) return;
      if (this.mode === "create") this.code ||= makeRoomCode();
      if (this.password) this.proof = await passwordProof(this.password, this.code);
      if (this.disposed) return;
      const transport = (this.transportFactory ?? defaultTransportFactory())(this.netConfig);
      this.clock = transport.clock ?? realClock;
      const session = new BobSession({ identity: this.identity, transport, hello: this.deps.hello ?? localHelloInfo(), incarnation: this.deps.incarnation, now: this.wallNow });
      this.session = session;
      this.wire(session);
      this.startedAt = this.clock.now();
      if (this.mode === "create") this.openAsHost();
      else if (this.mode === "resume") this.openResumed();
      session.connect(this.code);
      this.startLifecycle();
      this.scheduleTick();
    } catch (error) {
      console.error("[bobonline] sala", error);
      this.fail(this.mode === "create" ? "abrir" : "sem-rede");
    }
    this.changed();
  }

  // =========================================================================
  // API (§3.7)
  // =========================================================================

  getState(): RoomClientState {
    if (this.stateValue) return this.stateValue;
    const snapshot = this.snapshot;
    const state: RoomClientState = {
      phase: this.phase,
      joinStage: this.joinStage,
      error: this.error,
      incompatible: this.incompatible,
      snapshot,
      teams: this.teams,
      me: this.me,
      isHost: this.isHost(),
      health: { ...this.health },
      live: this.live,
      duel: this.duelHandle,
      nextMatch: this.nextMatch(),
      rematch: this.rematchState(),
      toasts: this.toasts,
    };
    this.stateValue = state;
    return state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Relógio do anfitrião → relógio deste aparelho (offset do heartbeat; sem ele, a chegada do snapshot). */
  toLocal(hostTime: number): number {
    const snapshot = this.snapshot;
    if (!snapshot || snapshot.hostId === this.me) return hostTime;
    const offset = this.session?.clockOffset(snapshot.hostId) ?? null;
    if (offset !== null && Number.isFinite(offset)) return hostTime + offset;
    return hostTime + (this.snapshotAt - snapshot.hostNow);
  }

  setReady(ready: boolean): void {
    if (this.isHost()) return; // o anfitrião está sempre pronto
    this.sendHost("room:update", { ready });
  }

  setTeam(team: BobTeam): void {
    const clean = sanitizeTeam(team);
    if (!clean) return;
    this.team = clean;
    if (this.snapshot?.stage !== "lobby") return;
    if (this.isHost()) this.hostUpdate(this.me, { team: clean });
    else this.sendHost("room:update", { team: clean });
  }

  setNickname(nickname: string): void {
    this.nickname = sanitizeNickname(nickname, 1);
    if (this.snapshot?.stage !== "lobby") return;
    if (this.isHost()) this.hostUpdate(this.me, { nickname: this.nickname });
    else this.sendHost("room:update", { nickname: this.nickname });
  }

  hostSetSettings(patch: Partial<Pick<RoomSettings, "rules" | "cpuLevel" | "fillWithCpu" | "allowSpectators">>): void {
    if (!this.isHost() || this.snapshot?.stage !== "lobby") return;
    this.change((draft) => {
      if (patch.rules === "flash" || patch.rules === "classic" || patch.rules === "marathon") draft.settings.rules = patch.rules;
      if (patch.cpuLevel === 2 || patch.cpuLevel === 3 || patch.cpuLevel === 4) draft.settings.cpuLevel = patch.cpuLevel;
      if (typeof patch.fillWithCpu === "boolean") draft.settings.fillWithCpu = patch.fillWithCpu;
      if (typeof patch.allowSpectators === "boolean") draft.settings.allowSpectators = patch.allowSpectators;
    });
  }

  hostKick(playerId: string): void {
    const snapshot = this.snapshot;
    if (!this.isHost() || !snapshot || playerId === this.me) return;
    const member = snapshot.members.find((entry) => entry.playerId === playerId);
    if (!member) return;
    if (snapshot.stage === "running" && member.role === "player" && !member.left) {
      // Tirar um jogador do torneio = abandono dele (as partidas viram W.O.).
      this.hostAbandon(playerId);
    }
    this.change((draft) => {
      draft.banned = [...new Set([...draft.banned, playerId])];
      const target = draft.members.find((entry) => entry.playerId === playerId);
      if (!target) return;
      if (draft.stage === "lobby" || target.role === "spectator") draft.members = draft.members.filter((entry) => entry.playerId !== playerId);
      else {
        target.left = true;
        target.kicked = true;
        target.presence = "offline";
      }
    });
    // O aviso "{apelido} saiu" sai uma vez só, da diferença de membros (diffMembers).
    this.session?.send(playerId, "room:kick", {});
  }

  hostStart(): { ok: true } | { ok: false; reason: "faltam-jogadores" | "nao-prontos" } {
    const snapshot = this.snapshot;
    if (!this.isHost() || !snapshot || snapshot.stage !== "lobby") return { ok: false, reason: "faltam-jogadores" };
    const players = snapshot.members.filter((member) => member.role === "player" && !member.left);
    const format = snapshot.settings.format;
    if (format === "x1" ? players.length !== 2 : players.length < 2) return { ok: false, reason: "faltam-jogadores" };
    if (players.some((member) => member.playerId !== this.me && !member.ready)) return { ok: false, reason: "nao-prontos" };
    const now = this.wallNow();
    this.change((draft) => {
      const humans: BracketEntrant[] = players
        .slice()
        .sort((a, b) => a.joinOrder - b.joinOrder)
        .map((member) => ({ id: member.playerId, kind: "human" as const, teamHash: member.teamHash }));
      const entrants = humans.slice();
      if (format !== "x1" && draft.settings.fillWithCpu) {
        const taken = new Set(humans.flatMap((entrant) => {
          const short = this.teams[entrant.teamHash]?.shortName;
          return short ? [short.toLocaleLowerCase("pt-BR")] : [];
        }));
        for (let slot = 0; entrants.length < CAPACITY[format]; slot += 1) {
          const team = cpuTeamFor(draft.seed, slot, taken);
          taken.add(team.shortName.toLocaleLowerCase("pt-BR"));
          const hash = teamHash(team);
          this.teams = { ...this.teams, [hash]: team };
          entrants.push({ id: `cpu:${slot}`, kind: "cpu", teamHash: hash });
        }
      }
      const joinOrderOf = (id: string) => draft.members.find((member) => member.playerId === id)?.joinOrder ?? 1000 + Number(id.split(":")[1] ?? 0);
      let bracket = createBracket({ format, entrants, seed: draft.seed, now, joinOrderOf });
      if (format === "x1") bracket = this.orientSeriesGame(bracket, draft);
      bracket = {
        ...bracket,
        matches: bracket.matches.map((match) => (match.round === 1 && match.status === "waiting" && match.home && match.away
          ? { ...match, status: "playing" as const, startedAt: now }
          : match)),
      };
      draft.bracket = bracket;
      draft.stage = "running";
      draft.rematch = null;
      if (format === "x1" && !draft.series) draft.series = { home: 0, away: 0 };
    });
    this.hostAdvance();
    return { ok: true };
  }

  hostNewTournament(): void {
    if (!this.isHost() || this.snapshot?.stage === "lobby") return;
    const seed = this.deps.seed !== undefined ? hashSeed(this.deps.seed, this.snapshot?.version ?? 0) : newSeed();
    this.change((draft) => {
      draft.stage = "lobby";
      draft.bracket = null;
      draft.rematch = null;
      draft.series = null;
      draft.seed = seed;
      for (const member of draft.members) if (member.playerId !== this.me) member.ready = false;
    });
    // Os times da CPU do torneio anterior saem da memória (o próximo sorteia os dele no começo).
    const snapshot = this.snapshot;
    if (snapshot) this.teams = Object.fromEntries(this.referencedHashes(snapshot).map((hash) => [hash, this.teams[hash]]));
    this.clearDuel();
  }

  readyForMatch(bracketId: string): void {
    if (this.isHost()) this.hostReady(this.me, bracketId);
    else this.sendHost("match:ready", { bracketId });
  }

  leftResultScreen(bracketId: string): void {
    if (this.isHost()) this.hostFree(this.me, bracketId);
    else this.sendHost("match:free", { bracketId });
    const handle = this.duelHandle;
    if (!handle || handle.bracketId !== bracketId || handle.role === "spectator") return;
    // O resultado ainda não está no snapshot (fim local antes do relatório): a partida segue viva
    // (o relatório do seguidor é o reserva) e sai quando a chave fechar.
    const match = this.snapshot?.bracket ? matchById(this.snapshot.bracket, bracketId) : null;
    if (match && match.status !== "done" && this.matchIdOf(match) === handle.matchId) {
      this.clearOnDone = { bracketId, matchId: handle.matchId };
      return;
    }
    this.clearDuel();
  }

  forfeit(bracketId: string): void {
    const snapshot = this.snapshot;
    const match = snapshot?.bracket ? matchById(snapshot.bracket, bracketId) : null;
    if (!match || match.status === "done") return;
    const matchId = this.matchIdOf(match);
    const opponent = match.home?.entrantId === this.me ? match.away?.entrantId : match.home?.entrantId;
    const body = { bracketId, matchId };
    // A partida para aqui antes de o W.O. fechar a chave (que descarta o controlador).
    if (this.duel && this.duel.bracketId === bracketId) this.duel.stop();
    if (opponent && !isCpu(opponent)) this.session?.send(opponent, "match:forfeit", body);
    if (this.isHost()) this.hostForfeit(this.me, body);
    else this.sendHost("match:forfeit", body);
  }

  wantRematch(want: boolean): void {
    if (this.isHost()) this.hostRematch(this.me, want);
    else this.sendHost("rematch", { want });
  }

  backToLobby(): void {
    if (this.isHost()) this.hostToLobby();
    else this.sendHost("room:to-lobby", {});
    // Jogo largado sem registro: não volta a montar enquanto a sala não vira lobby, e o checkpoint dele
    // nunca mais serve (o próximo jogo tem outro id).
    const duel = this.duel;
    const match = duel && this.snapshot?.bracket ? matchById(this.snapshot.bracket, duel.bracketId) : null;
    if (duel && duel.role !== "spectator" && match && match.status !== "done") {
      this.leftToLobby = duel.matchId;
      this.checkpoints.clear(duel.matchId);
    }
    this.clearDuel();
  }

  /** X1: partida que este aparelho largou com "Voltar à sala" antes do registro (não remonta até o lobby). */
  private leftToLobby: string | null = null;

  spectate(bracketId: string): void {
    const snapshot = this.snapshot;
    const match = snapshot?.bracket ? matchById(snapshot.bracket, bracketId) : null;
    if (!match || match.status !== "playing" || !match.authority || match.authority === this.me) return;
    if (match.home?.entrantId === this.me || match.away?.entrantId === this.me) return;
    this.launchDuel(match, "spectator", null);
  }

  stopSpectating(): void {
    if (this.duelHandle?.role !== "spectator") return;
    this.clearDuel();
  }

  dismissToast(id: number): void {
    const next = this.toasts.filter((toast) => toast.id !== id);
    if (next.length === this.toasts.length) return;
    this.toasts = next;
    this.changed();
  }

  /** Sai de verdade: room:leave, W.O. nas próximas, sessão e sala apagadas. */
  async leave(): Promise<void> {
    if (this.disposed) return;
    const snapshot = this.snapshot;
    const session = this.session;
    let linger: string[] = [];
    if (snapshot && session && this.phase === "in-room") {
      if (snapshot.stage === "running") {
        const mine = snapshot.bracket?.matches.find((match) => match.status !== "done" && (match.home?.entrantId === this.me || match.away?.entrantId === this.me) && match.status === "playing");
        if (mine) this.forfeit(mine.id);
      }
      if (this.isHost()) {
        this.change((draft) => {
          const self = draft.members.find((member) => member.playerId === this.me);
          if (self) {
            self.left = true;
            self.presence = "offline";
          }
        });
        linger = snapshot.members.filter((member) => member.playerId !== this.me && !member.left).map((member) => member.playerId);
      } else {
        this.sendHost("room:leave", {});
        linger = [snapshot.hostId];
      }
    }
    this.forgetRoom();
    if (this.duel) this.checkpoints.clear(this.duel.matchId);
    await this.shutdown("left", linger);
  }

  /** Fecha a conexão SEM room:leave e sem apagar a sessão salva (aba que perdeu a trava; "Cancelar"). */
  async close(): Promise<void> {
    this.duel?.flushCheckpoint();
    this.persist();
    await this.shutdown("left");
  }

  /**
   * Dev (E2E §11.3 #6): o mesmo caminho do pause/resume do Capacitor por `ms` (hb com vis "bg",
   * partida congelada). Só com perfil de teste (ou nos testes, que passam `deps.lifecycle`).
   */
  simulateBackground(ms: number): void {
    if (this.disposed || (devProfile() === null && this.deps.lifecycle === undefined)) return;
    const lifecycle = this.lifecycle;
    if (lifecycle) {
      lifecycle.handle("pause");
      this.clock.setTimeout(() => lifecycle.handle("resume"), Math.max(0, ms));
      return;
    }
    // Sem a escada (testes com lifecycle: false): o mesmo efeito na sessão e na partida.
    const session = this.session;
    session?.setVisible(false);
    this.setVisible(false);
    this.clock.setTimeout(() => {
      if (this.disposed) return;
      session?.setVisible(true);
      this.setVisible(true);
    }, Math.max(0, ms));
  }

  // =========================================================================
  // Abertura
  // =========================================================================

  private openAsHost(): void {
    const now = this.wallNow();
    const settings = this.createSettings as RoomSettings;
    const team = sanitizeTeam(this.team);
    if (!team) {
      this.fail("time");
      return;
    }
    this.team = team;
    const hash = teamHash(team);
    this.teams = { [hash]: team };
    this.snapshot = {
      v: 1,
      code: this.code,
      epoch: 0,
      version: 1,
      hostId: this.me,
      hostNow: now,
      seed: this.deps.seed ?? newSeed(),
      settings: { ...settings, locked: Boolean(this.proof) },
      passwordProof: this.proof,
      members: [{
        playerId: this.me, pub: this.identity?.pub ?? "", nickname: this.nickname, teamHash: hash, joinOrder: 0,
        role: "player", ready: true, presence: "online", left: false,
      }],
      nextJoinOrder: 1,
      banned: [],
      stage: "lobby",
      bracket: null,
      series: null,
      rematch: null,
      createdAt: now,
    };
    this.snapshotAt = now;
    this.lineage = `0|${this.me}`;
    this.confirmed = true;
  }

  private openResumed(): void {
    const stored = this.roomStore.load(this.code);
    if (!stored) return; // sem cópia: entra como convidado que volta (room:join resume)
    this.teams = stored.teams;
    this.facts = stored.facts;
    const snapshot = stored.snapshot;
    this.lineage = `${snapshot.epoch}|${snapshot.hostId}`;
    if (snapshot.hostId === this.me && this.saved?.isHost !== false) {
      // Anfitrião voltando: a própria cópia, mais nova, e escuta os membros por 5 s (§4.7).
      this.snapshot = { ...snapshot, version: snapshot.version + 1, hostNow: this.wallNow() };
      this.resumeUntil = this.clock.now() + HOST_RESUME_WINDOW_MS;
      this.confirmed = true;
    } else {
      this.snapshot = snapshot;
    }
    this.snapshotAt = this.wallNow();
    this.phase = "in-room";
    this.session?.setRoster(this.rosterOf(this.snapshot));
    this.afterSnapshot(null);
  }

  private startLifecycle(): void {
    const enabled = this.deps.lifecycle ?? typeof document !== "undefined";
    const session = this.session;
    if (!enabled || !session) return;
    const proxy = {
      linked: () => session.linked(),
      health: (playerId: string) => session.health(playerId),
      rejoin: () => session.rejoin(),
      setVisible: (visible: boolean) => {
        session.setVisible(visible);
        this.setVisible(visible);
      },
      pauseSignaling: () => session.pauseSignaling(),
      resumeSignaling: () => session.resumeSignaling(),
      signalingUp: () => session.signalingUp(),
    };
    this.lifecycle = new BobLifecycle({
      session: proxy,
      isRunning: () => this.snapshot?.stage === "running",
      beforeReload: () => {
        this.duel?.flushCheckpoint();
        this.persist();
        this.saveSessionNow();
      },
      clock: this.clock,
      ...(this.deps.lifecycle === true && typeof document === "undefined" ? { doc: null, win: null } : {}),
    });
    this.lifecycle.start();
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      const flush = () => {
        this.duel?.flushCheckpoint();
        this.persist();
      };
      window.addEventListener("pagehide", flush);
      this.offPagehide = () => window.removeEventListener("pagehide", flush);
    }
  }

  private offPagehide: (() => void) | null = null;

  private setVisible(visible: boolean): void {
    if (visible && this.hidden) this.visibleSince = this.clock.now();
    this.hidden = !visible;
    this.duel?.setVisible(visible);
  }

  // =========================================================================
  // Sessão
  // =========================================================================

  private wire(session: BobSession): void {
    session.onMessage = (from, kind, body) => {
      try {
        this.onMessage(from, kind, body);
      } catch (error) {
        console.error("[bobonline] mensagem da sala", kind, error);
      }
      // A partida tem o próprio subscribe: m:* e spec:* não redesenham a sala.
      if (!kind.startsWith("m:") && !kind.startsWith("spec:")) this.changed();
    };
    session.onHealth = (playerId, health) => {
      const before = this.health[playerId];
      this.health[playerId] = health;
      if (health === "ok") this.lastOk.set(playerId, this.clock.now());
      this.trackHeard(playerId, health);
      if (playerId === this.snapshot?.hostId) {
        if (health === "away") this.hostAwaySince ??= this.clock.now();
        else this.hostAwaySince = null;
        // Voltei a ouvir o anfitrião depois de uma queda: o que ele publicou nesse meio pode ter se perdido
        // (troca de anfitrião, ou eu fora da lista de espectadores): room:join {resume} traz tudo de novo.
        if (before === "lost" && health !== "lost" && this.phase === "in-room" && !this.isHost()) this.probeHost(null);
      }
      const member = this.snapshot?.members.find((entry) => entry.playerId === playerId);
      if (member && !member.left && health === "lost" && before && before !== "lost" && this.phase === "in-room") {
        this.toast(`${member.nickname} caiu, esperando voltar…`, !this.inMyMatch(playerId));
      }
      this.duel?.healthChanged();
      this.changed();
    };
    session.onLink = (playerId, reason) => {
      this.onLink(playerId, reason);
      this.duel?.linkChanged(playerId);
      this.changed();
    };
    session.onIncompatible = (playerId, theirs) => this.onIncompatible(playerId, theirs);
    session.onSignaling = (up) => {
      if (up) this.everSignaled = true;
    };
    session.onJoinError = (info) => {
      if (this.phase === "connecting" && !this.snapshot) this.joinErrorAt ??= this.clock.now();
      else if (this.isHost() && info.playerId === null && this.snapshot?.stage === "lobby") {
        this.toast("Alguém tentou entrar, mas a conexão entre os aparelhos não fechou.", true);
      }
      this.duel?.noteJoinError(info.playerId);
      this.changed();
    };
    session.onSuperseded = () => {
      void this.shutdown("superseded");
    };
  }

  private onLink(playerId: string, reason: "new" | "reconnected" | "restarted" | "overflow"): void {
    if (reason !== "reconnected") this.teamsSent.delete(playerId);
    const snapshot = this.snapshot;
    if (this.isHost() && snapshot) {
      if (this.resumeUntil !== null) this.session?.send(playerId, "room:state-req", {});
      if (this.claimHoldUntil === null && snapshot.members.some((member) => member.playerId === playerId && !member.left)) this.sendSnapTo(playerId);
      return;
    }
    // Procurando a sala (ou voltando como membro): pede entrada a quem aparecer; só o anfitrião responde.
    if (this.phase === "connecting" || (snapshot && playerId === snapshot.hostId && reason !== "reconnected")) this.sendJoin(playerId);
    // Link religado com o anfitrião: o que ele publicou na queda pode ter se perdido (sondagem com room:join).
    else if (snapshot && playerId === snapshot.hostId && this.phase === "in-room") this.probeHost(null);
  }

  /** `lostAt`/`heardSince` de um par pela saúde que a sessão relata. */
  private trackHeard(playerId: string, health: PeerHealth): void {
    if (health === "lost") {
      if (this.heardSince.has(playerId) || !this.lostAt.has(playerId)) this.lostAt.set(playerId, this.clock.now());
      this.heardSince.delete(playerId);
    } else if (!this.heardSince.has(playerId)) this.heardSince.set(playerId, this.clock.now());
  }

  /**
   * Membro: room:join {resume} ao meu anfitrião (hostJoin readmite e manda as boas-vindas). Sem resposta
   * em HOST_PROBE_MS, ele já não hospeda a minha linhagem (lineageOk aceita a mais nova, e `newer` recebe
   * o meu room:join para mandá-la de novo).
   */
  private probeHost(newer: string | null): void {
    const snapshot = this.snapshot;
    if (!snapshot || this.isHost() || snapshot.hostId === this.me) return;
    const now = this.clock.now();
    const probe = this.hostProbe;
    if (probe && probe.hostId === snapshot.hostId && now - probe.at < HOST_PROBE_MS * 2) {
      if (!probe.answered) probe.newer ??= newer;
      return;
    }
    this.hostProbe = { hostId: snapshot.hostId, at: now, newer, answered: false };
    this.sendJoin(snapshot.hostId);
  }

  /** A sondagem do meu anfitrião passou do prazo sem resposta. */
  private probeExpired(hostId: string): boolean {
    const probe = this.hostProbe;
    return !!probe && probe.hostId === hostId && !probe.answered && this.clock.now() - probe.at >= HOST_PROBE_MS;
  }

  /** O anfitrião da minha linhagem respondeu ao room:join com as boas-vindas: a sondagem dele está respondida. */
  private hostAnswered(from: string): void {
    if (this.hostProbe && this.hostProbe.hostId === from) {
      this.hostProbe.answered = true;
      this.hostProbe.newer = null;
    }
  }

  private onIncompatible(playerId: string | null, theirs: HelloInfo): void {
    const mine = this.deps.hello ?? localHelloInfo();
    const outdated = theirs.proto > mine.proto || theirs.engine > mine.engine || theirs.celebrations > mine.celebrations;
    const nickname = playerId ? this.snapshot?.members.find((member) => member.playerId === playerId)?.nickname ?? null : null;
    if (this.phase === "connecting") {
      // Qualquer um na sala do Trystero pode mandar um hello de outra versão: o erro só vale se as
      // boas-vindas de um anfitrião compatível não chegarem logo (connectingTick).
      this.incompatible = { mine, theirs, who: outdated ? "me" : "them", nickname };
      this.pendingVersion ??= this.clock.now();
    }
    this.changed();
  }

  private sendJoin(to: string): void {
    const body: JoinBody = {
      nickname: this.nickname,
      team: this.team,
      ...(this.proof ? { passwordProof: this.proof } : {}),
      ...(this.asSpectator ? { asSpectator: true } : {}),
      ...(this.mode === "resume" || this.snapshot ? { resume: true } : {}),
      ...(this.identity ? { pub: this.identity.pub } : {}),
    };
    this.session?.send(to, "room:join", body);
  }

  private sendHost<K extends keyof RoomBodies>(kind: K, body: RoomBodies[K]): void {
    const host = this.snapshot?.hostId;
    if (!host || host === this.me) return;
    this.session?.send(host, kind, body);
  }

  // =========================================================================
  // Mensagens
  // =========================================================================

  private onMessage(from: string, kind: string, body: unknown): void {
    if (this.disposed) return;
    if (kind.startsWith("m:") || kind.startsWith("spec:")) {
      this.routeMatch(from, kind, body);
      return;
    }
    const data = record(body);
    switch (kind) {
      case "live":
        if (data) this.onLive(from, data);
        return;
      case "room:welcome":
        this.onWelcome(from, data);
        return;
      case "room:reject":
        this.onReject(from, data);
        return;
      case "room:snap":
        if (data && isSnapshot(data.snapshot) && from === data.snapshot.hostId) this.onSnap(from, data.snapshot);
        return;
      case "room:teams":
        // Do anfitrião (substitui) ou de um jogador da sala (só o que falta); cada time confere com o hash.
        if (data && record(data.teams) && this.snapshot && (from === this.snapshot.hostId || this.isPlayerMember(this.snapshot, from))) {
          this.acceptTeams(data.teams as RoomTeams, from === this.snapshot.hostId);
        }
        return;
      case "room:kick":
        if (from === this.snapshot?.hostId) this.removed();
        return;
      case "room:state-req":
        if (this.snapshot && this.snapshot.members.some((member) => member.playerId === from)) {
          this.session?.send(from, "room:state", { snapshot: this.snapshot, teams: this.teams, facts: this.facts });
        }
        return;
      case "room:state":
        if (data && isSnapshot(data.snapshot)) this.onStateReply(from, data.snapshot, (record(data.teams) as RoomTeams) ?? {}, Array.isArray(data.facts) ? (data.facts as ResultFact[]) : []);
        return;
      case "host:claim":
        if (data && isSnapshot(data.snapshot)) this.onClaim(from, data.snapshot, data.why === "away" ? "away" : "lost");
        return;
      case "host:veto":
        if (data) this.onVeto(from, data);
        return;
      case "match:forfeit":
        if (this.duel && data?.matchId === this.duel.matchId) this.duel.receive(from, kind, body);
        if (this.isHost() && data && typeof data.bracketId === "string" && typeof data.matchId === "string") {
          const forfeit = data as unknown as ForfeitBody;
          if (forfeit.reason === "timeout") this.hostConcede(from, forfeit);
          else this.hostForfeit(from, forfeit);
        }
        return;
      case "match:wo-no":
        if (data && from === this.snapshot?.hostId && typeof data.bracketId === "string" && typeof data.matchId === "string") {
          this.onWoRejected(data.bracketId, data.matchId);
        }
        return;
    }
    if (!this.isHost() || !data) return;
    switch (kind) {
      case "room:join":
        void this.hostJoin(from, data as unknown as JoinBody);
        return;
      case "room:update":
        this.hostUpdate(from, data as RoomBodies["room:update"]);
        return;
      case "room:leave":
        this.hostLeave(from);
        return;
      case "room:to-lobby":
        if (this.isMatchPlayer(from)) this.hostToLobby();
        return;
      case "match:ready":
        if (typeof data.bracketId === "string") this.hostReady(from, data.bracketId);
        return;
      case "match:free":
        if (typeof data.bracketId === "string") this.hostFree(from, data.bracketId);
        return;
      case "match:report":
        this.hostReport(from, data as unknown as ReportBody);
        return;
      case "match:wo":
        this.hostWalkover(from, data as unknown as RoomBodies["match:wo"]);
        return;
      case "rematch":
        if (typeof data.want === "boolean") this.hostRematch(from, data.want);
        return;
    }
  }

  private onWelcome(from: string, data: Record<string, unknown> | null): void {
    if (!data || !isSnapshot(data.snapshot) || data.snapshot.hostId !== from || data.snapshot.code !== this.code) return;
    if (this.holdForLinkHost(from, "room:welcome", data)) return;
    // Já na sala, as boas-vindas só valem do anfitrião atual (readmissão) ou de uma linhagem que eu aceitaria.
    const current = this.snapshot;
    if (current && this.phase === "in-room" && from !== current.hostId && !this.lineageOk(from, data.snapshot, current)) {
      this.noteNewerLineage(from, data.snapshot, current);
      return;
    }
    if (current && from === current.hostId) this.hostAnswered(from);
    if (record(data.teams)) this.acceptTeams(data.teams as RoomTeams, true, data.snapshot);
    this.confirmed = true;
    this.pendingReject = null;
    this.pendingVersion = null;
    this.deferredAnswers = [];
    this.adopt(data.snapshot, true);
    if (this.phase === "connecting" || this.phase === "in-room") {
      this.phase = "in-room";
      this.error = null;
      this.incompatible = null;
      this.saveSessionNow();
    }
  }

  private onReject(from: string, data: Record<string, unknown> | null): void {
    const reason = data?.reason as RoomRejectReason | undefined;
    if (!reason || !(reason in REJECT_ERROR)) return;
    // Já na sala, só "removido" do anfitrião vale (o resto é resposta velha de uma busca), ou a recusa
    // ao room:join de volta de um espectador que saiu da lista (2 min sem sinal) e não cabe mais.
    if (this.phase === "in-room") {
      if (reason === "removido" && from === this.snapshot?.hostId) this.removed();
      else if (from === this.snapshot?.hostId && this.hostProbe?.hostId === from && this.clock.now() - this.hostProbe.at < HOST_PROBE_MS * 3
        && this.snapshot.members.find((member) => member.playerId === this.me)?.role !== "player") {
        this.fail(REJECT_ERROR[reason]);
        void this.shutdown("error");
      }
      return;
    }
    if (this.phase !== "connecting") return;
    if (this.holdForLinkHost(from, "room:reject", data)) return;
    // Procurando: qualquer um na sala do Trystero pode recusar. A recusa só vale se as boas-vindas não
    // chegarem em REJECT_GRACE_MS (connectingTick); "Já começou" leva os ajustes (X1 × torneio, Assistir).
    this.pendingReject ??={ reason, settings: reason === "iniciada" ? rejectSettings(data?.settings) : null, from, at: this.clock.now() };
  }

  /** Entrando pelo link com o id do anfitrião, ainda dentro de LINK_HOST_WAIT_MS da busca. */
  private waitingLinkHost(now: number): boolean {
    return this.phase === "connecting" && this.linkHost !== null && now - this.startedAt < LINK_HOST_WAIT_MS;
  }

  /**
   * Procurando pelo link com o id do anfitrião: as boas-vindas ou a recusa de outro par (um intruso com o
   * código, ou um anfitrião novo depois de uma troca) esperam; o connectingTick as passa adiante se ele não
   * responder em LINK_HOST_WAIT_MS. `from` é o playerId do hello verificado.
   */
  private holdForLinkHost(from: string, kind: "room:welcome" | "room:reject", data: Record<string, unknown> | null): boolean {
    if (from === this.linkHost || !this.waitingLinkHost(this.clock.now())) return false;
    // Uma por par e tipo (a mais nova): repetir não ocupa as vagas de quem respondeu uma vez só.
    const index = this.deferredAnswers.findIndex((answer) => answer.from === from && answer.kind === kind);
    if (index >= 0) this.deferredAnswers[index] = { from, kind, data };
    else if (this.deferredAnswers.length < DEFERRED_ANSWERS_CAP) this.deferredAnswers.push({ from, kind, data });
    return true;
  }

  /** Passou a espera do anfitrião do link: as respostas guardadas valem, na ordem em que chegaram. */
  private releaseDeferredAnswers(): void {
    const answers = this.deferredAnswers;
    this.deferredAnswers = [];
    for (const answer of answers) {
      if (this.phase !== "connecting") return;
      if (answer.kind === "room:welcome") this.onWelcome(answer.from, answer.data);
      else this.onReject(answer.from, answer.data);
    }
  }

  /** Procurando a sala: a recusa (ou a versão diferente) que esperou as boas-vindas vale agora. */
  private applyPendingReject(now: number): boolean {
    const pending = this.pendingReject;
    if (pending && now - pending.at >= REJECT_GRACE_MS) {
      if (pending.reason === "removido") {
        this.removed();
        return true;
      }
      if (pending.settings && !this.snapshot) this.snapshot = previewSnapshot(this.code, pending.from, pending.settings);
      this.fail(REJECT_ERROR[pending.reason]);
      void this.shutdown("error");
      return true;
    }
    // Versão diferente com o link do anfitrião: qualquer um manda um hello de outra versão, então só depois da espera dele.
    if (this.pendingVersion !== null && now - this.pendingVersion >= REJECT_GRACE_MS && !this.waitingLinkHost(now)) {
      this.fail("versao");
      void this.shutdown("error");
      return true;
    }
    return false;
  }

  /** Removido pelo anfitrião (kick, banido, ou um snapshot que já me lista como banido): a sessão salva sai. */
  private removed(): void {
    if (this.disposed) return;
    this.fail("removido");
    this.forgetRoom();
    void this.shutdown("error");
  }

  /**
   * Times por hash: cada um tem de bater com o próprio hash (ninguém planta um time falso no hash de
   * outro). `replace`: a cópia do anfitrião substitui a que já havia; a dos outros só preenche o que falta.
   */
  private acceptTeams(incoming: RoomTeams, replace: boolean, prefer: RoomSnapshot | null = this.snapshot): void {
    let changed = false;
    const next = { ...this.teams };
    // O teto vale depois dos times que a sala usa (o snapshot que chega junto, ou o atual): nunca são eles que ficam de fora.
    const wanted = prefer ? this.referencedOf(prefer) : new Set<string>();
    const entries = Object.entries(incoming).sort(([a], [b]) => Number(wanted.has(b)) - Number(wanted.has(a)));
    for (const [hash, raw] of entries.slice(0, MAX_TEAMS_IN)) {
      if (next[hash] && !replace) continue;
      const team = sanitizeTeam(raw);
      if (!team || !teamMatchesHash(team, raw, hash)) continue;
      if (next[hash] && teamHash(next[hash]) === teamHash(team)) continue;
      next[hash] = team;
      changed = true;
    }
    if (!changed) return;
    this.teams = next;
    this.persist();
    this.ensureDuel();
  }

  /**
   * "Ao vivo" de uma partida: só de quem a roda (a autoridade; o anfitrião nas CPU × CPU) e só de uma
   * partida que está jogando; o quadro é remontado campo a campo (nunca o objeto que veio).
   */
  private onLive(from: string, data: Record<string, unknown>): void {
    const bracket = this.snapshot?.bracket;
    const match = bracket && typeof data.bracketId === "string" ? matchById(bracket, data.bracketId) : null;
    if (!match || match.status !== "playing" || data.matchId !== this.matchIdOf(match)) return;
    const source = match.kind === "cpu-cpu" ? this.snapshot?.hostId : match.authority;
    if (!source || from !== source) return;
    const score = record(data.score);
    const pens = record(data.pens);
    const count = (value: unknown) => (goalCount(value) ? value : null);
    const home = count(score?.home);
    const away = count(score?.away);
    if (home === null || away === null) return;
    const pensHome = count(pens?.home);
    const pensAway = count(pens?.away);
    const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
    const info: LiveInfo = {
      matchId: this.matchIdOf(match),
      bracketId: match.id,
      score: { home, away },
      pens: pensHome !== null && pensAway !== null ? { home: pensHome, away: pensAway } : null,
      clock: Math.max(0, Math.min(36_000, finite(data.clock, 0))),
      period: Math.max(1, Math.min(9, Math.floor(finite(data.period, 1)))),
      phase: typeof data.phase === "string" ? data.phase.slice(0, 24) : "aim",
      text: typeof data.text === "string" ? data.text.slice(0, 200) : null,
    };
    this.live = { ...this.live, [match.id]: { ...info, receivedAt: this.wallNow() } };
  }

  /** m:* e spec:*: para a partida que roda aqui, ou guardado até ela existir (§5.4). */
  private routeMatch(from: string, kind: string, body: unknown): void {
    const data = record(body);
    const matchId = typeof data?.matchId === "string" ? data.matchId : null;
    if (this.duel && (matchId === null || matchId === this.duel.matchId)) {
      this.duel.receive(from, kind, body);
      return;
    }
    if (!matchId) return;
    const now = this.clock.now();
    const list = (this.buffers.get(matchId) ?? []).filter((entry) => now - entry.at <= T.MATCH_BUFFER_MS);
    list.push({ from, kind, body, at: now });
    this.buffers.set(matchId, list.slice(-64));
    // Um m:setup válido prova que a partida começou: o seguidor não espera o snapshot (§5.4).
    if (kind === "m:setup" && data) this.setupProof(from, data as unknown as MatchBodies["m:setup"]);
  }

  private setupProof(from: string, body: MatchBodies["m:setup"]): void {
    const snapshot = this.snapshot;
    if (!snapshot?.bracket || !body.sides || body.sides.user !== from || body.sides.cpu !== this.me || !body.setup) return;
    const match = matchById(snapshot.bracket, body.bracketId);
    if (!match || match.status === "done" || match.home?.entrantId !== from || match.away?.entrantId !== this.me) return;
    if (body.matchId !== this.matchIdOf(match) && body.matchId !== this.matchIdOf({ id: match.id, replay: match.replay + 1 })) return;
    if (this.duel && this.duel.matchId === body.matchId) return;
    this.launchDuel(match, "follower", { setup: body.setup, matchId: body.matchId, names: body.names });
  }

  // =========================================================================
  // Snapshot
  // =========================================================================

  /** Membro jogador atual (não saiu, não banido) do snapshot. */
  private isPlayerMember(snapshot: RoomSnapshot, playerId: string): boolean {
    return !snapshot.banned.includes(playerId) && snapshot.members.some((member) => member.playerId === playerId && member.role === "player" && !member.left);
  }

  /** Ainda ouço esse anfitrião (direto, ou num hb fresco de alguém). */
  private hostHeard(hostId: string): boolean {
    const session = this.session;
    return !!session && (session.health(hostId) === "ok" || session.heardBy(hostId));
  }

  /**
   * Um snapshot de outra linhagem pode entrar aqui (§4.7)? Só de um jogador da sala que se diz
   * anfitrião dele, na época seguinte (ou na mesma, pelo desempate de reivindicações simultâneas).
   * Saltos maiores (fiquei de fora de mais de uma troca): do meu próprio anfitrião (que reassumiu), sem
   * ele por perto, ou com ele ouvido mas sem responder à sondagem (já não hospeda a minha linhagem).
   */
  private lineageOk(from: string, snapshot: RoomSnapshot, current: RoomSnapshot): boolean {
    if (snapshot.hostId !== from || snapshot.code !== current.code || from === this.me) return false;
    if (!this.isPlayerMember(current, from)) return false;
    if (snapshot.epoch === current.epoch + 1 || snapshot.epoch === current.epoch) return true;
    if (snapshot.epoch > current.epoch + 1) {
      return current.hostId === this.me || from === current.hostId || !this.hostHeard(current.hostId) || this.probeExpired(current.hostId);
    }
    return false;
  }

  /** Linhagem mais nova aos saltos recusada com o meu anfitrião ainda ouvido: sondo se ele ainda hospeda. */
  private noteNewerLineage(from: string, snapshot: RoomSnapshot, current: RoomSnapshot): void {
    if (snapshot.hostId !== from || snapshot.code !== current.code || snapshot.epoch <= current.epoch + 1 || !this.isPlayerMember(current, from)) return;
    this.probeHost(from);
  }

  private sameLineage(a: RoomSnapshot, b: RoomSnapshot): boolean {
    return a.epoch === b.epoch && a.hostId === b.hostId;
  }

  /** room:snap: dentro da linhagem, do anfitrião dela; troca de linhagem só pela regra de lineageOk. */
  private onSnap(from: string, snapshot: RoomSnapshot): void {
    const current = this.snapshot;
    if (!current || this.phase !== "in-room") return; // quem procura a sala só entra pelas boas-vindas
    // (Um room:snap da minha linhagem não responde à sondagem: pode ser um velho que o outbox entregou agora.)
    if (!this.sameLineage(current, snapshot)) {
      if (!this.lineageOk(from, snapshot, current)) {
        this.noteNewerLineage(from, snapshot, current);
        return;
      }
      // Sou o anfitrião vivo e a linhagem nova é de quem reivindicou sem me ouvir: fico com a minha.
      if (snapshot.epoch === current.epoch + 1 && this.keepsLineage(from, snapshot, null)) {
        this.vetoLate(from);
        return;
      }
      // Quem reivindicou pode desfazer (veto do anfitrião de que ele saiu): volto junto (onVeto).
      if (newer(snapshot, current)) this.beforeClaim = { claimant: from, snapshot: current };
    }
    this.confirmed = true;
    this.adopt(snapshot);
  }

  /** Adota um snapshot do anfitrião (§4.7): mais novo vence; linhagem nova recebe os fatos. */
  private adopt(snapshot: RoomSnapshot, force = false, quiet = false): void {
    const current = this.snapshot;
    if (current && !force && !newer(snapshot, current)) return;
    if (current && force && current.code === snapshot.code && newer(current, snapshot)) return;
    // O room:kick se perdeu (ou chegou por outro anfitrião): o snapshot já me lista como banido. Numa
    // linhagem nova, só sem o anfitrião atual por perto (senão é alguém tentando me tirar da sala).
    if (snapshot.banned.includes(this.me) && this.phase === "in-room") {
      if (!current || this.sameLineage(current, snapshot) || (current.hostId !== this.me && !this.hostHeard(current.hostId))) this.removed();
      return;
    }
    const previous = current;
    this.snapshot = snapshot;
    this.snapshotAt = this.wallNow();
    this.myClaim = this.myClaim && snapshot.hostId === this.me ? this.myClaim : null;
    const lineage = `${snapshot.epoch}|${snapshot.hostId}`;
    const lineageChanged = this.lineage !== null && this.lineage !== lineage;
    this.lineage = lineage;
    if (this.hostProbe && this.hostProbe.hostId !== snapshot.hostId) this.hostProbe = null;
    this.session?.setRoster(this.rosterOf(snapshot));
    if (previous && previous.hostId !== snapshot.hostId && this.phase === "in-room" && !quiet) {
      const newHost = snapshot.members.find((member) => member.playerId === snapshot.hostId)?.nickname ?? "Alguém";
      this.toast(snapshot.hostId === this.me ? "Você agora é o anfitrião" : `${newHost} agora é o anfitrião`, true);
    }
    this.diffMembers(previous, snapshot);
    if (lineageChanged) this.replayFacts();
    this.afterSnapshot(previous);
    this.persist();
  }

  /** Depois de qualquer snapshot novo (adotado ou publicado). */
  private afterSnapshot(previous: RoomSnapshot | null): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    if (previous && previous.stage !== snapshot.stage && snapshot.stage === "lobby") {
      // Torneio novo (ou "Voltar à sala"): nada do anterior vale para as partidas que vêm (nem o checkpoint).
      if (this.duel && this.duelHandle?.role !== "spectator") this.checkpoints.clear(this.duel.matchId);
      this.clearDuel();
      this.forgetTournament();
    }
    this.facts = mergeFacts(this.facts, factsOf(snapshot));
    // Relatórios, W.O. e concessões já registrados saem da fila.
    for (const [bracketId, report] of this.pendingReports) {
      const match = snapshot.bracket ? matchById(snapshot.bracket, bracketId) : null;
      if (!match || (match.status === "done" && match.result?.matchId === report.matchId) || this.matchIdOf(match) !== report.matchId) this.pendingReports.delete(bracketId);
    }
    for (const pending of [this.pendingWo, this.pendingForfeit]) {
      for (const [bracketId, body] of pending) {
        const match = snapshot.bracket ? matchById(snapshot.bracket, bracketId) : null;
        if (!match || match.status === "done" || this.matchIdOf(match) !== body.matchId) pending.delete(bracketId);
      }
    }
    // Saí da tela de resultado antes de o resultado chegar: agora que a chave fechou, a partida sai.
    if (this.clearOnDone) {
      const match = snapshot.bracket ? matchById(snapshot.bracket, this.clearOnDone.bracketId) : null;
      if (!match || match.status === "done" || this.matchIdOf(match) !== this.clearOnDone.matchId) {
        const matchId = this.clearOnDone.matchId;
        this.clearOnDone = null;
        if (this.duelHandle?.matchId === matchId) this.clearDuel();
      }
    }
    if (this.duel && this.duelHandle?.role !== "spectator" && this.lingerUntil === null) {
      const mine = snapshot.bracket ? matchById(snapshot.bracket, this.duel.bracketId) : null;
      if (!mine || mine.status === "done" || this.matchIdOf(mine) !== this.duel.matchId) {
        const done = mine?.status === "done" && mine.result?.matchId === this.duel.matchId;
        if (done) this.checkpoints.clear(this.duel.matchId);
        // Fim normal com o motor daqui ainda atrás (o snapshot chegou antes da última ação): a partida
        // segue recebendo até terminar aqui ou RESULT_LINGER_MS. W.O. para na hora (a tela vai ao resultado).
        if (done && mine.result?.decision !== "walkover" && !this.duel.finishedHere()) this.lingerUntil = this.clock.now() + RESULT_LINGER_MS;
        else this.disposeDuel();
      }
    }
    this.flushReplay();
    this.ensureDuel();
    this.saveSessionNow();
  }

  /** O torneio acabou de virar lobby: fatos, pendências e contas do anfitrião do torneio anterior saem. */
  private forgetTournament(): void {
    this.facts = [];
    this.lostLocally.clear();
    this.pendingReports.clear();
    this.pendingWo.clear();
    this.pendingForfeit.clear();
    this.replayQueue.clear();
    this.clearOnDone = null;
    this.hostPools.clear();
    this.followerReports.clear();
    this.authorityN.clear();
    this.authorityAbsentSince.clear();
    this.bothAbsentSince.clear();
    this.concessions.clear();
    this.doubleReports.clear();
    this.pendingFree.clear();
    this.leftToLobby = null;
    this.toLobbyAt = null;
    this.live = {};
  }

  /** Avisos de entrada/saída a partir da diferença de membros. */
  private diffMembers(previous: RoomSnapshot | null, next: RoomSnapshot): void {
    if (!previous || this.phase !== "in-room") return;
    for (const member of next.members) {
      if (member.playerId === this.me) continue;
      const before = previous.members.find((entry) => entry.playerId === member.playerId);
      if (!before && !member.left) this.toast(`${member.nickname} entrou na sala`, true);
      else if (before && !before.left && member.left) this.toast(`${member.nickname} saiu`, !this.inMyMatch(member.playerId));
    }
    for (const member of previous.members) {
      if (member.playerId !== this.me && !member.left && !next.members.some((entry) => entry.playerId === member.playerId)) {
        this.toast(`${member.nickname} saiu`, true);
      }
    }
  }

  private rosterOf(snapshot: RoomSnapshot): Array<{ playerId: string; pub: string }> {
    return snapshot.members.filter((member) => member.pub && member.playerId !== this.me).map((member) => ({ playerId: member.playerId, pub: member.pub }));
  }

  /**
   * Linhagem nova: todo resultado que ela não tem volta como match:report {replay} (§4.7). Os fatos ficam
   * numa fila até a linhagem confirmar (partida fechada) ou divergir (outros lados): o da rodada 2 que
   * depende de um da rodada 1 sai quando a partida dele ganhar os mesmos lados.
   */
  private replayFacts(): void {
    for (const fact of this.facts) this.replayQueue.set(factKey(fact), Number.NEGATIVE_INFINITY);
    this.flushReplay();
    this.resendPending(true);
  }

  /** Reenvia os fatos da fila que já cabem na linhagem atual (no anfitrião, aplica até estabilizar). */
  private flushReplay(): void {
    if (this.flushingReplay || !this.replayQueue.size) return;
    this.flushingReplay = true;
    try {
      for (let pass = 0; pass < 8 && this.replayQueue.size; pass += 1) {
        let progressed = false;
        for (const fact of this.facts) {
          const key = factKey(fact);
          const sentAt = this.replayQueue.get(key);
          if (sentAt === undefined) continue;
          const bracket = this.snapshot?.bracket;
          const match = bracket ? matchById(bracket, fact.bracketId) : null;
          const sidesKnown = !!match?.home && !!match.away;
          const differs = sidesKnown && (match?.home?.entrantId !== fact.sides[0] || match?.away?.entrantId !== fact.sides[1]);
          if (!match || match.status === "done" || differs || this.matchIdOf(match) !== fact.result.matchId) {
            this.replayQueue.delete(key);
            continue;
          }
          if (!sidesKnown) continue; // a partida anterior ainda não fechou nesta linhagem
          const body: ReportBody = { bracketId: fact.bracketId, matchId: fact.result.matchId, result: fact.result, replay: true, sides: fact.sides };
          if (this.isHost()) {
            this.replayQueue.delete(key);
            const version = this.snapshot?.version;
            this.hostReport(this.me, body);
            if (this.snapshot?.version !== version) progressed = true;
          } else if (this.clock.now() - sentAt >= RESEND_MS) {
            this.replayQueue.set(key, this.clock.now());
            this.sendHost("match:report", body);
          }
        }
        if (!progressed) break;
      }
    } finally {
      this.flushingReplay = false;
    }
  }

  /**
   * Relatórios, W.O. e concessões que o snapshot ainda não mostra voltam ao anfitrião (a cada RESEND_MS,
   * ou já numa linhagem nova): um que se perdeu ou foi recusado por falta de prova nunca trava a chave.
   */
  private resendPending(force = false): void {
    const now = this.clock.now();
    if (!force && now - this.lastResendAt < RESEND_MS) return;
    this.lastResendAt = now;
    for (const wo of [...this.pendingWo.values()]) {
      if (this.isHost()) this.hostWalkover(this.me, wo);
      else this.sendHost("match:wo", wo);
    }
    for (const forfeit of [...this.pendingForfeit.values()]) {
      if (this.isHost()) this.hostConcede(this.me, forfeit);
      else this.sendHost("match:forfeit", forfeit);
    }
    for (const report of [...this.pendingReports.values()]) {
      if (this.isHost()) this.hostReport(this.me, report);
      else this.sendHost("match:report", report);
    }
    this.flushReplay();
  }

  // =========================================================================
  // Anfitrião: publicar
  // =========================================================================

  private isHost(): boolean {
    return !!this.snapshot && this.snapshot.hostId === this.me && this.phase === "in-room";
  }

  /** Muda o snapshot (cópia profunda) e publica (num lote, uma vez no fim). */
  private change(fn: (draft: RoomSnapshot) => void): void {
    const snapshot = this.snapshot;
    if (!snapshot || snapshot.hostId !== this.me) return;
    const draft = clone(snapshot);
    fn(draft);
    draft.version = snapshot.version + 1;
    draft.hostNow = this.wallNow();
    this.snapshot = draft;
    this.snapshotAt = draft.hostNow;
    if (this.batchDepth > 0) {
      this.batchPrevious ??= snapshot;
      return;
    }
    this.publishChange(snapshot);
  }

  private publishChange(previous: RoomSnapshot): void {
    const snapshot = this.snapshot as RoomSnapshot;
    this.session?.setRoster(this.rosterOf(snapshot));
    // Voltando de um reload, ou na janela do veto da minha reivindicação: o snapshot sai depois.
    if (this.resumeUntil === null && this.claimHoldUntil === null) this.broadcastSnap();
    this.diffMembers(previous, snapshot);
    this.afterSnapshot(previous);
    this.persist();
    this.changed();
  }

  private batchDepth = 0;
  private batchPrevious: RoomSnapshot | null = null;

  private batch(fn: () => void): void {
    this.batchDepth += 1;
    try {
      fn();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.batchPrevious) {
        const previous = this.batchPrevious;
        this.batchPrevious = null;
        this.publishChange(previous);
      }
    }
  }

  /** Os times que a sala usa: dos membros (no lobby, só de quem não saiu) e dos entrantes da chave. */
  private referencedOf(snapshot: RoomSnapshot): Set<string> {
    const hashes = new Set<string>();
    for (const member of snapshot.members) if (!member.left || snapshot.stage !== "lobby") hashes.add(member.teamHash);
    for (const entrant of snapshot.bracket?.entrants ?? []) hashes.add(entrant.teamHash);
    return hashes;
  }

  private referencedHashes(snapshot: RoomSnapshot): string[] {
    return [...this.referencedOf(snapshot)].filter((hash) => this.teams[hash]);
  }

  private sendSnapTo(playerId: string): void {
    const snapshot = this.snapshot;
    const session = this.session;
    if (!snapshot || !session) return;
    const sent = this.teamsSent.get(playerId) ?? new Set<string>();
    const missing = this.referencedHashes(snapshot).filter((hash) => !sent.has(hash));
    if (missing.length) {
      const teams: RoomTeams = {};
      for (const hash of missing) {
        teams[hash] = this.teams[hash];
        sent.add(hash);
      }
      this.teamsSent.set(playerId, sent);
      session.send(playerId, "room:teams", { teams });
    }
    session.send(playerId, "room:snap", { snapshot });
  }

  private broadcastSnap(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    for (const member of snapshot.members) {
      if (member.playerId === this.me || member.left) continue;
      this.sendSnapTo(member.playerId);
    }
  }

  // =========================================================================
  // Anfitrião: entrada, lobby, saída
  // =========================================================================

  private async hostJoin(from: string, body: JoinBody): Promise<void> {
    const snapshot = this.snapshot;
    if (!snapshot || !this.isHost()) return;
    const reject = (reason: RoomRejectReason) => {
      const body: RejectBody = reason === "iniciada" ? { reason, settings: { ...snapshot.settings } } : { reason };
      this.session?.send(from, "room:reject", body);
    };
    if (snapshot.banned.includes(from)) {
      reject("removido");
      return;
    }
    const existing = snapshot.members.find((member) => member.playerId === from);
    const team = sanitizeTeam(body.team);
    if (existing) {
      // Membro voltando (assinatura conferida no hello): readmitido em qualquer estágio.
      this.change((draft) => {
        const member = draft.members.find((entry) => entry.playerId === from);
        if (!member) return;
        member.left = false;
        member.presence = "online";
        if (draft.stage === "lobby" && team) {
          const hash = teamHash(team);
          this.teams = { ...this.teams, [hash]: team };
          member.teamHash = hash;
        }
      });
      this.sendWelcome(from);
      return;
    }
    const spectator = body.asSpectator === true;
    const refused = admissionError(snapshot, spectator, body, team);
    if (refused) {
      reject(refused);
      return;
    }
    // A chave do hello verificado (sessão) dispensa a conta; só a do room:join precisa do digest.
    let pub = this.pubOf(from);
    if (!pub) {
      pub = typeof body.pub === "string" ? body.pub : null;
      if (!pub || (await playerIdFor(pub).catch(() => "")) !== from) return;
    }
    const latest = this.snapshot;
    if (!latest || !this.isHost() || latest.members.some((member) => member.playerId === from) || !team) return;
    // Durante a conta o torneio pode ter começado ou a sala enchido: confere de novo.
    const late = admissionError(latest, spectator, body, team);
    if (late) {
      reject(late);
      return;
    }
    const nickname = sanitizeNickname(body.nickname, hashSeed(from));
    const hash = teamHash(team);
    this.teams = { ...this.teams, [hash]: team };
    if (spectator) this.spectatorSince.set(from, this.clock.now());
    this.change((draft) => {
      draft.members.push({
        playerId: from,
        pub,
        nickname: dedupNickname(nickname, draft.members, from),
        teamHash: hash,
        joinOrder: draft.nextJoinOrder,
        role: spectator ? "spectator" : "player",
        ready: false,
        presence: presenceOf(this.session?.health(from) ?? "ok"),
        left: false,
      });
      draft.nextJoinOrder += 1;
    });
    this.sendWelcome(from);
  }

  /** Boas-vindas com o snapshot e só os times que a sala usa (nunca o acumulado de torneios anteriores). */
  private sendWelcome(to: string): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const hashes = this.referencedHashes(snapshot);
    const teams: RoomTeams = {};
    for (const hash of hashes) teams[hash] = this.teams[hash];
    this.session?.send(to, "room:welcome", { snapshot, teams });
    this.teamsSent.set(to, new Set(hashes));
  }

  /** A chave pública do par (a sessão já a verificou no hello); sem acesso, usa a do room:join conferida pelo playerId. */
  private pubOf(playerId: string): string | null {
    const probe = this.session as unknown as { pubOf?: (id: string) => string | null } | null;
    return probe?.pubOf?.(playerId) ?? null;
  }

  private hostUpdate(from: string, update: RoomBodies["room:update"]): void {
    const snapshot = this.snapshot;
    if (!snapshot || snapshot.stage !== "lobby" || !snapshot.members.some((member) => member.playerId === from && !member.left)) return;
    const team = update.team !== undefined ? sanitizeTeam(update.team) : null;
    this.change((draft) => {
      const member = draft.members.find((entry) => entry.playerId === from);
      if (!member) return;
      if (typeof update.ready === "boolean" && from !== this.me) member.ready = update.ready;
      if (team) {
        const hash = teamHash(team);
        this.teams = { ...this.teams, [hash]: team };
        member.teamHash = hash; // trocar de time não mexe no pronto (§4.2)
      }
      if (typeof update.nickname === "string") member.nickname = dedupNickname(sanitizeNickname(update.nickname, hashSeed(from)), draft.members, from);
    });
  }

  private hostLeave(from: string): void {
    const snapshot = this.snapshot;
    const member = snapshot?.members.find((entry) => entry.playerId === from);
    if (!snapshot || !member) return;
    if (snapshot.stage === "running" && member.role === "player") this.hostAbandon(from);
    this.change((draft) => {
      if (draft.stage === "lobby" || member.role === "spectator") {
        draft.members = draft.members.filter((entry) => entry.playerId !== from);
        if (draft.rematch) draft.rematch.want = draft.rematch.want.filter((id) => id !== from);
        return;
      }
      const target = draft.members.find((entry) => entry.playerId === from);
      if (target) {
        target.left = true;
        target.presence = "offline";
      }
    });
  }

  /** Abandono: a partida em andamento vira W.O. já; as próximas viram W.O. quando chegarem ao "pronto?". */
  private hostAbandon(playerId: string): void {
    const bracket = this.snapshot?.bracket;
    if (!bracket) return;
    for (const match of bracket.matches) {
      if (match.status === "done" || (match.home?.entrantId !== playerId && match.away?.entrantId !== playerId)) continue;
      if (match.status === "playing") this.hostForfeit(playerId, { bracketId: match.id, matchId: this.matchIdOf(match) });
    }
  }

  /**
   * X1 "Voltar à sala". Com o jogo ainda sem registro, espera o relatório da autoridade até
   * TO_LOBBY_HOLD_MS (tick); `force`: o prazo passou ou o jogo fechou.
   */
  private hostToLobby(force = false): void {
    const snapshot = this.snapshot;
    if (!snapshot || snapshot.settings.format !== "x1" || snapshot.stage === "lobby") {
      this.toLobbyAt = null;
      return;
    }
    const game = snapshot.bracket?.matches[0];
    const open = !!game && game.status !== "done";
    if (open && !force) {
      this.toLobbyAt ??= this.clock.now();
      return;
    }
    this.toLobbyAt = null;
    // Jogo largado sem registro: a série não andou e o próximo repetiria o id dele (mesmo replay), com o
    // checkpoint e as telas do largado. Sorteio novo: ids novos (e a rodada da tela recomeça).
    const seed = open ? (this.deps.seed !== undefined ? hashSeed(this.deps.seed, snapshot.version) : newSeed()) : null;
    this.change((draft) => {
      draft.stage = "lobby";
      draft.bracket = null;
      draft.rematch = null;
      if (seed !== null) draft.seed = seed;
      for (const member of draft.members) if (member.playerId !== this.me) member.ready = false;
    });
  }

  /** Anfitrião: o "Voltar à sala" segurado sai quando o jogo fecha ou o prazo passa. */
  private toLobbyTick(now: number): void {
    if (this.toLobbyAt === null) return;
    const game = this.snapshot?.bracket?.matches[0];
    if (!game || game.status === "done" || now - this.toLobbyAt >= TO_LOBBY_HOLD_MS) this.hostToLobby(true);
  }

  private hostRematch(from: string, want: boolean): void {
    const snapshot = this.snapshot;
    const final = snapshot?.bracket?.matches[0];
    if (!snapshot || snapshot.settings.format !== "x1" || !final || final.status !== "done" || final.kind !== "duel") return;
    if (final.home?.entrantId !== from && final.away?.entrantId !== from) return;
    const wanted = snapshot.rematch?.want ?? [];
    if (want) {
      const next = [...new Set([...wanted, from])];
      if (next.length >= 2) {
        // Os dois querem: mesma partida, lados trocados, direto para "jogando" (§4.3).
        const now = this.wallNow();
        this.change((draft) => {
          const bracket = rematchMatch(draft.bracket as Bracket, final.id);
          draft.bracket = { ...bracket, matches: bracket.matches.map((match) => (match.id === final.id ? { ...match, status: "playing" as const, startedAt: now } : match)) };
          draft.stage = "running";
          draft.rematch = null;
        });
        return;
      }
      this.change((draft) => {
        draft.rematch = { want: next };
      });
      return;
    }
    // Cancelar o próprio pedido, ou recusar o do outro (o pedido dele também cai).
    this.change((draft) => {
      const others = wanted.filter((id) => id !== from);
      draft.rematch = others.length && !wanted.includes(from) ? null : others.length ? { want: others } : null;
    });
  }

  /** X1: o próximo jogo da série troca o mandante (quem era visitante manda); o id da partida não repete. */
  private orientSeriesGame(bracket: Bracket, draft: RoomSnapshot): Bracket {
    const games = (draft.series?.home ?? 0) + (draft.series?.away ?? 0);
    const creator = draft.members.filter((member) => member.role === "player").sort((a, b) => a.joinOrder - b.joinOrder)[0]?.playerId;
    return {
      ...bracket,
      matches: bracket.matches.map((match) => {
        if (!match.home || !match.away) return match;
        const creatorHome = games % 2 === 0;
        const homeIsCreator = match.home.entrantId === creator;
        const swapped = creatorHome !== homeIsCreator ? { ...match, home: match.away, away: match.home } : { ...match };
        return { ...swapped, authority: swapped.home?.entrantId ?? null, replay: games };
      }),
    };
  }

  // =========================================================================
  // Anfitrião: andamento da chave (§4.3)
  // =========================================================================

  private hostReady(from: string, bracketId: string): void {
    const match = this.snapshot?.bracket ? matchById(this.snapshot.bracket, bracketId) : null;
    if (!match || match.status !== "ready-check" || match.readyBy.includes(from)) return;
    if (match.home?.entrantId !== from && match.away?.entrantId !== from) return;
    this.change((draft) => {
      const target = matchById(draft.bracket as Bracket, bracketId);
      if (target) target.readyBy = [...target.readyBy, from];
    });
    this.hostAdvance();
  }

  /** match:free: saiu da tela de resultado da partida `bracketId` (a anterior). */
  private hostFree(from: string, bracketId: string): void {
    const bracket = this.snapshot?.bracket;
    const previous = bracket ? matchById(bracket, bracketId) : null;
    if (!bracket || !previous) return;
    if (previous.home?.entrantId !== from && previous.away?.entrantId !== from) return;
    if (previous.status !== "done") {
      // Saiu da tela antes de o resultado chegar aqui: vale para a próxima partida dele quando fechar.
      const waiting = this.pendingFree.get(bracketId) ?? new Set<string>();
      waiting.add(from);
      this.pendingFree.set(bracketId, waiting);
      return;
    }
    const next = nextMatchFor(bracket, from);
    if (!next || next.freeBy.includes(from)) return;
    this.change((draft) => {
      const target = matchById(draft.bracket as Bracket, next.id);
      if (target && !target.freeBy.includes(from)) target.freeBy = [...target.freeBy, from];
    });
    this.hostAdvance();
  }

  /** Presente para o anfitrião: ok/instável e no primeiro plano (o próprio anfitrião: a página visível). */
  private present(playerId: string): boolean {
    if (playerId === this.me) return !this.hidden;
    const health = this.session?.health(playerId) ?? "lost";
    return health === "ok" || health === "unstable";
  }

  private memberGone(playerId: string): boolean {
    const member = this.snapshot?.members.find((entry) => entry.playerId === playerId);
    return !member || member.left;
  }

  /** O anfitrião tem prova de que está na rede (§4.5) para cobrar ausências e decidir W.O. (ver hostNet). */
  private hostOnline(): boolean {
    return this.hostNet() === "online";
  }

  /**
   * Prova de rede do anfitrião: "online" quando ouve alguém (ou os outros jogadores sumiram em horas
   * diferentes: foram eles). Sem ninguém ligado, se todos sumiram juntos (em ISOLATION_SPREAD_MS) o isolado
   * pode ser eu: "offline" até LONE_CLAIM_MS com a sinalização no ar. Com um outro só (X1, dois humanos)
   * não há como comparar: "pending" até LONE_CLAIM_MS (as reservas guardam o tempo e cobram tudo depois).
   */
  private hostNet(): "online" | "pending" | "offline" {
    const session = this.session;
    const snapshot = this.snapshot;
    if (!session || !snapshot || !session.online()) return "offline";
    if (session.linked().length > 0) return "online";
    const seen = snapshot.members
      .filter((member) => member.role === "player" && !member.left && member.playerId !== this.me)
      .map((member) => this.lastOk.get(member.playerId))
      .filter((at): at is number => at !== undefined);
    if (!seen.length) return "online";
    if (seen.length >= 2 && Math.max(...seen) - Math.min(...seen) > ISOLATION_SPREAD_MS) return "online";
    if (!session.signalingUp()) return "offline";
    if (this.clock.now() - Math.max(...seen) >= LONE_CLAIM_MS) return "online";
    return seen.length === 1 ? "pending" : "offline";
  }

  /** Passadas pela chave até estabilizar (um snapshot publicado no fim). */
  private hostAdvance(): void {
    if (this.advancing) return;
    this.advancing = true;
    try {
      this.batch(() => {
        for (let pass = 0; pass < 32; pass += 1) if (!this.advanceOnce()) break;
      });
    } finally {
      this.advancing = false;
    }
  }

  private advancing = false;

  /** Uma passada: espera, "pronto?", começo, revelação, reservas do anfitrião. true = mudou algo. */
  private advanceOnce(): boolean {
    const snapshot = this.snapshot;
    if (!this.isHost() || !snapshot?.bracket || snapshot.stage !== "running" || this.resumeUntil !== null) return false;
    const version = snapshot.version;
    for (const match of snapshot.bracket.matches) {
      if (match.status === "done" || !match.home || !match.away || !match.kind) continue;
      this.stepMatch(snapshot.bracket, match);
      if (this.snapshot?.version !== version) return true;
    }
    return false;
  }

  /** O próximo passo de uma partida (no máximo uma mudança por chamada). */
  private stepMatch(bracket: Bracket, match: BracketMatch): void {
    if (!match.home || !match.away) return;
    const now = this.wallNow();
    const tick = this.clock.now();
    const matchId = this.matchIdOf(match);
    const humans = [match.home.entrantId, match.away.entrantId].filter((id) => !isCpu(id));
    const coin = () => walkoverResult(matchId, matchCoin({ seed: this.matchSeed(match) }) === "user" ? "home" : "away", "double", "host", now);

    if (match.status === "waiting") {
      if (match.kind === "cpu-cpu") {
        this.setMatch(match.id, { status: "playing", startedAt: now });
        return;
      }
      // Espera da tela de resultado: cada humano livre por match:free ou 30 s depois do jogo anterior
      // (folga não tem tela de resultado).
      let holdUntil = 0;
      for (const human of humans) {
        if (match.freeBy.includes(human)) continue;
        const previous = previousMatchOf(bracket, human, match);
        if (previous?.result && previous.kind !== "bye") holdUntil = Math.max(holdUntil, previous.result.at + T.RESULT_HOLD_S * 1000);
      }
      // Hora de outra linhagem (relógio errado de minutos) nunca segura mais que a espera inteira.
      holdUntil = Math.min(holdUntil, now + T.RESULT_HOLD_S * 1000);
      if (holdUntil > now) {
        if (match.holdUntil !== holdUntil) this.setMatch(match.id, { holdUntil });
        return;
      }
      if (match.round === 1) this.setMatch(match.id, { status: "playing", startedAt: now, holdUntil: null });
      else this.setMatch(match.id, { status: "ready-check", readyDeadline: now + T.READY_CHECK_S * 1000, readyBy: [], holdUntil: null });
      return;
    }

    if (match.status === "ready-check") {
      // Quem saiu da sala perde as próximas por abandono quando elas chegam aqui (§4.5).
      const gone = humans.filter((id) => this.memberGone(id));
      if (gone.length) {
        if (gone.length === 2) this.finishMatch(match.id, coin());
        else this.finishMatch(match.id, walkoverResult(matchId, gone.includes(match.home.entrantId) ? "away" : "home", "abandon", "host", now));
        return;
      }
      const allReady = humans.every((id) => match.readyBy.includes(id));
      const deadline = match.readyDeadline !== null && now >= match.readyDeadline;
      const absent = humans.filter((id) => !this.present(id));
      if (allReady || (deadline && absent.length === 0)) {
        // A partida começa com a reserva inteira nos dois lados (o aparelho também começa com 90 s).
        for (const human of humans) this.hostPools.delete(`${matchId}|${human}`);
        this.setMatch(match.id, { status: "playing", startedAt: now, readyDeadline: null });
        return;
      }
      // Depois do prazo, quem está ausente gasta a própria reserva; nunca começa com alguém fora.
      if (deadline) this.drainHostPools(match, humans, absent, tick, now);
      return;
    }

    // Jogando.
    if (match.kind === "cpu-cpu") {
      if (match.sealed) {
        if (now >= match.sealed.revealAt) this.finishMatch(match.id, { ...match.sealed.result, at: match.sealed.revealAt });
      } else if (!this.simulating.has(match.id)) this.simulate(match);
      return;
    }
    if (match.kind === "cpu-human") {
      // O humano do solo sumiu: o anfitrião corre a reserva dele; no zero a CPU leva (§4.5).
      const human = humans[0];
      if (human && human !== this.me) this.drainHostPools(match, humans, this.present(human) ? [] : [human], tick, now);
      return;
    }
    // Concessão (quem não voltou a tempo) segurada WO_EVIDENCE_MS sem a do outro lado: W.O. para o outro.
    const conceded = this.concessions.get(match.id);
    if (conceded && tick - conceded.at >= T.WO_EVIDENCE_MS) {
      this.finishMatch(match.id, walkoverResult(matchId, conceded.player === match.home.entrantId ? "away" : "home", "timeout", conceded.player, now));
      return;
    }
    // Duelo: os dois sumidos por 3 min → moeda determinística (§4.5). Isolado, o anfitrião não conta.
    if (humans.every((id) => !this.present(id)) && this.hostOnline()) {
      const since = this.bothAbsentSince.get(match.id) ?? tick;
      this.bothAbsentSince.set(match.id, since);
      if (tick - since >= T.DOUBLE_ABSENT_S * 1000) {
        this.finishMatch(match.id, coin());
        return;
      }
    } else this.bothAbsentSince.delete(match.id);
    // A autoridade sumiu além da reserva e o seguidor já relatou: vale o relatório dele.
    const authority = match.authority;
    if (authority && authority !== this.me && !this.present(authority) && this.hostOnline()) {
      const since = this.authorityAbsentSince.get(match.id) ?? tick;
      this.authorityAbsentSince.set(match.id, since);
      const follower = this.followerReports.get(match.id);
      if (follower && follower.result.matchId === matchId && tick - since >= this.graceS * 1000) {
        this.finishMatch(match.id, follower.result);
        return;
      }
    } else this.authorityAbsentSince.delete(match.id);
    this.trackAuthority(match);
  }

  /**
   * Reservas do anfitrião ("pronto?" e solo), pelo tempo ausente desde a última olhada.
   * No zero: W.O. por tempo (os dois zerados: moeda).
   */
  private drainHostPools(match: BracketMatch, humans: string[], absent: string[], tick: number, now: number): void {
    if (!match.home || !match.away) return;
    const matchId = this.matchIdOf(match);
    // Anfitrião sem prova de rede: o tempo isolado nunca é cobrado de ninguém (§4.5). Prova ainda pendente
    // (um outro só): o tempo do ausente fica guardado e conta inteiro quando ela vier.
    const net = absent.length > 0 ? this.hostNet() : "online";
    const charge = absent.length > 0 && net === "online";
    const empty: string[] = [];
    for (const playerId of humans) {
      const key = `${matchId}|${playerId}`;
      const pool = this.hostPools.get(key) ?? { left: this.graceS, at: tick };
      if (charge && absent.includes(playerId)) pool.left = Math.max(0, pool.left - Math.max(0, tick - pool.at) / 1000);
      if (net !== "pending" || !absent.includes(playerId)) pool.at = tick;
      this.hostPools.set(key, pool);
      if (pool.left <= 0) empty.push(playerId);
    }
    if (!empty.length) return;
    if (humans.length === 2 && empty.length === 2) {
      this.finishMatch(match.id, walkoverResult(matchId, matchCoin({ seed: this.matchSeed(match) }) === "user" ? "home" : "away", "double", "host", now));
      return;
    }
    const loserHome = empty.includes(match.home.entrantId);
    this.finishMatch(match.id, walkoverResult(matchId, loserHome ? "away" : "home", "timeout", "host", now));
  }

  /**
   * Para conferir um W.O. de travamento: o `n` do hb.m da autoridade, desde quando está parado e desde
   * quando está parado com a vez aberta sendo DELA (a do seguidor nunca prova travamento da autoridade).
   */
  private trackAuthority(match: BracketMatch): void {
    const authority = match.authority;
    if (!authority) return;
    const matchId = this.matchIdOf(match);
    const now = this.clock.now();
    const p = authority === this.me ? this.duel?.localProgress() ?? null : this.session?.progressOf(authority)?.p ?? null;
    const mine = !!p && (authority === this.me ? this.duel?.matchId === matchId : (p as { matchId?: string }).matchId === matchId);
    const n = p && mine ? p.n : -1;
    const present = this.present(authority);
    const owned = present && !!p && mine && p.own !== null && p.opened === p.n;
    const unrested = present && !!p && mine && p.restN < p.n;
    const tracked = this.authorityN.get(match.id);
    if (!tracked || tracked.n !== n) {
      this.authorityN.set(match.id, { n, since: now, ownedSince: owned ? now : null, unrestedSince: unrested ? now : null });
      return;
    }
    if (!owned) tracked.ownedSince = null;
    else tracked.ownedSince ??= now;
    if (!unrested) tracked.unrestedSince = null;
    else tracked.unrestedSince ??= now;
  }

  private setMatch(bracketId: string, patch: Partial<BracketMatch>): void {
    this.change((draft) => {
      const target = draft.bracket ? matchById(draft.bracket, bracketId) : null;
      if (target) Object.assign(target, patch);
    });
  }

  /**
   * Id da partida do motor: sala, torneio (a semente, nova a cada "Novo torneio"), jogo e replay. Nunca
   * se repete entre torneios da mesma sala (fatos, checkpoints, reservas e telas são por matchId).
   */
  private matchIdOf(match: Pick<BracketMatch, "id" | "replay">): string {
    const seed = ((this.snapshot?.seed ?? 0) >>> 0).toString(36);
    return `${this.snapshot?.code ?? this.code}-${seed}-${match.id}-${match.replay}`;
  }

  private matchSeed(match: Pick<BracketMatch, "id" | "replay">): number {
    return hashSeed(this.snapshot?.seed ?? 0, this.matchIdOf(match));
  }

  /** Fecha uma partida na chave (nunca mexe numa "done") e sobe o vencedor. */
  private finishMatch(bracketId: string, result: BracketResult): void {
    const snapshot = this.snapshot;
    const match = snapshot?.bracket ? matchById(snapshot.bracket, bracketId) : null;
    if (!snapshot?.bracket || !match || match.status === "done" || !match.home || !match.away) return;
    const now = this.wallNow();
    const final: BracketResult = { ...result, at: result.at || now };
    const freed = this.pendingFree.get(bracketId);
    this.pendingFree.delete(bracketId);
    this.concessions.delete(bracketId);
    this.doubleReports.delete(bracketId);
    this.change((draft) => {
      const bracket = draft.bracket as Bracket;
      const joinOrderOf = (id: string) => draft.members.find((member) => member.playerId === id)?.joinOrder ?? 1000 + Number(id.split(":")[1] ?? 0);
      draft.bracket = advanceBracket(bracket, bracketId, final, joinOrderOf);
      // Quem já tinha saído da tela de resultado antes de o resultado chegar: livre para a próxima.
      for (const playerId of freed ?? []) {
        const next = nextMatchFor(draft.bracket, playerId);
        if (next && !next.freeBy.includes(playerId)) next.freeBy = [...next.freeBy, playerId];
      }
      const done = matchById(draft.bracket, bracketId);
      if (draft.settings.format === "x1" && done?.home && done.away) {
        const winnerId = final.winner === "home" ? done.home.entrantId : done.away.entrantId;
        const creator = draft.members.filter((member) => member.role === "player").sort((a, b) => a.joinOrder - b.joinOrder)[0]?.playerId;
        const series = draft.series ?? { home: 0, away: 0 };
        draft.series = winnerId === creator ? { ...series, home: series.home + 1 } : { ...series, away: series.away + 1 };
      }
      const finalMatch = draft.bracket.matches.find((entry) => entry.round === draft.bracket?.rounds && entry.index === 0);
      if (finalMatch?.status === "done") draft.stage = "done";
    });
    this.followerReports.delete(bracketId);
    if (!this.advancing) this.hostAdvance();
  }

  // =========================================================================
  // Anfitrião: relatórios, W.O., desistência
  // =========================================================================

  private hostReport(from: string, body: ReportBody): void {
    const snapshot = this.snapshot;
    if (!snapshot?.bracket || typeof body.bracketId !== "string" || !isResult(body.result)) return;
    const match = matchById(snapshot.bracket, body.bracketId);
    if (!match || !match.home || !match.away) return;
    if (match.status === "done") {
      if (match.result && match.result.matchId === body.matchId && match.result.resultHash !== body.result.resultHash && !body.replay) {
        console.warn("[bobonline] relatórios divergentes");
      }
      return;
    }
    if (body.matchId !== this.matchIdOf(match) || body.result.matchId !== body.matchId) return;
    const now = this.wallNow();
    if (body.replay) {
      this.hostReplay(from, match, body, now);
      return;
    }
    const sides = [match.home.entrantId, match.away.entrantId];
    if (!sides.includes(from)) return;
    if (body.result.walkover === "double") {
      this.hostDouble(from, match, now);
      return;
    }
    const result: BracketResult = { ...body.result, reportedBy: from, at: now };
    result.resultHash = bracketResultHash(result);
    if (from === match.authority) {
      const follower = this.followerReports.get(match.id);
      if (follower && follower.result.resultHash !== result.resultHash) console.warn("[bobonline] relatórios divergentes");
      this.finishMatch(match.id, result);
      return;
    }
    // Relatório do seguidor: vale se a autoridade sumir além da reserva (ver hostAdvance).
    this.followerReports.set(match.id, { result, from });
  }

  /**
   * Fato de outra linhagem (§4.7): só de um jogador da sala, com os mesmos lados e a partida aberta
   * aqui. W.O. por tempo (ou duplo) contra quem eu vejo jogando agora não vale: veio de um anfitrião
   * que estava isolado. A hora é a deste anfitrião (a da outra linhagem segura a próxima partida errado).
   */
  private hostReplay(from: string, match: BracketMatch, body: ReportBody, now: number): void {
    const snapshot = this.snapshot;
    if (!snapshot || !match.home || !match.away || !this.isPlayerMember(snapshot, from)) return;
    if (!body.sides || body.sides[0] !== match.home.entrantId || body.sides[1] !== match.away.entrantId) return;
    // Quem não joga a partida só repõe o fato dela com os dois lados sumidos (os lados têm o fato também);
    // jogando, com a autoridade presente, só o dela vale (o seguidor nunca pula a regra da autoridade).
    // Os fatos do próprio anfitrião valem como as decisões dele.
    const parties = [match.home.entrantId, match.away.entrantId];
    const party = parties.includes(from);
    if (from !== this.me) {
      if (!party && parties.some((id) => !isCpu(id) && this.present(id))) return;
      if (party && match.status === "playing" && match.authority && from !== match.authority && this.present(match.authority)) return;
    }
    const kind = body.result.walkover;
    if (body.result.decision === "walkover" && (kind === "timeout" || kind === "double") && match.status === "playing") {
      const loser = body.result.winner === "home" ? match.away.entrantId : match.home.entrantId;
      const watched = kind === "double" ? [match.home.entrantId, match.away.entrantId] : [loser];
      if (watched.some((id) => !isCpu(id) && this.present(id))) return;
    }
    const reportedBy = typeof body.result.reportedBy === "string" && body.result.reportedBy ? body.result.reportedBy.slice(0, 64) : from;
    const result: BracketResult = { ...body.result, reportedBy, at: now };
    result.resultHash = bracketResultHash(result);
    this.finishMatch(match.id, result);
  }

  /**
   * W.O. duplo relatado (§4.5): o vencedor é sempre a moeda da partida (nunca o que veio). Vale da
   * autoridade ou do próprio anfitrião; do seguidor, só com prova: o outro lado também relatou, os dois
   * sumidos para o anfitrião por 3 min, ou a autoridade parada (sem caminho entre eles) por 3 min.
   */
  private hostDouble(from: string, match: BracketMatch, now: number): void {
    if (!match.home || !match.away) return;
    const matchId = this.matchIdOf(match);
    const result = walkoverResult(matchId, matchCoin({ seed: this.matchSeed(match) }) === "user" ? "home" : "away", "double", from, now);
    const reported = this.doubleReports.get(match.id) ?? new Set<string>();
    reported.add(from);
    this.doubleReports.set(match.id, reported);
    const tick = this.clock.now();
    const window = T.DOUBLE_ABSENT_S * 1000;
    const bothAway = (this.bothAbsentSince.get(match.id) ?? tick) <= tick - window;
    const tracked = this.authorityN.get(match.id);
    const stuck = !!tracked && tick - tracked.since >= window;
    if (from === match.authority || from === this.me || reported.size >= 2 || bothAway || stuck) {
      this.finishMatch(match.id, result);
      return;
    }
    this.followerReports.set(match.id, { result, from });
  }

  private hostWalkover(from: string, body: RoomBodies["match:wo"]): void {
    const snapshot = this.snapshot;
    const match = snapshot?.bracket ? matchById(snapshot.bracket, body.bracketId) : null;
    if (!match || match.status !== "playing" || !match.home || !match.away || body.matchId !== this.matchIdOf(match)) return;
    const sides = [match.home.entrantId, match.away.entrantId];
    if (!sides.includes(from) || !sides.includes(body.absent) || from === body.absent) return;
    const now = this.wallNow();
    const tick = this.clock.now();
    if (body.kind === "stall") {
      // Só com a prova do próprio anfitrião: o n da autoridade (presente) parado a janela inteira, com a vez
      // sendo dela ou sem nunca chegar ao descanso n (motor travado no meio da jogada).
      if (body.absent !== match.authority) return;
      const tracked = this.authorityN.get(match.id);
      const window = T.AUTHORITY_STALL_S * 1000;
      const stuck = (since: number | null) => since !== null && tick - since >= window;
      if (!tracked || (!stuck(tracked.ownedSince) && !stuck(tracked.unrestedSince))) {
        this.rejectWo(from, body);
        return;
      }
    } else if (body.absent === this.me) {
      // O ausente sou eu. Escondido, a minha reserva está parada: a conta sai na volta (e eu concedo se zerar).
      if (this.hidden) return;
      if ((this.duel?.poolOf(this.me) ?? 1) > 0) {
        this.rejectWo(from, body);
        return;
      }
    } else {
      // O pedido é meu (X1): só com prova de rede (§4.5); sem ela fica na fila e volta no reenvio.
      if (from === this.me && !this.hostOnline()) return;
      const lastOk = this.lastOk.get(body.absent) ?? Number.NEGATIVE_INFINITY;
      const unseen = tick - lastOk >= T.WO_EVIDENCE_MS && !(this.session?.health(body.absent) === "ok");
      if (!unseen) {
        this.rejectWo(from, body); // o anfitrião vê os dois: o problema é só entre o par
        return;
      }
    }
    const winner = match.home.entrantId === from ? "home" : "away";
    this.finishMatch(match.id, walkoverResult(body.matchId, winner, "timeout", from, now));
  }

  /** W.O. recusado: quem pediu fica sabendo e a partida dele volta (nunca fica "acabada" esperando). */
  private rejectWo(from: string, body: RoomBodies["match:wo"]): void {
    if (from === this.me) {
      this.onWoRejected(body.bracketId, body.matchId);
      return;
    }
    const no: WoNoBody = { bracketId: body.bracketId, matchId: body.matchId };
    this.session?.send(from, "match:wo-no", no);
  }

  /** Quem pediu o W.O. recebe a recusa do anfitrião. */
  private onWoRejected(bracketId: string, matchId: string): void {
    const pending = this.pendingWo.get(bracketId);
    if (pending && pending.matchId === matchId) this.pendingWo.delete(bracketId);
    if (this.duel && this.duel.matchId === matchId) this.duel.claimRejected();
  }

  /**
   * Concessão: o jogador não voltou a tempo e o próprio aparelho viu a reserva zerar (§4.5). Vale sem
   * prova (só tira dele), mas fica WO_EVIDENCE_MS esperando: se o outro lado também conceder (a mesma
   * rede caiu para os dois), é a moeda.
   */
  private hostConcede(from: string, body: ForfeitBody): void {
    const snapshot = this.snapshot;
    const match = snapshot?.bracket ? matchById(snapshot.bracket, body.bracketId) : null;
    if (!match || match.status !== "playing" || !match.home || !match.away || body.matchId !== this.matchIdOf(match)) return;
    if (match.home.entrantId !== from && match.away.entrantId !== from) return;
    const held = this.concessions.get(match.id);
    if (held && held.player !== from) {
      this.finishMatch(match.id, walkoverResult(body.matchId, matchCoin({ seed: this.matchSeed(match) }) === "user" ? "home" : "away", "double", "host", this.wallNow()));
      return;
    }
    if (!held) this.concessions.set(match.id, { player: from, at: this.clock.now() });
  }

  private hostForfeit(from: string, body: RoomBodies["match:forfeit"]): void {
    const snapshot = this.snapshot;
    const match = snapshot?.bracket ? matchById(snapshot.bracket, body.bracketId) : null;
    if (!match || match.status === "done" || !match.home || !match.away || body.matchId !== this.matchIdOf(match)) return;
    if (match.home.entrantId !== from && match.away.entrantId !== from) return;
    const winner = match.home.entrantId === from ? "away" : "home";
    this.finishMatch(match.id, walkoverResult(body.matchId, winner, "abandon", from, this.wallNow()));
  }

  // =========================================================================
  // Anfitrião: CPU × CPU (§4.6)
  // =========================================================================

  private simulate(match: BracketMatch): void {
    const snapshot = this.snapshot;
    if (!snapshot || !match.home || !match.away) return;
    const home = this.teamOfEntrant(match.home.entrantId);
    const away = this.teamOfEntrant(match.away.entrantId);
    if (!home || !away) return;
    const matchId = this.matchIdOf(match);
    const setup = buildDuelSetup({
      matchId,
      seed: this.matchSeed(match),
      home,
      away,
      rules: snapshot.settings.rules,
      stageName: roundStageName(snapshot.bracket?.size ?? 2, match.round),
    });
    setup.difficulty = snapshot.settings.cpuLevel;
    this.simulating.add(match.id);
    const run = this.deps.simulate ?? ((value: BotaoMatchSetup) => simulateCpuMatch(value, { busy: () => this.busy() }));
    run(setup).then(
      (result) => {
        this.simulating.delete(match.id);
        const current = this.snapshot?.bracket ? matchById(this.snapshot.bracket, match.id) : null;
        if (!this.isHost() || !current || current.status !== "playing" || current.sealed || this.matchIdOf(current) !== matchId) return;
        const now = this.wallNow();
        const startedAt = current.startedAt ?? now;
        let revealAt = startedAt + T.CPU_REVEAL_MS;
        if (this.winnerAwaited(current, result)) revealAt = Math.min(revealAt, now + T.CPU_REVEAL_WAITING_MS);
        const sealed = sealCpuResult(current, result, startedAt, revealAt, regulationSecondsOf(setup.rules));
        this.setMatch(match.id, { sealed });
        this.changed();
      },
      (error: unknown) => {
        this.simulating.delete(match.id);
        console.error("[bobonline] simulação CPU × CPU", error);
      },
    );
  }

  /** O próximo jogo do vencedor já tem o outro lado esperando: revela mais cedo. */
  private winnerAwaited(match: BracketMatch, result: BotaoMatchResult): boolean {
    const bracket = this.snapshot?.bracket;
    if (!bracket || !match.home || !match.away || match.round >= bracket.rounds) return false;
    const next = matchById(bracket, `r${match.round + 1}m${Math.floor(match.index / 2)}`);
    void result;
    return !!next && (next.home !== null || next.away !== null);
  }

  /**
   * O anfitrião está num duelo que ainda não acabou aqui (§4.6, §11.6): a simulação na thread da página
   * espera o fim dele. Só o descanso não basta: 1-2 s de simulação no celular travariam a mira.
   */
  private busy(): boolean {
    return !!this.duel && this.duel.role !== "spectator" && !this.duel.finishedHere();
  }

  /** "Ao vivo" virtual das CPU × CPU: relógio proporcional até a revelação, gols lacrados que já passaram. */
  private cpuLive(): void {
    const snapshot = this.snapshot;
    if (!snapshot?.bracket) return;
    const now = this.wallNow();
    const halves = Math.max(1, BOB_RULE_PRESETS[snapshot.settings.rules]?.rules.halves ?? 2);
    for (const match of snapshot.bracket.matches) {
      const sealed = match.sealed;
      if (match.status !== "playing" || match.kind !== "cpu-cpu" || !sealed) continue;
      const span = Math.max(1, sealed.revealAt - sealed.startedAt);
      const fraction = Math.max(0, Math.min(1, (now - sealed.startedAt) / span));
      const elapsed = fraction * sealed.regulationSeconds;
      const halfSeconds = sealed.regulationSeconds / halves;
      const passed = sealed.goals.filter((goal) => (goal.period - 1) * halfSeconds + (halfSeconds - goal.clock) <= elapsed);
      const period = Math.min(halves, Math.floor(elapsed / halfSeconds) + 1);
      const info: LiveInfo = {
        matchId: this.matchIdOf(match),
        bracketId: match.id,
        score: { home: passed.filter((goal) => goal.side === "home").length, away: passed.filter((goal) => goal.side === "away").length },
        pens: null,
        clock: Math.max(0, halfSeconds - (elapsed - (period - 1) * halfSeconds)),
        period,
        phase: "aim",
        text: passed.length ? passed[passed.length - 1].text : null,
      };
      this.broadcastLive(info);
    }
  }

  private broadcastLive(info: LiveInfo): void {
    this.live = { ...this.live, [info.bracketId]: { ...info, receivedAt: this.wallNow() } };
    this.session?.sendLossy("all", "live", info);
    this.changed();
  }

  // =========================================================================
  // Partidas deste aparelho
  // =========================================================================

  /** A partida que eu jogo agora (ou o espectador que já está montado). */
  private ensureDuel(): void {
    const snapshot = this.snapshot;
    if (!snapshot?.bracket || snapshot.stage !== "running" || this.phase !== "in-room") return;
    const mine = snapshot.bracket.matches.find((match) => match.status === "playing" && (match.kind === "duel" || match.kind === "cpu-human")
      && (match.home?.entrantId === this.me || match.away?.entrantId === this.me));
    if (!mine) return;
    const matchId = this.matchIdOf(mine);
    if (this.duel && this.duel.matchId === matchId) return;
    if (this.lostLocally.has(matchId) || this.leftToLobby === matchId) return;
    const role: DuelRole = mine.kind === "cpu-human" ? "solo" : mine.home?.entrantId === this.me ? "authority" : "follower";
    this.launchDuel(mine, role, null);
  }

  private teamOfEntrant(entrantId: string): BobTeam | null {
    const snapshot = this.snapshot;
    const hash = snapshot?.bracket?.entrants.find((entrant) => entrant.id === entrantId)?.teamHash
      ?? snapshot?.members.find((member) => member.playerId === entrantId)?.teamHash;
    return hash ? this.teams[hash] ?? null : null;
  }

  private nameOf(entrantId: string): string {
    if (isCpu(entrantId)) return "CPU";
    return this.snapshot?.members.find((member) => member.playerId === entrantId)?.nickname ?? "Jogador";
  }

  private launchDuel(match: BracketMatch, role: DuelRole, verbatim: { setup: BotaoMatchSetup; matchId: string; names?: Record<BotaoSide, string> } | null): void {
    const snapshot = this.snapshot;
    const session = this.session;
    if (!snapshot || !session || !match.home || !match.away) return;
    const matchId = verbatim?.matchId ?? this.matchIdOf(match);
    let setup = verbatim?.setup ?? null;
    if (!setup) {
      const home = this.teamOfEntrant(match.home.entrantId);
      const away = this.teamOfEntrant(match.away.entrantId);
      if (!home || !away) return; // os times ainda vêm (room:teams)
      setup = buildDuelSetup({
        matchId,
        seed: hashSeed(snapshot.seed, matchId),
        home,
        away,
        rules: snapshot.settings.rules,
        stageName: roundStageName(snapshot.bracket?.size ?? 2, match.round),
      });
    }
    const sides: Record<BotaoSide, string> = {
      user: match.home.entrantId,
      cpu: isCpu(match.away.entrantId) ? "cpu" : match.away.entrantId,
    };
    const names = verbatim?.names ?? { user: this.nameOf(match.home.entrantId), cpu: this.nameOf(match.away.entrantId) };
    this.disposeDuel();
    const restore = role === "spectator" ? null : this.checkpoints.load(matchId);
    // Autoridade sem checkpoint bem depois do começo: estava voltando (o checkpoint se perdeu) e pode não ter
    // o próprio passado. Numa largada nova ela nunca aceita do seguidor o lado dela nem o estado dele.
    const resuming = role === "authority" && !restore && match.startedAt !== null && this.wallNow() - this.toLocal(match.startedAt) > AUTHORITY_RESUME_MS;
    const bracketId = match.id;
    const args: DuelControllerArgs = {
      session,
      matchId,
      bracketId,
      role,
      setup,
      sides,
      names,
      cpuSkill: snapshot.settings.cpuLevel,
      checkpoints: this.checkpoints,
      restore,
      resuming,
      roomCode: snapshot.code,
      clock: this.clock,
      wallNow: this.wallNow,
      graceS: this.graceS,
      canSpectate: (playerId) => this.canWatch(playerId, bracketId),
      onOutcome: (outcome) => this.onDuelOutcome(bracketId, matchId, role, outcome),
      onLive: (info) => this.broadcastLive(info),
    };
    const duel = this.deps.createDuel ? this.deps.createDuel(args) : new DuelController(args);
    this.duel = duel;
    this.duelHandle = { bracketId, matchId, launch: duel.launch(), role };
    if (this.hidden) duel.setVisible(false);
    duel.start();
    const buffered = this.buffers.get(matchId);
    this.buffers.delete(matchId);
    if (buffered?.length) duel.feedBuffered(buffered.map(({ from, kind, body }) => ({ from, kind, body })));
    this.changed();
  }

  private disposeDuel(): void {
    const lingering = this.lingerUntil !== null;
    this.lingerUntil = null;
    if (!this.duel) return;
    this.duel.dispose();
    // A que ficou depois do resultado pode ter salvo de novo: a partida acabou, o checkpoint sai.
    if (lingering) this.checkpoints.clear(this.duel.matchId);
    this.duel = null;
  }

  /** Partida que acabou na chave e ainda recebe aqui (fim normal): solta quando termina aqui ou no prazo. */
  private lingerTick(now: number): void {
    if (this.lingerUntil === null) return;
    if (!this.duel || this.duel.finishedHere() || now >= this.lingerUntil) this.disposeDuel();
  }

  private clearDuel(): void {
    this.disposeDuel();
    if (!this.duelHandle) return;
    this.duelHandle = null;
    this.changed();
  }

  /** Quem pode assistir à partida `bracketId` daqui (§4.8): membro atual da sala que não a joga. */
  private canWatch(playerId: string, bracketId: string): boolean {
    const snapshot = this.snapshot;
    const match = snapshot?.bracket ? matchById(snapshot.bracket, bracketId) : null;
    if (!snapshot || !match || snapshot.banned.includes(playerId)) return false;
    if (match.home?.entrantId === playerId || match.away?.entrantId === playerId) return false;
    return snapshot.members.some((member) => member.playerId === playerId && !member.left);
  }

  /** O único caminho de relatório (§3.7): o resultado do controlador vira match:report / match:wo / concessão. */
  private onDuelOutcome(bracketId: string, matchId: string, role: DuelRole, outcome: DuelOutcome): void {
    if (outcome.kind === "withdrawn") {
      // O W.O. que pedi caiu (o outro voltou ou o anfitrião recusou): para de reenviar.
      if (this.pendingWo.get(bracketId)?.matchId === matchId) this.pendingWo.delete(bracketId);
      return;
    }
    if (role === "spectator" || this.lostLocally.has(matchId)) return;
    const snapshot = this.snapshot;
    const match = snapshot?.bracket ? matchById(snapshot.bracket, bracketId) : null;
    // Já fechada na chave (a que ficou viva depois do resultado também chega aqui): nada a relatar.
    if (!match || !match.home || !match.away || match.status === "done" || this.matchIdOf(match) !== matchId) return;
    const mySide: BotaoSide = match.home.entrantId === this.me ? "user" : "cpu";
    const now = this.wallNow();
    if (outcome.kind === "result") {
      const body: ReportBody = { bracketId, matchId, result: bracketResultFrom(outcome.result, this.me, now) };
      this.report(body);
      return;
    }
    if (outcome.reason === "abandon") return; // o anfitrião já tem o match:forfeit
    if (outcome.reason === "double") {
      const result = walkoverResult(matchId, outcome.winner === "user" ? "home" : "away", "double", this.me, now);
      this.report({ bracketId, matchId, result });
      return;
    }
    if (outcome.winner !== mySide) {
      // Não voltei a tempo: derrota que eu mesmo vi; concedo (o outro pode ver a minha reserva com
      // sobra e nunca pedir o W.O.). Nunca relato outro resultado desta partida.
      this.lostLocally.add(matchId);
      const body: ForfeitBody = { bracketId, matchId, reason: "timeout" };
      this.pendingForfeit.set(bracketId, body);
      const opponent = mySide === "user" ? match.away.entrantId : match.home.entrantId;
      if (!isCpu(opponent)) this.session?.send(opponent, "match:forfeit", body);
      if (this.isHost()) this.hostConcede(this.me, body);
      else if (opponent !== snapshot?.hostId) this.sendHost("match:forfeit", body);
      return;
    }
    const absent = mySide === "user" ? match.away.entrantId : match.home.entrantId;
    const body: RoomBodies["match:wo"] = { bracketId, matchId, absent, kind: outcome.reason === "stall" ? "stall" : "timeout" };
    this.pendingWo.set(bracketId, body);
    if (this.isHost()) this.hostWalkover(this.me, body);
    else this.sendHost("match:wo", body);
  }

  private report(body: ReportBody): void {
    this.pendingReports.set(body.bracketId, body);
    if (this.isHost()) this.hostReport(this.me, body);
    else this.sendHost("match:report", body);
  }

  // =========================================================================
  // Troca de anfitrião (§4.7)
  // =========================================================================

  private claimTick(): void {
    const snapshot = this.snapshot;
    const session = this.session;
    if (!snapshot || !session || this.isHost() || this.phase !== "in-room") return;
    const self = snapshot.members.find((member) => member.playerId === this.me);
    if (!self || self.role !== "player" || self.left) return;
    const host = snapshot.hostId;
    const now = this.clock.now();
    const health = session.health(host);
    const heard = session.progressOf(host)?.at ?? this.startedAt;
    const lost = health === "lost" && now - heard >= T.HOST_CLAIM_LOST_MS && !session.heardBy(host);
    const awayLimit = snapshot.stage === "running" ? T.HOST_CLAIM_AWAY_RUNNING_MS : T.HOST_CLAIM_AWAY_LOBBY_MS;
    const away = health === "away" && this.hostAwaySince !== null && now - this.hostAwaySince >= awayLimit;
    if (!lost && !away) {
      this.claimBackoffMs = 0;
      return;
    }
    // Candidato: o presente de menor joinOrder cujo "ok" direto cobre a maioria dos elegíveis (todos os
    // jogadores da sala menos o anfitrião, e não só os que EU vejo: sem rede, eu me veria sozinho). Quem
    // eu vi sumir bem antes do anfitrião não conta (sem rede, todos somem juntos para mim).
    const goneBefore = (playerId: string) => {
      const seen = this.lastOk.get(playerId);
      return playerId !== this.me && seen !== undefined && seen < heard - T.HOST_CLAIM_LOST_MS && session.health(playerId) === "lost";
    };
    const eligible = snapshot.members
      .filter((member) => member.role === "player" && !member.left && member.playerId !== host && !snapshot.banned.includes(member.playerId))
      .filter((member) => !goneBefore(member.playerId))
      .sort((a, b) => a.joinOrder - b.joinOrder);
    // A maioria conta quem eu ouço (ok, instável ou em segundo plano: vivo e do meu lado); candidato só
    // quem está em primeiro plano (eu, com a página visível).
    const alive = (playerId: string) => playerId === this.me || ["ok", "unstable", "away"].includes(session.health(playerId));
    const present = eligible.filter((member) => (member.playerId === this.me ? !this.hidden : ["ok", "unstable"].includes(session.health(member.playerId))));
    const ids = eligible.filter((member) => alive(member.playerId)).map((member) => member.playerId);
    let majority = Math.floor(eligible.length / 2) + 1;
    // Ouvir alguém (até o anfitrião em segundo plano) prova que não sou eu quem está sem rede.
    const linked = session.online() && (away || session.linked().some((id) => id !== host) || ids.some((id) => id !== this.me));
    if (!linked || ids.length < majority) {
      // Ninguém me ouve (eu sem rede, ou sobrei sozinho, como no X1), ou os que ouço não fazem maioria (os
      // outros sumiram junto com o anfitrião, ou quem caiu fui eu): só bem depois, com a sinalização no ar
      // e cada um que falta sumido há tanto quanto; aí a maioria é a dos que eu ouço.
      if (!session.signalingUp() || now - heard < LONE_CLAIM_MS) return;
      const missing = eligible.filter((member) => !alive(member.playerId));
      if (missing.some((member) => now - (this.lastOk.get(member.playerId) ?? this.startedAt) < LONE_CLAIM_MS)) return;
      majority = Math.floor(ids.length / 2) + 1;
    }
    const okOf = (playerId: string): string[] => {
      if (playerId === this.me) return ids.filter((id) => id === this.me || session.direct(id));
      const probe = session as unknown as { okListOf?: (id: string) => string[] | null };
      const listed = probe.okListOf?.(playerId);
      if (listed) return ids.filter((id) => id === playerId || listed.includes(id));
      // Sem a lista dele: se eu o ouço direto, ele vê pelo menos o que eu vejo.
      return session.direct(playerId) ? ids.filter((id) => id === this.me || id === playerId || session.direct(id)) : [playerId];
    };
    const candidate = present.find((member) => okOf(member.playerId).length >= majority);
    if (candidate?.playerId !== this.me) return;
    this.claim(lost ? "lost" : "away");
  }

  /** Janela do veto: HOST_VETO_FRESH_MS + 2 × o maior RTT dos ligados + folga. */
  private vetoWindowMs(): number {
    const session = this.session;
    let rtt = 0;
    for (const id of session?.linked() ?? []) rtt = Math.max(rtt, session?.rttOf(id) ?? 0);
    return T.HOST_VETO_FRESH_MS + 2 * rtt + VETO_SLACK_MS;
  }

  /** Reivindicação que chegou bem depois de feita (a rede voltou e o outbox entregou): ninguém mais a veta. */
  private claimStale(from: string, claimed: RoomSnapshot): boolean {
    const offset = this.session?.clockOffset(from) ?? null;
    if (offset === null || !Number.isFinite(offset)) return false;
    const age = this.wallNow() - (claimed.hostNow + offset);
    return age > T.HOST_VETO_FRESH_MS + 2 * (this.session?.rttOf(from) ?? 0) + VETO_SLACK_MS;
  }

  private claim(why: "lost" | "away" = "lost"): void {
    const snapshot = this.snapshot;
    const session = this.session;
    if (!snapshot || !session) return;
    const oldHost = snapshot.hostId;
    // Horas do anfitrião velho → as minhas (offset do heartbeat dele).
    const offset = session.clockOffset(oldHost) ?? this.snapshotAt - snapshot.hostNow;
    const shift = (time: number | null) => (time === null ? null : time + offset);
    const draft = clone(snapshot);
    draft.epoch = snapshot.epoch + 1;
    draft.version = snapshot.version + 1;
    draft.hostId = this.me;
    draft.hostNow = this.wallNow();
    const previous = draft.members.find((member) => member.playerId === oldHost);
    if (previous) previous.presence = "offline";
    for (const match of draft.bracket?.matches ?? []) {
      match.readyDeadline = shift(match.readyDeadline);
      match.holdUntil = shift(match.holdUntil);
      match.startedAt = shift(match.startedAt);
      if (match.sealed) {
        match.sealed = { ...match.sealed, startedAt: match.sealed.startedAt + offset, revealAt: match.sealed.revealAt + offset };
      }
      if (match.result && match.status === "done") match.result = { ...match.result, at: match.result.at + offset };
    }
    this.myClaim = { epoch: draft.epoch, before: snapshot, at: this.clock.now() };
    this.snapshot = draft;
    this.snapshotAt = draft.hostNow;
    this.lineage = `${draft.epoch}|${this.me}`;
    this.hostPools.clear(); // o anfitrião novo começa a contar agora
    this.concessions.clear();
    this.doubleReports.clear();
    // O room:snap da época nova (e o aviso) só saem depois da janela do veto: quem vetar nunca fica
    // preso numa linhagem que eu desfiz (o host:claim leva o snapshot a quem aceita).
    this.claimHoldUntil = this.clock.now() + this.vetoWindowMs();
    const body: ClaimBody = { snapshot: draft, why };
    session.broadcast("host:claim", body);
    const oldName = previous?.nickname ?? "O anfitrião";
    this.claimToast = `${oldName} saiu. ${this.nickname} agora é o anfitrião.`;
    this.replayFacts();
    this.afterSnapshot(snapshot);
    this.persist();
    this.hostAdvance();
    this.changed();
  }

  private onClaim(from: string, claimed: RoomSnapshot, why: "lost" | "away"): void {
    const current = this.snapshot;
    const session = this.session;
    if (!current || !session || this.phase !== "in-room") return;
    // Só um jogador da sala (nunca um removido), na época seguinte ou no desempate da mesma.
    if (!this.lineageOk(from, claimed, current) || !newer(claimed, current)) return;
    const host = current.hostId;
    // Ainda ouço o anfitrião atual: veto. Em segundo plano ("away") só quem o vê em primeiro plano veta;
    // o próprio anfitrião escondido não. Uma reivindicação que chegou tarde (rede que voltou) não se veta:
    // a janela de quem reivindicou já passou e ela vale para todos.
    if (host !== from && claimed.epoch === current.epoch + 1 && !this.claimStale(from, claimed)) {
      const stillThere = host === this.me
        ? this.isHost() && !(why === "away" && this.hidden)
        : why === "away" ? session.health(host) === "ok" : this.hostHeard(host);
      if (stillThere) {
        session.send(from, "host:veto", { epoch: current.epoch, hostId: host });
        if (host === this.me) this.change(() => {}); // republica: quem aceitou volta para cá
        return;
      }
    }
    // Reivindicação que chegou tarde ao anfitrião vivo: ele fica com a linhagem dele se a sala esteve com
    // ele enquanto o reivindicador sumia (quem caiu foi o outro); veta mesmo fora da janela.
    if (host === this.me && claimed.epoch === current.epoch + 1 && this.keepsLineage(from, claimed, this.claimWallTime(from, claimed))) {
      this.vetoLate(from);
      return;
    }
    if (this.myClaim && current.hostId === this.me) {
      // Perdi o desempate (ou o meu posto acabou): a janela e o aviso da minha reivindicação caem.
      this.myClaim = null;
      this.claimHoldUntil = null;
      this.claimToast = null;
    }
    this.beforeClaim = { claimant: from, snapshot: current };
    this.adopt(claimed, true, true);
    if (this.disposed) return; // o snapshot novo me lista como banido
    if (this.snapshot !== claimed) return; // não adotou (ex.: me baniria com o anfitrião ainda aqui)
    const name = claimed.members.find((member) => member.playerId === host)?.nickname ?? "O anfitrião";
    const newName = claimed.members.find((member) => member.playerId === from)?.nickname ?? "Alguém";
    this.toast(`${name} saiu. ${newName} agora é o anfitrião.`, true);
  }

  private onVeto(from: string, data: Record<string, unknown>): void {
    const snapshot = this.snapshot;
    const session = this.session;
    if (!snapshot || !session || typeof data.epoch !== "number" || typeof data.hostId !== "string") return;
    if (this.myClaim && snapshot.hostId === this.me && snapshot.epoch === this.myClaim.epoch) {
      // Veto de verdade: sobre o anfitrião de que eu saí, dentro da janela, e ele ainda é ouvido (ou é
      // ele mesmo vetando). Um veto que chega depois da janela é de quem recebeu a reivindicação tarde
      // (rede que voltou): ele adota o meu room:snap; um aviso velho repassado também não derruba a minha.
      const before = this.myClaim.before;
      const vetoed = data.hostId;
      if (vetoed !== before.hostId) return;
      // Fora da janela, só o próprio anfitrião vetado desfaz (ele ficou com a sala enquanto eu sumia).
      const late = this.clock.now() - this.myClaim.at > T.HOST_VETO_FRESH_MS + 2 * (session.rttOf(from) ?? 0) + VETO_SLACK_MS;
      if (late && from !== vetoed) return;
      if (from !== vetoed && !this.hostHeard(vetoed)) return;
      // A minha reivindicação foi vetada: volto a membro da linhagem antiga, aviso quem aceitou e espero
      // mais a cada veto antes de tentar de novo.
      this.myClaim = null;
      this.claimHoldUntil = null;
      this.claimToast = null;
      this.claimBackoffMs = Math.min(CLAIM_BACKOFF_MAX_MS, this.claimBackoffMs ? this.claimBackoffMs * 2 : CLAIM_BACKOFF_MS);
      this.lastClaimAt = this.clock.now() + this.claimBackoffMs;
      this.snapshot = before;
      this.lineage = `${before.epoch}|${before.hostId}`;
      session.broadcast("host:veto", { epoch: before.epoch, hostId: before.hostId });
      this.afterSnapshot(snapshot);
      this.replayFacts(); // o que fechou na linhagem desfeita volta ao anfitrião de verdade
      this.persist();
      this.probeHost(null); // o snapshot dele de agora (o meu `before` é o da hora da reivindicação)
      this.changed();
      return;
    }
    if (this.beforeClaim && this.beforeClaim.claimant === from && snapshot.hostId === from && data.hostId === this.beforeClaim.snapshot.hostId) {
      const before = this.beforeClaim.snapshot;
      this.beforeClaim = null;
      this.snapshot = before;
      this.lineage = `${before.epoch}|${before.hostId}`;
      this.session?.setRoster(this.rosterOf(before));
      this.afterSnapshot(snapshot);
      this.replayFacts();
      this.persist();
      if (before.hostId !== this.me) this.probeHost(null);
      this.changed();
    }
  }

  /** A hora (parede, minha) em que a reivindicação foi feita, pelo offset do heartbeat de quem a fez. */
  private claimWallTime(from: string, claimed: RoomSnapshot): number | null {
    const offset = this.session?.clockOffset(from) ?? null;
    return offset !== null && Number.isFinite(offset) ? claimed.hostNow + offset : null;
  }

  /**
   * Sou o anfitrião vivo (página visível desde antes) e chega a linhagem época+1 de quem reivindicou sem
   * me ouvir (tarde, ou só pelo room:snap): fico com a minha se a sala esteve comigo enquanto ele sumia.
   * Com mais jogadores: eu e quem ouvi sem parar desde antes da reivindicação somos a maioria dos que
   * estavam na sala (quem sumiu bem antes dele não conta). Só nós dois: a minha linhagem fechou
   * resultados que a dele não tem (sem como saber quem caiu, o anfitrião fica com a sala, como antes).
   */
  private keepsLineage(from: string, claimed: RoomSnapshot, claimWall: number | null): boolean {
    const current = this.snapshot;
    if (!current || current.hostId !== this.me || !this.isHost() || this.hidden) return false;
    const now = this.clock.now();
    const lostAt = this.lostAt.get(from) ?? null;
    // A hora da reivindicação no meu relógio; sem ela (só o room:snap), quando ele sumiu para mim.
    const claimAt = claimWall !== null ? now - (this.wallNow() - claimWall) : lostAt ?? now;
    // Desde quando ele sumiu (uma queda bem anterior à reivindicação é outro episódio).
    const missingAt = lostAt !== null && lostAt >= claimAt - 2 * LONE_CLAIM_MS ? Math.min(lostAt, claimAt) : claimAt;
    if (this.visibleSince > missingAt) return false;
    const others = current.members.filter((member) => member.role === "player" && !member.left && member.playerId !== this.me
      && member.playerId !== from && !current.banned.includes(member.playerId));
    let total = 2;
    let partition = 1;
    for (const member of others) {
      const since = this.heardSince.get(member.playerId);
      if (since !== undefined && since <= claimAt) {
        partition += 1;
        total += 1;
        continue;
      }
      const gone = this.lostAt.get(member.playerId);
      const goneBefore = gone !== undefined && gone < missingAt - T.HOST_CLAIM_LOST_MS;
      if (!goneBefore) total += 1;
    }
    if (total > 2) return partition * 2 > total;
    return this.resultsBeyond(current, claimed);
  }

  /** A minha linhagem fechou um resultado que a outra não tem (ou tem outro). */
  private resultsBeyond(mine: RoomSnapshot, theirs: RoomSnapshot): boolean {
    for (const match of mine.bracket?.matches ?? []) {
      if (match.status !== "done" || !match.result || match.kind === "bye") continue;
      const other = theirs.bracket ? matchById(theirs.bracket, match.id) : null;
      if (!other || other.status !== "done" || other.result?.matchId !== match.result.matchId || other.result.resultHash !== match.result.resultHash) return true;
    }
    return false;
  }

  /** Anfitrião que ficou com a linhagem: veto ao reivindicador (aceito fora da janela) e o snapshot de agora a todos. */
  private vetoLate(from: string): void {
    const current = this.snapshot;
    if (!current) return;
    const now = this.clock.now();
    if (now - (this.lateVetoAt.get(from) ?? Number.NEGATIVE_INFINITY) < LATE_VETO_EVERY_MS) return;
    this.lateVetoAt.set(from, now);
    this.session?.send(from, "host:veto", { epoch: current.epoch, hostId: this.me });
    this.change(() => {});
  }

  /** Anfitrião voltando de um reload: junta as cópias dos membros nos primeiros 5 s (§4.7). */
  private onStateReply(from: string, snapshot: RoomSnapshot, teams: RoomTeams, facts: ResultFact[]): void {
    const current = this.snapshot;
    if (!current || this.resumeUntil === null || snapshot.code !== current.code) return;
    // Só de quem é da sala; os times conferem com o hash e os fatos com a forma de um resultado.
    if (!current.members.some((member) => member.playerId === from)) return;
    this.acceptTeams(teams, false);
    this.facts = mergeFacts(this.facts, facts.filter(isFact));
    if (!newer(snapshot, current)) return;
    if (snapshot.hostId !== this.me) {
      if (!this.isPlayerMember(current, snapshot.hostId)) return;
      // Outra linhagem assumiu enquanto eu estava fora: viro membro dela.
      this.resumeUntil = null;
      this.snapshot = snapshot;
      this.snapshotAt = this.wallNow();
      this.lineage = `${snapshot.epoch}|${snapshot.hostId}`;
      this.session?.setRoster(this.rosterOf(snapshot));
      this.sendJoin(snapshot.hostId);
      this.replayFacts();
      this.afterSnapshot(current);
      this.persist();
      return;
    }
    this.snapshot = { ...snapshot, version: snapshot.version + 1 };
    void from;
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
        console.error("[bobonline] sala (tick)", error);
      }
      this.scheduleTick();
    }, TICK_MS);
  }

  private tick(): void {
    const now = this.clock.now();
    const session = this.session;
    if (!session) return;
    if (session.signalingUp()) this.everSignaled = true;
    for (const [playerId, health] of Object.entries(this.health)) {
      if (health === "ok") this.lastOk.set(playerId, now);
      this.trackHeard(playerId, health);
    }

    if (this.phase === "connecting") this.connectingTick(now);
    if (this.phase !== "in-room") return;
    this.lingerTick(now);
    if (this.mode === "resume" && !this.confirmed && now - this.startedAt >= T.JOIN_TIMEOUT_MS) {
      // Voltei para uma sala que ninguém mais tem aberta.
      this.fail(this.everSignaled ? "nao-encontrada" : "sem-rede");
      void this.shutdown("error");
      return;
    }
    if (this.resumeUntil !== null && now >= this.resumeUntil) {
      this.resumeUntil = null;
      if (this.snapshot?.hostId === this.me) {
        this.change(() => {});
        this.replayFacts();
      }
    }
    if (this.claimHoldUntil !== null && now >= this.claimHoldUntil) {
      // A janela do veto passou sem veto: a época nova é minha; o snapshot e o aviso saem agora.
      this.claimHoldUntil = null;
      this.claimBackoffMs = 0;
      if (this.isHost()) {
        this.broadcastSnap();
        if (this.claimToast) this.toast(this.claimToast, true);
      }
      this.claimToast = null;
    }
    if (this.isHost()) {
      if (now - this.lastPresenceAt >= PRESENCE_EVERY_MS) {
        this.lastPresenceAt = now;
        this.hostPresence();
      }
      this.hostAdvance();
      this.toLobbyTick(now);
      if (now - this.liveCpuAt >= T.LIVE_EVERY_MS) {
        this.liveCpuAt = now;
        this.cpuLive();
      }
    } else {
      this.toLobbyAt = null;
      // Sondagem sem resposta: o meu anfitrião já não hospeda; quem mandou a linhagem nova a manda de novo.
      const probe = this.hostProbe;
      if (probe?.newer && this.probeExpired(probe.hostId)) {
        const newer = probe.newer;
        probe.newer = null;
        this.sendJoin(newer);
      }
      if (now - this.lastClaimAt >= CLAIM_EVERY_MS) {
        this.lastClaimAt = now;
        this.claimTick();
      }
    }
    if (this.phase === "in-room" && this.resumeUntil === null) this.resendPending();
    this.pruneBuffers(now);
  }

  private connectingTick(now: number): void {
    const elapsed = now - this.startedAt;
    if (this.mode === "create") {
      if (this.session?.signalingUp()) {
        this.phase = "in-room";
        this.saveSessionNow();
        this.persist();
        // Sozinho na sala nenhum evento da sessão redesenha: sem isto a tela ficava em "Abrindo a sala…".
        this.changed();
      } else if (elapsed >= T.OPEN_TIMEOUT_MS) {
        this.fail("abrir");
        void this.shutdown("error");
      }
      return;
    }
    if (this.deferredAnswers.length && !this.waitingLinkHost(now)) {
      // Fora do onMessage ninguém redesenha: sem o changed() a tela ficava em "Procurando a sala…".
      this.releaseDeferredAnswers();
      this.changed();
      if (this.phase !== "connecting") return;
    }
    if (this.applyPendingReject(now)) return;
    const stages = T.JOIN_STAGES_MS;
    const stage = elapsed >= stages[1] ? 2 : elapsed >= stages[0] ? 1 : 0;
    if (stage !== this.joinStage) {
      this.joinStage = stage;
      this.changed();
    }
    if (this.joinErrorAt !== null && now - this.joinErrorAt >= JOIN_ERROR_GRACE_MS) {
      this.fail("conexao");
      void this.shutdown("error");
      return;
    }
    if (elapsed >= T.JOIN_TIMEOUT_MS) {
      const newer = (this.netConfig.latestProtocol ?? BOB_PROTOCOL) > BOB_PROTOCOL;
      this.fail(newer ? "versao-nova" : this.everSignaled ? "nao-encontrada" : "sem-rede");
      void this.shutdown("error");
    }
  }

  /** Presença de cada membro no snapshot (visão do anfitrião), no máximo uma publicação por segundo. */
  private hostPresence(): void {
    const snapshot = this.snapshot;
    const session = this.session;
    if (!snapshot || !session) return;
    const changes: Array<[string, RoomMember["presence"]]> = [];
    for (const member of snapshot.members) {
      if (member.playerId === this.me || member.left) continue;
      const presence = presenceOf(session.health(member.playerId));
      if (presence !== member.presence) changes.push([member.playerId, presence]);
    }
    const self = snapshot.members.find((member) => member.playerId === this.me);
    const own: RoomMember["presence"] = this.hidden ? "away" : "online";
    if (self && self.presence !== own && !self.left) changes.push([this.me, own]);
    // Espectador que fechou a aba (sem room:leave) sai da lista depois de SPECTATOR_DROP_MS sem sinal.
    const now = this.clock.now();
    const dropped: string[] = [];
    for (const member of snapshot.members) {
      if (member.role !== "spectator" || member.left) continue;
      const since = this.spectatorSince.get(member.playerId) ?? now;
      this.spectatorSince.set(member.playerId, since);
      const lastSeen = Math.max(since, this.lastOk.get(member.playerId) ?? Number.NEGATIVE_INFINITY);
      if (session.health(member.playerId) === "lost" && now - lastSeen >= SPECTATOR_DROP_MS) dropped.push(member.playerId);
    }
    if (!changes.length && !dropped.length) return;
    this.change((draft) => {
      for (const [playerId, presence] of changes) {
        const member = draft.members.find((entry) => entry.playerId === playerId);
        if (member) member.presence = presence;
      }
      if (dropped.length) draft.members = draft.members.filter((member) => !dropped.includes(member.playerId));
    });
    for (const playerId of dropped) this.spectatorSince.delete(playerId);
  }

  private pruneBuffers(now: number): void {
    for (const [matchId, list] of this.buffers) {
      const kept = list.filter((entry) => now - entry.at <= T.MATCH_BUFFER_MS);
      if (kept.length) this.buffers.set(matchId, kept);
      else this.buffers.delete(matchId);
    }
  }

  // =========================================================================
  // Derivados para a tela
  // =========================================================================

  private nextMatch(): RoomClientState["nextMatch"] {
    const snapshot = this.snapshot;
    if (!snapshot?.bracket || snapshot.stage !== "running") return null;
    const match = nextMatchFor(snapshot.bracket, this.me);
    if (!match || (match.status !== "waiting" && match.status !== "ready-check") || !match.home || !match.away) return null;
    const opponent = match.home.entrantId === this.me ? match.away.entrantId : match.home.entrantId;
    return {
      bracketId: match.id,
      opponent: isCpu(opponent) ? "cpu" : opponent,
      readyDeadlineLocal: match.readyDeadline === null ? null : this.toLocal(match.readyDeadline),
      holdUntilLocal: match.holdUntil === null ? null : this.toLocal(match.holdUntil),
    };
  }

  private rematchState(): RoomClientState["rematch"] {
    const snapshot = this.snapshot;
    if (!snapshot || snapshot.settings.format !== "x1") return null;
    const final = snapshot.bracket?.matches[0];
    if (!final || final.status !== "done" || (final.home?.entrantId !== this.me && final.away?.entrantId !== this.me)) return null;
    const want = snapshot.rematch?.want ?? [];
    return { mine: want.includes(this.me), theirs: want.some((id) => id !== this.me) };
  }

  private inMyMatch(playerId: string): boolean {
    const match = this.snapshot?.bracket?.matches.find((entry) => entry.status === "playing"
      && (entry.home?.entrantId === this.me || entry.away?.entrantId === this.me));
    return !!match && (match.home?.entrantId === playerId || match.away?.entrantId === playerId);
  }

  private isMatchPlayer(playerId: string): boolean {
    const final = this.snapshot?.bracket?.matches[0];
    return !!final && (final.home?.entrantId === playerId || final.away?.entrantId === playerId);
  }

  private toast(text: string, deferred: boolean): void {
    this.toastSeq += 1;
    this.toasts = [...this.toasts, { id: this.toastSeq, text, deferred }].slice(-MAX_TOASTS);
    this.changed();
  }

  // =========================================================================
  // Persistência, fim
  // =========================================================================

  private persist(): void {
    const snapshot = this.snapshot;
    if (!snapshot || this.phase === "left" || this.phase === "error") return;
    // Só os times que a sala usa vão para o localStorage (a cota é a mesma dos saves do Futbobo).
    const teams: RoomTeams = {};
    for (const hash of this.referencedHashes(snapshot)) teams[hash] = this.teams[hash];
    const room: PersistedRoom = { v: 1, code: snapshot.code, snapshot, teams, facts: this.facts, savedAt: this.wallNow() };
    this.ownsSaved = true;
    try {
      this.roomStore.save(room);
    } catch {
      // Cota estourada: a sala vive nos outros aparelhos.
    }
  }

  private saveSessionNow(): void {
    if (this.phase !== "in-room" || !this.snapshot) return;
    const session: SavedSession = {
      code: this.snapshot.code,
      ...(this.password ? { password: this.password } : {}),
      isHost: this.snapshot.hostId === this.me,
      epoch: this.snapshot.epoch,
      savedAt: this.wallNow(),
    };
    this.ownsSaved = true;
    (this.deps.saveSession ?? saveSavedSession)(session);
  }

  /**
   * Apaga a sessão salva e a sala guardada, só se forem desta sala: quem cancela a busca de outra
   * sala (ou é recusado nela) não perde o "Voltar para a sala" da que já tinha.
   */
  private forgetRoom(): void {
    if (!this.ownsSaved) return;
    (this.deps.clearSession ?? clearSavedSession)();
    this.roomStore.clear();
  }

  private fail(error: JoinError): void {
    this.error = error;
    this.phase = "error";
    this.changed();
  }

  /**
   * Para tudo. `linger`: a sessão ainda fica aberta até o outbox para esses jogadores esvaziar
   * (no máximo 1 s), para o room:leave/último snapshot sair; a tela não espera por isso.
   */
  private async shutdown(phase: RoomClientState["phase"], linger: string[] = []): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (phase !== "error" || this.phase !== "error") this.phase = phase;
    if (this.tickHandle !== null) this.clock.clearTimeout(this.tickHandle);
    this.tickHandle = null;
    this.lifecycle?.dispose();
    this.offPagehide?.();
    this.disposeDuel();
    this.changed();
    const session = this.session;
    if (!session) return;
    if (!linger.length) {
      await session.leave();
      return;
    }
    let waited = 0;
    const poll = () => {
      if (waited >= 1000 || linger.every((playerId) => session.pending(playerId) === 0)) {
        void session.leave();
        return;
      }
      waited += 100;
      this.clock.setTimeout(poll, 100);
    };
    poll();
  }

  private changed(): void {
    this.stateValue = null;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("[bobonline] ouvinte da sala", error);
      }
    }
  }

}

/** Dev (`?grace=10` com perfil de teste): reserva curta para o E2E. */
function devGrace(): number | null {
  if (devProfile() === null) return null;
  try {
    const value = Number(new URLSearchParams(window.location.search).get("grace"));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

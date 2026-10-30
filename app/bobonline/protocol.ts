// Protocolo do Bobonline (B2): constantes do fio e o catálogo de mensagens.
//
// T0: constantes do §3.2 e os tipos das mensagens do §3.6. A lógica (sessão,
// sala, partida) entra no L5. Só imports de tipo: este arquivo não puxa o motor.

import type { DuelAction, DuelPresentation } from "../botao/match-link";
import type { SerializedMatch } from "../botao/match-codec";
import type { BotaoMatchSetup, BotaoSide } from "../botao/types";
import type { ResultFact } from "./room/room-api";
import type { BobTeam, BracketResult, LiveInfo, RoomSnapshot, RoomTeams } from "./types";

// ---------------------------------------------------------------------------
// Constantes (§3.2)
// ---------------------------------------------------------------------------

export const BOB_PROTOCOL = 1;                      // sobe em qualquer mudança incompatível de mensagens/regras online
/** Namespace do Trystero. Só muda quando o FIO do Trystero quebra (troca de versão da lib). Mudou? suba minProtocol/latestProtocol no net.json no mesmo release. */
export const APP_ID = "futbobo-bobonline-w1";
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 símbolos: sem 0 1 I L O
export const T = {
  HEARTBEAT_MS: 1000, UNSTABLE_MS: 3000, LOST_MS: 8000,
  RELAY_AFTER_MS: 4000, RELAY_CAP_BYTES_PER_S: 65536,
  RETRANSMIT_MIN_MS: 800, RETRANSMIT_MAX_MS: 5000, REORDER_WINDOW: 64, RETRANSMIT_BURST: 16,
  JOIN_TIMEOUT_MS: 45000, JOIN_STAGES_MS: [12000, 25000], OPEN_TIMEOUT_MS: 8000,
  HOST_CLAIM_LOST_MS: 10000, HOST_CLAIM_AWAY_LOBBY_MS: 120000, HOST_CLAIM_AWAY_RUNNING_MS: 30000, HOST_VETO_FRESH_MS: 3000,
  RESUME_SIGNALING_CHECK_MS: 3000, REJOIN_AFTER_RESUME_MS: 6000, RELOAD_AFTER_FAILED_REJOIN_MS: 15000, REJOIN_RETRY_MS: 20000,
  SESSION_TTL_MS: 30 * 60_000, ROOM_STATE_TTL_MS: 6 * 3600_000, CHECKPOINT_TTL_MS: 2 * 3600_000, CHECKPOINTS_KEPT: 3,
  OUTBOX_CAP: 512, MAX_FRAME_BYTES: 16000, CHUNK_PART_BYTES: 6000, MAX_MESSAGE_CHARS: 262144,
  GRACE_POOL_S: 90, DOUBLE_ABSENT_S: 180, WO_EVIDENCE_MS: 10000,
  READY_CHECK_S: 20, RESULT_HOLD_S: 30,
  IDLE_CLAIM_SLACK_S: 4, IDLE_CLAIM_HARD_S: 17, KICK_CLAIM_SLACK_S: 4, KICK_CLAIM_HARD_S: 20,
  AUTHORITY_STALL_S: 13, RESUME_TIMER_FLOOR_S: 3,
  PENALTY_ORDER_PICK_S: 10, PENALTY_ORDER_DEADLINE_MS: 14000,
  SETUP_RESEND_MS: 3000, MATCH_BUFFER_MS: 10000,
  CPU_REVEAL_MS: 60000, CPU_REVEAL_WAITING_MS: 8000,
  AIM_PREVIEW_MS: 100, LIVE_EVERY_MS: 5000, PROGRESS_EVERY_MS: 250, TIMER_CHECKPOINT_MS: 1000,
} as const;

/** Um servidor TURN, no formato de `NetConfig.turn` (§3.5): anexado ao STUN padrão. */
export type TurnServer = { urls: string | string[]; username?: string; credential?: string };
/**
 * TURN: só o encaixe. Vazio de propósito no T0; o B2 liga as credenciais depois
 * (via net.json / NetConfig.turn), e até lá o Trystero usa só o STUN padrão.
 */
export const TURN_SERVERS: readonly TurnServer[] = [];

// ---------------------------------------------------------------------------
// Tipos do fio que a sala também usa (§3.3). No T0 moram aqui; net/session.ts
// (B2) pode trazê-los para lá e reexportar daqui.
// ---------------------------------------------------------------------------

export type PeerHealth = "ok" | "unstable" | "away" | "lost";
export type HelloInfo = {
  proto: number;        // BOB_PROTOCOL
  engine: number;       // BOTAO_ENGINE_REV
  celebrations: number; // CELEBRATION_OPTIONS.length
  app: string;          // FUTBOBO_VERSION, só informativo
};
/** Progresso da partida que viaja em todo heartbeat (o aperto de mão se repete sozinho). */
export type MatchProgress = {
  matchId: string;
  n: number;            // próxima ação que este aparelho vai aplicar
  restN: number;        // último descanso reportado
  h: string;            // hash desse descanso
  se: number;           // syncEpoch conhecido
  opened: number | null;        // n do turno aberto e acionável aqui (turnOpened), se houver
  own: { idleLeft: number; kickLeft: number | null } | null; // timers do dono, quando ESTE aparelho é o dono do turno
};

// ---------------------------------------------------------------------------
// Catálogo de mensagens (§3.6). R = confiável, L = perde-se sem drama.
// Horários terminados em `At` são relógio do anfitrião.
// ---------------------------------------------------------------------------

/** Corpo vazio (`{}` no fio). */
export type EmptyBody = Record<string, never>;

export type RoomRejectReason = "cheia" | "senha" | "senha-errada" | "iniciada" | "removido" | "time" | "versao" | "outra-aba";

/** Camada de sessão (§3.3). */
export type SessionBodies = {
  /** L. `sig` assina `bobonline|hello|${roomCode}|${playerId}|${inc}|${peer}|${transport.selfId()}`. */
  hello: { info: HelloInfo; playerId: string; inc: number; pub: string; sig: string };
  /** L. */
  hb: { now: number; echo: { now: number; held: number } | null; vis: "fg" | "bg"; ok: string[]; m: MatchProgress | null };
  /** L (enviado duas vezes, 150 ms de intervalo). */
  away: EmptyBody;
  /** L (enviado duas vezes, 150 ms de intervalo). */
  back: EmptyBody;
  /** L. */
  bye: { reason: "outra-aba" };
  /** R. Pedaço de uma mensagem confiável maior que MAX_FRAME_BYTES. */
  chunk: { id: string; i: number; n: number; part: string };
  /** Repasse: o corpo é o quadro interno inteiro (string assinada); o `to` vai no quadro externo. */
  fwd: string;
  /** L. Próximo seq depois de um estouro de outbox. */
  rst: { s: number };
};

/** Sala e torneio. */
export type RoomBodies = {
  /** R, convidado→anfitrião. A identidade vem do hello vinculado. */
  "room:join": { nickname: string; team: BobTeam; passwordProof?: string; asSpectator?: boolean; resume?: boolean };
  /** R, anfitrião→convidado. */
  "room:welcome": { snapshot: RoomSnapshot; teams: RoomTeams };
  /** R, anfitrião→convidado. */
  "room:reject": { reason: RoomRejectReason };
  /** R, anfitrião→todos (≈4 KB; times por hash). */
  "room:snap": { snapshot: RoomSnapshot };
  /** R, anfitrião→par (no vínculo e quando aparece um hash novo). */
  "room:teams": { teams: RoomTeams };
  /** R, membro→anfitrião (só no lobby). */
  "room:update": { ready?: boolean; nickname?: string; team?: BobTeam };
  /** R, membro→anfitrião. */
  "room:leave": EmptyBody;
  /** R, anfitrião→membro. */
  "room:kick": EmptyBody;
  /** R, jogador do X1→anfitrião ("Voltar à sala"). */
  "room:to-lobby": EmptyBody;
  /** R, anfitrião que voltou→membros. */
  "room:state-req": EmptyBody;
  /** R, membro→anfitrião que voltou. */
  "room:state": { snapshot: RoomSnapshot; teams: RoomTeams; facts: ResultFact[] };
  /** R, candidato→todos (epoch+1). */
  "host:claim": { snapshot: RoomSnapshot };
  /** R, membro→candidato (ainda ouço o anfitrião atual). */
  "host:veto": { epoch: number; hostId: string };
  /** R, jogador→anfitrião. */
  "match:ready": { bracketId: string };
  /** R, jogador→anfitrião: saiu da tela de resultado (bracketId da partida anterior). */
  "match:free": { bracketId: string };
  /** R, autoridade (e seguidor)→anfitrião. */
  "match:report": { bracketId: string; matchId: string; result: BracketResult; replay?: true };
  /** R, jogador presente→anfitrião. */
  "match:wo": { bracketId: string; matchId: string; absent: string; kind: "timeout" | "stall" };
  /** R, jogador→anfitrião e adversário. */
  "match:forfeit": { bracketId: string; matchId: string };
  /** R, jogador do X1→anfitrião. */
  rematch: { want: boolean };
  /** L, autoridade→todos (em todo descanso e a cada 5 s jogando). */
  live: LiveInfo;
};

/** Uma partida (§5). */
export type MatchBodies = {
  /** R, autoridade→seguidor (reenviado a cada SETUP_RESEND_MS até o m:ready). */
  "m:setup": { matchId: string; bracketId: string; setup: BotaoMatchSetup; sides: Record<BotaoSide, string>; names: Record<BotaoSide, string> };
  /** R, seguidor→autoridade. `h0` = hashMatch(createMatch(setup)). */
  "m:ready": { matchId: string; h0: string; restoredN?: number };
  /** R, autoridade→seguidor. */
  "m:go": { matchId: string };
  /** R, quem escreve→par(es) (§5.2). */
  "m:act": DuelAction;
  /** R, autoridade→seguidor e espectadores. */
  "m:rest": { matchId: string; n: number; h: string; match: SerializedMatch; pres: DuelPresentation | null };
  /** R, os dois, ao (re)vincular durante a partida. `log` = últimas ≤ 8. */
  "m:hello": { matchId: string; n: number; h: string; restN: number; se: number; log: DuelAction[]; orders: Partial<Record<BotaoSide, string[]>> };
  /** R, qualquer um→o outro. */
  "m:sync-req": { matchId: string; reason: "fork" | "gap" | "stuck" | "hash" | "lost" };
  /** R, autoridade→seguidor/espectador. `log` = ações depois de n. */
  "m:sync": { matchId: string; n: number; se: number; match: SerializedMatch; pres: DuelPresentation | null; log: DuelAction[] };
  /** R, seguidor→autoridade. `match` = lastAuthRest. */
  "m:sync-up": { matchId: string; n: number; match: SerializedMatch; log: DuelAction[] };
  /** R, autoridade→seguidor (os dois começam a contagem de 3 s). */
  "m:resume": { matchId: string; pools: Record<string, number> };
  /** R, jogador→autoridade. */
  "m:order": { matchId: string; side: BotaoSide; order: string[] };
  /** R, seguidor→autoridade (autoridade travada, §5.5). */
  "m:nudge": { matchId: string; n: number };
  /** L, dono→outros. */
  "m:aim":
    | { matchId: string; n: number; bodyId: string; dragX: number; dragY: number; keeperX?: number; keeperDir?: 1 | -1 }
    | { matchId: string; n: number; clear: true };
  /** L, dono→outros. */
  "m:hold": { matchId: string; n: number; holding: boolean };
  /** R, espectador→autoridade. */
  "spec:join": { matchId: string };
  /** R, espectador→autoridade. */
  "spec:leave": { matchId: string };
};

type MessageOf<Bodies> = { [K in keyof Bodies]: { kind: K; body: Bodies[K] } }[keyof Bodies];

export type SessionMsg = MessageOf<SessionBodies>;
export type RoomMsg = MessageOf<RoomBodies>;
export type MatchMsg = MessageOf<MatchBodies>;

export type SessionMsgKind = keyof SessionBodies;
export type RoomMsgKind = keyof RoomBodies;
export type MatchMsgKind = keyof MatchBodies;

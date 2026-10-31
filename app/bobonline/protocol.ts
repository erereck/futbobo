// Protocolo do Bobonline (B2): constantes do fio e o catálogo de mensagens.
//
// Constantes do §3.2 e os tipos das mensagens do §3.6. A sessão (net/session.ts)
// usa os tipos de sessão; sala e partida usam os seus. Só imports de tipo: este
// arquivo não puxa o motor.

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
 * TURN embutido, anexado ao STUN padrão do Trystero. `DEFAULT_NET_CONFIG.turn` copia daqui e o
 * net.json publicado leva a MESMA lista (o teste confere os dois). Vazio = sem chave `turn` nos
 * dois. Ligar ou trocar a credencial: mude aqui E em public/bobonline/net.json no mesmo release
 * (formato: `{ urls: ["turn:host:3478?transport=udp", "turn:host:3478?transport=tcp"], username, credential }`).
 */
export const TURN_SERVERS: readonly TurnServer[] = [
  // ExpressTURN, plano grátis (conta do dono, 2026-10-30). A credencial é pública de propósito: trocar aqui e no net.json se abusarem.
  {
    urls: ["turn:free.expressturn.com:3478?transport=udp", "turn:free.expressturn.com:3478?transport=tcp"],
    username: "000000002108812499",
    credential: "PmTYvjD36PsTI9VsFeN/5uj+mBM=",
  },
];

/** Versão do envelope do fio (`Wire.p`). Diferente de BOB_PROTOCOL, que vai no hello. */
export const WIRE_VERSION = 1;
/** Tipos da camada de sessão: o app nunca manda mensagens com esses nomes. */
export const SESSION_KINDS = ["hello", "hb", "away", "back", "bye", "ack", "chunk", "fwd", "rst"] as const;
/** Tipos que viajam sem confiabilidade (s = 0). O app manda os seus com `sendLossy`. */
export const LOSSY_KINDS = ["hb", "away", "back", "hello", "bye", "ack", "rst", "live", "m:aim", "m:hold"] as const;

// ---------------------------------------------------------------------------
// Tipos do fio que a sala também usa (§3.3). Moram aqui (room-api.ts precisa
// deles sem puxar a sessão); net/session.ts reexporta.
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
  /**
   * L, só direto. Um terceiro responde ao hello de incarnation menor (aba/aparelho mais velho com a
   * mesma identidade). `playerId`/`inc`: de quem é a aba velha e a incarnation mais nova conhecida.
   * Prova: `tp` (id de transporte da aba nova) e `sig` (a assinatura do hello que ela mandou a quem
   * repassa); a aba velha confere com a própria chave o texto do hello `inc`, quem repassa → `tp`.
   */
  bye: { reason: "outra-aba"; playerId: string; inc: number; tp: string; sig: string };
  /** L. Só o ack (`a`) do envelope, quando nada mais vai para esse par logo. */
  ack: EmptyBody;
  /**
   * R. Pedaço de uma mensagem confiável grande demais para um quadro: `kind` é o tipo da
   * mensagem original; as partes juntas são o JSON do corpo.
   */
  chunk: { id: string; i: number; n: number; kind: string; part: string };
  /**
   * Repasse por um terceiro (s = 0, sem ack do repassador). O corpo é o quadro interno inteiro
   * (string, assinado, com `to`); o quadro externo também leva `to`.
   */
  fwd: string;
  /** L. Próximo seq depois de um estouro de outbox. */
  rst: { s: number };
};

/** Sala e torneio. */
export type RoomBodies = {
  /**
   * R, convidado→anfitrião. A identidade vem do hello vinculado. `pub`: a chave do convidado, para o
   * anfitrião que não a tem do hello (só vale se playerIdFor(pub) for o remetente).
   */
  "room:join": { nickname: string; team: BobTeam; passwordProof?: string; asSpectator?: boolean; resume?: boolean; pub?: string };
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
  /**
   * R, autoridade (e seguidor)→anfitrião. `replay` + `sides` (entrantIds [mandante, visitante]): fato de
   * outra linhagem reenviado ao anfitrião novo (§4.7), que só o aceita com os mesmos lados.
   */
  "match:report": { bracketId: string; matchId: string; result: BracketResult; replay?: true; sides?: [string, string] };
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
  /** R, quem escreve→par(es) (§5.2). `matchId` vai junto para descartar ação de outra partida. */
  "m:act": DuelAction & { matchId?: string };
  /** R, autoridade→seguidor e espectadores. */
  "m:rest": { matchId: string; n: number; h: string; match: SerializedMatch; pres: DuelPresentation | null };
  /** R, os dois, ao (re)vincular durante a partida. `log` = últimas ≤ 8. */
  "m:hello": { matchId: string; n: number; h: string; restN: number; se: number; log: DuelAction[]; orders: Partial<Record<BotaoSide, string[]>> };
  /** R, qualquer um→o outro. */
  "m:sync-req": { matchId: string; reason: "fork" | "gap" | "stuck" | "hash" | "lost" };
  /**
   * R, autoridade→seguidor/espectador. `log` = ações depois de n; `why` = o motivo (vira o da diretiva).
   * `full`: transmissão cheia (§4.8), o espectador fica de fora; nesse caso só `matchId` acompanha.
   */
  "m:sync": {
    matchId: string; n: number; se: number; match: SerializedMatch; pres: DuelPresentation | null; log: DuelAction[];
    why?: "hash" | "fork" | "gap" | "stuck" | "lost" | "spectate";
    full?: true;
  };
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

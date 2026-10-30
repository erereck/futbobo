import type { BotaoMatchState } from "./engine";
import type { SerializedMatch } from "./match-codec";
import type { BotaoShot, BotaoSide } from "./types";

export type BotaoSideControl = "local" | "cpu" | "remote";

type ActionBase = { n: number; k: string; se: number };
export type DuelAction =
  | (ActionBase & { kind: "shot"; side: BotaoSide; shot: BotaoShot; clock: number; grace: boolean })
  | (ActionBase & { kind: "idle"; side: BotaoSide; clock: number })
  | (ActionBase & { kind: "expire"; side: BotaoSide })
  | (ActionBase & { kind: "pshot"; side: BotaoSide; shot: BotaoShot; keeperX: number; keeperDir: 1 | -1 })
  | (ActionBase & { kind: "pmiss"; side: BotaoSide })
  | (ActionBase & { kind: "porder"; orders: Record<BotaoSide, string[]> });

export type DuelPresentation = { kind: "goal" | "penalty" | "interval" | "finish"; remainingMs: number };

export type DuelDirective = {
  type: "sync"; n: number; se: number; match: SerializedMatch; pres: DuelPresentation | null;
  reason: "hash" | "fork" | "gap" | "stuck" | "lost" | "spectate";
};

export type DuelBanner =
  | { kind: "unstable"; text: string }
  | { kind: "waiting"; text: string; secondsLeft: number }
  | { kind: "reconnecting"; text: string; secondsLeft: number }
  | { kind: "route"; text: string }
  | { kind: "countdown"; text: string; secondsLeft: number };

export type DuelStatus = {
  /** Relógio do dono, 7 s, limite do pênalti, reivindicações e entrada param. Física e pausas seguem. */
  frozen: boolean;
  banner: DuelBanner | null;
  /** Flash curto do controlador (ex.: "Você ficou fora 0:42 · ainda tem 0:48 nesta partida"). */
  notice: { id: number; text: string } | null;
  /** Segundos de 7 s que o ADVERSÁRIO ainda tem (do heartbeat), para o chip "{apelido}: 3…"; null fora dos últimos 3 s. */
  opponentIdleS: number | null;
};

export type RemoteAim = { bodyId: string; dragX: number; dragY: number; keeperX?: number; keeperDir?: 1 | -1 };

export type DuelLocalProgress = {
  n: number; restN: number; h: string; se: number;
  opened: number | null;
  own: { idleLeft: number; kickLeft: number | null } | null;
};

export interface BotaoMatchLink {
  submit(action: DuelAction): void;
  peek(n: number): DuelAction | null;
  consume(n: number): void;
  /** Ações na fila com índice > n, +1 se o descanso do outro lado estiver mais de 1 à frente. */
  aheadOf(n: number): number;
  reportRest(n: number, state: BotaoMatchState, pres: DuelPresentation | null): void;
  /** O turno n ficou acionável NESTE aparelho (fim das pausas). Conta os timers e as reivindicações. */
  turnOpened(n: number, side: BotaoSide, clock: number, key: string): void;
  reportProgress(p: DuelLocalProgress): void;
  takeDirective(): DuelDirective | null;
  requestSync(reason: "stuck"): void;
  syncEpoch(): number;
  status(): DuelStatus;
  proposePenaltyOrder(side: BotaoSide, order: string[]): void;
  sendAim(aim: RemoteAim | null): void;
  sendHold(holding: boolean): void;
  remoteAim(): RemoteAim | null;
  remoteHolding(): boolean;
  /**
   * Avisa a BotaoMatch para re-renderizar o HUD. Dispara SÓ quando muda status.frozen, o banner, o notice,
   * opponentIdleS, a presença da mira remota (null ↔ mira) ou o hold. Nunca a cada m:aim: o laço lê remoteAim() sozinho.
   */
  subscribe(listener: () => void): () => void;
}

export type BotaoMatchRestore = {
  match: SerializedMatch; n: number; cpuCursor?: number | null;
  timers?: { turnN: number; ownerClock: number; idleLeft: number; kickLeft: number | null } | null;
};
export type BotaoCpuBrain = { seed: number; cursor?: number | null; skill: number };

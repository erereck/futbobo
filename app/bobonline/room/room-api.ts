// API do cliente da sala que as telas (B6) consomem (§3.7). Só tipos.
//
// A classe `BobRoomClient` mora em room/room-controller.ts e implementa `BobRoomClientApi`
// (mais `close()` e, só com perfil de teste, `simulateBackground(ms)`). As fábricas estáticas
// aceitam um segundo argumento opcional de dependências (testes). `DuelLaunch` (§5.1) mora aqui
// para as telas não importarem o controlador; match/duel-controller.ts o reexporta.

import type { BotaoCpuBrain, BotaoMatchLink, BotaoMatchRestore, BotaoSideControl } from "../../botao/match-link";
import type { BotaoMatchSetup, BotaoSide } from "../../botao/types";
import type { HelloInfo, PeerHealth } from "../protocol";
import type { BobTeam, BracketResult, LiveInfo, RoomSettings, RoomSnapshot, RoomTeams } from "../types";

export type JoinError = "nao-encontrada" | "sem-rede" | "conexao" | "cheia" | "senha" | "senha-errada" | "iniciada" | "removido"
  | "time" | "versao" | "versao-nova" | "outra-aba" | "abrir" | "cripto";
export type ResultFact = { bracketId: string; result: BracketResult; sides: [string, string] };
export type RoomClientState = {
  phase: "connecting" | "in-room" | "error" | "left" | "superseded";
  joinStage: 0 | 1 | 2;                                      // copy escalonada da busca (§1.4)
  error: JoinError | null;
  incompatible: { mine: HelloInfo; theirs: HelloInfo; who: "me" | "them"; nickname: string | null } | null;
  snapshot: RoomSnapshot | null; teams: RoomTeams; me: string /* playerId */;
  isHost: boolean; health: Record<string, PeerHealth>;
  live: Record<string /* bracketId */, LiveInfo & { receivedAt: number }>;
  duel: DuelHandle | null;           // a partida que EU estou jogando (ou assistindo) agora
  nextMatch: { bracketId: string; opponent: string | "cpu"; readyDeadlineLocal: number | null; holdUntilLocal: number | null } | null;
  rematch: { mine: boolean; theirs: boolean } | null;
  toasts: Array<{ id: number; text: string; deferred: boolean /* não é da minha partida */ }>;
};
export type DuelHandle = { bracketId: string; matchId: string; launch: DuelLaunch; role: "authority" | "follower" | "spectator" | "solo" };

/** O que a tela da partida passa para a BotaoMatch (§5.1). */
export type DuelLaunch = {
  key: string;                                // = matchId (o índice da revanche já está nele). Sync NUNCA remonta a BotaoMatch.
  matchId: string;
  setup: BotaoMatchSetup;
  controls: Record<BotaoSide, BotaoSideControl>;
  perspective: BotaoSide | "neutral";         // "neutral" = espectador
  names: Record<BotaoSide, string>;           // apelidos; memoizado (mesmo objeto enquanto não muda)
  link: BotaoMatchLink;
  restore?: BotaoMatchRestore;
  cpuBrain?: BotaoCpuBrain;
};

/**
 * Argumentos das fábricas estáticas de `BobRoomClient` (§3.7). O controller ainda
 * acrescenta `transportFactory?: TransportFactory` (só testes), que mora em net/transport.ts.
 */
export type CreateRoomArgs = { team: BobTeam; nickname: string; settings: RoomSettings; password?: string };
/** `hostId`: o anfitrião que veio no link (&h=); procurando a sala, só a resposta dele vale no começo (§3.7). */
export type JoinRoomArgs = { code: string; team: BobTeam; nickname: string; password?: string; asSpectator?: boolean; hostId?: string };
/** Segundo argumento de `BobRoomClient.resume(saved: SavedSession, args)`. */
export type ResumeRoomArgs = { team: BobTeam; nickname: string };

/** Métodos de instância de `BobRoomClient` (§3.7). */
export interface BobRoomClientApi {
  getState(): RoomClientState;                 // imutável por versão (para useSyncExternalStore)
  subscribe(listener: () => void): () => void;
  toLocal(hostTime: number): number;           // relógio do anfitrião → relógio deste aparelho
  setReady(ready: boolean): void;
  setTeam(team: BobTeam): void;                // só no lobby; não mexe no pronto
  setNickname(nickname: string): void;
  hostSetSettings(patch: Partial<Pick<RoomSettings, "rules" | "cpuLevel" | "fillWithCpu" | "allowSpectators">>): void;
  hostKick(playerId: string): void;
  hostStart(): { ok: true } | { ok: false; reason: "faltam-jogadores" | "nao-prontos" };
  hostNewTournament(): void;                   // champion → lobby
  readyForMatch(bracketId: string): void;
  leftResultScreen(bracketId: string): void;   // manda match:free (a tela chama ao sair, ou 30 s depois)
  forfeit(bracketId: string): void;
  wantRematch(want: boolean): void;            // true pede/aceita, false cancela/recusa
  backToLobby(): void;                         // X1: room:to-lobby
  spectate(bracketId: string): void;
  stopSpectating(): void;
  dismissToast(id: number): void;
  leave(): Promise<void>;                      // sai de verdade: W.O. nas próximas, limpa sessão
}

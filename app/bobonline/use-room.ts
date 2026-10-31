// Ponte entre as telas do Bobonline e o cliente da sala (B2, room/room-controller.ts, §3.7).
//
// Um cliente por página, guardado fora dos componentes: trocar de tela (ou abrir o
// editor no meio da sala) nunca derruba a conexão. As telas leem tudo por
// `useRoomView()` (useSyncExternalStore sobre o getState() imutável do cliente) e
// mandam ações chamando o cliente em eventos (`roomClient()?.setReady(true)`).
//
// O controller é carregado com import() na primeira tentativa (criar, entrar ou
// voltar): ele e o Trystero ficam fora do primeiro carregamento do /bobonline.

import { useSyncExternalStore } from "react";
import type { SavedSession } from "./net/identity";
import type {
  BobRoomClientApi,
  CreateRoomArgs,
  DuelHandle,
  JoinError,
  JoinRoomArgs,
  ResumeRoomArgs,
  RoomClientState,
} from "./room/room-api";
import type { HelloInfo } from "./protocol";
import { BOB_RULE_PRESETS } from "./teams/match-setup";
import type { BobTeam, BracketEntrant, BracketMatch, CpuLevel, RoomFormat, RoomMember, RoomSettings, RoomSnapshot } from "./types";

/**
 * O cliente como as telas o usam. Os dois métodos opcionais são pedidos ao B2
 * (ver as notas do B6); sem eles a página segue funcionando, só menos esperta.
 */
export type RoomClient = BobRoomClientApi & {
  /** Fecha a conexão SEM room:leave e sem apagar a sessão salva (aba que perdeu a trava; "Cancelar" da volta automática). */
  close?(): Promise<void>;
  /** Só com devProfile(): o mesmo caminho do pause/resume do Capacitor por `ms` (E2E §11.3, cenário 6). */
  simulateBackground?(ms: number): void;
};

/** As fábricas estáticas de `BobRoomClient` (§3.7). */
export type RoomClientStatics = {
  create(args: CreateRoomArgs): Promise<RoomClient>;
  join(args: JoinRoomArgs): Promise<RoomClient>;
  resume(saved: SavedSession, args: ResumeRoomArgs): Promise<RoomClient>;
};

export type RoomAttempt =
  | { kind: "create"; args: CreateRoomArgs }
  | { kind: "join"; args: JoinRoomArgs }
  | { kind: "resume"; saved: SavedSession; args: ResumeRoomArgs };

export type RoomView = {
  /** O que a página está tentando (ou conseguiu): criar, entrar ou voltar. */
  attempt: RoomAttempt | null;
  attemptId: number;
  /** Date.now() do início da tentativa (barra e textos da busca). */
  startedAt: number;
  /** A fábrica ainda não devolveu o cliente. */
  loading: boolean;
  /** A fábrica rejeitou antes de existir cliente. */
  failure: JoinError | null;
  state: RoomClientState | null;
  /** A última partida que ESTE aparelho jogou (não assistiu) nesta sala: a tela de resultado parte dela. */
  lastPlayed: DuelHandle | null;
};

const JOIN_ERRORS: readonly JoinError[] = [
  "nao-encontrada", "sem-rede", "conexao", "cheia", "senha", "senha-errada", "iniciada", "removido",
  "time", "versao", "versao-nova", "outra-aba", "abrir", "cripto",
];

const EMPTY: RoomView = { attempt: null, attemptId: 0, startedAt: 0, loading: false, failure: null, state: null, lastPlayed: null };

let view: RoomView = EMPTY;
let client: RoomClient | null = null;
let unsubscribeClient: (() => void) | null = null;
let attemptCounter = 0;
/** A rodada (sala + sorteio) em que `view.lastPlayed` foi jogada. */
let lastPlayedRound: string | null = null;
const listeners = new Set<() => void>();

let loader: () => Promise<RoomClientStatics> = async () => {
  const room = await import("./room/room-controller");
  // Atribuição tipada (sem cast): se a classe do B2 sair do contrato do §3.7, o tsc acusa aqui.
  const statics: RoomClientStatics = room.BobRoomClient;
  return statics;
};

/** Troca a fábrica (testes em Node e vitrines de desenvolvimento). */
export function setRoomClientLoader(next: () => Promise<RoomClientStatics>): void {
  loader = next;
}

function emit() {
  for (const listener of [...listeners]) listener();
}

function update(patch: Partial<RoomView>) {
  view = { ...view, ...patch };
  emit();
}

function isJoinError(value: unknown): value is JoinError {
  return typeof value === "string" && (JOIN_ERRORS as readonly string[]).includes(value);
}

function joinErrorOf(error: unknown, attempt: RoomAttempt): JoinError {
  if (isJoinError(error)) return error;
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; reason?: unknown; message?: unknown };
    for (const candidate of [record.code, record.reason, record.message]) if (isJoinError(candidate)) return candidate;
  }
  // Sem código conhecido: criar falhou ao abrir; entrar/voltar não conseguiu nem começar (rede ou pedaço do app).
  return attempt.kind === "create" ? "abrir" : "sem-rede";
}

function sync() {
  if (!client) return;
  const state = client.getState();
  if (state === view.state) return;
  const duel = state.duel;
  const round = roundKeyOf(state.snapshot);
  let lastPlayed = view.lastPlayed;
  if (duel && duel.role !== "spectator") {
    lastPlayed = duel;
    lastPlayedRound = round;
  } else if (lastPlayed && round !== null && round !== lastPlayedRound) {
    // "Novo torneio com a mesma sala": a partida do torneio anterior não volta como resultado deste.
    lastPlayed = null;
  }
  update({ state, lastPlayed });
}

function detach(): RoomClient | null {
  const current = client;
  unsubscribeClient?.();
  unsubscribeClient = null;
  client = null;
  return current;
}

async function start(attempt: RoomAttempt): Promise<void> {
  const previous = detach();
  if (previous) await closeOrDrop(previous);
  const id = ++attemptCounter;
  view = { ...EMPTY, attempt, attemptId: id, startedAt: Date.now(), loading: true };
  emit();
  try {
    const statics = await loader();
    const created = attempt.kind === "create"
      ? await statics.create(attempt.args)
      : attempt.kind === "join"
        ? await statics.join(attempt.args)
        : await statics.resume(attempt.saved, attempt.args);
    if (id !== attemptCounter) {
      // Cancelado (ou trocado por outra tentativa) enquanto a fábrica trabalhava.
      void closeOrDrop(created, attempt.kind !== "resume");
      return;
    }
    client = created;
    unsubscribeClient = created.subscribe(sync);
    view = { ...view, loading: false };
    sync();
    emit();
  } catch (error) {
    if (id !== attemptCounter) return;
    update({ loading: false, failure: joinErrorOf(error, attempt) });
  }
}

async function closeOrDrop(target: RoomClient, leave = false): Promise<void> {
  try {
    if (leave) await target.leave();
    // Outra aba já tomou a sessão: este cliente parou, e o close() gravaria a sala velha por cima da dela.
    else if (target.getState().phase === "superseded") return;
    else if (target.close) await target.close();
  } catch {
    // Já estava fechado.
  }
}

export function createRoom(args: CreateRoomArgs): Promise<void> {
  return start({ kind: "create", args });
}

export function joinRoom(args: JoinRoomArgs): Promise<void> {
  return start({ kind: "join", args });
}

export function resumeRoom(saved: SavedSession, args: ResumeRoomArgs): Promise<void> {
  return start({ kind: "resume", saved, args });
}

/** Repete a última tentativa (botão "Tentar de novo"), com argumentos novos quando vierem. */
export function retryRoom(patch?: Partial<JoinRoomArgs>): Promise<void> {
  const attempt = view.attempt;
  if (!attempt) return Promise.resolve();
  if (attempt.kind === "join" && patch) return start({ kind: "join", args: { ...attempt.args, ...patch } });
  return start(attempt);
}

/** Sai de verdade (room:leave, W.O. nas próximas, sessão apagada) e esquece o cliente. */
export async function leaveRoom(): Promise<void> {
  attemptCounter += 1;
  const current = detach();
  view = { ...EMPTY, attemptId: attemptCounter };
  emit();
  if (current) await closeOrDrop(current, true);
}

/**
 * Larga a sala SEM sair dela: a sessão salva continua valendo (outra aba tomou a
 * trava; "Cancelar" da volta automática). Sem `close()` no cliente, só esquece a referência.
 */
export async function closeRoom(): Promise<void> {
  attemptCounter += 1;
  const current = detach();
  view = { ...EMPTY, attemptId: attemptCounter };
  emit();
  if (current) await closeOrDrop(current, false);
}

/** "Cancelar" durante a busca: entrar/criar saem; voltar só larga (a sessão salva fica). */
export function cancelAttempt(): Promise<void> {
  return view.attempt?.kind === "resume" ? closeRoom() : leaveRoom();
}

export function roomClient(): RoomClient | null {
  return client;
}

export function getRoomView(): RoomView {
  return view;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverView = () => EMPTY;

export function useRoomView(): RoomView {
  return useSyncExternalStore(subscribe, getRoomView, serverView);
}

// ——— Leituras do snapshot usadas por várias telas ———

/** Jogadores presentes (não espectadores, não saíram), em ordem de entrada. */
export function playersOf(snapshot: RoomSnapshot): RoomMember[] {
  return snapshot.members.filter((member) => member.role === "player" && !member.left);
}

export function spectatorsOf(snapshot: RoomSnapshot): RoomMember[] {
  return snapshot.members.filter((member) => member.role === "spectator" && !member.left);
}

export function memberOf(snapshot: RoomSnapshot | null, playerId: string): RoomMember | null {
  return snapshot?.members.find((member) => member.playerId === playerId) ?? null;
}

export function entrantOf(snapshot: RoomSnapshot | null, entrantId: string): BracketEntrant | null {
  return snapshot?.bracket?.entrants.find((entrant) => entrant.id === entrantId) ?? null;
}

export function isCpuEntrant(entrantId: string): boolean {
  return entrantId.startsWith("cpu:");
}

/** Time de um participante (humano pelo membro, CPU pela chave). */
export function teamOf(state: RoomClientState, entrantId: string): BobTeam | null {
  const snapshot = state.snapshot;
  const hash = entrantOf(snapshot, entrantId)?.teamHash ?? memberOf(snapshot, entrantId)?.teamHash;
  return hash ? state.teams[hash] ?? null : null;
}

/** Apelido de um participante; a CPU vira "CPU". */
export function nicknameOf(state: RoomClientState, entrantId: string): string {
  if (isCpuEntrant(entrantId)) return "CPU";
  return memberOf(state.snapshot, entrantId)?.nickname ?? "Jogador";
}

/** O adversário como a manchete fala dele: "a CPU" ou o apelido. */
export function opponentLabel(state: RoomClientState, entrantId: string): string {
  return isCpuEntrant(entrantId) ? "a CPU" : nicknameOf(state, entrantId);
}

export function bracketMatchOf(state: RoomClientState | null, bracketId: string): BracketMatch | null {
  return state?.snapshot?.bracket?.matches.find((match) => match.id === bracketId) ?? null;
}

/** O lado (do motor) deste aparelho numa partida da chave: home = "user". */
export function mySideIn(match: BracketMatch, me: string): "user" | "cpu" | null {
  if (match.home?.entrantId === me) return "user";
  if (match.away?.entrantId === me) return "cpu";
  return null;
}

/**
 * A rodada da sala: o código mais o sorteio. Muda em outra sala e em "Novo torneio com a
 * mesma sala" (sorteio novo); as revanches e a série do X1 ficam na mesma rodada.
 */
export function roundKeyOf(snapshot: RoomSnapshot | null | undefined): string | null {
  return snapshot ? `${snapshot.code}:${snapshot.seed >>> 0}` : null;
}

/** Um "pronto?" da minha próxima partida: muda a cada checagem nova (outra partida, outro torneio, outra sala). */
export function readyCheckKey(state: RoomClientState): string | null {
  const next = state.nextMatch;
  const match = next ? bracketMatchOf(state, next.bracketId) : null;
  if (!next || !match || match.status !== "ready-check" || next.readyDeadlineLocal === null) return null;
  return `${roundKeyOf(state.snapshot)}:${match.id}:${match.replay}:${match.readyDeadline ?? ""}`;
}

// ——— Decisões da página que não dependem do React ———

/** A sessão salva volta sozinha quando é mais nova que isto (§1.1). */
export const AUTO_RESUME_MS = 2 * 60_000;

/**
 * Volta sozinha para a sessão salva? Sim com ?voltar=1 (cartão do menu); senão só se ela é
 * recente e o link aberto (?sala=) não é de OUTRA sala: o link do amigo manda. Fora do
 * componente: lê o relógio (`now` só nos testes).
 */
export function autoResumeAllowed(session: SavedSession, options: { now?: number; wanted: boolean; linkCode: string | null }): boolean {
  if (options.wanted) return true;
  if (options.linkCode !== null && options.linkCode !== session.code) return false;
  return (options.now ?? Date.now()) - session.savedAt < AUTO_RESUME_MS;
}

/**
 * Cliente que já morreu (saiu, erro sem volta, outra aba tomou a sessão): o aviso do início
 * (null = nenhum). `undefined` = o cliente ainda vale (conectando ou na sala).
 */
export function deadClientNotice(state: RoomClientState | null): string | null | undefined {
  if (!state) return undefined;
  if (state.phase === "superseded") return joinErrorText("outra-aba");
  if (state.phase === "error") return state.error === "removido" ? joinErrorText("removido") : null;
  if (state.phase === "left") return null;
  return undefined;
}

// ——— Textos que mais de uma tela usa ———

export const FORMAT_LABEL: Record<RoomFormat, string> = { x1: "X1", t4: "Torneio de 4", t8: "Torneio de 8" };
export const CPU_LEVEL_LABEL: Record<CpuLevel, string> = { 2: "Fácil", 3: "Médio", 4: "Difícil" };

/** "Torneio de 4 · Clássico (3 gols · 2 minutos)", com "· com senha" quando trancada. */
export function settingsLine(settings: RoomSettings): string {
  const preset = BOB_RULE_PRESETS[settings.rules];
  return `${FORMAT_LABEL[settings.format]} · ${preset.label} (${preset.detail})${settings.locked ? " · com senha" : ""}`;
}

/** Erros da busca/abertura que oferecem "Tentar de novo". */
export const RETRYABLE_ERRORS: ReadonlySet<JoinError> = new Set<JoinError>(["nao-encontrada", "sem-rede", "conexao", "abrir"]);

/** Texto de um erro de sala (§1.3, §1.4). `format` muda o "já começou" (X1 × torneio). */
export function joinErrorText(error: JoinError, format: RoomFormat | null = null): string {
  switch (error) {
    case "nao-encontrada": return "Não achamos a sala. Confira o código e se o anfitrião está com o Futbobo aberto.";
    case "sem-rede": return "Sem conexão com a internet (ou ela está bloqueando o jogo). Tente outra rede.";
    case "conexao": return "Não deu para conectar com a sala. Tente outra rede (Wi-Fi ↔ dados móveis).";
    case "cheia": return "Sala cheia.";
    case "senha": return "Esta sala tem senha.";
    case "senha-errada": return "Senha errada.";
    case "iniciada": return format === "x1" ? "A partida já começou." : "O torneio já começou.";
    case "removido": return "Você foi removido desta sala.";
    case "time": return "Seu time está com problema. Abra Meu time e salve de novo.";
    case "versao": return "Seu Futbobo está desatualizado para esta sala.";
    case "versao-nova": return "Essa sala é de uma versão mais nova do Futbobo. Atualize para entrar.";
    case "outra-aba": return "Você entrou na sala em outra aba.";
    case "abrir": return "Não conseguimos abrir a sala. Confira sua internet e tente de novo.";
    case "cripto": return "Este navegador não consegue fazer a conexão segura do Bobonline.";
  }
}

/** "(versão do online: você 1.1 · sala 2.1)": protocolo e revisão do motor, nunca FUTBOBO_VERSION. */
export function versionDetail(mine: HelloInfo, theirs: HelloInfo): string {
  const label = (info: HelloInfo) => `${info.proto}.${info.engine}`;
  return `(versão do online: você ${label(mine)} · sala ${label(theirs)})`;
}

/** Relógio de uma partida ao vivo: "1:12". */
export function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

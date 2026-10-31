// Sala guardada no aparelho (§4.7): o último snapshot que este aparelho publicou ou adotou, os
// times e os resultados já vistos ("fatos"). Serve para o anfitrião voltar de um reload com a
// sala inteira, para o convidado desenhar a sala enquanto reconecta e para nenhum resultado se
// perder numa troca de anfitrião (os fatos são monotônicos: nunca saem até a sala acabar).

import { T } from "../protocol";
import { bobKey, readJson, removeKey, writeJson } from "../storage";
import type { BracketResult, RoomSnapshot, RoomTeams } from "../types";
import type { ResultFact } from "./room-api";

export type PersistedRoom = { v: 1; code: string; snapshot: RoomSnapshot; teams: RoomTeams; facts: ResultFact[]; savedAt: number };

export interface RoomStore {
  save(room: PersistedRoom): boolean;
  /** A sala guardada com esse código, dentro do prazo (ROOM_STATE_TTL_MS). */
  load(code: string): PersistedRoom | null;
  clear(): void;
}

const ROOM_KEY = "futbobo:bobonline-room:v1";

function isPersistedRoom(value: unknown): value is PersistedRoom {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<PersistedRoom>;
  const snapshot = room.snapshot as Partial<RoomSnapshot> | undefined;
  return room.v === 1 && typeof room.code === "string" && typeof room.savedAt === "number" && Number.isFinite(room.savedAt)
    && !!snapshot && typeof snapshot === "object" && snapshot.v === 1 && snapshot.code === room.code
    && typeof snapshot.epoch === "number" && typeof snapshot.version === "number" && typeof snapshot.hostId === "string"
    && Array.isArray(snapshot.members) && !!room.teams && typeof room.teams === "object" && Array.isArray(room.facts);
}

function fresh(room: PersistedRoom, now: number): boolean {
  return Math.abs(now - room.savedAt) <= T.ROOM_STATE_TTL_MS;
}

/** `futbobo:bobonline-room:v1` (via bobKey): uma sala só por aparelho (a última). */
export function localRoomStore(options: { now?: () => number } = {}): RoomStore {
  const now = options.now ?? (() => Date.now());
  return {
    save(room) {
      return writeJson(bobKey(ROOM_KEY), room);
    },
    load(code) {
      const value = readJson<unknown>(bobKey(ROOM_KEY));
      if (!isPersistedRoom(value) || value.code !== code) return null;
      if (!fresh(value, now())) {
        removeKey(bobKey(ROOM_KEY));
        return null;
      }
      return value;
    },
    clear() {
      removeKey(bobKey(ROOM_KEY));
    },
  };
}

/** Em memória (testes em Node: cada aparelho simulado tem o seu "localStorage"). */
export function memoryRoomStore(options: { now?: () => number } = {}): RoomStore & { readonly current: () => PersistedRoom | null } {
  const now = options.now ?? (() => Date.now());
  let stored: string | null = null;
  return {
    current: () => (stored ? (JSON.parse(stored) as PersistedRoom) : null),
    save(room) {
      stored = JSON.stringify(room);
      return true;
    },
    load(code) {
      if (!stored) return null;
      const room = JSON.parse(stored) as unknown;
      return isPersistedRoom(room) && room.code === code && fresh(room, now()) ? room : null;
    },
    clear() {
      stored = null;
    },
  };
}

/** Chave de um fato: a partida da chave e o id da partida do motor (revanches têm id próprio). */
export function factKey(fact: Pick<ResultFact, "bracketId"> & { result: Pick<BracketResult, "matchId"> }): string {
  return `${fact.bracketId}|${fact.result.matchId}`;
}

/** Os resultados "done" de um snapshot, como fatos. */
export function factsOf(snapshot: RoomSnapshot | null): ResultFact[] {
  const facts: ResultFact[] = [];
  for (const match of snapshot?.bracket?.matches ?? []) {
    if (match.status !== "done" || !match.result || !match.home || !match.away) continue;
    facts.push({ bracketId: match.id, result: match.result, sides: [match.home.entrantId, match.away.entrantId] });
  }
  return facts;
}

/** União monotônica (o primeiro fato visto de cada partida fica). */
export function mergeFacts(current: ResultFact[], incoming: ResultFact[]): ResultFact[] {
  const keys = new Set(current.map(factKey));
  const merged = current.slice();
  for (const fact of incoming) {
    if (!fact || !fact.result || typeof fact.bracketId !== "string" || !Array.isArray(fact.sides)) continue;
    const key = factKey(fact);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(fact);
  }
  return merged;
}

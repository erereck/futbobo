// Checkpoints da partida online (§5.9): o bastante para voltar à MESMA partida depois de um
// reload, sem comprar tempo de mira de volta.
//
// Um checkpoint é o estado no último descanso `n` mais o log das ações a partir dele (as minhas
// ainda sem ack inclusive). Quem é dono do turno aberto também guarda os timers (relógio do dono,
// 7 s, limite do pênalti) a cada segundo e ao esconder a página. Falhar ao gravar (cota, modo
// privado) é tolerado: o aperto de mão do §5.10 recupera pelo outro aparelho.

import type { DuelAction } from "../../botao/match-link";
import type { SerializedMatch } from "../../botao/match-codec";
import type { BotaoMatchSetup, BotaoSide } from "../../botao/types";
import { T } from "../protocol";
import { bobKey, keysWithPrefix, readJson, removeKey, writeJson } from "../storage";

export type MatchCheckpoint = {
  v: 1; roomCode: string; bracketId: string; matchId: string; role: "authority" | "follower" | "solo";
  setup: BotaoMatchSetup; sides: Record<BotaoSide, string>; names: Record<BotaoSide, string>;
  n: number; match: SerializedMatch;          // estado no descanso n (para o seguidor: já adotado)
  log: DuelAction[];                          // ações com índice >= n (inclusive as minhas ainda sem ack)
  lastAuthRest: { n: number; match: SerializedMatch } | null; // seguidor: último m:rest da autoridade (para m:sync-up)
  se: number;
  orders: Partial<Record<BotaoSide, string[]>>;               // autoridade: ordens de pênalti recebidas
  timers: { turnN: number; ownerClock: number; idleLeft: number; kickLeft: number | null } | null; // dono de um turno aberto
  cpuCursor: number | null; pools: Record<string, number>; savedAt: number;
};

export interface CheckpointStore {
  save(cp: MatchCheckpoint): boolean;
  load(matchId: string): MatchCheckpoint | null;
  latest(): MatchCheckpoint | null;
  clear(matchId: string): void;
}

const BASE_KEY = "futbobo:bobonline-match:v1";

/** Formato mínimo para confiar num checkpoint lido do disco (o resto o codec confere ao restaurar). */
export function isMatchCheckpoint(value: unknown): value is MatchCheckpoint {
  if (!value || typeof value !== "object") return false;
  const cp = value as Partial<MatchCheckpoint>;
  return cp.v === 1 && typeof cp.matchId === "string" && typeof cp.bracketId === "string" && typeof cp.roomCode === "string"
    && (cp.role === "authority" || cp.role === "follower" || cp.role === "solo")
    && !!cp.setup && typeof cp.setup === "object" && !!cp.sides && !!cp.names
    && typeof cp.n === "number" && Number.isSafeInteger(cp.n) && cp.n >= 0
    && !!cp.match && typeof cp.match === "object" && Array.isArray(cp.log)
    && typeof cp.se === "number" && typeof cp.savedAt === "number" && Number.isFinite(cp.savedAt)
    && !!cp.pools && typeof cp.pools === "object" && !!cp.orders && typeof cp.orders === "object";
}

function fresh(cp: MatchCheckpoint, now: number): boolean {
  return now - cp.savedAt <= T.CHECKPOINT_TTL_MS && cp.savedAt - now <= T.CHECKPOINT_TTL_MS;
}

/**
 * `futbobo:bobonline-match:v1:<matchId>` via bobKey (com perfil dev: `…:v1:<perfil>:<matchId>`).
 * Guarda no máximo CHECKPOINTS_KEPT partidas; as mais velhas (e as vencidas) saem.
 */
export function localCheckpointStore(options: { now?: () => number } = {}): CheckpointStore {
  const now = options.now ?? (() => Date.now());
  const prefix = `${bobKey(BASE_KEY)}:`;
  const keyOf = (matchId: string) => `${prefix}${matchId}`;
  const pruned = new Set<string>();

  function entries(): Array<{ key: string; cp: MatchCheckpoint | null }> {
    // Chaves de outro perfil dev têm ":" depois do prefixo; ids de partida nunca têm.
    return keysWithPrefix(prefix)
      .filter((key) => !key.slice(prefix.length).includes(":"))
      .map((key) => {
        const value = readJson<unknown>(key);
        return { key, cp: isMatchCheckpoint(value) ? value : null };
      });
  }

  function prune(keep: string) {
    const at = now();
    const valid: Array<{ key: string; savedAt: number }> = [];
    for (const { key, cp } of entries()) {
      if (!cp || !fresh(cp, at)) removeKey(key);
      else valid.push({ key, savedAt: key === keep ? Number.POSITIVE_INFINITY : cp.savedAt });
    }
    valid.sort((a, b) => b.savedAt - a.savedAt);
    for (const extra of valid.slice(T.CHECKPOINTS_KEPT)) removeKey(extra.key);
  }

  return {
    save(cp) {
      const key = keyOf(cp.matchId);
      const ok = writeJson(key, cp);
      // A faxina roda uma vez por partida (gravar a cada segundo não relê o disco inteiro).
      if (ok && !pruned.has(cp.matchId)) {
        pruned.add(cp.matchId);
        prune(key);
      }
      return ok;
    },
    load(matchId) {
      const value = readJson<unknown>(keyOf(matchId));
      if (!isMatchCheckpoint(value) || value.matchId !== matchId) return null;
      if (!fresh(value, now())) {
        removeKey(keyOf(matchId));
        return null;
      }
      return value;
    },
    latest() {
      const at = now();
      let best: MatchCheckpoint | null = null;
      for (const { cp } of entries()) if (cp && fresh(cp, at) && (!best || cp.savedAt > best.savedAt)) best = cp;
      return best;
    },
    clear(matchId) {
      removeKey(keyOf(matchId));
      pruned.delete(matchId);
    },
  };
}

/** Em memória (testes em Node; aparelho sem storage). `fail` simula cota estourada. */
export function memoryCheckpointStore(options: { now?: () => number; fail?: () => boolean } = {}): CheckpointStore & { readonly map: Map<string, MatchCheckpoint> } {
  const now = options.now ?? (() => Date.now());
  const map = new Map<string, MatchCheckpoint>();
  const copy = (cp: MatchCheckpoint) => JSON.parse(JSON.stringify(cp)) as MatchCheckpoint;
  return {
    map,
    save(cp) {
      if (options.fail?.()) return false;
      map.set(cp.matchId, copy(cp));
      const kept = [...map.values()].sort((a, b) => b.savedAt - a.savedAt).filter((entry) => entry.matchId !== cp.matchId);
      for (const extra of kept.slice(T.CHECKPOINTS_KEPT - 1)) map.delete(extra.matchId);
      return true;
    },
    load(matchId) {
      const cp = map.get(matchId);
      return cp && fresh(cp, now()) ? copy(cp) : null;
    },
    latest() {
      let best: MatchCheckpoint | null = null;
      for (const cp of map.values()) if (fresh(cp, now()) && (!best || cp.savedAt > best.savedAt)) best = cp;
      return best ? copy(best) : null;
    },
    clear(matchId) {
      map.delete(matchId);
    },
  };
}

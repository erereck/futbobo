import { CLUBS } from "../game-data";
import type { GameState } from "./model";

/**
 * Cache dos cálculos do universo (competições continentais, Mundial, seleções e arquivo nacional).
 *
 * Esses construtores refazem a história inteira do mundo a cada chamada e ficam mais caros a cada
 * temporada: numa carreira longa passavam de meio segundo num PC e de vários segundos num celular
 * antigo. O resultado só depende de poucos campos do save (os de `WorldInputs`), que mudam no fim da
 * temporada, não a cada decisão; então a mesma resposta serve a todas as telas até um deles mudar.
 *
 * Os campos são comparados por referência (o save é imutável: cada mudança cria um array novo) e,
 * para listas, também item a item, para que uma cópia rasa do mesmo histórico ainda acerte o cache.
 * Quem usa o resultado só lê: nada aqui pode ser alterado no lugar.
 */
type WorldInputs = Pick<GameState, "history" | "seed" | "nationality" | "lastResult"> & {
  /** Só o mapa de jogadores é lido; o universo é copiado a cada mudança, então a referência basta. */
  worldPlayers?: GameState["worldPlayers"]["players"];
  nationalHistory?: GameState["nationalHistory"];
  clubCount: number;
  clubRevision: number;
};

let clubRevision = 0;

/** Clubes personalizados mudaram nomes/cores: o que foi montado com os nomes antigos sai do cache. */
export function bumpWorldClubRevision() {
  clubRevision += 1;
}

export function worldClubRevision() {
  return clubRevision;
}

function inputsFor(state: GameState): WorldInputs {
  return {
    history: state.history,
    seed: state.seed,
    nationality: state.nationality,
    lastResult: state.lastResult,
    worldPlayers: state.worldPlayers?.players,
    nationalHistory: state.nationalHistory,
    clubCount: CLUBS.length,
    clubRevision,
  };
}

function sameList(a: readonly unknown[] | undefined | null, b: readonly unknown[] | undefined | null) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function sameInputs(a: WorldInputs, b: WorldInputs) {
  return a.seed === b.seed
    && a.nationality === b.nationality
    && a.lastResult === b.lastResult
    && a.clubCount === b.clubCount
    && a.clubRevision === b.clubRevision
    && a.worldPlayers === b.worldPlayers
    && sameList(a.history, b.history)
    && sameList(a.nationalHistory, b.nationalHistory);
}

/**
 * Embrulha um construtor puro do universo: mesma entrada (pelos campos de `WorldInputs`), mesma
 * resposta. Guarda as últimas `size` respostas (carreira atual, prévia do Hall, desafio).
 */
export function memoizeWorld<T>(build: (state: GameState) => T, size = 3): (state: GameState) => T {
  const entries: Array<{ inputs: WorldInputs; value: T }> = [];
  return (state: GameState) => {
    const inputs = inputsFor(state);
    const hit = entries.findIndex((entry) => sameInputs(entry.inputs, inputs));
    if (hit >= 0) {
      const [entry] = entries.splice(hit, 1);
      entries.unshift(entry);
      return entry.value;
    }
    const value = build(state);
    entries.unshift({ inputs, value });
    if (entries.length > size) entries.length = size;
    return value;
  };
}

/**
 * Mesmo save (o mesmo objeto) e mesmos clubes: mesma resposta. Para o que lê o save inteiro
 * (o retrato do mundo com as notícias da carreira), trocar de aba e voltar não recalcula nada.
 */
export function memoizeByState<T>(build: (state: GameState) => T): (state: GameState) => T {
  const cache = new WeakMap<GameState, { clubCount: number; clubRevision: number; value: T }>();
  return (state: GameState) => {
    const cached = cache.get(state);
    if (cached && cached.clubCount === CLUBS.length && cached.clubRevision === clubRevision) return cached.value;
    const value = build(state);
    cache.set(state, { clubCount: CLUBS.length, clubRevision, value });
    return value;
  };
}

const perWorldPlayers = new WeakMap<object, Map<string, unknown>>();

/**
 * Valor que só depende do mapa de jogadores do mundo (e da chave): calculado uma vez por mapa.
 * O mapa é copiado a cada mudança, então um mapa novo começa um cache novo.
 */
export function memoByWorldPlayers<T>(players: object | undefined, key: string, compute: () => T): T {
  if (!players) return compute();
  let cache = perWorldPlayers.get(players);
  if (!cache) {
    cache = new Map();
    perWorldPlayers.set(players, cache);
  }
  if (cache.has(key)) return cache.get(key) as T;
  const value = compute();
  cache.set(key, value);
  return value;
}

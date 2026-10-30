// Estrelas, preferências e o jogador do save — tudo que o Scorebobo lembra.
//
// O progresso é pequeno e físico (localStorage), numa chave só do modo. O save
// da carreira é só LIDO, do mesmo jeito que /bola-de-ouro e /trio-eletrico: a
// rota roda fora do shell, sem a ponte do IndexedDB instalada.

import { normalizePlayerAppearance, randomPlayerAppearance, type PlayerAppearance } from "../player-appearance";
import type { ScoreLevel, ScoreTeams } from "./types";

// ------------------------------------------------------------ progresso

export const SCOREBOBO_STORAGE_KEY = "futbobo:scorebobo:v1";

export type StarCount = 0 | 1 | 2 | 3;

export type ScoreboboProgress = {
  /** Melhor resultado de cada fase (id → estrelas). */
  stars: Record<string, StarCount>;
  /** Fases que uma ordem antiga já tinha aberto (save de antes da trilha atual): seguem abertas. */
  opened: string[];
  /** Versão da trilha que este save conhece (`TRACK_VERSION`); sem ela, o save é de antes da reordenação. */
  track: number;
  /** "Liberar todas (demo)": para apresentar sem jogar fase por fase. */
  unlockAll: boolean;
  /** Modo desempenho escolhido aqui; null = segue o do Modo 3D. */
  performance: boolean | null;
};

/**
 * Versão da trilha (a ordem do SCORE_LEVELS, que é a ordem de desbloqueio).
 * 2 = a reordenação por dificuldade. Mudou a ordem de novo: sobe a versão e a
 * ordem que sai entra na migração de `openedBefore`.
 */
const TRACK_VERSION = 2;

const EMPTY_PROGRESS: ScoreboboProgress = { stars: {}, opened: [], track: TRACK_VERSION, unlockAll: false, performance: null };

function clampStars(value: unknown): StarCount {
  const number = Math.round(Number(value) || 0);
  return (number <= 0 ? 0 : number >= 3 ? 3 : number) as StarCount;
}

/** As 6 fases da primeira leva, na ordem em que eram liberadas (as novas entraram entre elas). */
const FIRST_ORDER = ["primeiro-toque", "curva-no-angulo", "tabela-na-area", "pela-ponta", "contra-ataque", "final-da-copa"];

/** As 12 fases antes da trilha 2: as 6 novas no meio da primeira leva. */
const SECOND_ORDER = [
  "primeiro-toque",
  "na-marca-da-cal",
  "curva-no-angulo",
  "cara-a-cara",
  "tabela-na-area",
  "pela-ponta",
  "de-voleio",
  "triangulacao",
  "falta-frontal",
  "contra-ataque",
  "area-lotada",
  "final-da-copa",
];

/** O que "ao menos 1 estrela na anterior" abria em `order`. */
function openedByOrder(order: readonly string[], stars: Record<string, StarCount>) {
  return order.filter((_, index) => index > 0 && (stars[order[index - 1]] ?? 0) >= 1);
}

/**
 * Save sem `track` é de antes da trilha 2: tudo o que a ordem de 12 mostrava
 * aberto continua aberto (quem chegou na final não volta a ver cadeado nela).
 * É a lista `opened` dele (ou, se ele nunca gravou, o que a primeira leva
 * abria) mais a anterior com estrela na ordem de 12, contada com as estrelas
 * de agora (as que vierem depois já abrem só pela ordem nova). A versão e a
 * lista vão juntas na próxima gravação; saves novos nascem com ela vazia.
 */
function openedBefore(opened: string[] | null, stars: Record<string, StarCount>) {
  return [...new Set([...(opened ?? openedByOrder(FIRST_ORDER, stars)), ...openedByOrder(SECOND_ORDER, stars)])];
}

function readProgressNow(): ScoreboboProgress {
  if (typeof window === "undefined") return EMPTY_PROGRESS;
  try {
    const raw = window.localStorage.getItem(SCOREBOBO_STORAGE_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<ScoreboboProgress> | null;
    const stars: Record<string, StarCount> = {};
    if (parsed?.stars && typeof parsed.stars === "object") {
      for (const [id, value] of Object.entries(parsed.stars)) stars[id] = clampStars(value);
    }
    const rawOpened: unknown = parsed?.opened;
    const opened = Array.isArray(rawOpened) ? rawOpened.filter((id): id is string => typeof id === "string") : null;
    const current = typeof parsed?.track === "number" && parsed.track >= TRACK_VERSION;
    return {
      stars,
      opened: current ? opened ?? [] : openedBefore(opened, stars),
      track: TRACK_VERSION,
      unlockAll: parsed?.unlockAll === true,
      performance: typeof parsed?.performance === "boolean" ? parsed.performance : null,
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

// Loja mínima para o `useSyncExternalStore`: o mesmo objeto até alguém gravar.
let progressCache: ScoreboboProgress | null = null;
const listeners = new Set<() => void>();

export function subscribeProgress(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // key null = `localStorage.clear()` em outra aba: o progresso daqui também já era.
    if (event.key !== null && event.key !== SCOREBOBO_STORAGE_KEY) return;
    progressCache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readProgress(): ScoreboboProgress {
  return (progressCache ??= readProgressNow());
}

export const serverProgress = () => EMPTY_PROGRESS;

function writeProgress(next: ScoreboboProgress) {
  progressCache = next;
  try {
    window.localStorage.setItem(SCOREBOBO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sem storage as estrelas valem só nesta visita.
  }
  for (const listener of listeners) listener();
}

/** Guarda o melhor resultado da fase. Devolve se foi recorde. */
export function recordStars(levelId: string, stars: StarCount): boolean {
  const current = readProgress();
  const previous = current.stars[levelId] ?? 0;
  if (stars <= previous) return false;
  writeProgress({ ...current, stars: { ...current.stars, [levelId]: stars } });
  return true;
}

export function setUnlockAll(value: boolean) {
  writeProgress({ ...readProgress(), unlockAll: value });
}

export function setPerformancePreference(value: boolean | null) {
  writeProgress({ ...readProgress(), performance: value });
}

/** Desbloqueio em sequência: cada fase abre com ao menos 1 estrela na anterior (ou se já tem estrelas nela, ou se a ordem antiga já a abria). */
export function levelUnlocked(levels: ReadonlyArray<ScoreLevel>, index: number, progress: ScoreboboProgress): boolean {
  if (index <= 0 || progress.unlockAll) return true;
  const id = levels[index]?.id ?? "";
  if ((progress.stars[id] ?? 0) >= 1 || progress.opened.includes(id)) return true;
  const previous = levels[index - 1];
  return Boolean(previous && (progress.stars[previous.id] ?? 0) >= 1);
}

// ------------------------------------------------------------------ som

/** A mesma chave do botão "Som" da partida e da gala: quem joga sem som treina sem som. */
const MUTE_KEY = "futbobo_player_match_muted";

let mutedCache: boolean | null = null;
const muteListeners = new Set<() => void>();

export function readMuted(): boolean {
  if (mutedCache !== null) return mutedCache;
  if (typeof window === "undefined") return false;
  try {
    mutedCache = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    mutedCache = false;
  }
  return mutedCache;
}

export const serverMuted = () => false;

export function subscribeMuted(listener: () => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

export function rememberMuted(muted: boolean) {
  mutedCache = muted;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Preferência opcional: sem storage vale só nesta visita.
  }
  for (const listener of muteListeners) listener();
}

// ------------------------------------------------------- jogador do save

export type ScoreboboProfile = {
  name: string;
  /** Nome curto para a camisa e o HUD ("R. Nunes"). */
  shortName: string;
  number: number;
  appearance: PlayerAppearance;
  fromSave: boolean;
  /** Time do jogador (do save, ou o amarelo e azul clássico). */
  club: TeamInfo;
};

export type TeamInfo = { id: string; name: string; abbr: string; primary: string; secondary: string };

// Mesmas chaves de `career/state.ts` e `career/indexed-storage.ts`.
const SAVE_KEY = "futbobo:career:v1";
const STORAGE_DB = "futbobo-storage";
const STORAGE_STORE = "large-local-storage";

/**
 * Lê o save sem instalar a ponte: o localStorage físico e depois o IndexedDB,
 * só leitura (mesma leitura de /bola-de-ouro). Se o banco não existe, a
 * abertura é abortada para não criar nada.
 */
async function readSaveRaw(): Promise<string | null> {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) return raw;
  } catch {
    // Storage bloqueado: tenta o IndexedDB.
  }
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(STORAGE_DB);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      const done = (value: string | null) => {
        database.close();
        resolve(value);
      };
      try {
        if (!database.objectStoreNames.contains(STORAGE_STORE)) {
          done(null);
          return;
        }
        const read = database.transaction(STORAGE_STORE, "readonly").objectStore(STORAGE_STORE).get(SAVE_KEY);
        read.onsuccess = () => done(typeof read.result === "string" ? read.result : null);
        read.onerror = () => done(null);
      } catch {
        done(null);
      }
    };
  });
}

/** Amarelo e azul de sempre, para quem ainda não tem carreira. */
export const CLASSIC_HOME: TeamInfo = { id: "futbobo", name: "Futbobo", abbr: "FBB", primary: "#f7d117", secondary: "#1d4fc4" };

function shortNameOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();
  const last = parts[parts.length - 1];
  // "João Vitor Lima" vira "J. Lima": cabe no crachá do HUD sem cortar.
  return `${parts[0][0]}. ${last}`;
}

type ClubLike = { id: string; name: string; shortName: string; abbr: string; primary: string; secondary: string; reputation: number };

function teamOf(club: ClubLike): TeamInfo {
  return { id: club.id, name: club.shortName || club.name, abbr: club.abbr || club.shortName.slice(0, 3).toUpperCase(), primary: club.primary, secondary: club.secondary };
}

/** Dados de clubes só chegam com a fase: o menu abre sem o peso do banco de clubes. */
let clubsPromise: Promise<ClubLike[]> | null = null;
function loadClubs(): Promise<ClubLike[]> {
  clubsPromise ??= import("../game-data").then((module) => module.CLUBS as ClubLike[]).catch(() => []);
  return clubsPromise;
}

/** Jogador do save (se houver) ou um sorteado chamado "Você". Nunca rejeita. */
export async function loadScoreboboProfile(): Promise<ScoreboboProfile> {
  let raw: string | null = null;
  try {
    raw = await readSaveRaw();
  } catch {
    raw = null;
  }
  if (raw) {
    try {
      const save = JSON.parse(raw) as Record<string, unknown>;
      const name = typeof save.name === "string" ? save.name.trim() : "";
      const clubId = typeof save.currentClubId === "string" ? save.currentClubId : "";
      if (name) {
        const clubs = clubId ? await loadClubs() : [];
        const club = clubs.find((item) => item.id === clubId);
        return {
          name,
          shortName: shortNameOf(name),
          number: Math.max(1, Math.min(99, Math.round(Number(save.number) || 10))),
          appearance: normalizePlayerAppearance(save.playerAppearance as Partial<PlayerAppearance> | undefined),
          fromSave: true,
          club: club ? teamOf(club) : CLASSIC_HOME,
        };
      }
    } catch {
      // Save ilegível: segue com o sorteado.
    }
  }
  return {
    name: "Você",
    shortName: "Você",
    number: 10,
    appearance: randomPlayerAppearance(Math.floor(Math.random() * 2147483000)),
    fromSave: false,
    club: CLASSIC_HOME,
  };
}

// ------------------------------------------------------------- adversário

function rgbOf(hex: string): [number, number, number] {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "808080";
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

/** Distância de cor "a olho" (pesos do redmean): o bastante para separar camisas no gramado. */
function colorDistance(a: string, b: string) {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  const mean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db);
}

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Um adversário de elite que não se confunde com o time da casa (sempre o mesmo por fase). */
const FALLBACK_AWAY: TeamInfo[] = [
  { id: "away-red", name: "Rubro", abbr: "RUB", primary: "#d71920", secondary: "#111111" },
  { id: "away-white", name: "Merengue", abbr: "MER", primary: "#f5f5f5", secondary: "#f2b705" },
  { id: "away-navy", name: "Celeste", abbr: "CEL", primary: "#274b9f", secondary: "#d71920" },
];

export async function pickAwayTeam(home: TeamInfo, levelId: string): Promise<TeamInfo> {
  const clubs = await loadClubs();
  const elite = clubs.filter((club) => club.reputation >= 5 && club.id !== home.id);
  const contrasting = elite.filter((club) => colorDistance(club.primary, home.primary) > 260 && colorDistance(club.primary, home.secondary) > 120);
  const pool = contrasting.length ? contrasting.map(teamOf) : FALLBACK_AWAY.filter((team) => colorDistance(team.primary, home.primary) > 200);
  const list = pool.length ? pool : FALLBACK_AWAY;
  return list[hashText(`${levelId}:${home.id}`) % list.length];
}

export function teamsFor(home: TeamInfo, away: TeamInfo): ScoreTeams {
  return {
    home: { name: home.name, primary: home.primary, secondary: home.secondary },
    away: { name: away.name, primary: away.primary, secondary: away.secondary },
  };
}

/** A fase com o SEU jogador: aparência, nome curto e número do save entram no herói. */
export function levelWithHero(level: ScoreLevel, profile: ScoreboboProfile): ScoreLevel {
  return {
    ...level,
    hero: {
      ...level.hero,
      name: profile.shortName,
      number: profile.fromSave ? profile.number : level.hero.number,
      appearance: { ...(level.hero.appearance ?? {}), ...profile.appearance },
    },
  };
}

import type { GameState } from "./model";
import type { ManagerState } from "./manager-model";
import { SAVE_KEY } from "./state";

export type CareerMode = "player" | "manager";
export type CareerState = GameState | ManagerState;

export type CareerSaveMeta = {
  id: string;
  mode: CareerMode;
  createdAt: number;
  lastPlayedAt: number;
  name: string;
  clubId: string;
  season: number;
  position: string;
  overall: number;
  phase: string;
  achievementsEligible: boolean;
};

export type GlobalAchievementUnlock = {
  achievementId: string;
  careerId: string;
  playerName: string;
  clubId: string;
  position: string;
  unlockedAt: number | null;
};

const INDEX_KEY = "futbobo:career-slots:v2";
const ACTIVE_KEY = "futbobo:career-active-slot:v2";
const ACHIEVEMENTS_KEY = "futbobo:achievements-global:v2";
const SLOT_PREFIX = "futbobo:career-slot:v2:";
const MAX_SLOTS_PER_MODE = 10;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function slotKey(id: string) {
  return `${SLOT_PREFIX}${id}`;
}

function isUsableState(value: unknown): value is CareerState {
  if (!value || typeof value !== "object") return false;
  if ((value as { mode?: unknown }).mode === "manager") {
    const state = value as Partial<ManagerState>;
    return state.version === 1 && state.mode === "manager" && typeof state.phase === "string" && typeof state.name === "string" && typeof state.currentClubId === "string";
  }
  const state = value as Partial<GameState>;
  return state.version === 7 && typeof state.phase === "string" && typeof state.name === "string";
}

function metaFromState(state: CareerState, current: CareerSaveMeta): CareerSaveMeta {
  if ("mode" in state && state.mode === "manager") {
    return {
      ...current,
      mode: "manager",
      name: state.name?.trim() || current.name || "Nova carreira de técnico",
      clubId: state.currentClubId || current.clubId,
      season: state.season || current.season,
      position: "TÉCNICO",
      overall: Math.round(state.boardTrust),
      phase: state.phase,
    };
  }
  const playerState = state as GameState;
  return {
    ...current,
    name: playerState.name?.trim() || current.name || "Nova carreira",
    clubId: playerState.currentClubId || playerState.academyClubId || current.clubId,
    season: playerState.season || current.season,
    position: playerState.position || current.position,
    overall: playerState.overall || current.overall,
    phase: playerState.phase,
  };
}

function sanitizeIndex(value: unknown): CareerSaveMeta[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is CareerSaveMeta => Boolean(item && typeof item === "object" && typeof item.id === "string"))
    .map((item): CareerSaveMeta => ({
      ...item,
      mode: item.mode === "manager" ? "manager" : "player",
      createdAt: Number(item.createdAt) || Date.now(),
      lastPlayedAt: Number(item.lastPlayedAt) || Date.now(),
      name: item.name || "Nova carreira",
      clubId: item.clubId || "",
      season: Number(item.season) || new Date().getFullYear(),
      position: item.position || "MEI",
      overall: Number(item.overall) || 50,
      phase: item.phase || "identity",
      achievementsEligible: item.achievementsEligible !== false,
    }))
    .slice(0, MAX_SLOTS_PER_MODE * 2);
}

export function listCareerSaves(mode?: CareerMode) {
  const index = sanitizeIndex(readJson<unknown>(INDEX_KEY, []));
  return index
    .filter((item) => !mode || item.mode === mode)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

function writeIndex(index: CareerSaveMeta[]) {
  writeJson(INDEX_KEY, sanitizeIndex(index));
}

function createId(mode: CareerMode) {
  return `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createCareerSlot(mode: CareerMode = "player") {
  const index = listCareerSaves();
  if (index.filter((item) => item.mode === mode).length >= MAX_SLOTS_PER_MODE) return null;
  const now = Date.now();
  const meta: CareerSaveMeta = {
    id: createId(mode),
    mode,
    createdAt: now,
    lastPlayedAt: now,
    name: mode === "player" ? "Nova carreira" : "Nova carreira de técnico",
    clubId: "",
    season: new Date().getFullYear(),
    position: "MEI",
    overall: 50,
    phase: "identity",
    achievementsEligible: true,
  };
  writeIndex([meta, ...index]);
  localStorage.setItem(ACTIVE_KEY, meta.id);
  localStorage.removeItem(SAVE_KEY);
  return meta;
}

export function activateCareerSlot(id: string) {
  const index = listCareerSaves();
  const meta = index.find((item) => item.id === id);
  if (!meta) return false;
  const raw = localStorage.getItem(slotKey(id));
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isUsableState(parsed)) return false;
  } catch {
    return false;
  }
  localStorage.setItem(SAVE_KEY, raw);
  localStorage.setItem(ACTIVE_KEY, id);
  writeIndex(index.map((item) => item.id === id ? { ...item, lastPlayedAt: Date.now() } : item));
  return true;
}

export function getActiveCareerId() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACTIVE_KEY) ?? "";
}

export function deleteCareerSlot(id: string) {
  const index = listCareerSaves().filter((item) => item.id !== id);
  writeIndex(index);
  localStorage.removeItem(slotKey(id));
  if (getActiveCareerId() === id) {
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(SAVE_KEY);
  }
}

export function setActiveCareerAchievementsEligible(eligible: boolean) {
  const id = getActiveCareerId();
  if (!id) return;
  const index = listCareerSaves();
  writeIndex(index.map((item) => item.id === id ? { ...item, achievementsEligible: eligible } : item));
}

function readUnlocks() {
  const value = readJson<unknown>(ACHIEVEMENTS_KEY, []);
  if (!Array.isArray(value)) return [] as GlobalAchievementUnlock[];
  return value.filter((item): item is GlobalAchievementUnlock => Boolean(
    item && typeof item === "object" && typeof item.achievementId === "string" && typeof item.careerId === "string",
  ));
}

function syncAchievements(state: GameState, meta: CareerSaveMeta, migrated = false) {
  if (!meta.achievementsEligible) return;
  const unlocks = readUnlocks();
  const known = new Set(unlocks.map((item) => item.achievementId));
  let changed = false;
  for (const achievementId of state.unlockedAchievements ?? []) {
    if (known.has(achievementId)) continue;
    unlocks.push({
      achievementId,
      careerId: meta.id,
      playerName: state.name || meta.name,
      clubId: state.currentClubId || state.academyClubId || meta.clubId,
      position: state.position || meta.position,
      unlockedAt: migrated ? null : Date.now(),
    });
    known.add(achievementId);
    changed = true;
  }
  if (changed) writeJson(ACHIEVEMENTS_KEY, unlocks);
}

export function listGlobalAchievementUnlocks() {
  return readUnlocks();
}

let lastSyncedPayload = "";

export function syncActiveCareerSlot() {
  if (typeof window === "undefined") return;
  const id = getActiveCareerId();
  if (!id) return;
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw || raw === lastSyncedPayload) return;
  try {
    const state = JSON.parse(raw) as unknown;
    if (!isUsableState(state)) return;
    if (!("mode" in state) && (state.phase === "welcome" || state.challengeId)) return;
    const index = listCareerSaves();
    const meta = index.find((item) => item.id === id);
    if (!meta) return;
    localStorage.setItem(slotKey(id), raw);
    const nextMeta = metaFromState(state, { ...meta, lastPlayedAt: Date.now() });
    writeIndex(index.map((item) => item.id === id ? nextMeta : item));
    if (!("mode" in state)) syncAchievements(state, nextMeta);
    lastSyncedPayload = raw;
  } catch {
    // O buffer legado continua intacto se o payload estiver incompleto durante uma escrita.
  }
}

export function bootstrapCareerStorage() {
  if (typeof window === "undefined") return;
  let index = listCareerSaves();
  const legacyRaw = localStorage.getItem(SAVE_KEY);
  if (index.length === 0 && legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as unknown;
      if (isUsableState(legacy) && !("mode" in legacy) && legacy.phase !== "welcome" && !legacy.challengeId) {
        const now = Date.now();
        const meta = metaFromState(legacy, {
          id: `player-migrated-${now.toString(36)}`,
          mode: "player",
          createdAt: now,
          lastPlayedAt: now,
          name: legacy.name || "Carreira migrada",
          clubId: legacy.currentClubId || legacy.academyClubId || "",
          season: legacy.season,
          position: legacy.position,
          overall: legacy.overall,
          phase: legacy.phase,
          achievementsEligible: true,
        });
        localStorage.setItem(slotKey(meta.id), legacyRaw);
        writeIndex([meta]);
        localStorage.setItem(ACTIVE_KEY, meta.id);
        syncAchievements(legacy, meta, true);
        index = [meta];
      }
    } catch {
      // Save legado inválido continua sob responsabilidade do normalizador atual.
    }
  }

  for (const meta of index) {
    const raw = localStorage.getItem(slotKey(meta.id));
    if (!raw) continue;
    try {
      const state = JSON.parse(raw) as unknown;
      if (isUsableState(state) && !("mode" in state)) syncAchievements(state, meta, true);
    } catch {
      // Slot corrompido não impede a leitura dos outros.
    }
  }
}

export function readCareerSlotState(id: string) {
  const raw = typeof window === "undefined" ? null : localStorage.getItem(slotKey(id));
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as unknown;
    return isUsableState(state) ? state : null;
  } catch {
    return null;
  }
}

export type CareerStorageSnapshot = {
  version: 2;
  index: CareerSaveMeta[];
  activeId: string;
  slots: Record<string, CareerState>;
  achievements: GlobalAchievementUnlock[];
};

export type CareerStorageImportResult = {
  imported: boolean;
  activeState: CareerState | null;
};

export function exportCareerStorageSnapshot(): CareerStorageSnapshot {
  const index = listCareerSaves();
  const slots: Record<string, CareerState> = {};
  for (const meta of index) {
    const state = readCareerSlotState(meta.id);
    if (state) slots[meta.id] = state;
  }
  const usableIndex = index.filter((meta) => Boolean(slots[meta.id]));
  const activeId = usableIndex.some((meta) => meta.id === getActiveCareerId())
    ? getActiveCareerId()
    : usableIndex[0]?.id ?? "";
  return {
    version: 2,
    index: usableIndex,
    activeId,
    slots,
    achievements: readUnlocks(),
  };
}

export function importCareerStorageSnapshot(value: unknown): CareerStorageImportResult {
  if (typeof window === "undefined" || !value || typeof value !== "object") {
    return { imported: false, activeState: null };
  }
  const snapshot = value as Partial<CareerStorageSnapshot>;
  if (snapshot.version !== 2 || !Array.isArray(snapshot.index) || !snapshot.slots || typeof snapshot.slots !== "object") {
    return { imported: false, activeState: null };
  }

  const rawSlots = snapshot.slots as Record<string, unknown>;
  const importedIndex = sanitizeIndex(snapshot.index).filter((meta) => isUsableState(rawSlots[meta.id]));
  const currentIndex = listCareerSaves();
  for (const meta of currentIndex) localStorage.removeItem(slotKey(meta.id));

  for (const meta of importedIndex) {
    localStorage.setItem(slotKey(meta.id), JSON.stringify(rawSlots[meta.id]));
  }
  writeIndex(importedIndex);

  const importedUnlocks = Array.isArray(snapshot.achievements)
    ? snapshot.achievements.filter((item): item is GlobalAchievementUnlock => Boolean(
        item && typeof item === "object" && typeof item.achievementId === "string" && typeof item.careerId === "string",
      ))
    : [];
  writeJson(ACHIEVEMENTS_KEY, importedUnlocks);

  const activeId = typeof snapshot.activeId === "string" && importedIndex.some((meta) => meta.id === snapshot.activeId)
    ? snapshot.activeId
    : importedIndex[0]?.id ?? "";
  if (!activeId) {
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(SAVE_KEY);
    lastSyncedPayload = "";
    return { imported: true, activeState: null };
  }

  const activeState = rawSlots[activeId] as CareerState;
  localStorage.setItem(ACTIVE_KEY, activeId);
  localStorage.setItem(SAVE_KEY, JSON.stringify(activeState));
  lastSyncedPayload = "";
  return { imported: true, activeState };
}

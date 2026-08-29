import type { GameState } from "./model";
import { SAVE_KEY } from "./state";
import {
  deleteCareerPayload,
  readCareerPayload,
  requestDurableCareerStorage,
  writeCareerPayload,
} from "./indexed-storage";

export type CareerMode = "player" | "manager";

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

function isUsableState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GameState>;
  return state.version === 7 && typeof state.phase === "string" && typeof state.name === "string";
}

function parseUsableState(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isUsableState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function metaFromState(state: GameState, current: CareerSaveMeta): CareerSaveMeta {
  return {
    ...current,
    name: state.name?.trim() || current.name || "Nova carreira",
    clubId: state.currentClubId || state.academyClubId || current.clubId,
    season: state.season || current.season,
    position: state.position || current.position,
    overall: state.overall || current.overall,
    phase: state.phase,
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
  return meta;
}

export function activateCareerSlot(id: string) {
  const index = listCareerSaves();
  const meta = index.find((item) => item.id === id);
  if (!meta) return false;
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
  void deleteCareerPayload(id).catch((error) => {
    console.error("[Futbobo] Falha ao excluir payload da carreira no IndexedDB.", error);
  });
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

async function readSlotRaw(id: string) {
  try {
    const indexed = await readCareerPayload(id);
    if (indexed) return indexed;
  } catch (error) {
    console.error("[Futbobo] Falha ao ler carreira no IndexedDB.", error);
  }

  // Migração sob demanda para quem abre uma carreira antes do bootstrap terminar.
  const legacy = typeof window === "undefined" ? null : localStorage.getItem(slotKey(id));
  if (!parseUsableState(legacy)) return null;
  try {
    await writeCareerPayload(id, legacy as string);
    localStorage.removeItem(slotKey(id));
  } catch (error) {
    console.error("[Futbobo] Falha ao migrar slot legado para IndexedDB.", error);
  }
  return legacy;
}

export async function readCareerSlotState(id: string) {
  return parseUsableState(await readSlotRaw(id));
}

export async function loadActiveCareerState() {
  if (typeof window === "undefined") return null;
  const id = getActiveCareerId();
  if (id) {
    const state = await readCareerSlotState(id);
    if (state) return state;
  }

  // Compatibilidade com instalações anteriores à biblioteca de slots.
  return parseUsableState(localStorage.getItem(SAVE_KEY));
}

export async function persistActiveCareerState(state: GameState) {
  if (typeof window === "undefined" || !isUsableState(state) || state.challengeId) return false;
  const id = getActiveCareerId();
  if (!id) return false;
  const index = listCareerSaves();
  const meta = index.find((item) => item.id === id);
  if (!meta) return false;

  const raw = JSON.stringify(state);
  await writeCareerPayload(id, raw);

  // Só descartamos as cópias antigas depois que o IndexedDB confirmou a escrita.
  localStorage.removeItem(slotKey(id));
  localStorage.removeItem(SAVE_KEY);

  const nextMeta = metaFromState(state, { ...meta, lastPlayedAt: Date.now() });
  writeIndex(index.map((item) => item.id === id ? nextMeta : item));
  syncAchievements(state, nextMeta);
  return true;
}

/**
 * Mantido para chamadas antigas do shell. A carreira agora é persistida
 * diretamente pelo CareerGame, sem o buffer gigante no localStorage.
 */
export function syncActiveCareerSlot() {
  // no-op intencional
}

export async function bootstrapCareerStorage() {
  if (typeof window === "undefined") return;
  void requestDurableCareerStorage();

  let index = listCareerSaves();
  const initialActiveId = localStorage.getItem(ACTIVE_KEY) ?? "";
  const legacyActiveRaw = localStorage.getItem(SAVE_KEY);
  const legacyActiveState = parseUsableState(legacyActiveRaw);

  // Primeiro tira os payloads grandes de cada slot do localStorage. Cada chave
  // só é apagada depois da confirmação do IndexedDB, então a atualização é
  // segura mesmo se o navegador for fechado durante a migração.
  for (const meta of index) {
    const legacyRaw = localStorage.getItem(slotKey(meta.id));
    const legacyState = parseUsableState(legacyRaw);
    if (!legacyRaw || !legacyState) continue;
    try {
      await writeCareerPayload(meta.id, legacyRaw);
      localStorage.removeItem(slotKey(meta.id));
      syncAchievements(legacyState, meta, true);
    } catch (error) {
      console.error(`[Futbobo] Não foi possível migrar o slot ${meta.id}.`, error);
    }
  }

  if (legacyActiveState && legacyActiveState.phase !== "welcome" && !legacyActiveState.challengeId) {
    if (index.length === 0) {
      const now = Date.now();
      const meta = metaFromState(legacyActiveState, {
        id: `player-migrated-${now.toString(36)}`,
        mode: "player",
        createdAt: now,
        lastPlayedAt: now,
        name: legacyActiveState.name || "Carreira migrada",
        clubId: legacyActiveState.currentClubId || legacyActiveState.academyClubId || "",
        season: legacyActiveState.season,
        position: legacyActiveState.position,
        overall: legacyActiveState.overall,
        phase: legacyActiveState.phase,
        achievementsEligible: true,
      });
      try {
        await writeCareerPayload(meta.id, legacyActiveRaw as string);
        localStorage.removeItem(SAVE_KEY);
        writeIndex([meta]);
        localStorage.setItem(ACTIVE_KEY, meta.id);
        syncAchievements(legacyActiveState, meta, true);
        index = [meta];
      } catch (error) {
        console.error("[Futbobo] Falha ao migrar save legado para IndexedDB.", error);
      }
    } else if (initialActiveId && index.some((meta) => meta.id === initialActiveId)) {
      const meta = index.find((item) => item.id === initialActiveId) as CareerSaveMeta;
      try {
        // SAVE_KEY era o buffer mais recente da carreira ativa e pode estar à
        // frente da cópia antiga do slot, então ele vence durante a migração.
        await writeCareerPayload(initialActiveId, legacyActiveRaw as string);
        localStorage.removeItem(SAVE_KEY);
        const nextMeta = metaFromState(legacyActiveState, { ...meta, lastPlayedAt: Date.now() });
        writeIndex(index.map((item) => item.id === initialActiveId ? nextMeta : item));
        syncAchievements(legacyActiveState, nextMeta, true);
        index = index.map((item) => item.id === initialActiveId ? nextMeta : item);
      } catch (error) {
        console.error("[Futbobo] Falha ao migrar buffer ativo para IndexedDB.", error);
      }
    }
  }

  // Faz uma passada no IndexedDB para importar conquistas de slots que já
  // tinham sido migrados em uma execução anterior.
  for (const meta of index) {
    const state = await readCareerSlotState(meta.id);
    if (state) syncAchievements(state, meta, true);
  }
}

export type CareerStorageSnapshot = {
  version: 2;
  index: CareerSaveMeta[];
  activeId: string;
  slots: Record<string, GameState>;
  achievements: GlobalAchievementUnlock[];
};

export type CareerStorageImportResult = {
  imported: boolean;
  activeState: GameState | null;
};

export async function exportCareerStorageSnapshot(): Promise<CareerStorageSnapshot> {
  const index = listCareerSaves();
  const slots: Record<string, GameState> = {};
  for (const meta of index) {
    const state = await readCareerSlotState(meta.id);
    if (state) slots[meta.id] = state;
  }
  const usableIndex = index.filter((meta) => Boolean(slots[meta.id]));
  const currentActiveId = getActiveCareerId();
  const activeId = usableIndex.some((meta) => meta.id === currentActiveId)
    ? currentActiveId
    : usableIndex[0]?.id ?? "";
  return {
    version: 2,
    index: usableIndex,
    activeId,
    slots,
    achievements: readUnlocks(),
  };
}

export async function importCareerStorageSnapshot(value: unknown): Promise<CareerStorageImportResult> {
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

  // Libera imediatamente o localStorage antigo antes de reconstruir o índice.
  localStorage.removeItem(SAVE_KEY);
  for (const meta of currentIndex) localStorage.removeItem(slotKey(meta.id));

  await Promise.all(currentIndex.map((meta) => deleteCareerPayload(meta.id).catch(() => undefined)));
  for (const meta of importedIndex) {
    await writeCareerPayload(meta.id, JSON.stringify(rawSlots[meta.id]));
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
    return { imported: true, activeState: null };
  }

  const activeState = rawSlots[activeId] as GameState;
  localStorage.setItem(ACTIVE_KEY, activeId);
  return { imported: true, activeState };
}

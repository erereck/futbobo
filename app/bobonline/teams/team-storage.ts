// Times salvos e perfil do Bobonline: localStorage físico + hooks de leitura.
//
// Chaves (sempre via `bobKey`, para o ?perfil de teste separar "aparelhos"):
// - futbobo:bobonline-teams:v1   { version: 1, activeId, teams: BobTeam[] } (no máximo 6)
// - futbobo:bobonline-profile:v1 BobProfile
// O primeiro acesso no cliente (a primeira leitura do store) cria e grava um time
// sorteado e um apelido divertido: `firstRun` fica true nessa sessão da página.
// Os hooks são `useSyncExternalStore` sobre este módulo; as mutações são funções
// comuns (chamar em evento, nunca no render).

import { useSyncExternalStore } from "react";
import { bobKey, readJson, writeJson } from "../storage";
import { BOB_MAX_TEAMS, type BobProfile, type BobTeam } from "../types";
import { importTeamCode } from "./codes";
import { newSeed, newTeamId, randomBobTeam } from "./generator";
import { cleanNickname, randomNickname, sanitizeTeam } from "./model";

export const TEAMS_KEY = "futbobo:bobonline-teams:v1";
export const PROFILE_KEY = "futbobo:bobonline-profile:v1";

export type StoredTeams = { version: 1; activeId: string; teams: BobTeam[] };
export type ImportResult = { ok: true; team: BobTeam } | { ok: false; reason: "invalido" | "versao" | "limite" };

export type BobStoreSnapshot = {
  /** false no servidor (export estático): ainda não leu o aparelho. */
  ready: boolean;
  teams: BobTeam[];
  active: BobTeam;
  profile: BobProfile;
  /** Não havia time salvo na primeira leitura desta página (e o sorteado já foi gravado). */
  firstRun: boolean;
  /** A última gravação no aparelho deu certo (false: cota cheia ou modo privado). */
  persisted: boolean;
};

type UnknownRecord = Record<string, unknown>;

let snapshot: BobStoreSnapshot | null = null;
let serverSnapshot: BobStoreSnapshot | null = null;
const listeners = new Set<() => void>();

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function freshTeam(): BobTeam {
  const now = Date.now();
  return randomBobTeam(newSeed(), { id: newTeamId(), now });
}

function readTeams(): { teams: BobTeam[]; activeId: string | null } {
  const raw = readJson<unknown>(bobKey(TEAMS_KEY));
  const list = isRecord(raw) && Array.isArray(raw.teams) ? raw.teams : [];
  const teams: BobTeam[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const team = sanitizeTeam(item);
    if (!team || seen.has(team.id)) continue;
    seen.add(team.id);
    teams.push(team);
    if (teams.length === BOB_MAX_TEAMS) break;
  }
  return { teams, activeId: isRecord(raw) && typeof raw.activeId === "string" ? raw.activeId : null };
}

function readProfile(): { profile: BobProfile; repaired: boolean } {
  const raw = readJson<unknown>(bobKey(PROFILE_KEY));
  const stored = isRecord(raw) ? cleanNickname(raw.nickname) : null;
  const hints: BobProfile["hints"] = isRecord(raw) && isRecord(raw.hints) && raw.hints.leaveApp === true ? { leaveApp: true } : {};
  // Sem apelido salvo: sorteia um da lista divertida uma vez só e grava.
  return { profile: { version: 1, nickname: stored ?? randomNickname(newSeed()), hints }, repaired: stored === null };
}

function writeTeams(teams: BobTeam[], activeId: string): boolean {
  const data: StoredTeams = { version: 1, activeId, teams };
  return writeJson(bobKey(TEAMS_KEY), data);
}

function load(previous: BobStoreSnapshot | null): BobStoreSnapshot {
  const { teams, activeId } = readTeams();
  let persisted = true;
  const created = teams.length === 0;
  if (created) teams.push(freshTeam());
  const firstRun = previous ? previous.firstRun : created;
  const active = teams.find((team) => team.id === activeId) ?? teams[0];
  // Grava o time sorteado já na primeira leitura, e conserta um activeId que apontava para o nada.
  if (created || active.id !== activeId) persisted = writeTeams(teams, active.id);
  const { profile, repaired } = readProfile();
  if (repaired) persisted = writeJson(bobKey(PROFILE_KEY), profile) && persisted;
  return { ready: true, teams, active, profile, firstRun, persisted };
}

function emit() {
  for (const listener of [...listeners]) listener();
}

function current(): BobStoreSnapshot {
  if (!snapshot) snapshot = load(null);
  return snapshot;
}

function commit(next: Omit<BobStoreSnapshot, "persisted" | "ready" | "firstRun">, writeProfile = false): boolean {
  const base = current();
  const persisted = writeProfile ? writeJson(bobKey(PROFILE_KEY), next.profile) : writeTeams(next.teams, next.active.id);
  snapshot = { ...base, ...next, persisted };
  emit();
  return persisted;
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== bobKey(TEAMS_KEY) && event.key !== bobKey(PROFILE_KEY)) return;
  // Outra aba mexeu nos times: relê (sem perder o firstRun desta página).
  snapshot = load(snapshot);
  emit();
}

export function subscribeBobStore(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** Snapshot do aparelho (a primeira chamada lê o storage e, se não houver time, cria e grava um). */
export function getBobStoreSnapshot(): BobStoreSnapshot {
  return current();
}

/** Snapshot fixo do export estático: um time de vitrine, `ready: false`. */
export function getBobServerSnapshot(): BobStoreSnapshot {
  if (!serverSnapshot) {
    const team = randomBobTeam(1);
    serverSnapshot = { ready: false, teams: [team], active: team, profile: { version: 1, nickname: randomNickname(1), hints: {} }, firstRun: false, persisted: true };
  }
  return serverSnapshot;
}

/** Esquece o que está em memória e relê o aparelho na próxima leitura (testes, troca de perfil dev). */
export function resetBobStore(): void {
  snapshot = null;
  firstRunNoticeTaken = false;
  emit();
}

/** Aviso do primeiro acesso (§1.1), quando o time sorteado acabou de ser criado e gravado. */
export const FIRST_RUN_NOTICE = "Criamos um time para você. Edite à vontade!";
let firstRunNoticeTaken = false;

/**
 * O aviso do primeiro acesso, uma vez só por página: a primeira tela que pedir
 * (o início do B6 ou Meus times) mostra; depois volta null. Chamar em efeito ou evento.
 */
export function takeFirstRunNotice(): string | null {
  if (firstRunNoticeTaken || !current().firstRun) return null;
  firstRunNoticeTaken = true;
  return FIRST_RUN_NOTICE;
}

export function setActiveTeam(id: string): boolean {
  const base = current();
  const team = base.teams.find((item) => item.id === id);
  if (!team) return false;
  if (team.id === base.active.id) return true;
  return commit({ teams: base.teams, active: team, profile: base.profile });
}

/**
 * Grava um time (novo ou existente). Só entra time que passa no `sanitizeTeam`;
 * a cópia gravada é a saneada. false: inválido, limite de 6, ou o aparelho recusou.
 */
export function saveTeam(team: BobTeam): boolean {
  const base = current();
  const clean = sanitizeTeam({ ...team, updatedAt: Date.now() });
  if (!clean) return false;
  const index = base.teams.findIndex((item) => item.id === clean.id);
  if (index < 0 && base.teams.length >= BOB_MAX_TEAMS) return false;
  const teams = index < 0 ? [...base.teams, clean] : base.teams.map((item, at) => (at === index ? clean : item));
  const active = base.active.id === clean.id ? clean : (teams.find((item) => item.id === base.active.id) ?? teams[0]);
  return commit({ teams, active, profile: base.profile });
}

/** Exclui um time. O último não sai ("Você precisa de pelo menos um time."). */
export function removeTeam(id: string): boolean {
  const base = current();
  if (base.teams.length <= 1 || !base.teams.some((team) => team.id === id)) return false;
  const teams = base.teams.filter((team) => team.id !== id);
  const active = base.active.id === id ? teams[0] : base.active;
  commit({ teams, active, profile: base.profile });
  return true;
}

/** Novo time sorteado (null no limite de 6). Chamar em evento: usa crypto e o relógio. */
export function createTeam(): BobTeam | null {
  const base = current();
  if (base.teams.length >= BOB_MAX_TEAMS) return null;
  const team = freshTeam();
  commit({ teams: [...base.teams, team], active: base.active, profile: base.profile });
  return team;
}

export async function importTeam(code: string): Promise<ImportResult> {
  if (current().teams.length >= BOB_MAX_TEAMS) return { ok: false, reason: "limite" };
  const result = await importTeamCode(code);
  if (!result.ok) return result;
  // Releitura depois do await: outra ação pode ter enchido a lista nesse meio-tempo.
  const base = current();
  if (base.teams.length >= BOB_MAX_TEAMS) return { ok: false, reason: "limite" };
  const team = base.teams.some((item) => item.id === result.team.id) ? { ...result.team, id: newTeamId() } : result.team;
  commit({ teams: [...base.teams, team], active: base.active, profile: base.profile });
  return { ok: true, team };
}

/** Grava o apelido e devolve o que ficou valendo (curto demais: mantém o anterior). */
export function setNickname(name: string): string {
  const base = current();
  const nickname = cleanNickname(name);
  if (!nickname) return base.profile.nickname;
  if (nickname !== base.profile.nickname) commit({ teams: base.teams, active: base.active, profile: { ...base.profile, nickname } }, true);
  return nickname;
}

export function markHint(name: "leaveApp"): void {
  const base = current();
  if (base.profile.hints[name]) return;
  commit({ teams: base.teams, active: base.active, profile: { ...base.profile, hints: { ...base.profile.hints, [name]: true } } }, true);
}

export function useBobStore(): BobStoreSnapshot {
  return useSyncExternalStore(subscribeBobStore, getBobStoreSnapshot, getBobServerSnapshot);
}

export function useBobTeams() {
  const store = useBobStore();
  return {
    teams: store.teams,
    active: store.active,
    ready: store.ready,
    persisted: store.persisted,
    setActive: setActiveTeam,
    save: saveTeam,
    remove: removeTeam,
    create: createTeam,
    importCode: importTeam,
  };
}

export function useBobProfile() {
  const store = useBobStore();
  return { profile: store.profile, setNickname, markHint, firstRun: store.firstRun, ready: store.ready };
}

// ——— Aviso curto (toast) das telas de time ———
// Fica fora dos componentes para sobreviver à troca Meus times → Editar time
// ("Time importado!" aparece já no editor).

export type TeamsToast = { id: number; text: string };

let toast: TeamsToast | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const toastListeners = new Set<() => void>();

function emitToast() {
  for (const listener of [...toastListeners]) listener();
}

function subscribeToast(listener: () => void): () => void {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

export function showTeamsToast(text: string, ms = 2600): void {
  toast = { id: (toast?.id ?? 0) + 1, text };
  emitToast();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = null;
    toastTimer = null;
    emitToast();
  }, ms);
}

export function useTeamsToast(): TeamsToast | null {
  return useSyncExternalStore(subscribeToast, () => toast, () => null);
}

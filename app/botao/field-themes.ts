import type { BotaoMatchSetup } from "./types";

export type BotaoFieldTheme =
  | "classic"
  | "vertical"
  | "checker"
  | "diagonal"
  | "futsal-blue";

export const NORMAL_FIELD_THEMES = ["classic", "vertical", "checker", "diagonal"] as const satisfies readonly BotaoFieldTheme[];
export const FUTSAL_FIELD_CHANCE = 0.02;

const ROTATION_STORAGE_KEY = "futbobo-botao-field-rotation-v1";
const assignedThemes = new WeakMap<BotaoMatchSetup, BotaoFieldTheme>();
const assignedThemesByMatch = new Map<string, BotaoFieldTheme>();
const MAX_REMEMBERED_MATCH_THEMES = 64;
let memoryRotationCursor = 0;

function matchThemeKey(setup: BotaoMatchSetup) {
  return [
    setup.matchId,
    setup.seed,
    setup.userTeam.id,
    setup.cpuTeam.id,
    setup.competitionName,
    setup.stageName,
  ].join("|");
}

function rememberMatchTheme(key: string, theme: BotaoFieldTheme) {
  assignedThemesByMatch.set(key, theme);
  if (assignedThemesByMatch.size <= MAX_REMEMBERED_MATCH_THEMES) return;
  const oldestKey = assignedThemesByMatch.keys().next().value;
  if (oldestKey) assignedThemesByMatch.delete(oldestKey);
}

function randomRoll() {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] / 4294967296;
  }
  return Math.random();
}

function nextNormalTheme(): BotaoFieldTheme {
  let cursor = memoryRotationCursor;
  if (typeof window !== "undefined") {
    try {
      const stored = Number.parseInt(window.localStorage.getItem(ROTATION_STORAGE_KEY) ?? "", 10);
      if (Number.isFinite(stored) && stored >= 0) cursor = stored;
    } catch {
      // Usa o cursor em memória quando localStorage não estiver disponível.
    }
  }

  const theme = NORMAL_FIELD_THEMES[cursor % NORMAL_FIELD_THEMES.length];
  const nextCursor = (cursor + 1) % NORMAL_FIELD_THEMES.length;
  memoryRotationCursor = nextCursor;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ROTATION_STORAGE_KEY, String(nextCursor));
    } catch {
      // Sem persistência, a ordem ainda funciona durante a sessão atual.
    }
  }
  return theme;
}

/**
 * O sorteio raro acontece uma única vez por partida. O WeakMap mantém a
 * identidade da instância viva, enquanto a chave estável mantém o mesmo tema
 * quando a tela de resultado reconstrói o setup para desenhar o replay.
 *
 * Isso evita que cada re-render do replay seja interpretado como uma partida
 * nova e avance a rotação de gramados. As últimas partidas ficam lembradas só
 * em memória e a lista é limitada para não crescer durante sessões longas.
 *
 * Em 98% dos jogos, os quatro gramados seguem a ordem
 * classic -> vertical -> checker -> diagonal. Nos outros 2%, entra a quadra
 * azul de futsal sem consumir a rotação normal.
 */
export function fieldThemeForMatch(setup: BotaoMatchSetup): BotaoFieldTheme {
  const cached = assignedThemes.get(setup);
  if (cached) return cached;

  const key = matchThemeKey(setup);
  const remembered = assignedThemesByMatch.get(key);
  if (remembered) {
    assignedThemes.set(setup, remembered);
    return remembered;
  }

  const theme: BotaoFieldTheme = randomRoll() < FUTSAL_FIELD_CHANCE
    ? "futsal-blue"
    : nextNormalTheme();
  assignedThemes.set(setup, theme);
  rememberMatchTheme(key, theme);
  return theme;
}

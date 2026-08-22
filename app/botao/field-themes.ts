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
let memoryRotationCursor = 0;

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
 * O sorteio raro acontece uma única vez por instância real de partida. Usar o
 * objeto de setup como identidade evita que partidas novas com o mesmo seed e
 * matchId herdem para sempre uma quadra rara sorteada anteriormente.
 *
 * Em 98% dos jogos, os quatro gramados seguem a ordem
 * classic -> vertical -> checker -> diagonal. Nos outros 2%, entra a quadra
 * azul de futsal sem consumir a rotação normal.
 */
export function fieldThemeForMatch(setup: BotaoMatchSetup): BotaoFieldTheme {
  const cached = assignedThemes.get(setup);
  if (cached) return cached;

  const theme: BotaoFieldTheme = randomRoll() < FUTSAL_FIELD_CHANCE
    ? "futsal-blue"
    : nextNormalTheme();
  assignedThemes.set(setup, theme);
  return theme;
}

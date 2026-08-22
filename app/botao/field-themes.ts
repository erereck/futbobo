export type BotaoFieldTheme =
  | "classic"
  | "vertical"
  | "checker"
  | "diagonal"
  | "futsal-blue";

export const NORMAL_FIELD_THEMES = ["classic", "vertical", "checker", "diagonal"] as const satisfies readonly BotaoFieldTheme[];
export const FUTSAL_FIELD_CHANCE = 0.02;

const ROTATION_STORAGE_KEY = "futbobo-botao-field-rotation-v1";
const LAST_FIELD_STORAGE_KEY = "futbobo-botao-last-field-v1";
const assignedThemes = new Map<string, BotaoFieldTheme>();
let memoryRotationCursor = 0;

function stableHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fieldRoll(seed: number, matchId: string) {
  let value = (stableHash(matchId) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97) >>> 0;
  value ^= value >>> 15;
  return value / 4294967296;
}

function readStoredAssignment(key: string): BotaoFieldTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_FIELD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: string; theme?: BotaoFieldTheme };
    if (parsed.key !== key || !parsed.theme) return null;
    return parsed.theme;
  } catch {
    return null;
  }
}

function rememberAssignment(key: string, theme: BotaoFieldTheme) {
  assignedThemes.set(key, theme);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_FIELD_STORAGE_KEY, JSON.stringify({ key, theme }));
  } catch {
    // O jogo continua funcionando mesmo com storage bloqueado.
  }
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
 * Cada partida recebe um campo uma única vez. Em 98% dos jogos, os quatro
 * gramados seguem a ordem classic -> vertical -> checker -> diagonal. Os 2%
 * restantes viram a rara quadra azul de futsal sem consumir a rotação normal.
 */
export function fieldThemeForMatch(seed: number, matchId: string): BotaoFieldTheme {
  const key = `${seed}:${matchId}`;
  const cached = assignedThemes.get(key) ?? readStoredAssignment(key);
  if (cached) {
    assignedThemes.set(key, cached);
    return cached;
  }

  const theme: BotaoFieldTheme = fieldRoll(seed, matchId) < FUTSAL_FIELD_CHANCE
    ? "futsal-blue"
    : nextNormalTheme();
  rememberAssignment(key, theme);
  return theme;
}

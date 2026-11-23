import type { BotaoMatchSetup } from "./types";

export type BotaoFieldTheme =
  | "classic"
  | "vertical"
  | "checker"
  | "diagonal"
  | "futsal-blue"
  | "futsal-orange"
  | "street";

/** Variação do campo de rua: 0 rua do bairro, 1 terrão, 2 quadra da praça. */
export type BotaoStreetVariant = 0 | 1 | 2;

export const NORMAL_FIELD_THEMES = ["classic", "vertical", "checker", "diagonal"] as const satisfies readonly BotaoFieldTheme[];
export const FUTSAL_FIELD_THEMES = ["futsal-blue", "futsal-orange"] as const satisfies readonly BotaoFieldTheme[];
/** Chance de CADA quadra de futsal: 2% azul + 2% laranja. */
export const FUTSAL_FIELD_CHANCE = 0.02;

const ALL_FIELD_THEMES: readonly BotaoFieldTheme[] = [...NORMAL_FIELD_THEMES, ...FUTSAL_FIELD_THEMES, "street"];

/**
 * As três ruas do modo 3D (o 2D tem uma só, a rua do bairro). `mood` é a hora
 * do dia: muda céu, neblina e luz em `sceneMoodForMatch` (three/stadium.ts).
 */
export const STREET_VARIANTS = [
  { id: 0, key: "bairro", label: "Rua do bairro", mood: "day" },
  { id: 1, key: "terrao", label: "Terrão", mood: "sunset" },
  { id: 2, key: "praca", label: "Quadra da praça", mood: "night" },
] as const satisfies ReadonlyArray<{ id: BotaoStreetVariant; key: string; label: string; mood: "day" | "sunset" | "night" }>;

const ROTATION_STORAGE_KEY = "futbobo-botao-field-rotation-v1";
const assignedThemes = new WeakMap<BotaoMatchSetup, BotaoFieldTheme>();
const assignedThemesByMatch = new Map<string, BotaoFieldTheme>();
const MAX_REMEMBERED_MATCH_THEMES = 64;
let memoryRotationCursor = 0;

/** Quadra de futsal (azul ou laranja): áreas em meia-lua, sem bandeirinha, piso polido. */
export function isFutsalTheme(theme: BotaoFieldTheme): theme is (typeof FUTSAL_FIELD_THEMES)[number] {
  return theme === "futsal-blue" || theme === "futsal-orange";
}

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

/** Tema pedido pelo setup, só se for um dos conhecidos (setup pode vir da rede ou de um save antigo). */
function requestedTheme(setup: BotaoMatchSetup): BotaoFieldTheme | null {
  const theme = setup.fieldTheme;
  return theme && ALL_FIELD_THEMES.includes(theme) ? theme : null;
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
 * Em 96% dos jogos, os quatro gramados seguem a ordem
 * classic -> vertical -> checker -> diagonal. Nos outros 4%, entra uma quadra
 * de futsal (2% a azul, 2% a laranja) sem consumir a rotação normal.
 *
 * O campo de rua nunca sai no sorteio: só aparece quando o setup pede
 * (`setup.fieldTheme`, como a peneira ou o laboratório). Um tema pedido vence
 * sempre e fica no WeakMap da instância; não entra na memória por chave, para
 * um setup reconstruído SEM o pedido continuar com o sorteio dele.
 */
export function fieldThemeForMatch(setup: BotaoMatchSetup): BotaoFieldTheme {
  const cached = assignedThemes.get(setup);
  if (cached) return cached;

  const requested = requestedTheme(setup);
  if (requested) {
    assignedThemes.set(setup, requested);
    return requested;
  }

  const key = matchThemeKey(setup);
  const remembered = assignedThemesByMatch.get(key);
  if (remembered) {
    assignedThemes.set(setup, remembered);
    return remembered;
  }

  const roll = randomRoll();
  const theme: BotaoFieldTheme = roll < FUTSAL_FIELD_CHANCE
    ? "futsal-blue"
    : roll < FUTSAL_FIELD_CHANCE * 2
      ? "futsal-orange"
      : nextNormalTheme();
  assignedThemes.set(setup, theme);
  rememberMatchTheme(key, theme);
  return theme;
}

/**
 * Qual das três ruas o 3D monta: a pedida em `setup.streetVariant` ou uma
 * derivada da semente (a mesma partida, a mesma rua, sem sorteio guardado).
 * O 2D desenha sempre a rua do bairro (0).
 */
export function streetVariantForMatch(setup: BotaoMatchSetup): BotaoStreetVariant {
  const requested = setup.streetVariant;
  if (requested === 0 || requested === 1 || requested === 2) return requested;
  // Mistura os bits da semente: sementes vizinhas não caem sempre na mesma rua.
  let hash = Math.imul((Number(setup.seed) | 0) ^ 0x5bd1e995, 0x27d4eb2d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return ((hash >>> 0) % 3) as BotaoStreetVariant;
}

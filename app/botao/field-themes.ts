export type BotaoFieldTheme = "classic" | "checker-night" | "diagonal-sun" | "futsal-blue";

export const FIELD_THEME_CHANCES = {
  classic: 0.78,
  "checker-night": 0.12,
  "diagonal-sun": 0.08,
  "futsal-blue": 0.02,
} as const satisfies Record<BotaoFieldTheme, number>;

function stableHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A aparência é sorteada por partida, mas de forma determinística. Assim o
 * replay nunca troca o gramado que o jogador acabou de ver e um reload não
 * transforma a mesma final em outro estádio.
 */
export function fieldThemeForMatch(seed: number, matchId: string): BotaoFieldTheme {
  let value = (stableHash(matchId) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97) >>> 0;
  value ^= value >>> 15;
  const roll = value / 4294967296;

  if (roll < FIELD_THEME_CHANCES["futsal-blue"]) return "futsal-blue";
  if (roll < FIELD_THEME_CHANCES["futsal-blue"] + FIELD_THEME_CHANCES["diagonal-sun"]) return "diagonal-sun";
  if (roll < FIELD_THEME_CHANCES["futsal-blue"] + FIELD_THEME_CHANCES["diagonal-sun"] + FIELD_THEME_CHANCES["checker-night"]) return "checker-night";
  return "classic";
}

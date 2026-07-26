// Legibilidade de uniforme.
//
// Com 402 clubes, uma hora cai vermelho contra vermelho e a mesa fica
// impossível de ler. Aqui a cor do adversário é trocada quando fica perto
// demais da sua, e o número do botão escolhe tinta preta ou branca conforme o
// fundo — senão time de camisa branca some.

import type { BotaoTeam } from "./types";

type Rgb = { r: number; g: number; b: number };

const FALLBACK_KITS = ["#f5f7f2", "#1c1f26", "#2ca8ff", "#ffc72c", "#a675ff", "#ff7a45"];
const MIN_KIT_DISTANCE = 92;

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return { r: 128, g: 128, b: 128 };
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Distância perceptual barata (aproximação "redmean"). */
export function kitDistance(a: string, b: string): number {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  const meanRed = (first.r + second.r) / 2;
  const deltaR = first.r - second.r;
  const deltaG = first.g - second.g;
  const deltaB = first.b - second.b;
  return Math.sqrt(
    (2 + meanRed / 256) * deltaR * deltaR + 4 * deltaG * deltaG + (2 + (255 - meanRed) / 256) * deltaB * deltaB,
  );
}

/** Tinta legível (número da peça) para um fundo qualquer. */
export function readableInk(background: string): string {
  const { r, g, b } = hexToRgb(background);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? "#10271d" : "#ffffff";
}

/**
 * Garante que dá para diferenciar os dois times na mesa. Só o adversário muda —
 * a camisa do jogador é sagrada.
 */
export function ensureContrastingKits(user: BotaoTeam, cpu: BotaoTeam): { user: BotaoTeam; cpu: BotaoTeam } {
  if (kitDistance(user.primary, cpu.primary) >= MIN_KIT_DISTANCE) return { user, cpu };

  const candidates = [cpu.secondary, ...FALLBACK_KITS];
  const best = candidates
    .map((color) => ({ color, distance: kitDistance(user.primary, color) }))
    .sort((a, b) => b.distance - a.distance)[0];
  if (!best || best.distance < MIN_KIT_DISTANCE) {
    return { user, cpu: { ...cpu, primary: "#f5f7f2", secondary: "#1c1f26" } };
  }
  return {
    user,
    cpu: {
      ...cpu,
      primary: best.color,
      // Se o novo uniforme ficou perto do detalhe, troca o detalhe também.
      secondary: kitDistance(best.color, cpu.secondary) < 60 ? readableInk(best.color) : cpu.secondary,
    },
  };
}

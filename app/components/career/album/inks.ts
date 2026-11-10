import type { CSSProperties } from "react";

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return [0, 87, 168];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("")}`;
}

/** Luminância relativa (WCAG) de uma cor hex. */
export function luminance(hex: string) {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(hex: string, target: Rgb, amount: number) {
  const source = parseHex(hex);
  return toHex(source.map((channel, index) => channel + (target[index] - channel) * amount) as Rgb);
}

export const darken = (hex: string, amount: number) => mix(hex, [0, 0, 0], amount);
export const lighten = (hex: string, amount: number) => mix(hex, [255, 255, 255], amount);

/**
 * Cores de impressão do clube para o álbum. A faixa usa a cor mais escura das duas
 * (camisa branca vira faixa na cor secundária) e a tinta do texto sai do contraste.
 */
export function clubInks(primary: string, secondary: string): CSSProperties {
  const primaryLight = luminance(primary) > 0.6;
  const band = primaryLight && luminance(secondary) < 0.6 ? secondary : primary;
  const stripe = band === primary ? secondary : primary;
  const bandLight = luminance(band) > 0.45;
  return {
    "--club": band,
    "--club-deep": darken(band, 0.28),
    "--club-soft": lighten(band, 0.18),
    "--club-2": luminance(stripe) > 0.85 && !bandLight ? "#ffffff" : stripe,
    "--club-ink": bandLight ? "#161616" : "#ffffff",
  } as CSSProperties;
}

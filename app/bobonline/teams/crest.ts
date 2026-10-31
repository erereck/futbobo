// Escudo gerado do Bobonline: forma + cores + sigla, sem imagem nenhuma.
//
// O time viaja pela rede só com os parâmetros (≈2,5 KB por time) e cada aparelho
// redesenha o escudo aqui. `crestDataUrl` vira o `badge` do BotaoTeam, então o
// TeamCrest do placar mostra o mesmo desenho sem baixar nada.
// Tudo que entra no SVG é saneado aqui mesmo (o editor passa rascunhos crus).

import { readableInk } from "../../botao/kits";
import type { BobTeam } from "../types";
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, abbrChars } from "./model";

export type CrestTeam = Pick<BobTeam, "abbr" | "primary" | "secondary" | "crest">;

export const CREST_SHAPE_NAMES = ["Clássico", "Redondo", "Diamante", "Flâmula"] as const;

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const FONT = "'Barlow Condensed','Arial Narrow',Arial,sans-serif";

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && COLOR_PATTERN.test(value) ? value.toLowerCase() : fallback;
}

function shapeIndex(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(3, Math.round(value))) : 0;
}

// Formas no viewBox 44×44: contorno, faixa/anel de detalhe e altura do texto.
const SHAPES = [
  { outline: "M6 3H38V20C38 31 31 38 22 42C13 38 6 31 6 20Z", detail: (c: string) => `<path d='M6 3H38V10.5H6Z' fill='${c}'/>`, textY: 24, scale: 1 },
  { outline: "M22 3A19 19 0 1 1 21.99 3Z", detail: (c: string) => `<circle cx='22' cy='22' r='14.6' fill='none' stroke='${c}' stroke-width='1.4'/>`, textY: 22.5, scale: 0.94 },
  { outline: "M22 2L41 22L22 42L3 22Z", detail: (c: string) => `<path d='M22 7.5L35.5 22L22 36.5L8.5 22Z' fill='none' stroke='${c}' stroke-width='1.3'/>`, textY: 22.5, scale: 0.86 },
  { outline: "M7 3H37V40L22 32L7 40Z", detail: (c: string) => `<path d='M7 3H37V9.5H7Z' fill='${c}'/>`, textY: 20.5, scale: 1 },
] as const;

/** SVG inline do escudo (string pronta para innerHTML ou data URL). */
export function crestSvg(team: CrestTeam, size = 44): string {
  const primary = safeColor(team.primary, DEFAULT_PRIMARY);
  const secondary = safeColor(team.secondary, DEFAULT_SECONDARY);
  const shape = SHAPES[shapeIndex(team.crest)];
  const abbr = abbrChars(team.abbr);
  const fontSize = ([16, 16, 16, 13.4, 10.6][abbr.length] ?? 10.6) * shape.scale;
  const px = Math.max(8, Math.round(size));
  const text = abbr
    ? `<text x='22' y='${shape.textY}' text-anchor='middle' dominant-baseline='central' font-family="${FONT}" font-weight='800' font-size='${fontSize.toFixed(1)}' letter-spacing='-0.2' fill='${readableInk(primary)}'>${abbr}</text>`
    : "";
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44' width='${px}' height='${px}'>` +
    `<path d='${shape.outline}' fill='${primary}'/>` +
    shape.detail(secondary) +
    text +
    `<path d='${shape.outline}' fill='none' stroke='${secondary}' stroke-width='2.6' stroke-linejoin='round'/>` +
    `</svg>`
  );
}

/** "data:image/svg+xml;utf8,..." para o `badge` do BotaoTeam (TeamCrest usa next/image unoptimized). */
export function crestDataUrl(team: CrestTeam): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(crestSvg(team, 64))}`;
}

/** Miniatura 2D de uma estampa de uniforme (a mesma geometria de `drawKit`, em camisa). */
export function kitSvg(pattern: number, primaryRaw: string, secondaryRaw: string, size = 40): string {
  const primary = safeColor(primaryRaw, DEFAULT_PRIMARY);
  const secondary = safeColor(secondaryRaw, DEFAULT_SECONDARY);
  // Tronco 12..32 × 9..40; mangas à parte. As estampas ficam dentro do tronco, sem recorte.
  const leftSleeve = "M12 9L4 14L7 22L12 19Z";
  const rightSleeve = "M32 9L40 14L37 22L32 19Z";
  const rect = (x: number, y: number, w: number, h: number, extra = "") => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${secondary}'${extra}/>`;
  let sleeves = primary;
  let rightSleeveColor = primary;
  let art = "";
  switch (pattern) {
    case 0: art = rect(19, 9, 6, 31); break;
    case 2: for (const x of [13.2, 18.2, 23.2, 28.2]) art += rect(x, 9, 2.6, 31); break;
    case 3: art = rect(22, 9, 10, 31); rightSleeveColor = secondary; break;
    case 4: art = `<path d='M12 31L12 37L32 17L32 11Z' fill='${secondary}'/>`; break;
    case 5: art = `<path d='M12 14L22 22L32 14L32 19L22 27L12 19Z' fill='${secondary}'/>`; break;
    case 6: art = rect(12, 9, 20, 5); sleeves = secondary; rightSleeveColor = secondary; break;
    case 7: for (let x = 13.4; x < 32; x += 3.2) art += rect(Number(x.toFixed(1)), 9, 0.9, 31); break;
    case 8: art = rect(12, 21, 20, 6); break;
    case 9:
      for (let row = 0; row < 6; row += 1) for (let col = 0; col < 4; col += 1) if ((row + col) % 2 === 0) art += rect(12 + col * 5, 9 + row * 5.17, 5, 5.17);
      break;
    case 10: for (let band = 0; band < 6; band += 1) art += rect(12, 9 + band * 5.17, 20, 5.17, ` fill-opacity='${(0.12 + band * 0.15).toFixed(2)}'`); break;
    case 11: art = rect(12, 9, 2.6, 31) + rect(29.4, 9, 2.6, 31); sleeves = secondary; rightSleeveColor = secondary; break;
    default: break;
  }
  const px = Math.max(8, Math.round(size));
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44' width='${px}' height='${px}'>` +
    `<path d='${leftSleeve}' fill='${sleeves}'/><path d='${rightSleeve}' fill='${rightSleeveColor}'/>` +
    `<rect x='12' y='9' width='20' height='31' fill='${primary}'/>` +
    art +
    `<path d='M18 9L22 13.5L26 9' fill='none' stroke='rgba(0,0,0,.42)' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/>` +
    `<path d='M12 9L4 14L7 22L12 19V40H32V19L37 22L40 14L32 9Z' fill='none' stroke='rgba(0,0,0,.38)' stroke-width='1.1' stroke-linejoin='round'/>` +
    `</svg>`
  );
}

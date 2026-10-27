// Texturas pintadas em canvas para os bonecos 3D.
//
// Mesmo espírito do `player-appearance.ts`: nada de arquivo de imagem. O rosto
// é pixel art 16×16 (a cara de bloco do criador atual, agora numa cabeça de
// verdade) e a camisa reaproveita as 12 estampas da mesa 2D.

import * as THREE from "three";
import {
  BOOT_OPTIONS,
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_COLORS,
  accessoryColorOf,
  normalizePlayerAppearance,
  type PlayerAppearance,
} from "../../player-appearance";
import { readableInk } from "../kits";

// ---------------------------------------------------------------- cores

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return { r: 128, g: 128, b: 128 };
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function toHex(r: number, g: number, b: number) {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function shadeHex(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  return toHex(r + amount, g + amount, b + amount);
}

export function mixHex(a: string, b: string, t: number) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  return toHex(
    first.r + (second.r - first.r) * t,
    first.g + (second.g - first.g) * t,
    first.b + (second.b - first.b) * t,
  );
}

export function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// ------------------------------------------------------------ aparência

export type ResolvedLook = {
  skin: string;
  hair: string;
  /** Cor do topo do cabelo (o descolorido muda só aqui). */
  hairTop: string;
  eyes: string;
  hairStyle: number;
  beard: number;
  face: number;
  brow: number;
  kitPattern: number;
  /** Índices de HEADWEAR_NAMES, EYEWEAR_NAMES, EARRING_NAMES e FACE_MARK_NAMES; 0 = nenhum. */
  headwear: number;
  eyewear: number;
  earrings: number;
  faceMark: number;
  /** Cor da faixa/bandana/boné, da armação e da pintura. */
  accessory: string;
  /** Chuteira escolhida; null = sorteada pela camisa (o padrão de sempre). */
  bootColor: string | null;
};

export function resolveLook(value: PlayerAppearance): ResolvedLook {
  const appearance = normalizePlayerAppearance(value);
  const hair = appearance.customHairColor ?? HAIR_COLORS[appearance.hairColor];
  return {
    skin: appearance.customSkinColor ?? SKIN_COLORS[appearance.skin],
    hair,
    hairTop: appearance.hairStyle === 11 ? "#eee5c9" : hair,
    eyes: appearance.customEyeColor ?? EYE_COLORS[appearance.eyeColor],
    hairStyle: appearance.hairStyle,
    beard: appearance.beard,
    face: appearance.face,
    brow: appearance.brow,
    kitPattern: appearance.kitPattern,
    headwear: appearance.headwear ?? 0,
    eyewear: appearance.eyewear ?? 0,
    earrings: appearance.earrings ?? 0,
    faceMark: appearance.faceMark ?? 0,
    accessory: accessoryColorOf(appearance),
    bootColor: BOOT_OPTIONS[appearance.boots ?? 0]?.color ?? null,
  };
}

// ---------------------------------------------------------- canvas util

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasTexture(canvas: HTMLCanvasElement, pixelated = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (pixelated) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
  }
  texture.anisotropy = 4;
  return texture;
}

const GRID = 16;
/**
 * Texels por "pixel" do rosto. Com NearestFilter o desenho é o mesmo de 8; a
 * célula do atlas ganha margem inteira (abaixo) e cada pixel do rosto vira
 * exatamente 4×4 texels — grade regular e 1/3 da memória de antes.
 */
const CELL = 4;
/** Margem do atlas da cabeça em texels inteiros (contra sangria do mipmap). */
const HEAD_PAD_TEXELS = 4;
const HEAD_CELL = GRID * CELL + HEAD_PAD_TEXELS * 2;
/** Fração da célula da cabeça que é margem (para os UVs). */
export const HEAD_ATLAS_PAD = HEAD_PAD_TEXELS / HEAD_CELL;

type Pixel = (x: number, y: number, color: string, width?: number, height?: number) => void;

function gridCanvas(fill: string) {
  const canvas = makeCanvas(GRID * CELL, GRID * CELL);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const px: Pixel = (x, y, color, width = 1, height = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL, y * CELL, width * CELL, height * CELL);
  };
  return { canvas, ctx, px };
}

// ---------------------------------------------------------------- cabeça

export type FaceMood = "normal" | "blink" | "shout" | "sad" | "surprised" | "grit";

export const FACE_MOODS: readonly FaceMood[] = ["normal", "blink", "shout", "sad", "surprised", "grit"];

// Índices de HEADWEAR_NAMES, EYEWEAR_NAMES e EARRING_NAMES (player-appearance.ts).
export const HEADWEAR_BAND = 1;
export const HEADWEAR_TIARA = 2;
export const HEADWEAR_BANDANA = 3;
export const HEADWEAR_CAP = 4;
const EYEWEAR_GOGGLES = 1;
const EYEWEAR_MASK = 2;
const EYEWEAR_SUNGLASSES = 3;
export const EARRING_STUD = 1;
export const EARRING_HOOPS = 3;
/** Ouro dos brincos (pixel na orelha e caixinha no boneco). */
export const EARRING_GOLD = "#e8c25a";
const GOGGLE_STRAP = "#1d1e22";
const PROTECTIVE_MASK = "#16171a";
const SUNGLASS_LENS = "#14171c";

/** Boné e bandana cobrem o alto da cabeça: o volume de cabelo de cima some. */
export function coversScalp(look: ResolvedLook) {
  return look.headwear === HEADWEAR_CAP || look.headwear === HEADWEAR_BANDANA;
}

/** Cor de apoio do acessório (aba do boné, nó da bandana): mais escura, ou mais clara no preto. */
export function accessoryShade(color: string) {
  return luminance(color) < 0.16 ? shadeHex(color, 38) : shadeHex(color, -36);
}

export function beardColor(look: ResolvedLook) {
  return shadeHex(look.hair, -6);
}

/** Na máquina, com ou sem tufo: o cascão (22), o hi-top (26, o bloco vai em cima) e o moicano espetado (30) também. */
const STUBBLE_STYLES = new Set([3, 5, 15, 18, 20, 22, 26, 30]);

function stubble(look: ResolvedLook) {
  return mixHex(look.skin, look.hair, 0.42);
}

/** Couro cabeludo que aparece na risca e entre as tranças nagô. */
function scalpColor(look: ResolvedLook) {
  return mixHex(look.skin, look.hair, 0.22);
}

/** Linhas de cabelo na testa, por corte. */
function paintHairFront(px: Pixel, look: ResolvedLook) {
  const { hairStyle: style } = look;
  const hair = look.hairTop;
  const dark = shadeHex(hair, -22);
  const light = shadeHex(hair, 18);
  if (style === 12) return;
  if (STUBBLE_STYLES.has(style)) {
    px(0, 0, stubble(look), 16, 2);
    if (style === 3 || style === 30) px(6, 0, hair, 4, 2);
    if (style === 15) px(4, 0, hair, 8, 3);
    if (style === 18) { px(1, 0, hair, 14, 2); px(1, 2, dark, 9, 1); }
    if (style === 20) { px(3, 0, look.skin, 1, 2); px(6, 0, look.skin, 1, 2); }
    // Cascão 2002: o triângulo do topete com a ponta na testa.
    if (style === 22) { px(5, 0, hair, 6, 1); px(6, 1, hair, 4, 1); px(7, 2, hair, 2, 1); }
    // Hi-top: a base reta do bloco, laterais na máquina.
    if (style === 26) { px(1, 0, hair, 14, 2); px(1, 0, light, 14, 1); }
    return;
  }
  px(0, 0, hair, 16, 3);
  px(0, 0, light, 16, 1);
  switch (style) {
    case 0: px(0, 3, hair, 2, 2); px(14, 3, hair, 2, 2); break;
    case 1:
      px(0, 3, hair, 16, 1);
      for (let x = 1; x < 13; x += 3) px(x, 4, hair, 2, 1);
      px(0, 4, hair, 1, 2); px(15, 4, hair, 1, 2);
      break;
    case 2: case 21:
      for (let x = 0; x < 16; x += 2) px(x + (style === 21 ? 1 : 0), 3, hair, 1, 1);
      px(0, 3, hair, 1, 3); px(15, 3, hair, 1, 3);
      break;
    case 4: case 31: px(0, 3, hair, 16, 1); px(0, 4, hair, 2, 4); px(14, 4, hair, 2, 4); break;
    case 6: case 16:
      for (let x = 1; x < 16; x += 3) px(x, 0, dark, 1, 3);
      px(0, 3, hair, 1, 2); px(15, 3, hair, 1, 2);
      break;
    case 7: px(0, 3, hair, 11, 1); px(0, 4, hair, 6, 1); px(11, 1, dark, 1, 2); break;
    case 8: px(0, 3, hair, 2, 1); px(14, 3, hair, 2, 1); px(3, 3, light, 9, 1); break;
    case 9: for (const x of [0, 1, 14, 15]) px(x, 3, hair, 1, 6 + (x % 2) * 2); break;
    case 10: case 19: px(0, 1, dark, 16, 1); px(0, 3, hair, 1, 2); px(15, 3, hair, 1, 2); break;
    case 11: px(0, 2, look.hair, 16, 1); px(0, 3, look.hair, 2, 2); px(14, 3, look.hair, 2, 2); break;
    case 13: px(0, 3, hair, 2, 3); px(14, 3, hair, 2, 3); break;
    case 14: px(0, 3, hair, 16, 2); px(0, 5, hair, 2, 2); px(14, 5, hair, 2, 2); break;
    case 17: px(6, 3, hair, 10, 1); px(9, 4, hair, 7, 1); px(12, 5, hair, 4, 1); px(14, 6, hair, 2, 1); break;
    case 23:
      // Longo solto: mechas emoldurando o rosto até o queixo e a franja leve, de lado.
      px(0, 3, hair, 2, 13); px(14, 3, hair, 2, 13);
      px(2, 3, hair, 7, 1); px(2, 4, hair, 3, 1);
      break;
    case 24:
      // Arrepiado: franja em dente de serra.
      for (const x of [1, 5, 9, 13]) { px(x, 3, hair, 2, 1); px(x < 8 ? x + 1 : x, 4, hair, 1, 1); }
      px(3, 0, dark, 1, 2); px(12, 0, dark, 1, 2);
      break;
    case 25:
      // Repartido: risca no meio e as duas cortinas abrindo a testa em V.
      px(7, 0, mixHex(look.skin, hair, 0.4), 2, 1);
      px(7, 1, look.skin, 2, 1); px(6, 2, look.skin, 4, 1);
      px(0, 3, hair, 5, 1); px(11, 3, hair, 5, 1);
      px(0, 4, hair, 3, 1); px(13, 4, hair, 3, 1);
      px(0, 5, hair, 2, 1); px(14, 5, hair, 2, 1);
      break;
    case 27: {
      // Nagô: fileiras da testa para trás, com o couro entre elas.
      const groove = scalpColor(look);
      px(0, 2, look.skin, 16, 1);
      for (let x = 0; x < 16; x += 3) px(x, 0, groove, 1, 2);
      break;
    }
    case 28: px(7, 0, scalpColor(look), 2, 2); px(0, 3, hair, 1, 2); px(15, 3, hair, 1, 2); break;
    case 29:
      // Pra trás: entrada alta e limpa, fios penteados para trás.
      px(0, 2, look.skin, 16, 1);
      px(0, 2, hair, 1, 2); px(15, 2, hair, 1, 2);
      for (const x of [3, 6, 9, 12]) px(x, 1, dark, 1, 1);
      break;
    case 32:
      // Chanel: franja reta até a sobrancelha, laterais até o queixo.
      px(0, 3, hair, 16, 2); px(0, 4, dark, 16, 1);
      px(0, 5, hair, 1, 8); px(15, 5, hair, 1, 8);
      break;
    case 33: px(0, 3, hair, 1, 2); px(15, 3, hair, 1, 2); break;
    default: break;
  }
}

function paintBrows(px: Pixel, look: ResolvedLook, mood: FaceMood) {
  const brow = mixHex(shadeHex(look.hair, 10), "#2a1f1a", luminance(look.hair) > 0.7 ? 0.35 : 0);
  const row = mood === "shout" || mood === "surprised" ? 4 : 5 + (look.brow === 0 ? 1 : 0);
  // Grossa: nas expressões, cada traço ganha uma linha por cima.
  const up = look.brow === 4 ? 1 : 0;
  const stroke = (x: number, y: number, width: number) => px(x, y - up, brow, width, 1 + up);
  // Desconfiado: a sobrancelha da direita da imagem sobe (no rosto de sempre).
  const raise = look.face === 10 && (mood === "normal" || mood === "blink") ? 1 : 0;
  /** Onde passa o risco da "Com risco" (na sobrancelha da direita da imagem). */
  let slit: readonly [number, number] | null = null;
  if (mood === "sad") {
    stroke(3, row + 1, 2); stroke(5, row, 2);
    stroke(9, row, 2); stroke(11, row + 1, 2);
    slit = [11, row + 1];
  } else if (mood === "grit") {
    // Raça: sobrancelhas descem em direção ao nariz.
    stroke(3, 5, 2); stroke(5, 6, 2);
    stroke(9, 6, 2); stroke(11, 5, 2);
    slit = [11, 5];
  } else if (mood === "surprised") {
    // Arqueadas e altas.
    stroke(4, row - 1, 2); stroke(3, row, 1); stroke(6, row, 1);
    stroke(10, row - 1, 2); stroke(9, row, 1); stroke(12, row, 1);
    slit = [11, row - 1];
  } else if (look.brow === 2 && mood === "normal") {
    // Sobrancelha intensa: desce em direção ao nariz.
    px(3, row, brow, 3, 1); px(5, row + 1, brow, 2, 1);
    px(10, row - raise, brow, 3, 1); px(9, row + 1 - raise, brow, 2, 1);
  } else {
    const thick = look.brow === 2 || look.brow === 4 ? 2 : 1;
    px(3, row, brow, 4, thick);
    px(9, row - raise, brow, 4, thick);
    slit = [11, row - raise];
  }
  if (look.brow === 3 && slit) px(slit[0], slit[1], look.skin, 1, 1);
}

function paintEyes(px: Pixel, look: ResolvedLook, mood: FaceMood) {
  if (mood === "blink") {
    px(3, 8, shadeHex(look.skin, -48), 3, 1);
    px(10, 8, shadeHex(look.skin, -48), 3, 1);
    return;
  }
  const white = "#f4f1ea";
  const pupil = shadeHex(look.eyes, -38);
  if (mood === "shout") {
    px(3, 7, white, 3, 2); px(10, 7, white, 3, 2);
    px(4, 7, look.eyes, 1, 2); px(11, 7, look.eyes, 1, 2);
    return;
  }
  if (mood === "surprised") {
    // Olhos arregalados: 3×3 com a pupila pequena no meio.
    px(3, 6, white, 3, 3); px(10, 6, white, 3, 3);
    px(4, 7, pupil, 1, 1); px(11, 7, pupil, 1, 1);
    return;
  }
  if (mood === "grit") {
    // Olhos semicerrados de esforço.
    px(3, 8, white, 3, 1); px(10, 8, white, 3, 1);
    px(4, 8, look.eyes, 2, 1); px(10, 8, look.eyes, 2, 1);
    px(3, 7, shadeHex(look.skin, -26), 3, 1); px(10, 7, shadeHex(look.skin, -26), 3, 1);
    return;
  }
  px(3, 7, white, 3, 2);
  px(10, 7, white, 3, 2);
  px(4, 7, look.eyes, 2, 2);
  px(10, 7, look.eyes, 2, 2);
  px(5, 8, pupil, 1, 1);
  px(10, 8, pupil, 1, 1);
  if (mood === "sad") { px(3, 7, shadeHex(look.skin, -20), 3, 1); px(10, 7, shadeHex(look.skin, -20), 3, 1); }
  // Desconfiado: o olho do lado da sobrancelha baixa fica meio fechado.
  else if (look.face === 10) px(3, 7, shadeHex(look.skin, -20), 3, 1);
}

function paintBeard(px: Pixel, look: ResolvedLook) {
  const color = beardColor(look);
  const soft = mixHex(look.skin, color, 0.55);
  switch (look.beard) {
    case 1: px(6, 13, color, 4, 3); px(5, 11, color, 6, 1); break;
    case 2: case 8:
      // A longa é a cheia no rosto; o volume que desce do queixo é uma caixa no boneco.
      px(0, 9, color, 2, 7); px(14, 9, color, 2, 7);
      px(2, 12, color, 12, 4); px(4, 11, color, 8, 1);
      if (look.beard === 8) { px(2, 10, color, 1, 2); px(13, 10, color, 1, 2); }
      break;
    case 3: px(4, 11, color, 8, 1); px(4, 12, color, 1, 1); px(11, 12, color, 1, 1); break;
    case 4: px(0, 10, soft, 2, 6); px(14, 10, soft, 2, 6); px(2, 12, soft, 12, 4); px(5, 11, soft, 6, 1); break;
    case 5: px(1, 8, color, 1, 6); px(14, 8, color, 1, 6); px(2, 14, color, 12, 1); px(7, 13, color, 2, 3); break;
    case 6: px(5, 11, mixHex(look.skin, color, 0.7), 6, 1); break;
    case 7:
      for (const [x, y] of [[1, 11], [3, 13], [5, 14], [8, 15], [10, 14], [12, 13], [14, 11], [2, 14], [13, 14], [6, 15], [9, 13], [4, 12], [11, 12]]) {
        px(x, y, mixHex(look.skin, color, 0.4));
      }
      break;
    // Costeletas: só as laterais, do cabelo até o queixo.
    case 9: px(0, 4, color, 1, 9); px(15, 4, color, 1, 9); break;
    // Ferradura: bigode com as duas barras descendo até o queixo.
    case 10: px(4, 11, color, 8, 1); px(4, 12, color, 1, 4); px(11, 12, color, 1, 4); break;
    // Contorno: risco fino pela linha do maxilar.
    case 11: px(0, 10, color, 1, 6); px(15, 10, color, 1, 6); px(1, 15, color, 14, 1); break;
    default: break;
  }
}

/** Sardas, pinta, cicatriz, graxa e pintura: iguais em todos os humores. */
function paintFaceMark(px: Pixel, look: ResolvedLook) {
  switch (look.faceMark) {
    case 1: {
      const dot = mixHex(look.skin, "#8a4b2a", 0.42);
      for (const [x, y] of [[2, 9], [4, 9], [3, 10], [5, 10], [11, 9], [13, 9], [12, 10], [10, 10]]) px(x, y, dot);
      break;
    }
    case 2: px(12, 11, mixHex(look.skin, "#3b2418", 0.75)); break;
    case 3: {
      const scar = mixHex(look.skin, "#f6cdc2", 0.6);
      const edge = shadeHex(look.skin, -24);
      px(11, 9, scar); px(12, 10, scar); px(13, 11, scar);
      px(11, 10, edge); px(12, 11, edge);
      break;
    }
    case 4: px(3, 9, "#17171a", 3, 1); px(10, 9, "#17171a", 3, 1); break;
    case 5:
      px(1, 9, look.accessory, 4, 1); px(2, 11, look.accessory, 3, 1);
      px(11, 9, look.accessory, 4, 1); px(11, 11, look.accessory, 3, 1);
      break;
    default: break;
  }
}

function paintMouth(px: Pixel, look: ResolvedLook, mood: FaceMood) {
  const mouth = shadeHex(look.skin, -70);
  const teeth = "#f5eee2";
  if (mood === "shout") {
    px(5, 11, mouth, 6, 4);
    px(6, 11, teeth, 4, 1);
    px(6, 14, "#c0464a", 4, 1);
    return;
  }
  if (mood === "sad") {
    px(6, 12, mouth, 4, 1); px(5, 13, mouth, 1, 1); px(10, 13, mouth, 1, 1);
    return;
  }
  if (mood === "surprised") {
    // Boca em "O".
    px(6, 11, mouth, 4, 3);
    px(7, 12, shadeHex(look.skin, -110), 2, 1);
    return;
  }
  if (mood === "grit") {
    // Dentes cerrados.
    px(4, 11, mouth, 8, 3);
    px(5, 12, teeth, 6, 1);
    px(7, 12, mouth, 1, 1); px(9, 12, mouth, 1, 1);
    return;
  }
  switch (look.face) {
    case 0: px(5, 12, mouth, 6, 1); break;
    case 1: px(5, 12, mouth, 5, 1); px(10, 11, mouth, 1, 1); break;
    case 2: px(4, 11, mouth, 1, 1); px(11, 11, mouth, 1, 1); px(5, 12, mouth, 6, 1); px(6, 12, teeth, 4, 1); break;
    case 3: px(5, 12, mouth, 6, 2); break;
    case 4: px(5, 11, mouth, 1, 1); px(10, 11, mouth, 1, 1); px(6, 12, mouth, 4, 1); break;
    case 5: px(7, 11, mouth, 2, 3); break;
    case 6: px(5, 12, teeth, 6, 1); px(5, 13, mouth, 6, 1); px(4, 12, mouth, 1, 1); px(11, 12, mouth, 1, 1); break;
    case 7: px(7, 12, mouth, 2, 1); px(7, 13, shadeHex(look.skin, -40), 2, 1); break;
    case 9:
      // Sorrisão: boca aberta, dentes de cima à mostra e os cantos para cima.
      px(3, 10, mouth, 1, 1); px(12, 10, mouth, 1, 1);
      px(4, 11, mouth, 8, 2); px(5, 13, mouth, 6, 1);
      px(4, 11, teeth, 8, 1);
      px(6, 13, "#c0464a", 4, 1);
      break;
    case 10:
      // Desconfiado: boca de canto, puxada para um lado.
      px(5, 12, shadeHex(look.skin, -38), 2, 1); px(7, 12, mouth, 4, 1); px(11, 11, mouth, 1, 1);
      break;
    default: px(5, 12, mouth, 3, 1); px(8, 11, mouth, 3, 1); break;
  }
}

/** Óculos e máscara: pintados em todos os humores (piscar fica por trás da lente). */
function paintEyewear(px: Pixel, look: ResolvedLook) {
  const frame = look.accessory;
  switch (look.eyewear) {
    case EYEWEAR_GOGGLES:
      for (const x of [2, 9]) {
        px(x, 6, frame, 5, 1); px(x, 9, frame, 5, 1);
        px(x, 7, frame, 1, 2); px(x + 4, 7, frame, 1, 2);
        // Lente: só tinge o olho que já está pintado.
        px(x + 1, 7, "rgba(150, 215, 255, 0.3)", 3, 2);
        px(x + 1, 7, "rgba(255, 255, 255, 0.4)", 1, 1);
      }
      px(7, 7, frame, 2, 1);
      px(0, 7, GOGGLE_STRAP, 2, 1); px(14, 7, GOGGLE_STRAP, 2, 1);
      break;
    case EYEWEAR_MASK:
      // Máscara protetora: testa baixa, maçãs do rosto e o protetor do nariz, com os furos dos olhos.
      px(1, 6, PROTECTIVE_MASK, 14, 1);
      px(1, 7, PROTECTIVE_MASK, 2, 2); px(6, 7, PROTECTIVE_MASK, 4, 2); px(13, 7, PROTECTIVE_MASK, 2, 2);
      px(1, 9, PROTECTIVE_MASK, 14, 1);
      px(5, 10, PROTECTIVE_MASK, 6, 1);
      px(2, 6, "rgba(255, 255, 255, 0.18)", 3, 1); px(11, 6, "rgba(255, 255, 255, 0.18)", 3, 1);
      break;
    case EYEWEAR_SUNGLASSES:
      px(2, 7, SUNGLASS_LENS, 5, 2); px(9, 7, SUNGLASS_LENS, 5, 2);
      px(2, 6, frame, 5, 1); px(9, 6, frame, 5, 1);
      px(7, 7, frame, 2, 1);
      px(0, 7, frame, 2, 1); px(14, 7, frame, 2, 1);
      px(3, 7, "rgba(255, 255, 255, 0.34)", 1, 1); px(10, 7, "rgba(255, 255, 255, 0.34)", 1, 1);
      break;
    default: break;
  }
}

/** Bolinhas da bandana (estampa), em linhas alternadas. */
function bandanaDots(px: Pixel, look: ResolvedLook, y0: number, rows: number) {
  const dot = luminance(look.accessory) > 0.6 ? shadeHex(look.accessory, -60) : mixHex(look.accessory, "#ffffff", 0.6);
  for (let y = y0; y < y0 + rows; y += 1) {
    for (let x = (y * 2) % 4; x < 16; x += 4) px(x, y, dot);
  }
}

/**
 * Faixa, tiara, bandana e boné na frente, nos lados e na nuca (`rows` = até
 * onde desce em cada face). A faixa e a tiara ganham um anel fino no boneco;
 * o boné tem copa e aba de verdade (por cima da pintura).
 */
function paintHeadwear(px: Pixel, look: ResolvedLook, bandanaRows: number) {
  const color = look.accessory;
  const shade = accessoryShade(color);
  switch (look.headwear) {
    case HEADWEAR_BAND: px(0, 1, color, 16, 2); px(0, 2, mixHex(color, shade, 0.45), 16, 1); break;
    case HEADWEAR_TIARA: px(0, 1, color, 16, 1); break;
    case HEADWEAR_BANDANA:
      px(0, 0, color, 16, bandanaRows);
      bandanaDots(px, look, 0, bandanaRows - 1);
      px(0, bandanaRows - 1, shade, 16, 1);
      break;
    case HEADWEAR_CAP: px(0, 0, color, 16, 2); break;
    default: break;
  }
}

export function paintFace(look: ResolvedLook, mood: FaceMood): HTMLCanvasElement {
  const { canvas, px } = gridCanvas(look.skin);
  // Sombra suave do queixo e da testa sob o cabelo.
  px(0, 15, shadeHex(look.skin, -12), 16, 1);
  px(7, 10, shadeHex(look.skin, -18), 2, 1);
  px(1, 10, mixHex(look.skin, "#ff8a80", 0.12), 2, 1);
  px(13, 10, mixHex(look.skin, "#ff8a80", 0.12), 2, 1);
  paintBeard(px, look);
  paintFaceMark(px, look);
  paintMouth(px, look, mood);
  paintEyes(px, look, mood);
  paintBrows(px, look, mood);
  paintHairFront(px, look);
  paintEyewear(px, look);
  paintHeadwear(px, look, 3);
  return canvas;
}

/** Cabelo no lado da cabeça (`at` espelha a coluna para o lado -x). */
function paintSideHair(px: Pixel, look: ResolvedLook, at: (x: number, width?: number) => number) {
  const style = look.hairStyle;
  if (style === 12) return;
  if (STUBBLE_STYLES.has(style)) {
    px(0, 0, stubble(look), 16, style === 18 ? 5 : 4);
    if (style === 18) px(0, 0, look.hairTop, 16, 2);
    if (style === 15) px(0, 0, look.hairTop, 16, 1);
    return;
  }
  const hair = look.hairTop;
  const long = [4, 6, 9, 13, 14, 17, 31].includes(style);
  px(0, 0, hair, 16, long ? 6 : 4);
  px(at(10, 6), 4, hair, 6, long ? 9 : 4);
  px(at(0, 3), 4, hair, 3, 3);
  if ([4, 9, 13, 17, 31].includes(style)) px(at(9, 7), 8, hair, 7, 6);
  if (style === 11) px(at(0, 4), 3, look.hair, 4, 2);
  // Longo solto: o lado some atrás do cabelo, sobra a bochecha na frente.
  if (style === 23) px(at(2, 14), 0, hair, 14, 16);
  // Chanel: capacete até o queixo.
  if (style === 32) px(0, 0, hair, 16, 13);
  if (style === 27) {
    // Nagô: as fileiras correm da testa para a nuca.
    const groove = scalpColor(look);
    px(0, 2, groove, 16, 1);
    px(at(10, 6), 5, groove, 6, 1);
  }
  if (style === 29) px(0, 2, shadeHex(hair, -18), 16, 1);
  px(0, 0, shadeHex(hair, 16), 16, 1);
}

/** Lado da cabeça. `frontOnLeft` segue o mapeamento de UV do BoxGeometry (true = +x, a esquerda do jogador). */
function paintSide(look: ResolvedLook, frontOnLeft: boolean) {
  const { canvas, px } = gridCanvas(look.skin);
  const at = (x: number, width = 1) => (frontOnLeft ? x : GRID - x - width);
  px(at(6, 3), 7, shadeHex(look.skin, -14), 3, 4);
  px(at(7), 8, shadeHex(look.skin, -28), 1, 2);
  px(0, 15, shadeHex(look.skin, -12), 16, 1);
  paintSideHair(px, look, at);
  const beard = beardColor(look);
  if (look.beard === 2 || look.beard === 4 || look.beard === 8) {
    px(at(0, 4), 10, look.beard === 4 ? mixHex(look.skin, beard, 0.55) : beard, 4, 6);
  }
  if (look.beard === 9) px(at(4, 2), 4, beard, 2, 9);
  if (look.beard === 11) { px(at(0, 6), 15, beard, 6, 1); px(at(5), 9, beard, 1, 6); }
  // Brinco: um só fica na orelha esquerda do jogador (+x).
  if (look.earrings > 0 && (look.earrings !== EARRING_STUD || frontOnLeft)) {
    if (look.earrings === EARRING_HOOPS) {
      px(at(6), 11, EARRING_GOLD, 1, 2); px(at(8), 11, EARRING_GOLD, 1, 2); px(at(7), 13, EARRING_GOLD);
    } else px(at(7), 11, EARRING_GOLD);
  }
  if (look.eyewear === EYEWEAR_GOGGLES) px(0, 7, GOGGLE_STRAP, 16, 1);
  if (look.eyewear === EYEWEAR_MASK) px(0, 7, PROTECTIVE_MASK, 16, 1);
  if (look.eyewear === EYEWEAR_SUNGLASSES) px(at(0, 6), 7, look.accessory, 6, 1);
  paintHeadwear(px, look, 4);
  return canvas;
}

function paintBackHair(px: Pixel, look: ResolvedLook) {
  const style = look.hairStyle;
  if (style === 12) return;
  if (STUBBLE_STYLES.has(style)) {
    px(0, 0, stubble(look), 16, 9);
    if (style === 3 || style === 30) px(6, 0, look.hairTop, 4, 9);
    if (style === 15) px(4, 0, look.hairTop, 8, 4);
    if (style === 18) px(0, 0, look.hairTop, 16, 3);
    if (style === 26) px(1, 0, look.hairTop, 14, 2);
    return;
  }
  const hair = look.hairTop;
  const depth = style === 23 ? 16 : [4, 6, 9, 13, 14, 16, 17, 21, 31, 32].includes(style) ? 13 : 10;
  px(0, 0, hair, 16, depth);
  px(0, 0, shadeHex(hair, 16), 16, 1);
  for (let x = 1; x < 16; x += 4) px(x, 2, shadeHex(hair, -16), 1, depth - 3);
  if (style === 13) px(2, depth, hair, 12, 3);
  if (style === 11) px(0, depth - 2, look.hair, 16, 2);
  if (style === 27) for (let x = 0; x < 16; x += 3) px(x, 0, scalpColor(look), 1, depth);
  // Trança longa: o cabelo junta na nuca, de onde sai a trança (caixas).
  if (style === 33) { px(5, 7, shadeHex(hair, -20), 6, 1); px(6, 8, hair, 4, 4); px(6, 9, shadeHex(hair, -20), 4, 1); }
}

function paintBack(look: ResolvedLook) {
  const { canvas, px } = gridCanvas(look.skin);
  px(0, 15, shadeHex(look.skin, -14), 16, 1);
  paintBackHair(px, look);
  if (look.eyewear === EYEWEAR_GOGGLES) px(0, 7, GOGGLE_STRAP, 16, 1);
  if (look.eyewear === EYEWEAR_MASK) px(0, 7, PROTECTIVE_MASK, 16, 1);
  // A bandana desce mais na nuca, onde fica o nó.
  paintHeadwear(px, look, 6);
  return canvas;
}

function paintTop(look: ResolvedLook) {
  const style = look.hairStyle;
  const { canvas, px } = paintTopHair(look, style);
  if (look.headwear === HEADWEAR_BANDANA || look.headwear === HEADWEAR_CAP) {
    px(0, 0, look.accessory, 16, 16);
    if (look.headwear === HEADWEAR_BANDANA) bandanaDots(px, look, 0, 16);
  }
  return canvas;
}

function paintTopHair(look: ResolvedLook, style: number) {
  if (style === 12) {
    const grid = gridCanvas(look.skin);
    grid.px(4, 4, shadeHex(look.skin, 22), 3, 2);
    return grid;
  }
  const base = STUBBLE_STYLES.has(style) ? stubble(look) : style === 27 ? scalpColor(look) : look.hairTop;
  const grid = gridCanvas(base);
  const { px } = grid;
  // Linha 15 é a frente da cabeça; coluna 0 é o lado -x (direita do jogador).
  if (style === 3 || style === 30) px(6, 0, look.hairTop, 4, 16);
  if (style === 15) px(4, 0, look.hairTop, 8, 16);
  if (style === 18) px(1, 0, look.hairTop, 14, 16);
  if (style === 20) { px(3, 0, shadeHex(look.skin, 6), 1, 10); px(6, 0, shadeHex(look.skin, 6), 1, 10); }
  if (style === 22) { px(5, 12, look.hairTop, 6, 4); px(6, 10, look.hairTop, 4, 2); px(7, 9, look.hairTop, 2, 1); }
  if (style === 26) px(1, 1, look.hairTop, 14, 14);
  if (style === 27) for (let x = 1; x < 16; x += 3) px(x, 0, look.hairTop, 2, 16);
  if (!STUBBLE_STYLES.has(style) && style !== 27) {
    // Textura de fios: faixas finas, mais claras na frente (luz de cima).
    for (let y = 0; y < 16; y += 3) px(0, y, shadeHex(base, -12), 16, 1);
    px(0, 15, shadeHex(base, 14), 16, 1);
    if (style === 7) px(5, 0, shadeHex(base, -30), 1, 16);
    if (style === 6 || style === 16) for (let x = 1; x < 16; x += 3) px(x, 0, shadeHex(base, -28), 1, 16);
    // Risca no meio (aparece entre as duas metades do repartido e entre os coques).
    if (style === 25 || style === 28) px(7, 0, scalpColor(look), 2, 16);
    if (style === 29) {
      // Penteado para trás: os riscos do pente correm da testa para a nuca.
      for (const x of [2, 5, 10, 13]) px(x, 0, shadeHex(base, -26), 1, 16);
      px(0, 13, shadeHex(base, 22), 16, 1);
    }
  }
  return grid;
}

// ----------------------------------------------------------------- atlas

/** Fração de cada célula do atlas reservada como margem contra sangria do mipmap. */
const ATLAS_PAD = 0.04;

/**
 * Junta as 6 faces de uma caixa (ordem do BoxGeometry) num canvas 3×2. Uma
 * textura por caixa = um draw call por caixa, em vez de seis. Com `columns`
 * monta grades maiores (o atlas "pixel" do boneco usa 4×3).
 */
function atlasCanvas(faces: HTMLCanvasElement[], cellWidth: number, cellHeight: number, pixelated: boolean, pad = ATLAS_PAD, columns = 3) {
  const canvas = makeCanvas(cellWidth * columns, cellHeight * Math.max(2, Math.ceil(faces.length / columns)));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = !pixelated;
  // Pixel art: margem em texels inteiros para o miolo sair 1:1, sem pixel torto.
  const padX = pixelated ? Math.round(cellWidth * pad) : cellWidth * pad;
  const padY = pixelated ? Math.round(cellHeight * pad) : cellHeight * pad;
  faces.forEach((face, index) => {
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    // Esticada até a borda (a margem herda as cores da beirada), depois no miolo.
    ctx.drawImage(face, x, y, cellWidth, cellHeight);
    ctx.drawImage(face, x + padX, y + padY, cellWidth - padX * 2, cellHeight - padY * 2);
  });
  return canvas;
}

const atlasGeometryCache = new Map<string, THREE.BoxGeometry>();

/** Caixa com UVs apontando para as células do atlas 3×2. Compartilhada entre bonecos. */
export function atlasBoxGeometry(width: number, height: number, depth: number, pad = ATLAS_PAD) {
  const key = `${width}|${height}|${depth}|${pad}`;
  const cached = atlasGeometryCache.get(key);
  if (cached) return cached;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    // Com 1 segmento por eixo, cada face tem 4 vértices seguidos.
    const face = Math.floor(vertex / 4);
    const column = face % 3;
    const row = Math.floor(face / 3);
    const u = (column + pad + uv.getX(vertex) * (1 - pad * 2)) / 3;
    // Linha 0 do canvas é a metade de cima da textura (v de 0,5 a 1).
    const v = (1 - row + pad + uv.getY(vertex) * (1 - pad * 2)) / 2;
    uv.setXY(vertex, u, v);
  }
  geometry.clearGroups();
  atlasGeometryCache.set(key, geometry);
  return geometry;
}

/** Caixa da cabeça 8×8×8 com os UVs do atlas de margem inteira. */
export function headBoxGeometry() {
  return atlasBoxGeometry(8, 8, 8, HEAD_ATLAS_PAD);
}

/** Um atlas por humor do rosto; trocar a expressão é só trocar o `map`. */
export type HeadTextures = Record<FaceMood, THREE.Texture>;

/** As 5 faces fixas da cabeça: +x, -x, +y, -y e -z (a frente, +z, é o rosto de cada humor). */
function paintHeadFaces(look: ResolvedLook) {
  return {
    sideFront: paintSide(look, true),
    sideBack: paintSide(look, false),
    top: paintTop(look),
    bottom: gridCanvas(shadeHex(look.skin, -24)).canvas,
    back: paintBack(look),
  };
}

export function createHeadTextures(look: ResolvedLook): HeadTextures {
  const { sideFront, sideBack, top, bottom, back } = paintHeadFaces(look);
  const build = (mood: FaceMood) =>
    canvasTexture(atlasCanvas([sideFront, sideBack, top, bottom, paintFace(look, mood), back], HEAD_CELL, HEAD_CELL, true, HEAD_ATLAS_PAD), true);
  return {
    normal: build("normal"),
    blink: build("blink"),
    shout: build("shout"),
    sad: build("sad"),
    surprised: build("surprised"),
    grit: build("grit"),
  };
}

// ---------------------------------------------------------------- camisa

export type KitFace = "front" | "back" | "left" | "right";

/**
 * As mesmas 12 estampas do busto 2D, agora em quatro faces. `left`/`right`
 * são os lados do próprio jogador (+x é a esquerda dele, porque ele olha para +z).
 */
function paintKitPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pattern: number,
  primary: string,
  secondary: string,
  face: KitFace,
) {
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = secondary;
  const side = face === "left" || face === "right";
  // Na frente a esquerda do jogador fica à direita da textura; nas costas, à esquerda.
  const playerLeftOnRight = face === "front";
  switch (pattern) {
    case 0:
      if (!side) ctx.fillRect(width * 0.38, 0, width * 0.24, height);
      break;
    case 2:
      for (let index = 0; index < 5; index += 1) ctx.fillRect(width * (0.06 + index * 0.2), 0, width * 0.1, height);
      break;
    case 3:
      if (side) {
        if (face === "left") ctx.fillRect(0, 0, width, height);
      } else if (playerLeftOnRight) ctx.fillRect(width / 2, 0, width / 2, height);
      else ctx.fillRect(0, 0, width / 2, height);
      break;
    case 4:
      if (!side) {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(face === "front" ? -0.62 : 0.62);
        ctx.fillRect(-width * 0.11, -height, width * 0.22, height * 2);
        ctx.restore();
      }
      break;
    case 5:
      if (!side) {
        ctx.beginPath();
        ctx.moveTo(0, height * 0.12);
        ctx.lineTo(width / 2, height * 0.42);
        ctx.lineTo(width, height * 0.12);
        ctx.lineTo(width, height * 0.3);
        ctx.lineTo(width / 2, height * 0.6);
        ctx.lineTo(0, height * 0.3);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 6:
      ctx.fillRect(0, 0, width, height * 0.22);
      if (!side) { ctx.fillRect(0, 0, width * 0.16, height * 0.45); ctx.fillRect(width * 0.84, 0, width * 0.16, height * 0.45); }
      break;
    case 7:
      for (let x = width * 0.06; x < width; x += width * 0.14) ctx.fillRect(x, 0, Math.max(1.5, width * 0.035), height);
      break;
    case 8:
      ctx.fillRect(0, height * 0.36, width, height * 0.26);
      break;
    case 9: {
      const cell = width / 4;
      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
          if ((Math.round(x / cell) + Math.round(y / cell)) % 2 === 0) ctx.fillRect(x, y, cell, cell);
        }
      }
      break;
    }
    case 10: {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, secondary);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case 11:
      if (side) ctx.fillRect(0, 0, width, height);
      else { ctx.fillRect(0, 0, width * 0.12, height); ctx.fillRect(width * 0.88, 0, width * 0.12, height); }
      break;
    default:
      break;
  }
}

/** Cor da manga, que na estampa "Ombros" e "Mangas contrastantes" vira a secundária. */
export function sleeveColor(pattern: number, primary: string, secondary: string) {
  return pattern === 6 || pattern === 11 ? secondary : primary;
}

export type KitTextures = {
  /** Atlas 3×2 na ordem do BoxGeometry: +x (esquerda do jogador), -x, +y, -y, +z (peito), -z (costas). */
  torso: THREE.Texture;
};

export function createKitTextures(args: {
  pattern: number;
  primary: string;
  secondary: string;
  number: number;
}): KitTextures {
  return { torso: canvasTexture(paintKitAtlas(args)) };
}

/** Atlas 3×2 da camisa (192×192), na ordem do BoxGeometry. */
function paintKitAtlas(args: { pattern: number; primary: string; secondary: string; number: number }) {
  const { pattern, primary, secondary } = args;
  const width = 64;
  const height = 96;
  const ink = readableInk(primary);
  const outline = ink === "#ffffff" ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.35)";

  const paint = (face: KitFace, w = width, h = height) => {
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d")!;
    paintKitPattern(ctx, w, h, pattern, primary, secondary, face);
    // Barra e costuras: dão volume sem iluminação extra.
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.fillRect(0, h - 6, w, 6);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(0, 0, w, 3);
    return { canvas, ctx };
  };

  const front = paint("front");
  // Gola em V.
  front.ctx.fillStyle = secondary === primary ? ink : secondary;
  front.ctx.beginPath();
  front.ctx.moveTo(width * 0.3, 0);
  front.ctx.lineTo(width / 2, height * 0.14);
  front.ctx.lineTo(width * 0.7, 0);
  front.ctx.lineTo(width * 0.6, 0);
  front.ctx.lineTo(width / 2, height * 0.08);
  front.ctx.lineTo(width * 0.4, 0);
  front.ctx.closePath();
  front.ctx.fill();
  // Escudinho no peito esquerdo do jogador (direita da textura).
  front.ctx.fillStyle = ink;
  front.ctx.globalAlpha = 0.85;
  front.ctx.beginPath();
  front.ctx.moveTo(width * 0.66, height * 0.2);
  front.ctx.lineTo(width * 0.82, height * 0.2);
  front.ctx.lineTo(width * 0.82, height * 0.3);
  front.ctx.lineTo(width * 0.74, height * 0.36);
  front.ctx.lineTo(width * 0.66, height * 0.3);
  front.ctx.closePath();
  front.ctx.fill();
  front.ctx.globalAlpha = 1;
  // Número pequeno no peito, como camisa de jogo.
  front.ctx.font = "800 15px ui-sans-serif, system-ui, sans-serif";
  front.ctx.textAlign = "center";
  front.ctx.textBaseline = "middle";
  front.ctx.fillStyle = ink;
  front.ctx.fillText(String(args.number), width * 0.3, height * 0.29);

  const back = paint("back");
  back.ctx.font = "900 50px ui-sans-serif, system-ui, sans-serif";
  back.ctx.textAlign = "center";
  back.ctx.textBaseline = "middle";
  back.ctx.lineWidth = 4;
  back.ctx.strokeStyle = outline;
  back.ctx.strokeText(String(args.number), width / 2, height * 0.5);
  back.ctx.fillStyle = ink;
  back.ctx.fillText(String(args.number), width / 2, height * 0.5);

  const left = paint("left", 32, height);
  const right = paint("right", 32, height);
  const topCanvas = makeCanvas(64, 32);
  const topCtx = topCanvas.getContext("2d")!;
  topCtx.fillStyle = pattern === 6 ? secondary : primary;
  topCtx.fillRect(0, 0, 64, 32);
  topCtx.fillStyle = secondary === primary ? ink : secondary;
  topCtx.fillRect(22, 10, 20, 12);
  const bottomCanvas = makeCanvas(8, 8);
  const bottomCtx = bottomCanvas.getContext("2d")!;
  bottomCtx.fillStyle = shadeHex(primary, -30);
  bottomCtx.fillRect(0, 0, 8, 8);

  return atlasCanvas([left.canvas, right.canvas, topCanvas, bottomCanvas, front.canvas, back.canvas], width, height, false);
}

// ----------------------------------------------------------------- terno

export type SuitTie = "tie" | "bow" | "none";

/** Paletó da gala (Bola de Ouro) no lugar da camisa: mesmo atlas 3×2, sem número. */
export function createSuitTextures(args: { jacket: string; shirt: string; tie: string; tieStyle: SuitTie }): KitTextures {
  return { torso: canvasTexture(paintSuitAtlas(args)) };
}

function paintSuitAtlas({ jacket, shirt, tie, tieStyle }: { jacket: string; shirt: string; tie: string; tieStyle: SuitTie }) {
  const width = 64;
  const height = 96;
  // No paletó preto a costura escura some: as linhas viram um brilho.
  const darkCloth = luminance(jacket) < 0.14;
  const seam = darkCloth ? shadeHex(jacket, 34) : shadeHex(jacket, -38);
  const lapel = shadeHex(jacket, darkCloth ? 16 : 12);

  const cloth = (w: number, h: number) => {
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = jacket;
    ctx.fillRect(0, 0, w, h);
    // Volume do tecido: bordas um pouco mais escuras e uma trama fina.
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, "rgba(0,0,0,.16)");
    shade.addColorStop(0.22, "rgba(0,0,0,0)");
    shade.addColorStop(0.78, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,.16)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,.035)";
    for (let y = 1; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(0, h - 4, w, 4);
    ctx.fillStyle = "rgba(255,255,255,.1)";
    ctx.fillRect(0, 0, w, 2);
    return { canvas, ctx };
  };
  const line = (ctx: CanvasRenderingContext2D, points: Array<[number, number]>, color = seam, lineWidth = 1.4) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    points.forEach(([x, y], index) => (index ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height)));
    ctx.stroke();
  };
  const shape = (ctx: CanvasRenderingContext2D, points: Array<[number, number]>, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    points.forEach(([x, y], index) => (index ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height)));
    ctx.closePath();
    ctx.fill();
  };

  const front = cloth(width, height);
  const f = front.ctx;
  // Camisa no V do paletó, com a gola marcada.
  const vee: Array<[number, number]> = [[0.29, 0], [0.71, 0], [0.5, 0.43]];
  shape(f, vee, shirt);
  line(f, [[0.36, 0], [0.45, 0.08]], "rgba(0,0,0,.2)", 1);
  line(f, [[0.64, 0], [0.55, 0.08]], "rgba(0,0,0,.2)", 1);
  if (tieStyle === "tie") {
    // Gravata: nó no colarinho e a lâmina descendo até onde o paletó fecha.
    f.save();
    f.beginPath();
    vee.forEach(([x, y], index) => (index ? f.lineTo(x * width, y * height) : f.moveTo(x * width, y * height)));
    f.closePath();
    f.clip();
    shape(f, [[0.44, 0.015], [0.56, 0.015], [0.54, 0.085], [0.46, 0.085]], shadeHex(tie, -18));
    shape(f, [[0.46, 0.085], [0.54, 0.085], [0.58, 0.4], [0.5, 0.46], [0.42, 0.4]], tie);
    line(f, [[0.47, 0.2], [0.53, 0.26]], "rgba(255,255,255,.18)", 1);
    f.restore();
  }
  // Lapelas: faixas do próprio tecido dobrado, com o entalhe perto do ombro.
  for (const side of [1, -1]) {
    const x = (value: number) => (side > 0 ? value : 1 - value);
    const points: Array<[number, number]> = [[x(0.29), 0], [x(0.13), 0], [x(0.17), 0.12], [x(0.11), 0.15], [x(0.45), 0.5], [x(0.5), 0.43]];
    shape(f, points, lapel);
    line(f, points.slice(1, 5), seam, 1.2);
  }
  if (tieStyle === "bow") {
    // Gravata-borboleta no colarinho, por cima das lapelas.
    shape(f, [[0.5, 0.055], [0.35, 0.015], [0.35, 0.105]], tie);
    shape(f, [[0.5, 0.055], [0.65, 0.015], [0.65, 0.105]], tie);
    shape(f, [[0.46, 0.035], [0.54, 0.035], [0.54, 0.08], [0.46, 0.08]], shadeHex(tie, -24));
  }
  // Fechamento: a frente desce do V e abre um pouco embaixo; dois botões.
  line(f, [[0.5, 0.45], [0.5, 0.82], [0.43, 1]]);
  line(f, [[0.5, 0.82], [0.57, 1]]);
  f.fillStyle = darkCloth ? shadeHex(jacket, 40) : shadeHex(jacket, -48);
  for (const y of [0.56, 0.7]) {
    f.beginPath();
    f.arc(0.5 * width - 2.5, y * height, 1.9, 0, Math.PI * 2);
    f.fill();
  }
  // Lencinho no bolso do peito esquerdo do jogador (direita da textura).
  shape(f, [[0.69, 0.3], [0.72, 0.255], [0.76, 0.275], [0.79, 0.25], [0.81, 0.3]], tieStyle === "none" ? shirt : tie);
  line(f, [[0.66, 0.3], [0.86, 0.3]]);
  // Bolsos com aba.
  line(f, [[0.1, 0.79], [0.34, 0.79]], seam, 1.6);
  line(f, [[0.66, 0.79], [0.9, 0.79]], seam, 1.6);

  const back = cloth(width, height);
  // Gola do paletó, costura do meio e a fenda.
  back.ctx.fillStyle = shadeHex(jacket, darkCloth ? 12 : -16);
  back.ctx.fillRect(0, 0, width, height * 0.06);
  back.ctx.fillStyle = shirt;
  back.ctx.fillRect(width * 0.3, 0, width * 0.4, 2);
  line(back.ctx, [[0.5, 0.06], [0.5, 1]], seam, 1);
  line(back.ctx, [[0.5, 0.8], [0.5, 1]], "rgba(0,0,0,.35)", 2);

  const left = cloth(32, height);
  const right = cloth(32, height);
  for (const side of [left, right]) {
    side.ctx.fillStyle = seam;
    side.ctx.fillRect(15, 0, 1.2, height);
  }
  const topCanvas = makeCanvas(64, 32);
  const topCtx = topCanvas.getContext("2d")!;
  topCtx.fillStyle = jacket;
  topCtx.fillRect(0, 0, 64, 32);
  topCtx.fillStyle = shirt;
  topCtx.fillRect(22, 10, 20, 12);
  const bottomCanvas = makeCanvas(8, 8);
  const bottomCtx = bottomCanvas.getContext("2d")!;
  bottomCtx.fillStyle = shadeHex(jacket, -30);
  bottomCtx.fillRect(0, 0, 8, 8);

  return atlasCanvas([left.canvas, right.canvas, topCanvas, bottomCanvas, front.canvas, back.canvas], width, height, false);
}

/** Texels de altura das listras (meião, chuteira). */
const STRIPE_TEXELS = 32;

/**
 * Pinta as faixas de cima para baixo em `height` texels, com o mesmo
 * arredondamento da listra original de 32 (a fronteira cai na mesma fração).
 */
function paintStripes(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, colors: Array<[string, number]>) {
  const scale = height / STRIPE_TEXELS;
  let row = 0;
  for (const [color, share] of colors) {
    const rows = Math.min(Math.round(share * STRIPE_TEXELS), STRIPE_TEXELS - row);
    ctx.fillStyle = color;
    if (rows > 0) ctx.fillRect(x, y + row * scale, width, rows * scale);
    row += rows;
  }
  if (row < STRIPE_TEXELS) ctx.fillRect(x, y + row * scale, width, (STRIPE_TEXELS - row) * scale);
}

/** Meião com a faixa do clube no alto e chuteira com solado: uma textura cada. */
export function stripeTexture(colors: Array<[string, number]>) {
  const canvas = makeCanvas(8, STRIPE_TEXELS);
  paintStripes(canvas.getContext("2d")!, 0, 0, 8, STRIPE_TEXELS, colors);
  return canvasTexture(canvas, true);
}

// ------------------------------------------------------ atlas do boneco

// Atlas "pixel" do boneco (o mesmo filtro Nearest da cabeça), 4×3 células de
// HEAD_CELL: as 5 faces fixas da cabeça, os 6 humores do rosto e uma célula com
// meião, chuteira e retalhos de cor sólida. Junto com o atlas da camisa, é tudo
// o que o boneco desenha: um material, uma malha, um draw call.
const PIXEL_COLUMNS = 4;
const PIXEL_ROWS = 3;
const PIXEL_WIDTH = HEAD_CELL * PIXEL_COLUMNS;
const PIXEL_HEIGHT = HEAD_CELL * PIXEL_ROWS;
/** Célula de cada face da caixa da cabeça (ordem do BoxGeometry: +x, -x, +y, -y, +z, -z). */
const HEAD_FACE_CELLS = [0, 1, 2, 3, 5, 4] as const;
/** Primeira célula dos humores (na ordem de FACE_MOODS); a frente da cabeça aponta para ela. */
const MOOD_CELL = 5;
/** Célula das listras e cores sólidas. */
const MISC_CELL = 11;
/** Listras na célula: 2 texels por texel da listra original, com margem em cima e embaixo. */
const STRIPE_PAD = 4;
const STRIPE_HEIGHT = STRIPE_TEXELS * 2;
const STRIPE_WIDTH = 28;
const STRIPE_COUNT = 2;
/**
 * Retalhos sólidos: duas colunas de 8×8 texels à direita das listras. Lidos
 * no centro (entre dois texels do mesmo retalho), com 4 texels de folga até o
 * vizinho: o Nearest nunca sangra.
 */
const SOLID_X = STRIPE_WIDTH * STRIPE_COUNT;
const SOLID_HEIGHT = 8;
const SOLID_COLUMNS = 2;
const SOLID_WIDTH = (HEAD_CELL - SOLID_X) / SOLID_COLUMNS;
const SOLID_ROWS = Math.floor(HEAD_CELL / SOLID_HEIGHT);
const SOLID_COUNT = SOLID_ROWS * SOLID_COLUMNS;

const cellX = (cell: number) => (cell % PIXEL_COLUMNS) * HEAD_CELL;
const cellY = (cell: number) => Math.floor(cell / PIXEL_COLUMNS) * HEAD_CELL;

/** Deslocamento de UV da frente da cabeça, do rosto "normal" até cada humor. */
export const FACE_MOOD_SHIFT: Readonly<Record<FaceMood, readonly [number, number]>> = (() => {
  const result = {} as Record<FaceMood, readonly [number, number]>;
  FACE_MOODS.forEach((mood, index) => {
    const cell = MOOD_CELL + index;
    result[mood] = [(cellX(cell) - cellX(MOOD_CELL)) / PIXEL_WIDTH, -(cellY(cell) - cellY(MOOD_CELL)) / PIXEL_HEIGHT];
  });
  return result;
})();

export type FigurePixelAtlas = {
  texture: THREE.Texture;
  /** UV no atlas para o UV local (0..1) da face `face` (ordem do BoxGeometry) da cabeça. */
  head: (face: number, u: number, v: number) => [number, number];
  /** Listra `index` (na ordem pedida): u fixo no meio do retalho, `v` (0..1) ao longo da altura. */
  stripe: (index: number, v: number) => [number, number];
  /** Centro do retalho de cor sólida `index` (na ordem pedida). */
  solid: (index: number) => [number, number];
};

/**
 * Uma textura por boneco no lugar dos 6 atlas da cabeça e das 2 listras.
 * Mesmos texels e mesmo filtro: a cabeça e as listras ficam idênticas. As
 * cores sólidas são lidas num ponto fixo (derivada zero = nível 0 do mipmap,
 * sem sangrar para o vizinho).
 */
export function createFigurePixelAtlas(look: ResolvedLook, parts: { stripes: Array<Array<[string, number]>>; solids: string[] }): FigurePixelAtlas {
  if (parts.stripes.length > STRIPE_COUNT || parts.solids.length > SOLID_COUNT) throw new Error("atlas do boneco: peças demais");
  const { sideFront, sideBack, top, bottom, back } = paintHeadFaces(look);
  const faces = [sideFront, sideBack, top, bottom, back, ...FACE_MOODS.map((mood) => paintFace(look, mood))];
  const canvas = atlasCanvas(faces, HEAD_CELL, HEAD_CELL, true, HEAD_ATLAS_PAD, PIXEL_COLUMNS);
  const ctx = canvas.getContext("2d")!;
  const miscX = cellX(MISC_CELL);
  const miscY = cellY(MISC_CELL);
  parts.stripes.forEach((colors, index) => {
    const x = miscX + index * STRIPE_WIDTH;
    // Margens repetem a primeira e a última faixa (mipmap sem cor vizinha).
    ctx.fillStyle = colors[0][0];
    ctx.fillRect(x, miscY, STRIPE_WIDTH, STRIPE_PAD);
    paintStripes(ctx, x, miscY + STRIPE_PAD, STRIPE_WIDTH, STRIPE_HEIGHT, colors);
    ctx.fillRect(x, miscY + STRIPE_PAD + STRIPE_HEIGHT, STRIPE_WIDTH, HEAD_CELL - STRIPE_PAD - STRIPE_HEIGHT);
  });
  const solidX = (index: number) => miscX + SOLID_X + Math.floor(index / SOLID_ROWS) * SOLID_WIDTH;
  const solidY = (index: number) => miscY + (index % SOLID_ROWS) * SOLID_HEIGHT;
  parts.solids.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(solidX(index), solidY(index), SOLID_WIDTH, SOLID_HEIGHT);
  });
  const pad = HEAD_ATLAS_PAD;
  return {
    texture: canvasTexture(canvas, true),
    head: (face, u, v) => {
      const cell = HEAD_FACE_CELLS[face];
      const column = cell % PIXEL_COLUMNS;
      const row = Math.floor(cell / PIXEL_COLUMNS);
      // Linha 0 do canvas é o alto da textura (v perto de 1).
      return [(column + pad + u * (1 - pad * 2)) / PIXEL_COLUMNS, (PIXEL_ROWS - 1 - row + pad + v * (1 - pad * 2)) / PIXEL_ROWS];
    },
    stripe: (index, v) => [
      (miscX + index * STRIPE_WIDTH + STRIPE_WIDTH / 2) / PIXEL_WIDTH,
      1 - (miscY + STRIPE_PAD + (1 - v) * STRIPE_HEIGHT) / PIXEL_HEIGHT,
    ],
    solid: (index) => [
      (solidX(index) + SOLID_WIDTH / 2) / PIXEL_WIDTH,
      1 - (solidY(index) + SOLID_HEIGHT / 2) / PIXEL_HEIGHT,
    ],
  };
}

// ------------------------------------------------------- sprites/decalques

/** Disco radial suave: sombra de contato, brilho da bola, poeira. */
export function radialTexture(inner: string, outer: string, size = 128) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Etiqueta "VC" e afins, sempre virada para a câmera. */
export function labelTexture(text: string, color: string, background: string) {
  const canvas = makeCanvas(128, 64);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(8, 8, 112, 48, 24);
  ctx.fill();
  ctx.font = "900 34px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

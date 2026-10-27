// Texturas pintadas em canvas para os bonecos 3D.
//
// Mesmo espírito do `player-appearance.ts`: nada de arquivo de imagem. O rosto
// é pixel art 16×16 (a cara de bloco do criador atual, agora numa cabeça de
// verdade) e a camisa reaproveita as 12 estampas da mesa 2D.

import * as THREE from "three";
import {
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_COLORS,
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
const CELL = 8;

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

export type FaceMood = "normal" | "blink" | "shout" | "sad";

const STUBBLE_STYLES = new Set([3, 5, 15, 18, 20]);

function stubble(look: ResolvedLook) {
  return mixHex(look.skin, look.hair, 0.42);
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
    if (style === 3) px(6, 0, hair, 4, 2);
    if (style === 15) px(4, 0, hair, 8, 3);
    if (style === 18) { px(1, 0, hair, 14, 2); px(1, 2, dark, 9, 1); }
    if (style === 20) { px(3, 0, look.skin, 1, 2); px(6, 0, look.skin, 1, 2); }
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
    case 4: px(0, 3, hair, 16, 1); px(0, 4, hair, 2, 4); px(14, 4, hair, 2, 4); break;
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
    default: break;
  }
}

function paintBrows(px: Pixel, look: ResolvedLook, mood: FaceMood) {
  const brow = mixHex(shadeHex(look.hair, 10), "#2a1f1a", luminance(look.hair) > 0.7 ? 0.35 : 0);
  const row = mood === "shout" ? 4 : 5 + (look.brow === 0 ? 1 : 0);
  if (mood === "sad") {
    px(3, row + 1, brow, 2, 1); px(5, row, brow, 2, 1);
    px(9, row, brow, 2, 1); px(11, row + 1, brow, 2, 1);
    return;
  }
  const thick = look.brow === 2 ? 2 : 1;
  if (look.brow === 2 && mood === "normal") {
    // Sobrancelha intensa: desce em direção ao nariz.
    px(3, row, brow, 3, 1); px(5, row + 1, brow, 2, 1);
    px(10, row, brow, 3, 1); px(9, row + 1, brow, 2, 1);
    return;
  }
  px(3, row, brow, 4, thick);
  px(9, row, brow, 4, thick);
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
  px(3, 7, white, 3, 2);
  px(10, 7, white, 3, 2);
  px(4, 7, look.eyes, 2, 2);
  px(10, 7, look.eyes, 2, 2);
  px(5, 8, pupil, 1, 1);
  px(10, 8, pupil, 1, 1);
  if (mood === "sad") { px(3, 7, shadeHex(look.skin, -20), 3, 1); px(10, 7, shadeHex(look.skin, -20), 3, 1); }
}

function paintBeard(px: Pixel, look: ResolvedLook) {
  const color = shadeHex(look.hair, -6);
  const soft = mixHex(look.skin, color, 0.55);
  switch (look.beard) {
    case 1: px(6, 13, color, 4, 3); px(5, 11, color, 6, 1); break;
    case 2:
      px(0, 9, color, 2, 7); px(14, 9, color, 2, 7);
      px(2, 12, color, 12, 4); px(4, 11, color, 8, 1);
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
  switch (look.face) {
    case 0: px(5, 12, mouth, 6, 1); break;
    case 1: px(5, 12, mouth, 5, 1); px(10, 11, mouth, 1, 1); break;
    case 2: px(4, 11, mouth, 1, 1); px(11, 11, mouth, 1, 1); px(5, 12, mouth, 6, 1); px(6, 12, teeth, 4, 1); break;
    case 3: px(5, 12, mouth, 6, 2); break;
    case 4: px(5, 11, mouth, 1, 1); px(10, 11, mouth, 1, 1); px(6, 12, mouth, 4, 1); break;
    case 5: px(7, 11, mouth, 2, 3); break;
    case 6: px(5, 12, teeth, 6, 1); px(5, 13, mouth, 6, 1); px(4, 12, mouth, 1, 1); px(11, 12, mouth, 1, 1); break;
    case 7: px(7, 12, mouth, 2, 1); px(7, 13, shadeHex(look.skin, -40), 2, 1); break;
    default: px(5, 12, mouth, 3, 1); px(8, 11, mouth, 3, 1); break;
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
  paintMouth(px, look, mood);
  paintEyes(px, look, mood);
  paintBrows(px, look, mood);
  paintHairFront(px, look);
  return canvas;
}

/** Lado da cabeça. `frontOnLeft` segue o mapeamento de UV do BoxGeometry. */
function paintSide(look: ResolvedLook, frontOnLeft: boolean) {
  const { canvas, px } = gridCanvas(look.skin);
  const at = (x: number, width = 1) => (frontOnLeft ? x : GRID - x - width);
  const style = look.hairStyle;
  px(at(6, 3), 7, shadeHex(look.skin, -14), 3, 4);
  px(at(7), 8, shadeHex(look.skin, -28), 1, 2);
  px(0, 15, shadeHex(look.skin, -12), 16, 1);
  if (style === 12) return canvas;
  if (STUBBLE_STYLES.has(style)) {
    px(0, 0, stubble(look), 16, style === 18 ? 5 : 4);
    if (style === 18) px(0, 0, look.hairTop, 16, 2);
    if (style === 15) px(0, 0, look.hairTop, 16, 1);
    return canvas;
  }
  const hair = look.hairTop;
  const long = [4, 6, 9, 13, 14, 17].includes(style);
  px(0, 0, hair, 16, long ? 6 : 4);
  px(at(10, 6), 4, hair, 6, long ? 9 : 4);
  px(at(0, 3), 4, hair, 3, 3);
  if ([4, 9, 13, 17].includes(style)) px(at(9, 7), 8, hair, 7, 6);
  if (style === 11) px(at(0, 4), 3, look.hair, 4, 2);
  px(0, 0, shadeHex(hair, 16), 16, 1);
  if (look.beard === 2 || look.beard === 4) {
    const beard = look.beard === 2 ? shadeHex(look.hair, -6) : mixHex(look.skin, shadeHex(look.hair, -6), 0.55);
    px(at(0, 4), 10, beard, 4, 6);
  }
  return canvas;
}

function paintBack(look: ResolvedLook) {
  const { canvas, px } = gridCanvas(look.skin);
  const style = look.hairStyle;
  px(0, 15, shadeHex(look.skin, -14), 16, 1);
  if (style === 12) return canvas;
  if (STUBBLE_STYLES.has(style)) {
    px(0, 0, stubble(look), 16, 9);
    if (style === 3) px(6, 0, look.hairTop, 4, 9);
    if (style === 15) px(4, 0, look.hairTop, 8, 4);
    if (style === 18) px(0, 0, look.hairTop, 16, 3);
    return canvas;
  }
  const hair = look.hairTop;
  const depth = [4, 6, 9, 13, 14, 16, 17, 21].includes(style) ? 13 : 10;
  px(0, 0, hair, 16, depth);
  px(0, 0, shadeHex(hair, 16), 16, 1);
  for (let x = 1; x < 16; x += 4) px(x, 2, shadeHex(hair, -16), 1, depth - 3);
  if (style === 13) px(2, depth, hair, 12, 3);
  if (style === 11) px(0, depth - 2, look.hair, 16, 2);
  return canvas;
}

function paintTop(look: ResolvedLook) {
  const style = look.hairStyle;
  if (style === 12) {
    const { canvas, px } = gridCanvas(look.skin);
    px(4, 4, shadeHex(look.skin, 22), 3, 2);
    return canvas;
  }
  const base = STUBBLE_STYLES.has(style) ? stubble(look) : look.hairTop;
  const { canvas, px } = gridCanvas(base);
  if (style === 3) px(6, 0, look.hairTop, 4, 16);
  if (style === 15) px(4, 0, look.hairTop, 8, 16);
  if (style === 18) px(1, 0, look.hairTop, 14, 16);
  if (style === 20) { px(3, 0, shadeHex(look.skin, 6), 1, 10); px(6, 0, shadeHex(look.skin, 6), 1, 10); }
  if (!STUBBLE_STYLES.has(style)) {
    // Textura de fios: faixas finas, mais claras na frente (luz de cima).
    for (let y = 0; y < 16; y += 3) px(0, y, shadeHex(base, -12), 16, 1);
    px(0, 15, shadeHex(base, 14), 16, 1);
    if (style === 7) px(5, 0, shadeHex(base, -30), 1, 16);
    if (style === 6 || style === 16) for (let x = 1; x < 16; x += 3) px(x, 0, shadeHex(base, -28), 1, 16);
  }
  return canvas;
}

// ----------------------------------------------------------------- atlas

/** Fração de cada célula do atlas reservada como margem contra sangria do mipmap. */
const ATLAS_PAD = 0.04;

/**
 * Junta as 6 faces de uma caixa (ordem do BoxGeometry) num canvas 3×2. Uma
 * textura por caixa = um draw call por caixa, em vez de seis.
 */
function atlasCanvas(faces: HTMLCanvasElement[], cellWidth: number, cellHeight: number, pixelated: boolean) {
  const canvas = makeCanvas(cellWidth * 3, cellHeight * 2);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = !pixelated;
  const padX = cellWidth * ATLAS_PAD;
  const padY = cellHeight * ATLAS_PAD;
  faces.forEach((face, index) => {
    const x = (index % 3) * cellWidth;
    const y = Math.floor(index / 3) * cellHeight;
    // Esticada até a borda (a margem herda as cores da beirada), depois no miolo.
    ctx.drawImage(face, x, y, cellWidth, cellHeight);
    ctx.drawImage(face, x + padX, y + padY, cellWidth - padX * 2, cellHeight - padY * 2);
  });
  return canvas;
}

const atlasGeometryCache = new Map<string, THREE.BoxGeometry>();

/** Caixa com UVs apontando para as células do atlas 3×2. Compartilhada entre bonecos. */
export function atlasBoxGeometry(width: number, height: number, depth: number) {
  const key = `${width}|${height}|${depth}`;
  const cached = atlasGeometryCache.get(key);
  if (cached) return cached;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    // Com 1 segmento por eixo, cada face tem 4 vértices seguidos.
    const face = Math.floor(vertex / 4);
    const column = face % 3;
    const row = Math.floor(face / 3);
    const u = (column + ATLAS_PAD + uv.getX(vertex) * (1 - ATLAS_PAD * 2)) / 3;
    // Linha 0 do canvas é a metade de cima da textura (v de 0,5 a 1).
    const v = (1 - row + ATLAS_PAD + uv.getY(vertex) * (1 - ATLAS_PAD * 2)) / 2;
    uv.setXY(vertex, u, v);
  }
  geometry.clearGroups();
  atlasGeometryCache.set(key, geometry);
  return geometry;
}

/** Um atlas por humor do rosto; trocar a expressão é só trocar o `map`. */
export type HeadTextures = Record<FaceMood, THREE.Texture>;

export function createHeadTextures(look: ResolvedLook): HeadTextures {
  const sideFront = paintSide(look, true);
  const sideBack = paintSide(look, false);
  const top = paintTop(look);
  const bottom = gridCanvas(shadeHex(look.skin, -24)).canvas;
  const back = paintBack(look);
  const cell = GRID * CELL;
  const build = (mood: FaceMood) =>
    canvasTexture(atlasCanvas([sideFront, sideBack, top, bottom, paintFace(look, mood), back], cell, cell, true), true);
  return { normal: build("normal"), blink: build("blink"), shout: build("shout"), sad: build("sad") };
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

  return {
    torso: canvasTexture(atlasCanvas([left.canvas, right.canvas, topCanvas, bottomCanvas, front.canvas, back.canvas], width, height, false)),
  };
}

/** Meião com a faixa do clube no alto e chuteira com solado: uma textura cada. */
export function stripeTexture(colors: Array<[string, number]>) {
  const canvas = makeCanvas(8, 32);
  const ctx = canvas.getContext("2d")!;
  let y = 0;
  for (const [color, share] of colors) {
    const height = Math.round(share * 32);
    ctx.fillStyle = color;
    ctx.fillRect(0, y, 8, height);
    y += height;
  }
  if (y < 32) ctx.fillRect(0, y, 8, 32 - y);
  return canvasTexture(canvas, true);
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

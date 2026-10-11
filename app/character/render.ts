// API pública do personagem: cabeça, busto (retratos e botões) e corpo inteiro.

import {
  appearanceColors,
  normalizePlayerAppearance,
  type PlayerAppearance,
} from "../player-appearance";
import { darken, lighten, mix } from "./color";
import { bodyGeometry, drawBodyBackLayer, drawBodyFrontLayer, drawJersey, FULL_BODY_BOUNDS, type BodyStyle } from "./body";
import {
  drawBeard,
  drawBrows,
  drawEarrings,
  drawEars,
  drawExpressionExtras,
  drawEyes,
  drawGlasses,
  drawHeadBase,
  drawHeadwear,
  drawMarks,
  drawMouth,
  drawNeck,
  drawNose,
  expressionFor,
  faceColors,
  faceGeometry,
} from "./head";
import { drawHairBack, drawHairFront, drawHairShadow, drawScalpShine, drawShavedScalp, hairParts } from "./hair";

export { FULL_BODY_BOUNDS };

export type CharacterRenderOptions = {
  primary: string;
  secondary: string;
  number?: number;
  /** 0 = olhos abertos, 1 = piscando. */
  blink?: number;
  /** Pixels por unidade; abaixo de ~0.5 os detalhes finos são omitidos. */
  detail?: number;
};

function currentScale(ctx: CanvasRenderingContext2D) {
  const transform = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  return transform ? Math.hypot(transform.a, transform.b) : 1;
}

function bodyStyle(appearance: PlayerAppearance, options: CharacterRenderOptions): BodyStyle {
  const colors = appearanceColors(appearance);
  return {
    build: appearance.build,
    height: appearance.height,
    pose: appearance.pose,
    tattoo: appearance.tattoo,
    wristband: appearance.wristband,
    gloves: appearance.gloves,
    socks: appearance.socks,
    boots: colors.boots,
    accessory: colors.accessory,
    kitPattern: appearance.kitPattern,
    primary: options.primary,
    secondary: options.secondary,
    number: options.number,
  };
}

type HeadLayers = { back: () => void; front: () => void };

/** Prepara a cabeça em duas camadas: cabelo de trás (antes do corpo) e todo o resto. */
function headLayers(ctx: CanvasRenderingContext2D, appearanceValue: PlayerAppearance, options: CharacterRenderOptions, detail: number): HeadLayers {
  const appearance = normalizePlayerAppearance(appearanceValue);
  const palette = appearanceColors(appearance);
  const colors = faceColors(palette.skin, palette.hair, palette.eyes, palette.accessory);
  const g = faceGeometry(appearance.faceShape);
  const hair = hairParts(appearance.hairStyle);
  const hairColors = { base: palette.hair, tip: palette.hairTip };
  const expression = expressionFor(appearance.face);
  return {
    back: () => drawHairBack(ctx, hair, hairColors, detail),
    front: () => {
      if (!hair.coversEars) drawEars(ctx, g, appearance.ears, colors);
      const head = drawHeadBase(ctx, g, colors);
      if (hair.bald) drawScalpShine(ctx, colors.skinLight);
      drawShavedScalp(ctx, hair, appearance.hairStyle, head, hairColors, detail);
      drawMarksUnderFeatures(ctx, appearance.marks, g, colors);
      drawBeard(ctx, appearance.beard, g, head, colors, detail, "base");
      drawEyes(ctx, expression, appearance.eyeShape, colors, options.blink ?? 0);
      drawBrows(ctx, appearance.brow, expression, appearance.eyeShape, colors);
      drawMouth(ctx, expression, colors);
      // bigodes ficam por cima da boca
      drawBeard(ctx, appearance.beard, g, head, colors, detail, "mustache");
      drawNose(ctx, appearance.nose, colors);
      drawMarksOverFeatures(ctx, appearance.marks, g, colors);
      drawExpressionExtras(ctx, expression, colors, g);
      drawGlasses(ctx, appearance.glasses, g, colors);
      drawEarrings(ctx, appearance.earrings, g, appearance.ears);
      drawHairShadow(ctx, hair, head, colors.skinShade);
      drawHairFront(ctx, hair, hairColors, detail);
      drawHeadwear(ctx, appearance.headwear, colors, hair.volume);
    },
  };
}

const MARKS_OVER = new Set([3, 6, 7, 8]);

function drawMarksUnderFeatures(ctx: CanvasRenderingContext2D, marks: number, g: ReturnType<typeof faceGeometry>, colors: ReturnType<typeof faceColors>) {
  if (!MARKS_OVER.has(marks)) drawMarks(ctx, marks, g, colors);
}

function drawMarksOverFeatures(ctx: CanvasRenderingContext2D, marks: number, g: ReturnType<typeof faceGeometry>, colors: ReturnType<typeof faceColors>) {
  if (MARKS_OVER.has(marks)) drawMarks(ctx, marks, g, colors);
}

/** Só a cabeça (com cabelo), em espaço da cabeça. */
export function drawCharacterHead(ctx: CanvasRenderingContext2D, appearance: PlayerAppearance, options: CharacterRenderOptions) {
  const detail = options.detail ?? currentScale(ctx);
  const layers = headLayers(ctx, appearance, options, detail);
  ctx.save();
  layers.back();
  layers.front();
  ctx.restore();
}

/** Corpo inteiro em espaço da cabeça; use FULL_BODY_BOUNDS para enquadrar. */
export function drawCharacterFullBody(ctx: CanvasRenderingContext2D, appearanceValue: PlayerAppearance, options: CharacterRenderOptions) {
  const appearance = normalizePlayerAppearance(appearanceValue);
  const detail = options.detail ?? currentScale(ctx);
  const palette = appearanceColors(appearance);
  const colors = faceColors(palette.skin, palette.hair, palette.eyes, palette.accessory);
  const geom = bodyGeometry(appearance.build, appearance.height);
  const style = bodyStyle(appearance, options);
  const layers = headLayers(ctx, appearance, options, detail);
  ctx.save();
  ctx.lineJoin = "round";
  layers.back();
  drawBodyBackLayer(ctx, geom, style, colors);
  drawNeck(ctx, colors, geom.neck, geom.shoulderY + 6);
  drawJersey(ctx, geom, style, { number: options.number, showNumber: true, detail });
  drawBodyFrontLayer(ctx, geom, style, colors);
  layers.front();
  ctx.restore();
}

/**
 * Busto dentro de um disco de raio `radius` centrado na origem — o mesmo
 * enquadramento dos botões e retratos. Desenha fundo, camisa, pescoço e cabeça.
 */
export function drawCharacterBust(
  ctx: CanvasRenderingContext2D,
  appearanceValue: PlayerAppearance,
  primary: string,
  secondary: string,
  radius: number,
  options: { contentOffsetY?: number; blink?: number; background?: boolean } = {},
) {
  const appearance = normalizePlayerAppearance(appearanceValue);
  const unit = radius / 86;
  const detail = currentScale(ctx) * unit;
  const palette = appearanceColors(appearance);
  const colors = faceColors(palette.skin, palette.hair, palette.eyes, palette.accessory);
  const geom = bodyGeometry(appearance.build, 1);
  const style = bodyStyle(appearance, { primary, secondary });
  const layers = headLayers(ctx, appearance, { primary, secondary, blink: options.blink }, detail);

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();
  if (options.background !== false) {
    const glow = ctx.createRadialGradient(-radius * 0.25, -radius * 0.4, radius * 0.05, 0, 0, radius * 1.05);
    glow.addColorStop(0, lighten(primary, 0.18));
    glow.addColorStop(0.6, mix(primary, darken(primary, 0.35), 0.4));
    glow.addColorStop(1, darken(primary, 0.42));
    ctx.fillStyle = glow;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.translate(0, options.contentOffsetY ?? 0);
  ctx.scale(unit, unit);
  ctx.translate(0, -10);
  layers.back();
  drawNeck(ctx, colors, geom.neck, geom.shoulderY + 6);
  drawJersey(ctx, geom, style, { showNumber: false, detail });
  layers.front();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cache para a mesa de botão: dezenas de discos por quadro viram drawImage.

const bustCache = new Map<string, HTMLCanvasElement>();
const BUST_CACHE_LIMIT = 96;

function appearanceKey(appearance: PlayerAppearance) {
  const value = normalizePlayerAppearance(appearance);
  return [
    value.skin, value.hairColor, value.eyeColor, value.hairStyle, value.face, value.beard, value.brow, value.kitPattern,
    value.customSkinColor ?? "", value.customHairColor ?? "", value.customEyeColor ?? "", value.faceShape, value.eyeShape,
    value.nose, value.ears, value.marks, value.hairTip, value.build, value.headwear, value.glasses, value.earrings, value.accessoryColor,
  ].join(".");
}

/**
 * Compatível com a assinatura antiga: desenha o busto do jogador num disco.
 * Em tamanhos de mesa usa um bitmap em cache para não redesenhar vetores a cada quadro.
 */
export function drawPlayerBust(
  ctx: CanvasRenderingContext2D,
  appearance: PlayerAppearance,
  primary: string,
  secondary: string,
  radius: number,
  contentOffsetY = 0,
) {
  const scale = currentScale(ctx);
  const pixelRadius = Math.ceil(radius * scale);
  if (typeof document === "undefined" || pixelRadius > 180 || pixelRadius < 4) {
    drawCharacterBust(ctx, appearance, primary, secondary, radius, { contentOffsetY });
    return;
  }
  const key = `${appearanceKey(appearance)}|${primary}|${secondary}|${pixelRadius}|${(contentOffsetY / radius).toFixed(3)}`;
  let bitmap = bustCache.get(key);
  if (!bitmap) {
    bitmap = document.createElement("canvas");
    bitmap.width = pixelRadius * 2;
    bitmap.height = pixelRadius * 2;
    const offscreen = bitmap.getContext("2d");
    if (!offscreen) {
      drawCharacterBust(ctx, appearance, primary, secondary, radius, { contentOffsetY });
      return;
    }
    offscreen.translate(pixelRadius, pixelRadius);
    drawCharacterBust(offscreen, appearance, primary, secondary, pixelRadius, { contentOffsetY: (contentOffsetY / radius) * pixelRadius });
    if (bustCache.size >= BUST_CACHE_LIMIT) {
      const oldest = bustCache.keys().next().value;
      if (oldest !== undefined) bustCache.delete(oldest);
    }
    bustCache.set(key, bitmap);
  } else {
    bustCache.delete(key);
    bustCache.set(key, bitmap);
  }
  ctx.drawImage(bitmap, -radius, -radius, radius * 2, radius * 2);
}

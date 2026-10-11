// Cabeça vetorial do personagem. Unidades em "espaço da cabeça": a origem fica
// no centro do rosto e a cabeça tem ~100 unidades de largura. Quem chama
// escala o contexto; aqui nada conhece pixels.

import { alpha, darken, ink, lighten, mix } from "./color";

export const LINE = 2.6;
const TAU = Math.PI * 2;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

export type HeadGeom = { wT: number; wC: number; wJ: number; yJ: number; yChin: number; cw: number };

const FACE_SHAPES: HeadGeom[] = [
  { wT: 49, wC: 50, wJ: 38, yJ: 38, yChin: 56, cw: 12 }, // Oval
  { wT: 50, wC: 53, wJ: 45, yJ: 36, yChin: 55, cw: 17 }, // Redondo
  { wT: 49, wC: 51, wJ: 47, yJ: 43, yChin: 56, cw: 23 }, // Quadrado
  { wT: 46, wC: 46, wJ: 34, yJ: 42, yChin: 61, cw: 11 }, // Fino
  { wT: 51, wC: 51, wJ: 32, yJ: 37, yChin: 57, cw: 6 }, // Coração
  { wT: 52, wC: 56, wJ: 47, yJ: 38, yChin: 54, cw: 19 }, // Largo
];

export function faceGeometry(shape: number): HeadGeom {
  return FACE_SHAPES[shape] ?? FACE_SHAPES[0];
}

export function headPath(g: HeadGeom) {
  const path = new Path2D();
  path.moveTo(0, -62);
  path.bezierCurveTo(28, -62, g.wT, -52, g.wT, -28);
  path.bezierCurveTo(g.wT, -14, g.wC, -6, g.wC, 8);
  path.bezierCurveTo(g.wC, 25, g.wJ + 4, g.yJ - 8, g.wJ, g.yJ);
  path.bezierCurveTo(g.wJ - 6, g.yJ + 9, g.cw + 9, g.yChin, g.cw, g.yChin);
  path.lineTo(-g.cw, g.yChin);
  path.bezierCurveTo(-g.cw - 9, g.yChin, -g.wJ + 6, g.yJ + 9, -g.wJ, g.yJ);
  path.bezierCurveTo(-g.wJ - 4, g.yJ - 8, -g.wC, 25, -g.wC, 8);
  path.bezierCurveTo(-g.wC, -6, -g.wT, -14, -g.wT, -28);
  path.bezierCurveTo(-g.wT, -52, -28, -62, 0, -62);
  path.closePath();
  return path;
}

/** Contorno inferior da mandíbula, usado por barbas que acompanham o rosto. */
function jawLine(path: Path2D, g: HeadGeom, inset = 0) {
  path.moveTo(-g.wC + inset, 8);
  path.bezierCurveTo(-g.wC + inset, 25, -g.wJ - 4 + inset, g.yJ - 8, -g.wJ + inset, g.yJ - inset * 0.4);
  path.bezierCurveTo(-g.wJ + 6 + inset * 0.5, g.yJ + 9 - inset, -g.cw - 9, g.yChin - inset, -g.cw, g.yChin - inset);
  path.lineTo(g.cw, g.yChin - inset);
  path.bezierCurveTo(g.cw + 9, g.yChin - inset, g.wJ - 6 - inset * 0.5, g.yJ + 9 - inset, g.wJ - inset, g.yJ - inset * 0.4);
  path.bezierCurveTo(g.wJ + 4 - inset, g.yJ - 8, g.wC - inset, 25, g.wC - inset, 8);
}

export type FaceColors = {
  skin: string;
  skinShade: string;
  skinLight: string;
  skinInk: string;
  hair: string;
  hairInk: string;
  eyes: string;
  accessory: string;
};

export function faceColors(skin: string, hair: string, eyes: string, accessory: string): FaceColors {
  return {
    skin,
    skinShade: mix(darken(skin, 0.16), "#8a3b2c", 0.12),
    skinLight: lighten(skin, 0.28),
    skinInk: ink(skin, 0.62),
    hair,
    hairInk: ink(hair, 0.5),
    eyes,
    accessory,
  };
}

// ---------------------------------------------------------------------------
// Orelhas, pescoço e pele

const EAR_SIZES = [
  { rx: 8, ry: 12, dx: 0 },
  { rx: 6.2, ry: 9.5, dx: 1.5 },
  { rx: 11.5, ry: 13.5, dx: -3 },
];

export function earAnchor(g: HeadGeom, ears: number) {
  const size = EAR_SIZES[ears] ?? EAR_SIZES[0];
  return { x: g.wC - 2 - size.dx, y: 10, ...size };
}

export function drawEars(ctx: CanvasRenderingContext2D, g: HeadGeom, ears: number, colors: FaceColors) {
  const ear = earAnchor(g, ears);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * ear.x, ear.y);
    ctx.rotate(side * 0.12);
    ctx.beginPath();
    ctx.ellipse(side * 2, 0, ear.rx, ear.ry, 0, 0, TAU);
    ctx.fillStyle = colors.skin;
    ctx.fill();
    ctx.lineWidth = LINE;
    ctx.strokeStyle = colors.skinInk;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(side * 3.4, 0.5, ear.rx * 0.48, ear.ry * 0.58, 0, rad(side > 0 ? -70 : 110), rad(side > 0 ? 160 : 380));
    ctx.strokeStyle = colors.skinShade;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }
}

export function drawNeck(ctx: CanvasRenderingContext2D, colors: FaceColors, halfWidth: number, bottom: number) {
  ctx.beginPath();
  ctx.moveTo(-halfWidth, 28);
  ctx.lineTo(-halfWidth - 1, bottom);
  ctx.lineTo(halfWidth + 1, bottom);
  ctx.lineTo(halfWidth, 28);
  ctx.closePath();
  ctx.fillStyle = colors.skin;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.skinShade;
  ctx.beginPath();
  ctx.ellipse(0, 50, halfWidth + 6, 13, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = LINE;
  ctx.strokeStyle = colors.skinInk;
  ctx.beginPath();
  ctx.moveTo(-halfWidth, 28);
  ctx.lineTo(-halfWidth - 1, bottom);
  ctx.moveTo(halfWidth, 28);
  ctx.lineTo(halfWidth + 1, bottom);
  ctx.stroke();
}

export function drawHeadBase(ctx: CanvasRenderingContext2D, g: HeadGeom, colors: FaceColors) {
  const head = headPath(g);
  ctx.fillStyle = colors.skin;
  ctx.fill(head);
  ctx.save();
  ctx.clip(head);
  // Luz vinda do alto à esquerda: lado direito e queixo um pouco mais escuros.
  const side = ctx.createLinearGradient(-50, 0, 56, 0);
  side.addColorStop(0, alpha(colors.skinLight, 0.22));
  side.addColorStop(0.45, alpha(colors.skin, 0));
  side.addColorStop(1, alpha(colors.skinShade, 0.5));
  ctx.fillStyle = side;
  ctx.fillRect(-60, -70, 120, 140);
  const jaw = ctx.createLinearGradient(0, 30, 0, 62);
  jaw.addColorStop(0, alpha(colors.skinShade, 0));
  jaw.addColorStop(1, alpha(colors.skinShade, 0.45));
  ctx.fillStyle = jaw;
  ctx.fillRect(-60, 30, 120, 40);
  ctx.restore();
  ctx.lineWidth = LINE;
  ctx.strokeStyle = colors.skinInk;
  ctx.stroke(head);
  return head;
}

// ---------------------------------------------------------------------------
// Expressões

type EyeState = "open" | "wide" | "happy" | "closed" | "squeeze";
type MouthKind =
  | "flat" | "smile" | "smallSmile" | "confident" | "smirk" | "grin" | "laugh" | "shout"
  | "o" | "clench" | "frown" | "wavy" | "tongue" | "kiss" | "firm";

type Expression = {
  left: EyeState;
  right: EyeState;
  lid: number;
  lidTilt: number;
  lower?: number;
  lookX?: number;
  lookY?: number;
  browY: number;
  browTilt: number;
  browLeft?: number;
  browRight?: number;
  mouth: MouthKind;
  blush?: number;
  extra?: "sweat" | "tears" | "vein" | "sparkle" | "heart";
};

export const EXPRESSIONS: Expression[] = [
  { left: "open", right: "open", lid: 0.14, lidTilt: 0.05, browY: 0, browTilt: 0.18, mouth: "flat" }, // Sério
  { left: "open", right: "open", lid: 0.2, lidTilt: 0.08, lower: 0.08, browY: 0, browTilt: 0.12, browRight: 3, mouth: "confident" }, // Confiante
  { left: "open", right: "open", lid: 0.04, lidTilt: 0, lower: 0.2, browY: -1.5, browTilt: -0.12, mouth: "smile", blush: 0.25 }, // Sorriso
  { left: "open", right: "open", lid: 0.02, lidTilt: 0, lower: 0.26, browY: -2.5, browTilt: -0.15, mouth: "grin", blush: 0.25 }, // Sorrisão
  { left: "happy", right: "happy", lid: 0, lidTilt: 0, browY: -4, browTilt: -0.3, mouth: "laugh", blush: 0.5 }, // Gargalhada
  { left: "open", right: "open", lid: 0.34, lidTilt: 0.35, browY: 2, browTilt: 0.6, mouth: "firm" }, // Focado
  { left: "open", right: "open", lid: 0.26, lidTilt: 0.55, browY: 3, browTilt: 1, mouth: "clench", extra: "vein" }, // Raçudo
  { left: "squeeze", right: "squeeze", lid: 0, lidTilt: 0, browY: 1, browTilt: 0.7, mouth: "shout", blush: 0.25 }, // Grito de gol
  { left: "wide", right: "wide", lid: 0, lidTilt: 0, browY: -7, browTilt: -0.35, mouth: "o" }, // Surpreso
  { left: "open", right: "happy", lid: 0.05, lidTilt: 0, lower: 0.18, browY: -1, browTilt: -0.05, browLeft: 2.5, mouth: "smile", blush: 0.3, extra: "sparkle" }, // Piscadinha
  { left: "open", right: "open", lid: 0.46, lidTilt: -0.06, lower: 0.08, browY: -1, browTilt: -0.12, mouth: "smallSmile" }, // Tranquilo
  { left: "open", right: "open", lid: 0.42, lidTilt: 0.12, lookX: 2.2, browY: 0, browTilt: 0.35, browLeft: 4.5, mouth: "smirk" }, // Marrento
  { left: "happy", right: "open", lid: 0.08, lidTilt: 0, lower: 0.12, browY: -2, browTilt: -0.15, mouth: "tongue", blush: 0.3 }, // Zoeiro
  { left: "open", right: "open", lid: 0.16, lidTilt: -0.1, lookX: -2.6, lookY: 1.2, browY: -2, browTilt: -0.45, mouth: "smallSmile", blush: 0.75 }, // Tímido
  { left: "open", right: "open", lid: 0.1, lidTilt: -0.32, browY: -3, browTilt: -0.85, mouth: "wavy", extra: "sweat" }, // Preocupado
  { left: "open", right: "open", lid: 0.5, lidTilt: 0.2, browY: 2.5, browTilt: 0.3, mouth: "flat" }, // Frio
  { left: "happy", right: "happy", lid: 0, lidTilt: 0, browY: -3, browTilt: -0.7, mouth: "grin", blush: 0.4, extra: "tears" }, // Emocionado
  { left: "closed", right: "closed", lid: 0, lidTilt: 0, browY: -2, browTilt: -0.15, mouth: "kiss", blush: 0.4, extra: "heart" }, // Beijinho
];

export function expressionFor(index: number) {
  return EXPRESSIONS[index] ?? EXPRESSIONS[0];
}

// ---------------------------------------------------------------------------
// Olhos

const EYE_SHAPES = [
  { rx: 9.6, ry: 11, lid: 0, tilt: 0, lashes: false, iris: 0.74 }, // Redondos
  { rx: 11, ry: 9, lid: 0.16, tilt: -0.12, lashes: false, iris: 0.8 }, // Amendoados
  { rx: 11, ry: 7.6, lid: 0.3, tilt: -0.04, lashes: false, iris: 0.86 }, // Puxados
  { rx: 10.6, ry: 12.4, lid: 0, tilt: 0, lashes: true, iris: 0.72 }, // Expressivos
  { rx: 7.2, ry: 8.2, lid: 0.02, tilt: 0, lashes: false, iris: 0.84 }, // Pequenos
  { rx: 10, ry: 10, lid: 0.32, tilt: -0.24, lashes: false, iris: 0.76 }, // Serenos
];

export const EYE_Y = 6;
export const EYE_X = 20;

type EyeOptions = {
  state: EyeState;
  shape: number;
  lid: number;
  lidTilt: number;
  lower: number;
  lookX: number;
  lookY: number;
  colors: FaceColors;
  blink: number;
};

function drawEye(ctx: CanvasRenderingContext2D, side: -1 | 1, options: EyeOptions) {
  const shape = EYE_SHAPES[options.shape] ?? EYE_SHAPES[0];
  const cx = side * EYE_X;
  const cy = EYE_Y;
  let rx = shape.rx;
  let ry = shape.ry;
  const lineColor = mix(options.colors.skinInk, "#120a08", 0.45);
  let state = options.state;
  if (options.blink > 0.75 && (state === "open" || state === "wide")) state = "closed";

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (state === "happy") {
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.95, cy + 2.5);
    ctx.quadraticCurveTo(cx, cy - ry * 1.15, cx + rx * 0.95, cy + 2.5);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3.4;
    ctx.stroke();
    return;
  }
  if (state === "closed") {
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.95, cy);
    ctx.quadraticCurveTo(cx, cy + ry * 0.75, cx + rx * 0.95, cy);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + side * rx * 0.85, cy + 1);
    ctx.lineTo(cx + side * (rx + 3.5), cy - 1.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }
  if (state === "squeeze") {
    ctx.beginPath();
    const tip = cx + side * -1 * rx * 0.75;
    const back = cx + side * rx * 0.85;
    ctx.moveTo(back, cy - ry * 0.62);
    ctx.lineTo(tip, cy + 0.5);
    ctx.lineTo(back, cy + ry * 0.62);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3.4;
    ctx.stroke();
    return;
  }

  if (state === "wide") {
    rx *= 1.12;
    ry *= 1.16;
  }
  const blinkLid = Math.max(0, Math.min(1, options.blink / 0.75));
  const lid = state === "wide" ? 0 : Math.min(0.9, shape.lid + options.lid + blinkLid * (0.9 - shape.lid - options.lid));
  const tilt = state === "wide" ? 0 : options.lidTilt;
  const shapeTilt = shape.tilt;
  const top = cy - ry;
  // tilt > 0: canto interno mais baixo (bravo). shapeTilt < 0: canto externo mais baixo.
  const innerX = cx - side * rx;
  const outerX = cx + side * rx;
  const lidInnerY = top + 2 * ry * lid + tilt * ry * 0.9 - shapeTilt * ry * 0.5;
  const lidOuterY = top + 2 * ry * lid - tilt * ry * 0.9 + shapeTilt * ry * 0.5;

  const eyePath = new Path2D();
  eyePath.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  const below = new Path2D();
  const lidExtend = rx * 2;
  below.moveTo(innerX - side * lidExtend, lidInnerY - (lidOuterY - lidInnerY) / 2);
  below.lineTo(outerX + side * lidExtend, lidOuterY + (lidOuterY - lidInnerY) / 2);
  below.lineTo(outerX + side * lidExtend, cy + ry + 20);
  below.lineTo(innerX - side * lidExtend, cy + ry + 20);
  below.closePath();

  ctx.save();
  ctx.clip(eyePath);
  ctx.clip(below);
  ctx.fillStyle = "#fbf7f1";
  ctx.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry * 2 + 4);
  // sombra da pálpebra no branco do olho
  ctx.fillStyle = alpha(options.colors.skinShade, 0.35);
  ctx.beginPath();
  ctx.ellipse(cx, Math.min(lidInnerY, lidOuterY) - 1, rx * 1.2, 4.2, 0, 0, TAU);
  ctx.fill();
  const irisR = Math.min(rx, ry) * shape.iris * (state === "wide" ? 0.72 : 1);
  const ix = cx + options.lookX;
  const iy = cy + 0.8 + options.lookY;
  const irisGradient = ctx.createRadialGradient(ix - irisR * 0.2, iy - irisR * 0.3, irisR * 0.1, ix, iy, irisR);
  irisGradient.addColorStop(0, lighten(options.colors.eyes, 0.35));
  irisGradient.addColorStop(0.65, options.colors.eyes);
  irisGradient.addColorStop(1, darken(options.colors.eyes, 0.45));
  ctx.fillStyle = irisGradient;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#0b0807";
  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.95)";
  ctx.beginPath();
  ctx.arc(ix + irisR * 0.32, iy - irisR * 0.38, irisR * 0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.beginPath();
  ctx.arc(ix - irisR * 0.34, iy + irisR * 0.38, irisR * 0.14, 0, TAU);
  ctx.fill();
  // pálpebra inferior empurrada pelas bochechas no sorriso
  if (options.lower > 0) {
    ctx.fillStyle = options.colors.skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry + ry * (1 - options.lower * 2.2), rx * 1.4, ry, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // contorno inferior (fino) e linha dos cílios (grossa)
  ctx.save();
  ctx.clip(below);
  ctx.strokeStyle = alpha(lineColor, 0.55);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, rad(15), rad(165));
  ctx.stroke();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, rad(178), rad(362));
  ctx.stroke();
  ctx.restore();
  if (lid > 0.02 || Math.abs(tilt) > 0.02 || Math.abs(shapeTilt) > 0.02) {
    ctx.save();
    ctx.clip(eyePath);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(innerX - side * 2, lidInnerY - (lidOuterY - lidInnerY) * (2 / (rx * 2)));
    ctx.lineTo(outerX + side * 2, lidOuterY + (lidOuterY - lidInnerY) * (2 / (rx * 2)));
    ctx.stroke();
    ctx.restore();
  }
  // canto externo e cílios
  const cornerY = Math.max(cy - ry * 0.25, lidOuterY);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(outerX - side * 1.5, Math.min(cy, cornerY + 1));
  ctx.lineTo(outerX + side * (shape.lashes ? 4.5 : 2.6), Math.min(cy, cornerY) - (shape.lashes ? 3.4 : 1.4));
  ctx.stroke();
  if (shape.lashes) {
    ctx.beginPath();
    ctx.moveTo(outerX - side * 3.5, Math.max(top, lidOuterY) + 1.5);
    ctx.lineTo(outerX + side * 0.5, Math.max(top, lidOuterY) - 3.2);
    ctx.stroke();
  }
}

export function drawEyes(
  ctx: CanvasRenderingContext2D,
  expression: Expression,
  eyeShape: number,
  colors: FaceColors,
  blink = 0,
) {
  for (const side of [-1, 1] as const) {
    drawEye(ctx, side, {
      state: side < 0 ? expression.left : expression.right,
      shape: eyeShape,
      lid: expression.lid,
      lidTilt: expression.lidTilt,
      lower: expression.lower ?? 0,
      lookX: expression.lookX ?? 0,
      lookY: expression.lookY ?? 0,
      colors,
      blink,
    });
  }
}

// ---------------------------------------------------------------------------
// Sobrancelhas

const BROWS = [
  { inner: 2.6, outer: 1.3, arch: 4 }, // Fina
  { inner: 4.2, outer: 2.2, arch: 5 }, // Suave
  { inner: 4.8, outer: 3.6, arch: 1.4 }, // Reta
  { inner: 7.2, outer: 4.8, arch: 3 }, // Grossa
  { inner: 4.6, outer: 1.8, arch: 9 }, // Arqueada
  { inner: 6.6, outer: 4.4, arch: 3 }, // Com risco
];

export function drawBrows(ctx: CanvasRenderingContext2D, style: number, expression: Expression, eyeShape: number, colors: FaceColors) {
  const brow = BROWS[style] ?? BROWS[2];
  const shape = EYE_SHAPES[eyeShape] ?? EYE_SHAPES[0];
  const baseY = EYE_Y - shape.ry - 6.5 + expression.browY;
  const color = mix(colors.hair, "#120c0a", 0.28);
  for (const side of [-1, 1] as const) {
    const raise = side < 0 ? expression.browLeft ?? 0 : expression.browRight ?? 0;
    const tilt = expression.browTilt;
    const xi = side * 8.5;
    const xo = side * 31;
    const yi = baseY + tilt * 6 - raise;
    const yo = baseY - tilt * 2.6 - raise - 1.5;
    const xm = side * 18;
    const ym = (yi + yo) / 2 - brow.arch - raise * 0.4;
    ctx.beginPath();
    ctx.moveTo(xi, yi - brow.inner / 2);
    ctx.quadraticCurveTo(xm, ym - brow.inner / 2, xo, yo - brow.outer / 2);
    ctx.quadraticCurveTo(xo + side * 1.6, yo, xo - side * 0.5, yo + brow.outer / 2);
    ctx.quadraticCurveTo(xm, ym + brow.inner / 2 + 0.6, xi, yi + brow.inner / 2);
    ctx.quadraticCurveTo(xi - side * 1.4, yi, xi, yi - brow.inner / 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = alpha(darken(color, 0.4), 0.6);
    ctx.lineWidth = 0.9;
    ctx.stroke();
    if (style === 5 && side > 0) {
      ctx.save();
      ctx.strokeStyle = colors.skin;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(side * 22, ym - 6);
      ctx.lineTo(side * 25.5, ym + 7);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Nariz

export function drawNose(ctx: CanvasRenderingContext2D, nose: number, colors: FaceColors) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const shade = mix(colors.skinShade, colors.skinInk, 0.35);
  ctx.strokeStyle = shade;
  ctx.fillStyle = shade;
  ctx.lineWidth = 2.4;
  const highlight = (x: number, y: number, r: number) => {
    ctx.save();
    ctx.fillStyle = alpha(colors.skinLight, 0.75);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  };
  switch (nose) {
    case 1: // Reto
      ctx.beginPath();
      ctx.moveTo(3.5, 7);
      ctx.quadraticCurveTo(5.5, 17, 5, 21.5);
      ctx.quadraticCurveTo(2, 25, -3.5, 22.5);
      ctx.stroke();
      highlight(-1.5, 15, 1.8);
      break;
    case 2: // Arredondado
      ctx.fillStyle = alpha(colors.skinShade, 0.5);
      ctx.beginPath();
      ctx.ellipse(1.5, 21, 7.5, 5.5, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 19.5, 6.6, rad(20), rad(160));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-3, 24, 0.9, 0, TAU);
      ctx.arc(3, 24, 0.9, 0, TAU);
      ctx.fillStyle = shade;
      ctx.fill();
      highlight(-2, 17, 2.2);
      break;
    case 3: // Largo
      ctx.beginPath();
      ctx.moveTo(-10, 19);
      ctx.quadraticCurveTo(-11, 24.5, -5.5, 24.2);
      ctx.quadraticCurveTo(0, 26.5, 5.5, 24.2);
      ctx.quadraticCurveTo(11, 24.5, 10, 19);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, 12);
      ctx.quadraticCurveTo(-5, 17, -3.5, 19);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      highlight(0, 18, 2.4);
      break;
    case 4: // Fino
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(2, 6);
      ctx.lineTo(3.8, 20);
      ctx.quadraticCurveTo(2.5, 23, -1.5, 22);
      ctx.stroke();
      highlight(-0.5, 14, 1.4);
      break;
    case 5: // Arrebitado
      ctx.beginPath();
      ctx.moveTo(-5.5, 19.5);
      ctx.quadraticCurveTo(0, 13, 5.5, 19.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-2.6, 21.2, 1.6, 1.1, -0.3, 0, TAU);
      ctx.ellipse(2.6, 21.2, 1.6, 1.1, 0.3, 0, TAU);
      ctx.fill();
      highlight(0, 15.5, 1.8);
      break;
    default: // Botão
      ctx.beginPath();
      ctx.arc(0, 18.5, 4.6, rad(15), rad(165));
      ctx.stroke();
      highlight(-1.6, 15.5, 1.8);
      break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Boca

export function drawMouth(ctx: CanvasRenderingContext2D, expression: Expression, colors: FaceColors) {
  const lip = mix(colors.skinInk, "#4a1414", 0.25);
  const inside = "#4a1518";
  const teeth = "#fffaf0";
  const tongue = "#e8707b";
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = lip;
  ctx.lineWidth = 2.6;
  const openMouth = (path: Path2D, teethBottom: number, tongueY: number, tongueRx: number) => {
    ctx.fillStyle = inside;
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = teeth;
    ctx.fillRect(-20, 20, 40, teethBottom - 20);
    ctx.fillStyle = tongue;
    ctx.beginPath();
    ctx.ellipse(0, tongueY, tongueRx, tongueRx * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.stroke(path);
  };
  switch (expression.mouth) {
    case "flat": {
      ctx.beginPath();
      ctx.moveTo(-8, 36);
      ctx.quadraticCurveTo(0, 35, 8, 36);
      ctx.stroke();
      break;
    }
    case "firm": {
      ctx.beginPath();
      ctx.moveTo(-6.5, 36.5);
      ctx.lineTo(6.5, 36.5);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-8.5, 34.8);
      ctx.lineTo(-7.2, 37.6);
      ctx.moveTo(8.5, 34.8);
      ctx.lineTo(7.2, 37.6);
      ctx.stroke();
      break;
    }
    case "smile": {
      ctx.beginPath();
      ctx.moveTo(-11, 32.5);
      ctx.quadraticCurveTo(0, 43, 11, 32.5);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-12.5, 31);
      ctx.lineTo(-10.5, 34);
      ctx.moveTo(12.5, 31);
      ctx.lineTo(10.5, 34);
      ctx.stroke();
      break;
    }
    case "smallSmile": {
      ctx.beginPath();
      ctx.moveTo(-6.5, 35);
      ctx.quadraticCurveTo(0, 39.5, 6.5, 35);
      ctx.stroke();
      break;
    }
    case "confident": {
      ctx.beginPath();
      ctx.moveTo(-9, 35);
      ctx.quadraticCurveTo(1, 40.5, 11.5, 31.5);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(12.8, 30.2);
      ctx.lineTo(10.6, 33.6);
      ctx.stroke();
      break;
    }
    case "smirk": {
      ctx.beginPath();
      ctx.moveTo(-7, 37);
      ctx.quadraticCurveTo(4, 38.5, 11, 32);
      ctx.stroke();
      break;
    }
    case "grin": {
      const path = new Path2D();
      path.moveTo(-13, 31.5);
      path.quadraticCurveTo(0, 35.5, 13, 31.5);
      path.quadraticCurveTo(11, 47, 0, 47.5);
      path.quadraticCurveTo(-11, 47, -13, 31.5);
      path.closePath();
      openMouth(path, 37.5, 47, 7);
      break;
    }
    case "laugh": {
      const path = new Path2D();
      path.moveTo(-15.5, 30);
      path.quadraticCurveTo(0, 34, 15.5, 30);
      path.quadraticCurveTo(14, 54, 0, 54.5);
      path.quadraticCurveTo(-14, 54, -15.5, 30);
      path.closePath();
      openMouth(path, 37, 52, 9);
      break;
    }
    case "shout": {
      const path = new Path2D();
      path.moveTo(-11, 31);
      path.quadraticCurveTo(0, 28.5, 11, 31);
      path.quadraticCurveTo(14, 46, 6, 53);
      path.quadraticCurveTo(0, 55.5, -6, 53);
      path.quadraticCurveTo(-14, 46, -11, 31);
      path.closePath();
      openMouth(path, 35, 52, 7.5);
      break;
    }
    case "o": {
      const path = new Path2D();
      path.ellipse(0, 39, 5, 6.2, 0, 0, TAU);
      ctx.fillStyle = inside;
      ctx.fill(path);
      ctx.stroke(path);
      break;
    }
    case "clench": {
      const path = new Path2D();
      path.roundRect(-12, 31.5, 24, 10, 4.5);
      ctx.fillStyle = teeth;
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = alpha(lip, 0.6);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-12, 36.5);
      ctx.lineTo(12, 36.5);
      for (const x of [-6, 0, 6]) {
        ctx.moveTo(x, 31);
        ctx.lineTo(x, 42);
      }
      ctx.stroke();
      ctx.restore();
      ctx.stroke(path);
      break;
    }
    case "frown": {
      ctx.beginPath();
      ctx.moveTo(-9, 39);
      ctx.quadraticCurveTo(0, 32, 9, 39);
      ctx.stroke();
      break;
    }
    case "wavy": {
      ctx.beginPath();
      ctx.moveTo(-10, 37);
      ctx.bezierCurveTo(-6, 33, -3, 33, 0, 36.5);
      ctx.bezierCurveTo(3, 40, 6, 40, 10, 36);
      ctx.stroke();
      break;
    }
    case "tongue": {
      ctx.beginPath();
      ctx.moveTo(-11, 33);
      ctx.quadraticCurveTo(0, 41, 11, 33);
      ctx.stroke();
      const path = new Path2D();
      path.moveTo(-1, 37.4);
      path.quadraticCurveTo(-1.5, 47, 4.5, 47);
      path.quadraticCurveTo(10.5, 47, 9.6, 35.8);
      ctx.fillStyle = tongue;
      ctx.fill(path);
      ctx.lineWidth = 2;
      ctx.stroke(path);
      ctx.beginPath();
      ctx.moveTo(4.4, 39.5);
      ctx.lineTo(4.6, 43.5);
      ctx.strokeStyle = alpha(darken(tongue, 0.35), 0.8);
      ctx.lineWidth = 1.3;
      ctx.stroke();
      break;
    }
    case "kiss": {
      ctx.fillStyle = mix(colors.skin, "#c2455a", 0.45);
      ctx.beginPath();
      ctx.ellipse(1, 37, 4.6, 4.2, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-2.2, 37);
      ctx.lineTo(4.2, 37);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

export function drawExpressionExtras(ctx: CanvasRenderingContext2D, expression: Expression, colors: FaceColors, g: HeadGeom) {
  if (expression.blush) {
    ctx.save();
    ctx.fillStyle = alpha("#ff5d5d", 0.32 * expression.blush + 0.08);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * (g.wC - 23), 25, 8.5, 5, 0, 0, TAU);
      ctx.fill();
    }
    if (expression.blush > 0.6) {
      ctx.strokeStyle = alpha("#e0474f", 0.5);
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        for (const offset of [-3.5, 0, 3.5]) {
          ctx.beginPath();
          ctx.moveTo(side * (g.wC - 23) + offset - 1.2, 27);
          ctx.lineTo(side * (g.wC - 23) + offset + 1.2, 22.5);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (expression.extra) {
    case "sweat": {
      ctx.fillStyle = "#8fd3ff";
      ctx.strokeStyle = "#2b6f9a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(38, -26);
      ctx.quadraticCurveTo(44, -16, 41.5, -13);
      ctx.arc(38, -14.5, 4, rad(-20), rad(200));
      ctx.quadraticCurveTo(33.5, -18, 38, -26);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "tears": {
      ctx.fillStyle = alpha("#9bdcff", 0.9);
      ctx.strokeStyle = "#3f86b5";
      ctx.lineWidth = 1.4;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 27, 10);
        ctx.quadraticCurveTo(side * 31, 22, side * 29, 30);
        ctx.quadraticCurveTo(side * 26.5, 33, side * 24.5, 29);
        ctx.quadraticCurveTo(side * 24, 20, side * 27, 10);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case "vein": {
      ctx.strokeStyle = "#d63a3a";
      ctx.lineWidth = 2;
      const x = 30;
      const y = -36;
      ctx.beginPath();
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        ctx.moveTo(x + dx * 1.5, y + dy * 4.5);
        ctx.quadraticCurveTo(x + dx * 1.5, y + dy * 1.5, x + dx * 4.5, y + dy * 1.5);
      }
      ctx.stroke();
      break;
    }
    case "sparkle": {
      drawSparkle(ctx, 37, -8, 5.5, "#ffd84a");
      drawSparkle(ctx, 44, 2, 3, "#ffd84a");
      break;
    }
    case "heart": {
      ctx.fillStyle = "#ff4f7b";
      ctx.strokeStyle = "#8f1732";
      ctx.lineWidth = 1.4;
      ctx.save();
      ctx.translate(20, 36);
      ctx.rotate(0.25);
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.bezierCurveTo(-6, -2.5, -3, -7.5, 0, -4);
      ctx.bezierCurveTo(3, -7.5, 6, -2.5, 0, 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = darken(color, 0.45);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
  ctx.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Barbas

const STUBBLE_DOTS: Array<[number, number]> = [
  [-38, 14], [-34, 22], [-30, 30], [-26, 37], [-21, 43], [-15, 48], [-8, 51], [0, 52], [8, 51], [15, 48], [21, 43], [26, 37], [30, 30], [34, 22], [38, 14],
  [-33, 12], [-29, 19], [-24, 27], [-20, 34], [-14, 40], [-6, 45], [6, 45], [14, 40], [20, 34], [24, 27], [29, 19], [33, 12],
  [-10, 29], [-5, 28], [0, 28.5], [5, 28], [10, 29], [-4, 44], [4, 44], [0, 47], [-11, 47], [11, 47],
];

function mustachePath(width: number, thickness: number, droop: number) {
  const path = new Path2D();
  path.moveTo(0, 28.4);
  path.bezierCurveTo(-width * 0.35, 26 - thickness * 0.2, -width * 0.8, 27, -width, 31 + droop);
  path.bezierCurveTo(-width * 0.7, 30 + thickness * 0.55, -width * 0.3, 29 + thickness, 0, 29 + thickness * 0.75);
  path.bezierCurveTo(width * 0.3, 29 + thickness, width * 0.7, 30 + thickness * 0.55, width, 31 + droop);
  path.bezierCurveTo(width * 0.8, 27, width * 0.35, 26 - thickness * 0.2, 0, 28.4);
  path.closePath();
  return path;
}

function goateePath(width: number, top: number, bottom: number, pointed = false) {
  const path = new Path2D();
  path.moveTo(-width, top);
  path.quadraticCurveTo(-width - 1, bottom - 4, pointed ? -3 : -width * 0.6, bottom);
  path.lineTo(0, bottom + (pointed ? 5 : 0.5));
  path.lineTo(pointed ? 3 : width * 0.6, bottom);
  path.quadraticCurveTo(width + 1, bottom - 4, width, top);
  path.quadraticCurveTo(0, top + 3.5, -width, top);
  path.closePath();
  return path;
}

/** Região de barba que cobre bochechas e queixo, com recorte suave em volta da boca. */
function beardRegion(g: HeadGeom, cheekTop: number, extendBelow: number, scallop: boolean) {
  const path = new Path2D();
  path.moveTo(-g.wC - 2, cheekTop);
  path.bezierCurveTo(-g.wC + 6, cheekTop + 10, -24, 28, -15, 30);
  path.quadraticCurveTo(0, 25, 15, 30);
  path.bezierCurveTo(24, 28, g.wC - 6, cheekTop + 10, g.wC + 2, cheekTop);
  path.lineTo(g.wC + 4, g.yJ);
  const bottom = g.yChin + extendBelow;
  if (scallop && extendBelow > 0) {
    const points = 7;
    let previousX = g.wJ + 2;
    let previousY = g.yJ + extendBelow * 0.5;
    path.lineTo(previousX, previousY);
    for (let index = 1; index <= points; index += 1) {
      const t = index / points;
      const x = (g.wJ + 2) * (1 - 2 * t);
      const y = g.yJ + extendBelow * 0.5 + (bottom - g.yJ - extendBelow * 0.5) * Math.sin(Math.PI * t);
      path.quadraticCurveTo((previousX + x) / 2, Math.max(previousY, y) + 5, x, y);
      previousX = x;
      previousY = y;
    }
  } else {
    path.lineTo(g.wJ + 2, g.yJ + 4);
    path.quadraticCurveTo(g.cw + 8, bottom + 3, 0, bottom + 2);
    path.quadraticCurveTo(-g.cw - 8, bottom + 3, -g.wJ - 2, g.yJ + 4);
  }
  path.lineTo(-g.wC - 4, g.yJ);
  path.closePath();
  return path;
}

export function drawBeard(
  ctx: CanvasRenderingContext2D,
  beard: number,
  g: HeadGeom,
  head: Path2D,
  colors: FaceColors,
  detail: number,
  layer: "base" | "mustache",
) {
  if (!beard) return;
  const color = mix(colors.hair, "#0d0907", 0.12);
  const outline = colors.hairInk;
  const base = layer === "base";
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const paint = (path: Path2D, clipToHead: boolean) => {
    ctx.save();
    if (clipToHead) ctx.clip(head);
    ctx.fillStyle = color;
    ctx.fill(path);
    ctx.strokeStyle = alpha(outline, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke(path);
    ctx.restore();
  };
  const mustache = (width: number, thickness: number, droop: number) => {
    if (!base) paint(mustachePath(width, thickness, droop), false);
  };
  const fullBeard = (cheekTop: number, extend: number, scallop: boolean) => {
    if (!base) return;
    const region = beardRegion(g, cheekTop, extend, scallop);
    ctx.save();
    if (extend <= 0) ctx.clip(head);
    ctx.fillStyle = color;
    ctx.fill(region);
    if (detail > 0.6) {
      ctx.save();
      ctx.clip(region);
      ctx.strokeStyle = alpha(darken(color, 0.35), 0.45);
      ctx.lineWidth = 1.1;
      for (let x = -g.wC; x <= g.wC; x += 5) {
        ctx.beginPath();
        ctx.moveTo(x, 36 - Math.abs(x) * 0.2);
        ctx.lineTo(x * 0.92, 50 + extend * 0.7);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = alpha(outline, 0.85);
    ctx.lineWidth = 2;
    ctx.stroke(region);
    ctx.restore();
    // lábio inferior aparece no meio da barba
    ctx.fillStyle = mix(colors.skin, colors.skinShade, 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 40.5, 7, 3.6, 0, 0, TAU);
    ctx.fill();
  };

  switch (beard) {
    case 1: { // Por fazer
      if (!base) break;
      ctx.save();
      ctx.clip(head);
      const region = beardRegion(g, 6, 0, false);
      ctx.fillStyle = alpha(color, 0.2);
      ctx.fill(region);
      ctx.fillStyle = alpha(mix(colors.hair, "#000", 0.2), 0.55);
      for (const [x, y] of STUBBLE_DOTS) {
        ctx.beginPath();
        ctx.arc(x * (g.wC / 50), y * (g.yChin / 56), 0.8, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 2: mustache(12.5, 4.6, 1); break; // Bigode
    case 3: mustache(11, 2.2, 0.5); break; // Bigode fino
    case 4: mustache(16, 7.8, 5); break; // Bigodão
    case 5: { // Cavanhaque
      if (base) {
        paint(goateePath(12.5, 40, 51), true);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-11.5, 32);
        ctx.lineTo(-12.5, 42);
        ctx.moveTo(11.5, 32);
        ctx.lineTo(12.5, 42);
        ctx.stroke();
      }
      mustache(12, 4.2, 4);
      break;
    }
    case 6: { // Barbicha
      if (!base) break;
      const patch = new Path2D();
      patch.moveTo(-3.5, 42.5);
      patch.lineTo(3.5, 42.5);
      patch.lineTo(0, 49);
      patch.closePath();
      paint(patch, false);
      break;
    }
    case 7: // Bigode e cavanhaque
      if (base) paint(goateePath(7.5, 43, g.yChin + 2, true), false);
      mustache(12, 4, 2.5);
      break;
    case 8: { // Barba desenhada
      if (!base) break;
      const strap = new Path2D();
      jawLine(strap, g, 2.5);
      ctx.save();
      ctx.clip(head);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5.5;
      ctx.stroke(strap);
      ctx.fillStyle = color;
      ctx.fillRect(-g.wC - 2, -8, 7, 20);
      ctx.fillRect(g.wC - 5, -8, 7, 20);
      ctx.restore();
      paint(goateePath(4, 43, 49), false);
      break;
    }
    case 9: { // Costeletas
      if (!base) break;
      ctx.save();
      ctx.clip(head);
      ctx.fillStyle = color;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * (g.wC + 2), -10);
        ctx.lineTo(side * (g.wC - 9), -10);
        ctx.lineTo(side * (g.wC - 11), 22);
        ctx.quadraticCurveTo(side * (g.wC - 5), 28, side * (g.wC + 2), 26);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = alpha(outline, 0.7);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 10: // Barba curta
      fullBeard(10, 0, false);
      mustache(13, 4.6, 3);
      break;
    case 11: // Barba cheia
      fullBeard(6, 6, true);
      mustache(14, 5.5, 4);
      break;
    case 12: // Lenhador
      fullBeard(2, 18, true);
      mustache(16, 7, 6);
      break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Marcas no rosto

export function drawMarks(ctx: CanvasRenderingContext2D, marks: number, g: HeadGeom, colors: FaceColors) {
  if (!marks) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const cheekX = g.wC - 24;
  switch (marks) {
    case 1: { // Sardas
      ctx.fillStyle = alpha(mix(colors.skinShade, "#7a3a1c", 0.5), 0.7);
      const dots: Array<[number, number]> = [[-cheekX - 4, 18], [-cheekX + 2, 22], [-cheekX - 7, 23], [-cheekX - 1, 27], [-cheekX + 6, 18], [-cheekX + 4, 26], [-7, 13], [-3, 11.5], [3, 11.5], [7, 13]];
      for (const [x, y] of [...dots, ...dots.map(([x, y]) => [-x, y] as [number, number])]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.15, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 2: // Pinta
      ctx.fillStyle = mix(colors.skinInk, "#2a1712", 0.4);
      ctx.beginPath();
      ctx.arc(cheekX - 2, 30, 1.9, 0, TAU);
      ctx.fill();
      break;
    case 3: { // Cicatriz
      ctx.strokeStyle = mix(colors.skin, "#c76b6b", 0.45);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-29, -22);
      ctx.lineTo(-21, 0);
      ctx.stroke();
      ctx.strokeStyle = alpha(mix(colors.skinInk, "#b85f5f", 0.4), 0.8);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const t of [0.2, 0.5, 0.8]) {
        const x = -29 + 8 * t;
        const y = -22 + 22 * t;
        ctx.moveTo(x - 3, y + 1.2);
        ctx.lineTo(x + 3, y - 1.2);
      }
      ctx.stroke();
      break;
    }
    case 4: // Bochechas rosadas
      ctx.fillStyle = alpha("#ff6b6b", 0.3);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * cheekX, 25, 9, 5.5, 0, 0, TAU);
        ctx.fill();
      }
      break;
    case 5: // Olheiras
      ctx.strokeStyle = alpha(mix(colors.skinShade, "#5a3a66", 0.45), 0.55);
      ctx.lineWidth = 2.2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * EYE_X, EYE_Y + 3, 10, rad(35), rad(145));
        ctx.stroke();
      }
      break;
    case 6: // Eye black
      ctx.fillStyle = "#141414";
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (EYE_X + 1), EYE_Y + 15);
        ctx.rotate(side * -0.08);
        ctx.beginPath();
        ctx.roundRect(-8.5, -2.3, 17, 4.6, 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 7: { // Curativo
      ctx.save();
      ctx.translate(-1, 12);
      ctx.rotate(-0.18);
      ctx.fillStyle = "#f2c79c";
      ctx.strokeStyle = "#9c6b45";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-11, -3.4, 22, 6.8, 3.4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e5ad7c";
      ctx.fillRect(-3.6, -2.6, 7.2, 5.2);
      ctx.fillStyle = "rgba(156,107,69,.6)";
      for (const x of [-8, -6, 6, 8]) {
        ctx.beginPath();
        ctx.arc(x, 0, 0.55, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 8: { // Pintura de torcida
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * cheekX, 24);
        ctx.rotate(side * -0.35);
        ctx.fillStyle = colors.accessory;
        ctx.beginPath();
        ctx.roundRect(-7, -5.2, 14, 3.4, 1.7);
        ctx.fill();
        ctx.fillStyle = mix(colors.accessory, "#ffffff", 0.85);
        ctx.beginPath();
        ctx.roundRect(-7, -1.4, 14, 2.8, 1.4);
        ctx.fill();
        ctx.fillStyle = colors.accessory;
        ctx.beginPath();
        ctx.roundRect(-7, 1.8, 14, 3.4, 1.7);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Acessórios de cabeça

export function drawGlasses(ctx: CanvasRenderingContext2D, glasses: number, g: HeadGeom, colors: FaceColors) {
  if (!glasses) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (glasses === 1) {
    // Viseira esportiva espelhada
    const lens = new Path2D();
    lens.moveTo(-g.wT + 3, -2);
    lens.bezierCurveTo(-30, -9, -12, -6, 0, -3);
    lens.bezierCurveTo(12, -6, 30, -9, g.wT - 3, -2);
    lens.bezierCurveTo(g.wT - 4, 10, 36, 18, 22, 17);
    lens.bezierCurveTo(12, 17, 6, 12, 0, 9);
    lens.bezierCurveTo(-6, 12, -12, 17, -22, 17);
    lens.bezierCurveTo(-36, 18, -g.wT + 4, 10, -g.wT + 3, -2);
    lens.closePath();
    const gradient = ctx.createLinearGradient(0, -8, 0, 18);
    gradient.addColorStop(0, mix(colors.accessory, "#101418", 0.7));
    gradient.addColorStop(0.55, mix(colors.accessory, "#2a3550", 0.35));
    gradient.addColorStop(1, mix(colors.accessory, "#ffb347", 0.35));
    ctx.fillStyle = gradient;
    ctx.fill(lens);
    ctx.save();
    ctx.clip(lens);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-34, 10);
    ctx.lineTo(-22, -6);
    ctx.moveTo(12, 12);
    ctx.lineTo(22, -2);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "#111417";
    ctx.lineWidth = 2.6;
    ctx.stroke(lens);
  } else {
    // Óculos de proteção (estilo Davids)
    ctx.strokeStyle = "#141518";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-g.wT - 1, 2);
    ctx.lineTo(-30, 4);
    ctx.moveTo(30, 4);
    ctx.lineTo(g.wT + 1, 2);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * EYE_X, EYE_Y, 13, 12, 0, 0, TAU);
      ctx.fillStyle = "rgba(196,226,255,.28)";
      ctx.fill();
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = "#141518";
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = colors.accessory;
      ctx.beginPath();
      ctx.ellipse(side * EYE_X, EYE_Y, 13, 12, 0, rad(200), rad(250));
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(side * EYE_X - 6, EYE_Y - 4);
      ctx.lineTo(side * EYE_X - 2, EYE_Y - 8);
      ctx.stroke();
    }
    ctx.strokeStyle = "#141518";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-7, 3);
    ctx.quadraticCurveTo(0, -1, 7, 3);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawEarrings(ctx: CanvasRenderingContext2D, earrings: number, g: HeadGeom, ears: number) {
  if (!earrings) return;
  const ear = earAnchor(g, ears);
  const sides = earrings === 1 ? [1] : [-1, 1];
  ctx.save();
  for (const side of sides) {
    const x = side * (ear.x + 2.5);
    const y = ear.y + ear.ry * 0.72;
    if (earrings === 3) {
      ctx.strokeStyle = "#7a5a10";
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.arc(x, y + 4.5, 4.6, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "#ffd54a";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = "#f7fbff";
      ctx.strokeStyle = "#6b7f95";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 3.2);
      ctx.lineTo(x + 3, y);
      ctx.lineTo(x, y + 3.2);
      ctx.lineTo(x - 3, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawSparkle(ctx, x + 3.5, y - 3.5, 2.4, "#ffffff");
    }
  }
  ctx.restore();
}

export function drawHeadwear(ctx: CanvasRenderingContext2D, headwear: number, colors: FaceColors, hairVolume: number) {
  if (!headwear) return;
  const color = colors.accessory;
  const outline = ink(color, 0.62);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const inflate = 3 + hairVolume;
  if (headwear === 1 || headwear === 2) {
    const width = headwear === 1 ? 9 : 4.2;
    const band = new Path2D();
    const y = headwear === 1 ? -34 : -40;
    band.moveTo(-50 - inflate * 0.6, y + width * 0.5 + 6);
    band.bezierCurveTo(-36, y - 6 - inflate * 0.3, 36, y - 6 - inflate * 0.3, 50 + inflate * 0.6, y + width * 0.5 + 6);
    band.lineTo(50 + inflate * 0.6, y + width * 1.5 + 6);
    band.bezierCurveTo(36, y + width - 6 - inflate * 0.3, -36, y + width - 6 - inflate * 0.3, -50 - inflate * 0.6, y + width * 1.5 + 6);
    band.closePath();
    ctx.fillStyle = color;
    ctx.fill(band);
    ctx.save();
    ctx.clip(band);
    ctx.fillStyle = alpha(lighten(color, 0.5), 0.35);
    ctx.fillRect(-60, y - 20, 120, 13 + (headwear === 1 ? 4 : 2));
    if (headwear === 1) {
      ctx.fillStyle = alpha(darken(color, 0.4), 0.35);
      ctx.fillRect(-60, y + 3, 120, 10);
    }
    ctx.restore();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke(band);
  } else {
    // Bandana amarrada
    const cap = new Path2D();
    cap.moveTo(-52 - hairVolume * 0.5, -18);
    cap.bezierCurveTo(-54 - hairVolume, -72 - hairVolume, 54 + hairVolume, -72 - hairVolume, 52 + hairVolume * 0.5, -18);
    cap.bezierCurveTo(30, -30, -30, -30, -52 - hairVolume * 0.5, -18);
    cap.closePath();
    ctx.fillStyle = color;
    ctx.fill(cap);
    ctx.save();
    ctx.clip(cap);
    ctx.fillStyle = alpha(mix(color, "#ffffff", 0.85), 0.75);
    for (const [x, y] of [[-26, -46], [-6, -56], [16, -48], [34, -36], [-38, -32], [4, -38]]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.3, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = alpha(darken(color, 0.4), 0.3);
    ctx.fillRect(-70, -34, 140, 20);
    ctx.restore();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.2;
    ctx.stroke(cap);
    // nó e pontas
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(48 + hairVolume * 0.5, -24);
    ctx.quadraticCurveTo(66, -22, 64, -8);
    ctx.lineTo(56, -12);
    ctx.quadraticCurveTo(58, -4, 52, 2);
    ctx.quadraticCurveTo(50, -10, 46 + hairVolume * 0.5, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

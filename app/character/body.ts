// Corpo inteiro: camisa, braços com pose, short, pernas, meião e chuteira.
// Mesmo espaço de coordenadas da cabeça (centro do rosto na origem).

import { alpha, ink, luminance, mix, readableOn } from "./color";
import { LINE, type FaceColors } from "./head";
import { paintKitPattern, sleeveColors } from "./kit";

const TAU = Math.PI * 2;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

type Build = { neck: number; shoulder: number; chest: number; waist: number; hip: number; arm: number; fore: number; thigh: number; calf: number; belly: number };

const BUILDS: Build[] = [
  { neck: 12, shoulder: 44, chest: 38, waist: 33, hip: 34, arm: 12.5, fore: 11.5, thigh: 15, calf: 12, belly: 0 }, // Magro
  { neck: 13.5, shoulder: 50, chest: 44, waist: 37, hip: 38, arm: 14.5, fore: 13, thigh: 17, calf: 13.5, belly: 0 }, // Atlético
  { neck: 15.5, shoulder: 57, chest: 50, waist: 42, hip: 42, arm: 18, fore: 15.5, thigh: 20, calf: 15.5, belly: 0 }, // Forte
  { neck: 15.5, shoulder: 54, chest: 50, waist: 49, hip: 46, arm: 17, fore: 15, thigh: 20, calf: 15.5, belly: 8 }, // Parrudo
];
const HEIGHTS = [
  { torso: 88, leg: 66, reach: 0.92 },
  { torso: 96, leg: 80, reach: 1 },
  { torso: 102, leg: 94, reach: 1.06 },
];

export type BodyGeom = Build & {
  shoulderY: number;
  hemY: number;
  shortsTop: number;
  shortsBottom: number;
  sockTop: number;
  ankleY: number;
  footY: number;
  upperLen: number;
  foreLen: number;
};

export function bodyGeometry(build: number, height: number): BodyGeom {
  const b = BUILDS[build] ?? BUILDS[1];
  const h = HEIGHTS[height] ?? HEIGHTS[1];
  const shoulderY = 64;
  const hemY = shoulderY + h.torso;
  const shortsTop = hemY - 14;
  const shortsBottom = hemY + 34;
  const ankleY = shortsBottom + h.leg;
  return {
    ...b,
    shoulderY,
    hemY,
    shortsTop,
    shortsBottom,
    sockTop: shortsBottom + h.leg * 0.4,
    ankleY,
    footY: ankleY + 15,
    upperLen: 50 * h.reach,
    foreLen: 46 * h.reach,
  };
}

/** Limites do desenho de corpo inteiro (para enquadrar no canvas). */
export const FULL_BODY_BOUNDS = { x: -112, y: -122, w: 224, h: 450 };

// ---------------------------------------------------------------------------
// Poses

type HandKind = "open" | "fist" | "thumb" | "point";
type ArmPose = { upper: number; fore: number; hand: HandKind; foreFront: boolean; foreScale?: number; upperScale?: number };
type Pose = { left: ArmPose; right: ArmPose; crossed?: boolean };

const RELAXED: ArmPose = { upper: 15, fore: 8, hand: "open", foreFront: false };
const POSES: Pose[] = [
  { left: RELAXED, right: RELAXED },
  { left: { upper: 50, fore: -54, hand: "fist", foreFront: true }, right: { upper: 50, fore: -54, hand: "fist", foreFront: true } },
  { left: { upper: 6, fore: -100, hand: "fist", foreFront: true, foreScale: 1.3, upperScale: 0.74 }, right: { upper: 6, fore: -88, hand: "fist", foreFront: true, foreScale: 1.3, upperScale: 0.8 }, crossed: true },
  { left: { upper: 140, fore: 164, hand: "fist", foreFront: false }, right: { upper: 140, fore: 164, hand: "fist", foreFront: false } },
  { left: RELAXED, right: { upper: 18, fore: -162, hand: "thumb", foreFront: true } },
  { left: RELAXED, right: { upper: 158, fore: 172, hand: "point", foreFront: false } },
];

type V = [number, number];

function armJoints(geom: BodyGeom, side: -1 | 1, pose: ArmPose) {
  const shoulder: V = [side * (geom.shoulder - geom.arm * 0.55), geom.shoulderY + 11];
  const upperDir: V = [side * Math.sin(rad(pose.upper)), Math.cos(rad(pose.upper))];
  const upperLen = geom.upperLen * (pose.upperScale ?? 1);
  const elbow: V = [shoulder[0] + upperDir[0] * upperLen, shoulder[1] + upperDir[1] * upperLen];
  const foreDir: V = [side * Math.sin(rad(pose.fore)), Math.cos(rad(pose.fore))];
  const foreLen = geom.foreLen * (pose.foreScale ?? 1);
  const hand: V = [elbow[0] + foreDir[0] * foreLen, elbow[1] + foreDir[1] * foreLen];
  return { shoulder, elbow, hand, foreDir, upperDir };
}

// ---------------------------------------------------------------------------

export type BodyStyle = {
  build: number;
  height: number;
  pose: number;
  tattoo: number;
  wristband: number;
  gloves: number;
  socks: number;
  boots: string;
  accessory: string;
  kitPattern: number;
  primary: string;
  secondary: string;
  number?: number;
};

function segment(ctx: CanvasRenderingContext2D, a: V, b: V, width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function capsule(a: V, b: V, radius: number) {
  const path = new Path2D();
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  path.arc(a[0], a[1], radius, angle + Math.PI / 2, angle - Math.PI / 2);
  path.arc(b[0], b[1], radius, angle - Math.PI / 2, angle + Math.PI / 2);
  path.closePath();
  return path;
}

function drawTattoo(ctx: CanvasRenderingContext2D, tattoo: number, a: V, b: V, width: number, upper: boolean) {
  if (!tattoo) return;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  ctx.save();
  ctx.clip(capsule(a, b, width / 2));
  ctx.translate(a[0], a[1]);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(24,30,52,.72)";
  ctx.fillStyle = "rgba(24,30,52,.72)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (tattoo === 1 && upper) {
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let x = length * 0.45; x < length * 0.92; x += 9) {
      ctx.moveTo(x, -width / 2);
      ctx.quadraticCurveTo(x + 6, 0, x, width / 2);
      ctx.moveTo(x + 4, -width / 2);
      ctx.lineTo(x + 7, -1);
    }
    ctx.stroke();
  } else if (tattoo === 2) {
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.9;
    for (let x = upper ? length * 0.4 : 0; x < length; x += 7) {
      ctx.beginPath();
      ctx.arc(x, (x % 14) - 4, 3.6, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 3, width / 2);
      ctx.quadraticCurveTo(x + 2, 0, x + 6, -width / 2);
      ctx.stroke();
    }
  } else if (tattoo === 3 && !upper) {
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = length * 0.2; x < length * 0.72; x += 3.4) {
      ctx.moveTo(x, 1.6);
      ctx.lineTo(x + 1.6, -1.6);
      ctx.lineTo(x + 2.4, 1.2);
    }
    ctx.stroke();
  } else if (tattoo === 4 && !upper) {
    for (const [x, y, r] of [[length * 0.3, -2, 3.2], [length * 0.52, 2, 2.4], [length * 0.7, -1, 1.8]]) {
      ctx.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const radius = point % 2 ? r * 0.45 : r;
        const theta = -Math.PI / 2 + (point * Math.PI) / 5;
        ctx.lineTo(x + Math.cos(theta) * radius, y + Math.sin(theta) * radius);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHand(ctx: CanvasRenderingContext2D, position: V, dir: V, kind: HandKind, side: -1 | 1, size: number, skin: string, skinInk: string, gloves: boolean, accessory: string) {
  const fill = gloves ? mix(accessory, "#ffffff", 0.1) : skin;
  const outline = gloves ? ink(accessory, 0.6) : skinInk;
  const r = size * (gloves ? 0.82 : 0.62);
  ctx.save();
  ctx.translate(position[0], position[1]);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const finish = (path: Path2D) => {
    ctx.fillStyle = fill;
    ctx.fill(path);
    ctx.strokeStyle = outline;
    ctx.lineWidth = LINE * 0.9;
    ctx.stroke(path);
  };
  if (kind === "thumb" || kind === "point") {
    const digit = new Path2D();
    if (kind === "thumb") digit.roundRect(-side * r * 0.1 - r * 0.32, -r * 1.85, r * 0.68, r * 1.4, r * 0.34);
    else digit.roundRect(-r * 0.28, -r * 2.2, r * 0.56, r * 1.7, r * 0.28);
    finish(digit);
  }
  const angle = Math.atan2(dir[1], dir[0]);
  const palm = new Path2D();
  if (kind === "open") {
    palm.ellipse(dir[0] * r * 0.35, dir[1] * r * 0.35, r * 1.18, r * 0.92, angle, 0, TAU);
  } else {
    palm.ellipse(0, 0, r * 1.02, r * 0.94, angle, 0, TAU);
  }
  finish(palm);
  if (kind === "open") {
    const thumb = new Path2D();
    thumb.ellipse(-side * r * 0.75, -r * 0.05, r * 0.42, r * 0.62, -side * 0.4, 0, TAU);
    finish(thumb);
  }
  ctx.strokeStyle = alpha(outline, 0.55);
  ctx.lineWidth = 1.2;
  if (kind !== "open") {
    for (const offset of [-0.4, 0, 0.4]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.25, offset * r * 1.2, r * 0.3, rad(side > 0 ? 270 : -90), rad(side > 0 ? 450 : 90), side < 0);
      ctx.stroke();
    }
  }
  if (gloves) {
    ctx.fillStyle = alpha("#ffffff", 0.85);
    ctx.beginPath();
    ctx.roundRect(-r * 0.9, r * 0.35, r * 1.8, r * 0.5, r * 0.2);
    ctx.fill();
  }
  ctx.restore();
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  geom: BodyGeom,
  side: -1 | 1,
  pose: ArmPose,
  style: BodyStyle,
  colors: FaceColors,
  sleeve: string,
  part: "upper" | "fore" | "all",
) {
  const { shoulder, elbow, hand, foreDir } = armJoints(geom, side, pose);
  const outlineWidth = LINE * 2;
  if (part !== "fore") {
    segment(ctx, shoulder, elbow, geom.arm + outlineWidth, colors.skinInk);
    segment(ctx, shoulder, elbow, geom.arm, colors.skin);
    drawTattoo(ctx, style.tattoo, shoulder, elbow, geom.arm, true);
  }
  if (part !== "upper") {
    segment(ctx, elbow, hand, geom.fore + outlineWidth, colors.skinInk);
    segment(ctx, elbow, hand, geom.fore, colors.skin);
    segment(ctx, elbow, [elbow[0] + (shoulder[0] - elbow[0]) * 0.08, elbow[1] + (shoulder[1] - elbow[1]) * 0.08], geom.arm * 0.92, colors.skin);
    drawTattoo(ctx, style.tattoo, elbow, hand, geom.fore, false);
    const showBand = style.wristband === 2 || (style.wristband === 1 && side > 0);
    if (showBand && !style.gloves) {
      const a: V = [hand[0] - foreDir[0] * 15, hand[1] - foreDir[1] * 15];
      const b: V = [hand[0] - foreDir[0] * 7, hand[1] - foreDir[1] * 7];
      segment(ctx, a, b, geom.fore + 4 + outlineWidth * 0.8, ink(style.accessory, 0.6));
      segment(ctx, a, b, geom.fore + 4, style.accessory);
      segment(ctx, [a[0] + foreDir[0] * 3.5, a[1] + foreDir[1] * 3.5], [a[0] + foreDir[0] * 4.6, a[1] + foreDir[1] * 4.6], geom.fore + 4, alpha("#ffffff", 0.35));
    }
    drawHand(ctx, hand, foreDir, pose.hand, side, geom.fore, colors.skin, colors.skinInk, style.gloves > 0, style.accessory);
  }
  if (part !== "fore") {
    // manga
    const sleeveEnd: V = [shoulder[0] + (elbow[0] - shoulder[0]) * 0.55, shoulder[1] + (elbow[1] - shoulder[1]) * 0.55];
    const start: V = [shoulder[0] - (elbow[0] - shoulder[0]) * 0.12, shoulder[1] - (elbow[1] - shoulder[1]) * 0.12];
    const width = geom.arm + 8;
    segment(ctx, start, sleeveEnd, width + outlineWidth, ink(sleeve, 0.6));
    segment(ctx, start, sleeveEnd, width, sleeve);
    const trimA: V = [sleeveEnd[0] - (elbow[0] - shoulder[0]) * 0.07, sleeveEnd[1] - (elbow[1] - shoulder[1]) * 0.07];
    ctx.save();
    ctx.clip(capsule(start, sleeveEnd, width / 2));
    ctx.lineCap = "butt";
    ctx.strokeStyle = trimColor(style.primary, style.secondary, sleeve);
    ctx.lineWidth = width + 2;
    ctx.beginPath();
    ctx.moveTo(trimA[0], trimA[1]);
    ctx.lineTo(sleeveEnd[0] + (elbow[0] - shoulder[0]) * 0.2, sleeveEnd[1] + (elbow[1] - shoulder[1]) * 0.2);
    ctx.stroke();
    ctx.restore();
  }
}

function trimColor(primary: string, secondary: string, base: string) {
  return base === secondary ? primary : secondary;
}

function torsoPath(geom: BodyGeom) {
  const t = geom.shoulderY;
  const n = geom.neck + 3;
  const hem = geom.hemY;
  const path = new Path2D();
  path.moveTo(-n, t - 5);
  path.quadraticCurveTo(-n - 10, t - 3, -geom.shoulder + 9, t + 1);
  path.quadraticCurveTo(-geom.shoulder - 1, t + 3, -geom.shoulder, t + 17);
  path.lineTo(-geom.chest - 1, t + 40);
  path.quadraticCurveTo(-geom.waist - geom.belly - 3, hem - 34, -geom.waist - 1, hem - 2);
  path.quadraticCurveTo(0, hem + 5, geom.waist + 1, hem - 2);
  path.quadraticCurveTo(geom.waist + geom.belly + 3, hem - 34, geom.chest + 1, t + 40);
  path.lineTo(geom.shoulder, t + 17);
  path.quadraticCurveTo(geom.shoulder + 1, t + 3, geom.shoulder - 9, t + 1);
  path.quadraticCurveTo(n + 10, t - 3, n, t - 5);
  path.quadraticCurveTo(0, t + 9, -n, t - 5);
  path.closePath();
  return path;
}

/** Camisa sem braços — usada tanto no busto quanto no corpo inteiro. */
export function drawJersey(ctx: CanvasRenderingContext2D, geom: BodyGeom, style: BodyStyle, options: { number?: number; showNumber: boolean; detail: number }) {
  const path = torsoPath(geom);
  const t = geom.shoulderY;
  ctx.save();
  ctx.clip(path);
  paintKitPattern(ctx, style.kitPattern, style.primary, style.secondary, { x: -geom.shoulder - 4, y: t - 8, w: geom.shoulder * 2 + 8, h: geom.hemY - t + 12 });
  const side = ctx.createLinearGradient(-geom.shoulder, 0, geom.shoulder, 0);
  side.addColorStop(0, "rgba(255,255,255,.14)");
  side.addColorStop(0.42, "rgba(255,255,255,0)");
  side.addColorStop(1, "rgba(0,0,0,.22)");
  ctx.fillStyle = side;
  ctx.fillRect(-geom.shoulder - 4, t - 10, geom.shoulder * 2 + 8, geom.hemY - t + 20);
  const fold = ctx.createLinearGradient(0, geom.hemY - 40, 0, geom.hemY);
  fold.addColorStop(0, "rgba(0,0,0,0)");
  fold.addColorStop(1, "rgba(0,0,0,.18)");
  ctx.fillStyle = fold;
  ctx.fillRect(-geom.shoulder - 4, geom.hemY - 40, geom.shoulder * 2 + 8, 44);
  if (options.detail > 0.5) {
    ctx.strokeStyle = "rgba(0,0,0,.14)";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-geom.chest + 4, t + 44);
    ctx.quadraticCurveTo(-geom.chest + 12, t + 54, -geom.chest + 8, t + 66);
    ctx.moveTo(geom.chest - 4, t + 44);
    ctx.quadraticCurveTo(geom.chest - 12, t + 54, geom.chest - 8, t + 66);
    ctx.stroke();
  }
  if (options.showNumber && options.number !== undefined) {
    const numberColor = contrastFor(style.primary, style.secondary);
    ctx.font = `900 30px "Arial Narrow", "Roboto Condensed", Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = alpha(ink(numberColor === "#ffffff" ? style.primary : numberColor, 0.7), 0.85);
    ctx.strokeText(String(options.number), 0, t + 46);
    ctx.fillStyle = numberColor;
    ctx.fillText(String(options.number), 0, t + 46);
    // escudo pequeno no peito
    ctx.save();
    ctx.translate(geom.chest * 0.5, t + 20);
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(5, -5);
    ctx.lineTo(5, 1);
    ctx.quadraticCurveTo(5, 5.5, 0, 7.5);
    ctx.quadraticCurveTo(-5, 5.5, -5, 1);
    ctx.closePath();
    ctx.fillStyle = style.secondary;
    ctx.fill();
    ctx.strokeStyle = ink(style.secondary, 0.6);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = style.primary;
    ctx.beginPath();
    ctx.arc(0, 0.5, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = ink(style.primary, 0.62);
  ctx.lineWidth = LINE;
  ctx.lineJoin = "round";
  ctx.stroke(path);
  // gola
  const n = geom.neck + 3;
  ctx.beginPath();
  ctx.moveTo(-n - 1, t - 5.5);
  ctx.quadraticCurveTo(0, t + 10, n + 1, t - 5.5);
  const trim = trimColor(style.primary, style.secondary, style.primary);
  ctx.strokeStyle = ink(trim, 0.6);
  ctx.lineWidth = 7.4;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.strokeStyle = trim;
  ctx.lineWidth = 4.4;
  ctx.stroke();
}

function contrastFor(primary: string, secondary: string) {
  const difference = Math.abs(luminance(primary) - luminance(secondary));
  return difference > 0.22 ? secondary : readableOn(primary);
}

function legPath(geom: BodyGeom, side: -1 | 1) {
  const top = geom.shortsBottom - 10;
  const x0 = side * geom.hip * 0.48;
  const x1 = side * (geom.hip * 0.48 + 5);
  const thigh = geom.thigh;
  const calf = geom.calf;
  const ankle = calf * 0.62;
  const knee = top + (geom.ankleY - top) * 0.42;
  const path = new Path2D();
  path.moveTo(x0 - thigh, top);
  path.lineTo(x0 + thigh, top);
  path.bezierCurveTo(x0 + thigh, knee - 10, (x0 + x1) / 2 + calf * 0.9, knee, (x0 + x1) / 2 + calf + 1.5, knee + 14);
  path.bezierCurveTo((x0 + x1) / 2 + calf + 2, knee + 30, x1 + ankle, geom.ankleY - 16, x1 + ankle, geom.ankleY);
  path.lineTo(x1 - ankle, geom.ankleY);
  path.bezierCurveTo(x1 - ankle, geom.ankleY - 16, (x0 + x1) / 2 - calf - 2, knee + 30, (x0 + x1) / 2 - calf - 1.5, knee + 14);
  path.bezierCurveTo((x0 + x1) / 2 - calf * 0.9, knee, x0 - thigh, knee - 10, x0 - thigh, top);
  path.closePath();
  return { path, knee, x1, ankle };
}

function drawLegs(ctx: CanvasRenderingContext2D, geom: BodyGeom, style: BodyStyle, colors: FaceColors) {
  const sockColor = style.primary;
  const band = style.secondary;
  for (const side of [-1, 1] as const) {
    const { path, knee, x1, ankle } = legPath(geom, side);
    ctx.fillStyle = colors.skin;
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    const shade = ctx.createLinearGradient(side * 10, 0, side * (geom.hip * 0.48 + geom.thigh), 0);
    shade.addColorStop(0, alpha(colors.skinShade, 0));
    shade.addColorStop(1, alpha(colors.skinShade, side > 0 ? 0.5 : 0.25));
    ctx.fillStyle = shade;
    ctx.fillRect(-120, geom.shortsBottom - 12, 240, geom.ankleY - geom.shortsBottom + 20);
    // meião
    const sockTop = style.socks === 1 ? geom.ankleY - 16 : geom.sockTop;
    ctx.fillStyle = sockColor;
    ctx.fillRect(-120, sockTop, 240, geom.ankleY - sockTop + 4);
    if (style.socks !== 1) {
      ctx.fillStyle = band;
      ctx.fillRect(-120, sockTop + 6, 240, 4.5);
      ctx.fillRect(-120, sockTop + 13, 240, 2.2);
    } else {
      // caneleira à mostra
      ctx.fillStyle = "#eef2f4";
      ctx.beginPath();
      ctx.roundRect(x1 - ankle - 1 + side * 0.5, knee + 6, ankle * 2 + 2, sockTop - knee - 8, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(40,55,70,.4)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = sockColor;
      ctx.fillRect(-120, sockTop - 4, 240, 6);
      ctx.fillStyle = alpha("#000000", 0.18);
      ctx.fillRect(-120, sockTop + 1, 240, 1.6);
    }
    if (style.socks === 2) {
      ctx.fillStyle = "#f4f4ef";
      ctx.fillRect(-120, sockTop - 2, 240, 6);
      ctx.strokeStyle = "rgba(0,0,0,.18)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-120, sockTop + 1);
      ctx.lineTo(120, sockTop + 1);
      ctx.stroke();
    }
    const sockShade = ctx.createLinearGradient(side * 6, 0, side * (geom.hip * 0.5 + geom.calf + 6), 0);
    sockShade.addColorStop(0, "rgba(0,0,0,0)");
    sockShade.addColorStop(1, "rgba(0,0,0,.22)");
    ctx.fillStyle = sockShade;
    ctx.fillRect(-120, sockTop, 240, geom.ankleY - sockTop + 4);
    ctx.restore();
    ctx.strokeStyle = colors.skinInk;
    ctx.lineWidth = LINE;
    ctx.lineJoin = "round";
    ctx.stroke(path);
    // contorno do meião por cima do contorno da pele
    ctx.save();
    ctx.clip(new Path2D(`M -200 ${sockTop} L 200 ${sockTop} L 200 400 L -200 400 Z`));
    ctx.strokeStyle = ink(sockColor, 0.6);
    ctx.stroke(path);
    ctx.restore();
    ctx.strokeStyle = ink(sockColor, 0.6);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x1 - ankle - geom.calf * 0.6, sockTop);
    ctx.lineTo(x1 + ankle + geom.calf * 0.6, sockTop);
    ctx.save();
    ctx.clip(path);
    ctx.stroke();
    ctx.restore();
    drawBoot(ctx, geom, side, x1, ankle, style.boots);
  }
}

function drawBoot(ctx: CanvasRenderingContext2D, geom: BodyGeom, side: -1 | 1, x: number, ankle: number, color: string) {
  const top = geom.ankleY - 6;
  const bottom = geom.footY;
  const toe = x + side * 13;
  const path = new Path2D();
  path.moveTo(x - ankle - 1, top);
  path.lineTo(x + ankle + 1, top);
  path.bezierCurveTo(x + ankle + 3 + (side > 0 ? 10 : 0), top + 3, toe + side * 8 + 4, bottom - 9, toe + side * 6 + (side > 0 ? 2 : -2), bottom - 2);
  path.quadraticCurveTo(toe + side * 2, bottom + 1.5, x, bottom);
  path.quadraticCurveTo(x - side * ankle * 1.6, bottom + 0.5, x - side * (ankle + 3), bottom - 4);
  path.bezierCurveTo(x - side * (ankle + 3), top + 6, x - side * (ankle + 1), top + 2, side > 0 ? x - ankle - 1 : x + ankle + 1, top);
  path.closePath();
  const outline = ink(color, 0.65);
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  const shine = ctx.createLinearGradient(0, top, 0, bottom);
  shine.addColorStop(0, "rgba(255,255,255,.28)");
  shine.addColorStop(0.5, "rgba(255,255,255,0)");
  shine.addColorStop(1, "rgba(0,0,0,.25)");
  ctx.fillStyle = shine;
  ctx.fillRect(x - 40, top - 2, 80, bottom - top + 6);
  // sola
  const sole = luminance(color) > 0.5 ? "#2a2c30" : "#f1f1ec";
  ctx.fillStyle = sole;
  ctx.fillRect(x - 40, bottom - 3.4, 80, 4);
  // faixa lateral
  ctx.strokeStyle = alpha(luminance(color) > 0.5 ? "#1d1f23" : "#ffffff", 0.75);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - side * 2, top + 6);
  ctx.quadraticCurveTo(x + side * 6, bottom - 4, toe + side * 5, bottom - 6);
  ctx.stroke();
  // cadarços
  ctx.strokeStyle = alpha(luminance(color) > 0.5 ? "#2a2c30" : "#ffffff", 0.7);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (const offset of [2, 5.5]) {
    ctx.moveTo(x - 3.5, top + offset);
    ctx.lineTo(x + 3.5, top + offset);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = outline;
  ctx.lineWidth = LINE * 0.9;
  ctx.lineJoin = "round";
  ctx.stroke(path);
  // travas
  ctx.fillStyle = outline;
  for (const dx of [-8, 0, 8]) {
    ctx.beginPath();
    ctx.roundRect(x + side * 4 + dx - 1.5, bottom - 0.5, 3, 2.6, 1);
    ctx.fill();
  }
}

function drawShorts(ctx: CanvasRenderingContext2D, geom: BodyGeom, style: BodyStyle) {
  const top = geom.shortsTop;
  const bottom = geom.shortsBottom;
  const outer = geom.hip + 5;
  const color = style.secondary;
  const stripe = style.primary;
  const path = new Path2D();
  path.moveTo(-geom.waist - 1, top);
  path.lineTo(geom.waist + 1, top);
  path.quadraticCurveTo(outer + 1, top + 14, outer + 2, bottom - 1);
  path.quadraticCurveTo(geom.hip * 0.5, bottom + 4, 3, bottom - 5);
  path.lineTo(0, bottom - 12);
  path.lineTo(-3, bottom - 5);
  path.quadraticCurveTo(-geom.hip * 0.5, bottom + 4, -outer - 2, bottom - 1);
  path.quadraticCurveTo(-outer - 1, top + 14, -geom.waist - 1, top);
  path.closePath();
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = stripe;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * (outer - 3), top);
    ctx.lineTo(side * (outer + 4), top);
    ctx.lineTo(side * (outer + 4), bottom + 4);
    ctx.lineTo(side * (outer - 1), bottom + 4);
    ctx.closePath();
    ctx.fill();
  }
  const shade = ctx.createLinearGradient(0, top, 0, bottom);
  shade.addColorStop(0, "rgba(0,0,0,.2)");
  shade.addColorStop(0.3, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,.12)");
  ctx.fillStyle = shade;
  ctx.fillRect(-outer - 6, top, outer * 2 + 12, bottom - top + 6);
  ctx.strokeStyle = "rgba(0,0,0,.18)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, top + 14);
  ctx.lineTo(0, bottom - 12);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = ink(color, 0.6);
  ctx.lineWidth = LINE;
  ctx.lineJoin = "round";
  ctx.stroke(path);
}

export function drawBodyBackLayer(ctx: CanvasRenderingContext2D, geom: BodyGeom, style: BodyStyle, colors: FaceColors) {
  // sombra no chão
  const ground = ctx.createRadialGradient(0, geom.footY + 2, 4, 0, geom.footY + 2, 78);
  ground.addColorStop(0, "rgba(0,0,0,.45)");
  ground.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.ellipse(0, geom.footY + 2, 78, 11, 0, 0, TAU);
  ctx.fill();

  drawLegs(ctx, geom, style, colors);
  drawShorts(ctx, geom, style);
  const pose = POSES[style.pose] ?? POSES[0];
  const sleeves = sleeveColors(style.kitPattern, style.primary, style.secondary);
  if (pose.crossed) {
    drawArm(ctx, geom, -1, pose.left, style, colors, sleeves[0], "upper");
    drawArm(ctx, geom, 1, pose.right, style, colors, sleeves[1], "upper");
    return;
  }
  for (const side of [-1, 1] as const) {
    const armPose = side < 0 ? pose.left : pose.right;
    drawArm(ctx, geom, side, armPose, style, colors, sleeves[side < 0 ? 0 : 1], armPose.foreFront ? "upper" : "all");
  }
}

export function drawBodyFrontLayer(ctx: CanvasRenderingContext2D, geom: BodyGeom, style: BodyStyle, colors: FaceColors) {
  const pose = POSES[style.pose] ?? POSES[0];
  const sleeves = sleeveColors(style.kitPattern, style.primary, style.secondary);
  if (pose.crossed) {
    drawArm(ctx, geom, 1, pose.right, style, colors, sleeves[1], "fore");
    drawArm(ctx, geom, -1, pose.left, style, colors, sleeves[0], "fore");
    return;
  }
  for (const side of [-1, 1] as const) {
    const armPose = side < 0 ? pose.left : pose.right;
    if (armPose.foreFront) drawArm(ctx, geom, side, armPose, style, colors, sleeves[side < 0 ? 0 : 1], "fore");
  }
}

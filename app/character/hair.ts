// Biblioteca de cabelos. Cada estilo devolve camadas (atrás da cabeça e por
// cima dela) montadas a partir da elipse do crânio, para que todos os cortes
// encaixem no mesmo rosto. As cores e o acabamento ficam no pintor genérico.

import { alpha, darken, ink, lighten } from "./color";
import { LINE } from "./head";

type V = [number, number];
const TAU = Math.PI * 2;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

const SKULL = { cx: 0, cy: -18, rx: 50, ry: 44 };
const CROWN: V = [-8, -64];

/** Ponto na elipse do crânio. `inflate` afasta da pele; `lift` só levanta o topo. */
function sp(angle: number, inflate = 0, lift = 0): V {
  return [
    SKULL.cx + Math.cos(rad(angle)) * (SKULL.rx + inflate),
    SKULL.cy + Math.sin(rad(angle)) * (SKULL.ry + inflate + lift),
  ];
}

function arcPoints(a0: number, a1: number, inflate: number, lift = 0, steps = 14): V[] {
  return Array.from({ length: steps + 1 }, (_, index) => sp(a0 + ((a1 - a0) * index) / steps, inflate, lift));
}

/** Arco com lóbulos suaves: sugere mechas em vez de um capacete perfeito. */
function lobedArc(a0: number, a1: number, inflate: number, lift: number, lobes: number, amp: number): V[] {
  const steps = lobes * 2;
  return Array.from({ length: steps + 1 }, (_, index) => sp(a0 + ((a1 - a0) * index) / steps, inflate + (index % 2 ? amp : 0), lift));
}

/** Catmull-Rom suave passando por todos os pontos (o ponto atual deve ser points[0]). */
function curveThrough(path: Path2D, points: V[], tension = 1) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    path.bezierCurveTo(
      p1[0] + ((p2[0] - p0[0]) / 6) * tension,
      p1[1] + ((p2[1] - p0[1]) / 6) * tension,
      p2[0] - ((p3[0] - p1[0]) / 6) * tension,
      p2[1] - ((p3[1] - p1[1]) / 6) * tension,
      p2[0],
      p2[1],
    );
  }
}

function smoothClosed(points: V[], tension = 1) {
  const path = new Path2D();
  const count = points.length;
  path.moveTo(points[0][0], points[0][1]);
  for (let index = 0; index < count; index += 1) {
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];
    path.bezierCurveTo(
      p1[0] + ((p2[0] - p0[0]) / 6) * tension,
      p1[1] + ((p2[1] - p0[1]) / 6) * tension,
      p2[0] - ((p3[0] - p1[0]) / 6) * tension,
      p2[1] - ((p3[1] - p1[1]) / 6) * tension,
      p2[0],
      p2[1],
    );
  }
  path.closePath();
  return path;
}

/** Contorno ondulado (cachos): cada trecho vira uma "bolinha" para fora. */
function scallopClosed(points: V[], bulge = 0.55) {
  const path = new Path2D();
  const count = points.length;
  path.moveTo(points[0][0], points[0][1]);
  for (let index = 0; index < count; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % count];
    const nx = b[1] - a[1];
    const ny = -(b[0] - a[0]);
    path.quadraticCurveTo((a[0] + b[0]) / 2 + nx * bulge, (a[1] + b[1]) / 2 + ny * bulge, b[0], b[1]);
  }
  path.closePath();
  return path;
}

/**
 * Linha do cabelo em mechas pontudas. As âncoras vão da têmpora direita para
 * a esquerda; `sweep` decide para que lado as pontas penteiam.
 */
function tufts(path: Path2D, anchors: V[], depths: number | number[], sweep: number, tips: V[]) {
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const a = anchors[index];
    const b = anchors[index + 1];
    const depth = Array.isArray(depths) ? depths[index] ?? 0 : depths;
    if (depth <= 0.2) {
      path.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1, b[0], b[1]);
      continue;
    }
    const tip: V = [a[0] + (b[0] - a[0]) * sweep, Math.max(a[1], b[1]) + depth];
    path.quadraticCurveTo(a[0] + (tip[0] - a[0]) * 0.92, a[1] + (tip[1] - a[1]) * 0.3, tip[0], tip[1]);
    path.quadraticCurveTo(tip[0] + (b[0] - tip[0]) * 0.18, b[1] + (tip[1] - b[1]) * 0.35, b[0], b[1]);
    tips.push(tip);
  }
}

type CapOptions = {
  inflate: number;
  lift?: number;
  lobes?: number;
  amp?: number;
  a0?: number;
  a1?: number;
  sideBottom?: number;
  sideWidth?: number;
  hairline: V[];
  depths?: number | number[];
  sweep?: number;
};

/** Capacete natural: contorno com lóbulos, costeletas e franja em mechas. */
function naturalCap(options: CapOptions) {
  const { inflate, lift = 0, lobes = 7, amp = 2, a0 = 166, a1 = 374, sideBottom = 0, sideWidth = 7, hairline, depths = 0, sweep = 0.6 } = options;
  const path = new Path2D();
  const outer = amp > 0 ? lobedArc(a0, a1, inflate, lift, lobes, amp) : arcPoints(a0, a1, inflate, lift, 16);
  path.moveTo(-50 - inflate * 0.3, sideBottom);
  path.lineTo(outer[0][0], outer[0][1]);
  curveThrough(path, outer);
  path.lineTo(50 + inflate * 0.3, sideBottom);
  path.lineTo(50 - sideWidth, sideBottom);
  path.lineTo(hairline[0][0], hairline[0][1]);
  const tips: V[] = [];
  tufts(path, hairline, depths, sweep, tips);
  path.lineTo(-50 + sideWidth, sideBottom);
  path.closePath();
  return { path, tips };
}

/** Fios de textura que sobem das pontas da franja em direção ao redemoinho. */
function strandsFromTips(tips: V[], reach = 0.55, crown: V = CROWN): Array<V[]> {
  return tips.map((tip) => {
    const end: V = [tip[0] + (crown[0] - tip[0]) * reach, tip[1] + (crown[1] - tip[1]) * reach];
    const mid: V = [(tip[0] + end[0]) / 2 + tip[0] * 0.12, (tip[1] + end[1]) / 2];
    return [[tip[0], tip[1] - 3], mid, end];
  });
}

function headShaved(top = -36) {
  const path = new Path2D();
  path.moveTo(-49, 2);
  path.lineTo(-49.5, -12);
  curveThrough(path, arcPoints(172, 368, 0.6, 0, 16));
  path.lineTo(49, 2);
  path.lineTo(44, 2);
  path.lineTo(42, -22);
  curveThrough(path, [[42, -22], [30, top + 4], [12, top + 1], [-8, top + 1], [-28, top + 4], [-42, -22]]);
  path.lineTo(-44, 2);
  path.closePath();
  return path;
}

/** Fios grossos (dreads, tranças, twists) desenhados como traços com contorno. */
type Strand = { points: V[]; width: number; braid?: boolean };

type Shine = { cx: number; cy: number; rx: number; ry: number; a0: number; a1: number; width?: number };

export type HairParts = {
  back?: Path2D[];
  backStrands?: Strand[];
  /** Raspado: textura translúcida sobre o couro cabeludo. */
  shaved?: Path2D;
  front?: Path2D[];
  strands?: Strand[];
  /** Linhas de textura desenhadas dentro do cabelo da frente. */
  texture?: Array<V[]>;
  shine?: Shine[];
  curls?: Array<[number, number, number]>;
  coversEars?: boolean;
  bald?: boolean;
  /** Volume extra no topo (faixas e bandanas acompanham). */
  volume: number;
};

const CAP_SHINE: Shine[] = [{ cx: -4, cy: -24, rx: 36, ry: 32, a0: 208, a1: 246, width: 4.5 }];

/** Cachos espalhados pelo volume com leve variação (determinística) de posição e tamanho. */
function curlField(centerX: number, centerY: number, rx: number, ry: number, count: number, size: number): Array<[number, number, number]> {
  const curls: Array<[number, number, number]> = [];
  let seed = Math.round(centerX * 7 + centerY * 13 + rx * 3 + count);
  const noise = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280 - 0.5;
  };
  for (let ring = 0; ring < 3; ring += 1) {
    const scale = 0.35 + ring * 0.3;
    const items = Math.max(3, Math.round(count * scale));
    for (let index = 0; index < items; index += 1) {
      const angle = Math.PI + (Math.PI * (index + 0.5 + (ring % 2) * 0.5 + noise() * 0.5)) / items;
      const reach = scale + noise() * 0.12;
      curls.push([centerX + Math.cos(angle) * rx * reach, centerY + Math.sin(angle) * ry * reach, size * (1 + noise() * 0.35)]);
    }
  }
  return curls;
}

function strandsAround(a0: number, a1: number, count: number, inflate: number, length: number, width: number, braid = false, spread = 1, sway = 0): Strand[] {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const angle = a0 + (a1 - a0) * t;
    const root = sp(angle, inflate);
    const dir = Math.cos(rad(angle)) * spread;
    const end: V = [root[0] + dir * 10 + sway * (index % 2 ? 1 : -1), root[1] + length];
    const mid: V = [root[0] + dir * 7 + sway * 0.5, root[1] + length * 0.5];
    return { points: [root, mid, end], width, braid };
  });
}

// Linhas de cabelo (da têmpora direita para a esquerda).
const HL_LOW: V[] = [[41, -22], [33, -30], [24, -33], [14, -35], [4, -36], [-6, -36], [-15, -35], [-23, -33], [-32, -30], [-41, -22]];
const HL_MID: V[] = [[41, -24], [32, -32], [22, -36], [12, -38], [2, -38], [-8, -38], [-18, -37], [-28, -34], [-36, -29], [-41, -24]];
const HL_HIGH: V[] = [[41, -26], [30, -36], [16, -40], [6, -41], [-6, -41], [-16, -40], [-30, -36], [-41, -26]];

// ---------------------------------------------------------------------------
// Estilos

export function hairParts(style: number): HairParts {
  switch (style) {
    case 0: // Careca
      return { volume: 0, bald: true };

    case 1: // Raspado
      return { volume: 0, shaved: headShaved() };

    case 2: { // Militar
      const { path, tips } = naturalCap({ inflate: 2.5, lift: 4, lobes: 9, amp: 1.3, a0: 190, a1: 350, sideBottom: -16, sideWidth: 4, hairline: HL_MID, depths: 2.4, sweep: 0.5 });
      return { volume: 3, shaved: headShaved(), front: [path], shine: CAP_SHINE, texture: strandsFromTips(tips, 0.35) };
    }

    case 3: { // Clássico
      const { path, tips } = naturalCap({ inflate: 5, lift: 5, lobes: 7, amp: 2.2, hairline: HL_LOW, depths: [3, 5, 6, 7, 6, 5, 4, 3, 2], sweep: 0.72 });
      return {
        volume: 6,
        front: [path],
        shine: CAP_SHINE,
        texture: [...strandsFromTips(tips, 0.5), [[-17, -36], [-20, -48], [-24, -60]]],
      };
    }

    case 4: { // Franja
      const { path, tips } = naturalCap({ inflate: 5, lift: 4, lobes: 8, amp: 1.8, hairline: HL_MID, depths: [7, 11, 13, 14, 14, 13, 12, 10, 7], sweep: 0.45 });
      return { volume: 5, front: [path], shine: CAP_SHINE, texture: strandsFromTips(tips, 0.45, [0, -66]) };
    }

    case 5: { // Pixie
      const { path, tips } = naturalCap({ inflate: 7, lift: 6, lobes: 6, amp: 3, sideBottom: 8, sideWidth: 8, hairline: HL_MID, depths: [4, 8, 14, 18, 20, 18, 14, 10, 6], sweep: 0.85 });
      const tuft = smoothClosed([[38, -24], [47, -10], [45, 8], [41, -4], [35, -16]]);
      return { volume: 8, front: [path, tuft], shine: CAP_SHINE, texture: strandsFromTips(tips, 0.6, [24, -64]) };
    }

    case 6: { // Entradas
      const receding: V[] = [[40, -24], [38, -34], [30, -42], [20, -45], [12, -41], [6, -37], [0, -36], [-6, -37], [-12, -41], [-20, -45], [-30, -42], [-38, -34], [-40, -24]];
      const { path, tips } = naturalCap({ inflate: 3, lift: 3, lobes: 9, amp: 1.3, sideBottom: -2, sideWidth: 6, hairline: receding, depths: [0, 0, 2, 3, 3, 3, 3, 3, 3, 2, 0, 0], sweep: 0.5 });
      return { volume: 3, front: [path], shine: [{ cx: 0, cy: -34, rx: 22, ry: 18, a0: 215, a1: 255, width: 4 }], texture: strandsFromTips(tips, 0.3) };
    }

    case 7: { // Coroa
      const horseshoe = new Path2D();
      for (const side of [-1, 1]) {
        horseshoe.moveTo(side * 51, 2);
        horseshoe.lineTo(side * 52.5, -16);
        horseshoe.quadraticCurveTo(side * 53, -36, side * 45, -42);
        horseshoe.quadraticCurveTo(side * 41, -36, side * 43, -28);
        horseshoe.quadraticCurveTo(side * 40, -24, side * 42, -14);
        horseshoe.lineTo(side * 44, 2);
        horseshoe.closePath();
      }
      return { volume: 2, bald: true, front: [horseshoe] };
    }

    case 8: // Risca dupla
      return { volume: 0, shaved: headShaved() };

    case 9: { // Social
      const part: V[] = [[41, -22], [32, -30], [22, -34], [10, -36], [0, -36], [-10, -38], [-17, -40], [-26, -35], [-34, -30], [-41, -22]];
      const { path, tips } = naturalCap({ inflate: 7, lift: 8, lobes: 7, amp: 2.4, sideBottom: -2, hairline: part, depths: [3, 5, 6, 6, 4, 0, 3, 3, 2], sweep: 0.3 });
      const sweepPiece = smoothClosed([[-16, -40], [-8, -54], [12, -62], [34, -58], [50, -40], [36, -46], [16, -46], [0, -44]]);
      return {
        volume: 10,
        front: [path, sweepPiece],
        shine: [{ cx: 6, cy: -28, rx: 34, ry: 30, a0: 220, a1: 275, width: 5 }],
        texture: [...strandsFromTips(tips, 0.4, [20, -66]), [[-14, -42], [-20, -54], [-26, -64]], [[-4, -46], [16, -54], [40, -48]]],
      };
    }

    case 10: { // Topete
      const { path, tips } = naturalCap({ inflate: 4, lift: 2, lobes: 8, amp: 1.5, sideBottom: -4, sideWidth: 6, hairline: HL_LOW, depths: 2, sweep: 0.5 });
      const quiff = smoothClosed([[-38, -30], [-41, -56], [-22, -80], [8, -86], [34, -78], [46, -58], [42, -38], [30, -46], [10, -42], [-12, -38]]);
      return {
        volume: 22,
        front: [path, quiff],
        shine: [{ cx: 2, cy: -52, rx: 32, ry: 26, a0: 200, a1: 258, width: 6 }],
        texture: [...strandsFromTips(tips, 0.2), [[-26, -40], [-28, -64], [-4, -82]], [[-6, -38], [0, -66], [22, -80]], [[16, -42], [30, -62], [40, -68]]],
      };
    }

    case 11: { // Pra trás
      const { path } = naturalCap({ inflate: 6, lift: 7, amp: 0, sideBottom: -2, sideWidth: 6, hairline: HL_HIGH, depths: 0 });
      const combLines: Array<V[]> = [-30, -18, -6, 6, 18, 30].map((x) => [[x * 1.08, -38 - (30 - Math.abs(x)) * 0.12], [x * 1.12, -54], [x * 0.9, -66]]);
      return {
        volume: 7,
        front: [path],
        shine: [{ cx: 0, cy: -34, rx: 32, ry: 26, a0: 210, a1: 330, width: 3.5 }],
        texture: combLines,
      };
    }

    case 12: { // Undercut
      const anchors: V[] = [[52, -26], [44, -32], [34, -36], [22, -38], [10, -39], [-2, -39], [-14, -38], [-26, -36], [-36, -33]];
      const { path, tips } = naturalCap({ inflate: 9, lift: 10, lobes: 6, amp: 3, a0: 196, a1: 344, sideBottom: -28, sideWidth: -2, hairline: anchors, depths: [12, 9, 7, 6, 5, 4, 3, 2], sweep: 0.15 });
      return {
        volume: 12,
        shaved: headShaved(),
        front: [path],
        shine: [{ cx: 2, cy: -42, rx: 30, ry: 24, a0: 205, a1: 262, width: 5 }],
        texture: strandsFromTips(tips, 0.55, [-30, -70]),
      };
    }

    case 13: { // Espetado
      const spiky = new Path2D();
      const base = arcPoints(186, 354, 4, 3, 8);
      spiky.moveTo(-50, 0);
      spiky.lineTo(-52.5, -14);
      spiky.lineTo(base[0][0], base[0][1]);
      for (let index = 0; index < base.length - 1; index += 1) {
        const angle = 186 + ((354 - 186) * (index + 0.5)) / (base.length - 1);
        const reach = 14 + Math.sin(((index + 0.5) / (base.length - 1)) * Math.PI) * 12;
        const tip = sp(angle + 4, reach, 6);
        spiky.lineTo(tip[0], tip[1]);
        spiky.lineTo(base[index + 1][0], base[index + 1][1]);
      }
      spiky.lineTo(52.5, -14);
      spiky.lineTo(50, 0);
      spiky.lineTo(44, 0);
      spiky.lineTo(41, -22);
      for (const [x, y] of [[33, -24], [27, -16], [19, -27], [9, -15], [1, -27], [-9, -16], [-17, -27], [-27, -18], [-33, -26], [-41, -22]] as V[]) spiky.lineTo(x, y);
      spiky.lineTo(-44, 0);
      spiky.closePath();
      return { volume: 20, front: [spiky], shine: CAP_SHINE };
    }

    case 14: { // Tigelinha
      const bowl = new Path2D();
      bowl.moveTo(-53, -8);
      curveThrough(bowl, lobedArc(180, 360, 7, 4, 8, 1.4));
      bowl.lineTo(53, -8);
      bowl.quadraticCurveTo(52, -15, 45, -16);
      const tips: V[] = [];
      tufts(bowl, [[45, -16], [34, -17], [23, -17], [12, -17], [1, -17], [-10, -17], [-21, -17], [-32, -17], [-45, -16]], 3.2, 0.5, tips);
      bowl.quadraticCurveTo(-52, -15, -53, -8);
      bowl.closePath();
      return {
        volume: 7,
        front: [bowl],
        shine: [{ cx: 0, cy: -30, rx: 40, ry: 32, a0: 208, a1: 296, width: 5 }],
        texture: strandsFromTips(tips, 0.5, [0, -70]),
      };
    }

    case 15: { // Franja longa
      const { path } = naturalCap({ inflate: 6, lift: 6, lobes: 6, amp: 2.2, sideBottom: 4, hairline: [[41, -24], [30, -32], [14, -36], [-41, -24]], depths: 0 });
      const fringe = new Path2D();
      fringe.moveTo(46, -38);
      fringe.bezierCurveTo(36, -52, 4, -56, -26, -46);
      fringe.bezierCurveTo(-44, -38, -50, -20, -48, 6);
      const tips: V[] = [];
      tufts(fringe, [[-48, 6], [-42, 2], [-34, -10], [-24, -20], [-12, -28], [2, -33], [16, -36], [30, -38], [46, -38]], [12, 10, 9, 8, 7, 5, 4, 2], 0.25, tips);
      fringe.closePath();
      return {
        volume: 8,
        front: [path, fringe],
        shine: [{ cx: -6, cy: -32, rx: 34, ry: 26, a0: 212, a1: 280, width: 5 }],
        texture: [[[34, -44], [6, -42], [-22, -24], [-38, 0]], [[40, -40], [12, -48], [-14, -36]], ...strandsFromTips(tips, 0.3, [40, -52])],
      };
    }

    case 16: { // Surfista
      const back = smoothClosed([[-58, -10], [-62, 20], [-54, 40], [-44, 32], [-36, 44], [36, 44], [44, 32], [54, 40], [62, 20], [58, -10], [0, -60]]);
      const { path, tips } = naturalCap({ inflate: 8, lift: 6, lobes: 6, amp: 3, sideBottom: 18, sideWidth: 9, hairline: HL_LOW, depths: [6, 9, 8, 10, 7, 9, 8, 6, 5], sweep: 0.55 });
      const locks = [
        smoothClosed([[-52, -12], [-59, 14], [-53, 32], [-45, 22], [-43, 4]]),
        smoothClosed([[52, -12], [59, 14], [53, 32], [45, 22], [43, 4]]),
      ];
      return {
        volume: 10,
        back: [back],
        front: [path, ...locks],
        coversEars: true,
        shine: [{ cx: -2, cy: -28, rx: 38, ry: 32, a0: 212, a1: 268, width: 5 }],
        texture: [...strandsFromTips(tips, 0.4), [[-38, -20], [-47, 0], [-51, 20]], [[38, -20], [47, 0], [51, 20]]],
      };
    }

    case 17: { // Mullet
      const back = new Path2D();
      back.moveTo(-44, -14);
      back.bezierCurveTo(-50, 20, -50, 46, -44, 64);
      const ends: V[] = [];
      tufts(back, [[-44, 64], [-30, 60], [-14, 64], [0, 60], [14, 64], [30, 60], [44, 64]], [8, 6, 8, 6, 8, 6], 0.5, ends);
      back.bezierCurveTo(50, 46, 50, 20, 44, -14);
      back.closePath();
      const spiky: V[] = [[41, -24], [33, -32], [24, -35], [14, -37], [4, -37], [-6, -37], [-16, -36], [-25, -34], [-33, -30], [-41, -24]];
      const { path, tips } = naturalCap({ inflate: 6, lift: 6, lobes: 7, amp: 2.4, sideBottom: 6, hairline: spiky, depths: [5, 8, 6, 9, 6, 9, 6, 8, 5], sweep: 0.5 });
      return { volume: 8, back: [back], front: [path], shine: CAP_SHINE, texture: [...strandsFromTips(tips, 0.4), [[-44, 6], [-47, 40]], [[44, 6], [47, 40]]] };
    }

    case 18: { // Chanel
      const bob = smoothClosed([[-56, -10], [-58, 22], [-54, 44], [-40, 46], [-42, 20], [-40, -14], [-26, -26], [0, -30], [26, -26], [40, -14], [42, 20], [40, 46], [54, 44], [58, 22], [56, -10], [40, -56], [0, -70], [-40, -56]]);
      const bang = new Path2D();
      bang.moveTo(-46, -24);
      bang.bezierCurveTo(-44, -46, -20, -54, 0, -54);
      bang.bezierCurveTo(20, -54, 44, -46, 46, -24);
      const tips: V[] = [];
      tufts(bang, [[46, -24], [36, -24], [26, -24], [16, -24], [6, -24], [-4, -24], [-14, -24], [-24, -24], [-34, -24], [-46, -24]], [5, 6, 6, 7, 7, 6, 6, 5, 4], 0.5, tips);
      bang.closePath();
      return {
        volume: 10,
        back: [smoothClosed([[-50, -10], [-52, 40], [-30, 48], [30, 48], [52, 40], [50, -10]])],
        front: [bob, bang],
        coversEars: true,
        shine: [{ cx: -2, cy: -26, rx: 44, ry: 38, a0: 208, a1: 262, width: 6 }],
        texture: [[[-48, 0], [-50, 36]], [[48, 0], [50, 36]], ...strandsFromTips(tips, 0.35, [0, -68])],
      };
    }

    case 19: { // Moicano
      const crest = new Path2D();
      crest.moveTo(-9, -30);
      const spikes: V[] = [[-13, -48], [-17, -60], [-11, -62], [-14, -76], [-6, -76], [-6, -92], [2, -84], [8, -96], [10, -80], [16, -78], [12, -64], [17, -60], [12, -48], [9, -30]];
      for (const [x, y] of spikes) crest.lineTo(x, y);
      crest.quadraticCurveTo(0, -33, -9, -30);
      crest.closePath();
      return { volume: 0, shaved: headShaved(), front: [crest], shine: [{ cx: -2, cy: -60, rx: 7, ry: 28, a0: 200, a1: 250, width: 3 }] };
    }

    case 20: { // Crista
      const crest = smoothClosed([[-14, -32], [-22, -60], [-14, -96], [8, -108], [20, -98], [12, -88], [20, -76], [14, -66], [18, -46], [12, -30], [0, -34]]);
      return {
        volume: 0,
        shaved: headShaved(),
        front: [crest],
        shine: [{ cx: 0, cy: -70, rx: 12, ry: 30, a0: 200, a1: 260, width: 4 }],
        texture: [[[-6, -36], [-12, -70], [0, -100]], [[6, -36], [6, -70], [14, -96]]],
      };
    }

    case 21: { // Faux hawk
      const ridge = new Path2D();
      ridge.moveTo(-26, -32);
      const points: V[] = [[-31, -48], [-23, -58], [-22, -72], [-11, -66], [-6, -86], [4, -72], [11, -88], [15, -70], [25, -78], [25, -60], [33, -54], [28, -32]];
      for (const [x, y] of points) ridge.lineTo(x, y);
      ridge.quadraticCurveTo(0, -38, -26, -32);
      ridge.closePath();
      return { volume: 12, shaved: headShaved(), front: [ridge], shine: [{ cx: 0, cy: -50, rx: 18, ry: 22, a0: 205, a1: 260, width: 4 }], texture: [[[-12, -38], [-16, -56], [-8, -70]], [[10, -38], [12, -58], [16, -72]]] };
    }

    case 22: { // Cascão 2002
      const patch = new Path2D();
      patch.moveTo(-14, -37);
      patch.quadraticCurveTo(-17, -53, 0, -61);
      patch.quadraticCurveTo(17, -53, 14, -37);
      patch.quadraticCurveTo(0, -32, -14, -37);
      patch.closePath();
      return { volume: 0, bald: true, front: [patch] };
    }

    case 23: { // Flat top
      const box = new Path2D();
      box.moveTo(-42, -26);
      box.lineTo(-45, -50);
      box.quadraticCurveTo(-47, -78, -36, -80);
      box.lineTo(36, -80);
      box.quadraticCurveTo(47, -78, 45, -50);
      box.lineTo(42, -26);
      box.quadraticCurveTo(30, -35, 0, -36);
      box.quadraticCurveTo(-30, -35, -42, -26);
      box.closePath();
      return {
        volume: 20,
        shaved: headShaved(),
        front: [box],
        shine: [{ cx: -2, cy: -56, rx: 34, ry: 20, a0: 200, a1: 250, width: 5 }],
        texture: [[[-32, -78], [32, -78]], [[-40, -62], [40, -62]], [[-26, -40], [-30, -70]], [[26, -40], [30, -70]]],
      };
    }

    case 24: { // Cacheado
      const outer: V[] = [[-48, 2], ...arcPoints(168, 372, 7, 3, 15), [48, 2], [43, 2], [40, -24], [26, -30], [12, -28], [0, -32], [-12, -28], [-26, -30], [-40, -24], [-43, 2]];
      return { volume: 9, front: [scallopClosed(outer, 0.28)], curls: curlField(0, -40, 40, 30, 9, 4.2) };
    }

    case 25: { // Cachos volumosos
      const outer: V[] = [[-46, -8], ...arcPoints(178, 362, 12, 16, 13), [46, -8], [41, -24], [28, -30], [14, -26], [0, -32], [-14, -26], [-28, -30], [-41, -24]];
      return { volume: 24, front: [scallopClosed(outer, 0.32)], curls: curlField(0, -52, 42, 40, 10, 5.2) };
    }

    case 26: { // Mini afro
      const outer: V[] = [[-50, 0], ...arcPoints(170, 370, 10, 6, 20), [50, 0], [44, 0], [41, -24], [28, -31], [12, -33], [-12, -33], [-28, -31], [-41, -24], [-44, 0]];
      return { volume: 13, front: [scallopClosed(outer, 0.2)], curls: curlField(0, -40, 42, 36, 12, 3) };
    }

    case 27: { // Black power
      const back = scallopClosed([[-56, 30], ...arcPoints(150, 390, 26, 22, 22), [56, 30]], 0.24);
      const front: V[] = [[-48, 4], ...arcPoints(170, 370, 14, 10, 16), [48, 4], [43, 2], [41, -24], [28, -31], [12, -33], [-12, -33], [-28, -31], [-41, -24], [-43, 2]];
      return { volume: 30, back: [back], front: [scallopClosed(front, 0.2)], curls: curlField(0, -50, 52, 46, 14, 3.4) };
    }

    case 28: { // Twists
      const { path } = naturalCap({ inflate: 4, lift: 4, lobes: 8, amp: 1.5, sideBottom: -4, sideWidth: 6, hairline: HL_LOW, depths: 1.5, sweep: 0.5 });
      const strands: Strand[] = [];
      // fileiras de trás para a frente: as de cima ficam por baixo das da borda
      const rows: Array<[number, number, number, number, number]> = [
        [222, 318, 6, -16, 12],
        [200, 340, 10, -8, 12],
        [182, 358, 14, -2, 11],
      ];
      for (const [a0, a1, count, inflate, length] of rows) {
        for (let index = 0; index < count; index += 1) {
          const angle = a0 + ((a1 - a0) * index) / (count - 1);
          const root = sp(angle, inflate, 3);
          const tip = sp(angle + (index % 2 ? 3 : -3), inflate + length, 6);
          strands.push({ points: [root, [(root[0] + tip[0]) / 2 + (index % 2 ? 1 : -1), (root[1] + tip[1]) / 2], tip], width: 8, braid: true });
        }
      }
      return { volume: 14, front: [path], strands };
    }

    case 29: { // Tranças nagô
      const { path } = naturalCap({ inflate: 1.5, lift: 1, amp: 0, sideBottom: -6, sideWidth: 5, hairline: HL_LOW, depths: 0 });
      const strands: Strand[] = [-36, -24, -12, 0, 12, 24, 36].map((x) => ({
        points: [[x * 1.06, -30 + Math.abs(x) * 0.16], [x * 0.92, -48], [x * 0.55, -62], [x * 0.25, -66]],
        width: 8.2,
        braid: true,
      }));
      return { volume: 3, front: [path], strands, shine: CAP_SHINE };
    }

    case 30: { // Dreads
      const { path } = naturalCap({ inflate: 4, lift: 3, lobes: 8, amp: 1.5, sideBottom: -4, sideWidth: 6, hairline: HL_LOW, depths: 0 });
      const front = strandsAround(196, 344, 9, 3, 30, 7.4, false, 1.4, 1.5);
      const sides = [...strandsAround(176, 192, 2, 4, 44, 7.4, false, 1.2), ...strandsAround(348, 364, 2, 4, 44, 7.4, false, 1.2)];
      return { volume: 8, front: [path], strands: [...sides, ...front], coversEars: true };
    }

    case 31: { // Dreads longos
      const { path } = naturalCap({ inflate: 4, lift: 3, lobes: 8, amp: 1.5, sideBottom: -4, sideWidth: 6, hairline: HL_LOW, depths: 0 });
      const backStrands = [...strandsAround(160, 200, 4, 4, 110, 8, false, 1.4), ...strandsAround(340, 380, 4, 4, 110, 8, false, 1.4)];
      const sides = [...strandsAround(172, 196, 3, 5, 92, 7.4, false, 1.3), ...strandsAround(344, 368, 3, 5, 92, 7.4, false, 1.3)];
      const top = strandsAround(214, 326, 6, 2, 18, 7, false, 0.8);
      return { volume: 8, front: [path], backStrands, strands: [...sides, ...top], coversEars: true };
    }

    case 32: { // Tranças box
      const part: V[] = [[41, -22], [30, -30], [14, -33], [-2, -32], [-12, -36], [-22, -30], [-34, -27], [-41, -22]];
      const { path } = naturalCap({ inflate: 3, lift: 2, amp: 0, sideBottom: -4, sideWidth: 6, hairline: part, depths: 0 });
      const backStrands = [...strandsAround(156, 200, 5, 3, 118, 5.2, true, 1.2), ...strandsAround(340, 384, 5, 3, 118, 5.2, true, 1.2)];
      const sides = [...strandsAround(170, 194, 3, 4, 100, 5, true, 1.1), ...strandsAround(346, 370, 3, 4, 100, 5, true, 1.1)];
      return { volume: 4, front: [path], backStrands, strands: sides, coversEars: true, texture: [[[-12, -36], [-14, -56]], [[12, -36], [14, -56]], [[-30, -30], [-34, -50]], [[30, -30], [34, -50]]] };
    }

    case 33: { // Longo liso
      const back = smoothClosed([[-58, -20], [-64, 40], [-62, 110], [-40, 118], [0, 112], [40, 118], [62, 110], [64, 40], [58, -20], [0, -66]], 0.9);
      const { path, tips } = naturalCap({ inflate: 6, lift: 5, lobes: 6, amp: 1.2, sideBottom: 10, sideWidth: 6, hairline: [[42, -20], [30, -30], [12, -34], [2, -38], [-8, -34], [-26, -30], [-42, -20]], depths: [2, 3, 4, 0, 4, 3, 2], sweep: 0.5 });
      const left = smoothClosed([[-54, -14], [-58, 40], [-54, 100], [-44, 96], [-44, 40], [-42, -6], [-34, -26]]);
      const right = smoothClosed([[54, -14], [58, 40], [54, 100], [44, 96], [44, 40], [42, -6], [34, -26]]);
      return {
        volume: 7,
        back: [back],
        front: [path, left, right],
        coversEars: true,
        shine: [{ cx: -2, cy: -26, rx: 40, ry: 34, a0: 212, a1: 260, width: 6 }],
        texture: [[[-50, 10], [-50, 80]], [[50, 10], [50, 80]], ...strandsFromTips(tips, 0.4, [0, -70])],
      };
    }

    case 34: { // Longo ondulado
      const back = smoothClosed([[-60, -20], [-70, 20], [-62, 50], [-72, 84], [-58, 112], [-30, 116], [0, 108], [30, 116], [58, 112], [72, 84], [62, 50], [70, 20], [60, -20], [0, -68]], 1);
      const { path, tips } = naturalCap({ inflate: 8, lift: 7, lobes: 6, amp: 2.5, sideBottom: 10, sideWidth: 6, hairline: [[42, -18], [32, -28], [16, -32], [-4, -38], [-20, -32], [-32, -26], [-42, -18]], depths: [3, 5, 6, 6, 5, 3], sweep: 0.6 });
      const left = smoothClosed([[-54, -14], [-64, 20], [-54, 50], [-62, 86], [-48, 96], [-46, 60], [-50, 30], [-42, -4]]);
      const right = smoothClosed([[54, -14], [64, 20], [54, 50], [62, 86], [48, 96], [46, 60], [50, 30], [42, -4]]);
      return {
        volume: 9,
        back: [back],
        front: [path, left, right],
        coversEars: true,
        shine: [{ cx: -4, cy: -28, rx: 40, ry: 34, a0: 212, a1: 262, width: 6 }],
        texture: [[[-56, 0], [-50, 30], [-58, 60], [-52, 86]], [[56, 0], [50, 30], [58, 60], [52, 86]], ...strandsFromTips(tips, 0.4)],
      };
    }

    case 35: { // Juba
      const back = scallopClosed([[-60, 70], [-72, 40], ...arcPoints(130, 410, 26, 16, 24), [72, 40], [60, 70], [30, 82], [0, 74], [-30, 82]], 0.26);
      const front: V[] = [[-50, 10], ...arcPoints(172, 368, 12, 10, 14), [50, 10], [43, 6], [41, -24], [28, -31], [12, -33], [-12, -33], [-28, -31], [-41, -24], [-43, 6]];
      return { volume: 24, back: [back], front: [scallopClosed(front, 0.24)], curls: [...curlField(0, -46, 46, 38, 10, 4.5), [-58, 30, 5], [58, 30, 5], [-50, 56, 5], [50, 56, 5]], coversEars: true };
    }

    case 36: { // Coque
      const { path } = naturalCap({ inflate: 4, lift: 3, lobes: 8, amp: 1.4, sideBottom: -2, sideWidth: 6, hairline: HL_HIGH, depths: 0 });
      const bun = new Path2D();
      bun.ellipse(0, -72, 15, 12, 0, 0, TAU);
      return { volume: 4, front: [bun, path], shine: CAP_SHINE, texture: [[[-26, -40], [-12, -60]], [[26, -40], [12, -60]], [[0, -40], [0, -58]], [[-14, -40], [-6, -60]], [[14, -40], [6, -60]]] };
    }

    case 37: { // Coque alto
      const part: V[] = [[41, -22], [30, -30], [14, -33], [-2, -32], [-12, -36], [-22, -30], [-34, -27], [-41, -22]];
      const { path } = naturalCap({ inflate: 4, lift: 4, lobes: 8, amp: 1.2, sideBottom: -2, sideWidth: 6, hairline: part, depths: 0 });
      const bun = new Path2D();
      bun.arc(0, -84, 17, 0, TAU);
      return { volume: 4, front: [bun, path], shine: [...CAP_SHINE, { cx: -4, cy: -86, rx: 11, ry: 11, a0: 200, a1: 260, width: 3.5 }], texture: [[[-28, -36], [-12, -62]], [[28, -36], [12, -62]], [[0, -36], [0, -64]]] };
    }

    case 38: { // Coque baixo
      const part: V[] = [[41, -22], [30, -30], [14, -33], [-2, -32], [-12, -36], [-22, -30], [-34, -27], [-41, -22]];
      const { path } = naturalCap({ inflate: 5, lift: 3, lobes: 8, amp: 1.2, sideBottom: 4, sideWidth: 7, hairline: part, depths: 0 });
      const bun = new Path2D();
      bun.ellipse(-48, 24, 13, 12, 0, 0, TAU);
      return { volume: 5, back: [bun], front: [path], shine: CAP_SHINE, texture: [[[-36, -24], [-44, -4], [-46, 12]], [[-12, -36], [-24, -58]], [[12, -32], [20, -58]]] };
    }

    case 39: { // Rabo de cavalo
      const part: V[] = [[41, -22], [30, -30], [14, -33], [-2, -32], [-12, -36], [-22, -30], [-34, -27], [-41, -22]];
      const { path } = naturalCap({ inflate: 5, lift: 3, lobes: 8, amp: 1.2, sideBottom: 2, sideWidth: 6, hairline: part, depths: 0 });
      const tail = smoothClosed([[40, -36], [62, -26], [70, 6], [66, 46], [58, 70], [54, 46], [56, 10], [48, -16]]);
      return { volume: 5, back: [tail], front: [path], shine: CAP_SHINE, texture: [[[56, -20], [64, 10], [60, 50]], [[-12, -36], [-24, -58]], [[12, -32], [24, -56]]] };
    }

    case 40: { // Rabo alto
      const { path } = naturalCap({ inflate: 5, lift: 4, lobes: 8, amp: 1.2, sideBottom: -2, sideWidth: 6, hairline: HL_HIGH, depths: 0 });
      const tail = smoothClosed([[-6, -64], [16, -86], [44, -84], [62, -60], [66, -20], [58, 14], [52, -16], [46, -50], [26, -66], [8, -60]]);
      const tie = new Path2D();
      tie.ellipse(4, -66, 8, 6, -0.4, 0, TAU);
      return { volume: 6, back: [tail], front: [path, tie], shine: CAP_SHINE, texture: [[[20, -78], [48, -70], [58, -30]], [[-24, -40], [-8, -60]], [[10, -40], [4, -60]]] };
    }

    case 41: { // Duas tranças
      const hairline: V[] = [[41, -22], [30, -31], [10, -34], [0, -38], [-10, -34], [-30, -31], [-41, -22]];
      const { path } = naturalCap({ inflate: 4, lift: 3, lobes: 8, amp: 1.2, sideBottom: 6, sideWidth: 6, hairline, depths: 0 });
      const braids: Strand[] = [-1, 1].map((side) => ({
        points: [[side * 48, 0], [side * 54, 30], [side * 50, 60], [side * 46, 86]],
        width: 11,
        braid: true,
      }));
      return { volume: 4, front: [path], strands: braids, shine: CAP_SHINE, texture: [[[0, -38], [0, -60]], [[-20, -34], [-30, -54]], [[20, -34], [30, -54]]], coversEars: true };
    }
  }
  return { volume: 0, bald: true };
}

// ---------------------------------------------------------------------------
// Pintura

export type HairColors = { base: string; tip?: string };

function hairFill(ctx: CanvasRenderingContext2D, colors: HairColors) {
  if (!colors.tip) return colors.base;
  const gradient = ctx.createRadialGradient(0, -6, 30, 0, -6, 104);
  gradient.addColorStop(0, colors.base);
  gradient.addColorStop(0.42, colors.base);
  gradient.addColorStop(0.78, colors.tip);
  gradient.addColorStop(1, colors.tip);
  return gradient;
}

function pointOnPolyline(points: V[], t: number): V {
  const lengths: number[] = [];
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = Math.hypot(points[index + 1][0] - points[index][0], points[index + 1][1] - points[index][1]);
    lengths.push(length);
    total += length;
  }
  let target = total * t;
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index]) {
      const k = lengths[index] ? target / lengths[index] : 0;
      return [points[index][0] + (points[index + 1][0] - points[index][0]) * k, points[index][1] + (points[index + 1][1] - points[index][1]) * k];
    }
    target -= lengths[index];
  }
  return points[points.length - 1];
}

function strokeStrand(ctx: CanvasRenderingContext2D, strand: Strand, fill: string | CanvasGradient, palette: HairPalette, detail: number) {
  const path = new Path2D();
  path.moveTo(strand.points[0][0], strand.points[0][1]);
  curveThrough(path, strand.points);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = strand.width + LINE * 1.3;
  ctx.stroke(path);
  ctx.strokeStyle = fill;
  ctx.lineWidth = strand.width;
  ctx.stroke(path);
  if (detail < 0.5) return;
  ctx.strokeStyle = alpha(palette.light, 0.35);
  ctx.lineWidth = strand.width * 0.28;
  ctx.save();
  ctx.translate(-strand.width * 0.18, 0);
  ctx.stroke(path);
  ctx.restore();
  if (strand.braid) {
    ctx.strokeStyle = alpha(palette.dark, 0.75);
    ctx.lineWidth = 1.1;
    const first = strand.points[0];
    const last = strand.points[strand.points.length - 1];
    const steps = Math.max(2, Math.floor(Math.hypot(last[0] - first[0], last[1] - first[1]) / (strand.width * 0.85)));
    for (let index = 1; index < steps; index += 1) {
      const point = pointOnPolyline(strand.points, index / steps);
      ctx.beginPath();
      ctx.moveTo(point[0] - strand.width * 0.45, point[1] - strand.width * 0.22);
      ctx.lineTo(point[0] + strand.width * 0.45, point[1] + strand.width * 0.22);
      ctx.stroke();
    }
  }
}

type HairPalette = { outline: string; dark: string; light: string };

function hairPalette(colors: HairColors): HairPalette {
  return {
    outline: ink(colors.base, 0.55),
    dark: darken(colors.base, 0.5),
    light: lighten(colors.tip ?? colors.base, 0.55),
  };
}

function paintHairPath(ctx: CanvasRenderingContext2D, path: Path2D, fill: string | CanvasGradient, palette: HairPalette, shadeTop: number, shadeBottom: number) {
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  const shade = ctx.createLinearGradient(0, shadeTop, 0, shadeBottom);
  shade.addColorStop(0, alpha(palette.dark, 0));
  shade.addColorStop(1, alpha(palette.dark, 0.4));
  ctx.fillStyle = shade;
  ctx.fillRect(-130, shadeTop - 60, 260, shadeBottom - shadeTop + 200);
  ctx.restore();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = LINE;
  ctx.lineJoin = "round";
  ctx.stroke(path);
}

export function drawHairBack(ctx: CanvasRenderingContext2D, parts: HairParts, colors: HairColors, detail: number) {
  const palette = hairPalette(colors);
  const fill = hairFill(ctx, colors);
  for (const strand of parts.backStrands ?? []) strokeStrand(ctx, strand, fill, palette, detail);
  for (const path of parts.back ?? []) paintHairPath(ctx, path, fill, palette, -20, 120);
}

/** Sombra que o cabelo projeta na testa (desenhada antes da franja, presa à cabeça). */
export function drawHairShadow(ctx: CanvasRenderingContext2D, parts: HairParts, head: Path2D, skinShade: string) {
  if (!parts.front?.length) return;
  ctx.save();
  ctx.clip(head);
  ctx.translate(1.5, 4.5);
  ctx.fillStyle = alpha(skinShade, 0.55);
  for (const path of parts.front) ctx.fill(path);
  ctx.restore();
}

export function drawShavedScalp(ctx: CanvasRenderingContext2D, parts: HairParts, style: number, head: Path2D, colors: HairColors, detail: number) {
  if (!parts.shaved) return;
  ctx.save();
  ctx.clip(head);
  ctx.fillStyle = alpha(colors.base, 0.62);
  ctx.fill(parts.shaved);
  if (detail > 0.45) {
    ctx.clip(parts.shaved);
    ctx.fillStyle = alpha(darken(colors.base, 0.3), 0.35);
    for (let y = -62; y < 4; y += 3.2) {
      for (let x = -52 + ((y / 3.2) % 2) * 1.6; x < 52; x += 3.4) ctx.fillRect(x, y, 1, 1);
    }
    if (style === 8) {
      ctx.strokeStyle = alpha("#f4ece6", 0.85);
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-46, -30);
      ctx.quadraticCurveTo(-34, -44, -18, -50);
      ctx.moveTo(-47, -22);
      ctx.quadraticCurveTo(-36, -36, -20, -42);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawHairFront(ctx: CanvasRenderingContext2D, parts: HairParts, colors: HairColors, detail: number) {
  const palette = hairPalette(colors);
  const fill = hairFill(ctx, colors);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const path of parts.front ?? []) paintHairPath(ctx, path, fill, palette, -70, 10);

  if (parts.front?.length && (parts.texture?.length || parts.shine?.length) && detail > 0.35) {
    const union = new Path2D();
    for (const path of parts.front) union.addPath(path);
    ctx.save();
    ctx.clip(union);
    if (detail > 0.5) {
      ctx.strokeStyle = alpha(palette.dark, 0.55);
      ctx.lineWidth = 1.5;
      for (const line of parts.texture ?? []) {
        const path = new Path2D();
        path.moveTo(line[0][0], line[0][1]);
        curveThrough(path, line);
        ctx.stroke(path);
      }
    }
    for (const shine of parts.shine ?? []) {
      ctx.strokeStyle = alpha(palette.light, 0.5);
      ctx.lineWidth = shine.width ?? 5;
      ctx.setLineDash([14, 5, 6, 5]);
      ctx.beginPath();
      ctx.ellipse(shine.cx, shine.cy, shine.rx, shine.ry, 0, rad(shine.a0), rad(shine.a1));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  if (detail >= 0.4) {
    for (const [x, y, r] of parts.curls ?? []) {
      // um "c" escuro embaixo e um brilho em cima: volume sem parecer furo
      ctx.strokeStyle = alpha(palette.dark, 0.34);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, rad(20), rad(200));
      ctx.stroke();
      ctx.strokeStyle = alpha(palette.light, 0.38);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.75, rad(205), rad(300));
      ctx.stroke();
    }
  }

  for (const strand of parts.strands ?? []) strokeStrand(ctx, strand, fill, palette, detail);
  ctx.restore();
}

/** Brilho no couro cabeludo de carecas. */
export function drawScalpShine(ctx: CanvasRenderingContext2D, skinLight: string) {
  ctx.save();
  ctx.strokeStyle = alpha(skinLight, 0.75);
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(-6, -34, 26, 20, 0, rad(205), rad(250));
  ctx.stroke();
  ctx.fillStyle = alpha(skinLight, 0.8);
  ctx.beginPath();
  ctx.arc(10, -52, 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

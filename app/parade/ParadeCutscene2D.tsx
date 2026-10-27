"use client";

// Versão 2D da festa do título, para quem joga sem o Modo 3D (e o plano B se o
// WebGL cair). Um canvas só, de lado, como uma transmissão de carnaval: o céu
// da hora do dia, o horizonte da cidade em camadas com parallax (os marcos da
// cidade em silhueta), a multidão pulando nas duas calçadas, o trio elétrico
// com o paredão de som e a seleção no deck, papel picado, fumaça e fogos.
//
// Tudo é função do tempo do roteiro: câmera, posição do trio, pulos, partículas
// e fogos saem de fórmulas fechadas sobre `time`, então "Pular" e "Rever" deixam
// a cena exatamente no ponto certo sem simular nada. O que não mexe (céu, prédios,
// carroceria do trio, bonecos da multidão, rostos) é desenhado uma vez em
// canvases fora da tela; cada quadro só cola pedaços deles.

import { useEffect, useRef } from "react";
import { drawPlayerBust, SKIN_COLORS, HAIR_COLORS, type PlayerAppearance } from "../player-appearance";
import type { LandmarkId, ParadeBeatId, ParadeTimeline } from "./parade-script";
import { paradeBeatPulse } from "./parade-audio";

// ---------------------------------------------------------------- mundo

/** Altura de referência do mundo (unidades); a câmera escala a partir dela. */
const WORLD_H = 720;
/** Pé dos prédios (todas as camadas de fundo se apoiam aqui). */
const HORIZON = 478;
const BACK_FAR_FEET = 482;
const BACK_FEET = 498;
const TRUCK_GROUND = 655;
const FRONT_FEET = 812;
const TRUCK_SPEED = 40;
const DECK = 288; // altura do piso do deck acima do chão (unidades)
const PERSON_W = 30;
const PERSON_H = 58;
const POSES = 3;
const PERSON_VARIANTS = 18;

type Cam = { x: number; y: number; s: number };
type Shot = { start: number; blend: number; at: (time: number) => Cam };
type Rgb = [number, number, number];
type Strip = { canvas: HTMLCanvasElement; x0: number; top: number; res: number; p: number; width: number; height: number };
type Firework = { at: number; x: number; y: number; color: string; color2: string; size: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
const lerp = (from: number, to: number, k: number) => from + (to - from) * k;

/** Hash inteiro → [0, 1): o "aleatório" da cena é sempre o mesmo para o mesmo índice. */
function hash(a: number, b = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function rgbOf(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
  const value = Number.parseInt(full.slice(0, 6), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(rgb: Rgb) {
  return `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: string, b: string, k: number) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return toHex([lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)]);
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function ctx2d(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponível");
  return context;
}

// ------------------------------------------------------- hora do dia

type Palette = {
  sky: [string, string, string];
  haze: string;
  far: string;
  /** Quanto da cor da fachada sobra (1 de dia, pouco à noite). */
  light: number;
  tint: string;
  windowsLit: number;
  street: string;
  crowdShade: number;
  sun: { x: number; y: number; r: number; color: string; glow: string } | null;
  moon: boolean;
};

const PALETTES: Record<ParadeTimeline["input"]["timeOfDay"], Palette> = {
  day: {
    sky: ["#2a78d6", "#6fb1ee", "#d4ecff"],
    haze: "#a9cbe6",
    far: "#86a9c8",
    light: 1,
    tint: "#ffffff",
    windowsLit: 0,
    street: "#4b4d52",
    crowdShade: 0,
    sun: { x: 0.82, y: 0.14, r: 46, color: "#fffbe8", glow: "rgba(255, 246, 200, 0.55)" },
    moon: false,
  },
  sunset: {
    sky: ["#2a2766", "#c2507a", "#ffb45e"],
    haze: "#d9887e",
    far: "#8a4f6e",
    light: 0.72,
    tint: "#ff9a6a",
    windowsLit: 0.35,
    street: "#3b3440",
    crowdShade: 0.22,
    sun: { x: 0.24, y: 0.5, r: 70, color: "#ffe2a0", glow: "rgba(255, 150, 80, 0.6)" },
    moon: false,
  },
  night: {
    sky: ["#03061a", "#0e1844", "#2c2c66"],
    haze: "#272d63",
    far: "#161c45",
    light: 0.3,
    tint: "#3b4aa0",
    windowsLit: 0.6,
    street: "#1d1f2b",
    crowdShade: 0.45,
    sun: null,
    moon: true,
  },
};

function facadeColor(hex: string, palette: Palette, shade = 0) {
  return mix(mix(hex, palette.tint, (1 - palette.light) * 0.55), "#000000", Math.min(0.92, (1 - palette.light) * 0.8 + shade));
}

// --------------------------------------------------------- bandeira

function drawFlag(ctx: CanvasRenderingContext2D, countryId: string, primary: string, secondary: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = primary;
  ctx.fillRect(x, y, w, h);
  if (countryId === "brasil") {
    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h / 2);
    ctx.lineTo(x + w / 2, y + h * 0.1);
    ctx.lineTo(x + w * 0.92, y + h / 2);
    ctx.lineTo(x + w / 2, y + h * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1f3c8f";
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, h * 0.24, 0, Math.PI * 2);
    ctx.fill();
  } else if (isLight(secondary)) {
    // Segunda cor clara (Argentina, Inglaterra…): faixa horizontal no meio.
    ctx.fillStyle = secondary;
    ctx.fillRect(x, y + h / 3, w, h / 3);
  } else {
    // Tricolor vertical genérica: principal, branco e a segunda cor.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + w / 3, y, w / 3, h);
    ctx.fillStyle = secondary;
    ctx.fillRect(x + (w * 2) / 3, y, w / 3 + 1, h);
  }
}

function isLight(hex: string) {
  const [r, g, b] = rgbOf(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 200;
}

// ---------------------------------------------------------- marcos

type LandmarkPainter = (ctx: CanvasRenderingContext2D, x: number, base: number, color: string, accent: string, lit: string | null) => void;

const FAR_LANDMARKS = new Set<LandmarkId>(["christ", "sugarloaf", "mountain", "pyramid", "eiffel", "bridge"]);

const LANDMARKS: Partial<Record<LandmarkId, LandmarkPainter>> = {
  christ(ctx, x, base, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 260, base);
    ctx.bezierCurveTo(x - 150, base - 120, x - 40, base - 290, x, base - 300);
    ctx.bezierCurveTo(x + 50, base - 290, x + 170, base - 110, x + 300, base);
    ctx.closePath();
    ctx.fill();
    // O Cristo de braços abertos no alto do morro.
    ctx.fillRect(x - 3, base - 342, 6, 44);
    ctx.fillRect(x - 21, base - 334, 42, 5);
    ctx.beginPath();
    ctx.arc(x, base - 346, 4, 0, Math.PI * 2);
    ctx.fill();
  },
  sugarloaf(ctx, x, base, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 220, base);
    ctx.bezierCurveTo(x - 200, base - 130, x - 150, base - 150, x - 120, base - 120);
    ctx.bezierCurveTo(x - 100, base - 90, x - 60, base - 80, x - 20, base - 70);
    ctx.bezierCurveTo(x + 10, base - 230, x + 90, base - 250, x + 110, base - 160);
    ctx.bezierCurveTo(x + 125, base - 90, x + 150, base - 30, x + 190, base);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 130, base - 128);
    ctx.quadraticCurveTo(x - 40, base - 150, x + 60, base - 236);
    ctx.stroke();
  },
  mountain(ctx, x, base, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 360, base);
    ctx.lineTo(x - 40, base - 290);
    ctx.lineTo(x + 30, base - 290);
    ctx.lineTo(x + 380, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.moveTo(x - 40, base - 290);
    ctx.lineTo(x + 30, base - 290);
    ctx.lineTo(x + 92, base - 232);
    ctx.lineTo(x + 50, base - 246);
    ctx.lineTo(x + 10, base - 226);
    ctx.lineTo(x - 30, base - 248);
    ctx.lineTo(x - 98, base - 236);
    ctx.closePath();
    ctx.fill();
  },
  pyramid(ctx, x, base, color) {
    for (const [dx, size] of [[-120, 150], [60, 210], [220, 110]] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + dx - size, base);
      ctx.lineTo(x + dx, base - size * 0.9);
      ctx.lineTo(x + dx + size, base);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.beginPath();
      ctx.moveTo(x + dx, base - size * 0.9);
      ctx.lineTo(x + dx + size, base);
      ctx.lineTo(x + dx + size * 0.25, base);
      ctx.closePath();
      ctx.fill();
    }
  },
  eiffel(ctx, x, base, color, _accent, lit) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 70, base);
    ctx.quadraticCurveTo(x - 22, base - 120, x - 6, base - 330);
    ctx.lineTo(x + 6, base - 330);
    ctx.quadraticCurveTo(x + 22, base - 120, x + 70, base);
    ctx.lineTo(x + 46, base);
    ctx.quadraticCurveTo(x, base - 70, x - 46, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 40, base - 112, 80, 6);
    ctx.fillRect(x - 24, base - 210, 48, 5);
    ctx.fillRect(x - 1.5, base - 360, 3, 32);
    if (lit) {
      ctx.fillStyle = lit;
      for (let i = 0; i < 18; i += 1) ctx.fillRect(x - 40 + hash(i, 7) * 80 * (1 - i / 22), base - i * 18 - 6, 2, 2);
    }
  },
  bridge(ctx, x, base, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.fillRect(x - 330, base - 46, 660, 7);
    for (const tower of [-140, 140]) {
      ctx.fillRect(x + tower - 5, base - 190, 10, 190);
      ctx.lineWidth = 1;
      for (let i = 1; i <= 7; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + tower, base - 180 + i * 4);
        ctx.lineTo(x + tower - i * 24, base - 44);
        ctx.moveTo(x + tower, base - 180 + i * 4);
        ctx.lineTo(x + tower + i * 24, base - 44);
        ctx.stroke();
      }
    }
  },
  masp(ctx, x, base, color, accent) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 80, base - 60, 10, 60);
    ctx.fillRect(x + 70, base - 60, 10, 60);
    ctx.fillStyle = "#c8262c";
    ctx.fillRect(x - 86, base - 100, 172, 40);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let i = 0; i < 8; i += 1) ctx.fillRect(x - 80 + i * 21, base - 92, 14, 24);
    ctx.fillStyle = accent;
    ctx.fillRect(x - 86, base - 104, 172, 4);
  },
  elevador(ctx, x, base, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 22, base - 220, 44, 220);
    ctx.fillRect(x - 28, base - 236, 56, 18);
    ctx.fillRect(x + 22, base - 210, 120, 10);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let i = 0; i < 9; i += 1) ctx.fillRect(x - 14, base - 206 + i * 22, 28, 8);
  },
  church(ctx, x, base, color, accent) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 60, base - 110, 120, 110);
    ctx.beginPath();
    ctx.moveTo(x - 60, base - 110);
    ctx.lineTo(x, base - 150);
    ctx.lineTo(x + 60, base - 110);
    ctx.fill();
    for (const side of [-1, 1]) {
      const tx = x + side * 74;
      ctx.fillRect(tx - 18, base - 190, 36, 190);
      ctx.beginPath();
      ctx.moveTo(tx - 20, base - 190);
      ctx.lineTo(tx, base - 236);
      ctx.lineTo(tx + 20, base - 190);
      ctx.fill();
      ctx.fillRect(tx - 1.5, base - 252, 3, 18);
      ctx.fillRect(tx - 6, base - 246, 12, 3);
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, base - 34, 16, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 16, base - 34, 32, 34);
    ctx.beginPath();
    ctx.arc(x, base - 82, 9, 0, Math.PI * 2);
    ctx.fill();
  },
  congress(ctx, x, base, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 220, base - 26, 440, 26);
    ctx.fillRect(x - 22, base - 250, 18, 224);
    ctx.fillRect(x + 4, base - 250, 18, 224);
    ctx.fillRect(x - 22, base - 170, 44, 8);
    ctx.beginPath();
    ctx.arc(x - 140, base - 26, 46, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 90, base - 26);
    ctx.quadraticCurveTo(x + 140, base - 40, x + 100, base - 70);
    ctx.lineTo(x + 200, base - 70);
    ctx.quadraticCurveTo(x + 160, base - 40, x + 210, base - 26);
    ctx.fill();
  },
  cathedral(ctx, x, base, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    for (let i = -5; i <= 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + i * 14, base);
      ctx.quadraticCurveTo(x + i * 3, base - 80, x + i * 9, base - 150);
      ctx.stroke();
    }
  },
  obelisk(ctx, x, base, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 16, base);
    ctx.lineTo(x - 10, base - 250);
    ctx.lineTo(x, base - 270);
    ctx.lineTo(x + 10, base - 250);
    ctx.lineTo(x + 16, base);
    ctx.closePath();
    ctx.fill();
  },
  arch(ctx, x, base, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 80, base);
    ctx.lineTo(x - 80, base - 170);
    ctx.lineTo(x + 80, base - 170);
    ctx.lineTo(x + 80, base);
    ctx.lineTo(x + 32, base);
    ctx.lineTo(x + 32, base - 80);
    ctx.arc(x, base - 80, 32, 0, Math.PI, true);
    ctx.lineTo(x - 32, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 88, base - 186, 176, 16);
  },
  gate(ctx, x, base, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 110, base - 130, 220, 22);
    for (let i = 0; i < 6; i += 1) ctx.fillRect(x - 104 + i * 40, base - 108, 12, 108);
    ctx.fillRect(x - 40, base - 150, 80, 20);
    // Quadriga: um borrão de cavalos e a deusa no alto.
    ctx.beginPath();
    ctx.ellipse(x, base - 160, 30, 10, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 3, base - 186, 6, 22);
  },
  colosseum(ctx, x, base, color, accent) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 200, base);
    ctx.lineTo(x - 200, base - 120);
    ctx.quadraticCurveTo(x, base - 150, x + 160, base - 150);
    ctx.lineTo(x + 200, base - 90);
    ctx.lineTo(x + 200, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = accent;
    for (let row = 0; row < 3; row += 1) {
      for (let i = 0; i < 12; i += 1) {
        const ax = x - 186 + i * 32;
        const ay = base - 20 - row * 38;
        ctx.beginPath();
        ctx.arc(ax + 9, ay - 14, 9, Math.PI, 0);
        ctx.fillRect(ax, ay - 14, 18, 14);
        ctx.fill();
      }
    }
  },
  "clock-tower"(ctx, x, base, color, accent, lit) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 26, base - 250, 52, 250);
    ctx.beginPath();
    ctx.moveTo(x - 30, base - 250);
    ctx.lineTo(x, base - 320);
    ctx.lineTo(x + 30, base - 250);
    ctx.fill();
    ctx.fillStyle = lit ?? accent;
    ctx.beginPath();
    ctx.arc(x, base - 214, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, base - 214);
    ctx.lineTo(x, base - 226);
    ctx.moveTo(x, base - 214);
    ctx.lineTo(x + 8, base - 210);
    ctx.stroke();
  },
  windmill(ctx, x, base, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 34, base);
    ctx.lineTo(x - 22, base - 120);
    ctx.lineTo(x, base - 140);
    ctx.lineTo(x + 22, base - 120);
    ctx.lineTo(x + 34, base);
    ctx.closePath();
    ctx.fill();
  },
};

// ------------------------------------------------------------ prédios

type CityPaint = {
  ctx: CanvasRenderingContext2D;
  palette: Palette;
  facade: string[];
  seed: number;
  antennas: boolean;
  colors: [string, string];
};

function drawWindows(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, h: number, cell: [number, number], size: [number, number], seed: number, palette: Palette, dark: string) {
  const cols = Math.max(1, Math.floor((w - 8) / cell[0]));
  const rows = Math.max(1, Math.floor((h - 14) / cell[1]));
  const offsetX = x + (w - cols * cell[0]) / 2 + (cell[0] - size[0]) / 2;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = palette.windowsLit > 0 && hash(seed + row * 31, col) < palette.windowsLit;
      ctx.fillStyle = lit ? (hash(seed, row * 7 + col) < 0.7 ? "#ffd88a" : "#bfe3ff") : dark;
      ctx.fillRect(offsetX + col * cell[0], top + 10 + row * cell[1], size[0], size[1]);
    }
  }
}

function drawBuilding(paint: CityPaint, style: string, x: number, w: number, h: number, index: number) {
  const { ctx, palette, facade, seed } = paint;
  const top = HORIZON - h;
  const base = facade[Math.floor(hash(seed + index, 3) * facade.length) % facade.length];
  const wall = facadeColor(base, palette, hash(index, 9) * 0.12);
  const dark = facadeColor("#2b3440", palette, 0.1);
  ctx.fillStyle = wall;
  ctx.fillRect(x, top, w, h + 60);
  // Lado na sombra: dá volume sem luz de verdade.
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.fillRect(x + w * 0.78, top, w * 0.22, h + 60);
  if (style === "metropolis") {
    const glass = hash(index, 4) < 0.45;
    if (glass) {
      ctx.fillStyle = facadeColor(hash(index, 6) < 0.5 ? "#5f86a6" : "#7d9db0", palette);
      ctx.fillRect(x + 4, top + 6, w - 8, h + 60);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      for (let i = 0; i < w - 8; i += 9) ctx.fillRect(x + 4 + i, top + 6, 1.5, h + 60);
      drawWindows(ctx, x, top, w, h, [9, 12], [6, 3], seed + index * 17, { ...palette, windowsLit: palette.windowsLit * 0.6 }, "rgba(0,0,0,0)");
    } else {
      drawWindows(ctx, x, top, w, h, [11, 14], [6, 8], seed + index * 17, palette, dark);
    }
    if (hash(index, 12) < 0.4) {
      ctx.fillStyle = wall;
      ctx.fillRect(x + w * 0.25, top - 22, w * 0.5, 22);
    }
    if (paint.antennas && hash(index, 13) < 0.45) {
      const ax = x + w * (0.3 + hash(index, 14) * 0.4);
      const ah = 40 + hash(index, 15) * 70;
      for (let i = 0; i < ah; i += 10) {
        ctx.fillStyle = (i / 10) % 2 === 0 ? "#d9333a" : "#f1f1f1";
        ctx.fillRect(ax - 2, top - i - 10, 4, 10);
      }
      ctx.fillStyle = "#ff4040";
      ctx.fillRect(ax - 2.5, top - ah - 14, 5, 5);
    }
  } else if (style === "european") {
    // Mansarda de ardósia com lucarnas, sacadas de ferro e chaminés.
    const roof = facadeColor("#4a5560", palette);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x - 2, top);
    ctx.lineTo(x + 10, top - 30);
    ctx.lineTo(x + w - 10, top - 30);
    ctx.lineTo(x + w + 2, top);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + w * 0.2, top - 42, 8, 14);
    ctx.fillRect(x + w * 0.7, top - 40, 8, 12);
    ctx.fillStyle = wall;
    for (let i = x + 16; i < x + w - 16; i += 22) ctx.fillRect(i, top - 22, 9, 14);
    drawWindows(ctx, x, top, w, h, [18, 26], [9, 16], seed + index * 13, palette, dark);
    ctx.fillStyle = "rgba(20,20,24,0.55)";
    for (let floor = top + 30; floor < HORIZON - 20; floor += 52) ctx.fillRect(x + 4, floor, w - 8, 2);
  } else if (style === "colonial") {
    // Casario: telhado de barro, janelas altas com moldura branca.
    ctx.fillStyle = facadeColor("#b5532e", palette);
    ctx.beginPath();
    ctx.moveTo(x - 4, top + 2);
    ctx.lineTo(x + w / 2, top - 16);
    ctx.lineTo(x + w + 4, top + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = facadeColor("#f6f1e6", palette);
    ctx.fillRect(x, top, w, 4);
    const cols = Math.max(1, Math.floor(w / 22));
    for (let floor = 0; floor < Math.floor(h / 40); floor += 1) {
      for (let col = 0; col < cols; col += 1) {
        const wx = x + (w - cols * 22) / 2 + col * 22 + 5;
        const wy = top + 12 + floor * 40;
        ctx.fillStyle = facadeColor("#f6f1e6", palette);
        ctx.fillRect(wx - 2, wy - 2, 16, 26);
        const lit = palette.windowsLit > 0 && hash(index * 7 + floor, col) < palette.windowsLit;
        ctx.fillStyle = lit ? "#ffcf7a" : facadeColor(hash(index, col) < 0.5 ? "#2f6a5a" : "#3b4a7a", palette);
        ctx.fillRect(wx, wy, 12, 22);
      }
    }
  } else if (style === "modernist") {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let i = x + 6; i < x + w - 6; i += 14) ctx.fillRect(i, top + 8, 6, h - 30);
    ctx.fillStyle = dark;
    ctx.fillRect(x - 6, HORIZON - 26, w + 12, 4);
  } else {
    drawWindows(ctx, x, top, w, h, [14, 18], [7, 9], seed + index * 11, palette, dark);
  }
}

// ---------------------------------------------------------- multidão

type PersonSprite = { canvas: HTMLCanvasElement; res: number; cellW: number; cellH: number };

/**
 * Atlas de torcedores em blocos (variações × poses), de frente (calçada do
 * fundo) e de costas (calçada da frente, olhando o trio passar).
 */
function buildPeople(colors: [string, string], palette: Palette, res: number, back: boolean): PersonSprite {
  const cellW = PERSON_W + 10;
  const cellH = PERSON_H + 16;
  const canvas = makeCanvas(cellW * POSES * res, cellH * PERSON_VARIANTS * res);
  const ctx = ctx2d(canvas);
  ctx.scale(res, res);
  const shirts = [colors[0], colors[0], colors[0], colors[1], colors[1], "#f4f4f2", colors[0], colors[1], "#1f3c8f"];
  const darken = palette.crowdShade;
  for (let variant = 0; variant < PERSON_VARIANTS; variant += 1) {
    const skin = mix(SKIN_COLORS[Math.floor(hash(variant, 1) * SKIN_COLORS.length)], "#000000", darken);
    const hair = mix(HAIR_COLORS[Math.floor(hash(variant, 2) * 6)] ?? "#2a1a10", "#000000", darken);
    const shirt = mix(shirts[variant % shirts.length], "#000000", darken);
    const trim = mix(variant % 3 === 0 ? colors[1] : "#ffffff", "#000000", darken);
    const pants = mix(hash(variant, 4) < 0.5 ? "#2a3550" : "#e9e6df", "#000000", darken + 0.1);
    const cap = hash(variant, 5) < 0.22;
    const tall = 0.92 + hash(variant, 6) * 0.14;
    for (let pose = 0; pose < POSES; pose += 1) {
      ctx.save();
      ctx.translate(pose * cellW + cellW / 2, variant * cellH + cellH);
      ctx.scale(1, tall);
      // Pernas, tronco, cabeça: blocos como os bonecos do Modo 3D.
      ctx.fillStyle = pants;
      ctx.fillRect(-9, -22, 8, 22);
      ctx.fillRect(1, -22, 8, 22);
      ctx.fillStyle = shirt;
      ctx.fillRect(-11, -44, 22, 24);
      ctx.fillStyle = trim;
      ctx.fillRect(-11, -44, 22, 3);
      if (!back && variant % 4 === 1) ctx.fillRect(-2, -38, 4, 10);
      // Braços: 0 caídos, 1 os dois para cima, 2 um acenando.
      ctx.fillStyle = skin;
      const armUp = (side: number) => {
        ctx.fillStyle = shirt;
        ctx.fillRect(side < 0 ? -16 : 11, -50, 5, 8);
        ctx.fillStyle = skin;
        ctx.fillRect(side < 0 ? -17 : 12, -64, 5, 15);
      };
      const armDown = (side: number) => {
        ctx.fillStyle = shirt;
        ctx.fillRect(side < 0 ? -16 : 11, -44, 5, 8);
        ctx.fillStyle = skin;
        ctx.fillRect(side < 0 ? -16 : 11, -36, 5, 13);
      };
      if (pose === 0) {
        armDown(-1);
        armDown(1);
      } else if (pose === 1) {
        armUp(-1);
        armUp(1);
      } else {
        armDown(-1);
        armUp(1);
      }
      ctx.fillStyle = skin;
      ctx.fillRect(-7, -58, 14, 14);
      ctx.fillStyle = hair;
      if (back) {
        ctx.fillRect(-7, -58, 14, 11);
      } else {
        ctx.fillRect(-7, -59, 14, 5);
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(-4, -52, 2, 2);
        ctx.fillRect(2, -52, 2, 2);
      }
      if (cap) {
        ctx.fillStyle = mix(variant % 2 ? colors[1] : colors[0], "#000000", darken);
        ctx.fillRect(-8, -61, 16, 5);
        ctx.fillRect(back ? -8 : 0, -57, 9, 2);
      }
      ctx.restore();
    }
  }
  return { canvas, res, cellW, cellH };
}

// ------------------------------------------------------------- taça

function buildTrophy(res: number) {
  const w = 44;
  const h = 96;
  const canvas = makeCanvas(w * res, h * res);
  const ctx = ctx2d(canvas);
  ctx.scale(res, res);
  ctx.translate(w / 2, h);
  const gold = ctx.createLinearGradient(-20, 0, 20, 0);
  gold.addColorStop(0, "#8a5a12");
  gold.addColorStop(0.35, "#ffe9a0");
  gold.addColorStop(0.55, "#f2c14e");
  gold.addColorStop(1, "#7a4c0c");
  ctx.fillStyle = gold;
  ctx.fillRect(-15, -16, 30, 16);
  ctx.fillStyle = "#1f7a3a";
  ctx.fillRect(-15, -12, 30, 3);
  ctx.fillRect(-15, -6, 30, 3);
  ctx.fillStyle = gold;
  // Corpo em espiral subindo e abrindo até segurar o globo.
  ctx.beginPath();
  ctx.moveTo(-11, -16);
  ctx.bezierCurveTo(-6, -36, -10, -52, -19, -66);
  ctx.bezierCurveTo(-14, -80, 14, -80, 19, -66);
  ctx.bezierCurveTo(10, -52, 6, -36, 11, -16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(110, 70, 10, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-8, -18);
  ctx.bezierCurveTo(4, -34, -12, -50, 6, -66);
  ctx.moveTo(8, -18);
  ctx.bezierCurveTo(-4, -34, 12, -50, -6, -66);
  ctx.stroke();
  const globe = ctx.createRadialGradient(-5, -82, 2, 0, -76, 16);
  globe.addColorStop(0, "#fff6cf");
  globe.addColorStop(0.5, "#f2c14e");
  globe.addColorStop(1, "#8a5a12");
  ctx.fillStyle = globe;
  ctx.beginPath();
  ctx.arc(0, -78, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120, 80, 10, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -78, 15, 5, 0.3, 0, Math.PI * 2);
  ctx.moveTo(0, -93);
  ctx.quadraticCurveTo(-9, -78, 0, -63);
  ctx.stroke();
  return { canvas, w, h };
}

// ------------------------------------------------------------- rostos

/**
 * Rosto do jogo (`drawPlayerBust`) sem o fundo redondo: o fundo é uma cor
 * lisa, então os pixels dessa cor acima dos ombros viram transparentes.
 */
function buildBust(appearance: PlayerAppearance, primary: string, secondary: string, radius: number, face?: number) {
  const size = radius * 2 + 4;
  const canvas = makeCanvas(size, size);
  const ctx = ctx2d(canvas);
  ctx.translate(size / 2, size / 2);
  drawPlayerBust(ctx, face === undefined ? appearance : { ...appearance, face }, primary, secondary, radius);
  try {
    const image = ctx.getImageData(0, 0, size, size);
    const data = image.data;
    const cx = size / 2;
    const sample = (Math.round(cx - radius * 0.82) + Math.round(cx - radius * 0.3) * size) * 4;
    const [r, g, b] = [data[sample], data[sample + 1], data[sample + 2]];
    const limit = Math.round(cx + radius * 0.34);
    for (let y = 0; y < limit; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < 30) data[i + 3] = 0;
      }
    }
    ctx.putImageData(image, 0, 0);
  } catch {
    // Canvas "sujo" não acontece aqui, mas sem o recorte o medalhão também serve.
  }
  return canvas;
}

// ------------------------------------------------------------- palco

export type Parade2DOptions = { performance: boolean; reducedMotion: boolean };

export class Parade2DStage {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: ParadeTimeline["input"];
  private readonly palette: Palette;
  private readonly colors: [string, string];
  private readonly beats: Record<ParadeBeatId, { start: number; end: number }>;
  private shots: Shot[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private k = 1;
  private strips: Strip[] = [];
  private frontPeople: PersonSprite | null = null;
  private backPeople: PersonSprite | null = null;
  private truck: { canvas: HTMLCanvasElement; res: number } | null = null;
  private trophy: { canvas: HTMLCanvasElement; w: number; h: number } | null = null;
  private busts: HTMLCanvasElement[] = [];
  private playerSmile: HTMLCanvasElement | null = null;
  private led: HTMLCanvasElement | null = null;
  private puff: HTMLCanvasElement[] = [];
  private glow: HTMLCanvasElement | null = null;
  private signs: HTMLCanvasElement[] = [];
  private fireworks: Firework[] = [];
  private windmillX: number | null = null;
  private pulse = 0;
  private disposed = false;

  constructor(readonly canvas: HTMLCanvasElement, readonly timeline: ParadeTimeline, readonly options: Parade2DOptions) {
    this.ctx = ctx2d(canvas);
    this.input = timeline.input;
    this.palette = PALETTES[this.input.timeOfDay] ?? PALETTES.day;
    this.colors = [this.input.country.primary, this.input.country.secondary];
    const find = (id: ParadeBeatId, fallback: [number, number]) => {
      const beat = timeline.beats.find((item) => item.id === id);
      return beat ? { start: beat.start, end: beat.end } : { start: fallback[0], end: fallback[1] };
    };
    this.beats = {
      aerial: find("aerial", [0, 6]),
      avenue: find("avenue", [6, 12]),
      crowd: find("crowd", [12, 17]),
      deck: find("deck", [17, 23]),
      trophy: find("trophy", [23, 28.5]),
      finale: find("finale", [28.5, 33.5]),
      end: { start: timeline.duration, end: timeline.duration + 3600 },
    };
  }

  async prepare() {
    this.resize(true);
    // Fogos: posições na tela (o céu fica "no infinito"), sorteadas pela semente.
    const night = this.input.timeOfDay !== "day";
    const fireworks: Firework[] = [];
    const salvo = (start: number, count: number, salt: number) => {
      for (let i = 0; i < count; i += 1) {
        const pick = hash(this.input.seed + salt, i);
        fireworks.push({
          at: start + i * (0.32 + hash(salt, i) * 0.5),
          x: 0.12 + hash(salt + 1, i) * 0.76,
          y: 0.12 + hash(salt + 2, i) * 0.26,
          color: pick < 0.35 ? this.colors[0] : pick < 0.65 ? this.colors[1] : pick < 0.85 ? "#ffd970" : "#ffffff",
          color2: hash(salt + 3, i) < 0.5 ? "#ffffff" : "#ffd970",
          size: 0.8 + hash(salt + 4, i) * 0.6,
        });
      }
    };
    const many = this.options.performance ? 0.6 : 1;
    salvo(this.timeline.burstAt, Math.round((night ? 9 : 4) * many), 11);
    salvo(this.beats.finale.start + 0.2, Math.round((night ? 12 : 5) * many), 23);
    this.fireworks = fireworks.map((item) => ({ ...item, color: brighten(item.color) }));
  }

  setBeat(pulse: number) {
    this.pulse = pulse;
  }

  dispose() {
    this.disposed = true;
    this.strips = [];
    this.busts = [];
    this.puff = [];
    this.signs = [];
  }

  // ----------------------------------------------------------- medidas

  private resize(force = false) {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 640));
    const cssH = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || 360));
    const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, this.options.performance ? 1 : 1.5);
    if (!force && cssW === this.width && cssH === this.height && dpr === this.dpr) return;
    this.width = cssW;
    this.height = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    // Em pé (celular) a cena abre mais para o trio caber; deitado, 720 unidades na altura.
    this.k = Math.max(cssH / 1100, Math.min(cssH / WORLD_H, cssW / 1000));
    this.shots = this.buildShots();
    this.buildCaches();
  }

  /** Posição do trio (centro, unidades): anda devagar e quase para na hora da taça. */
  truckX(time: number) {
    const slowFrom = this.beats.trophy.start;
    const slowTo = this.beats.trophy.end;
    const slowed = Math.max(0, Math.min(time, slowTo) - slowFrom);
    return TRUCK_SPEED * (Math.max(0, time) - slowed * 0.7);
  }

  private playerX(time: number) {
    return this.truckX(time) + 170;
  }

  private buildShots(): Shot[] {
    const b = this.beats;
    const variant = this.input.variant;
    const X = (time: number) => this.truckX(time);
    const u = (time: number, beat: { start: number; end: number }) => clamp01((time - beat.start) / (beat.end - beat.start));
    const deckY = TRUCK_GROUND - DECK;
    const side = variant === 1 ? -1 : 1;
    const shots: Shot[] = [
      // Vista aérea: a cidade inteira, o trio pequeno entrando na avenida.
      { start: 0, blend: 0, at: (t) => ({ x: X(t) + side * lerp(620, 260, smooth(u(t, b.aerial))), y: lerp(250, 330, smooth(u(t, b.aerial))), s: lerp(0.44, 0.58, smooth(u(t, b.aerial))) }) },
      // O trio chegando: plano médio acompanhando o caminhão.
      { start: b.avenue.start, blend: 0, at: (t) => ({ x: X(t) + lerp(variant === 2 ? -240 : 240, variant === 2 ? 80 : -60, smooth(u(t, b.avenue))), y: 410, s: 0.9 + 0.1 * u(t, b.avenue) }) },
      // No meio do povo: câmera baixa, a multidão da frente e o trio passando atrás.
      { start: b.crowd.start, blend: 0, at: (t) => ({ x: X(b.crowd.start) + lerp(-460, -230, smooth(u(t, b.crowd))) + (variant === 1 ? 120 : 0), y: variant === 1 ? 480 : 570, s: 1.3 + 0.12 * u(t, b.crowd) }) },
      // No alto do trio: passeia pelos companheiros até o jogador.
      { start: b.deck.start, blend: 0, at: (t) => ({ x: X(t) + lerp(-230, 150, smooth(u(t, b.deck))), y: deckY - 70, s: 1.9 + 0.15 * u(t, b.deck) }) },
      // A taça: fecha no jogador, depois do estouro abre para a festa.
      {
        start: b.trophy.start,
        blend: 0.9,
        at: (t) => {
          const close = { x: this.playerX(t), y: deckY - 92, s: lerp(1.95, 2.35, smooth((t - b.trophy.start) / 1.6)) };
          const open = { x: X(t) + 60, y: deckY - 40, s: 1.3 };
          return mixCam(close, open, smooth((t - this.timeline.burstAt - 0.3) / 1.6));
        },
      },
      // Final: abre para o céu com os fogos e a avenida inteira.
      { start: b.finale.start, blend: 1.4, at: (t) => ({ x: X(Math.min(t, b.finale.end)) + 120, y: lerp(300, 230, smooth(u(t, b.finale))), s: lerp(0.82, 0.6, smooth(u(t, b.finale))) }) },
    ];
    return shots;
  }

  private camAt(time: number): Cam {
    let index = 0;
    for (let i = 0; i < this.shots.length; i += 1) if (this.shots[i].start <= time) index = i;
    const evaluate = (at: number): Cam => {
      const shot = this.shots[at];
      const value = shot.at(time);
      if (at === 0 || shot.blend <= 0 || time >= shot.start + shot.blend) return value;
      return mixCam(evaluate(at - 1), value, smooth((time - shot.start) / shot.blend));
    };
    const cam = evaluate(index);
    // Celular em pé: os planos abertos sobrariam céu demais; fecha mais neles do que nos closes.
    if (this.width / Math.max(1, this.height) < 0.8) cam.s *= 1 + 0.8 * clamp01((1.2 - cam.s) / 0.8);
    // Tremida no estouro (menos movimento: nada).
    if (!this.options.reducedMotion) {
      const since = time - this.timeline.burstAt;
      if (since > 0 && since < 1.2) {
        const amp = 7 * (1 - since / 1.2);
        cam.x += Math.sin(time * 61) * amp;
        cam.y += Math.cos(time * 53) * amp;
      }
    }
    return cam;
  }

  // ------------------------------------------------------- pré-desenho

  private buildCaches() {
    const res = Math.min(3, Math.max(1.5, this.k * this.dpr * 2.4));
    this.frontPeople = buildPeople(this.colors, { ...this.palette, crowdShade: this.palette.crowdShade * 0.6 }, Math.min(3, this.k * this.dpr * 2.6), true);
    this.backPeople = buildPeople(this.colors, this.palette, Math.min(2, Math.max(1, this.k * this.dpr * 1.1)), false);
    this.trophy = buildTrophy(Math.min(4, this.k * this.dpr * 2.8));
    this.buildTruck(Math.min(2, Math.max(1, this.k * this.dpr * 1.6)));
    this.buildLed();
    this.buildBusts(Math.round(Math.min(64, Math.max(32, 26 * this.k * this.dpr * 2.4))));
    this.buildPuffs();
    this.buildSigns(res);
    this.buildStrips();
  }

  private buildBusts(radius: number) {
    const [primary, secondary] = this.colors;
    const teammates = this.input.teammates;
    this.busts = teammates.map((mate, index) => buildBust(mate.appearance, primary, secondary, radius, index % 3 === 0 ? 9 : index % 3 === 1 ? 4 : 2));
    this.busts.unshift(buildBust(this.input.player.appearance, primary, secondary, radius));
    this.playerSmile = buildBust(this.input.player.appearance, primary, secondary, radius, 9);
  }

  private buildPuffs() {
    const colors = [this.colors[0], this.colors[1], "#ff5a5f"];
    this.puff = colors.map((color) => {
      const size = 128;
      const canvas = makeCanvas(size, size);
      const ctx = ctx2d(canvas);
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
      const [r, g, b] = rgbOf(brighten(color));
      gradient.addColorStop(0, `rgba(${r},${g},${b},0.75)`);
      gradient.addColorStop(0.55, `rgba(${r},${g},${b},0.32)`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      return canvas;
    });
    const size = 160;
    const glow = makeCanvas(size, size);
    const ctx = ctx2d(glow);
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,240,190,0.95)");
    gradient.addColorStop(0.3, "rgba(255,210,110,0.45)");
    gradient.addColorStop(1, "rgba(255,190,80,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.glow = glow;
  }

  private buildSigns(res: number) {
    const name = this.input.player.name.split(" ").slice(-1)[0]?.toUpperCase() || "CRAQUE";
    const stars = this.input.stars;
    const titles = ["", "CAMPEÃO!", "BI!", "TRI!", "TETRA!", "PENTA!", "HEXA!", "HEPTA!", "OCTA!"];
    const texts = [`OBRIGADO, ${name}!`, titles[stars] ?? `${stars}★`, `${name} ${this.input.player.number}`, "É CAMPEÃO!"];
    this.signs = texts.map((text, index) => {
      const w = Math.max(90, text.length * 11 + 20);
      const h = 34;
      const canvas = makeCanvas(w * res, h * res);
      const ctx = ctx2d(canvas);
      ctx.scale(res, res);
      ctx.fillStyle = index % 2 === 0 ? "#fbfaf4" : this.colors[1];
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = index % 2 === 0 ? this.colors[0] : "#ffffff";
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
      ctx.fillStyle = index % 2 === 0 ? this.colors[0] : contrastInk(this.colors[1]);
      ctx.font = `900 19px Impact, "Arial Black", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, h / 2 + 1, w - 10);
      return canvas;
    });
  }

  private buildLed() {
    const { country, season, stars } = this.input;
    const text = `  ★ CAMPEÕES DO MUNDO ${season}  ${"★".repeat(Math.min(stars, 8))}  SELEÇÃO ${country.name.toUpperCase()}  ★  ${this.input.player.name.toUpperCase()}  `;
    const h = 22;
    const res = 2;
    const probe = ctx2d(makeCanvas(4, 4));
    probe.font = `900 17px Impact, "Arial Black", sans-serif`;
    const w = Math.ceil(probe.measureText(text).width) + 20;
    const canvas = makeCanvas(w * res, h * res);
    const ctx = ctx2d(canvas);
    ctx.scale(res, res);
    ctx.fillStyle = "#07070c";
    ctx.fillRect(0, 0, w, h);
    ctx.font = `900 17px Impact, "Arial Black", sans-serif`;
    ctx.textBaseline = "middle";
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, brighten(this.colors[1]));
    gradient.addColorStop(0.5, "#ffffff");
    gradient.addColorStop(1, brighten(this.colors[0]));
    ctx.fillStyle = gradient;
    ctx.fillText(text, 6, h / 2 + 1);
    // Grade de LED por cima do texto.
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    for (let x = 0; x < w; x += 2) ctx.fillRect(x, 0, 0.6, h);
    for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 0.6);
    this.led = canvas;
  }

  private buildTruck(res: number) {
    // Coordenadas locais: origem no chão, no centro do caminhão; frente para +x.
    const left = -330;
    const top = -(DECK + 230);
    const w = 660;
    const h = DECK + 230 + 4;
    const canvas = makeCanvas(w * res, h * res);
    const ctx = ctx2d(canvas);
    ctx.scale(res, res);
    ctx.translate(-left, -top);
    const [primary, secondary] = this.colors;
    const body = this.input.variant === 1 ? secondary : primary;
    const trim = this.input.variant === 1 ? primary : secondary;
    const metal = "#2a2d35";
    // Treliça do teto com os line arrays pendurados.
    ctx.fillStyle = "#3a3d46";
    ctx.fillRect(-306, -DECK - 220, 10, 220);
    ctx.fillRect(296, -DECK - 220, 10, 220);
    ctx.fillRect(-306, -DECK - 226, 612, 10);
    ctx.strokeStyle = "#4a4e59";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -300; x < 300; x += 20) {
      ctx.moveTo(x, -DECK - 226);
      ctx.lineTo(x + 10, -DECK - 216);
      ctx.lineTo(x + 20, -DECK - 226);
    }
    ctx.stroke();
    for (const x of [-292, 262]) {
      for (let i = 0; i < 6; i += 1) {
        ctx.fillStyle = i % 2 ? "#15161b" : "#1d1f26";
        ctx.fillRect(x, -DECK - 210 + i * 17, 30, 16);
        ctx.fillStyle = "#33363f";
        ctx.fillRect(x + 3, -DECK - 206 + i * 17, 24, 3);
      }
    }
    // Carroceria e saia.
    ctx.fillStyle = mix(body, "#000000", 0.15);
    ctx.fillRect(-310, -DECK, 540, DECK - 52);
    ctx.fillStyle = metal;
    ctx.fillRect(-316, -60, 620, 28);
    ctx.fillStyle = body;
    ctx.fillRect(-316, -72, 620, 18);
    ctx.fillStyle = trim;
    ctx.fillRect(-316, -56, 620, 5);
    // Paredão de som: caixas com cones (os woofers grandes pulsam ao vivo).
    ctx.fillStyle = "#101116";
    ctx.fillRect(-300, -DECK + 36, 520, DECK - 112);
    for (let col = 0; col < 13; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        const cx = -280 + col * 40;
        const cy = -DECK + 60 + row * 44;
        ctx.fillStyle = "#1b1c22";
        ctx.fillRect(cx - 18, cy - 20, 36, 40);
        ctx.fillStyle = "#08080b";
        ctx.beginPath();
        ctx.arc(cx, cy, row === 0 ? 9 : 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3b3d46";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // Cabine.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(230, -60);
    ctx.lineTo(230, -220);
    ctx.lineTo(282, -220);
    ctx.quadraticCurveTo(318, -216, 322, -170);
    ctx.lineTo(326, -60);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#9fc6dc";
    ctx.beginPath();
    ctx.moveTo(246, -206);
    ctx.lineTo(284, -206);
    ctx.quadraticCurveTo(308, -202, 310, -168);
    ctx.lineTo(246, -168);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(230, -150, 96, 8);
    ctx.fillStyle = "#ffe9a6";
    ctx.fillRect(318, -96, 8, 14);
    // Nome pintado na saia.
    ctx.fillStyle = contrastInk(body);
    ctx.font = `900 14px Impact, "Arial Black", sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(`SELEÇÃO ${this.input.country.name.toUpperCase()} · CAMPEÃ DO MUNDO ${this.input.season}`, -296, -63, 500);
    // Parapeito do deck (o vidro e o LED entram ao vivo por cima dos bonecos).
    ctx.fillStyle = mix(body, "#000000", 0.3);
    ctx.fillRect(-316, -DECK, 632, 10);
    this.truck = { canvas, res };
  }

  private buildStrips() {
    const city = this.input.city;
    const style = city.style;
    const palette = this.palette;
    const landmarks = city.landmarks;
    const seed = this.input.seed + this.input.variant * 977;
    // O caminho da câmera diz quanto de cada camada aparece: a faixa cobre só isso.
    const samples: Cam[] = [];
    for (let t = 0; t <= this.timeline.duration + 2; t += 0.25) samples.push(this.camAt(t));
    const layers = [
      { p: 0.1, top: HORIZON - 380, bottom: HORIZON + 30, quality: 0.6 },
      { p: 0.32, top: HORIZON - 470, bottom: HORIZON + 30, quality: 0.9 },
      { p: 0.62, top: HORIZON - 260, bottom: HORIZON + 30, quality: 1 },
    ];
    const aerialCam = this.camAt(3);
    const finaleCam = this.camAt(this.beats.finale.start + 2.5);
    const sea = landmarks.includes("sea");
    const palms = landmarks.includes("palms");
    const strips: Strip[] = [];
    for (const [layerIndex, layer] of layers.entries()) {
      let min = Infinity;
      let max = -Infinity;
      let maxScale = 0;
      for (const cam of samples) {
        const scale = this.layerScale(cam.s, layer.p);
        const half = this.width / 2 / scale;
        min = Math.min(min, cam.x * layer.p - half);
        max = Math.max(max, cam.x * layer.p + half);
        maxScale = Math.max(maxScale, scale);
      }
      min -= 60;
      max += 60;
      const width = max - min;
      const height = layer.bottom - layer.top;
      const res = Math.max(0.25, Math.min(maxScale * this.dpr * layer.quality, 4000 / width, 2400 / height));
      const canvas = makeCanvas(width * res, height * res);
      const ctx = ctx2d(canvas);
      ctx.scale(res, res);
      ctx.translate(-min, -layer.top);
      const paint: CityPaint = { ctx, palette, facade: city.facade, seed: seed + layerIndex * 101, antennas: landmarks.includes("antennas"), colors: this.colors };
      const aerialX = aerialCam.x * layer.p;
      const finaleX = finaleCam.x * layer.p;
      const placed = this.placeLandmarks(layerIndex, aerialX, finaleX);
      // As pás do moinho giram ao vivo; a faixa guarda só a torre.
      if (layerIndex === 1) this.windmillX = placed.find((item) => item.id === "windmill")?.x ?? null;
      if (layerIndex === 0) this.paintFar(ctx, min, max, placed, sea, style);
      else if (layerIndex === 1) this.paintMid(paint, min, max, placed, style, sea);
      else this.paintNear(paint, min, max, style, palms);
      strips.push({ canvas, x0: min, top: layer.top, res, p: layer.p, width, height });
    }
    this.strips = strips;
  }

  private placeLandmarks(layer: number, aerialX: number, finaleX: number) {
    const ids = this.input.city.landmarks.filter((id) => (layer === 0 ? FAR_LANDMARKS.has(id) : layer === 1 ? !FAR_LANDMARKS.has(id) && LANDMARKS[id] : false));
    const side = this.input.variant === 1 ? -1 : 1;
    const spots = [aerialX + side * (layer === 0 ? 120 : 160), finaleX - side * 260, aerialX - side * 320, finaleX + side * 380];
    return ids.map((id, index) => ({ id, x: spots[index % spots.length] + Math.floor(index / spots.length) * 500 }));
  }

  private paintFar(ctx: CanvasRenderingContext2D, min: number, max: number, placed: Array<{ id: LandmarkId; x: number }>, sea: boolean, style: string) {
    const palette = this.palette;
    // Morros ao longe.
    ctx.fillStyle = mix(palette.far, palette.haze, 0.35);
    ctx.beginPath();
    ctx.moveTo(min, HORIZON);
    for (let x = min; x <= max + 40; x += 40) {
      const y = HORIZON - 40 - 50 * (0.5 + 0.5 * Math.sin(x * 0.006 + this.input.seed)) - 30 * hash(Math.floor(x / 40), 5);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(max + 40, HORIZON + 30);
    ctx.lineTo(min, HORIZON + 30);
    ctx.closePath();
    ctx.fill();
    for (const item of placed) LANDMARKS[item.id]?.(ctx, item.x, HORIZON, palette.far, palette.haze, palette.windowsLit > 0.4 ? "#ffd88a" : null);
    // Silhuetas de prédios bem longe, no tom da névoa.
    if (style !== "beach") {
      ctx.fillStyle = mix(palette.far, palette.haze, 0.55);
      for (let x = min, i = 0; x < max; i += 1) {
        const w = 30 + hash(i, 21) * 50;
        const h = 30 + hash(i, 22) * (style === "metropolis" ? 150 : 70);
        ctx.fillRect(x, HORIZON - h, w, h + 30);
        x += w + hash(i, 23) * 30;
      }
    }
    if (sea) {
      // Mar: faixa até a areia, com brilhos.
      const seaTop = HORIZON - 34;
      const water = this.input.timeOfDay === "night" ? "#0d1a3d" : this.input.timeOfDay === "sunset" ? "#5b4a86" : "#2f86c4";
      ctx.fillStyle = water;
      ctx.fillRect(min, seaTop, max - min, 64);
      ctx.fillStyle = this.input.timeOfDay === "day" ? "rgba(255,255,255,0.5)" : "rgba(255,200,140,0.45)";
      for (let x = min, i = 0; x < max; x += 18, i += 1) ctx.fillRect(x + hash(i, 31) * 10, seaTop + 4 + hash(i, 32) * 26, 8 + hash(i, 33) * 14, 1.5);
      ctx.fillStyle = mix("#e9d6a8", palette.tint, (1 - palette.light) * 0.6);
      ctx.fillRect(min, HORIZON - 4, max - min, 40);
    }
  }

  private paintMid(paint: CityPaint, min: number, max: number, placed: Array<{ id: LandmarkId; x: number }>, style: string, sea: boolean) {
    const { ctx, palette } = paint;
    const sizes: Record<string, { w: [number, number]; h: [number, number]; gap: [number, number] }> = {
      metropolis: { w: [60, 130], h: [150, 430], gap: [2, 14] },
      european: { w: [80, 130], h: [110, 170], gap: [0, 4] },
      colonial: { w: [46, 82], h: [70, 125], gap: [0, 2] },
      modernist: { w: [120, 220], h: [50, 110], gap: [80, 220] },
      beach: { w: [60, 100], h: [90, 220], gap: [200, 420] },
    };
    const size = sizes[style] ?? sizes.metropolis;
    const keepClear = placed.map((item) => item.x);
    let x = min;
    let index = 0;
    while (x < max) {
      const w = lerp(size.w[0], size.w[1], hash(paint.seed + index, 1));
      const h = lerp(size.h[0], size.h[1], Math.pow(hash(paint.seed + index, 2), style === "metropolis" ? 1.3 : 1));
      const blocked = keepClear.some((clear) => Math.abs(clear - (x + w / 2)) < 150);
      // Cidade de mar: o casario some em trechos para a água aparecer.
      // Na orla o lado da câmera é o mar: prédios só nos outros estilos.
      const gap = style === "beach" || (sea && hash(index, 40) < 0.3);
      if (!blocked && !gap) drawBuilding(paint, style, x, w, h, index);
      x += w + lerp(size.gap[0], size.gap[1], hash(paint.seed + index, 3));
      index += 1;
    }
    const lit = palette.windowsLit > 0.3 ? "#ffd88a" : null;
    for (const item of placed) {
      const color = facadeColor(item.id === "congress" || item.id === "cathedral" || item.id === "obelisk" ? "#f4f4f0" : "#d9cfbf", palette);
      LANDMARKS[item.id]?.(ctx, item.x, HORIZON, color, facadeColor("#2f3a4a", palette), lit);
    }
  }

  private paintNear(paint: CityPaint, min: number, max: number, style: string, palms: boolean) {
    const { ctx, palette } = paint;
    const trunk = facadeColor("#6b4a2f", palette);
    const leaf = facadeColor(style === "european" ? "#3f7a3a" : "#2f8a46", palette);
    const lamp = facadeColor("#2b2f38", palette, 0.1);
    for (let x = min, i = 0; x < max; i += 1) {
      const kind = palms ? "palm" : style === "european" || style === "modernist" ? "tree" : hash(i, 50) < 0.5 ? "tree" : "none";
      if (kind === "palm") {
        const h = 120 + hash(i, 51) * 80;
        ctx.strokeStyle = trunk;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(x, HORIZON + 20);
        ctx.quadraticCurveTo(x + 14, HORIZON - h / 2, x + 6, HORIZON - h);
        ctx.stroke();
        ctx.strokeStyle = leaf;
        ctx.lineWidth = 6;
        for (let f = 0; f < 7; f += 1) {
          const angle = -Math.PI / 2 + (f - 3) * 0.48;
          ctx.beginPath();
          ctx.moveTo(x + 6, HORIZON - h);
          ctx.quadraticCurveTo(x + 6 + Math.cos(angle) * 34, HORIZON - h + Math.sin(angle) * 30 - 6, x + 6 + Math.cos(angle) * 56, HORIZON - h + Math.sin(angle) * 20 + 22);
          ctx.stroke();
        }
      } else if (kind === "tree") {
        const h = 70 + hash(i, 52) * 50;
        ctx.fillStyle = trunk;
        ctx.fillRect(x - 4, HORIZON - h + 20, 8, h + 10);
        ctx.fillStyle = leaf;
        ctx.beginPath();
        ctx.arc(x, HORIZON - h + 6, 30 + hash(i, 53) * 12, 0, Math.PI * 2);
        ctx.arc(x + 22, HORIZON - h + 18, 22, 0, Math.PI * 2);
        ctx.arc(x - 22, HORIZON - h + 20, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      // Poste a cada árvore, com o varal de bandeirinhas até o próximo.
      const next = x + 150 + hash(i, 54) * 90;
      ctx.fillStyle = lamp;
      ctx.fillRect(x + 60, HORIZON - 150, 5, 170);
      ctx.fillRect(x + 52, HORIZON - 152, 22, 5);
      if (palette.windowsLit > 0) {
        ctx.fillStyle = "rgba(255, 214, 140, 0.9)";
        ctx.fillRect(x + 52, HORIZON - 147, 22, 3);
      }
      const from = x + 62;
      const to = next + 62;
      for (let f = 0; f < 9; f += 1) {
        const k = (f + 0.5) / 9;
        const fx = lerp(from, to, k);
        const fy = HORIZON - 140 + Math.sin(k * Math.PI) * 26;
        ctx.fillStyle = f % 3 === 0 ? this.colors[0] : f % 3 === 1 ? this.colors[1] : "#ffffff";
        ctx.beginPath();
        ctx.moveTo(fx - 6, fy);
        ctx.lineTo(fx + 6, fy);
        ctx.lineTo(fx, fy + 13);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(30,30,30,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(from, HORIZON - 140);
      ctx.quadraticCurveTo((from + to) / 2, HORIZON - 140 + 52, to, HORIZON - 140);
      ctx.stroke();
      x = next;
    }
  }

  private layerScale(s: number, p: number) {
    return this.k * Math.pow(s, 0.3 + 0.7 * p);
  }

  // ------------------------------------------------------------ quadro

  render(time: number, dt: number) {
    void dt;
    if (this.disposed) return;
    this.resize();
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const cam = this.camAt(time);
    const pulse = this.pulse || paradeBeatPulse(time);
    const k = this.k * cam.s;
    const horizonY = H / 2 + (HORIZON - cam.y) * k;
    const truckX = this.truckX(time);
    const excitement = this.excitement(time);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true;
    this.drawSky(ctx, W, H, horizonY, time);

    for (const strip of this.strips) {
      const scale = this.layerScale(cam.s, strip.p);
      const left = W / 2 + (strip.x0 - cam.x * strip.p) * scale;
      const top = horizonY + (strip.top - HORIZON) * scale;
      // Recorta só o pedaço visível da faixa.
      const visibleFrom = Math.max(0, -left / scale);
      const visibleTo = Math.min(strip.width, (W - left) / scale);
      if (visibleTo <= visibleFrom) continue;
      const sx = visibleFrom * strip.res;
      const sw = Math.min(strip.canvas.width - sx, (visibleTo - visibleFrom) * strip.res);
      if (sw <= 0) continue;
      ctx.drawImage(strip.canvas, sx, 0, sw, strip.canvas.height, left + visibleFrom * scale, top, sw / strip.res * scale, strip.height * scale);
      if (strip.p > 0.3 && strip.p < 0.5) this.drawWindmill(ctx, cam, horizonY, time);
    }

    this.drawFireworks(ctx, W, H, time, horizonY);

    // Daqui em diante: o mundo em escala 1 (calçadas, trio, gente).
    ctx.setTransform(this.dpr * k, 0, 0, this.dpr * k, this.dpr * (W / 2 - cam.x * k), this.dpr * (H / 2 - cam.y * k));
    const viewLeft = cam.x - W / 2 / k;
    const viewRight = cam.x + W / 2 / k;

    // Calçada do fundo e a multidão de frente para o trio.
    ctx.fillStyle = mix(this.palette.street, "#9a9183", 0.35);
    ctx.fillRect(viewLeft - 10, HORIZON, viewRight - viewLeft + 20, BACK_FEET - HORIZON + 4);
    this.drawSmoke(ctx, time, truckX, true);
    this.drawBackCrowd(ctx, viewLeft, viewRight, time, truckX, excitement, pulse, BACK_FAR_FEET, 0.78, 16, 1);
    this.drawBackCrowd(ctx, viewLeft, viewRight, time, truckX, excitement, pulse, BACK_FEET, 0.95, 21, 2);

    // Pista.
    ctx.fillStyle = this.palette.street;
    ctx.fillRect(viewLeft - 10, BACK_FEET, viewRight - viewLeft + 20, 900);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(viewLeft - 10, BACK_FEET, viewRight - viewLeft + 20, 5);
    ctx.fillStyle = this.input.city.style === "beach" ? "rgba(240,240,240,0.55)" : "rgba(255,214,90,0.7)";
    const dash = 90;
    for (let x = Math.floor(viewLeft / dash) * dash; x < viewRight; x += dash) ctx.fillRect(x, 572, 46, 4);

    this.drawTruck(ctx, time, truckX, pulse, excitement);
    this.drawSmoke(ctx, time, truckX, false);
    this.drawConfetti(ctx, time, cam, viewLeft, viewRight, false);
    this.drawFrontCrowd(ctx, viewLeft, viewRight, time, truckX, excitement, pulse);
    this.drawConfetti(ctx, time, cam, viewLeft, viewRight, true);

    // Clarão do estouro.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const flash = time - this.timeline.burstAt;
    if (!this.options.reducedMotion && flash > 0 && flash < 0.5) {
      ctx.fillStyle = `rgba(255, 246, 214, ${0.55 * (1 - flash / 0.5)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private excitement(time: number) {
    const b = this.beats;
    if (time >= this.timeline.burstAt) return 1;
    if (time >= b.trophy.start) return 0.75;
    if (time >= b.crowd.start) return 0.7;
    if (time >= b.avenue.start) return 0.55;
    return 0.45;
  }

  private drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, horizonY: number, time: number) {
    const [top, middle, low] = this.palette.sky;
    const gradient = ctx.createLinearGradient(0, 0, 0, Math.max(10, horizonY));
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.62, middle);
    gradient.addColorStop(1, low);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    const sun = this.palette.sun;
    if (sun) {
      const sx = W * sun.x;
      const sy = Math.min(horizonY - 10, H * sun.y + (horizonY - H * 0.6) * 0.3);
      if (this.glow) ctx.drawImage(this.glow, sx - sun.r * 3, sy - sun.r * 3, sun.r * 6, sun.r * 6);
      ctx.fillStyle = sun.color;
      ctx.beginPath();
      ctx.arc(sx, sy, sun.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.palette.moon) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < 70; i += 1) {
        const twinkle = 0.5 + 0.5 * Math.sin(time * (1 + hash(i, 61) * 3) + i);
        ctx.globalAlpha = 0.35 + 0.65 * twinkle;
        ctx.fillRect(hash(i, 62) * W, hash(i, 63) * horizonY * 0.8, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#f6f1dc";
      ctx.beginPath();
      ctx.arc(W * 0.8, H * 0.14, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.palette.sky[0];
      ctx.beginPath();
      ctx.arc(W * 0.8 + 9, H * 0.14 - 5, 19, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Nuvens: elipses claras andando devagar.
      ctx.fillStyle = this.input.timeOfDay === "sunset" ? "rgba(255, 190, 170, 0.45)" : "rgba(255,255,255,0.7)";
      for (let i = 0; i < 5; i += 1) {
        const x = ((hash(i, 71) * 1.4 * W + time * (6 + i * 2)) % (W * 1.4)) - W * 0.2;
        const y = (0.08 + hash(i, 72) * 0.25) * horizonY;
        const r = 26 + hash(i, 73) * 30;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 2.2, r * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(x + r, y - r * 0.3, r * 1.2, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawWindmill(ctx: CanvasRenderingContext2D, cam: Cam, horizonY: number, time: number) {
    const mid = this.strips[1];
    if (this.windmillX === null || !mid) return;
    const midScale = this.layerScale(cam.s, mid.p);
    const x = this.width / 2 + (this.windmillX - cam.x * mid.p) * midScale;
    const y = horizonY - 128 * midScale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 0.9);
    ctx.fillStyle = facadeColor("#5b4636", this.palette);
    for (let i = 0; i < 4; i += 1) {
      ctx.rotate(Math.PI / 2);
      ctx.fillRect(-3 * midScale, 0, 6 * midScale, 70 * midScale);
      ctx.fillRect(3 * midScale, 14 * midScale, 12 * midScale, 54 * midScale);
    }
    ctx.restore();
  }

  private drawFireworks(ctx: CanvasRenderingContext2D, W: number, H: number, time: number, horizonY: number) {
    if (!this.fireworks.length) return;
    const night = this.input.timeOfDay !== "day";
    const sparks = this.options.performance ? 22 : 36;
    ctx.globalCompositeOperation = "lighter";
    const unit = Math.min(W, H) / 420;
    for (const [index, shell] of this.fireworks.entries()) {
      const age = time - shell.at;
      if (age < 0 || age > 2.6) continue;
      const cx = W * shell.x;
      const cy = Math.min(horizonY - 40, H * shell.y);
      const rise = 0.55;
      if (age < rise) {
        // Rastro subindo.
        const k = easeOut(age / rise);
        const y = lerp(horizonY, cy, k);
        ctx.fillStyle = "rgba(255, 230, 170, 0.9)";
        ctx.fillRect(cx - 1.5, y, 3, 18 * unit * (1 - k) + 4);
        continue;
      }
      const t = age - rise;
      const fade = Math.max(0, 1 - t / 2);
      const radius = 70 * unit * shell.size * (1 - Math.exp(-t * 3.2));
      if (t < 0.25 && this.glow) {
        ctx.globalAlpha = (1 - t / 0.25) * (night ? 0.9 : 0.5);
        const g = radius * 3 + 30 * unit;
        ctx.drawImage(this.glow, cx - g / 2, cy - g / 2, g, g);
        ctx.globalAlpha = 1;
      }
      const size = Math.max(1.5, 2.6 * unit * (night ? 1 : 0.85));
      for (let i = 0; i < sparks; i += 1) {
        const angle = (i / sparks) * Math.PI * 2 + hash(index, i) * 0.2;
        const speed = 0.75 + hash(i, index + 7) * 0.35;
        const sx = cx + Math.cos(angle) * radius * speed;
        const sy = cy + Math.sin(angle) * radius * speed + 26 * unit * t * t;
        // Pisca no fim, como estrelinha.
        const flicker = t > 1.1 ? (Math.sin(time * 40 + i) > 0 ? 1 : 0.3) : 1;
        ctx.globalAlpha = fade * flicker * (night ? 1 : 0.75);
        ctx.fillStyle = i % 3 === 0 ? shell.color2 : shell.color;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private hop(time: number, index: number, salt: number, energy: number) {
    // Pulo no tempo da batida, cada um com um atraso pequeno.
    const phase = time / (60 / 128) + hash(index, salt) * (1 - energy) * 0.9;
    return Math.abs(Math.sin(Math.PI * phase)) * energy;
  }

  private drawBackCrowd(ctx: CanvasRenderingContext2D, left: number, right: number, time: number, truckX: number, excitement: number, pulse: number, feet: number, scale: number, spacing: number, salt: number) {
    const sprite = this.backPeople;
    if (!sprite) return;
    const gap = spacing * (this.options.performance ? 1.5 : 1);
    const reduced = this.options.reducedMotion ? 0.35 : 1;
    const from = Math.floor((left - 40) / gap);
    const to = Math.ceil((right + 40) / gap);
    const w = sprite.cellW * scale;
    const h = sprite.cellH * scale;
    const flagEvery = this.options.performance ? 13 : 8;
    const flagPoles: Array<[number, number, number]> = [];
    for (let i = from; i <= to; i += 1) {
      const x = i * gap + (hash(i, salt) - 0.5) * gap * 0.8;
      const near = Math.exp(-(((x - truckX) / 520) ** 2));
      const energy = clamp01((0.35 + 0.65 * near) * excitement) * reduced;
      const jump = this.hop(time, i, salt + 3, energy) * 9 * scale;
      const variant = Math.floor(hash(i, salt + 5) * PERSON_VARIANTS);
      const excited = energy > 0.55 || pulse > 0.8;
      const pose = excited ? (Math.floor(time * 2.13 + hash(i, salt + 6) * 3) % 2 === 0 ? 1 : 2) : Math.floor(hash(i, salt + 7) * 3) % 3;
      const y = feet - h - jump;
      ctx.drawImage(sprite.canvas, pose * sprite.cellW * sprite.res, variant * sprite.cellH * sprite.res, sprite.cellW * sprite.res, sprite.cellH * sprite.res, x - w / 2, y, w, h);
      if (salt === 2 && i % flagEvery === 0) flagPoles.push([x + 8 * scale, y + h - 62 * scale, i]);
    }
    // Bandeiras nos mastros, balançando.
    for (const [x, y, i] of flagPoles) this.drawWavingFlag(ctx, x, y, 34, 22, time, i, 52);
    // Bandeirão: a bandeira gigante passando por cima das cabeças.
    if (salt === 2) {
      const period = 900;
      for (let n = Math.floor(left / period); n <= Math.ceil(right / period); n += 1) {
        const cx = n * period + 300 + hash(n, 81) * 200;
        if (cx < left - 200 || cx > right + 200) continue;
        this.drawWavingFlag(ctx, cx - 90, feet - 120 - Math.sin(time * 2 + n) * 4, 180, 92, time, n, 0);
      }
    }
  }

  private drawWavingFlag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, time: number, seed: number, pole: number) {
    const [primary, secondary] = this.colors;
    const wave = (u: number) => Math.sin(u * 5 + time * 6 + seed) * h * 0.12 * u;
    if (pole > 0) {
      ctx.fillStyle = "#3a3330";
      ctx.fillRect(x - 1.5, y, 3, pole);
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + wave(0));
    const steps = 6;
    for (let s = 1; s <= steps; s += 1) ctx.lineTo(x + (w * s) / steps, y + wave(s / steps));
    for (let s = steps; s >= 0; s -= 1) ctx.lineTo(x + (w * s) / steps, y + h + wave(s / steps));
    ctx.closePath();
    ctx.clip();
    drawFlag(ctx, this.input.country.id, primary, secondary, x - 2, y - h * 0.2, w + 4, h * 1.4);
    // Dobras: faixas de sombra seguindo a onda.
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let s = 0; s < steps; s += 2) ctx.fillRect(x + (w * s) / steps, y - h, w / steps, h * 3);
    ctx.restore();
  }

  private drawFrontCrowd(ctx: CanvasRenderingContext2D, left: number, right: number, time: number, truckX: number, excitement: number, pulse: number) {
    const sprite = this.frontPeople;
    if (!sprite) return;
    const scale = 2.35;
    const gap = 30 * (this.options.performance ? 1.35 : 1);
    const reduced = this.options.reducedMotion ? 0.35 : 1;
    const w = sprite.cellW * scale;
    const h = sprite.cellH * scale;
    // Massa de gente atrás da primeira fila (o chão some).
    ctx.fillStyle = mix(this.colors[0], "#000000", 0.55 + this.palette.crowdShade * 0.3);
    ctx.fillRect(left - 10, FRONT_FEET - 70, right - left + 20, 600);
    const from = Math.floor((left - w) / gap);
    const to = Math.ceil((right + w) / gap);
    const crowdBeat = this.beats.crowd;
    const signAt = this.truckX(crowdBeat.start) + 40;
    // Celulares filmando à noite (as telinhas acesas).
    const phones = this.input.timeOfDay !== "day";
    // Os bonecos da frente ficam grandes: sem suavizar, os blocos saem nítidos.
    ctx.imageSmoothingEnabled = false;
    for (let i = from; i <= to; i += 1) {
      const x = i * gap + (hash(i, 91) - 0.5) * gap * 0.7;
      const near = Math.exp(-(((x - truckX) / 700) ** 2));
      const energy = clamp01((0.4 + 0.6 * near) * excitement) * reduced;
      const jump = this.hop(time, i, 92, energy) * 14;
      const variant = Math.floor(hash(i, 93) * PERSON_VARIANTS);
      const excited = energy > 0.5 || pulse > 0.85;
      const pose = excited ? (Math.floor(time * 2.13 + hash(i, 94) * 2) % 2 === 0 ? 1 : 2) : Math.floor(hash(i, 95) * 3) % 3;
      const depth = hash(i, 96) * 22;
      const y = FRONT_FEET + depth - h - jump;
      ctx.drawImage(sprite.canvas, pose * sprite.cellW * sprite.res, variant * sprite.cellH * sprite.res, sprite.cellW * sprite.res, sprite.cellH * sprite.res, x - w / 2, y, w, h);
      if (phones && pose === 2 && i % 3 === 0) {
        ctx.fillStyle = "#e8f4ff";
        ctx.fillRect(x + 12 * scale, y + 8 * scale, 7, 11);
        ctx.fillStyle = "rgba(220, 240, 255, 0.18)";
        ctx.beginPath();
        ctx.arc(x + 12 * scale + 3.5, y + 8 * scale + 5, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      // Cartazes erguidos perto de onde a câmera desce no meio do povo.
      const signIndex = Math.abs(i) % 9 === 4 ? Math.abs(Math.floor(i / 9)) % this.signs.length : -1;
      if (signIndex >= 0 && Math.abs(x - signAt) < 640) {
        const sign = this.signs[signIndex];
        const sw = sign.width / (sign.height / 34);
        const bob = Math.sin(time * 4 + i) * 3 - jump * 0.5;
        ctx.fillStyle = "#5a4630";
        ctx.fillRect(x - 2, y - 40 + bob, 4, 50);
        ctx.drawImage(sign, x - sw / 2, y - 74 + bob, sw, 34);
      }
    }
    ctx.imageSmoothingEnabled = true;
  }

  private drawSmoke(ctx: CanvasRenderingContext2D, time: number, truckX: number, back: boolean) {
    if (!this.puff.length) return;
    // Sinalizadores: acesos na chegada do trio, no estouro e no final.
    const starts = [this.beats.avenue.start + 1, this.timeline.burstAt, this.beats.finale.start];
    const count = this.options.performance ? 2 : 4;
    const puffs = this.options.performance ? 5 : 8;
    for (const [s, start] of starts.entries()) {
      const age = time - start;
      if (age < 0 || age > 9) continue;
      const fade = Math.min(1, age * 2) * Math.max(0, Math.min(1, (9 - age) / 2));
      for (let f = 0; f < count; f += 1) {
        const isBack = f % 2 === 0;
        if (isBack !== back) continue;
        const baseX = this.truckX(start) + (hash(s, f) - 0.3) * 900;
        const baseY = isBack ? BACK_FEET - 40 : FRONT_FEET - 140;
        const sprite = this.puff[(s + f) % this.puff.length];
        // A tocha acesa (vermelha) e a fumaça subindo em ciclos.
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#ffdcc8";
        ctx.fillRect(baseX - 2, baseY - 4, 5, 8);
        for (let p = 0; p < puffs; p += 1) {
          const cycle = 3.2;
          const local = (age + (p / puffs) * cycle) % cycle;
          const u = local / cycle;
          const size = lerp(30, 170, u) * (isBack ? 0.8 : 1.1);
          const px = baseX + Math.sin(local * 1.3 + p) * 12 + u * 60 - (truckX - this.truckX(start)) * 0.02;
          const py = baseY - u * (isBack ? 150 : 220);
          ctx.globalAlpha = fade * (1 - u) * 0.85;
          ctx.drawImage(sprite, px - size / 2, py - size / 2, size, size);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawTruck(ctx: CanvasRenderingContext2D, time: number, truckX: number, pulse: number, excitement: number) {
    const truck = this.truck;
    if (!truck) return;
    const ground = TRUCK_GROUND;
    // Suspensão balançando com o grave.
    const sway = Math.sin(time * 2.1) * 1.2 + pulse * 1.5;
    const x0 = truckX;
    const y0 = ground + sway * 0.4;
    const deckY = y0 - DECK;
    const night = this.input.timeOfDay !== "day";
    // Fachos de luz saindo da treliça (tarde e noite).
    if (night) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i += 1) {
        const sx = x0 - 240 + i * 160;
        const sy = deckY - 220;
        const angle = -Math.PI / 2 + Math.sin(time * (0.7 + i * 0.23) + i * 1.7) * 0.75;
        const length = 900;
        const ex = sx + Math.cos(angle) * length;
        const ey = sy + Math.sin(angle) * length;
        const gradient = ctx.createLinearGradient(sx, sy, ex, ey);
        const color = i % 2 === 0 ? brighten(this.colors[0]) : brighten(this.colors[1]);
        const [r, g, b] = rgbOf(color);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${0.3 + pulse * 0.2})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const spread = 0.09;
        ctx.lineTo(sx + Math.cos(angle - spread) * length, sy + Math.sin(angle - spread) * length);
        ctx.lineTo(sx + Math.cos(angle + spread) * length, sy + Math.sin(angle + spread) * length);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    // Sombra no asfalto.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x0, ground + 2, 340, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    const top = -(DECK + 230);
    ctx.drawImage(truck.canvas, x0 - 330, y0 + top, 660, DECK + 234);
    // Rodas girando.
    const spin = this.truckX(time) / 34;
    for (const wx of [-240, -170, 120, 190, 280]) {
      const cx = x0 + wx;
      const cy = ground - 30;
      ctx.fillStyle = "#121216";
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8b8f99";
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4b4f59";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let s = 0; s < 3; s += 1) {
        const a = spin + (s * Math.PI * 2) / 3;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
      }
      ctx.stroke();
    }
    // Woofers grandes pulsando no grave.
    for (let col = 0; col < 13; col += 2) {
      for (let row = 1; row < 4; row += 2) {
        const cx = x0 - 280 + col * 40;
        const cy = deckY + 60 + row * 44;
        ctx.fillStyle = "#26272e";
        ctx.beginPath();
        ctx.arc(cx, cy, 10 + pulse * 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3d3f48";
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5 + pulse * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Faixa de LED correndo no alto do paredão.
    const chase = Math.floor(time * 14);
    for (let i = 0; i < 26; i += 1) {
      const on = (i + chase) % 6 < 3;
      ctx.fillStyle = on ? (i % 2 ? brighten(this.colors[0]) : brighten(this.colors[1])) : "#1c1d24";
      ctx.fillRect(x0 - 300 + i * 20, deckY + 28, 14, 5);
    }
    // Equipe dançando no deck.
    this.drawTeam(ctx, time, x0, deckY, pulse, excitement);
    // Parapeito de vidro e o painel de LED com o texto rolando.
    ctx.fillStyle = "rgba(200, 230, 255, 0.18)";
    ctx.fillRect(x0 - 316, deckY - 42, 632, 42);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(x0 - 316, deckY - 44, 632, 3);
    const led = this.led;
    if (led) {
      const panelX = x0 - 300;
      const panelW = 520;
      const ledW = led.width / 2;
      const offset = (time * 70) % ledW;
      ctx.save();
      ctx.beginPath();
      ctx.rect(panelX, deckY + 4, panelW, 22);
      ctx.clip();
      ctx.fillStyle = "#07070c";
      ctx.fillRect(panelX, deckY + 4, panelW, 22);
      for (let x = panelX - offset; x < panelX + panelW; x += ledW) ctx.drawImage(led, x, deckY + 4, ledW, 22);
      ctx.restore();
    }
    // Lâmpadas da treliça piscando no tempo.
    for (let i = 0; i < 16; i += 1) {
      const on = (i + Math.floor(time * 4.27)) % 3 === 0 || pulse > 0.85;
      ctx.fillStyle = on ? (i % 2 ? "#fff3c4" : brighten(this.colors[1])) : "#4a4c55";
      ctx.fillRect(x0 - 290 + i * 38, deckY - 214, 8, 6);
    }
  }

  private drawTeam(ctx: CanvasRenderingContext2D, time: number, x0: number, deckY: number, pulse: number, excitement: number) {
    const [primary, secondary] = this.colors;
    const lift = this.timeline.trophyLiftAt;
    const lifted = easeOut((time - lift) / 0.7);
    const reduced = this.options.reducedMotion ? 0.4 : 1;
    // Companheiros espalhados pelo deck; o jogador na frente, no meio.
    const spots = [-250, -195, -140, -82, -25, 30, 82, 122];
    const draw = (x: number, index: number, bust: HTMLCanvasElement | null, scale: number, player: boolean) => {
      const energy = (player ? 0.5 : 0.65 + 0.35 * excitement) * reduced;
      const bounce = this.hop(time, index, 17, energy) * 8 * scale;
      const y = deckY - bounce;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      const skin = SKIN_COLORS[this.input.teammates[index - 1]?.appearance.skin ?? this.input.player.appearance.skin] ?? "#c98a64";
      // Braços: para cima no tempo; o jogador ergue a taça.
      const armsUp = player ? lifted > 0 : Math.floor(time * 2.13 + index) % 2 === 0 || excitement > 0.95;
      const wave = Math.sin(time * 8 + index) * 0.3;
      const arms = () => {
        ctx.lineCap = "round";
        ctx.lineWidth = 7;
        for (const side of [-1, 1]) {
          const angle = armsUp
            ? (player ? -Math.PI / 2 - side * lerp(0.9, 0.2, lifted) : -Math.PI / 2 - side * (0.45 + wave))
            : Math.PI / 2 - side * 0.25;
          const sx = side * (player && armsUp ? 17 : 14);
          const sy = -58;
          ctx.strokeStyle = primary;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(angle) * 10, sy + Math.sin(angle) * 10);
          ctx.stroke();
          ctx.strokeStyle = skin;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(angle) * 10, sy + Math.sin(angle) * 10);
          // Esticado até a base da taça, acima da cabeça.
          const reach = player ? lerp(30, 66, lifted) : 30;
          ctx.lineTo(sx + Math.cos(angle) * reach, sy + Math.sin(angle) * reach);
          ctx.stroke();
        }
      };
      // Quem ergue a taça tem os braços na frente do rosto; os outros, atrás.
      const armsInFront = player && lifted > 0;
      if (!armsInFront) arms();
      ctx.fillStyle = primary;
      ctx.fillRect(-15, -62, 30, 52);
      ctx.fillStyle = secondary;
      ctx.fillRect(-15, -62, 30, 4);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-15, -14, 30, 14);
      if (bust) ctx.drawImage(bust, -24, -104, 48, 48);
      if (armsInFront) arms();
      ctx.restore();
      return y;
    };
    for (let i = 0; i < Math.min(spots.length, this.busts.length - 1); i += 1) draw(x0 + spots[i], i + 1, this.busts[i + 1], 1, false);
    const px = x0 + 170;
    const playerBust = time >= lift ? this.playerSmile : this.busts[0];
    // Brilho dourado atrás do jogador quando a taça sobe.
    if (lifted > 0 && this.glow) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 * lifted * (0.8 + 0.2 * pulse);
      ctx.drawImage(this.glow, px - 120, deckY - 250, 240, 240);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    const playerY = draw(px, 0, playerBust ?? null, 1.18, true);
    // A taça: no peito antes, no alto depois (pula junto com o jogador).
    const trophy = this.trophy;
    if (trophy && time >= this.beats.deck.start) {
      const scale = 0.62;
      const tw = trophy.w * scale;
      const th = trophy.h * scale;
      const raise = lerp(-40, -150, lifted);
      ctx.drawImage(trophy.canvas, px - tw / 2, playerY + raise - th + 20, tw, th);
      if (lifted > 0) {
        // Brilhos na taça.
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 4; i += 1) {
          const phase = (time * 1.7 + i * 0.37) % 1;
          if (phase > 0.4) continue;
          const sx = px + (hash(i, 101) - 0.5) * 30;
          const sy = playerY + raise - th * (0.3 + hash(i, 102) * 0.6) + 20;
          const r = 10 * Math.sin((phase / 0.4) * Math.PI);
          ctx.fillStyle = "rgba(255, 250, 220, 0.9)";
          ctx.fillRect(sx - r, sy - 0.8, r * 2, 1.6);
          ctx.fillRect(sx - 0.8, sy - r, 1.6, r * 2);
        }
        ctx.globalCompositeOperation = "source-over";
      }
    }
  }

  private drawConfetti(ctx: CanvasRenderingContext2D, time: number, cam: Cam, left: number, right: number, front: boolean) {
    const age = time - this.timeline.burstAt;
    if (age < 0) return;
    const total = this.options.performance ? 130 : 300;
    const palette = [brighten(this.colors[0]), brighten(this.colors[1]), "#ffffff", "#ffd54a", "#ff5fa2"];
    const burstX = this.truckX(this.timeline.burstAt);
    const deckY = TRUCK_GROUND - DECK;
    const viewTop = cam.y - (this.height / 2) / (this.k * cam.s);
    const span = right - left;
    for (let c = 0; c < palette.length; c += 1) {
      ctx.fillStyle = palette[c];
      for (let i = c; i < total; i += palette.length) {
        // Metade na frente do trio, metade atrás.
        if ((i % 2 === 0) !== front) continue;
        const delay = hash(i, 111) * 0.5;
        const t = age - delay;
        if (t < 0) continue;
        const life = 4.5 + hash(i, 112) * 2;
        const cycle = Math.floor(t / life);
        const local = t - cycle * life;
        let x: number;
        let y: number;
        if (cycle === 0) {
          // Disparo dos canhões do trio: sobe, abre e cai flutuando.
          const angle = -Math.PI / 2 + (hash(i, 113) - 0.5) * 2.2;
          const power = 260 + hash(i, 114) * 260;
          const out = 1 - Math.exp(-local * 3);
          x = burstX + (hash(i, 115) - 0.5) * 500 + Math.cos(angle) * power * out;
          y = deckY - 200 + Math.sin(angle) * power * out + local * 60;
        } else {
          // Depois, chuva contínua cobrindo a tela inteira.
          x = left + ((hash(i, 116 + cycle) * span + local * 20) % span);
          y = viewTop - 30 + local * (70 + hash(i, 117) * 40);
        }
        x += Math.sin(local * (2 + hash(i, 118) * 3) + i) * 16;
        if (x < left - 20 || x > right + 20) continue;
        const spin = Math.cos(local * (5 + hash(i, 119) * 6) + i);
        const w = 7 * Math.abs(spin) + 1.2;
        ctx.fillRect(x - w / 2, y, w, front ? 6 : 4.5);
      }
    }
  }
}

function brighten(hex: string) {
  const [r, g, b] = rgbOf(hex);
  const max = Math.max(r, g, b);
  // Cores muito escuras (preto do Uruguai, azul-marinho) somem no céu: clareia.
  if (max >= 150) return hex;
  const k = max === 0 ? 1 : 150 / max;
  return toHex([r * k + 30, g * k + 30, b * k + 30]);
}

function contrastInk(hex: string) {
  const [r, g, b] = rgbOf(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#161616" : "#ffffff";
}

function mixCam(from: Cam, to: Cam, k: number): Cam {
  // Zoom em escala logarítmica: a aproximação parece lente, não salto.
  return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), s: Math.exp(lerp(Math.log(from.s), Math.log(to.s), k)) };
}

// ------------------------------------------------------------ React

export type ParadeCutscene2DProps = {
  timeline: ParadeTimeline;
  /** Tempo do roteiro (s): a cena se redesenha quando muda. */
  time: number;
  reducedMotion?: boolean;
  performance?: boolean;
  className?: string;
};

/**
 * A versão 2D como componente solto (prévias, testes). A cutscene usa a classe
 * `Parade2DStage` direto, no mesmo relógio do palco 3D, sem re-render por quadro.
 */
export default function ParadeCutscene2D({ timeline, time, reducedMotion = false, performance = false, className }: ParadeCutscene2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Parade2DStage | null>(null);
  const timeRef = useRef(time);

  useEffect(() => {
    timeRef.current = time;
    stageRef.current?.setBeat(paradeBeatPulse(time));
    stageRef.current?.render(time, 0);
  }, [time]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new Parade2DStage(canvas, timeline, { performance, reducedMotion });
    stageRef.current = stage;
    void stage.prepare().then(() => {
      if (stageRef.current === stage) stage.render(timeRef.current, 0);
    });
    return () => {
      stage.dispose();
      if (stageRef.current === stage) stageRef.current = null;
    };
  }, [timeline, performance, reducedMotion]);

  return <canvas ref={canvasRef} className={className} style={{ display: "block", width: "100%", height: "100%" }} aria-hidden="true" />;
}

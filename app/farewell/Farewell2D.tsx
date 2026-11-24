"use client";

// Versão 2D da despedida (sem WebGL, 3D desligado ou o 3D não ficou pronto):
// o mesmo roteiro num canvas só. Tudo o que não se mexe (céu, refletores,
// arquibancada com milhares de torcedores, gramado, mosaico) é pintado uma
// vez em canvas de fundo; por quadro só entram o que anima: luzes de celular,
// flashes, a placa de LED rolando, o mosaico virando, os bonecos e o papel.

import { memo, useEffect, useRef } from "react";
import { drawPlayerBust, type PlayerAppearance } from "../player-appearance";
import { FAREWELL_MARKS, crowdLevel, seededRandom, type FarewellTimeline } from "./farewell-script";
import styles from "./farewell.module.css";

export type Farewell2DStage = { render(time: number, dt: number): void; dispose(): void };

const W = 1600;
const H = 900;
const M = FAREWELL_MARKS;
const STAND_TOP = 150;
const STAND_BOTTOM = 468;
const PITCH_TOP = 492;
const CENTER = { x: 800, y: 650 };
const TUNNEL = { x: 1430, y: 560 };

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth01 = (value: number) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const mix = (from: number, to: number, k: number) => from + (to - from) * k;
const progress = (time: number, from: number, to: number) => clamp01((time - from) / Math.max(0.01, to - from));

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.round(width));
  element.height = Math.max(1, Math.round(height));
  return element;
}

function shade(hex: string, amount: number) {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * (1 + amount))));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

/** Escala por profundidade: quem está mais perto da arquibancada fica menor. */
const depth = (y: number) => mix(0.62, 1.18, clamp01((y - PITCH_TOP) / (H - PITCH_TOP)));

// ----------------------------------------------------------- fundo fixo

function paintBackdrop(timeline: FarewellTimeline, random: () => number) {
  const { club } = timeline.input;
  const layer = canvas(W, H);
  const ctx = layer.getContext("2d")!;
  // Céu de noite com a névoa iluminada dos refletores.
  const sky = ctx.createLinearGradient(0, 0, 0, STAND_TOP + 40);
  sky.addColorStop(0, "#04060d");
  sky.addColorStop(1, "#0d1526");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, STAND_TOP + 40);
  for (const x of [170, 560, 1040, 1430]) {
    const glow = ctx.createRadialGradient(x, 70, 4, x, 70, 260);
    glow.addColorStop(0, "rgba(255,248,226,0.9)");
    glow.addColorStop(0.08, "rgba(255,244,214,0.45)");
    glow.addColorStop(1, "rgba(160,190,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 280, 0, 560, 360);
    ctx.fillStyle = "#fffbea";
    for (let row = 0; row < 3; row += 1) for (let col = 0; col < 6; col += 1) ctx.fillRect(x - 33 + col * 11, 60 + row * 8, 8, 5);
  }
  // Cobertura da arquibancada.
  ctx.fillStyle = "#0a0e16";
  ctx.beginPath();
  ctx.moveTo(-40, STAND_TOP - 10);
  ctx.quadraticCurveTo(W / 2, STAND_TOP - 46, W + 40, STAND_TOP - 10);
  ctx.lineTo(W + 40, STAND_TOP + 4);
  ctx.quadraticCurveTo(W / 2, STAND_TOP - 30, -40, STAND_TOP + 4);
  ctx.closePath();
  ctx.fill();
  // Arquibancada: degraus escuros e milhares de torcedores nas cores do clube.
  const standGradient = ctx.createLinearGradient(0, STAND_TOP, 0, STAND_BOTTOM);
  standGradient.addColorStop(0, "#111722");
  standGradient.addColorStop(1, "#1a2230");
  ctx.fillStyle = standGradient;
  ctx.fillRect(0, STAND_TOP - 10, W, STAND_BOTTOM - STAND_TOP + 10);
  const palette = [club.primary, club.primary, club.secondary, "#f1f1ee", shade(club.primary, -0.35), "#2a3242"];
  const rows = 30;
  for (let row = 0; row < rows; row += 1) {
    const k = row / (rows - 1);
    const y = mix(STAND_TOP + 6, STAND_BOTTOM - 10, k) - Math.sin((row / rows) * Math.PI) * 2;
    const size = mix(3.2, 6.4, k);
    const step = size * 1.55;
    const bend = (x: number) => Math.pow((x - W / 2) / (W / 2), 2) * mix(22, 8, k);
    for (let x = -10 + random() * step; x < W + 10; x += step * (0.85 + random() * 0.3)) {
      ctx.fillStyle = palette[Math.floor(random() * palette.length)];
      const yy = y - bend(x);
      ctx.fillRect(x, yy, size, size * 1.25);
      ctx.fillStyle = "rgba(240,205,170,0.55)";
      ctx.fillRect(x + size * 0.2, yy - size * 0.55, size * 0.6, size * 0.55);
    }
  }
  // Mureta e placa de LED (a placa anima por cima).
  ctx.fillStyle = "#06080c";
  ctx.fillRect(0, STAND_BOTTOM - 2, W, PITCH_TOP - STAND_BOTTOM + 4);
  // Gramado em perspectiva com faixas de corte.
  const stripes = 12;
  for (let index = 0; index < stripes; index += 1) {
    const a = index / stripes;
    const b = (index + 1) / stripes;
    const ya = mix(PITCH_TOP, H, Math.pow(a, 1.35));
    const yb = mix(PITCH_TOP, H, Math.pow(b, 1.35));
    ctx.fillStyle = index % 2 ? "#1d6b32" : "#227a39";
    ctx.fillRect(0, ya, W, yb - ya + 1);
  }
  const vignette = ctx.createLinearGradient(0, PITCH_TOP, 0, H);
  vignette.addColorStop(0, "rgba(4,10,6,0.35)");
  vignette.addColorStop(1, "rgba(4,10,6,0)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, PITCH_TOP, W, H - PITCH_TOP);
  // Linhas: lateral, meio-campo e o círculo central achatado.
  ctx.strokeStyle = "rgba(240,248,236,0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-20, PITCH_TOP + 22);
  ctx.lineTo(W + 20, PITCH_TOP + 22);
  ctx.moveTo(CENTER.x - 40, PITCH_TOP + 22);
  ctx.lineTo(CENTER.x - 160, H + 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(CENTER.x - 70, CENTER.y + 10, 230, 64, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(240,248,236,0.9)";
  ctx.beginPath();
  ctx.ellipse(CENTER.x - 70, CENTER.y + 10, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Túnel na lateral direita.
  ctx.fillStyle = club.primary;
  ctx.fillRect(TUNNEL.x - 60, TUNNEL.y - 92, 120, 14);
  ctx.fillRect(TUNNEL.x - 60, TUNNEL.y - 92, 14, 92);
  ctx.fillRect(TUNNEL.x + 46, TUNNEL.y - 92, 14, 92);
  ctx.fillStyle = "#020304";
  ctx.fillRect(TUNNEL.x - 46, TUNNEL.y - 78, 92, 78);
  return layer;
}

/** O mosaico da arquibancada: o número e o nome em placas de cor (ficam do tamanho do bloco). */
function paintMosaic(timeline: FarewellTimeline) {
  const { club, player } = timeline.input;
  const cols = 104;
  const rows = 30;
  const small = canvas(cols, rows);
  const ctx = small.getContext("2d")!;
  ctx.fillStyle = club.primary;
  ctx.fillRect(0, 0, cols, rows);
  ctx.fillStyle = club.secondary === club.primary ? "#ffffff" : club.secondary;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 26px Impact, 'Arial Narrow', sans-serif";
  ctx.fillText(String(player.number), 17, rows / 2 + 1);
  ctx.font = "900 12px Impact, 'Arial Narrow', sans-serif";
  const name = (player.shortName || player.name).toLocaleUpperCase("pt-BR").slice(0, 11);
  ctx.fillText("OBRIGADO", 68, 8.5);
  ctx.fillText(name, 68, 22);
  // Quantiza (cada pixel vira uma plaquinha, com o cartão de cor chapada: nada de meio-tom).
  const block = 6;
  const out = canvas(cols * block, rows * block);
  const target = out.getContext("2d")!;
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const ink = ctx.fillStyle as string;
  const hex = (value: string) => {
    const parsed = Number.parseInt(value.replace("#", "").slice(0, 6), 16) || 0;
    return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
  };
  const back = hex(club.primary);
  const front = hex(ink.startsWith("#") ? ink : "#ffffff");
  target.fillStyle = "#0b0f16";
  target.fillRect(0, 0, out.width, out.height);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = (y * cols + x) * 4;
      // Cada torcedor levanta um cartão de uma cor só: a mais próxima entre fundo e letra.
      const distanceBack = Math.abs(data[index] - back[0]) + Math.abs(data[index + 1] - back[1]) + Math.abs(data[index + 2] - back[2]);
      const distanceFront = Math.abs(data[index] - front[0]) + Math.abs(data[index + 1] - front[1]) + Math.abs(data[index + 2] - front[2]);
      target.fillStyle = distanceFront < distanceBack ? `rgb(${front.join(",")})` : club.primary;
      target.fillRect(x * block, y * block, block - 1, block - 1);
    }
  }
  return out;
}

/** Faixa da placa de LED (repete para rolar sem emenda). */
function paintBoard(text: string, color: string) {
  const strip = canvas(1400, 24);
  const ctx = strip.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, strip.width, strip.height);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let x = 0; x < strip.width; x += 3) ctx.fillRect(x, 0, 1, strip.height);
  ctx.font = "900 17px Impact, 'Arial Narrow', sans-serif";
  ctx.textBaseline = "middle";
  const value = Number.parseInt(color.replace("#", "").slice(0, 6), 16) || 0;
  const light = ((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114 > 150;
  ctx.fillStyle = light ? "#0b0f14" : "#ffffff";
  const width = ctx.measureText(`${text}     `).width;
  for (let x = 10; x < strip.width + width; x += width) ctx.fillText(text, x, 13);
  return strip;
}

function paintBust(appearance: PlayerAppearance, primary: string, secondary: string, radius: number) {
  const size = Math.ceil(radius * 2.4);
  const layer = canvas(size, size);
  const ctx = layer.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, size / 2, size / 2);
  drawPlayerBust(ctx, appearance, primary, secondary, radius, 4, { cutout: true });
  return layer;
}

// ------------------------------------------------------------- bonecos

type Pose = { walk: number; clap: number; wave: number; heart: number; sky: number; facing: 1 | -1 };

/** Boneco de pé (pernas, calção, camisa com número, braços) com a cabeça do álbum. */
function drawFigure(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, bust: HTMLCanvasElement, primary: string, secondary: string, number: number, pose: Pose) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Sombra no gramado.
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const stride = Math.sin(pose.walk) * 9;
  // Pernas e chuteiras.
  ctx.strokeStyle = "#e9c9a6";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, -38);
  ctx.lineTo(-6 + stride, -4);
  ctx.moveTo(6, -38);
  ctx.lineTo(6 - stride, -4);
  ctx.stroke();
  ctx.strokeStyle = secondary;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-6 + stride * 0.55, -22);
  ctx.lineTo(-6 + stride * 0.85, -9);
  ctx.moveTo(6 - stride * 0.55, -22);
  ctx.lineTo(6 - stride * 0.85, -9);
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.fillRect(-11 + stride, -6, 11, 6);
  ctx.fillRect(1 - stride, -6, 11, 6);
  // Calção.
  ctx.fillStyle = shade(secondary, -0.05);
  ctx.fillRect(-15, -50, 30, 16);
  // Camisa.
  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.moveTo(-17, -88);
  ctx.lineTo(17, -88);
  ctx.lineTo(16, -48);
  ctx.lineTo(-16, -48);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = secondary;
  ctx.font = "900 17px Impact, 'Arial Narrow', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), 0, -67);
  // Braços: palmas, aceno, mão no peito ou apontando o céu.
  ctx.strokeStyle = primary;
  ctx.lineWidth = 8;
  const arm = (side: number, hx: number, hy: number) => {
    ctx.beginPath();
    ctx.moveTo(side * 16, -84);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = "#e9c9a6";
    ctx.beginPath();
    ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  };
  if (pose.sky > 0) {
    arm(1, 14 + 6 * pose.sky, mix(-60, -132, pose.sky));
    arm(-1, -12, -54);
  } else if (pose.wave > 0) {
    arm(1, 30 + Math.sin(pose.wave * 9) * 8, -118);
    arm(-1, -16, -54);
  } else if (pose.heart > 0) {
    arm(-1, mix(-18, -6, pose.heart), mix(-54, -78, pose.heart));
    arm(1, 16, -54);
  } else if (pose.clap > 0) {
    const open = 4 + Math.abs(Math.sin(pose.clap * 11)) * 9;
    arm(-1, -open, -72);
    arm(1, open, -72);
  } else {
    arm(-1, -18 - Math.sin(pose.walk) * 5, -54);
    arm(1, 18 + Math.sin(pose.walk) * 5, -54);
  }
  // Cabeça do álbum por cima.
  const size = 52;
  ctx.drawImage(bust, -size / 2, -88 - size * 0.86, size, size);
  ctx.restore();
}

// ---------------------------------------------------------------- cena

type Twinkle = { x: number; y: number; phase: number; speed: number; from: number };
type Paper = { x: number; y: number; fall: number; sway: number; phase: number; color: string; start: number; spin: number };

function Farewell2D({ timeline, reducedMotion, onStage }: { timeline: FarewellTimeline; reducedMotion: boolean; onStage: (stage: Farewell2DStage | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = ref.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const { input } = timeline;
    const { club, player } = input;
    const random = seededRandom(timeline.seed ^ 0x2d2d);
    const backdrop = paintBackdrop(timeline, random);
    const mosaic = paintMosaic(timeline);
    const board = paintBoard(timeline.board, club.primary);
    const kit = { ...player.appearance, kitPattern: timeline.kitPattern };
    const hero = paintBust(kit, club.primary, club.secondary, 26);
    const heroLarge = paintBust(kit, club.primary, club.secondary, 150);
    const mates = input.teammates.slice(0, 8).map((mate) => ({ bust: paintBust({ ...mate.appearance, kitPattern: timeline.kitPattern }, club.primary, club.secondary, 26), number: mate.number }));
    const twinkles: Twinkle[] = Array.from({ length: reducedMotion ? 90 : 240 }, () => ({
      x: random() * W,
      y: mix(STAND_TOP + 10, STAND_BOTTOM - 16, random()),
      phase: random() * Math.PI * 2,
      speed: 0.6 + random() * 2.2,
      from: M.heart + random() * 2.5,
    }));
    const papers: Paper[] = Array.from({ length: reducedMotion ? 70 : 180 }, (_, index) => ({
      x: random() * W,
      y: -40 - random() * 500,
      fall: 70 + random() * 60,
      sway: 10 + random() * 18,
      phase: random() * Math.PI * 2,
      color: [club.primary, club.secondary, "#ffffff"][index % 3],
      start: random() * 2.5,
      spin: 2 + random() * 5,
    }));
    const flashes = Array.from({ length: 70 }, () => ({ x: random() * W, y: mix(STAND_TOP + 10, STAND_BOTTOM - 10, random()), at: random() }));
    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const w = element.clientWidth || 1;
      const h = element.clientHeight || 1;
      if (w === width && h === height) return;
      width = w;
      height = h;
      element.width = Math.round(w * ratio);
      element.height = Math.round(h * ratio);
    };

    /** Câmera 2D: centro do quadro (mundo) e zoom, por plano. */
    const camera = (time: number) => {
      const duration = timeline.duration;
      if (time < M.walkStart + 0.9) {
        const u = smooth01(progress(time, 0, M.walkStart + 0.9));
        return { x: mix(800, 1180, u), y: mix(430, 560, u), zoom: mix(1, 1.45, u) };
      }
      if (time < M.heart - 0.2) {
        const walker = walkerAt(time);
        return { x: walker.x - 60, y: 560, zoom: 1.7 };
      }
      if (time < M.wave) return { x: 800, y: 470, zoom: 1.05 };
      if (time < M.sky + 0.6) {
        const u = smooth01(progress(time, M.wave, M.sky + 0.6));
        return { x: mix(CENTER.x, 800, u), y: mix(560, 470, u), zoom: mix(1.6, 1.15, u) };
      }
      const u = smooth01(progress(time, M.sky + 0.6, duration));
      return { x: 800, y: mix(470, 440, u), zoom: mix(1.15, 0.98, u) };
    };

    const walkerAt = (time: number) => {
      const k = smooth01(progress(time, M.walkStart, M.walkEnd));
      return { x: mix(TUNNEL.x, CENTER.x, k), y: mix(TUNNEL.y + 6, CENTER.y, k), walking: time > M.walkStart && time < M.walkEnd };
    };

    const render = (time: number) => {
      resize();
      const ratio = element.width / Math.max(1, width);
      const view = camera(time);
      const base = Math.max(width / W, height / H);
      const scale = base * view.zoom;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = "#04060d";
      ctx.fillRect(0, 0, width, height);
      ctx.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * (width / 2 - view.x * scale), ratio * (height / 2 - view.y * scale));
      ctx.drawImage(backdrop, 0, 0);

      const level = crowdLevel(time);
      // Mosaico: as placas viram de baixo para cima quando ele põe a mão no peito.
      const reveal = smooth01(progress(time, M.roar - 0.4, M.roar + 1.4));
      if (reveal > 0) {
        const mw = mosaic.width * 0.92;
        const mh = mosaic.height * 0.92;
        const mx = W / 2 - mw / 2;
        const my = STAND_TOP + 30;
        ctx.save();
        ctx.beginPath();
        ctx.rect(mx, my + mh * (1 - reveal), mw, mh * reveal);
        ctx.clip();
        ctx.drawImage(mosaic, mx, my, mw, mh);
        ctx.restore();
      }
      // A ola: uma faixa de luz correndo a arquibancada.
      if (!reducedMotion && time < 7) {
        const waveX = ((time - 0.3) / 6.5) * (W + 400) - 200;
        const glow = ctx.createLinearGradient(waveX - 120, 0, waveX + 120, 0);
        glow.addColorStop(0, "rgba(255,255,255,0)");
        glow.addColorStop(0.5, "rgba(255,255,255,0.18)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(waveX - 120, STAND_TOP, 240, STAND_BOTTOM - STAND_TOP);
      }
      // Luzes de celular acendendo pela arquibancada.
      for (const item of twinkles) {
        if (time < item.from) continue;
        const on = Math.min(1, (time - item.from) / 0.8);
        const flicker = reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(time * item.speed + item.phase);
        ctx.fillStyle = `rgba(255,252,236,${(0.75 * on * flicker).toFixed(3)})`;
        ctx.fillRect(item.x, item.y, 2.6, 2.6);
      }
      // Flashes das câmeras na explosão e no "Obrigado".
      if (!reducedMotion) {
        for (const burst of [M.roar, M.kiss + 0.35, M.sky]) {
          const age = time - burst;
          if (age < 0 || age > 3.4) continue;
          for (const flash of flashes) {
            const local = age - flash.at * 3;
            if (local < 0 || local > 0.18) continue;
            const alpha = 1 - local / 0.18;
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(flash.x, flash.y, 3 + 5 * alpha, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // Placa de LED rolando; pisca na explosão e no fim.
      const scroll = (time * (time > M.roar ? 90 : 40)) % (board.width / 2);
      const blink = reducedMotion ? 1 : [M.roar, M.sky].some((at) => time >= at && time < at + 1.2 && Math.sin((time - at) * Math.PI * 5) < 0) ? 0.55 : 1;
      ctx.globalAlpha = blink;
      for (let x = -scroll; x < W; x += board.width / 2) ctx.drawImage(board, 0, 0, board.width / 2, board.height, x, STAND_BOTTOM + 2, board.width / 2, PITCH_TOP - STAND_BOTTOM - 4);
      ctx.globalAlpha = 1;

      // Corredor e a lenda (do fundo para a frente).
      const walker = walkerAt(time);
      const after = time >= M.walkEnd;
      const actors: Array<{ x: number; y: number; draw: () => void }> = [];
      mates.forEach((mate, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const slot = Math.floor(index / 2);
        const from = { x: mix(1320, 960, slot / 3), y: TUNNEL.y + 10 + side * 34 };
        const arc = (index / Math.max(1, mates.length - 1) - 0.5) * 2.2;
        const to = { x: CENTER.x + 70 + Math.cos(arc) * 150, y: CENTER.y - 40 + Math.sin(arc) * 36 };
        const k = smooth01(progress(time, M.walkEnd - 0.4 + slot * 0.1, M.walkEnd + 2));
        const x = mix(from.x, to.x, k);
        const y = mix(from.y, to.y, k);
        const moving = k > 0 && k < 1;
        actors.push({
          x,
          y,
          draw: () => drawFigure(ctx, x, y, depth(y) * 0.95, mate.bust, club.primary, club.secondary, mate.number, { walk: moving ? time * 11 : 0, clap: moving ? 0 : time + index, wave: 0, heart: 0, sky: time > M.sky + 0.2 && index % 3 === 0 ? 1 : 0, facing: 1 }),
        });
      });
      const heroPose: Pose = {
        walk: walker.walking ? time * 9 : 0,
        clap: after && time > M.kiss + 1 && time < M.wave ? time : 0,
        wave: time >= M.wave && time < M.sky ? time : 0,
        heart: time >= M.heart && time < M.kiss ? smooth01(progress(time, M.heart, M.heart + 0.5)) : 0,
        sky: time >= M.sky ? smooth01(progress(time, M.sky, M.sky + 0.6)) : 0,
        facing: 1,
      };
      actors.push({ x: walker.x, y: walker.y, draw: () => drawFigure(ctx, walker.x, walker.y, depth(walker.y) * 1.05, hero, club.primary, club.secondary, player.number, heroPose) });
      actors.sort((a, b) => a.y - b.y);
      for (const actor of actors) actor.draw();

      // Canhão de luz no homenageado.
      const focus = smooth01(progress(time, M.walkEnd - 0.8, M.heart + 0.6));
      if (focus > 0) {
        const light = ctx.createRadialGradient(walker.x, walker.y - 60, 10, walker.x, walker.y - 40, 190);
        light.addColorStop(0, `rgba(255,244,214,${(0.22 * focus).toFixed(3)})`);
        light.addColorStop(1, "rgba(255,244,214,0)");
        ctx.fillStyle = light;
        ctx.fillRect(walker.x - 200, walker.y - 240, 400, 300);
      }

      // Plano fechado: o rosto dele com o estádio desfocado atrás (mão no peito e beijo no escudo).
      const close = time >= M.heart - 0.2 && time < M.wave ? smooth01(progress(time, M.heart - 0.2, M.heart + 0.4)) * (1 - smooth01(progress(time, M.wave - 0.5, M.wave))) : 0;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (close > 0) {
        ctx.fillStyle = `rgba(4,6,13,${(0.55 * close).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        const size = Math.min(width * 0.9, height * 0.78);
        const kiss = time >= M.kiss ? Math.sin(Math.PI * progress(time, M.kiss, M.kiss + 1.1)) : 0;
        const breathe = reducedMotion ? 0 : Math.sin(time * 1.6) * 0.01;
        ctx.globalAlpha = close;
        const cx = width / 2;
        const cy = height * 0.52 + kiss * size * 0.04;
        const s = size * (1 + breathe + kiss * 0.03);
        ctx.drawImage(heroLarge, cx - s / 2, cy - s / 2, s, s);
        ctx.globalAlpha = 1;
      }

      // Papel picado depois do "Obrigado".
      if (time > M.sky + 0.2) {
        const local = time - M.sky - 0.2;
        for (const paper of papers) {
          const age = local - paper.start;
          if (age < 0) continue;
          const y = ((paper.y + age * paper.fall) % (H + 600)) * (height / H);
          const x = (paper.x + Math.sin(paper.phase + age * 2) * paper.sway) * (width / W);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(paper.phase + age * paper.spin);
          ctx.scale(1, Math.cos(age * paper.spin * 1.3));
          ctx.fillStyle = paper.color;
          ctx.fillRect(-4, -2.5, 8, 5);
          ctx.restore();
        }
      }
      // O estádio "respira" com a torcida: leve brilho geral.
      if (level > 0.85 && !reducedMotion) {
        ctx.fillStyle = `rgba(255,236,200,${((level - 0.85) * 0.12).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
      }
    };

    const stage: Farewell2DStage = { render: (time) => render(time), dispose: () => undefined };
    onStage(stage);
    return () => onStage(null);
  }, [timeline, reducedMotion, onStage]);

  return <canvas ref={ref} className={styles.canvas2d} aria-hidden="true" />;
}

export default memo(Farewell2D);

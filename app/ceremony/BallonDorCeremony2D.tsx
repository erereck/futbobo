"use client";

// Versão 2D da gala da Bola de Ouro, para quem joga sem o Modo 3D.
//
// Um teatro em CSS (palco, telão de LED, canhões de luz) com os três
// finalistas em medalhões dourados sobre pedestais, desenhados pelo mesmo
// `drawPlayerBust` do resto do jogo. Tudo aqui é função de `time`: câmera,
// luzes, rostos, troféu e confete saem do relógio do roteiro, então o botão
// "Pular" e o "Rever" deixam a cena exatamente onde o 3D estaria.

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { drawPlayerBust, type PlayerAppearance } from "../player-appearance";
import type { CeremonyBeat, CeremonyFinalist, CeremonyTimeline } from "./ballon-dor-script";
import styles from "./ceremony.module.css";

// ---------------------------------------------------------------- mundo

/** O palco inteiro em unidades do mundo; a câmera escala e move este retângulo. */
const WORLD_W = 1920;
const WORLD_H = 1300;
const SLOT_X = [560, 960, 1360] as const;
const MEDAL_Y = 640;
const MEDAL_R = 170;
const PEDESTAL_TOP = 832;
const PRESENTER = { x: 1700, y: 676, r: 104 };
const TROPHY_STAND_X = 220;
const RIG_Y = -140;
const RIGS = [WORLD_W * 0.3, WORLD_W * 0.7] as const;

type Cam = { x: number; y: number; s: number };
type Lights = { a: number; b: number; ai: number; bi: number; wash: number };
type Shot<T> = { start: number; blend: number; at: (time: number) => T };
type Rect = { x: number; y: number; w: number; h: number };
type View = { width: number; height: number; top: number; bottom: number; portrait: boolean };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
const lerp = (from: number, to: number, k: number) => from + (to - from) * k;

function mixCam(from: Cam, to: Cam, k: number): Cam {
  // Zoom em escala logarítmica: a aproximação parece uma lente, não um salto.
  return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), s: Math.exp(lerp(Math.log(from.s), Math.log(to.s), k)) };
}

function mixLights(from: Lights, to: Lights, k: number): Lights {
  return { a: lerp(from.a, to.a, k), b: lerp(from.b, to.b, k), ai: lerp(from.ai, to.ai, k), bi: lerp(from.bi, to.bi, k), wash: lerp(from.wash, to.wash, k) };
}

/** Lê uma trilha de planos no instante `time`, misturando com o plano anterior durante `blend`. */
function sampleTrack<T>(track: Shot<T>[], time: number, mix: (from: T, to: T, k: number) => T): T {
  let index = 0;
  for (let cursor = 0; cursor < track.length; cursor += 1) {
    if (track[cursor].start <= time) index = cursor;
    else break;
  }
  const evaluate = (at: number): T => {
    const shot = track[at];
    const value = shot.at(time);
    if (at === 0 || shot.blend <= 0 || time >= shot.start + shot.blend) return value;
    return mix(evaluate(at - 1), value, smooth((time - shot.start) / shot.blend));
  };
  return evaluate(index);
}

/** Altura das tarjas de cinema; a mesma conta do `--bar` no CSS. */
export function letterboxHeight(width: number, height: number) {
  return width / Math.max(1, height) < 0.75
    ? Math.max(34, Math.min(60, height * 0.07))
    : Math.max(30, Math.min(84, height * 0.085));
}

function viewFor(width: number, height: number): View {
  const portrait = width / Math.max(1, height) < 0.75;
  const bar = letterboxHeight(width, height);
  // A legenda ocupa o pé da tela: o assunto fica centrado no que sobra acima dela.
  // A conta segue o `clamp` do título no CSS (kicker, título, sub e respiro).
  const title = Math.max(34, Math.min(92, width * 0.062));
  const captionSpace = portrait
    ? Math.max(height * 0.26, height * 0.026 + title * 3.4 + 20)
    : Math.max(height * 0.18, height * 0.026 + title * 1.6 + 24);
  return { width, height, top: bar + 6, bottom: height - bar - captionSpace, portrait };
}

const RECTS = {
  // Close: o medalhão inteiro e o selo de colocação; o pedestal pode ficar sob a legenda.
  slot: (index: number): Rect => ({ x: SLOT_X[index] - 205, y: MEDAL_Y - MEDAL_R - 34, w: 410, h: 2 * MEDAL_R + 78 }),
  // Festa: o medalhão com o troféu erguido logo acima do aro.
  crown: (index: number): Rect => ({ x: SLOT_X[index] - 255, y: MEDAL_Y - MEDAL_R - 200, w: 510, h: 2 * MEDAL_R + 230 }),
  presenter: { x: PRESENTER.x - 185, y: PRESENTER.y - PRESENTER.r - 70, w: 370, h: 2 * PRESENTER.r + 70 + 150 } as Rect,
  wide: { x: 70, y: 30, w: 1780, h: 1030 } as Rect,
  wideTall: { x: SLOT_X[0] - 280, y: 30, w: SLOT_X[2] - SLOT_X[0] + 560, h: 1030 } as Rect,
  trio: { x: SLOT_X[0] - 260, y: MEDAL_Y - MEDAL_R - 90, w: SLOT_X[2] - SLOT_X[0] + 520, h: 560 } as Rect,
  pair: (a: number, b: number): Rect => {
    const left = Math.min(SLOT_X[a], SLOT_X[b]) - 250;
    const right = Math.max(SLOT_X[a], SLOT_X[b]) + 250;
    return { x: left, y: MEDAL_Y - MEDAL_R - 84, w: right - left, h: 560 };
  },
};

function fit(view: View, rect: Rect, fill: number): Cam {
  const available = Math.max(80, view.bottom - view.top);
  const s = Math.min((view.width * fill) / rect.w, (available * fill) / rect.h);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, s };
}

/** Câmera parada que empurra devagar (dolly-in) ao longo do plano. */
function pushIn(cam: Cam, from: number, to: number, amount: number, drift = 0) {
  return (time: number): Cam => {
    const u = clamp01((time - from) / Math.max(0.01, to - from));
    return { x: cam.x + drift * (u - 0.5), y: cam.y, s: cam.s * (1 + amount * u) };
  };
}

type Plan = {
  shots: Shot<Cam>[];
  lights: Shot<Lights>[];
  wide: Cam;
  index: (id: string) => number;
  beat: (id: CeremonyBeat["id"]) => CeremonyBeat;
};

function buildPlan(timeline: CeremonyTimeline, view: View, reducedMotion: boolean): Plan {
  const finalists = timeline.input.finalists;
  const index = (id: string) => Math.max(0, finalists.findIndex((finalist) => finalist.id === id));
  const beat = (id: CeremonyBeat["id"]) => timeline.beats.find((item) => item.id === id) ?? timeline.beats[0];
  const close = (slot: number) => fit(view, RECTS.slot(slot), 0.92);
  const wide = fit(view, view.portrait ? RECTS.wideTall : RECTS.wide, 0.98);
  const firstIndex = index(timeline.first.id);
  const thirdIndex = index(timeline.third.id);
  const userIndex = index(timeline.user.id);
  const shots: Shot<Cam>[] = [];
  const lights: Shot<Lights>[] = [];
  const spotOn = (x: number, wash: number, second = x): Lights => ({ a: x, b: second, ai: 1, bi: 1, wash });

  // Abertura: a câmera entra por cima da plateia até o palco.
  const establish = beat("establish");
  // Em pé (celular) a plateia já ocupa muita tela: a entrada desce menos.
  const establishFrom: Cam = view.portrait ? { x: wide.x, y: wide.y + 80, s: wide.s * 0.86 } : { x: wide.x, y: wide.y + 190, s: wide.s * 0.78 };
  const establishTo: Cam = { x: wide.x, y: wide.y - 10, s: wide.s * 1.05 };
  shots.push({ start: 0, blend: 0, at: (time) => mixCam(establishFrom, establishTo, smooth(time / establish.end)) });
  lights.push({
    start: 0,
    blend: 0,
    at: (time) => ({ a: 960 + 560 * Math.sin(time * 0.9), b: 960 - 560 * Math.sin(time * 0.9 + 0.6), ai: 0.75, bi: 0.75, wash: 0.55 }),
  });

  // Finalistas: um a um, com a câmera correndo a fila.
  timeline.beats.filter((item) => item.id === "nominee").forEach((item, order) => {
    const slot = item.nominee ?? order;
    shots.push({ start: item.start, blend: order === 0 ? 0.9 : 0.55, at: pushIn(close(slot), item.start, item.end, 0.06, 16) });
    lights.push({ start: item.start, blend: order === 0 ? 0.8 : 0.5, at: () => spotOn(SLOT_X[slot], 0.22) });
  });

  const presenter = beat("presenter");
  shots.push({ start: presenter.start, blend: 0.7, at: pushIn(fit(view, RECTS.presenter, 0.9), presenter.start, presenter.end, 0.05) });
  lights.push({ start: presenter.start, blend: 0.6, at: () => spotOn(PRESENTER.x, 0.28) });

  // Terceiro lugar: os três juntos, a luz procurando, e o corte seco no nome.
  const third = beat("third");
  const remaining = [0, 1, 2].filter((slot) => slot !== thirdIndex);
  shots.push({ start: third.start, blend: 0.9, at: pushIn(fit(view, RECTS.trio, 0.96), third.start, timeline.thirdRevealAt, 0.06) });
  lights.push({
    start: third.start,
    blend: 0.5,
    at: (time) => ({ a: 960 + 420 * Math.sin(time * 3.1), b: 960 - 420 * Math.sin(time * 3.1), ai: 0.95, bi: 0.95, wash: 0.16 }),
  });
  shots.push({ start: timeline.thirdRevealAt, blend: reducedMotion ? 0.6 : 0.32, at: pushIn(close(thirdIndex), timeline.thirdRevealAt, third.end, 0.05) });
  lights.push({ start: timeline.thirdRevealAt, blend: 0.18, at: () => spotOn(SLOT_X[thirdIndex], 0.3) });
  shots.push({ start: timeline.thirdRevealAt + 2, blend: 1.1, at: pushIn(fit(view, RECTS.pair(remaining[0], remaining[1]), 0.95), timeline.thirdRevealAt + 2, third.end, 0.04) });
  lights.push({ start: timeline.thirdRevealAt + 2, blend: 0.9, at: () => ({ a: SLOT_X[remaining[0]], b: SLOT_X[remaining[1]], ai: 1, bi: 1, wash: 0.22 }) });

  // Duelo: cortes secos entre os dois, com um soco de zoom em cada um.
  const duel = beat("duel");
  timeline.duelCuts.forEach((cut, order) => {
    const next = timeline.duelCuts[order + 1]?.at ?? duel.end;
    const base = cut.focus === "presenter" ? fit(view, RECTS.presenter, 0.88) : close(index(cut.focus));
    const punch = reducedMotion ? 0 : 0.12;
    shots.push({
      start: cut.at,
      blend: 0,
      at: (time) => {
        const local = Math.max(0, time - cut.at);
        const kick = 1 + punch * Math.exp(-local * 9);
        return { x: base.x, y: base.y, s: base.s * kick * (1 + 0.05 * clamp01(local / Math.max(0.1, next - cut.at))) };
      },
    });
    const focusX = cut.focus === "presenter" ? PRESENTER.x : SLOT_X[index(cut.focus)];
    lights.push({
      start: cut.at,
      blend: 0.12,
      at: () => cut.focus === "presenter"
        ? { a: SLOT_X[remaining[0]], b: SLOT_X[remaining[1]], ai: 0.7, bi: 0.7, wash: 0.14 }
        : { a: focusX, b: SLOT_X[remaining.find((slot) => SLOT_X[slot] !== focusX) ?? remaining[1]], ai: 1, bi: 0.5, wash: 0.16 },
    });
  });

  // O envelope: os dois no quadro, a luz cruzando entre eles... e o nome.
  const reveal = beat("reveal");
  const pairCam = fit(view, RECTS.pair(remaining[0], remaining[1]), 0.95);
  shots.push({ start: reveal.start, blend: 0.45, at: pushIn(pairCam, reveal.start, timeline.winnerRevealAt, 0.08) });
  const middle = (SLOT_X[remaining[0]] + SLOT_X[remaining[1]]) / 2;
  const half = Math.abs(SLOT_X[remaining[0]] - SLOT_X[remaining[1]]) / 2;
  lights.push({
    start: reveal.start,
    blend: 0.4,
    at: (time) => ({ a: middle + half * Math.sin(time * 4.4), b: middle - half * Math.sin(time * 4.4), ai: 1, bi: 1, wash: 0.1 }),
  });
  shots.push({ start: timeline.winnerRevealAt, blend: reducedMotion ? 0.55 : 0.28, at: pushIn(close(firstIndex), timeline.winnerRevealAt, reveal.end, 0.05) });
  lights.push({ start: timeline.winnerRevealAt, blend: 0.14, at: () => spotOn(SLOT_X[firstIndex], 0.5) });

  // Festa: a câmera abre para caber o troféu erguido.
  const celebrate = beat("celebrate");
  const crown = fit(view, RECTS.crown(firstIndex), 0.9);
  shots.push({ start: celebrate.start, blend: 1.6, at: pushIn(crown, celebrate.start, timeline.trophyLiftAt, 0.03) });
  shots.push({
    start: timeline.trophyLiftAt,
    blend: 1.2,
    at: pushIn({ x: crown.x, y: crown.y - 40, s: crown.s * 1.03 }, timeline.trophyLiftAt, celebrate.end, 0.04),
  });
  lights.push({ start: celebrate.start, blend: 1, at: () => spotOn(SLOT_X[firstIndex], 0.55) });

  // Reação: foto oficial com os três, ou o close de quem perdeu.
  const reaction = beat("reaction");
  if (timeline.userWon) {
    shots.push({ start: reaction.start, blend: 1.4, at: pushIn(fit(view, RECTS.trio, 0.96), reaction.start, reaction.end, 0.03) });
    lights.push({ start: reaction.start, blend: 1, at: () => ({ a: SLOT_X[firstIndex], b: SLOT_X[firstIndex], ai: 1, bi: 0.9, wash: 0.62 }) });
  } else {
    shots.push({ start: reaction.start, blend: 0, at: pushIn(close(userIndex), reaction.start, reaction.end, 0.07) });
    lights.push({ start: reaction.start, blend: 0.6, at: () => ({ a: SLOT_X[firstIndex], b: SLOT_X[userIndex], ai: 1, bi: 0.6, wash: 0.4 }) });
  }

  const end = beat("end");
  shots.push({ start: end.start, blend: 1.8, at: (time) => ({ ...wide, s: wide.s * (1 + 0.012 * Math.sin((time - end.start) * 0.25)) }) });
  lights.push({ start: end.start, blend: 1.2, at: () => ({ a: SLOT_X[firstIndex], b: SLOT_X[firstIndex], ai: 0.9, bi: 0.9, wash: 0.5 }) });

  shots.sort((a, b) => a.start - b.start);
  lights.sort((a, b) => a.start - b.start);
  return { shots, lights, wide, index, beat };
}

// ------------------------------------------------------------- rostos

/** Expressões do `FACE_NAMES`: Sério 0, Confiante 1, Sorriso 2, Concentrado 3, Tranquilo 4, Surpreso 5, Dentes à mostra 6, Sorrisão 9. */
function faceAt(timeline: CeremonyTimeline, finalist: CeremonyFinalist, time: number, thirdStart: number, reactionStart: number) {
  const base = finalist.appearance.face;
  const third = timeline.thirdRevealAt;
  const winner = timeline.winnerRevealAt;
  if (time < thirdStart) return base;
  if (time < third) return 3;
  if (time < third + 0.9) return 5;
  if (finalist.place === 3) {
    if (finalist.isUser) return time < reactionStart ? 0 : 4;
    return time < winner + 0.8 ? 4 : 2;
  }
  if (time < winner) return 3;
  if (time < winner + 0.8) return 5;
  if (finalist.place === 1) return time < timeline.trophyLiftAt ? 9 : time < reactionStart ? 6 : 9;
  if (finalist.isUser) return time < reactionStart ? 0 : 4;
  return time < winner + 2.5 ? 0 : 2;
}

function presenterFaceAt(timeline: CeremonyTimeline, time: number, thirdStart: number, duelStart: number) {
  if (time < thirdStart) return 1;
  if (time < timeline.thirdRevealAt) return 3;
  if (time < duelStart) return 2;
  if (time < timeline.winnerRevealAt) return 3;
  return time < timeline.duration ? 9 : 2;
}

// -------------------------------------------------------- busto no canvas

export function BustCanvas({
  appearance,
  face,
  primary,
  secondary,
  size,
  resolution = 1,
  fluid = false,
  className,
  label,
}: {
  appearance: PlayerAppearance;
  face?: number;
  primary: string;
  secondary: string;
  /** Diâmetro em px de CSS (ou unidades do mundo, dentro do palco). */
  size: number;
  /** Quanto a câmera pode aproximar: o canvas nasce com essa folga de nitidez. */
  resolution?: number;
  /** O CSS decide o tamanho na tela; `size` só define a nitidez. */
  fluid?: boolean;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const density = Math.min(2.6, Math.max(1, (window.devicePixelRatio || 1) * resolution));
    const pixels = Math.round(size * density);
    if (canvas.width !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixels, pixels);
    context.setTransform(density, 0, 0, density, pixels / 2, pixels / 2);
    drawPlayerBust(context, face === undefined ? appearance : { ...appearance, face }, primary, secondary, size / 2 - 0.5);
  }, [appearance, face, primary, secondary, size, resolution]);
  return <canvas ref={ref} className={className} style={fluid ? undefined : { width: size, height: size }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

// ------------------------------------------------------------ cenário fixo

function seededList<T>(count: number, seed: number, make: (random: () => number, index: number) => T): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, (_, index) => make(random, index));
}

/** Poeira dançando nos fachos de luz: só CSS, independe do relógio. */
const DUST = seededList(34, 77, (random) => ({
  left: 300 + random() * 1320,
  top: 60 + random() * 760,
  size: 2 + random() * 4,
  duration: 7 + random() * 9,
  delay: -random() * 14,
  dx: (random() - 0.5) * 120,
  dy: -40 - random() * 90,
}));

/** Confete: os primeiros explodem do vencedor, o resto chove do teto. */
const CONFETTI = seededList(150, 2026, (random, index) => ({
  burst: index < 56,
  x: random(),
  delay: index < 56 ? random() * 0.15 : 0.1 + random() * 3.4,
  vx: (random() - 0.5) * 1.3,
  vy: 0.7 + random() * 0.75,
  fall: 0.16 + random() * 0.22,
  sway: 10 + random() * 34,
  swayRate: 1 + random() * 2.4,
  spin: 3 + random() * 7,
  phase: random() * Math.PI * 2,
  w: 6 + random() * 6,
  h: 10 + random() * 9,
  color: Math.floor(random() * 6),
}));
const CONFETTI_COLORS = ["#f6d27a", "#d9a63e", "#fff4d0", "#b8862b", "#ffe9a8", "#ffffff"];

const Backdrop = memo(function Backdrop() {
  return (
    <>
      <div className={styles.hall} />
      <div className={styles.hallRing} />
      <div className={styles.hallFins} />
      <div className={styles.stageFloor} />
      <div className={styles.stageEdge} />
      <div className={styles.audience} />
      <div className={styles.audienceFront} />
    </>
  );
});

const Dust = memo(function Dust() {
  return (
    <div className={styles.dust} aria-hidden="true">
      {DUST.map((mote, order) => (
        <i
          key={order}
          style={{
            left: mote.left,
            top: mote.top,
            width: mote.size,
            height: mote.size,
            animationDuration: `${mote.duration}s`,
            animationDelay: `${mote.delay}s`,
            "--dx": `${mote.dx}px`,
            "--dy": `${mote.dy}px`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
});

/** Ballon d'Or desenhado: esfera dourada com gomos, num pé preto e dourado. */
export const GoldenBall = memo(function GoldenBall({ className }: { className?: string }) {
  // Ids próprios: o troféu aparece em mais de um lugar ao mesmo tempo (pedestal, mãos, cartão final).
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg className={className} viewBox="0 0 120 170" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-sphere`} cx="38%" cy="32%" r="72%">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset=".22" stopColor="#ffe08a" />
          <stop offset=".55" stopColor="#e2a93b" />
          <stop offset=".85" stopColor="#8f5c14" />
          <stop offset="1" stopColor="#4d300a" />
        </radialGradient>
        <linearGradient id={`${id}-base`} x1="0" x2="1">
          <stop offset="0" stopColor="#141210" />
          <stop offset=".5" stopColor="#3a332a" />
          <stop offset="1" stopColor="#0b0a09" />
        </linearGradient>
        <linearGradient id={`${id}-trim`} x1="0" x2="1">
          <stop offset="0" stopColor="#8a5f19" />
          <stop offset=".5" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#8a5f19" />
        </linearGradient>
      </defs>
      <path d="M36 130 L84 130 L92 166 L28 166 Z" fill={`url(#${id}-base)`} />
      <rect x="31" y="126" width="58" height="6" rx="2" fill={`url(#${id}-trim)`} />
      <rect x="26" y="160" width="68" height="7" rx="2" fill={`url(#${id}-trim)`} />
      <path d="M50 108 L70 108 L66 128 L54 128 Z" fill={`url(#${id}-trim)`} />
      <circle cx="60" cy="60" r="52" fill={`url(#${id}-sphere)`} />
      <g fill="none" stroke="#9a6618" strokeOpacity=".55" strokeWidth="1.6">
        <path d="M60 30 L76 42 L70 61 L50 61 L44 42 Z" />
        <path d="M60 30 L60 10 M76 42 L95 34 M70 61 L84 78 M50 61 L36 78 M44 42 L25 34" />
        <path d="M84 78 L80 99 M36 78 L40 99 M95 34 L108 52 M25 34 L12 52" />
      </g>
      <ellipse cx="42" cy="36" rx="16" ry="10" fill="#fff" opacity=".42" transform="rotate(-28 42 36)" />
    </svg>
  );
});

function LedContent({ mode, season, name }: { mode: "logo" | "top3" | "third" | "thirdName" | "duel" | "winner"; season: number; name: string }) {
  if (mode === "logo") return <><small>BALLON D&apos;OR</small><strong>{season}</strong></>;
  if (mode === "top3") return <><small>O ENVELOPE</small><strong>TOP 3</strong></>;
  if (mode === "third") return <><small>TERCEIRO LUGAR</small><strong>3º</strong></>;
  if (mode === "thirdName") return <><small>3º LUGAR</small><b>{name}</b></>;
  if (mode === "duel") return <><small>BOLA DE OURO {season}</small><strong className={styles.ledPulse}>?</strong></>;
  return <><small>BALLON D&apos;OR {season}</small><b>{name}</b></>;
}

const Led = memo(LedContent);

// -------------------------------------------------------------- a cena

export default function BallonDorCeremony2D({
  timeline,
  time,
  reducedMotion = false,
}: {
  timeline: CeremonyTimeline;
  /** Relógio do roteiro, em segundos. É a única entrada que anda. */
  time: number;
  reducedMotion?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const confettiClearRef = useRef(true);
  const [size, setSize] = useState(() => (typeof window === "undefined" ? { width: 1280, height: 720 } : { width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (!width || !height) return;
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const view = useMemo(() => viewFor(size.width, size.height), [size.width, size.height]);
  const plan = useMemo(() => buildPlan(timeline, view, reducedMotion), [timeline, view, reducedMotion]);
  // Objeto estável: a cena re-renderiza a cada quadro e o busto só repinta quando a aparência muda.
  const presenterLook = useMemo(() => ({ ...timeline.input.presenter.appearance, kitPattern: 0 }), [timeline]);
  const marks = useMemo(() => {
    const third = plan.beat("third");
    const reaction = plan.beat("reaction");
    const duelStart = timeline.duelCuts[0]?.at ?? third.end;
    return { thirdStart: third.start, reactionStart: reaction.start, duelStart, presenterStart: plan.beat("presenter").start };
  }, [plan, timeline]);

  const finalists = timeline.input.finalists;
  const firstIndex = plan.index(timeline.first.id);
  const winnerX = SLOT_X[firstIndex];

  // ---- câmera
  const cam = sampleTrack(plan.shots, time, mixCam);
  let shakeX = 0;
  let shakeY = 0;
  if (!reducedMotion) {
    for (const [at, amount] of [[timeline.thirdRevealAt, 5], [timeline.winnerRevealAt, 13], [timeline.trophyLiftAt, 4]] as const) {
      const local = time - at;
      if (local < 0 || local > 0.9) continue;
      const decay = Math.exp(-local * 6);
      shakeX += Math.sin(local * 57) * amount * decay;
      shakeY += Math.cos(local * 43) * amount * decay * 0.7;
    }
  }
  const centerY = (view.top + view.bottom) / 2;
  const offsetX = view.width / 2 - cam.x * cam.s + shakeX;
  const offsetY = centerY - cam.y * cam.s + shakeY;
  const worldStyle: CSSProperties = { width: WORLD_W, height: WORLD_H, transform: `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${cam.s})` };

  // ---- luzes
  const light = sampleTrack(plan.lights, time, mixLights);
  const spots = [
    { rig: RIGS[0], x: light.a, intensity: light.ai },
    { rig: RIGS[1], x: light.b, intensity: light.bi },
  ];
  const targetY = MEDAL_Y + 150;
  const litAt = (x: number) => Math.max(light.wash, ...spots.map((spot) => spot.intensity * clamp01(1 - Math.abs(spot.x - x) / 260)));

  // ---- momentos
  const thirdOut = time >= timeline.thirdRevealAt + 2.2;
  const winnerOn = time >= timeline.winnerRevealAt;
  const winnerGlow = winnerOn ? easeOut((time - timeline.winnerRevealAt) / 0.7) : 0;
  const handed = time >= timeline.trophyHandoffAt;
  const ledMode = time < marks.presenterStart ? "logo"
    : time < marks.thirdStart ? "top3"
    : time < timeline.thirdRevealAt ? "third"
    : time < marks.duelStart ? "thirdName"
    : time < timeline.winnerRevealAt ? "duel"
    : "winner";
  const ledName = ledMode === "thirdName" ? timeline.third.name : timeline.first.name;

  // ---- troféu: sobe pela frente do pedestal, fica no peito e depois vai acima da cabeça
  let trophyStyle: CSSProperties | null = null;
  if (handed) {
    const held = easeOut((time - timeline.trophyHandoffAt) / 0.9);
    const liftRaw = clamp01((time - timeline.trophyLiftAt) / 0.85);
    const lift = liftRaw <= 0 ? 0 : 1 - Math.pow(1 - liftRaw, 3) + Math.sin(liftRaw * Math.PI) * 0.08;
    const bob = liftRaw >= 1 && !reducedMotion ? Math.sin(time * 2.2) * 5 : 0;
    // `y` é a base do troféu: no peito, sobre o pedestal; erguido, apoiado no aro de cima.
    const heldY = PEDESTAL_TOP + 50;
    const raisedY = MEDAL_Y - MEDAL_R + 34;
    const y = lerp(lerp(PEDESTAL_TOP + 220, heldY, held), raisedY, lift) + bob;
    trophyStyle = {
      left: winnerX - 70,
      top: y - 200,
      opacity: clamp01(held * 1.6),
      transform: `scale(${lerp(0.86, 1.06, lift)})`,
    };
  }

  // ---- flash dourado e flashes de fotógrafo
  const sinceWinner = time - timeline.winnerRevealAt;
  const sinceThird = time - timeline.thirdRevealAt;
  const flash = reducedMotion
    ? (sinceWinner >= 0 ? 0.28 * Math.exp(-sinceWinner * 2.5) : 0)
    : Math.max(sinceWinner >= 0 ? 0.92 * Math.exp(-sinceWinner * 4.2) : 0, sinceThird >= 0 && sinceThird < 1 ? 0.32 * Math.exp(-sinceThird * 6) : 0);
  let photo: CSSProperties | null = null;
  if (!reducedMotion && sinceWinner > 0.6) {
    const tick = Math.floor(time * 6);
    const hash = (n: number) => {
      const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    const age = time - tick / 6;
    if (hash(tick) < 0.55 && age < 0.16) {
      photo = { left: hash(tick + 7) * view.width, top: view.height * (0.4 + hash(tick + 13) * 0.5), opacity: Math.exp(-age * 28) };
    }
  }

  // ---- confete (canvas na tela, não no mundo: não escala com a câmera)
  const winnerScreen = { x: offsetX + winnerX * cam.s, y: offsetY + (MEDAL_Y - MEDAL_R) * cam.s };
  useEffect(() => {
    const canvas = confettiRef.current;
    if (!canvas) return;
    const density = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(view.width * density);
    const height = Math.round(view.height * density);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      confettiClearRef.current = true;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    const local = time - timeline.winnerRevealAt;
    const active = local >= 0 && local <= 9;
    // Fora da chuva de confete o canvas já está limpo: nada a fazer neste quadro.
    if (!active && confettiClearRef.current) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    confettiClearRef.current = !active;
    if (!active) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    const pieces = reducedMotion ? CONFETTI.slice(56, 96) : CONFETTI;
    for (const piece of pieces) {
      const age = local - piece.delay;
      if (age < 0) continue;
      let x: number;
      let y: number;
      if (piece.burst) {
        // Explosão a partir do medalhão: sobe, abre e cai com gravidade e arrasto.
        const drag = 1 - Math.exp(-age * 2.2);
        x = winnerScreen.x + piece.vx * view.width * 0.42 * drag + Math.sin(age * piece.swayRate + piece.phase) * piece.sway * 0.4;
        y = winnerScreen.y - piece.vy * view.height * 0.55 * drag + view.height * 0.32 * age * age;
      } else {
        x = piece.x * view.width + Math.sin(age * piece.swayRate + piece.phase) * piece.sway;
        y = -30 + piece.fall * view.height * age * (reducedMotion ? 0.6 : 1);
      }
      if (y > view.height + 30) continue;
      const fade = clamp01((9 - local) / 1.2);
      const spin = age * piece.spin + piece.phase;
      context.save();
      context.globalAlpha = fade;
      context.translate(x, y);
      context.rotate(spin * 0.6);
      context.scale(Math.cos(spin), 1);
      context.fillStyle = CONFETTI_COLORS[piece.color];
      context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
      context.restore();
    }
  }, [time, timeline.winnerRevealAt, view.width, view.height, reducedMotion, winnerScreen.x, winnerScreen.y]);

  return (
    <div className={styles.scene2d} ref={rootRef} aria-hidden="true">
      <div className={styles.world} style={worldStyle}>
        <Backdrop />
        <div className={styles.hallDim} style={{ opacity: 0.72 * (1 - light.wash) }} />
        {/* O telão tem luz própria: escurece menos que o salão. */}
        <div className={styles.led} style={{ opacity: 0.72 + 0.28 * light.wash }}>
          <div className={styles.ledInner}>
            <Led mode={ledMode} season={timeline.input.season} name={ledName} />
          </div>
        </div>

        <div className={`${styles.trophyStand} ${handed ? styles.trophyStandEmpty : ""}`} style={{ left: TROPHY_STAND_X - 70 }}>
          {!handed && <GoldenBall className={styles.standTrophy} />}
        </div>

        {winnerGlow > 0 && (
          <div className={styles.winnerRays} style={{ left: winnerX - 520, top: MEDAL_Y - 520, opacity: winnerGlow * 0.85, transform: `rotate(${reducedMotion ? 0 : time * 9}deg)` }} />
        )}

        {finalists.map((finalist, slot) => {
          const x = SLOT_X[slot];
          const lit = litAt(x);
          const dimmed = finalist.place === 3 && thirdOut;
          const isWinner = finalist.place === 1 && winnerOn;
          const showPlace = (finalist.place === 3 && time >= timeline.thirdRevealAt + 0.3)
            || (finalist.place === 1 && time >= timeline.winnerRevealAt + 0.4)
            || (finalist.place === 2 && time >= timeline.winnerRevealAt + 0.9);
          return (
            <div key={finalist.id}>
              {isWinner && <div className={styles.winnerHalo} style={{ left: x - 300, top: MEDAL_Y - 300, opacity: winnerGlow, transform: `scale(${1 + (reducedMotion ? 0 : 0.04 * Math.sin(time * 2.4))})` }} />}
              <div className={`${styles.medal} ${dimmed ? styles.medalDimmed : ""} ${isWinner ? styles.medalWinner : ""}`} style={{ left: x - MEDAL_R, top: MEDAL_Y - MEDAL_R, width: MEDAL_R * 2, height: MEDAL_R * 2 }}>
                <BustCanvas
                  className={styles.medalBust}
                  appearance={finalist.appearance}
                  face={faceAt(timeline, finalist, time, marks.thirdStart, marks.reactionStart)}
                  primary={finalist.club.primary}
                  secondary={finalist.club.secondary}
                  size={MEDAL_R * 2}
                  resolution={1.7}
                />
                <div className={styles.medalShade} style={{ opacity: dimmed ? 0.74 : 0.72 * (1 - lit) }} />
                <div className={styles.medalRing} />
                {showPlace && <span className={`${styles.placeBadge} ${finalist.place === 1 ? styles.placeGold : ""}`}>{finalist.place}º</span>}
              </div>
              <div className={`${styles.pedestal} ${dimmed ? styles.pedestalDimmed : ""}`} style={{ left: x - 150, top: PEDESTAL_TOP }}>
                <span className={styles.pedestalPlate}>
                  <i style={{ background: finalist.club.primary }} />
                  <i style={{ background: finalist.club.secondary }} />
                  {finalist.club.shortName}
                </span>
              </div>
            </div>
          );
        })}

        <div className={styles.presenter} style={{ left: PRESENTER.x - PRESENTER.r, top: PRESENTER.y - PRESENTER.r, width: PRESENTER.r * 2, height: PRESENTER.r * 2 }}>
          <BustCanvas
            className={styles.medalBust}
            appearance={presenterLook}
            face={presenterFaceAt(timeline, time, marks.thirdStart, marks.duelStart)}
            primary="#17181d"
            secondary="#f1efe8"
            size={PRESENTER.r * 2}
            resolution={1.7}
          />
          <div className={styles.medalShade} style={{ opacity: 0.6 * (1 - litAt(PRESENTER.x)) }} />
          <div className={styles.medalRing} />
        </div>
        <div className={styles.lectern} style={{ left: PRESENTER.x - 115, top: PRESENTER.y + PRESENTER.r - 18 }}>
          <i className={styles.lecternMic} />
          <span
            className={styles.envelope}
            style={{ transform: time >= marks.presenterStart && time < timeline.winnerRevealAt + 0.4 ? "translateY(-26px) rotate(-8deg)" : "none" }}
          />
          <b className={styles.lecternEmblem} />
        </div>

        {spots.map((spot, order) => {
          const dx = spot.x - spot.rig;
          const dy = targetY - RIG_Y;
          const length = Math.hypot(dx, dy);
          return (
            <div key={order}>
              <div
                className={styles.cone}
                style={{ left: spot.rig, top: RIG_Y, opacity: 0.85 * spot.intensity, transform: `rotate(${-Math.atan2(dx, dy)}rad) scaleY(${length / 1000})` }}
              />
              <div className={styles.pool} style={{ left: spot.x - 250, top: PEDESTAL_TOP + 110, opacity: spot.intensity }} />
            </div>
          );
        })}

        {trophyStyle && (
          <div className={`${styles.heldTrophy} ${time >= timeline.trophyLiftAt ? styles.heldTrophyRaised : ""}`} style={trophyStyle}>
            <GoldenBall className={styles.heldTrophyBall} />
          </div>
        )}

        {!reducedMotion && <Dust />}
      </div>

      <canvas ref={confettiRef} className={styles.confetti} style={{ width: view.width, height: view.height }} />
      {photo && <div className={styles.photoFlash} style={photo} />}
      <div className={styles.goldFlash} style={{ opacity: flash }} />
      <div className={styles.sceneVignette} />
    </div>
  );
}

"use client";

// Versão 2D da apresentação (sem WebGL, WebGL caiu ou o 3D não ficou pronto):
// a mesma encenação em DOM/SVG, sem three.js. O busto é o mesmo do álbum
// (`drawPlayerBust`); a camisa e o painel são vetor, nítidos em qualquer zoom.
//
// O React monta a cena uma vez; o relógio da apresentação chama `render(t)` a
// cada quadro e só estilos mudam (transform/opacity): nada de re-render por quadro.

import { memo, useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { readableInk } from "../botao/kits";
import { SKIN_COLORS, drawPlayerBust, type PlayerAppearance } from "../player-appearance";
import {
  FAR_FLASHES,
  FLASH_UNITS,
  MARKS,
  PHOTOGRAPHERS,
  arrivalOutfit,
  directorAppearance,
  flashBrightness,
  type PresentationTimeline,
} from "./presentation-script";
import styles from "./presentation.module.css";

export type Presentation2DStage = { render(time: number, dt: number): void; dispose(): void };

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth01 = (value: number) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const mix = (from: number, to: number, k: number) => from + (to - from) * k;

// --------------------------------------------------------------- medidas
// Mundo de 1600×900 (px do palco 2D); a câmera escala e desloca tudo junto.

const FLOOR = 720;
const PLAYER_X = 700;
const DIRECTOR_X = 1010;
const ENTRY_X = -260;
const BUST_Y = 380;
/** Linha das mãos na camisa (os ombros dela) e o tamanho do desenho. */
const SHIRT = 300;
const GRIP_X = 0.28 * SHIRT;
const GRIP_Y = 0.135 * SHIRT;
const SHOULDER_DX = 66;
const SHOULDER_Y = BUST_Y + 44;

// ---------------------------------------------------------------- arte

/** Busto do álbum desenhado uma vez (recorte de figurinha: cabeça livre, ombros). */
function Bust({ appearance, primary, secondary, className, label }: { appearance: PlayerAppearance; primary: string; secondary: string; className: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 360 * ratio;
    canvas.height = 400 * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 180 * ratio, 190 * ratio);
    drawPlayerBust(ctx, appearance, primary, secondary, 110, 0, { cutout: true });
  }, [appearance, primary, secondary]);
  return <canvas ref={ref} className={className} role="img" aria-label={label} />;
}

/** Contorno da camiseta aberta: as mesmas frações de `paintHeldShirt` (textures.ts), em 0..100. */
function shirtPath(front: boolean) {
  const neck = front ? 18.5 : 13.5;
  return `M38.5 10 L22 13.5 L3.5 30 L12.5 39.5 L23.5 32 Q22.5 62 24 90 Q50 92 76 90 Q77.5 62 76.5 32 L87.5 39.5 L96.5 30 L78 13.5 L61.5 10 Q50 ${neck * 2 - 10} 38.5 10 Z`;
}

/** Estampa do clube (as 12 do jogo) em vetor, dentro do recorte da camisa. */
function PatternArt({ pattern, secondary, front, gradientId }: { pattern: number; secondary: string; front: boolean; gradientId: string }) {
  switch (pattern) {
    case 0:
      return <rect x="38" y="0" width="24" height="100" fill={secondary} />;
    case 2:
      return <>{[0, 1, 2, 3, 4].map((index) => <rect key={index} x={6 + index * 20} y="0" width="10" height="100" fill={secondary} />)}</>;
    case 3:
      return <rect x={front ? 50 : 0} y="0" width="50" height="100" fill={secondary} />;
    case 4:
      return <rect x="39" y="-50" width="22" height="200" fill={secondary} transform={`rotate(${front ? -35.5 : 35.5} 50 50)`} />;
    case 5:
      return <path d="M0 12 L50 42 L100 12 L100 30 L50 60 L0 30 Z" fill={secondary} />;
    case 6:
      return <path d="M0 0 H100 V22 H84 V45 H100 V22 H100 Z M0 0 V45 H16 V22 H0 Z M0 0 H100 V22 H0 Z" fill={secondary} />;
    case 7:
      return <>{[6, 20, 34, 48, 62, 76, 90].map((x) => <rect key={x} x={x} y="0" width="3.5" height="100" fill={secondary} />)}</>;
    case 8:
      return <rect x="0" y="36" width="100" height="26" fill={secondary} />;
    case 9:
      return (
        <>
          {[0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3].map((column) => ((row + column) % 2 === 0
            ? <rect key={`${row}-${column}`} x={column * 25} y={row * 25} width="25" height="25" fill={secondary} />
            : null)))}
        </>
      );
    case 10:
      return <rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} />;
    case 11:
      return <path d="M0 0 H12 V100 H0 Z M88 0 H100 V100 H88 Z M0 0 H24 V42 H0 Z M76 0 H100 V42 H76 Z" fill={secondary} />;
    default:
      return null;
  }
}

function CrestArt({ badge, abbr, fill, ink }: { badge?: string; abbr: string; fill: string; ink: string }) {
  if (badge) return <image href={badge} x="-50" y="-50" width="100" height="100" preserveAspectRatio="xMidYMid meet" />;
  return (
    <>
      <path d="M-42 -46 Q0 -56 42 -46 L42 4 Q40 38 0 56 Q-40 38 -42 4 Z" fill={fill} stroke={ink} strokeWidth="5" strokeLinejoin="round" />
      <text x="0" y="3" textAnchor="middle" dominantBaseline="middle" fontSize="36" fontWeight="900" fill={readableInk(fill)} className={styles.svgCondensed}>
        {abbr.slice(0, 4).toUpperCase()}
      </text>
    </>
  );
}

type ShirtArtProps = { timeline: PresentationTimeline; front: boolean; className?: string };

/** Uma face da camisa (frente com escudo e patrocínio; costas com nome e número). */
const ShirtArt = memo(function ShirtArt({ timeline, front, className }: ShirtArtProps) {
  const id = useId().replace(/:/g, "");
  const { club, player } = timeline.input;
  const pattern = timeline.kitPattern;
  const trim = club.secondary === club.primary ? readableInk(club.primary) : club.secondary;
  const ink = readableInk(pattern === 0 ? club.secondary : club.primary);
  // Mesma regra de `paintHeldShirt`: em estampa movimentada o contorno do nome e do número engrossa.
  const busy = pattern === 2 || pattern === 3 || pattern === 4 || pattern === 7 || pattern === 9;
  const outline = ink === "#ffffff" ? `rgba(0,0,0,${busy ? 0.78 : 0.5})` : `rgba(255,255,255,${busy ? 0.85 : 0.55})`;
  const stroke = busy ? 1.6 : 1;
  const sleeve = pattern === 6 || pattern === 11 ? club.secondary : club.primary;
  const name = (player.shortName || player.name).trim().toUpperCase();
  const number = String(Math.max(0, Math.round(player.number)));
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id={`${id}c`}><path d={shirtPath(front)} /></clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={club.secondary} stopOpacity="0" />
          <stop offset="1" stopColor={club.secondary} />
        </linearGradient>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.2" stopColor="#000" stopOpacity=".26" />
          <stop offset="0.34" stopColor="#000" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity=".08" />
          <stop offset="0.66" stopColor="#000" stopOpacity="0" />
          <stop offset="0.8" stopColor="#000" stopOpacity=".26" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="100" height="100" fill={club.primary} />
        <PatternArt pattern={pattern} secondary={club.secondary} front={front} gradientId={`${id}g`} />
        {sleeve !== club.primary && <path d="M0 0 H23.5 V42 H0 Z M76.5 0 H100 V42 H76.5 Z" fill={sleeve} />}
        <rect width="100" height="100" fill={`url(#${id}e)`} />
        <rect y="80" width="100" height="14" fill="#000" opacity=".14" />
      </g>
      <path d="M3.5 30 L12.5 39.5 M96.5 30 L87.5 39.5" stroke={trim} strokeWidth="2.6" />
      <path d={`M39 10.3 Q50 ${(front ? 18.5 : 13.5) * 2 - 10} 61 10.3`} stroke={trim} strokeWidth="3" fill="none" strokeLinecap="round" />
      {front ? (
        <>
          <g transform="translate(63.5 30) scale(.12)">
            <CrestArt badge={club.badge} abbr={club.abbr} fill={trim} ink={ink} />
          </g>
          <text x="50" y="51" textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fontWeight="900" fill={ink} opacity=".9" className={styles.svgCondensed}>FUTBOBO</text>
        </>
      ) : (
        <g className={styles.svgCondensed} fontWeight="900" textAnchor="middle" fill={ink} stroke={outline} strokeLinejoin="round" paintOrder="stroke">
          {name && (
            <text x="50" y="25" dominantBaseline="middle" fontSize="8.5" strokeWidth={1.2 * stroke} {...(name.length > 9 ? { textLength: 44, lengthAdjust: "spacingAndGlyphs" } : {})}>
              {name}
            </text>
          )}
          <text x="50" y="54" dominantBaseline="middle" fontSize="36" strokeWidth={2.2 * stroke} {...(number.length > 2 ? { textLength: 46, lengthAdjust: "spacingAndGlyphs" } : {})}>
            {number}
          </text>
        </g>
      )}
    </svg>
  );
});

/** Painel de fundo: escudo e nome do clube em xadrez (o mesmo ladrilho do 3D, em vetor). */
const Backdrop = memo(function Backdrop({ timeline }: { timeline: PresentationTimeline }) {
  const id = useId().replace(/:/g, "");
  const { club } = timeline.input;
  const ink = readableInk(club.primary);
  const accent = club.secondary;
  const word = club.shortName.toUpperCase();
  const caption = club.city ? club.city.toUpperCase() : "APRESENTAÇÃO OFICIAL";
  const wordmark = (x: number, y: number) => (
    <g transform={`translate(${x} ${y})`}>
      <text y="-4" textAnchor="middle" dominantBaseline="middle" fontSize="19" fontWeight="900" fill={ink} className={styles.svgCondensed} {...(word.length > 9 ? { textLength: 76, lengthAdjust: "spacingAndGlyphs" } : {})}>{word}</text>
      <rect x="-22" y="8" width="44" height="2" fill={accent} />
      <text y="18" textAnchor="middle" dominantBaseline="middle" fontSize="6.5" fontWeight="800" fill={ink} opacity=".8" className={styles.svgCondensed}>{caption}</text>
    </g>
  );
  return (
    <svg className={styles.backdrop2d} viewBox="0 0 2400 720" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id={`${id}p`} width="180" height="180" patternUnits="userSpaceOnUse" patternTransform="scale(1.45)">
          <rect width="180" height="180" fill={club.primary} />
          <g transform="translate(45 45) scale(.54)">
            <CrestArt badge={club.badge} abbr={club.abbr} fill={accent} ink={ink} />
          </g>
          {wordmark(135, 45)}
          {wordmark(45, 135)}
          <g transform="translate(135 135) scale(.54)">
            <CrestArt badge={club.badge} abbr={club.abbr} fill={accent} ink={ink} />
          </g>
        </pattern>
        <radialGradient id={`${id}l`} cx="0.47" cy="0.55" r="0.55">
          <stop offset="0" stopColor="#fff" stopOpacity=".12" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".62" />
        </radialGradient>
      </defs>
      <rect width="2400" height="720" fill={`url(#${id}p)`} />
      <rect width="2400" height="720" fill={`url(#${id}l)`} />
    </svg>
  );
});

/** Fotógrafo de costas (silhueta), com a câmera erguida; `flash` marca onde o flash acende. */
function Photographer({ kneel, flip }: { kneel: boolean; flip: boolean }) {
  const lift = kneel ? 26 : 0;
  return (
    <svg className={styles.photog} viewBox="0 0 120 160" preserveAspectRatio="xMidYMax meet" style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden="true">
      <g transform={`translate(0 ${lift})`} stroke="#4a4d58" strokeWidth="1.6" strokeOpacity=".7">
        <rect x="34" y="70" width="52" height="96" rx="14" fill="#14151b" />
        <rect x="20" y="58" width="22" height="34" rx="9" fill="#121319" transform="rotate(-24 31 75)" />
        <rect x="78" y="58" width="22" height="34" rx="9" fill="#121319" transform="rotate(24 89 75)" />
        <rect x="40" y="34" width="40" height="40" rx="10" fill="#1a1b22" />
        <rect x="40" y="31" width="40" height="13" rx="6" fill="#0d0d11" />
        <rect x="44" y="42" width="34" height="20" rx="3" fill="#08080a" />
        <rect x="54" y="25" width="14" height="12" rx="2" fill="#3a3b42" />
      </g>
    </svg>
  );
}

/** Onde fica o flash de cada fotógrafo (fração da tela) — o mesmo índice das unidades do roteiro. */
const PHOTOG_SPOTS: ReadonlyArray<{ left: number; kneel: boolean; flip: boolean }> = [
  { left: 13, kneel: true, flip: false },
  { left: 4, kneel: false, flip: false },
  { left: 22, kneel: true, flip: false },
  { left: -4, kneel: false, flip: false },
  { left: 76, kneel: true, flip: true },
  { left: 87, kneel: false, flip: true },
  { left: 67, kneel: true, flip: true },
  { left: 95, kneel: false, flip: true },
];

// ----------------------------------------------------------------- cena

type Props = {
  timeline: PresentationTimeline;
  reducedMotion: boolean;
  /** Entrega o palco 2D ao relógio quando monta (e `null` quando desmonta). */
  onStage: (stage: Presentation2DStage | null) => void;
};

type Cam2D = { cx: number; cy: number; view: number };

function shot(out: Cam2D, cx: number, cy: number, view: number) {
  out.cx = cx;
  out.cy = cy;
  out.view = view;
}

/** Mistura com o plano anterior durante `length` a partir de `start`. */
function blendShot(out: Cam2D, time: number, start: number, length: number, cx: number, cy: number, view: number) {
  const k = smooth01((time - start) / length);
  out.cx = mix(out.cx, cx, k);
  out.cy = mix(out.cy, cy, k);
  out.view = mix(out.view, view, k);
}

/** Planos da versão 2D: onde a câmera olha (centro) e quanto do mundo cabe na altura livre. */
function camera2d(time: number, duration: number, playerX: number, reduced: boolean, out: Cam2D) {
  const middle = (PLAYER_X + DIRECTOR_X) / 2;
  // 1. Chegada: acompanha o passo e abre para os dois.
  const arrive = smooth01((time - 1.9) / 0.85);
  shot(out, mix(playerX + 130, middle, arrive), 460, mix(600, 580, arrive));
  if (time >= 2.75) blendShot(out, time, 2.75, 0.7, middle, 470, 540 - 40 * smooth01((time - 2.75) / 1.8));
  if (time >= 4.3) blendShot(out, time, 4.3, 0.6, PLAYER_X + 40, 420, 420);
  if (time >= MARKS.cut) {
    // Corte seco para a foto, empurrando devagar (com um soco no primeiro flash).
    const u = smooth01((time - MARKS.cut) / (MARKS.cheer - MARKS.cut));
    const kick = !reduced && time >= MARKS.storm ? 30 * Math.exp(-(time - MARKS.storm) * 6) : 0;
    shot(out, PLAYER_X + 20, 450, mix(500, 420, u) - kick);
  }
  if (time >= MARKS.cheer) {
    const u = smooth01((time - MARKS.cheer) / (duration - MARKS.cheer));
    blendShot(out, time, MARKS.cheer, 1.5, mix(PLAYER_X + 20, 820, u), mix(450, 440, u), mix(420, 720, u));
  }
  if (time >= duration) blendShot(out, time, duration, 1.8, 830, 430, 820);
}

export default function SigningPresentation2D({ timeline, reducedMotion, onStage }: Props) {
  const { input } = timeline;
  const { club } = input;
  const arrival = arrivalOutfit(input);
  const director = directorAppearance(timeline.seed);

  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const directorRef = useRef<HTMLDivElement>(null);
  const shirtRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const handRefs = useRef<Array<HTMLElement | null>>([]);
  const armRefs = useRef<Array<HTMLElement | null>>([]);
  const flashRefs = useRef<Array<HTMLElement | null>>([]);
  const photogRef = useRef<HTMLDivElement>(null);
  const reducedRef = useRef(reducedMotion);

  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const size = { width: 1, height: 1, top: 0, bottom: 1 };
    const measure = () => {
      const width = root.clientWidth || size.width;
      const height = root.clientHeight || size.height;
      const portrait = width / height < 0.75;
      // Mesma conta do palco 3D: a área livre entre a tarja de cima e a legenda.
      const bar = portrait ? Math.max(34, Math.min(60, height * 0.07)) : Math.max(30, Math.min(84, height * 0.085));
      const caption = Math.max(height * (portrait ? 0.24 : 0.19), Math.min(220, height * 0.2) + 10);
      size.width = width;
      size.height = height;
      size.top = bar + 6;
      size.bottom = Math.max(size.top + height * 0.34, height - bar - caption);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);

    const cam: Cam2D = { cx: 800, cy: 450, view: 700 };
    let backShown = false;
    const setArm = (index: number, x0: number, y0: number, x1: number, y1: number, show: number) => {
      const arm = armRefs.current[index];
      const hand = handRefs.current[index];
      const length = Math.hypot(x1 - x0, y1 - y0);
      const angle = Math.atan2(y1 - y0, x1 - x0);
      if (arm) {
        arm.style.opacity = show > 0.01 ? "1" : "0";
        arm.style.transform = `translate3d(${x0}px, ${y0}px, 0) rotate(${angle}rad) scaleX(${Math.max(0.01, length / 100)})`;
      }
      if (hand) {
        hand.style.opacity = show > 0.01 ? "1" : "0";
        hand.style.transform = `translate3d(${x1}px, ${y1}px, 0)`;
      }
    };

    const stage: Presentation2DStage = {
      render(time) {
        const reduced = reducedRef.current;
        const duration = timeline.duration;
        // ----------------------------------------------------- elenco
        const walk = clamp01((time - MARKS.walkStart) / (MARKS.walkEnd - MARKS.walkStart));
        const walking = walk > 0 && walk < 1;
        // Entra já andando e assenta na marca (sem parar de estalo).
        const playerX = mix(ENTRY_X, PLAYER_X, 1 - Math.pow(1 - walk, 1.5));
        const stride = walking && !reduced ? Math.abs(Math.sin(time * 9)) * 12 : 0;
        // Festa: pula com a camisa no alto.
        const cheerT = time - MARKS.cheer;
        const cheerK = time >= MARKS.cheer && time < duration + 0.9 ? smooth01(cheerT / 0.3) * (1 - smooth01((time - duration - 0.6) / 0.3)) : 0;
        const pump = cheerK > 0 && cheerT > 0.15 && !reduced ? 0.5 - 0.5 * Math.cos(Math.PI * 2 * 1.5 * (cheerT - 0.15)) : 0;
        const playerY = -stride + 16 * pump * cheerK;
        playerRef.current!.style.transform = `translate3d(${playerX}px, ${playerY}px, 0)`;
        const directorShift = 40 * smooth01((time - MARKS.release - 0.3) / 0.6);
        directorRef.current!.style.transform = `translate3d(${DIRECTOR_X + directorShift}px, 0, 0)`;

        // ----------------------------------------------------- camisa
        // Com o diretor: na frente dele, estende até o meio e passa; com o jogador:
        // junto do corpo, vira (as costas com nome e número) e sobe.
        const middleX = (PLAYER_X + DIRECTOR_X) / 2;
        let gx: number;
        let gy: number;
        if (time < MARKS.pull) {
          const k = smooth01((time - MARKS.offer) / 0.5);
          gx = mix(DIRECTOR_X, middleX, k);
          gy = mix(BUST_Y + 108, BUST_Y + 92, k);
        } else {
          const k = smooth01((time - MARKS.pull) / (MARKS.pullEnd - MARKS.pull));
          const up = smooth01((time - MARKS.raise) / 0.45);
          gx = mix(middleX, playerX, k);
          gy = mix(BUST_Y + 92, mix(BUST_Y + 96, BUST_Y + 46, up), k) + playerY - 20 * cheerK * (1 - pump);
        }
        const flip = smooth01((time - (MARKS.turn + 0.15)) / 0.4);
        const scaleX = Math.cos(Math.PI * flip);
        const showBack = flip >= 0.5;
        shirtRef.current!.style.transform = `translate3d(${gx - SHIRT / 2}px, ${gy - GRIP_Y}px, 0)`;
        flipRef.current!.style.transform = `scaleX(${Math.max(0.02, Math.abs(scaleX))}) rotate(${(walking ? 0 : Math.sin(time * 1.7) * 0.6) * (reduced ? 0 : 1)}deg)`;
        if (showBack !== backShown) {
          backShown = showBack;
          frontRef.current!.style.opacity = showBack ? "0" : "1";
          backRef.current!.style.opacity = showBack ? "1" : "0";
        }

        // ------------------------------------------- braços e mãos
        const gripHalf = GRIP_X * Math.max(0.02, Math.abs(scaleX));
        const playerHold = smooth01((time - MARKS.reach) / 0.32);
        const playerShoulderY = SHOULDER_Y + playerY;
        setArm(0, playerX - SHOULDER_DX, playerShoulderY, mix(playerX - SHOULDER_DX - 10, gx - gripHalf, playerHold), mix(playerShoulderY + 70, gy, playerHold), playerHold);
        setArm(1, playerX + SHOULDER_DX, playerShoulderY, mix(playerX + SHOULDER_DX + 10, gx + gripHalf, playerHold), mix(playerShoulderY + 70, gy, playerHold), playerHold);
        const directorHold = 1 - smooth01((time - MARKS.release) / 0.3);
        const dx = DIRECTOR_X + directorShift;
        // Soltou: as mãos batem palma na frente do peito.
        const clap = directorHold < 0.99 ? 0.5 + 0.5 * Math.sin(time * 16) : 0;
        const clapX = 10 + 26 * clap;
        setArm(2, dx - SHOULDER_DX, SHOULDER_Y, mix(dx - clapX, gx - gripHalf, directorHold), mix(SHOULDER_Y + 64, gy, directorHold), 1);
        setArm(3, dx + SHOULDER_DX, SHOULDER_Y, mix(dx + clapX, gx + gripHalf, directorHold), mix(SHOULDER_Y + 64, gy, directorHold), 1);

        // --------------------------------------------------- flashes
        for (let unit = 0; unit < FLASH_UNITS; unit += 1) {
          const glow = flashRefs.current[unit];
          if (!glow) continue;
          const value = flashBrightness(timeline.flashes, unit, time, reduced);
          glow.style.opacity = value > 0.01 ? value.toFixed(3) : "0";
          glow.style.transform = `translate(-50%, -50%) scale(${(0.6 + 0.5 * value).toFixed(3)})`;
        }

        // ---------------------------------------------------- câmera
        camera2d(time, duration, playerX, reduced, cam);
        const free = size.bottom - size.top;
        const scale = free / cam.view;
        const tx = size.width / 2 - cam.cx * scale;
        const ty = (size.top + size.bottom) / 2 - cam.cy * scale;
        worldRef.current!.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${scale.toFixed(5)})`;
        // Fotógrafos na frente: deslizam um pouco mais que o fundo (profundidade).
        if (photogRef.current) photogRef.current.style.transform = `translate3d(${((800 - cam.cx) * 0.12).toFixed(1)}px, 0, 0)`;
      },
      dispose() {
        observer.disconnect();
      },
    };
    onStage(stage);
    return () => {
      onStage(null);
      stage.dispose();
    };
  }, [timeline, onStage]);

  const rootStyle = { "--club-a": club.primary, "--club-b": club.secondary } as CSSProperties;
  const skinOf = (appearance: PlayerAppearance) => appearance.customSkinColor ?? SKIN_COLORS[appearance.skin] ?? SKIN_COLORS[2];
  const playerSkin = skinOf(input.player.appearance);
  const directorSkin = skinOf(director);
  // Peneira: braços de fora (colete); contratação: manga do terno.
  const playerSleeve = arrival.kind === "kit" ? playerSkin : arrival.primary;

  return (
    <div ref={rootRef} className={styles.scene2d} style={rootStyle} aria-hidden="true">
      <div ref={worldRef} className={styles.world2d}>
        <Backdrop timeline={timeline} />
        <div className={styles.floor2d} style={{ top: FLOOR }} />
        <div className={styles.carpet2d} style={{ top: FLOOR - 26 }} />
        <div className={styles.pool2d} />

        {/* Diretor: busto, corpo de terno e (por cima da camisa) as mãos. */}
        <div ref={directorRef} className={styles.actor2d}>
          <div className={styles.body2d} style={{ "--torso": "#1c2230", "--legs": "#151a24" } as CSSProperties} />
          <Bust appearance={director} primary="#1c2230" secondary="#f3f1ec" className={styles.bust2d} label="Diretor do clube" />
        </div>
        <div ref={playerRef} className={styles.actor2d}>
          <div className={styles.body2d} style={{ "--torso": arrival.primary, "--legs": arrival.kind === "kit" ? "#1d2027" : "#141821" } as CSSProperties} />
          <Bust
            appearance={arrival.kind === "kit" ? { ...input.player.appearance, kitPattern: 1 } : input.player.appearance}
            primary={arrival.primary}
            secondary={arrival.secondary}
            className={styles.bust2d}
            label={input.player.name}
          />
        </div>

        {[0, 1, 2, 3].map((index) => (
          <i
            key={`arm-${index}`}
            ref={(element) => {
              armRefs.current[index] = element;
            }}
            className={styles.arm2d}
            style={{ background: index < 2 ? playerSleeve : "#1c2230" }}
          />
        ))}

        <div ref={shirtRef} className={styles.shirt2d} style={{ width: SHIRT, height: SHIRT }}>
          <div ref={flipRef} className={styles.shirtFlip}>
            <div ref={frontRef} className={styles.shirtFace}><ShirtArt timeline={timeline} front /></div>
            <div ref={backRef} className={styles.shirtFace} style={{ opacity: 0 }}><ShirtArt timeline={timeline} front={false} /></div>
          </div>
        </div>

        {[0, 1, 2, 3].map((index) => (
          <i
            key={`hand-${index}`}
            ref={(element) => {
              handRefs.current[index] = element;
            }}
            className={styles.hand2d}
            style={{ background: index < 2 ? playerSkin : directorSkin }}
          />
        ))}
      </div>

      <div ref={photogRef} className={styles.photogs2d}>
        {PHOTOG_SPOTS.map((spot, index) => (
          <div key={index} className={`${styles.photogSlot} ${spot.kneel ? styles.photogKneel : styles.photogStand}`} style={{ left: `${spot.left}%` }}>
            <Photographer kneel={spot.kneel} flip={spot.flip} />
            <i
              ref={(element) => {
                flashRefs.current[index] = element;
              }}
              className={styles.flash2d}
              style={{ left: spot.flip ? "49.2%" : "50.8%", top: `${((31 + (spot.kneel ? 26 : 0)) / 160) * 100}%` }}
            />
          </div>
        ))}
        {Array.from({ length: FAR_FLASHES }, (_, far) => (
          <i
            key={`far-${far}`}
            ref={(element) => {
              flashRefs.current[PHOTOGRAPHERS + far] = element;
            }}
            className={`${styles.flash2d} ${styles.flashFar}`}
            style={{ left: `${far % 2 === 0 ? 3 + far * 4 : 97 - far * 4}%`, bottom: `${18 + ((far * 37) % 30)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

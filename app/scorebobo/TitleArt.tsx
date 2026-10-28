"use client";

// Arte da tela de abertura, sem three.js: a prancheta tática em perspectiva
// com uma jogada desenhada em loop (passe, domínio, chute colocado no ângulo)
// e os mini-mapas das fases. Tudo SVG + CSS, calculado uma vez no módulo.

import { memo, useEffect, useRef } from "react";
import { PITCH, type ScoreLevel } from "./types";
import styles from "./scorebobo.module.css";

// ------------------------------------------------------------ geometria da jogada

type P = { x: number; y: number };
type Cubic = [P, P, P, P];

function bezier([a, b, c, d]: Cubic, t: number): P {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

const pathOf = ([a, b, c, d]: Cubic) => `M${a.x} ${a.y}C${b.x} ${b.y} ${c.x} ${c.y} ${d.x} ${d.y}`;

// Prancheta: 10 px por metro, gol lá no fundo (y = 60), meio-campo embaixo.
const GOAL_Y = 60;
const toBoard = (x: number, z: number): P => ({ x: 340 + x * 10, y: GOAL_Y + (PITCH.goalLineZ - z) * 10 });

const HERO = toBoard(-6, 30);
const MATE = toBoard(12.5, 40.5);
const CORNER = toBoard(-2.6, PITCH.goalLineZ);
const KEEPER = toBoard(0.6, 51.6);
const PASS: Cubic = [HERO, { x: HERO.x + 70, y: HERO.y + 6 }, { x: MATE.x - 40, y: MATE.y + 70 }, MATE];
const SHOT: Cubic = [MATE, { x: MATE.x - 10, y: MATE.y - 95 }, { x: CORNER.x + 120, y: CORNER.y - 10 }, CORNER];

/** Ciclo da jogada (s) e as janelas de cada ato, em fração do ciclo. */
const CYCLE = 7.2;
const at = (seconds: number) => +(seconds / CYCLE).toFixed(4);
const DRAW_A: [number, number] = [0.35, 1.3];
const KICK_A: [number, number] = [1.45, 2.05];
const DRAW_B: [number, number] = [2.55, 3.45];
const KICK_B: [number, number] = [3.6, 4.05];
const FADE: [number, number] = [6.2, 6.7];

function dots(curve: Cubic, count: number, window: [number, number]) {
  return Array.from({ length: count }, (_, index) => {
    const t = (index + 1) / (count + 1);
    const point = bezier(curve, t);
    return { ...point, appear: window[0] + (window[1] - window[0]) * t };
  });
}

const PASS_DOTS = dots(PASS, 13, DRAW_A);
const SHOT_DOTS = dots(SHOT, 16, DRAW_B);

/** Opacidade que acende em `appear` e apaga no fim do ciclo. */
function dotTimeline(appear: number) {
  const on = at(appear);
  return { values: "0;0;1;1;0;0", keyTimes: `0;${on};${Math.min(at(FADE[0]) - 0.002, on + 0.01)};${at(FADE[0])};${at(FADE[1])};1` };
}

/** Mão que encosta, arrasta pelo caminho e solta. */
function handTimeline(window: [number, number]) {
  const [start, end] = window;
  return {
    keyTimes: `0;${at(start)};${at(end)};1`,
    keyPoints: "0;0;1;1",
    opacityValues: "0;0;1;1;0;0",
    opacityTimes: `0;${at(start - 0.25)};${at(start - 0.05)};${at(end + 0.05)};${at(end + 0.3)};1`,
  };
}

const HAND_A = handTimeline(DRAW_A);
const HAND_B = handTimeline(DRAW_B);

const HAND_PATH = "M22.5 31.5V9.5a5 5 0 0 1 10 0v15.2l2.4-.6a4.6 4.6 0 0 1 5.6 3.1l.4 1.3 2-.5a4.6 4.6 0 0 1 5.6 3.3l.3 1.3 1.6-.3a4.6 4.6 0 0 1 5.4 3.9l.9 7.5c1 8.6-4.6 15.3-13.4 16.6l-5 .7c-5.6.8-10.4-1.2-13.4-6l-8.8-14a4.6 4.6 0 0 1 7.2-5.6z";

function PitchLines() {
  const box = { x: 340 - PITCH.boxHalfWidth * 10, w: PITCH.boxHalfWidth * 20, h: PITCH.boxDepth * 10 };
  const small = { x: 340 - PITCH.smallBoxHalfWidth * 10, w: PITCH.smallBoxHalfWidth * 20, h: PITCH.smallBoxDepth * 10 };
  const spot = GOAL_Y + PITCH.penaltySpot * 10;
  const arcRadius = PITCH.arcRadius * 10;
  const boxEdge = GOAL_Y + box.h;
  const arcDx = Math.sqrt(arcRadius * arcRadius - (boxEdge - spot) * (boxEdge - spot));
  return (
    <g className={styles.boardLines}>
      <rect x="0" y={GOAL_Y} width="680" height="560" />
      <rect x={box.x} y={GOAL_Y} width={box.w} height={box.h} />
      <rect x={small.x} y={GOAL_Y} width={small.w} height={small.h} />
      <circle cx="340" cy={spot} r="2.6" className={styles.boardSpot} />
      <path d={`M${340 - arcDx} ${boxEdge}A${arcRadius} ${arcRadius} 0 0 0 ${340 + arcDx} ${boxEdge}`} />
      <path d={`M0 ${GOAL_Y + 525}H680`} />
      <circle cx="340" cy={GOAL_Y + 525} r="91.5" />
    </g>
  );
}

/** A prancheta em perspectiva com a jogada em loop. */
export const TitleBackdrop = memo(function TitleBackdrop({ home, away, still }: { home: string; away: string; still: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    // Movimento reduzido: a jogada fica parada no quadro do gol.
    const svg = svgRef.current;
    if (!svg) return;
    if (still) {
      svg.pauseAnimations();
      svg.setCurrentTime(KICK_B[1] + 0.4);
    } else {
      svg.unpauseAnimations();
    }
  }, [still]);

  const stripes = Array.from({ length: 12 }, (_, index) => index);
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.sky} />
      <div className={styles.floodLeft} />
      <div className={styles.floodRight} />
      <div className={styles.crowdBand} />
      <div className={styles.boardWrap}>
        <svg ref={svgRef} className={styles.board} viewBox="0 18 680 330" preserveAspectRatio="xMidYMin meet">
          <defs>
            <linearGradient id="sbBoardGrass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#123a24" />
              <stop offset="1" stopColor="#0a2416" />
            </linearGradient>
            <radialGradient id="sbGoalGlow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#d6ff5c" stopOpacity="0.9" />
              <stop offset="1" stopColor="#d6ff5c" stopOpacity="0" />
            </radialGradient>
            <filter id="sbGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect x="-40" y="0" width="760" height="430" fill="url(#sbBoardGrass)" />
          {stripes.map((index) => (
            <rect key={index} x="-40" y={GOAL_Y + index * 52.5} width="760" height="26" fill="rgba(255,255,255,0.025)" />
          ))}
          <PitchLines />

          {/* Gol: rede e o brilho do gol que acende quando a bola entra. */}
          <rect x={340 - PITCH.goalHalfWidth * 10} y={GOAL_Y - 22} width={PITCH.goalHalfWidth * 20} height="22" className={styles.boardNet} />
          <ellipse cx={CORNER.x + 8} cy={GOAL_Y - 8} rx="70" ry="30" fill="url(#sbGoalGlow)" opacity="0">
            <animate attributeName="opacity" dur={`${CYCLE}s`} repeatCount="indefinite" values="0;0;1;0.25;0" keyTimes={`0;${at(KICK_B[1])};${at(KICK_B[1] + 0.12)};${at(KICK_B[1] + 1.2)};1`} />
          </ellipse>
          <circle cx={CORNER.x} cy={CORNER.y - 6} r="10" fill="none" stroke="#d6ff5c" strokeWidth="3" opacity="0">
            <animate attributeName="r" dur={`${CYCLE}s`} repeatCount="indefinite" values="8;8;80;80" keyTimes={`0;${at(KICK_B[1])};${at(KICK_B[1] + 0.9)};1`} />
            <animate attributeName="opacity" dur={`${CYCLE}s`} repeatCount="indefinite" values="0;0;0.9;0;0" keyTimes={`0;${at(KICK_B[1])};${at(KICK_B[1] + 0.05)};${at(KICK_B[1] + 0.9)};1`} />
          </circle>

          {/* Zagueiros e goleiro (que pula atrasado). */}
          <g className={styles.boardAway} style={{ fill: away }}>
            <circle cx={toBoard(1.5, 35).x} cy={toBoard(1.5, 35).y} r="10" />
            <circle cx={toBoard(7.5, 44).x} cy={toBoard(7.5, 44).y} r="10" />
            <circle cx={toBoard(-9, 42).x} cy={toBoard(-9, 42).y} r="10" />
            <circle cx={KEEPER.x} cy={KEEPER.y} r="10" className={styles.boardKeeper}>
              <animate attributeName="cx" dur={`${CYCLE}s`} repeatCount="indefinite" values={`${KEEPER.x};${KEEPER.x};${CORNER.x + 14};${CORNER.x + 14};${KEEPER.x}`} keyTimes={`0;${at(KICK_B[0] + 0.12)};${at(KICK_B[1] + 0.05)};${at(FADE[0])};1`} />
            </circle>
          </g>

          {/* Os nossos: o herói e o companheiro que vai receber. */}
          <g className={styles.boardHome} style={{ fill: home }}>
            <circle cx={HERO.x} cy={HERO.y} r="11" />
            <circle cx={MATE.x} cy={MATE.y} r="11" />
          </g>
          <circle cx={HERO.x} cy={HERO.y} r="17" className={styles.boardHeroRing} />
          <circle cx={MATE.x} cy={MATE.y} r="17" className={styles.boardMateRing} opacity="0">
            <animate attributeName="opacity" dur={`${CYCLE}s`} repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes={`0;${at(KICK_A[1])};${at(KICK_A[1] + 0.1)};${at(KICK_B[0])};${at(KICK_B[0] + 0.2)};1`} />
          </circle>

          {/* O traço: pontinhos que acendem por onde o dedo passa. */}
          <g filter="url(#sbGlow)">
            {[...PASS_DOTS, ...SHOT_DOTS].map((dot, index) => {
              const timeline = dotTimeline(dot.appear);
              return (
                <circle key={index} cx={dot.x.toFixed(1)} cy={dot.y.toFixed(1)} r="3.6" className={styles.boardDot} opacity="0">
                  <animate attributeName="opacity" dur={`${CYCLE}s`} repeatCount="indefinite" values={timeline.values} keyTimes={timeline.keyTimes} />
                </circle>
              );
            })}
          </g>
          <path id="sbPass" d={pathOf(PASS)} fill="none" />
          <path id="sbShot" d={pathOf(SHOT)} fill="none" />

          {/* A bola: passe, para no pé do companheiro, chute colocado. */}
          <g className={styles.boardBall}>
            <circle r="6.5" />
            <animateMotion dur={`${CYCLE}s`} repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes={`0;${at(KICK_A[0])};${at(KICK_A[1])};1`} calcMode="linear">
              <mpath href="#sbPass" />
            </animateMotion>
            <animate attributeName="opacity" dur={`${CYCLE}s`} repeatCount="indefinite" values="1;1;0;0;1" keyTimes={`0;${at(KICK_A[1])};${at(KICK_A[1] + 0.01)};${at(CYCLE - 0.05)};1`} />
          </g>
          <g className={styles.boardBall} opacity="0">
            <circle r="6.5" />
            <animateMotion dur={`${CYCLE}s`} repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes={`0;${at(KICK_B[0])};${at(KICK_B[1])};1`} calcMode="spline" keySplines="0 0 1 1;0.3 0 0.6 1;0 0 1 1">
              <mpath href="#sbShot" />
            </animateMotion>
            <animate attributeName="opacity" dur={`${CYCLE}s`} repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes={`0;${at(KICK_A[1])};${at(KICK_A[1] + 0.01)};${at(FADE[0])};${at(FADE[1])};1`} />
          </g>

          {/* A mão desenhando. */}
          {[{ id: "#sbPass", hand: HAND_A }, { id: "#sbShot", hand: HAND_B }].map(({ id, hand }) => (
            <g key={id} opacity="0">
              <animateMotion dur={`${CYCLE}s`} repeatCount="indefinite" keyPoints={hand.keyPoints} keyTimes={hand.keyTimes} calcMode="linear">
                <mpath href={id} />
              </animateMotion>
              <animate attributeName="opacity" dur={`${CYCLE}s`} repeatCount="indefinite" values={hand.opacityValues} keyTimes={hand.opacityTimes} />
              <path d={HAND_PATH} transform="translate(-27 -3) scale(0.95)" className={styles.boardHand} />
            </g>
          ))}
        </svg>
      </div>
      <div className={styles.freeze} />
      <div className={styles.fog} />
    </div>
  );
});

// ------------------------------------------------------------ mini-mapa das fases

/** A situação da fase vista de cima: área, herói, companheiros (com a corrida), marcação e goleiro. */
export const LevelMap = memo(function LevelMap({ level, home, away, locked }: { level: ScoreLevel; home: string; away: string; locked: boolean }) {
  const zs = [level.hero.pos.z, ...level.mates.map((mate) => mate.pos.z), ...level.defenders.map((defender) => defender.pos.z)];
  const top = PITCH.goalLineZ + 4;
  const bottom = Math.min(PITCH.goalLineZ - 33, Math.min(...zs) - 5);
  const height = top - bottom;
  const width = height * 1.7;
  const y = (z: number) => top - z;
  const keeper = level.keeper.pos ?? { x: 0, z: PITCH.goalLineZ - 0.8 };
  const box = PITCH.boxHalfWidth;
  const small = PITCH.smallBoxHalfWidth;
  const spotY = y(PITCH.goalLineZ - PITCH.penaltySpot);
  const boxEdge = y(PITCH.goalLineZ - PITCH.boxDepth);
  const arcDx = Math.sqrt(PITCH.arcRadius ** 2 - (boxEdge - spotY) ** 2);
  const demo = level.tutorial?.demo;
  return (
    <svg className={styles.map} viewBox={`${-width / 2} 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x={-width / 2} y="0" width={width} height={height} className={styles.mapGrass} />
      {Array.from({ length: Math.ceil(height / 5.5) }, (_, index) => (
        <rect key={index} x={-width / 2} y={y(PITCH.goalLineZ) + index * 11} width={width} height="5.5" className={styles.mapStripe} />
      ))}
      <g className={styles.mapLines}>
        <path d={`M${-PITCH.halfWidth} ${y(PITCH.goalLineZ)}H${PITCH.halfWidth}`} />
        <path d={`M${-box} ${y(PITCH.goalLineZ)}V${boxEdge}H${box}V${y(PITCH.goalLineZ)}`} />
        <path d={`M${-small} ${y(PITCH.goalLineZ)}V${y(PITCH.goalLineZ - PITCH.smallBoxDepth)}H${small}V${y(PITCH.goalLineZ)}`} />
        <path d={`M${-arcDx} ${boxEdge}A${PITCH.arcRadius} ${PITCH.arcRadius} 0 0 0 ${arcDx} ${boxEdge}`} />
        {bottom < 0.5 && <path d={`M${-PITCH.halfWidth} ${y(0)}H${PITCH.halfWidth}`} />}
      </g>
      <rect x={-PITCH.goalHalfWidth} y={y(PITCH.goalLineZ) - 1.6} width={PITCH.goalHalfWidth * 2} height="1.6" className={styles.mapGoal} />
      {demo && demo.length > 1 && (
        <polyline points={demo.map((point) => `${point.x},${y(Math.min(point.z, PITCH.goalLineZ))}`).join(" ")} className={styles.mapDemo} />
      )}
      {level.mates.map((mate) => (mate.run && mate.run.length ? (
        <polyline key={`${mate.id}-run`} points={[mate.pos, ...mate.run].map((point) => `${point.x},${y(point.z)}`).join(" ")} className={styles.mapRun} />
      ) : null))}
      {level.defenders.map((defender) => (
        <circle key={defender.id} cx={defender.pos.x} cy={y(defender.pos.z)} r="1.25" fill={away} className={styles.mapPlayer} />
      ))}
      <circle cx={keeper.x} cy={y(keeper.z)} r="1.25" className={styles.mapKeeper} />
      {level.mates.map((mate) => (
        <circle key={mate.id} cx={mate.pos.x} cy={y(mate.pos.z)} r="1.3" fill={home} className={styles.mapPlayer} />
      ))}
      <circle cx={level.hero.pos.x} cy={y(level.hero.pos.z)} r="2.6" className={locked ? styles.mapHeroRingLocked : styles.mapHeroRing} />
      <circle cx={level.hero.pos.x} cy={y(level.hero.pos.z)} r="1.45" fill={home} className={styles.mapPlayer} />
    </svg>
  );
});

"use client";

// Uma fase do Scorebobo em tela cheia: liga a simulação (`sim/`) à cena
// (`three/`), lê o dedo/mouse e desenha a camada de TV por cima.
//
// O laço é daqui: a cada quadro a simulação avança, a cena desenha o estado e
// os eventos novos viram som, flash e faixa. O React só re-renderiza quando
// algo do HUD muda de verdade (fase, bolas, passes, relógio, resultado) — o
// anel da bola, a mão do tutorial e o rastro do dedo andam por fora dele.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { ScoreboboGame } from "./sim/game";
import { PITCH } from "./types";
import type { GameState, KickPlan, Outcome, Phase, ScoreboboGameApi, ScoreboboViewApi, ScoreLevel, ScoreTeams, SimEvent, StrokeSample, Vec3 } from "./types";
import type { ScoreboboViewOptions } from "./three/view";
import { primeScoreboboAudio, playUiSound, ScoreboboAudio } from "./audio";
import { recordStars, type StarCount, type TeamInfo } from "./storage";
import {
  AimHint,
  AttemptBalls,
  Confetti,
  describeRule,
  formatClock,
  IconButton,
  IntroCard,
  ObjectiveChip,
  OutcomeBanner,
  PassCounter,
  PauseGlyph,
  PlanChip,
  ReplayTag,
  ScoreBug,
  SoundGlyph,
  StarDefs,
  Toast,
  type ConfettiPiece,
  type PlanSummary,
} from "./Hud";
import { Results } from "./Results";
import { TutorialOverlay, type ScreenPoint, type TutorialHandle } from "./Tutorial";
import styles from "./hud.module.css";

/** Como a fase cria simulação e cena. O padrão usa `sim/game` e `three/view`; laboratórios trocam. */
export type ScoreboboEngine = {
  createGame(level: ScoreLevel, teams: ScoreTeams, seed: number): ScoreboboGameApi;
  createView(canvas: HTMLCanvasElement, options: ScoreboboViewOptions): Promise<ScoreboboViewApi>;
};

const DEFAULT_ENGINE: ScoreboboEngine = {
  createGame: (level, teams, seed) => new ScoreboboGame(level, teams, { seed }),
  // A cena (e o three.js) só baixa aqui: o menu abre leve.
  createView: async (canvas, options) => {
    const { ScoreboboView } = await import("./three/view");
    return new ScoreboboView(canvas, options);
  },
};

export type LevelPlayerProps = {
  /** A fase já com o herói do jogador. */
  level: ScoreLevel;
  levelIndex: number;
  teams: ScoreTeams;
  home: TeamInfo;
  away: TeamInfo;
  performance: boolean;
  muted: boolean;
  onToggleMute: () => void;
  hasNext: boolean;
  nextUnlocked: boolean;
  onNext: () => void;
  onLevels: () => void;
  engine?: ScoreboboEngine;
};

/** Se a cena não ficar pronta nesse tempo, avisa em vez de deixar a tela preta. */
const PREPARE_TIMEOUT_MS = 25000;
/** Resultado sem vitória: quanto a reação fica na tela antes da próxima bola. */
const OUTCOME_HOLD_MS = 3000;
/** Toque para seguir só depois disso (ninguém pula o gol sem querer). */
const OUTCOME_MIN_MS = 800;
const AIM_HINT = "Desenhe a partir da bola: até um companheiro ou até o gol";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const readReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const serverReducedMotion = () => false;

type HudSnapshot = {
  phase: Phase;
  attemptsLeft: number;
  passes: number;
  clock: string;
  outcome: Outcome | null;
  goals: number;
  slow: boolean;
  heroId: string;
  /** Muda a cada resultado novo (a faixa anima uma vez por resultado, não a cada segundo do relógio). */
  outcomeKey: string;
};

type Hint = { text: string; tone: "info" | "error"; key: number };

type Stroke = {
  pointerId: number;
  samples: StrokeSample[];
  /** Onde o dedo encostou e se ele já saiu do lugar (a pausa antes de arrastar não conta tempo). */
  down: { x: number; y: number };
  moved: boolean;
  /** Bola no ar: altura do plano em que o traço é lido. */
  airY: number | null;
  /** Comprimento na tela (px), para "traço curto" e a tensão do som. */
  length: number;
  dirty: boolean;
  short: number;
  /** Tamanho do canvas: a simulação mede a força do traço em "telas por segundo". */
  viewport: { width: number; height: number };
};

type TrailPoint = { x: number; y: number; t: number };

/** Vibração curta no celular (chute, trave, gol, traço recusado). Sem suporte, nada. */
function buzz(enabled: boolean, pattern: number | number[]) {
  if (!enabled || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Alguns WebViews recusam sem permissão: segue sem tremer.
  }
}

/** Tela → mundo: o traço vai pelo gramado (ou no ar, na altura da bola) e sobe para o plano do gol quando aponta para ele. */
function strokePoints(samples: StrokeSample[], airY: number | null): Vec3[] {
  const points: Vec3[] = [];
  for (const sample of samples) {
    if (airY !== null && sample.air && sample.air.z <= PITCH.goalLineZ) points.push({ x: sample.air.x, y: airY, z: sample.air.z });
    else if (sample.ground && sample.ground.z <= PITCH.goalLineZ) points.push({ x: sample.ground.x, y: 0, z: sample.ground.z });
    else if (sample.goal) points.push(sample.goal);
    else if (sample.ground) points.push({ x: sample.ground.x, y: 0, z: sample.ground.z });
  }
  return points;
}

type EdgeArrow = { x: number; y: number; target: { x: number; y: number } };

/**
 * Traço que termina numa seta da borda: vira passe para quem está fora do
 * quadro (um ponto a mais, no pé dele, com o tempo da velocidade do traço).
 */
function edgeSnap(stroke: Stroke, view: ScoreboboViewApi, edges: Map<string, EdgeArrow>): StrokeSample[] {
  const samples = stroke.samples;
  const last = samples[samples.length - 1];
  if (!last || samples.length < 2) return samples;
  for (const edge of edges.values()) {
    if (Math.hypot(last.screen.x - edge.x, last.screen.y - edge.y) > 48) continue;
    const extra = Math.hypot(edge.target.x - last.screen.x, edge.target.y - last.screen.y);
    const span = Math.max(16, last.t - samples[0].t);
    const speed = Math.max(0.25, stroke.length / span);
    const projected = view.project(edge.target.x, edge.target.y, stroke.airY ?? undefined);
    return [...samples, { screen: { ...edge.target }, t: last.t + extra / speed, ...projected, viewport: stroke.viewport }];
  }
  return samples;
}

function summarize(plan: KickPlan, state: GameState): PlanSummary {
  const receiver = plan.receiver ? state.actors.find((actor) => actor.id === plan.receiver) : null;
  return {
    kind: plan.kind,
    shot: plan.shot,
    curve: Math.round(plan.curve * 2) / 2,
    accuracy: Math.round(Math.max(0, Math.min(1, plan.accuracy)) * 20) / 20,
    receiver: receiver ? receiver.name : null,
    cross: !plan.shot && plan.target.y > 1.2 && Math.abs(plan.target.x) < PITCH.boxHalfWidth && plan.target.z > PITCH.goalLineZ - PITCH.boxDepth,
    // Só o corte no caminho avisa: a disputa na chegada quase sempre fica com quem recebe (medido na simulação).
    danger: plan.danger?.some((span) => !span.contest) ? "cut" : null,
  };
}

const samePlan = (a: PlanSummary | null, b: PlanSummary | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.shot === b.shot && a.curve === b.curve && a.accuracy === b.accuracy && a.receiver === b.receiver && a.cross === b.cross && a.danger === b.danger);

function confettiFor(home: TeamInfo): ConfettiPiece[] {
  const palette = [home.primary, home.secondary, "#ffffff", "#ffd23f", home.primary];
  return Array.from({ length: 46 }, (_, index) => ({
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.8 + Math.random() * 1.6,
    drift: (Math.random() - 0.5) * 220,
    spin: 360 + Math.random() * 900,
    color: palette[index % palette.length],
    size: 7 + Math.random() * 9,
  }));
}

export default function LevelPlayer({ level, levelIndex, teams, home, away, performance: performanceMode, muted, onToggleMute, hasNext, nextUnlocked, onNext, onLevels, engine = DEFAULT_ENGINE }: LevelPlayerProps) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);

  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [hint, setHint] = useState<Hint>({ text: AIM_HINT, tone: "info", key: 0 });
  const [toast, setToast] = useState<{ text: string; sub?: string; key: number } | null>(null);
  const [goalFx, setGoalFx] = useState<{ key: number; pieces: ConfettiPiece[] } | null>(null);
  const [paused, setPaused] = useState(false);
  const [results, setResults] = useState<{ stars: StarCount; record: boolean; notes: string[]; met?: [boolean, boolean, boolean] } | null>(null);
  // O modo desempenho vale a partir da montagem: trocar em outra aba não recomeça a fase no meio.
  const [performanceAtMount] = useState(performanceMode);
  const [touchUi, setTouchUi] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);
  const [replayStats, setReplayStats] = useState<string | null>(null);
  const [tutorialDone, setTutorialDone] = useState(!level.tutorial);
  const [bump, setBump] = useState(0);
  const [freezeKey, setFreezeKey] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const tapRef = useRef<HTMLDivElement>(null);
  const tutorialRef = useRef<TutorialHandle>(null);
  /** Setas na borda para companheiros fora do quadro (o traço que termina nelas passa para ele). */
  const arrowRefs = useRef(new Map<string, HTMLDivElement>());
  const edgeRef = useRef(new Map<string, { x: number; y: number; target: { x: number; y: number } }>());
  /** Quem chutou, em ordem (a tabela: recebe de volta quem tocou dois lances antes). */
  const kickersRef = useRef<string[]>([]);
  /** Último plano válido do traço (soltar fora da tela não perde a jogada que a prévia mostrou). */
  const lastPlanRef = useRef<KickPlan | null>(null);
  const goalFactsRef = useRef<{ distance: number; curve: number } | null>(null);
  const frameRef = useRef(0);

  const gameRef = useRef<ScoreboboGameApi | null>(null);
  const viewRef = useRef<ScoreboboViewApi | null>(null);
  const audioRef = useRef<ScoreboboAudio | null>(null);
  const strokeRef = useRef<Stroke | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const trailFadeRef = useRef(0);
  const pausedRef = useRef(false);
  const resultsRef = useRef(false);
  const tutorialDoneRef = useRef(!level.tutorial);
  const planRef = useRef<PlanSummary | null>(null);
  const hudKeyRef = useRef("");
  // `active`: segundos de jogo rodando nesta fase (pausa, aba escondida e engasgos não contam: quem volta não perde o replay).
  const phaseRef = useRef<{ phase: Phase | null; since: number; active: number; retryAt: number; forceAt: number }>({ phase: null, since: 0, active: 0, retryAt: 0, forceAt: 0 });
  /** Melhor resultado desta visita (para as notas do resultado e se a simulação não fechar a fase sozinha). */
  const bestOutcomeRef = useRef<Outcome | null>(null);
  const lastOutcomeRef = useRef<Outcome | null>(null);
  const reducedRef = useRef(reducedMotion);
  /** Último toque foi de dedo: só aí o celular vibra (mouse não tem o que tremer). */
  const touchRef = useRef(false);
  const nudgeTimerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(nudgeTimerRef.current), []);

  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  // ------------------------------------------------------------ montagem

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let view: ScoreboboViewApi | null = null;
    const fail = () => {
      if (cancelled) return;
      cancelled = true;
      viewRef.current = null;
      setStatus("failed");
    };
    // Um canvas novo por cena: o WebGL de um canvas descartado (dispose,
    // remontagem do Fast Refresh) não volta.
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    canvas.setAttribute("aria-hidden", "true");
    host.prepend(canvas);
    const game = engine.createGame(level, teams, (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
    gameRef.current = game;
    bestOutcomeRef.current = null;
    lastOutcomeRef.current = null;
    phaseRef.current = { phase: null, since: performance.now(), active: 0, retryAt: 0, forceAt: 0 };
    const audio = new ScoreboboAudio();
    audioRef.current = audio;
    audio.enter();
    const timer = window.setTimeout(fail, PREPARE_TIMEOUT_MS);
    engine
      .createView(canvas, { performance: performanceAtMount, reducedMotion: reducedRef.current, onContextLost: fail })
      .then(async (created) => {
        view = created;
        if (cancelled) return;
        await created.prepare(level, teams, game.state);
        if (cancelled) return;
        window.clearTimeout(timer);
        created.render(game.state, 0, []);
        viewRef.current = created;
        setStatus("ready");
      })
      .catch(fail);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      viewRef.current = null;
      gameRef.current = null;
      try {
        view?.dispose();
      } catch {
        // A cena já tinha caído.
      }
      canvas.remove();
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [engine, level, teams, performanceAtMount]);

  // ------------------------------------------------------------ laço

  const publishHud = useCallback((state: GameState) => {
    const outcome = state.outcome;
    // Gol anulado não entra no placar.
    const goals = outcome?.result === "goal" && outcome.stars > 0 && (state.phase === "outcome" || state.phase === "replay" || state.phase === "done") ? 1 : 0;
    const clock = formatClock(level.clock, state.time);
    // Câmera lenta de verdade (gol, defesa); o "aim" tem o próprio visual de tempo congelado.
    const slow = state.timeScale < 0.75 && state.phase !== "aim";
    const outcomeId = outcome ? `${outcome.result}:${outcome.stars}:${outcome.label}:${state.attempt}` : "-";
    const key = `${state.phase}|${state.attemptsLeft}|${state.passes}|${clock}|${outcomeId}|${goals}|${slow}|${state.heroId}`;
    if (key === hudKeyRef.current) return;
    hudKeyRef.current = key;
    setHud({ phase: state.phase, attemptsLeft: state.attemptsLeft, passes: state.passes, clock, outcome, goals, slow, heroId: state.heroId, outcomeKey: outcomeId });
  }, [level.clock]);

  const finish = useCallback((stars: StarCount, notes: string[], met?: [boolean, boolean, boolean]) => {
    if (resultsRef.current) return;
    resultsRef.current = true;
    const record = recordStars(level.id, stars);
    if (stars > 0) audioRef.current?.finalWhistle();
    setResults({ stars, record, notes, met });
  }, [level.id]);

  /** Próxima bola depois de um resultado sem vitória (ou fecha a fase sem bolas). */
  const advance = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.state.phase !== "outcome") return;
    const marker = phaseRef.current;
    const now = performance.now();
    // A simulação pode recusar (resultado ainda não decidido): tenta de novo, sem martelar a cada quadro.
    if (now < marker.retryAt) return;
    marker.retryAt = now + 400;
    const won = (game.state.outcome?.stars ?? 0) > 0;
    const last = won || game.state.attemptsLeft <= 0;
    if (last) game.skip();
    else game.nextAttempt();
    // Se a simulação não fechar a fase sozinha, a interface fecha.
    if (last && game.state.phase === "outcome" && game.state.outcome && !marker.forceAt) marker.forceAt = marker.active + 2.5;
  }, []);

  const handleEvents = useCallback((events: SimEvent[], state: GameState) => {
    // O replay repete os eventos (som e rede); o celular só treme ao vivo.
    const live = state.phase !== "replay";
    for (const event of events) {
      if (event.type === "kick") {
        if (!live) continue;
        kickersRef.current.push(event.actor);
        buzz(touchRef.current, Math.round(10 + event.power * 18));
      } else if (event.type === "post") {
        if (live) buzz(touchRef.current, 45);
      } else if (event.type === "goal") {
        if (!live) continue;
        goalFactsRef.current = { distance: event.distance, curve: event.curve };
        if (event.valid === false) {
          // Não valeu: sem festa (a faixa diz o que faltou).
          buzz(touchRef.current, [60, 40, 60]);
          continue;
        }
        buzz(touchRef.current, [35, 50, 70, 40, 110]);
        setBump((value) => value + 1);
        setGoalFx({ key: performance.now(), pieces: reducedRef.current ? [] : confettiFor(home) });
      } else if (event.type === "control") {
        setFreezeKey((value) => value + 1);
        const actor = state.actors.find((item) => item.id === event.actor);
        const name = actor ? actor.name : "ele";
        const kickers = kickersRef.current;
        const plan = state.plan;
        let toastText = "DOMINOU!";
        let sub = `Com ${name} — desenhe a próxima`;
        if (actor?.pose === "header") {
          toastText = "CABECEIE!";
          sub = `${name} subiu — desenhe a cabeçada até o gol`;
        } else if (actor?.pose === "volley") {
          toastText = "DE PRIMEIRA!";
          sub = `${name} pega no ar — desenhe o voleio`;
        } else if (kickers.length >= 2 && kickers[kickers.length - 2] === event.actor) {
          toastText = "TABELA!";
          sub = `A bola voltou para ${name}`;
        } else if (plan && !plan.shot && plan.receiver === event.actor && plan.timing !== undefined && plan.timing < 0.18) {
          toastText = "NA MEDIDA!";
          sub = `Passe no tempo da corrida de ${name}`;
          buzz(touchRef.current, [12, 40, 12]);
        }
        setToast({ text: toastText, sub, key: performance.now() });
      }
    }
  }, [home]);

  const drawTrail = useCallback((now: number) => {
    const canvas = trailCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const stroke = strokeRef.current;
    const points = trailRef.current;
    const fading = !stroke && now < trailFadeRef.current;
    if (!stroke && !fading) {
      if (points.length) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        trailRef.current = [];
      }
      return;
    }
    const ratio = canvas.width / Math.max(1, canvas.clientWidth);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    // Cometa na ponta do dedo: só os últimos ~0,22 s, afinando para trás.
    const span = 220;
    const head = stroke ? now : trailFadeRef.current - 260;
    const fade = stroke ? 1 : Math.max(0, (trailFadeRef.current - now) / 260);
    const recent = points.filter((point) => head - point.t < span);
    if (recent.length < 2) return;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (let index = 1; index < recent.length; index += 1) {
      const a = recent[index - 1];
      const b = recent[index];
      const age = Math.max(0, Math.min(1, (head - b.t) / span));
      const k = (1 - age) * fade;
      context.strokeStyle = `rgba(214, 255, 92, ${0.16 * k})`;
      context.lineWidth = 22 * k + 2;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.strokeStyle = `rgba(255, 255, 255, ${0.85 * k})`;
      context.lineWidth = 4 * k + 1;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const delta = (now - last) / 1000;
      last = now;
      if (document.hidden || pausedRef.current) return;
      // Atrás da tela de resultado a cena só respira (bateria do celular): um quadro em quatro.
      frameRef.current += 1;
      if (resultsRef.current && frameRef.current % 4 !== 0) return;
      // Um engasgo longo atrasa a jogada em vez de teleportar a bola.
      const dt = Math.min(resultsRef.current ? 0.1 : 0.05, Math.max(0, delta));
      const game = gameRef.current;
      const view = viewRef.current;
      if (!game || !view) return;

      // Traço em andamento: um plano por quadro, não um por evento do ponteiro.
      const stroke = strokeRef.current;
      if (stroke?.dirty && game.state.phase === "aim") {
        stroke.dirty = false;
        const samples = edgeSnap(stroke, view, edgeRef.current);
        const planned = game.planKick(samples);
        if (planned) lastPlanRef.current = planned;
        view.setStroke(strokePoints(samples, stroke.airY), planned);
        const summary = planned ? summarize(planned, game.state) : null;
        if (!samePlan(summary, planRef.current)) {
          // Tique no dedo quando o traço "pega" um companheiro.
          if (summary?.receiver && summary.receiver !== planRef.current?.receiver) buzz(touchRef.current, 8);
          planRef.current = summary;
          setPlan(summary);
        }
        audioRef.current?.setDrawing(Math.min(1, stroke.length / (stroke.short * 0.9)) * (planned ? 1 : 0.5));
      }

      let events: SimEvent[];
      try {
        events = game.step(dt);
        view.render(game.state, dt, events);
      } catch (error) {
        console.error("[scorebobo] quadro falhou", error);
        viewRef.current = null;
        setStatus("failed");
        return;
      }
      const state = game.state;
      audioRef.current?.handleEvents(events);
      audioRef.current?.update(state, dt);
      if (events.length) handleEvents(events, state);

      // Mudança de fase: limpa o traço, marca o relógio do resultado.
      const marker = phaseRef.current;
      if (state.phase !== marker.phase) {
        const previous = marker.phase;
        phaseRef.current = { phase: state.phase, since: now, active: 0, retryAt: 0, forceAt: 0 };
        if (previous === "flight" || state.phase === "aim" || state.phase === "intro") {
          if (strokeRef.current) {
            strokeRef.current = null;
            setDrawing(false);
          }
          view.setStroke(null, null);
          audioRef.current?.setDrawing(null);
        }
        if (state.phase !== "aim") {
          planRef.current = null;
          setPlan(null);
        }
        if (state.phase === "intro") kickersRef.current = [];
        if (state.phase === "replay") {
          // Ficha do lance na tarja do replay: velocidade, curva e distância.
          const shot = state.plan?.shot ? state.plan : null;
          const facts = goalFactsRef.current;
          const parts: string[] = [];
          if (shot) parts.push(`${Math.round(shot.speed * 3.6)} km/h`);
          if (facts && facts.curve >= 0.8) parts.push(`curva ${facts.curve.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m`);
          if (facts) parts.push(`${Math.round(facts.distance)} m`);
          setReplayStats(parts.length ? parts.join(" · ") : null);
        }
      }
      if (state.outcome && state.outcome !== lastOutcomeRef.current) {
        lastOutcomeRef.current = state.outcome;
        const best = bestOutcomeRef.current;
        if (!best || state.outcome.stars >= best.stars) bestOutcomeRef.current = state.outcome;
      }

      // Resultado sem vitória: segura a reação e vai para a próxima bola.
      const current = phaseRef.current;
      current.active += dt;
      if (state.phase === "outcome") {
        const won = (state.outcome?.stars ?? 0) > 0;
        const held = current.active * 1000;
        // A simulação avisa quando a reação acabou (`waitingForNext`); sem o aviso, vale o relógio daqui.
        const waiting = (game as { waitingForNext?: boolean }).waitingForNext;
        const due = won ? held > 9000 : waiting === undefined ? held > OUTCOME_HOLD_MS : waiting;
        if (due) advance();
      }
      // A rede de segurança do replay só vale para o replay que já está rodando (não o que o `advance` acabou de abrir).
      if (state.phase === "replay" && current.phase === "replay" && current.active > 15) game.skip();
      if (state.phase === "done") {
        const best = bestOutcomeRef.current;
        // Estrelas DESTA tentativa da fase (o `bestStars` da simulação atravessa o "Tentar de novo").
        finish((best ? best.stars : state.bestStars) as StarCount, (best ?? state.outcome)?.notes ?? [], (best ?? state.outcome)?.met);
      } else if (current.forceAt && current.active > current.forceAt && state.phase === "outcome") {
        const best = bestOutcomeRef.current;
        finish((best ? best.stars : state.bestStars) as StarCount, best?.notes ?? [], best?.met);
      }

      // Anel na bola (onde o traço começa) e mão do tutorial.
      const ring = ringRef.current;
      const aiming = state.phase === "aim" && !strokeRef.current && !resultsRef.current;
      const ball = aiming ? view.screenOf(state.ball.pos) : null;
      if (ring) {
        if (ball) {
          const host = hostRef.current;
          const short = host ? Math.min(host.clientWidth, host.clientHeight) : 600;
          const radius = Math.max(48, short * 0.07);
          ring.style.opacity = "1";
          ring.style.transform = `translate3d(${ball.x}px, ${ball.y}px, 0)`;
          ring.style.setProperty("--size", `${Math.round(radius * 1.25)}px`);
        } else {
          ring.style.opacity = "0";
        }
      }
      // Setas na borda: companheiro fora do quadro (no celular em pé, quem abre no lado não cabe).
      const edges = edgeRef.current;
      edges.clear();
      const showArrows = state.phase === "aim" && !resultsRef.current;
      const host = hostRef.current;
      const width = host?.clientWidth ?? 0;
      const height = host?.clientHeight ?? 0;
      for (const [id, element] of arrowRefs.current) {
        const actor = showArrows ? state.actors.find((item) => item.id === id) : null;
        const point = actor && actor.role === "mate" ? view.screenOf({ x: actor.pos.x, y: 0, z: actor.pos.z }) : null;
        const outside = point && (point.x < 10 || point.x > width - 10 || point.y < 10 || point.y > height - 10);
        if (!point || !outside) {
          element.style.opacity = "0";
          continue;
        }
        const x = Math.min(width - 40, Math.max(40, point.x));
        const y = Math.min(height - 92, Math.max(92, point.y));
        element.style.opacity = "1";
        element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        element.style.setProperty("--angle", `${Math.atan2(point.y - y, point.x - x)}rad`);
        edges.set(id, { x, y, target: point });
      }

      const tutorial = level.tutorial;
      if (tutorial && !tutorialDoneRef.current && tutorialRef.current) {
        let points: ScreenPoint[] | null = null;
        if (aiming) {
          points = [];
          for (const point of tutorial.demo) {
            // Ponto na linha do gol: a mão termina dentro do gol, não no gramado atrás.
            const lifted = point.z >= PITCH.goalLineZ - 0.01;
            const screen = view.screenOf({ x: point.x, y: lifted ? 0.9 : 0, z: Math.min(point.z, PITCH.goalLineZ) });
            if (screen) points.push(screen);
          }
        }
        tutorialRef.current.update(points, now);
      }
      drawTrail(now);
      publishHud(state);
    };
    frame = requestAnimationFrame(tick);
    const onVisibility = () => {
      last = performance.now();
      audioRef.current?.setPaused(document.hidden || pausedRef.current);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, level.tutorial, advance, finish, handleEvents, drawTrail, publishHud]);

  // O rastro do dedo acompanha o tamanho da tela (nitidez de retina).
  useEffect(() => {
    const canvas = trailCanvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Dica de erro some sozinha.
  useEffect(() => {
    if (hint.tone !== "error") return;
    const timer = window.setTimeout(() => setHint((current) => (current.key === hint.key ? { text: AIM_HINT, tone: "info", key: current.key + 1 } : current)), 1900);
    return () => window.clearTimeout(timer);
  }, [hint]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => (current?.key === toast.key ? null : current)), 1900);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!goalFx) return;
    const timer = window.setTimeout(() => setGoalFx((current) => (current?.key === goalFx.key ? null : current)), 3600);
    return () => window.clearTimeout(timer);
  }, [goalFx]);

  // Tela cheia de verdade: sem rolar a página por trás.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // ------------------------------------------------------------ ações

  const setPausedBoth = useCallback((value: boolean) => {
    pausedRef.current = value;
    setPaused(value);
    audioRef.current?.setPaused(value);
  }, []);

  const pause = useCallback(() => {
    if (resultsRef.current) return;
    // Pausar no meio do traço descarta o traço: ao voltar, o dedo já saiu da tela.
    if (strokeRef.current) {
      strokeRef.current = null;
      setDrawing(false);
      viewRef.current?.setStroke(null, null);
      audioRef.current?.setDrawing(null);
    }
    playUiSound("pause");
    setPausedBoth(true);
  }, [setPausedBoth]);

  const resume = useCallback(() => {
    primeScoreboboAudio();
    playUiSound("click");
    setPausedBoth(false);
  }, [setPausedBoth]);

  const restart = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    primeScoreboboAudio();
    playUiSound("select");
    game.restart();
    strokeRef.current = null;
    viewRef.current?.setStroke(null, null);
    audioRef.current?.setDrawing(null);
    resultsRef.current = false;
    bestOutcomeRef.current = null;
    lastOutcomeRef.current = null;
    planRef.current = null;
    phaseRef.current = { phase: null, since: performance.now(), active: 0, retryAt: 0, forceAt: 0 };
    kickersRef.current = [];
    lastPlanRef.current = null;
    goalFactsRef.current = null;
    setReplayStats(null);
    setDrawing(false);
    setPlan(null);
    setResults(null);
    setGoalFx(null);
    setToast(null);
    setPausedBoth(false);
  }, [setPausedBoth]);

  const skip = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    playUiSound("click");
    if (game.state.phase === "outcome") advance();
    else game.skip();
  }, [advance]);

  const leave = useCallback(() => {
    playUiSound("back");
    onLevels();
  }, [onLevels]);

  const next = useCallback(() => {
    playUiSound("select");
    onNext();
  }, [onNext]);

  const toggleMute = useCallback(() => {
    primeScoreboboAudio();
    onToggleMute();
  }, [onToggleMute]);

  const rejectStroke = useCallback((text: string, x?: number, y?: number) => {
    buzz(touchRef.current, 14);
    setHint((current) => ({ text, tone: "error", key: current.key + 1 }));
    playUiSound("error");
    const tap = tapRef.current;
    if (tap && x !== undefined && y !== undefined) {
      tap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      tap.classList.remove(styles.tapReject);
      // Reinicia a animação do "x" vermelho no lugar do toque.
      void tap.offsetWidth;
      tap.classList.add(styles.tapReject);
    }
    const ring = ringRef.current;
    if (ring) {
      ring.classList.remove(styles.ballRingNudge);
      void ring.offsetWidth;
      ring.classList.add(styles.ballRingNudge);
      // O anel volta ao verde depois do tremor (vermelho fixo parecia proibição).
      window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = window.setTimeout(() => ring.classList.remove(styles.ballRingNudge), 900);
    }
  }, []);

  // ------------------------------------------------------------ ponteiro

  const pointFrom = (event: { clientX: number; clientY: number }) => {
    const rect = hostRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    touchRef.current = event.pointerType === "touch";
    if (touchRef.current !== touchUi) setTouchUi(touchRef.current);
    primeScoreboboAudio();
    const game = gameRef.current;
    const view = viewRef.current;
    if (!game || !view || pausedRef.current || resultsRef.current) return;
    const phase = game.state.phase;
    if (phase === "intro" || phase === "replay") {
      game.skip();
      return;
    }
    if (phase === "outcome") {
      if (performance.now() - phaseRef.current.since > OUTCOME_MIN_MS) advance();
      return;
    }
    if (phase !== "aim" || strokeRef.current) return;
    const host = hostRef.current;
    if (!host) return;
    const { x, y } = pointFrom(event);
    const short = Math.min(host.clientWidth, host.clientHeight);
    const radius = Math.max(48, short * 0.07);
    const state = game.state;
    // Bola no ar (cabeceio/voleio): o traço é lido na altura dela.
    const airY = !state.ball.owner && state.ball.pos.y > 0.4 ? state.ball.pos.y : null;
    // Onde a bola está NA TELA agora (a câmera pode estar chegando na mira): é nela que o dedo mirou.
    const shown = view.screenOf(state.ball.pos);
    // Projetar trava a câmera na mira; a bola é relida no lugar final.
    const here = view.project(x, y, airY ?? undefined);
    const ball = view.screenOf(state.ball.pos);
    const near = (p: { x: number; y: number } | null) => !!p && Math.hypot(p.x - x, p.y - y) <= radius;
    if (!ball || !(near(ball) || near(shown))) {
      rejectStroke("Comece o traço na bola", x, y);
      return;
    }
    event.preventDefault();
    try {
      host.setPointerCapture(event.pointerId);
    } catch {
      // Ponteiro sintético ou já solto: segue sem captura.
    }
    // O traço nasce NA bola (o dedo encostou perto dela): a linha sai do pé, não de onde o dedo caiu.
    const now = performance.now();
    const viewport = { width: host.clientWidth, height: host.clientHeight };
    const samples: StrokeSample[] = [{ screen: { x: ball.x, y: ball.y }, t: now, ...view.project(ball.x, ball.y, airY ?? undefined), viewport }];
    const offset = Math.hypot(ball.x - x, ball.y - y);
    if (offset > 8 && near(ball)) samples.push({ screen: { x, y }, t: now, ...here, viewport });
    lastPlanRef.current = null;
    strokeRef.current = { pointerId: event.pointerId, samples, down: { x, y }, moved: false, airY, length: offset > 8 && near(ball) ? offset : 0, dirty: true, short, viewport };
    trailRef.current = [{ x: ball.x, y: ball.y, t: now }, { x, y, t: now }];
    if (!tutorialDoneRef.current) {
      tutorialDoneRef.current = true;
      setTutorialDone(true);
    }
    setDrawing(true);
    audioRef.current?.setDrawing(0.05);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stroke = strokeRef.current;
    const view = viewRef.current;
    if (!stroke || !view || event.pointerId !== stroke.pointerId) return;
    const native = event.nativeEvent;
    // Eventos agrupados: em 120 Hz o traço não vira um polígono.
    const list = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const moves = list.length ? list : [native];
    const now = performance.now();
    for (const move of moves) {
      const { x, y } = pointFrom(move);
      const lastSample = stroke.samples[stroke.samples.length - 1];
      const step = Math.hypot(x - lastSample.screen.x, y - lastSample.screen.y);
      trailRef.current.push({ x, y, t: now });
      if (!stroke.moved && Math.hypot(x - stroke.down.x, y - stroke.down.y) > 6) {
        // Encostou, esperou e só então arrastou: o relógio da força começa agora
        // (senão a espera virava traço lento e o chute saía fraco).
        stroke.moved = true;
        stroke.samples = stroke.samples.map((sample) => ({ ...sample, t: now - 16 }));
      }
      if (step < 4 || stroke.samples.length >= 480) continue;
      stroke.samples.push({ screen: { x, y }, t: now, ...view.project(x, y, stroke.airY ?? undefined), viewport: stroke.viewport });
      stroke.length += step;
      stroke.dirty = true;
    }
    if (trailRef.current.length > 240) trailRef.current.splice(0, trailRef.current.length - 240);
  };

  const endStroke = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const stroke = strokeRef.current;
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    strokeRef.current = null;
    trailFadeRef.current = performance.now() + 260;
    setDrawing(false);
    planRef.current = null;
    setPlan(null);
    audioRef.current?.setDrawing(null);
    const game = gameRef.current;
    const view = viewRef.current;
    if (!game || !view) return;
    if (cancelled || game.state.phase !== "aim") {
      view.setStroke(null, null);
      return;
    }
    const minimum = Math.max(36, stroke.short * 0.06);
    const samples = edgeSnap(stroke, view, edgeRef.current);
    // Se o último pedaço (dedo saindo da tela) não dá leitura, vale o que a prévia mostrava.
    const finalPlan = stroke.length >= minimum ? game.planKick(samples) ?? lastPlanRef.current : null;
    lastPlanRef.current = null;
    if (!finalPlan) {
      view.setStroke(null, null);
      const { x, y } = pointFrom(event);
      rejectStroke(stroke.length < minimum ? "Traço curto" : "Leve o traço até um companheiro ou até o gol", x, y);
      return;
    }
    // O traço fica no gramado durante o voo; some quando a jogada termina.
    view.setStroke(strokePoints(samples, stroke.airY), finalPlan);
    game.commitKick(finalPlan);
  };

  // ------------------------------------------------------------ teclado

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === "escape" || key === "p") {
        event.preventDefault();
        if (resultsRef.current) return;
        if (pausedRef.current) resume();
        else pause();
      } else if (key === "m") {
        toggleMute();
      } else if ((key === " " || key === "enter") && !pausedRef.current && !resultsRef.current) {
        const phase = gameRef.current?.state.phase;
        if (phase === "intro" || phase === "replay" || phase === "outcome") {
          event.preventDefault();
          skip();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause, resume, skip, toggleMute]);

  // ------------------------------------------------------------ desenho

  const phase = hud?.phase ?? "intro";
  const outcome = hud?.outcome ?? null;
  const showAim = status === "ready" && phase === "aim" && !paused && !results;
  const letterbox = status === "ready" && (phase === "intro" || phase === "replay");
  const infoHint = level.tutorial && !tutorialDone ? level.tutorial.hint : AIM_HINT;

  return (
    <div
      ref={rootRef}
      className={`${styles.stage} ${hud?.slow ? styles.stageSlow : ""} ${showAim ? styles.stageFrozen : ""} ${drawing ? styles.stageDrawing : ""} ${paused ? styles.stagePaused : ""}`}
      tabIndex={-1}
      style={{ "--home": home.primary, "--home2": home.secondary, "--away": away.primary } as CSSProperties}
    >
      <StarDefs />
      <div
        ref={hostRef}
        className={styles.host}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endStroke(event, false)}
        onPointerCancel={(event) => endStroke(event, true)}
        onLostPointerCapture={(event) => endStroke(event, false)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <canvas ref={trailCanvasRef} className={styles.trail} aria-hidden="true" />
        <div ref={ringRef} className={styles.ballRing} style={{ opacity: 0 }} aria-hidden="true"><i /><b /></div>
        <div ref={tapRef} className={styles.tap} aria-hidden="true" />
        {[level.hero, ...level.mates].map((mate) => (
          <div
            key={mate.id}
            ref={(element) => {
              if (element) arrowRefs.current.set(mate.id, element);
              else arrowRefs.current.delete(mate.id);
            }}
            className={styles.edgeArrow}
            style={{ opacity: 0 }}
            aria-hidden="true"
          >
            <i />
            <b>{mate.number}</b>
          </div>
        ))}
      </div>

      <div className={`${styles.letterbox} ${letterbox ? styles.letterboxOn : ""}`} aria-hidden="true"><i /><i /></div>
      <div className={styles.vignette} aria-hidden="true" />
      {freezeKey > 0 && <div key={freezeKey} className={styles.freezeFlash} aria-hidden="true" />}
      {goalFx && (
        <>
          <div key={`f${goalFx.key}`} className={styles.goalFlash} aria-hidden="true" />
          {goalFx.pieces.length > 0 && <Confetti key={`c${goalFx.key}`} pieces={goalFx.pieces} />}
        </>
      )}

      {level.tutorial && !tutorialDone && <TutorialOverlay ref={tutorialRef} />}

      {status === "ready" && hud && (
        <div className={styles.hud}>
          <div className={styles.topLeft}>
            <ScoreBug
              home={home}
              away={away}
              homeScore={level.score.home + hud.goals}
              awayScore={level.score.away}
              clock={hud.clock}
              running={phase === "flight" || phase === "outcome"}
              bump={bump}
            />
            <ObjectiveChip index={levelIndex} name={level.name} objective={level.objective} />
          </div>
          <div className={styles.topRight}>
            <AttemptBalls total={level.attempts} left={Math.max(0, Math.min(level.attempts, hud.attemptsLeft))} />
            <div className={styles.buttons}>
              <IconButton label={muted ? "Ligar o som" : "Desligar o som"} onClick={toggleMute} pressed={muted}><SoundGlyph muted={muted} /></IconButton>
              <IconButton label="Pausar" onClick={pause}><PauseGlyph /></IconButton>
            </div>
            <PassCounter passes={hud.passes} />
          </div>

          {phase === "intro" && (
            <IntroCard
              index={levelIndex}
              name={level.name}
              situation={level.situation}
              objective={level.objective}
              rules={[describeRule(level.stars[0]), describeRule(level.stars[1])]}
              onSkip={skip}
            />
          )}
          {phase === "replay" && <ReplayTag onSkip={skip} stats={replayStats} />}
          {phase === "outcome" && outcome && !results && <OutcomeBanner key={hud.outcomeKey} outcome={outcome} />}
          {phase === "outcome" && outcome && !results && <span className={styles.tapToContinue}>{touchUi ? "Toque para continuar" : "Clique para continuar"}</span>}
          {toast && phase === "aim" && <Toast key={toast.key} text={toast.text} sub={toast.sub} />}

          {showAim && (
            <div className={styles.bottom}>
              {drawing
                ? <PlanChip plan={plan} />
                : <AimHint key={hint.key} text={hint.tone === "error" ? hint.text : infoHint} tone={hint.tone} tag={level.tutorial && !tutorialDone ? "TUTORIAL" : undefined} />}
            </div>
          )}
        </div>
      )}

      {status === "loading" && (
        <div className={styles.loading} role="status">
          <div className={styles.loadingBall} aria-hidden="true" />
          <span className={styles.loadingKicker}>FASE {String(levelIndex + 1).padStart(2, "0")}</span>
          <strong>{level.name}</strong>
          <small>{level.situation}</small>
          <em>Montando o estádio…</em>
        </div>
      )}

      {status === "failed" && (
        <div className={styles.overlay} role="alertdialog" aria-labelledby="sb-fail-title">
          <div className={styles.menuCard}>
            <h2 id="sb-fail-title">O 3D parou de responder</h2>
            <p>O Scorebobo só existe no Modo 3D. Recarregue a página ou feche outros apps pesados e tente de novo.</p>
            <div className={styles.menuActions}>
              <button type="button" className={styles.primaryButton} onClick={() => window.location.reload()}>Recarregar</button>
              <button type="button" className={styles.secondaryButton} onClick={leave}>Fases</button>
            </div>
          </div>
        </div>
      )}

      {paused && !results && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="sb-pause-title">
          <div className={styles.menuCard}>
            <span className={styles.menuKicker}>PAUSA</span>
            <h2 id="sb-pause-title">{level.name}</h2>
            <p>{level.objective}</p>
            <div className={styles.menuActions}>
              <button type="button" className={styles.primaryButton} onClick={resume} autoFocus>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
                Continuar
              </button>
              <button type="button" className={styles.secondaryButton} onClick={restart}>Recomeçar</button>
              <button type="button" className={styles.secondaryButton} onClick={leave}>Fases</button>
            </div>
            <small className={styles.menuNote}>Esc pausa · M liga e desliga o som · Espaço pula o replay</small>
          </div>
        </div>
      )}

      {results && (
        <Results
          level={level}
          levelIndex={levelIndex}
          stars={results.stars}
          record={results.record}
          notes={results.notes}
          met={results.met}
          hasNext={hasNext}
          nextUnlocked={nextUnlocked}
          onNext={next}
          onRetry={restart}
          onLevels={leave}
        />
      )}
    </div>
  );
}

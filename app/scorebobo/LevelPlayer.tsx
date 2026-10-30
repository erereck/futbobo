"use client";

// Uma fase do Scorebobo em tela cheia: liga a simulação (`sim/`) à cena
// (`three/`), lê o dedo/mouse e desenha a camada de TV por cima.
//
// O laço é daqui: a cada quadro a simulação avança, a cena desenha o estado e
// os eventos novos viram som, flash e faixa. O React só re-renderiza quando
// algo do HUD muda de verdade (fase, bolas, passes, relógio, resultado) — o
// anel da bola, a mão do tutorial e o rastro do dedo andam por fora dele, e o
// chip da prévia lê o plano sozinho.
//
// O 3D desenha no máximo 60 vezes por segundo (telas de 90/120 Hz não pagam
// em dobro), menos na mira parada e atrás do resultado, e nenhuma na pausa. No
// modo desempenho, abertura, reação e replay (só se assiste) ficam em 30.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { FrameWatch } from "../botao/perf-watch";
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
  RecenterButton,
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
  /** O aparelho não deu conta nem com a resolução no piso (a próxima montagem pode vir no modo desempenho). */
  onSlowDevice?: () => void;
  /** Monta a fase de novo do zero (canvas e WebGL novos): o 3D caiu, ou o modo desempenho mudou. */
  onRemount?: () => void;
};

/** Se a cena não ficar pronta nesse tempo, avisa em vez de deixar a tela preta. */
const PREPARE_TIMEOUT_MS = 25000;
/** Resultado sem vitória: quanto a reação fica na tela antes da próxima bola. */
const OUTCOME_HOLD_MS = 3000;
/** Toque para seguir só depois disso (ninguém pula o gol sem querer). */
const OUTCOME_MIN_MS = 800;
const AIM_HINT = "Desenhe a partir da bola: até um companheiro ou até o gol";
/** Fase sem passe (pênalti, falta direta): a dica não convida a rolar para o lado. */
const AIM_HINT_DIRECT = "Desenhe a partir da bola até o gol";
/** Segunda linha da dica até o jogador girar a câmera a primeira vez (depois some de vez). */
const TURN_HINT_TOUCH = "Arraste fora da bola para girar a câmera";
const TURN_HINT_KEYS = "Arraste fora da bola ou use ← → para girar a câmera";
/** Giro da câmera por largura da tela arrastada (rad) e com a seta segurada (rad/s). */
const TURN_PER_WIDTH = 1.5;
const KEY_TURN_SPEED = 1.3;
/** Daqui (rad) a câmera conta como girada: aparece o botão de centralizar. */
const TURNED_MIN = 0.035;
/** Toque duplo fora da bola (centraliza): o segundo começa até 300 ms depois do primeiro, a até 48 px. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 48;
/**
 * Dedo que encostou fora da bola, mas a menos de 2,5 raios dela (~120 px no celular): o traço
 * que errou o começo por pouco (o passe para o lado) ganha o aviso, não gira o mundo.
 */
const NEAR_MISS_RADII = 2.5;
const TURN_LEARNED_KEY = "futbobo:scorebobo:camera-turn";

function readTurnLearned() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(TURN_LEARNED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Primeiro giro da câmera: a dica de como girar some de vez (neste aparelho). */
function learnTurn(ref: { current: boolean }, set: (value: boolean) => void) {
  if (ref.current) return;
  ref.current = true;
  set(true);
  try {
    window.localStorage.setItem(TURN_LEARNED_KEY, "1");
  } catch {
    // Sem armazenamento: a dica volta na próxima visita.
  }
}

/** Lê o giro da câmera e só avisa o React quando ele cruza o limiar (o botão de centralizar). */
function syncTurned(view: ScoreboboViewApi, ref: { current: boolean }, set: (value: boolean) => void) {
  const turned = Math.abs(view.aimTurn ?? 0) > TURNED_MIN;
  if (turned === ref.current) return;
  ref.current = turned;
  set(turned);
}
/** Mira sem ninguém mexer por este tempo (ms) e com a câmera assentada: o 3D desenha mais devagar. */
const IDLE_AFTER_MS = 600;
/** Anel ou seta apagados por este tempo (ms; o fade é de 0,25 s): as animações deles param. */
const MARKER_IDLE_MS = 300;

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

/**
 * Dedo (ou mouse) que encostou fora da bola na mira: até andar 10 px é um
 * toque; mais para o lado que para cima, gira a câmera; para cima ou para
 * baixo, é um traço que começou longe da bola (ao soltar, o aviso de sempre).
 * Encostou quase na bola (`nearBall`): é um traço que errou o começo, nunca giro.
 */
type TurnDrag = { pointerId: number; x: number; y: number; t: number; lastX: number; mode: "tap" | "turn" | "miss"; nearBall: boolean };

/**
 * Cores do rastro por nível de alfa (o 8 bits que o canvas guarda): o quadro
 * não monta uma string `rgba()` nova a cada pedaço do traço.
 */
const TRAIL_LEVELS = 255;
const TRAIL_GLOW = Array.from({ length: TRAIL_LEVELS + 1 }, (_, level) => `rgba(214, 255, 92, ${level / TRAIL_LEVELS})`);
const TRAIL_CORE = Array.from({ length: TRAIL_LEVELS + 1 }, (_, level) => `rgba(255, 255, 255, ${level / TRAIL_LEVELS})`);
const trailColor = (table: string[], alpha: number) => table[Math.round(Math.max(0, Math.min(1, alpha)) * TRAIL_LEVELS)];

/**
 * Anel da bola e setas da borda: guarda o último valor escrito em cada estilo
 * e só toca o DOM quando ele muda. Apagado há 300 ms (o fade já acabou), as
 * animações de CSS dele param (`idleAnim`) até ele acender de novo.
 */
class Marker {
  private readonly written = new Map<string, string>();
  private hiddenAt = -1;
  private idle = false;

  constructor(readonly element: HTMLElement) {}

  set(name: string, value: string) {
    if (this.written.get(name) === value) return;
    this.written.set(name, value);
    this.element.style.setProperty(name, value);
  }

  show(visible: boolean, now: number) {
    this.set("opacity", visible ? "1" : "0");
    if (visible) {
      this.hiddenAt = -1;
      if (this.idle) {
        this.idle = false;
        this.element.classList.remove(styles.idleAnim);
      }
    } else if (this.hiddenAt < 0) {
      this.hiddenAt = now;
    } else if (!this.idle && now - this.hiddenAt >= MARKER_IDLE_MS) {
      this.idle = true;
      this.element.classList.add(styles.idleAnim);
    }
  }
}

/** O plano do traço fora do estado da fase: só o chip re-renderiza quando ele muda. */
type PlanStore = {
  current: PlanSummary | null;
  set(plan: PlanSummary | null): void;
  subscribe(listener: () => void): () => void;
  read(): PlanSummary | null;
};

function createPlanStore(): PlanStore {
  const listeners = new Set<() => void>();
  const store: PlanStore = {
    current: null,
    set(plan) {
      if (store.current === plan) return;
      store.current = plan;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    read: () => store.current,
  };
  return store;
}

/** Chip da prévia assinando o plano direto (o resto da tela não re-renderiza a cada mudança). */
function LivePlanChip({ store, directOnly }: { store: PlanStore; directOnly: boolean }) {
  const plan = useSyncExternalStore(store.subscribe, store.read, store.read);
  return <PlanChip plan={plan} directOnly={directOnly} />;
}

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

export default function LevelPlayer({ level, levelIndex, teams, home, away, performance: performanceMode, muted, onToggleMute, hasNext, nextUnlocked, onNext, onLevels, engine = DEFAULT_ENGINE, onSlowDevice, onRemount }: LevelPlayerProps) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);
  // Fase em que passe não vale (o gol depois dele fica sem estrela): dica e prévia falam só do gol.
  const directOnly = level.require?.some((rule) => rule.kind === "maxPasses" && rule.max === 0) ?? false;
  // Sem companheiro em campo (cara a cara) também não há passe para oferecer.
  const goalOnly = directOnly || level.mates.length === 0;
  // Bola única sem passe (o pênalti): traço que acaba num companheiro perderia a fase inteira. Sem setas, e só o chute vale.
  const shotOnly = directOnly && level.attempts === 1;

  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [planStore] = useState(createPlanStore);
  const [hint, setHint] = useState<Hint>({ text: AIM_HINT, tone: "info", key: 0 });
  const [toast, setToast] = useState<{ text: string; sub?: string; key: number } | null>(null);
  // Flash do gol (sai da árvore quando a animação termina) e confete de DOM (dura mais), separados.
  const [goalFlash, setGoalFlash] = useState<number | null>(null);
  const [confetti, setConfetti] = useState<{ key: number; pieces: ConfettiPiece[] } | null>(null);
  const [paused, setPaused] = useState(false);
  const [results, setResults] = useState<{ stars: StarCount; record: boolean; notes: string[]; met?: [boolean, boolean, boolean] } | null>(null);
  // "Ver replay": o gol ainda está guardado (o botão aparece) e se o replay está passando de novo (o cartão sai da frente).
  const [replayable, setReplayable] = useState(false);
  const [rewatch, setRewatch] = useState(false);
  // O modo desempenho vale a partir da montagem: trocar em outra aba não recomeça a fase no meio.
  const [performanceAtMount] = useState(performanceMode);
  const [touchUi, setTouchUi] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);
  const [replayStats, setReplayStats] = useState<string | null>(null);
  const [tutorialDone, setTutorialDone] = useState(!level.tutorial);
  const [bump, setBump] = useState(0);
  const [freezeFlash, setFreezeFlash] = useState<number | null>(null);
  // Câmera girada na mira (o botão de centralizar) e se o jogador já aprendeu a girar (a dica some).
  const [turned, setTurned] = useState(false);
  const [turnLearned, setTurnLearned] = useState(readTurnLearned);

  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const ringMarkerRef = useRef<Marker | null>(null);
  const tapRef = useRef<HTMLDivElement>(null);
  const tutorialRef = useRef<TutorialHandle>(null);
  /** Setas na borda para companheiros fora do quadro (o traço que termina nelas passa para ele). */
  const arrowRefs = useRef(new Map<string, Marker>());
  const edgeRef = useRef(new Map<string, { x: number; y: number; target: { x: number; y: number } }>());
  /** Tamanho da área de jogo e do canvas do rastro (px CSS), lidos só quando mudam (ResizeObserver). */
  const hostSizeRef = useRef({ width: 0, height: 0 });
  const trailSizeRef = useRef({ width: 0, height: 0 });
  /** O canvas do rastro está na composição (escondido quando não há rastro). */
  const trailShownRef = useRef(false);
  /** Quem chutou, em ordem (a tabela: recebe de volta quem tocou dois lances antes). */
  const kickersRef = useRef<string[]>([]);
  /** Último plano válido do traço (soltar fora da tela não perde a jogada que a prévia mostrou). */
  const lastPlanRef = useRef<KickPlan | null>(null);
  const goalFactsRef = useRef<{ distance: number; curve: number } | null>(null);
  const freezeSeqRef = useRef(0);

  const gameRef = useRef<ScoreboboGameApi | null>(null);
  const viewRef = useRef<ScoreboboViewApi | null>(null);
  const audioRef = useRef<ScoreboboAudio | null>(null);
  const strokeRef = useRef<Stroke | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const trailFadeRef = useRef(0);
  const pausedRef = useRef(false);
  /** O cartão do resultado está na tela (no "Ver replay" ele sai e o resultado continua guardado). */
  const resultsRef = useRef(false);
  const rewatchRef = useRef(false);
  const tutorialDoneRef = useRef(!level.tutorial);
  const toastOnRef = useRef(false);
  const hudKeyRef = useRef("");
  /** Último toque, tecla, troca de fase ou evento: a mira só desacelera depois de um tempo sem nada. */
  const wakeAtRef = useRef(0);
  /** Toque, tecla ou volta da pausa: o próximo quadro desenha sem esperar a cadência lenta. */
  const wakeRef = useRef(false);
  /** Religa o laço parado (pausa, aba escondida). */
  const resumeLoopRef = useRef<(() => void) | null>(null);
  const onSlowDeviceRef = useRef(onSlowDevice);
  const onRemountRef = useRef(onRemount);
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
  /** Arrasto fora da bola (gira a câmera), o último toque fora dela (o segundo centraliza) e as setas seguradas. */
  const turnDragRef = useRef<TurnDrag | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const tapTimerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(tapTimerRef.current), []);
  const keyTurnRef = useRef({ left: false, right: false });
  const turnedRef = useRef(false);
  const turnLearnedRef = useRef(turnLearned);

  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    onSlowDeviceRef.current = onSlowDevice;
    onRemountRef.current = onRemount;
  }, [onSlowDevice, onRemount]);

  useEffect(() => {
    toastOnRef.current = toast !== null;
  }, [toast]);

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
      // A fase não segue nesta montagem (só remontar, recarregar ou sair): o replay guardado já pode ir.
      gameRef.current?.dispose?.();
      setReplayable(false);
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
    const timer = window.setTimeout(fail, PREPARE_TIMEOUT_MS);
    // A cena primeiro: o pedido do three.js sai antes do estádio de som montar.
    const viewReady = engine.createView(canvas, {
      performance: performanceAtMount,
      reducedMotion: reducedRef.current,
      onContextLost: fail,
      // O WebGL voltou (Android de volta do fundo): remonta a fase com um contexto novo, sem recarregar o app.
      onContextRestored: () => onRemountRef.current?.(),
    });
    const audio = new ScoreboboAudio();
    audioRef.current = audio;
    audio.enter();
    viewReady
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
      // Saiu da fase (próxima, fases, outra rota, remontagem): a gravação do replay sai da memória junto.
      game.dispose?.();
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
    // Fim do "Ver replay": o cartão volta como estava (sem apito, sino nem estrelas gravadas de novo).
    if (rewatchRef.current) {
      rewatchRef.current = false;
      setRewatch(false);
      return;
    }
    const record = recordStars(level.id, stars);
    if (stars > 0) audioRef.current?.finalWhistle();
    setReplayable(gameRef.current?.canReplay ?? false);
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
        const key = performance.now();
        setGoalFlash(key);
        // Modo desempenho: sem o confete de DOM (o 3D já solta o dele).
        const pieces = reducedRef.current || performanceAtMount ? [] : confettiFor(home);
        setConfetti(pieces.length ? { key, pieces } : null);
      } else if (event.type === "control") {
        freezeSeqRef.current += 1;
        setFreezeFlash(freezeSeqRef.current);
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
  }, [home, performanceAtMount]);

  /** Liga/desliga o canvas do rastro na composição (só escreve quando muda). */
  const showTrail = useCallback((visible: boolean) => {
    const canvas = trailCanvasRef.current;
    if (!canvas || trailShownRef.current === visible) return;
    trailShownRef.current = visible;
    canvas.style.visibility = visible ? "visible" : "hidden";
  }, []);

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
      // Rastro limpo e ninguém desenhando: a camada de tela cheia sai da composição.
      showTrail(false);
      return;
    }
    const { width, height } = trailSizeRef.current;
    const ratio = canvas.width / Math.max(1, width);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // A limpeza é sempre do canvas inteiro: assim o Chrome descarta o quadro
    // anterior em vez de preservá-lo (limpar só o retângulo sujo custou uma
    // cópia a mais por quadro na GPU, medido).
    context.clearRect(0, 0, width, height);
    // Cometa na ponta do dedo: só os últimos ~0,22 s, afinando para trás.
    const span = 220;
    const head = stroke ? now : trailFadeRef.current - 260;
    const fade = stroke ? 1 : Math.max(0, (trailFadeRef.current - now) / 260);
    context.lineCap = "round";
    context.lineJoin = "round";
    // Pares seguidos dos pontos recentes, na ordem (o mesmo que filtrar a lista, sem lista nova a cada quadro).
    let a: TrailPoint | null = null;
    for (const b of points) {
      if (head - b.t >= span) continue;
      if (a) {
        const age = Math.max(0, Math.min(1, (head - b.t) / span));
        const k = (1 - age) * fade;
        context.strokeStyle = trailColor(TRAIL_GLOW, 0.16 * k);
        context.lineWidth = 22 * k + 2;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
        context.strokeStyle = trailColor(TRAIL_CORE, 0.85 * k);
        context.lineWidth = 4 * k + 1;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
      a = b;
    }
  }, [showTrail]);

  useEffect(() => {
    if (status !== "ready") return;
    let frame = 0;
    let last = performance.now();
    // Orçamento de quadro (como na partida 3D): tempo acumulado desde o último desenho.
    let budget = 0;
    let elapsed = 0;
    let lastFrameTime = 0;
    let lastRenderAt = 0;
    let arrowsShown = true;
    let slowReported = false;
    const watch = new FrameWatch();
    const tick = (now: number) => {
      frame = 0;
      // Pausa e aba escondida não pedem quadro nenhum: quem tira da pausa religa o laço.
      if (document.hidden || pausedRef.current) return;
      frame = requestAnimationFrame(tick);
      const delta = Math.max(0, (now - last) / 1000);
      last = now;
      budget += delta;
      elapsed += delta;
      const game = gameRef.current;
      const view = viewRef.current;
      if (!game || !view) return;

      // Setas (ou A/D) seguradas na mira: a câmera gira enquanto a tecla estiver apertada.
      const keys = keyTurnRef.current;
      if (keys.left !== keys.right && game.state.phase === "aim" && !strokeRef.current && !resultsRef.current && view.turnAim) {
        view.turnAim((keys.left ? 1 : -1) * KEY_TURN_SPEED * Math.min(delta, 0.05));
        wakeAtRef.current = now;
        learnTurn(turnLearnedRef, setTurnLearned);
        syncTurned(view, turnedRef, setTurned);
      }

      // Traço em andamento: um plano por quadro de tela, não um por evento do
      // ponteiro. Fica antes do teto de 60: em 90/120 Hz o plano de reserva do
      // chute (`lastPlanRef`) acompanha todos os quadros, como sempre foi; só o
      // desenho espera o orçamento (o próximo render mostra o traço).
      const stroke = strokeRef.current;
      if (stroke?.dirty && game.state.phase === "aim") {
        stroke.dirty = false;
        const samples = edgeSnap(stroke, view, edgeRef.current);
        const planned = game.planKick(samples);
        if (planned) lastPlanRef.current = planned;
        view.setStroke(strokePoints(samples, stroke.airY), planned);
        const summary = planned ? summarize(planned, game.state) : null;
        const shown = planStore.current;
        if (!samePlan(summary, shown)) {
          // Tique no dedo quando o traço "pega" um companheiro.
          if (summary?.receiver && summary.receiver !== shown?.receiver) buzz(touchRef.current, 8);
          planStore.set(summary);
        }
        audioRef.current?.setDrawing(Math.min(1, stroke.length / (stroke.short * 0.9)) * (planned ? 1 : 0.5));
      }

      const showingResults = resultsRef.current;
      const phaseBefore = game.state.phase;
      // Mira parada (câmera assentada, ninguém mexendo): o 3D quase não muda e o anel, as setas e a dica são DOM.
      const idleAim =
        !showingResults &&
        phaseBefore === "aim" &&
        !strokeRef.current &&
        (view.calm ?? false) &&
        now - wakeAtRef.current > IDLE_AFTER_MS &&
        (tutorialDoneRef.current || !level.tutorial) &&
        !toastOnRef.current;
      // Teto de 60 por segundo (telas de 90/120 Hz); atrás do resultado e na mira parada, bem menos.
      // Modo desempenho: abertura, reação e replay a 30 (ninguém joga; o tempo
      // segue certo porque o passo leva o tempo real acumulado). Voo, mira e
      // traço seguem a 60, e o toque que pula ou segue desenha já (`wakeRef`).
      const watching = performanceAtMount && (phaseBefore === "intro" || phaseBefore === "outcome" || phaseBefore === "replay");
      const frameTime = showingResults ? (performanceAtMount ? 1 / 10 : 1 / 15) : idleAim ? (performanceAtMount ? 1 / 20 : 1 / 30) : watching ? 1 / 30 : 1 / 60;
      const woken = wakeRef.current;
      if (!woken && budget < frameTime - 1 / 960) return;
      budget = Math.min(frameTime, Math.max(0, budget - frameTime));
      const real = elapsed;
      elapsed = 0;
      wakeRef.current = false;
      // Um engasgo longo atrasa a jogada em vez de teleportar a bola.
      const dt = Math.min(showingResults ? 0.1 : 0.05, real);
      // Atrás da tela de resultado a cena só respira (bateria do celular): um quarto da velocidade, como sempre.
      const sceneDt = showingResults ? dt / 4 : dt;

      let events: SimEvent[];
      try {
        events = game.step(sceneDt);
        view.render(game.state, sceneDt, events);
      } catch (error) {
        console.error("[scorebobo] quadro falhou", error);
        viewRef.current = null;
        setStatus("failed");
        return;
      }
      const state = game.state;
      audioRef.current?.handleEvents(events);
      audioRef.current?.update(state, sceneDt);
      if (events.length) handleEvents(events, state);

      // Vigia do aparelho: só entre dois quadros a 60 (mira parada, resultado e o quadro de acordar não contam).
      const phaseChanged = state.phase !== phaseRef.current.phase;
      if (phaseChanged || events.length) wakeAtRef.current = now;
      if (phaseChanged) watch.hold(now, 250);
      for (const event of events) if (event.type === "goal") watch.hold(now, 600);
      const paced = !woken && frameTime === 1 / 60 && lastFrameTime === 1 / 60;
      lastFrameTime = frameTime;
      if (paced) view.adaptResolution?.(real);
      if (!performanceAtMount && !slowReported && watch.sample(now, lastRenderAt ? now - lastRenderAt : 0, view.stats?.().cpuMs ?? 0, paced) && (view.resolutionExhausted ?? view.atResolutionFloor)) {
        slowReported = true;
        onSlowDeviceRef.current?.();
      }
      lastRenderAt = now;

      // Mudança de fase: limpa o traço, marca o relógio do resultado.
      const marker = phaseRef.current;
      if (phaseChanged) {
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
        if (state.phase !== "aim") planStore.set(null);
        // Mira nova começa no enquadramento automático (a cena zera o giro): some o botão de centralizar.
        syncTurned(view, turnedRef, setTurned);
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
      current.active += sceneDt;
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

      // Anel na bola (onde o traço começa), setas e mão do tutorial: primeiro as
      // contas, depois as escritas (nada de ler layout no meio do quadro).
      const { width, height } = hostSizeRef.current;
      const aiming = state.phase === "aim" && !strokeRef.current && !resultsRef.current;
      const ball = aiming ? view.screenOf(state.ball.pos) : null;
      // Setas na borda: companheiro fora do quadro (no celular em pé, quem abre no lado não cabe).
      const edges = edgeRef.current;
      const showArrows = state.phase === "aim" && !resultsRef.current;
      // Fora da mira as setas já apagaram no primeiro quadro: nem refaz a conta.
      const arrows = showArrows || arrowsShown;
      arrowsShown = showArrows;
      if (arrows) {
        edges.clear();
        if (showArrows) {
          for (const id of arrowRefs.current.keys()) {
            const actor = state.actors.find((item) => item.id === id);
            const point = actor && actor.role === "mate" ? view.screenOf({ x: actor.pos.x, y: 0, z: actor.pos.z }) : null;
            const outside = point && (point.x < 10 || point.x > width - 10 || point.y < 10 || point.y > height - 10);
            if (!point || !outside) continue;
            const x = Math.min(width - 40, Math.max(40, point.x));
            // Câmera girada: o botão de centralizar ocupa o canto de baixo; a seta para um pouco acima dele.
            const y = Math.min(height - (turnedRef.current ? 106 : 92), Math.max(92, point.y));
            edges.set(id, { x, y, target: point });
          }
        }
      }
      const tutorial = level.tutorial;
      const tutorialOn = tutorial && !tutorialDoneRef.current && tutorialRef.current;
      let demo: ScreenPoint[] | null = null;
      if (tutorialOn && aiming) {
        demo = [];
        for (const point of tutorial.demo) {
          // Ponto na linha do gol: a mão termina dentro do gol, não no gramado atrás.
          const lifted = point.z >= PITCH.goalLineZ - 0.01;
          const screen = view.screenOf({ x: point.x, y: lifted ? 0.9 : 0, z: Math.min(point.z, PITCH.goalLineZ) });
          if (screen) demo.push(screen);
        }
      }

      const ring = ringMarkerRef.current;
      if (ring) {
        if (ball) {
          const radius = Math.max(48, Math.min(width, height) * 0.07);
          ring.show(true, now);
          ring.set("transform", `translate3d(${ball.x}px, ${ball.y}px, 0)`);
          ring.set("--size", `${Math.round(radius * 1.25)}px`);
        } else {
          ring.show(false, now);
        }
      }
      if (arrows) {
        for (const [id, arrow] of arrowRefs.current) {
          const edge = edges.get(id);
          if (!edge) {
            arrow.show(false, now);
            continue;
          }
          arrow.show(true, now);
          arrow.set("transform", `translate3d(${edge.x}px, ${edge.y}px, 0)`);
          arrow.set("--angle", `${Math.atan2(edge.target.y - edge.y, edge.target.x - edge.x)}rad`);
        }
      } else {
        // Apagadas: só conta o tempo até as animações delas pararem.
        for (const arrow of arrowRefs.current.values()) arrow.show(false, now);
      }
      if (tutorialOn) tutorialRef.current?.update(demo, now);
      drawTrail(now);
      publishHud(state);
    };
    const resume = () => {
      wakeRef.current = true;
      if (frame || document.hidden || pausedRef.current) return;
      last = performance.now();
      budget = 0;
      elapsed = 0;
      frame = requestAnimationFrame(tick);
    };
    resumeLoopRef.current = resume;
    frame = requestAnimationFrame(tick);
    const onVisibility = () => {
      audioRef.current?.setPaused(document.hidden || pausedRef.current);
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else {
        resume();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (resumeLoopRef.current === resume) resumeLoopRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, level.tutorial, performanceAtMount, planStore, advance, finish, handleEvents, drawTrail, publishHud]);

  // O rastro do dedo acompanha o tamanho da tela (nitidez de retina); a área de
  // jogo guarda o tamanho dela (o quadro e o toque não leem layout).
  useEffect(() => {
    const canvas = trailCanvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      trailSizeRef.current = { width: canvas.clientWidth, height: canvas.clientHeight };
      canvas.width = Math.round(trailSizeRef.current.width * ratio);
      canvas.height = Math.round(trailSizeRef.current.height * ratio);
    };
    const measureHost = () => {
      hostSizeRef.current = { width: host.clientWidth, height: host.clientHeight };
    };
    resize();
    measureHost();
    // Tamanho novo: o próximo quadro desenha já, mesmo na cadência lenta (mira
    // parada, resultado), para o quadro esticado não ficar na tela. A janela
    // avisa antes do rAF do mesmo quadro; o observer pega o resto.
    const onViewport = () => {
      wakeRef.current = true;
    };
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === canvas) resize();
        else measureHost();
      }
      onViewport();
    });
    observer.observe(canvas);
    observer.observe(host);
    window.addEventListener("resize", onViewport);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onViewport);
    };
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

  // Flashes de tela cheia saem da árvore quando a animação deles acaba (já em
  // opacidade 0, no `onAnimationEnd`): o do gol (0,75 s) isolava uma camada com
  // `screen`, e o do domínio (0,7 s) ficava montado para sempre. Na pausa a
  // animação espera, e o flash junto. O relógio é só a reserva, no tempo que o
  // do gol sempre teve (3,6 s).
  useEffect(() => {
    if (goalFlash === null) return;
    const timer = window.setTimeout(() => setGoalFlash((current) => (current === goalFlash ? null : current)), 3600);
    return () => window.clearTimeout(timer);
  }, [goalFlash]);

  useEffect(() => {
    if (freezeFlash === null) return;
    const timer = window.setTimeout(() => setFreezeFlash((current) => (current === freezeFlash ? null : current)), 3600);
    return () => window.clearTimeout(timer);
  }, [freezeFlash]);

  useEffect(() => {
    if (!confetti) return;
    const timer = window.setTimeout(() => setConfetti((current) => (current?.key === confetti.key ? null : current)), 3600);
    return () => window.clearTimeout(timer);
  }, [confetti]);

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
    // Na pausa o laço para de pedir quadros; ao voltar, religa e desenha já no próximo.
    if (!value) resumeLoopRef.current?.();
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
    // O rastro do dedo sai junto (com o laço parado, ele ficava pintado embaixo do menu).
    trailRef.current = [];
    trailFadeRef.current = 0;
    const trail = trailCanvasRef.current;
    trail?.getContext("2d")?.clearRect(0, 0, trail.width, trail.height);
    showTrail(false);
    playUiSound("pause");
    setPausedBoth(true);
  }, [setPausedBoth, showTrail]);

  const resume = useCallback(() => {
    primeScoreboboAudio();
    playUiSound("click");
    setPausedBoth(false);
  }, [setPausedBoth]);

  const restart = useCallback(() => {
    // O modo desempenho mudou desde a montagem (o aparelho pediu, ou outra aba):
    // a nova tentativa já nasce com ele, numa montagem nova (nunca no meio da jogada).
    if (performanceMode !== performanceAtMount && onRemount) {
      gameRef.current?.dispose?.();
      onRemount();
      return;
    }
    const game = gameRef.current;
    if (!game) return;
    primeScoreboboAudio();
    playUiSound("select");
    // Recomeçar também zera a gravação (o buffer fica para a nova tentativa, sem nada legível do gol antigo).
    game.restart();
    strokeRef.current = null;
    viewRef.current?.setStroke(null, null);
    audioRef.current?.setDrawing(null);
    resultsRef.current = false;
    rewatchRef.current = false;
    setRewatch(false);
    setReplayable(false);
    bestOutcomeRef.current = null;
    lastOutcomeRef.current = null;
    planStore.set(null);
    phaseRef.current = { phase: null, since: performance.now(), active: 0, retryAt: 0, forceAt: 0 };
    kickersRef.current = [];
    lastPlanRef.current = null;
    goalFactsRef.current = null;
    setReplayStats(null);
    setDrawing(false);
    setResults(null);
    setGoalFlash(null);
    setConfetti(null);
    setToast(null);
    setPausedBoth(false);
  }, [setPausedBoth, performanceMode, performanceAtMount, onRemount, planStore]);

  const skip = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    playUiSound("click");
    if (game.state.phase === "outcome") advance();
    else game.skip();
  }, [advance]);

  // Sair da fase solta a gravação do replay já no toque (a próxima fase ainda está carregando).
  const leave = useCallback(() => {
    playUiSound("back");
    gameRef.current?.dispose?.();
    onLevels();
  }, [onLevels]);

  const next = useCallback(() => {
    playUiSound("select");
    gameRef.current?.dispose?.();
    onNext();
  }, [onNext]);

  /** "Ver replay" no resultado: o cartão sai da frente, o gol passa de novo e o cartão volta como estava. */
  const watchReplay = useCallback(() => {
    const game = gameRef.current;
    if (!game?.replayAgain?.()) {
      // A gravação já foi (saindo da fase): o botão some.
      setReplayable(false);
      return;
    }
    playUiSound("select");
    resultsRef.current = false;
    rewatchRef.current = true;
    setRewatch(true);
    // O foco sai do botão: Espaço e Enter pulam o replay, não apertam o botão escondido.
    rootRef.current?.focus({ preventScroll: true });
    wakeAtRef.current = performance.now();
    wakeRef.current = true;
  }, []);

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

  /** Câmera de volta ao enquadramento automático da mira (botão ou toque duplo fora da bola). */
  const recenter = useCallback(() => {
    const view = viewRef.current;
    if (!view?.resetAimTurn) return;
    view.resetAimTurn();
    playUiSound("click");
    wakeAtRef.current = performance.now();
    wakeRef.current = true;
    syncTurned(view, turnedRef, setTurned);
  }, []);

  // ------------------------------------------------------------ ponteiro

  const pointFrom = (event: { clientX: number; clientY: number }, rect = hostRef.current?.getBoundingClientRect()) => {
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  /** Mexeu: a mira volta a 60 por segundo (com `now`, o próximo quadro sai sem esperar). */
  const wake = (now: boolean) => {
    wakeAtRef.current = performance.now();
    if (now) wakeRef.current = true;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    wake(true);
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
    // Um gesto por vez: o segundo dedo não conta (nem no traço, nem girando a câmera).
    if (phase !== "aim" || strokeRef.current || turnDragRef.current) return;
    const host = hostRef.current;
    if (!host) return;
    const { x, y } = pointFrom(event);
    const size = hostSizeRef.current;
    const short = Math.min(size.width, size.height);
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
      if (!ball || !view.turnAim) {
        rejectStroke("Comece o traço na bola", x, y);
        return;
      }
      // Fora da bola: arrastar para os lados (longe dela) gira a câmera; o toque (ou o
      // traço que começou fora da bola) ganha o aviso de sempre ao soltar.
      event.preventDefault();
      try {
        host.setPointerCapture(event.pointerId);
      } catch {
        // Ponteiro sintético ou já solto: segue sem captura.
      }
      const downAt = performance.now();
      const last = lastTapRef.current;
      // Segundo toque logo depois do primeiro: o aviso que esperava por ele já não sai.
      if (last && downAt - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < DOUBLE_TAP_PX) window.clearTimeout(tapTimerRef.current);
      const gap = Math.min(Math.hypot(ball.x - x, ball.y - y), shown ? Math.hypot(shown.x - x, shown.y - y) : Infinity);
      turnDragRef.current = { pointerId: event.pointerId, x, y, t: downAt, lastX: x, mode: "tap", nearBall: gap < radius * NEAR_MISS_RADII };
      return;
    }
    event.preventDefault();
    try {
      host.setPointerCapture(event.pointerId);
    } catch {
      // Ponteiro sintético ou já solto: segue sem captura.
    }
    // Traço na bola: o aviso de um toque fora dela logo antes já não vale.
    window.clearTimeout(tapTimerRef.current);
    lastTapRef.current = null;
    // O traço nasce NA bola (o dedo encostou perto dela): a linha sai do pé, não de onde o dedo caiu.
    const now = performance.now();
    const viewport = { width: size.width, height: size.height };
    const samples: StrokeSample[] = [{ screen: { x: ball.x, y: ball.y }, t: now, ...view.project(ball.x, ball.y, airY ?? undefined), viewport }];
    const offset = Math.hypot(ball.x - x, ball.y - y);
    if (offset > 8 && near(ball)) samples.push({ screen: { x, y }, t: now, ...here, viewport });
    lastPlanRef.current = null;
    strokeRef.current = { pointerId: event.pointerId, samples, down: { x, y }, moved: false, airY, length: offset > 8 && near(ball) ? offset : 0, dirty: true, short, viewport };
    trailRef.current = [{ x: ball.x, y: ball.y, t: now }, { x, y, t: now }];
    showTrail(true);
    if (!tutorialDoneRef.current) {
      tutorialDoneRef.current = true;
      setTutorialDone(true);
    }
    setDrawing(true);
    audioRef.current?.setDrawing(0.05);
  };

  /** Arrasto fora da bola: o lado do dedo gira a câmera (o mundo vai junto com o dedo). */
  const moveTurnDrag = (drag: TurnDrag, event: ReactPointerEvent<HTMLDivElement>) => {
    const view = viewRef.current;
    if (!view?.turnAim || pausedRef.current || resultsRef.current) return;
    const { x, y } = pointFrom(event);
    if (drag.mode === "tap") {
      const dx = x - drag.x;
      const dy = y - drag.y;
      if (Math.hypot(dx, dy) < 10) return;
      // Perto da bola, mesmo para o lado, é traço errado (o aviso ao soltar), não giro.
      drag.mode = !drag.nearBall && Math.abs(dx) > Math.abs(dy) ? "turn" : "miss";
      if (drag.mode === "miss") return;
      learnTurn(turnLearnedRef, setTurnLearned);
    }
    if (drag.mode !== "turn") return;
    const width = hostSizeRef.current.width || 1;
    view.turnAim(((x - drag.lastX) / width) * TURN_PER_WIDTH);
    drag.lastX = x;
    wake(false);
    syncTurned(view, turnedRef, setTurned);
  };

  /** Soltou o dedo que encostou fora da bola: girou, ou foi um toque (aviso, ou o segundo do toque duplo, que centraliza). */
  const endTurnDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = turnDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return false;
    turnDragRef.current = null;
    // Captura perdida sem soltar o dedo não vale como toque.
    if (cancelled || event.type === "lostpointercapture" || drag.mode === "turn") return true;
    if (pausedRef.current || resultsRef.current || gameRef.current?.state.phase !== "aim") return true;
    const last = lastTapRef.current;
    lastTapRef.current = null;
    if (drag.mode === "miss") {
      rejectStroke("Comece o traço na bola", drag.x, drag.y);
      return true;
    }
    const turnedNow = Math.abs(viewRef.current?.aimTurn ?? 0) > TURNED_MIN;
    if (turnedNow && last && drag.t - last.t < DOUBLE_TAP_MS && Math.hypot(drag.x - last.x, drag.y - last.y) < DOUBLE_TAP_PX) {
      window.clearTimeout(tapTimerRef.current);
      recenter();
      return true;
    }
    lastTapRef.current = { x: drag.x, y: drag.y, t: performance.now() };
    window.clearTimeout(tapTimerRef.current);
    if (!turnedNow) {
      rejectStroke("Comece o traço na bola", drag.x, drag.y);
      return true;
    }
    // Câmera girada: espera um instante pelo segundo toque (que centraliza) antes de avisar
    // (um pouco mais que a janela: o segundo toque cancela o aviso já ao encostar).
    tapTimerRef.current = window.setTimeout(() => {
      if (gameRef.current?.state.phase === "aim" && !pausedRef.current && !resultsRef.current && !strokeRef.current) rejectStroke("Comece o traço na bola", drag.x, drag.y);
    }, DOUBLE_TAP_MS + 60);
    return true;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = turnDragRef.current;
    if (drag && event.pointerId === drag.pointerId) {
      moveTurnDrag(drag, event);
      return;
    }
    const stroke = strokeRef.current;
    const view = viewRef.current;
    if (!stroke || !view || event.pointerId !== stroke.pointerId) return;
    wake(false);
    const native = event.nativeEvent;
    // Eventos agrupados: em 120 Hz o traço não vira um polígono.
    const list = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const moves = list.length ? list : [native];
    const now = performance.now();
    // Um retângulo por evento (nada muda o layout entre os agrupados).
    const rect = hostRef.current?.getBoundingClientRect();
    for (const move of moves) {
      const { x, y } = pointFrom(move, rect);
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
    if (endTurnDrag(event, cancelled)) return;
    const stroke = strokeRef.current;
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    wake(false);
    strokeRef.current = null;
    trailFadeRef.current = performance.now() + 260;
    setDrawing(false);
    planStore.set(null);
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
    if (!finalPlan || (shotOnly && !finalPlan.shot)) {
      view.setStroke(null, null);
      const { x, y } = pointFrom(event);
      rejectStroke(stroke.length < minimum ? "Traço curto" : goalOnly ? "Leve o traço até o gol" : "Leve o traço até um companheiro ou até o gol", x, y);
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
      wakeAtRef.current = performance.now();
      wakeRef.current = true;
      const key = event.key.toLowerCase();
      if (key === "escape" || key === "p") {
        event.preventDefault();
        if (resultsRef.current) return;
        if (pausedRef.current) resume();
        else pause();
      } else if (key === "m") {
        toggleMute();
      } else if (key === "arrowleft" || key === "arrowright" || key === "a" || key === "d") {
        // Setas (ou A/D) seguradas giram a câmera na mira (o laço gira enquanto a tecla estiver apertada).
        if (key.startsWith("arrow")) event.preventDefault();
        if (pausedRef.current || resultsRef.current) return;
        keyTurnRef.current[key === "arrowleft" || key === "a" ? "left" : "right"] = true;
      } else if ((key === " " || key === "enter") && !pausedRef.current && !resultsRef.current) {
        const phase = gameRef.current?.state.phase;
        if (phase === "intro" || phase === "replay" || phase === "outcome") {
          event.preventDefault();
          skip();
        }
      }
    };
    const keys = keyTurnRef.current;
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") keys.left = false;
      else if (key === "arrowright" || key === "d") keys.right = false;
    };
    // Janela perdeu o foco com a tecla apertada: o keyup nunca chega.
    const releaseKeys = () => {
      keys.left = false;
      keys.right = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseKeys);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseKeys);
    };
  }, [pause, resume, skip, toggleMute]);

  // ------------------------------------------------------------ desenho

  // Refs estáveis: o React não solta e prende o anel e as setas a cada render.
  const setRing = useCallback((element: HTMLDivElement | null) => {
    ringRef.current = element;
    ringMarkerRef.current = element ? new Marker(element) : null;
  }, []);
  const setArrow = useCallback((element: HTMLDivElement | null) => {
    const id = element?.dataset.mate;
    if (!element || !id) return;
    const arrows = arrowRefs.current;
    arrows.set(id, new Marker(element));
    return () => {
      arrows.delete(id);
    };
  }, []);
  const stageStyle = useMemo(() => ({ "--home": home.primary, "--home2": home.secondary, "--away": away.primary }) as CSSProperties, [home.primary, home.secondary, away.primary]);

  const phase = hud?.phase ?? "intro";
  const outcome = hud?.outcome ?? null;
  const showAim = status === "ready" && phase === "aim" && !paused && !results;
  const letterbox = status === "ready" && (phase === "intro" || phase === "replay");
  const infoHint = level.tutorial && !tutorialDone ? level.tutorial.hint : goalOnly ? AIM_HINT_DIRECT : AIM_HINT;
  // Como girar a câmera: depois do tutorial, até o primeiro giro.
  const turnHint = !turnLearned && !(level.tutorial && !tutorialDone) ? (touchUi ? TURN_HINT_TOUCH : TURN_HINT_KEYS) : undefined;

  return (
    <div
      ref={rootRef}
      className={`${styles.stage} ${hud?.slow ? styles.stageSlow : ""} ${showAim ? styles.stageFrozen : ""} ${drawing ? styles.stageDrawing : ""} ${paused ? styles.stagePaused : ""}`}
      tabIndex={-1}
      style={stageStyle}
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
        <canvas ref={trailCanvasRef} className={styles.trail} style={{ visibility: "hidden" }} aria-hidden="true" />
        <div ref={setRing} className={styles.ballRing} style={{ opacity: 0 }} aria-hidden="true"><i /><b /></div>
        <div ref={tapRef} className={styles.tap} aria-hidden="true" />
        {(shotOnly ? [] : [level.hero, ...level.mates]).map((mate) => (
          <div
            key={mate.id}
            ref={setArrow}
            data-mate={mate.id}
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
      {freezeFlash !== null && (
        <div
          key={freezeFlash}
          className={styles.freezeFlash}
          onAnimationEnd={() => setFreezeFlash((current) => (current === freezeFlash ? null : current))}
          aria-hidden="true"
        />
      )}
      {goalFlash !== null && (
        <div
          key={`f${goalFlash}`}
          className={styles.goalFlash}
          onAnimationEnd={() => setGoalFlash((current) => (current === goalFlash ? null : current))}
          aria-hidden="true"
        />
      )}
      {confetti && <Confetti key={`c${confetti.key}`} pieces={confetti.pieces} />}

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
                ? <LivePlanChip store={planStore} directOnly={goalOnly} />
                : <AimHint key={hint.key} text={hint.tone === "error" ? hint.text : infoHint} tone={hint.tone} tag={level.tutorial && !tutorialDone ? "TUTORIAL" : undefined} extra={turnHint} />}
              {turned && !drawing && <RecenterButton onClick={recenter} />}
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
              {/* Monta a fase de novo com um WebGL novo, sem recarregar o app (a carreira em memória fica). */}
              {onRemount && <button type="button" className={styles.primaryButton} onClick={() => onRemount()}>Tentar de novo</button>}
              <button type="button" className={onRemount ? styles.secondaryButton : styles.primaryButton} onClick={() => window.location.reload()}>Recarregar</button>
              <button type="button" className={styles.secondaryButton} onClick={leave}>Fases</button>
            </div>
          </div>
        </div>
      )}

      {paused && (!results || rewatch) && (
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
          away={rewatch}
          onNext={next}
          onRetry={restart}
          onReplay={replayable ? watchReplay : undefined}
          onLevels={leave}
        />
      )}
    </div>
  );
}

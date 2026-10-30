// Simulação do Scorebobo: fases, bola (voo desenhado → física livre), colisões
// com traves, rede, goleiro e zagueiros, IA, câmera lenta, comemoração e
// replay. Determinística: mesma semente + mesmos traços = mesma jogada (passo
// fixo de 1/120 s de tempo de jogo; o tempo real só decide quantos passos).

import { celebrationIdOf, randomPlayerAppearance } from "../../player-appearance";
import {
  PITCH,
  type Actor,
  type GameState,
  type KickKind,
  type KickPlan,
  type Outcome,
  type ScoreboboGameApi,
  type ScoreLevel,
  type ScoreTeams,
  type SimEvent,
  type StrokeSample,
  type Vec2,
  type Vec3,
} from "../types";
import { HEAD_Y, SPRINT_SPEED, lookAt, moveToward, settlePose, updateDefender, updateMate, type DefenderBrain, type MateBrain } from "./ai";
import { designFlight, flightAt, flightPos, type Flight, type FlightSpec } from "./flight";
import { KeeperBrain } from "./keeper";
import { clamp, closestOnSegment3, dist2, easeOut, gaussian, hashParts, lerp, norm2, right2, rngFrom, yawOf, hypot } from "./math";
import { R, collideFrame, collideNet, freeStep, isRolling } from "./physics";
import { Recorder, ReplayPlayer, type ReplaySegment } from "./replay";
import { goalOutcome, type GoalFacts } from "./stars";
import { interpretStroke, specFromPlan, type DefenderSight } from "./stroke";

export type ScoreboboGameOptions = {
  /** Semente das imprecisões e do goleiro (mesma semente + mesmos traços = mesma jogada). */
  seed: number;
};

export const FIXED_DT = 1 / 120;
/** Apresentação: na primeira bola dá tempo de ler o objetivo e as estrelas; nas outras, só o respiro. */
const INTRO_TIME = 2.6;
const INTRO_TIME_RETRY = 1.4;
/** Chance de a barreira saltar (por bola, com a semente): a rasteira por baixo é aposta, não regra. */
const WALL_JUMP_CHANCE = 0.6;
/** Reação depois do gol (s reais) antes do replay. */
const GOAL_REACTION = 5.2;
/** Reação depois de uma tentativa perdida (s reais). */
const FAIL_REACTION = 2.3;
const GOAL_Z = PITCH.goalLineZ;
const HW = PITCH.goalHalfWidth;
const GH = PITCH.goalHeight;
const KEEPER_ID = "gk";

/** Comemorações do criador (CELEBRATION_OPTIONS) → ação do boneco (FigureAction). */
const SIGNATURE_ACTION: Record<string, string> = {
  kneeSlide: "kneeSlide",
  siuu: "siuu",
  cornerFlag: "flagDance",
  backflip: "backflip",
  airplane: "airplane",
  crest: "crestKiss",
  heart: "heart",
  shush: "shush",
  armsCrossed: "armsCrossed",
  cradle: "cradle",
  robot: "robot",
  dance: "dance",
};
const AUTO_CELEBRATIONS = Object.values(SIGNATURE_ACTION);
const MATE_CHEERS = ["jumpCheer", "fistPump", "hug", "highFive", "jumpCheer", "clap"];
const SAD_ACTIONS = ["handsOnHead", "handsOnHips", "kneelSad", "kickGround", "disbelief"];

type Live = {
  flight: Flight;
  t: number;
  shot: boolean;
  kind: KickKind;
  kicker: string;
  receiver: string | null;
  /** Altura em que o voo desenhado chega (cruzamento na cabeça ≈ 1,9). */
  endY: number;
};

type Pending = {
  kicker: string;
  plan: KickPlan;
  spec: FlightSpec;
  power: number;
  elapsed: number;
  contactAt: number;
  runup: number;
  runFrom: Vec2 | null;
  stand: Vec2;
  poseFrom: number;
};

type LastKick = {
  actor: string;
  kind: KickKind;
  shot: boolean;
  curve: number;
  from: Vec3;
  time: number;
  firstTime: boolean;
  /** Direção inicial do chute no chão (para ignorar quem está ao lado/atrás). */
  dir: Vec2 | null;
};

type Decision = {
  result: Outcome["result"];
  label: string;
  notes: string[];
  won: boolean;
  time: number;
  /** Para a reação: quem errou/perdeu, quem defendeu. */
  goal?: GoalFacts;
  caught?: boolean;
};

export class ScoreboboGame implements ScoreboboGameApi {
  readonly level: ScoreLevel;
  readonly teams: ScoreTeams;
  readonly options: ScoreboboGameOptions;
  readonly state: GameState;

  private home: MateBrain[] = [];
  private defenders: DefenderBrain[] = [];
  private keeper!: KeeperBrain;
  private ballSpot: Vec3 = { x: 0, y: R, z: 0 };
  private simTime = 0;
  private acc = 0;
  private introT = 0;
  private aimFrozen = false;
  /** De que lado da linha bola→gol o herói espera na mira (-1 = à esquerda da bola, como destro; 1 = à direita). */
  private aimSide = -1;
  private aerial: "header" | "volley" | null = null;
  private setPiece = false;
  private kickIndex = 0;
  private pending: Pending | null = null;
  private live: Live | null = null;
  private lastKick: LastKick | null = null;
  private follow: { id: string; pose: "kick" | "header" | "volley"; start: number; from: number; jump: number } | null = null;
  private shotLive = false;
  private inGoal = false;
  private prevBallZ = 0;
  private postHit: "post" | "bar" | null = null;
  private postHitT = 0;
  private keeperTouched = false;
  private decided: Decision | null = null;
  private outcomeReal = 0;
  private outcomeSim = 0;
  private awaitingNext = false;
  private stopT = 0;
  private lastPostT = -1;
  private lastNetT = -1;
  private receivedPass = new Set<string>();
  private recorder = new Recorder();
  private recording = false;
  private replayPlayer: ReplayPlayer | null = null;
  private liveSnapshot: { actors: Actor[]; ball: GameState["ball"] } | null = null;
  /** Trechos do replay do gol: ficam para o "Ver replay" do resultado (null sem gol, ou já solto). */
  private replaySegs: ReplaySegment[] | null = null;
  private goalTime = 0;
  private crossPoint: Vec3 | null = null;
  /** Adversários como o plano do traço os vê (montado ao entrar na mira). */
  private sights: DefenderSight[] = [];
  private out: SimEvent[] = [];

  constructor(level: ScoreLevel, teams: ScoreTeams, options: ScoreboboGameOptions) {
    this.level = level;
    this.teams = teams;
    this.options = options;
    this.state = {
      phase: "intro",
      time: 0,
      timeScale: 1,
      actors: [],
      ball: { pos: { x: 0, y: R, z: 0 }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 }, owner: null, inNet: false },
      heroId: level.hero.id,
      attempt: 1,
      attemptsLeft: level.attempts,
      passes: 0,
      plan: null,
      outcome: null,
      bestStars: 0,
      replay: null,
    };
    this.setupAttempt();
  }

  // ------------------------------------------------------------ montagem

  private setupAttempt() {
    const level = this.level;
    const s = this.state;
    const appearanceOf = (id: string) => randomPlayerAppearance(hashParts("scorebobo", level.id, id) % 2147483647);
    const goalCenter = { x: 0, z: GOAL_Z };
    const heroDir = norm2({ x: goalCenter.x - level.hero.pos.x, z: goalCenter.z - level.hero.pos.z });
    this.ballSpot = { x: level.hero.pos.x + heroDir.x * 0.5, y: R, z: level.hero.pos.z + heroDir.z * 0.5 };

    const actor = (base: Omit<Actor, "vel" | "facing" | "pose" | "poseT" | "look">, facing: number, pose: Actor["pose"]): Actor => ({
      ...base,
      pos: { ...base.pos },
      vel: { x: 0, z: 0 },
      facing,
      pose,
      poseT: 0,
      look: { ...this.ballSpot },
    });
    const faceBall = (p: Vec2) => yawOf({ x: this.ballSpot.x - p.x, z: this.ballSpot.z - p.z });

    const hero = actor(
      { id: level.hero.id, role: "hero", team: "home", name: level.hero.name, number: level.hero.number, appearance: level.hero.appearance ?? appearanceOf(level.hero.id), pos: level.hero.pos },
      yawOf(heroDir),
      "aim",
    );
    this.home = [{ actor: hero, run: [], runIdx: 0, receive: null, support: null, jumpStart: null }];
    for (const m of level.mates) {
      const a = actor({ id: m.id, role: "mate", team: "home", name: m.name, number: m.number, appearance: appearanceOf(m.id), pos: m.pos }, faceBall(m.pos), "ready");
      this.home.push({ actor: a, run: (m.run ?? []).map((p) => ({ ...p })), runIdx: 0, receive: null, support: null, jumpStart: null });
    }
    this.defenders = level.defenders.map((d) => ({
      actor: actor(
        { id: d.id, role: "defender", team: "away", name: d.name, number: d.number, appearance: appearanceOf(d.id), pos: d.pos },
        faceBall(d.pos),
        d.behavior === "wall" ? "wall" : "ready",
      ),
      behavior: d.behavior,
      home: { ...d.pos },
      mark: null,
      jumpStart: null,
      reactAt: Infinity,
      chase: null,
    }));
    // Marcação: cada um pega o atacante livre mais perto (sem ser quem está com a bola).
    const taken = new Set<string>();
    for (const d of this.defenders.filter((x) => x.behavior === "markNearest")) {
      const options = this.home.filter((m) => m.actor.id !== level.hero.id && !taken.has(m.actor.id));
      const pool = options.length ? options : this.home.filter((m) => m.actor.id !== level.hero.id);
      const near = pool.sort((a, b) => dist2(a.actor.pos, d.home) - dist2(b.actor.pos, d.home))[0];
      if (near) {
        d.mark = near.actor.id;
        taken.add(near.actor.id);
      }
    }
    const kpos = level.keeper.pos ?? KeeperBrain.basePosition({ x: this.ballSpot.x, z: this.ballSpot.z }, level.keeper.skill);
    const keeperActor = actor(
      { id: KEEPER_ID, role: "keeper", team: "away", name: level.keeper.name, number: level.keeper.number, appearance: appearanceOf(KEEPER_ID), pos: kpos },
      faceBall(kpos),
      "keeperReady",
    );
    const jitter = gaussian(rngFrom(hashParts(this.options.seed, s.attempt, "gk-reflex")));
    this.keeper = new KeeperBrain(keeperActor, level.keeper.skill, jitter);
    this.keeper.reset();
    this.keeper.anchor = level.keeper.pos ? { ...level.keeper.pos } : null;

    s.actors = [hero, ...this.home.slice(1).map((m) => m.actor), ...this.defenders.map((d) => d.actor), keeperActor];
    s.ball = { pos: { ...this.ballSpot }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 }, owner: hero.id, inNet: false };
    s.phase = "intro";
    s.time = 0;
    s.timeScale = 1;
    s.heroId = hero.id;
    s.passes = 0;
    s.plan = null;
    s.outcome = null;
    s.replay = null;

    this.simTime = 0;
    this.acc = 0;
    this.introT = 0;
    this.aimFrozen = false;
    this.aerial = null;
    this.setPiece = this.defenders.some((d) => d.behavior === "wall");
    this.kickIndex = 0;
    this.pending = null;
    this.live = null;
    this.lastKick = null;
    this.follow = null;
    this.shotLive = false;
    this.inGoal = false;
    this.prevBallZ = this.ballSpot.z;
    this.postHit = null;
    this.keeperTouched = false;
    this.decided = null;
    this.outcomeReal = 0;
    this.outcomeSim = 0;
    this.awaitingNext = false;
    this.stopT = 0;
    this.lastPostT = -1;
    this.lastNetT = -1;
    this.receivedPass.clear();
    this.recorder.clear();
    this.recording = false;
    this.replayPlayer = null;
    this.liveSnapshot = null;
    this.replaySegs = null;
    this.goalTime = 0;
    this.crossPoint = null;
    this.poseHeroForAim(null);
  }

  private actorById(id: string | null | undefined) {
    return id ? this.state.actors.find((a) => a.id === id) ?? null : null;
  }

  private brainOf(id: string | null | undefined) {
    return id ? this.home.find((m) => m.actor.id === id) ?? null : null;
  }

  /** O herói se ajeita atrás da bola na direção do traço (sem mexer na bola). */
  private poseHeroForAim(plan: KickPlan | null) {
    const hero = this.actorById(this.state.heroId);
    if (!hero) return;
    const ball = this.state.ball.pos;
    let dir = norm2({ x: -ball.x, z: GOAL_Z - ball.z });
    if (plan) {
      const first = plan.preview.find((p) => hypot(p.x - ball.x, p.z - ball.z) > 0.6) ?? plan.target;
      dir = norm2({ x: first.x - ball.x, z: first.z - ball.z });
    }
    // A câmera da mira fica atrás da BOLA, na linha bola→gol. O herói fica de
    // lado dessa linha (colado atrás da bola, o corpo dele tapava a bola onde o
    // traço começa). Como destro (quase todos os bonecos): a bola à direita
    // dele, o braço esquerdo de equilíbrio para longe dela. Só troca de lado
    // quando o traço vai forte para o lado dele (senão ele ficaria atrás da
    // bola, na frente da câmera); com folga, para não ficar pulando.
    const goalRight = right2(norm2({ x: -ball.x, z: GOAL_Z - ball.z }));
    const across = dir.x * goalRight.x + dir.z * goalRight.z;
    if (!plan || across < 0.15) this.aimSide = -1;
    else if (across > 0.45) this.aimSide = 1;
    const side = { x: goalRight.x * this.aimSide, z: goalRight.z * this.aimSide };
    if (this.aerial) {
      const back = this.aerial === "header" ? 0.28 : 0.55;
      hero.pos = { x: ball.x - dir.x * back, z: ball.z - dir.z * back };
      hero.facing = yawOf(dir);
    } else if (this.setPiece && this.kickIndex === 0) {
      // Cobrança: o batedor toma distância para a corrida.
      hero.pos = { x: ball.x - dir.x * 2.3 - side.x * 1.15, z: ball.z - dir.z * 2.3 - side.z * 1.15 };
      hero.facing = yawOf({ x: ball.x - hero.pos.x, z: ball.z - hero.pos.z });
    } else {
      // Pronto para bater: um passo atrás e ao lado da bola.
      hero.pos = { x: ball.x - dir.x * 0.8 - side.x * 0.78, z: ball.z - dir.z * 0.8 - side.z * 0.78 };
      hero.facing = yawOf({ x: ball.x + dir.x * 3 - hero.pos.x, z: ball.z + dir.z * 3 - hero.pos.z });
    }
    hero.vel = { x: 0, z: 0 };
    lookAt(hero, ball.x, ball.y, ball.z);
    if (!this.aerial) {
      hero.pose = "aim";
      hero.poseT = 0;
    }
  }

  // ------------------------------------------------------------ API

  planKick(samples: StrokeSample[]): KickPlan | null {
    if (this.state.phase !== "aim") return null;
    const plan = interpretStroke(samples, {
      ball: { ...this.state.ball.pos },
      heroId: this.state.heroId,
      aerial: this.aerial,
      mates: this.home,
      defenders: this.sights,
      keeper: { pos: this.keeper.actor.pos },
      windup: this.windup().contact,
    });
    this.state.plan = plan;
    this.poseHeroForAim(plan);
    return plan;
  }

  commitKick(plan: KickPlan): void {
    const s = this.state;
    if (s.phase !== "aim" || !plan) return;
    const exec = this.withError(plan);
    const spec = specFromPlan(exec);
    const hero = this.actorById(s.heroId);
    if (!hero) return;
    this.poseHeroForAim(plan);
    const w = this.windup();
    const ball = s.ball.pos;
    const first = plan.preview.find((p) => hypot(p.x - ball.x, p.z - ball.z) > 0.6) ?? plan.target;
    const launchDir = norm2({ x: first.x - ball.x, z: first.z - ball.z });
    const right = right2(launchDir);
    const stand = this.aerial ? { ...hero.pos } : { x: ball.x - launchDir.x * 0.5 - right.x * 0.14 * this.aimSide, z: ball.z - launchDir.z * 0.5 - right.z * 0.14 * this.aimSide };
    const power = clamp((exec.speed - 8) / 24, 0, 1);
    this.pending = {
      kicker: hero.id,
      plan: exec,
      spec,
      power: exec.kind === "lofted" || exec.kind === "chip" ? clamp(0.35 + exec.apex / 14, 0, 1) : power,
      elapsed: 0,
      contactAt: w.contact,
      runup: w.runup,
      runFrom: w.runup > 0 ? { ...hero.pos } : null,
      stand,
      poseFrom: this.aerial ? 0.35 : 0,
    };
    s.plan = plan;
    s.phase = "flight";
    s.timeScale = 1;
    this.aimFrozen = false;
    for (const m of this.home) m.actor.run = null;
    if (this.kickIndex === 0) {
      this.recording = true;
      this.recorder.record(this.simTime, s.ball, s.actors);
    }
    this.kickIndex += 1;
  }

  step(dt: number): SimEvent[] {
    this.out = [];
    const s = this.state;
    const real = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    switch (s.phase) {
      case "intro":
        this.introT += real;
        if (this.introT >= (s.attempt === 1 ? INTRO_TIME : INTRO_TIME_RETRY)) this.enterAim(true);
        break;
      case "aim":
        s.timeScale = this.aimFrozen ? 0 : 1;
        break;
      case "flight":
      case "outcome":
        this.updateTimeScale(real);
        this.acc += real * s.timeScale;
        // Muitos passos num quadro só (aba voltando do fundo): corta para não travar.
        this.acc = Math.min(this.acc, FIXED_DT * 24);
        while (this.acc >= FIXED_DT && (s.phase === "flight" || s.phase === "outcome")) {
          this.acc -= FIXED_DT;
          this.fixedStep();
        }
        if (s.phase === "outcome") this.updateOutcomeClock(real);
        break;
      case "replay":
        this.updateReplay(real);
        break;
      case "done":
        break;
    }
    return this.out;
  }

  skip(): void {
    const s = this.state;
    if (s.phase === "intro") this.enterAim(true);
    else if (s.phase === "replay") this.endReplay();
    else if (s.phase === "outcome" && this.decided) {
      if (this.decided.won) this.startReplay();
      else if (s.attemptsLeft > 0) this.nextAttempt();
      else this.finish();
    }
  }

  nextAttempt(): void {
    const s = this.state;
    if (s.phase !== "outcome" || !this.decided || this.decided.won || s.attemptsLeft <= 0) return;
    s.attempt += 1;
    this.setupAttempt();
  }

  restart(): void {
    this.state.attempt = 1;
    this.state.attemptsLeft = this.level.attempts;
    // A gravação velha some (o buffer fica para a próxima, sem nada legível: a contagem volta a zero).
    this.setupAttempt();
  }

  /** Fase ganha e encerrada, com o replay do gol ainda guardado. */
  get canReplay() {
    return this.state.phase === "done" && this.replaySegs !== null && this.recorder.length >= 4;
  }

  /** "Ver replay" no resultado: os mesmos trechos do começo; no fim volta ao "done" com o estado ao vivo. */
  replayAgain(): boolean {
    const segments = this.replaySegs;
    if (!segments || !this.canReplay) return false;
    this.playReplay(segments);
    return true;
  }

  /** Quem sai da fase: solta a gravação, a foto do estado ao vivo e o tocador. */
  dispose(): void {
    // No meio do replay, o estado ao vivo volta antes (um quadro a mais mostra a festa, não um pedaço do lance).
    if (this.state.phase === "replay") this.endReplay();
    this.recorder.dispose();
    this.recording = false;
    this.replayPlayer = null;
    this.replaySegs = null;
    this.liveSnapshot = null;
  }

  // ------------------------------------------------------------ fases

  private enterAim(fromIntro: boolean) {
    const s = this.state;
    s.phase = "aim";
    s.timeScale = fromIntro ? 1 : 0;
    this.aimFrozen = !fromIntro;
    // A cena desenha a corrida que falta de cada companheiro (as setas do Score! Hero).
    // Quem cortou caminho (foi receber, fez a tabela) já passou de alguns pontos: pula
    // os que ficaram para trás, senão a seta (e a corrida) voltava.
    for (const m of this.home) {
      while (m.runIdx < m.run.length - 1 && dist2(m.actor.pos, m.run[m.runIdx + 1]) < dist2(m.run[m.runIdx], m.run[m.runIdx + 1])) m.runIdx += 1;
      if (m.runIdx === m.run.length - 1 && m.run.length > 1 && dist2(m.actor.pos, m.run[m.runIdx]) < 1.5) m.runIdx += 1;
      m.actor.run = m.actor.id === s.heroId || m.runIdx >= m.run.length ? null : m.run.slice(m.runIdx).map((p) => ({ ...p }));
    }
    // Na mira o tempo para: o que o plano sabe dos adversários vale para todos os traços até o toque.
    this.sights = [
      ...this.defenders.map((d) => ({ id: d.actor.id, pos: d.actor.pos, vel: d.actor.vel, behavior: d.behavior, mark: d.mark, home: d.home })),
      { id: KEEPER_ID, pos: this.keeper.actor.pos, vel: { x: 0, z: 0 }, behavior: "keeper" as const },
    ];
    if (fromIntro) this.emit({ t: this.simTime, type: "whistle" });
  }

  /** Tempo do traço solto até o toque (corrida da cobrança, cabeceio já no ar). */
  private windup() {
    if (this.aerial) return { runup: 0, contact: 0.07 };
    if (this.setPiece && this.kickIndex === 0) return { runup: 0.52, contact: 0.7 };
    // O passo da preparação até a bola (≈0,7 m) e o golpe: perto do tempo em que o ritmo dos passes foi afinado (0,16 s).
    return { runup: 0.12, contact: 0.2 };
  }

  /** Erro determinístico (semente + tentativa + toque): perto do traço, nunca igual. */
  private withError(plan: KickPlan): KickPlan {
    const rand = rngFrom(hashParts(this.options.seed, this.state.attempt, this.kickIndex, "kick"));
    const e1 = gaussian(rand);
    const e2 = gaussian(rand);
    const e3 = gaussian(rand);
    const e4 = gaussian(rand);
    const sigma = 1 - clamp(plan.accuracy, 0, 1);
    const from = plan.from;
    const D = Math.max(1, hypot(plan.target.x - from.x, plan.target.z - from.z));
    const dir = norm2({ x: plan.target.x - from.x, z: plan.target.z - from.z });
    const side = right2(dir);
    const curve = plan.curve + e3 * sigma * (0.2 + 0.3 * Math.abs(plan.curve));
    if (plan.shot) {
      const lat = e1 * sigma * (0.45 + 0.045 * D);
      const vert = e2 * sigma * (0.3 + 0.03 * D);
      const grounded = plan.target.y <= R + 0.02 && plan.kind === "shot";
      return {
        ...plan,
        target: { x: plan.target.x + lat, y: grounded ? R : clamp(plan.target.y + vert, 0.15, 7), z: plan.target.z },
        curve,
        speed: plan.speed * (1 + e4 * sigma * 0.06),
        apex: plan.apex * (1 + e4 * sigma * 0.05),
      };
    }
    const lat = e1 * sigma * (0.35 + 0.05 * D);
    const along = e2 * sigma * (0.3 + 0.06 * D);
    return {
      ...plan,
      target: { x: plan.target.x + side.x * lat + dir.x * along, y: plan.target.y, z: plan.target.z + side.z * lat + dir.z * along },
      curve,
      speed: plan.speed * (1 + e4 * sigma * 0.07),
      apex: plan.apex * (1 + e4 * sigma * 0.06),
    };
  }

  private emit(e: SimEvent) {
    this.out.push(e);
    if (this.recording) this.recorder.event(e);
  }

  /** Câmera lenta no instante decisivo: bola chegando no gol e logo depois do lance. */
  private updateTimeScale(real: number) {
    const s = this.state;
    let target = 1;
    if (s.phase === "flight" && this.shotLive && !this.pending) {
      const b = s.ball;
      const vz = b.vel.z;
      if (vz > 3) {
        const tg = (GOAL_Z - b.pos.z) / vz;
        const x = b.pos.x + b.vel.x * tg;
        if (tg < 0.42 && tg > -0.2 && Math.abs(x) < HW + 3.5) target = 0.3;
      }
      if (this.keeper.mode === "dive") target = Math.min(target, 0.35);
    }
    if (s.phase === "outcome" && this.decided) {
      const r = this.decided.result;
      const hold = r === "goal" || r === "saved" || r === "post" ? 0.75 : 0.35;
      const slow = r === "goal" ? 0.3 : r === "saved" || r === "post" ? 0.35 : 0.55;
      target = this.outcomeReal < hold ? slow : 1;
    }
    s.timeScale += (target - s.timeScale) * (1 - Math.exp(-real * 9));
    if (Math.abs(s.timeScale - target) < 0.004) s.timeScale = target;
  }

  // ------------------------------------------------------------ passo fixo

  private fixedStep() {
    const h = FIXED_DT;
    this.simTime += h;
    const s = this.state;
    s.time = this.simTime;
    if (s.phase === "outcome") this.outcomeSim += h;
    if (this.pending) this.updatePending(h);
    this.updateActors(h);
    if (!this.pending) this.advanceBall(h);
    // Gol valendo: o replay só usa até ~1,15 s depois dele (replaySegments); a festa não precisa ser gravada.
    if (this.recording && this.decided?.won && this.simTime > this.goalTime + 1.25) this.recording = false;
    // Teto de ~45 s de gravação: um lance nunca chega perto disso.
    if (this.recording && this.recorder.length < 5400 && (s.phase === "flight" || s.phase === "outcome")) this.recorder.record(this.simTime, s.ball, s.actors);
  }

  private updatePending(h: number) {
    const p = this.pending;
    if (!p) return;
    p.elapsed += h;
    const a = this.actorById(p.kicker);
    if (!a) return;
    const ball = this.state.ball.pos;
    lookAt(a, ball.x, ball.y, ball.z);
    if (p.runFrom && p.elapsed < p.runup) {
      const k = easeOut(p.elapsed / p.runup);
      const prev = { ...a.pos };
      a.pos = { x: lerp(p.runFrom.x, p.stand.x, k), z: lerp(p.runFrom.z, p.stand.z, k) };
      a.vel = { x: (a.pos.x - prev.x) / h, z: (a.pos.z - prev.z) / h };
      a.facing = yawOf({ x: ball.x - a.pos.x, z: ball.z - a.pos.z });
      a.pose = "run";
      a.poseT = clamp(hypot(a.vel.x, a.vel.z) / SPRINT_SPEED, 0, 1);
    } else {
      const span = Math.max(0.01, p.contactAt - p.runup);
      const k = clamp((p.elapsed - p.runup) / span, 0, 1);
      if (!this.aerial) {
        a.pos = { x: lerp(a.pos.x, p.stand.x, 0.3), z: lerp(a.pos.z, p.stand.z, 0.3) };
        a.facing = yawOf({ x: p.plan.preview[Math.min(4, p.plan.preview.length - 1)].x - ball.x, z: p.plan.preview[Math.min(4, p.plan.preview.length - 1)].z - ball.z });
      }
      a.vel = { x: a.vel.x * 0.8, z: a.vel.z * 0.8 };
      a.pose = this.aerial ?? "kick";
      a.poseT = lerp(p.poseFrom, 0.5, k);
    }
    if (p.elapsed >= p.contactAt) this.launch(p);
  }

  private launch(p: Pending) {
    const s = this.state;
    const time = this.simTime;
    const flight = designFlight(p.spec);
    const st = flightAt(flight, 0);
    const kicker = this.actorById(p.kicker);
    s.ball.owner = null;
    s.ball.vel = st.vel;
    s.ball.spin = { x: flight.spin.x, y: flight.spin.y, z: 0 };
    const shot = p.plan.shot;
    this.live = { flight, t: 0, shot, kind: p.plan.kind, kicker: p.kicker, receiver: shot ? null : p.plan.receiver, endY: flightAt(flight, flight.T).pos.y };
    this.pending = null;
    this.emit({ t: time, type: "kick", actor: p.kicker, kind: p.plan.kind, power: Math.round(p.power * 100) / 100 });
    this.lastKick = {
      actor: p.kicker,
      kind: p.plan.kind,
      shot,
      curve: Math.abs(p.plan.curve),
      from: { ...s.ball.pos },
      time,
      firstTime: this.receivedPass.has(p.kicker),
      dir: hypot(st.vel.x, st.vel.z) > 0.5 ? norm2({ x: st.vel.x, z: st.vel.z }) : null,
    };
    const pose = this.aerial ?? "kick";
    this.follow = { id: p.kicker, pose, start: time, from: 0.5, jump: kicker?.jump ?? 0 };
    this.aerial = null;
    this.stopT = 0;
    this.postHit = null;
    if (shot) {
      this.shotLive = true;
      this.keeper.onShot(time, this.setPiece && this.kickIndex === 1);
      // A barreira aposta antes de ver a bola: às vezes salta (a rasteira passa por baixo), às vezes fica.
      const wallJumps = rngFrom(hashParts(this.options.seed, s.attempt, this.kickIndex, "wall-jump"))() < WALL_JUMP_CHANCE;
      for (const d of this.defenders) {
        d.reactAt = time + 0.12;
        if (d.behavior === "wall" && wallJumps) d.jumpStart = time - 0.02 + (hashParts(d.actor.id, this.options.seed) % 5) * 0.012;
      }
    } else {
      for (const d of this.defenders) {
        d.reactAt = time + 0.3;
        // Cobrança rolada: a barreira se desfaz e vira defesa normal.
        if (d.behavior === "wall") {
          d.behavior = "hold";
          d.home = { ...d.actor.pos };
        }
      }
      const end = flightAt(flight, flight.T).pos;
      for (const m of this.home) m.receive = null;
      const rec = this.brainOf(this.live.receiver);
      if (rec) rec.receive = { target: { x: end.x, z: end.z }, at: time + flight.T };
      // Quem passou vai para o apoio (tabela).
      const kb = this.brainOf(p.kicker);
      if (kb && kicker) {
        const toGoal = norm2({ x: -kicker.pos.x * 0.4, z: GOAL_Z - 6 - kicker.pos.z });
        kb.support = { x: kicker.pos.x + toGoal.x * 7, z: Math.min(GOAL_Z - 8, kicker.pos.z + toGoal.z * 7) };
      }
      this.considerKeeperRush(flight, end, time);
    }
  }

  /** Bola na área que ele alcança antes do atacante: o goleiro sai. */
  private considerKeeperRush(flight: Flight, end: Vec3, time: number) {
    const e = { x: end.x, z: end.z };
    const inBox = Math.abs(e.x) < PITCH.boxHalfWidth && e.z > GOAL_Z - PITCH.boxDepth;
    if (!inBox) return;
    const small = Math.abs(e.x) < PITCH.smallBoxHalfWidth && e.z > GOAL_Z - PITCH.smallBoxDepth - 0.5;
    if (!(small || (end.y < 1.0 && e.z > GOAL_Z - 8))) return;
    const k = this.keeper.actor;
    const tK = 0.3 + dist2(k.pos, e) / 6.6;
    const rec = this.brainOf(this.live?.receiver);
    const tR = rec ? Math.max(flight.T, dist2(rec.actor.pos, e) / SPRINT_SPEED) : flight.T + 1;
    // Só sai quando chega claramente antes: bola dividida, ele fica.
    if (tK + 0.3 < tR) this.keeper.rush(e);
    void time;
  }

  // ------------------------------------------------------------ atores

  private updateActors(h: number) {
    const s = this.state;
    const time = this.simTime;
    const ball = s.ball;
    if (s.phase === "outcome") {
      this.updateOutcomeActors(h);
      return;
    }
    const loose = !this.live && !ball.owner && !this.decided && this.lastKick && !this.lastKick.shot;
    let chaser: MateBrain | null = null;
    if (loose) {
      // Bola solta: o mais perto vai nela.
      let best = Infinity;
      for (const m of this.home) {
        if (m.actor.id === this.lastKick?.actor && time - (this.lastKick?.time ?? 0) < 0.5) continue;
        const d = dist2(m.actor.pos, ball.pos);
        if (d < best) {
          best = d;
          chaser = m;
        }
      }
    }
    for (const m of this.home) {
      const a = m.actor;
      if (this.pending && this.pending.kicker === a.id) continue;
      if (this.follow && this.follow.id === a.id && this.animateFollow(a, h)) continue;
      if (chaser === m) {
        m.receive = { target: { x: ball.pos.x + ball.vel.x * 0.35, z: ball.pos.z + ball.vel.z * 0.35 }, at: time + 0.1 };
      }
      // Cruzamento vindo na cabeça: salta na hora certa.
      if (m.receive && this.live && this.live.receiver === a.id && m.jumpStart === null) {
        const arrive = m.receive.at - time;
        const endY = this.live.endY;
        if (endY > 1.5 && arrive < 0.32 && arrive > 0) m.jumpStart = time;
      }
      updateMate(m, h, time, ball, true);
    }
    // A previsão é a mesma para todos os zagueiros neste passo: calcula cada instante uma vez.
    let forecast: ((ahead: number) => Vec3) | null = null;
    if (!ball.owner && !this.decided) {
      const seen: number[] = [];
      const at: Vec3[] = [];
      forecast = (ahead: number) => {
        const i = seen.indexOf(ahead);
        if (i >= 0) return at[i];
        const p = this.forecast(ahead);
        seen.push(ahead);
        at.push(p);
        return p;
      };
    }
    for (const d of this.defenders) {
      // Bola alta chegando: sobe para cabecear.
      if (d.jumpStart === null && d.behavior !== "wall" && !ball.owner) {
        const near = hypot(ball.pos.x - d.actor.pos.x, ball.pos.z - d.actor.pos.z);
        if (near < 2.2 && ball.pos.y > 1.7 && ball.pos.y < 3.1 && time >= d.reactAt) d.jumpStart = time;
      }
      updateDefender(d, h, time, ball, this.home, forecast, true);
    }
    this.keeper.update(h, time, ball, !ball.owner, this.shotLive);
    this.keeper.record(time, ball);
  }

  /** Continuação do chute (o boneco termina o movimento antes da IA voltar). */
  private animateFollow(a: Actor, h: number) {
    const f = this.follow;
    if (!f) return false;
    const dur = f.pose === "kick" ? 0.34 : 0.48;
    const u = (this.simTime - f.start) / dur;
    if (u >= 1) {
      this.follow = null;
      a.jump = 0;
      return false;
    }
    a.pose = f.pose;
    a.poseT = lerp(f.from, 1, clamp(u, 0, 1));
    a.vel = { x: a.vel.x * Math.exp(-6 * h), z: a.vel.z * Math.exp(-6 * h) };
    a.pos = { x: a.pos.x + a.vel.x * h, z: a.pos.z + a.vel.z * h };
    // Cabeceio: desce do salto.
    a.jump = f.jump > 0 ? Math.max(0, f.jump * (1 - u * u * 1.4)) : 0;
    lookAt(a, this.state.ball.pos.x, this.state.ball.pos.y, this.state.ball.pos.z);
    return true;
  }

  /** Onde a bola estará daqui a `ahead` s (voo desenhado ou balística simples). */
  private forecast(ahead: number): Vec3 {
    const live = this.live;
    if (live) return flightPos(live.flight, Math.min(live.flight.T, live.t + ahead));
    const b = this.state.ball;
    return { x: b.pos.x + b.vel.x * ahead, y: Math.max(R, b.pos.y + b.vel.y * ahead - 4.9 * ahead * ahead), z: b.pos.z + b.vel.z * ahead };
  }

  // ------------------------------------------------------------ bola

  private advanceBall(h: number) {
    const s = this.state;
    const ball = s.ball;
    if (ball.owner) {
      if (ball.owner === KEEPER_ID) {
        ball.pos = this.keeper.handsPoint(this.simTime);
        ball.vel = { x: 0, y: 0, z: 0 };
        ball.spin = { x: 0, y: 0, z: 0 };
      }
      return;
    }
    const speed = hypot(ball.vel.x, ball.vel.y, ball.vel.z);
    const n = clamp(Math.ceil((speed * h) / 0.06), 1, 10);
    const sub = h / n;
    for (let i = 0; i < n; i += 1) {
      this.prevBallZ = ball.pos.z;
      const live = this.live;
      if (live) {
        live.t += sub;
        const st = flightAt(live.flight, live.t);
        ball.pos = st.pos;
        ball.vel = st.vel;
        if (live.flight.spec.grounded) ball.spin.x = hypot(st.vel.x, st.vel.z) / R;
        if (live.t >= live.flight.T) this.endFlight();
      } else {
        freeStep(ball, sub);
      }
      if (this.collide(sub)) this.live = null;
      this.detect(sub);
      if (s.phase === "aim" || ball.owner) return;
    }
  }

  /** Fim do voo desenhado: a física livre assume (com o efeito para manter a curva). */
  private endFlight() {
    const live = this.live;
    if (!live) return;
    this.live = null;
    const b = this.state.ball;
    b.spin = { x: live.flight.spin.x, y: live.flight.spin.y, z: 0 };
  }

  /** Colisões do sub-passo. Devolve se a bola mudou de rumo (sai do voo desenhado). */
  private collide(sub: number) {
    const s = this.state;
    const ball = s.ball;
    const time = this.simTime;
    let changed = false;
    const frame = collideFrame(ball);
    if (frame) {
      changed = true;
      if (time - this.lastPostT > 0.12) {
        this.emit({ t: time, type: "post", part: frame.part });
        this.lastPostT = time;
      }
      if (!this.decided && !this.postHit) this.postHitT = time;
      if (!this.decided) this.postHit = frame.part;
    }
    const net = collideNet(ball, this.inGoal, sub);
    if (net) {
      changed = true;
      // Só a bola chegando conta: encostada na rede ela "bate" a cada passo (estufava e chiava sem parar).
      if (net.speed > 1.5 && time - this.lastNetT > 0.3) {
        this.emit({ t: time, type: "net", point: { ...net.point }, speed: Math.round(net.speed * 10) / 10 });
        this.lastNetT = time;
      }
    }
    if (this.inGoal) return changed;

    // Goleiro (depois de decidido o lance, a bola só segue o rumo).
    if (!this.keeperTouched && !this.decided && this.keeper.mode !== "hold") {
      for (const c of this.keeper.capsules(time)) {
        const hit = closestOnSegment3(ball.pos, c.a, c.b);
        if (hit.dist < c.r + R) {
          this.keeperSave(c.part, hit.point);
          return true;
        }
      }
    }
    if (this.decided) return changed;

    // Zagueiros (e barreira).
    for (const d of this.defenders) {
      const a = d.actor;
      const jump = a.jump ?? 0;
      const y = ball.pos.y;
      const top = HEAD_Y + jump + 0.14;
      if (y - R > top || y + R < jump) continue;
      const hd = hypot(ball.pos.x - a.pos.x, ball.pos.z - a.pos.z);
      // Colado em quem chutou, mas do lado ou atrás: a bola já saiu dele.
      const lk = this.lastKick;
      if (lk && lk.dir) {
        const fromKick = hypot(ball.pos.x - lk.from.x, ball.pos.z - lk.from.z);
        const ahead = (a.pos.x - lk.from.x) * lk.dir.x + (a.pos.z - lk.from.z) * lk.dir.z;
        if (fromKick < 1.2 && ahead < 0.35) continue;
      }
      let reach = 0.3;
      const aware = time >= d.reactAt;
      if (d.behavior !== "wall" && aware) {
        const sp = hypot(ball.vel.x, ball.vel.z);
        if (y < 0.6) reach = sp > 20 ? 0.5 : 0.78;
        else if (y > HEAD_Y - 0.35) reach = 0.42;
      }
      if (hd < reach + R) {
        this.intercept(d, hd);
        return true;
      }
    }
    // Companheiros: domínio (passe) ou cabeceio/voleio.
    if (this.lastKick && !this.lastKick.shot) this.tryControl();
    return changed;
  }

  private tryControl() {
    const s = this.state;
    const ball = s.ball;
    const time = this.simTime;
    const lk = this.lastKick;
    if (!lk) return;
    const live = this.live;
    for (const m of this.home) {
      const a = m.actor;
      if (a.id === lk.actor && time - lk.time < 0.45) continue;
      const hd = hypot(ball.pos.x - a.pos.x, ball.pos.z - a.pos.z);
      const y = ball.pos.y;
      const isReceiver = live?.receiver === a.id || m.receive !== null;
      if (y <= 0.62) {
        if (hd <= (isReceiver ? 1.0 : 0.82)) return this.control(m, null);
      } else if (y <= 2.75 + (a.jump ?? 0) * 0.5 && hd <= 1.15) {
        // Cruzamento (chega na altura da cabeça) vira cabeceio; lançamento que
        // chega baixo espera descer: voleio perto da área, domínio no resto.
        const forHead = !live || live.endY >= 1.4;
        const nearBox = Math.abs(a.pos.x) <= PITCH.boxHalfWidth + 2 && a.pos.z >= GOAL_Z - PITCH.boxDepth - 3;
        if (y >= 1.3) {
          if (forHead && nearBox) return this.control(m, "header");
          if (!nearBox && y < 1.9) return this.control(m, null);
          continue;
        }
        if (nearBox) return this.control(m, "volley");
        return this.control(m, null);
      }
    }
  }

  /** Tempo congela: quem recebeu vira o herói. */
  private control(m: MateBrain, aerial: "header" | "volley" | null) {
    const s = this.state;
    const ball = s.ball;
    const a = m.actor;
    const time = this.simTime;
    // Dividida: zagueiro mais perto da bola (e alcançando) ganha antes do domínio.
    const mine = hypot(ball.pos.x - a.pos.x, ball.pos.z - a.pos.z);
    for (const d of this.defenders) {
      if (d.behavior === "wall" || time < d.reactAt) continue;
      const dd = hypot(ball.pos.x - d.actor.pos.x, ball.pos.z - d.actor.pos.z);
      const canHead = ball.pos.y <= HEAD_Y + 0.55 + R;
      if (dd < 0.6 && dd < mine && canHead) {
        this.intercept(d, dd);
        return;
      }
    }
    const prevHero = this.actorById(s.heroId);
    if (prevHero && prevHero.id !== a.id) prevHero.role = "mate";
    a.role = "hero";
    s.heroId = a.id;
    // Buscar a própria bola não é passe (nem conta como "de primeira").
    const own = this.lastKick?.actor === a.id;
    if (!own) {
      s.passes += 1;
      this.receivedPass.add(a.id);
    }
    this.emit({ t: time, type: "receive", actor: a.id, aerial: aerial !== null });
    this.emit({ t: time, type: "control", actor: a.id });
    this.live = null;
    this.acc = 0;
    for (const other of this.home) other.receive = null;
    this.shotLive = false;
    this.follow = null;
    m.receive = null;
    m.support = null;
    ball.vel = { x: 0, y: 0, z: 0 };
    ball.spin = { x: 0, y: 0, z: 0 };
    this.aerial = aerial;
    if (aerial) {
      ball.owner = null;
      ball.pos.y = clamp(ball.pos.y, aerial === "header" ? 1.75 : 0.55, aerial === "header" ? 2.55 : 1.3);
      a.jump = aerial === "header" ? clamp(ball.pos.y - HEAD_Y, 0, 0.55) : 0;
      a.pose = aerial;
      a.poseT = 0.35;
      m.jumpStart = null;
    } else {
      ball.owner = a.id;
      ball.pos.y = R;
      a.jump = 0;
    }
    // Os outros param onde estão (tempo congelado); as corridas seguem no próximo toque.
    for (const d of this.defenders) d.chase = null;
    this.keeper.afterParry();
    this.poseHeroForAim(null);
    this.enterAim(false);
  }

  private keeperSave(part: "hands" | "body" | "legs", point: Vec3) {
    const s = this.state;
    const ball = s.ball;
    const time = this.simTime;
    const k = this.keeper;
    this.keeperTouched = true;
    const speed = hypot(ball.vel.x, ball.vel.y, ball.vel.z);
    const shot = !!this.lastKick?.shot;
    // Bola no corpo dele segura até forte; esticado, só as fracas.
    const central = Math.abs(point.x - k.actor.pos.x) < 0.6 && ball.pos.y < 2.0 && k.stretch() < 0.35;
    const catchable = !shot || (part !== "legs" && ball.pos.y < 2.3 && (central ? speed < 22 + 10 * k.skill : speed < 12 + 9 * k.skill && k.stretch() < 0.8));
    this.live = null;
    if (catchable) {
      k.catchBall(time);
      ball.owner = KEEPER_ID;
      ball.pos = k.handsPoint(time);
      ball.vel = { x: 0, y: 0, z: 0 };
      ball.spin = { x: 0, y: 0, z: 0 };
    } else {
      // Espalma: para fora, por cima ou de volta para a área — nunca para dentro.
      const rand = rngFrom(hashParts(this.options.seed, s.attempt, this.kickIndex, "parry"));
      const side = Math.sign(point.x - k.actor.pos.x) || (rand() < 0.5 ? -1 : 1);
      if (ball.pos.y > 1.95) {
        ball.vel = { x: ball.vel.x * 0.25 + side * 1.5, y: 4.2 + rand() * 1.2, z: 2.6 + rand() * 0.8 };
      } else if (Math.abs(point.x - k.actor.pos.x) > 0.7) {
        ball.vel = { x: side * (3 + speed * 0.22), y: 1.2 + rand() * 2.2, z: -(1 + rand() * 2.2) };
      } else {
        ball.vel = { x: (rand() - 0.5) * 6, y: 1.5 + rand() * 2, z: -(4 + speed * 0.18) };
      }
      ball.spin = { x: -8, y: (rand() - 0.5) * 20, z: 0 };
      k.afterParry();
    }
    this.emit({ t: time, type: "save", actor: KEEPER_ID, caught: catchable });
    if (!this.decided) {
      if (shot) {
        this.decide("saved", catchable ? (central ? "Em cima do goleiro!" : "Defendeu!") : "Espalmou!", ["Mire nos cantos, longe do goleiro", "Com curva, a bola engana o goleiro"], { caught: catchable });
      } else {
        this.decide("saved", "O goleiro ficou com ela", ["Passe longe do goleiro: ele sai nas bolas na área"], { caught: true });
      }
    }
  }

  private intercept(d: DefenderBrain, hd: number) {
    const s = this.state;
    const ball = s.ball;
    const time = this.simTime;
    const a = d.actor;
    const shot = !!this.lastKick?.shot;
    this.live = null;
    this.emit({ t: time, type: "intercept", actor: a.id });
    const rand = rngFrom(hashParts(this.options.seed, s.attempt, this.kickIndex, "block", a.id));
    const speed = hypot(ball.vel.x, ball.vel.y, ball.vel.z);
    if (d.behavior === "wall" || (shot && hd < 0.45)) {
      // Bate no corpo e espirra.
      ball.vel = { x: -ball.vel.x * 0.25 + (rand() - 0.5) * 5, y: 2 + rand() * 3, z: -Math.abs(ball.vel.z) * 0.3 - 1 };
    } else {
      // Corta: chutão para longe do gol (ou cabeçada).
      const high = ball.pos.y > 1.2;
      ball.vel = { x: (rand() - 0.5) * 10, y: high ? 4 + rand() * 3 : 3 + rand() * 4, z: -(9 + rand() * 6 + speed * 0.1) };
      a.pose = high ? "header" : "kick";
      a.poseT = 0.5;
    }
    ball.spin = { x: -6, y: (rand() - 0.5) * 16, z: 0 };
    const label = d.behavior === "wall" ? "Na barreira!" : shot ? "Bloqueado!" : "Cortou!";
    const tips = d.behavior === "wall"
      ? ["Passe a bola por cima da barreira ou faça a curva por fora dela"]
      : shot ? ["Chute com o caminho livre: o zagueiro estava na frente"] : ["Desvie dos zagueiros: curva no traço ou lançamento por cima"];
    this.decide("intercepted", label, tips);
  }

  private detect(sub: number) {
    const s = this.state;
    const ball = s.ball;
    const p = ball.pos;
    const time = this.simTime;
    // Cruzou a linha do gol?
    if (!this.inGoal && p.z > GOAL_Z + R && this.prevBallZ <= GOAL_Z + R + 0.05) {
      if (Math.abs(p.x) < HW && p.y < GH) {
        this.inGoal = true;
        ball.inNet = true;
        this.crossPoint = { ...p };
        if (!this.decided) this.scoreGoal();
        return;
      }
      if (!this.decided) {
        if (this.postHit) this.decide("post", this.postHit === "bar" ? "No travessão!" : "Na trave!", ["Quase! Um pouco mais para dentro"]);
        else if (this.lastKick && !this.lastKick.shot) this.decide("miss", "Saiu pela linha de fundo", ["Leve o traço até um companheiro (ou na frente da corrida dele)"], { reason: "out" });
        else this.decide("miss", p.y >= GH ? "Por cima!" : "Pra fora!", [p.y >= GH ? "Termine o traço mais baixo no gol" : "Termine o traço dentro do gol"], { reason: p.y >= GH ? "over" : "wide" });
      }
      return;
    }
    if (this.decided) return;
    if (Math.abs(p.x) > PITCH.halfWidth + R) {
      this.decide(this.postHit ? "post" : "miss", this.postHit ? "Na trave!" : "Saiu!", ["A bola saiu pela lateral"], { reason: "out" });
      return;
    }
    // Voltou para o próprio campo: o contra-ataque morreu.
    if (p.z < PITCH.halfwayZ - R) {
      this.decide("miss", "Voltou para o seu campo", ["Jogue para a frente: até um companheiro ou até o gol"], { reason: "out" });
      return;
    }
    // Parou?
    const sp = hypot(ball.vel.x, ball.vel.z);
    if (!this.live && isRolling(ball) && sp < 0.35) this.stopT += sub;
    else this.stopT = 0;
    const lk = this.lastKick;
    const since = lk ? time - lk.time : 0;
    if (lk?.shot) {
      if (this.stopT > 0.35 || since > 6) {
        if (this.postHit) this.decide("post", this.postHit === "bar" ? "No travessão!" : "Na trave!", ["Quase! Um pouco mais para dentro"]);
        else this.decide("miss", "Fraco demais", ["Desenhe mais rápido para chutar forte"], { reason: "short" });
      } else if (this.postHit && ((ball.vel.z < -2 && p.z < GOAL_Z - 3) || time - this.postHitT > 1.4)) {
        // Rebote da trave voltando para o campo: acabou.
        this.decide("post", this.postHit === "bar" ? "No travessão!" : "Na trave!", ["Quase! Um pouco mais para dentro"]);
      }
    } else if (lk) {
      // Bola no espaço que ninguém alcança: decide logo (não prende a tela por 9 s).
      const someoneNear = this.home.some((m) => m.actor.id !== lk.actor && dist2(m.actor.pos, p) < 7);
      if (this.stopT > (someoneNear ? 2.4 : 1.2) || since > 6.5) {
        this.decide("miss", "Ninguém chegou", ["Leve o traço até um companheiro (ou na frente da corrida dele)"], { reason: "short" });
      }
    }
  }

  private scoreGoal() {
    const s = this.state;
    const lk = this.lastKick;
    const cross = this.crossPoint ?? s.ball.pos;
    if (!lk) return;
    const scorer = this.actorById(lk.actor);
    if (!scorer || scorer.team !== "home") {
      this.decide("miss", "Gol contra?!", [], { reason: "out" });
      return;
    }
    const outsideBox = Math.abs(lk.from.x) > PITCH.boxHalfWidth || lk.from.z < GOAL_Z - PITCH.boxDepth;
    const goal: GoalFacts = {
      t: this.simTime,
      type: "goal",
      scorer: lk.actor,
      header: lk.kind === "header",
      volley: lk.kind === "volley",
      curve: Math.round(lk.curve * 10) / 10,
      distance: Math.round(hypot(cross.x - lk.from.x, cross.z - lk.from.z) * 10) / 10,
      topCorner: Math.abs(cross.x) >= HW - 1.25 && cross.y >= GH - 0.85,
      firstTime: lk.firstTime,
      passes: s.passes,
      attempt: s.attempt,
      outsideBox,
    };
    const outcome = goalOutcome(this.level, goal);
    const { attempt: _a, outsideBox: _o, ...event } = goal;
    void _a;
    void _o;
    // Entrou, mas não valeu (faltou o requisito da fase): a cena anula em vez de festejar.
    this.emit(outcome.stars > 0 ? event : { ...event, valid: false });
    this.goalTime = this.simTime;
    this.decide("goal", outcome.label, outcome.notes, { goal, outcome });
  }

  private decide(
    result: Outcome["result"],
    label: string,
    notes: string[],
    extra: { reason?: "wide" | "over" | "short" | "out"; caught?: boolean; goal?: GoalFacts; outcome?: Outcome } = {},
  ) {
    const s = this.state;
    if (this.decided) return;
    if (extra.reason) this.emit({ t: this.simTime, type: "miss", reason: extra.reason });
    const outcome: Outcome = extra.outcome ?? { result, label, stars: 0, notes };
    const won = result === "goal" && outcome.stars > 0;
    this.decided = { result, label, notes, won, time: this.simTime, goal: extra.goal, caught: extra.caught };
    this.shotLive = false;
    s.outcome = outcome;
    if (won) s.bestStars = Math.max(s.bestStars, outcome.stars) as GameState["bestStars"];
    else {
      s.attemptsLeft = Math.max(0, s.attemptsLeft - 1);
      // Sem gol não tem replay: para de gravar (a reação pode durar o quanto o jogador quiser).
      this.recording = false;
    }
    s.phase = "outcome";
    this.outcomeReal = 0;
    this.outcomeSim = 0;
    this.awaitingNext = false;
    this.prepareReactions();
  }

  // ------------------------------------------------------------ reação

  private celebrations = new Map<string, string>();

  private prepareReactions() {
    this.celebrations.clear();
    const d = this.decided;
    if (!d) return;
    const seed = this.options.seed;
    const pick = <T,>(list: T[], ...parts: Array<string | number>) => list[hashParts(seed, this.state.attempt, ...parts) % list.length];
    const scorerId = d.goal?.scorer ?? null;
    for (const m of this.home) {
      const id = m.actor.id;
      if (d.won && id === scorerId) {
        const sig = celebrationIdOf(m.actor.appearance);
        this.celebrations.set(id, sig !== "auto" && SIGNATURE_ACTION[sig] ? SIGNATURE_ACTION[sig] : pick(AUTO_CELEBRATIONS, "celebrate", id));
      } else if (d.won) {
        this.celebrations.set(id, pick(MATE_CHEERS, "cheer", id));
      } else {
        this.celebrations.set(id, d.result === "goal" ? "disbelief" : pick(SAD_ACTIONS, "sad", id));
      }
    }
    for (const def of this.defenders) {
      const id = def.actor.id;
      this.celebrations.set(id, d.won ? pick(["handsOnHead", "handsOnHips", "kickGround", "kneelSad"], "def", id) : d.result === "saved" ? "clap" : d.result === "intercepted" ? "fistPump" : "handsOnHips");
    }
    this.celebrations.set(KEEPER_ID, d.won ? pick(["kickGround", "handsOnHips", "sitDown"], "gk") : "fistPump");
  }

  /** Comemoração do gol (artilheiro corre, time abraça) ou lamento. */
  private updateOutcomeActors(h: number) {
    const s = this.state;
    const d = this.decided;
    const time = this.simTime;
    const t = this.outcomeSim;
    const ball = s.ball;
    if (!d) return;
    const scorer = d.won && d.goal ? this.actorById(d.goal.scorer) : null;
    const celebrationSpot = scorer ? this.celebrationSpot(scorer) : null;
    this.home.forEach((m, index) => {
      const a = m.actor;
      if (this.follow && this.follow.id === a.id && this.animateFollow(a, h)) return;
      a.jump = 0;
      if (d.won && scorer && celebrationSpot) {
        if (a.id === scorer.id) {
          const run = t < 1.5 && dist2(a.pos, celebrationSpot) > 0.6;
          const speed = run ? moveToward(a, celebrationSpot, 6.4, h, null) : moveToward(a, a.pos, 0, h, null);
          if (run) settlePose(a, speed);
          else {
            a.pose = "celebrate";
            a.poseT = clamp((t - 1.2) / 1.5, 0, 1);
            a.celebration = this.celebrations.get(a.id);
            a.facing = yawOf({ x: -a.pos.x * 0.3, z: 20 - a.pos.z });
          }
          a.look = null;
          return;
        }
        // Os outros vão abraçar.
        const ang = (index / Math.max(1, this.home.length)) * Math.PI * 2 + 0.6;
        const spot = { x: scorer.pos.x + Math.sin(ang) * 1.3, z: scorer.pos.z + Math.cos(ang) * 1.3 };
        const far = dist2(a.pos, spot) > 0.5;
        const speed = moveToward(a, spot, SPRINT_SPEED, h, scorer.pos);
        if (far && t < 4) settlePose(a, speed);
        else {
          a.pose = "celebrate";
          a.celebration = this.celebrations.get(a.id);
          a.poseT = clamp(t / 3, 0, 1);
          a.facing = yawOf({ x: scorer.pos.x - a.pos.x, z: scorer.pos.z - a.pos.z });
        }
        lookAt(a, scorer.pos.x, 1.6, scorer.pos.z);
        return;
      }
      // Não deu: freia e lamenta (quem chutou primeiro, os outros depois).
      const speed = moveToward(a, a.pos, 0, h, { x: ball.pos.x, z: ball.pos.z });
      const delay = a.id === s.heroId ? 0.25 : 0.55 + index * 0.08;
      if (t > delay && speed < 1.5) {
        a.pose = "dejected";
        a.celebration = this.celebrations.get(a.id);
        a.poseT = clamp((t - delay) / 1.2, 0, 1);
      } else settlePose(a, speed);
      lookAt(a, ball.pos.x, ball.pos.y, ball.pos.z);
    });
    // O abraço não atravessa ninguém: quem chega colado é empurrado para fora (cabeças não se fundem no close).
    if (d.won) this.separate(this.home.map((m) => m.actor), 0.78);
    this.defenders.forEach((def, index) => {
      const a = def.actor;
      a.jump = def.behavior === "wall" ? Math.max(0, (a.jump ?? 0) - h * 2) : 0;
      const speed = moveToward(a, a.pos, 0, h, { x: ball.pos.x, z: ball.pos.z });
      const delay = 0.45 + index * 0.07;
      if (t > delay && speed < 1.2 && (d.won || d.result === "saved" || d.result === "intercepted")) {
        a.pose = d.won ? "dejected" : "celebrate";
        a.celebration = this.celebrations.get(a.id);
        a.poseT = clamp((t - delay) / 1.2, 0, 1);
      } else if (a.pose !== "kick" && a.pose !== "header") settlePose(a, speed);
      else a.poseT = Math.min(1, a.poseT + h * 2.5);
      lookAt(a, ball.pos.x, ball.pos.y, ball.pos.z);
    });
    // Goleiro: termina o mergulho; depois comemora a defesa ou lamenta o gol.
    const k = this.keeper;
    k.update(h, time, ball, !ball.owner, false);
    const ka = k.actor;
    const landed = k.mode === "set" || (k.mode === "down" && time - k.diveStart > k.diveDur + 0.5);
    if (k.mode !== "hold" && landed && t > 0.9) {
      if (d.won) {
        ka.pose = "dejected";
        ka.celebration = this.celebrations.get(KEEPER_ID);
        ka.poseT = clamp((t - 0.9) / 1.2, 0, 1);
      } else if (d.result === "saved") {
        ka.pose = "celebrate";
        ka.celebration = "fistPump";
        ka.poseT = clamp((t - 0.9) / 1.2, 0, 1);
      }
      ka.dive = undefined;
    }
    if (ball.owner === KEEPER_ID) {
      ball.pos = k.handsPoint(time);
    }
  }

  /** Afasta pares mais perto que `gap` (metade para cada um). */
  private separate(actors: Actor[], gap: number) {
    for (let i = 0; i < actors.length; i += 1) {
      for (let j = i + 1; j < actors.length; j += 1) {
        const a = actors[i].pos;
        const b = actors[j].pos;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = hypot(dx, dz);
        if (d >= gap) continue;
        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        const push = (gap - d) * 0.5;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }

  /** Para onde o artilheiro corre: rumo à bandeirinha/torcida do lado dele, sem ir longe. */
  private celebrationSpot(scorer: Actor): Vec2 {
    const side = scorer.pos.x >= 0 ? 1 : -1;
    const corner = { x: side * 24, z: GOAL_Z - 4 };
    const dir = norm2({ x: corner.x - scorer.pos.x, z: corner.z - scorer.pos.z });
    const d = Math.min(9, dist2(scorer.pos, corner));
    return { x: scorer.pos.x + dir.x * d, z: Math.min(GOAL_Z - 1.5, scorer.pos.z + dir.z * d) };
  }

  private updateOutcomeClock(real: number) {
    const s = this.state;
    const d = this.decided;
    if (!d) return;
    this.outcomeReal += real;
    if (d.won) {
      if (this.outcomeReal >= GOAL_REACTION) this.startReplay();
      return;
    }
    if (this.outcomeReal >= FAIL_REACTION) {
      if (s.attemptsLeft <= 0) this.finish();
      else this.awaitingNext = true;
    }
  }

  /** Esperando o jogador pedir a próxima bola (a interface chama nextAttempt). */
  get waitingForNext() {
    return this.awaitingNext;
  }

  private finish() {
    const s = this.state;
    s.phase = "done";
    s.timeScale = 1;
    s.replay = null;
  }

  // ------------------------------------------------------------ replay

  private startReplay() {
    if (!this.decided?.won || !this.lastKick) {
      this.finish();
      return;
    }
    const segments = this.replaySegments();
    if (!segments.length || this.recorder.length < 4) {
      this.finish();
      return;
    }
    this.replaySegs = segments;
    this.playReplay(segments);
  }

  /** Toca o replay do começo. O estado ao vivo vai para a foto (cópia: o replay escreve nos vetores do gravador) e volta no fim. */
  private playReplay(segments: ReplaySegment[]) {
    const s = this.state;
    this.liveSnapshot = {
      actors: s.actors.map((a) => ({ ...a, pos: { ...a.pos }, vel: { ...a.vel }, dive: a.dive ? { ...a.dive } : undefined, look: a.look ? { ...a.look } : null })),
      ball: { ...s.ball, pos: { ...s.ball.pos }, vel: { ...s.ball.vel }, spin: { ...s.ball.spin } },
    };
    this.replayPlayer = new ReplayPlayer(segments);
    s.phase = "replay";
    s.replay = { progress: 0, angle: segments[0].angle };
    s.timeScale = segments[0].rate;
    this.recorder.apply(segments[0].from, s.actors, s.ball);
  }

  /**
   * Trechos: 0 = câmera de TV acompanhando o lance (desde o começo, ou os
   * últimos passes); 1 = atrás do gol, de frente para o chute; 2 = colada na
   * bola, bem lenta (só nos lances especiais: curva, ângulo, cabeça, voleio,
   * de longe).
   */
  private replaySegments(): ReplaySegment[] {
    const lk = this.lastKick;
    const g = this.decided?.goal;
    if (!lk || !g) return [];
    const start = this.recorder.start;
    const end = Math.min(this.recorder.end, this.goalTime + 1.15);
    const shotT = lk.time;
    const goalT = this.goalTime;
    const segs: ReplaySegment[] = [];
    // ~6–9 s no total: a jogada (com o último passe), o chute de frente e, nos
    // golaços, a chegada da bola bem lenta.
    const aFrom = Math.max(start, shotT - (this.state.passes > 0 ? 2.4 : 0.55));
    segs.push({ from: aFrom, to: Math.min(end, goalT + 0.6), rate: 0.72, angle: 0, slow: { at: goalT - 0.08, rate: 0.32, span: 0.3 } });
    segs.push({ from: Math.max(start, shotT - 0.22), to: Math.min(end, goalT + 0.45), rate: 0.5, angle: 1 });
    const special = g.topCorner || g.curve >= 2.2 || g.header || g.volley || g.distance >= 24;
    if (special) segs.push({ from: Math.max(start, shotT, goalT - 0.6), to: Math.min(end, goalT + 0.25), rate: 0.36, angle: 2 });
    return segs.filter((x) => x.to - x.from > 0.2);
  }

  private updateReplay(real: number) {
    const s = this.state;
    const player = this.replayPlayer;
    if (!player) {
      this.endReplay();
      return;
    }
    const before = player.time;
    const cut = player.advance(real);
    if (player.done) {
      this.endReplay();
      return;
    }
    const now = player.time;
    this.recorder.apply(now, s.actors, s.ball);
    // Sons e rede tocam de novo no replay (eventos de placar, não).
    if (!cut && now > before) this.recorder.eventsBetween(before, now, this.out);
    // Quadro a quadro sem objeto novo: o avanço e o ângulo são reescritos no mesmo.
    const angle = player.angle;
    if (s.replay) {
      s.replay.progress = player.progress;
      s.replay.angle = angle;
    } else s.replay = { progress: player.progress, angle };
    // Velocidade do primeiro trecho com esse ângulo (como sempre foi).
    const segments = player.segments;
    let index = 0;
    while (index < segments.length && segments[index].angle !== angle) index += 1;
    const seg = segments[index < segments.length ? index : 0];
    s.timeScale = seg ? seg.rate : 0.5;
  }

  private endReplay() {
    const s = this.state;
    if (this.liveSnapshot) {
      s.actors.forEach((a, i) => Object.assign(a, this.liveSnapshot?.actors[i]));
      s.ball = this.liveSnapshot.ball;
    }
    this.replayPlayer = null;
    this.finish();
  }
}

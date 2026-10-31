// Driver da partida online (Bobonline): todo o tempo online mora aqui, para o
// 2D, o 3D e os testes em Node rodarem o mesmo código. A BotaoMatch só passa
// quadros e toques e desenha; ela importa este arquivo apenas com `import type`
// e recebe a fábrica pela prop `createDriver` (import() feito pela rota Bobonline).
//
// Regras do fio (§5 do design):
// - Um único log de ações; todo aparelho aplica a mesma sequência pelo mesmo
//   caminho (`apply`), inclusive quem escreveu a ação.
// - Só o dono do turno gasta relógio, conta os 7 s e o limite do pênalti.
// - Descanso n: o primeiro ponto de descanso depois de aplicar as ações < n.
//   O estado ali é função só do log; tudo o que acontece depois (relógio do
//   dono, goleiro andando, transições locais) vem depois do relato.
// - Pausas (gol, pênalti, intervalo, apito) contam tempo de jogo e são iguais
//   no 2D e no 3D. O 3D só influencia o drama do pênalti da CPU.
//
// Os textos, a mira remota e as pistas que só a partida online mostra também
// moram aqui (e a UI online no OnlineMatchUi.tsx): nada disso pesa no pacote
// das rotas offline, que só baixam a BotaoMatch.

import {
  FIELD,
  advanceClock,
  aimFromDrag,
  applyRemoteClock,
  attackGoalY,
  awardInactivityPenalty,
  ballOf,
  beginPenaltyShot,
  beginShot,
  canShoot,
  cancelFinalShotGrace,
  commitPenalty,
  confirmPenaltyOrders,
  discsOf,
  otherSide,
  penaltyKeeper,
  penaltyShooter,
  placePenaltyKeeper,
  resumeAfterGoal,
  shotSpeedForBody,
  startNextPeriod,
  stepMatch,
  stepPenalty,
  stepPenaltyKeeper,
  type BotaoAim,
  type BotaoBody,
  type BotaoEvent,
  type BotaoMatchState,
} from "./engine";
import { playSignatureSound } from "./signature-audio";
import { goalCelebrationExtensionMs, goalSignatureOf } from "./celebration-timing";
import { chooseCpuPenaltyShot, chooseCpuShot } from "./cpu";
import { formationById } from "./formations";
import { hashMatch, isRestPoint, matchKey, overwriteMatch, restoreMatch, type SerializedMatch } from "./match-codec";
import type {
  BotaoCpuBrain,
  BotaoMatchLink,
  BotaoMatchRestore,
  BotaoSideControl,
  DuelAction,
  DuelDirective,
  DuelPresentation,
  RemoteAim,
} from "./match-link";
import { ONLINE_TIMING, finishDelayMs, goalPauseMs } from "./online-timing";
import type { BotaoAimView, BotaoRenderView } from "./render";
import { createRng, hashSeed, type Rng } from "./rng";
import type { BotaoMatchResult, BotaoMatchSetup, BotaoShot, BotaoSide } from "./types";

export type OnlineDriverOptions = {
  state: BotaoMatchState; n: number;
  controls: Record<BotaoSide, BotaoSideControl>;
  perspective: BotaoSide | "neutral";     // tons de flash, vibração e textos ("neutral" = espectador)
  names: Record<BotaoSide, string>;
  link: BotaoMatchLink;
  restoreTimers?: BotaoMatchRestore["timers"];
  cpu?: { rng: Rng; skill: number } | null;
  view3d: () => boolean;                  // só para o drama do pênalti da CPU
  cameraSettled?: () => boolean;          // idem
  random?: () => number;                  // Math.random por padrão (jitter do drama)
  onEvents: (events: BotaoEvent[]) => void;            // → handleEvents (sons, flashes, 3D)
  onFlash: (text: string, tone: "goal" | "bad" | "info", ms: number) => void;
  onAnnounce: (text: string) => void;                  // → região aria-live
  onTurnStart: (side: BotaoSide) => void;              // → vibrate(25) + "tick"
  /** Vibração dos momentos que só o driver vê (desfecho do pênalti, último lance). Opcional. */
  onVibrate?: (pattern: number | number[]) => void;
};
/** O que a BotaoMatch tem para montar o driver: as props online dela e duas refs. */
export type OnlineDriverMount = {
  state: BotaoMatchState;
  link: BotaoMatchLink;
  restore?: BotaoMatchRestore;
  controls?: Record<BotaoSide, BotaoSideControl>;
  perspective: BotaoSide | "neutral";
  /** Ausente = os nomes curtos dos times. */
  names?: Record<BotaoSide, string>;
  cpuBrain?: BotaoCpuBrain;
  /** X1 no mesmo aparelho (só decide os controles quando `controls` falta). */
  localMatch: boolean;
  /** A visão 3D na tela (null no 2D): drama do pênalti da CPU. */
  view: { current: { cameraSettled(): boolean } | null };
  /** Callbacks da BotaoMatch, trocados a cada render (o driver nunca chama um velho). */
  hooks: { current: { events: OnlineDriverOptions["onEvents"]; flash: OnlineDriverOptions["onFlash"]; announce: OnlineDriverOptions["onAnnounce"] } | null };
  vibrate: (pattern: number | number[]) => void;
};
/** A UI só do online da BotaoMatch (OnlineMatchUi.tsx): chega pelo driver, num pedaço próprio. */
export type OnlineMatchUiModule = typeof import("./OnlineMatchUi");
export type OnlineDriverFactory = ((opts: OnlineDriverOptions) => OnlineMatchDriver) & {
  /** Recomeço de um estado salvo (prop `restore`): o codec vem neste mesmo import(), fora do pacote das rotas offline. */
  restore: (setup: BotaoMatchSetup, match: SerializedMatch) => BotaoMatchState;
  /** O driver de uma BotaoMatch montada (as opções saem daqui, não do pacote das rotas offline). */
  mount: (match: OnlineDriverMount) => OnlineMatchDriver;
};

export function createOnlineDriver(opts: OnlineDriverOptions): OnlineMatchDriver {
  return new OnlineMatchDriver(opts);
}
createOnlineDriver.restore = restoreMatch;
createOnlineDriver.mount = (match: OnlineDriverMount): OnlineMatchDriver => {
  const { state, restore, cpuBrain, view, hooks } = match;
  // CPU com rng própria (nunca a da partida), retomada do cursor salvo.
  const brain = cpuBrain ? createRng(cpuBrain.seed) : null;
  if (brain && cpuBrain?.cursor) for (let index = 0; index < cpuBrain.cursor; index += 1) brain.next();
  return createOnlineDriver({
    state,
    n: restore?.n ?? 0,
    controls: match.controls ?? { user: "local", cpu: match.localMatch ? "local" : "cpu" },
    perspective: match.perspective,
    names: match.names ?? { user: state.setup.userTeam.shortName, cpu: state.setup.cpuTeam.shortName },
    link: match.link,
    restoreTimers: restore?.timers ?? null,
    cpu: brain && cpuBrain ? { rng: brain, skill: cpuBrain.skill } : null,
    view3d: () => view.current !== null,
    cameraSettled: () => view.current?.cameraSettled() ?? true,
    onEvents: (events) => hooks.current?.events(events),
    onFlash: (text, tone, ms) => hooks.current?.flash(text, tone, ms),
    onAnnounce: (text) => hooks.current?.announce(text),
    onTurnStart: () => {
      // Sua vez: toque curto e um clique baixinho (o som respeita o mudo).
      match.vibrate(25);
      playSignatureSound("tick", 0.4);
    },
    onVibrate: match.vibrate,
  });
};

// A UI só do online da BotaoMatch (folha da ordem, faixa da rede, Desistir…) vem num
// pedaço próprio: baixa junto com o driver (a rota o adianta no lobby), para já estar
// aqui quando a partida montar. Só com página de verdade (nem Node, nem Worker). Se a
// rede falhar, o quadro do driver tenta de novo a cada 3 s; a BotaoMatch redesenha
// quando ela chega (a chave do HUD muda).
const UI_RETRY_MS = 3000;
let onlineUi: OnlineMatchUiModule | null = null;
let onlineUiLoading = false;
let onlineUiRetryAt = 0;
function loadOnlineUi() {
  if (onlineUi || onlineUiLoading || typeof document === "undefined" || performance.now() < onlineUiRetryAt) return;
  onlineUiLoading = true;
  import("./OnlineMatchUi").then(
    (ui) => {
      onlineUi = ui;
      onlineUiLoading = false;
    },
    () => {
      onlineUiLoading = false;
      onlineUiRetryAt = performance.now() + UI_RETRY_MS;
    },
  );
}
loadOnlineUi();

// Mesmos valores da BotaoMatch e do motor.
const PHYSICS_DT = 1 / 120;
const USER_DECISION_SECONDS = 7;
const USER_WARNING_SECONDS = 3;
const CPU_THINK_MS = 430;
/** No 3D, depois do gol, o time ainda trota para a formação nova (relógio parado). */
const CPU_KICKOFF_WAIT_3D_MS = 450;
/** Drama do pênalti da CPU no 3D (§9): 1,3 s + até 1 s de Math.random, nunca a rng da partida. */
const CPU_PENALTY_DRAMA_MS = 1300;
const CPU_PENALTY_DRAMA_JITTER_MS = 1000;
/** Câmera ainda girando quando o tempo acaba: espera até mais isto. */
const CAMERA_SETTLE_MAX_MS = 700;
// Espelham app/bobonline/protocol.ts (T.*): app/botao não importa o Bobonline.
const RESUME_TIMER_FLOOR_S = 3;
const PENALTY_ORDER_PICK_S = 10;
const PROGRESS_EVERY_MS = 250;
/** Prévia da mira para o outro aparelho, no máximo a cada 100 ms. */
const AIM_PREVIEW_MS = 100;
/** A pista da comemoração longa no 2D começa quando o 3D dispararia o raio. */
const SIGNATURE_CUE_DELAY_MS = 900;
/**
 * Depois do desfecho a bola segue rolando na pausa (rede estufando, rebote), como
 * hoje. São sempre estes passos, nem um a mais: o estado no descanso seguinte
 * (direção do goleiro, bola na rede) fica igual em todo aparelho.
 */
const PENALTY_ROLL_STEPS = Math.round(ONLINE_TIMING.PENALTY_PAUSE_MS / 1000 / PHYSICS_DT);
/** Força do toque de emergência da CPU (quando a IA não acha toque legal). */
const FALLBACK_SHOT_RATIO = 0.6;

type PresentationKind = DuelPresentation["kind"];
type Presentation = { kind: PresentationKind; remainingMs: number };
type Transition = "resume" | "next-period";
type CpuTimer = { totalMs: number; elapsedMs: number; dramaMs: number; shooterId: string | null; settleMs: number };
type Tone = "goal" | "bad" | "info";

const isAim = (state: BotaoMatchState) => state.phase === "aim" || state.phase === "kickoff";

/** Pista da comemoração de assinatura no 2D: raio azul ou anel dourado, `progress` de 0 a 1. */
export type SignatureCue = { scorerId: string; color: string; progress: number; kind?: "kamehameha" | "superSaiyan" };
export const SIGNATURE_CUE_COLORS = { kamehameha: "#8fd8ff", superSaiyan: "#ffd84a" } as const;

/**
 * Comemoração de assinatura no 2D (só online, durante a extensão da pausa): o
 * Kamehameha vira um raio de 0,75 s do autor para o gol atacado; o Super
 * Saiyajin, um anel pulsando em volta dele. Os dois tingem a mesa da mesma cor.
 * Vai como `underlay` do desenho 2D (render.ts), logo depois do clarão do gol.
 */
export function drawSignatureCue(ctx: CanvasRenderingContext2D, state: BotaoMatchState, cue: SignatureCue) {
  const body = state.bodies.find((candidate) => candidate.id === cue.scorerId);
  if (!body?.side) return;
  const t = Math.max(0, Math.min(1, cue.progress));
  const kind = cue.kind ?? (cue.color === SIGNATURE_CUE_COLORS.superSaiyan ? "superSaiyan" : "kamehameha");
  ctx.save();
  ctx.globalAlpha = 0.22 * Math.sin(Math.PI * t);
  ctx.fillStyle = cue.color;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.globalAlpha = 1;
  if (kind === "kamehameha") {
    // O raio ocupa os primeiros 75% da pista (0,75 s da extensão de 1 s).
    const beam = Math.min(1, t / 0.75);
    if (beam < 1) {
      const goalX = FIELD.width / 2;
      const goalY = attackGoalY(body.side);
      const grow = Math.min(1, beam / 0.16);
      const fade = beam > 0.7 ? 1 - (beam - 0.7) / 0.3 : 1;
      const endX = body.x + (goalX - body.x) * grow;
      const endY = body.y + (goalY - body.y) * grow;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = cue.color;
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(body.x, body.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.globalAlpha = 0.95 * fade;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  } else {
    const pulse = (Math.sin(t * Math.PI * 8) + 1) / 2;
    ctx.globalAlpha = 0.9 * (1 - t * 0.6);
    ctx.strokeStyle = cue.color;
    ctx.lineWidth = 3 + pulse * 2;
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.radius + 6 + pulse * 7 + t * 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** O que precisa bater para uma adoção ser silenciosa (§5.3). */
function restSummary(state: BotaoMatchState): string {
  const pen = state.penalties;
  return `${matchKey(state)}|${state.score.user}-${state.score.cpu}|${pen ? `${pen.round}.${pen.score.user}-${pen.score.cpu}.${pen.shotInFlight ? 1 : 0}` : "-"}`;
}

export class OnlineMatchDriver {
  // Públicos só para leitura: a UI online (OnlineMatchUi) lê tudo daqui.
  readonly state: BotaoMatchState;
  readonly controls: Record<BotaoSide, BotaoSideControl>;
  readonly perspective: BotaoSide | "neutral";
  readonly names: Record<BotaoSide, string>;
  readonly link: BotaoMatchLink;
  private readonly opts: OnlineDriverOptions;
  private readonly cpu: { rng: Rng; skill: number } | null;
  private readonly random: () => number;
  private restoreTimers: BotaoMatchRestore["timers"] | null;

  /** Próxima ação a aplicar ou escrever. */
  private nextN: number;
  /** Último descanso relatado (-1: nenhum ainda). */
  private restN = -1;
  private restHash = "";
  private restKey: string | null = null;
  /** Goleiro do descanso em que a vez abriu: o `pmiss` o devolve para lá (igual em todo aparelho). */
  private restKeeper: { x: number; dir: 1 | -1 } | null = null;
  /** Transições locais (determinísticas) desde o descanso; a adoção silenciosa as repete. */
  private transitions: Transition[] = [];

  private acc = 0;
  private keeperAcc = 0;
  private pres: Presentation | null = null;
  /** Desfecho da cobrança esperando o fim da pausa (`missed`: limite de 10 s). */
  private penaltyPending: { scored: boolean; missed: boolean } | null = null;
  private penaltyRollSteps = 0;
  private finishDone = false;
  private lastPhase: BotaoMatchState["phase"] | null = null;
  private lastPenaltyShooterId: string | null = null;

  // Turno aberto neste aparelho.
  private openedN: number | null = null;
  private openedSide: BotaoSide | null = null;
  private openedKey = "";
  private clockAtOpen = 0;
  private openElapsed = 0;
  private idleLeft: number | null = null;
  private kickLeft: number | null = null;
  private cpuTimer: CpuTimer | null = null;
  private graceAnnouncedN: number | null = null;

  // Ordem dos batedores (penalty-setup).
  private orderLeft: number | null = null;
  private readonly ordersSent = new Set<BotaoSide>();

  private frozen = false;
  private wasFrozen = false;
  /** Pediu sincronia porque o estado não aceita a ação n: entrada congelada até a diretiva. */
  private stuckN: number | null = null;
  private lastAim: RemoteAim | null = null;
  private progressMs = PROGRESS_EVERY_MS;
  private progressKey = "";
  private bannerKey = "";
  private announcedTurnN: number | null = null;
  /** Última prévia da mira mandada (performance.now()). */
  private aimSentAt = 0;
  /** Pista 2D da comemoração longa do gol que está na tela (raio/anel), contada do gol. */
  private cue: { scorerId: string; kind: "kamehameha" | "superSaiyan"; startedAt: number; durationMs: number } | null = null;

  constructor(opts: OnlineDriverOptions) {
    this.opts = opts;
    this.state = opts.state;
    this.controls = { ...opts.controls };
    this.perspective = opts.perspective;
    this.names = opts.names;
    this.link = opts.link;
    this.nextN = Math.max(0, Math.floor(opts.n));
    this.restoreTimers = opts.restoreTimers ?? null;
    this.random = opts.random ?? Math.random;
    const needsBrain = this.controls.user === "cpu" || this.controls.cpu === "cpu";
    this.cpu = opts.cpu ?? (needsBrain ? { rng: createRng(hashSeed(opts.state.setup.seed, "cpu-brain")), skill: 3 } : null);
    // Recomeço no meio de uma pausa (checkpoint num gol, intervalo ou apito): a pausa recomeça inteira.
    this.enterPhase(null);
  }

  get n(): number { return this.nextN; }
  get cpuCursor(): number | null { return this.cpu ? this.cpu.rng.cursor() : null; }

  // ------------------------------------------------------------------ quadro

  /** Um quadro: diretivas, fila remota, relógio do dono, 7 s, limite do pênalti, CPU, física em passo fixo, pausas, turnOpened, descanso, progresso. */
  frame(elapsedS: number, input: { holding: boolean }): void {
    const elapsed = Number.isFinite(elapsedS) ? Math.max(0, Math.min(0.25, elapsedS)) : 0;
    loadOnlineUi();
    const status = this.link.status();
    this.frozen = status.frozen;

    for (let directive = this.link.takeDirective(); directive; directive = this.link.takeDirective()) {
      this.hydrate(directive);
    }
    // Fim de uma contagem de volta: quem é dono nunca volta com menos de 3 s.
    if (this.wasFrozen && !this.frozen) this.applyResumeFloor();
    this.wasFrozen = this.frozen;

    const ahead = this.link.aheadOf(this.nextN) > 0;
    const speed = ahead ? ONLINE_TIMING.CATCHUP_SPEED : 1;

    this.checkRest();
    this.drainQueue();
    this.advancePresentation(elapsed * speed * 1000, ahead);
    this.stepPhysics(elapsed * speed, ahead);
    this.checkRest();
    // A jogada acabou neste quadro e a próxima ação já está na fila: aplica já.
    this.drainQueue();
    this.openTurn();
    if (!this.frozen && this.stuckN === null) this.ownerWork(elapsed, input.holding);
    this.checkRest();
    this.stepKeeper(elapsed);
    this.tickOrderPick(elapsed);
    this.watchFinalShot();
    this.watchBanner(status.banner);
    this.reportProgress(elapsed);
  }

  /** Toque local (valida dono, congelamento, fase). */
  shoot(bodyId: string, aim: BotaoAim): boolean {
    const side = this.localTurn();
    if (!side || !aim.valid || !Number.isFinite(aim.vx) || !Number.isFinite(aim.vy)) return false;
    const state = this.state;
    const shot: BotaoShot = { bodyId, vx: aim.vx, vy: aim.vy };
    if (state.phase === "penalties" && state.penalties) {
      if (penaltyShooter(state).id !== bodyId) return false;
      const keeper = penaltyKeeper(state);
      return this.write({ kind: "pshot", side, shot, keeperX: keeper.x, keeperDir: state.penalties.keeperDirection < 0 ? -1 : 1 });
    }
    if (!isAim(state) || !canShoot(state, bodyId)) return false;
    const fired = this.write({ kind: "shot", side, shot, clock: state.clock, grace: state.finalShotGrace });
    // Na graça um toque que não sai encerra o tempo (como hoje), pela mesma ação de todo aparelho.
    if (!fired && state.finalShotGrace) this.write({ kind: "expire", side });
    return fired;
  }

  /** Soltou curto: escreve "expire" se estava na graça. */
  releaseInvalid(): void {
    const side = this.localTurn();
    if (side && this.state.finalShotGrace && isAim(this.state)) this.write({ kind: "expire", side });
  }

  chooseOrder(side: BotaoSide, order: string[]): void {
    if (this.controls[side] !== "local" || this.state.phase !== "penalty-setup" || this.ordersSent.has(side)) return;
    this.ordersSent.add(side);
    this.link.proposePenaltyOrder(side, order.slice());
  }

  /** §5.3: silencioso (mantém timers) ou re-deriva a apresentação. */
  hydrate(directive: DuelDirective): void {
    const state = this.state;
    // Diretiva de hash velha: este aparelho já aplicou a ação n; o próximo descanso corrige.
    if (directive.reason === "hash" && directive.n !== this.nextN) return;
    const sameRest = directive.n === this.restN && directive.n === this.nextN && this.restKey !== null;
    const localKey = this.restKey;
    const previousPhase = state.phase;
    // O que o dono já fez depois do descanso (relógio gasto, goleiro andando) sobrevive à adoção.
    const ownerOpen = this.openedN === this.nextN && this.openedSide !== null && this.controls[this.openedSide] !== "remote";
    const drained = ownerOpen && isAim(state) ? Math.max(0, this.clockAtOpen - state.clock) : 0;
    const liveKeeper = state.penalties && !state.penalties.shotInFlight && state.phase === "penalties"
      ? { x: penaltyKeeper(state).x, dir: (state.penalties.keeperDirection < 0 ? -1 : 1) as 1 | -1 }
      : null;

    overwriteMatch(state, directive.match);
    this.nextN = directive.n;
    this.stuckN = null;
    this.acc = 0;
    this.keeperAcc = 0;
    this.lastAim = null;
    const silent = sameRest && restSummary(state) === localKey;
    this.markRest(directive.n);

    if (silent) {
      // Mesmo momento do jogo: só os números finos mudam. Pausas e timers continuam; as transições locais se repetem.
      for (const transition of this.transitions) {
        if (transition === "resume") resumeAfterGoal(state);
        else startNextPeriod(state);
      }
      if (drained > 0 && isAim(state) && !(state.phase === "kickoff" && state.clockPausedForKickoff)) {
        state.clock = Math.max(0, state.clock - drained);
      }
      if (liveKeeper && state.phase === "penalties" && state.penalties && !state.penalties.shotInFlight) {
        placePenaltyKeeper(state, liveKeeper.x, liveKeeper.dir);
      }
      this.lastPhase = state.phase;
      return;
    }

    // Outro momento do jogo: a apresentação recomeça a partir da fase adotada.
    this.transitions = [];
    this.pres = null;
    this.penaltyPending = null;
    this.finishDone = false;
    // Mesmo turno, mesma chave: os timers do dono (e a CPU pensando) continuam.
    if (this.openedN !== this.nextN || this.openedKey !== matchKey(state)) this.closeTurn();
    if (state.phase === "goal" && previousPhase !== "goal" && state.lastGoal) {
      // O gol que este aparelho não viu: som, flash e festa do 3D a partir do estado adotado.
      this.opts.onEvents([{
        type: "goal",
        side: state.lastGoal.side,
        scorer: state.lastGoal.scorer,
        assist: null,
        byUser: state.lastGoal.byUser,
        ownGoal: state.lastGoal.ownGoal,
      }]);
    }
    this.lastPhase = previousPhase;
    this.enterPhase(null, true);
    // A pausa nova vem do pres da autoridade (o que faltava lá), cortada se este aparelho está atrasado.
    const pres = this.pres as Presentation | null;
    if (pres && directive.pres && directive.pres.kind === pres.kind && Number.isFinite(directive.pres.remainingMs)) {
      pres.remainingMs = Math.max(0, Math.min(pres.remainingMs, directive.pres.remainingMs));
    }
    if (pres && this.link.aheadOf(this.nextN) > 0) {
      pres.remainingMs = Math.min(pres.remainingMs, ONLINE_TIMING.CATCHUP_PAUSE_CAP_MS);
    }
  }

  // ------------------------------------------------------------- leituras

  displayClock(): number {
    const state = this.state;
    if (this.openedN === this.nextN && this.openedSide && this.controls[this.openedSide] === "remote" && isAim(state)) {
      return Math.max(0, Math.min(state.clock, this.clockAtOpen - this.openElapsed));
    }
    return state.clock;
  }

  idleCountdown(): number | null {
    if (this.frozen || this.localTurn() === null || this.idleLeft === null || !isAim(this.state)) return null;
    return this.idleLeft <= USER_WARNING_SECONDS ? Math.max(1, Math.ceil(this.idleLeft)) : null;
  }

  kickCountdown(): number | null {
    if (this.frozen || this.localTurn() === null || this.kickLeft === null || this.state.phase !== "penalties") return null;
    return this.kickLeft <= ONLINE_TIMING.KICK_WARNING_S ? Math.max(1, Math.ceil(this.kickLeft)) : null;
  }

  /** Segundos que faltam para a escolha da ordem dos batedores valer sozinha (null fora dela ou já enviada). */
  orderCountdown(): number | null {
    if (this.state.phase !== "penalty-setup" || this.orderLeft === null) return null;
    return Math.max(0, Math.ceil(this.orderLeft));
  }

  /** A ordem deste lado já foi enviada (o picker vira "Esperando {apelido}…"). */
  orderConfirmed(side: BotaoSide): boolean {
    return this.ordersSent.has(side);
  }

  /** Para o 3D soltar a câmera. */
  goalEndsIn(): number | null {
    return this.pres?.kind === "goal" ? this.pres.remainingMs / 1000 : null;
  }

  presentation(): { kind: "goal" | "penalty" | "finish" | "interval" | "setup" | "countdown" | null; remainingMs: number } {
    const banner = this.link.status().banner;
    if (banner?.kind === "countdown") return { kind: "countdown", remainingMs: Math.max(0, banner.secondsLeft * 1000) };
    if (this.pres) return { kind: this.pres.kind, remainingMs: this.pres.remainingMs };
    if (this.state.phase === "penalty-setup") return { kind: "setup", remainingMs: Math.max(0, (this.orderLeft ?? 0) * 1000) };
    return { kind: null, remainingMs: 0 };
  }

  /** Lado local que pode agir agora (null em pausas e quando congelado). */
  localTurn(): BotaoSide | null {
    const side = this.openSide();
    return side && !this.frozen && this.stuckN === null && this.controls[side] === "local" ? side : null;
  }

  /** Lado remoto que está com a vez acionável (para a mira remota). */
  remoteTurn(): BotaoSide | null {
    const side = this.openSide();
    return side && this.controls[side] === "remote" ? side : null;
  }

  /** Drama da CPU. */
  windup(): { shooterId: string; progress: number; remainingS: number } | null {
    const timer = this.cpuTimer;
    if (!timer || timer.dramaMs <= 0 || !timer.shooterId) return null;
    return {
      shooterId: timer.shooterId,
      progress: Math.min(1, timer.elapsedMs / Math.max(1, timer.totalMs)),
      remainingS: Math.max(0, (timer.totalMs - timer.elapsedMs) / 1000),
    };
  }

  /** §5.3. */
  restReady(): boolean {
    return isRestPoint(this.state) && this.penaltyPending === null;
  }

  /**
   * Pela perspectiva; "info" para espectador. `side` é quem atacou (ou bateu):
   * "goal" = entrou, "save" = não entrou.
   */
  flashTone(scoredBy: BotaoSide, kind: "goal" | "save"): Tone {
    if (this.perspective === "neutral") return "info";
    return (kind === "goal") === (scoredBy === this.perspective) ? "goal" : "bad";
  }

  finishLabel(result: BotaoMatchResult): { text: string; tone: Tone; won: boolean | null } {
    if (this.perspective === "neutral") return { text: "FIM DE JOGO", tone: "info", won: null };
    const winner: BotaoSide | null = result.outcome === "win" ? "user" : result.outcome === "loss" ? "cpu" : null;
    const won = winner === this.perspective;
    if (!won) return { text: "FIM DE JOGO", tone: "bad", won: false };
    const stage = this.state.setup.stageName;
    const text = stage === "X1" ? "VITÓRIA!" : stage === "Final" ? "CAMPEÃO!" : "CLASSIFICADO!";
    return { text, tone: "goal", won: true };
  }

  finished(): BotaoMatchResult | null {
    return this.state.phase === "finished" && this.finishDone ? this.state.result : null;
  }

  // ------------------------------------------------------- apresentação
  // O que a BotaoMatch mostra só online (textos, mira remota, pistas): mora aqui
  // para não pesar no pacote das rotas offline.

  /** A UI online (null até o pedaço dela chegar). */
  get ui(): OnlineMatchUiModule | null {
    return onlineUi;
  }

  /** Fim de jogo: texto, tom e vibração de quem está nesta tela (o onFinish sai depois da pausa fixa). */
  announceFinish(result: BotaoMatchResult): void {
    const label = this.finishLabel(result);
    this.opts.onFlash(label.text, label.tone, 2400);
    if (label.won !== null) this.opts.onVibrate?.(label.won ? [0, 90, 60, 90, 60, 160] : [0, 200]);
  }

  /** Pênalti por demora, pela perspectiva. */
  announceInactivity(): void {
    const call = this.inactivityCall();
    this.opts.onFlash("PÊNALTI POR DEMORA!", call.tone, 1700);
    this.opts.onAnnounce(call.text);
  }

  /** Saída de bola depois do gol (online o efeito do gol da BotaoMatch não roda): a formação de quem está na tela. */
  announceFormation(event: Extract<BotaoEvent, { type: "formation" }>): void {
    const text = this.formationText(event);
    if (text) this.opts.onFlash(text, "info", 1400);
  }

  /**
   * O que só a partida online põe no desenho (2D e 3D), por cima da vista que a
   * BotaoMatch montou: mira do adversário (prévia da rede, a 70% no 2D), mesa girada
   * do convidado, clarão do gol pela perspectiva (dourado para o meu gol), sem selo
   * "VC", drama do pênalti da CPU, batedor remoto concentrado e a pista 2D da
   * comemoração longa.
   */
  decorate(view: BotaoRenderView): void {
    const extras = this.renderExtras();
    if (extras.aim) {
      view.selectedId = extras.aim.bodyId;
      view.aim = extras.aim;
      view.remoteAim = true;
    }
    const flashSide = view.goalFlashSide;
    if (this.perspective !== "neutral" && flashSide) view.goalFlashSide = flashSide === this.perspective ? "user" : "cpu";
    view.hideUserMarker = true;
    view.mirrored = this.perspective === "cpu";
    const timer = this.cpuTimer;
    view.penaltyWindup = timer && timer.dramaMs > 0 && timer.shooterId
      ? { shooterId: timer.shooterId, totalMs: timer.totalMs, elapsedMs: timer.elapsedMs }
      : null;
    view.penaltyFocusId = extras.focusId;
    view.underlay = extras.underlay;
  }

  /** Gol: texto, tom e duração do flash pela perspectiva, e o nome da comemoração longa para a tarja do 3D. */
  goalCall(event: { side: BotaoSide; scorer: string; ownGoal: boolean }): { text: string; tone: Tone; ms: number; caption: string | null } {
    const state = this.state;
    // Comemoração longa do autor (Kamehameha, Super Saiyajin): estica a pausa igual nos dois aparelhos.
    const goal = { scorerId: state.touches.at(-1)?.bodyId ?? null, ownGoal: event.ownGoal };
    const signature = goalSignatureOf(state.setup, state, goal);
    const extension = goalCelebrationExtensionMs(state.setup, state, goal);
    const scorer = event.scorer.toLocaleUpperCase("pt-BR");
    if (signature && goal.scorerId) {
      this.cue = { scorerId: goal.scorerId, kind: signature, startedAt: performance.now(), durationMs: extension + 300 };
    }
    return {
      text: event.ownGoal
        ? "GOL CONTRA"
        : signature
          ? `${signature === "kamehameha" ? "KAMEHAMEHA!" : "SUPER SAIYAJIN!"} · ${scorer}`
          : this.perspective === "neutral"
            ? `GOL · ${scorer}`
            : event.side === this.perspective
              ? "SEU GOL!"
              : "TOMOU GOL",
      tone: this.flashTone(event.side, "goal"),
      ms: ONLINE_TIMING.GOAL_PAUSE_MS + extension - 200,
      caption: signature === "kamehameha" ? "Kamehameha" : signature === "superSaiyan" ? "Super Saiyajin" : null,
    };
  }

  /** Pênalti por demora: quem ganhou a cobrança é o outro lado de quem demorou. */
  inactivityCall(): { tone: Tone; text: string } {
    const state = this.state;
    const beneficiary = state.penalties?.turn ?? "cpu";
    const idleSide = otherSide(beneficiary);
    const team = beneficiary === "user" ? state.setup.userTeam.shortName : state.setup.cpuTeam.shortName;
    return {
      tone: this.flashTone(idleSide, "save"),
      text: idleSide === this.perspective ? `Você demorou. Pênalti para ${team}.` : `${this.names[idleSide]} demorou. Pênalti para ${team}.`,
    };
  }

  /** Saída de bola depois do gol: a formação de quem está na tela (null para o espectador). */
  formationText(event: Extract<BotaoEvent, { type: "formation" }>): string | null {
    if (this.perspective === "neutral") return null;
    const formation = formationById(this.perspective === "cpu" ? event.cpuFormation : event.userFormation);
    return `Formação ${formation.name} · ${formation.shape}`;
  }

  /**
   * Para o desenho: mira do adversário (prévia da rede), batedor remoto concentrado e
   * a pista 2D da comemoração longa (`cue`, e `underlay`, que a desenha por baixo dos botões).
   */
  renderExtras(): { aim: BotaoAimView | null; focusId: string | null; cue: SignatureCue | null; underlay: ((ctx: CanvasRenderingContext2D) => void) | null } {
    const state = this.state;
    // Mira do adversário quando a vez acionável é dele.
    const remote = this.remoteTurn();
    const remoteAim = remote ? this.link.remoteAim() : null;
    const disc = remoteAim ? state.bodies.find((body) => body.id === remoteAim.bodyId) ?? null : null;
    const aimable = Boolean(disc && (state.phase === "penalties"
      ? state.penalties && !state.penalties.shotInFlight && penaltyShooter(state).id === disc.id
      : canShoot(state, disc.id)));
    const aim: BotaoAimView | null = remoteAim && disc && aimable
      ? { ...aimFromDrag(disc, remoteAim.dragX, remoteAim.dragY), bodyId: disc.id, dragX: remoteAim.dragX, dragY: remoteAim.dragY }
      : null;
    // Pista 2D da comemoração longa: começa quando o 3D dispararia o raio.
    const cue = this.cue;
    if (cue && state.phase !== "goal") this.cue = null;
    const progress = cue && state.phase === "goal" ? (performance.now() - cue.startedAt - SIGNATURE_CUE_DELAY_MS) / cue.durationMs : -1;
    const signatureCue: SignatureCue | null = cue && progress >= 0 && progress <= 1
      ? { scorerId: cue.scorerId, color: SIGNATURE_CUE_COLORS[cue.kind], progress, kind: cue.kind }
      : null;
    return {
      aim,
      // Pênalti do outro aparelho: concentrado até a prévia da mira chegar.
      focusId: state.phase === "penalties" && state.penalties && remote && !aim ? penaltyShooter(state).id : null,
      cue: signatureCue,
      underlay: signatureCue ? (ctx) => drawSignatureCue(ctx, state, signatureCue) : null,
    };
  }

  /** Botão que este aparelho pode tocar no ponto: só do lado com a vez aberta aqui (nunca na pausa, nunca congelado). */
  shootableAt(x: number, y: number): BotaoBody | null {
    const side = this.localTurn();
    if (!side) return null;
    const state = this.state;
    if (state.phase === "penalties") {
      if (!state.penalties || state.penalties.shotInFlight || state.penalties.turn !== side) return null;
      const shooter = penaltyShooter(state);
      return Math.hypot(shooter.x - x, shooter.y - y) <= shooter.radius + 16 ? shooter : null;
    }
    let nearest: { id: string; distance: number } | null = null;
    for (const body of state.bodies) {
      if (body.kind !== "disc" || body.side !== side) continue;
      const distance = Math.hypot(body.x - x, body.y - y);
      if (distance <= body.radius + 12 && (!nearest || distance < nearest.distance)) nearest = { id: body.id, distance };
    }
    if (!nearest || !canShoot(state, nearest.id)) return null;
    return state.bodies.find((body) => body.id === nearest?.id) ?? null;
  }

  /** Prévia da mira para o outro aparelho, no máximo a cada 100 ms (no pênalti, junto com o goleiro que eu vejo). */
  previewAim(bodyId: string, dragX: number, dragY: number): void {
    const now = performance.now();
    if (now - this.aimSentAt < AIM_PREVIEW_MS) return;
    this.aimSentAt = now;
    const state = this.state;
    const penalties = state.phase === "penalties" ? state.penalties : null;
    const keeper = penalties ? penaltyKeeper(state) : null;
    this.link.sendAim(keeper && penalties
      ? { bodyId, dragX, dragY, keeperX: keeper.x, keeperDir: penalties.keeperDirection < 0 ? -1 : 1 }
      : { bodyId, dragX, dragY });
  }

  /** O dedo pode pegar um botão agora: vez aberta aqui e a rede não congelou neste instante. */
  canTouch(): boolean {
    return !this.link.status().frozen && this.localTurn() !== null;
  }

  /** Pegou (true) ou soltou/cancelou (false) um botão: o outro aparelho vê, e a prévia da mira some ao soltar. */
  hold(holding: boolean): void {
    if (!holding) this.link.sendAim(null);
    this.link.sendHold(holding);
  }

  /** Nada deste aparelho em jogo (sem vez local, sem pausa, sem fila adiante): dá para refazer o 3D agora. */
  idle(): boolean {
    return this.localTurn() === null && this.presentation().kind === null && this.link.aheadOf(this.nextN) <= 0;
  }

  /** O pedaço online da chave do HUD da BotaoMatch (o que muda fora do motor, e a chegada da UI online). */
  hudKey(): string {
    const pres = this.presentation();
    return `|${this.nextN}|${this.localTurn()}|${this.remoteTurn()}|${this.idleCountdown()}|${this.kickCountdown()}|${this.orderCountdown()}|${pres.kind}|${Math.ceil(pres.remainingMs / 1000)}|${onlineUi ? 1 : 0}`;
  }

  /** Rótulo da mesa para o leitor de tela: o time de quem está na tela primeiro. */
  tableLabel(): string {
    const { state, names } = this;
    const left: BotaoSide = this.perspective === "cpu" ? "cpu" : "user";
    const right = otherSide(left);
    const team = (side: BotaoSide) => (side === "user" ? state.setup.userTeam : state.setup.cpuTeam).shortName;
    const remote = this.remoteTurn();
    const turnName = remote ? names[remote] : names[state.penalties?.turn ?? state.turn];
    return `Mesa de futebol de botão. ${team(left)} ${state.score[left]}, ${team(right)} ${state.score[right]}. ${this.localTurn() ? "Sua vez de chutar." : `Vez de ${turnName}.`}`;
  }

  // ------------------------------------------------------------ internos

  /** Lado com a vez acionável neste aparelho (turno aberto e ainda não jogado). */
  private openSide(): BotaoSide | null {
    if (this.openedN !== this.nextN || !this.openedSide || this.pres) return null;
    const state = this.state;
    if (isAim(state)) return state.turn === this.openedSide ? this.openedSide : null;
    if (state.phase === "penalties" && state.penalties && !state.penalties.shotInFlight) {
      return state.penalties.turn === this.openedSide ? this.openedSide : null;
    }
    return null;
  }

  /** Lado cuja vez está pronta para ser jogada agora (pausas acabadas). */
  private actionableSide(): BotaoSide | null {
    if (this.pres || this.penaltyPending) return null;
    const state = this.state;
    if (isAim(state)) return state.turn;
    if (state.phase === "penalties" && state.penalties && !state.penalties.shotInFlight) return state.penalties.turn;
    return null;
  }

  private emit(events: BotaoEvent[]) {
    if (events.length > 0) this.opts.onEvents(events);
  }

  private markRest(n: number) {
    const state = this.state;
    this.restN = n;
    this.restHash = hashMatch(state);
    this.restKey = restSummary(state);
    const pen = state.penalties;
    this.restKeeper = pen && state.phase === "penalties" && !pen.shotInFlight
      ? { x: penaltyKeeper(state).x, dir: pen.keeperDirection < 0 ? -1 : 1 }
      : null;
  }

  private checkRest() {
    if (this.restN === this.nextN || !this.restReady()) return;
    this.markRest(this.nextN);
    this.transitions = [];
    this.link.reportRest(this.nextN, this.state, this.pres && this.pres.kind !== "penalty" ? { kind: this.pres.kind, remainingMs: this.pres.remainingMs } : null);
  }

  /** Monta a pausa da fase nova (gol, intervalo, apito, escolha dos batedores). */
  private enterPhase(scorerOverride: string | null, force = false) {
    const state = this.state;
    if (state.phase === this.lastPhase && !force) return;
    const previous = this.lastPhase;
    this.lastPhase = state.phase;
    if (state.phase === "goal") {
      this.pres = { kind: "goal", remainingMs: goalPauseMs({ online: true, view3d: false, extensionMs: this.goalExtension(scorerOverride) }) };
    } else if (state.phase === "interval") {
      this.pres = { kind: "interval", remainingMs: ONLINE_TIMING.INTERVAL_MS };
    } else if (state.phase === "finished") {
      const endedOnGoal = state.result?.decision === "goal-limit";
      this.finishDone = false;
      this.pres = {
        kind: "finish",
        remainingMs: finishDelayMs({ online: true, view3d: false, extensionMs: endedOnGoal ? this.goalExtension(scorerOverride) : 0 }),
      };
    } else if (state.phase === "penalty-setup") {
      // Re-derivando dentro da mesma escolha: quem já confirmou não escolhe de novo e o tempo segue.
      if (previous !== "penalty-setup") {
        this.ordersSent.clear();
        const local = this.controls.user === "local" || this.controls.cpu === "local";
        this.orderLeft = local ? PENALTY_ORDER_PICK_S : null;
      }
    }
    if (previous === "penalty-setup" && state.phase !== "penalty-setup") this.orderLeft = null;
  }

  private goalExtension(scorerOverride: string | null): number {
    const state = this.state;
    const goal = state.lastGoal;
    if (!goal) return 0;
    const scorerId = scorerOverride ?? state.touches.at(-1)?.bodyId ?? null;
    return goalCelebrationExtensionMs(state.setup, state, { scorerId, ownGoal: goal.ownGoal });
  }

  private advancePresentation(ms: number, ahead: boolean) {
    const pres = this.pres;
    if (!pres) return;
    if (ahead) pres.remainingMs = Math.min(pres.remainingMs, ONLINE_TIMING.CATCHUP_PAUSE_CAP_MS);
    pres.remainingMs -= ms;
    if (pres.remainingMs > 0) return;
    this.pres = null;
    const state = this.state;
    if (pres.kind === "goal") {
      if (state.phase !== "goal") return;
      this.emit(resumeAfterGoal(state));
      this.transitions.push("resume");
      this.enterPhase(null);
    } else if (pres.kind === "interval") {
      if (state.phase !== "interval") return;
      this.emit(startNextPeriod(state));
      this.transitions.push("next-period");
      this.enterPhase(null);
    } else if (pres.kind === "finish") {
      this.finishDone = true;
    } else if (pres.kind === "penalty") {
      const pending = this.penaltyPending;
      this.penaltyPending = null;
      if (!pending || !state.penalties) return;
      const inactivity = state.penaltyReason === "inactivity";
      // Cobrança perdida por tempo: o goleiro volta para onde estava no descanso (igual nos dois aparelhos).
      if (pending.missed && this.restKeeper) placePenaltyKeeper(state, this.restKeeper.x, this.restKeeper.dir);
      // Pausa cortada (alcançando o outro lado): os passos que faltam rodam agora.
      if (!pending.missed) this.rollPenalty(PENALTY_ROLL_STEPS);
      this.emit(commitPenalty(state, pending.scored));
      this.enterPhase(inactivity && pending.scored ? this.lastPenaltyShooterId : null);
    }
  }

  private stepPhysics(seconds: number, ahead: boolean) {
    const state = this.state;
    const cap = ahead ? ONLINE_TIMING.CATCHUP_MAX_STEPS : ONLINE_TIMING.MAX_STEPS;
    if (this.penaltyPending) {
      if (this.penaltyPending.missed) return;
      this.acc += seconds;
      const steps = Math.min(cap, Math.floor(this.acc / PHYSICS_DT));
      this.acc -= steps * PHYSICS_DT;
      this.rollPenalty(steps);
      return;
    }
    const inFlight = state.phase === "penalties" && state.penalties?.shotInFlight;
    if (state.phase !== "resolving" && !inFlight) {
      this.acc = 0;
      return;
    }
    this.acc += seconds;
    let steps = 0;
    if (state.phase === "resolving") {
      const events: BotaoEvent[] = [];
      while (this.acc >= PHYSICS_DT && steps < cap && state.phase === "resolving") {
        const stepped = stepMatch(state, PHYSICS_DT);
        for (const event of stepped) events.push(event);
        this.acc -= PHYSICS_DT;
        steps += 1;
      }
      // Lento demais para alcançar: o resto não vira dívida (como o laço antigo).
      if (steps >= cap) this.acc = Math.min(this.acc, PHYSICS_DT);
      if (state.phase !== "resolving") this.acc = 0;
      this.emit(events);
      this.enterPhase(null);
      return;
    }
    while (this.acc >= PHYSICS_DT && steps < cap) {
      const outcome = stepPenalty(state, PHYSICS_DT);
      this.acc -= PHYSICS_DT;
      steps += 1;
      if (outcome) {
        this.acc = 0;
        const shooting = state.penalties?.turn ?? "user";
        this.penaltyPending = { scored: outcome.scored, missed: false };
        this.penaltyRollSteps = 0;
        this.pres = { kind: "penalty", remainingMs: ONLINE_TIMING.PENALTY_PAUSE_MS };
        this.opts.onVibrate?.(outcome.scored ? [0, 50, 40, 90] : 30);
        this.opts.onFlash(outcome.scored ? "NA REDE!" : "PEGOU!", this.flashTone(shooting, outcome.scored ? "goal" : "save"), ONLINE_TIMING.PENALTY_PAUSE_MS);
        return;
      }
    }
    if (steps >= cap) this.acc = Math.min(this.acc, PHYSICS_DT);
  }

  /** Bola rolando depois do desfecho, até PENALTY_ROLL_STEPS no total (o desfecho já foi decidido). */
  private rollPenalty(steps: number) {
    const state = this.state;
    while (steps > 0 && this.penaltyRollSteps < PENALTY_ROLL_STEPS && state.penalties?.shotInFlight) {
      stepPenalty(state, PHYSICS_DT);
      this.penaltyRollSteps += 1;
      steps -= 1;
    }
  }

  /** O goleiro do pênalti anda antes do toque (desenho; o `pshot` e o `pmiss` fixam a posição). */
  private stepKeeper(seconds: number) {
    const state = this.state;
    const pen = state.penalties;
    if (state.phase !== "penalties" || !pen || pen.shotInFlight || this.pres || this.penaltyPending || this.restN !== this.nextN) {
      this.keeperAcc = 0;
      return;
    }
    // Quem espera vê o goleiro de quem vai bater (m:aim leva x e direção).
    const aim = this.remoteTurn() ? this.link.remoteAim() : null;
    if (aim && aim !== this.lastAim && Number.isFinite(aim.keeperX) && aim.keeperDir) {
      placePenaltyKeeper(state, aim.keeperX as number, aim.keeperDir);
    }
    this.lastAim = aim;
    this.keeperAcc += seconds;
    let steps = 0;
    while (this.keeperAcc >= PHYSICS_DT && steps < ONLINE_TIMING.MAX_STEPS) {
      stepPenaltyKeeper(state, PHYSICS_DT);
      this.keeperAcc -= PHYSICS_DT;
      steps += 1;
    }
    if (steps >= ONLINE_TIMING.MAX_STEPS) this.keeperAcc = 0;
  }

  // ------------------------------------------------------------ fila e ações

  /** A ação `action` pode ser aplicada no estado de agora? */
  private accepts(action: DuelAction): boolean {
    const state = this.state;
    if (this.pres || this.penaltyPending) return false;
    switch (action.kind) {
      case "shot":
      case "idle":
      case "expire":
        return isAim(state);
      case "pshot":
      case "pmiss":
        return state.phase === "penalties" && Boolean(state.penalties) && !state.penalties?.shotInFlight;
      case "porder":
        return state.phase === "penalty-setup";
    }
  }

  /** Parado num descanso e a ação é de outro tipo de momento: nunca vai ser aceita sem sincronia. */
  private incompatible(action: DuelAction): boolean {
    const state = this.state;
    if (this.pres || this.penaltyPending || this.restN !== this.nextN) return false;
    if (state.phase === "resolving" || state.phase === "goal" || state.phase === "interval") return false;
    return !this.accepts(action);
  }

  private drainQueue() {
    const authority = this.perspective === "user";
    for (let guard = 0; guard < 64; guard += 1) {
      if (this.stuckN === this.nextN) return;
      const action = this.link.peek(this.nextN);
      if (!action) return;
      if (!this.accepts(action)) {
        if (this.incompatible(action)) this.reject(action, authority);
        return;
      }
      // Turno que ficou acionável aqui: conta como aberto antes de a ação chegar (uma vez por n).
      this.openTurn();
      // Chave diferente mas o motor aceita: aplica mesmo assim (§5.8). O motor recusou: sincronia.
      if (!this.apply(action)) {
        this.reject(action, authority);
        return;
      }
      this.link.consume(action.n);
      this.checkRest();
    }
  }

  /** A ação n não cabe no estado local. Autoridade: descarta (o controlador manda m:sync). Seguidor: pede sincronia e espera. */
  private reject(action: DuelAction, authority: boolean) {
    if (authority) {
      this.link.consume(action.n);
      this.link.requestSync("stuck");
      return;
    }
    if (this.stuckN === this.nextN) return;
    this.stuckN = this.nextN;
    this.link.requestSync("stuck");
  }

  /** Escreve uma ação deste aparelho: aplica primeiro pelo caminho de todos, depois envia. */
  private write(partial: DistributiveOmit<DuelAction, "n" | "k" | "se">): boolean {
    const action = { ...partial, n: this.nextN, k: matchKey(this.state), se: this.link.syncEpoch() } as DuelAction;
    if (!this.apply(action)) return false;
    this.link.submit(action);
    this.checkRest();
    return true;
  }

  /** O único caminho de aplicação (§5.2): ao vivo, do log, de um hello ou depois de uma sincronia. */
  private apply(action: DuelAction): boolean {
    const state = this.state;
    if (!this.accepts(action)) return false;
    switch (action.kind) {
      case "shot": {
        if (!canShoot(state, action.shot.bodyId)) return false;
        this.emit(applyRemoteClock(state, action.clock, action.grace));
        if (isAim(state) && !beginShot(state, action.shot)) return false;
        break;
      }
      case "idle": {
        this.emit(applyRemoteClock(state, action.clock, false));
        if (isAim(state)) this.emit(awardInactivityPenalty(state, action.side));
        break;
      }
      case "expire": {
        this.emit(state.finalShotGrace ? cancelFinalShotGrace(state) : applyRemoteClock(state, 0, false));
        break;
      }
      case "pshot": {
        if (penaltyShooter(state).id !== action.shot.bodyId) return false;
        placePenaltyKeeper(state, action.keeperX, action.keeperDir);
        if (!beginPenaltyShot(state, action.shot)) return false;
        this.lastPenaltyShooterId = action.shot.bodyId;
        break;
      }
      case "pmiss": {
        const shooting = state.penalties?.turn ?? action.side;
        this.lastPenaltyShooterId = penaltyShooter(state).id;
        this.penaltyPending = { scored: false, missed: true };
        this.pres = { kind: "penalty", remainingMs: ONLINE_TIMING.PENALTY_PAUSE_MS };
        this.opts.onVibrate?.(30);
        this.opts.onFlash("DEMOROU! COBRANÇA PERDIDA", this.flashTone(shooting, "save"), ONLINE_TIMING.PENALTY_PAUSE_MS);
        break;
      }
      case "porder": {
        if (!confirmPenaltyOrders(state, action.orders)) return false;
        break;
      }
    }
    this.nextN = action.n + 1;
    this.acc = 0;
    this.keeperAcc = 0;
    this.closeTurn();
    this.enterPhase(null);
    return true;
  }

  // ------------------------------------------------------------ turno

  private closeTurn() {
    this.openedN = null;
    this.openedSide = null;
    this.openedKey = "";
    this.idleLeft = null;
    this.kickLeft = null;
    this.cpuTimer = null;
    this.openElapsed = 0;
  }

  /** O turno n ficou acionável neste aparelho: avisa o controlador uma vez e arma os timers do dono. */
  private openTurn() {
    if (this.frozen || this.stuckN !== null || this.restN !== this.nextN) return;
    const side = this.actionableSide();
    if (!side || this.openedN === this.nextN) return;
    const state = this.state;
    const control = this.controls[side];
    this.openedN = this.nextN;
    this.openedSide = side;
    this.openedKey = matchKey(state);
    this.clockAtOpen = state.clock;
    this.openElapsed = 0;
    const penalties = state.phase === "penalties";
    this.idleLeft = control === "local" && !penalties ? USER_DECISION_SECONDS : null;
    this.kickLeft = control === "local" && penalties ? ONLINE_TIMING.KICK_LIMIT_S : null;
    this.cpuTimer = control === "cpu" ? this.armCpu() : null;
    // Recarregou no meio do próprio turno: relógio e timers do checkpoint, nunca os do descanso.
    // Todo recarregamento passa por uma contagem de volta, que acabou antes de o turno abrir (congelado não abre):
    // o piso de 3 s (§5.5) vale aqui, senão o dono volta com 0,7 s e leva pênalti por demora.
    const timers = this.restoreTimers;
    if (timers && timers.turnN === this.nextN && control === "local") {
      if (isAim(state) && Number.isFinite(timers.ownerClock) && !(state.phase === "kickoff" && state.clockPausedForKickoff)) {
        state.clock = Math.max(0, Math.min(state.clock, timers.ownerClock));
      }
      if (this.idleLeft !== null && Number.isFinite(timers.idleLeft)) this.idleLeft = Math.max(0, timers.idleLeft);
      if (this.kickLeft !== null && timers.kickLeft !== null && Number.isFinite(timers.kickLeft)) this.kickLeft = Math.max(0, timers.kickLeft);
      this.applyResumeFloor();
    }
    if (timers && timers.turnN <= this.nextN) this.restoreTimers = null;
    this.link.turnOpened(this.nextN, side, state.clock, this.openedKey);
    if (control === "local") this.opts.onTurnStart(side);
    if (this.announcedTurnN !== this.nextN) {
      this.announcedTurnN = this.nextN;
      this.opts.onAnnounce(control === "local" ? (penalties ? "Sua cobrança." : "Sua vez.") : `Vez de ${this.names[side]}.`);
    }
  }

  private armCpu(): CpuTimer {
    const state = this.state;
    const view3d = this.opts.view3d();
    const penalty = state.phase === "penalties";
    const kickoffWait = view3d && state.phase === "kickoff" && state.clockPausedForKickoff ? CPU_KICKOFF_WAIT_3D_MS : 0;
    // O drama só existe no 3D e só no pênalti da CPU; o sorteio é Math.random (ou o injetado), nunca state.rng.
    const dramaMs = penalty && view3d ? CPU_PENALTY_DRAMA_MS + this.random() * CPU_PENALTY_DRAMA_JITTER_MS : 0;
    return {
      totalMs: CPU_THINK_MS + kickoffWait + dramaMs,
      elapsedMs: 0,
      dramaMs,
      shooterId: penalty ? penaltyShooter(state).id : null,
      settleMs: 0,
    };
  }

  private applyResumeFloor() {
    if (this.idleLeft !== null) this.idleLeft = Math.max(this.idleLeft, RESUME_TIMER_FLOOR_S);
    if (this.kickLeft !== null) this.kickLeft = Math.max(this.kickLeft, RESUME_TIMER_FLOOR_S);
  }

  /** Relógio do dono, 7 s, limite do pênalti e a vez da CPU (só sem congelamento). */
  private ownerWork(elapsed: number, holding: boolean) {
    const side = this.openSide();
    if (!side) return;
    const state = this.state;
    const control = this.controls[side];
    if (control === "remote") {
      if (isAim(state) && !(state.phase === "kickoff" && state.clockPausedForKickoff)) this.openElapsed += elapsed;
      return;
    }
    if (elapsed <= 0) return;
    if (isAim(state)) {
      const hold = control === "local" && holding;
      const paused = state.phase === "kickoff" && state.clockPausedForKickoff;
      if (!paused && !state.finalShotGrace) {
        // Zerou sem botão seguro: o dono encerra o tempo pela ação de todos.
        if (state.clock - elapsed <= 0 && !hold) {
          this.write({ kind: "expire", side });
          return;
        }
        this.emit(advanceClock(state, elapsed, hold));
      }
      if (this.idleLeft !== null) {
        this.idleLeft = Math.max(0, this.idleLeft - elapsed);
        if (this.idleLeft <= 0) {
          if (state.finalShotGrace) this.write({ kind: "expire", side });
          else this.write({ kind: "idle", side, clock: state.clock });
          return;
        }
      }
    } else if (this.kickLeft !== null) {
      this.kickLeft = Math.max(0, this.kickLeft - elapsed);
      if (this.kickLeft <= 0) {
        this.write({ kind: "pmiss", side });
        return;
      }
    }
    if (control === "cpu") this.cpuStep(side, elapsed);
  }

  private cpuStep(side: BotaoSide, elapsed: number) {
    const timer = this.cpuTimer;
    const brain = this.cpu;
    if (!timer || !brain) return;
    const state = this.state;
    if (timer.elapsedMs < timer.totalMs) {
      timer.elapsedMs = Math.min(timer.totalMs, timer.elapsedMs + elapsed * 1000);
      if (timer.elapsedMs < timer.totalMs) return;
    }
    // Drama: com a câmera ainda virando para trás do batedor, espera mais um pouco.
    if (timer.dramaMs > 0 && timer.settleMs < CAMERA_SETTLE_MAX_MS && this.opts.cameraSettled && !this.opts.cameraSettled()) {
      timer.settleMs += elapsed * 1000;
      return;
    }
    if (state.phase === "penalties" && state.penalties) {
      const shooter = penaltyShooter(state);
      const keeper = penaltyKeeper(state);
      const shot = chooseCpuPenaltyShot(state, shooter, keeper, brain.skill, brain.rng);
      if (!this.write({ kind: "pshot", side, shot, keeperX: keeper.x, keeperDir: state.penalties.keeperDirection < 0 ? -1 : 1 })) {
        this.write({ kind: "pmiss", side });
      }
      return;
    }
    if (!isAim(state)) return;
    const chosen = chooseCpuShot(state, brain.skill, brain.rng, side);
    const clock = state.clock;
    if (chosen && this.write({ kind: "shot", side, shot: chosen, clock, grace: false })) return;
    // Rede de segurança: sem toque legal, um toque fraco na direção da bola (online não existe "passar a vez").
    const fallback = this.fallbackShot(side);
    if (fallback && this.write({ kind: "shot", side, shot: fallback, clock, grace: false })) return;
    this.write({ kind: "idle", side, clock });
  }

  private fallbackShot(side: BotaoSide): BotaoShot | null {
    const state = this.state;
    const ball = ballOf(state);
    let best: { id: string; distance: number; dx: number; dy: number; speed: number } | null = null;
    for (const disc of discsOf(state, side)) {
      if (!canShoot(state, disc.id)) continue;
      const dx = ball.x - disc.x;
      const dy = ball.y - disc.y;
      const distance = Math.hypot(dx, dy);
      if (!best || distance < best.distance) best = { id: disc.id, distance, dx, dy, speed: shotSpeedForBody(disc) * FALLBACK_SHOT_RATIO };
    }
    if (!best) return null;
    const length = Math.max(1e-6, best.distance);
    return { bodyId: best.id, vx: (best.dx / length) * best.speed, vy: (best.dy / length) * best.speed };
  }

  // ------------------------------------------------------------ penalty-setup

  private tickOrderPick(elapsed: number) {
    if (this.state.phase !== "penalty-setup" || this.orderLeft === null || this.frozen) return;
    this.orderLeft = Math.max(0, this.orderLeft - elapsed);
    if (this.orderLeft > 0) return;
    // Sem escolha vale a ordem do time (a padrão, que já está no estado).
    const penalties = this.state.penalties;
    for (const side of ["user", "cpu"] as const) {
      if (this.controls[side] === "local" && penalties) this.chooseOrder(side, penalties.order[side]);
    }
  }

  // ------------------------------------------------------------ avisos

  private watchFinalShot() {
    const state = this.state;
    const side = this.openSide();
    if (!side || !isAim(state)) return;
    const remoteGrace = this.controls[side] === "remote" && this.link.remoteHolding() && this.displayClock() <= 0;
    if (!state.finalShotGrace && !remoteGrace) return;
    if (this.graceAnnouncedN === this.nextN) return;
    this.graceAnnouncedN = this.nextN;
    this.opts.onFlash("ÚLTIMO LANCE!", "info", 1500);
    this.opts.onVibrate?.([0, 45, 35, 90]);
    this.opts.onAnnounce(this.controls[side] === "local"
      ? "O tempo acabou com o chute armado. Solte: a partida só termina quando a bola parar."
      : `O tempo acabou com o chute de ${this.names[side]} armado.`);
  }

  private watchBanner(banner: ReturnType<BotaoMatchLink["status"]>["banner"]) {
    // A chave é só o tipo: o texto do "esperando" muda a cada segundo (o tempo dele).
    const key = banner ? banner.kind : "";
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    // Só o primeiro número de cada contagem vai para o leitor de tela.
    if (banner) this.opts.onAnnounce(banner.text);
  }

  private reportProgress(elapsed: number) {
    this.progressMs += elapsed * 1000;
    if (this.progressMs < PROGRESS_EVERY_MS) return;
    const side = this.openSide();
    const owner = side !== null && this.controls[side] === "local";
    const own = owner ? { idleLeft: Math.round((this.idleLeft ?? USER_DECISION_SECONDS) * 10) / 10, kickLeft: this.kickLeft === null ? null : Math.round(this.kickLeft * 10) / 10 } : null;
    const opened = this.openedN === this.nextN ? this.openedN : null;
    const se = this.link.syncEpoch();
    const key = `${this.nextN}|${this.restN}|${this.restHash}|${se}|${opened}|${own ? `${own.idleLeft}|${own.kickLeft}` : "-"}`;
    if (key === this.progressKey) return;
    this.progressKey = key;
    this.progressMs = 0;
    this.link.reportProgress({ n: this.nextN, restN: Math.max(0, this.restN), h: this.restHash, se, opened, own });
  }
}

/** Omit que respeita a união (cada variante perde só os campos pedidos). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

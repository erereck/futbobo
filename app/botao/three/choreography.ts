// Coreografia das comemorações no 3D: para onde cada boneco corre e o que faz
// depois de um gol, de uma cobrança de pênalti e no apito final.
//
// Só desenho. Durante essas pausas o motor está parado (fase "goal",
// "finished" ou cobrança decidida); aqui a posição EXIBIDA de cada boneco é
// emprestada e devolvida quando a jogada volta — a visão faz os bonecos
// trotarem de onde estiverem até a formação nova.

import type { CelebrationId } from "../../player-appearance";
import type { BotaoSide } from "../types";
import { beamRoom } from "./celebration-fx";
import { KAME, angleDelta, idleIntent, type FigureAction, type FigureIntent, type FigureState } from "./character";
import { HALF_H, HALF_W } from "./stadium";

export type Actor = {
  id: string;
  side: BotaoSide | null;
  x: number;
  z: number;
  keeper?: boolean;
  isUser?: boolean;
};

export type Directive = { x: number; z: number; intent: FigureIntent; sliding: boolean };

export type CameraShot = {
  x: number;
  z: number;
  zoom: number;
  pitch: number;
  /** Giro extra lento em volta do alvo (rad), somado ao yaw do jogador. */
  orbit: number;
};

type Point = { x: number; z: number };
type Facing = { point: Point } | { actor: string } | { yaw: number } | null;

type Step =
  | { kind: "wait"; duration: number; state?: FigureState; action?: FigureAction | null; face?: Facing }
  | { kind: "run"; to: Point; speed: number; action?: FigureAction | null; state?: FigureState }
  | { kind: "slide"; dir: Point; distance: number; duration: number; action: FigureAction }
  | { kind: "hold"; state?: FigureState; action?: FigureAction | null; face?: Facing };

type Track = {
  steps: Step[];
  index: number;
  elapsed: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  slideFrom: Point | null;
  /** Relógio da coreografia quando a pose final ("hold") começou; -1 antes disso. */
  heldAt: number;
};

/** Os mesmos ids de CELEBRATION_OPTIONS (player-appearance.ts), menos o "auto". */
export type GoalCelebration =
  | "kneeSlide" | "cornerFlag" | "airplane" | "siuu" | "backflip" | "crest"
  | "heart" | "shush" | "armsCrossed" | "cradle" | "robot" | "dance"
  // Bobonline. Ficam FORA de GOAL_CELEBRATIONS (o sorteio "Variada" de sempre não muda).
  | "kamehameha" | "superSaiyan" | "meditate" | "cupEar" | "fingerGuns";
const GOAL_CELEBRATIONS: GoalCelebration[] = [
  "kneeSlide", "siuu", "cornerFlag", "backflip", "airplane", "crest",
  "heart", "shush", "armsCrossed", "cradle", "robot", "dance",
];

/** Só aparecem quando escolhidas no criador (fora do sorteio "Variada" dos modos de sempre). */
export const SIGNATURE_ONLY: GoalCelebration[] = ["kamehameha", "superSaiyan", "meditate", "cupEar", "fingerGuns"];
/**
 * "Variada" das partidas com elenco nomeado (Bobonline): as 12 de sempre mais
 * as três novas que não esticam a pausa do gol. Kamehameha e Super Saiyajin só
 * quando escolhidas: a extensão da pausa continua função só do id escolhido.
 */
export const BOBONLINE_VARIADA: GoalCelebration[] = [...GOAL_CELEBRATIONS, "meditate", "cupEar", "fingerGuns"];

const GOAL_SHOT_KINDS = new Set<string>([...GOAL_CELEBRATIONS, ...SIGNATURE_ONLY]);

/** Id do criador ("auto", "siuu"...) → comemoração da coreografia; null mantém o sorteio. */
export function goalCelebrationOf(id: string | null | undefined): GoalCelebration | null {
  return id && GOAL_SHOT_KINDS.has(id) ? (id as GoalCelebration) : null;
}

/**
 * Comemoração de cada botão numa partida com elenco nomeado: a escolhida no
 * criador; "Variada" sorteia do BOBONLINE_VARIADA com a mesma semente nos dois
 * aparelhos (mesma conta do sorteio de sempre).
 */
export function squadCelebrationFor(celebration: CelebrationId, scorerId: string, seed: number): GoalCelebration {
  return goalCelebrationOf(celebration) ?? BOBONLINE_VARIADA[hash(`${seed}|${scorerId}`) % BOBONLINE_VARIADA.length];
}

/** Abaixo disso a tela está em pé (retrato): o raio do Kamehameha encurta e a câmera abre mais. */
const PORTRAIT_ASPECT = 0.8;
/**
 * Ângulo (rad) entre o raio e a direção da câmera, para o lado de quem marcou: de
 * três quartos para a câmera, com a ponta dentro do quadro (em pé e no campo virado).
 */
const KAME_BEAM_YAW = 0.95;
/** A câmera começa a abrir isto (s) antes do disparo: ela chega atrasada e a ponta sai em 0,12 s. */
const KAME_CAMERA_LEAD = 0.25;
const KAME_BEAM_LENGTH = 110;
const KAME_BEAM_LENGTH_PORTRAIT = 80;
/** Meia largura do corredor do raio: adversário dentro dele cai sentado. */
const KAME_CORRIDOR = 20;
/** Quando (s depois de a pose começar) quem está no corredor cai: o raio sai em KAME.FIRE. */
const KAME_KNOCKDOWN = 1.25;
const NET_SHOT_SECONDS = 0.42;
const MARGIN = 15;
/** Raio da roda da comemoração: adversário dentro dele sai andando. */
const PARTY_CLEARANCE = 58;
const SCORER_SPEED = 230;
/** Corrida máxima de quem marcou até a festa (~0,6s): o golpe final tem que caber no plano. */
const RUN_LIMIT = 125;
const TEAMMATE_SPEED = 185;

/** Ponto a no máximo `limit` de `from`, na direção de `to`. */
function limitFrom(from: Point, to: Point, limit: number): Point {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= limit || distance < 0.001) return to;
  return { x: from.x + (dx / distance) * limit, z: from.z + (dz / distance) * limit };
}

function clampToField(point: Point): Point {
  return {
    x: Math.max(-HALF_W + MARGIN, Math.min(HALF_W - MARGIN, point.x)),
    z: Math.max(-HALF_H + MARGIN, Math.min(HALF_H - MARGIN, point.z)),
  };
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/** Ângulo no mesmo padrão dos bonecos: yaw = atan2(dx, dz). */
function yawTo(from: Point, to: Point) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

const smoothstep = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

/**
 * Quanto tempo (s) a corrida do `advance` leva de `from` a `to` saindo do zero:
 * a mesma aceleração e a mesma freada, em passos de 1/60 s.
 */
function runTime(from: Point, to: Point, speed: number) {
  const dt = 1 / 60;
  let x = from.x;
  let z = from.z;
  let velocity = 0;
  let time = 0;
  for (let guard = 0; guard < 600; guard += 1) {
    const dx = to.x - x;
    const dz = to.z - z;
    const distance = Math.hypot(dx, dz);
    const target = speed * Math.max(0.25, Math.min(1, distance / 26));
    velocity += (target - velocity) * (1 - Math.exp(-dt * 9));
    const move = velocity * dt;
    if (distance <= Math.max(move, 1.5)) return time + distance / Math.max(1, velocity);
    x += (dx / distance) * move;
    z += (dz / distance) * move;
    time += dt;
  }
  return time;
}

export class Choreographer {
  private tracks = new Map<string, Track>();
  private focusId: string | null = null;
  private focusPoint: Point | null = null;
  private zoom = 2.7;
  private pitch = 0.86;
  private elapsed = 0;
  private kindValue: string | null = null;
  private sideValue: BotaoSide | null = null;
  private lastBall: Point | null = null;
  /** De onde a rampa de zoom parte: 1 na vista de jogo, o close atual quando uma festa emenda na outra. */
  private rampFrom = 1;
  /** Para onde o raio do Kamehameha sai (yaw), para a câmera acompanhar. */
  private beamYaw = 0;
  /** Lado do raio do Kamehameha (±1; 1 nas outras festas): a órbita lenta gira para ele e fecha o ângulo. */
  private beamSide = 1;
  /** Última largura ÷ altura que a câmera recebeu (o gol pode chegar sem ela). */
  private lastAspect = 16 / 9;

  get active() {
    return this.tracks.size > 0;
  }

  /** Qual comemoração está rodando (para o resto da cena reagir: confete, poeira...). */
  get kind() {
    return this.kindValue;
  }

  /** Quem está no centro da festa agora. */
  get focus() {
    return this.focusId;
  }

  /** Time que está comemorando (null no empate): pinta os brilhos em volta do foco. */
  get side() {
    return this.sideValue;
  }

  stop() {
    this.tracks.clear();
    this.focusId = null;
    this.focusPoint = null;
    this.kindValue = null;
    this.sideValue = null;
    this.rampFrom = 1;
    this.elapsed = 0;
    this.beamSide = 1;
  }

  has(id: string) {
    return this.tracks.has(id);
  }

  // ------------------------------------------------------------------ gol

  /**
   * Gol: quem marcou dispara para a festa (carrinho de joelho, bandeirinha,
   * aviãozinho, "siuuu", mortal, beijo no escudo, coração, silêncio, braços
   * cruzados, embala neném, robô ou dancinha; escolhidas no criador, também
   * Kamehameha, Super Saiyajin, meditação, "não tô ouvindo" e pistoleiro), os companheiros chegam
   * correndo por trás dele (longe da câmera, para não taparem) e o outro time
   * desaba aos poucos.
   */
  startGoal(args: {
    side: BotaoSide;
    scorerId: string | null;
    ownGoalId: string | null;
    ball: Point;
    actors: Actor[];
    cameraYaw: number;
    seed: number;
    /** Comemoração escolhida no criador: vale só quando quem marcou é o jogador do usuário. */
    signature?: GoalCelebration | null;
    /**
     * Elenco nomeado (Bobonline): a comemoração de cada botão. Quando vem, vale
     * para quem marcou no lugar da regra do `isUser` (gol contra continua aviãozinho).
     */
    signatureFor?: (actorId: string) => GoalCelebration | null;
    /** Largura ÷ altura da tela; sem ela, a última que a câmera recebeu (ou 16/9). O Kamehameha mira diferente em pé. */
    aspect?: number;
  }) {
    this.stop();
    const field = args.actors.filter((actor) => !actor.keeper && actor.side);
    const team = field.filter((actor) => actor.side === args.side);
    const rivals = field.filter((actor) => actor.side !== args.side);
    if (team.length === 0) return;

    // Gol contra ou bate-rebate: comemora quem estiver mais perto da bola.
    const scorer = (!args.ownGoalId && team.find((actor) => actor.id === args.scorerId))
      || team.slice().sort((a, b) => Math.hypot(a.x - args.ball.x, a.z - args.ball.z) - Math.hypot(b.x - args.ball.x, b.z - args.ball.z))[0];
    const goalZ = args.side === "user" ? -HALF_H : HALF_H;
    const inward = args.side === "user" ? 1 : -1;
    const sx = Math.abs(scorer.x) > 18 ? Math.sign(scorer.x) : hash(`${args.seed}|side`) % 2 ? 1 : -1;
    const signature = args.ownGoalId
      ? null
      : args.signatureFor ? args.signatureFor(scorer.id) : scorer.isUser ? args.signature ?? null : null;
    const kind: GoalCelebration = args.ownGoalId
      ? "airplane"
      : signature ?? GOAL_CELEBRATIONS[hash(`${args.seed}|${scorer.id}`) % GOAL_CELEBRATIONS.length];
    this.kindValue = kind;
    this.sideValue = args.side;

    const start = { x: scorer.x, z: scorer.z };
    const toward = { x: Math.sin(args.cameraYaw), z: Math.cos(args.cameraYaw) };
    // A festa precisa caber em ~1,7s de cena (câmera lenta + volta da câmera
    // antes da saída): a corrida é limitada e o golpe final começa até ~0,85s.
    const reach = (target: Point, limit = RUN_LIMIT) => clampToField(limitFrom(start, target, limit));
    const steps: Step[] = [{ kind: "wait", duration: 0.08, state: "celebrate", action: null }];
    let finish: Point;
    const portrait = (args.aspect ?? this.lastAspect) < PORTRAIT_ASPECT;
    let beamYaw = args.cameraYaw;
    switch (kind) {
      case "kneeSlide": {
        // O plano clássico de TV: ele vem correndo NA DIREÇÃO da câmera e desliza de joelhos até ela.
        const slideLength = 44;
        const turn = reach({ x: sx * (HALF_W - 62), z: goalZ + inward * 60 }, RUN_LIMIT - 30);
        const slideStart = clampToField({ x: turn.x + toward.x * 30, z: turn.z + toward.z * 30 });
        finish = clampToField({ x: slideStart.x + toward.x * slideLength, z: slideStart.z + toward.z * slideLength });
        steps.push({ kind: "run", to: turn, speed: SCORER_SPEED, action: "fistPump" });
        steps.push({ kind: "run", to: slideStart, speed: SCORER_SPEED + 20, action: null });
        steps.push({ kind: "slide", dir: toward, distance: Math.hypot(finish.x - slideStart.x, finish.z - slideStart.z), duration: 0.62, action: "kneeSlide" });
        steps.push({ kind: "hold", state: "celebrate", action: "kneelCheer", face: { yaw: args.cameraYaw } });
        break;
      }
      case "cornerFlag": {
        finish = reach({ x: sx * (HALF_W - 18), z: goalZ + inward * 20 }, RUN_LIMIT + 20);
        steps.push({ kind: "run", to: finish, speed: SCORER_SPEED + 15, action: "fistPump" });
        // De frente para a torcida do canto.
        steps.push({ kind: "hold", state: "celebrate", action: "flagDance", face: { point: { x: sx * (HALF_W + 60), z: goalZ - inward * 40 } } });
        break;
      }
      case "airplane": {
        // Curva curta em volta de um ponto ao lado dele, de braços abertos.
        const center = clampToField({ x: start.x + sx * 42, z: start.z + inward * 18 });
        const radius = 40;
        const startAngle = Math.atan2(start.z - center.z, start.x - center.x);
        for (let index = 1; index <= 3; index += 1) {
          const angle = startAngle + sx * inward * index * 1.05;
          steps.push({
            kind: "run",
            to: clampToField({ x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius }),
            speed: SCORER_SPEED - 20,
            action: "airplane",
          });
        }
        finish = (steps[steps.length - 1] as Extract<Step, { kind: "run" }>).to;
        steps.push({ kind: "hold", state: "celebrate", action: "pointSky", face: { yaw: args.cameraYaw } });
        break;
      }
      case "siuu": {
        // Corrida curta: o salto tem que aterrissar antes de a câmera voltar para o jogo.
        finish = reach({ x: sx * (HALF_W - 70), z: goalZ + inward * 78 }, RUN_LIMIT - 50);
        steps.push({ kind: "run", to: finish, speed: SCORER_SPEED, action: null });
        // O "siuuu" gira 180° no ar: ele salta de costas e aterrissa de frente para a câmera.
        // Primeiro vira de costas, parado e com as mãos na cintura; se o corpo girasse junto
        // com o salto, a meia-volta virava volta inteira (ou se anulava). Espera só o giro que falta.
        const backTurn = Math.abs(angleDelta(yawTo(start, finish), args.cameraYaw + Math.PI));
        steps.push({ kind: "wait", duration: Math.max(0.12, Math.min(0.42, backTurn / 6)), state: "celebrate", action: "handsOnHips", face: { yaw: args.cameraYaw + Math.PI } });
        steps.push({ kind: "hold", state: "celebrate", action: "siuu", face: { yaw: args.cameraYaw + Math.PI } });
        break;
      }
      case "backflip": {
        finish = clampToField({ x: start.x + sx * 26, z: start.z + inward * 22 });
        steps.push({ kind: "run", to: finish, speed: SCORER_SPEED - 30, action: null });
        // Encara a câmera antes de saltar: mortal girando de lado não lê bem.
        steps.push({ kind: "wait", duration: 0.28, state: "celebrate", action: "handsOnHips", face: { yaw: args.cameraYaw } });
        steps.push({ kind: "wait", duration: 1.0, state: "celebrate", action: "backflip", face: { yaw: args.cameraYaw } });
        steps.push({ kind: "hold", state: "celebrate", action: "pointSky", face: { yaw: args.cameraYaw } });
        break;
      }
      case "heart":
      case "cradle":
      case "dance": {
        // Vem na direção da câmera e para de frente para ela (o gesto é para o close).
        finish = reach({ x: start.x + toward.x * 85 + sx * 14, z: start.z + toward.z * 85 }, 90);
        steps.push({ kind: "run", to: finish, speed: SCORER_SPEED - 10, action: kind === "dance" ? "fistPump" : null });
        steps.push({ kind: "hold", state: "celebrate", action: kind, face: { yaw: args.cameraYaw } });
        break;
      }
      case "shush":
      case "cupEar": {
        // Vai para a arquibancada mais perto e cala a torcida (ou pede barulho). Vira para
        // ela só até três quartos: de costas para a câmera o gesto no rosto não aparece.
        finish = reach({ x: sx * (HALF_W - 34), z: start.z + inward * 24 }, RUN_LIMIT);
        steps.push({ kind: "run", to: finish, speed: SCORER_SPEED, action: null });
        const crowdYaw = yawTo(finish, { x: sx * (HALF_W + 90), z: finish.z });
        steps.push({ kind: "hold", state: "celebrate", action: kind, face: { yaw: args.cameraYaw + angleDelta(args.cameraYaw, crowdYaw) * 0.45 } });
        break;
      }
      case "armsCrossed":
      case "robot":
      case "superSaiyan":
      case "meditate":
      case "fingerGuns": {
        // Corrida curta e para seco, de frente para a câmera.
        finish = reach({ x: start.x + toward.x * 55 + sx * 10, z: start.z + toward.z * 55 }, 60);
        steps.push({ kind: "run", to: finish, speed: SCORER_SPEED - 40, action: null });
        steps.push({ kind: "hold", state: "celebrate", action: kind, face: { yaw: args.cameraYaw } });
        break;
      }
      case "kamehameha": {
        // Corrida curta para o lado e para dentro; para de três quartos para a câmera,
        // com o raio saindo para longe da roda dos companheiros (que fica atrás dele).
        // O ângulo é fechado (e a órbita da câmera gira para o mesmo lado): a ponta continua dentro da tela.
        finish = reach({ x: start.x + sx * 30, z: start.z + inward * 25 }, 70);
        steps.push({ kind: "run", to: finish, speed: SCORER_SPEED, action: null });
        beamYaw = args.cameraYaw + sx * KAME_BEAM_YAW;
        steps.push({ kind: "hold", state: "celebrate", action: "kamehameha", face: { yaw: beamYaw } });
        break;
      }
      default: {
        // Beijo no escudo vindo na direção da câmera.
        finish = reach({ x: start.x + toward.x * 90 + sx * 10, z: start.z + toward.z * 90 }, 90);
        steps.push({ kind: "run", to: finish, speed: SCORER_SPEED - 10, action: null });
        steps.push({ kind: "hold", state: "celebrate", action: "crestKiss", face: { yaw: args.cameraYaw } });
        break;
      }
    }
    this.add(scorer, steps);
    this.focusId = scorer.id;
    this.beamYaw = beamYaw;
    this.beamSide = kind === "kamehameha" ? sx : 1;

    // Companheiros: atrás de quem marcou, do ponto de vista da câmera.
    const away = args.cameraYaw + Math.PI;
    const mates = team.filter((actor) => actor.id !== scorer.id)
      .sort((a, b) => Math.hypot(a.x - finish.x, a.z - finish.z) - Math.hypot(b.x - finish.x, b.z - finish.z));
    const huddleActions: FigureAction[] = ["jumpCheer", "hug", "highFive", "jumpCheer", "clap"];
    // Meditação: ninguém pula em volta de quem medita, aplaudem.
    const cheer = (action: FigureAction): FigureAction => (kind === "meditate" && action === "jumpCheer" ? "clap" : action);
    // Super Saiyajin: a aura precisa de espaço; a roda fica um pouco mais longe.
    const roomy = kind === "superSaiyan" ? 10 : 0;
    // Kamehameha: a roda fecha um pouco e escorrega para o lado contrário ao raio (ninguém fica na
    // boca do golpe nem ao lado dele, na frente da câmera).
    const lean = kind === "kamehameha" ? sx * 0.35 : 0;
    const squeeze = kind === "kamehameha" ? 0.75 : 1;
    // Embala neném: os dois mais perto entram ao lado dele, embalando junto (Brasil, 94).
    const beside = { x: Math.cos(args.cameraYaw), z: -Math.sin(args.cameraYaw) };
    mates.forEach((mate, index) => {
      if (kind === "cradle" && index < 2) {
        const lateral = index === 0 ? 19 : -19;
        const spot = clampToField({
          x: finish.x + beside.x * lateral - toward.x * 5,
          z: finish.z + beside.z * lateral - toward.z * 5,
        });
        this.add(mate, [
          { kind: "wait", duration: 0.1 + index * 0.06, state: "celebrate", action: "fistPump", face: { actor: scorer.id } },
          { kind: "run", to: spot, speed: TEAMMATE_SPEED + 15, action: null },
          { kind: "hold", state: "celebrate", action: "cradle", face: { yaw: args.cameraYaw } },
        ]);
        return;
      }
      const spread = (index - (mates.length - 1) / 2) * 0.62 * squeeze;
      const angle = away + spread + lean;
      const radius = 22 + (index % 2) * 7 + roomy;
      const spot = clampToField({ x: finish.x + Math.sin(angle) * radius, z: finish.z + Math.cos(angle) * radius });
      this.add(mate, [
        { kind: "wait", duration: 0.12 + index * 0.09, state: "celebrate", action: "fistPump", face: { actor: scorer.id } },
        { kind: "run", to: spot, speed: TEAMMATE_SPEED - index * 6, action: index % 2 ? cheer("jumpCheer") : null },
        { kind: "hold", state: "celebrate", action: cheer(huddleActions[index % huddleActions.length]), face: { actor: scorer.id } },
      ]);
    });

    // Kamehameha: quem estiver no caminho do raio cai sentado logo depois do disparo.
    const beamX = Math.sin(beamYaw);
    const beamZ = Math.cos(beamYaw);
    // O mesmo corte da ponta que o efeito faz (no avental, antes da arquibancada): ninguém cai além dela.
    const beamLength = Math.min(portrait ? KAME_BEAM_LENGTH_PORTRAIT : KAME_BEAM_LENGTH, Math.max(30, beamRoom(finish.x, finish.z, beamX, beamZ)));
    const knockdownAt = kind === "kamehameha" ? 0.08 + runTime(start, finish, SCORER_SPEED) + KAME_KNOCKDOWN : -1;
    const inBeam = (actor: Actor) => {
      if (knockdownAt < 0) return false;
      const dx = actor.x - finish.x;
      const dz = actor.z - finish.z;
      const along = dx * beamX + dz * beamZ;
      return along > 0 && along < beamLength + 10 && Math.abs(dx * beamZ - dz * beamX) < KAME_CORRIDOR;
    };

    // Quem tomou: cada um do seu jeito, andando devagar para a própria área.
    const sadActions: FigureAction[] = ["handsOnHead", "handsOnHips", "kneelSad", "kickGround", "handsOnHips"];
    rivals.forEach((rival, index) => {
      if (rival.id === args.ownGoalId) {
        this.add(rival, [{ kind: "hold", state: "sad", action: "kneelSad", face: null }]);
        return;
      }
      if (inBeam(rival)) {
        // Vê a carga de olhos arregalados e cai sentado com o raio.
        this.add(rival, [
          { kind: "wait", duration: knockdownAt, state: "idle", action: "handsOnHead", face: { actor: scorer.id } },
          { kind: "hold", state: "sad", action: "sitDown", face: { actor: scorer.id } },
        ]);
        return;
      }
      const action = sadActions[(hash(rival.id) + index) % sadActions.length];
      // Quem está onde a festa vai acontecer sai do caminho (senão vira "intruso" no abraço).
      const fromParty = { x: rival.x - finish.x, z: rival.z - finish.z };
      const partyDistance = Math.hypot(fromParty.x, fromParty.z);
      const inTheWay = partyDistance < PARTY_CLEARANCE;
      const escape = partyDistance > 0.001 ? fromParty : { x: -sx, z: -inward };
      const escapeLength = Math.hypot(escape.x, escape.z);
      const walk = inTheWay
        ? clampToField({ x: finish.x + (escape.x / escapeLength) * (PARTY_CLEARANCE + 12), z: finish.z + (escape.z / escapeLength) * (PARTY_CLEARANCE + 12) })
        : clampToField({ x: rival.x * 0.94, z: rival.z - inward * (10 + (index % 3) * 6) });
      const steps: Step[] = [{ kind: "wait", duration: inTheWay ? 0.05 : 0.2 + index * 0.12, state: "sad", action: "handsOnHead", face: { point: { x: 0, z: goalZ } } }];
      if (inTheWay || action !== "kneelSad") steps.push({ kind: "run", to: walk, speed: inTheWay ? 120 : 34, action: "handsOnHips" });
      steps.push({ kind: "hold", state: "sad", action, face: { point: { x: 0, z: goalZ } } });
      this.add(rival, steps);
    });

    this.zoom = 2.75;
    this.pitch = 0.86;
  }

  // --------------------------------------------------------------- pênalti

  /** Pênalti decidido: quem bateu corre para a fila do time; o goleiro reage. */
  startPenalty(args: {
    scored: boolean;
    shooterId: string;
    keeperId: string;
    shootingSide: BotaoSide;
    actors: Actor[];
    benchZ: number;
    /** O goleiro mergulhou: fica no chão até o mergulho terminar antes de reagir. */
    keeperDove?: boolean;
  }) {
    this.stop();
    // Mergulho: ~0,42s no ar até cair; ele fica no chão um instante antes de reagir.
    const keeperDown = args.keeperDove ? 0.8 : 0.3;
    const shooter = args.actors.find((actor) => actor.id === args.shooterId);
    const keeper = args.actors.find((actor) => actor.id === args.keeperId);
    if (!shooter) return;
    this.kindValue = args.scored ? "penalty-goal" : "penalty-save";
    // Gol: festa de quem bateu. Defesa: festa do time do goleiro.
    this.sideValue = args.scored ? args.shootingSide : args.shootingSide === "user" ? "cpu" : "user";
    const benchX = args.shootingSide === "user" ? -40 : 40;
    if (args.scored) {
      this.add(shooter, [
        { kind: "wait", duration: 0.15, state: "celebrate", action: "fistPump", face: null },
        // Para entre a fila e o gol: de frente para os companheiros e para a câmera.
        { kind: "run", to: clampToField({ x: benchX * 0.6, z: args.benchZ - Math.sign(args.benchZ || 1) * 40 }), speed: 190, action: "airplane" },
        { kind: "hold", state: "celebrate", action: "jumpCheer", face: { point: { x: benchX, z: args.benchZ } } },
      ]);
      if (keeper) this.add(keeper, [{ kind: "wait", duration: Math.max(0.35, keeperDown), state: "keeper", action: null }, { kind: "hold", state: "sad", action: "sitDown" }]);
      this.focusId = shooter.id;
    } else {
      this.add(shooter, [
        { kind: "wait", duration: 0.25, state: "sad", action: "handsOnHead", face: null },
        { kind: "hold", state: "sad", action: "handsOnHead", face: null },
      ]);
      if (keeper && args.keeperDove) {
        // Defesa no chão: levanta parado (fora do estado de goleiro o mergulho solta) e vibra ali mesmo.
        this.add(keeper, [
          { kind: "wait", duration: keeperDown, state: "keeper", action: null },
          { kind: "wait", duration: 0.45, state: "idle", action: null, face: null },
          { kind: "hold", state: "celebrate", action: "fistPump", face: null },
        ]);
        this.focusId = keeper.id;
      } else if (keeper) {
        this.add(keeper, [
          { kind: "wait", duration: keeperDown, state: "keeper", action: null },
          { kind: "run", to: clampToField({ x: keeper.x * 0.5, z: keeper.z + (keeper.z < 0 ? 26 : -26) }), speed: 120, action: "fistPump" },
          { kind: "hold", state: "celebrate", action: "fistPump", face: null },
        ]);
        this.focusId = keeper.id;
      } else {
        this.focusId = shooter.id;
      }
    }
    // A fila do meio-campo também reage.
    for (const actor of args.actors) {
      if (actor.id === args.shooterId || actor.id === args.keeperId || actor.keeper || !actor.side) continue;
      const happy = (actor.side === args.shootingSide) === args.scored;
      this.add(actor, [
        { kind: "wait", duration: 0.1 + (hash(actor.id) % 5) * 0.05, state: happy ? "celebrate" : "sad", action: null },
        { kind: "hold", state: happy ? "celebrate" : "sad", action: happy ? "jumpCheer" : "handsOnHead" },
      ]);
    }
    this.zoom = 2.4;
    this.pitch = 0.82;
  }

  // ------------------------------------------------------------ apito final

  /** Fim de jogo sem gol na hora: o vencedor se junta no meio, quem perdeu senta. */
  startFinal(args: {
    winner: BotaoSide | null;
    actors: Actor[];
    cameraYaw: number;
    /** Gol no último lance: o close da festa do gol continua daqui, sem recuar. */
    fromZoom?: number;
    /** Quem marcou esse gol, se for do time vencedor, segue no centro. */
    starId?: string | null;
  }) {
    this.stop();
    this.kindValue = "final";
    this.sideValue = args.winner;
    this.rampFrom = args.fromZoom ?? 1;
    const field = args.actors.filter((actor) => !actor.keeper && actor.side);
    const winners = field.filter((actor) => actor.side === args.winner);
    const losers = field.filter((actor) => actor.side !== args.winner);
    const center = { x: 0, z: args.winner === "user" ? 40 : args.winner === "cpu" ? -40 : 0 };
    const away = args.cameraYaw + Math.PI;
    const star = winners.find((actor) => actor.id === args.starId) ?? winners.find((actor) => actor.isUser) ?? winners[0];
    winners.forEach((actor, index) => {
      if (actor === star) {
        this.add(actor, [
          { kind: "run", to: center, speed: 175, action: "airplane" },
          { kind: "hold", state: "celebrate", action: "pointSky", face: { yaw: args.cameraYaw } },
        ]);
        return;
      }
      const angle = away + (index - winners.length / 2) * 0.7;
      const spot = clampToField({ x: center.x + Math.sin(angle) * 24, z: center.z + Math.cos(angle) * 24 });
      this.add(actor, [
        { kind: "wait", duration: index * 0.08, state: "celebrate", action: "fistPump" },
        { kind: "run", to: spot, speed: 165, action: "jumpCheer" },
        { kind: "hold", state: "celebrate", action: index % 2 ? "hug" : "jumpCheer", face: star ? { actor: star.id } : null },
      ]);
    });
    const finalSad: FigureAction[] = ["sitDown", "kneelSad", "handsOnHips", "sitDown", "handsOnHead"];
    losers.forEach((actor, index) => {
      this.add(actor, [
        { kind: "wait", duration: 0.2 + index * 0.15, state: "sad", action: "handsOnHead" },
        { kind: "hold", state: "sad", action: args.winner ? finalSad[index % finalSad.length] : "handsOnHips" },
      ]);
    });
    // Disputa de pênaltis: o goleiro continua em cena e reage também.
    for (const keeper of args.actors.filter((actor) => actor.keeper && actor.side)) {
      const won = keeper.side === args.winner;
      this.add(keeper, [
        { kind: "wait", duration: 0.25, state: won ? "celebrate" : "sad", action: won ? "fistPump" : "handsOnHead" },
        { kind: "hold", state: won ? "celebrate" : "sad", action: won ? "fistPump" : "sitDown" },
      ]);
    }
    this.focusId = star?.id ?? null;
    this.focusPoint = star ? null : center;
    this.zoom = star ? 2.2 : 1.4;
    this.pitch = 0.8;
  }

  // ------------------------------------------------------------- execução

  private add(actor: Actor, steps: Step[]) {
    this.tracks.set(actor.id, {
      steps,
      index: 0,
      elapsed: 0,
      x: actor.x,
      z: actor.z,
      heading: 0,
      speed: 0,
      slideFrom: null,
      heldAt: -1,
    });
  }

  /** Avança todos; devolve posição e intenção de quem está sendo coreografado. */
  update(dt: number, look: Point): Map<string, Directive> {
    this.elapsed += dt;
    this.lastBall = look;
    const result = new Map<string, Directive>();
    for (const [id, track] of this.tracks) {
      const directive = this.advance(id, track, dt, look);
      result.set(id, directive);
    }
    this.separate(result);
    return result;
  }

  private facingYaw(track: Track, face: Facing | undefined): number | null {
    if (!face) return null;
    if ("yaw" in face) return face.yaw;
    if ("point" in face) return yawTo(track, face.point);
    const other = this.tracks.get(face.actor);
    return other ? yawTo(track, other) : null;
  }

  private advance(id: string, track: Track, dt: number, look: Point): Directive {
    let remaining = dt;
    // Vários passos curtos podem caber num quadro só.
    for (let guard = 0; guard < 4; guard += 1) {
      const step = track.steps[track.index];
      if (!step) break;
      if (step.kind === "hold") {
        // Parado de vez: velocidade velha faria o boneco "correr no lugar".
        track.speed = 0;
        // A ação da pose final começa neste quadro e soma o dt inteiro (o relógio do boneco).
        if (track.heldAt < 0) track.heldAt = this.elapsed - dt;
        break;
      }
      if (step.kind === "wait") {
        track.elapsed += remaining;
        track.speed *= Math.exp(-remaining * 10);
        if (track.elapsed < step.duration) { remaining = 0; break; }
        remaining = track.elapsed - step.duration;
        track.index += 1;
        track.elapsed = 0;
        continue;
      }
      if (step.kind === "run") {
        const dx = step.to.x - track.x;
        const dz = step.to.z - track.z;
        const distance = Math.hypot(dx, dz);
        const nextIsRun = track.steps[track.index + 1]?.kind === "run";
        // Arranca acelerando e freia chegando (a não ser que emende outra corrida).
        const brake = nextIsRun ? 1 : Math.min(1, distance / 26);
        const target = step.speed * Math.max(0.25, brake);
        track.speed += (target - track.speed) * (1 - Math.exp(-remaining * 9));
        const move = track.speed * remaining;
        if (distance <= Math.max(move, 1.5)) {
          track.x = step.to.x;
          track.z = step.to.z;
          remaining = distance > 0 ? Math.max(0, remaining - distance / Math.max(1, track.speed)) : remaining;
          track.index += 1;
          track.elapsed = 0;
          continue;
        }
        track.heading = Math.atan2(dx, dz);
        track.x += (dx / distance) * move;
        track.z += (dz / distance) * move;
        remaining = 0;
        break;
      }
      // Carrinho: desliza desacelerando na direção pedida.
      if (!track.slideFrom) {
        track.slideFrom = { x: track.x, z: track.z };
        track.heading = Math.atan2(step.dir.x, step.dir.z);
      }
      track.elapsed += remaining;
      const progress = Math.min(1, track.elapsed / step.duration);
      const eased = 1 - (1 - progress) * (1 - progress);
      track.x = track.slideFrom.x + Math.sin(track.heading) * step.distance * eased;
      track.z = track.slideFrom.z + Math.cos(track.heading) * step.distance * eased;
      track.speed = (step.distance / step.duration) * 2 * (1 - progress);
      if (progress < 1) { remaining = 0; break; }
      track.slideFrom = null;
      track.index += 1;
      track.elapsed = 0;
      remaining = 0;
    }
    const clamped = clampToField(track);
    track.x = clamped.x;
    track.z = clamped.z;

    const step = track.steps[track.index] ?? track.steps[track.steps.length - 1];
    const sliding = step.kind === "slide";
    if (step.kind === "run") {
      return {
        x: track.x,
        z: track.z,
        sliding: false,
        intent: idleIntent({
          state: step.state ?? "run",
          speed: track.speed,
          heading: track.heading,
          faceYaw: track.heading,
          action: step.action ?? null,
          look: null,
        }),
      };
    }
    if (sliding) {
      return {
        x: track.x,
        z: track.z,
        sliding: true,
        intent: idleIntent({ state: "celebrate", speed: 0, heading: track.heading, faceYaw: track.heading, action: step.action }),
      };
    }
    const faceYaw = this.facingYaw(track, step.face);
    return {
      x: track.x,
      z: track.z,
      sliding: false,
      intent: idleIntent({
        state: step.state ?? "idle",
        speed: track.speed,
        heading: track.heading,
        faceYaw,
        action: step.action ?? null,
        look: step.action ? null : look,
      }),
    };
  }

  /** Ninguém atravessa ninguém na roda da comemoração. */
  private separate(directives: Map<string, Directive>) {
    const list = [...directives.entries()];
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i][1];
          const b = list[j][1];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const distance = Math.hypot(dx, dz);
          const minimum = 15;
          if (distance >= minimum || distance < 0.001) continue;
          // Quem marcou e quem desliza não é empurrado: os outros abrem espaço.
          const aMoves = !a.sliding && this.focusId !== list[i][0];
          const bMoves = !b.sliding && this.focusId !== list[j][0];
          if (!aMoves && !bMoves) continue;
          const overlap = minimum - distance;
          const aShare = aMoves ? (bMoves ? 0.5 : 1) : 0;
          const bShare = bMoves ? (aMoves ? 0.5 : 1) : 0;
          a.x -= (dx / distance) * overlap * aShare;
          a.z -= (dz / distance) * overlap * aShare;
          b.x += (dx / distance) * overlap * bShare;
          b.z += (dz / distance) * overlap * bShare;
        }
      }
    }
    for (const [id, directive] of directives) {
      const track = this.tracks.get(id);
      if (!track) continue;
      track.x = directive.x;
      track.z = directive.z;
    }
  }

  /**
   * O que a câmera deve enquadrar agora (ou null para a vista de jogo).
   * `aspect` (largura ÷ altura, padrão 16/9) só muda o Kamehameha.
   */
  camera(aspect?: number): CameraShot | null {
    if (aspect !== undefined && aspect > 0 && Number.isFinite(aspect)) this.lastAspect = aspect;
    if (!this.active) return null;
    // Gol: primeiro a rede estufando, depois o chicote até quem marcou.
    const netShot = this.kindValue !== null && GOAL_SHOT_KINDS.has(this.kindValue);
    if (netShot && this.lastBall && this.elapsed < NET_SHOT_SECONDS) {
      return {
        x: this.lastBall.x * 0.9,
        z: this.lastBall.z,
        zoom: 1 + 0.9 * smoothstep(this.elapsed / NET_SHOT_SECONDS),
        pitch: 0.95,
        orbit: 0,
      };
    }
    const ramp = smoothstep((this.elapsed - (netShot ? NET_SHOT_SECONDS * 0.6 : 0)) / 0.55);
    const focus = this.focusId ? this.tracks.get(this.focusId) : null;
    const point = focus ? { x: focus.x + Math.sin(focus.heading) * focus.speed * 0.06, z: focus.z + Math.cos(focus.heading) * focus.speed * 0.06 } : this.focusPoint;
    if (!point) return null;
    const shot = {
      x: point.x,
      z: point.z,
      zoom: this.rampFrom + (this.zoom - this.rampFrom) * ramp,
      pitch: this.pitch,
      orbit: this.beamSide * Math.min(0.42, this.elapsed * 0.16),
    };
    if (this.kindValue === "kamehameha" && focus && focus.heldAt >= 0) {
      // Saindo o raio: o quadro anda junto com ele e abre (mais em pé, para a ponta caber).
      const fired = smoothstep((this.elapsed - focus.heldAt - KAME.FIRE + KAME_CAMERA_LEAD) / 0.5);
      if (fired > 0) {
        shot.x += Math.sin(this.beamYaw) * 35 * fired;
        shot.z += Math.cos(this.beamYaw) * 35 * fired;
        shot.zoom += ((this.lastAspect < PORTRAIT_ASPECT ? 1.7 : 2.1) - shot.zoom) * fired;
      }
    }
    return shot;
  }
}

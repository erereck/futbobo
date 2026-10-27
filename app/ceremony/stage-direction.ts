// Direção da gala 3D: onde cada um está e o que faz em cada instante.
//
// Tudo aqui é função do relógio do roteiro (`ballon-dor-script.ts`): marcas
// no palco, caminhadas, ações dos bonecos e o caminho do troféu. "Pular" e
// "Rever" são saltos desse relógio, então o palco só pergunta "onde ele está
// agora?" e acerta o boneco, sem depender do que aconteceu antes.

import type { FigureAction, FigureState } from "../botao/three/character";
import type { CeremonyTimeline } from "./ballon-dor-script";

export type Spot = { x: number; z: number };

// ------------------------------------------------------------------ palco
// Unidades do campo do botão (o boneco tem ~40 de altura). x cresce para a
// direita de quem olha da plateia, z para a plateia, y para cima.

/** Marcas dos três finalistas (ordem de `input.finalists`, esquerda → direita). */
export const MARK_X = [-78, 0, 78] as const;
export const MARK_Z = 0;
/** Palco principal: piso em y = 0, a plateia começa depois da borda da frente. */
export const STAGE = { left: -236, right: 236, back: -126, front: 72, pit: -20 } as const;
/** Praticável dos fundos (com um degrau): o lugar do troféu, diante do telão. */
export const RISER = { left: -128, right: 128, back: -108, front: -38, top: 9, stepFront: -28, stepTop: 4.5 } as const;
/** Onde o vencedor recebe a Bola de Ouro (no praticável, no meio). */
export const WINNER_SPOT: Spot = { x: 0, z: -64 };
/** Apresentador atrás do púlpito, no praticável, do lado direito. */
export const PRESENTER_MARK: Spot = { x: 112, z: -72 };
/**
 * Coluna com o troféu: atrás e à direita do lugar da entrega, ao alcance das
 * mãos de quem está lá (pega a taça e só vira, sem andar com ela: andando, as
 * mãos balançam na altura do quadril).
 */
export const PEDESTAL: Spot = { x: 31, z: -72 };
/** O apresentador entrega daqui (de frente para o vencedor). */
export const HANDOFF_SPOT: Spot = { x: 22, z: -63 };
/** Depois da entrega, ele recua uns passos (para longe da coluna) e aplaude. */
export const PRESENTER_REST: Spot = { x: 37, z: -53 };
/** Telão de LED: plano no fundo. */
export const SCREEN = { z: -120, width: 340, bottom: 18, height: 142 } as const;
/** Altura das mãos/peito para enquadrar e iluminar (acima do piso de quem está ali). */
export const CHEST_Y = 26;
export const FACE_Y = 35;

/** Para onde os finalistas olham nas marcas: o meio da plateia (viram um pouco para dentro). */
const AUDIENCE_EYE: Spot = { x: 0, z: 330 };
/** O apresentador fala com a plateia, um pouco virado para os finalistas. */
const PRESENTER_EYE: Spot = { x: -40, z: 260 };

/** Caminhada de palco (35–45 lê como andar, sem fase no ar). */
const WALK = 40;
/** Meio passo para trás (de costas). */
const BACKSTEP = 15;
/**
 * Onde o jogador derrotado assiste à festa: do lado que o vencedor deixou,
 * longe da linha entre a câmera baixa (giro do herói) e o praticável.
 */
const ASIDE_X = 52;
const ASIDE_Z = -4;
const ASIDE_WALK = 36;

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const smooth01 = (value: number) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const mix = (from: number, to: number, k: number) => from + (to - from) * k;

export function yawTo(from: Spot, to: Spot) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Altura do piso: palco em 0; o degrau e o praticável sobem suave (os pés não pulam o degrau). */
export function floorAt(x: number, z: number) {
  if (x < RISER.left - 2 || x > RISER.right + 2) return 0;
  return RISER.top * smooth01((RISER.stepFront + 1 - z) / (RISER.stepFront + 1 - (RISER.front - 3)));
}

// -------------------------------------------------------------- um ator

type Cue = { at: number; action: FigureAction | null; sad: boolean; face?: number; look?: Spot | null };

type Move = {
  start: number;
  points: Spot[];
  lengths: number[];
  total: number;
  speed: number;
  end: number;
  backwards: boolean;
  face?: number;
};

/** O pedido do instante para um boneco (posição já com a altura do piso). */
export type ActorPose = {
  x: number;
  y: number;
  z: number;
  face: number;
  state: FigureState;
  speed: number;
  heading: number;
  action: FigureAction | null;
  look: Spot | null;
  /** Desde quando vale o pedido atual: depois de um salto, a animação é pré-rodada esse tempo. */
  since: number;
  walking: boolean;
};

export function emptyPose(): ActorPose {
  return { x: 0, y: 0, z: 0, face: 0, state: "idle", speed: 0, heading: 0, action: null, look: null, since: 0, walking: false };
}

/**
 * Roteiro de um boneco: deixas (ação a partir de um instante) e caminhadas.
 * As caminhadas entram em ordem; cada uma parte de onde a anterior terminou.
 */
export class ActorPlan {
  private readonly cues: Cue[] = [];
  private readonly moves: Move[] = [];

  constructor(readonly home: Spot, readonly homeFace: number) {}

  cue(at: number, action: FigureAction | null, extra: { sad?: boolean; face?: number; look?: Spot | null } = {}) {
    this.cues.push({ at, action, sad: extra.sad === true, face: extra.face, look: extra.look });
    this.cues.sort((a, b) => a.at - b.at);
    return this;
  }

  /** Anda de onde estiver em `start` pelos pontos dados. Devolve o instante da chegada. */
  walk(start: number, points: Spot[], speed: number, options: { backwards?: boolean; face?: number } = {}) {
    const from = this.restAt(start);
    const path = [from, ...points];
    const lengths: number[] = [];
    let total = 0;
    for (let index = 1; index < path.length; index += 1) {
      const length = Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z);
      lengths.push(length);
      total += length;
    }
    const move: Move = {
      start,
      points: path,
      lengths,
      total: Math.max(0.001, total),
      speed,
      end: start + total / speed,
      backwards: options.backwards === true,
      face: options.face,
    };
    this.moves.push(move);
    return move.end;
  }

  /** Comprimento de um caminho saindo de onde ele estiver em `start`. */
  pathLength(start: number, points: Spot[]) {
    let previous = this.restAt(start);
    let total = 0;
    for (const point of points) {
      total += Math.hypot(point.x - previous.x, point.z - previous.z);
      previous = point;
    }
    return total;
  }

  /** Onde ele fica parado depois das caminhadas que já acabaram em `time`. */
  restAt(time: number): Spot {
    let spot = this.home;
    for (const move of this.moves) {
      if (move.start > time) break;
      spot = move.points[move.points.length - 1];
    }
    return spot;
  }

  sample(time: number, out: ActorPose): ActorPose {
    let x = this.home.x;
    let z = this.home.z;
    let face = this.homeFace;
    let faceAt = -Infinity;
    let settledAt = -Infinity;
    let walking: { move: Move; heading: number } | null = null;
    for (const move of this.moves) {
      if (time < move.start) break;
      const travelled = (time - move.start) * move.speed;
      if (travelled < move.total) {
        let rest = travelled;
        let segment = 0;
        while (segment < move.lengths.length - 1 && rest > move.lengths[segment]) {
          rest -= move.lengths[segment];
          segment += 1;
        }
        const a = move.points[segment];
        const b = move.points[segment + 1];
        const k = move.lengths[segment] > 0 ? Math.min(1, rest / move.lengths[segment]) : 1;
        x = mix(a.x, b.x, k);
        z = mix(a.z, b.z, k);
        walking = { move, heading: Math.atan2(b.x - a.x, b.z - a.z) };
        break;
      }
      const last = move.points[move.points.length - 1];
      x = last.x;
      z = last.z;
      settledAt = move.end;
      const before = move.points[move.points.length - 2];
      if (move.face !== undefined) {
        face = move.face;
        faceAt = move.end;
      } else if (!move.backwards) {
        face = Math.atan2(last.x - before.x, last.z - before.z);
        faceAt = move.end;
      }
    }

    let cue: Cue | null = null;
    let faceCue: Cue | null = null;
    // Deixa que só vira o corpo (mesma ação) não recomeça a animação.
    let actionSince = 0;
    for (const item of this.cues) {
      if (item.at > time) break;
      if (!cue || item.action !== cue.action || item.sad !== cue.sad) actionSince = item.at;
      cue = item;
      if (item.face !== undefined) faceCue = item;
    }
    if (faceCue && faceCue.face !== undefined && faceCue.at >= faceAt) face = faceCue.face;

    out.x = x;
    out.z = z;
    out.y = floorAt(x, z);
    out.look = null;
    if (walking) {
      out.walking = true;
      // De costas é "idle" com velocidade (passo curto); para frente, "run" a passo de palco.
      out.state = walking.move.backwards ? "idle" : "run";
      out.speed = walking.move.speed;
      out.heading = walking.heading;
      out.face = walking.move.backwards ? face : walking.heading;
      out.action = null;
      out.since = walking.move.start;
      return out;
    }
    out.walking = false;
    out.state = cue?.sad ? "sad" : "idle";
    out.speed = 0;
    out.heading = face;
    out.face = face;
    out.action = cue?.action ?? null;
    out.look = cue?.look ?? null;
    out.since = Math.max(actionSince, settledAt);
    return out;
  }
}

// ---------------------------------------------------------------- elenco

export type StagePlan = {
  finalists: ActorPlan[];
  presenter: ActorPlan;
  /** A plateia fica de pé (ovação) nessas janelas. */
  standing: Array<[number, number]>;
  firstIndex: number;
  secondIndex: number;
  thirdIndex: number;
  userIndex: number;
  /** Os dois que sobram depois do terceiro (índices, esquerda → direita). */
  remaining: [number, number];
  /** Cortes do duelo com o índice do finalista (ou o apresentador). */
  duelCuts: Array<{ at: number; focus: "finalist" | "presenter"; index: number }>;
  /** O troféu sai da coluna (começa e termina de subir para as mãos do apresentador). */
  pickAt: number;
  pickDone: number;
  /** Passa para as mãos do vencedor. */
  handoffAt: number;
  handoffDone: number;
  liftAt: number;
  winnerWalkStart: number;
  winnerArrive: number;
  /** Para onde o jogador vai depois do nome do vencedor, se perdeu (null se ganhou). */
  userAside: Spot | null;
  beats: {
    establishEnd: number;
    nominees: Array<{ start: number; end: number; index: number }>;
    presenterStart: number;
    thirdStart: number;
    thirdReveal: number;
    duelStart: number;
    revealStart: number;
    winnerReveal: number;
    celebrateStart: number;
    reactionStart: number;
    endStart: number;
  };
};

/** Sementes dos bonecos: todas dão destro (o gesto do apresentador abre para o lado dos finalistas). */
export const FIGURE_SEEDS = { finalists: [23, 11, 37], presenter: 61 } as const;

export function buildStagePlan(timeline: CeremonyTimeline): StagePlan {
  const finalists = timeline.input.finalists;
  const indexOf = (id: string) => Math.max(0, finalists.findIndex((finalist) => finalist.id === id));
  const beatStart = (id: string) => timeline.beats.find((beat) => beat.id === id)?.start ?? 0;
  const beatEnd = (id: string) => timeline.beats.find((beat) => beat.id === id)?.end ?? 0;
  const firstIndex = indexOf(timeline.first.id);
  const secondIndex = indexOf(timeline.second.id);
  const thirdIndex = indexOf(timeline.third.id);
  const userIndex = indexOf(timeline.user.id);
  const remaining = [0, 1, 2].filter((index) => index !== thirdIndex) as [number, number];

  const nominees = timeline.beats
    .filter((beat) => beat.id === "nominee")
    .map((beat, order) => ({ start: beat.start, end: beat.end, index: beat.nominee ?? order }));
  const establishEnd = beatEnd("establish");
  const presenterStart = beatStart("presenter");
  const thirdStart = beatStart("third");
  const duelStart = beatStart("duel");
  const revealStart = beatStart("reveal");
  const celebrateStart = beatStart("celebrate");
  const reactionStart = beatStart("reaction");
  const endStart = timeline.duration;
  const R3 = timeline.thirdRevealAt;
  const RW = timeline.winnerRevealAt;
  const handoffAt = timeline.trophyHandoffAt;
  const liftAt = timeline.trophyLiftAt;

  // ------------------------------------------------------- apresentador
  const presenter = new ActorPlan(PRESENTER_MARK, yawTo(PRESENTER_MARK, PRESENTER_EYE));
  presenter.cue(0, "presenterGesture").cue(Math.min(2.8, establishEnd), "presenterEnvelope");
  presenter.cue(R3, "presenterGesture").cue(R3 + 1.5, "applaud").cue(duelStart + 0.2, "presenterEnvelope");
  presenter.cue(RW, "presenterGesture");
  // Busca o troféu: anda até o lugar da entrega (contornando a coluna pela
  // frente), vira para a coluna, pega e vira para o vencedor.
  const presenterLeave = RW + 0.55;
  const presenterPath: Spot[] = [{ x: 42, z: -57 }, HANDOFF_SPOT];
  const presenterLength = presenter.pathLength(presenterLeave, presenterPath);
  const presenterSpeed = Math.max(36, Math.min(70, presenterLength / Math.max(0.6, handoffAt - 2.4 - presenterLeave)));
  const presenterArrive = presenter.walk(presenterLeave, presenterPath, presenterSpeed);
  const towardPedestal = yawTo(HANDOFF_SPOT, PEDESTAL);
  const towardWinner = yawTo(HANDOFF_SPOT, WINNER_SPOT);
  const pickAt = presenterArrive + 0.42;
  const pickDone = pickAt + 0.5;
  presenter.cue(presenterArrive, null, { face: towardPedestal, look: PEDESTAL });
  presenter.cue(pickAt - 0.18, "trophyCradle", { face: towardPedestal });
  presenter.cue(pickDone + 0.05, "trophyCradle", { face: towardWinner });
  const handoffDone = handoffAt + 0.45;
  presenter.cue(handoffAt + 0.32, "applaud", { face: towardWinner });
  const restArrive = presenter.walk(handoffAt + 0.6, [PRESENTER_REST], BACKSTEP, { backwards: true, face: yawTo(PRESENTER_REST, WINNER_SPOT) });
  presenter.cue(restArrive + 0.02, "applaud", { face: yawTo(PRESENTER_REST, WINNER_SPOT) });

  // ---------------------------------------------------------- finalistas
  const winnerArrive = handoffAt - 0.5;
  let winnerWalkStart = 0;
  let userAside: Spot | null = null;
  const plans = finalists.map((finalist, index) => {
    const home: Spot = { x: MARK_X[index], z: MARK_Z };
    const front = yawTo(home, AUDIENCE_EYE);
    const plan = new ActorPlan(home, front);
    // Abertura: acenam para a plateia, cada um no seu tempo, e esperam de mãos juntas.
    plan.cue(0, "nervous").cue(0.5 + index * 0.45, "wave").cue(2.7 + index * 0.35, "nervous");

    for (const nominee of nominees) {
      if (nominee.index === index) {
        const signature: FigureAction = finalist.isUser ? "handOnHeart" : index === 0 ? "wave" : "bow";
        plan.cue(nominee.start + 0.15, signature).cue(nominee.end, "nervous");
      } else {
        plan.cue(nominee.start + 0.1, "applaud").cue(nominee.start + 1.5, "nervous");
      }
    }

    // Terceiro lugar: o nome sai, quem é chamado reage e dá meio passo para trás.
    if (index === thirdIndex) {
      if (finalist.isUser) plan.cue(R3 + 0.12, "handsOnHips", { sad: true }).cue(R3 + 1.25, "sadClap");
      else plan.cue(R3 + 0.3, "wave").cue(R3 + 1.7, "applaud");
      const back = plan.walk(R3 + 2.5, [{ x: home.x, z: home.z - 10 }], BACKSTEP, { backwards: true, face: front });
      plan.cue(back + 0.02, "applaud").cue(duelStart + 0.9, "nervous").cue(RW + 0.35, "applaud");
    } else {
      plan.cue(R3 + 0.25, "applaud").cue(R3 + 2.3, "nervous");
    }

    // A revelação.
    if (index === firstIndex) {
      plan.cue(RW + 0.02, "disbelief").cue(RW + 1.95, "fistPump");
      // Sobe ao praticável pela frente do degrau, chega um pouco antes da entrega.
      const path: Spot[] = [{ x: home.x * 0.12, z: -22 }, WINNER_SPOT];
      const length = plan.pathLength(RW + 2, path);
      const earliest = RW + 2.1;
      const start = Math.max(earliest, winnerArrive - length / WALK);
      const speed = Math.max(WALK, Math.min(65, length / Math.max(0.5, winnerArrive - start)));
      winnerWalkStart = start;
      const arrive = plan.walk(start, path, speed);
      const towardPresenter = yawTo(WINNER_SPOT, HANDOFF_SPOT);
      plan.cue(arrive, null, { face: towardPresenter, look: HANDOFF_SPOT });
      plan.cue(handoffAt - 0.12, "trophyCradle", { face: towardPresenter });
      // Com a taça no colo, vira para a plateia; depois ergue.
      plan.cue(handoffAt + 0.6, "trophyCradle", { face: 0 });
      plan.cue(liftAt, "trophyLift", { face: 0 });
      plan.cue(endStart + 0.6, "trophyCradle", { face: 0 });
    } else if (index !== thirdIndex) {
      // Segundo lugar: perdeu na última; triste, depois aplaude o vencedor.
      if (finalist.isUser) plan.cue(RW + 0.08, "handsOnHips", { sad: true }).cue(RW + 1.3, "sadClap").cue(RW + 3, "applaud");
      else plan.cue(RW + 0.4, "sadClap").cue(RW + 2.6, "applaud");
    }

    // Na festa, os rivais viram um pouco para o vencedor ao aplaudir; o jogador
    // (se perdeu) continua de frente: o close final é no rosto dele.
    if (index !== firstIndex && !finalist.isUser) {
      const toward = yawTo(plan.restAt(celebrateStart), WINNER_SPOT);
      const delta = Math.atan2(Math.sin(toward - front), Math.cos(toward - front));
      plan.cue(celebrateStart + 0.4 + index * 0.2, "applaud", { face: front + delta * 0.42 });
    }
    if (index !== firstIndex && finalist.isUser) {
      // O jogador fica no meio do palco, bem na frente do lugar da entrega: tapava
      // a entrega e a câmera baixa da festa passava por dentro dele. Sai para o
      // lado que o vencedor deixou vago (fora do giro da câmera) e aplaude dali.
      const side = Math.sign(MARK_X[firstIndex]) || 1;
      userAside = { x: side * ASIDE_X, z: ASIDE_Z };
      plan.walk(celebrateStart + 0.1, [userAside], ASIDE_WALK, { face: side * 0.25 });
    }
    return plan;
  });

  // A plateia levanta para aplaudir o terceiro e de vez a partir do vencedor.
  const standing: Array<[number, number]> = [[R3 + 0.25, R3 + 3.6], [RW + 0.45, Infinity]];

  return {
    finalists: plans,
    presenter,
    standing,
    firstIndex,
    secondIndex,
    thirdIndex,
    userIndex,
    remaining,
    duelCuts: timeline.duelCuts.map((cut) => cut.focus === "presenter"
      ? { at: cut.at, focus: "presenter" as const, index: -1 }
      : { at: cut.at, focus: "finalist" as const, index: indexOf(cut.focus) }),
    pickAt,
    pickDone,
    handoffAt,
    handoffDone,
    liftAt,
    winnerWalkStart,
    winnerArrive,
    userAside,
    beats: {
      establishEnd,
      nominees,
      presenterStart,
      thirdStart,
      thirdReveal: R3,
      duelStart,
      revealStart,
      winnerReveal: RW,
      celebrateStart,
      reactionStart,
      endStart,
    },
  };
}

/** Palmas da plateia (0..1): sobe nos nomes e nas revelações. */
export function applauseAt(plan: StagePlan, time: number) {
  const beats = plan.beats;
  const burst = (at: number, hold: number, fade = 1.2) => {
    if (time < at) return 0;
    const t = time - at;
    return t < hold ? smooth01(t / 0.25) : Math.max(0, 1 - (t - hold) / fade);
  };
  let value = burst(0, 2.6, 1.6);
  for (const nominee of beats.nominees) value = Math.max(value, 0.65 * burst(nominee.start + 0.1, 1.3));
  value = Math.max(value, burst(beats.thirdReveal + 0.1, 2.8));
  if (time >= beats.winnerReveal + 0.1) {
    const t = time - beats.winnerReveal - 0.1;
    value = Math.max(value, t < 0.25 ? smooth01(t / 0.25) : time < beats.endStart ? 1 : Math.max(0.45, 1 - (time - beats.endStart) / 3));
  }
  return value;
}

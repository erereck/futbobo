// A seleção no alto do trio: os bonecos da partida (PlayerFigure) com o
// uniforme do país, dançando em revezamento, e o jogador com a taça.
//
// Tudo é função do relógio do roteiro (qual ação, para onde olha, quem está
// com a taça): pular para a frente só precisa de um "assenta" curto.

import * as THREE from "three";
import { FIGURE_ACTION_INFO, PlayerFigure, idleIntent, type FigureAction, type FigureIntent } from "../botao/three/character";
import { teamKitPattern } from "../player-appearance";
import { paradeBeatAt, type ParadeTimeline } from "./parade-script";

/** Frente do trio (+x) no padrão de yaw dos bonecos (atan2(dx, dz)). */
const FACE_FRONT = Math.PI / 2;

/** Revezamento dos companheiros: só ações em laço (as de uma vez só congelam na pose final). */
const TEAM_POOL: readonly string[] = ["dance", "jumpCheer", "flagDance", "fistPump", "clap", "pointSky", "robot", "wave", "heart", "applaud"];

function has(id: string): id is FigureAction {
  return Object.prototype.hasOwnProperty.call(FIGURE_ACTION_INFO, id);
}

function pick(id: string, fallback: FigureAction): FigureAction {
  return has(id) ? id : fallback;
}

/** Hash 0..1 estável (sem estado): escolhas por companheiro e por trecho. */
function hash(a: number, b: number) {
  const value = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453;
  return value - Math.floor(value);
}

type Mate = {
  figure: PlayerFigure;
  /** Lado do deck (+1 em z > 0, -1 em z < 0). */
  side: number;
  period: number;
  phase: number;
  first: number;
  step: number;
  intent: FigureIntent;
};

export type TeamUpdate = {
  /** Câmera em coordenadas do trio (o jogador olha para ela nos closes). */
  cameraLocal: THREE.Vector3;
  /** Depois de um salto no tempo: vira e assenta as poses na hora. */
  settle: boolean;
  /** Longe da câmera: atualiza em quadros alternados. */
  far: boolean;
};

export class ParadeTeam {
  readonly player: PlayerFigure;
  private readonly mates: Mate[] = [];
  private readonly playerIntent = idleIntent({ state: "celebrate", faceYaw: FACE_FRONT });
  private readonly pool: FigureAction[];
  private readonly lift: FigureAction;
  private readonly cradle: FigureAction | null;
  private readonly hasLift: boolean;
  private readonly look = { x: 0, z: 0 };
  private readonly handL: THREE.Object3D;
  private readonly handR: THREE.Object3D;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private skip = false;
  private carried = 0;
  /** Altura da taça como foi desenhada (m, antes da escala). */
  private readonly trophyHeight: number;
  /** Lado da avenida preferido pela câmera (+1 em z > 0): o jogador vira para ele nos closes. */
  private readonly side: number;

  constructor(
    private readonly parent: THREE.Group,
    readonly trophy: THREE.Group,
    private readonly timeline: ParadeTimeline,
    options: { slots: THREE.Vector3[]; scale: number; maxFigures: number; side: number },
  ) {
    const input = timeline.input;
    const primary = input.country.primary;
    const secondary = input.country.secondary;
    // Uniforme da seleção igual para todos (o visual do jogador pode vir com o padrão do clube).
    const kitPattern = teamKitPattern(input.seed, input.country.id);
    this.pool = TEAM_POOL.filter(has);
    if (!this.pool.length) this.pool.push("fistPump");
    this.hasLift = has("trophyLift");
    this.lift = pick("trophyLift", "pointSky");
    this.cradle = has("trophyCradle") ? "trophyCradle" : null;

    const slots = options.slots.length ? options.slots : [new THREE.Vector3(3, 4, 0)];
    const count = Math.max(1, Math.min(options.maxFigures, slots.length, input.teammates.length + 1));

    this.player = new PlayerFigure({
      appearance: { ...input.player.appearance, kitPattern },
      primary,
      secondary,
      number: input.player.number,
      captain: true,
      seed: input.seed % 9973 || 7,
      // A festa não tem mapa de sombra: ninguém projeta sombra.
      performance: true,
    });
    this.place(this.player, slots[0], options.scale);
    this.player.snapYaw(FACE_FRONT);
    // Contorno dourado de leve: o olho acha o jogador no meio do time.
    this.player.setHighlight(0.32, "#ffe08a");
    this.handL = this.player.handAnchor("left");
    this.handR = this.player.handAnchor("right");

    for (let index = 1; index < count; index += 1) {
      const mate = input.teammates[index - 1];
      const figure = new PlayerFigure({
        appearance: { ...mate.appearance, kitPattern },
        primary,
        secondary,
        number: mate.number,
        seed: (input.seed + index * 7919) % 99991,
        performance: true,
      });
      const slot = slots[index];
      this.place(figure, slot, options.scale);
      const side = slot.z > 0.2 ? 1 : slot.z < -0.2 ? -1 : index % 2 === 0 ? 1 : -1;
      const n = this.pool.length;
      this.mates.push({
        figure,
        side,
        period: 3 + hash(index, 1) * 1.8,
        phase: hash(index, 2) * 4,
        first: Math.floor(hash(index, 3) * n),
        // Passo de 1 a n-2 mais 0 ou 1: nunca repete a ação do trecho anterior.
        step: 1 + Math.floor(hash(index, 4) * Math.max(1, n - 2)),
        intent: idleIntent({ state: "celebrate", faceYaw: FACE_FRONT }),
      });
      figure.snapYaw(FACE_FRONT + side * -0.6);
    }

    // Ao lado da cabeçona do boneco de blocos, uma taça de tamanho real some:
    // ela entra com ~0,75 m, seja qual for o tamanho em que foi desenhada.
    const bounds = new THREE.Box3().setFromObject(trophy);
    const drawn = bounds.isEmpty() ? 0.37 : Math.max(0.1, bounds.max.y);
    trophy.scale.setScalar(Math.min(2.2, Math.max(1, 0.75 / drawn)));
    this.trophyHeight = drawn;
    this.side = options.side;
    trophy.visible = false;
    parent.add(trophy);
  }

  private place(figure: PlayerFigure, slot: THREE.Vector3, scale: number) {
    figure.root.position.copy(slot);
    figure.root.scale.setScalar(scale);
    // A sombra de contato (um quad transparente por boneco) não aparece no
    // deck iluminado e custaria um draw call a mais por boneco.
    for (const child of figure.root.children) {
      if (child instanceof THREE.Mesh && !(child instanceof THREE.SkinnedMesh)) child.visible = false;
    }
    this.parent.add(figure.root);
  }

  get figures(): PlayerFigure[] {
    return [this.player, ...this.mates.map((mate) => mate.figure)];
  }

  textures(): THREE.Texture[] {
    return this.figures.flatMap((figure) => figure.textureList());
  }

  /** Taça no ar (ou no colo) a partir do começo do beat "trophy". */
  holdsTrophy(time: number) {
    const beat = this.timeline.beats.find((item) => item.id === "trophy");
    return time >= (beat ? beat.start : this.timeline.trophyLiftAt - 0.6);
  }

  private playerAction(time: number): FigureAction {
    const tl = this.timeline;
    if (this.holdsTrophy(time)) {
      if (time < tl.trophyLiftAt && this.cradle) return this.cradle;
      return this.lift;
    }
    const beat = paradeBeatAt(tl, time);
    if (beat.id === "deck") {
      const u = (time - beat.start) / Math.max(0.001, beat.end - beat.start);
      // Primeira metade: dança com o time; no close, acena para a câmera e aponta o céu.
      if (u < 0.5) return pick("dance", "jumpCheer");
      if (u < 0.78) return pick("wave", "fistPump");
      return pick("pointSky", "fistPump");
    }
    const cycle: FigureAction[] = [pick("jumpCheer", "fistPump"), "fistPump", pick("wave", "clap")];
    return cycle[Math.floor(time / 2.6) % cycle.length];
  }

  private playerYaw(time: number, side: number) {
    const beat = paradeBeatAt(this.timeline, time);
    // Nos closes vira um pouco para o lado da câmera.
    if (beat.id === "deck") return FACE_FRONT - side * 0.32;
    // Com a taça, de frente: a câmera passa de um lado para o outro na frente dele.
    if (beat.id === "trophy") return FACE_FRONT - side * 0.08;
    if (beat.id === "crowd") return FACE_FRONT - side * 0.7;
    return FACE_FRONT;
  }

  private mateAction(mate: Mate, time: number): FigureAction {
    const tl = this.timeline;
    // A taça subiu: todo mundo aplaude virado para ele; no estouro, pula junto.
    if (time >= tl.trophyLiftAt && time < tl.burstAt) return pick("applaud", "clap");
    if (time >= tl.burstAt && time < tl.burstAt + 2.6) return pick("jumpCheer", "fistPump");
    const k = Math.floor((time + mate.phase) / mate.period);
    const n = this.pool.length;
    const index = (((mate.first + k * mate.step + Math.floor(hash(k, mate.first) * 2)) % n) + n) % n;
    return this.pool[index];
  }

  private mateYaw(mate: Mate, time: number) {
    const tl = this.timeline;
    if (time >= tl.trophyLiftAt && time < tl.burstAt + 2.6) {
      const dx = this.player.root.position.x - mate.figure.root.position.x;
      const dz = this.player.root.position.z - mate.figure.root.position.z;
      return Math.atan2(dx, dz);
    }
    const k = Math.floor((time + mate.phase * 0.7) / (mate.period * 1.3));
    const r = hash(k, mate.first + 17);
    // Frente, frente-lado ou de lado: sempre para o público do seu lado do trio.
    const turn = r < 0.3 ? 0.15 : r < 0.75 ? 0.75 : 1.35;
    return FACE_FRONT - mate.side * turn;
  }

  update(time: number, dt: number, state: TeamUpdate) {
    const settle = state.settle;
    // Longe, um quadro sim e outro não (o tempo pulado entra no seguinte).
    let step = Math.min(dt, 1 / 15);
    if (state.far && !settle) {
      this.skip = !this.skip;
      this.carried += step;
      if (this.skip) return;
      step = Math.min(this.carried, 1 / 10);
    }
    this.carried = 0;
    if (step <= 0 && !settle) return;

    const intent = this.playerIntent;
    intent.action = this.playerAction(time);
    intent.faceYaw = this.playerYaw(time, this.side);
    const beat = paradeBeatAt(this.timeline, time);
    if (beat.id === "deck" || beat.id === "trophy") {
      this.look.x = state.cameraLocal.x;
      this.look.z = state.cameraLocal.z;
      intent.look = this.look;
    } else intent.look = null;
    this.advance(this.player, intent, step, settle);

    for (const mate of this.mates) {
      mate.intent.action = this.mateAction(mate, time);
      mate.intent.faceYaw = this.mateYaw(mate, time);
      this.advance(mate.figure, mate.intent, step, settle);
    }
  }

  private advance(figure: PlayerFigure, intent: FigureIntent, step: number, settle: boolean) {
    if (settle) {
      if (intent.faceYaw !== null) figure.snapYaw(intent.faceYaw);
      // Duas passadas largas: os pesos das poses chegam quase no alvo.
      figure.update(0.25, intent);
      figure.update(0.25, intent);
      return;
    }
    figure.update(step, intent);
  }

  /**
   * Taça entre as mãos do jogador (coordenadas do trio), em pé. Sem a pose de
   * erguer, vai acima da cabeça. Devolve a posição do topo no mundo em `out`.
   */
  placeTrophy(time: number, out: THREE.Vector3): boolean {
    const trophy = this.trophy;
    const holding = this.holdsTrophy(time);
    trophy.visible = holding;
    if (!holding) return false;
    if (this.hasLift) {
      this.handL.getWorldPosition(this.a);
      this.handR.getWorldPosition(this.b);
      this.a.add(this.b).multiplyScalar(0.5);
      this.parent.worldToLocal(this.a);
      // No colo (mãos no peito) a taça desce para não tapar o rosto; lá em cima,
      // a base fica na palma.
      const lift = Math.min(1, Math.max(0, (this.a.y - this.player.root.position.y - 1.2) / 0.65));
      trophy.position.set(this.a.x, this.a.y - (0.5 - 0.47 * lift), this.a.z);
    } else {
      const root = this.player.root.position;
      trophy.position.set(root.x, root.y + 2.25, root.z);
    }
    trophy.rotation.y = this.player.yaw - FACE_FRONT;
    trophy.updateWorldMatrix(true, false);
    out.set(0, this.trophyHeight, 0).applyMatrix4(trophy.matrixWorld);
    return true;
  }

  dispose() {
    for (const figure of this.figures) {
      this.parent.remove(figure.root);
      figure.dispose();
    }
    this.parent.remove(this.trophy);
  }
}

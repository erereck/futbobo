// Os bonecos da partida (PlayerFigure do Modo 3D) em metros: um por ator,
// com o uniforme do time, o goleiro de cor própria, o herói com contorno
// dourado. Cada quadro traduz pose/velocidade/olhar do ator da simulação em
// intenção e ações do boneco (corrida, mira, chute, cabeceio, mergulho,
// comemoração, lamento).

import * as THREE from "three";
import {
  FIGURE_ACTION_INFO,
  FIGURE_HEIGHT,
  PlayerFigure,
  idleIntent,
  type FigureAction,
  type FigureIntent,
} from "../../botao/three/character";
import { teamKitPattern } from "../../player-appearance";
import type { Actor, GameState, ScoreTeams } from "../types";
import { clamp, clamp01, hashString } from "./util";

/** Boneco de 1,8 m (FIGURE_HEIGHT unidades de campo). */
export const FIGURE_SCALE = 1.8 / FIGURE_HEIGHT;
const UNITS = 1 / FIGURE_SCALE;

const KEEPER_COLORS = ["#c6ff3d", "#ff8c1a", "#8a5cff", "#20e0c0", "#ff4fa3"];
const HERO_RIM = "#ffd76a";
const RECEIVER_RIM = "#6ff3ff";
const MATE_RIM = "#d8fbff";

const TEAM_CHEERS: FigureAction[] = ["jumpCheer", "fistPump", "clap", "pointSky", "jumpCheer", "fistPump"];
const SADNESS: FigureAction[] = ["handsOnHead", "kneelSad", "handsOnHips", "handsOnHead", "disbelief"];

function isAction(id: string): id is FigureAction {
  return Object.prototype.hasOwnProperty.call(FIGURE_ACTION_INFO, id);
}

/** Id de CELEBRATION_OPTIONS (ou FigureAction direto) → ação do boneco. */
export function celebrationAction(id: string | undefined, seed: number): FigureAction {
  if (id === "cornerFlag") return "flagDance";
  if (id === "crest") return "crestKiss";
  if (id && id !== "auto" && isAction(id)) return id;
  const pool: FigureAction[] = ["kneeSlide", "siuu", "airplane", "pointSky", "fistPump", "backflip", "heart", "dance"];
  return pool[seed % pool.length];
}

function contrastKeeper(teams: ScoreTeams, seed: number) {
  const avoid = [teams.home.primary, teams.away.primary].map((hex) => new THREE.Color(hex));
  const scored = KEEPER_COLORS.map((hex, index) => {
    const color = new THREE.Color(hex);
    const distance = Math.min(...avoid.map((other) => Math.abs(color.r - other.r) + Math.abs(color.g - other.g) + Math.abs(color.b - other.b)));
    return { hex, score: distance + ((seed + index) % 5) * 0.01 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].hex;
}

type Entry = {
  actor: Actor;
  figure: PlayerFigure;
  intent: FigureIntent;
  lastPose: Actor["pose"] | null;
  lastX: number;
  lastZ: number;
  kickAge: number;
  /** Inclinação do cabeceio (rad, em volta do eixo lateral do boneco). */
  pitch: number;
  seed: number;
  receiving: boolean;
  /** Onde o boneco está desenhado (o herói na mira anda até o ponto dele em vez de pular). */
  drawX: number;
  drawZ: number;
};

export class Squad {
  readonly group = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private heroId = "";
  private receiverId: string | null = null;
  private readonly look = { x: 0, z: 0 };

  constructor(
    state: GameState,
    teams: ScoreTeams,
    private readonly performance: boolean,
    seed: number,
  ) {
    const homePattern = teamKitPattern(seed, teams.home.name);
    const awayPattern = teamKitPattern(seed, teams.away.name);
    const keeperColor = contrastKeeper(teams, seed);
    for (const actor of state.actors) {
      const team = actor.team === "home" ? teams.home : teams.away;
      const keeper = actor.role === "keeper";
      const figureSeed = (hashString(actor.id) ^ seed) % 99991 || 7;
      const figure = new PlayerFigure({
        appearance: { ...actor.appearance, kitPattern: actor.team === "home" ? homePattern : awayPattern },
        primary: team.primary,
        secondary: team.secondary,
        number: actor.number,
        keeper,
        keeperColor,
        captain: actor.role === "hero",
        seed: figureSeed,
        performance,
      });
      figure.root.scale.setScalar(FIGURE_SCALE);
      // Cabeceio inclina em volta do eixo lateral do próprio boneco (depois do yaw).
      figure.root.rotation.order = "YXZ";
      figure.root.position.set(actor.pos.x, 0, actor.pos.z);
      figure.snapYaw(actor.facing);
      this.group.add(figure.root);
      this.entries.set(actor.id, {
        actor,
        figure,
        intent: idleIntent(),
        lastPose: null,
        lastX: actor.pos.x,
        lastZ: actor.pos.z,
        kickAge: 9,
        pitch: 0,
        seed: figureSeed,
        receiving: false,
        drawX: actor.pos.x,
        drawZ: actor.pos.z,
      });
    }
  }

  textures(): THREE.Texture[] {
    return [...this.entries.values()].flatMap((entry) => entry.figure.textureList());
  }

  figureOf(id: string) {
    return this.entries.get(id)?.figure ?? null;
  }

  private readonly handL = new THREE.Vector3();
  private readonly handR = new THREE.Vector3();

  /**
   * Centro visual do boneco (entre as mãos e o pé, na altura do peito): no
   * mergulho o corpo sai de cima do ponto do ator, e o close tem de achá-lo.
   */
  centerOf(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    const figure = this.entries.get(id)?.figure;
    if (!figure) return null;
    figure.handAnchor("left").getWorldPosition(this.handL);
    figure.handAnchor("right").getWorldPosition(this.handR);
    const root = figure.root.position;
    out.addVectors(this.handL, this.handR).multiplyScalar(0.5);
    out.x = out.x * 0.6 + root.x * 0.4;
    out.z = out.z * 0.6 + root.z * 0.4;
    out.y = Math.max(0.45, Math.min(1.5, out.y + 0.3));
    return out;
  }

  /**
   * Corte no tempo (replay voltando, tentativa nova): o boneco não pode
   * continuar deitado do mergulho nem no meio de um chute de antes. Avança a
   * animação 1,6 s parado na pose de espera (mergulho termina e levanta).
   */
  settle(state: GameState) {
    for (const actor of state.actors) {
      const entry = this.entries.get(actor.id);
      if (!entry) continue;
      entry.lastPose = null;
      entry.kickAge = 9;
      entry.pitch = 0;
      entry.lastX = actor.pos.x;
      entry.lastZ = actor.pos.z;
      entry.drawX = actor.pos.x;
      entry.drawZ = actor.pos.z;
      const figure = entry.figure;
      figure.root.rotation.x = 0;
      figure.root.position.set(actor.pos.x, 0, actor.pos.z);
      figure.snapYaw(actor.facing);
      const intent = idleIntent({ state: actor.role === "keeper" ? "keeper" : "ready", faceYaw: actor.facing });
      for (let step = 0; step < 16; step += 1) figure.update(0.1, intent);
    }
  }

  /** Recebedor do passe em mira (contorno azul) ou null. */
  setReceiver(id: string | null) {
    this.receiverId = id;
  }

  /** O chute saiu agora (evento): garante o movimento da perna mesmo se a pose pulou. */
  kicked(actorId: string, power: number) {
    const entry = this.entries.get(actorId);
    if (!entry || entry.kickAge < 0.35) return;
    entry.figure.triggerKick(clamp(power, 0.45, 1), "strike");
    entry.kickAge = 0;
  }

  received(actorId: string) {
    const entry = this.entries.get(actorId);
    if (!entry || entry.kickAge < 0.25) return;
    entry.figure.triggerKick(0.6, "block");
    entry.kickAge = 0;
  }

  /**
   * `animDt`: tempo de jogo para os bonecos (câmera lenta incluída). `heroDt`:
   * o herói na mira anda no tempo real (a perna armando acompanha o traço).
   */
  update(state: GameState, animDt: number, heroDt: number, aimRatio: number) {
    this.heroId = state.heroId;
    const ball = state.ball.pos;
    for (const actor of state.actors) {
      const entry = this.entries.get(actor.id);
      if (!entry) continue;
      entry.actor = actor;
      const hero = actor.id === state.heroId;
      const dt = hero && state.phase === "aim" ? heroDt : animDt;
      this.drive(entry, actor, state, dt, hero ? aimRatio : 0, ball);
    }
  }

  private drive(entry: Entry, actor: Actor, state: GameState, dt: number, aimRatio: number, ball: { x: number; y: number; z: number }) {
    const figure = entry.figure;
    const root = figure.root;
    entry.kickAge += dt;
    // Salto grande num quadro (replay, nova tentativa): sem embalo velho.
    const jumped = Math.hypot(actor.pos.x - entry.lastX, actor.pos.z - entry.lastZ) > 2.5;
    if (jumped) {
      figure.snapYaw(actor.facing);
      entry.lastPose = null;
    }
    entry.lastX = actor.pos.x;
    entry.lastZ = actor.pos.z;

    const speedMs = Math.hypot(actor.vel.x, actor.vel.z);
    const heading = speedMs > 0.05 ? Math.atan2(actor.vel.x, actor.vel.z) : actor.facing;
    const lookAt = actor.look ?? ball;
    // Olhar em unidades do boneco: a distância conta para a inclinação da cabeça.
    this.look.x = actor.pos.x + (lookAt.x - actor.pos.x) * UNITS;
    this.look.z = actor.pos.z + (lookAt.z - actor.pos.z) * UNITS;
    const intent = entry.intent;
    intent.speed = speedMs * UNITS;
    intent.heading = heading;
    intent.faceYaw = actor.facing;
    intent.look = this.look;
    intent.aimRatio = 0;
    intent.dive = 0;
    intent.shuffle = 0;
    intent.action = null;

    const pose = actor.pose;
    const entered = pose !== entry.lastPose;
    entry.lastPose = pose;
    let lift = actor.jump ?? 0;
    let pitchTarget = 0;
    const moving = speedMs > 0.6;

    switch (pose) {
      case "idle":
        intent.state = moving ? "run" : "idle";
        break;
      case "ready":
        intent.state = moving ? "run" : "ready";
        break;
      case "run":
        intent.state = "run";
        break;
      case "aim":
        intent.state = "aim";
        intent.aimRatio = aimRatio;
        intent.look = null;
        break;
      case "kick":
      case "volley":
        intent.state = moving ? "run" : "ready";
        if (entered && entry.kickAge > 0.3) {
          figure.triggerKick(pose === "volley" ? 1 : 0.85, "strike");
          entry.kickAge = 0;
        }
        if (pose === "volley") {
          // De primeira no ar: o corpo deita para trás no golpe.
          lift = Math.max(lift, 0.25 * Math.sin(Math.PI * clamp01(actor.poseT)));
          pitchTarget = -0.28 * Math.sin(Math.PI * clamp01(actor.poseT));
        }
        break;
      case "header": {
        intent.state = "ready";
        const t = clamp01(actor.poseT);
        // Arma o pescoço para trás subindo e chicoteia para a frente no contato (~meio).
        pitchTarget = t < 0.5 ? -0.3 * Math.sin((t / 0.5) * Math.PI * 0.5) : 0.42 * Math.sin(((t - 0.5) / 0.5) * Math.PI);
        if (lift === 0) lift = 0.55 * Math.sin(Math.PI * t);
        break;
      }
      case "receive":
        intent.state = moving ? "run" : "ready";
        if (entered && entry.kickAge > 0.25) {
          figure.triggerKick(0.6, "block");
          entry.kickAge = 0;
        }
        break;
      case "wall":
        intent.state = "ready";
        intent.action = "nervous";
        break;
      case "jump":
        intent.state = "ready";
        intent.action = "nervous";
        if (lift === 0) lift = 0.45 * Math.sin(Math.PI * clamp01(actor.poseT));
        break;
      case "keeperReady":
        intent.state = "keeper";
        // Passinho lateral: velocidade no eixo lateral do goleiro (unidades/s).
        intent.shuffle = (actor.vel.x * Math.cos(actor.facing) - actor.vel.z * Math.sin(actor.facing)) * UNITS;
        break;
      case "dive": {
        intent.state = "keeper";
        const side = actor.dive?.side ?? 0;
        const height = actor.dive?.height ?? 0;
        // A simulação dá side = -dx/2,6 (dx = para onde vão as mãos, em x do
        // mundo); o dive +1 do boneco vai para o +x local dele, que no mundo é
        // cos(facing). Converte pelo mundo: vale para qualquer lado que ele olhe.
        const worldX = -Math.sign(side);
        const localSign = Math.sign(Math.cos(actor.facing)) || -1;
        intent.dive = side === 0 ? 0 : worldX * localSign * clamp(0.55 + Math.abs(side) * 0.45, 0.4, 1);
        lift = Math.max(lift, height * 1.1 * Math.sin(Math.PI * clamp01(actor.poseT * 1.15)));
        break;
      }
      case "keeperHold":
        intent.state = "ready";
        intent.action = "cradle";
        break;
      case "celebrate": {
        const own = actor.celebration ? celebrationAction(actor.celebration, entry.seed) : TEAM_CHEERS[entry.seed % TEAM_CHEERS.length];
        // Correndo para a festa: a ação de corpo inteiro espera ele parar.
        const full = FIGURE_ACTION_INFO[own]?.body === "full";
        if (moving && full) {
          intent.state = "run";
          intent.action = "airplane";
        } else {
          intent.state = moving ? "run" : "celebrate";
          intent.action = own;
        }
        intent.look = null;
        break;
      }
      case "dejected":
        intent.state = moving ? "run" : "sad";
        intent.action = moving ? "handsOnHead" : SADNESS[entry.seed % SADNESS.length];
        break;
      default:
        intent.state = "idle";
    }

    entry.pitch += (pitchTarget - entry.pitch) * (1 - Math.exp(-dt * 18));
    root.rotation.x = entry.pitch;
    // Na mira o herói gira em volta da bola seguindo o traço (e se ajeita ao
    // dominar): dá o passinho até lá em vez de teleportar.
    if (pose === "aim" && state.phase === "aim" && !jumped) {
      const k = 1 - Math.exp(-dt * 12);
      entry.drawX += (actor.pos.x - entry.drawX) * k;
      entry.drawZ += (actor.pos.z - entry.drawZ) * k;
    } else {
      entry.drawX = actor.pos.x;
      entry.drawZ = actor.pos.z;
    }
    root.position.set(entry.drawX, Math.max(0, lift), entry.drawZ);

    // Contorno: herói dourado na mira; recebedor do passe em azul.
    if (actor.id === this.heroId && (state.phase === "aim" || state.phase === "intro")) figure.setHighlight(0.42, HERO_RIM);
    else if (actor.id === this.receiverId && state.phase === "aim") figure.setHighlight(0.5, RECEIVER_RIM);
    // Companheiros com um contorno leve na mira: no meio dos zagueiros, quem é seu se lê de longe.
    else if (actor.role === "mate" && state.phase === "aim") figure.setHighlight(0.2, MATE_RIM);
    else figure.setHighlight(0);

    figure.update(Math.min(dt, 0.1), intent);
  }

  dispose() {
    for (const entry of this.entries.values()) entry.figure.dispose();
    this.entries.clear();
  }
}

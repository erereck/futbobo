// Goleiro: se posiciona na bissetriz do ângulo da bola com as traves, anda com
// a jogada e, no chute, reage com atraso (reflexo), lê a bola como se fosse
// reta (com um atraso de percepção — a curva tardia engana) e mergulha com
// alcance de verdade. O corpo vira cápsulas para a colisão com a bola.

import { PITCH, type Actor, type BallState, type Vec2, type Vec3 } from "../types";
import { lookAt, moveToward } from "./ai";
import { clamp, easeOut, lerp, yawOf, hypot } from "./math";
import { G } from "./physics";

export type Capsule = { a: Vec3; b: Vec3; r: number; part: "hands" | "body" | "legs" };

type Mode = "set" | "dive" | "hold" | "rush" | "down";

const GOAL_Z = PITCH.goalLineZ;
const LEFT_POST: Vec2 = { x: -PITCH.goalHalfWidth, z: GOAL_Z };
const RIGHT_POST: Vec2 = { x: PITCH.goalHalfWidth, z: GOAL_Z };
/** Atraso de percepção: ele lê a bola como estava há pouco. */
const PERCEPTION_LAG = 0.1;
/** Quanto de história ele guarda (para sentir a bola virando). */
const HISTORY = 0.22;
const SHUFFLE_SPEED = 3.4;
const NO_CAPSULES: Capsule[] = [];

const capsule = (r: number, part: Capsule["part"]): Capsule => ({ a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, r, part });
const set3 = (v: Vec3, x: number, y: number, z: number) => {
  v.x = x;
  v.y = y;
  v.z = z;
};

export class KeeperBrain {
  mode: Mode = "set";
  /** Instante (tempo de jogo) em que ele reage ao chute atual; null = sem chute. */
  reactAt: number | null = null;
  diveStart = 0;
  diveDur = 0.5;
  diveFrom: Vec2 = { x: 0, z: 0 };
  /** Mãos no fim do mergulho (x, y no plano dele). */
  diveHands = { x: 0, y: 1.2 };
  /** Previsão em uso (x, y no plano dele, t até cruzar). */
  predicted: { x: number; y: number; tc: number; ax: number } | null = null;
  rushTarget: Vec2 | null = null;
  /** Posição combinada da cobrança (falta): ele fica nela até a bola sair. */
  anchor: Vec2 | null = null;
  holdT = 0;
  private history: Array<{ t: number; pos: Vec3; vel: Vec3 }> = [];
  readonly reach: number;
  readonly reaction: number;

  constructor(readonly actor: Actor, readonly skill: number, jitter: number) {
    this.reach = 2.25 + 0.6 * skill;
    this.reaction = clamp(lerp(0.42, 0.2, skill) + jitter * 0.03, 0.17, 0.46);
  }

  reset() {
    this.mode = "set";
    this.reactAt = null;
    this.predicted = null;
    this.rushTarget = null;
    this.history = [];
    this.holdT = 0;
    this.actor.dive = undefined;
    this.actor.pose = "keeperReady";
    this.actor.poseT = 0;
  }

  /** Onde ele quer ficar com a bola em `ball`: na bissetriz, saindo mais quanto mais perto ela está. */
  static basePosition(ball: Vec2, skill: number, rushing = false): Vec2 {
    const toL = { x: LEFT_POST.x - ball.x, z: LEFT_POST.z - ball.z };
    const toR = { x: RIGHT_POST.x - ball.x, z: RIGHT_POST.z - ball.z };
    const lL = hypot(toL.x, toL.z) || 1;
    const lR = hypot(toR.x, toR.z) || 1;
    const bis = { x: toL.x / lL + toR.x / lR, z: toL.z / lL + toR.z / lR };
    const dist = hypot(ball.x, GOAL_Z - ball.z);
    let depth = clamp(0.6 + 0.07 * (28 - dist), 0.6, 2.2) + 0.15 * skill;
    if (rushing && dist < 14) depth = clamp(dist * 0.42, depth, 5);
    const z = GOAL_Z - depth;
    // Interseção da bissetriz com a linha z; bola quase na linha de fundo cai no poste.
    let x = Math.abs(bis.z) > 0.08 ? ball.x + ((z - ball.z) * bis.x) / bis.z : Math.sign(ball.x) * 3;
    x = clamp(x, -PITCH.goalHalfWidth + 0.5, PITCH.goalHalfWidth - 0.5);
    return { x, z };
  }

  /** Chute a gol saiu agora. */
  /** `screened`: a barreira tapa a visão (reage mais tarde). */
  onShot(time: number, screened = false) {
    if (this.mode === "hold") return;
    this.reactAt = time + this.reaction + (screened ? 0.12 : 0);
    this.anchor = null;
    this.predicted = null;
    if (this.mode === "rush") this.mode = "set";
  }

  /** Vai sair para pegar um passe em `target`. */
  rush(target: Vec2) {
    if (this.mode !== "set") return;
    this.mode = "rush";
    this.rushTarget = { ...target };
  }

  record(time: number, ball: BallState) {
    this.history.push({ t: time, pos: { ...ball.pos }, vel: { ...ball.vel } });
    while (this.history.length > 2 && this.history[1].t <= time - HISTORY) this.history.shift();
  }

  private perceived(time: number) {
    for (const h of this.history) if (h.t >= time - PERCEPTION_LAG) return h;
    return this.history[this.history.length - 1] ?? null;
  }

  /** Tempo de mergulho até esticar `dist` metros. */
  private diveTime(dist: number) {
    return clamp(0.36 + 0.08 * dist - 0.07 * this.skill, 0.34, 0.66);
  }

  /** Um passo de IA. `ballFree`: a bola não está em posse de ninguém. */
  update(dt: number, time: number, ball: BallState, ballFree: boolean, shotLive: boolean) {
    const a = this.actor;
    const ballXZ = { x: ball.pos.x, z: ball.pos.z };
    lookAt(a, ball.pos.x, ball.pos.y, ball.pos.z);
    if (this.mode === "hold") {
      this.holdT += dt;
      a.vel = { x: 0, z: 0 };
      if (a.pose === "dive") {
        a.poseT = Math.min(1, a.poseT + dt / Math.max(0.2, this.diveDur));
        if (a.poseT >= 1 && this.holdT > 0.35) {
          a.pose = "keeperHold";
          a.poseT = 0;
          a.dive = undefined;
        }
      } else {
        a.pose = "keeperHold";
        a.poseT = Math.min(1, a.poseT + dt * 2);
      }
      return;
    }
    if (this.mode === "dive" || this.mode === "down") {
      const u = clamp((time - this.diveStart) / this.diveDur, 0, 1);
      // Ajuste fino das mãos no ar (quanto melhor, mais corrige).
      if (this.mode === "dive" && shotLive && u < 0.85) {
        const p = this.predictCrossing(time);
        if (p) {
          const adj = 0.06 + 0.12 * this.skill;
          this.diveHands.x += clamp(p.x - this.diveHands.x, -adj, adj) * dt * 6;
          this.diveHands.y += clamp(p.y - this.diveHands.y, -adj, adj) * dt * 6;
          this.clampHands();
        }
      }
      a.pose = "dive";
      a.poseT = u;
      const e = easeOut(u);
      a.pos.x = this.diveFrom.x + (this.diveHands.x - this.diveFrom.x) * 0.5 * e;
      a.pos.z = this.diveFrom.z + 0.25 * e;
      a.vel = { x: ((this.diveHands.x - this.diveFrom.x) * 0.5) / this.diveDur, z: 0 };
      const dx = this.diveHands.x - this.diveFrom.x;
      // fromX/handX/handY/dur só descrevem o mergulho para a cena (as mãos das cápsulas): nada aqui lê.
      a.dive = {
        side: -clamp(dx / 2.6, -1, 1),
        height: clamp(this.diveHands.y / PITCH.goalHeight, 0, 1),
        fromX: this.diveFrom.x,
        handX: this.diveHands.x,
        handY: this.diveHands.y,
        dur: this.diveDur,
      };
      if (u >= 1) {
        this.mode = "down";
        a.vel = { x: 0, z: 0 };
      }
      return;
    }

    // Em pé: posição base, corrida para cortar um passe ou passinho lateral no chute.
    let target = this.anchor && !ballFree ? this.anchor : KeeperBrain.basePosition(ballXZ, this.skill, !shotLive && ballFree === false);
    let speed = 4.2;
    let dove = false;
    if (this.mode === "rush" && this.rushTarget) {
      target = this.rushTarget;
      speed = 6.6;
    }
    if (shotLive && this.reactAt !== null) {
      if (time < this.reactAt) {
        // Ainda não leu o chute: fica plantado (base, peso nos dedos).
        target = { ...a.pos };
        speed = 0;
      } else {
        const p = this.predictCrossing(time);
        if (p) {
          this.predicted = p;
          const onTarget = Math.abs(p.x) < PITCH.goalHalfWidth + 0.45 && p.y < PITCH.goalHeight + 0.35 && p.y > -0.5;
          const reachX = p.x - a.pos.x;
          const reachY = p.y - 1.15;
          const need = hypot(reachX, reachY);
          if (onTarget) {
            const tNeed = need < 0.75 ? 0.12 : this.diveTime(need) * 0.8;
            if (p.tc <= tNeed + 0.04) {
              if (need >= 0.75) {
                this.startDive(time, p.x, p.y);
                dove = true;
              } else this.standSave(p.x, p.y);
            } else {
              target = { x: clamp(p.x, -PITCH.goalHalfWidth, PITCH.goalHalfWidth), z: a.pos.z };
              speed = SHUFFLE_SPEED;
            }
          } else if (Math.abs(p.x) < PITCH.goalHalfWidth + 2.5 && p.y < PITCH.goalHeight + 0.6 && p.ax * p.x < 0) {
            // Parece que vai para fora, mas está virando para dentro: ele fecha o
            // canto (a banana de fora para dentro não ganha só por sair torta).
            target = { x: Math.sign(p.x) * (PITCH.goalHalfWidth - 0.45), z: a.pos.z };
            speed = SHUFFLE_SPEED;
          } else {
            // Parece que vai para fora: ele fica (só inclina para aquele lado).
            target = { x: a.pos.x + Math.sign(p.x - a.pos.x) * 0.4, z: a.pos.z };
            speed = 0.7;
          }
        }
      }
    }
    if (dove) return;
    // Aceleração limitada e freada na chegada: o passinho não teleporta nem passa do ponto.
    moveToward(a, target, speed, dt, null, 14);
    a.pos.z = Math.min(a.pos.z, GOAL_Z - 0.15);
    a.facing = yawOf({ x: ball.pos.x - a.pos.x, z: ball.pos.z - a.pos.z });
    a.pose = "keeperReady";
    a.poseT = clamp(hypot(a.vel.x, a.vel.z) / 4, 0, 1);
  }

  /**
   * Para onde a bola parece ir: o que ele viu (atrasado), com a gravidade e a
   * curva. A curva vem do giro da direção da bola (não da aceleração em x, que
   * o arrasto confunde) e ele prevê que ela aperta no fim, como a bola com
   * efeito faz ao perder velocidade: o bom lê quase toda, o fraco um terço.
   */
  private predictCrossing(time: number) {
    const seen = this.perceived(time);
    if (!seen) return null;
    const planeZ = this.actor.pos.z;
    const vz = seen.vel.z;
    if (vz < 1) return null;
    const straight = (planeZ - seen.pos.z) / vz;
    if (straight < -0.05) return null;
    const vx = seen.vel.x;
    const sp = hypot(vx, vz);
    let omega = 0;
    const older = this.history[0];
    if (older && seen.t - older.t > 0.03) {
      const dt = seen.t - older.t;
      const ax = (vx - older.vel.x) / dt;
      const az = (vz - older.vel.z) / dt;
      omega = (vx * az - vz * ax) / Math.max(1, sp * sp);
    }
    const readCurve = clamp(0.15 + this.skill * 0.75, 0.3, 0.75);
    // Anda pela curva em passos até cruzar o plano dele.
    let x = seen.pos.x;
    let z = seen.pos.z;
    let hx = vx / sp;
    let hz = vz / sp;
    let tc = 0;
    const step = 1 / 60;
    while (z < planeZ && tc < 2.5 && hz > 0.05) {
      const w = omega * readCurve * (1 + 1.0 * tc) * step;
      const c = Math.cos(w);
      const sn = Math.sin(w);
      // Giro no sentido de x para z (o mesmo do produto v × a).
      const nx = hx * c - hz * sn;
      hz = hx * sn + hz * c;
      hx = nx;
      const v = sp / (1 + 0.0125 * sp * tc);
      x += hx * v * step;
      z += hz * v * step;
      tc += step;
    }
    if (z < planeZ) tc = straight;
    const y = Math.max(0.1, seen.pos.y + seen.vel.y * tc - (G * tc * tc) / 2);
    // Sinal da curva em x (para fora/para dentro): o giro empurra a bola para o lado do produto.
    const ax = -omega * sp * Math.sign(vz);
    // tc do instante atual (ele viu a bola PERCEPTION_LAG atrás).
    return { x, y, tc: tc - (time - seen.t), ax };
  }

  private clampHands() {
    const cx = this.diveFrom.x;
    const cy = 1.15;
    const dx = this.diveHands.x - cx;
    const dy = this.diveHands.y - cy;
    const l = hypot(dx, dy);
    if (l > this.reach) {
      this.diveHands.x = cx + (dx / l) * this.reach;
      this.diveHands.y = cy + (dy / l) * this.reach;
    }
    this.diveHands.y = clamp(this.diveHands.y, 0.12, 2.75);
  }

  private startDive(time: number, x: number, y: number) {
    const a = this.actor;
    this.mode = "dive";
    this.diveStart = time;
    this.diveFrom = { x: a.pos.x, z: a.pos.z };
    this.diveHands = { x, y };
    this.clampHands();
    this.diveDur = this.diveTime(hypot(this.diveHands.x - a.pos.x, this.diveHands.y - 1.15));
    a.pose = "dive";
    a.poseT = 0;
  }

  /** Bola em cima dele: só ajeita as mãos (sem mergulho). */
  private standSave(x: number, y: number) {
    const a = this.actor;
    this.diveHands = { x: clamp(x, a.pos.x - 0.75, a.pos.x + 0.75), y: clamp(y, 0.15, 2.45) };
  }

  // Cápsulas reaproveitadas: capsules() reescreve os valores a cada chamada (quem usa só lê na hora).
  private readonly diveCaps: Capsule[] = [capsule(0.15, "hands"), capsule(0.22, "body")];
  private readonly standCaps: Capsule[] = [capsule(0.27, "body"), capsule(0.12, "hands"), capsule(0.13, "hands")];

  /** Corpo para a colisão com a bola agora (válido até a próxima chamada). */
  capsules(time: number): Capsule[] {
    const a = this.actor;
    const z = a.pos.z;
    if (this.mode === "dive" || this.mode === "down") {
      const u = clamp((time - this.diveStart) / this.diveDur, 0, 1);
      const e = easeOut(u);
      const fx = this.diveFrom.x;
      const hx = lerp(fx, this.diveHands.x, e);
      const hy = lerp(1.25, this.diveHands.y, e);
      const hipX = lerp(fx, fx + (this.diveHands.x - fx) * 0.5, e);
      const hipY = lerp(0.95, Math.max(0.32, this.diveHands.y * 0.62), e);
      const footX = lerp(fx, fx + (this.diveHands.x - fx) * 0.08, e);
      const footY = lerp(0.12, 0.28, e);
      const arms = this.diveCaps[0];
      const body = this.diveCaps[1];
      set3(arms.a, hipX, hipY, z);
      set3(arms.b, hx, hy, z - 0.05);
      set3(body.a, footX, footY, z);
      set3(body.b, hipX, hipY, z);
      return this.diveCaps;
    }
    if (this.mode === "hold") return NO_CAPSULES;
    const aimed = this.predicted && this.reactAt !== null;
    const handsX = aimed ? this.diveHands.x : a.pos.x;
    const handsY = aimed ? this.diveHands.y : 1.2;
    const handX = clamp(handsX, a.pos.x - 0.75, a.pos.x + 0.75);
    const body = this.standCaps[0];
    const bar = this.standCaps[1];
    const reach = this.standCaps[2];
    set3(body.a, a.pos.x, 0.15, z);
    set3(body.b, a.pos.x, 1.7, z);
    set3(bar.a, a.pos.x - 0.55, 1.12, z - 0.12);
    set3(bar.b, a.pos.x + 0.55, 1.12, z - 0.12);
    set3(reach.a, a.pos.x, 1.45, z - 0.08);
    set3(reach.b, handX, clamp(handsY, 0.2, 2.45), z - 0.12);
    return this.standCaps;
  }

  /** O quanto ele está esticado (0 parado .. 1 mergulho no limite). */
  stretch() {
    if (this.mode !== "dive" && this.mode !== "down") return 0;
    return clamp(hypot(this.diveHands.x - this.diveFrom.x, this.diveHands.y - 1.15) / this.reach, 0, 1);
  }

  /** Mãos (para a bola presa nelas). */
  handsPoint(time: number): Vec3 {
    const caps = this.capsules(time);
    const a = this.actor;
    if (caps.length && (this.mode === "dive" || this.mode === "down")) return { ...caps[0].b, y: Math.max(0.2, caps[0].b.y) };
    const yaw = a.facing;
    return { x: a.pos.x + Math.sin(yaw) * 0.32, y: 1.05, z: a.pos.z + Math.cos(yaw) * 0.32 };
  }

  catchBall(time: number) {
    void time;
    this.mode = "hold";
    this.holdT = 0;
    this.reactAt = null;
  }

  /** Depois de espalmar: fica no chão (ou em pé, se nem mergulhou). */
  afterParry() {
    if (this.mode === "set" || this.mode === "rush") this.mode = "set";
    this.reactAt = null;
  }
}

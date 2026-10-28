// Gravação e replay: fotos do estado a cada passo fixo (120 Hz de tempo de
// jogo) desde o primeiro toque da tentativa; o replay toca trechos em câmera
// lenta com ângulos de câmera sugeridos.

import type { Actor, ActorPose, BallState, SimEvent, Vec2, Vec3 } from "../types";
import { angleDelta, lerp } from "./math";

type ActorShot = {
  pos: Vec2;
  vel: Vec2;
  facing: number;
  pose: ActorPose;
  poseT: number;
  role: Actor["role"];
  dive?: { side: number; height: number };
  jump?: number;
  celebration?: string;
  look?: Vec3 | null;
};

type Snapshot = {
  t: number;
  ball: { pos: Vec3; vel: Vec3; spin: Vec3; owner: string | null; inNet: boolean };
  actors: ActorShot[];
};

/** Um trecho do replay: de `from` a `to` (tempo de jogo), na velocidade `rate`, com câmera `angle`. */
export type ReplaySegment = { from: number; to: number; rate: number; angle: number; slow?: { at: number; rate: number; span: number } };

/** Eventos que voltam a tocar no replay (som, rede): os de placar não. */
const REPLAY_EVENTS = new Set<SimEvent["type"]>(["kick", "post", "net", "save", "receive"]);

export class Recorder {
  snaps: Snapshot[] = [];
  events: SimEvent[] = [];

  clear() {
    this.snaps = [];
    this.events = [];
  }

  record(t: number, ball: BallState, actors: Actor[]) {
    this.snaps.push({
      t,
      ball: { pos: { ...ball.pos }, vel: { ...ball.vel }, spin: { ...ball.spin }, owner: ball.owner, inNet: ball.inNet },
      actors: actors.map((a) => ({
        pos: { ...a.pos },
        vel: { ...a.vel },
        facing: a.facing,
        pose: a.pose,
        poseT: a.poseT,
        role: a.role,
        dive: a.dive ? { ...a.dive } : undefined,
        jump: a.jump,
        celebration: a.celebration,
        look: a.look ? { ...a.look } : null,
      })),
    });
  }

  event(e: SimEvent) {
    if (REPLAY_EVENTS.has(e.type)) this.events.push(e);
  }

  get start() {
    return this.snaps[0]?.t ?? 0;
  }

  get end() {
    return this.snaps[this.snaps.length - 1]?.t ?? 0;
  }

  /** Aplica o instante `t` (interpolado) sobre os atores e a bola. */
  apply(t: number, actors: Actor[], ball: BallState) {
    const snaps = this.snaps;
    if (!snaps.length) return;
    let lo = 0;
    let hi = snaps.length - 1;
    if (t <= snaps[0].t) hi = 0;
    else if (t >= snaps[hi].t) lo = hi;
    else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (snaps[mid].t <= t) lo = mid;
        else hi = mid;
      }
    }
    const a = snaps[lo];
    const b = snaps[hi];
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    const near = k < 0.5 ? a : b;
    ball.pos = mix3(a.ball.pos, b.ball.pos, k);
    ball.vel = mix3(a.ball.vel, b.ball.vel, k);
    ball.spin = mix3(a.ball.spin, b.ball.spin, k);
    ball.owner = near.ball.owner;
    ball.inNet = near.ball.inNet;
    actors.forEach((actor, i) => {
      const sa = a.actors[i];
      const sb = b.actors[i];
      if (!sa || !sb) return;
      const sn = k < 0.5 ? sa : sb;
      actor.pos = { x: lerp(sa.pos.x, sb.pos.x, k), z: lerp(sa.pos.z, sb.pos.z, k) };
      actor.vel = { x: lerp(sa.vel.x, sb.vel.x, k), z: lerp(sa.vel.z, sb.vel.z, k) };
      actor.facing = sa.facing + angleDelta(sa.facing, sb.facing) * k;
      actor.pose = sn.pose;
      actor.role = sn.role;
      actor.poseT = sa.pose === sb.pose ? lerp(sa.poseT, sb.poseT, k) : sn.poseT;
      actor.dive = sn.dive ? { ...sn.dive } : undefined;
      actor.jump = lerp(sa.jump ?? 0, sb.jump ?? 0, k);
      actor.celebration = sn.celebration;
      actor.look = sn.look ? { ...sn.look } : null;
    });
  }

  /** Eventos gravados em (from, to]. */
  eventsBetween(from: number, to: number) {
    return this.events.filter((e) => e.t > from && e.t <= to);
  }
}

function mix3(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) };
}

/** Toca uma lista de trechos; `advance` devolve o tempo de jogo a mostrar (ou null no fim). */
export class ReplayPlayer {
  private index = 0;
  private local = 0;
  private elapsed = 0;
  readonly total: number;

  constructor(readonly segments: ReplaySegment[]) {
    this.total = segments.reduce((sum, s) => sum + segmentDuration(s), 0);
  }

  get angle() {
    return this.segments[Math.min(this.index, this.segments.length - 1)]?.angle ?? 0;
  }

  get progress() {
    return this.total > 0 ? Math.min(1, this.elapsed / this.total) : 1;
  }

  get done() {
    return this.index >= this.segments.length;
  }

  /** Tempo de jogo atual (início do trecho + avanço). */
  get time() {
    const seg = this.segments[Math.min(this.index, this.segments.length - 1)];
    return seg ? Math.min(seg.to, seg.from + this.local) : 0;
  }

  /** Avança `dt` reais. Devolve se trocou de trecho (corte de câmera). */
  advance(dt: number) {
    if (this.done) return false;
    this.elapsed += dt;
    const seg = this.segments[this.index];
    const t = seg.from + this.local;
    this.local += dt * rateAt(seg, t);
    if (seg.from + this.local >= seg.to) {
      this.index += 1;
      this.local = 0;
      return true;
    }
    return false;
  }
}

function rateAt(seg: ReplaySegment, t: number) {
  if (!seg.slow) return seg.rate;
  const d = Math.abs(t - seg.slow.at);
  if (d >= seg.slow.span) return seg.rate;
  // Entra e sai da câmera mais lenta suavemente.
  const k = 0.5 + 0.5 * Math.cos((Math.PI * d) / seg.slow.span);
  return lerp(seg.rate, seg.slow.rate, k);
}

function segmentDuration(seg: ReplaySegment) {
  // Integra a duração real do trecho (a velocidade muda perto do lance).
  let real = 0;
  const step = 1 / 240;
  for (let t = seg.from; t < seg.to; t += step * rateAt(seg, t)) real += step;
  return real;
}

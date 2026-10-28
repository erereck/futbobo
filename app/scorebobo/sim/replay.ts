// Gravação e replay: fotos do estado a cada passo fixo (120 Hz de tempo de
// jogo) desde o primeiro toque da tentativa; o replay toca trechos em câmera
// lenta com ângulos de câmera sugeridos.

import type { Actor, ActorPose, BallState, SimEvent, Vec3 } from "../types";
import { angleDelta, lerp } from "./math";

// Cada foto é uma linha de números num Float64Array só (os doubles voltam exatos):
// t, bola (pos, vel, spin) e, por ator, pos x/z, vel x/z, facing, poseT, jump e look x/y/z.
// O que não é número fica em listas paralelas (por foto, e por foto × ator).
const HEAD = 10;
const PER_ACTOR = 10;

/** Um trecho do replay: de `from` a `to` (tempo de jogo), na velocidade `rate`, com câmera `angle`. */
export type ReplaySegment = { from: number; to: number; rate: number; angle: number; slow?: { at: number; rate: number; span: number } };

/** Eventos que voltam a tocar no replay (som, rede): os de placar não. */
const REPLAY_EVENTS = new Set<SimEvent["type"]>(["kick", "post", "net", "save", "receive"]);

export class Recorder {
  events: SimEvent[] = [];
  /** Fotos gravadas (o buffer cresce dobrando e é reaproveitado entre tentativas). */
  private count = 0;
  private data = new Float64Array(0);
  private stride = HEAD;
  /** Atores por foto: a lista do lance não muda depois do primeiro toque. */
  private actorCount = 0;
  private owners: Array<string | null> = [];
  private inNet: boolean[] = [];
  private poses: ActorPose[] = [];
  private roles: Array<Actor["role"]> = [];
  private dives: Array<{ side: number; height: number } | undefined> = [];
  private celebrations: Array<string | undefined> = [];
  private looks: boolean[] = [];

  clear() {
    this.count = 0;
    this.events = [];
    this.owners.length = 0;
    this.inNet.length = 0;
    this.poses.length = 0;
    this.roles.length = 0;
    this.dives.length = 0;
    this.celebrations.length = 0;
    this.looks.length = 0;
  }

  get length() {
    return this.count;
  }

  record(t: number, ball: BallState, actors: Actor[]) {
    if (this.count === 0) {
      this.actorCount = actors.length;
      this.stride = HEAD + PER_ACTOR * actors.length;
    }
    const stride = this.stride;
    if ((this.count + 1) * stride > this.data.length) {
      const grown = new Float64Array(Math.max(stride * 256, this.data.length * 2, (this.count + 1) * stride));
      grown.set(this.data.subarray(0, this.count * stride));
      this.data = grown;
    }
    const d = this.data;
    let o = this.count * stride;
    d[o] = t;
    d[o + 1] = ball.pos.x;
    d[o + 2] = ball.pos.y;
    d[o + 3] = ball.pos.z;
    d[o + 4] = ball.vel.x;
    d[o + 5] = ball.vel.y;
    d[o + 6] = ball.vel.z;
    d[o + 7] = ball.spin.x;
    d[o + 8] = ball.spin.y;
    d[o + 9] = ball.spin.z;
    this.owners.push(ball.owner);
    this.inNet.push(ball.inNet);
    o += HEAD;
    for (let i = 0; i < this.actorCount; i += 1) {
      const a = actors[i];
      const look = a.look;
      d[o] = a.pos.x;
      d[o + 1] = a.pos.z;
      d[o + 2] = a.vel.x;
      d[o + 3] = a.vel.z;
      d[o + 4] = a.facing;
      d[o + 5] = a.poseT;
      // Sem salto = 0 (o replay sempre leu `jump ?? 0`).
      d[o + 6] = a.jump ?? 0;
      d[o + 7] = look ? look.x : 0;
      d[o + 8] = look ? look.y : 0;
      d[o + 9] = look ? look.z : 0;
      this.looks.push(!!look);
      this.poses.push(a.pose);
      this.roles.push(a.role);
      this.dives.push(a.dive ? { ...a.dive } : undefined);
      this.celebrations.push(a.celebration);
      o += PER_ACTOR;
    }
    this.count += 1;
  }

  event(e: SimEvent) {
    if (REPLAY_EVENTS.has(e.type)) this.events.push(e);
  }

  get start() {
    return this.count ? this.data[0] : 0;
  }

  get end() {
    return this.count ? this.data[(this.count - 1) * this.stride] : 0;
  }

  /** Aplica o instante `t` (interpolado) sobre os atores e a bola. */
  apply(t: number, actors: Actor[], ball: BallState) {
    const n = this.count;
    if (!n) return;
    const d = this.data;
    const stride = this.stride;
    let lo = 0;
    let hi = n - 1;
    if (t <= d[0]) hi = 0;
    else if (t >= d[hi * stride]) lo = hi;
    else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (d[mid * stride] <= t) lo = mid;
        else hi = mid;
      }
    }
    const a = lo * stride;
    const b = hi * stride;
    const k = d[b] > d[a] ? (t - d[a]) / (d[b] - d[a]) : 0;
    const near = k < 0.5 ? lo : hi;
    ball.pos = mix3(d, a + 1, b + 1, k);
    ball.vel = mix3(d, a + 4, b + 4, k);
    ball.spin = mix3(d, a + 7, b + 7, k);
    ball.owner = this.owners[near];
    ball.inNet = this.inNet[near];
    const count = this.actorCount;
    actors.forEach((actor, i) => {
      if (i >= count) return;
      const oa = a + HEAD + i * PER_ACTOR;
      const ob = b + HEAD + i * PER_ACTOR;
      const on = k < 0.5 ? oa : ob;
      const ia = lo * count + i;
      const ib = hi * count + i;
      const sn = k < 0.5 ? ia : ib;
      actor.pos = { x: lerp(d[oa], d[ob], k), z: lerp(d[oa + 1], d[ob + 1], k) };
      actor.vel = { x: lerp(d[oa + 2], d[ob + 2], k), z: lerp(d[oa + 3], d[ob + 3], k) };
      actor.facing = d[oa + 4] + angleDelta(d[oa + 4], d[ob + 4]) * k;
      actor.pose = this.poses[sn];
      actor.role = this.roles[sn];
      actor.poseT = this.poses[ia] === this.poses[ib] ? lerp(d[oa + 5], d[ob + 5], k) : d[on + 5];
      const dive = this.dives[sn];
      actor.dive = dive ? { ...dive } : undefined;
      actor.jump = lerp(d[oa + 6], d[ob + 6], k);
      actor.celebration = this.celebrations[sn];
      actor.look = this.looks[sn] ? { x: d[on + 7], y: d[on + 8], z: d[on + 9] } : null;
    });
  }

  /** Eventos gravados em (from, to]. */
  eventsBetween(from: number, to: number) {
    return this.events.filter((e) => e.t > from && e.t <= to);
  }
}

/** Mistura os Vec3 que começam em `a` e `b` no buffer. */
function mix3(d: Float64Array, a: number, b: number, k: number): Vec3 {
  return { x: lerp(d[a], d[b], k), y: lerp(d[a + 1], d[b + 1], k), z: lerp(d[a + 2], d[b + 2], k) };
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

// Leitura do traço: o desenho do jogador vira um plano de chute (KickPlan).
//
// - Começo: perto da bola (a interface garante; mesmo assim pontos iniciais
//   longe dela são ignorados, e também a pausa antes de começar a arrastar).
// - Fim no gol (projeção no plano da linha do gol perto da boca, ou o caminho
//   no chão chegando na linha) = chute; o alvo é onde o traço termina no gol
//   (a altura vem daí). Fim perto de um companheiro (ou da corrida dele) =
//   passe; senão, bola no espaço para quem chegar primeiro.
// - Curva: desvio máximo (com sinal) do caminho suavizado em relação à corda.
// - Força: velocidade do traço na tela, normalizada pela altura da tela, numa
//   escala logarítmica (o "peteleco" natural do celular é um chute forte e
//   ainda preciso; só a pancada exagerada perde precisão; devagar = fraco).
// - Defesa: o plano prevê onde cada zagueiro vai estar quando a bola passar
//   (a pressão anda durante a preparação) e marca os trechos que ele alcança
//   (`danger`); o passe sobe por cima deles quando dá.

import { PITCH, type KickKind, type KickPlan, type StrokeSample, type Vec2, type Vec3 } from "../types";
import { clamp, closestOnSegment2, dist2, lerp, norm2, norm2To, right2, hypot } from "./math";
import { DEFENDER_SPEED, HEAD_Y, JUMP_MAX, RUN_SPEED, SPRINT_SPEED, runPositionAfter, type MateBrain } from "./ai";
import { apexOf, designFlight, flightGeometry, flightPos, groundSpeedFor, previewOf, type Flight, type FlightSpec } from "./flight";
import { R } from "./physics";

/** O que o plano sabe de cada adversário (posição, embalo e o que ele vai fazer). */
export type DefenderSight = {
  id: string;
  pos: Vec2;
  vel: Vec2;
  behavior: "hold" | "press" | "wall" | "markNearest" | "keeper";
  /** Quem ele marca (markNearest). */
  mark?: string | null;
  /** Onde ele guarda a linha (hold). */
  home?: Vec2;
};

export type StrokeContext = {
  ball: Vec3;
  heroId: string;
  /** Bola parada no ar para o herói: o próximo toque é cabeceio ou voleio. */
  aerial: "header" | "volley" | null;
  mates: MateBrain[];
  defenders: DefenderSight[];
  keeper: { pos: Vec2 };
  /** Segundos entre soltar o traço e o toque na bola (corrida da cobrança). */
  windup: number;
};

/** Trecho do voo (0..1); `contest`: bola disputada na chegada (não cortada no caminho). */
type Span = { from: number; to: number; contest?: boolean };

const GOAL_Z = PITCH.goalLineZ;
const HW = PITCH.goalHalfWidth;
/** Altura de tela de referência quando a interface não informa o viewport. */
const DEFAULT_VIEW_H = 800;
/** Zagueiros reagem à bola solta depois do toque (game.launch): passe 0,3 s, chute 0,12 s. */
const REACT_PASS = 0.3;
const REACT_SHOT = 0.12;
/** Ele só vai numa bola que passa a ~2,6 m dele (ai.updateDefender), mais o corpo. */
const CUT_REACH = 3.6;
/** Até onde um zagueiro atento chega saltando (cabeça + salto + folga da colisão + raio da bola). */
const CUT_TOP = HEAD_Y + JUMP_MAX + 0.14 + R;
/** Desatento (ou na barreira de um passe): sem salto. */
const CUT_TOP_FLAT = HEAD_Y + 0.14 + R;
/** Folga do plano: limpar por pouco não é limpar. */
const CLEAR_MARGIN = 0.22;
/** Teto do lançamento: bola que fica 3 s no ar dá tempo de a defesa inteira chegar. */
const LOFT_CAP = 6.8;
const CROSS_CAP = 6.2;

const inBox = (p: Vec2) => Math.abs(p.x) <= PITCH.boxHalfWidth && p.z >= GOAL_Z - PITCH.boxDepth;

function onGoalMouth(g: Vec3 | null | undefined): g is Vec3 {
  return !!g && Math.abs(g.x) <= HW + 2.5 && g.y >= -0.05 && g.y <= PITCH.goalHeight + 1.5;
}

/** Força 0,04..1,25 da velocidade do traço (telas por segundo), em escala log. */
export function strokePower(screensPerSecond: number) {
  // 0,5 tela em 0,16 s ≈ 1 (chute cheio); em 0,35 s ≈ 0,7; em 0,8 s ≈ 0,33; 80 ms = pancada.
  return clamp(0.526 + 0.289 * Math.log2(Math.max(1e-3, screensPerSecond)), 0.04, 1.25);
}

/** Plano do traço (sem o erro). null = traço curto/inválido. */
export function interpretStroke(samples: StrokeSample[], ctx: StrokeContext): KickPlan | null {
  const pts = samples.filter((s) => s && s.screen && Number.isFinite(s.screen.x) && Number.isFinite(s.screen.y) && Number.isFinite(s.t));
  if (pts.length < 2) return null;
  const ballXZ = { x: ctx.ball.x, z: ctx.ball.z };
  // Bola no ar: o traço é lido no plano da altura dela (no gramado, a projeção
  // cai metros longe da bola e inventava curva no cabeceio).
  const useAir = !!ctx.aerial && pts.some((s) => s.air);
  const G = (s: StrokeSample): Vec2 | null => (useAir ? s.air ?? null : s.ground);

  // Começo: primeiro ponto perto da bola (bola no ar sem o plano dela projeta longe no chão).
  const startR = ctx.aerial && !useAir ? 9 : 3.4;
  let i0 = pts.findIndex((s) => {
    const g = G(s);
    return g && dist2(g, ballXZ) <= startR;
  });
  if (i0 < 0) i0 = 0;
  // Pausa antes de arrastar: o relógio da força começa quando o dedo sai do lugar.
  let iMove = i0;
  while (iMove + 1 < pts.length && screenDist(pts[i0], pts[iMove + 1]) < 6) iMove += 1;
  // Pausa no fim (segurou antes de soltar): não conta tempo.
  let iEnd = pts.length - 1;
  while (iEnd > iMove + 1 && screenDist(pts[iEnd], pts[iEnd - 1]) < 1.2) iEnd -= 1;
  const used = pts.slice(i0, iEnd + 1);
  if (used.length < 2) return null;

  let screenLen = 0;
  for (let i = 1; i < used.length; i += 1) screenLen += screenDist(used[i - 1], used[i]);
  if (screenLen < 16) return null;
  const viewH = viewportHeight(pts);
  const dur = Math.max(0.06, (pts[iEnd].t - pts[iMove].t) / 1000);
  const power = strokePower(screenLen / viewH / dur);

  // Fim: o último ponto que dá para ler, olhando o traço inteiro (um peteleco
  // que atravessa o gol e sobe para a arquibancada tem poucos pontos: o que
  // passou pela boca do gol manda, e não um ponto no meio do campo).
  let end = used[used.length - 1];
  for (let i = used.length - 1; i >= 1; i -= 1) {
    const s = used[i];
    if (onGoalMouth(s.goal) || G(s)) {
      end = s;
      break;
    }
  }
  const endG = G(end);
  const lowShot = !onGoalMouth(end.goal) && endG && endG.z >= GOAL_Z - 0.8 && Math.abs(endG.x) <= HW + 2.5;
  if (onGoalMouth(end.goal) || lowShot) {
    const target: Vec3 = onGoalMouth(end.goal)
      ? { x: end.goal.x, y: clamp(end.goal.y, R, PITCH.goalHeight + 1.5), z: GOAL_Z }
      : { x: crossingX(used, endG as Vec2, G), y: useAir ? clamp(ctx.ball.y, R, PITCH.goalHeight) : R, z: GOAL_Z };
    const path = shotPath(used, ballXZ, G);
    const curve = measureCurve(path, ballXZ, { x: target.x, z: GOAL_Z });
    return planShot(ctx, target, curve, power);
  }

  const passEnd = endG ?? lastGround(used, G);
  if (!passEnd) return null;
  const path: Vec2[] = [ballXZ];
  for (const s of used) {
    const g = G(s);
    if (g) path.push(g);
  }
  const curve = measureCurve(path, ballXZ, passEnd);
  return planPass(ctx, passEnd, curve, power);
}

function screenDist(a: StrokeSample, b: StrokeSample) {
  return hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y);
}

function viewportHeight(pts: StrokeSample[]) {
  for (const s of pts) {
    const h = s.viewport?.height;
    if (h && Number.isFinite(h) && h > 100) return h;
  }
  return DEFAULT_VIEW_H;
}

function lastGround(pts: StrokeSample[], G: (s: StrokeSample) => Vec2 | null): Vec2 | null {
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const g = G(pts[i]);
    if (g) return g;
  }
  return null;
}

/** x onde o caminho no chão cruza a linha do gol. */
function crossingX(pts: StrokeSample[], end: Vec2, G: (s: StrokeSample) => Vec2 | null) {
  let prev: Vec2 | null = null;
  for (const s of pts) {
    const g = G(s);
    if (!g) continue;
    if (prev && prev.z < GOAL_Z && g.z >= GOAL_Z) {
      const k = (GOAL_Z - prev.z) / (g.z - prev.z || 1);
      return prev.x + (g.x - prev.x) * k;
    }
    prev = g;
  }
  return end.x;
}

/** Caminho do chute no chão: o gramado até a linha, depois o ponto do gol rebatido na linha. */
function shotPath(pts: StrokeSample[], ball: Vec2, G: (s: StrokeSample) => Vec2 | null): Vec2[] {
  const out: Vec2[] = [ball];
  for (const s of pts) {
    const g = G(s);
    if (g && g.z <= GOAL_Z) out.push(g);
    else if (s.goal && s.goal.y >= -0.05) out.push({ x: s.goal.x, z: GOAL_Z });
  }
  return out;
}

/** Reamostra a cada `step` m e suaviza (o tremido da mão não vira curva). */
function smoothPath(path: Vec2[], step: number) {
  const pts: Vec2[] = [];
  if (!path.length) return pts;
  pts.push(path[0]);
  let carry = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const seg = dist2(a, b);
    if (seg < 1e-6) continue;
    let d = step - carry;
    while (d <= seg) {
      pts.push({ x: a.x + ((b.x - a.x) * d) / seg, z: a.z + ((b.z - a.z) * d) / seg });
      d += step;
    }
    carry = seg - (d - step);
  }
  pts.push(path[path.length - 1]);
  let cur = pts;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = cur.map((p, i) => {
      if (i === 0 || i === cur.length - 1) return p;
      const w = [1, 2, 3, 2, 1];
      let sx = 0;
      let sz = 0;
      let sw = 0;
      for (let k = -2; k <= 2; k += 1) {
        const q = cur[clamp(i + k, 0, cur.length - 1)];
        sx += q.x * w[k + 2];
        sz += q.z * w[k + 2];
        sw += w[k + 2];
      }
      return { x: sx / sw, z: sz / sw };
    });
    cur = next;
  }
  return cur;
}

/** Desvio lateral máximo (com sinal: + à direita de quem chuta) do caminho em relação à corda. */
export function measureCurve(path: Vec2[], from: Vec2, to: Vec2) {
  const chord = { x: to.x - from.x, z: to.z - from.z };
  const D = hypot(chord.x, chord.z);
  if (D < 1 || path.length < 3) return 0;
  const smooth = smoothPath(path, clamp(D / 40, 0.25, 0.8));
  const dir = norm2(chord);
  const side = right2(dir);
  let best = 0;
  for (const p of smooth) {
    const along = (p.x - from.x) * dir.x + (p.z - from.z) * dir.z;
    if (along < 0 || along > D) continue;
    const dev = (p.x - from.x) * side.x + (p.z - from.z) * side.z;
    if (Math.abs(dev) > Math.abs(best)) best = dev;
  }
  // Zona morta: traço quase reto sai reto.
  const mag = Math.max(0, Math.abs(best) - 0.3);
  return Math.sign(best) * mag;
}

/** Monta o FlightSpec do plano (a mesma conta serve à prévia e ao chute com erro). */
export function specFromPlan(plan: Pick<KickPlan, "kind" | "shot" | "from" | "target" | "curve" | "speed" | "apex">): FlightSpec {
  const lofted = plan.kind === "lofted" || plan.kind === "chip";
  const grounded = plan.kind === "ground" || plan.kind === "driven" || (plan.kind === "shot" && plan.target.y <= R + 0.02);
  return {
    kind: plan.kind,
    from: plan.from,
    target: grounded ? { ...plan.target, y: R } : plan.target,
    curve: plan.curve,
    speed: plan.speed,
    apex: plan.apex,
    grounded,
    lofted,
  };
}

// ------------------------------------------------------------ defesa prevista

/** A jogada prevista: quem recebe corre até o ponto de chegada; a bola segue o voo. */
type Motion = { receiver: string | null; end: Vec2; arrive: number; shot: boolean; ballAt: (tau: number) => Vec2 };

/** Onde o companheiro vai estar em `t` (escrito em `out`; pode devolver a própria posição dele, só para ler). */
function matePosAt(m: MateBrain, t: number, motion: Motion, out: Vec2): Vec2 {
  // Quem recebe corre para o ponto de chegada no máximo no pique: bola longe demais, ele não chega a tempo.
  if (motion.receiver === m.actor.id) return travel(m.actor.pos, m.actor.vel, motion.end.x, motion.end.z, SPRINT_SPEED, t, out);
  return runPositionAfter(m, t, RUN_SPEED, out);
}

/** Anda até (toX, toZ) saindo com o embalo atual, aceleração de ~11 m/s² e teto de velocidade; `out` evita alocar. */
function travel(from: Vec2, vel: Vec2, toX: number, toZ: number, vmax: number, tau: number, out?: Vec2): Vec2 {
  const d0 = hypot(from.x - toX, from.z - toZ);
  if (d0 < 1e-3) return from;
  const dirX = (toX - from.x) / d0;
  const dirZ = (toZ - from.z) / d0;
  const v0 = clamp(vel.x * dirX + vel.z * dirZ, 0, vmax);
  const tAcc = (vmax - v0) / 11;
  const d = tau <= tAcc ? v0 * tau + 5.5 * tau * tau : v0 * tAcc + 5.5 * tAcc * tAcc + vmax * (tau - tAcc);
  const k = Math.min(1, d / d0);
  const x = from.x + (toX - from.x) * k;
  const z = from.z + (toZ - from.z) * k;
  if (!out) return { x, z };
  out.x = x;
  out.z = z;
  return out;
}

// Rascunhos das contas do meio de sightAt (não é reentrante): só o ponto final vira objeto novo, porque fica guardado.
const SEEN: Vec2 = { x: 0, z: 0 };
const TO_GOAL: Vec2 = { x: 0, z: 0 };
const TO_BALL: Vec2 = { x: 0, z: 0 };

/**
 * Onde o adversário vai estar `tau` s depois de o traço ser solto, seguindo o
 * papel dele (as mesmas contas de ai.updateDefender, sem ir na bola).
 */
function sightAt(d: DefenderSight, tau: number, motion: Motion, ball: Vec2, mark: MateBrain | null | undefined): Vec2 {
  if (d.behavior === "keeper" || (d.behavior === "wall" && motion.shot)) return d.pos;
  if (d.behavior === "press") {
    // A pressão vai na bola (para a ~1,3 m dela, do lado do gol), acelerando do lugar.
    const toGoal = norm2To(-ball.x, GOAL_Z - ball.z, TO_GOAL);
    return travel(d.pos, d.vel, ball.x + toGoal.x * 1.3, ball.z + toGoal.z * 1.3, DEFENDER_SPEED * 0.9, tau);
  }
  if (d.behavior === "markNearest" && d.mark) {
    // A marcação fica entre o atacante (onde ele estava ~0,4 s antes) e o gol, puxada para a bola.
    const m = mark;
    if (m) {
      const seen = matePosAt(m, Math.max(0, tau - 0.4), motion, SEEN);
      const toGoal = norm2To(-seen.x, GOAL_Z - seen.z, TO_GOAL);
      const toBall = norm2To(ball.x - seen.x, ball.z - seen.z, TO_BALL);
      return travel(d.pos, d.vel, seen.x + toGoal.x + toBall.x * 0.5, seen.z + toGoal.z + toBall.z * 0.5, DEFENDER_SPEED * 0.94, tau);
    }
  }
  // Linha (e a barreira que se desfaz num passe): acompanha a bola de lado e recua quando ela avança.
  const home = d.home ?? d.pos;
  const shift = clamp((ball.x - home.x) * 0.2, -3.5, 3.5);
  const drop = clamp((ball.z - (home.z - 14)) * 0.22, 0, 4);
  return travel(d.pos, d.vel, home.x + shift, Math.min(GOAL_Z - 3, home.z + drop), DEFENDER_SPEED * 0.75, tau);
}

/**
 * Trechos do voo (0..1) que algum adversário alcança. Como na IA: ele segue o
 * papel dele até ver a bola (reage um instante depois do toque) e então vai
 * num ponto do caminho que alcança antes dela, olhando até ~1 s à frente e
 * só se o ponto está a ~2,6 m (+ o corpo); de cabeça, saltando, se já está atento.
 */
function dangerOf(ctx: StrokeContext, f: Flight, shot: boolean, end: Vec2, receiver: string | null, skipEnd: boolean): Span[] {
  const from = { x: ctx.ball.x, z: ctx.ball.z };
  const react = ctx.windup + (shot ? REACT_SHOT : REACT_PASS);
  const cast = castOf(ctx);
  const { people, marks } = shot ? cast.shot : cast.pass;
  const st = { x: 0, y: 0, z: 0 };
  const p = { x: 0, z: 0 };
  const q = { x: 0, y: 0, z: 0 };
  const recAt = { x: 0, z: 0 };
  const motion: Motion = {
    receiver,
    end,
    arrive: ctx.windup + f.T,
    shot,
    ballAt: (tau) => {
      if (tau <= ctx.windup) return from;
      flightPos(f, Math.min(f.T, tau - ctx.windup), q);
      return { x: q.x, z: q.z };
    },
  };
  // Bola e adversários por instante (passo × recuo): a bola é a mesma para todos; cada um é calculado uma vez.
  const gen = (slotGen += 1);
  const n = people.length;
  if (sightGen.length < SLOTS * n) {
    sightGen = new Float64Array(SLOTS * n);
    sightAtSlot = new Array<Vec2>(SLOTS * n).fill(NO_SLOT);
  }
  const balls = ballAtSlot;
  const sights = sightAtSlot;
  const sight = (di: number, slot: number, tau: number) => {
    const k = slot * n + di;
    if (sightGen[k] === gen) return sights[k];
    let ball = balls[slot];
    if (ballGen[slot] !== gen) {
      ball = balls[slot] = motion.ballAt(tau);
      ballGen[slot] = gen;
    }
    const hit = (sights[k] = sightAt(people[di], tau, motion, ball, marks[di]));
    sightGen[k] = gen;
    return hit;
  };
  const nearBox = Math.abs(end.x) <= PITCH.boxHalfWidth + 2 && end.z >= GOAL_Z - PITCH.boxDepth - 3;
  const rec = skipEnd && receiver ? cast.mates.get(receiver) ?? null : null;
  const controlTop = nearBox && f.spec.target.y >= 1.4 ? 2.75 : 1.9;
  const steps = DANGER_STEPS;
  const spans: Span[] = [];
  // 0 livre, 1 disputada na chegada (quem recebe também chega), 2 cortada no caminho.
  let openKind = 0;
  let openAt = 0;
  const close = (u: number) => {
    if (openKind) spans.push(openKind === 1 ? { from: openAt, to: u, contest: true } : { from: openAt, to: u });
    openKind = 0;
  };
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const t = f.T * u;
    flightPos(f, t, st);
    p.x = st.x;
    p.z = st.z;
    const y = st.y;
    const tau = ctx.windup + t;
    const dRec = rec ? dist2(p, matePosAt(rec, tau, motion, recAt)) : Infinity;
    let kind = 0;
    if (skipEnd && dist2(p, end) < 1.15 && y < controlTop) {
      // Chegou em quem recebe numa altura que ele domina (ou cabeceia, no cruzamento):
      // o resto do caminho não conta. Só a dividida: zagueiro colado na bola e mais perto que ele.
      if (tau >= react) {
        for (let di = 0; di < people.length; di += 1) {
          const d = people[di];
          if (d.behavior === "keeper" || (d.behavior === "wall" && shot)) continue;
          const gap = dist2(p, sight(di, i * 4 + 3, tau));
          if (gap < 0.7 && gap < dRec) kind = 1;
        }
      }
      if (kind !== openKind) close(u);
      if (kind && !openKind) {
        openKind = kind;
        openAt = u;
      }
      close(Math.min(1, u + 1 / steps));
      break;
    }
    // Colado em quem chuta, a bola já saiu dele.
    if (dist2(p, from) > 1.2) {
      for (let di = 0; di < people.length; di += 1) {
        const d = people[di];
        let hit = 0;
        if (d.behavior === "keeper") {
          if (dist2(p, d.pos) <= 0.85 + CLEAR_MARGIN && y <= 2.35) hit = 2;
        } else if ((d.behavior === "wall" && shot) || tau < react) {
          if (dist2(p, sight(di, i * 4 + 3, tau)) <= 0.45 + CLEAR_MARGIN && y <= CUT_TOP_FLAT + CLEAR_MARGIN) hit = 2;
        } else if (y <= CUT_TOP + CLEAR_MARGIN) {
          // Instantes em que ele pode ter decidido ir na bola (até ~1 s antes de ela passar).
          // Ele já vem andando (marcação, linha): sai a ~4,5 m/s de média no começo e acelera.
          for (let bi = 0; bi < 4; bi += 1) {
            const back = BACKS[bi];
            const c = Math.max(react, tau - back);
            const dt = tau - c;
            const run = Math.max(4.5 * dt, Math.min(5.5 * dt * dt, 1.98 + DEFENDER_SPEED * Math.max(0, dt - 0.6)));
            const reach = Math.min(CUT_REACH, 0.78 + run);
            const gap = dist2(p, sight(di, i * 4 + bi, c));
            if (gap > reach + CLEAR_MARGIN) continue;
            // Quem recebe já está chegando: perto da chegada é disputa (a previsão das
            // corridas ali é fina demais para cravar o corte); antes, só se ele chega claramente antes.
            hit = dRec > 3 || gap - run < dRec - (u < 0.8 ? 0.6 : 1.2) ? 2 : 1;
            break;
          }
        }
        kind = Math.max(kind, hit);
        if (kind === 2) break;
      }
    }
    if (kind !== openKind) {
      close(u);
      if (kind) {
        openKind = kind;
        openAt = u;
      }
    }
  }
  close(1);
  return spans;
}

const BACKS = [0.96, 0.6, 0.3, 0];

// Caches por instante do dangerOf, reaproveitados entre chamadas (não é reentrante): a entrada
// só vale se o carimbo for o da chamada atual, então nada precisa ser limpo nem alocado de novo.
const DANGER_STEPS = 36;
const SLOTS = (DANGER_STEPS + 1) * BACKS.length;
const NO_SLOT: Vec2 = { x: 0, z: 0 };
let slotGen = 0;
const ballGen = new Float64Array(SLOTS);
const ballAtSlot = new Array<Vec2>(SLOTS).fill(NO_SLOT);
let sightGen = new Float64Array(0);
let sightAtSlot: Vec2[] = [];

/** Quem pode cortar (no chute, sem o goleiro) e quem cada marcador marca. */
type Roster = { people: DefenderSight[]; marks: Array<MateBrain | null | undefined> };
type Cast = { shot: Roster; pass: Roster; mates: Map<string, MateBrain> };
const casts = new WeakMap<StrokeContext, Cast>();

/** O elenco é o mesmo em todas as contas de um plano: monta uma vez por ctx (o primeiro com o id vale, como no find). */
function castOf(ctx: StrokeContext): Cast {
  let cast = casts.get(ctx);
  if (cast) return cast;
  const mates = new Map<string, MateBrain>();
  for (const m of ctx.mates) if (!mates.has(m.actor.id)) mates.set(m.actor.id, m);
  const roster = (people: DefenderSight[]): Roster => ({
    people,
    marks: people.map((d) => (d.behavior === "markNearest" && d.mark ? mates.get(d.mark) : null)),
  });
  cast = { shot: roster(ctx.defenders.filter((d) => d.behavior !== "keeper")), pass: roster(ctx.defenders), mates };
  casts.set(ctx, cast);
  return cast;
}

/** Chance (calibrada na simulação) de o passe ser cortado: no caminho, cedo, quase certo; na chegada, metade. */
const riskOf = (spans: Span[] | undefined) => (spans ?? []).reduce((risk, s) => Math.max(risk, s.contest ? 0.4 : s.from < 0.55 ? 0.95 : 0.7), 0);

const spanSize = (spans: Span[] | undefined) => (spans ?? []).reduce((sum, s) => sum + (s.to - s.from), 0) + (spans?.length ? 0.05 : 0);

/** `quick`: só a conta do voo (a busca do ponto de encontro não precisa da defesa). */
type Extra = { receiver: string | null; end: Vec2; skipEnd: boolean; quick?: boolean };

function finishPlan(ctx: StrokeContext, base: Omit<KickPlan, "preview" | "apex"> & { apex?: number }, extra: Extra): KickPlan {
  const spec = specFromPlan({ ...base, apex: base.apex ?? 0 });
  const flight = designFlight(spec);
  // Por cima, a velocidade sai da altura; o plano guarda a que o voo vai ter.
  const isLofted = lofted(base.kind);
  const danger = extra.quick ? [] : dangerOf(ctx, flight, base.shot, extra.end, extra.receiver, extra.skipEnd);
  return {
    ...base,
    speed: isLofted ? flight.v0 : base.speed,
    apex: isLofted ? base.apex ?? apexOf(flight) : apexOf(flight),
    preview: previewOf(flight, 32),
    ...(danger.length ? { danger } : {}),
  };
}

const lofted = (k: KickKind) => k === "lofted" || k === "chip";

function planShot(ctx: StrokeContext, rawTarget: Vec3, rawCurve: number, power: number): KickPlan {
  const from = { ...ctx.ball };
  const fromXZ = { x: from.x, z: from.z };
  const D = Math.max(1, dist2(fromXZ, rawTarget));
  // Cabeça quase não dá efeito; de voleio, um pouco.
  const maxCurve = Math.min(ctx.aerial === "header" ? 0.8 : ctx.aerial === "volley" ? 2 : 6, 0.24 * D);
  const curve = clamp(rawCurve, -maxCurve, maxCurve);
  const p = Math.min(power, 1);
  const over = Math.max(0, power - 1);
  let kind: KickKind = ctx.aerial ?? "shot";
  let speed: number;
  let target = { ...rawTarget };
  let apex: number | undefined;
  // Cabeçada firme: mais lenta que o chute, mas sem fazer laçada até o gol.
  if (kind === "header") speed = lerp(13.5, 23, p);
  else if (kind === "volley") speed = lerp(17, 30, p) + over * 6;
  else speed = Math.min(34, lerp(16, 31.5, p) + over * 10);

  // Cavadinha: goleiro adiantado na frente, traço terminando alto, de perto.
  const k = ctx.keeper.pos;
  const keeperOut = GOAL_Z - k.z;
  if (kind === "shot" && keeperOut > 3.2 && D < 24 && target.y > 1.3) {
    const t = (k.z - fromXZ.z) / Math.max(0.1, rawTarget.z - fromXZ.z);
    const lineX = fromXZ.x + (rawTarget.x - fromXZ.x) * t;
    if (t > 0 && t < 1 && Math.abs(lineX - k.x) < 2.2) {
      kind = "chip";
      apex = clamp(2.9 + keeperOut * 0.25 + (1 - p) * 0.8, 3, 5.5);
      target = { ...target, y: clamp(target.y, 0.6, PITCH.goalHeight - 0.25) };
    }
  }
  if (kind === "shot" && target.y < 0.45) target.y = R;

  const c = Math.abs(curve);
  let acc = 0.97;
  acc -= over * 1.1;
  if (power < 0.15) acc -= 0.04;
  acc -= Math.max(0, D - 11) * 0.011;
  // Curva custa: pouco até 2 m, bem mais na banana enorme (que senão vencia qualquer goleiro).
  acc -= Math.max(0, Math.min(c, 2) - 1.2) * 0.05 + Math.max(0, c - 2) * 0.09;
  if (kind === "volley") acc -= 0.12;
  if (kind === "header") acc += 0.04;
  if (kind === "chip") acc -= 0.06;
  const accuracy = clamp(acc, 0.3, 0.97);
  return finishPlan(ctx, { kind, shot: true, receiver: null, from, target, curve, speed, accuracy, apex }, { receiver: null, end: { x: target.x, z: target.z }, skipEnd: false });
}

function planPass(ctx: StrokeContext, endG: Vec2, rawCurve: number, power: number): KickPlan | null {
  const from = { ...ctx.ball };
  const fromXZ = { x: from.x, z: from.z };
  const mates = ctx.mates.filter((m) => m.actor.id !== ctx.heroId);
  const p = Math.min(power, 1);
  const over = Math.max(0, power - 1);

  // Companheiro perto do fim do traço (ou do caminho que ele vai correr).
  let receiver: MateBrain | null = null;
  let snap: { kind: "run"; point: Vec2; along: number } | { kind: "player" } | null = null;
  let bestScore = 3.5;
  for (const m of mates) {
    const dNow = dist2(endG, m.actor.pos);
    const run = [{ ...m.actor.pos }, ...m.run.slice(m.runIdx)];
    let dRun = Infinity;
    let runPoint: Vec2 | null = null;
    let along = 0;
    let acc = 0;
    for (let i = 1; i < run.length; i += 1) {
      const c = closestOnSegment2(endG, run[i - 1], run[i]);
      if (c.dist < dRun) {
        dRun = c.dist;
        runPoint = c.point;
        along = acc + dist2(run[i - 1], c.point);
      }
      acc += dist2(run[i - 1], run[i]);
    }
    const score = Math.min(dNow, dRun);
    if (score <= bestScore) {
      bestScore = score;
      receiver = m;
      snap = runPoint && dRun + 0.4 < dNow && along > 1.5 ? { kind: "run", point: runPoint, along } : { kind: "player" };
    }
  }

  const clampPitch = (q: Vec2): Vec2 => ({ x: clamp(q.x, -PITCH.halfWidth + 0.6, PITCH.halfWidth - 0.6), z: clamp(q.z, 1, GOAL_Z - 0.6) });
  let target2: Vec2 = clampPitch(endG);
  let spaceTiming: number | undefined;
  if (!receiver) {
    // Bola no espaço: quem chega antes corre nela. Ninguém por perto = traço
    // solto antes da hora (a interface pede para levar até alguém ou ao gol).
    let bestT = Infinity;
    for (const m of mates) {
      const t = dist2(m.actor.pos, target2) / RUN_SPEED;
      if (t < bestT) {
        bestT = t;
        receiver = m;
      }
    }
    if (!receiver || bestT > 2.6) return null;
    // A bola chega quando ele chega (e quase parada): não rola 30 m para o nada.
    const v0 = hypot(receiver.actor.vel.x, receiver.actor.vel.z);
    const startup = Math.max(0, RUN_SPEED - v0) ** 2 / (2 * 9 * RUN_SPEED);
    spaceTiming = Math.max(0.35, bestT + startup - ctx.windup);
  }
  const space = spaceTiming !== undefined;

  const maxCurve = (D: number) => Math.min(8, 0.25 * D);
  /** `timing`: tempo de voo desejado (passe em profundidade "na medida" para quem corre). */
  const build = (target: Vec2, timing?: number, quick = false): KickPlan => {
    const D = Math.max(1, dist2(fromXZ, target));
    const curve = clamp(rawCurve, -maxCurve(D), maxCurve(D));
    const aerial = ctx.aerial;
    let acc = 0.97 - over * 1.1 - Math.max(0, D - 14) * 0.006 - Math.max(0, Math.abs(curve) - 1.5) * 0.04;
    if (power < 0.15) acc -= 0.04;
    const recId = receiver?.actor.id ?? null;
    const extra: Extra = { receiver: recId, end: target, skipEnd: !space, quick };
    if (aerial) {
      const kind: KickKind = aerial;
      const speed = kind === "header" ? lerp(8, 16, p) : lerp(11, 22, p);
      if (kind === "volley") acc -= 0.1;
      const t3 = { x: target.x, y: 0.4, z: target.z };
      return finishPlan(ctx, { kind, shot: false, receiver: recId, from, target: t3, curve, speed, accuracy: clamp(acc, 0.3, 0.97) }, extra);
    }
    const cross = Math.abs(fromXZ.x) > 13 && inBox(target) && target.z > fromXZ.z - 2;
    const long = D > 30;

    // Rasteiro: chega com mais ou menos força; traço lento demais fica curto.
    const ground = (): KickPlan => {
      const L = D + (8 / 3) * (curve * curve) / D;
      let t3 = { x: target.x, y: R, z: target.z };
      // Chegada natural do traço (m/s): no pé de alguém, firme; no espaço, morrendo.
      const natural = space ? lerp(1.2, 6, p) : lerp(6.5, 17, p) + over * 5;
      let speed: number;
      let timingErr: number | undefined;
      let a = acc;
      if (power < 0.2 && !space && timing === undefined) {
        const reach = L * (0.5 + 2.5 * power);
        speed = groundSpeedFor(reach, 0.05);
        if (reach < L) {
          const k = reach / L;
          t3 = { x: fromXZ.x + (target.x - fromXZ.x) * k, y: R, z: fromXZ.z + (target.z - fromXZ.z) * k };
        }
      } else if (timing !== undefined) {
        // Na medida: a força que faz a bola chegar junto com ele. O traço ainda
        // conta: forte demais adianta, fraco demais atrasa (20% do desvio).
        const geoG = flightGeometry({ from, target: t3, curve });
        const groundT = (va: number) => designFlight({ kind: "ground", from, target: t3, curve, speed: groundSpeedFor(L, va), apex: 0, grounded: true, lofted: false }, geoG).T;
        let lo = space ? 0.6 : 3.5;
        let hi = 20;
        for (let i = 0; i < 18; i += 1) {
          const mid = (lo + hi) / 2;
          if (groundT(mid) > timing) lo = mid;
          else hi = mid;
        }
        const ideal = (lo + hi) / 2;
        // A força ideal do traço para essa chegada; o desvio do traço puxa 20% (dentro do que o traço alcança).
        const va0 = space ? 1.2 : 6.5;
        const vaSpan = space ? 4.8 : 10.5;
        const pIdeal = clamp((ideal - va0) / vaSpan, 0, 1);
        timingErr = Math.abs(p - pIdeal);
        a -= Math.min(0.1, timingErr * 0.12);
        speed = groundSpeedFor(L, clamp(ideal + (p - pIdeal) * vaSpan * 0.2, space ? 0.6 : 3, 20));
      } else {
        speed = groundSpeedFor(L, natural);
      }
      const kind: KickKind = p > 0.85 && D > 16 ? "driven" : "ground";
      const plan = finishPlan(ctx, { kind, shot: false, receiver: recId, from, target: t3, curve, speed, accuracy: clamp(a, 0.3, 0.97) }, extra);
      return timingErr !== undefined && !space ? { ...plan, timing: Math.round(timingErr * 100) / 100 } : plan;
    };

    // Por cima: a altura limpa quem está no caminho; o cruzamento chega na cabeça.
    const loft = (): KickPlan => {
      const arrive = cross && !space ? 1.9 : 0.5;
      const natural = Math.max(arrive + 0.6, cross ? lerp(5.6, 3.4, p) : lerp(3.2 + 0.07 * D, 2.4 + 0.035 * D, p));
      const cap = cross ? CROSS_CAP : LOFT_CAP;
      const t3 = { x: target.x, y: arrive, z: target.z };
      const spec = (h: number) => specFromPlan({ kind: "lofted", shot: false, from, target: t3, curve, speed: 10, apex: h });
      const geoL = flightGeometry(spec(0));
      let apex = natural;
      let timingErr: number | undefined;
      let a = acc - (cross ? 0.03 : 0.04);
      if (timing !== undefined) {
        // Na medida: a altura que faz a bola cair quando ele chega (com o mesmo peso do traço).
        let lo = arrive + 0.6;
        let hi = cap;
        for (let i = 0; i < 18; i += 1) {
          const mid = (lo + hi) / 2;
          if (designFlight(spec(mid), geoL).T < timing) lo = mid;
          else hi = mid;
        }
        const ideal = (lo + hi) / 2;
        // Mesma ideia em altura: traço forte = bola mais baixa e mais rápida.
        const a0 = cross ? 5.6 : 3.2 + 0.07 * D;
        const a1 = cross ? 3.4 : 2.4 + 0.035 * D;
        const pIdeal = clamp((a0 - ideal) / Math.max(0.1, a0 - a1), 0, 1);
        timingErr = Math.abs(p - pIdeal);
        a -= Math.min(0.1, timingErr * 0.12);
        apex = Math.max(arrive + 0.6, ideal + (pIdeal - p) * (a0 - a1) * 0.2);
      }
      apex = Math.min(apex, cap);
      // Sobe até limpar a defesa prevista (com folga), sem passar do teto: o que sobrar fica vermelho.
      let best = apex;
      let bestSize = Infinity;
      for (let h = apex; h <= cap + 1e-6; h += 0.4) {
        if (quick) break;
        const size = spanSize(dangerOf(ctx, designFlight(spec(h), geoL), false, target, recId, !space));
        if (size < bestSize - 1e-6) {
          bestSize = size;
          best = h;
        }
        if (size === 0) break;
      }
      const plan = finishPlan(ctx, { kind: "lofted", shot: false, receiver: recId, from, target: t3, curve, speed: 0, accuracy: clamp(a, 0.3, 0.97), apex: best }, extra);
      return timingErr !== undefined && !space ? { ...plan, timing: Math.round(timingErr * 100) / 100 } : plan;
    };

    if (cross || long) return loft();
    const low = ground();
    if (!low.danger || quick) return low;
    const high = loft();
    // Por cima quando limpa; ou quando o rasteiro é cortado cedo no caminho (alguém
    // parado no corredor, a pressão em cima) e o alto arrisca menos. Bola pendurada
    // à toa dá tempo de a defesa toda chegar na queda.
    if (!high.danger) return high;
    return riskOf(high.danger) < riskOf(low.danger) - 0.1 ? high : low;
  };

  if (space) return build(target2, spaceTiming);
  if (receiver && (snap?.kind === "run" || (snap?.kind === "player" && receiver.runIdx < receiver.run.length))) {
    // Correndo: desenhou à frente, na corrida → bola em profundidade no ponto
    // desenhado; desenhou nele → a bola vai para onde os dois se encontram.
    const m = receiver;
    if (snap.kind === "run" && snap.along > 1.5) {
      // Bola em profundidade: vai no ponto desenhado, com a força medida para
      // chegar junto com ele (passe "na medida").
      const v0 = hypot(m.actor.vel.x, m.actor.vel.z);
      const startup = Math.max(0, RUN_SPEED - v0) ** 2 / (2 * 9);
      const tRunner = (snap.along + startup) / RUN_SPEED;
      return build(clampPitch(snap.point), Math.max(0.35, tRunner - ctx.windup - 0.1));
    }
    let lead = { ...m.actor.pos };
    for (let i = 0; i < 4; i += 1) lead = runPositionAfter(m, ctx.windup + flightTime(build(lead, undefined, true)));
    target2 = clampPitch(lead);
  } else if (receiver && snap?.kind === "player") {
    // Parado: no pé dele, um pouco à frente (do lado de quem passa).
    const m = receiver;
    const toBall = norm2({ x: fromXZ.x - m.actor.pos.x, z: fromXZ.z - m.actor.pos.z });
    target2 = clampPitch({ x: m.actor.pos.x + toBall.x * 0.55, z: m.actor.pos.z + toBall.z * 0.55 });
  }
  return build(target2);
}

/** Tempo de voo (s) do plano até o alvo. */
export function flightTime(plan: KickPlan) {
  return designFlight(specFromPlan(plan)).T;
}

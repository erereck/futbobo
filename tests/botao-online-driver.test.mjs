import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./helpers/ts-loader.mjs";

// Driver da partida online (design §5, §7.2, §11.1): dois OnlineMatchDriver ligados
// por um link em memória com tempo virtual (sem timers reais, sem rede).

const D = loadTs("app/botao/online-driver.ts");
const E = loadTs("app/botao/engine.ts");
const M = loadTs("app/botao/match-codec.ts");
const { ONLINE_TIMING } = loadTs("app/botao/online-timing.ts");
const { createRng, hashSeed } = loadTs("app/botao/rng.ts");
const { DEFAULT_BOTAO_RULES } = loadTs("app/botao/types.ts");

const clone = (value) => JSON.parse(JSON.stringify(value));

/** PRNG do teste (mulberry32): nunca a rng da partida. */
function prng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (a, b) => a + (b - a) * next(), int: (a, b) => a + Math.floor(next() * (b - a + 1)), chance: (p) => next() < p };
}

const NAMES = ["Zé Carlos", "Tião", "Biro-Biro", "Dinho", "Careca", "Mirandinha", "Pita", "Juninho", "Bebeto", "Viola"];

function squad(side, celebration = 0) {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `${side}:p${index}`,
    name: NAMES[index + (side === "cpu" ? 5 : 0)],
    number: [10, 7, 9, 4, 1][index],
    position: "MC",
    overall: 76,
    power: 72,
    control: 72,
    appearance: celebration ? { celebration } : undefined,
  }));
}

function setupFor(seed, rules = {}, extra = {}) {
  return {
    matchId: `BOB-T-${seed}`,
    seed,
    competitionName: "Bobonline",
    stageName: "X1",
    neutralVenue: true,
    localControl: true,
    userIsHost: (hashSeed(seed, "saida") & 1) === 0,
    player: { name: "Zé Carlos", number: 10, position: "MC", overall: 76 },
    userTeam: { id: "bob-a", name: "Alvorada", shortName: "Alvorada", abbr: "ALV", primary: "#d01010", secondary: "#ffffff", strength: 76 },
    cpuTeam: { id: "bob-b", name: "Bandeirantes", shortName: "Bandeirantes", abbr: "BAN", primary: "#1030d0", secondary: "#ffffff", strength: 76 },
    difficulty: 3,
    squads: { user: squad("user"), cpu: squad("cpu") },
    rules: { ...DEFAULT_BOTAO_RULES, ...rules },
    ...extra,
  };
}

const SHORT = { goalLimit: 2, halfSeconds: 24, halves: 1, extraHalves: 1, extraSeconds: 12, penaltyRounds: 3 };

// ---------------------------------------------------------------------------
// Rede e link em memória
// ---------------------------------------------------------------------------

class Net {
  constructor(latency = () => 0.04) {
    this.now = 0;
    this.latency = latency;
    this.queue = [];
    this.seq = 0;
  }
  send(fn, delay = this.latency()) {
    this.queue.push({ at: this.now + Math.max(0, delay), seq: this.seq++, fn });
  }
  deliver(now) {
    this.now = now;
    this.queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
    while (this.queue.length > 0 && this.queue[0].at <= now) this.queue.shift().fn();
  }
}

/** O papel do controlador da autoridade na ordem dos batedores (§5.6), simplificado. */
class OrderDesk {
  constructor() {
    this.orders = {};
    this.authority = null;
    this.follower = null;
    this.cpuSide = null;
  }
  propose(side, order) {
    this.orders[side] = order.slice();
    const auth = this.authority;
    if (!auth) return;
    if (this.cpuSide) this.orders[this.cpuSide] ??= auth.driver.state.penalties.order[this.cpuSide].slice();
    if (!this.orders.user || !this.orders.cpu) return;
    const state = auth.driver.state;
    if (state.phase !== "penalty-setup") return;
    const action = { kind: "porder", n: auth.driver.n, k: M.matchKey(state), se: 0, orders: { user: this.orders.user, cpu: this.orders.cpu } };
    this.orders = {};
    auth.link.receive(clone(action));
    this.follower?.link.net.send(() => this.follower.link.receive(clone(action)));
  }
}

class LoopLink {
  constructor(net, name, desk) {
    this.net = net;
    this.name = name;
    this.desk = desk;
    this.peers = [];
    this.queue = new Map();
    this.frozen = false;
    this.banner = null;
    this.directives = [];
    this.rests = [];
    this.opened = [];
    this.progress = [];
    this.syncRequests = [];
    this.submitted = [];
    this.aheadCalls = [];
    this.aim = null;
    this.holding = false;
    this.extraAhead = 0;
  }
  submit(action) {
    this.submitted.push(clone(action));
    for (const peer of this.peers) {
      const copy = clone(action);
      this.net.send(() => peer.receive(copy));
    }
  }
  receive(action) {
    if (!this.queue.has(action.n)) this.queue.set(action.n, action);
  }
  peek(n) { return this.queue.get(n) ?? null; }
  consume(n) { this.queue.delete(n); }
  aheadOf(n) {
    this.aheadCalls.push(n);
    let count = this.extraAhead;
    for (const key of this.queue.keys()) if (key > n) count += 1;
    return count;
  }
  reportRest(n, state, pres) {
    this.rests.push({ n, h: M.hashMatch(state), key: M.matchKey(state), phase: state.phase, pres: pres ? { ...pres } : null, at: this.net.now, match: M.serializeMatch(state) });
  }
  turnOpened(n, side, clock, key) { this.opened.push({ n, side, clock, key, at: this.net.now }); }
  reportProgress(p) { this.progress.push(clone(p)); }
  takeDirective() { return this.directives.shift() ?? null; }
  requestSync(reason) { this.syncRequests.push({ reason, at: this.net.now }); }
  syncEpoch() { return 0; }
  status() { return { frozen: this.frozen, banner: this.banner, notice: null, opponentIdleS: null }; }
  proposePenaltyOrder(side, order) {
    if (this.name === "authority" || this.name === "solo") this.desk?.propose(side, order);
    else this.net.send(() => this.desk?.propose(side, order));
  }
  sendAim(aim) { for (const peer of this.peers) this.net.send(() => { peer.aim = aim ? { ...aim } : null; }); }
  sendHold(holding) { for (const peer of this.peers) this.net.send(() => { peer.holding = holding; }); }
  remoteAim() { return this.aim; }
  remoteHolding() { return this.holding; }
  subscribe() { return () => {}; }
}

// ---------------------------------------------------------------------------
// Peers, jogadores robôs e o laço de tempo virtual
// ---------------------------------------------------------------------------

function makePeer({ net, desk, name, setup, perspective, controls, hz, jitter = 0, seed, view3d = false, cpu = null, random, cameraSettled, restore, mutate }) {
  const link = new LoopLink(net, name, desk);
  const state = restore ? M.restoreMatch(setup, restore.match) : E.createMatch(setup);
  if (!restore) mutate?.(state);
  const log = { events: [], flashes: [], announces: [], turnStarts: [] };
  const driver = D.createOnlineDriver({
    state,
    n: restore?.n ?? 0,
    controls,
    perspective,
    names: { user: "Rei do Peteleco", cpu: "Dona Bola" },
    link,
    restoreTimers: restore?.timers ?? null,
    cpu,
    view3d: () => view3d,
    cameraSettled,
    random,
    onEvents: (events) => { for (const event of events) log.events.push({ ...event, at: net.now }); },
    onFlash: (text, tone, ms) => log.flashes.push({ text, tone, ms, at: net.now }),
    onAnnounce: (text) => log.announces.push(text),
    onTurnStart: (side) => log.turnStarts.push({ side, at: net.now }),
  });
  const controlsLocal = { user: controls.user === "local", cpu: controls.cpu === "local" };
  return { name, link, driver, state, log, hz, jitter, rng: prng(seed), next: undefined, bot: null, holding: false, controlsLocal };
}

/** Robô de cada lado: pensa, às vezes demora demais, às vezes segura no 0:00. */
function botStep(peer, now, script) {
  const driver = peer.driver;
  const state = peer.state;
  if (state.phase === "penalty-setup") {
    for (const side of ["user", "cpu"]) {
      if (peer.controlsLocal?.[side] && !driver.orderConfirmed(side) && !peer.orderPlanned?.[side]) {
        peer.orderPlanned = { ...peer.orderPlanned, [side]: true };
        if (peer.rng.chance(0.6)) {
          const order = state.penalties.order[side].slice();
          for (let i = order.length - 1; i > 0; i -= 1) {
            const j = peer.rng.int(0, i);
            [order[i], order[j]] = [order[j], order[i]];
          }
          driver.chooseOrder(side, order);
        }
      }
    }
    return;
  }
  peer.orderPlanned = null;
  const side = driver.localTurn();
  if (!side) {
    peer.holding = false;
    return;
  }
  if (!peer.bot || peer.bot.n !== driver.n) {
    const r = peer.rng;
    const penalties = state.phase === "penalties";
    const custom = script?.(peer, driver.n);
    const think = custom?.think ?? (penalties ? (r.chance(script ? 0 : 0.06) ? 11 : r.range(0.2, 3)) : r.chance(script ? 0 : 0.06) ? 8 : r.range(0.15, 2.4));
    peer.bot = { n: driver.n, at: now + think, hold: custom?.hold ?? r.chance(0.5), invalid: custom?.invalid ?? false, shot: custom?.shot ?? null };
  }
  const plan = peer.bot;
  // Segura o botão nos últimos instantes (graça do último lance).
  peer.holding = plan.hold && !(state.phase === "penalties") && state.clock < 1.2 && now < plan.at + 0.5;
  if (now < plan.at) return;
  peer.holding = false;
  if (plan.shot) {
    const disc = state.bodies.find((body) => body.id === plan.shot.bodyId);
    driver.shoot(disc.id, E.aimFromDrag(disc, disc.x + plan.shot.dx, disc.y + plan.shot.dy));
    plan.at = Infinity;
    return;
  }
  if (plan.invalid) {
    driver.releaseInvalid();
    plan.at = Infinity;
    return;
  }
  if (state.phase === "penalties") {
    const shooter = E.penaltyShooter(state);
    const goalY = E.attackGoalY(state.penalties.turn);
    const tx = peer.rng.range(E.GOAL_LEFT - 20, E.GOAL_RIGHT + 20);
    const pull = peer.rng.range(30, 120);
    const angle = Math.atan2(goalY - shooter.y, tx - shooter.x);
    const aim = E.aimFromDrag(shooter, shooter.x - Math.cos(angle) * pull, shooter.y - Math.sin(angle) * pull);
    driver.shoot(shooter.id, aim);
    return;
  }
  const discs = E.discsOf(state, side).filter((disc) => E.canShoot(state, disc.id));
  const ball = E.ballOf(state);
  const disc = discs[peer.rng.int(0, discs.length - 1)];
  const angle = peer.rng.chance(0.75) ? Math.atan2(ball.y - disc.y, ball.x - disc.x) + peer.rng.range(-0.25, 0.25) : peer.rng.range(-Math.PI, Math.PI);
  const pull = peer.rng.range(25, 130);
  const aim = E.aimFromDrag(disc, disc.x - Math.cos(angle) * pull, disc.y - Math.sin(angle) * pull);
  driver.shoot(disc.id, aim);
}

/** Roda os peers em tempo virtual até todos terminarem (ou `until` dizer chega). */
function run(net, peers, { limit = 900, until = null, script = null, beforeFrame = null } = {}) {
  // Cada peer continua do seu próximo quadro; quem entra agora começa no relógio da rede.
  for (const peer of peers) if (peer.next === undefined || peer.next < net.now) peer.next = net.now;
  for (let guard = 0; guard < 5e6; guard += 1) {
    const peer = peers.reduce((a, b) => (b.next < a.next ? b : a));
    const now = peer.next;
    if (now > limit) return false;
    net.deliver(now);
    beforeFrame?.(peer, now);
    const dt = 1 / peer.hz + (peer.jitter ? peer.rng.range(-peer.jitter, peer.jitter) : 0);
    if (peer.frames === undefined) peer.frames = 0;
    peer.frames += 1;
    if (!peer.passive) botStep(peer, now, script);
    peer.driver.frame(peer.lastAt === undefined ? 0 : now - peer.lastAt, { holding: peer.holding });
    peer.lastAt = now;
    peer.next = now + dt;
    if (until ? until(now) : peers.every((candidate) => candidate.driver.finished())) return true;
  }
  return false;
}

function duel(seed, { rules = SHORT, latency = 0.04, view3d = [false, false], hzB = 144, jitterB = 0.0003, extra = {}, mutate } = {}) {
  const net = new Net(typeof latency === "function" ? latency : () => latency);
  const desk = new OrderDesk();
  const setup = setupFor(seed, rules, extra);
  const authority = makePeer({ net, desk, name: "authority", setup, perspective: "user", controls: { user: "local", cpu: "remote" }, hz: 60, seed: seed * 3 + 1, view3d: view3d[0], mutate });
  const follower = makePeer({ net, desk, name: "follower", setup: clone(setup), perspective: "cpu", controls: { user: "remote", cpu: "local" }, hz: hzB, jitter: jitterB, seed: seed * 3 + 2, view3d: view3d[1], mutate });
  authority.link.peers = [follower.link];
  follower.link.peers = [authority.link];
  desk.authority = authority;
  desk.follower = follower;
  return { net, desk, setup, authority, follower };
}

function restsAgree(a, b) {
  const byN = new Map(a.link.rests.map((rest) => [rest.n, rest]));
  let compared = 0;
  for (const rest of b.link.rests) {
    const other = byN.get(rest.n);
    if (!other) continue;
    assert.equal(rest.h, other.h, `descanso ${rest.n}: hash diferente (${rest.key} × ${other.key})`);
    compared += 1;
  }
  return compared;
}

// ---------------------------------------------------------------------------
// 1. Dois aparelhos, quadros diferentes, 50 partidas: mesmo hash e mesmo resultado
// ---------------------------------------------------------------------------

test("50 partidas: 60 Hz × 144 Hz com jitter terminam com o mesmo hash e o mesmo resultado", () => {
  const coverage = { goal: 0, idle: 0, pmiss: 0, expire: 0, grace: 0, porder: 0, shootout: 0, interval: 0 };
  for (let index = 0; index < 50; index += 1) {
    const { authority, follower, net } = duel(1000 + index, { latency: index % 5 === 0 ? 0.12 : 0.04 });
    const done = run(net, [authority, follower], { limit: 1200 });
    assert.ok(done, `partida ${index} não terminou`);
    const a = authority.state;
    const b = follower.state;
    assert.equal(M.hashMatch(a), M.hashMatch(b), `partida ${index}: estado final diferente`);
    assert.deepEqual(clone(authority.driver.finished()), clone(follower.driver.finished()), `partida ${index}: resultado diferente`);
    assert.ok(restsAgree(authority, follower) > 3);
    assert.equal(authority.link.syncRequests.length + follower.link.syncRequests.length, 0, `partida ${index}: pediu sincronia sem motivo`);
    // Cada descanso relatado uma vez só, em ordem.
    for (const peer of [authority, follower]) {
      const ns = peer.link.rests.map((rest) => rest.n);
      assert.deepEqual(ns, [...new Set(ns)].sort((x, y) => x - y));
      // turnOpened uma vez por n.
      const opened = peer.link.opened.map((entry) => entry.n);
      assert.equal(opened.length, new Set(opened).size, "turnOpened repetido");
    }
    const actions = [...authority.link.submitted, ...follower.link.submitted];
    for (const action of actions) {
      if (action.kind === "idle") coverage.idle += 1;
      if (action.kind === "pmiss") coverage.pmiss += 1;
      if (action.kind === "expire") coverage.expire += 1;
      if (action.kind === "shot" && action.grace) coverage.grace += 1;
    }
    coverage.goal += a.timeline.filter((entry) => entry.kind === "goal" || entry.kind === "own-goal").length;
    coverage.interval += a.timeline.filter((entry) => entry.kind === "period-end").length;
    if (a.result.decision === "penalties") coverage.shootout += 1;
    coverage.porder += authority.link.rests.filter((rest) => rest.phase === "penalties").length > 0 ? 1 : 0;
  }
  // O roteiro aleatório passou pelos caminhos que importam.
  assert.ok(coverage.goal > 8, JSON.stringify(coverage));
  assert.ok(coverage.pmiss > 0 && coverage.expire > 0 && coverage.grace > 0, JSON.stringify(coverage));
  assert.ok(coverage.idle > 0, JSON.stringify(coverage));
  assert.ok(coverage.shootout > 0, JSON.stringify(coverage));
  assert.ok(coverage.interval > 0, JSON.stringify(coverage));
});

// ---------------------------------------------------------------------------
// Cenários dirigidos
// ---------------------------------------------------------------------------

/** Mesa montada para o toque 0 do usuário virar gol: bola na boca do gol de cima, caminho livre. */
function goalReady(state) {
  state.turn = "user";
  state.phase = "kickoff";
  state.clockPausedForKickoff = false;
  const ball = E.ballOf(state);
  ball.x = 150;
  ball.y = 40;
  let user = 0;
  let cpu = 0;
  for (const body of state.bodies) {
    if (body.kind !== "disc") continue;
    if (body.id === "user-0") {
      body.x = 150;
      body.y = 80;
    } else if (body.side === "user") {
      body.x = 30 + 70 * user++;
      body.y = 240;
    } else {
      body.x = 30 + 60 * cpu++;
      body.y = 330;
    }
  }
}
/** Toque reto para cima, força máxima. */
const STRAIGHT_UP = { bodyId: "user-0", dx: 0, dy: 130 };

const actionAt = (peer, kind, n = null) => peer.link.submitted.find((action) => action.kind === kind && (n === null || action.n === n));
const openedAt = (peer, n) => peer.link.opened.find((entry) => entry.n === n);
const restAt = (peer, n) => peer.link.rests.find((rest) => rest.n === n);
/** Quando o peer escreveu a ação n (tempo virtual do aparelho que escreveu). */
function writtenAt(peer, n) {
  const index = peer.link.submitted.findIndex((action) => action.n === n);
  return index < 0 ? null : peer.submitTimes?.[index] ?? null;
}
function trackSubmits(peer) {
  peer.submitTimes = [];
  const submit = peer.link.submit.bind(peer.link);
  peer.link.submit = (action) => {
    peer.submitTimes.push(peer.link.net.now);
    submit(action);
  };
}
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(4)} longe de ${expected.toFixed(4)} (±${tolerance})`);

test("relógio exato: o toque da graça leva clock 0 e grace, e o próprio log reaplicado depois de recarregar encerra o tempo", () => {
  const rules = { ...SHORT, halfSeconds: 3, goalLimit: 0 };
  const { authority, follower, net } = duel(41, { rules, extra: { userIsHost: true } });
  trackSubmits(authority);
  // A autoridade segura o botão até o tempo zerar e solta na graça (4,2 s depois de abrir o turno).
  const script = (peer, n) => (peer === authority && n === 0 ? { think: 4.2, hold: true } : { think: 0.4, hold: false });
  run(net, [authority, follower], { script, until: () => restAt(follower, 1) && restAt(authority, 1), limit: 60 });
  const shot = actionAt(authority, "shot", 0);
  assert.ok(shot, "a autoridade não chutou na graça");
  assert.equal(shot.clock, 0);
  assert.equal(shot.grace, true);
  assert.equal(authority.state.phase, follower.state.phase);
  assert.equal(restAt(authority, 1).h, restAt(follower, 1).h);
  assert.equal(restAt(authority, 1).phase, "interval", "o lance da graça termina o tempo");
  assert.equal(restAt(follower, 1).match.clock, 0);

  // Recarregar a autoridade: descanso 0 + a própria ação 0 do log → mesmo descanso 1.
  const net2 = new Net(() => 0.04);
  const reborn = makePeer({ net: net2, name: "authority", setup: authority.state.setup, perspective: "user", controls: { user: "local", cpu: "remote" }, hz: 60, seed: 9, restore: { match: restAt(authority, 0).match, n: 0 } });
  reborn.passive = true;
  reborn.link.receive(clone(shot));
  run(net2, [reborn], { until: () => restAt(reborn, 1), limit: 30 });
  assert.equal(restAt(reborn, 1).h, restAt(authority, 1).h, "o lance da graça reaplicado do log dá o mesmo descanso");
  assert.equal(reborn.state.phase, "interval");
});

test("7 s: pênalti por demora para os dois lados, contados do turnOpened (depois da pausa do gol e do intervalo)", () => {
  // Lado do seguidor: gol, pausa do gol (2400) e só então os 7 s.
  {
    const rules = { ...SHORT, halfSeconds: 60, goalLimit: 0 };
    const { authority, follower, net } = duel(52, { rules, extra: { userIsHost: true }, mutate: goalReady });
    trackSubmits(authority);
    trackSubmits(follower);
    // Toque 0 é gol; depois o seguidor (que sofreu) sai jogando e não toca: idle do lado cpu.
    const script = (peer, n) => (peer === authority && n === 0 ? { think: 0.5, shot: STRAIGHT_UP } : { think: 30, hold: false });
    run(net, [authority, follower], { script, until: () => actionAt(follower, "idle"), limit: 60 });
    const goalRest = restAt(authority, 1);
    assert.equal(goalRest.phase, "goal");
    assert.equal(goalRest.pres.kind, "goal");
    assert.equal(goalRest.pres.remainingMs, ONLINE_TIMING.GOAL_PAUSE_MS);
    const followerGoalRest = restAt(follower, 1);
    assert.equal(followerGoalRest.h, goalRest.h);
    const opened = openedAt(follower, 1);
    near(opened.at - followerGoalRest.at, ONLINE_TIMING.GOAL_PAUSE_MS / 1000, 0.02, "turno abre depois da pausa do gol");
    const idle = actionAt(follower, "idle");
    assert.equal(idle.side, "cpu");
    near(writtenAt(follower, idle.n) - opened.at, 7, 0.02, "7 s contados do turnOpened");
    // O pênalti vai para o usuário: quem bate é a autoridade.
    run(net, [authority, follower], { script, until: () => authority.driver.localTurn() === "user" && follower.state.phase === "penalties", limit: 80 });
    assert.equal(authority.state.penalties.turn, "user");
    assert.equal(authority.state.penaltyReason, "inactivity");
    assert.equal(follower.driver.localTurn(), null);
    assert.equal(restAt(authority, idle.n + 1).h, restAt(follower, idle.n + 1).h);
  }
  // Lado do usuário, depois do intervalo de 5 s.
  {
    const rules = { ...SHORT, halfSeconds: 2, halves: 2, goalLimit: 0 };
    const { authority, follower, net } = duel(53, { rules, extra: { userIsHost: true } });
    trackSubmits(authority);
    trackSubmits(follower);
    let intervalRest = null;
    const script = () => ({ think: 30, hold: false });
    run(net, [authority, follower], {
      script,
      until: () => {
        intervalRest ??= authority.link.rests.find((rest) => rest.phase === "interval") ?? null;
        return actionAt(authority, "idle") || actionAt(follower, "idle");
      },
      limit: 90,
    });
    // Tempo 1: ninguém toca e o relógio (2 s) acaba antes dos 7 s → expire, intervalo de 5 s.
    assert.ok(intervalRest, "não houve intervalo");
    assert.equal(intervalRest.pres.kind, "interval");
    const opened = authority.link.opened.find((entry) => entry.n === intervalRest.n);
    near(opened.at - intervalRest.at, ONLINE_TIMING.INTERVAL_MS / 1000, 0.02, "turno abre depois do intervalo");
    const idlePeer = actionAt(authority, "idle") ? authority : follower;
    const idle = actionAt(idlePeer, "idle");
    const idleOpened = openedAt(idlePeer, idle.n);
    near(writtenAt(idlePeer, idle.n) - idleOpened.at, 7, 0.02, "7 s do turnOpened");
    run(net, [authority, follower], { script, until: () => restAt(authority, idle.n + 1) && restAt(follower, idle.n + 1), limit: 120 });
    assert.equal(restAt(authority, idle.n + 1).h, restAt(follower, idle.n + 1).h);
    assert.equal(authority.state.penalties?.turn, idle.side === "user" ? "cpu" : "user");
  }
});

test("graça: 7 s segurando viram expire; soltar curto na graça também; quem recebe encerra o tempo igual", () => {
  for (const variant of ["hold", "invalid"]) {
    const rules = { ...SHORT, halfSeconds: 3, goalLimit: 0 };
    const { authority, follower, net } = duel(61, { rules, extra: { userIsHost: true } });
    trackSubmits(authority);
    const script = (peer, n) => (peer === authority && n === 0
      ? variant === "hold" ? { think: 100, hold: true } : { think: 3.6, hold: true, invalid: true }
      : { think: 0.5, hold: false });
    let sawGrace = false;
    run(net, [authority, follower], {
      script,
      until: () => {
        sawGrace ||= authority.state.finalShotGrace;
        return restAt(authority, 1) && restAt(follower, 1);
      },
      limit: 40,
    });
    assert.ok(sawGrace, `${variant}: a graça não armou`);
    const expire = actionAt(authority, "expire", 0);
    assert.ok(expire, `${variant}: sem expire`);
    if (variant === "hold") near(writtenAt(authority, 0) - openedAt(authority, 0).at, 7, 0.02, "7 s também na graça");
    assert.equal(authority.state.finalShotGrace, false);
    assert.equal(restAt(authority, 1).phase, "interval");
    assert.equal(restAt(authority, 1).h, restAt(follower, 1).h);
  }
});

test("limite do pênalti: 10 s viram pmiss, a pausa é de 1600 ms e o descanso seguinte já é a cobrança fechada", () => {
  const rules = { ...SHORT, penaltyRounds: 3 };
  const { authority, follower, net } = duel(71, { rules, extra: { userIsHost: true }, mutate: (state) => E.jumpToPenalties(state) });
  trackSubmits(authority);
  const countdowns = new Set();
  const script = (peer) => (peer === authority ? { think: 100 } : { think: 1 });
  run(net, [authority, follower], {
    script,
    beforeFrame: () => {
      const value = authority.driver.kickCountdown();
      if (value !== null) countdowns.add(value);
    },
    until: () => {
      const miss = actionAt(authority, "pmiss");
      return miss && restAt(authority, miss.n + 1) && restAt(follower, miss.n + 1);
    },
    limit: 90,
  });
  const miss = actionAt(authority, "pmiss");
  assert.ok(miss);
  // A ordem dos batedores (porder) foi a ação 0: os dois aplicaram.
  assert.equal(restAt(authority, 1).phase, "penalties");
  assert.equal(restAt(authority, 1).h, restAt(follower, 1).h);
  near(writtenAt(authority, miss.n) - openedAt(authority, miss.n).at, ONLINE_TIMING.KICK_LIMIT_S, 0.02, "10 s do turnOpened");
  assert.deepEqual([...countdowns].sort(), [1, 2, 3]);
  const after = restAt(authority, miss.n + 1);
  near(after.at - writtenAt(authority, miss.n), ONLINE_TIMING.PENALTY_PAUSE_MS / 1000, 0.02, "pausa do DEMOROU");
  assert.equal(after.h, restAt(follower, miss.n + 1).h);
  assert.deepEqual(after.match.penalties.results.user, [false], "a cobrança perdida já está no descanso");
  assert.ok(authority.log.flashes.some((flash) => flash.text === "DEMOROU! COBRANÇA PERDIDA" && flash.tone === "bad"));
  assert.ok(follower.log.flashes.some((flash) => flash.text === "DEMOROU! COBRANÇA PERDIDA" && flash.tone === "goal"));
});

test("alcançar o outro lado: fila adiante = física e pausas 4×; uma ação só (a de índice n) não acelera", () => {
  const rules = { ...SHORT, halfSeconds: 200, goalLimit: 0 };
  const net = new Net(() => 0.03);
  const setup = setupFor(81, rules, { userIsHost: true });
  // Os dois lados na mesma mão (anfitrião local dos dois lados); o espectador só recebe.
  const host = makePeer({ net, name: "authority", setup, perspective: "user", controls: { user: "local", cpu: "local" }, hz: 60, seed: 3 });
  const viewer = makePeer({ net, name: "viewer", setup: clone(setup), perspective: "neutral", controls: { user: "remote", cpu: "remote" }, hz: 60, seed: 4 });
  viewer.passive = true;
  const held = [];
  host.link.submit = (action) => {
    host.link.submitted.push(clone(action));
    held.push({ action: clone(action), at: net.now });
  };
  run(net, [host], { script: () => ({ think: 0.3, hold: false }), until: () => host.link.rests.length >= 8, limit: 200 });
  const hostDuration = restAt(host, 6).at - restAt(host, 0).at;
  // O espectador chega atrasado: recebe as ações 0..6 de uma vez.
  for (const { action } of held.filter((entry) => entry.action.n <= 6)) viewer.link.receive(clone(action));
  const applied = new Map();
  const consume = viewer.link.consume.bind(viewer.link);
  viewer.link.consume = (n) => {
    applied.set(n, net.now);
    consume(n);
  };
  const start = net.now;
  run(net, [viewer], { until: () => restAt(viewer, 7), limit: start + 200 });
  const viewerDuration = restAt(viewer, 6).at - start;
  for (let n = 0; n <= 7; n += 1) assert.equal(restAt(viewer, n).h, restAt(host, n).h, `descanso ${n}`);
  assert.ok(viewerDuration < hostDuration / 2.5, `alcançou devagar: ${viewerDuration.toFixed(2)} s × ${hostDuration.toFixed(2)} s`);
  // aheadOf é sempre perguntado com o n da próxima ação.
  assert.ok(viewer.link.aheadCalls.length > 0);
  assert.ok(viewer.link.aheadCalls.every((n) => Number.isInteger(n) && n >= 0 && n <= 7));
  // A ação 6 ficou sozinha na fila (aheadOf(6) = 0): rola em tempo real, como no anfitrião (± 2 quadros).
  const six = held.find((entry) => entry.action.n === 6);
  assert.equal(six.action.kind, "shot", "a ação 6 deveria ser um toque");
  const hostRoll = restAt(host, 7).at - six.at;
  const viewerRoll = restAt(viewer, 7).at - applied.get(6);
  near(viewerRoll, hostRoll, 2.5 / 60, "uma ação só na fila roda a 1×");
});

test("pausas fixas online: 2D e 3D esperam o mesmo depois do gol", () => {
  const rules = { ...SHORT, halfSeconds: 60, goalLimit: 0 };
  const { authority, follower, net } = duel(91, { rules, view3d: [true, false], extra: { userIsHost: true }, mutate: goalReady });
  const script = (peer, n) => (peer === authority && n === 0 ? { think: 0.4, shot: STRAIGHT_UP } : { think: 30, hold: false });
  run(net, [authority, follower], { script, until: () => openedAt(authority, 1) && openedAt(follower, 1), limit: 30 });
  for (const peer of [authority, follower]) {
    const rest = restAt(peer, 1);
    assert.equal(rest.phase, "goal");
    near(openedAt(peer, 1).at - rest.at, ONLINE_TIMING.GOAL_PAUSE_MS / 1000, 0.02, `${peer.name}: pausa do gol`);
  }
});

test("hydrate: adoção silenciosa mantém a pausa e repete as transições; outra fase re-deriva a pausa do pres", () => {
  const rules = { ...SHORT, halfSeconds: 60, goalLimit: 0 };
  const script = (peer, n) => (peer.name === "authority" && n === 0 ? { think: 0.4, shot: STRAIGHT_UP } : { think: 30, hold: false });
  // (a) No meio da pausa do gol: a diretiva do mesmo descanso (números finos diferentes) não reinicia a pausa.
  {
    const { authority, follower, net } = duel(101, { rules, extra: { userIsHost: true }, mutate: goalReady });
    run(net, [authority, follower], { script, until: () => restAt(follower, 1) && net.now > restAt(follower, 1).at + 1, limit: 30 });
    const before = follower.driver.presentation();
    assert.equal(before.kind, "goal");
    const match = clone(restAt(authority, 1).match);
    match.bodies.find((body) => body.kind === "ball").x += 1e-7;
    follower.link.directives.push({ type: "sync", n: 1, se: 0, match, pres: { kind: "goal", remainingMs: ONLINE_TIMING.GOAL_PAUSE_MS }, reason: "hash" });
    run(net, [authority, follower], { script, until: () => follower.link.directives.length === 0, limit: net.now + 1 });
    const after = follower.driver.presentation();
    assert.equal(after.kind, "goal");
    assert.ok(after.remainingMs <= before.remainingMs, `a pausa recomeçou: ${after.remainingMs} > ${before.remainingMs}`);
    assert.equal(E.ballOf(follower.state).x, match.bodies.find((body) => body.kind === "ball").x, "adotou o estado");
    // (a2) Depois da pausa (transição "resume" já feita), a mesma diretiva repete a transição em silêncio.
    run(net, [authority, follower], { script, until: () => follower.state.phase === "kickoff" && authority.state.phase === "kickoff", limit: net.now + 5 });
    const key = M.matchKey(follower.state);
    const eventsBefore = follower.log.events.length;
    follower.link.directives.push({ type: "sync", n: 1, se: 0, match: clone(match), pres: null, reason: "hash" });
    run(net, [authority, follower], { script, until: () => follower.link.directives.length === 0, limit: net.now + 1 });
    assert.equal(M.matchKey(follower.state), key, "a transição local foi repetida");
    assert.equal(follower.state.phase, "kickoff");
    assert.equal(follower.log.events.length, eventsBefore, "silenciosa: nenhum som/flash");
    assert.equal(M.hashMatch(follower.state), M.hashMatch(authority.state));
  }
  // (b) Seguidor em jogo corrido recebe um descanso de gol: re-deriva a pausa do pres e sintetiza o gol.
  {
    const { authority, follower, net } = duel(102, { rules, extra: { userIsHost: true }, mutate: goalReady });
    run(net, [authority, follower], { script, until: () => restAt(authority, 1), limit: 30 });
    const goalRest = restAt(authority, 1);
    const lone = makePeer({ net: new Net(), name: "follower", setup: clone(authority.state.setup), perspective: "cpu", controls: { user: "remote", cpu: "local" }, hz: 60, seed: 5, restore: { match: restAt(authority, 0).match, n: 0 } });
    lone.driver.frame(0, { holding: false });
    lone.link.directives.push({ type: "sync", n: 1, se: 1, match: clone(goalRest.match), pres: { kind: "goal", remainingMs: 900 }, reason: "fork" });
    lone.driver.frame(1 / 60, { holding: false });
    assert.equal(lone.state.phase, "goal");
    const pres = lone.driver.presentation();
    assert.equal(pres.kind, "goal");
    assert.ok(pres.remainingMs <= 900 && pres.remainingMs > 850, String(pres.remainingMs));
    assert.ok(lone.log.events.some((event) => event.type === "goal"), "o gol não visto vira evento");
    assert.equal(lone.driver.n, 1);
    assert.equal(M.hashMatch(lone.state), goalRest.h);
    void follower;
  }
});

test("piso da volta: congelado com 1 s de 7 s, volta com 3 s", () => {
  const rules = { ...SHORT, halfSeconds: 60, goalLimit: 0 };
  const { authority, follower, net } = duel(111, { rules, extra: { userIsHost: true } });
  trackSubmits(authority);
  const script = () => ({ think: 100, hold: false });
  run(net, [authority, follower], { script, until: () => openedAt(authority, 0) && net.now >= openedAt(authority, 0).at + 6, limit: 30 });
  authority.link.frozen = true;
  follower.link.frozen = true;
  const frozenAt = net.now;
  run(net, [authority, follower], { script, until: () => net.now >= frozenAt + 5, limit: 40 });
  assert.equal(actionAt(authority, "idle"), undefined, "congelado não conta os 7 s");
  authority.link.frozen = false;
  follower.link.frozen = false;
  const resumedAt = net.now;
  run(net, [authority, follower], { script, until: () => actionAt(authority, "idle"), limit: 60 });
  near(writtenAt(authority, 0) - resumedAt, 3, 0.03, "piso de 3 s");
});

test("piso da volta depois de recarregar: o turno reaberto dos timers do checkpoint também ganha 3 s (7 s e limite do pênalti)", () => {
  /** Recarrega um dono no descanso n com os timers do checkpoint, congelado até a contagem acabar. */
  const reload = (setup, rest, timers) => {
    const net = new Net(() => 0.04);
    const peer = makePeer({ net, name: "authority", setup, perspective: "user", controls: { user: "local", cpu: "remote" }, hz: 60, seed: 7, restore: { match: rest.match, n: rest.n, timers } });
    peer.passive = true;
    trackSubmits(peer);
    peer.link.frozen = true;
    run(net, [peer], { until: () => net.now >= 2, limit: 10 });
    assert.equal(peer.link.opened.length, 0, "congelado não abre o turno");
    peer.link.frozen = false;
    return { net, peer, resumedAt: net.now };
  };
  // 7 s: o checkpoint tinha 0,7 s; sem o piso o idle sairia 0,7 s depois da contagem (pênalti para o outro lado).
  {
    const rules = { ...SHORT, halfSeconds: 60, goalLimit: 0 };
    const { authority, follower, net } = duel(112, { rules, extra: { userIsHost: true } });
    run(net, [authority, follower], { script: () => ({ think: 100, hold: false }), until: () => openedAt(authority, 0) && net.now >= openedAt(authority, 0).at + 6.3, limit: 30 });
    const rest = restAt(authority, 0);
    const timers = { turnN: 0, ownerClock: authority.state.clock, idleLeft: 0.7, kickLeft: null };
    const { net: net2, peer, resumedAt } = reload(authority.state.setup, rest, timers);
    run(net2, [peer], { until: () => actionAt(peer, "idle"), limit: 20 });
    assert.equal(actionAt(peer, "idle").side, "user");
    near(writtenAt(peer, 0) - resumedAt, 3, 0.03, "7 s restaurado com piso de 3 s");
    // O relógio do dono continua o do checkpoint (o piso não devolve tempo de jogo).
    assert.ok(rest.match.clock > timers.ownerClock, "o descanso 0 tem o relógio cheio");
    assert.ok(peer.state.clock <= timers.ownerClock, `relógio recomprado: ${peer.state.clock} > ${timers.ownerClock}`);
    // Checkpoint com folga (5 s): o piso não mexe.
    const roomy = reload(authority.state.setup, rest, { ...timers, idleLeft: 5 });
    run(roomy.net, [roomy.peer], { until: () => actionAt(roomy.peer, "idle"), limit: 20 });
    near(writtenAt(roomy.peer, 0) - roomy.resumedAt, 5, 0.03, "7 s restaurado sem piso");
  }
  // Limite do pênalti: o checkpoint tinha 0,5 s de 10 s; sem o piso sairia um pmiss quase na hora.
  {
    const rules = { ...SHORT, penaltyRounds: 3 };
    const { authority, follower, net } = duel(71, { rules, extra: { userIsHost: true }, mutate: (state) => E.jumpToPenalties(state) });
    run(net, [authority, follower], { script: () => ({ think: 100 }), until: () => restAt(authority, 1) && openedAt(authority, 1), limit: 40 });
    const rest = restAt(authority, 1);
    assert.equal(rest.phase, "penalties");
    assert.equal(rest.match.penalties.turn, "user");
    const { net: net2, peer, resumedAt } = reload(authority.state.setup, rest, { turnN: 1, ownerClock: rest.match.clock, idleLeft: 0, kickLeft: 0.5 });
    run(net2, [peer], { until: () => actionAt(peer, "pmiss"), limit: 20 });
    near(writtenAt(peer, 1) - resumedAt, 3, 0.03, "limite do pênalti restaurado com piso de 3 s");
  }
});

test("finishLabel e flashTone pela perspectiva (usuário, convidado, espectador)", () => {
  const make = (perspective, stageName) => makePeer({ net: new Net(), name: "x", setup: setupFor(5, SHORT, { stageName }), perspective, controls: { user: "remote", cpu: "remote" }, hz: 60, seed: 1 }).driver;
  const win = { outcome: "win" };
  const loss = { outcome: "loss" };
  assert.deepEqual(make("user", "X1").finishLabel(win), { text: "VITÓRIA!", tone: "goal", won: true });
  assert.deepEqual(make("cpu", "X1").finishLabel(win), { text: "FIM DE JOGO", tone: "bad", won: false });
  assert.deepEqual(make("cpu", "Final").finishLabel(loss), { text: "CAMPEÃO!", tone: "goal", won: true });
  assert.deepEqual(make("user", "Semifinal").finishLabel(win), { text: "CLASSIFICADO!", tone: "goal", won: true });
  assert.deepEqual(make("neutral", "Final").finishLabel(win), { text: "FIM DE JOGO", tone: "info", won: null });
  const user = make("user", "X1");
  const guest = make("cpu", "X1");
  const viewer = make("neutral", "X1");
  assert.equal(user.flashTone("user", "goal"), "goal");
  assert.equal(user.flashTone("cpu", "goal"), "bad");
  assert.equal(user.flashTone("cpu", "save"), "goal", "defesa do meu goleiro");
  assert.equal(guest.flashTone("cpu", "goal"), "goal");
  assert.equal(guest.flashTone("user", "save"), "goal");
  assert.equal(guest.flashTone("cpu", "save"), "bad");
  assert.equal(viewer.flashTone("user", "goal"), "info");
  assert.equal(viewer.flashTone("cpu", "save"), "info");
});

test("apresentação online (fora do pacote offline): recomeço pela fábrica, textos pela perspectiva, mira remota, toque e pista 2D", () => {
  // O recomeço vem pela fábrica do driver (mesmo import() da rota), não pela BotaoMatch.
  const restoreSetup = setupFor(7, SHORT);
  const fresh = E.createMatch(restoreSetup);
  assert.equal(M.hashMatch(D.createOnlineDriver.restore(restoreSetup, M.serializeMatch(fresh))), M.hashMatch(fresh));

  const make = (perspective, extra = {}) => makePeer({ net: new Net(), name: "x", setup: setupFor(7, SHORT, extra), perspective, controls: { user: "remote", cpu: "remote" }, hz: 60, seed: 1 }).driver;
  const goal = { side: "user", scorer: "Zé Carlos", ownGoal: false };
  const plainMs = ONLINE_TIMING.GOAL_PAUSE_MS - 200;
  assert.deepEqual(make("user").goalCall(goal), { text: "SEU GOL!", tone: "goal", ms: plainMs, caption: null });
  assert.deepEqual(make("cpu").goalCall(goal), { text: "TOMOU GOL", tone: "bad", ms: plainMs, caption: null });
  assert.deepEqual(make("neutral").goalCall(goal), { text: "GOL · ZÉ CARLOS", tone: "info", ms: plainMs, caption: null });
  assert.equal(make("user").goalCall({ ...goal, ownGoal: true }).text, "GOL CONTRA");

  // Demora: quem ganhou a cobrança é o outro lado; o texto é pela perspectiva.
  assert.deepEqual(make("user").inactivityCall(), { tone: "bad", text: "Você demorou. Pênalti para Bandeirantes." });
  assert.deepEqual(make("cpu").inactivityCall(), { tone: "goal", text: "Rei do Peteleco demorou. Pênalti para Bandeirantes." });
  const formation = { type: "formation", userFormation: "1-2-1", cpuFormation: "2-2" };
  assert.equal(make("neutral").formationText(formation), null);
  assert.match(make("user").formationText(formation), /^Formação .+ · .+$/);

  // Comemoração longa do autor: texto, tarja do 3D, pausa esticada e a pista 2D desenhada por baixo dos botões.
  const kame = { celebration: 13 };
  const signed = make("cpu", { visuals: { enabled: true, player: kame, user: [kame, kame, kame, kame, kame], cpu: [] } });
  const realNow = Object.getOwnPropertyDescriptor(performance, "now");
  let clock = 1000;
  performance.now = () => clock;
  try {
    signed.state.phase = "goal";
    signed.state.touches.push({ bodyId: "user-0", side: "user" });
    const call = signed.goalCall(goal);
    assert.deepEqual(call, { text: "KAMEHAMEHA! · ZÉ CARLOS", tone: "bad", ms: ONLINE_TIMING.GOAL_PAUSE_MS + 1000 - 200, caption: "Kamehameha" });
    assert.equal(signed.renderExtras().underlay, null, "a pista começa quando o 3D dispararia o raio");
    clock += 900 + 650;
    const extras = signed.renderExtras();
    assert.deepEqual(extras.cue, { scorerId: "user-0", color: D.SIGNATURE_CUE_COLORS.kamehameha, progress: 0.5, kind: "kamehameha" });
    const painted = [];
    const ctx = new Proxy({}, { get: (target, key) => (key in target ? target[key] : () => painted.push(key)), set: (target, key, value) => ((target[key] = value), true) });
    extras.underlay(ctx);
    assert.ok(painted.includes("fillRect") && painted.includes("stroke"), painted.join(","));
    signed.state.phase = "kickoff";
    assert.equal(signed.renderExtras().cue, null);
    signed.state.phase = "goal";
    assert.equal(signed.renderExtras().cue, null, "a pista não volta depois da saída de bola");
  } finally {
    if (realNow) Object.defineProperty(performance, "now", realNow);
    else delete performance.now;
  }

  // Vez aberta: só o lado deste aparelho toca; o outro vê a mira remota, o rótulo e a chave do HUD pela perspectiva.
  const { authority, follower, net } = duel(77, { rules: { ...SHORT, halfSeconds: 60 }, extra: { userIsHost: true } });
  run(net, [authority, follower], { script: () => ({ think: 30, hold: false }), until: () => authority.driver.localTurn() && follower.driver.remoteTurn(), limit: 20 });
  const state = authority.state;
  const mine = E.discsOf(state, "user").find((disc) => E.canShoot(state, disc.id));
  const theirs = E.discsOf(state, "cpu")[0];
  assert.equal(authority.driver.shootableAt(mine.x, mine.y)?.id, mine.id);
  assert.equal(authority.driver.shootableAt(theirs.x, theirs.y), null);
  assert.equal(follower.driver.shootableAt(mine.x, mine.y), null, "o convidado não toca na vez do dono");
  assert.equal(authority.driver.tableLabel(), "Mesa de futebol de botão. Alvorada 0, Bandeirantes 0. Sua vez de chutar.");
  assert.equal(follower.driver.tableLabel(), "Mesa de futebol de botão. Bandeirantes 0, Alvorada 0. Vez de Rei do Peteleco.");
  assert.ok(authority.driver.hudKey().startsWith(`|${authority.driver.n}|user|null|`), authority.driver.hudKey());
  // Prévia da mira: no máximo uma a cada 100 ms; do outro lado vira a mira remota (a 70% no 2D).
  const queued = net.queue.length;
  authority.driver.previewAim(mine.id, mine.x, mine.y + 60);
  authority.driver.previewAim(mine.id, mine.x, mine.y + 70);
  assert.equal(net.queue.length, queued + 1);
  net.deliver(net.now + 1);
  const remote = follower.driver.renderExtras();
  assert.equal(remote.aim?.bodyId, mine.id);
  assert.equal(remote.aim?.dragY, mine.y + 60);
  assert.equal(remote.focusId, null);
  assert.equal(authority.driver.renderExtras().aim, null, "a própria vez não desenha mira remota");

  // decorate: o que só o online põe por cima da vista que a BotaoMatch montou (a vista offline fica como sempre).
  const view = () => ({ selectedId: "x", aim: null, highlight: true, penaltyMode: false, trail: [], goalFlash: 1, goalFlashSide: "user", hideUserMarker: false, penaltyWindup: null });
  const seen = view();
  follower.driver.decorate(seen);
  assert.equal(seen.selectedId, mine.id, "a mira remota escolhe o botão dela");
  assert.equal(seen.aim?.dragY, mine.y + 60);
  assert.equal(seen.remoteAim, true);
  assert.equal(seen.mirrored, true, "o convidado vê a mesa girada");
  assert.equal(seen.goalFlashSide, "cpu", "gol do outro lado: clarão vermelho para o convidado");
  assert.equal(seen.hideUserMarker, true);
  assert.equal(seen.penaltyWindup, null);
  assert.equal(seen.underlay, null);
  const own = view();
  authority.driver.decorate(own);
  assert.equal(own.selectedId, "x", "a própria vez não troca a seleção");
  assert.equal(own.remoteAim, undefined);
  assert.equal(own.mirrored, false);
  assert.equal(own.goalFlashSide, "user");
  const watching = view();
  make("neutral").decorate(watching);
  assert.equal(watching.goalFlashSide, "user", "o espectador vê a cor do lado de verdade");

  // Avisos que a BotaoMatch passa para o driver (texto e tom pela perspectiva, pelos mesmos ganchos).
  const flashesOf = (perspective, act) => {
    const peer = makePeer({ net: new Net(), name: "x", setup: setupFor(7, SHORT), perspective, controls: { user: "remote", cpu: "remote" }, hz: 60, seed: 1 });
    act(peer.driver);
    return peer.log;
  };
  const late = flashesOf("user", (d) => d.announceInactivity());
  assert.deepEqual(late.flashes.map(({ text, tone, ms }) => ({ text, tone, ms })), [{ text: "PÊNALTI POR DEMORA!", tone: "bad", ms: 1700 }]);
  assert.deepEqual(late.announces, ["Você demorou. Pênalti para Bandeirantes."]);
  assert.match(flashesOf("cpu", (d) => d.announceFormation(formation)).flashes[0].text, /^Formação .+ · .+$/);
  assert.equal(flashesOf("neutral", (d) => d.announceFormation(formation)).flashes.length, 0);
  const ended = flashesOf("cpu", (d) => d.announceFinish({ outcome: "loss" }));
  assert.deepEqual(ended.flashes.map(({ text, tone, ms }) => ({ text, tone, ms })), [{ text: "VITÓRIA!", tone: "goal", ms: 2400 }]);

  // A UI online chega pelo driver (import() só com página de verdade): em Node nunca baixa, e a chave do HUD diz isso.
  assert.equal(authority.driver.ui, null);
  assert.ok(authority.driver.hudKey().endsWith("|0"), authority.driver.hudKey());
});

test("drama do pênalti da CPU: só no 3D, sorteio injetado, espera a câmera, e a rng da partida gasta igual com e sem drama", () => {
  const runSolo = (view3d, { settleAfter = 0 } = {}) => {
    const net = new Net();
    const setup = setupFor(121, { ...SHORT, penaltyRounds: 5 }, { userIsHost: true });
    let randomCalls = 0;
    const random = () => {
      randomCalls += 1;
      return 0.5;
    };
    let settleClock = 0;
    const desk = new OrderDesk();
    desk.cpuSide = "cpu";
    const peer = makePeer({
      net, desk, name: "solo", setup, perspective: "user", controls: { user: "local", cpu: "cpu" }, hz: 60, seed: 7, view3d,
      cpu: { rng: createRng(hashSeed(setup.seed, "cpu-brain")), skill: 3 },
      random,
      cameraSettled: () => net.now >= settleClock,
      mutate: (state) => E.jumpToPenalties(state),
    });
    desk.authority = peer;
    trackSubmits(peer);
    const kicks = [];
    const windups = [];
    let pending = null;
    run(net, [peer], {
      script: () => ({ think: 0.6 }),
      beforeFrame: () => {
        const windup = peer.driver.windup();
        if (windup) windups.push(windup);
        // O 3D recebe o relógio cru do drama (decorate) e tira dele o mesmo progresso.
        const decorated = { goalFlashSide: null };
        peer.driver.decorate(decorated);
        if (windup) {
          assert.equal(decorated.penaltyWindup.shooterId, windup.shooterId);
          assert.equal(Math.min(1, decorated.penaltyWindup.elapsedMs / Math.max(1, decorated.penaltyWindup.totalMs)), windup.progress);
        } else assert.equal(decorated.penaltyWindup, null);
        const side = peer.state.penalties?.turn;
        // Antes da CPU bater: cursor da rng da partida e o turno aberto.
        if (peer.state.phase === "penalties" && side === "cpu" && !peer.state.penalties.shotInFlight && !pending && openedAt(peer, peer.driver.n)) {
          pending = { n: peer.driver.n, cursor: peer.state.rng.cursor(), brain: peer.driver.cpuCursor };
          settleClock = net.now + settleAfter;
        }
        if (pending && peer.driver.n > pending.n && restAt(peer, pending.n + 1)) {
          kicks.push({ ...pending, delta: peer.state.rng.cursor() - pending.cursor, brainDelta: peer.driver.cpuCursor - pending.brain, delay: writtenAt(peer, pending.n) - openedAt(peer, pending.n).at });
          pending = null;
        }
      },
      until: () => kicks.length >= 2,
      limit: 120,
    });
    return { kicks, windups, randomCalls };
  };
  const flat = runSolo(false);
  const drama = runSolo(true);
  const slowCamera = runSolo(true, { settleAfter: 5 });
  assert.equal(flat.kicks.length, 2);
  assert.equal(drama.kicks.length, 2);
  assert.equal(slowCamera.kicks.length, 2);
  for (const kick of flat.kicks) near(kick.delay, 0.43, 0.02, "2D: 430 ms");
  for (const kick of drama.kicks) near(kick.delay, 0.43 + 1.3 + 0.5, 0.02, "3D: 430 + 1300 + 0,5 × 1000");
  for (const kick of slowCamera.kicks) near(kick.delay, 0.43 + 1.8 + 0.7, 0.03, "câmera girando: no máximo +700 ms");
  assert.equal(flat.randomCalls, 0, "2D não sorteia drama");
  assert.equal(drama.randomCalls, 2, "um sorteio por cobrança da CPU");
  assert.deepEqual(drama.kicks.map((kick) => kick.delta), flat.kicks.map((kick) => kick.delta), "rng da partida por cobrança igual");
  assert.deepEqual(drama.kicks.map((kick) => kick.brainDelta), flat.kicks.map((kick) => kick.brainDelta), "rng da CPU por cobrança igual");
  assert.equal(flat.windups.length, 0);
  assert.ok(drama.windups.length > 60);
  for (let index = 1; index < drama.windups.length; index += 1) {
    const [a, b] = [drama.windups[index - 1], drama.windups[index]];
    if (a.shooterId !== b.shooterId) continue;
    assert.ok(b.progress >= a.progress && b.remainingS <= a.remainingS);
  }
});

test("rufar do drama no 3D: pênaltis por demora repetem a chave e rufam de novo; a disputa da CPU depois de um também", () => {
  const { drumrollKeyAfter } = loadTs("app/botao/three/Botao3DView.ts");
  /** Os quadros da vista com o drama armado (como o render): rufa quando a chave muda para uma não vazia. */
  const view = (state) => {
    const seen = { key: "", rolls: [] };
    const frame = (remainingS = null) => {
      const penaltyScene = state.phase === "penalties";
      const armed = penaltyScene && state.penalties && !state.penalties.shotInFlight && remainingS !== null;
      const key = drumrollKeyAfter(seen.key, penaltyScene, armed ? state.penalties : null, armed ? remainingS : Infinity);
      if (key && key !== seen.key) seen.rolls.push(key);
      seen.key = key;
    };
    const windup = () => { for (let remaining = 2.6; remaining >= 0; remaining -= 0.1) frame(remaining); };
    return { seen, frame, windup };
  };
  // Usuário parado duas vezes na mesma partida: cada pênalti da CPU rufa uma vez.
  {
    const state = E.createMatch(setupFor(5, { ...SHORT, halfSeconds: 600, goalLimit: 0 }, { userIsHost: true }));
    const { seen, frame, windup } = view(state);
    for (let index = 0; index < 2; index += 1) {
      state.turn = "user";
      assert.equal(E.awardInactivityPenalty(state, "user").length, 1, `demora ${index + 1}`);
      frame();
      windup();
      frame();
      E.commitPenalty(state, false);
      frame();
      frame();
    }
    assert.deepEqual(seen.rolls, ["1|cpu|0|0", "1|cpu|0|0"], "o 2º pênalti por demora ficou mudo");
  }
  // Fora da cena do pênalti a chave volta a vazio: a disputa em que a CPU bate primeiro também rufa.
  {
    const state = E.createMatch(setupFor(6, SHORT, { userIsHost: false }));
    const { seen, frame, windup } = view(state);
    state.turn = "user";
    E.awardInactivityPenalty(state, "user");
    windup();
    E.commitPenalty(state, false);
    frame();
    E.jumpToPenalties(state);
    frame();
    assert.ok(E.confirmPenaltyOrders(state, {}));
    assert.equal(state.penalties.turn, "cpu");
    windup();
    // A mesma cobrança não rufa duas vezes (o drama refeito no meio, quadros repetidos).
    windup();
    assert.deepEqual(seen.rolls, ["1|cpu|0|0", "1|cpu|0|0"]);
  }
  // A chave só vira com o drama perto do fim (1,6 s) e nunca sem o drama armado.
  assert.equal(drumrollKeyAfter("x", true, null, 0), "x");
  assert.equal(drumrollKeyAfter("", true, { round: 2, turn: "user", results: { user: [true], cpu: [false] } }, 1.7), "");
  assert.equal(drumrollKeyAfter("", true, { round: 2, turn: "user", results: { user: [true], cpu: [false] } }, 1.6), "2|user|1|1");
  assert.equal(drumrollKeyAfter("2|user|1|1", false, null, Infinity), "");
});

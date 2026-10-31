// Banco de partidas online para os testes do Bobonline (B2, §11.1).
//
// - No processo principal: `createDuelRig` monta aparelhos (sessão real + DuelController real +
//   OnlineMatchDriver real) sobre o transporte em memória com relógio virtual, com robôs que
//   jogam de forma determinística por (aparelho, n) e ganchos para matar, recarregar, esconder,
//   particionar e cortar a rede de cada aparelho.
// - Como entrada de Worker (worker_threads): roda o SEGUIDOR inteiro (sessão, controlador, driver e
//   motor) com o próprio cache de módulos e com Math.hypot/exp/atan2 desviados em um ulp, falando
//   com o processo principal por MessagePort em passos travados (cenário 2, deriva entre motores).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { loadTs, stubBrowser } from "./ts-loader.mjs";

/**
 * `new Worker(new URL("./x.worker.ts", import.meta.url))` é o padrão que o bundler entende, mas
 * `import.meta` não existe no CommonJS do ts-loader. Nos testes, troca por __filename antes de transpilar.
 */
export function allowImportMeta() {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const original = require.extensions[".ts"];
  if (!original || original.importMetaPatched) return;
  const patched = (module, filename) => {
    const source = readFileSync(filename, "utf8");
    if (!source.includes("import.meta")) return original(module, filename);
    const { outputText } = ts.transpileModule(source.replace(/import.meta.url/g, "require(\"node:url\").pathToFileURL(__filename).href"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
  patched.importMetaPatched = true;
  require.extensions[".ts"] = patched;
}

export const clone = (value) => JSON.parse(JSON.stringify(value));

/** PRNG dos testes (mulberry32): nunca a rng da partida. */
export function prng(seed) {
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

/** Regras curtas: partidas de ~1 min de jogo, com prorrogação e pênaltis possíveis. */
export const SHORT = { goalLimit: 2, halfSeconds: 20, halves: 1, extraHalves: 1, extraSeconds: 10, penaltyRounds: 3 };
export const CODE = "K7MPX3";
export const STEP_MS = 50;
/** Hora de parede dos aparelhos = relógio virtual + isto (o checkpoint guarda hora de parede). */
export const WALL0 = 1_700_000_000_000;

function mix(...parts) {
  let hash = 2166136261;
  const text = parts.join("|");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Módulos (carregados sob demanda: no Worker, depois de perturbar o Math)
// ---------------------------------------------------------------------------

let mods = null;
function modules() {
  if (mods) return mods;
  stubBrowser();
  mods = {
    E: loadTs("app/botao/engine.ts"),
    M: loadTs("app/botao/match-codec.ts"),
    D: loadTs("app/botao/online-driver.ts"),
    rng: loadTs("app/botao/rng.ts"),
    hub: loadTs("app/bobonline/net/memory-transport.ts"),
    S: loadTs("app/bobonline/net/session.ts"),
    I: loadTs("app/bobonline/net/identity.ts"),
    C: loadTs("app/bobonline/match/duel-controller.ts"),
    K: loadTs("app/bobonline/match/checkpoint.ts"),
    G: loadTs("app/bobonline/teams/generator.ts"),
    X: loadTs("app/bobonline/teams/match-setup.ts"),
  };
  return mods;
}

/** Setup real do Bobonline (buildDuelSetup com dois times sorteados), com regras curtas. */
export function setupFor(seed, rules = SHORT, extra = {}) {
  const { G, X } = modules();
  const home = G.randomBobTeam(mix(seed, "home"), { id: "bob-home000000", now: 1 });
  const away = G.randomBobTeam(mix(seed, "away"), { id: "bob-away000000", now: 1 });
  const setup = X.buildDuelSetup({ matchId: `${CODE}-r1m0-${seed}`, seed: mix(CODE, seed), home, away, rules: "flash", stageName: "X1" });
  setup.rules = { ...setup.rules, ...rules };
  return { ...setup, ...extra };
}

// ---------------------------------------------------------------------------
// Robô: decide por (semente do jogador, n), conta o tempo só quando a vez é dele
// ---------------------------------------------------------------------------

/**
 * `plans` é do JOGADOR (sobrevive a recarregar a página). `script(n)` pode fixar
 * { think, hold, shot: {bodyId, dx, dy}, invalid, never }.
 */
export function botStep(dev, dt) {
  const { E } = modules();
  const driver = dev.driver;
  const state = dev.state;
  if (!driver || !state) return;
  if (state.phase === "penalty-setup") {
    if (dev.player.noOrders) return;
    for (const side of ["user", "cpu"]) {
      if (dev.controls[side] !== "local" || driver.orderConfirmed(side) || dev.player.ordered.has(`${driver.n}:${side}`)) continue;
      dev.player.ordered.add(`${driver.n}:${side}`);
      const r = prng(mix(dev.player.seed, "ordem", driver.n, side));
      if (r.chance(0.6)) {
        const order = state.penalties.order[side].slice();
        for (let i = order.length - 1; i > 0; i -= 1) {
          const j = r.int(0, i);
          [order[i], order[j]] = [order[j], order[i]];
        }
        driver.chooseOrder(side, order);
      }
    }
    return;
  }
  const side = driver.localTurn();
  if (!side) {
    dev.holding = false;
    return;
  }
  let plan = dev.player.plans.get(driver.n);
  if (!plan) {
    const r = prng(mix(dev.player.seed, "vez", driver.n));
    const penalties = state.phase === "penalties";
    const custom = dev.player.script?.(driver.n, dev) ?? null;
    const slow = r.chance(dev.player.slowChance ?? 0.05);
    const think = custom?.think ?? (penalties ? (slow ? 11 : r.range(0.2, 2)) : slow ? 8 : r.range(0.1, 1.6));
    plan = { think, waited: 0, hold: custom?.hold ?? r.chance(0.4), shot: custom?.shot ?? null, invalid: custom?.invalid ?? false, never: custom?.never ?? false, seed: mix(dev.player.seed, "toque", driver.n), done: false };
    dev.player.plans.set(driver.n, plan);
  }
  if (plan.done || plan.never) return;
  plan.waited += dt;
  dev.holding = plan.hold && state.phase !== "penalties" && state.clock < 1.2 && plan.waited < plan.think + 0.5;
  if (plan.waited < plan.think) return;
  dev.holding = false;
  plan.done = true;
  const r = prng(plan.seed);
  if (plan.invalid) {
    driver.releaseInvalid();
    return;
  }
  if (plan.shot) {
    const disc = state.bodies.find((body) => body.id === plan.shot.bodyId);
    driver.shoot(disc.id, E.aimFromDrag(disc, disc.x + plan.shot.dx, disc.y + plan.shot.dy));
    return;
  }
  if (state.phase === "penalties") {
    const shooter = E.penaltyShooter(state);
    const goalY = E.attackGoalY(state.penalties.turn);
    const tx = r.range(E.GOAL_LEFT - 20, E.GOAL_RIGHT + 20);
    const pull = r.range(30, 120);
    const angle = Math.atan2(goalY - shooter.y, tx - shooter.x);
    driver.shoot(shooter.id, E.aimFromDrag(shooter, shooter.x - Math.cos(angle) * pull, shooter.y - Math.sin(angle) * pull));
    return;
  }
  const discs = E.discsOf(state, side).filter((disc) => E.canShoot(state, disc.id));
  const ball = E.ballOf(state);
  const disc = discs[r.int(0, discs.length - 1)];
  const angle = r.chance(0.75) ? Math.atan2(ball.y - disc.y, ball.x - disc.x) + r.range(-0.25, 0.25) : r.range(-Math.PI, Math.PI);
  const pull = r.range(25, 130);
  if (!driver.shoot(disc.id, E.aimFromDrag(disc, disc.x - Math.cos(angle) * pull, disc.y - Math.sin(angle) * pull))) driver.releaseInvalid();
}

// ---------------------------------------------------------------------------
// Um aparelho: sessão + controlador + driver
// ---------------------------------------------------------------------------

const HELLO = () => modules().S.localHelloInfo();

/** Roteia a sessão para o controlador (o papel do room controller nestes testes). */
function wireSession(dev, clock) {
  const session = dev.session;
  // Ganchos dos cenários: perder/atrasar um envio, mentir no progresso, ignorar uma mensagem.
  const send = session.send.bind(session);
  session.send = (to, kind, body) => {
    const rule = dev.sendRule?.(to, kind, body) ?? null;
    if (rule === "drop") return;
    if (rule && rule.delayMs && clock) {
      clock.setTimeout(() => send(to, kind, body), rule.delayMs);
      return;
    }
    send(to, kind, body);
  };
  const setProgress = session.setProgress.bind(session);
  session.setProgress = (progress) => setProgress(dev.progressRule ? dev.progressRule(progress) : progress);
  session.onMessage = (from, kind, body) => {
    dev.inbox.push({ from, kind, at: clock?.now() ?? 0 });
    if (dev.dropIncoming?.(kind, body)) return;
    if (kind.startsWith("m:") || kind.startsWith("spec:") || kind === "match:forfeit") {
      if (dev.controller) dev.controller.receive(from, kind, body);
      else dev.buffer.push({ from, kind, body });
    }
  };
  session.onHealth = () => dev.controller?.healthChanged();
  session.onLink = (playerId, reason) => {
    dev.links.push({ playerId, reason });
    dev.controller?.linkChanged(playerId);
  };
  session.onJoinError = (info) => dev.controller?.noteJoinError(info.playerId);
}

/** Monta controlador + driver de uma partida num aparelho (com ou sem checkpoint). */
export function mountMatch(dev, { role, setup, sides, names, restore = null, cpuSkill = 3, clock, now, graceS, mutate = null, canSpectate, resuming }) {
  const { C, D, M, E, rng } = modules();
  dev.outcomes = dev.outcomes ?? [];
  dev.directives = dev.directives ?? [];
  dev.submitted = dev.submitted ?? [];
  const controller = new C.DuelController({
    session: dev.session,
    matchId: setup.matchId,
    bracketId: "r1m0",
    role,
    setup,
    sides,
    names,
    cpuSkill,
    checkpoints: dev.store,
    restore,
    roomCode: CODE,
    clock,
    wallNow: now,
    graceS,
    canSpectate,
    resuming,
    onOutcome: (outcome) => dev.outcomes.push({ ...clone(outcome), at: clock.now() }),
    onLive: (info) => (dev.lastLive = info),
  });
  const take = controller.takeDirective.bind(controller);
  controller.takeDirective = () => {
    const directive = take();
    if (directive) dev.directives.push({ n: directive.n, reason: directive.reason, at: clock.now(), localKey: dev.state ? M.matchKey(dev.state) : null, theirKey: M.matchKey(directive.match) });
    return directive;
  };
  // O que este aparelho aplicou, na ordem (as próprias ações e as que vieram da fila).
  dev.applied = dev.applied ?? [];
  const submit = controller.submit.bind(controller);
  controller.submit = (action) => {
    dev.submitted.push(clone(action));
    dev.applied.push(clone(action));
    submit(action);
  };
  const consume = controller.consume.bind(controller);
  controller.consume = (n) => {
    const action = controller.peek(n);
    if (action) dev.applied.push(clone(action));
    consume(n);
  };
  const launch = controller.launch();
  const state = launch.restore ? M.restoreMatch(setup, launch.restore.match) : E.createMatch(setup);
  if (!launch.restore && mutate) mutate(state, E);
  let cpu = null;
  if (launch.cpuBrain) {
    const brain = rng.createRng(launch.cpuBrain.seed);
    for (let index = 0; index < (launch.cpuBrain.cursor ?? 0); index += 1) brain.next();
    cpu = { rng: brain, skill: launch.cpuBrain.skill };
  }
  const driver = D.createOnlineDriver({
    state,
    n: launch.restore?.n ?? 0,
    controls: launch.controls,
    perspective: launch.perspective,
    names: launch.names,
    link: controller,
    restoreTimers: launch.restore?.timers ?? null,
    cpu,
    view3d: () => false,
    random: () => 0.5,
    onEvents: () => {},
    onFlash: () => {},
    onAnnounce: () => {},
    onTurnStart: () => {},
  });
  dev.controller = controller;
  dev.driver = driver;
  dev.state = state;
  dev.controls = launch.controls;
  dev.launch = launch;
  dev.cpu = cpu;
  const buffered = dev.buffer.splice(0);
  controller.start();
  if (buffered.length) controller.feedBuffered(buffered);
  return dev;
}

/**
 * O que a BotaoMatch faz com um DuelLaunch (§5.1, §7.3): estado (restaurado ou novo), cérebro da CPU
 * com o cursor, driver online com o link do launch. Para os testes de ponta a ponta da sala.
 */
export function mountLaunch(dev, launch, seed = 0) {
  const { D, M, E, rng } = modules();
  const state = launch.restore ? M.restoreMatch(launch.setup, launch.restore.match) : E.createMatch(launch.setup);
  let cpu = null;
  if (launch.cpuBrain) {
    const brain = rng.createRng(launch.cpuBrain.seed);
    for (let index = 0; index < (launch.cpuBrain.cursor ?? 0); index += 1) brain.next();
    cpu = { rng: brain, skill: launch.cpuBrain.skill };
  }
  dev.player ??= { name: dev.name, seed: mix(seed, dev.name), plans: new Map(), ordered: new Set(), script: null, slowChance: 0 };
  dev.state = state;
  dev.controls = launch.controls;
  dev.mountedKey = launch.key;
  dev.holding = false;
  dev.driver = D.createOnlineDriver({
    state,
    n: launch.restore?.n ?? 0,
    controls: launch.controls,
    perspective: launch.perspective,
    names: launch.names,
    link: launch.link,
    restoreTimers: launch.restore?.timers ?? null,
    cpu,
    view3d: () => false,
    random: () => 0.5,
    onEvents: () => {},
    onFlash: () => {},
    onAnnounce: () => {},
    onTurnStart: () => {},
  });
  return dev.driver;
}

let identityPool = null;
async function identities(count) {
  const { I } = modules();
  identityPool ??= [];
  while (identityPool.length < count) identityPool.push(await I.createIdentity());
  return identityPool.slice(0, count);
}

let incarnations = 1000;

// ---------------------------------------------------------------------------
// O banco (processo principal)
// ---------------------------------------------------------------------------

/**
 * Sala de teste com aparelhos A (autoridade), B (seguidor) e opcionalmente espectadores.
 * `solo`: só A, contra a CPU. `followerInWorker`: B roda num Worker com o Math perturbado.
 */
export async function createDuelRig(options = {}) {
  const { hub: H } = modules();
  const seed = options.seed ?? 1;
  const hub = H.createMemoryHub({ seed });
  const names = ["A", "B", ...(options.spectators ?? [])];
  const ids = await identities(names.length + 2);
  const setup = options.setup ?? setupFor(seed, options.rules ?? SHORT, options.extra ?? {});
  const solo = options.solo === true;
  const rig = {
    hub,
    setup,
    seed,
    dev: {},
    players: {},
    worker: null,
    sides: null,
    names: { user: "Rei do Peteleco", cpu: solo ? "CPU" : "Dona Bola" },
    graceS: options.graceS,
    stepMs: options.stepMs ?? STEP_MS,
  };
  const latency = options.latency ?? (() => 30);
  const jitter = options.jitter ?? 0;
  const participants = solo ? ["A", ...(options.spectators ?? [])] : names;
  /** playerId/pub de cada nome (o do Worker vem de lá: a chave privada não atravessa). */
  const info = {};
  names.forEach((name, index) => (info[name] = { playerId: ids[index].playerId, pub: ids[index].pub }));
  if (options.followerInWorker && !solo) {
    rig.worker = await startWorkerFollower(rig);
    info.B = { playerId: rig.worker.playerId, pub: rig.worker.pub };
  }
  rig.sides = { user: info.A.playerId, cpu: solo ? "cpu" : info.B.playerId };
  rig.info = info;

  function player(name) {
    rig.players[name] ??= { name, seed: mix(seed, name), plans: new Map(), ordered: new Set(), script: null, slowChance: options.slowChance };
    return rig.players[name];
  }

  function createDevice(name, index) {
    const transport = hub.transport(name);
    const session = new (modules().S.BobSession)({ identity: ids[index], transport, hello: HELLO(), incarnation: ++incarnations });
    const dev = rig.dev[name] ?? { name, index, store: modules().K.memoryCheckpointStore({ now: () => hub.now() + WALL0 }), outcomes: [], directives: [], submitted: [] };
    Object.assign(dev, { transport, session, controller: null, driver: null, state: null, buffer: [], inbox: [], links: [], alive: true, holding: false, player: player(name) });
    rig.dev[name] = dev;
    wireSession(dev, hub.clock);
    session.setRoster(participants.filter((other) => other !== name).map((other) => info[other]));
    session.connect(CODE);
    return dev;
  }

  for (const name of participants) {
    if (name === "B" && rig.worker) continue;
    createDevice(name, names.indexOf(name));
  }
  for (let i = 0; i < participants.length; i += 1) {
    for (let j = i + 1; j < participants.length; j += 1) hub.setLatency(participants[i], participants[j], latency(), jitter);
  }
  await hub.advance(1500);

  const mountOptions = (name) => ({
    clock: hub.clock,
    now: () => hub.now() + WALL0,
    graceS: options.graceS,
    canSpectate: options.canSpectate,
    setup: clone(setup),
    sides: rig.sides,
    names: rig.names,
    cpuSkill: options.cpuSkill ?? 3,
    role: name === "A" ? (solo ? "solo" : "authority") : name === "B" ? "follower" : "spectator",
  });

  rig.mount = (name, restore = null, extra = {}) => mountMatch(rig.dev[name], { ...mountOptions(name), restore, mutate: options.mutate ?? null, ...extra });
  for (const name of participants) {
    if (name === "B" && options.followerInWorker) continue;
    if (options.spectators?.includes(name) && options.lateSpectators) continue;
    if ((name === "B" && options.lateFollower) || (name === "A" && options.lateAuthority)) continue;
    rig.mount(name);
  }
  if (rig.worker) await rig.worker.call({ type: "mount", options: { ...mountOptions("B"), clock: undefined, now: undefined, canSpectate: undefined } });

  /** Um passo: relógio da rede, depois robô + quadro de cada aparelho vivo. */
  rig.step = async (stepMs = rig.stepMs) => {
    await hub.advance(stepMs);
    const dt = stepMs / 1000;
    for (const name of participants) {
      const dev = rig.dev[name];
      if (!dev || !dev.alive || !dev.driver || dev.paused) continue;
      if (!dev.passive) botStep(dev, dt);
      dev.driver.frame(dt, { holding: dev.holding });
    }
    if (rig.worker) await rig.worker.step(dt);
  };

  rig.finished = () => {
    const players = solo ? ["A"] : ["A", "B"];
    return players.every((name) => {
      const view = rig.view(name);
      return view && view.finished && view.outcomes.length > 0;
    });
  };

  /** O que um aparelho mostra (local ou no Worker). */
  rig.view = (name) => {
    if (name === "B" && rig.worker) return rig.worker.view;
    const dev = rig.dev[name];
    if (!dev) return null;
    return { finished: dev.driver?.finished() ?? null, outcomes: dev.outcomes, hash: dev.state ? modules().M.hashMatch(dev.state) : null };
  };

  rig.play = async ({ limitMs = 300_000, until = null } = {}) => {
    const start = hub.now();
    while (hub.now() - start < limitMs) {
      await rig.step();
      if (until ? until() : rig.finished()) return true;
    }
    return false;
  };

  rig.runFor = async (ms) => {
    const end = hub.now() + ms;
    while (hub.now() < end) await rig.step();
  };

  rig.until = async (predicate, limitMs = 120_000) => {
    const start = hub.now();
    while (!predicate()) {
      if (hub.now() - start >= limitMs) return false;
      await rig.step();
    }
    return true;
  };

  /** Ações aplicadas por todos (para cobertura). */
  rig.actions = () => Object.values(rig.dev).flatMap((dev) => dev.submitted ?? []);
  rig.directives = (name) => (name === "B" && rig.worker ? rig.worker.view.directives : rig.dev[name]?.directives ?? []);

  /** A página morre (sem quadros, sem rede, sem timers do controlador). */
  rig.kill = (name) => {
    const dev = rig.dev[name];
    hub.kill(name);
    dev.alive = false;
    dev.controller?.dispose();
  };

  /** Uma página nova do mesmo aparelho (reload): sessão nova, incarnation maior, checkpoint se houver. */
  rig.reload = async (name, { checkpoint = true } = {}) => {
    const old = rig.dev[name];
    if (old.alive) {
      old.controller?.flushCheckpoint();
      old.controller?.dispose();
    }
    await old.session.leave();
    hub.revive(name);
    if (!checkpoint) old.store = modules().K.memoryCheckpointStore({ now: () => hub.now() + WALL0 });
    const dev = createDevice(name, old.index);
    await hub.advance(0);
    const restore = checkpoint ? dev.store.load(setup.matchId) : null;
    // Recarregar é voltar a uma partida que já corria (a sala passa `resuming` à autoridade sem checkpoint).
    rig.mount(name, restore, { resuming: true });
    return dev;
  };

  /** Página escondida: sem quadros, presença "bg" (o mesmo caminho do visibilitychange). */
  rig.hide = (name) => {
    const dev = rig.dev[name];
    dev.paused = true;
    dev.session.setVisible(false);
    dev.controller?.setVisible(false);
  };
  rig.show = (name) => {
    const dev = rig.dev[name];
    dev.paused = false;
    dev.session.setVisible(true);
    dev.controller?.setVisible(true);
  };
  /** A internet do aparelho cai (ou volta): sinalização e todos os links. */
  rig.network = (name, up) => {
    hub.signaling(name, up);
    for (const other of participants) if (other !== name) hub.partition(name, other, !up);
  };
  rig.script = (name, fn) => {
    rig.players[name].script = fn;
  };
  rig.participants = participants;

  rig.describe = () => participants.map((name) => {
    const dev = rig.dev[name];
    if (!dev?.state) return `${name}: -`;
    const st = dev.controller.status();
    return `${name}: n=${dev.driver.n} ${dev.state.phase} ${dev.state.score.user}x${dev.state.score.cpu} frozen=${st.frozen} banner=${st.banner?.text ?? "-"}`;
  }).join(" | ");

  rig.close = () => {
    for (const dev of Object.values(rig.dev)) {
      dev.controller?.dispose();
      void dev.session.leave();
    }
    rig.worker?.terminate();
  };

  return rig;
}

// ---------------------------------------------------------------------------
// Seguidor no Worker: ponte de transporte em passos travados
// ---------------------------------------------------------------------------

async function startWorkerFollower(rig) {
  const hub = rig.hub;
  const bridge = hub.transport("B");
  const events = [];
  bridge.onData = (peer, data) => events.push({ at: hub.now(), type: "data", peer, data });
  bridge.onPeerJoin = (peer) => events.push({ at: hub.now(), type: "join", peer });
  bridge.onPeerLeave = (peer) => events.push({ at: hub.now(), type: "leave", peer });
  bridge.onJoinError = (info) => events.push({ at: hub.now(), type: "joinError", peer: info.peer, reason: info.reason });
  bridge.open({ code: CODE });
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { role: "follower" } });
  let pending = null;
  worker.on("message", (message) => {
    const resolve = pending;
    pending = null;
    resolve?.(message);
  });
  worker.on("error", (error) => {
    const resolve = pending;
    pending = null;
    resolve?.({ type: "error", error: String(error?.stack ?? error) });
  });
  const call = (message) =>
    new Promise((resolve, reject) => {
      pending = (reply) => (reply.type === "error" ? reject(new Error(reply.error)) : resolve(reply));
      worker.postMessage(message);
    });
  const handle = {
    view: { finished: null, outcomes: [], hash: null, directives: [], silent: 0 },
    call: async (message) => {
      const reply = await call(message);
      handle.absorb(reply);
      return reply;
    },
    absorb(reply) {
      for (const frame of reply.out ?? []) bridge.send(frame.peer, frame.data);
      if (reply.view) handle.view = reply.view;
    },
    step: async (dt) => {
      const batch = events.splice(0);
      const reply = await call({ type: "step", now: hub.now(), dt, events: batch, signaling: bridge.signalingUp() });
      handle.absorb(reply);
    },
    terminate: () => void worker.terminate(),
  };
  const ready = await handle.call({ type: "init", selfId: bridge.selfId(), inc: ++incarnations, now: hub.now() });
  handle.playerId = ready.playerId;
  handle.pub = ready.pub;
  return handle;
}

if (!isMainThread && workerData?.role === "follower") runWorkerFollower();
if (!isMainThread && workerData?.role === "sim") runWorkerSimulator();

/** Desvia Math.hypot/exp/atan2 em um ulp (outro "motor JS"). Chamar antes de carregar o motor. */
function perturbMath() {
  const f64 = new Float64Array(1);
  const u64 = new BigUint64Array(f64.buffer);
  const nudge = (value) => {
    if (!Number.isFinite(value) || value === 0) return value;
    f64[0] = value;
    u64[0] += 1n;
    return f64[0];
  };
  for (const name of ["hypot", "exp", "atan2"]) {
    const original = Math[name];
    Math[name] = (...args) => nudge(original(...args));
  }
}

/** Um simulateBotaoMatch noutro "motor" (Math desviado): o anfitrião novo da migração no teste da sala. */
export function createPerturbedSimulator() {
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { role: "sim" } });
  let seq = 0;
  const waiting = new Map();
  worker.on("message", ({ id, result, error }) => {
    const job = waiting.get(id);
    waiting.delete(id);
    if (error) job?.reject(new Error(error));
    else job?.resolve(result);
  });
  const simulator = (setup) => new Promise((resolve, reject) => {
    simulator.calls += 1;
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, setup });
  });
  simulator.calls = 0;
  simulator.close = () => void worker.terminate();
  return simulator;
}

function runWorkerSimulator() {
  perturbMath();
  stubBrowser();
  const { simulateBotaoMatch } = loadTs("app/botao/simulate.ts");
  parentPort.on("message", ({ id, setup }) => {
    try {
      parentPort.postMessage({ id, result: simulateBotaoMatch(setup) });
    } catch (error) {
      parentPort.postMessage({ id, error: String(error?.stack ?? error) });
    }
  });
}

/** Dentro do Worker: Math desviado, módulos próprios, sessão sobre a ponte, relógio virtual dado pelo principal. */
function runWorkerFollower() {
  perturbMath();
  const m = modules();
  let now = 0;
  let order = 0;
  const timers = [];
  const clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const timer = { at: now + Math.max(0, Number.isFinite(ms) ? ms : 0), order: order++, fn, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      if (timer) timer.cancelled = true;
    },
  };
  let selfId = "B";
  let signaling = true;
  const out = [];
  const transport = {
    kind: "memory",
    maxFrameBytes: 16000,
    clock,
    onData: null,
    onPeerJoin: null,
    onPeerLeave: null,
    onJoinError: null,
    selfId: () => selfId,
    open: () => {},
    close: async () => {},
    send: (peer, data) => out.push({ peer, data }),
    peers: () => [],
    pauseSignaling: () => {},
    resumeSignaling: () => {},
    signalingUp: () => signaling,
    linkInfo: async () => ({ candidate: "host", rttMs: null }),
  };
  const dev = { name: "B", buffer: [], inbox: [], links: [], outcomes: [], directives: [], submitted: [], alive: true, holding: false, store: m.K.memoryCheckpointStore({ now: () => now + WALL0 }) };
  dev.player = { name: "B", seed: 0, plans: new Map(), ordered: new Set(), script: null };

  const settle = async () => {
    for (let spins = 0; spins < 10_000; spins += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      if (m.I.cryptoInFlight() === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (m.I.cryptoInFlight() === 0) return;
      }
    }
  };
  /** Roda timers e entregas em ordem de tempo até `target`. */
  const advanceTo = async (target, events) => {
    const queue = events.map((event, index) => ({ ...event, order: -1e9 + index }));
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.order - b.order);
      queue.sort((a, b) => a.at - b.at || a.order - b.order);
      const timer = timers.find((entry) => !entry.cancelled && entry.at <= target);
      const event = queue[0] && queue[0].at <= target ? queue[0] : null;
      if (!timer && !event) break;
      if (event && (!timer || event.at <= timer.at)) {
        queue.shift();
        now = Math.max(now, event.at);
        if (event.type === "data") transport.onData?.(event.peer, event.data);
        else if (event.type === "join") transport.onPeerJoin?.(event.peer);
        else if (event.type === "leave") transport.onPeerLeave?.(event.peer);
        else transport.onJoinError?.({ peer: event.peer, reason: event.reason });
      } else {
        timers.splice(timers.indexOf(timer), 1);
        now = Math.max(now, timer.at);
        timer.fn();
      }
      await settle();
    }
    now = target;
    await settle();
  };
  const view = () => ({
    finished: dev.driver?.finished() ? clone(dev.driver.finished()) : null,
    outcomes: dev.outcomes,
    hash: dev.state ? m.M.hashMatch(dev.state) : null,
    directives: dev.directives,
    n: dev.driver?.n ?? null,
  });

  parentPort.on("message", async (message) => {
    try {
      if (message.type === "init") {
        selfId = message.selfId;
        now = message.now;
        dev.player.seed = mix(0, "B-worker");
        const identity = await m.I.createIdentity();
        dev.session = new m.S.BobSession({ identity, transport, hello: m.S.localHelloInfo(), incarnation: message.inc, clock });
        dev.identity = identity;
        wireSession(dev, clock);
        dev.session.connect(CODE);
        await settle();
        parentPort.postMessage({ type: "ready", playerId: identity.playerId, pub: identity.pub, out: out.splice(0), view: view() });
      } else if (message.type === "mount") {
        const options = { ...message.options, clock, now: () => now + WALL0 };
        mountMatch(dev, options);
        await settle();
        parentPort.postMessage({ type: "mounted", out: out.splice(0), view: view() });
      } else if (message.type === "step") {
        signaling = message.signaling;
        await advanceTo(message.now, message.events);
        if (dev.driver) {
          botStep(dev, message.dt);
          dev.driver.frame(message.dt, { holding: dev.holding });
        }
        parentPort.postMessage({ type: "stepped", out: out.splice(0), view: view() });
      }
    } catch (error) {
      parentPort.postMessage({ type: "error", error: String(error?.stack ?? error) });
    }
  });
}

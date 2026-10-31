// Sala e torneio do Bobonline (B2, §4 e §11.1): vários BobRoomClient reais sobre a sessão real e o
// transporte em memória, com relógio virtual. As partidas humanas usam um duelo falso (a sala só
// precisa do relatório do controlador); CPU × CPU usa a simulação de verdade ou uma falsa.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";
import { allowImportMeta, botStep, createPerturbedSimulator, mountLaunch, prng } from "./helpers/duel-follower-worker.mjs";

stubBrowser();
allowImportMeta();

const { createMemoryHub } = loadTs("app/bobonline/net/memory-transport.ts");
const { createIdentity } = loadTs("app/bobonline/net/identity.ts");
const { DEFAULT_NET_CONFIG } = loadTs("app/bobonline/net/net-config.ts");
const { T } = loadTs("app/bobonline/protocol.ts");
const { BobRoomClient } = loadTs("app/bobonline/room/room-controller.ts");
const { memoryRoomStore } = loadTs("app/bobonline/room/room-store.ts");
const { memoryCheckpointStore } = loadTs("app/bobonline/match/checkpoint.ts");
const { randomBobTeam } = loadTs("app/bobonline/teams/generator.ts");
const { teamHash } = loadTs("app/bobonline/teams/model.ts");
const { simulateBotaoMatch } = loadTs("app/botao/simulate.ts");
const { matchById, championOf } = loadTs("app/bobonline/tournament/bracket.ts");
const { BobSession, localHelloInfo } = loadTs("app/bobonline/net/session.ts");
const { matchCoin } = loadTs("app/bobonline/match/duel-controller.ts");
const modulesM = () => loadTs("app/botao/match-codec.ts");

const CODE = "K7MPX3";
const WALL0 = 1_700_000_000_000;
const STEP = 250;
const NAMES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const identities = [];
for (let index = 0; index < NAMES.length + 2; index += 1) identities.push(await createIdentity());
let incarnation = 5000;

const settingsFor = (format, extra = {}) => ({ format, rules: "flash", cpuLevel: 3, fillWithCpu: true, allowSpectators: true, locked: false, ...extra });

/** Resultado de partida falso (lado user = mandante). */
function fakeResult(setup, winner = "user") {
  const stats = { flicks: 5, touches: 3, posts: 0 };
  return {
    matchId: setup.matchId, simulated: false, outcome: winner === "user" ? "win" : "loss",
    goalsFor: winner === "user" ? 2 : 0, goalsAgainst: winner === "user" ? 0 : 2, penaltyFor: null, penaltyAgainst: null,
    playerGoals: 0, playerAssists: 0, manOfTheMatch: false, decision: "goal-limit", turns: 12,
    stats: { user: { ...stats }, cpu: { ...stats } }, timeline: [],
  };
}

/** Duelo falso: a sala vê o mesmo contrato do DuelController; o teste decide o resultado. */
class FakeDuel {
  constructor(args, dev) {
    this.args = args;
    this.dev = dev;
    this.matchId = args.matchId;
    this.bracketId = args.bracketId;
    this.role = args.role;
    this.received = [];
    this.stopped = false;
    this.disposed = false;
    this.pools = {};
    this.visible = [];
    /** O motor deste aparelho chegou ao fim (a autoridade ao relatar; o seguidor quando o teste disser). */
    this.localDone = false;
  }
  launch() {
    const role = this.role;
    return {
      key: this.matchId, matchId: this.matchId, setup: this.args.setup,
      controls: role === "authority" ? { user: "local", cpu: "remote" } : role === "follower" ? { user: "remote", cpu: "local" } : role === "solo" ? { user: "local", cpu: "cpu" } : { user: "remote", cpu: "remote" },
      perspective: role === "spectator" ? "neutral" : role === "follower" ? "cpu" : "user",
      names: this.args.names, link: null,
    };
  }
  start() {
    this.started = true;
    this.dev.duels.push(this);
    this.dev.onDuel?.(this);
  }
  feedBuffered(messages) { this.received.push(...messages); }
  dispose() { this.disposed = true; }
  receive(from, kind, body) { this.received.push({ from, kind, body }); }
  healthChanged() {}
  linkChanged() {}
  noteJoinError() {}
  setVisible(visible) { this.visible.push(visible); }
  flushCheckpoint() {}
  stop() { this.stopped = true; }
  poolOf(id) { return this.pools[id] ?? 90; }
  localProgress() { return this.progress ?? null; }
  finishedHere() { return this.disposed || this.stopped || this.localDone; }
  /** O controlador relata o fim (vencedor pelo lado do motor). */
  finish(winner = "user") {
    this.localDone = true;
    this.args.onOutcome({ kind: "result", result: fakeResult(this.args.setup, winner) });
  }
  /** W.O. visto por este aparelho (vencedor pelo lado do motor): pedido (vence) ou concessão (perde). */
  walkover(winner, reason = "timeout") {
    this.args.onOutcome({ kind: "walkover", winner, reason });
  }
  /** O anfitrião recusou o W.O. que este aparelho pediu. */
  claimRejected() {
    this.rejected = (this.rejected ?? 0) + 1;
  }
  /** O lado do motor deste aparelho (autoridade = user). */
  get side() {
    return this.role === "follower" ? "cpu" : "user";
  }
}

/** Simulação falsa de CPU × CPU (atraso virtual), contando chamadas. */
function fakeSimulator(hub, delayMs = 400) {
  const simulate = (setup) => {
    simulate.calls += 1;
    return new Promise((resolve) => hub.clock.setTimeout(() => resolve(fakeResult(setup, (setup.seed & 1) === 0 ? "user" : "cpu")), delayMs));
  };
  simulate.calls = 0;
  return simulate;
}

/** Sala de teste: aparelhos com identidade, "localStorage" de sala/checkpoint e relógio próprios. */
function roomRig({ seed = 1, skew = {}, simulate = null, graceS } = {}) {
  const hub = createMemoryHub({ seed });
  const rig = { hub, dev: {}, rng: prng(seed) };
  rig.device = (name) => {
    const index = NAMES.indexOf(name);
    rig.dev[name] ??= {
      name,
      identity: identities[index],
      id: identities[index].playerId,
      team: randomBobTeam(seed * 31 + index, { id: `bob-${name.toLowerCase()}00000000x`.slice(0, 14), now: 1 }),
      nickname: `Jogador ${name}`,
      roomStore: memoryRoomStore({ now: () => hub.now() + WALL0 + (skew[name] ?? 0) }),
      checkpoints: memoryCheckpointStore({ now: () => hub.now() + WALL0 + (skew[name] ?? 0) }),
      duels: [],
      saved: null,
      client: null,
      simulate: simulate ?? fakeSimulator(hub),
    };
    return rig.dev[name];
  };
  rig.deps = (name, extra = {}) => {
    const dev = rig.device(name);
    return {
      identity: dev.identity,
      incarnation: ++incarnation,
      netConfig: DEFAULT_NET_CONFIG,
      wallNow: () => hub.now() + WALL0 + (skew[name] ?? 0),
      roomStore: dev.roomStore,
      checkpoints: dev.checkpoints,
      simulate: (setup) => dev.simulate(setup),
      createDuel: (args) => new FakeDuel(args, dev),
      saveSession: (saved) => (dev.saved = saved),
      clearSession: () => (dev.saved = null),
      lifecycle: false,
      code: CODE,
      seed,
      graceS,
      ...extra,
    };
  };
  rig.create = async (name, settings, extra = {}) => {
    const dev = rig.device(name);
    dev.client = await BobRoomClient.create({ team: dev.team, nickname: extra.nickname ?? dev.nickname, settings, password: extra.password, transportFactory: () => hub.transport(name) }, rig.deps(name));
    // Sozinho na sala: o estado (o que a tela lê) tem de virar "in-room" sem ninguém entrar.
    assert.ok(await rig.until(() => dev.client.getState().phase === "in-room", 10_000), `${name} não abriu a sala (${dev.client.getState().phase})`);
    return dev.client;
  };
  rig.join = async (name, extra = {}) => {
    const dev = rig.device(name);
    dev.client = await BobRoomClient.join({
      code: CODE, team: extra.team ?? dev.team, nickname: extra.nickname ?? dev.nickname, password: extra.password,
      ...(extra.asSpectator ? { asSpectator: true } : {}), ...(extra.hostId ? { hostId: extra.hostId } : {}), transportFactory: () => hub.transport(name),
    }, rig.deps(name, extra.deps ?? {}));
    const ok = await rig.until(() => ["in-room", "error"].includes(dev.client.getState().phase) && dev.client.getState().snapshot !== null || dev.client.getState().phase === "error", 60_000);
    assert.ok(ok, `${name} não entrou nem falhou`);
    return dev.client;
  };
  rig.resume = async (name) => {
    const dev = rig.device(name);
    const saved = dev.saved;
    assert.ok(saved, `${name} sem sessão salva`);
    dev.client = await BobRoomClient.resume(saved, { team: dev.team, nickname: dev.nickname, transportFactory: () => hub.transport(name) }, rig.deps(name));
    return dev.client;
  };
  rig.state = (name) => rig.dev[name].client.getState();
  rig.snap = (name) => rig.state(name).snapshot;
  rig.step = async (ms = STEP) => {
    await hub.advance(ms);
    rig.autopilot?.();
  };
  rig.until = async (predicate, limitMs = 60_000) => {
    const start = hub.now();
    while (!predicate()) {
      if (hub.now() - start >= limitMs) return false;
      await rig.step();
    }
    return true;
  };
  rig.runFor = async (ms) => {
    const end = hub.now() + ms;
    while (hub.now() < end) await rig.step();
  };
  /** A rede do aparelho cai com a página aberta (links cortados; a sinalização segue, como no rig do R-room). */
  rig.isolate = (name, on) => {
    for (const other of Object.keys(rig.dev)) if (other !== name) rig.hub.partition(name, other, on);
  };
  /** Quem é anfitrião de fato (isHost) entre os aparelhos vivos na sala. */
  rig.hosts = () => Object.values(rig.dev).filter((dev) => dev.client?.getState().phase === "in-room" && dev.client.getState().isHost).map((dev) => dev.name);
  /** Todos os aparelhos vivos na mesma linhagem (época e anfitrião). */
  rig.converged = (names) => {
    const lineages = new Set(names.map((name) => `${rig.snap(name).epoch}|${rig.snap(name).hostId}`));
    return lineages.size === 1;
  };
  /** A página some de vez (sem room:leave). */
  rig.kill = async (name) => {
    hub.kill(name);
    await rig.dev[name].client.close();
  };
  rig.close = async () => {
    for (const dev of Object.values(rig.dev)) await dev.client?.close().catch(() => {});
  };
  return rig;
}

/** Sala com `humans` jogadores (A cria), todos prontos. */
async function lobby(rig, format, humans, settings = {}) {
  await rig.create("A", settingsFor(format, settings));
  for (const name of NAMES.slice(1, humans)) await rig.join(name);
  for (const name of NAMES.slice(1, humans)) rig.dev[name].client.setReady(true);
  assert.ok(await rig.until(() => rig.snap("A").members.filter((member) => member.ready).length === humans, 20_000), "nem todos prontos");
}

/**
 * Piloto automático das telas: aperta "Estou pronto", sai da tela de resultado (ou não) e termina as
 * partidas da autoridade/solo depois de `playMs` com o vencedor que `pick` escolher.
 */
function autopilot(rig, { playMs = 4000, pick = (duel, rng) => (rng.chance(0.5) ? "user" : "cpu"), ready = () => true, free = () => true } = {}) {
  const finished = new Set();
  rig.autopilot = () => {
    for (const dev of Object.values(rig.dev)) {
      const client = dev.client;
      if (!client || client.getState().phase !== "in-room") continue;
      const state = client.getState();
      if (state.nextMatch && state.snapshot?.bracket) {
        const match = matchById(state.snapshot.bracket, state.nextMatch.bracketId);
        if (match?.status === "ready-check" && !match.readyBy.includes(state.me) && ready(dev, match)) client.readyForMatch(match.id);
      }
      for (const duel of dev.duels) {
        if (duel.disposed || finished.has(duel)) continue;
        if (duel.role !== "authority" && duel.role !== "solo") continue;
        duel.startedAt ??= rig.hub.now();
        // Cada partida dura um pouco diferente (ramos andam em ritmos diferentes).
        duel.playMs ??= playMs * (0.4 + 1.2 * rig.rng.next());
        if (rig.hub.now() - duel.startedAt >= duel.playMs) {
          finished.add(duel);
          duel.finish(pick(duel, rig.rng));
        }
      }
      // Saiu da tela de resultado: a partida da chave fechou e o resultado é dele.
      for (const duel of dev.duels) {
        if (duel.freed || duel.role === "spectator") continue;
        const match = state.snapshot?.bracket ? matchById(state.snapshot.bracket, duel.bracketId) : null;
        if (match?.status === "done" && free(dev, match)) {
          duel.freed = true;
          client.leftResultScreen(duel.bracketId);
        }
      }
    }
  };
}

const statusOf = (rig, name, bracketId) => matchById(rig.snap(name).bracket, bracketId);

// ---------------------------------------------------------------------------
// Torneios inteiros por ramo
// ---------------------------------------------------------------------------

for (const [format, humans, fill] of [["t4", 2, true], ["t4", 3, false], ["t4", 3, true], ["t8", 2, true], ["t8", 3, false], ["t8", 5, true], ["t8", 5, false]]) {
  test(`torneio ${format} com ${humans} humanos, CPU ${fill ? "ligada" : "desligada"}: anda por ramo até o campeão`, async () => {
    const rig = roomRig({ seed: 100 + humans * 10 + (fill ? 1 : 0) + (format === "t8" ? 50 : 0) });
    try {
      await lobby(rig, format, humans, { fillWithCpu: fill });
      autopilot(rig, { playMs: 3000 + humans * 300 });
      assert.deepEqual(rig.dev.A.client.hostStart(), { ok: true });
      const snapshot = rig.snap("A");
      assert.equal(snapshot.stage, "running");
      // Rodada 1 sem "pronto?": tudo o que tem os dois lados já está jogando.
      for (const match of snapshot.bracket.matches.filter((entry) => entry.round === 1)) {
        assert.ok(match.status === "playing" || (match.status === "done" && match.kind === "bye"), `${match.id} ${match.status}`);
      }
      const entrants = snapshot.bracket.entrants;
      assert.equal(entrants.filter((entrant) => entrant.kind === "human").length, humans);
      if (fill) assert.equal(entrants.length, format === "t4" ? 4 : 8);
      else assert.equal(entrants.length, humans);
      // Ramos independentes: alguma partida da rodada 2 começa antes de a rodada 1 inteira acabar.
      let perBranch = false;
      const done = await rig.until(() => {
        const snap = rig.snap("A");
        const r1Open = snap.bracket.matches.some((match) => match.round === 1 && match.status !== "done");
        if (r1Open && snap.bracket.matches.some((match) => match.round === 2 && (match.status === "ready-check" || match.status === "playing"))) perBranch = true;
        return snap.stage === "done";
      }, 900_000);
      assert.ok(done, `torneio não acabou: ${JSON.stringify(rig.snap("A").bracket.matches.map((match) => [match.id, match.status]))}`);
      const final = rig.snap("A");
      assert.ok(championOf(final.bracket), "sem campeão");
      assert.ok(final.bracket.matches.every((match) => match.status === "done"));
      // Todos os aparelhos convergem no mesmo snapshot.
      for (const name of NAMES.slice(1, humans)) {
        assert.ok(await rig.until(() => rig.snap(name).version === rig.snap("A").version, 10_000), `${name} não convergiu`);
        assert.deepEqual(rig.snap(name).bracket, rig.snap("A").bracket);
      }
      if (format === "t8" && humans >= 5) assert.ok(perBranch, "a chave esperou a rodada inteira");
    } finally {
      await rig.close();
    }
  });
}

// ---------------------------------------------------------------------------
// Espera da tela de resultado e "pronto?" das rodadas seguintes
// ---------------------------------------------------------------------------

test("espera do resultado: o 'pronto?' da final espera o match:free ou 30 s; X1 e rodada 1 sem 'pronto?'", async () => {
  const rig = roomRig({ seed: 301 });
  try {
    await lobby(rig, "t4", 2, { fillWithCpu: true });
    // A sai da tela na hora; B nunca sai (vale o limite de 30 s).
    autopilot(rig, { playMs: 3000, pick: () => "user", free: (dev) => dev.name === "A", ready: () => false });
    rig.dev.A.client.hostStart();
    const final = () => rig.snap("A").bracket.matches.find((match) => match.round === 2);
    assert.ok(await rig.until(() => final().home && final().away, 60_000), "a final nunca teve os dois lados");
    const semiB = rig.snap("A").bracket.matches.find((match) => match.round === 1 && (match.home?.entrantId === rig.dev.B.id));
    assert.equal(final().status, "waiting");
    assert.ok(await rig.until(() => final().freeBy.includes(rig.dev.A.id), 5000), "o match:free de A não chegou");
    assert.equal(final().status, "waiting");
    assert.ok(final().holdUntil >= semiB.result.at + T.RESULT_HOLD_S * 1000 - 1);
    assert.ok(!final().freeBy.includes(rig.dev.B.id));
    // B vê "começa quando sair do resultado" (horas convertidas para o relógio dele).
    assert.ok(await rig.until(() => rig.state("B").nextMatch?.holdUntilLocal !== null, 5000));
    assert.ok(await rig.until(() => final().status === "ready-check", 40_000), "o 'pronto?' não veio no fim da espera");
    const startedHold = rig.hub.now() + WALL0;
    assert.ok(startedHold >= semiB.result.at + T.RESULT_HOLD_S * 1000 - STEP);
    assert.ok(Math.abs(final().readyDeadline - (startedHold + T.READY_CHECK_S * 1000)) <= STEP * 2);
    // Ninguém apertou "pronto", mas os dois estão presentes: começa no prazo.
    assert.ok(await rig.until(() => final().status === "playing", 25_000));
  } finally {
    await rig.close();
  }
});

test("X1 começa direto (sem 'pronto?') e a revanche também; recusar e Voltar à sala mantém a série", async () => {
  const rig = roomRig({ seed: 302 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    const match = () => rig.snap("A").bracket.matches[0];
    assert.equal(match().status, "playing");
    assert.equal(match().replay, 0);
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    assert.equal(rig.dev.A.duels[0].role, "authority");
    assert.equal(rig.dev.B.duels[0].role, "follower");
    assert.equal(rig.state("B").duel.launch.perspective, "cpu");
    rig.dev.A.duels[0].finish("user");
    assert.ok(await rig.until(() => match().status === "done" && rig.snap("B").stage === "done"));
    assert.deepEqual(rig.snap("A").series, { home: 1, away: 0 });
    // Revanche: B pede, A recusa → o pedido cai.
    rig.dev.B.client.wantRematch(true);
    assert.ok(await rig.until(() => rig.state("A").rematch?.theirs === true));
    rig.dev.A.client.wantRematch(false);
    assert.ok(await rig.until(() => rig.state("B").rematch?.mine === false));
    // Agora os dois querem: lados trocados, replay 1, direto para "jogando".
    rig.dev.B.client.wantRematch(true);
    rig.dev.A.client.wantRematch(true);
    assert.ok(await rig.until(() => match().replay === 1 && match().status === "playing"));
    assert.equal(match().home.entrantId, rig.dev.B.id);
    assert.equal(match().authority, rig.dev.B.id);
    assert.ok(await rig.until(() => rig.dev.B.duels.length === 2 && rig.dev.B.duels[1].role === "authority"));
    rig.dev.B.duels[1].finish("user");
    assert.ok(await rig.until(() => rig.snap("A").series.away === 1 && rig.snap("A").stage === "done"));
    // A revanche não vira aviso: a tela de resultado desenha pelo state.rematch.
    for (const name of ["A", "B"]) assert.ok(!rig.state(name).toasts.some((toast) => /revanche/i.test(toast.text)), `${name}: aviso de revanche`);
    // Voltar à sala: lobby com a série, convidado não pronto; o próximo jogo troca o mandante de novo.
    rig.dev.B.client.backToLobby();
    assert.ok(await rig.until(() => rig.snap("A").stage === "lobby" && rig.snap("B").stage === "lobby"));
    assert.deepEqual(rig.snap("A").series, { home: 1, away: 1 });
    assert.equal(rig.snap("A").members.find((member) => member.playerId === rig.dev.B.id).ready, false);
    rig.dev.B.client.setReady(true);
    assert.ok(await rig.until(() => rig.snap("A").members.every((member) => member.ready)));
    rig.dev.A.client.hostStart();
    assert.equal(match().home.entrantId, rig.dev.A.id, "jogo 3 da série: o criador manda de novo");
    assert.equal(match().replay, 2, "o id da partida não repete na série");
  } finally {
    await rig.close();
  }
});

// ---------------------------------------------------------------------------
// CPU × CPU lacrada
// ---------------------------------------------------------------------------

test("CPU × CPU: lacrada na simulação, escondida até revelar, revelação no relógio virtual; migração para um anfitrião de outro 'motor' não simula de novo", async () => {
  const simulate = (setup) => {
    simulate.calls += 1;
    return Promise.resolve(simulateBotaoMatch(setup));
  };
  simulate.calls = 0;
  const rig = roomRig({ seed: 303 });
  const perturbed = createPerturbedSimulator();
  try {
    rig.device("A").simulate = simulate;
    rig.device("B").simulate = perturbed;
    rig.device("C").simulate = perturbed;
    await lobby(rig, "t8", 3, { fillWithCpu: true });
    autopilot(rig, { playMs: 200_000 }); // humanos jogando o tempo todo
    rig.dev.A.client.hostStart();
    const cpuMatches = () => rig.snap("A").bracket.matches.filter((match) => match.round === 1 && match.kind === "cpu-cpu");
    assert.ok(cpuMatches().length >= 1, "sem CPU × CPU na rodada 1");
    assert.ok(await rig.until(() => cpuMatches().every((match) => match.sealed), 20_000), "nada lacrado");
    const sealed = cpuMatches()[0];
    assert.equal(sealed.status, "playing", "lacrada mas ainda escondida");
    assert.equal(sealed.sealed.revealAt, sealed.startedAt + T.CPU_REVEAL_MS);
    assert.equal(simulate.calls, cpuMatches().length);
    // Os membros recebem a lacrada (escondida até revealAt pela tela).
    assert.ok(await rig.until(() => rig.snap("B").bracket.matches.find((match) => match.id === sealed.id).sealed !== null));
    // O anfitrião some no meio; B assume e revela o MESMO resultado, sem simular.
    await rig.runFor(10_000);
    await rig.kill("A");
    assert.ok(await rig.until(() => rig.snap("B").hostId === rig.dev.B.id && rig.state("B").isHost, 60_000), "ninguém assumiu");
    assert.ok(await rig.until(() => statusOf(rig, "B", sealed.id).status === "done", T.CPU_REVEAL_MS + 30_000), "não revelou");
    const revealed = statusOf(rig, "B", sealed.id).result;
    assert.equal(revealed.resultHash, sealed.sealed.result.resultHash);
    assert.equal(perturbed.calls, 0, "o anfitrião novo simulou de novo");
    // Revelação no prazo convertido para o relógio do anfitrião novo (mesmo relógio aqui), nunca antes.
    assert.ok(Math.abs(revealed.at - sealed.sealed.revealAt) < 2000, `revelada em ${revealed.at - sealed.sealed.revealAt} ms`);
    assert.ok(rig.hub.now() + WALL0 >= sealed.sealed.revealAt - 2000);
  } finally {
    perturbed.close();
    await rig.close();
  }
});

test("CPU × CPU: revela mais cedo (8 s) quando o próximo jogo do vencedor já tem o outro lado esperando", async () => {
  const rig = roomRig({ seed: 304 });
  try {
    rig.device("A").simulate = fakeSimulator(rig.hub, 30_000); // simulação lenta: o outro lado chega antes
    await lobby(rig, "t8", 2, { fillWithCpu: true });
    autopilot(rig, { playMs: 2000, pick: () => "user" });
    rig.dev.A.client.hostStart();
    const bracket = () => rig.snap("A").bracket;
    const cpu = bracket().matches.find((match) => match.round === 1 && match.kind === "cpu-cpu");
    const next = bracket().matches.find((match) => match.round === 2 && match.index === Math.floor(cpu.index / 2));
    assert.ok(await rig.until(() => statusOf(rig, "A", cpu.id).sealed !== null, 60_000));
    const sealed = statusOf(rig, "A", cpu.id).sealed;
    const sideWaiting = statusOf(rig, "A", next.id).home || statusOf(rig, "A", next.id).away;
    if (sideWaiting) assert.ok(sealed.revealAt <= rig.hub.now() + WALL0 + T.CPU_REVEAL_WAITING_MS + STEP);
    else assert.equal(sealed.revealAt, sealed.startedAt + T.CPU_REVEAL_MS);
  } finally {
    await rig.close();
  }
});

// ---------------------------------------------------------------------------
// Troca de anfitrião
// ---------------------------------------------------------------------------

test("claimflap: sem caminho A↔B, ninguém reivindica enquanto C e D ouvem A; com A morto de verdade, uma reivindicação só", async () => {
  const rig = roomRig({ seed: 401 });
  try {
    await lobby(rig, "t4", 4);
    rig.hub.partition("A", "B", true);
    await rig.runFor(60_000);
    for (const name of ["A", "B", "C", "D"]) assert.equal(rig.snap(name).epoch, 0, `${name} viu reivindicação com o anfitrião vivo`);
    assert.equal(rig.snap("B").hostId, rig.dev.A.id);
    let claims = 0;
    for (const name of ["B", "C", "D"]) {
      const session = rig.dev[name].client.session;
      const broadcast = session.broadcast.bind(session);
      session.broadcast = (kind, body, filter) => {
        if (kind === "host:claim") claims += 1;
        broadcast(kind, body, filter);
      };
    }
    await rig.kill("A");
    assert.ok(await rig.until(() => ["B", "C", "D"].every((name) => rig.snap(name).epoch === 1 && rig.snap(name).hostId === rig.dev.B.id), 60_000), "não convergiu num anfitrião novo");
    await rig.runFor(60_000);
    assert.equal(claims, 1, "mais de uma reivindicação");
    for (const name of ["B", "C", "D"]) assert.equal(rig.snap(name).epoch, 1);
  } finally {
    await rig.close();
  }
});

test("host:veto desfaz uma reivindicação prematura; reivindicações simultâneas convergem pelo desempate", async () => {
  const rig = roomRig({ seed: 402 });
  try {
    await lobby(rig, "t4", 4);
    // C reivindica com A vivo: A e quem ouve A vetam; C volta a membro e quem aceitou volta também.
    rig.dev.C.client.claim();
    assert.equal(rig.snap("C").epoch, 1);
    assert.ok(await rig.until(() => ["A", "B", "C", "D"].every((name) => rig.snap(name).hostId === rig.dev.A.id && rig.snap(name).epoch === 0), 20_000), "o veto não desfez");
    // A morre; B e C reivindicam ao mesmo tempo: vence o menor joinOrder (B).
    await rig.kill("A");
    rig.dev.B.client.claim();
    rig.dev.C.client.claim();
    assert.ok(await rig.until(() => ["B", "C", "D"].every((name) => rig.snap(name).hostId === rig.dev.B.id && rig.snap(name).epoch === 1), 20_000), "empate não convergiu");
    assert.equal(rig.state("C").isHost, false);
    assert.equal(rig.state("B").isHost, true);
  } finally {
    await rig.close();
  }
});

test("fatos de linhagem: resultado aceito por uma época perdedora é relatado de novo e entra na vencedora; 'done' nunca volta", async () => {
  const rig = roomRig({ seed: 403 });
  try {
    await lobby(rig, "t4", 4);
    autopilot(rig, { playMs: 10_000_000 });
    rig.dev.A.client.hostStart();
    // A partida da rodada 1 sem o anfitrião A; a autoridade dela relata.
    const r1 = rig.snap("A").bracket.matches.filter((match) => match.round === 1);
    const other = r1.find((match) => match.home.entrantId !== rig.dev.A.id && match.away.entrantId !== rig.dev.A.id);
    const authority = Object.values(rig.dev).find((dev) => dev.id === other.authority);
    assert.ok(await rig.until(() => authority.duels.length === 1));
    // B fica isolado; A morre; C assume (época 1) e recebe o relatório.
    for (const name of ["A", "C", "D"]) rig.hub.partition("B", name, true);
    await rig.kill("A");
    rig.dev.C.client.claim();
    assert.ok(await rig.until(() => rig.snap("D").hostId === rig.dev.C.id && authority.client.getState().snapshot.hostId === rig.dev.C.id, 20_000));
    authority.duels[0].finish("cpu");
    assert.ok(await rig.until(() => statusOf(rig, "C", other.id).status === "done" && statusOf(rig, authority.name, other.id).status === "done", 20_000));
    const result = statusOf(rig, "C", other.id).result;
    // B (isolado, sem o resultado) reivindica a MESMA época e ganha o desempate quando a rede volta.
    rig.dev.B.client.claim();
    for (const name of ["A", "C", "D"]) rig.hub.partition("B", name, false);
    assert.ok(await rig.until(() => ["C", "D"].every((name) => rig.snap(name).hostId === rig.dev.B.id) && rig.snap("B").hostId === rig.dev.B.id, 60_000), "não convergiu em B");
    assert.ok(await rig.until(() => statusOf(rig, "B", other.id).status === "done", 20_000), "o fato não foi relatado de novo à linhagem vencedora");
    assert.equal(statusOf(rig, "B", other.id).result.resultHash, result.resultHash);
    await rig.runFor(10_000);
    for (const name of ["B", "C", "D"]) assert.equal(statusOf(rig, name, other.id).status, "done");
  } finally {
    await rig.close();
  }
});

// ---------------------------------------------------------------------------
// Anfitrião recarregando
// ---------------------------------------------------------------------------

test("anfitrião recarrega no meio do torneio: PersistedRoom + room:state, mesma sala; impostor com playerId copiado não entra", async () => {
  const rig = roomRig({ seed: 501 });
  try {
    await lobby(rig, "t4", 3);
    autopilot(rig, { playMs: 10_000_000 });
    rig.dev.A.client.hostStart();
    await rig.runFor(3000);
    const before = rig.snap("A");
    await rig.dev.A.client.close();
    await rig.runFor(1500);
    await rig.resume("A");
    assert.ok(await rig.until(() => rig.state("A").phase === "in-room" && rig.state("A").isHost, 10_000));
    assert.ok(await rig.until(() => ["B", "C"].every((name) => rig.snap(name).version > before.version && rig.snap(name).hostId === rig.dev.A.id), 20_000), "membros não readotaram");
    for (const name of ["A", "B", "C"]) {
      assert.equal(rig.snap(name).code, CODE);
      assert.equal(rig.snap(name).epoch, before.epoch);
      assert.deepEqual(rig.snap(name).members.map((member) => member.playerId), before.members.map((member) => member.playerId));
    }
    // Impostor: mesmo playerId de B, outra chave → o hello não verifica, nunca entra.
    const real = rig.dev.B.identity;
    const fake = await createIdentity();
    const dev = rig.device("E");
    dev.identity = { playerId: real.playerId, pub: fake.pub, sign: fake.sign };
    const impostor = await BobRoomClient.join({ code: CODE, team: dev.team, nickname: "Impostor", transportFactory: () => rig.hub.transport("E") }, rig.deps("E"));
    dev.client = impostor;
    await rig.runFor(15_000);
    assert.notEqual(impostor.getState().phase, "in-room");
    assert.equal(rig.snap("A").members.find((member) => member.playerId === real.playerId).nickname, "Jogador B");
    assert.ok(!rig.snap("A").members.some((member) => member.nickname === "Impostor"));
  } finally {
    await rig.close();
  }
});

test("X1: os dois recarregam juntos → a sala volta (anfitrião continua anfitrião) e a partida remonta nos dois", async () => {
  const rig = roomRig({ seed: 502 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    const matchId = rig.dev.A.duels[0].matchId;
    await rig.dev.A.client.close();
    await rig.dev.B.client.close();
    await rig.runFor(1500);
    await rig.resume("A");
    await rig.resume("B");
    assert.ok(await rig.until(() => rig.state("A").isHost && rig.state("B").phase === "in-room" && rig.snap("B").hostId === rig.dev.A.id, 20_000));
    assert.ok(await rig.until(() => rig.dev.A.duels.at(-1).matchId === matchId && rig.dev.B.duels.at(-1).matchId === matchId && rig.dev.A.duels.length === 2 && rig.dev.B.duels.length === 2, 10_000));
    assert.equal(rig.snap("A").stage, "running");
  } finally {
    await rig.close();
  }
});

// ---------------------------------------------------------------------------
// Solo abandonado
// ---------------------------------------------------------------------------

test("solo abandonado: o anfitrião dá a vitória à CPU depois de 90 s; depois de uma migração, o anfitrião novo conta do momento dela", async () => {
  const rig = roomRig({ seed: 601 });
  try {
    await lobby(rig, "t4", 2, { fillWithCpu: true });
    autopilot(rig, { playMs: 10_000_000 });
    rig.dev.A.client.hostStart();
    const soloB = () => rig.snap("A").bracket.matches.find((match) => match.home?.entrantId === rig.dev.B.id && match.round === 1);
    assert.equal(soloB().kind, "cpu-human");
    await rig.kill("B");
    const killedAt = rig.hub.now();
    assert.ok(await rig.until(() => soloB().status === "done", 200_000), "a CPU não levou");
    const elapsed = rig.hub.now() - killedAt;
    assert.ok(elapsed >= T.GRACE_POOL_S * 1000 && elapsed <= T.GRACE_POOL_S * 1000 + 15_000, `W.O. em ${elapsed} ms`);
    assert.equal(soloB().result.walkover, "timeout");
    assert.equal(soloB().result.winner, "away");
  } finally {
    await rig.close();
  }
  const mig = roomRig({ seed: 602 });
  try {
    await lobby(mig, "t4", 3, { fillWithCpu: true });
    autopilot(mig, { playMs: 10_000_000 });
    mig.dev.A.client.hostStart();
    assert.ok(await mig.until(() => mig.snap("C").stage === "running"));
    const solo = () => mig.snap("C").bracket.matches.find((match) => match.round === 1 && match.kind === "cpu-human" && match.home.entrantId === mig.dev.B.id);
    assert.ok(solo(), "nesta semente B joga contra a CPU na rodada 1");
    await mig.kill("B");
    await mig.runFor(40_000);
    await mig.kill("A");
    assert.ok(await mig.until(() => mig.state("C").isHost, 60_000), "C não assumiu");
    const claimedAt = mig.hub.now();
    assert.ok(await mig.until(() => solo().status === "done", 200_000));
    assert.ok(mig.hub.now() - claimedAt >= T.GRACE_POOL_S * 1000 - STEP, "o anfitrião novo herdou a reserva gasta do velho");
  } finally {
    await mig.close();
  }
});

// ---------------------------------------------------------------------------
// Relógio do anfitrião
// ---------------------------------------------------------------------------

test("relógio: membro com o celular 3 min adiantado vê as mesmas contagens (toLocal); o anfitrião novo converte as horas velhas", async () => {
  const rig = roomRig({ seed: 701, skew: { C: 180_000 } });
  try {
    await lobby(rig, "t4", 3, { fillWithCpu: true });
    autopilot(rig, { playMs: 3000, pick: () => "user", ready: () => false, free: () => true });
    rig.dev.A.client.hostStart();
    const final = () => rig.snap("A").bracket.matches.find((match) => match.round === 2);
    assert.ok(await rig.until(() => final().status === "ready-check", 120_000), "sem 'pronto?' na final");
    await rig.runFor(5000);
    const hostLeft = final().readyDeadline - (rig.hub.now() + WALL0);
    for (const name of ["B", "C"]) {
      const state = rig.state(name);
      const deadline = state.snapshot.bracket.matches.find((match) => match.round === 2).readyDeadline;
      const local = rig.dev[name].client.toLocal(deadline);
      const now = rig.hub.now() + WALL0 + (name === "C" ? 180_000 : 0);
      assert.ok(Math.abs(local - now - hostLeft) <= 300, `${name}: faltam ${local - now} ms, no anfitrião ${hostLeft}`);
    }
    // C (3 min adiantado) assume: o prazo velho vira hora de C.
    await rig.kill("A");
    rig.dev.C.client.claim();
    const converted = rig.snap("C").bracket.matches.find((match) => match.round === 2);
    const cNow = rig.hub.now() + WALL0 + 180_000;
    if (converted.status === "ready-check") assert.ok(Math.abs(converted.readyDeadline - cNow - (hostLeft - 0)) <= 2000, "prazo não convertido para o relógio de C");
    assert.ok(converted.startedAt === null || converted.startedAt > WALL0 + 120_000);
  } finally {
    await rig.close();
  }
});

// ---------------------------------------------------------------------------
// Entrada: remover, senha, tarde, apelido
// ---------------------------------------------------------------------------

test("remover e banir; senha (senha → senha-errada → entra); entrada tarde vira espectador; apelido repetido ganha número", async () => {
  const rig = roomRig({ seed: 801 });
  try {
    await rig.create("A", settingsFor("t4"), { password: "bola" });
    assert.equal(rig.snap("A").settings.locked, true);
    let b = await rig.join("B");
    assert.equal(b.getState().phase, "error");
    assert.equal(b.getState().error, "senha");
    b = await rig.join("B", { password: "errada" });
    assert.equal(b.getState().error, "senha-errada");
    b = await rig.join("B", { password: "bola", nickname: "Fominha" });
    assert.equal(b.getState().phase, "in-room");
    const c = await rig.join("C", { password: "bola", nickname: "Fominha" });
    assert.equal(c.getState().phase, "in-room");
    assert.ok(await rig.until(() => rig.snap("A").members.length === 3));
    assert.deepEqual(rig.snap("A").members.map((member) => member.nickname), ["Jogador A", "Fominha", "Fominha 2"]);
    // Remover C: sai, vai para a lista de banidos e não volta.
    rig.dev.A.client.hostKick(rig.dev.C.id);
    assert.ok(await rig.until(() => rig.state("C").error === "removido"));
    assert.ok(rig.snap("A").banned.includes(rig.dev.C.id));
    const again = await rig.join("C", { password: "bola" });
    assert.equal(again.getState().error, "removido");
    // Começa; quem chega depois só entra para assistir.
    b.setReady(true);
    assert.ok(await rig.until(() => rig.snap("A").members.find((member) => member.playerId === rig.dev.B.id).ready));
    assert.deepEqual(rig.dev.A.client.hostStart(), { ok: true });
    let d = await rig.join("D", { password: "bola" });
    assert.equal(d.getState().error, "iniciada");
    d = await rig.join("D", { password: "bola", asSpectator: true });
    assert.equal(d.getState().phase, "in-room");
    const spectator = rig.snap("A").members.find((member) => member.playerId === rig.dev.D.id);
    assert.equal(spectator.role, "spectator");
    assert.equal(rig.snap("A").bracket.entrants.some((entrant) => entrant.id === rig.dev.D.id), false);
  } finally {
    await rig.close();
  }
});

test("busca da sala: textos escalonados, não achou / sem rede / conexão não fechou / versão; criar sem relay = abrir", async () => {
  const rig = roomRig({ seed: 803 });
  try {
    // Ninguém com a sala aberta: 12 s → 1, 25 s → 2, 45 s → "não achamos a sala".
    const lonely = await BobRoomClient.join({ code: CODE, team: rig.device("B").team, nickname: "B", transportFactory: () => rig.hub.transport("B") }, rig.deps("B"));
    rig.dev.B.client = lonely;
    await rig.runFor(12_500);
    assert.equal(lonely.getState().joinStage, 1);
    await rig.runFor(13_000);
    assert.equal(lonely.getState().joinStage, 2);
    await rig.runFor(20_000);
    assert.equal(lonely.getState().phase, "error");
    assert.equal(lonely.getState().error, "nao-encontrada");
    // Sem relay nenhum aberto: "sem conexão".
    rig.hub.signaling("C", false);
    const offline = await BobRoomClient.join({ code: CODE, team: rig.device("C").team, nickname: "C", transportFactory: () => rig.hub.transport("C") }, rig.deps("C"));
    rig.dev.C.client = offline;
    await rig.runFor(T.JOIN_TIMEOUT_MS + 1000);
    assert.equal(offline.getState().error, "sem-rede");
    // Anfitrião que não consegue abrir a sala (nenhum relay em 8 s).
    rig.hub.signaling("D", false);
    const host = await BobRoomClient.create({ team: rig.device("D").team, nickname: "D", settings: settingsFor("x1"), transportFactory: () => rig.hub.transport("D") }, rig.deps("D", { code: "M4QZ7P" }));
    rig.dev.D.client = host;
    await rig.runFor(T.OPEN_TIMEOUT_MS + 500);
    assert.equal(host.getState().error, "abrir");
  } finally {
    await rig.close();
  }
  const pair = roomRig({ seed: 804 });
  try {
    await pair.create("A", settingsFor("x1"));
    // SDP trocado, ICE não fecha: "Não deu para conectar" logo, sem esperar o tempo da busca.
    pair.hub.joinError("A", "B");
    const blocked = await BobRoomClient.join({ code: CODE, team: pair.device("B").team, nickname: "B", transportFactory: () => pair.hub.transport("B") }, pair.deps("B"));
    pair.dev.B.client = blocked;
    assert.ok(await pair.until(() => blocked.getState().phase === "error", 10_000));
    assert.equal(blocked.getState().error, "conexao");
    pair.hub.joinError("A", "B", false);
    // Hello de outra versão: "desatualizado", com quem precisa atualizar.
    const hello = { ...loadTs("app/bobonline/net/session.ts").localHelloInfo() };
    const old = await BobRoomClient.join({ code: CODE, team: pair.device("C").team, nickname: "C", transportFactory: () => pair.hub.transport("C") }, pair.deps("C", { hello: { ...hello, proto: hello.proto - 1 } }));
    pair.dev.C.client = old;
    assert.ok(await pair.until(() => old.getState().phase === "error", 10_000));
    assert.equal(old.getState().error, "versao");
    assert.equal(old.getState().incompatible.who, "me");
    assert.equal(old.getState().incompatible.theirs.proto, hello.proto);
  } finally {
    await pair.close();
  }
});

test("sair da sala durante o torneio: a partida em andamento vira W.O. por abandono; Desistir também", async () => {
  const rig = roomRig({ seed: 805 });
  try {
    await lobby(rig, "t4", 4);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => ["A", "B", "C", "D"].every((name) => rig.dev[name].duels.length === 1)));
    const matchOf = (name) => rig.snap("A").bracket.matches.find((match) => match.round === 1 && (match.home.entrantId === rig.dev[name].id || match.away.entrantId === rig.dev[name].id));
    const leaver = ["B", "C", "D"].find((name) => matchOf(name).home.entrantId !== rig.dev.A.id && matchOf(name).away.entrantId !== rig.dev.A.id);
    await rig.dev[leaver].client.leave();
    assert.equal(rig.dev[leaver].saved, null, "a sessão salva não foi apagada");
    assert.ok(await rig.until(() => matchOf(leaver).status === "done"));
    assert.equal(matchOf(leaver).result.walkover, "abandon");
    assert.equal(matchOf(leaver).result.winner, matchOf(leaver).home.entrantId === rig.dev[leaver].id ? "away" : "home");
    assert.ok(rig.snap("A").members.find((member) => member.playerId === rig.dev[leaver].id).left);
    // O anfitrião desiste da dele.
    const mine = matchOf("A");
    rig.dev.A.client.forfeit(mine.id);
    assert.ok(await rig.until(() => matchOf("A").status === "done"));
    assert.equal(matchOf("A").result.walkover, "abandon");
    assert.equal(rig.dev.A.duels[0].stopped, true);
  } finally {
    await rig.close();
  }
});

test("hostStart: faltam jogadores / não prontos; o anfitrião está sempre pronto", async () => {
  const rig = roomRig({ seed: 802 });
  try {
    await rig.create("A", settingsFor("x1"));
    assert.deepEqual(rig.dev.A.client.hostStart(), { ok: false, reason: "faltam-jogadores" });
    await rig.join("B");
    assert.ok(await rig.until(() => rig.snap("A").members.length === 2));
    assert.deepEqual(rig.dev.A.client.hostStart(), { ok: false, reason: "nao-prontos" });
    assert.equal(rig.snap("A").members[0].ready, true);
    rig.dev.B.client.setTeam(randomBobTeam(99, { id: "bob-trocado00", now: 1 }));
    rig.dev.B.client.setReady(true);
    assert.ok(await rig.until(() => rig.snap("A").members[1].ready));
    rig.dev.B.client.setTeam(randomBobTeam(98, { id: "bob-trocado01", now: 1 }));
    await rig.runFor(1000);
    assert.equal(rig.snap("A").members[1].ready, true, "trocar de time não mexe no pronto");
    assert.deepEqual(rig.dev.A.client.hostStart(), { ok: true });
  } finally {
    await rig.close();
  }
});

// ---------------------------------------------------------------------------
// De ponta a ponta: sala + DuelController + driver de verdade
// ---------------------------------------------------------------------------

/**
 * Sala com duelos de verdade: cada aparelho monta o driver a partir do `state.duel.launch` (o que a
 * BotaoMatch faz) e um robô joga. CPU × CPU com a simulação de verdade.
 */
function realRig(seed) {
  const rig = roomRig({ seed });
  rig.real = true;
  rig.deps = ((base) => (name, extra = {}) => {
    const deps = base(name, extra);
    delete deps.createDuel;
    deps.simulate = (setup) => Promise.resolve(simulateBotaoMatch(setup));
    return deps;
  })(rig.deps);
  rig.step = async (ms = 50) => {
    await rig.hub.advance(ms);
    for (const dev of Object.values(rig.dev)) {
      const state = dev.client?.getState();
      const handle = state?.phase === "in-room" ? state.duel : null;
      if (handle && dev.mountedKey !== handle.launch.key) {
        mountLaunch(dev, handle.launch, seed);
        dev.handles = [...(dev.handles ?? []), handle];
      }
      if (!handle) dev.mountedKey = null;
      if (!dev.driver || !handle) continue;
      if (handle.role !== "spectator") botStep(dev, ms / 1000);
      dev.driver.frame(ms / 1000, { holding: dev.holding });
      // A tela de resultado: sai quando o driver termina a pausa final (Ver chave / Voltar à sala).
      const match = state.snapshot?.bracket ? matchById(state.snapshot.bracket, handle.bracketId) : null;
      if (match?.status === "done" && dev.driver.finished() && handle.role !== "spectator" && !dev.freed?.has(handle.matchId)) {
        dev.freed = new Set([...(dev.freed ?? []), handle.matchId]);
        if (state.snapshot.settings.format !== "x1") dev.client.leftResultScreen(handle.bracketId);
      }
    }
    rig.autopilot?.();
  };
  return rig;
}

test("de ponta a ponta: X1 com duelo de verdade (m:* pela sala), relatório só do controlador, revanche com lados trocados", async () => {
  const rig = realRig(901);
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    const match = () => rig.snap("A").bracket.matches[0];
    assert.ok(await rig.until(() => match().status === "done", 400_000), `X1 não terminou (${match().status})`);
    // O placar da sala é o do motor nos dois aparelhos (o seguidor viu o mesmo estado).
    assert.equal(rig.dev.A.state.phase, "finished");
    assert.ok(await rig.until(() => rig.dev.B.state.phase === "finished", 30_000));
    const result = rig.dev.A.state.result;
    assert.equal(match().result.homeGoals, result.goalsFor);
    assert.equal(match().result.awayGoals, result.goalsAgainst);
    assert.equal(match().result.winner, result.outcome === "win" ? "home" : "away");
    assert.equal(match().result.reportedBy, rig.dev.A.id, "quem relata é a autoridade");
    assert.equal(rig.state("B").duel.launch.perspective, "cpu");
    rig.dev.A.client.wantRematch(true);
    rig.dev.B.client.wantRematch(true);
    assert.ok(await rig.until(() => match().replay === 1 && match().status === "playing", 10_000));
    assert.ok(await rig.until(() => rig.state("B").duel?.role === "authority" && rig.state("A").duel?.role === "follower", 10_000));
    assert.ok(await rig.until(() => match().status === "done", 400_000), "revanche não terminou");
    assert.equal(match().result.reportedBy, rig.dev.B.id);
    const series = rig.snap("A").series;
    assert.equal(series.home + series.away, 2);
  } finally {
    await rig.close();
  }
});

test("de ponta a ponta: torneio de 8 com 2 humanos e CPU (solos com cérebro próprio, CPU × CPU lacrada) e um espectador", async () => {
  const rig = realRig(902);
  try {
    await lobby(rig, "t8", 2, { fillWithCpu: true });
    await rig.join("C", { asSpectator: true });
    rig.dev.A.client.hostStart();
    const snap = () => rig.snap("A");
    assert.ok(await rig.until(() => rig.state("A").duel?.role === "solo" && rig.state("B").duel?.role === "solo", 10_000), "solos não montaram");
    // O espectador assiste ao solo de B.
    const soloB = snap().bracket.matches.find((match) => match.home?.entrantId === rig.dev.B.id && match.round === 1);
    rig.dev.C.client.spectate(soloB.id);
    assert.ok(await rig.until(() => rig.state("C").duel?.role === "spectator", 5000));
    assert.ok(await rig.until(() => soloB.id && statusOf(rig, "A", soloB.id).status === "done", 400_000), "solo de B não terminou");
    assert.ok(rig.dev.C.handles?.some((handle) => handle.role === "spectator"), "o espectador não montou a partida");
    assert.ok(await rig.until(() => rig.dev.C.state.phase === "finished", 20_000));
    assert.equal(modulesM().hashMatch(rig.dev.C.state), modulesM().hashMatch(rig.dev.B.state), "o espectador terminou noutro estado");
    rig.dev.C.client.stopSpectating();
    assert.equal(rig.state("C").duel, null);
    const seen = new Set();
    const sealed = new Set();
    assert.ok(await rig.until(() => {
      for (const match of snap().bracket.matches) {
        seen.add(`${match.round}:${match.status}`);
        if (match.sealed) sealed.add(match.id);
      }
      return snap().stage === "done";
    }, 900_000), `torneio não acabou: ${JSON.stringify(snap().bracket.matches.map((match) => [match.id, match.kind, match.status]))}`);
    assert.ok(sealed.size >= 2, "CPU × CPU não lacrou");
    void seen;
    assert.ok(championOf(snap().bracket));
    const final = snap().bracket.matches.find((match) => match.round === 2);
    assert.ok(final.result);
  } finally {
    await rig.close();
  }
});

test("de ponta a ponta: torneio de 4 com 3 humanos (duelo + solo na rodada 1, final com 'pronto?' e espera do resultado)", async () => {
  const rig = realRig(903);
  try {
    await lobby(rig, "t4", 3, { fillWithCpu: true });
    rig.dev.A.client.hostStart();
    const snap = () => rig.snap("A");
    const r1 = snap().bracket.matches.filter((match) => match.round === 1);
    assert.deepEqual(r1.map((match) => match.kind).sort(), ["cpu-human", "duel"]);
    const seen = new Set();
    assert.ok(await rig.until(() => {
      const final = snap().bracket.matches.find((match) => match.round === 2);
      seen.add(final.status);
      return snap().stage === "done";
    }, 900_000), `torneio não acabou: ${JSON.stringify(snap().bracket.matches.map((match) => [match.id, match.kind, match.status]))}`);
    assert.ok(seen.has("ready-check"), "a final não teve 'pronto?'");
    assert.ok(championOf(snap().bracket));
    for (const name of ["B", "C"]) {
      assert.ok(await rig.until(() => rig.snap(name).version === snap().version, 10_000));
      assert.deepEqual(rig.snap(name).bracket, snap().bracket);
    }
  } finally {
    await rig.close();
  }
});

// ---------------------------------------------------------------------------
// O que as telas (B6) esperam do cliente da sala
// ---------------------------------------------------------------------------

test("(a) fábricas: devolvem o cliente já em 'connecting' (progresso e erro pelo estado); Cancelar na abertura não deixa conexão; a busca cancelada não apaga a sessão de outra sala", async () => {
  const rig = roomRig({ seed: 1101 });
  try {
    const dev = rig.device("B");
    const other = { code: "M4QZ7P", isHost: false, epoch: 0, savedAt: WALL0 };
    dev.saved = other;
    let transports = 0;
    const factory = () => {
      transports += 1;
      return rig.hub.transport("B");
    };
    // Com senha a abertura espera o hash (cripto assíncrona): a fábrica volta antes, em "connecting".
    const early = await BobRoomClient.join({ code: CODE, team: dev.team, nickname: "B", password: "bola", transportFactory: factory }, rig.deps("B"));
    const state = early.getState();
    assert.equal(state.phase, "connecting");
    assert.equal(state.error, null);
    assert.equal(state.joinStage, 0);
    assert.equal(state.snapshot, null);
    // "Cancelar" da busca (use-room chama leave()) antes de a abertura terminar.
    await early.leave();
    await early.whenBooted();
    assert.equal(transports, 0, "a abertura seguiu depois do Cancelar");
    assert.equal(early.getState().phase, "left");
    assert.deepEqual(dev.saved, other, "cancelar a busca apagou a sessão salva de outra sala");
    // Busca que roda até o fim: tudo pelo estado, a fábrica nunca rejeita.
    const lonely = await BobRoomClient.join({ code: CODE, team: dev.team, nickname: "B", transportFactory: factory }, rig.deps("B"));
    dev.client = lonely;
    assert.equal(lonely.getState().phase, "connecting");
    await rig.runFor(T.JOIN_STAGES_MS[0] + 500);
    assert.equal(lonely.getState().joinStage, 1);
    await rig.runFor(T.JOIN_TIMEOUT_MS - T.JOIN_STAGES_MS[0]);
    assert.equal(lonely.getState().phase, "error");
    assert.equal(lonely.getState().error, "nao-encontrada");
    await lonely.leave();
    assert.deepEqual(dev.saved, other, "a busca que falhou apagou a sessão salva de outra sala");
  } finally {
    await rig.close();
  }
});

test("(b) close() fecha sem room:leave e sem apagar a sessão (e volta); simulateBackground: hb 'bg' e partida congelada pelo caminho do pause/resume", async () => {
  const rig = roomRig({ seed: 1102 });
  try {
    await rig.create("A", settingsFor("x1"));
    await rig.join("B", { deps: { lifecycle: true } });
    rig.dev.B.client.setReady(true);
    assert.ok(await rig.until(() => rig.snap("A").members.every((member) => member.ready)));
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.B.duels.length === 1 && rig.state("A").health[rig.dev.B.id] === "ok"));
    const duel = rig.dev.B.duels[0];
    const presenceOfB = () => rig.snap("A").members.find((member) => member.playerId === rig.dev.B.id).presence;
    rig.dev.B.client.simulateBackground(6000);
    assert.deepEqual(duel.visible, [false], "a partida não congelou");
    assert.ok(await rig.until(() => rig.state("A").health[rig.dev.B.id] === "away", 4000), "A não viu B em segundo plano (vis 'bg')");
    assert.ok(await rig.until(() => presenceOfB() === "away", 3000));
    assert.ok(await rig.until(() => duel.visible.length === 2, 8000), "não voltou");
    assert.deepEqual(duel.visible, [false, true]);
    assert.ok(await rig.until(() => rig.state("A").health[rig.dev.B.id] === "ok" && presenceOfB() === "online", 5000), "B não voltou ao primeiro plano");
    // Sem perfil de teste (produção: sem deps.lifecycle) não faz nada.
    const prod = await BobRoomClient.create({ team: rig.device("C").team, nickname: "C", settings: settingsFor("x1"), transportFactory: () => rig.hub.transport("C") }, { ...rig.deps("C", { code: "M4QZ7P" }), lifecycle: undefined });
    rig.dev.C.client = prod;
    assert.ok(await rig.until(() => prod.getState().phase === "in-room", 10_000));
    prod.simulateBackground(5000);
    await rig.runFor(2000);
    assert.equal(prod.getState().snapshot.members[0].presence, "online", "simulateBackground rodou sem perfil de teste");
    // close(): sem room:leave (A ainda vê B como membro, partida jogando) e a sessão salva fica.
    const saved = rig.dev.B.saved;
    assert.ok(saved);
    await rig.dev.B.client.close();
    assert.equal(rig.state("B").phase, "left");
    assert.deepEqual(rig.dev.B.saved, saved, "close() apagou a sessão salva");
    await rig.runFor(3000);
    const member = rig.snap("A").members.find((entry) => entry.playerId === rig.dev.B.id);
    assert.ok(member && !member.left, "close() mandou room:leave");
    assert.equal(rig.snap("A").bracket.matches[0].status, "playing", "close() virou desistência");
    await rig.resume("B");
    assert.ok(await rig.until(() => rig.state("B").phase === "in-room" && rig.state("B").duel?.matchId === duel.matchId, 15_000), "não voltou para a mesma partida");
  } finally {
    await rig.close();
  }
});

test("(c) recusa 'iniciada' traz os ajustes da sala: X1 × torneio na cópia e Assistir só quando a sala deixa", async () => {
  const x1 = roomRig({ seed: 1103 });
  try {
    await lobby(x1, "x1", 2);
    x1.dev.A.client.hostStart();
    const late = await x1.join("C");
    assert.equal(late.getState().phase, "error");
    assert.equal(late.getState().error, "iniciada");
    assert.equal(late.getState().snapshot.settings.format, "x1");
    assert.equal(late.getState().snapshot.settings.allowSpectators, true);
    assert.equal(late.getState().isHost, false);
  } finally {
    await x1.close();
  }
  const closed = roomRig({ seed: 1104 });
  try {
    await lobby(closed, "t4", 2, { allowSpectators: false });
    closed.dev.A.client.hostStart();
    for (const asSpectator of [false, true]) {
      const late = await closed.join("C", { asSpectator });
      const snapshot = late.getState().snapshot;
      assert.equal(late.getState().error, "iniciada");
      assert.equal(snapshot.settings.format, "t4");
      assert.equal(snapshot.settings.allowSpectators, false);
      assert.equal(snapshot.members.length, 0, "a recusa levou os membros");
      assert.equal(snapshot.passwordProof, null, "a recusa levou a prova da senha");
    }
  } finally {
    await closed.close();
  }
});

test("(d) removido: quem perdeu o room:kick sai assim que um snapshot (troca de anfitrião) o lista como banido, e nunca assume a sala", async () => {
  const rig = roomRig({ seed: 1105 });
  try {
    await lobby(rig, "t4", 3);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => ["A", "B", "C"].every((name) => rig.dev[name].duels.length === 1)));
    // O room:kick não chega em C.
    const session = rig.dev.C.client.session;
    const onMessage = session.onMessage;
    session.onMessage = (from, kind, body) => (kind === "room:kick" ? undefined : onMessage(from, kind, body));
    rig.dev.A.client.hostKick(rig.dev.C.id);
    assert.ok(await rig.until(() => rig.snap("B").banned.includes(rig.dev.C.id), 5000));
    await rig.runFor(1000);
    assert.equal(rig.state("C").phase, "in-room", "C saiu sem o room:kick");
    // O anfitrião some: B assume; o host:claim (para todos, removidos inclusive) lista C como banido.
    await rig.kill("A");
    assert.ok(await rig.until(() => rig.state("C").phase === "error", 40_000), `C não saiu (${rig.state("C").phase})`);
    assert.equal(rig.state("C").error, "removido");
    assert.equal(rig.dev.C.saved, null, "a sessão salva de quem foi removido ficou");
    assert.ok(await rig.until(() => rig.snap("B").hostId === rig.dev.B.id, 10_000));
    assert.ok(rig.snap("B").banned.includes(rig.dev.C.id));
  } finally {
    await rig.close();
  }
});

test("(e) 'pronto?' contra a CPU: readyDeadlineLocal no relógio de quem joga e opponent 'cpu'; avisos que não são da minha partida vêm adiados", async () => {
  const rig = roomRig({ seed: 1106, skew: { B: 180_000 } });
  try {
    await lobby(rig, "t4", 2, { fillWithCpu: true });
    // A perde para a CPU na rodada 1, B vence: a final é B × CPU.
    autopilot(rig, { playMs: 3000, pick: (duel) => (duel.dev.name === "A" ? "cpu" : "user"), ready: () => false });
    rig.dev.A.client.hostStart();
    const final = () => rig.snap("A").bracket.matches.find((match) => match.round === 2);
    assert.ok(await rig.until(() => final().status === "ready-check", 90_000), `a final não chegou ao 'pronto?' (${final().status})`);
    assert.ok(await rig.until(() => rig.state("B").nextMatch?.readyDeadlineLocal != null, 5000));
    const next = rig.state("B").nextMatch;
    assert.equal(next.bracketId, final().id);
    assert.equal(next.opponent, "cpu");
    assert.equal(next.holdUntilLocal, null);
    assert.ok(Math.abs(next.readyDeadlineLocal - (final().readyDeadline + 180_000)) <= 1000, `prazo local ${next.readyDeadlineLocal - final().readyDeadline}`);
  } finally {
    await rig.close();
  }
  const four = roomRig({ seed: 1107 });
  try {
    await lobby(four, "t4", 4);
    four.dev.A.client.hostStart();
    assert.ok(await four.until(() => ["A", "B", "C", "D"].every((name) => four.dev[name].duels.length === 1)));
    const nameOf = (id) => NAMES.find((name) => four.dev[name]?.id === id);
    const r1 = four.snap("A").bracket.matches.filter((match) => match.round === 1);
    const hostMatch = r1.find((match) => match.home.entrantId === four.dev.A.id || match.away.entrantId === four.dev.A.id);
    const other = r1.find((match) => match !== hostMatch);
    // P joga contra Q; R está na partida do anfitrião.
    const [P, Q] = [nameOf(other.home.entrantId), nameOf(other.away.entrantId)];
    const R = nameOf(hostMatch.home.entrantId === four.dev.A.id ? hostMatch.away.entrantId : hostMatch.home.entrantId);
    await four.kill(Q);
    await four.kill(R);
    const fell = (name) => four.state(P).toasts.find((toast) => toast.text === `Jogador ${name} caiu, esperando voltar…`);
    assert.ok(await four.until(() => fell(Q) && fell(R), 20_000), JSON.stringify(four.state(P).toasts));
    assert.equal(fell(Q).deferred, false, "a queda do meu adversário veio adiada");
    assert.equal(fell(R).deferred, true, "a queda de quem não está na minha partida não veio adiada");
    for (const toast of four.state(P).toasts) if (toast !== fell(Q)) assert.equal(toast.deferred, true, toast.text);
  } finally {
    await four.close();
  }
});

test("(f) W.O. fecha na hora; fim normal: a partida de quem ficou para trás segue viva até terminar aqui ou 8 s (o handle fica)", async () => {
  const rig = roomRig({ seed: 1108 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    const match = () => rig.snap("A").bracket.matches[0];
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    // Jogo 1: a autoridade (A) termina; o motor de B ainda não.
    const [a1, b1] = [rig.dev.A.duels[0], rig.dev.B.duels[0]];
    a1.finish("user");
    assert.ok(await rig.until(() => rig.snap("B").bracket.matches[0].status === "done"));
    const doneAt = rig.hub.now();
    assert.equal(a1.disposed, true, "a autoridade que já terminou ficou viva");
    assert.equal(b1.disposed, false, "a partida de quem estava atrás morreu junto com o resultado");
    assert.equal(rig.state("B").duel?.matchId, b1.matchId, "o handle saiu antes do onFinish");
    assert.ok(await rig.until(() => b1.disposed, 10_000));
    const lived = rig.hub.now() - doneAt;
    assert.ok(lived >= 7700 && lived <= 8800, `viveu ${lived} ms`);
    assert.equal(rig.state("B").duel?.matchId, b1.matchId, "o handle só sai quando a tela solta");
    // Jogo 2 (revanche, B manda): A fica para trás e termina aqui logo depois → solta no tick seguinte.
    rig.dev.A.client.wantRematch(true);
    rig.dev.B.client.wantRematch(true);
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 2 && rig.dev.B.duels.length === 2));
    const [a2, b2] = [rig.dev.A.duels[1], rig.dev.B.duels[1]];
    b2.finish("user");
    assert.ok(await rig.until(() => match().replay === 1 && match().status === "done"));
    await rig.runFor(1000);
    assert.equal(a2.disposed, false, "a partida de A morreu antes de terminar aqui");
    a2.localDone = true;
    assert.ok(await rig.until(() => a2.disposed, 600), "terminou aqui e não soltou");
    // Jogo 3: B desiste → W.O. na hora; a partida de A para já e o handle continua (tela de resultado).
    rig.dev.A.client.wantRematch(true);
    rig.dev.B.client.wantRematch(true);
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 3 && rig.dev.B.duels.length === 3));
    const a3 = rig.dev.A.duels[2];
    const forfeitAt = rig.hub.now();
    rig.dev.B.client.forfeit(match().id);
    assert.ok(await rig.until(() => rig.snap("B").bracket.matches[0].status === "done", 2000), "o W.O. não fechou");
    assert.ok(rig.hub.now() - forfeitAt <= 1000, `W.O. em ${rig.hub.now() - forfeitAt} ms`);
    assert.equal(match().result.decision, "walkover");
    assert.equal(match().result.walkover, "abandon");
    assert.equal(a3.disposed, true, "a partida seguiu depois do W.O.");
    assert.equal(rig.state("A").duel?.matchId, a3.matchId);
    assert.equal(rig.state("B").duel?.matchId, a3.matchId);
  } finally {
    await rig.close();
  }
});

// ---------------------------------------------------------------------------
// O que a chave (B3) espera do controlador
// ---------------------------------------------------------------------------

test("(g) chave encolhida (t8 sem CPU): fase pelo bracket.size, entrantes na ordem de entrada, mandante quem entrou antes", async () => {
  // Nome da fase que cada aparelho montou para a partida (o setup do duelo).
  const stagesOf = (rig, bracketId) => Object.values(rig.dev)
    .flatMap((dev) => dev.duels.filter((duel) => duel.bracketId === bracketId).map((duel) => duel.args.setup.stageName));
  // 3 humanos: chave de 4, um duelo na rodada 1 (semifinal, não quartas) e a final contra quem folgou.
  const three = roomRig({ seed: 1110 });
  try {
    await lobby(three, "t8", 3, { fillWithCpu: false });
    autopilot(three, { playMs: 3000, pick: () => "user" });
    three.dev.A.client.hostStart();
    const bracket = three.snap("A").bracket;
    assert.equal(bracket.size, 4, "a chave não encolheu");
    assert.equal(bracket.rounds, 2);
    assert.deepEqual(bracket.entrants.map((entrant) => entrant.id), ["A", "B", "C"].map((name) => three.dev[name].id), "entrantes fora da ordem de entrada");
    const joinOrder = (id) => three.snap("A").members.find((member) => member.playerId === id).joinOrder;
    const semi = bracket.matches.find((match) => match.round === 1 && match.kind === "duel");
    assert.ok(semi, "sem duelo na rodada 1");
    assert.ok(joinOrder(semi.home.entrantId) < joinOrder(semi.away.entrantId), "o mandante não é quem entrou antes");
    assert.ok(await three.until(() => stagesOf(three, semi.id).length === 2, 10_000), "o duelo da rodada 1 não montou nos dois");
    assert.deepEqual(stagesOf(three, semi.id), ["Semifinal", "Semifinal"]);
    const final = () => three.snap("A").bracket.matches.find((match) => match.round === 2);
    assert.ok(await three.until(() => final().status === "playing", 120_000), `a final não começou (${final().status})`);
    assert.ok(joinOrder(final().home.entrantId) < joinOrder(final().away.entrantId), "final: o mandante não é quem entrou antes");
    assert.ok(await three.until(() => stagesOf(three, final().id).length === 2, 10_000), "a final não montou nos dois");
    assert.deepEqual(stagesOf(three, final().id), ["Final", "Final"]);
    assert.ok(await three.until(() => three.snap("A").stage === "done", 120_000), "o torneio não acabou");
  } finally {
    await three.close();
  }
  // 2 humanos: os dois folgam e o único jogo é a final (com o tamanho do formato seria "Semifinal").
  const two = roomRig({ seed: 1111 });
  try {
    await lobby(two, "t8", 2, { fillWithCpu: false });
    autopilot(two, { playMs: 3000, pick: () => "user" });
    two.dev.A.client.hostStart();
    const bracket = two.snap("A").bracket;
    assert.equal(bracket.size, 4);
    assert.ok(bracket.matches.filter((match) => match.round === 1).every((match) => match.kind === "bye"));
    const final = () => two.snap("A").bracket.matches.find((match) => match.round === 2);
    assert.ok(await two.until(() => stagesOf(two, final().id).length === 2, 60_000), `a final não montou (${final().status})`);
    assert.deepEqual(stagesOf(two, final().id), ["Final", "Final"]);
    assert.equal(final().home.entrantId, two.dev.A.id, "final: o mandante não é quem entrou antes");
  } finally {
    await two.close();
  }
});

// ---------------------------------------------------------------------------
// Achados da revisão (F-room): concessão, W.O. recusado/provisório, linhagem, intrusos
// ---------------------------------------------------------------------------

/** Um par qualquer na sala do Trystero (sabe o código, não é membro): sessão crua com hello verificado. */
async function intruder(rig, name = "M") {
  const session = new BobSession({ identity: identities[NAMES.length], transport: rig.hub.transport(name), hello: localHelloInfo(), incarnation: ++incarnation, now: () => rig.hub.now() + WALL0 });
  session.received = [];
  session.onMessage = (from, kind, body) => {
    session.received.push({ from, kind, body });
    session.onRoom?.(from, kind, body);
  };
  session.connect(CODE);
  await rig.runFor(3000);
  return session;
}

const matchOf = (rig, name, duel) => matchById(rig.snap(name).bracket, duel.bracketId);

test("concessão: quem não voltou a tempo concede (o outro recebe o match:forfeit, o anfitrião dá o W.O. depois de 10 s); os dois concedendo é a moeda", async () => {
  const rig = roomRig({ seed: 1201 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    const [a, b] = [rig.dev.A.duels[0], rig.dev.B.duels[0]];
    // O convidado (seguidor, lado cpu) viu a própria reserva zerar; o anfitrião ainda via a dele com sobra.
    const conceded = rig.hub.now();
    b.walkover("user");
    assert.ok(await rig.until(() => a.received.some((entry) => entry.kind === "match:forfeit" && entry.from === rig.dev.B.id), 3000), "o adversário não soube da concessão");
    assert.ok(await rig.until(() => matchOf(rig, "B", b).status === "done", 20_000), "a concessão não fechou a partida");
    assert.ok(rig.hub.now() - conceded >= T.WO_EVIDENCE_MS - STEP, "a concessão não esperou a do outro lado");
    const result = matchOf(rig, "A", a).result;
    assert.equal(result.decision, "walkover");
    assert.equal(result.walkover, "timeout");
    assert.equal(result.winner, "home");
  } finally {
    await rig.close();
  }
  // A mesma rede caiu para os dois: os dois concedem → moeda determinística da partida.
  const both = roomRig({ seed: 1202 });
  try {
    await lobby(both, "x1", 2);
    both.dev.A.client.hostStart();
    assert.ok(await both.until(() => both.dev.A.duels.length === 1 && both.dev.B.duels.length === 1));
    const [a, b] = [both.dev.A.duels[0], both.dev.B.duels[0]];
    a.walkover("cpu");
    await both.runFor(2000);
    b.walkover("user");
    assert.ok(await both.until(() => matchOf(both, "B", b).status === "done", 5000), "a dupla concessão não fechou");
    const result = matchOf(both, "B", b).result;
    assert.equal(result.walkover, "double");
    assert.equal(result.winner, matchCoin(a.args.setup) === "user" ? "home" : "away");
  } finally {
    await both.close();
  }
});

test("W.O. pedido com o ausente à vista do anfitrião: match:wo-no ao pedido (a partida volta); escondido, o anfitrião segura o pedido e decide na volta", async () => {
  const rig = roomRig({ seed: 1203 });
  try {
    await lobby(rig, "t4", 4);
    autopilot(rig, { playMs: 10_000_000 });
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => ["A", "B", "C", "D"].every((name) => rig.dev[name].duels.length === 1)));
    // Partida sem o anfitrião: a autoridade pede o W.O. com o outro presente → recusa explícita.
    const other = rig.snap("A").bracket.matches.find((match) => match.round === 1 && match.home.entrantId !== rig.dev.A.id && match.away.entrantId !== rig.dev.A.id);
    const claimant = Object.values(rig.dev).find((dev) => dev.id === other.authority).duels[0];
    claimant.walkover(claimant.side);
    assert.ok(await rig.until(() => claimant.rejected === 1, 3000), "o pedido recusado não voltou a quem pediu");
    await rig.runFor(10_000);
    assert.equal(matchOf(rig, "A", claimant).status, "playing");
    assert.equal(claimant.rejected, 1, "o pedido recusado foi reenviado");
    // Partida do anfitrião: ele vai para segundo plano e o outro pede o W.O. contra ele.
    const mine = rig.dev.A.duels[0];
    const match = matchOf(rig, "A", mine);
    const rival = Object.values(rig.dev).find((dev) => dev.id === (match.home.entrantId === rig.dev.A.id ? match.away.entrantId : match.home.entrantId));
    const hiddenAt = rig.hub.now();
    rig.dev.A.client.simulateBackground(20_000);
    await rig.runFor(2000);
    rival.duels[0].walkover(rival.duels[0].side);
    await rig.runFor(6000);
    assert.equal(matchOf(rig, "A", mine).status, "playing");
    assert.equal(rival.duels[0].rejected ?? 0, 0, "o anfitrião escondido recusou com a reserva parada");
    // Na volta, a reserva dele (a do aparelho) acabou: o pedido reenviado fecha.
    mine.pools[rig.dev.A.id] = 0;
    assert.ok(await rig.until(() => matchOf(rig, rival.name, mine).status === "done", 30_000), "o W.O. contra o anfitrião ficou parado");
    const closedAt = rig.hub.now() - (hiddenAt + 20_000);
    assert.ok(closedAt >= -STEP && closedAt <= 6000, `fechou ${closedAt} ms depois da volta`);
    const result = matchOf(rig, rival.name, mine).result;
    assert.equal(result.walkover, "timeout");
    assert.equal(result.winner, match.home.entrantId === rig.dev.A.id ? "away" : "home");
  } finally {
    await rig.close();
  }
});

test("X1: o pedido de W.O. do próprio anfitrião só vale com prova de rede (sem sinalização fica na fila e volta; sem o outro para comparar, só depois de 1 min)", async () => {
  const rig = roomRig({ seed: 1204 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    const a = rig.dev.A.duels[0];
    const cut = rig.hub.now();
    rig.hub.signaling("A", false);
    rig.hub.partition("A", "B", true);
    await rig.runFor(15_000);
    a.walkover("user");
    await rig.runFor(8000);
    assert.equal(matchOf(rig, "A", a).status, "playing", "o anfitrião sem rede deu a vitória a si mesmo");
    rig.hub.signaling("A", true);
    // Com a sinalização de volta e o convidado ainda sumido: sem outro jogador para comparar, quem caiu
    // pode ter sido o próprio anfitrião (queda silenciosa); o pedido na fila vale depois de 1 min.
    assert.ok(await rig.until(() => matchOf(rig, "A", a).status === "done", 60_000), "o pedido na fila não voltou");
    assert.ok(rig.hub.now() - cut >= 58_000, `fechou ${rig.hub.now() - cut} ms depois da queda`);
    assert.equal(matchOf(rig, "A", a).result.winner, "home");
  } finally {
    await rig.close();
  }
});

test("W.O. duplo: do seguidor sozinho fica guardado; o vencedor é sempre a moeda da partida", async () => {
  const rig = roomRig({ seed: 1205 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    const [a, b] = [rig.dev.A.duels[0], rig.dev.B.duels[0]];
    const coin = matchCoin(a.args.setup);
    // O seguidor (modificado) relata "duplo" logo depois da largada, com ele mesmo vencendo.
    b.walkover("cpu", "double");
    await rig.runFor(5000);
    assert.equal(matchOf(rig, "A", a).status, "playing", "um 'duplo' do seguidor fechou a partida");
    // A autoridade relata "duplo" com o lado errado: vale a moeda.
    a.walkover(coin === "user" ? "cpu" : "user", "double");
    assert.ok(await rig.until(() => matchOf(rig, "B", b).status === "done", 3000));
    const result = matchOf(rig, "B", b).result;
    assert.equal(result.walkover, "double");
    assert.equal(result.winner, coin === "user" ? "home" : "away");
  } finally {
    await rig.close();
  }
});

test("W.O. de travamento só com a vez aberta sendo da autoridade (a do seguidor nunca prova travamento)", async () => {
  const rig = roomRig({ seed: 1206 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    const [a, b] = [rig.dev.A.duels[0], rig.dev.B.duels[0]];
    // O n da autoridade parado com a vez do seguidor aberta (own null): o seguidor não joga e pede "stall".
    a.progress = { matchId: a.matchId, n: 7, restN: 7, h: "x", se: 0, opened: 7, own: null };
    await rig.runFor(14_000);
    b.walkover("cpu", "stall");
    assert.ok(await rig.until(() => b.rejected === 1, 3000), "o pedido de travamento não foi recusado");
    assert.equal(matchOf(rig, "A", a).status, "playing");
    // Agora a vez é da autoridade e ela não joga: depois da janela inteira, vale.
    a.progress = { ...a.progress, own: { idleLeft: 0, kickLeft: null } };
    await rig.runFor((T.AUTHORITY_STALL_S + 1) * 1000);
    b.walkover("cpu", "stall");
    assert.ok(await rig.until(() => matchOf(rig, "A", a).status === "done", 3000));
    assert.equal(matchOf(rig, "A", a).result.winner, "away");
  } finally {
    await rig.close();
  }
});

test("anfitrião sem rede por 20 s com a página aberta: a reivindicação que chega tarde vale (nada de veto velho) e a sala fica com um anfitrião só", async () => {
  const rig = roomRig({ seed: 1207 });
  try {
    await lobby(rig, "t4", 3);
    rig.isolate("A", true);
    assert.ok(await rig.until(() => rig.snap("B").epoch === 1 && rig.snap("C").epoch === 1, 30_000), "ninguém assumiu");
    await rig.runFor(6000);
    rig.isolate("A", false);
    await rig.runFor(30_000);
    assert.deepEqual(rig.hosts(), ["B"], `anfitriões: ${rig.hosts().join(",") || "nenhum"}`);
    assert.ok(rig.converged(["A", "B", "C"]), ["A", "B", "C"].map((name) => `${name}:${rig.snap(name).epoch}|${rig.snap(name).hostId.slice(0, 6)}`).join(" "));
    assert.equal(rig.snap("A").hostId, rig.dev.B.id);
  } finally {
    await rig.close();
  }
});

test("membro sem rede por 30 s não se faz anfitrião sozinho (maioria dos elegíveis, não dos que ele vê)", async () => {
  const rig = roomRig({ seed: 1208 });
  try {
    await lobby(rig, "t4", 3);
    let claims = 0;
    const session = rig.dev.C.client.session;
    const broadcast = session.broadcast.bind(session);
    session.broadcast = (kind, body, filter) => {
      if (kind === "host:claim") claims += 1;
      broadcast(kind, body, filter);
    };
    rig.isolate("C", true);
    await rig.runFor(30_000);
    assert.equal(claims, 0, "o isolado reivindicou");
    rig.isolate("C", false);
    await rig.runFor(20_000);
    assert.deepEqual(rig.hosts(), ["A"]);
    assert.ok(rig.converged(["A", "B", "C"]));
    for (const name of ["A", "B", "C"]) assert.equal(rig.snap(name).epoch, 0);
  } finally {
    await rig.close();
  }
});

test("anfitrião em segundo plano 60 s: a reivindicação 'away' passa sem veto (só quem o vê em primeiro plano veta) e sem repetição", async () => {
  const rig = roomRig({ seed: 1209 });
  try {
    await lobby(rig, "t4", 4);
    autopilot(rig, { playMs: 10_000_000 });
    rig.dev.A.client.hostStart();
    let claims = 0;
    for (const name of ["B", "C", "D"]) {
      const session = rig.dev[name].client.session;
      const broadcast = session.broadcast.bind(session);
      session.broadcast = (kind, body, filter) => {
        if (kind === "host:claim") claims += 1;
        broadcast(kind, body, filter);
      };
    }
    rig.dev.A.client.simulateBackground(60_000);
    assert.ok(await rig.until(() => ["B", "C", "D"].every((name) => rig.snap(name).hostId === rig.dev.B.id), 50_000), "o anfitrião em segundo plano nunca saiu");
    await rig.runFor(40_000);
    assert.equal(claims, 1, `${claims} reivindicações`);
    assert.deepEqual(rig.hosts(), ["B"]);
    assert.ok(rig.converged(["A", "B", "C", "D"]));
    assert.ok(rig.state("B").toasts.filter((toast) => /agora é o anfitrião/.test(toast.text)).length <= 1);
  } finally {
    await rig.close();
  }
});

test("anfitrião isolado não cobra reserva: o solo de quem segue jogando não vira W.O. da CPU", async () => {
  const rig = roomRig({ seed: 602 });
  try {
    await lobby(rig, "t4", 3, { fillWithCpu: true });
    autopilot(rig, { playMs: 10_000_000 });
    rig.dev.A.client.hostStart();
    const solo = (name) => rig.snap(name).bracket.matches.find((match) => match.round === 1 && match.kind === "cpu-human" && match.home.entrantId === rig.dev.B.id);
    assert.ok(await rig.until(() => ["B", "C"].every((name) => rig.snap(name).stage === "running")));
    assert.ok(solo("A"), "nesta semente B joga contra a CPU na rodada 1");
    rig.isolate("A", true);
    await rig.runFor(110_000);
    assert.equal(solo("A").status, "playing", "o anfitrião isolado deu a vitória à CPU");
    rig.isolate("A", false);
    await rig.runFor(20_000);
    for (const name of ["A", "B", "C"]) assert.equal(solo(name).status, "playing", `${name}: solo fechado`);
    assert.equal(rig.hosts().length, 1);
  } finally {
    await rig.close();
  }
});

test("'Novo torneio': matchIds com o sorteio (nunca repetem) e os fatos do anterior não fecham partidas do novo", async () => {
  const rig = roomRig({ seed: 1210 });
  try {
    await lobby(rig, "t4", 2, { fillWithCpu: true });
    autopilot(rig, { playMs: 3000 });
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.snap("A").stage === "done", 900_000), "o primeiro torneio não acabou");
    const first = new Set(Object.values(rig.dev).flatMap((dev) => dev.duels.map((duel) => duel.matchId)));
    const firstFacts = rig.dev.A.roomStore.load(CODE).facts.length;
    assert.ok(firstFacts >= 3);
    rig.dev.A.client.hostNewTournament();
    assert.ok(await rig.until(() => rig.snap("B").stage === "lobby"));
    rig.dev.B.client.setReady(true);
    assert.ok(await rig.until(() => rig.snap("A").members.every((member) => member.ready)));
    const before = Object.values(rig.dev).map((dev) => dev.duels.length);
    autopilot(rig, { playMs: 10_000_000 }); // o segundo torneio fica jogando
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => Object.values(rig.dev).every((dev, index) => dev.duels.length > before[index]), 20_000));
    const second = Object.values(rig.dev).flatMap((dev, index) => dev.duels.slice(before[index]).map((duel) => duel.matchId));
    for (const matchId of second) assert.ok(!first.has(matchId), `matchId repetido: ${matchId}`);
    // O anfitrião recarrega logo no começo: nada do torneio anterior fecha partida do novo.
    await rig.dev.A.client.close();
    await rig.runFor(1500);
    await rig.resume("A");
    assert.ok(await rig.until(() => rig.state("A").phase === "in-room" && rig.state("A").isHost, 10_000));
    await rig.runFor(15_000);
    assert.ok(rig.snap("A").bracket.matches.filter((match) => match.round === 1 && match.kind !== "bye" && match.kind !== "cpu-cpu").every((match) => match.status === "playing"), "partida do torneio novo fechada por um fato velho");
  } finally {
    await rig.close();
  }
});

test("intruso com o código (sem ser membro): room:snap/host:claim forjados, replay, 'ao vivo' e times falsos não pegam", async () => {
  const rig = roomRig({ seed: 1211 });
  let m = null;
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    m = await intruder(rig);
    const snap = structuredClone(rig.snap("B"));
    const match = snap.bracket.matches[0];
    // Fato de outra linhagem inventado: fecharia a partida 0×9.
    const result = { matchId: rig.dev.A.duels[0].matchId, winner: "away", homeGoals: 0, awayGoals: 9, homePens: null, awayPens: null, decision: "goal-limit", reportedBy: m.playerId, at: 1 };
    m.send(rig.dev.A.id, "match:report", { bracketId: match.id, matchId: result.matchId, result, replay: true, sides: [match.home.entrantId, match.away.entrantId] });
    // "Ao vivo" sem placar (derrubava a tela da chave) e times inventados.
    m.send(rig.dev.B.id, "live", { bracketId: match.id, matchId: "x" });
    const junk = randomBobTeam(999, { id: "bob-junk0000000", now: 1 });
    m.send(rig.dev.B.id, "room:teams", { teams: { "hash-falso": junk } });
    await rig.runFor(3000);
    assert.equal(matchOf(rig, "A", rig.dev.A.duels[0]).status, "playing", "o replay forjado fechou a partida");
    assert.equal(rig.state("B").live[match.id], undefined, "'ao vivo' de quem não roda a partida");
    assert.equal(rig.state("B").teams["hash-falso"], undefined, "time falso guardado");
    // Linhagem forjada: o intruso "anfitrião", época + 2, banindo B; e a mesma reivindicação para A.
    const forged = { ...snap, hostId: m.playerId, epoch: snap.epoch + 2, version: 1, banned: [rig.dev.B.id], hostNow: rig.hub.now() + WALL0 };
    for (const name of ["A", "B"]) assert.equal(m.health(rig.dev[name].id), "ok", `o intruso perdeu o link com ${name}`);
    m.send(rig.dev.A.id, "host:claim", { snapshot: forged });
    await rig.runFor(2000);
    assert.equal(rig.state("A").isHost, true, "a reivindicação forjada derrubou o anfitrião");
    assert.equal(rig.snap("A").epoch, snap.epoch);
    m.send(rig.dev.B.id, "room:snap", { snapshot: forged });
    await rig.runFor(2000);
    assert.equal(rig.state("B").phase, "in-room", "o snapshot forjado tirou B da sala");
    assert.equal(rig.snap("B").hostId, rig.dev.A.id);
    // O "ao vivo" de verdade (da autoridade, com placar) continua entrando.
    rig.dev.A.client.session.sendLossy(rig.dev.B.id, "live", { matchId: rig.dev.A.duels[0].matchId, bracketId: match.id, score: { home: 1, away: 0 }, pens: null, clock: 30, period: 1, phase: "aim", text: null });
    assert.ok(await rig.until(() => rig.state("B").live[match.id]?.score.home === 1, 3000));
  } finally {
    await m?.leave();
    await rig.close();
  }
});

test("entrando: a recusa de um intruso não derruba a busca (as boas-vindas do anfitrião chegam e valem)", async () => {
  const rig = roomRig({ seed: 1212 });
  let m = null;
  try {
    await rig.create("A", settingsFor("t4"));
    m = await intruder(rig);
    // As boas-vindas do anfitrião demoram um pouco mais que a recusa do intruso.
    rig.hub.setLatency("A", "B", 300);
    m.onRoom = (from, kind) => {
      if (kind === "room:join") m.send(from, "room:reject", { reason: "senha-errada" });
    };
    await rig.join("B");
    assert.equal(rig.state("B").phase, "in-room", `B: ${rig.state("B").error}`);
    assert.ok(m.received.some((entry) => entry.kind === "room:join"), "o intruso nem viu o pedido");
  } finally {
    await m?.leave();
    await rig.close();
  }
});

test("entrando pelo link com o id do anfitrião (&h=): boas-vindas forjadas e recusa de um intruso não valem; sem o anfitrião do link, a resposta de outro vale depois da espera", async () => {
  const rig = roomRig({ seed: 1214 });
  let m = null;
  try {
    await rig.create("A", settingsFor("t4"));
    m = await intruder(rig);
    // O intruso responde antes do anfitrião: boas-vindas de uma "linhagem" própria (época 99) e uma recusa.
    rig.hub.setLatency("A", "B", 300);
    const real = structuredClone(rig.snap("A"));
    m.onRoom = (from, kind) => {
      if (kind !== "room:join") return;
      m.send(from, "room:welcome", { snapshot: { ...real, hostId: m.playerId, epoch: 99 }, teams: {} });
      m.send(from, "room:reject", { reason: "senha-errada" });
    };
    await rig.join("B", { hostId: rig.dev.A.id });
    assert.equal(rig.state("B").phase, "in-room", `B: ${rig.state("B").error}`);
    assert.equal(rig.snap("B").hostId, rig.dev.A.id, "B adotou as boas-vindas do intruso");
    assert.ok(m.received.some((entry) => entry.kind === "room:join"), "o intruso nem viu o pedido");
    // Passada a espera, o que o intruso mandou não volta à tona.
    await rig.runFor(T.JOIN_STAGES_MS[0] + 2000);
    assert.equal(rig.state("B").phase, "in-room");
    assert.equal(rig.snap("B").hostId, rig.dev.A.id);
    assert.equal(rig.snap("B").epoch, real.epoch);
    // Link velho (o anfitrião do link já não hospeda): as boas-vindas do anfitrião de agora esperam e valem.
    m.onRoom = null;
    const start = rig.hub.now();
    await rig.join("C", { hostId: identities[NAMES.length + 1].playerId });
    assert.equal(rig.state("C").phase, "in-room", `C: ${rig.state("C").error}`);
    assert.equal(rig.snap("C").hostId, rig.dev.A.id);
    assert.ok(rig.hub.now() - start >= T.JOIN_STAGES_MS[0], `C entrou em ${rig.hub.now() - start} ms, antes da espera`);
  } finally {
    await m?.leave();
    await rig.close();
  }
});

test("espectadores: no máximo 8 na sala; quem fechou a aba sem sair libera a vaga depois de 2 min sem sinal", async () => {
  const rig = roomRig({ seed: 1213 });
  try {
    await rig.create("A", settingsFor("t4"));
    const watchers = ["C", "D", "E", "F", "G", "H", "I", "J"];
    for (const name of watchers) await rig.join(name, { asSpectator: true });
    assert.equal(rig.snap("A").members.filter((member) => member.role === "spectator").length, 8);
    await rig.join("B", { asSpectator: true });
    assert.equal(rig.state("B").phase, "error");
    assert.equal(rig.state("B").error, "cheia");
    await rig.dev.B.client.close();
    await rig.kill("J");
    assert.ok(await rig.until(() => !rig.snap("A").members.some((member) => member.playerId === rig.dev.J.id), 200_000), "o espectador que sumiu ficou na sala");
    await rig.join("B", { asSpectator: true });
    assert.equal(rig.state("B").phase, "in-room");
  } finally {
    await rig.close();
  }
});

test("remover alguém no lobby: o anfitrião vê '{apelido} saiu' uma vez só", async () => {
  const rig = roomRig({ seed: 1214 });
  try {
    await lobby(rig, "t4", 3);
    rig.dev.A.client.hostKick(rig.dev.C.id);
    await rig.runFor(2000);
    assert.equal(rig.state("A").toasts.filter((toast) => toast.text === "Jogador C saiu").length, 1);
  } finally {
    await rig.close();
  }
});

// ---------------------------------------------------------------------------
// Linhagem depois de quedas silenciosas, maioria, saltos de época, X1, espectador, travamento, times
// ---------------------------------------------------------------------------

const nameOfId = (rig, id) => Object.values(rig.dev).find((dev) => dev.id === id)?.name ?? id;

test("X1: convidado sem rede ~100 s (sinalização no ar) só se faz anfitrião depois de 1 min; na volta o anfitrião fica com a sala e o W.O. legítimo dele vale", async () => {
  const rig = roomRig({ seed: 4242 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    const [a, b] = [rig.dev.A.duels[0], rig.dev.B.duels[0]];
    const cut = rig.hub.now();
    rig.isolate("B", true);
    let claimedAt = null;
    while (rig.hub.now() - cut < 98_000) {
      await rig.step();
      if (claimedAt === null && rig.snap("B").hostId === rig.dev.B.id) claimedAt = rig.hub.now() - cut;
    }
    assert.ok(claimedAt !== null && claimedAt >= 55_000, `B se fez anfitrião em ${claimedAt} ms`);
    // Cada lado viu a reserva do outro zerar e pediu o W.O. (cada um anfitrião da própria linhagem).
    a.walkover("user");
    b.walkover("cpu");
    await rig.runFor(2000);
    assert.equal(matchOf(rig, "A", a).status, "done");
    assert.equal(matchOf(rig, "B", b).status, "done");
    rig.isolate("B", false);
    await rig.runFor(40_000);
    assert.deepEqual(rig.hosts(), ["A"]);
    assert.ok(rig.converged(["A", "B"]), `B: ${rig.snap("B").epoch}|${nameOfId(rig, rig.snap("B").hostId)}`);
    assert.equal(rig.snap("B").epoch, 0);
    for (const name of ["A", "B"]) {
      const match = matchById(rig.snap(name).bracket, "r1m0");
      assert.equal(match.status, "done");
      assert.equal(match.result.winner, "home", `${name}: o ausente venceu`);
    }
    assert.equal(rig.dev.A.duels.length, 1, "a partida que A ganhou foi remontada");
  } finally {
    await rig.close();
  }
});

test("t4: membro sem rede ~100 s (sinalização no ar) reivindica sozinho e se dá o W.O.; na volta o anfitrião, que seguiu com a sala, veta tarde e o resultado dele fica", async () => {
  const rig = roomRig({ seed: 5151 });
  try {
    await lobby(rig, "t4", 3, { fillWithCpu: true });
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => ["A", "B", "C"].every((name) => rig.dev[name].duels.length >= 1)));
    const mine = rig.snap("A").bracket.matches.find((match) => match.round === 1 && (match.home.entrantId === rig.dev.C.id || match.away.entrantId === rig.dev.C.id));
    assert.equal(mine.kind, "duel");
    assert.equal(nameOfId(rig, mine.home.entrantId === rig.dev.C.id ? mine.away.entrantId : mine.home.entrantId), "A", "nesta semente C joga contra o anfitrião");
    rig.isolate("C", true);
    await rig.runFor(98_000);
    // Queda silenciosa (o relay segue "aberto"): sem a prova de tráfego do relay, C ainda reivindica sozinho.
    assert.equal(rig.snap("C").hostId, rig.dev.C.id);
    const xDuel = rig.dev.C.duels.find((duel) => duel.bracketId === mine.id);
    const aDuel = rig.dev.A.duels.find((duel) => duel.bracketId === mine.id);
    aDuel.walkover(aDuel.side);
    xDuel.walkover(xDuel.side);
    await rig.runFor(5000);
    const winnerOf = (name) => {
      const match = matchById(rig.snap(name).bracket, mine.id);
      return match.status === "done" ? nameOfId(rig, match.result.winner === "home" ? match.home.entrantId : match.away.entrantId) : null;
    };
    assert.equal(winnerOf("A"), "A");
    assert.equal(winnerOf("C"), "C");
    rig.isolate("C", false);
    await rig.runFor(40_000);
    assert.deepEqual(rig.hosts(), ["A"]);
    assert.ok(rig.converged(["A", "B", "C"]), ["A", "B", "C"].map((name) => `${name}:${rig.snap(name).epoch}|${nameOfId(rig, rig.snap(name).hostId)}`).join(" "));
    for (const name of ["A", "B", "C"]) assert.equal(winnerOf(name), "A", `${name}: o resultado de quem ficou sem rede venceu`);
  } finally {
    await rig.close();
  }
});

test("queda silenciosa (relay aberto e calado ~100 s): o isolado não se faz anfitrião sozinho, no X1 nem no t4; na volta segue a sala e o W.O. do anfitrião", async () => {
  for (const [format, humans, seed, isolated] of [["x1", 2, 4242, "B"], ["t4", 3, 5151, "C"]]) {
    const rig = roomRig({ seed });
    try {
      await lobby(rig, format, humans, { fillWithCpu: true });
      rig.dev.A.client.hostStart();
      const names = NAMES.slice(0, humans);
      assert.ok(await rig.until(() => names.every((name) => rig.dev[name].duels.length >= 1)));
      const X = rig.dev[isolated];
      const mine = rig.snap("A").bracket.matches.find((match) => match.round === 1 && (match.home.entrantId === X.id || match.away.entrantId === X.id));
      assert.equal(nameOfId(rig, mine.home.entrantId === X.id ? mine.away.entrantId : mine.home.entrantId), "A", `${format}: ${isolated} joga contra o anfitrião`);
      rig.isolate(isolated, true);
      rig.hub.signaling(isolated, "silent");
      let claimedAt = null;
      const cut = rig.hub.now();
      while (rig.hub.now() - cut < 98_000) {
        await rig.step();
        if (claimedAt === null && rig.snap(isolated).hostId === X.id) claimedAt = rig.hub.now() - cut;
      }
      assert.equal(claimedAt, null, `${format}: ${isolated} se fez anfitrião em ${claimedAt} ms`);
      assert.equal(rig.snap(isolated).epoch, 0);
      // Só o anfitrião (na rede) dá o W.O.; o pedido do isolado vai para o anfitrião e espera.
      const aDuel = rig.dev.A.duels.find((duel) => duel.bracketId === mine.id);
      const xDuel = X.duels.find((duel) => duel.bracketId === mine.id);
      aDuel.walkover(aDuel.side);
      xDuel.walkover(xDuel.side);
      await rig.runFor(5000);
      const winnerOf = (name) => {
        const match = matchById(rig.snap(name).bracket, mine.id);
        return match.status === "done" ? nameOfId(rig, match.result.winner === "home" ? match.home.entrantId : match.away.entrantId) : null;
      };
      assert.equal(winnerOf("A"), "A");
      assert.equal(winnerOf(isolated), null, `${format}: o isolado não fecha a partida sozinho`);
      rig.hub.signaling(isolated, true);
      rig.isolate(isolated, false);
      await rig.runFor(40_000);
      assert.deepEqual(rig.hosts(), ["A"]);
      assert.ok(rig.converged(names), names.map((name) => `${name}:${rig.snap(name).epoch}|${nameOfId(rig, rig.snap(name).hostId)}`).join(" "));
      for (const name of names) assert.equal(winnerOf(name), "A", `${format}/${name}`);
    } finally {
      await rig.close();
    }
  }
});

test("maioria pelos que eu ouço: jogadores em segundo plano contam (os ligados assumem); os que somem junto com o anfitrião deixam os ligados assumirem depois de 1 min", async () => {
  const bg = roomRig({ seed: 778 });
  try {
    await lobby(bg, "t8", 5, { fillWithCpu: true });
    bg.dev.A.client.hostStart();
    await bg.runFor(3000);
    for (const name of ["C", "D"]) bg.dev[name].client.simulateBackground(900_000);
    await bg.runFor(60_000);
    await bg.kill("A");
    assert.ok(await bg.until(() => ["B", "C", "D", "E"].every((name) => bg.snap(name).hostId === bg.dev.B.id && bg.snap(name).epoch === 1), 40_000), "ninguém assumiu com dois jogadores em segundo plano");
    assert.deepEqual(bg.hosts(), ["B"]);
  } finally {
    await bg.close();
  }
  const gone = roomRig({ seed: 777 });
  try {
    await lobby(gone, "t8", 5, { fillWithCpu: true });
    gone.dev.A.client.hostStart();
    await gone.runFor(3000);
    const killedAt = gone.hub.now();
    for (const name of ["A", "C", "D"]) await gone.kill(name);
    assert.ok(await gone.until(() => ["B", "E"].every((name) => gone.snap(name).hostId === gone.dev.B.id && gone.snap(name).epoch === 1), 120_000), "os dois ligados nunca assumiram");
    assert.ok(gone.hub.now() - killedAt >= 55_000, `assumiram em ${gone.hub.now() - killedAt} ms (sem esperar os que sumiram)`);
    assert.deepEqual(gone.hosts(), ["B"]);
  } finally {
    await gone.close();
  }
});

test("membro fora de duas trocas de anfitrião volta à linhagem certa: o mesmo anfitrião que reassumiu, ou um terceiro com o velho ainda ouvido", async () => {
  // Fora de 0|A → 1|B → 2|A (A reassume): os room:snap do próprio anfitrião valem aos saltos.
  const same = roomRig({ seed: 3131 });
  try {
    await lobby(same, "t4", 4, { fillWithCpu: true });
    same.dev.A.client.hostStart();
    await same.runFor(3000);
    same.isolate("D", true);
    same.isolate("A", true);
    for (const name of ["B", "C"]) same.hub.partition(name, "D", true);
    assert.ok(await same.until(() => same.snap("B").epoch === 1 && same.snap("C").epoch === 1, 40_000));
    await same.runFor(20_000);
    same.isolate("A", false);
    same.hub.partition("A", "D", true);
    await same.runFor(4000);
    await same.kill("B");
    assert.ok(await same.until(() => same.snap("A").epoch === 2 && same.snap("A").hostId === same.dev.A.id, 60_000));
    same.isolate("D", false);
    assert.ok(await same.until(() => same.snap("D").epoch === 2 && same.snap("D").hostId === same.dev.A.id, 30_000), `D: ${same.snap("D").epoch}|${nameOfId(same, same.snap("D").hostId)}`);
  } finally {
    await same.close();
  }
  // Fora de 0|A → 1|B → 2|C, com A (membro de 2|C) ouvido: a sondagem de A fica sem resposta e a linhagem de C vale.
  const third = roomRig({ seed: 3132 });
  try {
    await lobby(third, "t4", 4, { fillWithCpu: true });
    third.dev.A.client.hostStart();
    await third.runFor(3000);
    third.isolate("D", true);
    third.isolate("A", true);
    for (const name of ["B", "C"]) third.hub.partition(name, "D", true);
    assert.ok(await third.until(() => third.snap("B").epoch === 1 && third.snap("C").epoch === 1, 40_000));
    await third.runFor(8000);
    third.isolate("A", false);
    third.hub.partition("A", "D", true);
    await third.runFor(4000);
    // A em segundo plano quando B fecha o app: quem assume é C.
    third.dev.A.client.simulateBackground(16_000);
    await third.runFor(500);
    await third.kill("B");
    assert.ok(await third.until(() => third.snap("C").epoch === 2 && third.snap("C").hostId === third.dev.C.id, 60_000), "C não assumiu");
    assert.ok(await third.until(() => !third.dev.A.client.hidden, 30_000));
    await third.runFor(2000);
    third.isolate("D", false);
    await third.runFor(2000);
    assert.equal(third.dev.D.client.session.health(third.dev.A.id), "ok", "D não ouve A (o cenário mudou)");
    assert.ok(await third.until(() => third.snap("D").epoch === 2 && third.snap("D").hostId === third.dev.C.id, 30_000), `D: ${third.snap("D").epoch}|${nameOfId(third, third.snap("D").hostId)}`);
    assert.ok(third.converged(["A", "C", "D"]));
  } finally {
    await third.close();
  }
});

test("X1: 'Voltar à sala' antes do registro: o relatório que chega logo entra na série; o que não chega é largado com sorteio novo (o jogo seguinte nunca repete o id)", async () => {
  for (const delayMs of [1000, 6000]) {
    const rig = roomRig({ seed: 6262 });
    try {
      await lobby(rig, "x1", 2);
      rig.dev.A.client.hostStart();
      assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
      rig.dev.A.duels[0].finish("user");
      assert.ok(await rig.until(() => matchById(rig.snap("B").bracket, "r1m0").status === "done"));
      rig.dev.A.client.wantRematch(true);
      rig.dev.B.client.wantRematch(true);
      assert.ok(await rig.until(() => rig.dev.A.duels.length === 2 && rig.dev.B.duels.length === 2));
      const g2 = rig.dev.A.duels[1];
      assert.equal(g2.role, "follower");
      const seed = rig.snap("A").seed;
      // B (autoridade) termina; o relatório se atrasa e o anfitrião A toca "Voltar à sala" antes.
      rig.hub.partition("A", "B", true);
      rig.dev.B.duels[1].finish("user");
      rig.dev.A.client.backToLobby();
      await rig.runFor(delayMs);
      rig.hub.partition("A", "B", false);
      assert.ok(await rig.until(() => rig.snap("A").stage === "lobby" && rig.snap("B").stage === "lobby", 20_000));
      const series = rig.snap("A").series;
      if (delayMs < 3000) {
        assert.deepEqual(series, { home: 1, away: 1 }, "o relatório que chegou na espera ficou fora da série");
        assert.equal(rig.snap("A").seed, seed);
      } else {
        assert.deepEqual(series, { home: 1, away: 0 });
        assert.notEqual(rig.snap("A").seed, seed, "jogo largado sem sorteio novo");
      }
      await rig.runFor(2000);
      rig.dev.B.client.setReady(true);
      assert.ok(await rig.until(() => rig.snap("A").members.every((member) => member.ready)));
      assert.deepEqual(rig.dev.A.client.hostStart(), { ok: true });
      assert.ok(await rig.until(() => rig.dev.A.duels.length === 3 && rig.dev.B.duels.length === 3, 10_000), `duelos A ${rig.dev.A.duels.length} B ${rig.dev.B.duels.length}`);
      const g3 = rig.dev.A.duels[2];
      assert.notEqual(g3.matchId, g2.matchId, "o jogo 3 repetiu o id do jogo 2");
      assert.ok(!g3.disposed && !rig.dev.B.duels[2].disposed);
      assert.equal(rig.state("A").duel?.matchId, g3.matchId);
    } finally {
      await rig.close();
    }
  }
});

test("espectador que saiu da lista (2 min sem sinal) volta com a mesma página: é readmitido e acompanha a sala", async () => {
  const rig = roomRig({ seed: 9090 });
  try {
    await lobby(rig, "t4", 2, { fillWithCpu: true });
    await rig.join("E", { asSpectator: true });
    await rig.runFor(3000);
    rig.isolate("E", true);
    await rig.runFor(150_000);
    assert.ok(!rig.snap("A").members.some((member) => member.playerId === rig.dev.E.id), "o espectador sumido ficou na lista");
    rig.isolate("E", false);
    await rig.runFor(10_000);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.snap("E").stage === "running" && rig.snap("E").version === rig.snap("A").version, 30_000), `E: ${rig.snap("E").stage} v${rig.snap("E").version} × A v${rig.snap("A").version}`);
    assert.ok(rig.snap("A").members.some((member) => member.playerId === rig.dev.E.id && member.role === "spectator"));
    assert.equal(rig.state("E").phase, "in-room");
  } finally {
    await rig.close();
  }
});

test("W.O. de travamento: autoridade presente travada no meio da jogada (nunca chega ao descanso n) vale; em segundo plano, não", async () => {
  const rig = roomRig({ seed: 1215 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    const [a, b] = [rig.dev.A.duels[0], rig.dev.B.duels[0]];
    // O driver da autoridade parou ao repassar a jogada n-1 (restN < n) e a página segue viva.
    a.progress = { matchId: a.matchId, n: 7, restN: 6, h: "x", se: 0, opened: 6, own: null };
    await rig.runFor(5000);
    b.walkover("cpu", "stall");
    assert.ok(await rig.until(() => b.rejected === 1, 3000), "travamento de 5 s aceito");
    // Em segundo plano a reserva dela é que corre: o mesmo pedido depois da janela é recusado.
    rig.dev.A.client.simulateBackground(20_000);
    await rig.runFor((T.AUTHORITY_STALL_S + 2) * 1000);
    b.walkover("cpu", "stall");
    await rig.runFor(3000);
    assert.equal(matchOf(rig, "A", a).status, "playing", "W.O. de travamento contra a autoridade em segundo plano");
    // De volta e ainda travada: depois da janela inteira, vale.
    assert.ok(await rig.until(() => !rig.dev.A.client.hidden, 20_000));
    await rig.runFor((T.AUTHORITY_STALL_S + 1) * 1000);
    b.walkover("cpu", "stall");
    assert.ok(await rig.until(() => matchOf(rig, "A", a).status === "done", 3000), "o travamento no meio da jogada nunca fechou");
    assert.equal(matchOf(rig, "A", a).result.winner, "away");
  } finally {
    await rig.close();
  }
});

test("boas-vindas só com os times que a sala usa: com 70 times velhos na memória do anfitrião, o espectador novo recebe os da chave", async () => {
  const rig = roomRig({ seed: 6464 });
  try {
    await lobby(rig, "t8", 2, { fillWithCpu: true });
    const host = rig.dev.A.client;
    const old = {};
    for (let index = 0; index < 70; index += 1) {
      const team = randomBobTeam(90_000 + index, { id: `bob-old${String(index).padStart(7, "0")}`.slice(0, 14), now: 1 });
      old[teamHash(team)] = team;
    }
    host.teams = { ...host.teams, ...old };
    host.hostStart();
    await rig.runFor(3000);
    const entrants = rig.snap("A").bracket.entrants.map((entrant) => entrant.teamHash);
    await rig.join("E", { asSpectator: true });
    await rig.runFor(5000);
    const teams = rig.state("E").teams;
    assert.deepEqual(entrants.filter((hash) => !teams[hash]), [], "faltam times da chave");
    assert.ok(Object.keys(teams).length <= 12, `${Object.keys(teams).length} times nas boas-vindas`);
  } finally {
    await rig.close();
  }
});

test("autoridade sem checkpoint: `resuming` só quando a partida já corria (largada nova e seguidor nunca)", async () => {
  const rig = roomRig({ seed: 1216 });
  try {
    await lobby(rig, "x1", 2);
    rig.dev.A.client.hostStart();
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 1 && rig.dev.B.duels.length === 1));
    assert.equal(rig.dev.A.duels[0].args.resuming, false);
    assert.equal(rig.dev.B.duels[0].args.resuming, false);
    await rig.runFor(25_000);
    await rig.dev.A.client.close();
    await rig.runFor(1500);
    await rig.resume("A");
    assert.ok(await rig.until(() => rig.dev.A.duels.length === 2, 20_000));
    assert.equal(rig.dev.A.duels[1].role, "authority");
    assert.equal(rig.dev.A.duels[1].args.restore ?? null, null);
    assert.equal(rig.dev.A.duels[1].args.resuming, true);
  } finally {
    await rig.close();
  }
});

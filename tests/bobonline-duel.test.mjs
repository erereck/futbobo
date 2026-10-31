// Partida online do Bobonline (B2, §5 e §11.1): DuelController + OnlineMatchDriver reais sobre a
// sessão real e o transporte em memória, com relógio virtual. Sem rede e sem timers de verdade:
// tudo anda por `hub.advance(ms)`. O cenário de deriva entre motores (2) roda o seguidor num
// Worker (tests/helpers/duel-follower-worker.mjs) com o Math perturbado em um ulp.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stubBrowser } from "./helpers/ts-loader.mjs";
import { clone, createDuelRig, SHORT } from "./helpers/duel-follower-worker.mjs";
import { loadTs } from "./helpers/ts-loader.mjs";

stubBrowser();

const M = loadTs("app/botao/match-codec.ts");
const E = loadTs("app/botao/engine.ts");
const { ONLINE_TIMING } = loadTs("app/botao/online-timing.ts");
const { T } = loadTs("app/bobonline/protocol.ts");
const { matchCoin } = loadTs("app/bobonline/match/duel-controller.ts");

const FAST = process.env.BOB_DUEL_FAST === "1";
/** Partidas determinísticas (sem pensar devagar): dá para comparar com uma rodada de controle. */
const STEADY = { slowChance: 0 };

/** O que importa no resultado (sem os quadros do replay, que guardam posições de desenho). */
function core(result) {
  if (!result) return null;
  const { replays, ...rest } = clone(result);
  void replays;
  return rest;
}

function assertSameEnd(rig, label) {
  const a = rig.dev.A;
  const b = rig.view("B");
  assert.equal(M.hashMatch(a.state), b.hash, `${label}: estado final diferente`);
  assert.deepEqual(core(a.driver.finished()), core(b.finished), `${label}: resultado diferente`);
}

/** Rodada de controle sem incidentes: o resultado que a mesma sequência de toques dá. */
async function control(options) {
  const rig = await createDuelRig(options);
  assert.ok(await rig.play({ limitMs: 600_000 }), `controle não terminou (${rig.describe()})`);
  const result = { hash: M.hashMatch(rig.dev.A.state), result: core(rig.dev.A.driver.finished()), actions: rig.dev.A.submitted.length + rig.dev.B.submitted.length };
  rig.close();
  return result;
}

const inboxKinds = (dev, kind) => dev.inbox.filter((entry) => entry.kind === kind);

// ---------------------------------------------------------------------------
// (1) 100 partidas com latência aleatória
// ---------------------------------------------------------------------------

test("(1) 100 partidas com latência aleatória terminam com o mesmo resultado nos dois aparelhos", async () => {
  const total = FAST ? 6 : 100;
  const coverage = { goals: 0, shootout: 0, idle: 0, pmiss: 0, syncs: 0 };
  for (let index = 0; index < total; index += 1) {
    const rig = await createDuelRig({ seed: 5000 + index, latency: () => 20 + (index % 7) * 30, jitter: index % 3 === 0 ? 40 : 0 });
    const done = await rig.play({ limitMs: 400_000 });
    assert.ok(done, `partida ${index} não terminou (${rig.describe()})`);
    assertSameEnd(rig, `partida ${index}`);
    const a = rig.dev.A;
    const b = rig.dev.B;
    assert.equal(a.outcomes.length, 1, `partida ${index}: autoridade relatou ${a.outcomes.length} vezes`);
    assert.equal(b.outcomes.length, 1, `partida ${index}: seguidor relatou ${b.outcomes.length} vezes`);
    assert.equal(a.outcomes[0].kind, "result");
    assert.deepEqual(core(a.outcomes[0].result), core(b.outcomes[0].result));
    coverage.goals += a.state.timeline.filter((entry) => entry.kind === "goal" || entry.kind === "own-goal").length;
    if (a.state.result.decision === "penalties") coverage.shootout += 1;
    coverage.idle += rig.actions().filter((action) => action.kind === "idle").length;
    coverage.pmiss += rig.actions().filter((action) => action.kind === "pmiss").length;
    coverage.syncs += rig.directives("B").length;
    rig.close();
  }
  if (!FAST) {
    assert.ok(coverage.goals > 20 && coverage.shootout > 0 && coverage.idle > 0 && coverage.pmiss > 0, JSON.stringify(coverage));
  }
  assert.equal(coverage.syncs, 0, `sincronia sem motivo: ${JSON.stringify(coverage)}`);
});

// ---------------------------------------------------------------------------
// (2) Deriva entre motores (seguidor num Worker com Math desviado)
// ---------------------------------------------------------------------------

test("(2) deriva entre motores: o seguidor (Worker, Math±1ulp) detecta nos descansos, adota em silêncio e termina igual", async () => {
  const total = FAST ? 1 : 3;
  let adoptions = 0;
  for (let index = 0; index < total; index += 1) {
    const rig = await createDuelRig({ seed: 7100 + index, followerInWorker: true, latency: () => 40 });
    try {
      assert.ok(await rig.play({ limitMs: 400_000 }), `partida ${index} não terminou (${rig.describe()})`);
      const a = rig.dev.A;
      const b = rig.view("B");
      assert.equal(b.outcomes.length, 1);
      assert.equal(b.outcomes[0].kind, "result");
      assert.deepEqual(core(b.outcomes[0].result), core(a.outcomes[0].result), "o seguidor relatou outro resultado");
      assert.deepEqual(core(b.finished), core(a.driver.finished()));
      const hash = b.directives.filter((directive) => directive.reason === "hash");
      adoptions += hash.length;
      // Silenciosa: no descanso adotado o momento do jogo era o mesmo (só os números finos mudaram).
      for (const directive of hash) assert.equal(directive.localKey, directive.theirKey, `adoção ruidosa em n=${directive.n}`);
    } finally {
      rig.close();
    }
  }
  assert.ok(adoptions > 0, "o Math desviado não gerou nenhuma diferença de hash");
});

// ---------------------------------------------------------------------------
// (3)-(5) Morte e recarga com checkpoint
// ---------------------------------------------------------------------------

test("(3) seguidor morto no meio da jogada volta do checkpoint 5 s depois e termina igual à rodada de controle", async () => {
  const options = { seed: 7301, ...STEADY };
  const expected = await control(options);
  const rig = await createDuelRig(options);
  try {
    assert.ok(await rig.until(() => rig.dev.B.driver.n >= 4 && rig.dev.B.state.phase === "resolving"), "nunca rolou");
    rig.kill("B");
    await rig.runFor(5000);
    const b = await rig.reload("B");
    assert.ok(b.launch.restore, "sem checkpoint para restaurar");
    assert.ok(await rig.play({ limitMs: 600_000 }), `não terminou (${rig.describe()})`);
    assertSameEnd(rig, "seguidor recarregado");
    assert.equal(M.hashMatch(rig.dev.A.state), expected.hash, "o resultado mudou por causa da recarga");
    assert.deepEqual(core(rig.dev.A.driver.finished()), expected.result);
    // Cada ação no log uma vez só.
    const ns = rig.dev.A.submitted.map((action) => action.n).concat(rig.dev.B.submitted.map((action) => action.n));
    assert.equal(new Set(ns).size, ns.length, "ação escrita duas vezes");
  } finally {
    rig.close();
  }
});

test("(3b) recarregar no meio da própria vez traz os timers do checkpoint, não os do descanso", async () => {
  const rig = await createDuelRig({ seed: 7302, ...STEADY, extra: { userIsHost: false } });
  try {
    rig.script("B", (n) => (n === 2 ? { think: 5 } : null));
    assert.ok(await rig.until(() => rig.dev.B.driver.n === 2 && rig.dev.B.driver.localTurn() === "cpu" && (rig.players.B.plans.get(2)?.waited ?? 0) >= 3.2));
    const clockBefore = rig.dev.B.state.clock;
    rig.kill("B");
    await rig.runFor(2000);
    const b = await rig.reload("B");
    const timers = b.launch.restore?.timers;
    assert.ok(timers && timers.turnN === 2, `checkpoint sem timers da vez: ${JSON.stringify(timers)}`);
    assert.ok(timers.idleLeft <= 7 - 2.2, `idleLeft do checkpoint ${timers.idleLeft}`);
    assert.ok(timers.ownerClock <= clockBefore + 1.01, "o relógio do dono voltou mais de 1 s");
    assert.ok(await rig.until(() => b.controller.localProgress()?.own !== null && b.controller.localProgress()?.own !== undefined && b.driver.localTurn() === "cpu"));
    const own = b.controller.localProgress().own;
    assert.ok(own.idleLeft <= Math.max(timers.idleLeft, T.RESUME_TIMER_FLOOR_S) + 0.05, `7 s recomprados: ${own.idleLeft}`);
    assert.ok(b.state.clock <= timers.ownerClock + 1e-9, "relógio do descanso em vez do do dono");
    assert.ok(await rig.play({ limitMs: 600_000 }));
    assertSameEnd(rig, "dono recarregado");
  } finally {
    rig.close();
  }
});

test("(4) autoridade morta no meio de uma vez volta do checkpoint e termina igual à rodada de controle", async () => {
  const options = { seed: 7401, ...STEADY };
  const expected = await control(options);
  const rig = await createDuelRig(options);
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 5 && rig.dev.A.driver.remoteTurn() === "cpu"), "a vez do seguidor nunca abriu");
    rig.kill("A");
    await rig.runFor(5000);
    const a = await rig.reload("A");
    assert.ok(a.launch.restore, "sem checkpoint");
    assert.ok(await rig.play({ limitMs: 600_000 }), `não terminou (${rig.describe()})`);
    assertSameEnd(rig, "autoridade recarregada");
    assert.equal(M.hashMatch(rig.dev.A.state), expected.hash);
    assert.deepEqual(core(rig.dev.A.driver.finished()), expected.result);
  } finally {
    rig.close();
  }
});

test("(5) os dois morrem e os dois voltam dos checkpoints: mesma partida", async () => {
  const options = { seed: 7501, ...STEADY };
  const expected = await control(options);
  const rig = await createDuelRig(options);
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 6 && rig.dev.A.state.phase === "resolving"));
    rig.kill("A");
    rig.kill("B");
    await rig.runFor(4000);
    await rig.reload("A");
    await rig.reload("B");
    assert.ok(await rig.play({ limitMs: 600_000 }), `não terminou (${rig.describe()})`);
    assertSameEnd(rig, "os dois recarregados");
    assert.equal(M.hashMatch(rig.dev.A.state), expected.hash);
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (6) Autoridade sem checkpoint no turno 40
// ---------------------------------------------------------------------------

test("(6) autoridade volta SEM checkpoint no turno 40: m:sync-req lost → m:sync-up → segue", async () => {
  const rules = { ...SHORT, goalLimit: 9, halfSeconds: 120, halves: 2 };
  const rig = await createDuelRig({ seed: 7601, rules, ...STEADY });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 40 && rig.dev.A.driver.remoteTurn() === "cpu", 600_000), `não chegou ao turno 40 (${rig.describe()})`);
    rig.kill("A");
    await rig.runFor(3000);
    const a = await rig.reload("A", { checkpoint: false });
    assert.equal(a.launch.restore, undefined);
    assert.ok(await rig.until(() => a.directives.some((directive) => directive.reason === "lost"), 60_000), "a autoridade nunca recuperou o passado");
    assert.ok(inboxKinds(rig.dev.B, "m:sync-req").length > 0, "o seguidor não recebeu o pedido lost");
    assert.ok(inboxKinds(a, "m:sync-up").length > 0, "a autoridade não recebeu m:sync-up");
    assert.ok(a.driver.n >= 40);
    assert.ok(await rig.play({ limitMs: 900_000 }), `não terminou (${rig.describe()})`);
    assertSameEnd(rig, "autoridade sem checkpoint");
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (7) Mesmo n, hash diferente
// ---------------------------------------------------------------------------

test("(7) mesmo n e hash diferente (checkpoint não adotado): m:sync antes do m:resume", async () => {
  const rig = await createDuelRig({ seed: 7701, ...STEADY });
  try {
    // Na vez do seguidor: a autoridade não tem descanso novo para mandar, o hash diferente só aparece no aperto de mão.
    rig.script("B", (n) => (n >= 3 ? { think: 4 } : null));
    assert.ok(await rig.until(() => rig.dev.B.driver.n >= 3 && rig.dev.B.driver.localTurn() === "cpu"));
    rig.kill("B");
    // O checkpoint do seguidor guardou um estado que nunca foi adotado (deriva): um botão fora do lugar.
    const store = rig.dev.B.store;
    const cp = store.load(rig.setup.matchId);
    const disc = cp.match.bodies.find((body) => body.kind === "disc");
    disc.x += 0.25;
    store.save(cp);
    await rig.runFor(2000);
    const b = await rig.reload("B");
    const before = b.inbox.length;
    assert.ok(await rig.until(() => inboxKinds(b, "m:resume").length > 0, 60_000), "sem m:resume");
    const kinds = b.inbox.slice(before).map((entry) => entry.kind);
    const sync = kinds.indexOf("m:sync");
    assert.ok(sync >= 0 && sync < kinds.indexOf("m:resume"), `ordem errada: ${kinds.filter((kind) => kind.startsWith("m:")).join(",")}`);
    assert.ok(b.directives.some((directive) => directive.reason === "hash"), "a diferença não foi tratada como hash");
    assert.ok(await rig.play({ limitMs: 600_000 }));
    assertSameEnd(rig, "depois do m:sync");
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (8) Partição longa: W.O. para quem está presente; quem está sem rede nunca dá W.O. no outro
// ---------------------------------------------------------------------------

test("(8) internet do convidado cai por mais de 90 s: W.O. para a autoridade; o convidado sem rede nunca dá W.O.", async () => {
  const rig = await createDuelRig({ seed: 7801, ...STEADY });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 3));
    rig.network("B", false);
    assert.ok(await rig.until(() => rig.dev.A.outcomes.length > 0 && rig.dev.B.outcomes.length > 0, 200_000), rig.describe());
    assert.deepEqual(rig.dev.A.outcomes.map(({ kind, winner, reason }) => ({ kind, winner, reason })), [{ kind: "walkover", winner: "user", reason: "timeout" }]);
    // O convidado viu a própria reserva acabar: derrota, nunca vitória.
    assert.deepEqual(rig.dev.B.outcomes.map(({ kind, winner, reason }) => ({ kind, winner, reason })), [{ kind: "walkover", winner: "user", reason: "timeout" }]);
    assert.equal(rig.dev.B.controller.lostByTimeout(), true);
    assert.match(rig.dev.B.controller.status().banner?.text ?? "", /Você não voltou a tempo/);
  } finally {
    rig.close();
  }
});

test("(8b) anfitrião do X1 (autoridade) sem internet: o convidado vence; a autoridade não relata vitória", async () => {
  const rig = await createDuelRig({ seed: 7802, ...STEADY });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 3));
    rig.network("A", false);
    await rig.runFor(20_000);
    assert.match(rig.dev.A.controller.status().banner?.text ?? "", /^Sem conexão\. Reconectando… · você ainda tem 1:[0-9]{2}$/);
    assert.match(rig.dev.B.controller.status().banner?.text ?? "", /^Rei do Peteleco caiu\. Esperando voltar · 1:[0-9]{2}$/);
    assert.ok(await rig.until(() => rig.dev.A.outcomes.length > 0 && rig.dev.B.outcomes.length > 0, 200_000), rig.describe());
    assert.deepEqual(rig.dev.B.outcomes.map(({ winner, reason }) => ({ winner, reason })), [{ winner: "cpu", reason: "timeout" }]);
    assert.deepEqual(rig.dev.A.outcomes.map(({ winner, reason }) => ({ winner, reason })), [{ winner: "cpu", reason: "timeout" }]);
    assert.equal(rig.dev.A.controller.lostByTimeout(), true);
  } finally {
    rig.close();
  }
});

test("(8c) queda curta de rede da autoridade: congela, volta com aviso de quanto ficou fora e a partida termina igual", async () => {
  const rig = await createDuelRig({ seed: 7803, ...STEADY });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 3));
    rig.network("A", false);
    await rig.runFor(25_000);
    assert.equal(rig.dev.A.controller.status().frozen, true);
    assert.equal(rig.dev.B.controller.status().frozen, true);
    const poolA = rig.dev.B.controller.poolOf(rig.sides.user);
    assert.ok(poolA < 85 && poolA > 60, `reserva de A no seguidor: ${poolA}`);
    rig.network("A", true);
    assert.ok(await rig.until(() => rig.dev.A.controller.status().notice !== null, 20_000), "sem aviso da volta");
    assert.match(rig.dev.A.controller.status().notice.text, /^Você ficou fora 0:2[0-9] · ainda tem 1:[0-9]{2} nesta partida$/);
    assert.ok(await rig.until(() => !rig.dev.A.controller.status().frozen && !rig.dev.B.controller.status().frozen, 30_000), rig.describe());
    assert.ok(await rig.play({ limitMs: 600_000 }), rig.describe());
    assertSameEnd(rig, "depois da queda curta");
    assert.equal(rig.dev.A.outcomes[0].kind, "result");
  } finally {
    rig.close();
  }
});

test("(8d) queda silenciosa da autoridade (o socket do relay segue aberto, nada chega): ela não se dá o W.O.; o convidado vence", async () => {
  const rig = await createDuelRig({ seed: 7804, ...STEADY });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 3));
    // O roteador de A perdeu a internet: links cortados, sinalização "no ar" para o socket, calada de verdade.
    rig.hub.signaling("A", "silent");
    for (const other of rig.participants) if (other !== "A") rig.hub.partition("A", other, true);
    await rig.runFor(25_000);
    assert.match(rig.dev.A.controller.status().banner?.text ?? "", /^Sem conexão\. Reconectando… · você ainda tem 1:[0-9]{2}$/);
    assert.ok(await rig.until(() => rig.dev.A.outcomes.length > 0 && rig.dev.B.outcomes.length > 0, 200_000), rig.describe());
    assert.deepEqual(rig.dev.B.outcomes.map(({ winner, reason }) => ({ winner, reason })), [{ winner: "cpu", reason: "timeout" }]);
    assert.deepEqual(rig.dev.A.outcomes.map(({ winner, reason }) => ({ winner, reason })), [{ winner: "cpu", reason: "timeout" }], "a autoridade calada se deu o W.O.");
    assert.equal(rig.dev.A.controller.lostByTimeout(), true);
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (9) Seguidor escondido
// ---------------------------------------------------------------------------

test("(9) seguidor com o app em segundo plano: congela, a reserva dele corre, nenhuma reivindicação", async () => {
  const rig = await createDuelRig({ seed: 7901, ...STEADY, extra: { userIsHost: false } });
  try {
    // Esconde no começo da vez do seguidor.
    assert.ok(await rig.until(() => rig.dev.B.driver.localTurn() === "cpu" && rig.dev.B.driver.n >= 2));
    const n = rig.dev.B.driver.n;
    rig.hide("B");
    await rig.runFor(20_000);
    const a = rig.dev.A;
    assert.equal(a.session.health(rig.sides.cpu), "away", "hb com vis bg não segurou o away");
    assert.equal(a.controller.status().frozen, true);
    assert.match(a.controller.status().banner?.text ?? "", /^Dona Bola saiu do app\. Esperando voltar · 1:1[0-9]$/);
    const pool = a.controller.poolOf(rig.sides.cpu);
    assert.ok(pool < 75 && pool > 65, `reserva ${pool}`);
    assert.equal(a.driver.n, n, "a autoridade escreveu algo na vez do seguidor escondido");
    rig.show("B");
    assert.ok(await rig.until(() => rig.dev.B.controller.status().notice !== null, 5000));
    assert.match(rig.dev.B.controller.status().notice.text, /^Você ficou fora 0:2[0-9] · ainda tem 1:[0-9]{2} nesta partida$/);
    assert.ok(await rig.play({ limitMs: 600_000 }), rig.describe());
    assertSameEnd(rig, "depois do segundo plano");
    assert.ok(!rig.actions().some((action) => action.n === n && action.kind === "idle" && action.side === "cpu" && rig.dev.A.submitted.includes(action)));
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (10) Autoridade travada
// ---------------------------------------------------------------------------

test("(10) autoridade travada (driver parado, heartbeats seguem): cutucão → auto-idle; com o controlador travado também → W.O. stall", async () => {
  const rig = await createDuelRig({ seed: 8001, ...STEADY });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.localTurn() === "user" && rig.dev.A.driver.n >= 2));
    const n = rig.dev.A.driver.n;
    rig.dev.A.paused = true; // o laço da autoridade parou (aba presa), a sessão continua
    assert.ok(await rig.until(() => inboxKinds(rig.dev.A, "m:nudge").length > 0, 30_000), "sem m:nudge");
    assert.ok(await rig.until(() => rig.dev.B.driver.n > n, 10_000), "o seguidor não recebeu o auto-idle");
    rig.dev.A.paused = false;
    assert.ok(await rig.until(() => rig.dev.A.driver.n > n, 5000), "a autoridade não aplicou o próprio idle da fila");
    assert.equal(rig.dev.A.state.penaltyReason ?? rig.dev.B.state.penaltyReason, "inactivity");
  } finally {
    rig.close();
  }
  const stuck = await createDuelRig({ seed: 8002, ...STEADY });
  try {
    assert.ok(await stuck.until(() => stuck.dev.A.driver.localTurn() === "user" && stuck.dev.A.driver.n >= 2));
    stuck.dev.A.paused = true;
    stuck.dev.A.dropIncoming = (kind) => kind === "m:nudge";
    await stuck.runFor(20_000);
    assert.match(stuck.dev.B.controller.status().banner?.text ?? "", /^Rei do Peteleco não está jogando · W\.O\. em 1:[0-9]{2}$/);
    assert.ok(await stuck.until(() => stuck.dev.B.outcomes.length > 0, 120_000), stuck.describe());
    assert.deepEqual(stuck.dev.B.outcomes.map(({ kind, winner, reason }) => ({ kind, winner, reason })), [{ kind: "walkover", winner: "cpu", reason: "stall" }]);
  } finally {
    stuck.close();
  }
});

// ---------------------------------------------------------------------------
// (11) Reivindicação só com prova
// ---------------------------------------------------------------------------

test("(11) toque legítimo do seguidor aos 6,8 s que chega aos 11,5 s: nenhuma reivindicação", async () => {
  const rig = await createDuelRig({ seed: 8101, ...STEADY, extra: { userIsHost: false } });
  try {
    rig.script("B", (n) => (n === 2 ? { think: 6.8 } : null));
    rig.dev.B.sendRule = (to, kind, body) => (kind === "m:act" && body.n === 2 ? { delayMs: 4700 } : null);
    assert.ok(await rig.until(() => rig.dev.A.driver.n > 2, 60_000), rig.describe());
    const written = rig.dev.A.inbox.filter((entry) => entry.kind === "m:act").length;
    assert.ok(written >= 1);
    const claim = rig.dev.A.controller.claims();
    assert.equal(claim.length, 0, "a autoridade reivindicou um toque legítimo atrasado");
    const shot = rig.dev.B.submitted.find((action) => action.n === 2);
    assert.equal(shot.kind, "shot");
    assert.ok(await rig.play({ limitMs: 600_000 }));
    assertSameEnd(rig, "toque atrasado");
  } finally {
    rig.close();
  }
});

test("(11b) seguidor que mostra 7 s esgotados e nunca escreve: reivindicação idle com a chave do kickoff", async () => {
  const kickoff = (state) => {
    state.phase = "kickoff";
    state.turn = "cpu";
    state.clockPausedForKickoff = true;
  };
  const rig = await createDuelRig({ seed: 8102, ...STEADY, extra: { userIsHost: false }, mutate: kickoff });
  try {
    const opened = [];
    const turnOpened = rig.dev.A.controller.turnOpened.bind(rig.dev.A.controller);
    rig.dev.A.controller.turnOpened = (n, side, clock, key) => {
      opened.push({ n, side, clock, key });
      turnOpened(n, side, clock, key);
    };
    // O seguidor trava na saída (n = 0, kickoff dele): o laço para antes dos 7 s, mas o hb mostra os 7 s esgotados.
    rig.script("B", (n) => (n === 0 ? { never: true } : null));
    rig.dev.B.progressRule = (p) => (p && p.n === 0 && p.own ? { ...p, own: { ...p.own, idleLeft: 0 } } : p);
    assert.ok(await rig.until(() => rig.dev.B.driver.localTurn() === "cpu", 20_000));
    await rig.runFor(3000);
    rig.dev.B.paused = true;
    assert.ok(await rig.until(() => rig.dev.A.controller.claims().length > 0, 30_000), "sem reivindicação");
    rig.dev.B.paused = false;
    assert.ok(await rig.until(() => rig.dev.B.driver.n >= 1 && rig.dev.A.driver.n >= 1, 60_000), rig.describe());
    const claims = rig.dev.A.controller.claims();
    assert.equal(claims.length, 1, "uma reivindicação");
    const turn = opened.find((entry) => entry.n === 0 && entry.side === "cpu");
    assert.equal(claims[0].kind, "idle");
    assert.equal(claims[0].k, turn.key);
    assert.match(claims[0].k, /\.kickoff\.cpu\./);
    assert.ok(await rig.play({ limitMs: 600_000 }));
    assertSameEnd(rig, "depois da reivindicação");
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (12) Bifurcação depois de uma reivindicação
// ---------------------------------------------------------------------------

test("(12) bifurcação: o seguidor sincroniza e a ação dele com se velho cai", async () => {
  const rig = await createDuelRig({ seed: 8201, ...STEADY, extra: { userIsHost: false } });
  try {
    // O hb do seguidor diz que os 7 s acabaram, mas o toque dele (aos 6,9 s) chega 7 s depois: a reivindicação ganha.
    rig.script("B", (n) => (n === 0 ? { think: 6.9 } : null));
    rig.dev.B.progressRule = (p) => (p && p.n <= 1 ? { ...p, n: 0, opened: 0, own: { idleLeft: 0, kickLeft: null } } : p);
    rig.dev.B.sendRule = (to, kind, body) => (kind === "m:act" && body.n === 0 ? { delayMs: 7000 } : null);
    assert.ok(await rig.until(() => rig.dev.A.controller.claims().length === 1, 60_000), "sem reivindicação");
    rig.dev.B.progressRule = null;
    assert.ok(await rig.until(() => rig.directives("B").some((directive) => directive.reason === "fork"), 30_000), "o seguidor não sincronizou");
    assert.ok(rig.dev.B.controller.syncEpoch() >= 1);
    // Uma ação velha (se 0) que ainda estava no caminho: a autoridade descarta.
    const stale = { kind: "shot", n: rig.dev.A.driver.n, k: "x", se: 0, side: "cpu", shot: { bodyId: "cpu-0", vx: 1, vy: 1 }, clock: 1, grace: false, matchId: rig.setup.matchId };
    rig.dev.A.controller.receive(rig.sides.cpu, "m:act", stale);
    assert.equal(rig.dev.A.controller.peek(stale.n), null, "ação de se velho entrou no log");
    assert.ok(await rig.play({ limitMs: 600_000 }));
    assertSameEnd(rig, "depois da bifurcação");
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (13) m:setup antes do snapshot e m:setup perdido
// ---------------------------------------------------------------------------

test("(13) m:setup antes do 'playing' fica guardado e a partida começa; m:setup perdido volta em 3 s", async () => {
  const rig = await createDuelRig({ seed: 8301, ...STEADY, lateFollower: true });
  try {
    await rig.runFor(1200);
    assert.ok(rig.dev.B.buffer.some((entry) => entry.kind === "m:setup"), "o m:setup não ficou guardado");
    rig.mount("B");
    assert.ok(await rig.play({ limitMs: 400_000 }), rig.describe());
    assertSameEnd(rig, "m:setup guardado");
  } finally {
    rig.close();
  }
  const lost = await createDuelRig({ seed: 8302, ...STEADY, lateAuthority: true });
  try {
    let dropped = 0;
    lost.dev.A.sendRule = (to, kind) => (kind === "m:setup" && dropped++ === 0 ? "drop" : null);
    const start = lost.hub.now();
    lost.mount("A");
    assert.ok(await lost.until(() => inboxKinds(lost.dev.B, "m:setup").length > 0, 10_000));
    const at = inboxKinds(lost.dev.B, "m:setup")[0].at - start;
    assert.ok(at >= T.SETUP_RESEND_MS && at < T.SETUP_RESEND_MS + 1000, `reenvio em ${at} ms`);
    assert.ok(await lost.play({ limitMs: 400_000 }), lost.describe());
    assertSameEnd(lost, "m:setup reenviado");
  } finally {
    lost.close();
  }
});

// ---------------------------------------------------------------------------
// (14)-(15) Pênaltis
// ---------------------------------------------------------------------------

const toPenalties = (state, E) => E.jumpToPenalties(state);

test("(14) a autoridade recarrega na escolha dos batedores: a ordem do seguidor sobrevive (checkpoint + hello)", async () => {
  const rig = await createDuelRig({ seed: 8401, ...STEADY, mutate: toPenalties });
  rig.players.B.noOrders = true;
  try {
    const chosen = [];
    const chooseOrder = rig.dev.B.driver.chooseOrder.bind(rig.dev.B.driver);
    rig.dev.B.driver.chooseOrder = (side, order) => {
      chosen.push(order.slice());
      chooseOrder(side, order);
    };
    // O seguidor escolhe uma ordem invertida logo; a autoridade fica pensando.
    assert.ok(await rig.until(() => rig.dev.B.state.phase === "penalty-setup" && rig.dev.B.controller.status().frozen === false, 20_000));
    const order = rig.dev.B.state.penalties.order.cpu.slice().reverse();
    rig.dev.B.driver.chooseOrder("cpu", order);
    assert.ok(await rig.until(() => inboxKinds(rig.dev.A, "m:order").length > 0, 5000));
    rig.kill("A");
    await rig.runFor(3000);
    const a = await rig.reload("A");
    assert.ok(a.launch.restore, "sem checkpoint");
    assert.deepEqual(a.store.load(rig.setup.matchId).orders.cpu, order, "a ordem não estava no checkpoint");
    assert.ok(await rig.until(() => rig.dev.A.state.phase === "penalties", 60_000), rig.describe());
    assert.deepEqual(rig.dev.A.state.penalties.order.cpu, order);
    assert.deepEqual(rig.dev.B.state.penalties.order.cpu, order);
    assert.ok(await rig.play({ limitMs: 400_000 }));
    assertSameEnd(rig, "ordens depois da recarga");
  } finally {
    rig.close();
  }
  // Sem checkpoint: a ordem volta pelo m:hello do seguidor.
  const bare = await createDuelRig({ seed: 8402, ...STEADY, mutate: toPenalties });
  bare.players.B.noOrders = true;
  try {
    assert.ok(await bare.until(() => bare.dev.B.state.phase === "penalty-setup" && bare.dev.B.controller.status().frozen === false, 20_000));
    const order = bare.dev.B.state.penalties.order.cpu.slice().reverse();
    bare.dev.B.driver.chooseOrder("cpu", order);
    assert.ok(await bare.until(() => inboxKinds(bare.dev.A, "m:order").length > 0, 5000));
    bare.kill("A");
    await bare.runFor(3000);
    await bare.reload("A", { checkpoint: false });
    assert.ok(await bare.until(() => bare.dev.A.state.phase === "penalties", 60_000), bare.describe());
    assert.deepEqual(bare.dev.A.state.penalties.order.cpu, order);
  } finally {
    bare.close();
  }
});

test("(15) pmiss e recarga durante a pausa dele: sem cobrança duplicada, mesma sequência de batedores", async () => {
  const options = { seed: 8501, ...STEADY, mutate: toPenalties };
  const script = (n, dev) => (dev.state.phase === "penalties" && dev.state.penalties.turn === "cpu" && dev.state.penalties.results.cpu.length === 0 ? { think: 11 } : null);
  const reference = await createDuelRig(options);
  reference.script("B", script);
  assert.ok(await reference.play({ limitMs: 400_000 }));
  const kickers = (dev) => dev.applied.filter((action) => action.kind === "pshot" || action.kind === "pmiss")
    .map((action) => (action.kind === "pshot" ? `${action.side}:${action.shot.bodyId}` : `${action.side}:perdida`));
  const expected = kickers(reference.dev.A);
  reference.close();

  const rig = await createDuelRig(options);
  try {
    rig.script("B", script);
    assert.ok(await rig.until(() => rig.dev.B.submitted.some((action) => action.kind === "pmiss"), 60_000), "sem pmiss");
    await rig.runFor(400); // dentro da pausa de 1,6 s
    rig.kill("B");
    await rig.runFor(2500);
    await rig.reload("B");
    assert.ok(await rig.play({ limitMs: 400_000 }), rig.describe());
    assertSameEnd(rig, "pmiss recarregado");
    const pmisses = rig.dev.B.submitted.filter((action) => action.kind === "pmiss");
    assert.equal(new Set(pmisses.map((action) => action.n)).size, pmisses.length, "pmiss duplicado");
    // Mesma sequência de batedores (o desfecho de cada cobrança pode mudar: o goleiro anda durante a contagem de volta).
    const got = kickers(rig.dev.A);
    const shared = Math.min(got.length, expected.length);
    assert.ok(shared >= 4, `poucas cobranças: ${got.join(" ")}`);
    assert.deepEqual(got.slice(0, shared), expected.slice(0, shared), `outra sequência de batedores
${got.join(" ")}
${expected.join(" ")}`);
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (16) Espectador entra no meio
// ---------------------------------------------------------------------------

test("(16) espectador entra no meio da partida e converge", async () => {
  const rig = await createDuelRig({ seed: 8601, spectators: ["C"], lateSpectators: true });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 6));
    rig.mount("C");
    assert.ok(await rig.until(() => rig.dev.C.directives.some((directive) => directive.reason === "spectate"), 10_000), "sem m:sync de espectador");
    assert.ok(await rig.play({ limitMs: 400_000, until: () => rig.finished() && rig.dev.C.driver.finished() }), rig.describe());
    assert.equal(M.hashMatch(rig.dev.C.state), M.hashMatch(rig.dev.A.state), "o espectador terminou noutro estado");
    assert.equal(rig.dev.C.launch.perspective, "neutral");
    assert.deepEqual(rig.dev.C.launch.controls, { user: "remote", cpu: "remote" });
    assert.equal(rig.dev.C.outcomes.length, 0, "espectador não relata");
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (17) Solo contra a CPU
// ---------------------------------------------------------------------------

test("(17) solo contra a CPU: cursor do cérebro salvo e restaurado; a rng da partida igual à de quem só aplica o log", async () => {
  const options = { seed: 8701, solo: true, ...STEADY, spectators: ["C"] };
  const control = await createDuelRig(options);
  assert.ok(await control.play({ limitMs: 400_000 }));
  const expectedHash = M.hashMatch(control.dev.A.state);
  control.close();

  const rig = await createDuelRig(options);
  try {
    assert.equal(rig.dev.A.launch.cpuBrain.cursor, 0);
    assert.deepEqual(rig.dev.A.launch.controls, { user: "local", cpu: "cpu" });
    assert.ok(await rig.until(() => rig.dev.A.submitted.filter((action) => action.side === "cpu").length >= 3 && rig.dev.A.driver.restReady() && rig.dev.A.driver.localTurn() === "user", 120_000));
    await rig.runFor(200);
    rig.dev.A.controller.flushCheckpoint();
    const cp = rig.dev.A.store.load(rig.setup.matchId);
    assert.ok(cp.cpuCursor > 0, "cursor do cérebro não andou");
    assert.equal(cp.cpuCursor, rig.dev.A.driver.cpuCursor, "o espelho do cérebro perdeu o passo do driver");
    rig.kill("A");
    await rig.runFor(2000);
    const a = await rig.reload("A");
    assert.equal(a.launch.cpuBrain.cursor, cp.cpuCursor);
    assert.equal(a.cpu.rng.cursor(), cp.cpuCursor);
    assert.ok(await rig.play({ limitMs: 400_000, until: () => rig.dev.A.driver.finished() && rig.dev.C.driver.finished() }), rig.describe());
    assert.equal(M.hashMatch(rig.dev.A.state), expectedHash, "a recarga mudou as decisões da CPU");
    // O espectador só aplica o log (os dois lados remotos): a rng da partida dele anda igual.
    assert.equal(rig.dev.C.state.rng.cursor(), rig.dev.A.state.rng.cursor());
    assert.equal(M.hashMatch(rig.dev.C.state), M.hashMatch(rig.dev.A.state));
    assert.equal(rig.dev.A.outcomes[0].kind, "result");
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (18) Sem caminho ICE entre dois vivos
// ---------------------------------------------------------------------------

test("(18) sem caminho ICE (joinError) entre dois vivos: faixa route, nenhuma reserva corre, a mesma moeda depois de 3 min", async () => {
  const rig = await createDuelRig({ seed: 8801, ...STEADY });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 2));
    rig.hub.joinError("A", "B");
    void rig.dev.A.session.rejoin();
    assert.ok(await rig.until(() => rig.dev.A.controller.status().banner?.kind === "route" && rig.dev.B.controller.status().banner?.kind === "route", 30_000), rig.describe());
    assert.equal(rig.dev.A.controller.status().banner.text, "A conexão entre vocês não fechou. Tentando de novo…");
    const pools = [rig.dev.A.controller.poolOf(rig.sides.cpu), rig.dev.B.controller.poolOf(rig.sides.user)];
    assert.ok(pools.every((left) => left > T.GRACE_POOL_S - 2), `reservas ${pools}`);
    await rig.runFor(60_000);
    assert.deepEqual([rig.dev.A.controller.poolOf(rig.sides.cpu), rig.dev.B.controller.poolOf(rig.sides.user)], pools, "reserva correu durante a rota");
    assert.equal(rig.dev.A.controller.poolOf(rig.sides.user), T.GRACE_POOL_S);
    assert.ok(await rig.until(() => rig.dev.A.outcomes.length > 0 && rig.dev.B.outcomes.length > 0, T.DOUBLE_ABSENT_S * 1000 + 30_000), rig.describe());
    const coin = matchCoin(rig.setup);
    for (const name of ["A", "B"]) {
      assert.deepEqual(rig.dev[name].outcomes.map(({ kind, winner, reason }) => ({ kind, winner, reason })), [{ kind: "walkover", winner: coin, reason: "double" }]);
    }
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (19)-(21) Pedidos do driver (B4): descarte na autoridade, contagem de largada, peek depois de restaurar
// ---------------------------------------------------------------------------

test("(19) a autoridade descarta a ação do seguidor que o motor recusa: m:sync com se+1 já no descanso; o espectador travado pede e recebe", async () => {
  const rig = await createDuelRig({ seed: 8901, ...STEADY, spectators: ["C"] });
  try {
    // O primeiro toque do seguidor sai adulterado no fio: o botão é do outro time (o motor da autoridade recusa).
    let tampered = null;
    rig.dev.B.sendRule = (to, kind, body) => {
      if (kind === "m:act" && !tampered && body.kind === "shot" && body.side === "cpu" && rig.dev.A.state) {
        const foreign = E.discsOf(rig.dev.A.state, "user")[0].id;
        tampered = { n: body.n, bodyId: foreign };
        body.shot = { ...body.shot, bodyId: foreign };
      }
      return null;
    };
    assert.ok(await rig.until(() => tampered !== null, 60_000), "o seguidor nunca tocou");
    assert.ok(await rig.until(() => rig.directives("B").some((directive) => directive.reason === "stuck"), 10_000), `sem m:sync (${rig.describe()})`);
    const directive = rig.directives("B").find((entry) => entry.reason === "stuck");
    assert.equal(directive.n, tampered.n, "o m:sync não veio do descanso da ação descartada");
    assert.equal(rig.dev.A.driver.n, tampered.n, "a autoridade passou da ação descartada");
    assert.equal(rig.dev.A.controller.syncEpoch(), 1, "a autoridade não subiu o se");
    assert.equal(rig.dev.B.controller.syncEpoch(), 1, "o seguidor não adotou o se novo");
    // O espectador recebeu a ação (repassada antes do descarte), travou e pediu: recebe o descanso de novo.
    assert.ok(await rig.until(() => rig.dev.C.directives.some((entry) => entry.reason === "spectate" && entry.n >= tampered.n), 10_000), "o espectador ficou travado");
    assert.ok(await rig.play({ limitMs: 600_000, until: () => rig.finished() && rig.dev.C.driver.finished() }), rig.describe());
    assertSameEnd(rig, "depois do descarte");
    assert.equal(M.hashMatch(rig.dev.C.state), M.hashMatch(rig.dev.A.state), "o espectador terminou noutro estado");
  } finally {
    rig.close();
  }
});

test("(20) contagem de largada: status().frozen fica true até o fim dela; nenhum turno abre nem toque sai antes", async () => {
  const rig = await createDuelRig({ seed: 8902, ...STEADY });
  try {
    const frozen = () => rig.dev.A.controller.status().frozen || rig.dev.B.controller.status().frozen;
    assert.equal(rig.dev.A.controller.status().frozen, true);
    assert.equal(rig.dev.B.controller.status().frozen, true);
    let countdownSeen = false;
    let countdownAt = null;
    const start = rig.hub.now();
    while (frozen()) {
      assert.ok(rig.hub.now() - start < 15_000, `a contagem nunca acabou (${rig.describe()})`);
      const banner = rig.dev.A.controller.status().banner;
      if (banner?.kind === "countdown" && /^Começa em [123]…$/.test(banner.text)) {
        countdownSeen = true;
        countdownAt ??= rig.hub.now();
      }
      for (const name of ["A", "B"]) {
        const dev = rig.dev[name];
        if (!dev.controller.status().frozen) continue;
        assert.equal(dev.driver.localTurn(), null, `${name}: turno aberto durante a contagem`);
        assert.equal(dev.submitted.length, 0, `${name}: toque durante a contagem`);
      }
      await rig.step();
    }
    assert.ok(countdownSeen, "sem faixa de contagem");
    assert.ok(rig.hub.now() - countdownAt >= ONLINE_TIMING.START_COUNTDOWN_MS - 300, `contagem curta: ${rig.hub.now() - countdownAt} ms`);
    assert.ok(await rig.until(() => rig.dev.A.submitted.length + rig.dev.B.submitted.length > 0, 20_000), "ninguém jogou depois da contagem");
    assert.ok(await rig.play({ limitMs: 400_000 }), rig.describe());
    assertSameEnd(rig, "contagem de largada");
  } finally {
    rig.close();
  }
});

test("(21) depois de restaurar, peek(n) devolve a ação que o próprio aparelho já tinha escrito (o driver aplica pela fila)", async () => {
  const options = { seed: 8903, ...STEADY };
  const expected = await control(options);
  const rig = await createDuelRig(options);
  try {
    const own = () => rig.dev.B.submitted.at(-1);
    assert.ok(await rig.until(() => {
      const last = own();
      return last !== undefined && last.kind === "shot" && rig.dev.B.driver.n === last.n + 1 && rig.dev.B.state.phase === "resolving";
    }, 120_000), "o seguidor nunca tocou");
    const mine = clone(own());
    rig.kill("B");
    await rig.runFor(3000);
    const b = await rig.reload("B");
    assert.ok(b.launch.restore, "sem checkpoint");
    assert.equal(b.launch.restore.n, mine.n, "o checkpoint não ficou no descanso antes do toque");
    const peeked = clone(b.controller.peek(mine.n));
    delete peeked.matchId;
    delete mine.matchId;
    assert.deepEqual(peeked, mine, "peek não devolveu o toque do próprio aparelho");
    assert.ok(await rig.play({ limitMs: 600_000 }), rig.describe());
    assertSameEnd(rig, "toque restaurado");
    assert.equal(M.hashMatch(rig.dev.A.state), expected.hash, "o resultado mudou por causa da recarga");
  } finally {
    rig.close();
  }
});

// ---------------------------------------------------------------------------
// (22) Pedido do driver (B4): "finished" é descanso (isRestPoint)
// ---------------------------------------------------------------------------

test("(22) o fim é descanso: a autoridade manda o m:rest do 'finished' (gol, tempo, pênaltis) e o seguidor só relata depois de bater com ele", async () => {
  // Sem prorrogação: o tempo curto acaba em pênaltis ou no placar; com limite de 1 gol, no gol.
  const PENS = { goalLimit: 9, halfSeconds: 6, halves: 1, extraHalves: 0, extraSeconds: 0, penaltyRounds: 2 };
  const GOAL = { goalLimit: 1, halfSeconds: 90, halves: 1, extraHalves: 0, extraSeconds: 0, penaltyRounds: 1 };
  const HOLD_MS = 3000;
  for (const ending of [
    { seed: 9205, rules: GOAL, decision: "goal-limit" },
    { seed: 9001, rules: PENS, decision: "regulation" },
    { seed: 9005, rules: PENS, decision: "penalties" },
  ]) {
    const rig = await createDuelRig({ seed: ending.seed, ...STEADY, rules: ending.rules });
    try {
      const a = rig.dev.A;
      const b = rig.dev.B;
      // O descanso do fim (só ele) chega ao seguidor 3 s atrasado.
      let finalRest = null;
      a.sendRule = (to, kind, body) => {
        if (kind !== "m:rest" || to !== rig.info.B.playerId || body.match.phase !== "finished") return null;
        assert.equal(finalRest, null, "dois descansos do fim");
        finalRest = { n: body.n, h: body.h, sentAt: rig.hub.now() };
        return { delayMs: HOLD_MS };
      };
      let arrivedAt = null;
      b.dropIncoming = (kind, body) => {
        if (kind === "m:rest" && body.match?.phase === "finished") arrivedAt ??= rig.hub.now();
        return false;
      };
      let endedHereAt = null;
      const done = await rig.play({
        limitMs: 400_000,
        until: () => {
          if (b.state.phase === "finished") endedHereAt ??= rig.hub.now();
          return rig.finished();
        },
      });
      assert.ok(done, `${ending.decision}: ${rig.describe()}`);
      assert.equal(a.state.result.decision, ending.decision, `semente ${ending.seed} mudou de desfecho`);
      assert.ok(finalRest, `${ending.decision}: a autoridade não mandou o descanso do fim`);
      assert.equal(finalRest.n, a.driver.n, `${ending.decision}: o descanso do fim não é o último n`);
      assert.equal(finalRest.h, M.hashMatch(a.state), `${ending.decision}: o hash do fim não é o do estado final`);
      assert.equal(a.outcomes.length, 1);
      assert.ok(a.outcomes[0].at <= finalRest.sentAt, `${ending.decision}: a autoridade esperou para relatar`);
      // O motor do seguidor acabou bem antes; o relato só sai com o descanso do fim conferido.
      assert.ok(endedHereAt !== null, `${ending.decision}: o motor do seguidor não chegou ao fim`);
      assert.ok(arrivedAt !== null, `${ending.decision}: o seguidor relatou antes de o descanso do fim chegar`);
      assert.ok(arrivedAt - endedHereAt >= HOLD_MS - 500, `${ending.decision}: o seguidor terminou só ${arrivedAt - endedHereAt} ms antes`);
      assert.equal(b.outcomes.length, 1);
      assert.ok(b.outcomes[0].at >= arrivedAt, `${ending.decision}: o seguidor relatou ${arrivedAt - b.outcomes[0].at} ms antes de bater o fim`);
      assert.deepEqual(core(b.outcomes[0].result), core(a.outcomes[0].result));
      assert.equal(rig.directives("B").length, 0, `${ending.decision}: sincronia sem motivo`);
      assertSameEnd(rig, ending.decision);
    } finally {
      rig.close();
    }
  }
});

// ---------------------------------------------------------------------------
// (23)-(30) Achados da revisão (F-room): seguidor modificado, W.O. provisório, relógio, espelho, prazos
// ---------------------------------------------------------------------------

/** Tempo de sobra no relógio do período (as vezes longas não acabam o tempo). */
const ROOMY = { ...SHORT, halfSeconds: 60 };
/** O que um seguidor modificado mandaria como m:act no n atual da autoridade. */
const forge = (rig, partial) => ({ n: rig.dev.A.driver.n, k: M.matchKey(rig.dev.A.state), se: rig.dev.A.controller.syncEpoch(), matchId: rig.setup.matchId, ...partial });

test("(23) a autoridade só aplica do seguidor a vez dele: expire/idle/toque com botão dela na vez dela e expire com relógio sobrando caem com m:sync", async () => {
  const rig = await createDuelRig({ seed: 9301, ...STEADY, rules: ROOMY });
  try {
    const a = rig.dev.A;
    let mine = null;
    rig.script("A", (turn) => (mine === null && turn >= 2 ? ((mine = turn), { think: 4 }) : null));
    assert.ok(await rig.until(() => mine !== null && a.driver.localTurn() === "user" && a.driver.n === mine, 60_000), rig.describe());
    const n = a.driver.n;
    const own = E.discsOf(a.state, "user").find((disc) => E.canShoot(a.state, disc.id));
    const syncs = inboxKinds(rig.dev.B, "m:sync").length;
    // Na vez da autoridade: fim do tempo, inatividade, gol contra com o botão dela e um pmiss fora de hora.
    for (const partial of [
      { kind: "expire", side: "cpu" },
      { kind: "idle", side: "cpu", clock: a.state.clock - 1 },
      { kind: "shot", side: "cpu", shot: { bodyId: own.id, vx: 0, vy: 900 }, clock: a.state.clock - 0.5, grace: false },
      { kind: "pmiss", side: "cpu" },
    ]) {
      a.controller.receive(rig.sides.cpu, "m:act", forge(rig, partial));
      await rig.runFor(250);
      assert.equal(a.driver.n, n, `${partial.kind} forjado aplicado na vez da autoridade`);
      assert.equal(a.state.phase, "aim", `${partial.kind}: ${a.state.phase}`);
      assert.equal(a.state.turn, "user");
      assert.ok(a.state.clock > 30, `${partial.kind}: relógio ${a.state.clock}`);
    }
    assert.ok(inboxKinds(rig.dev.B, "m:sync").length > syncs, "o seguidor não recebeu m:sync");
    // Na vez do seguidor, com bastante relógio: um expire não acaba o período.
    let target = null;
    rig.script("B", (turn) => (target === null && turn > n ? ((target = turn), { think: 4 }) : null));
    assert.ok(await rig.until(() => target !== null && a.driver.n === target && a.driver.remoteTurn() === "cpu" && a.driver.restReady(), 60_000), rig.describe());
    assert.ok(a.state.clock > 20, `relógio ${a.state.clock}`);
    a.controller.receive(rig.sides.cpu, "m:act", forge(rig, { kind: "expire", side: "cpu" }));
    await rig.runFor(250);
    assert.equal(a.driver.n, target, "expire forjado aplicado na vez do seguidor");
    assert.equal(a.state.phase, "aim");
    assert.ok(await rig.play({ limitMs: 600_000 }), rig.describe());
    assertSameEnd(rig, "ações forjadas");
  } finally {
    rig.close();
  }
});

test("(24) m:hello/m:sync-up forjados na autoridade viva: nada do lado dela entra, o estado dela não é trocado, n enorme não trava nem fica no log", async () => {
  const rig = await createDuelRig({ seed: 9401, ...STEADY, rules: ROOMY });
  try {
    const a = rig.dev.A;
    let mine = null;
    rig.script("A", (turn) => (mine === null && turn >= 2 ? ((mine = turn), { think: 5 }) : null));
    assert.ok(await rig.until(() => mine !== null && a.driver.localTurn() === "user" && a.driver.n === mine, 60_000), rig.describe());
    const n = a.driver.n;
    const hello = (extra) => ({ matchId: rig.setup.matchId, n: n + 1, h: "x", restN: n, se: a.controller.syncEpoch(), log: [], orders: {}, ...extra });
    // Buraco "coberto" por uma escrita do lado da autoridade (inatividade absurda contra ela).
    a.controller.receive(rig.sides.cpu, "m:hello", hello({ log: [{ kind: "idle", n, k: M.matchKey(a.state), se: a.controller.syncEpoch(), side: "user", clock: 1e9 }] }));
    await rig.runFor(250);
    assert.equal(a.driver.n, n, "a autoridade aplicou uma ação dela escrita pelo seguidor");
    assert.equal(a.state.phase, "aim");
    // Buraco falso + m:sync-up com placar inventado.
    const score = { ...a.state.score };
    a.controller.receive(rig.sides.cpu, "m:hello", hello({ n: n + 20 }));
    const fake = M.serializeMatch(a.state);
    fake.score = { user: 0, cpu: 7 };
    a.controller.receive(rig.sides.cpu, "m:sync-up", { matchId: rig.setup.matchId, n, match: fake, log: [] });
    await rig.runFor(250);
    assert.deepEqual(a.state.score, score, "a autoridade adotou o estado forjado");
    // n enorme: sem laço pelo buraco; ação muito à frente nunca entra no log (o driver não fica em alcance).
    const started = performance.now();
    a.controller.receive(rig.sides.cpu, "m:hello", hello({ n: n + 2e8 }));
    assert.ok(performance.now() - started < 100, `hello com n enorme levou ${Math.round(performance.now() - started)} ms`);
    a.controller.receive(rig.sides.cpu, "m:act", forge(rig, { kind: "idle", n: n + 1000, side: "cpu", clock: 5 }));
    assert.equal(a.controller.aheadOf(a.driver.n), 0, "ação distante ficou no log");
    assert.ok(await rig.play({ limitMs: 600_000 }), rig.describe());
    assertSameEnd(rig, "hello forjado");
  } finally {
    rig.close();
  }
});

test("(25) W.O. pedido é provisório: congela esperando o anfitrião; recusado (ou o outro 'ok' por 15 s) a partida volta e termina igual", async () => {
  const rig = await createDuelRig({ seed: 9501, ...STEADY });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 3));
    // Só o link A↔B morre (a sinalização segue no ar): cada um vê o outro sumir e pede o W.O.
    rig.hub.partition("A", "B", true);
    assert.ok(await rig.until(() => rig.dev.A.outcomes.length > 0 && rig.dev.B.outcomes.length > 0, 200_000), rig.describe());
    for (const [name, side] of [["A", "user"], ["B", "cpu"]]) {
      const controller = rig.dev[name].controller;
      assert.deepEqual(rig.dev[name].outcomes.map(({ kind, winner, reason }) => ({ kind, winner, reason })), [{ kind: "walkover", winner: side, reason: "timeout" }]);
      assert.equal(controller.status().frozen, true);
      assert.match(controller.status().banner?.text ?? "", /confirmando com o anfitrião/);
      assert.equal(controller.lostByTimeout(), false);
    }
    rig.hub.partition("A", "B", false);
    // O anfitrião recusa o do seguidor (vê A presente); a autoridade não ouve nada e retira sozinha.
    const healedAt = rig.hub.now();
    rig.dev.B.controller.claimRejected();
    assert.equal(rig.dev.B.outcomes.at(-1).kind, "withdrawn");
    assert.ok(await rig.until(() => rig.dev.A.outcomes.at(-1).kind === "withdrawn", 30_000), rig.describe());
    assert.ok(rig.hub.now() - healedAt >= 14_000, `a autoridade retirou em ${rig.hub.now() - healedAt} ms`);
    assert.ok(await rig.play({ limitMs: 600_000 }), rig.describe());
    assertSameEnd(rig, "W.O. retirado");
    assert.equal(rig.dev.A.outcomes.at(-1).kind, "result");
    assert.equal(rig.dev.B.outcomes.at(-1).kind, "result");
  } finally {
    rig.close();
  }
});

test("(26) não voltei a tempo e o outro ainda vê a minha reserva: só a concessão (match:forfeit da sala) tira o outro da pausa", async () => {
  const rig = await createDuelRig({ seed: 9601, ...STEADY });
  try {
    assert.ok(await rig.until(() => rig.dev.A.driver.n >= 3));
    rig.hide("A");
    await rig.runFor(40_000);
    // O seguidor sai do app por 10 s enquanto espera: a conta dele da reserva de A para.
    rig.hide("B");
    await rig.runFor(10_000);
    rig.show("B");
    await rig.runFor(42_000);
    rig.show("A");
    assert.ok(await rig.until(() => rig.dev.A.outcomes.length > 0, 10_000), rig.describe());
    assert.deepEqual(rig.dev.A.outcomes.map(({ winner, reason }) => ({ winner, reason })), [{ winner: "cpu", reason: "timeout" }]);
    assert.equal(rig.dev.A.controller.lostByTimeout(), true);
    await rig.runFor(5000);
    assert.equal(rig.dev.B.outcomes.length, 0, "o seguidor pediu um W.O. com a reserva de A sobrando");
    assert.equal(rig.dev.B.controller.status().frozen, true);
    // A sala de A concede ao adversário: ele para com a vitória por W.O. e não pede outra.
    rig.dev.A.session.send(rig.sides.cpu, "match:forfeit", { bracketId: "r1m0", matchId: rig.setup.matchId, reason: "timeout" });
    assert.ok(await rig.until(() => rig.dev.B.outcomes.length > 0, 5000));
    assert.deepEqual(rig.dev.B.outcomes.map(({ kind, winner }) => ({ kind, winner })), [{ kind: "walkover", winner: "cpu" }]);
    await rig.runFor(5000);
    assert.equal(rig.dev.B.outcomes.length, 1);
  } finally {
    rig.close();
  }
});

test("(27) toque honesto do seguidor com congelamento no meio da vez (mais de 8,5 s no total): a autoridade não corta o relógio", async () => {
  const rig = await createDuelRig({ seed: 9701, ...STEADY, rules: ROOMY });
  try {
    let target = null;
    rig.script("B", (n) => (target === null && n >= 2 ? ((target = n), { think: 60 }) : null));
    assert.ok(await rig.until(() => target !== null && (rig.players.B.plans.get(target)?.waited ?? 0) >= 6, 60_000), rig.describe());
    rig.hide("A");
    assert.ok(await rig.until(() => rig.dev.B.controller.status().frozen, 5000));
    const plan = rig.players.B.plans.get(target);
    assert.ok(plan.waited >= 6 && plan.waited < 7 && !plan.done, `esperou ${plan.waited}`);
    plan.think = plan.waited + 2.8; // o piso de 3 s da volta deixa terminar a mira
    await rig.runFor(2000);
    rig.show("A");
    assert.ok(await rig.until(() => rig.dev.A.driver.n > target, 30_000), rig.describe());
    const mine = rig.dev.B.submitted.find((action) => action.n === target);
    const theirs = rig.dev.A.applied.find((action) => action.n === target);
    assert.equal(mine.kind, "shot");
    assert.equal(theirs.clock, mine.clock, "a autoridade cortou o relógio do toque honesto");
    await rig.runFor(3000);
    assert.equal(rig.directives("B").filter((directive) => directive.reason === "hash").length, 0, "o seguidor foi forçado a adotar");
    assert.ok(await rig.play({ limitMs: 600_000 }), rig.describe());
    assertSameEnd(rig, "vez longa com congelamento");
  } finally {
    rig.close();
  }
});

test("(28) solo: a CPU saindo jogando depois de uma pausa (gol ou intervalo) não perde o cursor do cérebro no checkpoint", async () => {
  const rig = await createDuelRig({ seed: 9804, solo: true, ...STEADY });
  try {
    const a = rig.dev.A;
    const rests = [];
    const reportRest = a.controller.reportRest.bind(a.controller);
    a.controller.reportRest = (n, state, pres) => {
      rests.push({ n, phase: state.phase });
      reportRest(n, state, pres);
    };
    // A CPU decide exatamente no n de um descanso de gol/intervalo (depois da saída que o driver refaz).
    const paused = () => rests.filter((rest) => rest.phase === "goal" || rest.phase === "interval").map((rest) => rest.n);
    const ready = () => a.submitted.some((action) => action.side === "cpu" && paused().includes(action.n)) && a.driver.restReady() && a.driver.localTurn() === "user";
    assert.ok(await rig.until(ready, 300_000), `sem saída da CPU depois de uma pausa (${rig.describe()})`);
    await rig.runFor(200);
    a.controller.flushCheckpoint();
    const cp = a.store.load(rig.setup.matchId);
    assert.ok(a.driver.cpuCursor > 0);
    assert.equal(cp.cpuCursor, a.driver.cpuCursor, "o espelho do cérebro se perdeu depois da pausa");
  } finally {
    rig.close();
  }
});

test("(29) pênaltis sem descanso na escolha (gol de empate no 0:00 → pausa → disputa): o prazo da ordem vale do mesmo jeito", async () => {
  const rig = await createDuelRig({ seed: 9901, ...STEADY });
  rig.players.A.noOrders = true;
  rig.players.B.noOrders = true;
  try {
    const a = rig.dev.A;
    const b = rig.dev.B;
    assert.ok(await rig.until(() => a.driver.localTurn() === "user" && a.driver.n >= 2 && b.driver.n === a.driver.n && b.driver.restReady(), 60_000), rig.describe());
    const n = a.driver.n;
    // A transição local que o descanso não mostra: os dois entram na escolha dos batedores no mesmo n.
    a.paused = true;
    b.paused = true;
    E.jumpToPenalties(a.state);
    E.jumpToPenalties(b.state);
    assert.equal(a.state.phase, "penalty-setup");
    assert.ok(await rig.until(() => a.controller.peek(n)?.kind === "porder", T.PENALTY_ORDER_DEADLINE_MS + 5000), "o prazo da ordem não disparou");
    a.paused = false;
    b.paused = false;
    assert.ok(await rig.until(() => a.state.phase === "penalties" && b.state.phase === "penalties", 10_000), rig.describe());
    assert.ok(await rig.play({ limitMs: 400_000 }), rig.describe());
    assertSameEnd(rig, "ordem pelo prazo");
  } finally {
    rig.close();
  }
});

test("(30) espectadores: quem a sala não deixa assistir fica de fora; quem sumiu sem spec:leave não ocupa vaga e sai da lista em 30 s", async () => {
  const blocked = new Set(["intruso"]);
  const rig = await createDuelRig({ seed: 10001, ...STEADY, canSpectate: (id) => !blocked.has(id) });
  try {
    const a = rig.dev.A;
    assert.ok(await rig.until(() => a.driver.n >= 2));
    const sent = [];
    const send = a.session.send.bind(a.session);
    a.session.send = (to, kind, body) => {
      sent.push({ to, kind, at: rig.hub.now(), full: body?.full === true });
      send(to, kind, body);
    };
    a.controller.receive("intruso", "spec:join", { matchId: rig.setup.matchId });
    // Seis abas fechadas sem spec:leave (sem sinal nenhum) e um sétimo espectador.
    for (let index = 1; index <= 7; index += 1) a.controller.receive(`fantasma-${index}`, "spec:join", { matchId: rig.setup.matchId });
    await rig.runFor(500);
    assert.ok(!sent.some((entry) => entry.to === "intruso"), "o intruso recebeu a partida");
    assert.ok(sent.some((entry) => entry.to === "fantasma-1" && entry.kind === "m:sync"));
    const seventh = sent.filter((entry) => entry.to === "fantasma-7" && entry.kind === "m:sync" && !entry.full);
    assert.equal(seventh.length, 1, "o sétimo ficou de fora com as vagas de quem sumiu");
    await rig.runFor(35_000);
    const cut = rig.hub.now();
    await rig.runFor(5000);
    assert.ok(!sent.some((entry) => entry.to.startsWith("fantasma-") && entry.at >= cut), "a autoridade segue mandando para quem sumiu");
  } finally {
    rig.close();
  }
});

test("(31) largada nova: hello/sync-up forjados antes do m:ready não mexem na autoridade; recarregada sem checkpoint, um 'finished' forjado não vira resultado", async () => {
  // Um estado "finished" de verdade desta partida (a mesma semente e regras), como um seguidor modificado o teria.
  const options = { seed: 10101, ...STEADY, rules: { ...SHORT, goalLimit: 9, halfSeconds: 120, halves: 2 } };
  const done = await createDuelRig(options);
  assert.ok(await done.play({ limitMs: 600_000 }), done.describe());
  const finished = M.serializeMatch(done.dev.A.state);
  done.close();
  assert.equal(finished.phase, "finished");
  finished.score = { user: 0, cpu: 7 };
  if (finished.result) finished.result = { ...finished.result, outcome: "loss", goalsFor: 0, goalsAgainst: 7 };

  const rig = await createDuelRig({ ...options, lateFollower: true });
  try {
    const a = rig.dev.A;
    const id = rig.sides.cpu;
    const matchId = rig.setup.matchId;
    await rig.runFor(500);
    assert.equal(a.controller.status().banner?.text, "Começa em 3…");
    // Buraco enorme + estado inventado (0×7 no n 5); inatividade absurda do lado da autoridade no n 0; fim inventado.
    a.controller.receive(id, "m:hello", { matchId, n: 50, h: "x", restN: 0, se: 0, log: [], orders: {} });
    const fake = M.serializeMatch(a.state);
    fake.score = { user: 0, cpu: 7 };
    a.controller.receive(id, "m:sync-up", { matchId, n: 5, match: fake, log: [] });
    a.controller.receive(id, "m:hello", { matchId, n: 1, h: "x", restN: 0, se: 0, orders: {}, log: [{ kind: "idle", n: 0, k: M.matchKey(a.state), se: 0, side: "user", clock: 1e9 }] });
    a.controller.receive(id, "m:hello", { matchId, n: 99, h: "x", restN: 0, se: 0, log: [], orders: {} });
    a.controller.receive(id, "m:sync-up", { matchId, n: 20, match: finished, log: [] });
    await rig.runFor(8000);
    assert.equal(a.driver.n, 0, "a autoridade saiu do n 0 antes da largada");
    assert.deepEqual(a.state.score, { user: 0, cpu: 0 });
    assert.equal(a.applied.length, 0, `aplicou ${a.applied.map((action) => `${action.n}:${action.kind}:${action.side}`).join(",")}`);
    assert.notEqual(a.state.penaltyReason, "inactivity");
    assert.deepEqual(a.outcomes, []);
    // O seguidor entra de verdade e a partida corre normal.
    rig.mount("B");
    assert.ok(await rig.until(() => a.driver.n >= 14 && rig.dev.B.driver.n >= 14, 300_000), rig.describe());
    // A autoridade recarrega sem checkpoint (pode não ter o passado): um m:sync-up com o fim inventado
    // chega antes do de verdade e não vira o resultado dela.
    let hold = true;
    rig.dev.B.sendRule = (to, kind) => (hold && kind === "m:sync-up" ? "drop" : null);
    rig.kill("A");
    await rig.runFor(2000);
    const a2 = await rig.reload("A", { checkpoint: false });
    assert.ok(await rig.until(() => inboxKinds(rig.dev.B, "m:sync-req").length > 0, 30_000), "a autoridade não pediu o passado");
    a2.controller.receive(id, "m:sync-up", { matchId, n: 20, match: finished, log: [] });
    await rig.runFor(8000);
    assert.deepEqual(a2.outcomes, [], "o fim forjado virou o resultado da autoridade");
    assert.notEqual(a2.state.phase, "finished");
    hold = false;
    assert.ok(await rig.play({ limitMs: 900_000 }), rig.describe());
    assertSameEnd(rig, "forjados na largada");
  } finally {
    rig.close();
  }
});

test("(32) seguidor que força voltas na própria vez: hellos em dia não congelam a autoridade (que reivindica); fora de dia, o crédito tem teto, a contagem passa a contar e a reivindicação chega", async () => {
  const setupTurn = async (seed) => {
    const rig = await createDuelRig({ seed, ...STEADY, rules: { ...ROOMY, goalLimit: 9 } });
    let target = null;
    rig.script("B", (n) => (target === null && n >= 2 ? ((target = n), { think: 1e6 }) : null));
    const a = rig.dev.A;
    assert.ok(await rig.until(() => target !== null && a.driver.n === target && a.driver.remoteTurn() === "cpu" && a.driver.restReady(), 120_000), rig.describe());
    rig.dev.B.paused = true; // o seguidor modificado nunca deixa o próprio driver jogar nem escrever o idle
    const h = M.hashMatch(a.state);
    const hello = (extra) => ({ matchId: rig.setup.matchId, n: target, h, restN: target, se: a.controller.syncEpoch(), log: [], orders: {}, ...extra });
    return { rig, a, b: rig.dev.B, target, hello };
  };
  // Hellos em dia (a cada segundo): a autoridade responde sem congelar e reivindica a vez parada.
  {
    const { rig, a, target, hello } = await setupTurn(7171);
    try {
      let frozenSteps = 0;
      const start = rig.hub.now();
      while (a.controller.claims().length === 0 && rig.hub.now() - start < 30_000) {
        a.controller.receive(rig.sides.cpu, "m:hello", hello());
        for (let step = 0; step < 20; step += 1) {
          await rig.step();
          if (a.controller.status().frozen) frozenSteps += 1;
        }
      }
      assert.equal(frozenSteps, 0, "um hello em dia congelou a autoridade");
      assert.ok(a.controller.claims().length >= 1, `sem reivindicação em ${rig.hub.now() - start} ms`);
      assert.ok(await rig.until(() => a.driver.n > target, 10_000), rig.describe());
    } finally {
      rig.close();
    }
  }
  // Hellos fora de dia: cada um congela e volta. Só duas voltas dão crédito (o expire com relógio sobrando
  // cai); as seguintes contam a contagem, e a reivindicação chega antes de 20 voltas.
  {
    const { rig, a, b, target, hello } = await setupTurn(7172);
    try {
      let cycles = 0;
      const cycle = async () => {
        a.controller.receive(rig.sides.cpu, "m:hello", hello({ h: "x" }));
        assert.ok(await rig.until(() => !a.controller.status().frozen && a.controller.status().banner === null, 20_000), rig.describe());
        await rig.runFor(300);
        cycles += 1;
      };
      for (let index = 0; index < 3; index += 1) await cycle();
      assert.equal(a.controller.claims().length, 0);
      const observed = a.controller.opened.observedMs / 1000;
      assert.ok(a.controller.allowedSpentS(target) <= Math.max(8.5, observed + 1.5) + 2 * T.RESUME_TIMER_FLOOR_S + 1e-9, `gasto permitido ${a.controller.allowedSpentS(target)} com ${observed} s vistos`);
      const syncs = inboxKinds(b, "m:sync").length;
      a.controller.receive(rig.sides.cpu, "m:act", forge(rig, { kind: "expire", side: "cpu" }));
      await rig.runFor(500);
      assert.equal(a.driver.n, target, "expire com relógio sobrando acabou o período");
      assert.equal(a.state.phase, "aim");
      assert.ok(inboxKinds(b, "m:sync").length > syncs, "o seguidor não recebeu m:sync");
      while (a.controller.claims().length === 0 && cycles < 20) await cycle();
      assert.ok(a.controller.claims().length >= 1, `${cycles} voltas forçadas sem reivindicação`);
      assert.ok(await rig.until(() => a.driver.n > target, 10_000), rig.describe());
    } finally {
      rig.close();
    }
  }
});

test("(33) espectador com a aba em segundo plano por mais de 64 ações: ao voltar pede o estado e alcança a autoridade", async () => {
  const rig = await createDuelRig({ seed: 5151, ...STEADY, spectators: ["S"], rules: { ...SHORT, goalLimit: 40, halfSeconds: 400, halves: 1 } });
  try {
    const a = rig.dev.A;
    const s = rig.dev.S;
    assert.ok(await rig.until(() => s.driver.n >= 3, 60_000), rig.describe());
    rig.hide("S");
    const start = a.driver.n;
    assert.ok(await rig.until(() => a.driver.n >= start + 70, 900_000), rig.describe());
    assert.ok(s.driver.n < start + 5);
    rig.show("S");
    assert.ok(await rig.until(() => s.driver.n >= a.driver.n - 1, 3000), `S n=${s.driver.n} A n=${a.driver.n}`);
    // Na vez do seguidor o estado da autoridade fica parado (na dela o relógio corre lá): os dois iguais.
    const settled = () => s.driver.n === a.driver.n && s.driver.restReady() && a.driver.restReady() && a.driver.remoteTurn() === "cpu";
    assert.ok(await rig.until(settled, 60_000), `S n=${s.driver.n} A n=${a.driver.n}`);
    assert.equal(M.hashMatch(s.state), M.hashMatch(a.state));
  } finally {
    rig.close();
  }
});

test("(34) ação forjada alguns n à frente não deixa a autoridade em alcance (só a sequência que dá para drenar conta)", async () => {
  const rig = await createDuelRig({ seed: 6161, ...STEADY, rules: { ...ROOMY, goalLimit: 9 } });
  try {
    const a = rig.dev.A;
    assert.ok(await rig.until(() => a.driver.n >= 3, 60_000));
    let frames = 0;
    let ahead = 0;
    const end = rig.hub.now() + 30_000;
    while (rig.hub.now() < end) {
      if (a.controller.aheadOf(a.driver.n) === 0) {
        a.controller.receive(rig.sides.cpu, "m:act", forge(rig, { kind: "idle", n: a.driver.n + 7, side: "cpu", clock: 1e9 }));
      }
      await rig.step();
      frames += 1;
      if (a.controller.aheadOf(a.driver.n) > 0) ahead += 1;
    }
    assert.ok(ahead < frames * 0.1, `em alcance ${ahead} de ${frames} quadros`);
    assert.ok(await rig.play({ limitMs: 600_000 }), rig.describe());
    assertSameEnd(rig, "forjada à frente");
  } finally {
    rig.close();
  }
});

test("(35) seguidor honesto que sai do app seis vezes na própria vez (pensando 6,5 s): nenhuma reivindicação, o toque dele vale", async () => {
  const rig = await createDuelRig({ seed: 9701, ...STEADY, rules: ROOMY });
  try {
    let target = null;
    rig.script("B", (n) => (target === null && n >= 2 ? ((target = n), { think: 6.5 }) : null));
    assert.ok(await rig.until(() => target !== null && rig.dev.B.driver.n === target && rig.dev.B.driver.localTurn() === "cpu", 60_000), rig.describe());
    for (let index = 0; index < 6; index += 1) {
      await rig.runFor(700);
      rig.hide("B");
      await rig.runFor(1000);
      rig.show("B");
      assert.ok(await rig.until(() => !rig.dev.B.controller.status().frozen, 20_000), rig.describe());
    }
    assert.ok(await rig.until(() => rig.dev.A.driver.n > target, 60_000), rig.describe());
    assert.deepEqual(rig.dev.A.controller.claims(), []);
    assert.equal(rig.dev.A.applied.find((action) => action.n === target)?.kind, "shot");
    assert.ok(await rig.play({ limitMs: 600_000 }), rig.describe());
    assertSameEnd(rig, "saídas do app na própria vez");
  } finally {
    rig.close();
  }
});

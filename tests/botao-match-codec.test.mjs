import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, driverRng, seedOf } from "../scripts/engine-identity.mjs";
import { loadTs } from "./helpers/ts-loader.mjs";

// Caminhos novos do motor (Bobonline) e o codec da partida (design §6.1-§6.3).
const E = loadTs("app/botao/engine.ts");
const M = loadTs("app/botao/match-codec.ts");
const { DEFAULT_BOTAO_RULES } = loadTs("app/botao/types.ts");

const DT = 1 / 120;
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const roundTrip = (data) => JSON.parse(JSON.stringify(data));
/** Estado canônico: tudo menos a rng (entra o cursor); -0 e NaN explícitos. */
const canon = (state, { version = true } = {}) =>
  canonicalJson({ ...state, rng: state.rng.cursor(), version: version ? state.version : 0 });

const NAMES = ["Zé Carlos", "Tião", "Biro-Biro", "Dinho", "Careca", "Mirandinha", "Pita", "Juninho", "Bebeto", "Viola"];

function squad(side, seed, size = 5) {
  const r = driverRng(seedOf(seed, side, "squad"));
  return Array.from({ length: size }, (_, index) => {
    const player = { id: `${side}:p${index}`, name: NAMES[(index + (side === "cpu" ? 5 : 0)) % NAMES.length], number: [10, 7, 9, 4, 1][index] ?? 20 + index, position: "MC", overall: 70 };
    if (r.chance(0.7)) player.power = 40 + r.int(0, 60);
    if (r.chance(0.7)) player.control = 40 + r.int(0, 60);
    return player;
  });
}

function baseSetup(seed, extra = {}) {
  const r = driverRng(seedOf(seed, "codec-setup"));
  return {
    matchId: `BOB-${seed}`,
    seed,
    competitionName: "Bobonline",
    stageName: "X1",
    neutralVenue: true,
    userIsHost: r.chance(0.5),
    player: { name: "-", number: 99, position: "MC", overall: 70 },
    userTeam: { id: "bob-a", name: "Alvorada", shortName: "Alvorada", abbr: "ALV", primary: "#d01010", secondary: "#ffffff", strength: 64 + r.int(0, 24) },
    cpuTeam: { id: "bob-b", name: "Bandeirantes", shortName: "Bandeirantes", abbr: "BAN", primary: "#1030d0", secondary: "#ffffff", strength: 64 + r.int(0, 24) },
    difficulty: 3,
    rules: { ...DEFAULT_BOTAO_RULES },
    ...extra,
  };
}

const squadSetup = (seed, extra = {}) => baseSetup(seed, { squads: { user: squad("user", seed), cpu: squad("cpu", seed) }, ...extra });

/** Partida já na cobrança (fase "penalties"). */
function inPenalties(setup) {
  const state = E.createMatch(setup);
  E.jumpToPenalties(state);
  assert.ok(E.confirmPenaltyOrders(state, {}));
  return state;
}

// ---------------------------------------------------------------------------
// Roteiro aleatório (ações do jeito do Bobonline, sempre terminando em descanso)
// ---------------------------------------------------------------------------

function randomShot(state, drv) {
  const discs = E.discsOf(state, state.turn);
  const ball = E.ballOf(state);
  const disc = discs[drv.int(0, discs.length - 1)];
  const angle = drv.chance(0.7) ? Math.atan2(ball.y - disc.y, ball.x - disc.x) + drv.range(-0.3, 0.3) : drv.range(-Math.PI, Math.PI);
  const pull = drv.range(20, 140);
  const aim = E.aimFromDrag(disc, disc.x - Math.cos(angle) * pull, disc.y - Math.sin(angle) * pull);
  return { bodyId: disc.id, vx: aim.vx, vy: aim.vy };
}

function randomPenalty(state, drv) {
  const shooter = E.penaltyShooter(state);
  const goalY = E.attackGoalY(state.penalties.turn);
  const dx = drv.range(E.GOAL_LEFT - 20, E.GOAL_RIGHT + 20) - shooter.x;
  const dy = goalY - shooter.y;
  const length = Math.hypot(dx, dy);
  const speed = E.shotSpeedForBody(shooter) * drv.range(0.3, 1);
  return { bodyId: shooter.id, vx: (dx / length) * speed, vy: (dy / length) * speed };
}

function permutation(ids, drv) {
  const list = ids.slice();
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = drv.int(0, index);
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

/** Próxima ação, decidida olhando `state` (o mesmo objeto de ação serve para as cópias). */
function nextAction(state, drv) {
  switch (state.phase) {
    case "aim":
    case "kickoff": {
      const roll = drv.next();
      if (roll < 0.05 && !state.finalShotGrace) return { kind: "idle", side: state.turn, clock: Math.max(0, state.clock - drv.range(0, 7)) };
      if (roll < 0.45) return { kind: "clock", seconds: drv.range(0.05, 6), hold: drv.chance(0.3) };
      if (state.finalShotGrace && drv.chance(0.3)) return { kind: "expire" };
      return { kind: "shot", shot: randomShot(state, drv), clock: state.clock, grace: state.finalShotGrace };
    }
    case "goal":
      return { kind: "resume" };
    case "interval":
      return { kind: "period" };
    case "penalty-setup": {
      const orders = {};
      for (const side of ["user", "cpu"]) {
        if (drv.chance(0.8)) orders[side] = permutation(E.discsOf(state, side).map((disc) => disc.id), drv);
      }
      return { kind: "porder", orders };
    }
    case "penalties": {
      if (drv.chance(0.06)) return { kind: "pmiss" };
      const keeper = E.penaltyKeeper(state);
      return { kind: "pshot", shot: randomPenalty(state, drv), keeperX: keeper.x + drv.range(-40, 40), keeperDir: drv.chance(0.5) ? 1 : -1 };
    }
    default:
      return null;
  }
}

/** Aplica a ação e roda a física até o próximo descanso. */
function applyAction(state, action) {
  switch (action.kind) {
    case "clock":
      E.advanceClock(state, action.seconds, action.hold);
      return;
    case "expire":
      if (state.finalShotGrace) E.cancelFinalShotGrace(state);
      else E.applyRemoteClock(state, 0, false);
      return;
    case "idle":
      E.applyRemoteClock(state, action.clock, false);
      if (state.phase === "aim" || state.phase === "kickoff") E.awardInactivityPenalty(state, action.side);
      return;
    case "shot":
      E.applyRemoteClock(state, action.clock, action.grace);
      if (!E.beginShot(state, action.shot)) {
        E.skipTurn(state);
        return;
      }
      for (let steps = 0; state.phase === "resolving" && steps < 5000; steps += 1) E.stepMatch(state, DT);
      return;
    case "resume":
      E.resumeAfterGoal(state);
      return;
    case "period":
      E.startNextPeriod(state);
      return;
    case "porder":
      E.confirmPenaltyOrders(state, action.orders);
      return;
    case "pmiss":
      E.commitPenalty(state, false);
      return;
    case "pshot": {
      E.placePenaltyKeeper(state, action.keeperX, action.keeperDir);
      if (!E.beginPenaltyShot(state, action.shot)) {
        E.commitPenalty(state, false);
        return;
      }
      let outcome = null;
      for (let steps = 0; !outcome && steps < 4000; steps += 1) outcome = E.stepPenalty(state, DT);
      E.commitPenalty(state, outcome ? outcome.scored : false);
      return;
    }
    default:
      throw new Error(`ação desconhecida ${action.kind}`);
  }
}

function matchSetupFor(index) {
  if (index % 10 === 7) return baseSetup(300 + index);
  if (index % 10 === 9) return baseSetup(300 + index, { localControl: true, rules: { ...DEFAULT_BOTAO_RULES, halves: 2, halfSeconds: 60 } });
  return squadSetup(300 + index, index % 3 === 0 ? { rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 0, halves: 2, halfSeconds: 50, extraSeconds: 20 } } : {});
}

// ---------------------------------------------------------------------------
// Elencos nomeados (squads)
// ---------------------------------------------------------------------------

test("squads: rótulos, números, atributos, slots 0..4 e nenhuma chamada nova à rng", () => {
  const setup = squadSetup(11);
  const state = E.createMatch(cloneJson(setup));
  const plain = E.createMatch(cloneJson(baseSetup(11)));
  assert.equal(E.usesSquads(state.setup), true);
  assert.equal(E.usesSquads(plain.setup), false);
  assert.equal(state.userSlot, -1);
  assert.equal(state.rng.cursor(), plain.rng.cursor(), "o ramo de squads não pode sortear nada a mais");
  // Sem atributo próprio o botão herda o do time, como os companheiros sem nome do modo normal.
  const mate = E.discsOf(plain, "user").find((disc) => !disc.isUserPlayer);
  const rival = E.discsOf(plain, "cpu")[0];
  for (const side of ["user", "cpu"]) {
    const discs = E.discsOf(state, side);
    assert.equal(discs.length, 5);
    assert.deepEqual(discs.map((disc) => disc.slot).sort(), [0, 1, 2, 3, 4]);
    discs.forEach((disc, slot) => {
      const player = setup.squads[side][slot];
      assert.equal(disc.id, `${side}-${slot}`);
      assert.equal(disc.label, player.name);
      assert.equal(disc.number, player.number);
      assert.equal(disc.isUserPlayer, false);
      assert.equal(disc.playerId, player.id);
      assert.equal(disc.power, player.power ?? (side === "user" ? mate.power : rival.power));
      assert.equal(disc.control, player.control ?? (side === "user" ? mate.control : rival.control));
    });
  }
  assert.equal(E.userPlayerDisc(state), null);
  // Lista curta: completa com o primeiro; lista vazia: o player do setup.
  const short = E.createMatch(baseSetup(12, { squads: { user: squad("user", 12, 2), cpu: [] } }));
  assert.deepEqual(E.discsOf(short, "user").map((disc) => disc.label), ["Zé Carlos", "Tião", "Zé Carlos", "Zé Carlos", "Zé Carlos"]);
  assert.deepEqual(E.discsOf(short, "cpu").map((disc) => disc.label), ["-", "-", "-", "-", "-"]);
  // No modo técnico os elencos do técnico mandam e `squads` é ignorado.
  const roster = (side) => ({ starters: squad(side, 13).map((player, index) => ({ ...player, id: `${side}-m${index}`, name: `M${index}` })), bench: [] });
  const manager = E.createMatch(squadSetup(13, { managerMode: true, managerRosters: { user: roster("user"), cpu: roster("cpu") } }));
  assert.equal(E.usesSquads(manager.setup), false);
  assert.ok(E.discsOf(manager, "user").every((disc) => disc.label.startsWith("M")));
});

test("squads: userSlot fica -1 depois de todo placeTeams e os slots continuam 0..4", () => {
  for (let index = 0; index < 4; index += 1) {
    const state = E.createMatch(squadSetup(20 + index, { rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 0, halves: 2, halfSeconds: 40, extraSeconds: 20 } }));
    const drv = driverRng(seedOf("slots", index));
    let placements = 0;
    const checkSlots = (where) => {
      assert.equal(state.userSlot, -1, where);
      for (const side of ["user", "cpu"]) assert.deepEqual(E.discsOf(state, side).map((disc) => disc.slot).sort(), [0, 1, 2, 3, 4], where);
    };
    for (let guard = 0; guard < 600 && state.phase !== "finished"; guard += 1) {
      const action = nextAction(state, drv);
      if (!action) break;
      if (action.kind === "resume" || action.kind === "period" || action.kind === "pmiss" || action.kind === "pshot") placements += 1;
      applyAction(state, action);
      checkSlots(`${index}:${guard}:${action.kind}`);
      if (drv.chance(0.05) && state.phase !== "resolving" && !state.penalties) {
        E.placeTeams(state);
        checkSlots("placeTeams direto");
      }
    }
    assert.ok(placements > 0);
  }
});

test("squads: o gol sai com o nome do botão, sem o time na frente", () => {
  const score = (setup) => {
    const state = E.createMatch(setup);
    state.turn = "user";
    for (const disc of E.discsOf(state, "cpu")) disc.y = 330 + disc.slot * 20;
    for (const disc of E.discsOf(state, "user")) disc.y = 420;
    const ball = E.ballOf(state);
    ball.x = 150;
    ball.y = 40;
    const shooter = E.discsOf(state, "user")[0];
    shooter.x = 150;
    shooter.y = 70;
    assert.ok(E.beginShot(state, { bodyId: shooter.id, vx: 0, vy: -520 }));
    for (let steps = 0; state.phase === "resolving" && steps < 2000; steps += 1) E.stepMatch(state, DT);
    assert.equal(state.phase, "goal");
    return { state, shooter };
  };
  const named = score(squadSetup(31));
  assert.equal(named.state.lastGoal.scorer, named.shooter.label);
  assert.equal(named.state.timeline.at(-1).text, `${named.shooter.label} marcou`);
  assert.equal(named.state.timeline.at(-1).byUser, false);
  const plain = score(baseSetup(31));
  assert.equal(plain.state.lastGoal.scorer, `Alvorada ${plain.shooter.label}`);
});

// ---------------------------------------------------------------------------
// Demora dos dois lados
// ---------------------------------------------------------------------------

test('awardInactivityPenalty(state, "cpu") dá a cobrança ao user e o gol conta para o user', () => {
  const fresh = () => {
    const state = E.createMatch(squadSetup(41, { userIsHost: false }));
    assert.equal(state.turn, "cpu");
    return state;
  };
  const state = fresh();
  const cursor = state.rng.cursor();
  assert.deepEqual(E.awardInactivityPenalty(state, "cpu"), [{ type: "inactivity-penalty" }]);
  assert.equal(state.rng.cursor(), cursor + 1, "a mesma única chance de antes");
  assert.equal(state.phase, "penalties");
  assert.equal(state.penaltyReason, "inactivity");
  assert.equal(state.penalties.turn, "user");
  assert.equal(E.penaltyShooter(state).side, "user");
  assert.equal(E.penaltyKeeper(state).side, "cpu");
  const events = E.commitPenalty(state, true);
  assert.equal(events[0].side, "user");
  assert.deepEqual(state.score, { user: 1, cpu: 0 });
  assert.equal(state.lastGoal.side, "user");
  assert.equal(state.timeline.at(-1).side, "user");
  assert.equal(state.timeline.at(-1).kind, "goal");
  assert.equal(state.phase, "goal");
  assert.equal(state.turn, "cpu", "quem demorou volta a ter a vez");
  assert.equal(state.penalties, null);
  assert.equal(state.bodies.some((body) => body.kind === "keeper"), false);
  E.resumeAfterGoal(state);
  assert.equal(state.turn, "cpu");
  assert.equal(state.phase, "kickoff");

  const missed = fresh();
  E.awardInactivityPenalty(missed, "cpu");
  const formation = missed.formationIndex.user;
  E.commitPenalty(missed, false);
  assert.deepEqual(missed.score, { user: 0, cpu: 0 });
  assert.equal(missed.turn, "cpu");
  assert.equal(missed.phase, "kickoff");
  assert.equal(missed.clockPausedForKickoff, true);
  assert.equal(missed.formationIndex.user, formation + 1);

  const limit = fresh();
  limit.score.user = limit.setup.rules.goalLimit - 1;
  E.awardInactivityPenalty(limit, "cpu");
  E.commitPenalty(limit, true);
  assert.equal(limit.phase, "finished");
  assert.equal(limit.result.decision, "goal-limit");
  assert.equal(limit.result.outcome, "win");

  // Sem efeito: vez do outro lado, graça do último lance, cobrança em andamento.
  const other = fresh();
  const before = canon(other);
  assert.deepEqual(E.awardInactivityPenalty(other, "user"), []);
  assert.equal(canon(other), before);
  other.finalShotGrace = true;
  assert.deepEqual(E.awardInactivityPenalty(other, "cpu"), []);
  other.finalShotGrace = false;
  E.awardInactivityPenalty(other, "cpu");
  assert.deepEqual(E.awardInactivityPenalty(other, "cpu"), []);
});

test('awardInactivityPenalty: o padrão é "user" e é igual a passar "user"', () => {
  const a = E.createMatch(squadSetup(42, { userIsHost: true }));
  const b = E.createMatch(squadSetup(42, { userIsHost: true }));
  E.awardInactivityPenalty(a);
  E.awardInactivityPenalty(b, "user");
  assert.equal(canon(a), canon(b));
  assert.equal(a.penalties.turn, "cpu");
  E.commitPenalty(a, true);
  assert.deepEqual(a.score, { user: 0, cpu: 1 });
  assert.equal(a.turn, "user");
});

// ---------------------------------------------------------------------------
// Ordens de cobrança dos dois lados
// ---------------------------------------------------------------------------

test("confirmPenaltyOrders valida cada fila como permutação dos ids do lado", () => {
  const setupState = () => {
    const state = E.createMatch(squadSetup(51));
    E.jumpToPenalties(state);
    return state;
  };
  const aim = E.createMatch(squadSetup(51));
  const aimBefore = canon(aim);
  assert.equal(E.confirmPenaltyOrders(aim, { user: ["user-0"] }), false);
  assert.equal(canon(aim), aimBefore);

  const state = setupState();
  const defaults = { user: state.penalties.order.user.slice(), cpu: state.penalties.order.cpu.slice() };
  assert.deepEqual(defaults.user, ["user-0", "user-1", "user-2", "user-3", "user-4"]);
  const playerRound = state.penalties.playerRound;
  const cursor = state.rng.cursor();
  const version = state.version;
  const userOrder = ["user-4", "user-2", "user-0", "user-1", "user-3"];
  const cpuOrder = ["cpu-1", "cpu-0", "cpu-4", "cpu-3", "cpu-2"];
  assert.equal(E.confirmPenaltyOrders(state, { user: userOrder, cpu: cpuOrder }), true);
  assert.deepEqual(state.penalties.order, { user: userOrder, cpu: cpuOrder });
  assert.equal(state.penalties.playerRound, playerRound);
  assert.equal(state.phase, "penalties");
  assert.equal(state.rng.cursor(), cursor);
  assert.equal(state.version, version + 1);
  assert.equal(E.penaltyShooter(state).id, state.penalties.order[state.penalties.turn][0]);
  assert.ok(state.bodies.some((body) => body.kind === "keeper"));
  userOrder.reverse();
  assert.equal(state.penalties.order.user[0], "user-4", "a fila é copiada");
  assert.equal(E.confirmPenaltyOrders(state, { user: userOrder }), false, "só em penalty-setup");

  const invalid = [
    ["user-0", "user-0", "user-1", "user-2", "user-3"],
    ["user-0", "user-1", "user-2", "user-3", "user-9"],
    ["user-0", "user-1", "user-2", "user-3"],
    ["user-0", "user-1", "user-2", "user-3", "user-4", "user-4"],
    ["cpu-0", "cpu-1", "cpu-2", "cpu-3", "cpu-4"],
    "user-0,user-1,user-2,user-3,user-4",
    null,
  ];
  for (const order of invalid) {
    const other = setupState();
    assert.equal(E.confirmPenaltyOrders(other, { user: order, cpu: cpuOrder }), true);
    assert.deepEqual(other.penalties.order.user, defaults.user, JSON.stringify(order));
    assert.deepEqual(other.penalties.order.cpu, cpuOrder);
  }
  const missing = setupState();
  E.confirmPenaltyOrders(missing, {});
  assert.deepEqual(missing.penalties.order, defaults);
});

// ---------------------------------------------------------------------------
// Relógio remoto
// ---------------------------------------------------------------------------

test("applyRemoteClock: no-op rolando, na saída pausada e com valor não finito", () => {
  const state = E.createMatch(squadSetup(61));
  assert.ok(E.beginShot(state, randomShot(state, driverRng(1))));
  const rolling = canon(state);
  assert.deepEqual(E.applyRemoteClock(state, 3, false), []);
  assert.deepEqual(E.applyRemoteClock(state, 0, false), []);
  assert.equal(canon(state), rolling);

  const paused = E.createMatch(squadSetup(62));
  paused.phase = "goal";
  paused.lastGoal = { side: "user", scorer: "x", byUser: false, ownGoal: false };
  E.resumeAfterGoal(paused);
  assert.equal(paused.clockPausedForKickoff, true);
  const kickoff = canon(paused);
  assert.deepEqual(E.applyRemoteClock(paused, 0, false), []);
  assert.equal(canon(paused), kickoff);

  const aim = E.createMatch(squadSetup(63));
  const fresh = canon(aim);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) assert.deepEqual(E.applyRemoteClock(aim, value, false), []);
  assert.equal(canon(aim), fresh);
});

test("applyRemoteClock: vale o menor relógio; em 0 arma a graça ou encerra o tempo", () => {
  const rules = { ...DEFAULT_BOTAO_RULES, halves: 2, halfSeconds: 60 };
  const state = E.createMatch(squadSetup(64, { rules }));
  const version = state.version;
  assert.deepEqual(E.applyRemoteClock(state, 47.25, false), []);
  assert.equal(state.clock, 47.25);
  assert.equal(state.version, version + 1);
  E.applyRemoteClock(state, 52, false);
  assert.equal(state.clock, 47.25, "nunca devolve tempo");

  const grace = E.createMatch(squadSetup(65, { rules }));
  assert.deepEqual(E.applyRemoteClock(grace, 0, true), []);
  assert.equal(grace.clock, 0);
  assert.equal(grace.finalShotGrace, true);
  assert.equal(grace.phase, "aim");

  const end = E.createMatch(squadSetup(66, { rules }));
  const events = E.applyRemoteClock(end, -3, false);
  assert.deepEqual(events.map((event) => event.type), ["period-end"]);
  assert.equal(end.clock, 0);
  assert.equal(end.phase, "interval");
  assert.equal(end.finalShotGrace, false);
});

test("applyRemoteClock é idempotente no aparelho que escreveu e igual ao advanceClock do dono", () => {
  const drv = driverRng(seedOf("remote-clock"));
  for (let index = 0; index < 30; index += 1) {
    const setup = squadSetup(70 + index, { rules: { ...DEFAULT_BOTAO_RULES, halfSeconds: 6 + index } });
    const writer = E.createMatch(cloneJson(setup));
    const receiver = E.createMatch(cloneJson(setup));
    for (let frame = 0; frame < 12 && (writer.phase === "aim" || writer.phase === "kickoff"); frame += 1) {
      const seconds = drv.range(0.05, 2.5);
      const hold = drv.chance(0.4);
      const remote = receiver.clock - seconds;
      const ownEvents = E.advanceClock(writer, seconds, hold);
      // O receptor recebe o relógio que o dono mediu: mesmo estado, inclusive version e eventos.
      assert.deepEqual(E.applyRemoteClock(receiver, remote, hold), ownEvents);
      assert.equal(canon(receiver), canon(writer));
      if (writer.phase !== "aim" && writer.phase !== "kickoff") break;
      // O escritor também aplica a própria ação: nada muda além de version.
      const hash = M.hashMatch(writer);
      const before = canon(writer, { version: false });
      assert.deepEqual(E.applyRemoteClock(writer, writer.clock, writer.finalShotGrace), []);
      assert.equal(M.hashMatch(writer), hash);
      assert.equal(canon(writer, { version: false }), before);
      E.applyRemoteClock(receiver, receiver.clock, receiver.finalShotGrace);
    }
  }
});

// ---------------------------------------------------------------------------
// Goleiro posto pelo batedor
// ---------------------------------------------------------------------------

test("placePenaltyKeeper: limita às traves, zera vx, guarda a direção e não usa a rng", () => {
  const state = inPenalties(squadSetup(81));
  const keeper = E.penaltyKeeper(state);
  const left = E.GOAL_LEFT + keeper.radius + 2;
  const right = E.GOAL_RIGHT - keeper.radius - 2;
  const cursor = state.rng.cursor();
  E.stepPenaltyKeeper(state, 0);
  assert.ok(Number.isNaN(keeper.vx), "dt 0 deixa NaN (o caso que o goleiro posto precisa limpar)");
  E.placePenaltyKeeper(state, -1000, -1);
  assert.equal(keeper.x, left);
  assert.equal(keeper.vx, 0);
  assert.equal(state.penalties.keeperDirection, -1);
  E.placePenaltyKeeper(state, 1e6, 1);
  assert.equal(keeper.x, right);
  assert.equal(state.penalties.keeperDirection, 1);
  E.placePenaltyKeeper(state, 151.123456789, -1);
  assert.equal(keeper.x, 151.123456789);
  assert.equal(state.penalties.keeperDirection, -1);
  assert.equal(state.rng.cursor(), cursor);

  const before = canon(state);
  E.placePenaltyKeeper(state, Number.NaN, 1);
  assert.equal(canon(state), before, "x não finito é ignorado");

  // Sem pênaltis: nada muda e nenhum goleiro aparece.
  const open = E.createMatch(squadSetup(82));
  const openBefore = canon(open);
  E.placePenaltyKeeper(open, 120, 1);
  assert.equal(canon(open), openBefore);
  assert.equal(open.bodies.some((body) => body.kind === "keeper"), false);
  // Ainda escolhendo a ordem: também não.
  const choosing = E.createMatch(squadSetup(83));
  E.jumpToPenalties(choosing);
  const choosingBefore = canon(choosing);
  E.placePenaltyKeeper(choosing, 120, 1);
  assert.equal(canon(choosing), choosingBefore);
  // Bola no ar: não mexe.
  const flying = inPenalties(squadSetup(84));
  assert.ok(E.beginPenaltyShot(flying, randomPenalty(flying, driverRng(2))));
  const flyingBefore = canon(flying);
  E.placePenaltyKeeper(flying, 110, -1);
  assert.equal(canon(flying), flyingBefore);
});

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

test("serializeMatch é JSON puro: sem rng/setup, postes sem mass, NaN e -0 viram 0, sem alias", () => {
  const state = inPenalties(squadSetup(91));
  E.stepPenaltyKeeper(state, 0);
  state.bodies[1].vy = -0;
  const data = M.serializeMatch(state);
  assert.equal(data.codec, 1);
  assert.equal(data.rngCursor, state.rng.cursor());
  assert.equal("rng" in data, false);
  assert.equal("setup" in data, false);
  assert.deepEqual(roundTrip(data), data, "ponto fixo do JSON");
  assert.equal(data.bodies.find((body) => body.kind === "keeper").vx, 0);
  assert.ok(Object.is(data.bodies[1].vy, 0));
  for (const post of data.bodies.filter((body) => body.kind === "post")) assert.equal("mass" in post, false);
  data.bodies[0].x = 999;
  data.score.user = 9;
  assert.notEqual(state.bodies[0].x, 999);
  assert.equal(state.score.user, 0);

  const restored = M.restoreMatch(state.setup, roundTrip(M.serializeMatch(state)));
  assert.equal(restored.setup, state.setup);
  for (const post of restored.bodies.filter((body) => body.kind === "post")) assert.equal(post.mass, Number.POSITIVE_INFINITY);
  assert.deepEqual(Object.keys(restored.bodies.find((body) => body.kind === "post")), Object.keys(state.bodies.find((body) => body.kind === "post")));
  // Do snapshot nunca vêm setup, rng nem "__proto__".
  const hostile = JSON.parse(JSON.stringify(M.serializeMatch(state)).replace('"codec":1', '"codec":1,"setup":{"seed":1},"rng":7,"__proto__":{"polluted":true}'));
  hostile.bodies[0] = JSON.parse(JSON.stringify(hostile.bodies[0]).replace('"id"', '"__proto__":{"polluted":true},"id"'));
  const safe = M.restoreMatch(state.setup, hostile);
  assert.equal(safe.setup, state.setup);
  assert.equal(typeof safe.rng.next, "function");
  assert.equal(safe.polluted, undefined);
  assert.equal(safe.bodies[0].polluted, undefined);
  const target = E.createMatch(state.setup);
  M.overwriteMatch(target, hostile);
  assert.equal(target.setup, state.setup);
  assert.equal(target.polluted, undefined);
  assert.equal(target.bodies[0].polluted, undefined);
  assert.equal({}.polluted, undefined);
  assert.throws(() => M.restoreMatch(state.setup, { ...M.serializeMatch(state), codec: 2 }), /formato/);
  assert.throws(() => M.restoreMatch(state.setup, { ...M.serializeMatch(state), rngCursor: -1 }), /cursor/);
  assert.throws(() => M.restoreMatch(state.setup, { ...M.serializeMatch(state), rngCursor: 1e9 }), /cursor/);
});

test("serializar→restaurar em todo descanso de 20 partidas é bit a bit igual (estado, hash e continuação)", () => {
  let rests = 0;
  const seen = new Set();
  for (let index = 0; index < 20; index += 1) {
    const setup = matchSetupFor(index);
    const live = E.createMatch(cloneJson(setup));
    if (index % 10 === 8) E.jumpToPenalties(live);
    // `copy` renasce do JSON em todo descanso e recebe as mesmas ações que `live`.
    let copy = M.restoreMatch(live.setup, roundTrip(M.serializeMatch(live)));
    const drv = driverRng(seedOf("roundtrip", index));
    for (let guard = 0; guard < 700 && live.phase !== "finished"; guard += 1) {
      assert.ok(M.isRestPoint(live));
      assert.equal(canon(copy), canon(live), `partida ${index}, descanso ${guard}`);
      assert.equal(M.hashMatch(copy), M.hashMatch(live));
      rests += 1;
      const action = nextAction(live, drv);
      if (!action) break;
      seen.add(action.kind === "idle" ? `idle-${action.side}` : action.kind);
      if (live.finalShotGrace) seen.add("grace");
      if (live.penaltyReason === "inactivity") seen.add(`inactivity-kick-${live.penalties.turn}`);
      applyAction(live, action);
      applyAction(copy, action);
      assert.equal(canon(copy), canon(live), `partida ${index}, depois de ${action.kind}`);
      copy = M.restoreMatch(live.setup, roundTrip(M.serializeMatch(copy)));
    }
    assert.equal(live.phase, "finished", `partida ${index} terminou`);
    assert.equal(canonicalJson(copy.result), canonicalJson(live.result));
  }
  assert.ok(rests > 600);
  for (const kind of ["clock", "shot", "expire", "idle-user", "idle-cpu", "inactivity-kick-user", "inactivity-kick-cpu", "grace", "resume", "period", "porder", "pshot", "pmiss"]) {
    assert.ok(seen.has(kind), `cobertura: ${kind}`);
  }
});

test("overwriteMatch mantém o objeto do estado e cada objeto de corpo em 50 adoções", () => {
  let adoptions = 0;
  let rewinds = 0;
  for (let index = 0; adoptions < 50 && index < 20; index += 1) {
    const setup = squadSetup(500 + index, { rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 2, halfSeconds: 70 } });
    const authority = E.createMatch(cloneJson(setup));
    const follower = E.createMatch(cloneJson(setup));
    const drv = driverRng(seedOf("adopt", index));
    let previous = M.serializeMatch(authority);
    for (let guard = 0; guard < 400 && authority.phase !== "finished"; guard += 1) {
      const action = nextAction(authority, drv);
      if (!action) break;
      applyAction(authority, action);
      applyAction(follower, action);
      if (!drv.chance(0.35)) {
        previous = M.serializeMatch(authority);
        continue;
      }
      // Deriva de outro motor (1 ulp), ou um descanso anterior (cursor da rng para trás): a adoção conserta no lugar.
      const ball = E.ballOf(follower);
      ball.x += Number.EPSILON * 256;
      const rewind = drv.chance(0.25);
      const source = rewind ? previous : M.serializeMatch(authority);
      const followerObject = follower;
      const setupObject = follower.setup;
      const bodiesArray = follower.bodies;
      const bodyById = new Map(follower.bodies.map((body) => [body.id, body]));
      const version = Math.max(follower.version, source.version) + 1;
      const cursorBefore = follower.rng.cursor();
      M.overwriteMatch(follower, roundTrip(source));
      adoptions += 1;
      assert.equal(follower, followerObject);
      assert.equal(follower.setup, setupObject);
      assert.equal(follower.bodies, bodiesArray);
      for (const body of follower.bodies) {
        if (bodyById.has(body.id)) assert.equal(body, bodyById.get(body.id), `corpo ${body.id} reaproveitado`);
      }
      assert.equal(follower.version, version);
      const expected = M.restoreMatch(setupObject, roundTrip(source));
      assert.equal(canon(follower, { version: false }), canon(expected, { version: false }));
      assert.equal(M.hashMatch(follower), M.hashMatch(expected));
      if (cursorBefore > source.rngCursor) rewinds += 1;
      // Depois de um descanso velho vem o atual (cursor para a frente no mesmo objeto de rng).
      if (rewind) M.overwriteMatch(follower, roundTrip(M.serializeMatch(authority)));
      assert.equal(canon(follower, { version: false }), canon(authority, { version: false }));
      follower.version = authority.version;
      previous = M.serializeMatch(authority);
    }
    assert.equal(canonicalJson(follower.result), canonicalJson(authority.result));
  }
  assert.ok(adoptions >= 50, `adoções: ${adoptions}`);
  assert.ok(rewinds > 0, "adoção com cursor para trás");

  // O goleiro aparece (corpo novo, no fim) e some (sai do array); os outros corpos continuam os mesmos.
  const target = E.createMatch(squadSetup(560));
  const source = E.createMatch(squadSetup(560));
  const originals = target.bodies.slice();
  E.awardInactivityPenalty(source, source.turn);
  M.overwriteMatch(target, roundTrip(M.serializeMatch(source)));
  assert.equal(target.bodies.length, originals.length + 1);
  assert.equal(target.bodies.at(-1).kind, "keeper");
  originals.forEach((body, index) => assert.equal(target.bodies[index], body));
  assert.equal(M.hashMatch(target), M.hashMatch(source));
  const keeper = target.bodies.at(-1);
  E.stepPenaltyKeeper(source, 0.25);
  M.overwriteMatch(target, roundTrip(M.serializeMatch(source)));
  assert.equal(target.bodies.at(-1), keeper, "o goleiro já existente é reaproveitado");
  E.commitPenalty(source, false);
  M.overwriteMatch(target, roundTrip(M.serializeMatch(source)));
  assert.equal(target.bodies.includes(keeper), false);
  originals.forEach((body, index) => assert.equal(target.bodies[index], body));
  assert.equal(canon(target, { version: false }), canon(source, { version: false }));
});

test("hashMatch é estável e só olha o que importa", () => {
  const a = E.createMatch(squadSetup(101));
  const b = E.createMatch(squadSetup(101));
  const hash = M.hashMatch(a);
  assert.match(hash, /^[0-9a-f]{8}$/);
  assert.equal(M.hashMatch(a), hash);
  assert.equal(M.hashMatch(b), hash);
  assert.equal(M.hashMatch(M.restoreMatch(a.setup, roundTrip(M.serializeMatch(a)))), hash);
  a.version += 10;
  a.result = { outcome: "win" };
  a.setup = { ...a.setup, stageName: "Outra" };
  assert.equal(M.hashMatch(a), hash, "version, result e setup ficam de fora");
  a.bodies[0].vx = -0;
  assert.equal(M.hashMatch(a), hash, "-0 é +0");
  const changes = [
    (state) => (state.bodies[1].x += Number.EPSILON * 128),
    (state) => (state.turn = state.turn === "user" ? "cpu" : "user"),
    (state) => state.touches.push({ bodyId: "user-0", side: "user" }),
    (state) => (state.finalShotGrace = true),
    (state) => (state.stats.cpu.posts += 1),
    (state) => (state.clock -= 1e-9),
    (state) => state.rng.next(),
    (state) => state.timeline.push({}),
  ];
  for (const change of changes) {
    const state = E.createMatch(squadSetup(101));
    change(state);
    assert.notEqual(M.hashMatch(state), hash, change.toString());
  }
  const pens = inPenalties(squadSetup(102));
  const pensHash = M.hashMatch(pens);
  const swapped = inPenalties(squadSetup(102));
  [swapped.penalties.order.cpu[0], swapped.penalties.order.cpu[1]] = [swapped.penalties.order.cpu[1], swapped.penalties.order.cpu[0]];
  assert.notEqual(M.hashMatch(swapped), pensHash);
  const nan1 = inPenalties(squadSetup(102));
  const nan2 = inPenalties(squadSetup(102));
  E.penaltyKeeper(nan1).vx = Number.NaN;
  E.penaltyKeeper(nan2).vx = 0 / 0;
  assert.equal(M.hashMatch(nan1), M.hashMatch(nan2), "todo NaN conta igual");
  assert.notEqual(M.hashMatch(nan1), pensHash);
});

test("isRestPoint: falso com a bola rolando e com a cobrança no ar", () => {
  const state = E.createMatch(squadSetup(111));
  assert.equal(M.isRestPoint(state), true);
  assert.ok(E.beginShot(state, randomShot(state, driverRng(5))));
  assert.equal(M.isRestPoint(state), false);
  for (let steps = 0; state.phase === "resolving"; steps += 1) E.stepMatch(state, DT);
  assert.equal(M.isRestPoint(state), true);
  const pens = inPenalties(squadSetup(112));
  assert.equal(M.isRestPoint(pens), true);
  assert.ok(E.beginPenaltyShot(pens, randomPenalty(pens, driverRng(6))));
  assert.equal(pens.phase, "penalties");
  assert.equal(M.isRestPoint(pens), false);
  let outcome = null;
  while (!outcome) outcome = E.stepPenalty(pens, DT);
  assert.equal(M.isRestPoint(pens), false, "resultado ainda sem commit: o driver segura");
  E.commitPenalty(pens, outcome.scored);
  assert.equal(M.isRestPoint(pens), true);
  const done = E.createMatch(squadSetup(113));
  E.forceFinish(done);
  assert.equal(M.isRestPoint(done), true);
  // A cobrança que decide a disputa encerra a partida sem zerar shotInFlight: mesmo assim é descanso.
  const shootout = inPenalties(squadSetup(114));
  for (let kick = 0; shootout.phase === "penalties" && kick < 30; kick += 1) {
    assert.ok(E.beginPenaltyShot(shootout, randomPenalty(shootout, driverRng(kick + 10))));
    E.commitPenalty(shootout, kick % 2 === 0);
  }
  assert.equal(shootout.phase, "finished");
  assert.equal(shootout.penalties.shotInFlight, true);
  assert.equal(M.isRestPoint(shootout), true);
});

test("matchKey, hashJson e hashSetup", () => {
  const state = E.createMatch(squadSetup(121, { userIsHost: true }));
  assert.equal(M.matchKey(state), "0.1.aim.user.-");
  const pens = inPenalties(squadSetup(122, { userIsHost: false }));
  pens.penalties.results.user.push(true);
  assert.equal(M.matchKey(pens), "0.1.penalties.cpu.cpu1-0");
  assert.match(M.hashJson({ a: 1 }), /^[0-9a-f]{8}$/);
  assert.equal(M.hashJson({ a: 1, b: [1, { c: "ç", d: undefined }] }), M.hashJson({ b: [1, { c: "ç" }], a: 1 }));
  assert.notEqual(M.hashJson({ a: 1 }), M.hashJson({ a: 2 }));
  assert.notEqual(M.hashJson("é"), M.hashJson("e"));
  assert.equal(M.hashJson(-0), M.hashJson(0));
  const setup = squadSetup(123);
  const reordered = Object.fromEntries(Object.entries(cloneJson(setup)).reverse());
  assert.equal(M.hashSetup(reordered), M.hashSetup(setup));
  assert.notEqual(M.hashSetup({ ...setup, seed: setup.seed + 1 }), M.hashSetup(setup));
});

test("validateRemoteShot: teto de velocidade, valores não finitos e lado/vez só no ponto exato da ação", () => {
  const state = E.createMatch(squadSetup(131, { userIsHost: true }));
  const key = M.matchKey(state);
  const disc = E.discsOf(state, "user")[2];
  disc.stamina = 40; // cansado: teto menor
  const cap = E.shotSpeedForBody(disc);
  const inside = { bodyId: disc.id, vx: cap * 0.6, vy: -cap * 0.8, extra: 1 };
  assert.deepEqual(M.validateRemoteShot(state, inside, "open", key), { bodyId: disc.id, vx: inside.vx, vy: inside.vy });
  const edge = { bodyId: disc.id, vx: 0, vy: -cap * (1 + 5e-10) };
  assert.deepEqual(M.validateRemoteShot(state, edge, "open", key), edge, "folga de 1e-9");
  const fast = { bodyId: disc.id, vx: cap * 3, vy: cap * 4 };
  const capped = M.validateRemoteShot(state, fast, "open", key);
  assert.ok(Math.abs(Math.hypot(capped.vx, capped.vy) - cap) <= cap * 1e-12);
  assert.ok(Math.abs(capped.vx / capped.vy - 0.75) < 1e-12, "mesma direção");
  assert.deepEqual(M.validateRemoteShot(state, fast, "open"), capped, "o teto vale com ou sem a chave");
  for (const bodyId of ["ball", "post-top-left", "nada"]) {
    assert.equal(M.validateRemoteShot(state, { bodyId, vx: 10, vy: 10 }, "open"), null, bodyId);
  }
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "10"]) {
    assert.equal(M.validateRemoteShot(state, { bodyId: disc.id, vx: bad, vy: 10 }, "open"), null);
    assert.equal(M.validateRemoteShot(state, { bodyId: disc.id, vx: 10, vy: bad }, "open"), null);
  }
  // No ponto exato: botão do outro lado ou cobrança fora dos pênaltis não passam.
  assert.equal(M.validateRemoteShot(state, { bodyId: "cpu-0", vx: 10, vy: 10 }, "open", key), null, "botão do outro lado");
  assert.equal(M.validateRemoteShot(state, inside, "penalty", key), null, "fora dos pênaltis");
  // Fora do ponto exato (chave de outra jogada, ou sem chave) o toque honesto que chegou cedo não é recusado.
  assert.deepEqual(M.validateRemoteShot(state, { bodyId: "cpu-0", vx: 10, vy: 10 }, "open", "1.1.aim.cpu.-"), { bodyId: "cpu-0", vx: 10, vy: 10 });
  assert.deepEqual(M.validateRemoteShot(state, { bodyId: "cpu-0", vx: 10, vy: 10 }, "open"), { bodyId: "cpu-0", vx: 10, vy: 10 });
  E.beginShot(state, inside);
  const next = { bodyId: "cpu-1", vx: 30, vy: 40 };
  assert.deepEqual(M.validateRemoteShot(state, next, "open", key), next, "jogada anterior ainda rolando: vai para a fila");
  assert.equal(E.beginShot(state, next), false, "o motor recusa na hora errada");

  const pens = inPenalties(squadSetup(132));
  const pkey = M.matchKey(pens);
  const shooter = E.penaltyShooter(pens);
  const other = E.discsOf(pens, shooter.side).find((body) => body.id !== shooter.id);
  const pcap = E.shotSpeedForBody(shooter);
  assert.deepEqual(M.validateRemoteShot(pens, { bodyId: shooter.id, vx: 0, vy: pcap / 2 }, "penalty", pkey), { bodyId: shooter.id, vx: 0, vy: pcap / 2 });
  const pfast = M.validateRemoteShot(pens, { bodyId: shooter.id, vx: 0, vy: -pcap * 9 }, "penalty", pkey);
  assert.ok(Math.abs(pfast.vy + pcap) <= pcap * 1e-12);
  assert.equal(M.validateRemoteShot(pens, { bodyId: other.id, vx: 0, vy: 10 }, "penalty", pkey), null, "só o batedor da vez");
  assert.equal(M.validateRemoteShot(pens, { bodyId: shooter.id, vx: 0, vy: 10 }, "open", pkey), null);
  assert.deepEqual(M.validateRemoteShot(pens, { bodyId: other.id, vx: 0, vy: 10 }, "penalty"), { bodyId: other.id, vx: 0, vy: 10 }, "sem chave: só estrutura");
  E.beginPenaltyShot(pens, { bodyId: shooter.id, vx: 0, vy: (shooter.side === "user" ? -1 : 1) * pcap });
  assert.equal(M.validateRemoteShot(pens, { bodyId: shooter.id, vx: 0, vy: 10 }, "penalty", pkey), null, "cobrança no ar");
});

// ---------------------------------------------------------------------------
// Espelho
// ---------------------------------------------------------------------------

test("mirrorResult troca os lados, a linha do tempo e deixa os replays intactos", () => {
  const state = E.createMatch(squadSetup(141, { userIsHost: true }));
  E.awardInactivityPenalty(state, "user");
  E.commitPenalty(state, true);
  E.resumeAfterGoal(state);
  E.jumpToPenalties(state);
  E.confirmPenaltyOrders(state, {});
  for (let kick = 0; state.phase === "penalties" && kick < 20; kick += 1) E.commitPenalty(state, kick % 3 !== 1);
  const result = { ...state.result, replays: [{ timelineIndex: 0, duration: 2, bodies: [{ id: "user-0", kind: "disc", side: "user", number: 10, radius: 13.5, isUserPlayer: false }], frames: [{ at: 0, positions: [1, 2] }] }] };
  result.timeline = result.timeline.map((entry, index) => (index === 0 ? { ...entry, byUser: true } : entry));
  const frozen = canonicalJson(result);
  const mirrored = M.mirrorResult(result);
  assert.equal(canonicalJson(result), frozen, "não altera o original");
  assert.equal(mirrored.outcome, result.outcome === "win" ? "loss" : result.outcome === "loss" ? "win" : "draw");
  assert.equal(mirrored.goalsFor, result.goalsAgainst);
  assert.equal(mirrored.goalsAgainst, result.goalsFor);
  assert.equal(mirrored.penaltyFor, result.penaltyAgainst);
  assert.equal(mirrored.penaltyAgainst, result.penaltyFor);
  assert.deepEqual(mirrored.stats, { user: result.stats.cpu, cpu: result.stats.user });
  assert.equal(mirrored.timeline.length, result.timeline.length);
  mirrored.timeline.forEach((entry, index) => {
    assert.equal(entry.side, result.timeline[index].side === "user" ? "cpu" : "user");
    assert.equal(entry.byUser, false);
    assert.equal(entry.text, result.timeline[index].text);
  });
  assert.equal(mirrored.replays, result.replays, "replays: o mesmo objeto");
  assert.equal(mirrored.champion, mirrored.outcome === "win");
  assert.equal(mirrored.playerGoals, 0);
  assert.equal(mirrored.manOfTheMatch, false);
  const back = M.mirrorResult(mirrored);
  assert.equal(back.outcome, result.outcome);
  assert.deepEqual(back.stats, result.stats);
  assert.deepEqual(back.timeline.map((entry) => entry.side), result.timeline.map((entry) => entry.side));
  assert.equal(M.mirrorResult({ ...result, outcome: "draw" }).outcome, "draw");
});

test("mirrorSetup troca os times e tudo o que é por lado, sem alterar o original", () => {
  const setup = squadSetup(151, { userFormationId: "f-a", visuals: { enabled: true, player: { id: "p" }, user: [{ id: "u" }], cpu: [{ id: "c" }] } });
  const frozen = canonicalJson(setup);
  const mirrored = M.mirrorSetup(setup);
  assert.equal(canonicalJson(setup), frozen);
  assert.equal(mirrored.userTeam, setup.cpuTeam);
  assert.equal(mirrored.cpuTeam, setup.userTeam);
  assert.equal(mirrored.userIsHost, !setup.userIsHost);
  assert.deepEqual(mirrored.squads, { user: setup.squads.cpu, cpu: setup.squads.user });
  assert.deepEqual(mirrored.visuals.user, setup.visuals.cpu);
  assert.equal(mirrored.cpuFormationId, "f-a");
  assert.equal("userFormationId" in mirrored, false);
  assert.equal(mirrored.matchId, setup.matchId);
  assert.equal(canonicalJson(M.mirrorSetup(mirrored)), frozen);
});

// ---------------------------------------------------------------------------
// Carregador de TS dentro de um Worker (o teste do duelo roda o seguidor assim)
// ---------------------------------------------------------------------------

test("ts-loader funciona num Worker de worker_threads e o motor de lá dá o mesmo estado", async () => {
  const { Worker } = await import("node:worker_threads");
  const setup = squadSetup(171);
  const code = `
    const { parentPort, workerData } = require("node:worker_threads");
    import(workerData.loader).then(({ loadTs }) => {
      const E = loadTs("app/botao/engine.ts");
      const M = loadTs("app/botao/match-codec.ts");
      const state = E.createMatch(workerData.setup);
      E.awardInactivityPenalty(state, state.turn);
      parentPort.postMessage({ hash: M.hashMatch(state), data: M.serializeMatch(state) });
    });`;
  const worker = new Worker(code, { eval: true, workerData: { loader: new URL("./helpers/ts-loader.mjs", import.meta.url).href, setup } });
  try {
    const message = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    const state = E.createMatch(cloneJson(setup));
    E.awardInactivityPenalty(state, state.turn);
    assert.equal(message.hash, M.hashMatch(state));
    assert.deepEqual(message.data, M.serializeMatch(state));
  } finally {
    await worker.terminate();
  }
});

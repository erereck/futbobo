import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { legacySetup } from "../scripts/engine-identity.mjs";
import { loadTs } from "./helpers/ts-loader.mjs";

// Carreira: o chute do jogador desvia num boneco e entra. Gol contra (ou do companheiro que desviou),
// assistência do jogador. A conta fica fora do motor (o golden do motor e o Bobonline não mudam).

const E = loadTs("app/botao/engine.ts");
const A = loadTs("app/botao/career-assist.ts");

/**
 * Bola a 140 do gol de cima, o botão do jogador logo atrás dela e um boneco (`deflectorSide`) a 60,
 * de lado, raspando o caminho da bola. Os outros ficam longe, no campo de baixo.
 */
function arrange({ deflectorSide = "cpu", goalLimit = 3, shooter = "player" } = {}) {
  const setup = legacySetup(4242, "plain");
  setup.rules = { ...setup.rules, goalLimit };
  const state = E.createMatch(setup);
  state.phase = "aim";
  state.turn = "user";
  const cx = E.FIELD.width / 2;
  const player = state.bodies.find((body) => body.kind === "disc" && body.isUserPlayer);
  const mate = state.bodies.find((body) => body.kind === "disc" && body.side === "user" && !body.isUserPlayer);
  const deflector = state.bodies.find((body) => body.kind === "disc" && body.side === deflectorSide && body !== player && body !== mate);
  const kicker = shooter === "player" ? player : mate;
  for (const body of [player, mate]) Object.assign(body, { control: 100, power: 100, stamina: 100 });
  let index = 0;
  for (const body of state.bodies) {
    if (body.kind !== "disc" || body === kicker || body === deflector) continue;
    body.x = 30 + (index % 8) * 34;
    body.y = 330 + Math.floor(index / 8) * 40;
    index += 1;
  }
  const ball = E.ballOf(state);
  ball.x = cx;
  ball.y = 140;
  kicker.x = cx;
  kicker.y = 140 + E.FIELD.discRadius + E.FIELD.ballRadius + 6;
  deflector.x = cx + E.FIELD.discRadius + E.FIELD.ballRadius - 3;
  deflector.y = 60;
  return { state, player, mate, deflector, kicker };
}

/** O mesmo caminho da partida: anota o toque, roda a física, passa os "touch" para a anotação. */
function shoot(state, kicker) {
  assert.ok(E.beginShot(state, { bodyId: kicker.id, vx: 0, vy: -E.shotSpeedForBody(kicker) }));
  const log = A.startShotTouchLog(state);
  let goal = null;
  for (let steps = 0; state.phase === "resolving" && steps < 5000; steps += 1) {
    for (const event of E.stepMatch(state, 1 / 120)) {
      if (event.type === "touch") log.touchers.push(event.bodyId);
      if (event.type === "goal") goal = event;
    }
  }
  return { log, goal };
}

test("desvio no adversário: gol contra com a assistência do jogador da carreira", () => {
  const { state, player, deflector } = arrange();
  const { log, goal } = shoot(state, player);
  assert.ok(goal, "a bola desviou e entrou");
  assert.equal(goal.ownGoal, true);
  assert.equal(goal.side, "user");
  assert.deepEqual(state.touches.map((touch) => touch.bodyId), [player.id, deflector.id]);
  // O motor continua sem dar assistência em gol contra (o golden não muda)...
  assert.equal(state.playerAssists, 0);
  assert.equal(state.timeline.at(-1).assist, null);
  // ...e a partida credita.
  assert.equal(A.applyCareerDeflectionAssist(state, goal, log), player.label);
  assert.equal(state.playerAssists, 1);
  const entry = state.timeline.at(-1);
  assert.equal(entry.kind, "own-goal");
  assert.equal(entry.assist, player.label);
  assert.equal(entry.byUser, false);
  assert.match(entry.text, /^Gol contra de .+ \(assistência de P1\)$/);
  assert.equal(state.score.user, 1);
});

test("desvio no companheiro: o motor já dava a assistência (sem contar duas vezes)", () => {
  const { state, player, deflector } = arrange({ deflectorSide: "user" });
  const { log, goal } = shoot(state, player);
  assert.ok(goal);
  assert.equal(goal.ownGoal, false);
  assert.equal(goal.assist, player.label);
  assert.equal(state.timeline.at(-1).scorer, E.usesSquads(state.setup) ? deflector.label : `${state.setup.userTeam.shortName} ${deflector.label}`);
  assert.equal(state.playerAssists, 1);
  assert.equal(A.applyCareerDeflectionAssist(state, goal, log), null);
  assert.equal(state.playerAssists, 1);
});

test("sem assistência quando o chute não é dele, não é deste lance ou o lance é do adversário", () => {
  // Um companheiro chuta e a bola desvia no adversário: a jogada não é do jogador da carreira.
  {
    const { state, mate } = arrange({ shooter: "mate" });
    const { log, goal } = shoot(state, mate);
    assert.ok(goal?.ownGoal);
    assert.equal(A.applyCareerDeflectionAssist(state, goal, log), null);
    assert.equal(state.playerAssists, 0);
  }
  // Anotação de outro toque, nenhuma anotação ou o lance era da CPU.
  for (const spoil of ["turns", "missing", "cpu-turn"]) {
    const { state, player } = arrange();
    const { log, goal } = shoot(state, player);
    if (spoil === "turns") log.turns -= 1;
    if (spoil === "cpu-turn") state.turn = "cpu";
    assert.equal(A.applyCareerDeflectionAssist(state, goal, spoil === "missing" ? null : log), null, spoil);
    assert.equal(state.playerAssists, 0, spoil);
    assert.doesNotMatch(state.timeline.at(-1).text, /assistência/, spoil);
  }
});

test("ele já era o último a encostar e chuta de novo: vale (o primeiro contato não gera evento)", () => {
  const { state, player } = arrange();
  state.touches = [{ bodyId: player.id, side: "user" }];
  const { log, goal } = shoot(state, player);
  assert.ok(goal?.ownGoal);
  assert.ok(!log.touchers.includes(player.id), "sem evento novo do toque dele");
  assert.equal(log.lastBefore, player.id);
  assert.equal(log.flicked, player.id);
  assert.equal(A.applyCareerDeflectionAssist(state, goal, log), player.label);
  assert.equal(state.playerAssists, 1);
});

test("gol que encerra a partida (limite de gols): o resultado já fechado leva a assistência", () => {
  const { state, player } = arrange({ goalLimit: 1 });
  const { log, goal } = shoot(state, player);
  assert.equal(state.phase, "finished");
  assert.equal(state.result.playerAssists, 0);
  assert.equal(A.applyCareerDeflectionAssist(state, goal, log), player.label);
  assert.equal(state.result.playerAssists, 1);
  assert.equal(state.result.timeline.at(-1).assist, player.label);
  assert.match(state.result.timeline.at(-1).text, /\(assistência de P1\)$/);
  // A carreira soma result.playerAssists nas estatísticas da temporada (applyBotaoMatchResult).
  assert.equal(state.result.playerGoals, 0);
});

test("fonte: a partida só aplica fora do online e do X1 local; o motor não importa a regra", () => {
  const match = readFileSync(new URL("../app/botao/BotaoMatch.tsx", import.meta.url), "utf8");
  assert.match(match, /!online && !localMatch \? applyCareerDeflectionAssist\(machine, event, shotLogRef\.current\)/);
  const engine = readFileSync(new URL("../app/botao/engine.ts", import.meta.url), "utf8");
  assert.doesNotMatch(engine, /career-assist/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

stubBrowser();
const { SCORE_LEVELS } = loadTs("app/scorebobo/sim/levels.ts");
const { ScoreboboGame } = loadTs("app/scorebobo/sim/game.ts");
const { goalOutcome, ruleLabel } = loadTs("app/scorebobo/sim/stars.ts");
const { levelUnlocked, openedBefore } = loadTs("app/scorebobo/storage.ts");
const { PITCH } = loadTs("app/scorebobo/types.ts");

const TEAMS = { home: { name: "A", primary: "#f7d117", secondary: "#1d4fc4" }, away: { name: "B", primary: "#d71920", secondary: "#111111" } };
const level = (id) => SCORE_LEVELS.find((item) => item.id === id);
const progress = (stars, opened = []) => ({ stars, opened, track: 3, unlockAll: false, performance: null });

/** Traço sintético em coordenadas do mundo (a tela é uma projeção qualquer: só a força usa a tela). */
function stroke(game, end, { goal = false, dur = 0.25, n = 14 } = {}) {
  const ball = game.state.ball.pos;
  const aerial = !game.state.ball.owner && ball.y > 0.4;
  const ez = goal ? PITCH.goalLineZ - 0.3 : end.z;
  const samples = [];
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const ground = { x: ball.x + (end.x - ball.x) * u, z: ball.z + (ez - ball.z) * u };
    samples.push({ screen: { x: 400 - ground.x * 12, y: 760 - ground.z * 12 }, t: 1000 + u * dur * 1000, ground, goal: null, air: aerial ? ground : null, viewport: { width: 800, height: 800 } });
  }
  if (goal) {
    samples.push({ screen: { x: 400 - end.x * 12, y: 100 - end.y * 12 }, t: 1016 + dur * 1000, ground: null, goal: { x: end.x, y: end.y, z: PITCH.goalLineZ }, air: null, viewport: { width: 800, height: 800 } });
  }
  return samples;
}

function play(game, end, opts) {
  const plan = game.planKick(stroke(game, end, opts));
  assert.ok(plan, "o traço vira jogada");
  game.commitKick(plan);
  for (let t = 0; t < 20 && game.state.phase === "flight"; t += 1 / 60) game.step(1 / 60);
  return plan;
}

function fresh(id, seed = 7) {
  const game = new ScoreboboGame(level(id), TEAMS, { seed });
  game.skip();
  assert.equal(game.state.phase, "aim");
  return game;
}

test("24 fases, ids únicos, do Primeiro toque à Final da Copa", () => {
  assert.equal(SCORE_LEVELS.length, 24);
  assert.equal(new Set(SCORE_LEVELS.map((item) => item.id)).size, 24);
  assert.equal(SCORE_LEVELS[0].id, "primeiro-toque");
  assert.equal(SCORE_LEVELS.at(-1).id, "final-da-copa");
  for (const item of SCORE_LEVELS) {
    assert.ok(item.attempts >= 1 && item.stars.length === 2, item.id);
    const ids = [item.hero.id, ...item.mates.map((mate) => mate.id), ...item.defenders.map((defender) => defender.id)];
    assert.equal(new Set(ids).size, ids.length, `ids repetidos em ${item.id}`);
    for (const pos of [item.hero.pos, ...item.mates.map((mate) => mate.pos), ...item.defenders.map((defender) => defender.pos)]) {
      assert.ok(Math.abs(pos.x) < PITCH.halfWidth && pos.z > 0 && pos.z < PITCH.goalLineZ, `${item.id} fora do campo`);
    }
  }
});

test("cada fase nova monta e chega à mira com a bola no pé do herói", () => {
  for (const item of SCORE_LEVELS) {
    const game = fresh(item.id);
    assert.equal(game.state.ball.owner, item.hero.id, item.id);
    assert.equal(game.state.actors.length, 2 + item.mates.length + item.defenders.length, item.id);
  }
});

test("Marcar na primeira bola: só o gol da 1ª bola acende a estrela dela, e a estrela é a da regra", () => {
  const base = level("primeiro-toque");
  const facts = { t: 0, type: "goal", scorer: "hero", header: false, volley: false, curve: 0, distance: 18, topCorner: true, firstTime: false, passes: 0, outsideBox: false };
  const first = goalOutcome(base, { ...facts, attempt: 1 });
  assert.deepEqual(first.met, [true, true, true]);
  assert.equal(first.stars, 3);
  const second = goalOutcome(base, { ...facts, attempt: 2 });
  // Duas estrelas, mas a acesa é a do ângulo (a 3ª), não a da primeira bola.
  assert.equal(second.stars, 2);
  assert.deepEqual(second.met, [true, false, true]);
  assert.equal(ruleLabel({ kind: "firstAttempt" }), "Gol na primeira bola");

  // Na simulação: errar a 1ª bola e marcar na 2ª não dá a estrela; recomeçar devolve a chance.
  const game = fresh("primeiro-toque", 3);
  play(game, { x: 5.8, y: 1 }, { goal: true });
  assert.equal(game.state.phase, "outcome");
  assert.equal(game.state.outcome.stars, 0);
  game.nextAttempt();
  game.skip();
  assert.equal(game.state.attempt, 2);
  play(game, { x: -2.8, y: 1.9 }, { goal: true });
  assert.equal(game.state.outcome.result, "goal");
  assert.equal(game.state.outcome.met[1], false);
  game.restart();
  game.skip();
  play(game, { x: -2.8, y: 1.9 }, { goal: true });
  assert.equal(game.state.outcome.result, "goal");
  assert.equal(game.state.outcome.met[1], true);
});

test("trilha 3: save da trilha 2 não tranca o que já estava aberto; fase nova abre com estrela na anterior", () => {
  const stars = { "primeiro-toque": 3, "na-marca-da-cal": 2, "tabela-na-area": 1 };
  const opened = openedBefore(2, [], stars);
  // Na ordem de 12, a Cara a cara (4ª) já estava aberta: segue aberta, mesmo com a Testada (nova, sem estrela) antes dela.
  assert.ok(opened.includes("cara-a-cara"));
  const state = progress(stars, opened);
  const index = (id) => SCORE_LEVELS.findIndex((item) => item.id === id);
  assert.ok(levelUnlocked(SCORE_LEVELS, index("cara-a-cara"), state));
  // As novas logo depois de uma fase com estrela abrem; a seguinte a uma nova sem estrela, não.
  assert.ok(levelUnlocked(SCORE_LEVELS, index("chute-cruzado"), state));
  assert.ok(levelUnlocked(SCORE_LEVELS, index("rolou-bateu"), state));
  assert.ok(levelUnlocked(SCORE_LEVELS, index("testada"), state));
  assert.equal(levelUnlocked(SCORE_LEVELS, index("dois-contra-um"), state), false);
  assert.equal(levelUnlocked(SCORE_LEVELS, index("triangulacao"), state), false);
  // Save sem trilha (antes da 2): o que ele já tinha aberto continua, mais o que a trilha 2 abria.
  const legacy = openedBefore(null, ["pela-ponta"], { "primeiro-toque": 1 });
  assert.ok(legacy.includes("pela-ponta") && legacy.includes("na-marca-da-cal"));
  // Save novo (já na trilha 3) não ganha nada de graça.
  assert.equal(levelUnlocked(SCORE_LEVELS, index("chute-cruzado"), progress({})), false);
});

test("cabeceio: cruzamento da ponta chega na cabeça e a cabeçada sai firme e precisa", () => {
  const game = fresh("pela-ponta");
  play(game, { x: -23.5, z: 37 });
  assert.equal(game.state.heroId, "m11");
  const tavares = game.state.actors.find((actor) => actor.id === "m9");
  const end = tavares.run.at(-1);
  const cross = play(game, end, { dur: 0.3 });
  assert.equal(cross.kind, "lofted");
  assert.ok(cross.target.y > 1.5, "o cruzamento chega na altura da cabeça");
  assert.equal(game.state.phase, "aim");
  const hero = game.state.actors.find((actor) => actor.id === game.state.heroId);
  assert.equal(hero.pose, "header");
  const header = game.planKick(stroke(game, { x: 2.7, y: 1.6 }, { goal: true, dur: 0.6 }));
  assert.equal(header.kind, "header");
  // Mesmo o traço calmo sai com força de testada (antes, 13,5 m/s: o goleiro chegava em tudo).
  assert.ok(header.speed >= 16.5, `velocidade ${header.speed}`);
  assert.ok(header.accuracy >= 0.9, `precisão ${header.accuracy}`);
});

test("cruzamento de dentro da faixa (falta lateral, bola que volta da linha de fundo) também é na cabeça; lançamento de longe segue baixo", () => {
  const side = fresh("bola-levantada");
  const tavares = side.state.actors.find((actor) => actor.id === "m9");
  const plan = side.planKick(stroke(side, tavares.run.at(-1), { dur: 0.3 }));
  assert.equal(plan.kind, "lofted");
  assert.ok(plan.target.y > 1.5);
  // De voleio: o lançamento do campo de defesa chega no pé (voleio), não na cabeça.
  const long = fresh("de-voleio");
  const runner = long.state.actors.find((actor) => actor.id === "m9");
  const ball = long.planKick(stroke(long, runner.run.at(-1), { dur: 0.35 }));
  assert.ok(ball.target.y < 1, `chega em ${ball.target.y}`);
});

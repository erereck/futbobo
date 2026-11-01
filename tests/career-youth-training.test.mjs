import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  });
  module._compile(outputText, filename);
};
const { initialState, normalizeSave } = load("../app/career/state.ts");
const { CLUBS } = load("../app/game-data.ts");
const { CYCLE_SHOP_ITEMS, cycleShopPurchaseKey, purchaseCycleShopItem } = load("../app/career/cycle-shop.ts");
const youth = load("../app/career/youth-play.ts");
const training = load("../app/career/special-training.ts");
const { SCORE_LEVELS } = load("../app/scorebobo/sim/levels.ts");

const trackIndex = (id) => youth.SCOREBOBO_TRACK.findIndex((level) => level.id === id);
const youthYears = (count) => Array.from({ length: count }, (_, index) => ({ age: 12 + index, title: `Ano ${index}`, text: "", delta: 1 }));
const youthBase = (count = 5, extra = {}) => ({ ...initialState(321), phase: "youth", youthYears: youthYears(count), overall: 55, potential: 80, ...extra });
const careerBase = (extra = {}) => ({
  ...initialState(123), phase: "career", currentClubId: CLUBS[0].id, currentLeagueId: CLUBS[0].leagueId, academyClubId: CLUBS[0].id,
  contractYears: 3, annualSalary: 500000, spendableMoney: 10000000, money: 10000000, age: 24, overall: 75, potential: 80, season: 2031,
  history: Array.from({ length: 4 }, () => ({})), ...extra,
});
/** Joga o ano atual: começa uma chance e grava a nota. */
const playYouthChance = (state, stars) => youth.recordYouthStars(youth.startYouthChance(state), stars);
const playTrainingChance = (state, stars) => training.recordTrainingStars(training.startTrainingChance(state), stars);

test("SCOREBOBO_TRACK espelha as 12 fases do Scorebobo, na mesma ordem", () => {
  assert.deepEqual(
    youth.SCOREBOBO_TRACK.map(({ id, name }) => ({ id, name })),
    SCORE_LEVELS.map(({ id, name }) => ({ id, name })),
  );
  assert.equal(youth.SCOREBOBO_TRACK.length, 12);
  assert.equal(youth.scoreboboTrackName("de-voleio"), "De voleio");
});

test("fases da base vão em ordem de dificuldade, espalhadas, e a revelação é a Final da Copa", () => {
  assert.deepEqual(youth.youthLevelIds(0), []);
  assert.deepEqual(youth.youthLevelIds(1), ["final-da-copa"]);
  assert.deepEqual(youth.youthLevelIds(2), ["primeiro-toque", "final-da-copa"]);
  assert.deepEqual(youth.youthLevelIds(5).map(trackIndex), [0, 3, 6, 8, 11]);
  assert.deepEqual(youth.youthLevelIds(6).map(trackIndex), [0, 2, 4, 7, 9, 11]);
  assert.deepEqual(youth.youthLevelIds(7).map(trackIndex), [0, 2, 4, 6, 7, 9, 11]);
  for (let count = 1; count <= 7; count += 1) {
    const ids = youth.youthLevelIds(count);
    assert.equal(ids.length, count);
    assert.equal(ids.at(-1), "final-da-copa");
    if (count >= 2) assert.equal(ids[0], "primeiro-toque");
    const indexes = ids.map(trackIndex);
    assert.ok(indexes.every((index, position) => index >= 0 && (position === 0 || index > indexes[position - 1])), `ordem crescente para ${count}`);
  }
});

test("bônus da base é a média arredondada das melhores estrelas, de 0 a 3, e pular conta 0", () => {
  const years = (stars) => stars.map((bestStars) => ({ levelId: "primeiro-toque", chancesUsed: 1, bestStars }));
  assert.equal(youth.youthPotentialBonus(years([3, 3, 3, 2, 2])), 3); // 13★ / 5 = 2,6
  assert.equal(youth.youthPotentialBonus(years([3, 3, 2, 2, 2])), 2); // 12★ / 5 = 2,4
  assert.equal(youth.youthPotentialBonus(years([3, 3, 3, 3, 3, 3, 3])), 3);
  assert.equal(youth.youthPotentialBonus(years([0, 0, 0, 0, 0])), 0);
  assert.equal(youth.youthPotentialBonus([]), 0);
  const skipped = [...years([3, 3]), ...["a", "b", "c"].map(() => ({ levelId: "final-da-copa", chancesUsed: 0, bestStars: 3, skipped: true }))];
  assert.equal(youth.youthPotentialBonus(skipped), 1); // 6★ / 5 = 1,2
});

test("escolha da base vale uma vez; desafio é sempre simulado", () => {
  const state = youthBase(6);
  const simulated = youth.chooseYouthMode(state, "simulate");
  assert.deepEqual(simulated.youthPlay, { mode: "simulate", years: [], current: 0, bonus: null });
  assert.equal(simulated.potential, state.potential);
  assert.equal(youth.chooseYouthMode(simulated, "play"), simulated);
  assert.ok(youth.isYouthPlayFinished(simulated.youthPlay));

  const played = youth.chooseYouthMode(state, "play");
  assert.equal(played.youthPlay.mode, "play");
  assert.deepEqual(played.youthPlay.years.map((year) => year.levelId), youth.youthLevelIds(6));
  assert.ok(played.youthPlay.years.every((year) => year.chancesUsed === 0 && year.bestStars === 0));
  assert.equal(played.youthPlay.current, 0);
  assert.equal(played.youthPlay.bonus, null);
  assert.equal(youth.chooseYouthMode(played, "simulate"), played);
  assert.ok(youth.isYouthPlayActive(played.youthPlay));
  assert.equal(youth.currentYouthPlayYear(played).levelId, "primeiro-toque");

  const challenge = youth.chooseYouthMode({ ...state, challengeId: "FB-20261031" }, "play");
  assert.equal(challenge.youthPlay.mode, "simulate");
});

test("chances da base nunca passam de 3, guardam a melhor nota e podem ser devolvidas", () => {
  let state = youth.chooseYouthMode(youthBase(5), "play");
  assert.equal(youth.recordYouthStars(state, 3), state, "sem chance gasta não há nota");
  state = playYouthChance(state, 1);
  state = playYouthChance(state, 2);
  state = playYouthChance(state, 0);
  assert.deepEqual(state.youthPlay.years[0], { levelId: "primeiro-toque", chancesUsed: 3, bestStars: 2 });
  assert.equal(youth.startYouthChance(state), state, "a quarta chance não existe");
  assert.equal(youth.youthYearChancesLeft(state.youthPlay.years[0]), 0);
  assert.ok(youth.isYouthYearDone(state.youthPlay.years[0]));

  const refunded = youth.refundYouthChance(state);
  assert.equal(refunded.youthPlay.years[0].chancesUsed, 2);
  assert.equal(refunded.youthPlay.years[0].bestStars, 2);
  const again = youth.startYouthChance(refunded);
  assert.equal(again.youthPlay.years[0].chancesUsed, 3);
  let empty = youth.chooseYouthMode(youthBase(5), "play");
  assert.equal(youth.refundYouthChance(empty), empty, "não devolve abaixo de 0");

  empty = playYouthChance(empty, 3);
  assert.equal(empty.youthPlay.years[0].chancesUsed, 1);
  assert.equal(youth.startYouthChance(empty), empty, "3★ resolve o ano");
  assert.equal(youth.recordYouthStars(playYouthChance(youth.chooseYouthMode(youthBase(5), "play"), 9), 9).youthPlay.years[0].bestStars, 3);
});

test("avançar exige chance gasta, não pula ano em clique duplo e o bônus entra uma vez só", () => {
  let state = youth.chooseYouthMode(youthBase(5, { potential: 80 }), "play");
  assert.equal(youth.advanceYouthYear(state), state, "ano sem jogada não avança");
  const stars = [3, 3, 3, 2, 2];
  for (const [index, value] of stars.entries()) {
    assert.equal(state.youthPlay.current, index);
    state = playYouthChance(state, value);
    const advanced = youth.advanceYouthYear(state);
    if (index < stars.length - 1) assert.equal(youth.advanceYouthYear(advanced), advanced, "clique duplo não pula o ano novo");
    state = advanced;
  }
  assert.equal(state.youthPlay.current, 5);
  assert.equal(state.youthPlay.bonus, 3);
  assert.equal(state.potential, 83);
  assert.ok(youth.isYouthPlayFinished(state.youthPlay));
  assert.equal(youth.isYouthPlayActive(state.youthPlay), false);
  assert.equal(youth.finishYouthPlay(state), state, "finish é idempotente");
  assert.equal(youth.advanceYouthYear(state), state);
  assert.equal(youth.skipRemainingYouth(state), state);
  assert.equal(youth.startYouthChance(state), state);

  const capped = youth.finishYouthPlay({ ...state, potential: 98, youthPlay: { ...state.youthPlay, bonus: null } });
  assert.equal(capped.potential, 99, "teto 99");
});

test("Simular o resto conta 0★ nos anos não jogados e mantém a nota do ano em andamento", () => {
  let state = youth.chooseYouthMode(youthBase(5, { potential: 90 }), "play");
  state = youth.advanceYouthYear(playYouthChance(state, 3));
  state = playYouthChance(state, 3); // ano 2 jogado, sem avançar
  const skipped = youth.skipRemainingYouth(state);
  const years = skipped.youthPlay.years;
  assert.deepEqual(years.map((year) => year.bestStars), [3, 3, 0, 0, 0]);
  assert.deepEqual(years.map((year) => Boolean(year.skipped)), [false, false, true, true, true]);
  assert.equal(skipped.youthPlay.current, 5);
  assert.equal(skipped.youthPlay.bonus, 1); // 6★ / 5 = 1,2
  assert.equal(skipped.potential, 91);
  assert.equal(youth.finishYouthPlay(skipped), skipped);
  assert.equal(youth.skipRemainingYouth(skipped).potential, 91);

  const all = youth.skipRemainingYouth(youth.chooseYouthMode(youthBase(6, { potential: 70 }), "play"));
  assert.equal(all.youthPlay.bonus, 0);
  assert.equal(all.potential, 70);
  const finishedEarly = youth.finishYouthPlay(youth.chooseYouthMode(youthBase(6), "play"));
  assert.equal(finishedEarly.youthPlay.current, 6);
  assert.equal(finishedEarly.youthPlay.bonus, 0);
  assert.ok(finishedEarly.youthPlay.years.every((year) => year.skipped));
});

test("treino especial sorteia o mesmo par para a mesma seed e temporada", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 400; seed += 1) {
    for (const season of [2030, 2034]) {
      const pair = training.specialTrainingLevelIds(seed, season);
      assert.deepEqual(training.specialTrainingLevelIds(seed, season), pair);
      assert.equal(pair.length, 2);
      assert.notEqual(pair[0], pair[1]);
      assert.ok(trackIndex(pair[0]) >= 0 && trackIndex(pair[0]) < trackIndex(pair[1]));
      pair.forEach((id) => seen.add(id));
    }
  }
  assert.equal(seen.size, 12, "todas as fases podem sair");
  const pairs = new Set([2027, 2031, 2035, 2039, 2043].map((season) => training.specialTrainingLevelIds(777, season).join("+")));
  assert.ok(pairs.size > 1, "temporadas diferentes mudam o par");
});

test("3★ nas duas fases dá +1 OVR, fura o teto e não repete no ciclo", () => {
  const state = careerBase({ overall: 80, potential: 80 });
  assert.equal(training.specialTrainingStatus(state, true), "available");
  let next = training.beginSpecialTraining(state);
  const key = cycleShopPurchaseKey(state, "special-training");
  assert.ok(next.economyPurchases.includes(key));
  assert.equal(next.money, state.money);
  assert.equal(next.spendableMoney, state.spendableMoney);
  assert.deepEqual(next.specialTraining, {
    season: 2031, levelIds: training.specialTrainingLevelIds(state.seed, 2031), chancesUsed: [0, 0], bestStars: [0, 0], current: 0, rewarded: null,
  });
  assert.equal(training.beginSpecialTraining(next), next, "retomar devolve o mesmo treino");
  assert.equal(training.specialTrainingStatus(next, true), "in-progress");
  assert.ok(training.isSpecialTrainingAvailable(next, true));

  next = playTrainingChance(next, 2);
  next = playTrainingChance(next, 3);
  assert.equal(training.startTrainingChance(next), next, "3★ fecha a fase");
  next = training.advanceTraining(next);
  assert.equal(training.advanceTraining(next), next, "clique duplo não pula a fase nova");
  next = playTrainingChance(next, 3);
  const done = training.advanceTraining(next);
  assert.equal(done.overall, 81);
  assert.ok(done.potential >= done.overall);
  assert.equal(done.potential, 81);
  assert.notDeepEqual(done.attributes, state.attributes);
  assert.equal(done.specialTraining.rewarded, true);
  assert.equal(done.specialTraining.current, 2);
  assert.equal(training.completeSpecialTraining(done), done, "o +1 sai uma vez só");
  assert.equal(training.beginSpecialTraining(done), done, "uma vez por ciclo");
  assert.equal(training.specialTrainingStatus(done, true), "rewarded");
  assert.equal(training.isSpecialTrainingAvailable(done, true), false);

  const nextCycle = { ...done, season: 2035 };
  assert.equal(training.specialTrainingStatus(nextCycle, true), "available");
  assert.equal(training.beginSpecialTraining(nextCycle).specialTraining.season, 2035);
});

test("3★ e 2★ não dão nada; 99, desafio e falta de WebGL bloqueiam", () => {
  let state = training.beginSpecialTraining(careerBase({ overall: 77, potential: 84 }));
  state = training.advanceTraining(playTrainingChance(state, 3));
  state = playTrainingChance(playTrainingChance(state, 2), 1);
  assert.equal(training.canSpecialTrainingReward(state.specialTraining), true);
  const done = training.advanceTraining(state);
  assert.equal(done.overall, 77);
  assert.equal(done.potential, 84);
  assert.equal(done.attributes, state.attributes);
  assert.equal(done.specialTraining.rewarded, false);
  assert.deepEqual(done.specialTraining.bestStars, [3, 2]);
  assert.equal(training.specialTrainingStatus(done, true), "no-reward");
  assert.equal(training.beginSpecialTraining(done), done);

  const early = training.advanceTraining(playTrainingChance(training.beginSpecialTraining(careerBase()), 1));
  assert.equal(training.canSpecialTrainingReward(early.specialTraining), false);

  const maxed = careerBase({ overall: 99, potential: 99 });
  assert.equal(training.specialTrainingStatus(maxed, true), "maxed");
  assert.equal(training.isSpecialTrainingAvailable(maxed, true), false);
  assert.equal(training.beginSpecialTraining(maxed), maxed);

  // A segunda ★★★ já paga o +1, sem esperar o "Continuar" (o app pode fechar no cartão de resultado).
  const second = playTrainingChance(training.advanceTraining(playTrainingChance(training.beginSpecialTraining(careerBase({ overall: 77, potential: 84 })), 3)), 3);
  assert.equal(second.specialTraining.rewarded, true);
  assert.equal(second.overall, 78);
  assert.equal(training.advanceTraining(second), second, "o Continuar depois não soma de novo");
  assert.equal(training.recordTrainingStars(second, 3), second);
  assert.equal(normalizeSave(JSON.parse(JSON.stringify(second))).specialTraining.rewarded, true);

  const almost = training.beginSpecialTraining(careerBase({ overall: 98, potential: 98 }));
  const top = training.advanceTraining(playTrainingChance(training.advanceTraining(playTrainingChance(almost, 3)), 3));
  assert.equal(top.overall, 99);
  assert.equal(top.potential, 99);

  const challenge = careerBase({ challengeId: "FB-20261031" });
  assert.equal(training.specialTrainingStatus(challenge, true), "challenge");
  assert.equal(training.isSpecialTrainingAvailable(challenge, true), false);
  assert.equal(training.beginSpecialTraining(challenge), challenge);

  assert.equal(training.specialTrainingStatus(careerBase(), false), "no-webgl");
  assert.equal(training.isSpecialTrainingAvailable(careerBase(), false), false);
});

test("chances do treino: até 3 por fase, refund e nota só com chance gasta", () => {
  let state = training.beginSpecialTraining(careerBase());
  assert.equal(training.recordTrainingStars(state, 3), state);
  assert.equal(training.refundTrainingChance(state), state);
  state = playTrainingChance(state, 1);
  state = playTrainingChance(state, 0);
  state = playTrainingChance(state, 2);
  assert.deepEqual(state.specialTraining.chancesUsed, [3, 0]);
  assert.deepEqual(state.specialTraining.bestStars, [2, 0]);
  assert.equal(training.startTrainingChance(state), state);
  assert.equal(training.specialTrainingChancesLeft(state.specialTraining), 0);
  const refunded = training.refundTrainingChance(state);
  assert.deepEqual(refunded.specialTraining.chancesUsed, [2, 0]);
  const quit = training.completeSpecialTraining(refunded);
  assert.equal(quit.specialTraining.rewarded, false);
  assert.equal(quit.overall, refunded.overall);
});

test("a loja mostra o Treino especial grátis e a compra não aplica nada", () => {
  const item = CYCLE_SHOP_ITEMS.find((candidate) => candidate.id === "special-training");
  assert.equal(item.name, "Treino especial");
  assert.equal(item.price, 0);
  assert.equal(item.available, true);
  assert.notEqual(item.tone, "locked");
  const state = careerBase();
  assert.equal(purchaseCycleShopItem(state, "special-training").state, state);
});

test("save antigo e lixo não quebram a base jogada nem o treino", () => {
  const legacy = { ...initialState(55), phase: "career" };
  delete legacy.youthPlay;
  delete legacy.specialTraining;
  const restored = normalizeSave(JSON.parse(JSON.stringify(legacy)));
  assert.equal(restored.version, 7);
  assert.equal(restored.youthPlay, null);
  assert.equal(restored.specialTraining, null);
  const minimal = normalizeSave({ version: 7, phase: "identity", name: "Jogador", season: 2027, position: "MEI" });
  assert.equal(minimal.youthPlay, null);
  assert.equal(minimal.specialTraining, null);

  for (const junk of ["x", 3, [], { mode: "play" }, { mode: "jogar", years: [] }, { mode: "play", years: [{ levelId: "nao-existe" }] }, { mode: "play", years: [null] }]) {
    assert.equal(normalizeSave({ ...legacy, youthPlay: junk }).youthPlay, null, JSON.stringify(junk));
  }
  assert.deepEqual(normalizeSave({ ...legacy, youthPlay: { mode: "simulate", years: [1, 2], current: 9, bonus: 3 } }).youthPlay, { mode: "simulate", years: [], current: 0, bonus: null });
  assert.deepEqual(normalizeSave({ ...legacy, youthPlay: {
    mode: "play", current: 9, bonus: null,
    years: [{ levelId: "primeiro-toque", chancesUsed: 9, bestStars: -4 }, { levelId: "final-da-copa", chancesUsed: 1.4, bestStars: 2.6, skipped: "sim" }],
  } }).youthPlay, {
    mode: "play", current: 1, bonus: null,
    years: [{ levelId: "primeiro-toque", chancesUsed: 3, bestStars: 0 }, { levelId: "final-da-copa", chancesUsed: 1, bestStars: 3 }],
  });
  assert.deepEqual(normalizeSave({ ...legacy, youthPlay: { mode: "play", current: 0, bonus: 7, years: [{ levelId: "de-voleio", chancesUsed: 0, bestStars: 3, skipped: true }] } }).youthPlay, {
    mode: "play", current: 1, bonus: 3, years: [{ levelId: "de-voleio", chancesUsed: 0, bestStars: 0, skipped: true }],
  });
  assert.deepEqual(normalizeSave({ ...legacy, youthPlay: { mode: "play", current: 0, bonus: null, years: [] } }).youthPlay, { mode: "play", current: 0, bonus: 0, years: [] });

  for (const junk of ["x", { season: "2031", levelIds: ["primeiro-toque", "de-voleio"] }, { season: 2031, levelIds: ["primeiro-toque", "primeiro-toque"] }, { season: 2031, levelIds: ["primeiro-toque"] }, { season: 2031, levelIds: ["primeiro-toque", "x"] }]) {
    assert.equal(normalizeSave({ ...legacy, specialTraining: junk }).specialTraining, null, JSON.stringify(junk));
  }
  assert.deepEqual(normalizeSave({ ...legacy, specialTraining: { season: 2031, levelIds: ["primeiro-toque", "de-voleio"], chancesUsed: [5, -1], bestStars: "x", current: 4, rewarded: "sim" } }).specialTraining, {
    season: 2031, levelIds: ["primeiro-toque", "de-voleio"], chancesUsed: [3, 0], bestStars: [0, 0], current: 1, rewarded: null,
  });
  assert.equal(normalizeSave({ ...legacy, specialTraining: { season: 2031, levelIds: ["primeiro-toque", "de-voleio"], chancesUsed: [1, 1], bestStars: [3, 3], current: 0, rewarded: true } }).specialTraining.current, 2);

  let inProgress = youth.chooseYouthMode(youthBase(6), "play");
  inProgress = youth.advanceYouthYear(playYouthChance(inProgress, 2));
  inProgress = playYouthChance(inProgress, 1);
  inProgress = { ...training.beginSpecialTraining({ ...inProgress, season: 2031, overall: 70 }), season: 2031 };
  inProgress = playTrainingChance(inProgress, 3);
  const roundTrip = normalizeSave(JSON.parse(JSON.stringify(inProgress)));
  assert.deepEqual(roundTrip.youthPlay, inProgress.youthPlay);
  assert.deepEqual(roundTrip.specialTraining, inProgress.specialTraining);
});

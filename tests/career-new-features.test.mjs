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
const { purchaseCycleShopItem } = load("../app/career/cycle-shop.ts");
const { requestPlayerLoan, applyAcceptedTransfer, buildRenewalOffer, generateTransferOffers } = load("../app/career/transfer-market.ts");
const base = () => ({ ...initialState(123), phase: "career", currentClubId: CLUBS[0].id, currentLeagueId: CLUBS[0].leagueId, academyClubId: CLUBS[0].id, contractYears: 3, annualSalary: 500000, spendableMoney: 10000000, money: 10000000, age: 24, overall: 75 });

test("pedidos de promessa, reserva e rotação são aprovados e geram empréstimos", () => {
  for (const role of ["promessa", "reserva", "rotacao"]) for (let seed = 1; seed <= 20; seed++) {
    const result = requestPlayerLoan({ ...base(), seed, squadRole: role });
    assert.equal(result.transferStatus.chance, 100);
    assert.equal(result.phase, "transfer");
    assert.ok(result.transferMarketOffers.length > 0);
    assert.ok(result.transferMarketOffers.every((offer) => offer.type === "loan"));
  }
  for (const age of [30, 36, 41]) {
    const veteran = requestPlayerLoan({ ...base(), age, overall: 60, squadRole: "reserva" });
    assert.ok(veteran.transferMarketOffers.length > 0);
    assert.ok(veteran.transferMarketOffers.every((offer) => offer.type === "loan"));
  }
  const onLoan = { ...base(), loanParentClubId: CLUBS[1].id };
  assert.equal(requestPlayerLoan(onLoan), onLoan);
});

test("ajuste vale para próximo contrato, não para empréstimo e sobrevive ao save", () => {
  for (const [item, delta] of [["contract-shorter", -1], ["contract-longer", 1]]) {
    const state = base();
    const purchased = purchaseCycleShopItem(state, item).state;
    assert.equal(purchased.contractYears, 3);
    assert.equal(normalizeSave(purchased).nextContractYearsAdjustment, delta);
    assert.equal(purchaseCycleShopItem(purchased, delta === 1 ? "contract-shorter" : "contract-longer").state, purchased);
    const original = buildRenewalOffer({ ...state, contractYears: 0 });
    const adjusted = buildRenewalOffer({ ...purchased, contractYears: 0 });
    assert.equal(adjusted.contractYears, Math.max(1, original.contractYears + delta));
    assert.equal(applyAcceptedTransfer(purchased, adjusted).nextContractYearsAdjustment, 0);
    const loan = generateTransferOffers(purchased, 123, { mode: "loan" })[0];
    const moved = applyAcceptedTransfer(purchased, loan);
    assert.equal(moved.nextContractYearsAdjustment, delta);
    assert.equal(moved.annualSalary, state.annualSalary);
  }
});

test("rescisão cobra 3 milhões, limpa empréstimo e abre mercado livre", () => {
  const state = { ...base(), loanParentClubId: CLUBS[1].id, loanParentLeagueId: CLUBS[1].leagueId, loanEndSeason: 2030 };
  const result = purchaseCycleShopItem(state, "release");
  assert.equal(result.state.spendableMoney, state.spendableMoney - 3000000);
  assert.equal(result.state.phase, "transfer");
  assert.equal(result.state.isFreeAgent, true);
  assert.equal(result.state.contractYears, 0);
  assert.equal(result.state.loanParentClubId, "");
  assert.ok(result.state.transferMarketOffers.length > 0);
  assert.ok(result.state.transferMarketOffers.every((offer) => offer.type === "free-agent"));
  assert.equal(purchaseCycleShopItem(result.state, "release").state, result.state);
});

test("bônus de elite começa no 88 e mantém limites e inteiros", () => {
  const { eliteSeasonProduction } = load("../app/career/season-production.ts");
  assert.equal(eliteSeasonProduction(20, 87), 20);
  assert.equal(eliteSeasonProduction(20, 88), 24);
  assert.equal(eliteSeasonProduction(0, 99), 0);
  assert.equal(eliteSeasonProduction(13, 88), 16);
});

test("novo catálogo tem eventos únicos com escolhas válidas", () => {
  const { NEW_CAREER_EVENTS } = load("../app/new-career-events.ts");
  const { ALL_PRO_EVENTS } = load("../app/career/state.ts");
  assert.ok(NEW_CAREER_EVENTS.length >= 10);
  assert.equal(new Set(ALL_PRO_EVENTS.map((event) => event.id)).size, ALL_PRO_EVENTS.length);
  assert.ok(NEW_CAREER_EVENTS.every((event) => event.choices.length >= 2 && ALL_PRO_EVENTS.includes(event)));
});

test("atacante registra desarmes na simulação da temporada", () => {
  const { simulateSeason } = load("../app/career/simulation.ts");
  const state = { ...base(), position: "ATA", squadRole: "titular" };
  const event = { id: "test", icon: "⚽", tag: "TESTE", title: "Teste", description: "", choices: [] };
  const simulated = simulateSeason(state, event, {}, "Jogar", "Jogou", null, "simulate");
  assert.ok(simulated.lastResult.tackles > 0);
});

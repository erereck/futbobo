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
const { CLUBS, leagueById } = load("../app/game-data.ts");
const { purchaseCycleShopItem } = load("../app/career/cycle-shop.ts");
const { requestPlayerLoan, applyAcceptedTransfer, buildRenewalOffer, generateTransferOffers, settleSeasonScouting, completeLoanReturn } = load("../app/career/transfer-market.ts");
const { applyEffect } = load("../app/career/events.ts");
const { initialContinentalSlot, isEuropeanClub } = load("../app/career/academy.ts");
const { clubById, seeded } = load("../app/career/shared.ts");
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

function scoutingSeason(clubId, competitionId, { mvp = true, champion = true, ...overrides } = {}) {
  const club = clubById(clubId);
  const competitionName = {
    domesticCup: leagueById(club.leagueId).cupName,
    libertadores: "CONMEBOL Libertadores",
    europaLeague: "Europa League",
  }[competitionId];
  const state = { ...base(), phase: "season-result", season: 2031, currentClubId: club.id, currentLeagueId: club.leagueId, ...overrides };
  const season = state.season - 1;
  const match = { id: `club-${competitionId}-${season}`, season, source: "club", stageName: "Final", competitionId, competitionName };
  const record = {
    ...state.stats, clubId, leagueId: club.leagueId, season, age: state.age - 1, position: state.position,
    overall: state.overall, appearances: 30, averageRating: 8.1, awards: [],
    competitions: competitionId ? [{ id: competitionId, name: competitionName, champion, stage: champion ? "CAMPEÃO" : "Vice" }] : [],
    botaoResults: competitionId ? [{ match, result: { manOfTheMatch: mvp } }] : [],
  };
  return { ...state, lastResult: record, history: [record] };
}

test("atenção começa em zero, cresce devagar e dá +8 global uma vez no OVR 72", () => {
  const initial = { ...base(), overall: 71, potential: 85 };
  assert.equal(initial.attention.global, 0);
  assert.deepEqual(initial.attention.continental, {});
  const first = purchaseCycleShopItem(initial, "overall").state;
  assert.equal(first.overall, 72);
  assert.equal(first.attention.global, 8);
  const declined = applyEffect(first, { ovr: -2 });
  const recovered = applyEffect(normalizeSave(declined), { ovr: 2 });
  assert.equal(recovered.attention.global, 8);
  const steady = settleSeasonScouting(scoutingSeason("volta-redonda", null));
  assert.equal(steady.attention.global, 0);
  assert.equal(steady.attention.continental.SOUTH_AMERICA, 1);
  assert.deepEqual(steady.transferOffers, []);
  const legacy = { ...declined, history: [{ season: 2029, overall: 72 }] };
  delete legacy.attention;
  assert.equal(normalizeSave(legacy).attention.global, 8);
});

test("Copa do Brasil gera propostas locais mesmo sem pedido e premia mais que a Copa Venezuela", () => {
  const volta = scoutingSeason("volta-redonda", "domesticCup", { mvp: false });
  const pending = { ...volta, pendingBotaoMatches: [volta.lastResult.botaoResults[0].match] };
  assert.equal(settleSeasonScouting(pending), pending);
  const champion = settleSeasonScouting(volta);
  assert.equal(champion.transferRequested, false);
  assert.ok(champion.transferOffers.length > 0);
  assert.ok(champion.transferMarketOffers.every((offer) => offer.type === "permanent"
    && clubById(offer.clubId).leagueId === "brasileirao" && clubById(offer.clubId).reputation >= 3));
  assert.equal(settleSeasonScouting(normalizeSave(champion)).attention.global, champion.attention.global);

  const brazil = settleSeasonScouting(scoutingSeason("volta-redonda", "domesticCup", { champion: false }));
  const argentina = settleSeasonScouting(scoutingSeason("racing-club", "domesticCup", { champion: false }));
  const venezuela = settleSeasonScouting(scoutingSeason("carabobo", "domesticCup", { champion: false }));
  assert.equal(brazil.attention.global, 1);
  assert.equal(argentina.attention.continental.SOUTH_AMERICA, brazil.attention.continental.SOUTH_AMERICA);
  assert.ok(venezuela.attention.continental.SOUTH_AMERICA < brazil.attention.continental.SOUTH_AMERICA);

  const { simulateSeason } = load("../app/career/simulation.ts");
  const event = { id: "test", title: "Teste" };
  const seed = Array.from({ length: 10_000 }, (_, index) => index + 1)
    .find((candidate) => seeded(candidate, volta.season * 41) < 0.003);
  const simulated = simulateSeason({ ...volta, seed, lastResult: null, history: [], overall: 69 }, event, {}, "Jogar", "Jogou", null, "simulate");
  assert.ok(simulated.lastResult.competitions.some((competition) => competition.id === "domesticCup" && competition.champion));
  assert.ok(simulated.transferMarketOffers.some((offer) => offer.reason === "scouted" && clubById(offer.clubId).leagueId === "brasileirao"));
});

test("Libertadores abre Europa e Arábia, protege o Flamengo do Palmeiras e atrai clubes de elite para sub-23", () => {
  const state = scoutingSeason("flamengo", "libertadores", {
    age: 21, overall: 80, transferOffers: ["palmeiras"],
    attention: { ...base().attention, global: 25 },
  });
  const settled = settleSeasonScouting(state);
  const clubs = settled.transferOffers.map(clubById);
  assert.ok(settled.attention.global >= 50);
  assert.ok(clubs.some((club) => isEuropeanClub(club) && club.strength >= 88));
  assert.ok(clubs.some((club) => club.countryId === "arabia-saudita"));
  assert.ok(clubs.every((club) => club.countryId !== "brasil"));
  assert.equal(settleSeasonScouting(settled), settled);
  assert.ok(Array.from({ length: 24 }, (_, seed) => seed + 1)
    .some((seed) => settleSeasonScouting({ ...state, seed }).transferOffers.includes("real-madrid")));

  const monitored = { ...settled, currentClubId: "porto", currentLeagueId: "primeira" };
  assert.ok(generateTransferOffers(monitored, 123, { mode: "permanent" })
    .some((offer) => isEuropeanClub(clubById(offer.clubId)) && clubById(offer.clubId).strength >= 88));

  const smaller = settleSeasonScouting(scoutingSeason("volta-redonda", "libertadores"));
  assert.ok(smaller.transferOffers.some((id) => isEuropeanClub(clubById(id))));
  assert.ok(smaller.transferOffers.some((id) => clubById(id).countryId === "brasil" && clubById(id).reputation >= 4));
});

test("destaque do Porto na Europa League recebe propostas de Champions pelo clube dono do passe", () => {
  const state = scoutingSeason("porto", "europaLeague", {
    loanParentClubId: "flamengo", loanEndSeason: 2031, overall: 80,
  });
  const settled = settleSeasonScouting(state);
  assert.ok(settled.transferMarketOffers.length > 0);
  assert.ok(settled.transferMarketOffers.every((offer) => offer.fromClubId === "flamengo"
    && initialContinentalSlot(clubById(offer.clubId)) === "champions"));
  assert.deepEqual(completeLoanReturn(settled).transferMarketOffers, settled.transferMarketOffers);
});

test("atuação e prêmios na Copa do Mundo abrem o mercado europeu de ponta direto", () => {
  const state = scoutingSeason("volta-redonda", null, { overall: 74 });
  const worldCup = (goals, assists) => ({
    season: state.lastResult.season, name: "Copa do Mundo", tournamentStats: { appearances: 6, goals, assists },
  });
  const standout = settleSeasonScouting({ ...state, nationalHistory: [worldCup(2, 3)] });
  const winner = settleSeasonScouting({ ...state, nationalHistory: [worldCup(6, 5)] });
  assert.ok(standout.transferMarketOffers.some((offer) => isEuropeanClub(clubById(offer.clubId))));
  assert.ok(winner.attention.global > standout.attention.global);
  for (const award of ["Artilheiro da Copa do Mundo", "Líder de Assistências da Copa do Mundo"]) {
    assert.equal(winner.awardCabinet[award], 1);
    assert.ok(winner.history.at(-1).awards.includes(award));
    assert.ok(winner.lastResult.awards.includes(award));
    assert.equal(settleSeasonScouting(normalizeSave(winner)).awardCabinet[award], 1);
  }
  assert.ok(winner.transferMarketOffers.every((offer) => isEuropeanClub(clubById(offer.clubId)) && clubById(offer.clubId).strength >= 85));
  assert.equal(winner.transferRequested, false);
  const quiet = settleSeasonScouting({ ...state, nationalHistory: [worldCup(1, 0)] });
  assert.deepEqual(quiet.transferOffers, []);
});

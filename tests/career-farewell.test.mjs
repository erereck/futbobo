import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

stubBrowser();
const { CLUBS } = loadTs("app/game-data.ts");
const { initialState } = loadTs("app/career/state.ts");
const { simulateSeason } = loadTs("app/career/simulation.ts");
const { buildSponsorEvent } = loadTs("app/career/events.ts");
const { sponsorOfferPool, mergeEffects, describeEffects } = loadTs("app/career/performance.ts");
const { SPONSOR_BRANDS } = loadTs("app/career/sponsors.ts");
const ban = loadTs("app/career/football-ban.ts");
const veteran = loadTs("app/career/veteran.ts");
const farewell = loadTs("app/career/farewell.ts");
const script = loadTs("app/farewell/farewell-script.ts");

const club = CLUBS.find((item) => item.id === "flamengo") ?? CLUBS[0];
const other = CLUBS.find((item) => item.id !== club.id && item.countryId !== club.countryId) ?? CLUBS[1];
const event = { id: "teste", icon: "⚽", tag: "TESTE", title: "Teste", description: "", choices: [] };

function base(extra = {}) {
  return {
    ...initialState(4242),
    phase: "career",
    name: "Rafael Moura",
    currentClubId: club.id,
    currentLeagueId: club.leagueId,
    academyClubId: club.id,
    contractYears: 3,
    annualSalary: 900_000,
    age: 27,
    overall: 80,
    potential: 88,
    position: "CA",
    squadRole: "titular",
    reputation: 60,
    followers: 2_000_000,
    ...extra,
  };
}

function season(year, clubId, titles = 0) {
  return {
    season: year, age: 20, clubId, leagueId: club.leagueId, position: "CA", overall: 80, title: titles > 0, eventTitle: "", awards: [], awardNominations: [],
    squadRole: "titular", performanceScore: 70, marketValue: 0, development: 0, botaoResults: [], averageRating: 7, manOfTheMatchAwards: 0, medicalRecord: null,
    appearances: 40, goals: 15, assists: 6, cleanSheets: 0, yellowCards: 2, redCards: 0, tackles: 10,
    competitions: Array.from({ length: titles }, (_, index) => ({ id: index ? "domesticCup" : "domesticLeague", name: index ? "Copa do Brasil" : "Brasileirão", icon: "", stage: "CAMPEÃO", champion: true })),
  };
}

test("casa de apostas: paga 2,5× mais, adianta luvas e tem 25% de esquema com 2 anos de banimento", () => {
  // Uma reputação em que as três casas de apostas aparecem no sorteio.
  let found = null;
  for (let salt = 0; salt < 400 && !found; salt += 1) {
    const state = base({ reputation: 22, followers: 10_000, season: 2030 + salt });
    const sponsorEvent = buildSponsorEvent(state);
    const betting = sponsorEvent.choices.find((choice) => choice.luck);
    if (betting) found = { state, betting };
  }
  assert.ok(found, "nenhuma casa de apostas apareceu no sorteio");
  const { betting } = found;
  assert.equal(betting.luck.chance, 100 - ban.BETTING_SCANDAL_CHANCE);
  assert.equal(ban.BETTING_SCANDAL_CHANCE, 25);
  assert.equal(betting.luck.failureEffect.banSeasons, 2);
  assert.ok(betting.luck.successEffect.sponsorBrand);
  assert.ok(betting.luck.successEffect.money > 0, "luvas na assinatura");
  assert.match(betting.hint, /25%/);
  // O valor anual é 2,5× o de uma marca comum na mesma conta.
  const brand = SPONSOR_BRANDS.find((item) => item.name === betting.luck.successEffect.sponsorBrand);
  const plain = { ...brand, controversial: undefined };
  const reachMultiplier = 0.72 + Math.min(1.8, Math.log10(found.state.followers) / 5);
  const reputationMultiplier = 0.65 + found.state.reputation / 120;
  const expected = Math.round(plain.baseValue * reachMultiplier * reputationMultiplier * ban.BETTING_PAY_MULTIPLIER / 10_000) * 10_000;
  assert.equal(betting.luck.successEffect.sponsorValue, expected);
  // O texto do esquema não acusa a marca: quem cai é o jogador.
  assert.doesNotMatch(betting.luck.failureText, /esquema da|manipulação da/);
  assert.ok(sponsorOfferPool(found.state, 1).length > 0);
});

test("banimento: a temporada conta, mas contrato, salário e patrocínio acabam e o mercado fecha por 2 anos", () => {
  const sponsor = { id: "x", brand: "bet365", startSeason: 2030, endSeason: 2033, annualValue: 3_000_000, signedAtFollowers: 0, status: "active" };
  const state = base({ season: 2030, activeSponsor: sponsor });
  const effect = mergeEffects({}, { banSeasons: 2, reputation: -18 });
  assert.ok(describeEffects(effect).some((line) => line.includes("Banido do futebol por 2 anos")));
  const after = simulateSeason(state, event, effect, "Assinar", "Pego", "failure", "simulate");
  assert.equal(after.season, 2031);
  assert.equal(after.history.length, state.history.length + 1, "a temporada jogada fica no histórico");
  assert.equal(after.forcedFreeAgentUntilSeason, 2033);
  assert.ok(ban.isBannedFromFootball(after));
  assert.equal(after.isFreeAgent, true);
  assert.equal(after.contractYears, 0);
  assert.equal(after.annualSalary, 0);
  assert.equal(after.activeSponsor, null);
  assert.equal(after.sponsorHistory[0].status, "terminated");
  assert.equal(after.transferOffers.length, 0);
  assert.equal(after.transferMarketOffers.length, 0);
  assert.match(after.transferStatus.headline, /Banido por 2 anos/);
});

test("depois dos 40 a carreira só acaba sozinha com overall abaixo de 78", () => {
  assert.equal(veteran.forcedRetirement(40, 77), true);
  assert.equal(veteran.forcedRetirement(40, 78), false);
  assert.equal(veteran.forcedRetirement(43, 90), false);
  assert.equal(veteran.forcedRetirement(39, 60), false);
  // 39 → 40 com nível alto: segue; com nível baixo: encerra.
  const strong = simulateSeason(base({ age: 39, overall: 92, potential: 92 }), event, {}, "Jogar", "Jogou", null, "simulate");
  assert.equal(strong.age, 40);
  assert.ok(strong.overall >= 78);
  assert.equal(strong.retireAfterSeason, false);
  const weak = simulateSeason(base({ age: 39, overall: 72, potential: 80 }), event, {}, "Jogar", "Jogou", null, "simulate");
  assert.equal(weak.retireAfterSeason, true);
  // Aos 41 ainda em alto nível: mais uma temporada.
  const older = simulateSeason(base({ age: 41, overall: 95, potential: 95 }), event, {}, "Jogar", "Jogou", null, "simulate");
  assert.equal(older.age, 42);
  assert.equal(older.retireAfterSeason, false);
});

test("lenda do clube: 7 temporadas seguidas, 3 títulos pelo clube e torcida que ama", () => {
  const history = [season(2020, other.id, 2), ...Array.from({ length: 7 }, (_, index) => season(2021 + index, club.id, index % 3 === 0 ? 1 : 0))];
  const legend = base({ history, fanSupport: 90, season: 2028 });
  assert.equal(farewell.clubLegendStatus(legend, club.id).seasons, 7);
  assert.equal(farewell.clubLegendStatus(legend, club.id).titles, 3);
  assert.equal(farewell.clubLegendStatus(legend, club.id).legend, true);
  assert.equal(farewell.clubLegendStatus({ ...legend, fanSupport: 70 }, club.id).legend, false);
  assert.equal(farewell.clubLegendStatus({ ...legend, history: history.slice(0, -1) }, club.id).legend, false, "6 temporadas não bastam");
  // Os títulos são pelo clube: dois títulos em outro clube não contam.
  const twoTitles = history.map((record, index) => (index === 1 ? season(record.season, club.id, 0) : record));
  assert.equal(farewell.clubLegendStatus({ ...legend, history: twoTitles }, club.id).legend, false);
  // Uma temporada fora no meio quebra a sequência.
  const broken = [...history.slice(0, 4), season(2024, other.id), ...history.slice(5)];
  assert.ok(farewell.clubLegendStatus({ ...legend, history: broken }, club.id).seasons < 7);

  const transfer = { type: "permanent", clubId: other.id };
  assert.equal(farewell.farewellDue(legend, club.id, transfer), true);
  assert.equal(farewell.farewellDue(legend, club.id, null), true, "aposentadoria também");
  assert.equal(farewell.farewellDue(legend, club.id, { type: "loan", clubId: other.id }), false, "empréstimo não é despedida");
  assert.equal(farewell.farewellDue(legend, club.id, { type: "renewal", clubId: club.id }), false);
  assert.equal(farewell.farewellDue({ ...legend, forcedFreeAgentUntilSeason: 2030 }, club.id, transfer), false, "banido não tem festa");
  assert.equal(farewell.farewellDue(legend, other.id, transfer), false);

  const input = farewell.buildFarewellInput(legend, club, other, "transfer");
  assert.equal(input.stats.seasons, 7);
  assert.equal(input.stats.titles, 3);
  assert.equal(input.stats.appearances, 7 * 40);
  assert.equal(input.stats.goals, 7 * 15);
  assert.equal(input.stats.from, 2021);
  assert.equal(input.stats.to, 2027);
  assert.ok(input.stats.titleLines[0].includes("Brasileirão"));
  assert.ok(input.teammates.length > 0 && input.teammates.length <= 10);
  assert.ok(input.teammates.every((mate) => mate.number !== legend.number));
  assert.equal(new Set(input.teammates.map((mate) => mate.number)).size, input.teammates.length);
  assert.equal(input.destination.shortName, other.shortName);
  assert.equal(input.player.shortName, "Moura");
});

test("conquistas novas: Lenda do Clube e Imortal", () => {
  const { getUnlockedAchievements } = loadTs("app/achievements.ts");
  const ids = (metrics) => getUnlockedAchievements(metrics, []).map((item) => item.id);
  assert.ok(ids({ clubLegend: true }).includes("lenda-do-clube"));
  assert.ok(!ids({ clubLegend: false }).includes("lenda-do-clube"));
  assert.ok(ids({ age: 42, retired: false }).includes("imortal"));
  assert.ok(!ids({ age: 42, retired: true }).includes("imortal"));
  assert.ok(!ids({ age: 41, retired: false }).includes("imortal"));
});

test("roteiro da despedida: marcas em ordem, textos e torcida subindo", () => {
  const legend = base({ history: Array.from({ length: 8 }, (_, index) => season(2021 + index, club.id, 1)), fanSupport: 95, season: 2029 });
  const timeline = script.buildFarewellTimeline(farewell.buildFarewellInput(legend, club, null, "retirement"));
  assert.equal(timeline.thanks, "Obrigado, Moura");
  assert.match(timeline.board, /OBRIGADO, MOURA/);
  assert.match(timeline.kicker, /ÚLTIMA NOITE/);
  const marks = Object.values(script.FAREWELL_MARKS);
  assert.deepEqual([...marks].sort((a, b) => a - b), marks, "marcas em ordem");
  assert.ok(marks.every((mark) => mark < script.FAREWELL_DURATION));
  for (let index = 1; index < timeline.beats.length; index += 1) assert.equal(timeline.beats[index].start, timeline.beats[index - 1].end);
  assert.equal(script.farewellBeatAt(timeline, script.FAREWELL_DURATION + 1).id, "end");
  assert.equal(timeline.stats.length, 4);
  assert.equal(timeline.stats[3].value, 8);
  // A torcida nunca baixa antes do "Obrigado" e chega ao máximo nele.
  let previous = 0;
  for (let time = 0; time < script.FAREWELL_MARKS.sky; time += 0.1) {
    const level = script.crowdLevel(time);
    assert.ok(level >= previous - 1e-9);
    previous = level;
  }
  assert.equal(script.crowdLevel(script.FAREWELL_MARKS.sky + 1), 1);
  assert.equal(script.farewellStatIndex(4), -1);
  assert.equal(script.farewellStatIndex(5.1), 0);
  assert.equal(script.farewellStatIndex(11), 3);
});

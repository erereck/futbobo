import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

stubBrowser();
const peneira = loadTs("app/career/peneira.ts");
const { peneiraMatchSetup } = loadTs("app/career/peneira-match.ts");
const { initialState, normalizeSave } = loadTs("app/career/state.ts");
const { signProfessionalForSimulation } = loadTs("app/career/simulation.ts");
const { CLUBS } = loadTs("app/game-data.ts");
const { DEFAULT_PLAYER_APPEARANCE } = loadTs("app/player-appearance.ts");

const club = (id) => CLUBS.find((item) => item.id === id);
const play = (state, index, facts) => peneira.recordPeneiraResult(state, index, { outcome: "win", goalsFor: 3, goalsAgainst: 1, playerGoals: 1, playerAssists: 0, manOfTheMatch: false, simulated: false, ...facts });

test("peneira: rua, quadra e campo, sempre nessa ordem, e a mesma seed dá a mesma peneira", () => {
  const first = peneira.createPeneira("brasil", 1234);
  assert.deepEqual(first, peneira.createPeneira("brasil", 1234));
  assert.deepEqual(first.matches.map((match) => match.stage), ["street", "futsal", "field"]);
  assert.equal(first.matches[0].fieldTheme, "street");
  assert.ok([0, 1, 2].includes(first.matches[0].streetVariant));
  assert.ok(["futsal-blue", "futsal-orange"].includes(first.matches[1].fieldTheme));
  assert.ok(["classic", "vertical", "checker", "diagonal"].includes(first.matches[2].fieldTheme));
  // Jogos 1 e 2 contra times inventados; o 3 é um clube de verdade do país.
  assert.equal(first.matches[0].opponent.clubId, undefined);
  assert.equal(first.matches[1].opponent.clubId, undefined);
  assert.equal(club(first.matches[2].opponent.clubId).countryId, "brasil");
  assert.equal(first.offers, null);
  assert.equal(peneira.peneiraCurrentIndex(first), 0);
});

test("peneira fora do Brasil: times inventados com cidade do país e clube de verdade de lá no campo", () => {
  for (const countryId of ["argentina", "inglaterra", "alemanha", "japao", "franca"]) {
    const state = peneira.createPeneira(countryId, 77);
    const cities = new Set(CLUBS.filter((item) => item.countryId === countryId).map((item) => item.city));
    for (const match of state.matches.slice(0, 2)) {
      assert.ok([...cities].some((city) => match.opponent.name.includes(city)), `${countryId}: ${match.opponent.name}`);
      assert.ok(match.opponent.abbr.length >= 2 && match.opponent.abbr.length <= 4);
    }
    assert.equal(club(state.matches[2].opponent.clubId).countryId, countryId);
  }
});

test("nota do olheiro: gol e assistência do seu botão pesam; W.O. é 3; sempre entre 3 e 10", () => {
  const base = { outcome: "draw", goalsFor: 1, goalsAgainst: 1, playerGoals: 0, playerAssists: 0, manOfTheMatch: false };
  const plain = peneira.peneiraRating(base);
  assert.ok(peneira.peneiraRating({ ...base, playerGoals: 1 }) > plain + 1);
  assert.ok(peneira.peneiraRating({ ...base, playerAssists: 1 }) > plain + 0.5);
  assert.ok(peneira.peneiraRating({ ...base, outcome: "win" }) > peneira.peneiraRating({ ...base, outcome: "loss" }));
  assert.equal(peneira.peneiraRating({ ...base, walkover: true }), 3);
  assert.equal(peneira.peneiraRating({ ...base, playerGoals: 9, playerAssists: 9, manOfTheMatch: true, outcome: "win", goalsFor: 9 }), 10);
  assert.equal(peneira.peneiraOfferCount(19.4), 1);
  assert.equal(peneira.peneiraOfferCount(19.5), 2);
  assert.equal(peneira.peneiraOfferCount(23.5), 3);
});

test("três jogos grandes: três propostas, com um gigante de fora do país", () => {
  let state = peneira.createPeneira("brasil", 99);
  for (let index = 0; index < 3; index += 1) state = play(state, index, { playerGoals: 2, playerAssists: 1, manOfTheMatch: true });
  assert.equal(peneira.peneiraCurrentIndex(state), 3);
  assert.ok(peneira.peneiraTotal(state) >= peneira.PENEIRA_THRESHOLDS.three);
  assert.equal(state.offers.length, 3);
  assert.equal(new Set(state.offers).size, 3);
  const giants = state.offers.filter((id) => peneira.peneiraOfferTag(state, id) === "giant");
  assert.equal(giants.length, 1);
  assert.ok(club(giants[0]).strength >= 86 && club(giants[0]).countryId !== "brasil");
  for (const id of state.offers.filter((item) => item !== giants[0])) assert.equal(club(id).countryId, "brasil");
});

test("peneira fraca ainda abre uma porta no país; a média dá duas", () => {
  let weak = peneira.createPeneira("argentina", 5);
  for (let index = 0; index < 3; index += 1) weak = play(weak, index, { outcome: "loss", goalsFor: 0, goalsAgainst: 2, playerGoals: 0 });
  assert.equal(weak.offers.length, 1);
  assert.equal(club(weak.offers[0]).countryId, "argentina");

  let middle = peneira.createPeneira("brasil", 6);
  for (let index = 0; index < 3; index += 1) middle = play(middle, index, { outcome: index === 2 ? "loss" : "win", playerGoals: index === 2 ? 0 : 1 });
  const total = peneira.peneiraTotal(middle);
  assert.ok(total >= peneira.PENEIRA_THRESHOLDS.two && total < peneira.PENEIRA_THRESHOLDS.three, `total ${total}`);
  assert.equal(middle.offers.length, 2);
  assert.ok(middle.offers.every((id) => club(id).countryId === "brasil"));
  // Resultado repetido não sobrescreve.
  assert.equal(peneira.recordPeneiraResult(middle, 0, { outcome: "loss", goalsFor: 0, goalsAgainst: 5, playerGoals: 0, playerAssists: 0, manOfTheMatch: false, simulated: true }), middle);
});

test("mesa de cada jogo: campo e rua da peneira, time de colete e o seu botão com força de peneira", () => {
  const state = peneira.createPeneira("brasil", 4321);
  const player = { name: "Teste", number: 9, position: "CA", appearance: DEFAULT_PLAYER_APPEARANCE };
  const setups = [0, 1, 2].map((index) => peneiraMatchSetup({ peneira: state, index, player, visualsEnabled: false }));
  assert.equal(setups[0].fieldTheme, "street");
  assert.equal(setups[0].streetVariant, state.matches[0].streetVariant);
  assert.equal(setups[1].fieldTheme, state.matches[1].fieldTheme);
  assert.equal(setups[2].fieldTheme, state.matches[2].fieldTheme);
  assert.equal(new Set(setups.map((setup) => setup.matchId)).size, 3);
  for (const setup of setups) {
    assert.equal(setup.player.overall, peneira.PENEIRA_PLAYER_OVERALL);
    assert.equal(setup.userTeam.name, "Time da Peneira");
    assert.ok(setup.cpuTeam.badge, "escudo do adversário (desenhado ou do clube)");
  }
});

test("save: peneira volta igual; jogo começado e sem resultado vira W.O. ao recarregar", () => {
  let state = peneira.createPeneira("brasil", 8);
  state = play(state, 0, { playerGoals: 2 });
  state = { ...state, matches: state.matches.map((match, index) => (index === 1 ? { ...match, started: true } : match)) };
  const save = { ...initialState(10), phase: "peneira", peneira: state, peneiraClubId: "" };
  const loaded = normalizeSave(JSON.parse(JSON.stringify(save)));
  assert.equal(loaded.phase, "peneira");
  assert.deepEqual(loaded.peneira.matches[0].result, state.matches[0].result);
  assert.equal(loaded.peneira.matches[1].result.walkover, true);
  assert.equal(loaded.peneira.matches[1].result.rating, 3);
  assert.equal(loaded.peneira.matches[2].result, null);
  assert.equal(normalizeSave({ ...save, peneira: { countryId: "brasil", matches: [] } }).peneira, null);
  assert.equal(normalizeSave({ ...initialState(1) }).peneira, null);
  assert.equal(normalizeSave({ ...initialState(1) }).peneiraClubId, "");
});

test("quem entra pela peneira chega com +25% de confiança do treinador no primeiro contrato", () => {
  const base = { ...initialState(55), phase: "revelation", academyClubId: "palmeiras", academyCountryId: "brasil", overall: 66, age: 17 };
  const direct = signProfessionalForSimulation({ ...base, peneiraClubId: "" }, "palmeiras");
  const fromPeneira = signProfessionalForSimulation({ ...base, peneiraClubId: "palmeiras" }, "palmeiras");
  assert.equal(direct.managerTrust, 58);
  assert.equal(fromPeneira.managerTrust, Math.round(58 * 1.25));
  // Contrato com outro clube: o bônus é do clube da peneira, não da pessoa.
  const elsewhere = signProfessionalForSimulation({ ...base, peneiraClubId: "palmeiras" }, "flamengo");
  assert.equal(elsewhere.managerTrust, 44);
  assert.equal(peneira.peneiraTrustBonus(90), 100);
});

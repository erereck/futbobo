import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  });
  module._compile(outputText, filename);
};
const { CLUBS } = load("../app/game-data.ts");
const { initialState, normalizeSave } = load("../app/career/state.ts");
const { simulateSeason, eventForState } = load("../app/career/simulation.ts");
const { eligibleEvents } = load("../app/career/events.ts");
const { canReceiveSeniorCallUp } = load("../app/career/national-callups.ts");
const event = { id: "test", icon: "⚽", tag: "TESTE", title: "Teste", description: "", choices: [] };
const makeState = (leagueId, age = 27) => {
  const club = CLUBS.find((item) => item.leagueId === leagueId);
  assert.ok(club, leagueId);
  return { ...initialState(123), phase: "career", currentClubId: club.id, academyClubId: club.id,
    currentLeagueId: leagueId, academyCountryId: club.countryId, nationality: club.countryId,
    position: "CA", overall: 95, potential: 99, age, contractYears: 4, nationalLevel: 95, reputation: 95 };
};
const season = (state, effect = { nationalCall: true }) => simulateSeason(state, event, effect, "Jogar", "Jogou", null, "simulate");

test("primeira convocação principal é bloqueada nas divisões inferiores, inclusive chamadas forçadas", () => {
  for (const leagueId of ["brasileirao-b", "brasileirao-c", "brasileirao-d", "championship", "league-one", "league-two", "segunda-division", "2-bundesliga"]) {
    const state = { ...makeState(leagueId), nationalCaps: 100 };
    assert.equal(canReceiveSeniorCallUp(state), false, leagueId);
    const result = season(state, { nationalCall: true, nationalCaptain: true });
    assert.equal(result.lastResult.calledUp, false, leagueId);
    assert.equal(result.nationalCaps, 100, leagueId);
    assert.equal(result.nationalCaptain, false, leagueId);
    assert.equal(result.seniorNationalCallUp, false, leagueId);
    assert.match(result.lastResult.nationalNote, /primeira divisão/);
  }
});

test("base e olímpica continuam podendo convocar craques de divisões inferiores", () => {
  for (const [age, tier] of [[16, "sub17"], [19, "sub20"], [22, "olympic"]]) {
    const result = season(makeState("brasileirao-d", age));
    assert.equal(result.lastResult.calledUp, true, tier);
    assert.equal(result.nationalCategory, tier);
    assert.equal(result.seniorNationalCallUp, false);
    assert.ok(result.nationalCaps > 0);
  }
});

test("primeira divisão libera estreia e o histórico libera futuras convocações em divisões inferiores", () => {
  const debut = season(makeState("brasileirao"));
  assert.equal(debut.lastResult.calledUp, true);
  assert.equal(debut.seniorNationalCallUp, true);
  const relegated = normalizeSave({ ...debut, currentLeagueId: "brasileirao-d", phase: "career" });
  assert.equal(relegated.seniorNationalCallUp, true);
  assert.equal(season(relegated).lastResult.calledUp, true);
});

test("o nível da divisão atual prevalece sobre o cadastro original do clube", () => {
  const state = makeState("brasileirao-d");
  assert.equal(canReceiveSeniorCallUp({ ...state, currentLeagueId: "brasileirao" }), true);
  assert.equal(canReceiveSeniorCallUp({ ...makeState("brasileirao"), currentLeagueId: "brasileirao-c" }), false);
});

test("saves antigos recuperam histórico comprovado sem confundir seleções jovens com principal", () => {
  const base = makeState("brasileirao-b");
  const youth = normalizeSave({ ...base, seniorNationalCallUp: undefined, nationalCaps: 40, nationalCategory: "none", nationalHistory: [{ season: 2026, tier: "sub20", name: "Mundial Sub-20", icon: "S20", stage: "Vice", champion: false }] });
  assert.equal(youth.seniorNationalCallUp, false);
  assert.equal(canReceiveSeniorCallUp(youth), false);
  const senior = normalizeSave({ ...youth, seniorNationalCallUp: undefined, nationalHistory: [{ season: 2027, tier: "main", name: "Eliminatórias", icon: "ELIM", stage: "Classificado", champion: false }] });
  assert.equal(senior.seniorNationalCallUp, true);
  assert.equal(season(senior).lastResult.calledUp, true);
  const current = normalizeSave({ ...base, seniorNationalCallUp: undefined, nationalCategory: "main" });
  assert.equal(current.seniorNationalCallUp, true);
});

test("evento de convocação principal não aparece antes da elegibilidade, inclusive em saves antigos", () => {
  const blocked = { ...makeState("league-one"), currentEventId: "senior-national" };
  assert.equal(eligibleEvents(blocked).some((item) => item.id === "senior-national"), false);
  assert.notEqual(eventForState(blocked).id, "senior-national");
  for (const id of ["surprise-call", "drama-veteran-uncapped-frustration"]) {
    assert.equal(eligibleEvents(blocked).some((item) => item.id === id), false);
    assert.notEqual(eventForState({ ...blocked, currentEventId: id }).id, id);
  }
  assert.equal(eligibleEvents({ ...blocked, age: 19 }).some((item) => item.id === "surprise-call"), true);
  assert.equal(eligibleEvents({ ...blocked, seniorNationalCallUp: true }).some((item) => item.id === "senior-national"), true);
});

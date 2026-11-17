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
const { clubPickerGroups } = load("../app/career/club-picker.ts");
const { CLUBS, LEAGUES, COUNTRIES } = load("../app/game-data.ts");
const { initialContinentalSlot, continentalSlotAfterSeason } = load("../app/career/academy.ts");
load("../app/career/second-divisions.ts").installSecondDivisions();
const leagues = (groups) => groups.flatMap((group) => group.leagues);
const clubs = (groups) => leagues(groups).flatMap((league) => league.clubs);

test("diretório inclui todos os clubes uma única vez e organiza as divisões", () => {
  const groups = clubPickerGroups("", "brasil");
  const listed = clubs(groups);
  assert.equal(groups[0].country.id, "brasil");
  assert.equal(listed.length, CLUBS.length);
  assert.equal(new Set(listed.map((club) => club.id)).size, CLUBS.length);
  const brazil = groups.find((group) => group.country.id === "brasil");
  assert.deepEqual(brazil.leagues.map(({ league, division }) => [league.id, division]), [["brasileirao", 1], ["brasileirao-b", 2], ["brasileirao-c", 3], ["brasileirao-d", 4]]);
  const england = groups.find((group) => group.country.id === "inglaterra");
  assert.deepEqual(england.leagues.map(({ league, division }) => [league.id, division]), [["premier", 1], ["championship", 2], ["league-one", 3], ["league-two", 4]]);
  for (const id of ["segunda-division", "serie-b-italia", "2-bundesliga", "ligue-2", "liga-portugal-2"]) {
    assert.equal(leagues(groups).find(({ league }) => league.id === id).division, 2);
  }
  assert.ok(leagues(groups).find(({ league }) => league.id === "a-league").clubs.some((club) => club.id === "auckland-fc"));
});

test("busca encontra clubes, ligas e países sem exigir acentos", () => {
  assert.ok(clubs(clubPickerGroups("sao paulo", "brasil")).some((club) => club.id === "sao-paulo"));
  assert.deepEqual(leagues(clubPickerGroups("championship", "brasil")).map(({ league }) => league.id), ["championship"]);
  assert.ok(leagues(clubPickerGroups("inglaterra", "brasil")).some(({ league }) => league.id === "premier"));
  assert.ok(clubs(clubPickerGroups("nova zelandia", "brasil")).some((club) => club.id === "auckland-fc"));
  assert.equal(clubPickerGroups("sem resultado xyz", "brasil").length, 0);
});

test("Rússia e Ucrânia aparecem no diretório com 16 clubes reais da primeira divisão 2026/27", () => {
  for (const [countryId, leagueId] of [
    ["russia", "russian-premier-league"],
    ["ucrania", "ukrainian-premier-league"],
  ]) {
    assert.ok(COUNTRIES.some((country) => country.id === countryId));
    assert.ok(LEAGUES.some((league) => league.id === leagueId && league.countryId === countryId));
    const group = clubPickerGroups("", countryId).find((item) => item.country.id === countryId);
    assert.ok(group, countryId);
    assert.equal(group.leagues.length, 1);
    assert.equal(group.leagues[0].league.id, leagueId);
    assert.equal(group.leagues[0].division, 1);
    assert.equal(group.leagues[0].clubs.length, 16);
    assert.equal(new Set(group.leagues[0].clubs.map((club) => club.id)).size, 16);
  }
  assert.ok(clubs(clubPickerGroups("shakhtar", "brasil")).some((club) => club.id === "shakhtar-donetsk"));
  assert.ok(clubs(clubPickerGroups("spartak", "brasil")).some((club) => club.id === "spartak-moscow"));
  assert.ok(clubs(clubPickerGroups("ucrania", "brasil")).some((club) => club.id === "dynamo-kyiv"));
});

test("clubes russos não se classificam para torneios da UEFA", () => {
  const league = LEAGUES.find((entry) => entry.id === "russian-premier-league");
  assert.ok(league);
  assert.deepEqual([league.championsPlaces, league.europaPlaces, league.conferencePlaces], [0, 0, 0]);
  for (const club of CLUBS.filter((item) => item.countryId === "russia")) {
    assert.equal(initialContinentalSlot(club), null);
    assert.equal(continentalSlotAfterSeason(club, league, true, true, 1), null);
    assert.equal(continentalSlotAfterSeason(club, league, false, false, 16), null);
  }
  const ukrainianClub = CLUBS.find((club) => club.id === "shakhtar-donetsk");
  const ukrainianLeague = LEAGUES.find((item) => item.id === "ukrainian-premier-league");
  assert.equal(continentalSlotAfterSeason(ukrainianClub, ukrainianLeague, true, false, 1), "champions");
});

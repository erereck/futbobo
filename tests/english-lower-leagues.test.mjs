import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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
const { CLUBS, LEAGUES } = load("../app/game-data.ts");
const { academyClubOptions, initialContinentalSlot, continentalSlotAfterSeason } = load("../app/career/academy.ts");
const { resolveExtraSecondDivisionPromotion } = load("../app/career/second-divisions.ts");
const { VERIFIED_CLUB_ASSET_IDS } = load("../app/verified-club-assets.ts");
const { initialState } = load("../app/career/state.ts");
const { simulateSeason } = load("../app/career/simulation.ts");
const divisionClubs = (id) => CLUBS.filter((club) => club.leagueId === id);

test("quatro divisões inglesas têm 20, 24, 24 e 24 clubes, sem duplicatas", () => {
  assert.deepEqual(["premier", "championship", "league-one", "league-two"].map((id) => divisionClubs(id).length), [20, 24, 24, 24]);
  assert.equal(new Set(CLUBS.map((club) => club.id)).size, CLUBS.length);
  for (const id of ["leicester", "luton", "oxford-united", "sheffield-wednesday"]) assert.equal(CLUBS.find((club) => club.id === id).leagueId, "league-one");
  assert.equal(CLUBS.find((club) => club.id === "wolves").leagueId, "championship");
});

test("clubes ingleses das novas divisões têm escudos locais", () => {
  for (const club of [...divisionClubs("league-one"), ...divisionClubs("league-two")]) {
    assert.ok(VERIFIED_CLUB_ASSET_IDS.has(club.id), club.id);
    assert.ok(existsSync(new URL(`../public/assets/clubs/${club.id}.png`, import.meta.url)), club.id);
  }
});

test("base inglesa sorteia três de cada uma das quatro divisões", () => {
  for (let seed = 0; seed < 30; seed++) {
    const clubs = academyClubOptions("inglaterra", seed);
    assert.equal(clubs.length, 12);
    assert.equal(new Set(clubs.map((club) => club.id)).size, 12);
    for (const id of ["premier", "championship", "league-one", "league-two"]) assert.equal(clubs.filter((club) => club.leagueId === id).length, 3);
  }
});

test("acessos ingleses incluem vagas diretas e playoffs", () => {
  assert.deepEqual(resolveExtraSecondDivisionPromotion("league-one", 2, 1, 0), { topLeagueId: "championship", playoff: false });
  assert.deepEqual(resolveExtraSecondDivisionPromotion("league-one", 3, 0, 0), { topLeagueId: "championship", playoff: true });
  assert.equal(resolveExtraSecondDivisionPromotion("league-one", 7, 0, 0), null);
  assert.deepEqual(resolveExtraSecondDivisionPromotion("league-two", 3, 1, 0), { topLeagueId: "league-one", playoff: false });
  assert.deepEqual(resolveExtraSecondDivisionPromotion("league-two", 4, 0, 0), { topLeagueId: "league-one", playoff: true });
  assert.equal(resolveExtraSecondDivisionPromotion("league-two", 8, 0, 0), null);
});

test("as duas ligas não dão vagas europeias pela classificação", () => {
  for (const id of ["league-one", "league-two"]) {
    const club = divisionClubs(id)[0]; const league = LEAGUES.find((item) => item.id === id);
    assert.equal(initialContinentalSlot(club), null);
    assert.equal(continentalSlotAfterSeason(club, league, true, false, 1), null);
    assert.equal(continentalSlotAfterSeason(club, league, false, true, 12), "europa");
  }
});

test("temporada em cada nova liga permite acesso à divisão seguinte", () => {
  const event = { id: "test", icon: "⚽", tag: "TESTE", title: "Teste", description: "", choices: [] };
  for (const [leagueId, target] of [["league-one", "championship"], ["league-two", "league-one"]]) {
    const club = divisionClubs(leagueId)[0]; let promoted = false;
    for (let seed = 1; seed <= 20 && !promoted; seed++) {
      const state = { ...initialState(seed), phase: "career", currentClubId: club.id, academyClubId: club.id, currentLeagueId: leagueId, academyCountryId: "inglaterra", nationality: "inglaterra", position: "CA", overall: 95, potential: 95, age: 25, contractYears: 4, managerTrust: 80 };
      const result = simulateSeason(state, event, {}, "Jogar", "Jogou", null, "simulate");
      assert.equal(result.lastResult.leagueId, leagueId);
      if (result.currentLeagueId === target) promoted = true;
    }
    assert.equal(promoted, true, `${leagueId} deve permitir acesso`);
  }
});

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
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
const { VERIFIED_CLUB_ASSET_IDS } = load("../app/verified-club-assets.ts");
const { eliteSeasonProduction } = load("../app/career/season-production.ts");
const { initialState } = load("../app/career/state.ts");
const { simulateSeason } = load("../app/career/simulation.ts");

const divisionClubs = (id) => CLUBS.filter((club) => club.leagueId === id);

test("quatro divisões brasileiras têm 20, 20, 20 e 96 clubes sem duplicatas", () => {
  assert.deepEqual(["brasileirao", "brasileirao-b", "brasileirao-c", "brasileirao-d"].map((id) => divisionClubs(id).length), [20, 20, 20, 96]);
  assert.equal(new Set(CLUBS.map((club) => club.id)).size, CLUBS.length);
  for (const id of ["amazonas", "paysandu", "guarani", "figueirense"]) assert.equal(CLUBS.find((club) => club.id === id).leagueId, "brasileirao-c");
});

test("todos os novos clubes têm escudos locais e Goiás usa imagem diferente do Atlético-GO", () => {
  for (const club of [...divisionClubs("brasileirao-c"), ...divisionClubs("brasileirao-d")]) {
    assert.ok(VERIFIED_CLUB_ASSET_IDS.has(club.id), club.id);
    assert.ok(existsSync(new URL(`../public/assets/clubs/${club.id}.png`, import.meta.url)), club.id);
  }
  const hash = (name) => createHash("sha256").update(readFileSync(new URL(`../public/assets/clubs/${name}.png`, import.meta.url))).digest("hex");
  assert.notEqual(hash("goias"), hash("atletico-go"));
  const manifest = JSON.parse(readFileSync(new URL("../public/assets/football-assets.json", import.meta.url), "utf8"));
  assert.match(manifest.clubs.goias.externalSource, /static\.goiasec\.com\.br/);
});

test("base brasileira oferece exatamente três clubes de cada divisão", () => {
  for (let seed = 0; seed < 30; seed++) {
    const clubs = academyClubOptions("brasil", seed);
    assert.equal(clubs.length, 12);
    assert.equal(new Set(clubs.map((club) => club.id)).size, 12);
    for (const id of ["brasileirao", "brasileirao-b", "brasileirao-c", "brasileirao-d"]) assert.equal(clubs.filter((club) => club.leagueId === id).length, 3);
  }
  assert.equal(academyClubOptions("inglaterra", 12).length, 6);
});

test("Séries C e D não classificam para a Libertadores pela liga", () => {
  for (const id of ["brasileirao-c", "brasileirao-d"]) {
    const club = divisionClubs(id)[0]; const league = LEAGUES.find((item) => item.id === id);
    assert.equal(initialContinentalSlot(club), null);
    assert.equal(continentalSlotAfterSeason(club, league, true, false, 1), null);
    assert.equal(continentalSlotAfterSeason(club, league, false, true, 12), "libertadores");
  }
});

test("temporadas de C e D são simuladas e podem garantir acesso", () => {
  const event = { id: "test", icon: "⚽", tag: "TESTE", title: "Teste", description: "", choices: [] };
  for (const [leagueId, target] of [["brasileirao-c", "brasileirao-b"], ["brasileirao-d", "brasileirao-c"]]) {
    const club = divisionClubs(leagueId)[0];
    let promoted = false;
    for (let seed = 1; seed <= 20 && !promoted; seed++) {
      const state = { ...initialState(seed), phase: "career", currentClubId: club.id, academyClubId: club.id, currentLeagueId: leagueId, academyCountryId: "brasil", position: "CA", overall: 95, potential: 95, age: 25, contractYears: 4, managerTrust: 80 };
      const result = simulateSeason(state, event, {}, "Jogar", "Jogou", null, "simulate");
      assert.equal(result.lastResult.leagueId, leagueId);
      if (result.currentLeagueId === target) promoted = true;
    }
    assert.equal(promoted, true, `${leagueId} deve permitir acesso`);
  }
  assert.equal(eliteSeasonProduction(20, 88), 24);
});

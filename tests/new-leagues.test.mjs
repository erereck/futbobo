import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

stubBrowser();
const { CLUBS, LEAGUES, COUNTRIES } = loadTs("app/game-data.ts");
loadTs("app/career/second-divisions.ts").installSecondDivisions();
const { resolveExtraSecondDivisionPromotion } = loadTs("app/career/second-divisions.ts");
const academy = loadTs("app/career/academy.ts");
const { leagueDivision } = loadTs("app/career/league-divisions.ts");
const { clubPickerGroups } = loadTs("app/career/club-picker.ts");
const { canReceiveSeniorCallUp } = loadTs("app/career/national-callups.ts");
const { SECOND_DIVISION_LEAGUES, ALTERNATIVE_EXILE_LEAGUES } = loadTs("app/career/transfer-market.ts");
const { nameStyleForNationality, worldPlayerNameForNationality } = loadTs("app/career/world-player-name-pools.ts");
const { RIVALRIES } = loadTs("app/mega-expansion.ts");

const NEW_LEAGUES = [
  { id: "uae-pro-league", countryId: "emirados-arabes", clubs: 14, confederation: "ASIA" },
  { id: "qatar-stars-league", countryId: "catar", clubs: 12, confederation: "ASIA" },
  { id: "persian-gulf-pro-league", countryId: "ira", clubs: 18, confederation: "ASIA" },
  { id: "tunisia-ligue-1", countryId: "tunisia", clubs: 16, confederation: "AFRICA" },
  { id: "primera-nacional", countryId: "argentina", clubs: 36, confederation: "SOUTH_AMERICA" },
];
const club = (id) => CLUBS.find((item) => item.id === id);

test("as cinco ligas novas existem com os elencos de 2026/27 e dados válidos", () => {
  assert.equal(new Set(CLUBS.map((item) => item.id)).size, CLUBS.length, "ids de clube únicos");
  for (const { id, countryId, clubs, confederation } of NEW_LEAGUES) {
    const league = LEAGUES.find((item) => item.id === id);
    assert.ok(league, id);
    assert.equal(league.countryId, countryId);
    assert.equal(COUNTRIES.find((item) => item.id === countryId).confederation, confederation);
    const members = CLUBS.filter((item) => item.leagueId === id);
    assert.equal(members.length, clubs, `${id}: ${members.length} clubes`);
    assert.equal(new Set(members.map((item) => item.abbr)).size, members.length, `${id}: siglas únicas`);
    for (const member of members) {
      assert.equal(member.countryId, countryId, member.id);
      assert.match(member.primary, /^#[0-9a-f]{6}$/i, member.id);
      assert.match(member.secondary, /^#[0-9a-f]{6}$/i, member.id);
      assert.ok(member.reputation >= 1 && member.reputation <= 5, member.id);
      assert.ok(member.strength >= 50 && member.strength <= 80, `${member.id}: ${member.strength}`);
      assert.ok(member.city && member.shortName && member.name, member.id);
    }
  }
  // Os grandes no topo de cada liga.
  for (const [big, leagueId] of [["al-sadd", "qatar-stars-league"], ["al-ain-uae", "uae-pro-league"], ["esperance-tunis", "tunisia-ligue-1"]]) {
    const strongest = Math.max(...CLUBS.filter((item) => item.leagueId === leagueId).map((item) => item.strength));
    assert.equal(club(big).strength, strongest, big);
  }
  assert.ok(club("persepolis").strength >= 73 && club("esteghlal").strength >= 73);
});

test("Primera Nacional é a segunda divisão argentina: acesso, copa, mercado e seleção", () => {
  assert.equal(leagueDivision("primera-nacional"), 2);
  assert.equal(leagueDivision("liga-argentina"), 1);
  // Mais fraca que a primeira divisão na média, como a Série B.
  const average = (id) => CLUBS.filter((item) => item.leagueId === id).reduce((sum, item, _, list) => sum + item.strength / list.length, 0);
  assert.ok(average("liga-argentina") - average("primera-nacional") >= 5);
  // Campeão sobe direto; o "Reducido" dá a segunda vaga; do 9º para baixo, nada.
  assert.deepEqual(resolveExtraSecondDivisionPromotion("primera-nacional", 1, 0.99, 0), { topLeagueId: "liga-argentina", playoff: false });
  assert.deepEqual(resolveExtraSecondDivisionPromotion("primera-nacional", 3, 0, 0), { topLeagueId: "liga-argentina", playoff: true });
  assert.equal(resolveExtraSecondDivisionPromotion("primera-nacional", 9, 0, 0), null);
  // Continental só ganhando a Copa Argentina.
  const godoy = club("godoy-cruz");
  const league = LEAGUES.find((item) => item.id === "primera-nacional");
  assert.equal(academy.initialContinentalSlot(godoy), null);
  assert.equal(academy.continentalSlotAfterSeason(godoy, league, true, false, 1), null);
  assert.equal(academy.continentalSlotAfterSeason(godoy, league, false, true, 9), "libertadores");
  // Mercado doméstico e sem seleção principal enquanto joga a segunda divisão.
  assert.ok(SECOND_DIVISION_LEAGUES.has("primera-nacional"));
  assert.equal(canReceiveSeniorCallUp({ seniorNationalCallUp: false, currentLeagueId: "primera-nacional", currentClubId: "godoy-cruz", academyClubId: "godoy-cruz" }), false);
  // Diretório: Argentina com as duas divisões, na ordem.
  const argentina = clubPickerGroups("", "argentina").find((group) => group.country.id === "argentina");
  assert.deepEqual(argentina.leagues.map(({ league: item, division }) => [item.id, division]), [["liga-argentina", 1], ["primera-nacional", 2]]);
});

test("Golfo, Irã e Tunísia jogam o continental e viram rota de base", () => {
  assert.equal(academy.initialContinentalSlot(club("al-sadd")), "asian");
  assert.equal(academy.initialContinentalSlot(club("esperance-tunis")), "african");
  const qatar = LEAGUES.find((item) => item.id === "qatar-stars-league");
  assert.equal(academy.continentalSlotAfterSeason(club("al-wakrah"), qatar, false, false, 2), "asian");
  assert.equal(academy.continentalSlotAfterSeason(club("al-wakrah"), qatar, false, false, 7), null);
  for (const id of ["catar", "emirados-arabes", "ira", "tunisia"]) assert.ok(academy.PLAYABLE_ACADEMY_COUNTRIES.includes(id), id);
  assert.equal(academy.defaultAcademyCountry("kuwait"), "catar");
  assert.equal(academy.defaultAcademyCountry("iraque"), "catar");
  assert.equal(academy.defaultAcademyCountry("argelia"), "tunisia");
  assert.ok(academy.academyClubOptions("ira", 77).every((item) => item.countryId === "ira"));
  for (const id of ["qatar-stars-league", "uae-pro-league", "persian-gulf-pro-league", "tunisia-ligue-1"]) assert.ok(ALTERNATIVE_EXILE_LEAGUES.has(id), id);
});

test("jogadores iranianos ganham nomes persas e os clássicos novos apontam para clubes reais", () => {
  assert.equal(nameStyleForNationality("ira"), "persian");
  assert.equal(nameStyleForNationality("catar"), "arabic");
  const name = worldPlayerNameForNationality("ira", 4242, 17);
  assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  for (const id of ["per-est", "sep-zob", "est-ca", "ess-usm", "sad-ray", "ain-wasl", "wasl-nasr", "atl-cha"]) {
    const rivalry = RIVALRIES.find((item) => item.id === id);
    assert.ok(rivalry, id);
    for (const clubId of rivalry.clubIds) assert.ok(club(clubId), `${id}: ${clubId}`);
  }
  assert.equal(new Set(RIVALRIES.map((item) => item.id)).size, RIVALRIES.length);
});

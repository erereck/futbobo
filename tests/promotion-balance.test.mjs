import assert from "node:assert/strict";
import test from "node:test";
import { starPromotionRankBoost } from "../app/career/promotion.ts";

const secondDivisions = [
  "brasileirao-b",
  "championship",
  "segunda-division",
  "serie-b-italia",
  "2-bundesliga",
  "ligue-2",
  "liga-portugal-2",
];

test("jogadores 80+ recebem bônus progressivo em todas as segundas divisões", () => {
  for (const leagueId of secondDivisions) {
    assert.equal(starPromotionRankBoost(leagueId, 79, 38), 0);
    assert.equal(starPromotionRankBoost(leagueId, 80, 38), 4);
    assert.ok(starPromotionRankBoost(leagueId, 85, 38) > 10);
    assert.ok(starPromotionRankBoost(leagueId, 92, 38) >= 19);
  }
  assert.equal(starPromotionRankBoost("premier", 99, 38), 0);
  assert.equal(starPromotionRankBoost("brasileirao", 99, 38), 0);
});

test("92 OVR em temporada completa alcança a zona de acesso até na Championship", () => {
  const leagueClubCount = 24;
  const strength = 80; // Clube fraco elevado ao mínimo de quatro estrelas pelo craque.
  const playerImpact = 22;
  const expectedPosition = (leagueClubCount + 1) / 2 - (strength - 74) * 0.45 - playerImpact * 0.08
    - starPromotionRankBoost("championship", 92, 36);

  for (let i = 0; i <= 800; i++) {
    const variance = i / 100 - 4;
    const position = Math.max(2, Math.min(leagueClubCount, Math.round(expectedPosition + variance)));
    assert.ok(position <= 2, `92 OVR não deveria ficar em ${position}º`);
  }
});

test("o bônus diminui com poucos jogos e preserva o desafio da primeira divisão", () => {
  const fullSeason = starPromotionRankBoost("championship", 92, 38);
  const shortenedSeason = starPromotionRankBoost("championship", 92, 12);
  assert.ok(shortenedSeason < fullSeason);
  assert.ok(shortenedSeason > 0);
  assert.equal(starPromotionRankBoost("laliga", 92, 38), 0);
});

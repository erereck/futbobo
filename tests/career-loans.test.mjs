import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

stubBrowser();
const { CLUBS } = loadTs("app/game-data.ts");
const { initialState } = loadTs("app/career/state.ts");
const { requestPlayerLoan, applyAcceptedTransfer } = loadTs("app/career/transfer-market.ts");
const squadRole = loadTs("app/career/squad-role.ts");

const club = (id) => CLUBS.find((item) => item.id === id);
function atClub(clubId, overall, extra = {}) {
  const source = club(clubId);
  return { ...initialState(321), phase: "career", currentClubId: clubId, currentLeagueId: source.leagueId, academyClubId: clubId, overall, age: 20, position: "CA", squadRole: "reserva", contractYears: 3, managerTrust: 50, ...extra };
}

test("empréstimo: clube grande não pede quem não jogaria lá (70 de overall não vai para o Atlético)", () => {
  for (const source of ["real-madrid", "atletico-madrid", "palmeiras"]) {
    const requested = requestPlayerLoan(atClub(source, 70));
    assert.equal(requested.phase, "transfer");
    assert.ok(requested.transferMarketOffers.length >= 5, `${source}: ${requested.transferMarketOffers.length} propostas`);
    for (const offer of requested.transferMarketOffers) {
      assert.notEqual(offer.clubId, "atletico-madrid");
      assert.ok(club(offer.clubId).strength <= 70 + squadRole.LOAN_PLAY_MARGIN, `${offer.clubId} (${club(offer.clubId).strength}) é forte demais para 70`);
      assert.ok(club(offer.clubId).strength >= 70 - squadRole.LOAN_FLOOR_MARGIN, `${offer.clubId} é fraco demais`);
    }
  }
  // Quem jogaria lá pode, sim, ir emprestado para um clube grande.
  const strong = requestPlayerLoan(atClub("real-madrid", 82));
  assert.ok(strong.transferMarketOffers.some((offer) => club(offer.clubId).strength >= 80));
});

test("empréstimo: quem te pede emprestado te quer como titular, e o papel se mantém emprestado", () => {
  const requested = requestPlayerLoan(atClub("real-madrid", 66));
  assert.ok(requested.transferMarketOffers.every((offer) => offer.type === "loan" && ["titular", "estrela"].includes(offer.role)));
  const loaned = applyAcceptedTransfer(requested, requested.transferMarketOffers[0]);
  assert.ok(loaned.activeLoan);
  assert.equal(loaned.squadRole, "titular");
  // Na simulação da temporada o papel emprestado nunca cai abaixo de titular.
  assert.equal(squadRole.adjustedSquadRole(loaned, loaned.currentClubId, loaned.overall, "reserva"), "titular");
  assert.equal(squadRole.adjustedSquadRole(loaned, loaned.currentClubId, loaned.overall, "estrela"), "estrela");
  // Fora de empréstimo, nada muda.
  const home = atClub("real-madrid", 66);
  assert.equal(squadRole.adjustedSquadRole(home, home.currentClubId, 66, "reserva"), "reserva");
});

test("empréstimo: faixa de clubes que fazem sentido", () => {
  assert.equal(squadRole.loanFits(70, 73), true);
  assert.equal(squadRole.loanFits(70, 74), false);
  assert.equal(squadRole.loanFits(70, 58), true);
  assert.equal(squadRole.loanFits(70, 57), false);
});

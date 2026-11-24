// Banimento do futebol: quem cai num esquema (apostas, manipulação) vira agente
// livre sem poder ser registrado por nenhum clube até `forcedFreeAgentUntilSeason`.
// A tela de transferências já sabe cumprir a pena ("Passar um ano sem clube").

import type { GameState } from "./model";

/** Casa de apostas paga muito mais que marca esportiva... */
export const BETTING_PAY_MULTIPLIER = 2.5;
/** ...e ainda adianta luvas (fração do valor anual) na assinatura. */
export const BETTING_SIGNING_BONUS = 0.5;
/** Chance de o contrato terminar num esquema descoberto. */
export const BETTING_SCANDAL_CHANCE = 25;
export const BETTING_BAN_SEASONS = 2;

export function isBannedFromFootball(state: Pick<GameState, "forcedFreeAgentUntilSeason" | "season">): boolean {
  return state.forcedFreeAgentUntilSeason > state.season;
}

/**
 * Aplica a pena no fim da temporada (`state.season` já é a seguinte): contrato,
 * salário, patrocínio e empréstimo acabam, e o mercado fecha por `seasons` temporadas.
 */
export function applyFootballBan(state: GameState, seasons: number): GameState {
  const length = Math.max(1, Math.round(seasons));
  const until = state.season + length;
  const sponsor = state.activeSponsor;
  return {
    ...state,
    isFreeAgent: true,
    freeAgentSinceSeason: state.season,
    forcedFreeAgentUntilSeason: until,
    contractYears: 0,
    annualSalary: 0,
    activeSponsor: null,
    sponsorHistory: sponsor ? [{ ...sponsor, endSeason: state.season, status: "terminated" }, ...state.sponsorHistory] : state.sponsorHistory,
    activeLoan: null,
    loanParentClubId: "",
    loanParentLeagueId: "",
    loanEndSeason: 0,
    clubCaptain: false,
    managerTrust: 0,
    transferOffers: [],
    transferMarketOffers: [],
    transferRequested: true,
    pendingTransferMode: "permanent",
    renewalDenied: false,
    forcedClubExit: false,
    youthLoanDecision: false,
    forcedAlternativeTransfer: false,
    transferStatus: {
      success: false,
      chance: 0,
      headline: `Banido por ${length} ${length === 1 ? "ano" : "anos"}`,
      text: `Nenhum clube pode registrar você antes de ${until}. Dá para cumprir a pena na tela de transferências.`,
    },
    newsFeed: [`${state.season - 1}: ${state.name} é banido do futebol por ${length} ${length === 1 ? "ano" : "anos"} após investigação de manipulação de apostas.`, ...state.newsFeed].slice(0, 16),
  };
}

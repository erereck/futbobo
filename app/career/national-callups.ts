import type { GameState } from "./model";
import { leagueDivision } from "./league-divisions";
import { clubById } from "./shared";

/** A exceção é pela convocação anterior à seleção principal, não pelas categorias de base. */
export function canReceiveSeniorCallUp(state: GameState): boolean {
  if (state.seniorNationalCallUp) return true;
  const leagueId = state.currentLeagueId || clubById(state.currentClubId || state.academyClubId).leagueId;
  return leagueDivision(leagueId) === 1;
}

/** Não apresentar eventos que prometem uma convocação principal ainda proibida. */
export function canOfferNationalEvent(state: GameState, eventId: string): boolean {
  if (eventId !== "senior-national" && eventId !== "surprise-call" && eventId !== "drama-veteran-uncapped-frustration") return true;
  if (canReceiveSeniorCallUp(state)) return true;
  if (eventId === "senior-national") return false;
  return state.age < 24;
}

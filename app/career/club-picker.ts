import { CLUBS, COUNTRIES, LEAGUES } from "../game-data";
import type { Club, Country, League } from "../game-data";

export type ClubPickerLeague = { league: League; division: number; clubs: Club[] };
export type ClubPickerCountry = { country: Country; leagues: ClubPickerLeague[] };

const SECOND_DIVISIONS = new Set(["brasileirao-b", "championship", "segunda-division", "serie-b-italia", "2-bundesliga", "ligue-2", "liga-portugal-2"]);

function searchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/** Organiza pela liga, inclusive clubes de outro país que disputam esse campeonato. */
export function clubPickerGroups(query: string, preferredCountryId: string): ClubPickerCountry[] {
  const needle = searchText(query.trim());
  const countryNames = new Map(COUNTRIES.map((country) => [country.id, country.name]));
  return COUNTRIES.map((country) => {
    const leagues = LEAGUES.filter((league) => league.countryId === country.id).map((league) => {
      const matchesLeague = !needle || searchText(`${league.name} ${country.name}`).includes(needle);
      const clubs = CLUBS.filter((club) => club.leagueId === league.id && (matchesLeague || searchText(`${club.name} ${club.shortName} ${club.abbr} ${club.city} ${countryNames.get(club.countryId) ?? ""}`).includes(needle)))
        .sort((a, b) => a.shortName.localeCompare(b.shortName, "pt-BR"));
      return { league, division: SECOND_DIVISIONS.has(league.id) ? 2 : 1, clubs };
    }).filter((entry) => entry.clubs.length > 0)
      .sort((a, b) => a.division - b.division || a.league.name.localeCompare(b.league.name, "pt-BR"));
    return { country, leagues };
  }).filter((group) => group.leagues.length > 0)
    .sort((a, b) => a.country.id === preferredCountryId ? -1 : b.country.id === preferredCountryId ? 1 : a.country.name.localeCompare(b.country.name, "pt-BR"));
}

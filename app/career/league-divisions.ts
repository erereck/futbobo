/** Nível das ligas que têm mais de uma divisão disponível no jogo. */
export function leagueDivision(leagueId: string): number {
  if (leagueId === "brasileirao-d" || leagueId === "league-two") return 4;
  if (leagueId === "brasileirao-c" || leagueId === "league-one") return 3;
  if (["brasileirao-b", "championship", "segunda-division", "serie-b-italia", "2-bundesliga", "ligue-2", "liga-portugal-2"].includes(leagueId)) return 2;
  return 1;
}

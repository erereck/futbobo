/** Ligas em que a carreira do jogador pode conquistar acesso à primeira divisão. */
const PROMOTION_LEAGUES = new Set([
  "brasileirao-b",
  "brasileirao-c",
  "brasileirao-d",
  "championship",
  "segunda-division",
  "serie-b-italia",
  "2-bundesliga",
  "ligue-2",
  "liga-portugal-2",
]);

/**
 * Um jogador 80+ deve conseguir carregar um time da segunda divisão.
 * O bônus cresce bastante com o overall, mas depende de quantos jogos ele disputou.
 * Fora das ligas de acesso (ou abaixo de 80 OVR), o equilíbrio permanece igual.
 */
export function starPromotionRankBoost(leagueId: string, overall: number, appearances: number): number {
  if (overall < 80 || !PROMOTION_LEAGUES.has(leagueId)) return 0;

  const starBoost = Math.min(20, 4 + (overall - 80) * 1.25);
  const participation = Math.max(0.35, Math.min(1, appearances / 28));
  return starBoost * participation;
}

// Estrelas no peito da seleção na festa do título: as Copas que o país já tinha
// no mundo real mais as que o jogador ganhou nesta carreira (a desta temporada
// incluída).

/** Títulos mundiais reais de cada seleção antes da carreira começar. */
export const REAL_WORLD_CUP_TITLES: Record<string, number> = {
  brasil: 5,
  alemanha: 4,
  italia: 4,
  argentina: 3,
  franca: 2,
  uruguai: 2,
  inglaterra: 1,
  espanha: 1,
};

type NationalRecordLike = { season: number; name: string; champion: boolean; countryId?: string };

/** Copas do Mundo que o jogador ganhou por `countryId` até `season` (inclusive). */
export function careerWorldCupTitles(history: ReadonlyArray<NationalRecordLike>, countryId: string, season: number, fallbackCountryId = countryId) {
  return history.filter((record) => record.champion && record.name === "Copa do Mundo" && record.season <= season && (record.countryId ?? fallbackCountryId) === countryId).length;
}

/** Estrelas depois do título: nunca menos que as reais + 1 (a Copa que está sendo festejada). */
export function paradeStars(countryId: string, careerTitles: number) {
  const real = REAL_WORLD_CUP_TITLES[countryId] ?? 0;
  return real + Math.max(1, careerTitles);
}

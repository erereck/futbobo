/** Bônus oculto de produção, aplicado depois do arredondamento normal da temporada. */
export function eliteSeasonProduction(value: number, overall: number) {
  return overall >= 88 ? Math.round(value * 1.2) : value;
}

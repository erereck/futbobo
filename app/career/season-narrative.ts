import type { SeasonResult } from "./model";

/** Manchete curta para a tela anual, sempre ancorada no que o save registrou. */
export function seasonResultStory(result: SeasonResult, clubName: string) {
  const titles = result.competitions.filter((competition) => competition.champion);
  const production = result.position === "GOL"
    ? `${result.cleanSheets} jogos sem sofrer gol em ${result.appearances} partidas`
    : `${result.goals} gols e ${result.assists} assistências em ${result.appearances} partidas`;
  const seasonLine = `${clubName}: ${production}.`;

  if (titles.length > 1) return {
    headline: `${titles.length} taças com o ${clubName}`,
    detail: `${titles.map((title) => title.name).join(" e ")}. ${seasonLine}`,
  };
  if (titles.length === 1) return {
    headline: `${clubName} levanta ${titles[0].name}`,
    detail: seasonLine,
  };
  if (result.promotion) return {
    headline: `${clubName} sobe de divisão`,
    detail: `${result.promotion} ${seasonLine}`,
  };
  if (result.breakoutBonus > 0) return {
    headline: `Uma temporada fora da curva`,
    detail: `${seasonLine} A explosão de talento acrescentou ${result.breakoutBonus} OVR.`,
  };
  if (result.development > 0) return {
    headline: `+${result.development} OVR pelo ${clubName}`,
    detail: seasonLine,
  };
  if (result.development < 0) return {
    headline: `Ano difícil no ${clubName}`,
    detail: `${seasonLine} Seu nível caiu ${Math.abs(result.development)} OVR.`,
  };
  return {
    headline: `${result.appearances} jogos pelo ${clubName}`,
    detail: `${seasonLine} O nível terminou estável em ${result.overall} OVR.`,
  };
}

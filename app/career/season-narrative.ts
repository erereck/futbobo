import type { SeasonResult } from "./model";

/** Manchete curta para a tela anual, sempre ancorada no que o save registrou. */
export function seasonResultStory(result: SeasonResult, clubName: string) {
  const titles = result.competitions.filter((competition) => competition.champion);
  const production = result.position === "GOL"
    ? `${result.cleanSheets} ${result.cleanSheets === 1 ? "jogo" : "jogos"} sem sofrer gol em ${result.appearances} ${result.appearances === 1 ? "partida" : "partidas"}`
    : `${result.goals} ${result.goals === 1 ? "gol" : "gols"} e ${result.assists} ${result.assists === 1 ? "assistência" : "assistências"} em ${result.appearances} ${result.appearances === 1 ? "partida" : "partidas"}`;
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
    headline: `Salto de ${result.breakoutBonus} OVR no ${clubName}`,
    detail: `${seasonLine} A explosão de talento acrescentou ${result.breakoutBonus} OVR.`,
  };
  if (result.development > 0) return {
    headline: `+${result.development} OVR pelo ${clubName}`,
    detail: seasonLine,
  };
  if (result.development < 0) return {
    headline: `${clubName}: ${Math.abs(result.development)} OVR a menos`,
    detail: `${seasonLine} Seu nível caiu ${Math.abs(result.development)} OVR.`,
  };
  return {
    headline: `${result.appearances} jogos pelo ${clubName}`,
    detail: `${seasonLine} O nível terminou estável em ${result.overall} OVR.`,
  };
}

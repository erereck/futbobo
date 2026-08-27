import type { SeasonRecord, SeasonResult, StoredBotaoResult } from "./model";

function safeProduction(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

/**
 * Partidas jogáveis da seleção acontecem depois da simulação base da temporada.
 * Historicamente elas atualizavam apenas nationalGoals/nationalAssists e as
 * estatísticas do torneio, então o resumo anual ignorava essa produção.
 *
 * A lista de ids torna a reconciliação idempotente e também permite corrigir
 * saves antigos ao carregá-los sem duplicar gols/assistências nas próximas vezes.
 */
export function applyNationalBotaoProduction<T extends SeasonRecord | SeasonResult>(
  record: T,
  extraResult?: StoredBotaoResult,
): T {
  const botaoResults = [...(record.botaoResults ?? [])];
  if (extraResult && !botaoResults.some(({ match }) => match.id === extraResult.match.id)) {
    botaoResults.push(extraResult);
  }

  const applied = new Set(record.nationalBotaoProductionMatchIds ?? []);
  let goals = record.goals;
  let assists = record.assists;

  for (const stored of botaoResults) {
    if (stored.match.source !== "national" || applied.has(stored.match.id)) continue;
    goals += safeProduction(stored.result.playerGoals);
    assists += safeProduction(stored.result.playerAssists);
    applied.add(stored.match.id);
  }

  return {
    ...record,
    goals,
    assists,
    botaoResults,
    nationalBotaoProductionMatchIds: [...applied],
  };
}

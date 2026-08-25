import type { GameState, SeasonRecord, SeasonResult } from "./model";
import type { BotaoMatchResult } from "../botao/types";

export function compactBotaoMatchResult(result: BotaoMatchResult): BotaoMatchResult {
  const { replays: _replays, ...compact } = result;
  return compact;
}

function compactSeasonRecord<T extends SeasonRecord | SeasonResult>(record: T): T {
  if (!record.botaoResults?.length) return record;
  return {
    ...record,
    botaoResults: record.botaoResults.map(({ match, result }) => ({
      match,
      result: compactBotaoMatchResult(result),
    })),
  };
}

/**
 * Replays são dados efêmeros da tela pós-jogo. Cada gol pode carregar centenas
 * de coordenadas; arquivá-los em lastResult + history + lastBotaoResult fazia o
 * localStorage crescer até QuotaExceededError e derrubava o app no apito final.
 */
export function compactGameForPersistence(state: GameState): GameState {
  return {
    ...state,
    lastBotaoResult: state.lastBotaoResult
      ? {
          match: state.lastBotaoResult.match,
          result: compactBotaoMatchResult(state.lastBotaoResult.result),
        }
      : null,
    lastResult: state.lastResult ? compactSeasonRecord(state.lastResult) : null,
    history: state.history.map((record) => compactSeasonRecord(record)),
  };
}

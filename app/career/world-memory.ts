import { COUNTRIES, countryById } from "../game-data";
import type { GameState, SeasonRecord, StoredBotaoResult } from "./model";
import { clubById, seeded } from "./shared";

export type WorldNewsPriority = "major" | "normal";
export type WorldNewsCategory = "world-cup" | "career" | "transfer" | "award" | "rival" | "record";
export type WorldCompetitionKey = "world-cup" | "champions-league" | "libertadores";

export type WorldNewsItem = {
  id: string;
  season: number;
  category: WorldNewsCategory;
  priority: WorldNewsPriority;
  title: string;
  summary: string;
};

export type WorldCompetitionChampion = {
  season: number;
  winnerCountryId: string;
  runnerUpCountryId?: string;
  source: "historic" | "generated" | "player";
};

export type WorldCupRankingEntry = {
  countryId: string;
  titles: number;
  rank: number;
};

export type WorldCompetitionLedger = {
  id: WorldCompetitionKey;
  label: string;
  entityType: "country" | "club";
  champions: Array<{
    season: number;
    winnerId: string;
    runnerUpId?: string;
    source: "historic" | "generated" | "player";
  }>;
  titleTable: Array<{ entityId: string; titles: number; rank: number }>;
};

// Estrutura deixada pronta para recordes de clubes, artilheiros históricos,
// maiores transferências, Champions, Libertadores etc. A UI só mostra o que já
// possui dados confiáveis; não existem placeholders visuais.
export type WorldRecordEntry = {
  id: string;
  label: string;
  value: number;
  entityType: "player" | "club" | "country";
  entityId: string;
  season?: number;
};

export type WorldRecordBoard = {
  id: string;
  scope: "global" | "club" | "competition";
  subjectId?: string;
  label: string;
  unit: string;
  entries: WorldRecordEntry[];
};

export type WorldTransferRecord = {
  season: number;
  playerName: string;
  fromClubId: string;
  toClubId: string;
  fee: number;
};

export type WorldSnapshot = {
  news: WorldNewsItem[];
  worldCupChampions: WorldCompetitionChampion[];
  worldCupRanking: WorldCupRankingEntry[];
  competitionLedgers: WorldCompetitionLedger[];
  recordBoards: WorldRecordBoard[];
  transferRecords: WorldTransferRecord[];
};

// Títulos reconhecidos até a Copa de 2026. A partir de 2030 o universo de cada
// save diverge da realidade e passa a registrar seu próprio campeão mundial.
const HISTORIC_WORLD_CUP_TITLES: Record<string, number> = {
  brasil: 5,
  alemanha: 4,
  italia: 4,
  argentina: 3,
  franca: 2,
  uruguai: 2,
  espanha: 2,
  inglaterra: 1,
};

const HISTORIC_RECENT_WORLD_CUP: WorldCompetitionChampion = {
  season: 2026,
  winnerCountryId: "espanha",
  runnerUpCountryId: "argentina",
  source: "historic",
};

const MAJOR_COMPETITIONS = new Set([
  "championsLeague",
  "libertadores",
  "mundial",
  "domesticLeague",
]);

function worldCupMatches(state: GameState, season: number) {
  const stored: StoredBotaoResult[] = [];
  const record = state.history.find((item) => item.season === season);
  if (record?.botaoResults) stored.push(...record.botaoResults);
  if (state.lastResult?.season === season && state.lastResult.botaoResults) stored.push(...state.lastResult.botaoResults);
  const unique = new Map<string, StoredBotaoResult>();
  for (const result of stored) {
    if (result.match.source !== "national" || result.match.competitionName !== "Copa do Mundo") continue;
    unique.set(result.match.id, result);
  }
  return [...unique.values()];
}

function weightedCountryPick(
  state: GameState,
  season: number,
  salt: number,
  titles: Record<string, number>,
  excluded: Set<string>,
) {
  const candidates = COUNTRIES.filter((country) => !excluded.has(country.id));
  const scored = candidates.map((country, index) => {
    const historicPull = titles[country.id] ?? 0;
    const weight = Math.max(0.75, country.strength * country.strength + historicPull * 1.45);
    const roll = Math.max(0.000001, seeded(state.seed, season * 977 + salt + index * 43));
    return { country, score: Math.pow(roll, 1 / weight) };
  });
  scored.sort((a, b) => b.score - a.score || b.country.strength - a.country.strength);
  return scored[0]?.country.id ?? "brasil";
}

function resolveWorldCup(state: GameState, season: number, titles: Record<string, number>): WorldCompetitionChampion {
  const nationalRecord = state.nationalHistory.find((record) => record.season === season && record.name === "Copa do Mundo");
  const matches = worldCupMatches(state, season);
  const eliminatedByPlayer = new Set(
    matches.filter(({ result }) => result.champion).map(({ match }) => match.opponentId),
  );

  if (nationalRecord?.champion) {
    return { season, winnerCountryId: state.nationality, source: "player" };
  }

  if (nationalRecord?.stage === "Vice") {
    const finalLoss = matches.find(({ match, result }) => match.stageName === "Final" && !result.champion);
    if (finalLoss) {
      return {
        season,
        winnerCountryId: finalLoss.match.opponentId,
        runnerUpCountryId: state.nationality,
        source: "player",
      };
    }
  }

  const excluded = new Set(eliminatedByPlayer);
  if (nationalRecord && nationalRecord.stage !== "Não classificado") excluded.add(state.nationality);
  const winnerCountryId = weightedCountryPick(state, season, 31, titles, excluded);
  const runnerUpCountryId = nationalRecord?.stage === "Vice"
    ? state.nationality
    : weightedCountryPick(state, season, 79, titles, new Set([...excluded, winnerCountryId]));

  return { season, winnerCountryId, runnerUpCountryId, source: "generated" };
}

function competitionNews(record: SeasonRecord): WorldNewsItem[] {
  const club = clubById(record.clubId);
  const champions = record.competitions.filter((competition) => competition.champion);
  if (!champions.length) return [];
  const major = champions.find((competition) => MAJOR_COMPETITIONS.has(competition.id)) ?? champions[0];
  return [{
    id: `club-title-${record.season}-${major.id}-${record.clubId}`,
    season: record.season,
    category: "career",
    priority: MAJOR_COMPETITIONS.has(major.id) ? "major" : "normal",
    title: `${club.shortName} conquista ${major.name}`,
    summary: champions.length > 1 ? `${champions.length} títulos na temporada.` : "Título confirmado.",
  }];
}

function awardNews(state: GameState, record: SeasonRecord): WorldNewsItem[] {
  if (!record.awards.length) return [];
  const award = record.awards.includes("Bola de Ouro")
    ? "Bola de Ouro"
    : record.awards.find((item) => item.includes("MVP") || item.includes("Jogador do Ano") || item.includes("Rei da América"))
      ?? record.awards[0];
  const major = award === "Bola de Ouro" || award.includes("MVP") || award.includes("Rei da América");
  return [{
    id: `award-${record.season}-${award}`,
    season: record.season,
    category: "award",
    priority: major ? "major" : "normal",
    title: award === "Bola de Ouro" ? `${state.name} vence a Bola de Ouro` : `${state.name}: ${award}`,
    summary: `${clubById(record.clubId).shortName} · ${record.overall} OVR`,
  }];
}

function transferNews(state: GameState) {
  const news: WorldNewsItem[] = [];
  state.history.forEach((record, index) => {
    if (index === 0) return;
    const previous = state.history[index - 1];
    if (previous.clubId === record.clubId) return;
    const from = clubById(previous.clubId);
    const to = clubById(record.clubId);
    const hadPlayedThere = state.history.slice(0, index - 1).some((item) => item.clubId === record.clubId);
    news.push({
      id: `transfer-${record.season}-${from.id}-${to.id}`,
      season: record.season,
      category: "transfer",
      priority: hadPlayedThere ? "major" : "normal",
      title: hadPlayedThere ? `${state.name} volta ao ${to.shortName}` : `${state.name} troca ${from.shortName} por ${to.shortName}`,
      summary: hadPlayedThere ? "Reencontro com um antigo clube." : "Novo capítulo da carreira.",
    });
  });

  const last = state.history.at(-1);
  if (last && state.currentClubId && last.clubId !== state.currentClubId) {
    const to = clubById(state.currentClubId);
    const from = clubById(last.clubId);
    const returning = state.history.some((item) => item.clubId === state.currentClubId);
    news.push({
      id: `current-transfer-${state.season}-${from.id}-${to.id}`,
      season: state.season,
      category: "transfer",
      priority: returning ? "major" : "normal",
      title: returning ? `${state.name} está de volta ao ${to.shortName}` : `${state.name} chega ao ${to.shortName}`,
      summary: returning ? "O mundo lembra dessa camisa." : `Saída do ${from.shortName}.`,
    });
  }
  return news;
}

function formerClubNews(state: GameState): WorldNewsItem[] {
  const news: WorldNewsItem[] = [];
  const previouslyRepresented = new Set<string>();
  for (const record of state.history) {
    const seenOpponents = new Set<string>();
    for (const stored of record.botaoResults ?? []) {
      if (stored.match.source !== "club" || !previouslyRepresented.has(stored.match.opponentId) || seenOpponents.has(stored.match.opponentId)) continue;
      seenOpponents.add(stored.match.opponentId);
      const opponent = clubById(stored.match.opponentId);
      news.push({
        id: `former-club-${record.season}-${record.clubId}-${opponent.id}`,
        season: record.season,
        category: "career",
        priority: "major",
        title: `${state.name} reencontra o ${opponent.shortName}`,
        summary: `${stored.match.competitionName} · ${stored.result.goalsFor} × ${stored.result.goalsAgainst}.`,
      });
    }
    previouslyRepresented.add(record.clubId);
  }
  return news;
}

function careerMilestoneNews(state: GameState): WorldNewsItem[] {
  if (state.position === "GOL") return [];
  const thresholds = [100, 200, 300, 400, 500, 600, 700, 800];
  const news: WorldNewsItem[] = [];
  let total = 0;
  let nextThresholdIndex = 0;
  for (const record of state.history) {
    const before = total;
    total += record.goals;
    while (nextThresholdIndex < thresholds.length) {
      const threshold = thresholds[nextThresholdIndex];
      if (total < threshold) break;
      if (before < threshold) {
        news.push({
          id: `career-goals-${threshold}`,
          season: record.season,
          category: "record",
          priority: threshold >= 300 ? "major" : "normal",
          title: `${state.name} chega a ${threshold} gols`,
          summary: `${clubById(record.clubId).shortName} · marca histórica da carreira.`,
        });
      }
      nextThresholdIndex += 1;
    }
  }
  return news;
}

function nationalNews(state: GameState) {
  return state.nationalHistory
    .filter((record) => record.champion && record.name !== "Copa do Mundo")
    .map<WorldNewsItem>((record) => ({
      id: `national-${record.season}-${record.name}`,
      season: record.season,
      category: "career",
      priority: "major",
      title: `${countryById(state.nationality).name} vence ${record.name}`,
      summary: `${state.name} fez parte do título.`,
    }));
}

function rivalNews(state: GameState): WorldNewsItem[] {
  if (!state.rivals.length || !state.history.length || seeded(state.seed, state.season * 1291 + 17) < 0.62) return [];
  const rival = [...state.rivals]
    .filter((item) => item.active)
    .sort((a, b) => b.awards - a.awards || b.overall - a.overall)[0];
  if (!rival || (rival.awards === 0 && rival.overall < 84)) return [];
  return [{
    id: `rival-${state.season}-${rival.id}`,
    season: state.season,
    category: "rival",
    priority: rival.awards >= 3 || rival.overall >= 90 ? "major" : "normal",
    title: rival.awards > 0 ? `${rival.name} também está colecionando prêmios` : `${rival.name} chama atenção`,
    summary: `${clubById(rival.currentClubId).shortName} · ${rival.overall} OVR · ${rival.awards} prêmio(s)`,
  }];
}

function rankedWorldCupTable(titles: Record<string, number>, playerCountryId: string) {
  let previousTitles = -1;
  let previousRank = 0;
  return COUNTRIES
    .map((country) => ({ countryId: country.id, titles: titles[country.id] ?? 0 }))
    .filter((entry) => entry.titles > 0 || entry.countryId === playerCountryId)
    .sort((a, b) => b.titles - a.titles || countryById(a.countryId).name.localeCompare(countryById(b.countryId).name, "pt-BR"))
    .map((entry, index) => {
      if (entry.titles !== previousTitles) previousRank = index + 1;
      previousTitles = entry.titles;
      return { ...entry, rank: previousRank };
    });
}

export function buildWorldSnapshot(state: GameState): WorldSnapshot {
  const titles = { ...HISTORIC_WORLD_CUP_TITLES };
  const champions: WorldCompetitionChampion[] = [HISTORIC_RECENT_WORLD_CUP];
  const worldCupNews: WorldNewsItem[] = [];
  const latestCompletedSeason = Math.max(2026, ...state.history.map((record) => record.season));

  for (let season = 2030; season <= latestCompletedSeason; season += 4) {
    const result = resolveWorldCup(state, season, titles);
    champions.push(result);
    titles[result.winnerCountryId] = (titles[result.winnerCountryId] ?? 0) + 1;
    const winner = countryById(result.winnerCountryId);
    worldCupNews.push({
      id: `world-cup-${result.season}-${result.winnerCountryId}`,
      season: result.season,
      category: "world-cup",
      priority: "major",
      title: `${winner.name} é campeão do mundo`,
      summary: `${result.season} · agora soma ${titles[result.winnerCountryId]} título(s) na história.`,
    });
  }

  const careerNews = state.history.flatMap((record) => [
    ...competitionNews(record),
    ...awardNews(state, record),
  ]);

  const news = [
    ...worldCupNews,
    ...careerNews,
    ...transferNews(state),
    ...formerClubNews(state),
    ...careerMilestoneNews(state),
    ...nationalNews(state),
    ...rivalNews(state),
  ];

  const unique = new Map(news.map((item) => [item.id, item]));
  const sortedNews = [...unique.values()].sort((a, b) =>
    b.season - a.season || Number(b.priority === "major") - Number(a.priority === "major") || a.title.localeCompare(b.title, "pt-BR"),
  );

  const ranking = rankedWorldCupTable(titles, state.nationality);
  const worldCupLedger: WorldCompetitionLedger = {
    id: "world-cup",
    label: "Copa do Mundo",
    entityType: "country",
    champions: champions.map((champion) => ({
      season: champion.season,
      winnerId: champion.winnerCountryId,
      runnerUpId: champion.runnerUpCountryId,
      source: champion.source,
    })),
    titleTable: ranking.map((entry) => ({ entityId: entry.countryId, titles: entry.titles, rank: entry.rank })),
  };

  return {
    news: sortedNews,
    worldCupChampions: champions,
    worldCupRanking: ranking,
    competitionLedgers: [worldCupLedger],
    recordBoards: [],
    transferRecords: [],
  };
}

export function worldPulseForState(state: GameState) {
  const snapshot = buildWorldSnapshot(state);
  const fresh = snapshot.news.filter((item) => item.season >= state.season - 1);
  return fresh.find((item) => item.priority === "major") ?? fresh[0] ?? null;
}

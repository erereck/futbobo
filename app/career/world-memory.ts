import { COUNTRIES, countryById } from "../game-data";
import type { GameState, SeasonRecord, StoredBotaoResult } from "./model";
import { clubById, seeded } from "./shared";

export type WorldNewsPriority = "major" | "normal";
export type WorldNewsCategory = "world-cup" | "career" | "transfer" | "award" | "rival" | "record";

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
  recordBoards: WorldRecordBoard[];
  transferRecords: WorldTransferRecord[];
};

// Títulos reconhecidos até a Copa de 2026. O save diverge da realidade a partir
// de 2034; a Copa de 2030 fica propositalmente fora do ledger para não criar um
// fato mundial enquanto o jogador ainda está atravessando a base.
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
  if (!state.rivals.length || !state.history.length) return [];
  return [...state.rivals]
    .filter((rival) => rival.active)
    .sort((a, b) => b.awards - a.awards || b.overall - a.overall)
    .slice(0, 2)
    .map((rival, index) => ({
      id: `rival-${state.season}-${rival.id}`,
      season: state.season,
      category: "rival" as const,
      priority: rival.awards >= 3 || rival.overall >= 90 ? "major" as const : "normal" as const,
      title: index === 0 && rival.awards > 0 ? `${rival.name} também está colecionando prêmios` : `${rival.name} segue em alta`,
      summary: `${clubById(rival.currentClubId).shortName} · ${rival.overall} OVR · ${rival.awards} prêmio(s)`,
    }));
}

export function buildWorldSnapshot(state: GameState): WorldSnapshot {
  const titles = { ...HISTORIC_WORLD_CUP_TITLES };
  const champions: WorldCompetitionChampion[] = [HISTORIC_RECENT_WORLD_CUP];
  const latestCompletedSeason = Math.max(2026, ...state.history.map((record) => record.season));

  for (let season = 2034; season <= latestCompletedSeason; season += 4) {
    const result = resolveWorldCup(state, season, titles);
    champions.push(result);
    titles[result.winnerCountryId] = (titles[result.winnerCountryId] ?? 0) + 1;
  }

  const worldCupNews = champions
    .filter((champion) => champion.season >= 2034)
    .map<WorldNewsItem>((champion) => {
      const winner = countryById(champion.winnerCountryId);
      const titleCount = titles[champion.winnerCountryId] ?? 1;
      return {
        id: `world-cup-${champion.season}-${champion.winnerCountryId}`,
        season: champion.season,
        category: "world-cup",
        priority: "major",
        title: `${winner.name} é campeão do mundo`,
        summary: `${champion.season} · agora soma ${titleCount} título(s) na história.`,
      };
    });

  const careerNews = state.history.flatMap((record) => [
    ...competitionNews(record),
    ...awardNews(state, record),
  ]);

  const news = [
    ...worldCupNews,
    ...careerNews,
    ...transferNews(state),
    ...nationalNews(state),
    ...rivalNews(state),
  ];

  const unique = new Map(news.map((item) => [item.id, item]));
  const sortedNews = [...unique.values()].sort((a, b) =>
    b.season - a.season || Number(b.priority === "major") - Number(a.priority === "major") || a.title.localeCompare(b.title, "pt-BR"),
  );

  const ranking = COUNTRIES
    .map((country) => ({ countryId: country.id, titles: titles[country.id] ?? 0 }))
    .filter((entry) => entry.titles > 0 || entry.countryId === state.nationality)
    .sort((a, b) => b.titles - a.titles || countryById(a.countryId).name.localeCompare(countryById(b.countryId).name, "pt-BR"))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return {
    news: sortedNews,
    worldCupChampions: champions,
    worldCupRanking: ranking,
    recordBoards: [],
    transferRecords: [],
  };
}

export function worldPulseForState(state: GameState) {
  const snapshot = buildWorldSnapshot(state);
  const fresh = snapshot.news.filter((item) => item.season >= state.season - 1);
  return fresh.find((item) => item.priority === "major") ?? fresh[0] ?? null;
}

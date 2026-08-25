import { CLUBS } from "../game-data";
import type { GameState, SeasonRecord } from "./model";
import { clubById, seeded } from "./shared";

export type DomesticTitleLedger = {
  id: string;
  label: string;
  countryId: string;
  entityType: "club";
  champions: Array<{
    season: number;
    winnerId: string;
    source: "generated" | "player";
  }>;
  titleTable: Array<{ entityId: string; titles: number; rank: number }>;
};

type DomesticCompetitionConfig = {
  id: string;
  label: string;
  countryId: string;
  leagueId: string;
  competitionId: "domesticLeague" | "domesticCup";
  historicTitles: Record<string, number>;
};

/**
 * Base histórica do arquivo. O objetivo aqui é dar contexto aos campeonatos
 * nacionais antes do começo do universo do save; de 2027 em diante cada
 * carreira passa a escrever a própria história.
 */
const DOMESTIC_COMPETITIONS: DomesticCompetitionConfig[] = [
  {
    id: "domestic-brasileirao",
    label: "Brasil · Brasileirão",
    countryId: "brasil",
    leagueId: "brasileirao",
    competitionId: "domesticLeague",
    historicTitles: {
      Palmeiras: 12,
      Santos: 8,
      Flamengo: 8,
      Corinthians: 7,
      "São Paulo": 6,
      Cruzeiro: 4,
      Vasco: 4,
      Fluminense: 4,
      "Atlético Mineiro": 3,
      Internacional: 3,
      Botafogo: 3,
      Grêmio: 2,
      Bahia: 2,
    },
  },
  {
    id: "domestic-copa-do-brasil",
    label: "Brasil · Copa do Brasil",
    countryId: "brasil",
    leagueId: "brasileirao",
    competitionId: "domesticCup",
    historicTitles: {
      Cruzeiro: 6,
      Grêmio: 5,
      Flamengo: 5,
      Palmeiras: 4,
      Corinthians: 3,
      "Atlético Mineiro": 2,
      "São Paulo": 1,
      Fluminense: 1,
      Internacional: 1,
      "Athletico Paranaense": 1,
    },
  },
  {
    id: "domestic-premier",
    label: "Inglaterra · Premier League",
    countryId: "inglaterra",
    leagueId: "premier",
    competitionId: "domesticLeague",
    historicTitles: {
      "Manchester United": 20,
      Liverpool: 20,
      Arsenal: 13,
      "Manchester City": 10,
      Everton: 9,
      "Aston Villa": 7,
      Chelsea: 6,
      Sunderland: 6,
    },
  },
  {
    id: "domestic-fa-cup",
    label: "Inglaterra · FA Cup",
    countryId: "inglaterra",
    leagueId: "premier",
    competitionId: "domesticCup",
    historicTitles: {
      Arsenal: 14,
      "Manchester United": 13,
      Chelsea: 8,
      Liverpool: 8,
      Tottenham: 8,
      "Aston Villa": 7,
      "Manchester City": 7,
      Newcastle: 6,
    },
  },
  {
    id: "domestic-laliga",
    label: "Espanha · La Liga",
    countryId: "espanha",
    leagueId: "laliga",
    competitionId: "domesticLeague",
    historicTitles: {
      "Real Madrid": 36,
      Barcelona: 28,
      "Atlético de Madrid": 11,
      "Athletic Bilbao": 8,
      Valencia: 6,
      "Real Sociedad": 2,
      Sevilla: 1,
      Betis: 1,
    },
  },
  {
    id: "domestic-copa-del-rey",
    label: "Espanha · Copa del Rey",
    countryId: "espanha",
    leagueId: "laliga",
    competitionId: "domesticCup",
    historicTitles: {
      Barcelona: 32,
      "Athletic Bilbao": 24,
      "Real Madrid": 20,
      "Atlético de Madrid": 10,
      Valencia: 8,
      Sevilla: 5,
      Betis: 3,
      "Real Sociedad": 3,
    },
  },
  {
    id: "domestic-serie-a",
    label: "Itália · Serie A",
    countryId: "italia",
    leagueId: "seriea",
    competitionId: "domesticLeague",
    historicTitles: {
      Juventus: 36,
      "Inter de Milão": 20,
      Milan: 19,
      Bologna: 7,
      Torino: 7,
      Napoli: 4,
      Roma: 3,
      Lazio: 2,
    },
  },
  {
    id: "domestic-coppa-italia",
    label: "Itália · Coppa Italia",
    countryId: "italia",
    leagueId: "seriea",
    competitionId: "domesticCup",
    historicTitles: {
      Juventus: 15,
      Roma: 9,
      "Inter de Milão": 9,
      Lazio: 7,
      Napoli: 6,
      Fiorentina: 6,
      Milan: 5,
      Torino: 5,
    },
  },
  {
    id: "domestic-bundesliga",
    label: "Alemanha · Bundesliga",
    countryId: "alemanha",
    leagueId: "bundesliga",
    competitionId: "domesticLeague",
    historicTitles: {
      "Bayern de Munique": 34,
      "Borussia Dortmund": 5,
      "Borussia Mönchengladbach": 5,
      Bremen: 4,
      Stuttgart: 3,
      Hamburgo: 3,
    },
  },
  {
    id: "domestic-dfb-pokal",
    label: "Alemanha · DFB-Pokal",
    countryId: "alemanha",
    leagueId: "bundesliga",
    competitionId: "domesticCup",
    historicTitles: {
      "Bayern de Munique": 20,
      Bremen: 6,
      "Schalke 04": 5,
      "Borussia Dortmund": 5,
      "Eintracht Frankfurt": 5,
      "Bayer Leverkusen": 2,
    },
  },
  {
    id: "domestic-ligue-1",
    label: "França · Ligue 1",
    countryId: "franca",
    leagueId: "ligue1",
    competitionId: "domesticLeague",
    historicTitles: {
      "Paris Saint-Germain": 13,
      "Saint-Étienne": 10,
      "Olympique de Marselha": 9,
      "AS Monaco": 8,
      Nantes: 8,
      "Olympique de Lyon": 7,
      Lille: 4,
    },
  },
  {
    id: "domestic-coupe-de-france",
    label: "França · Coupe de France",
    countryId: "franca",
    leagueId: "ligue1",
    competitionId: "domesticCup",
    historicTitles: {
      "Paris Saint-Germain": 16,
      "Olympique de Marselha": 10,
      "Saint-Étienne": 6,
      Lille: 6,
      "AS Monaco": 5,
      "Olympique de Lyon": 5,
    },
  },
  {
    id: "domestic-primeira",
    label: "Portugal · Primeira Liga",
    countryId: "portugal",
    leagueId: "primeira",
    competitionId: "domesticLeague",
    historicTitles: {
      Benfica: 38,
      Porto: 30,
      Sporting: 21,
      Boavista: 1,
    },
  },
  {
    id: "domestic-taca-portugal",
    label: "Portugal · Taça de Portugal",
    countryId: "portugal",
    leagueId: "primeira",
    competitionId: "domesticCup",
    historicTitles: {
      Benfica: 26,
      Porto: 20,
      Sporting: 18,
      Braga: 3,
      Boavista: 5,
    },
  },
  {
    id: "domestic-eredivisie",
    label: "Holanda · Eredivisie",
    countryId: "holanda",
    leagueId: "eredivisie",
    competitionId: "domesticLeague",
    historicTitles: {
      Ajax: 36,
      PSV: 26,
      Feyenoord: 16,
      AZ: 2,
      Twente: 1,
    },
  },
  {
    id: "domestic-knvb-beker",
    label: "Holanda · KNVB Beker",
    countryId: "holanda",
    leagueId: "eredivisie",
    competitionId: "domesticCup",
    historicTitles: {
      Ajax: 20,
      Feyenoord: 14,
      PSV: 12,
      AZ: 4,
      Twente: 3,
    },
  },
];

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveClubId(label: string) {
  const target = normalized(label);
  return CLUBS.find((club) =>
    normalized(club.name) === target ||
    normalized(club.shortName) === target ||
    normalized(club.abbr) === target
  )?.id ?? "";
}

function historicalTitles(config: DomesticCompetitionConfig) {
  const titles: Record<string, number> = {};
  Object.entries(config.historicTitles).forEach(([label, count]) => {
    const clubId = resolveClubId(label);
    if (clubId) titles[clubId] = Math.max(titles[clubId] ?? 0, count);
  });
  return titles;
}

function rankedTitles(titles: Record<string, number>) {
  let previousTitles = -1;
  let rank = 0;
  return Object.entries(titles)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || clubById(a[0]).shortName.localeCompare(clubById(b[0]).shortName, "pt-BR"))
    .map(([entityId, count], index) => {
      if (count !== previousTitles) rank = index + 1;
      previousTitles = count;
      return { entityId, titles: count, rank };
    });
}

function seasonRecords(state: GameState) {
  const records = [...state.history];
  if (state.lastResult && !records.some((record) => record.season === state.lastResult?.season)) records.push(state.lastResult);
  return records;
}

function recordLeagueId(record: SeasonRecord) {
  return record.leagueId || clubById(record.clubId).leagueId;
}

function pickGeneratedWinner(
  state: GameState,
  config: DomesticCompetitionConfig,
  season: number,
  titles: Record<string, number>,
  excludedClubIds: Set<string>,
) {
  const candidates = CLUBS.filter((club) =>
    club.leagueId === config.leagueId &&
    club.countryId === config.countryId &&
    !excludedClubIds.has(club.id)
  );
  const fallback = candidates.length
    ? candidates
    : CLUBS.filter((club) => club.countryId === config.countryId && !excludedClubIds.has(club.id));

  return fallback
    .map((club, index) => {
      const historyPull = titles[club.id] ?? 0;
      const weight = Math.max(1, club.strength ** 2.25 + club.reputation ** 3 * 26 + historyPull * 34);
      const roll = Math.max(0.000001, seeded(state.seed, season * 9209 + config.id.length * 67 + index * 47));
      return { clubId: club.id, score: Math.pow(roll, 1 / weight) };
    })
    .sort((a, b) => b.score - a.score)[0]?.clubId ?? fallback[0]?.id ?? CLUBS[0].id;
}

function buildDomesticCompetition(
  state: GameState,
  config: DomesticCompetitionConfig,
  records: SeasonRecord[],
  latestCompletedSeason: number,
): DomesticTitleLedger {
  const titles = historicalTitles(config);
  const champions: DomesticTitleLedger["champions"] = [];

  for (let season = 2027; season <= latestCompletedSeason; season += 1) {
    const playerRecord = records.find((record) => record.season === season && recordLeagueId(record) === config.leagueId);
    const competition = playerRecord?.competitions.find((item) => item.id === config.competitionId);
    const playerWon = Boolean(playerRecord && competition?.champion);
    const excludedClubIds = new Set<string>();
    if (playerRecord && !playerWon) excludedClubIds.add(playerRecord.clubId);
    const winnerId = playerWon
      ? playerRecord!.clubId
      : pickGeneratedWinner(state, config, season, titles, excludedClubIds);

    titles[winnerId] = (titles[winnerId] ?? 0) + 1;
    champions.push({ season, winnerId, source: playerWon ? "player" : "generated" });
  }

  return {
    id: config.id,
    label: config.label,
    countryId: config.countryId,
    entityType: "club",
    champions,
    titleTable: rankedTitles(titles),
  };
}

export function buildDomesticTitleArchive(state: GameState): DomesticTitleLedger[] {
  const records = seasonRecords(state);
  const latestCompletedSeason = Math.max(2026, ...records.map((record) => record.season));
  return DOMESTIC_COMPETITIONS.map((config) => buildDomesticCompetition(state, config, records, latestCompletedSeason));
}

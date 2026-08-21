import { CLUBS, leagueById } from "../game-data";
import type { GameState } from "./model";
import { clubConfederation } from "./academy";
import { seeded } from "./shared";

export type LivingClubCompetitionId = "champions-league" | "libertadores";

export type LivingClubChampion = {
  season: number;
  winnerId: string;
  source: "generated" | "player";
};

export type LivingClubCompetition = {
  id: LivingClubCompetitionId;
  label: string;
  champions: LivingClubChampion[];
  titleTable: Array<{ entityId: string; titles: number; rank: number }>;
  news: Array<{
    id: string;
    season: number;
    category: "career";
    priority: "major";
    title: string;
    summary: string;
  }>;
};

type CompetitionConfig = {
  id: LivingClubCompetitionId;
  label: string;
  competitionId: "championsLeague" | "libertadores";
  confederation: "EUROPE" | "SOUTH_AMERICA";
  historicTitles: Record<string, number>;
};

const CONFIGS: CompetitionConfig[] = [
  {
    id: "champions-league",
    label: "Champions League",
    competitionId: "championsLeague",
    confederation: "EUROPE",
    historicTitles: {
      "Real Madrid": 15,
      Milan: 7,
      Liverpool: 6,
      "Bayern de Munique": 6,
      Barcelona: 5,
      Ajax: 4,
      "Inter de Milão": 3,
      "Manchester United": 3,
      "Paris Saint-Germain": 2,
      Chelsea: 2,
      Juventus: 2,
      Benfica: 2,
      "Nottingham Forest": 2,
      Porto: 2,
    },
  },
  {
    id: "libertadores",
    label: "Libertadores",
    competitionId: "libertadores",
    confederation: "SOUTH_AMERICA",
    historicTitles: {
      Independiente: 7,
      "Boca Juniors": 6,
      "Peñarol": 5,
      "River Plate": 4,
      Estudiantes: 4,
      Flamengo: 4,
      Olimpia: 3,
      Nacional: 3,
      "São Paulo": 3,
      Santos: 3,
      "Grêmio": 3,
      Palmeiras: 3,
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

function historicalTitles(config: CompetitionConfig) {
  const titles: Record<string, number> = {};
  Object.entries(config.historicTitles).forEach(([label, count]) => {
    const id = resolveClubId(label);
    if (id) titles[id] = Math.max(titles[id] ?? 0, count);
  });
  return titles;
}

function worldPlayerSquadBoost(state: GameState, clubId: string) {
  return Object.values(state.worldPlayers?.players ?? {})
    .filter((player) => player.status !== "retired" && player.currentClubId === clubId)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 4)
    .reduce((total, player) => total + Math.max(0, player.overall - 76) * 1.45, 0);
}

function pickWinner(
  state: GameState,
  config: CompetitionConfig,
  season: number,
  titles: Record<string, number>,
  excludedClubId: string,
) {
  const available = CLUBS.filter((club) =>
    club.id !== excludedClubId && clubConfederation(club) === config.confederation
  );
  const elite = available.filter((club) => club.reputation >= 4 || (titles[club.id] ?? 0) >= 2);
  const strong = available.filter((club) => club.reputation >= 3 || (titles[club.id] ?? 0) >= 1);
  const upset = seeded(state.seed, season * 5501 + (config.id === "champions-league" ? 17 : 43)) < 0.1;
  const candidates = upset && strong.length ? strong : elite.length ? elite : strong.length ? strong : available;

  return candidates
    .map((club, index) => {
      const league = leagueById(club.leagueId);
      const historyPull = titles[club.id] ?? 0;
      const squadBoost = worldPlayerSquadBoost(state, club.id);
      const weight = Math.max(
        1,
        club.reputation ** 4 * 4 +
        league.prestige ** 3 * 2.5 +
        historyPull * 24 +
        squadBoost,
      );
      const roll = Math.max(0.000001, seeded(state.seed, season * 5801 + index * 67 + (config.id === "champions-league" ? 5 : 29)));
      return { clubId: club.id, score: Math.pow(roll, 1 / weight) };
    })
    .sort((a, b) => b.score - a.score)[0]?.clubId ?? available[0]?.id ?? CLUBS[0].id;
}

function rankedTitles(titles: Record<string, number>) {
  let previousTitles = -1;
  let rank = 0;
  return Object.entries(titles)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([entityId, count], index) => {
      if (count !== previousTitles) rank = index + 1;
      previousTitles = count;
      return { entityId, titles: count, rank };
    });
}

export function buildLivingClubCompetitions(state: GameState): LivingClubCompetition[] {
  const latestCompletedSeason = Math.max(2026, ...state.history.map((record) => record.season));

  return CONFIGS.map((config) => {
    const titles = historicalTitles(config);
    const champions: LivingClubChampion[] = [];
    const news: LivingClubCompetition["news"] = [];

    for (let season = 2027; season <= latestCompletedSeason; season += 1) {
      const playerRecord = state.history.find((record) => record.season === season);
      const playerCompetition = playerRecord?.competitions.find((competition) => competition.id === config.competitionId);
      const playerWon = Boolean(playerRecord && playerCompetition?.champion);
      const winnerId = playerWon
        ? playerRecord!.clubId
        : pickWinner(state, config, season, titles, playerRecord?.clubId ?? "");
      const source: LivingClubChampion["source"] = playerWon ? "player" : "generated";

      titles[winnerId] = (titles[winnerId] ?? 0) + 1;
      champions.push({ season, winnerId, source });

      if (source === "generated") {
        const club = CLUBS.find((item) => item.id === winnerId);
        if (club) {
          news.push({
            id: `world-${config.id}-${season}-${winnerId}`,
            season,
            category: "career",
            priority: "major",
            title: `${club.shortName} conquista ${config.label}`,
            summary: `${season} · ${titles[winnerId]} título(s) no histórico deste universo.`,
          });
        }
      }
    }

    return {
      id: config.id,
      label: config.label,
      champions,
      titleTable: rankedTitles(titles),
      news,
    };
  });
}

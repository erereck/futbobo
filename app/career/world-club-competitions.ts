import { CLUBS, leagueById } from "../game-data";
import type { Country } from "../game-data";
import type { GameState, SeasonRecord } from "./model";
import { clubConfederation } from "./academy";
import { seeded } from "./shared";

export type LivingClubCompetitionId =
  | "champions-league"
  | "europa-league"
  | "conference-league"
  | "libertadores"
  | "sudamericana"
  | "concacaf-champions"
  | "afc-champions"
  | "caf-champions"
  | "mundial";

type ContinentalLivingClubCompetitionId = Exclude<LivingClubCompetitionId, "mundial">;

type LivingCompetitionGameId =
  | "championsLeague"
  | "europaLeague"
  | "conferenceLeague"
  | "libertadores"
  | "sudamericana"
  | "concacafChampions"
  | "afcChampions"
  | "cafChampions";

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
  id: ContinentalLivingClubCompetitionId;
  label: string;
  competitionId: LivingCompetitionGameId;
  confederation: Country["confederation"];
  historicTitles: Record<string, number>;
};

const PRIMARY_WORLD_FEEDERS = new Set<LivingClubCompetitionId>([
  "champions-league",
  "libertadores",
  "concacaf-champions",
  "afc-champions",
  "caf-champions",
]);

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
    id: "europa-league",
    label: "Europa League",
    competitionId: "europaLeague",
    confederation: "EUROPE",
    historicTitles: {
      Sevilla: 7,
      Liverpool: 3,
      Juventus: 3,
      "Inter de Milão": 3,
      "Atlético de Madrid": 3,
      Tottenham: 3,
      Chelsea: 2,
      Porto: 2,
      "Eintracht Frankfurt": 2,
    },
  },
  {
    id: "conference-league",
    label: "Conference League",
    competitionId: "conferenceLeague",
    confederation: "EUROPE",
    historicTitles: {},
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
  {
    id: "sudamericana",
    label: "Copa Sul-Americana",
    competitionId: "sudamericana",
    confederation: "SOUTH_AMERICA",
    historicTitles: {
      "Boca Juniors": 2,
      Independiente: 2,
      "Athletico Paranaense": 2,
      "Independiente del Valle": 2,
      "LDU Quito": 2,
      Lanús: 2,
    },
  },
  {
    id: "concacaf-champions",
    label: "Concacaf Champions Cup",
    competitionId: "concacafChampions",
    confederation: "NORTH_AMERICA",
    historicTitles: {
      "Club América": 7,
      "Cruz Azul": 7,
    },
  },
  {
    id: "afc-champions",
    label: "AFC Champions League",
    competitionId: "afcChampions",
    confederation: "ASIA",
    historicTitles: {
      "Al-Hilal": 4,
      "Urawa Red Diamonds": 3,
    },
  },
  {
    id: "caf-champions",
    label: "CAF Champions League",
    competitionId: "cafChampions",
    confederation: "AFRICA",
    historicTitles: {
      "Al Ahly": 12,
      Zamalek: 5,
      "TP Mazembe": 5,
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
  const salt = config.id.length * 71;
  const upset = seeded(state.seed, season * 5501 + salt) < 0.1;
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
      const roll = Math.max(0.000001, seeded(state.seed, season * 5801 + index * 67 + salt));
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

function buildContinentalCompetition(state: GameState, config: CompetitionConfig, latestCompletedSeason: number): LivingClubCompetition {
  const titles = historicalTitles(config);
  const champions: LivingClubChampion[] = [];
  const news: LivingClubCompetition["news"] = [];

  for (let season = 2027; season <= latestCompletedSeason; season += 1) {
    const playerRecord = state.history.find((record) => record.season === season);
    const playerCompetition = playerRecord?.competitions.find((competition) => competition.id === config.competitionId);
    const playerWon = Boolean(playerRecord && playerCompetition?.champion);
    const winnerId = playerWon
      ? playerRecord!.clubId
      : pickWinner(state, config, season, titles, playerCompetition ? playerRecord?.clubId ?? "" : "");
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
}

function actualMundialFinalWinner(record: SeasonRecord | undefined) {
  if (!record) return "";
  const finalLoss = record.botaoResults?.find(({ match, result }) =>
    match.source === "club" &&
    match.competitionId === "mundial" &&
    match.stageName === "Final" &&
    !result.champion
  );
  return finalLoss?.match.opponentId ?? "";
}

function continentalChampionIdsForSeason(competitions: LivingClubCompetition[], season: number) {
  return competitions
    .filter((competition) => PRIMARY_WORLD_FEEDERS.has(competition.id))
    .map((competition) => ({
      competitionId: competition.id,
      clubId: competition.champions.find((entry) => entry.season === season)?.winnerId ?? "",
    }))
    .filter((entry) => entry.clubId);
}

function pickMundialUpsetWinner(
  state: GameState,
  season: number,
  excludedClubIds: Set<string>,
  continentalChampions: Array<{ competitionId: LivingClubCompetitionId; clubId: string }>,
) {
  const eligibleChampionIds = new Set(
    continentalChampions
      .map((entry) => entry.clubId)
      .filter((clubId) => clubId && !excludedClubIds.has(clubId)),
  );
  const continentalPool = CLUBS.filter((club) => eligibleChampionIds.has(club.id));
  const available = continentalPool.length
    ? continentalPool
    : CLUBS.filter((club) => !excludedClubIds.has(club.id));

  return available
    .map((club, index) => {
      const league = leagueById(club.leagueId);
      const squadBoost = worldPlayerSquadBoost(state, club.id);
      const wonLibertadores = continentalChampions.some((entry) => entry.competitionId === "libertadores" && entry.clubId === club.id);
      const wonContinental = continentalChampions.some((entry) => entry.clubId === club.id);
      const continentalBoost = wonLibertadores ? 340 : wonContinental ? 170 : 0;
      const weight = Math.max(
        1,
        club.reputation ** 4 * 3.4 +
        league.prestige ** 3 * 1.8 +
        squadBoost +
        continentalBoost,
      );
      const roll = Math.max(0.000001, seeded(state.seed, season * 6907 + index * 79 + 53));
      return { clubId: club.id, score: Math.pow(roll, 1 / weight) };
    })
    .sort((a, b) => b.score - a.score)[0]?.clubId ?? available[0]?.id ?? CLUBS[0].id;
}

function buildMundialCompetition(
  state: GameState,
  latestCompletedSeason: number,
  continentalCompetitions: LivingClubCompetition[],
): LivingClubCompetition {
  const titles: Record<string, number> = {};
  const champions: LivingClubChampion[] = [];
  const news: LivingClubCompetition["news"] = [];
  const championsLeague = continentalCompetitions.find((competition) => competition.id === "champions-league")!;

  for (let season = 2027; season <= latestCompletedSeason; season += 1) {
    const playerRecord = state.history.find((record) => record.season === season);
    const playerMundial = playerRecord?.competitions.find((competition) => competition.id === "mundial");
    const playerCompeted = Boolean(playerMundial);
    const playerWon = Boolean(playerRecord && playerMundial?.champion);
    const championsWinnerId = championsLeague.champions.find((entry) => entry.season === season)?.winnerId ?? "";
    const continentalChampions = continentalChampionIdsForSeason(continentalCompetitions, season);

    let winnerId = "";
    let source: LivingClubChampion["source"] = "generated";

    if (playerWon && playerRecord) {
      winnerId = playerRecord.clubId;
      source = "player";
    } else if (playerCompeted) {
      winnerId = actualMundialFinalWinner(playerRecord);
      if (!winnerId) {
        winnerId = pickMundialUpsetWinner(
          state,
          season,
          new Set([playerRecord?.clubId ?? ""]),
          continentalChampions,
        );
      }
    } else {
      const championsTakesIt = Boolean(championsWinnerId) && seeded(state.seed, season * 6803 + 37) < 0.93;
      winnerId = championsTakesIt
        ? championsWinnerId
        : pickMundialUpsetWinner(
          state,
          season,
          new Set(championsWinnerId ? [championsWinnerId] : []),
          continentalChampions,
        );
    }

    titles[winnerId] = (titles[winnerId] ?? 0) + 1;
    champions.push({ season, winnerId, source });

    if (source === "generated") {
      const club = CLUBS.find((item) => item.id === winnerId);
      if (club) {
        const championsFavored = !playerCompeted && winnerId === championsWinnerId;
        const continentalOrigin = continentalChampions.find((entry) => entry.clubId === winnerId)?.competitionId;
        news.push({
          id: `world-mundial-${season}-${winnerId}`,
          season,
          category: "career",
          priority: "major",
          title: `${club.shortName} é campeão mundial`,
          summary: championsFavored
            ? `${season} · campeão da Champions confirmou os 93% de favoritismo.`
            : continentalOrigin
              ? `${season} · campeão continental derrubou o favorito europeu.`
              : `${season} · o Mundial fugiu do favorito europeu.`,
        });
      }
    }
  }

  return {
    id: "mundial",
    label: "Mundial de Clubes",
    champions,
    titleTable: rankedTitles(titles),
    news,
  };
}

export function buildLivingClubCompetitions(state: GameState): LivingClubCompetition[] {
  const latestCompletedSeason = Math.max(2026, ...state.history.map((record) => record.season));
  const continental = CONFIGS.map((config) => buildContinentalCompetition(state, config, latestCompletedSeason));
  const mundial = buildMundialCompetition(state, latestCompletedSeason, continental);
  return [...continental, mundial];
}

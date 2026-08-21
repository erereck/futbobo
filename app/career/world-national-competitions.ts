import { COUNTRIES, countryById } from "../game-data";
import type { GameState } from "./model";
import { seeded } from "./shared";

export type LivingNationalCompetitionId = "euro" | "copa-america";

export type LivingNationalCompetition = {
  id: LivingNationalCompetitionId;
  label: string;
  champions: Array<{ season: number; winnerId: string; source: "generated" | "player" }>;
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

type NationalCompetitionConfig = {
  id: LivingNationalCompetitionId;
  label: string;
  confederation: "EUROPE" | "SOUTH_AMERICA";
  historyNames: string[];
  historicTitles: Record<string, number>;
};

const CONFIGS: NationalCompetitionConfig[] = [
  {
    id: "euro",
    label: "Euro",
    confederation: "EUROPE",
    historyNames: ["euro", "eurocopa", "campeonato europeu"],
    historicTitles: {
      espanha: 4,
      alemanha: 3,
      italia: 2,
      franca: 2,
      holanda: 1,
      dinamarca: 1,
      grecia: 1,
      portugal: 1,
    },
  },
  {
    id: "copa-america",
    label: "Copa América",
    confederation: "SOUTH_AMERICA",
    historyNames: ["copa america", "copa américa"],
    historicTitles: {
      argentina: 16,
      uruguai: 15,
      brasil: 9,
      paraguai: 2,
      chile: 2,
      peru: 2,
      colombia: 1,
      bolivia: 1,
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

function worldPlayerNationBoost(state: GameState, countryId: string) {
  return Object.values(state.worldPlayers?.players ?? {})
    .filter((player) => player.status !== "retired" && player.nationality === countryId)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 6)
    .reduce((total, player) => total + Math.max(0, player.overall - 75) * 1.25, 0);
}

function playerRecordFor(state: GameState, config: NationalCompetitionConfig, season: number) {
  return state.nationalHistory.find((record) => {
    if (record.season !== season) return false;
    const name = normalized(record.name);
    return config.historyNames.some((candidate) => name.includes(normalized(candidate)));
  });
}

function pickWinner(
  state: GameState,
  config: NationalCompetitionConfig,
  season: number,
  titles: Record<string, number>,
  excludedCountryId: string,
) {
  const available = COUNTRIES.filter((country) =>
    country.confederation === config.confederation && country.id !== excludedCountryId
  );
  const elite = available.filter((country) => country.strength >= 4 || (titles[country.id] ?? 0) >= 2);
  const strong = available.filter((country) => country.strength >= 3 || (titles[country.id] ?? 0) >= 1);
  const upset = seeded(state.seed, season * 6203 + (config.id === "euro" ? 13 : 47)) < 0.12;
  const candidates = upset && strong.length ? strong : elite.length ? elite : strong.length ? strong : available;

  return candidates
    .map((country, index) => {
      const historyPull = titles[country.id] ?? 0;
      const generationBoost = worldPlayerNationBoost(state, country.id);
      const weight = Math.max(1, country.strength ** 4 * 5 + historyPull * 20 + generationBoost);
      const roll = Math.max(0.000001, seeded(state.seed, season * 6301 + index * 71 + (config.id === "euro" ? 7 : 31)));
      return { countryId: country.id, score: Math.pow(roll, 1 / weight) };
    })
    .sort((a, b) => b.score - a.score)[0]?.countryId ?? available[0]?.id ?? state.nationality;
}

function rankedTitles(titles: Record<string, number>) {
  let previousTitles = -1;
  let rank = 0;
  return Object.entries(titles)
    .filter(([countryId, count]) => count > 0 && COUNTRIES.some((country) => country.id === countryId))
    .sort((a, b) => b[1] - a[1] || countryById(a[0]).name.localeCompare(countryById(b[0]).name, "pt-BR"))
    .map(([entityId, count], index) => {
      if (count !== previousTitles) rank = index + 1;
      previousTitles = count;
      return { entityId, titles: count, rank };
    });
}

export function buildLivingNationalCompetitions(state: GameState): LivingNationalCompetition[] {
  const latestCompletedSeason = Math.max(2026, ...state.history.map((record) => record.season));

  return CONFIGS.map((config) => {
    const titles = { ...config.historicTitles };
    const champions: LivingNationalCompetition["champions"] = [];
    const news: LivingNationalCompetition["news"] = [];

    for (let season = 2028; season <= latestCompletedSeason; season += 4) {
      const playerRecord = playerRecordFor(state, config, season);
      const playerWon = Boolean(playerRecord?.champion);
      const winnerId = playerWon
        ? state.nationality
        : pickWinner(state, config, season, titles, playerRecord ? state.nationality : "");
      const source: "generated" | "player" = playerWon ? "player" : "generated";

      titles[winnerId] = (titles[winnerId] ?? 0) + 1;
      champions.push({ season, winnerId, source });

      if (source === "generated") {
        const country = countryById(winnerId);
        news.push({
          id: `world-${config.id}-${season}-${winnerId}`,
          season,
          category: "career",
          priority: "major",
          title: `${country.name} vence ${config.label}`,
          summary: `${season} · ${titles[winnerId]} título(s) no histórico deste universo.`,
        });
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

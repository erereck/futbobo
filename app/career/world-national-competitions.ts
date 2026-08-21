import { COUNTRIES, countryById } from "../game-data";
import type { Country } from "../game-data";
import type { GameState } from "./model";
import { seeded } from "./shared";

export type LivingNationalCompetitionId =
  | "euro"
  | "copa-america"
  | "gold-cup"
  | "asian-cup"
  | "afcon"
  | "ofc-nations-cup";

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
  confederation: Country["confederation"];
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
      Espanha: 4,
      Alemanha: 3,
      Itália: 2,
      França: 2,
      Holanda: 1,
      Dinamarca: 1,
      Grécia: 1,
      Portugal: 1,
    },
  },
  {
    id: "copa-america",
    label: "Copa América",
    confederation: "SOUTH_AMERICA",
    historyNames: ["copa america", "copa américa"],
    historicTitles: {
      Argentina: 16,
      Uruguai: 15,
      Brasil: 9,
      Paraguai: 2,
      Chile: 2,
      Peru: 2,
      Colômbia: 1,
      Bolívia: 1,
    },
  },
  {
    id: "gold-cup",
    label: "Copa Ouro",
    confederation: "NORTH_AMERICA",
    historyNames: ["copa ouro", "gold cup"],
    historicTitles: {
      México: 10,
      "Estados Unidos": 7,
      Canadá: 1,
    },
  },
  {
    id: "asian-cup",
    label: "Copa da Ásia",
    confederation: "ASIA",
    historyNames: ["copa da asia", "copa da ásia", "asian cup"],
    historicTitles: {
      Japão: 4,
      "Arábia Saudita": 3,
      Irã: 3,
      "Coreia do Sul": 2,
      Catar: 2,
      Austrália: 1,
      Iraque: 1,
      Kuwait: 1,
      Israel: 1,
    },
  },
  {
    id: "afcon",
    label: "Copa Africana de Nações",
    confederation: "AFRICA",
    historyNames: ["copa africana de nacoes", "copa africana de nações", "afcon"],
    historicTitles: {
      Egito: 7,
      Camarões: 5,
      Gana: 4,
      "Costa do Marfim": 3,
      Nigéria: 3,
      Argélia: 2,
      "RD Congo": 2,
      Senegal: 2,
      Zâmbia: 1,
      Tunísia: 1,
      Sudão: 1,
      Etiópia: 1,
      Marrocos: 1,
      "África do Sul": 1,
      Congo: 1,
    },
  },
  {
    id: "ofc-nations-cup",
    label: "Copa das Nações da OFC",
    confederation: "OCEANIA",
    historyNames: ["copa das nacoes da ofc", "copa das nações da ofc", "ofc nations cup"],
    historicTitles: {
      "Nova Zelândia": 6,
      Austrália: 4,
      Taiti: 1,
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

function resolveCountryId(label: string) {
  const target = normalized(label);
  return COUNTRIES.find((country) =>
    normalized(country.id) === target ||
    normalized(country.name) === target ||
    normalized(country.abbr) === target
  )?.id ?? "";
}

function historicalTitles(config: NationalCompetitionConfig) {
  const titles: Record<string, number> = {};
  Object.entries(config.historicTitles).forEach(([label, count]) => {
    const countryId = resolveCountryId(label);
    if (countryId) titles[countryId] = Math.max(titles[countryId] ?? 0, count);
  });
  return titles;
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
  const salt = config.id.length * 53;
  const upset = seeded(state.seed, season * 6203 + salt) < 0.12;
  const candidates = upset && strong.length ? strong : elite.length ? elite : strong.length ? strong : available;

  return candidates
    .map((country, index) => {
      const historyPull = titles[country.id] ?? 0;
      const generationBoost = worldPlayerNationBoost(state, country.id);
      const weight = Math.max(1, country.strength ** 4 * 5 + historyPull * 20 + generationBoost);
      const roll = Math.max(0.000001, seeded(state.seed, season * 6301 + index * 71 + salt));
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
    const titles = historicalTitles(config);
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

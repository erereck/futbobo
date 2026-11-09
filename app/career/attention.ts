import { COUNTRIES } from "../game-data";
import { clubConfederation, positionByKey } from "./academy";
import { leagueDivision } from "./league-divisions";
import type { CareerAttention, CompetitionId, GameState, SeasonRecord } from "./model";
import { seasonAverageRating, seasonPerformanceScore, worldCupStatsForSeason } from "./performance";
import { clamp, clubById, seeded } from "./shared";

export const EMPTY_ATTENTION: CareerAttention = {
  global: 0,
  continental: {},
  reachedOverall72: false,
  lastSettledSeason: 0,
};

export function attentionAtOverall(attention: CareerAttention, overall: number): CareerAttention {
  return overall < 72 || attention.reachedOverall72
    ? attention
    : { ...attention, reachedOverall72: true, global: clamp(attention.global + 8) };
}

export function normalizeAttention(saved: Partial<GameState>): CareerAttention {
  const attention = saved.attention;
  if (!attention) {
    const history = Array.isArray(saved.history) ? saved.history : [];
    const hasPendingFinals = Boolean(saved.pendingBotaoMatches?.length);
    const peak = Math.max(saved.overall ?? 0, ...history.map((record) => record?.overall ?? 0));
    return attentionAtOverall({
      ...EMPTY_ATTENTION,
      lastSettledSeason: (hasPendingFinals ? history.at(-2) : history.at(-1))?.season ?? 0,
    }, peak);
  }
  const points = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? clamp(value) : 0;
  const continental: CareerAttention["continental"] = {};
  for (const { confederation } of COUNTRIES) {
    const score = points(attention.continental?.[confederation]);
    if (score > 0) continental[confederation] = score;
  }
  return {
    global: points(attention.global),
    continental,
    reachedOverall72: attention.reachedOverall72 === true,
    lastSettledSeason: Number.isSafeInteger(attention.lastSettledSeason) ? Math.max(0, attention.lastSettledSeason) : 0,
  };
}

const WORLD_CUP_GOLDEN_BOOT = "Artilheiro da Copa do Mundo";
export const WORLD_CUP_ASSIST_LEADER = "Líder de Assistências da Copa do Mundo";

export function worldCupProductionAwards(goals: number, assists: number) {
  return [
    ...(goals >= 6 ? [WORLD_CUP_GOLDEN_BOOT] : []),
    ...(assists >= 5 ? [WORLD_CUP_ASSIST_LEADER] : []),
  ];
}

export type ScoutingSpotlight = {
  route: "domestic" | "libertadores" | "europa" | "champions" | "world-cup";
  competition: string;
  award?: string;
};

function finalMvp(state: GameState, record: SeasonRecord, competitionId: CompetitionId, rating: number, salt: number) {
  const final = record.botaoResults?.find(({ match }) =>
    match.source === "club" && match.competitionId === competitionId && match.stageName === "Final");
  if (final) return !final.result.walkover && final.result.manOfTheMatch;
  // O modo de temporada sem Botão também precisa resolver quem brilhou na final.
  return record.appearances >= 18 && rating >= 7.4
    && seeded(state.seed, record.season * 31 + salt) < clamp((rating - 7) * 0.12, 0, 0.32);
}

export function seasonScouting(state: GameState, record: SeasonRecord) {
  const club = clubById(record.clubId);
  const confederation = clubConfederation(club);
  const rating = record.averageRating ?? seasonAverageRating(seasonPerformanceScore(record.position, record), state.seed, record.season);
  let continental = record.appearances >= 15 && rating >= 7.3 ? (rating >= 8.3 ? 2 : 1) : 0;
  let global = record.appearances >= 15 && rating >= 8.3 ? 1 : 0;
  const spotlights: ScoutingSpotlight[] = [];
  const cupStats = worldCupStatsForSeason(state, record.season);
  const awards = cupStats ? worldCupProductionAwards(cupStats.goals, cupStats.assists) : [];
  const wonWorldCup = state.nationalHistory.some((item) => item.season === record.season && item.name === "Copa do Mundo" && item.champion);
  const cupAward = awards[0] ?? (wonWorldCup ? record.awards.find((award) => award === "Craque da Copa do Mundo") : undefined);
  if (cupStats?.appearances) {
    const matches = (record.botaoResults ?? []).filter(({ match, result }) =>
      match.source === "national" && match.competitionId === "world-cup" && !result.walkover);
    const knockoutMvp = matches.some(({ result }) => result.manOfTheMatch);
    const defensivePlayer = ["gol", "defesa"].includes(positionByKey(record.position).zone);
    const defensiveRun = defensivePlayer && cupStats.appearances >= 5 && rating >= 7.6
      && (matches.length ? matches.filter(({ result }) => result.goalsAgainst === 0).length >= 2 : record.overall >= 80);
    const standout = cupAward || knockoutMvp || defensiveRun
      || cupStats.goals >= 4 || cupStats.assists >= 3 || cupStats.goals + cupStats.assists >= 5;
    global += cupAward ? 54 : standout ? 36 : 0;
    continental += cupAward ? 18 : standout ? 10 : 0;
    if (standout) spotlights.push({ route: "world-cup", competition: "Copa do Mundo", award: cupAward });
  }

  const continentalFinals = [
    { id: "championsLeague", route: "champions", global: 35, continental: 22, salt: 1619 },
    { id: "libertadores", route: "libertadores", global: 28, continental: 26, salt: 1621 },
    { id: "europaLeague", route: "europa", global: 18, continental: 22, salt: 1627 },
  ] as const;
  for (const showcase of continentalFinals) {
    const competition = record.competitions.find(({ id, champion, stage }) =>
      id === showcase.id && (champion || stage === "Vice"));
    if (!competition || !finalMvp(state, record, showcase.id, rating, showcase.salt)) continue;
    global += showcase.global;
    continental += showcase.continental;
    spotlights.push({ route: showcase.route, competition: competition.name });
  }

  const domesticCup = record.competitions.find(({ id, champion, stage }) =>
    id === "domesticCup" && (champion || stage === "Vice"));
  if (domesticCup) {
    const majorCup = ["brasil", "argentina"].includes(club.countryId);
    const underdogChampion = domesticCup.champion && (club.reputation <= 2 || leagueDivision(record.leagueId ?? club.leagueId) >= 3);
    if (finalMvp(state, record, "domesticCup", rating, 1637)) {
      continental += majorCup ? 14 : 6;
      global += majorCup ? 1 : 0;
      spotlights.push({ route: "domestic", competition: domesticCup.name });
    } else if (underdogChampion) {
      continental += majorCup ? 8 : 3;
      spotlights.push({ route: "domestic", competition: domesticCup.name });
    }
  }

  return {
    attention: {
      ...state.attention,
      global: clamp(state.attention.global + global),
      continental: { ...state.attention.continental, [confederation]: clamp((state.attention.continental[confederation] ?? 0) + continental) },
      lastSettledSeason: record.season,
    },
    spotlights,
    awards,
  };
}

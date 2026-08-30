import { COUNTRIES, FORMATIONS, POSITIONS } from "../app/game-data";
import { randomAcademyClubs } from "../app/career/academy";
import { createYouthJourney } from "../app/career/events";
import { simulateMonteCarloCareer } from "../app/career/simulation";
import { initialState } from "../app/career/state";
import { pick } from "../app/career/shared";

const runs = 240;
const seedBase = 20260723;
const byPosition: Record<string, { count: number; potentialSum: number; peakSum: number; goalsSum: number; assistsSum: number; seasonsSum: number }> = {};
const peakBins: Record<string, { count: number; goalsSum: number; assistsSum: number; seasonsSum: number; appearancesSum: number }> = {};

for (let index = 0; index < runs; index += 1) {
  const seed = (seedBase + index * 104729) % 2147483647;
  const chosenPosition = POSITIONS[index % POSITIONS.length].key;
  const chosenNationality = pick(COUNTRIES, seed, 709 + index).id;
  const academyClub = pick(randomAcademyClubs(seed, chosenNationality), seed, 719 + index);
  const formation = pick(FORMATIONS, seed, 727 + index);
  const base = { ...initialState(), seed, position: chosenPosition, nationality: chosenNationality, academyClubId: academyClub.id };
  const journey = createYouthJourney(base, formation.id);
  const career = simulateMonteCarloCareer(seed, index);
  const pos = byPosition[chosenPosition] ?? { count: 0, potentialSum: 0, peakSum: 0, goalsSum: 0, assistsSum: 0, seasonsSum: 0 };
  pos.count += 1;
  pos.potentialSum += journey.potential;
  pos.peakSum += career.peakOverall;
  pos.goalsSum += career.goals;
  pos.assistsSum += career.assists;
  pos.seasonsSum += career.seasons;
  byPosition[chosenPosition] = pos;

  const key = career.peakOverall < 70 ? "<70" : career.peakOverall < 75 ? "70-74" : career.peakOverall < 80 ? "75-79" : career.peakOverall < 83 ? "80-82" : career.peakOverall < 86 ? "83-85" : career.peakOverall < 90 ? "86-89" : "90+";
  const bin = peakBins[key] ?? { count: 0, goalsSum: 0, assistsSum: 0, seasonsSum: 0, appearancesSum: 0 };
  bin.count += 1;
  bin.goalsSum += career.goals;
  bin.assistsSum += career.assists;
  bin.seasonsSum += career.seasons;
  bin.appearancesSum += career.appearances;
  peakBins[key] = bin;
}

const positions = Object.fromEntries(Object.entries(byPosition).map(([key, value]) => [key, {
  count: value.count,
  avgPotential: +(value.potentialSum / value.count).toFixed(2),
  avgPeak: +(value.peakSum / value.count).toFixed(2),
  avgGoals: +(value.goalsSum / value.count).toFixed(1),
  avgAssists: +(value.assistsSum / value.count).toFixed(1),
  avgSeasons: +(value.seasonsSum / value.count).toFixed(1),
}]));
const bins = Object.fromEntries(Object.entries(peakBins).map(([key, value]) => [key, {
  count: value.count,
  avgGoals: +(value.goalsSum / value.count).toFixed(1),
  avgAssists: +(value.assistsSum / value.count).toFixed(1),
  avgSeasons: +(value.seasonsSum / value.count).toFixed(1),
  avgAppearances: +(value.appearancesSum / value.count).toFixed(1),
}]));
console.log(`CAREER_BALANCE_DIAGNOSTIC=${JSON.stringify({ runs, positions, bins })}`);

import { POSITIONS } from "../app/game-data";
import { simulateMonteCarloCareer } from "../app/career/simulation";

const batch = Number(process.argv[2] ?? 0);
const batchSize = 100;
const startIndex = batch * batchSize;
const seedBase = 20260723;
const byPosition: Record<string, { count: number; peakSum: number; goalsSum: number; assistsSum: number; below70: number; atLeast85: number; ca8082Count: number; ca8082Goals: number; ca8082Assists: number }> = {};
let peakSum = 0;
let below70 = 0;
let atLeast85 = 0;
let goalsSum = 0;
let assistsSum = 0;

for (let offset = 0; offset < batchSize; offset += 1) {
  const index = startIndex + offset;
  const seed = (seedBase + index * 104729) % 2147483647;
  const career = simulateMonteCarloCareer(seed, index);
  peakSum += career.peakOverall;
  goalsSum += career.goals;
  assistsSum += career.assists;
  if (career.peakOverall < 70) below70 += 1;
  if (career.peakOverall >= 85) atLeast85 += 1;
  const p = byPosition[career.position] ?? { count: 0, peakSum: 0, goalsSum: 0, assistsSum: 0, below70: 0, atLeast85: 0, ca8082Count: 0, ca8082Goals: 0, ca8082Assists: 0 };
  p.count += 1;
  p.peakSum += career.peakOverall;
  p.goalsSum += career.goals;
  p.assistsSum += career.assists;
  if (career.peakOverall < 70) p.below70 += 1;
  if (career.peakOverall >= 85) p.atLeast85 += 1;
  if (career.position === "CA" && career.peakOverall >= 80 && career.peakOverall <= 82) {
    p.ca8082Count += 1;
    p.ca8082Goals += career.goals;
    p.ca8082Assists += career.assists;
  }
  byPosition[career.position] = p;
}

console.log(`CAREER_BALANCE_BATCH=${JSON.stringify({ batch, startIndex, count: batchSize, peakSum, below70, atLeast85, goalsSum, assistsSum, byPosition, positions: POSITIONS.map((p) => p.key) })}`);

import { leagueById } from "../app/game-data";
import { evaluateBallonDor } from "../app/career/ballon-dor";
import { runMonteCarloCareers } from "../app/career/simulation";

const report = runMonteCarloCareers(2000, 20260723);
const base = {
  inEurope: false, positionZone: "ataque" as const, isKeeper: false,
  overall: 91, performanceScore: 94, reputation: 82, appearances: 40,
  goals: 58, assists: 18, cleanSheets: 0, goalsConceded: 0,
  majorNationalTitle: false, mundialChampion: false, worldCupGoals: 0, worldCupAssists: 0,
  supportingAwardBonus: 10, hasProductionAward: true, previousBallonDor: 0,
};
const brasilOnlyDomestic = evaluateBallonDor({ ...base, league: leagueById("brasileirao"), titleCount: 2, majorClubTitleCount: 1, domesticCupChampion: true, playsContinental: "", continentalChampion: false });
const brasilLibertadoresWithoutCup = evaluateBallonDor({ ...base, league: leagueById("brasileirao"), titleCount: 2, majorClubTitleCount: 2, domesticCupChampion: false, playsContinental: "libertadores", continentalChampion: true });
const brasilAbsurdTreble = evaluateBallonDor({ ...base, league: leagueById("brasileirao"), titleCount: 3, majorClubTitleCount: 2, domesticCupChampion: true, playsContinental: "libertadores", continentalChampion: true });

console.log(`BALLON_CALIBRATION=${JSON.stringify({
  runs: report.runs,
  careerChancePercent: report.careerChancePercent,
  awardChancePerSeasonPercent: report.awardChancePerSeasonPercent,
  careersWithBallonDor: report.careersWithBallonDor,
  totalBallonDor: report.totalBallonDor,
  positionBreakdown: report.positionBreakdown,
  scenarios: { brasilOnlyDomestic, brasilLibertadoresWithoutCup, brasilAbsurdTreble },
})}`);

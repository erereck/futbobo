import { leagueById } from "../app/game-data";
import { evaluateBallonDor } from "../app/career/ballon-dor";
import { runMonteCarloCareers } from "../app/career/simulation";

const report = runMonteCarloCareers(2000, 20260723);

const turkeyDomesticOnly = evaluateBallonDor({
  league: leagueById("superlig"),
  inEurope: true,
  positionZone: "ataque",
  isKeeper: false,
  overall: 90,
  performanceScore: 90,
  reputation: 80,
  appearances: 36,
  goals: 34,
  assists: 10,
  cleanSheets: 0,
  goalsConceded: 0,
  titleCount: 1,
  majorClubTitleCount: 1,
  majorNationalTitle: false,
  playsContinental: "",
  continentalChampion: false,
  mundialChampion: false,
  worldCupGoals: 0,
  worldCupAssists: 0,
  supportingAwardBonus: 6,
  hasProductionAward: true,
  previousBallonDor: 0,
});

const turkeyHistoricDomestic = evaluateBallonDor({
  league: leagueById("superlig"),
  inEurope: true,
  positionZone: "ataque",
  isKeeper: false,
  overall: 92,
  performanceScore: 95,
  reputation: 86,
  appearances: 38,
  goals: 55,
  assists: 16,
  cleanSheets: 0,
  goalsConceded: 0,
  titleCount: 2,
  majorClubTitleCount: 1,
  majorNationalTitle: false,
  playsContinental: "",
  continentalChampion: false,
  mundialChampion: false,
  worldCupGoals: 0,
  worldCupAssists: 0,
  supportingAwardBonus: 8,
  hasProductionAward: true,
  previousBallonDor: 0,
});

const premierStrongSeason = evaluateBallonDor({
  league: leagueById("premier"),
  inEurope: true,
  positionZone: "ataque",
  isKeeper: false,
  overall: 89,
  performanceScore: 90,
  reputation: 82,
  appearances: 38,
  goals: 36,
  assists: 15,
  cleanSheets: 0,
  goalsConceded: 0,
  titleCount: 1,
  majorClubTitleCount: 1,
  majorNationalTitle: false,
  playsContinental: "champions",
  continentalChampion: false,
  mundialChampion: false,
  worldCupGoals: 0,
  worldCupAssists: 0,
  supportingAwardBonus: 7,
  hasProductionAward: true,
  previousBallonDor: 0,
});

const payload = {
  runs: report.runs,
  careerChancePercent: report.careerChancePercent,
  awardChancePerSeasonPercent: report.awardChancePerSeasonPercent,
  careersWithBallonDor: report.careersWithBallonDor,
  totalBallonDor: report.totalBallonDor,
  careersWithFiveBallonDor: report.careersWithFiveBallonDor,
  averageSeasons: report.averageSeasons,
  averagePeakOverall: report.averagePeakOverall,
  positionBreakdown: report.positionBreakdown,
  scenarios: { turkeyDomesticOnly, turkeyHistoricDomestic, premierStrongSeason },
};

console.log(`BALLON_CALIBRATION=${JSON.stringify(payload)}`);

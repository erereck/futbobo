import { leagueById } from "../app/game-data";
import { evaluateBallonDor } from "../app/career/ballon-dor";
import { runMonteCarloCareers } from "../app/career/simulation";

const report = runMonteCarloCareers(2000, 20260723);

const turkeyDomesticOnly = evaluateBallonDor({
  league: leagueById("superlig"), inEurope: true, positionZone: "ataque", isKeeper: false,
  overall: 90, performanceScore: 90, reputation: 80, appearances: 36, goals: 34, assists: 10,
  cleanSheets: 0, goalsConceded: 0, titleCount: 1, majorClubTitleCount: 1, domesticCupChampion: false,
  majorNationalTitle: false, playsContinental: "", continentalChampion: false, mundialChampion: false,
  worldCupGoals: 0, worldCupAssists: 0, supportingAwardBonus: 6, hasProductionAward: true, previousBallonDor: 0,
});

const turkeyHistoricDomestic = evaluateBallonDor({
  league: leagueById("superlig"), inEurope: true, positionZone: "ataque", isKeeper: false,
  overall: 92, performanceScore: 95, reputation: 86, appearances: 38, goals: 55, assists: 16,
  cleanSheets: 0, goalsConceded: 0, titleCount: 2, majorClubTitleCount: 1, domesticCupChampion: true,
  majorNationalTitle: false, playsContinental: "", continentalChampion: false, mundialChampion: false,
  worldCupGoals: 0, worldCupAssists: 0, supportingAwardBonus: 8, hasProductionAward: true, previousBallonDor: 0,
});

const premierStrongSeason = evaluateBallonDor({
  league: leagueById("premier"), inEurope: true, positionZone: "ataque", isKeeper: false,
  overall: 89, performanceScore: 90, reputation: 82, appearances: 38, goals: 36, assists: 15,
  cleanSheets: 0, goalsConceded: 0, titleCount: 1, majorClubTitleCount: 1, domesticCupChampion: false,
  majorNationalTitle: false, playsContinental: "champions", continentalChampion: false, mundialChampion: false,
  worldCupGoals: 0, worldCupAssists: 0, supportingAwardBonus: 7, hasProductionAward: true, previousBallonDor: 0,
});

const brasilOnlyDomestic = evaluateBallonDor({
  league: leagueById("brasileirao"), inEurope: false, positionZone: "ataque", isKeeper: false,
  overall: 91, performanceScore: 94, reputation: 82, appearances: 40, goals: 58, assists: 18,
  cleanSheets: 0, goalsConceded: 0, titleCount: 2, majorClubTitleCount: 1, domesticCupChampion: true,
  majorNationalTitle: false, playsContinental: "", continentalChampion: false, mundialChampion: false,
  worldCupGoals: 0, worldCupAssists: 0, supportingAwardBonus: 8, hasProductionAward: true, previousBallonDor: 0,
});

const brasilLibertadoresWithoutCup = evaluateBallonDor({
  league: leagueById("brasileirao"), inEurope: false, positionZone: "ataque", isKeeper: false,
  overall: 91, performanceScore: 94, reputation: 82, appearances: 40, goals: 58, assists: 18,
  cleanSheets: 0, goalsConceded: 0, titleCount: 2, majorClubTitleCount: 2, domesticCupChampion: false,
  majorNationalTitle: false, playsContinental: "libertadores", continentalChampion: true, mundialChampion: false,
  worldCupGoals: 0, worldCupAssists: 0, supportingAwardBonus: 10, hasProductionAward: true, previousBallonDor: 0,
});

const brasilAbsurdTreble = evaluateBallonDor({
  league: leagueById("brasileirao"), inEurope: false, positionZone: "ataque", isKeeper: false,
  overall: 91, performanceScore: 94, reputation: 82, appearances: 40, goals: 58, assists: 18,
  cleanSheets: 0, goalsConceded: 0, titleCount: 3, majorClubTitleCount: 2, domesticCupChampion: true,
  majorNationalTitle: false, playsContinental: "libertadores", continentalChampion: true, mundialChampion: false,
  worldCupGoals: 0, worldCupAssists: 0, supportingAwardBonus: 10, hasProductionAward: true, previousBallonDor: 0,
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
  scenarios: {
    turkeyDomesticOnly,
    turkeyHistoricDomestic,
    premierStrongSeason,
    brasilOnlyDomestic,
    brasilLibertadoresWithoutCup,
    brasilAbsurdTreble,
  },
};

console.log(`BALLON_CALIBRATION=${JSON.stringify(payload)}`);

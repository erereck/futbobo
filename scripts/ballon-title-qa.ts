import { evaluateBallonDor, type BallonDorEvaluationInput } from "../app/career/ballon-dor";
import { leagueById } from "../app/game-data";
import { simulateMonteCarloCareer } from "../app/career/simulation";

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function scenario(overrides: Partial<BallonDorEvaluationInput> = {}) {
  const base: BallonDorEvaluationInput = {
    league: leagueById("premier"),
    inEurope: true,
    positionZone: "ataque",
    isKeeper: false,
    overall: 90,
    performanceScore: 96,
    reputation: 78,
    appearances: 38,
    goals: 40,
    assists: 11,
    cleanSheets: 0,
    goalsConceded: 0,
    titleCount: 0,
    majorClubTitleCount: 0,
    domesticCupChampion: false,
    majorNationalTitle: false,
    playsContinental: "champions",
    continentalChampion: false,
    mundialChampion: false,
    worldCupGoals: 0,
    worldCupAssists: 0,
    supportingAwardBonus: 4,
    hasProductionAward: true,
    previousBallonDor: 0,
  };
  return evaluateBallonDor({ ...base, ...overrides });
}

const noTitle = scenario();
check(!noTitle.eligible && noTitle.chance === 0, "40 gols sem título de peso precisa ser inelegível");

const domesticCupOnly = scenario({ titleCount: 1, domesticCupChampion: true });
check(!domesticCupOnly.eligible && domesticCupOnly.chance === 0, "Copa nacional sozinha não pode abrir a Bola de Ouro");

const leagueChampion = scenario({ titleCount: 1, majorClubTitleCount: 1 });
check(leagueChampion.eligible && leagueChampion.chance >= 40, "Premier + temporada absurda precisa disputar forte");

const championsChampion = scenario({ titleCount: 1, majorClubTitleCount: 1, continentalChampion: true });
check(championsChampion.eligible && championsChampion.chance > leagueChampion.chance, "Champions deve pesar mais que liga isolada");

const leaguePlusEuro = scenario({ titleCount: 1, majorClubTitleCount: 1, majorNationalTitle: true });
check(leaguePlusEuro.eligible && leaguePlusEuro.chance > leagueChampion.chance, "Liga + Euro/Copa América precisa ganhar boost claro");

const worldCupHero = scenario({
  overall: 82,
  performanceScore: 64,
  reputation: 52,
  appearances: 24,
  goals: 11,
  assists: 5,
  titleCount: 0,
  majorClubTitleCount: 0,
  majorNationalTitle: true,
  worldCupGoals: 5,
  worldCupAssists: 1,
  supportingAwardBonus: 0,
  hasProductionAward: false,
});
check(worldCupHero.eligible && worldCupHero.chance >= 28 && worldCupHero.chance < 100, "Copa do Mundo heroica deve salvar o ano sem garantir prêmio");

const eightGoalWorldCup = scenario({
  overall: 76,
  performanceScore: 50,
  reputation: 20,
  appearances: 10,
  goals: 6,
  assists: 2,
  majorClubTitleCount: 0,
  majorNationalTitle: false,
  worldCupGoals: 8,
  worldCupAssists: 0,
  hasProductionAward: false,
  supportingAwardBonus: 0,
});
check(eightGoalWorldCup.eligible && eightGoalWorldCup.chance === 100, "8+ gols em Copa precisa garantir Bola de Ouro");

const turkey34 = scenario({
  league: leagueById("superlig"),
  overall: 90,
  performanceScore: 95,
  reputation: 80,
  goals: 34,
  assists: 8,
  titleCount: 1,
  majorClubTitleCount: 1,
});
check(!turkey34.eligible, "34 gols + só liga turca continua insuficiente");

const turkeyHistoric = scenario({
  league: leagueById("superlig"),
  overall: 91,
  performanceScore: 96,
  reputation: 82,
  goals: 52,
  assists: 12,
  titleCount: 1,
  majorClubTitleCount: 1,
});
check(turkeyHistoric.eligible && turkeyHistoric.chance > 0 && turkeyHistoric.chance < 20, "Temporada histórica na Turquia pode sonhar, mas tem que ser raríssima");

const brazilLibertadores = scenario({
  league: leagueById("brasileirao"),
  inEurope: false,
  overall: 91,
  performanceScore: 96,
  reputation: 82,
  goals: 52,
  assists: 10,
  titleCount: 1,
  majorClubTitleCount: 1,
  domesticCupChampion: false,
  playsContinental: "libertadores",
  continentalChampion: true,
});
check(brazilLibertadores.eligible && brazilLibertadores.chance > 0 && brazilLibertadores.chance < 55, "Brasil histórico + Libertadores deve ser possível sem exigir Copa do Brasil");

console.log("BALLON_SCENARIOS");
console.log(JSON.stringify({
  noTitle,
  domesticCupOnly,
  leagueChampion,
  championsChampion,
  leaguePlusEuro,
  worldCupHero,
  eightGoalWorldCup,
  turkey34,
  turkeyHistoric,
  brazilLibertadores,
}, null, 2));

const runs = Number(process.env.BALLON_MC_RUNS ?? 3000);
const seedBase = 20260822;
const careers = Array.from({ length: runs }, (_, index) =>
  simulateMonteCarloCareer((seedBase + index * 104729) % 2147483647, index),
);
const winners = careers.filter((career) => career.ballonDor > 0);
const pool = (threshold: number) => {
  const eligiblePool = careers.filter((career) => career.peakOverall >= threshold);
  const poolWinners = eligiblePool.filter((career) => career.ballonDor > 0);
  return {
    careers: eligiblePool.length,
    winners: poolWinners.length,
    percent: Number((poolWinners.length / Math.max(1, eligiblePool.length) * 100).toFixed(2)),
  };
};
const positionBreakdown = Object.fromEntries(
  [...new Set(careers.map((career) => career.position))].sort().map((position) => {
    const subset = careers.filter((career) => career.position === position);
    return [position, {
      careers: subset.length,
      winners: subset.filter((career) => career.ballonDor > 0).length,
      totalBallonDor: subset.reduce((sum, career) => sum + career.ballonDor, 0),
    }];
  }),
);
const report = {
  runs,
  winners: winners.length,
  allCareerPercent: Number((winners.length / runs * 100).toFixed(2)),
  totalBallonDor: careers.reduce((sum, career) => sum + career.ballonDor, 0),
  averageBallonAmongWinners: Number((careers.reduce((sum, career) => sum + career.ballonDor, 0) / Math.max(1, winners.length)).toFixed(2)),
  peak82Plus: pool(82),
  peak85Plus: pool(85),
  peak88Plus: pool(88),
  peak90Plus: pool(90),
  careersWithFivePlus: careers.filter((career) => career.ballonDor >= 5).length,
  positionBreakdown,
};
console.log("BALLON_MONTE_CARLO");
console.log(JSON.stringify(report, null, 2));

import type { ContinentalSlot, League, Position } from "../game-data";
import { clamp } from "./shared";

export type BallonDorEvaluationInput = {
  league: League;
  inEurope: boolean;
  positionZone: Position["zone"];
  isKeeper: boolean;
  overall: number;
  performanceScore: number;
  reputation: number;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  titleCount: number;
  majorClubTitleCount: number;
  majorNationalTitle: boolean;
  playsContinental: ContinentalSlot | "";
  continentalChampion: boolean;
  mundialChampion: boolean;
  worldCupGoals: number;
  worldCupAssists: number;
  supportingAwardBonus: number;
  hasProductionAward: boolean;
  previousBallonDor: number;
};

export type BallonDorEvaluation = {
  eligible: boolean;
  score: number;
  chance: number;
  historicSeason: boolean;
  stage: "elite" | "major" | "secondary" | "minor" | "outside-europe";
};

function historicProduction(input: BallonDorEvaluationInput) {
  if (input.positionZone === "ataque") return input.goals >= 50 || input.goals + input.assists >= 68;
  if (input.positionZone === "meio") return input.goals + input.assists >= 55;
  if (input.positionZone === "defesa") return input.goals + input.assists >= 30 && input.performanceScore >= 94;
  return input.isKeeper && input.cleanSheets >= 25 && input.performanceScore >= 94;
}

function stageFor(input: BallonDorEvaluationInput): BallonDorEvaluation["stage"] {
  if (!input.inEurope) return "outside-europe";
  if (input.league.prestige >= 5) return "elite";
  if (input.league.prestige === 4) return "major";
  if (input.league.prestige === 3) return "secondary";
  return "minor";
}

function stageScore(stage: BallonDorEvaluation["stage"]) {
  if (stage === "elite") return 8;
  if (stage === "major") return 5;
  if (stage === "secondary") return -3;
  if (stage === "minor") return -16;
  return -7;
}

function stageChanceMultiplier(
  stage: BallonDorEvaluation["stage"],
  globalBreakthrough: boolean,
  mundialChampion: boolean,
  majorNationalTitle: boolean,
) {
  if (stage === "elite") return 1;
  if (stage === "major") return 0.94;
  if (stage === "secondary") return 0.74;
  if (stage === "minor") {
    if (mundialChampion || majorNationalTitle) return 0.78;
    return globalBreakthrough ? 0.5 : 0.16;
  }
  if (mundialChampion || majorNationalTitle) return 0.9;
  return globalBreakthrough ? 0.66 : 0.44;
}

function repeatMultiplier(previous: number) {
  if (previous <= 0) return 1;
  if (previous === 1) return 0.42;
  if (previous === 2) return 0.2;
  if (previous === 3) return 0.085;
  if (previous === 4) return 0.032;
  if (previous === 5) return 0.012;
  if (previous === 6) return 0.0045;
  return Math.max(0.0003, 0.0028 * 0.5 ** (previous - 7));
}

export function evaluateBallonDor(input: BallonDorEvaluationInput): BallonDorEvaluation {
  const stage = stageFor(input);
  const historicSeason = historicProduction(input);
  const championsBreakthrough = input.playsContinental === "champions" && input.continentalChampion;
  const globalBreakthrough = championsBreakthrough || input.mundialChampion || input.majorNationalTitle;
  const domesticMiracle =
    historicSeason &&
    input.overall >= 90 &&
    input.performanceScore >= 92 &&
    input.reputation >= 82 &&
    input.majorClubTitleCount > 0;

  // A Bola de Ouro precisa ser alcançável por estilos diferentes. Atacantes
  // costumam chegar pela produção; goleiros, defensores e meias podem chegar
  // por excelência específica da posição. O palco da temporada decide o quão
  // fácil é transformar essa excelência em candidatura real.
  const positionalRecognition =
    (input.isKeeper && input.overall >= 74 && input.performanceScore >= 68) ||
    (input.positionZone === "defesa" && input.overall >= 74 && input.performanceScore >= 68) ||
    (input.positionZone === "meio" && input.overall >= 75 && input.performanceScore >= 70);
  const worldClassRecognition =
    input.hasProductionAward ||
    input.supportingAwardBonus >= 2.5 ||
    historicSeason ||
    positionalRecognition;
  const baseAvailability = input.appearances >= 19;

  let eligible = false;
  if (input.inEurope && stage === "elite") {
    eligible =
      baseAvailability &&
      input.overall >= 73 &&
      input.performanceScore >= 60 &&
      input.reputation >= 15 &&
      (input.majorClubTitleCount > 0 || input.majorNationalTitle || globalBreakthrough || worldClassRecognition);
  } else if (input.inEurope && stage === "major") {
    eligible =
      baseAvailability &&
      input.appearances >= 20 &&
      input.overall >= 74 &&
      input.performanceScore >= 62 &&
      input.reputation >= 20 &&
      (
        input.majorClubTitleCount > 0 ||
        input.majorNationalTitle ||
        globalBreakthrough ||
        (worldClassRecognition && input.overall >= 77 && input.performanceScore >= 68)
      );
  } else if (input.inEurope && stage === "secondary") {
    eligible =
      baseAvailability &&
      input.appearances >= 22 &&
      input.overall >= 81 &&
      input.performanceScore >= 75 &&
      input.reputation >= 48 &&
      worldClassRecognition &&
      (globalBreakthrough || domesticMiracle);
  } else if (input.inEurope) {
    // Süper Lig, Bélgica, Áustria, Suíça, Escócia etc.: dominar só a liga não
    // basta. Sem um feito global, a única brecha é uma temporada estatística
    // literalmente histórica, com OVR/reputação de superestrela e múltiplos títulos.
    eligible =
      input.hasProductionAward &&
      input.appearances >= 26 &&
      input.overall >= 88 &&
      input.performanceScore >= 88 &&
      input.reputation >= 76 &&
      (globalBreakthrough || (domesticMiracle && input.titleCount >= 2));
  } else {
    eligible =
      baseAvailability &&
      input.appearances >= 21 &&
      input.overall >= 82 &&
      input.performanceScore >= 77 &&
      input.reputation >= 58 &&
      worldClassRecognition &&
      (input.continentalChampion || input.mundialChampion || input.majorNationalTitle);
  }

  const production = input.isKeeper
    ? input.cleanSheets * 1.8 - input.goalsConceded * 0.08
    : input.positionZone === "defesa"
      ? input.goals * 1.45 + input.assists * 1.2
      : input.positionZone === "meio"
        ? input.goals * 0.72 + input.assists
        : input.goals + input.assists * 0.65;
  const productionTarget = input.isKeeper ? 22 : input.positionZone === "defesa" ? 18 : input.positionZone === "meio" ? 34 : 40;
  const productionModifier = clamp((production - productionTarget) / 1.5, -12, 18);
  const positionModifier = input.isKeeper ? -5 : input.positionZone === "defesa" ? -3 : input.positionZone === "ataque" ? 3 : 0;
  const worldCupSurge = input.worldCupGoals >= 8
    ? 20 + Math.min(12, (input.worldCupGoals - 8) * 2.2 + input.worldCupAssists * 0.8)
    : 0;
  const score =
    input.performanceScore * 0.3 +
    input.overall * 0.32 +
    input.reputation * 0.14 +
    input.majorClubTitleCount * 3 +
    stageScore(stage) +
    (championsBreakthrough ? 16 : 0) +
    (input.mundialChampion ? 16 : 0) +
    (input.majorNationalTitle ? 12 : 0) +
    worldCupSurge +
    productionModifier +
    input.supportingAwardBonus +
    positionModifier;

  if (!eligible) return { eligible: false, score, chance: 0, historicSeason, stage };

  const firstChance = clamp(58 + Math.max(0, score - 62) * 2.5, 58, 96);
  const repeatBase = clamp(18 + Math.max(0, score - 74) * 1.8, 18, 60);
  const stageMultiplier = stageChanceMultiplier(stage, globalBreakthrough, input.mundialChampion, input.majorNationalTitle);
  let chance = (input.previousBallonDor === 0 ? firstChance : repeatBase) * repeatMultiplier(input.previousBallonDor) * stageMultiplier;

  if (historicSeason) {
    const historicFloor = input.previousBallonDor === 0 ? 58 : input.previousBallonDor === 1 ? 25 : input.previousBallonDor === 2 ? 12 : Math.max(0.18, 5 * 0.44 ** (input.previousBallonDor - 3));
    // Liga menor sem feito global continua sendo um conto de fadas, não um atalho.
    const adjustedHistoricFloor = stage === "minor" && !globalBreakthrough ? historicFloor * 0.18 : historicFloor;
    chance = Math.max(chance, adjustedHistoricFloor);
  }
  if (input.worldCupGoals >= 8) {
    const worldCupFloor = input.previousBallonDor === 0 ? 82 : input.previousBallonDor === 1 ? 44 : input.previousBallonDor === 2 ? 24 : input.previousBallonDor === 3 ? 11 : Math.max(0.22, 5 * 0.46 ** (input.previousBallonDor - 4));
    chance = Math.max(chance, worldCupFloor);
  }

  return {
    eligible: true,
    score,
    chance: Math.max(0.03, Number(clamp(chance, 0.03, 96).toFixed(3))),
    historicSeason,
    stage,
  };
}

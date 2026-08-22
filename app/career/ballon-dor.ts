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
  /** Copa nacional entra no currículo da temporada, mas nunca abre a porta da Bola de Ouro. */
  domesticCupChampion?: boolean;
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
  if (stage === "elite") return 10;
  if (stage === "major") return 5;
  if (stage === "secondary") return -5;
  if (stage === "minor") return -15;
  return -8;
}

function stageChanceMultiplier(
  stage: BallonDorEvaluation["stage"],
  globalBreakthrough: boolean,
  continentalChampion: boolean,
) {
  if (stage === "elite") return 1;
  if (stage === "major") return 0.9;
  if (stage === "secondary") return globalBreakthrough || continentalChampion ? 0.62 : 0.48;
  if (stage === "minor") return globalBreakthrough ? 0.46 : continentalChampion ? 0.34 : 0.24;
  return globalBreakthrough ? 0.72 : continentalChampion ? 0.62 : 0.48;
}

function repeatMultiplier(previous: number) {
  if (previous <= 0) return 1;
  if (previous === 1) return 0.58;
  if (previous === 2) return 0.34;
  if (previous === 3) return 0.2;
  if (previous === 4) return 0.11;
  if (previous === 5) return 0.06;
  if (previous === 6) return 0.032;
  return Math.max(0.002, 0.018 * 0.58 ** (previous - 7));
}

function leagueTitleBonus(stage: BallonDorEvaluation["stage"], prestige: number) {
  if (stage === "elite") return 14;
  if (stage === "major") return 11;
  if (stage === "secondary") return 8;
  if (stage === "minor") return 5;
  return 6 + Math.max(0, prestige - 2) * 1.4;
}

function continentalTitleBonus(slot: BallonDorEvaluationInput["playsContinental"]) {
  if (slot === "champions") return 24;
  if (slot === "libertadores") return 21;
  if (slot === "concacaf" || slot === "asian" || slot === "african") return 15;
  if (slot === "europa" || slot === "sudamericana") return 11;
  if (slot === "conference") return 7;
  return 0;
}

function worldCupImpact(goals: number, assists: number) {
  if (goals >= 8) return 34 + Math.min(12, (goals - 8) * 2.2 + assists * 0.9);
  if (goals >= 5) return 17 + (goals - 5) * 2.4 + assists * 0.8;
  if (goals >= 3) return 8 + (goals - 3) * 2.2 + assists * 0.7;
  return goals * 1.8 + assists * 0.8;
}

export function evaluateBallonDor(input: BallonDorEvaluationInput): BallonDorEvaluation {
  const stage = stageFor(input);
  const historicSeason = historicProduction(input);
  const isBrasileirao = input.league.id === "brasileirao";
  const worldCupAutomatic = input.worldCupGoals >= 8;
  const continentalTitle = Boolean(input.playsContinental) && input.continentalChampion;
  const topContinentalTitle =
    continentalTitle &&
    ["champions", "libertadores", "concacaf", "asian", "african"].includes(input.playsContinental);
  const secondaryContinentalTitle =
    continentalTitle &&
    ["europa", "sudamericana"].includes(input.playsContinental);
  const conferenceTitle = continentalTitle && input.playsContinental === "conference";

  // majorClubTitleCount já ignora Copa nacional, Supercopas e Recopas. O que
  // sobra é liga, torneio continental relevante e Mundial. Isso permite inferir
  // se houve título de liga sem acoplar o avaliador à lista completa de competições.
  const inferredLeagueChampion =
    input.majorClubTitleCount > Number(continentalTitle) + Number(input.mundialChampion);
  const hasMeaningfulTitle = input.majorClubTitleCount > 0 || input.majorNationalTitle;
  const globalBreakthrough = topContinentalTitle || input.mundialChampion || input.majorNationalTitle;
  const worldCupHero =
    input.majorNationalTitle &&
    (input.worldCupGoals >= 4 || input.worldCupGoals + input.worldCupAssists >= 6);

  const positionalRecognition =
    (input.isKeeper && input.overall >= 80 && input.performanceScore >= 80) ||
    (input.positionZone === "defesa" && input.overall >= 81 && input.performanceScore >= 81) ||
    (input.positionZone === "meio" && input.overall >= 80 && input.performanceScore >= 79 && input.goals + input.assists >= 22) ||
    (
      input.positionZone === "ataque" &&
      input.overall >= 79 &&
      input.performanceScore >= 77 &&
      (input.goals >= 25 || input.goals + input.assists >= 38)
    );
  const worldClassRecognition =
    input.hasProductionAward ||
    input.supportingAwardBonus >= 2.5 ||
    historicSeason ||
    positionalRecognition;
  const baseAvailability = input.appearances >= 19;

  const production = input.isKeeper
    ? input.cleanSheets * 1.9 - input.goalsConceded * 0.09
    : input.positionZone === "defesa"
      ? input.goals * 1.55 + input.assists * 1.25
      : input.positionZone === "meio"
        ? input.goals * 0.78 + input.assists * 1.08
        : input.goals + input.assists * 0.68;
  const productionTarget = input.isKeeper ? 21 : input.positionZone === "defesa" ? 17 : input.positionZone === "meio" ? 31 : 38;
  const productionModifier = clamp((production - productionTarget) / 1.25, -14, 22);
  const positionModifier = input.isKeeper ? -4 : input.positionZone === "defesa" ? -2 : input.positionZone === "ataque" ? 2 : 0;
  const majorTitleStackBonus = Math.max(0, input.majorClubTitleCount - 1) * 2.5;
  const score =
    input.performanceScore * 0.36 +
    input.overall * 0.26 +
    input.reputation * 0.1 +
    stageScore(stage) +
    productionModifier +
    (inferredLeagueChampion ? leagueTitleBonus(stage, input.league.prestige) : 0) +
    (continentalTitle ? continentalTitleBonus(input.playsContinental) : 0) +
    (input.mundialChampion ? 16 : 0) +
    (input.majorNationalTitle ? 13 : 0) +
    worldCupImpact(input.worldCupGoals, input.worldCupAssists) +
    majorTitleStackBonus +
    input.supportingAwardBonus +
    positionModifier;

  // Regra de exceção absoluta: uma Copa do Mundo de 8+ gols é uma campanha
  // histórica demais para ser submetida ao resto do funil, com ou sem título.
  if (worldCupAutomatic) {
    return {
      eligible: true,
      score,
      chance: 100,
      historicSeason: true,
      stage,
    };
  }

  // Regra central do rework: uma temporada sem título de peso NÃO pode gerar
  // Bola de Ouro. Copa nacional (FA Cup, Copa do Brasil etc.) não vale como chave.
  if (!hasMeaningfulTitle) {
    return { eligible: false, score, chance: 0, historicSeason, stage };
  }

  const worldCupRescue =
    worldCupHero &&
    input.appearances >= 12 &&
    input.overall >= 78 &&
    input.performanceScore >= 58 &&
    input.reputation >= 35;

  let eligible = worldCupRescue;
  if (!eligible && input.inEurope && stage === "elite") {
    eligible =
      baseAvailability &&
      input.overall >= 78 &&
      input.performanceScore >= 73 &&
      input.reputation >= 28 &&
      worldClassRecognition;
  } else if (!eligible && input.inEurope && stage === "major") {
    eligible =
      input.appearances >= 20 &&
      input.overall >= 80 &&
      input.performanceScore >= 76 &&
      input.reputation >= 38 &&
      worldClassRecognition;
  } else if (!eligible && input.inEurope && stage === "secondary") {
    eligible =
      input.appearances >= 22 &&
      input.overall >= 84 &&
      input.performanceScore >= 83 &&
      input.reputation >= 54 &&
      (input.hasProductionAward || historicSeason) &&
      (
        globalBreakthrough ||
        secondaryContinentalTitle ||
        (inferredLeagueChampion && historicSeason)
      );
  } else if (!eligible && input.inEurope) {
    eligible =
      input.appearances >= 25 &&
      input.overall >= 89 &&
      input.performanceScore >= 90 &&
      input.reputation >= 75 &&
      input.hasProductionAward &&
      historicSeason &&
      (
        globalBreakthrough ||
        secondaryContinentalTitle ||
        (inferredLeagueChampion && input.majorClubTitleCount >= 1)
      );
  } else if (!eligible && isBrasileirao) {
    eligible =
      input.appearances >= 26 &&
      input.overall >= 88 &&
      input.performanceScore >= 89 &&
      input.reputation >= 68 &&
      input.hasProductionAward &&
      historicSeason &&
      (topContinentalTitle || input.mundialChampion || input.majorNationalTitle);
  } else if (!eligible && input.league.prestige >= 4) {
    eligible =
      input.appearances >= 21 &&
      input.overall >= 83 &&
      input.performanceScore >= 81 &&
      input.reputation >= 52 &&
      worldClassRecognition &&
      (
        continentalTitle ||
        input.mundialChampion ||
        input.majorNationalTitle ||
        (inferredLeagueChampion && historicSeason)
      );
  } else if (!eligible && input.league.prestige === 3) {
    eligible =
      input.appearances >= 23 &&
      input.overall >= 85 &&
      input.performanceScore >= 85 &&
      input.reputation >= 60 &&
      (input.hasProductionAward || historicSeason) &&
      (
        globalBreakthrough ||
        secondaryContinentalTitle ||
        (inferredLeagueChampion && historicSeason)
      );
  } else if (!eligible) {
    eligible =
      input.appearances >= 25 &&
      input.overall >= 89 &&
      input.performanceScore >= 90 &&
      input.reputation >= 75 &&
      input.hasProductionAward &&
      historicSeason &&
      globalBreakthrough;
  }

  if (!eligible) return { eligible: false, score, chance: 0, historicSeason, stage };

  const firstChance = clamp(10 + Math.max(0, score - 68) * 1.8, 10, 90);
  const repeatBase = clamp(8 + Math.max(0, score - 78) * 1.35, 8, 55);
  const stageMultiplier = stageChanceMultiplier(stage, globalBreakthrough, continentalTitle);
  const titleQualityMultiplier =
    topContinentalTitle ? 1.08 :
    input.mundialChampion ? 1.06 :
    input.majorNationalTitle ? 1.04 :
    secondaryContinentalTitle ? 0.98 :
    conferenceTitle ? 0.9 :
    inferredLeagueChampion ? 0.96 :
    0.9;
  const brazilMultiplier = isBrasileirao ? 0.55 : 1;
  let chance =
    (input.previousBallonDor === 0 ? firstChance : repeatBase) *
    repeatMultiplier(input.previousBallonDor) *
    stageMultiplier *
    titleQualityMultiplier *
    brazilMultiplier;

  // A Copa pode salvar um ano de clube ruim, mas não transformar o prêmio em
  // automático. A exceção automática continua sendo exclusivamente 8+ gols.
  if (worldCupRescue) {
    const rescueFloor = input.previousBallonDor === 0
      ? 28
      : 18 * repeatMultiplier(input.previousBallonDor);
    chance = Math.max(chance, rescueFloor);
  }

  // Temporadas realmente históricas continuam muito competitivas, desde que
  // tenham passado pela porta obrigatória de um título de peso.
  if (historicSeason && (stage === "elite" || stage === "major")) {
    const historicFloor = input.previousBallonDor === 0
      ? 42
      : 22 * repeatMultiplier(input.previousBallonDor);
    chance = Math.max(chance, historicFloor);
  }

  return {
    eligible: true,
    score,
    chance: Number(clamp(chance, 0.03, 96).toFixed(3)),
    historicSeason,
    stage,
  };
}

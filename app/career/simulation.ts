import { CLUBS, COUNTRIES, FIRST_MATCH_EVENT, FORMATIONS, POSITIONS, countryById, leagueById } from "../game-data";
import type { ContinentalSlot, Effect, GameEvent } from "../game-data";
import { calculateLegacyScore, calculateSquadRole, createContract, createSeasonObjective, evaluateObjective, roleAppearanceModifier } from "../career-systems";
import { NEWS_TEMPLATES, RIVALRIES, fillNewsTemplate, getUnlockedAchievements } from "../mega-expansion";
import { pickClubWorldOpponent, pickFinalOpponent, pickNationalOpponent } from "../botao/adapter";
import type { AppSettings, AwardNomination, CompetitionId, CompetitionResult, GameState, MedicalRecord, MonteCarloCareerSummary, MonteCarloReport, NationalRecord, NationalTier, PendingBotaoMatch, SeasonRecord, SeasonResult, SocialPost, SpecialTraitId } from "./model";
import { DYNAMIC_LIFE_EVENT_ID, DYNAMIC_RIVAL_EVENT_ID, DYNAMIC_SOCIAL_EVENT_ID, DYNAMIC_SPONSOR_DUTY_EVENT_ID, DYNAMIC_SPONSOR_EVENT_ID, DYNAMIC_STORY_EVENT_ID, NATIONALITY_SWITCH_EVENT_ID, applyEffect, buildLifeEvent, buildNationalitySwitchEvent, buildRivalEvent, buildSocialEvent, buildSponsorDutyEvent, buildSponsorEvent, buildStoryCareerEvent, buildStorySeasonDecision, createYouthJourney, maybeOfferNationalitySwitch, selectNextEvent } from "./events";
import { ALL_PRO_EVENTS, BALLON_DOR_EXCLUDED_TROPHIES, POSITION_PRIMARY_ATTRIBUTES, attributeAverage, awardFinalists, awardPresentation, awardTierWeight, createCareerRivals, createPlayerAttributes, evolvePlayerAttributes, evolveRivals, fictionalAwardWinner, initialState, selectCareerTraits } from "./state";
import { clamp, clubById, pick, seeded } from "./shared";
import { DOMESTIC_SUPER_CUP_NAMES, clubConfederation, continentalSlotAfterSeason, initialAdaptation, initialContinentalSlot, isEuropeanClub, isOutsideAcademyHome, isOutsideCountry, positionByKey, randomAcademyClubs } from "./academy";
import { addStats, competitiveStrength, describeEffects, isIdolAtClub, marketValue, medicalRecordForSeason, mergeEffects, seasonAverageRating, seasonPerformanceScore, simulatedWorldCupStats, worldCupGamesThroughStage } from "./performance";
import { applyAcceptedTransfer, completeLoanReturn, materializeTransferOffers, selectAlternativeExileOffers, selectTransferOffers } from "./transfer-market";
import { advanceWorldPlayerUniverse } from "./world-players";

export function isNegativeConsequence(change: string) {
  const normalized = change.toLocaleLowerCase("pt-BR");
  return change.startsWith("-") || normalized.includes("piorou") || normalized.includes("risco") || normalized.includes("despedida");
}

export function simulateSeason(
  state: GameState,
  event: GameEvent,
  effect: Effect,
  choiceLabel: string,
  resultText: string,
  luckOutcome: "success" | "failure" | null = null,
  finalMatchMode: AppSettings["finalMatchMode"] = "play-key-matches",
): GameState {
  const affected = applyEffect(state, effect);
  let nationalitySwitchRecord: NationalRecord | null = null;
  if (effect.switchNationalityTo && effect.switchNationalityTo !== state.nationality) {
    const fromCountry = countryById(state.nationality);
    const toCountry = countryById(effect.switchNationalityTo);
    affected.nationality = effect.switchNationalityTo;
    affected.nationalCaps = 0;
    affected.nationalGoals = 0;
    affected.nationalAssists = 0;
    affected.nationalCaptain = false;
    affected.nationalCategory = "none";
    affected.nationalLevel = Math.round(affected.nationalLevel * 0.4);
    nationalitySwitchRecord = { season: state.season, tier: "none", name: "Troca de Seleção", icon: "↔", stage: `Deixou a Seleção de ${fromCountry.name} para defender a Seleção de ${toCountry.name}`, champion: false };
  }
  const club = clubById(affected.currentClubId);
  const league = leagueById(affected.currentLeagueId || club.leagueId);
  const country = countryById(club.countryId);
  const awayFromAcademyHome = isOutsideAcademyHome(affected, club);
  const inEurope = isEuropeanClub(club);
  const position = positionByKey(affected.position);
  const isKeeper = position.key === "GOL";
  const attributes = affected.attributes;
  const hasTrait = (trait: SpecialTraitId) => affected.traits.includes(trait);
  const consistencySwing = hasTrait("inconsistent")
    ? 0.72 + seeded(state.seed, state.season * 2141) * 0.7
    : 1;
  const primaryAttributeRating = attributeAverage(attributes, POSITION_PRIMARY_ATTRIBUTES[position.key]);
  const finishingSkill = attributes.finishing * 0.54 + attributes.positioning * 0.26 + attributes.composure * 0.2;
  const creationSkill = attributes.passing * 0.38 + attributes.vision * 0.27 + attributes.crossing * 0.2 + attributes.dribbling * 0.15;
  const defensiveSkill = attributes.marking * 0.36 + attributes.tackling * 0.36 + attributes.aerial * 0.16 + attributes.positioning * 0.12;
  const keeperSkill = attributes.reflexes * 0.42 + attributes.handling * 0.34 + attributes.positioning * 0.14 + attributes.distribution * 0.1;
  const adaptationPenalty = awayFromAcademyHome ? Math.max(0, (72 - affected.adaptation) / 8) : 0;
  const leaguePressure = inEurope ? league.prestige * 3 : Math.max(0, league.prestige - 3) * 2;
  const requirement = 55 + club.reputation * 5 + leaguePressure;
  const seasonRole = calculateSquadRole(affected.overall, club, league.prestige, affected.managerTrust, affected.age);
  const roleScore = affected.overall - requirement + (primaryAttributeRating - affected.overall) * 0.18 + (effect.minutes ?? 0) - adaptationPenalty + roleAppearanceModifier(seasonRole);
  const baseApps = roleScore >= 5 ? 33 : roleScore >= 0 ? 26 : roleScore >= -5 ? 19 : 11;
  const provisionalCards = Math.floor(seeded(state.seed, state.season * 211) * 5);
  const suspensionPenalty = affected.suspensionMatches + (affected.discipline < 35 ? 3 : affected.discipline < 55 ? 1 : 0);
  const quality = clamp((affected.overall - 48) / 35, 0.45, 1.5);
  const roleProductionBonus = seasonRole === "estrela" ? 0.12 : seasonRole === "titular" ? 0.07 : seasonRole === "rotacao" ? 0.02 : seasonRole === "reserva" ? -0.03 : 0;
  const productionMomentum = clamp(
    1.1 + roleProductionBonus + (affected.morale - 50) / 250 + (affected.managerTrust - 50) / 300 + (affected.fitness - 70) / 500 + (affected.lifeBalance - 55) / 620,
    0.9,
    1.45,
  ) * consistencySwing;
  const finishingFactor = clamp(0.45 + finishingSkill / 100, 0.68, 1.44) * (hasTrait("clinical-finisher") ? 1.13 : 1) * (hasTrait("free-kick") ? 1.04 : 1);
  const creationFactor = clamp(0.45 + creationSkill / 100, 0.68, 1.44) * (hasTrait("playmaker") ? 1.13 : 1);
  const lowOverallProductionBrake = affected.overall < 80 ? 0.76 + Math.max(0, affected.overall - 42) / 100 : 1;
  const goalRate = position.goals * quality * finishingFactor * productionMomentum * lowOverallProductionBrake * (0.82 + seeded(state.seed, state.season * 7) * 1.02);
  const assistRate = position.assists * quality * creationFactor * productionMomentum * (affected.overall < 80 ? 0.88 : 1) * (0.82 + seeded(state.seed, state.season * 13) * 1.02);
  const expectedContribution = Math.max(0.08, (position.goals + position.assists * 0.72) * quality);
  const contributionRate = goalRate + assistRate * 0.72;
  const formRatio = contributionRate / expectedContribution;
  const inSeasonMeritApps = isKeeper
    ? 0
    : formRatio >= 1.7
      ? 10
      : formRatio >= 1.4
        ? 7
        : formRatio >= 1.18
          ? 4
          : 0;
  const previousSeason = affected.lastResult ?? affected.history.at(-1);
  const previousPosition = previousSeason?.position ?? affected.position;
  const previousPositionData = positionByKey(previousPosition);
  const previousContributionRate = previousSeason && previousSeason.appearances >= 10
    ? previousPositionData.key === "GOL"
      ? previousSeason.cleanSheets / Math.max(1, previousSeason.appearances)
      : (previousSeason.goals + previousSeason.assists * 0.72) / Math.max(1, previousSeason.appearances)
    : 0;
  const previousExpectedRate = previousPositionData.key === "GOL"
    ? 0.28
    : Math.max(0.08, previousPositionData.goals + previousPositionData.assists * 0.72);
  const previousFormApps = previousContributionRate >= previousExpectedRate * 1.65
    ? 8
    : previousContributionRate >= previousExpectedRate * 1.3
      ? 5
      : previousContributionRate >= previousExpectedRate
        ? 2
        : 0;
  const appearances = clamp(
    Math.round(baseApps + seeded(state.seed, state.season * 3) * 8 + inSeasonMeritApps + previousFormApps + (attributes.stamina - 60) / 12 + (hasTrait("iron-lungs") ? 3 : 0) - suspensionPenalty),
    3,
    44,
  );
  const goals = isKeeper ? (seeded(state.seed, state.season * 5) > 0.992 ? 1 : 0) : Math.max(0, Math.round(appearances * goalRate));
  const assists = isKeeper ? Math.round(seeded(state.seed, state.season * 11) * 2) : Math.max(0, Math.round(appearances * assistRate));
  const tackles = position.zone === "defesa"
    ? Math.max(0, Math.round(appearances * clamp(1.8 + defensiveSkill / 40 + (affected.managerTrust - 50) / 120, 1.7, 4.8)))
    : position.zone === "meio"
      ? Math.max(0, Math.round(appearances * clamp(0.8 + defensiveSkill / 75, 0.7, 2.6)))
      : 0;
  const cleanSheets = isKeeper ? Math.round(appearances * clamp(0.07 + club.reputation * 0.035 + keeperSkill / 270, 0.16, 0.57)) : 0;
  const goalsConceded = isKeeper ? Math.max(4, Math.round(appearances * clamp(1.7 - club.reputation * 0.09 - keeperSkill / 160, 0.45, 1.45))) : 0;
  const positionCardWeight = position.zone === "defesa" ? 1.35 : position.zone === "meio" ? 1 : 0.65;
  const yellowCards = Math.max(0, Math.round((provisionalCards + appearances / 10) * positionCardWeight * (1.28 - affected.discipline / 180)));
  const redCards = seeded(state.seed, state.season * 223) < Math.max(0.015, (72 - affected.discipline) / 270) ? 1 : 0;
  const seasonStats = { appearances, goals, assists, tackles, cleanSheets, goalsConceded, yellowCards, redCards };

  const boost = (effect.titleBoost ?? 0) + (hasTrait("big-game") ? 5 : 0);
  const strength = competitiveStrength(club);
  const playerImpact = Math.max(0, affected.overall - 70) + Math.max(0, primaryAttributeRating - 70) * 0.12 + Math.max(0, defensiveSkill - 75) * 0.04;
  const seasonDominanceBoost = clamp((formRatio - 1) * 5, 0, 7);
  const leagueChance = clamp(
    4 + (strength - 70) * 0.7 + playerImpact * 0.36 + seasonDominanceBoost + boost * 0.25 + affected.fanSupport / 55 - (inEurope ? league.prestige * 0.35 : 0),
    1,
    27,
  );
  const cupChance = clamp(3 + (strength - 70) * 0.45 + playerImpact * 0.28 + boost * 0.22, 1, 20);
  const playsContinental = affected.continentalSlot;
  const playsWorld = affected.worldQualifiedSeason === affected.season && affected.worldQualifiedClubId === club.id;
  const continentalTier = playsContinental === "champions" ? -2 : playsContinental === "libertadores" ? 0 : playsContinental === "europa" ? 1 : 2;
  const underdogContinentalFactor = strength < 74 ? 0.62 : strength < 78 ? 0.82 : 1;
  const continentalChance = clamp(
    (2 + (strength - 74) * 0.38 + Math.max(0, affected.overall - 72) * 0.35 + seasonDominanceBoost * 0.7 + boost * 0.18 + continentalTier) * underdogContinentalFactor,
    0.6,
    18,
  );
  const worldChance = clamp(1 + (strength - 76) * 0.28 + Math.max(0, affected.overall - 74) * 0.24 + boost * 0.1, 0.5, 12);

  const leagueChampion =
    affected.corruptionGuaranteedSeason === affected.season ||
    seeded(state.seed, state.season * 17) * 100 < leagueChance;
  const cupLoadFactor = leagueChampion ? 0.7 : 1;
  const cupChampion = seeded(state.seed, state.season * 41) * 100 < cupChance * cupLoadFactor;
  const continentalLoadFactor = (leagueChampion ? 0.78 : 1) * (cupChampion ? 0.68 : 1);
  const continentalChampion = Boolean(playsContinental) && seeded(state.seed, state.season * 47) * 100 < continentalChance * continentalLoadFactor;
  const worldLoadFactor = (leagueChampion ? 0.86 : 1) * (cupChampion ? 0.82 : 1);
  const mundialChampion = playsWorld && seeded(state.seed, state.season * 53) * 100 < worldChance * worldLoadFactor;
  const previousClubSeason = affected.history.at(-1);
  const previousClubCompetitions =
    previousClubSeason?.clubId === club.id && (previousClubSeason.leagueId ?? club.leagueId) === league.id
      ? previousClubSeason.competitions
      : [];
  const wonLastSeason = (ids: CompetitionId[]) => previousClubCompetitions.some((competition) => ids.includes(competition.id) && competition.champion);
  const playsDomesticSuperCup = wonLastSeason(["domesticLeague", "domesticCup"]) && Boolean(DOMESTIC_SUPER_CUP_NAMES[league.id]);
  const playsUefaSuperCup = clubConfederation(club) === "EUROPE" && wonLastSeason(["championsLeague", "europaLeague"]);
  const playsRecopaSudamericana = clubConfederation(club) === "SOUTH_AMERICA" && wonLastSeason(["libertadores", "sudamericana"]);
  const playsCampeonesCup = ["liga-mx", "mls"].includes(league.id) && wonLastSeason(["domesticLeague"]);
  const superCupChance = clamp(34 + (strength - 70) * 1.15 + playerImpact * 0.7 + boost * 0.4, 12, 82);
  const domesticSuperCupChampion = playsDomesticSuperCup && seeded(state.seed, state.season * 73) * 100 < superCupChance;
  const uefaSuperCupChampion = playsUefaSuperCup && seeded(state.seed, state.season * 79) * 100 < superCupChance * 0.9;
  const recopaSudamericanaChampion = playsRecopaSudamericana && seeded(state.seed, state.season * 83) * 100 < superCupChance * 0.92;
  const campeonesCupChampion = playsCampeonesCup && seeded(state.seed, state.season * 89) * 100 < superCupChance * 0.94;
  const leagueClubCount = Math.max(2, CLUBS.filter((candidate) => candidate.leagueId === league.id).length);
  const expectedPosition = (leagueClubCount + 1) / 2 - (strength - 74) * 0.45 - playerImpact * 0.08;
  const leaguePosition = leagueChampion
    ? 1
    : clamp(Math.round(expectedPosition + seeded(state.seed, state.season * 59) * 8 - 4), 2, leagueClubCount);
  const championshipPlayoffPromotion =
    league.id === "championship" &&
    leaguePosition >= 3 &&
    leaguePosition <= 6 &&
    seeded(state.seed, state.season * 601) < clamp(0.34 + (6 - leaguePosition) * 0.09 + playerImpact * 0.012, 0.2, 0.72);
  const promotedLeagueId =
    league.id === "brasileirao-b" && leaguePosition <= 4
      ? "brasileirao"
      : league.id === "championship" && (leaguePosition <= 2 || championshipPlayoffPromotion)
        ? "premier"
        : "";
  const promotion = promotedLeagueId
    ? championshipPlayoffPromotion
      ? `Acesso à Premier League conquistado nos playoffs!`
      : `Acesso conquistado para a ${leagueById(promotedLeagueId).name}!`
    : null;
  const knockoutStage = (salt: number, champion: boolean, stages: string[]) => champion ? "CAMPEÃO" : stages[Math.floor(seeded(state.seed, state.season * salt) * stages.length)];
  const competitions: CompetitionResult[] = [
    { id: "domesticLeague", name: league.name, icon: country.abbr, stage: leagueChampion ? "CAMPEÃO" : `${leaguePosition}º lugar`, champion: leagueChampion },
    { id: "domesticCup", name: league.cupName, icon: country.abbr, stage: knockoutStage(61, cupChampion, ["2ª fase", "Oitavas", "Quartas", "Semifinal", "Vice"]), champion: cupChampion },
  ];
  const continentalNames: Record<ContinentalSlot, { id: CompetitionId; name: string; icon: string }> = {
    libertadores: { id: "libertadores", name: "Libertadores", icon: "LIB" },
    sudamericana: { id: "sudamericana", name: "Copa Sul-Americana", icon: "SULA" },
    champions: { id: "championsLeague", name: "Champions League", icon: "UCL" },
    europa: { id: "europaLeague", name: "Europa League", icon: "UEL" },
    conference: { id: "conferenceLeague", name: "Conference League", icon: "UECL" },
    concacaf: { id: "concacafChampions", name: "Copa de Campeões Concacaf", icon: "CCC" },
    asian: { id: "afcChampions", name: "AFC Champions League Elite", icon: "ACL" },
    african: { id: "cafChampions", name: "CAF Champions League", icon: "CAF" },
  };
  if (playsContinental) {
    const info = continentalNames[playsContinental];
    competitions.push({ id: info.id, name: info.name, icon: info.icon, stage: knockoutStage(67, continentalChampion, ["Fase de grupos", "Oitavas", "Quartas", "Semifinal", "Vice"]), champion: continentalChampion });
  }
  if (playsWorld) competitions.push({ id: "mundial", name: "Mundial de Clubes", icon: "MUN", stage: knockoutStage(71, mundialChampion, ["Fase de grupos", "Oitavas", "Quartas", "Semifinal", "Vice"]), champion: mundialChampion });
  if (playsDomesticSuperCup) competitions.push({
    id: "domesticSuperCup",
    name: DOMESTIC_SUPER_CUP_NAMES[league.id],
    icon: "SUP",
    stage: domesticSuperCupChampion ? "CAMPEÃO" : "Vice",
    champion: domesticSuperCupChampion,
  });
  if (playsUefaSuperCup) competitions.push({
    id: "uefaSuperCup",
    name: "Supercopa da UEFA",
    icon: "USC",
    stage: uefaSuperCupChampion ? "CAMPEÃO" : "Vice",
    champion: uefaSuperCupChampion,
  });
  if (playsRecopaSudamericana) competitions.push({
    id: "recopaSudamericana",
    name: "Recopa Sul-Americana",
    icon: "REC",
    stage: recopaSudamericanaChampion ? "CAMPEÃO" : "Vice",
    champion: recopaSudamericanaChampion,
  });
  if (playsCampeonesCup) competitions.push({
    id: "campeonesCup",
    name: "Campeones Cup",
    icon: "CAM",
    stage: campeonesCupChampion ? "CAMPEÃO" : "Vice",
    champion: campeonesCupChampion,
  });
  const titleCount = competitions.filter((competition) => competition.champion).length;
  const majorClubTitleCount = competitions.filter((competition) =>
    competition.champion &&
    !BALLON_DOR_EXCLUDED_TROPHIES.has(competition.id),
  ).length;

  const growthRoll = seeded(state.seed, state.season * 19);
  let development = 0;
  if (affected.age <= 19) development = growthRoll < 0.32 ? 0 : growthRoll < 0.78 ? 1 : growthRoll < 0.96 ? 2 : 3;
  else if (affected.age <= 23) development = growthRoll < 0.36 ? 0 : growthRoll < 0.8 ? 1 : growthRoll < 0.96 ? 2 : 3;
  else if (affected.age <= 27) development = growthRoll < 0.52 ? 0 : growthRoll < 0.92 ? 1 : 2;
  else if (affected.age <= 29) development = growthRoll < 0.58 ? 0 : growthRoll < 0.94 ? 1 : 2;
  else if (affected.age <= 31) development = growthRoll < 0.03 ? -1 : growthRoll < 0.6 ? 0 : growthRoll < 0.94 ? 1 : 2;
  else if (affected.age <= 33) development = growthRoll < 0.08 ? -2 : growthRoll < 0.38 ? -1 : growthRoll < 0.92 ? 0 : 1;
  else if (affected.age <= 35) development = growthRoll < 0.12 ? -3 : growthRoll < 0.42 ? -2 : growthRoll < 0.88 ? -1 : 0;
  else development = growthRoll < 0.2 ? -4 : growthRoll < 0.55 ? -3 : growthRoll < 0.9 ? -2 : -1;
  if (affected.age <= 22) {
    const catchUp = affected.overall < 56 ? 4 : affected.overall < 61 ? 3 : affected.overall < 66 ? 2 : affected.overall < 70 ? 1 : 0;
    development += Math.max(0, catchUp - (appearances < 10 ? 1 : 0));
  }
  const performanceScore = seasonPerformanceScore(affected.position, {
    ...seasonStats,
    overall: affected.overall,
    title: titleCount > 0,
  });
  const averageRating = seasonAverageRating(performanceScore, affected.seed, affected.season);
  const manOfTheMatchAwards = Math.max(0, Math.round(
    appearances * Math.max(0, averageRating - 6.8) * (0.055 + seeded(affected.seed, affected.season * 943) * 0.025),
  ));
  const europeanSpotlight = inEurope && performanceScore >= 58
    ? clamp(Math.floor((performanceScore - 49) / 9), 1, 6)
    : 0;
  const europeanDevelopmentBonus =
    inEurope &&
    affected.age <= 27 &&
    appearances >= 18 &&
    performanceScore >= 64 &&
    affected.overall < affected.potential
      ? performanceScore >= 88 && affected.age <= 23 ? 2 : 1
      : 0;
  development += europeanDevelopmentBonus;
  if (appearances < 15 && seeded(state.seed, state.season * 79) > 0.48) development -= 1;

  let twist: string | null = null;
  let twistFitness = 0;
  let twistMorale = 0;
  let setbackDelta = 0;
  let luckyDelta = 0;
  let medicalRecord: MedicalRecord | null = null;
  const twistRoll = seeded(state.seed, state.season * 83);
  const injuryTraitFactor = hasTrait("ironman") ? 0.52 : hasTrait("injury-prone") ? 1.75 : 1;
  const seriousInjuryChance = 0.038 + Math.max(0, 65 - affected.fitness) / 450 + Math.max(0, 45 - affected.lifeBalance) / 650 + (effect.injuryRisk ?? 0) / 500;
  const effectiveSeriousInjuryChance = seriousInjuryChance * injuryTraitFactor;
  if (twistRoll < effectiveSeriousInjuryChance) {
    medicalRecord = medicalRecordForSeason(affected);
    development -= 3;
    twistFitness = -24;
    twistMorale = -10;
    setbackDelta = 1;
    twist = `${medicalRecord.name}: ${medicalRecord.recoveryMonths} meses de recuperação e ${medicalRecord.matchesMissed} jogos estimados fora.`;
  } else if (twistRoll < effectiveSeriousInjuryChance + 0.095) {
    development -= 1;
    twistMorale = -13;
    setbackDelta = 1;
    twist = "A confiança desapareceu por meses. Nem toda fase ruim tem uma explicação simples.";
  } else if (twistRoll > 0.95 && affected.age <= 29 && affected.overall < affected.potential) {
    development += Math.min(2, affected.potential - affected.overall);
    twistMorale = 10;
    luckyDelta = 1;
    twist = "Uma sequência improvável virou sua temporada e acelerou sua evolução.";
  }

  if (affected.age <= 31 && development < 0) {
    const rareEarlyDeclineChance = affected.age <= 29 ? 0.015 : 0.04;
    development = seeded(state.seed, state.season * 197) < rareEarlyDeclineChance ? -1 : 0;
  }

  const breakoutThreshold = isKeeper ? 70 : position.zone === "defesa" ? 72 : position.zone === "meio" ? 84 : 88;
  const breakoutMargin = performanceScore - breakoutThreshold;
  const breakoutChance = clamp(12 + Math.max(0, breakoutMargin) * 2.2 + titleCount * 3, 12, 55);
  let breakoutBonus = 0;
  if (
    affected.age <= 29 &&
    performanceScore >= breakoutThreshold &&
    affected.potential - (affected.overall + development) >= 3 &&
    setbackDelta === 0 &&
    seeded(state.seed, state.season * 199) * 100 < breakoutChance
  ) {
    const hugeBreakout = breakoutMargin >= 15 || performanceScore >= 96;
    const rolledBonus = (hugeBreakout ? 5 : 3) + Math.floor(seeded(state.seed, state.season * 211 + 17) * 3);
    breakoutBonus = Math.min(rolledBonus, affected.potential - (affected.overall + development));
    development += breakoutBonus;
  }

  if (affected.overall >= affected.potential && development > 0) development = 0;
  if (development > 0) development = Math.min(development, affected.potential - affected.overall);
  const nextOverall = clamp(affected.overall + development, 42, Math.max(affected.potential, affected.overall));
  const nextAge = affected.age + 1;
  const nextAttributes = evolvePlayerAttributes(
    affected.attributes,
    affected.position,
    development,
    nextAge,
    affected.seed,
    affected.season,
  );
  // Seleção nacional: convocação real, categorias e grandes torneios.
  const nation = countryById(affected.nationality);
  const ageTier: NationalTier = affected.age <= 14 ? "none" : affected.age <= 17 ? "sub17" : affected.age <= 20 ? "sub20" : affected.age <= 23 ? "olympic" : "main";
  const seniorThreshold = 78 + Math.max(0, nation.strength - 3) * 2 - Math.min(7, Math.floor(affected.reputation / 14));
  const seniorEligible = affected.age >= 17 && affected.overall >= seniorThreshold;
  const nationalTier: NationalTier = ageTier !== "none" && ageTier !== "main" && seniorEligible ? "main" : ageTier;
  let nationalCaps = affected.nationalCaps;
  let nationalGoals = affected.nationalGoals;
  let nationalAssists = affected.nationalAssists;
  let nationalCaptain = Boolean(affected.nationalCaptain || effect.nationalCaptain);
  let nationalTrophiesCount = affected.nationalTrophies;
  let nationalHistoryAdd: NationalRecord | null = null;
  let qualifiedNextMajor = affected.qualifiedNextMajor;
  let nationalNote: string | null = null;
  let nationalCalled = false;
  if (nationalTier !== "none") {
    const strengthDifficulty = nationalTier === "main" ? Math.max(0, nation.strength - 3) * 2 : Math.max(0, nation.strength - 3);
    const tierRequirement = (nationalTier === "main" ? 74 : nationalTier === "olympic" ? 70 : nationalTier === "sub20" ? 64 : 58) + strengthDifficulty;
    const callChance = clamp(
      8 +
      (affected.overall - tierRequirement) * 3 +
      affected.nationalLevel * 0.3 +
      affected.reputation * 0.12 +
      Math.max(0, appearances - 12) * 0.45 +
      (affected.morale - 50) * 0.1 -
      Math.max(0, 60 - affected.fitness) * 0.3,
      2,
      92,
    );
    const called = Boolean(effect.nationalCall || effect.nationalCaptain) || seeded(state.seed, state.season * 131 + 7) * 100 < callChance;
    nationalCalled = called;
    if (called) {
      const capsGain = Math.round(3 + seeded(state.seed, state.season * 137) * 5);
      const nationalQuality = clamp((affected.overall - 50) / 35, 0.4, 1.5);
      const goalsGain = isKeeper ? 0 : Math.max(0, Math.round(capsGain * position.goals * nationalQuality * finishingFactor * 1.3));
      const assistsGain = isKeeper ? 0 : Math.max(0, Math.round(capsGain * position.assists * nationalQuality * creationFactor * 1.3));
      nationalCaps += capsGain;
      nationalGoals += goalsGain;
      nationalAssists += assistsGain;
      if (nationalTier === "main" && nationalCaps >= 30 && affected.leadership >= 78 && !nationalCaptain && seeded(state.seed, state.season * 139) > 0.7) nationalCaptain = true;

      const seasonYear = affected.season;
      let tournament: { name: string; icon: string; scope: string } | null = null;
      if (nationalTier === "main") {
        if (seasonYear % 4 === 2) tournament = { name: "Copa do Mundo", icon: "MUN", scope: "world" };
        else if (nation.confederation === "EUROPE" && seasonYear % 4 === 0) tournament = { name: "Eurocopa", icon: "EURO", scope: "euro" };
        else if (nation.confederation === "SOUTH_AMERICA" && seasonYear % 4 === 0) tournament = { name: "Copa América", icon: "CA", scope: "copaAmerica" };
        else if (nation.confederation === "NORTH_AMERICA" && seasonYear % 4 === 0) tournament = { name: "Copa Ouro", icon: "GOLD", scope: "goldCup" };
        else if (nation.confederation === "ASIA" && seasonYear % 4 === 0) tournament = { name: "Copa da Ásia", icon: "ASI", scope: "asiaCup" };
        else if (nation.confederation === "AFRICA" && seasonYear % 4 === 0) tournament = { name: "Copa Africana de Nações", icon: "CAN", scope: "afcon" };
        else if (nation.confederation === "OCEANIA" && seasonYear % 4 === 0) tournament = { name: "Copa das Nações da OFC", icon: "OFC", scope: "ofc" };
        else if (seasonYear % 4 === 3) tournament = { name: "Eliminatórias", icon: "ELIM", scope: "qualifiers" };
      } else if (nationalTier === "olympic" && seasonYear % 4 === 0) {
        tournament = { name: "Jogos Olímpicos", icon: "JO", scope: "olympics" };
      } else if (nationalTier === "sub20" && seasonYear % 2 === 0) {
        tournament = { name: "Mundial Sub-20", icon: "S20", scope: "u20" };
      } else if (nationalTier === "sub17" && seasonYear % 2 === 1) {
        tournament = { name: "Mundial Sub-17", icon: "S17", scope: "u17" };
      }

      if (tournament?.scope === "qualifiers") {
        const qualifyChance = clamp(40 + nation.strength * 8 + (effect.nationalTitleBoost ?? 0) * 0.7 + Math.max(0, affected.overall - 78) * 0.4, 38, 95);
        const qualified = seeded(state.seed, state.season * 149) * 100 < qualifyChance;
        qualifiedNextMajor = qualified;
        nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage: qualified ? "Classificado" : "Eliminado", champion: false };
      } else if (tournament) {
        if (tournament.scope === "world" && !affected.qualifiedNextMajor) {
          nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage: "Não classificado", champion: false };
          qualifiedNextMajor = true;
        } else {
          const titleBoostN = effect.nationalTitleBoost ?? 0;
          const baseChance = tournament.scope === "world" ? nation.strength * 3.4 : tournament.scope === "euro" || tournament.scope === "copaAmerica" || tournament.scope === "asiaCup" || tournament.scope === "afcon" ? nation.strength * 4.1 : nation.strength * 3.8;
          const chanceCeiling = tournament.scope === "world" ? 28 : tournament.scope === "euro" || tournament.scope === "copaAmerica" || tournament.scope === "asiaCup" || tournament.scope === "afcon" ? 32 : 34;
          const majorChance = clamp(baseChance + Math.max(0, affected.overall - 78) * 0.7 + titleBoostN * 0.7 + affected.luckyBreaks * 0.35, 2, chanceCeiling);
          const champion = seeded(state.seed, state.season * 151) * 100 < majorChance;
          const knockoutStages = tournament.scope === "world"
            ? ["Fase de grupos", "16 avos", "Oitavas", "Quartas", "Semifinal", "Vice"]
            : ["Fase de grupos", "Oitavas", "Quartas", "Semifinal", "Vice"];
          const stage = champion ? "CAMPEÃO" : knockoutStage(157, false, knockoutStages);
          nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage, champion };
          if (tournament.scope === "world") {
            const fullPlayableRun =
              finalMatchMode === "play-key-matches" &&
              ["16 avos", "Oitavas", "Quartas", "Semifinal", "Vice", "CAMPEÃO"].includes(stage);
            const playableFinalOnly =
              finalMatchMode === "finals-only" &&
              (stage === "Vice" || stage === "CAMPEÃO");
            const simulatedGames = fullPlayableRun ? 3 : playableFinalOnly ? 7 : worldCupGamesThroughStage(stage);
            nationalHistoryAdd.tournamentStats = simulatedWorldCupStats(affected, simulatedGames, 1009);
          }
          if (champion) nationalTrophiesCount += 1;
          if (tournament.scope === "world") qualifiedNextMajor = true;
        }
      }
      if (nationalHistoryAdd) nationalNote = `${nationalHistoryAdd.name}: ${nationalHistoryAdd.stage}`;
    } else if (nationalTier === "main" && affected.season % 4 === 3) {
      const qualifyChance = clamp(40 + nation.strength * 8, 38, 92);
      qualifiedNextMajor = seeded(state.seed, state.season * 149) * 100 < qualifyChance;
      nationalNote = `Fora da lista, você viu ${nation.name} ${qualifiedNextMajor ? "garantir vaga no Mundial" : "cair nas Eliminatórias"}.`;
    } else if (affected.nationalCaps > 0 && nationalTier === "main" && seeded(state.seed, state.season * 163) > 0.7) {
      nationalNote = "Corte doloroso: seu nome ficou de fora da lista da Seleção pela primeira vez em um bom tempo.";
    }
  }
  if (nationalitySwitchRecord) {
    nationalNote = `${nationalitySwitchRecord.stage}. Não há volta.`;
  }
  const nextAgeTier: NationalTier = nextAge <= 14 ? "none" : nextAge <= 17 ? "sub17" : nextAge <= 20 ? "sub20" : nextAge <= 23 ? "olympic" : "main";
  const graduatesWithinYouth =
    (nationalTier === "sub17" && nextAgeTier === "sub20") ||
    (nationalTier === "sub20" && nextAgeTier === "olympic");
  const nextNationalCategory: NationalTier = !nationalCalled
    ? "none"
    : nationalTier === "main" || nationalTier === nextAgeTier
      ? nationalTier
      : graduatesWithinYouth
        ? nextAgeTier
        : "none";
  const calledUp = nationalCalled;

  const awards: string[] = [];
  const awardRoll = seeded(state.seed, state.season * 73);
  const leagueLabel = league.name;
  const leagueGoldenBootLine = 28 + Math.floor(seeded(state.seed, state.season * 227 + 19) * 9);
  const leagueAssistKingLine = 18 + Math.floor(seeded(state.seed, state.season * 229 + 23) * 7);
  const europeanGoldenShoeLine = 28 + Math.floor(seeded(state.seed, state.season * 233 + 29) * 9);
  const continentalGoldenBootLine = 22 + Math.floor(seeded(state.seed, state.season * 239 + 31) * 7);
  const continentalAssistLine = 14 + Math.floor(seeded(state.seed, state.season * 241 + 37) * 6);
  if (affected.age <= 21 && appearances >= 22 && nextOverall >= 74 && awardRoll > 0.38) awards.push(`Revelação do ${leagueLabel}`);
  if (!isKeeper && goals >= leagueGoldenBootLine) awards.push(`Artilheiro do ${leagueLabel}`);
  if (!isKeeper && assists >= leagueAssistKingLine) awards.push("Rei das Assistências");
  if (isKeeper && cleanSheets >= 14) awards.push("Luva de Ouro");
  if (isKeeper && appearances >= 26 && cleanSheets >= 10 && performanceScore >= 72 && awardRoll > 0.28) awards.push(`Melhor Goleiro do ${leagueLabel}`);
  if (isKeeper && appearances >= 30 && cleanSheets >= 16 && goalsConceded <= appearances * 0.82 && performanceScore >= 82) awards.push("Muralha da Temporada");
  if (position.zone === "defesa" && appearances >= 28 && nextOverall >= 80 && leaguePosition <= 6) awards.push("Melhor Defensor");
  if (position.zone === "meio" && appearances >= 26 && goals + assists >= 16 && performanceScore >= 72 && awardRoll > 0.32) awards.push(`Melhor Meio-Campista do ${leagueLabel}`);
  if (position.zone === "ataque" && appearances >= 26 && goals >= 20 && performanceScore >= 74 && awardRoll > 0.3) awards.push(`Melhor Atacante do ${leagueLabel}`);
  if (nextOverall >= 82 && appearances >= 28 && awardRoll > 0.45) awards.push(`Seleção do ${leagueLabel} — ${position.name}`);
  if (nextOverall >= 86 && appearances >= 30 && leaguePosition <= 3 && awardRoll > 0.58) awards.push(`Craque do ${leagueLabel}`);
  if (performanceScore >= 84 && nextOverall >= 84 && appearances >= 28 && awardRoll > 0.36) awards.push(`Jogador do Ano do ${leagueLabel}`);
  if (affected.age <= 23 && playsContinental === "libertadores" && nextOverall >= 82 && seeded(state.seed, state.season * 89) > 0.5) awards.push("Melhor Jovem da América");
  if (playsContinental === "libertadores" && continentalChampion && nextOverall >= 86 && seeded(state.seed, state.season * 97) > 0.38) awards.push("MVP da Libertadores");
  if (playsContinental === "libertadores" && continentalChampion && nextOverall >= 89 && seeded(state.seed, state.season * 101) > 0.7) awards.push("Rei da América");
  if (inEurope && affected.age <= 21 && nextOverall >= 80 && appearances >= 18 && seeded(state.seed, state.season * 167) > 0.55) awards.push("Golden Boy");
  if (inEurope && affected.age <= 21 && playsContinental && nextOverall >= 82 && seeded(state.seed, state.season * 173) > 0.65) awards.push("Troféu Kopa");
  if (inEurope && isKeeper && cleanSheets >= 14 && nextOverall >= 84 && performanceScore >= 80 && seeded(state.seed, state.season * 179) > 0.48) awards.push("Troféu Yashin");
  if (isKeeper && playsContinental && continentalChampion && cleanSheets >= 13 && performanceScore >= 80) awards.push(`Luva de Ouro da ${continentalNames[playsContinental].name}`);
  if (inEurope && !isKeeper && goals >= europeanGoldenShoeLine && league.prestige >= 4) awards.push("Chuteira de Ouro Europeia");
  if (!isKeeper && playsContinental && continentalChampion && goals >= continentalGoldenBootLine) {
    awards.push(`Artilheiro da ${continentalNames[playsContinental].name}`);
  }
  if (!isKeeper && playsContinental && continentalChampion && assists >= continentalAssistLine && performanceScore >= 78) {
    awards.push(`Líder de Assistências da ${continentalNames[playsContinental].name}`);
  }
  const worldCupGoals = nationalHistoryAdd?.name === "Copa do Mundo"
    ? nationalHistoryAdd.tournamentStats?.goals ?? 0
    : 0;
  const worldCupAssists = nationalHistoryAdd?.name === "Copa do Mundo"
    ? nationalHistoryAdd.tournamentStats?.assists ?? 0
    : 0;
  if (!isKeeper && worldCupGoals >= 6) awards.push("Artilheiro da Copa do Mundo");
  if (inEurope && playsContinental === "champions" && continentalChampion && nextOverall >= 88 && seeded(state.seed, state.season * 191) > 0.55) awards.push("Melhor da UEFA");
  if (inEurope && playsContinental === "champions" && continentalChampion && performanceScore >= 84 && seeded(state.seed, state.season * 193) > 0.38) awards.push("MVP da Champions League");
  const hasLeagueGoldenBoot = awards.some((award) => award.includes("Artilheiro"));
  const hasEuropeanGoldenShoe = awards.includes("Chuteira de Ouro Europeia");
  const hasAssistKingAward = awards.some((award) => award.includes("Assistências"));
  const hasGoalsOrAssistsAward = hasLeagueGoldenBoot || hasEuropeanGoldenShoe || hasAssistKingAward;
  const hasGoalkeeperAward = isKeeper && awards.some((award) => award.includes("Goleiro") || award.includes("Luva") || award.includes("Yashin") || award.includes("Muralha"));
  const worldXiMerit =
    inEurope &&
    appearances >= 25 &&
    (
      (isKeeper && nextOverall >= 84 && performanceScore >= 79 && (hasGoalkeeperAward || cleanSheets >= 16)) ||
      (nextOverall >= 87 && performanceScore >= 84) ||
      (hasEuropeanGoldenShoe && nextOverall >= 82 && performanceScore >= 76) ||
      (hasLeagueGoldenBoot && league.prestige >= 3 && nextOverall >= 83 && performanceScore >= 78) ||
      (hasAssistKingAward && league.prestige >= 3 && nextOverall >= 83 && performanceScore >= 80)
    );
  const worldXiChance =
    isKeeper && awards.includes("Troféu Yashin") ? 90 :
    isKeeper && hasGoalkeeperAward ? 72 :
    hasEuropeanGoldenShoe ? 88 :
    hasLeagueGoldenBoot || hasAssistKingAward ? 68 :
    48;
  if (worldXiMerit && seeded(state.seed, state.season * 197 + 13) * 100 < worldXiChance) awards.push("FIFPRO World XI");
  if (!isKeeper && goals >= 8 && nextOverall >= 82 && seeded(state.seed, state.season * 103) > 0.94) awards.push("Prêmio Puskás");
  if (affected.leadership >= 82 && seeded(state.seed, state.season * 107) > 0.82) awards.push("Prêmio Fair Play");
  if (affected.fanSupport >= 92 && titleCount > 0 && !(affected.awardCabinet["Ídolo da Torcida"] > 0)) awards.push("Ídolo da Torcida");
  const majorNationalTitle = Boolean(
    nationalHistoryAdd?.champion &&
    ["Copa do Mundo", "Eurocopa", "Copa América", "Copa Ouro", "Copa da Ásia", "Copa Africana de Nações", "Copa das Nações da OFC"].includes(nationalHistoryAdd.name),
  );
  if (majorNationalTitle && nextOverall >= 86 && performanceScore >= 80) awards.push(`Craque da ${nationalHistoryAdd?.name}`);
  const europeanBallonEligible =
    inEurope &&
    (
      (
        nextOverall >= 74 &&
        performanceScore >= 58 &&
        affected.reputation >= 25 &&
        appearances >= 18
      ) ||
      (
        nextOverall === 82 &&
        performanceScore >= 80 &&
        affected.reputation >= 65 &&
        appearances >= 24 &&
        titleCount > 0
      )
    );
  const americanBallonEligible =
    !inEurope &&
    nextOverall >= 86 &&
    performanceScore >= 82 &&
    affected.reputation >= 70 &&
    (mundialChampion || continentalChampion);
  const positionBallonModifier = isKeeper ? -7 : position.zone === "defesa" ? -4 : position.zone === "ataque" ? 3 : 0;
  const previousBallonDor = affected.awardCabinet["Bola de Ouro"] ?? 0;
  const ballonProduction =
    isKeeper
      ? cleanSheets * 1.8 - goalsConceded * 0.08
      : position.zone === "defesa"
        ? goals * 1.45 + assists * 1.2
        : position.zone === "meio"
          ? goals * 0.72 + assists
          : goals + assists * 0.65;
  const eliteProductionTarget = isKeeper ? 22 : position.zone === "defesa" ? 18 : position.zone === "meio" ? 34 : 40;
  const productionBallonModifier = clamp((ballonProduction - eliteProductionTarget) / 1.5, -12, 18);
  const supportingAwardBonus = Math.min(10, awards.reduce((bonus, award) => (
    bonus +
    (
      award === "FIFPRO World XI" ||
      award === "Melhor da UEFA" ||
      award.includes("MVP") ||
      award.includes("Jogador do Ano")
        ? 2.5
        : award.includes("Craque") ||
            award.includes("Chuteira") ||
            award.includes("Artilheiro") ||
            award === "Rei da América"
          ? 1.4
          : 0
    )
  ), 0));
  const ballonScore =
    performanceScore * 0.33 +
    nextOverall * 0.35 +
    affected.reputation * 0.17 +
    titleCount * 2.5 +
    (playsContinental === "champions" && continentalChampion ? 9 : 0) +
    (mundialChampion ? 12 : 0) +
    (majorNationalTitle ? 8 : 0) +
    (inEurope && worldCupGoals >= 8 ? 24 + Math.min(10, (worldCupGoals - 8) * 2 + worldCupAssists * 0.7) : 0) +
    productionBallonModifier +
    supportingAwardBonus +
    positionBallonModifier;
  const firstBallonChance = clamp(88 + Math.max(0, ballonScore - 58) * 3.2, 88, 98);
  const repeatBallonBaseChance = clamp(16 + Math.max(0, ballonScore - 66) * 4.4, 16, 97);
  const repeatBallonMultiplier =
    previousBallonDor === 0 ? 1 :
    previousBallonDor === 1 ? 0.78 :
    previousBallonDor === 2 ? 0.58 :
    previousBallonDor === 3 ? 0.25 :
    previousBallonDor === 4 ? 0.08 :
    previousBallonDor === 5 ? 0.03 :
    previousBallonDor === 6 ? 0.012 :
    Math.max(0.0004, 0.006 * 0.55 ** (previousBallonDor - 7));
  const rawBallonChance = (previousBallonDor === 0 ? firstBallonChance : repeatBallonBaseChance) * repeatBallonMultiplier;
  const baseBallonChance = previousBallonDor === 0
    ? clamp(Math.round(rawBallonChance), 88, 98)
    : Math.max(0.03, Number(rawBallonChance.toFixed(3)));
  const historicBallonSeason =
    (
      position.zone === "ataque" &&
      (goals >= 50 || goals + assists >= 68)
    ) ||
    (
      position.zone === "meio" &&
      goals + assists >= 55
    ) ||
    (
      position.zone === "defesa" &&
      goals + assists >= 30 &&
      performanceScore >= 94
    ) ||
    (
      isKeeper &&
      cleanSheets >= 25 &&
      performanceScore >= 94
    );
  const historicBallonChanceFloor = !historicBallonSeason
    ? 0
    : previousBallonDor <= 6
      ? 98
      : Math.max(0.25, 28 * 0.52 ** (previousBallonDor - 7));
  const worldCupBallonChanceFloor = !(inEurope && worldCupGoals >= 8)
    ? 0
    : previousBallonDor === 0 ? 94
    : previousBallonDor === 1 ? 82
    : previousBallonDor === 2 ? 64
    : previousBallonDor === 3 ? 38
    : previousBallonDor === 4 ? 16
    : Math.max(0.25, 8 * 0.5 ** (previousBallonDor - 5));
  const ballonChance = Math.max(baseBallonChance, historicBallonChanceFloor, worldCupBallonChanceFloor);
  const wonBallonDor =
    (europeanBallonEligible || americanBallonEligible) &&
    hasGoalsOrAssistsAward &&
    (majorClubTitleCount > 0 || majorNationalTitle) &&
    ballonScore >= 58 &&
    seeded(state.seed, state.season * 109) * 100 < ballonChance;
  if (wonBallonDor) {
    if (!awards.includes("FIFPRO World XI")) awards.push("FIFPRO World XI");
    awards.push("Bola de Ouro");
  }
  const awardNominations: AwardNomination[] = awards
    .filter((award) => awardPresentation(award).tier !== "regular")
    .map((award) => ({
      award,
      won: true,
      winner: affected.name || "Você",
      finalists: awardFinalists(affected.name || "Você", award, state.seed, affected.season, affected.rivals),
    }));
  const addLostNomination = (award: string, eligible: boolean, chance: number, salt: number) => {
    if (!eligible || awards.includes(award) || awardNominations.some((nomination) => nomination.award === award)) return;
    if (seeded(state.seed, state.season * salt + award.length * 7) * 100 >= chance) return;
    awardNominations.push({
      award,
      won: false,
      winner: fictionalAwardWinner(affected.name || "Você", award, state.seed, affected.season, affected.rivals),
      finalists: awardFinalists(affected.name || "Você", award, state.seed, affected.season, affected.rivals),
    });
  };
  addLostNomination(
    "Bola de Ouro",
    hasGoalsOrAssistsAward &&
      (majorClubTitleCount > 0 || majorNationalTitle) &&
      (
        (inEurope && nextOverall >= 81 && performanceScore >= 68 && affected.reputation >= 48 && appearances >= 20) ||
        (!inEurope && nextOverall >= 85 && performanceScore >= 76 && affected.reputation >= 60 && Boolean(continentalChampion || mundialChampion))
      ),
    historicBallonSeason ? 100 : clamp(24 + Math.max(0, ballonScore - 66) * 4.2, 24, 88),
    313,
  );
  addLostNomination(
    `Jogador do Ano do ${leagueLabel}`,
    nextOverall >= 78 && performanceScore >= 70 && appearances >= 23,
    clamp(34 + (performanceScore - 70) * 2, 34, 76),
    317,
  );
  addLostNomination(
    "Golden Boy",
    inEurope && affected.age <= 21 && nextOverall >= 76 && appearances >= 16,
    clamp(28 + (nextOverall - 76) * 4, 28, 72),
    331,
  );
  addLostNomination(
    "Troféu Yashin",
    inEurope && isKeeper && keeperSkill >= 79 && cleanSheets >= 11,
    clamp(30 + (keeperSkill - 79) * 3, 30, 75),
    337,
  );
  awardNominations.sort((a, b) => awardTierWeight(b.award) - awardTierWeight(a.award) || Number(b.won) - Number(a.won));
  if (awardNominations.length > 3) awardNominations.splice(3);
  const title = titleCount > 0;
  const seasonObjective = affected.currentObjective ?? createSeasonObjective(position, seasonRole, affected.season, affected.seed);
  const objectiveResult = evaluateObjective(seasonObjective, seasonStats, titleCount);
  const trustDelta =
    (objectiveResult.completed ? seasonObjective.reward : -seasonObjective.penalty) +
    (appearances >= 28 ? 4 : appearances < 12 ? -5 : 0) +
    titleCount * 3 +
    (hasTrait("leader") ? 3 : 0) +
    breakoutBonus * 2 -
    redCards * 5;
  const nextTrust = clamp(affected.managerTrust + trustDelta);
  const nextDiscipline = clamp(affected.discipline + (yellowCards <= 4 ? 2 : -2) - redCards * 8);
  const nextRole = calculateSquadRole(nextOverall, club, league.prestige, nextTrust, nextAge);

  // Não-renovação: um clube pode recusar renovar um contrato expirado após uma temporada ruim.
  const contractExpiring = affected.contractYears - 1 <= 0;
  const nonRenewalRiskFactors = [
    performanceScore < 42 || !objectiveResult.completed,
    nextRole === "reserva" || nextRole === "promessa",
    nextTrust < 42,
    appearances < 12,
  ].filter(Boolean).length;
  const nonRenewalChance = contractExpiring && nonRenewalRiskFactors >= 2
    ? nonRenewalRiskFactors >= 3
      ? 100
      : clamp(62 - Math.max(0, affected.reputation - 45) * 0.25, 48, 72)
    : 0;
  const renewalDenied = nonRenewalChance > 0 && seeded(state.seed, state.season * 283 + 11) * 100 < nonRenewalChance;
  const clubLevelFloor = clamp(club.strength - 12, 55, 82);
  const clearlyBelowClubLevel =
    nextOverall <= clubLevelFloor - 6 &&
    (performanceScore < 56 || appearances < 20 || nextRole === "reserva");
  const eliteMismatch = club.reputation >= 5 && nextOverall < 73 && performanceScore < 62;
  const forcedClubExit = !isIdolAtClub(affected, club.id) && (clearlyBelowClubLevel || eliteMismatch);

  const pendingBotaoMatches: PendingBotaoMatch[] = [];
  if (finalMatchMode !== "simulate") {
    const competitionPriority: Record<string, number> = {
      mundial: 100,
      championsLeague: 95,
      libertadores: 94,
      sudamericana: 86,
      concacafChampions: 90,
      afcChampions: 90,
      cafChampions: 90,
      europaLeague: 85,
      conferenceLeague: 80,
      domesticCup: 70,
      uefaSuperCup: 60,
      recopaSudamericana: 60,
      domesticSuperCup: 55,
      campeonesCup: 55,
    };
    const worldCompetition = competitions.find((competition) => competition.id === "mundial");
    if (playsWorld && worldCompetition) {
      const confederation = clubConfederation(club);
      const worldStages = confederation === "EUROPE"
        ? ["Final"]
        : confederation === "SOUTH_AMERICA"
          ? ["Semifinal", "Final"]
          : confederation === "OCEANIA"
            ? ["Playoff Mundial", "Quartas de final", "Semifinal", "Final"]
            : ["Quartas de final", "Semifinal", "Final"];
      const stageName = worldStages[0];
      const opponent = pickClubWorldOpponent({
        clubId: club.id,
        seed: affected.seed,
        season: affected.season,
        stageName,
      });
      pendingBotaoMatches.push({
        id: `club-mundial-${stageName}-${affected.season}`,
        source: "club",
        competitionId: "mundial",
        competitionName: worldCompetition.name,
        stageName,
        opponentId: opponent.id,
        season: affected.season,
        rngChampion: worldCompetition.champion,
        originalStage: worldCompetition.stage,
        previousOpponentIds: [],
        worldCampaign: true,
      });
    }
    competitions
      .filter((competition) =>
        competition.id !== "mundial" &&
        competition.id !== "domesticLeague" &&
        (competition.champion || competition.stage === "Vice"),
      )
      .sort((a, b) => (competitionPriority[b.id] ?? 0) - (competitionPriority[a.id] ?? 0))
      .forEach((competition) => {
        const scope = competition.id === "mundial"
          ? "world"
          : ["domesticCup", "domesticSuperCup"].includes(competition.id)
            ? "domestic"
            : "continental";
        const opponent = pickFinalOpponent({
          clubId: club.id,
          leagueId: league.id,
          scope,
          seed: affected.seed,
          season: affected.season,
          competitionId: competition.id,
        });
        pendingBotaoMatches.push({
          id: `club-${competition.id}-${affected.season}`,
          source: "club",
          competitionId: competition.id,
          competitionName: competition.name,
          stageName: "Final",
          opponentId: opponent.id,
          season: affected.season,
          rngChampion: competition.champion,
          originalStage: competition.stage,
        });
      });

    if (nationalHistoryAdd) {
      const worldKnockoutStages = ["16 avos", "Oitavas", "Quartas", "Semifinal", "Vice", "CAMPEÃO"];
      const shouldPlayWorldKnockout =
        finalMatchMode === "play-key-matches" &&
        nationalHistoryAdd.name === "Copa do Mundo" &&
        worldKnockoutStages.includes(nationalHistoryAdd.stage);
      const shouldPlayNationalFinal =
        !shouldPlayWorldKnockout &&
        (nationalHistoryAdd.champion || nationalHistoryAdd.stage === "Vice");
      const stageName = shouldPlayWorldKnockout ? "16 avos de final" : shouldPlayNationalFinal ? "Final" : "";
      if (stageName) {
        const competitionId = nationalHistoryAdd.name === "Copa do Mundo"
          ? "world-cup"
          : `national-${nationalHistoryAdd.name.toLocaleLowerCase("pt-BR").replace(/\W+/g, "-")}`;
        const opponent = pickNationalOpponent({
          countryId: affected.nationality,
          seed: affected.seed,
          season: affected.season,
          competitionId,
          stageName,
        });
        pendingBotaoMatches.unshift({
          id: `national-${competitionId}-${stageName}-${affected.season}`,
          source: "national",
          competitionId,
          competitionName: nationalHistoryAdd.name,
          stageName,
          opponentId: opponent.id,
          season: affected.season,
          rngChampion: nationalHistoryAdd.champion,
          originalStage: nationalHistoryAdd.stage,
          nationalTier: nationalHistoryAdd.tier,
          previousOpponentIds: [],
        });
      }
    }
  }

  const currentMarketValue = marketValue(nextOverall, nextAge, { ...club, leagueId: league.id }, affected.reputation, seasonStats);
  const record: SeasonRecord = {
    ...seasonStats,
    age: affected.age,
    season: affected.season,
    clubId: club.id,
    leagueId: league.id,
    position: affected.position,
    overall: nextOverall,
    title,
    eventTitle: event.title,
    competitions,
    awards,
    awardNominations,
    squadRole: seasonRole,
    objectiveResult,
    performanceScore,
    marketValue: currentMarketValue,
    development,
    botaoResults: [],
    promotion,
    averageRating,
    manOfTheMatchAwards,
    medicalRecord,
  };
  const result: SeasonResult = {
    ...record,
    resultText,
    development,
    performanceScore,
    europeanSpotlight,
    europeanDevelopmentBonus,
    breakoutBonus,
    marketValue: currentMarketValue,
    calledUp,
    twist,
    nationalNote,
  };
  const pendingStoryDecision = buildStorySeasonDecision(affected, {
    performanceScore,
    titleCount,
    club,
  });
  const seenEvents = event.oneTime || event.id === FIRST_MATCH_EVENT.id ? Array.from(new Set([...affected.seenEvents, event.id])) : affected.seenEvents;
  const nextCabinet = { ...affected.trophyCabinet };
  competitions.forEach((competition) => { if (competition.champion) nextCabinet[competition.id] += 1; });
  const wonContinentalForWorld = continentalChampion && (playsContinental === "libertadores" || playsContinental === "champions" || playsContinental === "concacaf" || playsContinental === "asian" || playsContinental === "african");
  const nextWorldQualifiedSeason = wonContinentalForWorld ? affected.season + 1 : affected.worldQualifiedSeason === affected.season ? 0 : affected.worldQualifiedSeason;
  const nextWorldQualifiedClubId = wonContinentalForWorld ? club.id : affected.worldQualifiedSeason === affected.season ? "" : affected.worldQualifiedClubId;
  const nextAwardCabinet = { ...affected.awardCabinet };
  awards.forEach((award) => { nextAwardCabinet[award] = (nextAwardCabinet[award] ?? 0) + 1; });
  const qualifiedBySudamericana = continentalChampion && playsContinental === "sudamericana";
  const nextContinentalSlot = qualifiedBySudamericana
    ? "libertadores"
    : continentalSlotAfterSeason(club, league, leagueChampion, cupChampion, leaguePosition);
  const fitnessTarget =
    91 -
    Math.max(0, appearances - 30) * 0.55 -
    Math.max(0, nextAge - 30) * 0.7 +
    (objectiveResult.completed ? 2 : -1) +
    (seeded(state.seed, state.season * 307) * 8 - 4);
  const nextFitness = clamp(
    Math.round(affected.fitness * 0.42 + fitnessTarget * 0.58 + twistFitness),
    32,
    98,
  );
  const moraleTarget =
    64 +
    performanceScore * 0.16 +
    titleCount * 4 +
    (objectiveResult.completed ? 5 : -7) +
    (seeded(state.seed, state.season * 311) * 12 - 6);
  const nextMorale = clamp(
    Math.round(affected.morale * 0.48 + moraleTarget * 0.52 + twistMorale),
    24,
    98,
  );
  const overallVisibility = Math.pow(clamp((nextOverall - 50) / 36, 0.08, 1.22), 1.7);
  const followerSoftCeiling = Math.round(30_000 * Math.pow(1.32, clamp(nextOverall - 55, 0, 40)));
  const audienceSaturation = affected.followers <= followerSoftCeiling
    ? 1
    : clamp((followerSoftCeiling / Math.max(1, affected.followers)) * 0.72, 0.1, 1);
  const organicFollowerGain = Math.max(250, Math.round(
    (
      1_200 +
      performanceScore * performanceScore * 34 +
      titleCount * 85_000 +
      awards.length * 48_000 +
      europeanSpotlight * 14_000 +
      (calledUp ? 26_000 : 0)
    ) *
    overallVisibility *
    audienceSaturation *
    (0.62 + affected.reputation / 125) *
    (affected.socialSentiment < 35 ? 0.55 : affected.socialSentiment > 75 ? 1.18 : 1),
  ));
  const nextFollowers = affected.followers + organicFollowerGain;
  const nextSocialSentiment = clamp(Math.round(affected.socialSentiment * 0.72 + (52 + performanceScore * 0.28 + titleCount * 4) * 0.28), 12, 98);
  record.followers = nextFollowers;
  record.socialSentiment = nextSocialSentiment;
  const followerMilestones = [
    { threshold: 10_000, label: "10 mil seguidores" },
    { threshold: 100_000, label: "100 mil seguidores" },
    { threshold: 1_000_000, label: "1 milhão de seguidores" },
    { threshold: 10_000_000, label: "10 milhões de seguidores" },
    { threshold: 50_000_000, label: "50 milhões de seguidores" },
  ];
  const newOffFieldMilestones = followerMilestones
    .filter((milestone) => affected.followers < milestone.threshold && nextFollowers >= milestone.threshold)
    .map((milestone) => `${affected.season}: ${milestone.label}`);
  const sponsorIncome = affected.activeSponsor?.annualValue ?? 0;
  const seasonLivingCost = Math.round((120_000 + affected.age * 3_500 + (awayFromAcademyHome ? 85_000 : 35_000) + Math.max(0, affected.reputation - 35) * 5_500) / 10_000) * 10_000;
  const seasonNetIncome = Math.max(0, affected.annualSalary + sponsorIncome - seasonLivingCost);
  const seasonSpendableGain = Math.round(seasonNetIncome * 0.18 / 10_000) * 10_000;
  result.salaryIncome = affected.annualSalary;
  result.sponsorIncome = sponsorIncome;
  result.livingCost = seasonLivingCost;
  result.balanceBefore = affected.money;
  result.balanceAfter = Math.max(0, affected.money + affected.annualSalary + sponsorIncome - seasonLivingCost);
  result.spendableIncome = seasonSpendableGain;
  result.spendableAfter = Math.min(
    result.balanceAfter,
    affected.spendableMoney + seasonSpendableGain,
  );
  const sponsorExpired = Boolean(affected.activeSponsor && affected.season + 1 >= affected.activeSponsor.endSeason);
  const completedSponsor = sponsorExpired && affected.activeSponsor
    ? { ...affected.activeSponsor, status: "completed" as const }
    : null;
  const socialTone: SocialPost["tone"] = (effect.socialSentiment ?? 0) < -3
    ? "negative"
    : performanceScore >= 72 || (effect.socialSentiment ?? 0) > 3
      ? "positive"
      : "neutral";
  const socialSource: SocialPost["source"] = event.id === DYNAMIC_SPONSOR_EVENT_ID || event.id === DYNAMIC_SPONSOR_DUTY_EVENT_ID
    ? "sponsor"
    : event.id === DYNAMIC_SOCIAL_EVENT_ID || event.id === DYNAMIC_LIFE_EVENT_ID
      ? "player"
      : "press";
  const socialAuthor = socialSource === "sponsor"
    ? effect.sponsorBrand ?? affected.activeSponsor?.brand ?? "Parceiro comercial"
    : socialSource === "player"
      ? `@${(affected.name || "jogador").toLocaleLowerCase("pt-BR").replace(/\s+/g, "")}`
      : "Central do Futebol";
  const seasonSocialPost: SocialPost = {
    id: `${affected.seed}-${affected.season}-${event.id}`,
    season: affected.season,
    source: socialSource,
    author: socialAuthor,
    text: socialSource === "press"
      ? `${affected.name} fecha ${affected.season} com ${appearances} jogos, ${goals} gols, ${assists} assistências${titleCount ? ` e ${titleCount} título(s)` : ""}.`
      : resultText,
    likes: Math.max(120, Math.round(nextFollowers * (0.018 + seeded(affected.seed, affected.season * 1423) * 0.065))),
    tone: socialTone,
  };
  const milestonePosts: SocialPost[] = newOffFieldMilestones.map((milestone, index) => ({
    id: `${affected.seed}-${affected.season}-milestone-${index}`,
    season: affected.season,
    source: "fans",
    author: "Arquibancada",
    text: `${affected.name} alcançou ${milestone.split(": ")[1]}. A carreira também cresce fora das quatro linhas.`,
    likes: Math.max(1_000, Math.round(nextFollowers * 0.09)),
    tone: "positive",
  }));
  const nextBase: GameState = {
    ...affected,
    phase: "consequence",
    age: nextAge,
    season: affected.season + 1,
    overall: nextOverall,
    attributes: nextAttributes,
    fitness: nextFitness,
    morale: nextMorale,
    reputation: clamp(affected.reputation + Math.round(appearances / 12) + titleCount * 7 + europeanSpotlight + breakoutBonus * 2),
    fanSupport: clamp(affected.fanSupport + titleCount * 13 + Math.round(appearances / 14) + breakoutBonus * 2),
    managerTrust: nextTrust,
    discipline: nextDiscipline,
    suspensionMatches: redCards * 2 + (yellowCards >= 8 ? 2 : yellowCards >= 5 ? 1 : 0),
    squadRole: nextRole,
    contractYears: Math.max(0, affected.contractYears - 1),
    money: Math.max(0, affected.money + affected.annualSalary + sponsorIncome - seasonLivingCost),
    spendableMoney: Math.min(
      Math.max(0, affected.money + affected.annualSalary + sponsorIncome - seasonLivingCost),
      affected.spendableMoney + seasonSpendableGain,
    ),
    currentObjective: createSeasonObjective(position, nextRole, affected.season + 1, affected.seed + affected.history.length * 31),
    objectivesCompleted: affected.objectivesCompleted + (objectiveResult.completed ? 1 : 0),
    objectivesFailed: affected.objectivesFailed + (objectiveResult.completed ? 0 : 1),
    nationalLevel: clamp(nationalCalled ? Math.max(affected.nationalLevel + 4, 18) : affected.nationalLevel - 2),
    stats: addStats(affected.stats, seasonStats),
    trophies: affected.trophies + titleCount,
    trophyCabinet: nextCabinet,
    awards: affected.awards + awards.length,
    awardCabinet: nextAwardCabinet,
    setbacks: affected.setbacks + setbackDelta,
    luckyBreaks: affected.luckyBreaks + luckyDelta,
    continentalSlot: nextContinentalSlot,
    currentLeagueId: promotedLeagueId || league.id,
    worldQualifiedSeason: nextWorldQualifiedSeason,
    worldQualifiedClubId: nextWorldQualifiedClubId,
    adaptation: awayFromAcademyHome ? clamp(affected.adaptation + 10, 0, 100) : 100,
    abroadSeasons: awayFromAcademyHome ? affected.abroadSeasons + 1 : 0,
    nationalCategory: nextNationalCategory,
    nationalCaps,
    nationalGoals,
    nationalAssists,
    nationalCaptain,
    nationalTrophies: nationalTrophiesCount,
    nationalHistory: [
      ...affected.nationalHistory,
      ...(nationalitySwitchRecord ? [nationalitySwitchRecord] : []),
      ...(nationalHistoryAdd ? [nationalHistoryAdd] : []),
    ],
    qualifiedNextMajor,
    history: [...affected.history, record],
    lastResult: result,
    lastConsequence: { choice: choiceLabel, headline: luckOutcome === "success" ? "A aposta deu certo" : luckOutcome === "failure" ? "A aposta deu errado" : "Sua decisão teve peso", resultText, changes: describeEffects(effect), luckOutcome },
    pendingBotaoMatches,
    lastBotaoResult: null,
    pendingStoryDecision,
    retireAfterSeason: Boolean(effect.retire || nextAge >= 40),
    seenEvents,
    nextEventId: "",
    renewalDenied,
    forcedClubExit,
    isFreeAgent: renewalDenied,
    freeAgentSinceSeason: renewalDenied ? affected.season + 1 : affected.freeAgentSinceSeason,
    forcedAlternativeTransfer: Boolean(effect.forcedAlternativeTransfer),
    transferRequested: effect.forcedAlternativeTransfer || forcedClubExit ? true : affected.transferRequested,
    pendingTransferMode: effect.loan ? "loan" : "permanent",
    rivals: evolveRivals(affected.rivals, affected.seed, affected.season).map((rival) =>
      event.id === DYNAMIC_RIVAL_EVENT_ID &&
      rival.id === pick(affected.rivals.filter((item) => item.active), affected.seed, affected.season * 809)?.id
        ? { ...rival, relationship: clamp(rival.relationship + (effect.rivalRespect ?? 0)) }
        : rival,
    ),
    followers: nextFollowers,
    socialSentiment: nextSocialSentiment,
    mediaRelation: clamp(Math.round(affected.mediaRelation * 0.86 + (58 + (objectiveResult.completed ? 4 : -3)) * 0.14), 15, 97),
    lifeBalance: clamp(Math.round(affected.lifeBalance * 0.68 + (74 - Math.max(0, appearances - 28) * 0.7) * 0.32), 18, 98),
    activeSponsor: sponsorExpired ? null : affected.activeSponsor,
    sponsorHistory: completedSponsor ? [completedSponsor, ...affected.sponsorHistory] : affected.sponsorHistory,
    socialFeed: [...milestonePosts, seasonSocialPost, ...affected.socialFeed].slice(0, 24),
    offFieldMilestones: [...affected.offFieldMilestones, ...newOffFieldMilestones],
    nationalitySwitched: affected.nationalitySwitched || Boolean(nationalitySwitchRecord),
    pendingNationalitySwitchTarget: "",
    corruptionGuaranteedSeason: 0,
    medicalHistory: medicalRecord ? [medicalRecord, ...affected.medicalHistory] : affected.medicalHistory,
    injuryFreeSeasons: medicalRecord ? 0 : affected.injuryFreeSeasons + 1,
    matchesMissedInjuries: affected.matchesMissedInjuries + (medicalRecord?.matchesMissed ?? 0),
  };
  const wantsDomesticReturn = event.id === "european-exit" || event.id === "return-home" || event.id === "mega-empresta-para-time-menor";
  const domesticReturnCountryId = event.id === "european-exit" || event.id === "return-home"
    ? nextBase.academyCountryId
    : club.countryId;
  let transferOffers = effect.transfer || effect.forcedAlternativeTransfer || forcedClubExit || nextBase.contractYears === 0
    ? effect.forcedAlternativeTransfer
      ? selectAlternativeExileOffers(nextBase, affected.season * 43)
      : selectTransferOffers(nextBase, affected.season * 43, {
          includeForeign: !wantsDomesticReturn,
          forceDomestic: wantsDomesticReturn,
          forceForeign: effect.transferAbroad,
          domesticCountryId: domesticReturnCountryId,
          sourceLeagueId: league.id,
        })
    : [];
  if (effect.transfer && event.id === "return-home" && nextBase.academyClubId) {
    const europeanDoor = transferOffers.find((clubId) => isEuropeanClub(clubById(clubId)));
    const homecomingOffers = [
      nextBase.academyClubId,
      ...transferOffers.filter((clubId) => clubId !== nextBase.academyClubId && clubId !== europeanDoor),
    ];
    transferOffers = europeanDoor
      ? [...homecomingOffers.slice(0, 4), europeanDoor]
      : homecomingOffers.slice(0, 5);
  }
  if (effect.transfer && event.id === "rival-offer") {
    const rivalIds = RIVALRIES
      .filter((rivalry) => rivalry.clubIds.includes(club.id))
      .map((rivalry) => rivalry.clubIds.find((clubId) => clubId !== club.id))
      .filter((clubId): clubId is string => Boolean(clubId));
    const rivalOffer = pick(rivalIds, nextBase.seed, affected.season);
    if (rivalOffer) transferOffers = [rivalOffer, ...transferOffers.filter((clubId) => clubId !== rivalOffer)].slice(0, Math.max(5, transferOffers.length));
  }
  const transferMarketOffers = materializeTransferOffers(nextBase, transferOffers, affected.season * 43, {
    includeForeign: !wantsDomesticReturn,
    forceDomestic: wantsDomesticReturn,
    forceForeign: effect.transferAbroad,
    domesticCountryId: domesticReturnCountryId,
    sourceLeagueId: league.id,
    mode: effect.loan ? "loan" : renewalDenied ? "free-agent" : "permanent",
    trigger: forcedClubExit ? "forced-exit" : renewalDenied ? "contract-expired" : "season-end",
  });
  const legacyPoints = calculateLegacyScore({
    appearances: nextBase.stats.appearances,
    goals: nextBase.stats.goals,
    assists: nextBase.stats.assists,
    cleanSheets: nextBase.stats.cleanSheets,
    trophies: nextBase.trophies,
    nationalTrophies: nextBase.nationalTrophies,
    awards: nextBase.awards,
    ballonDor: nextBase.awardCabinet["Bola de Ouro"] ?? 0,
    nationalCaps: nextBase.nationalCaps,
    peakOverall: Math.max(nextBase.overall, ...nextBase.history.map((item) => item.overall)),
    setbacks: nextBase.setbacks,
  }) + Math.round(Math.log10(Math.max(1, nextBase.followers)) * 4 + nextBase.charityReputation * 0.22);
  const achievementCandidates = getUnlockedAchievements({
    appearances: nextBase.stats.appearances,
    goals: nextBase.stats.goals,
    assists: nextBase.stats.assists,
    cleanSheets: nextBase.stats.cleanSheets,
    trophies: nextBase.trophies + nextBase.nationalTrophies,
    continentalTitles:
      nextBase.trophyCabinet.libertadores +
      nextBase.trophyCabinet.recopaSudamericana +
      nextBase.trophyCabinet.championsLeague +
      nextBase.trophyCabinet.uefaSuperCup +
      nextBase.trophyCabinet.europaLeague +
      nextBase.trophyCabinet.conferenceLeague +
      nextBase.trophyCabinet.concacafChampions +
      nextBase.trophyCabinet.afcChampions +
      nextBase.trophyCabinet.cafChampions +
      nextBase.trophyCabinet.campeonesCup,
    worldTitles: nextBase.trophyCabinet.mundial,
    nationalCaps: nextBase.nationalCaps,
    nationalTrophies: nextBase.nationalTrophies,
    ballonDor: nextBase.awardCabinet["Bola de Ouro"] ?? 0,
    clubsPlayed: new Set(nextBase.history.map((item) => item.clubId)).size,
    seasonsAbroad: nextBase.history.filter((item) => isOutsideCountry(clubById(item.clubId), nextBase.academyCountryId)).length,
    seasons: nextBase.history.length,
    age: nextBase.age,
    wasCaptain: nextBase.clubCaptain,
    nationalCaptain: nextBase.nationalCaptain,
    yellowCards: nextBase.stats.yellowCards,
    redCards: nextBase.stats.redCards,
    retired: nextBase.retireAfterSeason,
  }, nextBase.unlockedAchievements);
  const newlyUnlocked = achievementCandidates.filter((achievement) =>
    nextBase.disciplineHistoryReliable || (achievement.id !== "ficha-limpa" && achievement.id !== "disciplinado-em-campo"),
  );
  const newsCategory = breakoutBonus > 0
    ? "milestone"
    : titleCount > 0
    ? "title"
    : luckyDelta > 0
      ? "milestone"
      : nationalCalled && nationalNote
        ? "national"
        : twist || nationalNote
          ? "setback"
          : "season";
  const newsPool = NEWS_TEMPLATES.filter((item) => item.category === newsCategory);
  const newsTemplate = pick(newsPool, nextBase.seed, nextBase.season * 229)?.template ?? "{player} fecha mais uma temporada pelo {club}";
  const seasonHeadline = fillNewsTemplate(newsTemplate, {
    player: nextBase.name,
    club: club.shortName,
    season: String(affected.season),
    rival: "o maior rival",
    competition: competitions.find((item) => item.champion)?.name ?? league.name,
  });
  const achievementNews = newlyUnlocked.map((achievement) => `Conquista desbloqueada: ${achievement.title}.`);
  const offFieldNews = [
    ...(effect.sponsorBrand ? [`${affected.season}: ${affected.name} assina contrato pessoal com ${effect.sponsorBrand}.`] : []),
    ...(completedSponsor ? [`${affected.season}: parceria com ${completedSponsor.brand} chega ao fim após ${completedSponsor.endSeason - completedSponsor.startSeason} temporada(s).`] : []),
    ...newOffFieldMilestones,
  ];
  const nationalitySwitchTarget = maybeOfferNationalitySwitch(nextBase, affected.season * 71);
  const worldPlayers = advanceWorldPlayerUniverse(nextBase.worldPlayers, {
    season: nextBase.season,
    rivals: nextBase.rivals,
    awardNominations: result.awardNominations,
    protagonistName: nextBase.name,
  });
  return {
    ...nextBase,
    nextEventId: nationalitySwitchTarget ? NATIONALITY_SWITCH_EVENT_ID : selectNextEvent(nextBase, affected.season * 37),
    pendingNationalitySwitchTarget: nationalitySwitchTarget ?? "",
    nationalitySwitchInviteUsed: nextBase.nationalitySwitchInviteUsed || Boolean(nationalitySwitchTarget),
    transferOffers,
    transferMarketOffers,
    worldPlayers,
    legacyPoints,
    unlockedAchievements: [...nextBase.unlockedAchievements, ...newlyUnlocked.map((achievement) => achievement.id)],
    newsFeed: [...achievementNews, ...offFieldNews, seasonHeadline, ...nextBase.newsFeed].slice(0, 16),
  };
}

export function eventForState(state: GameState) {
  if (state.currentEventId === FIRST_MATCH_EVENT.id) return FIRST_MATCH_EVENT;
  if (state.currentEventId === DYNAMIC_SPONSOR_EVENT_ID) return buildSponsorEvent(state);
  if (state.currentEventId === DYNAMIC_SPONSOR_DUTY_EVENT_ID) return buildSponsorDutyEvent(state);
  if (state.currentEventId === DYNAMIC_SOCIAL_EVENT_ID) return buildSocialEvent(state);
  if (state.currentEventId === DYNAMIC_LIFE_EVENT_ID) return buildLifeEvent(state);
  if (state.currentEventId === DYNAMIC_STORY_EVENT_ID) return buildStoryCareerEvent(state);
  if (state.currentEventId === DYNAMIC_RIVAL_EVENT_ID && state.rivals.some((rival) => rival.active)) {
    return buildRivalEvent(state);
  }
  if (state.currentEventId === NATIONALITY_SWITCH_EVENT_ID && state.pendingNationalitySwitchTarget) {
    return buildNationalitySwitchEvent(countryById(state.nationality), countryById(state.pendingNationalitySwitchTarget));
  }
  return ALL_PRO_EVENTS.find((event) => event.id === state.currentEventId) ?? ALL_PRO_EVENTS[0];
}

export function signProfessionalForSimulation(state: GameState, clubId: string): GameState {
  const club = clubById(clubId);
  const league = leagueById(club.leagueId);
  const managerTrust = clubId === state.academyClubId ? 58 : 44;
  const squadRole = calculateSquadRole(state.overall, club, league.prestige, managerTrust, state.age);
  const contract = createContract(state.overall, state.age, club, state.seed);
  return {
    ...state,
    phase: "career",
    currentClubId: clubId,
    currentLeagueId: club.leagueId,
    currentEventId: FIRST_MATCH_EVENT.id,
    nextEventId: "",
    reputation: clubId === state.academyClubId ? 8 : 4,
    fanSupport: clubId === state.academyClubId ? 68 : 50,
    continentalSlot: initialContinentalSlot(club),
    money: 0,
    managerTrust,
    squadRole,
    contractYears: contract.years,
    annualSalary: contract.annualSalary,
    currentObjective: createSeasonObjective(positionByKey(state.position), squadRole, state.season, state.seed),
    followers: 1_200 + club.reputation * 900,
    socialFeed: [{
      id: `${state.seed}-${state.season}-first-contract`,
      season: state.season,
      source: "press",
      author: "Central do Futebol",
      text: `${state.name} assinou o primeiro contrato profissional com o ${club.shortName}.`,
      likes: 340 + club.reputation * 120,
      tone: "positive",
    }],
    newsFeed: [`${state.season}: primeiro contrato assinado com o ${club.shortName}.`],
  };
}

export function completeSimulationTransfer(state: GameState, clubId: string | null): GameState {
  const richOffer = state.transferMarketOffers.find((offer) => offer.clubId === clubId)
    ?? (clubId ? materializeTransferOffers(state, [clubId], state.season * 601, {
      includeForeign: true,
      mode: state.pendingTransferMode === "loan" ? "loan" : state.isFreeAgent ? "free-agent" : "permanent",
    })[0] : undefined);
  if (clubId && richOffer) {
    const moved = applyAcceptedTransfer(state, richOffer);
    const next = { ...moved, phase: "career" as const, currentEventId: "", nextEventId: "", lastResult: null, lastConsequence: null };
    return { ...next, currentEventId: state.nextEventId || selectNextEvent(next, state.season * 47) };
  }
  const newClub = clubId ? clubById(clubId) : null;
  const oldClub = clubById(state.currentClubId);
  const targetClub = newClub ?? oldClub;
  const isLoan = Boolean(newClub && state.pendingTransferMode === "loan");
  const targetLeague = leagueById(targetClub.leagueId);
  const offerIndex = Math.max(0, state.transferOffers.indexOf(clubId ?? ""));
  const signingContract = Boolean(!isLoan && (newClub || state.contractYears === 0));
  const generatedContract = createContract(state.overall, state.age, targetClub, state.seed + state.season + offerIndex);
  const contract = signingContract ? generatedContract : { years: state.contractYears, annualSalary: state.annualSalary };
  const changingCountry = Boolean(newClub && newClub.countryId !== oldClub.countryId);
  const managerTrust = newClub ? 50 : clamp(state.managerTrust + 5);
  const squadRole = calculateSquadRole(state.overall, targetClub, targetLeague.prestige, managerTrust, state.age);
  const transferred: GameState = {
    ...state,
    phase: "career",
    currentClubId: clubId ?? state.currentClubId,
    currentLeagueId: newClub ? newClub.leagueId : state.currentLeagueId,
    currentEventId: "",
    nextEventId: "",
    lastResult: null,
    lastConsequence: null,
    transferOffers: [],
    transferMarketOffers: [],
    morale: clamp(state.morale + (clubId ? 5 : 2)),
    fanSupport: clubId ? 52 : clamp(state.fanSupport + 3),
    continentalSlot: newClub ? initialContinentalSlot(newClub) : state.continentalSlot,
    adaptation: newClub ? (changingCountry ? initialAdaptation(oldClub.countryId, newClub.countryId) : state.adaptation) : state.adaptation,
    abroadSeasons: changingCountry ? 0 : state.abroadSeasons,
    transferStatus: null,
    transferRequested: false,
    renewalDenied: false,
    forcedAlternativeTransfer: false,
    pendingTransferMode: "permanent",
    loanParentClubId: isLoan ? oldClub.id : "",
    loanParentLeagueId: isLoan ? (state.currentLeagueId || oldClub.leagueId) : "",
    loanEndSeason: isLoan ? state.season + 1 : 0,
    isFreeAgent: false,
    freeAgentSinceSeason: 0,
    managerTrust,
    squadRole,
    contractYears: contract.years,
    annualSalary: contract.annualSalary,
    clubCaptain: newClub ? false : state.clubCaptain,
    currentObjective: createSeasonObjective(positionByKey(state.position), squadRole, state.season, state.seed + state.season),
  };
  return {
    ...transferred,
    currentEventId: state.nextEventId || selectNextEvent(transferred, state.season * 47),
  };
}

export function simulateMonteCarloCareer(seed: number, careerIndex: number): MonteCarloCareerSummary {
  const chosenPosition = pick(POSITIONS, seed, 701 + careerIndex).key;
  const chosenNationality = pick(COUNTRIES, seed, 709 + careerIndex).id;
  const academyClub = pick(randomAcademyClubs(seed, chosenNationality), seed, 719 + careerIndex);
  const formation = pick(FORMATIONS, seed, 727 + careerIndex);
  let state: GameState = {
    ...initialState(),
    seed,
    name: `Simulação ${careerIndex + 1}`,
    position: chosenPosition,
    nationality: chosenNationality,
    academyClubId: academyClub.id,
  };
  const journey = createYouthJourney(state, formation.id);
  state = {
    ...state,
    formationId: formation.id,
    archetype: journey.formation.archetype,
    revealAge: journey.revealAge,
    youthScore: journey.score,
    youthYears: journey.youthYears,
    proOffers: journey.offers,
    age: journey.revealAge,
    season: state.season + journey.revealAge - 12,
    overall: journey.overall,
    potential: journey.potential,
    attributes: createPlayerAttributes(chosenPosition, journey.overall, seed),
    traits: selectCareerTraits(chosenPosition, seed),
    rivals: createCareerRivals(seed, journey.revealAge, journey.overall, []),
    morale: clamp(68 + Math.round(journey.score / 4)),
    fitness: 94,
  };
  const firstClubId = pick(journey.offers, seed, 733 + careerIndex);
  state = signProfessionalForSimulation(state, firstClubId);

  let seasons = 0;
  while (state.age < 40 && seasons < 30) {
    if ((state.activeLoan || state.loanParentClubId) && state.season >= (state.activeLoan?.endSeason ?? state.loanEndSeason)) state = completeLoanReturn(state);
    const event = eventForState(state);
    const choiceIndex = Math.floor(seeded(seed, state.season * 401 + seasons * 17) * event.choices.length);
    const choice = event.choices[choiceIndex] ?? event.choices[0];
    let effect = choice.effect;
    let resultText = choice.result;
    let luckOutcome: "success" | "failure" | null = null;
    if (choice.luck) {
      const succeeded = seeded(state.seed, state.season * 127 + choiceIndex * 17 + state.history.length) < choice.luck.chance / 100;
      effect = mergeEffects(choice.effect, succeeded ? choice.luck.successEffect : choice.luck.failureEffect);
      resultText = succeeded ? choice.luck.successText : choice.luck.failureText;
      luckOutcome = succeeded ? "success" : "failure";
    }
    state = simulateSeason(state, event, effect, choice.label, resultText, luckOutcome);
    seasons += 1;
    if (state.retireAfterSeason) break;

    if (state.transferOffers.length) {
      const mustMove = state.renewalDenied || state.transferRequested || state.pendingTransferMode === "loan" || state.isFreeAgent;
      const movesClub = mustMove || seeded(seed, state.season * 419 + seasons) < 0.55;
      const destination = movesClub
        ? pick(state.transferOffers, seed, state.season * 431 + seasons)
        : null;
      state = completeSimulationTransfer(state, destination);
    } else {
      state = {
        ...state,
        phase: "career",
        currentEventId: state.nextEventId || "extra-training",
        lastResult: null,
        lastConsequence: null,
        transferRequested: false,
        renewalDenied: false,
        forcedClubExit: false,
        forcedAlternativeTransfer: false,
      };
    }
  }

  const awardSeasons = state.history.map((record) => ({
    ballonDor: record.awards.includes("Bola de Ouro"),
    worldXi: record.awards.includes("FIFPRO World XI"),
    production: record.awards.some((award) =>
      award.includes("Artilheiro") ||
      award === "Chuteira de Ouro Europeia" ||
      award.includes("Assistências")
    ),
  }));
  return {
    career: careerIndex + 1,
    seed,
    name: state.name,
    nationality: countryById(state.nationality).name,
    position: state.position,
    seasons,
    clubs: new Set(state.history.map((record) => record.clubId)).size,
    peakOverall: Math.max(state.overall, ...state.history.map((record) => record.overall), 0),
    appearances: state.stats.appearances,
    goals: state.stats.goals,
    assists: state.stats.assists,
    trophies: state.trophies + state.nationalTrophies,
    individualAwards: state.awards,
    ballonDor: state.awardCabinet["Bola de Ouro"] ?? 0,
    worldXi: state.awardCabinet["FIFPRO World XI"] ?? 0,
    worldXiWithoutBallonDor: awardSeasons.filter((season) => season.worldXi && !season.ballonDor).length,
    ballonDorWithoutProductionAward: awardSeasons.filter((season) => season.ballonDor && !season.production).length,
    ballonDorWithoutWorldXi: awardSeasons.filter((season) => season.ballonDor && !season.worldXi).length,
  };
}

export function runMonteCarloCareers(runs: number, seedBase = 20260723): MonteCarloReport {
  const safeRuns = clamp(Math.floor(runs), 1, 10_000);
  const careers = Array.from({ length: safeRuns }, (_, index) =>
    simulateMonteCarloCareer((seedBase + index * 104729) % 2147483647, index),
  );
  const winners = careers.filter((career) => career.ballonDor > 0);
  const totalBallonDor = winners.reduce((total, career) => total + career.ballonDor, 0);
  const totalWorldXi = careers.reduce((total, career) => total + career.worldXi, 0);
  const worldXiWithoutBallonDor = careers.reduce((total, career) => total + career.worldXiWithoutBallonDor, 0);
  const ballonDorWithoutProductionAward = careers.reduce((total, career) => total + career.ballonDorWithoutProductionAward, 0);
  const ballonDorWithoutWorldXi = careers.reduce((total, career) => total + career.ballonDorWithoutWorldXi, 0);
  const totalSeasons = careers.reduce((total, career) => total + career.seasons, 0);
  const totalIndividualAwards = careers.reduce((total, career) => total + career.individualAwards, 0);
  const average = (key: keyof Pick<MonteCarloCareerSummary, "seasons" | "peakOverall" | "appearances" | "goals" | "assists" | "trophies">) =>
    Number((careers.reduce((total, career) => total + career[key], 0) / safeRuns).toFixed(2));
  const positionBreakdown = Object.fromEntries(POSITIONS.map((position) => {
    const positionCareers = careers.filter((career) => career.position === position.key);
    const count = Math.max(1, positionCareers.length);
    return [position.key, {
      careers: positionCareers.length,
      averagePeakOverall: Number((positionCareers.reduce((total, career) => total + career.peakOverall, 0) / count).toFixed(2)),
      averageTrophies: Number((positionCareers.reduce((total, career) => total + career.trophies, 0) / count).toFixed(2)),
      ballonDorCareers: positionCareers.filter((career) => career.ballonDor > 0).length,
    }];
  })) as MonteCarloReport["positionBreakdown"];
  const bestCareer = [...careers].sort((a, b) =>
    b.ballonDor - a.ballonDor ||
    b.peakOverall - a.peakOverall ||
    b.trophies - a.trophies ||
    b.goals + b.assists - (a.goals + a.assists),
  )[0];
  return {
    runs: safeRuns,
    seedBase,
    totalSeasons,
    totalIndividualAwards,
    averageIndividualAwards: Number((totalIndividualAwards / safeRuns).toFixed(2)),
    averageSeasons: average("seasons"),
    averagePeakOverall: average("peakOverall"),
    averageAppearances: average("appearances"),
    averageGoals: average("goals"),
    averageAssists: average("assists"),
    averageTrophies: average("trophies"),
    careersWithoutTrophies: careers.filter((career) => career.trophies === 0).length,
    careersWithoutAwards: careers.filter((career) => career.individualAwards === 0).length,
    careersBelow70Peak: careers.filter((career) => career.peakOverall < 70).length,
    careersAtLeast85Peak: careers.filter((career) => career.peakOverall >= 85).length,
    careersWithFiveBallonDor: careers.filter((career) => career.ballonDor >= 5).length,
    positionBreakdown,
    careersWithBallonDor: winners.length,
    totalBallonDor,
    totalWorldXi,
    worldXiWithoutBallonDor,
    ballonDorWithoutProductionAward,
    ballonDorWithoutWorldXi,
    careerChancePercent: Number(((winners.length / safeRuns) * 100).toFixed(2)),
    awardChancePerSeasonPercent: Number(((totalBallonDor / Math.max(1, totalSeasons)) * 100).toFixed(3)),
    winners,
    bestCareer,
  };
}

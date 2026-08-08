"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CLUBS,
  COUNTRIES,
  FIRST_MATCH_EVENT,
  FORMATIONS,
  LEAGUES,
  POSITIONS,
  PRO_EVENTS,
  YOUTH_EVENTS,
  countryById,
  leagueById,
  type Club,
  type ContinentalSlot,
  type Country,
  type Effect,
  type GameEvent,
  type PositionKey,
} from "./game-data";
import {
  ROLE_LABELS,
  calculateLegacyScore,
  calculateSquadRole,
  createContract,
  createSeasonObjective,
  evaluateObjective,
  legacyTier,
  roleAppearanceModifier,
  type CareerObjective,
  type ObjectiveResult,
  type SquadRole,
} from "./career-systems";
import {
  ACHIEVEMENTS,
  MEGA_EVENTS,
  NEWS_TEMPLATES,
  RIVALRIES,
  fillNewsTemplate,
  findRivalry,
  getUnlockedAchievements,
} from "./mega-expansion";
import { CAREER_DRAMA_EVENTS } from "./career-drama";
import { BACKSTAGE_EVENTS } from "./backstage-saga";
import { FUTBOBO_MOMENTS } from "./futbobo-moments";
import { VERIFIED_CLUB_ASSET_IDS } from "./verified-club-assets";
import BotaoMatch from "./botao/BotaoMatch";
import GoalReplay from "./botao/GoalReplay";
import TeamCrest from "./botao/TeamCrest";
import AndroidInstallDialog from "./AndroidInstallDialog";
import {
  checkForAndroidUpdate,
  isAndroidDevice,
  isNativeAndroid,
  openAndroidDownload,
  type AndroidRelease,
} from "./android-app";
import {
  buildFinalSetup,
  buildNationalMatchSetup,
  describeFinal,
  finalOutcome,
  formatGoalMinute,
  isMatchGoal,
  nationalMatchRole,
  pickFinalOpponent,
  pickNationalOpponent,
  ratingsFromAttributes,
  walkoverBotaoResult,
} from "./botao/adapter";
import { simulateBotaoMatch } from "./botao/simulate";
import type { BotaoMatchResult, BotaoMatchSetup } from "./botao/types";
import { PLAYER_STORIES, playerStoryById, type PlayerStoryId } from "./player-stories";
import { STORY_CHAPTER_BEATS } from "./story-chapters";

type Phase =
  | "welcome"
  | "identity"
  | "nationality"
  | "academy"
  | "formation"
  | "story"
  | "youth"
  | "youth-complete"
  | "revelation"
  | "career"
  | "consequence"
  | "botao-final"
  | "botao-result"
  | "season-result"
  | "transfer"
  | "transfer-denied"
  | "retirement-confirm"
  | "summary";

type CompetitionId =
  | "domesticLeague"
  | "domesticCup"
  | "domesticSuperCup"
  | "libertadores"
  | "recopaSudamericana"
  | "mundial"
  | "championsLeague"
  | "uefaSuperCup"
  | "europaLeague"
  | "conferenceLeague"
  | "concacafChampions"
  | "afcChampions"
  | "campeonesCup";

type CompetitionResult = {
  id: CompetitionId;
  name: string;
  icon: string;
  stage: string;
  champion: boolean;
};

type PendingBotaoMatch = {
  id: string;
  source: "club" | "national";
  competitionId: string;
  competitionName: string;
  stageName: string;
  opponentId: string;
  season: number;
  rngChampion: boolean;
  originalStage: string;
  nationalTier?: NationalTier;
  previousOpponentIds?: string[];
};

type StoredBotaoResult = {
  match: PendingBotaoMatch;
  result: BotaoMatchResult;
};

type TrophyCabinet = {
  domesticLeague: number;
  domesticCup: number;
  domesticSuperCup: number;
  libertadores: number;
  recopaSudamericana: number;
  mundial: number;
  championsLeague: number;
  uefaSuperCup: number;
  europaLeague: number;
  conferenceLeague: number;
  concacafChampions: number;
  afcChampions: number;
  campeonesCup: number;
};

type NationalTier = "none" | "sub17" | "sub20" | "olympic" | "main";

type NationalRecord = {
  season: number;
  tier: NationalTier;
  name: string;
  icon: string;
  stage: string;
  champion: boolean;
  tournamentStats?: TournamentStats;
};

type TournamentStats = {
  appearances: number;
  goals: number;
  assists: number;
  groupAppearances: number;
  groupGoals: number;
  groupAssists: number;
  knockoutAppearances: number;
  knockoutGoals: number;
  knockoutAssists: number;
};

type ChoiceConsequence = {
  choice: string;
  headline: string;
  resultText: string;
  changes: string[];
  luckOutcome: "success" | "failure" | null;
};

type StoryDecisionChoice = {
  label: string;
  hint: string;
  result: string;
  effect: Effect;
  flag: string;
  transferClubId?: string;
};

type StoryDecision = {
  id: string;
  storyId: PlayerStoryId;
  chapter: number;
  icon: string;
  kicker: string;
  title: string;
  description: string;
  choices: StoryDecisionChoice[];
};

type StoryLogEntry = {
  season: number;
  chapter: number;
  decisionId?: string;
  title: string;
  choice: string;
  result: string;
};

type PressAnswer = {
  label: string;
  tone: "calm" | "bold" | "team";
  result: string;
  effect: Effect;
};

type PressQuestion = {
  id: string;
  question: string;
  context: string;
  answers: PressAnswer[];
};

type PressConference = {
  matchId: string;
  competitionName: string;
  opponentName: string;
  questionIndex: number;
  questions: PressQuestion[];
};

type TransferStatus = {
  success: boolean;
  chance: number;
  headline: string;
  text: string;
};

type PlayerStats = {
  appearances: number;
  goals: number;
  assists: number;
  tackles: number;
  cleanSheets: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
};

type AttributeKey =
  | "finishing"
  | "longShots"
  | "passing"
  | "crossing"
  | "dribbling"
  | "firstTouch"
  | "pace"
  | "acceleration"
  | "strength"
  | "stamina"
  | "positioning"
  | "vision"
  | "composure"
  | "marking"
  | "tackling"
  | "aerial"
  | "reflexes"
  | "handling"
  | "distribution";

type PlayerAttributes = Record<AttributeKey, number>;

type AwardNomination = {
  award: string;
  won: boolean;
  winner: string;
  finalists?: string[];
};

type TransferMode = "permanent" | "loan";

type SocialPost = {
  id: string;
  season: number;
  source: "player" | "fans" | "press" | "sponsor";
  author: string;
  text: string;
  likes: number;
  tone: "positive" | "neutral" | "negative";
};

type SponsorDeal = {
  id: string;
  brand: string;
  startSeason: number;
  endSeason: number;
  annualValue: number;
  signedAtFollowers: number;
  status: "active" | "completed" | "terminated";
};

type SpecialTraitId =
  | "clinical-finisher"
  | "playmaker"
  | "iron-lungs"
  | "big-game"
  | "leader"
  | "free-kick"
  | "ironman"
  | "versatile"
  | "inconsistent"
  | "injury-prone";

type CareerRival = {
  id: string;
  name: string;
  position: PositionKey;
  nationality: string;
  age: number;
  overall: number;
  currentClubId: string;
  appearances: number;
  goals: number;
  assists: number;
  awards: number;
  relationship: number;
  custom: boolean;
  active: boolean;
};

type CustomCharacter = {
  id: string;
  name: string;
  position: PositionKey;
};

type CustomClubDefinition = {
  replacedClubId: string;
  name: string;
  shortName: string;
  abbr: string;
  primary: string;
  secondary: string;
  badge: string;
};

type AppSettings = {
  customCharacters: CustomCharacter[];
  customClubs?: CustomClubDefinition[];
  finalMatchMode?: "simulate" | "finals-only" | "play-key-matches";
  botaoGoalLimit?: 0 | 3 | 5;
  botaoHalfSeconds?: 90 | 120 | 180;
  botaoExtraSeconds?: 30 | 45 | 60;
  botaoPenaltyRounds?: 3 | 5;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type YouthYear = {
  age: number;
  title: string;
  text: string;
  delta: number;
  overall?: number;
};

type SeasonRecord = PlayerStats & {
  age: number;
  season: number;
  clubId: string;
  leagueId?: string;
  position: PositionKey;
  overall: number;
  title: boolean;
  eventTitle: string;
  competitions: CompetitionResult[];
  awards: string[];
  awardNominations: AwardNomination[];
  squadRole: SquadRole;
  objectiveResult: ObjectiveResult | null;
  performanceScore?: number;
  marketValue?: number;
  development?: number;
  followers?: number;
  socialSentiment?: number;
  botaoResults?: StoredBotaoResult[];
  promotion?: string | null;
  averageRating?: number;
  manOfTheMatchAwards?: number;
  medicalRecord?: MedicalRecord | null;
};

type SeasonResult = SeasonRecord & {
  resultText: string;
  development: number;
  performanceScore: number;
  europeanSpotlight: number;
  europeanDevelopmentBonus: number;
  breakoutBonus: number;
  marketValue: number;
  calledUp: boolean;
  twist: string | null;
  nationalNote: string | null;
  salaryIncome?: number;
  sponsorIncome?: number;
  livingCost?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  spendableIncome?: number;
  spendableAfter?: number;
};

type GameState = {
  version: 7;
  phase: Phase;
  seed: number;
  name: string;
  number: number;
  foot: "Direita" | "Esquerda";
  position: PositionKey;
  nationality: string;
  academyCountryId: string;
  academyClubId: string;
  formationId: string;
  archetype: string;
  playerStoryId: PlayerStoryId;
  storyFlags: string[];
  storyLog: StoryLogEntry[];
  pendingStoryDecision: StoryDecision | null;
  revealAge: number;
  youthScore: number;
  youthYears: YouthYear[];
  proOffers: string[];
  currentClubId: string;
  currentLeagueId: string;
  age: number;
  season: number;
  overall: number;
  potential: number;
  attributes: PlayerAttributes;
  morale: number;
  fitness: number;
  reputation: number;
  leadership: number;
  money: number;
  spendableMoney: number;
  nationalLevel: number;
  fanSupport: number;
  managerTrust: number;
  discipline: number;
  disciplineHistoryReliable: boolean;
  suspensionMatches: number;
  squadRole: SquadRole;
  clubCaptain: boolean;
  contractYears: number;
  annualSalary: number;
  currentObjective: CareerObjective | null;
  objectivesCompleted: number;
  objectivesFailed: number;
  stats: PlayerStats;
  trophies: number;
  trophyCabinet: TrophyCabinet;
  awards: number;
  awardCabinet: Record<string, number>;
  setbacks: number;
  luckyBreaks: number;
  continentalSlot: ContinentalSlot | null;
  worldQualifiedSeason: number;
  worldQualifiedClubId: string;
  adaptation: number;
  abroadSeasons: number;
  nationalCategory: NationalTier;
  nationalCaps: number;
  nationalGoals: number;
  nationalAssists: number;
  nationalCaptain: boolean;
  nationalTrophies: number;
  nationalHistory: NationalRecord[];
  qualifiedNextMajor: boolean;
  currentEventId: string;
  nextEventId: string;
  seenEvents: string[];
  history: SeasonRecord[];
  lastResult: SeasonResult | null;
  lastConsequence: ChoiceConsequence | null;
  pendingBotaoMatches: PendingBotaoMatch[];
  lastBotaoResult: StoredBotaoResult | null;
  pendingPressConference: PressConference | null;
  retireAfterSeason: boolean;
  retirementReturnPhase: Phase;
  transferOffers: string[];
  transferRequests: number;
  transferCooldownSeason: number;
  positionChangeCooldownSeason: number;
  transferStatus: TransferStatus | null;
  transferRequested: boolean;
  renewalDenied: boolean;
  forcedClubExit: boolean;
  forcedAlternativeTransfer: boolean;
  pendingTransferMode: TransferMode;
  loanParentClubId: string;
  loanParentLeagueId: string;
  loanEndSeason: number;
  isFreeAgent: boolean;
  freeAgentSinceSeason: number;
  forcedFreeAgentUntilSeason: number;
  corruptionGuaranteedSeason: number;
  traits: SpecialTraitId[];
  rivals: CareerRival[];
  followers: number;
  socialSentiment: number;
  mediaRelation: number;
  lifeBalance: number;
  charityReputation: number;
  activeSponsor: SponsorDeal | null;
  sponsorHistory: SponsorDeal[];
  socialFeed: SocialPost[];
  offFieldMilestones: string[];
  nationalitySwitched: boolean;
  nationalitySwitchInviteUsed: boolean;
  pendingNationalitySwitchTarget: string;
  legacyPoints: number;
  unlockedAchievements: string[];
  economyPurchases: string[];
  newsFeed: string[];
  medicalHistory: MedicalRecord[];
  injuryFreeSeasons: number;
  matchesMissedInjuries: number;
  challengeId: string;
  challengeDate: string;
};

type MedicalRecord = {
  id: string;
  season: number;
  age: number;
  name: string;
  severity: "moderada" | "grave";
  matchesMissed: number;
  recoveryMonths: number;
  recurring: boolean;
  overallImpact: number;
};

type ChallengeResult = {
  id: string;
  challengeId: string;
  date: string;
  name: string;
  position: PositionKey;
  nationality: string;
  score: number;
  peakOverall: number;
  trophies: number;
  ballonDor: number;
  finishedAt: number;
};

type MonteCarloCareerSummary = {
  career: number;
  seed: number;
  name: string;
  nationality: string;
  position: PositionKey;
  seasons: number;
  clubs: number;
  peakOverall: number;
  appearances: number;
  goals: number;
  assists: number;
  trophies: number;
  individualAwards: number;
  ballonDor: number;
  worldXi: number;
  worldXiWithoutBallonDor: number;
  ballonDorWithoutProductionAward: number;
  ballonDorWithoutWorldXi: number;
};

type MonteCarloReport = {
  runs: number;
  seedBase: number;
  totalSeasons: number;
  totalIndividualAwards: number;
  averageIndividualAwards: number;
  averageSeasons: number;
  averagePeakOverall: number;
  averageAppearances: number;
  averageGoals: number;
  averageAssists: number;
  averageTrophies: number;
  careersWithoutTrophies: number;
  careersWithoutAwards: number;
  careersBelow70Peak: number;
  careersAtLeast85Peak: number;
  careersWithFiveBallonDor: number;
  positionBreakdown: Record<PositionKey, {
    careers: number;
    averagePeakOverall: number;
    averageTrophies: number;
    ballonDorCareers: number;
  }>;
  careersWithBallonDor: number;
  totalBallonDor: number;
  totalWorldXi: number;
  worldXiWithoutBallonDor: number;
  ballonDorWithoutProductionAward: number;
  ballonDorWithoutWorldXi: number;
  careerChancePercent: number;
  awardChancePerSeasonPercent: number;
  winners: MonteCarloCareerSummary[];
  bestCareer: MonteCarloCareerSummary;
};

type AwardTier = "regular" | "elite" | "legendary";

type AwardPresentation = {
  icon: string;
  tier: AwardTier;
  kicker: string;
  description: string;
};

type CareerHallEntry = {
  id: string;
  name: string;
  position: PositionKey;
  nationality: string;
  finalClubId: string;
  seasons: number;
  peakOverall: number;
  legacyPoints: number;
  legacyLabel: string;
  trophies: number;
  awards: number;
  ballonDor: number;
  appearances?: number;
  goals: number;
  assists: number;
  finishedAt: number;
  snapshot?: GameState;
};

function awardPresentation(award: string): AwardPresentation {
  if (award === "Bola de Ouro") return { icon: "◉", tier: "legendary", kicker: "MAIOR PRÊMIO DO FUTEBOL", description: "Você foi eleito o melhor jogador do mundo." };
  if (award.includes("UEFA") || award.includes("Champions") || award === "Rei da América" || award.includes("Mundial")) {
    return { icon: "♛", tier: "elite", kicker: "PRÊMIO CONTINENTAL", description: "Uma temporada que atravessou fronteiras." };
  }
  if (award.includes("Golden Boy") || award.includes("Kopa") || award.includes("Jovem") || award.includes("Revelação")) {
    return { icon: "★", tier: "elite", kicker: "TALENTO GERACIONAL", description: "Seu nome liderou a nova geração." };
  }
  if (award.includes("Artilheiro") || award.includes("Chuteira")) return { icon: "◎", tier: "regular", kicker: "DESTAQUE OFENSIVO", description: "Ninguém marcou mais que você." };
  if (award.includes("Assistências") || award.includes("Meio-Campista")) return { icon: "✦", tier: "regular", kicker: "MESTRE DA CRIAÇÃO", description: "A temporada passou pelos seus pés." };
  if (award.includes("Yashin") || award.includes("Luva")) return { icon: "◆", tier: "elite", kicker: "PAREDE DA TEMPORADA", description: "Você dominou a área e decidiu jogos." };
  if (award.includes("Defensor")) return { icon: "⬡", tier: "regular", kicker: "PILAR DEFENSIVO", description: "Sua segurança mudou o nível da equipe." };
  if (award.includes("Puskás")) return { icon: "↗", tier: "elite", kicker: "GOL DO ANO", description: "Um lance para ser lembrado por décadas." };
  if (award.includes("Jogador do Ano") || award.includes("Craque") || award.includes("MVP") || award.includes("FIFPRO")) {
    return { icon: "✪", tier: "elite", kicker: "TEMPORADA CONSAGRADORA", description: "Você foi o rosto da competição." };
  }
  return { icon: "✦", tier: "regular", kicker: "PRÊMIO INDIVIDUAL", description: "Seu desempenho recebeu reconhecimento." };
}

function awardTierWeight(award: string) {
  const tier = awardPresentation(award).tier;
  return tier === "legendary" ? 3 : tier === "elite" ? 2 : 1;
}

declare global {
  interface Window {
    __FUTBOBO_MONTE_CARLO__?: (runs: number, seedBase?: number) => MonteCarloReport;
  }
}

const SAVE_KEY = "futbobo:career:v1";
const CHALLENGE_SAVE_KEY = "futbobo:challenge-save:v1";
const CHALLENGE_RESULTS_KEY = "futbobo:challenge-results:v1";
const HALL_OF_FAME_KEY = "futbobo:hall-of-fame:v1";
const SETTINGS_KEY = "futbobo:settings:v1";
const BOTAO_IN_PROGRESS_KEY = "futbobo:botao-in-progress:v1";
const BALLON_DOR_EXCLUDED_TROPHIES = new Set<CompetitionId>([
  "domesticCup",
  "domesticSuperCup",
  "recopaSudamericana",
  "uefaSuperCup",
  "campeonesCup",
]);

function dateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function stableSeed(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 2147483647 || 20260728;
}

function dailyChallenge(now = new Date()) {
  const date = dateKey(now);
  return {
    date,
    id: `FB-${date.replaceAll("-", "")}`,
    seed: stableSeed(`futbobo-desafio-${date}`),
  };
}
const ORIGINAL_CLUB_PRESENTATION = new Map(
  CLUBS.map((club) => [club.id, {
    name: club.name,
    shortName: club.shortName,
    abbr: club.abbr,
    primary: club.primary,
    secondary: club.secondary,
    customBadge: club.customBadge,
  }]),
);

function applyCustomClubDefinitions(definitions: CustomClubDefinition[]) {
  CLUBS.forEach((club) => {
    const original = ORIGINAL_CLUB_PRESENTATION.get(club.id);
    if (original) Object.assign(club, original);
  });
  definitions.forEach((definition) => {
    const club = CLUBS.find((candidate) => candidate.id === definition.replacedClubId);
    if (!club) return;
    const safeBadge = definition.badge?.startsWith("data:image/") || /^https:\/\//i.test(definition.badge ?? "")
      ? definition.badge
      : undefined;
    Object.assign(club, {
      name: definition.name,
      shortName: definition.shortName,
      abbr: definition.abbr,
      primary: definition.primary,
      secondary: definition.secondary,
      customBadge: safeBadge,
    });
  });
}

const RANDOM_NAME_FIRST_PART = ["Lionel", "Rayan", "Enzo", "Thiago", "Neyvan", "Kaoru", "Joanderson", "Lauta", "Marlon", "Kenji", "Noah", "Zico", "Mateus", "Santi", "Davi", "Keirrison", "Rivaldo", "Gael", "Axl", "Juninho"];
const RANDOM_NAME_LAST_PART = ["Kishimoto", "Ferreyra", "Montiel", "da Colina", "Okafor", "Sakamoto", "Bensaid", "van Bronze", "do Valle", "Moretti", "Zanetti", "Nakamura", "Pereirinha", "Alcazar", "Matsubara", "de la Vega", "dos Pampas", "Silveirinha", "Kronberg", "Batistuta Jr"];
const ALL_PRO_EVENTS = [...PRO_EVENTS, ...MEGA_EVENTS, ...CAREER_DRAMA_EVENTS, ...BACKSTAGE_EVENTS, ...FUTBOBO_MOMENTS];
const FICTIONAL_FINALISTS = [
  "Mateo Alcázar",
  "Noah van Dijk",
  "Luca Bellandi",
  "Amadou Keïta",
  "Thiago Montiel",
  "Elias Kronberg",
  "Rayan Bensaïd",
  "Santiago Ferreyra",
  "Enzo Moretti",
  "Malik Okafor",
  "João Vilar",
  "Kenji Sakamoto",
  "Dante Volkov",
  "Yuri Nakahara",
  "Caio Bellini",
  "Ibrahim Delacroix",
  "Tobias Montenegro",
  "Luan van Helsing",
  "Mamadou Starling",
  "Akira dos Santos",
  "Gael Ibrahimović",
  "Nicolás Onizuka",
];

const RIVAL_PROFILES: Array<{ name: string; position: PositionKey; nationality: string }> = [
  { name: "Mateo Alcázar", position: "CA", nationality: "argentina" },
  { name: "Noah van Dijk", position: "ZAG", nationality: "holanda" },
  { name: "Luca Bellandi", position: "MEI", nationality: "italia" },
  { name: "Amadou Keïta", position: "PD", nationality: "senegal" },
  { name: "Thiago Montiel", position: "MC", nationality: "uruguai" },
  { name: "Elias Kronberg", position: "GOL", nationality: "suecia" },
  { name: "Rayan Bensaïd", position: "PE", nationality: "marrocos" },
  { name: "Santiago Ferreyra", position: "CA", nationality: "argentina" },
  { name: "Enzo Moretti", position: "LD", nationality: "italia" },
  { name: "Malik Okafor", position: "VOL", nationality: "nigeria" },
  { name: "João Vilar", position: "MEI", nationality: "brasil" },
  { name: "Kenji Sakamoto", position: "PD", nationality: "japao" },
  { name: "Dante Volkov", position: "CA", nationality: "ucrania" },
  { name: "Yuri Nakahara", position: "MEI", nationality: "japao" },
  { name: "Caio Bellini", position: "PE", nationality: "brasil" },
  { name: "Ibrahim Delacroix", position: "VOL", nationality: "franca" },
  { name: "Tobias Montenegro", position: "ZAG", nationality: "uruguai" },
  { name: "Luan van Helsing", position: "GOL", nationality: "brasil" },
  { name: "Mamadou Starling", position: "CA", nationality: "senegal" },
  { name: "Akira dos Santos", position: "PD", nationality: "brasil" },
  { name: "Gael Ibrahimovic", position: "CA", nationality: "suecia" },
  { name: "Nicolas Onizuka", position: "MC", nationality: "argentina" },
];

const SPECIAL_TRAITS: Record<SpecialTraitId, { icon: string; name: string; description: string; tone: "positive" | "volatile" }> = {
  "clinical-finisher": { icon: "◎", name: "Finalizador nato", description: "Mais gols a partir das mesmas chances.", tone: "positive" },
  playmaker: { icon: "✦", name: "Arquiteto", description: "Passe e visão geram mais assistências.", tone: "positive" },
  "iron-lungs": { icon: "∞", name: "Pulmão de aço", description: "Joga mais e sente menos o calendário.", tone: "positive" },
  "big-game": { icon: "★", name: "Decisivo", description: "Cresce em finais e disputas por títulos.", tone: "positive" },
  leader: { icon: "C", name: "Líder natural", description: "Ganha confiança e influência mais rápido.", tone: "positive" },
  "free-kick": { icon: "↗", name: "Bola parada", description: "Faltas e chutes de longe viram gols extras.", tone: "positive" },
  ironman: { icon: "◆", name: "Homem de ferro", description: "Tem menor risco de lesões graves.", tone: "positive" },
  versatile: { icon: "↔", name: "Versátil", description: "Adapta-se melhor a novas posições.", tone: "positive" },
  inconsistent: { icon: "≈", name: "Inconstante", description: "Pode alternar temporadas mágicas e apagadas.", tone: "volatile" },
  "injury-prone": { icon: "+", name: "Corpo frágil", description: "Tem maior risco de lesões e temporadas interrompidas.", tone: "volatile" },
};

const SPONSOR_BRANDS = [
  { name: "Nike", tier: 5, minReputation: 76, baseValue: 1_250_000 },
  { name: "adidas", tier: 5, minReputation: 74, baseValue: 1_180_000 },
  { name: "Puma", tier: 4, minReputation: 61, baseValue: 810_000 },
  { name: "New Balance", tier: 4, minReputation: 56, baseValue: 650_000 },
  { name: "Under Armour", tier: 3, minReputation: 47, baseValue: 440_000 },
  { name: "Mizuno", tier: 3, minReputation: 42, baseValue: 340_000 },
  { name: "ASICS", tier: 3, minReputation: 38, baseValue: 310_000 },
  { name: "Umbro", tier: 2, minReputation: 29, baseValue: 220_000 },
  { name: "Kappa", tier: 2, minReputation: 24, baseValue: 180_000 },
  { name: "Diadora", tier: 2, minReputation: 20, baseValue: 150_000 },
  { name: "Lotto", tier: 1, minReputation: 12, baseValue: 110_000 },
  { name: "bet365", tier: 4, minReputation: 40, baseValue: 1_050_000, controversial: true },
  { name: "Stake", tier: 3, minReputation: 34, baseValue: 760_000, controversial: true },
  { name: "Betano", tier: 3, minReputation: 31, baseValue: 680_000, controversial: true },
] as const;

const TRAITS_BY_POSITION: Record<PositionKey, SpecialTraitId[]> = {
  GOL: ["ironman", "leader", "big-game", "inconsistent"],
  LD: ["iron-lungs", "versatile", "playmaker", "injury-prone"],
  ZAG: ["leader", "ironman", "big-game", "injury-prone"],
  LE: ["iron-lungs", "versatile", "playmaker", "injury-prone"],
  VOL: ["iron-lungs", "leader", "versatile", "inconsistent"],
  MC: ["playmaker", "iron-lungs", "leader", "versatile"],
  MEI: ["playmaker", "free-kick", "big-game", "inconsistent"],
  MD: ["playmaker", "iron-lungs", "versatile", "inconsistent"],
  ME: ["playmaker", "iron-lungs", "versatile", "inconsistent"],
  PD: ["clinical-finisher", "big-game", "free-kick", "inconsistent"],
  PE: ["clinical-finisher", "big-game", "free-kick", "inconsistent"],
  CA: ["clinical-finisher", "big-game", "ironman", "injury-prone"],
};

const EMPTY_STATS: PlayerStats = {
  appearances: 0,
  goals: 0,
  assists: 0,
  tackles: 0,
  cleanSheets: 0,
  goalsConceded: 0,
  yellowCards: 0,
  redCards: 0,
};

const ATTRIBUTE_GROUPS: Array<{ label: string; keys: AttributeKey[] }> = [
  { label: "ATAQUE", keys: ["finishing", "longShots", "positioning", "composure"] },
  { label: "CRIAÇÃO", keys: ["passing", "vision", "crossing", "distribution"] },
  { label: "TÉCNICA", keys: ["dribbling", "firstTouch"] },
  { label: "FÍSICO", keys: ["pace", "acceleration", "strength", "stamina", "aerial"] },
  { label: "DEFESA", keys: ["marking", "tackling"] },
  { label: "GOLEIRO", keys: ["reflexes", "handling"] },
];

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  finishing: "Finalização",
  longShots: "Chute de longe",
  passing: "Passe",
  crossing: "Cruzamento",
  dribbling: "Drible",
  firstTouch: "Domínio",
  pace: "Velocidade",
  acceleration: "Aceleração",
  strength: "Força",
  stamina: "Fôlego",
  positioning: "Posicionamento",
  vision: "Visão",
  composure: "Frieza",
  marking: "Marcação",
  tackling: "Desarme",
  aerial: "Jogo aéreo",
  reflexes: "Reflexos",
  handling: "Defesa",
  distribution: "Reposição",
};

const POSITION_PRIMARY_ATTRIBUTES: Record<PositionKey, AttributeKey[]> = {
  GOL: ["reflexes", "handling", "positioning", "distribution", "composure"],
  LD: ["pace", "stamina", "crossing", "tackling", "marking"],
  ZAG: ["marking", "tackling", "aerial", "strength", "positioning"],
  LE: ["pace", "stamina", "crossing", "tackling", "marking"],
  VOL: ["tackling", "marking", "passing", "stamina", "positioning"],
  MC: ["passing", "vision", "firstTouch", "stamina", "positioning"],
  MEI: ["passing", "vision", "dribbling", "firstTouch", "longShots"],
  MD: ["pace", "crossing", "dribbling", "stamina", "passing"],
  ME: ["pace", "crossing", "dribbling", "stamina", "passing"],
  PD: ["pace", "acceleration", "dribbling", "finishing", "crossing"],
  PE: ["pace", "acceleration", "dribbling", "finishing", "crossing"],
  CA: ["finishing", "positioning", "composure", "aerial", "strength"],
};

const ALL_ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_LABELS) as AttributeKey[];

function attributeAverage(attributes: PlayerAttributes, keys: AttributeKey[]) {
  return keys.reduce((total, key) => total + attributes[key], 0) / Math.max(1, keys.length);
}

function attributeTone(value: number) {
  if (value >= 85) return "#ffc72c";
  if (value >= 72) return "#63e36b";
  if (value >= 58) return "#2ca8ff";
  if (value >= 45) return "#f5f7f2";
  return "#ff8c5a";
}

function createPlayerAttributes(positionKey: PositionKey, overall: number, seed: number): PlayerAttributes {
  const position = positionByKey(positionKey);
  const primary = new Set(POSITION_PRIMARY_ATTRIBUTES[positionKey]);
  const goalkeeperKeys = new Set<AttributeKey>(["reflexes", "handling", "distribution"]);
  return Object.fromEntries(ALL_ATTRIBUTE_KEYS.map((key, index) => {
    const isGoalkeeping = goalkeeperKeys.has(key);
    let offset = primary.has(key) ? 5 : -2;
    if (position.zone === "gol") offset += isGoalkeeping ? 6 : key === "positioning" || key === "composure" ? 3 : -17;
    else if (isGoalkeeping) offset -= 24;
    if (position.zone === "defesa" && (key === "marking" || key === "tackling" || key === "aerial")) offset += 4;
    if (position.zone === "ataque" && (key === "finishing" || key === "dribbling" || key === "pace")) offset += 3;
    const variation = Math.round((seeded(seed, 500 + index * 17) - 0.5) * 12);
    return [key, clamp(overall + offset + variation, 18, 96)];
  })) as PlayerAttributes;
}

function shiftPlayerAttributes(attributes: PlayerAttributes, amount: number, positionKey: PositionKey, seed: number): PlayerAttributes {
  if (!amount) return attributes;
  const primary = new Set(POSITION_PRIMARY_ATTRIBUTES[positionKey]);
  return Object.fromEntries(ALL_ATTRIBUTE_KEYS.map((key, index) => {
    const relevance = primary.has(key) ? 1 : 0.55;
    const variation = amount > 0 && seeded(seed, 1700 + index * 13) > 0.76 ? 1 : 0;
    const delta = Math.sign(amount) * Math.max(0, Math.round(Math.abs(amount) * relevance) + variation);
    return [key, clamp(attributes[key] + delta, 15, 99)];
  })) as PlayerAttributes;
}

function evolvePlayerAttributes(
  attributes: PlayerAttributes,
  positionKey: PositionKey,
  development: number,
  age: number,
  seed: number,
  season: number,
): PlayerAttributes {
  const primary = new Set(POSITION_PRIMARY_ATTRIBUTES[positionKey]);
  const physical = new Set<AttributeKey>(["pace", "acceleration", "strength", "stamina"]);
  return Object.fromEntries(ALL_ATTRIBUTE_KEYS.map((key, index) => {
    let delta = development === 0
      ? (seeded(seed, season * 401 + index * 23) > 0.91 ? 1 : 0)
      : Math.sign(development) * Math.max(1, Math.round(Math.abs(development) * (primary.has(key) ? 1 : 0.55)));
    if (age >= 32 && physical.has(key)) delta -= age >= 35 ? 2 : 1;
    if (age >= 34 && (key === "vision" || key === "composure" || key === "positioning")) delta = Math.max(delta, 0);
    return [key, clamp(attributes[key] + delta, 15, 99)];
  })) as PlayerAttributes;
}

function initialState(seedOverride?: number): GameState {
  const seed = seedOverride ?? Date.now() % 2147483647;
  return {
    version: 7,
    phase: "welcome",
    seed,
    name: "",
    number: 10,
    foot: "Direita",
    position: "MEI",
    nationality: "brasil",
    academyCountryId: "brasil",
    academyClubId: "",
    formationId: "",
    archetype: "",
    playerStoryId: "open-book",
    storyFlags: [],
    storyLog: [],
    pendingStoryDecision: null,
    revealAge: 18,
    youthScore: 0,
    youthYears: [],
    proOffers: [],
    currentClubId: "",
    currentLeagueId: "",
    age: 12,
    season: 2026,
    overall: 42,
    potential: 78,
    attributes: createPlayerAttributes("MEI", 42, seed),
    morale: 76,
    fitness: 92,
    reputation: 0,
    leadership: 10,
    money: 0,
    spendableMoney: 0,
    nationalLevel: 0,
    fanSupport: 55,
    managerTrust: 48,
    discipline: 72,
    disciplineHistoryReliable: true,
    suspensionMatches: 0,
    squadRole: "promessa",
    clubCaptain: false,
    contractYears: 0,
    annualSalary: 0,
    currentObjective: null,
    objectivesCompleted: 0,
    objectivesFailed: 0,
    stats: { ...EMPTY_STATS },
    trophies: 0,
    trophyCabinet: {
      domesticLeague: 0,
      domesticCup: 0,
      domesticSuperCup: 0,
      libertadores: 0,
      recopaSudamericana: 0,
      mundial: 0,
      championsLeague: 0,
      uefaSuperCup: 0,
      europaLeague: 0,
      conferenceLeague: 0,
      concacafChampions: 0,
      afcChampions: 0,
      campeonesCup: 0,
    },
    awards: 0,
    awardCabinet: {},
    setbacks: 0,
    luckyBreaks: 0,
    continentalSlot: null,
    worldQualifiedSeason: 0,
    worldQualifiedClubId: "",
    adaptation: 100,
    abroadSeasons: 0,
    nationalCategory: "none",
    nationalCaps: 0,
    nationalGoals: 0,
    nationalAssists: 0,
    nationalCaptain: false,
    nationalTrophies: 0,
    nationalHistory: [],
    qualifiedNextMajor: true,
    currentEventId: FIRST_MATCH_EVENT.id,
    nextEventId: "",
    seenEvents: [],
    history: [],
    lastResult: null,
    lastConsequence: null,
    pendingBotaoMatches: [],
    lastBotaoResult: null,
    pendingPressConference: null,
    retireAfterSeason: false,
    retirementReturnPhase: "career",
    transferOffers: [],
    transferRequests: 0,
    transferCooldownSeason: 0,
    positionChangeCooldownSeason: 0,
    transferStatus: null,
    transferRequested: false,
    renewalDenied: false,
    forcedClubExit: false,
    forcedAlternativeTransfer: false,
    pendingTransferMode: "permanent",
    loanParentClubId: "",
    loanParentLeagueId: "",
    loanEndSeason: 0,
    isFreeAgent: false,
    freeAgentSinceSeason: 0,
    forcedFreeAgentUntilSeason: 0,
    corruptionGuaranteedSeason: 0,
    traits: [],
    rivals: [],
    followers: 0,
    socialSentiment: 62,
    mediaRelation: 52,
    lifeBalance: 76,
    charityReputation: 0,
    activeSponsor: null,
    sponsorHistory: [],
    socialFeed: [],
    offFieldMilestones: [],
    nationalitySwitched: false,
    nationalitySwitchInviteUsed: false,
    pendingNationalitySwitchTarget: "",
    legacyPoints: 0,
    unlockedAchievements: [],
    economyPurchases: [],
    newsFeed: [],
    medicalHistory: [],
    injuryFreeSeasons: 0,
    matchesMissedInjuries: 0,
    challengeId: "",
    challengeDate: "",
  };
}

function normalizeSave(value: unknown): GameState {
  const base = initialState();
  if (!value || typeof value !== "object") return base;
  const saved = value as Partial<GameState> & {
    version?: number;
    history?: Array<Partial<SeasonRecord>>;
    libertadoresQualified?: boolean;
    trophyCabinet?: Partial<Record<string, number>>;
  };
  const oldDomesticLeague = saved.trophyCabinet?.domesticLeague ?? saved.trophyCabinet?.brasileirao ?? saved.trophies ?? 0;
  const oldDomesticCup = saved.trophyCabinet?.domesticCup ?? saved.trophyCabinet?.copaBrasil ?? 0;
  const continentalSlot: ContinentalSlot | null =
    saved.continentalSlot !== undefined
      ? (saved.continentalSlot as ContinentalSlot | null)
      : saved.libertadoresQualified
        ? "libertadores"
        : null;
  return {
    ...base,
    ...saved,
    version: 7,
    phase:
      saved.phase === "botao-final" && !(saved.pendingBotaoMatches?.length)
        ? "season-result"
        : saved.phase ?? base.phase,
    nationality: saved.nationality ?? "brasil",
    academyCountryId: saved.academyCountryId ?? saved.nationality ?? "brasil",
    playerStoryId: saved.playerStoryId ?? "open-book",
    storyFlags: Array.isArray(saved.storyFlags) ? saved.storyFlags : [],
    storyLog: Array.isArray(saved.storyLog) ? saved.storyLog : [],
    pendingStoryDecision:
      saved.pendingStoryDecision &&
      !(saved.storyLog ?? []).some((entry) => entry.title === saved.pendingStoryDecision?.title)
        ? saved.pendingStoryDecision
        : null,
    currentLeagueId: saved.currentLeagueId ?? (saved.currentClubId ? clubById(saved.currentClubId).leagueId : ""),
    continentalSlot,
    adaptation: saved.adaptation ?? 100,
    abroadSeasons: saved.abroadSeasons ?? 0,
    nationalCategory: saved.nationalCategory ?? "none",
    nationalCaps: saved.nationalCaps ?? 0,
    nationalGoals: saved.nationalGoals ?? 0,
    nationalAssists: saved.nationalAssists ?? 0,
    nationalCaptain: saved.nationalCaptain ?? false,
    nationalTrophies: saved.nationalTrophies ?? 0,
    nationalHistory: saved.nationalHistory ?? [],
    qualifiedNextMajor: saved.qualifiedNextMajor ?? true,
    renewalDenied: saved.renewalDenied ?? false,
    forcedClubExit: saved.forcedClubExit ?? false,
    forcedAlternativeTransfer: saved.forcedAlternativeTransfer ?? false,
    pendingTransferMode: saved.pendingTransferMode ?? "permanent",
    loanParentClubId: saved.loanParentClubId ?? "",
    loanParentLeagueId: saved.loanParentLeagueId ?? "",
    loanEndSeason: saved.loanEndSeason ?? 0,
    isFreeAgent: saved.isFreeAgent ?? false,
    freeAgentSinceSeason: saved.freeAgentSinceSeason ?? 0,
    forcedFreeAgentUntilSeason: saved.forcedFreeAgentUntilSeason ?? 0,
    corruptionGuaranteedSeason: saved.corruptionGuaranteedSeason ?? 0,
    spendableMoney: saved.spendableMoney ?? Math.min(saved.money ?? 0, Math.round((saved.money ?? 0) * 0.12)),
    traits: Array.isArray(saved.traits) && saved.traits.length
      ? saved.traits.filter((trait): trait is SpecialTraitId => trait in SPECIAL_TRAITS)
      : saved.currentClubId
        ? selectCareerTraits(saved.position ?? base.position, saved.seed ?? base.seed)
        : [],
    rivals: Array.isArray(saved.rivals) ? saved.rivals.map((rival, index) => ({
      id: rival.id ?? `legacy-rival-${index}`,
      name: rival.name ?? FICTIONAL_FINALISTS[index % FICTIONAL_FINALISTS.length],
      position: rival.position ?? "MEI",
      nationality: rival.nationality ?? "brasil",
      age: rival.age ?? saved.age ?? 18,
      overall: rival.overall ?? Math.max(58, (saved.overall ?? 65) - 2),
      currentClubId: rival.currentClubId ?? saved.currentClubId ?? "",
      appearances: rival.appearances ?? 0,
      goals: rival.goals ?? 0,
      assists: rival.assists ?? 0,
      awards: rival.awards ?? 0,
      relationship: rival.relationship ?? 50,
      custom: rival.custom ?? false,
      active: rival.active ?? true,
    })) : saved.currentClubId
      ? createCareerRivals(saved.seed ?? base.seed, saved.age ?? 18, saved.overall ?? 60, [])
      : [],
    followers: saved.followers ?? (saved.currentClubId ? Math.max(2_500, (saved.reputation ?? 0) * 12_000 + (saved.stats?.goals ?? 0) * 1_200) : 0),
    socialSentiment: saved.socialSentiment ?? 62,
    mediaRelation: saved.mediaRelation ?? 52,
    lifeBalance: saved.lifeBalance ?? 76,
    charityReputation: saved.charityReputation ?? 0,
    activeSponsor: saved.activeSponsor ?? null,
    sponsorHistory: Array.isArray(saved.sponsorHistory) ? saved.sponsorHistory : [],
    socialFeed: Array.isArray(saved.socialFeed) ? saved.socialFeed.slice(0, 24) : [],
    offFieldMilestones: Array.isArray(saved.offFieldMilestones) ? saved.offFieldMilestones : [],
    nationalitySwitched: saved.nationalitySwitched ?? false,
    nationalitySwitchInviteUsed: saved.nationalitySwitchInviteUsed ?? false,
    pendingNationalitySwitchTarget: saved.pendingNationalitySwitchTarget ?? "",
    pendingBotaoMatches: Array.isArray(saved.pendingBotaoMatches) ? saved.pendingBotaoMatches : [],
    lastBotaoResult: saved.lastBotaoResult ?? null,
    pendingPressConference: saved.pendingPressConference ?? null,
    stats: {
      appearances: saved.stats?.appearances ?? 0,
      goals: saved.stats?.goals ?? 0,
      assists: saved.stats?.assists ?? 0,
      tackles: saved.stats?.tackles ?? 0,
      cleanSheets: saved.stats?.cleanSheets ?? 0,
      goalsConceded: saved.stats?.goalsConceded ?? 0,
      yellowCards: saved.stats?.yellowCards ?? 0,
      redCards: saved.stats?.redCards ?? 0,
    },
    managerTrust: saved.managerTrust ?? 48,
    positionChangeCooldownSeason: saved.positionChangeCooldownSeason ?? 0,
    discipline: saved.discipline ?? 72,
    disciplineHistoryReliable: saved.disciplineHistoryReliable ?? Number(saved.version) >= 5,
    suspensionMatches: saved.suspensionMatches ?? 0,
    squadRole: saved.squadRole ?? (saved.age && saved.age > 25 ? "rotacao" : "promessa"),
    clubCaptain: saved.clubCaptain ?? false,
    contractYears: saved.contractYears ?? 2,
    annualSalary: saved.annualSalary ?? 60_000,
    currentObjective: saved.currentObjective ?? (
      saved.currentClubId
        ? createSeasonObjective(
            positionByKey(saved.position ?? base.position),
            saved.squadRole ?? (saved.age && saved.age > 25 ? "rotacao" : "promessa"),
            saved.season ?? base.season,
            saved.seed ?? base.seed,
          )
        : null
    ),
    objectivesCompleted: saved.objectivesCompleted ?? 0,
    objectivesFailed: saved.objectivesFailed ?? 0,
    legacyPoints: saved.legacyPoints ?? 0,
    unlockedAchievements: saved.unlockedAchievements ?? [],
    economyPurchases: saved.economyPurchases ?? [],
    newsFeed: saved.newsFeed ?? [],
    medicalHistory: Array.isArray(saved.medicalHistory) ? saved.medicalHistory : [],
    injuryFreeSeasons: saved.injuryFreeSeasons ?? 0,
    matchesMissedInjuries: saved.matchesMissedInjuries ?? 0,
    challengeId: saved.challengeId ?? "",
    challengeDate: saved.challengeDate ?? "",
    attributes: saved.attributes ?? createPlayerAttributes(
      saved.position ?? base.position,
      saved.overall ?? base.overall,
      saved.seed ?? base.seed,
    ),
    trophyCabinet: {
      domesticLeague: oldDomesticLeague,
      domesticCup: oldDomesticCup,
      domesticSuperCup: saved.trophyCabinet?.domesticSuperCup ?? 0,
      libertadores: saved.trophyCabinet?.libertadores ?? 0,
      recopaSudamericana: saved.trophyCabinet?.recopaSudamericana ?? 0,
      mundial: saved.trophyCabinet?.mundial ?? 0,
      championsLeague: saved.trophyCabinet?.championsLeague ?? 0,
      uefaSuperCup: saved.trophyCabinet?.uefaSuperCup ?? 0,
      europaLeague: saved.trophyCabinet?.europaLeague ?? 0,
      conferenceLeague: saved.trophyCabinet?.conferenceLeague ?? 0,
      concacafChampions: saved.trophyCabinet?.concacafChampions ?? 0,
      afcChampions: saved.trophyCabinet?.afcChampions ?? 0,
      campeonesCup: saved.trophyCabinet?.campeonesCup ?? 0,
    },
    awardCabinet: { ...base.awardCabinet, ...saved.awardCabinet },
    history: (saved.history ?? []).map((record) => ({
      appearances: record.appearances ?? 0,
      goals: record.goals ?? 0,
      assists: record.assists ?? 0,
      tackles: record.tackles ?? 0,
      cleanSheets: record.cleanSheets ?? 0,
      goalsConceded: record.goalsConceded ?? 0,
      yellowCards: record.yellowCards ?? 0,
      redCards: record.redCards ?? 0,
      age: record.age ?? 0,
      season: record.season ?? 0,
      clubId: record.clubId ?? "",
      leagueId: record.leagueId ?? (record.clubId ? clubById(record.clubId).leagueId : ""),
      position: record.position ?? saved.position ?? base.position,
      overall: record.overall ?? 0,
      title: record.title ?? false,
      eventTitle: record.eventTitle ?? "",
      competitions: record.competitions ?? [],
      awards: record.awards ?? [],
      awardNominations: record.awardNominations ?? (record.awards ?? [])
        .filter((award) => awardPresentation(award).tier !== "regular")
        .map((award) => ({ award, won: true, winner: saved.name || "Você" })),
      squadRole: record.squadRole ?? "rotacao",
      objectiveResult: record.objectiveResult ?? null,
      performanceScore: record.performanceScore ?? 0,
      marketValue: record.marketValue ?? 0,
      development: record.development ?? 0,
      followers: record.followers ?? 0,
      socialSentiment: record.socialSentiment ?? 50,
      botaoResults: Array.isArray(record.botaoResults) ? record.botaoResults : [],
      promotion: record.promotion ?? null,
      averageRating: record.averageRating,
      manOfTheMatchAwards: record.manOfTheMatchAwards ?? 0,
      medicalRecord: record.medicalRecord ?? null,
    })),
    lastResult: saved.lastResult ? {
      ...saved.lastResult,
      position: saved.lastResult.position ?? saved.position ?? base.position,
      competitions: saved.lastResult.competitions ?? [],
      awards: saved.lastResult.awards ?? [],
      awardNominations: saved.lastResult.awardNominations ?? (saved.lastResult.awards ?? [])
        .filter((award) => awardPresentation(award).tier !== "regular")
        .map((award) => ({ award, won: true, winner: saved.name || "Você" })),
      twist: saved.lastResult.twist ?? null,
      nationalNote: saved.lastResult.nationalNote ?? null,
      yellowCards: saved.lastResult.yellowCards ?? 0,
      redCards: saved.lastResult.redCards ?? 0,
      squadRole: saved.lastResult.squadRole ?? "rotacao",
      objectiveResult: saved.lastResult.objectiveResult ?? null,
      botaoResults: Array.isArray(saved.lastResult.botaoResults) ? saved.lastResult.botaoResults : [],
      promotion: saved.lastResult.promotion ?? null,
      performanceScore: saved.lastResult.performanceScore ?? 0,
      europeanSpotlight: saved.lastResult.europeanSpotlight ?? 0,
      europeanDevelopmentBonus: saved.lastResult.europeanDevelopmentBonus ?? 0,
      breakoutBonus: saved.lastResult.breakoutBonus ?? 0,
    } : null,
    lastConsequence: saved.lastConsequence ? {
      ...saved.lastConsequence,
      luckOutcome: saved.lastConsequence.luckOutcome ?? null,
    } : null,
  };
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function seeded(seed: number, salt = 0) {
  let value = (seed + salt * 2654435761) >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(items: T[], seed: number, salt = 0): T {
  return items[Math.floor(seeded(seed, salt) * items.length) % items.length];
}

function randomPlayerName(seed: number, salt = 0) {
  const first = pick(RANDOM_NAME_FIRST_PART, seed, 901 + salt);
  const last = pick(RANDOM_NAME_LAST_PART, seed, 967 + salt);
  return `${first} ${last}`;
}

function clubById(id: string) {
  return CLUBS.find((club) => club.id === id) ?? CLUBS[0];
}

function selectCareerTraits(position: PositionKey, seed: number) {
  const pool = TRAITS_BY_POSITION[position];
  const first = pick(pool, seed, 1801);
  const getsSecond = seeded(seed, 1811) < 0.34;
  const secondPool = pool.filter((trait) => trait !== first);
  return getsSecond ? [first, pick(secondPool, seed, 1823)] : [first];
}

function createCareerRivals(seed: number, playerAge: number, playerOverall: number, customCharacters: CustomCharacter[]) {
  if (seeded(seed, 1901) < 0.25) return [];
  const builtInCount = 1 + Math.floor(seeded(seed, 1907) * 2);
  const builtIns = RIVAL_PROFILES
    .map((profile, index) => ({ profile, order: seeded(seed, 1913 + index * 23) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, builtInCount)
    .map(({ profile }, index): CareerRival => {
      const clubPool = CLUBS.filter((club) => club.countryId === profile.nationality || club.reputation <= 3);
      const club = pick(clubPool.length ? clubPool : CLUBS, seed, 1931 + index * 31);
      return {
        id: `rival-${seed}-${index}`,
        name: profile.name,
        position: profile.position,
        nationality: profile.nationality,
        age: Math.max(16, playerAge + Math.floor(seeded(seed, 1949 + index) * 5) - 2),
        overall: clamp(playerOverall + Math.floor(seeded(seed, 1951 + index) * 8) - 1, 54, 84),
        currentClubId: club.id,
        appearances: 0,
        goals: 0,
        assists: 0,
        awards: 0,
        relationship: 50,
        custom: false,
        active: true,
      };
    });
  const customRivals = customCharacters
    .filter((_, index) => seeded(seed, 1973 + index * 37) < 0.32)
    .slice(0, Math.max(0, 3 - builtIns.length))
    .map((character, index): CareerRival => {
      const club = pick(CLUBS.filter((item) => item.reputation <= 3), seed, 1993 + index * 29);
      return {
        id: `custom-${character.id}-${seed}`,
        name: character.name,
        position: character.position,
        nationality: pick(COUNTRIES, seed, 1999 + index * 41).id,
        age: Math.max(16, playerAge + Math.floor(seeded(seed, 2003 + index) * 5) - 2),
        overall: clamp(playerOverall + Math.floor(seeded(seed, 2011 + index) * 8) - 1, 54, 84),
        currentClubId: club.id,
        appearances: 0,
        goals: 0,
        assists: 0,
        awards: 0,
        relationship: 50,
        custom: true,
        active: true,
      };
    });
  return [...builtIns, ...customRivals];
}

function evolveRivals(rivals: CareerRival[], seed: number, season: number) {
  return rivals.map((rival, index) => {
    if (!rival.active) return rival;
    const position = positionByKey(rival.position);
    const age = rival.age + 1;
    const development = age <= 22
      ? (seeded(seed, season * 251 + index) > 0.32 ? 3 : 2)
      : age <= 27
        ? (seeded(seed, season * 257 + index) > 0.38 ? 2 : 1)
        : age <= 30
          ? (seeded(seed, season * 259 + index) > 0.62 ? 1 : 0)
          : age >= 34 ? -1 : 0;
    const overall = clamp(rival.overall + development, 48, 96);
    const appearances = clamp(Math.round(27 + (overall - 65) * 0.62 + seeded(seed, season * 263 + index) * 12), 10, 49);
    const quality = clamp((overall - 48) / 29, 0.5, 1.62);
    const goals = rival.position === "GOL" ? 0 : Math.round(appearances * position.goals * quality * (0.92 + seeded(seed, season * 269 + index) * 0.76));
    const assists = rival.position === "GOL" ? Math.round(seeded(seed, season * 271 + index) * 2) : Math.round(appearances * position.assists * quality * (0.92 + seeded(seed, season * 277 + index) * 0.76));
    const changesClub = seeded(seed, season * 281 + index * 13) < (overall >= 82 ? 0.24 : 0.16);
    const transferPool = CLUBS.filter((club) =>
      club.id !== rival.currentClubId &&
      Math.abs(competitiveStrength(club) - (overall + 2)) < 12 &&
      (overall < 82 || club.reputation >= 4),
    );
    const currentClubId = changesClub && transferPool.length ? pick(transferPool, seed, season * 283 + index).id : rival.currentClubId;
    return {
      ...rival,
      age,
      overall,
      currentClubId,
      appearances: rival.appearances + appearances,
      goals: rival.goals + goals,
      assists: rival.assists + assists,
      awards: rival.awards + (overall >= 83 && goals + assists >= 16 && seeded(seed, season * 293 + index) > 0.54 ? 1 : 0),
      active: age < 39 && overall >= 50,
      relationship: clamp(rival.relationship + Math.round((seeded(seed, season * 307 + index) - 0.5) * 6)),
    };
  });
}

function awardFinalists(playerName: string, award: string, seed: number, season: number, careerRivals: CareerRival[] = []) {
  const isGlobalAward = award === "Bola de Ouro" || award === "FIFPRO World XI" || award === "Chuteira de Ouro Europeia";
  const rivalNames = Array.from(new Set([
    ...careerRivals
      .filter((rival) => rival.active && (!isGlobalAward || (rival.overall >= 81 && clubById(rival.currentClubId).reputation >= 4)))
      .map((rival) => rival.name),
    ...FICTIONAL_FINALISTS,
  ]));
  const rivals = rivalNames
    .map((name, index) => ({ name, order: seeded(seed, season * 101 + award.length * 17 + index * 43) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 2)
    .map(({ name }) => name);
  return [playerName || "Você", ...rivals]
    .map((name, index) => ({ name, order: seeded(seed, season * 211 + award.length * 31 + index * 71) }))
    .sort((a, b) => a.order - b.order)
    .map(({ name }) => name);
}

function fictionalAwardWinner(playerName: string, award: string, seed: number, season: number, careerRivals: CareerRival[] = []) {
  return awardFinalists(playerName, award, seed, season, careerRivals).find((name) => name !== playerName) ?? FICTIONAL_FINALISTS[0];
}

function careerHallEntry(game: GameState): CareerHallEntry {
  const peakOverall = Math.max(game.overall, ...game.history.map((item) => item.overall), 0);
  return {
    id: `${game.seed}-${game.name}-${game.history.length}`,
    name: game.name || "Sem nome",
    position: game.position,
    nationality: game.nationality,
    finalClubId: game.currentClubId,
    seasons: game.history.length,
    peakOverall,
    legacyPoints: game.legacyPoints,
    legacyLabel: legacyTier(game.legacyPoints).label,
    trophies: game.trophies + game.nationalTrophies,
    awards: game.awards,
    ballonDor: game.awardCabinet["Bola de Ouro"] ?? 0,
    appearances: game.stats.appearances,
    goals: game.stats.goals,
    assists: game.stats.assists,
    finishedAt: Date.now(),
    snapshot: { ...game, phase: "summary" },
  };
}

function archivedCareerState(entry: CareerHallEntry): { state: GameState; legacyArchive: boolean } {
  if (entry.snapshot) {
    return {
      state: { ...normalizeSave(entry.snapshot), phase: "summary", retireAfterSeason: true },
      legacyArchive: false,
    };
  }

  const base = initialState();
  const seasons = Math.max(1, entry.seasons);
  const appearances = entry.appearances ?? seasons * 28;
  const awardCabinet: Record<string, number> = {};
  if (entry.ballonDor > 0) awardCabinet["Bola de Ouro"] = entry.ballonDor;
  if (entry.awards > entry.ballonDor) awardCabinet["Prêmios do arquivo antigo"] = entry.awards - entry.ballonDor;
  const share = (total: number, index: number) =>
    Math.floor(total / seasons) + (index < total % seasons ? 1 : 0);
  const history: SeasonRecord[] = Array.from({ length: seasons }, (_, index) => {
    const titles = share(entry.trophies, index);
    return {
      age: 18 + index,
      season: 2026 + index,
      clubId: entry.finalClubId,
      position: entry.position,
      overall: entry.peakOverall,
      appearances: share(appearances, index),
      goals: share(entry.goals, index),
      assists: share(entry.assists, index),
      tackles: 0,
      cleanSheets: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      title: titles > 0,
      eventTitle: "Registro recuperado do Hall da Fama",
      competitions: Array.from({ length: titles }, (_, titleIndex) => ({
        id: "domesticLeague" as CompetitionId,
        name: `Título histórico ${titleIndex + 1}`,
        icon: "★",
        stage: "CAMPEÃO",
        champion: true,
      })),
      awards: [],
      awardNominations: [],
      squadRole: "estrela",
      objectiveResult: null,
      performanceScore: 70,
      marketValue: 0,
      development: 0,
    };
  });
  return {
    legacyArchive: true,
    state: {
      ...base,
      phase: "summary",
      seed: Number(entry.id.split("-")[0]) || base.seed,
      name: entry.name,
      position: entry.position,
      nationality: entry.nationality,
      currentClubId: entry.finalClubId,
      academyClubId: entry.finalClubId,
      archetype: "Carreira histórica",
      age: 18 + seasons,
      season: 2026 + seasons,
      overall: entry.peakOverall,
      potential: entry.peakOverall,
      attributes: createPlayerAttributes(entry.position, entry.peakOverall, base.seed),
      stats: {
        appearances,
        goals: entry.goals,
        assists: entry.assists,
        tackles: 0,
        cleanSheets: 0,
        goalsConceded: 0,
        yellowCards: 0,
        redCards: 0,
      },
      trophies: entry.trophies,
      awards: entry.awards,
      awardCabinet,
      history,
      legacyPoints: entry.legacyPoints,
      retireAfterSeason: true,
    },
  };
}

function randomClubSelection(pool: Club[], count: number, seed: number, salt: number, excludedIds: string[] = []) {
  return pool
    .filter((club) => !excludedIds.includes(club.id))
    .map((club, index) => ({ club, order: seeded(seed, salt + index * 37 + CLUBS.indexOf(club) * 11) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, count)
    .map(({ club }) => club);
}

const REGIONAL_ACADEMY_ROUTES: Record<string, string[]> = {
  bolivia: ["argentina", "chile", "peru"],
  venezuela: ["colombia", "equador"],
  canada: ["eua"],
  "costa-rica": ["eua", "mexico"],
  jamaica: ["eua", "mexico"],
  panama: ["eua", "mexico"],
  croacia: ["italia", "alemanha"],
  dinamarca: ["alemanha", "holanda"],
  noruega: ["alemanha", "holanda"],
  suecia: ["alemanha", "holanda"],
  polonia: ["alemanha"],
  servia: ["italia", "alemanha"],
  ucrania: ["alemanha", "italia"],
  "republica-tcheca": ["alemanha"],
  "pais-de-gales": ["inglaterra"],
  irlanda: ["inglaterra"],
  grecia: ["italia"],
  romenia: ["italia", "alemanha"],
  hungria: ["alemanha", "italia"],
  islandia: ["holanda", "inglaterra"],
  georgia: ["alemanha", "italia"],
  albania: ["italia"],
  bosnia: ["italia", "alemanha"],
  bulgaria: ["turquia", "italia"],
  finlandia: ["alemanha", "holanda"],
  israel: ["turquia"],
  kosovo: ["alemanha", "italia"],
  montenegro: ["italia"],
  "macedonia-do-norte": ["turquia", "italia"],
  "irlanda-do-norte": ["inglaterra", "escocia"],
  eslovaquia: ["alemanha", "austria"],
  eslovenia: ["italia", "austria"],
  chipre: ["turquia", "grecia"],
  "el-salvador": ["mexico", "eua"],
  guatemala: ["mexico", "eua"],
  honduras: ["mexico", "eua"],
  haiti: ["eua", "mexico"],
  "trinidad-e-tobago": ["eua", "mexico"],
  curacao: ["holanda", "eua"],
  "emirados-arabes": ["arabia-saudita"],
  jordania: ["arabia-saudita"],
  oma: ["arabia-saudita"],
  bahrein: ["arabia-saudita"],
  kuwait: ["arabia-saudita"],
  tailandia: ["japao", "coreia-do-sul"],
  vietna: ["japao", "coreia-do-sul"],
  indonesia: ["japao", "coreia-do-sul"],
  india: ["arabia-saudita", "japao"],
  "coreia-do-norte": ["coreia-do-sul", "china"],
  angola: ["portugal", "franca"],
  "burkina-faso": ["franca"],
  "cabo-verde": ["portugal"],
  "congo-rd": ["franca", "belgica"],
  gabao: ["franca"],
  guine: ["franca", "portugal"],
  zambia: ["franca", "portugal"],
  zimbabue: ["franca", "portugal"],
  mocambique: ["portugal"],
  fiji: ["japao", "eua"],
  "ilhas-salomao": ["japao", "eua"],
  taiti: ["franca", "eua"],
};

const PLAYABLE_ACADEMY_COUNTRIES = Array.from(new Set(LEAGUES.map((league) => league.countryId)));

const CONFEDERATION_ACADEMY_ROUTES: Record<Country["confederation"], string[]> = {
  SOUTH_AMERICA: ["argentina", "brasil", "colombia", "uruguai", "chile"],
  NORTH_AMERICA: ["eua", "mexico"],
  EUROPE: ["franca", "alemanha", "portugal", "italia", "inglaterra"],
  ASIA: ["japao", "coreia-do-sul", "arabia-saudita", "china"],
  AFRICA: ["franca", "portugal", "belgica"],
  OCEANIA: ["japao", "eua"],
};

function sortedCountries(countries: Country[]) {
  return [...countries].sort((a, b) => {
    if (a.id === "brasil") return -1;
    if (b.id === "brasil") return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function defaultAcademyCountry(countryId: string) {
  if (PLAYABLE_ACADEMY_COUNTRIES.includes(countryId)) return countryId;
  const regionalCountries = REGIONAL_ACADEMY_ROUTES[countryId] ?? [];
  const confederationCountries = CONFEDERATION_ACADEMY_ROUTES[countryById(countryId).confederation] ?? [];
  return [...regionalCountries, ...confederationCountries]
    .find((candidate) => PLAYABLE_ACADEMY_COUNTRIES.includes(candidate)) ?? "franca";
}

function academyClubPool(countryId: string) {
  const localClubs = CLUBS.filter((club) => club.countryId === countryId);
  if (localClubs.length >= 4) return localClubs;
  const regionalCountries = REGIONAL_ACADEMY_ROUTES[countryId] ?? [];
  if (regionalCountries.length) {
    return CLUBS.filter((club) =>
      regionalCountries.includes(club.countryId) &&
      club.reputation <= 3 &&
      club.strength <= 78,
    );
  }
  return CLUBS.filter((club) =>
    countryById(club.countryId).confederation === "EUROPE" &&
    club.reputation <= 3 &&
    club.strength <= 78,
  );
}

function hasLocalAcademyRoute(countryId: string) {
  return PLAYABLE_ACADEMY_COUNTRIES.includes(countryId);
}

function randomAcademyClubs(seed: number, countryId: string) {
  return randomClubSelection(academyClubPool(countryId), 4, seed, 1709 + countryId.length * 41);
}

function academyRouteCopy(academyCountryId: string, nationalityId: string) {
  const academyCountry = countryById(academyCountryId);
  const nationality = countryById(nationalityId);
  if (academyCountryId === nationalityId) {
    return {
      label: `BASE NACIONAL · ${academyCountry.abbr}`,
      title: `Seu futebol começa em ${academyCountry.name}`,
      text: `As quatro portas sorteadas pertencem à liga de ${academyCountry.name}. Você cresce perto da sua cultura antes de decidir se quer cruzar fronteiras.`,
    };
  }
  const recommendedCountryId = defaultAcademyCountry(nationalityId);
  const isRecommendedRoute = academyCountryId === recommendedCountryId;
  return {
    label: `${isRecommendedRoute ? "ROTA RECOMENDADA" : "ROTA INTERNACIONAL"} · ${academyCountry.abbr}`,
    title: isRecommendedRoute ? "Uma liga próxima abriu a porta" : `Novo capítulo: ${academyCountry.name}`,
    text: `${nationality.name} não tem liga jogável no momento. Sua formação acontece no futebol de ${academyCountry.name}, mas a Seleção e a identidade da carreira continuam sendo de ${nationality.name}.`,
  };
}

function continentalNationalTournament(country: Country) {
  if (country.confederation === "EUROPE") return "Eurocopa";
  if (country.confederation === "NORTH_AMERICA") return "Copa Ouro";
  if (country.confederation === "ASIA") return "Copa da Ásia";
  if (country.confederation === "AFRICA") return "Copa Africana";
  if (country.confederation === "OCEANIA") return "Copa das Nações da OFC";
  return "Copa América";
}

function revelationOfferPool(state: GameState) {
  if (hasLocalAcademyRoute(state.academyCountryId)) return academyClubPool(state.academyCountryId);
  const academyCountryId = clubById(state.academyClubId).countryId;
  const sameCountry = CLUBS.filter((club) => club.countryId === academyCountryId && club.reputation <= 4);
  const routePool = academyClubPool(state.academyCountryId);
  return Array.from(new Map([...sameCountry, ...routePool].map((club) => [club.id, club])).values());
}

function isOutsideCountry(club: Club, countryId: string) {
  return club.countryId !== countryId;
}

function isOutsideAcademyHome(state: Pick<GameState, "academyCountryId">, club: Club) {
  return isOutsideCountry(club, state.academyCountryId);
}

function clubConfederation(club: Club) {
  return countryById(club.countryId).confederation;
}

const DOMESTIC_SUPER_CUP_NAMES: Record<string, string> = {
  brasileirao: "Supercopa Rei",
  premier: "FA Community Shield",
  laliga: "Supercopa da Espanha",
  seriea: "Supercoppa Italiana",
  bundesliga: "DFL-Supercup",
  ligue1: "Trophée des Champions",
  primeira: "Supertaça Cândido de Oliveira",
  eredivisie: "Johan Cruyff Shield",
  "liga-argentina": "Trofeo de Campeones",
  "liga-uruguaia": "Supercopa Uruguaya",
  "liga-chilena": "Supercopa de Chile",
  "liga-colombiana": "Superliga Colombiana",
  "liga-paraguaia": "Supercopa Paraguay",
  "liga-equatoriana": "Supercopa Ecuador",
  "liga-peruana": "Supercopa Peruana",
  "liga-mx": "Campeón de Campeones",
  proleague: "Supercopa da Bélgica",
  superlig: "Supercopa da Turquia",
  "saudi-pro-league": "Supercopa da Arábia Saudita",
  "j1-league": "Supercopa do Japão",
  "k-league": "Supercopa da Coreia",
  csl: "Supercopa da China",
};

function isEuropeanClub(club: Club) {
  return clubConfederation(club) === "EUROPE";
}

function initialContinentalSlot(club: Club): ContinentalSlot | null {
  if (club.leagueId === "brasileirao-b" || club.leagueId === "championship") return null;
  const confederation = clubConfederation(club);
  if (confederation === "SOUTH_AMERICA") return club.reputation >= 4 ? "libertadores" : null;
  if (confederation === "NORTH_AMERICA") return club.reputation >= 4 ? "concacaf" : null;
  if (confederation === "ASIA") return club.reputation >= 4 ? "asian" : null;
  // Só a Europa entra nas competições da UEFA. Antes qualquer confederação sem
  // caso próprio caía aqui, e clube asiático de reputação alta ganhava Champions.
  if (confederation !== "EUROPE") return null;
  if (club.reputation >= 5) return "champions";
  if (club.reputation >= 4) return "europa";
  return null;
}

// Proximidade geográfica: destinos do mesmo continente do clube atual aparecem com muito mais frequência.
function regionAffinity(originCountryId: string, club: Club) {
  if (club.countryId === originCountryId) return -12;
  const originConfederation = countryById(originCountryId).confederation;
  const targetConfederation = clubConfederation(club);
  if (originConfederation === "SOUTH_AMERICA") {
    if (targetConfederation === "SOUTH_AMERICA") return -3;
    if (targetConfederation === "NORTH_AMERICA") return -1;
    return 0;
  }
  if (originConfederation === "NORTH_AMERICA") {
    if (targetConfederation === "NORTH_AMERICA") return -3;
    if (targetConfederation === "SOUTH_AMERICA") return -1;
    return 0;
  }
  if (originConfederation === targetConfederation) return -2;
  return 1;
}

function initialAdaptation(originCountryId: string, destinationCountryId: string) {
  if (originCountryId === destinationCountryId) return 100;
  const originConfederation = countryById(originCountryId).confederation;
  const destinationConfederation = countryById(destinationCountryId).confederation;
  if (originConfederation === destinationConfederation) return 72;
  if (
    (originConfederation === "SOUTH_AMERICA" && destinationConfederation === "NORTH_AMERICA") ||
    (originConfederation === "NORTH_AMERICA" && destinationConfederation === "SOUTH_AMERICA")
  ) return 56;
  if (
    (originCountryId === "brasil" && destinationCountryId === "portugal") ||
    (originCountryId === "portugal" && destinationCountryId === "brasil")
  ) return 62;
  if (destinationCountryId === "espanha" && originConfederation === "SOUTH_AMERICA") return 58;
  return 34;
}

function foreignEligible(state: GameState, club: Club, originCountryId: string) {
  if (!isOutsideCountry(club, originCountryId)) return false;
  if (state.age > 38) return false;
  const league = leagueById(club.leagueId);
  const confederation = clubConfederation(club);
  let requirement = 58 + league.prestige * 5 + club.reputation * 3 - Math.min(10, state.reputation / 12) - Math.min(6, state.nationalLevel / 18);
  if (confederation === "SOUTH_AMERICA") requirement -= 6;
  if (confederation === "NORTH_AMERICA") requirement -= state.age >= 29 ? 10 : 4;
  if (state.age > 33) requirement += confederation === "EUROPE" ? (state.age - 33) * 4 : (state.age - 33) * 1.5;
  return state.overall >= requirement;
}

function positionByKey(key: PositionKey) {
  return POSITIONS.find((position) => position.key === key) ?? POSITIONS[6];
}

const POSITION_FIELD_SPOTS: Record<PositionKey, { gridColumn: number; gridRow: number }> = {
  PE: { gridColumn: 1, gridRow: 1 },
  CA: { gridColumn: 3, gridRow: 1 },
  PD: { gridColumn: 5, gridRow: 1 },
  MEI: { gridColumn: 3, gridRow: 2 },
  ME: { gridColumn: 1, gridRow: 3 },
  MC: { gridColumn: 3, gridRow: 3 },
  MD: { gridColumn: 5, gridRow: 3 },
  VOL: { gridColumn: 3, gridRow: 4 },
  LE: { gridColumn: 1, gridRow: 5 },
  ZAG: { gridColumn: 3, gridRow: 5 },
  LD: { gridColumn: 5, gridRow: 5 },
  GOL: { gridColumn: 3, gridRow: 6 },
};

const LEAGUE_MARKET_MULTIPLIER: Record<string, number> = {
  brasileirao: 0.42,
  primeira: 0.68,
  eredivisie: 0.72,
  proleague: 0.62,
  superlig: 0.6,
  "swiss-super-league": 0.52,
  "austria-bundesliga": 0.5,
  "premiership-sco": 0.48,
  ligue1: 0.9,
  seriea: 1.02,
  bundesliga: 1.06,
  laliga: 1.12,
  premier: 1.28,
  "liga-argentina": 0.5,
  "liga-uruguaia": 0.34,
  "liga-chilena": 0.36,
  "liga-colombiana": 0.38,
  "liga-paraguaia": 0.28,
  "liga-equatoriana": 0.32,
  "liga-peruana": 0.28,
  "liga-mx": 0.58,
  mls: 0.5,
  // Arábia paga acima do nível esportivo; segunda divisão paga abaixo.
  "saudi-pro-league": 0.95,
  "j1-league": 0.6,
  "k-league": 0.44,
  csl: 0.62,
  "brasileirao-b": 0.2,
  championship: 0.66,
};

function marketValue(overall: number, age: number, club: Club, reputation = 0, form?: Partial<PlayerStats>) {
  const base = Math.pow(Math.max(1, overall - 42), 2.45) * 9000;
  const ageFactor = age <= 24 ? 1.2 : age <= 29 ? 1 : Math.max(0.18, 1 - (age - 29) * 0.1);
  const marketFactor = LEAGUE_MARKET_MULTIPLIER[club.leagueId] ?? 0.82;
  const reputationFactor = 0.78 + clamp(reputation, 0, 100) / 300;
  const appearances = form?.appearances ?? 0;
  const production = (form?.goals ?? 0) + (form?.assists ?? 0) * 0.8 + (form?.cleanSheets ?? 0) * 0.65;
  const formFactor = clamp(0.88 + appearances / 160 + production / 180, 0.88, 1.24);
  return Math.max(50_000, Math.round((base * ageFactor * marketFactor * reputationFactor * formFactor) / 10_000) * 10_000);
}

function competitiveStrength(club: Club) {
  return club.strength;
}

function seasonPerformanceScore(positionKey: PositionKey, record?: Partial<SeasonRecord> | null) {
  if (!record) return 0;
  const position = positionByKey(positionKey);
  const appearances = record.appearances ?? 0;
  const production = position.key === "GOL"
    ? (record.cleanSheets ?? 0) * 2 - (record.goalsConceded ?? 0) * 0.12
    : position.zone === "defesa"
      ? (record.goals ?? 0) * 4 + (record.assists ?? 0) * 3
      : position.zone === "meio"
        ? (record.goals ?? 0) * 2.5 + (record.assists ?? 0) * 2.2
        : (record.goals ?? 0) * 2 + (record.assists ?? 0) * 1.6;
  const score =
    appearances * 0.9 +
    Math.max(0, production) +
    Math.max(0, (record.overall ?? 60) - 60) * 0.65 +
    (record.objectiveResult?.completed ? 8 : 0) +
    (record.awards?.length ?? 0) * 4 +
    (record.title ? 6 : 0);
  return clamp(Math.round(score), 0, 100);
}

function seasonAverageRating(performanceScore: number, seed: number, season: number) {
  const variance = (seeded(seed, season * 941 + 17) - 0.5) * 0.36;
  const historicBonus = performanceScore >= 97 && seeded(seed, season * 941 + 29) > 0.82 ? 0.3 : 0;
  return Number(clamp(
    5.25 + performanceScore * 0.038 + Math.max(0, performanceScore - 90) * 0.04 + variance + historicBonus,
    5.4,
    9.9,
  ).toFixed(1));
}

function medicalRecordForSeason(state: GameState): MedicalRecord {
  const catalog = [
    { name: "Ruptura do ligamento cruzado", severity: "grave" as const, months: [8, 11], matches: [20, 31], impact: -2 },
    { name: "Lesão no tendão de Aquiles", severity: "grave" as const, months: [7, 10], matches: [17, 27], impact: -2 },
    { name: "Fratura na tíbia", severity: "grave" as const, months: [5, 8], matches: [13, 22], impact: -1 },
    { name: "Lesão no menisco", severity: "moderada" as const, months: [3, 6], matches: [8, 16], impact: -1 },
    { name: "Lesão muscular de grau 3", severity: "moderada" as const, months: [2, 4], matches: [5, 12], impact: 0 },
    { name: "Entorse grave no tornozelo", severity: "moderada" as const, months: [2, 4], matches: [6, 13], impact: 0 },
  ];
  const injury = catalog[Math.floor(seeded(state.seed, state.season * 947 + 31) * catalog.length)];
  const rangeValue = (range: number[], salt: number) =>
    range[0] + Math.floor(seeded(state.seed, state.season * salt) * (range[1] - range[0] + 1));
  const recurring = state.medicalHistory.some((record) => record.name === injury.name);
  return {
    id: `${state.seed}-${state.season}-${injury.name}`,
    season: state.season,
    age: state.age,
    name: injury.name,
    severity: injury.severity,
    recoveryMonths: rangeValue(injury.months, 953),
    matchesMissed: rangeValue(injury.matches, 967),
    recurring,
    overallImpact: injury.impact,
  };
}

function worldCupGamesThroughStage(stage: string) {
  if (stage === "CAMPEÃO" || stage === "Vice") return 8;
  if (stage.includes("Semifinal")) return 7;
  if (stage.includes("Quartas")) return 6;
  if (stage.includes("Oitavas")) return 5;
  if (stage.includes("16 avos")) return 4;
  return 3;
}

function simulatedWorldCupStats(state: GameState, games: number, salt: number): TournamentStats {
  const position = positionByKey(state.position);
  const groupAppearances = Math.min(3, games);
  const quality = clamp((state.overall - 54) / 34, 0.42, 1.42);
  const groupForm = 0.62 + seeded(state.seed, state.season * 977 + salt) * 1.12;
  const knockoutGames = Math.max(0, games - groupAppearances);
  const knockoutForm = 0.65 + seeded(state.seed, state.season * 983 + salt) * 1.18;
  const score = (appearances: number, rate: number, form: number) =>
    position.key === "GOL" ? 0 : Math.max(0, Math.round(appearances * rate * quality * form * 1.18));
  const groupGoals = score(groupAppearances, position.goals, groupForm);
  const groupAssists = score(groupAppearances, position.assists, 0.72 + seeded(state.seed, state.season * 991 + salt) * 1.02);
  const knockoutGoals = score(knockoutGames, position.goals, knockoutForm);
  const knockoutAssists = score(knockoutGames, position.assists, 0.7 + seeded(state.seed, state.season * 997 + salt) * 1.08);
  return {
    appearances: games,
    goals: groupGoals + knockoutGoals,
    assists: groupAssists + knockoutAssists,
    groupAppearances,
    groupGoals,
    groupAssists,
    knockoutAppearances: knockoutGames,
    knockoutGoals,
    knockoutAssists,
  };
}

function worldCupStatsForSeason(state: Pick<GameState, "nationalHistory">, season: number) {
  return state.nationalHistory.find((record) => record.season === season && record.name === "Copa do Mundo")?.tournamentStats;
}

function transferMarketProfile(state: GameState) {
  const latest = state.lastResult ?? state.history.at(-1);
  const performanceScore = seasonPerformanceScore(state.position, latest);
  const extraMarketOffers =
    performanceScore >= 90 ? 5 :
    performanceScore >= 82 ? 4 :
    performanceScore >= 74 ? 3 :
    performanceScore >= 66 ? 2 :
    performanceScore >= 58 ? 1 :
    0;
  return {
    performanceScore,
    extraMarketOffers,
    label: performanceScore >= 82 ? "Temporada excepcional" : performanceScore >= 62 ? "Boa temporada" : "Mercado regular",
  };
}

function guaranteedEuropeanOffer(state: GameState, salt: number, excludedClubIds: string[]) {
  const current = clubById(state.currentClubId || state.academyClubId);
  const profile = transferMarketProfile(state);
  const targetStrength = clamp(
    Math.round(
      56 +
      Math.max(0, state.overall - 50) * 0.65 +
      profile.performanceScore * 0.11 +
      state.reputation * 0.08,
    ),
    57,
    88,
  );
  return CLUBS
    .filter((club) =>
      isEuropeanClub(club) &&
      club.id !== current.id &&
      !excludedClubIds.includes(club.id),
    )
    .sort((a, b) => {
      const scoreA = Math.abs(competitiveStrength(a) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(a)) * 2;
      const scoreB = Math.abs(competitiveStrength(b) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(b)) * 2;
      return scoreA - scoreB;
    })[0]?.id;
}

function ensureEuropeanOffer(state: GameState, salt: number, offers: string[]) {
  if (offers.some((clubId) => isEuropeanClub(clubById(clubId)))) return offers;
  const europeanOffer = guaranteedEuropeanOffer(state, salt, offers);
  if (!europeanOffer) return offers;
  if (offers.length < 5) return [...offers, europeanOffer];
  return [...offers.slice(0, -1), europeanOffer];
}

function formatMoney(value: number) {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  return `€${Math.round(value / 1000)}K`;
}

function formatFollowers(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)} mi`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)} mil`;
  return String(Math.max(0, Math.round(value)));
}

function publicImageProfile(state: GameState) {
  const score = state.socialSentiment * 0.36 + state.mediaRelation * 0.24 + state.charityReputation * 0.18 + state.reputation * 0.22;
  if (score >= 82) return { label: "Ícone global", color: "#ffc72c", description: "Seu nome atravessou o futebol e virou uma marca mundial." };
  if (score >= 68) return { label: "Queridinho do público", color: "#63e36b", description: "Torcedores, imprensa e marcas enxergam valor no que você representa." };
  if (score >= 52) return { label: "Figura em ascensão", color: "#2ca8ff", description: "Sua imagem cresce, mas cada postagem ainda pode mudar a narrativa." };
  if (score >= 36) return { label: "Imagem polarizada", color: "#ff8c5a", description: "Você chama atenção — e divide opiniões quase na mesma medida." };
  return { label: "Crise de imagem", color: "#ff5a4e", description: "Patrocinadores e imprensa acompanham cada passo com desconfiança." };
}

function sponsorOfferPool(state: GameState, salt: number) {
  const reachBoost = Math.min(22, Math.log10(Math.max(1_000, state.followers)) * 3.3);
  const effectiveReputation = state.reputation + reachBoost + state.charityReputation * 0.08;
  const previousBrands = new Set(state.sponsorHistory.map((deal) => deal.brand));
  const eligible = SPONSOR_BRANDS
    .filter((brand) => effectiveReputation >= brand.minReputation - 8)
    .map((brand, index) => ({
      brand,
      order:
        Math.abs(brand.minReputation - effectiveReputation) * 0.2 +
        (previousBrands.has(brand.name) ? 2.5 : 0) +
        seeded(state.seed, salt + index * 37) * 4,
    }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .map(({ brand }, index) => {
      const years = 2 + Math.floor(seeded(state.seed, salt + 401 + index * 13) * 3);
      const reachMultiplier = 0.72 + Math.min(1.8, Math.log10(Math.max(1_000, state.followers)) / 5);
      const reputationMultiplier = 0.65 + state.reputation / 120;
      const annualValue = Math.round(brand.baseValue * reachMultiplier * reputationMultiplier / 10_000) * 10_000;
      return { ...brand, years, annualValue };
    });
  return eligible.length ? eligible : [{ ...SPONSOR_BRANDS.at(-1)!, years: 2, annualValue: 100_000 }];
}

function addStats(a: PlayerStats, b: PlayerStats): PlayerStats {
  return {
    appearances: a.appearances + b.appearances,
    goals: a.goals + b.goals,
    assists: a.assists + b.assists,
    tackles: a.tackles + b.tackles,
    cleanSheets: a.cleanSheets + b.cleanSheets,
    goalsConceded: a.goalsConceded + b.goalsConceded,
    yellowCards: a.yellowCards + b.yellowCards,
    redCards: a.redCards + b.redCards,
  };
}

function describeEffects(effect: Effect) {
  const changes: string[] = [];
  const add = (label: string, value?: number) => {
    if (!value) return;
    changes.push(`${value > 0 ? "+" : ""}${value} ${label}`);
  };
  add("OVR", effect.ovr);
  if (effect.potential) changes.push(effect.potential > 0 ? "Margem futura melhorou" : "Margem futura piorou");
  add("moral", effect.morale);
  add("físico", effect.fitness);
  add("prestígio", effect.reputation);
  add("liderança", effect.leadership);
  add("torcida", effect.fans);
  add("minutos", effect.minutes);
  add("chance de título", effect.titleBoost);
  add("Seleção", effect.nationalBoost);
  add("chance de título na Seleção", effect.nationalTitleBoost);
  add("adaptação", effect.adaptation);
  add("disciplina", effect.discipline);
  add("humor das redes", effect.socialSentiment);
  add("relação com a imprensa", effect.mediaRelation);
  add("equilíbrio pessoal", effect.lifeBalance);
  add("impacto social", effect.charity);
  if (effect.followers) changes.push(`${effect.followers > 0 ? "+" : ""}${formatFollowers(effect.followers)} seguidores`);
  if (effect.sponsorBrand) changes.push(`Contrato com ${effect.sponsorBrand}`);
  if (effect.money) changes.push(`${effect.money > 0 ? "+" : ""}${formatMoney(effect.money * 10_000)} patrimônio`);
  if (effect.contractYears) changes.push(`Contrato +${effect.contractYears} anos`);
  if (effect.salaryBoost) changes.push(`Salário +${effect.salaryBoost}%`);
  if (effect.clubCaptain) changes.push("Braçadeira do clube");
  if (effect.nationalCall) changes.push("Convocação garantida");
  if (effect.nationalCaptain) changes.push("Braçadeira da Seleção");
  if (effect.transfer) changes.push("Mercado aberto");
  if (effect.transferAbroad) changes.push("Ofertas apenas da Europa");
  if (effect.loan) changes.push("Saída por empréstimo");
  add("respeito do rival", effect.rivalRespect);
  if (effect.forcedAlternativeTransfer) changes.push("Saída obrigatória para uma liga alternativa");
  if (effect.injuryRisk) changes.push(`+${effect.injuryRisk} risco físico`);
  if (effect.retire) changes.push("Despedida anunciada");
  return changes.length ? changes : ["Sua escolha mudou o rumo da temporada"];
}

function mergeEffects(base: Effect, extra: Effect): Effect {
  return {
    ovr: (base.ovr ?? 0) + (extra.ovr ?? 0),
    potential: (base.potential ?? 0) + (extra.potential ?? 0),
    morale: (base.morale ?? 0) + (extra.morale ?? 0),
    fitness: (base.fitness ?? 0) + (extra.fitness ?? 0),
    reputation: (base.reputation ?? 0) + (extra.reputation ?? 0),
    leadership: (base.leadership ?? 0) + (extra.leadership ?? 0),
    money: (base.money ?? 0) + (extra.money ?? 0),
    minutes: (base.minutes ?? 0) + (extra.minutes ?? 0),
    titleBoost: (base.titleBoost ?? 0) + (extra.titleBoost ?? 0),
    nationalBoost: (base.nationalBoost ?? 0) + (extra.nationalBoost ?? 0),
    nationalTitleBoost: (base.nationalTitleBoost ?? 0) + (extra.nationalTitleBoost ?? 0),
    nationalCall: Boolean(base.nationalCall || extra.nationalCall),
    nationalCaptain: Boolean(base.nationalCaptain || extra.nationalCaptain),
    adaptation: (base.adaptation ?? 0) + (extra.adaptation ?? 0),
    injuryRisk: (base.injuryRisk ?? 0) + (extra.injuryRisk ?? 0),
    fans: (base.fans ?? 0) + (extra.fans ?? 0),
    transfer: Boolean(base.transfer || extra.transfer),
    transferAbroad: Boolean(base.transferAbroad || extra.transferAbroad),
    loan: Boolean(base.loan || extra.loan),
    rivalRespect: (base.rivalRespect ?? 0) + (extra.rivalRespect ?? 0),
    followers: (base.followers ?? 0) + (extra.followers ?? 0),
    socialSentiment: (base.socialSentiment ?? 0) + (extra.socialSentiment ?? 0),
    mediaRelation: (base.mediaRelation ?? 0) + (extra.mediaRelation ?? 0),
    lifeBalance: (base.lifeBalance ?? 0) + (extra.lifeBalance ?? 0),
    charity: (base.charity ?? 0) + (extra.charity ?? 0),
    sponsorBrand: extra.sponsorBrand ?? base.sponsorBrand,
    sponsorYears: extra.sponsorYears ?? base.sponsorYears,
    sponsorValue: extra.sponsorValue ?? base.sponsorValue,
    retire: Boolean(base.retire || extra.retire),
    discipline: (base.discipline ?? 0) + (extra.discipline ?? 0),
    contractYears: (base.contractYears ?? 0) + (extra.contractYears ?? 0),
    salaryBoost: (base.salaryBoost ?? 0) + (extra.salaryBoost ?? 0),
    clubCaptain: Boolean(base.clubCaptain || extra.clubCaptain),
    forcedAlternativeTransfer: Boolean(base.forcedAlternativeTransfer || extra.forcedAlternativeTransfer),
  };
}

function careerTrend(history: SeasonRecord[]) {
  const latest = history.at(-1)?.overall;
  const previous = history.at(-2)?.overall;
  if (latest === undefined) return "Em avaliação";
  if (previous === undefined) return "Primeiros passos";
  if (latest >= previous + 2) return "Explodindo";
  if (latest > previous) return "Em ascensão";
  if (latest < previous - 1) return "Em queda";
  if (latest < previous) return "Perdendo ritmo";
  return "Estável";
}

function fanMood(value: number) {
  if (value < 20) return { label: "Odiado", color: "#ff5a4e" };
  if (value < 38) return { label: "Vaiado", color: "#ff8c5a" };
  if (value < 62) return { label: "Em avaliação", color: "#2ca8ff" };
  if (value < 82) return { label: "Querido", color: "#63e36b" };
  if (value < 94) return { label: "Amado", color: "#9be86f" };
  return { label: "Ídolo", color: "#ffc72c" };
}

function isIdolAtClub(state: GameState, clubId: string) {
  const clubSeasons = state.history.filter((season) => season.clubId === clubId);
  const clubTitles = clubSeasons.reduce(
    (total, season) => total + season.competitions.filter((competition) => competition.champion).length,
    0,
  );
  return state.fanSupport >= 94 && state.reputation >= 70 && (clubSeasons.length >= 4 || clubTitles >= 3);
}

type TransferOfferOptions = {
  includeForeign?: boolean;
  forceDomestic?: boolean;
  forceForeign?: boolean;
  domesticCountryId?: string;
  sourceLeagueId?: string;
};

const SECOND_DIVISION_LEAGUES = new Set(["brasileirao-b", "championship"]);

function selectOffers(state: GameState, count: number, salt: number, opts: TransferOfferOptions = {}) {
  const current = state.currentClubId || state.academyClubId;
  const currentClub = clubById(current);
  const currentRep = current ? currentClub.reputation : 3;
  const originCountryId = currentClub.countryId;
  const targetRep = clamp(Math.round((state.overall - 56) / 6), 2, 5);
  let pool = CLUBS.filter((club) => club.id !== current);
  if (opts.forceForeign) {
    pool = pool.filter((club) => isEuropeanClub(club) && (foreignEligible(state, club, originCountryId) || club.reputation <= Math.max(3, currentRep - 1)));
  } else if (opts.forceDomestic) {
    const domesticCountryId = opts.domesticCountryId ?? originCountryId;
    pool = pool.filter((club) => club.countryId === domesticCountryId);
  } else if (!opts.includeForeign) {
    pool = pool.filter((club) => club.countryId === originCountryId);
  } else {
    pool = pool.filter((club) => club.countryId === originCountryId || foreignEligible(state, club, originCountryId));
  }
  const candidates = pool.sort((a, b) => {
    const scoreA = Math.abs(a.reputation - Math.max(currentRep, targetRep)) + seeded(state.seed, salt + CLUBS.indexOf(a)) + regionAffinity(originCountryId, a);
    const scoreB = Math.abs(b.reputation - Math.max(currentRep, targetRep)) + seeded(state.seed, salt + CLUBS.indexOf(b)) + regionAffinity(originCountryId, b);
    return scoreA - scoreB;
  });
  return candidates.slice(0, count).map((club) => club.id);
}

function offersFromCountry(state: GameState, countryId: string, count: number, salt: number, excludedIds: string[] = []) {
  const current = clubById(state.currentClubId || state.academyClubId);
  const profile = transferMarketProfile(state);
  const targetStrength = clamp(
    competitiveStrength(current) + Math.round((profile.performanceScore - 55) / 12),
    58,
    92,
  );
  return CLUBS
    .filter((club) => club.countryId === countryId && club.id !== current.id && !excludedIds.includes(club.id))
    .sort((a, b) => {
      const scoreA = Math.abs(competitiveStrength(a) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(a)) * 5;
      const scoreB = Math.abs(competitiveStrength(b) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(b)) * 5;
      return scoreA - scoreB;
    })
    .slice(0, count)
    .map((club) => club.id);
}

function prioritizeCurrentCountry(state: GameState, salt: number, offers: string[], desiredCount: number) {
  if (desiredCount <= 0) return offers;
  const current = clubById(state.currentClubId || state.academyClubId);
  const localOffers = [
    ...offers.filter((clubId) => clubById(clubId).countryId === current.countryId),
    ...offersFromCountry(state, current.countryId, desiredCount, salt, offers),
  ].slice(0, desiredCount);
  return Array.from(new Set([...localOffers, ...offers])).slice(0, Math.max(5, offers.length));
}

function selectTransferOffers(state: GameState, salt: number, opts: TransferOfferOptions = {}) {
  const current = clubById(state.currentClubId || state.academyClubId);
  const sourceLeagueId = opts.sourceLeagueId ?? state.currentLeagueId ?? current.leagueId;
  if (SECOND_DIVISION_LEAGUES.has(sourceLeagueId)) {
    return offersFromCountry(state, current.countryId, 7, salt).slice(0, 7);
  }
  if (opts.forceDomestic) {
    const domesticCountryId = opts.domesticCountryId ?? current.countryId;
    return offersFromCountry(state, domesticCountryId, 7, salt).slice(0, 7);
  }
  let baseOffers = isEuropeanClub(current) && !opts.forceDomestic
    ? selectOffers(state, 5, salt, { ...opts, includeForeign: true, forceForeign: true })
    : selectOffers(state, 5, salt, opts);
  const desiredLocalOffers = opts.forceForeign && !isEuropeanClub(current)
    ? 0
    : state.age >= 34
      ? 3
      : 2;
  baseOffers = prioritizeCurrentCountry(state, salt + 919, baseOffers, desiredLocalOffers);
  baseOffers = ensureEuropeanOffer(state, salt + 941, baseOffers);
  const homeCountryId = state.academyCountryId;
  if (homeCountryId && current.countryId !== homeCountryId && !opts.forceForeign) {
    const homeReturnChance = state.age >= 34 ? 0.78 : state.age >= 30 ? 0.12 : 0.035;
    if (seeded(state.seed, salt + 887) < homeReturnChance) {
      const homeOfferCount = state.age >= 34 ? 2 : 1;
      const homeOffers = offersFromCountry(state, homeCountryId, homeOfferCount, salt + 907, baseOffers);
      baseOffers = Array.from(new Set([
        ...baseOffers.filter((clubId) => clubById(clubId).countryId === current.countryId).slice(0, desiredLocalOffers),
        ...homeOffers,
        ...baseOffers,
      ])).slice(0, 7);
    }
  }

  const profile = transferMarketProfile(state);
  if (!profile.extraMarketOffers) return baseOffers;

  const targetStrength = clamp(
    Math.round(competitiveStrength(current) + (profile.performanceScore - 62) / 10),
    66,
    92,
  );
  const performanceBoost = Math.floor(profile.performanceScore / 10);
  const foreignPool = CLUBS
    .filter((club) => {
      if (club.countryId === current.countryId || club.id === current.id || baseOffers.includes(club.id)) return false;
      const confederation = clubConfederation(club);
      if (isEuropeanClub(current) && confederation !== "EUROPE") return false;
      if (state.age > 38) return false;
      if (state.age > 33 && confederation === "EUROPE") return false;
      const league = leagueById(club.leagueId);
      let accessibleLevel = 58 + league.prestige * 3 + club.reputation * 2;
      if (confederation === "SOUTH_AMERICA") accessibleLevel -= 8;
      if (confederation === "NORTH_AMERICA") accessibleLevel -= state.age >= 29 ? 12 : 6;
      return state.overall + performanceBoost >= accessibleLevel;
    })
    .sort((a, b) => {
      const distanceA = Math.abs(competitiveStrength(a) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(a)) * 3 + regionAffinity(current.countryId, a);
      const distanceB = Math.abs(competitiveStrength(b) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(b)) * 3 + regionAffinity(current.countryId, b);
      return distanceA - distanceB;
    })
    .slice(0, profile.extraMarketOffers)
    .map((club) => club.id);

  const expandedOffers = Array.from(new Set([...baseOffers, ...foreignPool])).slice(0, 10);
  return ensureEuropeanOffer(
    state,
    salt + 977,
    prioritizeCurrentCountry(state, salt + 967, expandedOffers, desiredLocalOffers),
  );
}

const ALTERNATIVE_EXILE_LEAGUES = new Set([
  "liga-uruguaia",
  "liga-chilena",
  "liga-colombiana",
  "liga-paraguaia",
  "liga-equatoriana",
  "liga-peruana",
  "liga-mx",
  "mls",
  "eredivisie",
  "primeira",
  "proleague",
  "superlig",
  "swiss-super-league",
  "austria-bundesliga",
  "premiership-sco",
  "saudi-pro-league",
  "j1-league",
  "k-league",
  "csl",
  "brasileirao-b",
  "championship",
]);

function selectAlternativeExileOffers(state: GameState, salt: number) {
  const current = clubById(state.currentClubId || state.academyClubId);
  const targetStrength = clamp(competitiveStrength(current) - 8, 58, 78);
  return CLUBS
    .filter((club) =>
      club.id !== current.id &&
      club.countryId !== current.countryId &&
      ALTERNATIVE_EXILE_LEAGUES.has(club.leagueId) &&
      club.reputation <= 3,
    )
    .sort((a, b) => {
      const scoreA = Math.abs(competitiveStrength(a) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(a)) * 7;
      const scoreB = Math.abs(competitiveStrength(b) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(b)) * 7;
      return scoreA - scoreB;
    })
    .slice(0, 6)
    .map((club) => club.id);
}

function eligibleEvents(state: GameState) {
  const club = clubById(state.currentClubId || state.academyClubId);
  return ALL_PRO_EVENTS.filter((event) => {
    if (event.minAge !== undefined && state.age < event.minAge) return false;
    if (event.maxAge !== undefined && state.age > event.maxAge) return false;
    if (event.minOvr !== undefined && state.overall < event.minOvr) return false;
    if (event.maxOvr !== undefined && state.overall > event.maxOvr) return false;
    if (event.needsLowFitness && state.fitness > 67) return false;
    if (event.needsNational && state.nationalLevel < 1) return false;
    if (event.needsLibertadores && state.continentalSlot !== "libertadores") return false;
    if (event.needsContinental && state.continentalSlot !== event.needsContinental) return false;
    if (event.needsWorld && (state.worldQualifiedSeason !== state.season || state.worldQualifiedClubId !== state.currentClubId)) return false;
    if (event.needsAbroad && !isEuropeanClub(club)) return false;
    if (event.id === "european-exit") {
      const baseCountryIsEuropean = countryById(state.academyCountryId).confederation === "EUROPE";
      const playerIsEuropean = countryById(state.nationality).confederation === "EUROPE";
      const genuinelyStruggling =
        state.adaptation < 66 ||
        state.managerTrust < 42 ||
        Boolean(state.lastResult && (state.lastResult.performanceScore < 54 || state.lastResult.appearances < 16));
      if (baseCountryIsEuropean || playerIsEuropean || !genuinelyStruggling) return false;
    }
    if (event.needsDomestic && club.countryId !== "brasil") return false;
    if (event.needsRivalry && !RIVALRIES.some((rivalry) => rivalry.clubIds.includes(club.id))) return false;
    if (event.maxContractYears !== undefined && state.contractYears > event.maxContractYears) return false;
    if (event.seasonParity === "even" && state.season % 2 !== 0) return false;
    if (event.seasonParity === "odd" && state.season % 2 === 0) return false;
    if (event.needsNationalMain && state.nationalCategory !== "main") return false;
    if (event.needsNationalYouth && state.nationalCategory !== "sub17" && state.nationalCategory !== "sub20" && state.nationalCategory !== "olympic") return false;
    if (event.nationalWindow === "major" && state.season % 4 !== 0 && state.season % 4 !== 2) return false;
    if (event.nationalWindow === "continental" && state.season % 4 !== 0) return false;
    if (event.nationalWindow === "olympics" && state.season % 4 !== 0) return false;
    if (event.nationalWindow === "qualifiers" && state.season % 4 !== 3) return false;
    if (event.needsConfederation && clubConfederation(club) !== event.needsConfederation) return false;
    if (event.needsPositionZone && positionByKey(state.position).zone !== event.needsPositionZone) return false;
    if (event.needsSquadRoles && !event.needsSquadRoles.includes(state.squadRole)) return false;
    if (event.needsCaptainRole === "club" && !state.clubCaptain) return false;
    if (event.needsCaptainRole === "national" && !state.nationalCaptain) return false;
    if (event.needsCaptainRole === "any" && !(state.clubCaptain || state.nationalCaptain)) return false;
    if (event.oneTime && state.seenEvents.includes(event.id)) return false;
    if (event.rareChance !== undefined) {
      const eventSalt = [...event.id].reduce((total, character) => total + character.charCodeAt(0), 0);
      if (seeded(state.seed, state.season * 997 + eventSalt) >= event.rareChance) return false;
    }
    return true;
  });
}

function selectNextEvent(state: GameState, salt: number) {
  const offFieldRoll = seeded(state.seed, state.season * 1237 + salt);
  if (seeded(state.seed, state.season * 1871 + salt) < 0.18) return DYNAMIC_STORY_EVENT_ID;
  if (!state.activeSponsor && state.age >= 16 && state.reputation >= 10 && offFieldRoll < 0.34) {
    return DYNAMIC_SPONSOR_EVENT_ID;
  }
  if (state.activeSponsor && offFieldRoll < 0.1) return DYNAMIC_SPONSOR_DUTY_EVENT_ID;
  if (offFieldRoll < 0.24) return DYNAMIC_SOCIAL_EVENT_ID;
  if (offFieldRoll < 0.36) return DYNAMIC_LIFE_EVENT_ID;
  if (state.rivals.some((rival) => rival.active) && seeded(state.seed, state.season * 991 + salt) < 0.14) {
    return DYNAMIC_RIVAL_EVENT_ID;
  }
  const events = eligibleEvents(state);
  const triggeredRareEvents = events.filter((event) => event.rareChance !== undefined);
  if (triggeredRareEvents.length) return pick(triggeredRareEvents, state.seed + state.season, salt).id;
  const unseenFutboboMoments = events.filter((event) => event.id.startsWith("funny-") && !state.seenEvents.includes(event.id));
  if (unseenFutboboMoments.length && seeded(state.seed, state.season * 2137 + salt) < 0.22) {
    return pick(unseenFutboboMoments, state.seed + state.season, salt + 73).id;
  }
  const unseen = events.filter((event) => !state.seenEvents.includes(event.id));
  return pick(unseen.length ? unseen : events, state.seed + state.season, salt)?.id ?? "extra-training";
}

const NATIONALITY_SWITCH_EVENT_ID = "dynamic-nationality-switch";
const DYNAMIC_RIVAL_EVENT_ID = "dynamic-career-rival";
const DYNAMIC_SPONSOR_EVENT_ID = "dynamic-sponsor-offer";
const DYNAMIC_SPONSOR_DUTY_EVENT_ID = "dynamic-sponsor-duty";
const DYNAMIC_SOCIAL_EVENT_ID = "dynamic-social-media";
const DYNAMIC_LIFE_EVENT_ID = "dynamic-off-field-life";
const DYNAMIC_STORY_EVENT_ID = "dynamic-player-story";

function buildStoryCareerEvent(state: GameState): GameEvent {
  const story = playerStoryById(state.playerStoryId);
  const scenarioByStory: Record<PlayerStoryId, { title: string; description: string; bold: string; careful: string; personal: string }> = {
    "open-book": { title: "A imprensa quer encontrar o começo da sua lenda", description: "Sem uma narrativa pronta, cada entrevistador tenta escolher por você qual momento explica tudo.", bold: "Dizer que a história começa hoje", careful: "Recusar uma explicação fácil", personal: "Contar um detalhe que ninguém conhecia" },
    "academy-destroyer": { title: "A velha promessa voltou às manchetes", description: "Uma mesa-redonda compara sua temporada profissional aos números impossíveis da base.", bold: "Prometer que o próximo recorde será profissional", careful: "Explicar que base e elite são mundos diferentes", personal: "Ligar para um antigo companheiro da base" },
    "humble-roots": { title: "Sua família virou personagem de uma reportagem", description: "A produção quer filmar a casa e contar detalhes que nunca foram públicos.", bold: "Abrir as portas e contar tudo", careful: "Aceitar apenas uma entrevista curta", personal: "Proteger completamente a privacidade da família" },
    "football-bloodline": { title: "Perguntaram novamente se você seria titular no time do seu pai", description: "A comparação atravessa a coletiva mesmo sem relação com o próximo jogo.", bold: "Dizer que seria o melhor dos dois", careful: "Reconhecer a história e mudar de assunto", personal: "Conversar com seu pai antes de responder" },
    disillusioned: { title: "Um jovem da base disse que também pensa em desistir", description: "Ele procura você porque ouviu falar da fase em que o futebol deixou de fazer sentido.", bold: "Contar a verdade numa palestra aberta", careful: "Conversar em particular depois do treino", personal: "Levá-lo ao campo onde você reencontrou prazer" },
    "street-football": { title: "A prefeitura cercou a quadra onde você aprendeu", description: "Um vídeo de crianças jogando do lado de fora chega ao seu celular.", bold: "Comprar a briga nas redes", careful: "Negociar uma solução sem exposição", personal: "Aparecer de surpresa com bolas e traves" },
    "late-bloomer": { title: "Um reserva do Sub-17 pediu seu conselho", description: "Ele acredita que a carreira acabou antes de começar, exatamente como disseram sobre você.", bold: "Dizer que os olheiros vão se arrepender", careful: "Montar um plano de treino realista", personal: "Acompanhar os jogos dele em silêncio" },
    "academy-reject": { title: "O diretor que dispensou você está no estádio", description: "As câmeras encontram o rosto dele pouco antes do jogo começar.", bold: "Apontar para a tribuna se marcar", careful: "Tratar como qualquer outro jogo", personal: "Encontrá-lo longe das câmeras" },
    "migrant-dream": { title: "Uma criança recém-chegada escreveu no seu idioma de infância", description: "A carta diz que ver você em campo fez a cidade parecer menos estrangeira.", bold: "Transformar a carta em campanha internacional", careful: "Responder e apoiar uma associação local", personal: "Convidar a família para um treino" },
    "student-athlete": { title: "O treinador ironizou seus livros no vestiário", description: "A frase era brincadeira, mas abriu uma discussão sobre foco e inteligência no futebol.", bold: "Responder com uma análise tática pública", careful: "Mostrar no treino o que o estudo acrescenta", personal: "Criar um grupo de estudos no elenco" },
    "neighborhood-idol": { title: "O bairro quer que você escolha um lado", description: "Dois projetos comunitários rivais pedem seu nome e dizem representar suas raízes.", bold: "Financiar o projeto mais ambicioso", careful: "Dividir o apoio entre os dois", personal: "Reunir os responsáveis na mesma mesa" },
  };
  const scenario = scenarioByStory[state.playerStoryId];
  return {
    id: DYNAMIC_STORY_EVENT_ID,
    icon: story.icon,
    tag: "SUA HISTÓRIA",
    title: scenario.title,
    description: scenario.description,
    choices: [
      { label: scenario.bold, hint: "Impacto alto · risco de exposição", result: "Você transforma a própria origem em uma declaração pública. A reação é intensa.", effect: { followers: 120_000, reputation: 5, mediaRelation: -4, morale: 4 } },
      { label: scenario.careful, hint: "Maturidade · controle", result: "A resposta não domina as manchetes, mas fortalece quem convive com você.", effect: { leadership: 6, mediaRelation: 5, discipline: 4 } },
      { label: scenario.personal, hint: "Moral e equilíbrio ↑", result: "Sem campanha ou roteiro, você escolhe uma resposta pessoal que fica na memória.", effect: { morale: 9, lifeBalance: 7, fans: 4 } },
    ],
  };
}

function buildSponsorEvent(state: GameState): GameEvent {
  const offers = sponsorOfferPool(state, state.season * 1301);
  const club = clubById(state.currentClubId || state.academyClubId);
  return {
    id: DYNAMIC_SPONSOR_EVENT_ID,
    icon: "◇",
    tag: "PATROCÍNIO",
    title: "As marcas querem colocar seu nome em uma chuteira",
    description: `${formatFollowers(state.followers)} seguidores e seu momento em campo chamaram atenção. Cada contrato paga por ano e acompanha você mesmo se trocar de clube.`,
    choices: offers.map((offer, index) => ({
      label: `Assinar com ${offer.name}`,
      hint: `${offer.years} anos · ${formatMoney(offer.annualValue)}/ano${("controversial" in offer && offer.controversial) ? " · muito dinheiro, imagem sensível" : index === 0 ? " · maior projeto" : ""}`,
      result: `${offer.name} anuncia você como novo atleta da marca. A parceria agora faz parte da sua carreira.`,
      effect: {
        sponsorBrand: offer.name,
        sponsorYears: offer.years,
        sponsorValue: offer.annualValue,
        reputation: ("controversial" in offer && offer.controversial) ? Math.max(1, offer.tier - 1) : offer.tier,
        followers: (("controversial" in offer && offer.controversial) ? 12_000 : 8_000) * offer.tier,
        socialSentiment: ("controversial" in offer && offer.controversial) ? -4 : 2,
        mediaRelation: ("controversial" in offer && offer.controversial) ? -3 : 1,
        minutes: ("controversial" in offer && offer.controversial) && club.reputation >= 5 ? -10 : 0,
      },
    })),
  };
}

function buildSponsorDutyEvent(state: GameState): GameEvent {
  const sponsor = state.activeSponsor;
  const brand = sponsor?.brand ?? "a marca";
  const annualValue = sponsor?.annualValue ?? 100_000;
  return {
    id: DYNAMIC_SPONSOR_DUTY_EVENT_ID,
    icon: "◆",
    tag: brand.toLocaleUpperCase("pt-BR"),
    title: `${brand} marcou uma campanha no pior dia possível`,
    description: "A gravação atravessa seu dia de descanso antes de uma sequência pesada. O contrato pede presença, mas você decide como cumprir.",
    choices: [
      {
        label: "Entregar a campanha completa",
        hint: `Seguidores ↑↑ · físico ↓ · bônus ${formatMoney(annualValue * 0.18)}`,
        result: `A campanha da ${brand} domina as redes e rende um bônus. Seu corpo, porém, sente o dia sem descanso.`,
        effect: { followers: 75_000, socialSentiment: 5, fitness: -7, lifeBalance: -5, money: Math.round(annualValue * 0.18 / 10_000) },
      },
      {
        label: "Reduzir a agenda e priorizar o jogo",
        hint: "Físico ↑ · relação comercial ↓",
        result: `${brand} aceita uma ação menor. A parceria esfria um pouco, mas você chega inteiro ao campo.`,
        effect: { fitness: 8, lifeBalance: 4, reputation: -2, mediaRelation: -2 },
      },
      {
        label: "Transformar a campanha em ação social",
        hint: "Impacto social ↑↑ · público ↑",
        result: `Você convence ${brand} a levar a produção para um projeto comunitário. A ação ganha um significado que nenhuma publicidade compraria.`,
        effect: { charity: 12, followers: 45_000, socialSentiment: 9, leadership: 4 },
      },
    ],
  };
}

function buildSocialEvent(state: GameState): GameEvent {
  const scenario = Math.floor(seeded(state.seed, state.season * 1321) * 4);
  if (scenario === 0) {
    return {
      id: DYNAMIC_SOCIAL_EVENT_ID,
      icon: "@",
      tag: "REDES SOCIAIS",
      title: "Uma resposta sua virou assunto nacional",
      description: "Um torcedor criticou sua fase e seu comentário impulsivo recebeu milhares de compartilhamentos antes que você pudesse apagar.",
      choices: [
        { label: "Dobrar a aposta", hint: "Seguidores ↑↑ · imagem polariza", result: "Você sustenta cada palavra. Muita gente aplaude a personalidade; outra parte passa a torcer contra.", effect: { followers: 110_000, socialSentiment: -9, mediaRelation: -6, morale: 5 } },
        { label: "Pedir desculpas sem roteiro", hint: "Imagem ↑ · liderança ↑", result: "O vídeo é curto e direto. Assumir o erro desarma boa parte da crise.", effect: { socialSentiment: 10, mediaRelation: 7, leadership: 4, followers: 25_000 } },
        { label: "Entregar as redes à assessoria", hint: "Seguro · autenticidade ↓", result: "A crise desaparece, mas seu perfil passa a parecer uma coletiva de imprensa.", effect: { socialSentiment: 3, mediaRelation: 5, lifeBalance: 3, followers: -8_000 } },
      ],
    };
  }
  if (scenario === 1) {
    return {
      id: DYNAMIC_SOCIAL_EVENT_ID,
      icon: "●",
      tag: "VIRAL",
      title: "Sua comemoração virou tendência",
      description: "Crianças, jogadores e artistas repetem seu gesto. A internet quer saber se você vai transformar o momento em algo maior.",
      choices: [
        { label: "Criar um desafio oficial", hint: "Seguidores ↑↑↑ · desgaste leve", result: "O desafio atravessa fronteiras e seu perfil explode durante a semana.", effect: { followers: 260_000, socialSentiment: 10, fitness: -3, reputation: 5 } },
        { label: "Ligar o viral a uma campanha solidária", hint: "Impacto social ↑↑ · seguidores ↑", result: "Cada reprodução passa a divulgar uma causa. O gesto deixa de ser só seu.", effect: { followers: 145_000, charity: 14, socialSentiment: 12, leadership: 3 } },
        { label: "Deixar a torcida carregar o momento", hint: "Moral ↑ · crescimento natural", result: "Você não força uma campanha. A comemoração cresce de forma espontânea.", effect: { followers: 70_000, socialSentiment: 6, morale: 5 } },
      ],
    };
  }
  if (scenario === 2) {
    return {
      id: DYNAMIC_SOCIAL_EVENT_ID,
      icon: "!",
      tag: "ARQUIVO DA INTERNET",
      title: "Uma postagem antiga reapareceu",
      description: "Uma frase escrita quando você era adolescente volta sem contexto e abre uma crise que parece maior a cada minuto.",
      choices: [
        { label: "Explicar como você mudou", hint: "Imprensa ↑ · imagem ↑", result: "Você não tenta apagar o passado. A entrevista madura muda o centro da conversa.", effect: { mediaRelation: 10, socialSentiment: 8, leadership: 5, lifeBalance: -3 } },
        { label: "Apagar tudo e ficar em silêncio", hint: "Crise curta · público ↓", result: "A história perde força, mas o silêncio deixa uma sombra difícil de medir.", effect: { followers: -35_000, socialSentiment: -5, mediaRelation: -4, morale: -4 } },
        { label: "Responder com ironia", hint: "50% · viral ou desastre", result: "Você escolhe humor para enfrentar a crise.", effect: {}, luck: { chance: 50, successText: "A resposta é afiada na medida certa e a internet vira a seu favor.", failureText: "A ironia parece arrogância. O problema dobra de tamanho em poucas horas.", successEffect: { followers: 180_000, socialSentiment: 10, morale: 7 }, failureEffect: { followers: 55_000, socialSentiment: -16, mediaRelation: -10, morale: -9 } } },
      ],
    };
  }
  return {
    id: DYNAMIC_SOCIAL_EVENT_ID,
    icon: "▶",
    tag: "TRANSMISSÃO AO VIVO",
    title: "Uma live mostra um lado seu que ninguém conhecia",
    description: "Sem coletiva e sem roteiro, milhares de pessoas acompanham você jogando videogame e conversando sobre a carreira.",
    choices: [
      { label: "Falar abertamente sobre a pressão", hint: "Público ↑↑ · equilíbrio ↑", result: "A sinceridade aproxima torcedores que nunca tinham pensado no peso de uma carreira.", effect: { followers: 130_000, socialSentiment: 11, lifeBalance: 8, mediaRelation: 4 } },
      { label: "Provocar rivais durante a live", hint: "Seguidores ↑↑ · rivalidade ↑", result: "Os cortes viralizam e chegam rapidamente aos vestiários adversários.", effect: { followers: 170_000, socialSentiment: -3, reputation: 6, fans: 6 } },
      { label: "Transformar a live em quadro semanal", hint: "Seguidores ↑↑↑ · descanso ↓", result: "O quadro vira sucesso, mas agora existe mais uma agenda entre treinos e jogos.", effect: { followers: 240_000, lifeBalance: -9, fitness: -4, money: 8 } },
    ],
  };
}

function buildLifeEvent(state: GameState): GameEvent {
  const scenario = Math.floor(seeded(state.seed, state.season * 1361) * 5);
  const scenarios: GameEvent[] = [
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "☾", tag: "NOITE LIVRE", title: "Seus amigos marcaram uma festa antes do clássico", description: "A folga existe no papel, mas o jogo mais comentado do mês está a poucos dias.",
      choices: [
        { label: "Ir e sair cedo", hint: "Equilíbrio ↑ · risco pequeno", result: "Você aparece, ri e vai embora antes da noite cobrar seu preço.", effect: { lifeBalance: 8, morale: 6, fitness: -3 } },
        { label: "Virar a noite", hint: "Moral ↑↑ · físico ↓↓ · risco", result: "A noite é inesquecível. O treino seguinte também, pelos motivos errados.", effect: { morale: 13, fitness: -15, discipline: -8, socialSentiment: -4, injuryRisk: 5 } },
        { label: "Ficar em casa e estudar o rival", hint: "Jogo grande ↑ · vida pessoal ↓", result: "A preparação rende confiança, mas a carreira ocupa até o espaço da folga.", effect: { titleBoost: 8, lifeBalance: -7, fitness: 5 } },
      ],
    },
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "♥", tag: "IMPACTO SOCIAL", title: "A chance de criar sua própria fundação", description: "Um projeto local pede algo maior que uma visita: seu nome, tempo e compromisso por anos.",
      choices: [
        { label: "Fundar o projeto agora", hint: "Impacto social ↑↑↑ · dinheiro ↓", result: "A fundação nasce pequena, mas começa a mudar vidas antes da primeira manchete.", effect: { charity: 20, leadership: 7, money: -14, followers: 60_000, socialSentiment: 9 } },
        { label: "Financiar sem aparecer", hint: "Impacto social ↑↑ · discrição", result: "O dinheiro chega sem câmera. Meses depois, a história acaba descoberta.", effect: { charity: 14, money: -9, socialSentiment: 5, lifeBalance: 4 } },
        { label: "Deixar para uma fase mais estável", hint: "Patrimônio preservado", result: "Você ajuda pontualmente, mas evita assumir uma estrutura que ainda não consegue carregar.", effect: { charity: 3, money: -2, lifeBalance: 3 } },
      ],
    },
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "▣", tag: "DOCUMENTÁRIO", title: "Uma produtora quer acesso total à sua temporada", description: "Câmeras em casa, no carro e nos bastidores. A proposta paga bem, mas transforma privacidade em conteúdo.",
      choices: [
        { label: "Abrir todas as portas", hint: "Seguidores ↑↑↑ · dinheiro ↑↑ · equilíbrio ↓", result: "O documentário vira um fenômeno e seu cotidiano deixa de ser completamente seu.", effect: { followers: 340_000, money: 18, mediaRelation: 8, lifeBalance: -13 } },
        { label: "Mostrar apenas o futebol", hint: "Imprensa ↑ · exposição controlada", result: "A série fica menos explosiva, mas preserva quem vive ao seu redor.", effect: { followers: 110_000, mediaRelation: 7, lifeBalance: 3, money: 7 } },
        { label: "Recusar a produção", hint: "Privacidade ↑ · oportunidade perdida", result: "A câmera vai embora. Sua casa volta a ser apenas sua casa.", effect: { lifeBalance: 12, followers: -5_000, morale: 5 } },
      ],
    },
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "⌂", tag: "CÍRCULO PESSOAL", title: "Seu entorno começou a crescer rápido demais", description: "Novos amigos, pedidos de dinheiro e gente opinando na carreira. É difícil separar apoio de interesse.",
      choices: [
        { label: "Contratar uma equipe profissional", hint: "Equilíbrio ↑↑ · dinheiro ↓", result: "Agenda, finanças e exposição passam a ter limites claros.", effect: { lifeBalance: 13, money: -8, mediaRelation: 5, morale: 4 } },
        { label: "Confiar apenas nos amigos antigos", hint: "Moral ↑ · risco financeiro", result: "A lealdade conforta, mas nem todo amigo está preparado para administrar uma carreira.", effect: { morale: 8, lifeBalance: 4, money: -4 } },
        { label: "Afastar todo mundo", hint: "Foco ↑ · isolamento", result: "O ruído desaparece. O silêncio também pesa.", effect: { fitness: 7, morale: -10, lifeBalance: -8 } },
      ],
    },
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "◉", tag: "SAÚDE MENTAL", title: "A pressão começou a invadir os dias de folga", description: "Você dorme pensando no próximo jogo e acorda revendo o último erro. Fingir que não existe também virou cansativo.",
      choices: [
        { label: "Começar acompanhamento psicológico", hint: "Equilíbrio ↑↑↑ · consistência", result: "A pressão não some, mas deixa de comandar cada pensamento.", effect: { lifeBalance: 18, morale: 10, mediaRelation: 2 } },
        { label: "Conversar com o capitão", hint: "Liderança ↑ · moral ↑", result: "Ouvir alguém que já atravessou essa fase muda a forma como você enxerga o problema.", effect: { lifeBalance: 9, morale: 7, leadership: 5 } },
        { label: "Guardar tudo e treinar mais", hint: "OVR ↑ · equilíbrio ↓↓", result: "O treino oferece controle por algumas horas, mas não resolve o que acontece fora dele.", effect: { ovr: 1, fitness: -8, lifeBalance: -15, morale: -5 } },
      ],
    },
  ];
  return scenarios[scenario];
}

function buildRivalEvent(state: GameState): GameEvent {
  const activeRivals = state.rivals.filter((rival) => rival.active);
  const rival = pick(activeRivals, state.seed, state.season * 809);
  const rivalClub = clubById(rival.currentClubId);
  return {
    id: DYNAMIC_RIVAL_EVENT_ID,
    icon: "⚔",
    tag: "RIVALIDADE PESSOAL",
    title: `${rival.name} citou você`,
    description: `${rival.name}, ${rival.position} do ${rivalClub.shortName}, disse que sua temporada está recebendo atenção demais. A imprensa quer uma resposta.`,
    choices: [
      {
        label: "Responder dentro de campo",
        hint: "Respeito ↑ · pressão ↑",
        result: `Você evita a guerra de palavras e transforma o duelo com ${rival.name} em motivação.`,
        effect: { titleBoost: 5, reputation: 4, fitness: -4, rivalRespect: 8 },
      },
      {
        label: "Provocar de volta",
        hint: "Prestígio ↑ · rivalidade esquenta",
        result: `A resposta viraliza. O próximo encontro com ${rival.name} agora vale muito mais do que três pontos.`,
        effect: { reputation: 7, morale: 5, fans: 5, rivalRespect: -12 },
      },
      {
        label: "Elogiar o rival",
        hint: "Liderança ↑ · respeito ↑↑",
        result: `Você reconhece o talento de ${rival.name}. A tensão dá lugar a uma rivalidade de alto nível.`,
        effect: { leadership: 6, morale: 3, rivalRespect: 15 },
      },
    ],
  };
}

const NEARBY_NATIONAL_TEAMS: Record<string, string[]> = {
  brasil: ["argentina", "uruguai", "paraguai", "colombia", "peru"],
  argentina: ["uruguai", "chile", "paraguai", "brasil"],
  uruguai: ["argentina", "brasil", "paraguai"],
  chile: ["argentina", "peru"],
  colombia: ["equador", "peru", "brasil"],
  paraguai: ["brasil", "argentina", "uruguai"],
  equador: ["colombia", "peru"],
  peru: ["equador", "colombia", "chile", "brasil"],
  mexico: ["eua", "colombia"],
  eua: ["mexico"],
  portugal: ["espanha"],
  espanha: ["portugal", "franca"],
  franca: ["espanha", "alemanha", "italia"],
  inglaterra: ["franca", "holanda"],
  alemanha: ["holanda", "franca", "italia"],
  italia: ["franca", "alemanha"],
  holanda: ["alemanha", "franca", "inglaterra"],
  japao: ["coreia-do-sul", "australia"],
  "coreia-do-sul": ["japao", "australia"],
  uzbequistao: ["ira", "iraque", "arabia-saudita"],
  australia: ["nova-zelandia", "japao", "coreia-do-sul"],
  "arabia-saudita": ["catar", "iraque", "ira"],
  marrocos: ["argelia", "tunisia", "senegal"],
  senegal: ["mali", "gana", "costa-do-marfim"],
  nigeria: ["camaroes", "gana", "costa-do-marfim"],
  egito: ["tunisia", "argelia", "marrocos"],
  "costa-do-marfim": ["gana", "mali", "senegal"],
  "nova-zelandia": ["australia"],
};

// Convite raro de outra seleção: tenta primeiro vizinhos e só então amplia para a região.
function pickNationalitySwitchTarget(state: GameState, salt: number): string | null {
  const originCountry = countryById(state.nationality);
  const nearbyIds = NEARBY_NATIONAL_TEAMS[state.nationality] ?? [];
  const nearbyCandidates = nearbyIds
    .map((countryId) => COUNTRIES.find((country) => country.id === countryId))
    .filter((country): country is Country => Boolean(country));
  const regionalCandidates = COUNTRIES.filter((country) => {
    if (country.id === state.nationality) return false;
    if (originCountry.confederation === "SOUTH_AMERICA") return country.confederation === "SOUTH_AMERICA";
    if (originCountry.confederation === "NORTH_AMERICA") return country.confederation === "NORTH_AMERICA" || country.confederation === "SOUTH_AMERICA";
    return country.confederation === originCountry.confederation;
  });
  const candidates = nearbyCandidates.length && seeded(state.seed, salt + 19) < 0.82
    ? nearbyCandidates
    : regionalCandidates;
  if (!candidates.length) return null;
  return pick(candidates, state.seed, salt).id;
}

function maybeOfferNationalitySwitch(state: GameState, salt: number): string | null {
  if (state.nationalitySwitchInviteUsed) return null;
  if (state.age < 17 || state.age > 27) return null;
  if (state.nationalCaptain) return null;
  if (state.nationalCaps >= 18) return null;
  if (state.nationalTrophies > 0) return null;
  if (state.overall < 62) return null;
  if (seeded(state.seed, salt) > 0.05) return null;
  return pickNationalitySwitchTarget(state, salt + 31);
}

function buildNationalitySwitchEvent(from: Country, to: Country): GameEvent {
  return {
    id: NATIONALITY_SWITCH_EVENT_ID,
    icon: "↔",
    tag: "SELEÇÃO",
    title: `A Seleção de ${to.name} quer você`,
    description: `Uma federação vizinha enxergou seu potencial antes da sua consolidação na Seleção principal de ${from.name}. A escolha é sua — e não terá volta.`,
    choices: [
      {
        label: `Vestir a camisa de ${to.name}`,
        hint: "Mudança definitiva · reinício na Seleção",
        result: `Você assina os papéis e passa a defender a Seleção de ${to.name}. Não é possível voltar atrás.`,
        effect: { switchNationalityTo: to.id, reputation: 6, morale: 4 },
      },
      {
        label: `Seguir pela Seleção de ${from.name}`,
        hint: "Fidelidade à seleção original",
        result: `Você agradece o interesse, mas decide seguir representando apenas a Seleção de ${from.name}.`,
        effect: { reputation: 3, morale: 3, leadership: 2 },
      },
    ],
  };
}

function createYouthJourney(state: GameState, formationId: string) {
  const formation = FORMATIONS.find((item) => item.id === formationId) ?? FORMATIONS[0];
  const club = clubById(state.academyClubId);
  const rawScore =
    41 +
    (club.academy ?? 3) * 5 +
    formation.technical * 1.2 +
    formation.physical * 0.8 +
    formation.mental +
    seeded(state.seed, 11) * 22 -
    formation.risk * seeded(state.seed, 17);
  const score = clamp(Math.round(rawScore), 45, 98);
  const revealAge = score >= 82 ? 16 : score >= 67 ? 17 : 18;
  const startingOverall = 34 + Math.floor(seeded(state.seed, 21) * 5);
  const overall = clamp(Math.round(44 + score * 0.12 + seeded(state.seed, 22) * 4), 49, 60);
  const fateRoll = seeded(state.seed, 701);
  const ceilingRoll = seeded(state.seed, 709);
  const hiddenCeiling = fateRoll < 0.18
    ? 61 + Math.floor(ceilingRoll * 11)
    : fateRoll < 0.80
      ? 70 + Math.floor(ceilingRoll * 13)
      : fateRoll < 0.96
        ? 82 + Math.floor(ceilingRoll * 7)
        : fateRoll < 0.99
          ? 89 + Math.floor(ceilingRoll * 6)
          : 95 + Math.floor(ceilingRoll * 5);
  const potential = clamp(hiddenCeiling, overall + 1, 99);
  const used = new Set<number>();
  const youthYears: YouthYear[] = [];
  let previousOverall = startingOverall;
  for (let age = 12; age <= revealAge; age += 1) {
    let eventIndex = Math.floor(seeded(state.seed, age * 13) * YOUTH_EVENTS.length);
    while (used.has(eventIndex)) eventIndex = (eventIndex + 1) % YOUTH_EVENTS.length;
    used.add(eventIndex);
    const event = YOUTH_EVENTS[eventIndex];
    const positive = seeded(state.seed, age * 19) < score / 110;
    const progress = (age - 12) / Math.max(1, revealAge - 12);
    const yearOverall = age === revealAge
      ? overall
      : clamp(Math.round(startingOverall + (overall - startingOverall) * Math.pow(progress, 0.82)), startingOverall, overall - 1);
    const delta = age === 12 ? 0 : Math.max(1, yearOverall - previousOverall);
    youthYears.push({
      age,
      title: age === revealAge ? "A revelação" : event.title,
      text: age === revealAge ? `O ${club.shortName} colocou seu nome na lista do elenco profissional.` : positive ? event.positive : event.neutral,
      delta,
      overall: yearOverall,
    });
    previousOverall = yearOverall;
  }
  const otherOffers = randomClubSelection(
    revelationOfferPool(state),
    2,
    state.seed,
    2467 + revealAge,
    [state.academyClubId],
  ).map((offerClub) => offerClub.id);
  return {
    formation,
    score,
    revealAge,
    overall,
    potential,
    youthYears,
    offers: [state.academyClubId, ...otherOffers],
  };
}

function storyClubCandidate(state: GameState, salt: number, preference: "father" | "reject") {
  const academyClub = clubById(state.academyClubId);
  const sameCountry = CLUBS.filter((club) =>
    club.id !== academyClub.id &&
    club.countryId === academyClub.countryId &&
    (preference === "father" ? club.reputation >= 3 : true),
  );
  const regional = CLUBS.filter((club) =>
    club.id !== academyClub.id &&
    countryById(club.countryId).confederation === countryById(academyClub.countryId).confederation,
  );
  return pick(sameCountry.length ? sameCountry : regional, state.seed, salt);
}

function buildStoryFollowup(
  state: GameState,
  context: { performanceScore: number; titleCount: number; club: Club },
  chapter: number,
) {
  const story = playerStoryById(state.playerStoryId);
  const originEcho: Record<PlayerStoryId, string> = {
    "open-book": "o fato de ninguém conseguir resumir sua trajetória",
    "academy-destroyer": "a fama que chegou antes da estreia profissional",
    "humble-roots": "as pessoas que dividiram o pouco que tinham com você",
    "football-bloodline": "o sobrenome que abriu portas e criou comparações",
    disillusioned: "o período em que você quase abandonou o futebol",
    "street-football": "a rua onde seu jeito de jogar nasceu",
    "late-bloomer": "os relatórios que não enxergaram seu crescimento",
    "academy-reject": "a dispensa que quase encerrou tudo antes de começar",
    "migrant-dream": "a mudança de país que redefiniu a ideia de casa",
    "student-athlete": "o plano de vida que sempre existiu além do gramado",
    "neighborhood-idol": "o bairro que transformou sua carreira num sonho coletivo",
  };
  const beats: Array<{
    key: string;
    title: string;
    description: string;
    choices: StoryDecisionChoice[];
  }> = [
    {
      key: "mentor-return",
      title: "Uma voz do começo reapareceu no seu telefone",
      description: `Um antigo mentor lembra ${originEcho[state.playerStoryId]}. Ele não quer dinheiro nem ingresso: quer saber se você ainda reconhece o jogador que era.`,
      choices: [
        { label: "Viajar para conversar pessoalmente", hint: "Moral e equilíbrio ↑↑ · físico ↓", result: "A conversa devolve perspectiva a uma temporada que parecia consumir tudo.", effect: { morale: 12, lifeBalance: 10, fitness: -4 }, flag: "reencontrou-o-passado" },
        { label: "Convidá-lo para conhecer o clube", hint: "Liderança e treinador ↑", result: "O reencontro aproxima dois mundos e impressiona o vestiário.", effect: { leadership: 8, minutes: 5, mediaRelation: 3 }, flag: "mentor-no-clube" },
        { label: "Agradecer e manter o passado no passado", hint: "Foco ↑ · imagem ↓", result: "A resposta é curta. Você segue em frente, ainda que a mensagem permaneça na cabeça.", effect: { discipline: 7, fitness: 5, morale: -3 }, flag: "fechou-porta-passado" },
      ],
    },
    {
      key: "documentary",
      title: "Uma produtora quer filmar o capítulo que ninguém viu",
      description: `A proposta promete milhões de espectadores e acesso total à sua intimidade. O centro do documentário seria ${originEcho[state.playerStoryId]}.`,
      choices: [
        { label: "Abrir todas as portas para as câmeras", hint: "Seguidores ↑↑↑ · equilíbrio ↓↓", result: "A série vira fenômeno e transforma lembranças privadas em assunto mundial.", effect: { followers: 420_000, reputation: 7, lifeBalance: -12, mediaRelation: 5 }, flag: "documentario-sem-filtro" },
        { label: "Controlar o roteiro e preservar a família", hint: "Imagem e liderança ↑", result: "O filme encontra força justamente nos limites que você impôs.", effect: { mediaRelation: 8, leadership: 5, followers: 130_000 }, flag: "documentario-controlado" },
        { label: "Recusar qualquer adaptação da história", hint: "Equilíbrio ↑↑ · alcance ↓", result: "A produtora procura outro personagem. Sua história continua pertencendo a você.", effect: { lifeBalance: 12, morale: 6, followers: -18_000 }, flag: "recusou-documentario" },
      ],
    },
    {
      key: "origin-rival",
      title: "Um rival disse que sua história virou desculpa",
      description: `Depois de uma partida, um jogador adversário afirma que a imprensa romantiza ${originEcho[state.playerStoryId]} e ignora quem nunca recebeu atenção.`,
      choices: [
        { label: "Responder dentro de campo na próxima vez", hint: "Foco e moral ↑ · rivalidade nasce", result: "Você não cita o rival. O próximo confronto passa a valer muito mais.", effect: { morale: 9, fitness: 5, reputation: 3 }, flag: "rivalidade-da-origem" },
        { label: "Admitir que toda história recebe privilégios", hint: "Imprensa e liderança ↑↑", result: "A resposta madura desmonta a provocação e abre uma conversa maior.", effect: { mediaRelation: 11, leadership: 9, fans: 3 }, flag: "reconheceu-privilegios" },
        { label: "Transformar a fala numa guerra pública", hint: "Alcance ↑↑ · disciplina ↓↓", result: "Os cortes viralizam e a rivalidade domina a semana.", effect: { followers: 230_000, fans: 8, discipline: -10, mediaRelation: -5 }, flag: "guerra-publica-origem" },
      ],
    },
    {
      key: "personal-archive",
      title: "Uma caixa guardada por anos chegou ao clube",
      description: "Dentro dela há fotos, bilhetes e um objeto do começo da carreira. Você precisa decidir o que fazer com uma memória que agora vale dinheiro.",
      choices: [
        { label: "Doar tudo para um museu da sua cidade", hint: "Legado e torcida ↑↑", result: "A exposição vira ponto de encontro para quem acompanhou o começo.", effect: { charity: 10, fans: 10, reputation: 5 }, flag: "arquivo-no-museu" },
        { label: "Guardar a caixa sem mostrar a ninguém", hint: "Equilíbrio e moral ↑", result: "Nem toda parte de uma lenda precisa virar conteúdo.", effect: { lifeBalance: 10, morale: 9 }, flag: "arquivo-privado" },
        { label: "Leiloar o item principal por uma causa", hint: "Impacto social ↑↑↑ · memória vai embora", result: "O objeto muda de mãos e financia um projeto muito maior que ele.", effect: { charity: 17, followers: 90_000, morale: 3 }, flag: "leilao-da-memoria" },
      ],
    },
    {
      key: "career-crossroad",
      title: `${context.club.shortName} quer que você represente uma nova era`,
      description: context.performanceScore >= 75
        ? "O clube oferece protagonismo fora de campo também. Aceitar pode aprofundar sua ligação — e tornar uma futura saída muito mais dolorosa."
        : "Mesmo após um ano irregular, o clube acredita que sua história pode reconectar elenco e torcida.",
      choices: [
        { label: "Assumir o papel de rosto do projeto", hint: "Torcida e liderança ↑↑ · pressão ↑", result: "Sua imagem passa a ocupar muros, campanhas e conversas sobre o futuro.", effect: { fans: 11, leadership: 9, morale: -4, reputation: 5 }, flag: "rosto-da-nova-era" },
        { label: "Aceitar apenas responsabilidades esportivas", hint: "Treinador e foco ↑", result: "Você escolhe liderar pelo treino e pelas partidas.", effect: { minutes: 7, discipline: 6, fitness: 4 }, flag: "lideranca-no-campo" },
        { label: "Recusar para preservar sua liberdade", hint: "Equilíbrio ↑ · torcida divide", result: "A decisão evita promessas vazias, mas parte da arquibancada esperava mais.", effect: { lifeBalance: 9, fans: -5, mediaRelation: 3 }, flag: "preservou-liberdade" },
      ],
    },
    {
      key: "family-truth",
      title: "Sua família contou uma versão que você nunca conheceu",
      description: `Uma entrevista revela quanto custou manter vivo ${originEcho[state.playerStoryId]}. O relato muda detalhes que você repetiu durante anos.`,
      choices: [
        { label: "Ouvir tudo longe das câmeras", hint: "Moral e família ↑↑", result: "A conversa preenche silêncios antigos e muda sua relação com o passado.", effect: { morale: 13, lifeBalance: 9, leadership: 3 }, flag: "ouviu-a-verdade" },
        { label: "Transformar a revelação numa homenagem pública", hint: "Torcida e alcance ↑↑", result: "A homenagem emociona o estádio e devolve o protagonismo a quem ficou nos bastidores.", effect: { fans: 10, followers: 180_000, charity: 5 }, flag: "homenagem-as-raizes" },
        { label: "Pedir que a história não seja explorada", hint: "Privacidade ↑ · imprensa ↓", result: "A família aceita o limite e a pauta termina ali.", effect: { lifeBalance: 11, mediaRelation: -6, morale: 5 }, flag: "protegeu-a-familia" },
      ],
    },
    {
      key: "legacy-choice",
      title: "Uma criança repetiu sua história palavra por palavra",
      description: `Ela diz que começou a jogar por causa de “${story.title}”. Pela primeira vez, você percebe que sua origem já não pertence somente a você.`,
      choices: [
        { label: "Criar um projeto para novos jogadores", hint: "Dinheiro ↓↓ · legado ↑↑↑", result: "O primeiro treino reúne crianças que se reconhecem na sua trajetória.", effect: { money: -16, charity: 20, fans: 11, leadership: 7 }, flag: "projeto-da-origem" },
        { label: "Convidar a criança para uma partida", hint: "Moral e torcida ↑↑", result: "O encontro dura minutos e vira uma memória para a vida inteira.", effect: { morale: 12, fans: 9, followers: 80_000 }, flag: "convite-ao-estadio" },
        { label: "Escrever uma carta sem transformar em campanha", hint: "Equilíbrio e liderança ↑", result: "A resposta chega sem patrocinador, câmera ou comunicado.", effect: { lifeBalance: 8, leadership: 8, morale: 6 }, flag: "carta-sem-camera" },
      ],
    },
  ];
  const usedIds = new Set(state.storyLog.map((entry) => entry.decisionId).filter(Boolean));
  const usedTitles = new Set(state.storyLog.map((entry) => entry.title));
  const unusedOriginChapters = STORY_CHAPTER_BEATS[state.playerStoryId].filter((beat) => !usedTitles.has(beat.title));
  if (unusedOriginChapters.length) {
    return pick(unusedOriginChapters, state.seed, state.season * 1949 + chapter * 83);
  }
  const available = beats.filter((beat) => !usedIds.has(`story-followup-${beat.key}`) && !usedTitles.has(beat.title));
  const pool = available.length ? available : beats;
  return pick(pool, state.seed, state.season * 1931 + chapter * 71);
}

function buildStorySeasonDecision(
  state: GameState,
  context: { performanceScore: number; titleCount: number; club: Club },
): StoryDecision | null {
  const story = playerStoryById(state.playerStoryId);
  const chapter = state.storyLog.length + 1;
  if (chapter > 8) return null;
  const milestoneBoost =
    context.performanceScore >= 82 ||
    context.titleCount > 0 ||
    state.age === 18 ||
    state.age === 23 ||
    state.age === 30
      ? 0.16
      : 0;
  const chance = 0.27 + milestoneBoost + (chapter === 1 ? 0.11 : 0);
  if (seeded(state.seed, state.season * 1877 + chapter * 43) >= chance) return null;

  const base = {
    id: `story-${state.playerStoryId}-${state.season}-${chapter}`,
    storyId: state.playerStoryId,
    chapter,
    icon: story.icon,
    kicker: `CAPÍTULO ${String(chapter).padStart(2, "0")} · ${story.title.toLocaleUpperCase("pt-BR")}`,
  };
  const fatherClub = storyClubCandidate(state, 1889 + chapter * 17, "father");
  const rejectedClub = storyClubCandidate(state, 1901 + chapter * 19, "reject");
  const decisions: Record<PlayerStoryId, Omit<StoryDecision, keyof typeof base>> = {
    "open-book": {
      title: "Alguém tentou resumir sua carreira numa única frase",
      description: "A reportagem procura uma origem perfeita para explicar seu momento. A verdade é menos simples: sua história foi sendo escrita enquanto acontecia.",
      choices: [
        { label: "Dizer que ainda não existe uma definição", hint: "Liberdade ↑ · imagem autêntica", result: "A ausência de rótulo vira justamente a parte mais interessante da entrevista.", effect: { mediaRelation: 6, morale: 6, lifeBalance: 4 }, flag: "recusou-rotulo" },
        { label: "Escolher o trabalho como fio da história", hint: "Disciplina e treinador ↑", result: "Você transforma constância em identidade.", effect: { discipline: 8, minutes: 5, leadership: 3 }, flag: "historia-do-trabalho" },
        { label: "Deixar a torcida dar um nome à trajetória", hint: "Torcida e seguidores ↑", result: "As arquibancadas inventam apelidos e versões que você jamais escreveria sozinho.", effect: { fans: 8, followers: 85_000, reputation: 3 }, flag: "historia-da-torcida" },
      ],
    },
    "academy-destroyer": {
      title: chapter <= 2 ? "A marca de promessa virou cobrança" : "Seu antigo recorde voltou para assombrar a temporada",
      description: context.performanceScore >= 78
        ? "Os vídeos da base reaparecem ao lado dos seus melhores lances. A imprensa quer transformar talento em destino."
        : "Uma temporada humana foi tratada como queda. Seu nome ainda vende a ideia de que tudo precisa ser extraordinário.",
      choices: [
        { label: "Assumir que quer ser o melhor do mundo", hint: "Prestígio ↑↑ · pressão ↑", result: "A frase domina as manchetes. Agora todo jogo parece uma prova.", effect: { reputation: 8, followers: 180_000, morale: -6, mediaRelation: 3 }, flag: "aceitou-o-peso" },
        { label: "Proteger o vestiário e dividir o mérito", hint: "Liderança ↑↑ · torcida ↑", result: "Você recusa o personagem de salvador e ganha o elenco.", effect: { leadership: 9, fans: 6, minutes: 4 }, flag: "dividiu-os-holofotes" },
        { label: "Fechar as redes por um mês", hint: "Equilíbrio ↑ · alcance ↓", result: "O silêncio diminui o barulho e devolve prazer ao treino.", effect: { lifeBalance: 10, morale: 8, followers: -45_000, mediaRelation: -3 }, flag: "sumiu-dos-holofotes" },
      ],
    },
    "humble-roots": {
      title: "Uma ligação de casa mudou o valor do próximo contrato",
      description: "A família pode finalmente sair do aperto, mas o pedido chega quando você também tenta construir sua própria vida.",
      choices: [
        { label: "Comprar uma casa para a família", hint: "Dinheiro ↓↓ · moral e legado ↑", result: "A chave vale mais que qualquer prêmio daquela temporada.", effect: { money: -18, morale: 13, leadership: 5, fans: 5 }, flag: "casa-da-familia" },
        { label: "Criar um fundo mensal organizado", hint: "Dinheiro ↓ · equilíbrio ↑", result: "Você ajuda sem transformar cada emergência em crise.", effect: { money: -8, lifeBalance: 9, discipline: 4, morale: 5 }, flag: "fundo-familiar" },
        { label: "Dizer que ainda não é a hora", hint: "Foco ↑ · moral ↓", result: "A decisão protege sua carreira e pesa nas conversas de domingo.", effect: { fitness: 6, minutes: 4, morale: -9, lifeBalance: -5 }, flag: "adiou-a-ajuda" },
      ],
    },
    "football-bloodline": {
      title: `${fatherClub.shortName}, o clube que marcou seu pai, quer conversar`,
      description: `A proposta não é apenas esportiva. Para muita gente, vestir essa camisa fecharia um círculo; para você, pode abrir uma comparação impossível.`,
      choices: [
        { label: `Ouvir o projeto do ${fatherClub.shortName}`, hint: "Proposta especial liberada", result: "Seu empresário coloca a proposta na mesa. A decisão final ainda será sua.", effect: { reputation: 5, morale: 4 }, transferClubId: fatherClub.id, flag: `ouviu-clube-do-pai:${fatherClub.id}` },
        { label: "Dizer que sua história precisa ser outra", hint: "Personalidade ↑ · imprensa divide", result: "A resposta é respeitosa e definitiva. Pela primeira vez, a manchete usa apenas seu nome.", effect: { leadership: 8, mediaRelation: -2, reputation: 4 }, flag: "rompeu-comparacao" },
        { label: "Pedir conselho ao seu pai em público", hint: "Moral ↑ · pressão ↑", result: "A conversa emociona torcedores e reacende todas as comparações.", effect: { morale: 10, followers: 150_000, lifeBalance: -4 }, flag: "conselho-do-pai" },
      ],
    },
    disillusioned: {
      title: "Depois do treino, você ficou sozinho no gramado",
      description: context.performanceScore < 60
        ? "A velha pergunta voltou: você ainda quer isso ou apenas aprendeu a continuar?"
        : "Mesmo num grande ano, a comemoração pareceu distante. Vencer e sentir são coisas diferentes.",
      choices: [
        { label: "Procurar o treinador que fez você amar o jogo", hint: "Paixão ↑↑ · potencial pode florescer", result: "Uma conversa sem câmeras devolve sentido aos próximos meses.", effect: { morale: 15, lifeBalance: 9, potential: 1 }, flag: "reencontrou-mentor" },
        { label: "Transformar tudo em disciplina", hint: "Físico e OVR ↑ · equilíbrio ↓", result: "Você não encontra alegria, mas encontra método.", effect: { ovr: 1, fitness: 8, discipline: 7, lifeBalance: -9 }, flag: "virou-maquina" },
        { label: "Admitir publicamente que não está bem", hint: "Imprensa ↑ · reputação oscila", result: "A honestidade surpreende. Muitos atletas se reconhecem em você.", effect: { mediaRelation: 12, followers: 120_000, reputation: -2, morale: 6 }, flag: "falou-sobre-a-mente" },
      ],
    },
    "street-football": {
      title: "O treinador quer tirar o improviso do seu jogo",
      description: "A comissão mostra números: seus riscos criam lances inesquecíveis e contra-ataques perigosos na mesma proporção.",
      choices: [
        { label: "Aprender o sistema sem perder a ousadia", hint: "Controle ↑↑ · evolução equilibrada", result: "Você passa a escolher melhor quando quebrar o roteiro.", effect: { ovr: 1, discipline: 7, minutes: 5 }, flag: "domou-o-caos" },
        { label: "Dizer que foi o improviso que trouxe você até aqui", hint: "Torcida ↑↑ · treinador ↓", result: "A arquibancada compra sua briga; a comissão não esquece.", effect: { fans: 11, followers: 130_000, minutes: -9, morale: 6 }, flag: "defendeu-a-rua" },
        { label: "Treinar a jogada secreta depois do expediente", hint: "50% · lance histórico ou desgaste", result: "Você guarda uma nova jogada para o momento certo.", effect: { fitness: -7, potential: 1, reputation: 3 }, flag: "jogada-secreta" },
      ],
    },
    "late-bloomer": {
      title: "O olheiro que ignorou você pediu uma nova avaliação",
      description: "O relatório antigo dizia que faltava explosão e futuro. Agora o mesmo nome aparece numa mensagem elogiando sua evolução.",
      choices: [
        { label: "Responder com o relatório emoldurado", hint: "Moral ↑ · rivalidade pessoal", result: "A provocação viraliza e vira combustível para a temporada.", effect: { morale: 12, followers: 95_000, mediaRelation: -4 }, flag: "emoldurou-o-relatorio" },
        { label: "Aceitar a conversa e ouvir o que mudou", hint: "Potencial ↑ · maturidade ↑", result: "Você descobre detalhes do próprio jogo que nunca tinha percebido.", effect: { potential: 2, leadership: 5, discipline: 4 }, flag: "ouviu-o-olheiro" },
        { label: "Ignorar e continuar trabalhando", hint: "Físico ↑ · perfil discreto", result: "Nenhuma postagem, nenhuma resposta. Só mais uma sessão de treino.", effect: { fitness: 9, ovr: 1, followers: -12_000 }, flag: "respondeu-no-campo" },
      ],
    },
    "academy-reject": {
      title: `${rejectedClub.shortName} apareceu no seu caminho`,
      description: `Um dirigente ligado à sua primeira dispensa agora admite que o clube errou. Há uma proposta informal e um pedido de desculpas.`,
      choices: [
        { label: `Aceitar conversar com o ${rejectedClub.shortName}`, hint: "Proposta especial · ferida aberta", result: "O clube que disse não agora precisa convencer você.", effect: { reputation: 5, morale: 3 }, transferClubId: rejectedClub.id, flag: `reabriu-porta:${rejectedClub.id}` },
        { label: "Aceitar as desculpas, recusar a proposta", hint: "Maturidade ↑↑", result: "O passado perde força sem precisar ser apagado.", effect: { leadership: 10, lifeBalance: 8, morale: 6 }, flag: "perdoou-sem-voltar" },
        { label: "Publicar o relatório da dispensa", hint: "Viral ↑↑ · imprensa ↓", result: "A internet transforma sua rejeição em símbolo. O clube chama a atitude de desnecessária.", effect: { followers: 210_000, fans: 8, mediaRelation: -10, reputation: 3 }, flag: "expos-a-dispensa" },
      ],
    },
    "migrant-dream": {
      title: "Duas bandeiras apareceram na mesma arquibancada",
      description: "Uma reportagem quer definir a qual lugar você pertence. Sua família sabe que a resposta nunca coube numa palavra.",
      choices: [
        { label: "Dizer que carrega os dois lugares", hint: "Imagem ↑↑ · adaptação ↑", result: "A resposta atravessa fronteiras e aproxima comunidades diferentes.", effect: { followers: 170_000, mediaRelation: 9, adaptation: 9, leadership: 4 }, flag: "duas-casas" },
        { label: "Dedicar a temporada ao país da sua base", hint: "Torcida local ↑ · raízes fortes", result: "A cidade onde você cresceu adota a frase como lema.", effect: { fans: 10, morale: 7, reputation: 4 }, flag: "escolheu-a-base" },
        { label: "Recusar transformar identidade em manchete", hint: "Equilíbrio ↑ · imprensa ↓", result: "Você protege sua família e encerra a pauta.", effect: { lifeBalance: 11, mediaRelation: -7, morale: 5 }, flag: "protegeu-identidade" },
      ],
    },
    "student-athlete": {
      title: "Uma universidade ofereceu um curso feito ao redor da sua carreira",
      description: "A oportunidade exige horas semanais e promete algo raro: um futuro que não depende do próximo contrato.",
      choices: [
        { label: "Aceitar o curso completo", hint: "Visão e liderança ↑ · físico ↓", result: "As noites ficam menores, mas seu modo de ler o jogo muda.", effect: { leadership: 9, mediaRelation: 6, fitness: -6, lifeBalance: 3 }, flag: "entrou-na-universidade" },
        { label: "Fazer apenas módulos nas férias", hint: "Equilíbrio · disciplina ↑", result: "Você encontra um ritmo que não sacrifica o campo.", effect: { discipline: 7, lifeBalance: 7, leadership: 3 }, flag: "curso-nas-ferias" },
        { label: "Adiar até a aposentadoria", hint: "Foco esportivo ↑ · plano B distante", result: "O futebol ocupa todo o calendário novamente.", effect: { fitness: 7, minutes: 4, lifeBalance: -4 }, flag: "adiou-os-estudos" },
      ],
    },
    "neighborhood-idol": {
      title: "O campo onde você começou pode desaparecer",
      description: "O terreno será vendido se a comunidade não levantar dinheiro e atenção. Seu nome pode salvar o lugar — mas o projeto exige presença real.",
      choices: [
        { label: "Comprar e reformar o campo", hint: "Dinheiro ↓↓↓ · legado ↑↑↑", result: "As luzes acendem de novo. Uma placa pequena leva seu nome; o campo continua sendo do bairro.", effect: { money: -25, charity: 18, fans: 12, leadership: 8 }, flag: "salvou-o-campo" },
        { label: "Mobilizar patrocinadores e torcida", hint: "Imagem e alcance ↑ · desgaste", result: "A campanha bate a meta sem depender apenas do seu bolso.", effect: { followers: 190_000, charity: 12, mediaRelation: 7, fitness: -5 }, flag: "campanha-pelo-campo" },
        { label: "Fazer uma doação discreta", hint: "Dinheiro ↓ · equilíbrio ↑", result: "O projeto ganha fôlego sem transformar ajuda em publicidade.", effect: { money: -9, charity: 8, morale: 9, followers: -5_000 }, flag: "ajuda-discreta" },
      ],
    },
  };
  const signatureDecision = decisions[state.playerStoryId];
  const signatureWasSeen = state.storyLog.some((entry) => entry.title === signatureDecision.title);
  if (chapter === 1 && !signatureWasSeen) return { ...base, ...signatureDecision };
  const followup = buildStoryFollowup(state, context, chapter);
  return {
    ...base,
    id: `story-followup-${followup.key}-${state.season}-${chapter}`,
    title: followup.title,
    description: followup.description,
    choices: followup.choices,
  };
}

function buildPressConference(
  state: GameState,
  match: PendingBotaoMatch,
  result: BotaoMatchResult,
  opponentName: string,
): PressConference {
  const wonTitle = result.champion && match.stageName === "Final";
  const story = playerStoryById(state.playerStoryId);
  const pool: PressQuestion[] = [
    {
      id: "individual-night",
      context: `${result.playerGoals} gol(s), ${result.playerAssists} assistência(s) e o prêmio de melhor em campo.`,
      question: "Foi a melhor atuação da sua carreira até aqui?",
      answers: [
        { label: "Foi uma noite que eu nunca vou esquecer", tone: "bold", result: "A confiança vira manchete e a torcida abraça o protagonista.", effect: { morale: 7, fans: 5, followers: 45_000 } },
        { label: "O prêmio pertence ao time inteiro", tone: "team", result: "O elenco recebe a fala como um gesto real, não como frase pronta.", effect: { leadership: 7, minutes: 4, fans: 3 } },
        { label: "Ainda consigo jogar muito melhor", tone: "calm", result: "A cobrança sobre você aumenta, junto com o respeito pela ambição.", effect: { reputation: 5, morale: -2, mediaRelation: 2 } },
      ],
    },
    {
      id: "opposition",
      context: `${opponentName} tentou tirar seu espaço até o último lance.`,
      question: `O que fez a diferença contra o ${opponentName}?`,
      answers: [
        { label: "Nós entendemos onde eles eram vulneráveis", tone: "calm", result: "A resposta tática agrada a comissão.", effect: { minutes: 6, leadership: 3, mediaRelation: 3 } },
        { label: "Em decisão, personalidade pesa mais", tone: "bold", result: "A frase vira corte de vídeo e provoca o adversário.", effect: { reputation: 6, followers: 65_000, discipline: -2 } },
        { label: "Respeito total; eles nos levaram ao limite", tone: "team", result: "A fala baixa a temperatura depois da partida.", effect: { mediaRelation: 6, leadership: 4, fans: 2 } },
      ],
    },
    {
      id: "next-step",
      context: wonTitle ? "A taça ainda está no gramado." : "A classificação já muda o tamanho da temporada.",
      question: wonTitle ? "Essa conquista muda seu lugar na história do clube?" : "Até onde esse time pode chegar agora?",
      answers: [
        { label: wonTitle ? "Quero virar eterno aqui" : "Nós vamos buscar o título", tone: "bold", result: "A promessa aumenta sua ligação com a arquibancada e a cobrança do próximo capítulo.", effect: { fans: 8, reputation: 5, morale: 3 } },
        { label: "A temporada só termina quando o calendário acabar", tone: "calm", result: "A comissão gosta do foco imediato.", effect: { fitness: 4, minutes: 4, discipline: 3 } },
        { label: "Hoje é dia de agradecer quem veio com a gente", tone: "team", result: "A resposta divide o holofote e fortalece sua imagem de líder.", effect: { leadership: 8, mediaRelation: 5, followers: 35_000 } },
      ],
    },
    {
      id: "origin",
      context: `Sua origem como “${story.title}” voltou a ser lembrada durante a transmissão.`,
      question: "Quanto daquela história ainda entra em campo com você?",
      answers: [
        { label: "Tudo. Eu não seria o mesmo sem ela", tone: "bold", result: "Sua origem vira parte pública da identidade do jogador.", effect: { morale: 7, followers: 55_000, fans: 4 } },
        { label: "Ela me formou, mas não me prende", tone: "calm", result: "A resposta marca uma distância madura entre passado e presente.", effect: { leadership: 6, lifeBalance: 5, mediaRelation: 3 } },
        { label: "Prefiro guardar essa parte para minha família", tone: "team", result: "A imprensa respeita o limite, ainda que a curiosidade continue.", effect: { lifeBalance: 8, mediaRelation: -2, morale: 4 } },
      ],
    },
  ];
  const questionCount = 1 + Math.floor(seeded(state.seed, match.season * 1999 + match.id.length) * 3);
  const questions = pool
    .map((question, index) => ({ question, order: seeded(state.seed, match.season * 2003 + index * 37 + match.id.length) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, questionCount)
    .map(({ question }) => question);
  return {
    matchId: match.id,
    competitionName: match.competitionName,
    opponentName,
    questionIndex: 0,
    questions,
  };
}

function applyEffect(state: GameState, effect: Effect) {
  const overall = clamp(state.overall + (effect.ovr ?? 0), 40, 99);
  const signedSponsor: SponsorDeal | null = effect.sponsorBrand
    ? {
        id: `${state.seed}-${state.season}-${effect.sponsorBrand}`,
        brand: effect.sponsorBrand,
        startSeason: state.season,
        endSeason: state.season + Math.max(1, effect.sponsorYears ?? 2),
        annualValue: Math.max(50_000, effect.sponsorValue ?? 100_000),
        signedAtFollowers: state.followers,
        status: "active",
      }
    : null;
  return {
    ...state,
    overall,
    attributes: shiftPlayerAttributes(state.attributes, effect.ovr ?? 0, state.position, state.seed + state.season),
    potential: clamp(state.potential + (effect.potential ?? 0), 45, 99),
    morale: clamp(state.morale + (effect.morale ?? 0)),
    fitness: clamp(state.fitness + (effect.fitness ?? 0)),
    reputation: clamp(state.reputation + (effect.reputation ?? 0), 0, 100),
    leadership: clamp(state.leadership + (effect.leadership ?? 0), 0, 100),
    money: Math.max(0, state.money + (effect.money ?? 0) * 10_000),
    spendableMoney: Math.max(0, state.spendableMoney + Math.round((effect.money ?? 0) * 3_500)),
    nationalLevel: clamp(state.nationalLevel + (effect.nationalBoost ?? 0), 0, 100),
    fanSupport: clamp(state.fanSupport + (effect.fans ?? 0), 0, 100),
    adaptation: clamp(state.adaptation + (effect.adaptation ?? 0), 0, 100),
    managerTrust: clamp(state.managerTrust + (effect.minutes ?? 0) * 0.7 + (effect.leadership ?? 0) * 0.15),
    discipline: clamp(state.discipline + (effect.discipline ?? 0)),
    contractYears: Math.max(0, state.contractYears + (effect.contractYears ?? 0)),
    annualSalary: Math.round(state.annualSalary * (1 + (effect.salaryBoost ?? 0) / 100)),
    clubCaptain: Boolean(state.clubCaptain || effect.clubCaptain),
    followers: Math.max(0, state.followers + (effect.followers ?? 0)),
    socialSentiment: clamp(state.socialSentiment + (effect.socialSentiment ?? 0)),
    mediaRelation: clamp(state.mediaRelation + (effect.mediaRelation ?? 0)),
    lifeBalance: clamp(state.lifeBalance + (effect.lifeBalance ?? 0)),
    charityReputation: clamp(state.charityReputation + (effect.charity ?? 0)),
    activeSponsor: signedSponsor ?? state.activeSponsor,
  };
}

function applyStoryOrigin(state: GameState, storyId: PlayerStoryId) {
  const story = playerStoryById(storyId);
  const modifiers = story.modifiers;
  const overallDelta = modifiers.overall ?? 0;
  let attributes = shiftPlayerAttributes(state.attributes, overallDelta, state.position, state.seed + 1709);
  if (storyId === "street-football") {
    attributes = {
      ...attributes,
      dribbling: clamp(attributes.dribbling + 5, 15, 99),
      firstTouch: clamp(attributes.firstTouch + 4, 15, 99),
      composure: clamp(attributes.composure + 2, 15, 99),
    };
  } else if (storyId === "student-athlete") {
    attributes = {
      ...attributes,
      vision: clamp(attributes.vision + 5, 15, 99),
      passing: clamp(attributes.passing + 3, 15, 99),
    };
  }
  return {
    ...state,
    playerStoryId: storyId,
    overall: clamp(state.overall + overallDelta, 38, 99),
    potential: clamp(state.potential + (modifiers.potential ?? 0), 50, 99),
    attributes,
    morale: clamp(state.morale + (modifiers.morale ?? 0)),
    fitness: clamp(state.fitness + (modifiers.fitness ?? 0)),
    reputation: clamp(state.reputation + (modifiers.reputation ?? 0)),
    leadership: clamp(state.leadership + (modifiers.leadership ?? 0)),
    discipline: clamp(state.discipline + (modifiers.discipline ?? 0)),
    fanSupport: clamp(state.fanSupport + (modifiers.fanSupport ?? 0)),
    managerTrust: clamp(state.managerTrust + (modifiers.managerTrust ?? 0)),
    followers: Math.max(0, state.followers + (modifiers.followers ?? 0)),
    mediaRelation: clamp(state.mediaRelation + (modifiers.mediaRelation ?? 0)),
    lifeBalance: clamp(state.lifeBalance + (modifiers.lifeBalance ?? 0)),
    charityReputation: clamp(state.charityReputation + (modifiers.charityReputation ?? 0)),
    adaptation: clamp(state.adaptation + (modifiers.adaptation ?? 0)),
    money: Math.max(0, state.money + (modifiers.money ?? 0) * 10_000),
  };
}

function isNegativeConsequence(change: string) {
  const normalized = change.toLocaleLowerCase("pt-BR");
  return change.startsWith("-") || normalized.includes("piorou") || normalized.includes("risco") || normalized.includes("despedida");
}

function simulateSeason(
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
  const playsRecopaSudamericana = clubConfederation(club) === "SOUTH_AMERICA" && wonLastSeason(["libertadores"]);
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
    champions: { id: "championsLeague", name: "Champions League", icon: "UCL" },
    europa: { id: "europaLeague", name: "Europa League", icon: "UEL" },
    conference: { id: "conferenceLeague", name: "Conference League", icon: "UECL" },
    concacaf: { id: "concacafChampions", name: "Copa de Campeões Concacaf", icon: "CCC" },
    asian: { id: "afcChampions", name: "AFC Champions League Elite", icon: "ACL" },
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
  if (inEurope && isKeeper && cleanSheets >= 16 && nextOverall >= 85 && seeded(state.seed, state.season * 179) > 0.7) awards.push("Troféu Yashin");
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
  const worldXiMerit =
    inEurope &&
    appearances >= 25 &&
    (
      (nextOverall >= 87 && performanceScore >= 84) ||
      (hasEuropeanGoldenShoe && nextOverall >= 82 && performanceScore >= 76) ||
      (hasLeagueGoldenBoot && league.prestige >= 3 && nextOverall >= 83 && performanceScore >= 78) ||
      (hasAssistKingAward && league.prestige >= 3 && nextOverall >= 83 && performanceScore >= 80)
    );
  const worldXiChance =
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
      concacafChampions: 90,
      afcChampions: 90,
      europaLeague: 85,
      conferenceLeague: 80,
      domesticCup: 70,
      uefaSuperCup: 60,
      recopaSudamericana: 60,
      domesticSuperCup: 55,
      campeonesCup: 55,
    };
    competitions
      .filter((competition) =>
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
  const wonContinentalForWorld = continentalChampion && (playsContinental === "libertadores" || playsContinental === "champions" || playsContinental === "concacaf" || playsContinental === "asian");
  const nextWorldQualifiedSeason = wonContinentalForWorld ? affected.season + 1 : affected.worldQualifiedSeason === affected.season ? 0 : affected.worldQualifiedSeason;
  const nextWorldQualifiedClubId = wonContinentalForWorld ? club.id : affected.worldQualifiedSeason === affected.season ? "" : affected.worldQualifiedClubId;
  const nextAwardCabinet = { ...affected.awardCabinet };
  awards.forEach((award) => { nextAwardCabinet[award] = (nextAwardCabinet[award] ?? 0) + 1; });
  const clubConfed = clubConfederation(club);
  const isSecondDivision = league.id === "brasileirao-b" || league.id === "championship";
  const nextContinentalSlot: ContinentalSlot | null = isSecondDivision
    ? (cupChampion ? (league.id === "brasileirao-b" ? "libertadores" : "europa") : null)
    : clubConfed === "SOUTH_AMERICA"
    ? (leagueChampion || cupChampion || leaguePosition <= 6 ? "libertadores" : null)
    : clubConfed === "NORTH_AMERICA"
      ? (leagueChampion || leaguePosition <= (league.championsPlaces || 4) ? "concacaf" : null)
      : clubConfed === "ASIA"
        ? (leagueChampion || cupChampion || leaguePosition <= (league.championsPlaces || 3) ? "asian" : null)
        : clubConfed !== "EUROPE"
          ? null
          : (leagueChampion || leaguePosition <= league.championsPlaces
              ? "champions"
              : cupChampion || leaguePosition <= league.europaPlaces
                ? "europa"
                : leaguePosition <= league.conferencePlaces
                  ? "conference"
                  : null);
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
  const organicFollowerGain = Math.max(500, Math.round(
    (
      1_200 +
      performanceScore * performanceScore * 34 +
      titleCount * 85_000 +
      awards.length * 48_000 +
      europeanSpotlight * 14_000 +
      (calledUp ? 26_000 : 0)
    ) *
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
  return {
    ...nextBase,
    nextEventId: nationalitySwitchTarget ? NATIONALITY_SWITCH_EVENT_ID : selectNextEvent(nextBase, affected.season * 37),
    pendingNationalitySwitchTarget: nationalitySwitchTarget ?? "",
    nationalitySwitchInviteUsed: nextBase.nationalitySwitchInviteUsed || Boolean(nationalitySwitchTarget),
    transferOffers,
    legacyPoints,
    unlockedAchievements: [...nextBase.unlockedAchievements, ...newlyUnlocked.map((achievement) => achievement.id)],
    newsFeed: [...achievementNews, ...offFieldNews, seasonHeadline, ...nextBase.newsFeed].slice(0, 16),
  };
}

function eventForState(state: GameState) {
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

function signProfessionalForSimulation(state: GameState, clubId: string): GameState {
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

function completeSimulationTransfer(state: GameState, clubId: string | null): GameState {
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

function simulateMonteCarloCareer(seed: number, careerIndex: number): MonteCarloCareerSummary {
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
    if (state.loanParentClubId && state.season >= state.loanEndSeason) {
      state = {
        ...state,
        currentClubId: state.loanParentClubId,
        currentLeagueId: state.loanParentLeagueId || clubById(state.loanParentClubId).leagueId,
        loanParentClubId: "",
        loanParentLeagueId: "",
        loanEndSeason: 0,
        pendingTransferMode: "permanent",
      };
    }
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

function runMonteCarloCareers(runs: number, seedBase = 20260723): MonteCarloReport {
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

function LocalBadgeImage({
  path,
  kind,
  onAvailabilityChange,
}: {
  path: string;
  kind: "club" | "flag" | "competition";
  onAvailabilityChange?: (available: boolean) => void;
}) {
  const [failedSource, setFailedSource] = useState("");
  const source = path.startsWith("data:") || /^https:\/\//i.test(path)
    ? path
    : `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

  if (failedSource === source) return null;

  return (
    <Image
      className={`badge-image badge-image-${kind}`}
      src={source}
      alt=""
      fill
      sizes={kind === "club" ? "85px" : kind === "flag" ? "68px" : "34px"}
      unoptimized
      draggable={false}
      onLoad={() => onAvailabilityChange?.(true)}
      onError={() => {
        setFailedSource(source);
        onAvailabilityChange?.(false);
      }}
    />
  );
}

function ClubBadge({ club, size = "md" }: { club: Club; size?: "sm" | "md" | "lg" }) {
  const [loadedClubId, setLoadedClubId] = useState("");
  const hasImage = loadedClubId === club.id;
  return (
    <span
      className={`club-badge club-badge-${size} ${hasImage ? "has-image" : "is-fallback"}`}
      style={{ "--club-primary": club.primary, "--club-secondary": club.secondary } as CSSProperties}
      aria-hidden="true"
    >
      <span className="badge-fallback">{club.abbr}</span>
      {(club.customBadge || VERIFIED_CLUB_ASSET_IDS.has(club.id)) && (
        <LocalBadgeImage
          path={club.customBadge || `/assets/clubs/${club.id}.png`}
          kind="club"
          onAvailabilityChange={(available) => setLoadedClubId(available ? club.id : "")}
        />
      )}
    </span>
  );
}

function BrandMark({ size = "md" }: { size?: "sm" | "md" | "hero" }) {
  const pixels = size === "hero" ? 92 : size === "sm" ? 27 : 34;
  const source = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon.svg`;
  return (
    <span className={`brand-mark brand-mark-${size}`} aria-hidden="true">
      <Image src={source} alt="" width={pixels} height={pixels} unoptimized draggable={false} />
    </span>
  );
}

function NationBadge({ country, size = "md" }: { country: Country; size?: "sm" | "md" | "lg" }) {
  const [loadedCountryId, setLoadedCountryId] = useState("");
  const hasImage = loadedCountryId === country.id;
  return (
    <span
      className={`nation-badge nation-badge-${size} ${hasImage ? "has-image" : "is-fallback"}`}
      style={{ "--nation-primary": country.primary, "--nation-secondary": country.secondary } as CSSProperties}
      aria-hidden="true"
    >
      <span className="badge-fallback">{country.abbr}</span>
      <LocalBadgeImage path={`/assets/flags/${country.id}.png`} kind="flag" onAvailabilityChange={(available) => setLoadedCountryId(available ? country.id : "")} />
    </span>
  );
}

function CompetitionBadge({ competition, leagueId }: { competition: CompetitionResult; leagueId: string }) {
  const [imageAvailable, setImageAvailable] = useState(false);
  const path = competition.id === "domesticLeague"
    ? `/assets/competitions/leagues/${leagueId}.png`
    : competition.id === "domesticCup"
      ? `/assets/competitions/cups/${leagueId}.png`
      : competition.id === "domesticSuperCup"
        ? `/assets/competitions/supercups/${leagueId}.png`
      : `/assets/competitions/${competition.id}.png`;

  return (
    <span className={`competition-emblem ${imageAvailable ? "has-image" : "is-fallback"}`} aria-hidden="true">
      <b>{competition.icon}</b>
      <LocalBadgeImage path={path} kind="competition" onAvailabilityChange={setImageAvailable} />
    </span>
  );
}

const TROPHY_PRESENTATIONS: {
  id: keyof TrophyCabinet;
  label: string;
  shortLabel: string;
  group: "NACIONAIS" | "CONTINENTAIS" | "MUNDIAIS";
  symbol: string;
  imagePath?: string;
}[] = [
  { id: "domesticLeague", label: "Ligas nacionais", shortLabel: "LIGAS", group: "NACIONAIS", symbol: "◆" },
  { id: "domesticCup", label: "Copas nacionais", shortLabel: "COPAS", group: "NACIONAIS", symbol: "♜" },
  { id: "domesticSuperCup", label: "Supercopas nacionais", shortLabel: "SUP.", group: "NACIONAIS", symbol: "✦" },
  { id: "libertadores", label: "Libertadores", shortLabel: "LIB", group: "CONTINENTAIS", symbol: "L", imagePath: "/assets/competitions/libertadores.png" },
  { id: "recopaSudamericana", label: "Recopa Sul-Americana", shortLabel: "REC", group: "CONTINENTAIS", symbol: "R", imagePath: "/assets/competitions/recopaSudamericana.png" },
  { id: "championsLeague", label: "Champions League", shortLabel: "UCL", group: "CONTINENTAIS", symbol: "★", imagePath: "/assets/competitions/championsLeague.png" },
  { id: "uefaSuperCup", label: "Supercopa da UEFA", shortLabel: "USC", group: "CONTINENTAIS", symbol: "U", imagePath: "/assets/competitions/uefaSuperCup.png" },
  { id: "europaLeague", label: "Europa League", shortLabel: "UEL", group: "CONTINENTAIS", symbol: "E", imagePath: "/assets/competitions/europaLeague.png" },
  { id: "conferenceLeague", label: "Conference League", shortLabel: "UECL", group: "CONTINENTAIS", symbol: "C", imagePath: "/assets/competitions/conferenceLeague.png" },
  { id: "concacafChampions", label: "Copa dos Campeões Concacaf", shortLabel: "CCC", group: "CONTINENTAIS", symbol: "N", imagePath: "/assets/competitions/concacafChampions.png" },
  { id: "afcChampions", label: "AFC Champions League Elite", shortLabel: "ACL", group: "CONTINENTAIS", symbol: "A", imagePath: "/assets/competitions/afcChampions.png" },
  { id: "campeonesCup", label: "Campeones Cup", shortLabel: "CAM", group: "CONTINENTAIS", symbol: "C", imagePath: "/assets/competitions/campeonesCup.png" },
  { id: "mundial", label: "Mundial de Clubes", shortLabel: "MUN", group: "MUNDIAIS", symbol: "◉", imagePath: "/assets/competitions/mundial.png" },
];

function TrophyGallery({ state, final = false }: { state: GameState; final?: boolean }) {
  const totalClubTitles = Object.values(state.trophyCabinet).reduce((total, count) => total + count, 0);
  const recentTitles = state.history
    .flatMap((record) => record.competitions
      .filter((competition) => competition.champion)
      .map((competition) => ({ record, competition })))
    .reverse()
    .slice(0, final ? 12 : 6);

  return (
    <section className={`trophy-gallery ${final ? "trophy-gallery-final" : ""}`}>
      <header className="trophy-gallery-hero">
        <div>
          <span>{final ? "GALERIA DE TÍTULOS" : "SALA DE TROFÉUS"}</span>
          <strong>{totalClubTitles + state.nationalTrophies}</strong>
          <small>taças levantadas</small>
        </div>
        <b aria-hidden="true">🏆</b>
      </header>
      <div className="trophy-groups">
        {(["NACIONAIS", "CONTINENTAIS", "MUNDIAIS"] as const).map((group) => {
          const entries = TROPHY_PRESENTATIONS.filter((presentation) => presentation.group === group);
          const groupTotal = entries.reduce((total, presentation) => total + state.trophyCabinet[presentation.id], 0);
          return (
            <section className={groupTotal > 0 ? "has-titles" : ""} key={group}>
              <header><span>{group}</span><b>{groupTotal}</b></header>
              <div>
                {entries.map((presentation) => {
                  const count = state.trophyCabinet[presentation.id];
                  return (
                    <article className={count > 0 ? "won" : "empty"} key={presentation.id}>
                      <span className="trophy-medallion" aria-hidden="true">
                        <b>{presentation.symbol}</b>
                        {presentation.imagePath && <LocalBadgeImage path={presentation.imagePath} kind="competition" />}
                      </span>
                      <div><strong>{presentation.label}</strong><small>{count > 0 ? `${count} conquista${count > 1 ? "s" : ""}` : "Ainda não conquistada"}</small></div>
                      <b>{count}</b>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        <section className={state.nationalTrophies > 0 ? "has-titles national-trophy-group" : "national-trophy-group"}>
          <header><span>SELEÇÃO</span><b>{state.nationalTrophies}</b></header>
          <div>
            <article className={state.nationalTrophies > 0 ? "won" : "empty"}>
              <span className="trophy-medallion national" aria-hidden="true">★</span>
              <div><strong>Títulos pela Seleção</strong><small>{state.nationalTrophies > 0 ? `${state.nationalTrophies} conquista${state.nationalTrophies > 1 ? "s" : ""}` : "O país ainda espera sua taça"}</small></div>
              <b>{state.nationalTrophies}</b>
            </article>
            {state.nationalHistory.filter((record) => record.champion).slice().reverse().map((record) => (
              <article className="won national-title-detail" key={`${record.season}-${record.name}`}>
                <span className="trophy-medallion national" aria-hidden="true">{record.icon}</span>
                <div><strong>{record.name}</strong><small>{record.season} · {record.tier === "main" ? "Seleção principal" : record.tier === "olympic" ? "Seleção olímpica" : record.tier === "sub20" ? "Seleção Sub-20" : "Seleção Sub-17"}</small></div>
                <b>★</b>
              </article>
            ))}
          </div>
        </section>
      </div>
      {!final && recentTitles.length > 0 && (
        <div className="recent-titles">
          <header><span>ÚLTIMAS VOLTAS OLÍMPICAS</span><small>{recentTitles.length} mais recentes</small></header>
          <div>
            {recentTitles.map(({ record, competition }, index) => {
              const titleClub = clubById(record.clubId);
              return (
                <article key={`${record.season}-${record.clubId}-${competition.id}-${index}`}>
                  <CompetitionBadge competition={competition} leagueId={titleClub.leagueId} />
                  <div><strong>{competition.name}</strong><small>{record.season} · {titleClub.shortName}</small></div>
                  <b>CAMPEÃO</b>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AwardReveal({ award }: { award: string }) {
  const presentation = awardPresentation(award);
  return (
    <article className={`award-reveal-card award-${presentation.tier}`}>
      <span className="award-reveal-icon">{presentation.icon}</span>
      <div>
        <small>{presentation.kicker}</small>
        <strong>{award}</strong>
        <p>{presentation.description}</p>
      </div>
      <b>{presentation.tier === "legendary" ? "MELHOR DO MUNDO" : "CONQUISTADO"}</b>
    </article>
  );
}

function AwardCeremony({
  award,
  playerName,
  seed,
  season,
  won,
  winner,
  finalists: providedFinalists,
}: {
  award: string;
  playerName: string;
  seed: number;
  season: number;
  won: boolean;
  winner: string;
  finalists?: string[];
}) {
  const [revealed, setRevealed] = useState(false);
  const presentation = awardPresentation(award);
  const finalists = useMemo(
    () => providedFinalists?.length === 3 ? providedFinalists : awardFinalists(playerName, award, seed, season),
    [providedFinalists, playerName, award, seed, season],
  );
  const revealedWinner = won ? playerName : winner;

  return (
    <article className={`award-ceremony award-${presentation.tier} ${revealed ? "revealed" : ""}`}>
      <div className="award-ceremony-top">
        <span>{presentation.icon}</span>
        <div><small>OS TRÊS FINALISTAS</small><strong>{award}</strong></div>
      </div>
      {!revealed ? (
        <>
          <div className="award-finalists">
            {finalists.map((name, index) => (
              <div className={name === playerName ? "is-player" : ""} key={name}>
                <b>0{index + 1}</b><span>{name}</span>{name === playerName && <small>VOCÊ</small>}
              </div>
            ))}
          </div>
          <p>O envelope está nas mãos do apresentador.</p>
          <button type="button" onClick={() => setRevealed(true)}>Revelar vencedor <span>→</span></button>
        </>
      ) : (
        <div className="award-winner-reveal">
          <small>O VENCEDOR É...</small>
          <strong>{revealedWinner}</strong>
          {won ? (
            <AwardReveal award={award} />
          ) : (
            <div className="award-near-miss">
              <span>TOP 3 DO MUNDO</span>
              <strong>Você chegou à final</strong>
              <p>Seu nome esteve no envelope até o último instante. Desta vez, {revealedWinner} levou o prêmio.</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Progress({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="progress-stat">
      <div className="progress-label"><span>{label}</span><strong>{Math.round(value)}</strong></div>
      <div className="progress-track"><span style={{ width: `${clamp(value)}%`, background: color }} /></div>
    </div>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => initialState());
  const nameRollRef = useRef(0);
  const [hasSave, setHasSave] = useState(false);
  const [hasChallengeSave, setHasChallengeSave] = useState(false);
  const [challengeResults, setChallengeResults] = useState<ChallengeResult[]>([]);
  const [youthStep, setYouthStep] = useState(0);
  const [youthFinished, setYouthFinished] = useState(false);
  const [activeTab, setActiveTab] = useState<"event" | "history" | "profile" | "life" | "stats" | "legacy">("event");
  const [toast, setToast] = useState("");
  const [luckSpin, setLuckSpin] = useState<{ event: GameEvent; choiceIndex: number; succeeded: boolean } | null>(null);
  const [positionChangeOpen, setPositionChangeOpen] = useState(false);
  const [positionChangeTarget, setPositionChangeTarget] = useState<PositionKey | null>(null);
  const [positionChangeFeedback, setPositionChangeFeedback] = useState<{ success: boolean; headline: string; text: string } | null>(null);
  const [nationalitySearch, setNationalitySearch] = useState("");
  const [monteCarloReport, setMonteCarloReport] = useState<MonteCarloReport | null>(null);
  const [hallOfFame, setHallOfFame] = useState<CareerHallEntry[]>([]);
  const [hallPreview, setHallPreview] = useState<GameState | null>(null);
  const [hallPreviewLegacy, setHallPreviewLegacy] = useState(false);
  const [updateNoticeOpen, setUpdateNoticeOpen] = useState(false);
  const [updateNoticePage, setUpdateNoticePage] = useState<"current" | "previous">("current");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    customCharacters: [],
    customClubs: [],
    finalMatchMode: "play-key-matches",
    botaoGoalLimit: 3,
    botaoHalfSeconds: 120,
    botaoExtraSeconds: 45,
    botaoPenaltyRounds: 5,
  });
  const [characterName, setCharacterName] = useState("");
  const [characterPosition, setCharacterPosition] = useState<PositionKey>("MEI");
  const [customClubReplacement, setCustomClubReplacement] = useState(CLUBS[0].id);
  const [customClubName, setCustomClubName] = useState("");
  const [customClubShortName, setCustomClubShortName] = useState("");
  const [customClubAbbr, setCustomClubAbbr] = useState("");
  const [customClubPrimary, setCustomClubPrimary] = useState("#0b6b45");
  const [customClubSecondary, setCustomClubSecondary] = useState("#f4c542");
  const [customClubBadge, setCustomClubBadge] = useState("");
  const [shirtNumberInput, setShirtNumberInput] = useState("10");
  const [economyFeedback, setEconomyFeedback] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [androidInstallOpen, setAndroidInstallOpen] = useState(false);
  const [androidRelease, setAndroidRelease] = useState<AndroidRelease | null>(null);
  const [androidPhone, setAndroidPhone] = useState(false);
  const [nativeAndroid, setNativeAndroid] = useState(false);
  const [selectedAchievementId, setSelectedAchievementId] = useState("");
  const [botaoMatchStarted, setBotaoMatchStarted] = useState(false);
  const [botaoSimulating, setBotaoSimulating] = useState(false);
  const [activeGoalReplay, setActiveGoalReplay] = useState<number | null>(null);
  const [pressConferenceOpen, setPressConferenceOpen] = useState(false);
  const [summaryClubId, setSummaryClubId] = useState("");
  const saveImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { version?: number; phase?: Phase };
        if (parsed.version && parsed.version >= 1 && parsed.version <= 7) {
          queueMicrotask(() => setHasSave(parsed.phase !== "welcome"));
        }
      }
      const challengeSave = localStorage.getItem(CHALLENGE_SAVE_KEY);
      if (challengeSave) {
        const parsed = JSON.parse(challengeSave) as { version?: number; phase?: Phase; challengeId?: string };
        if (parsed.version && parsed.version >= 1 && parsed.version <= 7 && parsed.challengeId) {
          queueMicrotask(() => setHasChallengeSave(parsed.phase !== "welcome" && parsed.phase !== "summary"));
        }
      }
      const storedChallengeResults = JSON.parse(localStorage.getItem(CHALLENGE_RESULTS_KEY) ?? "[]") as unknown;
      if (Array.isArray(storedChallengeResults)) {
        queueMicrotask(() => setChallengeResults((storedChallengeResults as ChallengeResult[]).slice(0, 40)));
      }
      const storedHall = JSON.parse(localStorage.getItem(HALL_OF_FAME_KEY) ?? "[]") as unknown;
      if (Array.isArray(storedHall)) {
        queueMicrotask(() => setHallOfFame(
          (storedHall as CareerHallEntry[])
            .filter((entry) => entry && typeof entry.legacyPoints === "number" && typeof entry.name === "string")
            .sort((a, b) => b.legacyPoints - a.legacyPoints || b.peakOverall - a.peakOverall)
            .slice(0, 10),
        ));
      }
      const storedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AppSettings>;
      const sanitizedSettings: AppSettings = {
        customCharacters: Array.isArray(storedSettings.customCharacters)
          ? storedSettings.customCharacters
              .filter((character) => character && typeof character.name === "string" && POSITIONS.some((position) => position.key === character.position))
              .slice(0, 12)
          : [],
        customClubs: Array.isArray(storedSettings.customClubs)
          ? storedSettings.customClubs
              .filter((club) => club && CLUBS.some((candidate) => candidate.id === club.replacedClubId) && typeof club.name === "string")
              .slice(0, 8)
          : [],
        finalMatchMode: storedSettings.finalMatchMode ?? "play-key-matches",
        botaoGoalLimit: [0, 3, 5].includes(storedSettings.botaoGoalLimit ?? 3) ? storedSettings.botaoGoalLimit ?? 3 : 3,
        botaoHalfSeconds: [90, 120, 180].includes(storedSettings.botaoHalfSeconds ?? 120) ? storedSettings.botaoHalfSeconds ?? 120 : 120,
        botaoExtraSeconds: [30, 45, 60].includes(storedSettings.botaoExtraSeconds ?? 45) ? storedSettings.botaoExtraSeconds ?? 45 : 45,
        botaoPenaltyRounds: storedSettings.botaoPenaltyRounds === 3 ? 3 : 5,
      };
      applyCustomClubDefinitions(sanitizedSettings.customClubs ?? []);
      queueMicrotask(() => setAppSettings(sanitizedSettings));
    } catch {
      localStorage.removeItem(SAVE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  }, [appSettings]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [game.phase, activeTab]);


  useEffect(() => {
    window.__FUTBOBO_MONTE_CARLO__ = runMonteCarloCareers;
    const params = new URLSearchParams(window.location.search);
    const requestedRuns = Number(params.get("montecarlo") ?? 0);
    if (requestedRuns > 0) {
      const requestedSeed = Number(params.get("seed") ?? 20260723);
      queueMicrotask(() => setMonteCarloReport(runMonteCarloCareers(requestedRuns, requestedSeed)));
    }
    return () => {
      delete window.__FUTBOBO_MONTE_CARLO__;
    };
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  useEffect(() => {
    const native = isNativeAndroid();
    queueMicrotask(() => {
      setNativeAndroid(native);
      setAndroidPhone(isAndroidDevice());
    });
    if (!native) return;
    void checkForAndroidUpdate().then((release) => {
      if (!release) return;
      setAndroidRelease(release);
      setAndroidInstallOpen(true);
    });
  }, []);

  useEffect(() => {
    if (game.phase === "welcome") return;
    const key = game.challengeId ? CHALLENGE_SAVE_KEY : SAVE_KEY;
    localStorage.setItem(key, JSON.stringify(game));
    if (game.challengeId) queueMicrotask(() => setHasChallengeSave(game.phase !== "summary"));
  }, [game]);

  useEffect(() => {
    if (game.phase !== "summary" || !game.challengeId || game.history.length === 0) return;
    const result: ChallengeResult = {
      id: `${game.challengeId}-${game.seed}-${game.name}-${game.history.length}`,
      challengeId: game.challengeId,
      date: game.challengeDate,
      name: game.name,
      position: game.position,
      nationality: game.nationality,
      score: game.legacyPoints,
      peakOverall: Math.max(game.overall, ...game.history.map((record) => record.overall)),
      trophies: game.trophies + game.nationalTrophies,
      ballonDor: game.awardCabinet["Bola de Ouro"] ?? 0,
      finishedAt: Date.now(),
    };
    queueMicrotask(() => setChallengeResults((current) => {
      const next = [result, ...current.filter((item) => item.id !== result.id)]
        .sort((a, b) => b.score - a.score || b.peakOverall - a.peakOverall)
        .slice(0, 40);
      localStorage.setItem(CHALLENGE_RESULTS_KEY, JSON.stringify(next));
      return next;
    }));
    localStorage.removeItem(CHALLENGE_SAVE_KEY);
    queueMicrotask(() => setHasChallengeSave(false));
  }, [game]);

  useEffect(() => {
    if (game.phase !== "summary" || game.history.length === 0 || game.challengeId) return;
    const entry = careerHallEntry(game);
    queueMicrotask(() => {
      setHallOfFame((current) => {
        const next = [entry, ...current.filter((item) => item.id !== entry.id)]
          .sort((a, b) => b.legacyPoints - a.legacyPoints || b.peakOverall - a.peakOverall || b.finishedAt - a.finishedAt)
          .slice(0, 10);
        localStorage.setItem(HALL_OF_FAME_KEY, JSON.stringify(next));
        return next;
      });
    });
  }, [game]);

  useEffect(() => {
    const locksViewport =
      game.phase === "career" ||
      game.phase === "consequence" ||
      game.phase === "transfer" ||
      game.phase === "transfer-denied" ||
      game.phase === "retirement-confirm";
    if (!locksViewport) return;

    document.documentElement.classList.add("futbobo-viewport-locked");
    document.body.classList.add("futbobo-viewport-locked");
    window.scrollTo(0, 0);
    return () => {
      document.documentElement.classList.remove("futbobo-viewport-locked");
      document.body.classList.remove("futbobo-viewport-locked");
    };
  }, [game.phase]);

  useEffect(() => {
    if (game.phase !== "youth") return;
    const timers = game.youthYears.map((_, index) =>
      window.setTimeout(() => setYouthStep(index + 1), 350 + index * 340),
    );
    const finish = window.setTimeout(
      () => setYouthFinished(true),
      900 + game.youthYears.length * 340,
    );
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(finish);
    };
  }, [game.phase, game.youthYears]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (game.phase !== "consequence") return;
    const timeout = window.setTimeout(() => {
      setGame((current) =>
        current.phase === "consequence"
          ? { ...current, phase: current.pendingBotaoMatches.length ? "botao-final" : "season-result" }
          : current,
      );
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [game.phase]);

  const displayGame = hallPreview ?? game;
  const todayChallenge = dailyChallenge();
  const todayChallengeResults = challengeResults
    .filter((result) => result.challengeId === todayChallenge.id)
    .sort((a, b) => b.score - a.score);
  const todayChallengeBest = todayChallengeResults[0] ?? null;
  const currentClub = useMemo(() => clubById(displayGame.currentClubId || displayGame.academyClubId), [displayGame.currentClubId, displayGame.academyClubId]);
  const seasonClubTitles = game.lastResult?.competitions.filter((competition) => competition.champion) ?? [];
  const seasonNationalTitles = game.lastResult
    ? game.nationalHistory.filter((record) => record.season === game.lastResult?.season && record.champion)
    : [];
  const seasonWorldCupRecord = game.lastResult
    ? game.nationalHistory.find((record) => record.season === game.lastResult?.season && record.name === "Copa do Mundo")
    : null;
  const seasonTitleCount = seasonClubTitles.length + seasonNationalTitles.length;
  const seasonBotaoResults = game.lastResult?.botaoResults ?? [];
  const seasonBotaoWins = seasonBotaoResults.filter(({ result }) => result.champion).length;
  const seasonBotaoLosses = seasonBotaoResults.length - seasonBotaoWins;
  const currentBotaoMatch = game.pendingBotaoMatches[0] ?? null;
  function setupForPendingBotaoMatch(state: GameState, match: PendingBotaoMatch): BotaoMatchSetup {
    const ratings = ratingsFromAttributes(state.attributes, state.overall);
    const rules = {
      goalLimit: appSettings.botaoGoalLimit ?? 3,
      halfSeconds: appSettings.botaoHalfSeconds ?? 120,
      extraSeconds: appSettings.botaoExtraSeconds ?? 45,
      penaltyRounds: appSettings.botaoPenaltyRounds ?? 5,
    };
    if (match.source === "national") {
      const country = countryById(state.nationality);
      return buildNationalMatchSetup({
        seed: state.seed,
        season: match.season,
        competitionId: match.competitionId,
        competitionName: match.competitionName,
        stageName: match.stageName,
        country,
        opponent: countryById(match.opponentId),
        playerName: state.name,
        playerNumber: state.number,
        position: state.position,
        overall: state.overall,
        playerRole: nationalMatchRole(
          state.overall,
          country,
          match.nationalTier ?? state.nationalCategory,
          state.nationalCaptain,
        ),
        ratings,
        rules,
      });
    }
    return buildFinalSetup({
      seed: state.seed,
      season: match.season,
      competitionId: match.competitionId,
      competitionName: match.competitionName,
      stageName: match.stageName,
      club: clubById(state.currentClubId),
      opponent: clubById(match.opponentId),
      playerName: state.name,
      playerNumber: state.number,
      position: state.position,
      overall: state.overall,
      ratings,
      rules,
    });
  }
  const currentBotaoSetup = currentBotaoMatch
    ? setupForPendingBotaoMatch(game, currentBotaoMatch)
    : null;
  const academyClubs = useMemo(() => randomAcademyClubs(game.seed, game.academyCountryId), [game.seed, game.academyCountryId]);
  const academyRoute = useMemo(
    () => academyRouteCopy(game.academyCountryId, game.nationality),
    [game.academyCountryId, game.nationality],
  );
  const filteredCountries = useMemo(() => {
    const query = nationalitySearch.trim().toLocaleLowerCase("pt-BR");
    const pool = sortedCountries(COUNTRIES);
    if (!query) return pool;
    return pool.filter((country) =>
      `${country.name} ${country.demonym} ${country.abbr}`.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [nationalitySearch]);
  const nationCountry = useMemo(() => countryById(displayGame.nationality), [displayGame.nationality]);
  const position = useMemo(() => positionByKey(displayGame.position), [displayGame.position]);
  const supporterMood = useMemo(() => fanMood(game.fanSupport), [game.fanSupport]);
  const publicImage = useMemo(() => publicImageProfile(displayGame), [displayGame]);
  const sponsorCareerValue = useMemo(
    () => [
      ...game.sponsorHistory,
      ...(game.activeSponsor ? [game.activeSponsor] : []),
    ].reduce((total, deal) => {
      const elapsedSeasons = deal.status === "active"
        ? Math.max(1, game.season - deal.startSeason)
        : Math.max(1, deal.endSeason - deal.startSeason);
      return total + deal.annualValue * elapsedSeasons;
    }, 0),
    [game.sponsorHistory, game.activeSponsor, game.season],
  );
  const legacyStanding = useMemo(() => legacyTier(displayGame.legacyPoints), [displayGame.legacyPoints]);
  const marketProfile = useMemo(() => transferMarketProfile(game), [game]);
  const awardEntries = useMemo(
    () => Object.entries(displayGame.awardCabinet).sort((a, b) =>
      awardTierWeight(b[0]) - awardTierWeight(a[0]) ||
      b[1] - a[1] ||
      a[0].localeCompare(b[0], "pt-BR"),
    ),
    [displayGame.awardCabinet],
  );
  const totalIndividualAwards = useMemo(
    () => awardEntries.reduce((total, [, count]) => total + count, 0),
    [awardEntries],
  );
  const seasonCeremonyNomination = useMemo(
    () => [...(game.lastResult?.awardNominations ?? [])]
      .sort((a, b) => awardTierWeight(b.award) - awardTierWeight(a.award) || Number(b.won) - Number(a.won))[0] ?? null,
    [game.lastResult],
  );
  const totalAwardNominations = useMemo(
    () => game.history.reduce((total, record) => total + record.awardNominations.length, 0),
    [game.history],
  );
  const clubCareerSummary = useMemo(() => {
    const byClub = new Map<string, {
      clubId: string;
      seasons: number;
      appearances: number;
      goals: number;
      assists: number;
      cleanSheets: number;
      trophies: number;
      awards: number;
      firstSeason: number;
      lastSeason: number;
      peakOverall: number;
      entryOverall: number;
      exitOverall: number;
      records: SeasonRecord[];
    }>();
    for (const record of displayGame.history) {
      const current = byClub.get(record.clubId) ?? {
        clubId: record.clubId,
        seasons: 0,
        appearances: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        trophies: 0,
        awards: 0,
        firstSeason: record.season,
        lastSeason: record.season,
        peakOverall: record.overall,
        entryOverall: record.overall,
        exitOverall: record.overall,
        records: [],
      };
      current.seasons += 1;
      current.appearances += record.appearances;
      current.goals += record.goals;
      current.assists += record.assists;
      current.cleanSheets += record.cleanSheets;
      current.trophies += record.competitions.filter((competition) => competition.champion).length;
      current.awards += record.awards.length;
      current.firstSeason = Math.min(current.firstSeason, record.season);
      current.lastSeason = Math.max(current.lastSeason, record.season);
      current.peakOverall = Math.max(current.peakOverall, record.overall);
      if (record.season <= current.firstSeason) current.entryOverall = record.overall;
      if (record.season >= current.lastSeason) current.exitOverall = record.overall;
      current.records.push(record);
      byClub.set(record.clubId, current);
    }
    return [...byClub.values()].sort((a, b) => b.appearances - a.appearances || b.trophies - a.trophies);
  }, [displayGame.history]);
  const selectedClubCareer = useMemo(
    () => clubCareerSummary.find((entry) => entry.clubId === summaryClubId) ?? clubCareerSummary[0] ?? null,
    [clubCareerSummary, summaryClubId],
  );
  const shareTitleHighlights = useMemo(() => {
    const clubTitles = TROPHY_PRESENTATIONS
      .map((presentation) => ({ label: presentation.label, shortLabel: presentation.shortLabel, count: displayGame.trophyCabinet[presentation.id] }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);
    if (displayGame.nationalTrophies > 0) clubTitles.push({ label: "Títulos pela Seleção", shortLabel: "SEL", count: displayGame.nationalTrophies });
    return clubTitles.slice(0, 5);
  }, [displayGame.trophyCabinet, displayGame.nationalTrophies]);
  const statistics = useMemo(() => {
    const history = game.history;
    const by = <K extends keyof SeasonRecord>(key: K) => [...history].sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0))[0] ?? null;
    const bestSeason = [...history].sort((a, b) =>
      (b.averageRating ?? seasonAverageRating(b.performanceScore ?? 0, game.seed, b.season)) -
      (a.averageRating ?? seasonAverageRating(a.performanceScore ?? 0, game.seed, a.season)) ||
      b.goals + b.assists - a.goals - a.assists,
    )[0] ?? null;
    return {
      recent: history.slice(-10),
      bestSeason,
      mostGoals: by("goals"),
      mostAssists: by("assists"),
      mostAppearances: by("appearances"),
      highestOverall: by("overall"),
      highestValue: [...history].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))[0] ?? null,
      goalRate: game.stats.appearances ? game.stats.goals / game.stats.appearances : 0,
      contributionRate: game.stats.appearances ? (game.stats.goals + game.stats.assists) / game.stats.appearances : 0,
      careerRating: history.length
        ? history.reduce((total, record) => total + (record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season)), 0) / history.length
        : 0,
      manOfTheMatchAwards: history.reduce((total, record) => total + (record.manOfTheMatchAwards ?? 0), 0),
    };
  }, [game.history, game.seed, game.stats.appearances, game.stats.goals, game.stats.assists]);
  const transferWindowProfile = useMemo(() => {
    const offerClubs = game.transferOffers.map(clubById);
    const foreignOfferClubs = offerClubs.filter((club) => club.countryId !== currentClub.countryId);
    const europeanOffers = foreignOfferClubs.filter(isEuropeanClub).length;
    const allForeignAreEurope = foreignOfferClubs.every((club) => clubConfederation(club) === "EUROPE");
    const homeCountry = countryById(game.academyCountryId);
    const homeOffers = offerClubs.filter((club) =>
      club.countryId === game.academyCountryId &&
      club.countryId !== currentClub.countryId
    ).length;
    return {
      europeanOffers,
      homeCountry,
      homeOffers,
      isEuropeanWindow: isEuropeanClub(currentClub) && europeanOffers > 0,
      foreignMarketLabel: allForeignAreEurope ? "MERCADO EUROPEU" : "MERCADO INTERNACIONAL",
      foreignMarketAdjective: allForeignAreEurope ? "europeu" : "internacional",
      expandedOfferCount: Math.max(0, game.transferOffers.length - 5),
    };
  }, [game.transferOffers, game.academyCountryId, currentClub]);
  const currentEvent = eventForState(game);

  useEffect(() => {
    if (!luckSpin) return;
    const timeout = window.setTimeout(() => {
      setGame((current) => {
        const choice = luckSpin.event.choices[luckSpin.choiceIndex];
        if (!choice?.luck || current.currentEventId !== luckSpin.event.id) return current;
        const luckEffect = luckSpin.succeeded ? choice.luck.successEffect : choice.luck.failureEffect;
        return simulateSeason(
          current,
          luckSpin.event,
          mergeEffects(choice.effect, luckEffect),
          choice.label,
          luckSpin.succeeded ? choice.luck.successText : choice.luck.failureText,
          luckSpin.succeeded ? "success" : "failure",
          appSettings.finalMatchMode ?? "play-key-matches",
        );
      });
      setLuckSpin(null);
      if ("vibrate" in navigator) navigator.vibrate([24, 30, 24]);
    }, 1650);
    return () => window.clearTimeout(timeout);
  }, [luckSpin, appSettings.finalMatchMode]);
  const headerSeason = game.phase === "consequence" || game.phase === "season-result" ? game.lastResult?.season ?? game.season : game.season;
  const headerAge = game.phase === "consequence" || game.phase === "season-result" ? game.lastResult?.age ?? game.age : game.age;
  const nationalTierLabel: Record<NationalTier, string> = { none: "Fora dos planos", sub17: "Seleção Sub-17", sub20: "Seleção Sub-20", olympic: "Seleção Olímpica", main: "Seleção Principal" };

  function vibrate() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18);
  }

  function changeTab(tab: "event" | "history" | "profile" | "life" | "stats" | "legacy") {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
    vibrate();
  }

  function rollPlayerName() {
    nameRollRef.current += 1;
    setGame((current) => {
      let nextName = randomPlayerName(current.seed, current.season * 997 + nameRollRef.current * 131);
      if (nextName === current.name) {
        nameRollRef.current += 1;
        nextName = randomPlayerName(current.seed, current.season * 997 + nameRollRef.current * 131);
      }
      return { ...current, name: nextName };
    });
    vibrate();
  }

  function restoreSavedGame(state: GameState, saveKey: string) {
    setGame(state);
    const pendingMatch = state.pendingBotaoMatches[0];
    if (!pendingMatch || state.phase !== "botao-final") return;
    try {
      const marker = JSON.parse(localStorage.getItem(BOTAO_IN_PROGRESS_KEY) ?? "null") as {
        saveKey?: string;
        matchId?: string;
      } | null;
      const setup = setupForPendingBotaoMatch(state, pendingMatch);
      if (marker?.saveKey === saveKey && marker.matchId === setup.matchId) {
        applyBotaoMatchResult(walkoverBotaoResult(setup), setup);
      } else if (marker?.saveKey === saveKey) {
        localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
      }
    } catch {
      localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    }
  }

  function startNew() {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    setHallPreview(null);
    setHallPreviewLegacy(false);
    nameRollRef.current = 0;
    setGame({ ...initialState(), phase: "identity", seed: Date.now() % 2147483647 });
    setShirtNumberInput("10");
    setHasSave(true);
    setActiveTab("event");
    vibrate();
  }

  function continueSave() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        setHallPreview(null);
        setHallPreviewLegacy(false);
        const normalized = normalizeSave(JSON.parse(saved));
        restoreSavedGame(normalized, SAVE_KEY);
        setShirtNumberInput(String(normalized.number || 10));
      }
    } catch {
      startNew();
    }
  }

  function startChallenge() {
    const challenge = dailyChallenge();
    localStorage.removeItem(CHALLENGE_SAVE_KEY);
    localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    setHallPreview(null);
    setHallPreviewLegacy(false);
    nameRollRef.current = 0;
    setGame({
      ...initialState(challenge.seed),
      phase: "identity",
      seed: challenge.seed,
      challengeId: challenge.id,
      challengeDate: challenge.date,
    });
    setShirtNumberInput("10");
    setHasChallengeSave(true);
    setActiveTab("event");
    vibrate();
  }

  function continueChallenge() {
    try {
      const saved = localStorage.getItem(CHALLENGE_SAVE_KEY);
      if (!saved) return startChallenge();
      const normalized = normalizeSave(JSON.parse(saved));
      setHallPreview(null);
      setHallPreviewLegacy(false);
      restoreSavedGame(normalized, CHALLENGE_SAVE_KEY);
      setShirtNumberInput(String(normalized.number || 10));
      setActiveTab("event");
      vibrate();
    } catch {
      startChallenge();
    }
  }

  function openHallCareer(entry: CareerHallEntry) {
    const archive = archivedCareerState(entry);
    setHallPreview(archive.state);
    setHallPreviewLegacy(archive.legacyArchive);
    window.scrollTo({ top: 0, behavior: "smooth" });
    vibrate();
  }

  function closeHallCareer() {
    setHallPreview(null);
    setHallPreviewLegacy(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    vibrate();
  }

  function addCustomCharacter() {
    const name = characterName.trim().replace(/\s+/g, " ");
    if (name.length < 2 || appSettings.customCharacters.length >= 12) return;
    setAppSettings((current) => ({
      ...current,
      customCharacters: [
        ...current.customCharacters,
        { id: `${Date.now()}-${name.toLocaleLowerCase("pt-BR")}`, name: name.slice(0, 28), position: characterPosition },
      ],
    }));
    setCharacterName("");
    setToast(`${name} entrou no universo do jogo`);
    vibrate();
  }
  function removeCustomCharacter(id: string) {
    setAppSettings((current) => ({
      ...current,
      customCharacters: current.customCharacters.filter((character) => character.id !== id),
    }));
    vibrate();
  }

  function saveCustomClub() {
    const name = customClubName.trim().replace(/\s+/g, " ");
    const shortName = (customClubShortName.trim() || name).replace(/\s+/g, " ");
    const abbr = customClubAbbr.trim().toLocaleUpperCase("pt-BR").replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (name.length < 2 || shortName.length < 2 || abbr.length < 2) return;
    const badge = customClubBadge.trim();
    const safeBadge = badge.startsWith("data:image/") || /^https:\/\//i.test(badge) ? badge : "";
    const definition: CustomClubDefinition = {
      replacedClubId: customClubReplacement,
      name: name.slice(0, 42),
      shortName: shortName.slice(0, 24),
      abbr,
      primary: customClubPrimary,
      secondary: customClubSecondary,
      badge: safeBadge,
    };
    setAppSettings((current) => {
      const customClubs = [
        ...(current.customClubs ?? []).filter((club) => club.replacedClubId !== definition.replacedClubId),
        definition,
      ].slice(-8);
      applyCustomClubDefinitions(customClubs);
      return { ...current, customClubs };
    });
    setToast(`${definition.shortName} substituiu o ${ORIGINAL_CLUB_PRESENTATION.get(definition.replacedClubId)?.shortName ?? "clube escolhido"}`);
    vibrate();
  }

  function removeCustomClub(replacedClubId: string) {
    setAppSettings((current) => {
      const customClubs = (current.customClubs ?? []).filter((club) => club.replacedClubId !== replacedClubId);
      applyCustomClubDefinitions(customClubs);
      return { ...current, customClubs };
    });
    vibrate();
  }

  function readCustomClubBadge(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 1_000_000) {
      setToast("Use uma imagem de até 1 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCustomClubBadge(reader.result);
        setToast("Escudo carregado");
      }
    };
    reader.readAsDataURL(file);
  }

  function exportSavedData() {
    const payload = {
      format: "futbobo-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      save: JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"),
      challengeSave: JSON.parse(localStorage.getItem(CHALLENGE_SAVE_KEY) ?? "null"),
      challengeResults: JSON.parse(localStorage.getItem(CHALLENGE_RESULTS_KEY) ?? "[]"),
      hallOfFame: JSON.parse(localStorage.getItem(HALL_OF_FAME_KEY) ?? "[]"),
      settings: appSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `futbobo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Dados exportados");
  }

  async function importSavedData(file: File | undefined) {
    if (!file) return;
    try {
      localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
      const payload = JSON.parse(await file.text()) as {
        format?: string;
        save?: unknown;
        challengeSave?: unknown;
        challengeResults?: unknown;
        hallOfFame?: unknown;
        settings?: Partial<AppSettings>;
      };
      if (payload.format !== "futbobo-backup") throw new Error("Formato inválido");
      const importedSettings: AppSettings = {
        customCharacters: Array.isArray(payload.settings?.customCharacters) ? payload.settings.customCharacters.slice(0, 12) : [],
        customClubs: Array.isArray(payload.settings?.customClubs) ? payload.settings.customClubs.slice(0, 8) : [],
        finalMatchMode: payload.settings?.finalMatchMode ?? "play-key-matches",
        botaoGoalLimit: payload.settings?.botaoGoalLimit ?? 3,
        botaoHalfSeconds: payload.settings?.botaoHalfSeconds ?? 120,
        botaoExtraSeconds: payload.settings?.botaoExtraSeconds ?? 45,
        botaoPenaltyRounds: payload.settings?.botaoPenaltyRounds ?? 5,
      };
      const importedHall = Array.isArray(payload.hallOfFame)
        ? (payload.hallOfFame as CareerHallEntry[])
            .filter((entry) => entry && typeof entry.name === "string" && typeof entry.legacyPoints === "number")
            .sort((a, b) => b.legacyPoints - a.legacyPoints)
            .slice(0, 10)
        : [];
      applyCustomClubDefinitions(importedSettings.customClubs ?? []);
      setAppSettings(importedSettings);
      setHallOfFame(importedHall);
      localStorage.setItem(HALL_OF_FAME_KEY, JSON.stringify(importedHall));
      const importedChallengeResults = Array.isArray(payload.challengeResults)
        ? (payload.challengeResults as ChallengeResult[])
            .filter((result) => result && typeof result.challengeId === "string" && typeof result.score === "number")
            .slice(0, 40)
        : [];
      setChallengeResults(importedChallengeResults);
      localStorage.setItem(CHALLENGE_RESULTS_KEY, JSON.stringify(importedChallengeResults));
      if (payload.challengeSave) {
        const importedChallenge = normalizeSave(payload.challengeSave);
        if (importedChallenge.challengeId) {
          localStorage.setItem(CHALLENGE_SAVE_KEY, JSON.stringify(importedChallenge));
          setHasChallengeSave(importedChallenge.phase !== "summary");
        }
      } else {
        localStorage.removeItem(CHALLENGE_SAVE_KEY);
        setHasChallengeSave(false);
      }
      if (payload.save) {
        const importedGame = normalizeSave(payload.save);
        setGame(importedGame);
        setHasSave(importedGame.phase !== "welcome");
        localStorage.setItem(SAVE_KEY, JSON.stringify(importedGame));
      } else {
        localStorage.removeItem(SAVE_KEY);
        setHasSave(false);
      }
      setToast("Dados importados com sucesso");
      setSettingsOpen(false);
    } catch {
      setToast("Arquivo de backup inválido");
    } finally {
      if (saveImportRef.current) saveImportRef.current.value = "";
    }
  }

  function selectFormation(formationId: string) {
    setGame((current) => ({
      ...current,
      phase: "story",
      formationId,
      archetype: FORMATIONS.find((formation) => formation.id === formationId)?.archetype ?? current.archetype,
    }));
    vibrate();
  }

  function selectPlayerStory(storyId: PlayerStoryId) {
    setYouthStep(0);
    setYouthFinished(false);
    setGame((current) => {
      const journey = createYouthJourney(current, current.formationId);
      const revealAge = storyId === "late-bloomer"
        ? Math.max(17, journey.revealAge)
        : storyId === "academy-destroyer"
          ? Math.min(17, journey.revealAge)
          : journey.revealAge;
      const baseAfterYouth: GameState = {
        ...current,
        phase: "youth",
        archetype: journey.formation.archetype,
        revealAge,
        youthScore: journey.score + (storyId === "academy-destroyer" ? 7 : storyId === "late-bloomer" ? -4 : 0),
        youthYears: journey.youthYears,
        proOffers: journey.offers,
        age: revealAge,
        season: current.season + revealAge - 12,
        overall: journey.overall,
        potential: journey.potential,
        attributes: createPlayerAttributes(current.position, journey.overall, current.seed),
        traits: selectCareerTraits(current.position, current.seed),
        morale: clamp(68 + Math.round(journey.score / 4)),
        fitness: 94,
      };
      const originated = applyStoryOrigin(baseAfterYouth, storyId);
      const finalOverall = clamp(
        originated.overall + (storyId === "academy-destroyer" ? 2 : storyId === "late-bloomer" ? -1 : 0),
        42,
        76,
      );
      return {
        ...originated,
        overall: finalOverall,
        potential: clamp(originated.potential + (storyId === "late-bloomer" ? 2 : storyId === "disillusioned" ? 1 : 0), 58, 97),
        attributes: shiftPlayerAttributes(originated.attributes, finalOverall - originated.overall, current.position, current.seed + 1777),
        rivals: createCareerRivals(current.seed, revealAge, finalOverall, appSettings.customCharacters),
        storyFlags: storyId === "academy-reject"
          ? [`dispensado-por:${storyClubCandidate(originated, 1901, "reject").id}`]
          : [],
      };
    });
    vibrate();
  }

  function signProfessional(clubId: string) {
    setGame((current) => {
      const club = clubById(clubId);
      const league = leagueById(club.leagueId);
      const managerTrust = clubId === current.academyClubId ? 58 : 44;
      const squadRole = calculateSquadRole(current.overall, club, league.prestige, managerTrust, current.age);
      const contract = createContract(current.overall, current.age, club, current.seed);
      return {
        ...current,
        phase: "career",
        currentClubId: clubId,
        currentLeagueId: club.leagueId,
        currentEventId: FIRST_MATCH_EVENT.id,
        nextEventId: "",
        reputation: clubId === current.academyClubId ? 8 : 4,
        fanSupport: clubId === current.academyClubId ? 68 : 50,
        continentalSlot: initialContinentalSlot(club),
        money: 0,
        managerTrust,
        squadRole,
        contractYears: contract.years,
        annualSalary: contract.annualSalary,
        currentObjective: createSeasonObjective(positionByKey(current.position), squadRole, current.season, current.seed),
        followers: 1_200 + club.reputation * 900,
        socialFeed: [{
          id: `${current.seed}-${current.season}-first-contract`,
          season: current.season,
          source: "press",
          author: "Central do Futebol",
          text: `${current.name} assinou o primeiro contrato profissional com o ${club.shortName}.`,
          likes: 340 + club.reputation * 120,
          tone: "positive",
        }],
        newsFeed: [`${current.season}: primeiro contrato assinado com o ${club.shortName}.`],
      };
    });
    setActiveTab("event");
    vibrate();
  }

  function chooseEvent(choiceIndex: number) {
    const choice = currentEvent.choices[choiceIndex];
    if (!choice) return;
    if (choice.luck) {
      const succeeded = seeded(game.seed, game.season * 127 + choiceIndex * 17 + game.history.length) < choice.luck.chance / 100;
      setLuckSpin({ event: currentEvent, choiceIndex, succeeded });
      vibrate();
      return;
    }
    setGame((current) => simulateSeason(
      current,
      currentEvent,
      choice.effect,
      choice.label,
      choice.result,
      null,
      appSettings.finalMatchMode ?? "play-key-matches",
    ));
    vibrate();
  }

  function attemptPositionChange() {
    if (!positionChangeTarget || game.positionChangeCooldownSeason >= game.season || positionChangeTarget === game.position) return;
    const fromPosition = positionByKey(game.position);
    const toPosition = positionByKey(positionChangeTarget);
    const sameZone = fromPosition.zone === toPosition.zone;
    const goalkeeperSwitch = fromPosition.zone === "gol" || toPosition.zone === "gol";
    const zonePenalty = goalkeeperSwitch ? 38 : sameZone ? 0 : 14;
    const agePenalty = Math.max(0, game.age - 22) * 2.15;
    const chance = clamp(
      Math.round(78 + game.managerTrust * 0.08 + game.morale * 0.04 + (game.traits.includes("versatile") ? 15 : 0) - zonePenalty - agePenalty),
      16,
      88,
    );
    const succeeded = seeded(
      game.seed,
      game.season * 353 + POSITIONS.findIndex((item) => item.key === positionChangeTarget) * 29 + game.history.length,
    ) * 100 < chance;
    setGame((current) => ({
      ...current,
      position: succeeded ? positionChangeTarget : current.position,
      positionChangeCooldownSeason: current.season,
      morale: clamp(current.morale + (succeeded ? 5 : -4)),
      managerTrust: clamp(current.managerTrust + (succeeded ? -3 : -6)),
      currentObjective: succeeded
        ? createSeasonObjective(toPosition, current.squadRole, current.season, current.seed + current.history.length * 41)
        : current.currentObjective,
    }));
    setPositionChangeFeedback({
      success: succeeded,
      headline: succeeded ? `Agora você é ${toPosition.name}` : "O treinador recusou a mudança",
      text: succeeded
        ? `A adaptação começou. Sua confiança caiu um pouco enquanto você aprende a nova função, mas a carreira ganhou outro caminho.`
        : `A comissão acredita que a troca para ${toPosition.name} prejudicaria o time agora. Você poderá tentar outra vez na próxima temporada.`,
    });
    setPositionChangeOpen(false);
    setPositionChangeTarget(null);
    vibrate();
  }

  function applyBotaoMatchResult(matchResult: BotaoMatchResult, setupOverride?: BotaoMatchSetup | null) {
    const resolvedSetup = setupOverride ?? currentBotaoSetup;
    localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    setGame((current) => {
      const match = current.pendingBotaoMatches[0];
      if (!match || matchResult.matchId !== resolvedSetup?.matchId) return current;

      let remainingMatches = current.pendingBotaoMatches.slice(1);
      let nextState: GameState = {
        ...current,
        phase: "botao-result",
        pendingBotaoMatches: remainingMatches,
        lastBotaoResult: { match, result: matchResult },
        pendingPressConference:
          matchResult.manOfTheMatch && !matchResult.simulated && !matchResult.walkover && resolvedSetup
            ? buildPressConference(current, match, matchResult, resolvedSetup.cpuTeam.shortName)
            : null,
      };

      if (match.source === "club") {
        const competitionId = match.competitionId as CompetitionId;
        const outcome = finalOutcome(matchResult);
        const titleDelta = Number(outcome.champion) - Number(match.rngChampion);
        const updateCompetitions = (competitions: CompetitionResult[]) =>
          competitions.map((competition) =>
            competition.id === competitionId
              ? { ...competition, champion: outcome.champion, stage: outcome.stage }
              : competition,
          );
        const updatedLastCompetitions = updateCompetitions(current.lastResult?.competitions ?? []);
        const updatedHistory = current.history.map((record) => {
          if (record.season !== match.season || record.clubId !== current.currentClubId) return record;
          const recordCompetitions = updateCompetitions(record.competitions);
          return {
            ...record,
            goals: record.goals + matchResult.playerGoals,
            assists: record.assists + matchResult.playerAssists,
            competitions: recordCompetitions,
            title: recordCompetitions.some((competition) => competition.champion),
            botaoResults: [...(record.botaoResults ?? []), { match, result: matchResult }],
          };
        });
        const updatedCabinet = {
          ...current.trophyCabinet,
          [competitionId]: Math.max(0, current.trophyCabinet[competitionId] + titleDelta),
        };
        const updatedLastResult = current.lastResult
          ? {
              ...current.lastResult,
              goals: current.lastResult.goals + matchResult.playerGoals,
              assists: current.lastResult.assists + matchResult.playerAssists,
              competitions: updatedLastCompetitions,
              title: updatedLastCompetitions.some((competition) => competition.champion),
              botaoResults: [...(current.lastResult.botaoResults ?? []), { match, result: matchResult }],
            }
          : null;
        const continentalFinal = ["libertadores", "championsLeague", "concacafChampions", "afcChampions"].includes(competitionId);
        const qualifiesForWorld = continentalFinal && outcome.champion;
        const lostWorldTicket =
          continentalFinal &&
          match.rngChampion &&
          !outcome.champion &&
          current.worldQualifiedSeason === match.season + 1 &&
          current.worldQualifiedClubId === current.currentClubId;
        nextState = {
          ...nextState,
          history: updatedHistory,
          lastResult: updatedLastResult,
          stats: {
            ...current.stats,
            goals: current.stats.goals + matchResult.playerGoals,
            assists: current.stats.assists + matchResult.playerAssists,
          },
          trophies: Math.max(0, current.trophies + titleDelta),
          trophyCabinet: updatedCabinet,
          reputation: clamp(current.reputation + (outcome.champion ? 3 : -1)),
          fanSupport: clamp(current.fanSupport + (outcome.champion ? 6 : -3)),
          morale: clamp(current.morale + (outcome.champion ? 4 : -2)),
          worldQualifiedSeason: qualifiesForWorld
            ? match.season + 1
            : lostWorldTicket
              ? 0
              : current.worldQualifiedSeason,
          worldQualifiedClubId: qualifiesForWorld
            ? current.currentClubId
            : lostWorldTicket
              ? ""
              : current.worldQualifiedClubId,
          newsFeed: [
            resolvedSetup
              ? describeFinal(resolvedSetup, matchResult)
              : `${match.competitionName}: ${outcome.champion ? "campeão" : "vice"}.`,
            ...current.newsFeed,
          ].slice(0, 16),
        };
      } else {
        const stageOrder = ["16 avos de final", "Oitavas de final", "Quartas de final", "Semifinal", "Final"];
        const currentStageIndex = Math.max(0, stageOrder.indexOf(match.stageName));
        const wonRound = matchResult.champion;
        const wonTournament = wonRound && currentStageIndex === stageOrder.length - 1;
        const nextStageName = wonRound && !wonTournament ? stageOrder[currentStageIndex + 1] : "";
        const stageAfterMatch = wonTournament
          ? "CAMPEÃO"
          : wonRound
            ? `Classificado — ${nextStageName}`
            : match.stageName === "Final"
              ? "Vice"
              : match.stageName.replace(" de final", "");
        const nationalTitleDelta = wonTournament
          ? Number(!match.rngChampion)
          : wonRound
            ? 0
            : -Number(match.rngChampion);
        const updatedNationalHistory = current.nationalHistory.map((record) => {
          if (record.season !== match.season || record.name !== match.competitionName) return record;
          const baseTournamentStats = record.name === "Copa do Mundo"
            ? record.tournamentStats ?? simulatedWorldCupStats(current, match.stageName === "Final" ? 7 : 3, 1009)
            : null;
          const tournamentStats = baseTournamentStats
            ? {
                ...baseTournamentStats,
                appearances: baseTournamentStats.appearances + 1,
                goals: baseTournamentStats.goals + matchResult.playerGoals,
                assists: baseTournamentStats.assists + matchResult.playerAssists,
                knockoutAppearances: baseTournamentStats.knockoutAppearances + 1,
                knockoutGoals: baseTournamentStats.knockoutGoals + matchResult.playerGoals,
                knockoutAssists: baseTournamentStats.knockoutAssists + matchResult.playerAssists,
              }
            : record.tournamentStats;
          return { ...record, stage: stageAfterMatch, champion: wonTournament, tournamentStats };
        });
        const updatedWorldCupStats = updatedNationalHistory.find((record) =>
          record.season === match.season && record.name === "Copa do Mundo"
        )?.tournamentStats;

        if (nextStageName) {
          const previouslyPlayedOpponents = (current.lastResult?.botaoResults ?? [])
            .filter(({ match: playedMatch }) =>
              playedMatch.source === "national" &&
              playedMatch.season === match.season &&
              playedMatch.competitionId === match.competitionId,
            )
            .map(({ match: playedMatch }) => playedMatch.opponentId);
          const excludedCountryIds = Array.from(new Set([
            ...(match.previousOpponentIds ?? []),
            ...previouslyPlayedOpponents,
            match.opponentId,
          ]));
          const opponent = pickNationalOpponent({
            countryId: current.nationality,
            seed: current.seed,
            season: match.season,
            competitionId: match.competitionId,
            stageName: nextStageName,
            excludedCountryIds,
          });
          const nextRound: PendingBotaoMatch = {
            ...match,
            id: `national-${match.competitionId}-${nextStageName}-${match.season}`,
            stageName: nextStageName,
            opponentId: opponent.id,
            previousOpponentIds: excludedCountryIds,
          };
          remainingMatches = [nextRound, ...remainingMatches];
        }

        nextState = {
          ...nextState,
          pendingBotaoMatches: remainingMatches,
          nationalHistory: updatedNationalHistory,
          nationalCaps: current.nationalCaps + 1,
          nationalGoals: current.nationalGoals + matchResult.playerGoals,
          nationalAssists: current.nationalAssists + matchResult.playerAssists,
          nationalTrophies: Math.max(0, current.nationalTrophies + nationalTitleDelta),
          reputation: clamp(current.reputation + (wonTournament ? 5 : wonRound ? 2 : -1)),
          fanSupport: clamp(current.fanSupport + (wonTournament ? 8 : wonRound ? 3 : -2)),
          morale: clamp(current.morale + (wonTournament ? 6 : wonRound ? 2 : -3)),
          lastResult: current.lastResult
            ? {
                ...current.lastResult,
                nationalNote: `${match.competitionName}: ${stageAfterMatch}${
                  updatedWorldCupStats
                    ? ` · ${updatedWorldCupStats.appearances}J, ${updatedWorldCupStats.goals}G, ${updatedWorldCupStats.assists}A`
                    : ""
                }`,
                botaoResults: [...(current.lastResult.botaoResults ?? []), { match, result: matchResult }],
              }
            : null,
          history: current.history.map((record) =>
            record.season === match.season
              ? { ...record, botaoResults: [...(record.botaoResults ?? []), { match, result: matchResult }] }
              : record,
          ),
          newsFeed: [
            `${match.competitionName} · ${match.stageName}: ${countryById(current.nationality).name} ${
              wonRound ? "avançou" : "foi eliminado"
            } contra ${countryById(match.opponentId).name}.`,
            ...current.newsFeed,
          ].slice(0, 16),
        };
      }

      const latestClubCompetitions = nextState.lastResult?.competitions ?? [];
      const hasMajorClubTitle = latestClubCompetitions.some((competition) =>
        competition.champion &&
        !BALLON_DOR_EXCLUDED_TROPHIES.has(competition.id),
      );
      const hasMajorNationalTitle = nextState.nationalHistory.some((record) =>
        record.season === match.season &&
        record.champion &&
        ["Copa do Mundo", "Eurocopa", "Copa América", "Copa Ouro", "Copa da Ásia", "Copa Africana de Nações", "Copa das Nações da OFC"].includes(record.name),
      );
      if (
        !nextState.pendingBotaoMatches.some((pending) => pending.season === match.season) &&
        !hasMajorClubTitle &&
        !hasMajorNationalTitle &&
        nextState.lastResult?.awards.includes("Bola de Ouro")
      ) {
        const updatedAwardCabinet = { ...nextState.awardCabinet };
        updatedAwardCabinet["Bola de Ouro"] = Math.max(0, (updatedAwardCabinet["Bola de Ouro"] ?? 1) - 1);
        const demotedNominations = nextState.lastResult.awardNominations.map((nomination) =>
          nomination.award === "Bola de Ouro" && nomination.won
            ? {
                ...nomination,
                won: false,
                winner: fictionalAwardWinner(current.name, "Bola de Ouro", current.seed, match.season, current.rivals),
              }
            : nomination,
        );
        const updatedLastResult = {
          ...nextState.lastResult,
          awards: nextState.lastResult.awards.filter((award) => award !== "Bola de Ouro"),
          awardNominations: demotedNominations,
        };
        nextState = {
          ...nextState,
          awards: Math.max(0, nextState.awards - 1),
          awardCabinet: updatedAwardCabinet,
          lastResult: updatedLastResult,
          history: nextState.history.map((record) =>
            record.season === match.season
              ? {
                  ...record,
                  awards: record.awards.filter((award) => award !== "Bola de Ouro"),
                  awardNominations: demotedNominations,
                }
              : record,
          ),
        };
      }

      const seasonResolved = !nextState.pendingBotaoMatches.some((pending) => pending.season === match.season);
      let resolvedResult = nextState.lastResult;
      const playsInEurope = isEuropeanClub(clubById(nextState.currentClubId));
      const resolvedWorldCupStats = worldCupStatsForSeason(nextState, match.season);
      const earnedWorldCupGoldenBoot = Boolean(
        seasonResolved &&
        resolvedResult &&
        resolvedWorldCupStats &&
        resolvedWorldCupStats.goals >= 6 &&
        !resolvedResult.awards.includes("Artilheiro da Copa do Mundo"),
      );
      if (earnedWorldCupGoldenBoot && resolvedResult) {
        const goldenBootAward = "Artilheiro da Copa do Mundo";
        const updatedAwardCabinet = {
          ...nextState.awardCabinet,
          [goldenBootAward]: (nextState.awardCabinet[goldenBootAward] ?? 0) + 1,
        };
        const addGoldenBoot = <T extends SeasonRecord | SeasonResult>(record: T): T => ({
          ...record,
          awards: [...record.awards, goldenBootAward],
        });
        resolvedResult = addGoldenBoot(resolvedResult);
        nextState = {
          ...nextState,
          awards: nextState.awards + 1,
          awardCabinet: updatedAwardCabinet,
          lastResult: resolvedResult,
          history: nextState.history.map((record) =>
            record.season === match.season ? addGoldenBoot(record) : record,
          ),
        };
      }
      const alreadyHasBallon = Boolean(resolvedResult?.awards.includes("Bola de Ouro"));
      const hasProductionAward = Boolean(resolvedResult?.awards.some((award) =>
        award.includes("Artilheiro") ||
        award.includes("Chuteira de Ouro") ||
        award.includes("Rei das Assistências"),
      ));
      const worldCupBallonSurge = Boolean(playsInEurope && (resolvedWorldCupStats?.goals ?? 0) >= 8);
      const manualBallonEligible = Boolean(
        seasonResolved &&
        resolvedResult &&
        !alreadyHasBallon &&
        hasProductionAward &&
        (hasMajorClubTitle || hasMajorNationalTitle) &&
        (
          (worldCupBallonSurge && nextState.overall >= 80 && resolvedResult.performanceScore >= 70) ||
          (playsInEurope && nextState.overall >= 84 && resolvedResult.performanceScore >= 80) ||
          (!playsInEurope && nextState.overall >= 89 && resolvedResult.performanceScore >= 87)
        ),
      );
      if (manualBallonEligible && resolvedResult) {
        const chance = clamp(
          10 +
          Math.max(0, resolvedResult.performanceScore - 80) * 1.45 +
          Math.max(0, nextState.overall - 84) * 1.2 +
          (worldCupBallonSurge ? 68 + Math.min(10, ((resolvedWorldCupStats?.goals ?? 8) - 8) * 2) : 0),
          10,
          worldCupBallonSurge ? 96 : 46,
        );
        const wonAfterFinal = seeded(nextState.seed, match.season * 109) * 100 < chance;
        const hasWorldXi = resolvedResult.awards.includes("FIFPRO World XI");
        const addedAwards = wonAfterFinal
          ? [...(!hasWorldXi ? ["FIFPRO World XI"] : []), "Bola de Ouro"]
          : [];
        const existingBallonNomination = resolvedResult.awardNominations.some((nomination) => nomination.award === "Bola de Ouro");
        const ballot: AwardNomination | null = wonAfterFinal
          ? {
              award: "Bola de Ouro",
              won: true,
              winner: nextState.name,
              finalists: awardFinalists(nextState.name, "Bola de Ouro", nextState.seed, match.season, nextState.rivals),
            }
          : !existingBallonNomination && seeded(nextState.seed, match.season * 313) < 0.68
            ? {
                award: "Bola de Ouro",
                won: false,
                winner: fictionalAwardWinner(nextState.name, "Bola de Ouro", nextState.seed, match.season, nextState.rivals),
                finalists: awardFinalists(nextState.name, "Bola de Ouro", nextState.seed, match.season, nextState.rivals),
              }
            : null;
        if (addedAwards.length > 0 || ballot) {
          const updatedAwardCabinet = { ...nextState.awardCabinet };
          addedAwards.forEach((award) => {
            updatedAwardCabinet[award] = (updatedAwardCabinet[award] ?? 0) + 1;
          });
          const updateResolvedAwards = (record: SeasonRecord | SeasonResult) => ({
            ...record,
            awards: [...record.awards, ...addedAwards],
            awardNominations: ballot
              ? [
                  ...record.awardNominations.filter((nomination) => nomination.award !== "Bola de Ouro"),
                  ballot,
                ].sort((a, b) => awardTierWeight(b.award) - awardTierWeight(a.award))
              : record.awardNominations,
          });
          nextState = {
            ...nextState,
            awards: nextState.awards + addedAwards.length,
            awardCabinet: updatedAwardCabinet,
            lastResult: updateResolvedAwards(resolvedResult) as SeasonResult,
            history: nextState.history.map((record) =>
              record.season === match.season ? updateResolvedAwards(record) : record,
            ),
          };
        }
      }

      return {
        ...nextState,
        legacyPoints: calculateLegacyScore({
          appearances: nextState.stats.appearances,
          goals: nextState.stats.goals,
          assists: nextState.stats.assists,
          cleanSheets: nextState.stats.cleanSheets,
          trophies: nextState.trophies,
          nationalTrophies: nextState.nationalTrophies,
          awards: nextState.awards,
          ballonDor: nextState.awardCabinet["Bola de Ouro"] ?? 0,
          nationalCaps: nextState.nationalCaps,
          peakOverall: Math.max(nextState.overall, ...nextState.history.map((item) => item.overall)),
          setbacks: nextState.setbacks,
        }),
      };
    });
    setBotaoMatchStarted(false);
    setBotaoSimulating(false);
    vibrate();
  }

  function simulateCurrentBotaoMatch() {
    if (!currentBotaoSetup || botaoSimulating) return;
    localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    setBotaoSimulating(true);
    window.setTimeout(() => applyBotaoMatchResult(simulateBotaoMatch(currentBotaoSetup)), 30);
  }

  function startCurrentBotaoMatch() {
    if (!currentBotaoSetup) return;
    const saveKey = game.challengeId ? CHALLENGE_SAVE_KEY : SAVE_KEY;
    // Persiste a decisão antes de abrir o campo: fechar, recarregar ou travar
    // depois deste ponto precisa contar como abandono, mesmo antes do próximo efeito.
    localStorage.setItem(saveKey, JSON.stringify(game));
    localStorage.setItem(BOTAO_IN_PROGRESS_KEY, JSON.stringify({
      saveKey,
      matchId: currentBotaoSetup.matchId,
      startedAt: Date.now(),
    }));
    setBotaoMatchStarted(true);
    vibrate();
  }

  function continueAfterBotaoResult() {
    if (game.pendingPressConference) {
      setPressConferenceOpen(true);
      return;
    }
    setGame((current) => ({
      ...current,
      phase: current.pendingBotaoMatches.length ? "botao-final" : "season-result",
    }));
    setBotaoMatchStarted(false);
    setActiveGoalReplay(null);
    vibrate();
  }

  function answerPressConference(answerIndex: number) {
    const visibleConference = game.pendingPressConference;
    const finished = Boolean(
      visibleConference &&
      visibleConference.questionIndex + 1 >= visibleConference.questions.length,
    );
    setGame((current) => {
      const conference = current.pendingPressConference;
      const question = conference?.questions[conference.questionIndex];
      const answer = question?.answers[answerIndex];
      if (!conference || !question || !answer) return current;
      const affected = applyEffect(current, answer.effect);
      const nextIndex = conference.questionIndex + 1;
      const completed = nextIndex >= conference.questions.length;
      const post: SocialPost = {
        id: `${current.seed}-${conference.matchId}-press-${conference.questionIndex}`,
        season: current.lastResult?.season ?? current.season - 1,
        source: "press",
        author: "Zona Mista",
        text: `“${answer.label}” — ${current.name}, após ${conference.competitionName}.`,
        likes: Math.max(500, Math.round((current.followers + 10_000) * (0.02 + seeded(current.seed, conference.questionIndex + current.season) * 0.04))),
        tone: answer.tone === "bold" ? "positive" : "neutral",
      };
      return {
        ...affected,
        pendingPressConference: completed ? null : { ...conference, questionIndex: nextIndex },
        socialFeed: [post, ...affected.socialFeed].slice(0, 24),
        newsFeed: [`Coletiva: ${answer.result}`, ...affected.newsFeed].slice(0, 16),
      };
    });
    if (finished) setPressConferenceOpen(false);
    vibrate();
  }

  function continueAfterConsequence() {
    setGame((current) => ({
      ...current,
      phase: current.pendingBotaoMatches.length ? "botao-final" : "season-result",
    }));
    vibrate();
  }

  function resolveStoryDecision(choiceIndex: number) {
    setGame((current) => {
      const decision = current.pendingStoryDecision;
      const choice = decision?.choices[choiceIndex];
      if (!decision || !choice) return current;
      const affected = applyEffect(current, choice.effect);
      const transferOffers = choice.transferClubId
        ? [choice.transferClubId, ...affected.transferOffers.filter((clubId) => clubId !== choice.transferClubId)].slice(0, 10)
        : affected.transferOffers;
      return {
        ...affected,
        pendingStoryDecision: null,
        storyFlags: Array.from(new Set([...affected.storyFlags, choice.flag])),
        storyLog: [
          ...affected.storyLog,
          {
            season: affected.lastResult?.season ?? affected.season - 1,
            chapter: decision.chapter,
            decisionId: decision.id,
            title: decision.title,
            choice: choice.label,
            result: choice.result,
          },
        ],
        transferOffers,
        newsFeed: [
          `${affected.lastResult?.season ?? affected.season - 1}: ${choice.result}`,
          ...affected.newsFeed,
        ].slice(0, 16),
      };
    });
    vibrate();
  }

  function continueAfterResult() {
    if (game.pendingStoryDecision) return;
    if (game.retireAfterSeason) {
      setGame((current) => ({ ...current, phase: "summary", lastConsequence: null }));
      setActiveTab("event");
      vibrate();
      return;
    }
    if (game.loanParentClubId && game.season >= game.loanEndSeason) {
      setGame((current) => {
        const parentClub = clubById(current.loanParentClubId);
        const league = leagueById(parentClub.leagueId);
        const managerTrust = 48;
        const squadRole = calculateSquadRole(current.overall, parentClub, league.prestige, managerTrust, current.age);
        return {
          ...current,
          phase: current.transferOffers.length ? "transfer" : "career",
          currentClubId: parentClub.id,
          currentLeagueId: current.loanParentLeagueId || parentClub.leagueId,
          currentEventId: current.nextEventId || "extra-training",
          lastResult: current.transferOffers.length ? current.lastResult : null,
          lastConsequence: null,
          loanParentClubId: "",
          loanParentLeagueId: "",
          loanEndSeason: 0,
          pendingTransferMode: "permanent",
          managerTrust,
          squadRole,
          currentObjective: createSeasonObjective(positionByKey(current.position), squadRole, current.season, current.seed + 701),
          newsFeed: [`${current.season}: retorno ao ${parentClub.shortName} após o fim do empréstimo.`, ...current.newsFeed].slice(0, 16),
        };
      });
      setActiveTab("event");
      vibrate();
      return;
    }
    if (game.transferOffers.length) {
      setGame((current) => ({ ...current, phase: "transfer", lastConsequence: null }));
    } else {
      setGame((current) => ({
        ...current,
        phase: "career",
        currentEventId: current.nextEventId || "extra-training",
        lastResult: null,
        lastConsequence: null,
        transferRequested: false,
        renewalDenied: false,
        forcedAlternativeTransfer: false,
        isFreeAgent: false,
      }));
    }
    setActiveTab("event");
    vibrate();
  }

  function chooseTransfer(clubId: string | null) {
    setGame((current) => {
      if (!clubId && (current.transferRequested || current.renewalDenied || current.forcedClubExit || current.forcedAlternativeTransfer)) return current;
      if (!clubId && (current.isFreeAgent || current.pendingTransferMode === "loan")) return current;
      const newClub = clubId ? clubById(clubId) : null;
      const oldClub = clubById(current.currentClubId);
      const targetClub = newClub ?? oldClub;
      const isLoan = Boolean(newClub && current.pendingTransferMode === "loan");
      const targetLeague = leagueById(targetClub.leagueId);
      const offerIndex = Math.max(0, current.transferOffers.indexOf(clubId ?? ""));
      const signingContract = Boolean(!isLoan && (newClub || current.contractYears === 0));
      const generatedContract = createContract(current.overall, current.age, targetClub, current.seed + current.season + offerIndex);
      const contract = signingContract ? generatedContract : { years: current.contractYears, annualSalary: current.annualSalary };
      const changingCountry = Boolean(newClub && newClub.countryId !== oldClub.countryId);
      const managerTrust = newClub ? 50 : clamp(current.managerTrust + 5);
      const squadRole = calculateSquadRole(current.overall, targetClub, targetLeague.prestige, managerTrust, current.age);
      const rivalry = newClub ? findRivalry(oldClub.id, newClub.id) : undefined;
      const pendingCareerEventId = current.nextEventId;
      const transferNewsPool = NEWS_TEMPLATES.filter((item) => item.category === (clubId ? "transfer" : "contract"));
      const genericTransferNews = fillNewsTemplate(
        pick(transferNewsPool, current.seed, current.season + offerIndex)?.template ?? "{player} define o futuro no {club}",
        {
          player: current.name,
          club: targetClub.shortName,
          season: String(current.season),
          rival: rivalry?.nickname ?? "o rival",
          competition: targetLeague.name,
        },
      );
      const transferHeadline = isLoan
        ? `${current.name} deixa o ${oldClub.shortName} por empréstimo e vai jogar no ${targetClub.shortName}.`
        : rivalry
        ? pick(rivalry.headlines, current.seed, current.season)
        : genericTransferNews;
      const transferred: GameState = {
        ...current,
        phase: "career",
        currentClubId: clubId ?? current.currentClubId,
        currentLeagueId: newClub ? newClub.leagueId : current.currentLeagueId,
        currentEventId: "",
        nextEventId: "",
        lastResult: null,
        lastConsequence: null,
        transferOffers: [],
        morale: clamp(current.morale + (clubId ? 5 : 2)),
        fanSupport: clubId ? 52 : clamp(current.fanSupport + (current.transferRequested ? -8 : 3)),
        continentalSlot: newClub ? initialContinentalSlot(newClub) : current.continentalSlot,
        adaptation: newClub ? (changingCountry ? initialAdaptation(oldClub.countryId, newClub.countryId) : current.adaptation) : current.adaptation,
        abroadSeasons: changingCountry ? 0 : current.abroadSeasons,
        transferStatus: null,
        transferRequested: false,
        renewalDenied: false,
        forcedClubExit: false,
        forcedAlternativeTransfer: false,
        pendingTransferMode: "permanent",
        loanParentClubId: isLoan ? oldClub.id : "",
        loanParentLeagueId: isLoan ? (current.currentLeagueId || oldClub.leagueId) : "",
        loanEndSeason: isLoan ? current.season + 1 : 0,
        isFreeAgent: false,
        freeAgentSinceSeason: 0,
        forcedFreeAgentUntilSeason: 0,
        managerTrust,
        squadRole,
        contractYears: contract.years,
        annualSalary: contract.annualSalary,
        clubCaptain: newClub ? false : current.clubCaptain,
        currentObjective: createSeasonObjective(positionByKey(current.position), squadRole, current.season, current.seed + current.season),
        newsFeed: [
          transferHeadline,
          ...current.newsFeed,
        ].slice(0, 12),
      };
      return {
        ...transferred,
        currentEventId: pendingCareerEventId || selectNextEvent(transferred, current.season * 47),
      };
    });
    setActiveTab("event");
    vibrate();
  }

  function becomeFreeAgent() {
    setGame((current) => {
      if (current.contractYears > 0 || current.pendingTransferMode === "loan") return current;
      const offers = selectTransferOffers(current, current.season * 509, { includeForeign: true }).slice(0, 10);
      return {
        ...current,
        phase: "transfer",
        transferOffers: offers,
        transferRequested: true,
        isFreeAgent: true,
        freeAgentSinceSeason: current.season,
        transferStatus: {
          success: true,
          chance: 100,
          headline: "Você entrou no mercado sem clube",
          text: `Sem taxa de transferência, seu empresário encontrou ${offers.length} projetos. Agora não existe opção de voltar atrás.`,
        },
        newsFeed: [`${current.season}: ${current.name} recusou a renovação e virou agente livre.`, ...current.newsFeed].slice(0, 16),
      };
    });
    vibrate();
  }

  function waitAsFreeAgent() {
    setGame((current) => {
      if (!current.isFreeAgent || (current.age >= 42 && current.forcedFreeAgentUntilSeason <= current.season)) return current;
      const nextSeason = current.season + 1;
      const stillBanned = current.forcedFreeAgentUntilSeason > nextSeason;
      const banJustEnded = current.forcedFreeAgentUntilSeason > 0 && !stillBanned;
      const waited: GameState = {
        ...current,
        age: current.age + 1,
        season: nextSeason,
        morale: clamp(current.morale - 5),
        fitness: clamp(Math.round(current.fitness * 0.7 + 82 * 0.3), 45, 94),
        money: Math.max(0, current.money - 180_000),
        spendableMoney: Math.max(0, current.spendableMoney - 180_000),
        freeAgentSinceSeason: current.freeAgentSinceSeason || current.season,
        forcedFreeAgentUntilSeason: banJustEnded ? 0 : current.forcedFreeAgentUntilSeason,
        transferStatus: {
          success: !stillBanned,
          chance: 100,
          headline: stillBanned ? "A punição ainda está valendo" : banJustEnded ? "O banimento terminou" : "Um ano passou sem clube",
          text: stillBanned
            ? `Nenhum clube pode registrar você. Faltam ${current.forcedFreeAgentUntilSeason - nextSeason} ano(s) para o mercado reabrir.`
            : banJustEnded
              ? "Depois de anos fora, seu nome voltou ao mercado e uma nova rodada de propostas chegou."
              : "Você preservou a liberdade, mas perdeu ritmo e pagou seus custos sem salário. Uma nova rodada de propostas chegou.",
        },
        newsFeed: [`${current.season}: ${current.name} passou a temporada como agente livre.`, ...current.newsFeed].slice(0, 16),
      };
      return {
        ...waited,
        transferOffers: stillBanned ? [] : selectTransferOffers(waited, waited.season * 521, { includeForeign: true }).slice(0, 10),
      };
    });
    setToast(game.forcedFreeAgentUntilSeason > game.season + 1 ? "Mais um ano cumprido longe dos clubes" : "Nova temporada, novas propostas — sem jogos registrados");
    vibrate();
  }

  function buyCareerItem(item: "recovery" | "media" | "coach" | "potential" | "corruption") {
    const prices = { recovery: 350_000, media: 600_000, coach: 1_200_000, potential: 2_500_000, corruption: 2_000_000 };
    const price = prices[item];
    const purchaseKey = `${game.season}:${item}`;
    if (game.spendableMoney < price || game.economyPurchases.includes(purchaseKey)) return;
    const corruptionSucceeded = item === "corruption" && seeded(game.seed, game.season * 1877 + game.economyPurchases.length * 31) < 0.5;
    const corruptionBanYears = 3 + Math.floor(seeded(game.seed, game.season * 1889 + game.economyPurchases.length * 37) * 3);
    setGame((current) => {
      const next = {
        ...current,
        money: current.money - price,
        spendableMoney: current.spendableMoney - price,
        economyPurchases: [...current.economyPurchases, purchaseKey],
      };
      if (item === "recovery") {
        next.fitness = clamp(current.fitness + 12);
        next.morale = clamp(current.morale + 7);
      } else if (item === "media") {
        next.mediaRelation = clamp(current.mediaRelation + 10);
        next.lifeBalance = clamp(current.lifeBalance + 5);
        next.followers = current.followers + Math.max(25_000, Math.round(current.followers * 0.04));
      } else if (item === "coach") {
        next.attributes = shiftPlayerAttributes(current.attributes, 1, current.position, current.seed + current.season * 613);
      } else if (item === "potential") {
        next.potential = clamp(current.potential < 80 ? current.potential + 1 : current.potential - 1, current.overall, 99);
      } else if (corruptionSucceeded) {
        next.corruptionGuaranteedSeason = current.season;
        next.discipline = clamp(current.discipline - 18);
        next.mediaRelation = clamp(current.mediaRelation - 8);
      } else {
        next.phase = "transfer" as Phase;
        next.isFreeAgent = true;
        next.freeAgentSinceSeason = current.season;
        next.forcedFreeAgentUntilSeason = current.season + corruptionBanYears;
        next.transferOffers = [];
        next.contractYears = 0;
        next.annualSalary = 0;
        next.activeSponsor = null;
        next.managerTrust = 0;
        next.fanSupport = clamp(current.fanSupport - 30);
        next.reputation = clamp(current.reputation - 35);
        next.discipline = clamp(current.discipline - 45);
        next.transferRequested = true;
        next.transferStatus = {
          success: false,
          chance: 50,
          headline: "O esquema foi descoberto",
          text: `A investigação expulsou você do mercado por ${corruptionBanYears} anos. Nenhum clube poderá contratar você antes de ${current.season + corruptionBanYears}.`,
        };
        next.newsFeed = [
          `${current.season}: tentativa de corrupção descoberta; ${current.name} foi afastado do futebol por ${corruptionBanYears} anos.`,
          ...current.newsFeed,
        ].slice(0, 16);
      }
      return next;
    });
    setEconomyFeedback(
      item === "corruption"
        ? corruptionSucceeded
          ? "O acordo ficou escondido. O título nacional desta temporada está garantido — mas sua disciplina e sua imagem já carregam a escolha."
          : `O pagamento deixou rastros. Você foi banido do mercado por ${corruptionBanYears} anos e terá de atravessar esse período como agente livre.`
        : item === "potential"
        ? "A recalibração foi concluída. O relatório continua confidencial: você só descobrirá o efeito acompanhando sua evolução."
        : item === "coach"
          ? "O trabalho individual acrescentou um pequeno ganho técnico aos seus atributos."
          : item === "media"
            ? "A nova equipe reorganizou sua imagem, sua agenda e seu alcance."
            : "A estrutura de recuperação devolveu energia e tranquilidade.",
    );
    setToast(item === "corruption" ? (corruptionSucceeded ? "Esquema fechado — título garantido" : "Esquema descoberto") : `${formatMoney(price)} investidos na carreira`);
    vibrate();
  }

  function requestTransfer() {
    setGame((current) => {
      if (current.transferCooldownSeason >= current.season) return current;
      const club = clubById(current.currentClubId);
      const requirement = 55 + club.reputation * 5;
      const performance = transferMarketProfile(current);
      const chance = clamp(Math.round(24 + current.reputation * 0.38 + (current.overall - requirement) * 1.8 + (current.fanSupport - 50) * 0.12 + Math.max(0, performance.performanceScore - 50) * 0.22), 8, 88);
      const success = seeded(current.seed, current.season * 97 + current.transferRequests * 13) * 100 < chance;
      if (success) {
        const transferOffers = selectTransferOffers(current, current.season * 101, { includeForeign: true });
        return {
          ...current,
          phase: "transfer",
          transferOffers,
          transferRequests: current.transferRequests + 1,
          transferCooldownSeason: current.season,
          transferRequested: true,
          managerTrust: clamp(current.managerTrust - 8),
          transferStatus: { success: true, chance, headline: "A diretoria abriu a porta", text: `Seu pedido foi aceito — não há volta. O empresário encontrou ${transferOffers.length} projetos e agora você precisa escolher a próxima camisa.` },
        };
      }
      return {
        ...current,
        phase: "transfer-denied",
        transferRequests: current.transferRequests + 1,
        transferCooldownSeason: current.season,
        transferRequested: true,
        morale: clamp(current.morale - 12),
        reputation: clamp(current.reputation - 7),
        fanSupport: Math.min(18, clamp(current.fanSupport - 40)),
        managerTrust: clamp(current.managerTrust - 18),
        transferStatus: { success: false, chance, headline: "O pedido vazou — e foi negado", text: "A diretoria recusou sua saída. A arquibancada entendeu o gesto como abandono e as vaias começaram." },
      };
    });
    vibrate();
  }

  function requestRetirement() {
    setGame((current) => ({
      ...current,
      retirementReturnPhase: current.phase,
      phase: "retirement-confirm",
    }));
    vibrate();
  }

  function cancelRetirement() {
    setGame((current) => ({
      ...current,
      phase: current.retirementReturnPhase === "retirement-confirm" ? "career" : current.retirementReturnPhase,
    }));
    vibrate();
  }

  function confirmRetirement() {
    setGame((current) => ({
      ...current,
      phase: "summary",
      retireAfterSeason: true,
      newsFeed: [`${current.season}: ${current.name} anunciou a aposentadoria aos ${current.age} anos.`, ...current.newsFeed].slice(0, 16),
    }));
    vibrate();
  }

  function continueAfterDeniedTransfer() {
    setGame((current) => ({ ...current, phase: "career", transferStatus: null, transferRequested: false }));
    setActiveTab("event");
    vibrate();
  }

  async function installWebShortcut() {
    if (!installPrompt) {
      setAndroidInstallOpen(false);
      setInstallHelp(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setToast(choice.outcome === "accepted" ? "Futbobo instalado no aparelho" : "Instalação cancelada");
  }

  function installWebApp() {
    setAndroidInstallOpen(true);
  }

  async function shareCareer() {
    const peakOverall = Math.max(displayGame.overall, ...displayGame.history.map((item) => item.overall), 0);
    const ballonDor = displayGame.awardCabinet["Bola de Ouro"] ?? 0;
    const worldXi = displayGame.awardCabinet["FIFPRO World XI"] ?? 0;
    const totalTitles = displayGame.trophies + displayGame.nationalTrophies;
    const titleLine = shareTitleHighlights.length
      ? shareTitleHighlights.map((entry) => `${entry.count}× ${entry.label}`).join(" · ")
      : "Uma carreira construída além das taças";
    const clubLine = Array.from(new Set(displayGame.history.map((item) => clubById(item.clubId).shortName))).join(" → ");
    const productionLine = displayGame.position === "GOL"
      ? `${displayGame.stats.cleanSheets} jogos sem sofrer · ${displayGame.stats.goalsConceded} gols sofridos`
      : `${displayGame.stats.goals} gols · ${displayGame.stats.assists} assistências`;
    const text = [
      `⚽ ${displayGame.name} encerrou a carreira no FUTBOBO`,
      `${position.name} · ${nationCountry.name} · pico de ${peakOverall} OVR`,
      `${displayGame.stats.appearances} jogos · ${productionLine}`,
      `🏆 ${totalTitles} títulos — ${titleLine}`,
      `🥇 ${ballonDor}× Bola de Ouro · ${worldXi}× World XI · ${totalIndividualAwards} prêmios individuais`,
      `🏟️ ${clubLine || currentClub.shortName}`,
      `⭐ ${legacyStanding.label} · ${displayGame.legacyPoints} pontos de legado`,
      "Você faria melhor?",
    ].join("\n");

    const makePoster = async () => {
      await document.fonts?.ready;
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      const roundRect = (x: number, y: number, width: number, height: number, radius: number) => {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
      };
      const fitText = (value: string, maxWidth: number, startSize: number, minSize: number, weight = 900) => {
        let size = startSize;
        do {
          ctx.font = `${weight} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
          if (ctx.measureText(value).width <= maxWidth) break;
          size -= 2;
        } while (size > minSize);
        return size;
      };
      const card = (x: number, y: number, width: number, height: number, fill = "#0d2118") => {
        roundRect(x, y, width, height, 22);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.12)";
        ctx.lineWidth = 2;
        ctx.stroke();
      };

      ctx.fillStyle = "#06130d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(244,196,48,.035)";
      for (let x = -300; x < 1300; x += 180) {
        ctx.save();
        ctx.translate(x, 0);
        ctx.transform(1, 0, -.35, 1, 0, 0);
        ctx.fillRect(0, 0, 82, 1350);
        ctx.restore();
      }
      ctx.fillStyle = "#f4c430";
      ctx.fillRect(0, 0, 1080, 14);

      ctx.fillStyle = "#f4c430";
      ctx.font = '900 42px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText("F⚽ FUTBOBO", 64, 86);
      ctx.fillStyle = "#91a79c";
      ctx.font = '800 22px Manrope, Arial, sans-serif';
      ctx.textAlign = "right";
      ctx.fillText("ARQUIVO DE CARREIRA", 1016, 80);
      ctx.textAlign = "left";

      card(64, 124, 952, 320, "#0b1d15");
      ctx.fillStyle = currentClub.primary || "#1a5e42";
      ctx.beginPath();
      ctx.arc(172, 268, 76, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = currentClub.secondary || "#f4c430";
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = '900 38px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(currentClub.abbr.slice(0, 4), 172, 281);
      ctx.textAlign = "left";

      ctx.fillStyle = "#f4c430";
      ctx.font = '900 20px Manrope, Arial, sans-serif';
      ctx.fillText(displayGame.archetype.toLocaleUpperCase("pt-BR"), 280, 193);
      const nameSize = fitText(displayGame.name.toLocaleUpperCase("pt-BR"), 570, 76, 42);
      ctx.fillStyle = "#f3f6f4";
      ctx.font = `900 ${nameSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.fillText(displayGame.name.toLocaleUpperCase("pt-BR"), 280, 265);
      ctx.fillStyle = "#91a79c";
      ctx.font = '700 24px Manrope, Arial, sans-serif';
      ctx.fillText(`#${displayGame.number} · ${position.name} · ${nationCountry.name}`, 280, 307);
      ctx.fillText(`${displayGame.history.length} temporadas · aposentou aos ${displayGame.age}`, 280, 346);
      ctx.fillStyle = "#f4c430";
      ctx.font = '900 76px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText(String(peakOverall), 960, 379);
      ctx.fillStyle = "#91a79c";
      ctx.font = '800 17px Manrope, Arial, sans-serif';
      ctx.fillText("PICO OVR", 960, 407);
      ctx.textAlign = "left";

      const metrics = [
        ["JOGOS", displayGame.stats.appearances],
        [displayGame.position === "GOL" ? "SEM SOFRER" : "GOLS", displayGame.position === "GOL" ? displayGame.stats.cleanSheets : displayGame.stats.goals],
        ["ASSISTÊNCIAS", displayGame.stats.assists],
        ["TAÇAS", totalTitles],
      ] as const;
      metrics.forEach(([label, value], index) => {
        const x = 64 + index * 242;
        card(x, 468, 226, 132);
        ctx.fillStyle = "#91a79c";
        ctx.font = '800 17px Manrope, Arial, sans-serif';
        ctx.fillText(label, x + 22, 508);
        ctx.fillStyle = index === 3 ? "#f4c430" : "#f3f6f4";
        ctx.font = '900 50px "Barlow Condensed", "Arial Narrow", sans-serif';
        ctx.fillText(String(value), x + 22, 568);
      });

      card(64, 624, 952, 226, "#102218");
      ctx.fillStyle = "#f4c430";
      ctx.font = '900 20px Manrope, Arial, sans-serif';
      ctx.fillText("PRINCIPAIS CONQUISTAS", 88, 664);
      const posterHonours = shareTitleHighlights.slice(0, 4);
      if (posterHonours.length) {
        posterHonours.forEach((entry, index) => {
          const col = index % 2;
          const row = Math.floor(index / 2);
          const x = 88 + col * 452;
          const y = 714 + row * 66;
          ctx.fillStyle = "#f4c430";
          ctx.font = '900 34px "Barlow Condensed", "Arial Narrow", sans-serif';
          ctx.fillText(`${entry.count}×`, x, y);
          ctx.fillStyle = "#f3f6f4";
          ctx.font = '800 20px Manrope, Arial, sans-serif';
          ctx.fillText(entry.label, x + 58, y - 2);
        });
      } else {
        ctx.fillStyle = "#91a79c";
        ctx.font = '700 24px Manrope, Arial, sans-serif';
        ctx.fillText("Uma história construída além das taças.", 88, 732);
      }

      card(64, 874, 952, 174, "#151f18");
      ctx.fillStyle = "#cdb9ff";
      ctx.font = '900 19px Manrope, Arial, sans-serif';
      ctx.fillText("PRÊMIOS INDIVIDUAIS", 88, 916);
      const awards = [
        ["BOLAS DE OURO", ballonDor],
        ["WORLD XI", worldXi],
        ["TOTAL", totalIndividualAwards],
      ] as const;
      awards.forEach(([label, value], index) => {
        const x = 88 + index * 300;
        ctx.fillStyle = value > 0 ? "#f3f6f4" : "#617269";
        ctx.font = '900 44px "Barlow Condensed", "Arial Narrow", sans-serif';
        ctx.fillText(String(value), x, 982);
        ctx.fillStyle = "#91a79c";
        ctx.font = '800 15px Manrope, Arial, sans-serif';
        ctx.fillText(label, x + 50, 979);
      });

      ctx.fillStyle = "#91a79c";
      ctx.font = '800 17px Manrope, Arial, sans-serif';
      ctx.fillText("CAMINHO", 64, 1096);
      ctx.fillStyle = "#f3f6f4";
      const pathSize = fitText(clubLine || currentClub.shortName, 952, 30, 19, 800);
      ctx.font = `800 ${pathSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.fillText(clubLine || currentClub.shortName, 64, 1140);

      ctx.fillStyle = "#f4c430";
      ctx.font = '900 48px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(legacyStanding.label.toLocaleUpperCase("pt-BR"), 64, 1222);
      ctx.fillStyle = "#91a79c";
      ctx.font = '800 19px Manrope, Arial, sans-serif';
      ctx.fillText(`${displayGame.legacyPoints} pontos de legado · ${displayGame.unlockedAchievements.length}/${ACHIEVEMENTS.length} conquistas`, 64, 1260);
      ctx.textAlign = "right";
      ctx.fillText("erereck.github.io/futbobo", 1016, 1300);

      return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao criar pôster")), "image/png"));
    };

    try {
      const blob = await makePoster();
      const safeName = displayGame.name.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "carreira";
      const file = new File([blob], `futbobo-${safeName}.png`, { type: "image/png" });
      const shareData = { title: `A carreira de ${displayGame.name} no Futbobo`, text, url: window.location.href, files: [file] };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
        setToast("Pôster da carreira compartilhado");
        return;
      }
      const imageUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(imageUrl);
      await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
      setToast("Pôster salvo e resumo copiado");
    } catch {
      setToast("Compartilhamento cancelado");
    }
  }

  const shellPhase = hallPreview ? "summary" : game.phase;
  const shellClass = `app-shell app-shell-${shellPhase}${shellPhase === "welcome" ? " app-shell-welcome" : ""}`;

  if (monteCarloReport) {
    return (
      <main className="app-shell monte-carlo-shell" data-testid="monte-carlo-report" data-report={JSON.stringify(monteCarloReport)}>
        <section>
          <span className="eyebrow">LABORATÓRIO DE BALANCEAMENTO</span>
          <h1>{monteCarloReport.runs} carreiras simuladas</h1>
          <div className="monte-carlo-grid">
            <Metric label="Bolas de Ouro" value={monteCarloReport.totalBallonDor} tone="gold" />
            <Metric label="World XI" value={monteCarloReport.totalWorldXi} tone="green" />
            <Metric label="World XI sem Bola de Ouro" value={monteCarloReport.worldXiWithoutBallonDor} />
            <Metric label="Bola de Ouro sem prêmio de produção" value={monteCarloReport.ballonDorWithoutProductionAward} />
            <Metric label="Bola de Ouro sem World XI" value={monteCarloReport.ballonDorWithoutWorldXi} />
            <Metric label="Carreiras vencedoras" value={monteCarloReport.careersWithBallonDor} tone="green" />
            <Metric label="Chance por carreira" value={`${monteCarloReport.careerChancePercent}%`} />
            <Metric label="Prêmios por carreira" value={monteCarloReport.averageIndividualAwards} />
            <Metric label="Pico OVR médio" value={monteCarloReport.averagePeakOverall} />
            <Metric label="Títulos por carreira" value={monteCarloReport.averageTrophies} />
            <Metric label="Sem títulos" value={monteCarloReport.careersWithoutTrophies} />
            <Metric label="5+ Bolas de Ouro" value={monteCarloReport.careersWithFiveBallonDor} />
            <Metric label="Temporadas processadas" value={monteCarloReport.totalSeasons} />
          </div>
          <article className="monte-carlo-best">
            <span>MELHOR CARREIRA DO LOTE</span>
            <strong>{monteCarloReport.bestCareer.name} · {monteCarloReport.bestCareer.position}</strong>
            <p>{monteCarloReport.bestCareer.peakOverall} OVR de pico · {monteCarloReport.bestCareer.trophies} títulos · {monteCarloReport.bestCareer.goals} gols · {monteCarloReport.bestCareer.ballonDor} Bola(s) de Ouro</p>
          </article>
          {monteCarloReport.winners.length > 0 ? (
            <div className="monte-carlo-winners">
              {monteCarloReport.winners.map((winner) => <span key={winner.career}>#{winner.career} · {winner.position} · {winner.peakOverall} OVR · {winner.ballonDor}×</span>)}
            </div>
          ) : (
            <p className="monte-carlo-empty">Nenhuma carreira conquistou a Bola de Ouro neste lote.</p>
          )}
        </section>
      </main>
    );
  }

  if (game.phase === "botao-final" && currentBotaoMatch && currentBotaoSetup) {
    if (botaoMatchStarted) {
      return (
        <BotaoMatch
          key={currentBotaoSetup.matchId}
          setup={currentBotaoSetup}
          onFinish={applyBotaoMatchResult}
        />
      );
    }
    return (
      <main className="botao-lobby botao-career-lobby screen-enter">
        <span className="botao-lobby-kicker">
          {currentBotaoMatch.source === "national" ? "SELEÇÃO EM CAMPO" : "PARTIDA DECISIVA"}
        </span>
        <h1>{currentBotaoMatch.stageName}</h1>
        <p className="botao-lobby-lead">
          {currentBotaoMatch.competitionName} · Agora a taça depende da mesa.
        </p>
        <div className="botao-card botao-final-versus">
          <div className="botao-team">
            <TeamCrest team={currentBotaoSetup.userTeam} size={58} />
            <strong>{currentBotaoSetup.userTeam.shortName}</strong>
          </div>
          <div className="botao-versus-mark"><small>DECISÃO</small><b>×</b></div>
          <div className="botao-team botao-team-cpu">
            <strong>{currentBotaoSetup.cpuTeam.shortName}</strong>
            <TeamCrest team={currentBotaoSetup.cpuTeam} size={58} />
          </div>
        </div>
        <div className="botao-card botao-career-player">
          <span>{currentBotaoSetup.entry ? "VOCÊ COMEÇA NO BANCO" : "SEU BOTÃO"}</span>
          <strong>#{game.number} · {positionByKey(game.position).name} · {game.overall} OVR</strong>
          {currentBotaoSetup.entry && (
            <div className="botao-reserve-entry">
              <b>ENTRA AOS 45&apos;</b>
              <p>
                Seu OVR ainda está abaixo do nível de titularidade desta seleção. Você assume o botão
                na metade final da partida{currentBotaoSetup.entry.score.user + currentBotaoSetup.entry.score.cpu > 0
                  ? ` com o placar em ${currentBotaoSetup.entry.score.user} × ${currentBotaoSetup.entry.score.cpu}.`
                  : " com o jogo ainda empatado."}
              </p>
            </div>
          )}
        </div>
        <div className="botao-actions">
          <button type="button" className="botao-primary" onClick={startCurrentBotaoMatch}>
            Jogar no futebol de botão
          </button>
          <button type="button" className="botao-ghost" onClick={simulateCurrentBotaoMatch} disabled={botaoSimulating}>
            {botaoSimulating ? "Simulando…" : "Simular esta partida"}
          </button>
        </div>
      </main>
    );
  }

  if (game.phase === "botao-result" && game.lastBotaoResult) {
    const { match, result } = game.lastBotaoResult;
    const setup = match.source === "national"
      ? buildNationalMatchSetup({
          seed: game.seed,
          season: match.season,
          competitionId: match.competitionId,
          competitionName: match.competitionName,
          stageName: match.stageName,
          country: countryById(game.nationality),
          opponent: countryById(match.opponentId),
          playerName: game.name,
          playerNumber: game.number,
          position: game.position,
          overall: game.overall,
          playerRole: nationalMatchRole(
            game.overall,
            countryById(game.nationality),
            match.nationalTier ?? game.nationalCategory,
            game.nationalCaptain,
          ),
          ratings: ratingsFromAttributes(game.attributes, game.overall),
          rules: {
            goalLimit: appSettings.botaoGoalLimit ?? 3,
            halfSeconds: appSettings.botaoHalfSeconds ?? 120,
            extraSeconds: appSettings.botaoExtraSeconds ?? 45,
            penaltyRounds: appSettings.botaoPenaltyRounds ?? 5,
          },
        })
      : buildFinalSetup({
          seed: game.seed,
          season: match.season,
          competitionId: match.competitionId,
          competitionName: match.competitionName,
          stageName: match.stageName,
          club: clubById(game.currentClubId),
          opponent: clubById(match.opponentId),
          playerName: game.name,
          playerNumber: game.number,
          position: game.position,
          overall: game.overall,
          ratings: ratingsFromAttributes(game.attributes, game.overall),
        });
    return (
      <main className="botao-lobby botao-career-result screen-enter">
        <p className="botao-lobby-lead">
          {match.competitionName} · {match.stageName}
          {result.walkover ? " · W.O. por abandono" : result.simulated ? " · simulada" : ""}
        </p>
        <div className={`botao-headline ${result.champion ? "botao-headline-win" : "botao-headline-loss"}`}>
          {result.walkover ? "DERROTA POR W.O." : result.champion ? (match.stageName === "Final" ? "CAMPEÃO" : "CLASSIFICADO") : match.stageName === "Final" ? "VICE" : "ELIMINADO"}
        </div>
        {result.walkover && (
          <div className="botao-card botao-walkover-notice">
            <span>W.O. REGISTRADO</span>
            <strong>A partida foi abandonada</strong>
            <p>Atualizar ou fechar a página depois de entrar em campo confirma derrota administrativa por 3 × 0.</p>
          </div>
        )}
        <div className="botao-card">
          <div className="botao-scoreboard">
            <div className="botao-team"><TeamCrest team={setup.userTeam} /><strong>{setup.userTeam.shortName}</strong></div>
            <div className="botao-score"><b>{result.goalsFor}</b><span>×</span><b>{result.goalsAgainst}</b></div>
            <div className="botao-team botao-team-cpu"><strong>{setup.cpuTeam.shortName}</strong><TeamCrest team={setup.cpuTeam} /></div>
          </div>
          <div className="botao-formation-row">
            {result.decision === "penalties" && <span className="botao-chip">Pênaltis {result.penaltyFor} × {result.penaltyAgainst}</span>}
            <span className="botao-chip botao-chip-you">Você: {result.playerGoals}G · {result.playerAssists}A</span>
            {result.manOfTheMatch && <span className="botao-chip botao-chip-stat">Melhor em campo</span>}
          </div>
        </div>
        <div className="botao-card">
          <span className="botao-card-title">Gols da partida</span>
          {result.timeline.some(isMatchGoal) ? (
            <div className="botao-result-lines">
              {result.timeline.map((entry, timelineIndex) => ({ entry, timelineIndex })).filter(({ entry }) => isMatchGoal(entry)).map(({ entry, timelineIndex }) => {
                const replayIndex = result.replays?.findIndex((replay) => replay.timelineIndex === timelineIndex) ?? -1;
                return (
                  <div key={`${entry.clock}-${timelineIndex}`} className={`botao-result-line ${entry.byUser ? "botao-result-line-you" : ""} ${entry.beforePlayerEntry ? "botao-result-line-before-entry" : ""}`}>
                    <span className="botao-result-goal-copy"><b>{entry.text}</b><span>{entry.side === "user" ? setup.userTeam.abbr : setup.cpuTeam.abbr} · {formatGoalMinute(entry, setup.rules)}{entry.beforePlayerEntry ? " · antes da sua entrada" : ""}</span></span>
                    {replayIndex >= 0 && <button type="button" onClick={() => setActiveGoalReplay(activeGoalReplay === replayIndex ? null : replayIndex)}>{activeGoalReplay === replayIndex ? "Fechar replay" : "Ver replay"}</button>}
                  </div>
                );
              })}
            </div>
          ) : <p className="botao-result-empty">{result.walkover ? "Partida encerrada por abandono. Placar administrativo de 3 × 0." : "Nenhum gol antes da disputa por pênaltis."}</p>}
          {activeGoalReplay !== null && result.replays?.[activeGoalReplay] && (
            <GoalReplay
              replay={result.replays[activeGoalReplay]}
              setup={setup}
              label={result.timeline[result.replays[activeGoalReplay].timelineIndex]?.text ?? "Gol da partida"}
            />
          )}
        </div>
        <div className="botao-actions">
          <button type="button" className="botao-primary" onClick={continueAfterBotaoResult}>
            {game.pendingPressConference
              ? "Ir para a coletiva de imprensa"
              : game.pendingBotaoMatches.length
                ? "Próxima decisão"
                : "Ver resumo da temporada"}
          </button>
        </div>
        {pressConferenceOpen && game.pendingPressConference && (() => {
          const conference = game.pendingPressConference;
          const question = conference.questions[conference.questionIndex];
          return (
            <div className="press-conference-backdrop">
              <section className="press-conference" role="dialog" aria-modal="true" aria-labelledby="press-question">
                <header>
                  <span>🎙</span>
                  <div><small>COLETIVA · PERGUNTA {conference.questionIndex + 1} DE {conference.questions.length}</small><strong>{conference.competitionName}</strong></div>
                </header>
                <p>{question.context}</p>
                <h2 id="press-question">{question.question}</h2>
                <div>
                  {question.answers.map((answer, index) => (
                    <button type="button" key={answer.label} onClick={() => answerPressConference(index)}>
                      <span><strong>{answer.label}</strong><small>{answer.tone === "bold" ? "Resposta forte" : answer.tone === "team" ? "Valoriza o grupo" : "Resposta serena"}</small></span><b>→</b>
                    </button>
                  ))}
                </div>
                <footer>Suas respostas afetam torcida, imprensa, liderança e o vestiário.</footer>
              </section>
            </div>
          );
        })()}
      </main>
    );
  }

  return (
    <main className={shellClass}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      {toast && <div className="toast" role="status">{toast}</div>}
      {androidInstallOpen && (
        <AndroidInstallDialog
          native={nativeAndroid}
          release={androidRelease}
          onClose={() => setAndroidInstallOpen(false)}
          onDownload={() => {
            void openAndroidDownload(androidRelease?.url);
          }}
          onWebInstall={nativeAndroid ? undefined : () => {
            void installWebShortcut();
          }}
        />
      )}
      {game.phase === "season-result" && game.pendingStoryDecision && (
        <div className="modal-backdrop story-decision-backdrop" role="presentation">
          <section className={`story-decision-modal story-${playerStoryById(game.playerStoryId).tone}`} role="dialog" aria-modal="true" aria-labelledby="story-decision-title">
            <div className="story-decision-chapter-track" aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => <i key={index} className={index < game.storyLog.length + 1 ? "active" : ""} />)}
            </div>
            <header>
              <span className="story-decision-icon">{game.pendingStoryDecision.icon}</span>
              <div>
                <small>{game.pendingStoryDecision.kicker}</small>
                <h2 id="story-decision-title">{game.pendingStoryDecision.title}</h2>
              </div>
            </header>
            <p>{game.pendingStoryDecision.description}</p>
            <div className="story-decision-choices">
              {game.pendingStoryDecision.choices.map((choice, index) => (
                <button type="button" key={choice.label} onClick={() => resolveStoryDecision(index)}>
                  <em>{String(index + 1).padStart(2, "0")}</em>
                  <span><strong>{choice.label}</strong><small>{choice.hint}</small></span><b>→</b>
                </button>
              ))}
            </div>
            <footer><b>◆</b><span>Esta decisão vira parte permanente da história de {game.name}.</span></footer>
          </section>
        </div>
      )}
      {updateNoticeOpen && (
        <div className="modal-backdrop update-backdrop" role="presentation">
          <section className={`update-notice update-page-${updateNoticePage}`} role="dialog" aria-modal="true" aria-labelledby="update-title">
            {updateNoticePage === "current" ? (
              <>
                <header className="update-mega-hero">
                  <div className="update-symbol">⚽</div>
                  <div>
                    <span className="update-version">v84 · VIEWPORT DINÂMICA</span>
                    <h1 id="update-title">O Futbobo inteiro entrou em campo de roupa nova.</h1>
                  </div>
                </header>
                <p>Navegação, hierarquia e distribuição foram reconstruídas para o celular funcionar como um jogo rápido e o computador como uma central de carreira de verdade.</p>
                <div className="update-mega-stats" aria-label="Resumo do update">
                  <span><b>2</b> experiências responsivas</span>
                  <span><b>6</b> centrais reconstruídas</span>
                  <span><b>100%</b> offline no APK</span>
                </div>
                <span className="update-section-label">O GRANDE DESTAQUE</span>
                <div className="update-grid update-mega-grid">
                  <article className="update-featured"><b>▥</b><span><strong>Desktop é uma central</strong><small>Rail lateral, canvas amplo e módulos distribuídos pela importância — sem esticar a interface do celular.</small></span></article>
                  <article><b>▯</b><span><strong>Mobile feito para o polegar</strong><small>Ações claras, leitura vertical e navegação fixa sem comprimir conteúdo importante.</small></span></article>
                  <article><b>90</b><span><strong>Tipografia de placar</strong><small>Barlow Condensed e Manrope locais dão ritmo esportivo e continuam funcionando sem internet.</small></span></article>
                  <article><b>◆</b><span><strong>Uma ação por tela</strong><small>Escolha, resultado, transferência ou prêmio sempre dominam a hierarquia certa.</small></span></article>
                  <article><b>≡</b><span><strong>Arquivo editorial</strong><small>Histórico, troféus, carreira final e prêmios agora contam uma história em vez de formar uma pilha.</small></span></article>
                  <article><b>●</b><span><strong>Futebol de botão integrado</strong><small>Mesa, placar, controles e replays passam a falar a mesma língua visual da carreira.</small></span></article>
                </div>
                <span className="update-section-label">O QUE CONTINUA INTACTO</span>
                <div className="update-grid update-mega-grid">
                  <article><b>◆</b><span><strong>Toda a lógica preservada</strong><small>O redesign reorganiza a experiência sem alterar saves, decisões, atributos ou resultados.</small></span></article>
                  <article><b>↔</b><span><strong>Saves separados</strong><small>O desafio diário nunca apaga nem substitui sua carreira normal.</small></span></article>
                  <article><b>▣</b><span><strong>Backup completo</strong><small>Desafios, resultados, carreira, Hall da Fama e configurações entram na exportação.</small></span></article>
                </div>
                <button className="previous-update-button" onClick={() => setUpdateNoticePage("previous")}><span>UPDATE ANTERIOR</span><strong>W.O. anti-reload e o futebol de botão consolidado</strong><b>→</b></button>
              </>
            ) : (
              <>
                <span className="update-version previous">v80 · W.O. ANTI-RELOAD</span>
                <div className="update-symbol previous">24H</div>
                <h1 id="update-title">Entrou em campo, a partida vale.</h1>
                <p>Atualizar ou fechar uma partida em andamento passou a registrar derrota administrativa por 3–0, fechando o último grande exploit das finais.</p>
                <div className="update-grid previous-grid">
                  <article><b>3–0</b><span><strong>W.O. persistente</strong><small>Fechar, atualizar ou travar depois de entrar em campo conta como abandono.</small></span></article>
                  <article><b>44</b><span><strong>Regressões protegidas</strong><small>A regra entrou sem quebrar carreira normal ou Desafio Futbobo.</small></span></article>
                </div>
                <button className="previous-update-button back" onClick={() => setUpdateNoticePage("current")}><span>UPDATE ATUAL</span><strong>Voltar para Matchday Editorial</strong><b>←</b></button>
              </>
            )}
            <button className="primary-button" onClick={() => setUpdateNoticeOpen(false)}>Entrar no jogo <span>→</span></button>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>CONFIGURAÇÕES DO UNIVERSO</span><h2 id="settings-title">Universo e partidas</h2></div>
              <button className="icon-button" aria-label="Fechar configurações" onClick={() => setSettingsOpen(false)}>×</button>
            </header>
            <p>Crie pessoas do seu universo. Em novas carreiras, elas podem aparecer aleatoriamente como rivais, candidatos a prêmios e protagonistas de eventos. Nem toda carreira terá um rival.</p>
            <section className="final-mode-settings">
              <span>PARTIDAS DECISIVAS</span>
              <strong>Como você quer viver as partidas que valem taça?</strong>
              <div>
                {[
                  { id: "simulate" as const, label: "Sempre simular", text: "Mantém o ritmo atual do simulador." },
                  { id: "finals-only" as const, label: "Jogar finais", text: "Botão manual apenas nas decisões." },
                  { id: "play-key-matches" as const, label: "Finais + Copa", text: "Também inclui o mata-mata da Copa do Mundo." },
                ].map((mode) => (
                  <button className={(appSettings.finalMatchMode ?? "play-key-matches") === mode.id ? "selected" : ""} key={mode.id} onClick={() => setAppSettings((current) => ({ ...current, finalMatchMode: mode.id }))}>
                    <b>{(appSettings.finalMatchMode ?? "play-key-matches") === mode.id ? "✓" : "○"}</b><span><strong>{mode.label}</strong><small>{mode.text}</small></span>
                  </button>
                ))}
              </div>
              <small>A escolha vale imediatamente para a próxima temporada simulada e fica salva neste aparelho.</small>
              <div className="botao-rule-settings">
                <label>Fim antecipado
                  <select value={appSettings.botaoGoalLimit ?? 3} onChange={(event) => setAppSettings((current) => ({ ...current, botaoGoalLimit: Number(event.target.value) as 0 | 3 | 5 }))}>
                    <option value={3}>Terminar aos 3 gols</option>
                    <option value={5}>Terminar aos 5 gols</option>
                    <option value={0}>Desativado</option>
                  </select>
                </label>
                <label>Duração
                  <select value={appSettings.botaoHalfSeconds ?? 120} onChange={(event) => setAppSettings((current) => ({ ...current, botaoHalfSeconds: Number(event.target.value) as 90 | 120 | 180 }))}>
                    <option value={90}>1min30</option>
                    <option value={120}>2 minutos</option>
                    <option value={180}>3 minutos</option>
                  </select>
                </label>
                <label>Prorrogação
                  <select value={appSettings.botaoExtraSeconds ?? 45} onChange={(event) => setAppSettings((current) => ({ ...current, botaoExtraSeconds: Number(event.target.value) as 30 | 45 | 60 }))}>
                    <option value={30}>30 segundos</option>
                    <option value={45}>45 segundos</option>
                    <option value={60}>1 minuto</option>
                  </select>
                </label>
                <label>Série de pênaltis
                  <select value={appSettings.botaoPenaltyRounds ?? 5} onChange={(event) => setAppSettings((current) => ({ ...current, botaoPenaltyRounds: Number(event.target.value) as 3 | 5 }))}>
                    <option value={3}>3 cobranças</option>
                    <option value={5}>5 cobranças</option>
                  </select>
                </label>
              </div>
            </section>
            <div className="settings-section-heading"><span>PERSONAGENS</span><strong>Rivais e nomes do seu universo</strong></div>
            <div className="character-creator">
              <label>Nome do personagem<input value={characterName} maxLength={28} placeholder="Ex.: Gabriel Souza" onChange={(event) => setCharacterName(event.target.value)} /></label>
              <label>Posição<select value={characterPosition} onChange={(event) => setCharacterPosition(event.target.value as PositionKey)}>{POSITIONS.map((item) => <option key={item.key} value={item.key}>{item.key} · {item.name}</option>)}</select></label>
              <button className="primary-button" disabled={characterName.trim().length < 2 || appSettings.customCharacters.length >= 12} onClick={addCustomCharacter}>Criar personagem <span>+</span></button>
            </div>
            <div className="custom-character-list">
              <div><span>SEU ELENCO</span><strong>{appSettings.customCharacters.length}/12</strong></div>
              {appSettings.customCharacters.length === 0 ? (
                <p className="empty-character-list">Você ainda não criou ninguém. Os rivais fictícios do jogo continuam podendo aparecer normalmente.</p>
              ) : appSettings.customCharacters.map((character) => (
                <article key={character.id}>
                  <span>{positionByKey(character.position).icon}</span>
                  <div><strong>{character.name}</strong><small>{character.position} · {positionByKey(character.position).name}</small></div>
                  <button aria-label={`Remover ${character.name}`} onClick={() => removeCustomCharacter(character.id)}>Remover</button>
                </article>
              ))}
            </div>
            <section className="custom-club-settings">
              <div className="settings-section-heading"><span>TIME PERSONALIZADO</span><strong>Substitua um clube sem alterar a liga</strong></div>
              <p>O time customizado herda cidade, liga, força e reputação do clube substituído. Nome, cores e escudo passam a ser seus.</p>
              <label>Clube que será substituído
                <select value={customClubReplacement} onChange={(event) => setCustomClubReplacement(event.target.value)}>
                  {[...ORIGINAL_CLUB_PRESENTATION.entries()]
                    .sort((a, b) => a[1].shortName.localeCompare(b[1].shortName, "pt-BR"))
                    .map(([id, club]) => <option key={id} value={id}>{club.shortName} · {leagueById(CLUBS.find((candidate) => candidate.id === id)?.leagueId ?? CLUBS[0].leagueId).name}</option>)}
                </select>
              </label>
              <div className="custom-club-grid">
                <label>Nome completo<input maxLength={42} value={customClubName} onChange={(event) => setCustomClubName(event.target.value)} placeholder="Ex.: Futbobo FC" /></label>
                <label>Nome curto<input maxLength={24} value={customClubShortName} onChange={(event) => setCustomClubShortName(event.target.value)} placeholder="Ex.: Futbobo" /></label>
                <label>Sigla<input maxLength={4} value={customClubAbbr} onChange={(event) => setCustomClubAbbr(event.target.value)} placeholder="FTB" /></label>
                <label>Cor principal<input type="color" value={customClubPrimary} onChange={(event) => setCustomClubPrimary(event.target.value)} /></label>
                <label>Cor secundária<input type="color" value={customClubSecondary} onChange={(event) => setCustomClubSecondary(event.target.value)} /></label>
              </div>
              <label>Escudo por link HTTPS<input value={customClubBadge.startsWith("data:") ? "" : customClubBadge} onChange={(event) => setCustomClubBadge(event.target.value)} placeholder="https://.../escudo.png" /></label>
              <label className="custom-club-file">Ou envie um arquivo de até 1 MB<input type="file" accept="image/*" onChange={(event) => readCustomClubBadge(event.target.files?.[0])} /></label>
              {customClubBadge && <small className="custom-club-badge-ready">✓ Escudo personalizado pronto</small>}
              <button className="primary-button" disabled={customClubName.trim().length < 2 || customClubAbbr.trim().length < 2} onClick={saveCustomClub}>Salvar time personalizado <span>+</span></button>
              {(appSettings.customClubs ?? []).length > 0 && (
                <div className="custom-character-list">
                  <div><span>TIMES CRIADOS</span><strong>{(appSettings.customClubs ?? []).length}/8</strong></div>
                  {(appSettings.customClubs ?? []).map((club) => (
                    <article key={club.replacedClubId}>
                      <ClubBadge club={clubById(club.replacedClubId)} size="sm" />
                      <div><strong>{club.shortName}</strong><small>Substitui {ORIGINAL_CLUB_PRESENTATION.get(club.replacedClubId)?.shortName}</small></div>
                      <button onClick={() => removeCustomClub(club.replacedClubId)}>Remover</button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="save-data-settings">
              <div className="settings-section-heading"><span>DADOS SALVOS</span><strong>Leve suas carreiras para outro aparelho</strong></div>
              <p>O backup inclui carreira atual, Hall da Fama, personagens, times personalizados e configurações.</p>
              <div>
                <button className="secondary-button" onClick={exportSavedData}>Exportar dados</button>
                <button className="secondary-button" onClick={() => saveImportRef.current?.click()}>Importar dados</button>
                <input ref={saveImportRef} type="file" accept="application/json,.json" hidden onChange={(event) => importSavedData(event.target.files?.[0])} />
              </div>
            </section>
            <small className="settings-note">As alterações valem para carreiras novas e ficam salvas neste aparelho.</small>
          </section>
        </div>
      )}

      {selectedAchievementId && (() => {
        const achievement = ACHIEVEMENTS.find((item) => item.id === selectedAchievementId);
        if (!achievement) return null;
        const unlocked = game.unlockedAchievements.includes(achievement.id);
        const legendarySecret = achievement.rarity === "lendário" && !unlocked;
        return (
          <div className="modal-backdrop achievement-backdrop" role="presentation" onMouseDown={() => setSelectedAchievementId("")}>
            <section className={`achievement-detail rarity-${achievement.rarity}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <button className="icon-button" aria-label="Fechar conquista" onClick={() => setSelectedAchievementId("")}>×</button>
              <b>{unlocked ? achievement.icon : "?"}</b>
              <span>{achievement.rarity.toLocaleUpperCase("pt-BR")}</span>
              <h2>{legendarySecret ? "Conquista lendária secreta" : achievement.title}</h2>
              <p>{legendarySecret ? "Este requisito continuará oculto até alguém desbloqueá-lo neste aparelho." : achievement.description}</p>
              <strong>{unlocked ? "✓ DESBLOQUEADA" : legendarySecret ? "REQUISITO OCULTO" : "COMO DESBLOQUEAR"}</strong>
              {!unlocked && !legendarySecret && <small>{achievement.description}</small>}
            </section>
          </div>
        );
      })()}

      {game.phase === "welcome" && !hallPreview && (
        <section className="welcome-screen screen-enter">
          <div className="brand-lockup" aria-label="Futbobo">
            <BrandMark />
            <span>FUTBOBO</span>
            <small>CARREIRA</small>
          </div>
          <div className="welcome-layout">
            <div className="welcome-main">
              <div className="hero-pitch">
                <Image
                  className="welcome-hero-image"
                  src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/futbobo-hero-v6-background.webp`}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 760px) calc(100vw - 40px), 680px"
                  unoptimized
                />
                <div className="welcome-hero-brand" aria-label="Futbobo">
                  <BrandMark size="hero" />
                  <div>
                    <strong><span>FUT</span>BOBO</strong>
                    <small>SUA CARREIRA. SEU LEGADO.</small>
                  </div>
                </div>
              </div>
              <div className="welcome-copy">
                <span className="eyebrow">SIMULADOR DE CARREIRA · FUTEBOL DE BOTÃO</span>
                <h1>Seu nome na camisa. O resto é história.</h1>
                <p>Comece aos 12, atravesse clubes e continentes e decida quem você será quando a bola parar de rolar.</p>
              </div>
              <div className="welcome-actions">
                {hasSave && <button className="primary-button continue-career-button" onClick={continueSave}><small>SEU SAVE</small>Continuar carreira <span>→</span></button>}
                <button className={hasSave ? "secondary-button new-career-button" : "primary-button"} onClick={startNew}>Começar nova carreira <span>→</span></button>
              </div>
            </div>
            <aside className="welcome-side">
              <section className="challenge-card">
                <header><div><span>DESAFIO FUTBOBO</span><strong>Mesma promessa. Destinos opostos.</strong></div><b>24H</b></header>
                <p>A semente de hoje é igual em todos os aparelhos. Escolhas diferentes, carreiras comparáveis.</p>
                <div className="challenge-code"><small>CÓDIGO DE HOJE</small><strong>{todayChallenge.id}</strong></div>
                <div className="challenge-score-row">
                  <span><small>Seu recorde hoje</small><strong>{todayChallengeBest?.score ?? "—"}</strong></span>
                  <span><small>Tentativas concluídas</small><strong>{todayChallengeResults.length}</strong></span>
                </div>
                <button type="button" onClick={hasChallengeSave ? continueChallenge : startChallenge}>
                  {hasChallengeSave ? "Continuar desafio de hoje" : "Jogar o desafio de hoje"} <span>→</span>
                </button>
                {hasChallengeSave && <button className="challenge-restart" type="button" onClick={startChallenge}>Recomeçar com a mesma semente</button>}
              </section>
              <Link className="world-cup-quick-card" href="/copa">
                <span className="world-cup-quick-mark">◎</span>
                <span><small>MODO RÁPIDO</small><strong>Jogar uma Copa do Mundo</strong><em>Da fase de grupos à final · fora da carreira</em></span>
                <b>→</b>
              </Link>
              {hallOfFame.length > 0 && (
                <div className="welcome-hall">
                  <div><span>HALL DA FAMA LOCAL</span><strong>Suas melhores carreiras</strong></div>
                  {hallOfFame.slice(0, 3).map((entry, index) => (
                    <article className="hall-career-link" key={entry.id} role="button" tabIndex={0} aria-label={`Ver carreira completa de ${entry.name}`} onClick={() => openHallCareer(entry)} onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openHallCareer(entry); }
                    }}>
                      <b>#{index + 1}</b><ClubBadge club={clubById(entry.finalClubId)} size="sm" />
                      <div className="welcome-hall-copy"><strong>{entry.name}</strong><small>{entry.legacyLabel} · {entry.peakOverall} OVR</small></div><em>{entry.legacyPoints}</em>
                    </article>
                  ))}
                </div>
              )}
              <nav className="welcome-utilities" aria-label="Ferramentas">
                <button type="button" onClick={() => setSettingsOpen(true)}><b>⚙</b><span>Configurações</span></button>
                <button type="button" onClick={installWebApp}><b>{nativeAndroid ? "↻" : "▣"}</b><span>{nativeAndroid ? "Atualizar" : androidPhone ? "Baixar APK" : "Instalar"}</span></button>
                <button type="button" aria-label="Ver novidades do jogo" onClick={() => { setUpdateNoticePage("current"); setUpdateNoticeOpen(true); }}><b>⚽</b><span>Novidades</span></button>
              </nav>
              {installHelp && <div className="install-help">Use o menu do navegador e toque em <strong>Adicionar à tela inicial</strong> ou <strong>Instalar aplicativo</strong>.</div>}
            </aside>
          </div>
          <div className="welcome-features"><span>◉ {CLUBS.length} clubes</span><span>✦ 12 posições</span><span>🏆 {LEAGUES.length} ligas</span><span>★ {COUNTRIES.length} seleções</span></div>
          <footer className="welcome-version">
            <span>FUTBOBO</span><b>v84 · VIEWPORT DINÂMICA</b>
          </footer>
        </section>
      )}

      {game.phase === "identity" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "welcome" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 1 DE 5</span><strong>Quem vai vestir a camisa?</strong></div>
            <div className="step-count">01</div>
          </header>
          <div className="setup-content">
            <div className="identity-card">
              <div className="academy-avatar"><span>{game.number}</span><small>{game.position}</small></div>
              <div><span>IDADE INICIAL</span><strong>12 ANOS</strong><small>O sonho começa agora</small></div>
            </div>
            <div className="field-label">
              <label htmlFor="player-name">Nome do jogador</label>
              <div className="name-input-wrap">
                <input id="player-name" className="text-input" value={game.name} maxLength={18} placeholder="Como a torcida vai te chamar?" onChange={(event) => setGame((current) => ({ ...current, name: event.target.value }))} />
                <button className="random-name-die" type="button" aria-label="Sortear outro nome" title="Sortear outro nome" onClick={rollPlayerName}>⚄</button>
              </div>
            </div>
            <div className="two-fields">
              <label className="field-label">Camisa
                <input className="text-input" type="number" inputMode="numeric" min={1} max={99} value={shirtNumberInput} onChange={(event) => {
                  const nextValue = event.target.value;
                  setShirtNumberInput(nextValue);
                  if (!nextValue) return;
                  setGame((current) => ({ ...current, number: clamp(Number(nextValue) || 10, 1, 99) }));
                }} />
              </label>
              <fieldset className="field-label foot-field"><legend>Pé dominante</legend>
                <div className="segmented">
                  {(["Esquerda", "Direita"] as const).map((foot) => <button key={foot} type="button" aria-pressed={game.foot === foot} className={game.foot === foot ? "selected" : ""} onClick={() => setGame((current) => ({ ...current, foot }))}>{foot}</button>)}
                </div>
              </fieldset>
            </div>
            <div className="section-heading"><div><span>POSIÇÃO</span><h2>Onde você quer fazer história?</h2></div><span className="selected-pill">{position.key}</span></div>
            <div className="position-grid">
              {POSITIONS.map((item) => (
                <button key={item.key} type="button" aria-pressed={game.position === item.key} className={`position-button ${game.position === item.key ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, position: item.key }))} style={{ "--position-color": item.color, ...POSITION_FIELD_SPOTS[item.key] } as CSSProperties}>
                  <span>{item.icon}</span><strong>{item.key}</strong><small>{item.name}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="sticky-action"><button className="primary-button" disabled={!game.name.trim()} onClick={() => setGame((current) => ({ ...current, name: current.name.trim(), number: clamp(Number(shirtNumberInput) || 10, 1, 99), phase: "nationality" }))}>Escolher nacionalidade <span>→</span></button></div>
        </section>
      )}

      {game.phase === "nationality" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "identity" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 2 DE 5</span><strong>Por qual país você vai jogar?</strong></div>
            <div className="step-count">02</div>
          </header>
          <div className="setup-content">
            <div className="intro-card"><span className="intro-icon">◇</span><div><strong>Sua Seleção vai te acompanhar a carreira toda.</strong><p>A nacionalidade define sua rota de base, as categorias Sub-17, Sub-20 e Olímpica, além da Copa do Mundo e do torneio continental da sua região.</p></div></div>
            <label className="nation-search">
              <span>BUSCAR ENTRE {COUNTRIES.length} SELEÇÕES</span>
              <input value={nationalitySearch} onChange={(event) => setNationalitySearch(event.target.value)} placeholder="Ex.: Uzbequistão, Canadá, França..." />
            </label>
            <div className="nation-grid">
              {filteredCountries.map((country) => (
                <button key={country.id} aria-pressed={game.nationality === country.id} className={`nation-choice ${game.nationality === country.id ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, nationality: country.id, academyCountryId: defaultAcademyCountry(country.id), academyClubId: "" }))}>
                  <NationBadge country={country} size="md" />
                  <span><strong>{country.name}</strong><small>{continentalNationalTournament(country)}</small></span>
                </button>
              ))}
            </div>
          </div>
          <div className="sticky-action"><button className="primary-button" onClick={() => setGame((current) => ({ ...current, phase: "academy" }))}>Escolher clube de base <span>→</span></button></div>
        </section>
      )}

      {game.phase === "academy" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "nationality" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 3 DE 5</span><strong>Escolha sua base</strong></div>
            <div className="step-count">03</div>
          </header>
          <div className="setup-content">
            <div className={`intro-card academy-route-card ${hasLocalAcademyRoute(game.academyCountryId) ? "local" : "international"}`}><NationBadge country={countryById(game.academyCountryId)} size="sm" /><div><small>{academyRoute.label}</small><strong>{academyRoute.title}</strong><p>{academyRoute.text}</p></div></div>
            <div className="section-heading"><div><span>PAÍS DA BASE</span><h2>Onde você vai se formar?</h2></div><button className="secondary-button" type="button" onClick={() => setGame((current) => ({ ...current, academyCountryId: pick(COUNTRIES.filter((country) => PLAYABLE_ACADEMY_COUNTRIES.includes(country.id)), current.seed, current.season + current.history.length).id, academyClubId: "" }))}>Aleatório</button></div>
            <div className="nation-grid academy-country-grid">
              {sortedCountries(COUNTRIES.filter((country) => PLAYABLE_ACADEMY_COUNTRIES.includes(country.id))).map((country) => (
                <button key={country.id} aria-pressed={game.academyCountryId === country.id} className={`nation-choice ${game.academyCountryId === country.id ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, academyCountryId: country.id, academyClubId: "" }))}>
                  <NationBadge country={country} size="md" />
                  <span><strong>{country.name}</strong><small>{country.id === game.nationality ? "mesmo país da seleção" : country.id === defaultAcademyCountry(game.nationality) ? "rota recomendada" : "liga jogável"}</small></span>
                </button>
              ))}
            </div>
            <div className="club-grid">
              <button className="club-choice random-academy-choice" onClick={() => setGame((current) => ({ ...current, academyClubId: pick(academyClubs, current.seed, current.season + current.history.length).id }))}>
                <span className="free-agent-symbol">?</span>
                <span><strong>Escolha aleatória</strong><small>Deixa o destino decidir uma das quatro bases</small></span>
                <span className="academy-stars">★★★★★</span>
              </button>
              {academyClubs.map((club) => (
                <button key={club.id} className={`club-choice ${game.academyClubId === club.id ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, academyClubId: club.id }))}>
                  <ClubBadge club={club} size="md" />
                  <span><strong>{club.shortName}</strong><small>{club.city} · {countryById(club.countryId).name}</small></span>
                  <span className="academy-stars">{"★".repeat(Math.max(1, club.academy ?? Math.max(1, Math.min(5, Math.round((club.reputation + club.strength / 22) / 2)))))}{"☆".repeat(5 - Math.max(1, club.academy ?? Math.max(1, Math.min(5, Math.round((club.reputation + club.strength / 22) / 2)))))}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="sticky-action"><button className="primary-button" disabled={!game.academyClubId} onClick={() => setGame((current) => ({ ...current, phase: "formation" }))}>Definir sua formação <span>→</span></button></div>
        </section>
      )}

      {game.phase === "formation" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "academy" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 4 DE 5</span><strong>Que jogador você será?</strong></div>
            <div className="step-count">04</div>
          </header>
          <div className="setup-content">
            <div className="section-heading"><div><span>PRIMEIRA DECISÃO</span><h2>Seu foco até virar profissional</h2></div></div>
            <p className="setup-lead">Essa escolha muda sua curva de evolução, a idade da revelação e os eventos que encontrarão você.</p>
            <div className="formation-list">
              {FORMATIONS.map((formation) => (
                <button key={formation.id} className="formation-card" onClick={() => selectFormation(formation.id)}>
                  <span className="formation-icon">{formation.icon}</span>
                  <span className="formation-copy"><small>{formation.subtitle}</small><strong>{formation.title}</strong><p>{formation.description}</p></span>
                  <span className="formation-arrow">→</span>
                </button>
              ))}
            </div>
          </div>
          <div className="setup-note">A base será simulada rapidamente dos 12 até os 16–18 anos.</div>
        </section>
      )}

      {game.phase === "story" && (
        <section className="setup-screen story-setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "formation" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 5 DE 5</span><strong>Qual história trouxe você até aqui?</strong></div>
            <div className="step-count">05</div>
          </header>
          <div className="setup-content">
            <div className="story-intro">
              <span>ORIGEM DO JOGADOR</span>
              <h2>Uma carreira começa antes da estreia.</h2>
              <p>Sua origem altera o começo, muda eventos da carreira e abre capítulos exclusivos durante os anos. Não existe opção perfeita.</p>
            </div>
            <div className="player-story-grid">
              {PLAYER_STORIES.map((story) => (
                <button
                  type="button"
                  key={story.id}
                  className={`player-story-card story-${story.tone}`}
                  onClick={() => selectPlayerStory(story.id)}
                >
                  <span className="player-story-icon">{story.icon}</span>
                  <span className="player-story-copy">
                    <small>{story.tagline}</small>
                    <strong>{story.title}</strong>
                    <p>{story.description}</p>
                    <em>{story.promise}</em>
                  </span>
                  <b>→</b>
                </button>
              ))}
            </div>
          </div>
          <div className="setup-note">A origem não revela seu potencial. Ela muda o tipo de história que a carreira pode contar.</div>
        </section>
      )}

      {game.phase === "youth" && (
        <section className="youth-screen screen-enter">
          <div className="brand-mini"><BrandMark size="sm" /> FUTBOBO</div>
          <div className="youth-club"><ClubBadge club={clubById(game.academyClubId)} size="lg" /><span>Formando em</span><strong>{clubById(game.academyClubId).shortName}</strong></div>
          <div className="age-counter"><small>SUA IDADE</small><strong>{game.youthYears[Math.max(0, youthStep - 1)]?.age ?? 12}</strong><span>ANOS</span></div>
          <div className="youth-progress"><span style={{ width: `${(youthStep / Math.max(1, game.youthYears.length)) * 100}%` }} /></div>
          <div className="youth-feed">
            {game.youthYears.slice(0, youthStep).map((year, index) => (
              <article className="youth-feed-item" key={`${year.age}-${year.title}`} style={{ animationDelay: `${index * 20}ms` }}>
                <span>{year.age}</span><div><strong>{year.title}</strong><p>{year.text}</p></div><em>{year.overall ? `OVR ${year.overall}` : `+${year.delta}`}</em>
              </article>
            ))}
          </div>
          {!youthFinished ? (
            <p className="simulating-label"><span /> Simulando sua formação...</p>
          ) : (
            <div className="youth-continue">
              <span>A simulação terminou. Leia sua trajetória com calma.</span>
              <button className="primary-button" onClick={() => setGame((current) => ({ ...current, phase: "youth-complete" }))}>Continuar <b>→</b></button>
            </div>
          )}
        </section>
      )}

      {game.phase === "youth-complete" && (
        <section className="youth-complete-screen screen-enter">
          <div className="brand-mini"><BrandMark size="sm" /> FUTBOBO</div>
          <div className="youth-finish-icon">✓</div>
          <span className="eyebrow">FIM DAS CATEGORIAS DE BASE</span>
          <h1>Você está pronto para o profissional.</h1>
          <p>Dos 12 aos {game.revealAge}, cada treino empurrou você até esta porta. Respire: seu primeiro contrato está do outro lado.</p>
          <div className="youth-recap">
            <Metric label="Idade" value={`${game.revealAge} anos`} />
            <Metric label="OVR" value={game.overall} tone="gold" />
            <Metric label="Perfil" value={position.style} tone="green" />
          </div>
          <div className="last-youth-note"><span>{game.youthYears.at(-1)?.age}</span><div><strong>{game.youthYears.at(-1)?.title}</strong><p>{game.youthYears.at(-1)?.text}</p></div></div>
          <button className="primary-button" onClick={() => setGame((current) => ({ ...current, phase: "revelation" }))}>Ver propostas profissionais <span>→</span></button>
        </section>
      )}

      {game.phase === "revelation" && (
        <section className="revelation-screen screen-enter">
          <div className="reveal-rays" aria-hidden="true" />
          <div className="reveal-top"><span>JOGADOR REVELADO</span><small>{game.season}</small></div>
          <div className="reveal-card">
            <ClubBadge club={clubById(game.academyClubId)} size="lg" />
            <div className="reveal-overall"><span>OVR</span><strong>{game.overall}</strong></div>
            <div className="reveal-name"><small>{game.archetype}</small><h1>{game.name}</h1><span>#{game.number} · {position.name} · {game.foot}</span><span className="reveal-nation"><NationBadge country={nationCountry} size="sm" />{nationCountry.name}</span></div>
            <div className="reveal-stats"><Metric label="Revelado aos" value={`${game.revealAge} anos`} /><Metric label="Momento" value="Em avaliação" tone="gold" /><Metric label="Estilo" value={position.style} /></div>
          </div>
          <div className="contract-section"><div className="section-heading"><div><span>PRIMEIRO CONTRATO</span><h2>Quem aposta em você?</h2></div></div>
            <div className="offer-list">
              {game.proOffers.map((clubId, index) => {
                const club = clubById(clubId);
                return <button className="offer-card" key={clubId} onClick={() => signProfessional(clubId)}><ClubBadge club={club} /><span><small>{index === 0 ? "PROMOÇÃO DA BASE" : "PROPOSTA PROFISSIONAL"}</small><strong>{club.shortName}</strong><em>{index === 0 ? "Projeto conhecido" : index === 1 ? "Mais minutos" : "Maior vitrine"}</em></span><b>→</b></button>;
              })}
            </div>
          </div>
        </section>
      )}

      {(game.phase === "career" || game.phase === "consequence" || game.phase === "season-result" || game.phase === "transfer" || game.phase === "transfer-denied" || game.phase === "retirement-confirm") && (
        <section className={`career-shell career-phase-${game.phase} career-tab-${activeTab} screen-enter`}>
          <header className="career-header">
            <div className="club-identity"><ClubBadge club={currentClub} size="sm" /><span><small>{headerSeason}</small><strong>{currentClub.shortName}</strong></span></div>
            <div className="career-age"><strong>{headerAge}</strong><span>ANOS</span></div>
            <div className="player-identity"><span><small>OVR</small><strong>{game.overall}</strong></span><div className="mini-avatar">{game.position}</div></div>
          </header>
          <div className="career-bars career-bars-four">
            <Progress label="Moral" value={game.morale} color="#2ca8ff" />
            <Progress label="Físico" value={game.fitness} color={game.fitness < 55 ? "#ff5a4e" : "#63e36b"} />
            <Progress label="Prestígio" value={game.reputation} color="#ffc72c" />
            <Progress label={supporterMood.label} value={game.fanSupport} color={supporterMood.color} />
          </div>
          <div className={`career-status-strip ${game.phase === "retirement-confirm" ? "retirement-open" : ""}`}>
            <span><small>STATUS</small><strong>{ROLE_LABELS[game.squadRole]}</strong></span>
            <span><small>TREINADOR</small><strong>{game.managerTrust}%</strong></span>
            <span><small>CONTRATO</small><strong>{game.contractYears ? `${game.contractYears} ano${game.contractYears > 1 ? "s" : ""}` : "Expirado"}</strong></span>
            {game.phase !== "retirement-confirm" && <button className="retirement-trigger" onClick={requestRetirement}><small>CARREIRA</small><strong>⌛ Aposentar</strong></button>}
          </div>

          {luckSpin && (
            <div className="luck-roulette-overlay" role="status" aria-live="assertive">
              <div className="luck-roulette-card">
                <span className="result-kicker">ESCOLHA DE SORTE</span>
                <div className="roulette-wheel"><i /><b>◆</b></div>
                <h2>A sorte está girando...</h2>
                <p>O resultado da sua aposta será revelado em instantes.</p>
              </div>
            </div>
          )}

          {game.phase === "career" && activeTab === "event" && (
            <div className="event-stage">
              <div className="market-strip"><span><small>MERCADO</small><strong>{game.transferCooldownSeason >= game.season ? "Pedido já feito nesta temporada" : "Quer mudar de camisa?"}</strong></span><button onClick={requestTransfer} disabled={game.transferCooldownSeason >= game.season}>⇄ Pedir transferência</button></div>
              {game.currentObjective && <div className="objective-card"><span>META DO TREINADOR</span><strong>{game.currentObjective.label}</strong><p>{game.currentObjective.description}</p><small>Recompensa: +{game.currentObjective.reward} confiança · Falha: −{game.currentObjective.penalty}</small></div>}
              <div className="event-art" data-icon={currentEvent.icon}><span className="event-tag">{currentEvent.tag}</span><div className="event-watermark">{currentEvent.icon}</div></div>
              <article className="event-card">
                <div className="event-heading"><span>{game.currentEventId === "debut" ? "PRIMEIRO CAPÍTULO" : `TEMPORADA ${game.season}`}</span><h1>{currentEvent.title}</h1><p>{currentEvent.description}</p></div>
                <div className="choice-list" data-choice-count={currentEvent.choices.length}>
                  {currentEvent.choices.map((choice, index) => <button key={choice.label} className="decision-button" onClick={() => chooseEvent(index)}><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><b>→</b></button>)}
                </div>
              </article>
            </div>
          )}

          {game.phase === "consequence" && game.lastConsequence && (
            <div className={`consequence-stage screen-enter ${game.lastConsequence.luckOutcome ? `luck-${game.lastConsequence.luckOutcome}` : ""}`}>
              <span className="result-kicker">CONSEQUÊNCIAS DA ESCOLHA</span>
              <div className="consequence-symbol">↯</div>
              <small>VOCÊ ESCOLHEU</small>
              <h1>{game.lastConsequence.choice}</h1>
              <p>{game.lastConsequence.resultText}</p>
              <div className="consequence-list">
                {game.lastConsequence.changes.map((change) => <span key={change} className={isNegativeConsequence(change) ? "negative" : "positive"}>{change}</span>)}
              </div>
              <div className="consequence-note"><strong>{game.lastConsequence.headline}</strong><span>Agora veja como essa decisão atravessou a temporada.</span></div>
              <div className="mobile-action-dock consequence-action-dock">
                <button className="primary-button" onClick={continueAfterConsequence}>{game.retireAfterSeason ? "Ver resultado da última temporada" : "Ver resultado da temporada"} <span>→</span></button>
                <div className="consequence-autoplay" aria-live="polite">
                  <span>Avançando automaticamente em 5 segundos</span>
                  <div><i /></div>
                </div>
              </div>
            </div>
          )}

          {game.phase === "season-result" && game.lastResult && (
            <div className="result-stage screen-enter">
              <span className="result-kicker">TEMPORADA {game.lastResult.season}</span>
              <div className={`result-symbol ${game.lastResult.title ? "winner" : game.lastResult.breakoutBonus > 0 ? "breakout" : ""}`}>{game.lastResult.title ? "🏆" : game.lastResult.breakoutBonus > 0 ? "⚡" : game.lastResult.development > 0 ? "↗" : game.lastResult.development < 0 ? "↘" : "→"}</div>
              <h1>{game.lastResult.title ? "Temporada de campeão!" : game.lastResult.breakoutBonus > 0 ? "Você explodiu de vez!" : game.lastResult.development > 0 ? "Você subiu de nível" : game.lastResult.development < 0 ? "Uma temporada dura" : "Mais um ano de estrada"}</h1>
              <p>{game.lastResult.title ? "Seu nome agora está gravado em uma taça." : game.lastResult.breakoutBonus > 0 ? "Uma temporada absurda acelerou sua carreira como poucas vezes acontece." : "A temporada terminou e a carreira ganhou mais um capítulo."}</p>
              <div className="season-stat-grid">
                <Metric label="Jogos" value={game.lastResult.appearances} />
                <Metric label={game.position === "GOL" ? "Sem sofrer" : "Gols"} value={game.position === "GOL" ? game.lastResult.cleanSheets : game.lastResult.goals} tone="green" />
                <Metric label={game.position === "GOL" ? "Sofridos" : "Assistências"} value={game.position === "GOL" ? game.lastResult.goalsConceded : game.lastResult.assists} />
                <Metric label="Novo OVR" value={game.overall} tone={game.lastResult.development > 0 ? "gold" : game.lastResult.development < 0 ? "danger" : "default"} />
              </div>
              <div className={`season-rating-card rating-${(game.lastResult.averageRating ?? 6) >= 8 ? "elite" : (game.lastResult.averageRating ?? 6) >= 7 ? "good" : "regular"}`}>
                <div><span>AVALIAÇÃO MÉDIA</span><strong>{(game.lastResult.averageRating ?? seasonAverageRating(game.lastResult.performanceScore, game.seed, game.lastResult.season)).toFixed(1)}</strong></div>
                <p>{(game.lastResult.averageRating ?? 6) >= 8.5 ? "Uma temporada de nível mundial." : (game.lastResult.averageRating ?? 6) >= 7.5 ? "Você foi decisivo e constante." : (game.lastResult.averageRating ?? 6) >= 6.7 ? "Um ano sólido, com espaço para crescer." : "O rendimento ficou abaixo da cobrança."}</p>
                <b>{game.lastResult.manOfTheMatchAwards ?? 0}<small>MELHOR EM CAMPO</small></b>
              </div>
              <section className="season-result-section">
                <header className="season-result-section-heading"><span>DESEMPENHO</span><small>Como seu ano mudou o jogador</small></header>
                <div className={`season-development ${game.lastResult.development > 0 ? "up" : game.lastResult.development < 0 ? "down" : ""}`}>
                  <span>EVOLUÇÃO NA TEMPORADA</span>
                  <strong>{game.lastResult.development > 0 ? "+" : ""}{game.lastResult.development} OVR</strong>
                  <small>{game.lastResult.development > 2 ? "Você está alcançando o nível profissional rapidamente." : game.lastResult.development > 0 ? "Mais um passo na direção da elite." : game.lastResult.development === 0 ? "Seu nível se manteve." : "A carreira também cobra seus anos difíceis."}</small>
                </div>
                {game.lastResult.breakoutBonus > 0 && (
                  <div className="breakout-result">
                    <div><span>⚡ EXPLOSÃO DE TALENTO</span><strong>Temporada fora da curva</strong><p>Você jogou tão bem que rompeu a evolução normal da carreira.</p></div>
                    <b>+{game.lastResult.breakoutBonus}<small>OVR EXTRA</small></b>
                  </div>
                )}
                {game.lastResult.europeanSpotlight > 0 && (
                  <div className="european-spotlight">
                    <span>VITRINE EUROPEIA</span>
                    <strong>+{game.lastResult.europeanSpotlight} prestígio</strong>
                    <p>Seu desempenho ganhou alcance internacional{game.lastResult.europeanDevelopmentBonus > 0 ? ` e acelerou sua evolução em +${game.lastResult.europeanDevelopmentBonus} OVR` : ""}.</p>
                  </div>
                )}
                <div className="season-compact-grid">
                  <div className="discipline-result"><span>DISCIPLINA</span><strong>{game.lastResult.yellowCards} amarelos · {game.lastResult.redCards} vermelhos</strong></div>
                  {positionByKey(game.position).zone !== "gol" && (
                    <div className="defensive-season-result">
                      <span>TRABALHO SEM A BOLA</span>
                      <strong>{game.lastResult.tackles} desarmes</strong>
                    </div>
                  )}
                </div>
              </section>
              <section className="season-result-section">
                <header className="season-result-section-heading"><span>BASTIDORES</span><small>Dinheiro, meta e contrato</small></header>
                <section className="season-finance-card">
                  <header><span>PATRIMÔNIO ATUAL</span><strong>{formatMoney(game.lastResult.balanceAfter ?? game.money)}</strong></header>
                  <div>
                    <span><small>Salário</small><b>+{formatMoney(game.lastResult.salaryIncome ?? 0)}</b></span>
                    <span><small>Patrocínios</small><b>+{formatMoney(game.lastResult.sponsorIncome ?? 0)}</b></span>
                    <span className="expense"><small>Custos</small><b>−{formatMoney(game.lastResult.livingCost ?? 0)}</b></span>
                  </div>
                  <p>Saldo anterior: {formatMoney(game.lastResult.balanceBefore ?? 0)} · +{formatMoney(game.lastResult.spendableIncome ?? 0)} liberados para compras · caixa livre atual: {formatMoney(game.lastResult.spendableAfter ?? game.spendableMoney)}.</p>
                </section>
                {game.lastResult.objectiveResult && <div className={`objective-result ${game.lastResult.objectiveResult.completed ? "completed" : "failed"}`}><span>{game.lastResult.objectiveResult.completed ? "META CUMPRIDA" : "META PERDIDA"}</span><strong>{game.lastResult.objectiveResult.label}</strong><p>{game.lastResult.objectiveResult.text}</p></div>}
                {game.lastResult.promotion && <div className="objective-result completed"><span>ACESSO CONQUISTADO</span><strong>O clube subiu de divisão</strong><p>{game.lastResult.promotion}</p></div>}
                {game.forcedClubExit && <div className="contract-expired"><span>VENDA OBRIGATÓRIA</span><strong>O clube colocou você no mercado</strong><p>Seu overall e seu rendimento ficaram muito abaixo da exigência do elenco. Sem status de ídolo, você terá de escolher outro destino.</p></div>}
                {game.contractYears === 0 && (
                  <div className="contract-expired">
                    <span>CONTRATO ENCERRADO</span>
                    <strong>{game.renewalDenied ? "O clube optou por não renovar" : "Seu futuro está aberto"}</strong>
                    <p>{game.renewalDenied ? "Depois de uma temporada difícil, a diretoria decidiu não seguir com você. Na próxima tela você precisa escolher um novo clube." : "Na próxima tela você poderá renovar ou escolher um novo clube."}</p>
                  </div>
                )}
              </section>
              {(seasonTitleCount > 0 || seasonBotaoResults.length > 0) && (
                <section className="season-title-parade">
                  <header>
                    <span>TAÇAS DA TEMPORADA</span>
                    <strong>{seasonTitleCount > 0 ? `${seasonTitleCount} volta${seasonTitleCount > 1 ? "s" : ""} olímpica${seasonTitleCount > 1 ? "s" : ""}` : "Nenhuma taça levantada"}</strong>
                  </header>
                  {seasonTitleCount > 0 && (
                    <div className="season-title-list">
                      {seasonClubTitles.map((competition) => (
                        <article key={`title-${competition.id}`}>
                          <CompetitionBadge competition={competition} leagueId={game.lastResult?.leagueId || game.currentLeagueId || currentClub.leagueId} />
                          <div><small>CAMPEÃO</small><strong>{competition.name}</strong></div>
                          <b>🏆</b>
                        </article>
                      ))}
                      {seasonNationalTitles.map((record) => (
                        <article key={`national-title-${record.season}-${record.name}`} className="national-season-title">
                          <NationBadge country={nationCountry} size="sm" />
                          <div><small>CAMPEÃO PELA SELEÇÃO</small><strong>{record.name}</strong></div>
                          <b>🏆</b>
                        </article>
                      ))}
                    </div>
                  )}
                  {seasonBotaoResults.length > 0 && (
                    <div className="played-finals-summary">
                      <header>
                        <span>DECIDIDO NO FUTEBOL DE BOTÃO</span>
                        <small>Finais e mata-matas da temporada</small>
                      </header>
                      <div>
                        <b><strong>{seasonBotaoResults.length}</strong><small>DISPUTADAS</small></b>
                        <b className="won"><strong>{seasonBotaoWins}</strong><small>GANHAS</small></b>
                        <b className="lost"><strong>{seasonBotaoLosses}</strong><small>PERDIDAS</small></b>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {game.lastResult.competitions.some((competition) => !competition.champion) && (
                <section className="season-result-section season-campaigns">
                  <header className="season-result-section-heading"><span>OUTRAS CAMPANHAS</span><small>Onde a caminhada terminou</small></header>
                  <div className="competition-grid">
                    {game.lastResult.competitions.filter((competition) => !competition.champion).map((competition) => <article key={competition.id} className="competition-card"><CompetitionBadge competition={competition} leagueId={game.lastResult?.leagueId || game.currentLeagueId || currentClub.leagueId} /><div><strong>{competition.name}</strong><small>{competition.stage}</small></div></article>)}
                  </div>
                </section>
              )}
              {game.lastResult.medicalRecord && (
                <section className={`season-medical-card severity-${game.lastResult.medicalRecord.severity}`}>
                  <header><span>DEPARTAMENTO MÉDICO</span><b>{game.lastResult.medicalRecord.severity.toLocaleUpperCase("pt-BR")}</b></header>
                  <strong>{game.lastResult.medicalRecord.name}</strong>
                  <div><span><b>{game.lastResult.medicalRecord.recoveryMonths}</b><small>MESES</small></span><span><b>{game.lastResult.medicalRecord.matchesMissed}</b><small>JOGOS FORA</small></span><span><b>{game.lastResult.medicalRecord.recurring ? "SIM" : "NÃO"}</b><small>RECORRENTE</small></span></div>
                </section>
              )}
              {game.lastResult.twist && <div className={`season-twist ${game.lastResult.twist.includes("improvável") ? "positive" : "negative"}`}><span>O IMPREVISTO DA TEMPORADA</span><p>{game.lastResult.twist}</p></div>}
              {game.lastResult.nationalNote && <div className="season-national-note"><NationBadge country={nationCountry} size="sm" /><p>{game.lastResult.nationalNote}</p></div>}
              {seasonWorldCupRecord?.tournamentStats && (
                <section className={`world-cup-stat-report ${seasonWorldCupRecord.champion ? "champion" : ""}`}>
                  <header>
                    <div><span>RELATÓRIO DA COPA DO MUNDO</span><strong>{seasonWorldCupRecord.stage}</strong></div>
                    <NationBadge country={nationCountry} size="sm" />
                  </header>
                  <div className="world-cup-stat-totals">
                    <Metric label="Jogos" value={seasonWorldCupRecord.tournamentStats.appearances} />
                    <Metric label="Gols" value={seasonWorldCupRecord.tournamentStats.goals} tone="gold" />
                    <Metric label="Assistências" value={seasonWorldCupRecord.tournamentStats.assists} tone="green" />
                    <Metric label="G+A" value={seasonWorldCupRecord.tournamentStats.goals + seasonWorldCupRecord.tournamentStats.assists} />
                  </div>
                  <div className="world-cup-stat-split">
                    <span><small>FASE DE GRUPOS · SIMULADA</small><strong>{seasonWorldCupRecord.tournamentStats.groupAppearances}J · {seasonWorldCupRecord.tournamentStats.groupGoals}G · {seasonWorldCupRecord.tournamentStats.groupAssists}A</strong></span>
                    <span><small>MATA-MATA</small><strong>{seasonWorldCupRecord.tournamentStats.knockoutAppearances}J · {seasonWorldCupRecord.tournamentStats.knockoutGoals}G · {seasonWorldCupRecord.tournamentStats.knockoutAssists}A</strong></span>
                  </div>
                  {isEuropeanClub(currentClub) && seasonWorldCupRecord.tournamentStats.goals >= 8 && (
                    <div className="world-cup-ballon-surge"><b>◉</b><span><strong>A eleição mudou de figura</strong><small>Oito ou mais gols na Copa, jogando na Europa, colocaram seu nome no centro da disputa pela Bola de Ouro.</small></span></div>
                  )}
                </section>
              )}
              {(game.lastResult.awards.length > 0 || game.lastResult.awardNominations.length > 0) && (
                <section className={`season-awards-showcase ${game.lastResult.awardNominations.some((nomination) => nomination.award === "Bola de Ouro") ? "has-ballon-dor" : ""}`}>
                  <div className="season-awards-heading">
                    <span>NOITE DE PREMIAÇÃO</span>
                    <strong>{game.lastResult.awards.length > 1 ? `${game.lastResult.awards.length} prêmios na mesma temporada` : seasonCeremonyNomination?.won ? "Seu nome foi chamado" : "Você está entre os finalistas"}</strong>
                    <p>O resultado só aparece quando o envelope for aberto.</p>
                  </div>
                  <div className="season-awards-list">
                    {seasonCeremonyNomination && (
                      <AwardCeremony
                        key={`${seasonCeremonyNomination.award}-${game.lastResult.season}`}
                        award={seasonCeremonyNomination.award}
                        playerName={game.name}
                        seed={game.seed}
                        season={game.lastResult.season}
                        won={seasonCeremonyNomination.won}
                        winner={seasonCeremonyNomination.winner}
                        finalists={seasonCeremonyNomination.finalists}
                      />
                    )}
                    {[...game.lastResult.awards]
                      .sort((a, b) => awardTierWeight(b) - awardTierWeight(a))
                      .filter((award) => award !== seasonCeremonyNomination?.award)
                      .map((award) => <AwardReveal key={award} award={award} />)}
                  </div>
                </section>
              )}
              <div className="result-details"><span>Valor de mercado <strong>{formatMoney(game.lastResult.marketValue)}</strong></span>{game.lastResult.calledUp && <span className="callup-badge">★ Convocado pela Seleção</span>}</div>
              <div className="mobile-action-dock">
                <button className="primary-button" onClick={continueAfterResult}>{game.retireAfterSeason ? "Concluir carreira" : game.transferOffers.length ? "Abrir janela de transferências" : "Próxima temporada"} <span>→</span></button>
              </div>
            </div>
          )}

          {game.phase === "transfer" && (
            <div className="transfer-stage screen-enter">
              <span className="eyebrow">{game.forcedFreeAgentUntilSeason > game.season ? "BANIMENTO DO FUTEBOL" : game.pendingTransferMode === "loan" ? "MERCADO DE EMPRÉSTIMOS" : game.isFreeAgent ? "AGENTE LIVRE" : game.forcedAlternativeTransfer ? "RECOMEÇO FORÇADO" : "JANELA DE TRANSFERÊNCIAS"}</span>
              <h1>{game.forcedFreeAgentUntilSeason > game.season ? "Nenhum clube pode contratar você" : game.pendingTransferMode === "loan" ? "Um ano para voltar jogando mais" : game.forcedAlternativeTransfer ? "As grandes ligas fecharam as portas" : game.forcedClubExit ? "O clube decidiu vender você" : game.transferStatus?.success ? game.transferStatus.headline : game.renewalDenied ? "Sem renovação — hora de escolher" : "Seu próximo passo"}</h1>
              <p>{game.forcedFreeAgentUntilSeason > game.season ? `A punição pela tentativa de corrupção vai até ${game.forcedFreeAgentUntilSeason}. Você precisa atravessar os anos restantes sem disputar partidas.` : game.pendingTransferMode === "loan" ? `O ${currentClub.shortName} quer emprestar você por uma temporada. Escolha onde buscar minutos antes de retornar.` : game.forcedAlternativeTransfer ? "Depois da suspensão, seu empresário encontrou projetos dispostos a bancar sua reconstrução. Você precisa escolher um deles." : game.forcedClubExit ? `Seu nível já não acompanha a exigência do ${currentClub.shortName}. Como você ainda não virou ídolo, a diretoria tornou a saída obrigatória.` : game.transferStatus?.text ?? (game.renewalDenied ? `O ${currentClub.shortName} não renovou seu contrato. ${game.transferOffers.length} clube${game.transferOffers.length > 1 ? "s apareceram" : " apareceu"} com propostas.` : `${game.transferOffers.length} clubes chegaram com projetos diferentes. Você também pode ficar e construir seu nome aqui.`)}</p>
              {game.pendingTransferMode === "loan" && <div className="transfer-lock-card loan"><span>EMPRÉSTIMO DE 1 TEMPORADA</span><strong>O vínculo com o {currentClub.shortName} continua</strong><p>Seu salário e contrato pertencem ao clube de origem. Ao fim da próxima temporada, o retorno será automático.</p></div>}
              {game.renewalDenied && <div className="transfer-lock-card"><span>RENOVAÇÃO RECUSADA</span><strong>O {currentClub.shortName} decidiu não renovar seu contrato</strong><p>A diretoria avaliou a temporada e optou por não seguir com você. Escolha seu próximo destino.</p></div>}
              {game.forcedClubExit && <div className="transfer-lock-card"><span>VENDA OBRIGATÓRIA</span><strong>Seu nível ficou abaixo do projeto esportivo</strong><p>Ídolos históricos recebem proteção. Sem esse status, permanecer no clube não está disponível.</p></div>}
              {game.forcedAlternativeTransfer && <div className="transfer-lock-card exile"><span>PUNIÇÃO DISCIPLINAR</span><strong>Exílio esportivo obrigatório</strong><p>Ficar no clube atual ou assinar com uma potência não está disponível. Uma liga alternativa será seu único caminho de volta.</p></div>}
              {game.transferRequested && !game.forcedClubExit && !game.forcedAlternativeTransfer && game.forcedFreeAgentUntilSeason <= game.season && <div className="transfer-lock-card"><span>SAÍDA SEM VOLTA</span><strong>Escolha seu próximo clube</strong><p>Depois que a diretoria aceita seu pedido, permanecer no time atual deixa de ser uma opção.</p></div>}
              {!game.forcedAlternativeTransfer && game.forcedFreeAgentUntilSeason <= game.season && transferWindowProfile.isEuropeanWindow && <div className="european-market-card"><span>{transferWindowProfile.foreignMarketLabel}</span><strong>{transferWindowProfile.europeanOffers} clube{transferWindowProfile.europeanOffers > 1 ? `s ${transferWindowProfile.foreignMarketAdjective}s querem` : ` ${transferWindowProfile.foreignMarketAdjective} quer`} você</strong><p>{transferWindowProfile.homeOffers > 0 ? `Uma proposta rara de volta ao país da sua base, ${transferWindowProfile.homeCountry.name}, também apareceu.` : `Seu empresário prioriza projetos ${transferWindowProfile.foreignMarketAdjective}s de nível compatível.`}</p></div>}
              {!game.forcedAlternativeTransfer && transferWindowProfile.expandedOfferCount > 0 && <div className="market-expansion-card"><span>DESEMPENHO ABRIU PORTAS</span><strong>{marketProfile.label} · nota {marketProfile.performanceScore}</strong><p>{transferWindowProfile.expandedOfferCount} clube{transferWindowProfile.expandedOfferCount > 1 ? "s extras apareceram" : " extra apareceu"} em um nível compatível com sua fase.</p></div>}
              <div className="offer-list transfer-offers">
                {game.transferOffers.map((clubId, index) => {
                  const club = clubById(clubId);
                  const league = leagueById(club.leagueId);
                  const changesCountry = club.countryId !== currentClub.countryId;
                  const offerContract = createContract(game.overall, game.age, club, game.seed + game.season + index);
                  const offerRole = calculateSquadRole(game.overall, club, league.prestige, 50, game.age);
                  const rivalry = findRivalry(currentClub.id, club.id);
                  const rareHomeReturn =
                    club.countryId === game.academyCountryId &&
                    club.countryId !== currentClub.countryId &&
                    transferWindowProfile.europeanOffers > 0;
                  const europeanEntryOffer = !isEuropeanClub(currentClub) && isEuropeanClub(club);
                  return (
                    <button className="offer-card" key={clubId} onClick={() => chooseTransfer(clubId)}>
                      <ClubBadge club={club} />
                      <span>
                        <small>{game.pendingTransferMode === "loan" ? "DESTINO DE EMPRÉSTIMO" : game.isFreeAgent ? "CONTRATAÇÃO SEM CUSTO" : game.forcedAlternativeTransfer ? "PROJETO DE RECONSTRUÇÃO" : rareHomeReturn ? "RETORNO IMPROVÁVEL" : europeanEntryOffer ? "PORTA DE ENTRADA NA EUROPA" : index >= 5 ? "DESTAQUE ABRIU ESTA PORTA" : index === 0 ? "MAIS PRESTÍGIO" : index === 1 ? "PROJETO DE TITULAR" : "NOVOS ARES"}</small>
                        <strong>{club.shortName}</strong>
                        <em>{club.city} · {league.name}</em>
                        <em className="offer-contract">{game.pendingTransferMode === "loan" ? `${ROLE_LABELS[offerRole]} · 1 temporada · contrato de origem preservado` : `${ROLE_LABELS[offerRole]} · ${offerContract.years} anos · ${formatMoney(offerContract.annualSalary)}/ano`}</em>
                        <em className="offer-market-value">Valor estimado na liga: {formatMoney(marketValue(game.overall, game.age, club, game.reputation, game.lastResult ?? undefined))}</em>
                        {rivalry && <em className="offer-rivalry">⚔ Transferência explosiva: {rivalry.nickname}</em>}
                        {rareHomeReturn ? <em className="offer-homecoming-tag">⌂ Volta rara ao país da sua base: {transferWindowProfile.homeCountry.name}</em> : europeanEntryOffer ? <em className="offer-european-door">★ Uma chance europeia compatível com o seu momento</em> : changesCountry && <em className="offer-abroad-tag">◇ Novo país — uma fase de adaptação começa</em>}
                      </span>
                      <b>→</b>
                    </button>
                  );
                })}
                {game.pendingTransferMode !== "loan" && <>
                  {!game.transferRequested && !game.renewalDenied && !game.forcedClubExit && !game.forcedAlternativeTransfer && <button className="offer-card stay-card" onClick={() => chooseTransfer(null)}><ClubBadge club={currentClub} /><span><small>{game.contractYears === 0 ? "PROPOSTA DE RENOVAÇÃO" : "CONTINUAR O PROJETO"}</small><strong>{game.contractYears === 0 ? `Renovar com o ${currentClub.shortName}` : `Ficar no ${currentClub.shortName}`}</strong><em>{game.contractYears === 0 ? "Novo vínculo e salário recalculado" : `Manter o contrato atual de ${game.contractYears} ano(s)`}</em></span><b>✓</b></button>}
                  {!game.transferRequested && !game.renewalDenied && !game.forcedClubExit && !game.forcedAlternativeTransfer && game.contractYears === 0 && <button className="offer-card free-agent-card" onClick={becomeFreeAgent}><span className="free-agent-symbol">◇</span><span><small>RECUSAR A RENOVAÇÃO</small><strong>Virar agente livre</strong><em>Mais liberdade de escolha, sem possibilidade de voltar ao clube atual</em></span><b>→</b></button>}
                </>}
              </div>
              {game.isFreeAgent && (
                <button className="wait-free-agent-button" disabled={game.age >= 42 && game.forcedFreeAgentUntilSeason <= game.season} onClick={waitAsFreeAgent}>
                  <span>SEM PROJETO INTERESSANTE?</span>
                  <strong>{game.forcedFreeAgentUntilSeason > game.season ? "Cumprir mais um ano do banimento" : "Simular um ano como agente livre"}</strong>
                  <small>{game.forcedFreeAgentUntilSeason > game.season ? `Nenhuma estatística será registrada. Punição prevista até ${game.forcedFreeAgentUntilSeason}.` : "Você não registra jogos nem recebe salário; perde ritmo, paga €180 mil em custos e recebe propostas novas."}</small>
                </button>
              )}
            </div>
          )}

          {game.phase === "transfer-denied" && game.transferStatus && (
            <div className="transfer-denied-stage screen-enter">
              <span className="result-kicker">PEDIDO DE TRANSFERÊNCIA</span>
              <div className="denied-symbol">×</div>
              <h1>{game.transferStatus.headline}</h1>
              <p>{game.transferStatus.text}</p>
              <div className="fan-backlash"><span>REAÇÃO DA TORCIDA</span><strong>{supporterMood.label}</strong><div><i style={{ width: `${game.fanSupport}%` }} /></div><small>Relação destruída · −12 moral · −7 prestígio</small></div>
              <div className="mobile-action-dock">
                <button className="primary-button" onClick={continueAfterDeniedTransfer}>Encarar a temporada <span>→</span></button>
              </div>
            </div>
          )}

          {game.phase === "retirement-confirm" && (
            <div className="retirement-stage screen-enter">
              <span className="result-kicker">DECISÃO DE CARREIRA</span>
              <div className="retirement-symbol">⌛</div>
              <h1>Pendurar as chuteiras agora?</h1>
              <p>Você pode encerrar a carreira em qualquer idade. O legado será fechado exatamente como está — esta decisão é definitiva.</p>
              <div className="retirement-recap">
                <Metric label="Idade" value={`${game.age} anos`} />
                <Metric label="Temporadas" value={game.history.length} />
                <Metric label="OVR atual" value={game.overall} tone="gold" />
                <Metric label="Legado" value={game.legacyPoints} tone="green" />
              </div>
              <div className="retirement-actions mobile-action-dock">
                <button className="danger-button" onClick={confirmRetirement}>Confirmar aposentadoria <span>→</span></button>
                <button className="secondary-button" onClick={cancelRetirement}>Ainda não</button>
              </div>
            </div>
          )}

          {activeTab === "history" && game.phase === "career" && (
            <div className="panel-screen screen-enter">
              <div className="section-heading"><div><span>LINHA DO TEMPO</span><h2>Sua carreira até aqui</h2></div></div>
              <div className="timeline-list">
                {game.history.length === 0 && <div className="empty-panel">Sua estreia será o primeiro capítulo desta história.</div>}
                {[...game.history].reverse().map((record) => { const club = clubById(record.clubId); const titles = record.competitions.filter((competition) => competition.champion); return <article className="timeline-row" key={`${record.season}-${record.clubId}`}><span className="timeline-year">{record.season}</span><ClubBadge club={club} size="sm" /><div><strong>{club.shortName}</strong><small>{record.position} · {record.appearances}J · {record.position === "GOL" ? `${record.cleanSheets}SG` : `${record.goals}G · ${record.assists}A`} · nota {(record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season)).toFixed(1)}</small>{record.medicalRecord && <i className="timeline-medical">✚ {record.medicalRecord.matchesMissed} jogos fora</i>}{titles.length > 0 && <em className="timeline-title-badges">{titles.map((title) => <CompetitionBadge key={title.id} competition={title} leagueId={record.leagueId || club.leagueId} />)}</em>}</div><span className="timeline-ovr">{record.overall}</span>{record.title && <span className="timeline-trophy">🏆</span>}</article>; })}
              </div>
            </div>
          )}

          {activeTab === "profile" && game.phase === "career" && (
            <div className="panel-screen screen-enter">
              <div className="profile-hero"><div className="academy-avatar"><span>{game.number}</span><small>{game.position}</small></div><div><span>{game.archetype}</span><h2>{game.name}</h2><p>{position.style} · {game.foot}</p></div></div>
              <section className={`player-story-profile story-${playerStoryById(game.playerStoryId).tone}`}>
                <header><b>{playerStoryById(game.playerStoryId).icon}</b><div><span>HISTÓRIA DO JOGADOR</span><strong>{playerStoryById(game.playerStoryId).title}</strong></div><em>{game.storyLog.length} capítulo{game.storyLog.length === 1 ? "" : "s"}</em></header>
                <p>{playerStoryById(game.playerStoryId).description}</p>
                {game.storyLog.length > 0 && (
                  <div className="player-story-log">
                    {[...game.storyLog].reverse().slice(0, 4).map((entry) => (
                      <article key={`${entry.season}-${entry.chapter}`}>
                        <span>{entry.season}</span><div><strong>{entry.title}</strong><small>{entry.choice}</small><p>{entry.result}</p></div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <div className="position-change-card">
                <div><span>FUNÇÃO EM CAMPO</span><strong>{position.name}</strong><p>Você pode pedir ao treinador uma mudança. Quanto mais velho e mais distante da sua função atual, maior o risco de recusa.</p></div>
                <button
                  className="secondary-button"
                  disabled={game.positionChangeCooldownSeason >= game.season}
                  onClick={() => {
                    setPositionChangeOpen((open) => !open);
                    setPositionChangeFeedback(null);
                  }}
                >
                  {game.positionChangeCooldownSeason >= game.season ? "Tentativa usada nesta temporada" : "Tentar mudar de posição"}
                </button>
                {positionChangeOpen && (
                  <div className="position-change-picker">
                    {POSITIONS.filter((item) => item.key !== game.position).map((item) => (
                      <button
                        key={item.key}
                        className={positionChangeTarget === item.key ? "selected" : ""}
                        onClick={() => setPositionChangeTarget(item.key)}
                      >
                        <span style={{ color: item.color }}>{item.icon}</span><strong>{item.key}</strong><small>{item.name}</small>
                      </button>
                    ))}
                    <button className="primary-button position-change-confirm" disabled={!positionChangeTarget} onClick={attemptPositionChange}>Pedir a mudança <span>→</span></button>
                  </div>
                )}
                {positionChangeFeedback && (
                  <div className={`position-change-feedback ${positionChangeFeedback.success ? "success" : "failure"}`}>
                    <strong>{positionChangeFeedback.headline}</strong>
                    <p>{positionChangeFeedback.text}</p>
                  </div>
                )}
              </div>
              <div className="profile-metrics"><Metric label="OVR" value={game.overall} tone="gold" /><Metric label="Momento" value={careerTrend(game.history)} /><Metric label="Valor" value={formatMoney(marketValue(game.overall, game.age, currentClub, game.reputation, game.history.at(-1)))} /></div>
              <section className="medical-department">
                <header><div><span>DEPARTAMENTO MÉDICO</span><strong>Prontuário da carreira</strong></div><b className={game.medicalHistory.length ? "has-history" : ""}>✚</b></header>
                <div className="medical-overview">
                  <Metric label="Lesões sérias" value={game.medicalHistory.length} tone={game.medicalHistory.length ? "danger" : "green"} />
                  <Metric label="Jogos perdidos" value={game.matchesMissedInjuries} />
                  <Metric label="Sequência saudável" value={`${game.injuryFreeSeasons} ano${game.injuryFreeSeasons === 1 ? "" : "s"}`} tone="green" />
                </div>
                {game.medicalHistory.length ? (
                  <div className="medical-history-list">
                    {game.medicalHistory.slice(0, 5).map((record) => (
                      <article key={record.id}><b>{record.season}</b><div><strong>{record.name}</strong><small>{record.recoveryMonths} meses · {record.matchesMissed} jogos fora{record.recurring ? " · recorrência" : ""}</small></div><span>{record.severity}</span></article>
                    ))}
                  </div>
                ) : <p>Nenhuma lesão séria registrada. O histórico começa a ser construído temporada por temporada.</p>}
              </section>
              <section className="trait-card">
                <div><span>CARACTERÍSTICAS ESPECIAIS</span><strong>O que torna seu jogo diferente</strong></div>
                <section>
                  {game.traits.map((traitId) => {
                    const trait = SPECIAL_TRAITS[traitId];
                    return <article className={`trait-${trait.tone}`} key={traitId}><b>{trait.icon}</b><div><strong>{trait.name}</strong><small>{trait.description}</small></div></article>;
                  })}
                </section>
                {game.traits.length === 0 && <p>Este save começou antes do sistema de características. Uma nova carreira já nasce com identidade própria.</p>}
              </section>
              <div className="market-context"><span>{currentClub.countryId === "brasil" ? "MERCADO BRASILEIRO" : "MERCADO INTERNACIONAL"}</span><p>{currentClub.countryId === "brasil" ? "O mesmo jogador costuma valer menos no Brasil. Uma ida à Europa pode multiplicar sua cotação — e também a cobrança." : `${leagueById(game.currentLeagueId || currentClub.leagueId).name} amplia sua vitrine e o valor do seu passe.`}</p></div>
              <section className="career-economy">
                <header>
                  <div><span>VIDA FINANCEIRA</span><strong>Patrimônio: {formatMoney(game.money)}</strong></div>
                  <small>Caixa livre: {formatMoney(game.spendableMoney)}</small>
                </header>
                <p>Salário e patrocínios formam seu patrimônio, mas só 18% da renda líquida vira caixa livre para decisões pessoais. O restante fica preso em impostos, contratos, reservas e gestão da carreira.</p>
                <div className="career-shop">
                  {[
                    { id: "recovery" as const, icon: "✚", name: "Centro de recuperação", description: "+12 físico e +7 moral", price: 350_000 },
                    { id: "media" as const, icon: "@", name: "Equipe de imagem", description: "Imprensa, equilíbrio e seguidores", price: 600_000 },
                    { id: "coach" as const, icon: "↗", name: "Treinador particular", description: "Pequeno ganho nos atributos", price: 1_200_000 },
                    { id: "potential" as const, icon: "?", name: "Recalibração experimental", description: "Uso cego: em tetos abaixo de 80, abre +1 de margem. Em tetos já altos, a interferência pode reduzir 1. Seu potencial nunca é revelado.", price: 2_500_000 },
                    { id: "corruption" as const, icon: "⚖", name: "Comprar os árbitros", description: "50/50: garante o título nacional deste ano ou causa banimento de 3 a 5 anos sem clube.", price: 2_000_000 },
                  ].map((item) => {
                    const purchased = game.economyPurchases.includes(`${game.season}:${item.id}`);
                    return (
                      <article className={item.id === "potential" || item.id === "corruption" ? "risky" : ""} key={item.id}>
                        <b>{item.icon}</b>
                        <div><strong>{item.name}</strong><small>{item.description}</small></div>
                        <button disabled={purchased || game.spendableMoney < item.price} onClick={() => buyCareerItem(item.id)}>
                          {purchased ? "Usado neste ano" : formatMoney(item.price)}
                        </button>
                      </article>
                    );
                  })}
                </div>
                {economyFeedback && <div className="economy-feedback">{economyFeedback}</div>}
              </section>
              <section className="football-attributes-card">
                <div className="football-attributes-heading">
                  <div><span>ATRIBUTOS DE CAMPO</span><strong>Seu estilo em números</strong></div>
                  <b>{Math.round(attributeAverage(game.attributes, POSITION_PRIMARY_ATTRIBUTES[game.position]))}<small>MÉDIA-CHAVE</small></b>
                </div>
                <p>Os atributos mudam a simulação: finalização gera gols, passe e visão criam assistências, fôlego aumenta seus jogos e qualidades defensivas ou de goleiro decidem o rendimento.</p>
                <div className="football-attribute-groups">
                  {ATTRIBUTE_GROUPS.map((group) => (
                    <article key={group.label}>
                      <span>{group.label}</span>
                      <div>
                        {group.keys.map((key) => (
                          <div className={POSITION_PRIMARY_ATTRIBUTES[game.position].includes(key) ? "is-key" : ""} key={key}>
                            <label>{ATTRIBUTE_LABELS[key]}</label>
                            <i><em style={{ width: `${game.attributes[key]}%`, background: attributeTone(game.attributes[key]) }} /></i>
                            <strong style={{ color: attributeTone(game.attributes[key]) }}>{game.attributes[key]}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                <small>◆ atributo-chave para {position.name}</small>
              </section>
              <div className="contract-card"><span>CONTRATO E ELENCO</span><div><strong>{ROLE_LABELS[game.squadRole]}{game.clubCaptain ? " · Capitão" : ""}</strong><small>{game.isFreeAgent ? "Agente livre" : game.loanParentClubId ? `Emprestado pelo ${clubById(game.loanParentClubId).shortName}` : game.contractYears ? `${game.contractYears} ano(s) restantes` : "Contrato encerrado"} · {formatMoney(game.annualSalary)}/ano</small></div><Progress label="Confiança do treinador" value={game.managerTrust} color="#a675ff" /></div>
              <div className="supporter-card"><span>RELAÇÃO COM A TORCIDA</span><strong style={{ color: supporterMood.color }}>{supporterMood.label}</strong><p>{game.fanSupport < 38 ? "Cada toque pode virar vaia. Títulos e entrega reconquistam a arquibancada." : game.fanSupport >= 82 ? "Seu nome já faz parte da identidade do clube." : "A arquibancada ainda está decidindo que história contará sobre você."}</p></div>
              <div className="attribute-card">
                <Progress label="Moral" value={game.morale} color="#2ca8ff" />
                <Progress label="Condição" value={game.fitness} color="#63e36b" />
                <Progress label="Prestígio" value={game.reputation} color="#ffc72c" />
                <Progress label="Liderança" value={game.leadership} color="#a675ff" />
                <Progress label="Seleção" value={game.nationalLevel} color="#f5f7f2" />
                <Progress label="Torcida" value={game.fanSupport} color={supporterMood.color} />
                <Progress label="Disciplina" value={game.discipline} color={game.discipline < 45 ? "#ff5a4e" : "#63e36b"} />
                {isOutsideAcademyHome(game, currentClub) && <Progress label="Adaptação" value={game.adaptation} color="#2ca8ff" />}
              </div>
              <div className="career-total-card"><span>TOTAIS DA CARREIRA</span><div><Metric label="Jogos" value={game.stats.appearances} /><Metric label={game.position === "GOL" ? "Sem sofrer" : "Gols"} value={game.position === "GOL" ? game.stats.cleanSheets : game.stats.goals} /><Metric label={game.position === "GOL" ? "Sofridos" : "Assistências"} value={game.position === "GOL" ? game.stats.goalsConceded : game.stats.assists} /><Metric label={game.position === "GOL" ? "Defesas" : "Desarmes"} value={game.position === "GOL" ? game.stats.cleanSheets * 3 : game.stats.tackles} /><Metric label="Taças" value={game.trophies + game.nationalTrophies} tone="gold" /></div></div>
              <TrophyGallery state={game} />
              <div className="national-team-card">
                <span>CENTRAL DA SELEÇÃO</span>
                <div className="national-team-head">
                  <NationBadge country={nationCountry} size="md" />
                  <div><strong>{nationCountry.name}</strong><small>{nationalTierLabel[game.nationalCategory]}{game.nationalCaptain ? " · Capitão" : ""}</small></div>
                </div>
                <div className="national-team-metrics">
                  <Metric label="Jogos" value={game.nationalCaps} />
                  <Metric label="Gols" value={game.nationalGoals} />
                  <Metric label="Assistências" value={game.nationalAssists} />
                  <Metric label="Taças" value={game.nationalTrophies} tone="gold" />
                </div>
                {game.nationalHistory.length === 0 ? (
                  <p>Ainda sem convocações. Bons números no clube abrem a porta da Seleção.</p>
                ) : (
                  <div className="national-history-list">
                    {[...game.nationalHistory].reverse().map((entry) => (
                      <article key={`${entry.season}-${entry.name}`}><span>{entry.season}</span><div><strong>{entry.name}</strong><small>{entry.stage}</small></div>{entry.champion && <b>🏆</b>}</article>
                    ))}
                  </div>
                )}
              </div>
              <div className="career-fortune"><span>TRAJETÓRIA</span><div><Metric label="Baques" value={game.setbacks} tone="danger" /><Metric label="Viradas de sorte" value={game.luckyBreaks} tone="green" /></div></div>
              <div className="discipline-card"><span>HISTÓRICO DISCIPLINAR</span><div><Metric label="Amarelos" value={game.stats.yellowCards} /><Metric label="Vermelhos" value={game.stats.redCards} tone="danger" /><Metric label="Suspensão" value={`${game.suspensionMatches}J`} tone={game.suspensionMatches ? "danger" : "default"} /><Metric label="Metas" value={`${game.objectivesCompleted}/${game.objectivesCompleted + game.objectivesFailed}`} tone="green" /></div></div>
              <div className="award-cabinet">
                <div className="award-cabinet-title">
                  <div><span>PRÊMIOS INDIVIDUAIS</span><strong>Sua galeria pessoal</strong></div>
                  <b>{totalIndividualAwards}<small>{totalAwardNominations} INDICAÇÕES</small></b>
                </div>
                {awardEntries.length === 0 ? (
                  <p>O primeiro prêmio ainda está por vir. Grandes temporadas, números decisivos e títulos colocam seu nome entre os candidatos.</p>
                ) : (
                  <>
                    <div className={`award-cabinet-feature award-${awardPresentation(awardEntries[0][0]).tier}`}>
                      <span>{awardPresentation(awardEntries[0][0]).icon}</span>
                      <div><small>MAIOR HONRARIA</small><strong>{awardEntries[0][0]}</strong><p>{awardPresentation(awardEntries[0][0]).description}</p></div>
                      <b>{awardEntries[0][1]}×</b>
                    </div>
                    <div className="award-cabinet-list">
                      {awardEntries.map(([award, count]) => {
                        const presentation = awardPresentation(award);
                        const seasonsWon = game.history.filter((record) => record.awards.includes(award)).map((record) => record.season);
                        return (
                          <article className={`award-${presentation.tier}`} key={award}>
                            <span>{presentation.icon}</span>
                            <div><strong>{award}</strong><small>{presentation.kicker}{seasonsWon.length ? ` · ${seasonsWon.slice(-3).join(", ")}` : ""}</small></div>
                            <b>{count}×</b>
                          </article>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "life" && game.phase === "career" && (
            <div className="panel-screen life-screen screen-enter">
              <header className="life-hero">
                <div className="life-network-icon">@</div>
                <div><span>VIDA FORA DO CAMPO</span><strong>{formatFollowers(game.followers)}</strong><small>SEGUIDORES</small></div>
                <aside><small>IMAGEM PÚBLICA</small><strong style={{ color: publicImage.color }}>{publicImage.label}</strong></aside>
                <p>{publicImage.description}</p>
              </header>

              <section className="public-life-dashboard">
                <Progress label="Humor das redes" value={game.socialSentiment} color={game.socialSentiment < 40 ? "#ff5a4e" : "#63e36b"} />
                <Progress label="Relação com a imprensa" value={game.mediaRelation} color="#2ca8ff" />
                <Progress label="Equilíbrio pessoal" value={game.lifeBalance} color={game.lifeBalance < 40 ? "#ff8c5a" : "#a675ff"} />
                <Progress label="Impacto social" value={game.charityReputation} color="#ffc72c" />
              </section>

              {game.history.some((record) => (record.followers ?? 0) > 0) && (
                <section className="audience-growth-card">
                  <div><span>CRESCIMENTO DE AUDIÊNCIA</span><strong>Seu alcance por temporada</strong></div>
                  <div className="audience-bars">
                    {game.history.slice(-10).map((record) => {
                      const recentRecords = game.history.slice(-10);
                      const highestReach = Math.max(...recentRecords.map((item) => item.followers ?? 0), 1);
                      return (
                        <article key={`audience-${record.season}`}>
                          <b>{formatFollowers(record.followers ?? 0)}</b>
                          <i><em style={{ height: `${clamp(((record.followers ?? 0) / highestReach) * 100, 7, 100)}%` }} /></i>
                          <small>{String(record.season).slice(-2)}</small>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className={`sponsor-hub ${game.activeSponsor ? "has-deal" : "no-deal"}`}>
                <div className="sponsor-heading"><div><span>PATROCINADOR PESSOAL</span><strong>{game.activeSponsor ? "Contrato ativo" : "Sua chuteira ainda está livre"}</strong></div><b>◇</b></div>
                {game.activeSponsor ? (
                  <>
                    <article className="active-sponsor-card">
                      <div className="sponsor-wordmark">{game.activeSponsor.brand}</div>
                      <div><small>PARCERIA PERSISTENTE</small><strong>{formatMoney(game.activeSponsor.annualValue)}<em>/ano</em></strong><p>{Math.max(0, game.activeSponsor.endSeason - game.season)} temporada(s) restante(s) · acompanha qualquer transferência</p></div>
                    </article>
                    <div className="sponsor-contract-progress"><span><i style={{ width: `${clamp(((game.season - game.activeSponsor.startSeason) / Math.max(1, game.activeSponsor.endSeason - game.activeSponsor.startSeason)) * 100)}%` }} /></span><small>{game.activeSponsor.startSeason}</small><small>{game.activeSponsor.endSeason}</small></div>
                  </>
                ) : (
                  <div className="sponsor-empty"><strong>Grandes temporadas atraem grandes marcas.</strong><p>Prestígio, seguidores, boa imagem e impacto social aumentam o nível e o valor das propostas.</p></div>
                )}
                <footer><span>VALOR GERADO NA CARREIRA</span><strong>{formatMoney(sponsorCareerValue)}</strong><small>Simulação fictícia, sem vínculo com as marcas citadas.</small></footer>
              </section>

              {game.sponsorHistory.length > 0 && (
                <section className="sponsor-history-card">
                  <div><span>HISTÓRICO COMERCIAL</span><strong>Marcas que passaram pela carreira</strong></div>
                  <section>
                    {game.sponsorHistory.map((deal) => (
                      <article key={deal.id}><div className="sponsor-wordmark small">{deal.brand}</div><div><strong>{deal.startSeason}–{deal.endSeason}</strong><small>{formatMoney(deal.annualValue)}/ano · contrato concluído</small></div><b>✓</b></article>
                    ))}
                  </section>
                </section>
              )}

              <section className="social-feed-card">
                <div className="social-feed-heading"><div><span>LINHA DO TEMPO</span><strong>O que estão falando</strong></div><b>AO VIVO</b></div>
                {game.socialFeed.length === 0 ? (
                  <div className="social-empty"><span>@</span><strong>O primeiro post ainda está por vir</strong><p>Assine seu contrato profissional e comece a construir uma audiência.</p></div>
                ) : (
                  <section className="social-post-list">
                    {game.socialFeed.map((post) => (
                      <article className={`post-${post.tone}`} key={post.id}>
                        <div className={`social-avatar source-${post.source}`}>{post.source === "player" ? game.number : post.source === "sponsor" ? "◇" : post.source === "fans" ? "♥" : "●"}</div>
                        <div><strong>{post.author}</strong><small>{post.source === "player" ? "JOGADOR" : post.source === "sponsor" ? "PUBLICIDADE" : post.source === "fans" ? "TORCIDA" : "IMPRENSA"} · {post.season}</small><p>{post.text}</p><footer><span>♥ {formatFollowers(post.likes)}</span><span>↗ compartilhar</span></footer></div>
                      </article>
                    ))}
                  </section>
                )}
              </section>

              <section className="life-advisor-card">
                <div><span>TERMÔMETRO PESSOAL</span><strong>O que merece atenção</strong></div>
                <section>
                  <article className={game.lifeBalance < 45 ? "warning" : "good"}><b>{game.lifeBalance < 45 ? "!" : "✓"}</b><div><strong>{game.lifeBalance < 45 ? "A carreira está ocupando tudo" : "Rotina sob controle"}</strong><small>{game.lifeBalance < 45 ? "Baixo equilíbrio reduz rendimento e aumenta o risco físico." : "Descanso e vida pessoal ajudam sua consistência em campo."}</small></div></article>
                  <article className={game.socialSentiment < 40 ? "warning" : "good"}><b>{game.socialSentiment < 40 ? "!" : "✓"}</b><div><strong>{game.socialSentiment < 40 ? "As redes viraram contra você" : "Comunidade saudável"}</strong><small>{game.socialSentiment < 40 ? "Uma resposta ruim pode afastar público e patrocinadores." : "Seu alcance cresce com uma base de torcedores favorável."}</small></div></article>
                  <article className={game.mediaRelation < 38 ? "warning" : "good"}><b>{game.mediaRelation < 38 ? "!" : "✓"}</b><div><strong>{game.mediaRelation < 38 ? "Relação hostil com a imprensa" : "Narrativa bem administrada"}</strong><small>{game.mediaRelation < 38 ? "Entrevistas e manchetes terão menos boa vontade." : "Sua versão dos fatos encontra espaço nas manchetes."}</small></div></article>
                </section>
              </section>

              {game.offFieldMilestones.length > 0 && <div className="life-milestones"><span>MARCOS DIGITAIS</span>{[...game.offFieldMilestones].reverse().slice(0, 6).map((milestone) => <strong key={milestone}>✦ {milestone}</strong>)}</div>}
            </div>
          )}

          {activeTab === "stats" && game.phase === "career" && (
            <div className="panel-screen statistics-screen screen-enter">
              <header className="statistics-hero">
                <span>CENTRAL ESTATÍSTICA</span>
                <h2>Sua carreira em números</h2>
                <p>Cada temporada registrada, comparada e transformada em recordes.</p>
                <div>
                  <Metric label="Temporadas" value={game.history.length} />
                  <Metric label="G+A" value={game.stats.goals + game.stats.assists} tone="gold" />
                  <Metric label="Nota média" value={statistics.careerRating.toFixed(1)} tone="green" />
                  <Metric label="Melhor em campo" value={statistics.manOfTheMatchAwards} />
                </div>
              </header>

              {statistics.recent.length > 0 ? (
                <>
                  <section className="season-chart-card">
                    <div><span>EVOLUÇÃO RECENTE</span><strong>Nota de temporada</strong></div>
                    <div className="season-bars" role="img" aria-label="Notas das últimas temporadas">
                      {statistics.recent.map((record) => {
                        const score = record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season);
                        return (
                          <article key={`score-${record.season}`}>
                            <b>{score.toFixed(1)}</b>
                            <i><em style={{ height: `${clamp((score - 5) * 20, 8, 100)}%` }} /></i>
                            <small>{String(record.season).slice(-2)}</small>
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <section className="production-chart-card">
                    <div><span>PRODUÇÃO OFENSIVA</span><strong>Gols e assistências por ano</strong></div>
                    <div className="production-list">
                      {statistics.recent.map((record) => {
                        const total = Math.max(1, record.goals + record.assists);
                        return (
                          <article key={`production-${record.season}`}>
                            <small>{record.season}</small>
                            <div><i className="goals" style={{ width: `${record.goals / total * 100}%` }} /><i className="assists" style={{ width: `${record.assists / total * 100}%` }} /></div>
                            <strong>{record.goals}G · {record.assists}A</strong>
                          </article>
                        );
                      })}
                    </div>
                    <footer><span><i className="goals" /> Gols</span><span><i className="assists" /> Assistências</span></footer>
                  </section>

                  {statistics.bestSeason && (
                    <section className="best-season-card">
                      <span>MELHOR TEMPORADA</span>
                      <div><strong>{statistics.bestSeason.season}</strong><small>{clubById(statistics.bestSeason.clubId).shortName} · {statistics.bestSeason.age} anos</small></div>
                      <section>
                        <Metric label="Nota" value={(statistics.bestSeason.averageRating ?? seasonAverageRating(statistics.bestSeason.performanceScore ?? 0, game.seed, statistics.bestSeason.season)).toFixed(1)} tone="gold" />
                        <Metric label="Jogos" value={statistics.bestSeason.appearances} />
                        <Metric label="Gols" value={statistics.bestSeason.goals} />
                        <Metric label="Assist." value={statistics.bestSeason.assists} />
                      </section>
                    </section>
                  )}

                  <section className="record-book">
                    <div><span>LIVRO DE RECORDES</span><strong>Seus picos</strong></div>
                    <section>
                      <article><span>◎</span><div><small>MAIS GOLS</small><strong>{statistics.mostGoals?.goals ?? 0}</strong><em>{statistics.mostGoals?.season}</em></div></article>
                      <article><span>✦</span><div><small>MAIS ASSISTÊNCIAS</small><strong>{statistics.mostAssists?.assists ?? 0}</strong><em>{statistics.mostAssists?.season}</em></div></article>
                      <article><span>▶</span><div><small>MAIS JOGOS</small><strong>{statistics.mostAppearances?.appearances ?? 0}</strong><em>{statistics.mostAppearances?.season}</em></div></article>
                      <article><span>↑</span><div><small>MAIOR OVR</small><strong>{statistics.highestOverall?.overall ?? game.overall}</strong><em>{statistics.highestOverall?.season}</em></div></article>
                      <article className="value-record"><span>€</span><div><small>MAIOR VALOR</small><strong>{formatMoney(statistics.highestValue?.marketValue ?? 0)}</strong><em>{statistics.highestValue?.season}</em></div></article>
                    </section>
                  </section>
                </>
              ) : <div className="statistics-empty"><span>▥</span><strong>A central abre depois da estreia</strong><p>Complete a primeira temporada para começar seu arquivo estatístico.</p></div>}

              <section className="rival-center">
                <div><span>RIVAIS DE GERAÇÃO</span><strong>{game.rivals.length ? "Eles também estão construindo uma carreira" : "Esta carreira não ganhou um rival"}</strong></div>
                {game.rivals.length === 0 ? <p>Nem toda história precisa de um antagonista. Em outra carreira — ou com seus Personagens — alguém pode aparecer.</p> : (
                  <section>
                    {game.rivals.map((rival) => {
                      const rivalClub = clubById(rival.currentClubId);
                      const relationship = rival.relationship >= 68 ? "Respeito mútuo" : rival.relationship <= 34 ? "Rivalidade quente" : "Competição aberta";
                      return (
                        <article className={!rival.active ? "retired" : ""} key={rival.id}>
                          <ClubBadge club={rivalClub} size="sm" />
                          <div><strong>{rival.name}{rival.custom ? " ✦" : ""}</strong><small>{rival.position} · {rival.age} anos · {rivalClub.shortName}</small><em>{relationship}</em></div>
                          <span><b>{rival.overall}</b><small>OVR</small></span>
                          <footer>{rival.appearances}J · {rival.goals}G · {rival.assists}A · {rival.awards} prêmio(s)</footer>
                        </article>
                      );
                    })}
                  </section>
                )}
              </section>
            </div>
          )}

          {activeTab === "legacy" && game.phase === "career" && (
            <div className="panel-screen legacy-screen screen-enter">
              <div className="legacy-hero">
                <span>ÍNDICE DE LEGADO</span>
                <strong style={{ color: legacyStanding.color }}>{game.legacyPoints}</strong>
                <h2>{legacyStanding.label}</h2>
                <p>Títulos importam, mas longevidade, seleção, prêmios, números e até as voltas por cima também constroem uma carreira.</p>
              </div>
              <div className="legacy-grid">
                <Metric label="Temporadas" value={game.history.length} />
                <Metric label="Clubes" value={new Set(game.history.map((item) => item.clubId)).size || 1} />
                <Metric label="Pico OVR" value={Math.max(game.overall, ...game.history.map((item) => item.overall), 0)} tone="gold" />
                <Metric label="Patrimônio" value={formatMoney(game.money)} tone="green" />
              </div>
              <div className="news-card">
                <span>ÚLTIMAS MANCHETES</span>
                {game.newsFeed.length ? game.newsFeed.map((headline, index) => <article key={`${headline}-${index}`}><small>{index === 0 ? "AGORA" : "ARQUIVO"}</small><strong>{headline}</strong></article>) : <p>A imprensa ainda espera o primeiro grande capítulo.</p>}
              </div>
              <div className="legacy-checklist">
                <span>MARCOS DA CARREIRA</span>
                <article className={game.stats.appearances >= 100 ? "done" : ""}><b>{game.stats.appearances >= 100 ? "✓" : "○"}</b><div><strong>Centenário</strong><small>100 jogos profissionais</small></div></article>
                <article className={game.trophies + game.nationalTrophies >= 5 ? "done" : ""}><b>{game.trophies + game.nationalTrophies >= 5 ? "✓" : "○"}</b><div><strong>Colecionador</strong><small>5 títulos na carreira</small></div></article>
                <article className={game.nationalCaps >= 50 ? "done" : ""}><b>{game.nationalCaps >= 50 ? "✓" : "○"}</b><div><strong>Camisa da pátria</strong><small>50 jogos pela Seleção</small></div></article>
                <article className={(game.awardCabinet["Bola de Ouro"] ?? 0) > 0 ? "done legendary" : ""}><b>{(game.awardCabinet["Bola de Ouro"] ?? 0) > 0 ? "★" : "○"}</b><div><strong>Bola de Ouro</strong><small>O marco quase impossível</small></div></article>
              </div>
              <div className="achievement-gallery">
                <div><span>CONQUISTAS</span><strong>{game.unlockedAchievements.length}/{ACHIEVEMENTS.length}</strong></div>
                <section>
                  {ACHIEVEMENTS.map((achievement) => {
                    const unlocked = game.unlockedAchievements.includes(achievement.id);
                    const legendarySecret = achievement.rarity === "lendário" && !unlocked;
                    return <button type="button" className={`achievement-card ${unlocked ? "unlocked" : ""} rarity-${achievement.rarity}`} key={achievement.id} onClick={() => setSelectedAchievementId(achievement.id)}><b>{unlocked ? achievement.icon : "?"}</b><div><strong>{legendarySecret ? "Conquista secreta" : achievement.title}</strong><small>{unlocked ? achievement.description : legendarySecret ? "Lendária · requisito oculto" : achievement.description}</small></div></button>;
                  })}
                </section>
              </div>
            </div>
          )}

          {game.phase === "career" && (
            <nav className="bottom-nav" aria-label="Navegação da carreira">
              <div className="desktop-career-nav-brand" aria-hidden="true">
                <BrandMark size="sm" />
                <span><small>CENTRAL DO JOGADOR</small><strong>{game.name}</strong><em>{position.name} · {leagueById(game.currentLeagueId || currentClub.leagueId).name}</em></span>
              </div>
              <button aria-pressed={activeTab === "event"} className={activeTab === "event" ? "selected" : ""} onClick={() => changeTab("event")}><span>◆</span>Carreira</button>
              <button aria-pressed={activeTab === "history"} className={activeTab === "history" ? "selected" : ""} onClick={() => changeTab("history")}><span>≡</span>Histórico</button>
              <button aria-pressed={activeTab === "profile"} className={activeTab === "profile" ? "selected" : ""} onClick={() => changeTab("profile")}><span>●</span>Jogador</button>
              <button aria-pressed={activeTab === "life"} className={activeTab === "life" ? "selected" : ""} onClick={() => changeTab("life")}><span>@</span>Vida</button>
              <button aria-pressed={activeTab === "stats"} className={activeTab === "stats" ? "selected" : ""} onClick={() => changeTab("stats")}><span>▥</span>Central</button>
              <button aria-pressed={activeTab === "legacy"} className={activeTab === "legacy" ? "selected" : ""} onClick={() => changeTab("legacy")}><span>★</span>Legado</button>
            </nav>
          )}
        </section>
      )}

      {(game.phase === "summary" || hallPreview) && (
        <section className="summary-screen screen-enter">
          {hallPreview && (
            <div className="summary-preview-bar">
              <button type="button" onClick={closeHallCareer}>← Voltar ao ranking</button>
              <div><small>CARREIRA ARQUIVADA</small><strong>Você está revendo a história de {displayGame.name}</strong></div>
            </div>
          )}
          {hallPreviewLegacy && (
            <div className="summary-legacy-warning">
              Este registro é anterior ao arquivo completo. Números gerais foram recuperados, mas alguns detalhes de prêmios e clubes não existiam no save antigo.
            </div>
          )}
          {displayGame.challengeId && (
            <section className="challenge-summary-banner">
              <div><span>DESAFIO FUTBOBO CONCLUÍDO</span><strong>{displayGame.challengeId}</strong><small>Mesmo ponto de partida. Este foi o seu caminho.</small></div>
              <b>{displayGame.legacyPoints}<small>PONTOS</small></b>
            </section>
          )}
          <div className="summary-confetti" aria-hidden="true">✦ · ★ · ✦ · ★ · ✦</div>
          <span className="eyebrow">CARREIRA FINALIZADA</span>
          <h1>Uma história que só você viveu.</h1>
          <div className="share-card">
            <div className="share-brand"><BrandMark size="sm" /><strong>FUTBOBO</strong><small>MINHA CARREIRA</small></div>
            <div className="share-player"><ClubBadge club={currentClub} size="lg" /><div><span>{displayGame.archetype}</span><h2>{displayGame.name}</h2><p>#{displayGame.number} · {position.name} · {nationCountry.abbr}</p></div><strong>{Math.max(displayGame.overall, ...displayGame.history.map((item) => item.overall), 0)}<small>PICO OVR</small></strong></div>
            <div className="share-numbers"><Metric label="Jogos" value={displayGame.stats.appearances} /><Metric label={displayGame.position === "GOL" ? "Sem sofrer" : "Gols"} value={displayGame.position === "GOL" ? displayGame.stats.cleanSheets : displayGame.stats.goals} /><Metric label={displayGame.position === "GOL" ? "Sofridos" : "Assistências"} value={displayGame.position === "GOL" ? displayGame.stats.goalsConceded : displayGame.stats.assists} /><Metric label="Taças" value={displayGame.trophies + displayGame.nationalTrophies} tone="gold" /></div>
            <div className="share-legacy-line"><span>LEGADO {displayGame.legacyPoints}</span><strong>{legacyStanding.label}</strong><span>{displayGame.unlockedAchievements.length}/{ACHIEVEMENTS.length} CONQUISTAS</span></div>
            <div className="share-honours">
              <article><span>◉</span><div><small>BOLA DE OURO</small><strong>{displayGame.awardCabinet["Bola de Ouro"] ?? 0}</strong></div></article>
              <article><span>✪</span><div><small>WORLD XI</small><strong>{displayGame.awardCabinet["FIFPRO World XI"] ?? 0}</strong></div></article>
              <article><span>✦</span><div><small>PRÊMIOS</small><strong>{totalIndividualAwards}</strong></div></article>
            </div>
            <div className="share-trophies">
              {shareTitleHighlights.map((entry) => (
                <span key={entry.shortLabel}>{entry.shortLabel} {entry.count}</span>
              ))}
              {displayGame.trophies + displayGame.nationalTrophies === 0 && <span>EM BUSCA DA PRIMEIRA TAÇA</span>}
            </div>
            <div className="share-path"><span>12</span><div />{Array.from(new Set(displayGame.history.map((item) => item.clubId))).map((clubId) => <ClubBadge key={clubId} club={clubById(clubId)} size="sm" />)}<div /><span>{displayGame.age}</span></div>
            <small className="share-url">erereck.github.io/futbobo</small>
          </div>
          <TrophyGallery state={displayGame} final />
          <section className={`final-player-story story-${playerStoryById(displayGame.playerStoryId).tone}`}>
            <header><b>{playerStoryById(displayGame.playerStoryId).icon}</b><div><span>A HISTÓRIA POR TRÁS DA CARREIRA</span><strong>{playerStoryById(displayGame.playerStoryId).title}</strong></div><em>{displayGame.storyLog.length} capítulo{displayGame.storyLog.length === 1 ? "" : "s"} vivido{displayGame.storyLog.length === 1 ? "" : "s"}</em></header>
            <p>{playerStoryById(displayGame.playerStoryId).description}</p>
            {displayGame.storyLog.length > 0 && (
              <div>
                {displayGame.storyLog.map((entry) => (
                  <article key={`${entry.season}-${entry.chapter}`}><span>{entry.season}</span><div><small>CAPÍTULO {entry.chapter}</small><strong>{entry.title}</strong><p>{entry.choice} — {entry.result}</p></div></article>
                ))}
              </div>
            )}
          </section>
          <section className="final-public-life">
            <div className="summary-section-heading"><span>FORA DAS QUATRO LINHAS</span><strong>A marca que você deixou no mundo</strong></div>
            <div className="final-public-grid">
              <Metric label="Seguidores" value={formatFollowers(displayGame.followers)} tone="gold" />
              <Metric label="Imagem" value={publicImage.label} tone="green" />
              <Metric label="Patrocínios" value={displayGame.sponsorHistory.length + (displayGame.activeSponsor ? 1 : 0)} />
              <Metric label="Impacto social" value={displayGame.charityReputation} />
            </div>
            {displayGame.activeSponsor && <article><div className="sponsor-wordmark small">{displayGame.activeSponsor.brand}</div><div><small>PARCERIA NA APOSENTADORIA</small><strong>{formatMoney(displayGame.activeSponsor.annualValue)}/ano</strong></div></article>}
          </section>
          <section className="final-individual-awards">
            <div className="summary-section-heading final-awards-heading">
              <div><span>PRÊMIOS INDIVIDUAIS</span><strong>Sua galeria de glórias</strong></div>
              <b>{totalIndividualAwards}<small>PRÊMIOS</small></b>
            </div>
            {awardEntries.length > 0 ? (
              <div className="final-awards-list">
                {awardEntries.map(([award, count]) => {
                  const presentation = awardPresentation(award);
                  return (
                    <article className={`award-${presentation.tier}`} key={award}>
                      <span>{presentation.icon}</span>
                      <div><small>{presentation.kicker}</small><strong>{award}</strong><p>{presentation.description}</p></div>
                      <b>{count}<small>×</small></b>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="final-awards-empty"><span>◇</span><strong>Uma carreira sem prêmio não é uma carreira sem história.</strong><p>Seu legado foi construído de outras formas.</p></div>
            )}
          </section>
          <section className="career-club-summary">
            <div className="summary-section-heading club-archive-heading"><div><span>ARQUIVO POR CLUBE</span><strong>Reviva cada camisa da carreira</strong></div><b>{clubCareerSummary.length}<small>CLUBES</small></b></div>
            {selectedClubCareer ? (
              <div className="club-archive-layout">
                <nav className="club-archive-tabs" aria-label="Escolher clube da carreira">
                  {clubCareerSummary.map((entry) => {
                    const club = clubById(entry.clubId);
                    const selected = entry.clubId === selectedClubCareer.clubId;
                    return (
                      <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => setSummaryClubId(entry.clubId)} key={entry.clubId}>
                        <ClubBadge club={club} size="sm" />
                        <span><strong>{club.shortName}</strong><small>{entry.firstSeason === entry.lastSeason ? entry.firstSeason : `${entry.firstSeason}–${entry.lastSeason}`} · {entry.seasons} temp.</small></span>
                        <b>{entry.trophies}<small>TAÇAS</small></b>
                      </button>
                    );
                  })}
                </nav>
                <article className="club-archive-dossier">
                  {(() => {
                    const club = clubById(selectedClubCareer.clubId);
                    const selectedTitles = selectedClubCareer.records.flatMap((record) => record.competitions.filter((competition) => competition.champion).map((competition) => ({ ...competition, season: record.season, leagueId: record.leagueId || club.leagueId })));
                    const selectedAwards = selectedClubCareer.records.flatMap((record) => record.awards.map((award) => ({ award, season: record.season })));
                    return <>
                      <header>
                        <ClubBadge club={club} size="lg" />
                        <div><span>{leagueById(club.leagueId).name}</span><h3>{club.name}</h3><p>{selectedClubCareer.firstSeason === selectedClubCareer.lastSeason ? selectedClubCareer.firstSeason : `${selectedClubCareer.firstSeason}–${selectedClubCareer.lastSeason}`} · {selectedClubCareer.seasons} temporada{selectedClubCareer.seasons > 1 ? "s" : ""}</p></div>
                        <b>{selectedClubCareer.peakOverall}<small>PICO OVR</small></b>
                      </header>
                      <div className="club-archive-metrics">
                        <Metric label="Jogos" value={selectedClubCareer.appearances} />
                        <Metric label={displayGame.position === "GOL" ? "Sem sofrer" : "Gols"} value={displayGame.position === "GOL" ? selectedClubCareer.cleanSheets : selectedClubCareer.goals} tone="green" />
                        <Metric label="Assistências" value={selectedClubCareer.assists} />
                        <Metric label="Taças" value={selectedClubCareer.trophies} tone="gold" />
                        <Metric label="Prêmios" value={selectedClubCareer.awards} />
                        <Metric label="Evolução" value={`${selectedClubCareer.entryOverall}→${selectedClubCareer.exitOverall}`} />
                      </div>
                      {(selectedTitles.length > 0 || selectedAwards.length > 0) && <div className="club-archive-honours">
                        {selectedTitles.map((title) => <span key={`${title.season}-${title.id}`}><CompetitionBadge competition={title} leagueId={title.leagueId} /><b>{title.name}</b><small>{title.season}</small></span>)}
                        {selectedAwards.slice(0, 8).map((entry, index) => <span className="individual" key={`${entry.season}-${entry.award}-${index}`}><i>{awardPresentation(entry.award).icon}</i><b>{entry.award}</b><small>{entry.season}</small></span>)}
                      </div>}
                      <section className="club-season-ledger">
                        <header><span>TEMPORADA POR TEMPORADA</span><small>O arquivo completo desta passagem</small></header>
                        <div>
                          {[...selectedClubCareer.records].reverse().map((record) => {
                            const titles = record.competitions.filter((competition) => competition.champion);
                            return <article key={`${record.season}-${record.clubId}`}>
                              <time>{record.season}<small>{record.age} ANOS</small></time>
                              <div><strong>{record.appearances} jogos · {record.position === "GOL" ? `${record.cleanSheets} sem sofrer` : `${record.goals} gols · ${record.assists} assist.`}</strong><small>{ROLE_LABELS[record.squadRole]} · nota {(record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, displayGame.seed, record.season)).toFixed(1)}</small>{record.eventTitle && <p>{record.eventTitle}</p>}</div>
                              <span className="club-season-ovr">{record.overall}<small>OVR</small></span>
                              {(titles.length > 0 || record.awards.length > 0) && <footer>{titles.map((title) => <CompetitionBadge key={title.id} competition={title} leagueId={record.leagueId || club.leagueId} />)}{record.awards.slice(0, 3).map((award, index) => <em key={`${award}-${index}`} title={award}>{awardPresentation(award).icon}</em>)}</footer>}
                            </article>;
                          })}
                        </div>
                      </section>
                    </>;
                  })()}
                </article>
              </div>
            ) : <div className="empty-panel">Nenhuma temporada profissional foi registrada.</div>}
          </section>
          <section className="final-hall-of-fame">
            <div className="summary-section-heading"><span>HALL DA FAMA</span><strong>As maiores carreiras deste aparelho</strong></div>
            <div className="hall-ranking">
              {hallOfFame.slice(0, 10).map((entry, index) => (
                <article
                  className={`${entry.id === `${displayGame.seed}-${displayGame.name}-${displayGame.history.length}` ? "current-career " : ""}hall-career-link`}
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver carreira completa de ${entry.name}`}
                  onClick={() => openHallCareer(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openHallCareer(entry);
                    }
                  }}
                >
                  <b>#{index + 1}</b>
                  <ClubBadge club={clubById(entry.finalClubId)} size="sm" />
                  <div><strong>{entry.name}</strong><small>{entry.legacyLabel} · {entry.trophies} taças · {entry.ballonDor}× Bola de Ouro</small></div>
                  <span className="hall-score">{entry.legacyPoints}<small>PTS</small></span>
                </article>
              ))}
            </div>
            {filteredCountries.length === 0 && <div className="empty-panel">Nenhuma seleção encontrada.</div>}
          </section>
          <div className="summary-actions"><button className="primary-button" onClick={shareCareer}>Compartilhar pôster da carreira <span>↗</span></button><button className="secondary-button" onClick={displayGame.challengeId ? startChallenge : startNew}>{displayGame.challengeId ? "Tentar o mesmo desafio novamente" : "Jogar novamente"}</button></div>
        </section>
      )}
    </main>
  );
}

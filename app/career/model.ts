import type { ContinentalSlot, Effect, PositionKey } from "../game-data";
import type { CareerObjective, ObjectiveResult, SquadRole } from "../career-systems";
import type { PlayerAppearance } from "../player-appearance";
import type { BotaoMatchResult } from "../botao/types";
import type { PlayerStoryId } from "../player-stories";

export type Phase =
  | "welcome"
  | "identity"
  | "appearance"
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

export type CompetitionId =
  | "domesticLeague"
  | "domesticCup"
  | "domesticSuperCup"
  | "libertadores"
  | "sudamericana"
  | "recopaSudamericana"
  | "mundial"
  | "championsLeague"
  | "uefaSuperCup"
  | "europaLeague"
  | "conferenceLeague"
  | "concacafChampions"
  | "afcChampions"
  | "cafChampions"
  | "campeonesCup";

export type CompetitionResult = {
  id: CompetitionId;
  name: string;
  icon: string;
  stage: string;
  champion: boolean;
};

export type PendingBotaoMatch = {
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
  worldCampaign?: boolean;
};

export type StoredBotaoResult = {
  match: PendingBotaoMatch;
  result: BotaoMatchResult;
};

export type TrophyCabinet = {
  domesticLeague: number;
  domesticCup: number;
  domesticSuperCup: number;
  libertadores: number;
  sudamericana: number;
  recopaSudamericana: number;
  mundial: number;
  championsLeague: number;
  uefaSuperCup: number;
  europaLeague: number;
  conferenceLeague: number;
  concacafChampions: number;
  afcChampions: number;
  cafChampions: number;
  campeonesCup: number;
};

export type NationalTier = "none" | "sub17" | "sub20" | "olympic" | "main";

export type NationalRecord = {
  season: number;
  tier: NationalTier;
  name: string;
  icon: string;
  stage: string;
  champion: boolean;
  tournamentStats?: TournamentStats;
};

export type TournamentStats = {
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

export type ChoiceConsequence = {
  choice: string;
  headline: string;
  resultText: string;
  changes: string[];
  luckOutcome: "success" | "failure" | null;
};

export type StoryDecisionChoice = {
  label: string;
  hint: string;
  result: string;
  effect: Effect;
  flag: string;
  transferClubId?: string;
};

export type StoryDecision = {
  id: string;
  storyId: PlayerStoryId;
  chapter: number;
  icon: string;
  kicker: string;
  title: string;
  description: string;
  choices: StoryDecisionChoice[];
};

export type StoryLogEntry = {
  season: number;
  chapter: number;
  decisionId?: string;
  title: string;
  choice: string;
  result: string;
};

export type PressAnswer = {
  label: string;
  tone: "calm" | "bold" | "team";
  result: string;
  effect: Effect;
};

export type PressQuestion = {
  id: string;
  question: string;
  context: string;
  answers: PressAnswer[];
};

export type PressConference = {
  matchId: string;
  competitionName: string;
  opponentName: string;
  questionIndex: number;
  questions: PressQuestion[];
};

export type TransferStatus = {
  success: boolean;
  chance: number;
  headline: string;
  text: string;
};

export type PlayerStats = {
  appearances: number;
  goals: number;
  assists: number;
  tackles: number;
  cleanSheets: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
};

export type AttributeKey =
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

export type PlayerAttributes = Record<AttributeKey, number>;

export type AwardNomination = {
  award: string;
  won: boolean;
  winner: string;
  finalists?: string[];
};

export type TransferMode = "permanent" | "loan";

export type SocialPost = {
  id: string;
  season: number;
  source: "player" | "fans" | "press" | "sponsor";
  author: string;
  text: string;
  likes: number;
  tone: "positive" | "neutral" | "negative";
};

export type SponsorDeal = {
  id: string;
  brand: string;
  startSeason: number;
  endSeason: number;
  annualValue: number;
  signedAtFollowers: number;
  status: "active" | "completed" | "terminated";
};

export type SpecialTraitId =
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

export type CareerRival = {
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

export type CustomCharacter = {
  id: string;
  name: string;
  position: PositionKey;
};

export type CustomClubDefinition = {
  replacedClubId: string;
  name: string;
  shortName: string;
  abbr: string;
  primary: string;
  secondary: string;
  badge: string;
};

export type AppSettings = {
  customCharacters: CustomCharacter[];
  customClubs?: CustomClubDefinition[];
  finalMatchMode?: "simulate" | "finals-only" | "play-key-matches";
  botaoGoalLimit?: 0 | 3 | 5;
  botaoHalfSeconds?: 90 | 120 | 180;
  botaoExtraSeconds?: 30 | 45 | 60;
  botaoPenaltyRounds?: 3 | 5;
  characterButtonsEnabled?: boolean;
};

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type YouthYear = {
  age: number;
  title: string;
  text: string;
  delta: number;
  overall?: number;
};

export type SeasonRecord = PlayerStats & {
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

export type SeasonResult = SeasonRecord & {
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

export type GameState = {
  version: 7;
  phase: Phase;
  seed: number;
  name: string;
  number: number;
  playerAppearance: PlayerAppearance;
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

export type MedicalRecord = {
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

export type ChallengeResult = {
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

export type MonteCarloCareerSummary = {
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

export type MonteCarloReport = {
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

export type AwardTier = "regular" | "elite" | "legendary";

export type AwardPresentation = {
  icon: string;
  tier: AwardTier;
  kicker: string;
  description: string;
};

export type CareerHallEntry = {
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

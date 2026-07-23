"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CLUBS,
  COUNTRIES,
  FIRST_MATCH_EVENT,
  FORMATIONS,
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

type Phase =
  | "welcome"
  | "identity"
  | "nationality"
  | "academy"
  | "formation"
  | "youth"
  | "youth-complete"
  | "revelation"
  | "career"
  | "consequence"
  | "season-result"
  | "transfer"
  | "transfer-denied"
  | "retirement-confirm"
  | "summary";

type CompetitionId =
  | "domesticLeague"
  | "domesticCup"
  | "libertadores"
  | "mundial"
  | "championsLeague"
  | "europaLeague"
  | "conferenceLeague"
  | "concacafChampions";

type CompetitionResult = {
  id: CompetitionId;
  name: string;
  icon: string;
  stage: string;
  champion: boolean;
};

type TrophyCabinet = {
  domesticLeague: number;
  domesticCup: number;
  libertadores: number;
  mundial: number;
  championsLeague: number;
  europaLeague: number;
  conferenceLeague: number;
  concacafChampions: number;
};

type NationalTier = "none" | "sub17" | "sub20" | "olympic" | "main";

type NationalRecord = {
  season: number;
  tier: NationalTier;
  name: string;
  icon: string;
  stage: string;
  champion: boolean;
};

type ChoiceConsequence = {
  choice: string;
  headline: string;
  resultText: string;
  changes: string[];
  luckOutcome: "success" | "failure" | null;
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
  cleanSheets: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
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
  overall: number;
  title: boolean;
  eventTitle: string;
  competitions: CompetitionResult[];
  awards: string[];
  squadRole: SquadRole;
  objectiveResult: ObjectiveResult | null;
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
};

type GameState = {
  version: 5;
  phase: Phase;
  seed: number;
  name: string;
  number: number;
  foot: "Direita" | "Esquerda";
  position: PositionKey;
  nationality: string;
  academyClubId: string;
  formationId: string;
  archetype: string;
  revealAge: number;
  youthScore: number;
  youthYears: YouthYear[];
  proOffers: string[];
  currentClubId: string;
  age: number;
  season: number;
  overall: number;
  potential: number;
  morale: number;
  fitness: number;
  reputation: number;
  leadership: number;
  money: number;
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
  retireAfterSeason: boolean;
  retirementReturnPhase: Phase;
  transferOffers: string[];
  transferRequests: number;
  transferCooldownSeason: number;
  transferStatus: TransferStatus | null;
  transferRequested: boolean;
  renewalDenied: boolean;
  nationalitySwitched: boolean;
  nationalitySwitchInviteUsed: boolean;
  pendingNationalitySwitchTarget: string;
  legacyPoints: number;
  unlockedAchievements: string[];
  newsFeed: string[];
};

const SAVE_KEY = "futbobo:career:v1";
const ALL_PRO_EVENTS = [...PRO_EVENTS, ...MEGA_EVENTS];

const EMPTY_STATS: PlayerStats = {
  appearances: 0,
  goals: 0,
  assists: 0,
  cleanSheets: 0,
  goalsConceded: 0,
  yellowCards: 0,
  redCards: 0,
};

function initialState(): GameState {
  return {
    version: 5,
    phase: "welcome",
    seed: Date.now() % 2147483647,
    name: "",
    number: 10,
    foot: "Direita",
    position: "MEI",
    nationality: "brasil",
    academyClubId: "",
    formationId: "",
    archetype: "",
    revealAge: 18,
    youthScore: 0,
    youthYears: [],
    proOffers: [],
    currentClubId: "",
    age: 12,
    season: 2026,
    overall: 42,
    potential: 78,
    morale: 76,
    fitness: 92,
    reputation: 0,
    leadership: 10,
    money: 0,
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
    trophyCabinet: { domesticLeague: 0, domesticCup: 0, libertadores: 0, mundial: 0, championsLeague: 0, europaLeague: 0, conferenceLeague: 0, concacafChampions: 0 },
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
    retireAfterSeason: false,
    retirementReturnPhase: "career",
    transferOffers: [],
    transferRequests: 0,
    transferCooldownSeason: 0,
    transferStatus: null,
    transferRequested: false,
    renewalDenied: false,
    nationalitySwitched: false,
    nationalitySwitchInviteUsed: false,
    pendingNationalitySwitchTarget: "",
    legacyPoints: 0,
    unlockedAchievements: [],
    newsFeed: [],
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
    version: 5,
    nationality: saved.nationality ?? "brasil",
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
    nationalitySwitched: saved.nationalitySwitched ?? false,
    nationalitySwitchInviteUsed: saved.nationalitySwitchInviteUsed ?? false,
    pendingNationalitySwitchTarget: saved.pendingNationalitySwitchTarget ?? "",
    stats: {
      appearances: saved.stats?.appearances ?? 0,
      goals: saved.stats?.goals ?? 0,
      assists: saved.stats?.assists ?? 0,
      cleanSheets: saved.stats?.cleanSheets ?? 0,
      goalsConceded: saved.stats?.goalsConceded ?? 0,
      yellowCards: saved.stats?.yellowCards ?? 0,
      redCards: saved.stats?.redCards ?? 0,
    },
    managerTrust: saved.managerTrust ?? 48,
    discipline: saved.discipline ?? 72,
    disciplineHistoryReliable: saved.disciplineHistoryReliable ?? saved.version === 5,
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
    newsFeed: saved.newsFeed ?? [],
    trophyCabinet: {
      domesticLeague: oldDomesticLeague,
      domesticCup: oldDomesticCup,
      libertadores: saved.trophyCabinet?.libertadores ?? 0,
      mundial: saved.trophyCabinet?.mundial ?? 0,
      championsLeague: saved.trophyCabinet?.championsLeague ?? 0,
      europaLeague: saved.trophyCabinet?.europaLeague ?? 0,
      conferenceLeague: saved.trophyCabinet?.conferenceLeague ?? 0,
      concacafChampions: saved.trophyCabinet?.concacafChampions ?? 0,
    },
    awardCabinet: { ...base.awardCabinet, ...saved.awardCabinet },
    history: (saved.history ?? []).map((record) => ({
      appearances: record.appearances ?? 0,
      goals: record.goals ?? 0,
      assists: record.assists ?? 0,
      cleanSheets: record.cleanSheets ?? 0,
      goalsConceded: record.goalsConceded ?? 0,
      yellowCards: record.yellowCards ?? 0,
      redCards: record.redCards ?? 0,
      age: record.age ?? 0,
      season: record.season ?? 0,
      clubId: record.clubId ?? "",
      overall: record.overall ?? 0,
      title: record.title ?? false,
      eventTitle: record.eventTitle ?? "",
      competitions: record.competitions ?? [],
      awards: record.awards ?? [],
      squadRole: record.squadRole ?? "rotacao",
      objectiveResult: record.objectiveResult ?? null,
    })),
    lastResult: saved.lastResult ? {
      ...saved.lastResult,
      competitions: saved.lastResult.competitions ?? [],
      awards: saved.lastResult.awards ?? [],
      twist: saved.lastResult.twist ?? null,
      nationalNote: saved.lastResult.nationalNote ?? null,
      yellowCards: saved.lastResult.yellowCards ?? 0,
      redCards: saved.lastResult.redCards ?? 0,
      squadRole: saved.lastResult.squadRole ?? "rotacao",
      objectiveResult: saved.lastResult.objectiveResult ?? null,
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

function clubById(id: string) {
  return CLUBS.find((club) => club.id === id) ?? CLUBS[0];
}

const DOMESTIC_CLUBS = CLUBS.filter((club) => club.countryId === "brasil");

function isAbroad(club: Club) {
  return club.countryId !== "brasil";
}

function clubConfederation(club: Club) {
  return countryById(club.countryId).confederation;
}

function isEuropeanClub(club: Club) {
  return clubConfederation(club) === "EUROPE";
}

function initialContinentalSlot(club: Club): ContinentalSlot | null {
  const confederation = clubConfederation(club);
  if (confederation === "SOUTH_AMERICA") return club.reputation >= 4 ? "libertadores" : null;
  if (confederation === "NORTH_AMERICA") return club.reputation >= 4 ? "concacaf" : null;
  if (club.reputation >= 5) return "champions";
  if (club.reputation >= 4) return "europa";
  return null;
}

// Proximidade geográfica: destinos do mesmo continente do clube atual aparecem com muito mais frequência.
function regionAffinity(originCountryId: string, club: Club) {
  if (club.countryId === originCountryId) return 0;
  const originConfederation = countryById(originCountryId).confederation;
  const targetConfederation = clubConfederation(club);
  if (originConfederation === "SOUTH_AMERICA") {
    if (targetConfederation === "SOUTH_AMERICA") return -6;
    if (targetConfederation === "NORTH_AMERICA") return -2;
    return 0;
  }
  if (originConfederation === "NORTH_AMERICA") {
    if (targetConfederation === "NORTH_AMERICA") return -4;
    if (targetConfederation === "SOUTH_AMERICA") return -2;
    return 0;
  }
  return 0;
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

function foreignEligible(state: GameState, club: Club) {
  if (!isAbroad(club)) return false;
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

const LEAGUE_MARKET_MULTIPLIER: Record<string, number> = {
  brasileirao: 0.42,
  primeira: 0.68,
  eredivisie: 0.72,
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
  const league = leagueById(club.leagueId);
  return club.strength ?? clamp(Math.round(52 + club.reputation * 7 + league.prestige * 1.8), 62, 94);
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

function formatMoney(value: number) {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  return `€${Math.round(value / 1000)}K`;
}

function addStats(a: PlayerStats, b: PlayerStats): PlayerStats {
  return {
    appearances: a.appearances + b.appearances,
    goals: a.goals + b.goals,
    assists: a.assists + b.assists,
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
  if (effect.money) changes.push(`${effect.money > 0 ? "+" : ""}${formatMoney(effect.money * 10_000)} patrimônio`);
  if (effect.contractYears) changes.push(`Contrato +${effect.contractYears} anos`);
  if (effect.salaryBoost) changes.push(`Salário +${effect.salaryBoost}%`);
  if (effect.clubCaptain) changes.push("Braçadeira do clube");
  if (effect.nationalCall) changes.push("Convocação garantida");
  if (effect.nationalCaptain) changes.push("Braçadeira da Seleção");
  if (effect.transfer) changes.push("Mercado aberto");
  if (effect.transferAbroad) changes.push("Ofertas apenas da Europa");
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
    retire: Boolean(base.retire || extra.retire),
    discipline: (base.discipline ?? 0) + (extra.discipline ?? 0),
    contractYears: (base.contractYears ?? 0) + (extra.contractYears ?? 0),
    salaryBoost: (base.salaryBoost ?? 0) + (extra.salaryBoost ?? 0),
    clubCaptain: Boolean(base.clubCaptain || extra.clubCaptain),
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
  return { label: "Ídolo", color: "#ffc72c" };
}

function selectOffers(state: GameState, count: number, salt: number, opts: { includeForeign?: boolean; forceDomestic?: boolean; forceForeign?: boolean } = {}) {
  const current = state.currentClubId || state.academyClubId;
  const currentRep = current ? clubById(current).reputation : 3;
  const targetRep = clamp(Math.round((state.overall - 56) / 6), 2, 5);
  let pool = CLUBS.filter((club) => club.id !== current);
  if (opts.forceForeign) {
    pool = pool.filter((club) => isEuropeanClub(club) && (foreignEligible(state, club) || club.reputation <= Math.max(3, currentRep - 1)));
  } else if (opts.forceDomestic) {
    pool = pool.filter((club) => !isAbroad(club));
  } else if (!opts.includeForeign) {
    pool = pool.filter((club) => !isAbroad(club));
  } else {
    pool = pool.filter((club) => !isAbroad(club) || foreignEligible(state, club));
  }
  const originCountryId = clubById(current).countryId;
  const candidates = pool.sort((a, b) => {
    const scoreA = Math.abs(a.reputation - Math.max(currentRep, targetRep)) + seeded(state.seed, salt + CLUBS.indexOf(a)) + regionAffinity(originCountryId, a);
    const scoreB = Math.abs(b.reputation - Math.max(currentRep, targetRep)) + seeded(state.seed, salt + CLUBS.indexOf(b)) + regionAffinity(originCountryId, b);
    return scoreA - scoreB;
  });
  return candidates.slice(0, count).map((club) => club.id);
}

function selectTransferOffers(state: GameState, salt: number, opts: { includeForeign?: boolean; forceDomestic?: boolean; forceForeign?: boolean } = {}) {
  const current = clubById(state.currentClubId || state.academyClubId);
  let baseOffers = isEuropeanClub(current) && !opts.forceDomestic
    ? selectOffers(state, 5, salt, { ...opts, includeForeign: true, forceForeign: true })
    : selectOffers(state, 5, salt, opts);
  if (opts.forceDomestic) return baseOffers;

  if (isEuropeanClub(current) && !opts.forceForeign) {
    const brazilReturnChance = state.age >= 34 ? 0.16 : state.age >= 30 ? 0.09 : 0.04;
    if (seeded(state.seed, salt + 887) < brazilReturnChance) {
      const rareBrazilOffer = selectOffers(state, 1, salt + 907, { forceDomestic: true })[0];
      if (rareBrazilOffer && !baseOffers.includes(rareBrazilOffer)) baseOffers = [...baseOffers, rareBrazilOffer];
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
      if (!isAbroad(club) || club.id === current.id || baseOffers.includes(club.id)) return false;
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

  return [...baseOffers, ...foreignPool].slice(0, 10);
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
    if (event.needsDomestic && isAbroad(club)) return false;
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
    if (event.oneTime && state.seenEvents.includes(event.id)) return false;
    return true;
  });
}

function selectNextEvent(state: GameState, salt: number) {
  const events = eligibleEvents(state);
  const unseen = events.filter((event) => !state.seenEvents.includes(event.id));
  return pick(unseen.length ? unseen : events, state.seed + state.season, salt)?.id ?? "extra-training";
}

const NATIONALITY_SWITCH_EVENT_ID = "dynamic-nationality-switch";

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
    return country.confederation === "EUROPE";
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
  const offerBase: GameState = { ...state, overall };
  const otherOffers = selectOffers(offerBase, 2, 41, { forceDomestic: true });
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

function applyEffect(state: GameState, effect: Effect) {
  const overall = clamp(state.overall + (effect.ovr ?? 0), 40, 99);
  return {
    ...state,
    overall,
    potential: clamp(state.potential + (effect.potential ?? 0), 45, 99),
    morale: clamp(state.morale + (effect.morale ?? 0)),
    fitness: clamp(state.fitness + (effect.fitness ?? 0)),
    reputation: clamp(state.reputation + (effect.reputation ?? 0), 0, 100),
    leadership: clamp(state.leadership + (effect.leadership ?? 0), 0, 100),
    money: Math.max(0, state.money + (effect.money ?? 0) * 10_000),
    nationalLevel: clamp(state.nationalLevel + (effect.nationalBoost ?? 0), 0, 100),
    fanSupport: clamp(state.fanSupport + (effect.fans ?? 0), 0, 100),
    adaptation: clamp(state.adaptation + (effect.adaptation ?? 0), 0, 100),
    managerTrust: clamp(state.managerTrust + (effect.minutes ?? 0) * 0.7 + (effect.leadership ?? 0) * 0.15),
    discipline: clamp(state.discipline + (effect.discipline ?? 0)),
    contractYears: Math.max(0, state.contractYears + (effect.contractYears ?? 0)),
    annualSalary: Math.round(state.annualSalary * (1 + (effect.salaryBoost ?? 0) / 100)),
    clubCaptain: Boolean(state.clubCaptain || effect.clubCaptain),
  };
}

function isNegativeConsequence(change: string) {
  const normalized = change.toLocaleLowerCase("pt-BR");
  return change.startsWith("-") || normalized.includes("piorou") || normalized.includes("risco") || normalized.includes("despedida");
}

function simulateSeason(state: GameState, event: GameEvent, effect: Effect, choiceLabel: string, resultText: string, luckOutcome: "success" | "failure" | null = null): GameState {
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
  const league = leagueById(club.leagueId);
  const country = countryById(club.countryId);
  const abroad = isAbroad(club);
  const inEurope = isEuropeanClub(club);
  const position = positionByKey(affected.position);
  const adaptationPenalty = abroad ? Math.max(0, (72 - affected.adaptation) / 8) : 0;
  const requirement = 55 + club.reputation * 5 + (abroad ? league.prestige * 3 : 0);
  const seasonRole = calculateSquadRole(affected.overall, club, league.prestige, affected.managerTrust, affected.age);
  const roleScore = affected.overall - requirement + (effect.minutes ?? 0) - adaptationPenalty + roleAppearanceModifier(seasonRole);
  const baseApps = roleScore >= 5 ? 33 : roleScore >= 0 ? 26 : roleScore >= -5 ? 19 : 11;
  const provisionalCards = Math.floor(seeded(state.seed, state.season * 211) * 5);
  const suspensionPenalty = affected.suspensionMatches + (affected.discipline < 35 ? 3 : affected.discipline < 55 ? 1 : 0);
  const appearances = clamp(Math.round(baseApps + seeded(state.seed, state.season * 3) * 8 - suspensionPenalty), 3, 38);
  const quality = clamp((affected.overall - 48) / 35, 0.45, 1.5);
  const isKeeper = position.key === "GOL";
  const roleProductionBonus = seasonRole === "estrela" ? 0.12 : seasonRole === "titular" ? 0.07 : seasonRole === "rotacao" ? 0.02 : seasonRole === "reserva" ? -0.03 : 0;
  const productionMomentum = clamp(
    1.1 + roleProductionBonus + (affected.morale - 50) / 250 + (affected.managerTrust - 50) / 300 + (affected.fitness - 70) / 500,
    0.9,
    1.45,
  );
  const goals = isKeeper ? (seeded(state.seed, state.season * 5) > 0.992 ? 1 : 0) : Math.max(0, Math.round(appearances * position.goals * quality * productionMomentum * (0.72 + seeded(state.seed, state.season * 7) * 0.88)));
  const assists = isKeeper ? Math.round(seeded(state.seed, state.season * 11) * 2) : Math.max(0, Math.round(appearances * position.assists * quality * productionMomentum * (0.72 + seeded(state.seed, state.season * 13) * 0.88)));
  const cleanSheets = isKeeper ? Math.round(appearances * (0.18 + club.reputation * 0.035 + affected.overall / 500)) : 0;
  const goalsConceded = isKeeper ? Math.max(4, Math.round(appearances * (1.55 - club.reputation * 0.1 - affected.overall / 180))) : 0;
  const positionCardWeight = position.zone === "defesa" ? 1.35 : position.zone === "meio" ? 1 : 0.65;
  const yellowCards = Math.max(0, Math.round((provisionalCards + appearances / 10) * positionCardWeight * (1.28 - affected.discipline / 180)));
  const redCards = seeded(state.seed, state.season * 223) < Math.max(0.015, (72 - affected.discipline) / 270) ? 1 : 0;
  const seasonStats = { appearances, goals, assists, cleanSheets, goalsConceded, yellowCards, redCards };

  const boost = effect.titleBoost ?? 0;
  const strength = competitiveStrength(club);
  const playerImpact = Math.max(0, affected.overall - 70);
  const leagueChance = clamp(
    4 + (strength - 70) * 0.7 + playerImpact * 0.36 + boost * 0.25 + affected.fanSupport / 55 - (abroad ? league.prestige * 0.35 : 0),
    1,
    27,
  );
  const cupChance = clamp(3 + (strength - 70) * 0.45 + playerImpact * 0.28 + boost * 0.22, 1, 20);
  const playsContinental = affected.continentalSlot;
  const playsWorld = affected.worldQualifiedSeason === affected.season && affected.worldQualifiedClubId === club.id;
  const continentalTier = playsContinental === "champions" ? -2 : playsContinental === "libertadores" ? 0 : playsContinental === "europa" ? 1 : 2;
  const underdogContinentalFactor = strength < 74 ? 0.62 : strength < 78 ? 0.82 : 1;
  const continentalChance = clamp(
    (2 + (strength - 74) * 0.38 + Math.max(0, affected.overall - 72) * 0.35 + boost * 0.18 + continentalTier) * underdogContinentalFactor,
    0.6,
    18,
  );
  const worldChance = clamp(1 + (strength - 76) * 0.28 + Math.max(0, affected.overall - 74) * 0.24 + boost * 0.1, 0.5, 12);

  const leagueChampion = seeded(state.seed, state.season * 17) * 100 < leagueChance;
  const cupLoadFactor = leagueChampion ? 0.7 : 1;
  const cupChampion = seeded(state.seed, state.season * 41) * 100 < cupChance * cupLoadFactor;
  const continentalLoadFactor = (leagueChampion ? 0.78 : 1) * (cupChampion ? 0.68 : 1);
  const continentalChampion = Boolean(playsContinental) && seeded(state.seed, state.season * 47) * 100 < continentalChance * continentalLoadFactor;
  const worldLoadFactor = (leagueChampion ? 0.86 : 1) * (cupChampion ? 0.82 : 1);
  const mundialChampion = playsWorld && seeded(state.seed, state.season * 53) * 100 < worldChance * worldLoadFactor;
  const expectedPosition = 11 - (strength - 74) * 0.45 - playerImpact * 0.08;
  const leaguePosition = leagueChampion ? 1 : clamp(Math.round(expectedPosition + seeded(state.seed, state.season * 59) * 8 - 4), 2, 20);
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
  };
  if (playsContinental) {
    const info = continentalNames[playsContinental];
    competitions.push({ id: info.id, name: info.name, icon: info.icon, stage: knockoutStage(67, continentalChampion, ["Fase de grupos", "Oitavas", "Quartas", "Semifinal", "Vice"]), champion: continentalChampion });
  }
  if (playsWorld) competitions.push({ id: "mundial", name: "Mundial de Clubes", icon: "MUN", stage: knockoutStage(71, mundialChampion, ["Fase de grupos", "Oitavas", "Quartas", "Semifinal", "Vice"]), champion: mundialChampion });
  const titleCount = competitions.filter((competition) => competition.champion).length;

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
  const twistRoll = seeded(state.seed, state.season * 83);
  const seriousInjuryChance = 0.038 + Math.max(0, 65 - affected.fitness) / 450 + (effect.injuryRisk ?? 0) / 500;
  if (twistRoll < seriousInjuryChance) {
    development -= 3;
    twistFitness = -24;
    twistMorale = -10;
    setbackDelta = 1;
    twist = "Uma lesão séria interrompeu sua temporada e mudou o ritmo da carreira.";
  } else if (twistRoll < seriousInjuryChance + 0.095) {
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
      const goalsGain = isKeeper ? 0 : Math.max(0, Math.round(capsGain * position.goals * nationalQuality * 1.3));
      const assistsGain = isKeeper ? 0 : Math.max(0, Math.round(capsGain * position.assists * nationalQuality * 1.3));
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
          const baseChance = tournament.scope === "world" ? nation.strength * 3.4 : tournament.scope === "euro" || tournament.scope === "copaAmerica" ? nation.strength * 4.1 : nation.strength * 3.8;
          const chanceCeiling = tournament.scope === "world" ? 28 : tournament.scope === "euro" || tournament.scope === "copaAmerica" ? 32 : 34;
          const majorChance = clamp(baseChance + Math.max(0, affected.overall - 78) * 0.7 + titleBoostN * 0.7 + affected.luckyBreaks * 0.35, 2, chanceCeiling);
          const champion = seeded(state.seed, state.season * 151) * 100 < majorChance;
          const stage = champion ? "CAMPEÃO" : knockoutStage(157, false, ["Fase de grupos", "Oitavas", "Quartas", "Semifinal", "Vice"]);
          nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage, champion };
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
  const leagueLabel = abroad ? league.name : "Brasileirão";
  if (affected.age <= 21 && appearances >= 22 && nextOverall >= 74 && awardRoll > 0.38) awards.push(`Revelação do ${leagueLabel}`);
  if (!isKeeper && goals >= 18) awards.push(`Artilheiro do ${leagueLabel}`);
  if (!isKeeper && assists >= 12) awards.push("Rei das Assistências");
  if (isKeeper && cleanSheets >= 14) awards.push("Luva de Ouro");
  if (position.zone === "defesa" && appearances >= 28 && nextOverall >= 80 && leaguePosition <= 6) awards.push("Melhor Defensor");
  if (nextOverall >= 82 && appearances >= 28 && awardRoll > 0.45) awards.push(`Seleção do ${leagueLabel} — ${position.name}`);
  if (nextOverall >= 86 && appearances >= 30 && leaguePosition <= 3 && awardRoll > 0.58) awards.push(`Craque do ${leagueLabel}`);
  if (affected.age <= 23 && playsContinental === "libertadores" && nextOverall >= 82 && seeded(state.seed, state.season * 89) > 0.5) awards.push("Melhor Jovem da América");
  if (playsContinental === "libertadores" && continentalChampion && nextOverall >= 86 && seeded(state.seed, state.season * 97) > 0.38) awards.push("MVP da Libertadores");
  if (playsContinental === "libertadores" && continentalChampion && nextOverall >= 89 && seeded(state.seed, state.season * 101) > 0.7) awards.push("Rei da América");
  if (inEurope && affected.age <= 21 && nextOverall >= 80 && appearances >= 18 && seeded(state.seed, state.season * 167) > 0.55) awards.push("Golden Boy");
  if (inEurope && affected.age <= 21 && playsContinental && nextOverall >= 82 && seeded(state.seed, state.season * 173) > 0.65) awards.push("Troféu Kopa");
  if (inEurope && isKeeper && cleanSheets >= 16 && nextOverall >= 85 && seeded(state.seed, state.season * 179) > 0.7) awards.push("Troféu Yashin");
  if (inEurope && !isKeeper && goals >= 22 && league.prestige >= 4 && seeded(state.seed, state.season * 181) > 0.65) awards.push("Chuteira de Ouro Europeia");
  if (inEurope && playsContinental === "champions" && continentalChampion && nextOverall >= 88 && seeded(state.seed, state.season * 191) > 0.55) awards.push("Melhor da UEFA");
  if (!isKeeper && goals >= 8 && nextOverall >= 82 && seeded(state.seed, state.season * 103) > 0.94) awards.push("Prêmio Puskás");
  if (affected.leadership >= 82 && seeded(state.seed, state.season * 107) > 0.82) awards.push("Prêmio Fair Play");
  if (affected.fanSupport >= 92 && titleCount > 0) awards.push("Ídolo da Torcida");
  const majorClubTitle = mundialChampion || (inEurope && playsContinental === "champions" && continentalChampion);
  if (majorClubTitle && nextOverall >= 93 && affected.reputation >= 90 && seeded(state.seed, state.season * 109) > 0.9) awards.push("Bola de Ouro");
  const title = titleCount > 0;
  const seasonObjective = affected.currentObjective ?? createSeasonObjective(position, seasonRole, affected.season, affected.seed);
  const objectiveResult = evaluateObjective(seasonObjective, seasonStats, titleCount);
  const trustDelta =
    (objectiveResult.completed ? seasonObjective.reward : -seasonObjective.penalty) +
    (appearances >= 28 ? 4 : appearances < 12 ? -5 : 0) +
    titleCount * 3 +
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

  const record: SeasonRecord = { ...seasonStats, age: affected.age, season: affected.season, clubId: club.id, overall: nextOverall, title, eventTitle: event.title, competitions, awards, squadRole: seasonRole, objectiveResult };
  const result: SeasonResult = {
    ...record,
    resultText,
    development,
    performanceScore,
    europeanSpotlight,
    europeanDevelopmentBonus,
    breakoutBonus,
    marketValue: marketValue(nextOverall, nextAge, club, affected.reputation, seasonStats),
    calledUp,
    twist,
    nationalNote,
  };
  const seenEvents = event.oneTime || event.id === FIRST_MATCH_EVENT.id ? Array.from(new Set([...affected.seenEvents, event.id])) : affected.seenEvents;
  const nextCabinet = { ...affected.trophyCabinet };
  competitions.forEach((competition) => { if (competition.champion) nextCabinet[competition.id] += 1; });
  const wonContinentalForWorld = continentalChampion && (playsContinental === "libertadores" || playsContinental === "champions" || playsContinental === "concacaf");
  const nextWorldQualifiedSeason = wonContinentalForWorld ? affected.season + 1 : affected.worldQualifiedSeason === affected.season ? 0 : affected.worldQualifiedSeason;
  const nextWorldQualifiedClubId = wonContinentalForWorld ? club.id : affected.worldQualifiedSeason === affected.season ? "" : affected.worldQualifiedClubId;
  const nextAwardCabinet = { ...affected.awardCabinet };
  awards.forEach((award) => { nextAwardCabinet[award] = (nextAwardCabinet[award] ?? 0) + 1; });
  const clubConfed = clubConfederation(club);
  const nextContinentalSlot: ContinentalSlot | null = clubConfed === "SOUTH_AMERICA"
    ? (leagueChampion || cupChampion || leaguePosition <= 6 ? "libertadores" : null)
    : clubConfed === "NORTH_AMERICA"
      ? (leagueChampion || leaguePosition <= (league.championsPlaces || 4) ? "concacaf" : null)
      : (leagueChampion || leaguePosition <= league.championsPlaces
          ? "champions"
          : cupChampion || leaguePosition <= league.europaPlaces
            ? "europa"
            : leaguePosition <= league.conferencePlaces
              ? "conference"
              : null);
  const nextBase: GameState = {
    ...affected,
    phase: "consequence",
    age: nextAge,
    season: affected.season + 1,
    overall: nextOverall,
    fitness: clamp(affected.fitness + 14 - Math.max(0, appearances - 28) + twistFitness),
    morale: clamp(affected.morale + titleCount * 8 + twistMorale),
    reputation: clamp(affected.reputation + Math.round(appearances / 12) + titleCount * 7 + europeanSpotlight + breakoutBonus * 2),
    fanSupport: clamp(affected.fanSupport + titleCount * 13 + Math.round(appearances / 14) + breakoutBonus * 2),
    managerTrust: nextTrust,
    discipline: nextDiscipline,
    suspensionMatches: redCards * 2 + (yellowCards >= 8 ? 2 : yellowCards >= 5 ? 1 : 0),
    squadRole: nextRole,
    contractYears: Math.max(0, affected.contractYears - 1),
    money: affected.money + affected.annualSalary,
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
    worldQualifiedSeason: nextWorldQualifiedSeason,
    worldQualifiedClubId: nextWorldQualifiedClubId,
    adaptation: abroad ? clamp(affected.adaptation + 10, 0, 100) : 100,
    abroadSeasons: abroad ? affected.abroadSeasons + 1 : 0,
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
    retireAfterSeason: Boolean(effect.retire || nextAge >= 40),
    seenEvents,
    nextEventId: "",
    renewalDenied,
    nationalitySwitched: affected.nationalitySwitched || Boolean(nationalitySwitchRecord),
    pendingNationalitySwitchTarget: "",
  };
  const wantsDomesticReturn = event.id === "european-exit" || event.id === "return-home" || event.id === "mega-empresta-para-time-menor";
  let transferOffers = effect.transfer || nextBase.contractYears === 0
    ? selectTransferOffers(nextBase, affected.season * 43, { includeForeign: !wantsDomesticReturn, forceDomestic: wantsDomesticReturn, forceForeign: effect.transferAbroad })
    : [];
  if (effect.transfer && event.id === "return-home" && nextBase.academyClubId) {
    transferOffers = [nextBase.academyClubId, ...transferOffers.filter((clubId) => clubId !== nextBase.academyClubId)].slice(0, 5);
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
  });
  const achievementCandidates = getUnlockedAchievements({
    appearances: nextBase.stats.appearances,
    goals: nextBase.stats.goals,
    assists: nextBase.stats.assists,
    cleanSheets: nextBase.stats.cleanSheets,
    trophies: nextBase.trophies + nextBase.nationalTrophies,
    continentalTitles: nextBase.trophyCabinet.libertadores + nextBase.trophyCabinet.championsLeague + nextBase.trophyCabinet.europaLeague + nextBase.trophyCabinet.conferenceLeague + nextBase.trophyCabinet.concacafChampions,
    worldTitles: nextBase.trophyCabinet.mundial,
    nationalCaps: nextBase.nationalCaps,
    nationalTrophies: nextBase.nationalTrophies,
    ballonDor: nextBase.awardCabinet["Bola de Ouro"] ?? 0,
    clubsPlayed: new Set(nextBase.history.map((item) => item.clubId)).size,
    seasonsAbroad: nextBase.history.filter((item) => isAbroad(clubById(item.clubId))).length,
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
  const nationalitySwitchTarget = maybeOfferNationalitySwitch(nextBase, affected.season * 71);
  return {
    ...nextBase,
    nextEventId: nationalitySwitchTarget ? NATIONALITY_SWITCH_EVENT_ID : selectNextEvent(nextBase, affected.season * 37),
    pendingNationalitySwitchTarget: nationalitySwitchTarget ?? "",
    nationalitySwitchInviteUsed: nextBase.nationalitySwitchInviteUsed || Boolean(nationalitySwitchTarget),
    transferOffers,
    legacyPoints,
    unlockedAchievements: [...nextBase.unlockedAchievements, ...newlyUnlocked.map((achievement) => achievement.id)],
    newsFeed: [...achievementNews, seasonHeadline, ...nextBase.newsFeed].slice(0, 16),
  };
}

function ClubBadge({ club, size = "md" }: { club: Club; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={`club-badge club-badge-${size}`}
      style={{ "--club-primary": club.primary, "--club-secondary": club.secondary } as CSSProperties}
      aria-hidden="true"
    >
      <span>{club.abbr}</span>
    </span>
  );
}

function NationBadge({ country, size = "md" }: { country: Country; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={`nation-badge nation-badge-${size}`}
      style={{ "--nation-primary": country.primary, "--nation-secondary": country.secondary } as CSSProperties}
      aria-hidden="true"
    >
      <span>{country.abbr}</span>
    </span>
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
  const [hasSave, setHasSave] = useState(false);
  const [youthStep, setYouthStep] = useState(0);
  const [youthFinished, setYouthFinished] = useState(false);
  const [activeTab, setActiveTab] = useState<"event" | "history" | "profile" | "legacy">("event");
  const [toast, setToast] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { version?: number; phase?: Phase };
        if (parsed.version && parsed.version >= 1 && parsed.version <= 5) {
          queueMicrotask(() => setHasSave(parsed.phase !== "welcome"));
        }
      }
    } catch {
      localStorage.removeItem(SAVE_KEY);
    }
  }, []);

  useEffect(() => {
    if (game.phase === "welcome") return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
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
          ? { ...current, phase: current.retireAfterSeason ? "summary" : "season-result" }
          : current,
      );
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [game.phase]);

  const currentClub = useMemo(() => clubById(game.currentClubId || game.academyClubId), [game.currentClubId, game.academyClubId]);
  const nationCountry = useMemo(() => countryById(game.nationality), [game.nationality]);
  const position = useMemo(() => positionByKey(game.position), [game.position]);
  const supporterMood = useMemo(() => fanMood(game.fanSupport), [game.fanSupport]);
  const legacyStanding = useMemo(() => legacyTier(game.legacyPoints), [game.legacyPoints]);
  const marketProfile = useMemo(() => transferMarketProfile(game), [game]);
  const transferWindowProfile = useMemo(() => {
    const foreignOfferClubs = game.transferOffers.map(clubById).filter(isAbroad);
    const europeanOffers = foreignOfferClubs.filter(isEuropeanClub).length;
    const allForeignAreEurope = foreignOfferClubs.every((club) => clubConfederation(club) === "EUROPE");
    return {
      europeanOffers,
      brazilianOffers: game.transferOffers.filter((clubId) => clubById(clubId).countryId === "brasil").length,
      isEuropeanWindow: isEuropeanClub(currentClub) && europeanOffers > 0,
      foreignMarketLabel: allForeignAreEurope ? "MERCADO EUROPEU" : "MERCADO INTERNACIONAL",
      foreignMarketAdjective: allForeignAreEurope ? "europeu" : "internacional",
      expandedOfferCount: Math.max(0, game.transferOffers.length - 5),
    };
  }, [game.transferOffers, currentClub]);
  const currentEvent = useMemo(() => {
    if (game.currentEventId === FIRST_MATCH_EVENT.id) return FIRST_MATCH_EVENT;
    if (game.currentEventId === NATIONALITY_SWITCH_EVENT_ID && game.pendingNationalitySwitchTarget) {
      return buildNationalitySwitchEvent(countryById(game.nationality), countryById(game.pendingNationalitySwitchTarget));
    }
    return ALL_PRO_EVENTS.find((event) => event.id === game.currentEventId) ?? ALL_PRO_EVENTS[0];
  }, [game.currentEventId, game.nationality, game.pendingNationalitySwitchTarget]);
  const headerSeason = game.phase === "consequence" || game.phase === "season-result" ? game.lastResult?.season ?? game.season : game.season;
  const headerAge = game.phase === "consequence" || game.phase === "season-result" ? game.lastResult?.age ?? game.age : game.age;
  const nationalTierLabel: Record<NationalTier, string> = { none: "Fora dos planos", sub17: "Seleção Sub-17", sub20: "Seleção Sub-20", olympic: "Seleção Olímpica", main: "Seleção Principal" };

  function vibrate() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18);
  }

  function changeTab(tab: "event" | "history" | "profile" | "legacy") {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
    vibrate();
  }

  function startNew() {
    localStorage.removeItem(SAVE_KEY);
    setGame({ ...initialState(), phase: "identity", seed: Date.now() % 2147483647 });
    setHasSave(true);
    setActiveTab("event");
    vibrate();
  }

  function continueSave() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) setGame(normalizeSave(JSON.parse(saved)));
    } catch {
      startNew();
    }
  }

  function selectFormation(formationId: string) {
    const journey = createYouthJourney(game, formationId);
    setYouthStep(0);
    setYouthFinished(false);
    setGame((current) => ({
      ...current,
      phase: "youth",
      formationId,
      archetype: journey.formation.archetype,
      revealAge: journey.revealAge,
      youthScore: journey.score,
      youthYears: journey.youthYears,
      proOffers: journey.offers,
      age: journey.revealAge,
      season: current.season + journey.revealAge - 12,
      overall: journey.overall,
      potential: journey.potential,
      morale: clamp(68 + Math.round(journey.score / 4)),
      fitness: 94,
    }));
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
        newsFeed: [`${current.season}: primeiro contrato assinado com o ${club.shortName}.`],
      };
    });
    setActiveTab("event");
    vibrate();
  }

  function chooseEvent(choiceIndex: number) {
    const choice = currentEvent.choices[choiceIndex];
    if (!choice) return;
    setGame((current) => {
      if (!choice.luck) return simulateSeason(current, currentEvent, choice.effect, choice.label, choice.result);
      const succeeded = seeded(current.seed, current.season * 127 + choiceIndex * 17 + current.history.length) < choice.luck.chance / 100;
      const luckEffect = succeeded ? choice.luck.successEffect : choice.luck.failureEffect;
      return simulateSeason(
        current,
        currentEvent,
        mergeEffects(choice.effect, luckEffect),
        choice.label,
        succeeded ? choice.luck.successText : choice.luck.failureText,
        succeeded ? "success" : "failure",
      );
    });
    vibrate();
  }

  function continueAfterConsequence() {
    setGame((current) => ({ ...current, phase: current.retireAfterSeason ? "summary" : "season-result" }));
    vibrate();
  }

  function continueAfterResult() {
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
      }));
    }
    setActiveTab("event");
    vibrate();
  }

  function chooseTransfer(clubId: string | null) {
    setGame((current) => {
      if (!clubId && (current.transferRequested || current.renewalDenied)) return current;
      const newClub = clubId ? clubById(clubId) : null;
      const oldClub = clubById(current.currentClubId);
      const targetClub = newClub ?? oldClub;
      const targetLeague = leagueById(targetClub.leagueId);
      const offerIndex = Math.max(0, current.transferOffers.indexOf(clubId ?? ""));
      const signingContract = Boolean(newClub || current.contractYears === 0);
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
      const transferHeadline = rivalry
        ? pick(rivalry.headlines, current.seed, current.season)
        : genericTransferNews;
      const transferred: GameState = {
        ...current,
        phase: "career",
        currentClubId: clubId ?? current.currentClubId,
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

  async function shareCareer() {
    const text = `Minha carreira no Futbobo: ${game.name}, ${position.name} de ${nationCountry.name}, ${game.stats.appearances} jogos, ${game.stats.goals} gols, ${game.trophies + game.nationalTrophies} taça(s) e pico de ${Math.max(game.overall, ...game.history.map((item) => item.overall), 0)} OVR. Você faria melhor?`;
    try {
      if (navigator.share) await navigator.share({ title: "Minha carreira no Futbobo", text, url: window.location.href });
      else await navigator.clipboard.writeText(`${text} ${window.location.href}`);
      setToast("Carreira pronta para compartilhar");
    } catch {
      setToast("Compartilhamento cancelado");
    }
  }

  const shellClass = `app-shell app-shell-${game.phase}${game.phase === "welcome" ? " app-shell-welcome" : ""}`;

  return (
    <main className={shellClass}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      {toast && <div className="toast" role="status">{toast}</div>}

      {game.phase === "welcome" && (
        <section className="welcome-screen screen-enter">
          <div className="brand-lockup" aria-label="Futbobo">
            <span className="brand-ball">F</span>
            <span>FUTBOBO</span>
            <small>CARREIRA</small>
          </div>
          <div className="hero-pitch" aria-hidden="true">
            <div className="pitch-line pitch-center" />
            <div className="pitch-circle" />
            <div className="hero-player-card">
              <span>12</span>
              <div><strong>anos</strong><small>o começo de tudo</small></div>
            </div>
          </div>
          <div className="welcome-copy">
            <span className="eyebrow">SUA HISTÓRIA. SUAS ESCOLHAS.</span>
            <h1>Da base do Brasil à elite da Europa.</h1>
            <p>Comece aos 12, conquiste seu espaço e leve sua carreira do Brasileirão à Champions League e à Seleção.</p>
          </div>
          <div className="welcome-actions">
            <button className="primary-button" onClick={startNew}>Começar nova carreira <span>→</span></button>
            {hasSave && <button className="secondary-button" onClick={continueSave}>Continuar carreira salva</button>}
          </div>
          <div className="welcome-features">
            <span>◉ 58 clubes</span><span>✦ 12 posições</span><span>🏆 8 ligas</span><span>★ 10 seleções</span>
          </div>
        </section>
      )}

      {game.phase === "identity" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "welcome" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 1 DE 4</span><strong>Quem vai vestir a camisa?</strong></div>
            <div className="step-count">01</div>
          </header>
          <div className="setup-content">
            <div className="identity-card">
              <div className="academy-avatar"><span>{game.number}</span><small>{game.position}</small></div>
              <div><span>IDADE INICIAL</span><strong>12 ANOS</strong><small>O sonho começa agora</small></div>
            </div>
            <label className="field-label">Nome do jogador
              <input className="text-input" value={game.name} maxLength={18} placeholder="Como a torcida vai te chamar?" onChange={(event) => setGame((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <div className="two-fields">
              <label className="field-label">Camisa
                <input className="text-input" type="number" inputMode="numeric" min={1} max={99} value={game.number} onChange={(event) => setGame((current) => ({ ...current, number: clamp(Number(event.target.value) || 1, 1, 99) }))} />
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
                <button key={item.key} type="button" aria-pressed={game.position === item.key} className={`position-button ${game.position === item.key ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, position: item.key }))} style={{ "--position-color": item.color } as CSSProperties}>
                  <span>{item.icon}</span><strong>{item.key}</strong><small>{item.name}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="sticky-action"><button className="primary-button" disabled={!game.name.trim()} onClick={() => setGame((current) => ({ ...current, name: current.name.trim(), phase: "nationality" }))}>Escolher nacionalidade <span>→</span></button></div>
        </section>
      )}

      {game.phase === "nationality" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "identity" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 2 DE 4</span><strong>Por qual país você vai jogar?</strong></div>
            <div className="step-count">02</div>
          </header>
          <div className="setup-content">
            <div className="intro-card"><span className="intro-icon">◇</span><div><strong>Sua Seleção vai te acompanhar a carreira toda.</strong><p>A nacionalidade define a trilha de base (Sub-17, Sub-20, Olímpica) e se você disputará a Eurocopa, a Copa América ou a Copa Ouro com a Seleção principal.</p></div></div>
            <div className="nation-grid">
              {COUNTRIES.map((country) => (
                <button key={country.id} aria-pressed={game.nationality === country.id} className={`nation-choice ${game.nationality === country.id ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, nationality: country.id }))}>
                  <NationBadge country={country} size="md" />
                  <span><strong>{country.name}</strong><small>{country.confederation === "EUROPE" ? "Eurocopa" : country.confederation === "NORTH_AMERICA" ? "Copa Ouro" : "Copa América"}</small></span>
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
            <div><span>PASSO 3 DE 4</span><strong>Escolha sua base</strong></div>
            <div className="step-count">03</div>
          </header>
          <div className="setup-content">
            <div className="intro-card"><span className="intro-icon">⌂</span><div><strong>20 portas. Uma primeira camisa.</strong><p>A estrutura da base acelera seu desenvolvimento, mas toda escolha pode virar uma grande história.</p></div></div>
            <div className="club-grid">
              {DOMESTIC_CLUBS.map((club) => (
                <button key={club.id} className={`club-choice ${game.academyClubId === club.id ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, academyClubId: club.id }))}>
                  <ClubBadge club={club} size="md" />
                  <span><strong>{club.shortName}</strong><small>{club.city} · {club.state}</small></span>
                  <span className="academy-stars">{"★".repeat(club.academy ?? 3)}{"☆".repeat(5 - (club.academy ?? 3))}</span>
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
            <div><span>PASSO 4 DE 4</span><strong>Que jogador você será?</strong></div>
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

      {game.phase === "youth" && (
        <section className="youth-screen screen-enter">
          <div className="brand-mini"><span className="brand-ball">F</span> FUTBOBO</div>
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
          <div className="brand-mini"><span className="brand-ball">F</span> FUTBOBO</div>
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

          {game.phase === "career" && activeTab === "event" && (
            <div className="event-stage">
              <div className="market-strip"><span><small>MERCADO</small><strong>{game.transferCooldownSeason >= game.season ? "Pedido já feito nesta temporada" : "Quer mudar de camisa?"}</strong></span><button onClick={requestTransfer} disabled={game.transferCooldownSeason >= game.season}>⇄ Pedir transferência</button></div>
              {game.currentObjective && <div className="objective-card"><span>META DO TREINADOR</span><strong>{game.currentObjective.label}</strong><p>{game.currentObjective.description}</p><small>Recompensa: +{game.currentObjective.reward} confiança · Falha: −{game.currentObjective.penalty}</small></div>}
              <div className="event-art" data-icon={currentEvent.icon}><span className="event-tag">{currentEvent.tag}</span><div className="event-watermark">{currentEvent.icon}</div></div>
              <article className="event-card">
                <div className="event-heading"><span>{game.currentEventId === "debut" ? "PRIMEIRO CAPÍTULO" : `TEMPORADA ${game.season}`}</span><h1>{currentEvent.title}</h1><p>{currentEvent.description}</p></div>
                <div className="choice-list">
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
                <button className="primary-button" onClick={continueAfterConsequence}>{game.retireAfterSeason ? "Ver o fim da carreira" : "Ver resultado da temporada"} <span>→</span></button>
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
              <div className="discipline-result"><span>DISCIPLINA</span><strong>{game.lastResult.yellowCards} amarelos · {game.lastResult.redCards} vermelhos</strong></div>
              {game.lastResult.objectiveResult && <div className={`objective-result ${game.lastResult.objectiveResult.completed ? "completed" : "failed"}`}><span>{game.lastResult.objectiveResult.completed ? "META CUMPRIDA" : "META PERDIDA"}</span><strong>{game.lastResult.objectiveResult.label}</strong><p>{game.lastResult.objectiveResult.text}</p></div>}
              {game.contractYears === 0 && (
                <div className="contract-expired">
                  <span>CONTRATO ENCERRADO</span>
                  <strong>{game.renewalDenied ? "O clube optou por não renovar" : "Seu futuro está aberto"}</strong>
                  <p>{game.renewalDenied ? "Depois de uma temporada difícil, a diretoria decidiu não seguir com você. Na próxima tela você precisa escolher um novo clube." : "Na próxima tela você poderá renovar ou escolher um novo clube."}</p>
                </div>
              )}
              <div className="competition-grid">
                {game.lastResult.competitions.map((competition) => <article key={competition.id} className={competition.champion ? "competition-card champion" : "competition-card"}><span>{competition.icon}</span><div><strong>{competition.name}</strong><small>{competition.stage}</small></div>{competition.champion && <b>★</b>}</article>)}
              </div>
              {game.lastResult.twist && <div className={`season-twist ${game.lastResult.twist.includes("improvável") ? "positive" : "negative"}`}><span>O IMPREVISTO DA TEMPORADA</span><p>{game.lastResult.twist}</p></div>}
              {game.lastResult.nationalNote && <div className="season-national-note"><NationBadge country={nationCountry} size="sm" /><p>{game.lastResult.nationalNote}</p></div>}
              {game.lastResult.awards.length > 0 && <div className="season-awards">{game.lastResult.awards.map((award) => <span key={award}>✦ {award}</span>)}</div>}
              <div className="result-details"><span>Valor de mercado <strong>{formatMoney(game.lastResult.marketValue)}</strong></span>{game.lastResult.calledUp && <span className="callup-badge">★ Convocado pela Seleção</span>}</div>
              <div className="mobile-action-dock">
                <button className="primary-button" onClick={continueAfterResult}>{game.transferOffers.length ? "Abrir janela de transferências" : "Próxima temporada"} <span>→</span></button>
              </div>
            </div>
          )}

          {game.phase === "transfer" && (
            <div className="transfer-stage screen-enter">
              <span className="eyebrow">JANELA DE TRANSFERÊNCIAS</span><h1>{game.transferStatus?.success ? game.transferStatus.headline : game.renewalDenied ? "Sem renovação — hora de escolher" : "Seu próximo passo"}</h1><p>{game.transferStatus?.text ?? (game.renewalDenied ? `O ${currentClub.shortName} não renovou seu contrato. ${game.transferOffers.length} clube${game.transferOffers.length > 1 ? "s apareceram" : " apareceu"} com propostas.` : `${game.transferOffers.length} clubes chegaram com projetos diferentes. Você também pode ficar e construir seu nome aqui.`)}</p>
              {game.renewalDenied && <div className="transfer-lock-card"><span>RENOVAÇÃO RECUSADA</span><strong>O {currentClub.shortName} decidiu não renovar seu contrato</strong><p>A diretoria avaliou a temporada e optou por não seguir com você. Escolha seu próximo destino.</p></div>}
              {game.transferRequested && <div className="transfer-lock-card"><span>SAÍDA SEM VOLTA</span><strong>Escolha seu próximo clube</strong><p>Depois que a diretoria aceita seu pedido, permanecer no time atual deixa de ser uma opção.</p></div>}
              {transferWindowProfile.isEuropeanWindow && <div className="european-market-card"><span>{transferWindowProfile.foreignMarketLabel}</span><strong>{transferWindowProfile.europeanOffers} clube{transferWindowProfile.europeanOffers > 1 ? `s ${transferWindowProfile.foreignMarketAdjective}s querem` : ` ${transferWindowProfile.foreignMarketAdjective} quer`} você</strong><p>{transferWindowProfile.brazilianOffers > 0 ? "Uma proposta rara de retorno ao Brasil também apareceu." : `Jogando fora do Brasil, seu empresário prioriza projetos ${transferWindowProfile.foreignMarketAdjective}s de nível compatível.`}</p></div>}
              {transferWindowProfile.expandedOfferCount > 0 && <div className="market-expansion-card"><span>DESEMPENHO ABRIU PORTAS</span><strong>{marketProfile.label} · nota {marketProfile.performanceScore}</strong><p>{transferWindowProfile.expandedOfferCount} clube{transferWindowProfile.expandedOfferCount > 1 ? "s extras apareceram" : " extra apareceu"} em um nível compatível com sua fase.</p></div>}
              <div className="offer-list transfer-offers">
                {game.transferOffers.map((clubId, index) => {
                  const club = clubById(clubId);
                  const league = leagueById(club.leagueId);
                  const changesCountry = club.countryId !== currentClub.countryId;
                  const offerContract = createContract(game.overall, game.age, club, game.seed + game.season + index);
                  const offerRole = calculateSquadRole(game.overall, club, league.prestige, 50, game.age);
                  const rivalry = findRivalry(currentClub.id, club.id);
                  const rareBrazilReturn = isEuropeanClub(currentClub) && club.countryId === "brasil" && transferWindowProfile.europeanOffers > 0;
                  return (
                    <button className="offer-card" key={clubId} onClick={() => chooseTransfer(clubId)}>
                      <ClubBadge club={club} />
                      <span>
                        <small>{rareBrazilReturn ? "RETORNO IMPROVÁVEL" : index >= 5 ? "DESTAQUE ABRIU ESTA PORTA" : index === 0 ? "MAIS PRESTÍGIO" : index === 1 ? "PROJETO DE TITULAR" : "NOVOS ARES"}</small>
                        <strong>{club.shortName}</strong>
                        <em>{club.city} · {league.name} · reputação {club.reputation}/5</em>
                        <em className="offer-contract">{ROLE_LABELS[offerRole]} · {offerContract.years} anos · {formatMoney(offerContract.annualSalary)}/ano</em>
                        <em className="offer-market-value">Valor estimado na liga: {formatMoney(marketValue(game.overall, game.age, club, game.reputation, game.lastResult ?? undefined))}</em>
                        {rivalry && <em className="offer-rivalry">⚔ Transferência explosiva: {rivalry.nickname}</em>}
                        {rareBrazilReturn ? <em className="offer-homecoming-tag">⌂ Retorno raro ao Brasil — oportunidade inesperada</em> : changesCountry && <em className="offer-abroad-tag">◇ Novo país — uma fase de adaptação começa</em>}
                      </span>
                      <b>→</b>
                    </button>
                  );
                })}
                {!game.transferRequested && !game.renewalDenied && <button className="offer-card stay-card" onClick={() => chooseTransfer(null)}><ClubBadge club={currentClub} /><span><small>{game.contractYears === 0 ? "PROPOSTA DE RENOVAÇÃO" : "CONTINUAR O PROJETO"}</small><strong>{game.contractYears === 0 ? `Renovar com o ${currentClub.shortName}` : `Ficar no ${currentClub.shortName}`}</strong><em>{game.contractYears === 0 ? "Novo vínculo e salário recalculado" : `Manter o contrato atual de ${game.contractYears} ano(s)`}</em></span><b>✓</b></button>}
              </div>
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
                {[...game.history].reverse().map((record) => { const club = clubById(record.clubId); const titles = record.competitions.filter((competition) => competition.champion); return <article className="timeline-row" key={`${record.season}-${record.clubId}`}><span className="timeline-year">{record.season}</span><ClubBadge club={club} size="sm" /><div><strong>{club.shortName}</strong><small>{record.appearances}J · {game.position === "GOL" ? `${record.cleanSheets}SG` : `${record.goals}G · ${record.assists}A`}</small>{titles.length > 0 && <em>{titles.map((title) => title.icon).join(" · ")}</em>}</div><span className="timeline-ovr">{record.overall}</span>{record.title && <span className="timeline-trophy">🏆</span>}</article>; })}
              </div>
            </div>
          )}

          {activeTab === "profile" && game.phase === "career" && (
            <div className="panel-screen screen-enter">
              <div className="profile-hero"><div className="academy-avatar"><span>{game.number}</span><small>{game.position}</small></div><div><span>{game.archetype}</span><h2>{game.name}</h2><p>{position.style} · {game.foot}</p></div></div>
              <div className="profile-metrics"><Metric label="OVR" value={game.overall} tone="gold" /><Metric label="Momento" value={careerTrend(game.history)} /><Metric label="Valor" value={formatMoney(marketValue(game.overall, game.age, currentClub, game.reputation, game.history.at(-1)))} /></div>
              <div className="market-context"><span>{currentClub.countryId === "brasil" ? "MERCADO BRASILEIRO" : "MERCADO INTERNACIONAL"}</span><p>{currentClub.countryId === "brasil" ? "O mesmo jogador costuma valer menos no Brasil. Uma ida à Europa pode multiplicar sua cotação — e também a cobrança." : `${leagueById(currentClub.leagueId).name} amplia sua vitrine e o valor do seu passe.`}</p></div>
              <div className="contract-card"><span>CONTRATO E ELENCO</span><div><strong>{ROLE_LABELS[game.squadRole]}{game.clubCaptain ? " · Capitão" : ""}</strong><small>{game.contractYears ? `${game.contractYears} ano(s) restantes` : "Contrato encerrado"} · {formatMoney(game.annualSalary)}/ano</small></div><Progress label="Confiança do treinador" value={game.managerTrust} color="#a675ff" /></div>
              <div className="supporter-card"><span>RELAÇÃO COM A TORCIDA</span><strong style={{ color: supporterMood.color }}>{supporterMood.label}</strong><p>{game.fanSupport < 38 ? "Cada toque pode virar vaia. Títulos e entrega reconquistam a arquibancada." : game.fanSupport >= 82 ? "Seu nome já faz parte da identidade do clube." : "A arquibancada ainda está decidindo que história contará sobre você."}</p></div>
              <div className="attribute-card">
                <Progress label="Moral" value={game.morale} color="#2ca8ff" />
                <Progress label="Condição" value={game.fitness} color="#63e36b" />
                <Progress label="Prestígio" value={game.reputation} color="#ffc72c" />
                <Progress label="Liderança" value={game.leadership} color="#a675ff" />
                <Progress label="Seleção" value={game.nationalLevel} color="#f5f7f2" />
                <Progress label="Torcida" value={game.fanSupport} color={supporterMood.color} />
                <Progress label="Disciplina" value={game.discipline} color={game.discipline < 45 ? "#ff5a4e" : "#63e36b"} />
                {isAbroad(currentClub) && <Progress label="Adaptação" value={game.adaptation} color="#2ca8ff" />}
              </div>
              <div className="career-total-card"><span>TOTAIS DA CARREIRA</span><div><Metric label="Jogos" value={game.stats.appearances} /><Metric label={game.position === "GOL" ? "Sem sofrer" : "Gols"} value={game.position === "GOL" ? game.stats.cleanSheets : game.stats.goals} /><Metric label={game.position === "GOL" ? "Sofridos" : "Assistências"} value={game.position === "GOL" ? game.stats.goalsConceded : game.stats.assists} /><Metric label="Taças" value={game.trophies + game.nationalTrophies} tone="gold" /></div></div>
              <div className="trophy-cabinet">
                <span>SALA DE TROFÉUS</span>
                <div>
                  <Metric label="Ligas nacionais" value={game.trophyCabinet.domesticLeague} tone="gold" />
                  <Metric label="Copas nacionais" value={game.trophyCabinet.domesticCup} />
                  <Metric label="Libertadores" value={game.trophyCabinet.libertadores} tone="gold" />
                  <Metric label="Mundial" value={game.trophyCabinet.mundial} tone="green" />
                  {game.trophyCabinet.championsLeague > 0 && <Metric label="Champions" value={game.trophyCabinet.championsLeague} tone="gold" />}
                  {game.trophyCabinet.europaLeague > 0 && <Metric label="Europa League" value={game.trophyCabinet.europaLeague} />}
                  {game.trophyCabinet.conferenceLeague > 0 && <Metric label="Conference" value={game.trophyCabinet.conferenceLeague} />}
                  {game.trophyCabinet.concacafChampions > 0 && <Metric label="Concacaf" value={game.trophyCabinet.concacafChampions} />}
                </div>
                <small>✦ {game.awards} prêmio(s) individual(is)</small>
              </div>
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
                <span>PRÊMIOS INDIVIDUAIS</span>
                {Object.keys(game.awardCabinet).length === 0 ? (
                  <p>Os prêmios agora são raros. Quando um vier, vai significar alguma coisa.</p>
                ) : (
                  <div>{Object.entries(game.awardCabinet).sort((a, b) => b[1] - a[1]).map(([award, count]) => <article className={award === "Bola de Ouro" ? "legendary" : ""} key={award}><span>{award === "Bola de Ouro" ? "◉" : "✦"}</span><strong>{award}</strong><b>{count}×</b></article>)}</div>
                )}
              </div>
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
                    return <article className={`${unlocked ? "unlocked" : ""} rarity-${achievement.rarity}`} key={achievement.id}><b>{unlocked ? achievement.icon : "?"}</b><div><strong>{unlocked ? achievement.title : "Conquista secreta"}</strong><small>{unlocked ? achievement.description : `${achievement.rarity} · continue jogando para descobrir`}</small></div></article>;
                  })}
                </section>
              </div>
            </div>
          )}

          {game.phase === "career" && (
            <nav className="bottom-nav" aria-label="Navegação da carreira">
              <button aria-pressed={activeTab === "event"} className={activeTab === "event" ? "selected" : ""} onClick={() => changeTab("event")}><span>◆</span>Carreira</button>
              <button aria-pressed={activeTab === "history"} className={activeTab === "history" ? "selected" : ""} onClick={() => changeTab("history")}><span>≡</span>Histórico</button>
              <button aria-pressed={activeTab === "profile"} className={activeTab === "profile" ? "selected" : ""} onClick={() => changeTab("profile")}><span>●</span>Jogador</button>
              <button aria-pressed={activeTab === "legacy"} className={activeTab === "legacy" ? "selected" : ""} onClick={() => changeTab("legacy")}><span>★</span>Legado</button>
            </nav>
          )}
        </section>
      )}

      {game.phase === "summary" && (
        <section className="summary-screen screen-enter">
          <div className="summary-confetti" aria-hidden="true">✦ · ★ · ✦ · ★ · ✦</div>
          <span className="eyebrow">CARREIRA FINALIZADA</span>
          <h1>Uma história que só você viveu.</h1>
          <div className="share-card">
            <div className="share-brand"><span className="brand-ball">F</span><strong>FUTBOBO</strong><small>MINHA CARREIRA</small></div>
            <div className="share-player"><ClubBadge club={currentClub} size="lg" /><div><span>{game.archetype}</span><h2>{game.name}</h2><p>#{game.number} · {position.name} · {nationCountry.abbr}</p></div><strong>{Math.max(game.overall, ...game.history.map((item) => item.overall), 0)}<small>PICO OVR</small></strong></div>
            <div className="share-numbers"><Metric label="Jogos" value={game.stats.appearances} /><Metric label={game.position === "GOL" ? "Sem sofrer" : "Gols"} value={game.position === "GOL" ? game.stats.cleanSheets : game.stats.goals} /><Metric label={game.position === "GOL" ? "Sofridos" : "Assistências"} value={game.position === "GOL" ? game.stats.goalsConceded : game.stats.assists} /><Metric label="Taças" value={game.trophies + game.nationalTrophies} tone="gold" /></div>
            <div className="share-legacy-line"><span>LEGADO {game.legacyPoints}</span><strong>{legacyStanding.label}</strong><span>{game.unlockedAchievements.length}/{ACHIEVEMENTS.length} CONQUISTAS</span></div>
            <div className="share-trophies"><span>LIGA {game.trophyCabinet.domesticLeague}</span><span>COPA {game.trophyCabinet.domesticCup}</span><span>LIB {game.trophyCabinet.libertadores}</span><span>MUN {game.trophyCabinet.mundial}</span><span>UCL {game.trophyCabinet.championsLeague}</span><span>SEL {game.nationalTrophies}</span></div>
            <div className="share-path"><span>12</span><div />{Array.from(new Set(game.history.map((item) => item.clubId))).map((clubId) => <ClubBadge key={clubId} club={clubById(clubId)} size="sm" />)}<div /><span>{game.age}</span></div>
            <small className="share-url">erereck.github.io/futbobo</small>
          </div>
          <div className="summary-actions"><button className="primary-button" onClick={shareCareer}>Compartilhar carreira <span>↗</span></button><button className="secondary-button" onClick={startNew}>Jogar novamente</button></div>
        </section>
      )}
    </main>
  );
}

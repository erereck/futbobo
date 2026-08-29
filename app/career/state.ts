import { CLUBS, COUNTRIES, FIRST_MATCH_EVENT, PRO_EVENTS } from "../game-data";
import type { ContinentalSlot, PositionKey } from "../game-data";
import { createSeasonObjective, legacyTier } from "../career-systems";
import { MEGA_EVENTS } from "../mega-expansion";
import { CAREER_DRAMA_EVENTS } from "../career-drama";
import { BACKSTAGE_EVENTS } from "../backstage-saga";
import { FUTBOBO_MOMENTS } from "../futbobo-moments";
import { DEFAULT_PLAYER_APPEARANCE, normalizePlayerAppearance, randomPlayerAppearance } from "../player-appearance";
import { GOALKEEPER_EVENTS } from "../goalkeeper-events";
import { CLUB_SPECIFIC_EVENTS } from "./club-specific-events";
import type { AttributeKey, AwardPresentation, CareerHallEntry, CareerRival, CompetitionId, CustomCharacter, CustomClubDefinition, GameState, MonteCarloReport, PendingBotaoMatch, PlayerAttributes, PlayerStats, SeasonRecord, SpecialTraitId, StoredBotaoResult } from "./model";
import { positionByKey } from "./academy";
import { competitiveStrength } from "./performance";
import { clamp, clubById, pick, seeded } from "./shared";
import { emptyWorldPlayerUniverse, normalizeWorldPlayerUniverse } from "./world-players";
import { applyNationalBotaoProduction } from "./botao-production";

export function awardPresentation(award: string): AwardPresentation {
  if (award === "Bola de Ouro") return { icon: "◉", tier: "legendary", kicker: "MAIOR PRÊMIO DO FUTEBOL", description: "Você foi eleito o melhor jogador do mundo." };
  if (award.includes("UEFA") || award.includes("Champions") || award === "Rei da América" || award.includes("Mundial")) {
    return { icon: "♛", tier: "elite", kicker: "PRÊMIO CONTINENTAL", description: "Uma temporada que atravessou fronteiras." };
  }
  if (award.includes("Golden Boy") || award.includes("Kopa") || award.includes("Jovem") || award.includes("Revelação")) {
    return { icon: "★", tier: "elite", kicker: "TALENTO GERACIONAL", description: "Seu nome liderou a nova geração." };
  }
  if (award.includes("Artilheiro") || award.includes("Chuteira")) return { icon: "◎", tier: "regular", kicker: "DESTAQUE OFENSIVO", description: "Ninguém marcou mais que você." };
  if (award.includes("Assistências") || award.includes("Meio-Campista")) return { icon: "✦", tier: "regular", kicker: "MESTRE DA CRIAÇÃO", description: "A temporada passou pelos seus pés." };
  if (award.includes("Yashin") || award.includes("Luva") || award.includes("Goleiro") || award.includes("Muralha")) return { icon: "◆", tier: "elite", kicker: "PAREDE DA TEMPORADA", description: "Você dominou a área e decidiu jogos." };
  if (award.includes("Defensor")) return { icon: "⬡", tier: "regular", kicker: "PILAR DEFENSIVO", description: "Sua segurança mudou o nível da equipe." };
  if (award.includes("Puskás")) return { icon: "↗", tier: "elite", kicker: "GOL DO ANO", description: "Um lance para ser lembrado por décadas." };
  if (award.includes("Jogador do Ano") || award.includes("Craque") || award.includes("MVP") || award.includes("FIFPRO")) {
    return { icon: "✪", tier: "elite", kicker: "TEMPORADA CONSAGRADORA", description: "Você foi o rosto da competição." };
  }
  return { icon: "✦", tier: "regular", kicker: "PRÊMIO INDIVIDUAL", description: "Seu desempenho recebeu reconhecimento." };
}

export function awardTierWeight(award: string) {
  const tier = awardPresentation(award).tier;
  return tier === "legendary" ? 3 : tier === "elite" ? 2 : 1;
}

declare global {
  interface Window {
    __FUTBOBO_MONTE_CARLO__?: (runs: number, seedBase?: number) => MonteCarloReport;
  }
}

export const SAVE_KEY = "futbobo:career:v1";

export const CHALLENGE_SAVE_KEY = "futbobo:challenge-save:v1";

export const CHALLENGE_RESULTS_KEY = "futbobo:challenge-results:v1";

export const HALL_OF_FAME_KEY = "futbobo:hall-of-fame:v1";

export const SETTINGS_KEY = "futbobo:settings:v1";

export const BOTAO_IN_PROGRESS_KEY = "futbobo:botao-in-progress:v1";

export const BALLON_DOR_EXCLUDED_TROPHIES = new Set<CompetitionId>([
  "domesticCup",
  "domesticSuperCup",
  "recopaSudamericana",
  "uefaSuperCup",
  "campeonesCup",
]);

function canonicalCompetitionName(id: string, currentName: string) {
  if (id === "libertadores") return "CONMEBOL Libertadores";
  if (id === "sudamericana") return "CONMEBOL Sudamericana";
  return currentName;
}

function normalizePendingBotaoMatch(match: PendingBotaoMatch): PendingBotaoMatch {
  return {
    ...match,
    competitionName: canonicalCompetitionName(match.competitionId, match.competitionName),
  };
}

function normalizeStoredBotaoResult(stored: StoredBotaoResult): StoredBotaoResult {
  return {
    ...stored,
    match: normalizePendingBotaoMatch(stored.match),
  };
}

export function dateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function stableSeed(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 2147483647 || 20260728;
}

export function dailyChallenge(now = new Date()) {
  const date = dateKey(now);
  return {
    date,
    id: `FB-${date.replaceAll("-", "")}`,
    seed: stableSeed(`futbobo-desafio-${date}`),
  };
}

export const ORIGINAL_CLUB_PRESENTATION = new Map(
  CLUBS.map((club) => [club.id, {
    name: club.name,
    shortName: club.shortName,
    abbr: club.abbr,
    primary: club.primary,
    secondary: club.secondary,
    customBadge: club.customBadge,
  }]),
);

export function applyCustomClubDefinitions(definitions: CustomClubDefinition[]) {
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

export const RANDOM_NAME_FIRST_PART = [
  "Lionel", "Rayan", "Enzo", "Thiago", "Neyvan", "Kaoru", "Joanderson", "Lauta", "Marlon", "Kenji", "Noah", "Zico", "Mateus", "Santi", "Davi", "Keirrison", "Rivaldo", "Gael", "Axl", "Juninho",
  "Akira", "Amadou", "Breno", "Caíque", "Dante", "Elias", "Fabrizio", "Gohan", "Hiro", "Ibrahim", "Jamal", "Kauã", "Lorenzo", "Malik", "Nicolás", "Orlando", "Pablo", "Quim", "Rael", "Tobias",
  "Ubiratan", "Vinícius", "Wesley", "Yuri", "Zayan", "Ademir", "Biel", "Cássio", "Denzel", "Eren", "Falcão", "Gianni", "Héctor", "Ismael", "Jorginho", "Kylian", "Leandro", "Mamadou", "Nando", "Ousmane",
  "Pedrinho", "Ravi", "Shinji", "Talles", "Umberto", "Vitorino", "Wellington", "Xande", "Yago", "Zinedino", "Apollo", "Baltazar", "Cristiano", "Dieguito", "Endrickson", "Franz", "Gustavinho", "Habib", "Ícaro", "Júnior",
];

export const RANDOM_NAME_LAST_PART = [
  "Kishimoto", "Ferreyra", "Montiel", "da Colina", "Okafor", "Sakamoto", "Bensaid", "van Bronze", "do Valle", "Moretti", "Zanetti", "Nakamura", "Pereirinha", "Alcazar", "Matsubara", "de la Vega", "dos Pampas", "Silveirinha", "Kronberg", "Batistuta Jr",
  "Aboubakar", "Bellandi", "Carvalhoso", "Dembélé dos Reis", "Escobar", "Fujimoto", "Gonçalvinho", "Haalanderson", "Ibrahimović da Silva", "Jabuti", "Keïta", "Lombardi", "Menezes Jr", "N'Dour", "Onizuka", "Pachecão", "Quaresma Neto", "Rossi", "Starling", "Tsubasa",
  "Ueda", "Valderrama Jr", "Watanabe", "Ximenes", "Yamamoto", "Zagallo Neto", "Antunes", "Beckenbauer da Costa", "Cavalcanti", "Delacroix", "El Fenómeno", "Figueiroa", "Gamarra", "Hernández", "Imperador", "Jardim", "Kovačić", "Lima-Lima", "Montenegro", "Nascimento",
  "Oliveirinha", "Puskás Filho", "Reis de Tóquio", "Santoro", "Torres do Norte", "Uribe", "van Helsing", "Wakabayashi", "Xavierson", "Yıldız", "Zé Europa", "Africano", "Baggio Filho", "Cruyff da Gama", "Drácula", "Eto'o Mineiro", "Futebolino", "Garrinchinha", "Honda Civic", "Inzaghi dos Santos",
];

export const ALL_PRO_EVENTS = [...PRO_EVENTS, ...MEGA_EVENTS, ...CAREER_DRAMA_EVENTS, ...BACKSTAGE_EVENTS, ...FUTBOBO_MOMENTS, ...GOALKEEPER_EVENTS, ...CLUB_SPECIFIC_EVENTS];

function eventIdCompatibleWithClub(eventId: string, clubId: string, fallback: string) {
  const event = ALL_PRO_EVENTS.find((candidate) => candidate.id === eventId);
  return event?.needsClubIds && !event.needsClubIds.includes(clubId) ? fallback : eventId;
}

export const FICTIONAL_FINALISTS = [
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

export const RIVAL_PROFILES: Array<{ name: string; position: PositionKey; nationality: string }> = [
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

export const SPECIAL_TRAITS: Record<SpecialTraitId, { icon: string; name: string; description: string; tone: "positive" | "volatile" }> = {
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

export const TRAITS_BY_POSITION: Record<PositionKey, SpecialTraitId[]> = {
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

export const EMPTY_STATS: PlayerStats = {
  appearances: 0,
  goals: 0,
  assists: 0,
  tackles: 0,
  cleanSheets: 0,
  goalsConceded: 0,
  yellowCards: 0,
  redCards: 0,
};

export const ATTRIBUTE_GROUPS: Array<{ label: string; keys: AttributeKey[] }> = [
  { label: "ATAQUE", keys: ["finishing", "longShots", "positioning", "composure"] },
  { label: "CRIAÇÃO", keys: ["passing", "vision", "crossing", "distribution"] },
  { label: "TÉCNICA", keys: ["dribbling", "firstTouch"] },
  { label: "FÍSICO", keys: ["pace", "acceleration", "strength", "stamina", "aerial"] },
  { label: "DEFESA", keys: ["marking", "tackling"] },
  { label: "GOLEIRO", keys: ["reflexes", "handling"] },
];

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
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

export const POSITION_PRIMARY_ATTRIBUTES: Record<PositionKey, AttributeKey[]> = {
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

export const ALL_ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_LABELS) as AttributeKey[];

export function attributeAverage(attributes: PlayerAttributes, keys: AttributeKey[]) {
  return keys.reduce((total, key) => total + attributes[key], 0) / Math.max(1, keys.length);
}

export function attributeTone(value: number) {
  if (value >= 85) return "#ffc72c";
  if (value >= 72) return "#63e36b";
  if (value >= 58) return "#2ca8ff";
  if (value >= 45) return "#f5f7f2";
  return "#ff8c5a";
}

export function createPlayerAttributes(positionKey: PositionKey, overall: number, seed: number): PlayerAttributes {
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

export function shiftPlayerAttributes(attributes: PlayerAttributes, amount: number, positionKey: PositionKey, seed: number): PlayerAttributes {
  if (!amount) return attributes;
  const primary = new Set(POSITION_PRIMARY_ATTRIBUTES[positionKey]);
  return Object.fromEntries(ALL_ATTRIBUTE_KEYS.map((key, index) => {
    const relevance = primary.has(key) ? 1 : 0.55;
    const variation = amount > 0 && seeded(seed, 1700 + index * 13) > 0.76 ? 1 : 0;
    const delta = Math.sign(amount) * Math.max(0, Math.round(Math.abs(amount) * relevance) + variation);
    return [key, clamp(attributes[key] + delta, 15, 99)];
  })) as PlayerAttributes;
}

export function evolvePlayerAttributes(
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

export function initialState(seedOverride?: number): GameState {
  const seed = seedOverride ?? Date.now() % 2147483647;
  return {
    version: 7,
    phase: "welcome",
    seed,
    name: "",
    number: 10,
    playerAppearance: DEFAULT_PLAYER_APPEARANCE,
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
      sudamericana: 0,
      recopaSudamericana: 0,
      mundial: 0,
      championsLeague: 0,
      uefaSuperCup: 0,
      europaLeague: 0,
      conferenceLeague: 0,
      concacafChampions: 0,
      afcChampions: 0,
      cafChampions: 0,
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
    transferMarketOffers: [],
    transferHistory: [],
    activeLoan: null,
    transferRequests: 0,
    transferCooldownSeason: 0,
    positionChangeCooldownSeason: 0,
    transferStatus: null,
    transferRequested: false,
    renewalDenied: false,
    forcedClubExit: false,
    youthLoanDecision: false,
    reducedOpportunitySeason: 0,
    forcedAlternativeTransfer: false,
    pendingTransferMode: "permanent",
    loanParentClubId: "",
    loanParentLeagueId: "",
    loanEndSeason: 0,
    isFreeAgent: false,
    freeAgentSinceSeason: 0,
    forcedFreeAgentUntilSeason: 0,
    corruptionGuaranteedSeason: 0,
    lastCycleShopSeason: 0,
    agentCountryFocus: "",
    betrayedClubIds: [],
    traits: [],
    rivals: [],
    worldPlayers: emptyWorldPlayerUniverse(seed, 2026),
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

export function normalizeSave(value: unknown): GameState {
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
  const lastTransferRecord = Array.isArray(saved.transferHistory) ? saved.transferHistory.at(-1) : undefined;
  const staleForcedLoanReturnMarket = Boolean(
    saved.phase === "transfer" &&
    saved.forcedClubExit &&
    lastTransferRecord?.type === "loan-return" &&
    lastTransferRecord.toClubId === saved.currentClubId &&
    Array.isArray(saved.transferMarketOffers) &&
    saved.transferMarketOffers.some((offer) => offer && (
      offer.clubId === saved.currentClubId ||
      (typeof offer.fromClubId === "string" && offer.fromClubId.length > 0 && offer.fromClubId !== saved.currentClubId)
    ))
  );
  return {
    ...base,
    ...saved,
    version: 7,
    phase:
      staleForcedLoanReturnMarket
        ? "career"
        : saved.phase === "botao-final" && !(saved.pendingBotaoMatches?.length)
          ? "season-result"
          : saved.phase ?? base.phase,
    nationality: saved.nationality ?? "brasil",
    playerAppearance: normalizePlayerAppearance(saved.playerAppearance ?? randomPlayerAppearance(saved.seed ?? base.seed)),
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
    currentEventId: eventIdCompatibleWithClub(saved.currentEventId ?? base.currentEventId, saved.currentClubId ?? "", "extra-training"),
    nextEventId: eventIdCompatibleWithClub(saved.nextEventId ?? "", saved.currentClubId ?? "", ""),
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
    transferOffers: staleForcedLoanReturnMarket ? [] : Array.isArray(saved.transferOffers) ? saved.transferOffers : [],
    transferMarketOffers: staleForcedLoanReturnMarket
      ? []
      : Array.isArray(saved.transferMarketOffers)
        ? saved.transferMarketOffers.filter((offer) => offer && typeof offer.clubId === "string")
        : [],
    transferStatus: staleForcedLoanReturnMarket ? null : saved.transferStatus ?? null,
    transferHistory: Array.isArray(saved.transferHistory)
      ? saved.transferHistory.filter((record) => record && typeof record.id === "string")
      : [],
    activeLoan: saved.activeLoan ?? (
      saved.loanParentClubId
        ? {
            id: `legacy-loan-${saved.season ?? base.season}-${saved.currentClubId ?? "club"}`,
            parentClubId: saved.loanParentClubId,
            parentLeagueId: saved.loanParentLeagueId ?? clubById(saved.loanParentClubId).leagueId,
            destinationClubId: saved.currentClubId ?? "",
            startSeason: Math.max(base.season, (saved.loanEndSeason ?? saved.season ?? base.season) - 1),
            endSeason: saved.loanEndSeason ?? saved.season ?? base.season,
            annualSalary: saved.annualSalary ?? 0,
            parentSalaryShare: 70,
            destinationSalaryShare: 30,
            contractYearsAtStart: Math.max(1, saved.contractYears ?? 1),
          }
        : null
    ),
    renewalDenied: saved.renewalDenied ?? false,
    forcedClubExit: staleForcedLoanReturnMarket ? false : saved.forcedClubExit ?? false,
    youthLoanDecision: saved.youthLoanDecision ?? false,
    reducedOpportunitySeason: saved.reducedOpportunitySeason ?? 0,
    forcedAlternativeTransfer: saved.forcedAlternativeTransfer ?? false,
    pendingTransferMode: saved.pendingTransferMode ?? "permanent",
    loanParentClubId: saved.loanParentClubId ?? "",
    loanParentLeagueId: saved.loanParentLeagueId ?? "",
    loanEndSeason: saved.loanEndSeason ?? 0,
    isFreeAgent: saved.isFreeAgent ?? false,
    freeAgentSinceSeason: saved.freeAgentSinceSeason ?? 0,
    forcedFreeAgentUntilSeason: saved.forcedFreeAgentUntilSeason ?? 0,
    corruptionGuaranteedSeason: saved.corruptionGuaranteedSeason ?? 0,
    lastCycleShopSeason: saved.lastCycleShopSeason ?? 0,
    agentCountryFocus: typeof saved.agentCountryFocus === "string" ? saved.agentCountryFocus : "",
    betrayedClubIds: Array.isArray(saved.betrayedClubIds) ? saved.betrayedClubIds.filter((id): id is string => typeof id === "string") : [],
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
    worldPlayers: normalizeWorldPlayerUniverse(saved.worldPlayers, saved.seed ?? base.seed, saved.season ?? base.season, Array.isArray(saved.rivals) ? saved.rivals.map((rival, index) => ({
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
      active: rival.active ?? true,
    })) : []),
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
    pendingBotaoMatches: Array.isArray(saved.pendingBotaoMatches)
      ? saved.pendingBotaoMatches.map(normalizePendingBotaoMatch)
      : [],
    lastBotaoResult: saved.lastBotaoResult ? normalizeStoredBotaoResult(saved.lastBotaoResult) : null,
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
      sudamericana: saved.trophyCabinet?.sudamericana ?? 0,
      recopaSudamericana: saved.trophyCabinet?.recopaSudamericana ?? 0,
      mundial: saved.trophyCabinet?.mundial ?? 0,
      championsLeague: saved.trophyCabinet?.championsLeague ?? 0,
      uefaSuperCup: saved.trophyCabinet?.uefaSuperCup ?? 0,
      europaLeague: saved.trophyCabinet?.europaLeague ?? 0,
      conferenceLeague: saved.trophyCabinet?.conferenceLeague ?? 0,
      concacafChampions: saved.trophyCabinet?.concacafChampions ?? 0,
      afcChampions: saved.trophyCabinet?.afcChampions ?? 0,
      cafChampions: saved.trophyCabinet?.cafChampions ?? 0,
      campeonesCup: saved.trophyCabinet?.campeonesCup ?? 0,
    },
    awardCabinet: { ...base.awardCabinet, ...saved.awardCabinet },
    history: (saved.history ?? []).map((record) => applyNationalBotaoProduction({
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
      competitions: (record.competitions ?? []).map((competition) => ({
        ...competition,
        name: canonicalCompetitionName(competition.id, competition.name),
      })),
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
      botaoResults: Array.isArray(record.botaoResults) ? record.botaoResults.map(normalizeStoredBotaoResult) : [],
      nationalBotaoProductionMatchIds: Array.isArray(record.nationalBotaoProductionMatchIds) ? record.nationalBotaoProductionMatchIds : [],
      promotion: record.promotion ?? null,
      averageRating: record.averageRating,
      manOfTheMatchAwards: record.manOfTheMatchAwards ?? 0,
      medicalRecord: record.medicalRecord ?? null,
    })),
    lastResult: saved.lastResult ? applyNationalBotaoProduction({
      ...saved.lastResult,
      position: saved.lastResult.position ?? saved.position ?? base.position,
      competitions: (saved.lastResult.competitions ?? []).map((competition) => ({
        ...competition,
        name: canonicalCompetitionName(competition.id, competition.name),
      })),
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
      botaoResults: Array.isArray(saved.lastResult.botaoResults) ? saved.lastResult.botaoResults.map(normalizeStoredBotaoResult) : [],
      promotion: saved.lastResult.promotion ?? null,
      performanceScore: saved.lastResult.performanceScore ?? 0,
      europeanSpotlight: saved.lastResult.europeanSpotlight ?? 0,
      europeanDevelopmentBonus: saved.lastResult.europeanDevelopmentBonus ?? 0,
      breakoutBonus: saved.lastResult.breakoutBonus ?? 0,
    }) : null,
    lastConsequence: saved.lastConsequence ? {
      ...saved.lastConsequence,
      luckOutcome: saved.lastConsequence.luckOutcome ?? null,
    } : null,
  };
}

export function randomPlayerName(seed: number, salt = 0) {
  const first = pick(RANDOM_NAME_FIRST_PART, seed, 901 + salt);
  const last = pick(RANDOM_NAME_LAST_PART, seed, 967 + salt);
  return `${first} ${last}`;
}

export function selectCareerTraits(position: PositionKey, seed: number) {
  const pool = TRAITS_BY_POSITION[position];
  const first = pick(pool, seed, 1801);
  const getsSecond = seeded(seed, 1811) < 0.34;
  const secondPool = pool.filter((trait) => trait !== first);
  return getsSecond ? [first, pick(secondPool, seed, 1823)] : [first];
}

export function createCareerRivals(seed: number, playerAge: number, playerOverall: number, customCharacters: CustomCharacter[]) {
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

export function evolveRivals(rivals: CareerRival[], seed: number, season: number) {
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

export function awardFinalists(playerName: string, award: string, seed: number, season: number, careerRivals: CareerRival[] = []) {
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

export function fictionalAwardWinner(playerName: string, award: string, seed: number, season: number, careerRivals: CareerRival[] = []) {
  return awardFinalists(playerName, award, seed, season, careerRivals).find((name) => name !== playerName) ?? FICTIONAL_FINALISTS[0];
}

export function careerHallEntry(game: GameState): CareerHallEntry {
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

export function archivedCareerState(entry: CareerHallEntry): { state: GameState; legacyArchive: boolean } {
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

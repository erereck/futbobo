import { CLUBS } from "../game-data";
import type { Club, Effect, PositionKey } from "../game-data";
import type { GameState, MedicalRecord, PlayerStats, SeasonRecord, TournamentStats } from "./model";
import { clamp, clubById, seeded } from "./shared";
import { SPONSOR_BRANDS } from "./sponsors";
import { isEuropeanClub, positionByKey } from "./academy";

export const POSITION_FIELD_SPOTS: Record<PositionKey, { gridColumn: number; gridRow: number }> = {
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

export const LEAGUE_MARKET_MULTIPLIER: Record<string, number> = {
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
  "egypt-premier": 0.36,
  "south-africa-premiership": 0.34,
  "a-league": 0.48,
  "botola-pro": 0.42,
  "super-league-greece": 0.58,
  "liga-boliviana": 0.24,
  "liga-futve": 0.22,
  "chance-liga": 0.55,
  "brasileirao-b": 0.2,
  championship: 0.66,
};

export function marketValue(overall: number, age: number, club: Club, reputation = 0, form?: Partial<PlayerStats>) {
  const base = Math.pow(Math.max(1, overall - 42), 2.45) * 9000;
  const ageFactor = age <= 24 ? 1.2 : age <= 29 ? 1 : Math.max(0.18, 1 - (age - 29) * 0.1);
  const marketFactor = LEAGUE_MARKET_MULTIPLIER[club.leagueId] ?? 0.82;
  const reputationFactor = 0.78 + clamp(reputation, 0, 100) / 300;
  const appearances = form?.appearances ?? 0;
  const production = (form?.goals ?? 0) + (form?.assists ?? 0) * 0.8 + (form?.cleanSheets ?? 0) * 0.65;
  const formFactor = clamp(0.88 + appearances / 160 + production / 180, 0.88, 1.24);
  return Math.max(50_000, Math.round((base * ageFactor * marketFactor * reputationFactor * formFactor) / 10_000) * 10_000);
}

export function competitiveStrength(club: Club) {
  return club.strength;
}

export function seasonPerformanceScore(positionKey: PositionKey, record?: Partial<SeasonRecord> | null) {
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

export function seasonAverageRating(performanceScore: number, seed: number, season: number) {
  const variance = (seeded(seed, season * 941 + 17) - 0.5) * 0.36;
  const historicBonus = performanceScore >= 97 && seeded(seed, season * 941 + 29) > 0.82 ? 0.3 : 0;
  return Number(clamp(
    5.25 + performanceScore * 0.038 + Math.max(0, performanceScore - 90) * 0.04 + variance + historicBonus,
    5.4,
    9.9,
  ).toFixed(1));
}

export function medicalRecordForSeason(state: GameState): MedicalRecord {
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

export function worldCupGamesThroughStage(stage: string) {
  if (stage === "CAMPEÃO" || stage === "Vice") return 8;
  if (stage.includes("Semifinal")) return 7;
  if (stage.includes("Quartas")) return 6;
  if (stage.includes("Oitavas")) return 5;
  if (stage.includes("16 avos")) return 4;
  return 3;
}

export function simulatedWorldCupStats(state: GameState, games: number, salt: number): TournamentStats {
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

export function worldCupStatsForSeason(state: Pick<GameState, "nationalHistory">, season: number) {
  return state.nationalHistory.find((record) => record.season === season && record.name === "Copa do Mundo")?.tournamentStats;
}

export function transferMarketProfile(state: GameState) {
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

export function guaranteedEuropeanOffer(state: GameState, salt: number, excludedClubIds: string[]) {
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

export function ensureEuropeanOffer(state: GameState, salt: number, offers: string[]) {
  if (offers.some((clubId) => isEuropeanClub(clubById(clubId)))) return offers;
  const europeanOffer = guaranteedEuropeanOffer(state, salt, offers);
  if (!europeanOffer) return offers;
  if (offers.length < 5) return [...offers, europeanOffer];
  return [...offers.slice(0, -1), europeanOffer];
}

export function formatMoney(value: number) {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  return `€${Math.round(value / 1000)}K`;
}

export function formatFollowers(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)} mi`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)} mil`;
  return String(Math.max(0, Math.round(value)));
}

export function publicImageProfile(state: GameState) {
  const score = state.socialSentiment * 0.36 + state.mediaRelation * 0.24 + state.charityReputation * 0.18 + state.reputation * 0.22;
  if (score >= 82) return { label: "Ícone global", color: "#ffc72c", description: "Seu nome atravessou o futebol e virou uma marca mundial." };
  if (score >= 68) return { label: "Queridinho do público", color: "#63e36b", description: "Torcedores, imprensa e marcas enxergam valor no que você representa." };
  if (score >= 52) return { label: "Figura em ascensão", color: "#2ca8ff", description: "Sua imagem cresce, mas cada postagem ainda pode mudar a narrativa." };
  if (score >= 36) return { label: "Imagem polarizada", color: "#ff8c5a", description: "Você chama atenção — e divide opiniões quase na mesma medida." };
  return { label: "Crise de imagem", color: "#ff5a4e", description: "Patrocinadores e imprensa acompanham cada passo com desconfiança." };
}

export function sponsorOfferPool(state: GameState, salt: number) {
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

export function addStats(a: PlayerStats, b: PlayerStats): PlayerStats {
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

export function describeEffects(effect: Effect) {
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

export function mergeEffects(base: Effect, extra: Effect): Effect {
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

export function careerTrend(history: SeasonRecord[]) {
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

export function fanMood(value: number) {
  if (value < 20) return { label: "Odiado", color: "#ff5a4e" };
  if (value < 38) return { label: "Vaiado", color: "#ff8c5a" };
  if (value < 62) return { label: "Em avaliação", color: "#2ca8ff" };
  if (value < 82) return { label: "Querido", color: "#63e36b" };
  if (value < 94) return { label: "Amado", color: "#9be86f" };
  return { label: "Ídolo", color: "#ffc72c" };
}

export function isIdolAtClub(state: GameState, clubId: string) {
  const clubSeasons = state.history.filter((season) => season.clubId === clubId);
  const clubTitles = clubSeasons.reduce(
    (total, season) => total + season.competitions.filter((competition) => competition.champion).length,
    0,
  );
  return state.fanSupport >= 94 && state.reputation >= 70 && (clubSeasons.length >= 4 || clubTitles >= 3);
}

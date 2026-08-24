import { CLUBS, leagueById } from "../game-data";
import type { Club } from "../game-data";
import type { PositionKey } from "../game-data";
import { calculateSquadRole, createContract } from "../career-systems";
import type { SquadRole } from "../career-systems";
import type { GameState, MarketMoveType, MarketReason, TransferOffer, TransferRecord } from "./model";
import { competitiveStrength, marketValue, seasonPerformanceScore, transferMarketProfile } from "./performance";
import { clamp, clubById, seeded } from "./shared";
import { clubConfederation, initialAdaptation, initialContinentalSlot, isEuropeanClub, positionByKey, regionAffinity } from "./academy";
import { continentalChampionForWorldSeason } from "./world-club-competitions";
import { clubWithPlayerImpact } from "./player-club-impact";

export const SECOND_DIVISION_LEAGUES = new Set(["brasileirao-b", "championship"]);
export type TransferTrigger = "season-end" | "requested" | "forced-exit" | "youth-development" | "contract-expired" | "free-agent-wait" | "event";
export type TransferOfferOptions = {
  includeForeign?: boolean; forceDomestic?: boolean; forceForeign?: boolean;
  domesticCountryId?: string; sourceLeagueId?: string; mode?: MarketMoveType;
  trigger?: TransferTrigger; count?: number;
};
export type MarketContext = {
  mode: MarketMoveType; trigger: TransferTrigger; sourceClub: Club; sourceLeagueId: string;
  performanceScore: number; careerPhase: "promise" | "prime" | "veteran";
  currentRole: SquadRole; champion: boolean; standout: boolean; needsMinutes: boolean; requestedExit: boolean;
};
export type TransferRequestDecision = {
  accepted: boolean; chance: number; fanSupportDelta: number; managerTrustDelta: number; moraleDelta: number;
  offers: TransferOffer[]; headline: string; text: string;
};

/** Contrato neutro compartilhado pelo protagonista, World Players e pelo futuro modo treinador. */
export type MarketPlayerProfile = {
  seed: number;
  season: number;
  age: number;
  position: PositionKey;
  overall: number;
  reputation: number;
  currentClubId: string;
  academyCountryId: string;
  contractYears: number;
  performanceScore: number;
  currentRole: SquadRole;
};

export type MarketDestination = {
  clubId: string;
  role: SquadRole;
  score: number;
  transferFee: number;
};

const ROLE_TEXT: Record<SquadRole, string> = {
  promessa: "Projeto de promessa", reserva: "Espaço inicial no banco", rotacao: "Lugar na rotação",
  titular: "Vaga de titular", estrela: "Papel de protagonista",
};

/**
 * Um sub-20 sem espaço continua vinculado ao clube: a saída esportiva vira
 * empréstimo, nunca venda obrigatória. Não interfere em fim de contrato nem
 * em quem já está emprestado.
 */
export function shouldOfferYouthLoanInsteadOfSale(
  state: GameState,
  forcedClubExit: boolean,
  renewalDenied: boolean,
  playerAge = state.age,
) {
  return forcedClubExit && playerAge < 20 && !renewalDenied && !state.activeLoan && !state.loanParentClubId;
}

/** Registra a consequência silenciosa de recusar o plano de empréstimo. */
export function stayAfterYouthLoanRecommendation(state: GameState): GameState {
  return {
    ...state,
    youthLoanDecision: false,
    reducedOpportunitySeason: state.season,
    transferOffers: [],
    transferMarketOffers: [],
    transferRequested: false,
    transferStatus: null,
    forcedClubExit: false,
    pendingTransferMode: "permanent",
  };
}

function latestSeason(state: GameState) { return state.history.at(-1) ?? null; }

export function buildMarketContext(state: GameState, options: TransferOfferOptions = {}): MarketContext {
  const sourceClub = clubWithPlayerImpact(clubById(state.currentClubId || state.academyClubId), state.overall);
  const latest = latestSeason(state);
  const currentRole = state.squadRole || calculateSquadRole(state.overall, sourceClub, leagueById(state.currentLeagueId || sourceClub.leagueId).prestige, state.managerTrust, state.age);
  const performanceScore = seasonPerformanceScore(state.position, latest);
  return {
    mode: options.mode ?? (state.pendingTransferMode === "loan" ? "loan" : state.isFreeAgent ? "free-agent" : "permanent"),
    trigger: options.trigger ?? (state.youthLoanDecision ? "youth-development" : state.forcedClubExit ? "forced-exit" : state.renewalDenied ? "contract-expired" : state.transferRequested ? "requested" : "season-end"),
    sourceClub, sourceLeagueId: options.sourceLeagueId ?? state.currentLeagueId ?? sourceClub.leagueId,
    performanceScore, careerPhase: state.age <= 22 ? "promise" : state.age <= 31 ? "prime" : "veteran", currentRole,
    champion: Boolean(latest?.competitions.some((competition) => competition.champion)),
    standout: performanceScore >= 76 || state.squadRole === "estrela",
    needsMinutes: currentRole === "reserva" || currentRole === "promessa" || (latest?.appearances ?? 30) < 18,
    requestedExit: state.transferRequested || options.trigger === "requested",
  };
}

/** Deterministic seam for a future persistent roster/manager market. */
export function clubPositionNeed(state: GameState, club: Club) {
  const zoneSalt = { gol: 17, defesa: 31, meio: 47, ataque: 61 }[positionByKey(state.position).zone];
  return Math.round(seeded(state.seed, state.season * 109 + CLUBS.indexOf(club) * 13 + zoneSalt) * 100);
}

export function marketPositionNeed(profile: Pick<MarketPlayerProfile, "seed" | "season" | "position">, club: Club) {
  const zoneSalt = { gol: 17, defesa: 31, meio: 47, ataque: 61 }[positionByKey(profile.position).zone];
  return Math.round(seeded(profile.seed, profile.season * 109 + CLUBS.indexOf(club) * 13 + zoneSalt) * 100);
}

function profileRole(profile: MarketPlayerProfile, club: Club): SquadRole {
  return calculateSquadRole(profile.overall, club, leagueById(club.leagueId).prestige, 55, profile.age);
}

/** Ranking sem efeitos colaterais. Não cria um segundo mercado: reutiliza força, papel, região, necessidade e valor do motor central. */
export function rankMarketDestinations(profile: MarketPlayerProfile, options: { mode?: MarketMoveType; count?: number } = {}): MarketDestination[] {
  const source = clubWithPlayerImpact(clubById(profile.currentClubId), profile.overall);
  const mode = options.mode ?? "permanent";
  const careerPhase = profile.age <= 22 ? "promise" : profile.age <= 31 ? "prime" : "veteran";
  const target = clamp(competitiveStrength(source) + clamp((profile.performanceScore - 58) / 5, -7, 8) + (careerPhase === "promise" ? 1 : careerPhase === "veteran" ? -2 : 0), 52, 95);
  return CLUBS.filter((club) => {
    if (club.id === source.id) return false;
    if (SECOND_DIVISION_LEAGUES.has(source.leagueId) && club.countryId !== source.countryId) return false;
    const role = profileRole(profile, club);
    const gap = competitiveStrength(club) - competitiveStrength(source);
    if (mode === "loan" && (profile.contractYears < 1 || profile.age > 25 || role === "reserva" || gap > 5 || gap < -20)) return false;
    if (profile.overall < 67 && isEuropeanClub(club) && !isEuropeanClub(source)) return false;
    if (profile.age >= 35 && isEuropeanClub(club) && gap > 3) return false;
    return role !== "reserva" || gap <= 7;
  }).map((club) => {
    const role = profileRole(profile, club);
    const rolePenalty = { estrela: 0, titular: 0.5, rotacao: 2.5, promessa: 3, reserva: 7 }[role];
    const domesticBonus = club.countryId === source.countryId ? 4.5 : 0;
    const homeBonus = careerPhase === "veteran" && club.countryId === profile.academyCountryId ? 4 : 0;
    const need = marketPositionNeed(profile, club);
    const score = Math.abs(competitiveStrength(club) - target) + rolePenalty
      + seeded(profile.seed, profile.season * 503 + CLUBS.indexOf(club) * 31) * 2.5
      - domesticBonus - homeBonus - need / 24;
    const value = marketValue(profile.overall, profile.age, source, profile.reputation);
    const transferFee = mode === "permanent"
      ? Math.round(Math.min(value * clamp(0.7 + profile.contractYears * 0.13 + need / 500, 0.72, 1.35), Math.pow(club.reputation, 3) * (isEuropeanClub(club) ? 3_600_000 : 1_150_000)) / 100_000) * 100_000
      : 0;
    return { clubId: club.id, role, score, transferFee };
  }).sort((a, b) => a.score - b.score || a.clubId.localeCompare(b.clubId)).slice(0, clamp(options.count ?? 6, 1, 12));
}

function candidateRole(state: GameState, club: Club): SquadRole {
  return calculateSquadRole(state.overall, club, leagueById(club.leagueId).prestige, Math.max(46, state.managerTrust), state.age);
}
function targetStrength(state: GameState, context: MarketContext) {
  const performanceStep = clamp((context.performanceScore - 58) / 4.5, -7, 8);
  const ageStep = context.careerPhase === "promise" && context.standout ? 2 : context.careerPhase === "veteran" ? -2 : 0;
  return clamp(competitiveStrength(context.sourceClub) + performanceStep + ageStep, 55, 94);
}
function candidateEligible(state: GameState, club: Club, context: MarketContext, options: TransferOfferOptions) {
  if (club.id === context.sourceClub.id) return false;
  if (options.forceDomestic && club.countryId !== (options.domesticCountryId ?? context.sourceClub.countryId)) return false;
  if (options.forceForeign && !isEuropeanClub(club)) return false;
  if (!options.includeForeign && !options.forceForeign && club.countryId !== context.sourceClub.countryId) return false;
  if (SECOND_DIVISION_LEAGUES.has(context.sourceLeagueId) && club.countryId !== context.sourceClub.countryId) return false;
  const role = candidateRole(state, club);
  const strengthGap = competitiveStrength(club) - competitiveStrength(context.sourceClub);
  if (context.mode === "loan") {
    if (state.contractYears < 1 || state.age > 29 || role === "reserva") return false;
    if (!context.needsMinutes && !context.requestedExit && context.trigger !== "youth-development") return false;
    if (strengthGap > 4 || strengthGap < -18) return false;
  }
  if (state.age >= 35 && isEuropeanClub(club) && strengthGap > 3) return false;
  if (state.overall < 67 && isEuropeanClub(club) && !isEuropeanClub(context.sourceClub)) return false;
  if (role === "reserva" && strengthGap > 8 && !context.standout) return false;
  return true;
}
function candidateScore(state: GameState, club: Club, context: MarketContext, salt: number) {
  const role = candidateRole(state, club);
  const rolePenalty = { estrela: 0, titular: 0.5, rotacao: 2.5, promessa: 3, reserva: 7 }[role];
  const domesticBonus = club.countryId === context.sourceClub.countryId ? 4.8 : 0;
  const regionalBonus = Math.max(-3, -regionAffinity(context.sourceClub.countryId, club));
  const veteranHomeBonus = context.careerPhase === "veteran" && club.countryId === state.academyCountryId ? 5 : 0;
  const buyingPowerPenalty = context.mode === "permanent" && club.reputation <= 2 && state.overall >= 80 ? 8 : 0;
  const noise = seeded(state.seed, salt + CLUBS.indexOf(club) * 29) * 2.4;
  return Math.abs(competitiveStrength(club) - targetStrength(state, context)) + rolePenalty + buyingPowerPenalty + noise
    - clubPositionNeed(state, club) / 22 - domesticBonus - regionalBonus - veteranHomeBonus;
}

function offerReason(state: GameState, club: Club, role: SquadRole, context: MarketContext): { reason: MarketReason; label: string; text: string } {
  const local = club.countryId === context.sourceClub.countryId;
  const home = club.countryId === state.academyCountryId && !local;
  if (context.mode === "loan") return { reason: "needs-minutes", label: "Mais minutos", text: `${ROLE_TEXT[role]} para você ganhar sequência.` };
  if (context.trigger === "forced-exit") return { reason: "forced-exit", label: "Novo começo", text: `${ROLE_TEXT[role]} em um projeto compatível com seu momento.` };
  if (context.mode === "free-agent") return { reason: "contract-ending", label: "Agente livre", text: `${ROLE_TEXT[role]} sem custo de transferência.` };
  if (home) return { reason: "homecoming", label: "Volta às origens", text: `${ROLE_TEXT[role]} perto de onde sua carreira começou.` };
  if (context.champion) return { reason: "champion", label: "Chega campeão", text: `${ROLE_TEXT[role]} depois de uma temporada vencedora.` };
  if (context.careerPhase === "promise" && context.standout) return { reason: "young-promise", label: "Aposta no futuro", text: `${ROLE_TEXT[role]} para desenvolver seu potencial.` };
  if (context.standout) return { reason: "breakout", label: "Temporada em alta", text: `${ROLE_TEXT[role]} graças ao seu desempenho recente.` };
  if (clubPositionNeed(state, club) >= 72) return { reason: "position-need", label: "Precisam da posição", text: `${ROLE_TEXT[role]} para preencher uma carência do elenco.` };
  if (context.careerPhase === "veteran") return { reason: "veteran-leadership", label: "Experiência", text: `${ROLE_TEXT[role]} para liderar um novo ciclo.` };
  if (context.requestedExit) return { reason: "requested-exit", label: "Saída solicitada", text: `${ROLE_TEXT[role]} depois do seu pedido para mudar.` };
  return { reason: local ? "rebuild" : "career-step", label: local ? "Novo projeto" : "Próximo passo", text: `${ROLE_TEXT[role]} em um clube compatível com sua fase.` };
}
function actualTransferFee(state: GameState, buyer: Club, context: MarketContext, role: SquadRole, salt: number) {
  if (context.mode !== "permanent") return 0;
  const base = marketValue(state.overall, state.age, context.sourceClub, state.reputation, latestSeason(state) ?? undefined);
  const roleFactor = { promessa: 0.88, reserva: 0.8, rotacao: 0.96, titular: 1.08, estrela: 1.2 }[role];
  const raw = base * clamp(0.58 + state.contractYears * 0.15, 0.65, 1.28)
    * clamp(0.78 + context.performanceScore / 180, 0.9, 1.34)
    * (0.9 + clubPositionNeed(state, buyer) / 280) * roleFactor
    * (0.94 + seeded(state.seed, salt + CLUBS.indexOf(buyer) * 37) * 0.14);
  const buyerLimit = Math.max(750_000, Math.pow(buyer.reputation, 3) * (isEuropeanClub(buyer) ? 3_600_000 : 1_150_000));
  return Math.round(Math.min(raw, buyerLimit) / 100_000) * 100_000;
}
function materializeOffer(state: GameState, club: Club, context: MarketContext, salt: number): TransferOffer {
  const role = candidateRole(state, club);
  const contract = createContract(state.overall, state.age, club, state.seed + state.season * 97 + salt + CLUBS.indexOf(club));
  const reason = offerReason(state, club, role, context);
  const parentShare = context.mode === "loan" ? clamp(Math.round((44 + (competitiveStrength(club) - competitiveStrength(context.sourceClub)) * 2) / 5) * 5, 20, 75) : 0;
  return {
    id: `${state.season}-${context.sourceClub.id}-${club.id}-${context.mode}`, clubId: club.id,
    fromClubId: context.sourceClub.id, season: state.season, type: context.mode, role,
    reason: reason.reason, reasonLabel: reason.label, reasonText: reason.text,
    transferFee: actualTransferFee(state, club, context, role, salt),
    annualSalary: context.mode === "loan" ? state.annualSalary : contract.annualSalary,
    contractYears: context.mode === "loan" ? state.contractYears : contract.years,
    loanEndSeason: context.mode === "loan" ? state.season + 1 : 0,
    parentSalaryShare: parentShare, destinationSalaryShare: context.mode === "loan" ? 100 - parentShare : 100,
    expiresSeason: state.season + 1,
  };
}

export function generateTransferOffers(state: GameState, salt: number, options: TransferOfferOptions = {}) {
  const context = buildMarketContext(state, options);
  const wanted = clamp(options.count ?? (transferMarketProfile(state).extraMarketOffers + 6), 5, 10);
  const pool = CLUBS.filter((club) => candidateEligible(state, club, context, { includeForeign: true, ...options }))
    .sort((a, b) => candidateScore(state, a, context, salt) - candidateScore(state, b, context, salt));
  const priorityCountryId = options.forceDomestic ? (options.domesticCountryId ?? context.sourceClub.countryId) : context.sourceClub.countryId;
  const domestic = pool.filter((club) => club.countryId === priorityCountryId).slice(0, context.careerPhase === "veteran" ? 4 : 3);
  const rest = pool.filter((club) => !domestic.includes(club));
  let selected = Array.from(new Set([...domestic, ...rest])).slice(0, wanted);
  if (options.forceForeign) selected = rest.filter(isEuropeanClub).slice(0, wanted);
  if (options.forceDomestic) selected = domestic.slice(0, wanted);
  let loanId = "";
  if (context.mode === "permanent" && state.contractYears >= 1 && state.age <= 25 && (context.needsMinutes || context.careerPhase === "promise") && !state.forcedClubExit) {
    const loanCandidate = selected.findLast((club) => candidateRole(state, club) !== "reserva" && competitiveStrength(club) <= competitiveStrength(context.sourceClub) + 3);
    loanId = loanCandidate?.id ?? "";
  }
  let alternativeId = "";
  if (context.mode !== "loan" && !options.forceDomestic && !options.forceForeign && wanted >= 5) {
    const alternatives = pool.filter((club) => !selected.includes(club) && (
      club.countryId === "arabia-saudita" ||
      (club.countryId === state.academyCountryId && club.countryId !== context.sourceClub.countryId) ||
      (competitiveStrength(club) <= competitiveStrength(context.sourceClub) - 6 && candidateRole(state, club) !== "reserva")
    )).slice(0, 12);
    const alternative = alternatives[Math.floor(seeded(state.seed, salt + 7_919) * alternatives.length)];
    if (alternative) {
      alternativeId = alternative.id;
      selected = [...selected.slice(0, Math.max(0, wanted - 1)), alternative];
    }
  }
  // Porta europeia: um jogador pronto para esse salto nunca fica preso só porque
  // o ranking normal priorizou o mercado local. A segunda consulta continua rara.
  if (
    state.overall >= 72 &&
    !isEuropeanClub(context.sourceClub) &&
    context.mode !== "loan" &&
    !options.forceDomestic &&
    !options.forceForeign
  ) {
    const europeanDoors = CLUBS
      .filter((club) =>
        isEuropeanClub(club) &&
        club.id !== context.sourceClub.id &&
        candidateRole(state, club) !== "reserva" &&
        competitiveStrength(club) <= Math.max(72, state.overall + (context.standout ? 8 : 4)) &&
        (state.age < 35 || competitiveStrength(club) <= competitiveStrength(context.sourceClub) + 3)
      )
      .sort((a, b) => candidateScore(state, a, context, salt + 12_701) - candidateScore(state, b, context, salt + 12_701));
    const doorCount = 1 + Number(seeded(state.seed, salt + 12_733) < 0.38);
    const doors = europeanDoors.slice(0, doorCount);
    if (doors.length) {
      const withoutDoors = selected.filter((club) => !doors.some((door) => door.id === club.id));
      selected = [...withoutDoors.slice(0, Math.max(0, wanted - doors.length)), ...doors];
    }
  }
  return selected.map((club, index) => {
    const offer = materializeOffer(state, club, club.id === loanId ? { ...context, mode: "loan" } : context, salt + index * 41);
    return club.id === alternativeId ? {
      ...offer,
      reason: "alternative-route" as const,
      reasonLabel: club.countryId === "arabia-saudita" ? "Oferta pelo dinheiro" : club.countryId === state.academyCountryId ? "Volta inesperada" : "Rota alternativa",
      reasonText: club.countryId === "arabia-saudita"
        ? "Um salto financeiro fora da rota esportiva óbvia."
        : club.countryId === state.academyCountryId
          ? "Menos prestígio para voltar cedo ao país onde você começou."
          : `${ROLE_TEXT[offer.role]} em um projeto abaixo do seu nível atual.`,
    } : offer;
  });
}
export function materializeTransferOffers(state: GameState, clubIds: string[], salt: number, options: TransferOfferOptions = {}) {
  const context = buildMarketContext(state, options);
  return Array.from(new Set(clubIds)).filter((id) => id && id !== context.sourceClub.id)
    .map((id, index) => materializeOffer(state, clubById(id), context, salt + index * 41));
}
export function buildRenewalOffer(state: GameState): TransferOffer {
  const club = clubById(state.currentClubId || state.academyClubId);
  const context = buildMarketContext(state, { mode: "renewal" });
  const contract = createContract(state.overall, state.age, club, state.seed + state.season * 149);
  return { ...materializeOffer(state, club, context, 149), id: `${state.season}-${club.id}-renewal`, type: "renewal",
    clubId: club.id, fromClubId: club.id, transferFee: 0, annualSalary: contract.annualSalary, contractYears: contract.years,
    reason: "rebuild", reasonLabel: "Renovação", reasonText: "O clube quer manter você no projeto." };
}
function transferRecord(state: GameState, offer: TransferOffer): TransferRecord {
  return { id: offer.id, season: state.season, age: state.age, playerName: state.name, position: state.position,
    type: offer.type, fromClubId: offer.fromClubId, toClubId: offer.clubId, transferFee: offer.transferFee,
    annualSalary: offer.annualSalary, contractYears: offer.contractYears, role: offer.role, reason: offer.reason };
}

function clubQualifiedForWorldSeason(state: GameState, club: Club) {
  const feeder = clubConfederation(club) === "EUROPE"
    ? "champions-league"
    : clubConfederation(club) === "SOUTH_AMERICA"
      ? "libertadores"
      : clubConfederation(club) === "NORTH_AMERICA"
        ? "concacaf-champions"
        : clubConfederation(club) === "ASIA"
          ? "afc-champions"
          : clubConfederation(club) === "AFRICA"
            ? "caf-champions"
            : null;
  return feeder ? continentalChampionForWorldSeason(state, feeder, state.season) === club.id : false;
}

export function applyAcceptedTransfer(state: GameState, offer: TransferOffer): GameState {
  const destination = clubById(offer.clubId);
  const source = clubById(offer.fromClubId || state.currentClubId || state.academyClubId);
  const isLoan = offer.type === "loan";
  const isRenewal = offer.type === "renewal";
  const destinationQualifiedForWorld = clubQualifiedForWorldSeason(state, destination);
  return {
    ...state, currentClubId: destination.id, currentLeagueId: destination.leagueId,
    contractYears: isLoan ? Math.max(2, state.contractYears) : offer.contractYears, annualSalary: isLoan ? state.annualSalary : offer.annualSalary,
    squadRole: offer.role, managerTrust: isRenewal ? Math.max(state.managerTrust, 56) : offer.role === "estrela" ? 68 : offer.role === "titular" ? 59 : 48,
    fanSupport: isRenewal ? state.fanSupport : 50, adaptation: isRenewal ? state.adaptation : initialAdaptation(source.countryId, destination.countryId),
    continentalSlot: isRenewal ? state.continentalSlot : initialContinentalSlot(destination),
    worldQualifiedSeason: destinationQualifiedForWorld ? state.season : state.worldQualifiedSeason,
    worldQualifiedClubId: destinationQualifiedForWorld ? destination.id : state.worldQualifiedClubId,
    transferOffers: [], transferMarketOffers: [], transferRequested: false, transferStatus: null,
    renewalDenied: false, forcedClubExit: false, youthLoanDecision: false, reducedOpportunitySeason: 0,
    isFreeAgent: false, freeAgentSinceSeason: 0, pendingTransferMode: "permanent",
    activeLoan: isLoan ? { id: offer.id, parentClubId: source.id, parentLeagueId: state.currentLeagueId || source.leagueId,
      destinationClubId: destination.id, startSeason: state.season, endSeason: offer.loanEndSeason || state.season + 1,
      annualSalary: state.annualSalary, parentSalaryShare: offer.parentSalaryShare, destinationSalaryShare: offer.destinationSalaryShare,
      contractYearsAtStart: isLoan ? Math.max(2, state.contractYears) : state.contractYears } : null,
    loanParentClubId: isLoan ? source.id : "", loanParentLeagueId: isLoan ? (state.currentLeagueId || source.leagueId) : "",
    loanEndSeason: isLoan ? (offer.loanEndSeason || state.season + 1) : 0,
    transferHistory: isRenewal ? state.transferHistory : [...state.transferHistory, transferRecord(state, offer)],
  };
}
export function completeLoanReturn(state: GameState): GameState {
  const agreement = state.activeLoan ?? (state.loanParentClubId ? {
    id: `legacy-loan-${state.season}`, parentClubId: state.loanParentClubId,
    parentLeagueId: state.loanParentLeagueId || clubById(state.loanParentClubId).leagueId,
    destinationClubId: state.currentClubId, startSeason: Math.max(0, state.loanEndSeason - 1), endSeason: state.loanEndSeason,
    annualSalary: state.annualSalary, parentSalaryShare: 50, destinationSalaryShare: 50, contractYearsAtStart: state.contractYears,
  } : null);
  if (!agreement || state.season < agreement.endSeason) return state;
  const parent = clubById(agreement.parentClubId);
  const contractExpired = state.contractYears <= 0;
  const parentQualifiedForWorld = clubQualifiedForWorldSeason(state, parent);
  const record: TransferRecord = { id: `${agreement.id}-return`, season: state.season, age: state.age, playerName: state.name,
    position: state.position, type: "loan-return", fromClubId: agreement.destinationClubId, toClubId: parent.id,
    transferFee: 0, annualSalary: agreement.annualSalary, contractYears: state.contractYears, role: state.squadRole, reason: "needs-minutes" };
  const returned: GameState = { ...state, currentClubId: parent.id, currentLeagueId: agreement.parentLeagueId || parent.leagueId,
    worldQualifiedSeason: parentQualifiedForWorld ? state.season : state.worldQualifiedSeason,
    worldQualifiedClubId: parentQualifiedForWorld ? parent.id : state.worldQualifiedClubId,
    activeLoan: null, loanParentClubId: "", loanParentLeagueId: "", loanEndSeason: 0, pendingTransferMode: "permanent",
    youthLoanDecision: false, reducedOpportunitySeason: 0,
    isFreeAgent: contractExpired, freeAgentSinceSeason: contractExpired ? state.season : state.freeAgentSinceSeason,
    transferHistory: [...state.transferHistory, record] };
  if (!contractExpired) return returned;
  const offers = generateTransferOffers(returned, state.season * 557, { includeForeign: true, mode: "free-agent", trigger: "contract-expired", count: 8 });
  return { ...returned, transferOffers: offers.map((offer) => offer.clubId), transferMarketOffers: offers };
}
export function resolveTransferRequest(state: GameState, salt: number): TransferRequestDecision {
  const context = buildMarketContext(state, { trigger: "requested" });
  const chance = clamp(Math.round(48 + clamp((context.performanceScore - 55) * 0.55 + (state.reputation - 45) * 0.22, -12, 24)
    + clamp((55 - state.morale) * 0.25 + (52 - state.managerTrust) * 0.2, -8, 16) - clamp(state.contractYears * 7, 0, 28)
    + (state.age >= 33 ? 8 : 0)), 18, 88);
  const accepted = seeded(state.seed, salt) * 100 < chance;
  if (accepted) {
    const prepared = { ...state, transferRequested: true, pendingTransferMode: "permanent" as const };
    const offers = generateTransferOffers(prepared, salt + 19, { includeForeign: true, trigger: "requested", count: 8 });
    return { accepted: true, chance, fanSupportDelta: -8, managerTrustDelta: -12, moraleDelta: 4, offers,
      headline: "A saída foi autorizada", text: `${offers.length} projetos chegaram. Permanecer não é mais uma opção.` };
  }
  return { accepted: false, chance, fanSupportDelta: context.currentRole === "estrela" ? -16 : -10,
    managerTrustDelta: context.sourceClub.reputation >= 4 ? -14 : -9, moraleDelta: -7, offers: [],
    headline: "O clube recusou", text: "O pedido vazou e sua relação com torcida e comissão piorou." };
}

// Adaptadores para eventos, simulações e saves anteriores que ainda usam IDs.
export function selectOffers(state: GameState, count: number, salt: number, options: TransferOfferOptions = {}) {
  return generateTransferOffers(state, salt, { includeForeign: true, ...options, count }).map((offer) => offer.clubId);
}
export function offersFromCountry(state: GameState, countryId: string, count: number, salt: number, excludedIds: string[] = []) {
  return generateTransferOffers(state, salt, { includeForeign: true, forceDomestic: true, domesticCountryId: countryId, count: count + excludedIds.length })
    .map((offer) => offer.clubId).filter((id) => !excludedIds.includes(id)).slice(0, count);
}
export function prioritizeCurrentCountry(state: GameState, salt: number, offers: string[], desiredCount: number) {
  if (desiredCount <= 0) return offers;
  const current = clubById(state.currentClubId || state.academyClubId);
  const local = [...offers.filter((id) => clubById(id).countryId === current.countryId), ...offersFromCountry(state, current.countryId, desiredCount, salt, offers)].slice(0, desiredCount);
  return Array.from(new Set([...local, ...offers])).slice(0, Math.max(5, offers.length));
}
export function selectTransferOffers(state: GameState, salt: number, options: TransferOfferOptions = {}) {
  return generateTransferOffers(state, salt, { includeForeign: true, ...options }).map((offer) => offer.clubId);
}

export const ALTERNATIVE_EXILE_LEAGUES = new Set([
  "liga-uruguaia", "liga-chilena", "liga-colombiana", "liga-paraguaia", "liga-equatoriana", "liga-peruana", "liga-mx", "mls",
  "eredivisie", "primeira", "proleague", "superlig", "swiss-super-league", "austria-bundesliga", "premiership-sco",
  "saudi-pro-league", "j1-league", "k-league", "csl", "brasileirao-b", "championship", "botola-pro",
  "super-league-greece", "liga-boliviana", "liga-futve", "chance-liga",
]);
export function selectAlternativeExileOffers(state: GameState, salt: number) {
  const source = clubById(state.currentClubId || state.academyClubId);
  const context = buildMarketContext(state);
  return CLUBS.filter((club) => club.id !== source.id && club.countryId !== source.countryId && ALTERNATIVE_EXILE_LEAGUES.has(club.leagueId) && club.reputation <= 3)
    .sort((a, b) => candidateScore(state, a, context, salt) - candidateScore(state, b, context, salt))
    .slice(0, 6).map((club) => club.id);
}

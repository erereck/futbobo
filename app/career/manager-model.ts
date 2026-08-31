import { CLUBS, COUNTRIES, LEAGUES, type Club } from "../game-data";
import { randomPlayerAppearance } from "../player-appearance";
import { botaoTeamFromClub, pickFinalOpponent } from "../botao/adapter";
import { DEFAULT_BOTAO_RULES, type BotaoMatchResult, type BotaoMatchSetup, type BotaoPlayer } from "../botao/types";
import { difficultyFromStrength } from "../botao/cpu";
import { hashSeed } from "../botao/rng";
import { formationById } from "../botao/formations";
import { clamp, seeded } from "./shared";
import {
  advanceWorldPlayerUniverse,
  createWorldPlayerUniverse,
  ensureClubSquadPlayers,
  normalizeWorldPlayerUniverse,
  worldPlayersAtClub,
} from "./world-players";
import type { WorldPlayer, WorldPlayerUniverse } from "./world-player-model";

export type ManagerPhase = "onboarding" | "career" | "result" | "dismissed";

export type ManagerMatchPlan = {
  id: string;
  opponentId: string;
  competitionName: string;
  stageName: string;
  season: number;
};

export type ManagerHistoryEntry = {
  id: string;
  season: number;
  opponentId: string;
  competitionName: string;
  stageName: string;
  outcome: "win" | "loss" | "draw";
  score: string;
  formationId: string;
  substitutions: number;
};

export type ManagerLastResult = {
  matchId: string;
  outcome: "win" | "loss" | "draw";
  goalsFor: number;
  goalsAgainst: number;
  substitutions: number;
  playerDistances: Record<string, number>;
};

export type ManagerPlayerStat = {
  appearances: number;
  starts: number;
  substitutionsIn: number;
  substitutionsOut: number;
  goals: number;
  assists: number;
  touches: number;
  flicks: number;
  distance: number;
};

export type ManagerState = {
  version: 1;
  mode: "manager";
  seed: number;
  phase: ManagerPhase;
  name: string;
  nationality: string;
  currentClubId: string;
  currentLeagueId: string;
  season: number;
  reputation: number;
  boardTrust: number;
  objective: string;
  budget: number;
  worldPlayers: WorldPlayerUniverse;
  squadIds: string[];
  starters: string[];
  bench: string[];
  formationId: string;
  pendingMatch: ManagerMatchPlan | null;
  history: ManagerHistoryEntry[];
  lastResult: ManagerLastResult | null;
  marketOffers: string[];
  playerStats: Record<string, ManagerPlayerStat>;
  jobOffers: string[];
};

const STARTER_POSITIONS = ["GOL", "ZAG", "MC", "MEI", "CA"] as const;
const SHIRT_NUMBERS = [1, 4, 8, 10, 9, 12, 14, 17, 20, 22, 24, 27, 30, 33];

function defaultSeed() {
  return hashSeed("futbobo-manager", Date.now(), Math.random());
}

function cleanClub(clubId: string): Club {
  return CLUBS.find((club) => club.id === clubId) ?? CLUBS[0];
}

function makeMatchPlan(state: Pick<ManagerState, "seed" | "currentClubId" | "currentLeagueId" | "season">): ManagerMatchPlan {
  const club = cleanClub(state.currentClubId);
  const opponent = pickFinalOpponent({
    clubId: club.id,
    leagueId: state.currentLeagueId || club.leagueId,
    scope: "domestic",
    seed: state.seed,
    season: state.season,
    competitionId: "manager-key-match",
  });
  const league = LEAGUES.find((item) => item.id === club.leagueId);
  return {
    id: "manager-match-" + state.seed.toString(36) + "-" + state.season.toString(36),
    opponentId: opponent.id,
    competitionName: league?.cupName ?? "Copa nacional",
    stageName: "Jogo-chave",
    season: state.season,
  };
}

function chooseLineup(players: WorldPlayer[]) {
  const available = players.slice().sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const picked: WorldPlayer[] = [];
  for (const position of STARTER_POSITIONS) {
    const exact = available.find((player) => player.position === position && !picked.some((item) => item.id === player.id));
    if (exact) picked.push(exact);
  }
  for (const player of available) {
    if (picked.length >= 5) break;
    if (!picked.some((item) => item.id === player.id)) picked.push(player);
  }
  const bench = available.filter((player) => !picked.some((item) => item.id === player.id)).slice(0, 3);
  return { starters: picked.slice(0, 5).map((player) => player.id), bench: bench.map((player) => player.id) };
}

function playerToBotao(player: WorldPlayer, index: number, seed: number): BotaoPlayer {
  return {
    id: player.id,
    name: player.name,
    number: SHIRT_NUMBERS[index % SHIRT_NUMBERS.length],
    position: player.position,
    overall: player.overall,
    power: clamp(44 + (player.overall - 58) * 1.6, 34, 100),
    control: clamp(40 + (player.overall - 58) * 1.5, 32, 100),
    appearance: randomPlayerAppearance(hashSeed(seed, player.id)),
  };
}

export function managerPlayers(state: ManagerState) {
  return state.worldPlayers.players;
}

export function managerSquad(state: ManagerState) {
  return state.squadIds.map((id) => state.worldPlayers.players[id]).filter((player): player is WorldPlayer => Boolean(player && player.status !== "retired"));
}

export function managerClub(state: ManagerState) {
  return cleanClub(state.currentClubId);
}

export function managerOpponent(state: ManagerState) {
  return state.pendingMatch ? cleanClub(state.pendingMatch.opponentId) : null;
}

export function createManagerState(seed = defaultSeed()): ManagerState {
  const season = new Date().getFullYear();
  return {
    version: 1,
    mode: "manager",
    seed,
    phase: "onboarding",
    name: "",
    nationality: "brasil",
    currentClubId: "",
    currentLeagueId: "",
    season,
    reputation: 30,
    boardTrust: 55,
    objective: "Escolha um clube para começar.",
    budget: 0,
    worldPlayers: createWorldPlayerUniverse(seed, season, 42),
    squadIds: [],
    starters: [],
    bench: [],
    formationId: "muralha",
    pendingMatch: null,
    history: [],
    lastResult: null,
    marketOffers: [],
    playerStats: {},
    jobOffers: [],
  };
}

function blankPlayerStat(): ManagerPlayerStat {
  return { appearances: 0, starts: 0, substitutionsIn: 0, substitutionsOut: 0, goals: 0, assists: 0, touches: 0, flicks: 0, distance: 0 };
}

function playerStatsForSquad(state: ManagerState, ids: string[]) {
  const stats = { ...state.playerStats };
  for (const id of ids) if (!stats[id]) stats[id] = blankPlayerStat();
  return stats;
}

export function startManagerCareer(state: ManagerState, input: { name: string; nationality: string; clubId: string }) {
  const club = cleanClub(input.clubId);
  const world = ensureClubSquadPlayers(state.worldPlayers, club.id, state.season, 14);
  const players = worldPlayersAtClub(world, club.id).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const lineup = chooseLineup(players);
  const next: ManagerState = {
    ...state,
    phase: "career",
    name: input.name.trim() || "Técnico",
    nationality: COUNTRIES.some((country) => country.id === input.nationality) ? input.nationality : "brasil",
    currentClubId: club.id,
    currentLeagueId: club.leagueId,
    reputation: Math.max(30, club.reputation * 9),
    boardTrust: 62,
    objective: "Faça uma boa estreia no " + club.shortName + ".",
    budget: Math.round(club.strength * 115_000),
    worldPlayers: world,
    squadIds: players.slice(0, 14).map((player) => player.id),
    starters: lineup.starters,
    bench: lineup.bench,
    pendingMatch: null,
    lastResult: null,
    marketOffers: [],
    playerStats: playerStatsForSquad(state, players.slice(0, 14).map((player) => player.id)),
    jobOffers: [],
  };
  const started = { ...next, pendingMatch: makeMatchPlan(next) };
  return { ...started, marketOffers: managerMarketOffers(started).map((player) => player.id) };
}

export function setManagerLineup(state: ManagerState, starters: string[], bench: string[]) {
  const allowed = new Set(state.squadIds);
  const cleanStarters = starters.filter((id, index) => allowed.has(id) && starters.indexOf(id) === index).slice(0, 5);
  const cleanBench = bench.filter((id, index) => allowed.has(id) && !cleanStarters.includes(id) && bench.indexOf(id) === index).slice(0, 3);
  if (cleanStarters.length !== 5 || cleanBench.length !== 3) return state;
  return { ...state, starters: cleanStarters, bench: cleanBench };
}

export function setManagerFormation(state: ManagerState, formationId: string) {
  return { ...state, formationId: formationById(formationId).id };
}

export function managerMarketOffers(state: ManagerState) {
  return Object.values(state.worldPlayers.players)
    .filter((player) => player.status === "active" && player.currentClubId !== state.currentClubId && !state.squadIds.includes(player.id))
    .sort((a, b) => b.overall - a.overall || b.potential - a.potential || a.id.localeCompare(b.id))
    .slice(0, 3);
}

export function marketFee(player: WorldPlayer) {
  return Math.round(player.overall * player.overall * 160);
}

/** Até três convites de clubes que fazem sentido para a reputação atual. */
export function managerJobOffers(state: ManagerState) {
  if (state.phase !== "career" || state.reputation < 45) return [] as Club[];
  const current = managerClub(state);
  const targetStrength = clamp(current.strength + (state.reputation - 55) * 0.32, 45, 94);
  return CLUBS
    .filter((club) => club.id !== current.id)
    .map((club) => ({
      club,
      score: Math.abs(club.strength - targetStrength) + seeded(hashSeed(state.seed, club.id), state.season * 53) * 2,
    }))
    .sort((a, b) => a.score - b.score || b.club.reputation - a.club.reputation)
    .slice(0, 3)
    .map(({ club }) => club);
}

export function signManagerPlayer(state: ManagerState, playerId: string) {
  const player = state.worldPlayers.players[playerId];
  if (!player || player.status !== "active" || state.squadIds.includes(playerId)) return state;
  const fee = marketFee(player);
  if (state.budget < fee || state.squadIds.length < 8) return state;
  const relation = new Set([...state.starters, ...state.bench]);
  const outside = state.squadIds.filter((id) => !relation.has(id));
  const replacedId = outside[0] ?? state.bench.at(-1) ?? "";
  if (!replacedId) return state;
  const players = { ...state.worldPlayers.players };
  const replacedPlayer = players[replacedId];
  if (replacedPlayer) players[replacedId] = releasePlayerFromClub(replacedPlayer, state.season);
  players[playerId] = movePlayerToClub(player, state.currentClubId, state.season, fee);
  const nextSquadIds = state.squadIds.map((id) => id === replacedId ? playerId : id);
  const nextStarters = state.starters.map((id) => id === replacedId ? playerId : id);
  const nextBench = state.bench.map((id) => id === replacedId ? playerId : id);
  const nextWorldPlayers = { ...state.worldPlayers, players };
  return {
    ...state,
    budget: state.budget - fee,
    squadIds: nextSquadIds,
    starters: nextStarters,
    bench: nextBench,
    worldPlayers: nextWorldPlayers,
    playerStats: playerStatsForSquad(state, nextSquadIds),
    jobOffers: state.jobOffers,
    marketOffers: managerMarketOffers({ ...state, squadIds: nextSquadIds, worldPlayers: nextWorldPlayers }).map((offer) => offer.id),
  };
}

export function acceptManagerJobOffer(state: ManagerState, clubId: string) {
  if (!managerJobOffers(state).some((club) => club.id === clubId)) return state;
  const moved = startManagerCareer({ ...state, jobOffers: [] }, { name: state.name, nationality: state.nationality, clubId });
  return { ...moved, reputation: Math.max(30, state.reputation), boardTrust: 58, history: state.history, playerStats: { ...state.playerStats }, jobOffers: [] };
}

export function dismissManagerJobOffers(state: ManagerState) {
  return state.jobOffers.length ? { ...state, jobOffers: [] } : state;
}

export function managerMatchSetup(state: ManagerState): { state: ManagerState; setup: BotaoMatchSetup } | null {
  if (state.phase !== "career" || !state.pendingMatch || !state.currentClubId || state.starters.length < 5 || state.bench.length < 3) return null;
  const opponent = cleanClub(state.pendingMatch.opponentId);
  const world = ensureClubSquadPlayers(state.worldPlayers, opponent.id, state.season, 14);
  const currentPlayers = managerSquad({ ...state, worldPlayers: world });
  const opponentPlayers = worldPlayersAtClub(world, opponent.id).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const cpuLineup = chooseLineup(opponentPlayers);
  const indexed = new Map(currentPlayers.map((player) => [player.id, player]));
  const userPlayers = state.starters.map((id) => indexed.get(id)).filter((player): player is WorldPlayer => Boolean(player));
  const userBench = state.bench.map((id) => indexed.get(id)).filter((player): player is WorldPlayer => Boolean(player));
  if (userPlayers.length < 5 || userBench.length < 3 || cpuLineup.starters.length < 5) return null;
  const cpuStarters = cpuLineup.starters.map((id) => opponentPlayers.find((player) => player.id === id)).filter((player): player is WorldPlayer => Boolean(player));
  const cpuBench = cpuLineup.bench.map((id) => opponentPlayers.find((player) => player.id === id)).filter((player): player is WorldPlayer => Boolean(player));
  const userRoster = userPlayers.map((player, index) => playerToBotao(player, index, state.seed));
  const userBenchRoster = userBench.map((player, index) => playerToBotao(player, index + 5, state.seed));
  const cpuRoster = cpuStarters.map((player, index) => playerToBotao(player, index, state.seed + 17));
  const cpuBenchRoster = cpuBench.map((player, index) => playerToBotao(player, index + 5, state.seed + 17));
  const nextState = { ...state, worldPlayers: world };
  return {
    state: nextState,
    setup: {
      matchId: state.pendingMatch.id,
      seed: hashSeed(state.seed, state.pendingMatch.id),
      competitionName: state.pendingMatch.competitionName,
      stageName: state.pendingMatch.stageName,
      neutralVenue: false,
      userIsHost: true,
      player: userRoster[0],
      userTeam: botaoTeamFromClub(managerClub(state)),
      cpuTeam: botaoTeamFromClub(opponent),
      difficulty: difficultyFromStrength(opponent.strength),
      rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 3, halfSeconds: 105, halves: 1, extraHalves: 1, extraSeconds: 45 },
      managerMode: true,
      managerRosters: { user: { starters: userRoster, bench: userBenchRoster }, cpu: { starters: cpuRoster, bench: cpuBenchRoster } },
      userFormationId: state.formationId,
      cpuFormationId: ["muralha", "diamante", "linha", "piramide", "ferrolho", "avalanche"][Math.floor(seeded(state.seed, state.season * 17) * 6)],
    },
  };
}

export function applyManagerMatchResult(state: ManagerState, result: BotaoMatchResult) {
  const plan = state.pendingMatch;
  const outcome = result.outcome;
  const trustDelta = outcome === "win" ? 9 : outcome === "draw" ? 2 : -10;
  const nextTrust = clamp(state.boardTrust + trustDelta, 0, 100);
  const nextReputation = clamp(state.reputation + (outcome === "win" ? 3 : outcome === "draw" ? 1 : -1), 0, 100);
  const jobOffers = managerJobOffers({ ...state, phase: "career", season: state.season + 1, reputation: nextReputation, boardTrust: nextTrust });
  const substitutions = result.manager?.substitutions ?? [];
  const userSubstitutions = substitutions.filter((item) => item.side === "user");
  const subIn = new Set(userSubstitutions.map((item) => item.inPlayerId));
  const subOut = new Set(userSubstitutions.map((item) => item.outPlayerId));
  const initialStarters = new Set([...state.starters, ...subOut]);
  const playerStats = { ...state.playerStats };
  for (const [playerId, matchPlayer] of Object.entries(result.manager?.players ?? {})) {
    if (!state.squadIds.includes(playerId)) continue;
    const participated = initialStarters.has(playerId) || subIn.has(playerId) || subOut.has(playerId);
    if (!participated) continue;
    const current = { ...(playerStats[playerId] ?? blankPlayerStat()) };
    current.appearances += 1;
    if (initialStarters.has(playerId) && !subIn.has(playerId)) current.starts += 1;
    if (subIn.has(playerId)) current.substitutionsIn += 1;
    if (subOut.has(playerId)) current.substitutionsOut += 1;
    current.goals += matchPlayer.goals ?? 0;
    current.assists += matchPlayer.assists ?? 0;
    current.touches += matchPlayer.touches ?? 0;
    current.flicks += matchPlayer.flicks ?? 0;
    current.distance += matchPlayer.distance ?? 0;
    playerStats[playerId] = current;
  }
  const history: ManagerHistoryEntry = {
    id: result.matchId,
    season: state.season,
    opponentId: plan?.opponentId ?? "",
    competitionName: plan?.competitionName ?? "Jogo-chave",
    stageName: plan?.stageName ?? "Jogo-chave",
    outcome,
    score: String(result.goalsFor) + " × " + String(result.goalsAgainst),
    formationId: state.formationId,
    substitutions: result.manager?.substitutions.length ?? 0,
  };
  return {
    ...state,
    phase: nextTrust <= 0 ? "dismissed" as const : "career" as const,
    season: state.season + 1,
    boardTrust: nextTrust,
    reputation: nextReputation,
    budget: Math.max(0, state.budget + (outcome === "win" ? 260_000 : outcome === "draw" ? 90_000 : 20_000)),
    objective: outcome === "win" ? "A diretoria quer uma sequência: mantenha o time competitivo." : outcome === "draw" ? "O empate segurou a pressão. Busque uma vitória no próximo jogo." : "A diretoria está cobrando resposta imediata.",
    history: [history, ...state.history].slice(0, 24),
    playerStats,
    jobOffers: nextTrust <= 0 ? [] : jobOffers.map((club) => club.id),
    lastResult: {
      matchId: result.matchId,
      outcome,
      goalsFor: result.goalsFor,
      goalsAgainst: result.goalsAgainst,
      substitutions: result.manager?.substitutions.length ?? 0,
      playerDistances: Object.fromEntries(Object.entries(result.manager?.players ?? {}).map(([id, player]) => [id, player.distance])),
    },
    pendingMatch: null,
  } as ManagerState;
}

export function continueManagerSeason(state: ManagerState) {
  const world = advanceWorldPlayerUniverse(state.worldPlayers, { season: state.season, focusClubId: state.currentClubId });
  const withWorld = { ...state, worldPlayers: ensureClubSquadPlayers(world, state.currentClubId, state.season, 14) };
  const refreshedPlayers = worldPlayersAtClub(withWorld.worldPlayers, state.currentClubId).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const withRoster = { ...withWorld, squadIds: refreshedPlayers.slice(0, 14).map((player) => player.id) };
  const squad = managerSquad(withRoster).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const lineup = chooseLineup(squad);
  const next = {
    ...withRoster,
    starters: lineup.starters,
    bench: lineup.bench,
    squadIds: squad.slice(0, 14).map((player) => player.id),
    pendingMatch: null,
    marketOffers: managerMarketOffers(withRoster).map((player) => player.id),
    phase: "career" as const,
  };
  return { ...next, pendingMatch: makeMatchPlan(next) };
}

export function hireManagerAtClub(state: ManagerState, clubId: string) {
  const restarted = startManagerCareer({ ...createManagerState(state.seed), name: state.name, nationality: state.nationality }, {
    name: state.name,
    nationality: state.nationality,
    clubId,
  });
  return { ...restarted, reputation: Math.max(30, state.reputation), boardTrust: 58 };
}

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .filter((id, index, all) => all.indexOf(id) === index);
}

function closeCurrentSpell(history: WorldPlayer["clubHistory"], season: number) {
  if (!Array.isArray(history)) return [];
  return history.filter(Boolean).map((spell, index, safeHistory) => index === safeHistory.length - 1 && spell.leftSeason === null ? { ...spell, leftSeason: season } : spell);
}

function releasePlayerFromClub(player: WorldPlayer, season: number): WorldPlayer {
  return {
    ...player,
    status: "free-agent",
    currentClubId: "",
    parentClubId: "",
    loanEndSeason: 0,
    contractUntilSeason: season,
    clubHistory: closeCurrentSpell(player.clubHistory, season),
  };
}

function movePlayerToClub(player: WorldPlayer, clubId: string, season: number, fee: number): WorldPlayer {
  return {
    ...player,
    currentClubId: clubId,
    status: "active",
    parentClubId: "",
    loanEndSeason: 0,
    clubHistory: [...closeCurrentSpell(player.clubHistory, season), {
      clubId,
      joinedSeason: season,
      leftSeason: null,
      moveType: "permanent" as const,
      transferFee: fee,
    }],
  };
}

function normalizeHistory(value: unknown, fallbackSeason: number): ManagerHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id ? item.id : `manager-history-${index}`,
      season: Number.isFinite(Number(item.season)) ? Number(item.season) : fallbackSeason,
      opponentId: typeof item.opponentId === "string" ? item.opponentId : "",
      competitionName: typeof item.competitionName === "string" ? item.competitionName : "Jogo-chave",
      stageName: typeof item.stageName === "string" ? item.stageName : "Jogo-chave",
      outcome: (item.outcome === "win" || item.outcome === "loss" || item.outcome === "draw" ? item.outcome : "draw") as ManagerHistoryEntry["outcome"],
      score: typeof item.score === "string" && item.score ? item.score : "0 × 0",
      formationId: typeof item.formationId === "string" ? formationById(item.formationId).id : "muralha",
      substitutions: Math.max(0, Math.floor(Number(item.substitutions) || 0)),
    }))
    .slice(0, 24);
}

function normalizeLastResult(value: unknown): ManagerLastResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const rawDistances = item.playerDistances;
  const playerDistances = rawDistances && typeof rawDistances === "object" && !Array.isArray(rawDistances)
    ? Object.fromEntries(Object.entries(rawDistances).filter(([id, distance]) => typeof id === "string" && Number.isFinite(Number(distance))).map(([id, distance]) => [id, Math.max(0, Number(distance))]))
    : {};
  return {
    matchId: typeof item.matchId === "string" ? item.matchId : "",
    outcome: (item.outcome === "win" || item.outcome === "loss" || item.outcome === "draw" ? item.outcome : "draw") as ManagerLastResult["outcome"],
    goalsFor: Math.max(0, Math.floor(Number(item.goalsFor) || 0)),
    goalsAgainst: Math.max(0, Math.floor(Number(item.goalsAgainst) || 0)),
    substitutions: Math.max(0, Math.floor(Number(item.substitutions) || 0)),
    playerDistances,
  };
}

function normalizePendingMatch(value: unknown, fallbackSeason: number): ManagerMatchPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.opponentId !== "string" || !item.opponentId) return null;
  return {
    id: typeof item.id === "string" && item.id ? item.id : `manager-match-recovered-${fallbackSeason}`,
    opponentId: item.opponentId,
    competitionName: typeof item.competitionName === "string" ? item.competitionName : "Copa nacional",
    stageName: typeof item.stageName === "string" ? item.stageName : "Jogo-chave",
    season: Number.isFinite(Number(item.season)) ? Number(item.season) : fallbackSeason,
  };
}

export function normalizeManagerState(value: Partial<ManagerState> | null | undefined) {
  const base = createManagerState(Number(value?.seed) || defaultSeed());
  const merged = { ...base, ...value, mode: "manager" as const, version: 1 as const };
  const club = typeof merged.currentClubId === "string" && merged.currentClubId ? cleanClub(merged.currentClubId) : null;
  const season = Number(merged.season) || base.season;
  const seed = Number(merged.seed) || base.seed;
  const phase = ["onboarding", "career", "result", "dismissed"].includes(merged.phase) ? merged.phase : "onboarding";
  const normalizedWorldPlayers = normalizeWorldPlayerUniverse(merged.worldPlayers, seed, season);
  const worldPlayers = club ? ensureClubSquadPlayers(normalizedWorldPlayers, club.id, season, 14) : normalizedWorldPlayers;
  const clubPlayers = club ? worldPlayersAtClub(worldPlayers, club.id).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id)) : [];
  const rawSquadIds = uniqueIds(merged.squadIds).filter((id) => {
    const player = worldPlayers.players[id];
    return Boolean(player && player.status !== "retired" && (!club || player.currentClubId === club.id));
  });
  const squadIds = club
    ? (rawSquadIds.length >= 8 ? rawSquadIds : clubPlayers.map((player) => player.id)).slice(0, 14)
    : rawSquadIds.slice(0, 14);
  const allowed = new Set(squadIds);
  let starters = uniqueIds(merged.starters).filter((id) => allowed.has(id)).slice(0, 5);
  let bench = uniqueIds(merged.bench).filter((id) => allowed.has(id) && !starters.includes(id)).slice(0, 3);
  if (club && (starters.length !== 5 || bench.length !== 3)) {
    const lineup = chooseLineup(squadIds.map((id) => worldPlayers.players[id]).filter((player): player is WorldPlayer => Boolean(player)));
    starters = lineup.starters;
    bench = lineup.bench;
  }
  const requestedPhase: ManagerPhase = phase === "result" ? "career" : phase;
  const safePhase: ManagerPhase = requestedPhase === "career" && (!club || squadIds.length < 8 || starters.length !== 5 || bench.length !== 3) ? "onboarding" : requestedPhase;
  const savedPendingMatch = normalizePendingMatch(merged.pendingMatch, season);
  const pendingMatch = safePhase === "career"
    ? (savedPendingMatch && CLUBS.some((candidate) => candidate.id === savedPendingMatch.opponentId) && savedPendingMatch.opponentId !== club?.id ? savedPendingMatch : makeMatchPlan({ seed, currentClubId: club?.id ?? "", currentLeagueId: club?.leagueId ?? "", season }))
    : null;
  return {
    ...merged,
    currentClubId: club?.id ?? "",
    currentLeagueId: club?.leagueId ?? "",
    seed,
    season,
    phase: safePhase,
    name: typeof merged.name === "string" ? merged.name : "",
    nationality: typeof merged.nationality === "string" && COUNTRIES.some((country) => country.id === merged.nationality) ? merged.nationality : "brasil",
    objective: typeof merged.objective === "string" ? merged.objective : base.objective,
    reputation: clamp(Number.isFinite(Number(merged.reputation)) ? Number(merged.reputation) : base.reputation),
    boardTrust: clamp(Number.isFinite(Number(merged.boardTrust)) ? Number(merged.boardTrust) : base.boardTrust),
    budget: Math.max(0, Number(merged.budget) || 0),
    worldPlayers,
    squadIds,
    starters,
    bench,
    formationId: typeof merged.formationId === "string" ? formationById(merged.formationId).id : base.formationId,
    pendingMatch,
    history: normalizeHistory(merged.history, season),
    lastResult: normalizeLastResult(merged.lastResult),
    marketOffers: uniqueIds(merged.marketOffers).slice(0, 3),
    jobOffers: uniqueIds(merged.jobOffers).slice(0, 3),
    playerStats: merged.playerStats && typeof merged.playerStats === "object"
      ? Object.fromEntries(Object.entries(merged.playerStats).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value)).map(([id, value]) => {
        const raw = value as Partial<ManagerPlayerStat>;
        return [id, {
          appearances: Math.max(0, Number(raw.appearances) || 0),
          starts: Math.max(0, Number(raw.starts) || 0),
          substitutionsIn: Math.max(0, Number(raw.substitutionsIn) || 0),
          substitutionsOut: Math.max(0, Number(raw.substitutionsOut) || 0),
          goals: Math.max(0, Number(raw.goals) || 0),
          assists: Math.max(0, Number(raw.assists) || 0),
          touches: Math.max(0, Number(raw.touches) || 0),
          flicks: Math.max(0, Number(raw.flicks) || 0),
          distance: Math.max(0, Number(raw.distance) || 0),
        } satisfies ManagerPlayerStat];
      }))
      : {},
  } satisfies ManagerState;
}

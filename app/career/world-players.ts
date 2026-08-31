import { CLUBS, COUNTRIES, POSITIONS } from "../game-data";
import type { Club, Confederation, PositionKey } from "../game-data";
import { rankMarketDestinations } from "./transfer-market";
import { worldPlayerNameForNationality } from "./world-player-name-pools";
import { clamp, clubById, pick, seeded } from "./shared";
import type {
  WorldPlayer, WorldPlayerAdvanceContext, WorldPlayerCareerStats, WorldPlayerHonor,
  WorldPlayerUniverse, WorldPopulationBucket,
} from "./world-player-model";

const EMPTY_STATS: WorldPlayerCareerStats = { seasons: 0, appearances: 0, goals: 0, assists: 0, tackles: 0, cleanSheets: 0 };
const CONFEDERATIONS: Confederation[] = ["SOUTH_AMERICA", "EUROPE", "NORTH_AMERICA", "ASIA", "AFRICA", "OCEANIA"];

export function normalizeWorldPlayerName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

function makePopulation(): WorldPopulationBucket[] {
  return CONFEDERATIONS.flatMap((confederation) => (["u21", "prime", "veteran"] as const).flatMap((ageBand) =>
    (["local", "continental", "elite"] as const).map((level) => ({
      id: `${confederation}:${ageBand}:${level}`, confederation, ageBand, level,
      count: level === "local" ? 2_800 : level === "continental" ? 620 : 95,
    })),
  ));
}

export function emptyWorldPlayerUniverse(seed: number, season: number): WorldPlayerUniverse {
  return { schemaVersion: 1, seed, initializedSeason: season, lastAdvancedSeason: season, nextSerial: 0, population: makePopulation(), players: {}, rivalLinks: {}, aliases: {} };
}

function countryPool(confederation: Confederation) {
  return COUNTRIES.filter((country) => country.confederation === confederation);
}

function clubPoolForCountry(countryId: string) {
  const country = COUNTRIES.find((item) => item.id === countryId);
  const domestic = CLUBS.filter((club) => club.countryId === countryId);
  if (domestic.length) return domestic;
  return CLUBS.filter((club) => COUNTRIES.find((item) => item.id === club.countryId)?.confederation === country?.confederation);
}

function stablePlayerId(seed: number, season: number, serial: number) {
  return `wp-${(seed >>> 0).toString(36)}-${season.toString(36)}-${serial.toString(36)}`;
}

function generatedPlayer(universe: WorldPlayerUniverse, season: number, serial: number): WorldPlayer {
  const salt = 30_011 + serial * 97;
  const confederation = pick(CONFEDERATIONS, universe.seed, salt);
  const nationality = pick(countryPool(confederation), universe.seed, salt + 3)?.id ?? "brasil";
  const position = pick(POSITIONS, universe.seed, salt + 7).key;
  const age = 17 + Math.floor(seeded(universe.seed, salt + 11) * 17);
  const overall = clamp(Math.round(57 + seeded(universe.seed, salt + 13) * 27), 54, 85);
  const potential = clamp(overall + 2 + Math.floor(seeded(universe.seed, salt + 17) * Math.max(4, 94 - overall)), overall, 95);
  const clubs = clubPoolForCountry(nationality);
  const club = pick(clubs.length ? clubs : CLUBS, universe.seed, salt + 19);
  const id = stablePlayerId(universe.seed, season, serial);
  const baseName = worldPlayerNameForNationality(nationality, universe.seed, salt + 23);
  const name = Object.values(universe.players).some((player) => normalizeWorldPlayerName(player.name) === normalizeWorldPlayerName(baseName))
    ? `${baseName} ${serial + 1}`
    : baseName;
  return {
    id, source: "generated", name, nationality, position, birthSeason: season - age, generatedSeason: season,
    overall, potential, reputation: clamp(overall - 42 + (club?.reputation ?? 1) * 6), status: "active",
    currentClubId: club?.id ?? CLUBS[0].id, parentClubId: "", loanEndSeason: 0,
    contractUntilSeason: season + 2 + Math.floor(seeded(universe.seed, salt + 31) * 4), retiredSeason: null,
    careerStats: { ...EMPTY_STATS },
    clubHistory: [{ clubId: club?.id ?? CLUBS[0].id, joinedSeason: season, leftSeason: null, moveType: "generated", transferFee: 0 }], honors: [],
  };
}

export function createWorldPlayerUniverse(seed: number, season: number, targetPlayers = 42) {
  let universe = emptyWorldPlayerUniverse(seed, season);
  for (let serial = 0; serial < targetPlayers; serial += 1) {
    const player = generatedPlayer(universe, season, serial);
    universe = { ...universe, nextSerial: serial + 1, players: { ...universe.players, [player.id]: player }, aliases: { ...universe.aliases, [normalizeWorldPlayerName(player.name)]: player.id } };
  }
  return universe;
}

function playerFromRival(universe: WorldPlayerUniverse, rival: NonNullable<WorldPlayerAdvanceContext["rivals"]>[number], season: number): WorldPlayer {
  const id = stablePlayerId(universe.seed, season, universe.nextSerial);
  return {
    id, source: "rival", name: rival.name, nationality: rival.nationality, position: rival.position,
    birthSeason: season - rival.age, generatedSeason: season, overall: rival.overall,
    potential: clamp(rival.overall + Math.max(2, 25 - rival.age), rival.overall, 95), reputation: clamp(rival.overall - 35),
    status: rival.active ? "active" : "retired", currentClubId: rival.currentClubId, parentClubId: "", loanEndSeason: 0,
    contractUntilSeason: season + 3, retiredSeason: rival.active ? null : season, careerStats: {
      ...EMPTY_STATS, appearances: rival.appearances, goals: rival.goals, assists: rival.assists,
    }, clubHistory: rival.currentClubId ? [{ clubId: rival.currentClubId, joinedSeason: season, leftSeason: null, moveType: "generated", transferFee: 0 }] : [], honors: [],
  };
}

export function syncRivalsToWorldPlayers(universe: WorldPlayerUniverse, rivals: WorldPlayerAdvanceContext["rivals"], season: number) {
  if (!rivals?.length) return universe;
  const players = { ...universe.players };
  const rivalLinks = { ...universe.rivalLinks };
  const aliases = { ...universe.aliases };
  let nextSerial = universe.nextSerial;
  for (const rival of rivals) {
    let playerId = rivalLinks[rival.id] || aliases[normalizeWorldPlayerName(rival.name)];
    let player = playerId ? players[playerId] : undefined;
    if (!player) {
      player = playerFromRival({ ...universe, nextSerial }, rival, season);
      playerId = player.id;
      nextSerial += 1;
    }
    const changedClub = Boolean(rival.currentClubId && player.currentClubId && rival.currentClubId !== player.currentClubId);
    players[playerId] = {
      ...player, source: "rival", name: rival.name, nationality: rival.nationality, position: rival.position,
      birthSeason: season - rival.age, overall: rival.overall, currentClubId: rival.currentClubId,
      status: rival.active ? "active" : "retired", retiredSeason: rival.active ? null : player.retiredSeason ?? season,
      careerStats: { ...player.careerStats, appearances: rival.appearances, goals: rival.goals, assists: rival.assists },
      clubHistory: changedClub
        ? [...player.clubHistory.map((spell, index) => index === player.clubHistory.length - 1 ? { ...spell, leftSeason: season } : spell), { clubId: rival.currentClubId, joinedSeason: season, leftSeason: null, moveType: "permanent", transferFee: 0 }]
        : player.clubHistory,
    };
    rivalLinks[rival.id] = playerId;
    aliases[normalizeWorldPlayerName(rival.name)] = playerId;
  }
  return { ...universe, players, rivalLinks, aliases, nextSerial };
}

function seasonStats(player: WorldPlayer, season: number) {
  const position = POSITIONS.find((item) => item.key === player.position) ?? POSITIONS[0];
  const age = season - player.birthSeason;
  const availability = player.status === "free-agent" ? 0 : clamp(30 + (player.overall - 68) * 0.65 - Math.max(0, age - 32) * 1.5, 7, 51);
  const appearances = Math.round(availability * (0.82 + seeded(Number.parseInt(player.id.slice(-3), 36) || 1, season * 401) * 0.28));
  const quality = clamp((player.overall - 48) / 28, 0.35, 1.7);
  return {
    appearances,
    goals: player.position === "GOL" ? 0 : Math.round(appearances * position.goals * quality * (0.75 + seeded(player.birthSeason, season * 409) * 0.75)),
    assists: player.position === "GOL" ? Math.round(seeded(player.birthSeason, season * 419) * 2) : Math.round(appearances * position.assists * quality * (0.75 + seeded(player.birthSeason, season * 421) * 0.75)),
    tackles: position.zone === "defesa" || position.zone === "meio" ? Math.round(appearances * (1.15 + seeded(player.birthSeason, season * 431) * 1.8)) : 0,
    cleanSheets: player.position === "GOL" ? Math.round(appearances * (0.18 + quality * 0.16)) : 0,
  };
}

function development(player: WorldPlayer, season: number) {
  const age = season - player.birthSeason;
  const roll = seeded(player.birthSeason + player.generatedSeason, season * 443);
  if (age <= 20) return player.overall < player.potential ? (roll < 0.18 ? 0 : roll > 0.8 ? 3 : 2) : 0;
  if (age <= 24) return player.overall < player.potential ? (roll > 0.44 ? 1 : 0) : 0;
  if (age <= 29) return roll > 0.88 && player.overall < player.potential ? 1 : 0;
  if (age <= 32) return roll < 0.12 ? -1 : 0;
  return age >= 36 ? (roll > 0.18 ? -2 : -1) : (roll > 0.42 ? -1 : 0);
}

function closeSpell(history: WorldPlayer["clubHistory"], season: number) {
  return history.map((spell, index) => index === history.length - 1 && spell.leftSeason === null ? { ...spell, leftSeason: season } : spell);
}

function advancePlayer(player: WorldPlayer, universe: WorldPlayerUniverse, season: number): WorldPlayer {
  if (player.status === "retired" || player.source === "rival") return player;
  const age = season - player.birthSeason;
  if (age >= 36 && seeded(universe.seed, season * 457 + Number.parseInt(player.id.slice(-3), 36)) < clamp((age - 34) * 0.18, 0.12, 0.92)) {
    return { ...player, status: "retired", currentClubId: "", retiredSeason: season, clubHistory: closeSpell(player.clubHistory, season) };
  }
  let next: WorldPlayer = { ...player, overall: clamp(player.overall + development(player, season), 45, player.potential) };
  if (next.status === "loaned" && season >= next.loanEndSeason) {
    next = { ...next, status: "active", currentClubId: next.parentClubId, parentClubId: "", loanEndSeason: 0, clubHistory: [...closeSpell(next.clubHistory, season), { clubId: next.parentClubId, joinedSeason: season, leftSeason: null, moveType: "loan-return", transferFee: 0 }] };
  }
  const stats = seasonStats(next, season);
  next = { ...next, careerStats: { seasons: next.careerStats.seasons + 1, appearances: next.careerStats.appearances + stats.appearances, goals: next.careerStats.goals + stats.goals, assists: next.careerStats.assists + stats.assists, tackles: next.careerStats.tackles + stats.tackles, cleanSheets: next.careerStats.cleanSheets + stats.cleanSheets }, reputation: clamp(Math.round(next.reputation * 0.86 + (next.overall - 45) * 0.5 + (stats.goals + stats.assists) * 0.16)) };
  const contractExpired = next.status === "free-agent" || season >= next.contractUntilSeason;
  const wantsMove = contractExpired || seeded(universe.seed, season * 467 + Number.parseInt(next.id.slice(-3), 36)) < (age <= 22 && stats.appearances < 16 ? 0.25 : 0.1);
  const sourceClubId = next.currentClubId || next.clubHistory.at(-1)?.clubId || "";
  if (!wantsMove || !sourceClubId) return next;
  const source = clubById(sourceClubId);
  const loan = !contractExpired && age <= 23 && stats.appearances < 16;
  const choices = rankMarketDestinations({ seed: universe.seed + Number.parseInt(next.id.slice(-3), 36), season, age, position: next.position, overall: next.overall, reputation: next.reputation, currentClubId: source.id, academyCountryId: next.nationality, contractYears: Math.max(0, next.contractUntilSeason - season), performanceScore: clamp(40 + stats.appearances + stats.goals * 2 + stats.assists * 1.5), currentRole: stats.appearances < 14 ? "reserva" : stats.appearances < 24 ? "rotacao" : "titular" }, { mode: loan ? "loan" : contractExpired ? "free-agent" : "permanent", count: 4 });
  const destination = choices[0];
  if (!destination) return contractExpired ? { ...next, status: "free-agent", currentClubId: "", clubHistory: closeSpell(next.clubHistory, season) } : next;
  return { ...next, status: loan ? "loaned" : "active", currentClubId: destination.clubId, parentClubId: loan ? source.id : "", loanEndSeason: loan ? season + 1 : 0, contractUntilSeason: loan ? next.contractUntilSeason : season + 2 + Math.floor(seeded(universe.seed, season * 479) * 4), clubHistory: [...closeSpell(next.clubHistory, season), { clubId: destination.clubId, joinedSeason: season, leftSeason: null, moveType: loan ? "loan" : contractExpired ? "free-agent" : "permanent", transferFee: destination.transferFee }] };
}

export function resolveWorldPlayerByName(universe: WorldPlayerUniverse, name: string) {
  const id = universe.aliases[normalizeWorldPlayerName(name)];
  return id ? universe.players[id] ?? null : null;
}

export function ensureKnownWorldPlayer(universe: WorldPlayerUniverse, identity: { name: string; season: number; nationality?: string; position?: PositionKey; clubId?: string; source?: "award" | "generated" }) {
  const known = resolveWorldPlayerByName(universe, identity.name);
  if (known) return { universe, player: known };
  const generated = generatedPlayer(universe, identity.season, universe.nextSerial);
  const player: WorldPlayer = { ...generated, source: identity.source ?? "award", name: identity.name, nationality: identity.nationality ?? generated.nationality, position: identity.position ?? generated.position, currentClubId: identity.clubId ?? generated.currentClubId };
  return { universe: { ...universe, nextSerial: universe.nextSerial + 1, players: { ...universe.players, [player.id]: player }, aliases: { ...universe.aliases, [normalizeWorldPlayerName(player.name)]: player.id } }, player };
}

export function recordWorldPlayerHonor(universe: WorldPlayerUniverse, playerId: string, honor: Omit<WorldPlayerHonor, "id">) {
  const player = universe.players[playerId];
  if (!player) return universe;
  const id = `${playerId}:${honor.kind}:${honor.season}:${normalizeWorldPlayerName(honor.name)}`;
  if (player.honors.some((item) => item.id === id)) return universe;
  return { ...universe, players: { ...universe.players, [playerId]: { ...player, honors: [...player.honors, { ...honor, id }] } } };
}

export function worldPlayerHonors(universe: WorldPlayerUniverse, playerId: string, kind?: WorldPlayerHonor["kind"]) {
  return (universe.players[playerId]?.honors ?? []).filter((honor) => !kind || honor.kind === kind);
}

function addAwardWinners(universe: WorldPlayerUniverse, context: WorldPlayerAdvanceContext) {
  let next = universe;
  for (const nomination of context.awardNominations ?? []) {
    if (!nomination.winner || normalizeWorldPlayerName(nomination.winner) === normalizeWorldPlayerName(context.protagonistName ?? "")) continue;
    const ensured = ensureKnownWorldPlayer(next, { name: nomination.winner, season: context.season, source: "award" });
    next = recordWorldPlayerHonor(ensured.universe, ensured.player.id, { season: context.season - 1, kind: "award", name: nomination.award, clubId: ensured.player.currentClubId });
  }
  return next;
}



const SQUAD_POSITION_TEMPLATE: PositionKey[] = [
  "GOL", "LD", "ZAG", "ZAG", "LE", "VOL", "MC", "MEI", "PD", "PE", "CA", "GOL", "ZAG", "MC", "CA",
];

function stableTextSalt(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Materializa apenas o núcleo relevante de um elenco. É deliberadamente uma API
 * neutra: carreira de jogador e o futuro modo treinador compartilham os mesmos
 * World Players, contratos e histórico, sem criar um segundo banco de atletas.
 */
export function ensureClubSquadPlayers(universe: WorldPlayerUniverse, clubId: string, season: number, target = 14) {
  const club = CLUBS.find((candidate) => candidate.id === clubId);
  if (!club || !clubId) return universe;
  const wanted = clamp(Math.round(target), 11, SQUAD_POSITION_TEMPLATE.length);
  const current = Object.values(universe.players).filter((player) => player.status !== "retired" && player.currentClubId === clubId);
  if (current.length >= wanted) return universe;

  const players = { ...universe.players };
  const aliases = { ...universe.aliases };
  const confederation = COUNTRIES.find((country) => country.id === club.countryId)?.confederation;
  const foreignPool = COUNTRIES.filter((country) => country.confederation === confederation && country.id !== club.countryId);
  const clubSalt = stableTextSalt(club.id);
  let added = 0;
  let serial = 0;

  while (current.length + added < wanted) {
    const slot = serial % SQUAD_POSITION_TEMPLATE.length;
    const id = `squad-${club.id}-${season}-${serial}`;
    serial += 1;
    if (players[id]) continue;
    const salt = clubSalt + season * 997 + serial * 131 + universe.seed * 3;
    const position = SQUAD_POSITION_TEMPLATE[slot % SQUAD_POSITION_TEMPLATE.length];
    const foreign = seeded(universe.seed, salt + 11) < 0.28;
    const nationality = foreign && foreignPool.length
      ? pick(foreignPool, universe.seed, salt + 17).id
      : club.countryId;
    const age = 18 + Math.floor(seeded(universe.seed, salt + 23) * 17);
    const starterBand = slot < 11 ? 0 : -5;
    const overall = clamp(Math.round(club.strength - 5 + seeded(universe.seed, salt + 29) * 10 + starterBand), 52, 94);
    const youthCeiling = age <= 22 ? 10 : age <= 26 ? 6 : 3;
    const potential = clamp(overall + Math.floor(seeded(universe.seed, salt + 31) * (youthCeiling + 1)), overall, 95);
    const baseName = worldPlayerNameForNationality(nationality, universe.seed, salt + 37);
    let name = baseName;
    let suffix = 2;
    while (aliases[normalizeWorldPlayerName(name)]) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }
    const player: WorldPlayer = {
      id,
      source: "squad",
      name,
      nationality,
      position,
      birthSeason: season - age,
      generatedSeason: season,
      overall,
      potential,
      reputation: clamp(overall - 42 + club.reputation * 5),
      status: "active",
      currentClubId: club.id,
      parentClubId: "",
      loanEndSeason: 0,
      contractUntilSeason: season + 2 + Math.floor(seeded(universe.seed, salt + 43) * 4),
      retiredSeason: null,
      careerStats: { ...EMPTY_STATS },
      clubHistory: [{ clubId: club.id, joinedSeason: season, leftSeason: null, moveType: "generated", transferFee: 0 }],
      honors: [],
    };
    players[id] = player;
    aliases[normalizeWorldPlayerName(name)] = id;
    added += 1;
  }
  return { ...universe, players, aliases };
}

export function advanceWorldPlayerUniverse(current: WorldPlayerUniverse | undefined, context: WorldPlayerAdvanceContext) {
  let universe = current?.schemaVersion === 1 ? current : createWorldPlayerUniverse(current?.seed ?? 1, context.season - 1);
  universe = syncRivalsToWorldPlayers(universe, context.rivals, context.season);
  if (context.focusClubId) universe = ensureClubSquadPlayers(universe, context.focusClubId, context.season, 14);
  if (universe.lastAdvancedSeason >= context.season) return addAwardWinners(universe, context);
  let players = Object.fromEntries(Object.entries(universe.players).map(([id, player]) => [id, advancePlayer(player, universe, context.season)]));
  const staleIds = new Set(Object.values(players).filter((player) =>
    player.source === "generated" && player.status === "retired" && player.honors.length === 0 &&
    player.retiredSeason !== null && context.season - player.retiredSeason > 6,
  ).map((player) => player.id));
  players = Object.fromEntries(Object.entries(players).filter(([id]) => !staleIds.has(id)));
  let nextSerial = universe.nextSerial;
  const activeCount = Object.values(players).filter((player) => player.status !== "retired").length;
  for (let index = activeCount; index < 42; index += 1) {
    const player = generatedPlayer({ ...universe, players, nextSerial }, context.season, nextSerial);
    players[player.id] = player;
    nextSerial += 1;
  }
  const aliases = Object.fromEntries(Object.entries(universe.aliases).filter(([, id]) => !staleIds.has(id)));
  for (const player of Object.values(players)) aliases[normalizeWorldPlayerName(player.name)] = player.id;
  universe = { ...universe, players, aliases, nextSerial, lastAdvancedSeason: context.season };
  universe = syncRivalsToWorldPlayers(universe, context.rivals, context.season);
  return addAwardWinners(universe, context);
}

function normalizeWorldPlayer(value: unknown, id: string, season: number): WorldPlayer | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !id) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  const source = raw.source === "generated" || raw.source === "rival" || raw.source === "award" || raw.source === "squad" ? raw.source : "generated";
  const status = raw.status === "active" || raw.status === "loaned" || raw.status === "free-agent" || raw.status === "retired" ? raw.status : "active";
  const nationality = typeof raw.nationality === "string" && COUNTRIES.some((country) => country.id === raw.nationality) ? raw.nationality : "brasil";
  const position = typeof raw.position === "string" && POSITIONS.some((item) => item.key === raw.position) ? raw.position as PositionKey : "MC";
  const currentClubId = status === "retired" ? "" : typeof raw.currentClubId === "string" && CLUBS.some((club) => club.id === raw.currentClubId) ? raw.currentClubId : "";
  const parentClubId = typeof raw.parentClubId === "string" && CLUBS.some((club) => club.id === raw.parentClubId) ? raw.parentClubId : "";
  const number = (input: unknown, fallback: number) => Number.isFinite(Number(input)) ? Number(input) : fallback;
  const rawStats = raw.careerStats && typeof raw.careerStats === "object" && !Array.isArray(raw.careerStats) ? raw.careerStats as Record<string, unknown> : {};
  const careerStats: WorldPlayerCareerStats = {
    seasons: Math.max(0, Math.floor(number(rawStats.seasons, 0))),
    appearances: Math.max(0, Math.floor(number(rawStats.appearances, 0))),
    goals: Math.max(0, Math.floor(number(rawStats.goals, 0))),
    assists: Math.max(0, Math.floor(number(rawStats.assists, 0))),
    tackles: Math.max(0, Math.floor(number(rawStats.tackles, 0))),
    cleanSheets: Math.max(0, Math.floor(number(rawStats.cleanSheets, 0))),
  };
  const validMoveTypes = ["permanent", "loan", "free-agent", "renewal", "generated", "loan-return"];
  const clubHistory = Array.isArray(raw.clubHistory)
    ? raw.clubHistory.filter((spell): spell is Record<string, unknown> => Boolean(spell) && typeof spell === "object" && !Array.isArray(spell)).map((spell) => ({
      clubId: typeof spell.clubId === "string" && CLUBS.some((club) => club.id === spell.clubId) ? spell.clubId : "",
      joinedSeason: number(spell.joinedSeason, season),
      leftSeason: spell.leftSeason === null ? null : Number.isFinite(Number(spell.leftSeason)) ? Number(spell.leftSeason) : season,
      moveType: (validMoveTypes.includes(String(spell.moveType)) ? String(spell.moveType) : "generated") as WorldPlayer["clubHistory"][number]["moveType"],
      transferFee: Math.max(0, number(spell.transferFee, 0)),
    })).filter((spell) => spell.clubId)
    : [];
  const normalizedHistory = clubHistory.length || !currentClubId ? clubHistory : [{ clubId: currentClubId, joinedSeason: season, leftSeason: null, moveType: "generated" as const, transferFee: 0 }];
  const rawHonors = Array.isArray(raw.honors) ? raw.honors : [];
  const honors = rawHonors.filter((honor): honor is Record<string, unknown> => Boolean(honor) && typeof honor === "object" && !Array.isArray(honor)).map((honor, index) => ({
    id: typeof honor.id === "string" && honor.id ? honor.id : `${id}:honor:${index}`,
    season: number(honor.season, season),
    kind: honor.kind === "trophy" ? "trophy" as const : "award" as const,
    name: typeof honor.name === "string" && honor.name ? honor.name : "Reconhecimento",
    clubId: typeof honor.clubId === "string" && CLUBS.some((club) => club.id === honor.clubId) ? honor.clubId : currentClubId,
    ...(typeof honor.competitionId === "string" ? { competitionId: honor.competitionId } : {}),
  }));
  const overall = clamp(Math.round(number(raw.overall, 60)), 45, 99);
  return {
    id,
    source,
    name: raw.name.trim(),
    nationality,
    position,
    birthSeason: Math.floor(number(raw.birthSeason, season - 24)),
    generatedSeason: Math.floor(number(raw.generatedSeason, season)),
    overall,
    potential: clamp(Math.round(number(raw.potential, overall)), overall, 99),
    reputation: clamp(Math.round(number(raw.reputation, overall - 35))),
    status,
    currentClubId,
    parentClubId,
    loanEndSeason: Math.max(0, Math.floor(number(raw.loanEndSeason, 0))),
    contractUntilSeason: Math.floor(number(raw.contractUntilSeason, season + 2)),
    retiredSeason: raw.retiredSeason === null ? null : Number.isFinite(Number(raw.retiredSeason)) ? Number(raw.retiredSeason) : status === "retired" ? season : null,
    careerStats,
    clubHistory: normalizedHistory,
    honors,
  };
}

export function normalizeWorldPlayerUniverse(value: unknown, seed: number, season: number, rivals: WorldPlayerAdvanceContext["rivals"] = []) {
  if (!value || typeof value !== "object" || (value as Partial<WorldPlayerUniverse>).schemaVersion !== 1) {
    return syncRivalsToWorldPlayers(createWorldPlayerUniverse(seed, season), rivals, season);
  }
  const saved = value as Partial<WorldPlayerUniverse>;
  const base = emptyWorldPlayerUniverse(seed, season);
  const rawPlayers = saved.players && typeof saved.players === "object" && !Array.isArray(saved.players) ? saved.players : {};
  const players = Object.fromEntries(Object.entries(rawPlayers)
    .map(([id, player]) => [id, normalizeWorldPlayer(player, id, season)] as const)
    .filter((entry): entry is readonly [string, WorldPlayer] => Boolean(entry[1]))) as Record<string, WorldPlayer>;
  const universe: WorldPlayerUniverse = {
    ...base, ...saved, schemaVersion: 1, seed: Number(saved.seed) || seed,
    initializedSeason: Number(saved.initializedSeason) || season,
    lastAdvancedSeason: Number(saved.lastAdvancedSeason) || season,
    nextSerial: Number(saved.nextSerial) || Object.keys(players).length,
    population: Array.isArray(saved.population) && saved.population.length ? saved.population : base.population,
    players,
    rivalLinks: saved.rivalLinks && typeof saved.rivalLinks === "object" ? saved.rivalLinks : {},
    aliases: saved.aliases && typeof saved.aliases === "object" ? saved.aliases : {},
  };
  return syncRivalsToWorldPlayers(universe, rivals, season);
}

export function worldPlayersAtClub(universe: WorldPlayerUniverse, clubId: string) {
  return Object.values(universe.players).filter((player) => player.status !== "retired" && player.currentClubId === clubId);
}

export function worldPlayerById(universe: WorldPlayerUniverse, playerId: string) {
  return universe.players[playerId] ?? null;
}

export function worldPlayerClubHistory(universe: WorldPlayerUniverse, playerId: string) {
  return universe.players[playerId]?.clubHistory ?? [];
}

export function notableWorldPlayers(universe: WorldPlayerUniverse, limit = 20) {
  return Object.values(universe.players).filter((player) => player.status !== "retired").sort((a, b) => b.reputation - a.reputation || b.overall - a.overall || a.id.localeCompare(b.id)).slice(0, limit);
}

export function clubForWorldPlayer(player: WorldPlayer): Club | null {
  return player.currentClubId ? clubById(player.currentClubId) : null;
}

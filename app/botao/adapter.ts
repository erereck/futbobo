// Ponte entre a carreira do Futbobo e o modo botão.
//
// Este é o ÚNICO arquivo do módulo que importa `game-data`. Todo o resto
// (engine, cpu, render, componente) não conhece clube, liga nem temporada — é
// aqui que se traduz "final da Libertadores do Palmeiras contra o River" para
// um `BotaoMatchSetup`, e o resultado de volta para "campeão / vice".

import { CLUBS, COUNTRIES, countryById, leagueById, type Club, type Country, type PositionKey } from "../game-data";
import { VERIFIED_CLUB_ASSET_IDS } from "../verified-club-assets";
import { difficultyFromStrength } from "./cpu";
import { ensureContrastingKits } from "./kits";
import { createRng, hashSeed } from "./rng";
import {
  DEFAULT_BOTAO_RULES,
  type BotaoMatchResult,
  type BotaoMatchSetup,
  type BotaoPositionKey,
  type BotaoRules,
  type BotaoTeam,
  type BotaoTimelineEntry,
} from "./types";

/** As 12 posições do Futbobo são exatamente as do módulo — a conversão é explícita para o compilador travar se uma delas mudar. */
export function toBotaoPosition(position: PositionKey): BotaoPositionKey {
  return position;
}

/** Escudo real quando existe arquivo verificado; senão o HUD cai na sigla. */
export function clubBadgePath(club: Club): string | undefined {
  if (club.customBadge) return club.customBadge;
  if (!VERIFIED_CLUB_ASSET_IDS.has(club.id)) return undefined;
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/clubs/${club.id}.png`;
}

export function botaoTeamFromClub(club: Club): BotaoTeam {
  return {
    id: club.id,
    name: club.name,
    shortName: club.shortName,
    abbr: club.abbr,
    primary: club.primary,
    secondary: club.secondary,
    strength: club.strength,
    badge: clubBadgePath(club),
  };
}

export function botaoTeamFromCountry(country: Country): BotaoTeam {
  return {
    id: `national-${country.id}`,
    name: `Seleção de ${country.name}`,
    shortName: country.name,
    abbr: country.abbr,
    primary: country.primary,
    secondary: country.secondary,
    strength: Math.max(62, Math.min(92, 62 + country.strength * 5)),
    badge: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/flags/${country.id}.png`,
  };
}

export type FinalScope = "domestic" | "continental" | "world";

/**
 * Sorteia um adversário plausível para a final.
 * Final nacional puxa da mesma liga; continental, da mesma confederação;
 * Mundial, de qualquer lugar — sempre entre os clubes mais fortes disponíveis.
 */
export function pickFinalOpponent(args: {
  clubId: string;
  leagueId?: string;
  scope: FinalScope;
  seed: number;
  season: number;
  competitionId: string;
}): Club {
  const club = CLUBS.find((candidate) => candidate.id === args.clubId) ?? CLUBS[0];
  const confederation = countryById(club.countryId).confederation;
  const eliteFinal = new Set([
    "championsLeague",
    "domesticSuperCup",
    "uefaSuperCup",
    "recopaSudamericana",
    "campeonesCup",
  ]).has(args.competitionId);
  const scopedPool = CLUBS.filter((candidate) => {
    if (candidate.id === club.id) return false;
    if (args.scope === "domestic") {
      const leagueId = args.leagueId ?? club.leagueId;
      if (args.competitionId === "domesticCup" && leagueId === "brasileirao-b") {
        return candidate.leagueId === "brasileirao";
      }
      if (args.competitionId === "domesticCup" && leagueId === "championship") {
        return candidate.leagueId === "premier";
      }
      return candidate.leagueId === leagueId;
    }
    if (args.scope === "continental") {
      if (args.competitionId === "libertadores") {
        return countryById(candidate.countryId).confederation === confederation && candidate.countryId !== club.countryId;
      }
      return countryById(candidate.countryId).confederation === confederation;
    }
    return candidate.strength >= 78;
  });
  const elitePool = scopedPool.filter((candidate) => candidate.reputation >= 4);
  const pool = eliteFinal && elitePool.length > 0 ? elitePool : scopedPool;
  const fallback = pool.length > 0 ? pool : CLUBS.filter((candidate) => candidate.id !== club.id);
  // Quem chega a uma final costuma ser grande, mas não é sempre o mesmo trio:
  // sorteio ponderado pela força dá variedade sem escalar time de meio de tabela.
  const viable = fallback.filter((candidate) => candidate.strength >= club.strength - 14);
  const contenders = viable.length >= 4 ? viable : fallback;
  const weights = contenders.map((candidate) => Math.pow(Math.max(1, candidate.strength - 45), 2.4));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const roll = createRng(hashSeed(args.seed, args.season, args.competitionId, club.id)).next() * total;
  let cursor = 0;
  for (let index = 0; index < contenders.length; index += 1) {
    cursor += weights[index];
    if (roll <= cursor) return contenders[index];
  }
  return contenders[contenders.length - 1];
}

/** Sorteio regional do Mundial: campeões sul-americanos dominam o pote de uma
 * final contra europeu; nas fases anteriores a chave evita entregar outro
 * europeu antes da decisão. */
export function pickClubWorldOpponent(args: {
  clubId: string;
  seed: number;
  season: number;
  stageName: string;
  excludedClubIds?: string[];
}): Club {
  const club = CLUBS.find((candidate) => candidate.id === args.clubId) ?? CLUBS[0];
  const userConfederation = countryById(club.countryId).confederation;
  const excluded = new Set([club.id, ...(args.excludedClubIds ?? [])]);
  const eligible = CLUBS.filter((candidate) => !excluded.has(candidate.id));
  const confed = (candidate: Club) => countryById(candidate.countryId).confederation;
  const strong = (pool: Club[], minimumReputation = 3) => {
    const filtered = pool.filter((candidate) => candidate.reputation >= minimumReputation);
    return filtered.length ? filtered : pool;
  };
  let pool: Club[] = [];

  if (args.stageName === "Final" && userConfederation !== "EUROPE") {
    pool = strong(eligible.filter((candidate) => confed(candidate) === "EUROPE"), 4);
  } else if (args.stageName === "Final") {
    const roll = createRng(hashSeed(args.seed, args.season, "club-world-region", club.id)).next();
    const target = roll < .5 ? "SOUTH_AMERICA" : roll < .65 ? "NORTH_AMERICA" : roll < .9 ? "ASIA" : "OCEANIA";
    pool = eligible.filter((candidate) => confed(candidate) === target);
    if (target === "SOUTH_AMERICA") pool = strong(pool, 4);
    if (!pool.length) pool = eligible.filter((candidate) => confed(candidate) !== "EUROPE");
  } else {
    pool = eligible.filter((candidate) => {
      const candidateConfed = confed(candidate);
      if (userConfederation === "SOUTH_AMERICA") return candidateConfed === "ASIA" || candidateConfed === "NORTH_AMERICA";
      return candidateConfed !== "EUROPE" && candidateConfed !== userConfederation;
    });
  }

  const fallback = pool.length ? pool : eligible;
  const weights = fallback.map((candidate) => Math.pow(Math.max(1, candidate.strength - 48), 2.2));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = createRng(hashSeed(args.seed, args.season, "club-world", args.stageName, club.id)).next() * total;
  for (let index = 0; index < fallback.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return fallback[index];
  }
  return fallback[fallback.length - 1];
}

export function pickNationalOpponent(args: {
  countryId: string;
  seed: number;
  season: number;
  competitionId: string;
  stageName: string;
  excludedCountryIds?: string[];
}): Country {
  const country = countryById(args.countryId);
  const excludedCountryIds = new Set([country.id, ...(args.excludedCountryIds ?? [])]);
  const isGlobalTournament =
    args.competitionId === "world-cup" ||
    args.competitionId.includes("jogos-ol") ||
    args.competitionId.includes("mundial-sub");
  const isGlobalFinal = isGlobalTournament && args.stageName === "Final";
  const sameTournamentPool = COUNTRIES.filter((candidate) => {
    if (excludedCountryIds.has(candidate.id)) return false;
    // A final do Mundial sempre guarda uma potência inédita. Nas fases
    // anteriores há mais variedade, mas uma seleção eliminada nunca volta.
    if (isGlobalTournament) return candidate.strength >= (isGlobalFinal ? 4 : 2);
    return candidate.confederation === country.confederation;
  });
  const unseenCountries = COUNTRIES.filter((candidate) => !excludedCountryIds.has(candidate.id));
  const strongUnseenCountries = unseenCountries.filter((candidate) => candidate.strength >= 4);
  const pool = sameTournamentPool.length > 0
    ? sameTournamentPool
    : isGlobalFinal && strongUnseenCountries.length > 0
      ? strongUnseenCountries
      : unseenCountries;
  const weights = pool.map((candidate) => Math.pow(Math.max(1, candidate.strength + 1), 2.1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const roll = createRng(
    hashSeed(args.seed, args.season, args.competitionId, args.stageName, country.id),
  ).next() * total;
  let cursor = 0;
  for (let index = 0; index < pool.length; index += 1) {
    cursor += weights[index];
    if (roll <= cursor) return pool[index];
  }
  return pool[pool.length - 1];
}

/** Regras usadas na final da carreira. Preset único para todo mundo jogar a mesma coisa. */
export const CAREER_FINAL_RULES: BotaoRules = { ...DEFAULT_BOTAO_RULES };

export type BotaoNationalTier = "none" | "sub17" | "sub20" | "olympic" | "main";

/** Titularidade segue o nível da seleção e da categoria, sem depender de sorte. */
export function nationalMatchRole(
  overall: number,
  country: Country,
  tier: BotaoNationalTier,
  captain = false,
): "starter" | "reserve" {
  if (captain) return "starter";
  const safeStrength = Math.max(1, Math.min(5, country.strength));
  // A vaga é disputada contra o nível real daquela seleção. Antes, qualquer
  // adulto precisava de 80 OVR: uma régua adequada às potências, mas absurda
  // para países médios e pequenos.
  const requiredOverall = tier === "main" || tier === "none"
    ? 64 + safeStrength * 3.5
    : tier === "olympic"
      ? 62 + safeStrength * 3
      : tier === "sub20"
        ? 58 + safeStrength * 2.5
        : 53 + safeStrength * 2;
  return overall >= Math.round(requiredOverall) ? "starter" : "reserve";
}

function reserveEntry(args: {
  seed: number;
  season: number;
  competitionId: string;
  stageName: string;
  userTeam: BotaoTeam;
  cpuTeam: BotaoTeam;
  rules: BotaoRules;
}) {
  const rng = createRng(hashSeed(args.seed, args.season, args.competitionId, args.stageName, "reserve-entry"));
  const goalRoll = rng.next();
  const totalGoals = goalRoll < 0.42 ? 0 : goalRoll < 0.82 ? 1 : 2;
  const score = { user: 0, cpu: 0 };
  const timeline: BotaoTimelineEntry[] = [];
  const userGoalChance = args.userTeam.strength / Math.max(1, args.userTeam.strength + args.cpuTeam.strength);

  for (let index = 0; index < totalGoals; index += 1) {
    const side = rng.next() < userGoalChance ? "user" : "cpu";
    score[side] += 1;
    const elapsedRatio = totalGoals === 1
      ? rng.range(0.18, 0.82)
      : 0.2 + index * 0.48 + rng.range(0, 0.12);
    const clock = Math.round(args.rules.halfSeconds * (1 - Math.min(0.88, elapsedRatio)));
    const scorer = `#${rng.pick([7, 8, 9, 10, 11, 17])}`;
    timeline.push({
      period: 1,
      clock,
      side,
      kind: "goal",
      scorer,
      assist: null,
      byUser: false,
      beforePlayerEntry: true,
      text: `Gol de ${scorer}`,
    });
  }

  const hasMultiplePeriods = args.rules.halves > 1;
  return {
    role: "reserve" as const,
    period: hasMultiplePeriods ? Math.min(2, args.rules.halves) : 1,
    clock: hasMultiplePeriods ? args.rules.halfSeconds : args.rules.halfSeconds / 2,
    score,
    timeline,
  };
}

export function buildFinalSetup(args: {
  seed: number;
  season: number;
  competitionId: string;
  competitionName: string;
  stageName?: string;
  club: Club;
  opponent: Club;
  playerName: string;
  playerNumber: number;
  position: PositionKey;
  overall: number;
  /** Atributos da carreira (finalização, passe, etc.) para calibrar o botão do jogador. */
  ratings?: { power?: number; control?: number };
  userIsHost?: boolean;
  neutralVenue?: boolean;
  rules?: Partial<BotaoRules>;
  visuals?: BotaoMatchSetup["visuals"];
}): BotaoMatchSetup {
  const kits = ensureContrastingKits(botaoTeamFromClub(args.club), botaoTeamFromClub(args.opponent));
  return {
    matchId: `${args.competitionId}-${args.season}-${args.club.id}`,
    seed: hashSeed(args.seed, args.season, args.competitionId),
    competitionName: args.competitionName,
    stageName: args.stageName ?? "Final",
    neutralVenue: args.neutralVenue ?? true,
    userIsHost: args.userIsHost ?? true,
    player: {
      name: args.playerName || "Você",
      number: args.playerNumber,
      position: toBotaoPosition(args.position),
      overall: args.overall,
      power: args.ratings?.power,
      control: args.ratings?.control,
    },
    userTeam: kits.user,
    cpuTeam: kits.cpu,
    difficulty: difficultyFromStrength(args.opponent.strength),
    rules: { ...CAREER_FINAL_RULES, ...args.rules },
    visuals: args.visuals,
  };
}

export function buildNationalMatchSetup(args: {
  seed: number;
  season: number;
  competitionId: string;
  competitionName: string;
  stageName: string;
  country: Country;
  opponent: Country;
  playerName: string;
  playerNumber: number;
  position: PositionKey;
  overall: number;
  playerRole?: "starter" | "reserve";
  ratings?: { power?: number; control?: number };
  rules?: Partial<BotaoRules>;
  visuals?: BotaoMatchSetup["visuals"];
}): BotaoMatchSetup {
  const kits = ensureContrastingKits(
    botaoTeamFromCountry(args.country),
    botaoTeamFromCountry(args.opponent),
  );
  const rules = { ...CAREER_FINAL_RULES, ...args.rules };
  return {
    matchId: `${args.competitionId}-${args.stageName}-${args.season}-${args.country.id}`,
    seed: hashSeed(args.seed, args.season, args.competitionId, args.stageName),
    competitionName: args.competitionName,
    stageName: args.stageName,
    neutralVenue: true,
    userIsHost: true,
    player: {
      name: args.playerName || "Você",
      number: args.playerNumber,
      position: toBotaoPosition(args.position),
      overall: args.overall,
      power: args.ratings?.power,
      control: args.ratings?.control,
    },
    userTeam: kits.user,
    cpuTeam: kits.cpu,
    difficulty: difficultyFromStrength(kits.cpu.strength),
    rules,
    visuals: args.visuals,
    entry: args.playerRole === "reserve"
      ? reserveEntry({
          seed: args.seed,
          season: args.season,
          competitionId: args.competitionId,
          stageName: args.stageName,
          userTeam: kits.user,
          cpuTeam: kits.cpu,
          rules,
        })
      : undefined,
  };
}

/**
 * Traduz os atributos da carreira em força e controle do botão.
 * Finalização e força viram potência; passe, visão e drible viram controle.
 */
export function ratingsFromAttributes(
  attributes: Partial<Record<string, number>>,
  overall: number,
): { power: number; control: number } {
  const read = (key: string) => attributes[key] ?? overall;
  const power = (read("finishing") + read("strength") + read("longShots")) / 3;
  const control = (read("passing") + read("vision") + read("dribbling")) / 3;
  const scale = (value: number) => Math.max(30, Math.min(100, 40 + (value - 55) * 1.4));
  return { power: scale(power), control: scale(control) };
}

/** O que a temporada precisa saber depois da final. */
export function finalOutcome(result: BotaoMatchResult): { champion: boolean; stage: string } {
  if (result.champion) return { champion: true, stage: "CAMPEÃO" };
  return { champion: false, stage: "Vice" };
}

/** Derrota administrativa usada quando uma partida iniciada é abandonada. */
export function walkoverBotaoResult(setup: BotaoMatchSetup): BotaoMatchResult {
  return {
    matchId: setup.matchId,
    simulated: false,
    walkover: true,
    outcome: "loss",
    goalsFor: 0,
    goalsAgainst: 3,
    penaltyFor: null,
    penaltyAgainst: null,
    playerGoals: 0,
    playerAssists: 0,
    manOfTheMatch: false,
    decision: "regulation",
    turns: 0,
    stats: {
      user: { flicks: 0, touches: 0, posts: 0 },
      cpu: { flicks: 0, touches: 0, posts: 0 },
    },
    timeline: [],
    champion: false,
  };
}

/** Rótulo do adversário para a narração da temporada. */
export function describeFinal(setup: BotaoMatchSetup, result: BotaoMatchResult): string {
  if (result.walkover) {
    return `Final da ${setup.competitionName}: derrota por W.O. contra o ${setup.cpuTeam.shortName} após abandono da partida.`;
  }
  const score = `${result.goalsFor} x ${result.goalsAgainst}`;
  const penalties =
    result.penaltyFor !== null && result.penaltyAgainst !== null
      ? ` (${result.penaltyFor} x ${result.penaltyAgainst} nos pênaltis)`
      : "";
  const verb = result.champion ? "venceu" : "perdeu para";
  return `Final da ${setup.competitionName}: seu time ${verb} o ${setup.cpuTeam.shortName} por ${score}${penalties}.`;
}

/** Nome da liga/país só para exibir na antessala. */
export function isMatchGoal(entry: BotaoTimelineEntry) {
  return entry.kind === "goal" || entry.kind === "own-goal";
}

export function formatGoalMinute(entry: BotaoTimelineEntry, rules: BotaoRules) {
  const inExtraTime = entry.period > rules.halves;
  const segmentSeconds = inExtraTime ? rules.extraSeconds : rules.halfSeconds;
  const segmentMinutes = inExtraTime
    ? 30 / Math.max(1, rules.extraHalves)
    : 90 / Math.max(1, rules.halves);
  const segmentIndex = inExtraTime ? entry.period - rules.halves - 1 : entry.period - 1;
  const minuteBase = inExtraTime ? 90 + segmentIndex * segmentMinutes : segmentIndex * segmentMinutes;
  const elapsedRatio = Math.min(1, Math.max(0, (segmentSeconds - entry.clock) / Math.max(1, segmentSeconds)));
  const minute = Math.max(1, Math.ceil(minuteBase + elapsedRatio * segmentMinutes));
  return `${minute}'${inExtraTime ? " · PR" : ""}`;
}

export function clubSubtitle(club: Club): string {
  const league = leagueById(club.leagueId);
  const country = countryById(club.countryId);
  return `${league.name} · ${country.name}`;
}

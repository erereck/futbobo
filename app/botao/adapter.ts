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
  const pool = CLUBS.filter((candidate) => {
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
  const isWorldCupFinal = args.competitionId === "world-cup" && args.stageName === "Final";
  const sameTournamentPool = COUNTRIES.filter((candidate) => {
    if (excludedCountryIds.has(candidate.id)) return false;
    // A final do Mundial sempre guarda uma potência inédita. Nas fases
    // anteriores há mais variedade, mas uma seleção eliminada nunca volta.
    if (args.competitionId === "world-cup") return candidate.strength >= (isWorldCupFinal ? 4 : 2);
    return candidate.confederation === country.confederation;
  });
  const unseenCountries = COUNTRIES.filter((candidate) => !excludedCountryIds.has(candidate.id));
  const strongUnseenCountries = unseenCountries.filter((candidate) => candidate.strength >= 4);
  const pool = sameTournamentPool.length > 0
    ? sameTournamentPool
    : isWorldCupFinal && strongUnseenCountries.length > 0
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
  ratings?: { power?: number; control?: number };
  rules?: Partial<BotaoRules>;
}): BotaoMatchSetup {
  const kits = ensureContrastingKits(
    botaoTeamFromCountry(args.country),
    botaoTeamFromCountry(args.opponent),
  );
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
    rules: { ...CAREER_FINAL_RULES, ...args.rules },
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

/** Rótulo do adversário para a narração da temporada. */
export function describeFinal(setup: BotaoMatchSetup, result: BotaoMatchResult): string {
  const score = `${result.goalsFor} x ${result.goalsAgainst}`;
  const penalties =
    result.penaltyFor !== null && result.penaltyAgainst !== null
      ? ` (${result.penaltyFor} x ${result.penaltyAgainst} nos pênaltis)`
      : "";
  const verb = result.champion ? "venceu" : "perdeu para";
  return `Final da ${setup.competitionName}: seu time ${verb} o ${setup.cpuTeam.shortName} por ${score}${penalties}.`;
}

/** Nome da liga/país só para exibir na antessala. */
export function clubSubtitle(club: Club): string {
  const league = leagueById(club.leagueId);
  const country = countryById(club.countryId);
  return `${league.name} · ${country.name}`;
}

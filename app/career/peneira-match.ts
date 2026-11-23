// Mesa de botão de cada jogo da peneira: o seu botão no time dos garotos
// testados (de colete), contra o adversário do jogo, no campo sorteado.
// Só a tela da peneira (carregada sob demanda) importa este módulo.

import { CAREER_FINAL_RULES, clubBadgePath, toBotaoPosition } from "../botao/adapter";
import { difficultyFromStrength } from "../botao/cpu";
import type { BotaoFieldTheme } from "../botao/field-themes";
import { ensureContrastingKits } from "../botao/kits";
import { hashSeed } from "../botao/rng";
import type { BotaoMatchSetup, BotaoRules, BotaoTeam } from "../botao/types";
import { crestDataUrl } from "../bobonline/teams/crest";
import { CLUBS, type PositionKey } from "../game-data";
import { visualRosterForMatch, type PlayerAppearance } from "../player-appearance";
import type { Peneira, PeneiraOpponent, PeneiraStage } from "./model";
import { PENEIRA_PLAYER_OVERALL, PENEIRA_STAGE_INFO, PENEIRA_TEAM_STRENGTH } from "./peneira";

/** Coletes da peneira: uma cor por jogo (a camisa de clube ainda não existe). */
const PENEIRA_BIBS: Record<PeneiraStage, readonly [string, string]> = {
  street: ["#f4f1e8", "#1c1d21"],
  futsal: ["#ff7a1a", "#14213d"],
  field: ["#c6f432", "#0b3d2e"],
};

/** Escudo do adversário: o do clube de verdade, ou o desenhado na hora para o time inventado. */
export function peneiraOpponentBadge(opponent: PeneiraOpponent): string | undefined {
  if (opponent.clubId) {
    const club = CLUBS.find((item) => item.id === opponent.clubId);
    return club ? clubBadgePath(club) : undefined;
  }
  return crestDataUrl({ abbr: opponent.abbr, primary: opponent.primary, secondary: opponent.secondary, crest: opponent.crest ?? 0 });
}

export function peneiraOpponentTeam(opponent: PeneiraOpponent): BotaoTeam {
  return {
    id: opponent.id,
    name: opponent.name,
    shortName: opponent.shortName,
    abbr: opponent.abbr,
    primary: opponent.primary,
    secondary: opponent.secondary,
    strength: opponent.strength,
    badge: peneiraOpponentBadge(opponent),
  };
}

export function peneiraUserTeam(stage: PeneiraStage): BotaoTeam {
  const [primary, secondary] = PENEIRA_BIBS[stage];
  return { id: `peneira-${stage}`, name: "Time da Peneira", shortName: "Peneira", abbr: "PEN", primary, secondary, strength: PENEIRA_TEAM_STRENGTH };
}

export function peneiraMatchSetup(args: {
  peneira: Peneira;
  index: number;
  player: { name: string; number: number; position: PositionKey; appearance: PlayerAppearance };
  rules?: Partial<BotaoRules>;
  visualsEnabled: boolean;
}): BotaoMatchSetup {
  const { peneira, index } = args;
  const match = peneira.matches[index];
  const kits = ensureContrastingKits(peneiraUserTeam(match.stage), peneiraOpponentTeam(match.opponent));
  return {
    matchId: `peneira-${peneira.seed}-${index}`,
    seed: hashSeed(peneira.seed, "peneira", "jogo", index),
    competitionName: "Peneira",
    stageName: `Jogo ${index + 1} · ${PENEIRA_STAGE_INFO[match.stage].venue}`,
    neutralVenue: true,
    userIsHost: true,
    player: {
      name: args.player.name || "Você",
      number: args.player.number,
      position: toBotaoPosition(args.player.position),
      overall: PENEIRA_PLAYER_OVERALL,
    },
    userTeam: kits.user,
    cpuTeam: kits.cpu,
    difficulty: difficultyFromStrength(match.opponent.strength),
    rules: { ...CAREER_FINAL_RULES, ...args.rules },
    visuals: visualRosterForMatch({
      enabled: args.visualsEnabled,
      seed: peneira.seed,
      season: 1,
      userTeamId: kits.user.id,
      cpuTeamId: kits.cpu.id,
      player: args.player.appearance,
    }),
    fieldTheme: match.fieldTheme as BotaoFieldTheme,
    ...(match.streetVariant !== undefined ? { streetVariant: match.streetVariant } : {}),
  };
}

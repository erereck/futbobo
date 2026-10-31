// Time do Bobonline → setup de partida do motor de botão.
//
// Online os atributos são iguais para todo mundo (§2.1): 72 de força e controle,
// geral 76, dificuldade 3 (goleiro do pênalti a 174 u/s). O anfitrião ignora
// qualquer força/controle que chegue num time, então o editor nem mostra isso.
// `buildDuelSetup` é determinístico: os dois aparelhos montam o mesmo setup.

import { ensureContrastingKits } from "../../botao/kits";
import { hashSeed } from "../../botao/rng";
import type { PlayerAppearance } from "../../player-appearance";
import { DEFAULT_BOTAO_RULES, type BotaoMatchSetup, type BotaoPlayer, type BotaoRules, type BotaoSide, type BotaoSquads, type BotaoTeam } from "../../botao/types";
import { roundName } from "../tournament/bracket";
import type { BobTeam, RulesPresetId } from "../types";
import { crestDataUrl } from "./crest";
import { teamAppearance } from "./model";

export const BOB_DISC = { power: 72, control: 72, overall: 76, strength: 76, difficulty: 3 } as const;

/** Os mesmos valores dos presets do X1 (app/x1/page.tsx). */
export const BOB_RULE_PRESETS: Record<RulesPresetId, { label: string; detail: string; rules: BotaoRules }> = {
  flash: { label: "Relâmpago", detail: "2 gols · 90 segundos", rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 2, halfSeconds: 90, extraSeconds: 30, penaltyRounds: 3 } },
  classic: { label: "Clássico", detail: "3 gols · 2 minutos", rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 3, halfSeconds: 120, extraSeconds: 45, penaltyRounds: 5 } },
  marathon: { label: "Maratona", detail: "5 gols · 3 minutos", rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 5, halfSeconds: 180, extraSeconds: 60, penaltyRounds: 5 } },
};

/** BotaoTeam com o escudo gerado como `badge` (data URL: nenhum byte de rede). */
export function toBotaoTeam(team: BobTeam): BotaoTeam {
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    abbr: team.abbr,
    primary: team.primary,
    secondary: team.secondary,
    strength: BOB_DISC.strength,
    badge: crestDataUrl(team),
  };
}

function squadFor(side: BotaoSide, team: BobTeam): Array<BotaoPlayer & { appearance: PlayerAppearance }> {
  // O prefixo do lado deixa os ids únicos nas duas listas (render.ts procura nas duas),
  // inclusive num espelho do mesmo time.
  return team.players.map((player) => ({
    id: `${side}:${player.id}`,
    name: player.name,
    number: player.number,
    position: "MC",
    overall: BOB_DISC.overall,
    power: BOB_DISC.power,
    control: BOB_DISC.control,
    appearance: teamAppearance(player.appearance, team.kitPattern),
  }));
}

/** Nome da fase para o setup ("X1" | "Quartas de final" | "Semifinal" | "Final"). */
export function roundStageName(size: 2 | 4 | 8, round: number): string {
  return roundName(size, round);
}

export function buildDuelSetup(args: {
  matchId: string; seed: number; home: BobTeam; away: BobTeam;
  rules: RulesPresetId; stageName: string;           // "X1" | "Quartas de final" | "Semifinal" | "Final"
}): BotaoMatchSetup {
  const { home, away } = args;
  // Camisa reserva: só o visitante cede (ensureContrastingKits troca o lado "cpu").
  const kits = ensureContrastingKits(toBotaoTeam(home), toBotaoTeam(away));
  const user = squadFor("user", home);
  const cpu = squadFor("cpu", away);
  const squads: BotaoSquads = { user, cpu };
  const preset = BOB_RULE_PRESETS[args.rules] ?? BOB_RULE_PRESETS.classic;
  const captain = home.players[0];
  return {
    matchId: args.matchId,
    seed: args.seed,
    competitionName: "Bobonline",
    stageName: args.stageName,
    neutralVenue: true,
    userIsHost: (hashSeed(args.seed, "saida") & 1) === 0,
    // Obrigatório no tipo; com squads o motor não usa o protagonista.
    player: { name: captain.name, number: captain.number, position: "MC", overall: BOB_DISC.overall },
    userTeam: kits.user,
    cpuTeam: kits.cpu,
    difficulty: BOB_DISC.difficulty,
    rules: { ...preset.rules },
    localControl: true,
    visuals: {
      enabled: true,
      player: user[0].appearance,
      user: user.map((player) => player.appearance),
      cpu: cpu.map((player) => player.appearance),
    },
    squads,
  };
}

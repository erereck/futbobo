// Extensão determinística da pausa do gol quando quem marcou tem uma
// comemoração longa (Kamehameha, Super Saiyajin). É função pura do setup e do
// estado: um aparelho em 2D e outro em 3D calculam o mesmo número, e o 2D
// espera junto mesmo sem desenhar a festa.
//
// Não importa three nem a coreografia: entra no pacote do 2D e nos testes em Node.

import { usesSquads, type BotaoMatchState } from "./engine";
import { bodyAppearance } from "./render";
import type { BotaoMatchSetup } from "./types";
import { celebrationIdOf, type CelebrationId } from "../player-appearance";

export const CELEBRATION_EXTENSION_MS: Readonly<Partial<Record<CelebrationId, number>>> = { kamehameha: 1000, superSaiyan: 400 };

type GoalInfo = { scorerId: string | null; ownGoal: boolean };

/**
 * Comemoração escolhida por quem marcou, quando ela vale: gol que não é contra,
 * autor achado e (elenco nomeado do Bobonline OU o botão do jogador da carreira).
 */
function scorerCelebration(setup: BotaoMatchSetup, state: BotaoMatchState, goal: GoalInfo): CelebrationId | null {
  if (goal.ownGoal || !goal.scorerId) return null;
  const body = state.bodies.find((candidate) => candidate.id === goal.scorerId);
  if (!body) return null;
  if (!usesSquads(setup) && !body.isUserPlayer) return null;
  return celebrationIdOf(bodyAppearance(setup, body) ?? (body.isUserPlayer ? setup.visuals?.player ?? null : null));
}

/** Extensão da pausa do gol que os dois aparelhos calculam igual (2D não desenha, mas espera). */
export function goalCelebrationExtensionMs(setup: BotaoMatchSetup, state: BotaoMatchState, goal: GoalInfo): number {
  const id = scorerCelebration(setup, state, goal);
  return id ? CELEBRATION_EXTENSION_MS[id] ?? 0 : 0;
}

/** "kamehameha" | "superSaiyan" quando o autor do gol tem uma dessas assinaturas (mesmas regras da extensão); senão null. */
export function goalSignatureOf(setup: BotaoMatchSetup, state: BotaoMatchState, goal: GoalInfo): "kamehameha" | "superSaiyan" | null {
  const id = scorerCelebration(setup, state, goal);
  return id === "kamehameha" || id === "superSaiyan" ? id : null;
}

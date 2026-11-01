import type { GameState, SpecialTraining } from "./model";

/**
 * Situação do Treino especial para a loja QUADRA (o rótulo do botão). Mora num
 * módulo próprio porque a loja só precisa disto; as transições do treino ficam em
 * special-training.ts, que a interface carrega sob demanda com o painel.
 */

export type SpecialTrainingStatus =
  /** Pode começar. */
  | "available"
  /** Começou nesta temporada e não acabou: "Continuar treino". */
  | "in-progress"
  /** Desafio diário: fora do desafio. */
  | "challenge"
  /** Sem WebGL: precisa de 3D. */
  | "no-webgl"
  /** OVR 99: no limite. */
  | "maxed"
  /** Já treinou neste ciclo e ganhou o +1. */
  | "rewarded"
  /** Já treinou neste ciclo e não ganhou. */
  | "no-reward";

/** O treino gravado é o desta temporada (o de um ciclo anterior não conta). */
export function trainingOfSeason(state: GameState): SpecialTraining | null {
  const training = state.specialTraining;
  return training && training.season === state.season ? training : null;
}

export function specialTrainingStatus(state: GameState, webgl: boolean): SpecialTrainingStatus {
  if (state.challengeId) return "challenge";
  const training = trainingOfSeason(state);
  if (training && training.rewarded !== null) return training.rewarded ? "rewarded" : "no-reward";
  if (!webgl) return "no-webgl";
  if (state.overall >= 99) return "maxed";
  return training ? "in-progress" : "available";
}

/** Pode abrir o treino agora (começar ou continuar o desta temporada). */
export function isSpecialTrainingAvailable(state: GameState, webgl: boolean) {
  const status = specialTrainingStatus(state, webgl);
  return status === "available" || status === "in-progress";
}

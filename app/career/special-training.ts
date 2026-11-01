import type { GameState, SpecialTraining } from "./model";
import { SCOREBOBO_TRACK } from "./scorebobo-track";
import { trainingOfSeason } from "./special-training-status";
import { shiftPlayerAttributes } from "./state";
import { clamp, seeded } from "./shared";

// A situação para a loja mora em special-training-status.ts (a QUADRA só precisa dela); daqui segue exportada como antes.
export { isSpecialTrainingAvailable, specialTrainingStatus, type SpecialTrainingStatus } from "./special-training-status";

/**
 * Treino especial da QUADRA: duas fases do Scorebobo sorteadas pela seed da carreira
 * e pela temporada (recarregar não troca o par), 3 jogadas inteiras em cada, vale a
 * melhor. 3★ nas duas = +1 OVR de graça, no padrão do "Salto de nível" (fura o teto).
 * Uma vez por ciclo da QUADRA; fora do desafio diário; só com WebGL.
 */

/** Jogadas inteiras por fase do treino. */
export const SPECIAL_TRAINING_CHANCES = 3;

// Sais novos (não reaproveitar 613, 719, 1777 nem 1877, que já movem a carreira).
const LEVEL_DRAW_SALT = 3083;
const ATTRIBUTE_SALT = 3089;

/** As 2 fases do treino (distintas, das 12), na ordem da trilha de dificuldade. */
export function specialTrainingLevelIds(seed: number, season: number): [string, string] {
  const count = SCOREBOBO_TRACK.length;
  const first = Math.floor(seeded(seed, season * LEVEL_DRAW_SALT + 1) * count) % count;
  const draw = Math.floor(seeded(seed, season * LEVEL_DRAW_SALT + 2) * (count - 1)) % (count - 1);
  const second = draw >= first ? draw + 1 : draw;
  const [low, high] = first < second ? [first, second] : [second, first];
  return [SCOREBOBO_TRACK[low].id, SCOREBOBO_TRACK[high].id];
}

/**
 * A chave de compra da QUADRA para o treino: a mesma de `cycleShopPurchaseKey(state, "special-training")`
 * (cycle-shop.ts; um teste confere). Montada aqui para este módulo, que chega sob demanda com o painel,
 * não depender da loja inteira: importar cycle-shop.ts o tiraria do pedaço principal de "/".
 */
function purchaseKeyOf(state: GameState) {
  return `quadra:${state.season}:special-training`;
}

/** Os dois campos de fase seguem como tupla. */
function setPair(pair: [number, number], index: number, value: number): [number, number] {
  return index === 0 ? [value, pair[1]] : [pair[0], value];
}

/**
 * Abre o treino: grava a chave de compra da QUADRA (preço 0) e cria o treino desta
 * temporada. Se já existe um em andamento nesta temporada, devolve igual (retomar).
 * Desafio, OVR 99 ou treino já encerrado no ciclo: estado igual.
 */
export function beginSpecialTraining(state: GameState): GameState {
  if (state.challengeId) return state;
  const existing = trainingOfSeason(state);
  if (existing && existing.rewarded !== null) return state;
  const purchaseKey = purchaseKeyOf(state);
  const economyPurchases = state.economyPurchases.includes(purchaseKey) ? state.economyPurchases : [...state.economyPurchases, purchaseKey];
  if (existing) return economyPurchases === state.economyPurchases ? state : { ...state, economyPurchases };
  if (state.overall >= 99) return state;
  return {
    ...state,
    economyPurchases,
    specialTraining: {
      season: state.season,
      levelIds: specialTrainingLevelIds(state.seed, state.season),
      chancesUsed: [0, 0],
      bestStars: [0, 0],
      current: 0,
      rewarded: null,
    },
  };
}

/** Treino desta temporada em andamento, numa fase válida. */
function activeTraining(state: GameState): SpecialTraining | null {
  const training = trainingOfSeason(state);
  return training && training.rewarded === null && training.current >= 0 && training.current < 2 ? training : null;
}

export function specialTrainingChancesLeft(training: SpecialTraining, index = training.current) {
  return index === 0 || index === 1 ? Math.max(0, SPECIAL_TRAINING_CHANCES - training.chancesUsed[index]) : 0;
}

/** A fase já não tem o que jogar: 3★ ou chances esgotadas. */
export function isTrainingStageDone(training: SpecialTraining, index = training.current) {
  return index === 0 || index === 1
    ? training.bestStars[index] >= 3 || training.chancesUsed[index] >= SPECIAL_TRAINING_CHANCES
    : true;
}

/** Ainda dá para ganhar o +1: as fases já passadas fecharam com 3★. */
export function canSpecialTrainingReward(training: SpecialTraining) {
  return training.bestStars.every((stars, index) => index >= training.current || stars >= 3);
}

/** A jogada começou de verdade: gasta uma chance da fase atual (até 3; não gasta com 3★). */
export function startTrainingChance(state: GameState): GameState {
  const training = activeTraining(state);
  if (!training || isTrainingStageDone(training)) return state;
  const index = training.current;
  return { ...state, specialTraining: { ...training, chancesUsed: setPair(training.chancesUsed, index, training.chancesUsed[index] + 1) } };
}

/**
 * Fim de uma jogada: guarda a melhor nota da fase atual (exige chance gasta).
 * A segunda ★★★ já encerra o treino com o +1: fechar o app no cartão de resultado não perde o prêmio.
 */
export function recordTrainingStars(state: GameState, stars: number): GameState {
  const training = activeTraining(state);
  if (!training) return state;
  const index = training.current;
  const value = clamp(Math.round(Number(stars)) || 0, 0, 3);
  if (training.chancesUsed[index] < 1 || value <= training.bestStars[index]) return state;
  const next: GameState = { ...state, specialTraining: { ...training, bestStars: setPair(training.bestStars, index, value) } };
  return index === 1 && value >= 3 && training.bestStars[0] >= 3 ? completeSpecialTraining(next) : next;
}

/** Devolve a chance de uma jogada que caiu (falha do 3D) antes de ter resultado. */
export function refundTrainingChance(state: GameState): GameState {
  const training = activeTraining(state);
  if (!training) return state;
  const index = training.current;
  if (training.chancesUsed[index] < 1) return state;
  return { ...state, specialTraining: { ...training, chancesUsed: setPair(training.chancesUsed, index, training.chancesUsed[index] - 1) } };
}

/**
 * Aceita a melhor nota da fase e passa para a próxima; depois da segunda, encerra.
 * Exige uma chance gasta na fase (o segundo clique no mesmo "Continuar" não pula a fase nova).
 */
export function advanceTraining(state: GameState): GameState {
  const training = activeTraining(state);
  if (!training || training.chancesUsed[training.current] < 1) return state;
  const next: GameState = { ...state, specialTraining: { ...training, current: training.current + 1 } };
  return training.current + 1 >= 2 ? completeSpecialTraining(next) : next;
}

/**
 * Encerra o treino uma única vez. 3★ nas duas fases: +1 OVR como o "Salto de nível"
 * (`overall + 1`, potencial nunca abaixo do OVR, atributos acompanham), bloqueado no 99.
 * Pode ser chamado no meio para desistir: o que faltou conta como não feito.
 */
export function completeSpecialTraining(state: GameState): GameState {
  const training = trainingOfSeason(state);
  if (!training || training.rewarded !== null) return state;
  const won = training.bestStars[0] >= 3 && training.bestStars[1] >= 3 && state.overall < 99;
  const finished: SpecialTraining = { ...training, current: 2, rewarded: won };
  if (!won) return { ...state, specialTraining: finished };
  const overall = state.overall + 1;
  return {
    ...state,
    overall,
    potential: Math.max(state.potential, overall),
    attributes: shiftPlayerAttributes(state.attributes, overall - state.overall, state.position, state.seed + state.season * ATTRIBUTE_SALT),
    specialTraining: finished,
  };
}

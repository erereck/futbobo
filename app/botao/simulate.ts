// Partida sem tela: usada quando o jogador escolhe "simular a final" e também
// pelos testes de balanceamento. É o MESMO motor e a MESMA IA da partida
// jogada — a CPU só assume os dois lados. Assim simular nunca dá um resultado
// que seria impossível de acontecer jogando.

import { chooseCpuPenaltyShot, chooseCpuShot, chooseCpuSubstitution, cpuSkillFor, difficultyScore } from "./cpu";
import {
  advanceClock,
  beginPenaltyShot,
  beginShot,
  commitPenalty,
  confirmPenaltyOrder,
  createMatch,
  forceFinish,
  penaltyKeeper,
  penaltyShooter,
  resumeAfterGoal,
  skipTurn,
  startNextPeriod,
  stepMatch,
  stepPenalty,
  type BotaoMatchState,
} from "./engine";
import type { BotaoMatchResult, BotaoMatchSetup } from "./types";

const STEP_DT = 1 / 60;
const MAX_TURNS = 900;
/**
 * Tempo morto de um turno: mirar, decidir, recolocar. Na partida jogada isso
 * corre no relógio de verdade; aqui é cobrado de uma vez, senão a final
 * simulada caberia o dobro de toques que a jogada.
 */
const DEAD_TIME_PER_TURN = 2.4;

/**
 * Habilidade com que a CPU joga o SEU lado quando a final é simulada.
 *
 * Pesa mais o seu overall do que a força do clube: quem está com a palheta na
 * mão é você, não a diretoria. Antes vinha quase toda do clube, e isso punia o
 * time pequeno duas vezes — peça ruim e IA burra —, deixando a zebra em 0%.
 * Piso 2 para que uma final nunca seja decidida antes de começar.
 */
export function userSideSkill(setup: BotaoMatchSetup): number {
  const rating = setup.player.overall * 0.45 + setup.userTeam.strength * 0.55;
  // Piso 2 para que nenhuma final esteja decidida antes de começar.
  return Math.max(2, difficultyScore(rating));
}

function resolvePhysics(state: BotaoMatchState) {
  let guard = 0;
  while (state.phase === "resolving" && guard < 600) {
    stepMatch(state, STEP_DT);
    guard += 1;
  }
}

function resolvePenalty(state: BotaoMatchState, skill: number) {
  const shooter = penaltyShooter(state);
  const keeper = penaltyKeeper(state);
  const shot = chooseCpuPenaltyShot(state, shooter, keeper, skill, state.rng);
  if (!beginPenaltyShot(state, shot)) {
    commitPenalty(state, false);
    return;
  }
  let outcome: { scored: boolean } | null = null;
  let guard = 0;
  while (!outcome && guard < 400) {
    outcome = stepPenalty(state, STEP_DT);
    guard += 1;
  }
  commitPenalty(state, outcome?.scored ?? false);
}

export function simulateBotaoMatch(setup: BotaoMatchSetup): BotaoMatchResult {
  const state = createMatch(setup);
  const userSkill = userSideSkill(setup);
  const cpuSkill = cpuSkillFor(setup.cpuTeam.strength);
  let guard = 0;

  while (state.phase !== "finished" && guard < MAX_TURNS) {
    guard += 1;
    if (state.phase === "aim" || state.phase === "kickoff") {
      if (state.setup.managerMode) chooseCpuSubstitution(state, state.turn, state.rng);
      advanceClock(state, DEAD_TIME_PER_TURN);
      if (state.phase !== "aim" && state.phase !== "kickoff") continue;
      const skill = state.turn === "cpu" ? cpuSkill : userSkill;
      const shot = chooseCpuShot(state, skill, state.rng, state.turn);
      // Sem toque legal a vez passa. Abandonar a partida aqui falsearia o
      // placar final e escondia o problema em vez de mostrá-lo.
      if (!shot || !beginShot(state, shot)) {
        skipTurn(state);
        continue;
      }
      resolvePhysics(state);
      continue;
    }
    if (state.phase === "resolving") {
      resolvePhysics(state);
      continue;
    }
    if (state.phase === "goal") {
      resumeAfterGoal(state);
      continue;
    }
    if (state.phase === "interval") {
      startNextPeriod(state);
      continue;
    }
    if (state.phase === "penalty-setup") {
      // Sem jogador humano para escolher: cobra a última, como todo craque quer.
      confirmPenaltyOrder(state, state.setup.rules.penaltyRounds);
      continue;
    }
    if (state.phase === "penalties") {
      const skill = state.penalties?.turn === "cpu" ? cpuSkill : userSkill;
      resolvePenalty(state, skill);
      continue;
    }
    break;
  }

  const result = state.result ?? forceFinish(state);
  return { ...result, simulated: true, timeline: result.timeline.slice() };
}

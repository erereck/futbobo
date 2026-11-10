// Assistência do jogador da carreira no desvio: ele chuta, a bola desvia num
// boneco adversário e entra. O gol é contra (o último toque foi do adversário),
// mas a jogada foi dele, então a assistência é dele.
//
// Fica fora do motor de propósito: o golden do motor
// (tests/fixtures/botao-engine-golden.json) faz hash do estado inteiro a cada
// checkpoint, inclusive `playerAssists` e a timeline, e o Bobonline compara
// BOTAO_ENGINE_REV entre os aparelhos. Mexer no registerGoal mudaria o digest e
// obrigaria a subir a revisão (aparelhos antigos deixariam de jogar com os
// novos). A partida (BotaoMatch) aplica isto no evento do gol, só fora do
// online e do X1 local; o Bobonline não tem jogador da carreira.
//
// O desvio num companheiro já rendia assistência no motor: o companheiro vira o
// autor e o toque anterior (o seu) vira a assistência.

import type { BotaoBody, BotaoEvent, BotaoMatchState } from "./engine";

/** O que a partida anota do toque em andamento. */
export type ShotTouchLog = {
  /** `state.turns` do toque (muda a cada toque novo). */
  turns: number;
  /** Último a encostar na bola antes deste toque. */
  lastBefore: string | null;
  /** Botão tacado neste toque. */
  flicked: string | null;
  /** Quem encostou na bola neste toque, na ordem dos eventos "touch". */
  touchers: string[];
};

/** Começa a anotação de um toque (chamar com a fase já em "resolving", antes da física). */
export function startShotTouchLog(state: BotaoMatchState): ShotTouchLog {
  return {
    turns: state.turns,
    lastBefore: state.touches.at(-1)?.bodyId ?? null,
    flicked: state.activeShotBodyId,
    touchers: [],
  };
}

/**
 * O botão do jogador da carreira, quando o gol contra deste evento saiu de um
 * chute dele que desviou num adversário; senão null. Exige que o toque dele seja
 * deste lance (não um passe antigo que o adversário mandou para o próprio gol).
 */
export function careerDeflectionAssist(
  state: BotaoMatchState,
  event: BotaoEvent,
  log: ShotTouchLog | null,
): BotaoBody | null {
  if (event.type !== "goal" || !event.ownGoal || event.side !== "user") return null;
  const player = state.bodies.find((body) => body.kind === "disc" && body.isUserPlayer);
  if (!player || player.side !== "user") return null;
  const deflector = state.touches.at(-1);
  const before = state.touches.at(-2);
  if (!deflector || deflector.side === "user" || before?.bodyId !== player.id) return null;
  // O lance é do seu time e o chute é deste toque.
  if (!log || log.turns !== state.turns || state.turn !== "user") return null;
  const touchedNow =
    log.touchers.includes(player.id) ||
    // Ele já era o último a encostar e foi o tacado: o primeiro contato não gera evento novo.
    (log.lastBefore === player.id && log.flicked === player.id);
  return touchedNow ? player : null;
}

/**
 * Credita a assistência do desvio: o número ao vivo, a linha do gol na timeline
 * ("Gol contra de X (assistência de Você)") e o resultado, quando o gol já
 * encerrou a partida (limite de gols) no mesmo passo. Devolve o nome de quem
 * deu a assistência, ou null quando não vale.
 */
export function applyCareerDeflectionAssist(
  state: BotaoMatchState,
  event: BotaoEvent,
  log: ShotTouchLog | null,
): string | null {
  const player = careerDeflectionAssist(state, event, log);
  if (!player) return null;
  const name = player.label;
  state.playerAssists += 1;
  const index = state.timeline.length - 1;
  const entry = state.timeline[index];
  if (entry && entry.kind === "own-goal" && entry.side === "user" && !entry.assist) {
    state.timeline[index] = { ...entry, assist: name, text: `${entry.text} (assistência de ${name})` };
  }
  if (state.result) {
    state.result = {
      ...state.result,
      playerAssists: state.result.playerAssists + 1,
      timeline: state.timeline.slice(),
    };
  }
  return name;
}

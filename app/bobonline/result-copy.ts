// Textos da tela de resultado do Bobonline (§1.8).
//
// A linha da história é neutra (nomeia os times, nunca "você") e sai do resultado
// CANÔNICO: o do lado "user" do motor, que é o mandante. Quem jogou de visitante
// vê o mesmo texto. Não importa result-story.ts: ele puxa adapter.ts → game-data.ts
// (275 KB de fonte) para dentro do /bobonline. As duas funções de gol abaixo são
// cópias pequenas das do adapter.

import type { BracketResult, WalkoverKind } from "./types";
import type { BotaoMatchResult, BotaoMatchSetup, BotaoRules, BotaoSide, BotaoTimelineEntry } from "../botao/types";

export function isMatchGoal(entry: BotaoTimelineEntry): boolean {
  return entry.kind === "goal" || entry.kind === "own-goal";
}

/** Minuto "de transmissão" do lance (igual ao adapter.formatGoalMinute). */
export function formatGoalMinute(entry: BotaoTimelineEntry, rules: BotaoRules): string {
  const inExtraTime = entry.period > rules.halves;
  const segmentSeconds = inExtraTime ? rules.extraSeconds : rules.halfSeconds;
  const segmentMinutes = inExtraTime ? 30 / Math.max(1, rules.extraHalves) : 90 / Math.max(1, rules.halves);
  const segmentIndex = inExtraTime ? entry.period - rules.halves - 1 : entry.period - 1;
  const minuteBase = inExtraTime ? 90 + segmentIndex * segmentMinutes : segmentIndex * segmentMinutes;
  const elapsedRatio = Math.min(1, Math.max(0, (segmentSeconds - entry.clock) / Math.max(1, segmentSeconds)));
  const minute = Math.max(1, Math.ceil(minuteBase + elapsedRatio * segmentMinutes));
  return `${minute}'${inExtraTime ? " · PR" : ""}`;
}

function teamName(setup: BotaoMatchSetup, side: BotaoSide): string {
  return side === "user" ? setup.userTeam.shortName : setup.cpuTeam.shortName;
}

function winnerSideOf(result: BotaoMatchResult): BotaoSide | null {
  return result.outcome === "win" ? "user" : result.outcome === "loss" ? "cpu" : null;
}

/**
 * Linha da história, neutra, a partir do resultado canônico (lado user = mandante).
 * `walkover` vem do BracketResult: o tipo do W.O. decide o texto (tempo esgotado
 * nunca vira "desistiu").
 */
export function describeOnlineResult(
  result: BotaoMatchResult,
  setup: BotaoMatchSetup,
  walkover: WalkoverKind | null | undefined,
): string {
  const winnerSide = winnerSideOf(result);
  const winner = winnerSide ? teamName(setup, winnerSide) : "";
  const loser = winnerSide ? teamName(setup, winnerSide === "user" ? "cpu" : "user") : "";

  if (walkover && winnerSide) {
    if (walkover === "abandon") return `${winner} venceu por W.O.: ${loser} desistiu da partida.`;
    if (walkover === "timeout") return `${winner} venceu por W.O.: ${loser} não voltou a tempo.`;
    if (walkover === "double") return `A partida não pôde terminar e o sorteio deu a vitória para ${winner}.`;
    return `${winner} avançou de folga.`;
  }

  if (result.decision === "penalties" && winnerSide) {
    const mine = winnerSide === "user" ? result.penaltyFor : result.penaltyAgainst;
    const theirs = winnerSide === "user" ? result.penaltyAgainst : result.penaltyFor;
    return `Depois de ${result.goalsFor} × ${result.goalsAgainst} no campo, ${winner} venceu nos pênaltis por ${mine ?? 0} × ${theirs ?? 0}.`;
  }

  const goals = result.timeline.filter(isMatchGoal);
  const lastGoal = goals.at(-1);
  const moment = lastGoal ? `${lastGoal.text} aos ${formatGoalMinute(lastGoal, setup.rules)}` : "";

  if (winnerSide && goals.length > 1) {
    let user = 0;
    let cpu = 0;
    let winnerTrailed = false;
    for (const goal of goals) {
      if (goal.side === "user") user += 1;
      else cpu += 1;
      winnerTrailed ||= winnerSide === "user" ? user < cpu : cpu < user;
    }
    if (winnerTrailed && lastGoal) return `Virada de ${winner}. Último gol: ${moment}.`;
  }

  if (result.decision === "goal-limit" && lastGoal && winnerSide) {
    return `${winner} chegou ao ${setup.rules.goalLimit}º gol e fechou a partida: ${moment}.`;
  }

  const extraGoal = goals.filter((goal) => goal.period > setup.rules.halves).at(-1);
  if (extraGoal && winnerSide) {
    return `A prorrogação teve ${extraGoal.text.toLocaleLowerCase("pt-BR")} aos ${formatGoalMinute(extraGoal, setup.rules)}; ${winner} ficou com a vitória.`;
  }

  if (lastGoal) return `Último gol da partida: ${moment}.`;
  const posts = result.stats.user.posts + result.stats.cpu.posts;
  return posts ? `A partida ficou sem gols, mas a bola acertou a trave ${posts} ${posts === 1 ? "vez" : "vezes"}.` : "A partida terminou sem gols em campo.";
}

/**
 * Resultado canônico mínimo a partir do que a sala guarda (W.O., ou o resultado
 * completo perdido num recarregamento): sem lances, sem números da mesa.
 */
export function resultFromBracket(bracket: BracketResult): BotaoMatchResult {
  const outcome = bracket.winner === "home" ? "win" : "loss";
  const empty = { flicks: 0, touches: 0, posts: 0 };
  return {
    matchId: bracket.matchId,
    simulated: false,
    walkover: bracket.decision === "walkover",
    outcome,
    goalsFor: bracket.homeGoals,
    goalsAgainst: bracket.awayGoals,
    penaltyFor: bracket.homePens,
    penaltyAgainst: bracket.awayPens,
    playerGoals: 0,
    playerAssists: 0,
    manOfTheMatch: false,
    decision: bracket.decision === "walkover" ? "regulation" : bracket.decision,
    turns: 0,
    stats: { user: { ...empty }, cpu: { ...empty } },
    timeline: [],
    champion: outcome === "win",
  };
}

/**
 * Manchete da tela de resultado, do ponto de vista de quem está olhando.
 * `opponent` é o apelido do outro lado ("a CPU" contra a CPU).
 */
export function resultHeadline(args: { won: boolean; walkover: WalkoverKind | null | undefined; opponent: string }): string {
  const { won, walkover, opponent } = args;
  if (walkover === "double") return "Decidido no sorteio";
  if (won) {
    if (walkover === "abandon") return `Vitória por W.O.: ${opponent} desistiu`;
    if (walkover === "timeout") return `Vitória por W.O.: ${opponent} não voltou a tempo`;
    return "Você venceu!";
  }
  if (walkover === "timeout") return "Você não voltou a tempo: derrota por W.O.";
  if (walkover === "abandon") return "Você desistiu: derrota por W.O.";
  return "Você perdeu";
}

/** Placar do ponto de vista de quem olha: "2 × 2 (pên. 4 × 3)". */
export function scoreLine(mine: number, theirs: number, pens: { mine: number; theirs: number } | null): string {
  return pens ? `${mine} × ${theirs} (pên. ${pens.mine} × ${pens.theirs})` : `${mine} × ${theirs}`;
}

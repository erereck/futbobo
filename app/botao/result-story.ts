import { formatGoalMinute, isMatchGoal } from "./adapter";
import type { BotaoMatchResult, BotaoMatchSetup, BotaoSide } from "./types";

/** Um momento verificável da partida para acompanhar o placar final. */
export function describeMatchTurningPoint(result: BotaoMatchResult, setup: BotaoMatchSetup): string {
  if (result.walkover) return "A partida foi encerrada por abandono, com placar administrativo de 3 × 0.";

  const winnerSide: BotaoSide | null = result.outcome === "win" ? "user" : result.outcome === "loss" ? "cpu" : null;
  const winnerName = winnerSide === "user" ? setup.userTeam.shortName : setup.cpuTeam.shortName;
  if (result.decision === "penalties") {
    return `Após ${result.goalsFor} × ${result.goalsAgainst} no campo, ${winnerName} venceu os pênaltis por ${winnerSide === "user" ? result.penaltyFor : result.penaltyAgainst} × ${winnerSide === "user" ? result.penaltyAgainst : result.penaltyFor}.`;
  }

  const goals = result.timeline.filter(isMatchGoal);
  const lastGoal = goals.at(-1);
  const moment = lastGoal ? `${lastGoal.text} aos ${formatGoalMinute(lastGoal, setup.rules)}` : "";
  if (result.decision === "goal-limit" && lastGoal && winnerSide) {
    return `${winnerName} chegou ao ${setup.rules.goalLimit}º gol e encerrou a partida: ${moment}.`;
  }

  const extraGoal = goals.filter((goal) => goal.period > setup.rules.halves).at(-1);
  if (extraGoal && winnerSide) {
    return `A prorrogação teve ${extraGoal.text.toLocaleLowerCase("pt-BR")} aos ${formatGoalMinute(extraGoal, setup.rules)}; ${winnerName} ficou com a vitória.`;
  }

  if (winnerSide && goals.length > 1) {
    let user = 0;
    let cpu = 0;
    let winnerTrailed = false;
    for (const goal of goals) {
      if (goal.side === "user") user += 1;
      else cpu += 1;
      winnerTrailed ||= winnerSide === "user" ? user < cpu : cpu < user;
    }
    if (winnerTrailed && lastGoal) return `Virada de ${winnerName}. Último gol: ${moment}.`;
  }

  if (lastGoal) return `Último gol da partida: ${moment}.`;
  const posts = result.stats.user.posts + result.stats.cpu.posts;
  return posts ? `A partida ficou sem gols, mas a bola acertou a trave ${posts} ${posts === 1 ? "vez" : "vezes"}.` : "A partida terminou sem gols em campo.";
}

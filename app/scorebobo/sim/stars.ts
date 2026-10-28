// Estrelas: a 1ª é cumprir o objetivo; a 2ª e a 3ª vêm das regras da fase.

import type { Outcome, ScoreLevel, SimEvent, StarRule } from "../types";

export type GoalFacts = Extract<SimEvent, { type: "goal" }> & {
  attempt: number;
  outsideBox: boolean;
};

const fmt = (n: number) => n.toFixed(1).replace(".", ",");

export function ruleMet(rule: StarRule, g: GoalFacts) {
  switch (rule.kind) {
    case "firstAttempt": return g.attempt === 1;
    case "curve": return g.curve >= rule.min;
    case "topCorner": return g.topCorner;
    case "header": return g.header;
    case "volley": return g.volley;
    case "firstTime": return g.firstTime;
    case "outsideBox": return g.outsideBox;
    case "maxPasses": return g.passes <= rule.max;
    case "minPasses": return g.passes >= rule.min;
  }
}

/** Texto da regra para o HUD ("Gol de cabeça", "Curva de 2 m"...). */
export function ruleLabel(rule: StarRule) {
  switch (rule.kind) {
    case "firstAttempt": return "Gol na primeira tentativa";
    case "curve": return `Gol com curva de ${fmt(rule.min)} m`;
    case "topCorner": return "Gol no ângulo";
    case "header": return "Gol de cabeça";
    case "volley": return "Gol de voleio";
    case "firstTime": return "Gol de primeira";
    case "outsideBox": return "Gol de fora da área";
    case "maxPasses": return rule.max === 0 ? "Gol sem passes" : `Gol com até ${rule.max} passe${rule.max > 1 ? "s" : ""}`;
    case "minPasses": return `Gol com ${rule.min}+ passe${rule.min > 1 ? "s" : ""}`;
  }
}

/** Gol vale para a fase? (requisitos de `level.require`) */
export function unmetRequirements(level: ScoreLevel, g: GoalFacts) {
  return (level.require ?? []).filter((rule) => !ruleMet(rule, g));
}

export function goalLabel(g: GoalFacts) {
  if (g.header) return "GOL DE CABEÇA!";
  if (g.volley) return "QUE VOLEIO!";
  if (g.topCorner && g.curve >= 1.5) return "NO ÂNGULO!";
  if (g.topCorner || g.curve >= 2.5 || g.distance >= 24) return "GOLAÇO!";
  return "GOL!";
}

export function goalOutcome(level: ScoreLevel, g: GoalFacts): Outcome {
  const missing = unmetRequirements(level, g);
  if (missing.length) {
    return {
      result: "goal",
      label: "Não valeu!",
      stars: 0,
      notes: missing.map((rule) => `Precisava: ${ruleLabel(rule).toLowerCase()}`),
      met: [false, false, false],
    };
  }
  const notes = ["Objetivo cumprido"];
  let stars = 1;
  const met: [boolean, boolean, boolean] = [true, ruleMet(level.stars[0], g), ruleMet(level.stars[1], g)];
  for (const rule of level.stars) {
    if (ruleMet(rule, g)) {
      stars += 1;
      notes.push(rule.kind === "curve" ? `Gol com curva de ${fmt(g.curve)} m` : ruleLabel(rule));
    } else {
      notes.push(`Faltou: ${ruleLabel(rule).toLowerCase()}`);
    }
  }
  return { result: "goal", label: goalLabel(g), stars: Math.min(3, stars) as Outcome["stars"], notes, met };
}

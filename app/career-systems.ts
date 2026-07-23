import type { Club, Position } from "./game-data";

export type SquadRole = "promessa" | "reserva" | "rotacao" | "titular" | "estrela";

export type CareerObjective = {
  id: string;
  label: string;
  description: string;
  metric: "appearances" | "goals" | "assists" | "cleanSheets" | "goalContributions" | "titles" | "discipline";
  target: number;
  reward: number;
  penalty: number;
};

export type ObjectiveResult = {
  completed: boolean;
  progress: number;
  target: number;
  label: string;
  text: string;
};

export const ROLE_LABELS: Record<SquadRole, string> = {
  promessa: "Promessa",
  reserva: "Reserva",
  rotacao: "Rotação",
  titular: "Titular",
  estrela: "Estrela do time",
};

export function calculateSquadRole(
  overall: number,
  club: Pick<Club, "reputation">,
  leaguePrestige: number,
  managerTrust: number,
  age: number,
): SquadRole {
  const requirement = 51 + club.reputation * 5 + leaguePrestige * 2;
  const score = overall - requirement + (managerTrust - 50) / 8;
  if (score >= 9 && managerTrust >= 70) return "estrela";
  if (score >= 3 && managerTrust >= 52) return "titular";
  if (score >= -3 || managerTrust >= 48) return "rotacao";
  if (age <= 21 && overall >= requirement - 9) return "promessa";
  return "reserva";
}

export function roleAppearanceModifier(role: SquadRole) {
  return { promessa: -3, reserva: -6, rotacao: 0, titular: 6, estrela: 9 }[role];
}

export function createContract(
  overall: number,
  age: number,
  club: Pick<Club, "reputation" | "countryId">,
  seedValue: number,
) {
  const prime = age >= 22 && age <= 29 ? 1.18 : age >= 34 ? 0.68 : 1;
  const abroad = club.countryId === "brasil" ? 1 : 2.8;
  const annualSalary = Math.max(
    45_000,
    Math.round((Math.pow(Math.max(8, overall - 46), 2.15) * 1_600 * club.reputation * abroad * prime) / 10_000) * 10_000,
  );
  const years = age >= 35 ? 1 : 2 + (seedValue % 4);
  return { years, annualSalary };
}

export function createSeasonObjective(
  position: Position,
  role: SquadRole,
  season: number,
  seedValue: number,
): CareerObjective {
  const starter = role === "titular" || role === "estrela";
  const selector = Math.abs(seedValue + season * 17) % 5;
  const base = {
    id: `${season}-${position.key}-${selector}`,
    reward: role === "estrela" ? 5 : 7,
    penalty: role === "promessa" ? 3 : 7,
  };

  if (selector === 0 || role === "reserva" || role === "promessa") {
    const target = role === "reserva" ? 15 : role === "promessa" ? 12 : starter ? 28 : 22;
    return { ...base, metric: "appearances", target, label: "Conquistar espaço", description: `Disputar pelo menos ${target} partidas oficiais.` };
  }
  if (position.key === "GOL") {
    const target = starter ? 13 : 8;
    return { ...base, metric: "cleanSheets", target, label: "Fechar o gol", description: `Terminar ${target} jogos sem sofrer gols.` };
  }
  if (position.zone === "ataque") {
    const target = starter ? 17 : 11;
    return { ...base, metric: "goals", target, label: "Ser decisivo", description: `Marcar pelo menos ${target} gols na temporada.` };
  }
  if (position.zone === "meio") {
    const target = starter ? 14 : 9;
    return { ...base, metric: selector % 2 ? "assists" : "goalContributions", target, label: "Comandar o jogo", description: selector % 2 ? `Dar ${target} assistências.` : `Somar ${target} gols + assistências.` };
  }
  if (selector >= 3) {
    return { ...base, metric: "discipline", target: 7, label: "Liderar sem perder a cabeça", description: "Receber no máximo 7 pontos disciplinares (amarelo = 1, vermelho = 3)." };
  }
  const target = starter ? 26 : 19;
  return { ...base, metric: "appearances", target, label: "Virar pilar da defesa", description: `Entrar em campo ao menos ${target} vezes.` };
}

export function evaluateObjective(
  objective: CareerObjective,
  stats: { appearances: number; goals: number; assists: number; cleanSheets: number; yellowCards: number; redCards: number },
  titles: number,
): ObjectiveResult {
  const values: Record<CareerObjective["metric"], number> = {
    appearances: stats.appearances,
    goals: stats.goals,
    assists: stats.assists,
    cleanSheets: stats.cleanSheets,
    goalContributions: stats.goals + stats.assists,
    titles,
    discipline: stats.yellowCards + stats.redCards * 3,
  };
  const value = values[objective.metric];
  const completed = objective.metric === "discipline" ? value <= objective.target : value >= objective.target;
  return {
    completed,
    progress: value,
    target: objective.target,
    label: objective.label,
    text: completed
      ? `Meta cumprida: ${value}/${objective.target}. A comissão passou a confiar mais em você.`
      : `Meta não cumprida: ${value}/${objective.target}. Seu espaço no elenco ficou sob pressão.`,
  };
}

export function calculateLegacyScore(metrics: {
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  trophies: number;
  nationalTrophies: number;
  awards: number;
  ballonDor: number;
  nationalCaps: number;
  peakOverall: number;
  setbacks: number;
}) {
  return Math.round(
    metrics.appearances * 0.5 +
    metrics.goals * 1.5 +
    metrics.assists * 1.2 +
    metrics.cleanSheets * 1.1 +
    metrics.trophies * 32 +
    metrics.nationalTrophies * 48 +
    metrics.awards * 15 +
    metrics.ballonDor * 220 +
    metrics.nationalCaps * 1.1 +
    Math.max(0, metrics.peakOverall - 60) * 7 +
    metrics.setbacks * 4,
  );
}

export function legacyTier(score: number) {
  if (score >= 1800) return { label: "Lenda mundial", color: "#ffc72c" };
  if (score >= 1100) return { label: "Ícone de uma geração", color: "#a675ff" };
  if (score >= 650) return { label: "Craque consagrado", color: "#63e36b" };
  if (score >= 300) return { label: "Nome respeitado", color: "#2ca8ff" };
  return { label: "Carreira em construção", color: "#f5f7f2" };
}

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
    penalty: role === "promessa" ? 3 : 6,
  };

  if (selector === 0 || role === "reserva" || role === "promessa") {
    const target = role === "reserva" ? 14 : role === "promessa" ? 12 : starter ? 27 : 21;
    return { ...base, metric: "appearances", target, label: "Conquistar espaço", description: `Disputar pelo menos ${target} partidas oficiais.` };
  }
  if (position.key === "GOL") {
    const target = starter ? 12 : 8;
    return { ...base, metric: "cleanSheets", target, label: "Fechar o gol", description: `Terminar ${target} jogos sem sofrer gols.` };
  }
  if (position.zone === "ataque") {
    const target = starter ? 16 : 10;
    return { ...base, metric: "goals", target, label: "Ser decisivo", description: `Marcar pelo menos ${target} gols na temporada.` };
  }
  if (position.zone === "meio") {
    const target = starter ? 13 : 8;
    return { ...base, metric: selector % 2 ? "assists" : "goalContributions", target, label: "Comandar o jogo", description: selector % 2 ? `Dar ${target} assistências.` : `Somar ${target} gols + assistências.` };
  }
  if (selector >= 3) {
    return { ...base, metric: "discipline", target: 7, label: "Liderar sem perder a cabeça", description: "Receber no máximo 7 pontos disciplinares (amarelo = 1, vermelho = 3)." };
  }
  const target = starter ? 25 : 18;
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
  if (score >= 3000) return { label: "O Imortal", color: "#fff1a6", rank: 11, description: "Uma carreira que virou a medida para todas as outras." };
  if (score >= 2400) return { label: "No debate do GOAT", color: "#ffc72c", rank: 10, description: "Seu nome entrou na conversa sobre o maior de todos." };
  if (score >= 1900) return { label: "Top 10 da história", color: "#ffc72c", rank: 9, description: "Pouquíssimos jogadores chegaram a este patamar." };
  if (score >= 1500) return { label: "Lenda mundial", color: "#d7b5ff", rank: 8, description: "Você marcou uma era em escala global." };
  if (score >= 1150) return { label: "Ícone de uma geração", color: "#a675ff", rank: 7, description: "Uma geração inteira vai lembrar do seu futebol." };
  if (score >= 850) return { label: "Lenda continental", color: "#77d6ff", rank: 6, description: "Seu impacto atravessou fronteiras." };
  if (score >= 620) return { label: "Craque consagrado", color: "#63e36b", rank: 5, description: "Você se firmou entre os grandes da sua época." };
  if (score >= 430) return { label: "Estrela nacional", color: "#45c987", rank: 4, description: "Seu nome virou referência dentro do país." };
  if (score >= 270) return { label: "Ídolo local", color: "#2ca8ff", rank: 3, description: "Uma torcida adotou você para sempre." };
  if (score >= 140) return { label: "Profissional respeitado", color: "#8eb4c8", rank: 2, description: "Uma carreira honesta que conquistou respeito." };
  return { label: "Carreira anônima", color: "#f5f7f2", rank: 1, description: "Nem toda história termina sob os holofotes." };
}

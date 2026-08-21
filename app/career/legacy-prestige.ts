import type { CareerHallEntry, CompetitionId, GameState } from "./model";

export type AwardPrestigeLevel = "historical" | "world" | "continental" | "national" | "special";

export type AwardPrestige = {
  points: number;
  level: AwardPrestigeLevel;
  label: string;
};

export type LegacyTierV2 = {
  label: string;
  color: string;
  rank: number;
  description: string;
};

export type LegacyBreakdown = {
  total: number;
  performance: number;
  clubTrophies: number;
  nationalTrophies: number;
  awards: number;
  ballonDorBonus: number;
};

export type HallLegacySummary = {
  score: number;
  label: string;
  color: string;
  signature: string;
  recalculated: boolean;
};

const CLUB_TROPHY_PRESTIGE: Record<CompetitionId, number> = {
  domesticLeague: 92,
  domesticCup: 54,
  domesticSuperCup: 24,
  libertadores: 235,
  sudamericana: 112,
  recopaSudamericana: 58,
  mundial: 190,
  championsLeague: 255,
  uefaSuperCup: 52,
  europaLeague: 120,
  conferenceLeague: 76,
  concacafChampions: 145,
  afcChampions: 132,
  cafChampions: 132,
  campeonesCup: 42,
};

const TROPHY_KEYS = Object.keys(CLUB_TROPHY_PRESTIGE) as CompetitionId[];

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function awardPrestige(award: string): AwardPrestige {
  const name = normalized(award);

  if (name === "bola de ouro") return { points: 430, level: "historical", label: "Prêmio máximo" };
  if (name.includes("melhor jogador da copa") || name.includes("bola de ouro da copa")) {
    return { points: 260, level: "world", label: "Melhor de uma Copa" };
  }
  if (name.includes("fifpro world xi") || name.includes("world xi")) {
    return { points: 118, level: "world", label: "Elite mundial" };
  }
  if (name.includes("the best") || name.includes("fifa best")) {
    return { points: 210, level: "world", label: "Melhor do mundo" };
  }
  if (name.includes("champions") && (name.includes("jogador") || name.includes("mvp") || name.includes("melhor"))) {
    return { points: 150, level: "continental", label: "Craque da Champions" };
  }
  if (name.includes("rei da america") || name.includes("rei da américa")) {
    return { points: 145, level: "continental", label: "Rei da América" };
  }
  if (name.includes("uefa") && (name.includes("jogador") || name.includes("melhor"))) {
    return { points: 138, level: "continental", label: "Elite continental" };
  }
  if (name.includes("chuteira de ouro europeia")) {
    return { points: 126, level: "continental", label: "Artilheiro europeu" };
  }
  if (name.includes("yashin") || name.includes("melhor goleiro")) {
    return { points: 112, level: "world", label: "Goleiro de elite" };
  }
  if (name.includes("puskas") || name.includes("puskás")) {
    return { points: 82, level: "special", label: "Gol histórico" };
  }
  if (name.includes("golden boy") || name.includes("kopa") || name.includes("melhor jovem") || name.includes("revelacao") || name.includes("revelação")) {
    return { points: 74, level: "special", label: "Joia da geração" };
  }
  if (name.includes("jogador do ano") || name.includes("craque") || name.includes("mvp")) {
    return { points: 78, level: "national", label: "Craque da temporada" };
  }
  if (name.includes("artilheiro") || name.includes("chuteira") || name.includes("assistencias") || name.includes("assistências")) {
    return { points: 48, level: "national", label: "Líder estatístico" };
  }
  if (name.includes("goleiro") || name.includes("luva") || name.includes("muralha") || name.includes("defensor") || name.includes("meio-campista")) {
    return { points: 54, level: "national", label: "Melhor da posição" };
  }
  return { points: 30, level: "national", label: "Prêmio individual" };
}

function awardScore(state: GameState) {
  const cabinet = state.awardCabinet ?? {};
  let score = 0;
  let tracked = 0;

  Object.entries(cabinet).forEach(([award, count]) => {
    const safeCount = Math.max(0, Number(count) || 0);
    tracked += safeCount;
    score += awardPrestige(award).points * safeCount;
  });

  const untracked = Math.max(0, (state.awards ?? 0) - tracked);
  score += untracked * 24;
  return score;
}

function ballonDorMilestoneBonus(state: GameState) {
  const count = state.awardCabinet?.["Bola de Ouro"] ?? 0;
  if (count >= 8) return 720;
  if (count >= 5) return 360;
  if (count >= 3) return 150;
  if (count >= 2) return 45;
  return 0;
}

function clubTrophyScore(state: GameState) {
  const cabinet = state.trophyCabinet;
  let score = 0;
  let trackedTitles = 0;

  if (cabinet) {
    TROPHY_KEYS.forEach((id) => {
      const count = Math.max(0, Number(cabinet[id]) || 0);
      trackedTitles += count;
      score += count * CLUB_TROPHY_PRESTIGE[id];
    });
  }

  const untracked = Math.max(0, (state.trophies ?? 0) - trackedTitles);
  return score + untracked * 46;
}

function nationalTitleWeight(name: string) {
  const normalizedName = normalized(name);
  if (normalizedName.includes("copa do mundo")) return 610;
  if (normalizedName.includes("euro") || normalizedName.includes("copa america") || normalizedName.includes("copa américa")) return 245;
  if (normalizedName.includes("olimp")) return 130;
  if (normalizedName.includes("nations") || normalizedName.includes("finalissima")) return 105;
  return 145;
}

function nationalTrophyScore(state: GameState) {
  const champions = (state.nationalHistory ?? []).filter((record) => record.champion);
  const tracked = champions.reduce((total, record) => total + nationalTitleWeight(record.name), 0);
  const untracked = Math.max(0, (state.nationalTrophies ?? 0) - champions.length);
  return tracked + untracked * 145;
}

function performanceScore(state: GameState) {
  const peakOverall = Math.max(state.overall ?? 0, ...(state.history ?? []).map((record) => record.overall ?? 0), 0);
  const stats = state.stats;
  return Math.round(
    (stats?.appearances ?? 0) * 0.16 +
    (stats?.goals ?? 0) * 0.68 +
    (stats?.assists ?? 0) * 0.55 +
    (stats?.cleanSheets ?? 0) * 0.9 +
    (state.nationalCaps ?? 0) * 0.35 +
    Math.max(0, peakOverall - 64) * 5.5,
  );
}

export function legacyBreakdownForState(state: GameState): LegacyBreakdown {
  const performance = performanceScore(state);
  const clubTrophies = Math.round(clubTrophyScore(state));
  const nationalTrophies = Math.round(nationalTrophyScore(state));
  const awards = Math.round(awardScore(state));
  const ballonDorBonus = ballonDorMilestoneBonus(state);
  return {
    total: performance + clubTrophies + nationalTrophies + awards + ballonDorBonus,
    performance,
    clubTrophies,
    nationalTrophies,
    awards,
    ballonDorBonus,
  };
}

export function legacyTierV2(score: number): LegacyTierV2 {
  if (score >= 8000) return { label: "O Imortal", color: "#fff1a6", rank: 11, description: "A carreira virou uma referência histórica do esporte." };
  if (score >= 6500) return { label: "No debate do GOAT", color: "#ffc72c", rank: 10, description: "Seu nome entrou na conversa sobre o maior de todos." };
  if (score >= 5200) return { label: "Top 10 da história", color: "#ffc72c", rank: 9, description: "Pouquíssimos jogadores chegaram a este patamar." };
  if (score >= 4000) return { label: "Lenda mundial", color: "#d7b5ff", rank: 8, description: "Você marcou uma era em escala global." };
  if (score >= 3000) return { label: "Ícone de uma geração", color: "#a675ff", rank: 7, description: "Uma geração inteira vai lembrar do seu futebol." };
  if (score >= 2200) return { label: "Lenda continental", color: "#77d6ff", rank: 6, description: "Seu impacto atravessou fronteiras." };
  if (score >= 1500) return { label: "Craque consagrado", color: "#63e36b", rank: 5, description: "Você se firmou entre os grandes da sua época." };
  if (score >= 1000) return { label: "Estrela nacional", color: "#45c987", rank: 4, description: "Seu nome virou referência dentro do país." };
  if (score >= 650) return { label: "Ídolo local", color: "#2ca8ff", rank: 3, description: "Uma torcida adotou você para sempre." };
  if (score >= 300) return { label: "Profissional respeitado", color: "#8eb4c8", rank: 2, description: "Uma carreira sólida conquistou respeito." };
  return { label: "Carreira anônima", color: "#f5f7f2", rank: 1, description: "Nem toda história termina sob os holofotes." };
}

function titleCount(state: GameState, competition: CompetitionId) {
  return state.trophyCabinet?.[competition] ?? 0;
}

export function legacySignatureForState(state: GameState) {
  const highlights: string[] = [];
  const ballonDor = state.awardCabinet?.["Bola de Ouro"] ?? 0;
  const worldCups = (state.nationalHistory ?? []).filter((record) => record.champion && normalized(record.name).includes("copa do mundo")).length;
  const champions = titleCount(state, "championsLeague");
  const libertadores = titleCount(state, "libertadores");

  if (ballonDor > 0) highlights.push(`${ballonDor} Bola${ballonDor > 1 ? "s" : ""} de Ouro`);
  if (worldCups > 0) highlights.push(`${worldCups} Copa${worldCups > 1 ? "s" : ""} do Mundo`);
  if (champions > 0) highlights.push(`${champions} Champions`);
  if (libertadores > 0) highlights.push(`${libertadores} CONMEBOL Libertadores`);

  if (highlights.length === 0) {
    const titles = (state.trophies ?? 0) + (state.nationalTrophies ?? 0);
    if (titles > 0) highlights.push(`${titles} título${titles > 1 ? "s" : ""}`);
    if ((state.awards ?? 0) > 0) highlights.push(`${state.awards} prêmio${state.awards > 1 ? "s" : ""}`);
  }

  return highlights.slice(0, 3).join(" · ") || "Carreira encerrada";
}

export function legacySummaryForState(state: GameState): HallLegacySummary {
  const score = legacyBreakdownForState(state).total;
  const tier = legacyTierV2(score);
  return {
    score,
    label: tier.label,
    color: tier.color,
    signature: legacySignatureForState(state),
    recalculated: true,
  };
}

export function legacySummaryForHallEntry(entry: CareerHallEntry): HallLegacySummary {
  if (entry.snapshot) return legacySummaryForState(entry.snapshot);
  return {
    score: entry.legacyPoints,
    label: entry.legacyLabel,
    color: "#ffc72c",
    signature: `${entry.trophies} título${entry.trophies === 1 ? "" : "s"} · ${entry.ballonDor} Bola${entry.ballonDor === 1 ? "" : "s"} de Ouro`,
    recalculated: false,
  };
}

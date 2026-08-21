import type { GameState } from "./model";
import { clubById } from "./shared";
import { worldPlayerBallonDorLeaders, worldPlayerGenerationLeaders, worldPlayerStatLeaders, worldPlayerTransferLeaders } from "./world-player-world";

export type OfficialFootballRankingEntry = {
  label: string;
  value: number;
  highlight?: boolean;
};

export type OfficialFootballRanking = {
  id:
    | "all-time-goals"
    | "all-time-assists"
    | "ballon-dor-wins"
    | "champions-titles"
    | "champions-goals"
    | "champions-appearances"
    | "europa-titles"
    | "europa-goals"
    | "libertadores-titles"
    | "libertadores-goals"
    | "sudamericana-titles"
    | "world-cup-goals"
    | "current-generation"
    | "largest-world-transfers";
  eyebrow: string;
  label: string;
  unit: string;
  cutoff: string;
  living?: boolean;
  entries: OfficialFootballRankingEntry[];
};

// Snapshot real usado como chão histórico do Mundo.
// A carreira pode acrescentar resultados posteriores ao corte, mas nunca altera
// retroativamente o que aconteceu no futebol real.
const OFFICIAL_FOOTBALL_RANKINGS: OfficialFootballRanking[] = [
  {
    id: "all-time-goals",
    eyebrow: "FUTEBOL · HISTÓRIA VIVA",
    label: "Maiores artilheiros da história",
    unit: "gols",
    cutoff: "RSSSF · jogos oficiais de alto nível · 19 jul 2026 + seu save",
    living: true,
    entries: [
      { label: "Cristiano Ronaldo", value: 978 },
      { label: "Lionel Messi", value: 921 },
      { label: "Pelé", value: 770 },
      { label: "Romário", value: 761 },
      { label: "Ferenc Puskás", value: 760 },
      { label: "Josef Bican", value: 743 },
      { label: "Robert Lewandowski", value: 697 },
      { label: "James Jones", value: 659 },
      { label: "Abe Lenstra", value: 645 },
      { label: "Gerd Müller", value: 640 },
    ],
  },
  {
    id: "all-time-assists",
    eyebrow: "FUTEBOL · HISTÓRIA VIVA",
    label: "Maiores assistentes da história",
    unit: "assistências",
    cutoff: "IFFHS · jogos oficiais de alto nível · base nov 2025 + seu save",
    living: true,
    entries: [
      { label: "Lionel Messi", value: 400 },
      { label: "Pelé", value: 369 },
      { label: "Ferenc Puskás", value: 359 },
      { label: "Johan Cruyff", value: 346 },
    ],
  },
  {
    id: "ballon-dor-wins",
    eyebrow: "BOLA DE OURO · HISTÓRIA VIVA",
    label: "Maiores vencedores",
    unit: "prêmios",
    cutoff: "France Football · histórico até 2025 + seu save",
    living: true,
    entries: [
      { label: "Lionel Messi", value: 8 },
      { label: "Cristiano Ronaldo", value: 5 },
      { label: "Michel Platini", value: 3 },
      { label: "Johan Cruyff", value: 3 },
      { label: "Marco van Basten", value: 3 },
      { label: "Franz Beckenbauer", value: 2 },
      { label: "Ronaldo", value: 2 },
      { label: "Alfredo Di Stéfano", value: 2 },
      { label: "Kevin Keegan", value: 2 },
      { label: "Karl-Heinz Rummenigge", value: 2 },
    ],
  },
  {
    id: "world-cup-goals",
    eyebrow: "COPA DO MUNDO · HISTÓRIA VIVA",
    label: "Maiores artilheiros",
    unit: "gols",
    cutoff: "FIFA · após 2026 + seu save",
    living: true,
    entries: [
      { label: "Kylian Mbappé", value: 22 },
      { label: "Lionel Messi", value: 21 },
      { label: "Miroslav Klose", value: 16 },
      { label: "Ronaldo", value: 15 },
      { label: "Gerd Müller", value: 14 },
      { label: "Just Fontaine", value: 13 },
      { label: "Pelé", value: 12 },
      { label: "Sándor Kocsis", value: 11 },
      { label: "Jürgen Klinsmann", value: 11 },
      { label: "Harry Kane", value: 11 },
      { label: "Cristiano Ronaldo", value: 10 },
    ],
  },
  {
    id: "champions-titles",
    eyebrow: "CHAMPIONS · HISTÓRIA VIVA",
    label: "Maiores campeões",
    unit: "títulos",
    cutoff: "UEFA · até 2026 + seu save",
    living: true,
    entries: [
      { label: "Real Madrid", value: 15 },
      { label: "Milan", value: 7 },
      { label: "Liverpool", value: 6 },
      { label: "Bayern de Munique", value: 6 },
      { label: "Barcelona", value: 5 },
      { label: "Ajax", value: 4 },
      { label: "Inter de Milão", value: 3 },
      { label: "Manchester United", value: 3 },
      { label: "Paris Saint-Germain", value: 2 },
      { label: "Chelsea", value: 2 },
      { label: "Juventus", value: 2 },
      { label: "Benfica", value: 2 },
      { label: "Nottingham Forest", value: 2 },
      { label: "Porto", value: 2 },
    ],
  },
  {
    id: "champions-goals",
    eyebrow: "CHAMPIONS · JOGADORES",
    label: "Maiores artilheiros",
    unit: "gols",
    cutoff: "UEFA · 2026",
    entries: [
      { label: "Cristiano Ronaldo", value: 141 },
      { label: "Lionel Messi", value: 129 },
      { label: "Robert Lewandowski", value: 109 },
      { label: "Karim Benzema", value: 90 },
      { label: "Raúl", value: 71 },
      { label: "Kylian Mbappé", value: 70 },
      { label: "Ruud van Nistelrooy", value: 60 },
      { label: "Andriy Shevchenko", value: 59 },
      { label: "Erling Haaland", value: 57 },
      { label: "Thomas Müller", value: 57 },
    ],
  },
  {
    id: "champions-appearances",
    eyebrow: "CHAMPIONS · JOGADORES",
    label: "Mais jogos",
    unit: "jogos",
    cutoff: "UEFA · 2026",
    entries: [
      { label: "Cristiano Ronaldo", value: 187 },
      { label: "Iker Casillas", value: 181 },
      { label: "Thomas Müller", value: 165 },
    ],
  },
  {
    id: "europa-titles",
    eyebrow: "EUROPA LEAGUE · HISTÓRIA VIVA",
    label: "Maiores campeões",
    unit: "títulos",
    cutoff: "UEFA · até 2026 + seu save",
    living: true,
    entries: [
      { label: "Sevilla", value: 7 },
      { label: "Liverpool", value: 3 },
      { label: "Juventus", value: 3 },
      { label: "Inter de Milão", value: 3 },
      { label: "Atlético de Madrid", value: 3 },
      { label: "Tottenham", value: 3 },
      { label: "Borussia Mönchengladbach", value: 2 },
      { label: "Feyenoord", value: 2 },
      { label: "IFK Göteborg", value: 2 },
      { label: "Real Madrid", value: 2 },
      { label: "Parma", value: 2 },
      { label: "Porto", value: 2 },
      { label: "Chelsea", value: 2 },
      { label: "Eintracht Frankfurt", value: 2 },
    ],
  },
  {
    id: "europa-goals",
    eyebrow: "EUROPA LEAGUE · JOGADORES",
    label: "Maiores artilheiros",
    unit: "gols",
    cutoff: "UEFA · Taça UEFA + Europa League · 2026",
    entries: [
      { label: "Henrik Larsson", value: 40 },
      { label: "Pierre-Emerick Aubameyang", value: 37 },
      { label: "Klaas-Jan Huntelaar", value: 34 },
      { label: "Alfredo Morelos", value: 32 },
      { label: "Aritz Aduriz", value: 31 },
      { label: "Radamel Falcao", value: 31 },
      { label: "Dieter Müller", value: 29 },
      { label: "Edin Džeko", value: 28 },
      { label: "Vágner Love", value: 27 },
      { label: "Bruno Fernandes", value: 27 },
    ],
  },
  {
    id: "libertadores-titles",
    eyebrow: "CONMEBOL LIBERTADORES · HISTÓRIA VIVA",
    label: "Maiores campeões",
    unit: "títulos",
    cutoff: "CONMEBOL · até 2025 + seu save",
    living: true,
    entries: [
      { label: "Independiente", value: 7 },
      { label: "Boca Juniors", value: 6 },
      { label: "Peñarol", value: 5 },
      { label: "River Plate", value: 4 },
      { label: "Estudiantes", value: 4 },
      { label: "Flamengo", value: 4 },
      { label: "Olimpia", value: 3 },
      { label: "Nacional", value: 3 },
      { label: "São Paulo", value: 3 },
      { label: "Santos", value: 3 },
      { label: "Grêmio", value: 3 },
      { label: "Palmeiras", value: 3 },
    ],
  },
  {
    id: "libertadores-goals",
    eyebrow: "CONMEBOL LIBERTADORES · JOGADORES",
    label: "Maiores artilheiros",
    unit: "gols",
    cutoff: "CONMEBOL · abril de 2026",
    entries: [
      { label: "Alberto Spencer", value: 54 },
      { label: "Fernando Morena", value: 37 },
      { label: "Pedro Rocha", value: 36 },
      { label: "Gabriel Barbosa", value: 31 },
      { label: "Miguel Borja", value: 31 },
      { label: "Daniel Onega", value: 31 },
      { label: "Lucas Pratto", value: 30 },
      { label: "Julio Morales", value: 30 },
      { label: "Luizão", value: 29 },
      { label: "Anthony de Ávila", value: 29 },
      { label: "Juan Sarnari", value: 29 },
    ],
  },
  {
    id: "sudamericana-titles",
    eyebrow: "SUL-AMERICANA · HISTÓRIA VIVA",
    label: "Maiores campeões",
    unit: "títulos",
    cutoff: "CONMEBOL · até 2025 + seu save",
    living: true,
    entries: [
      { label: "Boca Juniors", value: 2 },
      { label: "Independiente", value: 2 },
      { label: "Athletico Paranaense", value: 2 },
      { label: "Independiente del Valle", value: 2 },
      { label: "LDU Quito", value: 2 },
      { label: "Lanús", value: 2 },
    ],
  },
];

function normalizedLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function addEntry(entries: OfficialFootballRankingEntry[], label: string, amount: number, highlight = false) {
  if (amount <= 0 || !label) return;
  const normalized = normalizedLabel(label);
  const found = entries.find((entry) => normalizedLabel(entry.label) === normalized);
  if (found) {
    found.value += amount;
    found.highlight = found.highlight || highlight;
  } else {
    entries.push({ label, value: amount, highlight });
  }
}

function sortRanking(entries: OfficialFootballRankingEntry[]) {
  return entries.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
}

function clubTitleCompetition(boardId: OfficialFootballRanking["id"]) {
  if (boardId === "champions-titles") return "championsLeague";
  if (boardId === "europa-titles") return "europaLeague";
  if (boardId === "libertadores-titles") return "libertadores";
  if (boardId === "sudamericana-titles") return "sudamericana";
  return "";
}

function ballonDorWinnersFromSave(state: GameState) {
  const winners = new Map<string, number>();
  for (const record of state.history) {
    if (record.awards.includes("Bola de Ouro")) {
      winners.set(state.name, (winners.get(state.name) ?? 0) + 1);
      continue;
    }
    const nomination = record.awardNominations.find((item) => item.award === "Bola de Ouro" && !item.won);
    if (nomination?.winner) winners.set(nomination.winner, (winners.get(nomination.winner) ?? 0) + 1);
  }
  return winners;
}

function playerWorldCupGoals(state: GameState) {
  return state.nationalHistory
    .filter((record) => record.name === "Copa do Mundo")
    .reduce((total, record) => total + (record.tournamentStats?.goals ?? 0), 0);
}

export function footballRankingsForState(state: GameState): OfficialFootballRanking[] {
  const ballonWinners = ballonDorWinnersFromSave(state);
  const worldCupGoals = playerWorldCupGoals(state);
  const careerGoals = state.stats.goals;
  const careerAssists = state.stats.assists;
  const worldGoalLeaders = worldPlayerStatLeaders(state, "goals");
  const worldAssistLeaders = worldPlayerStatLeaders(state, "assists");
  const worldBallonLeaders = worldPlayerBallonDorLeaders(state);
  const historicBallonNames = new Set([...ballonWinners.keys()].map(normalizedLabel));

  const historicalBoards = OFFICIAL_FOOTBALL_RANKINGS.map((board) => {
    const entries = board.entries.map((entry) => ({ ...entry }));

    if (board.id === "all-time-goals") {
      addEntry(entries, state.name, careerGoals, true);
      worldGoalLeaders.forEach((entry) => addEntry(entries, entry.label, entry.value));
    }
    if (board.id === "all-time-assists") {
      addEntry(entries, state.name, careerAssists, true);
      worldAssistLeaders.forEach((entry) => addEntry(entries, entry.label, entry.value));
    }

    if (board.id === "ballon-dor-wins") {
      ballonWinners.forEach((count, name) => addEntry(entries, name, count, name === state.name));
      worldBallonLeaders.forEach((entry) => {
        if (!historicBallonNames.has(normalizedLabel(entry.label))) addEntry(entries, entry.label, entry.value);
      });
    }

    if (board.id === "world-cup-goals") {
      addEntry(entries, state.name, worldCupGoals, true);
    }

    const competitionId = clubTitleCompetition(board.id);
    if (competitionId) {
      for (const record of state.history) {
        if (!record.competitions.some((competition) => competition.id === competitionId && competition.champion)) continue;
        const club = clubById(record.clubId);
        addEntry(entries, club.name, 1, record.clubId === state.currentClubId);
      }
    }

    return { ...board, entries: sortRanking(entries) };
  });

  const generationEntries: OfficialFootballRankingEntry[] = worldPlayerGenerationLeaders(state).map((entry) => ({
    label: entry.label,
    value: entry.value,
  }));
  if (state.name && state.overall > 0) generationEntries.push({ label: state.name, value: state.overall, highlight: true });

  const generationBoard: OfficialFootballRanking | null = generationEntries.length ? {
    id: "current-generation",
    eyebrow: "GERAÇÃO DO SAVE",
    label: "Maiores nomes da geração",
    unit: "OVR",
    cutoff: `Universo persistente · temporada ${state.season}`,
    living: true,
    entries: sortRanking(generationEntries),
  } : null;

  const transferEntries = worldPlayerTransferLeaders(state).map((entry) => ({
    label: entry.label,
    value: entry.value,
    highlight: entry.highlight,
  }));
  const transferBoard: OfficialFootballRanking | null = transferEntries.length ? {
    id: "largest-world-transfers",
    eyebrow: "MERCADO · SEU UNIVERSO",
    label: "Maiores transferências do universo",
    unit: "mi €",
    cutoff: "Transferências registradas neste save",
    living: true,
    entries: sortRanking(transferEntries),
  } : null;

  return [
    ...historicalBoards,
    ...(generationBoard ? [generationBoard] : []),
    ...(transferBoard ? [transferBoard] : []),
  ];
}

const WORLD_ARCHIVE_DUPLICATE_IDS = new Set<OfficialFootballRanking["id"]>([
  "champions-titles",
  "europa-titles",
  "libertadores-titles",
  "sudamericana-titles",
  "current-generation",
  "largest-world-transfers",
]);

/** O Arquivo guarda recordes únicos; campeões e líderes do universo vivem nas abas próprias. */
export function archiveFootballRankingsForState(state: GameState) {
  return footballRankingsForState(state).filter((board) => !WORLD_ARCHIVE_DUPLICATE_IDS.has(board.id));
}

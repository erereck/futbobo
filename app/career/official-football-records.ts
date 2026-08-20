export type OfficialFootballRankingEntry = {
  label: string;
  value: number;
};

export type OfficialFootballRanking = {
  id: "champions-titles" | "libertadores-titles" | "champions-goals";
  eyebrow: string;
  label: string;
  unit: string;
  cutoff: string;
  entries: OfficialFootballRankingEntry[];
};

// Snapshot oficial usado como chão histórico do Mundo.
// UEFA: atualizado após a Champions 2025/26.
// CONMEBOL: atualizado após a Libertadores 2025; a edição 2026 ainda está em andamento.
// O universo de cada save deve acrescentar sua própria história por cima destes dados,
// nunca reescrever retroativamente o arquivo real.
export const OFFICIAL_FOOTBALL_RANKINGS: OfficialFootballRanking[] = [
  {
    id: "champions-titles",
    eyebrow: "EUROPA · HISTÓRICO",
    label: "Champions · títulos",
    unit: "títulos",
    cutoff: "até 2026",
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
    id: "libertadores-titles",
    eyebrow: "AMÉRICA DO SUL · HISTÓRICO",
    label: "Libertadores · títulos",
    unit: "títulos",
    cutoff: "até 2025",
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
    id: "champions-goals",
    eyebrow: "CHAMPIONS · JOGADORES",
    label: "Maiores artilheiros",
    unit: "gols",
    cutoff: "ranking UEFA · 2026",
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
];

export type OfficialFootballRankingEntry = {
  label: string;
  value: number;
};

export type OfficialFootballRanking = {
  id:
    | "champions-titles"
    | "champions-goals"
    | "champions-appearances"
    | "europa-titles"
    | "europa-goals"
    | "libertadores-titles"
    | "libertadores-goals"
    | "sudamericana-titles"
    | "world-cup-goals";
  eyebrow: string;
  label: string;
  unit: string;
  cutoff: string;
  entries: OfficialFootballRankingEntry[];
};

// Snapshot real usado como chão histórico do Mundo.
// UEFA: atualizado após a temporada 2025/26.
// CONMEBOL: Libertadores/Sudamericana até 2025; as edições 2026 estão em andamento.
// FIFA: Copa do Mundo atualizada após a edição de 2026.
// O universo de cada save acrescenta sua própria história por cima destes dados;
// nunca reescreve retroativamente o arquivo real.
export const OFFICIAL_FOOTBALL_RANKINGS: OfficialFootballRanking[] = [
  {
    id: "world-cup-goals",
    eyebrow: "COPA DO MUNDO · JOGADORES",
    label: "Maiores artilheiros",
    unit: "gols",
    cutoff: "FIFA · após 2026",
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
    eyebrow: "EUROPA · HISTÓRICO",
    label: "Champions · títulos",
    unit: "títulos",
    cutoff: "UEFA · até 2026",
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
    label: "Champions · artilheiros",
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
    label: "Champions · mais jogos",
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
    eyebrow: "EUROPA LEAGUE · HISTÓRICO",
    label: "Europa League · títulos",
    unit: "títulos",
    cutoff: "UEFA · até 2026",
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
    label: "Europa League · artilheiros",
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
    eyebrow: "AMÉRICA DO SUL · HISTÓRICO",
    label: "Libertadores · títulos",
    unit: "títulos",
    cutoff: "CONMEBOL · até 2025",
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
    eyebrow: "LIBERTADORES · JOGADORES",
    label: "Libertadores · artilheiros",
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
    eyebrow: "SUL-AMERICANA · HISTÓRICO",
    label: "Sul-Americana · títulos",
    unit: "títulos",
    cutoff: "CONMEBOL · até 2025",
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

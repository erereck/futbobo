import type { GameState } from "./model";
import { clubById } from "./shared";

export type ContextRecordEntry = {
  label: string;
  value: number;
  highlight?: boolean;
};

export type ContextRecordBoard = {
  id: string;
  eyebrow: string;
  label: string;
  unit: string;
  cutoff: string;
  living: true;
  entries: ContextRecordEntry[];
};

type ClubGoalRecord = {
  aliases: string[];
  holder: string;
  value: number;
};

const CLUB_GOAL_RECORDS: ClubGoalRecord[] = [
  { aliases: ["real madrid"], holder: "Cristiano Ronaldo", value: 450 },
  { aliases: ["barcelona", "fc barcelona"], holder: "Lionel Messi", value: 672 },
  { aliases: ["bayern", "bayern de munique", "bayern munich"], holder: "Gerd Müller", value: 566 },
  { aliases: ["manchester united"], holder: "Wayne Rooney", value: 253 },
  { aliases: ["liverpool"], holder: "Ian Rush", value: 346 },
  { aliases: ["arsenal"], holder: "Thierry Henry", value: 228 },
  { aliases: ["chelsea"], holder: "Frank Lampard", value: 211 },
  { aliases: ["manchester city"], holder: "Sergio Agüero", value: 260 },
  { aliases: ["paris saint germain", "paris saint-germain", "psg"], holder: "Kylian Mbappé", value: 256 },
  { aliases: ["juventus"], holder: "Alessandro Del Piero", value: 290 },
  { aliases: ["milan", "ac milan"], holder: "Gunnar Nordahl", value: 221 },
  { aliases: ["inter de milao", "inter de milão", "internazionale", "inter milan"], holder: "Giuseppe Meazza", value: 284 },
  { aliases: ["flamengo"], holder: "Zico", value: 509 },
  { aliases: ["corinthians"], holder: "Cláudio", value: 305 },
  { aliases: ["palmeiras"], holder: "Heitor", value: 327 },
  { aliases: ["santos"], holder: "Pelé", value: 643 },
  { aliases: ["sao paulo", "são paulo"], holder: "Serginho Chulapa", value: 242 },
  { aliases: ["vasco", "vasco da gama"], holder: "Roberto Dinamite", value: 708 },
  { aliases: ["boca juniors", "boca"], holder: "Martín Palermo", value: 236 },
  { aliases: ["river plate", "river"], holder: "Ángel Labruna", value: 317 },
];

type NationalRecord = {
  topScorer: { name: string; value: number };
  mostCaps: { name: string; value: number };
};

const NATIONAL_RECORDS: Record<string, NationalRecord> = {
  brasil: {
    topScorer: { name: "Neymar", value: 79 },
    mostCaps: { name: "Cafu", value: 142 },
  },
  argentina: {
    topScorer: { name: "Lionel Messi", value: 125 },
    mostCaps: { name: "Lionel Messi", value: 206 },
  },
  portugal: {
    topScorer: { name: "Cristiano Ronaldo", value: 146 },
    mostCaps: { name: "Cristiano Ronaldo", value: 233 },
  },
  alemanha: {
    topScorer: { name: "Miroslav Klose", value: 71 },
    mostCaps: { name: "Lothar Matthäus", value: 150 },
  },
  espanha: {
    topScorer: { name: "David Villa", value: 59 },
    mostCaps: { name: "Sergio Ramos", value: 180 },
  },
  italia: {
    topScorer: { name: "Luigi Riva", value: 35 },
    mostCaps: { name: "Gianluigi Buffon", value: 176 },
  },
  uruguai: {
    topScorer: { name: "Luis Suárez", value: 69 },
    mostCaps: { name: "Diego Godín", value: 161 },
  },
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sortEntries(entries: ContextRecordEntry[]) {
  return entries.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
}

function matchingClubRecord(clubNames: string[]) {
  const exact = CLUB_GOAL_RECORDS.find((candidate) => candidate.aliases.some((alias) => clubNames.includes(normalize(alias))));
  if (exact) return exact;
  return CLUB_GOAL_RECORDS.find((candidate) => candidate.aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    return normalizedAlias.length >= 5 && clubNames.some((name) => name.startsWith(`${normalizedAlias} `));
  }));
}

function clubRecordForState(state: GameState): ContextRecordBoard | null {
  if (!state.currentClubId) return null;
  const club = clubById(state.currentClubId);
  const clubNames = [club.name, club.shortName, club.abbr].map(normalize);
  const record = matchingClubRecord(clubNames);
  if (!record) return null;

  const playerGoals = (state.history ?? [])
    .filter((season) => season.clubId === state.currentClubId)
    .reduce((total, season) => total + (season.goals ?? 0), 0);

  return {
    id: `club-goals-${state.currentClubId}`,
    eyebrow: `${club.shortName.toLocaleUpperCase("pt-BR")} · RECORDE DO CLUBE`,
    label: "Maior artilheiro",
    unit: "gols",
    cutoff: "Recorde histórico do clube + temporadas concluídas neste save",
    living: true,
    entries: sortEntries([
      { label: record.holder, value: record.value },
      { label: state.name || "Você", value: playerGoals, highlight: true },
    ]),
  };
}

function nationalBoardsForState(state: GameState): ContextRecordBoard[] {
  const record = NATIONAL_RECORDS[state.nationality];
  if (!record) return [];

  return [
    {
      id: `national-goals-${state.nationality}`,
      eyebrow: "SELEÇÃO · RECORDE HISTÓRICO",
      label: "Maior artilheiro da seleção",
      unit: "gols",
      cutoff: "Histórico real até 2026 + sua carreira",
      living: true,
      entries: sortEntries([
        { label: record.topScorer.name, value: record.topScorer.value },
        { label: state.name || "Você", value: state.nationalGoals ?? 0, highlight: true },
      ]),
    },
    {
      id: `national-caps-${state.nationality}`,
      eyebrow: "SELEÇÃO · RECORDE HISTÓRICO",
      label: "Mais jogos pela seleção",
      unit: "jogos",
      cutoff: "Histórico real até 2026 + sua carreira",
      living: true,
      entries: sortEntries([
        { label: record.mostCaps.name, value: record.mostCaps.value },
        { label: state.name || "Você", value: state.nationalCaps ?? 0, highlight: true },
      ]),
    },
  ];
}

export function historicalRecordBoardsForState(state: GameState): ContextRecordBoard[] {
  const clubBoard = clubRecordForState(state);
  return [
    ...(clubBoard ? [clubBoard] : []),
    ...nationalBoardsForState(state),
  ];
}

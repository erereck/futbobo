import { CLUBS } from "../game-data";
import type { WorldCompetitionLedger } from "./world-memory";
import { domesticArchiveClubName } from "./domestic-title-archive";
import type { DomesticTitleLedger } from "./domestic-title-archive";
import { BRAZIL_CUP_ARCHIVE_ONLY_CLUBS } from "./brazil-cup-history";

type ClubLedger = DomesticTitleLedger | WorldCompetitionLedger;

export type ClubDossier = {
  clubId: string;
  name: string;
  countryId: string;
  competitions: Array<{
    id: string;
    label: string;
    totalTitles: number;
    historicTitles: number;
    saveTitles: number;
    years: Array<{ season: number; source: "historic" | "generated" | "player" }>;
    runnerUpYears: number[];
  }>;
  totalTitles: number;
  saveTitles: number;
  brazilCupFinals: Array<{
    season: number;
    result: "champion" | "runner-up";
    opponent: string;
    opponentId: string;
    source: "historic" | "generated" | "player";
  }>;
};

export const CLUB_ARCHIVE_INDEX = [
  ...CLUBS.map((club) => ({ id: club.id, name: club.shortName, fullName: club.name, countryId: club.countryId })),
  ...Object.entries(BRAZIL_CUP_ARCHIVE_ONLY_CLUBS).map(([id, name]) => ({ id, name, fullName: name, countryId: "brasil" })),
];

/** Deriva cada ficha dos mesmos campeões e rankings do Mundo; nada é salvo em duplicidade. */
export function buildClubDossier(
  clubId: string,
  competitionLedgers: WorldCompetitionLedger[],
  domesticLedgers: DomesticTitleLedger[],
): ClubDossier | null {
  const club = CLUB_ARCHIVE_INDEX.find((item) => item.id === clubId);
  if (!club) return null;
  const competitions = [...domesticLedgers, ...competitionLedgers]
    .filter((ledger) => ledger.entityType === "club")
    .filter((ledger) => !("countryId" in ledger) || ledger.countryId === club.countryId)
    .map((ledger: ClubLedger) => {
      const totalTitles = ledger.titleTable.find((entry) => entry.entityId === clubId)?.titles ?? 0;
      const years = ledger.champions
        .filter((champion) => champion.winnerId === clubId)
        .map((champion) => ({ season: champion.season, source: champion.source }))
        .sort((a, b) => b.season - a.season);
      const saveTitles = years.filter((year) => year.source !== "historic").length;
      const runnerUpYears = ledger.champions
        .filter((champion) => champion.runnerUpId === clubId)
        .map((champion) => champion.season)
        .sort((a, b) => b - a);
      return {
        id: ledger.id,
        label: ledger.label.replace(/^.+? · /, ""),
        totalTitles,
        historicTitles: Math.max(0, totalTitles - saveTitles),
        saveTitles,
        years,
        runnerUpYears,
      };
    })
    .filter((item) => item.totalTitles > 0 || (club.countryId === "brasil" && item.id === "domestic-copa-do-brasil"))
    .sort((a, b) => b.totalTitles - a.totalTitles || a.label.localeCompare(b.label, "pt-BR"));
  const brazilCupFinals = domesticLedgers
    .find((ledger) => ledger.id === "domestic-copa-do-brasil")?.champions
    .filter((final) => final.winnerId === clubId || final.runnerUpId === clubId)
    .map((final) => ({
      season: final.season,
      result: final.winnerId === clubId ? "champion" as const : "runner-up" as const,
      opponent: final.winnerId === clubId
        ? final.runnerUpId ? domesticArchiveClubName(final.runnerUpId) : ""
        : domesticArchiveClubName(final.winnerId),
      opponentId: final.winnerId === clubId ? final.runnerUpId ?? "" : final.winnerId,
      source: final.source,
    }))
    .sort((a, b) => b.season - a.season) ?? [];

  return {
    clubId,
    name: club.name,
    countryId: club.countryId,
    competitions,
    totalTitles: competitions.reduce((total, item) => total + item.totalTitles, 0),
    saveTitles: competitions.reduce((total, item) => total + item.saveTitles, 0),
    brazilCupFinals,
  };
}

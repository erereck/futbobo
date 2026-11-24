// Lenda do clube e a despedida no estádio.
//
// Lenda: 7 temporadas seguidas no clube (a passagem atual), 3 títulos ou mais
// pelo clube e a torcida em "Amado" para cima. Quem sai de um clube onde é
// lenda (transferência ou aposentadoria) ganha a despedida antes do avião.

import type { Club } from "../game-data";
import { clubBadgePath } from "../botao/adapter";
import { careerSquadAppearance, teamKitPattern } from "../player-appearance";
import type { FarewellInput, FarewellStats } from "../farewell/farewell-script";
import type { GameState, SeasonRecord, TransferOffer } from "./model";
import { isBannedFromFootball } from "./football-ban";
import { ensureClubSquadPlayers, worldPlayersAtClub } from "./world-players";

export const LEGEND_MIN_SEASONS = 7;
export const LEGEND_MIN_TITLES = 3;
/** "Amado" no termômetro da torcida (fanMood). */
export const LEGEND_MIN_FANS = 82;

type LegendState = Pick<GameState, "history" | "fanSupport">;

/** A passagem atual: temporadas seguidas no clube, contadas do fim do histórico. */
export function currentSpell(history: SeasonRecord[], clubId: string): SeasonRecord[] {
  let start = history.length;
  while (start > 0 && history[start - 1].clubId === clubId) start -= 1;
  return history.slice(start);
}

function clubRecords(history: SeasonRecord[], clubId: string) {
  return history.filter((record) => record.clubId === clubId);
}

function countTitles(records: SeasonRecord[]) {
  return records.reduce((total, record) => total + record.competitions.filter((competition) => competition.champion).length, 0);
}

export type LegendStatus = { legend: boolean; seasons: number; titles: number; fans: number };

export function clubLegendStatus(state: LegendState, clubId: string): LegendStatus {
  if (!clubId) return { legend: false, seasons: 0, titles: 0, fans: state.fanSupport };
  const seasons = currentSpell(state.history, clubId).length;
  const titles = countTitles(clubRecords(state.history, clubId));
  return {
    legend: seasons >= LEGEND_MIN_SEASONS && titles >= LEGEND_MIN_TITLES && state.fanSupport >= LEGEND_MIN_FANS,
    seasons,
    titles,
    fans: state.fanSupport,
  };
}

/**
 * A saída merece a despedida? Lenda do clube que acabou de jogar por ele,
 * sem banimento no caminho, saindo de vez (empréstimo não é despedida).
 */
export function farewellDue(state: GameState, clubId: string, offer: Pick<TransferOffer, "type" | "clubId"> | null): boolean {
  if (!clubId || isBannedFromFootball(state)) return false;
  if (state.history.at(-1)?.clubId !== clubId) return false;
  if (state.isFreeAgent && state.freeAgentSinceSeason < state.season) return false;
  if (offer && (offer.type === "loan" || offer.type === "renewal" || offer.clubId === clubId)) return false;
  return clubLegendStatus(state, clubId).legend;
}

export function farewellStats(state: GameState, clubId: string): FarewellStats {
  const records = clubRecords(state.history, clubId);
  const tally = new Map<string, number>();
  for (const record of records) {
    for (const competition of record.competitions) if (competition.champion) tally.set(competition.name, (tally.get(competition.name) ?? 0) + 1);
  }
  const titleLines = [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .slice(0, 4)
    .map(([name, count]) => (count > 1 ? `${count}× ${name}` : name));
  const seasons = records.map((record) => record.season);
  return {
    seasons: currentSpell(state.history, clubId).length,
    from: seasons.length ? Math.min(...seasons) : state.season,
    to: seasons.length ? Math.max(...seasons) : state.season,
    appearances: records.reduce((sum, record) => sum + record.appearances, 0),
    goals: records.reduce((sum, record) => sum + record.goals, 0),
    assists: records.reduce((sum, record) => sum + record.assists, 0),
    cleanSheets: records.reduce((sum, record) => sum + record.cleanSheets, 0),
    titles: countTitles(records),
    titleLines,
    keeper: state.position === "GOL",
    captain: state.clubCaptain,
  };
}

/** Dados da cena: o jogador na camisa do clube, os números pelo clube e o corredor de companheiros. */
export function buildFarewellInput(state: GameState, club: Club, destination: Club | null, kind: FarewellInput["kind"]): FarewellInput {
  const kitPattern = teamKitPattern(state.seed, club.id);
  const squad = worldPlayersAtClub(ensureClubSquadPlayers(state.worldPlayers, club.id, state.season, 14), club.id)
    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
    .slice(0, 10);
  const taken = new Set([state.number]);
  const numberFor = (index: number) => {
    let number = 2 + ((index * 7 + (state.seed % 11)) % 28);
    while (taken.has(number)) number = number >= 30 ? 2 : number + 1;
    taken.add(number);
    return number;
  };
  const teammates = squad.map((member, index) => ({
    appearance: careerSquadAppearance({ seed: state.seed, memberId: member.id, teamId: club.id, nationality: member.nationality }),
    number: numberFor(index),
  }));
  const shortName = state.name.trim().split(/\s+/).at(-1) || state.name || "Você";
  const clubInfo = (source: Club) => ({
    id: source.id,
    name: source.name,
    shortName: source.shortName,
    abbr: source.abbr,
    primary: source.primary,
    secondary: source.secondary,
    badge: clubBadgePath(source),
    city: source.city,
    kitPattern: teamKitPattern(state.seed, source.id),
  });
  return {
    player: { name: state.name, shortName, number: state.number, appearance: { ...state.playerAppearance, kitPattern } },
    club: clubInfo(club),
    destination: destination ? clubInfo(destination) : null,
    stats: farewellStats(state, club.id),
    teammates,
    kind,
  };
}

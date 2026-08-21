import { CLUBS } from "../game-data";
import { awardPrestige } from "./legacy-prestige";
import type { GameState } from "./model";
import type { WorldPlayer } from "./world-player-model";

export type WorldPlayerRankingEntry = {
  label: string;
  value: number;
  playerId: string;
};

export type WorldPlayerTransferEntry = {
  label: string;
  value: number;
  season: number;
  highlight?: boolean;
};

export type WorldPlayerNewsProjection = {
  id: string;
  season: number;
  category: "award" | "transfer" | "rival";
  priority: "major" | "normal";
  title: string;
  summary: string;
};

function playersForState(state: GameState) {
  return Object.values(state.worldPlayers?.players ?? {});
}

function clubShortName(clubId: string) {
  return CLUBS.find((club) => club.id === clubId)?.shortName ?? "clube desconhecido";
}

function ballonDorWins(player: WorldPlayer) {
  return player.honors.filter((honor) => honor.kind === "award" && honor.name === "Bola de Ouro").length;
}

function eraScore(player: WorldPlayer) {
  return (
    ballonDorWins(player) * 190 +
    player.overall * 2.2 +
    player.reputation * 1.6 +
    player.careerStats.goals * 0.12 +
    player.careerStats.assists * 0.16 +
    player.honors.filter((honor) => honor.kind === "award").length * 14
  );
}

function generationRivalForState(state: GameState) {
  if (state.history.length < 3) return null;
  const protagonistBirthSeason = state.season - state.age;
  return playersForState(state)
    .filter((player) =>
      player.status !== "retired" &&
      Math.abs(player.birthSeason - protagonistBirthSeason) <= 7 &&
      (
        ballonDorWins(player) > 0 ||
        player.reputation >= 72 ||
        player.overall >= Math.max(82, state.overall - 4)
      )
    )
    .sort((a, b) => eraScore(b) - eraScore(a) || b.overall - a.overall || a.id.localeCompare(b.id))[0] ?? null;
}

export function worldPlayerStatLeaders(
  state: GameState,
  metric: "appearances" | "goals" | "assists" | "tackles" | "cleanSheets",
  limit = 8,
): WorldPlayerRankingEntry[] {
  return playersForState(state)
    .filter((player) => player.careerStats[metric] > 0)
    .sort((a, b) => b.careerStats[metric] - a.careerStats[metric] || b.reputation - a.reputation || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((player) => ({ label: player.name, value: player.careerStats[metric], playerId: player.id }));
}

export function worldPlayerBallonDorLeaders(state: GameState, limit = 12): WorldPlayerRankingEntry[] {
  return playersForState(state)
    .map((player) => ({ player, wins: ballonDorWins(player) }))
    .filter(({ wins }) => wins > 0)
    .sort((a, b) => b.wins - a.wins || b.player.reputation - a.player.reputation || a.player.id.localeCompare(b.player.id))
    .slice(0, limit)
    .map(({ player, wins }) => ({ label: player.name, value: wins, playerId: player.id }));
}

export function worldPlayerGenerationLeaders(state: GameState, limit = 8): WorldPlayerRankingEntry[] {
  return playersForState(state)
    .filter((player) => player.status !== "retired")
    .sort((a, b) => b.overall - a.overall || b.reputation - a.reputation || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((player) => ({ label: player.name, value: player.overall, playerId: player.id }));
}

export function worldPlayerTransferLeaders(state: GameState, limit = 10): WorldPlayerTransferEntry[] {
  const npcTransfers: WorldPlayerTransferEntry[] = playersForState(state).flatMap((player) =>
    player.clubHistory
      .filter((spell) => spell.transferFee > 0 && spell.moveType === "permanent")
      .map((spell) => ({
        label: `${player.name} → ${clubShortName(spell.clubId)}`,
        value: Math.max(1, Math.round(spell.transferFee / 1_000_000)),
        season: spell.joinedSeason,
      })),
  );

  const protagonistTransfers: WorldPlayerTransferEntry[] = (state.transferHistory ?? [])
    .filter((record) => record.transferFee > 0 && record.type === "permanent")
    .map((record) => ({
      label: `${state.name || "Você"} → ${clubShortName(record.toClubId)}`,
      value: Math.max(1, Math.round(record.transferFee / 1_000_000)),
      season: record.season,
      highlight: true,
    }));

  return [...npcTransfers, ...protagonistTransfers]
    .sort((a, b) => b.value - a.value || b.season - a.season || a.label.localeCompare(b.label, "pt-BR"))
    .slice(0, limit);
}

export function worldPlayerNewsForState(state: GameState): WorldPlayerNewsProjection[] {
  const news: WorldPlayerNewsProjection[] = [];

  for (const player of playersForState(state)) {
    for (const honor of player.honors) {
      if (honor.kind !== "award") continue;
      const prestige = awardPrestige(honor.name);
      if (prestige.points < 100) continue;
      const club = clubShortName(honor.clubId);
      news.push({
        id: `world-player-award-${player.id}-${honor.id}`,
        season: honor.season,
        category: "award",
        priority: prestige.level === "historical" || prestige.level === "world" || prestige.points >= 140 ? "major" : "normal",
        title: honor.name === "Bola de Ouro" ? `${player.name} vence a Bola de Ouro` : `${player.name}: ${honor.name}`,
        summary: `${club} · ${prestige.label}.`,
      });
    }

    for (const spell of player.clubHistory) {
      if (spell.moveType !== "permanent" || spell.transferFee < 60_000_000) continue;
      const millions = Math.round(spell.transferFee / 1_000_000);
      news.push({
        id: `world-player-transfer-${player.id}-${spell.joinedSeason}-${spell.clubId}`,
        season: spell.joinedSeason,
        category: "transfer",
        priority: spell.transferFee >= 120_000_000 ? "major" : "normal",
        title: `${player.name} fecha com o ${clubShortName(spell.clubId)}`,
        summary: `€${millions} mi · uma das grandes movimentações do mercado.`,
      });
    }

    if (player.retiredSeason) {
      const majorHonors = player.honors.filter((honor) => honor.kind === "award" && awardPrestige(honor.name).points >= 100).length;
      const historicEnough = ballonDorWins(player) > 0 || majorHonors >= 2 || player.careerStats.goals >= 250 || player.careerStats.assists >= 180;
      if (historicEnough) {
        const ballonDor = ballonDorWins(player);
        news.push({
          id: `world-player-retirement-${player.id}`,
          season: player.retiredSeason,
          category: "rival",
          priority: ballonDor > 0 || majorHonors >= 3 ? "major" : "normal",
          title: `${player.name} encerra a carreira`,
          summary: `${player.careerStats.goals} gols · ${player.careerStats.assists} assistências${ballonDor ? ` · ${ballonDor} Bola${ballonDor > 1 ? "s" : ""} de Ouro` : ""}.`,
        });
      }
    }
  }

  const eraRival = generationRivalForState(state);
  if (eraRival) {
    const rivalBallons = ballonDorWins(eraRival);
    const protagonistBallons = state.awardCabinet["Bola de Ouro"] ?? 0;
    const latestSeason = state.history.at(-1)?.season ?? Math.max(2027, state.season - 1);
    const closeRace = Math.abs(eraRival.overall - state.overall) <= 3 || Math.abs(rivalBallons - protagonistBallons) <= 1;
    news.push({
      id: `world-player-era-rival-${latestSeason}-${eraRival.id}`,
      season: latestSeason,
      category: "rival",
      priority: rivalBallons > 0 || closeRace ? "major" : "normal",
      title: `${eraRival.name} vira referência da sua geração`,
      summary: `${clubShortName(eraRival.currentClubId)} · ${eraRival.overall} OVR${rivalBallons ? ` · ${rivalBallons} Bola${rivalBallons > 1 ? "s" : ""} de Ouro` : ""}.`,
    });
  }

  return news;
}

"use client";

// Campeão do torneio (§1.9): o escudo grande, o caminho até a taça e o vice.

import BobCrest from "../teams/BobCrest";
import { championOf, loserOf, matchIdFor, matchById, roundName } from "../tournament/bracket";
import type { RoomClientState } from "../room/room-api";
import type { BracketMatch } from "../types";
import { isCpuEntrant, nicknameOf, roomClient, teamOf } from "../use-room";

function pathLine(state: RoomClientState, match: BracketMatch, champion: string): string {
  const championHome = match.home?.entrantId === champion;
  const other = championHome ? match.away : match.home;
  const result = match.result;
  if (match.kind === "bye" || !other || !result) return "Folga";
  const goals = championHome ? `${result.homeGoals} × ${result.awayGoals}` : `${result.awayGoals} × ${result.homeGoals}`;
  const pens = result.homePens !== null && result.awayPens !== null
    ? ` (pên. ${championHome ? `${result.homePens} × ${result.awayPens}` : `${result.awayPens} × ${result.homePens}`})`
    : "";
  const versus = teamOf(state, other.entrantId)?.shortName ?? nicknameOf(state, other.entrantId);
  return result.decision === "walkover" ? `W.O. contra ${versus}` : `${goals}${pens} contra ${versus}`;
}

export default function ChampionScreen({ state, onHome }: { state: RoomClientState; onHome: () => void }) {
  const bracket = state.snapshot?.bracket;
  const champion = bracket ? championOf(bracket) : null;
  if (!bracket || !champion) return null;
  const team = teamOf(state, champion);
  const mine = champion === state.me;
  const final = matchById(bracket, matchIdFor(bracket.rounds, 0));
  const vice = final ? loserOf(final) : null;
  const viceTeam = vice ? teamOf(state, vice) : null;
  const path = bracket.matches
    .filter((match) => match.status === "done" && (match.home?.entrantId === champion || match.away?.entrantId === champion))
    .sort((a, b) => a.round - b.round);

  return (
    <section className="bob-champion" aria-labelledby="bob-champion-title" data-testid="bob-champion">
      <span className="bob-eyebrow">CAMPEÃO</span>
      {team && <BobCrest team={team} size={132} cpu={isCpuEntrant(champion)} />}
      <h1 id="bob-champion-title">{mine ? "Você é campeão do Bobonline!" : `Campeão do torneio: ${team?.name ?? nicknameOf(state, champion)}`}</h1>
      {!isCpuEntrant(champion) && !mine && <p className="bob-champion-who">{nicknameOf(state, champion)}</p>}

      <ol className="bob-champion-path" aria-label="Caminho até a taça">
        {path.map((match) => (
          <li key={match.id}>
            <span>{roundName(bracket.size, match.round)}</span>
            <strong>{pathLine(state, match, champion)}</strong>
          </li>
        ))}
      </ol>
      {vice && <p className="bob-champion-vice">Vice: {viceTeam?.name ?? nicknameOf(state, vice)}</p>}

      <div className="bob-result-actions">
        {state.isHost && (
          <button type="button" className="primary-button" data-testid="bob-new-tournament" onClick={() => roomClient()?.hostNewTournament()}>
            Novo torneio com a mesma sala
          </button>
        )}
        <button type="button" className="secondary-button" data-testid="bob-home" onClick={onHome}>Voltar ao início</button>
      </div>
    </section>
  );
}

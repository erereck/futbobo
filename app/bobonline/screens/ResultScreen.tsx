"use client";

// Apito final (§1.8), do ponto de vista de quem olha: o placar com o meu time à
// esquerda, a história neutra (do resultado canônico), os números da mesa, os gols
// com replay e as saídas (revanche e série no X1; a chave no torneio).

import { useEffect, useState } from "react";
import BotaoMatchStats from "../../botao/BotaoMatchStats";
import GoalReplay from "../../botao/GoalReplay";
import TeamCrest from "../../botao/TeamCrest";
import { mirrorResult } from "../../botao/match-codec";
import type { BotaoMatchResult } from "../../botao/types";
import type { DuelHandle, RoomClientState } from "../room/room-api";
import { describeOnlineResult, formatGoalMinute, isMatchGoal, resultFromBracket, resultHeadline, scoreLine } from "../result-copy";
import { bracketMatchOf, nicknameOf, opponentLabel, roomClient } from "../use-room";
import { T } from "../protocol";
import "../../botao/botao.css";

export default function ResultScreen({
  state,
  played,
  local,
  onSeeBracket,
  onBackToLobby,
}: {
  state: RoomClientState;
  /** A partida que acabou (a última que este aparelho jogou). */
  played: DuelHandle;
  /** Resultado completo do lado "user" (da BotaoMatch); null num W.O. sem jogo terminado. */
  local: BotaoMatchResult | null;
  /** Torneio: sair da tela de resultado (match:free) e ver a chave (ou o campeão). */
  onSeeBracket: () => void;
  /** X1: voltar para a sala com a série guardada. */
  onBackToLobby: () => void;
}) {
  const [replay, setReplay] = useState<number | null>(null);
  const [asked, setAsked] = useState(false);
  const [sawMine, setSawMine] = useState(false);
  const snapshot = state.snapshot;
  const format = snapshot?.settings.format ?? "x1";
  const tournament = format !== "x1";
  const match = bracketMatchOf(state, played.bracketId);
  const bracketResult = match?.result && match.result.matchId === played.matchId ? match.result : null;
  const rematch = state.rematch;

  // Torneio: depois de RESULT_HOLD_S o anfitrião já conta como livre; avisa também daqui (match:free).
  useEffect(() => {
    if (!tournament) return;
    const timer = setTimeout(() => roomClient()?.leftResultScreen(played.bracketId), T.RESULT_HOLD_S * 1000);
    return () => clearTimeout(timer);
  }, [tournament, played.bracketId]);

  // "Não quis revanche": só depois de ver o meu pedido registrado na sala.
  useEffect(() => {
    if (asked && rematch?.mine && !sawMine) queueMicrotask(() => setSawMine(true));
  }, [asked, rematch?.mine, sawMine]);

  const setup = played.launch.setup;
  const mySide = played.launch.perspective === "cpu" ? "cpu" : "user";
  const canonical = local ?? (bracketResult ? resultFromBracket(bracketResult) : null);
  if (!canonical) {
    return (
      <section className="bob-result" aria-busy="true">
        <p className="bob-hint"><span className="bob-spinner" aria-hidden="true" />Fechando o placar…</p>
      </section>
    );
  }

  const walkover = bracketResult?.walkover ?? null;
  // O placar e a manchete saem do mesmo resultado (o completo da partida, quando existe); no W.O. manda a sala.
  const won = walkover && bracketResult ? (bracketResult.winner === "home") === (mySide === "user") : (canonical.outcome === "win") === (mySide === "user");
  const opponentSide = mySide === "user" ? match?.away : match?.home;
  const opponentId = opponentSide?.entrantId ?? null;
  const otherSide = mySide === "user" ? "cpu" : "user";
  const opponentName = opponentId ? opponentLabel(state, opponentId) : played.launch.names[otherSide];
  const opponentNick = opponentId ? nicknameOf(state, opponentId) : played.launch.names[otherSide];
  const mine = mySide === "user" ? canonical.goalsFor : canonical.goalsAgainst;
  const theirs = mySide === "user" ? canonical.goalsAgainst : canonical.goalsFor;
  const pens = canonical.penaltyFor !== null && canonical.penaltyAgainst !== null
    ? { mine: mySide === "user" ? canonical.penaltyFor : canonical.penaltyAgainst, theirs: mySide === "user" ? canonical.penaltyAgainst : canonical.penaltyFor }
    : null;
  const myTeam = mySide === "user" ? setup.userTeam : setup.cpuTeam;
  const theirTeam = mySide === "user" ? setup.cpuTeam : setup.userTeam;
  const goals = canonical.timeline.map((entry, index) => ({ entry, index })).filter(({ entry }) => isMatchGoal(entry));
  const backInLobby = snapshot?.stage === "lobby";
  const declined = asked && sawMine && !rematch?.mine && !backInLobby;
  const creator = snapshot?.members.find((member) => member.joinOrder === 0)?.playerId;
  const series = snapshot?.series;
  const seriesMine = series ? (creator === state.me ? series.home : series.away) : 0;
  const seriesTheirs = series ? (creator === state.me ? series.away : series.home) : 0;
  const tournamentOver = snapshot?.stage === "done";
  const activeReplay = replay !== null ? local?.replays?.[replay] ?? null : null;

  function askRematch(want: boolean) {
    roomClient()?.wantRematch(want);
    setAsked(want);
    setSawMine(false);
  }

  return (
    <section className="bob-result" aria-labelledby="bob-result-title" data-testid="bob-result">
      <header className="bob-result-hero" data-won={won ? "true" : "false"}>
        <span className="bob-eyebrow">APITO FINAL</span>
        <h1 id="bob-result-title">{resultHeadline({ won, walkover, opponent: opponentName })}</h1>
        <div className="bob-result-score">
          <div><TeamCrest team={myTeam} size={56} /><strong>{myTeam.shortName}</strong><small>Você</small></div>
          <b aria-label={`Placar ${scoreLine(mine, theirs, pens)}`}>
            {mine}<i>×</i>{theirs}
          </b>
          <div><TeamCrest team={theirTeam} size={56} /><strong>{theirTeam.shortName}</strong><small>{opponentNick}</small></div>
        </div>
        {pens && <p className="bob-result-pens">Pênaltis · {pens.mine} × {pens.theirs}</p>}
        <p className="bob-result-story">{describeOnlineResult(canonical, setup, walkover)}</p>
      </header>

      {local && <BotaoMatchStats result={mySide === "cpu" ? mirrorResult(local) : local} />}

      {local && (
        <section className="bob-goals" aria-label="Gols da partida">
          {goals.length ? goals.map(({ entry, index }) => {
            const replayIndex = local.replays?.findIndex((item) => item.timelineIndex === index) ?? -1;
            const team = entry.side === "user" ? setup.userTeam : setup.cpuTeam;
            return (
              <div key={index} className={entry.side === mySide ? "is-mine" : undefined}>
                <span><b>{team.shortName}</b><small>{entry.text} · {formatGoalMinute(entry, setup.rules)}</small></span>
                {replayIndex >= 0 && (
                  <button type="button" className="bob-ghost-button" onClick={() => setReplay(replay === replayIndex ? null : replayIndex)}>
                    {replay === replayIndex ? "Fechar" : "Ver replay"}
                  </button>
                )}
              </div>
            );
          }) : <p>Nenhum gol antes dos pênaltis.</p>}
          {/* Espelhado: o convidado vê o próprio time subindo, como na partida. */}
          {activeReplay && <GoalReplay replay={activeReplay} setup={setup} label="Replay do gol" mirrored={mySide === "cpu"} />}
        </section>
      )}

      {tournament ? (
        <div className="bob-result-actions">
          <button type="button" className="primary-button" data-testid="bob-see-bracket" onClick={onSeeBracket}>
            {tournamentOver ? "Ver o campeão" : "Ver chave"} <span>→</span>
          </button>
        </div>
      ) : (
        <div className="bob-result-actions">
          {series && <p className="bob-series">Série: Você {seriesMine} × {seriesTheirs} {opponentNick}</p>}
          {backInLobby ? (
            <p className="bob-info" role="status">{opponentNick} voltou para a sala.</p>
          ) : rematch?.theirs && !rematch.mine ? (
            <div className="bob-rematch-ask" role="status">
              <p>{opponentNick} quer revanche!</p>
              <div>
                <button type="button" className="primary-button" data-testid="bob-rematch-accept" onClick={() => askRematch(true)}>Aceitar revanche</button>
                <button type="button" className="secondary-button" onClick={() => askRematch(false)}>Agora não</button>
              </div>
            </div>
          ) : rematch?.mine ? (
            <div className="bob-rematch-ask" role="status">
              <p>Esperando {opponentNick} aceitar…</p>
              <div><button type="button" className="secondary-button" onClick={() => askRematch(false)}>Cancelar</button></div>
            </div>
          ) : (
            <>
              {declined && <p className="bob-info" role="status">{opponentNick} não quis revanche agora.</p>}
              <button type="button" className="primary-button" data-testid="bob-rematch" onClick={() => askRematch(true)}>Revanche</button>
            </>
          )}
          <button
            type="button"
            className="secondary-button"
            data-testid="bob-back-lobby"
            onClick={() => {
              if (!backInLobby) roomClient()?.backToLobby();
              onBackToLobby();
            }}
          >
            Voltar à sala
          </button>
        </div>
      )}
    </section>
  );
}

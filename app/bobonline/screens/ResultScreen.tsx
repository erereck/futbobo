"use client";

// Apito final (§1.8), do ponto de vista de quem olha: o placar com o meu time à
// esquerda, a história neutra (do resultado canônico), os números da mesa, os gols
// com replay e as saídas (revanche e série no X1; a chave no torneio).

import { useEffect, useState, type CSSProperties } from "react";
import GoalReplay from "../../botao/GoalReplay";
import TeamCrest from "../../botao/TeamCrest";
import { mirrorResult } from "../../botao/match-codec";
import type { BotaoMatchResult } from "../../botao/types";
import type { DuelHandle, RoomClientState } from "../room/room-api";
import { describeOnlineResult, formatGoalMinute, isMatchGoal, resultFromBracket, resultHeadline, scoreLine } from "../result-copy";
import { BOB_RULE_PRESETS } from "../teams/match-setup";
import { roundName } from "../tournament/bracket";
import { FORMAT_LABEL, bracketMatchOf, nicknameOf, opponentLabel, roomClient } from "../use-room";
import { T } from "../protocol";
import "../../botao/botao.css";
import { Band, Colophon, Dock, DockSpacer, Page, Spread, paper, teamInks } from "./paper";

/** O carimbo do placar. */
const FINAL_WHISTLE = "APITO FINAL";

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

  const shown = local ? (mySide === "cpu" ? mirrorResult(local) : local) : null;
  const statRows: Array<[string, number, number]> = shown
    ? [
      ["Toques dados", shown.stats.user.flicks, shown.stats.cpu.flicks],
      ["Encostou na bola", shown.stats.user.touches, shown.stats.cpu.touches],
      ["Na trave", shown.stats.user.posts, shown.stats.cpu.posts],
    ]
    : [];
  const stage = tournament && match && snapshot?.bracket ? roundName(snapshot.bracket.size, match.round) : FORMAT_LABEL.x1;
  const rulesLabel = snapshot ? BOB_RULE_PRESETS[snapshot.settings.rules].label : null;
  const theirAsk = !tournament && !backInLobby && Boolean(rematch?.theirs && !rematch.mine);
  const dockNote = tournament ? null : backInLobby ? (
    <p className="bob-dock-note bob-info" role="status">{opponentNick} voltou para a sala.</p>
  ) : rematch?.theirs && !rematch.mine ? (
    <p className="bob-dock-note bob-rematch-ask" role="status">{opponentNick} quer revanche!</p>
  ) : rematch?.mine ? (
    <p className="bob-dock-note bob-rematch-ask" role="status">Esperando {opponentNick} aceitar…</p>
  ) : declined ? (
    <p className="bob-dock-note bob-info" role="status">{opponentNick} não quis revanche agora.</p>
  ) : null;

  return (
    <Spread className="bob-result" aria-labelledby="bob-result-title" data-testid="bob-result" style={teamInks(myTeam.primary, myTeam.secondary)}>
      <Page side="left" label="Placar final" className="bob-result-left">
        <Band ink="club" titleId="bob-result-title" title={resultHeadline({ won, walkover, opponent: opponentName })} subtitle={rulesLabel ? `${stage} · ${rulesLabel}` : stage} />

        <section className={`${paper.board} bob-result-board`} aria-label="Placar final">
          <div className={paper.versus}>
            <figure className={paper.side}>
              <span className={paper.crest}><TeamCrest team={myTeam} size={88} /></span>
              <figcaption>{myTeam.shortName}</figcaption>
              <small>Você</small>
            </figure>
            <p className={paper.score} aria-label={`Placar ${scoreLine(mine, theirs, pens)}`}>
              <b className={paper.num}>{mine}</b><span>×</span><b className={paper.num}>{theirs}</b>
            </p>
            <figure className={paper.side}>
              <span className={paper.crest}><TeamCrest team={theirTeam} size={88} /></span>
              <figcaption>{theirTeam.shortName}</figcaption>
              <small>{opponentNick}</small>
            </figure>
          </div>
          {pens && <p className="bob-result-pens">Pênaltis · <span className={paper.num}>{pens.mine} × {pens.theirs}</span></p>}
          {/* O carimbo do apito: verde na vitória. */}
          <strong className={paper.verdict} data-win={won ? "" : undefined} aria-hidden="true">{FINAL_WHISTLE}</strong>
        </section>

        <p className={`${paper.recap} bob-result-story`}>{describeOnlineResult(canonical, setup, walkover)}</p>
        {shown && (
          <section className={paper.table} aria-labelledby="bob-result-table">
            <h2 id="bob-result-table" className="bob-section-title">Números da mesa</h2>
            <div className={paper.tableHead} aria-hidden="true"><span>{myTeam.abbr}</span><span>{theirTeam.abbr}</span></div>
            <dl>
              {statRows.map(([label, a, b]) => (
                <div key={label} className={`${paper.tableRow} bob-stat-row`} style={{ "--mine": `${(a / Math.max(1, a + b)) * 100}%` } as CSSProperties}>
                  <dd className={paper.num} data-lead={a >= b ? "" : undefined}>{a}</dd>
                  <dt>{label}</dt>
                  <dd className={paper.num} data-lead={b >= a ? "" : undefined}>{b}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </Page>

      <Page side="right" label="Gols e revanche" className="bob-result-right">
        {local && (
          <section className="bob-goals" aria-labelledby="bob-result-goals">
            <h2 id="bob-result-goals" className="bob-section-title">Gols da partida</h2>
            {goals.length ? (
              <ol className={paper.goals}>
                {goals.map(({ entry, index }) => {
                  const replayIndex = local.replays?.findIndex((item) => item.timelineIndex === index) ?? -1;
                  const team = entry.side === "user" ? setup.userTeam : setup.cpuTeam;
                  return (
                    <li key={index} className={`${paper.goal} bob-goal`} data-side={entry.side === mySide ? "user" : "cpu"}>
                      <span className={`${paper.minute} ${paper.num}`}>{formatGoalMinute(entry, setup.rules)}</span>
                      <span className={paper.goalCopy}><b>{entry.text}</b><small>{team.shortName}</small></span>
                      {replayIndex >= 0 && (
                        <button type="button" className={paper.replayButton} aria-pressed={replay === replayIndex} onClick={() => setReplay(replay === replayIndex ? null : replayIndex)}>
                          {replay === replayIndex ? "Fechar" : "Ver replay"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : <p className="bob-hint">Nenhum gol antes dos pênaltis.</p>}
            {/* Espelhado: o convidado vê o próprio time subindo, como na partida. */}
            {activeReplay && (
              <div className={paper.replayFrame}>
                <GoalReplay replay={activeReplay} setup={setup} label="Replay do gol" mirrored={mySide === "cpu"} />
              </div>
            )}
          </section>
        )}

        {series && !tournament && <p className="bob-series">Série: Você <span className={paper.num}>{seriesMine} × {seriesTheirs}</span> {opponentNick}</p>}
        {/* W.O. sem números da mesa: o carimbo ocupa a página. */}
        {!shown && walkover && <p className="bob-wo-stamp" aria-hidden="true">{walkover === "double" ? "Sorteio" : "W.O."}</p>}

        {tournament ? (
          <Dock className="bob-result-actions">
            <button type="button" className="primary-button" data-testid="bob-see-bracket" onClick={onSeeBracket}>
              {tournamentOver ? "Ver o campeão" : "Ver chave"}
            </button>
          </Dock>
        ) : (
          <Dock className="bob-result-actions" double={theirAsk || dockNote !== null}>
            {/* O recado da revanche vai junto dos botões: no celular, no rodapé amarelo. */}
            {dockNote}
            {backInLobby ? null : rematch?.theirs && !rematch.mine ? (
              <>
                <button type="button" className="primary-button bob-rematch-accept" data-testid="bob-rematch-accept" onClick={() => askRematch(true)}>Aceitar revanche</button>
                <button type="button" className="secondary-button" onClick={() => askRematch(false)}>Agora não</button>
              </>
            ) : rematch?.mine ? (
              <button type="button" className="secondary-button" onClick={() => askRematch(false)}>Cancelar</button>
            ) : (
              <button type="button" className="primary-button" data-testid="bob-rematch" onClick={() => askRematch(true)}>Revanche</button>
            )}
            <button
              type="button"
              className="secondary-button"
              data-testid="bob-back-lobby"
              onClick={() => {
                // Sempre, mesmo com a sala já no lobby (o outro voltou primeiro): é aqui que o meu pronto volta
                // junto, e quem voltou para jogar de novo não precisa tocar em "Estou pronto" outra vez.
                roomClient()?.backToLobby();
                onBackToLobby();
              }}
            >
              Voltar à sala
            </button>
          </Dock>
        )}
        <Colophon />
        <DockSpacer double={theirAsk || dockNote !== null} />
      </Page>
    </Spread>
  );
}

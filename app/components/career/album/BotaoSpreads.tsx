"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { formatGoalMinute, isMatchGoal } from "../../../botao/adapter";
import GoalReplay from "../../../botao/GoalReplay";
import { describeMatchTurningPoint } from "../../../botao/result-story";
import TeamCrest from "../../../botao/TeamCrest";
import type { BotaoMatchResult, BotaoMatchSetup, BotaoTeam } from "../../../botao/types";
import type { PendingBotaoMatch } from "../../../career/model";
import type { Club } from "../../../game-data";
import type { PlayerAppearance } from "../../../player-appearance";
import { AlbumPage } from "./AlbumShell";
import { BlockTitle, Ficha, InkBand, PlayerSticker, Stamp } from "./primitives";
import styles from "./botaoSpreads.module.css";

type Player = { name: string; number: number; overall: number; positionName: string; appearance: PlayerAppearance | null };

function Side({ team, align }: { team: BotaoTeam; align: "start" | "end" }) {
  return (
    <figure className={styles.side} data-align={align}>
      <span className={styles.crest}><TeamCrest team={team} size={88} /></span>
      <figcaption>{team.shortName}</figcaption>
    </figure>
  );
}

/**
 * Antes da decisão no futebol de botão: o ingresso da partida na página da esquerda,
 * a sua figurinha (titular ou no banco) na da direita.
 */
export function BotaoLobbySpread({
  match,
  setup,
  player,
  club,
  simulating,
  onPlay,
  onSimulate,
}: {
  match: PendingBotaoMatch;
  setup: BotaoMatchSetup;
  player: Player;
  club: Club;
  simulating: boolean;
  onPlay: () => void;
  onSimulate: () => void;
}) {
  const entry = setup.entry;
  const national = match.source === "national";
  return (
    <>
      <AlbumPage side="left" label="A partida decisiva" className={styles.page}>
        <InkBand ink="club" title={match.stageName} subtitle={`${match.competitionName} · Agora a taça depende da mesa.`} />
        <section className={styles.ticket} aria-label={`${setup.userTeam.shortName} contra ${setup.cpuTeam.shortName}`}>
          <div className={styles.ticketPaper}>
          <div className={styles.ticketMain}>
            <p className={styles.ticketKicker}>{national ? "Seleção em campo" : "Partida decisiva"}</p>
            <div className={styles.versus}>
              <Side team={setup.userTeam} align="start" />
              <span className={styles.vs} aria-hidden="true">×</span>
              <Side team={setup.cpuTeam} align="end" />
            </div>
            <p className={styles.ticketFoot}>Futebol de botão · {match.competitionName}</p>
          </div>
          <div className={styles.stub} aria-hidden="true">
            <b>Decisão</b>
            <span className={styles.num}>{match.season}</span>
          </div>
          </div>
        </section>
        <div className={styles.dock}>
          <Stamp variant="primary" onClick={onPlay}>Jogar no futebol de botão</Stamp>
          <Stamp onClick={onSimulate} disabled={simulating}>{simulating ? "Simulando…" : "Simular esta partida"}</Stamp>
        </div>
      </AlbumPage>

      <AlbumPage side="right" label="Seu botão" className={`${styles.page} ${styles.centered}`}>
        <BlockTitle as="h3">{entry ? "Você começa no banco" : "Seu botão"}</BlockTitle>
        <div className={styles.playerRow}>
          <PlayerSticker
            name={player.name}
            number={player.number}
            overall={player.overall}
            subtitle={player.positionName}
            club={club}
            appearance={player.appearance}
            tilt="-3deg"
          />
          <Ficha
            rows={[
              { label: "Camisa", value: `#${player.number}` },
              { label: "Posição", value: player.positionName },
              { label: "Overall", value: `${player.overall} OVR` },
              { label: national ? "Seleção" : "Time", value: setup.userTeam.shortName },
            ]}
          />
        </div>
        {entry && (
          <section className={styles.bench} aria-labelledby="botao-bench-title">
            <span className={styles.benchStamp} id="botao-bench-title">Entra aos 45&apos;</span>
            <p>
              Seu OVR ainda está abaixo do nível de titularidade desta seleção. Você assume o botão
              na metade final da partida{entry.score.user + entry.score.cpu > 0
                ? ` com o placar em ${entry.score.user} × ${entry.score.cpu}.`
                : " com o jogo ainda empatado."}
            </p>
          </section>
        )}
        <div className={styles.dockSpacer} aria-hidden="true" data-double="" />
      </AlbumPage>
    </>
  );
}

function headlineFor(match: PendingBotaoMatch, result: BotaoMatchResult) {
  if (result.walkover) return "Derrota por W.O.";
  const final = match.stageName === "Final";
  if (result.champion) return final ? "Campeão" : "Classificado";
  return final ? "Vice" : "Eliminado";
}

/** Depois da decisão: placar e carimbo do resultado à esquerda, gols, replays e números da mesa à direita. */
export function BotaoResultSpread({
  match,
  result,
  setup,
  continueLabel,
  onContinue,
  activeReplay,
  onToggleReplay,
}: {
  match: PendingBotaoMatch;
  result: BotaoMatchResult;
  setup: BotaoMatchSetup;
  continueLabel: string;
  onContinue: () => void;
  activeReplay: number | null;
  onToggleReplay: (index: number | null) => void;
}) {
  const goals = result.timeline
    .map((entry, timelineIndex) => ({ entry, timelineIndex }))
    .filter(({ entry }) => isMatchGoal(entry));
  const replay = activeReplay !== null ? result.replays?.[activeReplay] : undefined;
  // O replay abre embaixo da lista de gols: a página rola até ele.
  const replayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeReplay !== null) replayRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeReplay]);
  const statRows: Array<[string, number, number]> = [
    ["Toques dados", result.stats.user.flicks, result.stats.cpu.flicks],
    ["Encostou na bola", result.stats.user.touches, result.stats.cpu.touches],
    ["Na trave", result.stats.user.posts, result.stats.cpu.posts],
  ];
  const fichaRows = [
    { label: "Seus gols", value: result.playerGoals },
    { label: "Suas assistências", value: result.playerAssists },
    ...(result.decision === "penalties" ? [{ label: "Pênaltis", value: `${result.penaltyFor} × ${result.penaltyAgainst}` }] : []),
    ...(!result.walkover ? [{ label: "Toques na partida", value: result.turns }] : []),
  ];
  const suffix = result.walkover ? " · W.O. por abandono" : result.simulated ? " · simulada" : "";

  return (
    <>
      <AlbumPage side="left" label="Placar final" className={styles.page}>
        <InkBand ink="club" title={match.stageName} subtitle={`${match.competitionName}${suffix}`} />
        <section className={styles.board} aria-label="Placar final">
          <div className={styles.versus}>
            <Side team={setup.userTeam} align="start" />
            <p className={styles.score} aria-label={`${result.goalsFor} a ${result.goalsAgainst}`}>
              <b className={styles.num}>{result.goalsFor}</b><span>×</span><b className={styles.num}>{result.goalsAgainst}</b>
            </p>
            <Side team={setup.cpuTeam} align="end" />
          </div>
          <strong className={styles.verdict} data-win={result.champion && !result.walkover ? "" : undefined}>{headlineFor(match, result)}</strong>
        </section>
        {result.walkover && (
          <section className={styles.walkover} aria-labelledby="botao-walkover-title">
            <h3 id="botao-walkover-title">A partida foi abandonada</h3>
            <p>Atualizar ou fechar a página depois de entrar em campo confirma derrota administrativa por 3 × 0.</p>
          </section>
        )}
        {!result.walkover && <p className={styles.recap}>{describeMatchTurningPoint(result, setup)}</p>}
        <div className={styles.youRow}>
          <Ficha rows={fichaRows} />
          {result.manOfTheMatch && <span className={styles.motm}>Melhor em campo</span>}
        </div>
        {!result.walkover && (
          <section className={styles.table} aria-labelledby="botao-table-title">
            <BlockTitle as="h3" id="botao-table-title">Números da mesa</BlockTitle>
            <div className={styles.tableHead} aria-hidden="true"><span>{setup.userTeam.abbr}</span><span>{setup.cpuTeam.abbr}</span></div>
            <dl>
              {statRows.map(([label, mine, theirs]) => (
                <div key={label} className={styles.tableRow} style={{ "--mine": `${(mine / Math.max(1, mine + theirs)) * 100}%` } as CSSProperties}>
                  <dd className={styles.num} data-lead={mine >= theirs ? "" : undefined}>{mine}</dd>
                  <dt>{label}</dt>
                  <dd className={styles.num} data-lead={theirs >= mine ? "" : undefined}>{theirs}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <div className={styles.dock}>
          <Stamp variant="primary" onClick={onContinue}>{continueLabel}</Stamp>
        </div>
      </AlbumPage>

      <AlbumPage side="right" label="Gols da partida" className={styles.page}>
        <BlockTitle as="h3">Gols da partida</BlockTitle>
        {goals.length ? (
          <ol className={styles.goals}>
            {goals.map(({ entry, timelineIndex }) => {
              const replayIndex = result.replays?.findIndex((item) => item.timelineIndex === timelineIndex) ?? -1;
              return (
                <li key={`${entry.clock}-${timelineIndex}`} className={styles.goal} data-side={entry.side} data-you={entry.byUser ? "" : undefined} data-before={entry.beforePlayerEntry ? "" : undefined}>
                  <span className={`${styles.minute} ${styles.num}`}>{formatGoalMinute(entry, setup.rules)}</span>
                  <span className={styles.goalCopy}>
                    <b>{entry.text}</b>
                    <small>{entry.side === "user" ? setup.userTeam.shortName : setup.cpuTeam.shortName}{entry.beforePlayerEntry ? " · antes da sua entrada" : ""}</small>
                  </span>
                  {replayIndex >= 0 && (
                    <button type="button" className={styles.replayButton} aria-pressed={activeReplay === replayIndex} onClick={() => onToggleReplay(activeReplay === replayIndex ? null : replayIndex)}>
                      {activeReplay === replayIndex ? "Fechar replay" : "Ver replay"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={styles.empty}>
            {result.walkover ? "Partida encerrada por abandono. Placar administrativo de 3 × 0." : result.decision === "penalties" ? "A decisão foi para os pênaltis depois de um jogo sem gols." : "A partida terminou sem gols."}
          </p>
        )}
        {replay && (
          <div ref={replayRef} className={styles.replayFrame}>
            <GoalReplay replay={replay} setup={setup} label={result.timeline[replay.timelineIndex]?.text ?? "Gol da partida"} />
          </div>
        )}
        <div className={styles.dockSpacer} aria-hidden="true" />
      </AlbumPage>
    </>
  );
}

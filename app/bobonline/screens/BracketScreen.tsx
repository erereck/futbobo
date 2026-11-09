"use client";

// Chave do torneio (§1.6): colunas por fase (só a chave rola de lado, nunca a
// página), a minha próxima partida, quem está ao vivo e como eu caí.
// Toda contagem vem de useNow e da hora do anfitrião convertida (toLocal).

import type { ReactNode } from "react";
import BobCrest from "../teams/BobCrest";
import { BOB_RULE_PRESETS } from "../teams/match-setup";
import { eliminatedIn, feedersOf, championOf, nextMatchFor, roundName, roundPhrase, winnerOf } from "../tournament/bracket";
import type { RoomClientState } from "../room/room-api";
import type { Bracket, BracketMatch, BracketSide } from "../types";
import { useNow } from "../use-now";
import {
  CPU_LEVEL_LABEL,
  FORMAT_LABEL,
  clockLabel,
  isCpuEntrant,
  nicknameOf,
  roomClient,
  teamOf,
} from "../use-room";
import { Band, Colophon, Page, Spread, paper, teamInks } from "./paper";

type Chip = { text: string; tone: "wait" | "ready" | "live" | "done" | "wo" };

function toLocal(hostTime: number): number {
  return roomClient()?.toLocal(hostTime) ?? hostTime;
}

function secondsUntil(localTime: number, now: number): number {
  return Math.max(0, Math.ceil((localTime - now) / 1000));
}

function periodLabel(period: number, halves: number): string {
  return period > halves ? "Prorrogação" : `${period}º tempo`;
}

/** Selo de estado de um jogo da chave. */
export function matchChip(state: RoomClientState, match: BracketMatch, now: number): Chip {
  if (match.kind === "bye") return { text: "FOLGA", tone: "done" };
  if (match.status === "done") {
    const walkover = match.result?.walkover;
    if (walkover === "double") return { text: "SORTEIO", tone: "wo" };
    if (walkover === "bye") return { text: "FOLGA", tone: "done" };
    if (walkover) return { text: "W.O.", tone: "wo" };
    return { text: "FIM", tone: "done" };
  }
  if (match.status === "ready-check") {
    const deadline = match.readyDeadline === null ? null : toLocal(match.readyDeadline);
    return { text: deadline === null || now === 0 ? "PRONTOS?" : `PRONTOS? ${secondsUntil(deadline, now)}s`, tone: "ready" };
  }
  if (match.status === "playing") {
    const live = state.live[match.id];
    // Sem placar (quadro incompleto) fica só o selo: a sala já refaz cada 'live', isto é a segunda linha.
    if (!live?.score) return { text: "AO VIVO", tone: "live" };
    if (live.pens || live.phase === "penalties") {
      const pens = live.pens ?? { home: 0, away: 0 };
      return { text: `AO VIVO · pênaltis ${pens.home}×${pens.away}`, tone: "live" };
    }
    const halves = state.snapshot ? BOB_RULE_PRESETS[state.snapshot.settings.rules].rules.halves : 2;
    return { text: `AO VIVO · ${live.score.home}×${live.score.away} · ${clockLabel(live.clock)} · ${periodLabel(live.period, halves)}`, tone: "live" };
  }
  return { text: "AGUARDANDO", tone: "wait" };
}

function sideScore(state: RoomClientState, match: BracketMatch, side: "home" | "away"): string {
  if (match.kind === "bye") return "";
  if (match.status === "done" && match.result) {
    const goals = side === "home" ? match.result.homeGoals : match.result.awayGoals;
    const pens = side === "home" ? match.result.homePens : match.result.awayPens;
    return pens === null ? String(goals) : `${goals} (${pens})`;
  }
  const live = match.status === "playing" ? state.live[match.id] : undefined;
  return live?.score ? String(side === "home" ? live.score.home : live.score.away) : "";
}

/** Nome curto do time de um lado, ou o que ainda falta decidir. */
function sideName(state: RoomClientState, side: BracketSide): string {
  if (!side) return "A definir";
  return teamOf(state, side.entrantId)?.shortName ?? nicknameOf(state, side.entrantId);
}

function SideRow({ state, match, side }: { state: RoomClientState; match: BracketMatch; side: "home" | "away" }) {
  const entry = match[side];
  const winner = match.status === "done" && match.result?.winner === side;
  if (!entry) {
    return (
      <div className="bob-bracket-row is-empty">
        <span className="bob-crest-blank" aria-hidden="true" />
        <span>{match.kind === "bye" ? "Folga" : "A definir"}</span>
        <b />
      </div>
    );
  }
  const team = teamOf(state, entry.entrantId);
  const cpu = isCpuEntrant(entry.entrantId);
  return (
    <div className={`bob-bracket-row${winner ? " is-winner" : ""}${entry.entrantId === state.me ? " is-me" : ""}`}>
      {/* O selo CPU vai ao lado do nome: no escudo de 26 px ele cobriria o desenho inteiro. */}
      {team ? <BobCrest team={team} size={26} /> : <span className="bob-crest-blank" aria-hidden="true" />}
      <span>{team?.shortName ?? nicknameOf(state, entry.entrantId)}{cpu && <em className="bob-cpu-tag">CPU</em>}</span>
      <b>{sideScore(state, match, side)}</b>
    </div>
  );
}

function MatchCard({ state, match, now }: { state: RoomClientState; match: BracketMatch; now: number }) {
  const chip = matchChip(state, match, now);
  return (
    <article className="bob-bracket-card" data-testid="bob-bracket-card" data-status={match.status}>
      <SideRow state={state} match={match} side="home" />
      <SideRow state={state} match={match} side="away" />
      <span className="bob-chip" data-tone={chip.tone}>{chip.text}</span>
    </article>
  );
}

/** "Esperando o vencedor de A × B" para o lado que ainda não chegou. */
function waitingFor(state: RoomClientState, bracket: Bracket, match: BracketMatch, me: string): string {
  const feeder = feedersOf(bracket, match).find((item) => item && item.home?.entrantId !== me && item.away?.entrantId !== me);
  if (!feeder) return "Esperando o adversário";
  return `Esperando o vencedor de ${sideName(state, feeder.home)} × ${sideName(state, feeder.away)}`;
}


/** A minha próxima partida como ingresso: os dois escudos, o "pronto?" e a fase no canhoto. */
function NextMatchCard({ state, bracket, match, now }: { state: RoomClientState; bracket: Bracket; match: BracketMatch; now: number }) {
  const me = state.me;
  const mySide = match.home?.entrantId === me ? "home" : "away";
  const opponent = mySide === "home" ? match.away : match.home;
  const round = roundName(bracket.size, match.round);
  const myTeam = teamOf(state, me);
  const local = state.nextMatch?.bracketId === match.id ? state.nextMatch : null;
  const deadline = local?.readyDeadlineLocal ?? (match.readyDeadline === null ? null : toLocal(match.readyDeadline));
  const hold = local?.holdUntilLocal ?? (match.holdUntil === null ? null : toLocal(match.holdUntil));
  const pressed = match.readyBy.includes(me);
  const theirTeam = opponent ? teamOf(state, opponent.entrantId) : null;
  let body: ReactNode;

  if (!opponent) {
    body = <p>{waitingFor(state, bracket, match, me)}</p>;
  } else {
    const cpu = isCpuEntrant(opponent.entrantId);
    const name = nicknameOf(state, opponent.entrantId);
    const level = state.snapshot ? CPU_LEVEL_LABEL[state.snapshot.settings.cpuLevel] : "";
    body = (
      <>
        <p className="bob-next-vs">
          <span>{myTeam ? <BobCrest team={myTeam} size={34} /> : <span className="bob-crest-blank" aria-hidden="true" />}{myTeam?.shortName ?? "Seu time"}</span>
          <i aria-hidden="true">×</i>
          <span>{theirTeam ? <BobCrest team={theirTeam} size={34} cpu={cpu} /> : <span className="bob-crest-blank" aria-hidden="true" />}{sideName(state, opponent)}</span>
        </p>
        {cpu && <p>Contra a CPU ({level}) · joga no seu aparelho</p>}
        {match.status === "ready-check" && (
          <div className="bob-next-ready">
            <strong>{deadline === null || now === 0 ? "Começa em instantes" : `Começa em ${secondsUntil(deadline, now)}s`}</strong>
            {pressed ? (
              <span>{cpu ? "Pronto!" : `Esperando ${name}…`}</span>
            ) : (
              <button type="button" className="primary-button" data-testid="bob-next-ready" onClick={() => roomClient()?.readyForMatch(match.id)}>Estou pronto</button>
            )}
          </div>
        )}
        {match.status === "waiting" && !cpu && hold !== null && now > 0 && hold > now && (
          <p>Começa quando {name} sair da tela de resultado (até {secondsUntil(hold, now)}s).</p>
        )}
        {match.status === "playing" && <p>Sua partida está começando…</p>}
      </>
    );
  }

  return (
    <section className={`${paper.ticket} bob-next-card`} aria-label="Sua próxima partida" data-testid="bob-next-card" data-status={match.status}>
      <div className={paper.ticketPaper} style={myTeam ? teamInks(myTeam.primary, myTeam.secondary) : undefined}>
        <div className={paper.ticketMain}>
          <p className={paper.ticketKicker}>Sua próxima partida</p>
          {body}
        </div>
        <div className={paper.stub} aria-hidden="true"><b>{round}</b></div>
      </div>
    </section>
  );
}

export default function BracketScreen({
  state,
  onLeave,
}: {
  state: RoomClientState;
  /** "Sair da sala" (a página confirma com o texto certo). */
  onLeave: () => void;
}) {
  const now = useNow(250);
  const snapshot = state.snapshot;
  const bracket = snapshot?.bracket;
  if (!snapshot || !bracket) return null;
  const me = state.me;
  const entrant = bracket.entrants.some((item) => item.id === me);
  const next = entrant ? nextMatchFor(bracket, me) : null;
  const fell = entrant ? eliminatedIn(bracket, me) : null;
  const champion = championOf(bracket);
  const live = bracket.matches.filter((match) => match.status === "playing" && match.home?.entrantId !== me && match.away?.entrantId !== me);
  const rounds = Array.from({ length: bracket.rounds }, (_, index) => index + 1);
  const championTeam = champion ? teamOf(state, champion) : null;
  const preset = BOB_RULE_PRESETS[snapshot.settings.rules];

  return (
    <Spread className="bob-bracket" aria-labelledby="bob-bracket-title" data-rounds={bracket.rounds}>
      <Page side="left" label="Sua campanha" className="bob-bracket-left">
        {/* A chave pode sair menor que o formato (sem CPU e com poucas pessoas): o título segue a chave. */}
        <Band
          ink="green"
          titleId="bob-bracket-title"
          title={snapshot.settings.format === "x1" ? FORMAT_LABEL.x1 : `Torneio de ${bracket.size}`}
          subtitle={`${preset.label} · ${preset.detail}`}
        />

        {next && <NextMatchCard state={state} bracket={bracket} match={next} now={now} />}
        {fell && (
          <p className="bob-info" role="status">
            {fell.round === bracket.rounds
              ? `Vice-campeão! ${championTeam?.shortName ?? (winnerOf(fell) ? sideName(state, { entrantId: winnerOf(fell) as string }) : "O adversário")} levou a final.`
              : `Você caiu ${roundPhrase(bracket.size, fell.round)}. Dá para assistir as outras partidas.`}
          </p>
        )}

        {live.length > 0 && (
          <section className="bob-live" aria-labelledby="bob-live-title">
            <h2 id="bob-live-title" className="bob-section-title">Ao vivo agora</h2>
            {live.map((match) => {
              const chip = matchChip(state, match, now);
              const canWatch = match.kind === "duel" || match.kind === "cpu-human";
              return (
                <article key={match.id} className="bob-live-card">
                  <div>
                    <strong>{sideName(state, match.home)} × {sideName(state, match.away)}</strong>
                    <small>{roundName(bracket.size, match.round)} · {chip.text}</small>
                  </div>
                  {canWatch && (
                    <button type="button" className="secondary-button" data-testid="bob-watch" onClick={() => roomClient()?.spectate(match.id)}>Assistir</button>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </Page>

      <Page side="right" label="Chave do torneio" className="bob-bracket-right">
        <h2 className={`${paper.pageTitle} bob-bracket-title`}>Chave</h2>
        <div className="bob-bracket-scroll" role="region" aria-label="Chave do torneio" tabIndex={0}>
          {rounds.map((round) => (
            <div className="bob-bracket-col" key={round}>
              <h2>{roundName(bracket.size, round)}</h2>
              <div className="bob-bracket-col-list">
                {bracket.matches
                  .filter((match) => match.round === round)
                  .sort((a, b) => a.index - b.index)
                  .map((match) => <MatchCard key={match.id} state={state} match={match} now={now} />)}
              </div>
            </div>
          ))}
        </div>

        <Colophon>
          <div className="bob-footer-actions">
            <button type="button" className="secondary-button" data-testid="bob-leave" onClick={onLeave}>Sair da sala</button>
          </div>
        </Colophon>
      </Page>
    </Spread>
  );
}

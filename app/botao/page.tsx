"use client";

// Rota /botao — o modo rodando sozinho, sem carreira.
//
// Serve para dois propósitos: dá para jogar e testar o balanceamento sem
// avançar 15 temporadas, e é a prova de que o módulo não depende do resto do
// jogo. Quando o modo entrar na final da carreira, esta tela continua valendo
// como laboratório.

import { useMemo, useState } from "react";
import Link from "next/link";
import { CLUBS, POSITIONS, type Club, type PositionKey } from "../game-data";
import BotaoMatch from "./BotaoMatch";
import GoalReplay from "./GoalReplay";
import TeamCrest from "./TeamCrest";
import "./botao.css";
import { buildFinalSetup, clubSubtitle, formatGoalMinute, isMatchGoal, pickFinalOpponent } from "./adapter";
import { simulateBotaoMatch } from "./simulate";
import { DEFAULT_BOTAO_RULES, type BotaoMatchResult, type BotaoMatchSetup } from "./types";

type Screen = "lobby" | "match" | "result";

const COMPETITIONS = [
  { id: "libertadores", name: "Libertadores", scope: "continental" as const },
  { id: "championsLeague", name: "Champions League", scope: "continental" as const },
  { id: "domesticCup", name: "Copa nacional", scope: "domestic" as const },
  { id: "mundial", name: "Mundial de Clubes", scope: "world" as const },
];

const RULE_PRESETS = [
  { id: "final", label: "Final", hint: "3 gols · 2min", rules: DEFAULT_BOTAO_RULES },
  {
    id: "rapida",
    label: "Relâmpago",
    hint: "2 gols · 75s",
    rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 2, halfSeconds: 75, extraHalves: 0 },
  },
  {
    id: "cheia",
    label: "Cheia",
    hint: "sem limite · 3min",
    rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 0, halfSeconds: 180 },
  },
];

export default function BotaoStandalonePage() {
  const clubs = useMemo(() => CLUBS.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), []);
  const defaultClub = useMemo(() => clubs.find((club) => club.id === "palmeiras") ?? clubs[0], [clubs]);

  const [screen, setScreen] = useState<Screen>("lobby");
  const [name, setName] = useState("Você");
  const [number, setNumber] = useState(10);
  const [position, setPosition] = useState<PositionKey>("CA");
  const [overall, setOverall] = useState(80);
  const [clubId, setClubId] = useState(defaultClub.id);
  const [competitionIndex, setCompetitionIndex] = useState(0);
  const [presetIndex, setPresetIndex] = useState(0);
  const [seed, setSeed] = useState(20260725);
  const [setup, setSetup] = useState<BotaoMatchSetup | null>(null);
  const [result, setResult] = useState<BotaoMatchResult | null>(null);
  const [opponentId, setOpponentId] = useState<string>("");
  const [simulating, setSimulating] = useState(false);
  const [penaltiesOnly, setPenaltiesOnly] = useState(false);
  const [activeReplay, setActiveReplay] = useState<number | null>(null);

  const club = clubs.find((candidate) => candidate.id === clubId) ?? defaultClub;
  const competition = COMPETITIONS[competitionIndex];
  const preset = RULE_PRESETS[presetIndex];
  const opponent: Club =
    clubs.find((candidate) => candidate.id === opponentId) ??
    pickFinalOpponent({ clubId: club.id, scope: competition.scope, seed, season: 1, competitionId: competition.id });

  const makeSetup = (): BotaoMatchSetup =>
    buildFinalSetup({
      seed,
      season: 1,
      competitionId: competition.id,
      competitionName: competition.name,
      club,
      opponent,
      playerName: name,
      playerNumber: number,
      position,
      overall,
      rules: preset.rules,
    });

  const play = (penaltiesOnly = false) => {
    setSetup(makeSetup());
    setResult(null);
    setActiveReplay(null);
    setPenaltiesOnly(penaltiesOnly);
    setScreen("match");
  };

  // Simular uma final inteira leva algumas centenas de ms de física. Sai do
  // clique antes de rodar para a tela conseguir pintar o "Simulando…".
  const simulate = () => {
    const nextSetup = makeSetup();
    setSetup(nextSetup);
    setActiveReplay(null);
    setSimulating(true);
    window.setTimeout(() => {
      setResult(simulateBotaoMatch(nextSetup));
      setSimulating(false);
      setScreen("result");
    }, 30);
  };

  if (screen === "match" && setup) {
    return (
      <BotaoMatch
        key={`${setup.matchId}-${seed}-${penaltiesOnly ? "pen" : "full"}`}
        setup={setup}
        startInPenalties={penaltiesOnly}
        onFinish={(matchResult) => {
          setResult(matchResult);
          setScreen("result");
        }}
      />
    );
  }

  if (screen === "result" && result && setup) {
    const won = result.outcome === "win";
    const matchGoals = result.timeline.map((entry, timelineIndex) => ({ entry, timelineIndex })).filter(({ entry }) => isMatchGoal(entry));
    return (
      <main className="botao-lobby">
        <p className="botao-lobby-lead">
          {setup.competitionName} · {setup.stageName}
          {result.simulated ? " · simulada" : ""}
        </p>
        <div className={`botao-headline ${won ? "botao-headline-win" : "botao-headline-loss"}`}>
          {won ? "CAMPEÃO" : result.outcome === "draw" ? "EMPATE" : "VICE"}
        </div>
        <div className="botao-card">
          <div className="botao-scoreboard">
            <div className="botao-team">
              <TeamCrest team={setup.userTeam} />
              <strong>{setup.userTeam.shortName}</strong>
            </div>
            <div className="botao-score">
              <b>{result.goalsFor}</b>
              <span>×</span>
              <b>{result.goalsAgainst}</b>
            </div>
            <div className="botao-team botao-team-cpu">
              <strong>{setup.cpuTeam.shortName}</strong>
              <TeamCrest team={setup.cpuTeam} />
            </div>
          </div>
          <div className="botao-formation-row">
            <span className="botao-chip">
              {result.decision === "penalties"
                ? `Pênaltis ${result.penaltyFor} x ${result.penaltyAgainst}`
                : result.decision === "goal-limit"
                  ? "Decidido no 3º gol"
                  : result.decision === "extra-time"
                    ? "Prorrogação"
                    : "Tempo normal"}
            </span>
            <span className="botao-chip botao-chip-you">
              Você: {result.playerGoals}G {result.playerAssists}A
            </span>
            {result.manOfTheMatch ? <span className="botao-chip botao-chip-stat">Melhor em campo</span> : null}
            <span className="botao-chip">{result.turns} toques</span>
          </div>
        </div>
        <div className="botao-card">
          <span className="botao-card-title">Números da mesa</span>
          {(
            [
              ["Toques dados", result.stats.user.flicks, result.stats.cpu.flicks],
              ["Encostou na bola", result.stats.user.touches, result.stats.cpu.touches],
              ["Na trave", result.stats.user.posts, result.stats.cpu.posts],
            ] as Array<[string, number, number]>
          ).map(([label, mine, theirs]) => (
            <div key={label} className="botao-stat-row">
              <b className={mine >= theirs ? "botao-stat-lead" : ""}>{mine}</b>
              <span>{label}</span>
              <b className={theirs >= mine ? "botao-stat-lead" : ""}>{theirs}</b>
            </div>
          ))}
        </div>
        <div className="botao-card">
          <span className="botao-card-title">Gols da partida</span>
          {matchGoals.length > 0 ? (
            <div className="botao-result-lines">
              {matchGoals.map(({ entry, timelineIndex }) => {
                const replayIndex = result.replays?.findIndex((replay) => replay.timelineIndex === timelineIndex) ?? -1;
                return (
                  <div key={timelineIndex} className={`botao-result-line ${entry.byUser ? "botao-result-line-you" : ""}`}>
                    <span className="botao-result-goal-copy"><b>{entry.text}</b><span>{entry.side === "user" ? setup.userTeam.abbr : setup.cpuTeam.abbr} · {formatGoalMinute(entry, setup.rules)}</span></span>
                    {replayIndex >= 0 && <button type="button" onClick={() => setActiveReplay(activeReplay === replayIndex ? null : replayIndex)}>{activeReplay === replayIndex ? "Fechar replay" : "Ver replay"}</button>}
                  </div>
                );
              })}
            </div>
          ) : <p className="botao-result-empty">Nenhum gol antes da disputa por pênaltis.</p>}
          {activeReplay !== null && result.replays?.[activeReplay] && (
            <GoalReplay
              replay={result.replays[activeReplay]}
              setup={setup}
              label={result.timeline[result.replays[activeReplay].timelineIndex]?.text ?? "Gol da partida"}
            />
          )}
        </div>
        <div className="botao-actions">
          <button type="button" className="botao-primary" onClick={() => setScreen("lobby")}>
            Voltar à antessala
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="botao-lobby">
      <h1>Futebol de botão</h1>
      <p className="botao-lobby-lead">
        Cinco botões de cada lado, um toque por vez. Você é um dos botões — e a posição da sua carreira decide onde você
        começa. A cada gol os dois times trocam de formação.
      </p>

      <div className="botao-card">
        <span className="botao-card-title">Quem é você</span>
        <div className="botao-field-row">
          <label htmlFor="botao-name">Nome</label>
          <input id="botao-name" value={name} maxLength={18} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="botao-field-row">
          <label htmlFor="botao-shirt">Camisa</label>
          <input
            id="botao-shirt"
            type="number"
            min={1}
            max={99}
            value={number}
            onChange={(event) => setNumber(Math.max(1, Math.min(99, Number(event.target.value) || 1)))}
          />
        </div>
        <div className="botao-option-grid">
          {POSITIONS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="botao-option"
              aria-pressed={position === entry.key}
              onClick={() => setPosition(entry.key)}
            >
              {entry.key}
              <small>{entry.zone}</small>
            </button>
          ))}
        </div>
        <div className="botao-field-row">
          <label htmlFor="botao-overall">Overall {overall}</label>
          <input
            id="botao-overall"
            type="range"
            min={40}
            max={99}
            value={overall}
            onChange={(event) => setOverall(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="botao-card">
        <span className="botao-card-title">A decisão</span>
        <div className="botao-field-row">
          <label htmlFor="botao-club">Seu time</label>
          <select
            id="botao-club"
            value={clubId}
            onChange={(event) => {
              setClubId(event.target.value);
              setOpponentId("");
            }}
          >
            {clubs.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} ({entry.strength})
              </option>
            ))}
          </select>
        </div>
        <div className="botao-field-row">
          <label htmlFor="botao-opponent">Adversário — {clubSubtitle(opponent)}</label>
          <select id="botao-opponent" value={opponentId || opponent.id} onChange={(event) => setOpponentId(event.target.value)}>
            {clubs.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} ({entry.strength})
              </option>
            ))}
          </select>
        </div>
        <div className="botao-option-grid">
          {COMPETITIONS.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className="botao-option"
              aria-pressed={competitionIndex === index}
              onClick={() => {
                setCompetitionIndex(index);
                setOpponentId("");
              }}
            >
              {entry.name}
            </button>
          ))}
        </div>
        <div className="botao-option-grid">
          {RULE_PRESETS.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className="botao-option"
              aria-pressed={presetIndex === index}
              onClick={() => setPresetIndex(index)}
            >
              {entry.label}
              <small>{entry.hint}</small>
            </button>
          ))}
        </div>
        <div className="botao-formation-row">
          <span className="botao-chip">Dificuldade {makeSetup().difficulty}/5</span>
          <button type="button" className="botao-ghost" onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>
            Sortear seed ({seed})
          </button>
        </div>
      </div>

      <div className="botao-actions">
        <button type="button" className="botao-primary" onClick={() => play()} disabled={simulating}>
          Jogar a final
        </button>
        <button type="button" className="botao-ghost" onClick={() => play(true)} disabled={simulating}>
          Ir direto para os pênaltis
        </button>
        <button type="button" className="botao-ghost" onClick={simulate} disabled={simulating}>
          {simulating ? "Simulando…" : "Simular a final"}
        </button>
        <Link className="botao-ghost" href="/" style={{ textAlign: "center", textDecoration: "none" }}>
          Voltar para a carreira
        </Link>
      </div>
    </main>
  );
}

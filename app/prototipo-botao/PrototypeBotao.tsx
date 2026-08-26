"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CLUBS } from "../game-data";
import { buildFinalSetup, formatGoalMinute, isMatchGoal } from "../botao/adapter";
import BotaoMatch from "../botao/BotaoMatch";
import TeamCrest from "../botao/TeamCrest";
import type { BotaoMatchResult } from "../botao/types";
import { randomPlayerAppearance, visualRosterForMatch } from "../player-appearance";

type PrototypeScreen = "tunnel" | "match" | "result";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13m-5-5 5 5-5 5" />
    </svg>
  );
}

function SoundWave() {
  return (
    <span className="prototype-soundwave" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function MiniatureTable() {
  const pieces = [
    [18, 78, "home"], [41, 67, "home"], [68, 70, "home"], [30, 48, "home"], [76, 43, "home"],
    [20, 21, "away"], [47, 31, "away"], [73, 20, "away"], [35, 10, "away"], [82, 8, "away"],
  ] as const;
  return (
    <div className="prototype-miniature" aria-hidden="true">
      <div className="prototype-miniature-light" />
      <div className="prototype-miniature-pitch">
        <span className="prototype-miniature-midline" />
        <span className="prototype-miniature-circle" />
        <span className="prototype-miniature-ball" />
        {pieces.map(([left, top, side], index) => (
          <span
            key={`${side}-${index}`}
            className={`prototype-miniature-piece prototype-miniature-${side}`}
            style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${index * -190}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function PrototypeBotao() {
  const [screen, setScreen] = useState<PrototypeScreen>("tunnel");
  const [seed, setSeed] = useState(98021);
  const [result, setResult] = useState<BotaoMatchResult | null>(null);

  const club = CLUBS.find((candidate) => candidate.id === "palmeiras") ?? CLUBS[0];
  const opponent = CLUBS.find((candidate) => candidate.id === "real-madrid") ?? CLUBS[1];
  const setup = useMemo(
    () =>
      buildFinalSetup({
        seed,
        season: 2042,
        competitionId: "showcase-mundial",
        competitionName: "Mundial de Clubes",
        stageName: "Grande Final · Noite",
        club,
        opponent,
        playerName: "Aurélio Fênix",
        playerNumber: 10,
        position: "CA",
        overall: 91,
        ratings: { power: 94, control: 92 },
        rules: { goalLimit: 3, halfSeconds: 150, halves: 1, extraHalves: 1, extraSeconds: 45, penalties: true },
        visuals: visualRosterForMatch({
          enabled: true,
          seed,
          season: 2042,
          userTeamId: club.id,
          cpuTeamId: opponent.id,
          player: randomPlayerAppearance(seed),
        }),
      }),
    [club, opponent, seed],
  );

  const startMatch = () => {
    setResult(null);
    setScreen("match");
  };

  if (screen === "match") {
    return (
      <main className="prototype-shell prototype-live">
        <div className="prototype-stadium-lights" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="prototype-crowd" aria-hidden="true" />
        <div className="prototype-broadcast-rail" aria-hidden="true">
          <span>FUTBOBO LAB</span>
          <i />
          <span>MESA 01</span>
          <i />
          <span>2042</span>
        </div>
        <BotaoMatch
          key={`${setup.matchId}-${seed}`}
          setup={setup}
          presentation="showcase"
          onFinish={(matchResult) => {
            setResult(matchResult);
            setScreen("result");
          }}
        />
      </main>
    );
  }

  if (screen === "result" && result) {
    const matchGoals = result.timeline.filter(isMatchGoal);
    return (
      <main className="prototype-shell prototype-result">
        <div className="prototype-stadium-lights" aria-hidden="true"><i /><i /><i /><i /></div>
        <section className="prototype-result-card" aria-labelledby="prototype-result-title">
          <div className="prototype-result-kicker">
            <span>{result.outcome === "win" ? "A MESA É SUA" : result.outcome === "draw" ? "NADA SEPAROU OS DOIS" : "A NOITE ESCAPOU"}</span>
            <span>MUNDIAL · FINAL</span>
          </div>
          <h1 id="prototype-result-title">{result.outcome === "win" ? "Campeão sob os refletores." : result.outcome === "draw" ? "Tudo igual na mesa." : "O silêncio depois do apito."}</h1>
          <div className="prototype-result-score">
            <div>
              <TeamCrest team={setup.userTeam} size={74} />
              <strong>{setup.userTeam.shortName}</strong>
            </div>
            <p><b>{result.goalsFor}</b><span>×</span><b>{result.goalsAgainst}</b></p>
            <div>
              <TeamCrest team={setup.cpuTeam} size={74} />
              <strong>{setup.cpuTeam.shortName}</strong>
            </div>
          </div>
          <div className="prototype-result-meta">
            <span><small>TOQUES</small><b>{result.turns}</b></span>
            <span><small>NA TRAVE</small><b>{result.stats.user.posts + result.stats.cpu.posts}</b></span>
            <span><small>SEU JOGO</small><b>{result.playerGoals}G · {result.playerAssists}A</b></span>
          </div>
          {matchGoals.length > 0 ? (
            <div className="prototype-goal-film">
              <div className="prototype-goal-film-title"><SoundWave /> <span>A trilha dos gols</span></div>
              <ol>
                {matchGoals.map((goal, index) => (
                  <li key={`${goal.side}-${goal.clock}-${index}`}>
                    <span>{formatGoalMinute(goal, setup.rules)}</span>
                    <strong>{goal.text}</strong>
                    <small>{goal.side === "user" ? setup.userTeam.abbr : setup.cpuTeam.abbr}</small>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="prototype-result-actions">
            <button type="button" className="prototype-button prototype-button-primary" onClick={() => { setSeed((current) => current + 7919); startMatch(); }}>
              Pedir revanche <ArrowIcon />
            </button>
            <button type="button" className="prototype-button prototype-button-secondary" onClick={() => setScreen("tunnel")}>Voltar ao túnel</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="prototype-shell prototype-tunnel">
      <div className="prototype-stadium-lights" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="prototype-crowd" aria-hidden="true" />
      <header className="prototype-brandbar">
        <Link className="prototype-wordmark" href="/" aria-label="Voltar ao Futbobo">
          <span>F</span><strong>FUTBOBO</strong>
        </Link>
        <span className="prototype-lab-label"><i /> LAB 5×5 · CONCEITO 01</span>
      </header>

      <section className="prototype-hero" aria-labelledby="prototype-title">
        <div className="prototype-copy">
          <p className="prototype-eyebrow"><SoundWave /> Futebol de botão, em noite de final</p>
          <h1 id="prototype-title">A mesa virou<br /><em>estádio.</em></h1>
          <p className="prototype-subtitle">A física que você já conhece, tratada como espetáculo. Luz acompanha a bola. O campo sente o toque. Cada chute deixa uma memória.</p>

          <div className="prototype-fixture">
            <div className="prototype-fixture-team">
              <TeamCrest team={setup.userTeam} size={48} />
              <span><small>VOCÊ COMANDA</small><strong>{setup.userTeam.shortName}</strong></span>
            </div>
            <span className="prototype-versus">×</span>
            <div className="prototype-fixture-team prototype-fixture-away">
              <span><small>DESAFIANTE</small><strong>{setup.cpuTeam.shortName}</strong></span>
              <TeamCrest team={setup.cpuTeam} size={48} />
            </div>
          </div>

          <button type="button" className="prototype-button prototype-button-primary prototype-start" onClick={startMatch}>
            Acender os refletores <ArrowIcon />
          </button>

          <div className="prototype-signatures" aria-label="Destaques do protótipo">
            <span><b>01</b><small>Física oficial</small></span>
            <span><b>02</b><small>Luz reativa</small></span>
            <span><b>03</b><small>Movimento legível</small></span>
          </div>
        </div>

        <div className="prototype-stage">
          <p><i /> MESA PRONTA</p>
          <MiniatureTable />
          <div className="prototype-stage-caption">
            <span>Final · 2042</span>
            <span>Primeiro a 3</span>
          </div>
        </div>
      </section>

      <footer className="prototype-footer">
        <span>Uma experiência experimental Futbobo</span>
        <span>Fones recomendados · Som sintetizado em tempo real</span>
      </footer>
    </main>
  );
}

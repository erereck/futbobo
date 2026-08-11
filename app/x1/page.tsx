"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { CLUBS, type Club } from "../game-data";
import { randomPlayerAppearance, visualRosterForMatch } from "../player-appearance";
import { botaoTeamFromClub, formatGoalMinute, isMatchGoal } from "../botao/adapter";
import BotaoMatch from "../botao/BotaoMatch";
import GoalReplay from "../botao/GoalReplay";
import TeamCrest from "../botao/TeamCrest";
import { ensureContrastingKits } from "../botao/kits";
import { DEFAULT_BOTAO_RULES, type BotaoMatchResult, type BotaoMatchSetup, type BotaoRules } from "../botao/types";
import "../botao/botao.css";
import "./x1.css";

type Screen = "lobby" | "match" | "result";
type StoredSettings = {
  botaoGoalLimit?: 0 | 3 | 5;
  botaoHalfSeconds?: 90 | 120 | 180;
  botaoExtraSeconds?: 30 | 45 | 60;
  botaoPenaltyRounds?: 3 | 5;
  characterButtonsEnabled?: boolean;
};

function loadMatchSettings(rawSettings = "{}"): { rules: BotaoRules; characters: boolean } {
  try {
    const stored = JSON.parse(rawSettings) as StoredSettings;
    return {
      rules: {
        ...DEFAULT_BOTAO_RULES,
        goalLimit: stored.botaoGoalLimit ?? DEFAULT_BOTAO_RULES.goalLimit,
        halfSeconds: stored.botaoHalfSeconds ?? DEFAULT_BOTAO_RULES.halfSeconds,
        extraSeconds: stored.botaoExtraSeconds ?? DEFAULT_BOTAO_RULES.extraSeconds,
        penaltyRounds: stored.botaoPenaltyRounds ?? DEFAULT_BOTAO_RULES.penaltyRounds,
      },
      characters: stored.characterButtonsEnabled !== false,
    };
  } catch {
    return { rules: DEFAULT_BOTAO_RULES, characters: true };
  }
}

const subscribeToSettings = () => () => undefined;

function chooseDifferentClub(clubs: Club[], excludedId: string) {
  const pool = clubs.filter((club) => club.id !== excludedId);
  return pool[Math.floor(Math.random() * pool.length)] ?? clubs[0];
}

export default function LocalVersusPage() {
  const clubs = useMemo(() => CLUBS.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), []);
  const firstDefault = clubs.find((club) => club.id === "palmeiras") ?? clubs[0];
  const secondDefault = clubs.find((club) => club.id === "flamengo") ?? clubs.find((club) => club.id !== firstDefault.id) ?? clubs[0];
  const [screen, setScreen] = useState<Screen>("lobby");
  const [firstClubId, setFirstClubId] = useState(firstDefault.id);
  const [secondClubId, setSecondClubId] = useState(secondDefault.id);
  const [firstName, setFirstName] = useState("Jogador 1");
  const [secondName, setSecondName] = useState("Jogador 2");
  const [setup, setSetup] = useState<BotaoMatchSetup | null>(null);
  const [result, setResult] = useState<BotaoMatchResult | null>(null);
  const [activeReplay, setActiveReplay] = useState<number | null>(null);
  const settingsSnapshot = useSyncExternalStore(
    subscribeToSettings,
    () => window.localStorage.getItem("futbobo-settings") ?? "{}",
    () => "{}",
  );
  const matchSettings = useMemo(() => loadMatchSettings(settingsSnapshot), [settingsSnapshot]);

  const firstClub = clubs.find((club) => club.id === firstClubId) ?? firstDefault;
  const secondClub = clubs.find((club) => club.id === secondClubId) ?? secondDefault;
  const playerNames = useMemo(
    () => ({ user: firstName.trim() || "Jogador 1", cpu: secondName.trim() || "Jogador 2" }),
    [firstName, secondName],
  );

  const startMatch = () => {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const contrasted = ensureContrastingKits(botaoTeamFromClub(firstClub), botaoTeamFromClub(secondClub));
    const nextSetup: BotaoMatchSetup = {
      matchId: `local-x1-${seed}`,
      seed,
      competitionName: "Duelo local",
      stageName: "X1",
      neutralVenue: true,
      userIsHost: true,
      player: {
        name: playerNames.user,
        number: 10,
        position: "CA",
        overall: firstClub.strength,
      },
      userTeam: contrasted.user,
      cpuTeam: contrasted.cpu,
      difficulty: 3,
      rules: matchSettings.rules,
      visuals: visualRosterForMatch({
        enabled: matchSettings.characters,
        seed,
        season: 1,
        userTeamId: firstClub.id,
        cpuTeamId: secondClub.id,
        player: randomPlayerAppearance(seed),
      }),
    };
    setSetup(nextSetup);
    setResult(null);
    setActiveReplay(null);
    setScreen("match");
  };

  if (screen === "match" && setup) {
    return (
      <BotaoMatch
        key={setup.matchId}
        setup={setup}
        controlMode="local"
        localPlayerNames={playerNames}
        onFinish={(matchResult) => {
          setResult(matchResult);
          setScreen("result");
        }}
      />
    );
  }

  if (screen === "result" && result && setup) {
    const winner = result.outcome === "draw" ? null : result.outcome === "win" ? playerNames.user : playerNames.cpu;
    const matchGoals = result.timeline
      .map((entry, timelineIndex) => ({ entry, timelineIndex }))
      .filter(({ entry }) => isMatchGoal(entry));
    return (
      <main className="x1-shell x1-result-shell">
        <header className="x1-brand"><Link href="/">FUTBOBO</Link><span>X1 LOCAL</span></header>
        <section className="x1-result-hero">
          <span>APITO FINAL</span>
          <h1>{winner ? `${winner} venceu` : "Empate na mesa"}</h1>
          <div className="x1-result-score">
            <div><TeamCrest team={setup.userTeam} size={62} /><strong>{playerNames.user}</strong><small>{setup.userTeam.shortName}</small></div>
            <b>{result.goalsFor}<i>×</i>{result.goalsAgainst}</b>
            <div><TeamCrest team={setup.cpuTeam} size={62} /><strong>{playerNames.cpu}</strong><small>{setup.cpuTeam.shortName}</small></div>
          </div>
          {result.decision === "penalties" && <p>Pênaltis · {result.penaltyFor} × {result.penaltyAgainst}</p>}
        </section>
        <section className="x1-result-details">
          <header><span>RELATÓRIO DA MESA</span><strong>{result.turns} toques no total</strong></header>
          <div className="x1-stat-grid">
            {([
              ["Toques", result.stats.user.flicks, result.stats.cpu.flicks],
              ["Na bola", result.stats.user.touches, result.stats.cpu.touches],
              ["Na trave", result.stats.user.posts, result.stats.cpu.posts],
            ] as Array<[string, number, number]>).map(([label, first, second]) => (
              <article key={label}><b>{first}</b><span>{label}</span><b>{second}</b></article>
            ))}
          </div>
          <div className="x1-goal-list">
            {matchGoals.length ? matchGoals.map(({ entry, timelineIndex }) => {
              const replayIndex = result.replays?.findIndex((replay) => replay.timelineIndex === timelineIndex) ?? -1;
              return (
                <div key={timelineIndex}>
                  <span><b>{entry.side === "user" ? playerNames.user : playerNames.cpu}</b><small>{entry.text} · {formatGoalMinute(entry, setup.rules)}</small></span>
                  {replayIndex >= 0 && <button type="button" onClick={() => setActiveReplay(activeReplay === replayIndex ? null : replayIndex)}>{activeReplay === replayIndex ? "Fechar" : "Replay"}</button>}
                </div>
              );
            }) : <p>Nenhum gol antes dos pênaltis.</p>}
          </div>
          {activeReplay !== null && result.replays?.[activeReplay] && (
            <GoalReplay replay={result.replays[activeReplay]} setup={setup} label="Replay do gol" />
          )}
        </section>
        <div className="x1-result-actions"><button type="button" onClick={startMatch}>Revanche</button><button type="button" onClick={() => setScreen("lobby")}>Trocar times</button><Link href="/">Menu principal</Link></div>
      </main>
    );
  }

  return (
    <main className="x1-shell">
      <header className="x1-brand"><Link href="/">FUTBOBO</Link><span>X1 LOCAL</span></header>
      <section className="x1-intro">
        <div><span>DUELO DE SOFÁ</span><h1>Dois jogadores.<br />Um mouse.</h1><p>Cada pessoa faz um toque e passa o mouse. Sem CPU, sem carreira e sem desculpa para a derrota.</p></div>
        <aside><b>01</b><span>Jogue seu toque</span><b>02</b><span>Passe o mouse</span><b>03</b><span>Repita até o apito</span></aside>
      </section>
      <section className="x1-versus-builder">
        <article className="x1-player-card x1-player-one">
          <span>JOGADOR 1 · COMEÇA</span>
          <TeamCrest team={botaoTeamFromClub(firstClub)} size={78} />
          <label>Nome<input value={firstName} maxLength={16} onChange={(event) => setFirstName(event.target.value)} /></label>
          <label>Clube<select value={firstClubId} onChange={(event) => {
            const id = event.target.value;
            setFirstClubId(id);
            if (id === secondClubId) setSecondClubId(chooseDifferentClub(clubs, id).id);
          }}>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
          <button type="button" onClick={() => setFirstClubId(chooseDifferentClub(clubs, secondClubId).id)}>Sortear clube</button>
        </article>
        <div className="x1-versus-mark"><small>UM MOUSE</small><strong>×</strong><span>TURNOS</span></div>
        <article className="x1-player-card x1-player-two">
          <span>JOGADOR 2 · RESPONDE</span>
          <TeamCrest team={botaoTeamFromClub(secondClub)} size={78} />
          <label>Nome<input value={secondName} maxLength={16} onChange={(event) => setSecondName(event.target.value)} /></label>
          <label>Clube<select value={secondClubId} onChange={(event) => {
            const id = event.target.value;
            setSecondClubId(id);
            if (id === firstClubId) setFirstClubId(chooseDifferentClub(clubs, id).id);
          }}>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
          <button type="button" onClick={() => setSecondClubId(chooseDifferentClub(clubs, firstClubId).id)}>Sortear clube</button>
        </article>
      </section>
      <section className="x1-launch-strip">
        <div><span>REGRAS ATUAIS</span><strong>{matchSettings.rules.goalLimit ? `Primeiro a ${matchSettings.rules.goalLimit} gols` : `${matchSettings.rules.halfSeconds}s de jogo`} · pênaltis ligados</strong></div>
        <button type="button" onClick={startMatch}>Começar o X1 <span>→</span></button>
      </section>
      <Link className="x1-back" href="/">← Voltar ao menu principal</Link>
    </main>
  );
}

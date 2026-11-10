"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ChangeEvent, type CSSProperties } from "react";
import { CLUBS, leagueById, type Club } from "../game-data";
import { randomPlayerAppearance, visualRosterForMatch } from "../player-appearance";
import { botaoTeamFromClub, formatGoalMinute, isMatchGoal } from "../botao/adapter";
import BotaoMatch from "../botao/BotaoMatch";
import GoalReplay from "../botao/GoalReplay";
import TeamCrest from "../botao/TeamCrest";
import { ensureContrastingKits } from "../botao/kits";
import { DEFAULT_BOTAO_RULES, type BotaoMatchResult, type BotaoMatchSetup, type BotaoRules } from "../botao/types";
import FutboboIcon from "../components/FutboboIcon";
import { ClubBadge } from "../components/career/CareerPrimitives";
import AlbumShell, { AlbumPage } from "../components/career/album/AlbumShell";
import { darken, lighten, luminance } from "../components/career/album/inks";
import { BlockTitle, Ficha, InkBand, Stamp, albumPrimitives } from "../components/career/album/primitives";
import "../botao/botao.css";
import "./x1.css";

type Screen = "lobby" | "match" | "result";
type X1RulePresetId = "settings" | "flash" | "classic" | "marathon";
type StoredSettings = {
  botaoGoalLimit?: 0 | 3 | 5;
  botaoHalfSeconds?: 90 | 120 | 180;
  botaoExtraSeconds?: 30 | 45 | 60;
  botaoPenaltyRounds?: 3 | 5;
  characterButtonsEnabled?: boolean;
};

const X1_RULE_PRESETS: Array<{ id: X1RulePresetId; label: string; detail: string; rules: BotaoRules | null }> = [
  { id: "settings", label: "Minhas regras", detail: "Usar configuração atual", rules: null },
  { id: "flash", label: "Relâmpago", detail: "2 gols · 90 segundos", rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 2, halfSeconds: 90, extraSeconds: 30, penaltyRounds: 3 } },
  { id: "classic", label: "Clássico", detail: "3 gols · 2 minutos", rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 3, halfSeconds: 120, extraSeconds: 45, penaltyRounds: 5 } },
  { id: "marathon", label: "Maratona", detail: "5 gols · 3 minutos", rules: { ...DEFAULT_BOTAO_RULES, goalLimit: 5, halfSeconds: 180, extraSeconds: 60, penaltyRounds: 5 } },
];

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

/* ───────────── álbum: peças do X1 ───────────── */

/** Tinta do X1 no índice do álbum. */
const X1_INK = { primary: "#e0262f", secondary: "#161616" };

/** Cores da figurinha do clube: a faixa usa a cor mais escura, a listra a outra. */
function stickerInks(club: Club): CSSProperties {
  const band = luminance(club.primary) > 0.6 && luminance(club.secondary) < 0.6 ? club.secondary : club.primary;
  const stripe = band === club.primary ? club.secondary : club.primary;
  return {
    "--x1-club": band,
    "--x1-club-deep": darken(band, 0.28),
    "--x1-club-soft": lighten(band, 0.16),
    "--x1-stripe": luminance(stripe) > 0.85 && luminance(band) < 0.45 ? "#ffffff" : stripe,
  } as CSSProperties;
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** As regras escolhidas, na ficha da mesa. */
function rulesRows(rules: BotaoRules) {
  return [
    { label: "Gols para vencer", value: rules.goalLimit ? rules.goalLimit : "sem limite" },
    { label: "Tempo", value: rules.halves > 1 ? `${rules.halves} × ${clock(rules.halfSeconds)}` : clock(rules.halfSeconds) },
    { label: "Prorrogação", value: rules.extraHalves ? clock(rules.extraSeconds) : "não tem" },
    { label: "Pênaltis", value: rules.penalties ? `${rules.penaltyRounds} cobranças` : "não tem" },
  ];
}

function Dice() {
  return (
    <svg className="x1-dice-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Um lado do confronto: a figurinha do clube e os dois jeitos de trocar (lista e sorteio). */
function ClubPick({
  id,
  player,
  role,
  club,
  value,
  clubs,
  tilt,
  onChange,
  onRandom,
}: {
  id: string;
  player: string;
  role: string;
  club: Club;
  value: string;
  clubs: Club[];
  tilt: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onRandom: () => void;
}) {
  return (
    <article className="x1-player-card" aria-labelledby={`${id}-title`}>
      <h2 className="x1-player-tag" id={`${id}-title`}>
        {player} <small>{role}</small>
      </h2>
      <figure key={club.id} className="x1-club-sticker" style={{ ...stickerInks(club), "--r": tilt } as CSSProperties}>
        <span className="x1-club-band">
          <span className="x1-club-crest"><ClubBadge club={club} size="md" /></span>
        </span>
        <figcaption>
          <strong>{club.shortName}</strong>
          <small>{leagueById(club.leagueId).name}</small>
        </figcaption>
      </figure>
      <div className="x1-club-controls">
        <label className="x1-club-select">
          <span aria-hidden="true">Trocar</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
          <select aria-label={`Clube do ${player}`} value={value} onChange={onChange}>
            {clubs.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <button type="button" className="x1-dice" onClick={onRandom} aria-label="Sortear clube">
          <Dice />
          <span>Sortear</span>
        </button>
      </div>
    </article>
  );
}

export default function LocalVersusPage() {
  const clubs = useMemo(() => CLUBS.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), []);
  const firstDefault = clubs.find((club) => club.id === "palmeiras") ?? clubs[0];
  const secondDefault = clubs.find((club) => club.id === "flamengo") ?? clubs.find((club) => club.id !== firstDefault.id) ?? clubs[0];
  const [screen, setScreen] = useState<Screen>("lobby");
  const [firstClubId, setFirstClubId] = useState(firstDefault.id);
  const [secondClubId, setSecondClubId] = useState(secondDefault.id);
  const [rulePresetId, setRulePresetId] = useState<X1RulePresetId>("settings");
  const [setup, setSetup] = useState<BotaoMatchSetup | null>(null);
  const [result, setResult] = useState<BotaoMatchResult | null>(null);
  const [activeReplay, setActiveReplay] = useState<number | null>(null);
  const settingsSnapshot = useSyncExternalStore(
    subscribeToSettings,
    () => window.localStorage.getItem("futbobo-settings") ?? "{}",
    () => "{}",
  );
  const matchSettings = useMemo(() => loadMatchSettings(settingsSnapshot), [settingsSnapshot]);
  const selectedRules = useMemo(
    () => X1_RULE_PRESETS.find((preset) => preset.id === rulePresetId)?.rules ?? matchSettings.rules,
    [matchSettings.rules, rulePresetId],
  );

  const firstClub = clubs.find((club) => club.id === firstClubId) ?? firstDefault;
  const secondClub = clubs.find((club) => club.id === secondClubId) ?? secondDefault;
  const playerNames = useMemo(() => ({ user: "Jogador 1", cpu: "Jogador 2" }), []);

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
      rules: selectedRules,
      localControl: true,
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
    const statRows: Array<[string, number, number]> = [
      ["Toques", result.stats.user.flicks, result.stats.cpu.flicks],
      ["Na bola", result.stats.user.touches, result.stats.cpu.touches],
      ["Na trave", result.stats.user.posts, result.stats.cpu.posts],
    ];
    return (
      <AlbumShell club={X1_INK} tab={null} onTab={() => undefined} showTabs={false} centered label="X1 Local">
        <AlbumPage side="left" label="Apito final" className="x1-page x1-result-left">
          <div className="x1-result-band"><InkBand ink="red" title="Apito final" subtitle="X1 Local" /></div>
          <section className="x1-board" aria-labelledby="x1-result-title">
            <div className="x1-result-score">
              <figure className="x1-side">
                <span className="x1-crest"><TeamCrest team={setup.userTeam} size={76} /></span>
                <figcaption><strong>{playerNames.user}</strong><small>{setup.userTeam.shortName}</small></figcaption>
              </figure>
              <p className="x1-score" aria-label={`${result.goalsFor} a ${result.goalsAgainst}`}>
                <b>{result.goalsFor}</b><span>×</span><b>{result.goalsAgainst}</b>
              </p>
              <figure className="x1-side">
                <span className="x1-crest"><TeamCrest team={setup.cpuTeam} size={76} /></span>
                <figcaption><strong>{playerNames.cpu}</strong><small>{setup.cpuTeam.shortName}</small></figcaption>
              </figure>
            </div>
            {result.decision === "penalties" && <p className="x1-pens">Pênaltis · {result.penaltyFor} × {result.penaltyAgainst}</p>}
            <h1 id="x1-result-title" className="x1-verdict" data-draw={winner ? undefined : ""}>{winner ? `${winner} venceu` : "Empate na mesa"}</h1>
          </section>
          <section className="x1-result-details" aria-labelledby="x1-table-title">
            <BlockTitle id="x1-table-title" note={`${result.turns} toques no total`}>Relatório da mesa</BlockTitle>
            <div className="x1-table-head" aria-hidden="true"><span>{playerNames.user}</span><span>{playerNames.cpu}</span></div>
            <dl className="x1-stat-grid">
              {statRows.map(([label, first, second]) => (
                <div key={label} className="x1-stat-row" style={{ "--first": `${(first / Math.max(1, first + second)) * 100}%` } as CSSProperties}>
                  <dd data-lead={first >= second ? "" : undefined}>{first}</dd>
                  <dt>{label}</dt>
                  <dd data-lead={second >= first ? "" : undefined}>{second}</dd>
                </div>
              ))}
            </dl>
          </section>
          <div className="x1-result-actions">
            <div className="x1-dock"><Stamp variant="primary" onClick={startMatch}>Revanche</Stamp></div>
            <div className="x1-secondary">
              <Stamp onClick={() => setScreen("lobby")}>Trocar times</Stamp>
              <Link className={albumPrimitives.stamp} data-variant="default" href="/"><strong>Menu principal</strong></Link>
            </div>
          </div>
        </AlbumPage>

        <AlbumPage side="right" label="Gols da partida" className="x1-page x1-goals-page">
          <BlockTitle as="h2">Gols da partida</BlockTitle>
          {matchGoals.length ? (
            <ol className="x1-goal-list">
              {matchGoals.map(({ entry, timelineIndex }) => {
                const replayIndex = result.replays?.findIndex((replay) => replay.timelineIndex === timelineIndex) ?? -1;
                const replay = replayIndex >= 0 && activeReplay === replayIndex ? result.replays?.[replayIndex] : undefined;
                return (
                  <li key={timelineIndex} className="x1-goal" data-side={entry.side}>
                    <span className="x1-goal-minute">{formatGoalMinute(entry, setup.rules)}</span>
                    <span className="x1-goal-copy">
                      <b>{entry.side === "user" ? playerNames.user : playerNames.cpu}</b>
                      <small>{entry.text}</small>
                    </span>
                    {replayIndex >= 0 && (
                      <button type="button" className="x1-replay-button" aria-pressed={activeReplay === replayIndex} onClick={() => setActiveReplay(activeReplay === replayIndex ? null : replayIndex)}>
                        {activeReplay === replayIndex ? "Fechar" : "Replay"}
                      </button>
                    )}
                    {replay && (
                      <div className="x1-replay-frame">
                        <GoalReplay replay={replay} setup={setup} label="Replay do gol" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : <p className="x1-note">Nenhum gol antes dos pênaltis.</p>}
          <div className="x1-dock-spacer" aria-hidden="true" />
        </AlbumPage>
      </AlbumShell>
    );
  }

  return (
    <AlbumShell club={X1_INK} tab={null} onTab={() => undefined} showTabs={false} centered label="X1 Local">
      <AlbumPage side="left" label="O confronto" className="x1-page x1-lobby-left">
        <Link className="x1-back" href="/"><FutboboIcon name="arrow-left" /> Menu</Link>
        <InkBand
          ink="red"
          title="X1 Local"
          subtitle={<>Dois jogadores. <span className="x1-pointer-desktop">Um mouse.</span><span className="x1-pointer-touch">Uma tela.</span></>}
        />
        <section className="x1-versus-builder" aria-label="Os dois clubes">
          <ClubPick
            id="x1-player-one"
            player="Jogador 1"
            role="começa"
            club={firstClub}
            value={firstClubId}
            clubs={clubs}
            tilt="-1.4deg"
            onChange={(event) => {
              const id = event.target.value;
              setFirstClubId(id);
              if (id === secondClubId) setSecondClubId(chooseDifferentClub(clubs, id).id);
            }}
            onRandom={() => setFirstClubId(chooseDifferentClub(clubs, secondClubId).id)}
          />
          <span className="x1-versus-mark" aria-hidden="true">×</span>
          <ClubPick
            id="x1-player-two"
            player="Jogador 2"
            role="responde"
            club={secondClub}
            value={secondClubId}
            clubs={clubs}
            tilt="1.2deg"
            onChange={(event) => {
              const id = event.target.value;
              setSecondClubId(id);
              if (id === firstClubId) setFirstClubId(chooseDifferentClub(clubs, id).id);
            }}
            onRandom={() => setSecondClubId(chooseDifferentClub(clubs, firstClubId).id)}
          />
        </section>
      </AlbumPage>

      <AlbumPage side="right" label="A partida" className="x1-page x1-lobby-right">
        <section className="x1-rule-presets" aria-labelledby="x1-rule-preset-title">
          <h2 className="x1-page-title" id="x1-rule-preset-title">Escolha o ritmo</h2>
          <div className="x1-presets">
            {X1_RULE_PRESETS.map((preset) => (
              <button key={preset.id} type="button" className="x1-preset" aria-pressed={rulePresetId === preset.id} onClick={() => setRulePresetId(preset.id)}>
                <strong>{preset.label}</strong><small>{preset.id === "settings" ? (matchSettings.rules.goalLimit ? `${matchSettings.rules.goalLimit} gols · ${matchSettings.rules.halfSeconds}s` : `${matchSettings.rules.halfSeconds}s · sem limite`) : preset.detail}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="x1-launch-strip" aria-labelledby="x1-rules-title">
          <BlockTitle id="x1-rules-title">Regras deste X1</BlockTitle>
          <Ficha className="x1-rules-ficha" rows={rulesRows(selectedRules)} />
          <p className="x1-rules-line">{selectedRules.goalLimit ? `Primeiro a ${selectedRules.goalLimit} gols` : `${selectedRules.halfSeconds}s de jogo`} · pênaltis ligados</p>
        </section>
        <section className="x1-how" aria-labelledby="x1-how-title">
          <BlockTitle id="x1-how-title">Como se joga</BlockTitle>
          <ol>
            <li><b>1</b><span>Jogue seu toque</span></li>
            <li><b>2</b><span className="x1-pointer-desktop">Passe o mouse</span><span className="x1-pointer-touch">Passe o aparelho</span></li>
            <li><b>3</b><span>Repita até o apito</span></li>
          </ol>
          <p className="x1-note">Sem CPU, sem carreira e sem desculpa para a derrota.</p>
        </section>
        <div className="x1-dock"><Stamp variant="primary" onClick={startMatch}>Começar o X1</Stamp></div>
        <div className="x1-dock-spacer" aria-hidden="true" />
      </AlbumPage>
    </AlbumShell>
  );
}

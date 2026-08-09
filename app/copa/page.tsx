"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { COUNTRIES, POSITIONS, countryById, type Country, type PositionKey } from "../game-data";
import BotaoMatch from "../botao/BotaoMatch";
import { buildNationalMatchSetup } from "../botao/adapter";
import { createRng, hashSeed } from "../botao/rng";
import { DEFAULT_BOTAO_RULES, type BotaoMatchResult, type BotaoMatchSetup, type BotaoRules } from "../botao/types";
import { randomPlayerAppearance, visualRosterForMatch } from "../player-appearance";
import "../botao/botao.css";
import "./world-cup.css";

type CupScreen = "setup" | "hub" | "match" | "result" | "finished";

type CupGame = {
  stage: string;
  opponentId: string;
  result?: BotaoMatchResult;
};

type CupCampaign = {
  countryId: string;
  seed: number;
  playerName: string;
  playerNumber: number;
  position: PositionKey;
  games: CupGame[];
  currentIndex: number;
  participants: string[];
  usedOpponents: string[];
  champion: boolean;
  eliminated: boolean;
};

const KNOCKOUT_STAGES = ["16 avos", "Oitavas", "Quartas", "Semifinal", "Final"];
const GROUP_RULES = { ...DEFAULT_BOTAO_RULES, goalLimit: 0, halfSeconds: 105, halves: 1, extraHalves: 0, penalties: false };
const KNOCKOUT_RULES = { ...DEFAULT_BOTAO_RULES, goalLimit: 3, halfSeconds: 120, halves: 1, extraHalves: 1, extraSeconds: 45, penalties: true };
const SETTINGS_KEY = "futbobo:settings:v1";

type StoredBotaoSettings = {
  botaoGoalLimit?: 0 | 3 | 5;
  botaoHalfSeconds?: 90 | 120 | 180;
  botaoExtraSeconds?: 30 | 45 | 60;
  botaoPenaltyRounds?: 3 | 5;
  characterButtonsEnabled?: boolean;
};

function characterButtonsEnabled() {
  if (typeof window === "undefined") return true;
  try {
    const settings = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as StoredBotaoSettings;
    return settings.characterButtonsEnabled !== false;
  } catch {
    return true;
  }
}

function currentCupRules(groupStage: boolean): BotaoRules {
  const base = groupStage ? GROUP_RULES : KNOCKOUT_RULES;
  if (typeof window === "undefined") return base;
  try {
    const settings = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as StoredBotaoSettings;
    const goalLimit = settings.botaoGoalLimit ?? DEFAULT_BOTAO_RULES.goalLimit;
    const halfSeconds = settings.botaoHalfSeconds ?? DEFAULT_BOTAO_RULES.halfSeconds;
    const extraSeconds = settings.botaoExtraSeconds ?? DEFAULT_BOTAO_RULES.extraSeconds;
    const penaltyRounds = settings.botaoPenaltyRounds ?? DEFAULT_BOTAO_RULES.penaltyRounds;
    return {
      ...base,
      goalLimit: [0, 3, 5].includes(goalLimit) ? goalLimit : DEFAULT_BOTAO_RULES.goalLimit,
      halfSeconds: [90, 120, 180].includes(halfSeconds) ? halfSeconds : DEFAULT_BOTAO_RULES.halfSeconds,
      extraSeconds: [30, 45, 60].includes(extraSeconds) ? extraSeconds : DEFAULT_BOTAO_RULES.extraSeconds,
      penaltyRounds: [3, 5].includes(penaltyRounds) ? penaltyRounds : DEFAULT_BOTAO_RULES.penaltyRounds,
    };
  } catch {
    return base;
  }
}

function sortedCountries() {
  return [...COUNTRIES].sort((a, b) => {
    if (a.id === "brasil") return -1;
    if (b.id === "brasil") return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function tournamentField(country: Country, seed: number) {
  const rng = createRng(hashSeed(seed, country.id, "field"));
  const ranked = COUNTRIES
    .filter((candidate) => candidate.id !== country.id)
    .map((candidate) => ({ candidate, score: candidate.strength + rng.range(-2.8, 2.8) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 47)
    .map(({ candidate }) => candidate.id);
  return [country.id, ...ranked];
}

function groupOpponents(country: Country, participants: string[], seed: number) {
  const rng = createRng(hashSeed(seed, country.id, "group"));
  const candidates = participants
    .map(countryById)
    .filter((candidate) => candidate.id !== country.id)
    .map((candidate) => ({
      country: candidate,
      score:
        Math.abs(candidate.strength - country.strength) +
        (candidate.confederation === country.confederation ? 5 : 0) +
        rng.range(0, 9),
    }))
    .sort((a, b) => a.score - b.score);
  const chosen: Country[] = [];
  for (const entry of candidates) {
    if (chosen.length >= 3) break;
    if (chosen.some((candidate) => candidate.confederation === entry.country.confederation) && entry.country.confederation === country.confederation) continue;
    chosen.push(entry.country);
  }
  return chosen.map((candidate) => candidate.id);
}

function knockoutOpponent(campaign: CupCampaign, stage: string) {
  const stageIndex = KNOCKOUT_STAGES.indexOf(stage);
  const minimumStrength = [67, 71, 75, 79, 82][stageIndex] ?? 70;
  const rng = createRng(hashSeed(campaign.seed, stage, campaign.currentIndex));
  const available = campaign.participants
    .map(countryById)
    .filter((country) => country.id !== campaign.countryId && !campaign.usedOpponents.includes(country.id))
    .map((country) => ({ country, score: Math.abs(country.strength - minimumStrength) + rng.range(0, stage === "Final" ? 4 : 10) }))
    .sort((a, b) => a.score - b.score);
  if (stage === "Final") {
    return [...available].sort((a, b) => b.country.strength - a.country.strength || a.score - b.score)[0]?.country.id ?? available[0].country.id;
  }
  return available[0]?.country.id ?? campaign.participants.find((id) => id !== campaign.countryId)!;
}

function campaignTotals(campaign: CupCampaign) {
  return campaign.games.reduce(
    (totals, game) => {
      if (!game.result) return totals;
      totals.played += 1;
      totals.goalsFor += game.result.goalsFor;
      totals.goalsAgainst += game.result.goalsAgainst;
      if (game.result.outcome === "win") totals.wins += 1;
      else if (game.result.outcome === "draw") totals.draws += 1;
      else totals.losses += 1;
      if (game.stage.startsWith("Grupo")) totals.points += game.result.outcome === "win" ? 3 : game.result.outcome === "draw" ? 1 : 0;
      return totals;
    },
    { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  );
}

function flagPath(countryId: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/flags/${countryId}.png`;
}

export default function WorldCupModePage() {
  const countries = useMemo(() => sortedCountries(), []);
  const [screen, setScreen] = useState<CupScreen>("setup");
  const [countryId, setCountryId] = useState("brasil");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PositionKey>("MEI");
  const [campaign, setCampaign] = useState<CupCampaign | null>(null);
  const [setup, setSetup] = useState<BotaoMatchSetup | null>(null);

  const selectedCountry = countryById(countryId);
  const filteredCountries = countries.filter((country) =>
    country.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")),
  );
  const currentGame = campaign?.games[campaign.currentIndex] ?? null;
  const totals = campaign ? campaignTotals(campaign) : null;

  function beginCup() {
    const seed = Date.now() % 2_000_000_000;
    const participants = tournamentField(selectedCountry, seed);
    const opponents = groupOpponents(selectedCountry, participants, seed);
    setCampaign({
      countryId: selectedCountry.id,
      seed,
      playerName: `Camisa 10 de ${selectedCountry.name}`,
      playerNumber: 10,
      position,
      games: opponents.map((opponentId, index) => ({ stage: `Grupo · Rodada ${index + 1}`, opponentId })),
      currentIndex: 0,
      participants,
      usedOpponents: opponents,
      champion: false,
      eliminated: false,
    });
    setScreen("hub");
  }

  function buildCurrentSetup(activeCampaign: CupCampaign) {
    const game = activeCampaign.games[activeCampaign.currentIndex];
    const groupStage = game.stage.startsWith("Grupo");
    const country = countryById(activeCampaign.countryId);
    const opponent = countryById(game.opponentId);
    return buildNationalMatchSetup({
      seed: activeCampaign.seed + activeCampaign.currentIndex * 997,
      season: 2026,
      competitionId: "world-cup-mode",
      competitionName: "Copa do Mundo",
      stageName: game.stage,
      country,
      opponent,
      playerName: activeCampaign.playerName,
      playerNumber: activeCampaign.playerNumber,
      position: activeCampaign.position,
      overall: 86,
      rules: currentCupRules(groupStage),
      visuals: visualRosterForMatch({
        enabled: characterButtonsEnabled(),
        seed: activeCampaign.seed,
        season: 2026,
        userTeamId: country.id,
        cpuTeamId: opponent.id,
        player: randomPlayerAppearance(activeCampaign.seed),
        userNationalCountryId: country.id,
        cpuNationalCountryId: opponent.id,
      }),
    });
  }

  function playCurrentGame() {
    if (!campaign) return;
    setSetup(buildCurrentSetup(campaign));
    setScreen("match");
  }

  function registerResult(result: BotaoMatchResult) {
    if (!campaign) return;
    setCampaign((current) => {
      if (!current) return current;
      const games = current.games.map((game, index) => index === current.currentIndex ? { ...game, result } : game);
      return { ...current, games };
    });
    setScreen("result");
  }

  function advanceTournament() {
    if (!campaign || !currentGame?.result) return;
    const groupStage = currentGame.stage.startsWith("Grupo");
    if (groupStage && campaign.currentIndex < 2) {
      setCampaign({ ...campaign, currentIndex: campaign.currentIndex + 1 });
      setScreen("hub");
      return;
    }

    if (groupStage) {
      const groupTotals = campaignTotals(campaign);
      const qualified = groupTotals.points >= 3 || (groupTotals.points === 2 && groupTotals.goalsFor >= groupTotals.goalsAgainst);
      if (!qualified) {
        setCampaign({ ...campaign, eliminated: true });
        setScreen("finished");
        return;
      }
      const stage = KNOCKOUT_STAGES[0];
      const opponentId = knockoutOpponent(campaign, stage);
      setCampaign({
        ...campaign,
        games: [...campaign.games, { stage, opponentId }],
        currentIndex: campaign.currentIndex + 1,
        usedOpponents: [...campaign.usedOpponents, opponentId],
      });
      setScreen("hub");
      return;
    }

    if (currentGame.result.outcome !== "win") {
      setCampaign({ ...campaign, eliminated: true });
      setScreen("finished");
      return;
    }
    if (currentGame.stage === "Final") {
      setCampaign({ ...campaign, champion: true });
      setScreen("finished");
      return;
    }
    const nextStage = KNOCKOUT_STAGES[KNOCKOUT_STAGES.indexOf(currentGame.stage) + 1];
    const opponentId = knockoutOpponent(campaign, nextStage);
    setCampaign({
      ...campaign,
      games: [...campaign.games, { stage: nextStage, opponentId }],
      currentIndex: campaign.currentIndex + 1,
      usedOpponents: [...campaign.usedOpponents, opponentId],
    });
    setScreen("hub");
  }

  if (screen === "match" && setup) {
    return <BotaoMatch key={setup.matchId} setup={setup} onFinish={registerResult} />;
  }

  if (screen === "setup") {
    return (
      <main className="world-cup-shell world-cup-setup">
        <header className="world-cup-brand"><Link href="/">← FUTBOBO</Link><span>MODO INDEPENDENTE</span></header>
        <section className="world-cup-hero">
          <span>COPA DO MUNDO · FUTEBOL DE BOTÃO</span>
          <h1>Uma Copa inteira.<br />Uma taça.</h1>
          <p>Comece na fase de grupos e jogue cada partida até a final. Nada altera sua carreira: aqui só existe o próximo jogo.</p>
        </section>
        <section className="world-cup-config">
          <div className="world-cup-config-heading"><span>01</span><div><small>SUA CAMISA</small><h2>Escolha a Seleção</h2></div></div>
          <label className="world-cup-search"><span>BUSCAR SELEÇÃO</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Brasil, Japão, Marrocos..." /></label>
          <div className="world-cup-country-grid">
            {filteredCountries.map((country) => (
              <button key={country.id} type="button" aria-pressed={countryId === country.id} onClick={() => setCountryId(country.id)}>
                <Image src={flagPath(country.id)} alt="" width={42} height={30} unoptimized />
                <span><strong>{country.name}</strong><small>{country.abbr} · força {country.strength}</small></span>
              </button>
            ))}
          </div>
        </section>
        <section className="world-cup-config world-cup-role-config">
          <div className="world-cup-config-heading"><span>02</span><div><small>SEU BOTÃO</small><h2>Onde você joga?</h2></div></div>
          <div className="world-cup-position-grid">
            {POSITIONS.map((entry) => <button type="button" key={entry.key} aria-pressed={position === entry.key} onClick={() => setPosition(entry.key)}><b>{entry.key}</b><small>{entry.name}</small></button>)}
          </div>
          <button className="world-cup-primary" type="button" onClick={beginCup}>Começar a Copa do Mundo <span>→</span></button>
          <p className="world-cup-fineprint">48 seleções geradas · 3 jogos de grupo · mata-mata desde os 16 avos · campanha separada do modo carreira</p>
        </section>
      </main>
    );
  }

  if (!campaign || !currentGame || !totals) return null;
  const nation = countryById(campaign.countryId);
  const opponent = countryById(currentGame.opponentId);

  if (screen === "result" && currentGame.result) {
    const won = currentGame.result.outcome === "win";
    const draw = currentGame.result.outcome === "draw";
    return (
      <main className="world-cup-shell world-cup-result">
        <header className="world-cup-brand"><span>COPA DO MUNDO</span><b>{currentGame.stage}</b></header>
        <section className={`world-cup-result-hero ${won ? "won" : draw ? "draw" : "lost"}`}>
          <small>{won ? "VITÓRIA" : draw ? "EMPATE" : "DERROTA"}</small>
          <div><span>{nation.abbr}</span><strong>{currentGame.result.goalsFor} × {currentGame.result.goalsAgainst}</strong><span>{opponent.abbr}</span></div>
          <p>{nation.name} × {opponent.name}</p>
        </section>
        <section className="world-cup-match-summary">
          <div><small>GOLS SEUS</small><strong>{currentGame.result.playerGoals}</strong></div>
          <div><small>ASSISTÊNCIAS</small><strong>{currentGame.result.playerAssists}</strong></div>
          <div><small>TOQUES</small><strong>{currentGame.result.turns}</strong></div>
          <div><small>CAMPANHA</small><strong>{totals.wins}V {totals.draws}E {totals.losses}D</strong></div>
        </section>
        <button className="world-cup-primary" type="button" onClick={advanceTournament}>{currentGame.stage === "Final" ? "Ver desfecho" : "Continuar a Copa"}<span>→</span></button>
      </main>
    );
  }

  if (screen === "finished") {
    return (
      <main className="world-cup-shell world-cup-finished">
        <header className="world-cup-brand"><Link href="/">← FUTBOBO</Link><span>COPA ENCERRADA</span></header>
        <section className={`world-cup-finish-hero ${campaign.champion ? "champion" : "eliminated"}`}>
          <Image src={flagPath(nation.id)} alt="" width={96} height={68} unoptimized />
          <span>{campaign.champion ? "CAMPEÃO DO MUNDO" : "FIM DA CAMPANHA"}</span>
          <h1>{campaign.champion ? "A taça é sua." : `${nation.name} se despede.`}</h1>
          <p>{totals.played} jogos · {totals.wins} vitórias · {totals.goalsFor} gols marcados · {totals.goalsAgainst} sofridos</p>
        </section>
        <div className="world-cup-finish-actions">
          <button className="world-cup-primary" type="button" onClick={beginCup}>Jogar outra com {nation.name}<span>↻</span></button>
          <button type="button" onClick={() => { setCampaign(null); setScreen("setup"); }}>Trocar de Seleção</button>
          <Link href="/">Voltar ao Futbobo</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="world-cup-shell world-cup-hub">
      <header className="world-cup-brand"><Link href="/">← FUTBOBO</Link><span>COPA DO MUNDO</span></header>
      <section className="world-cup-score-rail">
        <div className="world-cup-nation"><Image src={flagPath(nation.id)} alt="" width={70} height={48} unoptimized /><span><small>SUA SELEÇÃO</small><strong>{nation.name}</strong></span></div>
        <div className="world-cup-live-metrics"><span><small>J</small><b>{totals.played}</b></span><span><small>PTS</small><b>{totals.points}</b></span><span><small>SG</small><b>{totals.goalsFor - totals.goalsAgainst}</b></span></div>
      </section>
      <section className="world-cup-next-match">
        <small>PRÓXIMO JOGO · {currentGame.stage}</small>
        <div><span><Image src={flagPath(nation.id)} alt="" width={58} height={40} unoptimized /><strong>{nation.abbr}</strong></span><b>×</b><span><Image src={flagPath(opponent.id)} alt="" width={58} height={40} unoptimized /><strong>{opponent.abbr}</strong></span></div>
        <h1>{nation.name} contra {opponent.name}</h1>
        <button className="world-cup-primary" type="button" onClick={playCurrentGame}>Jogar partida <span>→</span></button>
      </section>
      <section className="world-cup-route">
        <div className="world-cup-route-heading"><small>TRILHA DA COPA</small><strong>{campaign.currentIndex + 1} de até 8 partidas</strong></div>
        <div className="world-cup-route-list">
          {campaign.games.map((game, index) => {
            const gameOpponent = countryById(game.opponentId);
            const state = game.result ? game.result.outcome : index === campaign.currentIndex ? "current" : "future";
            return <article key={`${game.stage}-${game.opponentId}`} className={`world-cup-route-game ${state}`}><span>{game.result ? game.result.outcome === "win" ? "V" : game.result.outcome === "draw" ? "E" : "D" : index + 1}</span><div><small>{game.stage}</small><strong>{gameOpponent.name}</strong></div>{game.result ? <b>{game.result.goalsFor} × {game.result.goalsAgainst}</b> : <b>—</b>}</article>;
          })}
          {KNOCKOUT_STAGES.slice(Math.max(0, campaign.games.length - 3)).map((stage) => <article key={stage} className="world-cup-route-game future"><span>·</span><div><small>MATA-MATA</small><strong>{stage}</strong></div><b>—</b></article>)}
        </div>
      </section>
    </main>
  );
}

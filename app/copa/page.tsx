"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import {
  COUNTRIES,
  POSITIONS,
  countryById,
  type Country,
  type PositionKey,
} from "../game-data";
import BotaoMatch from "../botao/BotaoMatch";
import { buildNationalMatchSetup } from "../botao/adapter";
import { createRng, hashSeed } from "../botao/rng";
import {
  DEFAULT_BOTAO_RULES,
  type BotaoMatchResult,
  type BotaoMatchSetup,
  type BotaoRules,
} from "../botao/types";
import {
  randomPlayerAppearance,
  visualRosterForMatch,
} from "../player-appearance";
import FutboboIcon from "../components/FutboboIcon";
import AlbumShell, { AlbumPage } from "../components/career/album/AlbumShell";
import { clubInks } from "../components/career/album/inks";
import {
  BlockTitle,
  Ficha,
  InkBand,
  Seal,
  Stamp,
} from "../components/career/album/primitives";
import AlbumSheet from "../components/career/album/sheets/AlbumSheet";
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
const GROUP_RULES = {
  ...DEFAULT_BOTAO_RULES,
  goalLimit: 0,
  halfSeconds: 105,
  halves: 1,
  extraHalves: 0,
  penalties: false,
};
const KNOCKOUT_RULES = {
  ...DEFAULT_BOTAO_RULES,
  goalLimit: 3,
  halfSeconds: 120,
  halves: 1,
  extraHalves: 1,
  extraSeconds: 45,
  penalties: true,
};
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
    const settings = JSON.parse(
      window.localStorage.getItem(SETTINGS_KEY) ?? "{}",
    ) as StoredBotaoSettings;
    return settings.characterButtonsEnabled !== false;
  } catch {
    return true;
  }
}

function currentCupRules(groupStage: boolean): BotaoRules {
  const base = groupStage ? GROUP_RULES : KNOCKOUT_RULES;
  if (typeof window === "undefined") return base;
  try {
    const settings = JSON.parse(
      window.localStorage.getItem(SETTINGS_KEY) ?? "{}",
    ) as StoredBotaoSettings;
    const goalLimit = settings.botaoGoalLimit ?? DEFAULT_BOTAO_RULES.goalLimit;
    const halfSeconds =
      settings.botaoHalfSeconds ?? DEFAULT_BOTAO_RULES.halfSeconds;
    const extraSeconds =
      settings.botaoExtraSeconds ?? DEFAULT_BOTAO_RULES.extraSeconds;
    const penaltyRounds =
      settings.botaoPenaltyRounds ?? DEFAULT_BOTAO_RULES.penaltyRounds;
    return {
      ...base,
      goalLimit: [0, 3, 5].includes(goalLimit)
        ? goalLimit
        : DEFAULT_BOTAO_RULES.goalLimit,
      halfSeconds: [90, 120, 180].includes(halfSeconds)
        ? halfSeconds
        : DEFAULT_BOTAO_RULES.halfSeconds,
      extraSeconds: [30, 45, 60].includes(extraSeconds)
        ? extraSeconds
        : DEFAULT_BOTAO_RULES.extraSeconds,
      penaltyRounds: [3, 5].includes(penaltyRounds)
        ? penaltyRounds
        : DEFAULT_BOTAO_RULES.penaltyRounds,
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
  const ranked = COUNTRIES.filter((candidate) => candidate.id !== country.id)
    .map((candidate) => ({
      candidate,
      score: candidate.strength + rng.range(-2.8, 2.8),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 47)
    .map(({ candidate }) => candidate.id);
  return [country.id, ...ranked];
}

function groupOpponents(
  country: Country,
  participants: string[],
  seed: number,
) {
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
    if (
      chosen.some(
        (candidate) => candidate.confederation === entry.country.confederation,
      ) &&
      entry.country.confederation === country.confederation
    )
      continue;
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
    .filter(
      (country) =>
        country.id !== campaign.countryId &&
        !campaign.usedOpponents.includes(country.id),
    )
    .map((country) => ({
      country,
      score:
        Math.abs(country.strength - minimumStrength) +
        rng.range(0, stage === "Final" ? 4 : 10),
    }))
    .sort((a, b) => a.score - b.score);
  if (stage === "Final") {
    return (
      [...available].sort(
        (a, b) => b.country.strength - a.country.strength || a.score - b.score,
      )[0]?.country.id ?? available[0].country.id
    );
  }
  return (
    available[0]?.country.id ??
    campaign.participants.find((id) => id !== campaign.countryId)!
  );
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
      if (game.stage.startsWith("Grupo"))
        totals.points +=
          game.result.outcome === "win"
            ? 3
            : game.result.outcome === "draw"
              ? 1
              : 0;
      return totals;
    },
    {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    },
  );
}

/** Semente de cada campanha nova (lida só no clique de começar). */
function freshCupSeed() {
  return Date.now() % 2_000_000_000;
}

function flagPath(countryId: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/flags/${countryId}.png`;
}

/* ───────────── álbum: peças da Copa ───────────── */

/** Onde cada botão fica no campo impresso (5 colunas × 6 linhas, ataque no alto). */
const FIELD_SPOTS: Record<PositionKey, CSSProperties> = {
  PE: { gridColumn: 1, gridRow: 1 },
  CA: { gridColumn: 3, gridRow: 1 },
  PD: { gridColumn: 5, gridRow: 1 },
  MEI: { gridColumn: 3, gridRow: 2 },
  ME: { gridColumn: 1, gridRow: 3 },
  MC: { gridColumn: 3, gridRow: 3 },
  MD: { gridColumn: 5, gridRow: 3 },
  VOL: { gridColumn: 3, gridRow: 4 },
  LE: { gridColumn: 1, gridRow: 5 },
  ZAG: { gridColumn: 3, gridRow: 5 },
  LD: { gridColumn: 5, gridRow: 5 },
  GOL: { gridColumn: 3, gridRow: 6 },
};

const OUTCOME_MARK = { win: "V", draw: "E", loss: "D" } as const;
const OUTCOME_LABEL = { win: "Vitória", draw: "Empate", loss: "Derrota" } as const;

function inksOf(country: Country) {
  return { primary: country.primary, secondary: country.secondary };
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** As regras que a próxima partida vai usar, como na ficha da mesa da carreira. */
function rulesRows(rules: BotaoRules) {
  return [
    {
      label: "Gols para vencer",
      value: rules.goalLimit ? rules.goalLimit : "sem limite",
    },
    {
      label: "Tempo",
      value:
        rules.halves > 1
          ? `${rules.halves} × ${clock(rules.halfSeconds)}`
          : clock(rules.halfSeconds),
    },
    {
      label: "Prorrogação",
      value: rules.extraHalves ? clock(rules.extraSeconds) : "não tem",
    },
    {
      label: "Pênaltis",
      value: rules.penalties ? `${rules.penaltyRounds} cobranças` : "não tem",
    },
  ];
}

function BackLink() {
  return (
    <Link className="world-cup-back" href="/">
      <FutboboIcon name="arrow-left" /> Menu
    </Link>
  );
}

/** Bandeira impressa com borda branca, como escudo de figurinha. */
function Flag({
  country,
  size = "md",
}: {
  country: Country;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className="world-cup-flag" data-size={size}>
      <Image
        src={flagPath(country.id)}
        alt=""
        width={160}
        height={107}
        loading={size === "lg" ? "eager" : "lazy"}
        unoptimized
      />
    </span>
  );
}

/** A figurinha da seleção: a bandeira é a arte, o nome vem no rodapé. */
function NationSticker({
  country,
  tilt = "-2.4deg",
  className,
}: {
  country: Country;
  tilt?: string;
  className?: string;
}) {
  return (
    <figure
      className={`world-cup-sticker ${className ?? ""}`}
      style={
        {
          ...clubInks(country.primary, country.secondary),
          "--tilt": tilt,
        } as CSSProperties
      }
    >
      <span className="world-cup-sticker-art">
        <Image
          src={flagPath(country.id)}
          alt=""
          width={160}
          height={107}
          loading="eager"
          unoptimized
        />
      </span>
      <figcaption>
        <strong>{country.name}</strong>
        <small>{country.abbr}</small>
      </figcaption>
    </figure>
  );
}

/** Campo de botão impresso: cada posição é um botão de mesa. */
function PositionPitch({
  position,
  onPick,
  labelledBy,
}: {
  position: PositionKey;
  onPick: (position: PositionKey) => void;
  labelledBy: string;
}) {
  return (
    <div className="world-cup-pitch" role="group" aria-labelledby={labelledBy}>
      <svg
        className="world-cup-pitch-lines"
        viewBox="0 0 100 120"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="94" height="114" />
        <path d="M3 60h94M30 117V99h40v18M40 117v-7h20v7M30 3v18h40V3" />
        <circle cx="50" cy="60" r="11" />
      </svg>
      {POSITIONS.map((entry) => (
        <button
          type="button"
          key={entry.key}
          className="world-cup-spot"
          style={FIELD_SPOTS[entry.key]}
          data-lane={FIELD_SPOTS[entry.key].gridColumn === 3 ? "center" : "side"}
          aria-pressed={position === entry.key}
          aria-label={entry.name}
          onClick={() => onPick(entry.key)}
        >
          <b>{entry.key}</b>
          <small>{entry.name}</small>
        </button>
      ))}
    </div>
  );
}

type RouteEntry = {
  key: string;
  stage: string;
  opponent: Country | null;
  result?: BotaoMatchResult;
  state: "win" | "draw" | "loss" | "current" | "future";
  number: number;
};

/** As oito partidas possíveis: as já sorteadas e os mata-matas que ainda esperam adversário. */
function routeEntries(campaign: CupCampaign): RouteEntry[] {
  const drawn: RouteEntry[] = campaign.games.map((game, index) => ({
    key: `${game.stage}-${game.opponentId}`,
    stage: game.stage,
    opponent: countryById(game.opponentId),
    result: game.result,
    state: game.result
      ? game.result.outcome
      : index === campaign.currentIndex
        ? "current"
        : "future",
    number: index + 1,
  }));
  const waiting: RouteEntry[] = KNOCKOUT_STAGES.slice(
    Math.max(0, campaign.games.length - 3),
  ).map((stage, index) => ({
    key: stage,
    stage,
    opponent: null,
    state: "future",
    number: campaign.games.length + index + 1,
  }));
  return [...drawn, ...waiting];
}

/** A tabela da campanha: fase de grupos e o caminho do mata-mata até a final. */
function CupRoute({
  campaign,
  points,
  goalDifference,
}: {
  campaign: CupCampaign;
  points: number;
  goalDifference: number;
}) {
  const entries = routeEntries(campaign);
  const blocks = [
    {
      id: "grupos",
      title: "Fase de grupos",
      note: `${points} ${points === 1 ? "ponto" : "pontos"} · saldo ${goalDifference > 0 ? "+" : ""}${goalDifference}`,
      items: entries.filter((entry) => entry.stage.startsWith("Grupo")),
    },
    {
      id: "mata-mata",
      title: "Mata-mata",
      note: "16 avos à final",
      items: entries.filter((entry) => !entry.stage.startsWith("Grupo")),
    },
  ];
  return (
    <div className="world-cup-route">
      {blocks.map((block) => (
        <section
          key={block.id}
          className="world-cup-route-block"
          data-block={block.id}
          aria-labelledby={`world-cup-route-${block.id}`}
        >
          <BlockTitle id={`world-cup-route-${block.id}`} note={block.note}>
            {block.title}
          </BlockTitle>
          <ol className="world-cup-route-list">
            {block.items.map((entry) => (
              <li
                key={entry.key}
                className="world-cup-step"
                data-state={entry.state}
              >
                <span className="world-cup-step-mark">
                  {entry.result ? (
                    <>
                      <span aria-hidden="true">
                        {OUTCOME_MARK[entry.result.outcome]}
                      </span>
                      <span className="world-cup-vh">
                        {OUTCOME_LABEL[entry.result.outcome]}
                      </span>
                    </>
                  ) : (
                    entry.number
                  )}
                </span>
                {entry.opponent ? (
                  <Flag country={entry.opponent} size="sm" />
                ) : (
                  <span
                    className="world-cup-flag world-cup-flag-slot"
                    data-size="sm"
                    aria-hidden="true"
                  />
                )}
                <span className="world-cup-step-text">
                  <small>{entry.stage.replace(/^Grupo · /, "")}</small>
                  {entry.opponent ? (
                    <>
                      <strong>{entry.opponent.name}</strong>
                      <em className="world-cup-step-abbr" aria-hidden="true">
                        {entry.opponent.abbr}
                      </em>
                    </>
                  ) : (
                    <strong className="world-cup-blank">
                      <span className="world-cup-vh">Adversário a definir</span>
                    </strong>
                  )}
                </span>
                <b className="world-cup-step-score">
                  {entry.result
                    ? `${entry.result.goalsFor} × ${entry.result.goalsAgainst}`
                    : "—"}
                </b>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export default function WorldCupModePage() {
  const countries = useMemo(() => sortedCountries(), []);
  const [screen, setScreen] = useState<CupScreen>("setup");
  const [countryId, setCountryId] = useState("brasil");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PositionKey>("MEI");
  const [campaign, setCampaign] = useState<CupCampaign | null>(null);
  const [setup, setSetup] = useState<BotaoMatchSetup | null>(null);
  // Celular: a lista de seleções abre numa folha solta.
  const [nationPicker, setNationPicker] = useState(false);

  const selectedCountry = countryById(countryId);
  const filteredCountries = countries.filter((country) =>
    country.name
      .toLocaleLowerCase("pt-BR")
      .includes(search.trim().toLocaleLowerCase("pt-BR")),
  );
  const currentGame = campaign?.games[campaign.currentIndex] ?? null;
  const totals = campaign ? campaignTotals(campaign) : null;

  function beginCup() {
    const seed = freshCupSeed();
    const participants = tournamentField(selectedCountry, seed);
    const opponents = groupOpponents(selectedCountry, participants, seed);
    setCampaign({
      countryId: selectedCountry.id,
      seed,
      playerName: `Camisa 10 de ${selectedCountry.name}`,
      playerNumber: 10,
      position,
      games: opponents.map((opponentId, index) => ({
        stage: `Grupo · Rodada ${index + 1}`,
        opponentId,
      })),
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
      const games = current.games.map((game, index) =>
        index === current.currentIndex ? { ...game, result } : game,
      );
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
      const qualified =
        groupTotals.points >= 3 ||
        (groupTotals.points === 2 &&
          groupTotals.goalsFor >= groupTotals.goalsAgainst);
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
    const nextStage =
      KNOCKOUT_STAGES[KNOCKOUT_STAGES.indexOf(currentGame.stage) + 1];
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
    return (
      <BotaoMatch key={setup.matchId} setup={setup} onFinish={registerResult} />
    );
  }

  if (screen === "setup") {
    const positionName =
      POSITIONS.find((entry) => entry.key === position)?.name ?? position;
    return (
      <AlbumShell
        club={inksOf(selectedCountry)}
        tab={null}
        onTab={() => undefined}
        showTabs={false}
        centered
        label="Copa do Mundo"
      >
        <AlbumPage
          side="left"
          label="Sua Copa"
          className="world-cup-page world-cup-setup-left"
        >
          <BackLink />
          <InkBand
            ink="green"
            title="Copa do Mundo"
            subtitle="Uma Copa inteira. Uma taça."
            crest={{ country: selectedCountry }}
          />
          <button
            type="button"
            className="world-cup-choice"
            onClick={() => setNationPicker(true)}
          >
            <Flag country={selectedCountry} size="sm" />
            <span>
              <small>Sua seleção</small>
              <strong>{selectedCountry.name}</strong>
            </span>
            <em>Trocar</em>
          </button>
          <section
            className="world-cup-role"
            aria-labelledby="world-cup-role-title"
          >
            <BlockTitle as="h2" id="world-cup-role-title">
              Onde você joga?
            </BlockTitle>
            <div className="world-cup-role-body">
              <PositionPitch
                position={position}
                onPick={setPosition}
                labelledBy="world-cup-role-title"
              />
              <div className="world-cup-role-side">
                <NationSticker
                  key={selectedCountry.id}
                  country={selectedCountry}
                  className="world-cup-setup-sticker"
                />
                <Ficha
                  rows={[
                    { label: "Posição", value: positionName },
                    { label: "Torneio", value: "48 seleções" },
                    { label: "Grupos", value: "3 jogos" },
                    { label: "Mata-mata", value: "até 5 jogos" },
                  ]}
                />
                <p className="world-cup-note">
                  Nada altera sua carreira: aqui só existe o próximo jogo.
                </p>
              </div>
            </div>
          </section>
          <div className="world-cup-dock">
            <Stamp variant="primary" onClick={beginCup}>
              Começar a Copa do Mundo
            </Stamp>
          </div>
          <div className="world-cup-dock-spacer" aria-hidden="true" />
        </AlbumPage>

        <AlbumPage
          side="right"
          label="Seleções"
          className="world-cup-page world-cup-nations-page"
        >
          <header className="world-cup-nations-head">
            <h2 className="world-cup-page-title">Escolha a seleção</h2>
            <input
              className="world-cup-search-input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Brasil, Japão, Marrocos..."
              aria-label="Buscar seleção"
            />
          </header>
          {filteredCountries.length ? (
            <ul className="world-cup-nations">
              {filteredCountries.map((country, index) => (
                <li key={country.id}>
                  <button
                    type="button"
                    className="world-cup-nation"
                    aria-pressed={countryId === country.id}
                    onClick={() => setCountryId(country.id)}
                    style={
                      {
                        "--r": `${[-1.2, 0.7, -0.4, 1][index % 4]}deg`,
                      } as CSSProperties
                    }
                  >
                    <span className="world-cup-nation-art">
                      <Image
                        src={flagPath(country.id)}
                        alt=""
                        width={84}
                        height={56}
                        unoptimized
                      />
                    </span>
                    <strong>{country.name}</strong>
                    <small>{country.abbr}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="world-cup-note">Nenhuma seleção com esse nome.</p>
          )}
        </AlbumPage>

        {nationPicker && (
          <AlbumSheet
            ink="green"
            club={inksOf(selectedCountry)}
            titleId="world-cup-nation-title"
            title="Escolha a seleção"
            onDismiss={() => setNationPicker(false)}
          >
            <input
              className="world-cup-search-input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Brasil, Japão, Marrocos..."
              aria-label="Buscar seleção"
            />
            {filteredCountries.length ? (
              <ul className="world-cup-pick">
                {filteredCountries.map((country) => (
                  <li key={country.id}>
                    <button
                      type="button"
                      aria-pressed={countryId === country.id}
                      onClick={() => {
                        setCountryId(country.id);
                        setNationPicker(false);
                      }}
                    >
                      <Flag country={country} size="sm" />
                      <strong>{country.name}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="world-cup-note">Nenhuma seleção com esse nome.</p>
            )}
          </AlbumSheet>
        )}
      </AlbumShell>
    );
  }

  if (!campaign || !currentGame || !totals) return null;
  const nation = countryById(campaign.countryId);
  const opponent = countryById(currentGame.opponentId);
  const goalDifference = totals.goalsFor - totals.goalsAgainst;
  const route = (
    <>
      <header className="world-cup-route-head">
        <h2 className="world-cup-page-title">Caminho da taça</h2>
        <p>{campaign.currentIndex + 1} de até 8 partidas</p>
      </header>
      <CupRoute
        campaign={campaign}
        points={totals.points}
        goalDifference={goalDifference}
      />
    </>
  );

  if (screen === "result" && currentGame.result) {
    const outcome = currentGame.result.outcome;
    return (
      <AlbumShell
        club={inksOf(nation)}
        tab={null}
        onTab={() => undefined}
        showTabs={false}
        centered
        label="Copa do Mundo"
      >
        <AlbumPage
          side="left"
          label="Placar final"
          className="world-cup-page world-cup-result-left"
        >
          <InkBand
            ink="club"
            crest={{ country: nation }}
            title={currentGame.stage}
            subtitle="Copa do Mundo"
          />
          <section className="world-cup-board" aria-label="Placar final">
            <div className="world-cup-versus">
              <figure className="world-cup-side">
                <Flag country={nation} size="lg" />
                <figcaption>{nation.abbr}</figcaption>
              </figure>
              <p
                className="world-cup-score"
                aria-label={`${currentGame.result.goalsFor} a ${currentGame.result.goalsAgainst}`}
              >
                <b>{currentGame.result.goalsFor}</b>
                <span>×</span>
                <b>{currentGame.result.goalsAgainst}</b>
              </p>
              <figure className="world-cup-side">
                <Flag country={opponent} size="lg" />
                <figcaption>{opponent.abbr}</figcaption>
              </figure>
            </div>
            <p className="world-cup-board-names">
              {nation.name} × {opponent.name}
            </p>
            <strong className="world-cup-verdict" data-outcome={outcome}>
              {OUTCOME_LABEL[outcome]}
            </strong>
          </section>
          <section
            className="world-cup-summary"
            aria-labelledby="world-cup-summary-title"
          >
            <BlockTitle id="world-cup-summary-title">Sua partida</BlockTitle>
            <Ficha
              rows={[
                { label: "Gols seus", value: currentGame.result.playerGoals },
                {
                  label: "Assistências",
                  value: currentGame.result.playerAssists,
                },
                { label: "Toques", value: currentGame.result.turns },
                {
                  label: "Campanha",
                  value: `${totals.wins}V ${totals.draws}E ${totals.losses}D`,
                },
              ]}
            />
          </section>
          <div className="world-cup-dock">
            <Stamp variant="primary" onClick={advanceTournament}>
              {currentGame.stage === "Final"
                ? "Ver desfecho"
                : "Continuar a Copa"}
            </Stamp>
          </div>
        </AlbumPage>
        <AlbumPage
          side="right"
          label="Caminho da taça"
          className={`world-cup-page world-cup-route-page world-cup-result-route world-cup-phase-${currentGame.stage.startsWith("Grupo") ? "grupos" : "mata-mata"}`}
        >
          {route}
          <div className="world-cup-dock-spacer" aria-hidden="true" />
        </AlbumPage>
      </AlbumShell>
    );
  }

  if (screen === "finished") {
    return (
      <AlbumShell
        club={inksOf(nation)}
        tab={null}
        onTab={() => undefined}
        showTabs={false}
        centered
        label="Copa encerrada"
      >
        <AlbumPage
          side="left"
          label="Fim da Copa"
          className="world-cup-page world-cup-finish-left"
        >
          <BackLink />
          <div className="world-cup-desk-only">
            <InkBand
              ink="club"
              crest={{ country: nation }}
              title={nation.name}
              subtitle="Copa do Mundo"
            />
          </div>
          <section
            className="world-cup-finale"
            data-champion={campaign.champion ? "" : undefined}
            aria-labelledby="world-cup-finale-title"
          >
            <div className="world-cup-finale-art">
              <NationSticker
                country={nation}
                tilt="-3deg"
                className="world-cup-finale-sticker"
              />
              <span className="world-cup-finale-seal">
                <Seal
                  text={
                    campaign.champion ? "Campeão do mundo" : "Fim da campanha"
                  }
                  tone={campaign.champion ? "green" : "ink"}
                />
              </span>
            </div>
            <div className="world-cup-finale-info">
              <h1 id="world-cup-finale-title">
                {campaign.champion
                  ? "A taça é sua."
                  : `${nation.name} se despede.`}
              </h1>
              <Ficha
                rows={[
                  { label: "Jogos", value: totals.played },
                  { label: "Vitórias", value: totals.wins },
                  { label: "Gols marcados", value: totals.goalsFor },
                  { label: "Gols sofridos", value: totals.goalsAgainst },
                ]}
              />
              <div className="world-cup-finale-actions">
                <div className="world-cup-dock">
                  <Stamp variant="primary" onClick={beginCup}>
                    Jogar outra com {nation.name}
                  </Stamp>
                </div>
                <Stamp
                  onClick={() => {
                    setCampaign(null);
                    setScreen("setup");
                  }}
                >
                  Trocar de seleção
                </Stamp>
              </div>
            </div>
          </section>
        </AlbumPage>
        <AlbumPage
          side="right"
          label="Caminho da taça"
          className="world-cup-page world-cup-route-page"
        >
          {route}
          <div className="world-cup-dock-spacer" aria-hidden="true" />
        </AlbumPage>
      </AlbumShell>
    );
  }

  return (
    <AlbumShell
      club={inksOf(nation)}
      tab={null}
      onTab={() => undefined}
      showTabs={false}
      centered
      label="Copa do Mundo"
    >
      <AlbumPage
        side="left"
        label="Próximo jogo"
        className="world-cup-page world-cup-hub-left"
      >
        <BackLink />
        <InkBand
          ink="club"
          crest={{ country: nation }}
          title={nation.name}
          subtitle="Copa do Mundo"
          aside={
            <dl className="world-cup-plate">
              <div>
                <dt>
                  <span aria-hidden="true">J</span>
                  <span className="world-cup-vh">Jogos</span>
                </dt>
                <dd>{totals.played}</dd>
              </div>
              <div>
                <dt>
                  <span aria-hidden="true">Pts</span>
                  <span className="world-cup-vh">Pontos</span>
                </dt>
                <dd>{totals.points}</dd>
              </div>
              <div>
                <dt>
                  <span aria-hidden="true">SG</span>
                  <span className="world-cup-vh">Saldo de gols</span>
                </dt>
                <dd>{goalDifference}</dd>
              </div>
            </dl>
          }
        />
        <section
          className="world-cup-ticket"
          aria-labelledby="world-cup-next-title"
        >
          <div className="world-cup-ticket-paper">
            <div className="world-cup-ticket-main">
              <p className="world-cup-ticket-kicker">
                Próximo jogo · {currentGame.stage}
              </p>
              <div className="world-cup-versus">
                <figure className="world-cup-side">
                  <Flag country={nation} size="lg" />
                  <figcaption>{nation.abbr}</figcaption>
                </figure>
                <span className="world-cup-vs" aria-hidden="true">
                  ×
                </span>
                <figure className="world-cup-side">
                  <Flag country={opponent} size="lg" />
                  <figcaption>{opponent.abbr}</figcaption>
                </figure>
              </div>
              <h1 id="world-cup-next-title" className="world-cup-ticket-title">
                {nation.name} contra {opponent.name}
              </h1>
            </div>
            <div className="world-cup-ticket-stub" aria-hidden="true">
              <b>Copa</b>
              <span>Jogo {campaign.currentIndex + 1}</span>
            </div>
          </div>
        </section>
        <section
          className="world-cup-rules"
          aria-labelledby="world-cup-rules-title"
        >
          <BlockTitle id="world-cup-rules-title">Regras da mesa</BlockTitle>
          <Ficha
            rows={rulesRows(
              currentCupRules(currentGame.stage.startsWith("Grupo")),
            )}
          />
        </section>
        <div className="world-cup-dock">
          <Stamp variant="primary" onClick={playCurrentGame}>
            Jogar partida
          </Stamp>
        </div>
      </AlbumPage>
      <AlbumPage
        side="right"
        label="Caminho da taça"
        className="world-cup-page world-cup-route-page"
      >
        {route}
        <div className="world-cup-dock-spacer" aria-hidden="true" />
      </AlbumPage>
    </AlbumShell>
  );
}

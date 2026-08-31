"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BOTAO_FORMATIONS,
  formationById,
  slotIndexForPosition,
} from "../../botao/formations";
import BotaoMatch from "../../botao/BotaoMatch";
import { hashSeed } from "../../botao/rng";
import { simulateBotaoMatch } from "../../botao/simulate";
import type { BotaoMatchResult } from "../../botao/types";
import {
  acceptManagerJobOffer,
  applyManagerDecision,
  applyManagerMatchResult,
  continueAfterManagerDecision,
  continueManagerSeason,
  createManagerState,
  dismissManagerJobOffers,
  managerClub,
  managerDecision,
  managerMarketOffers,
  managerMatchSetup,
  managerOpponent,
  managerSquad,
  marketFee,
  normalizeManagerState,
  setManagerFormation,
  setManagerLineup,
  signManagerPlayer,
  startManagerCareer,
  type ManagerState,
} from "../../career/manager-model";
import {
  getActiveCareerId,
  readCareerSlotState,
  syncActiveCareerSlot,
} from "../../career/save-system";
import { SAVE_KEY } from "../../career/state";
import type { WorldPlayer } from "../../career/world-player-model";
import { CLUBS, COUNTRIES, LEAGUES } from "../../game-data";
import { PlayerAppearancePortrait } from "../../PlayerAppearanceEditor";
import {
  randomPlayerAppearance,
  teamKitPattern,
} from "../../player-appearance";
import FutboboIcon, { type FutboboIconName } from "../FutboboIcon";
import { ClubBadge } from "../career/CareerPrimitives";
import styles from "./ManagerGame.module.css";

type ManagerTab = "career" | "board" | "team" | "history" | "stats" | "world";
const NAV_ITEMS: Array<{
  id: ManagerTab;
  label: string;
  icon: FutboboIconName;
}> = [
  { id: "career", label: "Carreira", icon: "career" },
  { id: "board", label: "Prancheta", icon: "player" },
  { id: "team", label: "Time", icon: "team" },
  { id: "history", label: "Histórico", icon: "history" },
  { id: "stats", label: "Estatísticas", icon: "stats" },
  { id: "world", label: "Mundo", icon: "globe" },
];

function PlayerPortrait({
  player,
  state,
  size = 42,
}: {
  player: WorldPlayer;
  state: ManagerState;
  size?: number;
}) {
  const appearance = useMemo(
    () => ({
      ...randomPlayerAppearance(hashSeed(state.seed, player.id)),
      kitPattern: teamKitPattern(state.seed, state.currentClubId),
    }),
    [player.id, state.currentClubId, state.seed],
  );
  const club = managerClub(state);
  return (
    <span
      className={styles.playerPortrait}
      style={{ width: size, height: size }}
    >
      <PlayerAppearancePortrait
        appearance={appearance}
        primary={club.primary}
        secondary={club.secondary}
        size={size}
        frame="compact"
        label={`Retrato de ${player.name}`}
      />
    </span>
  );
}

function Progress({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={styles.progress}>
      <span>
        <small>{label}</small>
        <strong>{Math.round(value)}</strong>
      </span>
      <i>
        <b
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            background: color,
          }}
        />
      </i>
    </div>
  );
}
function money(value: number) {
  return value >= 1_000_000
    ? `€${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`
    : `€${Math.round(value / 1000)} mil`;
}
function resultLabel(value: "win" | "loss" | "draw") {
  return value === "win" ? "VITÓRIA" : value === "loss" ? "DERROTA" : "EMPATE";
}
function loadManagerState() {
  if (typeof window === "undefined") return createManagerState(1);
  const activeId = getActiveCareerId();
  const saved = activeId ? readCareerSlotState(activeId) : null;
  return saved && "mode" in saved && saved.mode === "manager"
    ? normalizeManagerState(saved)
    : createManagerState();
}

export default function ManagerGame({ onExit }: { onExit?: () => void }) {
  const [loadedState, setState] = useState<ManagerState | null>(null);
  const loadingState = useMemo(() => createManagerState(1), []);
  const state = loadedState ?? loadingState;
  const [tab, setTab] = useState<ManagerTab>("career");
  const [matchSetup, setMatchSetup] = useState<
    NonNullable<ReturnType<typeof managerMatchSetup>>["setup"] | null
  >(null);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [managerName, setManagerName] = useState("");
  const [nationality, setNationality] = useState("brasil");
  const [clubId, setClubId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setState(loadManagerState()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!loadedState) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(loadedState));
    syncActiveCareerSlot();
  }, [loadedState]);

  const club = managerClub(state);
  const opponent = managerOpponent(state);
  const squad = useMemo(() => managerSquad(state), [state]);
  const playerById = useMemo(
    () => new Map(squad.map((player) => [player.id, player])),
    [squad],
  );
  const marketOffers = useMemo(() => managerMarketOffers(state), [state]);
  const activeFormation = useMemo(
    () => formationById(state.formationId),
    [state.formationId],
  );
  const decision = useMemo(() => managerDecision(state), [state]);
  const wins = state.history.filter((item) => item.outcome === "win").length;
  const goalsFor = state.history.reduce(
    (sum, item) => sum + Number(item.score.split("×")[0] || 0),
    0,
  );
  const goalsAgainst = state.history.reduce(
    (sum, item) => sum + Number(item.score.split("×")[1] || 0),
    0,
  );
  const squadOverall = squad.length
    ? Math.round(
        squad.reduce((sum, player) => sum + player.overall, 0) / squad.length,
      )
    : 0;
  const jobOffers = useMemo(() => {
    const ids = new Set(state.jobOffers);
    return CLUBS.filter((item) => ids.has(item.id)).slice(0, 3);
  }, [state.jobOffers]);
  const playerStatsRows = useMemo(
    () =>
      Object.entries(state.playerStats)
        .map(([id, stats]) => ({
          player: state.worldPlayers.players[id],
          stats,
        }))
        .filter(
          (
            item,
          ): item is {
            player: WorldPlayer;
            stats: (typeof state.playerStats)[string];
          } => Boolean(item.player && item.stats.appearances),
        )
        .sort(
          (a, b) =>
            b.stats.goals + b.stats.assists - a.stats.goals - a.stats.assists,
        )
        .slice(0, 10),
    [state],
  );
  const formationUsage = useMemo(
    () =>
      Object.entries(
        state.history.reduce<Record<string, number>>(
          (all, item) => ({
            ...all,
            [item.formationId]: (all[item.formationId] ?? 0) + 1,
          }),
          {},
        ),
      ).sort(([, a], [, b]) => b - a),
    [state.history],
  );
  const worldLeaders = useMemo(
    () =>
      Object.values(state.worldPlayers.players)
        .filter((player) => player.status === "active")
        .sort((a, b) => b.reputation - a.reputation || b.overall - a.overall)
        .slice(0, 12),
    [state.worldPlayers.players],
  );

  const formationPreview = useMemo(() => {
    const remaining = state.starters
      .map((id) => playerById.get(id))
      .filter((player): player is WorldPlayer => Boolean(player));
    const minDepth = Math.min(
      ...activeFormation.slots.map((slot) => slot.depth),
    );
    return activeFormation.slots
      .map((slot, slotIndex) => {
        let bestIndex = 0;
        let bestCost = Number.POSITIVE_INFINITY;
        remaining.forEach((player, index) => {
          const cost =
            player.position === "GOL"
              ? Math.abs(slot.depth - minDepth) * 100 +
                Math.abs(slot.lane - 0.5)
              : Math.abs(
                  slotIndexForPosition(activeFormation, player.position) -
                    slotIndex,
                );
          if (cost < bestCost) {
            bestCost = cost;
            bestIndex = index;
          }
        });
        const player = remaining.splice(bestIndex, 1)[0];
        return player ? { player, slot } : null;
      })
      .filter(
        (
          item,
        ): item is {
          player: WorldPlayer;
          slot: (typeof activeFormation.slots)[number];
        } => Boolean(item),
      );
  }, [activeFormation, playerById, state.starters]);

  const start = () => {
    const selectedClub = clubId || CLUBS[0]?.id || "";
    if (!selectedClub) return;
    setState(
      startManagerCareer(state, {
        name: managerName || state.name,
        nationality,
        clubId: selectedClub,
      }),
    );
    setTab("career");
    setNotice("Contrato assinado. A primeira decisão está na mesa.");
  };
  const openMatch = () => {
    const prepared = managerMatchSetup(state);
    if (!prepared) {
      setNotice("Escolha cinco titulares e três reservas antes da partida.");
      setTab("team");
      return;
    }
    setState(prepared.state);
    setMatchSetup(prepared.setup);
  };
  const completeResult = (
    base: ManagerState,
    setup: NonNullable<ReturnType<typeof managerMatchSetup>>["setup"],
    result: BotaoMatchResult,
  ) => {
    const starters =
      setup.managerRosters?.user.starters
        .map((player) => player.id)
        .filter((id): id is string => Boolean(id)) ?? base.starters;
    const bench = base.squadIds
      .filter((id) => !starters.includes(id))
      .slice(0, 3);
    setState(
      applyManagerMatchResult(setManagerLineup(base, starters, bench), result),
    );
    setMatchSetup(null);
    setTab("career");
    setNotice("");
  };
  const swapPlayers = (nextId: string) => {
    if (!selectedPlayer) {
      setSelectedPlayer(nextId);
      return;
    }
    if (selectedPlayer === nextId) {
      setSelectedPlayer("");
      return;
    }
    const starters = state.starters.map((id) =>
      id === selectedPlayer ? nextId : id === nextId ? selectedPlayer : id,
    );
    const bench = state.bench.map((id) =>
      id === selectedPlayer ? nextId : id === nextId ? selectedPlayer : id,
    );
    const aRelated =
      state.starters.includes(selectedPlayer) ||
      state.bench.includes(selectedPlayer);
    const bRelated =
      state.starters.includes(nextId) || state.bench.includes(nextId);
    if (aRelated !== bRelated) {
      if (state.starters.includes(selectedPlayer))
        starters[state.starters.indexOf(selectedPlayer)] = nextId;
      else if (state.bench.includes(selectedPlayer))
        bench[state.bench.indexOf(selectedPlayer)] = nextId;
      else if (state.starters.includes(nextId))
        starters[state.starters.indexOf(nextId)] = selectedPlayer;
      else if (state.bench.includes(nextId))
        bench[state.bench.indexOf(nextId)] = selectedPlayer;
    }
    setState(setManagerLineup(state, starters, bench));
    setSelectedPlayer("");
    setNotice("");
  };

  if (matchSetup)
    return (
      <div className={styles.matchHost}>
        <button
          type="button"
          className={styles.matchBack}
          onClick={() => setMatchSetup(null)}
        >
          <FutboboIcon name="arrow-left" /> Prancheta
        </button>
        <BotaoMatch
          setup={matchSetup}
          onFinish={(result) => completeResult(state, matchSetup, result)}
        />
      </div>
    );
  if (!loadedState)
    return (
      <main className={styles.loading} aria-live="polite">
        Carregando sua prancheta…
      </main>
    );
  if (state.phase === "onboarding")
    return (
      <main className={`app-shell ${styles.onboardingRoot}`}>
        <section className={styles.onboarding}>
          <header>
            <button type="button" onClick={onExit}>
              <FutboboIcon name="arrow-left" /> Menu
            </button>
            <span>CARREIRA DE TÉCNICO</span>
          </header>
          <div className={styles.onboardingGrid}>
            <div className={styles.onboardingCopy}>
              <span>ASSINE O PRIMEIRO CONTRATO</span>
              <h1>
                O time é seu.
                <br />
                <em>A mesa também.</em>
              </h1>
              <p>
                Decida o rumo da temporada, monte os cinco e responda no
                jogo-chave. A carreira tem o mesmo ritmo do modo jogador — agora
                vista do banco.
              </p>
            </div>
            <div className={styles.contractCard}>
              <label>
                <span>SEU NOME</span>
                <input
                  value={managerName || state.name}
                  onChange={(event) => setManagerName(event.target.value)}
                  placeholder="Como a torcida vai chamar você?"
                />
              </label>
              <label>
                <span>NACIONALIDADE</span>
                <select
                  value={nationality}
                  onChange={(event) => setNationality(event.target.value)}
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>PRIMEIRO CLUBE</span>
                <select
                  value={clubId || CLUBS[0]?.id}
                  onChange={(event) => setClubId(event.target.value)}
                >
                  {CLUBS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · força {item.strength}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={start}
              >
                Assinar contrato <FutboboIcon name="arrow-right" />
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  if (state.phase === "dismissed")
    return (
      <main className={`app-shell ${styles.dismissed}`}>
        <section>
          <span>FIM DE CICLO</span>
          <h1>A diretoria encerrou o projeto.</h1>
          <p>
            Sua reputação continua. Escolha uma nova prancheta e volte para a
            mesa.
          </p>
          <div>
            {CLUBS.slice(0, 12).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() =>
                  setState(
                    startManagerCareer(
                      {
                        ...createManagerState(state.seed),
                        name: state.name,
                        nationality: state.nationality,
                      },
                      {
                        name: state.name,
                        nationality: state.nationality,
                        clubId: item.id,
                      },
                    ),
                  )
                }
              >
                <ClubBadge club={item} size="sm" />
                <span>{item.shortName}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    );

  const renderCareer = () => {
    if (state.careerStage === "decision")
      return (
        <div className={`event-stage ${styles.managerEvent}`}>
          <div className="market-strip">
            <span>
              <small>PRÓXIMO JOGO</small>
              <strong>
                {opponent
                  ? `${club.shortName} × ${opponent.shortName}`
                  : "Jogo-chave em definição"}
              </strong>
            </span>
            <button type="button" onClick={() => setTab("board")}>
              Ver prancheta
            </button>
          </div>
          <div className="objective-card">
            <span>META DA DIRETORIA</span>
            <strong>{state.objective}</strong>
            <p>Suas decisões e o jogo-chave alteram a confiança no trabalho.</p>
            <small>Confiança atual: {Math.round(state.boardTrust)}%</small>
          </div>
          <div className={`event-art ${styles.decisionArt}`}>
            <span className="event-tag">{decision.tag}</span>
            <div className="event-watermark">
              <FutboboIcon name="career" />
            </div>
          </div>
          <article className="event-card">
            <div className="event-heading">
              <span>TEMPORADA {state.season}</span>
              <h1>{decision.title}</h1>
              <p>{decision.description}</p>
            </div>
            <div
              className="choice-list"
              data-choice-count={decision.choices.length}
            >
              {decision.choices.map((choice) => (
                <button
                  type="button"
                  key={choice.id}
                  className="decision-button"
                  onClick={() =>
                    setState(applyManagerDecision(state, choice.id))
                  }
                >
                  <span>
                    <strong>{choice.label}</strong>
                    <small>{choice.hint}</small>
                  </span>
                  <b>→</b>
                </button>
              ))}
            </div>
          </article>
        </div>
      );
    if (state.careerStage === "consequence" && state.lastDecision)
      return (
        <div
          className={`consequence-stage screen-enter ${styles.managerConsequence}`}
        >
          <span className="result-kicker">CONSEQUÊNCIAS DA ESCOLHA</span>
          <div className="consequence-symbol">↯</div>
          <small>VOCÊ ESCOLHEU</small>
          <h1>{state.lastDecision.choice}</h1>
          <p>{state.lastDecision.consequence}</p>
          <div className="consequence-list">
            {state.lastDecision.changes.map((change) => (
              <span key={change}>{change}</span>
            ))}
          </div>
          <div className="consequence-note">
            <strong>{state.lastDecision.headline}</strong>
            <span>Agora leve a decisão para a escalação e para a mesa.</span>
          </div>
          <div className="mobile-action-dock">
            <button
              className="primary-button"
              onClick={() => setState(continueAfterManagerDecision(state))}
            >
              Preparar jogo-chave <span>→</span>
            </button>
          </div>
        </div>
      );
    return (
      <div className={`event-stage ${styles.matchStage}`}>
        <div className="objective-card">
          <span>META DA DIRETORIA</span>
          <strong>{state.objective}</strong>
          <p>
            Formação: {activeFormation.name} · cinco titulares e três reservas
            confirmados.
          </p>
          <small>Confiança atual: {Math.round(state.boardTrust)}%</small>
        </div>
        <article className={styles.keyMatch}>
          <header>
            <span>{state.pendingMatch?.competitionName ?? "JOGO-CHAVE"}</span>
            <strong>{state.pendingMatch?.stageName ?? "Temporada"}</strong>
          </header>
          <div className={styles.matchup}>
            <div>
              <ClubBadge club={club} size="md" />
              <strong>{club.shortName}</strong>
              <small>VOCÊ</small>
            </div>
            <b>×</b>
            <div>
              <ClubBadge club={opponent ?? club} size="md" />
              <strong>{opponent?.shortName ?? "Adversário"}</strong>
              <small>FORÇA {opponent?.strength ?? 0}</small>
            </div>
          </div>
          <div className={styles.matchActions}>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={openMatch}
            >
              <FutboboIcon name="play" /> Jogar partida
            </button>
            <button
              type="button"
              onClick={() => {
                const prepared = managerMatchSetup(state);
                if (!prepared) {
                  setNotice(
                    "Escolha cinco titulares e três reservas antes da partida.",
                  );
                  setTab("team");
                  return;
                }
                completeResult(
                  prepared.state,
                  prepared.setup,
                  simulateBotaoMatch(prepared.setup),
                );
              }}
            >
              Simular com a mesma IA
            </button>
          </div>
          <footer>
            <button type="button" onClick={() => setTab("board")}>
              <FutboboIcon name="player" /> Rever formação
            </button>
            <button type="button" onClick={() => setTab("team")}>
              <FutboboIcon name="team" /> Rever relacionados
            </button>
          </footer>
        </article>
      </div>
    );
  };

  const rosterPlayer = (id: string, area: "starter" | "bench") => {
    const player = playerById.get(id);
    if (!player) return null;
    return (
      <button
        type="button"
        key={id}
        className={`${styles.rosterPlayer} ${styles[area]} ${selectedPlayer === id ? styles.selectedPlayer : ""}`}
        onClick={() => swapPlayers(id)}
      >
        <PlayerPortrait
          player={player}
          state={state}
          size={area === "starter" ? 50 : 40}
        />
        <span>
          <small>{player.position}</small>
          <strong>{player.name}</strong>
          <em>{state.season - player.birthSeason} anos</em>
        </span>
        <b>{player.overall}</b>
      </button>
    );
  };

  const renderPanel = () => {
    if (tab === "board")
      return (
        <div className={`panel-screen ${styles.panel}`}>
          <header className={styles.panelHeading}>
            <span>PRANCHETA</span>
            <h2>Como os cinco começam.</h2>
            <p>
              Escolha um desenho. Ele entra na partida de verdade e continua
              ativo até você mudar.
            </p>
          </header>
          <div className={styles.boardLayout}>
            <div className={styles.formationPreview}>
              <div className={styles.previewLines} />
              {formationPreview.map(({ player, slot }) => (
                <div
                  key={player.id}
                  className={styles.previewPlayer}
                  style={{
                    left:
                      player.position === "GOL" ? "50%" : `${slot.lane * 100}%`,
                    top: `${slot.depth * 100}%`,
                  }}
                >
                  <PlayerPortrait player={player} state={state} size={42} />
                  <strong>{player.name.split(" ").at(-1)}</strong>
                  <span>
                    {player.position} · {player.overall}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className={styles.boardOpponent}>
                <span>PRÓXIMO JOGO</span>
                <strong>
                  {club.shortName} × {opponent?.shortName ?? "Adversário"}
                </strong>
                <small>Força rival {opponent?.strength ?? 0}</small>
              </div>
              <div className={styles.formationGrid}>
                {BOTAO_FORMATIONS.map((formation) => (
                  <button
                    type="button"
                    key={formation.id}
                    className={
                      state.formationId === formation.id
                        ? styles.formationActive
                        : ""
                    }
                    onClick={() =>
                      setState(setManagerFormation(state, formation.id))
                    }
                  >
                    <span>{formation.shape}</span>
                    <strong>{formation.name}</strong>
                    <small>{formation.hint}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    if (tab === "team")
      return (
        <div className={`panel-screen ${styles.panel}`}>
          <header className={styles.panelHeading}>
            <span>TIME</span>
            <h2>Cinco em campo. Três no banco.</h2>
            <p>
              {selectedPlayer
                ? "Agora toque no atleta que vai trocar de lugar."
                : "Toque em um titular e depois em um reserva para trocar os dois."}
            </p>
          </header>
          <div className={styles.teamLayout}>
            <section className={styles.teamPitch}>
              <div className={styles.previewLines} />
              {state.starters.map((id) => {
                const player = playerById.get(id);
                const slot =
                  formationPreview.find((item) => item.player.id === id)
                    ?.slot ?? activeFormation.slots[0];
                const gridColumn =
                  player && player.position === "GOL"
                    ? 2
                    : slot.lane < 0.42
                      ? 1
                      : slot.lane > 0.58
                        ? 3
                        : 2;
                const gridRow =
                  slot.depth < 0.32 ? 1 : slot.depth < 0.76 ? 2 : 3;
                return (
                  <div key={id} style={{ gridColumn, gridRow }}>
                    {rosterPlayer(id, "starter")}
                  </div>
                );
              })}
            </section>
            <aside>
              <span className={styles.listLabel}>BANCO · 3 RESERVAS</span>
              <div className={styles.benchList}>
                {state.bench.map((id) => rosterPlayer(id, "bench"))}
              </div>
              <div className={styles.squadRule}>
                <FutboboIcon name="team" />
                <span>
                  <strong>Elenco fechado em oito.</strong>
                  <small>
                    Os cinco titulares e os três reservas são todo o time.
                  </small>
                </span>
              </div>
            </aside>
          </div>
        </div>
      );
    if (tab === "history")
      return (
        <div className={`panel-screen ${styles.panel}`}>
          <header className={styles.panelHeading}>
            <span>HISTÓRICO</span>
            <h2>A carreira vista do banco.</h2>
            <p>Temporadas, adversários e escolhas que já chegaram à mesa.</p>
          </header>
          <div className={styles.historyList}>
            {state.history.length ? (
              state.history.map((item) => {
                const rival = CLUBS.find(
                  (candidate) => candidate.id === item.opponentId,
                );
                return (
                  <article key={item.id}>
                    <span>{item.season}</span>
                    <ClubBadge club={rival ?? club} size="sm" />
                    <div>
                      <strong>
                        {club.shortName} × {rival?.shortName ?? "Adversário"}
                      </strong>
                      <small>
                        {item.competitionName} ·{" "}
                        {formationById(item.formationId).name} ·{" "}
                        {item.substitutions} troca(s)
                      </small>
                    </div>
                    <b
                      className={
                        item.outcome === "win"
                          ? styles.good
                          : item.outcome === "loss"
                            ? styles.bad
                            : styles.neutral
                      }
                    >
                      {item.score}
                      <small>{resultLabel(item.outcome)}</small>
                    </b>
                  </article>
                );
              })
            ) : (
              <div className={styles.emptyPanel}>
                <FutboboIcon name="history" />
                <strong>Sua primeira temporada ainda está esperando.</strong>
                <span>Decida, escale e jogue para abrir o arquivo.</span>
              </div>
            )}
          </div>
        </div>
      );
    if (tab === "stats")
      return (
        <div className={`panel-screen ${styles.panel}`}>
          <header className={styles.panelHeading}>
            <span>ESTATÍSTICAS</span>
            <h2>O que suas escolhas produziram.</h2>
            <p>
              Somente números que ajudam a entender time, campanha e uso dos
              atletas.
            </p>
          </header>
          <div className={styles.statHero}>
            <div>
              <small>JOGOS-CHAVE</small>
              <strong>{state.history.length}</strong>
            </div>
            <div>
              <small>VITÓRIAS</small>
              <strong>{wins}</strong>
            </div>
            <div>
              <small>GOLS PRÓ</small>
              <strong>{goalsFor}</strong>
            </div>
            <div>
              <small>GOLS CONTRA</small>
              <strong>{goalsAgainst}</strong>
            </div>
          </div>
          <div className={styles.statColumns}>
            <article>
              <span className={styles.listLabel}>PRODUÇÃO DO ELENCO</span>
              {playerStatsRows.length ? (
                playerStatsRows.map(({ player, stats }) => (
                  <div key={player.id}>
                    <PlayerPortrait player={player} state={state} size={34} />
                    <span>
                      <strong>{player.name}</strong>
                      <small>
                        {stats.appearances}J · {stats.starts} titular ·{" "}
                        {stats.distance}u
                      </small>
                    </span>
                    <b>
                      {stats.goals}G · {stats.assists}A
                    </b>
                  </div>
                ))
              ) : (
                <p>Nenhum relatório individual ainda.</p>
              )}
            </article>
            <article>
              <span className={styles.listLabel}>FORMAÇÕES USADAS</span>
              {formationUsage.length ? (
                formationUsage.map(([id, count]) => (
                  <div key={id}>
                    <span>
                      <strong>{formationById(id).name}</strong>
                      <small>{formationById(id).shape}</small>
                    </span>
                    <b>{count}×</b>
                  </div>
                ))
              ) : (
                <p>A estreia vai registrar sua primeira formação.</p>
              )}
            </article>
          </div>
        </div>
      );
    if (tab === "world")
      return (
        <div className={`panel-screen ${styles.panel}`}>
          <header className={styles.panelHeading}>
            <span>MUNDO</span>
            <h2>O futebol continua fora da sua prancheta.</h2>
            <p>
              Mercado curto, jogadores relevantes e o universo persistente da
              carreira.
            </p>
          </header>
          {marketOffers.length ? (
            <article className={styles.market}>
              <header>
                <span>JANELA ABERTA</span>
                <strong>Uma necessidade. Três nomes.</strong>
                <small>
                  Uma contratação substitui diretamente o reserva de menor OVR.
                  O elenco continua com oito.
                </small>
              </header>
              <div>
                {marketOffers.map((player) => (
                  <button
                    type="button"
                    key={player.id}
                    onClick={() => {
                      const next = signManagerPlayer(state, player.id);
                      if (next === state)
                        setNotice("O caixa não comporta essa contratação.");
                      else {
                        setState(next);
                        setNotice(
                          `${player.name} assinou com o ${club.shortName}.`,
                        );
                      }
                    }}
                  >
                    <PlayerPortrait player={player} state={state} size={42} />
                    <span>
                      <strong>{player.name}</strong>
                      <small>
                        {player.position} · {player.overall} OVR
                      </small>
                    </span>
                    <b>{money(marketFee(player))}</b>
                  </button>
                ))}
              </div>
            </article>
          ) : null}
          <div className={styles.worldGrid}>
            {worldLeaders.map((player, index) => {
              const playerClub = CLUBS.find(
                (item) => item.id === player.currentClubId,
              );
              return (
                <article key={player.id}>
                  <span>#{index + 1}</span>
                  <PlayerPortrait
                    player={player}
                    state={{
                      ...state,
                      currentClubId: playerClub?.id ?? state.currentClubId,
                    }}
                    size={40}
                  />
                  <div>
                    <strong>{player.name}</strong>
                    <small>
                      {playerClub?.shortName ?? "Sem clube"} · {player.position}
                    </small>
                  </div>
                  <b>
                    {player.overall}
                    <small>OVR</small>
                  </b>
                </article>
              );
            })}
          </div>
        </div>
      );
    return null;
  };

  if (state.phase === "result" && state.lastResult)
    return (
      <main className="app-shell app-shell-season-result">
        <section
          className={`career-shell career-phase-season-result ${styles.managerCareer}`}
        >
          <header className="career-header">
            <div className="club-identity">
              <ClubBadge club={club} size="sm" />
              <span>
                <small>{state.season}</small>
                <strong>{club.shortName}</strong>
              </span>
            </div>
            <div className="career-age">
              <strong>{Math.round(state.boardTrust)}</strong>
              <span>CONFIANÇA</span>
            </div>
            <div className="player-identity">
              <span>
                <small>REP</small>
                <strong>{Math.round(state.reputation)}</strong>
              </span>
              <div className={styles.managerAvatar}>
                <FutboboIcon name="career" />
              </div>
            </div>
          </header>
          <div className={`result-stage screen-enter ${styles.resultStage}`}>
            <span className="result-kicker">
              FIM DA TEMPORADA {state.season}
            </span>
            <div
              className={`result-symbol ${state.lastResult.outcome === "win" ? "winner" : ""}`}
            >
              <FutboboIcon
                name={
                  state.lastResult.outcome === "win"
                    ? "trophy"
                    : state.lastResult.outcome === "loss"
                      ? "trend-down"
                      : "trend-up"
                }
              />
            </div>
            <h1>{resultLabel(state.lastResult.outcome)} no jogo-chave.</h1>
            <p>
              {state.lastResult.goalsFor} × {state.lastResult.goalsAgainst}. A
              diretoria fecha o ano com {Math.round(state.boardTrust)}% de
              confiança no seu trabalho.
            </p>
            <div className="season-stat-grid">
              <div className="metric">
                <span>CONFIANÇA</span>
                <strong>{Math.round(state.boardTrust)}</strong>
              </div>
              <div className="metric">
                <span>REPUTAÇÃO</span>
                <strong>{Math.round(state.reputation)}</strong>
              </div>
              <div className="metric">
                <span>TROCAS</span>
                <strong>{state.lastResult.substitutions}</strong>
              </div>
              <div className="metric">
                <span>ORÇAMENTO</span>
                <strong>{money(state.budget)}</strong>
              </div>
            </div>
            {jobOffers.length ? (
              <article className={styles.jobs}>
                <span>PROPOSTAS DE TRABALHO</span>
                <strong>Sua temporada abriu outras portas.</strong>
                <div>
                  {jobOffers.map((offer) => (
                    <button
                      type="button"
                      key={offer.id}
                      onClick={() =>
                        setState(acceptManagerJobOffer(state, offer.id))
                      }
                    >
                      <ClubBadge club={offer} size="sm" />
                      <span>
                        <strong>{offer.shortName}</strong>
                        <small>força {offer.strength}</small>
                      </span>
                      <FutboboIcon name="arrow-right" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setState(dismissManagerJobOffers(state))}
                  >
                    Continuar no {club.shortName}
                  </button>
                </div>
              </article>
            ) : null}
            <div className="mobile-action-dock">
              <button
                className="primary-button"
                onClick={() => setState(continueManagerSeason(state))}
              >
                Começar temporada {state.season + 1} <span>→</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    );

  return (
    <main className="app-shell app-shell-career">
      <section
        className={`career-shell career-phase-career career-tab-${tab === "career" ? "event" : tab} screen-enter ${styles.managerCareer}`}
      >
        <header className="career-header">
          <div className="club-identity">
            <ClubBadge club={club} size="sm" />
            <span>
              <small>{state.season}</small>
              <strong>{club.shortName}</strong>
            </span>
          </div>
          <div className="career-age">
            <strong>{String(state.season).slice(-2)}</strong>
            <span>ANO</span>
          </div>
          <div className="player-identity">
            <span>
              <small>CONFIANÇA</small>
              <strong>{Math.round(state.boardTrust)}</strong>
            </span>
            <div className={styles.managerAvatar}>
              <FutboboIcon name="career" />
            </div>
          </div>
        </header>
        <div className="career-bars career-bars-four">
          <Progress
            label="Confiança"
            value={state.boardTrust}
            color={state.boardTrust < 40 ? "#ef6258" : "#58a9e8"}
          />
          <Progress
            label="Reputação"
            value={state.reputation}
            color="#f4c430"
          />
          <Progress label="Elenco" value={squadOverall} color="#67dd78" />
          <Progress
            label="Caixa"
          value={Math.min(100, state.budget / 150_000)}
            color="#aab8ac"
          />
        </div>
        <div className="career-status-strip">
          <span>
            <small>OBJETIVO</small>
            <strong>
              {state.history.length
                ? "Manter o time competitivo"
                : "Fazer uma boa estreia"}
            </strong>
          </span>
          <span>
            <small>FORMAÇÃO</small>
            <strong>{activeFormation.name}</strong>
          </span>
          <span>
            <small>RELACIONADOS</small>
            <strong>5 + {state.bench.length}</strong>
          </span>
          {onExit ? (
            <button
              type="button"
              className="retirement-trigger"
              onClick={onExit}
            >
              <small>CARREIRA</small>
              <strong>
                <FutboboIcon name="arrow-left" /> Sair
              </strong>
            </button>
          ) : (
            <span>
              <small>TÉCNICO</small>
              <strong>{state.name}</strong>
            </span>
          )}
        </div>
        {notice ? (
          <button
            type="button"
            className={styles.notice}
            onClick={() => setNotice("")}
          >
            {notice}
            <span>×</span>
          </button>
        ) : null}
        {tab === "career" ? renderCareer() : renderPanel()}
        <nav
          className="bottom-nav"
          aria-label="Navegação da carreira de técnico"
        >
          <div className="desktop-career-nav-brand" aria-hidden="true">
            <span className={styles.brandMark}>F</span>
            <span>
              <small>CENTRAL DO TÉCNICO</small>
              <strong>{state.name}</strong>
              <em>
                {LEAGUES.find((league) => league.id === club.leagueId)?.name ??
                  club.countryId}
              </em>
            </span>
          </div>
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={tab === item.id}
              className={tab === item.id ? "selected" : ""}
              onClick={() => {
                setTab(item.id);
                setSelectedPlayer("");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <span>
                <FutboboIcon name={item.icon} />
              </span>
              {item.label}
            </button>
          ))}
        </nav>
      </section>
    </main>
  );
}

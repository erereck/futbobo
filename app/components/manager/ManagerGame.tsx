"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  hireManagerAtClub,
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
import { BrandMark, ClubBadge, Progress } from "../career/CareerPrimitives";
import timelineStyles from "../career/CareerTimeline.module.css";
import worldStyles from "../career/CareerWorld.module.css";
import styles from "./ManagerGame.module.css";

type ManagerTab = "career" | "board" | "team" | "history" | "stats" | "world";
type ManagerWorldSection = "now" | "clubs" | "players" | "archive";
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
  const [worldSection, setWorldSection] = useState<ManagerWorldSection>("now");
  const [matchSetup, setMatchSetup] = useState<
    NonNullable<ReturnType<typeof managerMatchSetup>>["setup"] | null
  >(null);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [draggedPlayer, setDraggedPlayer] = useState("");
  const suppressRosterClick = useRef(false);
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
  const latestSeason = state.seasonHistory.at(-1);
  const jobOffers = useMemo(() => {
    const ids = new Set(state.jobOffers);
    return CLUBS.filter((item) => ids.has(item.id)).slice(0, 3);
  }, [state.jobOffers]);
  const playerStatsRows = useMemo(
    () =>
      squad
        .map((player) => ({
          player,
          stats: state.playerStats[player.id] ?? {
            appearances: 0,
            starts: 0,
            substitutionsIn: 0,
            substitutionsOut: 0,
            goals: 0,
            assists: 0,
            touches: 0,
            flicks: 0,
            distance: 0,
          },
        }))
        .sort(
          (a, b) =>
            b.stats.goals + b.stats.assists - a.stats.goals - a.stats.assists ||
            b.stats.appearances - a.stats.appearances ||
            b.player.overall - a.player.overall,
        ),
    [squad, state.playerStats],
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
  const worldClubs = useMemo(
    () =>
      CLUBS.slice()
        .sort(
          (a, b) =>
            b.strength - a.strength ||
            b.reputation - a.reputation ||
            a.shortName.localeCompare(b.shortName),
        )
        .slice(0, 20),
    [],
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
  const swapPlayerIds = (firstId: string, nextId: string) => {
    if (!firstId || firstId === nextId) return;
    const starters = state.starters.map((id) =>
      id === firstId ? nextId : id === nextId ? firstId : id,
    );
    const bench = state.bench.map((id) =>
      id === firstId ? nextId : id === nextId ? firstId : id,
    );
    const aRelated =
      state.starters.includes(firstId) || state.bench.includes(firstId);
    const bRelated =
      state.starters.includes(nextId) || state.bench.includes(nextId);
    if (aRelated !== bRelated) {
      if (state.starters.includes(firstId))
        starters[state.starters.indexOf(firstId)] = nextId;
      else if (state.bench.includes(firstId))
        bench[state.bench.indexOf(firstId)] = nextId;
      else if (state.starters.includes(nextId))
        starters[state.starters.indexOf(nextId)] = firstId;
      else if (state.bench.includes(nextId))
        bench[state.bench.indexOf(nextId)] = firstId;
    }
    setState(setManagerLineup(state, starters, bench));
    setSelectedPlayer("");
    setDraggedPlayer("");
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
    swapPlayerIds(selectedPlayer, nextId);
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
                onClick={() => setState(hireManagerAtClub(state, item.id))}
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
              Abrir calendário da temporada <span>→</span>
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
            <strong>
              {state.pendingMatch?.stageName ?? "Temporada"} · JOGO{" "}
              {state.pendingMatch?.order ?? 1}/{state.pendingMatch?.total ?? 1}
            </strong>
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
        draggable
        data-player-id={id}
        className={`${styles.rosterPlayer} ${styles[area]} ${selectedPlayer === id ? styles.selectedPlayer : ""}`}
        onClick={() => {
          if (suppressRosterClick.current) {
            suppressRosterClick.current = false;
            return;
          }
          swapPlayers(id);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") setDraggedPlayer(id);
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "mouse" || !draggedPlayer) return;
          const target = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>("[data-player-id]");
          const targetId = target?.dataset.playerId ?? "";
          if (targetId && targetId !== draggedPlayer) {
            suppressRosterClick.current = true;
            swapPlayerIds(draggedPlayer, targetId);
          } else {
            setDraggedPlayer("");
          }
        }}
        onPointerCancel={() => setDraggedPlayer("")}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", id);
          setDraggedPlayer(id);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceId =
            event.dataTransfer.getData("text/plain") || draggedPlayer;
          swapPlayerIds(sourceId, id);
        }}
        onDragEnd={() => setDraggedPlayer("")}
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
            <h2>Prepare a próxima partida.</h2>
            <p>
              O desenho posiciona os cinco na mesa. Escalação e trocas ficam na
              aba Time.
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
                <small>
                  {state.pendingMatch?.competitionName} ·{" "}
                  {state.pendingMatch?.stageName}
                </small>
              </div>
              <div className={styles.competitionRail}>
                {[...state.seasonMatches]
                  .slice()
                  .reverse()
                  .map((match) => (
                    <span key={match.id} className={styles.playedMatch}>
                      <b>{match.score}</b>
                      <small>{match.competitionName}</small>
                    </span>
                  ))}
                {state.matchQueue.map((match) => (
                  <span
                    key={match.id}
                    className={
                      match.id === state.pendingMatch?.id
                        ? styles.nextMatch
                        : ""
                    }
                  >
                    <b>{match.order}</b>
                    <small>{match.competitionName}</small>
                  </span>
                ))}
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
                : "Arraste um atleta para outra posição ou toque em dois nomes para trocar."}
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
            </aside>
          </div>
        </div>
      );
    if (tab === "history")
      return (
        <div
          className={`panel-screen screen-enter ${timelineStyles.page} ${styles.managerTimeline}`}
        >
          <header className={timelineStyles.heading}>
            <span>HISTÓRICO</span>
            <strong>A carreira, ano a ano.</strong>
          </header>
          <section className={timelineStyles.timeline}>
            <article
              className={`${timelineStyles.row} ${timelineStyles.current}`}
            >
              <time>AGORA</time>
              <span className={timelineStyles.rail}>
                <i />
              </span>
              <ClubBadge club={club} size="sm" />
              <div className={timelineStyles.copy}>
                <small>
                  {state.season} · {state.age} anos
                </small>
                <strong>{club.shortName}</strong>
                <p>
                  {state.seasonMatches.length}J ·{" "}
                  {
                    state.seasonMatches.filter(
                      (match) => match.outcome === "win",
                    ).length
                  }
                  V · confiança {Math.round(state.boardTrust)}%
                </p>
              </div>
              <b className={timelineStyles.ovr}>
                {squadOverall}
                <small>TIME</small>
              </b>
            </article>

            {state.seasonHistory
              .slice()
              .reverse()
              .map((record) => {
                const recordClub =
                  CLUBS.find((candidate) => candidate.id === record.clubId) ??
                  club;
                const originalIndex = state.seasonHistory.findIndex(
                  (candidate) =>
                    candidate.season === record.season &&
                    candidate.clubId === record.clubId,
                );
                const previous =
                  originalIndex > 0
                    ? state.seasonHistory[originalIndex - 1]
                    : null;
                const highlights = [
                  previous && previous.clubId !== record.clubId
                    ? "NOVO CLUBE"
                    : "",
                  ...record.competitions
                    .filter((competition) => competition.champion)
                    .map((competition) => competition.name),
                ]
                  .filter(Boolean)
                  .slice(0, 3);
                return (
                  <article
                    className={timelineStyles.row}
                    key={`${record.season}-${record.clubId}`}
                  >
                    <time>{record.season}</time>
                    <span className={timelineStyles.rail}>
                      <i />
                    </span>
                    <ClubBadge club={recordClub} size="sm" />
                    <div className={timelineStyles.copy}>
                      <small>{record.age} anos</small>
                      <strong>{recordClub.shortName}</strong>
                      <p>
                        {record.matches}J · {record.wins}V · {record.draws}E ·{" "}
                        {record.losses}D · {record.goalsFor}–
                        {record.goalsAgainst} gols
                      </p>
                      {highlights.length ? (
                        <div className={timelineStyles.highlights}>
                          {highlights.map((highlight) => (
                            <span key={highlight}>{highlight}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <b className={timelineStyles.ovr}>
                      {record.squadOverall}
                      <small>TIME</small>
                    </b>
                  </article>
                );
              })}
            {!state.seasonHistory.length ? (
              <div className={timelineStyles.empty}>
                A primeira temporada abre a linha do tempo do seu trabalho.
              </div>
            ) : null}
          </section>
        </div>
      );
    if (tab === "stats")
      return (
        <div className={`panel-screen ${styles.panel}`}>
          <header className={styles.panelHeading}>
            <span>ESTATÍSTICAS</span>
            <h2>O retrato do seu trabalho.</h2>
            <p>
              Campanha coletiva, desempenho por temporada e produção real dos
              oito atletas.
            </p>
          </header>
          <div className={styles.managerStatHero}>
            <div>
              <small>JOGOS</small>
              <strong>{state.history.length}</strong>
              <span>{state.seasonHistory.length} temporada(s)</span>
            </div>
            <div>
              <small>APROVEITAMENTO</small>
              <strong>
                {state.history.length
                  ? Math.round((wins / state.history.length) * 100)
                  : 0}
                <em>%</em>
              </strong>
              <span>{wins} vitória(s)</span>
            </div>
            <div>
              <small>SALDO DE GOLS</small>
              <strong>{goalsFor - goalsAgainst}</strong>
              <span>
                {goalsFor} pró · {goalsAgainst} contra
              </span>
            </div>
            <div>
              <small>TÍTULOS</small>
              <strong>
                {state.seasonHistory.reduce(
                  (total, seasonRecord) =>
                    total +
                    seasonRecord.competitions.filter(
                      (competition) => competition.champion,
                    ).length,
                  0,
                )}
              </strong>
              <span>pelo time inteiro</span>
            </div>
          </div>
          <div className={styles.managerStatsGrid}>
            <article className={styles.squadProduction}>
              <header>
                <span>
                  <small>PRODUÇÃO DO ELENCO</small>
                  <strong>Os oito sob seu comando</strong>
                </span>
                <div aria-hidden="true">
                  <b>J</b>
                  <b>G</b>
                  <b>A</b>
                </div>
              </header>
              <div>
                {playerStatsRows.map(({ player, stats }) => (
                  <article key={player.id}>
                    <PlayerPortrait player={player} state={state} size={36} />
                    <span>
                      <strong>{player.name}</strong>
                      <small>
                        {player.position} · {stats.starts} titular ·{" "}
                        {stats.substitutionsIn} entrou
                      </small>
                    </span>
                    <div>
                      <b>{stats.appearances}</b>
                      <b>{stats.goals}</b>
                      <b>{stats.assists}</b>
                    </div>
                  </article>
                ))}
              </div>
            </article>
            <div className={styles.statsSide}>
              <article className={styles.seasonTrend}>
                <header>
                  <small>TEMPORADAS</small>
                  <strong>Confiança ao fim do ano</strong>
                </header>
                <div>
                  {state.seasonHistory.length ? (
                    state.seasonHistory.slice(-8).map((record) => (
                      <span key={`${record.season}-${record.clubId}`}>
                        <b>{record.boardTrust}</b>
                        <i>
                          <em style={{ height: `${record.boardTrust}%` }} />
                        </i>
                        <small>{String(record.season).slice(-2)}</small>
                      </span>
                    ))
                  ) : (
                    <p>A primeira temporada criará a curva do trabalho.</p>
                  )}
                </div>
              </article>
              <article className={styles.formationReport}>
                <header>
                  <small>FORMAÇÕES</small>
                  <strong>Desenhos mais usados</strong>
                </header>
                <div>
                  {formationUsage.length ? (
                    formationUsage.map(([id, count]) => (
                      <p key={id}>
                        <span>
                          <strong>{formationById(id).name}</strong>
                          <small>{formationById(id).shape}</small>
                        </span>
                        <b>{count}×</b>
                      </p>
                    ))
                  ) : (
                    <p>A estreia registrará seu primeiro desenho.</p>
                  )}
                </div>
              </article>
            </div>
          </div>
        </div>
      );
    if (tab === "world")
      return (
        <div className={`panel-screen screen-enter ${worldStyles.page}`}>
          <header className={worldStyles.heading}>
            <span>MUNDO</span>
            <strong>O futebol continua.</strong>
            <p>Escolha o que quer acompanhar.</p>
          </header>
          <nav className={worldStyles.sectionNav} aria-label="Seções do Mundo">
            {(
              [
                ["now", "Agora", "Notícias", "news"],
                ["clubs", "Clubes", "Ranking", "trophy"],
                ["players", "Jogadores", "Líderes", "player"],
                ["archive", "Arquivo", "Temporadas", "history"],
              ] as Array<[ManagerWorldSection, string, string, FutboboIconName]>
            ).map(([id, label, hint, icon]) => (
              <button
                type="button"
                key={id}
                className={worldSection === id ? worldStyles.activeSection : ""}
                aria-pressed={worldSection === id}
                onClick={() => setWorldSection(id)}
              >
                <FutboboIcon name={icon} />
                <span>
                  <small>{hint}</small>
                  <strong>{label}</strong>
                </span>
              </button>
            ))}
          </nav>

          {worldSection === "now" ? (
            <>
              <article
                className={`${worldStyles.featured} ${worldStyles.major}`}
              >
                <small>MUNDO · {state.season}</small>
                <strong>
                  {state.pendingMatch
                    ? `${club.shortName} prepara ${state.pendingMatch.competitionName}`
                    : `${club.shortName} fecha a temporada`}
                </strong>
                <p>
                  {state.pendingMatch
                    ? `${state.pendingMatch.stageName} contra ${opponent?.shortName ?? "adversário a definir"}. É a partida ${state.pendingMatch.order} de ${state.pendingMatch.total} do calendário decisivo.`
                    : `O trabalho de ${state.name} terminou o ano com ${Math.round(state.boardTrust)}% de confiança.`}
                </p>
              </article>
              {marketOffers.length ? (
                <article className={styles.market}>
                  <header>
                    <span>OBSERVAÇÃO DO ELENCO</span>
                    <strong>Três nomes disponíveis.</strong>
                    <small>
                      Contratar troca diretamente o reserva de menor OVR.
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
                        <PlayerPortrait
                          player={player}
                          state={state}
                          size={42}
                        />
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
              <section className={worldStyles.newsSection}>
                <header>
                  <span>GIRO DO MUNDO</span>
                  <small>Carreira de técnico</small>
                </header>
                <div>
                  {state.history.slice(0, 12).map((item) => {
                    const itemClub =
                      CLUBS.find((candidate) => candidate.id === item.clubId) ??
                      club;
                    const rival = CLUBS.find(
                      (candidate) => candidate.id === item.opponentId,
                    );
                    return (
                      <article key={item.id}>
                        <time>{item.season}</time>
                        <span>
                          <small>{item.competitionName}</small>
                          <strong>
                            {itemClub.shortName} {item.score}{" "}
                            {rival?.shortName ?? "Adversário"}
                          </strong>
                          <p>
                            {resultLabel(item.outcome)} ·{" "}
                            {formationById(item.formationId).name}
                          </p>
                        </span>
                        {item.outcome === "win" ? <b>●</b> : null}
                      </article>
                    );
                  })}
                  {!state.history.length ? (
                    <div className={worldStyles.empty}>
                      <strong>O noticiário está esperando a estreia.</strong>
                      <span>A primeira partida abrirá o giro do mundo.</span>
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}

          {worldSection === "clubs" ? (
            <section className={worldStyles.sectionStack}>
              <header>
                <small>CLUBES</small>
                <strong>Forças do futebol mundial</strong>
                <p>Seu clube aparece destacado no ranking.</p>
              </header>
              <article className={worldStyles.playerBoard}>
                <header>
                  <span>
                    <small>RANKING DE CLUBES</small>
                    <strong>Potência atual</strong>
                  </span>
                  <b>{worldClubs.length}</b>
                </header>
                <div>
                  {worldClubs.map((rankedClub, index) => (
                    <p
                      key={rankedClub.id}
                      className={
                        rankedClub.id === club.id
                          ? worldStyles.protagonistRow
                          : ""
                      }
                    >
                      <b>#{index + 1}</b>
                      <strong>
                        {rankedClub.shortName}
                        {rankedClub.id === club.id ? <i> SEU TIME</i> : null}
                      </strong>
                      <small>
                        {
                          LEAGUES.find(
                            (league) => league.id === rankedClub.leagueId,
                          )?.name
                        }
                      </small>
                      <span>{rankedClub.strength} FOR</span>
                    </p>
                  ))}
                </div>
              </article>
            </section>
          ) : null}

          {worldSection === "players" ? (
            <section className={worldStyles.sectionStack}>
              <header>
                <small>JOGADORES</small>
                <strong>Quem está deixando marca</strong>
                <p>Os principais nomes do universo persistente.</p>
              </header>
              <div className={worldStyles.playerGrid}>
                <article className={worldStyles.playerBoard}>
                  <header>
                    <span>
                      <small>NÍVEL ATUAL</small>
                      <strong>Craques da geração</strong>
                    </span>
                    <b>{worldLeaders.length}</b>
                  </header>
                  <div>
                    {worldLeaders.map((player, index) => (
                      <p key={player.id}>
                        <b>#{index + 1}</b>
                        <strong>{player.name}</strong>
                        <small>
                          {
                            CLUBS.find(
                              (item) => item.id === player.currentClubId,
                            )?.shortName
                          }
                        </small>
                        <span>{player.overall} OVR</span>
                      </p>
                    ))}
                  </div>
                </article>
                <article className={worldStyles.playerBoard}>
                  <header>
                    <span>
                      <small>REPUTAÇÃO</small>
                      <strong>Nomes mais influentes</strong>
                    </span>
                    <b>{worldLeaders.length}</b>
                  </header>
                  <div>
                    {worldLeaders
                      .slice()
                      .sort(
                        (a, b) =>
                          b.reputation - a.reputation || b.overall - a.overall,
                      )
                      .map((player, index) => (
                        <p key={player.id}>
                          <b>#{index + 1}</b>
                          <strong>{player.name}</strong>
                          <small>{player.position}</small>
                          <span>{player.reputation} REP</span>
                        </p>
                      ))}
                  </div>
                </article>
              </div>
            </section>
          ) : null}

          {worldSection === "archive" ? (
            <section className={worldStyles.officialSection}>
              <header>
                <span>ARQUIVO VIVO</span>
                <small>Campanhas do seu trabalho</small>
              </header>
              <div>
                {state.seasonHistory
                  .slice()
                  .reverse()
                  .map((record) => {
                    const recordClub =
                      CLUBS.find(
                        (candidate) => candidate.id === record.clubId,
                      ) ?? club;
                    return (
                      <article
                        className={worldStyles.officialCard}
                        key={`${record.season}-${record.clubId}`}
                      >
                        <button type="button">
                          <span>
                            <small>
                              {record.season} · {record.age} ANOS
                            </small>
                            <strong>{recordClub.shortName}</strong>
                            <em>
                              {record.matches}J · {record.wins}V ·{" "}
                              {record.goalsFor}–{record.goalsAgainst} ·{" "}
                              {record.competitions
                                .filter((competition) => competition.champion)
                                .map((competition) => competition.name)
                                .join(", ") || "sem títulos"}
                            </em>
                          </span>
                          <b>{record.boardTrust}</b>
                        </button>
                      </article>
                    );
                  })}
                {!state.seasonHistory.length ? (
                  <div className={worldStyles.empty}>
                    <strong>O arquivo ainda está em branco.</strong>
                    <span>Conclua a primeira temporada.</span>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
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
              <strong>{state.age}</strong>
              <span>ANOS</span>
            </div>
            <div className="player-identity">
              <span>
                <small>CONFIANÇA</small>
                <strong>{Math.round(state.boardTrust)}</strong>
              </span>
              <div className="mini-avatar">
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
            <h1>
              {latestSeason?.competitions.some(
                (competition) => competition.champion,
              )
                ? "Uma temporada com taça."
                : "A temporada está encerrada."}
            </h1>
            <p>
              {latestSeason
                ? `${latestSeason.matches} partidas decisivas, ${latestSeason.wins} vitórias e saldo de ${latestSeason.goalsFor - latestSeason.goalsAgainst} gols.`
                : `${state.lastResult.goalsFor} × ${state.lastResult.goalsAgainst} na última partida.`}{" "}
              A diretoria fecha o ano com {Math.round(state.boardTrust)}% de
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
                <span>VITÓRIAS</span>
                <strong>{latestSeason?.wins ?? 0}</strong>
              </div>
              <div className="metric">
                <span>ORÇAMENTO</span>
                <strong>{money(state.budget)}</strong>
              </div>
            </div>
            {latestSeason ? (
              <div className={styles.resultCompetitions}>
                {latestSeason.competitions.map((competition) => (
                  <article
                    key={competition.id}
                    className={competition.champion ? styles.champion : ""}
                  >
                    <FutboboIcon
                      name={competition.champion ? "trophy" : "history"}
                    />
                    <span>
                      <strong>{competition.name}</strong>
                      <small>{competition.stage}</small>
                    </span>
                  </article>
                ))}
              </div>
            ) : null}
            {jobOffers.length ? (
              <article className={styles.jobs}>
                <span>PROPOSTAS AO TÉCNICO</span>
                <strong>Outros clubes querem contratar você.</strong>
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
            <strong>{state.age}</strong>
            <span>ANOS</span>
          </div>
          <div className="player-identity">
            <span>
              <small>CONFIANÇA</small>
              <strong>{Math.round(state.boardTrust)}</strong>
            </span>
            <div className="mini-avatar">
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
            <BrandMark size="sm" />
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

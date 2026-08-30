"use client";

import { useEffect, useMemo, useState } from "react";
import { CLUBS, COUNTRIES } from "../../game-data";
import { SAVE_KEY } from "../../career/state";
import { randomPlayerAppearance, teamKitPattern } from "../../player-appearance";
import {
  acceptManagerJobOffer,
  applyManagerMatchResult,
  continueManagerSeason,
  createManagerState,
  dismissManagerJobOffers,
  managerClub,
  managerJobOffers,
  managerMatchSetup,
  managerMarketOffers,
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
import { getActiveCareerId, readCareerSlotState, syncActiveCareerSlot } from "../../career/save-system";
import { BOTAO_FORMATIONS } from "../../botao/formations";
import { hashSeed } from "../../botao/rng";
import BotaoMatch from "../../botao/BotaoMatch";
import { simulateBotaoMatch } from "../../botao/simulate";
import type { BotaoMatchResult } from "../../botao/types";
import { ClubBadge } from "../career/CareerPrimitives";
import { PlayerAppearancePortrait } from "../../PlayerAppearanceEditor";
import styles from "./ManagerGame.module.css";

type ManagerTab = "career" | "board" | "team" | "history" | "stats" | "world";

function PlayerPortrait({ player, state, size = 42 }: { player: ManagerState["worldPlayers"]["players"][string]; state: ManagerState; size?: number }) {
  const appearance = useMemo(
    () => ({ ...randomPlayerAppearance(hashSeed(state.seed, player.id)), kitPattern: teamKitPattern(state.seed, state.currentClubId) }),
    [player.id, state.currentClubId, state.seed],
  );
  const club = managerClub(state);
  return <span className={styles.playerPortrait} style={{ width: size, height: size }}><PlayerAppearancePortrait appearance={appearance} primary={club.primary} secondary={club.secondary} size={size} frame="compact" label={`Retrato de ${player.name}`} /></span>;
}

function money(value: number) {
  if (value >= 1_000_000) return "€" + (value / 1_000_000).toFixed(1).replace(".", ",") + " mi";
  return "€" + Math.round(value / 1000) + " mil";
}

function resultLabel(outcome: "win" | "loss" | "draw") {
  return outcome === "win" ? "VITÓRIA" : outcome === "loss" ? "DERROTA" : "EMPATE";
}

function resultClass(outcome: "win" | "loss" | "draw") {
  return outcome === "win" ? styles.good : outcome === "loss" ? styles.bad : styles.neutral;
}

function loadManagerState() {
  if (typeof window === "undefined") return createManagerState(1);
  const activeId = getActiveCareerId();
  const saved = activeId ? readCareerSlotState(activeId) : null;
  return saved && "mode" in saved && saved.mode === "manager" ? normalizeManagerState(saved) : createManagerState();
}

export default function ManagerGame({ onExit }: { onExit?: () => void }) {
  const [state, setState] = useState<ManagerState>(() => createManagerState(1));
  const [tab, setTab] = useState<ManagerTab>("career");
  const [matchSetup, setMatchSetup] = useState<NonNullable<ReturnType<typeof managerMatchSetup>>["setup"] | null>(null);
  const [selectedStarter, setSelectedStarter] = useState("");
  const [managerName, setManagerName] = useState("");
  const [nationality, setNationality] = useState("brasil");
  const [clubId, setClubId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const initial = loadManagerState();
    window.setTimeout(() => setState(initial), 0);
  }, []);

  useEffect(() => {
    if (!state) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    syncActiveCareerSlot();
  }, [state]);

  const club = managerClub(state);
  const opponent = managerOpponent(state);
  const squad = useMemo(() => managerSquad(state), [state]);
  const marketOffers = useMemo(() => managerMarketOffers(state), [state]);
  const jobOffers = useMemo(() => {
    const coherent = new Set(managerJobOffers(state).map((item) => item.id));
    return state.jobOffers.map((id) => CLUBS.find((item) => item.id === id)).filter((item): item is (typeof CLUBS)[number] => Boolean(item && coherent.has(item.id)));
  }, [state]);
  const playerById = useMemo(() => new Map(squad.map((player) => [player.id, player])), [squad]);
  const wins = state?.history.filter((item) => item.outcome === "win").length ?? 0;
  const goalsFor = state?.history.reduce((sum, item) => sum + Number(item.score.split("×")[0] || 0), 0) ?? 0;
  const goalsAgainst = state?.history.reduce((sum, item) => sum + Number(item.score.split("×")[1] || 0), 0) ?? 0;
  const playerStatsRows = useMemo(() => Object.entries(state.playerStats)
    .map(([id, stats]) => ({ player: state.worldPlayers.players[id], stats }))
    .filter((item): item is { player: NonNullable<typeof item.player>; stats: typeof item.stats } => Boolean(item.player && item.stats.appearances > 0))
    .sort((a, b) => (b.stats.goals + b.stats.assists) - (a.stats.goals + a.stats.assists) || b.stats.appearances - a.stats.appearances)
    .slice(0, 8), [state]);
  const formationUsage = useMemo(() => Object.entries(state.history.reduce<Record<string, number>>((counts, item) => {
    counts[item.formationId] = (counts[item.formationId] ?? 0) + 1;
    return counts;
  }, {})).sort(([, a], [, b]) => b - a).slice(0, 3), [state.history]);

  const start = () => {
    const selectedClub = clubId || state.currentClubId || CLUBS[0]?.id || "";
    if (!selectedClub) return;
    setState(startManagerCareer(state, { name: managerName || state.name, nationality, clubId: selectedClub }));
    setTab("career");
    setNotice("Contrato assinado. A prancheta está nas suas mãos.");
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

  const completeResult = (baseState: ManagerState, setup: NonNullable<ReturnType<typeof managerMatchSetup>>["setup"], result: BotaoMatchResult) => {
    const currentRoster = setup.managerRosters?.user;
    const starters = currentRoster?.starters.map((player) => player.id).filter((id): id is string => Boolean(id)) ?? baseState.starters;
    const benchIds = baseState.squadIds.filter((id) => !starters.includes(id)).slice(0, 3);
    const withLineup = setManagerLineup(baseState, starters, benchIds);
    const applied = applyManagerMatchResult(withLineup, result);
    setState(applied.phase === "dismissed" ? applied : continueManagerSeason(applied));
    setMatchSetup(null);
    setTab("career");
    setNotice(result.outcome === "win" ? "A diretoria gostou. O vestiário comprou a ideia." : result.outcome === "loss" ? "A pressão subiu. A próxima escolha pesa mais." : "Um ponto e uma nova chance no próximo jogo.");
  };

  const restartAfterDismissal = (nextClubId: string) => {
    const restarted = startManagerCareer({ ...createManagerState(state.seed), name: state.name, nationality: state.nationality }, { name: state.name, nationality: state.nationality, clubId: nextClubId });
    setState({ ...restarted, reputation: Math.max(30, state.reputation), boardTrust: 58 });
  };

  const finishMatch = (result: BotaoMatchResult) => {
    if (!matchSetup) return;
    completeResult(state, matchSetup, result);
  };

  if (matchSetup) {
    return <div className={styles.matchHost}><button type="button" className={styles.matchBack} onClick={() => setMatchSetup(null)}>← Prancheta</button><BotaoMatch setup={matchSetup} onFinish={finishMatch} /></div>;
  }
  if (state.phase === "onboarding") {
    return (
      <main className={styles.managerRoot}>
        <header className={styles.topbar}><span className={styles.eyebrow}>MODO TÉCNICO</span>{onExit ? <button type="button" onClick={onExit}>Menu principal</button> : null}</header>
        <section className={styles.onboarding}><div className={styles.kicker}>CARREIRA DE TÉCNICO</div><h1>O time é seu.<br /><em>A mesa também.</em></h1><p>Escolha um clube, monte os cinco da partida e viva o jogo-chave. Só o que acontece na mesa muda a história.</p><div className={styles.formGrid}><label><span>Seu nome</span><input value={managerName || state.name} onChange={(event) => setManagerName(event.target.value)} placeholder="Como a torcida vai chamar você?" /></label><label><span>Nacionalidade</span><select value={nationality || state.nationality} onChange={(event) => setNationality(event.target.value)}>{COUNTRIES.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label><label className={styles.clubField}><span>Primeiro clube</span><select value={clubId || state.currentClubId || CLUBS[0]?.id} onChange={(event) => setClubId(event.target.value)}>{CLUBS.map((item) => <option key={item.id} value={item.id}>{item.name} · força {item.strength}</option>)}</select></label></div><button type="button" className={styles.primary} onClick={start}>Assinar contrato <span>→</span></button></section>
      </main>
    );
  }

  if (state.phase === "dismissed") {
    return <main className={styles.managerRoot}><header className={styles.topbar}><span className={styles.eyebrow}>MODO TÉCNICO</span>{onExit ? <button type="button" onClick={onExit}>Menu principal</button> : null}</header><section className={styles.emptyState}><span className={styles.kicker}>FIM DE CICLO</span><h1>A diretoria encerrou o projeto.</h1><p>Escolha outro clube para tentar de novo. Sua reputação viaja com você.</p><div className={styles.clubQuickGrid}>{CLUBS.slice(0, 12).map((item) => <button type="button" key={item.id} onClick={() => restartAfterDismissal(item.id)}>{item.shortName}</button>)}</div></section></main>;
  }

  const navItems: Array<[ManagerTab, string, string]> = [["career", "Carreira", "⌂"], ["board", "Prancheta", "＋"], ["team", "Time", "♙"], ["history", "Histórico", "↺"], ["stats", "Estatísticas", "▥"], ["world", "Mundo", "◎"]];
  const primaryAction = opponent ? "Jogar contra " + opponent.shortName : "Jogar jogo-chave";

  return (
    <main className={styles.managerRoot}>
      <header className={styles.topbar}><div className={styles.brand}><span className={styles.brandDot} /><strong>FUTBOBO</strong><span>/ TÉCNICO</span></div><div className={styles.topbarActions}><span>{state.season}</span>{onExit ? <button type="button" onClick={onExit}>Menu principal</button> : null}</div></header>
      <section className={styles.clubHeader}><div className={styles.clubIdentity}><ClubBadge club={club} size="md" /><div><span className={styles.kicker}>SUA PRANCHETA</span><h1>{club.shortName}</h1><p>{club.name} · {club.city}</p></div></div><div className={styles.headerMetrics}><div><span>CONFIANÇA</span><strong>{Math.round(state.boardTrust)}</strong><i><b style={{ width: String(state.boardTrust) + "%" }} /></i></div><div><span>REPUTAÇÃO</span><strong>{Math.round(state.reputation)}</strong></div><div><span>CAIXA</span><strong>{money(state.budget)}</strong></div></div></section>
      {notice ? <button type="button" className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button> : null}

      {tab === "career" ? <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>TEMPORADA {state.season}</span><h2>O próximo lance define o tom.</h2><p>{state.objective}</p></div><div className={styles.statPill}><strong>{wins}</strong><span>vitórias</span></div></div>{state.lastResult ? <article className={styles.lastResult}><div><span className={styles.kicker}>ÚLTIMO JOGO</span><strong className={resultClass(state.lastResult.outcome)}>{resultLabel(state.lastResult.outcome)}</strong><p>{state.lastResult.goalsFor} × {state.lastResult.goalsAgainst} · {state.lastResult.substitutions} troca(s)</p></div><span className={styles.resultArrow}>↗</span></article> : null}<article className={styles.matchCard}><div className={styles.matchCardTop}><span className={styles.kicker}>{state.pendingMatch?.competitionName ?? "JOGO-CHAVE"}</span><span>{state.pendingMatch?.stageName ?? "Preparação"}</span></div><div className={styles.matchup}><div><ClubBadge club={club} size="sm" /><strong>{club.shortName}</strong></div><span>×</span><div><ClubBadge club={opponent ?? club} size="sm" /><strong>{opponent?.shortName ?? "adversário"}</strong></div></div><button type="button" className={styles.primary} onClick={openMatch}>{primaryAction} <span>→</span></button><button type="button" className={styles.secondary} onClick={() => { const prepared = managerMatchSetup(state); if (!prepared) { setNotice("Escolha cinco titulares e três reservas antes da partida."); setTab("team"); return; } const result = simulateBotaoMatch(prepared.setup); completeResult(prepared.state, prepared.setup, result); }}>Simular partida <small>usa a mesma mesa e a mesma IA</small></button></article>{marketOffers.length > 0 ? <article className={styles.decisionCard}><div><span className={styles.kicker}>DECISÃO PENDENTE</span><strong>Há três nomes na janela.</strong><small>Veja as opções quando quiser; a partida não fica bloqueada.</small></div><button type="button" onClick={() => setTab("world")}>Abrir mercado <span>→</span></button></article> : null}{jobOffers.length > 0 ? <article className={styles.jobCard}><div><span className={styles.kicker}>CONVITES DE TRABALHO</span><strong>A sua reputação abriu outras portas.</strong><small>Você pode aceitar agora ou continuar no {club.shortName}.</small></div><div className={styles.jobOfferList}>{jobOffers.map((offer) => <button type="button" key={offer.id} onClick={() => { setState(acceptManagerJobOffer(state, offer.id)); setNotice("Contrato assinado com o " + offer.shortName + "."); }}><ClubBadge club={offer} size="sm" /><span><strong>{offer.shortName}</strong><small>força {offer.strength}</small></span><b>→</b></button>)}<button type="button" className={styles.jobDecline} onClick={() => setState(dismissManagerJobOffers(state))}>Continuar aqui <span>×</span></button></div></article> : null}<div className={styles.quickLinks}><button type="button" onClick={() => setTab("board")}><span>＋</span><strong>Trocar formação</strong><small>{BOTAO_FORMATIONS.find((formation) => formation.id === state.formationId)?.name}</small></button><button type="button" onClick={() => setTab("team")}><span>♙</span><strong>Escalação</strong><small>5 titulares · {state.bench.length} reservas</small></button><button type="button" onClick={() => setTab("world")}><span>◎</span><strong>Mercado</strong><small>Elenco de {state.squadIds.length}</small></button></div></section> : null}

      {tab === "board" ? <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>PRANCHETA</span><h2>Escolha como os cinco ocupam a mesa.</h2><p>A formação fica até você mudar. Cada desenho abre um risco diferente.</p></div></div>{opponent ? <div className={styles.boardContext}><div><span className={styles.kicker}>JOGO-CHAVE</span><strong>{club.shortName} × {opponent.shortName}</strong></div><span>Força {opponent.strength} · {BOTAO_FORMATIONS.find((formation) => formation.id === state.formationId)?.name ?? "formação"} em uso</span></div> : null}<div className={styles.formationGrid}>{BOTAO_FORMATIONS.map((formation) => <button type="button" key={formation.id} className={styles.formationCard + (state.formationId === formation.id ? " " + styles.formationActive : "")} onClick={() => setState(setManagerFormation(state, formation.id))}><span>{formation.shape}</span><strong>{formation.name}</strong><small>{formation.hint}</small></button>)}</div><div className={styles.tip}>A formação escolhida aparece no campo e não gira sozinha depois de gol ou intervalo.</div></section> : null}

      {tab === "team" ? <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>ESCALAÇÃO</span><h2>Os cinco da partida.</h2><p>Toque em um titular e depois em um reserva para trocar. A alteração fica salva para o próximo jogo.</p></div><div className={styles.statPill}><strong>5</strong><span>botões</span></div></div><div className={styles.pitch}><div className={styles.pitchLines} />{state.starters.map((id) => { const player = playerById.get(id); if (!player) return null; return <button type="button" key={id} className={styles.pitchPlayer + (selectedStarter === id ? " " + styles.selectedPlayer : "")} onClick={() => setSelectedStarter(selectedStarter === id ? "" : id)}><PlayerPortrait player={player} state={state} size={50} /><small>{player.position}</small><strong>{player.name}</strong><b>{player.overall}</b><em>{state.season - player.birthSeason} anos</em></button>; })}</div><div className={styles.benchHeading}><span>RESERVAS</span><small>{selectedStarter ? "Escolha quem entra no lugar do titular selecionado." : "Três opções para a partida."}</small></div><div className={styles.benchGrid}>{state.bench.map((id) => { const player = playerById.get(id); if (!player) return null; return <button type="button" key={id} className={styles.benchPlayer} onClick={() => { if (!selectedStarter) { setNotice("Selecione primeiro um titular."); return; } const nextStarters = state.starters.map((item) => item === selectedStarter ? id : item); const nextBench = state.bench.map((item) => item === id ? selectedStarter : item); setState(setManagerLineup(state, nextStarters, nextBench)); setSelectedStarter(""); }}><PlayerPortrait player={player} state={state} size={42} /><span><strong>{player.name}</strong><small>{player.position} · {state.season - player.birthSeason} anos · {player.overall} OVR</small></span><b>+</b></button>; })}</div><div className={styles.squadList}><span className={styles.kicker}>ELENCO</span>{state.squadIds.filter((id) => !state.starters.includes(id) && !state.bench.includes(id)).map((id) => { const player = playerById.get(id); return player ? <div key={id}><PlayerPortrait player={player} state={state} size={34} /><strong>{player.name}</strong><small>{player.position} · {state.season - player.birthSeason} anos</small><b>{player.overall}</b></div> : null; })}</div></section> : null}

      {tab === "history" ? <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>HISTÓRICO</span><h2>Cada jogo deixa uma marca.</h2><p>Resultados curtos, legíveis e ligados às escolhas da prancheta.</p></div></div><div className={styles.historyList}>{state.history.length === 0 ? <div className={styles.emptyInline}>Sua primeira partida ainda está esperando.</div> : state.history.map((item) => { const rival = CLUBS.find((candidate) => candidate.id === item.opponentId); return <article key={item.id}><span>{item.season}</span><div><strong>{rival?.shortName ?? "Adversário"}</strong><small>{item.competitionName} · {item.formationId}</small></div><b className={resultClass(item.outcome)}>{item.score}<small>{resultLabel(item.outcome)}</small></b></article>; })}</div></section> : null}

      {tab === "stats" ? <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>ESTATÍSTICAS</span><h2>O que a mesa já contou.</h2><p>Sem planilhas escondidas: só os números que ajudam a próxima decisão.</p></div></div><div className={styles.bigStats}><div><strong>{state.history.length}</strong><span>jogos-chave</span></div><div><strong>{wins}</strong><span>vitórias</span></div><div><strong>{goalsFor}</strong><span>gols marcados</span></div><div><strong>{goalsAgainst}</strong><span>gols sofridos</span></div></div>{playerStatsRows.length > 0 ? <div className={styles.statTables}><article><span className={styles.kicker}>JOGADORES</span>{playerStatsRows.map(({ player, stats }) => <div key={player.id}><PlayerPortrait player={player} state={state} size={32} /><span><strong>{player.name}</strong><small>{player.position} · {stats.appearances} partida(s) · {stats.distance}u movidas</small></span><b>{stats.goals}G · {stats.assists}A</b></div>)}</article><article><span className={styles.kicker}>FORMAÇÕES</span>{formationUsage.length > 0 ? formationUsage.map(([formationId, count]) => <div key={formationId}><span><strong>{BOTAO_FORMATIONS.find((formation) => formation.id === formationId)?.name ?? formationId}</strong><small>{BOTAO_FORMATIONS.find((formation) => formation.id === formationId)?.shape ?? ""}</small></span><b>{count}x</b></div>) : <p>Nenhum desenho usado ainda.</p>}</article></div> : null}<article className={styles.statNote}><span className={styles.kicker}>REGRA DA MESA</span><strong>Fôlego nasce do movimento.</strong><p>O desgaste conta apenas a distância do botão que você decidiu mover. Colisão e reposição não roubam energia. A troca acontece na sua vez, com a bola parada, e não pode ser desfeita.</p></article></section> : null}

      {tab === "world" ? <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>MUNDO</span><h2>O mercado começa no seu próprio elenco.</h2><p>Quatorze jogadores, cinco lugares e uma temporada para fazer escolhas que cabem no ritmo do Futbobo.</p></div></div>{marketOffers.length > 0 ? <article className={styles.marketStrip}><div><span className={styles.kicker}>JANELA ABERTA</span><strong>Uma carência, três nomes.</strong><small>Contrate uma vez e substitua a opção mais fraca fora da relação.</small></div><div className={styles.marketOffers}>{marketOffers.map((player) => <button type="button" key={player.id} onClick={() => { const next = signManagerPlayer(state, player.id); if (next === state) { setNotice("O caixa não comporta essa contratação."); return; } setState(next); setNotice(player.name + " assinou. O elenco agora tem uma nova opção."); }}><PlayerPortrait player={player} state={state} size={38} /><span><strong>{player.name}</strong><small>{player.position} · {player.overall} OVR</small></span><b>{money(marketFee(player))}</b></button>)}</div></article> : null}<div className={styles.worldGrid}>{squad.slice().sort((a, b) => b.reputation - a.reputation).map((player) => <article key={player.id}><PlayerPortrait player={player} state={state} size={40} /><div><strong>{player.name}</strong><small>{player.position} · {state.season - player.birthSeason} anos</small></div><b>{player.reputation}</b></article>)}</div></section> : null}

      <nav className={styles.bottomNav} aria-label="Menu do técnico">{navItems.map(([id, label, icon]) => <button type="button" key={id} className={tab === id ? styles.navActive : ""} onClick={() => setTab(id)}><span>{icon}</span><small>{label}</small></button>)}</nav>
    </main>
  );
}

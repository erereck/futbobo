"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { countryById } from "../../game-data";
import type { GameState } from "../../career/model";
import { buildDomesticTitleArchive, domesticArchiveClubName, isDomesticArchiveOnlyClub } from "../../career/domestic-title-archive";
import type { DomesticTitleLedger } from "../../career/domestic-title-archive";
import { archiveFootballRankingsForState } from "../../career/official-football-records";
import { historicalRecordBoardsForState } from "../../career/historical-records";
import type { WorldCompetitionLedger } from "../../career/world-memory";
import { buildWorldSnapshot, worldPulseForState } from "../../career/world-memory";
import { worldPlayerTransferLeaders, worldUniverseBallonDorLeaders, worldUniverseGenerationLeaders, worldUniverseStatLeaders } from "../../career/world-player-world";
import { clubById } from "../../career/shared";
import { ClubBadge, NationBadge } from "./CareerPrimitives";
import styles from "./CareerWorld.module.css";
import FutboboIcon from "../FutboboIcon";
import type { FutboboIconName } from "../FutboboIcon";
import ClubDossierPanel from "./ClubDossierPanel";

type WorldSection = "now" | "national" | "clubs" | "players" | "archive";
type CompetitionLedgerView = WorldCompetitionLedger | DomesticTitleLedger;
const CATEGORY_LABELS = { "world-cup": "MUNDIAL", career: "CARREIRA", transfer: "MERCADO", award: "PRÊMIOS", rival: "GERAÇÃO", record: "RECORDE" } as const;
const SECTION_ITEMS: Array<{ id: WorldSection; label: string; hint: string; icon: FutboboIconName }> = [
  { id: "now", label: "Agora", hint: "Notícias", icon: "news" }, { id: "national", label: "Seleções", hint: "Copas", icon: "globe" },
  { id: "clubs", label: "Clubes", hint: "Campeões", icon: "trophy" }, { id: "players", label: "Jogadores", hint: "Líderes", icon: "player" },
  { id: "archive", label: "Arquivo", hint: "Recordes", icon: "history" },
];

function rankingPosition(entries: Array<{ value: number }>, index: number) {
  if (index <= 0) return 1;
  return entries.findIndex((entry) => entry.value === entries[index].value) + 1;
}

export type WorldPulseHeadline = { id: string; title: string };

export function WorldPulseTicker({ headlines, onOpen }: { headlines: WorldPulseHeadline[]; onOpen: () => void }) {
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [tickerMoving, setTickerMoving] = useState(false);
  const headlineKey = headlines.map((headline) => headline.id).join("|");

  useEffect(() => {
    if (headlines.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let swapTimer = 0;
    const interval = window.setInterval(() => {
      setTickerMoving(true);
      swapTimer = window.setTimeout(() => {
        setHeadlineIndex((current) => (current + 1) % headlines.length);
        setTickerMoving(false);
      }, 280);
    }, 3000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(swapTimer);
    };
  }, [headlineKey, headlines.length]);

  if (!headlines.length) return null;
  const current = headlines[headlineIndex % headlines.length];
  const next = headlines[(headlineIndex + 1) % headlines.length];
  return <button type="button" className={styles.pulse} onClick={onOpen} aria-label={`Abrir Mundo: ${current.title}`}>
    <span><i /> MUNDO</span>
    <span className={styles.pulseViewport} aria-live="off">
      <span className={`${styles.pulseTrack} ${tickerMoving ? styles.pulseMoving : ""}`}>
        <strong>{current.title}</strong>
        <strong aria-hidden="true">{next.title}</strong>
      </span>
    </span>
    <b><FutboboIcon name="arrow-right" /></b>
  </button>;
}

export function WorldPulseButton({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const headlines = useMemo<WorldPulseHeadline[]>(() => {
    const news = buildWorldSnapshot(state).news.slice(0, 6).map((item) => ({ id: item.id, title: item.title }));
    if (news.length) return news;
    const pulse = worldPulseForState(state);
    return pulse ? [{ id: `pulse-${state.season}`, title: pulse.title }] : [];
  }, [state]);
  return <WorldPulseTicker headlines={headlines} onOpen={onOpen} />;
}

function EntityBadge({ ledger, entityId }: { ledger: CompetitionLedgerView; entityId: string }) {
  if (ledger.entityType === "club" && isDomesticArchiveOnlyClub(entityId)) {
    return <span className={styles.archiveBadge} aria-label={domesticArchiveClubName(entityId)}>{domesticArchiveClubName(entityId).slice(0, 2).toLocaleUpperCase("pt-BR")}</span>;
  }
  return ledger.entityType === "country"
    ? <span className={styles.flagWrap}><NationBadge country={countryById(entityId)} size="sm" /></span>
    : <span className={styles.clubCrestWrap}><ClubBadge club={clubById(entityId)} size="sm" /></span>;
}

function entityName(ledger: CompetitionLedgerView, entityId: string) {
  return ledger.entityType === "country" ? countryById(entityId).name : domesticArchiveClubName(entityId);
}

function CompetitionCard({ ledger, state, open, onToggle, onSelectClub }: { ledger: CompetitionLedgerView; state: GameState; open: boolean; onToggle: () => void; onSelectClub?: (clubId: string) => void }) {
  const leader = ledger.titleTable[0];
  const leaderName = leader ? entityName(ledger, leader.entityId) : ledger.label;
  const highlightedId = ledger.entityType === "country" ? state.nationality : state.currentClubId;
  const highlighted = ledger.titleTable.find((entry) => entry.entityId === highlightedId);
  const highlightedName = entityName(ledger, highlightedId);
  const newestChampions = [...ledger.champions].reverse();
  const champions = ledger.id === "domestic-copa-do-brasil" ? newestChampions : newestChampions.slice(0, 10);
  return <section className={styles.competitionCard}>
    <button type="button" onClick={onToggle} aria-expanded={open}>
      <span className={styles.trophy}><FutboboIcon name={ledger.entityType === "country" ? "globe" : "trophy"} /></span>
      <span><small>{ledger.label.toLocaleUpperCase("pt-BR")}</small><strong>{leader ? `${leaderName} · ${leader.titles} ${leader.titles === 1 ? "título" : "títulos"}` : ledger.label}</strong>{highlighted && <em>{highlightedName}: #{highlighted.rank} · {highlighted.titles}</em>}</span><b>{open ? "−" : "+"}</b>
    </button>
    {open && <div className={styles.competitionDetails}>
      {ledger.id === "domestic-copa-do-brasil" && <div className={styles.timelineLabel}><strong>Final por final</strong><span>{champions.length} edições no arquivo · campeão e vice</span></div>}
      {champions.length > 0 && <div className={`${styles.championTimeline} ${ledger.id === "domestic-copa-do-brasil" ? styles.cupTimeline : ""}`} role={ledger.id === "domestic-copa-do-brasil" ? "group" : undefined} aria-label={ledger.id === "domestic-copa-do-brasil" ? "Finais da Copa do Brasil por temporada" : undefined}>{champions.map((champion) => {
        const name = entityName(ledger, champion.winnerId);
        const content = <><EntityBadge ledger={ledger} entityId={champion.winnerId} /><span><small>{champion.season} · CAMPEÃO</small><strong>{name}</strong>{champion.runnerUpId && <em>vice: {entityName(ledger, champion.runnerUpId)}</em>}</span></>;
        return ledger.id === "domestic-copa-do-brasil" && onSelectClub
          ? <button type="button" className={styles.cupFinalRow} key={`${ledger.id}-${champion.season}`} onClick={() => onSelectClub(champion.winnerId)} aria-label={`Abrir ficha de ${name}, campeão da Copa do Brasil em ${champion.season}`}>{content}</button>
          : <article key={`${ledger.id}-${champion.season}`}>{content}</article>;
      })}</div>}
      <div className={styles.ranking}>{ledger.titleTable.map((entry) => {
        const name = entityName(ledger, entry.entityId);
        const row = <><b>#{entry.rank}</b><EntityBadge ledger={ledger} entityId={entry.entityId} /><strong>{name}</strong><span>{entry.titles}</span></>;
        return ledger.id === "domestic-copa-do-brasil" && onSelectClub
          ? <button type="button" className={`${styles.rankingClubRow} ${entry.entityId === highlightedId ? styles.highlighted : ""}`} key={entry.entityId} onClick={() => onSelectClub(entry.entityId)} aria-label={`Abrir ficha de ${name}, ${entry.titles} ${entry.titles === 1 ? "Copa do Brasil" : "Copas do Brasil"}`}>{row}</button>
          : <article className={entry.entityId === highlightedId ? styles.highlighted : ""} key={entry.entityId}>{row}</article>;
      })}</div>
    </div>}
  </section>;
}

function PlayerBoard({ title, eyebrow, unit, entries }: { title: string; eyebrow: string; unit: string; entries: Array<{ label: string; value: number; season?: number; highlight?: boolean; rank?: number }> }) {
  return <article className={styles.playerBoard}><header><span><small>{eyebrow}</small><strong>{title}</strong></span><b>{entries.length}</b></header><div>{entries.length ? entries.map((entry, index) => <p className={entry.highlight ? styles.protagonistRow : ""} key={`${title}-${entry.label}-${index}`}><b>#{entry.rank ?? index + 1}</b><strong>{entry.label}{entry.highlight && <i> VOCÊ</i>}</strong>{entry.season && <small>{entry.season}</small>}<span>{entry.value} {unit}</span></p>) : <em>O universo ainda está formando este ranking.</em>}</div></article>;
}

export default function CareerWorld({ state }: { state: GameState }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<WorldSection>("now");
  const [selectedClub, setSelectedClub] = useState({ ownerClubId: state.currentClubId, id: state.currentClubId });
  const selectedClubId = selectedClub.ownerClubId === state.currentClubId ? selectedClub.id : state.currentClubId;
  const selectClub = (clubId: string) => {
    setSelectedClub({ ownerClubId: state.currentClubId, id: clubId });
    if (pageRef.current) pageRef.current.scrollTop = 0;
  };
  const [competitionOpen, setCompetitionOpen] = useState("");
  const [officialOpen, setOfficialOpen] = useState("");
  const [domesticTitlesOpen, setDomesticTitlesOpen] = useState(false);
  const snapshot = useMemo(() => buildWorldSnapshot(state), [state]);
  const domesticTitleLedgers = useMemo(() => buildDomesticTitleArchive(state), [state]);
  const officialRankings = useMemo(() => [...historicalRecordBoardsForState(state), ...archiveFootballRankingsForState(state)], [state]);
  const playerBoards = useMemo(() => [
    { title: "Maiores artilheiros", eyebrow: "GOLS NA CARREIRA", unit: "gols", entries: worldUniverseStatLeaders(state, "goals", 16) },
    { title: "Reis do último passe", eyebrow: "ASSISTÊNCIAS", unit: "ast.", entries: worldUniverseStatLeaders(state, "assists", 16) },
    { title: "Mais jogos", eyebrow: "LONGEVIDADE", unit: "jogos", entries: worldUniverseStatLeaders(state, "appearances", 16) },
    { title: "Maiores ladrões de bola", eyebrow: "DESARMES", unit: "des.", entries: worldUniverseStatLeaders(state, "tackles", 16) },
    { title: "Donos do zero", eyebrow: "JOGOS SEM SOFRER GOL", unit: "CS", entries: worldUniverseStatLeaders(state, "cleanSheets", 16) },
    { title: "Bolas de Ouro", eyebrow: "PRÊMIO MÁXIMO", unit: "troféus", entries: worldUniverseBallonDorLeaders(state, 16) },
    { title: "Craques da geração", eyebrow: "NÍVEL ATUAL", unit: "OVR", entries: worldUniverseGenerationLeaders(state, 16) },
    { title: "Maiores transferências", eyebrow: "MERCADO", unit: "€ mi", entries: worldPlayerTransferLeaders(state, 16) },
  ], [state]);
  const featured = snapshot.news[0];
  const currentClub = clubById(state.currentClubId);
  const openClubDossier = (clubId: string) => {
    selectClub(clubId);
    setSection("clubs");
    if (pageRef.current) pageRef.current.scrollTop = 0;
  };
  const nationalCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "country");
  const clubCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "club");

  return <div ref={pageRef} className={`panel-screen screen-enter ${styles.page}`}>
    <header className={styles.heading}><span>MUNDO</span><h1>{state.season} no mundo.</h1><p>Notícias, campeões e recordes do seu universo.</p></header>
    <nav className={styles.sectionNav} aria-label="Seções do Mundo">{SECTION_ITEMS.map((item) => <button type="button" key={item.id} className={section === item.id ? styles.activeSection : ""} aria-pressed={section === item.id} onClick={() => { setSection(item.id); setCompetitionOpen(""); if (pageRef.current) pageRef.current.scrollTop = 0; window.scrollTo({ top: 0, behavior: "smooth" }); }}><FutboboIcon name={item.icon} /><span><small>{item.hint}</small><strong>{item.label}</strong></span></button>)}</nav>

    {section === "now" && <>{featured ? <article className={`${styles.featured} ${featured.priority === "major" ? styles.major : ""}`}><small>{CATEGORY_LABELS[featured.category]} · {featured.season}</small><strong>{featured.title}</strong><p>{featured.summary}</p></article> : <div className={styles.empty}><strong>Ainda não há manchetes da carreira.</strong><span>As primeiras partidas e decisões vão aparecer aqui.</span></div>}{currentClub.countryId === "brasil" && <button className={styles.cupShortcut} type="button" onClick={() => openClubDossier(state.currentClubId)}><span><FutboboIcon name="trophy" /></span><span><small>COPA DO BRASIL · ARQUIVO</small><strong>Finais e títulos do {currentClub.shortName}</strong></span><b>→</b></button>}{snapshot.news.length > 1 && <section className={styles.newsSection}><header><span>GIRO DO MUNDO</span><small>Mais recentes</small></header><div>{snapshot.news.slice(1, 13).map((item) => <article key={item.id}><time>{item.season}</time><span><small>{CATEGORY_LABELS[item.category]}</small><strong>{item.title}</strong><p>{item.summary}</p></span>{item.priority === "major" && <b>●</b>}</article>)}</div></section>}</>}

    {section === "national" && <section className={styles.sectionStack}><header><small>SELEÇÕES</small><strong>Torneios e campeões</strong><p>Copas do Mundo e competições continentais.</p></header>{nationalCompetitions.map((ledger) => <CompetitionCard key={ledger.id} ledger={ledger} state={state} open={competitionOpen === ledger.id} onToggle={() => setCompetitionOpen((current) => current === ledger.id ? "" : ledger.id)} />)}</section>}
    {section === "clubs" && <section className={styles.sectionStack}><ClubDossierPanel key={selectedClubId} currentClubId={state.currentClubId} selectedClubId={selectedClubId} onSelectClub={selectClub} competitionLedgers={clubCompetitions} domesticLedgers={domesticTitleLedgers} /><header><small>COMPETIÇÕES</small><strong>Campeões continentais e mundiais</strong><p>Abra uma taça para ver os vencedores e o ranking do seu universo.</p></header>{clubCompetitions.map((ledger) => <CompetitionCard key={ledger.id} ledger={ledger} state={state} open={competitionOpen === ledger.id} onToggle={() => setCompetitionOpen((current) => current === ledger.id ? "" : ledger.id)} />)}</section>}
    {section === "players" && <section className={styles.sectionStack}><header><small>JOGADORES</small><strong>Gols, passes e transferências</strong><p>Os números de quem joga no seu universo.</p></header><div className={styles.playerGrid}>{playerBoards.map((board) => <PlayerBoard key={board.title} {...board} />)}</div></section>}
    {section === "archive" && <>
      <section className={styles.competitionCard}>
        <button type="button" onClick={() => { setDomesticTitlesOpen((current) => !current); setCompetitionOpen(""); }} aria-expanded={domesticTitlesOpen}>
          <span className={styles.trophy}><FutboboIcon name="trophy" /></span>
          <span><small>ARQUIVO · CLUBES</small><strong>Títulos nacionais</strong><em>Brasileirão, Copa do Brasil e principais ligas e copas</em></span><b>{domesticTitlesOpen ? "−" : "+"}</b>
        </button>
        {domesticTitlesOpen && <div className={styles.competitionDetails}><div className={styles.sectionStack} style={{ padding: 9 }}>
          {domesticTitleLedgers.map((ledger) => <CompetitionCard key={ledger.id} ledger={ledger} state={state} open={competitionOpen === ledger.id} onToggle={() => setCompetitionOpen((current) => current === ledger.id ? "" : ledger.id)} onSelectClub={ledger.id === "domestic-copa-do-brasil" ? openClubDossier : undefined} />)}
        </div></div>}
      </section>
      <section className={styles.officialSection}><header><span>ARQUIVO VIVO</span><small>Recordes de seleções, carreiras e torneios</small></header><div>{officialRankings.map((board) => {
        const open = officialOpen === board.id; const highlightedIndex = board.entries.findIndex((entry) => entry.highlight); const highlighted = highlightedIndex >= 0 ? board.entries[highlightedIndex] : null;
        return <article className={`${styles.officialCard} ${board.living ? styles.livingCard : ""}`} key={board.id}><button type="button" onClick={() => setOfficialOpen((current) => current === board.id ? "" : board.id)} aria-expanded={open}><span><small>{board.eyebrow}</small><strong>{board.label}</strong><em>{board.entries[0]?.label} · {board.entries[0]?.value} {board.unit}{highlighted && highlightedIndex > 0 ? ` · ${highlighted.label} #${rankingPosition(board.entries, highlightedIndex)}` : ""}</em></span><b>{open ? "−" : "+"}</b></button>{open && <div className={styles.officialRanking}><div className={styles.officialRows}>{board.entries.map((entry, index) => <div className={entry.highlight ? styles.livingEntry : ""} key={`${board.id}-${entry.label}`}><b>#{rankingPosition(board.entries, index)}</b><strong>{entry.label}</strong><span>{entry.value}</span></div>)}</div><small>{board.cutoff}</small></div>}</article>;
      })}</div></section>
    </>}
  </div>;
}

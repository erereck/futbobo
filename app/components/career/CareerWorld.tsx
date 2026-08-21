"use client";

import { useMemo, useState } from "react";
import { countryById } from "../../game-data";
import type { GameState } from "../../career/model";
import { footballRankingsForState } from "../../career/official-football-records";
import { historicalRecordBoardsForState } from "../../career/historical-records";
import type { WorldCompetitionLedger } from "../../career/world-memory";
import { buildWorldSnapshot, worldPulseForState } from "../../career/world-memory";
import { worldPlayerBallonDorLeaders, worldPlayerGenerationLeaders, worldPlayerStatLeaders, worldPlayerTransferLeaders } from "../../career/world-player-world";
import { clubById } from "../../career/shared";
import { ClubBadge, NationBadge } from "./CareerPrimitives";
import styles from "./CareerWorld.module.css";

type WorldSection = "now" | "national" | "clubs" | "players" | "archive";
const CATEGORY_LABELS = { "world-cup": "MUNDIAL", career: "CARREIRA", transfer: "MERCADO", award: "PRÊMIOS", rival: "GERAÇÃO", record: "RECORDE" } as const;
const SECTION_ITEMS: Array<{ id: WorldSection; label: string; hint: string }> = [
  { id: "now", label: "Agora", hint: "Notícias" }, { id: "national", label: "Seleções", hint: "Copas" },
  { id: "clubs", label: "Clubes", hint: "Campeões" }, { id: "players", label: "Jogadores", hint: "Líderes" },
  { id: "archive", label: "Arquivo", hint: "Recordes" },
];

function rankingPosition(entries: Array<{ value: number }>, index: number) {
  if (index <= 0) return 1;
  return entries.findIndex((entry) => entry.value === entries[index].value) + 1;
}

export function WorldPulseButton({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const pulse = useMemo(() => worldPulseForState(state), [state]);
  if (!pulse) return null;
  return <button type="button" className={styles.pulse} onClick={onOpen}><span><i /> MUNDO</span><strong>{pulse.title}</strong><b>→</b></button>;
}

function EntityBadge({ ledger, entityId }: { ledger: WorldCompetitionLedger; entityId: string }) {
  return ledger.entityType === "country"
    ? <span className={styles.flagWrap}><NationBadge country={countryById(entityId)} size="sm" /></span>
    : <span className={styles.clubCrestWrap}><ClubBadge club={clubById(entityId)} size="sm" /></span>;
}

function CompetitionCard({ ledger, state, open, onToggle }: { ledger: WorldCompetitionLedger; state: GameState; open: boolean; onToggle: () => void }) {
  const leader = ledger.titleTable[0];
  const leaderName = leader ? (ledger.entityType === "country" ? countryById(leader.entityId).name : clubById(leader.entityId).shortName) : ledger.label;
  const highlightedId = ledger.entityType === "country" ? state.nationality : state.currentClubId;
  const highlighted = ledger.titleTable.find((entry) => entry.entityId === highlightedId);
  const highlightedName = ledger.entityType === "country" ? countryById(highlightedId).name : clubById(highlightedId).shortName;
  const champions = [...ledger.champions].reverse().slice(0, 10);
  return <section className={styles.competitionCard}>
    <button type="button" onClick={onToggle} aria-expanded={open}>
      <span className={styles.trophy}>{ledger.entityType === "country" ? "◎" : "◇"}</span>
      <span><small>{ledger.label.toLocaleUpperCase("pt-BR")}</small><strong>{leader ? `${leaderName} · ${leader.titles} títulos` : ledger.label}</strong>{highlighted && <em>{highlightedName}: #{highlighted.rank} · {highlighted.titles}</em>}</span><b>{open ? "−" : "+"}</b>
    </button>
    {open && <div className={styles.competitionDetails}>
      {champions.length > 0 && <div className={styles.championTimeline}>{champions.map((champion) => {
        const name = ledger.entityType === "country" ? countryById(champion.winnerId).name : clubById(champion.winnerId).shortName;
        return <article key={`${ledger.id}-${champion.season}`}><EntityBadge ledger={ledger} entityId={champion.winnerId} /><span><small>{champion.season}</small><strong>{name}</strong></span></article>;
      })}</div>}
      <div className={styles.ranking}>{ledger.titleTable.map((entry) => {
        const name = ledger.entityType === "country" ? countryById(entry.entityId).name : clubById(entry.entityId).shortName;
        return <article className={entry.entityId === highlightedId ? styles.highlighted : ""} key={entry.entityId}><b>#{entry.rank}</b><EntityBadge ledger={ledger} entityId={entry.entityId} /><strong>{name}</strong><span>{entry.titles}</span></article>;
      })}</div>
    </div>}
  </section>;
}

function PlayerBoard({ title, eyebrow, unit, entries }: { title: string; eyebrow: string; unit: string; entries: Array<{ label: string; value: number; season?: number }> }) {
  return <article className={styles.playerBoard}><header><span><small>{eyebrow}</small><strong>{title}</strong></span><b>{entries.length}</b></header><div>{entries.length ? entries.map((entry, index) => <p key={`${title}-${entry.label}-${index}`}><b>#{index + 1}</b><strong>{entry.label}</strong>{entry.season && <small>{entry.season}</small>}<span>{entry.value} {unit}</span></p>) : <em>O universo ainda está formando este ranking.</em>}</div></article>;
}

export default function CareerWorld({ state }: { state: GameState }) {
  const [section, setSection] = useState<WorldSection>("now");
  const [competitionOpen, setCompetitionOpen] = useState("");
  const [officialOpen, setOfficialOpen] = useState("");
  const snapshot = useMemo(() => buildWorldSnapshot(state), [state]);
  const officialRankings = useMemo(() => [...historicalRecordBoardsForState(state), ...footballRankingsForState(state)], [state]);
  const playerBoards = useMemo(() => [
    { title: "Maiores artilheiros", eyebrow: "GOLS NA CARREIRA", unit: "gols", entries: worldPlayerStatLeaders(state, "goals", 16) },
    { title: "Reis do último passe", eyebrow: "ASSISTÊNCIAS", unit: "ast.", entries: worldPlayerStatLeaders(state, "assists", 16) },
    { title: "Mais jogos", eyebrow: "LONGEVIDADE", unit: "jogos", entries: worldPlayerStatLeaders(state, "appearances", 16) },
    { title: "Bolas de Ouro", eyebrow: "PRÊMIO MÁXIMO", unit: "troféus", entries: worldPlayerBallonDorLeaders(state, 16) },
    { title: "Craques da geração", eyebrow: "NÍVEL ATUAL", unit: "OVR", entries: worldPlayerGenerationLeaders(state, 16) },
    { title: "Maiores transferências", eyebrow: "MERCADO", unit: "€ mi", entries: worldPlayerTransferLeaders(state, 16) },
  ], [state]);
  const featured = snapshot.news[0];
  const nationalCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "country");
  const clubCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "club");

  return <div className={`panel-screen screen-enter ${styles.page}`}>
    <header className={styles.heading}><span>MUNDO</span><strong>O futebol continua.</strong><p>Escolha o que quer acompanhar.</p></header>
    <nav className={styles.sectionNav} aria-label="Seções do Mundo">{SECTION_ITEMS.map((item) => <button type="button" key={item.id} className={section === item.id ? styles.activeSection : ""} aria-pressed={section === item.id} onClick={() => { setSection(item.id); setCompetitionOpen(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}><small>{item.hint}</small><strong>{item.label}</strong></button>)}</nav>

    {section === "now" && <>{featured ? <article className={`${styles.featured} ${featured.priority === "major" ? styles.major : ""}`}><small>{CATEGORY_LABELS[featured.category]} · {featured.season}</small><strong>{featured.title}</strong><p>{featured.summary}</p></article> : <div className={styles.empty}><strong>O arquivo já está aberto.</strong><span>Sua carreira ainda não virou manchete.</span></div>}{snapshot.news.length > 1 && <section className={styles.newsSection}><header><span>GIRO DO MUNDO</span><small>Mais recentes</small></header><div>{snapshot.news.slice(1, 13).map((item) => <article key={item.id}><time>{item.season}</time><span><small>{CATEGORY_LABELS[item.category]}</small><strong>{item.title}</strong><p>{item.summary}</p></span>{item.priority === "major" && <b>●</b>}</article>)}</div></section>}</>}

    {section === "national" && <section className={styles.sectionStack}><header><small>SELEÇÕES</small><strong>Torneios e campeões</strong><p>Copas do Mundo e competições continentais.</p></header>{nationalCompetitions.map((ledger) => <CompetitionCard key={ledger.id} ledger={ledger} state={state} open={competitionOpen === ledger.id} onToggle={() => setCompetitionOpen((current) => current === ledger.id ? "" : ledger.id)} />)}</section>}
    {section === "clubs" && <section className={styles.sectionStack}><header><small>CLUBES</small><strong>O mapa dos campeões</strong><p>Até dez edições recentes por competição.</p></header>{clubCompetitions.map((ledger) => <CompetitionCard key={ledger.id} ledger={ledger} state={state} open={competitionOpen === ledger.id} onToggle={() => setCompetitionOpen((current) => current === ledger.id ? "" : ledger.id)} />)}</section>}
    {section === "players" && <section className={styles.sectionStack}><header><small>JOGADORES</small><strong>Quem está deixando marca</strong><p>Mais nomes, mais estatísticas e o mercado do seu universo.</p></header><div className={styles.playerGrid}>{playerBoards.map((board) => <PlayerBoard key={board.title} {...board} />)}</div></section>}
    {section === "archive" && <section className={styles.officialSection}><header><span>ARQUIVO VIVO</span><small>História real + seu universo</small></header><div>{officialRankings.map((board) => {
      const open = officialOpen === board.id; const highlightedIndex = board.entries.findIndex((entry) => entry.highlight); const highlighted = highlightedIndex >= 0 ? board.entries[highlightedIndex] : null;
      return <article className={`${styles.officialCard} ${board.living ? styles.livingCard : ""}`} key={board.id}><button type="button" onClick={() => setOfficialOpen((current) => current === board.id ? "" : board.id)} aria-expanded={open}><span><small>{board.eyebrow}</small><strong>{board.label}</strong><em>{board.entries[0]?.label} · {board.entries[0]?.value} {board.unit}{highlighted && highlightedIndex > 0 ? ` · ${highlighted.label} #${rankingPosition(board.entries, highlightedIndex)}` : ""}</em></span><b>{open ? "−" : "+"}</b></button>{open && <div className={styles.officialRanking}><div className={styles.officialRows}>{board.entries.map((entry, index) => <div className={entry.highlight ? styles.livingEntry : ""} key={`${board.id}-${entry.label}`}><b>#{rankingPosition(board.entries, index)}</b><strong>{entry.label}</strong><span>{entry.value}</span></div>)}</div><small>{board.cutoff}</small></div>}</article>;
    })}</div></section>}
  </div>;
}

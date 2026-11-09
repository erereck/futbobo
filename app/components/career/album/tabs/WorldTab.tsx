"use client";

import { useMemo, useRef, useState } from "react";
import type { Club } from "../../../../game-data";
import { countryById } from "../../../../game-data";
import type { GameState } from "../../../../career/model";
import { buildDomesticTitleArchive, domesticArchiveClubName, isDomesticArchiveOnlyClub } from "../../../../career/domestic-title-archive";
import type { DomesticTitleLedger } from "../../../../career/domestic-title-archive";
import { archiveFootballRankingsForState } from "../../../../career/official-football-records";
import { historicalRecordBoardsForState } from "../../../../career/historical-records";
import type { WorldCompetitionLedger, WorldNewsItem } from "../../../../career/world-memory";
import { buildWorldSnapshot } from "../../../../career/world-memory";
import { worldPlayerTransferLeaders, worldUniverseBallonDorLeaders, worldUniverseGenerationLeaders, worldUniverseStatLeaders } from "../../../../career/world-player-world";
import { clubById } from "../../../../career/shared";
import { ClubBadge, NationBadge } from "../../CareerPrimitives";
import FutboboIcon from "../../../FutboboIcon";
import type { FutboboIconName } from "../../../FutboboIcon";
import { AlbumPage } from "../AlbumShell";
import { BlockTitle, InkBand } from "../primitives";
import { crestForHeadline } from "../newsCrest";
import WorldDossier from "./worldDossier";
import styles from "./worldTab.module.css";

type WorldSection = "now" | "national" | "clubs" | "players" | "archive";
type CompetitionLedgerView = WorldCompetitionLedger | DomesticTitleLedger;

const CATEGORY_LABELS: Record<WorldNewsItem["category"], string> = { "world-cup": "Mundial", career: "Carreira", transfer: "Mercado", award: "Prêmios", rival: "Geração", record: "Recorde" };
const SINGULAR_UNITS: Record<string, string> = { gols: "gol", jogos: "jogo", troféus: "troféu", assistências: "assistência", títulos: "título" };
const SECTIONS: Array<{ id: WorldSection; label: string; icon: FutboboIconName }> = [
  { id: "now", label: "Agora", icon: "news" },
  { id: "national", label: "Seleções", icon: "globe" },
  { id: "clubs", label: "Clubes", icon: "trophy" },
  { id: "players", label: "Jogadores", icon: "player" },
  { id: "archive", label: "Arquivo", icon: "history" },
];

/** "GOLS NA CARREIRA" → "Gols na carreira": o álbum não grita em caixa alta. */
const sentence = (value: string) => {
  const lower = value.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
};

function rankingPosition(entries: Array<{ value: number }>, index: number) {
  if (index <= 0) return 1;
  return entries.findIndex((entry) => entry.value === entries[index].value) + 1;
}

function rankedValue(value: number, unit: string) {
  const singular = SINGULAR_UNITS[unit];
  return `${value} ${value === 1 && singular ? singular : unit}`;
}

function entityName(ledger: CompetitionLedgerView, entityId: string) {
  return ledger.entityType === "country" ? countryById(entityId).name : domesticArchiveClubName(entityId);
}

function EntityCrest({ ledger, entityId }: { ledger: CompetitionLedgerView; entityId: string }) {
  if (ledger.entityType === "club" && isDomesticArchiveOnlyClub(entityId)) {
    return <span className={styles.crest} aria-hidden="true"><b>{domesticArchiveClubName(entityId).slice(0, 2).toLocaleUpperCase("pt-BR")}</b></span>;
  }
  return (
    <span className={styles.crest} aria-hidden="true">
      {ledger.entityType === "country" ? <NationBadge country={countryById(entityId)} size="sm" /> : <ClubBadge club={clubById(entityId)} size="sm" />}
    </span>
  );
}

function HeadlineCrest({ title }: { title: string }) {
  const crest = crestForHeadline(title);
  return (
    <span className={styles.clipCrest} aria-hidden="true">
      {crest.club ? <ClubBadge club={crest.club} size="sm" /> : crest.country ? <NationBadge country={crest.country} size="sm" /> : <FutboboIcon name="news" />}
    </span>
  );
}

/** Uma competição do arquivo: abre para mostrar campeões e o ranking de títulos do universo. */
function LedgerEntry({ ledger, state, open, onToggle, onSelectClub }: { ledger: CompetitionLedgerView; state: GameState; open: boolean; onToggle: () => void; onSelectClub?: (clubId: string) => void }) {
  const leader = ledger.titleTable[0];
  const highlightedId = ledger.entityType === "country" ? state.nationality : state.currentClubId;
  const highlighted = ledger.titleTable.find((entry) => entry.entityId === highlightedId);
  const isCup = ledger.id === "domestic-copa-do-brasil";
  const newestChampions = [...ledger.champions].reverse();
  const champions = isCup ? newestChampions : newestChampions.slice(0, 10);
  return (
    <section className={styles.ledger} data-open={open ? "" : undefined}>
      <button type="button" className={styles.ledgerHead} id={isCup ? "copa-do-brasil-archive-toggle" : undefined} onClick={onToggle} aria-expanded={open}>
        {leader ? <EntityCrest ledger={ledger} entityId={leader.entityId} /> : <span className={styles.crest} aria-hidden="true"><FutboboIcon name="trophy" /></span>}
        <span className={styles.ledgerCopy}>
          <strong>{ledger.label}</strong>
          <small>{leader ? `${entityName(ledger, leader.entityId)} lidera com ${leader.titles} ${leader.titles === 1 ? "título" : "títulos"}` : "Sem campeão registrado"}</small>
          {highlighted && <em>{entityName(ledger, highlightedId)}: {highlighted.rank}º, {highlighted.titles} {highlighted.titles === 1 ? "título" : "títulos"}</em>}
        </span>
        <span className={styles.toggleMark} aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className={styles.ledgerBody}>
          {champions.length > 0 && (isCup ? (
            <>
              <p className={styles.subhead}><strong>Final por final</strong><span>{champions.length} edições no arquivo, com campeão e vice</span></p>
              <ol className={styles.cupFinals} role="group" aria-label="Finais da Copa do Brasil por temporada">
                {champions.map((champion) => {
                  const name = entityName(ledger, champion.winnerId);
                  const runnerUpId = champion.runnerUpId;
                  return (
                    <li key={`${ledger.id}-${champion.season}`}>
                      <time>{champion.season}</time>
                      {onSelectClub
                        ? <button type="button" className={styles.cupWinner} onClick={() => onSelectClub(champion.winnerId)} aria-label={`Abrir ficha de ${name}, campeão da Copa do Brasil em ${champion.season}`}><EntityCrest ledger={ledger} entityId={champion.winnerId} /><strong>{name}</strong></button>
                        : <span className={styles.cupWinner}><EntityCrest ledger={ledger} entityId={champion.winnerId} /><strong>{name}</strong></span>}
                      {runnerUpId && (onSelectClub
                        ? <button type="button" className={styles.cupRunner} onClick={() => onSelectClub(runnerUpId)} aria-label={`Abrir ficha de ${entityName(ledger, runnerUpId)}, vice da Copa do Brasil em ${champion.season}`}>vice: {entityName(ledger, runnerUpId)}</button>
                        : <span className={styles.cupRunner}>vice: {entityName(ledger, runnerUpId)}</span>)}
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <ol className={styles.champions} aria-label={`Últimos campeões: ${ledger.label}`}>
              {champions.map((champion) => (
                <li key={`${ledger.id}-${champion.season}`}>
                  <EntityCrest ledger={ledger} entityId={champion.winnerId} />
                  <time>{champion.season}</time>
                  <strong>{entityName(ledger, champion.winnerId)}</strong>
                  {champion.runnerUpId && <small>vice: {entityName(ledger, champion.runnerUpId)}</small>}
                </li>
              ))}
            </ol>
          ))}
          <ol className={styles.ranking} aria-label={`Ranking de títulos: ${ledger.label}`}>
            {ledger.titleTable.map((entry) => {
              const name = entityName(ledger, entry.entityId);
              const row = <><b className={styles.num}>{entry.rank}º</b><EntityCrest ledger={ledger} entityId={entry.entityId} /><strong>{name}</strong><span className={styles.lead} aria-hidden="true" /><em className={styles.num}>{entry.titles}</em></>;
              return (
                <li key={entry.entityId} data-you={entry.entityId === highlightedId ? "" : undefined}>
                  {isCup && onSelectClub
                    ? <button type="button" onClick={() => onSelectClub(entry.entityId)} aria-label={`Abrir ficha de ${name}, ${entry.titles} ${entry.titles === 1 ? "Copa do Brasil" : "Copas do Brasil"}`}>{row}</button>
                    : <div>{row}</div>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

type BoardEntry = { label: string; value: number; season?: number; highlight?: boolean; rank?: number };

/** Ranking de jogadores do universo, impresso como tabela do álbum. */
function PlayerBoard({ title, eyebrow, unit, entries }: { title: string; eyebrow: string; unit: string; entries: BoardEntry[] }) {
  return (
    <article className={styles.board}>
      <header><strong>{title}</strong><small>{sentence(eyebrow)}</small></header>
      {entries.length ? (
        <ol>
          {entries.map((entry, index) => (
            <li key={`${title}-${entry.label}-${index}`} data-you={entry.highlight ? "" : undefined}>
              <b className={styles.num}>{entry.rank ?? index + 1}º</b>
              <strong>{entry.label}{entry.highlight && <i>você</i>}</strong>
              {entry.season && <small className={styles.num}>{entry.season}</small>}
              <span className={styles.num}>{rankedValue(entry.value, unit)}</span>
            </li>
          ))}
        </ol>
      ) : <p className={styles.emptyNote}>O universo ainda está formando este ranking.</p>}
    </article>
  );
}

function Clipping({ item, lead = false }: { item: WorldNewsItem; lead?: boolean }) {
  return (
    <article className={styles.clipping} data-lead={lead ? "" : undefined} data-major={item.priority === "major" ? "" : undefined}>
      <HeadlineCrest title={item.title} />
      <div>
        <p className={styles.clipMeta}><span>{CATEGORY_LABELS[item.category]}</span><time className={styles.num}>{item.season}</time>{item.priority === "major" && <b>destaque</b>}</p>
        <strong>{item.title}</strong>
        <p>{item.summary}</p>
      </div>
    </article>
  );
}

/** Aba Mundo: notícias, campeões, jogadores e arquivo do universo da carreira. */
export default function WorldTab({ game }: { game: GameState; club: Club }) {
  const state = game;
  const rootRef = useRef<HTMLDivElement>(null);
  const cupTimelineScrollRef = useRef(0);
  const [section, setSection] = useState<WorldSection>("now");
  const [selectedClub, setSelectedClub] = useState({ ownerClubId: state.currentClubId, id: state.currentClubId });
  const [dossierFromCup, setDossierFromCup] = useState(false);
  const [competitionOpen, setCompetitionOpen] = useState("");
  const [officialOpen, setOfficialOpen] = useState("");
  const [domesticTitlesOpen, setDomesticTitlesOpen] = useState(false);
  const selectedClubId = selectedClub.ownerClubId === state.currentClubId ? selectedClub.id : state.currentClubId;

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
  // Manchetes da própria carreira (o feed do jogador), com o ano separado do texto.
  const careerHeadlines = state.newsFeed.slice(0, 8).map((headline, index) => {
    const match = /^(\d{4}):\s*(.*)$/u.exec(headline);
    return { key: `${index}-${headline}`, season: match ? Number(match[1]) : null, text: match ? match[2] : headline };
  });
  const currentClub = clubById(state.currentClubId);
  const nation = countryById(state.nationality);
  const nationalCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "country");
  const clubCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "club");
  const nationTitles = nationalCompetitions.reduce((total, ledger) => total + (ledger.titleTable.find((entry) => entry.entityId === state.nationality)?.titles ?? 0), 0);
  const latestWorldCup = nationalCompetitions.find((ledger) => ledger.id === "world-cup")?.champions.at(-1);
  const yourRanks = playerBoards.flatMap((board) => {
    const index = board.entries.findIndex((entry) => entry.highlight && entry.value > 0);
    return index >= 0 ? [{ title: board.title, rank: (board.entries[index] as BoardEntry).rank ?? index + 1 }] : [];
  }).sort((a, b) => a.rank - b.rank).slice(0, 3);

  /** Volta as duas páginas (desktop) e a página única (celular) para o topo. */
  const scrollPagesTop = () => {
    rootRef.current?.closest("main")?.querySelectorAll<HTMLElement>("section[data-side]").forEach((page) => { page.scrollTop = 0; });
    window.scrollTo({ top: 0 });
  };
  const selectClub = (clubId: string) => {
    setSelectedClub({ ownerClubId: state.currentClubId, id: clubId });
    scrollPagesTop();
  };
  const openClubDossier = (clubId: string, fromCup = false) => {
    selectClub(clubId);
    setDossierFromCup(fromCup);
    setSection("clubs");
  };
  const openCupDossier = (clubId: string) => {
    cupTimelineScrollRef.current = document.querySelector<HTMLElement>('[aria-label="Finais da Copa do Brasil por temporada"]')?.scrollTop ?? 0;
    openClubDossier(clubId, true);
  };
  const returnToCup = () => {
    setSection("archive");
    setDomesticTitlesOpen(true);
    setCompetitionOpen("domestic-copa-do-brasil");
    setDossierFromCup(false);
    scrollPagesTop();
    window.requestAnimationFrame(() => {
      const timeline = document.querySelector<HTMLElement>('[aria-label="Finais da Copa do Brasil por temporada"]');
      if (!timeline) return;
      document.querySelector<HTMLButtonElement>("#copa-do-brasil-archive-toggle")?.focus({ preventScroll: true });
      timeline.scrollTop = cupTimelineScrollRef.current;
      timeline.scrollIntoView({ block: "center" });
    });
  };
  const changeSection = (next: WorldSection) => {
    setSection(next);
    setCompetitionOpen("");
    setDossierFromCup(false);
    scrollPagesTop();
  };
  const toggleCompetition = (id: string) => setCompetitionOpen((current) => current === id ? "" : id);

  return (
    <>
      <AlbumPage side="left" label="Mundo">
        <div ref={rootRef} className={styles.stack}>
          <InkBand ink="green" title="Mundo" subtitle={`${state.season} no seu universo`} />

          <nav className={styles.sections} aria-label="Seções do Mundo">
            {SECTIONS.map((item) => (
              <button type="button" key={item.id} aria-pressed={section === item.id} onClick={() => changeSection(item.id)}>
                <FutboboIcon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {section === "now" && (
            <>
              {featured ? <Clipping item={featured} lead /> : (
                <div className={styles.emptyBlock}><strong>Ainda não há manchetes da carreira.</strong><span>As primeiras partidas e decisões aparecem aqui.</span></div>
              )}
              {currentClub.countryId === "brasil" && (
                <button type="button" className={styles.shortcut} onClick={() => openClubDossier(state.currentClubId)}>
                  <span className={styles.crest} aria-hidden="true"><ClubBadge club={currentClub} size="sm" /></span>
                  <span><strong>Finais e títulos do {currentClub.shortName}</strong><small>Copa do Brasil no arquivo do clube</small></span>
                </button>
              )}
              {careerHeadlines.length > 0 && (
                <section className={styles.careerNews} aria-labelledby="manchetes-carreira">
                  <BlockTitle id="manchetes-carreira">Sua carreira nas manchetes</BlockTitle>
                  <ol>
                    {careerHeadlines.map((headline) => (
                      <li key={headline.key}>{headline.season && <time className={styles.num}>{headline.season}</time>}<p>{headline.text}</p></li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}

          {section === "national" && (
            <section className={styles.cover} aria-label="Seleções">
              <BlockTitle as="h2">Torneios de seleções</BlockTitle>
              <p>Copas do Mundo e competições continentais do seu universo.</p>
              <div className={styles.coverStats}>
                <div><span className={styles.crest} aria-hidden="true"><NationBadge country={nation} size="sm" /></span><b className={styles.num}>{nationTitles}</b><small>{nationTitles === 1 ? "título" : "títulos"} da seleção {nation.name === "Brasil" ? "brasileira" : `de ${nation.name}`}</small></div>
                {latestWorldCup && <div><span className={styles.crest} aria-hidden="true"><NationBadge country={countryById(latestWorldCup.winnerId)} size="sm" /></span><b className={styles.num}>{latestWorldCup.season}</b><small>última Copa do Mundo: {countryById(latestWorldCup.winnerId).name}</small></div>}
              </div>
            </section>
          )}

          {section === "clubs" && (
            <WorldDossier
              key={selectedClubId}
              currentClubId={state.currentClubId}
              selectedClubId={selectedClubId}
              onSelectClub={selectClub}
              onReturnToCup={dossierFromCup ? returnToCup : undefined}
              competitionLedgers={clubCompetitions}
              domesticLedgers={domesticTitleLedgers}
            />
          )}

          {section === "players" && (
            <>
              <section className={styles.cover} aria-label="Jogadores">
                <BlockTitle as="h2">Gols, passes e transferências</BlockTitle>
                <p>Os números de quem joga no seu universo.</p>
                {yourRanks.length > 0 && (
                  <ul className={styles.yourRanks}>
                    {yourRanks.map((rank) => <li key={rank.title}><b className={styles.num}>{rank.rank}º</b><span>{rank.title}</span></li>)}
                  </ul>
                )}
              </section>
              <div className={styles.boards}>{playerBoards.slice(0, 4).map((board) => <PlayerBoard key={board.title} {...board} />)}</div>
            </>
          )}

          {section === "archive" && (
            <section className={styles.ledgerGroup} data-open={domesticTitlesOpen ? "" : undefined}>
              <button type="button" className={styles.ledgerHead} onClick={() => { setDomesticTitlesOpen((current) => !current); setCompetitionOpen(""); }} aria-expanded={domesticTitlesOpen}>
                <span className={styles.crest} aria-hidden="true"><FutboboIcon name="trophy" /></span>
                <span className={styles.ledgerCopy}><strong>Títulos nacionais</strong><small>Brasileirão, Copa do Brasil e as principais ligas e copas</small></span>
                <span className={styles.toggleMark} aria-hidden="true">{domesticTitlesOpen ? "−" : "+"}</span>
              </button>
              {domesticTitlesOpen && (
                <div className={styles.ledgerList}>
                  {domesticTitleLedgers.map((ledger) => <LedgerEntry key={ledger.id} ledger={ledger} state={state} open={competitionOpen === ledger.id} onToggle={() => toggleCompetition(ledger.id)} onSelectClub={ledger.id === "domestic-copa-do-brasil" ? openCupDossier : undefined} />)}
                </div>
              )}
            </section>
          )}
        </div>
      </AlbumPage>

      <AlbumPage side="right" label={SECTIONS.find((item) => item.id === section)?.label ?? "Mundo"}>
        {section === "now" && (
          snapshot.news.length > 1 ? (
            <section className={styles.stack} aria-labelledby="giro-titulo">
              <BlockTitle id="giro-titulo" note="mais recentes">Giro pelo mundo</BlockTitle>
              <div className={styles.clippings}>{snapshot.news.slice(1, 13).map((item) => <Clipping key={item.id} item={item} />)}</div>
            </section>
          ) : <p className={styles.emptyNote}>O giro pelo mundo começa com as próximas temporadas.</p>
        )}

        {section === "national" && (
          <div className={styles.ledgerList}>
            {nationalCompetitions.map((ledger) => <LedgerEntry key={ledger.id} ledger={ledger} state={state} open={competitionOpen === ledger.id} onToggle={() => toggleCompetition(ledger.id)} />)}
          </div>
        )}

        {section === "clubs" && (
          <section className={styles.stack} aria-labelledby="continentais-titulo">
            <BlockTitle id="continentais-titulo" note="abra uma taça para ver campeões e ranking">Campeões continentais e mundiais</BlockTitle>
            <div className={styles.ledgerList}>
              {clubCompetitions.map((ledger) => <LedgerEntry key={ledger.id} ledger={ledger} state={state} open={competitionOpen === ledger.id} onToggle={() => toggleCompetition(ledger.id)} />)}
            </div>
          </section>
        )}

        {section === "players" && (
          <div className={styles.boards}>{playerBoards.slice(4).map((board) => <PlayerBoard key={board.title} {...board} />)}</div>
        )}

        {section === "archive" && (
          <section className={styles.stack} aria-labelledby="arquivo-vivo-titulo">
            <BlockTitle id="arquivo-vivo-titulo" note="seleções, carreiras e torneios">Recordes do arquivo vivo</BlockTitle>
            <div className={styles.ledgerList}>
              {officialRankings.map((board) => {
                const open = officialOpen === board.id;
                const highlightedIndex = board.entries.findIndex((entry) => entry.highlight);
                const highlighted = highlightedIndex >= 0 ? board.entries[highlightedIndex] : null;
                return (
                  <section key={board.id} className={styles.ledger} data-open={open ? "" : undefined} data-living={board.living ? "" : undefined}>
                    <button type="button" className={styles.ledgerHead} onClick={() => setOfficialOpen((current) => current === board.id ? "" : board.id)} aria-expanded={open}>
                      <span className={styles.recordMark} aria-hidden="true">{board.living ? "vivo" : "recorde"}</span>
                      <span className={styles.ledgerCopy}>
                        <strong>{board.label}</strong>
                        <small>{sentence(board.eyebrow)}</small>
                        <em>{board.entries[0] ? `${board.entries[0].label}: ${rankedValue(board.entries[0].value, board.unit)}` : "Ainda sem recorde registrado"}{highlighted && highlightedIndex > 0 ? `. ${highlighted.label} é ${rankingPosition(board.entries, highlightedIndex)}º` : ""}</em>
                      </span>
                      <span className={styles.toggleMark} aria-hidden="true">{open ? "−" : "+"}</span>
                    </button>
                    {open && (
                      <div className={styles.ledgerBody}>
                        <ol className={styles.ranking}>
                          {board.entries.map((entry, index) => (
                            <li key={`${board.id}-${entry.label}`} data-you={entry.highlight ? "" : undefined}>
                              <div><b className={styles.num}>{rankingPosition(board.entries, index)}º</b><strong>{entry.label}</strong><span className={styles.lead} aria-hidden="true" /><em className={styles.num}>{entry.value}</em></div>
                            </li>
                          ))}
                        </ol>
                        <p className={styles.footNote}>{board.cutoff}</p>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </section>
        )}
      </AlbumPage>
    </>
  );
}

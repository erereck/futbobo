"use client";

import { useMemo, useState } from "react";
import { CLUBS, countryById } from "../../game-data";
import type { DomesticTitleLedger } from "../../career/domestic-title-archive";
import type { WorldCompetitionLedger } from "../../career/world-memory";
import { buildClubDossier, CLUB_ARCHIVE_INDEX } from "../../career/club-dossiers";
import { ClubBadge } from "./CareerPrimitives";
import styles from "./ClubDossierPanel.module.css";

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export default function ClubDossierPanel({
  currentClubId,
  selectedClubId,
  onSelectClub,
  competitionLedgers,
  domesticLedgers,
}: {
  currentClubId: string;
  selectedClubId: string;
  onSelectClub: (clubId: string) => void;
  competitionLedgers: WorldCompetitionLedger[];
  domesticLedgers: DomesticTitleLedger[];
}) {
  const [query, setQuery] = useState("");
  const currentClub = CLUB_ARCHIVE_INDEX.find((club) => club.id === currentClubId);
  const selected = CLUB_ARCHIVE_INDEX.find((club) => club.id === selectedClubId) ?? currentClub;
  const dossier = useMemo(
    () => selected ? buildClubDossier(selected.id, competitionLedgers, domesticLedgers) : null,
    [selected, competitionLedgers, domesticLedgers],
  );
  const matches = useMemo(() => {
    const needle = normalized(query.trim());
    return CLUB_ARCHIVE_INDEX
      .filter((club) => needle ? normalized(club.name).includes(needle) : club.countryId === selected?.countryId)
      .sort((a, b) => a.id === selectedClubId ? -1 : b.id === selectedClubId ? 1 : a.name.localeCompare(b.name, "pt-BR"));
  }, [query, selected?.countryId, selectedClubId]);

  if (!dossier || !selected) return null;
  const playableClub = CLUBS.find((club) => club.id === selected.id);
  const brazilCup = dossier.competitions.find((item) => item.id === "domestic-copa-do-brasil");
  const otherCompetitions = dossier.competitions.filter((item) => item.id !== "domestic-copa-do-brasil");

  return <section className={styles.archive} aria-label="Arquivo por clube">
    <header className={styles.heading}>
      <span>ARQUIVO POR CLUBE</span>
      <strong>Taças e finais de cada clube.</strong>
      <p>Busque um clube para ver suas conquistas. A Copa do Brasil tem cada final registrada; o save acrescenta novas taças a cada temporada.</p>
    </header>
    <div className={styles.searchRow}>
      <label className={styles.search}>
        <span>Buscar clube</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do clube" autoComplete="off" />
      </label>
      {selectedClubId !== currentClubId && <button type="button" className={styles.myClub} onClick={() => { onSelectClub(currentClubId); setQuery(""); }}>Meu clube</button>}
    </div>
    <div className={styles.clubStrip} role="group" aria-label="Clubes encontrados">
      {matches.slice(0, 14).map((club) => <button type="button" key={club.id} className={club.id === selected.id ? styles.selectedClub : ""} aria-pressed={club.id === selected.id} onClick={() => { onSelectClub(club.id); setQuery(""); }}>{club.name}</button>)}
      {matches.length > 14 && <span>+{matches.length - 14} · refine a busca</span>}
      {matches.length === 0 && <span>Nenhum clube encontrado.</span>}
    </div>
    <article className={styles.dossier}>
      <div className={styles.identity}>
        <div className={styles.badge}>{playableClub ? <ClubBadge club={playableClub} size="lg" /> : <span>{selected.name.slice(0, 2).toLocaleUpperCase("pt-BR")}</span>}</div>
        <div><small>{countryById(selected.countryId).name.toLocaleUpperCase("pt-BR")} · FICHA DO CLUBE</small><strong>{selected.name}</strong><span>{dossier.totalTitles ? `${dossier.totalTitles} ${dossier.totalTitles === 1 ? "título registrado" : "títulos registrados"}` : "Em busca da primeira taça neste arquivo"}</span></div>
      </div>
      <div className={styles.metrics}>
        <div><strong>{dossier.totalTitles}</strong><span>Acervo total</span></div>
        <div><strong>{dossier.saveTitles}</strong><span>Neste save</span></div>
        <div><strong>{dossier.competitions.filter((item) => item.totalTitles > 0).length}</strong><span>Competições</span></div>
      </div>
      {brazilCup && <div className={`${styles.cupSpotlight} ${dossier.brazilCupFinals.length ? styles.cupSpotlightSplit : ""}`}>
        <div><small>COPA DO BRASIL</small><strong>{brazilCup.totalTitles} {brazilCup.totalTitles === 1 ? "conquista" : "conquistas"}</strong><span>{brazilCup.historicTitles} até 2025 · {brazilCup.saveTitles} neste save · {brazilCup.runnerUpYears.length} {brazilCup.runnerUpYears.length === 1 ? "vice" : "vices"}</span></div>
        <div className={styles.years}>{brazilCup.years.length ? brazilCup.years.map((year) => <span className={year.source === "historic" ? "" : styles.saveYear} key={year.season} title={year.source === "historic" ? "História real" : "Conquista neste save"}>{year.season}</span>) : <em>A primeira Copa do Brasil deste clube ainda pode acontecer.</em>}</div>
        {dossier.brazilCupFinals.length > 0 && <div className={styles.cupFinals} role="group" aria-label={`Finais da Copa do Brasil do ${selected.name}`}>
          <div className={styles.finalsHeading}><strong>Final por final</strong><span>{dossier.brazilCupFinals.length} {dossier.brazilCupFinals.length === 1 ? "decisão" : "decisões"}</span></div>
          <div className={styles.finalsList}>{dossier.brazilCupFinals.map((final) => <div className={final.result === "champion" ? styles.finalWon : ""} key={final.season}>
            <time>{final.season}</time><strong>{final.result === "champion" ? "Campeão" : "Vice"}</strong>{final.opponentId ? <button type="button" onClick={() => onSelectClub(final.opponentId)} title={`Abrir ficha de ${final.opponent}`}>{final.result === "champion" ? "sobre" : "contra"} {final.opponent} <span aria-hidden="true">↗</span></button> : <span>Final registrada</span>}<small>{final.source === "historic" ? "História" : "Seu save"}</small>
          </div>)}</div>
        </div>}
      </div>}
      {otherCompetitions.length > 0 && <div className={styles.honours}>
        {otherCompetitions.map((competition) => <div key={competition.id}>
          <div><strong>{competition.label}</strong><span>{competition.totalTitles} {competition.totalTitles === 1 ? "título" : "títulos"}</span></div>
          <small>{competition.historicTitles} na base histórica{competition.saveTitles ? ` · ${competition.saveTitles} neste save` : ""}</small>
          {competition.years.length > 0 && <p>{competition.years.slice(0, 12).map((year) => year.season).join(" · ")}{competition.years.length > 12 ? " · …" : ""}</p>}
        </div>)}
      </div>}
      {!dossier.totalTitles && !brazilCup && <p className={styles.empty}>Quando este clube ganhar uma competição registrada no Mundo, a taça aparecerá aqui.</p>}
      <footer>Títulos anteriores ao save aparecem como base histórica. Campeões de 2027 em diante pertencem à sua carreira.</footer>
    </article>
  </section>;
}

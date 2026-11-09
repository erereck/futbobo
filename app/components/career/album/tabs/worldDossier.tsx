"use client";

import { useMemo, useState } from "react";
import { CLUBS, countryById } from "../../../../game-data";
import type { DomesticTitleLedger } from "../../../../career/domestic-title-archive";
import type { WorldCompetitionLedger } from "../../../../career/world-memory";
import { buildClubDossier, CLUB_ARCHIVE_INDEX } from "../../../../career/club-dossiers";
import { ClubBadge } from "../../CareerPrimitives";
import { BlockTitle } from "../primitives";
import styles from "./worldTab.module.css";

function normalized(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
}

/** Ficha do clube no álbum: busca, escudo, acervo de taças e a Copa do Brasil final por final. */
export default function WorldDossier({
  currentClubId,
  selectedClubId,
  onSelectClub,
  onReturnToCup,
  competitionLedgers,
  domesticLedgers,
}: {
  currentClubId: string;
  selectedClubId: string;
  onSelectClub: (clubId: string) => void;
  onReturnToCup?: () => void;
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
      .filter((club) => needle ? normalized(club.name).includes(needle) || normalized(club.fullName).includes(needle) : club.countryId === selected?.countryId)
      .sort((a, b) => a.id === selectedClubId ? -1 : b.id === selectedClubId ? 1 : a.name.localeCompare(b.name, "pt-BR"));
  }, [query, selected?.countryId, selectedClubId]);

  if (!dossier || !selected) return null;
  const playableClub = CLUBS.find((club) => club.id === selected.id);
  const brazilCup = dossier.competitions.find((item) => item.id === "domestic-copa-do-brasil");
  const otherCompetitions = dossier.competitions.filter((item) => item.id !== "domestic-copa-do-brasil");
  const country = countryById(selected.countryId);

  return (
    <section className={styles.dossier} aria-label="Arquivo por clube">
      {onReturnToCup && <button type="button" className={styles.backLink} onClick={onReturnToCup}>Voltar às finais da Copa do Brasil</button>}

      <div className={styles.searchRow}>
        <label className={styles.search}>
          <span>Buscar clube</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do clube" autoComplete="off" />
        </label>
        {selectedClubId !== currentClubId && <button type="button" className={styles.myClub} onClick={() => { onSelectClub(currentClubId); setQuery(""); }}>Meu clube</button>}
      </div>
      <div className={styles.clubStrip} role="group" aria-label="Clubes encontrados">
        {matches.slice(0, 14).map((club) => (
          <button type="button" key={club.id} aria-pressed={club.id === selected.id} onClick={() => { onSelectClub(club.id); setQuery(""); }}>{club.name}</button>
        ))}
        {matches.length > 14 && <span>mais {matches.length - 14}: refine a busca</span>}
        {matches.length === 0 && <span>Nenhum clube encontrado.</span>}
      </div>

      <article className={styles.clubCard}>
        <div className={styles.clubIdentity}>
          <span className={styles.clubCrest}>
            {playableClub ? <ClubBadge club={playableClub} size="lg" /> : <b>{selected.name.slice(0, 2).toLocaleUpperCase("pt-BR")}</b>}
          </span>
          <div>
            <small>{country.name}</small>
            <strong>{selected.name}</strong>
            <span>{dossier.totalTitles ? `${dossier.totalTitles} ${dossier.totalTitles === 1 ? "título registrado" : "títulos registrados"}` : "Em busca da primeira taça neste arquivo"}</span>
          </div>
        </div>
        <dl className={styles.clubNumbers}>
          <div><dd>{dossier.totalTitles}</dd><dt>no acervo</dt></div>
          <div><dd>{dossier.saveTitles}</dd><dt>neste save</dt></div>
          <div><dd>{dossier.competitions.filter((item) => item.totalTitles > 0).length}</dd><dt>competições</dt></div>
        </dl>

        {brazilCup && (
          <section className={styles.cupBlock} aria-label="Copa do Brasil">
            <BlockTitle>Copa do Brasil: {brazilCup.totalTitles} {brazilCup.totalTitles === 1 ? "conquista" : "conquistas"}</BlockTitle>
            <p className={styles.cupNote}>{brazilCup.historicTitles} até 2025, {brazilCup.saveTitles} neste save, {brazilCup.runnerUpYears.length} {brazilCup.runnerUpYears.length === 1 ? "vice" : "vices"}</p>
            <div className={styles.yearStamps}>
              {brazilCup.years.length
                ? brazilCup.years.map((year) => <span key={year.season} data-save={year.source === "historic" ? undefined : ""} title={year.source === "historic" ? "História real" : "Conquista neste save"}>{year.season}</span>)
                : <em>A primeira Copa do Brasil deste clube ainda pode acontecer.</em>}
            </div>
            {dossier.brazilCupFinals.length > 0 && (
              <div className={styles.finals} role="group" aria-label={`Finais da Copa do Brasil do ${selected.name}`}>
                <p className={styles.finalsHead}><strong>Final por final</strong><span>{dossier.brazilCupFinals.length} {dossier.brazilCupFinals.length === 1 ? "decisão" : "decisões"}</span></p>
                <ol>
                  {dossier.brazilCupFinals.map((final) => (
                    <li key={final.season} data-won={final.result === "champion" ? "" : undefined}>
                      <time>{final.season}</time>
                      <strong>{final.result === "champion" ? "Campeão" : "Vice"}</strong>
                      {final.opponentId
                        ? <button type="button" onClick={() => onSelectClub(final.opponentId)} title={`Abrir ficha de ${final.opponent}`}>{final.result === "champion" ? "sobre" : "contra"} {final.opponent}</button>
                        : <span>Final registrada</span>}
                      <small>{final.source === "historic" ? "História" : "Seu save"}</small>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}

        {otherCompetitions.length > 0 && (
          <div className={styles.honours}>
            {otherCompetitions.map((competition) => (
              <div key={competition.id}>
                <p><strong>{competition.label}</strong><b className={styles.num}>{competition.totalTitles}</b></p>
                <small>{competition.historicTitles} na base histórica{competition.saveTitles ? `, ${competition.saveTitles} neste save` : ""}</small>
                {competition.years.length > 0 && <span>{competition.years.slice(0, 12).map((year) => year.season).join(", ")}{competition.years.length > 12 ? "…" : ""}</span>}
              </div>
            ))}
          </div>
        )}
        {!dossier.totalTitles && !brazilCup && <p className={styles.emptyNote}>Quando este clube ganhar uma competição registrada no Mundo, a taça aparece aqui.</p>}
        <p className={styles.footNote}>Títulos anteriores ao save aparecem como base histórica. Campeões de 2027 em diante pertencem à sua carreira.</p>
      </article>
    </section>
  );
}

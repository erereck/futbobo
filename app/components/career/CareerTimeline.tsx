"use client";

import { useMemo } from "react";
import type { GameState } from "../../career/model";
import { clubById } from "../../career/shared";
import { seasonAverageRating } from "../../career/performance";
import { ClubBadge, NationBadge } from "./CareerPrimitives";
import { countryById } from "../../game-data";
import styles from "./CareerTimeline.module.css";

function strongestAward(awards: string[]) {
  return awards.find((award) => award === "Bola de Ouro")
    ?? awards.find((award) => award.includes("MVP") || award.includes("Jogador do Ano") || award.includes("Rei da América"))
    ?? awards[0]
    ?? "";
}

export default function CareerTimeline({ state, archived = false }: { state: GameState; archived?: boolean }) {
  const rows = useMemo(() => state.history.map((record, index) => {
    const previous = index > 0 ? state.history[index - 1] : null;
    const club = clubById(record.clubId);
    const titles = record.competitions.filter((competition) => competition.champion);
    const award = strongestAward(record.awards);
    const national = state.nationalHistory.find((entry) => entry.season === record.season && (entry.champion || entry.name === "Copa do Mundo"));
    return {
      record,
      club,
      moved: Boolean(previous && previous.clubId !== record.clubId),
      titles,
      award,
      national,
      rating: record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, state.seed, record.season),
    };
  }).reverse(), [state.history, state.nationalHistory, state.seed]);

  const currentClub = clubById(state.currentClubId || state.academyClubId);

  return (
    <div className={`panel-screen screen-enter ${styles.page}`}>
      <header className={styles.heading}>
        <span>HISTÓRICO</span>
        <strong>A carreira, ano a ano.</strong>
      </header>

      <section className={styles.timeline}>
        <article className={`${styles.row} ${styles.current}`}>
          <time>{archived ? "FINAL" : "AGORA"}</time>
          <span className={styles.rail}><i /></span>
          <ClubBadge club={currentClub} size="sm" />
          <div className={styles.copy}>
            <small>{state.season} · {state.age} anos</small>
            <strong>{currentClub.shortName}</strong>
            <p>{state.position} · {state.overall} OVR · {archived ? "carreira encerrada" : "temporada em andamento"}</p>
          </div>
          <b className={styles.ovr}>{state.overall}<small>OVR</small></b>
        </article>

        {rows.map(({ record, club, moved, titles, award, national, rating }) => {
          const highlights = [
            moved ? "TRANSFERÊNCIA" : "",
            titles[0]?.name ?? "",
            award,
            national ? `${national.name}${national.champion ? " · CAMPEÃO" : ` · ${national.stage}`}` : "",
          ].filter(Boolean).slice(0, 3);
          return (
            <article className={styles.row} key={`${record.season}-${record.clubId}`}>
              <time>{record.season}</time>
              <span className={styles.rail}><i /></span>
              <ClubBadge club={club} size="sm" />
              <div className={styles.copy}>
                <small>{record.age} anos</small>
                <strong>{club.shortName}</strong>
                <p>{record.position} · {record.appearances}J · {record.position === "GOL" ? `${record.cleanSheets} sem sofrer` : `${record.goals}G · ${record.assists}A`} · nota {rating.toFixed(1)}</p>
                {highlights.length > 0 && <div className={styles.highlights}>{highlights.map((highlight) => <span key={highlight}>{highlight}</span>)}</div>}
                {national?.champion && <div className={styles.nation}><NationBadge country={countryById(state.nationality)} size="sm" /><span>{countryById(state.nationality).name}</span></div>}
              </div>
              <b className={styles.ovr}>{record.overall}<small>OVR</small></b>
            </article>
          );
        })}

        {rows.length === 0 && <div className={styles.empty}>A primeira temporada profissional abre a linha do tempo.</div>}
      </section>
    </div>
  );
}

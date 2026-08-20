"use client";

import type { GameState } from "../../career/model";
import { countryById } from "../../game-data";
import { NationBadge } from "./CareerPrimitives";
import styles from "./CareerExtraStats.module.css";

export default function CareerExtraStats({ state }: { state: GameState }) {
  const nation = countryById(state.nationality);
  return (
    <section className={styles.grid}>
      <article className={styles.national}>
        <header><NationBadge country={nation} size="md" /><span><small>SELEÇÃO</small><strong>{nation.name}</strong></span></header>
        <div><b>{state.nationalCaps}<small>JOGOS</small></b><b>{state.nationalGoals}<small>GOLS</small></b><b>{state.nationalAssists}<small>ASSIST.</small></b><b>{state.nationalTrophies}<small>TAÇAS</small></b></div>
      </article>
      <article className={styles.discipline}>
        <header><small>DISCIPLINA</small><strong>Registro profissional</strong></header>
        <div><b>{state.stats.yellowCards}<small>AMARELOS</small></b><b>{state.stats.redCards}<small>VERMELHOS</small></b><b>{state.stats.tackles}<small>DESARMES</small></b><b>{state.objectivesCompleted}<small>METAS</small></b></div>
      </article>
    </section>
  );
}

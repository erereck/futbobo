"use client";

import { useMemo, useState } from "react";
import { countryById } from "../../game-data";
import type { GameState } from "../../career/model";
import { buildWorldSnapshot, worldPulseForState } from "../../career/world-memory";
import { NationBadge } from "./CareerPrimitives";
import styles from "./CareerWorld.module.css";

const CATEGORY_LABELS = {
  "world-cup": "MUNDIAL",
  career: "CARREIRA",
  transfer: "MERCADO",
  award: "PRÊMIOS",
  rival: "GERAÇÃO",
  record: "RECORDE",
} as const;

export function WorldPulseButton({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const pulse = useMemo(() => worldPulseForState(state), [state]);
  if (!pulse) return null;
  return (
    <button type="button" className={styles.pulse} onClick={onOpen}>
      <span><i /> MUNDO</span>
      <strong>{pulse.title}</strong>
      <b>→</b>
    </button>
  );
}

export default function CareerWorld({ state }: { state: GameState }) {
  const [rankingOpen, setRankingOpen] = useState(false);
  const snapshot = useMemo(() => buildWorldSnapshot(state), [state]);
  const featured = snapshot.news[0];
  const ranking = snapshot.worldCupRanking;
  const leader = ranking[0];
  const playerNation = ranking.find((entry) => entry.countryId === state.nationality);
  const recentWorldCups = [...snapshot.worldCupChampions].reverse().slice(0, 4);

  return (
    <div className={`panel-screen screen-enter ${styles.page}`}>
      <header className={styles.heading}>
        <span>MUNDO</span>
        <strong>O futebol continua.</strong>
      </header>

      {featured ? (
        <article className={`${styles.featured} ${featured.priority === "major" ? styles.major : ""}`}>
          <small>{CATEGORY_LABELS[featured.category]} · {featured.season}</small>
          <strong>{featured.title}</strong>
          <p>{featured.summary}</p>
        </article>
      ) : (
        <div className={styles.empty}>As primeiras manchetes aparecem quando a carreira profissional começa.</div>
      )}

      {snapshot.news.length > 1 && (
        <section className={styles.newsSection}>
          <header><span>NOTÍCIAS</span><small>Mais recentes</small></header>
          <div>
            {snapshot.news.slice(1, 9).map((item) => (
              <article key={item.id}>
                <time>{item.season}</time>
                <span><small>{CATEGORY_LABELS[item.category]}</small><strong>{item.title}</strong><p>{item.summary}</p></span>
                {item.priority === "major" && <b>●</b>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className={styles.worldCupCard}>
        <button type="button" onClick={() => setRankingOpen((open) => !open)} aria-expanded={rankingOpen}>
          <span className={styles.trophy}>◎</span>
          <span>
            <small>COPA DO MUNDO · TÍTULOS</small>
            <strong>{leader ? `${countryById(leader.countryId).name} lidera com ${leader.titles}` : "Ranking mundial"}</strong>
            {playerNation && <em>{countryById(state.nationality).name}: #{playerNation.rank} · {playerNation.titles} título(s)</em>}
          </span>
          <b>{rankingOpen ? "−" : "+"}</b>
        </button>

        <div className={styles.recentChampions}>
          {recentWorldCups.map((champion) => (
            <span key={`${champion.season}-${champion.winnerCountryId}`}>
              <NationBadge country={countryById(champion.winnerCountryId)} size="sm" />
              <small>{champion.season}</small>
              <strong>{countryById(champion.winnerCountryId).name}</strong>
            </span>
          ))}
        </div>

        {rankingOpen && (
          <div className={styles.ranking}>
            {ranking.map((entry) => {
              const country = countryById(entry.countryId);
              return (
                <article className={entry.countryId === state.nationality ? styles.playerCountry : ""} key={entry.countryId}>
                  <b>#{entry.rank}</b>
                  <NationBadge country={country} size="sm" />
                  <strong>{country.name}</strong>
                  <span>{entry.titles}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

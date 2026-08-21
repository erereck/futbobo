"use client";

import { useMemo, useState } from "react";
import { countryById } from "../../game-data";
import type { GameState } from "../../career/model";
import { footballRankingsForState } from "../../career/official-football-records";
import { historicalRecordBoardsForState } from "../../career/historical-records";
import { buildWorldSnapshot, worldPulseForState } from "../../career/world-memory";
import { clubById } from "../../career/shared";
import { ClubBadge, NationBadge } from "./CareerPrimitives";
import styles from "./CareerWorld.module.css";

const CATEGORY_LABELS = {
  "world-cup": "MUNDIAL",
  career: "CARREIRA",
  transfer: "MERCADO",
  award: "PRÊMIOS",
  rival: "GERAÇÃO",
  record: "RECORDE",
} as const;

function rankingPosition(entries: Array<{ value: number }>, index: number) {
  if (index <= 0) return 1;
  return entries.findIndex((entry) => entry.value === entries[index].value) + 1;
}

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
  const [competitionOpen, setCompetitionOpen] = useState<string>("");
  const [officialOpen, setOfficialOpen] = useState<string>("");
  const snapshot = useMemo(() => buildWorldSnapshot(state), [state]);
  const officialRankings = useMemo(
    () => [...historicalRecordBoardsForState(state), ...footballRankingsForState(state)],
    [state],
  );
  const featured = snapshot.news[0];
  const ranking = snapshot.worldCupRanking;
  const leader = ranking[0];
  const playerNation = ranking.find((entry) => entry.countryId === state.nationality);
  const recentWorldCups = [...snapshot.worldCupChampions].reverse().slice(0, 4);
  const clubCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "club");

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
        <div className={styles.empty}>
          <strong>O arquivo já está aberto.</strong>
          <span>Sua carreira ainda não virou manchete.</span>
        </div>
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
          {recentWorldCups.map((champion) => {
            const country = countryById(champion.winnerCountryId);
            return (
              <span key={`${champion.season}-${champion.winnerCountryId}`}>
                <span className={styles.flagWrap}><NationBadge country={country} size="sm" /></span>
                <small>{champion.season}</small>
                <strong>{country.name}</strong>
              </span>
            );
          })}
        </div>

        {rankingOpen && (
          <div className={styles.ranking}>
            {ranking.map((entry) => {
              const country = countryById(entry.countryId);
              return (
                <article className={entry.countryId === state.nationality ? styles.playerCountry : ""} key={entry.countryId}>
                  <b>#{entry.rank}</b>
                  <span className={styles.rankingFlag}><NationBadge country={country} size="sm" /></span>
                  <strong>{country.name}</strong>
                  <span>{entry.titles}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {clubCompetitions.map((ledger) => {
        const open = competitionOpen === ledger.id;
        const leaderEntry = ledger.titleTable[0];
        const leaderClub = leaderEntry ? clubById(leaderEntry.entityId) : null;
        const currentClubEntry = ledger.titleTable.find((entry) => entry.entityId === state.currentClubId);
        const recentChampions = [...ledger.champions].reverse().slice(0, 4);
        return (
          <section className={styles.worldCupCard} key={ledger.id}>
            <button type="button" onClick={() => setCompetitionOpen((current) => current === ledger.id ? "" : ledger.id)} aria-expanded={open}>
              <span className={styles.trophy}>◇</span>
              <span>
                <small>{ledger.label.toLocaleUpperCase("pt-BR")} · TÍTULOS</small>
                <strong>{leaderClub && leaderEntry ? `${leaderClub.shortName} lidera com ${leaderEntry.titles}` : ledger.label}</strong>
                {currentClubEntry && <em>{clubById(state.currentClubId).shortName}: #{currentClubEntry.rank} · {currentClubEntry.titles} título(s)</em>}
              </span>
              <b>{open ? "−" : "+"}</b>
            </button>

            {recentChampions.length > 0 && (
              <div className={styles.recentChampions}>
                {recentChampions.map((champion) => {
                  const club = clubById(champion.winnerId);
                  return (
                    <span key={`${ledger.id}-${champion.season}-${champion.winnerId}`}>
                      <span className={styles.flagWrap}><ClubBadge club={club} size="sm" /></span>
                      <small>{champion.season}</small>
                      <strong>{club.shortName}</strong>
                    </span>
                  );
                })}
              </div>
            )}

            {open && (
              <div className={styles.ranking}>
                {ledger.titleTable.map((entry) => {
                  const club = clubById(entry.entityId);
                  return (
                    <article className={entry.entityId === state.currentClubId ? styles.playerCountry : ""} key={entry.entityId}>
                      <b>#{entry.rank}</b>
                      <span className={styles.rankingFlag}><ClubBadge club={club} size="sm" /></span>
                      <strong>{club.shortName}</strong>
                      <span>{entry.titles}</span>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <section className={styles.officialSection}>
        <header>
          <span>ARQUIVO VIVO</span>
          <small>História real + seu universo</small>
        </header>
        <div>
          {officialRankings.map((board) => {
            const open = officialOpen === board.id;
            const leaderEntry = board.entries[0];
            const highlightedIndex = board.entries.findIndex((entry) => entry.highlight);
            const highlighted = highlightedIndex >= 0 ? board.entries[highlightedIndex] : null;
            const highlightedRank = highlighted ? rankingPosition(board.entries, highlightedIndex) : 0;
            return (
              <article className={`${styles.officialCard} ${board.living ? styles.livingCard : ""}`} key={board.id}>
                <button type="button" onClick={() => setOfficialOpen((current) => current === board.id ? "" : board.id)} aria-expanded={open}>
                  <span>
                    <small>{board.eyebrow}</small>
                    <strong>{board.label}</strong>
                    <em>
                      {leaderEntry.label} · {leaderEntry.value} {board.unit}
                      {highlighted && highlighted.label !== leaderEntry.label ? ` · ${highlighted.label} #${highlightedRank}` : ""}
                    </em>
                  </span>
                  <b>{open ? "−" : "+"}</b>
                </button>
                {open && (
                  <div className={styles.officialRanking}>
                    <div className={styles.officialRows}>
                      {board.entries.map((entry, index) => (
                        <div className={entry.highlight ? styles.livingEntry : ""} key={`${board.id}-${entry.label}`}>
                          <b>#{rankingPosition(board.entries, index)}</b>
                          <strong>{entry.label}</strong>
                          <span>{entry.value}</span>
                        </div>
                      ))}
                    </div>
                    <small>{board.cutoff}</small>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

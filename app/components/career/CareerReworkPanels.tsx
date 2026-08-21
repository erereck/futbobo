"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { GameState } from "../../career/model";
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABELS,
  POSITION_PRIMARY_ATTRIBUTES,
  attributeAverage,
  attributeTone,
} from "../../career/state";
import { formatFollowers, formatMoney, marketValue, seasonAverageRating } from "../../career/performance";
import { clubById } from "../../career/shared";
import { ClubBadge, TrophyGallery } from "./CareerPrimitives";
import styles from "./CareerReworkPanels.module.css";
import FutboboIcon from "../FutboboIcon";

export function PlayerReworkPanels({ state }: { state: GameState }) {
  const [followersOpen, setFollowersOpen] = useState(false);
  const club = clubById(state.currentClubId || state.academyClubId);
  const primaryKeys = POSITION_PRIMARY_ATTRIBUTES[state.position] ?? [];
  const keyAverage = Math.round(attributeAverage(state.attributes, primaryKeys));
  const peakFollowers = Math.max(1, ...state.history.map((record) => record.followers ?? 0), state.followers);
  const sponsorValue = state.sponsorHistory.reduce((sum, deal) => sum + deal.annualValue * Math.max(1, deal.endSeason - deal.startSeason), 0)
    + (state.activeSponsor ? state.activeSponsor.annualValue * Math.max(1, state.activeSponsor.endSeason - state.season) : 0);

  return (
    <div className={styles.playerStack}>
      <section className={styles.playerEssentials}>
        <header className={styles.sectionHeading}>
          <div><span>JOGADOR</span><strong>O que importa em campo.</strong></div>
          <b>{keyAverage}<small>MÉDIA-CHAVE</small></b>
        </header>

        <div className={styles.keyAttributes}>
          {primaryKeys.map((key) => (
            <article key={key}>
              <span>{ATTRIBUTE_LABELS[key]}</span>
              <strong style={{ color: attributeTone(state.attributes[key]) }}>{state.attributes[key]}</strong>
            </article>
          ))}
        </div>

        <div className={styles.attributeGroups}>
          {ATTRIBUTE_GROUPS.map((group) => (
            <article key={group.label}>
              <header><strong>{group.label}</strong></header>
              <div>
                {group.keys.map((key) => {
                  const value = state.attributes[key];
                  const primary = primaryKeys.includes(key);
                  return (
                    <div className={primary ? styles.primaryAttribute : ""} key={key}>
                      <span>{ATTRIBUTE_LABELS[key]}</span>
                      <i><em style={{ width: `${value}%`, background: attributeTone(value) }} /></i>
                      <b style={{ color: attributeTone(value) }}>{value}</b>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.publicProfile}>
        <button type="button" className={styles.followersCard} onClick={() => setFollowersOpen(true)}>
          <small>SEGUIDORES</small>
          <strong>{formatFollowers(state.followers)}</strong>
          <span>Ver alcance e marcos <b><FutboboIcon name="arrow-right" /></b></span>
        </button>

        <article className={styles.sponsorCard}>
          <header><span>PATROCÍNIO</span><b><FutboboIcon name="tag" /></b></header>
          {state.activeSponsor ? (
            <>
              <strong>{state.activeSponsor.brand}</strong>
              <p>{formatMoney(state.activeSponsor.annualValue)}/ano · {Math.max(0, state.activeSponsor.endSeason - state.season)} temporada(s) restante(s)</p>
            </>
          ) : (
            <><strong>Sem patrocinador ativo</strong><p>Uma nova marca pode aparecer conforme sua carreira cresce.</p></>
          )}
          <footer>{state.sponsorHistory.length} parceria(s) concluída(s) · {formatMoney(sponsorValue)} em contratos</footer>
        </article>

        <article className={styles.playerValueCard}>
          <span>VALOR DE MERCADO</span>
          <strong>{formatMoney(marketValue(state.overall, state.age, club, state.reputation, state.history.at(-1)))}</strong>
          <small>{club.shortName} · {state.age} anos</small>
        </article>
      </section>

      {followersOpen && typeof document !== "undefined" && createPortal((
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.currentTarget === event.target) setFollowersOpen(false); }}>
          <section className={styles.followersModal}>
            <header><div><span>ALCANCE</span><strong>{formatFollowers(state.followers)} seguidores</strong></div><button type="button" onClick={() => setFollowersOpen(false)}>×</button></header>
            {state.history.some((record) => (record.followers ?? 0) > 0) ? (
              <div className={styles.audienceHistory}>
                {state.history.slice(-10).map((record) => {
                  const value = record.followers ?? 0;
                  return <article key={`${record.season}-${record.clubId}`}><small>{record.season}</small><i><em style={{ width: `${Math.max(3, value / peakFollowers * 100)}%` }} /></i><strong>{formatFollowers(value)}</strong></article>;
                })}
              </div>
            ) : <p className={styles.emptyText}>Seu histórico de audiência começa a aparecer depois das primeiras temporadas.</p>}
            <div className={styles.milestones}>
              <span>MARCOS DIGITAIS</span>
              {state.offFieldMilestones.length ? [...state.offFieldMilestones].reverse().map((milestone) => <strong key={milestone}>✦ {milestone}</strong>) : <p>Nenhum marco digital registrado ainda.</p>}
            </div>
          </section>
        </div>
      ), document.body)}
    </div>
  );
}

export function CareerStatisticsArchive({ state }: { state: GameState }) {
  const awards = useMemo(() => Object.entries(state.awardCabinet)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]), [state.awardCabinet]);
  const clubs = useMemo(() => new Set(state.history.map((record) => record.clubId)).size, [state.history]);

  return (
    <section className={styles.statisticsArchive}>
      <header className={styles.archiveHeading}>
        <div><span>ARQUIVO DA CARREIRA</span><strong>Temporadas, taças e prêmios.</strong></div>
        <aside><b>{state.history.length}</b><small>TEMPORADAS</small><b>{clubs || (state.currentClubId ? 1 : 0)}</b><small>CLUBES</small></aside>
      </header>

      <TrophyGallery state={state} />

      <section className={styles.seasonArchive}>
        <header><span>TRAJETÓRIA</span><strong>Temporada por temporada</strong></header>
        <div>
          {[...state.history].reverse().map((record) => {
            const club = clubById(record.clubId);
            const rating = record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, state.seed, record.season);
            const titles = record.competitions.filter((competition) => competition.champion).length;
            return (
              <article key={`${record.season}-${record.clubId}`}>
                <time>{record.season}</time>
                <ClubBadge club={club} size="sm" />
                <span><strong>{club.shortName}</strong><small>{record.position} · {record.appearances}J · {record.position === "GOL" ? `${record.cleanSheets} sem sofrer` : `${record.goals}G · ${record.assists}A`} · nota {rating.toFixed(1)}</small></span>
                <b>{record.overall}<small>OVR</small></b>
                {titles > 0 && <em>🏆 {titles}</em>}
              </article>
            );
          })}
          {state.history.length === 0 && <p className={styles.emptyText}>A primeira temporada profissional vai inaugurar o arquivo.</p>}
        </div>
      </section>

      <section className={styles.awardsArchive}>
        <header><span>PRÊMIOS INDIVIDUAIS</span><strong>{awards.reduce((total, [, count]) => total + count, 0)}</strong></header>
        {awards.length ? <div>{awards.map(([award, count]) => <article key={award}><span>{award}</span><b>{count}×</b></article>)}</div> : <p className={styles.emptyText}>Nenhum prêmio individual conquistado ainda.</p>}
      </section>
    </section>
  );
}

"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { Club } from "../../../../game-data";
import { countryById } from "../../../../game-data";
import type { GameState, SeasonRecord } from "../../../../career/model";
import { clubById } from "../../../../career/shared";
import { seasonAverageRating } from "../../../../career/performance";
import { ClubBadge, NationBadge } from "../../CareerPrimitives";
import FutboboIcon from "../../../FutboboIcon";
import { AlbumPage } from "../AlbumShell";
import { BlockTitle, InkBand, albumPrimitives } from "../primitives";
import { clubInks } from "../inks";
import styles from "./historyTab.module.css";

/** Mesmo critério da linha do tempo antiga: Bola de Ouro, depois prêmios de "melhor do ano", depois o primeiro. */
function strongestAward(awards: string[]) {
  return awards.find((award) => award === "Bola de Ouro")
    ?? awards.find((award) => award.includes("MVP") || award.includes("Jogador do Ano") || award.includes("Rei da América"))
    ?? awards[0]
    ?? "";
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const TILTS = ["-1.4deg", ".9deg", "-.6deg", "1.3deg", "-1deg", ".5deg"];

/** Aba Histórico: a carreira como coleção, uma figurinha por temporada. */
export default function HistoryTab({ game, club }: { game: GameState; club: Club }) {
  const seasons = useMemo(() => game.history.map((record, index) => {
    const previous = index > 0 ? game.history[index - 1] : null;
    const seasonClub = clubById(record.clubId);
    return {
      record,
      club: seasonClub,
      moved: Boolean(previous && previous.clubId !== record.clubId),
      titles: record.competitions.filter((competition) => competition.champion),
      award: strongestAward(record.awards),
      national: game.nationalHistory.find((entry) => entry.season === record.season && (entry.champion || entry.name === "Copa do Mundo")),
      rating: record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season),
    };
  }).reverse(), [game.history, game.nationalHistory, game.seed]);

  // As camisas na ordem em que foram vestidas.
  const shirts = useMemo(() => {
    const byClub = new Map<string, { club: Club; first: number; last: number; seasons: number; titles: number }>();
    for (const record of game.history) {
      const entry = byClub.get(record.clubId) ?? { club: clubById(record.clubId), first: record.season, last: record.season, seasons: 0, titles: 0 };
      entry.first = Math.min(entry.first, record.season);
      entry.last = Math.max(entry.last, record.season);
      entry.seasons += 1;
      entry.titles += record.competitions.filter((competition) => competition.champion).length;
      byClub.set(record.clubId, entry);
    }
    if (!byClub.has(club.id)) byClub.set(club.id, { club, first: game.season, last: game.season, seasons: 0, titles: 0 });
    return [...byClub.values()].sort((a, b) => a.first - b.first);
  }, [game.history, game.season, club]);

  const clubTitles = game.history.reduce((total, record) => total + record.competitions.filter((competition) => competition.champion).length, 0);
  const totalTitles = clubTitles + game.nationalTrophies;
  const peakOverall = Math.max(game.overall, ...game.history.map((record) => record.overall));
  const nation = countryById(game.nationality);

  // As primeiras vezes que contam, na ordem em que aconteceram.
  const milestones = useMemo(() => {
    const list: Array<{ season: number; label: string; detail: string }> = [];
    const rating = (record: SeasonRecord) => record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season);
    const debut = game.history[0];
    if (debut) list.push({ season: debut.season, label: "Estreia profissional", detail: clubById(debut.clubId).shortName });
    const firstTitle = game.history.find((record) => record.competitions.some((competition) => competition.champion));
    const firstTitleName = firstTitle?.competitions.find((competition) => competition.champion)?.name;
    if (firstTitle && firstTitleName) list.push({ season: firstTitle.season, label: "Primeiro título", detail: `${firstTitleName}, ${clubById(firstTitle.clubId).shortName}` });
    const firstCall = game.nationalHistory.find((record) => record.tier !== "none");
    if (firstCall) list.push({ season: firstCall.season, label: "Primeira convocação", detail: firstCall.name });
    const firstAward = game.history.find((record) => record.awards.length > 0);
    if (firstAward) list.push({ season: firstAward.season, label: "Primeiro prêmio", detail: strongestAward(firstAward.awards) });
    if (game.history.length > 1) {
      const best = game.history.reduce((top, record) => (rating(record) > rating(top) ? record : top));
      list.push({ season: best.season, label: "Maior nota", detail: `${rating(best).toFixed(1)}, ${clubById(best.clubId).shortName}` });
    }
    return list.sort((a, b) => a.season - b.season);
  }, [game.history, game.nationalHistory, game.seed]);

  return (
    <>
      <AlbumPage side="left" label="Histórico">
        <InkBand
          ink="ink"
          title="Histórico"
          subtitle={game.history.length ? `De ${game.history[0].season} a ${game.season}, ${plural(shirts.length, "camisa", "camisas")}` : "A coleção começa na estreia"}
          aside={<span className={albumPrimitives.pageNo} aria-label={`${game.history.length} temporadas`}><b className={albumPrimitives.num}>{game.history.length}</b><small>temp.</small></span>}
        />

        <dl className={styles.totals}>
          <div><dt>Temporadas</dt><dd className={styles.num}>{game.history.length}</dd></div>
          <div><dt>Clubes</dt><dd className={styles.num}>{shirts.length}</dd></div>
          <div><dt>Títulos</dt><dd className={styles.num}>{totalTitles}</dd></div>
          <div><dt>Pico de OVR</dt><dd className={styles.num}>{peakOverall}</dd></div>
        </dl>

        <section className={styles.shirts} aria-labelledby="camisas-titulo">
          <BlockTitle id="camisas-titulo" note="na ordem em que foram vestidas">Camisas da carreira</BlockTitle>
          <ol>
            {shirts.map((shirt) => {
              const current = shirt.club.id === club.id;
              return (
                <li key={shirt.club.id} className={styles.shirt} data-current={current ? "" : undefined} style={clubInks(shirt.club.primary, shirt.club.secondary)}>
                  <span className={styles.shirtCrest}><ClubBadge club={shirt.club} size="sm" /></span>
                  <span className={styles.shirtCopy}>
                    <strong>{shirt.club.shortName}</strong>
                    <small className={styles.num}>
                      {shirt.seasons === 0 ? `Desde ${shirt.first}` : shirt.first === shirt.last ? shirt.first : `${shirt.first}–${current ? "hoje" : shirt.last}`}
                      {shirt.seasons > 0 && `, ${plural(shirt.seasons, "temporada", "temporadas")}`}
                    </small>
                  </span>
                  {shirt.titles > 0 && <b className={styles.shirtTitles} aria-label={plural(shirt.titles, "título", "títulos")}><FutboboIcon name="trophy" /><span className={styles.num}>{shirt.titles}</span></b>}
                  {current && <em className={styles.nowTag}>agora</em>}
                </li>
              );
            })}
          </ol>
        </section>

        {milestones.length > 0 && (
          <section className={styles.milestones} aria-labelledby="marcos-titulo">
            <BlockTitle id="marcos-titulo">Marcos da carreira</BlockTitle>
            <ol>
              {milestones.map((milestone) => (
                <li key={milestone.label}>
                  <time className={styles.num}>{milestone.season}</time>
                  <span><strong>{milestone.label}</strong>{milestone.detail}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {game.nationalCaps > 0 && (
          <p className={styles.nationLine}>
            <NationBadge country={nation} size="sm" />
            <span><strong>{nation.name}</strong> {plural(game.nationalCaps, "jogo", "jogos")} pela seleção{game.nationalTrophies > 0 ? `, ${plural(game.nationalTrophies, "título", "títulos")}` : ""}.</span>
          </p>
        )}
      </AlbumPage>

      <AlbumPage side="right" label="Temporadas coladas">
        <header className={styles.gridHead}>
          <BlockTitle as="h2" note={plural(seasons.length, "figurinha colada", "figurinhas coladas")}>Temporadas</BlockTitle>
        </header>

        <ol className={styles.grid}>
          {/* A página aberta: o ano que ainda está sendo jogado. */}
          <li className={styles.openSlot} style={clubInks(club.primary, club.secondary)} aria-label={`Agora: ${game.season}, ${game.age} anos, ${club.shortName}, OVR ${game.overall}`}>
            <span className={`${styles.slotYear} ${styles.num}`} aria-hidden="true">{game.season}</span>
            <span className={styles.slotNow}>Agora</span>
            <span className={styles.slotClub}><ClubBadge club={club} size="sm" /><strong>{club.shortName}</strong></span>
            <span className={styles.slotMeta}>{game.age} anos, {game.position}, OVR {game.overall}</span>
            <span className={styles.slotHint}>temporada em andamento</span>
          </li>

          {seasons.map(({ record, club: seasonClub, moved, titles, award, national, rating }, index) => {
            const shiny = titles.length > 0;
            return (
              <li
                key={`${record.season}-${record.clubId}`}
                className={styles.season}
                data-shiny={shiny ? "" : undefined}
                style={{ ...clubInks(seasonClub.primary, seasonClub.secondary), "--tilt": TILTS[index % TILTS.length] } as CSSProperties}
              >
                <article className={styles.face} aria-label={`${record.season}, ${seasonClub.shortName}`}>
                  <header className={styles.band}>
                    <span className={`${styles.year} ${styles.num}`}>{record.season}</span>
                    <span className={styles.crest}><ClubBadge club={seasonClub} size="sm" /></span>
                    <span className={styles.ovr} aria-label={`OVR ${record.overall}`}><b className={styles.num}>{record.overall}</b><small>OVR</small></span>
                  </header>
                  <div className={styles.body}>
                    <p className={styles.who}><strong>{seasonClub.shortName}</strong> {record.age} anos, {record.position}</p>
                    <dl className={styles.line}>
                      <div><dt>jogos</dt><dd className={styles.num}>{record.appearances}</dd></div>
                      {record.position === "GOL" ? (
                        <div className={styles.wide}><dt>sem sofrer</dt><dd className={styles.num}>{record.cleanSheets}</dd></div>
                      ) : (
                        <>
                          <div><dt>gols</dt><dd className={styles.num}>{record.goals}</dd></div>
                          <div><dt>assist.</dt><dd className={styles.num}>{record.assists}</dd></div>
                        </>
                      )}
                      <div><dt>nota</dt><dd className={styles.num} data-tone={rating >= 8 ? "high" : rating < 6.5 ? "low" : undefined}>{rating.toFixed(1)}</dd></div>
                    </dl>
                    {(titles.length > 0 || award || national) && (
                      <ul className={styles.highlights}>
                        {titles.map((title) => <li key={title.id} data-kind="title"><FutboboIcon name="trophy" />{title.name}</li>)}
                        {award && <li data-kind="award"><FutboboIcon name="medal" />{award}</li>}
                        {national && (
                          <li data-kind="nation">
                            <span className={styles.flag}><NationBadge country={countryById(national.countryId ?? game.nationality)} size="sm" /></span>
                            {national.name}{national.champion ? ", campeão" : `, ${national.stage.toLocaleLowerCase("pt-BR")}`}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  <span className={styles.gloss} aria-hidden="true" />
                </article>
                {moved && <span className={styles.movedStamp} aria-label="Nova camisa">Nova camisa</span>}
              </li>
            );
          })}
          {/* Espaços ainda vazios: os próximos anos da coleção. */}
          {Array.from({ length: Math.max(0, 9 - seasons.length - 1) }, (_, index) => (
            <li key={`futuro-${index}`} className={styles.futureSlot} data-extra={index >= ((seasons.length + 1) % 2 === 0 ? 2 : 3) ? "" : undefined} aria-hidden="true">
              <span className={styles.num}>{game.season + index + 1}</span>
            </li>
          ))}
        </ol>

        {seasons.length === 0 && <p className={styles.empty}>A primeira temporada profissional cola a primeira figurinha desta coleção.</p>}
      </AlbumPage>
    </>
  );
}

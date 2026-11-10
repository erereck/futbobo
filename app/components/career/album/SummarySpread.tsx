"use client";

import type { CSSProperties } from "react";
import type { Club, Country } from "../../../game-data";
import type { CareerHallEntry, GameState, SeasonRecord } from "../../../career/model";
import type { PlayerAppearance } from "../../../player-appearance";
import type { PlayerStoryPreset } from "../../../player-stories";
import { ROLE_LABELS } from "../../../career-systems";
import { seasonAverageRating } from "../../../career/performance";
import { clubById } from "../../../career/shared";
import FutboboIcon from "../../FutboboIcon";
import { ClubBadge } from "../CareerPrimitives";
import { AlbumPage } from "./AlbumShell";
import { BlockTitle, Ficha, InkBand, PlayerSticker, Stamp } from "./primitives";
import styles from "./summary.module.css";

export type SummaryClubCareer = {
  clubId: string;
  seasons: number;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  trophies: number;
  awards: number;
  firstSeason: number;
  lastSeason: number;
  peakOverall: number;
  entryOverall: number;
  exitOverall: number;
  records: SeasonRecord[];
};

const span = (first: number, last: number) => first === last ? String(first) : `${first}–${last}`;

/**
 * A última página do álbum: a figurinha final, os números e o pôster à esquerda;
 * taças, prêmios, a história, o arquivo por clube e o Hall da Fama à direita.
 */
export default function SummarySpread(props: {
  game: GameState;
  club: Club;
  appearance: PlayerAppearance | null;
  positionName: string;
  nation: Country;
  legacyLabel: string;
  publicImageLabel: string;
  followers: string;
  sponsorCount: number;
  titles: Array<{ label: string; count: number }>;
  awards: Array<[string, number]>;
  totalAwards: number;
  achievements: string;
  story: PlayerStoryPreset;
  clubCareers: SummaryClubCareer[];
  selectedClub: SummaryClubCareer | null;
  onSelectClub: (clubId: string) => void;
  hall: CareerHallEntry[];
  currentHallId: string;
  onOpenHall: (entry: CareerHallEntry) => void;
  hallPreview: boolean;
  legacyWarning: boolean;
  onCloseHall: () => void;
  shareBusy: boolean;
  onShare: () => void;
  onPlayAgain: () => void;
}) {
  const { game } = props;
  const goalkeeper = game.position === "GOL";
  const peak = Math.max(game.overall, ...game.history.map((record) => record.overall), 0);
  const totalTitles = game.trophies + game.nationalTrophies;
  const path = Array.from(new Set(game.history.map((record) => record.clubId)));
  const numbers = [
    { label: "jogos", value: game.stats.appearances },
    { label: goalkeeper ? "sem sofrer" : "gols", value: goalkeeper ? game.stats.cleanSheets : game.stats.goals },
    { label: goalkeeper ? "sofridos" : "assistências", value: goalkeeper ? game.stats.goalsConceded : game.stats.assists },
    { label: totalTitles === 1 ? "taça" : "taças", value: totalTitles },
  ];
  const selected = props.selectedClub;
  const selectedClub = selected ? clubById(selected.clubId) : null;

  return (
    <>
      <AlbumPage side="left" label="Fim de carreira" className={styles.left}>
        {props.hallPreview && (
          <button type="button" className={styles.back} onClick={props.onCloseHall}>
            <FutboboIcon name="arrow-left" /> Voltar ao ranking
          </button>
        )}
        {props.legacyWarning && (
          <p className={styles.note}>Registro anterior ao arquivo completo: os números gerais voltaram, alguns detalhes de prêmios e clubes não existiam no save antigo.</p>
        )}
        <InkBand
          ink="club"
          title={game.challengeId ? `Desafio ${game.challengeId}` : "Fim de carreira"}
          subtitle={props.hallPreview ? `Revendo a história de ${game.name}` : "Uma história que só você viveu."}
          crest={{ club: props.club }}
          aside={game.challengeId ? <span className={styles.points}><b className={styles.num}>{game.legacyPoints}</b><small>pontos</small></span> : undefined}
        />

        <div className={styles.hero}>
          <PlayerSticker
            className={styles.sticker}
            name={game.name}
            number={game.number}
            overall={peak}
            subtitle={`${props.positionName} · ${props.nation.name}`}
            club={props.club}
            appearance={props.appearance}
            tilt="-2.6deg"
          />
          <div className={styles.heroInfo}>
            <p className={styles.legacy}><b className={styles.num}>{game.legacyPoints}</b> de legado<span>{props.legacyLabel}</span></p>
            <Ficha
              rows={[
                { label: "Temporadas", value: game.history.length },
                { label: "Clubes", value: props.clubCareers.length },
                { label: "Bolas de Ouro", value: game.awardCabinet["Bola de Ouro"] ?? 0 },
                { label: "Prêmios", value: props.totalAwards },
                { label: "Conquistas", value: props.achievements },
                { label: "Seguidores", value: props.followers },
              ]}
            />
          </div>
        </div>

        <ul className={styles.numbers}>
          {numbers.map((item) => (
            <li key={item.label}><b className={styles.num}>{item.value}</b><span>{item.label}</span></li>
          ))}
        </ul>

        {path.length > 0 && (
          <section className={styles.path} aria-label="Caminho da carreira">
            <BlockTitle>Caminho</BlockTitle>
            <div className={styles.pathRow}>
              <span className={styles.num}>12</span>
              <i aria-hidden="true" />
              {path.map((clubId) => <span className={styles.pathCrest} key={clubId}><ClubBadge club={clubById(clubId)} size="sm" /></span>)}
              <i aria-hidden="true" />
              <span className={styles.num}>{game.age}</span>
            </div>
          </section>
        )}

        <div className={styles.dock}>
          <Stamp variant="primary" disabled={props.shareBusy} aria-busy={props.shareBusy} onClick={props.onShare}>
            {props.shareBusy ? "Criando o pôster…" : "Compartilhar pôster"}
          </Stamp>
          <Stamp onClick={props.onPlayAgain}>{game.challengeId ? "Tentar o desafio de novo" : "Jogar novamente"}</Stamp>
        </div>
        <div className={styles.dockSpacer} aria-hidden="true" />
      </AlbumPage>

      <AlbumPage side="right" label="Arquivo da carreira" className={styles.right}>
        <section className={styles.block}>
          <BlockTitle note={`${totalTitles} no total`}>Taças</BlockTitle>
          {props.titles.length > 0
            ? <Ficha rows={props.titles.map((title) => ({ label: title.label, value: `${title.count}×` }))} />
            : <p className={styles.note}>Ainda em busca da primeira taça.</p>}
        </section>

        <section className={styles.block}>
          <BlockTitle note={`${props.totalAwards} no total`}>Prêmios individuais</BlockTitle>
          {props.awards.length > 0
            ? <Ficha rows={props.awards.map(([award, count]) => ({ label: award, value: `${count}×` }))} />
            : <p className={styles.note}>Uma carreira sem prêmio não é uma carreira sem história.</p>}
        </section>

        <section className={styles.block}>
          <BlockTitle note={`${game.storyLog.length} ${game.storyLog.length === 1 ? "capítulo" : "capítulos"}`}>{props.story.id === "open-book" ? "Sem história definida" : props.story.title}</BlockTitle>
          {game.storyLog.length > 0 ? (
            <ol className={styles.story}>
              {game.storyLog.map((entry) => (
                <li key={`${entry.season}-${entry.chapter}`}>
                  <b className={styles.num}>{entry.season}</b>
                  <span><strong>{entry.title}</strong><small>{entry.choice}: {entry.result}</small></span>
                </li>
              ))}
            </ol>
          ) : <p className={styles.note}>{props.story.description}</p>}
        </section>

        <section className={styles.block}>
          <BlockTitle note={`${props.clubCareers.length} ${props.clubCareers.length === 1 ? "clube" : "clubes"}`}>Arquivo por clube</BlockTitle>
          {props.clubCareers.length > 0 ? (
            <>
              <ul className={styles.clubs}>
                {props.clubCareers.map((entry) => {
                  const club = clubById(entry.clubId);
                  return (
                    <li key={entry.clubId}>
                      <button type="button" aria-pressed={entry.clubId === selected?.clubId} onClick={() => props.onSelectClub(entry.clubId)}>
                        <ClubBadge club={club} size="sm" />
                        <span><strong>{club.shortName}</strong><small>{span(entry.firstSeason, entry.lastSeason)} · {entry.seasons} temp.</small></span>
                        <em className={styles.num}>{entry.trophies} {entry.trophies === 1 ? "taça" : "taças"}</em>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {selected && selectedClub && (
                <article className={styles.dossier} style={{ "--club-ink-local": selectedClub.primary } as CSSProperties}>
                  <Ficha
                    rows={[
                      { label: "Jogos", value: selected.appearances },
                      { label: goalkeeper ? "Sem sofrer" : "Gols", value: goalkeeper ? selected.cleanSheets : selected.goals },
                      { label: "Assistências", value: selected.assists },
                      { label: "Taças", value: selected.trophies },
                      { label: "Prêmios", value: selected.awards },
                      { label: "Evolução", value: `${selected.entryOverall} → ${selected.exitOverall}` },
                    ]}
                  />
                  <ol className={styles.ledger}>
                    {[...selected.records].reverse().map((record) => {
                      const titles = record.competitions.filter((competition) => competition.champion);
                      return (
                        <li key={`${record.season}-${record.clubId}`}>
                          <b className={styles.num}>{record.season}</b>
                          <span>
                            <strong>{record.appearances} jogos · {record.position === "GOL" ? `${record.cleanSheets} sem sofrer` : `${record.goals} gols · ${record.assists} assist.`}</strong>
                            <small>{ROLE_LABELS[record.squadRole]} · nota {(record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season)).toFixed(1)}{titles.length ? ` · ${titles.map((title) => title.name).join(", ")}` : ""}</small>
                          </span>
                          <em className={styles.num}>{record.overall}</em>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              )}
            </>
          ) : <p className={styles.note}>Nenhuma temporada profissional foi registrada.</p>}
        </section>

        <section className={styles.block}>
          <BlockTitle>Hall da Fama</BlockTitle>
          {props.hall.length > 0 ? (
            <ol className={styles.hall}>
              {props.hall.slice(0, 10).map((entry, index) => (
                <li key={entry.id}>
                  <button type="button" data-current={entry.id === props.currentHallId ? "" : undefined} onClick={() => props.onOpenHall(entry)} aria-label={`Ver carreira completa de ${entry.name}`}>
                    <b className={styles.num}>{index + 1}</b>
                    <ClubBadge club={clubById(entry.finalClubId)} size="sm" />
                    <span><strong>{entry.name}</strong><small>{entry.legacyLabel} · {entry.trophies} taças · {entry.ballonDor}× Bola de Ouro</small></span>
                    <em className={styles.num}>{entry.legacyPoints}</em>
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className={styles.note}>O primeiro nome ainda será gravado aqui.</p>}
        </section>
      </AlbumPage>
    </>
  );
}

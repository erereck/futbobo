"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { Club } from "../../../../game-data";
import { countryById } from "../../../../game-data";
import type { CompetitionId, GameState, SeasonRecord, TrophyCabinet } from "../../../../career/model";
import { clubById } from "../../../../career/shared";
import { formatMoney, seasonAverageRating } from "../../../../career/performance";
import { ClubBadge, LocalBadgeImage, NationBadge, TROPHY_PRESENTATIONS } from "../../CareerPrimitives";
import FutboboIcon from "../../../FutboboIcon";
import { AlbumPage } from "../AlbumShell";
import { BlockTitle, InkBand, albumPrimitives } from "../primitives";
import { clubInks } from "../inks";
import styles from "./statsTab.module.css";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const TROPHY_GROUPS = [
  { id: "NACIONAIS", label: "Nacionais" },
  { id: "CONTINENTAIS", label: "Continentais" },
  { id: "MUNDIAIS", label: "Mundiais" },
] as const;

/** Escudo da competição: mesmo caminho que a carreira usa, liga e copas pelo país do clube. */
function competitionImagePath(id: CompetitionId | keyof TrophyCabinet, leagueId: string) {
  if (id === "domesticLeague") return `/assets/competitions/leagues/${leagueId}.png`;
  if (id === "domesticCup") return `/assets/competitions/cups/${leagueId}.png`;
  if (id === "domesticSuperCup") return `/assets/competitions/supercups/${leagueId}.png`;
  if (id === "cafChampions") return "/assets/competitions/cafChampions.svg";
  return `/assets/competitions/${id}.png`;
}

function Emblem({ path }: { path: string | null }) {
  return (
    <span className={styles.emblem} aria-hidden="true">
      <FutboboIcon name="trophy" />
      {path && <LocalBadgeImage path={path} kind="competition" />}
    </span>
  );
}

/** Aba Estatísticas: números da carreira, gráficos impressos, recordes, troféus e arquivo. */
export default function StatsTab({ game }: { game: GameState; club: Club }) {
  const keeper = game.position === "GOL";
  const ratingOf = (record: SeasonRecord) => record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season);

  const statistics = useMemo(() => {
    const history = game.history;
    const by = <K extends keyof SeasonRecord>(key: K) => [...history].sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0))[0] ?? null;
    const rating = (record: SeasonRecord) => record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season);
    const bestSeason = [...history].sort((a, b) => rating(b) - rating(a) || b.goals + b.assists - a.goals - a.assists)[0] ?? null;
    return {
      recent: history.slice(-10),
      bestSeason,
      mostGoals: by("goals"),
      mostAssists: by("assists"),
      mostAppearances: by("appearances"),
      mostCleanSheets: by("cleanSheets"),
      highestOverall: by("overall"),
      highestValue: [...history].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))[0] ?? null,
      careerRating: history.length ? history.reduce((total, record) => total + rating(record), 0) / history.length : 0,
      manOfTheMatchAwards: history.reduce((total, record) => total + (record.manOfTheMatchAwards ?? 0), 0),
    };
  }, [game.history, game.seed]);

  // Onde cada taça nacional foi levantada pela última vez decide o escudo da liga/copa na sala de troféus.
  const lastTitleLeague = useMemo(() => {
    const leagues: Partial<Record<string, string>> = {};
    for (const record of game.history) {
      for (const competition of record.competitions) {
        if (competition.champion) leagues[competition.id] = record.leagueId || clubById(record.clubId).leagueId;
      }
    }
    return leagues;
  }, [game.history]);

  const recentTitles = useMemo(() => game.history
    .flatMap((record) => record.competitions.filter((competition) => competition.champion).map((competition) => ({ record, competition })))
    .reverse()
    .slice(0, 6), [game.history]);

  const awards = useMemo(() => Object.entries(game.awardCabinet)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([award, count]) => ({ award, count, seasons: game.history.filter((record) => record.awards.includes(award)).map((record) => record.season) })), [game.awardCabinet, game.history]);

  const clubTitles = Object.values(game.trophyCabinet).reduce((total, count) => total + count, 0);
  const nationalTitles = game.nationalHistory.filter((record) => record.champion);
  const nation = countryById(game.nationality);
  const recent = statistics.recent;
  const maxProduction = Math.max(1, ...recent.map((record) => (keeper ? record.cleanSheets : record.goals + record.assists)));
  const bestRecent = recent.reduce<SeasonRecord | null>((best, record) => (!best || ratingOf(record) > ratingOf(best) ? record : best), null);

  const heroNumbers = keeper
    ? [
        { label: "Jogos", value: game.stats.appearances },
        { label: "Sem sofrer", value: game.stats.cleanSheets },
        { label: "Sofridos", value: game.stats.goalsConceded },
        { label: "Temporadas", value: game.history.length },
        { label: "Nota média", value: statistics.careerRating.toFixed(1) },
        { label: "Melhor em campo", value: statistics.manOfTheMatchAwards },
      ]
    : [
        { label: "Jogos", value: game.stats.appearances },
        { label: "Gols", value: game.stats.goals },
        { label: "Assistências", value: game.stats.assists },
        { label: "G+A", value: game.stats.goals + game.stats.assists, accent: true },
        { label: "Nota média", value: statistics.careerRating.toFixed(1) },
        { label: "Melhor em campo", value: statistics.manOfTheMatchAwards },
      ];

  const records = [
    keeper
      ? { label: "Mais jogos sem sofrer", value: statistics.mostCleanSheets?.cleanSheets ?? 0, season: statistics.mostCleanSheets?.season }
      : { label: "Mais gols", value: statistics.mostGoals?.goals ?? 0, season: statistics.mostGoals?.season },
    { label: "Mais assistências", value: statistics.mostAssists?.assists ?? 0, season: statistics.mostAssists?.season },
    { label: "Mais jogos", value: statistics.mostAppearances?.appearances ?? 0, season: statistics.mostAppearances?.season },
    { label: "Maior OVR", value: statistics.highestOverall?.overall ?? game.overall, season: statistics.highestOverall?.season },
    { label: "Maior valor de mercado", value: formatMoney(statistics.highestValue?.marketValue ?? 0), season: statistics.highestValue?.season },
  ];

  const best = statistics.bestSeason;
  const bestClub = best ? clubById(best.clubId) : null;

  return (
    <>
      <AlbumPage side="left" label="Estatísticas">
        <InkBand
          ink="mustard"
          title="Estatísticas"
          subtitle={game.history.length ? `Sua carreira em números, ${plural(game.history.length, "temporada registrada", "temporadas registradas")}` : "Sua carreira em números"}
          aside={<span className={albumPrimitives.pageNo} aria-label={`Nota média ${statistics.careerRating.toFixed(1)}`}><b className={albumPrimitives.num}>{game.history.length ? statistics.careerRating.toFixed(1) : "–"}</b><small>nota</small></span>}
        />

        <dl className={styles.hero}>
          {heroNumbers.map((item) => (
            <div key={item.label} data-accent={"accent" in item && item.accent ? "" : undefined}>
              <dt>{item.label}</dt>
              <dd className={styles.num}>{item.value}</dd>
            </div>
          ))}
        </dl>

        {recent.length > 0 ? (
          <>
            <section className={styles.chartBlock} aria-labelledby="notas-titulo">
              <BlockTitle id="notas-titulo" note={`${recent.length > 1 ? `últimas ${recent.length}, ` : ""}linha no 7,0`}>Nota por temporada</BlockTitle>
              <div className={styles.ratingChart} data-few={recent.length < 6 ? "" : undefined} role="img" aria-label={`Notas: ${recent.map((record) => `${record.season} ${ratingOf(record).toFixed(1)}`).join(", ")}`}>
                <span className={styles.ratingLine} aria-hidden="true" />
                {recent.map((record) => {
                  const score = ratingOf(record);
                  return (
                    <span key={`nota-${record.season}`} className={styles.ratingCol} data-best={record === bestRecent ? "" : undefined}>
                      <b className={styles.num}>{score.toFixed(1)}</b>
                      <i style={{ "--p": Math.min(1, Math.max(.08, (score - 5) / 5)) } as CSSProperties} />
                      <small className={styles.num}>{`’${String(record.season).slice(-2)}`}</small>
                    </span>
                  );
                })}
              </div>
            </section>

            <section className={styles.chartBlock} aria-labelledby="producao-titulo">
              <BlockTitle id="producao-titulo">{keeper ? "Jogos sem sofrer gol por ano" : "Gols e assistências por ano"}</BlockTitle>
              <ul className={styles.production}>
                {recent.map((record) => {
                  const total = keeper ? record.cleanSheets : record.goals + record.assists;
                  return (
                    <li key={`producao-${record.season}`}>
                      <time className={styles.num}>{record.season}</time>
                      <span className={styles.prodTrack} aria-hidden="true">
                        {keeper ? (
                          <i data-kind="clean" style={{ "--w": `${(record.cleanSheets / maxProduction) * 100}%` } as CSSProperties} />
                        ) : (
                          <>
                            <i data-kind="goals" style={{ "--w": `${(record.goals / maxProduction) * 100}%` } as CSSProperties} />
                            <i data-kind="assists" style={{ "--w": `${(record.assists / maxProduction) * 100}%` } as CSSProperties} />
                          </>
                        )}
                      </span>
                      <span className={`${styles.prodValue} ${styles.num}`}>{keeper ? total : <>{record.goals}<small>G</small> {record.assists}<small>A</small></>}</span>
                    </li>
                  );
                })}
              </ul>
              {!keeper && (
                <p className={styles.legend}><span><i data-kind="goals" />gols</span><span><i data-kind="assists" />assistências</span></p>
              )}
            </section>
          </>
        ) : (
          <p className={styles.empty}><FutboboIcon name="stats" /><span><strong>Os gráficos abrem depois da estreia.</strong> Complete a primeira temporada para começar o arquivo estatístico.</span></p>
        )}

        <div className={styles.pair}>
          <section className={styles.mini} aria-labelledby="selecao-titulo">
            <header className={styles.miniHead}>
              <NationBadge country={nation} size="sm" />
              <BlockTitle id="selecao-titulo">{nation.name}</BlockTitle>
            </header>
            <dl className={styles.miniNumbers}>
              <div><dt>jogos</dt><dd className={styles.num}>{game.nationalCaps}</dd></div>
              <div><dt>gols</dt><dd className={styles.num}>{game.nationalGoals}</dd></div>
              <div><dt>assist.</dt><dd className={styles.num}>{game.nationalAssists}</dd></div>
              <div><dt>taças</dt><dd className={styles.num}>{game.nationalTrophies}</dd></div>
            </dl>
          </section>
          <section className={styles.mini} aria-labelledby="disciplina-titulo">
            <BlockTitle id="disciplina-titulo">Disciplina</BlockTitle>
            <div className={styles.cards}>
              <span className={styles.card} data-color="yellow" aria-label={plural(game.stats.yellowCards, "cartão amarelo", "cartões amarelos")}><b className={styles.num}>{game.stats.yellowCards}</b></span>
              <span className={styles.card} data-color="red" aria-label={plural(game.stats.redCards, "cartão vermelho", "cartões vermelhos")}><b className={styles.num}>{game.stats.redCards}</b></span>
              <dl className={styles.miniNumbers} data-compact="">
                <div><dt>desarmes</dt><dd className={styles.num}>{game.stats.tackles}</dd></div>
                <div><dt>metas</dt><dd className={styles.num}>{game.objectivesCompleted}</dd></div>
              </dl>
            </div>
          </section>
        </div>
      </AlbumPage>

      <AlbumPage side="right" label="Recordes e troféus">
        {best && bestClub && (
          <section className={styles.bestBlock} aria-labelledby="melhor-titulo">
            <BlockTitle id="melhor-titulo">Melhor temporada</BlockTitle>
            <article className={styles.best} style={clubInks(bestClub.primary, bestClub.secondary)}>
              <header className={styles.bestBand}>
                <span className={`${styles.bestYear} ${styles.num}`}>{best.season}</span>
                <span className={styles.bestCrest}><ClubBadge club={bestClub} size="sm" /></span>
              </header>
              <div className={styles.bestBody}>
                <p><strong>{bestClub.shortName}</strong> {best.age} anos, {best.position}</p>
                <dl className={styles.bestNumbers}>
                  <div data-main=""><dt>nota</dt><dd className={styles.num}>{ratingOf(best).toFixed(1)}</dd></div>
                  <div><dt>jogos</dt><dd className={styles.num}>{best.appearances}</dd></div>
                  {best.position === "GOL"
                    ? <div><dt>sem sofrer</dt><dd className={styles.num}>{best.cleanSheets}</dd></div>
                    : <><div><dt>gols</dt><dd className={styles.num}>{best.goals}</dd></div><div><dt>assist.</dt><dd className={styles.num}>{best.assists}</dd></div></>}
                </dl>
              </div>
              <span className={styles.gloss} aria-hidden="true" />
            </article>
          </section>
        )}

        {game.history.length > 0 && (
          <section aria-labelledby="recordes-titulo" className={styles.records}>
            <BlockTitle id="recordes-titulo" note="numa temporada">Livro de recordes</BlockTitle>
            <dl>
              {records.map((record) => (
                <div key={record.label} className={styles.recordRow}>
                  <dt>{record.label}</dt>
                  <span className={styles.lead} aria-hidden="true" />
                  <dd className={styles.num}>{record.value}{record.season && <small>{record.season}</small>}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className={styles.cabinet} aria-labelledby="trofeus-titulo">
          <header className={styles.cabinetHead}>
            <BlockTitle id="trofeus-titulo">Sala de troféus</BlockTitle>
            <span className={styles.cabinetTotal}><b className={styles.num}>{clubTitles + game.nationalTrophies}</b> {clubTitles + game.nationalTrophies === 1 ? "taça" : "taças"}</span>
          </header>
          {TROPHY_GROUPS.map((group) => {
            const entries = TROPHY_PRESENTATIONS.filter((presentation) => presentation.group === group.id);
            const won = entries.filter((presentation) => game.trophyCabinet[presentation.id] > 0);
            const missing = entries.filter((presentation) => game.trophyCabinet[presentation.id] === 0);
            return (
              <div key={group.id} className={styles.trophyGroup}>
                <h4>{group.label}<small className={styles.num}>{won.reduce((total, presentation) => total + game.trophyCabinet[presentation.id], 0)}</small></h4>
                <ul className={styles.trophies}>
                  {won.map((presentation) => {
                    const leagueId = lastTitleLeague[presentation.id] ?? "";
                    const path = presentation.imagePath ?? (leagueId ? competitionImagePath(presentation.id, leagueId) : null);
                    return (
                      <li key={presentation.id} className={styles.trophy}>
                        <Emblem path={path} />
                        <span className={styles.trophyName}>{presentation.label}</span>
                        <b className={styles.trophyCount}><span className={styles.num}>{game.trophyCabinet[presentation.id]}</span>×</b>
                      </li>
                    );
                  })}
                  {missing.map((presentation) => (
                    <li key={presentation.id} className={styles.trophySlot} title={presentation.label}>
                      <span aria-hidden="true">{presentation.shortLabel}</span>
                      <span className={styles.vh}>{presentation.label}: ainda não conquistada</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div className={styles.trophyGroup}>
            <h4>Seleção<small className={styles.num}>{game.nationalTrophies}</small></h4>
            {nationalTitles.length > 0 ? (
              <ul className={styles.trophies}>
                {nationalTitles.slice().reverse().map((record) => (
                  <li key={`${record.season}-${record.name}`} className={styles.trophy}>
                    <span className={styles.emblem} aria-hidden="true"><FutboboIcon name="medal" /></span>
                    <span className={styles.trophyName}>{record.name}<small className={styles.num}>{record.season}</small></span>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.note}>O país ainda espera sua taça.</p>}
          </div>
        </section>

        {recentTitles.length > 0 && (
          <section className={styles.laps} aria-labelledby="voltas-titulo">
            <BlockTitle id="voltas-titulo">Últimas voltas olímpicas</BlockTitle>
            <ul>
              {recentTitles.map(({ record, competition }, index) => {
                const titleClub = clubById(record.clubId);
                return (
                  <li key={`${record.season}-${competition.id}-${index}`}>
                    <Emblem path={competitionImagePath(competition.id, record.leagueId || titleClub.leagueId)} />
                    <span><strong>{competition.name}</strong><small className={styles.num}>{record.season}, {titleClub.shortName}</small></span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={styles.awards} aria-labelledby="premios-titulo">
          <BlockTitle id="premios-titulo" note={awards.length ? plural(awards.reduce((total, entry) => total + entry.count, 0), "prêmio", "prêmios") : undefined}>Prêmios individuais</BlockTitle>
          {awards.length > 0 ? (
            <dl>
              {awards.map((entry) => (
                <div key={entry.award} className={styles.recordRow}>
                  <dt>{entry.award}{entry.seasons.length > 0 && <small className={styles.num}>{entry.seasons.slice(-3).join(", ")}</small>}</dt>
                  <span className={styles.lead} aria-hidden="true" />
                  <dd className={styles.num}>{entry.count}×</dd>
                </div>
              ))}
            </dl>
          ) : <p className={styles.note}>Nenhum prêmio individual ainda.</p>}
        </section>

        {game.history.length > 0 && (
          <section className={styles.archive} aria-labelledby="arquivo-titulo">
            <BlockTitle id="arquivo-titulo">Temporada por temporada</BlockTitle>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Ano</th>
                    <th scope="col">Clube</th>
                    <th scope="col"><abbr title="Jogos">J</abbr></th>
                    {keeper
                      ? <th scope="col"><abbr title="Jogos sem sofrer gol">SG</abbr></th>
                      : <><th scope="col"><abbr title="Gols">G</abbr></th><th scope="col"><abbr title="Assistências">A</abbr></th></>}
                    <th scope="col">Nota</th>
                    <th scope="col">OVR</th>
                    <th scope="col"><span className={styles.vh}>Títulos</span><FutboboIcon name="trophy" aria-hidden="true" /></th>
                  </tr>
                </thead>
                <tbody>
                  {[...game.history].reverse().map((record) => {
                    const seasonClub = clubById(record.clubId);
                    const titles = record.competitions.filter((competition) => competition.champion).length;
                    return (
                      <tr key={`${record.season}-${record.clubId}`}>
                        <th scope="row" className={styles.num}>{record.season}</th>
                        <td><span className={styles.tableClub}><ClubBadge club={seasonClub} size="sm" /><span>{seasonClub.shortName}</span></span></td>
                        <td className={styles.num}>{record.appearances}</td>
                        {keeper
                          ? <td className={styles.num}>{record.cleanSheets}</td>
                          : <><td className={styles.num}>{record.goals}</td><td className={styles.num}>{record.assists}</td></>}
                        <td className={styles.num}>{ratingOf(record).toFixed(1)}</td>
                        <td className={styles.num}>{record.overall}</td>
                        <td className={styles.num}>{titles || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </AlbumPage>
    </>
  );
}

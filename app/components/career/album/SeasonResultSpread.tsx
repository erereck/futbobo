"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { Club } from "../../../game-data";
import { countryById } from "../../../game-data";
import type { GameState } from "../../../career/model";
import { awardFinalists, awardTierWeight } from "../../../career/state";
import { clubById } from "../../../career/shared";
import { positionByKey } from "../../../career/academy";
import { formatMoney, seasonAverageRating } from "../../../career/performance";
import { seasonResultStory } from "../../../career/season-narrative";
import BallonDorGalaCard from "../../../ceremony/BallonDorGalaCard";
import ParadeLaunchCard from "../../../parade/ParadeLaunchCard";
import { careerWorldCupTitles, paradeStars } from "../../../parade/parade-stars";
import { AwardCeremony, AwardReveal, CompetitionBadge, NationBadge } from "../CareerPrimitives";
import FutboboIcon from "../../FutboboIcon";
import { AlbumPage } from "./AlbumShell";
import { BlockTitle, ClubBand, Ficha, Stamp } from "./primitives";
import { clubInks } from "./inks";
import styles from "./seasonResult.module.css";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Fim da temporada: a página do ano que acabou, com números, taças, prêmios e o que vem a seguir. */
export default function SeasonResultSpread({ game, club, continueLabel, onContinue }: { game: GameState; club: Club; continueLabel: string; onContinue: () => void }) {
  const result = game.lastResult;
  const nationCountry = countryById(game.nationality);
  const seasonCeremonyNomination = useMemo(
    () => [...(result?.awardNominations ?? [])]
      .sort((a, b) => awardTierWeight(b.award) - awardTierWeight(a.award) || Number(b.won) - Number(a.won))[0] ?? null,
    [result],
  );
  if (!result) return null;

  const seasonClub = clubById(result.clubId) ?? club;
  const leagueId = result.leagueId || game.currentLeagueId || club.leagueId;
  const story = seasonResultStory(result, seasonClub.shortName);
  const clubTitles = result.competitions.filter((competition) => competition.champion);
  const nationalTitles = game.nationalHistory.filter((record) => record.season === result.season && record.champion);
  const worldCup = game.nationalHistory.find((record) => record.season === result.season && record.name === "Copa do Mundo");
  const titleCount = clubTitles.length + nationalTitles.length;
  const botao = result.botaoResults ?? [];
  const botaoWins = botao.filter(({ result: match }) => match.champion).length;
  const campaigns = result.competitions.filter((competition) => !competition.champion);
  const rating = result.averageRating ?? seasonAverageRating(result.performanceScore, game.seed, result.season);
  const ratingTier = rating >= 8 ? "elite" : rating >= 7 ? "good" : "regular";
  const ratingLine = (result.averageRating ?? 6) >= 8.5 ? "Uma temporada de nível mundial." : (result.averageRating ?? 6) >= 7.5 ? "Você foi decisivo e constante." : (result.averageRating ?? 6) >= 6.7 ? "Um ano sólido, com espaço para crescer." : "O rendimento ficou abaixo da cobrança.";
  const goalkeeper = game.position === "GOL";
  const development = result.development;
  const developmentLine = development > 2 ? "Você está alcançando o nível profissional rapidamente." : development > 0 ? "Mais um passo na direção da elite." : development === 0 ? "Seu nível se manteve." : "A carreira também cobra seus anos difíceis.";
  const hasAwards = result.awards.length > 0 || result.awardNominations.length > 0;
  const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
  const seasonInks = clubInks(seasonClub.primary, seasonClub.secondary);

  const numbers = [
    { label: "jogos", value: result.appearances },
    { label: goalkeeper ? "sem sofrer" : result.goals === 1 ? "gol" : "gols", value: goalkeeper ? result.cleanSheets : result.goals },
    { label: goalkeeper ? "sofridos" : result.assists === 1 ? "assistência" : "assistências", value: goalkeeper ? result.goalsConceded : result.assists },
    { label: "OVR", value: game.overall, delta: development },
  ];

  // Sem taças, prêmios nem Copa, os avisos vão para a página da direita para o álbum não ficar com uma página vazia.
  const sparse = titleCount === 0 && botao.length === 0 && !hasAwards && !worldCup?.tournamentStats;
  const developmentBlock = (
        <section className={`${styles.block} ${styles["o-development"]}`} aria-labelledby="evolucao-titulo">
          <div className={styles.development} data-tone={development > 0 ? "up" : development < 0 ? "down" : undefined}>
            <b className={styles.num}>{signed(development)}<small> OVR</small></b>
            <div>
              <BlockTitle id="evolucao-titulo">Evolução na temporada</BlockTitle>
              <p>{developmentLine}</p>
            </div>
          </div>
          {result.breakoutBonus > 0 && (
            <div className={styles.foilNote}>
              <b className={styles.num}>+{result.breakoutBonus}</b>
              <div><strong>Temporada fora da curva</strong><p>Você jogou tão bem que rompeu a evolução normal da carreira: OVR extra.</p></div>
            </div>
          )}
          {result.europeanSpotlight > 0 && (
            <div className={styles.notice} data-tone="blue">
              <span className={styles.noticeStamp}>Vitrine europeia</span>
              <strong>+{result.europeanSpotlight} de prestígio</strong>
              <p>Seu desempenho ganhou alcance internacional{result.europeanDevelopmentBonus > 0 ? ` e acelerou sua evolução em +${result.europeanDevelopmentBonus} OVR` : ""}.</p>
            </div>
          )}
          <Ficha rows={[
            { label: "Cartões", value: `${plural(result.yellowCards, "amarelo", "amarelos")}, ${plural(result.redCards, "vermelho", "vermelhos")}` },
            ...(positionByKey(game.position).zone !== "gol" ? [{ label: "Trabalho sem a bola", value: plural(result.tackles, "desarme", "desarmes") }] : []),
            { label: "Valor de mercado", value: formatMoney(result.marketValue) },
          ]} />
          {result.calledUp && <p className={styles.callup}><FutboboIcon name="globe" /> Convocado pela seleção</p>}
        </section>
  );
  const noticesBlock = (
        (result.objectiveResult || result.promotion || game.youthLoanDecision || game.forcedClubExit || game.contractYears === 0) && (
          <section className={`${styles.notices} ${styles["o-notices"]}`} aria-label="Bastidores">
            {result.objectiveResult && (
              <div className={styles.notice} data-tone={result.objectiveResult.completed ? "green" : "red"}>
                <span className={styles.noticeStamp}>{result.objectiveResult.completed ? "Meta cumprida" : "Meta perdida"}</span>
                <strong>{result.objectiveResult.label}</strong>
                <p>{result.objectiveResult.text}</p>
              </div>
            )}
            {result.promotion && (
              <div className={styles.notice} data-tone="green">
                <span className={styles.noticeStamp}>Acesso</span>
                <strong>O clube subiu de divisão</strong>
                <p>{result.promotion}</p>
              </div>
            )}
            {game.youthLoanDecision && (
              <div className={styles.notice} data-tone="ink">
                <span className={styles.noticeStamp}>Plano de desenvolvimento</span>
                <strong>O clube recomenda um empréstimo</strong>
                <p>Você poderá buscar mais minutos em outro projeto ou continuar disputando espaço no elenco atual.</p>
              </div>
            )}
            {game.forcedClubExit && (
              <div className={styles.notice} data-tone="red">
                <span className={styles.noticeStamp}>Venda obrigatória</span>
                <strong>O clube colocou você no mercado</strong>
                <p>Seu overall e seu rendimento ficaram muito abaixo da exigência do elenco. Sem status de ídolo, você terá de escolher outro destino.</p>
              </div>
            )}
            {game.contractYears === 0 && (
              <div className={styles.notice} data-tone="ink">
                <span className={styles.noticeStamp}>Contrato encerrado</span>
                <strong>{game.renewalDenied ? "O clube optou por não renovar" : "Seu futuro está aberto"}</strong>
                <p>{game.renewalDenied ? "Depois de uma temporada difícil, a diretoria decidiu não seguir com você. Na próxima tela você precisa escolher um novo clube." : "Na próxima tela você poderá renovar ou escolher um novo clube."}</p>
              </div>
            )}
          </section>
        )
  );

  return (
    <>
      {/* ───────────── a temporada do jogador ───────────── */}
      <AlbumPage side="left" label={`Temporada ${result.season}`} className={styles.flowPage}>
        <div className={styles["o-band"]} style={seasonInks}>
          <ClubBand club={seasonClub} subtitle={`Fim da temporada ${result.season}`} page={result.age} />
        </div>

        <section className={`${styles.hero} ${styles["o-hero"]}`} aria-labelledby="temporada-titulo">
          <div className={styles.ratingSeal} data-tier={ratingTier} role="img" aria-label={`Nota média ${rating.toFixed(1)}`}>
            <b className={styles.num}>{rating.toFixed(1)}</b>
            <small>nota média</small>
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>{result.title ? <><FutboboIcon name="trophy" /> Ano de taça</> : development < 0 ? "Ano difícil" : "Ano de evolução"}</p>
            <h1 id="temporada-titulo">{story.headline}</h1>
            <p>{story.detail}</p>
          </div>
        </section>

        <div className={`${styles.numbers} ${styles["o-numbers"]}`}>
          {numbers.map((item) => (
            <div key={item.label} className={styles.numberSticker}>
              <b className={styles.num}>{item.value}{item.delta ? <em data-tone={item.delta > 0 ? "up" : "down"}>{signed(item.delta)}</em> : null}</b>
              <small>{item.label}</small>
            </div>
          ))}
        </div>

        <p className={`${styles.ratingLine} ${styles["o-ratingLine"]}`}>
          {ratingLine}{(result.manOfTheMatchAwards ?? 0) > 0 && <> <strong>{plural(result.manOfTheMatchAwards ?? 0, "vez", "vezes")} melhor em campo.</strong></>}
        </p>

        {developmentBlock}
        {!sparse && noticesBlock}
      </AlbumPage>

      {/* ───────────── taças, campanhas e prêmios ───────────── */}
      <AlbumPage side="right" label="Taças e prêmios" className={styles.flowPage}>
        <div className={styles.rightBody}>
          {sparse && noticesBlock}
          {(titleCount > 0 || botao.length > 0 || !hasAwards) && (
            <section className={`${styles.block} ${styles["o-titles"]}`} aria-labelledby="tacas-titulo">
              <BlockTitle id="tacas-titulo" as="h2" note={titleCount > 0 ? plural(titleCount, "volta olímpica", "voltas olímpicas") : undefined}>Taças da temporada</BlockTitle>
              {titleCount === 0 && botao.length === 0 && (
                <div className={styles.emptyTrophy}>
                  <span className={styles.num} aria-hidden="true">{result.season}</span>
                  <p>Nenhuma taça nesta temporada. O espaço continua esperando.</p>
                </div>
              )}
              {titleCount > 0 && (
                <ul className={styles.trophies}>
                  {clubTitles.map((competition, index) => (
                    <li key={`title-${competition.id}`} className={styles.trophy} style={{ "--tilt": `${index % 2 ? 1.4 : -1.8}deg` } as CSSProperties}>
                      <span className={styles.trophyArt}><CompetitionBadge competition={competition} leagueId={leagueId} /></span>
                      <span className={styles.trophyCopy}><small>Campeão</small><strong>{competition.name}</strong></span>
                    </li>
                  ))}
                  {nationalTitles.map((record, index) => (
                    <li key={`national-title-${record.season}-${record.name}`} className={styles.trophy} data-national="" style={{ "--tilt": `${(clubTitles.length + index) % 2 ? 1.4 : -1.8}deg` } as CSSProperties}>
                      <span className={styles.trophyArt}><NationBadge country={nationCountry} size="md" /></span>
                      <span className={styles.trophyCopy}><small>Campeão pela seleção</small><strong>{record.name}</strong></span>
                    </li>
                  ))}
                </ul>
              )}
              {botao.length > 0 && (
                <div className={styles.botao}>
                  <p><strong>Decidido no futebol de botão</strong><span>finais e mata-matas da temporada</span></p>
                  <dl>
                    <div><dd className={styles.num}>{botao.length}</dd><dt>{botao.length === 1 ? "disputada" : "disputadas"}</dt></div>
                    <div data-tone="up"><dd className={styles.num}>{botaoWins}</dd><dt>{botaoWins === 1 ? "ganha" : "ganhas"}</dt></div>
                    <div data-tone="down"><dd className={styles.num}>{botao.length - botaoWins}</dd><dt>{botao.length - botaoWins === 1 ? "perdida" : "perdidas"}</dt></div>
                  </dl>
                </div>
              )}
            </section>
          )}

          {hasAwards && (
            <section className={`${styles.block} ${styles["o-awards"]}`} aria-labelledby="premiacao-titulo">
              <BlockTitle id="premiacao-titulo" as="h2" note="abra cada envelope">Noite de premiação</BlockTitle>
              <p className={styles.awardLead}>{seasonCeremonyNomination?.award === "Bola de Ouro" ? "Você está entre os três melhores do mundo." : result.awards.length > 1 ? `${result.awards.length} prêmios na mesma temporada.` : seasonCeremonyNomination?.won ? "Seu nome foi chamado." : "Você está entre os finalistas."}</p>
              <div className={styles.stage}>
                {seasonCeremonyNomination?.award === "Bola de Ouro" ? (
                  <BallonDorGalaCard
                    key={`ballon-dor-${result.season}`}
                    seed={game.seed}
                    season={result.season}
                    playerName={game.name}
                    appearance={game.playerAppearance}
                    number={game.number}
                    clubId={game.currentClubId}
                    nationality={game.nationality}
                    finalists={seasonCeremonyNomination.finalists ?? awardFinalists(game.name, "Bola de Ouro", game.seed, result.season, game.rivals)}
                    won={seasonCeremonyNomination.won}
                    winner={seasonCeremonyNomination.winner}
                    rivals={game.rivals}
                  />
                ) : seasonCeremonyNomination && (
                  <AwardCeremony
                    key={`${seasonCeremonyNomination.award}-${result.season}`}
                    award={seasonCeremonyNomination.award}
                    playerName={game.name}
                    seed={game.seed}
                    season={result.season}
                    won={seasonCeremonyNomination.won}
                    winner={seasonCeremonyNomination.winner}
                    finalists={seasonCeremonyNomination.finalists}
                  />
                )}
                {[...result.awards]
                  .sort((a, b) => awardTierWeight(b) - awardTierWeight(a))
                  .filter((award) => award !== seasonCeremonyNomination?.award)
                  .map((award) => <AwardReveal key={award} award={award} />)}
              </div>
            </section>
          )}

          {worldCup?.tournamentStats && (
            <section className={`${styles.block} ${styles.worldCup} ${styles["o-worldcup"]}`} data-champion={worldCup.champion ? "" : undefined} aria-labelledby="copa-titulo">
              <header>
                <span className={styles.crestDisc}><NationBadge country={nationCountry} size="sm" /></span>
                <div><BlockTitle id="copa-titulo" as="h2">Relatório da Copa do Mundo</BlockTitle><small>{worldCup.stage}</small></div>
              </header>
              <dl className={styles.miniNumbers}>
                <div><dd className={styles.num}>{worldCup.tournamentStats.appearances}</dd><dt>jogos</dt></div>
                <div><dd className={styles.num}>{worldCup.tournamentStats.goals}</dd><dt>gols</dt></div>
                <div><dd className={styles.num}>{worldCup.tournamentStats.assists}</dd><dt>assistências</dt></div>
                <div><dd className={styles.num}>{worldCup.tournamentStats.goals + worldCup.tournamentStats.assists}</dd><dt>G+A</dt></div>
              </dl>
              <Ficha rows={[
                { label: "Fase de grupos (simulada)", value: `${worldCup.tournamentStats.groupAppearances} J, ${worldCup.tournamentStats.groupGoals} G, ${worldCup.tournamentStats.groupAssists} A` },
                { label: "Mata-mata", value: `${worldCup.tournamentStats.knockoutAppearances} J, ${worldCup.tournamentStats.knockoutGoals} G, ${worldCup.tournamentStats.knockoutAssists} A` },
              ]} />
              {worldCup.tournamentStats.goals >= 8 && (
                <div className={styles.foilNote}>
                  <b aria-hidden="true">◉</b>
                  <div><strong>A eleição mudou de figura</strong><p>Oito ou mais gols na Copa colocaram seu nome no centro da disputa pela Bola de Ouro.</p></div>
                </div>
              )}
            </section>
          )}

          {worldCup?.champion && (
            <div className={`${styles.stage} ${styles["o-parade"]}`}>
              <ParadeLaunchCard
                key={`parade-${result.season}`}
                seed={game.seed}
                season={result.season}
                countryId={worldCup.countryId ?? game.nationality}
                playerName={game.name}
                appearance={game.playerAppearance}
                number={game.number}
                stars={paradeStars(worldCup.countryId ?? game.nationality, careerWorldCupTitles(game.nationalHistory, worldCup.countryId ?? game.nationality, result.season, game.nationality))}
              />
            </div>
          )}

          {campaigns.length > 0 && (
            <section className={`${styles.block} ${styles["o-campaigns"]}`} aria-labelledby="campanhas-titulo">
              <BlockTitle id="campanhas-titulo" as="h2" note="onde a caminhada terminou">Outras campanhas</BlockTitle>
              <ul className={styles.campaigns}>
                {campaigns.map((competition) => (
                  <li key={competition.id}>
                    <span className={styles.campaignBadge}><CompetitionBadge competition={competition} leagueId={leagueId} /></span>
                    <strong>{competition.name}</strong>
                    <span className={styles.lead} aria-hidden="true" />
                    <em>{competition.stage}</em>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(result.medicalRecord || result.twist || result.nationalNote) && (
            <section className={`${styles.block} ${styles["o-extras"]}`} aria-label="Imprevistos">
              {result.medicalRecord && (
                <div className={styles.notice} data-tone="red">
                  <span className={styles.noticeStamp}>Departamento médico, {result.medicalRecord.severity}</span>
                  <strong>{result.medicalRecord.name}</strong>
                  <dl className={styles.miniNumbers}>
                    <div><dd className={styles.num}>{result.medicalRecord.recoveryMonths}</dd><dt>meses</dt></div>
                    <div><dd className={styles.num}>{result.medicalRecord.matchesMissed}</dd><dt>jogos fora</dt></div>
                    <div><dd>{result.medicalRecord.recurring ? "sim" : "não"}</dd><dt>recorrente</dt></div>
                  </dl>
                </div>
              )}
              {result.twist && (
                <div className={styles.notice} data-tone={result.twist.includes("improvável") ? "green" : "ink"}>
                  <span className={styles.noticeStamp}>O imprevisto da temporada</span>
                  <p>{result.twist}</p>
                </div>
              )}
              {result.nationalNote && (
                <div className={styles.nationalNote}>
                  <span className={styles.crestDisc}><NationBadge country={nationCountry} size="sm" /></span>
                  <p>{result.nationalNote}</p>
                </div>
              )}
            </section>
          )}

        </div>

        <div className={`${styles.dock} ${styles["o-dock"]}`}>
          <Stamp variant="primary" onClick={onContinue}>{continueLabel}</Stamp>
        </div>
      </AlbumPage>
    </>
  );
}

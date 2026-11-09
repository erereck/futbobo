"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Club } from "../../../game-data";
import { countryById, leagueById } from "../../../game-data";
import type { GameState, TransferOffer } from "../../../career/model";
import type { PlayerAppearance } from "../../../player-appearance";
import { ROLE_LABELS } from "../../../career-systems";
import { positionByKey } from "../../../career/academy";
import { fanMood, formatMoney } from "../../../career/performance";
import { clubById } from "../../../career/shared";
import { TransferJourneyOverlay, moveLabel, windowCopy } from "../TransferMarketScreen";
import type { TransferJourney } from "../TransferMarketScreen";
import { ClubBadge } from "../CareerPrimitives";
import { AlbumPage } from "./AlbumShell";
import { BlockTitle, ClubBand, Ficha, Meters, PlayerSticker, Stamp } from "./primitives";
import { darken, lighten, luminance } from "./inks";
import styles from "./sideSpreads.module.css";

const sentence = (text: string) => text ? text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1).toLocaleLowerCase("pt-BR") : text;

/** A maior palavra do nome do clube: o CSS encolhe a letra até ela caber sem quebrar no meio. */
export const nameFit = (name: string) => ({ "--word": Math.max(...name.split(/[\s-]+/).map((word) => word.length), 1) }) as CSSProperties;

/** Cores impressas da faixa de um clube de proposta (sem mexer nas cores do clube atual da página). */
export function offerInks(club: Club): CSSProperties {
  const band = luminance(club.primary) > 0.6 && luminance(club.secondary) < 0.6 ? club.secondary : club.primary;
  const stripe = band === club.primary ? club.secondary : club.primary;
  return { "--o-club": band, "--o-deep": darken(band, 0.28), "--o-soft": lighten(band, 0.16), "--o-stripe": luminance(stripe) > 0.85 && luminance(band) < 0.45 ? "#ffffff" : stripe } as CSSProperties;
}

/** Página esquerda das telas laterais: o jogador como está agora. */
function PlayerPage({ game, club, appearance, label }: { game: GameState; club: Club; appearance: PlayerAppearance | null; label: string }) {
  const position = positionByKey(game.position);
  const supporter = fanMood(game.fanSupport);
  // Clubes da carreira na ordem em que apareceram, com as temporadas de cada um.
  const clubs = [...game.history.reduce((map, record) => {
    const entry = map.get(record.clubId) ?? { club: clubById(record.clubId), seasons: 0, from: record.season, to: record.season };
    entry.seasons += 1;
    entry.to = Math.max(entry.to, record.season);
    entry.from = Math.min(entry.from, record.season);
    map.set(record.clubId, entry);
    return map;
  }, new Map<string, { club: Club; seasons: number; from: number; to: number }>()).values()];
  return (
    <AlbumPage side="left" label={label}>
      <ClubBand club={club} subtitle={`${club.city}, ${leagueById(game.currentLeagueId || club.leagueId).name}`} page={game.age} />
      <div className={styles.playerRow}>
        <PlayerSticker name={game.name} number={game.number} overall={game.overall} subtitle={`${position.name}, camisa ${game.number}`} club={club} appearance={appearance} />
        <section className={styles.fichaBlock} aria-labelledby="lateral-ficha">
          <BlockTitle id="lateral-ficha">Ficha técnica</BlockTitle>
          <Ficha
            rows={[
              { label: "Idade", value: `${game.age} anos` },
              { label: "Posição", value: `${position.name} (${game.position})` },
              { label: "OVR", value: game.overall },
              { label: "No elenco", value: ROLE_LABELS[game.squadRole] },
              { label: "Contrato", value: game.isFreeAgent ? "Sem clube" : game.contractYears ? `${game.contractYears} ano${game.contractYears > 1 ? "s" : ""}` : "Encerrado" },
              { label: "Salário", value: `${formatMoney(game.annualSalary)}/ano` },
            ]}
          />
        </section>
      </div>
      <Meters
        items={[
          { label: "Moral", value: game.morale, color: "var(--blue)" },
          { label: "Físico", value: game.fitness, color: game.fitness < 55 ? "var(--red)" : "var(--green)" },
          { label: "Prestígio", value: game.reputation, color: "var(--yellow-deep)" },
          { label: "Torcida", note: supporter.label.toLocaleLowerCase("pt-BR"), value: game.fanSupport, color: "var(--red)" },
        ]}
      />
      {clubs.length > 0 && (
        <section className={styles.clubs} aria-labelledby="camisas-vestidas">
          <BlockTitle id="camisas-vestidas">Camisas que você já vestiu</BlockTitle>
          <ul>
            {clubs.map(({ club: worn, seasons, from, to }) => (
              <li key={worn.id}>
                <span className={styles.clubCrest}><ClubBadge club={worn} size="sm" /></span>
                <strong>{worn.shortName}</strong>
                <small className={styles.num}>{from === to ? from : `${from}–${to}`}, {seasons} {seasons === 1 ? "temporada" : "temporadas"}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AlbumPage>
  );
}

/** Janela de transferências: propostas como figurinhas de clube, ficar como a figurinha da camisa atual. */
export function TransferSpread({ game, club, appearance, offers, renewalOffer, onChoose, onStay, onBecomeFreeAgent, onWait }: {
  game: GameState;
  club: Club;
  appearance: PlayerAppearance | null;
  offers: TransferOffer[];
  renewalOffer: TransferOffer | null;
  onChoose: (offer: TransferOffer) => void;
  onStay: () => void;
  onBecomeFreeAgent: () => void;
  onWait: () => void;
}) {
  const state = game;
  const copy = windowCopy(state, club, offers.length);
  const canStay = state.youthLoanDecision || (!state.transferRequested && !state.renewalDenied && !state.forcedClubExit && !state.forcedAlternativeTransfer && state.pendingTransferMode !== "loan") || (state.pendingTransferMode === "loan" && state.transferStatus?.headline === "Empréstimo autorizado");
  const [journey, setJourney] = useState<TransferJourney | null>(null);
  const [journeyLeaving, setJourneyLeaving] = useState(false);
  const onChooseRef = useRef(onChoose);
  const journeyFinishingRef = useRef(false);

  useEffect(() => {
    onChooseRef.current = onChoose;
  }, [onChoose]);

  // A viagem até o novo clube termina antes de a carreira seguir (mesma lógica da janela antiga).
  useEffect(() => {
    if (!journey) return;
    journeyFinishingRef.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const finishJourney = () => {
      if (journeyFinishingRef.current) return;
      journeyFinishingRef.current = true;
      const acceptedOffer = journey.offer;
      document.body.style.overflow = previousOverflow;
      setJourney(null);
      onChooseRef.current(acceptedOffer);
    };
    const fadeDelay = reducedMotion ? 480 : 2850;
    const fadeDuration = reducedMotion ? 180 : 320;
    const fadeTimer = window.setTimeout(() => setJourneyLeaving(true), fadeDelay);
    const finishTimer = window.setTimeout(finishJourney, fadeDelay + fadeDuration);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(finishTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [journey]);

  function chooseWithJourney(offer: TransferOffer) {
    if (journey) return;
    if (offer.type === "renewal" || offer.clubId === club.id) {
      onChoose(offer);
      return;
    }
    const destination = clubById(offer.clubId);
    setJourneyLeaving(false);
    setJourney({ offer, destination, mode: destination.countryId === club.countryId ? "bus" : "plane" });
  }

  const waitDisabled = Boolean(journey) || (state.age >= 42 && state.forcedFreeAgentUntilSeason <= state.season);

  return (
    <>
      <PlayerPage game={game} club={club} appearance={appearance} label="Seu momento" />
      <AlbumPage side="right" label="Janela de transferências" className={styles.firstOnMobile}>
        <header className={styles.head}>
          <span className={styles.kicker}>{sentence(copy.eyebrow)}</span>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.lead}>{copy.text}</p>
        </header>

        <div className={styles.offers}>
          {offers.map((offer) => {
            const destination = clubById(offer.clubId);
            const league = leagueById(destination.leagueId);
            const changesCountry = destination.countryId !== club.countryId;
            return (
              <article className={styles.offer} key={offer.id}>
                <button type="button" className={styles.offerSticker} style={offerInks(destination)} disabled={Boolean(journey)} onClick={() => chooseWithJourney(offer)}>
                  <span className={styles.offerBand} aria-hidden="true"><span className={styles.offerCrest}><ClubBadge club={destination} /></span></span>
                  <span className={styles.offerBody}>
                    <small>{sentence(offer.reasonLabel)}</small>
                    <strong style={nameFit(destination.shortName)}>{destination.shortName}</strong>
                    <em>{league.name}{changesCountry ? `, ${countryById(destination.countryId).name}` : ""}</em>
                  </span>
                  {/* O contrato vem impresso na própria figurinha, no canto direito. */}
                  <span className={styles.offerTerms}>
                    <span><b>{formatMoney(offer.annualSalary)}</b> por ano</span>
                    {offer.type === "loan"
                      ? <span>até <b>{offer.loanEndSeason}</b></span>
                      : <span><b>{offer.contractYears}</b> {offer.contractYears === 1 ? "ano" : "anos"}<span className={styles.wide}> de contrato</span></span>}
                    {offer.type === "loan" && <span>destino paga <b>{offer.destinationSalaryShare}%</b></span>}
                  </span>
                  <span className={styles.offerDeal}>
                    <small>{moveLabel(offer)}</small>
                    <b>{ROLE_LABELS[offer.role]}</b>
                  </span>
                </button>
                <p className={styles.reason}>{offer.reasonText}</p>
              </article>
            );
          })}

          {canStay && (
            <article className={styles.offer} data-stay="">
              <button type="button" className={styles.offerSticker} style={offerInks(club)} disabled={Boolean(journey)} onClick={onStay}>
                <span className={styles.offerBand} aria-hidden="true"><span className={styles.offerCrest}><ClubBadge club={club} /></span></span>
                <span className={styles.offerBody}>
                  <small>{state.youthLoanDecision ? "Disputar espaço" : state.contractYears === 0 ? "Renovação" : "Continuidade"}</small>
                  <strong style={nameFit(club.shortName)}>{club.shortName}</strong>
                  <em>Manter o projeto atual</em>
                </span>
                <span className={styles.offerDeal}>
                  <small>{state.contractYears === 0 ? `${renewalOffer?.contractYears ?? 1} ano(s)` : "Contrato atual"}</small>
                  <b>{state.contractYears === 0 ? formatMoney(renewalOffer?.annualSalary ?? state.annualSalary) : "Ficar"}</b>
                </span>
              </button>
            </article>
          )}
        </div>

        {((canStay && state.contractYears === 0) || state.isFreeAgent) && (
          <div className={styles.secondary}>
            {canStay && state.contractYears === 0 && <Stamp disabled={Boolean(journey)} onClick={onBecomeFreeAgent}>Recusar renovação e virar agente livre</Stamp>}
            {state.isFreeAgent && (
              <>
                <Stamp disabled={waitDisabled} onClick={onWait}>Passar um ano sem clube</Stamp>
                <p className={styles.secondaryNote}>{state.forcedFreeAgentUntilSeason > state.season ? "Punição em andamento." : "Nada convenceu? Dá para esperar a próxima janela."}</p>
              </>
            )}
          </div>
        )}
      </AlbumPage>
      {journey && <TransferJourneyOverlay journey={journey} origin={club} leaving={journeyLeaving} />}
    </>
  );
}

/** O clube negou o pedido de empréstimo ou de transferência. */
export function TransferDeniedSpread({ game, club, appearance, supporter, onContinue }: { game: GameState; club: Club; appearance: PlayerAppearance | null; supporter: { label: string; color: string }; onContinue: () => void }) {
  const status = game.transferStatus;
  if (!status) return null;
  const loan = status.headline === "O clube recusou o empréstimo";
  return (
    <>
      <PlayerPage game={game} club={club} appearance={appearance} label="Seu momento" />
      <AlbumPage side="right" label="Pedido recusado" className={styles.firstOnMobile}>
        <header className={styles.head}>
          <span className={styles.kicker}>{loan ? "Pedido de empréstimo" : "Pedido de transferência"}</span>
          <h1 className={styles.title}>Quer mudar de camisa?</h1>
        </header>
        <section className={styles.deniedCard} aria-label="Resposta do clube">
          <span className={styles.deniedStamp} aria-hidden="true">Recusado</span>
          <h2>{status.headline}</h2>
          <p>{status.text}</p>
        </section>
        <section className={styles.mood} aria-labelledby="reacao-torcida">
          <BlockTitle id="reacao-torcida" note={loan ? "O clube quer manter você no elenco" : "Torcida e comissão perderam confiança"}>Reação da torcida</BlockTitle>
          <Meters items={[{ label: "Torcida", note: supporter.label.toLocaleLowerCase("pt-BR"), value: game.fanSupport, color: "var(--red)" }]} />
        </section>
        <div className={styles.dockSpacer} aria-hidden="true" />
        <div className={styles.dock}>
          <Stamp variant="primary" onClick={onContinue}>Encarar a temporada</Stamp>
        </div>
      </AlbumPage>
    </>
  );
}

/** Confirmação de aposentadoria. */
export function RetirementSpread({ game, club, appearance, onConfirm, onCancel }: { game: GameState; club: Club; appearance: PlayerAppearance | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <PlayerPage game={game} club={club} appearance={appearance} label="Seu momento" />
      <AlbumPage side="right" label="Aposentadoria" className={styles.firstOnMobile}>
        <header className={styles.head}>
          <span className={styles.kicker}>Decisão de carreira</span>
          <h1 className={styles.title}>Pendurar as chuteiras agora?</h1>
          <p className={styles.lead}>Você pode encerrar a carreira em qualquer idade. O legado é fechado exatamente como está, e esta decisão é definitiva.</p>
        </header>
        <section aria-labelledby="aposentadoria-resumo">
          <BlockTitle id="aposentadoria-resumo">Como o álbum fecha</BlockTitle>
          <Ficha
            rows={[
              { label: "Idade", value: `${game.age} anos` },
              { label: "Temporadas", value: game.history.length },
              { label: "OVR atual", value: game.overall },
              { label: "Legado", value: game.legacyPoints },
            ]}
          />
        </section>
        <div className={styles.dockSpacer} aria-hidden="true" />
        <div className={styles.dock}>
          <div className={styles.dockRow}>
            <Stamp variant="danger" onClick={onConfirm}>Confirmar aposentadoria</Stamp>
            <Stamp onClick={onCancel}>Ainda não</Stamp>
          </div>
        </div>
      </AlbumPage>
    </>
  );
}

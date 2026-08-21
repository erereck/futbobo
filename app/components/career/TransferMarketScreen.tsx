import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ROLE_LABELS } from "../../career-systems";
import type { Club } from "../../game-data";
import { countryById, leagueById } from "../../game-data";
import type { GameState, TransferOffer } from "../../career/model";
import { formatMoney } from "../../career/performance";
import { clubById } from "../../career/shared";
import { ClubBadge } from "./CareerPrimitives";
import styles from "./TransferMarketScreen.module.css";
import FutboboIcon from "../FutboboIcon";

type Props = {
  state: GameState;
  currentClub: Club;
  offers: TransferOffer[];
  renewalOffer: TransferOffer | null;
  onChoose: (offer: TransferOffer) => void;
  onStay: () => void;
  onBecomeFreeAgent: () => void;
  onWait: () => void;
};

type TravelMode = "plane" | "bus";

type TransferJourney = {
  offer: TransferOffer;
  destination: Club;
  mode: TravelMode;
};

function windowCopy(state: GameState, currentClub: Club, count: number) {
  if (state.forcedFreeAgentUntilSeason > state.season) return { eyebrow: "FORA DO MERCADO", title: "Nenhum clube pode contratar você", text: `A punição vai até ${state.forcedFreeAgentUntilSeason}.` };
  if (state.pendingTransferMode === "loan") return { eyebrow: "EMPRÉSTIMO", title: "Minutos em outro clube", text: `Você retorna ao ${currentClub.shortName} ao fim da próxima temporada.` };
  if (state.isFreeAgent) return { eyebrow: "AGENTE LIVRE", title: "Seu próximo contrato", text: `${count} projeto${count === 1 ? "" : "s"} sem taxa de transferência.` };
  if (state.forcedAlternativeTransfer) return { eyebrow: "RECOMEÇO", title: "Uma rota de volta", text: "Só projetos de reconstrução estão disponíveis." };
  if (state.forcedClubExit) return { eyebrow: "SAÍDA OBRIGATÓRIA", title: "O clube colocou você no mercado", text: `${count} destino${count === 1 ? "" : "s"} compatíveis com sua fase.` };
  if (state.renewalDenied) return { eyebrow: "CONTRATO ENCERRADO", title: "Hora de escolher", text: `O ${currentClub.shortName} não renovou. Permanecer não está disponível.` };
  if (state.transferRequested) return { eyebrow: "PEDIDO ACEITO", title: "Escolha a próxima camisa", text: "Sua saída foi autorizada e não tem volta." };
  return { eyebrow: "MERCADO", title: "Seu próximo passo", text: `${count} propostas e a opção de continuar o projeto atual.` };
}

function moveLabel(offer: TransferOffer) {
  if (offer.type === "loan") return "Empréstimo · 1 temporada";
  if (offer.type === "free-agent") return "Sem taxa de transferência";
  if (offer.type === "renewal") return "Renovação";
  return `Proposta de ${formatMoney(offer.transferFee)}`;
}

function TravelVehicle({ mode }: { mode: TravelMode }) {
  if (mode === "bus") {
    return (
      <svg className={styles.vehicleSvg} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 17h12M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <path d="M4 10h16M8 4v6m8-6v6M7 14h.01M17 14h.01" />
        <path d="M7 17v2m10-2v2" />
      </svg>
    );
  }
  return (
    <svg className={styles.vehicleSvg} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.8 19 16 11l3.5-3.5c1.5-1.5 2-3.5 1-4.5s-3-.5-4.5 1L12.5 7.5 4.5 6 3 7.5l6.5 3.5L6 14.5 3.5 14 2 15.5l4 2 2 4 1.5-1.5-.5-2.5 3.5-3.5 3.5 6.5 1.8-1.5Z" />
    </svg>
  );
}

function TransferJourneyOverlay({ journey, origin }: { journey: TransferJourney; origin: Club }) {
  const { destination, offer, mode } = journey;
  const originCountry = countryById(origin.countryId);
  const destinationCountry = countryById(destination.countryId);
  const routeLabel = mode === "plane" ? "VOO INTERNACIONAL" : "VIAGEM NACIONAL";
  const transferLabel = offer.type === "loan" ? "EMPRÉSTIMO CONFIRMADO" : "TRANSFERÊNCIA CONFIRMADA";
  const style = {
    "--journey-from": origin.primary,
    "--journey-from-secondary": origin.secondary,
    "--journey-to": destination.primary,
    "--journey-to-secondary": destination.secondary,
  } as CSSProperties;

  return (
    <div className={styles.travelOverlay} role="dialog" aria-modal="true" aria-label={`Viagem de ${origin.shortName} para ${destination.shortName}`} style={style}>
      <section className={styles.travelCard}>
        <header className={styles.travelHeader}>
          <div>
            <span>{transferLabel}</span>
            <strong>{routeLabel}</strong>
          </div>
          <small>{offer.type === "loan" ? "1 temporada" : `${offer.contractYears} ano${offer.contractYears === 1 ? "" : "s"} de contrato`}</small>
        </header>

        <div className={styles.travelStage} aria-live="polite">
          <div className={`${styles.travelGlow} ${styles.travelGlowFrom}`} />
          <div className={`${styles.travelGlow} ${styles.travelGlowTo}`} />

          <div className={`${styles.terminal} ${styles.originTerminal}`}>
            <div className={styles.badgeShell}><ClubBadge club={origin} /></div>
            <span>{mode === "plane" ? "AEROPORTO" : "TERMINAL"} DO</span>
            <strong>{origin.shortName}</strong>
            <small>{origin.city} · {originCountry.name}</small>
          </div>

          <div className={styles.route} aria-hidden="true">
            <svg className={styles.routeSvg} viewBox="0 0 600 190" preserveAspectRatio="none">
              <path className={styles.routeShadow} d="M28 145 C165 18 435 18 572 145" />
              <path className={styles.routeLine} d="M28 145 C165 18 435 18 572 145" />
            </svg>
            <div className={`${styles.vehicle} ${mode === "bus" ? styles.vehicleBus : styles.vehiclePlane}`}>
              <TravelVehicle mode={mode} />
            </div>
            <span className={styles.routeStatus}>{mode === "plane" ? "EM VOO" : "NA ESTRADA"}</span>
          </div>

          <div className={`${styles.terminal} ${styles.destinationTerminal}`}>
            <div className={styles.badgeShell}><ClubBadge club={destination} /></div>
            <span>{mode === "plane" ? "AEROPORTO" : "TERMINAL"} DO</span>
            <strong>{destination.shortName}</strong>
            <small>{destination.city} · {destinationCountry.name}</small>
          </div>
        </div>

        <footer className={styles.travelFooter}>
          <span>{origin.abbr}</span>
          <div><i /><i /><i /></div>
          <strong>{destination.abbr}</strong>
          <small>Preparando apresentação no novo clube…</small>
        </footer>
      </section>
    </div>
  );
}

export default function TransferMarketScreen({ state, currentClub, offers, renewalOffer, onChoose, onStay, onBecomeFreeAgent, onWait }: Props) {
  const copy = windowCopy(state, currentClub, offers.length);
  const canStay = !state.transferRequested && !state.renewalDenied && !state.forcedClubExit && !state.forcedAlternativeTransfer && state.pendingTransferMode !== "loan";
  const [journey, setJourney] = useState<TransferJourney | null>(null);

  useEffect(() => {
    if (!journey) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timer = window.setTimeout(() => {
      const acceptedOffer = journey.offer;
      setJourney(null);
      onChoose(acceptedOffer);
    }, reducedMotion ? 650 : 2750);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [journey, onChoose]);

  function chooseWithJourney(offer: TransferOffer) {
    if (journey) return;
    if (offer.type === "renewal" || offer.clubId === currentClub.id) {
      onChoose(offer);
      return;
    }
    const destination = clubById(offer.clubId);
    setJourney({
      offer,
      destination,
      mode: destination.countryId === currentClub.countryId ? "bus" : "plane",
    });
  }

  return (
    <>
      <section className={`${styles.screen} transfer-stage screen-enter`}>
        <header className={styles.header}>
          <span>{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.text}</p>
        </header>

        <div className={styles.list}>
          {offers.map((offer) => {
            const club = clubById(offer.clubId);
            const league = leagueById(club.leagueId);
            const changesCountry = club.countryId !== currentClub.countryId;
            return (
              <article className={styles.offer} key={offer.id}>
                <button className={styles.offerMain} disabled={Boolean(journey)} onClick={() => chooseWithJourney(offer)}>
                  <ClubBadge club={club} />
                  <span className={styles.identity}>
                    <small>{offer.reasonLabel}</small>
                    <strong>{club.shortName}</strong>
                    <em>{league.name}{changesCountry ? ` · ${countryById(club.countryId).name}` : ""}</em>
                  </span>
                  <span className={styles.deal}>
                    <small>{moveLabel(offer)}</small>
                    <strong>{ROLE_LABELS[offer.role]}</strong>
                    <b aria-hidden><FutboboIcon name="arrow-right" /></b>
                  </span>
                </button>
                <p className={styles.reason}>{offer.reasonText}</p>
                <details className={styles.details}>
                  <summary>Ver contrato</summary>
                  <div>
                    <span><small>Salário anual</small><strong>{formatMoney(offer.annualSalary)}</strong></span>
                    <span><small>Vínculo</small><strong>{offer.type === "loan" ? `Até ${offer.loanEndSeason}` : `${offer.contractYears} ano${offer.contractYears === 1 ? "" : "s"}`}</strong></span>
                    {offer.type === "loan" && <span><small>Salário pago pelo destino</small><strong>{offer.destinationSalaryShare}%</strong></span>}
                  </div>
                </details>
              </article>
            );
          })}

          {canStay && (
            <article className={`${styles.offer} ${styles.stay}`}>
              <button className={styles.offerMain} disabled={Boolean(journey)} onClick={onStay}>
                <ClubBadge club={currentClub} />
                <span className={styles.identity}><small>{state.contractYears === 0 ? "RENOVAÇÃO" : "CONTINUIDADE"}</small><strong>{currentClub.shortName}</strong><em>Manter o projeto atual</em></span>
                <span className={styles.deal}><small>{state.contractYears === 0 ? `${renewalOffer?.contractYears ?? 1} ano(s)` : "Contrato atual"}</small><strong>{state.contractYears === 0 ? formatMoney(renewalOffer?.annualSalary ?? state.annualSalary) : "Ficar"}</strong><b><FutboboIcon name="check" /></b></span>
              </button>
            </article>
          )}
        </div>

        {canStay && state.contractYears === 0 && <button className={styles.secondaryAction} disabled={Boolean(journey)} onClick={onBecomeFreeAgent}><span>Recusar renovação</span><strong>Virar agente livre <FutboboIcon name="arrow-right" /></strong></button>}
        {state.isFreeAgent && <button className={styles.secondaryAction} disabled={Boolean(journey) || (state.age >= 42 && state.forcedFreeAgentUntilSeason <= state.season)} onClick={onWait}><span>{state.forcedFreeAgentUntilSeason > state.season ? "Punição em andamento" : "Nada convenceu?"}</span><strong>Passar um ano sem clube <FutboboIcon name="arrow-right" /></strong></button>}
      </section>
      {journey && <TransferJourneyOverlay journey={journey} origin={currentClub} />}
    </>
  );
}

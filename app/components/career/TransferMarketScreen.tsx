import { useEffect, useRef, useState } from "react";
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

type Point = { x: number; y: number };

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

function cubicPoint(start: Point, controlA: Point, controlB: Point, end: Point, t: number): Point {
  const inv = 1 - t;
  return {
    x: inv ** 3 * start.x + 3 * inv ** 2 * t * controlA.x + 3 * inv * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inv ** 3 * start.y + 3 * inv ** 2 * t * controlA.y + 3 * inv * t ** 2 * controlB.y + t ** 3 * end.y,
  };
}

function cubicTangent(start: Point, controlA: Point, controlB: Point, end: Point, t: number): Point {
  const inv = 1 - t;
  return {
    x: 3 * inv ** 2 * (controlA.x - start.x) + 6 * inv * t * (controlB.x - controlA.x) + 3 * t ** 2 * (end.x - controlB.x),
    y: 3 * inv ** 2 * (controlA.y - start.y) + 6 * inv * t * (controlB.y - controlA.y) + 3 * t ** 2 * (end.y - controlB.y),
  };
}

function TravelVehicle({ mode }: { mode: TravelMode }) {
  if (mode === "bus") {
    return (
      <svg className={styles.vehicleSvg} viewBox="0 0 64 40" aria-hidden="true">
        <path d="M7 8h40c6 0 10 4 10 10v10H4V13c0-3 1-5 3-5Z" />
        <path d="M11 12h27v10H10V14c0-1 0-2 1-2Zm31 0h5c3 0 6 3 6 6v4H42V12Z" />
        <path d="M4 28h53v4H4z" />
        <circle cx="15" cy="32" r="5" />
        <circle cx="47" cy="32" r="5" />
        <path d="M57 21h3m-3 5h3" />
      </svg>
    );
  }
  return (
    <svg className={styles.vehicleSvg} viewBox="0 0 72 42" aria-hidden="true">
      <g transform="translate(72 0) scale(-1 1)">
        <path d="M2 19.2 26 16 38 3h6l-5 13 22 3 7-6h3l-3 8 3 8h-3l-7-6-22 3 5 13h-6L26 26 2 22.8 0 21Z" />
      </g>
    </svg>
  );
}

function TransferJourneyOverlay({ journey, origin, leaving }: { journey: TransferJourney; origin: Club; leaving: boolean }) {
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
  const routeRef = useRef<HTMLDivElement | null>(null);
  const vehicleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const route = routeRef.current;
    const vehicle = vehicleRef.current;
    if (!route || !vehicle) return;

    const plane = mode === "plane";
    const start = { x: 0.04, y: plane ? 0.76 : 0.72 };
    const controlA = { x: 0.28, y: plane ? 0.08 : 0.42 };
    const controlB = { x: 0.72, y: plane ? 0.08 : 0.42 };
    const end = { x: 0.96, y: plane ? 0.76 : 0.72 };
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const sampleCount = 180;
    const samples: Array<{ t: number; length: number }> = [{ t: 0, length: 0 }];
    let totalLength = 0;
    let previous = start;

    for (let index = 1; index <= sampleCount; index += 1) {
      const t = index / sampleCount;
      const point = cubicPoint(start, controlA, controlB, end, t);
      totalLength += Math.hypot(point.x - previous.x, point.y - previous.y);
      samples.push({ t, length: totalLength });
      previous = point;
    }

    const renderAt = (progress: number) => {
      const bounds = route.getBoundingClientRect();
      const targetLength = totalLength * progress;
      let upperIndex = samples.findIndex((sample) => sample.length >= targetLength);
      if (upperIndex < 1) upperIndex = 1;
      const lower = samples[upperIndex - 1];
      const upper = samples[upperIndex];
      const segmentLength = Math.max(0.000001, upper.length - lower.length);
      const blend = (targetLength - lower.length) / segmentLength;
      const t = lower.t + (upper.t - lower.t) * blend;
      const point = cubicPoint(start, controlA, controlB, end, t);
      const tangent = cubicTangent(start, controlA, controlB, end, t);
      const angle = Math.atan2(tangent.y * bounds.height, tangent.x * bounds.width) * 180 / Math.PI;
      vehicle.style.transform = `translate3d(${point.x * bounds.width}px, ${point.y * bounds.height}px, 0) rotate(${angle}deg)`;
    };

    if (reducedMotion) {
      renderAt(1);
      return;
    }

    const duration = plane ? 2380 : 2460;
    const delay = 150;
    const startedAt = performance.now() + delay;
    let frame = 0;

    const animate = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
      renderAt(progress);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };

    renderAt(0);
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  const routePath = mode === "plane"
    ? "M4 76 C28 8 72 8 96 76"
    : "M4 72 C28 42 72 42 96 72";
  const routeY = mode === "plane" ? 76 : 72;

  return (
    <div className={`${styles.travelOverlay} ${leaving ? styles.travelLeaving : ""}`} role="dialog" aria-modal="true" aria-label={`Viagem de ${origin.shortName} para ${destination.shortName}`} style={style}>
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
            <span>ORIGEM</span>
            <strong>{origin.shortName}</strong>
            <small>{origin.city} · {originCountry.name}</small>
          </div>

          <div className={styles.route} ref={routeRef} aria-hidden="true">
            <svg className={styles.routeSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
              <path className={styles.routeShadow} d={routePath} />
              <path className={styles.routeLine} d={routePath} />
              <circle className={styles.routePoint} cx="4" cy={routeY} r="1.5" />
              <circle className={styles.routePoint} cx="96" cy={routeY} r="1.5" />
            </svg>
            <div ref={vehicleRef} className={`${styles.vehicleMotion} ${mode === "bus" ? styles.vehicleBus : styles.vehiclePlane}`}>
              <div className={styles.vehicleCenter}><TravelVehicle mode={mode} /></div>
            </div>
            <span className={styles.routeStatus}>{mode === "plane" ? "EM VOO" : "NA ESTRADA"}</span>
          </div>

          <div className={`${styles.terminal} ${styles.destinationTerminal}`}>
            <div className={styles.badgeShell}><ClubBadge club={destination} /></div>
            <span>DESTINO</span>
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
  const [journeyLeaving, setJourneyLeaving] = useState(false);
  const onChooseRef = useRef(onChoose);
  const journeyFinishingRef = useRef(false);

  useEffect(() => {
    onChooseRef.current = onChoose;
  }, [onChoose]);

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
    if (offer.type === "renewal" || offer.clubId === currentClub.id) {
      onChoose(offer);
      return;
    }
    const destination = clubById(offer.clubId);
    setJourneyLeaving(false);
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
      {journey && <TransferJourneyOverlay journey={journey} origin={currentClub} leaving={journeyLeaving} />}
    </>
  );
}

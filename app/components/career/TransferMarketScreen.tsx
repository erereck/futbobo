import { ROLE_LABELS } from "../../career-systems";
import type { Club } from "../../game-data";
import { countryById, leagueById } from "../../game-data";
import type { GameState, TransferOffer } from "../../career/model";
import { formatMoney } from "../../career/performance";
import { clubById } from "../../career/shared";
import { ClubBadge } from "./CareerPrimitives";
import styles from "./TransferMarketScreen.module.css";

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

export default function TransferMarketScreen({ state, currentClub, offers, renewalOffer, onChoose, onStay, onBecomeFreeAgent, onWait }: Props) {
  const copy = windowCopy(state, currentClub, offers.length);
  const canStay = !state.transferRequested && !state.renewalDenied && !state.forcedClubExit && !state.forcedAlternativeTransfer && state.pendingTransferMode !== "loan";
  return (
    <section className={`${styles.screen} screen-enter`}>
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
              <button className={styles.offerMain} onClick={() => onChoose(offer)}>
                <ClubBadge club={club} />
                <span className={styles.identity}>
                  <small>{offer.reasonLabel}</small>
                  <strong>{club.shortName}</strong>
                  <em>{league.name}{changesCountry ? ` · ${countryById(club.countryId).name}` : ""}</em>
                </span>
                <span className={styles.deal}>
                  <small>{moveLabel(offer)}</small>
                  <strong>{ROLE_LABELS[offer.role]}</strong>
                  <b aria-hidden>→</b>
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
            <button className={styles.offerMain} onClick={onStay}>
              <ClubBadge club={currentClub} />
              <span className={styles.identity}><small>{state.contractYears === 0 ? "RENOVAÇÃO" : "CONTINUIDADE"}</small><strong>{currentClub.shortName}</strong><em>Manter o projeto atual</em></span>
              <span className={styles.deal}><small>{state.contractYears === 0 ? `${renewalOffer?.contractYears ?? 1} ano(s)` : "Contrato atual"}</small><strong>{state.contractYears === 0 ? formatMoney(renewalOffer?.annualSalary ?? state.annualSalary) : "Ficar"}</strong><b>✓</b></span>
            </button>
          </article>
        )}
      </div>

      {canStay && state.contractYears === 0 && <button className={styles.secondaryAction} onClick={onBecomeFreeAgent}><span>Recusar renovação</span><strong>Virar agente livre →</strong></button>}
      {state.isFreeAgent && <button className={styles.secondaryAction} disabled={state.age >= 42 && state.forcedFreeAgentUntilSeason <= state.season} onClick={onWait}><span>{state.forcedFreeAgentUntilSeason > state.season ? "Punição em andamento" : "Nada convenceu?"}</span><strong>Passar um ano sem clube →</strong></button>}
    </section>
  );
}

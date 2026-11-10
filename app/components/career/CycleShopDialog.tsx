"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CLUBS, COUNTRIES } from "../../game-data";
import { webglAvailable } from "../../botao/view-mode";
import { CYCLE_SHOP_ITEMS, cycleShopPurchaseKey } from "../../career/cycle-shop";
import type { CycleShopItemId } from "../../career/cycle-shop";
import type { GameState } from "../../career/model";
import { formatMoney } from "../../career/performance";
import { specialTrainingStatus, type SpecialTrainingStatus } from "../../career/special-training-status";
import { NationBadge } from "./CareerPrimitives";
import { Stamp } from "./album/primitives";
import AlbumSheet, { sheetStyles as styles } from "./album/sheets/AlbumSheet";

/** Botão do Treino especial: abre (grátis) ou diz por que não. */
const TRAINING_LABELS: Record<SpecialTrainingStatus, string> = {
  available: "Treinar grátis",
  "in-progress": "Continuar treino",
  challenge: "Fora do desafio",
  "no-webgl": "Precisa de 3D",
  maxed: "No limite",
  rewarded: "Treinado ✓",
  "no-reward": "Sem bônus",
};

/** "RISCO OCULTO" → "Risco oculto": o catálogo não grita. */
function sentenceCase(text: string) {
  const lower = text.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

const CLUBS_BY_COUNTRY = CLUBS.reduce<Record<string, number>>((counts, club) => {
  counts[club.countryId] = (counts[club.countryId] ?? 0) + 1;
  return counts;
}, {});

type Props = {
  game: GameState;
  club: { primary: string; secondary: string };
  feedback: string;
  onBuy: (itemId: CycleShopItemId, countryId?: string) => void;
  onClose: () => void;
};

/** QUADRA no álbum: catálogo do quadriênio com etiquetas de preço penduradas. */
export default function CycleShopDialog({ game, club, feedback, onBuy, onClose }: Props) {
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const marketCountries = useMemo(() => {
    const needle = countrySearch.trim().toLocaleLowerCase("pt-BR");
    return COUNTRIES.filter((country) => CLUBS_BY_COUNTRY[country.id] && (!needle || country.name.toLocaleLowerCase("pt-BR").includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [countrySearch]);
  const focusedCountry = COUNTRIES.find((country) => country.id === game.agentCountryFocus);
  // O treino roda no Scorebobo (3D). Lido uma vez por abertura da loja: cada leitura custa um contexto de WebGL.
  const [webgl] = useState(webglAvailable);
  const trainingStatus = specialTrainingStatus(game, webgl);
  // Abrir a lista de países mostra o topo dela; fechar devolve o foco à Rota do empresário.
  const pickerRef = useRef<HTMLElement>(null);
  const routeTagRef = useRef<HTMLButtonElement>(null);
  const pickerWasOpen = useRef(false);
  useEffect(() => {
    if (countryPickerOpen) pickerRef.current?.scrollIntoView({ block: "start" });
    else if (pickerWasOpen.current) routeTagRef.current?.focus();
    pickerWasOpen.current = countryPickerOpen;
  }, [countryPickerOpen]);

  return (
    <AlbumSheet
      ink="yellow"
      club={club}
      size="wide"
      titleId="cycle-shop-title"
      kicker="Loja do quadriênio"
      title="QUADRA"
      aside={<div className={styles.balance}><span>Caixa disponível</span><strong>{formatMoney(game.spendableMoney)}</strong></div>}
      footer={(
        <>
          {feedback ? <p aria-live="polite" className={styles.receipt}>{feedback}</p> : null}
          <Stamp variant="primary" onClick={onClose}>Entrar na temporada</Stamp>
        </>
      )}
    >
      {countryPickerOpen ? (
        <section ref={pickerRef} className={styles.picker} aria-labelledby="agent-country-title">
          <div className={styles.pickerHead}>
            <div>
              <h3 id="agent-country-title">Onde você quer abrir o mercado?</h3>
              <p>A Rota do empresário vale para o fim do seu contrato atual. Os clubes dentro do país são sorteados sem filtro de tamanho.</p>
            </div>
            <Stamp onClick={() => setCountryPickerOpen(false)}>Voltar ao catálogo</Stamp>
          </div>
          <input
            className={styles.search}
            value={countrySearch}
            onChange={(event) => setCountrySearch(event.target.value)}
            placeholder="Buscar país..."
            aria-label="Buscar país"
            autoFocus
          />
          {marketCountries.length ? (
            <div className={styles.countries}>
              {marketCountries.map((country) => (
                <button className={styles.country} key={country.id} type="button" onClick={() => { onBuy("agent-country", country.id); setCountryPickerOpen(false); }}>
                  <NationBadge country={country} size="sm" />
                  <span><strong>{country.name}</strong><small>{CLUBS_BY_COUNTRY[country.id]} clubes disponíveis</small></span>
                </button>
              ))}
            </div>
          ) : <p className={styles.empty}>Nenhum país com clubes encontrado.</p>}
        </section>
      ) : (
        <>
          <p className={styles.lead}>Quatro anos de caixa, uma janela curta. Invista no próximo ciclo ou guarde cada centavo.</p>
          <ul className={styles.catalog}>
            {CYCLE_SHOP_ITEMS.map((item) => {
              const bought = game.economyPurchases.includes(cycleShopPurchaseKey(game, item.id));
              const atOverallLimit = item.id === "overall" && game.overall >= 99;
              const pendingContract = (item.id === "contract-shorter" || item.id === "contract-longer") && game.nextContractYearsAdjustment !== 0;
              const releaseUnavailable = item.id === "release" && (game.isFreeAgent || game.contractYears <= 0);
              const training = item.id === "special-training";
              const disabled = training
                ? trainingStatus !== "available" && trainingStatus !== "in-progress"
                : !item.available || bought || atOverallLimit || pendingContract || releaseUnavailable || game.spendableMoney < item.price;
              const openCountryPicker = item.id === "agent-country";
              const label = training ? TRAINING_LABELS[trainingStatus] : !item.available ? "Em breve" : bought ? "Adquirido" : atOverallLimit ? "No limite" : pendingContract ? "Ajuste pendente" : releaseUnavailable ? "Sem contrato" : formatMoney(item.price);
              return (
                <li className={styles.item} data-tone={item.tone} data-state={bought || (training && trainingStatus === "rewarded") ? "bought" : undefined} key={item.id}>
                  <div>
                    <p className={styles.itemKicker}>{sentenceCase(item.eyebrow)}</p>
                    <h3>{item.name}</h3>
                    <p className={styles.itemText}>{item.description}{openCountryPicker && focusedCountry ? ` Foco atual: ${focusedCountry.name}.` : ""}</p>
                  </div>
                  <button
                    ref={openCountryPicker ? routeTagRef : undefined}
                    className={styles.tag}
                    disabled={disabled}
                    onClick={() => openCountryPicker ? setCountryPickerOpen(true) : onBuy(item.id)}
                    type="button"
                    aria-label={`${item.name}: ${label}`}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AlbumSheet>
  );
}

"use client";

import { useMemo, useState } from "react";
import { CLUBS, COUNTRIES } from "../../game-data";
import { CYCLE_SHOP_ITEMS, cycleShopPurchaseKey } from "../../career/cycle-shop";
import type { CycleShopItemId } from "../../career/cycle-shop";
import type { GameState } from "../../career/model";
import { formatMoney } from "../../career/performance";
import { NationBadge } from "./CareerPrimitives";
import styles from "./CareerOverlays.module.css";

type Props = {
  game: GameState;
  feedback: string;
  onBuy: (itemId: CycleShopItemId, countryId?: string) => void;
  onClose: () => void;
};

export default function CycleShopDialog({ game, feedback, onBuy, onClose }: Props) {
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const marketCountries = useMemo(() => {
    const represented = new Set(CLUBS.map((club) => club.countryId));
    const needle = countrySearch.trim().toLocaleLowerCase("pt-BR");
    return COUNTRIES.filter((country) => represented.has(country.id) && (!needle || country.name.toLocaleLowerCase("pt-BR").includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [countrySearch]);
  const focusedCountry = COUNTRIES.find((country) => country.id === game.agentCountryFocus);
  return (
    <div className={styles.backdrop} role="presentation">
      <section aria-labelledby="cycle-shop-title" aria-modal="true" className={styles.shopDialog} role="dialog">
        <header className={styles.shopHeader}>
          <div>
            <p className={styles.eyebrow}>LOJA DO QUADRIÊNIO</p>
            <h2 className={styles.shopTitle} id="cycle-shop-title">QUADRA</h2>
            <p className={styles.shopIntro}>Quatro anos de caixa, uma janela curta. Invista no próximo ciclo — ou guarde cada centavo.</p>
          </div>
          <div className={styles.balance}><span>CAIXA DISPONÍVEL</span><strong>{formatMoney(game.spendableMoney)}</strong></div>
        </header>
        <div className={styles.shopBody}>
          <div className={styles.shopGrid}>
            {CYCLE_SHOP_ITEMS.map((item) => {
              const bought = game.economyPurchases.includes(cycleShopPurchaseKey(game, item.id));
              const atOverallLimit = item.id === "overall" && game.overall >= 99;
              const disabled = !item.available || bought || atOverallLimit || game.spendableMoney < item.price;
              const openCountryPicker = item.id === "agent-country";
              return (
                <article className={styles.shopItem} data-tone={item.tone} key={item.id}>
                  <div>
                    <p className={styles.itemEyebrow}>{item.eyebrow}</p>
                    <h3 className={styles.itemName}>{item.name}</h3>
                    <p className={styles.itemDescription}>{item.description}{openCountryPicker && focusedCountry ? ` Foco atual: ${focusedCountry.name}.` : ""}</p>
                  </div>
                  <button className={styles.buy} disabled={disabled} onClick={() => openCountryPicker ? setCountryPickerOpen(true) : onBuy(item.id)} type="button">
                    {!item.available ? "Em breve" : bought ? "Adquirido" : atOverallLimit ? "No limite" : formatMoney(item.price)}
                  </button>
                </article>
              );
            })}
          </div>
          {countryPickerOpen ? (
            <section className={styles.countryPicker} aria-label="Escolher país para o empresário">
              <header><div><span>ROTA DO EMPRESÁRIO</span><strong>Onde você quer abrir o mercado?</strong><small>A ordem vale para o fim do seu contrato atual. Os clubes dentro do país são sorteados sem filtro de tamanho.</small></div><button type="button" onClick={() => setCountryPickerOpen(false)}>×</button></header>
              <input className={styles.countrySearch} value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} placeholder="Buscar país..." />
              <div className={styles.countryGrid}>
                {marketCountries.map((country) => (
                  <button className={styles.countryChoice} key={country.id} type="button" onClick={() => { onBuy("agent-country", country.id); setCountryPickerOpen(false); }}>
                    <NationBadge country={country} size="sm" /><span><strong>{country.name}</strong><small>{CLUBS.filter((club) => club.countryId === country.id).length} clubes disponíveis</small></span><b>→</b>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {feedback ? <p aria-live="polite" className={styles.feedback}>{feedback}</p> : null}
          <div className={styles.shopFooter}><button className={styles.continueButton} onClick={onClose} type="button">Entrar na temporada →</button></div>
        </div>
      </section>
    </div>
  );
}

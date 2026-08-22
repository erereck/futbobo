import { CYCLE_SHOP_ITEMS, cycleShopPurchaseKey } from "../../career/cycle-shop";
import type { CycleShopItemId } from "../../career/cycle-shop";
import type { GameState } from "../../career/model";
import { formatMoney } from "../../career/performance";
import styles from "./CareerOverlays.module.css";

type Props = {
  game: GameState;
  feedback: string;
  onBuy: (itemId: CycleShopItemId) => void;
  onClose: () => void;
};

export default function CycleShopDialog({ game, feedback, onBuy, onClose }: Props) {
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
              return (
                <article className={styles.shopItem} data-tone={item.tone} key={item.id}>
                  <div>
                    <p className={styles.itemEyebrow}>{item.eyebrow}</p>
                    <h3 className={styles.itemName}>{item.name}</h3>
                    <p className={styles.itemDescription}>{item.description}</p>
                  </div>
                  <button className={styles.buy} disabled={disabled} onClick={() => onBuy(item.id)} type="button">
                    {!item.available ? "Em breve" : bought ? "Adquirido" : atOverallLimit ? "No limite" : formatMoney(item.price)}
                  </button>
                </article>
              );
            })}
          </div>
          {feedback ? <p aria-live="polite" className={styles.feedback}>{feedback}</p> : null}
          <div className={styles.shopFooter}><button className={styles.continueButton} onClick={onClose} type="button">Entrar na temporada →</button></div>
        </div>
      </section>
    </div>
  );
}

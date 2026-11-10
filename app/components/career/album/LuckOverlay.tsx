"use client";

import { Pictogram } from "./Pictogram";
import styles from "./luckOverlay.module.css";

/** Escolha de sorte: a figurinha gira no ar enquanto o resultado não sai. */
export default function LuckOverlay({ choiceLabel, chance }: { choiceLabel: string; chance: number }) {
  return (
    <div className={styles.backdrop} role="status" aria-live="assertive">
      <section className={styles.card}>
        <span className={styles.kicker}>Escolha de sorte</span>
        <div className={styles.flip} aria-hidden="true">
          <span className={styles.coin}>
            <span className={styles.front}><Pictogram name="dice" /></span>
            <span className={styles.back}><b>{chance}%</b></span>
          </span>
        </div>
        <h2>A sorte está girando…</h2>
        {choiceLabel && <p>{choiceLabel}</p>}
        <small className={styles.chance}><b>{chance}%</b> de chance de dar certo</small>
      </section>
    </div>
  );
}

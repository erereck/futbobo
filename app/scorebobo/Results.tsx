"use client";

// Fim de fase: as estrelas acendem uma a uma (com o sino subindo), o que valeu
// cada uma, e os caminhos: próxima fase, tentar de novo, ver o gol de novo ou
// voltar às fases. No "Ver replay" o cartão só sai da frente (não desmonta): ao
// voltar, as estrelas já estão acesas e o sino não toca de novo.

import { useEffect, useLayoutEffect, useRef } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { playStarSound } from "./audio";
import { describeRule, StarIcon } from "./Hud";
import type { ScoreLevel } from "./types";
import type { StarCount } from "./storage";
import styles from "./hud.module.css";

const STAR_DELAY_MS = 520;
const STAR_START_MS = 650;
/** Botões desarmados logo que o cartão aparece (o "click" atrasado do toque que pulou o replay). */
const ARM_MS = 400;

export function Results({ level, levelIndex, stars, record, notes, met, hasNext, nextUnlocked, away = false, onNext, onRetry, onReplay, onLevels }: {
  level: ScoreLevel;
  levelIndex: number;
  stars: StarCount;
  /** Melhor que o recorde salvo. */
  record: boolean;
  notes: string[];
  /** Quais regras o gol cumpriu (objetivo, 2ª, 3ª): a estrela acende na regra certa, não pela contagem. */
  met?: [boolean, boolean, boolean];
  hasNext: boolean;
  nextUnlocked: boolean;
  /** O replay está passando de novo: o cartão fica escondido, montado. */
  away?: boolean;
  onNext: () => void;
  onRetry: () => void;
  /** Fase ganha com o gol ainda guardado: o botão "Ver replay". */
  onReplay?: () => void;
  onLevels: () => void;
}) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const wasAway = useRef(false);
  /** Quando o cartão apareceu (ou voltou do replay). */
  const shownAt = useRef(0);
  /** Algum dedo/mouse encostou no cartão depois que ele apareceu. */
  const pressedHere = useRef(false);

  useLayoutEffect(() => {
    shownAt.current = performance.now();
    pressedHere.current = false;
  }, []);

  // De volta do replay: o foco volta para o botão que o pediu (Enter vê de novo).
  useLayoutEffect(() => {
    if (away) wasAway.current = true;
    else if (wasAway.current) {
      wasAway.current = false;
      shownAt.current = performance.now();
      pressedHere.current = false;
      replayRef.current?.focus({ preventScroll: true });
    }
  }, [away]);

  /**
   * O toque que pulou o replay solta o dedo já com o cartão na tela, e o
   * celular manda o "click" dele para o botão que ficou embaixo do dedo
   * (passava de fase sozinho). Só vale o clique de um toque que COMEÇOU no
   * cartão (o dedo segurado um pouco mais passava dos 400 ms), ou o do
   * teclado (`detail` 0); e nos primeiros 400 ms, nenhum.
   */
  const armed = (action: () => void) => (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!pressedHere.current && event.detail !== 0) return;
    if (performance.now() - shownAt.current >= ARM_MS) action();
  };

  useEffect(() => {
    const timers = Array.from({ length: stars }, (_, index) => window.setTimeout(() => playStarSound(index), STAR_START_MS + index * STAR_DELAY_MS));
    const focus = window.setTimeout(() => primaryRef.current?.focus({ preventScroll: true }), STAR_START_MS);
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      window.clearTimeout(focus);
    };
  }, [stars]);

  const won = stars > 0;
  const rules = [level.objective, describeRule(level.stars[0]), describeRule(level.stars[1])];
  const lit = (index: number) => (met ? won && met[index] : index < stars);
  // A última fase é a final: quem marca levanta a taça.
  const champion = won && !hasNext;
  const verdict = champion ? (stars === 3 ? "Perfeito: o gol do título é seu" : "O gol do título é seu") : stars === 3 ? "Perfeito!" : stars === 2 ? "Jogada de craque" : stars === 1 ? "Objetivo cumprido" : level.attempts === 1 ? "Era uma bola só" : "As bolas acabaram";

  return (
    <div
      className={`${styles.results} ${away ? styles.resultsAway : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sb-results-title"
      onPointerDownCapture={() => {
        pressedHere.current = true;
      }}
    >
      <div className={`${styles.resultsCard} ${won ? styles.resultsWon : styles.resultsLost}`}>
        <span className={styles.resultsKicker}>FASE {String(levelIndex + 1).padStart(2, "0")} · {level.name.toUpperCase()}</span>
        <h2 id="sb-results-title" className={styles.resultsTitle}>{champion ? "É CAMPEÃO!" : won ? "FASE CONCLUÍDA" : "NÃO FOI DESSA VEZ"}</h2>
        <p className={styles.resultsVerdict}>{verdict}</p>

        <div className={styles.resultsStars} aria-label={`${stars} de 3 estrelas`}>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={`${styles.resultsStar} ${index < stars ? styles.resultsStarLit : ""}`}
              style={{ "--delay": `${STAR_START_MS + index * STAR_DELAY_MS}ms`, "--tilt": `${(index - 1) * 9}deg` } as CSSProperties}
            >
              <StarIcon lit={false} className={styles.resultsStarBase} />
              {index < stars && <StarIcon lit className={styles.resultsStarGold} />}
              {index < stars && <i className={styles.resultsBurst} aria-hidden="true" />}
            </span>
          ))}
        </div>

        {record && <span className={styles.resultsRecord} style={{ "--delay": `${STAR_START_MS + stars * STAR_DELAY_MS}ms` } as CSSProperties}>NOVO RECORDE</span>}

        <ul className={styles.resultsRules}>
          {rules.map((rule, index) => (
            <li key={index} className={lit(index) ? styles.ruleDone : ""} style={{ "--delay": `${STAR_START_MS + index * STAR_DELAY_MS}ms` } as CSSProperties}>
              <StarIcon lit={lit(index)} className={styles.ruleStar} />
              <span>{rule}</span>
            </li>
          ))}
        </ul>

        {/* Ganhou: as linhas das estrelas já contam a história. Perdeu: a dica do que fazer. */}
        {!won && notes.length > 0 && (
          <p className={styles.resultsNotes}>{notes.join(" · ")}</p>
        )}

        <div className={styles.resultsActions}>
          {hasNext && (won || nextUnlocked) ? (
            <button ref={won ? primaryRef : undefined} type="button" className={won ? styles.primaryButton : styles.secondaryButton} onClick={armed(onNext)} disabled={!nextUnlocked}>
              Próxima fase
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ) : null}
          <button ref={won && hasNext ? undefined : primaryRef} type="button" className={won && hasNext ? styles.secondaryButton : styles.primaryButton} onClick={armed(onRetry)}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1M4 3.5v3.6h3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Tentar de novo
          </button>
          {won && onReplay && (
            <button ref={replayRef} type="button" className={styles.secondaryButton} onClick={armed(onReplay)}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8.4 7.3v5.4l4.5-2.7z" fill="currentColor" /></svg>
              Ver replay
            </button>
          )}
          <button type="button" className={styles.secondaryButton} onClick={armed(onLevels)}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
            Fases
          </button>
        </div>
      </div>
    </div>
  );
}

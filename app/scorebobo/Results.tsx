"use client";

// Fim de fase: as estrelas acendem uma a uma (com o sino subindo), o que valeu
// cada uma, e os caminhos: próxima fase, tentar de novo, ver o gol de novo ou
// voltar às fases. No "Ver replay" o cartão só sai da frente (não desmonta): ao
// voltar, as estrelas já estão acesas e o sino não toca de novo.

import { useEffect, useLayoutEffect, useRef } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { playStarSound } from "./audio";
import { describeRule, levelLabel, sentenceKicker, StarIcon } from "./Hud";
import type { ScoreLevel } from "./types";
import type { StarCount } from "./storage";
import styles from "./hud.module.css";

const STAR_DELAY_MS = 520;
const STAR_START_MS = 650;
/** Botões desarmados logo que o cartão aparece (o "click" atrasado do toque que pulou o replay). */
const ARM_MS = 400;

export function Results({ level, levelIndex, stars, record, notes, met, hasNext, nextUnlocked, away = false, onNext, onRetry, onReplay, onLevels, career }: {
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
  /**
   * Jogada da carreira (base, treino especial): o rótulo do host no lugar de
   * "FASE 0X", "Continuar" sempre e "Tentar de novo (N)" só com chance sobrando
   * e menos de 3 estrelas; sem "Próxima fase" e sem "Fases". A taça, só na final.
   */
  career?: { kicker: string; retriesLeft: number; onRetry: () => void; onContinue: () => void };
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
  const champion = won && (career ? level.id === "final-da-copa" : !hasNext);
  const careerRetry = career ? career.retriesLeft > 0 && stars < 3 : false;
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
      <div className={`${styles.resultsCard} ${won ? styles.resultsWon : ""} ${champion ? styles.resultsChampion : ""}`}>
        <i className={styles.tape} data-side="left" aria-hidden="true" />
        <i className={styles.tape} data-side="right" aria-hidden="true" />
        <div className={styles.resultsHead}>
          <header className={styles.resultsBand}>
            <span className={styles.resultsKicker}>{career ? sentenceKicker(career.kicker) : levelLabel(levelIndex)} · {level.name}</span>
            <h2 id="sb-results-title" className={styles.resultsTitle}>{champion ? "É campeão!" : won ? "Fase concluída" : "Não foi dessa vez"}</h2>
          </header>
          {record && (
            <span className={styles.resultsRecord} style={{ "--delay": `${STAR_START_MS + stars * STAR_DELAY_MS}ms` } as CSSProperties}>
              <b>Novo</b><b>recorde</b>
            </span>
          )}
          <p className={styles.resultsVerdict}>{verdict}</p>

          <div className={styles.resultsStars} aria-label={`${stars} de 3 estrelas`}>
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={styles.resultsStar}
                style={{ "--delay": `${STAR_START_MS + index * STAR_DELAY_MS}ms`, "--tilt": `${(index - 1) * 9}deg` } as CSSProperties}
              >
                <StarIcon lit={false} className={styles.resultsStarBase} />
                {index < stars && <StarIcon lit className={styles.resultsStarGold} />}
                {index < stars && <i className={styles.resultsBurst} aria-hidden="true" />}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.resultsBody}>
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
            {career ? (
              <>
                {/* Com chance sobrando e menos de ★★★, o destaque é jogar de novo: na carreira vale a melhor das 3. */}
                <button ref={careerRetry ? undefined : primaryRef} type="button" className={careerRetry ? styles.secondaryButton : styles.primaryButton} onClick={armed(career.onContinue)}>
                  Continuar
                </button>
                {careerRetry && (
                  <button ref={primaryRef} type="button" className={styles.primaryButton} onClick={armed(career.onRetry)}>
                    Tentar de novo ({career.retriesLeft})
                  </button>
                )}
              </>
            ) : null}
            {!career && hasNext && (won || nextUnlocked) ? (
              <button ref={won ? primaryRef : undefined} type="button" className={won ? styles.primaryButton : styles.secondaryButton} onClick={armed(onNext)} disabled={!nextUnlocked}>
                Próxima fase
              </button>
            ) : null}
            {!career && (
              <button ref={won && hasNext ? undefined : primaryRef} type="button" className={won && hasNext ? styles.secondaryButton : styles.primaryButton} onClick={armed(onRetry)}>
                Tentar de novo
              </button>
            )}
            {won && onReplay && (
              <button ref={replayRef} type="button" className={styles.secondaryButton} onClick={armed(onReplay)}>
                Ver replay
              </button>
            )}
            {!career && (
              <button type="button" className={styles.secondaryButton} onClick={armed(onLevels)}>
                Fases
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

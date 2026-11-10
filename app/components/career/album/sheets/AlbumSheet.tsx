"use client";

import { useEffect, useRef } from "react";
import type { ReactNode, Ref } from "react";
import { albumStyles } from "../AlbumShell";
import { clubInks } from "../inks";
import styles from "./sheets.module.css";

export { styles as sheetStyles };

export type SheetInk = "blue" | "red" | "ink" | "mustard" | "green" | "club" | "yellow";

/**
 * Folha solta presa no álbum com fita: o lugar dos pop-ups da carreira (coletiva, QUADRA,
 * decisão de história, treino especial, editor de visual). Monta fora das páginas, então
 * leva os próprios tokens; no celular sobe do rodapé e a ação principal vira faixa amarela.
 */
export default function AlbumSheet({
  ink,
  club,
  titleId,
  labelledBy,
  kicker,
  title,
  emblem,
  aside,
  size = "narrow",
  stacked = false,
  onDismiss,
  footer,
  backdropRef,
  dialogRef,
  inert,
  className,
  after,
  children,
}: {
  ink: SheetInk;
  club: { primary: string; secondary: string };
  titleId: string;
  /** Sobrescreve o `aria-labelledby` do diálogo (padrão: o título da faixa). */
  labelledBy?: string;
  kicker?: ReactNode;
  title: ReactNode;
  /** Pictograma branco no começo da faixa. */
  emblem?: ReactNode;
  aside?: ReactNode;
  size?: "narrow" | "wide";
  /** Folha por cima de outra folha (treino especial sobre a QUADRA). */
  stacked?: boolean;
  /** Fecha com Esc, clique fora e o botão da faixa. Sem ele, a folha só sai pela própria ação. */
  onDismiss?: () => void;
  footer?: ReactNode;
  backdropRef?: Ref<HTMLDivElement>;
  dialogRef?: Ref<HTMLElement>;
  inert?: boolean;
  className?: string;
  /** Fica dentro do fundo, fora da folha (portais que precisam herdar o `inert`). */
  after?: ReactNode;
  children: ReactNode;
}) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  const dismissible = Boolean(onDismiss);
  useEffect(() => {
    if (!dismissible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) dismissRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissible]);

  // Sem dono do foco (o treino especial cuida do dele): a folha recebe o foco ao abrir e devolve ao fechar.
  const ownRef = useRef<HTMLElement>(null);
  const managesFocus = !dialogRef;
  useEffect(() => {
    if (!managesFocus) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = ownRef.current;
    if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [managesFocus]);

  return (
    <div
      ref={backdropRef}
      className={`${albumStyles.tokens} ${styles.backdrop}`}
      style={clubInks(club.primary, club.secondary)}
      role="presentation"
      data-stacked={stacked ? "" : undefined}
      inert={inert ? true : undefined}
      onMouseDown={onDismiss ? (event) => { if (event.target === event.currentTarget) onDismiss(); } : undefined}
    >
      <section
        ref={dialogRef ?? ownRef}
        className={`${styles.sheet} ${className ?? ""}`}
        data-size={size}
        data-ink={ink}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        tabIndex={-1}
      >
        <span className={styles.tape} data-side="left" aria-hidden="true" />
        <span className={styles.tape} data-side="right" aria-hidden="true" />
        <header className={styles.band} data-emblem={emblem ? "" : undefined}>
          {emblem && <span className={styles.emblem} aria-hidden="true">{emblem}</span>}
          <div className={styles.bandText}>
            {kicker && <p className={styles.kicker}>{kicker}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          {aside && <div className={styles.bandAside}>{aside}</div>}
          {onDismiss && (
            <button type="button" className={styles.close} aria-label="Fechar" onClick={onDismiss}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          )}
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </section>
      {after}
    </div>
  );
}

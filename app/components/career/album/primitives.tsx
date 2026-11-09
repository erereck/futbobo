"use client";

import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import type { Club, Country } from "../../../game-data";
import type { PlayerAppearance } from "../../../player-appearance";
import { drawPlayerBust } from "../../../player-appearance";
import { ClubBadge, NationBadge } from "../CareerPrimitives";
import styles from "./primitives.module.css";

export { styles as albumPrimitives };

/* ───────────── faixas impressas ───────────── */

/** Faixa do clube no topo da página: escudo, nome, cidade/liga e o número da página (a idade). */
export function ClubBand({ club, subtitle, page, title }: { club: Club; subtitle: ReactNode; page?: number; title?: string }) {
  return (
    <header className={styles.band}>
      <span className={styles.bandCrest}><ClubBadge club={club} size="md" /></span>
      <div className={styles.bandName}>
        <h2>{title ?? club.shortName}</h2>
        <p>{subtitle}</p>
      </div>
      {page !== undefined && <span className={styles.pageNo} aria-label={`Página ${page}`}><b className={styles.num}>{page}</b><small>pág.</small></span>}
    </header>
  );
}

export type AlbumInk = "blue" | "red" | "ink" | "mustard" | "green" | "club";

const INK_BG: Record<AlbumInk, string> = {
  blue: "var(--blue)",
  red: "var(--red)",
  ink: "var(--ink)",
  mustard: "var(--mustard)",
  green: "var(--green)",
  club: "var(--club)",
};
const INK_STRIPE: Record<AlbumInk, string> = {
  blue: "var(--red)",
  red: "var(--ink)",
  ink: "var(--yellow)",
  mustard: "var(--ink)",
  green: "var(--yellow)",
  club: "var(--club-2)",
};

/** Faixa de seção na cor da aba (Jogador azul, Time vermelho…). */
export function InkBand({ ink, title, subtitle, crest, aside }: { ink: AlbumInk; title: ReactNode; subtitle?: ReactNode; crest?: { club?: Club; country?: Country }; aside?: ReactNode }) {
  const style = {
    "--band-bg": INK_BG[ink],
    "--band-stripe": INK_STRIPE[ink],
    "--band-ink": ink === "club" ? "var(--club-ink)" : "#fff",
  } as CSSProperties;
  return (
    <header className={styles.band} style={style} data-plain={crest ? undefined : ""}>
      {crest && <span className={styles.bandCrest}>{crest.club ? <ClubBadge club={crest.club} size="md" /> : crest.country ? <NationBadge country={crest.country} size="md" /> : null}</span>}
      <div className={styles.bandName}>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}

/* ───────────── figurinha do jogador ───────────── */

/** Busto do personagem recortado (sem o disco), desenhado no mesmo traço da mesa. */
export function StickerBust({ appearance, primary, secondary, className }: { appearance: PlayerAppearance; primary: string; secondary: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height * 0.47);
    drawPlayerBust(context, appearance, primary, secondary, canvas.width * 0.43, 0, { cutout: true });
    context.restore();
  }, [appearance, primary, secondary]);
  return <canvas ref={canvasRef} className={className} width={320} height={320} aria-hidden="true" />;
}

export function PlayerSticker({
  name,
  number,
  overall,
  subtitle,
  club,
  appearance,
  size = "lg",
  tilt = "-2.4deg",
  className,
  style,
  kit,
  crest,
}: {
  name: string;
  number: number;
  /** `null` esconde o selo de OVR (jogador ainda sem nota, na criação). */
  overall: number | null;
  subtitle?: string;
  /** Clube impresso na figurinha. Sem clube, use `kit` (cores) e `crest` (bandeira, por exemplo). */
  club?: Club;
  appearance: PlayerAppearance | null;
  size?: "lg" | "sm";
  tilt?: string;
  className?: string;
  style?: CSSProperties;
  kit?: { primary: string; secondary: string };
  crest?: ReactNode;
}) {
  const colors = kit ?? club ?? { primary: "#0b5cad", secondary: "#ffffff" };
  const crestNode = crest ?? (club ? <ClubBadge club={club} size="sm" /> : null);
  return (
    <figure className={`${styles.sticker} ${className ?? ""}`} data-size={size} style={{ "--tilt": tilt, ...style } as CSSProperties}>
      <div className={styles.face}>
        <div className={styles.plArt}>
          {appearance
            ? <StickerBust className={styles.plBust} appearance={appearance} primary={colors.primary} secondary={colors.secondary} />
            : <span className={styles.plNoPortrait} aria-hidden="true">{number}</span>}
          {appearance && <span className={`${styles.plNum} ${styles.num}`} aria-hidden="true">{number}</span>}
          {overall !== null && <span className={styles.plOvr} aria-label={`OVR ${overall}`}><b className={styles.num}>{overall}</b><small>OVR</small></span>}
          {crestNode && <span className={styles.plCrest}>{crestNode}</span>}
        </div>
        <figcaption className={styles.plName}>
          <strong>{name}</strong>
          {subtitle && <span>{subtitle}</span>}
        </figcaption>
        <span className={styles.gloss} aria-hidden="true" />
      </div>
    </figure>
  );
}

/* ───────────── textos e listas ───────────── */

export function BlockTitle({ id, children, note, as: Tag = "h3" }: { id?: string; children: ReactNode; note?: ReactNode; as?: "h2" | "h3" | "h4" }) {
  return <Tag id={id} className={styles.blockTitle}>{children}{note && <small>{note}</small>}</Tag>;
}

export type FichaRow = { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: "up" | "down" };

/** Ficha técnica impressa: rótulo, pontilhado de leitura e valor. */
export function Ficha({ rows, className }: { rows: FichaRow[]; className?: string }) {
  return (
    <dl className={`${styles.ficha} ${className ?? ""}`}>
      {rows.map((row, index) => (
        <div className={styles.fichaRow} key={index}>
          <dt>{row.label}</dt>
          <span className={styles.lead} aria-hidden="true" />
          <dd className={styles.num}>{row.value}{row.note && <em className={row.tone === "down" ? styles.down : styles.up}>{row.note}</em>}</dd>
        </div>
      ))}
    </dl>
  );
}

export type MeterSpec = { label: string; note?: string; value: number; color: string; delta?: number };

/** Medidores com retícula de impressão (moral, físico, prestígio, torcida…). */
export function Meters({ items, className }: { items: MeterSpec[]; className?: string }) {
  return (
    <div className={`${styles.meters} ${className ?? ""}`}>
      {items.map((item) => (
        <div className={styles.meter} key={item.label}>
          <span className={styles.meterLabel}>{item.label}{item.note && <i> ({item.note})</i>}</span>
          <b className={styles.num}>
            {Math.round(item.value)}
            {item.delta ? <span className={`${styles.delta} ${item.delta > 0 ? styles.up : styles.down}`}>{item.delta > 0 ? "+" : "−"}{Math.abs(item.delta)}</span> : null}
          </b>
          <span className={styles.bar} role="img" aria-label={`${item.label}: ${Math.round(item.value)} de 100`} style={{ "--v": Math.max(0, Math.min(100, item.value)), "--c": item.color } as CSSProperties}><i /></span>
        </div>
      ))}
    </div>
  );
}

/* ───────────── ações ───────────── */

/** Carimbo: o botão impresso do álbum. `pill` mostra um valor curto (chance, preço). */
export function Stamp({ children, pill, variant = "default", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pill?: ReactNode; variant?: "default" | "primary" | "danger" }) {
  return (
    <button type="button" className={`${styles.stamp} ${className ?? ""}`} data-variant={variant} {...props}>
      <strong>{children}</strong>
      {pill !== undefined && pill !== null && <em className={styles.num}>{pill}</em>}
    </button>
  );
}

/** Selo redondo e torto: a etiqueta do capítulo. */
export function Seal({ text, tone = "red" }: { text: string; tone?: "red" | "blue" | "ink" | "green" }) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : words;
  // A letra encolhe para a palavra mais longa caber inteira no círculo.
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const scale = longest <= 6 ? 1 : longest <= 8 ? .86 : longest <= 10 ? .74 : longest <= 13 ? .62 : .52;
  return (
    <span className={styles.seal} style={{ "--seal": `var(--${tone})`, "--seal-scale": scale } as CSSProperties} aria-label={`Etiqueta: ${text}`}>
      {lines.map((line) => <b key={line}>{line}</b>)}
    </span>
  );
}

/** Espaço de figurinha especial: a meta do treinador esperando ser colada. */
export function SpecialSlot({
  title,
  description,
  target,
  progress = 0,
  reward,
  penalty,
  labelledBy,
}: {
  title: string;
  description: string;
  target: number;
  progress?: number;
  reward: number;
  penalty: number;
  labelledBy?: string;
}) {
  const cells = Math.max(1, Math.min(10, target));
  const filled = target <= 10 ? Math.min(cells, progress) : Math.min(cells, Math.round((progress / target) * cells));
  return (
    <section className={styles.special} aria-labelledby={labelledBy}>
      <h3 id={labelledBy}>{title}</h3>
      <p>{description}</p>
      <div className={styles.slots} role="img" aria-label={`Progresso ${progress} de ${target}`}>
        {Array.from({ length: cells }, (_, index) => <i key={index} data-on={index < filled ? "" : undefined} />)}
      </div>
      <div className={styles.specialFoot}>
        <span className={styles.num}>{progress}/{target}</span>
        <b className={`${styles.up} ${styles.num}`}>+{reward} confiança</b>
        <b className={`${styles.down} ${styles.num}`}>falha −{penalty}</b>
      </div>
    </section>
  );
}

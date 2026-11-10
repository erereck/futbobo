"use client";

// Bobonline no álbum: a casca (mesa, páginas, folha solta), as figurinhas do time e o rodapé amarelo.
//
// O desenho vem do álbum da carreira por composição de CSS (paper.module.css). O JS de lá não entra
// (o /bobonline não importa nada de components/career): as tintas do time e o rodapé que sobe com a
// barra do navegador são cópias pequenas de album/inks.ts e album/useDockLift.ts.

import Link from "next/link";
import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from "react";
import FutboboIcon from "../../components/FutboboIcon";
import { paintStickerBust, useSticker3d } from "../../botao/three/sticker-portrait";
import type { PlayerAppearance } from "../../player-appearance";
import BobCrest from "../teams/BobCrest";
import { useViewPref } from "../view-pref";
import type { BobTeam } from "../types";
import paper from "./paper.module.css";

export { paper };

/* ───────────── tintas (cópia de album/inks.ts) ───────────── */

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return [11, 92, 173];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(hex: string, target: Rgb, amount: number): string {
  const source = parseHex(hex);
  return `#${source.map((channel, index) => Math.round(Math.min(255, Math.max(0, channel + (target[index] - channel) * amount))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * As cores do time como tinta de impressão: a faixa usa a mais escura das duas (camisa branca vira
 * faixa na secundária), a listra a outra e o texto sai do contraste. Vale para a figurinha grande
 * (--club…) e para a de clube (--o-…).
 */
export function teamInks(primary: string, secondary: string): CSSProperties {
  const band = luminance(primary) > 0.6 && luminance(secondary) < 0.6 ? secondary : primary;
  const stripe = band === primary ? secondary : primary;
  const bandLight = luminance(band) > 0.45;
  const deep = mix(band, [0, 0, 0], 0.28);
  const line = luminance(stripe) > 0.85 && !bandLight ? "#ffffff" : stripe;
  return {
    "--club": band,
    "--club-deep": deep,
    "--club-soft": mix(band, [255, 255, 255], 0.18),
    "--club-2": line,
    "--club-ink": bandLight ? "#161616" : "#ffffff",
    "--o-club": band,
    "--o-deep": deep,
    "--o-soft": mix(band, [255, 255, 255], 0.16),
    "--o-stripe": line,
  } as CSSProperties;
}

/** A tinta do Bobonline no álbum (a linha dele no índice do menu): azul com listra vermelha. */
export const BOB_INK = teamInks("#0b5cad", "#e0262f");

/* ───────────── rodapé que acompanha a área visível (cópia de album/useDockLift.ts) ───────────── */

/**
 * Celular: o rodapé amarelo (e as folhas) ficam presos em `bottom: var(--dock-lift)`. Depois da
 * partida (tela sem rolagem) alguns Android deixam a área de layout maior que a visível; a diferença
 * vira `--dock-lift` e o rodapé sobe até o que se vê. Com o teclado aberto, fica logo acima dele.
 */
export function useDockLift() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hidden = viewport.scale > 1.01 ? 0 : window.innerHeight - viewport.height - viewport.offsetTop;
        const lift = Math.round(Math.max(0, Math.min(hidden, window.innerHeight * 0.6)));
        root.style.setProperty("--dock-lift", `${lift}px`);
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      root.style.removeProperty("--dock-lift");
    };
  }, []);
}

/* ───────────── casca ───────────── */

/** O álbum aberto: duas páginas no desktop, uma página que rola no celular. */
export function Spread({ className, children, ...props }: { className: string; children: ReactNode } & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <section className={`${paper.album} ${className}`} {...props}>
      <div className={paper.cover} aria-hidden="true" />
      <div className={paper.spread}>{children}</div>
    </section>
  );
}

export function Page({ side, label, className, children }: { side: "left" | "right"; label: string; className?: string; children: ReactNode }) {
  return (
    <section className={`${paper.page} bob-page ${className ?? ""}`} data-side={side} aria-label={label}>
      {children}
    </section>
  );
}

/** Folha solta sobre a mesa: as telas de uma coluna (outra aba, erro). */
export function PaperScreen({ className, children, ...props }: { className: string; children: ReactNode } & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <section className={`${paper.paper} bob-paper-screen ${className}`} {...props}>
      <span className={paper.paperTape} data-side="left" aria-hidden="true" />
      <span className={paper.paperTape} data-side="right" aria-hidden="true" />
      {children}
    </section>
  );
}

const BAND_INK: Record<"blue" | "red" | "ink" | "green" | "mustard" | "club", [string, string, string]> = {
  blue: ["var(--blue)", "var(--red)", "#fff"],
  red: ["var(--red)", "var(--ink)", "#fff"],
  ink: ["var(--ink)", "var(--yellow)", "#fff"],
  green: ["var(--green)", "var(--yellow)", "#fff"],
  mustard: ["var(--mustard)", "var(--ink)", "#fff"],
  club: ["var(--club)", "var(--club-2)", "var(--club-ink)"],
};

/** Faixa de tinta no topo da página. `level` 1 quando ela é o título da tela. */
export function Band({ ink, title, titleId, subtitle, crest, aside, level = 1, className, style }: {
  ink: keyof typeof BAND_INK;
  title: ReactNode;
  titleId?: string;
  subtitle?: ReactNode;
  crest?: ReactNode;
  aside?: ReactNode;
  level?: 1 | 2;
  className?: string;
  style?: CSSProperties;
}) {
  const [bg, stripe, color] = BAND_INK[ink];
  const Title = level === 1 ? "h1" : "h2";
  return (
    <header className={`${paper.band} bob-band ${className ?? ""}`} data-plain={crest ? undefined : ""} style={{ ...style, "--band-bg": bg, "--band-stripe": stripe, "--band-ink": color } as CSSProperties}>
      {crest && <span className={paper.bandCrest}>{crest}</span>}
      <div className={paper.bandName}>
        <Title id={titleId}>{title}</Title>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}

export type FichaRow = { label: ReactNode; value: ReactNode };

/** Ficha técnica impressa: rótulo, pontilhado de leitura e valor. */
export function Ficha({ rows, className }: { rows: FichaRow[]; className?: string }) {
  return (
    <dl className={`${paper.ficha} bob-ficha ${className ?? ""}`}>
      {rows.map((row, index) => (
        <div className={paper.fichaRow} key={index}>
          <dt>{row.label}</dt>
          <span className={paper.lead} aria-hidden="true" />
          <dd className={paper.num}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Voltar impresso (seta desenhada, sem "←" no texto). */
export function BackButton({ onClick, label = "Voltar" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className={`bob-back ${paper.back}`} onClick={onClick}>
      <FutboboIcon name="arrow-left" /> {label}
    </button>
  );
}

/** Volta ao menu do Futbobo (a página inteira, a sala segue viva fora dela). */
export function MenuLink() {
  return (
    <Link className={`bob-back ${paper.back}`} href="/">
      <FutboboIcon name="arrow-left" /> Menu
    </Link>
  );
}

/** Pé da página: o caminho para o menu do Futbobo (a sala segue viva fora da página). */
export function Colophon({ children, menu = true }: { children?: ReactNode; menu?: boolean }) {
  return (
    <footer className="bob-colophon">
      {children}
      {menu && <Link className="bob-colophon-menu" href="/">Menu do Futbobo</Link>}
    </footer>
  );
}

/** Ação principal: bloco na página no desktop, rodapé amarelo preso no celular. */
export function Dock({ children, className, double = false }: { children: ReactNode; className?: string; double?: boolean }) {
  return <div className={`bob-dock ${className ?? ""}`} data-double={double ? "" : undefined}>{children}</div>;
}

/** Reserva o espaço do rodapé amarelo no fim da página do celular (`double`: duas fileiras de botões). */
export function DockSpacer({ double = false }: { double?: boolean }) {
  return <div className="bob-dock-spacer" data-double={double ? "" : undefined} aria-hidden="true" />;
}

/* ───────────── figurinhas ───────────── */

type CrestTeam = Pick<BobTeam, "name" | "abbr" | "primary" | "secondary" | "crest">;

/** A figurinha grande do time: o escudo no quadro com as cores dele, o nome embaixo. */
export function TeamSticker({ team, subtitle, tilt = "-2.2deg", cpu = false, className }: {
  team: CrestTeam;
  subtitle?: ReactNode;
  tilt?: string;
  cpu?: boolean;
  className?: string;
}) {
  return (
    <figure className={`${paper.sticker} bob-team-sticker ${className ?? ""}`} style={{ "--tilt": tilt, ...teamInks(team.primary, team.secondary) } as CSSProperties}>
      <div className={paper.face}>
        <div className={`${paper.plArt} bob-team-sticker-art`}>
          <BobCrest team={team} size={120} cpu={cpu} />
        </div>
        <figcaption className={paper.plName}>
          <strong>{team.name}</strong>
          {subtitle && <span>{subtitle}</span>}
        </figcaption>
        <span className={paper.gloss} aria-hidden="true" />
      </div>
    </figure>
  );
}

/** Figurinha de clube: faixa nas cores do time, escudo no disco branco, nome e uma linha. Sem time: papel cinza. */
export function ClubCard({ team, title, note, tilt, cpu = false, className, children }: {
  team: CrestTeam | null;
  title?: ReactNode;
  note?: ReactNode;
  tilt?: string;
  cpu?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const inks = team ? teamInks(team.primary, team.secondary) : teamInks("#9a9a90", "#e4e4dc");
  return (
    <span className={`${paper.clubSticker} bob-club-card ${className ?? ""}`} style={{ "--r": tilt ?? "0deg", ...inks } as CSSProperties}>
      <span className={paper.clubBand} aria-hidden="true">
        <span className={paper.clubCrest}>{team ? <BobCrest team={team} size={40} cpu={cpu} /> : <span className="bob-crest-blank" />}</span>
      </span>
      <strong>{title ?? team?.name}</strong>
      {note && <small>{note}</small>}
      {children}
    </span>
  );
}

/** Busto do jogador recortado, no traço da mesa (como o StickerBust do álbum: 3D quando o Bobonline está no 3D). */
export function PlayerBust({ appearance, primary, secondary, className }: { appearance: PlayerAppearance; primary: string; secondary: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const use3d = useSticker3d(useViewPref() === "3d");
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return paintStickerBust(canvas, { appearance, primary, secondary }, use3d);
  }, [appearance, primary, secondary, use3d]);
  return <canvas ref={canvasRef} className={className} width={240} height={240} aria-hidden="true" />;
}

/** Selo redondo e torto (Apito final, Campeão): a letra encolhe para a palavra mais longa caber. */
export function Seal({ text, tone = "red" }: { text: string; tone?: "red" | "blue" | "ink" | "green" }) {
  const words = text.split(/\s+/).filter(Boolean);
  const longest = Math.max(...words.map((word) => word.length), 1);
  const scale = longest <= 6 ? 1 : longest <= 8 ? 0.86 : longest <= 10 ? 0.74 : 0.62;
  return (
    <span className={`${paper.seal} bob-seal`} style={{ "--seal": `var(--${tone})`, "--seal-scale": scale } as CSSProperties} aria-label={text}>
      {words.map((word) => <b key={word} aria-hidden="true">{word}</b>)}
    </span>
  );
}

/* ───────────── folha solta ───────────── */

export type SheetInk = "blue" | "red" | "ink" | "green" | "yellow" | "mustard";

/**
 * O papel da folha solta do álbum (fita, faixa de tinta, corpo que rola, rodapé amarelo no celular).
 * Quem usa cuida do portal, do foco e do Esc.
 */
export function SheetPaper({ ink, titleId, labelledBy, kicker, title, role = "dialog", className, size, sheetRef, onClose, closeLabel = "Fechar", onKeyDown, footer, children }: {
  ink: SheetInk;
  titleId: string;
  labelledBy?: string;
  kicker?: ReactNode;
  title: ReactNode;
  role?: "dialog" | "alertdialog";
  className?: string;
  size?: "narrow" | "wide";
  sheetRef?: Ref<HTMLElement>;
  /** Toque fora (no fundo) fecha. */
  onClose: () => void;
  /** Com rótulo: mostra o "×" da faixa. */
  closeLabel?: string | null;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`bob-sheet-backdrop ${paper.sheetBackdrop}`} role="presentation" onMouseDown={onClose} onKeyDown={onKeyDown}>
      <section
        ref={sheetRef}
        className={`bob-sheet ${paper.sheet} ${className ?? ""}`}
        data-ink={ink}
        data-size={size ?? "narrow"}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={paper.tape} data-side="left" aria-hidden="true" />
        <span className={paper.tape} data-side="right" aria-hidden="true" />
        <header className={paper.sheetBand}>
          <div className={paper.bandText}>
            {kicker && <p className={paper.kicker}>{kicker}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          {closeLabel && (
            <button type="button" className={paper.close} aria-label={closeLabel} onClick={onClose}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          )}
        </header>
        <div className={`${paper.sheetBody} bob-sheet-body`}>{children}</div>
        {footer && <footer className={`${paper.sheetFooter} bob-sheet-footer`}>{footer}</footer>}
      </section>
    </div>
  );
}

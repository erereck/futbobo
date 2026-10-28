"use client";

// Camada de TV por cima do 3D: placar de transmissão, objetivo, bolas
// restantes, passes, dica do traço, leitura do plano, faixas de resultado,
// tarja de replay. Tudo aqui é desenho: quem decide o que mostrar é o
// `LevelPlayer`, que lê o estado da simulação.

import { memo } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { KickKind, Outcome, StarRule } from "./types";
import type { TeamInfo } from "./storage";
import styles from "./hud.module.css";

// ------------------------------------------------------------ textos

export function describeRule(rule: StarRule): string {
  switch (rule.kind) {
    case "firstAttempt":
      return "Marcar na primeira bola";
    case "curve":
      return `Gol com curva de ${rule.min.toLocaleString("pt-BR")} m ou mais`;
    case "topCorner":
      return "Gol no ângulo";
    case "header":
      return "Gol de cabeça";
    case "volley":
      return "Gol de voleio";
    case "firstTime":
      return "Finalizar de primeira";
    case "outsideBox":
      return "Gol de fora da área";
    case "maxPasses":
      return rule.max === 0 ? "Sem passes: direto ao gol" : `No máximo ${rule.max} ${rule.max === 1 ? "passe" : "passes"}`;
    case "minPasses":
      return `Pelo menos ${rule.min} ${rule.min === 1 ? "passe" : "passes"} antes do gol`;
  }
}

const KICK_LABELS: Record<KickKind, string> = {
  ground: "Passe rasteiro",
  driven: "Passe forte",
  lofted: "Lançamento",
  chip: "Cavadinha",
  shot: "Chute",
  header: "Cabeceio",
  volley: "Voleio",
};

export type PlanSummary = {
  kind: KickKind;
  shot: boolean;
  curve: number;
  /** 0..1 arredondado (só muda o chip quando a leitura muda de fato). */
  accuracy: number;
  receiver: string | null;
  /** Bola alta na área, na cabeça do companheiro. */
  cross?: boolean;
  /** Um zagueiro alcança a bola no caminho. */
  danger?: "cut" | null;
};

export function planTitle(plan: PlanSummary): string {
  if (plan.shot) {
    if (plan.kind === "chip") return "Cavadinha no gol";
    if (plan.kind === "header" || plan.kind === "volley") return KICK_LABELS[plan.kind];
    return Math.abs(plan.curve) >= 1.2 ? "Chute colocado" : "Chute";
  }
  if (plan.receiver) return `${plan.cross ? "Cruzamento" : KICK_LABELS[plan.kind]} · ${plan.receiver}`;
  return plan.kind === "lofted" ? "Bola no espaço (alta)" : "Bola no espaço";
}

type BannerTone = "goal" | "save" | "post" | "miss" | "cut";

export function bannerFor(outcome: Outcome): { title: string; tone: BannerTone } {
  switch (outcome.result) {
    case "goal":
      // Entrou sem cumprir o requisito da fase: anulado, sem festa.
      return outcome.stars > 0 ? { title: "GOLAÇO!", tone: "goal" } : { title: "ANULADO", tone: "cut" };
    case "saved":
      return { title: "DEFENDEU!", tone: "save" };
    case "post":
      return { title: "NA TRAVE!", tone: "post" };
    case "miss":
      return { title: "PRA FORA!", tone: "miss" };
    case "intercepted":
      return { title: "CORTOU!", tone: "cut" };
  }
}

const normalized = (text: string) => text.normalize("NFD").replace(/[̀-ͯ!.¡]/g, "").trim().toLowerCase();

/** Linha de baixo da faixa: o rótulo da simulação (se diz algo além do título) e a primeira nota. */
export function bannerSubtitle(outcome: Outcome, title: string): string[] {
  const lines: string[] = [];
  if (outcome.label && normalized(outcome.label) !== normalized(title)) lines.push(outcome.label);
  for (const note of outcome.notes) {
    if (lines.length >= 2) break;
    if (!lines.includes(note)) lines.push(note);
  }
  return lines;
}

/** "89'" vira um relógio de transmissão que anda com a jogada ("89:07"). */
export function formatClock(clock: string, seconds: number): string {
  const match = /^(\d{1,3})'?$/.exec(clock.trim());
  if (!match) return clock;
  const total = Number(match[1]) * 60 + Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------ ícones

export function BallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#f7f7f2" stroke="#0b0f14" strokeWidth="1.2" />
      <path d="M12 7.2l3.6 2.6-1.4 4.2H9.8L8.4 9.8z" fill="#0b0f14" />
      <path d="M12 7.2V2.6M15.6 9.8l4.3-1.6M14.2 14l2.7 3.8M9.8 14l-2.7 3.8M8.4 9.8L4.1 8.2" stroke="#0b0f14" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function StarIcon({ lit, className, style }: { lit: boolean; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true" data-lit={lit ? "1" : "0"}>
      <path
        d="M12 2.4l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
        fill={lit ? "url(#sbStarGold)" : "rgba(255,255,255,0.08)"}
        stroke={lit ? "#fff3b0" : "rgba(255,255,255,0.32)"}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Gradiente compartilhado das estrelas (um por página basta). */
export function StarDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sbStarGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.45" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#e08a00" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function IconButton({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return (
    <button type="button" className={styles.iconButton} aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

export const PauseGlyph = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.4" height="12" rx="1" fill="currentColor" /><rect x="11.6" y="4" width="3.4" height="12" rx="1" fill="currentColor" /></svg>
);

export const SoundGlyph = ({ muted }: { muted: boolean }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" />
    {muted
      ? <path d="M13 7.5l5 5M18 7.5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      : <path d="M13 7a4 4 0 010 6M15.4 4.8a7 7 0 010 10.4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
  </svg>
);

// ------------------------------------------------------------ placar

export const ScoreBug = memo(function ScoreBug({ home, away, homeScore, awayScore, clock, running, bump }: {
  home: TeamInfo;
  away: TeamInfo;
  homeScore: number;
  awayScore: number;
  clock: string;
  /** Relógio andando (fora do "tempo congelado"). */
  running: boolean;
  /** Muda quando o placar muda: refaz a animação do número. */
  bump: number;
}) {
  return (
    <div className={styles.scoreBug} role="group" aria-label={`${home.name} ${homeScore} x ${awayScore} ${away.name}, ${clock}`}>
      <span className={styles.bugBrand} aria-hidden="true">SB</span>
      <span className={styles.bugTeam}>
        <i style={{ background: `linear-gradient(180deg, ${home.primary} 0 60%, ${home.secondary} 60%)` }} />
        {home.abbr}
      </span>
      <span className={styles.bugScore}>
        <b key={`h${bump}`} className={bump ? styles.bugBump : undefined}>{homeScore}</b>
        <em>-</em>
        <b>{awayScore}</b>
      </span>
      <span className={styles.bugTeam}>
        {away.abbr}
        <i style={{ background: `linear-gradient(180deg, ${away.primary} 0 60%, ${away.secondary} 60%)` }} />
      </span>
      <span className={`${styles.bugClock} ${running ? styles.bugClockRunning : ""}`}>{clock}</span>
    </div>
  );
});

export const ObjectiveChip = memo(function ObjectiveChip({ index, name, objective }: { index: number; name: string; objective: string }) {
  return (
    <div className={styles.objective}>
      <span className={styles.objectiveIndex}>{String(index + 1).padStart(2, "0")}</span>
      <span className={styles.objectiveText}>
        <strong>{name}</strong>
        <small>{objective}</small>
      </span>
    </div>
  );
});

export const AttemptBalls = memo(function AttemptBalls({ total, left }: { total: number; left: number }) {
  return (
    <div className={styles.attempts} aria-label={`${left} de ${total} bolas restantes`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={index < left ? styles.attemptLive : styles.attemptSpent}>
          <BallIcon />
        </span>
      ))}
    </div>
  );
});

export const PassCounter = memo(function PassCounter({ passes }: { passes: number }) {
  if (passes <= 0) return null;
  return (
    <div className={styles.passes} key={passes} aria-live="polite">
      <b>{passes}</b>
      <span>{passes === 1 ? "PASSE" : "PASSES"}</span>
    </div>
  );
});

// ------------------------------------------------------------ traço

export const PlanChip = memo(function PlanChip({ plan }: { plan: PlanSummary | null }) {
  if (!plan) {
    return (
      <div className={`${styles.planChip} ${styles.planChipEmpty}`}>
        <span>Continue o traço até um companheiro ou o gol</span>
      </div>
    );
  }
  // Zagueiro no caminho manda mais que a precisão: "Preciso" para um passe que vai ser cortado mentia.
  const grade = plan.danger === "cut" ? (plan.shot ? "Bloqueável" : "Cortável") : plan.accuracy >= 0.78 ? "Preciso" : plan.accuracy >= 0.55 ? "Arriscado" : "Difícil";
  const tone = plan.danger === "cut" ? styles.gradeBad : plan.accuracy >= 0.78 ? styles.gradeGood : plan.accuracy >= 0.55 ? styles.gradeMid : styles.gradeBad;
  return (
    <div className={`${styles.planChip} ${plan.shot ? styles.planShot : ""} ${plan.danger === "cut" ? styles.planDanger : ""}`}>
      <span className={styles.planKind}>{plan.shot ? "CHUTE" : "PASSE"}</span>
      <strong>{planTitle(plan)}</strong>
      <span className={`${styles.planMeter} ${tone}`} aria-label={`Precisão: ${grade}`}>
        <i style={{ transform: `scaleX(${Math.max(0.06, plan.accuracy)})` }} />
      </span>
      <small className={tone}>{grade}</small>
    </div>
  );
});

export function AimHint({ text, tone, tag }: { text: string; tone: "info" | "error"; tag?: string }) {
  return (
    <div className={`${styles.aimHint} ${tone === "error" ? styles.aimHintError : ""}`} role={tone === "error" ? "alert" : undefined}>
      {tag && tone === "info" && <b className={styles.aimHintTag}>{tag}</b>}
      {tone === "info" && !tag && (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.aimHintIcon}>
          <path d="M5 19c3-1 4-6 7-8s6-1 7-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="3 3.4" />
          <circle cx="5" cy="19" r="2.6" fill="currentColor" />
        </svg>
      )}
      <span>{text}</span>
    </div>
  );
}

// ------------------------------------------------------------ resultado

export const OutcomeBanner = memo(function OutcomeBanner({ outcome }: { outcome: Outcome }) {
  const { title, tone } = bannerFor(outcome);
  const lines = bannerSubtitle(outcome, title);
  return (
    <div className={`${styles.banner} ${styles[`banner_${tone}`]}`} role="status" aria-live="assertive">
      <div className={styles.bannerStripe} aria-hidden="true" />
      <strong className={styles.bannerTitle} aria-label={title}>
        {Array.from(title).map((letter, index) => (
          <span key={index} aria-hidden="true" style={{ "--i": index } as CSSProperties}>{letter}</span>
        ))}
      </strong>
      {lines.length > 0 && (
        <div className={styles.bannerLines}>
          {lines.map((line) => <span key={line}>{line}</span>)}
        </div>
      )}
      {outcome.result === "goal" && outcome.stars > 0 && (
        <div className={styles.bannerStars} aria-label={`${outcome.stars} estrelas`}>
          {[0, 1, 2].map((index) => (
            <StarIcon key={index} lit={index < outcome.stars} className={styles.bannerStar} style={{ "--i": index } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
});

export function ReplayTag({ onSkip, stats }: { onSkip: () => void; stats?: string | null }) {
  return (
    <div className={styles.replay}>
      <span className={styles.replayTag}><i aria-hidden="true" />REPLAY</span>
      {stats && <span className={styles.replayStats}>{stats}</span>}
      <button type="button" className={styles.skipButton} onClick={onSkip}>
        Pular
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l7 6-7 6zM11 4l7 6-7 6z" fill="currentColor" /></svg>
      </button>
    </div>
  );
}

export function IntroCard({ index, name, situation, objective, rules, onSkip }: {
  index: number;
  name: string;
  situation: string;
  objective: string;
  /** Regras da 2ª e da 3ª estrela. */
  rules: [string, string];
  onSkip: () => void;
}) {
  return (
    <div className={styles.intro}>
      <div className={styles.introCard}>
        <span className={styles.introKicker}>FASE {String(index + 1).padStart(2, "0")}</span>
        <strong>{name}</strong>
        <small>{situation}</small>
        {/* O objetivo e as estrelas antes da primeira bola (só apareciam no fim). */}
        <ul className={styles.introRules}>
          <li><StarIcon lit className={styles.introStar} />{objective}</li>
          <li><StarIcon lit={false} className={styles.introStar} />{rules[0]}</li>
          <li><StarIcon lit={false} className={styles.introStar} />{rules[1]}</li>
        </ul>
      </div>
      <button type="button" className={styles.skipButton} onClick={onSkip}>
        Pular
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l7 6-7 6zM11 4l7 6-7 6z" fill="currentColor" /></svg>
      </button>
    </div>
  );
}

export function Toast({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className={styles.toast} role="status">
      <strong>{text}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/** Papel picado do gol: posições sorteadas no evento (fora do render). */
export type ConfettiPiece = { x: number; delay: number; duration: number; drift: number; spin: number; color: string; size: number };

export function Confetti({ pieces }: { pieces: ConfettiPiece[] }) {
  return (
    <div className={styles.confetti} aria-hidden="true">
      {pieces.map((piece, index) => (
        <i
          key={index}
          style={{
            left: `${piece.x}%`,
            width: piece.size,
            height: piece.size * 0.45,
            background: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            "--drift": `${piece.drift}px`,
            "--spin": `${piece.spin}deg`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

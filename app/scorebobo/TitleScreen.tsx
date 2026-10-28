"use client";

// Abertura do Scorebobo: logotipo, a prancheta com a jogada em loop, as fases
// (com estrelas e cadeados), o seu jogador e os ajustes. Nada de 3D aqui —
// o three.js só baixa quando uma fase começa.

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { drawPlayerBust } from "../player-appearance";
import { playUiSound, primeScoreboboAudio } from "./audio";
import { StarDefs, StarIcon } from "./Hud";
import { LevelMap, TitleBackdrop } from "./TitleArt";
import { levelUnlocked, type ScoreboboProfile, type ScoreboboProgress, type TeamInfo } from "./storage";
import type { ScoreLevel } from "./types";
import styles from "./scorebobo.module.css";

const LOGO = "SCOREBOBO";
const SKY_LABEL: Record<ScoreLevel["sky"], string> = { day: "Tarde", sunset: "Pôr do sol", night: "Noite" };

function HeroBust({ profile, size }: { profile: ScoreboboProfile; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const density = Math.min(2.5, window.devicePixelRatio || 1);
    const pixels = Math.round(size * density);
    canvas.width = pixels;
    canvas.height = pixels;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, size / 2 * density, size / 2 * density);
    drawPlayerBust(context, profile.appearance, profile.club.primary, profile.club.secondary, size / 2 - 0.5);
  }, [profile, size]);
  return <canvas ref={ref} className={styles.bust} style={{ width: size, height: size }} aria-hidden="true" />;
}

function Toggle({ label, note, on, onChange, disabled }: { label: string; note?: string; on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className={`${styles.toggle} ${on ? styles.toggleOn : ""}`} onClick={onChange} title={note}>
      <span className={styles.toggleTrack} aria-hidden="true"><i /></span>
      <span className={styles.toggleText}>
        {label}
        {note && <small>{note}</small>}
      </span>
    </button>
  );
}

const LevelCard = memo(function LevelCard({ level, index, stars, locked, home, away, onPlay, onLocked, disabled }: {
  level: ScoreLevel;
  index: number;
  stars: number;
  locked: boolean;
  home: string;
  away: string;
  onPlay: (index: number) => void;
  onLocked: (index: number) => void;
  disabled: boolean;
}) {
  const [nudge, setNudge] = useState(0);
  const click = () => {
    primeScoreboboAudio();
    if (locked) {
      playUiSound("error");
      setNudge((value) => value + 1);
      onLocked(index);
      return;
    }
    onPlay(index);
  };
  // Passou o mouse/dedo numa fase aberta: a cena 3D já começa a baixar.
  const warm = () => {
    if (!locked && !disabled) void import("./three/view").catch(() => undefined);
  };
  return (
    <button
      type="button"
      className={`${styles.card} ${locked ? styles.cardLocked : ""} ${stars === 3 ? styles.cardPerfect : ""}`}
      style={{ "--i": index } as CSSProperties}
      onClick={click}
      onPointerEnter={warm}
      onFocus={warm}
      disabled={disabled}
      aria-label={`Fase ${index + 1}: ${level.name}. ${level.situation}. ${locked ? "Bloqueada" : `${stars} de 3 estrelas`}`}
    >
      <span className={styles.cardArt}>
        <LevelMap level={level} home={home} away={away} locked={locked} />
        <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
        <span className={styles.cardSky} data-sky={level.sky}>{SKY_LABEL[level.sky]} · {level.clock}</span>
        {locked && (
          <span key={nudge} className={`${styles.cardLock} ${nudge ? styles.cardLockNudge : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7.5a5 5 0 0110 0V10M5.5 10h13v10h-13z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="15" r="1.6" fill="currentColor" /></svg>
          </span>
        )}
      </span>
      <span className={styles.cardBody}>
        <strong>{level.name}</strong>
        <small>{level.situation}</small>
        <span className={styles.cardMeta}>
          <span className={styles.cardStars}>
            {[0, 1, 2].map((star) => <StarIcon key={star} lit={star < stars} className={styles.cardStar} />)}
          </span>
          <span className={styles.cardBalls}>{level.attempts} {level.attempts === 1 ? "bola" : "bolas"}</span>
        </span>
      </span>
      {!locked && (
        <span className={styles.cardPlay} aria-hidden="true">
          <svg viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
        </span>
      )}
    </button>
  );
});

export type TitleScreenProps = {
  levels: ReadonlyArray<ScoreLevel>;
  progress: ScoreboboProgress;
  profile: ScoreboboProfile | null;
  away: TeamInfo;
  hasWebgl: boolean;
  performance: boolean;
  muted: boolean;
  reducedMotion: boolean;
  starting: boolean;
  /** Uma fase está por cima: a abertura para de pintar, mas guarda a rolagem. */
  covered: boolean;
  onPlay: (index: number) => void;
  onTogglePerformance: () => void;
  onToggleMute: () => void;
  onToggleUnlockAll: () => void;
};

export function TitleScreen({ levels, progress, profile, away, hasWebgl, performance: performanceMode, muted, reducedMotion, starting, covered, onPlay, onTogglePerformance, onToggleMute, onToggleUnlockAll }: TitleScreenProps) {
  const [lockedNote, setLockedNote] = useState<{ index: number; key: number } | null>(null);
  const totalStars = levels.reduce((sum, level) => sum + (progress.stars[level.id] ?? 0), 0);
  const home = profile?.club ?? null;
  const homeColor = home?.primary ?? "#f7d117";

  useEffect(() => {
    if (!lockedNote) return;
    const timer = window.setTimeout(() => setLockedNote((current) => (current?.key === lockedNote.key ? null : current)), 2200);
    return () => window.clearTimeout(timer);
  }, [lockedNote]);

  const onLocked = useCallback((index: number) => setLockedNote((current) => ({ index, key: (current?.key ?? 0) + 1 })), []);

  const click = (action: () => void, sound: "toggle" | "click" = "toggle") => () => {
    primeScoreboboAudio();
    action();
    playUiSound(sound);
  };

  return (
    <main className={`${styles.page} ${covered ? styles.pageCovered : ""}`} aria-hidden={covered || undefined} inert={covered || undefined}>
      <StarDefs />
      <TitleBackdrop home={homeColor} away={away.primary} still={reducedMotion} />

      <header className={styles.hero}>
        <span className={styles.kicker}><i aria-hidden="true" />MODO 3D · TREINO</span>
        <h1 className={styles.logo} aria-label="Scorebobo">
          {Array.from(LOGO).map((letter, index) => (
            <span key={index} aria-hidden="true" className={index >= 5 ? styles.logoBobo : undefined} style={{ "--i": index } as CSSProperties}>{letter}</span>
          ))}
        </h1>
        <svg className={styles.swoosh} viewBox="0 0 520 60" aria-hidden="true">
          <path d="M14 44C120 52 210 14 300 22s150 30 196 4" pathLength={1} className={styles.swooshGlow} />
          <path d="M14 44C120 52 210 14 300 22s150 30 196 4" pathLength={1} className={styles.swooshLine} />
          <g className={styles.swooshBall}>
            <circle cx="496" cy="26" r="9" />
            <path d="M496 20.5l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" />
          </g>
        </svg>
        <p className={styles.tagline}>Desenhe a jogada</p>
      </header>

      {!hasWebgl && (
        <div className={styles.noWebgl} role="alert">
          <strong>Este aparelho não tem 3D (WebGL)</strong>
          <span>O Scorebobo existe só no Modo 3D. Ative a aceleração de hardware do navegador ou abra o Futbobo em outro aparelho.</span>
        </div>
      )}

      <section className={styles.levels} aria-labelledby="sb-levels-title">
        <ol className={styles.steps} aria-label="Como jogar">
          <li><b>1</b><span><strong>O tempo congela</strong>Encoste o dedo ou o mouse na bola</span></li>
          <li><b>2</b><span><strong>Desenhe a jogada</strong>Até um companheiro, no espaço ou no gol</span></li>
          <li><b>3</b><span><strong>Solte</strong>A bola vai perto do traço — não igual</span></li>
        </ol>
        <div className={styles.levelsHead}>
          <h2 id="sb-levels-title">Fases</h2>
          <span className={styles.totalStars}>
            <StarIcon lit className={styles.totalStar} />
            {totalStars}<small>/{levels.length * 3}</small>
          </span>
        </div>
        <div className={styles.grid}>
          {levels.map((level, index) => (
            <LevelCard
              key={level.id}
              level={level}
              index={index}
              stars={progress.stars[level.id] ?? 0}
              locked={!levelUnlocked(levels, index, progress)}
              home={homeColor}
              away={away.primary}
              onPlay={onPlay}
              onLocked={onLocked}
              disabled={!hasWebgl || starting}
            />
          ))}
        </div>
        <p className={styles.lockedNote} aria-live="polite">
          {lockedNote ? `Ganhe ao menos 1 estrela na fase ${lockedNote.index} para liberar esta.` : " "}
        </p>
      </section>

      <footer className={styles.footer}>
        <div className={styles.player}>
          {profile ? <HeroBust profile={profile} size={52} /> : <span className={styles.bustSkeleton} />}
          <span className={styles.playerText}>
            <small>{profile?.fromSave ? "Jogando com o seu craque" : "Jogando como"}</small>
            <strong>{profile ? `${profile.name} · ${profile.number}` : "Procurando o seu save…"}</strong>
            {home && (
              <span className={styles.playerClub}>
                <i style={{ background: `linear-gradient(90deg, ${home.primary} 0 55%, ${home.secondary} 55%)` }} />
                {home.name} <em>x</em> {away.name}
              </span>
            )}
          </span>
        </div>
        <div className={styles.settings}>
          <Toggle label="Modo desempenho" note="Menos sombra e resolução" on={performanceMode} onChange={click(onTogglePerformance)} disabled={!hasWebgl} />
          <Toggle label="Som" on={!muted} onChange={click(onToggleMute)} />
          <Toggle label="Liberar todas (demo)" on={progress.unlockAll} onChange={click(onToggleUnlockAll)} />
        </div>
        <Link href="/" className={styles.back}>Voltar ao Futbobo</Link>
      </footer>
    </main>
  );
}

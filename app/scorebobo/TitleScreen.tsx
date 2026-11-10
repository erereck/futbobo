"use client";

// Abertura do Scorebobo, no papel do álbum: uma folha dupla sobre a mesa. À
// esquerda, o pôster da prancheta (a jogada em loop), como jogar, o seu
// jogador e os ajustes; à direita, as fases como figurinhas (as trancadas são
// o espaço vazio esperando a figurinha). Nada de 3D aqui — o three.js, a fase
// e a cama da torcida só chegam no tempo ocioso do menu.

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import albumCss from "../components/career/album/album.module.css";
import { clubInks } from "../components/career/album/inks";
import { drawPlayerBust } from "../player-appearance";
import { playUiSound, primeScoreboboAudio, warmScoreboboAudio } from "./audio";
import { StarDefs, StarIcon } from "./Hud";
import { LevelMap, TitleBackdrop } from "./TitleArt";
import { levelUnlocked, readProgress, type ScoreboboProfile, type ScoreboboProgress, type TeamInfo } from "./storage";
import type { ScoreLevel } from "./types";
import styles from "./scorebobo.module.css";

const SKY_LABEL: Record<ScoreLevel["sky"], string> = { day: "Tarde", sunset: "Pôr do sol", night: "Noite" };

// O progresso mora no localStorage: o servidor (e o hidrato) desenham sem ele.
const noopSubscribe = () => () => undefined;
const clientTrue = () => true;
const serverFalse = () => false;

/** O busto recortado do seu jogador, colado na figurinha pequena (as cores do clube ficam no fundo dela). */
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
    context.setTransform(density, 0, 0, density, size / 2 * density, size * 0.47 * density);
    drawPlayerBust(context, profile.appearance, profile.club.primary, profile.club.secondary, size * 0.43, 0, { cutout: true });
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

const LevelCard = memo(function LevelCard({ level, index, stars, locked, home, away, onPick, disabled }: {
  level: ScoreLevel;
  index: number;
  stars: number;
  /** null: o progresso do aparelho ainda não chegou (servidor e hidrato): nem cadeado, nem "jogar". */
  locked: boolean | null;
  home: string;
  away: string;
  /** Abre a fase se ela estiver liberada agora; devolve se abriu. */
  onPick: (index: number) => boolean;
  disabled: boolean;
}) {
  const [nudge, setNudge] = useState(0);
  const click = () => {
    primeScoreboboAudio();
    if (onPick(index)) return;
    playUiSound("error");
    setNudge((value) => value + 1);
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
      aria-label={`Fase ${index + 1}: ${level.name}. ${level.situation}.${locked === null ? "" : locked ? " Bloqueada" : ` ${stars} de 3 estrelas`}`}
    >
      <span className={styles.cardFace}>
        <span className={styles.cardArt}>
          <LevelMap level={level} home={home} away={away} locked={locked !== false} />
          <span className={styles.cardIndex}>{index + 1}</span>
          <span className={styles.cardSky} data-sky={level.sky}>{SKY_LABEL[level.sky]} · {level.clock}</span>
          {locked && (
            <span key={nudge} className={`${styles.cardLock} ${nudge ? styles.cardLockNudge : ""}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7.5a5 5 0 0110 0V10M5.5 10h13v10h-13z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /><circle cx="12" cy="15" r="1.6" fill="currentColor" /></svg>
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
      </span>
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
  /** A última fase pedida não abriu (o pedaço dela não chegou). */
  loadFailed: boolean;
  /** Uma fase está por cima: a abertura para de pintar, mas guarda a rolagem. */
  covered: boolean;
  onPlay: (index: number) => void;
  onTogglePerformance: () => void;
  onToggleMute: () => void;
  onToggleUnlockAll: () => void;
};

export function TitleScreen({ levels, progress, profile, away, hasWebgl, performance: performanceMode, muted, reducedMotion, starting, loadFailed, covered, onPlay, onTogglePerformance, onToggleMute, onToggleUnlockAll }: TitleScreenProps) {
  const [lockedNote, setLockedNote] = useState<{ index: number; key: number } | null>(null);
  // Até o progresso do aparelho chegar (logo depois do hidrato), os cartões não mostram cadeado.
  const known = useSyncExternalStore(noopSubscribe, clientTrue, serverFalse);
  const totalStars = levels.reduce((sum, level) => sum + (progress.stars[level.id] ?? 0), 0);
  const home = profile?.club ?? null;
  const homeColor = home?.primary ?? "#f7d117";

  useEffect(() => {
    if (!lockedNote) return;
    const timer = window.setTimeout(() => setLockedNote((current) => (current?.key === lockedNote.key ? null : current)), 2200);
    return () => window.clearTimeout(timer);
  }, [lockedNote]);

  // Menu parado: o 3D e a fase já vão baixando e a cama da torcida já vai sendo
  // gerada (em fatias), para o toque na fase não esperar nada disso. No celular
  // o "passou o dedo" chega junto com o toque, tarde demais.
  useEffect(() => {
    if (!hasWebgl) return;
    const warm = () => {
      void import("./three/view").catch(() => undefined);
      void import("./LevelPlayer").catch(() => undefined);
      warmScoreboboAudio();
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 1500 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(timer);
  }, [hasWebgl]);

  // O anel que pulsa em cada cartão liberado custa estilo e layout a cada quadro: com o
  // save cheio são 12 pulsando, quase todos fora da tela. Fora dela, o anel para.
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.toggleAttribute("data-off", !entry.isIntersecting);
    });
    for (const card of Array.from(grid.children)) observer.observe(card);
    return () => observer.disconnect();
  }, [levels]);

  // Quem decide é o progresso de agora, não o do desenho: logo depois do hidrato o
  // cartão ainda pode estar com o do servidor (tudo trancado), e o toque não se perde.
  const pick = useCallback((index: number) => {
    if (levelUnlocked(levels, index, readProgress())) {
      onPlay(index);
      return true;
    }
    setLockedNote((current) => ({ index, key: (current?.key ?? 0) + 1 }));
    return false;
  }, [levels, onPlay]);

  const click = (action: () => void, sound: "toggle" | "click" = "toggle") => () => {
    primeScoreboboAudio();
    action();
    playUiSound(sound);
  };

  const note = lockedNote ? `Ganhe ao menos 1 estrela na fase ${lockedNote.index} para liberar esta.` : loadFailed ? "A fase não abriu. Confira a conexão e toque de novo." : "";
  const playerInks = clubInks(home?.primary ?? "#f7d117", home?.secondary ?? "#1d4fc4");

  return (
    <main
      className={`${albumCss.root} albumMounted ${styles.screen} ${covered ? styles.screenCovered : ""}`}
      data-centered=""
      aria-hidden={covered || undefined}
      inert={covered || undefined}
    >
      <StarDefs />
      <div className={`${albumCss.album} ${styles.album}`}>
        <div className={albumCss.cover} aria-hidden="true" />
        <div className={`${albumCss.spread} ${styles.spread}`}>
          {/* ───────────── página da esquerda: o pôster, como jogar, o seu jogador ───────────── */}
          <section className={`${albumCss.page} ${styles.left}`} data-side="left" aria-label="Scorebobo">
            <header className={styles.poster}>
              <TitleBackdrop home={homeColor} away={away.primary} still={reducedMotion} />
              <div className={styles.posterLabels}>
                <h1 className={styles.logo} aria-label="Scorebobo">
                  <span className={styles.logoScore} aria-hidden="true">Score</span>
                  <span className={styles.logoBobo} aria-hidden="true">bobo</span>
                </h1>
                <p className={styles.tagline}>Desenhe a jogada</p>
              </div>
            </header>

            {!hasWebgl && (
              <div className={styles.noWebgl} role="alert">
                <strong>Este aparelho não tem 3D (WebGL)</strong>
                <span>O Scorebobo existe só no Modo 3D. Ative a aceleração de hardware do navegador ou abra o Futbobo em outro aparelho.</span>
              </div>
            )}

            <ol className={styles.steps} aria-label="Como jogar">
              <li><b>1</b><span><strong>O tempo congela</strong>Encoste o dedo ou o mouse na bola</span></li>
              <li><b>2</b><span><strong>Desenhe a jogada</strong>Até um companheiro, no espaço ou no gol</span></li>
              <li><b>3</b><span><strong>Solte</strong>A bola vai perto do traço, não igual</span></li>
            </ol>

            <footer className={styles.footer}>
              <div className={styles.player}>
                <span className={styles.playerSticker} style={playerInks} aria-hidden="true">
                  <span className={styles.playerArt}>
                    {profile ? <HeroBust profile={profile} size={64} /> : <span className={styles.bustSkeleton} />}
                    {profile && <b className={styles.playerNum}>{profile.number}</b>}
                  </span>
                </span>
                <span className={styles.playerText}>
                  <small>{profile?.fromSave ? "Jogando com o seu craque" : "Jogando como"}</small>
                  <strong>{profile ? profile.name : "Procurando o seu save…"}</strong>
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
          </section>

          {/* ───────────── página da direita: as fases, uma figurinha por fase ───────────── */}
          <section className={`${albumCss.page} ${styles.right}`} data-side="right" aria-labelledby="sb-levels-title">
            <div className={styles.levelsHead}>
              <h2 id="sb-levels-title">Fases</h2>
              <span className={styles.totalStars}>
                <StarIcon lit className={styles.totalStar} />
                <b>{totalStars}</b><small>de {levels.length * 3}</small>
              </span>
            </div>
            <div ref={gridRef} className={styles.grid}>
              {levels.map((level, index) => (
                <LevelCard
                  key={level.id}
                  level={level}
                  index={index}
                  stars={progress.stars[level.id] ?? 0}
                  locked={known ? !levelUnlocked(levels, index, progress) : null}
                  home={homeColor}
                  away={away.primary}
                  onPick={pick}
                  disabled={!hasWebgl || starting}
                />
              ))}
            </div>
            <p className={styles.lockedNote} aria-live="polite">{note}</p>
          </section>
        </div>
      </div>
    </main>
  );
}

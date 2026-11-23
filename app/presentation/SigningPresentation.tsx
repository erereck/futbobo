"use client";

// Apresentação do reforço em tela cheia: o jogador chega ao clube (pela
// peneira ou contratado), recebe a camisa com o nome e o número e a ergue
// para os fotógrafos. Relógio, palco (3D ou 2D), som e a camada de TV
// (tarjas, lower-third, "Bem-vindo", cartão final de papel do álbum).
//
// O relógio é daqui. O palco 3D, o 2D e o som só leem o tempo, então "Pular"
// e "Rever" são saltos desse relógio e cada camada se acerta sozinha no
// instante novo. Se o WebGL falhar (ou cair no meio, ou não ficar pronto a
// tempo), a cena troca para o 2D sem parar o relógio. O React só renderiza
// quando muda o que está na tela: o quadro a quadro (palco, progresso, clarão
// dos flashes) vai direto no canvas e no estilo.

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { readableInk } from "../botao/kits";
import { drawPlayerBust, type PlayerAppearance } from "../player-appearance";
import { beatAt, buildPresentationTimeline, flashLevel, lowerThirdAt, titleAt, type PresentationTimeline, type SigningPresentationInput } from "./presentation-script";
import type { PresentationStage } from "./presentation-stage";
import SigningPresentation2D, { type Presentation2DStage } from "./SigningPresentation2D";
import { PresentationAudio, primePresentationAudio, readPresentationMuted, rememberPresentationMuted } from "./presentation-audio";
import styles from "./presentation.module.css";

export type { SigningPresentationInput } from "./presentation-script";

export type SigningPresentationProps = {
  input: SigningPresentationInput;
  mode: "3d" | "2d";
  /** Modo desempenho 3D: sem sombra, menos flashes, resolução menor. */
  performance?: boolean;
  /** Chamado uma vez, quando o jogador sai do cartão final ("Começar carreira") ou fecha a apresentação. */
  onFinish: () => void;
};

/** O que os dois palcos têm em comum para o relógio. */
type Stage = { render(time: number, dt: number): void; dispose(): void };

/** Se o palco 3D não ficar pronto nesse tempo, a apresentação segue em 2D. */
const STAGE_TIMEOUT_MS = 20000;
/** Escurecimento de entrada (e de cada "Rever"). */
const FADE_IN = 0.9;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const readReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const serverReducedMotion = () => false;

// --------------------------------------------------------------- peças

/** Escudo do clube: a imagem quando existe, senão a sigla nas cores dele. */
function Crest({ club, className }: { club: SigningPresentationInput["club"]; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (club.badge && !broken) {
    // eslint-disable-next-line @next/next/no-img-element -- escudo do próprio site, tamanho de ícone
    return <img className={className} src={club.badge} alt="" draggable={false} onError={() => setBroken(true)} />;
  }
  return (
    <span className={`${className ?? ""} ${styles.crestChip}`} style={{ background: club.primary, color: readableInk(club.primary), borderColor: club.secondary }} aria-hidden="true">
      {club.abbr.slice(0, 4)}
    </span>
  );
}

/** Busto do álbum com a camisa nova (desenhado uma vez). */
function Sticker({ appearance, pattern, primary, secondary, label }: { appearance: PlayerAppearance; pattern: number; primary: string; secondary: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const size = 132;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, (size / 2) * ratio, (size / 2) * ratio);
    drawPlayerBust(ctx, { ...appearance, face: 9, kitPattern: pattern }, primary, secondary, size / 2 - 2, 4, { cutout: true });
  }, [appearance, pattern, primary, secondary]);
  return <canvas ref={ref} className={styles.stickerCanvas} role="img" aria-label={label} />;
}

const LowerThird = memo(function LowerThird({ timeline }: { timeline: PresentationTimeline }) {
  const { player, club } = timeline.input;
  return (
    <div className={styles.lowerThird}>
      <span className={styles.lowerStripe} aria-hidden="true" />
      <div className={styles.lowerBody}>
        <small>NOVO REFORÇO</small>
        <strong>{player.name}</strong>
        <span>{club.shortName} · camisa {player.number}</span>
      </div>
      <b className={styles.lowerNumber} aria-hidden="true">{player.number}</b>
    </div>
  );
});

const TitleCard = memo(function TitleCard({ timeline }: { timeline: PresentationTimeline }) {
  return (
    <div className={styles.title}>
      <span className={styles.titleKicker}>{timeline.kicker}</span>
      <strong className={styles.titleText} aria-label={timeline.welcome}>
        {Array.from(timeline.welcome).map((letter, index) => (
          <span key={index} aria-hidden="true" style={{ "--i": index } as CSSProperties}>{letter === " " ? " " : letter}</span>
        ))}
      </strong>
      <i className={styles.titleRule} aria-hidden="true" />
      <small className={styles.titleSub}>{timeline.sub}</small>
    </div>
  );
});

// ---------------------------------------------------------- cartão final

const EndCard = memo(function EndCard({ timeline, onContinue, onReplay }: { timeline: PresentationTimeline; onContinue: () => void; onReplay: () => void }) {
  const { player, club, origin } = timeline.input;
  const peneira = origin === "peneira";
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={styles.endCard}>
      <article className={styles.endSheet} aria-labelledby="presentation-end-title">
        <header className={styles.endBand}>
          <Crest club={club} className={styles.endCrest} />
          <div>
            <small>{club.city ? `Apresentação oficial · ${club.city}` : "Apresentação oficial"}</small>
            <h2 id="presentation-end-title">{timeline.welcome}</h2>
          </div>
        </header>
        <div className={styles.endBody}>
          <figure className={styles.sticker}>
            <Sticker appearance={player.appearance} pattern={timeline.kitPattern} primary={club.primary} secondary={club.secondary} label={player.name} />
            <b className={styles.stickerNumber}>{player.number}</b>
            <figcaption>{player.name}</figcaption>
          </figure>
          <div className={styles.endCopy}>
            <span className={styles.stamp}>{peneira ? "Aprovado na peneira" : "Reforço confirmado"}</span>
            <p>
              {peneira
                ? `Da peneira para a base: ${player.name} chega às categorias de base e já ganhou a camisa ${player.number} com o nome nas costas.`
                : `${player.name} chega como reforço e já tem a camisa ${player.number} com o nome nas costas.`}
            </p>
            <dl className={styles.endFacts}>
              <div><dt>Clube</dt><dd>{club.shortName}</dd></div>
              <div><dt>Camisa</dt><dd>{player.number}</dd></div>
              <div><dt>Nas costas</dt><dd>{(player.shortName || player.name).toUpperCase()}</dd></div>
            </dl>
          </div>
        </div>
        <footer className={styles.endActions}>
          <button ref={continueRef} type="button" className={styles.primaryAction} onClick={onContinue}>Começar carreira</button>
          <button type="button" className={styles.secondaryAction} onClick={onReplay}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5v3.2h3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Rever
          </button>
        </footer>
      </article>
    </div>
  );
});

// ---------------------------------------------------------------- tela

type View = { beat: number; lower: boolean; title: boolean; atEnd: boolean };

export default function SigningPresentation({ input, mode, performance: performanceMode = false, onFinish }: SigningPresentationProps) {
  const timeline = useMemo(() => buildPresentationTimeline(input), [input]);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);
  const [renderMode, setRenderMode] = useState(mode);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ beat: 0, lower: false, title: false, atEnd: false });
  const [muted, setMuted] = useState(readPresentationMuted);
  const [replays, setReplays] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const audioRef = useRef<PresentationAudio | null>(null);
  const timeRef = useRef(0);
  const jumpRef = useRef(false);
  const mutedRef = useRef(muted);
  const reducedRef = useRef(reducedMotion);
  const viewRef = useRef(view);
  const modeRef = useRef(renderMode);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);
  useEffect(() => {
    modeRef.current = renderMode;
  }, [renderMode]);

  // Som: nasce com a apresentação e morre com ela.
  useEffect(() => {
    const audio = new PresentationAudio(timeline, { muted: mutedRef.current });
    audioRef.current = audio;
    return () => {
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [timeline]);

  // Palco 3D: baixado só aqui, montado enquanto "Preparando a apresentação…" está na tela.
  useEffect(() => {
    if (renderMode !== "3d") return;
    let cancelled = false;
    let stage: PresentationStage | null = null;
    const fallback = () => {
      if (cancelled) return;
      cancelled = true;
      if (stageRef.current === stage) stageRef.current = null;
      setRenderMode("2d");
    };
    // Um canvas novo por palco: o WebGL de um canvas descartado (forceContextLoss
    // no dispose, remontagem do Fast Refresh) não volta, e o 3D cairia no 2D.
    const canvas = document.createElement("canvas");
    canvas.className = styles.stageCanvas;
    canvas.setAttribute("aria-hidden", "true");
    hostRef.current?.appendChild(canvas);
    const timer = window.setTimeout(fallback, STAGE_TIMEOUT_MS);
    import("./presentation-stage")
      .then(async ({ PresentationStage }) => {
        if (cancelled || !canvas.isConnected) return;
        stage = new PresentationStage(canvas, timeline, {
          performance: performanceMode,
          reducedMotion: reducedRef.current,
          onContextLost: fallback,
        });
        await stage.prepare();
        if (cancelled) return;
        window.clearTimeout(timer);
        stage.render(timeRef.current, 0);
        stageRef.current = stage;
        setReady(true);
      })
      .catch(fallback);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (stageRef.current === stage) stageRef.current = null;
      stage?.dispose();
      canvas.remove();
    };
  }, [renderMode, timeline, performanceMode]);

  // O 2D se entrega quando monta: já pode começar.
  const stage2DRef = useRef<Presentation2DStage | null>(null);
  const onStage2D = useCallback((stage: Presentation2DStage | null) => {
    if (stage) {
      stage2DRef.current = stage;
      stageRef.current = stage;
      stage.render(timeRef.current, 0);
      setReady(true);
    } else if (stageRef.current === stage2DRef.current) {
      stageRef.current = null;
      stage2DRef.current = null;
    }
  }, []);

  // O relógio: segundos de roteiro, parado com a aba escondida.
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Um engasgo longo atrasa a apresentação em vez de pular um beat inteiro.
      const delta = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.hidden) return;
      const jumped = jumpRef.current;
      jumpRef.current = false;
      const time = jumped ? timeRef.current : timeRef.current + delta;
      timeRef.current = time;
      const stage = stageRef.current;
      if (stage) {
        try {
          stage.render(time, jumped ? 0 : delta);
        } catch {
          stageRef.current = null;
          setRenderMode((current) => (current === "3d" ? "2d" : current));
        }
      }
      audioRef.current?.update(time, jumped);
      // Clarão dos flashes na tela inteira (no 3D a luz do palco já pisca: aqui é só um toque).
      const reduced = reducedRef.current;
      const flash = flashLevel(timeline.flashes, time, reduced) * (modeRef.current === "3d" ? 0.08 : 0.2);
      if (flashRef.current) flashRef.current.style.opacity = Math.min(0.35, flash).toFixed(3);
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${Math.min(1, time / timeline.duration).toFixed(4)})`;
      if (fadeRef.current) fadeRef.current.style.opacity = Math.max(0, 1 - time / FADE_IN).toFixed(3);
      // Só renderiza o React quando muda o que a camada de TV mostra.
      const beat = timeline.beats.indexOf(beatAt(timeline, time));
      const lower = lowerThirdAt(time);
      const title = titleAt(time, timeline.duration);
      const atEnd = time >= timeline.duration;
      const current = viewRef.current;
      if (beat !== current.beat || lower !== current.lower || title !== current.title || atEnd !== current.atEnd) {
        const next: View = { beat, lower, title, atEnd };
        viewRef.current = next;
        setView(next);
      }
    };
    frame = requestAnimationFrame(tick);
    const onVisibility = () => {
      last = performance.now();
      audioRef.current?.setPaused(document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, timeline]);

  const seek = useCallback((to: number) => {
    timeRef.current = to;
    jumpRef.current = true;
  }, []);

  const skip = useCallback(() => seek(timeline.duration), [seek, timeline.duration]);
  const replay = useCallback(() => {
    primePresentationAudio();
    setReplays((count) => count + 1);
    seek(0);
  }, [seek]);
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinishRef.current();
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    rememberPresentationMuted(next);
    audioRef.current?.setMuted(next);
    if (!next) primePresentationAudio();
  }, []);

  // Esc pula para o cartão final; no cartão, segue para a carreira.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (timeRef.current < timeline.duration) seek(timeline.duration);
      else finish();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [finish, seek, timeline.duration]);

  // Tela cheia de verdade: sem rolar a página por trás e com o foco aqui dentro.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  const { club, player } = timeline.input;
  const rootStyle = {
    "--club-a": club.primary,
    "--club-b": club.secondary,
    "--club-ink": readableInk(club.primary),
  } as CSSProperties;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className={`${styles.root} ${view.atEnd ? styles.atEnd : ""} ${reducedMotion ? styles.reduced : ""}`}
      style={rootStyle}
      role="dialog"
      aria-modal="true"
      aria-label={`Apresentação de ${player.name} no ${club.shortName}`}
      tabIndex={-1}
      onPointerDown={primePresentationAudio}
    >
      <div className={styles.stageLayer}>
        {renderMode === "3d"
          ? <div ref={hostRef} className={styles.stageLayer} />
          : <SigningPresentation2D timeline={timeline} reducedMotion={reducedMotion} onStage={onStage2D} />}
      </div>
      <div ref={flashRef} className={styles.flash} aria-hidden="true" />
      <div className={styles.grade} aria-hidden="true" />
      <div className={styles.barTop} aria-hidden="true" />
      <div className={styles.barBottom} aria-hidden="true" />

      <header className={styles.topBar}>
        <div className={styles.bug}>
          <Crest club={club} className={styles.bugCrest} />
          <b>{club.shortName}</b>
          <span className={styles.bugLabel}>Apresentação</span>
          {!view.atEnd && <i className={styles.live}><span>AO VIVO</span></i>}
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.iconButton} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Ligar o som" : "Desligar o som"} title={muted ? "Ligar o som" : "Desligar o som"}>
            {muted ? (
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" /><path d="M13.5 7.5l4 5m0-5l-4 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" /><path d="M13 7.2a4 4 0 0 1 0 5.6M15.4 5a7.2 7.2 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            )}
          </button>
          {ready && !view.atEnd && (
            <button type="button" className={styles.skipButton} onClick={skip} aria-label="Pular para o fim">
              Pular
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5l7 5.5-7 5.5zM11 4.5l7 5.5-7 5.5z" fill="currentColor" /></svg>
            </button>
          )}
          <button type="button" className={styles.iconButton} onClick={finish} aria-label="Fechar e começar a carreira" title="Fechar">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      {ready && !view.atEnd && (view.lower || view.title) && (
        <div className={`${styles.captionZone} ${view.lower ? styles.captionZoneLower : ""}`} aria-live="polite">
          {view.lower ? <LowerThird key={`lower-${replays}`} timeline={timeline} /> : <TitleCard key={`title-${replays}`} timeline={timeline} />}
        </div>
      )}

      <div className={styles.progress} aria-hidden="true"><i ref={progressRef} /></div>
      <div ref={fadeRef} className={styles.fadeIn} aria-hidden="true" />

      {view.atEnd && <EndCard key={`end-${replays}`} timeline={timeline} onContinue={finish} onReplay={replay} />}

      {!ready && (
        <div className={styles.loader} role="status">
          <span className={styles.loaderShirt} aria-hidden="true" />
          <strong>Preparando a apresentação…</strong>
          <small>{club.shortName} · sala de imprensa</small>
        </div>
      )}
    </div>,
    document.body,
  );
}

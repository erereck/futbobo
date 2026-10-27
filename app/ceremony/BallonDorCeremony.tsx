"use client";

// A gala da Bola de Ouro em tela cheia: relógio, palco (3D ou 2D), som e a
// camada de TV por cima (tarjas, legendas, lower-thirds, cartão final).
//
// O relógio é daqui. O palco 3D, a versão 2D e o som só leem o tempo, então
// "Pular" e "Rever" são saltos desse relógio e cada camada se acerta sozinha
// no instante novo. Se o WebGL falhar (ou cair no meio), a cena troca para o
// 2D sem parar o relógio.

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { beatAt, buildCeremonyTimeline, captionAt, type CeremonyCaption, type CeremonyFinalist, type CeremonyInput, type CeremonyTimeline } from "./ballon-dor-script";
import type { BallonDorStage } from "./ballon-dor-stage";
import BallonDorCeremony2D, { BustCanvas, GoldenBall } from "./BallonDorCeremony2D";
import { CeremonyAudio, primeCeremonyAudio, readCeremonyMuted, rememberCeremonyMuted } from "./ceremony-audio";
import styles from "./ceremony.module.css";

export type BallonDorCeremonyProps = {
  input: CeremonyInput;
  mode: "3d" | "2d";
  /** Modo desempenho 3D (sombra, plateia e resolução menores). */
  performance?: boolean;
  /** "Continuar" no cartão final. */
  onFinish?: () => void;
  /** Botão de fechar; sem ele, fechar também chama `onFinish`. */
  onClose?: () => void;
};

/** Se o palco 3D não ficar pronto nesse tempo, a gala segue em 2D. */
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

// ------------------------------------------------------------ legendas

const Caption = memo(function Caption({ caption, reveal }: { caption: CeremonyCaption; reveal: boolean }) {
  const suspense = !caption.title;
  return (
    <div className={`${styles.caption} ${reveal ? styles.captionReveal : ""} ${suspense ? styles.captionSuspense : ""}`}>
      <span className={styles.captionKicker}>{caption.kicker}</span>
      {caption.title && (
        <strong className={styles.captionTitle} aria-label={caption.title}>
          {reveal
            ? Array.from(caption.title).map((letter, index) => (
              <span key={index} aria-hidden="true" style={{ "--i": index } as CSSProperties}>{letter === " " ? " " : letter}</span>
            ))
            : caption.title}
        </strong>
      )}
      {caption.sub && <small className={styles.captionSub}>{caption.sub}</small>}
      {reveal && <i className={styles.captionRule} aria-hidden="true" />}
    </div>
  );
});

const LowerThird = memo(function LowerThird({ finalist, order }: { finalist: CeremonyFinalist; order: number }) {
  return (
    <div className={styles.lowerThird} style={{ "--club-a": finalist.club.primary, "--club-b": finalist.club.secondary } as CSSProperties}>
      <span className={styles.lowerStripe} aria-hidden="true" />
      <div className={styles.lowerBody}>
        <small>
          FINALISTA {order + 1} DE 3
          {finalist.isUser && <em>VOCÊ</em>}
        </small>
        <strong>{finalist.name}</strong>
        <span>{finalist.club.name} · camisa {finalist.number}</span>
      </div>
      <b className={styles.lowerNumber} aria-hidden="true">{finalist.number}</b>
    </div>
  );
});

// ---------------------------------------------------------- cartão final

const EndCard = memo(function EndCard({ timeline, onContinue, onReplay }: { timeline: CeremonyTimeline; onContinue: () => void; onReplay: () => void }) {
  const { first, second, third, user, userWon } = timeline;
  const season = timeline.input.season;
  const podium: Array<{ finalist: CeremonyFinalist; className: string }> = [
    { finalist: second, className: styles.podiumSecond },
    { finalist: first, className: styles.podiumFirst },
    { finalist: third, className: styles.podiumThird },
  ];
  return (
    <div className={`${styles.endCard} ${userWon ? styles.endWon : styles.endLost}`}>
      <div className={styles.endInner}>
        <span className={styles.endKicker}>{userWon ? `BOLA DE OURO ${season}` : `BALLON D'OR ${season} · TOP 3 DO MUNDO`}</span>
        <h2 className={styles.endTitle}>{userWon ? "Você é o melhor jogador do mundo" : `${user.place}º lugar`}</h2>
        <p className={styles.endSub}>
          {userWon
            ? `${second.name} e ${third.name} completaram o pódio.`
            : `${first.name} venceu a Bola de Ouro ${season}. Ninguém tira de você o lugar entre os três melhores do planeta.`}
        </p>
        <ol className={styles.podium}>
          {podium.map(({ finalist, className }, order) => (
            <li key={finalist.id} className={`${className} ${finalist.isUser ? styles.podiumYou : ""}`} style={{ "--i": order } as CSSProperties}>
              {finalist.place === 1 && <GoldenBall className={styles.podiumTrophy} />}
              <BustCanvas
                className={styles.podiumBust}
                appearance={finalist.appearance}
                face={finalist.place === 1 ? 9 : finalist.isUser ? 4 : 2}
                primary={finalist.club.primary}
                secondary={finalist.club.secondary}
                size={96}
                fluid
                label={finalist.name}
              />
              <strong>{finalist.name}</strong>
              <small>{finalist.club.name}</small>
              {finalist.isUser && <em>VOCÊ</em>}
              <span className={styles.podiumStep}>{finalist.place}º</span>
            </li>
          ))}
        </ol>
        <div className={styles.endActions}>
          <button type="button" className={styles.primaryAction} onClick={onContinue}>Continuar</button>
          <button type="button" className={styles.secondaryAction} onClick={onReplay}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5v3.2h3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Rever
          </button>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------- tela

export default function BallonDorCeremony({ input, mode, performance: performanceMode = false, onFinish, onClose }: BallonDorCeremonyProps) {
  const timeline = useMemo(() => buildCeremonyTimeline(input), [input]);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);
  const [renderMode, setRenderMode] = useState(mode);
  const [ready, setReady] = useState(mode === "2d");
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(readCeremonyMuted);

  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<BallonDorStage | null>(null);
  const audioRef = useRef<CeremonyAudio | null>(null);
  const timeRef = useRef(0);
  const jumpRef = useRef(false);
  const mutedRef = useRef(muted);
  const reducedRef = useRef(reducedMotion);

  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  // Som: nasce com a cerimônia e morre com ela.
  useEffect(() => {
    const audio = new CeremonyAudio(timeline, { muted: mutedRef.current });
    audioRef.current = audio;
    return () => {
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [timeline]);

  // Palco 3D: carregado só aqui, montado enquanto "Preparando a gala…" está na tela.
  useEffect(() => {
    if (renderMode !== "3d") return;
    let cancelled = false;
    let stage: BallonDorStage | null = null;
    const fallback = () => {
      if (cancelled) return;
      cancelled = true;
      if (stageRef.current === stage) stageRef.current = null;
      setRenderMode("2d");
      setReady(true);
    };
    // Um canvas novo por palco: o WebGL de um canvas descartado (forceContextLoss
    // no dispose, remontagem do Fast Refresh) não volta, e o 3D cairia no 2D.
    const canvas = document.createElement("canvas");
    canvas.className = styles.stageCanvas;
    canvas.setAttribute("aria-hidden", "true");
    hostRef.current?.appendChild(canvas);
    const timer = window.setTimeout(fallback, STAGE_TIMEOUT_MS);
    import("./ballon-dor-stage")
      .then(async ({ BallonDorStage }) => {
        if (cancelled || !canvas.isConnected) return;
        stage = new BallonDorStage(canvas, timeline, {
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

  // O relógio: segundos de roteiro, parado com a aba escondida.
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Um engasgo longo atrasa a gala em vez de pular um beat inteiro.
      const delta = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.hidden) return;
      const jumped = jumpRef.current;
      jumpRef.current = false;
      const next = jumped ? timeRef.current : timeRef.current + delta;
      timeRef.current = next;
      const stage = stageRef.current;
      if (stage) {
        try {
          stage.render(next, jumped ? 0 : delta);
        } catch {
          stageRef.current = null;
          setRenderMode("2d");
        }
      }
      audioRef.current?.update(next, jumped);
      setTime(next);
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
  }, [ready]);

  const seek = useCallback((to: number) => {
    timeRef.current = to;
    jumpRef.current = true;
    setTime(to);
  }, []);

  const skip = useCallback(() => seek(timeline.duration), [seek, timeline.duration]);
  const replay = useCallback(() => {
    primeCeremonyAudio();
    seek(0);
  }, [seek]);
  const close = useCallback(() => (onClose ?? onFinish)?.(), [onClose, onFinish]);
  const finish = useCallback(() => (onFinish ?? onClose)?.(), [onClose, onFinish]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    rememberCeremonyMuted(next);
    audioRef.current?.setMuted(next);
    if (!next) primeCeremonyAudio();
  }, []);

  // Esc pula para o cartão final; no cartão, fecha.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (timeRef.current < timeline.duration) seek(timeline.duration);
      else close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, seek, timeline.duration]);

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

  const beat = beatAt(timeline, time);
  const beatIndex = timeline.beats.indexOf(beat);
  const caption = captionAt(timeline, time);
  const revealed = beat.revealAt !== undefined && time >= beat.revealAt;
  const atEnd = time >= timeline.duration;
  const progress = Math.max(0, Math.min(1, time / timeline.duration));
  const nominee = beat.id === "nominee" && beat.nominee !== undefined ? timeline.input.finalists[beat.nominee] : null;
  const fade = ready ? Math.max(0, 1 - time / FADE_IN) : 1;
  const season = timeline.input.season;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className={`${styles.root} ${atEnd ? styles.atEnd : ""} ${reducedMotion ? styles.reduced : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Cerimônia da Bola de Ouro ${season}`}
      tabIndex={-1}
      onPointerDown={primeCeremonyAudio}
    >
      <div className={styles.stageLayer}>
        {renderMode === "3d"
          ? <div ref={hostRef} className={styles.stageLayer} />
          : <BallonDorCeremony2D timeline={timeline} time={time} reducedMotion={reducedMotion} />}
      </div>
      <div className={styles.grade} aria-hidden="true" />
      <div className={styles.barTop} aria-hidden="true" />
      <div className={styles.barBottom} aria-hidden="true" />

      <header className={styles.topBar}>
        <div className={styles.bug}>
          <span className={styles.bugBall} aria-hidden="true" />
          <b>BALLON D&apos;OR</b>
          <span className={styles.bugSeason}>· {season}</span>
          {!atEnd && <i className={styles.live}><span>AO VIVO</span></i>}
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.iconButton} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Ligar o som" : "Desligar o som"} title={muted ? "Ligar o som" : "Desligar o som"}>
            {muted ? (
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" /><path d="M13.5 7.5l4 5m0-5l-4 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" /><path d="M13 7.2a4 4 0 0 1 0 5.6M15.4 5a7.2 7.2 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            )}
          </button>
          {ready && !atEnd && (
            <button type="button" className={styles.skipButton} onClick={skip}>
              Pular
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5l7 5.5-7 5.5zM11 4.5l7 5.5-7 5.5z" fill="currentColor" /></svg>
            </button>
          )}
          <button type="button" className={styles.iconButton} onClick={close} aria-label="Fechar a cerimônia" title="Fechar">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      {ready && !atEnd && (
        <div className={`${styles.captionZone} ${nominee ? styles.captionZoneLower : ""}`} aria-live="polite">
          {nominee
            ? <LowerThird key={beatIndex} finalist={nominee} order={beat.nominee ?? 0} />
            : caption && <Caption key={`${beatIndex}-${revealed ? 1 : 0}`} caption={caption} reveal={revealed} />}
        </div>
      )}

      <div className={styles.progress} aria-hidden="true"><i style={{ transform: `scaleX(${progress})` }} /></div>
      <div className={styles.fadeIn} style={{ opacity: fade }} aria-hidden="true" />

      {atEnd && <EndCard timeline={timeline} onContinue={finish} onReplay={replay} />}

      {!ready && (
        <div className={styles.loader} role="status">
          <span className={styles.loaderRing} aria-hidden="true"><GoldenBall className={styles.loaderBall} /></span>
          <strong>Preparando a gala…</strong>
          <small>Acendendo as luzes do palco</small>
        </div>
      )}
    </div>,
    document.body,
  );
}

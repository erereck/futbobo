"use client";

// A festa do título da Copa em tela cheia: relógio, palco (3D ou 2D), batucada
// e a camada de TV por cima (tarjas, "AO VIVO", legendas, estrelas, letreiro
// correndo e o cartão final).
//
// O relógio é daqui. O palco 3D, o 2D e o som só leem o tempo, então "Pular" e
// "Rever" são saltos desse relógio e cada camada se acerta sozinha no instante
// novo. Se o WebGL falhar (ou cair no meio), a cena troca para o 2D sem parar o
// relógio. O React só renderiza quando muda o beat: o quadro a quadro (palco,
// barra de progresso, pulso da batida) vai direto no canvas e no estilo.

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { drawPlayerBust, type PlayerAppearance } from "../player-appearance";
import { buildParadeTimeline, paradeBeatAt, type ParadeCaption, type ParadeInput, type ParadeTimeline } from "./parade-script";
import type { ParadeStage } from "./parade-stage";
import { Parade2DStage } from "./ParadeCutscene2D";
import { ParadeAudio, paradeBeatPulse, primeParadeAudio, readParadeMuted, rememberParadeMuted } from "./parade-audio";
import styles from "./parade.module.css";

export type ParadeCutsceneProps = {
  input: ParadeInput;
  mode: "3d" | "2d";
  /** Modo desempenho: menos gente, menos partículas, resolução menor. */
  performance?: boolean;
  /** "Continuar" no cartão final. */
  onFinish?: () => void;
  /** Botão de fechar; sem ele, fechar também chama `onFinish`. */
  onClose?: () => void;
};

/** O que os dois palcos têm em comum para o relógio. */
type Stage = { render(time: number, dt: number): void; setBeat(pulse: number): void; dispose(): void };

/** Se o palco 3D não ficar pronto nesse tempo, a festa segue em 2D. */
const STAGE_TIMEOUT_MS = 20000;
/** Escurecimento de entrada (e de cada "Rever"). */
const FADE_IN = 0.8;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const readReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const serverReducedMotion = () => false;

// --------------------------------------------------------------- peças

/** Mesma regra das bandeiras do palco 2D: segunda cor clara vira faixa horizontal. */
function lightColor(hex: string) {
  const value = Number.parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16) || 0;
  return ((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114 > 200;
}

/** Bandeirinha do "AO VIVO": as cores da seleção em faixas. */
function FlagChip({ countryId, primary, secondary, className }: { countryId: string; primary: string; secondary: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" aria-hidden="true">
      <rect width="30" height="20" fill={primary} />
      {countryId === "brasil" ? (
        <>
          <path d="M3 10L15 2.6 27 10 15 17.4z" fill={secondary} />
          <circle cx="15" cy="10" r="4.4" fill="#1f3c8f" />
        </>
      ) : lightColor(secondary) ? (
        <rect y="6.67" width="30" height="6.67" fill={secondary} />
      ) : (
        <>
          <rect x="10" width="10" height="20" fill="#ffffff" />
          <rect x="20" width="10" height="20" fill={secondary} />
        </>
      )}
    </svg>
  );
}

function Star({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z" fill="currentColor" />
    </svg>
  );
}

/** Rosto do jogador desenhado uma vez pelo mesmo `drawPlayerBust` do jogo. */
function BustCanvas({ appearance, primary, secondary, size, className, label }: { appearance: PlayerAppearance; primary: string; secondary: string; size: number; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, size / 2 * ratio, size / 2 * ratio);
    drawPlayerBust(ctx, { ...appearance, face: 9 }, primary, secondary, size / 2);
  }, [appearance, primary, secondary, size]);
  return <canvas ref={ref} className={className} role="img" aria-label={label} />;
}

const Caption = memo(function Caption({ caption }: { caption: ParadeCaption }) {
  return (
    <div className={styles.caption}>
      <span className={styles.captionKicker}>{caption.kicker}</span>
      <strong className={styles.captionTitle} aria-label={caption.title}>
        {Array.from(caption.title).map((letter, index) => (
          <span key={index} aria-hidden="true" style={{ "--i": index } as CSSProperties}>{letter === " " ? " " : letter}</span>
        ))}
      </strong>
      {caption.sub && <small className={styles.captionSub}>{caption.sub}</small>}
    </div>
  );
});

const Stars = memo(function Stars({ count, fresh }: { count: number; fresh: boolean }) {
  return (
    <div className={styles.stars} role="img" aria-label={`${count} ${count === 1 ? "estrela" : "estrelas"}`}>
      {Array.from({ length: count }, (_, index) => (
        <Star key={index} className={`${styles.star} ${fresh && index === count - 1 ? styles.starNew : ""}`} style={{ "--i": index } as CSSProperties} />
      ))}
    </div>
  );
});

const Ticker = memo(function Ticker({ timeline }: { timeline: ParadeTimeline }) {
  const { city, country, player, stars, season } = timeline.input;
  const items = [
    `${city.name} para para receber os campeões do mundo`,
    `${city.avenue} tomada pela torcida`,
    `${player.name}, camisa ${player.number}, no alto do trio elétrico`,
    `Seleção ${country.name}: ${stars} ${stars === 1 ? "estrela" : "estrelas"} no peito`,
    `Copa do Mundo ${season}`,
  ];
  const line = items.join("  ·  ") + "  ·  ";
  return (
    <div className={styles.ticker} aria-hidden="true">
      <b className={styles.tickerTag}>PLANTÃO</b>
      <div className={styles.tickerTrack}>
        <span className={styles.tickerText}>{line}{line}</span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------- cartão final

const EndCard = memo(function EndCard({ timeline, onContinue, onReplay }: { timeline: ParadeTimeline; onContinue: () => void; onReplay: () => void }) {
  const { country, player, season, stars, city } = timeline.input;
  return (
    <div className={styles.endCard}>
      <div className={styles.endInner}>
        <span className={styles.endKicker}>CAMPEÕES DO MUNDO {season}</span>
        <Stars count={stars} fresh />
        <h2 className={styles.endTitle}>{country.name}</h2>
        <div className={styles.endPlayer}>
          <span className={styles.endBust}>
            <BustCanvas appearance={player.appearance} primary={country.primary} secondary={country.secondary} size={84} className={styles.endBustCanvas} label={player.name} />
          </span>
          <div>
            <strong>{player.name}</strong>
            <small>Camisa {player.number} · campeão do mundo</small>
          </div>
        </div>
        <p className={styles.endSub}>A festa parou {city.name}. {stars > 1 ? `${stars} estrelas no peito da seleção.` : "A primeira estrela no peito da seleção."}</p>
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

type View = { beat: number; stars: boolean; atEnd: boolean };

export default function ParadeCutscene({ input, mode, performance: performanceMode = false, onFinish, onClose }: ParadeCutsceneProps) {
  const timeline = useMemo(() => buildParadeTimeline(input), [input]);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);
  const [renderMode, setRenderMode] = useState(mode);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ beat: 0, stars: false, atEnd: false });
  const [muted, setMuted] = useState(readParadeMuted);
  const [replays, setReplays] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const audioRef = useRef<ParadeAudio | null>(null);
  const timeRef = useRef(0);
  const jumpRef = useRef(false);
  const mutedRef = useRef(muted);
  const reducedRef = useRef(reducedMotion);
  const viewRef = useRef(view);

  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  // Som: nasce com a festa e morre com ela.
  useEffect(() => {
    const audio = new ParadeAudio(timeline, { muted: mutedRef.current });
    audioRef.current = audio;
    return () => {
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [timeline]);

  // Palco: o 3D é baixado só aqui ("Esquentando o trio…"); o 2D já vem junto.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    // Um canvas novo por palco: o WebGL de um canvas descartado (forceContextLoss
    // no dispose, remontagem do Fast Refresh) não volta, e o 3D cairia no 2D.
    const canvas = document.createElement("canvas");
    canvas.className = styles.stageCanvas;
    canvas.setAttribute("aria-hidden", "true");
    layer.appendChild(canvas);
    const detach = () => canvas.remove();
    let cancelled = false;
    let stage: Stage | null = null;
    const fallback = () => {
      if (cancelled) return;
      cancelled = true;
      if (stageRef.current === stage) stageRef.current = null;
      setRenderMode("2d");
    };
    const go = (built: Stage) => {
      if (cancelled) {
        built.dispose();
        return;
      }
      stage = built;
      built.setBeat(paradeBeatPulse(timeRef.current));
      built.render(timeRef.current, 0);
      stageRef.current = built;
      setReady(true);
    };
    if (renderMode === "2d") {
      let painter: Parade2DStage | null = null;
      try {
        painter = new Parade2DStage(canvas, timeline, { performance: performanceMode, reducedMotion: reducedRef.current });
      } catch {
        // Sem canvas 2D não há cena: a camada de TV e o som seguem sozinhos.
      }
      const built = painter;
      Promise.resolve(built?.prepare())
        .then(() => {
          if (built) go(built);
          else if (!cancelled) setReady(true);
        })
        .catch(() => {
          if (!cancelled) setReady(true);
        });
      return () => {
        cancelled = true;
        if (built && stageRef.current === built) stageRef.current = null;
        built?.dispose();
        detach();
      };
    }
    const timer = window.setTimeout(fallback, STAGE_TIMEOUT_MS);
    let built: ParadeStage | null = null;
    import("./parade-stage")
      .then(async ({ ParadeStage }) => {
        if (cancelled) return;
        built = new ParadeStage(canvas, timeline, { performance: performanceMode, reducedMotion: reducedRef.current, onContextLost: fallback });
        await built.prepare();
        if (cancelled) return;
        window.clearTimeout(timer);
        go(built);
      })
      .catch(fallback);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (stageRef.current === built) stageRef.current = null;
      built?.dispose();
      detach();
    };
  }, [renderMode, timeline, performanceMode]);

  // O relógio: segundos de roteiro, parado com a aba escondida.
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let last = performance.now();
    const root = rootRef.current;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Um engasgo longo atrasa a festa em vez de pular um beat inteiro.
      const delta = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.hidden) return;
      const jumped = jumpRef.current;
      jumpRef.current = false;
      const time = jumped ? timeRef.current : timeRef.current + delta;
      timeRef.current = time;
      const audio = audioRef.current;
      audio?.update(time, jumped);
      // O pulso vem do relógio da música (o mesmo com ou sem som).
      const pulse = audio ? audio.pulse(time) : paradeBeatPulse(time);
      const stage = stageRef.current;
      if (stage) {
        try {
          stage.setBeat(pulse);
          stage.render(time, jumped ? 0 : delta);
        } catch {
          stageRef.current = null;
          setRenderMode((current) => (current === "3d" ? "2d" : current));
        }
      }
      root?.style.setProperty("--pulse", pulse.toFixed(3));
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${Math.min(1, time / timeline.duration)})`;
      if (fadeRef.current) fadeRef.current.style.opacity = String(Math.max(0, 1 - time / FADE_IN));
      const beat = timeline.beats.indexOf(paradeBeatAt(timeline, time));
      const next: View = { beat, stars: time >= timeline.trophyLiftAt && time < timeline.duration, atEnd: time >= timeline.duration };
      const current = viewRef.current;
      if (next.beat !== current.beat || next.stars !== current.stars || next.atEnd !== current.atEnd) {
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
    primeParadeAudio();
    setReplays((count) => count + 1);
    seek(0);
  }, [seek]);
  const close = useCallback(() => (onClose ?? onFinish)?.(), [onClose, onFinish]);
  const finish = useCallback(() => (onFinish ?? onClose)?.(), [onClose, onFinish]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    rememberParadeMuted(next);
    audioRef.current?.setMuted(next);
    if (!next) primeParadeAudio();
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

  const beat = timeline.beats[view.beat] ?? timeline.beats[0];
  const { country, city, season, stars } = timeline.input;
  const rootStyle = { "--c1": country.primary, "--c2": country.secondary } as CSSProperties;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className={`${styles.root} ${view.atEnd ? styles.atEnd : ""} ${reducedMotion ? styles.reduced : ""}`}
      style={rootStyle}
      role="dialog"
      aria-modal="true"
      aria-label={`Festa dos campeões do mundo em ${city.name}`}
      tabIndex={-1}
      onPointerDown={primeParadeAudio}
    >
      <div ref={layerRef} className={styles.stageLayer} />
      <div className={styles.grade} aria-hidden="true" />
      <div className={styles.barTop} aria-hidden="true" />
      <div className={styles.barBottom} aria-hidden="true" />

      <header className={styles.topBar}>
        <div className={styles.bug}>
          <FlagChip className={styles.bugFlag} countryId={country.id} primary={country.primary} secondary={country.secondary} />
          {!view.atEnd && <i className={styles.live}><span>AO VIVO</span></i>}
          <b className={styles.bugCity}>{city.name}</b>
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
              <span className={styles.skipLabel}>Pular</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5l7 5.5-7 5.5zM11 4.5l7 5.5-7 5.5z" fill="currentColor" /></svg>
            </button>
          )}
          <button type="button" className={styles.iconButton} onClick={close} aria-label="Fechar a festa" title="Fechar">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      {ready && view.stars && !view.atEnd && (
        <div className={styles.starZone} key={`stars-${replays}`}>
          <Stars count={stars} fresh />
        </div>
      )}

      {ready && !view.atEnd && beat.caption && (
        <div className={styles.captionZone} aria-live="polite">
          <Caption key={`${view.beat}-${replays}`} caption={beat.caption} />
        </div>
      )}

      {ready && !view.atEnd && <Ticker timeline={timeline} />}

      <div className={styles.progress} aria-hidden="true"><i ref={progressRef} /></div>
      <div ref={fadeRef} className={styles.fadeIn} aria-hidden="true" />

      {view.atEnd && <EndCard timeline={timeline} onContinue={finish} onReplay={replay} />}

      {!ready && (
        <div className={styles.loader} role="status">
          <span className={styles.loaderBars} aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <strong>Esquentando o trio…</strong>
          <small>{city.name} · Copa do Mundo {season}</small>
        </div>
      )}
    </div>,
    document.body,
  );
}

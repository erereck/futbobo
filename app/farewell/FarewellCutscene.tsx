"use client";

// Despedida da lenda em tela cheia: o estádio lotado, o corredor de
// companheiros, a mão no peito, o beijo no escudo e o "Obrigado". Mesma
// arquitetura da apresentação do reforço: o relógio é daqui; o palco (3D ou
// 2D), o som e a camada de TV só leem o tempo. "Pular" e "Rever" são saltos
// do relógio. Se o WebGL falhar (ou não ficar pronto a tempo), segue em 2D.

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { readableInk } from "../botao/kits";
import { drawPlayerBust } from "../player-appearance";
import { readPresentationMuted, rememberPresentationMuted } from "../presentation/presentation-audio";
import { clubArticle } from "../presentation/presentation-script";
import shared from "../presentation/presentation.module.css";
import Farewell2D, { type Farewell2DStage } from "./Farewell2D";
import { FarewellAudio, primeFarewellAudio } from "./farewell-audio";
import {
  buildFarewellTimeline,
  farewellBeatAt,
  farewellLowerAt,
  farewellStatIndex,
  farewellTitleAt,
  type FarewellInput,
  type FarewellTimeline,
} from "./farewell-script";
import type { FarewellStage } from "./farewell-stage";
import styles from "./farewell.module.css";

export type { FarewellInput } from "./farewell-script";

export type FarewellCutsceneProps = {
  input: FarewellInput;
  mode: "3d" | "2d";
  performance?: boolean;
  /** Chamado uma vez, quando o jogador sai do cartão final ou fecha a cena. */
  onFinish: () => void;
};

type Stage = { render(time: number, dt: number): void; dispose(): void };

const STAGE_TIMEOUT_MS = 20000;
const FADE_IN = 1.2;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const readReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const serverReducedMotion = () => false;

const number = (value: number) => value.toLocaleString("pt-BR");

// --------------------------------------------------------------- peças

function Crest({ club, className }: { club: FarewellInput["club"]; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (club.badge && !broken) {
    // eslint-disable-next-line @next/next/no-img-element -- escudo do próprio site, tamanho de ícone
    return <img className={className} src={club.badge} alt="" draggable={false} onError={() => setBroken(true)} />;
  }
  return (
    <span className={`${className ?? ""} ${shared.crestChip}`} style={{ background: club.primary, color: readableInk(club.primary), borderColor: club.secondary }} aria-hidden="true">
      {club.abbr.slice(0, 4)}
    </span>
  );
}

function Sticker({ timeline, label }: { timeline: FarewellTimeline; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { player, club } = timeline.input;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const size = 132;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, (size / 2) * ratio, (size / 2) * ratio);
    drawPlayerBust(ctx, { ...player.appearance, face: 9, kitPattern: timeline.kitPattern }, club.primary, club.secondary, size / 2 - 2, 4, { cutout: true });
  }, [player.appearance, club.primary, club.secondary, timeline.kitPattern]);
  return <canvas ref={ref} className={shared.stickerCanvas} role="img" aria-label={label} />;
}

const LowerThird = memo(function LowerThird({ timeline }: { timeline: FarewellTimeline }) {
  const { player, club, stats } = timeline.input;
  return (
    <div className={shared.lowerThird}>
      <span className={shared.lowerStripe} aria-hidden="true" />
      <div className={shared.lowerBody}>
        <small>{timeline.input.kind === "retirement" ? "ÚLTIMA NOITE" : "DESPEDIDA"}</small>
        <strong>{player.name}</strong>
        <span>{club.shortName} · {stats.from === stats.to ? stats.from : `${stats.from}–${stats.to}`}</span>
      </div>
      <b className={shared.lowerNumber} aria-hidden="true">{player.number}</b>
    </div>
  );
});

const StatCard = memo(function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.stat}>
      <b>{number(value)}</b>
      <span>{label}</span>
      <small>pelo clube</small>
    </div>
  );
});

const TitleCard = memo(function TitleCard({ timeline }: { timeline: FarewellTimeline }) {
  return (
    <div className={shared.title}>
      <span className={shared.titleKicker}>{timeline.kicker}</span>
      <strong className={shared.titleText} aria-label={timeline.thanks}>
        {Array.from(timeline.thanks).map((letter, index) => (
          <span key={index} aria-hidden="true" style={{ "--i": index } as CSSProperties}>{letter === " " ? " " : letter}</span>
        ))}
      </strong>
      <i className={shared.titleRule} aria-hidden="true" />
      <small className={shared.titleSub}>{timeline.sub}</small>
    </div>
  );
});

const EndCard = memo(function EndCard({ timeline, onContinue, onReplay }: { timeline: FarewellTimeline; onContinue: () => void; onReplay: () => void }) {
  const { player, club, stats, destination, kind } = timeline.input;
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true });
  }, []);
  const action = kind === "retirement" ? "Ver a carreira" : destination ? `Seguir para ${clubArticle(destination.shortName)} ${destination.shortName}` : "Seguir";
  const years = stats.from === stats.to ? `${stats.from}` : `${stats.from}–${stats.to}`;
  const article = clubArticle(club.shortName);
  const articleCap = article === "a" ? "A" : "O";
  return (
    <div className={shared.endCard}>
      <article className={`${shared.endSheet} ${styles.endSheet}`} aria-labelledby="farewell-end-title">
        <header className={shared.endBand}>
          <Crest club={club} className={shared.endCrest} />
          <div>
            <small>{kind === "retirement" ? "A última noite" : "Despedida"}{club.city ? ` · ${club.city}` : ""}</small>
            <h2 id="farewell-end-title">{timeline.thanks}</h2>
          </div>
        </header>
        <div className={shared.endBody}>
          <figure className={shared.sticker}>
            <Sticker timeline={timeline} label={player.name} />
            <b className={shared.stickerNumber}>{player.number}</b>
            <figcaption>{player.name}</figcaption>
          </figure>
          <div className={shared.endCopy}>
            <span className={shared.stamp}>Lenda do clube</span>
            <p>
              {kind === "retirement"
                ? `${years}: ${stats.seasons} temporadas seguidas com a camisa ${player.number} ${article === "a" ? "da" : "do"} ${club.shortName}. A carreira termina onde a torcida aprendeu a cantar o seu nome.`
                : `${years}: ${stats.seasons} temporadas seguidas com a camisa ${player.number}. ${articleCap} ${club.shortName} se despede de pé, e o próximo capítulo começa longe daqui.`}
            </p>
            <dl className={`${shared.endFacts} ${styles.facts}`}>
              <div><dt>Jogos</dt><dd>{number(stats.appearances)}</dd></div>
              {stats.keeper
                ? <div><dt>Sem sofrer gol</dt><dd>{number(stats.cleanSheets)}</dd></div>
                : <div><dt>Gols</dt><dd>{number(stats.goals)}</dd></div>}
              <div><dt>Assistências</dt><dd>{number(stats.assists)}</dd></div>
              <div><dt>Títulos</dt><dd>{number(stats.titles)}</dd></div>
            </dl>
            {stats.titleLines.length > 0 && (
              <ul className={styles.titles} aria-label="Títulos pelo clube">
                {stats.titleLines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
          </div>
        </div>
        <footer className={shared.endActions}>
          <button ref={continueRef} type="button" className={shared.primaryAction} onClick={onContinue}>{action}</button>
          <button type="button" className={shared.secondaryAction} onClick={onReplay}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5v3.2h3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Rever
          </button>
        </footer>
      </article>
    </div>
  );
});

// ---------------------------------------------------------------- tela

type View = { beat: number; lower: boolean; stat: number; title: boolean; atEnd: boolean };

export default function FarewellCutscene({ input, mode, performance: performanceMode = false, onFinish }: FarewellCutsceneProps) {
  const timeline = useMemo(() => buildFarewellTimeline(input), [input]);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);
  const [renderMode, setRenderMode] = useState(mode);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ beat: 0, lower: false, stat: -1, title: false, atEnd: false });
  const [muted, setMuted] = useState(readPresentationMuted);
  const [replays, setReplays] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const audioRef = useRef<FarewellAudio | null>(null);
  const timeRef = useRef(0);
  const jumpRef = useRef(false);
  const mutedRef = useRef(muted);
  const reducedRef = useRef(reducedMotion);
  const viewRef = useRef(view);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    const audio = new FarewellAudio(timeline, { muted: mutedRef.current });
    audioRef.current = audio;
    return () => {
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [timeline]);

  // Palco 3D: baixado só aqui, montado enquanto "Preparando…" está na tela.
  useEffect(() => {
    if (renderMode !== "3d") return;
    let cancelled = false;
    let stage: FarewellStage | null = null;
    const fallback = () => {
      if (cancelled) return;
      cancelled = true;
      if (stageRef.current === stage) stageRef.current = null;
      setRenderMode("2d");
    };
    const canvas = document.createElement("canvas");
    canvas.className = shared.stageCanvas;
    canvas.setAttribute("aria-hidden", "true");
    hostRef.current?.appendChild(canvas);
    const timer = window.setTimeout(fallback, STAGE_TIMEOUT_MS);
    import("./farewell-stage")
      .then(async ({ FarewellStage }) => {
        if (cancelled || !canvas.isConnected) return;
        stage = new FarewellStage(canvas, timeline, { performance: performanceMode, reducedMotion: reducedRef.current, onContextLost: fallback });
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

  const stage2DRef = useRef<Farewell2DStage | null>(null);
  const onStage2D = useCallback((stage: Farewell2DStage | null) => {
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
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${Math.min(1, time / timeline.duration).toFixed(4)})`;
      if (fadeRef.current) fadeRef.current.style.opacity = Math.max(0, 1 - time / FADE_IN).toFixed(3);
      const beat = timeline.beats.indexOf(farewellBeatAt(timeline, time));
      const lower = farewellLowerAt(time);
      const stat = farewellStatIndex(time);
      const title = farewellTitleAt(time, timeline.duration);
      const atEnd = time >= timeline.duration;
      const current = viewRef.current;
      if (beat !== current.beat || lower !== current.lower || stat !== current.stat || title !== current.title || atEnd !== current.atEnd) {
        const next: View = { beat, lower, stat, title, atEnd };
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

  // Só em desenvolvimento: `__farewell.seek(9)` no console para revisar um plano.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const hook = { seek, time: () => timeRef.current };
    (window as unknown as { __farewell?: typeof hook }).__farewell = hook;
    return () => {
      const target = window as unknown as { __farewell?: typeof hook };
      if (target.__farewell === hook) delete target.__farewell;
    };
  }, [seek]);
  const replay = useCallback(() => {
    primeFarewellAudio();
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
    if (!next) primeFarewellAudio();
  }, []);

  // Esc pula para o cartão final; no cartão, segue.
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
  const rootStyle = { "--club-a": club.primary, "--club-b": club.secondary, "--club-ink": readableInk(club.primary) } as CSSProperties;
  if (typeof document === "undefined") return null;
  const stat = view.stat >= 0 ? timeline.stats[view.stat] : null;

  return createPortal(
    <div
      ref={rootRef}
      className={`${shared.root} ${view.atEnd ? shared.atEnd : ""} ${reducedMotion ? shared.reduced : ""}`}
      style={rootStyle}
      role="dialog"
      aria-modal="true"
      aria-label={`Despedida de ${player.name} no ${club.shortName}`}
      tabIndex={-1}
      onPointerDown={primeFarewellAudio}
    >
      <div className={shared.stageLayer}>
        {renderMode === "3d"
          ? <div ref={hostRef} className={shared.stageLayer} />
          : <Farewell2D timeline={timeline} reducedMotion={reducedMotion} onStage={onStage2D} />}
      </div>
      <div className={shared.grade} aria-hidden="true" />
      <div className={shared.barTop} aria-hidden="true" />
      <div className={shared.barBottom} aria-hidden="true" />

      <header className={shared.topBar}>
        <div className={shared.bug}>
          <Crest club={club} className={shared.bugCrest} />
          <b>{club.shortName}</b>
          <span className={shared.bugLabel}>{timeline.input.kind === "retirement" ? "Última noite" : "Despedida"}</span>
          {!view.atEnd && <i className={shared.live}><span>AO VIVO</span></i>}
        </div>
        <div className={shared.controls}>
          <button type="button" className={shared.iconButton} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Ligar o som" : "Desligar o som"} title={muted ? "Ligar o som" : "Desligar o som"}>
            {muted ? (
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" /><path d="M13.5 7.5l4 5m0-5l-4 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" /><path d="M13 7.2a4 4 0 0 1 0 5.6M15.4 5a7.2 7.2 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            )}
          </button>
          {ready && !view.atEnd && (
            <button type="button" className={shared.skipButton} onClick={skip} aria-label="Pular para o fim">
              Pular
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5l7 5.5-7 5.5zM11 4.5l7 5.5-7 5.5z" fill="currentColor" /></svg>
            </button>
          )}
          <button type="button" className={shared.iconButton} onClick={finish} aria-label="Fechar a despedida" title="Fechar">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      {ready && !view.atEnd && (view.lower || view.title) && (
        <div className={`${shared.captionZone} ${view.lower ? shared.captionZoneLower : ""}`} aria-live="polite">
          {view.lower ? <LowerThird key={`lower-${replays}`} timeline={timeline} /> : <TitleCard key={`title-${replays}`} timeline={timeline} />}
        </div>
      )}
      {ready && !view.atEnd && stat && (
        <div className={styles.statZone} aria-live="polite">
          <StatCard key={`stat-${view.stat}-${replays}`} value={stat.value} label={stat.label} />
        </div>
      )}

      <div className={shared.progress} aria-hidden="true"><i ref={progressRef} /></div>
      <div ref={fadeRef} className={shared.fadeIn} aria-hidden="true" />

      {view.atEnd && <EndCard key={`end-${replays}`} timeline={timeline} onContinue={finish} onReplay={replay} />}

      {!ready && (
        <div className={shared.loader} role="status">
          <span className={shared.loaderShirt} aria-hidden="true" />
          <strong>Preparando a despedida…</strong>
          <small>{club.shortName} · estádio lotado</small>
        </div>
      )}
    </div>,
    document.body,
  );
}

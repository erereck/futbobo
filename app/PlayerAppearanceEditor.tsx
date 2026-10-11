"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { FIELD } from "./botao/engine";
import { drawBotaoPiecePreview } from "./botao/render";
import { drawCharacterBust, drawCharacterFullBody, drawCharacterHead, FULL_BODY_BOUNDS } from "./character/render";
import {
  ACCESSORY_COLORS,
  BEARD_NAMES,
  BOOT_COLORS,
  BOOT_NAMES,
  BROW_NAMES,
  BUILD_NAMES,
  EAR_NAMES,
  EARRING_NAMES,
  EYE_COLORS,
  EYE_SHAPE_NAMES,
  FACE_NAMES,
  FACE_SHAPE_NAMES,
  GLASSES_NAMES,
  GLOVE_NAMES,
  HAIR_COLORS,
  HAIR_STYLE_GROUPS,
  HAIR_STYLE_NAMES,
  HAIR_TIP_COLORS,
  HAIR_TIP_NAMES,
  HEADWEAR_NAMES,
  HEIGHT_NAMES,
  MARK_NAMES,
  NOSE_NAMES,
  POSE_NAMES,
  SKIN_COLORS,
  SOCK_NAMES,
  TATTOO_NAMES,
  WRISTBAND_NAMES,
  normalizePlayerAppearance,
  randomStudioAppearance,
  type PlayerAppearance,
} from "./player-appearance";
import styles from "./PlayerAppearanceEditor.module.css";

// ---------------------------------------------------------------------------
// Canvas do personagem

type CanvasMode = "body" | "portrait" | "head" | "face" | "bust";

const FRAMES: Record<Exclude<CanvasMode, "bust">, { x: number; y: number; w: number; h: number }> = {
  body: FULL_BODY_BOUNDS,
  portrait: { x: -118, y: -122, w: 236, h: 236 },
  head: { x: -92, y: -112, w: 184, h: 184 },
  face: { x: -54, y: -40, w: 108, h: 104 },
};

type Kit = { primary: string; secondary: string; pattern: number };

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CharacterCanvas({
  appearance,
  kit,
  number,
  mode,
  animate = false,
  label,
  className,
}: {
  appearance: PlayerAppearance;
  kit: Kit;
  number?: number;
  mode: CanvasMode;
  animate?: boolean;
  label?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const stateRef = useRef({ appearance, kit, number, mode });
  const drawRef = useRef<(blink: number, bob: number) => void>(() => {});

  useEffect(() => {
    stateRef.current = { appearance, kit, number, mode };
    drawRef.current = (blink: number, bob: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const { width, height } = sizeRef.current;
      if (!canvas || !ctx || !width || !height) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const state = stateRef.current;
      const value = { ...state.appearance, kitPattern: state.kit.pattern };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (state.mode === "bust") {
        ctx.translate(width / 2, height / 2);
        drawCharacterBust(ctx, value, state.kit.primary, state.kit.secondary, Math.min(width, height) / 2 - 1, { blink });
        return;
      }
      const frame = FRAMES[state.mode];
      const scale = Math.min(width / frame.w, height / frame.h);
      ctx.translate(width / 2, height / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(frame.x + frame.w / 2), -(frame.y + frame.h / 2));
      const options = { primary: state.kit.primary, secondary: state.kit.secondary, number: state.number, blink };
      if (state.mode === "portrait") {
        drawCharacterFullBody(ctx, value, options);
      } else if (state.mode === "body") {
        const feet = frame.y + frame.h - 14;
        ctx.translate(0, feet);
        ctx.scale(1, 1 + bob);
        ctx.translate(0, -feet);
        drawCharacterFullBody(ctx, value, options);
      } else {
        drawCharacterHead(ctx, value, options);
      }
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { width: rect.width, height: rect.height };
      drawRef.current(0, 0);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!animate || prefersReducedMotion()) return;
    let frame = 0;
    let lastDraw = 0;
    let nextBlink = performance.now() + 1800;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      // ~30 fps bastam para piscar e respirar; poupa bateria no celular
      if (time - lastDraw < 32) return;
      lastDraw = time;
      let blink = 0;
      if (time > nextBlink) {
        const elapsed = time - nextBlink;
        if (elapsed > 170) nextBlink = time + 2600 + Math.random() * 2600;
        else blink = Math.sin((elapsed / 170) * Math.PI);
      }
      drawRef.current(blink, Math.sin(time / 900) * 0.006);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  useEffect(() => {
    if (!animate || prefersReducedMotion()) drawRef.current(0, 0);
  }, [animate, appearance, kit, number, mode]);

  return <canvas ref={canvasRef} className={className} role="img" aria-label={label} />;
}

// ---------------------------------------------------------------------------
// Prévia da peça de botão

let ballSprite: HTMLImageElement | null = null;
function loadBall(onLoad: () => void) {
  if (typeof Image === "undefined") return null;
  if (!ballSprite) {
    ballSprite = new Image();
    ballSprite.src = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/botao/match-ball.png`;
  }
  if (!ballSprite.complete) ballSprite.addEventListener("load", onLoad, { once: true });
  return ballSprite;
}

function BotaoPieceCanvas({ appearance, kit, number, zoom, withBall = false, className }: { appearance: PlayerAppearance; kit: Kit; number: number; zoom: "close" | "real"; withBall?: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    // Escala da mesa: no celular as 300 unidades do campo ocupam ~360px.
    const scale = zoom === "real" ? 1.2 : Math.min(rect.width, rect.height) / (FIELD.discRadius * 3.7);
    ctx.translate(rect.width / 2 - (withBall ? FIELD.discRadius * scale * 0.32 : 0), rect.height / 2 - (zoom === "close" ? FIELD.discRadius * scale * 0.2 : 0));
    ctx.scale(scale, scale);
    drawBotaoPiecePreview(ctx, { appearance: { ...appearance, kitPattern: kit.pattern }, primary: kit.primary, secondary: kit.secondary, number });
    if (withBall) {
      const ball = loadBall(() => setTick((value) => value + 1));
      const r = FIELD.ballRadius;
      const x = FIELD.discRadius + r + 2.5;
      const y = FIELD.discRadius * 0.55;
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      ctx.ellipse(x + 0.8, y + 1.6, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (ball?.complete && ball.naturalWidth) ctx.drawImage(ball, x - r, y - r, r * 2, r * 2);
      else {
        ctx.fillStyle = "#f5f5f0";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [appearance, kit, number, zoom, withBall, tick]);
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Controles

type TabId = "rosto" | "cabelo" | "expressao" | "barba" | "corpo" | "estilo";

const TAB_ICONS: Record<TabId, ReactNode> = {
  rosto: <><circle cx="12" cy="12" r="8.5" /><path d="M9 10.5h.01M15 10.5h.01" /><path d="M9 15c1.7 1.3 4.3 1.3 6 0" /></>,
  cabelo: <><path d="M4.5 13c0-5 3.4-8.5 7.5-8.5s7.5 3.5 7.5 8.5" /><path d="M4.5 13c2.5-.5 4.5-2.4 5.5-5 1.5 2.6 5 4.4 9.5 5" /><path d="M6 13v5M18 13v5" /></>,
  expressao: <><circle cx="12" cy="12" r="8.5" /><path d="M8 9.5 10 11l-2 1.5M16 9.5 14 11l2 1.5" /><path d="M8.5 15.2h7a3.5 3.5 0 0 1-7 0Z" /></>,
  barba: <><path d="M5 9c0 6 3 10.5 7 10.5S19 15 19 9" /><path d="M5 9c1.5 2.5 3.4 3.7 7 3.7S17.5 11.5 19 9" /><path d="M9.5 15.5c1.5-.8 3.5-.8 5 0" /></>,
  corpo: <><path d="M8 4.5 4 7l1.8 4L8 10v9.5h8V10l2.2 1L20 7l-4-2.5c-.7 1.6-2.2 2.5-4 2.5S8.7 6.1 8 4.5Z" /></>,
  estilo: <><path d="M3.5 11h17" /><path d="M5 11c0 3 1.6 4.5 3.6 4.5S12 13.5 12 11c0 2.5 1.4 4.5 3.4 4.5S19 14 19 11" /><path d="M12 4.5v2M8 5.5l1 1.6M16 5.5l-1 1.6" /></>,
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "rosto", label: "Rosto" },
  { id: "cabelo", label: "Cabelo" },
  { id: "expressao", label: "Expressão" },
  { id: "barba", label: "Barba" },
  { id: "corpo", label: "Corpo" },
  { id: "estilo", label: "Estilo" },
];

const TAB_FIELDS: Record<TabId, Array<keyof PlayerAppearance>> = {
  rosto: ["skin", "faceShape", "eyeShape", "eyeColor", "brow", "nose", "ears", "marks", "customSkinColor", "customEyeColor"],
  cabelo: ["hairStyle", "hairColor", "hairTip", "customHairColor"],
  expressao: ["face"],
  barba: ["beard"],
  corpo: ["build", "height", "pose", "tattoo"],
  estilo: ["headwear", "glasses", "earrings", "wristband", "accessoryColor", "boots", "socks", "gloves"],
};

/** Cortes que cobrem as orelhas: na miniatura de brincos usamos um corte curto. */
const EAR_COVERING_HAIR = new Set([16, 18, 30, 31, 32, 33, 34, 35, 41]);

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function Group({ title, value, children, hint }: { title: string; value?: string; children: ReactNode; hint?: string }) {
  return (
    <section className={styles.group}>
      <header>
        <h3>{title}</h3>
        {value && <span>{value}</span>}
      </header>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </section>
  );
}

function OptionGrid({
  names,
  values,
  selected,
  render,
  onSelect,
  mode,
  kit,
  size = "md",
  label,
}: {
  names: string[];
  values?: number[];
  selected: number;
  render: (index: number) => PlayerAppearance;
  onSelect: (index: number) => void;
  mode: CanvasMode;
  kit: Kit;
  size?: "sm" | "md" | "lg";
  label: string;
}) {
  const indices = values ?? names.map((_, index) => index);
  const sizeClass = size === "sm" ? styles.gridSm : size === "lg" ? styles.gridLg : styles.gridMd;
  return (
    <div className={`${styles.optionGrid} ${sizeClass}`} role="radiogroup" aria-label={label}>
      {indices.map((index) => (
        <button
          type="button"
          key={index}
          role="radio"
          aria-checked={selected === index}
          className={`${styles.option} ${selected === index ? styles.optionSelected : ""}`}
          onClick={() => onSelect(index)}
          title={names[index]}
        >
          <span className={`${styles.thumb} ${mode === "body" ? styles.thumbBody : ""}`}>
            <CharacterCanvas appearance={render(index)} kit={kit} mode={mode} className={styles.thumbCanvas} />
          </span>
          <small>{names[index]}</small>
        </button>
      ))}
    </div>
  );
}

function Swatches({
  label,
  colors,
  selected,
  onSelect,
  names,
  custom,
  none,
}: {
  label: string;
  colors: string[];
  selected: number;
  onSelect: (index: number) => void;
  names?: string[];
  custom?: { value?: string; fallback: string; onChange: (color: string) => void; onReset: () => void };
  none?: { selected: boolean; onSelect: () => void; label: string };
}) {
  const usingCustom = Boolean(custom?.value);
  return (
    <div className={styles.swatches} role="radiogroup" aria-label={label}>
      {none && (
        <button type="button" role="radio" className={`${styles.swatch} ${styles.swatchNone} ${none.selected ? styles.swatchSelected : ""}`} onClick={none.onSelect} aria-label={none.label} aria-checked={none.selected} title={none.label} />
      )}
      {colors.map((color, index) => {
        const active = !usingCustom && !none?.selected && index === selected;
        return (
          <button
            type="button"
            role="radio"
            key={`${label}-${color}`}
            className={`${styles.swatch} ${active ? styles.swatchSelected : ""}`}
            style={{ "--swatch": color } as CSSProperties}
            onClick={() => onSelect(index)}
            aria-label={`${label}: ${names?.[index] ?? `opção ${index + 1}`}`}
            aria-checked={active}
            title={names?.[index]}
          />
        );
      })}
      {custom && (
        <label className={`${styles.swatch} ${styles.swatchCustom} ${usingCustom ? styles.swatchSelected : ""}`} title="Cor personalizada" style={{ "--swatch": custom.value ?? custom.fallback } as CSSProperties}>
          <input type="color" value={custom.value ?? custom.fallback} onChange={(event) => custom.onChange(event.target.value)} aria-label={`${label}: cor personalizada`} />
          <span className={styles.srOnly}>COR PERSONALIZADA</span>
        </label>
      )}
      {custom?.value && (
        <button type="button" className={styles.resetCustom} onClick={custom.onReset}>
          Usar paleta
        </button>
      )}
    </div>
  );
}

function Segmented({ names, selected, onSelect, label }: { names: string[]; selected: number; onSelect: (index: number) => void; label: string }) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {names.map((name, index) => (
        <button type="button" key={name} role="radio" aria-checked={selected === index} className={selected === index ? styles.segmentedActive : ""} onClick={() => onSelect(index)}>
          {name}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uniformes de teste (só visual, antes do clube existir)

const KIT_PREVIEWS: Array<Kit & { label: string }> = [
  { label: "Neutro", primary: "#f2f5ed", secondary: "#717b75", pattern: 1 },
  { label: "Rubro-negro", primary: "#c8102e", secondary: "#151515", pattern: 2 },
  { label: "Alviverde", primary: "#0d7a3e", secondary: "#ffffff", pattern: 1 },
  { label: "Canarinho", primary: "#ffd21f", secondary: "#0b7d3b", pattern: 6 },
  { label: "Celeste", primary: "#62b5e5", secondary: "#ffffff", pattern: 2 },
  { label: "Tricolor", primary: "#a3001b", secondary: "#ffffff", pattern: 4 },
  { label: "Alvinegro", primary: "#121212", secondary: "#f4f4f4", pattern: 2 },
  { label: "Azulão", primary: "#123c96", secondary: "#f4c430", pattern: 0 },
];

// ---------------------------------------------------------------------------
// Estúdio

type History = { stack: PlayerAppearance[]; index: number; lastKey: string; lastAt: number };

export default function PlayerAppearanceEditor({
  value: rawValue,
  onChange,
  playerName,
  number,
  position,
  primary,
  secondary,
  kitPattern,
  kitPreview = false,
  footer,
  className,
}: {
  value: PlayerAppearance;
  onChange: (value: PlayerAppearance) => void;
  playerName: string;
  number: number;
  position?: string;
  primary?: string;
  secondary?: string;
  kitPattern?: number;
  /** Permite testar cores de uniforme (o real acompanha o clube). */
  kitPreview?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  const value = useMemo(() => normalizePlayerAppearance(rawValue), [rawValue]);
  const [tab, setTab] = useState<TabId>("rosto");
  const [hairGroup, setHairGroup] = useState("todos");
  const [stageMode, setStageMode] = useState<"body" | "head">("body");
  const [previewKit, setPreviewKit] = useState(0);
  const [pop, setPop] = useState(0);
  const [history, setHistory] = useState<History>(() => ({ stack: [value], index: 0, lastKey: "", lastAt: 0 }));
  const panelRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pop || prefersReducedMotion()) return;
    figureRef.current?.animate?.(
      [{ transform: "scale(.965) translateY(4px)" }, { transform: "scale(1.012)" }, { transform: "scale(1)" }],
      { duration: 260, easing: "cubic-bezier(.2,.9,.3,1)" },
    );
  }, [pop]);

  const kit: Kit = useMemo(() => {
    if (primary && secondary) return { primary, secondary, pattern: kitPattern ?? value.kitPattern };
    if (kitPreview) return KIT_PREVIEWS[previewKit] ?? KIT_PREVIEWS[0];
    return { primary: "#f2f5ed", secondary: "#717b75", pattern: kitPattern ?? 1 };
  }, [kitPattern, kitPreview, previewKit, primary, secondary, value.kitPattern]);
  const thumbValue = useDeferredValue(value);
  const thumbKit = useDeferredValue(kit);
  const displayNumber = number || 10;

  const commit = useCallback(
    (next: PlayerAppearance, key: string) => {
      const now = Date.now();
      setHistory((current) => {
        const coalesce = key.startsWith("custom") && key === current.lastKey && now - current.lastAt < 600;
        const stack = current.stack.slice(0, current.index + 1);
        if (coalesce) stack[stack.length - 1] = next;
        else stack.push(next);
        while (stack.length > 60) stack.shift();
        return { stack, index: stack.length - 1, lastKey: key, lastAt: now };
      });
      if (!key.startsWith("custom")) setPop((count) => count + 1);
      onChange(next);
    },
    [onChange],
  );

  const set = useCallback(
    <K extends keyof PlayerAppearance>(key: K, fieldValue: PlayerAppearance[K]) => commit({ ...value, [key]: fieldValue }, String(key)),
    [commit, value],
  );

  const travel = useCallback(
    (direction: -1 | 1) => {
      const index = history.index + direction;
      const target = history.stack[index];
      if (!target) return;
      setHistory({ ...history, index, lastKey: "" });
      setPop((count) => count + 1);
      onChange(target);
    },
    [history, onChange],
  );

  const randomizeAll = () => commit(randomStudioAppearance(value), "random");
  const randomizeTab = () => {
    const random = randomStudioAppearance(value);
    const next: Record<string, unknown> = { ...value };
    for (const field of TAB_FIELDS[tab]) next[field] = random[field];
    commit(next as PlayerAppearance, `random-${tab}`);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
    if ((event.target as HTMLElement).tagName === "INPUT") return;
    event.preventDefault();
    travel(event.shiftKey ? 1 : -1);
  };

  const chooseTab = (next: TabId) => {
    setTab(next);
    panelRef.current?.scrollTo({ top: 0 });
  };

  const variant = (patch: Partial<PlayerAppearance>) => ({ ...thumbValue, ...patch });
  const hairStyles = hairGroup === "todos" ? HAIR_STYLE_NAMES.map((_, index) => index) : HAIR_STYLE_GROUPS.find((group) => group.id === hairGroup)?.styles ?? [];
  const tipName = value.hairTip ? HAIR_TIP_NAMES[value.hairTip - 1] : "Sem mechas";
  const canUndo = history.index > 0;
  const canRedo = history.index < history.stack.length - 1;

  return (
    <section className={`${styles.studio} ${className ?? ""}`} onKeyDown={onKeyDown}>
      <div className={styles.stage}>
        <div className={styles.stageBackdrop} aria-hidden="true">
          <b className={styles.stageNumber}>{displayNumber}</b>
          <i className={styles.stageFloor} />
        </div>
        <header className={styles.stageTop}>
          <div className={styles.plate}>
            <b>{displayNumber}</b>
            <span>
              <strong>{playerName || "Seu jogador"}</strong>
              {position && <small>{position}</small>}
            </span>
          </div>
          <div className={styles.stageActions}>
            <button type="button" onClick={() => travel(-1)} disabled={!canUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">
              <Icon size={18}><path d="M9 7 4.5 11.5 9 16" /><path d="M5 11.5h9a5 5 0 0 1 0 10h-2" /></Icon>
            </button>
            <button type="button" onClick={() => travel(1)} disabled={!canRedo} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">
              <Icon size={18}><path d="m15 7 4.5 4.5L15 16" /><path d="M19 11.5h-9a5 5 0 0 0 0 10h2" /></Icon>
            </button>
            <button type="button" className={styles.diceButton} onClick={randomizeAll} aria-label="Sortear visual completo" title="Sortear tudo">
              <Icon size={18}><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" strokeWidth={2.6} /></Icon>
              <span>Sortear</span>
            </button>
          </div>
        </header>

        <div className={styles.viewToggle} role="radiogroup" aria-label="Enquadramento">
          <button type="button" role="radio" aria-checked={stageMode === "body"} className={stageMode === "body" ? styles.viewActive : ""} onClick={() => setStageMode("body")}>Corpo</button>
          <button type="button" role="radio" aria-checked={stageMode === "head"} className={stageMode === "head" ? styles.viewActive : ""} onClick={() => setStageMode("head")}>Close</button>
        </div>

        <div className={styles.figure} ref={figureRef}>
          <CharacterCanvas appearance={value} kit={kit} number={displayNumber} mode={stageMode === "head" ? "portrait" : "body"} animate className={styles.figureCanvas} label={`Prévia de ${playerName || "seu jogador"}`} />
        </div>

        <aside className={styles.botaoCard} aria-label="Prévia do botão">
          <div className={styles.botaoFelt}>
            <BotaoPieceCanvas appearance={value} kit={kit} number={displayNumber} zoom="close" withBall className={styles.botaoCanvas} />
          </div>
          <div className={styles.botaoMeta}>
            <small>SEU BOTÃO</small>
            <span className={styles.botaoReal}>
              <BotaoPieceCanvas appearance={value} kit={kit} number={displayNumber} zoom="real" className={styles.botaoRealCanvas} />
              <em>tamanho real</em>
            </span>
          </div>
        </aside>

        {kitPreview && !primary && (
          <div className={styles.kitPicker} role="radiogroup" aria-label="Testar uniforme">
            <small>TESTAR UNIFORME</small>
            <div>
              {KIT_PREVIEWS.map((item, index) => (
                <button
                  type="button"
                  key={item.label}
                  role="radio"
                  aria-checked={previewKit === index}
                  aria-label={item.label}
                  title={item.label}
                  className={previewKit === index ? styles.kitActive : ""}
                  style={{ "--kit-a": item.primary, "--kit-b": item.secondary } as CSSProperties}
                  onClick={() => setPreviewKit(index)}
                />
              ))}
            </div>
          </div>
        )}
        {kitPreview && !primary && (
          <button
            type="button"
            className={styles.kitCycle}
            onClick={() => setPreviewKit((index) => (index + 1) % KIT_PREVIEWS.length)}
            aria-label={`Testar uniforme: ${KIT_PREVIEWS[previewKit].label}. Toque para trocar`}
          >
            <i style={{ "--kit-a": KIT_PREVIEWS[previewKit].primary, "--kit-b": KIT_PREVIEWS[previewKit].secondary } as CSSProperties} />
            <span>{KIT_PREVIEWS[previewKit].label}</span>
            <b aria-hidden="true">›</b>
          </button>
        )}
      </div>

      <div className={styles.panel}>
        <nav className={styles.tabs} role="tablist" aria-label="Categorias de personalização">
          {TABS.map((item) => (
            <button type="button" key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? styles.tabActive : ""} onClick={() => chooseTab(item.id)}>
              <Icon>{TAB_ICONS[item.id]}</Icon>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.panelBody} ref={panelRef} role="tabpanel">
          <div className={styles.panelHeading}>
            <div>
              <small>VESTIÁRIO</small>
              <h2>{TABS.find((item) => item.id === tab)?.label}</h2>
            </div>
            <button type="button" onClick={randomizeTab} className={styles.tabDice}>
              <Icon size={16}><path d="M4 7h3.5l9 10H20" /><path d="M4 17h3.5l2.6-2.9M13.9 9.9 16.5 7H20" /><path d="m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5l2.5 2.5-2.5 2.5" /></Icon>
              Sortear aba
            </button>
          </div>

          {tab === "rosto" && (
            <>
              <Group title="Tom de pele" value={value.customSkinColor ? "Personalizado" : `Tom ${value.skin + 1}`}>
                <Swatches
                  label="Tom de pele"
                  colors={SKIN_COLORS}
                  selected={value.skin}
                  onSelect={(skin) => commit({ ...value, skin, customSkinColor: undefined }, "skin")}
                  custom={{ value: value.customSkinColor, fallback: SKIN_COLORS[value.skin], onChange: (color) => commit({ ...value, customSkinColor: color }, "custom-skin"), onReset: () => set("customSkinColor", undefined) }}
                />
              </Group>
              <Group title="Formato do rosto" value={FACE_SHAPE_NAMES[value.faceShape]}>
                <OptionGrid label="Formato do rosto" names={FACE_SHAPE_NAMES} selected={value.faceShape} render={(faceShape) => variant({ faceShape })} onSelect={(faceShape) => set("faceShape", faceShape)} mode="head" kit={thumbKit} />
              </Group>
              <Group title="Olhos" value={EYE_SHAPE_NAMES[value.eyeShape]}>
                <OptionGrid label="Formato dos olhos" names={EYE_SHAPE_NAMES} selected={value.eyeShape} render={(eyeShape) => variant({ eyeShape })} onSelect={(eyeShape) => set("eyeShape", eyeShape)} mode="face" kit={thumbKit} size="sm" />
                <Swatches
                  label="Cor dos olhos"
                  colors={EYE_COLORS}
                  selected={value.eyeColor}
                  onSelect={(eyeColor) => commit({ ...value, eyeColor, customEyeColor: undefined }, "eyeColor")}
                  custom={{ value: value.customEyeColor, fallback: EYE_COLORS[value.eyeColor], onChange: (color) => commit({ ...value, customEyeColor: color }, "custom-eyes"), onReset: () => set("customEyeColor", undefined) }}
                />
              </Group>
              <Group title="Sobrancelhas" value={BROW_NAMES[value.brow]}>
                <OptionGrid label="Sobrancelhas" names={BROW_NAMES} selected={value.brow} render={(brow) => variant({ brow })} onSelect={(brow) => set("brow", brow)} mode="face" kit={thumbKit} size="sm" />
              </Group>
              <Group title="Nariz" value={NOSE_NAMES[value.nose]}>
                <OptionGrid label="Nariz" names={NOSE_NAMES} selected={value.nose} render={(nose) => variant({ nose })} onSelect={(nose) => set("nose", nose)} mode="face" kit={thumbKit} size="sm" />
              </Group>
              <Group title="Orelhas" value={EAR_NAMES[value.ears]}>
                <Segmented label="Orelhas" names={EAR_NAMES} selected={value.ears} onSelect={(ears) => set("ears", ears)} />
              </Group>
              <Group title="Marcas e pinturas" value={MARK_NAMES[value.marks]}>
                <OptionGrid label="Marcas e pinturas" names={MARK_NAMES} selected={value.marks} render={(marks) => variant({ marks })} onSelect={(marks) => set("marks", marks)} mode="face" kit={thumbKit} size="sm" />
              </Group>
            </>
          )}

          {tab === "cabelo" && (
            <>
              <Group title="Corte" value={HAIR_STYLE_NAMES[value.hairStyle]}>
                <div className={styles.chips} role="radiogroup" aria-label="Filtrar cortes">
                  {[{ id: "todos", label: `Todos · ${HAIR_STYLE_NAMES.length}` }, ...HAIR_STYLE_GROUPS].map((group) => (
                    <button type="button" key={group.id} role="radio" aria-checked={hairGroup === group.id} className={hairGroup === group.id ? styles.chipActive : ""} onClick={() => setHairGroup(group.id)}>
                      {group.label}
                    </button>
                  ))}
                </div>
                <OptionGrid label="Corte de cabelo" names={HAIR_STYLE_NAMES} values={hairStyles} selected={value.hairStyle} render={(hairStyle) => variant({ hairStyle })} onSelect={(hairStyle) => set("hairStyle", hairStyle)} mode="head" kit={thumbKit} />
              </Group>
              <Group title="Cor do cabelo" value={value.customHairColor ? "Personalizada" : undefined}>
                <Swatches
                  label="Cor do cabelo"
                  colors={HAIR_COLORS}
                  selected={value.hairColor}
                  onSelect={(hairColor) => commit({ ...value, hairColor, customHairColor: undefined }, "hairColor")}
                  custom={{ value: value.customHairColor, fallback: HAIR_COLORS[value.hairColor], onChange: (color) => commit({ ...value, customHairColor: color }, "custom-hair"), onReset: () => set("customHairColor", undefined) }}
                />
              </Group>
              <Group title="Mechas e pontas" value={tipName} hint="As pontas ganham um degradê até a cor escolhida.">
                <Swatches
                  label="Mechas"
                  colors={HAIR_TIP_COLORS}
                  names={HAIR_TIP_NAMES}
                  selected={value.hairTip - 1}
                  onSelect={(index) => set("hairTip", index + 1)}
                  none={{ selected: value.hairTip === 0, onSelect: () => set("hairTip", 0), label: "Sem mechas" }}
                />
              </Group>
            </>
          )}

          {tab === "expressao" && (
            <Group title="Cara de jogo" value={FACE_NAMES[value.face]} hint="A expressão aparece no seu botão e nos retratos da carreira.">
              <OptionGrid label="Expressão" names={FACE_NAMES} selected={value.face} render={(face) => variant({ face })} onSelect={(face) => set("face", face)} mode="face" kit={thumbKit} />
            </Group>
          )}

          {tab === "barba" && (
            <Group title="Barba e bigode" value={BEARD_NAMES[value.beard]} hint="A cor acompanha a do cabelo.">
              <OptionGrid label="Barba e bigode" names={BEARD_NAMES} selected={value.beard} render={(beard) => variant({ beard })} onSelect={(beard) => set("beard", beard)} mode="face" kit={thumbKit} />
            </Group>
          )}

          {tab === "corpo" && (
            <>
              <Group title="Biotipo" value={BUILD_NAMES[value.build]}>
                <OptionGrid label="Biotipo" names={BUILD_NAMES} selected={value.build} render={(build) => variant({ build, pose: 0 })} onSelect={(build) => set("build", build)} mode="body" kit={thumbKit} size="lg" />
              </Group>
              <Group title="Altura" value={HEIGHT_NAMES[value.height]}>
                <Segmented label="Altura" names={HEIGHT_NAMES} selected={value.height} onSelect={(height) => set("height", height)} />
              </Group>
              <Group title="Pose" value={POSE_NAMES[value.pose]} hint="A pose aparece na sua ficha de corpo inteiro.">
                <OptionGrid label="Pose" names={POSE_NAMES} selected={value.pose} render={(pose) => variant({ pose })} onSelect={(pose) => set("pose", pose)} mode="body" kit={thumbKit} size="lg" />
              </Group>
              <Group title="Tatuagem" value={TATTOO_NAMES[value.tattoo]}>
                <OptionGrid label="Tatuagem" names={TATTOO_NAMES} selected={value.tattoo} render={(tattoo) => variant({ tattoo, pose: 1 })} onSelect={(tattoo) => set("tattoo", tattoo)} mode="body" kit={thumbKit} size="lg" />
              </Group>
            </>
          )}

          {tab === "estilo" && (
            <>
              <Group title="Na cabeça" value={HEADWEAR_NAMES[value.headwear]}>
                <OptionGrid label="Acessório de cabeça" names={HEADWEAR_NAMES} selected={value.headwear} render={(headwear) => variant({ headwear })} onSelect={(headwear) => set("headwear", headwear)} mode="head" kit={thumbKit} />
              </Group>
              <Group title="Óculos" value={GLASSES_NAMES[value.glasses]}>
                <OptionGrid label="Óculos" names={GLASSES_NAMES} selected={value.glasses} render={(glasses) => variant({ glasses })} onSelect={(glasses) => set("glasses", glasses)} mode="face" kit={thumbKit} />
              </Group>
              <Group title="Brincos" value={EARRING_NAMES[value.earrings]} hint={EAR_COVERING_HAIR.has(value.hairStyle) ? "Seu corte cobre as orelhas: os brincos ficam escondidos." : undefined}>
                <OptionGrid label="Brincos" names={EARRING_NAMES} selected={value.earrings} render={(earrings) => variant({ earrings, hairStyle: EAR_COVERING_HAIR.has(thumbValue.hairStyle) ? 3 : thumbValue.hairStyle })} onSelect={(earrings) => set("earrings", earrings)} mode="head" kit={thumbKit} />
              </Group>
              <Group title="Cor dos acessórios" hint="Vale para faixa, bandana, munhequeira, luvas e pintura.">
                <Swatches label="Cor dos acessórios" colors={ACCESSORY_COLORS} selected={value.accessoryColor} onSelect={(accessoryColor) => set("accessoryColor", accessoryColor)} />
              </Group>
              <Group title="Munhequeira" value={WRISTBAND_NAMES[value.wristband]}>
                <Segmented label="Munhequeira" names={WRISTBAND_NAMES} selected={value.wristband} onSelect={(wristband) => set("wristband", wristband)} />
              </Group>
              <Group title="Chuteira" value={BOOT_NAMES[value.boots]}>
                <Swatches label="Chuteira" colors={BOOT_COLORS} names={BOOT_NAMES} selected={value.boots} onSelect={(boots) => set("boots", boots)} />
              </Group>
              <Group title="Meião" value={SOCK_NAMES[value.socks]}>
                <Segmented label="Meião" names={SOCK_NAMES} selected={value.socks} onSelect={(socks) => set("socks", socks)} />
              </Group>
              <Group title="Luvas" value={GLOVE_NAMES[value.gloves]}>
                <Segmented label="Luvas" names={GLOVE_NAMES} selected={value.gloves} onSelect={(gloves) => set("gloves", gloves)} />
              </Group>
            </>
          )}
        </div>

        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Retrato (busto em disco) usado em listas, elencos e mesa

export function PlayerAppearancePortrait({
  appearance,
  primary,
  secondary,
  size = 280,
  label = "Personagem",
  frame = "standard",
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  size?: number;
  label?: string;
  frame?: "standard" | "compact";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resolution = Math.min(560, Math.max(96, Math.round(Math.max(size, 112) * 2)));

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const compactFrame = frame === "compact";
    const unit = canvas.width / 280;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.scale(unit, unit);
    const portraitRadius = compactFrame ? 132 : 112;
    const frameRadius = compactFrame ? 134 : 115;
    if (!compactFrame) {
      context.fillStyle = "rgba(0,0,0,.38)";
      context.beginPath();
      context.ellipse(4, 12, 118, 112, 0, 0, Math.PI * 2);
      context.fill();
    }
    drawCharacterBust(context, appearance, primary, secondary, portraitRadius);
    context.strokeStyle = "#f4c430";
    context.lineWidth = compactFrame ? 3 : 7;
    context.beginPath();
    context.arc(0, 0, frameRadius - (compactFrame ? 1.5 : 0), 0, Math.PI * 2);
    context.stroke();
  }, [appearance, frame, primary, secondary, resolution]);

  return <canvas ref={canvasRef} width={resolution} height={resolution} style={{ width: size, height: size }} aria-label={label} />;
}

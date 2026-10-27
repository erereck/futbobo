"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import PlayerAppearance3D from "./PlayerAppearance3D";
import { readBotao3dPreference, webglAvailable } from "./botao/view-mode";
import {
  ACCESSORY_COLORS,
  BEARD_NAMES,
  BOOT_OPTIONS,
  BROW_NAMES,
  CELEBRATION_OPTIONS,
  EARRING_NAMES,
  EYEWEAR_NAMES,
  EYE_COLORS,
  FACE_MARK_NAMES,
  FACE_NAMES,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  HEADWEAR_NAMES,
  SKIN_COLORS,
  drawPlayerBust,
  randomPlayerAppearance,
  type PlayerAppearance,
} from "./player-appearance";

type EditorTab = "rosto" | "cabelo" | "acessorios" | "campo";
type PickerKey = "hairStyle" | "beard" | "face" | "brow" | "headwear" | "eyewear" | "earrings" | "faceMark" | "celebration";

const EDITOR_TABS: ReadonlyArray<{ id: EditorTab; label: string; only3d?: boolean }> = [
  { id: "rosto", label: "Rosto" },
  { id: "cabelo", label: "Cabelo" },
  { id: "acessorios", label: "Acessórios" },
  { id: "campo", label: "Em campo", only3d: true },
];

const CELEBRATION_NAMES = CELEBRATION_OPTIONS.map((option) => option.name);
/** A chuteira automática muda com a camisa: o círculo mostra várias cores de uma vez. */
const AUTO_BOOT_SWATCH = "conic-gradient(#ff5a36, #ffd23f, #2fd38a, #2f7bff, #7b3fd1, #ff4fa3, #ff5a36)";

/** Faixa, tiara, bandana, boné, óculos esportivo e pintura de guerra são pintados com essa cor. */
function usesAccessoryColor(appearance: PlayerAppearance) {
  return (appearance.headwear ?? 0) > 0 || appearance.eyewear === 1 || appearance.faceMark === 5;
}

function cycle(value: number, length: number, direction: number) {
  return (value + direction + length) % length;
}

function Badge3D() {
  return <i className="appearance-badge-3d">3D</i>;
}

function ChoiceControl({
  label,
  options,
  selected,
  onSelect,
  open,
  onToggle,
  listId,
  badge,
  hint,
}: {
  label: string;
  options: readonly string[];
  selected: number;
  onSelect: (index: number) => void;
  open: boolean;
  onToggle: (open: boolean) => void;
  listId: string;
  badge?: ReactNode;
  hint?: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const count = options.length;
  const current = Math.max(0, Math.min(count - 1, selected));

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const option = list?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!list || !option) return;
    // Rola só a lista (nunca a página) até a opção atual e já deixa as setas prontas nela.
    list.scrollTop = Math.max(0, option.offsetTop - (list.clientHeight - option.offsetHeight) / 2);
    option.focus({ preventScroll: true });
  }, [open]);

  function handleListKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onToggle(false);
      triggerRef.current?.focus();
      return;
    }
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || items.length === 0) return;
    // A grade muda de colunas com a largura: conta quantas opções dividem a primeira linha.
    const columns = Math.max(1, items.filter((item) => item.offsetTop === items[0].offsetTop).length);
    const target = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + columns,
      ArrowUp: index - columns,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, target))].focus();
  }

  return (
    <>
      <div className={`appearance-choice${open ? " open" : ""}`}>
        <span>{label}{badge && <> {badge}</>}<small>{current + 1}/{count}</small></span>
        <div>
          <button type="button" onClick={() => onSelect(cycle(current, count, -1))} aria-label={`Anterior em ${label}`}>‹</button>
          <button
            ref={triggerRef}
            type="button"
            className="appearance-choice-value"
            onClick={() => onToggle(!open)}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-label={`${label}: ${options[current]}. ${open ? "Fechar lista" : "Ver todas as opções"}`}
          >
            <strong>{options[current]}</strong>
            <b aria-hidden="true">{open ? "▴" : "▾"}</b>
          </button>
          <button type="button" onClick={() => onSelect(cycle(current, count, 1))} aria-label={`Próximo em ${label}`}>›</button>
        </div>
        {hint && <small className="appearance-hint">{hint}</small>}
      </div>
      {open && (
        <div ref={listRef} id={listId} className="appearance-option-list" role="listbox" aria-label={label} onKeyDown={handleListKeys}>
          {options.map((name, index) => (
            <button
              type="button"
              role="option"
              key={`${index}-${name}`}
              aria-selected={index === current}
              tabIndex={index === current ? 0 : -1}
              onClick={() => onSelect(index)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function PaletteControl({
  label,
  colors,
  selected,
  onSelect,
}: {
  label: string;
  colors: readonly string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="appearance-palette">
      <span>{label}</span>
      <div>
        {colors.map((color, index) => (
          <button
            type="button"
            key={`${label}-${color}-${index}`}
            className={index === selected ? "selected" : ""}
            style={{ "--appearance-swatch": color } as CSSProperties}
            onClick={() => onSelect(index)}
            aria-label={`${label} ${index + 1}`}
            aria-pressed={index === selected}
          />
        ))}
      </div>
    </div>
  );
}

function BootsControl({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  const current = BOOT_OPTIONS[selected] ?? BOOT_OPTIONS[0];
  return (
    <div className="appearance-palette appearance-boots">
      <span>Chuteira <Badge3D /></span>
      <div>
        {BOOT_OPTIONS.map((boot, index) => (
          <button
            type="button"
            key={boot.name}
            className={[index === selected ? "selected" : "", boot.color ? "" : "appearance-swatch-auto"].filter(Boolean).join(" ")}
            style={{ "--appearance-swatch": boot.color ?? AUTO_BOOT_SWATCH } as CSSProperties}
            onClick={() => onSelect(index)}
            aria-label={`Chuteira ${boot.name}`}
            aria-pressed={index === selected}
            title={boot.name}
          />
        ))}
      </div>
      <small className="appearance-hint"><b>{current.color ? current.name : "Auto · combina com a camisa"}</b> · aparece no Modo 3D</small>
    </div>
  );
}

function CustomColorControl({
  label,
  value,
  fallback,
  onChange,
  onReset,
}: {
  label: string;
  value?: string;
  fallback: string;
  onChange: (color: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="appearance-custom-color">
      <label>
        <input type="color" value={value ?? fallback} onChange={(event) => onChange(event.target.value)} />
        <span><small>COR PERSONALIZADA</small><strong>{label}</strong></span>
      </label>
      {value && <button type="button" onClick={onReset}>Usar paleta</button>}
    </div>
  );
}

export default function PlayerAppearanceEditor({
  value,
  onChange,
  playerName,
  number,
  primary = "#f2f5ed",
  secondary = "#717b75",
  kitPattern,
  compact = false,
  previewExtras,
}: {
  value: PlayerAppearance;
  onChange: (value: PlayerAppearance) => void;
  playerName: string;
  number: number;
  primary?: string;
  secondary?: string;
  kitPattern?: number;
  compact?: boolean;
  previewExtras?: ReactNode;
}) {
  // Com o Modo 3D ligado nas Configurações, a prévia vira o boneco de campo.
  const [preview3d, setPreview3d] = useState(false);
  useEffect(() => {
    if (!readBotao3dPreference() || !webglAvailable()) return;
    queueMicrotask(() => setPreview3d(true));
  }, []);

  const [tab, setTab] = useState<EditorTab>("rosto");
  const [openPicker, setOpenPicker] = useState<PickerKey | null>(null);
  const tabRefs = useRef<Partial<Record<EditorTab, HTMLButtonElement | null>>>({});
  const baseId = useId();

  function patch(changes: Partial<PlayerAppearance>) {
    onChange({ ...value, ...changes });
  }

  function selectTab(next: EditorTab, focus = false) {
    setTab(next);
    setOpenPicker(null);
    if (focus) tabRefs.current[next]?.focus();
  }

  function handleTabKeys(event: KeyboardEvent<HTMLDivElement>) {
    const index = EDITOR_TABS.findIndex((item) => item.id === tab);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: EDITOR_TABS.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    selectTab(EDITOR_TABS[(target + EDITOR_TABS.length) % EDITOR_TABS.length].id, true);
  }

  // Uma lista aberta por vez: abrir outra fecha a anterior.
  function choice(key: PickerKey, label: string, options: readonly string[], extra?: { badge?: ReactNode; hint?: ReactNode }) {
    return (
      <ChoiceControl
        label={label}
        options={options}
        selected={value[key] ?? 0}
        onSelect={(index) => onChange({ ...value, [key]: index })}
        open={openPicker === key}
        onToggle={(open) => setOpenPicker(open ? key : null)}
        listId={`${baseId}-${key}`}
        badge={extra?.badge}
        hint={extra?.hint}
      />
    );
  }

  const previewAppearance = kitPattern === undefined ? value : { ...value, kitPattern };
  const previewLabel = `Prévia do personagem de ${playerName || "seu jogador"}`;
  const portrait = <PlayerAppearancePortrait appearance={previewAppearance} primary={primary} secondary={secondary} size={280} label={previewLabel} />;

  return (
    <section className={`appearance-editor ${compact ? "appearance-editor-compact" : ""}`}>
      <div className="appearance-preview">
        <div className="appearance-preview-meta"><span>{preview3d ? "IDENTIDADE EM CAMPO · 3D" : "IDENTIDADE EM CAMPO"}</span><b>#{number || 10}</b></div>
        {preview3d ? (
          <PlayerAppearance3D appearance={previewAppearance} primary={primary} secondary={secondary} number={number || 10} label={previewLabel} fallback={portrait} />
        ) : portrait}
        <strong>{playerName || "Seu jogador"}</strong>
        <small>O uniforme acompanha automaticamente o clube.</small>
        {/* O sorteio refaz o rosto; chuteira e comemoração são escolha de jogo e ficam. */}
        <button type="button" className="appearance-random" onClick={() => onChange({ ...randomPlayerAppearance(), boots: value.boots, celebration: value.celebration })}>⚄ Sortear visual</button>
        {previewExtras && <div className="appearance-preview-extras">{previewExtras}</div>}
      </div>

      <div className="appearance-controls">
        <div className="appearance-tabs" role="tablist" aria-label="Partes do visual" onKeyDown={handleTabKeys}>
          {EDITOR_TABS.map((item) => (
            <button
              key={item.id}
              ref={(node) => { tabRefs.current[item.id] = node; }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`${baseId}-painel`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => selectTab(item.id)}
            >
              {item.label}{item.only3d && <> <Badge3D /></>}
            </button>
          ))}
        </div>

        <div className="appearance-tab-panel" role="tabpanel" id={`${baseId}-painel`} aria-labelledby={`${baseId}-tab-${tab}`}>
          {tab === "rosto" && (
            <>
              <PaletteControl label="Tom de pele" colors={SKIN_COLORS} selected={value.skin} onSelect={(skin) => patch({ skin, customSkinColor: undefined })} />
              <PaletteControl label="Olhos" colors={EYE_COLORS} selected={value.eyeColor} onSelect={(eyeColor) => patch({ eyeColor, customEyeColor: undefined })} />
              <div className="appearance-custom-grid">
                <CustomColorControl label="Pele" value={value.customSkinColor} fallback={SKIN_COLORS[value.skin]} onChange={(customSkinColor) => patch({ customSkinColor })} onReset={() => patch({ customSkinColor: undefined })} />
                <CustomColorControl label="Olhos" value={value.customEyeColor} fallback={EYE_COLORS[value.eyeColor]} onChange={(customEyeColor) => patch({ customEyeColor })} onReset={() => patch({ customEyeColor: undefined })} />
              </div>
              <div className="appearance-choice-grid">
                {choice("face", "Expressão", FACE_NAMES)}
                {choice("brow", "Sobrancelha", BROW_NAMES)}
              </div>
            </>
          )}

          {tab === "cabelo" && (
            <>
              <div className="appearance-choice-grid">
                {choice("hairStyle", "Corte", HAIR_STYLE_NAMES)}
                {choice("beard", "Barba", BEARD_NAMES)}
              </div>
              <PaletteControl label="Cor do cabelo" colors={HAIR_COLORS} selected={value.hairColor} onSelect={(hairColor) => patch({ hairColor, customHairColor: undefined })} />
              <div className="appearance-custom-grid">
                <CustomColorControl label="Cabelo" value={value.customHairColor} fallback={HAIR_COLORS[value.hairColor]} onChange={(customHairColor) => patch({ customHairColor })} onReset={() => patch({ customHairColor: undefined })} />
              </div>
            </>
          )}

          {tab === "acessorios" && (
            <>
              <div className="appearance-choice-grid">
                {choice("headwear", "Acessório", HEADWEAR_NAMES)}
                {choice("eyewear", "Óculos", EYEWEAR_NAMES)}
                {choice("earrings", "Brincos", EARRING_NAMES)}
                {choice("faceMark", "Marcas", FACE_MARK_NAMES)}
              </div>
              {usesAccessoryColor(value) && (
                <PaletteControl label="Cor do acessório" colors={ACCESSORY_COLORS} selected={value.accessoryColor ?? 0} onSelect={(accessoryColor) => patch({ accessoryColor })} />
              )}
            </>
          )}

          {tab === "campo" && (
            <>
              <BootsControl selected={value.boots ?? 0} onSelect={(boots) => patch({ boots })} />
              <div className="appearance-choice-grid appearance-choice-solo">
                {choice("celebration", "Comemoração", CELEBRATION_NAMES, { badge: <Badge3D />, hint: "Quando você marca · aparece no Modo 3D" })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

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

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const compactFrame = frame === "compact";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2 + (compactFrame ? 0 : -5));
    const portraitRadius = compactFrame ? 128 : 108;
    const frameRadius = compactFrame ? 132 : 111;
    const frameWidth = compactFrame ? 3 : 7;
    context.fillStyle = "rgba(0,0,0,.38)";
    context.beginPath(); context.ellipse(5, 15, 113, 94, 0, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(0, 0, portraitRadius, 0, Math.PI * 2); context.fillStyle = primary; context.fill();
    drawPlayerBust(context, appearance, primary, secondary, portraitRadius, compactFrame ? -8 : 0);
    context.strokeStyle = "#f4c430"; context.lineWidth = frameWidth; context.beginPath(); context.arc(0, 0, frameRadius, 0, Math.PI * 2); context.stroke();
    context.restore();
  }, [appearance, frame, primary, secondary]);

  return <canvas ref={canvasRef} width={280} height={280} style={{ width: size, height: size }} aria-label={label} />;
}

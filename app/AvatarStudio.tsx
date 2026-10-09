"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BEARD_NAMES, BOOT_COLORS, BUILD_NAMES, DETAIL_NAMES, EYE_COLORS, FACE_NAMES,
  GLASSES_NAMES, HAIR_COLORS, HAIR_STYLE_NAMES, HEADWEAR_NAMES, KIT_PATTERN_NAMES,
  SKIN_COLORS, SLEEVES_NAMES, SOCKS_NAMES, STATURE_NAMES,
  drawPlayerBust, drawPlayerFullBody, normalizePlayerAppearance, randomPlayerAppearance,
  type PlayerAppearance,
} from "./player-appearance";
import "./avatar-studio.css";

type TabId = "hair" | "face" | "body" | "kit";
type NumberField = "hairStyle" | "beard" | "face" | "brow" | "build" | "stature" | "glasses" | "facialDetail" | "headwear" | "sleeves" | "socks" | "boots" | "kitPattern";
type ColorField = "skin" | "hairColor" | "eyeColor";
type CustomColorField = "customSkinColor" | "customHairColor" | "customEyeColor" | "customShortsColor";

const TABS: Array<{ id: TabId; icon: string; label: string; caption: string }> = [
  { id: "hair", icon: "✂", label: "Cabelo", caption: "Cortes e cores" },
  { id: "face", icon: "◉", label: "Rosto", caption: "Sua identidade" },
  { id: "body", icon: "↕", label: "Corpo", caption: "Porte físico" },
  { id: "kit", icon: "◈", label: "Uniforme", caption: "Estilo em campo" },
];
const PRESETS: Array<{ title: string; detail: string; fields: Partial<PlayerAppearance> }> = [
  { title: "O prodígio", detail: "Cabelo moderno", fields: { hairStyle: 18, hairColor: 0, face: 1, beard: 0, build: 0, glasses: 0 } },
  { title: "O veterano", detail: "Experiência", fields: { hairStyle: 7, face: 0, beard: 4, build: 2, stature: 1, glasses: 0 } },
  { title: "O camisa 10", detail: "Ídolo da torcida", fields: { hairStyle: 13, face: 2, beard: 1, build: 1, headwear: 1 } },
  { title: "A lenda", detail: "Personalidade", fields: { hairStyle: 4, face: 1, beard: 2, build: 3, stature: 2, headwear: 0 } },
];

function CharacterCanvas({
  appearance, primary, secondary, number, variant, className,
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  number: number;
  variant: "full" | "button" | "mini";
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    if (variant === "full") {
      drawPlayerFullBody(ctx, appearance, primary, secondary, number);
      return;
    }
    ctx.clearRect(0, 0, element.width, element.height);
    ctx.save();
    const mini = variant === "mini";
    const radius = mini ? 30 : 81;
    ctx.translate(mini ? 42 : 110, mini ? 41 : 108);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(2, 5, radius + 6, radius, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = primary;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
    drawPlayerBust(ctx, appearance, primary, secondary, radius);
    ctx.strokeStyle = "#f4c430"; ctx.lineWidth = mini ? 2 : 5;
    ctx.beginPath(); ctx.arc(0, 0, radius + (mini ? 1 : 3), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }, [appearance, primary, secondary, number, variant]);
  return (
    <canvas
      ref={canvas}
      className={className}
      width={variant === "full" ? 360 : variant === "mini" ? 84 : 220}
      height={variant === "full" ? 530 : variant === "mini" ? 84 : 220}
      role="img"
      aria-label={variant === "full" ? "Boneco completo da cabeça às chuteiras" : "Prévia real do busto no botão de futebol"}
    />
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="avatar-section-heading"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>;
}

function Palette({
  label, colors, selected, onSelect, customValue, onCustom, onReset, id,
}: {
  label: string; colors: string[]; selected: number; onSelect: (index: number) => void;
  customValue?: string; onCustom?: (hex: string) => void; onReset?: () => void; id: string;
}) {
  return (
    <div className="avatar-palette">
      <SectionHeading title={label} />
      <div className="avatar-palette-list" role="group" aria-label={label}>
        {colors.map((color, index) => (
          <button type="button" key={id + index} title={label + " " + (index + 1)}
            className={"avatar-swatch" + (selected === index && !customValue ? " is-active" : "")}
            style={{ "--swatch-color": color } as CSSProperties}
            aria-label={label + " " + (index + 1)}
            aria-pressed={selected === index && !customValue}
            onClick={() => onSelect(index)}
          />
        ))}
        {onCustom && <label className={"avatar-custom-picker" + (customValue ? " is-active" : "")} title="Escolher qualquer cor">
          <input type="color" value={customValue ?? colors[selected] ?? "#ffffff"} onChange={(event) => onCustom(event.target.value)} aria-label={label + " personalizada"} />
          <span>+</span>
        </label>}
      </div>
      {customValue && onReset && <button type="button" className="avatar-clear-custom" onClick={onReset}>Cor personalizada: {customValue.toUpperCase()} · Voltar à paleta ×</button>}
    </div>
  );
}

function OptionGrid({
  title, options, selected, onSelect, appearance, primary, secondary, visual = false, columns = 3,
}: {
  title: string; options: string[]; selected: number; onSelect: (index: number) => void;
  appearance?: PlayerAppearance; primary?: string; secondary?: string; visual?: boolean; columns?: number;
}) {
  return (
    <div className="avatar-option-section">
      <SectionHeading title={title} subtitle={options.length + " opções"} />
      <div className={"avatar-option-grid" + (visual ? " is-visual" : "")} style={{ "--avatar-columns": String(columns) } as CSSProperties} role="group" aria-label={title}>
        {options.map((label, index) => (
          <button type="button" key={title + index}
            className={"avatar-option" + (selected === index ? " is-active" : "")}
            onClick={() => onSelect(index)} aria-pressed={selected === index}
            title={label}>
            {visual && appearance && primary && secondary &&
              <CharacterCanvas appearance={{ ...appearance, hairStyle: index }} primary={primary} secondary={secondary} number={10} variant="mini" className="avatar-mini-head" />}
            <span>{label}</span>
            {selected === index && <b aria-hidden="true">✓</b>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AvatarStudio({
  value, onChange, playerName, number, primary = "#f2f5ed", secondary = "#717b75",
  kitPattern, compact = false, previewExtras,
}: {
  value: PlayerAppearance;
  onChange: (appearance: PlayerAppearance) => void;
  playerName: string;
  number: number;
  primary?: string;
  secondary?: string;
  kitPattern?: number;
  compact?: boolean;
  previewExtras?: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("hair");
  const [undo, setUndo] = useState<PlayerAppearance[]>([]);
  const [redo, setRedo] = useState<PlayerAppearance[]>([]);
  const appearance = normalizePlayerAppearance(value);
  const previewAppearance = kitPattern === undefined ? appearance : { ...appearance, kitPattern };
  const headlineName = playerName.trim() || "SEU JOGADOR";

  const remember = (next: PlayerAppearance) => {
    setUndo((history) => [...history.slice(-19), normalizePlayerAppearance(value)]);
    setRedo([]);
    onChange(normalizePlayerAppearance(next));
  };
  const change = (patch: Partial<PlayerAppearance>) => remember({ ...appearance, ...patch });
  const changeNumber = (field: NumberField, newValue: number) => change({ [field]: newValue });
  const changeColor = (field: ColorField, custom: CustomColorField, selected: number) =>
    change({ [field]: selected, [custom]: undefined });
  const undoChange = () => {
    if (!undo.length) return;
    const last = undo[undo.length - 1];
    setUndo((history) => history.slice(0, -1));
    setRedo((history) => [...history, appearance]);
    onChange(last);
  };
  const redoChange = () => {
    if (!redo.length) return;
    const next = redo[redo.length - 1];
    setRedo((history) => history.slice(0, -1));
    setUndo((history) => [...history, appearance]);
    onChange(next);
  };
  const randomize = () => {
    const next = randomPlayerAppearance();
    remember({
      ...next,
      build: Math.floor(Math.random() * 4),
      stature: Math.floor(Math.random() * 3),
      facialDetail: Math.floor(Math.random() * 4),
      glasses: Math.random() < .22 ? 1 + Math.floor(Math.random() * 3) : 0,
      headwear: Math.random() < .18 ? 1 + Math.floor(Math.random() * 3) : 0,
      boots: Math.floor(Math.random() * BOOT_COLORS.length),
      sleeves: Math.floor(Math.random() * 3),
    });
  };
  const exportFigure = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 720; canvas.height = 1060;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawPlayerFullBody(ctx, previewAppearance, primary, secondary, number);
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = "futbobo-" + (playerName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "jogador") + ".png";
    anchor.click();
  };

  return (
    <section className={"avatar-studio" + (compact ? " is-compact" : "")} aria-label="Estúdio de criação do jogador">
      <div className="avatar-stage">
        <div className="avatar-stage-heading">
          <span className="avatar-eyebrow">FUTBOBO / ESTÚDIO DE PERSONAGEM</span>
          <div className="avatar-stage-name"><strong>{headlineName}</strong><span>#{number || 10}</span></div>
          <small>Seu atleta, do gramado até o botão.</small>
        </div>

        <div className="avatar-showcase">
          <div className="avatar-field-lines" aria-hidden="true" />
          <span className="avatar-model-caption"><i /> VISUAL COMPLETO</span>
          <CharacterCanvas appearance={previewAppearance} primary={primary} secondary={secondary} number={number} variant="full" className="avatar-full-body" />
          <div className="avatar-button-preview">
            <span>NO BOTÃO</span>
            <CharacterCanvas appearance={previewAppearance} primary={primary} secondary={secondary} number={number} variant="button" className="avatar-button-canvas" />
            <small>Prévia real em campo</small>
          </div>
          <div className="avatar-showcase-floor" aria-hidden="true" />
        </div>

        <div className="avatar-stage-actions">
          <button type="button" className="avatar-random" onClick={randomize}><span aria-hidden="true">⚄</span> Surpreenda-me</button>
          <button type="button" onClick={undoChange} disabled={!undo.length} title="Desfazer mudança" aria-label="Desfazer mudança">↶</button>
          <button type="button" onClick={redoChange} disabled={!redo.length} title="Refazer mudança" aria-label="Refazer mudança">↷</button>
          <button type="button" onClick={exportFigure} title="Salvar boneco completo em PNG" aria-label="Exportar PNG do jogador">↓ PNG</button>
        </div>
        {previewExtras && <div className="appearance-preview-extras avatar-extras">{previewExtras}</div>}
      </div>

      <div className="avatar-workbench">
        <header className="avatar-workbench-heading">
          <div><span className="avatar-eyebrow">PERSONALIZAÇÃO AVANÇADA</span><h2>Crie sua lenda.</h2><p>Mude qualquer detalhe. Veja o resultado na hora.</p></div>
          <span className="avatar-live"><i /> AO VIVO</span>
        </header>

        <nav className="avatar-tabs" aria-label="Categorias de personalização">
          {TABS.map((item) => (
            <button type="button" key={item.id} className={"avatar-tab" + (tab === item.id ? " is-active" : "")}
              onClick={() => setTab(item.id)} aria-pressed={tab === item.id}>
              <span aria-hidden="true">{item.icon}</span><strong>{item.label}</strong>
            </button>
          ))}
        </nav>

        <div className="avatar-control-scroll" key={tab}>
          {tab === "hair" && <>
            <Palette id="hair" label="Cor do cabelo" colors={HAIR_COLORS} selected={appearance.hairColor}
              customValue={appearance.customHairColor} onSelect={(i) => changeColor("hairColor", "customHairColor", i)}
              onCustom={(customHairColor) => change({ customHairColor })} onReset={() => change({ customHairColor: undefined })} />
            <OptionGrid title="Escolha seu corte" options={HAIR_STYLE_NAMES} selected={appearance.hairStyle}
              onSelect={(i) => changeNumber("hairStyle", i)} appearance={appearance} primary={primary} secondary={secondary} visual columns={4} />
          </>}
          {tab === "face" && <>
            <Palette id="skin" label="Tom de pele" colors={SKIN_COLORS} selected={appearance.skin}
              customValue={appearance.customSkinColor} onSelect={(i) => changeColor("skin", "customSkinColor", i)}
              onCustom={(customSkinColor) => change({ customSkinColor })} onReset={() => change({ customSkinColor: undefined })} />
            <Palette id="eye" label="Cor dos olhos" colors={EYE_COLORS} selected={appearance.eyeColor}
              customValue={appearance.customEyeColor} onSelect={(i) => changeColor("eyeColor", "customEyeColor", i)}
              onCustom={(customEyeColor) => change({ customEyeColor })} onReset={() => change({ customEyeColor: undefined })} />
            <OptionGrid title="Expressão" options={FACE_NAMES} selected={appearance.face} onSelect={(i) => changeNumber("face", i)} columns={3} />
            <OptionGrid title="Sobrancelhas" options={["Suaves", "Retas", "Marcadas"]} selected={appearance.brow} onSelect={(i) => changeNumber("brow", i)} columns={3} />
            <OptionGrid title="Barba / bigode" options={BEARD_NAMES} selected={appearance.beard} onSelect={(i) => changeNumber("beard", i)} columns={3} />
            <OptionGrid title="Óculos" options={GLASSES_NAMES} selected={appearance.glasses ?? 0} onSelect={(i) => changeNumber("glasses", i)} columns={2} />
            <OptionGrid title="Detalhe facial" options={DETAIL_NAMES} selected={appearance.facialDetail ?? 0} onSelect={(i) => changeNumber("facialDetail", i)} columns={2} />
            <OptionGrid title="Acessório de cabeça" options={HEADWEAR_NAMES} selected={appearance.headwear ?? 0} onSelect={(i) => changeNumber("headwear", i)} columns={2} />
          </>}
          {tab === "body" && <>
            <OptionGrid title="Porte físico" options={BUILD_NAMES} selected={appearance.build ?? 1} onSelect={(i) => changeNumber("build", i)} columns={2} />
            <OptionGrid title="Altura visual" options={STATURE_NAMES} selected={appearance.stature ?? 1} onSelect={(i) => changeNumber("stature", i)} columns={3} />
            <div className="avatar-info">As proporções mudam só a aparência do boneco, não os atributos ou o desempenho da sua carreira.</div>
            <OptionGrid title="Mangas" options={SLEEVES_NAMES} selected={appearance.sleeves ?? 0} onSelect={(i) => changeNumber("sleeves", i)} columns={3} />
            <OptionGrid title="Meião" options={SOCKS_NAMES} selected={appearance.socks ?? 0} onSelect={(i) => changeNumber("socks", i)} columns={3} />
            <Palette id="boots" label="Chuteiras" colors={BOOT_COLORS} selected={appearance.boots ?? 1} onSelect={(i) => changeNumber("boots", i)} />
          </>}
          {tab === "kit" && <>
            <div className="avatar-info">O clube fornece as cores e pode definir a estampa oficial na partida. Suas escolhas pessoais continuam salvas.</div>
            <OptionGrid title="Estampa preferida" options={KIT_PATTERN_NAMES} selected={appearance.kitPattern} onSelect={(i) => changeNumber("kitPattern", i)} columns={2} />
            <div className="avatar-palette">
              <SectionHeading title="Cor do calção" subtitle="Opcional · substitui o calção padrão" />
              <div className="avatar-short-controls">
                <label className="avatar-custom-picker is-short" title="Escolher cor do calção">
                  <input type="color" value={appearance.customShortsColor ?? secondary} onChange={(event) => change({ customShortsColor: event.target.value })} aria-label="Cor do calção" />
                  <span>{appearance.customShortsColor ? appearance.customShortsColor.toUpperCase() : "Escolher cor"}</span>
                </label>
                {appearance.customShortsColor && <button type="button" className="avatar-reset-short" onClick={() => change({ customShortsColor: undefined })}>Usar uniforme padrão</button>}
              </div>
            </div>
          </>}
          <div className="avatar-presets">
            <SectionHeading title="Comece de um arquétipo" subtitle="Muda alguns detalhes, mantém os demais" />
            <div className="avatar-preset-list">
              {PRESETS.map((preset) => (
                <button type="button" key={preset.title} onClick={() => change(preset.fields)}>
                  <b>{preset.title}</b><small>{preset.detail}</small><span>↗</span>
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="avatar-reset" onClick={() => remember({ ...normalizePlayerAppearance(null), kitPattern: appearance.kitPattern })}>
            Restaurar aparência original
          </button>
        </div>
        <footer className="avatar-workbench-footer"><span>ESTÚDIO FUTBOBO</span><span>O próximo ídolo começa aqui.</span></footer>
      </div>
    </section>
  );
}

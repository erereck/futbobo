"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import {
  BEARD_NAMES,
  EYE_COLORS,
  FACE_NAMES,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  SKIN_COLORS,
  drawPlayerBust,
  randomPlayerAppearance,
  type PlayerAppearance,
} from "./player-appearance";

type AppearanceKey = "hairStyle" | "beard" | "face" | "brow";

function cycle(value: number, length: number, direction: number) {
  return (value + direction + length) % length;
}

function ChoiceControl({
  label,
  value,
  onPrevious,
  onNext,
}: {
  label: string;
  value: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="appearance-choice">
      <span>{label}</span>
      <div>
        <button type="button" onClick={onPrevious} aria-label={`Anterior em ${label}`}>‹</button>
        <strong>{value}</strong>
        <button type="button" onClick={onNext} aria-label={`Próximo em ${label}`}>›</button>
      </div>
    </div>
  );
}

function PaletteControl({
  label,
  colors,
  selected,
  onSelect,
}: {
  label: string;
  colors: string[];
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
}: {
  value: PlayerAppearance;
  onChange: (value: PlayerAppearance) => void;
  playerName: string;
  number: number;
  primary?: string;
  secondary?: string;
  kitPattern?: number;
  compact?: boolean;
}) {
  function setIndex(key: AppearanceKey, length: number, direction: number) {
    onChange({ ...value, [key]: cycle(value[key], length, direction) });
  }

  return (
    <section className={`appearance-editor ${compact ? "appearance-editor-compact" : ""}`}>
      <div className="appearance-preview">
        <div className="appearance-preview-meta"><span>IDENTIDADE EM CAMPO</span><b>#{number || 10}</b></div>
        <PlayerAppearancePortrait appearance={kitPattern === undefined ? value : { ...value, kitPattern }} primary={primary} secondary={secondary} size={280} label={`Prévia do personagem de ${playerName || "seu jogador"}`} />
        <strong>{playerName || "Seu jogador"}</strong>
        <small>O uniforme acompanha automaticamente o clube.</small>
        <button type="button" className="appearance-random" onClick={() => onChange(randomPlayerAppearance())}>⚄ Sortear visual</button>
      </div>

      <div className="appearance-controls">
        <PaletteControl label="Tom de pele" colors={SKIN_COLORS} selected={value.skin} onSelect={(skin) => onChange({ ...value, skin, customSkinColor: undefined })} />
        <PaletteControl label="Cor do cabelo" colors={HAIR_COLORS} selected={value.hairColor} onSelect={(hairColor) => onChange({ ...value, hairColor, customHairColor: undefined })} />
        <PaletteControl label="Olhos" colors={EYE_COLORS} selected={value.eyeColor} onSelect={(eyeColor) => onChange({ ...value, eyeColor, customEyeColor: undefined })} />
        <div className="appearance-custom-grid">
          <CustomColorControl label="Pele" value={value.customSkinColor} fallback={SKIN_COLORS[value.skin]} onChange={(customSkinColor) => onChange({ ...value, customSkinColor })} onReset={() => onChange({ ...value, customSkinColor: undefined })} />
          <CustomColorControl label="Cabelo" value={value.customHairColor} fallback={HAIR_COLORS[value.hairColor]} onChange={(customHairColor) => onChange({ ...value, customHairColor })} onReset={() => onChange({ ...value, customHairColor: undefined })} />
          <CustomColorControl label="Olhos" value={value.customEyeColor} fallback={EYE_COLORS[value.eyeColor]} onChange={(customEyeColor) => onChange({ ...value, customEyeColor })} onReset={() => onChange({ ...value, customEyeColor: undefined })} />
        </div>
        <div className="appearance-choice-grid">
          <ChoiceControl label="Cabelo" value={HAIR_STYLE_NAMES[value.hairStyle]} onPrevious={() => setIndex("hairStyle", HAIR_STYLE_NAMES.length, -1)} onNext={() => setIndex("hairStyle", HAIR_STYLE_NAMES.length, 1)} />
          <ChoiceControl label="Barba" value={BEARD_NAMES[value.beard]} onPrevious={() => setIndex("beard", BEARD_NAMES.length, -1)} onNext={() => setIndex("beard", BEARD_NAMES.length, 1)} />
          <ChoiceControl label="Expressão" value={FACE_NAMES[value.face]} onPrevious={() => setIndex("face", FACE_NAMES.length, -1)} onNext={() => setIndex("face", FACE_NAMES.length, 1)} />
          <ChoiceControl label="Sobrancelha" value={["Suave", "Reta", "Intensa"][value.brow]} onPrevious={() => setIndex("brow", 3, -1)} onNext={() => setIndex("brow", 3, 1)} />
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
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  size?: number;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2 - 5);
    context.fillStyle = "rgba(0,0,0,.38)";
    context.beginPath(); context.ellipse(5, 15, 113, 94, 0, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(0, 0, 108, 0, Math.PI * 2); context.fillStyle = primary; context.fill();
    drawPlayerBust(context, appearance, primary, secondary, 108);
    context.strokeStyle = "#f4c430"; context.lineWidth = 7; context.beginPath(); context.arc(0, 0, 111, 0, Math.PI * 2); context.stroke();
    context.restore();
  }, [appearance, primary, secondary]);

  return <canvas ref={canvasRef} width={280} height={280} style={{ width: size, height: size }} aria-label={label} />;
}

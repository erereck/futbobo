// Telão de LED da gala: arte de TV desenhada num canvas (ouro, preto, brilho)
// e duas colunas de LED nas laterais, tudo numa malha e num material.
//
// Dois canvas se revezam: a arte nova é desenhada no de trás e entra por uma
// cortina dourada (ou dissolve, com movimento reduzido). Só redesenha quando o
// conteúdo muda; o resto (brilho que passa, respiração do suspense, grade de
// LED de perto) é do shader.
//
// O chão brilhante reflete o telão sem passe extra: cada pixel do piso reflete
// o raio da câmera e procura o ponto do telão que ele enxergaria (um plano só,
// conta fechada), borrando mais quanto mais longe.

import * as THREE from "three";

export type GalaScreenContent =
  | { kind: "title"; season: number }
  | { kind: "nominee"; name: string; club: string; primary: string }
  | { kind: "place"; place: 3; name: string }
  | { kind: "suspense"; text: string }
  | { kind: "winner"; name: string };

export type ScreenRect = {
  /** Centro em x, plano z, base e tamanho (unidades). */
  x: number;
  z: number;
  bottom: number;
  width: number;
  height: number;
};

export type ScreenColumns = { x: number; z: number; bottom: number; width: number; height: number };

// Canvas lógico: arte principal em cima, as duas colunas (deitadas) embaixo.
const LOGICAL_W = 1280;
const COLUMN_STRIP = 80;

const SERIF = "'Didot', 'Bodoni MT', 'Bodoni 72', 'Playfair Display', Georgia, 'Times New Roman', serif";

/** Barlow Condensed do app (next/font gera o nome); fora do app, condensada do sistema. */
function displayFamily() {
  try {
    const variable = getComputedStyle(document.body).getPropertyValue("--font-barlow-condensed").trim();
    if (variable) return `${variable}, 'Arial Narrow', 'Roboto Condensed', sans-serif`;
  } catch {
    /* sem DOM pronto */
  }
  return "'Barlow Condensed', 'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";
}

/** Iniciais do clube para o escudo (até 3 letras das palavras que importam). */
function initials(name: string) {
  const skip = new Set(["de", "do", "da", "dos", "das", "fc", "cf", "sc", "ac", "the", "club", "clube", "e"]);
  const words = name.split(/[\s.-]+/).filter((word) => word && !skip.has(word.toLowerCase()));
  const letters = (words.length ? words : [name]).slice(0, 3).map((word) => word[0]);
  return letters.join("").toLocaleUpperCase("pt-BR") || "FC";
}

function hexToRgb(hex: string): [number, number, number] {
  const color = new THREE.Color();
  try {
    color.setStyle(hex, THREE.SRGBColorSpace);
  } catch {
    color.set("#d4a437");
  }
  const srgb = color.getStyle(THREE.SRGBColorSpace).match(/\d+/g) ?? ["212", "164", "55"];
  return [Number(srgb[0]), Number(srgb[1]), Number(srgb[2])];
}

function rgba([r, g, b]: [number, number, number], alpha: number) {
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Semente fixa por conteúdo: brilhos no mesmo lugar ao redesenhar. */
function sparkleRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

type Painter = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  display: string;
  season: number;
};

function goldFill(ctx: CanvasRenderingContext2D, top: number, bottom: number) {
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, "#fff6d8");
  gradient.addColorStop(0.32, "#ffd877");
  gradient.addColorStop(0.55, "#e9ad35");
  gradient.addColorStop(0.78, "#b8781b");
  gradient.addColorStop(1, "#ffe39a");
  return gradient;
}

/** Texto com espaçamento entre letras (letterSpacing quando existe, senão à mão). */
function spacedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, mode: "fill" | "stroke" = "fill") {
  const withSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof withSpacing.letterSpacing === "string") {
    const previous = withSpacing.letterSpacing;
    withSpacing.letterSpacing = `${spacing}px`;
    // letterSpacing soma espaço depois da última letra também: compensa no centro.
    const shift = ctx.textAlign === "center" ? spacing / 2 : 0;
    if (mode === "fill") ctx.fillText(text, x + shift, y);
    else ctx.strokeText(text, x + shift, y);
    withSpacing.letterSpacing = previous;
    return;
  }
  const widths = Array.from(text).map((letter) => ctx.measureText(letter).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (widths.length - 1);
  const align = ctx.textAlign;
  let cursor = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  ctx.textAlign = "left";
  Array.from(text).forEach((letter, index) => {
    if (mode === "fill") ctx.fillText(letter, cursor, y);
    else ctx.strokeText(letter, cursor, y);
    cursor += widths[index] + spacing;
  });
  ctx.textAlign = align;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, size: number, maxWidth: number, family: string, spacing = 0) {
  let current = size;
  const measure = () => {
    ctx.font = `${weight} ${current}px ${family}`;
    return ctx.measureText(text).width + spacing * Math.max(0, text.length - 1) * (current / size);
  };
  while (current > 12 && measure() > maxWidth) current -= 2;
  return current;
}

/** Fundo comum: preto quente, brilho dourado, raios, poeira de ouro, molduras e vinheta. */
function backdrop(p: Painter, accent: [number, number, number], options: { rays?: number; glowX?: number; glowY?: number; seed: number }) {
  const { ctx, width, height } = p;
  ctx.fillStyle = "#040302";
  ctx.fillRect(0, 0, width, height);
  const gx = (options.glowX ?? 0.5) * width;
  const gy = (options.glowY ?? 0.45) * height;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, width * 0.62);
  glow.addColorStop(0, rgba(accent, 0.42));
  glow.addColorStop(0.35, rgba(accent, 0.14));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Raios saindo do alto (holofotes atrás da arte).
  const rays = options.rays ?? 0;
  if (rays > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(gx, gy);
    for (let index = 0; index < rays; index += 1) {
      const angle = (index / rays) * Math.PI * 2;
      const spread = Math.PI / rays * 0.42;
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.75);
      gradient.addColorStop(0, rgba(accent, 0.2));
      gradient.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, width * 0.75, angle - spread, angle + spread);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Poeira de ouro (bokeh).
  const random = sparkleRandom(options.seed);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let index = 0; index < 70; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const r = 1 + random() * random() * 9;
    const alpha = 0.05 + random() * 0.22;
    const dot = ctx.createRadialGradient(x, y, 0, x, y, r);
    dot.addColorStop(0, `rgba(255,214,140,${alpha})`);
    dot.addColorStop(1, "rgba(255,214,140,0)");
    ctx.fillStyle = dot;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  // Filetes dourados em cima e embaixo, sumindo nas pontas.
  for (const y of [22, height - 22]) {
    const line = ctx.createLinearGradient(0, 0, width, 0);
    line.addColorStop(0, "rgba(255,200,90,0)");
    line.addColorStop(0.2, "rgba(255,200,90,0.85)");
    line.addColorStop(0.8, "rgba(255,200,90,0.85)");
    line.addColorStop(1, "rgba(255,200,90,0)");
    ctx.fillStyle = line;
    ctx.fillRect(0, y - 1.5, width, 3);
  }
  // Cantoneiras.
  ctx.strokeStyle = "rgba(255,206,110,0.9)";
  ctx.lineWidth = 4;
  const c = 44;
  const m = 40;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [width - m, m, -1, 1], [m, height - m, 1, -1], [width - m, height - m, -1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * c);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * c, y);
    ctx.stroke();
  }
  // Vinheta.
  const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

/** A Bola de Ouro desenhada: esfera dourada com gomos, brilho e halo. */
function goldenBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, halo = 1) {
  ctx.save();
  if (halo > 0) {
    const aura = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.6);
    aura.addColorStop(0, `rgba(255,196,80,${0.55 * halo})`);
    aura.addColorStop(1, "rgba(255,196,80,0)");
    ctx.fillStyle = aura;
    ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
  }
  const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  body.addColorStop(0, "#fffbe6");
  body.addColorStop(0.25, "#ffe08a");
  body.addColorStop(0.62, "#e2a235");
  body.addColorStop(1, "#7c4c0e");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Gomos: um pentágono no meio e as costuras saindo dele.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(110,64,10,0.75)";
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  const inner = r * 0.36;
  const corners: Array<[number, number]> = [];
  for (let index = 0; index < 5; index += 1) {
    const angle = -Math.PI / 2 + (index / 5) * Math.PI * 2 + 0.2;
    corners.push([x + Math.cos(angle) * inner, y + Math.sin(angle) * inner * 0.92]);
  }
  ctx.beginPath();
  corners.forEach(([cx, cy], index) => (index ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy)));
  ctx.closePath();
  ctx.stroke();
  for (const [cx, cy] of corners) {
    const dx = cx - x;
    const dy = cy - y;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + dx * 0.9, cy + dy * 0.9, cx + dx * 1.9, cy + dy * 1.9);
    ctx.stroke();
  }
  ctx.restore();
  // Reflexo.
  const shine = ctx.createRadialGradient(x - r * 0.38, y - r * 0.45, 0, x - r * 0.38, y - r * 0.45, r * 0.5);
  shine.addColorStop(0, "rgba(255,255,255,0.85)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** "BALLON D'OR" na serifada dourada, com brilho. */
function wordmark(p: Painter, x: number, y: number, size: number, maxWidth: number) {
  const { ctx } = p;
  const text = "BALLON D'OR";
  const spacing = size * 0.16;
  const fitted = fitFont(ctx, text, "700", size, maxWidth, SERIF, spacing);
  const actualSpacing = spacing * (fitted / size);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.save();
  ctx.shadowColor = "rgba(255,170,40,0.75)";
  ctx.shadowBlur = fitted * 0.4;
  ctx.fillStyle = goldFill(ctx, y - fitted * 0.8, y + fitted * 0.1);
  spacedText(ctx, text, x, y, actualSpacing);
  ctx.restore();
  ctx.fillStyle = goldFill(ctx, y - fitted * 0.8, y + fitted * 0.1);
  spacedText(ctx, text, x, y, actualSpacing);
  return fitted;
}

/** Nome grande, branco-dourado, com brilho e contorno fino. */
function heroName(p: Painter, name: string, x: number, y: number, size: number, maxWidth: number, align: CanvasTextAlign = "center") {
  const { ctx, display } = p;
  const text = name.toLocaleUpperCase("pt-BR");
  const fitted = fitFont(ctx, text, "800", size, maxWidth, display, size * 0.02);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.save();
  ctx.shadowColor = "rgba(255,180,60,0.85)";
  ctx.shadowBlur = fitted * 0.3;
  const gradient = ctx.createLinearGradient(0, y - fitted * 0.8, 0, y);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.55, "#fff1c9");
  gradient.addColorStop(1, "#ffd36e");
  ctx.fillStyle = gradient;
  spacedText(ctx, text, x, y, fitted * 0.02);
  ctx.restore();
  ctx.lineWidth = Math.max(1, fitted * 0.012);
  ctx.strokeStyle = "rgba(120,74,10,0.6)";
  spacedText(ctx, text, x, y, fitted * 0.02, "stroke");
  return fitted;
}

function kicker(p: Painter, text: string, x: number, y: number, size: number, align: CanvasTextAlign = "center", color = "#ffcf6a") {
  const { ctx, display } = p;
  ctx.font = `700 ${size}px ${display}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  spacedText(ctx, text.toLocaleUpperCase("pt-BR"), x, y, size * 0.32);
}

/** Linha dourada com losango no meio (separador de TV). */
function rule(ctx: CanvasRenderingContext2D, x: number, y: number, half: number) {
  const line = ctx.createLinearGradient(x - half, 0, x + half, 0);
  line.addColorStop(0, "rgba(255,200,90,0)");
  line.addColorStop(0.5, "rgba(255,214,120,1)");
  line.addColorStop(1, "rgba(255,200,90,0)");
  ctx.fillStyle = line;
  ctx.fillRect(x - half, y - 1.5, half * 2, 3);
  ctx.fillStyle = "#ffe2a0";
  ctx.beginPath();
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x + 8, y);
  ctx.lineTo(x, y + 8);
  ctx.lineTo(x - 8, y);
  ctx.closePath();
  ctx.fill();
}

const GOLD: [number, number, number] = [255, 186, 72];

function paintTitle(p: Painter, season: number) {
  const { ctx, width, height } = p;
  backdrop(p, GOLD, { rays: 18, glowY: 0.34, seed: 11 });
  goldenBall(ctx, width / 2, height * 0.27, height * 0.13);
  kicker(p, "A noite mais importante do futebol", width / 2, height * 0.5, 30);
  wordmark(p, width / 2, height * 0.71, 132, width * 0.84);
  rule(ctx, width / 2, height * 0.77, width * 0.28);
  const { display } = p;
  ctx.font = `800 ${86}px ${display}`;
  ctx.textAlign = "center";
  ctx.save();
  ctx.shadowColor = "rgba(255,170,40,0.7)";
  ctx.shadowBlur = 26;
  ctx.fillStyle = goldFill(ctx, height * 0.8, height * 0.92);
  spacedText(ctx, String(season), width / 2, height * 0.92, 18);
  ctx.restore();
}

function paintNominee(p: Painter, name: string, club: string, primary: string) {
  const { ctx, width, height, display } = p;
  const accent = hexToRgb(primary);
  backdrop(p, GOLD, { rays: 0, glowX: 0.62, glowY: 0.5, seed: name.length * 31 + club.length });
  // Faixa diagonal na cor do clube, atrás do escudo.
  ctx.save();
  const band = ctx.createLinearGradient(0, 0, width * 0.45, height);
  band.addColorStop(0, rgba(accent, 0.95));
  band.addColorStop(1, rgba(accent.map((v) => v * 0.3) as [number, number, number], 0.95));
  ctx.fillStyle = band;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width * 0.38, 0);
  ctx.lineTo(width * 0.27, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  // Listras finas para textura.
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  for (let x = -height; x < width * 0.4; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height * 0.4, 0);
    ctx.stroke();
  }
  ctx.restore();
  // Fio dourado na borda da faixa.
  ctx.strokeStyle = "#ffcf6a";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(width * 0.38, 0);
  ctx.lineTo(width * 0.27, height);
  ctx.stroke();

  // Escudo com as iniciais do clube.
  const sx = width * 0.17;
  const sy = height * 0.5;
  const sw = height * 0.42;
  const sh = height * 0.52;
  const shield = () => {
    ctx.beginPath();
    ctx.moveTo(sx - sw / 2, sy - sh / 2);
    ctx.lineTo(sx + sw / 2, sy - sh / 2);
    ctx.lineTo(sx + sw / 2, sy + sh * 0.08);
    ctx.quadraticCurveTo(sx + sw / 2, sy + sh * 0.38, sx, sy + sh / 2);
    ctx.quadraticCurveTo(sx - sw / 2, sy + sh * 0.38, sx - sw / 2, sy + sh * 0.08);
    ctx.closePath();
  };
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 30;
  const shieldFill = ctx.createLinearGradient(0, sy - sh / 2, 0, sy + sh / 2);
  shieldFill.addColorStop(0, rgba(accent.map((v) => Math.min(255, v + 40)) as [number, number, number], 1));
  shieldFill.addColorStop(1, rgba(accent.map((v) => v * 0.45) as [number, number, number], 1));
  ctx.fillStyle = shieldFill;
  shield();
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 9;
  ctx.strokeStyle = goldFill(ctx, sy - sh / 2, sy + sh / 2);
  shield();
  ctx.stroke();
  const letters = initials(club);
  const letterSize = fitFont(ctx, letters, "900", sh * 0.42, sw * 0.8, display);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 10;
  ctx.font = `900 ${letterSize}px ${display}`;
  ctx.fillText(letters, sx, sy - sh * 0.02);
  ctx.restore();

  // Texto.
  const tx = width * 0.36;
  const maxWidth = width * 0.6;
  kicker(p, `Finalista · Ballon d'Or ${p.season}`, tx, height * 0.3, 32, "left");
  heroName(p, name, tx, height * 0.56, 142, maxWidth, "left");
  ctx.fillStyle = "rgba(255,206,110,0.9)";
  ctx.fillRect(tx, height * 0.62, maxWidth * 0.5, 4);
  ctx.font = `700 ${fitFont(ctx, club.toLocaleUpperCase("pt-BR"), "700", 54, maxWidth, display)}px ${display}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f2e6cc";
  spacedText(ctx, club.toLocaleUpperCase("pt-BR"), tx, height * 0.74, 6);
  goldenBall(ctx, width * 0.93, height * 0.82, height * 0.05, 0.6);
}

function paintPlace(p: Painter, name: string) {
  const { ctx, width, height, display } = p;
  const bronze: [number, number, number] = [214, 140, 70];
  backdrop(p, bronze, { rays: 0, glowX: 0.24, glowY: 0.5, seed: 33 + name.length });
  // "3º" enorme em bronze-dourado.
  const x = width * 0.24;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 ${height * 0.86}px ${display}`;
  ctx.save();
  ctx.shadowColor = "rgba(255,150,60,0.7)";
  ctx.shadowBlur = 50;
  const numeral = ctx.createLinearGradient(0, height * 0.12, 0, height * 0.86);
  numeral.addColorStop(0, "#fff0d6");
  numeral.addColorStop(0.45, "#f0b26a");
  numeral.addColorStop(1, "#8a4a1a");
  ctx.fillStyle = numeral;
  ctx.fillText("3", x - height * 0.04, height * 0.84);
  ctx.restore();
  ctx.font = `800 ${height * 0.2}px ${display}`;
  ctx.fillStyle = "#f6c27e";
  ctx.fillText("º", x + height * 0.2, height * 0.36);
  const tx = width * 0.44;
  const maxWidth = width * 0.52;
  kicker(p, "Terceiro lugar", tx, height * 0.36, 40, "left", "#f6c27e");
  heroName(p, name, tx, height * 0.6, 136, maxWidth, "left");
  ctx.fillStyle = "rgba(246,194,126,0.85)";
  ctx.fillRect(tx, height * 0.66, maxWidth * 0.45, 4);
  kicker(p, `Ballon d'Or ${p.season}`, tx, height * 0.76, 30, "left", "#e9d8bc");
}

function paintSuspense(p: Painter, text: string) {
  const { ctx, width, height, display } = p;
  backdrop(p, GOLD, { rays: 12, glowY: 0.5, seed: 77 });
  // A bola, grande e apagada, atrás do texto.
  ctx.save();
  ctx.globalAlpha = 0.22;
  goldenBall(ctx, width / 2, height * 0.5, height * 0.36, 0.4);
  ctx.restore();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, height * 0.32, width, height * 0.36);
  const words = text.toLocaleUpperCase("pt-BR").split(/\s+/).filter(Boolean);
  // Até duas linhas, a quebra mais equilibrada.
  let lines = [words.join(" ")];
  const size = 92;
  ctx.font = `800 ${size}px ${display}`;
  if (ctx.measureText(lines[0]).width > width * 0.84 && words.length > 1) {
    let best = 1;
    let bestDiff = Infinity;
    for (let cut = 1; cut < words.length; cut += 1) {
      const a = ctx.measureText(words.slice(0, cut).join(" ")).width;
      const b = ctx.measureText(words.slice(cut).join(" ")).width;
      const diff = Math.max(a, b);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = cut;
      }
    }
    lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  }
  const longest = lines.reduce((a, b) => (ctx.measureText(a).width > ctx.measureText(b).width ? a : b));
  const fitted = fitFont(ctx, longest, "800", size, width * 0.84, display, 4);
  ctx.font = `800 ${fitted}px ${display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineHeight = fitted * 1.05;
  const top = height * 0.5 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.save();
    ctx.shadowColor = "rgba(255,170,40,0.9)";
    ctx.shadowBlur = 34;
    ctx.fillStyle = "#fff4dc";
    spacedText(ctx, line, width / 2, top + index * lineHeight, 4);
    ctx.restore();
  });
  rule(ctx, width / 2, height * 0.84, width * 0.2);
}

function paintWinner(p: Painter, name: string) {
  const { ctx, width, height } = p;
  backdrop(p, [255, 196, 80], { rays: 28, glowY: 0.42, seed: 101 + name.length });
  // Explosão de ouro atrás de tudo.
  const burst = ctx.createRadialGradient(width / 2, height * 0.42, 0, width / 2, height * 0.42, height * 0.6);
  burst.addColorStop(0, "rgba(255,230,160,0.55)");
  burst.addColorStop(1, "rgba(255,190,70,0)");
  ctx.fillStyle = burst;
  ctx.fillRect(0, 0, width, height);
  goldenBall(ctx, width / 2, height * 0.22, height * 0.12, 1.2);
  wordmark(p, width / 2, height * 0.46, 64, width * 0.5);
  kicker(p, String(p.season), width / 2, height * 0.53, 34, "center", "#ffe2a0");
  heroName(p, name, width / 2, height * 0.8, 170, width * 0.88);
  rule(ctx, width / 2, height * 0.88, width * 0.3);
  // Estrelinhas de brilho.
  const random = sparkleRandom(7 + name.length * 13);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let index = 0; index < 26; index += 1) {
    const x = width * (0.08 + random() * 0.84);
    const y = height * (0.08 + random() * 0.84);
    const r = 6 + random() * 16;
    ctx.fillStyle = `rgba(255,236,190,${0.35 + random() * 0.5})`;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r * 0.3, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r * 0.3, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }
  ctx.restore();
}

/** Colunas laterais (deitadas no canvas; o eixo x vira a altura da coluna). */
function paintColumns(p: Painter, content: GalaScreenContent, top: number) {
  const { ctx, width } = p;
  const half = width / 2;
  const accent = content.kind === "nominee" ? hexToRgb(content.primary) : content.kind === "place" ? ([214, 140, 70] as [number, number, number]) : GOLD;
  for (let column = 0; column < 2; column += 1) {
    const x0 = column * half;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top, half, COLUMN_STRIP);
    ctx.clip();
    ctx.fillStyle = "#050403";
    ctx.fillRect(x0, top, half, COLUMN_STRIP);
    const glow = ctx.createLinearGradient(x0, 0, x0 + half, 0);
    glow.addColorStop(0, rgba(accent, 0.65));
    glow.addColorStop(0.5, rgba(accent, 0.12));
    glow.addColorStop(1, rgba(accent, 0.45));
    ctx.fillStyle = glow;
    ctx.fillRect(x0, top, half, COLUMN_STRIP);
    // Chevrons subindo (o x do canvas é a altura da coluna).
    ctx.strokeStyle = "rgba(255,214,130,0.55)";
    ctx.lineWidth = 3;
    for (let x = x0 + 20; x < x0 + half; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, top + 12);
      ctx.lineTo(x + 12, top + COLUMN_STRIP / 2);
      ctx.lineTo(x, top + COLUMN_STRIP - 12);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x0 + half * 0.28, top + 8, half * 0.44, COLUMN_STRIP - 16);
    ctx.font = `700 ${COLUMN_STRIP * 0.52}px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = goldFill(ctx, top + 10, top + COLUMN_STRIP - 10);
    spacedText(ctx, "BALLON D'OR", x0 + half / 2, top + COLUMN_STRIP / 2 + 2, 8);
    ctx.restore();
  }
}

const SCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vPanel;
  attribute vec2 panel;
  void main() {
    vUv = uv;
    vPanel = panel;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SCREEN_FRAGMENT = /* glsl */ `
  uniform sampler2D uMapA;
  uniform sampler2D uMapB;
  uniform float uMix;
  uniform float uWipe;
  uniform float uTime;
  uniform float uBright;
  uniform float uPulse;
  uniform vec2 uGrid;
  varying vec2 vUv;
  varying vec2 vPanel;
  void main() {
    vec3 a = texture2D(uMapA, vUv).rgb;
    vec3 b = texture2D(uMapB, vUv).rgb;
    // Cortina diagonal da esquerda para a direita, com um fio de ouro na frente.
    float edge = vPanel.x * 0.86 + vPanel.y * 0.14;
    float front = uMix * 1.3 - 0.15;
    float wiped = 1.0 - smoothstep(front - 0.1, front, edge);
    float k = mix(uMix, wiped, uWipe);
    vec3 color = mix(a, b, k);
    float live = step(0.001, uMix) * (1.0 - step(0.999, uMix));
    color += vec3(1.0, 0.72, 0.32) * exp(-pow((edge - front + 0.05) * 30.0, 2.0)) * live * uWipe * 1.4;
    // Brilho que atravessa a tela de tempos em tempos.
    float sweep = fract(uTime / 7.5) * 2.4 - 0.7;
    color += vec3(1.0, 0.86, 0.6) * exp(-pow((edge - sweep) * 7.0, 2.0)) * 0.07;
    color *= 1.0 + uPulse * 0.14 * sin(uTime * 3.4);
    // Grade de LED: só aparece de perto (some quando o LED fica menor que o pixel).
    vec2 cell = fract(vUv * uGrid) - 0.5;
    float led = smoothstep(0.5, 0.25, length(cell));
    float pixel = max(fwidth(vUv.x * uGrid.x), fwidth(vUv.y * uGrid.y));
    float grid = 1.0 - smoothstep(0.18, 0.55, pixel);
    color *= mix(1.0, 0.45 + 0.75 * led, grid * 0.7);
    gl_FragColor = vec4(color * uBright, 1.0);
    #include <colorspace_fragment>
  }
`;

const REFLECT_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const REFLECT_FRAGMENT = /* glsl */ `
  uniform sampler2D uMapA;
  uniform sampler2D uMapB;
  uniform float uMix;
  uniform float uBright;
  uniform float uStrength;
  uniform vec4 uRect;   // x0, largura, base, altura (mundo)
  uniform float uPlaneZ;
  uniform vec2 uUvY;    // faixa v da arte principal no canvas
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  void main() {
    vec3 view = normalize(vWorld - cameraPosition);
    vec3 r = vec3(view.x, -view.y, view.z);
    if (r.z > -0.02) discard;
    float t = (uPlaneZ - vWorld.z) / r.z;
    vec3 hit = vWorld + r * t;
    vec2 uv = vec2((hit.x - uRect.x) / uRect.y, (hit.y - uRect.z) / uRect.w);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
    vec2 tex = vec2(uv.x, mix(uUvY.x, uUvY.y, uv.y));
    // Brilhante, mas não espelho: borra com a distância.
    float blur = clamp(t * 0.025 + 1.5, 1.5, 6.0);
    vec3 color = mix(texture2D(uMapA, tex, blur).rgb, texture2D(uMapB, tex, blur).rgb, uMix);
    float fresnel = 0.25 + 0.75 * pow(1.0 - clamp(-view.y, 0.0, 1.0), 4.0);
    float fade = exp(-t * 0.006) * smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x);
    color *= uStrength * uBright * fresnel * fade;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      color *= 1.0 - fogF;
    #endif
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export class GalaScreen {
  readonly mesh: THREE.Mesh;
  /** Reflexo do telão no chão do palco e do praticável (null no modo desempenho). */
  readonly reflection: THREE.Mesh | null = null;
  /** Cor média da arte no ar (para a contraluz que o telão joga no palco). */
  readonly tint = new THREE.Color("#ffb85a");
  private readonly tintWanted = new THREE.Color("#ffb85a");
  private readonly canvases: [HTMLCanvasElement, HTMLCanvasElement];
  private readonly textures: [THREE.CanvasTexture, THREE.CanvasTexture];
  private readonly material: THREE.ShaderMaterial;
  private readonly reflectionMaterial: THREE.ShaderMaterial | null = null;
  private readonly geometry: THREE.BufferGeometry;
  private readonly scale: number;
  private readonly mainHeight: number;
  private front = 0;
  private mix = 1;
  private key = "";
  private current: GalaScreenContent | null = null;
  private display = displayFamily();
  private disposed = false;
  private pulse = 0;
  private pulseWanted = 0;

  constructor(
    private readonly rect: ScreenRect,
    columns: ScreenColumns | null,
    reflectFloors: Array<{ y: number; x0: number; x1: number; z0: number; z1: number }>,
    private readonly options: { season: number; performance: boolean; reducedMotion: boolean },
  ) {
    this.mainHeight = Math.round((LOGICAL_W * rect.height) / rect.width);
    const logicalH = this.mainHeight + COLUMN_STRIP;
    this.scale = options.performance ? 0.7 : 1;
    const make = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(LOGICAL_W * this.scale);
      canvas.height = Math.round(logicalH * this.scale);
      return canvas;
    };
    this.canvases = [make(), make()];
    const texture = (canvas: HTMLCanvasElement) => {
      const value = new THREE.CanvasTexture(canvas);
      value.colorSpace = THREE.SRGBColorSpace;
      value.anisotropy = 4;
      value.minFilter = THREE.LinearMipmapLinearFilter;
      return value;
    };
    this.textures = [texture(this.canvases[0]), texture(this.canvases[1])];
    const mainV0 = 1 - this.mainHeight / logicalH;
    const columnV1 = 1 - this.mainHeight / logicalH;

    // Telão principal + colunas: quadriláteros com UV na faixa certa do canvas.
    const positions: number[] = [];
    const uvs: number[] = [];
    const panels: number[] = [];
    const indices: number[] = [];
    const quad = (corners: Array<[number, number, number]>, uv: Array<[number, number]>, panel: Array<[number, number]>) => {
      const base = positions.length / 3;
      corners.forEach((corner) => positions.push(...corner));
      uv.forEach((value) => uvs.push(...value));
      panel.forEach((value) => panels.push(...value));
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const x0 = rect.x - rect.width / 2;
    const x1 = rect.x + rect.width / 2;
    const y0 = rect.bottom;
    const y1 = rect.bottom + rect.height;
    quad([[x0, y0, rect.z], [x1, y0, rect.z], [x1, y1, rect.z], [x0, y1, rect.z]], [[0, mainV0], [1, mainV0], [1, 1], [0, 1]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    if (columns) {
      for (const side of [-1, 1]) {
        const cx = columns.x * side;
        const a = cx - columns.width / 2;
        const b = cx + columns.width / 2;
        const bottom = columns.bottom;
        const top = columns.bottom + columns.height;
        // Coluna de pé lê a faixa deitada: subir na coluna = andar em u.
        const u0 = side < 0 ? 0 : 0.5;
        const u1 = u0 + 0.5;
        quad(
          [[a, bottom, columns.z], [b, bottom, columns.z], [b, top, columns.z], [a, top, columns.z]],
          [[u0, columnV1], [u0, 0], [u1, 0], [u1, columnV1]],
          [[0, 0], [1, 0], [1, 1], [0, 1]],
        );
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    this.geometry.setAttribute("panel", new THREE.Float32BufferAttribute(panels, 2));
    this.geometry.setIndex(indices);
    this.geometry.computeBoundingSphere();

    const shared = {
      uMapA: { value: this.textures[0] as THREE.Texture },
      uMapB: { value: this.textures[1] as THREE.Texture },
      uMix: { value: 1 },
      uBright: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uWipe: { value: options.reducedMotion ? 0 : 1 },
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uGrid: { value: new THREE.Vector2(LOGICAL_W / 2.5, (this.mainHeight + COLUMN_STRIP) / 2.5) },
      },
      vertexShader: SCREEN_VERTEX,
      fragmentShader: SCREEN_FRAGMENT,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = "gala-led-screen";

    if (!options.performance && reflectFloors.length) {
      const floorGeometry = new THREE.BufferGeometry();
      const floorPositions: number[] = [];
      const floorIndices: number[] = [];
      for (const floor of reflectFloors) {
        const base = floorPositions.length / 3;
        const y = floor.y + 0.08;
        floorPositions.push(floor.x0, y, floor.z1, floor.x1, y, floor.z1, floor.x1, y, floor.z0, floor.x0, y, floor.z0);
        floorIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      floorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(floorPositions, 3));
      floorGeometry.setIndex(floorIndices);
      floorGeometry.computeBoundingSphere();
      const material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
          uStrength: { value: 0.32 },
          uRect: { value: new THREE.Vector4(x0, rect.width, rect.bottom, rect.height) },
          uPlaneZ: { value: rect.z },
          uUvY: { value: new THREE.Vector2(mainV0, 1) },
        }]),
        vertexShader: REFLECT_VERTEX,
        fragmentShader: REFLECT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      // As texturas e o mix são os mesmos objetos do telão.
      Object.assign(material.uniforms, shared);
      const mesh = new THREE.Mesh(floorGeometry, material);
      mesh.name = "gala-screen-reflection";
      mesh.renderOrder = 2;
      this.reflection = mesh;
      this.reflectionMaterial = material;
    }

    // A fonte do app pode chegar depois: redesenha a arte do ar uma vez quando chegar.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (this.disposed) return;
        const family = displayFamily();
        if (family !== this.display || this.current) {
          this.display = family;
          if (this.current) this.redraw(this.current, true);
        }
      }).catch(() => undefined);
    }
  }

  /** Troca a arte do telão (não faz nada se for a mesma). */
  set(content: GalaScreenContent) {
    const key = JSON.stringify(content);
    if (key === this.key) return;
    this.key = key;
    this.current = content;
    this.redraw(content, false);
  }

  /** Brilho geral do telão (1 = normal). */
  setBrightness(value: number) {
    const bright = Number.isFinite(value) ? Math.max(0, value) : 1;
    this.material.uniforms.uBright.value = bright;
  }

  /** Redesenha no canvas de trás e começa a transição (ou troca no lugar, `instant`). */
  private redraw(content: GalaScreenContent, instant: boolean) {
    // Transição pela metade: a nova vira a da frente antes de começar outra.
    if (this.mix < 1 && !instant) this.swap();
    const target = instant ? this.front : 1 - this.front;
    const canvas = this.canvases[target];
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, this.mainHeight + COLUMN_STRIP);
    const painter: Painter = { ctx, width: LOGICAL_W, height: this.mainHeight, display: this.display, season: this.options.season };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, LOGICAL_W, this.mainHeight);
    ctx.clip();
    switch (content.kind) {
      case "title":
        painter.season = content.season;
        paintTitle(painter, content.season);
        this.tintWanted.set("#ffb24a");
        this.pulseWanted = 0;
        break;
      case "nominee":
        paintNominee(painter, content.name, content.club, content.primary);
        this.tintWanted.set("#ffb24a").lerp(new THREE.Color(content.primary), 0.55);
        this.pulseWanted = 0;
        break;
      case "place":
        paintPlace(painter, content.name);
        this.tintWanted.set("#e0884a");
        this.pulseWanted = 0;
        break;
      case "suspense":
        paintSuspense(painter, content.text);
        this.tintWanted.set("#c98a3a");
        this.pulseWanted = 1;
        break;
      case "winner":
        paintWinner(painter, content.name);
        this.tintWanted.set("#ffc864");
        this.pulseWanted = 0.35;
        break;
    }
    ctx.restore();
    paintColumns(painter, content, this.mainHeight);
    this.textures[target].needsUpdate = true;
    if (instant) return;
    this.material.uniforms.uMapA.value = this.textures[this.front];
    this.material.uniforms.uMapB.value = this.textures[target];
    this.mix = 0;
    this.material.uniforms.uMix.value = 0;
  }

  private swap() {
    this.front = 1 - this.front;
    this.mix = 1;
    this.material.uniforms.uMapA.value = this.textures[this.front];
    this.material.uniforms.uMapB.value = this.textures[this.front];
    this.material.uniforms.uMix.value = 1;
  }

  update(time: number, dt: number) {
    this.material.uniforms.uTime.value = time;
    if (this.mix < 1) {
      this.mix = dt > 0 ? Math.min(1, this.mix + dt / (this.options.reducedMotion ? 0.5 : 0.75)) : 1;
      this.material.uniforms.uMix.value = this.mix;
      if (this.mix >= 1) this.swap();
    }
    const k = dt > 0 ? 1 - Math.exp(-4 * Math.min(dt, 0.1)) : 1;
    this.tint.lerp(this.tintWanted, k);
    this.pulse += (this.pulseWanted - this.pulse) * k;
    this.material.uniforms.uPulse.value = this.options.reducedMotion ? 0 : this.pulse;
  }

  textureList(): THREE.Texture[] {
    return this.textures;
  }

  dispose() {
    this.disposed = true;
    this.geometry.dispose();
    this.material.dispose();
    this.textures[0].dispose();
    this.textures[1].dispose();
    if (this.reflection) {
      this.reflection.geometry.dispose();
      this.reflectionMaterial?.dispose();
    }
  }
}

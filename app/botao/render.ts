// Desenho da mesa em canvas 2D. Nenhuma dependência de React: recebe estado e
// pinta. Tudo em unidades de campo — a escala fica no transform do contexto.

import {
  FIELD,
  GOAL_LEFT,
  GOAL_RIGHT,
  distanceForSpeed,
  penaltyKeeper,
  penaltyShooter,
  shotSpeedFor,
  type BotaoBody,
  type BotaoMatchState,
} from "./engine";
import {
  fieldThemeForMatch,
  isFutsalTheme,
  streetVariantForMatch,
  type BotaoFieldTheme,
  type BotaoStreetVariant,
} from "./field-themes";
import { readableInk } from "./kits";
import type { BotaoGoalReplay, BotaoMatchSetup, BotaoSide } from "./types";
import { drawPlayerBust, type PlayerAppearance } from "../player-appearance";

export const VIEW_PAD_X = 8;
export const VIEW_PAD_Y = FIELD.goalDepth + 8;
export const VIEW_WIDTH = FIELD.width + VIEW_PAD_X * 2;
export const VIEW_HEIGHT = FIELD.height + VIEW_PAD_Y * 2;

const MATCH_BALL_SRC = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/botao/match-ball.png`;
let matchBallSprite: HTMLImageElement | null = null;
const liveBallSpin = new WeakMap<BotaoBody, { x: number; y: number; angle: number }>();

function loadedBallSprite(): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (!matchBallSprite) {
    matchBallSprite = new Image();
    matchBallSprite.decoding = "async";
    matchBallSprite.src = MATCH_BALL_SRC;
  }
  return matchBallSprite.complete && matchBallSprite.naturalWidth > 0 ? matchBallSprite : null;
}

export type BotaoAimView = {
  bodyId: string;
  dragX: number;
  dragY: number;
  ratio: number;
  valid: boolean;
};

export type BotaoRenderView = {
  selectedId: string | null;
  aim: BotaoAimView | null;
  /** Discos que podem ser tacados agora (pulsam de leve). */
  highlight: boolean;
  penaltyMode: boolean;
  /** Últimas posições da bola, da mais antiga para a mais nova. */
  trail: Array<{ x: number; y: number }>;
  /** 1 = acabou de sair o gol, 0 = sem comemoração. */
  goalFlash: number;
  goalFlashSide: BotaoSide | null;
  /** Mantém números e o selo "VC" legíveis quando a mesa gira no desktop. */
  uprightLabels?: boolean;
  /** Duelo local controla os dois lados, então nenhum disco representa "você". */
  hideUserMarker?: boolean;
  /** Tratamento 2.5D experimental usado apenas pela rota de protótipo. */
  showcase?: boolean;
  /** Segundos até a saída de bola depois do gol (o 3D devolve a câmera antes). O 2D ignora. */
  goalEndsIn?: number | null;
  /** Bobonline: mesa girada 180° (o convidado vê o próprio time subindo); o drawMatch gira. Números e rostos continuam de pé. */
  mirrored?: boolean;
  /** Drama do pênalti da CPU: o tempo dele, cru (o 3D tira progresso e segundos restantes daqui; o 2D ignora). */
  penaltyWindup?: { shooterId: string; totalMs: number; elapsedMs: number } | null;
  /** A mira desenhada é a do adversário (prévia pela rede): seta a 70%. */
  remoteAim?: boolean;
  /** Pênalti online: o batedor do outro aparelho, concentrado até a primeira prévia de mira chegar (só o 3D encena). */
  penaltyFocusId?: string | null;
  /** Bobonline 2D: desenho por baixo dos botões, logo depois do clarão do gol (a pista da comemoração longa vem do driver online). */
  underlay?: ((ctx: CanvasRenderingContext2D) => void) | null;
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawGoal(ctx: CanvasRenderingContext2D, y: number, direction: number, accent: string) {
  const depth = FIELD.goalDepth;
  ctx.save();
  // Rede
  ctx.fillStyle = "rgba(4, 12, 8, 0.55)";
  ctx.fillRect(GOAL_LEFT, direction < 0 ? y - depth : y, FIELD.goalWidth, depth);
  ctx.strokeStyle = "rgba(245, 247, 242, 0.22)";
  ctx.lineWidth = 1;
  for (let offset = 6; offset < FIELD.goalWidth; offset += 9) {
    ctx.beginPath();
    ctx.moveTo(GOAL_LEFT + offset, y);
    ctx.lineTo(GOAL_LEFT + offset, y + direction * -depth);
    ctx.stroke();
  }
  for (let offset = 5; offset < depth; offset += 6) {
    const lineY = y + direction * -offset;
    ctx.beginPath();
    ctx.moveTo(GOAL_LEFT, lineY);
    ctx.lineTo(GOAL_RIGHT, lineY);
    ctx.stroke();
  }
  // Traves
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(GOAL_LEFT, y);
  ctx.lineTo(GOAL_LEFT, y + direction * -depth);
  ctx.moveTo(GOAL_RIGHT, y);
  ctx.lineTo(GOAL_RIGHT, y + direction * -depth);
  ctx.moveTo(GOAL_LEFT, y + direction * -depth);
  ctx.lineTo(GOAL_RIGHT, y + direction * -depth);
  ctx.stroke();
  ctx.restore();
}

function drawGrassBase(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#145c3a");
  gradient.addColorStop(0.5, "#12522f");
  gradient.addColorStop(1, "#0f4629");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * As duas quadras raras de futsal: mesmo desenho, mesmas linhas, só a tinta
 * muda. `piso` é a cor do meio (também a base dos botões no 3D) e `moldura`,
 * o entorno escuro das tabelas.
 */
const FUTSAL_COURTS = {
  "futsal-blue": { gradient: ["#1979ad", "#126795", "#0d557e"], band: "rgba(47, 151, 194, 0.12)", border: "#0a2436" },
  // Terracota de quadra sintética: faixas num laranja mais claro e moldura
  // marrom-escura, para ler como piso esportivo e não como terra.
  "futsal-orange": { gradient: ["#d77a3f", "#c4642f", "#a94f24"], band: "rgba(246, 160, 98, 0.13)", border: "#341709" },
} as const;

/** Cor média de cada piso de rua (3D): asfalto, terra batida, concreto pintado. */
const STREET_FLOORS = ["#3a3d41", "#8c5a38", "#3c6f59"] as const;

/**
 * Cor dominante do piso desta partida. O 3D compara a camisa com ela: base de
 * botão da mesma cor do chão sumiria (verde na grama, azul ou laranja no futsal).
 */
export function pitchFloorColor(setup: BotaoMatchSetup): string {
  const theme = fieldThemeForMatch(setup);
  if (isFutsalTheme(theme)) return FUTSAL_COURTS[theme].gradient[1];
  if (theme === "street") return STREET_FLOORS[streetVariantForMatch(setup)];
  return "#145c3a";
}

function drawFieldPattern(ctx: CanvasRenderingContext2D, theme: BotaoFieldTheme, width: number, height: number) {
  if (isFutsalTheme(theme)) {
    const court = FUTSAL_COURTS[theme];
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, court.gradient[0]);
    gradient.addColorStop(0.52, court.gradient[1]);
    gradient.addColorStop(1, court.gradient[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Faixas horizontais num segundo tom quase igual: diferença pequena,
    // mas suficiente para a quadra rara ter uma identidade mais swag.
    const stripe = height / 10;
    ctx.fillStyle = court.band;
    for (let index = 0; index < 10; index += 2) {
      ctx.fillRect(0, index * stripe, width, stripe);
    }

    // Brilho discreto de piso polido, sem textura de grama.
    const sheen = ctx.createLinearGradient(0, 0, width, 0);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0.015)");
    sheen.addColorStop(0.5, "rgba(255, 255, 255, 0.075)");
    sheen.addColorStop(1, "rgba(255, 255, 255, 0.015)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  drawGrassBase(ctx, width, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.028)";

  if (theme === "classic") {
    const stripe = height / 10;
    for (let index = 0; index < 10; index += 2) {
      ctx.fillRect(0, index * stripe, width, stripe);
    }
    return;
  }

  if (theme === "vertical") {
    const stripe = width / 10;
    for (let index = 0; index < 10; index += 2) {
      ctx.fillRect(index * stripe, 0, stripe, height);
    }
    return;
  }

  if (theme === "checker") {
    const columns = 6;
    const rows = 10;
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if ((row + column) % 2 === 0) {
          ctx.fillRect(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
        }
      }
    }
    return;
  }

  // Faixas diagonais largas, ainda com as mesmas cores naturais de gramado.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 12);
  const stripe = 42;
  for (let x = -width - height; x < width + height; x += stripe * 2) {
    ctx.fillRect(x, -height, stripe, height * 2);
  }
  ctx.restore();
}

// ------------------------------------------------------------ campo de rua
//
// Um piso por variação (0 asfalto, 1 terra batida, 2 concreto pintado), todo
// procedural e com semente. É desenho caro (milhares de pedrinhas, rachaduras,
// giz tremido): o 2D pinta UMA vez num canvas fora da tela e só copia a imagem
// a cada quadro; o 3D pinta uma vez na textura do campo.

/** Semente fixa: a rua do 2D é sempre a mesma, em qualquer partida. */
const STREET_2D_SEED = 0x5eed2d;
const STREET_CACHE_LIMIT = 2;
const streetTables: Array<{ scale: number; canvas: HTMLCanvasElement }> = [];

type LinePoint = readonly [number, number];
type LineStyle = {
  /** Tremor da mão (unidades de campo); 0 = pintura de régua. */
  wobble: number;
  width: number;
  /** RGB da tinta, alfa sorteado entre `alpha[0]` e `alpha[1]` por trecho. */
  rgb: string;
  alpha: readonly [number, number];
  /** Pó em volta do traço (giz e cal espalham, tinta não). */
  halo: number;
  dust: number;
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pontinhos de um tamanho e cor num caminho só: um `fill` por cor, não um por pedra. */
function speckle(ctx: CanvasRenderingContext2D, random: () => number, count: number, color: string, min: number, max: number, area = { x: 0, y: 0, w: FIELD.width, h: FIELD.height }) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let index = 0; index < count; index += 1) {
    const size = min + random() * (max - min);
    ctx.rect(area.x + random() * area.w, area.y + random() * area.h, size, size * (0.6 + random() * 0.8));
  }
  ctx.fill();
}

/** Mancha macia (gradiente radial) para desgaste, umidade e óleo. */
function blotch(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, squash = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, squash);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
  ctx.fillStyle = gradient;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

/** Rachadura: caminhada aleatória com galhos, num traço só. */
function crack(ctx: CanvasRenderingContext2D, random: () => number, x: number, y: number, steps: number) {
  const stack: Array<{ x: number; y: number; angle: number; steps: number; depth: number }> = [
    { x, y, angle: random() * Math.PI * 2, steps, depth: 0 },
  ];
  ctx.beginPath();
  while (stack.length > 0) {
    const branch = stack.pop()!;
    let { x: px, y: py, angle } = branch;
    ctx.moveTo(px, py);
    for (let step = 0; step < branch.steps; step += 1) {
      angle += (random() - 0.5) * 0.9;
      const length = 2 + random() * 5;
      px += Math.cos(angle) * length;
      py += Math.sin(angle) * length;
      ctx.lineTo(px, py);
      if (branch.depth < 2 && random() < 0.12) {
        stack.push({ x: px, y: py, angle: angle + (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.6), steps: Math.floor(branch.steps * 0.45), depth: branch.depth + 1 });
      }
    }
  }
  ctx.stroke();
}

/** Linhas do futebol de rua: áreas retangulares, como num campo riscado na hora. */
function streetLineShapes() {
  const { width, height } = FIELD;
  const areaX = (width - FIELD.areaWidth) / 2;
  const circle: LinePoint[] = [];
  for (let index = 0; index <= 56; index += 1) {
    const angle = (index / 56) * Math.PI * 2;
    circle.push([width / 2 + Math.cos(angle) * FIELD.centerRadius, height / 2 + Math.sin(angle) * FIELD.centerRadius]);
  }
  const lines: LinePoint[][] = [
    [[1, 1], [width - 1, 1], [width - 1, height - 1], [1, height - 1], [1, 1]],
    [[1, height / 2], [width - 1, height / 2]],
    circle,
    [[areaX, 1], [areaX, FIELD.areaDepth], [areaX + FIELD.areaWidth, FIELD.areaDepth], [areaX + FIELD.areaWidth, 1]],
    [[areaX, height - 1], [areaX, height - FIELD.areaDepth], [areaX + FIELD.areaWidth, height - FIELD.areaDepth], [areaX + FIELD.areaWidth, height - 1]],
  ];
  const spots: LinePoint[] = [[width / 2, height / 2], [width / 2, FIELD.penaltyDistance], [width / 2, height - FIELD.penaltyDistance]];
  return { lines, spots };
}

/**
 * Traço à mão: a polilinha é picada a cada ~3 unidades e cada ponto sai da
 * reta por um ruído suave (soma de senos com fase sorteada), o que lembra o
 * giz arrastado e não um tremor eletrônico. Cada trecho curto ganha seu alfa.
 */
function strokeHandLine(ctx: CanvasRenderingContext2D, points: readonly LinePoint[], random: () => number, style: LineStyle) {
  const phase = [random() * 10, random() * 10, random() * 10];
  const path: Array<[number, number]> = [];
  let travelled = 0;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const [ax, ay] = points[index];
    const [bx, by] = points[index + 1];
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 1e-6) continue;
    const nx = -(by - ay) / length;
    const ny = (bx - ax) / length;
    const steps = Math.max(1, Math.ceil(length / 3));
    for (let step = index === 0 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      const s = travelled + length * t;
      const offset = style.wobble * (Math.sin(s * 0.07 + phase[0]) * 0.6 + Math.sin(s * 0.19 + phase[1]) * 0.3 + Math.sin(s * 0.47 + phase[2]) * 0.1);
      path.push([ax + (bx - ax) * t + nx * offset, ay + (by - ay) * t + ny * offset]);
    }
    travelled += length;
  }
  if (path.length < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (style.halo > 0) {
    ctx.strokeStyle = `rgba(${style.rgb}, ${style.halo})`;
    ctx.lineWidth = style.width * 2.6;
    ctx.beginPath();
    path.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }
  ctx.lineWidth = style.width;
  for (let start = 0; start < path.length - 1;) {
    const end = Math.min(path.length - 1, start + 2 + Math.floor(random() * 4));
    ctx.strokeStyle = `rgba(${style.rgb}, ${(style.alpha[0] + random() * (style.alpha[1] - style.alpha[0])).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(path[start][0], path[start][1]);
    for (let index = start + 1; index <= end; index += 1) ctx.lineTo(path[index][0], path[index][1]);
    ctx.stroke();
    start = end;
  }
  if (style.dust > 0) {
    ctx.fillStyle = `rgba(${style.rgb}, ${style.dust})`;
    ctx.beginPath();
    for (const [x, y] of path) {
      for (let grain = 0; grain < 2; grain += 1) {
        const size = 0.35 + random() * 0.6;
        ctx.rect(x + (random() - 0.5) * style.width * 3.4, y + (random() - 0.5) * style.width * 3.4, size, size);
      }
    }
    ctx.fill();
  }
}

function drawStreetLines(ctx: CanvasRenderingContext2D, random: () => number, style: LineStyle) {
  const { lines, spots } = streetLineShapes();
  for (const line of lines) strokeHandLine(ctx, line, random, style);
  for (const [x, y] of spots) {
    ctx.fillStyle = `rgba(${style.rgb}, ${style.alpha[1]})`;
    ctx.beginPath();
    ctx.arc(x + (random() - 0.5) * style.wobble, y + (random() - 0.5) * style.wobble, style.width * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Meio-fio de concreto em volta da mesa (só no 2D: no 3D as tabelas são peças). */
function drawStreetCurb(ctx: CanvasRenderingContext2D, random: () => number) {
  const gradient = ctx.createLinearGradient(0, -VIEW_PAD_Y, 0, FIELD.height + VIEW_PAD_Y);
  gradient.addColorStop(0, "#9a988f");
  gradient.addColorStop(1, "#85837b");
  ctx.fillStyle = gradient;
  roundRect(ctx, -VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT, 14);
  ctx.fill();
  ctx.save();
  roundRect(ctx, -VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT, 14);
  ctx.clip();
  speckle(ctx, random, 2600, "rgba(255,255,255,0.10)", 0.3, 0.8, { x: -VIEW_PAD_X, y: -VIEW_PAD_Y, w: VIEW_WIDTH, h: VIEW_HEIGHT });
  speckle(ctx, random, 2600, "rgba(30,30,28,0.14)", 0.3, 0.8, { x: -VIEW_PAD_X, y: -VIEW_PAD_Y, w: VIEW_WIDTH, h: VIEW_HEIGHT });
  for (let index = 0; index < 14; index += 1) {
    blotch(ctx, -VIEW_PAD_X + random() * VIEW_WIDTH, -VIEW_PAD_Y + random() * VIEW_HEIGHT, 6 + random() * 14, "rgba(40,36,30,0.14)");
  }
  // Juntas das peças do meio-fio, a cada ~23 unidades.
  ctx.strokeStyle = "rgba(38,36,32,0.5)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let y = -VIEW_PAD_Y + 12; y < FIELD.height + VIEW_PAD_Y; y += 23) {
    ctx.moveTo(-VIEW_PAD_X, y);
    ctx.lineTo(0, y);
    ctx.moveTo(FIELD.width, y + 9);
    ctx.lineTo(FIELD.width + VIEW_PAD_X, y + 9);
  }
  for (let x = 14; x < FIELD.width; x += 23) {
    ctx.moveTo(x, -VIEW_PAD_Y);
    ctx.lineTo(x, 0);
    ctx.moveTo(x + 7, FIELD.height);
    ctx.lineTo(x + 7, FIELD.height + VIEW_PAD_Y);
  }
  ctx.stroke();
  ctx.restore();
  // Aresta clara do meio-fio e a sombra que ele joga no asfalto, mais baixo.
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 0.9;
  ctx.strokeRect(-1.6, -1.6, FIELD.width + 3.2, FIELD.height + 3.2);
  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(0.2, 0.2, FIELD.width - 0.4, FIELD.height - 0.4);
}

/** Rua do bairro: asfalto velho, remendos, bueiro e faixas apagadas por baixo do giz. */
function drawAsphalt(ctx: CanvasRenderingContext2D, random: () => number) {
  const { width, height } = FIELD;
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#3e4145");
  base.addColorStop(0.5, "#393c40");
  base.addColorStop(1, "#34373b");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Trilhas mais lisas e claras por onde passam os pneus.
  for (const center of [78, 222]) {
    const band = ctx.createLinearGradient(center - 26, 0, center + 26, 0);
    band.addColorStop(0, "rgba(255,255,255,0)");
    band.addColorStop(0.5, "rgba(255,255,255,0.035)");
    band.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = band;
    ctx.fillRect(center - 26, 0, 52, height);
  }
  for (let index = 0; index < 34; index += 1) {
    const light = random() < 0.45;
    blotch(ctx, random() * width, random() * height, 18 + random() * 50, light ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.07)", 0.6 + random() * 0.8);
  }

  // Remendos: asfalto novo, mais escuro, com a borda selada.
  for (let index = 0; index < 4; index += 1) {
    const w = 22 + random() * 40;
    const h = 16 + random() * 34;
    const x = 12 + random() * (width - w - 24);
    const y = 20 + random() * (height - h - 40);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((random() - 0.5) * 0.08);
    ctx.fillStyle = index % 2 === 0 ? "#2e3134" : "#44474a";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    speckle(ctx, random, Math.floor(w * h * 0.5), "rgba(140,142,140,0.22)", 0.3, 0.7, { x: -w / 2, y: -h / 2, w, h });
    ctx.strokeStyle = "rgba(10,10,12,0.45)";
    ctx.lineWidth = 0.9;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Agregado: pedrinhas claras, escuras e alguns grãos de quartzo.
  speckle(ctx, random, 15000, "rgba(140,143,146,0.32)", 0.3, 0.85);
  speckle(ctx, random, 15000, "rgba(18,19,22,0.45)", 0.3, 0.85);
  speckle(ctx, random, 1600, "rgba(214,212,204,0.4)", 0.3, 0.7);

  // Sarjeta de concreto junto ao meio-fio, com juntas e boca de lobo.
  ctx.fillStyle = "rgba(150,150,144,0.26)";
  ctx.fillRect(0, 0, 7, height);
  ctx.fillRect(width - 7, 0, 7, height);
  ctx.strokeStyle = "rgba(20,20,20,0.3)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let y = 10; y < height; y += 24) {
    ctx.moveTo(0, y);
    ctx.lineTo(7, y);
    ctx.moveTo(width - 7, y + 12);
    ctx.lineTo(width, y + 12);
  }
  ctx.stroke();
  ctx.fillStyle = "#1a1b1d";
  ctx.fillRect(0.5, 168, 6, 18);
  ctx.fillStyle = "rgba(120,120,116,0.5)";
  for (let bar = 0; bar < 6; bar += 1) ctx.fillRect(0.5, 169.5 + bar * 2.8, 6, 0.9);

  // Óleo pingado de carro parado.
  for (const [x, y] of [[226, 66], [70, 398], [244, 352]]) blotch(ctx, x + (random() - 0.5) * 20, y + (random() - 0.5) * 20, 7 + random() * 6, "rgba(8,8,14,0.28)", 0.7);

  // Rachaduras (sombra larga clara por baixo do risco escuro).
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let index = 0; index < 7; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const steps = 10 + Math.floor(random() * 16);
    const state = random() * 1e9;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1.8;
    crack(ctx, seededRandom(state), x, y, steps);
    ctx.strokeStyle = "rgba(8,8,10,0.75)";
    ctx.lineWidth = 0.65;
    crack(ctx, seededRandom(state), x, y, steps);
  }

  // Faixa dupla amarela no meio da rua, gasta pelo tempo (bem fraca: o jogo vem antes).
  ctx.fillStyle = "rgba(222,178,48,0.2)";
  for (const lane of [width / 2 - 4, width / 2 + 2.4]) {
    for (let y = 0; y < height; y += 4) {
      if (random() < 0.22) continue;
      ctx.fillRect(lane, y, 1.6, 4 + random() * 0.5);
    }
  }
  // Faixa de pedestre perto do gol de cima, fora da área, e a linha de retenção.
  ctx.fillStyle = "rgba(236,236,230,0.1)";
  for (let x = 14; x < width - 14; x += 17) {
    for (let y = 104; y < 134; y += 3) {
      if (random() < 0.18) continue;
      ctx.fillRect(x, y, 8.5, 3);
    }
  }
  ctx.fillStyle = "rgba(236,236,230,0.09)";
  ctx.fillRect(10, 141, width - 20, 2.4);
  // Gastos de pneu por cima da tinta.
  speckle(ctx, random, 1400, "rgba(52,55,59,0.55)", 0.4, 1.1, { x: 0, y: 100, w: width, h: 46 });

  // Bueiro de ferro fundido.
  const mx = 236;
  const my = 300;
  ctx.fillStyle = "#1f2022";
  ctx.beginPath();
  ctx.arc(mx, my, 12, 0, Math.PI * 2);
  ctx.fill();
  const iron = ctx.createRadialGradient(mx - 3, my - 3, 1, mx, my, 10.5);
  iron.addColorStop(0, "#5a5652");
  iron.addColorStop(1, "#403d3a");
  ctx.fillStyle = iron;
  ctx.beginPath();
  ctx.arc(mx, my, 10.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, 9, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(20,20,20,0.55)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let offset = -10; offset <= 10; offset += 2.6) {
    ctx.moveTo(mx + offset - 10, my - 10);
    ctx.lineTo(mx + offset + 10, my + 10);
    ctx.moveTo(mx + offset + 10, my - 10);
    ctx.lineTo(mx + offset - 10, my + 10);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(170,165,150,0.35)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(mx, my, 9.6, 0, Math.PI * 2);
  ctx.stroke();
  blotch(ctx, mx + 4, my + 3, 6, "rgba(150,82,36,0.25)");
}

/** Terrão: terra batida avermelhada, pedregulho, sulco de pneu e tufos nas beiradas. */
function drawDirt(ctx: CanvasRenderingContext2D, random: () => number) {
  const { width, height } = FIELD;
  const base = ctx.createLinearGradient(0, 0, width * 0.3, height);
  base.addColorStop(0, "#9b6741");
  base.addColorStop(0.5, "#8d5b39");
  base.addColorStop(1, "#7f5033");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  for (let index = 0; index < 46; index += 1) {
    const dusty = random() < 0.55;
    blotch(ctx, random() * width, random() * height, 22 + random() * 70, dusty ? "rgba(214,172,120,0.11)" : "rgba(64,36,20,0.12)", 0.5 + random());
  }
  // Áreas pisadas: boca do gol e círculo central ficam mais claras e fofas.
  blotch(ctx, width / 2, 16, 70, "rgba(220,186,140,0.2)", 0.5);
  blotch(ctx, width / 2, height - 16, 70, "rgba(220,186,140,0.2)", 0.5);
  blotch(ctx, width / 2, height / 2, 60, "rgba(220,186,140,0.12)", 0.8);
  // Torrões e pedregulho.
  ctx.fillStyle = "rgba(60,34,20,0.12)";
  ctx.beginPath();
  for (let index = 0; index < 2600; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const r = 0.8 + random() * 2.4;
    ctx.moveTo(x + r, y);
    ctx.ellipse(x, y, r, r * (0.5 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2);
  }
  ctx.fill();
  speckle(ctx, random, 5200, "rgba(222,190,150,0.3)", 0.35, 1.1);
  speckle(ctx, random, 5200, "rgba(58,32,18,0.38)", 0.35, 1.1);
  speckle(ctx, random, 900, "rgba(150,146,138,0.55)", 0.6, 1.6);

  // Sulcos de pneu: um carro atravessou o campo com chão molhado.
  const ruts = [-7, 7];
  for (const offset of ruts) {
    const path = (context: CanvasRenderingContext2D) => {
      context.beginPath();
      context.moveTo(40 + offset, -10);
      context.bezierCurveTo(110 + offset, 140, 250 + offset, 260, 210 + offset, height + 10);
    };
    ctx.lineCap = "round";
    path(ctx);
    ctx.strokeStyle = "rgba(228,196,156,0.12)";
    ctx.lineWidth = 7.5;
    ctx.stroke();
    path(ctx);
    ctx.strokeStyle = "rgba(52,30,18,0.24)";
    ctx.lineWidth = 4.5;
    ctx.stroke();
    path(ctx);
    ctx.setLineDash([0.9, 1.6]);
    ctx.strokeStyle = "rgba(40,22,12,0.3)";
    ctx.lineWidth = 3.6;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Poça seca num canto e marcas de chuteira perto dos gols.
  blotch(ctx, 262, 418, 20, "rgba(44,26,16,0.3)", 0.6);
  for (let index = 0; index < 60; index += 1) {
    const y = random() < 0.5 ? random() * 70 : height - random() * 70;
    blotch(ctx, width / 2 + (random() - 0.5) * 150, y, 1.6 + random(), "rgba(50,28,16,0.35)", 1.6);
  }
  // Tufos de capim nas beiradas, onde ninguém pisa.
  ctx.lineCap = "round";
  ctx.lineWidth = 0.55;
  const greens = ["rgba(104,128,58,0.75)", "rgba(138,152,74,0.7)", "rgba(78,104,44,0.75)", "rgba(168,160,86,0.6)"];
  for (let tuft = 0; tuft < 90; tuft += 1) {
    const edge = Math.floor(random() * 4);
    const inset = random() * random() * 14;
    const x = edge === 0 ? inset : edge === 1 ? width - inset : random() * width;
    const y = edge === 2 ? inset : edge === 3 ? height - inset : random() * height;
    ctx.strokeStyle = greens[tuft % greens.length];
    ctx.beginPath();
    for (let blade = 0; blade < 7; blade += 1) {
      const angle = -Math.PI / 2 + (random() - 0.5) * 2.2;
      const length = 1.5 + random() * 3.2;
      ctx.moveTo(x + (random() - 0.5) * 2, y + (random() - 0.5) * 2);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    }
    ctx.stroke();
  }
}

/** Quadra da praça: concreto pintado, juntas de dilatação e as linhas apagadas do basquete. */
function drawConcrete(ctx: CanvasRenderingContext2D, random: () => number) {
  const { width, height } = FIELD;
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#41755f");
  base.addColorStop(0.5, "#3c6e59");
  base.addColorStop(1, "#386853");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  // Marcas do rolo de pintura no sentido do comprimento.
  for (let x = 0; x < width; x += 9) {
    ctx.fillStyle = `rgba(255,255,255,${(0.012 + random() * 0.02).toFixed(3)})`;
    ctx.fillRect(x, 0, 9, height);
  }
  for (let index = 0; index < 26; index += 1) {
    blotch(ctx, random() * width, random() * height, 20 + random() * 50, random() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)");
  }
  speckle(ctx, random, 5000, "rgba(255,255,255,0.06)", 0.3, 0.7);
  speckle(ctx, random, 5000, "rgba(0,0,0,0.08)", 0.3, 0.7);

  // Tinta gasta onde mais se pisa: o concreto cinza aparece por baixo.
  const worn = [[width / 2, 30, 46], [width / 2, height - 30, 46], [width / 2, height / 2, 34], [width / 2, FIELD.penaltyDistance, 16], [width / 2, height - FIELD.penaltyDistance, 16]];
  for (const [x, y, radius] of worn) {
    ctx.fillStyle = "rgba(150,152,144,0.16)";
    ctx.beginPath();
    for (let chip = 0; chip < 160; chip += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius;
      const r = 0.6 + random() * 2.6;
      const cx = x + Math.cos(angle) * distance;
      const cy = y + Math.sin(angle) * distance * 0.7;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Linhas antigas do basquete (quadra poliesportiva), amarelo bem fraco.
  ctx.strokeStyle = "rgba(240,204,70,0.2)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 30, 0, Math.PI * 2);
  for (const [y, dir] of [[0, 1], [height, -1]] as const) {
    ctx.moveTo(width / 2 - 30, y);
    ctx.lineTo(width / 2 - 30, y + dir * 104);
    ctx.lineTo(width / 2 + 30, y + dir * 104);
    ctx.lineTo(width / 2 + 30, y);
    ctx.moveTo(width / 2 + 30, y + dir * 104);
    ctx.arc(width / 2, y + dir * 104, 30, 0, Math.PI, dir < 0);
    ctx.moveTo(18, y);
    ctx.lineTo(18, y + dir * 22);
    ctx.moveTo(width - 18, y);
    ctx.lineTo(width - 18, y + dir * 22);
    ctx.moveTo(18, y + dir * 22);
    ctx.bezierCurveTo(30, y + dir * 160, width - 30, y + dir * 160, width - 18, y + dir * 22);
  }
  ctx.stroke();

  // Juntas de dilatação das placas de concreto.
  ctx.strokeStyle = "rgba(10,22,16,0.35)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let y = height / 8; y < height; y += height / 8) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  for (let x = width / 4; x < width; x += width / 4) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let y = height / 8 + 0.7; y < height; y += height / 8) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  // Trincas finas e marcas pretas de borracha (tênis freando).
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(14,28,22,0.5)";
  ctx.lineWidth = 0.4;
  for (let index = 0; index < 5; index += 1) crack(ctx, random, random() * width, random() * height, 8 + Math.floor(random() * 12));
  ctx.strokeStyle = "rgba(10,12,12,0.16)";
  ctx.lineWidth = 1.1;
  for (let index = 0; index < 40; index += 1) {
    const x = 20 + random() * (width - 40);
    const y = 20 + random() * (height - 40);
    const angle = random() * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x, y, 4 + random() * 8, angle, angle + 0.5 + random() * 0.8);
    ctx.stroke();
  }
}

const STREET_LINES: Record<BotaoStreetVariant, LineStyle> = {
  // Giz no asfalto: fino, tremido, com pó em volta.
  0: { wobble: 0.65, width: 1.55, rgb: "246, 246, 238", alpha: [0.5, 0.82], halo: 0.07, dust: 0.22 },
  // Cal na terra: mais largo, mais torto, espalhando pó.
  1: { wobble: 1.05, width: 2.3, rgb: "248, 244, 226", alpha: [0.55, 0.85], halo: 0.1, dust: 0.3 },
  // Tinta de régua no concreto: reta e firme.
  2: { wobble: 0, width: 1.9, rgb: "250, 250, 246", alpha: [0.82, 0.94], halo: 0, dust: 0 },
};

/**
 * Pinta o piso de rua (e as linhas) em unidades de campo. `curb` inclui o
 * meio-fio em volta da mesa (2D). Caro: chamar só para assar uma imagem.
 */
function drawStreetSurface(ctx: CanvasRenderingContext2D, variant: BotaoStreetVariant, seed: number, curb: boolean) {
  const random = seededRandom(seed ^ (0x9e3779b9 * (variant + 1)));
  ctx.save();
  if (curb) drawStreetCurb(ctx, random);
  ctx.beginPath();
  ctx.rect(0, 0, FIELD.width, FIELD.height);
  ctx.clip();
  if (variant === 1) drawDirt(ctx, random);
  else if (variant === 2) drawConcrete(ctx, random);
  else drawAsphalt(ctx, random);
  drawStreetLines(ctx, random, STREET_LINES[variant]);
  ctx.restore();
}

/**
 * A rua do 2D pronta num canvas fora da tela, na resolução do canvas que pede
 * (2, 3 ou 4 px por unidade). Guarda até duas (partida + replay); fora do
 * navegador devolve null e quem chama desenha direto.
 */
function streetTableImage(ctx: CanvasRenderingContext2D): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const transform = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  const pixels = transform ? Math.hypot(transform.a, transform.b) : 3;
  const scale = pixels <= 2.2 ? 2 : pixels <= 3.2 ? 3 : 4;
  const cached = streetTables.find((entry) => entry.scale === scale);
  if (cached) return cached.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = VIEW_WIDTH * scale;
  canvas.height = VIEW_HEIGHT * scale;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(scale, 0, 0, scale, VIEW_PAD_X * scale, VIEW_PAD_Y * scale);
  drawStreetSurface(context, 0, STREET_2D_SEED, true);
  streetTables.push({ scale, canvas });
  if (streetTables.length > STREET_CACHE_LIMIT) {
    const dropped = streetTables.shift();
    // Solta o bitmap já: o GC do canvas pode demorar e são megabytes.
    if (dropped) dropped.canvas.width = dropped.canvas.height = 0;
  }
  return canvas;
}

function drawStreetTable(ctx: CanvasRenderingContext2D) {
  const image = streetTableImage(ctx);
  if (image) ctx.drawImage(image, -VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT);
  else drawStreetSurface(ctx, 0, STREET_2D_SEED, true);
}

function drawField(ctx: CanvasRenderingContext2D, userColor: string, cpuColor: string, theme: BotaoFieldTheme) {
  const { width, height } = FIELD;
  if (theme === "street") {
    // Uma imagem pronta (meio-fio, asfalto e giz) e os gols, que levam as cores dos times.
    drawStreetTable(ctx);
    drawGoal(ctx, 0, -1, cpuColor);
    drawGoal(ctx, height, 1, userColor);
    return;
  }
  const futsal = isFutsalTheme(theme);
  ctx.save();
  // Tabelas da mesa
  ctx.fillStyle = futsal ? FUTSAL_COURTS[theme].border : "#0b2517";
  roundRect(ctx, -VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT, 14);
  ctx.fill();

  drawFieldPattern(ctx, theme, width, height);

  ctx.strokeStyle = futsal ? "rgba(245, 249, 255, 0.68)" : "rgba(245, 247, 242, 0.34)";
  ctx.lineWidth = futsal ? 1.8 : 1.6;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(width / 2, height / 2, FIELD.centerRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = futsal ? "rgba(245, 249, 255, 0.72)" : "rgba(245, 247, 242, 0.4)";
  ctx.fill();

  if (futsal) {
    // Áreas arredondadas lembram uma quadra de futsal; a física continua idêntica.
    const areaRadius = Math.min(48, FIELD.areaWidth * 0.46);
    ctx.strokeStyle = "rgba(245, 249, 255, 0.58)";
    ctx.beginPath();
    ctx.arc(width / 2, 0, areaRadius, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width / 2, height, areaRadius, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else {
    // Áreas tradicionais do campo de futebol.
    const areaX = (width - FIELD.areaWidth) / 2;
    ctx.strokeStyle = "rgba(245, 247, 242, 0.28)";
    ctx.strokeRect(areaX, 0, FIELD.areaWidth, FIELD.areaDepth);
    ctx.strokeRect(areaX, height - FIELD.areaDepth, FIELD.areaWidth, FIELD.areaDepth);
  }

  // Marca do pênalti
  ctx.fillStyle = futsal ? "rgba(245, 249, 255, 0.66)" : "rgba(245, 247, 242, 0.34)";
  for (const spotY of [FIELD.penaltyDistance, height - FIELD.penaltyDistance]) {
    ctx.beginPath();
    ctx.arc(width / 2, spotY, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGoal(ctx, 0, -1, cpuColor);
  drawGoal(ctx, height, 1, userColor);
  ctx.restore();
}

/**
 * Mesmo gramado e mesmas linhas da mesa 2D — vira a textura do campo no modo 3D.
 * No campo de rua, `streetVariant` escolhe o piso (asfalto, terra ou concreto)
 * e a semente da partida espalha os detalhes; a mesa 2D é sempre a rua do bairro.
 */
export function drawFieldSurface(ctx: CanvasRenderingContext2D, setup: BotaoMatchSetup, streetVariant?: BotaoStreetVariant) {
  const theme = fieldThemeForMatch(setup);
  if (theme === "street") {
    drawStreetSurface(ctx, streetVariant ?? 0, setup.seed, false);
    drawGoal(ctx, 0, -1, setup.cpuTeam.primary);
    drawGoal(ctx, FIELD.height, 1, setup.userTeam.primary);
    return;
  }
  drawField(ctx, setup.userTeam.primary, setup.cpuTeam.primary, theme);
}

function colorWithAlpha(color: string, alpha: number) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const value = Number.parseInt(color.slice(1), 16);
    return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  return color;
}

/** Halo baixo no feltro: mantém a bola legível sem parecer maior. */
function drawBallFocusLight(ctx: CanvasRenderingContext2D, ball: BotaoBody) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, FIELD.width, FIELD.height);
  ctx.clip();
  const ballLight = ctx.createRadialGradient(ball.x, ball.y, 6, ball.x, ball.y, 118);
  ballLight.addColorStop(0, "rgba(244, 241, 204, 0.115)");
  ballLight.addColorStop(0.42, "rgba(244, 241, 204, 0.035)");
  ballLight.addColorStop(1, "rgba(244, 241, 204, 0)");
  ctx.fillStyle = ballLight;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.restore();
}

/** Luz de transmissão e textura microscópica sem alterar a leitura das linhas. */
function drawShowcaseAtmosphere(
  ctx: CanvasRenderingContext2D,
  time: number,
  userColor: string,
  cpuColor: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, FIELD.width, FIELD.height);
  ctx.clip();

  const sweepX = FIELD.width * (0.5 + Math.sin(time / 5400) * 0.34);
  const sweep = ctx.createLinearGradient(sweepX - 62, 0, sweepX + 62, 0);
  sweep.addColorStop(0, "rgba(255,255,255,0)");
  sweep.addColorStop(0.5, "rgba(255,255,255,0.032)");
  sweep.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.fillStyle = sweep;
  ctx.transform(1, 0, -0.12, 1, 28, 0);
  ctx.fillRect(sweepX - 70, 0, 140, FIELD.height);
  ctx.restore();

  // Fibras e marcas do feltro: visíveis de perto, silenciosas de longe.
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "rgba(238, 246, 233, 0.12)";
  ctx.lineWidth = 0.55;
  for (let index = 0; index < 72; index += 1) {
    const x = (index * 83) % FIELD.width;
    const y = (index * 137) % FIELD.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2.5 + (index % 4), y + 0.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const topSignal = ctx.createLinearGradient(0, 0, FIELD.width, 0);
  topSignal.addColorStop(0, colorWithAlpha(cpuColor, 0));
  topSignal.addColorStop(0.5, colorWithAlpha(cpuColor, 0.68));
  topSignal.addColorStop(1, colorWithAlpha(cpuColor, 0));
  ctx.fillStyle = topSignal;
  ctx.fillRect(28, -1.5, FIELD.width - 56, 2.5);
  const bottomSignal = ctx.createLinearGradient(0, 0, FIELD.width, 0);
  bottomSignal.addColorStop(0, colorWithAlpha(userColor, 0));
  bottomSignal.addColorStop(0.5, colorWithAlpha(userColor, 0.68));
  bottomSignal.addColorStop(1, colorWithAlpha(userColor, 0));
  ctx.fillStyle = bottomSignal;
  ctx.fillRect(28, FIELD.height - 1, FIELD.width - 56, 2.5);
  ctx.restore();

  // Parafusos e moldura física da mesa vivem fora do gramado.
  ctx.save();
  for (const [x, y] of [[-4, -12], [FIELD.width + 4, -12], [-4, FIELD.height + 12], [FIELD.width + 4, FIELD.height + 12]]) {
    ctx.fillStyle = "rgba(223, 227, 214, 0.38)";
    ctx.beginPath();
    ctx.arc(x, y, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(4, 11, 8, 0.68)";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(x - 1, y);
    ctx.lineTo(x + 1, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShowcaseWake(ctx: CanvasRenderingContext2D, body: BotaoBody, color: string) {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed < 72) return;
  const nx = body.vx / speed;
  const ny = body.vy / speed;
  const length = Math.min(44, speed * 0.055);
  const wake = ctx.createLinearGradient(body.x, body.y, body.x - nx * length, body.y - ny * length);
  wake.addColorStop(0, colorWithAlpha(color, 0.47));
  wake.addColorStop(1, colorWithAlpha(color, 0));
  ctx.save();
  ctx.strokeStyle = wake;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.2, body.radius * 0.16);
  ctx.beginPath();
  ctx.moveTo(body.x - nx * body.radius * 0.4, body.y - ny * body.radius * 0.4);
  ctx.lineTo(body.x - nx * (body.radius + length), body.y - ny * (body.radius + length));
  ctx.stroke();
  ctx.restore();
}

function drawDisc(
  ctx: CanvasRenderingContext2D,
  body: BotaoBody,
  colors: { primary: string; secondary: string },
  options: { selected: boolean; ready: boolean; pulse: number; uprightLabel?: boolean; mirrored?: boolean; appearance?: PlayerAppearance | null; hideUserMarker?: boolean; showcase?: boolean; showcaseAngle?: number; hideStamina?: boolean },
) {
  ctx.save();
  ctx.translate(body.x, body.y);

  // Sombra da peça na mesa
  ctx.fillStyle = options.showcase ? "rgba(0, 0, 0, 0.42)" : "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(1.5, 3, body.radius * 0.95, body.radius * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();

  if (options.showcase) {
    const ambient = ctx.createRadialGradient(-body.radius * 0.26, -body.radius * 0.34, 1, 0, 0, body.radius * 1.22);
    ambient.addColorStop(0, "rgba(255,255,255,.24)");
    ambient.addColorStop(0.46, "rgba(255,255,255,.025)");
    ambient.addColorStop(1, "rgba(0,0,0,.34)");
    ctx.fillStyle = ambient;
    ctx.beginPath();
    ctx.arc(0, 0, body.radius + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (body.isUserPlayer && !options.hideUserMarker) {
    ctx.strokeStyle = `rgba(255, 199, 44, ${0.35 + options.pulse * 0.35})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, body.radius + 4.5 + options.pulse * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (options.ready) {
    ctx.strokeStyle = `rgba(99, 227, 107, ${0.16 + options.pulse * 0.2})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, body.radius + 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  const body3d = ctx.createLinearGradient(0, -body.radius, 0, body.radius);
  body3d.addColorStop(0, colors.primary);
  body3d.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.beginPath();
  ctx.arc(0, 0, body.radius, 0, Math.PI * 2);
  ctx.fillStyle = colors.primary;
  ctx.fill();
  ctx.fillStyle = body3d;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;

  if (options.appearance) {
    ctx.save();
    if (options.uprightLabel) ctx.rotate(-Math.PI / 2);
    if (options.mirrored) ctx.rotate(Math.PI);
    drawPlayerBust(ctx, options.appearance, colors.primary, colors.secondary, body.radius);
    ctx.restore();
  }

  const highlightedPlayer = body.isUserPlayer && !options.hideUserMarker;
  ctx.strokeStyle = highlightedPlayer ? "#ffc72c" : colors.secondary;
  ctx.lineWidth = highlightedPlayer ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, body.radius - 1.4, 0, Math.PI * 2);
  ctx.stroke();

  if (options.selected) {
    ctx.strokeStyle = "#f5f7f2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, body.radius + 2.5, 0, Math.PI * 2);
    ctx.stroke();
    if (options.showcase) {
      ctx.save();
      ctx.rotate(options.showcaseAngle ?? 0);
      ctx.strokeStyle = "rgba(255, 199, 44, 0.9)";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([9, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, body.radius + 6.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Anel de fôlego; o Bobonline (setup.noStamina) não tem fôlego e não desenha.
  if (body.playerId && !options.hideStamina) {
    const stamina = Math.max(0, Math.min(100, body.stamina));
    ctx.strokeStyle = stamina < 35 ? "#ff7c6e" : stamina < 60 ? "#ffc72c" : "rgba(245,247,242,.56)";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, body.radius + 2.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (stamina / 100));
    ctx.stroke();
  }

  // O canvas inteiro gira no modo horizontal. Contra-rotacionar somente a
  // tipografia preserva a orientação física dos discos e deixa a camisa legível.
  ctx.save();
  if (options.uprightLabel) ctx.rotate(-Math.PI / 2);
  if (options.mirrored) ctx.rotate(Math.PI);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (!options.appearance) {
    ctx.fillStyle = highlightedPlayer ? "#ffc72c" : readableInk(colors.primary);
    ctx.font = `700 ${body.radius * 0.92}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(String(body.number), 0, 0.5);
  }

  if (body.isUserPlayer && !options.hideUserMarker) {
    ctx.fillStyle = "#ffc72c";
    ctx.font = "800 8px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("VC", 0, body.radius + 4);
  }
  ctx.restore();
  ctx.restore();
}

export function bodyAppearance(setup: BotaoMatchSetup, body: BotaoBody): PlayerAppearance | null {
  if (body.playerId && setup.managerRosters) {
    const managerPlayer = [...setup.managerRosters.user.starters, ...setup.managerRosters.user.bench, ...setup.managerRosters.cpu.starters, ...setup.managerRosters.cpu.bench]
      .find((player) => player.id === body.playerId);
    if (managerPlayer?.appearance) return managerPlayer.appearance;
  }
  if (!setup.visuals?.enabled || !body.side) return null;
  if (body.isUserPlayer) return setup.visuals.player;
  const slot = Number.parseInt(body.id.split("-").at(-1) ?? "", 10);
  if (!Number.isFinite(slot)) return null;
  return body.side === "user" ? setup.visuals.user[slot] ?? null : setup.visuals.cpu[slot] ?? null;
}

function liveSpinAngle(ball: BotaoBody): number {
  const previous = liveBallSpin.get(ball);
  if (!previous) {
    liveBallSpin.set(ball, { x: ball.x, y: ball.y, angle: 0 });
    return 0;
  }
  const travel = Math.min(24, Math.hypot(ball.x - previous.x, ball.y - previous.y));
  previous.angle = (previous.angle + travel / Math.max(1, ball.radius) * 0.72) % (Math.PI * 2);
  previous.x = ball.x;
  previous.y = ball.y;
  return previous.angle;
}

function drawBall(ctx: CanvasRenderingContext2D, ball: BotaoBody, rotation = liveSpinAngle(ball)) {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  const glow = ctx.createRadialGradient(0, 0, ball.radius * 0.2, 0, 0, ball.radius * 2.7);
  glow.addColorStop(0, "rgba(255,255,237,.32)");
  glow.addColorStop(0.35, "rgba(255,255,237,.11)");
  glow.addColorStop(1, "rgba(255,255,237,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, ball.radius * 2.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(1, 2, ball.radius, ball.radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  const sprite = loadedBallSprite();
  if (sprite) {
    // A silhueta mantém o tamanho original. Só o miolo da textura recebe
    // zoom, para os gomos continuarem legíveis sem mudar colisões ou alcance.
    const diameter = ball.radius * 2.2;
    const textureInset = 18;
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.arc(0, 0, diameter / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      sprite,
      textureInset,
      textureInset,
      sprite.naturalWidth - textureInset * 2,
      sprite.naturalHeight - textureInset * 2,
      -diameter / 2,
      -diameter / 2,
      diameter,
      diameter,
    );
  } else {
    // Fallback instantâneo enquanto o PNG carrega ou se o asset falhar.
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#f7f9f4";
    ctx.fill();
    ctx.strokeStyle = "rgba(10, 24, 16, 0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(12, 28, 18, 0.8)";
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function replayBallSpin(replay: BotaoGoalReplay, bodyIndex: number, frameIndex: number, blend: number, radius: number): number {
  const scale = Math.max(1, replay.coordinateScale ?? 1);
  let travel = 0;
  for (let index = 1; index <= frameIndex; index += 1) {
    const previous = replay.frames[index - 1];
    const current = replay.frames[index];
    if (!previous || !current) continue;
    const dx = ((current.positions[bodyIndex * 2] ?? 0) - (previous.positions[bodyIndex * 2] ?? 0)) / scale;
    const dy = ((current.positions[bodyIndex * 2 + 1] ?? 0) - (previous.positions[bodyIndex * 2 + 1] ?? 0)) / scale;
    travel += Math.hypot(dx, dy);
  }
  const current = replay.frames[frameIndex];
  const next = replay.frames[Math.min(replay.frames.length - 1, frameIndex + 1)];
  if (current && next) {
    const dx = ((next.positions[bodyIndex * 2] ?? 0) - (current.positions[bodyIndex * 2] ?? 0)) / scale;
    const dy = ((next.positions[bodyIndex * 2 + 1] ?? 0) - (current.positions[bodyIndex * 2 + 1] ?? 0)) / scale;
    travel += Math.hypot(dx, dy) * Math.max(0, Math.min(1, blend));
  }
  return travel / Math.max(1, radius) * 0.72;
}

function drawAim(ctx: CanvasRenderingContext2D, disc: BotaoBody, aim: BotaoAimView, showcase = false, remote = false) {
  const dx = disc.x - aim.dragX;
  const dy = disc.y - aim.dragY;
  const length = Math.hypot(dx, dy);
  if (length < 2) return;
  const nx = dx / length;
  const ny = dy / length;
  const reach = 40 + aim.ratio * 150;
  const tipX = disc.x + nx * reach;
  const tipY = disc.y + ny * reach;
  const color = aim.valid ? (aim.ratio > 0.82 ? "#ff7a45" : "#ffc72c") : "rgba(245, 247, 242, 0.35)";

  ctx.save();
  // Mira do adversário (prévia da rede, Bobonline): mais apagada que a sua.
  if (remote) ctx.globalAlpha = 0.7;
  // Prévia de onde o botão para. É o alcance exato do atrito, sem contar
  // colisões — informação justa: é o SEU toque, você tem direito de saber a força.
  if (aim.valid) {
    const travel = distanceForSpeed(shotSpeedFor(disc.power) * aim.ratio);
    const stopX = disc.x + nx * travel;
    const stopY = disc.y + ny * travel;
    ctx.strokeStyle = "rgba(245, 247, 242, 0.18)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(disc.x, disc.y);
    ctx.lineTo(stopX, stopY);
    ctx.stroke();
    if (showcase) {
      ctx.strokeStyle = aim.ratio > 0.82 ? "rgba(255,122,69,.2)" : "rgba(255,199,44,.16)";
      ctx.lineWidth = disc.radius * 1.35;
      ctx.beginPath();
      ctx.moveTo(disc.x + nx * (disc.radius + 8), disc.y + ny * (disc.radius + 8));
      ctx.lineTo(stopX, stopY);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.arc(stopX, stopY, disc.radius + 5 + Math.sin(aim.ratio * Math.PI) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(245, 247, 242, 0.3)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(stopX, stopY, disc.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Linha do estilingue (para trás, onde o dedo está)
  ctx.strokeStyle = "rgba(245, 247, 242, 0.3)";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(disc.x, disc.y);
  ctx.lineTo(aim.dragX, aim.dragY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Direção do toque
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(disc.x + nx * (disc.radius + 2), disc.y + ny * (disc.radius + 2));
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  const angle = Math.atan2(ny, nx);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX + Math.cos(angle) * 9, tipY + Math.sin(angle) * 9);
  ctx.lineTo(tipX + Math.cos(angle + 2.5) * 8, tipY + Math.sin(angle + 2.5) * 8);
  ctx.lineTo(tipX + Math.cos(angle - 2.5) * 8, tipY + Math.sin(angle - 2.5) * 8);
  ctx.closePath();
  ctx.fill();

  // Medidor de força em volta do botão
  ctx.strokeStyle = "rgba(6, 17, 13, 0.55)";
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(disc.x, disc.y, disc.radius + 8, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(disc.x, disc.y, disc.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * aim.ratio);
  ctx.stroke();
  ctx.restore();
}

/** Rastro da bola: dá para ler a jogada mesmo olhando de longe. */
function drawTrail(ctx: CanvasRenderingContext2D, trail: Array<{ x: number; y: number }>, radius: number) {
  if (trail.length < 2) return;
  ctx.save();
  const first = trail[0];
  const last = trail[trail.length - 1];
  const beam = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
  beam.addColorStop(0, "rgba(247,249,244,0)");
  beam.addColorStop(1, "rgba(247,249,244,.62)");
  ctx.strokeStyle = beam;
  ctx.lineWidth = radius * 0.7;
  ctx.lineCap = "round";
  ctx.beginPath();
  trail.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
  ctx.stroke();
  for (let index = 0; index < trail.length; index += 1) {
    const fade = (index + 1) / trail.length;
    ctx.globalAlpha = fade * 0.3;
    ctx.fillStyle = "#f7f9f4";
    ctx.beginPath();
    ctx.arc(trail[index].x, trail[index].y, radius * (0.35 + fade * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGoalFlash(ctx: CanvasRenderingContext2D, intensity: number, side: BotaoSide | null, showcase = false) {
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.5, intensity * 0.45);
  ctx.fillStyle = side === "user" ? "#ffc72c" : "#ff5a4e";
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  if (showcase) {
    ctx.globalCompositeOperation = "screen";
    const originY = side === "user" ? 0 : FIELD.height;
    const blast = ctx.createRadialGradient(FIELD.width / 2, originY, 8, FIELD.width / 2, originY, FIELD.width * 0.9);
    blast.addColorStop(0, side === "user" ? "rgba(255,214,70,.95)" : "rgba(255,92,77,.9)");
    blast.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = blast;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  ctx.restore();
}

function drawPenaltyKeeperTrack(ctx: CanvasRenderingContext2D, y: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 199, 44, 0.22)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(GOAL_LEFT, y);
  ctx.lineTo(GOAL_RIGHT, y);
  ctx.stroke();
  ctx.restore();
}

export function drawMatch(
  ctx: CanvasRenderingContext2D,
  state: BotaoMatchState,
  view: BotaoRenderView,
  time: number,
) {
  mirrorTable(ctx, view.mirrored);
  const userColors = { primary: state.setup.userTeam.primary, secondary: state.setup.userTeam.secondary };
  const cpuColors = { primary: state.setup.cpuTeam.primary, secondary: state.setup.cpuTeam.secondary };
  const pulse = (Math.sin(time / 320) + 1) / 2;
  const fieldTheme = fieldThemeForMatch(state.setup);
  const ball = state.bodies.find((body) => body.kind === "ball");

  ctx.clearRect(-VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT);
  drawField(ctx, userColors.primary, cpuColors.primary, fieldTheme);
  if (ball) drawBallFocusLight(ctx, ball);
  if (view.showcase) drawShowcaseAtmosphere(ctx, time, userColors.primary, cpuColors.primary);
  drawGoalFlash(ctx, view.goalFlash, view.goalFlashSide, view.showcase);
  view.underlay?.(ctx);

  const visible = view.penaltyMode ? penaltyVisibleBodies(state) : state.bodies;
  if (view.penaltyMode) {
    const keeper = visible.find((body) => body.kind === "keeper");
    if (keeper) drawPenaltyKeeperTrack(ctx, keeper.y);
  }

  drawTrail(ctx, view.trail, FIELD.ballRadius);

  for (const body of visible) {
    if (body.kind === "post") continue;
    if (body.kind === "ball") continue;
    const colors = body.side === "user" ? userColors : cpuColors;
    if (view.showcase) drawShowcaseWake(ctx, body, colors.primary);
    drawDisc(ctx, body, colors, {
      selected: view.selectedId === body.id,
      ready: view.highlight && body.side === state.turn,
      pulse,
      uprightLabel: view.uprightLabels,
      mirrored: view.mirrored,
      appearance: bodyAppearance(state.setup, body),
      hideUserMarker: view.hideUserMarker,
      showcase: view.showcase,
      showcaseAngle: time / 620,
      hideStamina: state.setup.noStamina,
    });
  }

  const visibleBall = visible.find((body) => body.kind === "ball");
  if (visibleBall) drawBall(ctx, visibleBall);

  if (view.aim) {
    const disc = state.bodies.find((body) => body.id === view.aim?.bodyId);
    if (disc) drawAim(ctx, disc, view.aim, view.showcase, view.remoteAim);
  }
}

/**
 * Desenha um quadro vetorial gravado, sem reexecutar física, IA ou relógio.
 * `mirrored`: mesa girada 180° (convidado do Bobonline); os números ficam de pé.
 */
export function drawReplayFrame(
  ctx: CanvasRenderingContext2D,
  setup: BotaoMatchSetup,
  replay: BotaoGoalReplay,
  frameIndex: number,
  blend = 0,
  mirrored = false,
) {
  mirrorTable(ctx, mirrored);
  const frame = replay.frames[Math.max(0, Math.min(replay.frames.length - 1, frameIndex))];
  if (!frame) return;
  const nextFrame = replay.frames[Math.min(replay.frames.length - 1, frameIndex + 1)] ?? frame;
  const interpolation = Math.max(0, Math.min(1, blend));
  const coordinateScale = Math.max(1, replay.coordinateScale ?? 1);
  const fieldTheme = fieldThemeForMatch(setup);
  ctx.clearRect(-VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT);
  drawField(ctx, setup.userTeam.primary, setup.cpuTeam.primary, fieldTheme);
  const renderedBodies = replay.bodies.map((body, index): BotaoBody => ({
    ...body,
    x: ((frame.positions[index * 2] ?? 0) +
      ((nextFrame.positions[index * 2] ?? frame.positions[index * 2] ?? 0) - (frame.positions[index * 2] ?? 0)) * interpolation) / coordinateScale,
    y: ((frame.positions[index * 2 + 1] ?? 0) +
      ((nextFrame.positions[index * 2 + 1] ?? frame.positions[index * 2 + 1] ?? 0) - (frame.positions[index * 2 + 1] ?? 0)) * interpolation) / coordinateScale,
    vx: 0,
    vy: 0,
    mass: body.kind === "ball" ? 0.4 : 2,
    friction: 0,
    label: body.kind === "ball" ? "Bola" : `#${body.number}`,
    power: 0,
    control: 0,
    slot: index - 1,
    stamina: 100,
    distanceActive: 0,
  }));
  renderedBodies.forEach((rendered) => {
    if (rendered.kind === "ball") return;
    const colors = rendered.side === "user"
      ? { primary: setup.userTeam.primary, secondary: setup.userTeam.secondary }
      : { primary: setup.cpuTeam.primary, secondary: setup.cpuTeam.secondary };
    drawDisc(ctx, rendered, colors, { selected: false, ready: false, pulse: 0, mirrored, appearance: bodyAppearance(setup, rendered), hideUserMarker: setup.localControl });
  });
  const ball = renderedBodies.find((body) => body.kind === "ball");
  if (ball) {
    const ballIndex = renderedBodies.indexOf(ball);
    drawBall(ctx, ball, replayBallSpin(replay, ballIndex, frameIndex, interpolation, ball.radius));
  }
}

/** No pênalti só ficam na mesa a bola, o batedor e o goleiro. */
function penaltyVisibleBodies(state: BotaoMatchState): BotaoBody[] {
  if (!state.penalties) return state.bodies;
  const shooter = penaltyShooter(state);
  const keeper = penaltyKeeper(state);
  return state.bodies.filter((body) => body.kind === "ball" || body.id === shooter.id || body.id === keeper.id);
}

/**
 * Converte um ponto do canvas (px) para unidades de campo, inclusive com a mesa deitada no desktop
 * e com a mesa girada 180° (`mirrored`, convidado do Bobonline).
 */
export function toFieldPoint(clientX: number, clientY: number, rect: DOMRect, rotated = false, mirrored = false): { x: number; y: number } {
  let x: number;
  let y: number;
  if (rotated) {
    const scale = rect.height / VIEW_WIDTH;
    x = (clientY - rect.top) / scale - VIEW_PAD_X;
    y = VIEW_HEIGHT - VIEW_PAD_Y - (clientX - rect.left) / scale;
  } else {
    const scale = rect.width / VIEW_WIDTH;
    x = (clientX - rect.left) / scale - VIEW_PAD_X;
    y = (clientY - rect.top) / scale - VIEW_PAD_Y;
  }
  // Mesa girada: o ponto volta para as coordenadas do campo (a mesma conta nos dois sentidos).
  return mirrored ? { x: FIELD.width - x, y: FIELD.height - y } : { x, y };
}

/** Mesa girada 180° em volta do centro do campo (convidado do Bobonline), antes de desenhar qualquer coisa. */
function mirrorTable(ctx: CanvasRenderingContext2D, mirrored?: boolean) {
  if (mirrored) ctx.transform(-1, 0, 0, -1, FIELD.width, FIELD.height);
}

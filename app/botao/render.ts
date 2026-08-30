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
import { fieldThemeForMatch, type BotaoFieldTheme } from "./field-themes";
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

function drawFieldPattern(ctx: CanvasRenderingContext2D, theme: BotaoFieldTheme, width: number, height: number) {
  if (theme === "futsal-blue") {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#1979ad");
    gradient.addColorStop(0.52, "#126795");
    gradient.addColorStop(1, "#0d557e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Faixas horizontais em um segundo azul quase igual: diferença pequena,
    // mas suficiente para a quadra rara ter uma identidade mais swag.
    const stripe = height / 10;
    ctx.fillStyle = "rgba(47, 151, 194, 0.12)";
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

function drawField(ctx: CanvasRenderingContext2D, userColor: string, cpuColor: string, theme: BotaoFieldTheme) {
  const { width, height } = FIELD;
  const futsal = theme === "futsal-blue";
  ctx.save();
  // Tabelas da mesa
  ctx.fillStyle = futsal ? "#0a2436" : "#0b2517";
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
  options: { selected: boolean; ready: boolean; pulse: number; uprightLabel?: boolean; appearance?: PlayerAppearance | null; hideUserMarker?: boolean; showcase?: boolean; showcaseAngle?: number },
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

  if (body.playerId) {
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

function bodyAppearance(setup: BotaoMatchSetup, body: BotaoBody): PlayerAppearance | null {
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

function drawAim(ctx: CanvasRenderingContext2D, disc: BotaoBody, aim: BotaoAimView, showcase = false) {
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
      appearance: bodyAppearance(state.setup, body),
      hideUserMarker: view.hideUserMarker,
      showcase: view.showcase,
      showcaseAngle: time / 620,
    });
  }

  const visibleBall = visible.find((body) => body.kind === "ball");
  if (visibleBall) drawBall(ctx, visibleBall);

  if (view.aim) {
    const disc = state.bodies.find((body) => body.id === view.aim?.bodyId);
    if (disc) drawAim(ctx, disc, view.aim, view.showcase);
  }
}

/** Desenha um quadro vetorial gravado, sem reexecutar física, IA ou relógio. */
export function drawReplayFrame(
  ctx: CanvasRenderingContext2D,
  setup: BotaoMatchSetup,
  replay: BotaoGoalReplay,
  frameIndex: number,
  blend = 0,
) {
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
    drawDisc(ctx, rendered, colors, { selected: false, ready: false, pulse: 0, appearance: bodyAppearance(setup, rendered), hideUserMarker: setup.localControl });
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

/** Converte um ponto do canvas (px) para unidades de campo, inclusive com a mesa deitada no desktop. */
export function toFieldPoint(clientX: number, clientY: number, rect: DOMRect, rotated = false): { x: number; y: number } {
  if (rotated) {
    const scale = rect.height / VIEW_WIDTH;
    return {
      x: (clientY - rect.top) / scale - VIEW_PAD_X,
      y: VIEW_HEIGHT - VIEW_PAD_Y - (clientX - rect.left) / scale,
    };
  }
  const scale = rect.width / VIEW_WIDTH;
  return {
    x: (clientX - rect.left) / scale - VIEW_PAD_X,
    y: (clientY - rect.top) / scale - VIEW_PAD_Y,
  };
}

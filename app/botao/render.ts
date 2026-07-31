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
import { readableInk } from "./kits";
import type { BotaoGoalReplay, BotaoMatchSetup, BotaoSide } from "./types";

export const VIEW_PAD_X = 8;
export const VIEW_PAD_Y = FIELD.goalDepth + 8;
export const VIEW_WIDTH = FIELD.width + VIEW_PAD_X * 2;
export const VIEW_HEIGHT = FIELD.height + VIEW_PAD_Y * 2;

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

function drawField(ctx: CanvasRenderingContext2D, userColor: string, cpuColor: string) {
  const { width, height } = FIELD;
  ctx.save();
  // Tabelas da mesa
  ctx.fillStyle = "#0b2517";
  roundRect(ctx, -VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT, 14);
  ctx.fill();

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#145c3a");
  gradient.addColorStop(0.5, "#12522f");
  gradient.addColorStop(1, "#0f4629");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Listras do gramado
  ctx.fillStyle = "rgba(255, 255, 255, 0.028)";
  const stripe = height / 10;
  for (let index = 0; index < 10; index += 2) {
    ctx.fillRect(0, index * stripe, width, stripe);
  }

  ctx.strokeStyle = "rgba(245, 247, 242, 0.34)";
  ctx.lineWidth = 1.6;
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
  ctx.fillStyle = "rgba(245, 247, 242, 0.4)";
  ctx.fill();

  // Áreas
  const areaX = (width - FIELD.areaWidth) / 2;
  ctx.strokeStyle = "rgba(245, 247, 242, 0.28)";
  ctx.strokeRect(areaX, 0, FIELD.areaWidth, FIELD.areaDepth);
  ctx.strokeRect(areaX, height - FIELD.areaDepth, FIELD.areaWidth, FIELD.areaDepth);

  // Marca do pênalti
  ctx.fillStyle = "rgba(245, 247, 242, 0.34)";
  for (const spotY of [FIELD.penaltyDistance, height - FIELD.penaltyDistance]) {
    ctx.beginPath();
    ctx.arc(width / 2, spotY, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGoal(ctx, 0, -1, cpuColor);
  drawGoal(ctx, height, 1, userColor);
  ctx.restore();
}

function drawDisc(ctx: CanvasRenderingContext2D, body: BotaoBody, colors: { primary: string; secondary: string }, options: { selected: boolean; ready: boolean; pulse: number }) {
  ctx.save();
  ctx.translate(body.x, body.y);

  // Sombra da peça na mesa
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(1.5, 3, body.radius * 0.95, body.radius * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();

  if (body.isUserPlayer) {
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

  ctx.strokeStyle = body.isUserPlayer ? "#ffc72c" : colors.secondary;
  ctx.lineWidth = body.isUserPlayer ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, body.radius - 1.4, 0, Math.PI * 2);
  ctx.stroke();

  if (options.selected) {
    ctx.strokeStyle = "#f5f7f2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, body.radius + 2.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = body.isUserPlayer ? "#ffc72c" : readableInk(colors.primary);
  ctx.font = `700 ${body.radius * 0.92}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(body.number), 0, 0.5);

  if (body.isUserPlayer) {
    ctx.fillStyle = "#ffc72c";
    ctx.font = "800 8px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("VC", 0, body.radius + 4);
  }
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, ball: BotaoBody) {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(1, 2, ball.radius, ball.radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.restore();
}

function drawAim(ctx: CanvasRenderingContext2D, disc: BotaoBody, aim: BotaoAimView) {
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

function drawGoalFlash(ctx: CanvasRenderingContext2D, intensity: number, side: BotaoSide | null) {
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.5, intensity * 0.45);
  ctx.fillStyle = side === "user" ? "#ffc72c" : "#ff5a4e";
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
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

  ctx.clearRect(-VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT);
  drawField(ctx, userColors.primary, cpuColors.primary);
  drawGoalFlash(ctx, view.goalFlash, view.goalFlashSide);

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
    drawDisc(ctx, body, colors, {
      selected: view.selectedId === body.id,
      ready: view.highlight && body.side === state.turn,
      pulse,
    });
  }

  const ball = visible.find((body) => body.kind === "ball");
  if (ball) drawBall(ctx, ball);

  if (view.aim) {
    const disc = state.bodies.find((body) => body.id === view.aim?.bodyId);
    if (disc) drawAim(ctx, disc, view.aim);
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
  ctx.clearRect(-VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT);
  drawField(ctx, setup.userTeam.primary, setup.cpuTeam.primary);
  const renderedBodies = replay.bodies.map((body, index): BotaoBody => ({
    ...body,
    x: (frame.positions[index * 2] ?? 0) +
      ((nextFrame.positions[index * 2] ?? frame.positions[index * 2] ?? 0) - (frame.positions[index * 2] ?? 0)) * interpolation,
    y: (frame.positions[index * 2 + 1] ?? 0) +
      ((nextFrame.positions[index * 2 + 1] ?? frame.positions[index * 2 + 1] ?? 0) - (frame.positions[index * 2 + 1] ?? 0)) * interpolation,
    vx: 0,
    vy: 0,
    mass: body.kind === "ball" ? 0.4 : 2,
    friction: 0,
    label: body.kind === "ball" ? "Bola" : `#${body.number}`,
    power: 0,
    control: 0,
    slot: index - 1,
  }));
  renderedBodies.forEach((rendered) => {
    if (rendered.kind === "ball") return;
    const colors = rendered.side === "user"
      ? { primary: setup.userTeam.primary, secondary: setup.userTeam.secondary }
      : { primary: setup.cpuTeam.primary, secondary: setup.cpuTeam.secondary };
    drawDisc(ctx, rendered, colors, { selected: false, ready: false, pulse: 0 });
  });
  const ball = renderedBodies.find((body) => body.kind === "ball");
  if (ball) drawBall(ctx, ball);
}

/** No pênalti só ficam na mesa a bola, o batedor e o goleiro. */
function penaltyVisibleBodies(state: BotaoMatchState): BotaoBody[] {
  if (!state.penalties) return state.bodies;
  const shooter = penaltyShooter(state);
  const keeper = penaltyKeeper(state);
  return state.bodies.filter((body) => body.kind === "ball" || body.id === shooter.id || body.id === keeper.id);
}

/** Converte um ponto do canvas (px) para unidades de campo. */
export function toFieldPoint(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
  const scale = rect.width / VIEW_WIDTH;
  return {
    x: (clientX - rect.left) / scale - VIEW_PAD_X,
    y: (clientY - rect.top) / scale - VIEW_PAD_Y,
  };
}

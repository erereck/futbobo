import { FIELD, GOAL_BOTTOM, GOAL_TOP, MAX_PULL, ballOf, distanceForSpeed, shotSpeedFor } from "./engine";
import type { Body, MatchState, Side } from "./types";

export type Camera = {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
};

export type AimState = { bodyId: string; pointerX: number; pointerY: number } | null;

function contrast(hex: string) {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#101713" : "#ffffff";
}

export function renderMatch(
  canvas: HTMLCanvasElement,
  state: MatchState,
  camera: Camera,
  aim: AimState,
  hoverBodyId: string | null,
  showRoles: boolean,
  showMinimap: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const sx = (x: number) => (x - camera.x) * camera.zoom + width / 2;
  const sy = (y: number) => (y - camera.y) * camera.zoom + height / 2;
  const sr = (v: number) => v * camera.zoom;

  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.8);
  bg.addColorStop(0, "#101a16");
  bg.addColorStop(1, "#030604");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.75)";
  ctx.shadowBlur = sr(42);
  ctx.fillStyle = "#173f28";
  ctx.fillRect(sx(0), sy(0), sr(FIELD.width), sr(FIELD.height));
  ctx.restore();

  ctx.fillStyle = "#247443";
  ctx.fillRect(sx(0), sy(0), sr(FIELD.width), sr(FIELD.height));
  const stripeWidth = FIELD.width / 12;
  for (let i = 0; i < 12; i += 1) {
    if (i % 2 === 0) continue;
    ctx.fillStyle = "rgba(255,255,255,.026)";
    ctx.fillRect(sx(i * stripeWidth), sy(0), sr(stripeWidth), sr(FIELD.height));
  }

  ctx.strokeStyle = "rgba(241,255,244,.86)";
  ctx.lineWidth = Math.max(1.5, sr(2.35));
  ctx.beginPath();
  ctx.rect(sx(0), sy(0), sr(FIELD.width), sr(FIELD.height));
  ctx.moveTo(sx(FIELD.width / 2), sy(0));
  ctx.lineTo(sx(FIELD.width / 2), sy(FIELD.height));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(sx(FIELD.width / 2), sy(FIELD.height / 2), sr(FIELD.centerRadius), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.beginPath();
  ctx.arc(sx(FIELD.width / 2), sy(FIELD.height / 2), sr(4), 0, Math.PI * 2);
  ctx.fill();

  const areaY = (FIELD.height - FIELD.areaWidth) / 2;
  ctx.strokeRect(sx(0), sy(areaY), sr(FIELD.areaDepth), sr(FIELD.areaWidth));
  ctx.strokeRect(sx(FIELD.width - FIELD.areaDepth), sy(areaY), sr(FIELD.areaDepth), sr(FIELD.areaWidth));
  const smallAreaDepth = 82;
  const smallAreaPad = 52;
  ctx.strokeRect(sx(0), sy(GOAL_TOP - smallAreaPad), sr(smallAreaDepth), sr(FIELD.goalWidth + smallAreaPad * 2));
  ctx.strokeRect(sx(FIELD.width - smallAreaDepth), sy(GOAL_TOP - smallAreaPad), sr(smallAreaDepth), sr(FIELD.goalWidth + smallAreaPad * 2));
  ctx.fillStyle = "rgba(255,255,255,.9)";
  for (const px of [FIELD.areaDepth * 0.68, FIELD.width - FIELD.areaDepth * 0.68]) {
    ctx.beginPath();
    ctx.arc(sx(px), sy(FIELD.height / 2), sr(3.5), 0, Math.PI * 2);
    ctx.fill();
  }

  const drawNet = (left: boolean) => {
    const x0 = left ? -FIELD.goalDepth : FIELD.width;
    ctx.fillStyle = "rgba(230,242,232,.055)";
    ctx.fillRect(sx(x0), sy(GOAL_TOP), sr(FIELD.goalDepth), sr(FIELD.goalWidth));
    ctx.strokeStyle = "rgba(235,248,237,.22)";
    ctx.lineWidth = Math.max(1, sr(1));
    for (let i = 0; i <= 6; i += 1) {
      const yy = GOAL_TOP + FIELD.goalWidth * i / 6;
      ctx.beginPath();
      ctx.moveTo(sx(left ? -FIELD.goalDepth : FIELD.width), sy(yy));
      ctx.lineTo(sx(left ? 0 : FIELD.width + FIELD.goalDepth), sy(yy));
      ctx.stroke();
    }
  };
  drawNet(true);
  drawNet(false);

  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.font = `${Math.max(10, sr(12))}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("VOCÊ ATACA →", sx(FIELD.width / 2), sy(FIELD.height - 22));

  if (aim) {
    const disc = state.bodies.find((body) => body.id === aim.bodyId);
    if (disc) {
      const dx = disc.x - aim.pointerX;
      const dy = disc.y - aim.pointerY;
      const rawPull = Math.hypot(dx, dy);
      const pull = Math.min(MAX_PULL, rawPull);
      if (pull > 2) {
        const nx = dx / rawPull;
        const ny = dy / rawPull;
        const speed = shotSpeedFor(disc.power) * Math.min(1, pull / MAX_PULL);
        const travel = distanceForSpeed(speed);
        const endX = disc.x + nx * travel;
        const endY = disc.y + ny * travel;
        ctx.strokeStyle = "rgba(255,255,255,.72)";
        ctx.lineWidth = Math.max(2, sr(2.25));
        ctx.setLineDash([sr(12), sr(9)]);
        ctx.beginPath();
        ctx.moveTo(sx(disc.x), sy(disc.y));
        ctx.lineTo(sx(endX), sy(endY));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,255,255,.3)";
        ctx.beginPath();
        ctx.arc(sx(endX), sy(endY), sr(disc.radius), 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = pull >= MAX_PULL * 0.98 ? "#ffd45e" : "rgba(255,255,255,.84)";
        ctx.lineWidth = Math.max(3, sr(4));
        ctx.beginPath();
        ctx.moveTo(sx(disc.x), sy(disc.y));
        ctx.lineTo(sx(aim.pointerX), sy(aim.pointerY));
        ctx.stroke();
      }
    }
  }

  const ball = ballOf(state);
  const nearestUserId = state.phase === "aim" && state.turn === "user"
    ? state.bodies
        .filter((body) => body.kind === "disc" && body.side === "user")
        .reduce<{ id: string; distance: number } | null>((best, body) => {
          const distance = Math.hypot(body.x - ball.x, body.y - ball.y);
          return !best || distance < best.distance ? { id: body.id, distance } : best;
        }, null)?.id ?? null
    : null;

  const teamFor = (side: Side) => side === "user" ? state.setup.userTeam : state.setup.cpuTeam;
  for (const body of state.bodies) {
    if (body.kind === "post") continue;
    if (body.kind === "ball") {
      const speed = Math.hypot(body.vx, body.vy);
      if (speed > 45) {
        const trail = Math.min(62, speed * 0.07);
        const len = speed || 1;
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.38, speed / 1800)})`;
        ctx.lineWidth = Math.max(2, sr(3));
        ctx.beginPath();
        ctx.moveTo(sx(body.x), sy(body.y));
        ctx.lineTo(sx(body.x - body.vx / len * trail), sy(body.y - body.vy / len * trail));
        ctx.stroke();
      }
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.6)";
      ctx.shadowBlur = sr(10);
      ctx.shadowOffsetY = sr(3);
      ctx.fillStyle = "#f8fbf7";
      ctx.beginPath();
      ctx.arc(sx(body.x), sy(body.y), sr(body.radius), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#18211c";
      ctx.beginPath();
      ctx.arc(sx(body.x + body.radius * 0.12), sy(body.y - body.radius * 0.1), sr(body.radius * 0.34), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const team = teamFor(body.side as Side);
    const selected = aim?.bodyId === body.id;
    const hovered = hoverBodyId === body.id;
    const suggested = nearestUserId === body.id && !selected;
    if (suggested) {
      ctx.strokeStyle = "rgba(255,212,94,.5)";
      ctx.lineWidth = Math.max(1.5, sr(2));
      ctx.setLineDash([sr(5), sr(5)]);
      ctx.beginPath();
      ctx.arc(sx(body.x), sy(body.y), sr(body.radius + 9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.46)";
    ctx.shadowBlur = sr(selected ? 18 : 9);
    ctx.shadowOffsetY = sr(4);
    ctx.fillStyle = team.primary;
    ctx.beginPath();
    ctx.arc(sx(body.x), sy(body.y), sr(body.radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = selected ? "#ffffff" : hovered ? "#ffd45e" : team.secondary;
    ctx.lineWidth = Math.max(2, sr(selected || hovered ? 4 : 2.8));
    ctx.beginPath();
    ctx.arc(sx(body.x), sy(body.y), sr(body.radius - 1.5), 0, Math.PI * 2);
    ctx.stroke();

    if (body.role === "GK") {
      ctx.strokeStyle = "rgba(255,255,255,.56)";
      ctx.lineWidth = Math.max(1, sr(1.4));
      ctx.beginPath();
      ctx.arc(sx(body.x), sy(body.y), sr(body.radius + 4), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = contrast(team.primary);
    ctx.font = `800 ${Math.max(9, sr(9.5))}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(body.number), sx(body.x), sy(body.y));

    if (showRoles && camera.zoom > 0.62) {
      const label = body.role ?? "";
      const w = sr(31);
      const h = sr(13);
      ctx.fillStyle = "rgba(4,10,7,.76)";
      ctx.fillRect(sx(body.x) - w / 2, sy(body.y + body.radius + 8) - h / 2, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.max(7, sr(7.5))}px ui-monospace, monospace`;
      ctx.fillText(label, sx(body.x), sy(body.y + body.radius + 8));
    }
  }

  ctx.fillStyle = "#f4f7f3";
  for (const body of state.bodies) {
    if (body.kind !== "post") continue;
    ctx.beginPath();
    ctx.arc(sx(body.x), sy(body.y), sr(body.radius), 0, Math.PI * 2);
    ctx.fill();
  }

  drawOffscreenBallIndicator(ctx, ball, width, height, camera);
  if (showMinimap) drawMinimap(ctx, state, width, height, camera);
}

function drawOffscreenBallIndicator(ctx: CanvasRenderingContext2D, ball: Body, width: number, height: number, camera: Camera) {
  const bx = (ball.x - camera.x) * camera.zoom + width / 2;
  const by = (ball.y - camera.y) * camera.zoom + height / 2;
  const pad = 52;
  if (bx >= pad && bx <= width - pad && by >= pad && by <= height - pad) return;
  const cx = width / 2;
  const cy = height / 2;
  const dx = bx - cx;
  const dy = by - cy;
  const scaleX = Math.abs(dx) > 0.001 ? (width / 2 - pad) / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const scaleY = Math.abs(dy) > 0.001 ? (height / 2 - pad) / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  const x = cx + dx * scale;
  const y = cy + dy * scale;
  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(255,212,94,.96)";
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-8, -8);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-angle);
  ctx.fillStyle = "#ffd45e";
  ctx.font = "900 10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("BOLA", 0, -13);
  ctx.restore();
}

function drawMinimap(ctx: CanvasRenderingContext2D, state: MatchState, width: number, height: number, camera: Camera) {
  const mapW = Math.min(350, width * 0.215);
  const mapH = mapW * FIELD.height / FIELD.width;
  const x = width - mapW - 22;
  const y = 22;
  ctx.save();
  ctx.fillStyle = "rgba(4,9,6,.84)";
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = 2;
  roundedRect(ctx, x - 10, y - 10, mapW + 20, mapH + 20, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#245f39";
  ctx.fillRect(x, y, mapW, mapH);
  ctx.strokeStyle = "rgba(255,255,255,.62)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, mapW, mapH);
  ctx.beginPath();
  ctx.moveTo(x + mapW / 2, y);
  ctx.lineTo(x + mapW / 2, y + mapH);
  ctx.stroke();

  const px = (worldX: number) => x + worldX / FIELD.width * mapW;
  const py = (worldY: number) => y + worldY / FIELD.height * mapH;
  state.bodies.forEach((body) => {
    if (body.kind === "post") return;
    const team = body.side === "user" ? state.setup.userTeam : state.setup.cpuTeam;
    ctx.fillStyle = body.kind === "ball" ? "#ffffff" : team.primary;
    ctx.beginPath();
    ctx.arc(px(body.x), py(body.y), body.kind === "ball" ? 3 : 4, 0, Math.PI * 2);
    ctx.fill();
  });

  const viewW = width / camera.zoom;
  const viewH = height / camera.zoom;
  ctx.strokeStyle = "rgba(255,212,94,.88)";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    px(camera.x - viewW / 2),
    py(camera.y - viewH / 2),
    viewW / FIELD.width * mapW,
    viewH / FIELD.height * mapH,
  );
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

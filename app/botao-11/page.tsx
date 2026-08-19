"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { CLUBS } from "../game-data";
import { chooseCpuShot } from "./cpu";
import {
  FIELD,
  GOAL_BOTTOM,
  GOAL_TOP,
  MAX_PULL,
  beginShot,
  ballOf,
  createMatch,
  distanceForSpeed,
  resumeAfterGoal,
  shotSpeedFor,
  stepMatch,
} from "./engine";
import { FORMATIONS_11 } from "./formations";
import type { Body, MatchState, Side, TeamPreset } from "./types";
import styles from "./botao11.module.css";

type Camera = { x: number; y: number; zoom: number; targetX: number; targetY: number; targetZoom: number; manualUntil: number };
type AimState = { bodyId: string; pointerX: number; pointerY: number } | null;
type PanState = { pointerId: number; lastX: number; lastY: number } | null;

const DEFAULT_SEED = 2026081811;
const MATCH_SECONDS = 240;
const CAMERA_MANUAL_MS = 2600;

function toPreset(club: (typeof CLUBS)[number]): TeamPreset {
  return { id: club.id, name: club.name, abbr: club.abbr, primary: club.primary, secondary: club.secondary, strength: club.strength };
}

function initialClubId(preferred: string, fallbackIndex: number) {
  return CLUBS.find((club) => club.id === preferred)?.id ?? CLUBS[fallbackIndex]?.id ?? CLUBS[0].id;
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function contrast(hex: string) {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#101713" : "#ffffff";
}

export default function Botao11Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const matchRef = useRef<MatchState | null>(null);
  const cameraRef = useRef<Camera>({ x: FIELD.width / 2, y: FIELD.height / 2, zoom: 1, targetX: FIELD.width / 2, targetY: FIELD.height / 2, targetZoom: 1, manualUntil: 0 });
  const aimRef = useRef<AimState>(null);
  const panRef = useRef<PanState>(null);
  const hoverBodyRef = useRef<string | null>(null);
  const cpuThinkingRef = useRef(false);
  const cpuThinkDueRef = useRef<number | null>(null);
  const goalStartedRef = useRef<number | null>(null);

  const [userClubId, setUserClubId] = useState(() => initialClubId("flamengo", 0));
  const [cpuClubId, setCpuClubId] = useState(() => initialClubId("real-madrid", 1));
  const [userFormationId, setUserFormationId] = useState("433");
  const [cpuFormationId, setCpuFormationId] = useState("442");
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [, setUiVersion] = useState(0);
  const [autoCamera, setAutoCamera] = useState(true);
  const [showRoles, setShowRoles] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [cpuThinkMs, setCpuThinkMs] = useState<number | null>(null);

  const clubs = useMemo(() => [...CLUBS].sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name, "pt-BR")), []);
  const userClub = CLUBS.find((club) => club.id === userClubId) ?? CLUBS[0];
  const cpuClub = CLUBS.find((club) => club.id === cpuClubId) ?? CLUBS[1] ?? CLUBS[0];

  if (!matchRef.current) {
    matchRef.current = createMatch({ seed: DEFAULT_SEED, userTeam: toPreset(userClub), cpuTeam: toPreset(cpuClub), userFormationId: "433", cpuFormationId: "442", matchSeconds: MATCH_SECONDS });
  }

  const resetMatch = useCallback((nextSeed = seed) => {
    matchRef.current = createMatch({
      seed: nextSeed,
      userTeam: toPreset(CLUBS.find((club) => club.id === userClubId) ?? CLUBS[0]),
      cpuTeam: toPreset(CLUBS.find((club) => club.id === cpuClubId) ?? CLUBS[1] ?? CLUBS[0]),
      userFormationId,
      cpuFormationId,
      matchSeconds: MATCH_SECONDS,
    });
    aimRef.current = null;
    panRef.current = null;
    cpuThinkingRef.current = false;
    cpuThinkDueRef.current = null;
    goalStartedRef.current = null;
    setCpuThinkMs(null);
    cameraRef.current = { x: FIELD.width / 2, y: FIELD.height / 2, zoom: 1, targetX: FIELD.width / 2, targetY: FIELD.height / 2, targetZoom: 1, manualUntil: 0 };
    setUiVersion((value) => value + 1);
  }, [cpuClubId, cpuFormationId, seed, userClubId, userFormationId]);

  const focusBall = useCallback(() => {
    const state = matchRef.current;
    if (!state) return;
    const ball = ballOf(state);
    const camera = cameraRef.current;
    camera.targetX = ball.x;
    camera.targetY = ball.y;
    camera.targetZoom = Math.max(camera.targetZoom, 1.12);
    camera.manualUntil = 0;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === "f") focusBall();
      if (event.key.toLowerCase() === "r") { const next = seed + 1; setSeed(next); resetMatch(next); }
      if (event.key === " ") { setAutoCamera((value) => !value); event.preventDefault(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusBall, resetMatch, seed]);

  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = (screenX - rect.left) * canvas.width / rect.width;
    const sy = (screenY - rect.top) * canvas.height / rect.height;
    const camera = cameraRef.current;
    return { x: (sx - canvas.width / 2) / camera.zoom + camera.x, y: (sy - canvas.height / 2) / camera.zoom + camera.y };
  }, []);

  const pickUserDisc = useCallback((x: number, y: number) => {
    const state = matchRef.current;
    if (!state || state.phase !== "aim" || state.turn !== "user") return null;
    let best: Body | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const body of state.bodies) {
      if (body.kind !== "disc" || body.side !== "user") continue;
      const distance = Math.hypot(body.x - x, body.y - y);
      if (distance <= body.radius * 1.75 && distance < bestDistance) { best = body; bestDistance = distance; }
    }
    return best;
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const world = screenToWorld(event.clientX, event.clientY);
    const disc = event.button === 0 ? pickUserDisc(world.x, world.y) : null;
    if (disc) { aimRef.current = { bodyId: disc.id, pointerX: world.x, pointerY: world.y }; return; }
    panRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    cameraRef.current.manualUntil = performance.now() + CAMERA_MANUAL_MS;
  }, [pickUserDisc, screenToWorld]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(event.clientX, event.clientY);
    if (aimRef.current) { aimRef.current.pointerX = world.x; aimRef.current.pointerY = world.y; return; }
    if (panRef.current?.pointerId === event.pointerId) {
      const camera = cameraRef.current;
      const dx = event.clientX - panRef.current.lastX;
      const dy = event.clientY - panRef.current.lastY;
      camera.x -= dx / camera.zoom;
      camera.y -= dy / camera.zoom;
      camera.targetX = camera.x;
      camera.targetY = camera.y;
      camera.manualUntil = performance.now() + CAMERA_MANUAL_MS;
      panRef.current.lastX = event.clientX;
      panRef.current.lastY = event.clientY;
      return;
    }
    hoverBodyRef.current = pickUserDisc(world.x, world.y)?.id ?? null;
  }, [pickUserDisc, screenToWorld]);

  const fireAim = useCallback(() => {
    const state = matchRef.current;
    const aim = aimRef.current;
    if (!state || !aim) return;
    const disc = state.bodies.find((body) => body.id === aim.bodyId);
    aimRef.current = null;
    if (!disc) return;
    const dx = disc.x - aim.pointerX;
    const dy = disc.y - aim.pointerY;
    const pull = Math.min(MAX_PULL, Math.hypot(dx, dy));
    if (pull < 8) return;
    const length = Math.hypot(dx, dy) || 1;
    const speed = shotSpeedFor(disc.power) * Math.min(1, pull / MAX_PULL);
    if (beginShot(state, { bodyId: disc.id, vx: dx / length * speed, vy: dy / length * speed })) setUiVersion((value) => value + 1);
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (aimRef.current) fireAim();
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  }, [fireAim]);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const before = screenToWorld(event.clientX, event.clientY);
    const camera = cameraRef.current;
    const rect = canvas.getBoundingClientRect();
    const fit = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const minZoom = fit * 0.82;
    const maxZoom = fit * 2.25;
    camera.zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * Math.exp(-event.deltaY * 0.0012)));
    camera.targetZoom = camera.zoom;
    const sx = (event.clientX - rect.left) * canvas.width / rect.width;
    const sy = (event.clientY - rect.top) * canvas.height / rect.height;
    camera.x = before.x - (sx - canvas.width / 2) / camera.zoom;
    camera.y = before.y - (sy - canvas.height / 2) / camera.zoom;
    camera.targetX = camera.x;
    camera.targetY = camera.y;
    camera.manualUntil = performance.now() + CAMERA_MANUAL_MS;
  }, [screenToWorld]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let lastUiSync = 0;
    const draw = (now: number) => {
      const canvas = canvasRef.current;
      const wrapper = wrapperRef.current;
      const state = matchRef.current;
      if (!canvas || !wrapper || !state) { frame = requestAnimationFrame(draw); return; }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(640, Math.floor(wrapper.clientWidth * dpr));
      const height = Math.max(420, Math.floor(wrapper.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const frameDt = Math.min(0.04, Math.max(0, (now - previous) / 1000));
      previous = now;
      let dt = frameDt;
      while (dt > 0) { const slice = Math.min(dt, 1 / 120); stepMatch(state, slice); dt -= slice; }
      const ball = ballOf(state);
      const camera = cameraRef.current;
      const fit = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
      if (camera.zoom === 1 && camera.targetZoom === 1) { camera.zoom = fit * 1.26; camera.targetZoom = camera.zoom; }
      if (autoCamera && now >= camera.manualUntil) {
        const aim = aimRef.current;
        const activeDisc = aim ? state.bodies.find((body) => body.id === aim.bodyId) : null;
        if (activeDisc) {
          camera.targetX = activeDisc.x * 0.56 + ball.x * 0.44;
          camera.targetY = activeDisc.y * 0.56 + ball.y * 0.44;
          camera.targetZoom = fit * 1.54;
        } else if (state.phase === "resolving") {
          const speed = Math.hypot(ball.vx, ball.vy);
          camera.targetX = ball.x;
          camera.targetY = ball.y;
          camera.targetZoom = fit * (speed > 380 ? 1.13 : 1.23);
        } else {
          camera.targetX = ball.x * 0.72 + FIELD.width / 2 * 0.28;
          camera.targetY = ball.y * 0.72 + FIELD.height / 2 * 0.28;
          camera.targetZoom = fit * 1.28;
        }
      }
      const follow = 1 - Math.exp(-7.5 * Math.max(0.001, frameDt));
      camera.x += (camera.targetX - camera.x) * follow;
      camera.y += (camera.targetY - camera.y) * follow;
      camera.zoom += (camera.targetZoom - camera.zoom) * follow;
      const halfW = canvas.width / (2 * camera.zoom);
      const halfH = canvas.height / (2 * camera.zoom);
      const margin = 90;
      const clampAxis = (value: number, half: number, worldSize: number) => {
        const low = -margin;
        const high = worldSize + margin;
        if (half * 2 >= high - low) return worldSize / 2;
        return Math.max(low + half, Math.min(high - half, value));
      };
      camera.x = clampAxis(camera.x, halfW, FIELD.width);
      camera.y = clampAxis(camera.y, halfH, FIELD.height);
      camera.targetX = clampAxis(camera.targetX, halfW, FIELD.width);
      camera.targetY = clampAxis(camera.targetY, halfH, FIELD.height);
      if (state.phase === "goal") {
        if (goalStartedRef.current === null) goalStartedRef.current = now;
        if (now - goalStartedRef.current >= 1250) { resumeAfterGoal(state); goalStartedRef.current = null; setUiVersion((value) => value + 1); }
      } else goalStartedRef.current = null;
      if (state.phase === "aim" && state.turn === "cpu") {
        if (cpuThinkDueRef.current === null) cpuThinkDueRef.current = now + 360;
        if (!cpuThinkingRef.current && now >= cpuThinkDueRef.current) {
          cpuThinkingRef.current = true;
          const started = performance.now();
          const shot = chooseCpuShot(state, "cpu");
          setCpuThinkMs(performance.now() - started);
          if (shot) beginShot(state, shot);
          cpuThinkingRef.current = false;
          cpuThinkDueRef.current = null;
          setUiVersion((value) => value + 1);
        }
      } else { cpuThinkDueRef.current = null; cpuThinkingRef.current = false; }
      render(canvas, state, camera, aimRef.current, hoverBodyRef.current, showRoles, showMinimap);
      if (now - lastUiSync > 180) { lastUiSync = now; setUiVersion((value) => value + 1); }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [autoCamera, showMinimap, showRoles]);

  const state = matchRef.current;
  const formation = FORMATIONS_11.find((item) => item.id === userFormationId) ?? FORMATIONS_11[0];
  const cpuFormation = FORMATIONS_11.find((item) => item.id === cpuFormationId) ?? FORMATIONS_11[0];
  const phaseLabel = !state ? "CARREGANDO" : state.phase === "finished" ? "FIM DE JOGO" : state.phase === "goal" ? "GOL" : state.turn === "cpu" ? cpuThinkingRef.current ? "CPU PENSANDO" : "VEZ DA CPU" : state.phase === "resolving" ? "BOLA ROLANDO" : "SUA VEZ";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}><Link href="/botao">← 5×5</Link><div><span>LABORATÓRIO</span><strong>FUTBOBO 11×11</strong></div></div>
        <div className={styles.scoreboard}><span style={{ "--team": userClub.primary } as CSSProperties}>{userClub.abbr}</span><strong>{state?.score.user ?? 0}</strong><em>{formatClock(state?.clock ?? MATCH_SECONDS)}</em><strong>{state?.score.cpu ?? 0}</strong><span style={{ "--team": cpuClub.primary } as CSSProperties}>{cpuClub.abbr}</span></div>
        <div className={styles.status} data-turn={state?.turn ?? "user"}><i /><span>{phaseLabel}</span><small>{state?.turns ?? 0} turnos</small></div>
      </header>
      <section className={styles.workspace}>
        <aside className={styles.sidebar}>
          <section><span className={styles.eyebrow}>MANDANTE</span><select value={userClubId} onChange={(event) => setUserClubId(event.target.value)}>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name} · {club.strength}</option>)}</select><div className={styles.formationGrid}>{FORMATIONS_11.map((item) => <button key={item.id} className={item.id === userFormationId ? styles.active : ""} onClick={() => setUserFormationId(item.id)}><strong>{item.shape}</strong><small>{item.name}</small></button>)}</div></section>
          <section><span className={styles.eyebrow}>VISITANTE · CPU</span><select value={cpuClubId} onChange={(event) => setCpuClubId(event.target.value)}>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name} · {club.strength}</option>)}</select><div className={styles.formationGrid}>{FORMATIONS_11.map((item) => <button key={item.id} className={item.id === cpuFormationId ? styles.active : ""} onClick={() => setCpuFormationId(item.id)}><strong>{item.shape}</strong><small>{item.name}</small></button>)}</div></section>
          <section className={styles.testPanel}><span className={styles.eyebrow}>TESTE RÁPIDO</span><button className={styles.primary} onClick={() => resetMatch(seed)}>Aplicar times/formações</button><button onClick={() => { const next = seed + 1; setSeed(next); resetMatch(next); }}>Nova seed</button><div className={styles.toggleRow}><label><input type="checkbox" checked={autoCamera} onChange={(event) => setAutoCamera(event.target.checked)} /> câmera automática</label><label><input type="checkbox" checked={showRoles} onChange={(event) => setShowRoles(event.target.checked)} /> posições</label><label><input type="checkbox" checked={showMinimap} onChange={(event) => setShowMinimap(event.target.checked)} /> minimapa</label></div></section>
          <section className={styles.telemetry}><span className={styles.eyebrow}>TELEMETRIA</span><dl><div><dt>Campo</dt><dd>{FIELD.width} × {FIELD.height}</dd></div><div><dt>Corpos</dt><dd>{state?.bodies.length ?? 27}</dd></div><div><dt>CPU último turno</dt><dd>{cpuThinkMs === null ? "—" : `${cpuThinkMs.toFixed(0)} ms`}</dd></div><div><dt>Formação</dt><dd>{formation.shape} × {cpuFormation.shape}</dd></div><div><dt>Seed</dt><dd>{seed}</dd></div></dl></section>
        </aside>
        <div className={styles.canvasShell} ref={wrapperRef}>
          <canvas ref={canvasRef} className={styles.canvas} onContextMenu={(event) => event.preventDefault()} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} />
          <div className={styles.help}><strong>ARRASTA A PEÇA PARA TRÁS E SOLTA</strong><span>fundo: pan · roda: zoom · F: bola · espaço: câmera auto · R: nova partida</span></div>
          {state?.phase === "goal" && <div className={styles.goalBanner}><span>GOOOOOOOL</span><strong>{state.score.user} × {state.score.cpu}</strong></div>}
          {state?.phase === "finished" && <div className={styles.endOverlay}><span>FIM DO EXPERIMENTO</span><strong>{userClub.abbr} {state.score.user} × {state.score.cpu} {cpuClub.abbr}</strong><p>{state.turns} turnos · CPU: {cpuThinkMs?.toFixed(0) ?? "—"} ms no último cálculo</p><button onClick={() => { const next = seed + 1; setSeed(next); resetMatch(next); }}>Jogar de novo</button></div>}
        </div>
      </section>
    </main>
  );
}

function render(canvas: HTMLCanvasElement, state: MatchState, camera: Camera, aim: AimState, hoverBodyId: string | null, showRoles: boolean, showMinimap: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const sx = (x: number) => (x - camera.x) * camera.zoom + width / 2;
  const sy = (y: number) => (y - camera.y) * camera.zoom + height / 2;
  const sr = (value: number) => value * camera.zoom;
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.75);
  bg.addColorStop(0, "#101a16"); bg.addColorStop(1, "#050806"); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = sr(36); ctx.fillStyle = "#173f28"; ctx.fillRect(sx(0), sy(0), sr(FIELD.width), sr(FIELD.height)); ctx.restore();
  ctx.fillStyle = "#247443"; ctx.fillRect(sx(0), sy(0), sr(FIELD.width), sr(FIELD.height));
  const stripeWidth = FIELD.width / 10;
  for (let index = 0; index < 10; index += 1) if (index % 2 !== 0) { ctx.fillStyle = "rgba(255,255,255,.028)"; ctx.fillRect(sx(index * stripeWidth), sy(0), sr(stripeWidth), sr(FIELD.height)); }
  ctx.strokeStyle = "rgba(241,255,244,.86)"; ctx.lineWidth = Math.max(1.5, sr(2.4)); ctx.beginPath(); ctx.rect(sx(0), sy(0), sr(FIELD.width), sr(FIELD.height)); ctx.moveTo(sx(FIELD.width / 2), sy(0)); ctx.lineTo(sx(FIELD.width / 2), sy(FIELD.height)); ctx.stroke();
  ctx.beginPath(); ctx.arc(sx(FIELD.width / 2), sy(FIELD.height / 2), sr(FIELD.centerRadius), 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.arc(sx(FIELD.width / 2), sy(FIELD.height / 2), sr(4), 0, Math.PI * 2); ctx.fill();
  const areaY = (FIELD.height - FIELD.areaWidth) / 2;
  ctx.strokeRect(sx(0), sy(areaY), sr(FIELD.areaDepth), sr(FIELD.areaWidth)); ctx.strokeRect(sx(FIELD.width - FIELD.areaDepth), sy(areaY), sr(FIELD.areaDepth), sr(FIELD.areaWidth)); ctx.strokeRect(sx(0), sy(GOAL_TOP - 44), sr(72), sr(FIELD.goalWidth + 88)); ctx.strokeRect(sx(FIELD.width - 72), sy(GOAL_TOP - 44), sr(72), sr(FIELD.goalWidth + 88));
  const drawNet = (left: boolean) => { const x = left ? sx(-FIELD.goalDepth) : sx(FIELD.width); const netW = sr(FIELD.goalDepth); ctx.fillStyle = "rgba(230,242,232,.06)"; ctx.fillRect(x, sy(GOAL_TOP), netW, sr(FIELD.goalWidth)); ctx.strokeStyle = "rgba(235,248,237,.22)"; ctx.lineWidth = Math.max(1, sr(1)); for (let i = 0; i <= 5; i += 1) { const yy = GOAL_TOP + FIELD.goalWidth * i / 5; ctx.beginPath(); ctx.moveTo(left ? sx(-FIELD.goalDepth) : sx(FIELD.width), sy(yy)); ctx.lineTo(left ? sx(0) : sx(FIELD.width + FIELD.goalDepth), sy(yy)); ctx.stroke(); } };
  drawNet(true); drawNet(false);
  ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.font = `${Math.max(10, sr(12))}px ui-monospace, monospace`; ctx.textAlign = "center"; ctx.fillText("VOCÊ ATACA →", sx(FIELD.width / 2), sy(FIELD.height - 20));
  if (aim) {
    const disc = state.bodies.find((body) => body.id === aim.bodyId);
    if (disc) {
      const dx = disc.x - aim.pointerX, dy = disc.y - aim.pointerY, rawPull = Math.hypot(dx, dy), pull = Math.min(MAX_PULL, rawPull);
      if (pull > 2) {
        const nx = dx / rawPull, ny = dy / rawPull, speed = shotSpeedFor(disc.power) * Math.min(1, pull / MAX_PULL), travel = distanceForSpeed(speed), endX = disc.x + nx * travel, endY = disc.y + ny * travel;
        ctx.strokeStyle = "rgba(255,255,255,.76)"; ctx.lineWidth = Math.max(2, sr(2.4)); ctx.setLineDash([sr(12), sr(9)]); ctx.beginPath(); ctx.moveTo(sx(disc.x), sy(disc.y)); ctx.lineTo(sx(endX), sy(endY)); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(sx(endX), sy(endY), sr(disc.radius), 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = pull >= MAX_PULL * 0.98 ? "#ffd45e" : "rgba(255,255,255,.8)"; ctx.lineWidth = Math.max(3, sr(4)); ctx.beginPath(); ctx.moveTo(sx(disc.x), sy(disc.y)); ctx.lineTo(sx(aim.pointerX), sy(aim.pointerY)); ctx.stroke();
      }
    }
  }
  const teamFor = (side: Side) => side === "user" ? state.setup.userTeam : state.setup.cpuTeam;
  for (const body of state.bodies) {
    if (body.kind === "post") continue;
    if (body.kind === "ball") { ctx.save(); ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = sr(10); ctx.shadowOffsetY = sr(3); ctx.fillStyle = "#f8fbf7"; ctx.beginPath(); ctx.arc(sx(body.x), sy(body.y), sr(body.radius), 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.fillStyle = "#18211c"; ctx.beginPath(); ctx.arc(sx(body.x + body.radius * 0.12), sy(body.y - body.radius * 0.1), sr(body.radius * 0.34), 0, Math.PI * 2); ctx.fill(); continue; }
    const team = teamFor(body.side as Side), selected = aim?.bodyId === body.id, hovered = hoverBodyId === body.id;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.46)"; ctx.shadowBlur = sr(selected ? 18 : 9); ctx.shadowOffsetY = sr(4); ctx.fillStyle = team.primary; ctx.beginPath(); ctx.arc(sx(body.x), sy(body.y), sr(body.radius), 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.strokeStyle = selected ? "#ffffff" : hovered ? "#ffd45e" : team.secondary; ctx.lineWidth = Math.max(2, sr(selected || hovered ? 4 : 2.8)); ctx.beginPath(); ctx.arc(sx(body.x), sy(body.y), sr(body.radius - 1.5), 0, Math.PI * 2); ctx.stroke();
    if (body.role === "GK") { ctx.strokeStyle = "rgba(255,255,255,.56)"; ctx.lineWidth = Math.max(1, sr(1.4)); ctx.beginPath(); ctx.arc(sx(body.x), sy(body.y), sr(body.radius + 4), 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = contrast(team.primary); ctx.font = `800 ${Math.max(9, sr(9.5))}px ui-monospace, monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(body.number), sx(body.x), sy(body.y));
    if (showRoles && camera.zoom > 0.7) { ctx.fillStyle = "rgba(4,10,7,.76)"; const label = body.role ?? "", w = sr(30), h = sr(13); ctx.fillRect(sx(body.x) - w / 2, sy(body.y + body.radius + 8) - h / 2, w, h); ctx.fillStyle = "#ffffff"; ctx.font = `700 ${Math.max(7, sr(7.5))}px ui-monospace, monospace`; ctx.fillText(label, sx(body.x), sy(body.y + body.radius + 8)); }
  }
  ctx.fillStyle = "#f4f7f3"; for (const body of state.bodies) if (body.kind === "post") { ctx.beginPath(); ctx.arc(sx(body.x), sy(body.y), sr(body.radius), 0, Math.PI * 2); ctx.fill(); }
  if (showMinimap) drawMinimap(ctx, state, width, height, camera);
}

function drawMinimap(ctx: CanvasRenderingContext2D, state: MatchState, width: number, height: number, camera: Camera) {
  const mapW = Math.min(330, width * 0.21), mapH = mapW * FIELD.height / FIELD.width, x = width - mapW - 22, y = 22;
  ctx.save(); ctx.fillStyle = "rgba(4,9,6,.82)"; ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 2; roundRect(ctx, x - 10, y - 10, mapW + 20, mapH + 20, 16); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#245f39"; ctx.fillRect(x, y, mapW, mapH); ctx.strokeStyle = "rgba(255,255,255,.62)"; ctx.lineWidth = 1; ctx.strokeRect(x, y, mapW, mapH); ctx.beginPath(); ctx.moveTo(x + mapW / 2, y); ctx.lineTo(x + mapW / 2, y + mapH); ctx.stroke();
  const px = (worldX: number) => x + worldX / FIELD.width * mapW, py = (worldY: number) => y + worldY / FIELD.height * mapH;
  state.bodies.forEach((body) => { if (body.kind === "post") return; const team = body.side === "user" ? state.setup.userTeam : state.setup.cpuTeam; ctx.fillStyle = body.kind === "ball" ? "#ffffff" : team.primary; ctx.beginPath(); ctx.arc(px(body.x), py(body.y), body.kind === "ball" ? 3 : 4, 0, Math.PI * 2); ctx.fill(); });
  const viewW = width / camera.zoom, viewH = height / camera.zoom; ctx.strokeStyle = "rgba(255,212,94,.82)"; ctx.lineWidth = 2; ctx.strokeRect(px(camera.x - viewW / 2), py(camera.y - viewH / 2), viewW / FIELD.width * mapW, viewH / FIELD.height * mapH); ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}

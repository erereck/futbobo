"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { CLUBS } from "../game-data";
import { chooseCpuShot } from "./cpu";
import { FIELD, MAX_PULL, beginShot, ballOf, createMatch, resumeAfterGoal, shotSpeedFor, stepMatch } from "./engine";
import { FORMATIONS_11 } from "./formations";
import { renderMatch, type AimState, type Camera } from "./render-v2";
import type { Body, MatchState, TeamPreset } from "./types";
import styles from "./lab-v2.module.css";

type PanState = { pointerId: number; lastX: number; lastY: number } | null;

const DEFAULT_SEED = 2026081811;
const MATCH_SECONDS = 240;

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

function newCamera(): Camera {
  return { x: FIELD.width / 2, y: FIELD.height / 2, zoom: 1, targetX: FIELD.width / 2, targetY: FIELD.height / 2, targetZoom: 1 };
}

export default function LabV2() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const matchRef = useRef<MatchState | null>(null);
  const cameraRef = useRef<Camera>(newCamera());
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
  const [followBall, setFollowBall] = useState(false);
  const [showRoles, setShowRoles] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [cpuThinkMs, setCpuThinkMs] = useState<number | null>(null);

  const clubs = useMemo(() => [...CLUBS].sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name, "pt-BR")), []);
  const userClub = CLUBS.find((club) => club.id === userClubId) ?? CLUBS[0];
  const cpuClub = CLUBS.find((club) => club.id === cpuClubId) ?? CLUBS[1] ?? CLUBS[0];

  if (!matchRef.current) {
    matchRef.current = createMatch({ seed: DEFAULT_SEED, userTeam: toPreset(userClub), cpuTeam: toPreset(cpuClub), userFormationId: "433", cpuFormationId: "442", matchSeconds: MATCH_SECONDS });
  }

  const lockManualCamera = useCallback(() => {
    const camera = cameraRef.current;
    camera.targetX = camera.x;
    camera.targetY = camera.y;
    camera.targetZoom = camera.zoom;
    setFollowBall(false);
  }, []);

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
    hoverBodyRef.current = null;
    cpuThinkingRef.current = false;
    cpuThinkDueRef.current = null;
    goalStartedRef.current = null;
    cameraRef.current = newCamera();
    setFollowBall(false);
    setCpuThinkMs(null);
    setUiVersion((value) => value + 1);
  }, [cpuClubId, cpuFormationId, seed, userClubId, userFormationId]);

  const focusBall = useCallback(() => {
    const state = matchRef.current;
    if (!state) return;
    const ball = ballOf(state);
    const camera = cameraRef.current;
    camera.targetX = ball.x;
    camera.targetY = ball.y;
    camera.targetZoom = camera.zoom;
    setFollowBall(true);
  }, []);

  const fitWholeField = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(640, Math.floor(wrapper.clientWidth * dpr));
    const height = Math.max(420, Math.floor(wrapper.clientHeight * dpr));
    const fit = Math.min(width / FIELD.width, height / FIELD.height) * 0.93;
    const camera = cameraRef.current;
    camera.x = FIELD.width / 2;
    camera.y = FIELD.height / 2;
    camera.zoom = fit;
    camera.targetX = camera.x;
    camera.targetY = camera.y;
    camera.targetZoom = fit;
    setFollowBall(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (key === "f") focusBall();
      if (key === "c") fitWholeField();
      if (key === "r") { const next = seed + 1; setSeed(next); resetMatch(next); }
      if (event.key === " ") { setFollowBall((value) => !value); event.preventDefault(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fitWholeField, focusBall, resetMatch, seed]);

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
      if (distance <= body.radius * 1.9 && distance < bestDistance) { best = body; bestDistance = distance; }
    }
    return best;
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const world = screenToWorld(event.clientX, event.clientY);
    const disc = event.button === 0 ? pickUserDisc(world.x, world.y) : null;
    if (disc) {
      aimRef.current = { bodyId: disc.id, pointerX: world.x, pointerY: world.y };
      return;
    }
    panRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    lockManualCamera();
  }, [lockManualCamera, pickUserDisc, screenToWorld]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(event.clientX, event.clientY);
    const aim = aimRef.current;
    if (aim) {
      aim.pointerX = world.x;
      aim.pointerY = world.y;
      return;
    }
    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      const camera = cameraRef.current;
      camera.x -= (event.clientX - pan.lastX) / camera.zoom;
      camera.y -= (event.clientY - pan.lastY) / camera.zoom;
      camera.targetX = camera.x;
      camera.targetY = camera.y;
      camera.targetZoom = camera.zoom;
      pan.lastX = event.clientX;
      pan.lastY = event.clientY;
      if (followBall) setFollowBall(false);
      return;
    }
    hoverBodyRef.current = pickUserDisc(world.x, world.y)?.id ?? null;
  }, [followBall, pickUserDisc, screenToWorld]);

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
    const minZoom = fit * 0.72;
    const maxZoom = fit * 3.15;
    camera.zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * Math.exp(-event.deltaY * 0.0012)));
    camera.targetZoom = camera.zoom;
    const sx = (event.clientX - rect.left) * canvas.width / rect.width;
    const sy = (event.clientY - rect.top) * canvas.height / rect.height;
    camera.x = before.x - (sx - canvas.width / 2) / camera.zoom;
    camera.y = before.y - (sy - canvas.height / 2) / camera.zoom;
    camera.targetX = camera.x;
    camera.targetY = camera.y;
    setFollowBall(false);
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
      let remaining = frameDt;
      while (remaining > 0) {
        const slice = Math.min(remaining, 1 / 120);
        stepMatch(state, slice);
        remaining -= slice;
      }

      const camera = cameraRef.current;
      const fit = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
      if (camera.zoom === 1 && camera.targetZoom === 1) {
        camera.zoom = fit * 1.37;
        camera.targetZoom = camera.zoom;
      }

      if (followBall) {
        const ball = ballOf(state);
        const activeAim = aimRef.current;
        const activeDisc = activeAim ? state.bodies.find((body) => body.id === activeAim.bodyId) : null;
        if (activeDisc) {
          camera.targetX = activeDisc.x * 0.58 + ball.x * 0.42;
          camera.targetY = activeDisc.y * 0.58 + ball.y * 0.42;
        } else {
          camera.targetX = ball.x;
          camera.targetY = ball.y;
        }
        camera.targetZoom = camera.zoom;
      }

      const follow = 1 - Math.exp(-6.2 * Math.max(0.001, frameDt));
      camera.x += (camera.targetX - camera.x) * follow;
      camera.y += (camera.targetY - camera.y) * follow;
      camera.zoom += (camera.targetZoom - camera.zoom) * follow;

      const halfW = canvas.width / (2 * camera.zoom);
      const halfH = canvas.height / (2 * camera.zoom);
      const margin = 105;
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
        if (now - goalStartedRef.current >= 950) {
          resumeAfterGoal(state);
          goalStartedRef.current = null;
          setUiVersion((value) => value + 1);
        }
      } else goalStartedRef.current = null;

      if (state.phase === "aim" && state.turn === "cpu") {
        if (cpuThinkDueRef.current === null) cpuThinkDueRef.current = now + 240;
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
      } else {
        cpuThinkDueRef.current = null;
        cpuThinkingRef.current = false;
      }

      renderMatch(canvas, state, camera, aimRef.current, hoverBodyRef.current, showRoles, showMinimap);
      if (now - lastUiSync > 160) { lastUiSync = now; setUiVersion((value) => value + 1); }
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [followBall, showMinimap, showRoles]);

  const state = matchRef.current;
  const formation = FORMATIONS_11.find((item) => item.id === userFormationId) ?? FORMATIONS_11[0];
  const cpuFormation = FORMATIONS_11.find((item) => item.id === cpuFormationId) ?? FORMATIONS_11[0];
  const phaseLabel = state.phase === "finished" ? "FIM DE JOGO" : state.phase === "goal" ? "GOL" : state.turn === "cpu" ? cpuThinkingRef.current ? "CPU PENSANDO" : "VEZ DA CPU" : state.phase === "resolving" ? "BOLA ROLANDO" : "SUA VEZ";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}><Link href="/botao">← 5×5</Link><div><span>LABORATÓRIO V2</span><strong>FUTBOBO 11×11</strong></div></div>
        <div className={styles.scoreboard}>
          <span style={{ "--team": userClub.primary } as CSSProperties}>{userClub.abbr}</span><strong>{state.score.user}</strong><em>{formatClock(state.clock)}</em><strong>{state.score.cpu}</strong><span style={{ "--team": cpuClub.primary } as CSSProperties}>{cpuClub.abbr}</span>
        </div>
        <div className={styles.status} data-turn={state.turn}><i /><span>{phaseLabel}</span><small>{state.turns} turnos · {followBall ? "câmera seguindo" : "câmera manual"}</small></div>
      </header>

      <section className={styles.workspace}>
        <aside className={styles.sidebar}>
          <section><span className={styles.eyebrow}>MANDANTE</span><select value={userClubId} onChange={(event) => setUserClubId(event.target.value)}>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name} · {club.strength}</option>)}</select><div className={styles.formationGrid}>{FORMATIONS_11.map((item) => <button key={item.id} className={item.id === userFormationId ? styles.active : ""} onClick={() => setUserFormationId(item.id)}><strong>{item.shape}</strong><small>{item.name}</small></button>)}</div></section>
          <section><span className={styles.eyebrow}>VISITANTE · CPU</span><select value={cpuClubId} onChange={(event) => setCpuClubId(event.target.value)}>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name} · {club.strength}</option>)}</select><div className={styles.formationGrid}>{FORMATIONS_11.map((item) => <button key={item.id} className={item.id === cpuFormationId ? styles.active : ""} onClick={() => setCpuFormationId(item.id)}><strong>{item.shape}</strong><small>{item.name}</small></button>)}</div></section>
          <section className={styles.controls}><span className={styles.eyebrow}>CONTROLES DO LAB</span><button className={styles.primary} onClick={() => resetMatch(seed)}>Aplicar times/formações</button><button onClick={focusBall}>F · seguir a bola</button><button onClick={fitWholeField}>C · enquadrar campo inteiro</button><button onClick={() => { const next = seed + 1; setSeed(next); resetMatch(next); }}>R · nova seed</button><div className={styles.toggles}><label><input type="checkbox" checked={followBall} onChange={(event) => setFollowBall(event.target.checked)} /> seguir bola</label><label><input type="checkbox" checked={showRoles} onChange={(event) => setShowRoles(event.target.checked)} /> posições</label><label><input type="checkbox" checked={showMinimap} onChange={(event) => setShowMinimap(event.target.checked)} /> minimapa</label></div></section>
          <section className={styles.telemetry}><span className={styles.eyebrow}>TELEMETRIA</span><dl><div><dt>Campo</dt><dd>{FIELD.width} × {FIELD.height}</dd></div><div><dt>Corpos</dt><dd>{state.bodies.length}</dd></div><div><dt>CPU último turno</dt><dd>{cpuThinkMs === null ? "—" : `${cpuThinkMs.toFixed(0)} ms`}</dd></div><div><dt>Formação</dt><dd>{formation.shape} × {cpuFormation.shape}</dd></div><div><dt>Câmera</dt><dd>{followBall ? "BOLA" : "MANUAL"}</dd></div><div><dt>Seed</dt><dd>{seed}</dd></div></dl></section>
        </aside>

        <div className={styles.canvasShell} ref={wrapperRef}>
          <canvas ref={canvasRef} className={styles.canvas} onContextMenu={(event) => event.preventDefault()} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} />
          <div className={styles.cameraBadge} data-follow={followBall ? "on" : "off"}><strong>{followBall ? "● SEGUINDO BOLA" : "CÂMERA MANUAL"}</strong><span>{followBall ? "pan ou zoom trava aqui" : "F para voltar a seguir"}</span></div>
          <div className={styles.help}><strong>ARRASTA A PEÇA PARA TRÁS E SOLTA</strong><span>pan/zoom = câmera fica parada · F = seguir bola · C = campo inteiro · R = reiniciar</span></div>
          {state.phase === "goal" && <div className={styles.goalBanner}><span>GOOOOOOOL</span><strong>{state.score.user} × {state.score.cpu}</strong></div>}
          {state.phase === "finished" && <div className={styles.endOverlay}><span>FIM DO EXPERIMENTO</span><strong>{userClub.abbr} {state.score.user} × {state.score.cpu} {cpuClub.abbr}</strong><p>{state.turns} turnos · CPU: {cpuThinkMs?.toFixed(0) ?? "—"} ms no último cálculo</p><button onClick={() => { const next = seed + 1; setSeed(next); resetMatch(next); }}>Jogar de novo</button></div>}
        </div>
      </section>
    </main>
  );
}

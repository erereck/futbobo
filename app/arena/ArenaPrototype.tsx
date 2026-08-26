"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./arena.module.css";

type TeamId = 0 | 1;
type Phase = "intro" | "playing" | "goal" | "paused" | "ended";

type Vec2 = { x: number; y: number };

type Player = {
  id: number;
  team: TeamId;
  name: string;
  number: number;
  role: "GK" | "DEF" | "MID" | "FWD";
  x: number;
  y: number;
  vx: number;
  vy: number;
  stamina: number;
  cooldown: number;
  facingX: number;
  facingY: number;
  controlledGlow: number;
};

type Ball = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  owner: number | null;
  lastTeam: TeamId | null;
};

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  kind: "spark" | "grass" | "goal";
  team: TeamId;
};

type MatchState = {
  players: Player[];
  ball: Ball;
  particles: Particle[];
  score: [number, number];
  timeLeft: number;
  phase: Phase;
  goalTimer: number;
  goalTeam: TeamId | null;
  controlled: number;
  possession: TeamId | null;
  pulse: number;
  pulseActive: number;
  combo: number;
  comboTimer: number;
  cameraShake: number;
  flash: number;
  kickoffTeam: TeamId;
  commentary: string;
  commentaryTimer: number;
  matchStartedAt: number;
};

type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  shoot: boolean;
  shootStartedAt: number;
  mouseX: number;
  mouseY: number;
  mouseInside: boolean;
};

type Projection = {
  x: number;
  y: number;
  scale: number;
};

const FIELD_W = 100;
const FIELD_H = 64;
const GOAL_HALF = 9;
const HOME = 0 as const;
const AWAY = 1 as const;

const HOME_NAMES = ["Nilo", "Dante", "Caio", "Lume"];
const AWAY_NAMES = ["Vega", "Rook", "Mako", "Zed"];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const length = (x: number, y: number) => Math.hypot(x, y);
const normalize = (x: number, y: number): Vec2 => {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function createPlayers(): Player[] {
  const home: Array<[number, number, Player["role"]]> = [
    [7, 32, "GK"],
    [25, 20, "DEF"],
    [33, 43, "MID"],
    [44, 31, "FWD"],
  ];
  const away: Array<[number, number, Player["role"]]> = [
    [93, 32, "GK"],
    [75, 44, "DEF"],
    [67, 21, "MID"],
    [56, 33, "FWD"],
  ];

  return [...home.map((entry, index) => ({ entry, team: HOME as TeamId, index })), ...away.map((entry, index) => ({ entry, team: AWAY as TeamId, index }))].map(
    ({ entry, team, index }, id) => ({
      id,
      team,
      name: team === HOME ? HOME_NAMES[index] : AWAY_NAMES[index],
      number: team === HOME ? [1, 4, 8, 10][index] : [1, 5, 7, 11][index],
      role: entry[2],
      x: entry[0],
      y: entry[1],
      vx: 0,
      vy: 0,
      stamina: 1,
      cooldown: 0,
      facingX: team === HOME ? 1 : -1,
      facingY: 0,
      controlledGlow: 0,
    }),
  );
}

function createMatch(): MatchState {
  return {
    players: createPlayers(),
    ball: { x: 50, y: 32, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, owner: null, lastTeam: null },
    particles: [],
    score: [0, 0],
    timeLeft: 90,
    phase: "intro",
    goalTimer: 0,
    goalTeam: null,
    controlled: 3,
    possession: null,
    pulse: 22,
    pulseActive: 0,
    combo: 0,
    comboTimer: 0,
    cameraShake: 0,
    flash: 0,
    kickoffTeam: HOME,
    commentary: "ARENA ONLINE",
    commentaryTimer: 1.8,
    matchStartedAt: 0,
  };
}

function resetKickoff(state: MatchState, team: TeamId) {
  const fresh = createPlayers();
  state.players.forEach((player, index) => {
    Object.assign(player, fresh[index]);
  });
  state.ball.x = 50;
  state.ball.y = 32;
  state.ball.z = 0.35;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.vz = 0;
  state.ball.owner = null;
  state.ball.lastTeam = null;
  state.possession = null;
  state.kickoffTeam = team;
  state.controlled = 3;
}

function ArenaLogo() {
  return (
    <div className={styles.logoMark} aria-label="Futbobo Pulse Arena">
      <span className={styles.logoSmall}>FUTBOBO</span>
      <span className={styles.logoBig}>PULSE</span>
      <span className={styles.logoTag}>ARENA // 01</span>
    </div>
  );
}

export default function ArenaPrototype() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<MatchState>(createMatch());
  const inputRef = useRef<InputState>({
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    shoot: false,
    shootStartedAt: 0,
    mouseX: 0,
    mouseY: 0,
    mouseInside: false,
  });
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const [, forceHud] = useState(0);
  const [audioOn, setAudioOn] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  const startMatch = useCallback(() => {
    const state = stateRef.current;
    state.phase = "playing";
    state.timeLeft = 90;
    state.score = [0, 0];
    state.pulse = 22;
    state.pulseActive = 0;
    state.combo = 0;
    state.commentary = "KICK OFF // DRIVE THE PITCH";
    state.commentaryTimer = 2.2;
    state.matchStartedAt = performance.now();
    resetKickoff(state, HOME);
    forceHud((v) => v + 1);
  }, []);

  const rematch = useCallback(() => {
    stateRef.current = createMatch();
    stateRef.current.phase = "playing";
    stateRef.current.commentary = "REMATCH // NO BRAKES";
    stateRef.current.commentaryTimer = 2;
    forceHud((v) => v + 1);
  }, []);

  const togglePause = useCallback(() => {
    const state = stateRef.current;
    if (state.phase === "playing") state.phase = "paused";
    else if (state.phase === "paused") state.phase = "playing";
    forceHud((v) => v + 1);
  }, []);

  const doPass = useCallback(() => {
    const state = stateRef.current;
    if (state.phase !== "playing") return;
    const player = state.players[state.controlled];
    if (!player || player.team !== HOME) return;
    const ball = state.ball;
    if (Math.hypot(ball.x - player.x, ball.y - player.y) > 5.4 || ball.z > 2.2) return;

    const candidates = state.players.filter((p) => p.team === HOME && p.id !== player.id && p.role !== "GK");
    candidates.sort((a, b) => {
      const advanceA = a.x - player.x;
      const advanceB = b.x - player.x;
      const distA = Math.hypot(a.x - player.x, a.y - player.y);
      const distB = Math.hypot(b.x - player.x, b.y - player.y);
      return advanceB * 1.4 - distB * 0.25 - (advanceA * 1.4 - distA * 0.25);
    });
    const target = candidates[0];
    if (!target) return;
    const dir = normalize(target.x - ball.x, target.y - ball.y);
    ball.owner = null;
    ball.vx = dir.x * 28;
    ball.vy = dir.y * 28;
    ball.vz = 2.4;
    ball.lastTeam = HOME;
    state.pulse = clamp(state.pulse + 5, 0, 100);
    state.combo = clamp(state.combo + 1, 0, 9);
    state.comboTimer = 2.2;
    state.commentary = `THREAD // ${player.name.toUpperCase()} → ${target.name.toUpperCase()}`;
    state.commentaryTimer = 1.2;
  }, []);

  const activatePulse = useCallback(() => {
    const state = stateRef.current;
    if (state.phase !== "playing" || state.pulse < 100 || state.pulseActive > 0) return;
    state.pulse = 0;
    state.pulseActive = 7;
    state.cameraShake = 0.38;
    state.flash = 0.6;
    state.commentary = "PULSE BREAK // OVERDRIVE";
    state.commentaryTimer = 2;
    for (let i = 0; i < 46; i += 1) {
      const player = state.players[state.controlled];
      const a = Math.random() * Math.PI * 2;
      const s = 5 + Math.random() * 18;
      state.particles.push({
        x: player.x,
        y: player.y,
        z: 0.4 + Math.random() * 3,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: 3 + Math.random() * 8,
        life: 0.65 + Math.random() * 0.45,
        maxLife: 1.1,
        size: 0.7 + Math.random() * 1.6,
        kind: "spark",
        team: HOME,
      });
    }
  }, []);

  const switchPlayer = useCallback(() => {
    const state = stateRef.current;
    if (state.phase !== "playing") return;
    const candidates = state.players.filter((p) => p.team === HOME && p.role !== "GK");
    candidates.sort((a, b) => Math.hypot(a.x - state.ball.x, a.y - state.ball.y) - Math.hypot(b.x - state.ball.x, b.y - state.ball.y));
    if (candidates[0]) {
      state.controlled = candidates[0].id;
      candidates[0].controlledGlow = 1;
    }
  }, []);

  const releaseShot = useCallback(() => {
    const state = stateRef.current;
    const input = inputRef.current;
    if (!input.shoot) return;
    input.shoot = false;
    if (state.phase !== "playing") return;

    const player = state.players[state.controlled];
    const ball = state.ball;
    if (!player || player.team !== HOME || Math.hypot(ball.x - player.x, ball.y - player.y) > 5.6 || ball.z > 2.5) return;

    const held = clamp((performance.now() - input.shootStartedAt) / 950, 0.12, 1);
    const canvas = canvasRef.current;
    let dir = { x: player.facingX, y: player.facingY };
    if (canvas && input.mouseInside) {
      const rect = canvas.getBoundingClientRect();
      const p = project(player.x, player.y, 1.2, rect.width, rect.height, state);
      const mx = input.mouseX - rect.left;
      const my = input.mouseY - rect.top;
      const sx = mx - p.x;
      const sy = my - p.y;
      dir = normalize(sx, sy * 1.55);
    }
    if (Math.hypot(dir.x, dir.y) < 0.1) dir = { x: 1, y: 0 };

    const pulseBoost = state.pulseActive > 0 ? 1.24 : 1;
    const speed = (29 + held * 34) * pulseBoost;
    ball.owner = null;
    ball.vx = dir.x * speed;
    ball.vy = dir.y * speed;
    ball.vz = 4 + held * 8.5;
    ball.spin = (Math.random() - 0.5) * (7 + held * 6);
    ball.lastTeam = HOME;
    state.cameraShake = 0.08 + held * 0.18;
    state.pulse = clamp(state.pulse + 8 + held * 5, 0, 100);
    state.commentary = held > 0.82 ? "FULL SEND // THUNDER STRIKE" : held > 0.48 ? "POWER SHOT" : "QUICK SNAP";
    state.commentaryTimer = 1;

    for (let i = 0; i < Math.floor(8 + held * 16); i += 1) {
      state.particles.push({
        x: ball.x,
        y: ball.y,
        z: Math.random() * 1.2,
        vx: -dir.x * (3 + Math.random() * 10) + (Math.random() - 0.5) * 5,
        vy: -dir.y * (3 + Math.random() * 10) + (Math.random() - 0.5) * 5,
        vz: 1 + Math.random() * 5,
        life: 0.3 + Math.random() * 0.4,
        maxLife: 0.7,
        size: 0.5 + Math.random() * 1.1,
        kind: "grass",
        team: HOME,
      });
    }
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const input = inputRef.current;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift", "tab", "q", "e", "p"].includes(key)) {
        event.preventDefault();
      }
      if (key === "w" || key === "arrowup") input.up = true;
      if (key === "s" || key === "arrowdown") input.down = true;
      if (key === "a" || key === "arrowleft") input.left = true;
      if (key === "d" || key === "arrowright") input.right = true;
      if (key === "shift") input.sprint = true;
      if (key === " " && !input.shoot) {
        input.shoot = true;
        input.shootStartedAt = performance.now();
      }
      if (key === "q" && !event.repeat) doPass();
      if (key === "e" && !event.repeat) activatePulse();
      if (key === "tab" && !event.repeat) switchPlayer();
      if (key === "p" && !event.repeat) togglePause();
    };
    const keyUp = (event: KeyboardEvent) => {
      const input = inputRef.current;
      const key = event.key.toLowerCase();
      if (key === "w" || key === "arrowup") input.up = false;
      if (key === "s" || key === "arrowdown") input.down = false;
      if (key === "a" || key === "arrowleft") input.left = false;
      if (key === "d" || key === "arrowright") input.right = false;
      if (key === "shift") input.sprint = false;
      if (key === " ") releaseShot();
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [activatePulse, doPass, releaseShot, switchPlayer, togglePause]);

  useEffect(() => {
    const hudTimer = window.setInterval(() => forceHud((v) => v + 1), 90);
    return () => window.clearInterval(hudTimer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const frame = (now: number) => {
      if (lastRef.current === 0) lastRef.current = now;
      const dt = Math.min((now - lastRef.current) / 1000, 0.032);
      lastRef.current = now;
      const state = stateRef.current;
      if (state.phase === "playing" || state.phase === "goal") updateMatch(state, inputRef.current, dt);
      drawMatch(canvas, state, inputRef.current, now / 1000);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const state = stateRef.current;
  const shotCharge = inputRef.current.shoot ? clamp((performance.now() - inputRef.current.shootStartedAt) / 950, 0, 1) : 0;
  const minutes = Math.floor(Math.max(0, state.timeLeft) / 60);
  const seconds = Math.floor(Math.max(0, state.timeLeft) % 60).toString().padStart(2, "0");
  const selected = state.players[state.controlled] ?? state.players[3];

  const mobileMove = (x: number, y: number) => {
    inputRef.current.left = x < -0.25;
    inputRef.current.right = x > 0.25;
    inputRef.current.up = y < -0.25;
    inputRef.current.down = y > 0.25;
  };

  return (
    <main className={styles.arenaPage} ref={shellRef}>
      <div className={styles.ambientA} />
      <div className={styles.ambientB} />
      <div className={styles.scanlines} />

      <header className={styles.topBar}>
        <ArenaLogo />
        <div className={styles.topCenter}>
          <span className={styles.liveDot} />
          <span>LIVE SIMULATION</span>
          <span className={styles.topDivider}>/</span>
          <span>SECTOR 07</span>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.iconButton} onClick={() => setAudioOn((v) => !v)} aria-label="Alternar áudio conceitual">
            {audioOn ? "SND ON" : "SND OFF"}
          </button>
          <button type="button" className={styles.iconButton} onClick={() => setShowHelp((v) => !v)}>
            CONTROLS
          </button>
        </div>
      </header>

      <section className={styles.scoreRail} aria-label="Placar">
        <div className={`${styles.teamPanel} ${styles.teamHome}`}>
          <span className={styles.teamCode}>ERI</span>
          <span className={styles.teamName}>ERILAB NOVA</span>
        </div>
        <div className={styles.scoreCore}>
          <strong>{state.score[0]}</strong>
          <span className={styles.scoreSlash}>:</span>
          <strong>{state.score[1]}</strong>
          <div className={styles.clock}>{minutes}:{seconds}</div>
        </div>
        <div className={`${styles.teamPanel} ${styles.teamAway}`}>
          <span className={styles.teamName}>VOID ATHLETIC</span>
          <span className={styles.teamCode}>VDA</span>
        </div>
      </section>

      <section className={styles.stageWrap}>
        <div className={styles.stageFrame}>
          <div className={styles.frameNotchLeft}>PITCH ARRAY</div>
          <div className={styles.frameNotchRight}>SIM / 120HZ</div>
          <canvas
            ref={canvasRef}
            className={styles.gameCanvas}
            onPointerMove={(event) => {
              inputRef.current.mouseX = event.clientX;
              inputRef.current.mouseY = event.clientY;
              inputRef.current.mouseInside = true;
            }}
            onPointerEnter={() => { inputRef.current.mouseInside = true; }}
            onPointerLeave={() => { inputRef.current.mouseInside = false; }}
            onPointerDown={(event) => {
              if (event.button !== 0 || stateRef.current.phase !== "playing") return;
              inputRef.current.shoot = true;
              inputRef.current.shootStartedAt = performance.now();
            }}
            onPointerUp={(event) => {
              if (event.button === 0) releaseShot();
            }}
          />

          <div className={styles.vignette} />
          <div className={styles.pitchGloss} />

          {state.commentaryTimer > 0 && state.phase !== "intro" && (
            <div className={styles.commentary}>
              <span className={styles.commentaryIndex}>SYS</span>
              <span>{state.commentary}</span>
            </div>
          )}

          {state.phase === "intro" && (
            <div className={styles.heroOverlay}>
              <div className={styles.heroKicker}>EXPERIMENTAL MATCH ENGINE</div>
              <h1>
                FOOTBALL<br />
                <span>REWIRED.</span>
              </h1>
              <p>
                4v4 em tempo real, física contínua, câmera de arena, dash, passes, chute carregado e um modo overdrive que transforma a partida por alguns segundos.
              </p>
              <div className={styles.heroStats}>
                <div><strong>04v04</strong><span>REAL-TIME</span></div>
                <div><strong>90s</strong><span>ARENA MATCH</span></div>
                <div><strong>∞</strong><span>NO TURNS</span></div>
              </div>
              <button type="button" className={styles.launchButton} onClick={startMatch}>
                <span>ENTER THE ARENA</span>
                <b>↗</b>
              </button>
              <div className={styles.heroHint}>WASD / ARROWS · SHIFT · Q · SPACE · E</div>
            </div>
          )}

          {state.phase === "paused" && (
            <div className={styles.centerOverlay}>
              <div className={styles.overlayEyebrow}>SIMULATION HOLD</div>
              <h2>PAUSED</h2>
              <button type="button" className={styles.launchButton} onClick={togglePause}>RESUME MATCH</button>
            </div>
          )}

          {state.phase === "ended" && (
            <div className={styles.centerOverlay}>
              <div className={styles.overlayEyebrow}>FINAL SIGNAL</div>
              <h2>{state.score[0] === state.score[1] ? "DRAW" : state.score[0] > state.score[1] ? "ERI WINS" : "VOID WINS"}</h2>
              <div className={styles.finalScore}>{state.score[0]} — {state.score[1]}</div>
              <button type="button" className={styles.launchButton} onClick={rematch}>RUN IT BACK</button>
            </div>
          )}

          {showHelp && (
            <aside className={styles.helpPanel}>
              <button type="button" onClick={() => setShowHelp(false)} className={styles.helpClose}>×</button>
              <span className={styles.panelEyebrow}>INPUT MATRIX</span>
              <h3>COMANDOS</h3>
              <dl>
                <div><dt>WASD</dt><dd>movimento</dd></div>
                <div><dt>SHIFT</dt><dd>sprint / dash</dd></div>
                <div><dt>Q</dt><dd>passe inteligente</dd></div>
                <div><dt>SPACE</dt><dd>segure e solte para chutar</dd></div>
                <div><dt>E</dt><dd>PULSE quando 100%</dd></div>
                <div><dt>TAB</dt><dd>troca para o mais perto da bola</dd></div>
                <div><dt>P</dt><dd>pausa</dd></div>
              </dl>
            </aside>
          )}
        </div>
      </section>

      <section className={styles.bottomHud}>
        <div className={styles.playerCard}>
          <div className={styles.playerNumber}>{selected.number.toString().padStart(2, "0")}</div>
          <div className={styles.playerMeta}>
            <span className={styles.panelEyebrow}>CONTROL // {selected.role}</span>
            <strong>{selected.name.toUpperCase()}</strong>
            <div className={styles.staminaLine}>
              <span style={{ width: `${Math.round(selected.stamina * 100)}%` }} />
            </div>
          </div>
        </div>

        <div className={styles.pulseModule}>
          <div className={styles.moduleLabel}>
            <span>PULSE DRIVE</span>
            <strong>{state.pulseActive > 0 ? "OVERDRIVE" : `${Math.round(state.pulse)}%`}</strong>
          </div>
          <div className={`${styles.pulseTrack} ${state.pulse >= 100 ? styles.pulseReady : ""}`}>
            <span style={{ width: `${state.pulseActive > 0 ? 100 : state.pulse}%` }} />
          </div>
          <small>{state.pulse >= 100 && state.pulseActive <= 0 ? "PRESS E // BREAK LIMIT" : state.pulseActive > 0 ? `${state.pulseActive.toFixed(1)}s REMAINING` : "touches + passes + shots charge the core"}</small>
        </div>

        <div className={styles.actionCluster}>
          <div className={styles.actionChip}><kbd>Q</kbd><span>PASS</span></div>
          <div className={`${styles.actionChip} ${styles.shotChip}`}><kbd>SPACE</kbd><span>SHOT</span><i style={{ transform: `scaleX(${shotCharge})` }} /></div>
          <div className={`${styles.actionChip} ${state.pulse >= 100 ? styles.hotChip : ""}`}><kbd>E</kbd><span>PULSE</span></div>
        </div>
      </section>

      <div className={styles.mobileControls} aria-hidden="true">
        <div
          className={styles.mobileStick}
          onPointerDown={(event) => {
            const el = event.currentTarget;
            el.setPointerCapture(event.pointerId);
            const rect = el.getBoundingClientRect();
            mobileMove((event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2), (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2));
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const rect = event.currentTarget.getBoundingClientRect();
            mobileMove((event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2), (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2));
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            mobileMove(0, 0);
          }}
        >
          <span />
        </div>
        <div className={styles.mobileButtons}>
          <button type="button" onPointerDown={doPass}>Q</button>
          <button
            type="button"
            onPointerDown={() => {
              inputRef.current.shoot = true;
              inputRef.current.shootStartedAt = performance.now();
            }}
            onPointerUp={releaseShot}
          >S</button>
          <button type="button" onPointerDown={activatePulse}>E</button>
        </div>
      </div>

      <footer className={styles.footerStrip}>
        <span>PROTOTYPE BUILD / ERILAB</span>
        <span>PHYSICS: ACTIVE</span>
        <span>CAMERA: DYNAMIC</span>
        <span>AI: ARENA-4</span>
      </footer>
    </main>
  );
}

function updateMatch(state: MatchState, input: InputState, dt: number) {
  if (state.phase === "goal") {
    state.goalTimer -= dt;
    updateParticles(state, dt);
    state.cameraShake = Math.max(0, state.cameraShake - dt * 0.45);
    state.flash = Math.max(0, state.flash - dt * 1.5);
    if (state.goalTimer <= 0) {
      resetKickoff(state, state.goalTeam === HOME ? AWAY : HOME);
      state.goalTeam = null;
      state.phase = "playing";
      state.commentary = "RESET // NEXT POINT";
      state.commentaryTimer = 1.2;
    }
    return;
  }

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.phase = "ended";
    state.commentary = "FINAL SIGNAL";
    return;
  }

  state.commentaryTimer = Math.max(0, state.commentaryTimer - dt);
  state.pulseActive = Math.max(0, state.pulseActive - dt);
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) state.combo = 0;
  state.cameraShake = Math.max(0, state.cameraShake - dt * 1.8);
  state.flash = Math.max(0, state.flash - dt * 2);

  const controlled = state.players[state.controlled];
  if (controlled?.team === HOME) updateControlledPlayer(controlled, state, input, dt);

  updateAI(state, dt);
  resolvePlayerCollisions(state.players);
  updateBall(state, dt);
  updateParticles(state, dt);

  const nearestHome = getNearestPlayer(state, HOME, false);
  if (controlled && state.ball.owner !== controlled.id && Math.hypot(controlled.x - state.ball.x, controlled.y - state.ball.y) > 23 && nearestHome && nearestHome.role !== "GK") {
    state.controlled = nearestHome.id;
    nearestHome.controlledGlow = 1;
  }

  state.players.forEach((player) => {
    player.cooldown = Math.max(0, player.cooldown - dt);
    player.controlledGlow = Math.max(0, player.controlledGlow - dt * 2.2);
    const moving = Math.hypot(player.vx, player.vy);
    if (player.id !== state.controlled || !input.sprint || moving < 1) player.stamina = Math.min(1, player.stamina + dt * 0.1);
  });
}

function updateControlledPlayer(player: Player, state: MatchState, input: InputState, dt: number) {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const moving = Math.hypot(dx, dy) > 0;
  if (moving) {
    const n = normalize(dx, dy);
    dx = n.x;
    dy = n.y;
  }

  const pulse = state.pulseActive > 0;
  const sprinting = input.sprint && player.stamina > 0.04 && moving;
  const maxSpeed = (sprinting ? 22 : 14.2) * (pulse ? 1.28 : 1);
  const accel = sprinting ? 78 : 62;
  const targetVx = dx * maxSpeed;
  const targetVy = dy * maxSpeed;
  player.vx = lerp(player.vx, targetVx, clamp(dt * accel / Math.max(1, maxSpeed), 0, 1));
  player.vy = lerp(player.vy, targetVy, clamp(dt * accel / Math.max(1, maxSpeed), 0, 1));
  if (!moving) {
    player.vx *= Math.pow(0.0015, dt);
    player.vy *= Math.pow(0.0015, dt);
  }
  if (moving) {
    player.facingX = dx;
    player.facingY = dy;
  }
  if (sprinting) {
    player.stamina = Math.max(0, player.stamina - dt * 0.28);
    state.pulse = clamp(state.pulse + dt * 1.3, 0, 100);
  }

  player.x = clamp(player.x + player.vx * dt, 2, FIELD_W - 2);
  player.y = clamp(player.y + player.vy * dt, 2, FIELD_H - 2);

  const ball = state.ball;
  const dist = Math.hypot(ball.x - player.x, ball.y - player.y);
  if (dist < 3.4 && ball.z < 2.1 && length(ball.vx, ball.vy) < 24) {
    const frontX = player.x + player.facingX * 2.1;
    const frontY = player.y + player.facingY * 2.1;
    ball.x = lerp(ball.x, frontX, clamp(dt * 10, 0, 1));
    ball.y = lerp(ball.y, frontY, clamp(dt * 10, 0, 1));
    ball.vx = lerp(ball.vx, player.vx * 0.92, clamp(dt * 6, 0, 1));
    ball.vy = lerp(ball.vy, player.vy * 0.92, clamp(dt * 6, 0, 1));
    ball.owner = player.id;
    ball.lastTeam = HOME;
    state.possession = HOME;
    state.pulse = clamp(state.pulse + dt * 3.4, 0, 100);
  }
}

function updateAI(state: MatchState, dt: number) {
  const ball = state.ball;
  for (const player of state.players) {
    if (player.id === state.controlled) continue;
    const attackDir = player.team === HOME ? 1 : -1;
    const isGoalie = player.role === "GK";
    const ballDist = Math.hypot(ball.x - player.x, ball.y - player.y);
    const teamHasBall = state.possession === player.team;
    let tx = player.x;
    let ty = player.y;
    let desiredSpeed = 10.5;

    if (isGoalie) {
      tx = player.team === HOME ? 6.5 : 93.5;
      ty = clamp(ball.y, 24, 40);
      desiredSpeed = 10;
      if (ballDist < 9 || (player.team === HOME ? ball.x < 14 : ball.x > 86)) {
        tx = clamp(ball.x, player.team === HOME ? 3 : 86, player.team === HOME ? 14 : 97);
        ty = clamp(ball.y, 20, 44);
      }
    } else {
      const nearest = getNearestPlayer(state, player.team, false);
      const shouldPress = nearest?.id === player.id && state.possession !== player.team;
      if (shouldPress || ballDist < 9) {
        tx = ball.x - ball.vx * 0.035;
        ty = ball.y - ball.vy * 0.035;
        desiredSpeed = 13.4;
      } else if (teamHasBall) {
        const lane = player.role === "FWD" ? 18 : player.role === "MID" ? 10 : 2;
        tx = clamp(ball.x + attackDir * lane, 12, 88);
        const laneOffset = ((player.id % 3) - 1) * 12;
        ty = clamp(32 + laneOffset + (ball.y - 32) * 0.42, 8, 56);
        desiredSpeed = 11.7;
      } else {
        const baseX = player.team === HOME ? (player.role === "DEF" ? 27 : player.role === "MID" ? 38 : 48) : (player.role === "DEF" ? 73 : player.role === "MID" ? 62 : 52);
        tx = baseX + (ball.x - 50) * 0.2;
        ty = clamp(32 + ((player.id % 3) - 1) * 13 + (ball.y - 32) * 0.28, 7, 57);
      }
    }

    const dir = normalize(tx - player.x, ty - player.y);
    const distance = Math.hypot(tx - player.x, ty - player.y);
    const speed = distance < 1.2 ? 0 : desiredSpeed * (state.pulseActive > 0 && player.team === HOME ? 1.08 : 1);
    player.vx = lerp(player.vx, dir.x * speed, clamp(dt * 5.2, 0, 1));
    player.vy = lerp(player.vy, dir.y * speed, clamp(dt * 5.2, 0, 1));
    player.x = clamp(player.x + player.vx * dt, 2, FIELD_W - 2);
    player.y = clamp(player.y + player.vy * dt, 2, FIELD_H - 2);
    if (speed > 0.5) {
      player.facingX = dir.x;
      player.facingY = dir.y;
    }

    if (ballDist < (isGoalie ? 3.8 : 3.1) && ball.z < (isGoalie ? 3.3 : 2.0) && player.cooldown <= 0) {
      const goalX = player.team === HOME ? FIELD_W + 3 : -3;
      const goalY = 32 + (Math.random() - 0.5) * 8;
      const shotDir = normalize(goalX - ball.x, goalY - ball.y);
      const isForwardShot = player.team === HOME ? ball.x > 54 : ball.x < 46;
      const power = isGoalie ? 30 : isForwardShot ? 31 + Math.random() * 13 : 20 + Math.random() * 7;
      ball.owner = null;
      ball.vx = shotDir.x * power;
      ball.vy = shotDir.y * power;
      ball.vz = 2.2 + Math.random() * 4.5;
      ball.spin = (Math.random() - 0.5) * 8;
      ball.lastTeam = player.team;
      state.possession = player.team;
      player.cooldown = 0.65 + Math.random() * 0.35;
      if (player.team === HOME) state.pulse = clamp(state.pulse + 3, 0, 100);
    }
  }
}

function getNearestPlayer(state: MatchState, team: TeamId, includeGoalie: boolean) {
  let best: Player | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const player of state.players) {
    if (player.team !== team || (!includeGoalie && player.role === "GK")) continue;
    const d = Math.hypot(player.x - state.ball.x, player.y - state.ball.y);
    if (d < bestDist) {
      best = player;
      bestDist = d;
    }
  }
  return best;
}

function resolvePlayerCollisions(players: Player[]) {
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const minDist = 2.8;
      if (dist >= minDist) continue;
      const push = (minDist - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      a.vx -= nx * 0.9;
      a.vy -= ny * 0.9;
      b.vx += nx * 0.9;
      b.vy += ny * 0.9;
    }
  }
}

function updateBall(state: MatchState, dt: number) {
  const ball = state.ball;
  if (ball.owner !== null) {
    const owner = state.players[ball.owner];
    if (owner) {
      state.possession = owner.team;
      ball.lastTeam = owner.team;
    }
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.vz -= 24 * dt;
  ball.spin *= Math.pow(0.4, dt);

  if (ball.z <= 0.32) {
    ball.z = 0.32;
    if (Math.abs(ball.vz) > 2.4) ball.vz = -ball.vz * 0.44;
    else ball.vz = 0;
    ball.vx *= Math.pow(0.34, dt);
    ball.vy *= Math.pow(0.34, dt);
  } else {
    ball.vx *= Math.pow(0.86, dt);
    ball.vy *= Math.pow(0.86, dt);
  }

  if (ball.y < 1.1) {
    ball.y = 1.1;
    ball.vy = Math.abs(ball.vy) * 0.76;
    state.cameraShake = Math.max(state.cameraShake, 0.035);
  }
  if (ball.y > FIELD_H - 1.1) {
    ball.y = FIELD_H - 1.1;
    ball.vy = -Math.abs(ball.vy) * 0.76;
    state.cameraShake = Math.max(state.cameraShake, 0.035);
  }

  const inGoalMouth = Math.abs(ball.y - FIELD_H / 2) <= GOAL_HALF;
  if (ball.x < -1.1 && inGoalMouth) scoreGoal(state, AWAY);
  else if (ball.x > FIELD_W + 1.1 && inGoalMouth) scoreGoal(state, HOME);
  else {
    if (ball.x < 1.2) {
      ball.x = 1.2;
      ball.vx = Math.abs(ball.vx) * 0.78;
    }
    if (ball.x > FIELD_W - 1.2) {
      ball.x = FIELD_W - 1.2;
      ball.vx = -Math.abs(ball.vx) * 0.78;
    }
  }

  if (Math.hypot(ball.vx, ball.vy) < 0.5 && ball.z <= 0.35) ball.owner = null;
}

function scoreGoal(state: MatchState, team: TeamId) {
  if (state.phase === "goal") return;
  state.score[team] += 1;
  state.phase = "goal";
  state.goalTimer = 2.6;
  state.goalTeam = team;
  state.cameraShake = 0.72;
  state.flash = 1;
  state.combo = 0;
  state.commentary = team === HOME ? "GOAL // ERILAB NOVA" : "BREACH // VOID ATHLETIC";
  state.commentaryTimer = 2.6;
  if (team === HOME) state.pulse = clamp(state.pulse + 28, 0, 100);

  for (let i = 0; i < 90; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 24;
    state.particles.push({
      x: team === HOME ? FIELD_W - 1 : 1,
      y: 32 + (Math.random() - 0.5) * 11,
      z: Math.random() * 5,
      vx: Math.cos(angle) * speed + (team === HOME ? -6 : 6),
      vy: Math.sin(angle) * speed,
      vz: 4 + Math.random() * 14,
      life: 0.7 + Math.random() * 1.2,
      maxLife: 1.9,
      size: 0.7 + Math.random() * 2.4,
      kind: "goal",
      team,
    });
  }
}

function updateParticles(state: MatchState, dt: number) {
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vz -= 18 * dt;
    p.vx *= Math.pow(0.3, dt);
    p.vy *= Math.pow(0.3, dt);
    if (p.z < 0) {
      p.z = 0;
      p.vz *= -0.35;
    }
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}

function project(x: number, y: number, z: number, width: number, height: number, state: MatchState): Projection {
  const focusX = lerp(50, clamp(state.ball.x, 30, 70), 0.12);
  const normalizedY = clamp(y / FIELD_H, 0, 1);
  const depth = 0.63 + normalizedY * 0.5;
  const fieldWidth = Math.min(width * 0.94, height * 1.55);
  const pxPerUnit = fieldWidth / FIELD_W;
  const centerX = width * 0.5;
  const farY = height * 0.235;
  const pitchHeight = height * 0.59;
  const shake = state.cameraShake;
  const shakeX = shake > 0 ? (Math.random() - 0.5) * 15 * shake : 0;
  const shakeY = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
  return {
    x: centerX + (x - focusX) * pxPerUnit * depth + shakeX,
    y: farY + normalizedY * pitchHeight - z * pxPerUnit * depth * 0.88 + shakeY,
    scale: pxPerUnit * depth,
  };
}

function drawMatch(canvas: HTMLCanvasElement, state: MatchState, input: InputState, now: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  drawBackdrop(ctx, width, height, now, state);
  drawPitch(ctx, width, height, now, state);
  drawGoals(ctx, width, height, state);
  drawPitchObjects(ctx, width, height, state, input, now);
  drawForeground(ctx, width, height, now, state);

  if (state.flash > 0) {
    ctx.save();
    ctx.globalAlpha = state.flash * 0.22;
    ctx.fillStyle = state.goalTeam === AWAY ? "#ff365b" : "#bcff1f";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, now: number, state: MatchState) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#050913");
  sky.addColorStop(0.46, "#08131a");
  sky.addColorStop(1, "#030608");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const horizon = height * 0.235;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 7; i += 1) {
    const x = ((i + 0.5) / 7) * width;
    const glow = ctx.createRadialGradient(x, horizon * 0.7, 0, x, horizon * 0.7, width * 0.16);
    glow.addColorStop(0, i % 2 ? "rgba(92,190,255,.16)" : "rgba(184,255,29,.10)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, horizon * 1.8);
  }
  ctx.restore();

  ctx.fillStyle = "#080d14";
  ctx.fillRect(0, horizon * 0.46, width, horizon * 0.5);
  for (let tier = 0; tier < 4; tier += 1) {
    const y = horizon * (0.58 + tier * 0.1);
    ctx.fillStyle = tier % 2 ? "rgba(20,30,38,.95)" : "rgba(10,16,22,.95)";
    ctx.fillRect(0, y, width, horizon * 0.09);
    for (let i = 0; i < Math.floor(width / 12); i += 1) {
      const pulse = 0.15 + 0.1 * Math.sin(now * 2 + i * 0.7 + tier);
      ctx.fillStyle = i % 7 === 0 ? `rgba(190,255,30,${0.28 + pulse})` : i % 5 === 0 ? `rgba(80,196,255,${0.18 + pulse})` : "rgba(170,190,205,.08)";
      ctx.fillRect(i * 12 + 3, y + 3, 3, 2 + (i % 3));
    }
  }

  ctx.strokeStyle = "rgba(110,220,255,.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 11; i += 1) {
    const x = (i / 10) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(width / 2 + (x - width / 2) * 0.72, horizon);
    ctx.stroke();
  }

  if (state.phase === "goal") {
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(now * 25) * 0.18;
    ctx.fillStyle = state.goalTeam === HOME ? "#bcff1f" : "#ff365b";
    ctx.fillRect(0, horizon * 0.45, width, 2);
    ctx.restore();
  }
}

function traceWorldLine(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  width: number,
  height: number,
  state: MatchState,
) {
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    const p = project(x, y, 0.03, width, height, state);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
}

function drawPitch(ctx: CanvasRenderingContext2D, width: number, height: number, now: number, state: MatchState) {
  const corners = [
    project(0, 0, 0, width, height, state),
    project(FIELD_W, 0, 0, width, height, state),
    project(FIELD_W, FIELD_H, 0, width, height, state),
    project(0, FIELD_H, 0, width, height, state),
  ];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  const turf = ctx.createLinearGradient(0, corners[0].y, 0, corners[2].y);
  turf.addColorStop(0, "#0b382f");
  turf.addColorStop(0.48, "#0b4939");
  turf.addColorStop(1, "#0b332b");
  ctx.fillStyle = turf;
  ctx.fill();

  ctx.clip();
  for (let stripe = 0; stripe < 10; stripe += 1) {
    const x0 = stripe * 10;
    const p1 = project(x0, 0, 0.01, width, height, state);
    const p2 = project(x0 + 10, 0, 0.01, width, height, state);
    const p3 = project(x0 + 10, FIELD_H, 0.01, width, height, state);
    const p4 = project(x0, FIELD_H, 0.01, width, height, state);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fillStyle = stripe % 2 ? "rgba(255,255,255,.014)" : "rgba(0,0,0,.045)";
    ctx.fill();
  }

  for (let y = 4; y < FIELD_H; y += 4) {
    const a = project(0, y, 0.02, width, height, state);
    const b = project(FIELD_W, y, 0.02, width, height, state);
    ctx.strokeStyle = "rgba(180,255,225,.028)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(228,255,246,.78)";
  ctx.lineWidth = Math.max(1, width / 900);
  traceWorldLine(ctx, [[0, 0], [FIELD_W, 0], [FIELD_W, FIELD_H], [0, FIELD_H], [0, 0]], width, height, state);
  ctx.stroke();
  traceWorldLine(ctx, [[50, 0], [50, FIELD_H]], width, height, state);
  ctx.stroke();

  const circle: Array<[number, number]> = [];
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    circle.push([50 + Math.cos(a) * 9, 32 + Math.sin(a) * 9]);
  }
  traceWorldLine(ctx, circle, width, height, state);
  ctx.stroke();

  for (const side of [0, 1] as const) {
    const x0 = side === 0 ? 0 : 100;
    const x1 = side === 0 ? 16 : 84;
    traceWorldLine(ctx, [[x0, 20], [x1, 20], [x1, 44], [x0, 44]], width, height, state);
    ctx.stroke();
    const small = side === 0 ? 6 : 94;
    traceWorldLine(ctx, [[x0, 25], [small, 25], [small, 39], [x0, 39]], width, height, state);
    ctx.stroke();
  }

  const c = project(50, 32, 0.04, width, height, state);
  ctx.fillStyle = "rgba(230,255,248,.92)";
  ctx.beginPath();
  ctx.arc(c.x, c.y, Math.max(1.5, c.scale * 0.22), 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "screen";
  const sweepX = ((now * 44) % (width * 1.5)) - width * 0.25;
  const beam = ctx.createLinearGradient(sweepX - 120, 0, sweepX + 120, 0);
  beam.addColorStop(0, "rgba(0,0,0,0)");
  beam.addColorStop(0.5, "rgba(100,220,255,.045)");
  beam.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = beam;
  ctx.fillRect(0, corners[0].y, width, corners[2].y - corners[0].y);
  ctx.restore();
}

function drawGoals(ctx: CanvasRenderingContext2D, width: number, height: number, state: MatchState) {
  for (const side of [HOME, AWAY] as const) {
    const x = side === HOME ? 0 : FIELD_W;
    const backX = side === HOME ? -4.3 : FIELD_W + 4.3;
    const top = 32 - GOAL_HALF;
    const bottom = 32 + GOAL_HALF;
    const a = project(x, top, 0, width, height, state);
    const b = project(x, bottom, 0, width, height, state);
    const c = project(x, top, 5, width, height, state);
    const d = project(x, bottom, 5, width, height, state);
    const ba = project(backX, top, 0, width, height, state);
    const bb = project(backX, bottom, 0, width, height, state);
    const bc = project(backX, top, 5, width, height, state);
    const bd = project(backX, bottom, 5, width, height, state);

    ctx.save();
    ctx.strokeStyle = "rgba(225,244,255,.72)";
    ctx.lineWidth = Math.max(1.3, a.scale * 0.18);
    const segments: Array<[Projection, Projection]> = [[a, c], [b, d], [c, d], [c, bc], [d, bd], [bc, bd], [ba, bc], [bb, bd]];
    segments.forEach(([p1, p2]) => {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });
    ctx.strokeStyle = "rgba(110,180,210,.20)";
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 5; i += 1) {
      const yy = lerp(top, bottom, i / 5);
      const p1 = project(x, yy, 0, width, height, state);
      const p2 = project(backX, yy, 0, width, height, state);
      const p3 = project(backX, yy, 5, width, height, state);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPitchObjects(ctx: CanvasRenderingContext2D, width: number, height: number, state: MatchState, input: InputState, now: number) {
  type Drawable = { depth: number; draw: () => void };
  const objects: Drawable[] = [];

  for (const particle of state.particles) {
    objects.push({
      depth: particle.y + particle.z * 0.02,
      draw: () => drawParticle(ctx, particle, width, height, state),
    });
  }
  for (const player of state.players) {
    objects.push({
      depth: player.y,
      draw: () => drawPlayer(ctx, player, width, height, state, now),
    });
  }
  objects.push({ depth: state.ball.y + 0.1, draw: () => drawBall(ctx, state.ball, width, height, state, now) });
  objects.sort((a, b) => a.depth - b.depth).forEach((object) => object.draw());

  if (state.phase === "playing") drawAim(ctx, width, height, state, input, now);
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, width: number, height: number, state: MatchState, now: number) {
  const feet = project(player.x, player.y, 0.15, width, height, state);
  const body = project(player.x, player.y, 2.5, width, height, state);
  const head = project(player.x, player.y, 4.3, width, height, state);
  const moving = Math.hypot(player.vx, player.vy);
  const bob = Math.sin(now * 10 + player.id * 1.7) * Math.min(1, moving / 12) * feet.scale * 0.08;
  const controlled = player.id === state.controlled;
  const home = player.team === HOME;
  const pulse = state.pulseActive > 0 && home;
  const primary = home ? "#c8ff21" : "#ff365b";
  const secondary = home ? "#73d8ff" : "#a56bff";

  ctx.save();
  ctx.translate(0, bob);

  const shadow = ctx.createRadialGradient(feet.x, feet.y, 0, feet.x, feet.y, feet.scale * 2.4);
  shadow.addColorStop(0, "rgba(0,0,0,.48)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(feet.x, feet.y + feet.scale * 0.18, feet.scale * 2.5, feet.scale * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();

  if (controlled || pulse) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = pulse ? "rgba(194,255,30,.88)" : "rgba(120,220,255,.72)";
    ctx.lineWidth = Math.max(1.5, feet.scale * 0.18);
    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y + feet.scale * 0.12, feet.scale * (controlled ? 2.25 : 1.85), feet.scale * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (controlled) {
      ctx.globalAlpha = 0.35 + Math.sin(now * 5) * 0.15;
      ctx.beginPath();
      ctx.ellipse(feet.x, feet.y + feet.scale * 0.12, feet.scale * 2.9, feet.scale * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  const bodyW = feet.scale * 1.35;
  const bodyH = Math.max(feet.scale * 2.8, feet.y - body.y + feet.scale * 0.5);
  const grad = ctx.createLinearGradient(body.x - bodyW, body.y, body.x + bodyW, body.y + bodyH);
  grad.addColorStop(0, home ? "#e5ff6a" : "#ff6a83");
  grad.addColorStop(0.48, primary);
  grad.addColorStop(1, home ? "#5c8d12" : "#851e38");
  ctx.fillStyle = grad;
  roundRect(ctx, body.x - bodyW / 2, body.y, bodyW, bodyH, feet.scale * 0.45);
  ctx.fill();

  ctx.fillStyle = "rgba(3,8,12,.72)";
  ctx.fillRect(body.x - bodyW * 0.35, body.y + bodyH * 0.56, bodyW * 0.7, Math.max(1, feet.scale * 0.28));

  const shoulderY = body.y + bodyH * 0.28;
  ctx.strokeStyle = home ? "#bff3ff" : "#d9c0ff";
  ctx.lineWidth = Math.max(1.8, feet.scale * 0.42);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(body.x - bodyW * 0.46, shoulderY);
  ctx.lineTo(body.x - bodyW * 0.92, shoulderY + feet.scale * 0.75 + player.facingY * feet.scale * 0.2);
  ctx.moveTo(body.x + bodyW * 0.46, shoulderY);
  ctx.lineTo(body.x + bodyW * 0.92, shoulderY + feet.scale * 0.75 - player.facingY * feet.scale * 0.2);
  ctx.stroke();

  ctx.fillStyle = "#e7c8ad";
  ctx.beginPath();
  ctx.arc(head.x, head.y, feet.scale * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#101820";
  ctx.beginPath();
  ctx.arc(head.x - feet.scale * 0.08, head.y - feet.scale * 0.15, feet.scale * 0.72, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(2,7,10,.75)";
  ctx.font = `700 ${Math.max(8, feet.scale * 0.76)}px var(--font-barlow-condensed), sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(String(player.number), body.x, body.y + bodyH * 0.43);

  if (controlled) {
    const tagY = head.y - feet.scale * 1.7;
    ctx.fillStyle = "rgba(4,10,14,.82)";
    roundRect(ctx, head.x - feet.scale * 2.2, tagY - feet.scale * 0.8, feet.scale * 4.4, feet.scale * 1.35, feet.scale * 0.45);
    ctx.fill();
    ctx.fillStyle = "#eaffff";
    ctx.font = `800 ${Math.max(8, feet.scale * 0.72)}px var(--font-barlow-condensed), sans-serif`;
    ctx.fillText(player.name.toUpperCase(), head.x, tagY + feet.scale * 0.15);
    ctx.fillStyle = secondary;
    ctx.fillRect(head.x - feet.scale * 1.5, tagY + feet.scale * 0.48, feet.scale * 3 * player.stamina, Math.max(1, feet.scale * 0.12));
  }

  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, width: number, height: number, state: MatchState, now: number) {
  const shadow = project(ball.x, ball.y, 0, width, height, state);
  const p = project(ball.x, ball.y, ball.z, width, height, state);
  const r = clamp(p.scale * 0.58, 3.8, 11.5);

  ctx.save();
  ctx.globalAlpha = clamp(1 - ball.z * 0.035, 0.36, 0.8);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.beginPath();
  ctx.ellipse(shadow.x, shadow.y + 2, r * (1.45 + ball.z * 0.06), r * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (Math.hypot(ball.vx, ball.vy) > 18) {
    const back = normalize(-ball.vx, -ball.vy);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const trail = ctx.createLinearGradient(p.x, p.y, p.x + back.x * r * 7, p.y + back.y * r * 7);
    trail.addColorStop(0, "rgba(210,255,255,.58)");
    trail.addColorStop(1, "rgba(80,190,255,0)");
    ctx.strokeStyle = trail;
    ctx.lineWidth = r * 0.75;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + back.x * r * 7, p.y + back.y * r * 7);
    ctx.stroke();
    ctx.restore();
  }

  const ballGradient = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, r * 0.12, p.x, p.y, r);
  ballGradient.addColorStop(0, "#ffffff");
  ballGradient.addColorStop(0.48, "#d9e9ed");
  ballGradient.addColorStop(1, "#607078");
  ctx.fillStyle = ballGradient;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(now * 4 + ball.spin);
  ctx.fillStyle = "#111820";
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.47, Math.sin(a) * r * 0.47, r * 0.19, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle, width: number, height: number, state: MatchState) {
  const p = project(particle.x, particle.y, particle.z, width, height, state);
  const alpha = clamp(particle.life / particle.maxLife, 0, 1);
  const color = particle.kind === "grass" ? "110,215,168" : particle.team === HOME ? "196,255,31" : "255,54,91";
  ctx.save();
  ctx.globalCompositeOperation = particle.kind === "grass" ? "source-over" : "screen";
  ctx.fillStyle = `rgba(${color},${alpha})`;
  const size = Math.max(1, p.scale * particle.size * 0.18);
  ctx.beginPath();
  ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
  ctx.fill();
  if (particle.kind !== "grass") {
    ctx.globalAlpha = alpha * 0.25;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAim(ctx: CanvasRenderingContext2D, width: number, height: number, state: MatchState, input: InputState, now: number) {
  const player = state.players[state.controlled];
  if (!player) return;
  const ballDist = Math.hypot(state.ball.x - player.x, state.ball.y - player.y);
  if (ballDist > 6) return;
  const start = project(player.x, player.y, 1.1, width, height, state);
  let dx = player.facingX;
  let dy = player.facingY / 1.55;
  const canvas = ctx.canvas;
  const rect = canvas.getBoundingClientRect();
  if (input.mouseInside) {
    dx = input.mouseX - rect.left - start.x;
    dy = input.mouseY - rect.top - start.y;
    const n = normalize(dx, dy);
    dx = n.x;
    dy = n.y;
  }
  const charge = input.shoot ? clamp((performance.now() - input.shootStartedAt) / 950, 0, 1) : 0;
  const len = 42 + charge * 76;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(${charge > 0.75 ? "196,255,31" : "120,220,255"},${0.34 + charge * 0.42})`;
  ctx.lineWidth = 1.6 + charge * 2.4;
  ctx.setLineDash([7, 7]);
  ctx.lineDashOffset = -now * 18;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(start.x + dx * len, start.y + dy * len);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(start.x + dx * len, start.y + dy * len, 6 + charge * 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawForeground(ctx: CanvasRenderingContext2D, width: number, height: number, now: number, state: MatchState) {
  const nearY = project(0, FIELD_H, 0, width, height, state).y;
  const grad = ctx.createLinearGradient(0, nearY - 30, 0, height);
  grad.addColorStop(0, "rgba(1,4,6,0)");
  grad.addColorStop(0.5, "rgba(1,4,6,.28)");
  grad.addColorStop(1, "rgba(1,4,6,.96)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, nearY - 30, width, height - nearY + 30);

  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = "#bff6ff";
  for (let i = 0; i < 14; i += 1) {
    const x = ((i * 83 + 19) % 997) / 997 * width;
    const y = height * 0.14 + ((i * 37) % 71) / 71 * height * 0.75;
    const r = 0.5 + ((i * 13) % 7) * 0.12;
    ctx.beginPath();
    ctx.arc(x + Math.sin(now + i) * 3, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

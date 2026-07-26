"use client";

// Partida jogável. Recebe um setup e devolve um resultado — não sabe nada de
// carreira, temporada nem GameState, então serve igual para o modo avulso e
// para a final do Futbobo.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import "./botao.css";
import { isBotaoMuted, playBotaoSound, setBotaoMuted, unlockAudio } from "./audio";
import { chooseCpuPenaltyShot, chooseCpuShot, cpuSkillFor } from "./cpu";
import {
  advanceClock,
  aimFromDrag,
  ballOf,
  beginPenaltyShot,
  beginShot,
  canShoot,
  commitPenalty,
  confirmPenaltyOrder,
  createMatch,
  jumpToPenalties,
  penaltyKeeper,
  penaltyShooter,
  resumeAfterGoal,
  skipTurn,
  startNextPeriod,
  stepMatch,
  stepPenalty,
  stepPenaltyKeeper,
  userPlayerDisc,
  type BotaoEvent,
  type BotaoMatchState,
} from "./engine";
import { formationById, slotRoleLabel } from "./formations";
import TeamCrest from "./TeamCrest";
import {
  VIEW_HEIGHT,
  VIEW_PAD_X,
  VIEW_PAD_Y,
  VIEW_WIDTH,
  drawMatch,
  toFieldPoint,
  type BotaoAimView,
} from "./render";
import type { BotaoMatchResult, BotaoMatchSetup, BotaoSide } from "./types";

const PHYSICS_DT = 1 / 120;
const MAX_SUBSTEPS = 12;
const GOAL_PAUSE_MS = 1700;
const CPU_THINK_MS = 430;
const PENALTY_PAUSE_MS = 1100;
const SIDES: BotaoSide[] = ["user", "cpu"];

type Flash = { text: string; tone: "goal" | "info" | "bad" } | null;

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

function formatClock(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function periodName(state: BotaoMatchState) {
  const regulation = state.setup.rules.halves;
  if (state.period > regulation) {
    return state.setup.rules.extraHalves > 1 ? `Prorrogação ${state.period - regulation}` : "Prorrogação";
  }
  return regulation === 1 ? "Tempo corrido" : `${state.period}º tempo`;
}

export default function BotaoMatch({
  setup,
  onFinish,
  onGiveUp,
  startInPenalties = false,
}: {
  setup: BotaoMatchSetup;
  onFinish: (result: BotaoMatchResult) => void;
  onGiveUp?: () => void;
  /** Pula direto para a decisão por pênaltis (modo de teste). */
  startInPenalties?: boolean;
}) {
  const matchRef = useRef<BotaoMatchState | null>(null);
  const machine =
    matchRef.current ??
    (matchRef.current = (() => {
      const created = createMatch(setup);
      if (startInPenalties) jumpToPenalties(created);
      return created;
    })());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const aimRef = useRef<BotaoAimView | null>(null);
  const selectedRef = useRef<string | null>(null);
  const pointerRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastHitRef = useRef(0);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const goalFlashRef = useRef(0);
  const goalFlashSideRef = useRef<BotaoSide | null>(null);
  // Timers guardados em ref: efeitos sem lista de dependências rodam a cada
  // render, e limpar no cleanup cancelaria a transição no meio do caminho.
  const timersRef = useRef<{ goal: number | null; cpu: number | null; penalty: number | null; finish: number | null }>({
    goal: null,
    cpu: null,
    penalty: null,
    finish: null,
  });
  const flashTimerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const [, setTick] = useState(0);
  const [flash, setFlash] = useState<Flash>(null);
  const [cpuThinking, setCpuThinking] = useState(false);
  const [muted, setMuted] = useState(() => isBotaoMuted());
  const [shaking, setShaking] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const bump = useCallback(() => setTick((value) => value + 1), []);

  /**
   * Todo aviso some sozinho. Antes o "NA TRAVE!" não tinha quem o apagasse e
   * ficava na tela até o próximo gol — às vezes até o fim da partida.
   */
  const showFlash = useCallback((text: string, tone: "goal" | "info" | "bad", duration = 1200) => {
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    setFlash({ text, tone });
    flashTimerRef.current = window.setTimeout(() => {
      flashTimerRef.current = null;
      setFlash(null);
    }, duration);
  }, []);

  // Assinatura do motor: muda só quando a partida realmente avança. É o que
  // dispara as transições abaixo — sem ela os efeitos rodariam a cada frame.
  const signature = [
    machine.phase,
    machine.turn,
    machine.turns,
    machine.period,
    machine.penalties?.turn ?? "-",
    machine.penalties?.round ?? "-",
    machine.penalties?.shotInFlight ?? "-",
  ].join("|");

  useEffect(
    () => () => {
      const timers = timersRef.current;
      for (const key of Object.keys(timers) as Array<keyof typeof timers>) {
        if (timers[key] !== null) window.clearTimeout(timers[key] as number);
        timers[key] = null;
      }
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  // Voltando de segundo plano o rAF ficou parado: zera o relógio de frame para
  // não descontar de uma vez o tempo em que o app esteve fora da tela.
  useEffect(() => {
    const onVisibility = () => {
      lastFrameRef.current = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ---------------------------------------------------------------- eventos
  const handleEvents = useCallback(
    (events: BotaoEvent[]) => {
      for (const event of events) {
        if (event.type === "hit") {
          const now = performance.now();
          if (event.strength > 0.14 && now - lastHitRef.current > 70) {
            lastHitRef.current = now;
            playBotaoSound("hit", event.strength);
            if (event.strength > 0.25) vibrate(Math.round(6 + event.strength * 22));
          }
        }
        if (event.type === "post") {
          playBotaoSound("post");
          showFlash("NA TRAVE!", "info", 1100);
        }
        if (event.type === "idle-reset") showFlash("Bola ao centro", "info", 1100);
        if (event.type === "period-end") {
          playBotaoSound("whistle");
          showFlash("FIM DO TEMPO", "info", 1400);
        }
        if (event.type === "penalty") playBotaoSound(event.scored ? "goal" : "save");
        if (event.type === "goal") {
          const mine = event.side === "user";
          vibrate([0, 60, 40, 120]);
          playBotaoSound(mine ? "goal" : "concede");
          goalFlashRef.current = 1;
          goalFlashSideRef.current = event.side;
          setShaking(true);
          window.setTimeout(() => setShaking(false), 560);
          const text = event.ownGoal ? "GOL CONTRA" : mine ? (event.byUser ? "SEU GOL!" : "GOL!") : "TOMOU GOL";
          showFlash(text, mine ? "goal" : "bad", GOAL_PAUSE_MS - 200);
          setAnnouncement(`${text} ${event.scorer}. Placar ${machine.score.user} a ${machine.score.cpu}.`);
        }
      }
      bump();
    },
    [bump, machine, showFlash],
  );

  // ------------------------------------------------------------- loop de jogo
  useEffect(() => {
    let frame = requestAnimationFrame(function loop(time: number) {
      frame = requestAnimationFrame(loop);
      const state = matchRef.current;
      const canvas = canvasRef.current;
      if (!state || !canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const previous = lastFrameRef.current || time;
      const elapsed = Math.min((time - previous) / 1000, 0.25);
      lastFrameRef.current = time;
      frameCountRef.current += 1;

      // Rastro da bola e brilho da comemoração são puramente visuais e vivem
      // aqui, não no motor — simulação headless não precisa saber deles.
      const trail = trailRef.current;
      if (state.phase === "resolving" || (state.phase === "penalties" && state.penalties?.shotInFlight)) {
        const ball = ballOf(state);
        trail.push({ x: ball.x, y: ball.y });
        while (trail.length > 14) trail.shift();
      } else if (trail.length > 0 && frameCountRef.current % 2 === 0) {
        trail.shift();
      }
      if (goalFlashRef.current > 0) {
        goalFlashRef.current = Math.max(0, goalFlashRef.current - elapsed * 1.6);
      }

      // O relógio corre fora da física: mirar e esperar o adversário também
      // gasta tempo. `stepMatch` cuida do trecho com a bola rolando.
      if (state.phase === "aim" || state.phase === "kickoff" || state.phase === "goal") {
        const clockEvents = advanceClock(state, elapsed);
        if (clockEvents.length > 0) handleEvents(clockEvents);
        else if (frameCountRef.current % 6 === 0) bump();
      }

      if (state.phase === "resolving") {
        let steps = 0;
        let budget = elapsed;
        const events: BotaoEvent[] = [];
        while (budget > 0 && steps < MAX_SUBSTEPS && state.phase === "resolving") {
          events.push(...stepMatch(state, PHYSICS_DT));
          budget -= PHYSICS_DT;
          steps += 1;
        }
        // O HUD precisa acompanhar o cronômetro mesmo em frame sem colisão.
        if (events.length > 0 || frameCountRef.current % 6 === 0) handleEvents(events);
      } else if (state.phase === "penalties" && state.penalties) {
        if (state.penalties.shotInFlight) {
          let steps = 0;
          let budget = elapsed;
          let outcome: { scored: boolean } | null = null;
          while (budget > 0 && steps < MAX_SUBSTEPS && !outcome) {
            outcome = stepPenalty(state, PHYSICS_DT);
            budget -= PHYSICS_DT;
            steps += 1;
          }
          if (outcome && timersRef.current.penalty === null) {
            const scored = outcome.scored;
            const shooting = state.penalties.turn;
            vibrate(scored ? [0, 50, 40, 90] : 30);
            showFlash(scored ? "NA REDE!" : "PEGOU!", scored === (shooting === "user") ? "goal" : "bad", PENALTY_PAUSE_MS);
            timersRef.current.penalty = window.setTimeout(() => {
              timersRef.current.penalty = null;
              const current = matchRef.current;
              if (!current) return;
              handleEvents(commitPenalty(current, scored));
            }, PENALTY_PAUSE_MS);
          }
        } else {
          stepPenaltyKeeper(state, elapsed);
        }
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const targetWidth = Math.round(rect.width * dpr);
      const targetHeight = Math.round(rect.height * dpr);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      const scale = (rect.width / VIEW_WIDTH) * dpr;
      context.setTransform(scale, 0, 0, scale, VIEW_PAD_X * scale, VIEW_PAD_Y * scale);
      drawMatch(
        context,
        state,
        {
          selectedId: selectedRef.current,
          aim: aimRef.current,
          highlight: state.phase === "aim" || state.phase === "kickoff",
          penaltyMode: state.phase === "penalties",
          trail: trailRef.current,
          goalFlash: goalFlashRef.current,
          goalFlashSide: goalFlashSideRef.current,
        },
        time,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [handleEvents, bump, showFlash]);

  // -------------------------------------------------------- gol e intervalo
  useEffect(() => {
    const state = matchRef.current;
    if (!state || state.phase !== "goal" || timersRef.current.goal !== null) return;
    timersRef.current.goal = window.setTimeout(() => {
      timersRef.current.goal = null;
      const current = matchRef.current;
      if (!current) return;
      handleEvents(resumeAfterGoal(current));
      if (current.phase !== "finished") {
        const formation = formationById(current.formationId.user);
        showFlash(`Formação ${formation.name} · ${formation.shape}`, "info", 1400);
      }
    }, GOAL_PAUSE_MS);
  }, [signature, handleEvents, showFlash]);

  // -------------------------------------------------------------- vez da CPU
  useEffect(() => {
    const state = matchRef.current;
    if (!state || timersRef.current.cpu !== null) return;
    const openPlay = (state.phase === "aim" || state.phase === "kickoff") && state.turn === "cpu";
    const penalty = state.phase === "penalties" && state.penalties?.turn === "cpu" && !state.penalties.shotInFlight;
    if (!openPlay && !penalty) return;
    // Não existe trava por número do toque aqui: `startNextPeriod` e
    // `resumeAfterGoal` devolvem a vez à CPU SEM avançar o contador, e uma
    // trava baseada nele fazia a CPU achar que já tinha batido — o jogo
    // congelava na saída de bola do 2º tempo. Quem impede batida dupla é o
    // timer em ref, junto com a assinatura nas dependências do efeito.

    setCpuThinking(true);
    timersRef.current.cpu = window.setTimeout(() => {
      timersRef.current.cpu = null;
      const current = matchRef.current;
      if (!current) return;
      trailRef.current.length = 0;
      if (current.phase === "penalties" && current.penalties && !current.penalties.shotInFlight) {
        const shooter = penaltyShooter(current);
        const keeper = penaltyKeeper(current);
        if (beginPenaltyShot(current, chooseCpuPenaltyShot(current, shooter, keeper, cpuSkillFor(current.setup.cpuTeam.strength), current.rng))) {
          playBotaoSound("flick", 0.8);
        }
      } else {
        const shot = chooseCpuShot(current, cpuSkillFor(current.setup.cpuTeam.strength), current.rng, "cpu");
        if (shot && beginShot(current, shot)) {
          playBotaoSound("flick", 0.6);
        } else {
          // Rede de segurança: sem toque legal a vez passa. Melhor perder um
          // lance do que deixar a partida parada para sempre.
          skipTurn(current);
        }
      }
      setCpuThinking(false);
      bump();
    }, CPU_THINK_MS);
  }, [signature, bump]);

  // ------------------------------------------------------------------- fim
  useEffect(() => {
    const state = matchRef.current;
    if (!state || state.phase !== "finished" || !state.result || finishedRef.current) return;
    finishedRef.current = true;
    const result = state.result;
    const won = result.outcome === "win";
    showFlash(won ? "CAMPEÃO!" : "FIM DE JOGO", won ? "goal" : "bad", 2400);
    vibrate(won ? [0, 90, 60, 90, 60, 160] : [0, 200]);
    timersRef.current.finish = window.setTimeout(() => {
      timersRef.current.finish = null;
      onFinishRef.current(result);
    }, 1800);
  }, [signature, showFlash]);

  // -------------------------------------------------------------- interação
  const shootableAt = useCallback((x: number, y: number) => {
    const state = matchRef.current;
    if (!state) return null;
    if (state.phase === "penalties") {
      if (!state.penalties || state.penalties.shotInFlight || state.penalties.turn !== "user") return null;
      const shooter = penaltyShooter(state);
      return Math.hypot(shooter.x - x, shooter.y - y) <= shooter.radius + 16 ? shooter : null;
    }
    if (state.turn !== "user") return null;
    let best: { id: string; distance: number } | null = null;
    for (const body of state.bodies) {
      if (body.kind !== "disc" || body.side !== "user") continue;
      const distance = Math.hypot(body.x - x, body.y - y);
      if (distance <= body.radius + 12 && (!best || distance < best.distance)) best = { id: body.id, distance };
    }
    if (!best || !canShoot(state, best.id)) return null;
    return state.bodies.find((body) => body.id === best?.id) ?? null;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      unlockAudio();
      const point = toFieldPoint(event.clientX, event.clientY, canvas.getBoundingClientRect());
      const disc = shootableAt(point.x, point.y);
      if (!disc) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerRef.current = event.pointerId;
      selectedRef.current = disc.id;
      aimRef.current = { bodyId: disc.id, dragX: point.x, dragY: point.y, ratio: 0, valid: false };
      vibrate(8);
      bump();
    },
    [bump, shootableAt],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    const canvas = canvasRef.current;
    const state = matchRef.current;
    const aim = aimRef.current;
    if (!canvas || !state || !aim) return;
    const point = toFieldPoint(event.clientX, event.clientY, canvas.getBoundingClientRect());
    const disc = state.bodies.find((body) => body.id === aim.bodyId);
    if (!disc) return;
    const computed = aimFromDrag(disc, point.x, point.y);
    aimRef.current = { bodyId: aim.bodyId, dragX: point.x, dragY: point.y, ratio: computed.ratio, valid: computed.valid };
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pointerRef.current !== event.pointerId) return;
      pointerRef.current = null;
      const state = matchRef.current;
      const aim = aimRef.current;
      aimRef.current = null;
      selectedRef.current = null;
      if (!state || !aim) return;
      const disc = state.bodies.find((body) => body.id === aim.bodyId);
      if (!disc) return;
      const computed = aimFromDrag(disc, aim.dragX, aim.dragY);
      if (!computed.valid) {
        showFlash("Puxada curta demais", "info", 900);
        bump();
        return;
      }
      const shot = { bodyId: disc.id, vx: computed.vx, vy: computed.vy };
      const fired = state.phase === "penalties" ? beginPenaltyShot(state, shot) : beginShot(state, shot);
      if (fired) {
        trailRef.current.length = 0;
        playBotaoSound("flick", computed.ratio);
        vibrate(Math.round(10 + computed.ratio * 30));
      }
      bump();
    },
    [bump, showFlash],
  );

  // ------------------------------------------------------------------- HUD
  const state = machine;
  const player = userPlayerDisc(state);
  const userFormation = formationById(state.formationId.user);
  const roleLabel = player ? slotRoleLabel(userFormation.slots[player.slot] ?? userFormation.slots[0]) : "";
  const yourTurn = (state.phase === "aim" || state.phase === "kickoff") && state.turn === "user";
  const penalties = state.penalties;

  return (
    <div className="botao-root">
      <header className="botao-hud">
        <div className="botao-hud-top">
          <span className="botao-competition">
            {setup.competitionName} · {setup.stageName}
          </span>
          <span className={`botao-period ${!penalties && state.clock <= 15 && state.phase !== "finished" ? "botao-period-urgent" : ""}`}>
            {penalties ? "Pênaltis" : `${periodName(state)} · ${formatClock(state.clock)}`}
          </span>
        </div>
        <div className="botao-scoreboard">
          <div className="botao-team">
            <TeamCrest team={setup.userTeam} />
            <strong>{setup.userTeam.shortName}</strong>
          </div>
          <div className="botao-score">
            <b>{state.score.user}</b>
            <span>×</span>
            <b>{state.score.cpu}</b>
          </div>
          <div className="botao-team botao-team-cpu">
            <strong>{setup.cpuTeam.shortName}</strong>
            <TeamCrest team={setup.cpuTeam} />
          </div>
        </div>
        {penalties ? (
          <div className="botao-penalty-track">
            {SIDES.map((side) => (
              <div key={side} className="botao-penalty-row">
                <span>{side === "user" ? setup.userTeam.abbr : setup.cpuTeam.abbr}</span>
                <div className="botao-penalty-dots">
                  {Array.from({ length: Math.max(setup.rules.penaltyRounds, penalties.results[side].length) }).map((_, index) => {
                    const kick = penalties.results[side][index];
                    return <i key={index} className={kick === true ? "hit" : kick === false ? "miss" : "pending"} />;
                  })}
                </div>
                <b>{penalties.score[side]}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="botao-formation-row">
            <span className="botao-chip">
              {userFormation.name} · {userFormation.shape}
            </span>
            {player ? (
              <span className="botao-chip botao-chip-you">
                VC #{player.number} · {roleLabel}
              </span>
            ) : null}
            {state.playerGoals > 0 || state.playerAssists > 0 ? (
              <span className="botao-chip botao-chip-stat">
                {state.playerGoals}G {state.playerAssists}A
              </span>
            ) : null}
          </div>
        )}
      </header>

      <div
        className={`botao-table-wrapper ${shaking ? "botao-shake" : ""}`}
        style={{ aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}` }}
      >
        <canvas
          ref={canvasRef}
          className="botao-canvas"
          aria-label={`Mesa de futebol de botão. ${setup.userTeam.shortName} ${state.score.user}, ${setup.cpuTeam.shortName} ${state.score.cpu}. ${yourTurn ? "Sua vez de tacar." : "Vez do adversário."}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {flash ? <div className={`botao-flash botao-flash-${flash.tone}`}>{flash.text}</div> : null}
        {state.phase === "interval" ? (
          <div className="botao-overlay">
            <strong>{state.period >= setup.rules.halves ? "Empate no tempo normal" : `Fim do ${state.period}º tempo`}</strong>
            <p>
              {state.score.user} × {state.score.cpu} ·{" "}
              {state.period >= setup.rules.halves
                ? `prorrogação de ${setup.rules.extraSeconds}s, e os dois times mudam de formação.`
                : "os dois times mudam de formação."}
            </p>
            <button
              type="button"
              className="botao-primary"
              onClick={() => {
                const current = matchRef.current;
                if (!current) return;
                handleEvents(startNextPeriod(current));
              }}
            >
              Continuar
            </button>
          </div>
        ) : null}
        {state.phase === "penalty-setup" && penalties ? (
          <div className="botao-overlay">
            <strong>Disputa de pênaltis</strong>
            <p>
              Cada botão bate uma cobrança, alternado. Em qual delas{" "}
              <b>{player ? `${player.label} (#${player.number})` : "você"}</b> vai bater?
            </p>
            <div className="botao-round-picker">
              {Array.from({ length: Math.min(setup.rules.penaltyRounds, 5) }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  className="botao-option"
                  aria-pressed={penalties.playerRound === index + 1}
                  onClick={() => {
                    const current = matchRef.current;
                    if (!current?.penalties) return;
                    current.penalties.playerRound = index + 1;
                    bump();
                  }}
                >
                  {index + 1}ª
                  {index + 1 === setup.rules.penaltyRounds ? <small>decisiva</small> : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="botao-primary"
              onClick={() => {
                const current = matchRef.current;
                if (!current?.penalties) return;
                unlockAudio();
                confirmPenaltyOrder(current, current.penalties.playerRound);
                bump();
              }}
            >
              Começar a disputa
            </button>
          </div>
        ) : null}
      </div>

      <footer className="botao-controls">
        {state.phase === "penalty-setup" ? (
          <p className="botao-turn">Escolha a sua cobrança</p>
        ) : penalties ? (
          <p className={`botao-turn ${penalties.turn === "user" ? "botao-turn-active" : ""}`}>
            {penalties.turn === "user"
              ? `${penalties.round}ª cobrança · bate ${penaltyShooter(state).label} — arraste e solte no tempo do goleiro`
              : `${penalties.round}ª cobrança · ${setup.cpuTeam.shortName} ${penaltyShooter(state).label} vai bater`}
          </p>
        ) : yourTurn ? (
          <p className="botao-turn botao-turn-active">Sua vez — arraste um botão para trás e solte</p>
        ) : state.phase === "resolving" ? (
          <p className="botao-turn">Bola rolando…</p>
        ) : state.phase === "goal" ? (
          <p className="botao-turn">Gol! Recolocando os botões…</p>
        ) : state.phase === "interval" ? (
          <p className="botao-turn">Intervalo</p>
        ) : (
          <p className="botao-turn">{cpuThinking ? `${setup.cpuTeam.shortName} está pensando…` : "Vez do adversário"}</p>
        )}
        <div className="botao-controls-meta">
          <span>Toque {state.turns}</span>
          {player ? (
            <span>
              Você: {Math.round(player.power)} força · {Math.round(player.control)} controle
            </span>
          ) : null}
          <button
            type="button"
            className="botao-ghost"
            aria-pressed={muted}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setBotaoMuted(next);
              if (!next) unlockAudio();
            }}
          >
            {muted ? "Som off" : "Som on"}
          </button>
          {onGiveUp ? (
            <button type="button" className="botao-ghost" onClick={onGiveUp}>
              Sair
            </button>
          ) : null}
        </div>
      </footer>
      <div className="botao-sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}

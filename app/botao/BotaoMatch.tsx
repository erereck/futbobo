"use client";

// Partida jogável. Recebe um setup e devolve um resultado — não sabe nada de
// carreira, temporada nem GameState, então serve igual para o modo avulso e
// para a final do Futbobo.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import "./botao.css";
import { isBotaoMuted, playBotaoSound, setBotaoMuted, unlockAudio } from "./audio";
import { chooseCpuPenaltyShot, chooseCpuShot, chooseCpuSubstitution, cpuSkillFor } from "./cpu";
import {
  advanceClock,
  aimFromDrag,
  awardInactivityPenalty,
  ballOf,
  beginPenaltyShot,
  cancelFinalShotGrace,
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
  managerRosterFor,
  substitutePlayer,
  substitutionCount,
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
import type { BotaoGoalReplay, BotaoMatchResult, BotaoMatchSetup, BotaoReplayFrame, BotaoSide } from "./types";

const PHYSICS_DT = 1 / 120;
const MAX_SUBSTEPS = 12;
const GOAL_PAUSE_MS = 1700;
const CPU_THINK_MS = 430;
const PENALTY_PAUSE_MS = 1100;
const USER_DECISION_SECONDS = 7;
const USER_WARNING_SECONDS = 3;
const REPLAY_SAMPLE_MS = 80;
const REPLAY_MAX_FRAMES_PER_TURN = 42;
const REPLAY_MAX_TURNS = 3;
const REPLAY_TURN_GAP_MS = 140;
const REPLAY_COORDINATE_SCALE = 4;
const SIDES: BotaoSide[] = ["user", "cpu"];
const DEFAULT_LOCAL_PLAYER_NAMES: Record<BotaoSide, string> = { user: "Jogador 1", cpu: "Jogador 2" };

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

function replayFrame(state: BotaoMatchState, at: number): BotaoReplayFrame {
  return {
    at: Math.max(0, Math.round(at)),
    positions: state.bodies
      .filter((body) => body.kind !== "post")
      .flatMap((body) => [
        Math.round(body.x * REPLAY_COORDINATE_SCALE),
        Math.round(body.y * REPLAY_COORDINATE_SCALE),
      ]),
  };
}

export default function BotaoMatch({
  setup,
  onFinish,
  startInPenalties = false,
  controlMode = "cpu",
  localPlayerNames,
  presentation = "standard",
}: {
  setup: BotaoMatchSetup;
  onFinish: (result: BotaoMatchResult) => void;
  /** Pula direto para a decisão por pênaltis (modo de teste). */
  startInPenalties?: boolean;
  /** No modo local, os dois lados usam o mesmo mouse em turnos alternados. */
  controlMode?: "cpu" | "local";
  localPlayerNames?: Record<BotaoSide, string>;
  /** Direção visual isolada para laboratórios; não altera física nem regras. */
  presentation?: "standard" | "showcase";
}) {
  const localMatch = controlMode === "local";
  const showcase = presentation === "showcase";
  const playerNames = localPlayerNames ?? DEFAULT_LOCAL_PLAYER_NAMES;
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
  const idleRemainingRef = useRef<number | null>(null);
  const idleCountdownRef = useRef<number | null>(null);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const goalFlashRef = useRef(0);
  const goalFlashSideRef = useRef<BotaoSide | null>(null);
  const replayBufferRef = useRef<BotaoReplayFrame[]>([]);
  const replayPreviousTurnsRef = useRef<BotaoReplayFrame[][]>([]);
  const goalReplaysRef = useRef<BotaoGoalReplay[]>([]);
  const formerClubCelebrationsRef = useRef<Array<"celebrate" | "respect">>([]);
  const formerClubPromptRef = useRef(false);
  const replayShotStartedAtRef = useRef(0);
  const replayLastSampleRef = useRef(0);
  const replayWasResolvingRef = useRef(false);
  const replayGoalCapturedRef = useRef(false);
  const finalShotAnnouncedRef = useRef(false);
  const pausedAtRef = useRef<number | null>(null);
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
  const [idleCountdown, setIdleCountdown] = useState<number | null>(null);
  const [desktopLandscape, setDesktopLandscape] = useState(false);
  const [compactMobileTable, setCompactMobileTable] = useState(false);
  const [paused, setPaused] = useState(false);
  const [formerClubGoalPrompt, setFormerClubGoalPrompt] = useState<{ goalNumber: number } | null>(null);
  const [substitutionOpen, setSubstitutionOpen] = useState(false);
  const [substitutionOut, setSubstitutionOut] = useState("");
  const [substitutionIn, setSubstitutionIn] = useState("");
  const pausedRef = useRef(false);

  const bump = useCallback(() => setTick((value) => value + 1), []);

  const togglePause = useCallback(() => {
    setPaused((current) => {
      const next = !current;
      pausedRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    const now = performance.now();
    if (paused) {
      pausedAtRef.current = now;
    } else if (pausedAtRef.current !== null) {
      // O tempo de leitura da pausa não vira um buraco no replay do lance.
      replayShotStartedAtRef.current += now - pausedAtRef.current;
      replayLastSampleRef.current = now;
      pausedAtRef.current = null;
    }
    lastFrameRef.current = 0;
    pointerRef.current = null;
    aimRef.current = null;
    selectedRef.current = null;
    if (paused) setCpuThinking(false);
    bump();
  }, [paused, bump]);

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

  const chooseFormerClubCelebration = useCallback((choice: "celebrate" | "respect") => {
    formerClubCelebrationsRef.current.push(choice);
    formerClubPromptRef.current = false;
    setFormerClubGoalPrompt(null);
    const clubName = setup.formerClub?.shortName ?? "ex-clube";
    if (choice === "celebrate") {
      setAnnouncement(`Você comemorou o gol contra o ${clubName}. A reação das arquibancadas mudou na hora.`);
      showFlash("COMEMOROU!", "goal", 1050);
    } else {
      setAnnouncement(`Você segurou a comemoração contra o ${clubName} em respeito à sua história no clube.`);
      showFlash("SEM COMEMORAR", "info", 1050);
    }
    bump();
  }, [bump, setup.formerClub?.shortName, showFlash]);

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

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 900px)");
    const syncOrientation = () => {
      setDesktopLandscape(desktop.matches && window.localStorage.getItem("futbobo_botao_landscape") === "1");
    };
    syncOrientation();
    desktop.addEventListener("change", syncOrientation);
    return () => desktop.removeEventListener("change", syncOrientation);
  }, []);

  // Voltando de segundo plano o rAF ficou parado: zera o relógio de frame para
  // não descontar de uma vez o tempo em que o app esteve fora da tela. A regra
  // dos 7s usa o mesmo delta ativo do jogo, então também fica congelada.
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
        if (event.type === "inactivity-penalty") {
          showFlash("PÊNALTI POR DEMORA!", "bad", 1700);
          setAnnouncement(
            localMatch
              ? "O tempo da jogada terminou."
              : `Você demorou para jogar. Pênalti para ${machine.setup.cpuTeam.shortName}.`,
          );
        }
        if (event.type === "period-end") {
          playBotaoSound("whistle");
          showFlash("FIM DO TEMPO", "info", 1400);
        }
        if (event.type === "penalty") playBotaoSound(event.scored ? "goal" : "save");
        if (event.type === "goal") {
          const replayNow = performance.now();
          const finalFrame = replayFrame(machine, replayNow - replayShotStartedAtRef.current);
          const currentTurn = [...replayBufferRef.current, finalFrame]
            .filter((frame, index, list) => index === 0 || frame.at > list[index - 1].at)
            .slice(-REPLAY_MAX_FRAMES_PER_TURN);
          const turns = [...replayPreviousTurnsRef.current.slice(-(REPLAY_MAX_TURNS - 1)), currentTurn]
            .filter((turn) => turn.length >= 2);
          const turnStarts: number[] = [];
          const frames: BotaoReplayFrame[] = [];
          let replayCursor = 0;
          turns.forEach((turn) => {
            const firstAt = turn[0].at;
            turnStarts.push(replayCursor);
            turn.forEach((frame) => {
              frames.push({ ...frame, at: replayCursor + frame.at - firstAt });
            });
            replayCursor = frames.at(-1)!.at + REPLAY_TURN_GAP_MS;
          });
          replayGoalCapturedRef.current = true;
          if (frames.length >= 2) {
            goalReplaysRef.current.push({
              timelineIndex: Math.max(0, machine.timeline.length - 1),
              duration: Math.max(1, frames.at(-1)!.at),
              coordinateScale: REPLAY_COORDINATE_SCALE,
              turnStarts,
              bodies: machine.bodies
                .filter((body) => body.kind !== "post")
                .map((body) => ({
                  id: body.id,
                  kind: body.kind === "ball" ? "ball" : "disc",
                  side: body.side,
                  number: body.number,
                  radius: Math.round(body.radius * 10) / 10,
                  isUserPlayer: body.isUserPlayer,
                })),
              frames,
            });
          }
          const mine = event.side === "user";
          vibrate([0, 60, 40, 120]);
          playBotaoSound(mine ? "goal" : "concede");
          goalFlashRef.current = 1;
          goalFlashSideRef.current = event.side;
          setShaking(true);
          window.setTimeout(() => setShaking(false), 560);
          const text = event.ownGoal
            ? "GOL CONTRA"
            : localMatch
              ? `GOL · ${playerNames[event.side].toLocaleUpperCase("pt-BR")}`
              : mine
                ? (event.byUser ? "SEU GOL!" : "GOL!")
                : "TOMOU GOL";
          showFlash(text, localMatch || mine ? "goal" : "bad", GOAL_PAUSE_MS - 200);
          setAnnouncement(`${text} ${event.scorer}. Placar ${machine.score.user} a ${machine.score.cpu}.`);
          if (!localMatch && mine && event.byUser && setup.formerClub) {
            formerClubPromptRef.current = true;
            setFormerClubGoalPrompt({ goalNumber: formerClubCelebrationsRef.current.length + 1 });
          }
        }
      }
      bump();
    },
    [bump, localMatch, machine, playerNames, setup.formerClub, showFlash],
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

      const pausedNow = pausedRef.current;

      // Relógio da partida e regra disciplinar usam o mesmo tempo ativo. Se a
      // partida estiver pausada, nenhum dos dois avança.
      // Primeiro resolvemos a regra do último chute: se o tempo acabou enquanto
      // existe um botão fisicamente selecionado, 00:00 fica armado até a bola parar.
      if (!pausedNow && (state.phase === "aim" || state.phase === "kickoff")) {
        const clockEvents = advanceClock(state, elapsed, pointerRef.current !== null);
        if (clockEvents.length > 0) handleEvents(clockEvents);
        else if (frameCountRef.current % 6 === 0) bump();
      }

      if (state.finalShotGrace && !finalShotAnnouncedRef.current) {
        finalShotAnnouncedRef.current = true;
        showFlash("ÚLTIMO LANCE!", "info", 1500);
        setAnnouncement("O tempo acabou com o chute armado. Solte: a partida só termina quando a bola parar.");
        vibrate([0, 45, 35, 90]);
      } else if (!state.finalShotGrace && state.clock > 0) {
        finalShotAnnouncedRef.current = false;
      }

      // Os sete segundos só existem enquanto o relógio da partida está
      // efetivamente rodando. Pausa e segundo plano congelam o valor exato;
      // selecionar/segurar um botão não reinicia a contagem.
      const waitingForUser = !localMatch && (state.phase === "aim" || state.phase === "kickoff") && state.turn === "user";
      if (!waitingForUser || state.finalShotGrace) {
        idleRemainingRef.current = null;
        if (idleCountdownRef.current !== null) {
          idleCountdownRef.current = null;
          setIdleCountdown(null);
        }
      } else if (!pausedNow) {
        if (idleRemainingRef.current === null) idleRemainingRef.current = USER_DECISION_SECONDS;
        idleRemainingRef.current = Math.max(0, idleRemainingRef.current - elapsed);
        const remaining = idleRemainingRef.current;
        const nextCountdown = remaining <= USER_WARNING_SECONDS ? Math.max(1, Math.ceil(remaining)) : null;
        if (nextCountdown !== idleCountdownRef.current) {
          idleCountdownRef.current = nextCountdown;
          setIdleCountdown(nextCountdown);
        }
        if (remaining <= 0) {
          idleRemainingRef.current = null;
          idleCountdownRef.current = null;
          setIdleCountdown(null);
          pointerRef.current = null;
          aimRef.current = null;
          selectedRef.current = null;
          handleEvents(awardInactivityPenalty(state));
        }
      }

      if (!pausedNow) {
      const resolvingForReplay = state.phase === "resolving";
      if (resolvingForReplay) {
        if (!replayWasResolvingRef.current) {
          replayBufferRef.current = [];
          replayShotStartedAtRef.current = time;
          replayLastSampleRef.current = 0;
        }
        if (replayLastSampleRef.current === 0 || time - replayLastSampleRef.current >= REPLAY_SAMPLE_MS) {
          replayBufferRef.current.push(replayFrame(state, time - replayShotStartedAtRef.current));
          while (replayBufferRef.current.length > REPLAY_MAX_FRAMES_PER_TURN) replayBufferRef.current.shift();
          replayLastSampleRef.current = time;
        }
      } else if (replayWasResolvingRef.current) {
        if (replayGoalCapturedRef.current) {
          replayPreviousTurnsRef.current = [];
          replayGoalCapturedRef.current = false;
        } else if (replayBufferRef.current.length >= 2) {
          replayPreviousTurnsRef.current.push(replayBufferRef.current.map((frame) => ({ ...frame })));
          while (replayPreviousTurnsRef.current.length > REPLAY_MAX_TURNS - 1) {
            replayPreviousTurnsRef.current.shift();
          }
        }
        replayBufferRef.current = [];
      }
      replayWasResolvingRef.current = resolvingForReplay;

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
            showFlash(
              scored ? "NA REDE!" : "PEGOU!",
              localMatch ? (scored ? "goal" : "bad") : scored === (shooting === "user") ? "goal" : "bad",
              PENALTY_PAUSE_MS,
            );
            const commitWhenRunning = () => {
              if (pausedRef.current) {
                timersRef.current.penalty = window.setTimeout(commitWhenRunning, 120);
                return;
              }
              timersRef.current.penalty = null;
              const current = matchRef.current;
              if (!current) return;
              handleEvents(commitPenalty(current, scored));
            };
            timersRef.current.penalty = window.setTimeout(commitWhenRunning, PENALTY_PAUSE_MS);
          }
        } else {
          stepPenaltyKeeper(state, elapsed);
        }
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
      // Mede em pixels reais e pinta todo o bitmap antes do transform. Isso
      // elimina a fresta de subpixel que aparecia na borda da mesa girada.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#0b2517";
      context.fillRect(0, 0, targetWidth, targetHeight);
      const logicalWidth = desktopLandscape ? VIEW_HEIGHT : VIEW_WIDTH;
      const logicalHeight = desktopLandscape ? VIEW_WIDTH : VIEW_HEIGHT;
      const scale = Math.min(targetWidth / logicalWidth, targetHeight / logicalHeight);
      const offsetX = (targetWidth - logicalWidth * scale) / 2;
      const offsetY = (targetHeight - logicalHeight * scale) / 2;
      if (desktopLandscape) {
        context.setTransform(0, scale, -scale, 0, offsetX + (VIEW_HEIGHT - VIEW_PAD_Y) * scale, offsetY + VIEW_PAD_X * scale);
      } else {
        context.setTransform(scale, 0, 0, scale, offsetX + VIEW_PAD_X * scale, offsetY + VIEW_PAD_Y * scale);
      }
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
          uprightLabels: desktopLandscape,
          hideUserMarker: localMatch,
          showcase,
        },
        time,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [handleEvents, bump, showFlash, desktopLandscape, localMatch, showcase]);

  // -------------------------------------------------------- gol e intervalo
  useEffect(() => {
    const state = matchRef.current;
    if (!state || state.phase !== "goal" || timersRef.current.goal !== null) return;
    const resumeGoal = () => {
      if (pausedRef.current || formerClubPromptRef.current) {
        timersRef.current.goal = window.setTimeout(resumeGoal, 120);
        return;
      }
      timersRef.current.goal = null;
      const current = matchRef.current;
      if (!current) return;
      handleEvents(resumeAfterGoal(current));
      if (current.phase !== "finished") {
        const formation = formationById(current.formationId.user);
        showFlash(`Formação ${formation.name} · ${formation.shape}`, "info", 1400);
      }
    };
    timersRef.current.goal = window.setTimeout(resumeGoal, GOAL_PAUSE_MS);
  }, [signature, handleEvents, showFlash, paused]);

  // -------------------------------------------------------------- vez da CPU
  useEffect(() => {
    const state = matchRef.current;
    if (localMatch) return;
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
    const playCpuTurn = () => {
      if (pausedRef.current) {
        timersRef.current.cpu = window.setTimeout(playCpuTurn, 120);
        return;
      }
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
        if (current.setup.managerMode) chooseCpuSubstitution(current, "cpu", current.rng);
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
    };
    timersRef.current.cpu = window.setTimeout(playCpuTurn, CPU_THINK_MS);
  }, [signature, bump, paused, localMatch]);

  // ------------------------------------------------------------------- fim
  useEffect(() => {
    const state = matchRef.current;
    if (!state || state.phase !== "finished" || !state.result || finishedRef.current || formerClubPromptRef.current) return;
    finishedRef.current = true;
    const result = {
      ...state.result,
      formerClubCelebrations: formerClubCelebrationsRef.current.slice(),
      formerClubGoalCount: formerClubCelebrationsRef.current.length,
      replays: goalReplaysRef.current.map((replay) => ({
      ...replay,
      bodies: replay.bodies.map((body) => ({ ...body })),
      frames: replay.frames.map((frame) => ({ ...frame, positions: frame.positions.slice() })),
    })) };
    state.result = result;
    const won = result.outcome === "win";
    const victoryLabel = state.setup.stageName === "Final" ? "CAMPEÃO!" : "CLASSIFICADO!";
    showFlash(localMatch ? "FIM DE JOGO" : won ? victoryLabel : "FIM DE JOGO", localMatch || won ? "goal" : "bad", 2400);
    vibrate(won ? [0, 90, 60, 90, 60, 160] : [0, 200]);
    timersRef.current.finish = window.setTimeout(() => {
      timersRef.current.finish = null;
      onFinishRef.current(result);
    }, 1800);
  }, [signature, showFlash, localMatch, formerClubGoalPrompt]);

  // -------------------------------------------------------------- interação
  const shootableAt = useCallback((x: number, y: number) => {
    const state = matchRef.current;
    if (!state) return null;
    if (state.phase === "penalties") {
      if (!state.penalties || state.penalties.shotInFlight || (!localMatch && state.penalties.turn !== "user")) return null;
      const shooter = penaltyShooter(state);
      return Math.hypot(shooter.x - x, shooter.y - y) <= shooter.radius + 16 ? shooter : null;
    }
    if (!localMatch && state.turn !== "user") return null;
    const activeSide = localMatch ? state.turn : "user";
    let best: { id: string; distance: number } | null = null;
    for (const body of state.bodies) {
      if (body.kind !== "disc" || body.side !== activeSide) continue;
      const distance = Math.hypot(body.x - x, body.y - y);
      if (distance <= body.radius + 12 && (!best || distance < best.distance)) best = { id: body.id, distance };
    }
    if (!best || !canShoot(state, best.id)) return null;
    return state.bodies.find((body) => body.id === best?.id) ?? null;
  }, [localMatch]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pausedRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      unlockAudio();
      const point = toFieldPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), desktopLandscape);
      const disc = shootableAt(point.x, point.y);
      if (!disc) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerRef.current = event.pointerId;
      selectedRef.current = disc.id;
      aimRef.current = { bodyId: disc.id, dragX: point.x, dragY: point.y, ratio: 0, valid: false };
      vibrate(8);
      bump();
    },
    [bump, shootableAt, desktopLandscape],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pausedRef.current) return;
    if (pointerRef.current !== event.pointerId) return;
    const canvas = canvasRef.current;
    const state = matchRef.current;
    const aim = aimRef.current;
    if (!canvas || !state || !aim) return;
    const point = toFieldPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), desktopLandscape);
    const disc = state.bodies.find((body) => body.id === aim.bodyId);
    if (!disc) return;
    const computed = aimFromDrag(disc, point.x, point.y);
    aimRef.current = { bodyId: aim.bodyId, dragX: point.x, dragY: point.y, ratio: computed.ratio, valid: computed.valid };
  }, [desktopLandscape]);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pausedRef.current) return;
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
        const endEvents = cancelFinalShotGrace(state);
        if (endEvents.length > 0) handleEvents(endEvents);
        bump();
        return;
      }
      const shot = { bodyId: disc.id, vx: computed.vx, vy: computed.vy };
      const fired = state.phase === "penalties" ? beginPenaltyShot(state, shot) : beginShot(state, shot);
      if (!fired && state.finalShotGrace) {
        const endEvents = cancelFinalShotGrace(state);
        if (endEvents.length > 0) handleEvents(endEvents);
      }
      if (fired) {
        trailRef.current.length = 0;
        playBotaoSound("flick", computed.ratio);
        vibrate(Math.round(10 + computed.ratio * 30));
      }
      bump();
    },
    [bump, handleEvents, showFlash],
  );

  // ------------------------------------------------------------------- HUD
  const state = machine;
  const player = userPlayerDisc(state);
  const userFormation = formationById(state.formationId.user);
  const roleLabel = player ? slotRoleLabel(userFormation.slots[player.slot] ?? userFormation.slots[0]) : "";
  const yourTurn = (state.phase === "aim" || state.phase === "kickoff") && state.turn === "user";
  const activeLocalSide = state.penalties?.turn ?? state.turn;
  const activeLocalName = playerNames[activeLocalSide];
  const penalties = state.penalties;
  const managerRoster = managerRosterFor(state, "user");
  const substitutionReady = Boolean(
    state.setup.managerMode &&
    managerRoster &&
    yourTurn &&
    !paused &&
    managerRoster.bench.length > 0 &&
    substitutionCount(state, "user") < 3,
  );

  return (
    <div className={`botao-root ${showcase ? "botao-root-showcase" : ""} ${localMatch ? "botao-root-local" : ""} ${desktopLandscape ? "botao-root-landscape" : ""} ${compactMobileTable ? "botao-root-mobile-compact" : ""} ${paused ? "botao-root-paused" : ""}`}>
      <header className="botao-hud">
        <div className="botao-hud-top">
          {showcase ? (
            <span className="botao-showcase-live">
              <i aria-hidden="true" /> AO VIVO
            </span>
          ) : null}
          <span className="botao-competition">
            {setup.competitionName} · {setup.stageName}
          </span>
          <span className={`botao-period ${!penalties && state.clock <= 15 && state.phase !== "finished" ? "botao-period-urgent" : ""} ${state.finalShotGrace ? "botao-period-final-shot" : ""}`}>
            {penalties
              ? state.penaltyReason === "inactivity"
                ? "Pênalti por demora"
                : "Pênaltis"
              : state.finalShotGrace
                ? "ÚLTIMO LANCE · 00:00"
                : `${paused ? "Pausado" : periodName(state)} · ${formatClock(state.clock)}`}
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
        {penalties && state.penaltyReason === "inactivity" ? (
          <div className="botao-inactivity-penalty-strip">
            PÊNALTI PARA {setup.cpuTeam.shortName}
          </div>
        ) : penalties ? (
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
            <span className={`botao-chip ${localMatch ? "botao-chip-local" : ""}`}>
              {localMatch ? <>X1 LOCAL · <span className="botao-pointer-desktop">UM MOUSE</span><span className="botao-pointer-touch">TOQUE NA TELA</span></> : `${userFormation.name} · ${userFormation.shape}`}
            </span>
            {localMatch ? (
              <span className={`botao-chip botao-local-turn-chip botao-local-turn-${activeLocalSide}`}>
                {activeLocalName} · {activeLocalSide === "user" ? setup.userTeam.abbr : setup.cpuTeam.abbr}
              </span>
            ) : player ? (
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
      {state.setup.managerMode && !penalties ? (
        <div className="botao-manager-stamina" aria-label="Fôlego dos cinco titulares">
          {state.bodies.filter((body) => body.kind === "disc" && body.side === "user" && body.playerId).map((body) => (
            <span key={body.id} title={body.label + " · " + Math.round(body.stamina) + "%"}>
              <b>{body.label.split(/\s+/)[0]}</b>
              <i><em style={{ width: String(Math.round(body.stamina)) + "%" }} /></i>
            </span>
          ))}
        </div>
      ) : null}

      {formerClubGoalPrompt && setup.formerClub && (
        <div className="botao-former-club-decision" role="dialog" aria-modal="true" aria-label="Comemoração contra ex-clube">
          <div className="botao-former-club-card">
            <small>LEI DO EX · {formerClubGoalPrompt.goalNumber}º GOL</small>
            <strong>Gol contra o {setup.formerClub.shortName}</strong>
            <p>Você passou por esse clube. O estádio está olhando para a sua reação.</p>
            <div className="botao-former-club-actions">
              <button type="button" className="botao-former-celebrate" onClick={() => chooseFormerClubCelebration("celebrate")}>
                <b>🔥 Comemorar</b>
                <span>Assume a camisa atual e aceita a reação.</span>
              </button>
              <button type="button" className="botao-former-respect" onClick={() => chooseFormerClubCelebration("respect")}>
                <b>🤝 Não comemorar</b>
                <span>Respeita sua história com o ex-clube.</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`botao-table-wrapper ${desktopLandscape ? "botao-table-landscape" : ""} ${shaking ? "botao-shake" : ""}`}
        style={{ aspectRatio: desktopLandscape ? `${VIEW_HEIGHT} / ${VIEW_WIDTH}` : `${VIEW_WIDTH} / ${VIEW_HEIGHT}` }}
      >
        <canvas
          ref={canvasRef}
          className="botao-canvas"
          aria-label={`Mesa de futebol de botão. ${setup.userTeam.shortName} ${state.score.user}, ${setup.cpuTeam.shortName} ${state.score.cpu}. ${localMatch ? `Vez de ${activeLocalName}.` : yourTurn ? "Sua vez de tacar." : "Vez do adversário."}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {flash ? <div className={`botao-flash botao-flash-${flash.tone}`}>{flash.text}</div> : null}
        {!localMatch && idleCountdown !== null ? (
          <div className="botao-inactivity-countdown" role="alert" aria-live="assertive">
            <div>
              <small>SEM ENROLAR</small>
              <span>chute antes do zero ou é pênalti para o adversário</span>
            </div>
            <strong>{idleCountdown}</strong>
          </div>
        ) : null}
        {paused ? (
          <div className="botao-pause-overlay" role="status" aria-live="polite">
            <span className="botao-pause-mark" aria-hidden="true">II</span>
            <small>INTERVALO TÉCNICO</small>
            <strong>Partida pausada</strong>
            <p>{localMatch ? "Relógio e bola estão congelados." : "Relógio da partida, bola, adversário e regra dos 7s estão congelados."}</p>
            <button type="button" className="botao-primary" onClick={togglePause}>
              Retomar partida <span aria-hidden="true">▶</span>
            </button>
          </div>
        ) : null}
        {!paused && state.phase === "interval" ? (
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
        {!paused && state.phase === "penalty-setup" && penalties ? (
          <div className="botao-overlay">
            <strong>Disputa de pênaltis</strong>
            {localMatch ? (
              <p>Os jogadores alternam as cobranças com o mesmo mouse. <b>{playerNames.user}</b> começa.</p>
            ) : (
              <>
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
              </>
            )}
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
              {localMatch ? "Começar o desempate" : "Começar a disputa"}
            </button>
          </div>
        ) : null}
        {substitutionOpen && substitutionReady && managerRoster ? (
          <div className="botao-substitution-overlay" role="dialog" aria-modal="true" aria-label="Substituição">
            <div className="botao-substitution-card">
              <div className="botao-substitution-heading"><div><small>BOLA PARADA · SUA VEZ</small><strong>Troca irreversível</strong></div><button type="button" onClick={() => setSubstitutionOpen(false)}>×</button></div>
              <p>Escolha um botão para sair e um reserva para entrar. A troca não consome seu toque e não pode ser desfeita nesta partida.</p>
              <label><span>Sai</span><select value={substitutionOut} onChange={(event) => setSubstitutionOut(event.target.value)}><option value="">Escolha o titular</option>{state.bodies.filter((body) => body.kind === "disc" && body.side === "user" && body.playerId).map((body) => <option key={body.id} value={body.id}>{body.label} · {Math.round(body.stamina)}% fôlego</option>)}</select></label>
              <label><span>Entra</span><select value={substitutionIn} onChange={(event) => setSubstitutionIn(event.target.value)}><option value="">Escolha o reserva</option>{managerRoster.bench.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.overall} OVR</option>)}</select></label>
              <div className="botao-substitution-actions"><button type="button" className="botao-ghost" onClick={() => setSubstitutionOpen(false)}>Cancelar</button><button type="button" className="botao-primary" disabled={!substitutionOut || !substitutionIn} onClick={() => { const current = matchRef.current; if (!current) return; if (substitutePlayer(current, "user", substitutionOut, substitutionIn)) { setSubstitutionOpen(false); setSubstitutionOut(""); setSubstitutionIn(""); showFlash("TROCA FEITA", "info", 1000); bump(); } }}>Confirmar troca</button></div>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="botao-controls">
        {paused ? (
          <p className="botao-turn botao-turn-paused">Jogo congelado · retome quando estiver pronto</p>
        ) : state.phase === "penalty-setup" ? (
          <p className="botao-turn">{localMatch ? "Preparem as cobranças" : "Escolha a sua cobrança"}</p>
        ) : penalties ? (
          <p className={`botao-turn ${localMatch || penalties.turn === "user" ? "botao-turn-active" : ""}`}>
            {localMatch
              ? `${activeLocalName} · ${penalties.round}ª cobrança — arraste e solte no tempo do goleiro`
              : penalties.turn === "user"
                ? `${penalties.round}ª cobrança · bate ${penaltyShooter(state).label} — arraste e solte no tempo do goleiro`
                : `${penalties.round}ª cobrança · ${setup.cpuTeam.shortName} ${penaltyShooter(state).label} vai bater`}
          </p>
        ) : localMatch && (state.phase === "aim" || state.phase === "kickoff") ? (
          <p className={`botao-turn botao-turn-active botao-turn-local botao-turn-local-${activeLocalSide}`}>
            <b>{activeLocalName}</b> · passe o mouse e faça seu toque
          </p>
        ) : state.finalShotGrace ? (
          <p className="botao-turn botao-turn-active botao-turn-final-shot">00:00 · ÚLTIMO LANCE — solte e deixe a bola decidir</p>
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
          {substitutionReady ? (
            <button
              type="button"
              className="botao-ghost botao-substitution-toggle"
              onClick={() => {
                setSubstitutionOut("");
                setSubstitutionIn("");
                setSubstitutionOpen(true);
              }}
            >
              Trocas {3 - substitutionCount(state, "user")}
            </button>
          ) : null}
          {state.phase !== "finished" ? (
            <button
              type="button"
              className="botao-ghost botao-pause-toggle"
              aria-pressed={paused}
              onClick={togglePause}
            >
              <span aria-hidden="true">{paused ? "▶" : "II"}</span>
              {paused ? "Retomar" : "Pausar"}
            </button>
          ) : null}
          <span>Toque {state.turns}</span>
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
          <button
            type="button"
            className="botao-ghost botao-desktop-only"
            aria-pressed={desktopLandscape}
            onClick={() => {
              const next = !desktopLandscape;
              setDesktopLandscape(next);
              window.localStorage.setItem("futbobo_botao_landscape", next ? "1" : "0");
              pointerRef.current = null;
              aimRef.current = null;
              selectedRef.current = null;
            }}
          >
            {desktopLandscape ? "Campo em pé" : "Virar campo"} ↻
          </button>
          <button
            type="button"
            className="botao-ghost botao-mobile-size-toggle"
            aria-pressed={compactMobileTable}
            onClick={() => setCompactMobileTable((current) => !current)}
          >
            {compactMobileTable ? "Ampliar mesa" : "Encolher mesa"}
          </button>
        </div>
      </footer>
      <div className="botao-sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}

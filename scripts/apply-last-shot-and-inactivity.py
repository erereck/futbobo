from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------- engine.ts
path = Path("app/botao/engine.ts")
text = path.read_text()
text = replace_once(
    text,
    '  /** Reposição depois de gol não consome o relógio até o primeiro toque. */\n  clockPausedForKickoff: boolean;\n  result: BotaoMatchResult | null;\n',
    '  /** Reposição depois de gol não consome o relógio até o primeiro toque. */\n  clockPausedForKickoff: boolean;\n  /** O tempo zerou enquanto um jogador humano já preparava o último chute. */\n  finalShotGrace: boolean;\n  result: BotaoMatchResult | null;\n',
    "engine state finalShotGrace",
)
text = replace_once(
    text,
    '    penaltyReason: null,\n    clockPausedForKickoff: false,\n    result: null,\n',
    '    penaltyReason: null,\n    clockPausedForKickoff: false,\n    finalShotGrace: false,\n    result: null,\n',
    "engine init finalShotGrace",
)
text = replace_once(
    text,
    'function endPeriod(state: BotaoMatchState, events: BotaoEvent[]) {\n  state.clock = 0;\n',
    'function endPeriod(state: BotaoMatchState, events: BotaoEvent[]) {\n  state.clock = 0;\n  state.finalShotGrace = false;\n',
    "endPeriod clears grace",
)
text = replace_once(
    text,
    '  state.clock = state.periodSeconds;\n  state.formationIndex.user += 1;\n',
    '  state.clock = state.periodSeconds;\n  state.finalShotGrace = false;\n  state.formationIndex.user += 1;\n',
    "next period clears grace",
)
old_clock = '''/**
 * Corre o relógio em tempo real, fora da física.
 *
 * O cronômetro corre enquanto se mira, o adversário pensa e a bola rola. A
 * única pausa é a reposição depois de um gol: o relógio volta a andar no
 * primeiro toque. Se o tempo acaba com a bola rolando, o lance termina antes —
 * a vantagem é resolvida em `settleTurn`.
 */
export function advanceClock(state: BotaoMatchState, seconds: number): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  if (seconds <= 0) return events;
  if (state.phase !== "aim" && state.phase !== "kickoff") return events;
  if (state.phase === "kickoff" && state.clockPausedForKickoff) return events;
  state.clock = Math.max(0, state.clock - seconds);
  if (state.clock <= 0) {
    endPeriod(state, events);
  }
  state.version += 1;
  return events;
}
'''
new_clock = '''/**
 * Corre o relógio em tempo real, fora da física.
 *
 * O cronômetro corre enquanto se mira, o adversário pensa e a bola rola. A
 * única pausa normal é a reposição depois de um gol. Se o relógio chega a zero
 * enquanto um humano JÁ está segurando um botão para chutar, nasce a graça do
 * último lance: 00:00 fica na tela e a partida só pode terminar depois que o
 * chute for solto e toda a física parar.
 */
export function advanceClock(state: BotaoMatchState, seconds: number, holdForFinalShot = false): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  if (seconds <= 0) return events;
  if (state.phase !== "aim" && state.phase !== "kickoff") return events;
  if (state.phase === "kickoff" && state.clockPausedForKickoff) return events;
  state.clock = Math.max(0, state.clock - seconds);
  if (state.clock <= 0) {
    if (holdForFinalShot) {
      state.finalShotGrace = true;
    } else {
      endPeriod(state, events);
    }
  }
  state.version += 1;
  return events;
}

/**
 * Cancela a graça quando o jogador solta sem produzir um chute válido. Se o
 * relógio já zerou, o apito vem imediatamente; um arraste inválido não compra
 * uma segunda tentativa em 00:00.
 */
export function cancelFinalShotGrace(state: BotaoMatchState): BotaoEvent[] {
  const events: BotaoEvent[] = [];
  if (!state.finalShotGrace) return events;
  state.finalShotGrace = false;
  if (state.clock <= 0 && (state.phase === "aim" || state.phase === "kickoff")) {
    endPeriod(state, events);
  }
  state.version += 1;
  return events;
}
'''
text = replace_once(text, old_clock, new_clock, "advanceClock last shot grace")
text = replace_once(
    text,
    '/** Pune dez segundos sem ação do jogador com uma cobrança real para a CPU. */\nexport function awardInactivityPenalty(state: BotaoMatchState): BotaoEvent[] {\n  const events: BotaoEvent[] = [];\n  if ((state.phase !== "aim" && state.phase !== "kickoff") || state.turn !== "user" || state.penalties) return events;\n',
    '/** Pune sete segundos sem ação do jogador com uma cobrança real para a CPU. */\nexport function awardInactivityPenalty(state: BotaoMatchState): BotaoEvent[] {\n  const events: BotaoEvent[] = [];\n  if (state.finalShotGrace) return events;\n  if ((state.phase !== "aim" && state.phase !== "kickoff") || state.turn !== "user" || state.penalties) return events;\n',
    "inactivity ignores final shot",
)
path.write_text(text)

# ----------------------------------------------------------- BotaoMatch.tsx
path = Path("app/botao/BotaoMatch.tsx")
text = path.read_text()
text = replace_once(
    text,
    '  ballOf,\n  beginPenaltyShot,\n',
    '  ballOf,\n  beginPenaltyShot,\n  cancelFinalShotGrace,\n',
    "import cancel final shot",
)
text = replace_once(
    text,
    'const USER_DECISION_SECONDS = 10;\n',
    'const USER_DECISION_SECONDS = 7;\n',
    "seven second rule",
)
text = replace_once(
    text,
    '  const replayGoalCapturedRef = useRef(false);\n  const pausedAtRef = useRef<number | null>(null);\n',
    '  const replayGoalCapturedRef = useRef(false);\n  const finalShotAnnouncedRef = useRef(false);\n  const pausedAtRef = useRef<number | null>(null);\n',
    "final shot announcement ref",
)
# Pause must no longer reset the inactivity clock. It may still cancel a drag.
text = replace_once(
    text,
    '    lastFrameRef.current = 0;\n    idleDeadlineRef.current = null;\n    idleCountdownRef.current = null;\n    setIdleCountdown(null);\n    pointerRef.current = null;\n',
    '    lastFrameRef.current = 0;\n    pointerRef.current = null;\n',
    "pause no idle reset",
)
# Backgrounding also cannot buy more decision time.
text = replace_once(
    text,
    '    const onVisibility = () => {\n      lastFrameRef.current = 0;\n      idleDeadlineRef.current = null;\n      idleCountdownRef.current = null;\n      setIdleCountdown(null);\n    };\n',
    '    const onVisibility = () => {\n      // O rAF pode parar em segundo plano, mas o deadline usa performance.now();\n      // ao voltar, o tempo perdido continua contado em vez de reiniciar.\n      lastFrameRef.current = 0;\n    };\n',
    "visibility no idle reset",
)
old_loop_head = '''      const pausedNow = pausedRef.current;

      if (!pausedNow) {
      const resolvingForReplay = state.phase === "resolving";
'''
new_loop_head = '''      const pausedNow = pausedRef.current;

      // O relógio da partida congela na pausa, mas o relógio disciplinar NÃO.
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

      // Sete segundos são absolutos dentro da vez do usuário. Pausar, segurar
      // um botão ou selecionar de novo não cria um novo prazo. A única exceção
      // é o último lance já armado em 00:00.
      const waitingForUser = !localMatch && (state.phase === "aim" || state.phase === "kickoff") && state.turn === "user";
      if (!waitingForUser || state.finalShotGrace) {
        idleDeadlineRef.current = null;
        if (idleCountdownRef.current !== null) {
          idleCountdownRef.current = null;
          setIdleCountdown(null);
        }
      } else {
        if (idleDeadlineRef.current === null) idleDeadlineRef.current = time + USER_DECISION_SECONDS * 1000;
        const remaining = (idleDeadlineRef.current - time) / 1000;
        const nextCountdown = remaining <= USER_WARNING_SECONDS ? Math.max(1, Math.ceil(remaining)) : null;
        if (nextCountdown !== idleCountdownRef.current) {
          idleCountdownRef.current = nextCountdown;
          setIdleCountdown(nextCountdown);
        }
        if (remaining <= 0) {
          idleDeadlineRef.current = null;
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
'''
text = replace_once(text, old_loop_head, new_loop_head, "absolute inactivity loop")
old_old_idle = '''      const waitingForUser = !localMatch && (state.phase === "aim" || state.phase === "kickoff") && state.turn === "user";
      if (!waitingForUser) {
        idleDeadlineRef.current = null;
        if (idleCountdownRef.current !== null) {
          idleCountdownRef.current = null;
          setIdleCountdown(null);
        }
      } else {
        if (idleDeadlineRef.current === null) idleDeadlineRef.current = time + USER_DECISION_SECONDS * 1000;
        const remaining = (idleDeadlineRef.current - time) / 1000;
        const nextCountdown = remaining <= USER_WARNING_SECONDS ? Math.max(1, Math.ceil(remaining)) : null;
        if (nextCountdown !== idleCountdownRef.current) {
          idleCountdownRef.current = nextCountdown;
          setIdleCountdown(nextCountdown);
        }
        if (remaining <= 0) {
          idleDeadlineRef.current = null;
          idleCountdownRef.current = null;
          setIdleCountdown(null);
          handleEvents(awardInactivityPenalty(state));
        }
      }

      // Mirar e esperar consome o relógio normal. A reposição pós-gol é a
      // exceção: `advanceClock` segura o tempo até o primeiro toque.
      if (state.phase === "aim" || state.phase === "kickoff") {
        const clockEvents = advanceClock(state, elapsed);
        if (clockEvents.length > 0) handleEvents(clockEvents);
        else if (frameCountRef.current % 6 === 0) bump();
      }

'''
text = replace_once(text, old_old_idle, '', "remove old inactivity and clock loop")
# Selecting must NOT reset the deadline.
text = replace_once(
    text,
    '      pointerRef.current = event.pointerId;\n      idleDeadlineRef.current = performance.now() + USER_DECISION_SECONDS * 1000;\n      idleCountdownRef.current = null;\n      setIdleCountdown(null);\n      selectedRef.current = disc.id;\n',
    '      pointerRef.current = event.pointerId;\n      selectedRef.current = disc.id;\n',
    "pointer down no deadline reset",
)
# Invalid release at 00:00 ends the period. A valid release keeps grace through resolving.
old_invalid = '''      if (!computed.valid) {
        showFlash("Puxada curta demais", "info", 900);
        bump();
        return;
      }
      const shot = { bodyId: disc.id, vx: computed.vx, vy: computed.vy };
      const fired = state.phase === "penalties" ? beginPenaltyShot(state, shot) : beginShot(state, shot);
      if (fired) {
'''
new_invalid = '''      if (!computed.valid) {
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
'''
text = replace_once(text, old_invalid, new_invalid, "invalid final release")
text = replace_once(
    text,
    '    [bump, showFlash],\n',
    '    [bump, handleEvents, showFlash],\n',
    "pointer up deps",
)
# Special 00:00 state in scoreboard.
text = replace_once(
    text,
    '          <span className={`botao-period ${!penalties && state.clock <= 15 && state.phase !== "finished" ? "botao-period-urgent" : ""}`}>\n',
    '          <span className={`botao-period ${!penalties && state.clock <= 15 && state.phase !== "finished" ? "botao-period-urgent" : ""} ${state.finalShotGrace ? "botao-period-final-shot" : ""}`}>\n',
    "final shot timer class",
)
text = replace_once(
    text,
    '              : `${paused ? "Pausado" : periodName(state)} · ${formatClock(state.clock)}`}\n',
    '              : state.finalShotGrace\n                ? "ÚLTIMO LANCE · 00:00"\n                : `${paused ? "Pausado" : periodName(state)} · ${formatClock(state.clock)}`}\n',
    "final shot timer label",
)
# New compact horizontal warning markup.
old_countdown = '''        {!localMatch && idleCountdown !== null ? (
          <div className="botao-inactivity-countdown" role="alert" aria-live="assertive">
            <small>JOGUE AGORA</small>
            <strong>{idleCountdown}</strong>
            <span>ou o adversário ganha um pênalti</span>
          </div>
        ) : null}
'''
new_countdown = '''        {!localMatch && idleCountdown !== null ? (
          <div className="botao-inactivity-countdown" role="alert" aria-live="assertive">
            <div>
              <small>SEM ENROLAR</small>
              <span>chute antes do zero ou é pênalti para o adversário</span>
            </div>
            <strong>{idleCountdown}</strong>
          </div>
        ) : null}
'''
text = replace_once(text, old_countdown, new_countdown, "horizontal countdown markup")
# Footer calls out the miracle final shot.
text = replace_once(
    text,
    '        ) : yourTurn ? (\n          <p className="botao-turn botao-turn-active">Sua vez — arraste um botão para trás e solte</p>\n',
    '        ) : state.finalShotGrace ? (\n          <p className="botao-turn botao-turn-active botao-turn-final-shot">00:00 · ÚLTIMO LANCE — solte e deixe a bola decidir</p>\n        ) : yourTurn ? (\n          <p className="botao-turn botao-turn-active">Sua vez — arraste um botão para trás e solte</p>\n',
    "final shot footer",
)
path.write_text(text)

# ---------------------------------------------------------------- botao.css
path = Path("app/botao/botao.css")
text = path.read_text()
old_css = '''.botao-inactivity-countdown {
  position: absolute;
  z-index: 7;
  inset: 0;
  display: grid;
  place-content: center;
  padding: 24px;
  background: radial-gradient(circle, rgba(255, 90, 78, 0.2), rgba(6, 17, 13, 0.72) 64%);
  pointer-events: none;
  text-align: center;
  backdrop-filter: blur(2px);
  animation: botao-countdown-in 160ms ease-out both;
}

.botao-inactivity-countdown small {
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.2em;
}

.botao-inactivity-countdown strong {
  color: var(--gold, #ffc72c);
  font: 900 clamp(88px, 29vw, 138px)/0.82 var(--display, "Arial Black", Impact, sans-serif);
  text-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
}

.botao-inactivity-countdown span {
  margin-top: 12px;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

@keyframes botao-countdown-in {
  from { opacity: 0; transform: scale(1.08); }
  to { opacity: 1; transform: scale(1); }
}
'''
new_css = '''.botao-inactivity-countdown {
  position: absolute;
  z-index: 12;
  top: 50%;
  right: 0;
  left: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 96px;
  padding: 13px 18px;
  border-block: 1px solid rgba(255, 90, 78, 0.42);
  background: linear-gradient(90deg, rgba(7, 19, 13, 0.58), rgba(35, 13, 10, 0.72) 52%, rgba(7, 19, 13, 0.58));
  box-shadow: 0 12px 38px rgba(0, 0, 0, 0.26);
  pointer-events: none;
  transform: translateY(-50%);
  backdrop-filter: blur(11px) saturate(0.9);
  -webkit-backdrop-filter: blur(11px) saturate(0.9);
  animation: botao-countdown-in 170ms ease-out both;
}

.botao-inactivity-countdown > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.botao-inactivity-countdown small {
  color: #fff;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.18em;
}

.botao-inactivity-countdown strong {
  min-width: 58px;
  color: var(--red, #ff5a4e);
  font: 900 clamp(52px, 17vw, 74px)/0.8 var(--display, "Arial Black", Impact, sans-serif);
  text-align: right;
  text-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
  font-variant-numeric: tabular-nums;
}

.botao-inactivity-countdown span {
  max-width: 230px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 10.5px;
  font-weight: 750;
  line-height: 1.3;
}

@keyframes botao-countdown-in {
  from { opacity: 0; transform: translateY(-50%) scaleY(0.82); }
  to { opacity: 1; transform: translateY(-50%) scaleY(1); }
}
'''
text = replace_once(text, old_css, new_css, "horizontal countdown CSS")
# Add final-shot visual treatment before the existing v91 pause section.
final_css = '''
/* 00:00 com chute já armado: o relógio morreu, mas a jogada ainda está viva. */
.botao-period-final-shot {
  border: 1px solid rgba(255, 199, 44, 0.5);
  background: rgba(255, 199, 44, 0.14);
  color: var(--gold, #ffc72c);
  animation: botao-final-shot-pulse 700ms ease-in-out infinite alternate;
}

.botao-turn-final-shot {
  border-color: rgba(255, 199, 44, 0.52);
  background: linear-gradient(90deg, rgba(255, 199, 44, 0.06), rgba(255, 199, 44, 0.16), rgba(255, 199, 44, 0.06));
  color: var(--gold, #ffc72c);
  letter-spacing: 0.025em;
}

@keyframes botao-final-shot-pulse {
  from { box-shadow: inset 0 0 0 rgba(255, 199, 44, 0); }
  to { box-shadow: inset 0 0 18px rgba(255, 199, 44, 0.13); }
}

@media (max-width: 390px) {
  .botao-inactivity-countdown { gap: 10px; min-height: 88px; padding-inline: 13px; }
  .botao-inactivity-countdown span { font-size: 9.5px; }
  .botao-inactivity-countdown strong { min-width: 46px; }
}

'''
text = replace_once(text, '/* v91 — mesa em transmissão: placar lido num relance e pausa real. */\n', final_css + '/* v91 — mesa em transmissão: placar lido num relance e pausa real. */\n', "final shot CSS")
path.write_text(text)

print("Last-shot grace and anti-stall patch applied")

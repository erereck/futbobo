// Tempos fixos da partida online (Bobonline), iguais no 2D e no 3D: os dois
// aparelhos esperam o mesmo, seja qual for o visual de cada um.

export const ONLINE_TIMING = {
  GOAL_PAUSE_MS: 2400,          // mesma pausa do 3D, para 2D e 3D online
  PENALTY_PAUSE_MS: 1600,
  FINISH_DELAY_MS: 2500,
  INTERVAL_MS: 5000,            // intervalo automático (sem botão "Continuar")
  START_COUNTDOWN_MS: 3000,
  RESUME_COUNTDOWN_MS: 3000,
  KICK_LIMIT_S: 10, KICK_WARNING_S: 3,
  CATCHUP_SPEED: 4,             // física e pausas quando há ações adiante na fila
  CATCHUP_MAX_STEPS: 48,
  CATCHUP_PAUSE_CAP_MS: 350,    // pausa restante máxima quando atrasado
  MAX_STEPS: 12,
} as const;

// Fora do online, os mesmos valores de hoje em BotaoMatch.tsx.
const LOCAL_GOAL_PAUSE_MS = 1700;
const LOCAL_GOAL_PAUSE_3D_MS = 2400;
const LOCAL_FINISH_DELAY_MS = 1800;
const LOCAL_FINISH_DELAY_3D_MS = 2500;

function safeExtension(extensionMs: number): number {
  return Number.isFinite(extensionMs) && extensionMs > 0 ? extensionMs : 0;
}

/** Pausa do gol (ms). Online: igual para 2D e 3D. Local: 2D 1700; 3D 2400 + extensão da comemoração escolhida. */
export function goalPauseMs(args: { online: boolean; view3d: boolean; extensionMs: number }): number {
  const ext = safeExtension(args.extensionMs);
  if (args.online) return ONLINE_TIMING.GOAL_PAUSE_MS + ext;
  return args.view3d ? LOCAL_GOAL_PAUSE_3D_MS + ext : LOCAL_GOAL_PAUSE_MS;
}

/** Atraso do apito final: base + extensão quando o jogo acabou num gol com comemoração longa. */
export function finishDelayMs(args: { online: boolean; view3d: boolean; extensionMs: number }): number {
  const ext = safeExtension(args.extensionMs);
  if (args.online) return ONLINE_TIMING.FINISH_DELAY_MS + ext;
  return args.view3d ? LOCAL_FINISH_DELAY_3D_MS + ext : LOCAL_FINISH_DELAY_MS;
}

// Driver da partida online (Bobonline): todo o tempo online mora aqui, para o
// 2D, o 3D e os testes em Node rodarem o mesmo código. A BotaoMatch só passa
// quadros e toques e desenha; ela importa este arquivo apenas com `import type`
// e recebe a fábrica pela prop `createDriver` (import() feito pela rota Bobonline).
//
// T0: só o contrato. Tipos e assinaturas são os reais; o corpo entra no L3 (B4).

import type { BotaoAim, BotaoEvent, BotaoMatchState } from "./engine";
import type { BotaoMatchLink, BotaoMatchRestore, BotaoSideControl, DuelDirective } from "./match-link";
import type { Rng } from "./rng";
import type { BotaoMatchResult, BotaoSide } from "./types";

export type OnlineDriverOptions = {
  state: BotaoMatchState; n: number;
  controls: Record<BotaoSide, BotaoSideControl>;
  perspective: BotaoSide | "neutral";     // tons de flash, vibração e textos ("neutral" = espectador)
  names: Record<BotaoSide, string>;
  link: BotaoMatchLink;
  restoreTimers?: BotaoMatchRestore["timers"];
  cpu?: { rng: Rng; skill: number } | null;
  view3d: () => boolean;                  // só para o drama do pênalti da CPU
  cameraSettled?: () => boolean;          // idem
  random?: () => number;                  // Math.random por padrão (jitter do drama)
  onEvents: (events: BotaoEvent[]) => void;            // → handleEvents (sons, flashes, 3D)
  onFlash: (text: string, tone: "goal" | "bad" | "info", ms: number) => void;
  onAnnounce: (text: string) => void;                  // → região aria-live
  onTurnStart: (side: BotaoSide) => void;              // → vibrate(25) + "tick"
};
export type OnlineDriverFactory = (opts: OnlineDriverOptions) => OnlineMatchDriver;

function pending(name: string, ...args: unknown[]): never {
  void args;
  throw new Error(`online-driver: ${name} não implementado (T0)`);
}

export function createOnlineDriver(opts: OnlineDriverOptions): OnlineMatchDriver {
  return pending("createOnlineDriver", opts);
}

export class OnlineMatchDriver {
  constructor(opts: OnlineDriverOptions) {
    pending("OnlineMatchDriver", opts);
  }
  get n(): number { return pending("n"); }
  get cpuCursor(): number | null { return pending("cpuCursor"); }
  /** Um quadro: diretivas, fila remota, relógio do dono, 7 s, limite do pênalti, CPU, física em passo fixo, pausas, turnOpened, descanso, progresso. */
  frame(elapsedS: number, input: { holding: boolean }): void { pending("frame", elapsedS, input); }
  /** Toque local (valida dono, congelamento, fase). */
  shoot(bodyId: string, aim: BotaoAim): boolean { return pending("shoot", bodyId, aim); }
  /** Soltou curto: escreve "expire" se estava na graça. */
  releaseInvalid(): void { pending("releaseInvalid"); }
  chooseOrder(side: BotaoSide, order: string[]): void { pending("chooseOrder", side, order); }
  /** §5.3: silencioso (mantém timers) ou re-deriva a apresentação. */
  hydrate(directive: DuelDirective): void { pending("hydrate", directive); }
  displayClock(): number { return pending("displayClock"); }
  idleCountdown(): number | null { return pending("idleCountdown"); }
  kickCountdown(): number | null { return pending("kickCountdown"); }
  /** Para o 3D soltar a câmera. */
  goalEndsIn(): number | null { return pending("goalEndsIn"); }
  presentation(): { kind: "goal" | "penalty" | "finish" | "interval" | "setup" | "countdown" | null; remainingMs: number } {
    return pending("presentation");
  }
  /** Lado local que pode agir agora (null em pausas e quando congelado). */
  localTurn(): BotaoSide | null { return pending("localTurn"); }
  /** Lado remoto que está com a vez acionável (para a mira remota). */
  remoteTurn(): BotaoSide | null { return pending("remoteTurn"); }
  /** Drama da CPU. */
  windup(): { shooterId: string; progress: number; remainingS: number } | null { return pending("windup"); }
  /** §5.3. */
  restReady(): boolean { return pending("restReady"); }
  /** Pela perspectiva; "info" para espectador. */
  flashTone(scoredBy: BotaoSide, kind: "goal" | "save"): "goal" | "bad" | "info" { return pending("flashTone", scoredBy, kind); }
  finishLabel(result: BotaoMatchResult): { text: string; tone: "goal" | "bad" | "info"; won: boolean | null } {
    return pending("finishLabel", result);
  }
  finished(): BotaoMatchResult | null { return pending("finished"); }
}

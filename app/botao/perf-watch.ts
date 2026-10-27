// Vigia de quadros do 3D: decide quando o aparelho não está dando conta.
//
// Mede o intervalo entre desenhos 3D de verdade (o laço desenha no máximo a
// 60 por segundo, então numa tela de 144 Hz isso também dá ~16,7 ms) e a CPU
// gasta em cada desenho. Janelas de alguns segundos de tempo válido:
// - quadros por segundo pela MÉDIA real (desenhos ÷ tempo) — a mediana engana
//   com intervalos presos ao vsync (45 fps com 1/3 dos quadros em 33 ms
//   apareceria como 60);
// - fração de quadros atrasados (perderam um vsync de 60 Hz).
// Janela lenta: abaixo de 48 fps ou mais de 20% de quadros lentos. Liga com
// duas janelas lentas seguidas, ou uma só se estiver muito ruim (abaixo de 36).
// Tela presa em 30 Hz com a CPU folgada é economia de energia, não aparelho
// lento: não conta. Pausa, aba oculta, mesa coberta, os primeiros segundos e os
// respiros pedidos (gol, shader compilando) ficam de fora. Sem DOM nem three.js.

export type FrameWatchOptions = {
  /** Tempo válido de cada janela de medida. */
  windowMs: number;
  /** Abaixo disto (média da janela) a janela conta como lenta. */
  slowFps: number;
  /** Abaixo disto uma janela só já decide. */
  awfulFps: number;
  /** Fração de quadros atrasados que também deixa a janela lenta. */
  lateShare: number;
  /** Janelas lentas seguidas para decidir. */
  windowsNeeded: number;
  /** Tempo ignorado depois de começar (entrada, texturas subindo). */
  warmupMs: number;
};

const DEFAULTS: FrameWatchOptions = { windowMs: 4000, slowFps: 48, awfulFps: 36, lateShare: 0.2, windowsNeeded: 2, warmupMs: 5000 };

/** Intervalo maior que isto é volta de segundo plano ou travada do sistema, não ritmo. */
const GAP_MS = 250;
/**
 * Quadro atrasado: perdeu um vsync de 60 Hz (33 ms). Medido contra o teto de 60
 * do laço e não contra a tela: em 72, 75 ou 80 Hz o ritmo pula/desenha dá
 * intervalos de até ~28 ms com 60 quadros por segundo certinhos.
 */
const LATE_MS = 30;

export class FrameWatch {
  private readonly options: FrameWatchOptions;
  private count = 0;
  private sum = 0;
  private late = 0;
  private readonly cpu: number[] = [];
  private slowWindows = 0;
  private settleUntil = -1;
  private started = false;
  private lastFps = 0;

  constructor(options: Partial<FrameWatchOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Quadros por segundo da última janela fechada (0 antes da primeira). */
  get fps() {
    return this.lastFps;
  }

  /** Respiro: os próximos `ms` não contam (gol, shader novo compilando). */
  hold(now: number, ms: number) {
    this.settleUntil = Math.max(this.settleUntil, now + ms);
    this.clearWindow();
  }

  private clearWindow() {
    this.count = 0;
    this.sum = 0;
    this.late = 0;
    this.cpu.length = 0;
  }

  /**
   * Um desenho 3D aconteceu `intervalMs` depois do anterior e gastou `cpuMs` de
   * CPU. `active` é falso quando não vale medir. Devolve true quando decide que
   * está lento; depois disso recomeça do zero.
   */
  sample(now: number, intervalMs: number, cpuMs: number, active: boolean): boolean {
    if (!this.started) {
      this.started = true;
      this.settleUntil = now + this.options.warmupMs;
    }
    if (!active || intervalMs <= 0 || intervalMs > GAP_MS) {
      // Janela interrompida não vale; depois de voltar, um respiro curto.
      this.clearWindow();
      if (!active || intervalMs > GAP_MS) this.settleUntil = Math.max(this.settleUntil, now + 1500);
      return false;
    }
    if (now < this.settleUntil) return false;
    this.count += 1;
    this.sum += intervalMs;
    if (intervalMs > LATE_MS) this.late += 1;
    this.cpu.push(cpuMs);
    if (this.sum < this.options.windowMs) return false;

    const fps = (this.count * 1000) / this.sum;
    const lateShare = this.late / this.count;
    this.cpu.sort((a, b) => a - b);
    const cpu = this.cpu[this.cpu.length >> 1];
    const meanInterval = this.sum / this.count;
    this.clearWindow();
    this.lastFps = fps;
    // Tela presa em 30 Hz (economia de energia do navegador ou do celular) com o
    // desenho levando pouco: baixar o 3D não ganharia nada.
    const powerSaver = Math.abs(meanInterval - 1000 / 30) < 1.5 && lateShare > 0.9 && cpu < 5;
    if (powerSaver) {
      this.slowWindows = 0;
      return false;
    }
    const slow = fps < this.options.slowFps || lateShare > this.options.lateShare;
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    if (fps >= this.options.awfulFps && this.slowWindows < this.options.windowsNeeded) return false;
    if (!slow) return false;
    this.slowWindows = 0;
    return true;
  }
}

// Escada de ciclo de vida do Bobonline (§3.3, p2p-research §5.2): segundo plano, volta, rede.
//
// Uma máquina single-flight com contador de geração: todo evento hidden/visible/pause/resume/online
// sobe a geração e cancela os timers das anteriores (visibilitychange + resume duplicados viram um
// rejoin só). Recarregar a página é o último degrau, e só quando nada mais funciona:
//   1. sozinho (anfitrião esperando no lobby, ou uma busca): só rejoin, nunca reload;
//   2. com pares: rejoin depois de 6 s sem nenhum par ok; reload só com a sala em `running`, nenhum
//      par ok, um rejoin terminado há ≥ 15 s sem par ok, navigator.onLine !== false e reloadSafe();
//      senão rejoin de novo a cada 20 s. Nunca recarrega com algum par ok.

import { BOTAO_ENGINE_REV } from "../../botao/match-codec";
import { CELEBRATION_OPTIONS } from "../../player-appearance";
import { BOB_PROTOCOL, T } from "../protocol";
import type { BobSession } from "./session";
import { type NetClock, realClock } from "./transport";

export type LifecycleEvent = "hidden" | "visible" | "pause" | "resume" | "online" | "offline";

/** O pedaço da sessão que a escada usa (os testes passam um falso). */
export type LifecycleSession = Pick<BobSession,
  "linked" | "health" | "rejoin" | "setVisible" | "pauseSignaling" | "resumeSignaling" | "signalingUp">;

export type LifecycleOptions = {
  session: LifecycleSession;
  /** O estágio da sala é `running` (torneio/X1 em andamento). */
  isRunning: () => boolean;
  /** Salva tudo (sessão, sala, checkpoint) logo antes do reload. */
  beforeReload?: () => void;
  reload?: () => void;
  reloadSafe?: () => Promise<boolean>;
  onLine?: () => boolean;
  clock?: NetClock;
  /** Fonte de visibilitychange/pause/resume (padrão: document). `hidden` é lido no evento. */
  doc?: (EventTarget & { hidden?: boolean }) | null;
  /** Fonte de online/offline (padrão: window). */
  win?: EventTarget | null;
};

type CapacitorProbe = { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } };

/** APK Android (sem importar @capacitor/core: lê a ponte injetada no window). */
export function isNativeAndroidShell(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as CapacitorProbe).Capacitor;
  try {
    return capacitor?.isNativePlatform?.() === true && capacitor.getPlatform?.() === "android";
  } catch {
    return false;
  }
}

/**
 * Recarregar cai no MESMO build? No APK sempre (o bundle é local). Na web, lê o net.json da
 * própria origem (`/bobonline/net.json` no futbobo.top e dentro do build do itch) sem cache e exige
 * que `current` seja exatamente o que esta página roda. Qualquer diferença ou falha = há um deploy
 * mais novo no ar: não recarrega.
 */
export async function reloadSafe(options: {
  nativeAndroid?: () => boolean;
  fetch?: typeof fetch;
  href?: string;
  expected?: { protocol: number; engineRev: number; celebrations: number };
} = {}): Promise<boolean> {
  if ((options.nativeAndroid ?? isNativeAndroidShell)()) return true;
  const expected = options.expected ?? { protocol: BOB_PROTOCOL, engineRev: BOTAO_ENGINE_REV, celebrations: CELEBRATION_OPTIONS.length };
  try {
    const page = new URL(options.href ?? window.location.href);
    // "/bobonline" sem a barra final (servidor que não redireciona) ainda é a pasta da rota.
    if (!page.pathname.endsWith("/") && !/\.[A-Za-z0-9]+$/.test(page.pathname)) page.pathname += "/";
    const doFetch = options.fetch ?? fetch;
    const response = await doFetch(new URL("net.json", page).toString(), { cache: "no-store" });
    if (!response.ok) return false;
    const config = (await response.json()) as { current?: { protocol?: unknown; engineRev?: unknown; celebrations?: unknown } } | null;
    const current = config?.current;
    return !!current && current.protocol === expected.protocol && current.engineRev === expected.engineRev
      && current.celebrations === expected.celebrations;
  } catch {
    return false;
  }
}

const POLL_MS = 1000;

export class BobLifecycle {
  private readonly session: LifecycleSession;
  private readonly isRunning: () => boolean;
  private readonly beforeReload: () => void;
  private readonly reload: () => void;
  private readonly reloadSafe: () => Promise<boolean>;
  private readonly onLine: () => boolean;
  private readonly clock: NetClock;
  private readonly doc: (EventTarget & { hidden?: boolean }) | null;
  private readonly win: EventTarget | null;
  private generation = 0;
  private timers: unknown[] = [];
  private hidden = false;
  private paused = false;
  private hadPeers = false;
  private disposed = false;
  private readonly listeners: Array<() => void> = [];
  /** Para testes e o overlay de debug: quantas vezes cada degrau rodou. */
  readonly stats = { rejoins: 0, reloads: 0 };

  constructor(options: LifecycleOptions) {
    this.session = options.session;
    this.isRunning = options.isRunning;
    this.beforeReload = options.beforeReload ?? (() => {});
    this.reload = options.reload ?? (() => window.location.reload());
    this.reloadSafe = options.reloadSafe ?? (() => reloadSafe());
    this.onLine = options.onLine ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
    this.clock = options.clock ?? realClock;
    this.doc = options.doc !== undefined ? options.doc : typeof document !== "undefined" ? document : null;
    this.win = options.win !== undefined ? options.win : typeof window !== "undefined" ? window : null;
  }

  /** Liga os ouvintes (visibilitychange, pause/resume do Capacitor, online/offline). */
  start(): void {
    if (this.disposed || this.listeners.length) return;
    const listen = (target: EventTarget | null, type: string, handler: () => void) => {
      if (!target) return;
      target.addEventListener(type, handler);
      this.listeners.push(() => target.removeEventListener(type, handler));
    };
    listen(this.doc, "visibilitychange", () => this.handle(this.doc?.hidden ? "hidden" : "visible"));
    listen(this.doc, "pause", () => this.handle("pause"));   // disparado pela ponte nativa do Capacitor
    listen(this.doc, "resume", () => this.handle("resume"));
    listen(this.win, "online", () => this.handle("online"));
    listen(this.win, "offline", () => this.handle("offline"));
    if (this.doc?.hidden) this.handle("hidden");
  }

  /** Cancela tudo (no leave da sala). */
  dispose(): void {
    this.disposed = true;
    this.cancel();
    for (const off of this.listeners.splice(0)) off();
  }

  /** Um evento do ciclo de vida (também é o caminho do gancho de teste `simulateBackground`). */
  handle(event: LifecycleEvent): void {
    if (this.disposed) return;
    if (event === "offline") {
      // Sem mudar a visibilidade: só lembra se havia pares, para o "online" escolher o degrau certo.
      this.hadPeers = this.hadPeers || this.session.linked().length > 0;
      return;
    }
    this.generation += 1;
    this.cancel();
    if (event === "hidden" || event === "pause") {
      if (!this.hidden) {
        this.hidden = true;
        this.hadPeers = this.session.linked().length > 0;
        this.session.setVisible(false);
      } else this.hadPeers = this.hadPeers || this.session.linked().length > 0;
      // pause do Capacitor: para as tentativas de reconectar relays (os sockets abertos ficam).
      if (event === "pause") {
        this.paused = true;
        this.session.pauseSignaling();
      }
      return;
    }
    if (event === "online") {
      this.hadPeers = this.hadPeers || this.session.linked().length > 0;
      // A rede voltou com a página escondida: a escada religa, mas a presença continua "bg"
      // (ouvido não é presente) e, no pause do Capacitor, os relays esperam o resume.
      if (!this.hidden) this.session.setVisible(true);
      if (!this.paused) this.session.resumeSignaling();
    } else {
      // visible / resume
      this.hidden = false;
      this.paused = false;
      this.session.setVisible(true);
      this.session.resumeSignaling();
    }
    const generation = this.generation;
    if (!this.hadPeers) {
      this.after(T.RESUME_SIGNALING_CHECK_MS, generation, () => {
        if (!this.session.signalingUp()) this.rejoin(generation);
      });
      return;
    }
    const startedAt = this.clock.now();
    let rejoinDoneAt: number | null = null;
    let rejoinPending = false;
    let checkedReload = false;
    const step = () => {
      if (this.anyOk()) {
        // Voltou: a escada termina aqui.
        this.hadPeers = true;
        return;
      }
      const now = this.clock.now();
      if (rejoinDoneAt === null) {
        if (!rejoinPending && now - startedAt >= T.REJOIN_AFTER_RESUME_MS) {
          rejoinPending = true;
          this.rejoin(generation, () => {
            rejoinPending = false;
            rejoinDoneAt = this.clock.now();
            checkedReload = false;
          });
        }
      } else if (!checkedReload && now - rejoinDoneAt >= T.RELOAD_AFTER_FAILED_REJOIN_MS) {
        checkedReload = true;
        void this.maybeReload(generation);
      } else if (!rejoinPending && now - rejoinDoneAt >= T.REJOIN_RETRY_MS) {
        rejoinPending = true;
        this.rejoin(generation, () => {
          rejoinPending = false;
          rejoinDoneAt = this.clock.now();
          checkedReload = false;
        });
      }
      this.after(POLL_MS, generation, step);
    };
    this.after(POLL_MS, generation, step);
  }

  private anyOk(): boolean {
    return this.session.linked().some((playerId) => this.session.health(playerId) === "ok");
  }

  private async maybeReload(generation: number): Promise<void> {
    // Escondida (a rede voltou em segundo plano) nunca recarrega: a volta ao primeiro plano refaz a escada.
    if (this.hidden || !this.isRunning() || this.anyOk() || !this.onLine()) return;
    let safe = false;
    try {
      safe = await this.reloadSafe();
    } catch {
      safe = false;
    }
    if (!safe || generation !== this.generation || this.disposed || this.anyOk() || !this.isRunning()) return;
    this.stats.reloads += 1;
    try {
      this.beforeReload();
    } catch (error) {
      console.error("[bobonline] salvar antes do reload", error);
    }
    this.reload();
  }

  private rejoin(generation: number, done?: () => void): void {
    this.stats.rejoins += 1;
    this.session.rejoin().catch(() => undefined).then(() => {
      if (generation === this.generation && !this.disposed) done?.();
    });
  }

  private after(ms: number, generation: number, run: () => void): void {
    const handle = this.clock.setTimeout(() => {
      this.timers = this.timers.filter((entry) => entry !== handle);
      if (generation === this.generation && !this.disposed) run();
    }, ms);
    this.timers.push(handle);
  }

  private cancel(): void {
    for (const handle of this.timers) this.clock.clearTimeout(handle);
    this.timers = [];
  }
}

// CPU × CPU (§4.6): o anfitrião que começa a partida calcula o resultado UMA vez, num Worker, e o
// lacra no snapshot (`BracketMatch.sealed`). Todo mundo esconde o placar até `revealAt`; um anfitrião
// novo reaproveita o lacrado e nunca simula de novo (motores JS diferentes dão floats diferentes).
//
// Sem Worker (ou se ele falhar), roda na thread da página num momento calmo: nunca no meio de um
// duelo do anfitrião (o chamador diz quando está ocupado).

import type { BotaoMatchResult, BotaoMatchSetup, BotaoRules } from "../../botao/types";
import { bracketResultHash } from "../tournament/bracket";
import type { BracketMatch, BracketResult, SealedCpuResult } from "../types";

type Pending = { resolve: (result: BotaoMatchResult) => void; reject: (error: Error) => void; setup: BotaoMatchSetup };

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

export type SimulateOptions = {
  /** O anfitrião está num duelo agora: a thread da página espera o fim dele. */
  busy?: () => boolean;
};

function onMainThread(setup: BotaoMatchSetup, options: SimulateOptions): Promise<BotaoMatchResult> {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (options.busy?.()) {
        setTimeout(attempt, 1000);
        return;
      }
      const run = () => {
        // Import tardio: o motor da simulação só entra quando precisa (e já está no pacote da partida).
        import("../../botao/simulate")
          .then(({ simulateBotaoMatch }) => {
            // O duelo pode ter começado na espera da folga (até 2 s) ou do import: confere de novo.
            if (options.busy?.()) setTimeout(attempt, 1000);
            else resolve(simulateBotaoMatch(setup));
          })
          .catch((error: unknown) => reject(error instanceof Error ? error : new Error(String(error))));
      };
      const idle = (globalThis as { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (typeof idle === "function") idle(run, { timeout: 2000 });
      else setTimeout(run, 0);
    };
    attempt();
  });
}

function failWorker(error: unknown, options: SimulateOptions) {
  workerBroken = true;
  try {
    worker?.terminate();
  } catch {
    // Já morto.
  }
  worker = null;
  // O que estava no Worker vai para a thread da página.
  for (const [id, job] of pending) {
    pending.delete(id);
    onMainThread(job.setup, options).then(job.resolve, job.reject);
  }
  void error;
}

function ensureWorker(options: SimulateOptions): Worker | null {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    const created = new Worker(new URL("./cpu-sim.worker.ts", import.meta.url), { type: "module" });
    created.onmessage = (event: MessageEvent<{ id: number; result?: BotaoMatchResult; error?: string }>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.result) job.resolve(event.data.result);
      else onMainThread(job.setup, options).then(job.resolve, job.reject);
    };
    created.onerror = (event) => failWorker(event, options);
    worker = created;
    return created;
  } catch (error) {
    failWorker(error, options);
    return null;
  }
}

/** simulateBotaoMatch(setup) num Worker (preguiçoso); sem Worker, na thread da página fora de duelo. */
export function simulateCpuMatch(setup: BotaoMatchSetup, options: SimulateOptions = {}): Promise<BotaoMatchResult> {
  const target = ensureWorker(options);
  if (!target) return onMainThread(setup, options);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, setup });
    try {
      target.postMessage({ id, setup });
    } catch (error) {
      pending.delete(id);
      failWorker(error, options);
      onMainThread(setup, options).then(resolve, reject);
    }
  });
}

/** Segundos de tempo normal (o relógio virtual do "ao vivo" de uma CPU × CPU). */
export function regulationSecondsOf(rules: Pick<BotaoRules, "halfSeconds" | "halves">): number {
  return Math.max(1, rules.halfSeconds * rules.halves);
}

/** Resultado do motor (lado user = mandante) → resultado da chave. */
export function bracketResultFrom(result: BotaoMatchResult, reportedBy: string, at: number): BracketResult {
  // Online não existe empate (prorrogação e pênaltis): um "draw" só viria de regra quebrada; o mandante leva.
  const winner = result.outcome === "loss" ? "away" : "home";
  const base = {
    matchId: result.matchId,
    winner: winner as "home" | "away",
    homeGoals: result.goalsFor,
    awayGoals: result.goalsAgainst,
    homePens: result.penaltyFor,
    awayPens: result.penaltyAgainst,
    decision: result.decision,
  };
  return { ...base, resultHash: bracketResultHash(base), reportedBy, at };
}

/**
 * Lacra o resultado: o placar final e os gols (com relógio e período) para o "ao vivo" virtual.
 * `regulationSeconds` (extensão opcional) vem das regras; sem ele, sai do último gol.
 */
export function sealCpuResult(match: BracketMatch, result: BotaoMatchResult, startedAt: number, revealAt: number, regulationSeconds?: number): SealedCpuResult {
  const goals = result.timeline
    .filter((entry) => entry.kind === "goal" || entry.kind === "own-goal")
    .map((entry) => ({ side: entry.side === "user" ? ("home" as const) : ("away" as const), clock: entry.clock, period: entry.period, text: entry.text }));
  return {
    result: bracketResultFrom(result, "host", revealAt),
    goals,
    regulationSeconds: regulationSeconds ?? Math.max(60, ...goals.map((goal) => goal.clock)),
    startedAt,
    revealAt,
  };
}

// Uma aba só (§3.3, §1): duas abas do mesmo navegador dividiriam identidade, sessão e checkpoint.
//
// Web Locks: `request(nome, { ifAvailable })` segura uma promessa que nunca resolve; sem a trava,
// a página mostra a tela `other-tab`. "Usar aqui" pede com `{ steal: true }`: a promessa da aba
// antiga rejeita, ela fecha a conexão (sem room:leave) e mostra "O Bobonline foi aberto em outra aba.".
// Sem navigator.locks: ping num BroadcastChannel; resposta em 300 ms = outra aba aberta.
// O nome leva o perfil de teste (`bobKey`): no E2E, perfis diferentes são aparelhos diferentes.

import { bobKey } from "../storage";
import { type NetClock, realClock } from "./transport";

export type TabLock = {
  /** Esta aba é a dona do Bobonline. */
  readonly granted: boolean;
  /** "Usar aqui": toma a trava da outra aba. Resolve com `granted`. */
  steal(): Promise<boolean>;
  /** Solta a trava (sair do Bobonline). */
  release(): void;
  /** Outra aba tomou a trava: feche a sessão e mostre o aviso. */
  onLost: (() => void) | null;
};

type BroadcastLike = {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
};

type TabLockOptions = {
  locks?: LockManager | null;
  channel?: ((name: string) => BroadcastLike) | null;
  clock?: NetClock;
  name?: string;
};

const LOCK_NAME = "futbobo-bobonline";
const PING_WAIT_MS = 300;

export function acquireTabLock(options: TabLockOptions = {}): Promise<TabLock> {
  const name = options.name ?? bobKey(LOCK_NAME);
  const locks = options.locks !== undefined ? options.locks
    : typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;
  if (locks) return webLock(locks, name);
  const channel = options.channel !== undefined ? options.channel
    : typeof BroadcastChannel === "function" ? (channelName: string) => new BroadcastChannel(channelName) as unknown as BroadcastLike : null;
  if (channel) return channelLock(channel, `${name}-tab`, options.clock ?? realClock);
  // Sem nenhuma das duas APIs: não há como saber; segue como dona.
  return Promise.resolve({ granted: true, steal: async () => true, release: () => {}, onLost: null });
}

function webLock(locks: LockManager, name: string): Promise<TabLock> {
  let release: (() => void) | null = null;
  const lock: TabLock & { granted: boolean } = {
    granted: false,
    onLost: null,
    steal: () => request({ steal: true }),
    release: () => {
      lock.granted = false;
      release?.();
      release = null;
    },
  };
  function request(options: LockOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let mine = false;
      locks.request(name, options, (held) => {
        if (!held) {
          resolve(false);
          return undefined;
        }
        mine = true;
        lock.granted = true;
        resolve(true);
        // Segura até release(): a promessa só resolve quando esta aba larga a trava.
        return new Promise<void>((done) => {
          release = done;
        });
      }).catch(() => {
        // Roubada por outra aba ("Usar aqui" lá): AbortError aqui.
        if (mine && lock.granted) {
          lock.granted = false;
          release = null;
          lock.onLost?.();
        }
        resolve(lock.granted);
      });
    });
  }
  return request({ ifAvailable: true }).then(() => lock);
}

function channelLock(open: (name: string) => BroadcastLike, name: string, clock: NetClock): Promise<TabLock> {
  const channel = open(name);
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let answered = false;
  const lock: TabLock & { granted: boolean } = {
    granted: false,
    onLost: null,
    steal: async () => {
      channel.postMessage({ t: "steal", from: id });
      lock.granted = true;
      return true;
    },
    release: () => {
      lock.granted = false;
      channel.close();
    },
  };
  channel.onmessage = (event) => {
    const message = event.data as { t?: string; from?: string; to?: string } | null;
    if (!message || message.from === id) return;
    if (message.t === "ping" && lock.granted) channel.postMessage({ t: "pong", from: id, to: message.from });
    else if (message.t === "pong" && message.to === id) answered = true;
    else if (message.t === "steal" && lock.granted) {
      lock.granted = false;
      lock.onLost?.();
    }
  };
  channel.postMessage({ t: "ping", from: id });
  return new Promise<TabLock>((resolve) => {
    clock.setTimeout(() => {
      lock.granted = !answered;
      resolve(lock);
    }, PING_WAIT_MS);
  });
}

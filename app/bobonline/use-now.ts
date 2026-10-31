// Relógio de parede para as contagens do Bobonline (§11.5): um setInterval por
// intervalo pedido, compartilhado por todos os componentes que usam o mesmo `ms`.
//
// O React Compiler proíbe Date.now() no render; aqui o valor nasce fora do
// componente e chega por useSyncExternalStore. No export estático (servidor)
// o valor é 0: quem desenha contagem trata 0 como "ainda sem relógio".

import { useSyncExternalStore } from "react";

type Ticker = {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  subscribe: (listener: () => void) => () => void;
  read: () => number;
};

const tickers = new Map<number, Ticker>();

function tickerFor(ms: number): Ticker {
  const existing = tickers.get(ms);
  if (existing) return existing;
  const ticker: Ticker = {
    now: 0,
    listeners: new Set(),
    timer: null,
    subscribe: (listener) => {
      ticker.listeners.add(listener);
      if (!ticker.timer) {
        // Voltou a ter quem escute depois de um tempo parado: o valor guardado pode estar velho.
        ticker.now = Date.now();
        ticker.timer = setInterval(() => {
          ticker.now = Date.now();
          for (const item of [...ticker.listeners]) item();
        }, ms);
      }
      return () => {
        ticker.listeners.delete(listener);
        if (ticker.listeners.size === 0 && ticker.timer) {
          clearInterval(ticker.timer);
          ticker.timer = null;
        }
      };
    },
    read: () => {
      if (ticker.now === 0) ticker.now = Date.now();
      return ticker.now;
    },
  };
  tickers.set(ms, ticker);
  return ticker;
}

const serverNow = () => 0;

/** Date.now() atualizado a cada `ms` (padrão 1 s). 0 no servidor. */
export function useNow(ms = 1000): number {
  const ticker = tickerFor(Math.max(16, Math.round(ms)));
  return useSyncExternalStore(ticker.subscribe, ticker.read, serverNow);
}

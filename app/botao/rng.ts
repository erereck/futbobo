// Gerador determinístico isolado: a mesma seed sempre devolve a mesma partida.
// Não depende de nada do resto do jogo para o módulo continuar plugável.

export type Rng = {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  chance: (probability: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  cursor: () => number;
};

export function createRng(seed: number): Rng {
  let state = (Math.floor(Math.abs(seed)) || 1) >>> 0;
  let calls = 0;
  const next = () => {
    calls += 1;
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
    cursor: () => calls,
  };
}

export function hashSeed(...parts: Array<string | number>): number {
  let hash = 2166136261;
  const text = parts.join("|");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

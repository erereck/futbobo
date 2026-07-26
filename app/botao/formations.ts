// Formações de 5 botões em espaço normalizado.
//
// `lane`  0 = borda esquerda da mesa, 1 = borda direita.
// `depth` 0 = linha do próprio gol, 1 = linha de meio-campo.
//
// O engine converte para unidades de campo e espelha para o lado da CPU, então
// aqui não existe nenhuma noção de "quem ataca para cima".

import type { BotaoPositionKey } from "./types";

export type BotaoSlot = {
  lane: number;
  depth: number;
  zone: "fundo" | "defesa" | "meio" | "ataque";
};

export type BotaoFormation = {
  id: string;
  name: string;
  shape: string;
  hint: string;
  slots: BotaoSlot[];
};

export const BOTAO_FORMATIONS: BotaoFormation[] = [
  {
    id: "muralha",
    name: "Muralha",
    shape: "2-2-1",
    hint: "Dois atrás, dois no meio e um homem de referência.",
    slots: [
      { lane: 0.3, depth: 0.14, zone: "fundo" },
      { lane: 0.7, depth: 0.14, zone: "defesa" },
      { lane: 0.22, depth: 0.5, zone: "meio" },
      { lane: 0.78, depth: 0.5, zone: "meio" },
      { lane: 0.5, depth: 0.88, zone: "ataque" },
    ],
  },
  {
    id: "diamante",
    name: "Diamante",
    shape: "1-2-1-1",
    hint: "Um ancora, dois abrem, um conduz e um finaliza.",
    slots: [
      { lane: 0.5, depth: 0.12, zone: "fundo" },
      { lane: 0.18, depth: 0.44, zone: "defesa" },
      { lane: 0.82, depth: 0.44, zone: "defesa" },
      { lane: 0.5, depth: 0.64, zone: "meio" },
      { lane: 0.5, depth: 0.94, zone: "ataque" },
    ],
  },
  {
    id: "linha",
    name: "Linha",
    shape: "2-1-2",
    hint: "Base larga, um pivô e dois pontas.",
    slots: [
      { lane: 0.28, depth: 0.16, zone: "fundo" },
      { lane: 0.72, depth: 0.16, zone: "defesa" },
      { lane: 0.5, depth: 0.52, zone: "meio" },
      { lane: 0.2, depth: 0.9, zone: "ataque" },
      { lane: 0.8, depth: 0.9, zone: "ataque" },
    ],
  },
  {
    id: "piramide",
    name: "Pirâmide",
    shape: "1-3-1",
    hint: "Meio-campo cheio para dominar a mesa.",
    slots: [
      { lane: 0.5, depth: 0.1, zone: "fundo" },
      { lane: 0.16, depth: 0.56, zone: "meio" },
      { lane: 0.5, depth: 0.6, zone: "meio" },
      { lane: 0.84, depth: 0.56, zone: "meio" },
      { lane: 0.5, depth: 0.95, zone: "ataque" },
    ],
  },
  {
    id: "ferrolho",
    name: "Ferrolho",
    shape: "3-1-1",
    hint: "Trinca atrás para segurar o resultado.",
    slots: [
      { lane: 0.5, depth: 0.08, zone: "fundo" },
      { lane: 0.2, depth: 0.2, zone: "defesa" },
      { lane: 0.8, depth: 0.2, zone: "defesa" },
      { lane: 0.5, depth: 0.58, zone: "meio" },
      { lane: 0.5, depth: 0.92, zone: "ataque" },
    ],
  },
  {
    id: "avalanche",
    name: "Avalanche",
    shape: "1-1-3",
    hint: "Tudo na frente. Ou vira o jogo, ou toma o contra-ataque.",
    slots: [
      { lane: 0.5, depth: 0.1, zone: "fundo" },
      { lane: 0.5, depth: 0.44, zone: "meio" },
      { lane: 0.15, depth: 0.9, zone: "ataque" },
      { lane: 0.5, depth: 0.98, zone: "ataque" },
      { lane: 0.85, depth: 0.9, zone: "ataque" },
    ],
  },
];

/** Onde cada posição da carreira "quer" ficar na mesa. */
const POSITION_PREFERENCE: Record<BotaoPositionKey, { depth: number; lane: number }> = {
  GOL: { depth: 0, lane: 0.5 },
  ZAG: { depth: 0.12, lane: 0.5 },
  LD: { depth: 0.26, lane: 0.86 },
  LE: { depth: 0.26, lane: 0.14 },
  VOL: { depth: 0.42, lane: 0.5 },
  MC: { depth: 0.56, lane: 0.5 },
  MD: { depth: 0.62, lane: 0.86 },
  ME: { depth: 0.62, lane: 0.14 },
  MEI: { depth: 0.74, lane: 0.5 },
  PD: { depth: 0.9, lane: 0.9 },
  PE: { depth: 0.9, lane: 0.1 },
  CA: { depth: 1, lane: 0.5 },
};

export function formationByIndex(index: number): BotaoFormation {
  const list = BOTAO_FORMATIONS;
  return list[((index % list.length) + list.length) % list.length];
}

export function formationById(id: string): BotaoFormation {
  return BOTAO_FORMATIONS.find((formation) => formation.id === id) ?? BOTAO_FORMATIONS[0];
}

/**
 * Slot que melhor traduz a posição do jogador dentro da formação atual.
 * Goleiro cai no botão mais atrasado, centroavante no mais adiantado — e como a
 * formação roda a cada gol, o mesmo jogador muda de função durante a partida.
 */
export function slotIndexForPosition(formation: BotaoFormation, position: BotaoPositionKey): number {
  const preference = POSITION_PREFERENCE[position];
  let bestIndex = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  formation.slots.forEach((slot, index) => {
    const raw = Math.abs(slot.depth - preference.depth) * 2.4 + Math.abs(slot.lane - preference.lane);
    // Arredonda antes de comparar: sem isso 0.7-0.5 e 0.3-0.5 dão custos
    // diferentes por ruído de ponto flutuante e o lado escolhido vira sorteio.
    const cost = Math.round(raw * 10000) / 10000;
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/** Rótulo curto usado no HUD ("Você agora é o mais adiantado"). */
export function slotRoleLabel(slot: BotaoSlot): string {
  if (slot.zone === "fundo") return "último homem";
  if (slot.zone === "defesa") return "defesa";
  if (slot.zone === "meio") return "meio";
  return "frente";
}

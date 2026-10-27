// Planta da cidade da festa: medidas de cada estilo (avenida, quarteirões,
// andares) e o contexto que os geradores de rua, prédios e marcos dividem.

import type * as THREE from "three";
import type { MeshBuilder, Rand } from "./city-kit";
import type { HaloSet } from "./city-fx";
import type { ParadeCity, ParadeCityStyle, ParadeTimeOfDay } from "./parade-script";
import type { AvenueLayout } from "./stage-city";

export type TreeKind = "plane" | "palm" | "round" | "none";

export type StyleSpec = {
  length: number;
  width: number;
  crowdDepth: number;
  /** Calçada entre a multidão e as fachadas (árvores ficam aqui). */
  walk: number;
  /** Canteiro + pista lateral depois da calçada (avenidas muito largas). */
  boulevard: number;
  /** Altura do andar e largura da coluna de janelas (m). */
  floor: number;
  column: number;
  /** Andares: na avenida, no miolo e no anel distante. */
  front: [number, number];
  back: [number, number];
  far: [number, number];
  block: number;
  street: number;
  /** Casario colado (sem vão entre os lotes). */
  contiguous: boolean;
  windows: number[];
  road: string;
  walkColor: string;
  ground: string;
  plinth: string;
  curb: string;
  trees: TreeKind;
};

// Estilos de janela (ver WIN em city-kit): 1 soltas, 2 fita, 3 vidro, 4 colonial, 5 europeu, 7 varandas.
const BASE: Record<ParadeCityStyle, StyleSpec> = {
  beach: {
    length: 560, width: 20, crowdDepth: 14, walk: 3, boulevard: 0, floor: 3, column: 3.2,
    front: [10, 15], back: [6, 14], far: [4, 12], block: 62, street: 12, contiguous: false, windows: [7, 7, 1],
    road: "#3a3c41", walkColor: "#e6e0d2", ground: "#55575c", plinth: "#b9b4a9", curb: "#d8d4cc", trees: "palm",
  },
  metropolis: {
    length: 520, width: 24, crowdDepth: 14, walk: 5, boulevard: 0, floor: 3.6, column: 3.6,
    front: [12, 40], back: [8, 32], far: [6, 26], block: 74, street: 14, contiguous: false, windows: [1, 2, 3, 1, 2],
    road: "#34363b", walkColor: "#a9a59d", ground: "#4b4d52", plinth: "#9a968f", curb: "#c9c5bd", trees: "round",
  },
  modernist: {
    length: 600, width: 30, crowdDepth: 16, walk: 0, boulevard: 0, floor: 3.4, column: 3.4,
    front: [9, 11], back: [5, 7], far: [3, 8], block: 110, street: 20, contiguous: false, windows: [2],
    road: "#3c3e42", walkColor: "#cfcac0", ground: "#93a35e", plinth: "#d5d1c7", curb: "#e2ded5", trees: "round",
  },
  colonial: {
    length: 420, width: 14, crowdDepth: 10, walk: 2, boulevard: 0, floor: 3.8, column: 2.9,
    front: [2, 3], back: [1, 3], far: [2, 4], block: 46, street: 9, contiguous: true, windows: [4],
    road: "#5d5850", walkColor: "#cfc6b6", ground: "#615a52", plinth: "#c4bba9", curb: "#d9d1c2", trees: "round",
  },
  european: {
    length: 500, width: 22, crowdDepth: 12, walk: 8, boulevard: 0, floor: 3.4, column: 3.1,
    front: [5, 7], back: [5, 7], far: [5, 8], block: 60, street: 14, contiguous: true, windows: [5],
    road: "#3d3f44", walkColor: "#cbc4b6", ground: "#4e5054", plinth: "#b8b1a3", curb: "#d6d0c4", trees: "plane",
  },
};

/** Ajustes de cidades conhecidas (a 9 de Julho é enorme, Boa Viagem tem torres altas...). */
const TWEAKS: Record<string, Partial<StyleSpec>> = {
  "buenos-aires": { width: 34, boulevard: 24, front: [12, 30] },
  recife: { front: [20, 38], back: [10, 30] },
  "rio-centro": { width: 28, trees: "palm" },
  brasilia: { width: 32 },
  paris: { width: 28, walk: 10 },
  "nova-york": { front: [22, 70], back: [14, 56], far: [10, 44], windows: [1, 3, 1, 2] },
  toquio: { front: [12, 38], windows: [2, 3, 2, 1] },
  "sao-paulo": { front: [16, 42], back: [10, 34] },
  cairo: { ground: "#c9b184", walkColor: "#ddd0b3", trees: "palm" },
  "cidade-do-mexico": { width: 30, trees: "palm" },
  casablanca: { front: [3, 5], back: [2, 5], trees: "palm" },
  montevideu: { front: [3, 6], back: [2, 5], width: 18 },
  lisboa: { front: [4, 6], back: [3, 6], walk: 9, trees: "plane" },
  salvador: { front: [2, 4], trees: "palm" },
  barcelona: { walk: 12 },
  manchester: { front: [6, 22], back: [4, 14], far: [4, 12], windows: [1, 1, 2] },
};

export function styleSpec(city: ParadeCity): StyleSpec {
  const spec = { ...BASE[city.style], ...(TWEAKS[city.id] ?? {}) };
  if (city.landmarks.includes("palms") && spec.trees !== "plane") spec.trees = "palm";
  return spec;
}

export type Footprint = { x0: number; x1: number; z0: number; z1: number };

export type CityLandmark = { id: string; position: THREE.Vector3; height: number };

export type CityContext = {
  city: ParadeCity;
  rand: Rand;
  seed: number;
  variant: number;
  performance: boolean;
  timeOfDay: ParadeTimeOfDay;
  /** Cores da seleção já "de festa" (claras e saturadas). */
  colors: [THREE.Color, THREE.Color];
  avenue: AvenueLayout;
  spec: StyleSpec;
  /** |z| da fachada dos prédios da avenida. */
  frontZ: number;
  /** Até onde (m) há cidade em volta da avenida. */
  reach: number;
  /** x onde a avenida termina (praça, marco ou mar). */
  roadEnd: number;
  /** x da linha da praia quando o mar fica no fim da avenida. */
  seaEndX: number | null;
  /** |z| da linha da praia no lado aberto (estilo orla). */
  shoreZ: number;
  /** Rio paralelo à avenida (lado e faixa em |z|). */
  river: { side: 1 | -1; near: number; far: number } | null;
  solid: MeshBuilder;
  facade: MeshBuilder;
  halos: HaloSet;
  /** Áreas onde não nasce prédio (marcos, praças, morros). */
  reserved: Footprint[];
  /** Relevo extra (morros, cidade alta): o maior vale. */
  terrain: Array<(x: number, z: number) => number>;
  landmarks: CityLandmark[];
  /** Topos de prédios altos perto da avenida (antenas sobem neles). */
  roofs: Array<{ x: number; z: number; y: number; size: number }>;
  /** Altura dos prédios da primeira fileira (a câmera usa a típica). */
  frontTops: number[];
  /** Topo do morro do Cristo (quando há). */
  christAt?: THREE.Vector3;
  /** Escarpa da cidade alta (Salvador): |z| do pé e altura. */
  cliff?: { z: number; height: number };
  /** Postes da avenida (para as poças de luz no chão à noite). */
  pool: { spacing: number; z: number; x0: number; x1: number } | null;
  /** Peças móveis (pás do moinho, bondinho) e quem as anima. */
  movers: THREE.Object3D[];
  tickers: Array<(time: number) => void>;
};

export function groundAt(ctx: CityContext, x: number, z: number) {
  let height = 0;
  for (const fn of ctx.terrain) height = Math.max(height, fn(x, z));
  return height;
}

export function isReserved(ctx: CityContext, x0: number, x1: number, z0: number, z1: number) {
  for (const box of ctx.reserved) if (x1 > box.x0 && x0 < box.x1 && z1 > box.z0 && z0 < box.z1) return true;
  return false;
}

export function reserve(ctx: CityContext, cx: number, cz: number, halfX: number, halfZ: number) {
  ctx.reserved.push({ x0: cx - halfX, x1: cx + halfX, z0: cz - halfZ, z1: cz + halfZ });
}

/** Ponto está na água (mar do lado aberto, mar no fim ou rio)? */
export function isWater(ctx: CityContext, x: number, z: number, margin = 0) {
  const open = ctx.avenue.openSide;
  if (open !== 0 && z * open > ctx.avenue.width / 2 + ctx.avenue.crowdDepth - margin) return true;
  if (ctx.seaEndX !== null && x > ctx.seaEndX - 45 - margin) return true;
  const river = ctx.river;
  if (river) {
    const side = z * river.side;
    if (side > river.near - margin && side < river.far + margin) return true;
  }
  return false;
}

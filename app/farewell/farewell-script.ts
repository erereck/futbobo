// Roteiro da despedida no estádio: a lenda do clube sai do túnel por um
// corredor de companheiros aplaudindo, para no círculo central, põe a mão no
// peito para a arquibancada, beija o escudo, acena para cada lado e aponta
// para o céu enquanto o estádio inteiro canta o nome dele.
//
// Tudo é função do relógio (segundos), como na apresentação do reforço: o
// palco 3D, a versão 2D, o som e a camada de TV leem as mesmas marcas daqui,
// e "Pular"/"Rever" são só saltos do relógio.

import type { PlayerAppearance } from "../player-appearance";

export type FarewellStats = {
  seasons: number;
  from: number;
  to: number;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  titles: number;
  /** Os títulos mais importantes pelo clube, já com a contagem ("3× Libertadores"). */
  titleLines: string[];
  keeper: boolean;
  captain: boolean;
};

export type FarewellClub = {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  primary: string;
  secondary: string;
  badge?: string;
  city?: string;
  kitPattern?: number;
};

export type FarewellInput = {
  player: { name: string; shortName: string; number: number; appearance: PlayerAppearance };
  club: FarewellClub;
  /** Próximo clube (o avião vem depois); null na despedida da aposentadoria. */
  destination: Pick<FarewellClub, "shortName" | "primary" | "secondary" | "abbr" | "badge"> | null;
  stats: FarewellStats;
  /** O corredor: companheiros (aparência e número), até 10. */
  teammates: Array<{ appearance: PlayerAppearance; number: number }>;
  kind: "transfer" | "retirement";
};

export type FarewellBeatId = "night" | "corridor" | "center" | "crest" | "salute" | "sky" | "end";
export type FarewellBeat = { id: FarewellBeatId; start: number; end: number };

/** Marcas do roteiro (s). O palco 3D e o 2D encenam em cima delas. */
export const FAREWELL_MARKS = {
  /** Plano aberto do estádio à noite; a torcida já está de pé. */
  open: 0,
  /** Ele sai do túnel e atravessa o corredor de companheiros. */
  walkStart: 2.2,
  walkEnd: 7.4,
  /** No círculo central, de frente para a arquibancada principal: mão no peito. */
  heart: 7.8,
  /** O estádio explode (placas piscam, flashes, ola). */
  roar: 8.4,
  /** Beija o escudo. */
  kiss: 10.4,
  /** Acena girando devagar para cada lado do estádio. */
  wave: 12.0,
  waveEnd: 14.6,
  /** Aponta para o céu; entra o "Obrigado". */
  sky: 14.8,
  title: 15.2,
} as const;

/** Fim do filme: depois disso, o cartão final (a cena continua respirando atrás). */
export const FAREWELL_DURATION = 19;

/** Onde as coisas acontecem (mundo do estádio de botão: campo 300 × 460, centro na origem). */
export const FAREWELL_PLACES = {
  /** Boca do túnel, na lateral, na linha do meio-campo. */
  tunnel: { x: 196, z: 0 },
  /** O círculo central. */
  center: { x: 0, z: 0 },
  /** Corredor: de x = 166 até x = 62, duas filas a ±26 do caminho. */
  corridorFrom: 166,
  corridorTo: 62,
  corridorHalf: 26,
} as const;

// ---------------------------------------------------------------- semente

function hashString(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------------- textos

/** Linha de números da carreira pelo clube, na ordem em que a TV mostra. */
export function farewellStatLine(stats: FarewellStats): Array<{ value: number; label: string }> {
  const items = [
    { value: stats.seasons, label: stats.seasons === 1 ? "temporada" : "temporadas" },
    { value: stats.appearances, label: stats.appearances === 1 ? "jogo" : "jogos" },
    stats.keeper
      ? { value: stats.cleanSheets, label: stats.cleanSheets === 1 ? "jogo sem sofrer gol" : "jogos sem sofrer gol" }
      : { value: stats.goals, label: stats.goals === 1 ? "gol" : "gols" },
    { value: stats.titles, label: stats.titles === 1 ? "título" : "títulos" },
  ];
  return items;
}

export type FarewellTimeline = {
  input: FarewellInput;
  seed: number;
  duration: number;
  beats: FarewellBeat[];
  kitPattern: number;
  /** "Obrigado, Fulano" (a TV põe em maiúsculas pelo CSS). */
  thanks: string;
  /** Linha de cima do título e o que vai na placa de LED. */
  kicker: string;
  sub: string;
  board: string;
  stats: Array<{ value: number; label: string }>;
};

export function buildFarewellTimeline(input: FarewellInput): FarewellTimeline {
  const seed = hashString(`${input.player.name}|${input.club.id}|${input.player.number}|${input.stats.to}|farewell`);
  const duration = FAREWELL_DURATION;
  const M = FAREWELL_MARKS;
  const beats: FarewellBeat[] = [
    { id: "night", start: 0, end: M.walkStart + 0.6 },
    { id: "corridor", start: M.walkStart + 0.6, end: M.heart - 0.2 },
    { id: "center", start: M.heart - 0.2, end: M.kiss - 0.2 },
    { id: "crest", start: M.kiss - 0.2, end: M.wave },
    { id: "salute", start: M.wave, end: M.sky },
    { id: "sky", start: M.sky, end: duration },
    { id: "end", start: duration, end: Infinity },
  ];
  const pattern = input.club.kitPattern ?? input.player.appearance.kitPattern ?? 1;
  const shortName = input.player.shortName || input.player.name;
  const years = input.stats.from === input.stats.to ? `${input.stats.from}` : `${input.stats.from}–${input.stats.to}`;
  return {
    input,
    seed,
    duration,
    beats,
    kitPattern: Math.max(0, Math.min(11, Math.round(pattern))),
    thanks: `Obrigado, ${shortName}`,
    kicker: input.kind === "retirement" ? `A ÚLTIMA NOITE · ${input.club.shortName.toLocaleUpperCase("pt-BR")}` : `DESPEDIDA · ${input.club.shortName.toLocaleUpperCase("pt-BR")}`,
    sub: `${years} · camisa ${input.player.number}`,
    board: `OBRIGADO, ${shortName.toLocaleUpperCase("pt-BR")} ★ ${input.player.number} ★`,
    stats: farewellStatLine(input.stats),
  };
}

export function farewellBeatAt(timeline: FarewellTimeline, time: number): FarewellBeat {
  for (const beat of timeline.beats) if (time < beat.end) return beat;
  return timeline.beats[timeline.beats.length - 1];
}

/** Tarja de abertura (nome, anos no clube). */
export const farewellLowerAt = (time: number) => time >= 0.9 && time < 4.6;
/** Números da carreira pelo clube, um de cada vez, durante o corredor e o círculo. */
export const farewellStatsAt = (time: number) => time >= 5.0 && time < 12.2;
/** Qual número está na tela (0..3) e há quanto tempo (para a entrada). */
export function farewellStatIndex(time: number) {
  if (!farewellStatsAt(time)) return -1;
  return Math.min(3, Math.floor((time - 5.0) / 1.8));
}
/** "Obrigado" na tela? */
export const farewellTitleAt = (time: number, duration: number) => time >= FAREWELL_MARKS.title && time < duration;

/**
 * Quanto o estádio está fazendo barulho (0..1) no instante: sobe com o túnel,
 * explode no círculo central, fica no alto até o fim. Som e luz leem isto.
 */
export function crowdLevel(time: number) {
  const M = FAREWELL_MARKS;
  if (time < M.walkStart) return 0.35 + 0.15 * (time / M.walkStart);
  if (time < M.roar) return 0.5 + 0.2 * ((time - M.walkStart) / (M.roar - M.walkStart));
  if (time < M.roar + 0.6) return 0.7 + 0.2 * ((time - M.roar) / 0.6);
  if (time < M.sky) return 0.9;
  if (time < FAREWELL_DURATION) return 1;
  return 0.55;
}

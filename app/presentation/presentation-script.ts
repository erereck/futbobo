// Roteiro da apresentação do reforço: o jogador chega ao clube, recebe a
// camisa com o nome e o número e a mostra para os fotógrafos.
//
// Tudo é função do relógio (segundos): o palco 3D, a versão 2D, o som e a
// camada de TV leem as mesmas marcas daqui. "Pular" e "Rever" são saltos do
// relógio e cada camada se acerta sozinha no instante novo. Os flashes também
// são do roteiro (sorteados uma vez por apresentação), para a luz do palco,
// o clarão da tela e o clique do obturador baterem juntos.

import { DEFAULT_PLAYER_APPEARANCE, type PlayerAppearance } from "../player-appearance";

export type SigningPresentationInput = {
  player: { name: string; shortName: string; number: number; appearance: PlayerAppearance };
  club: {
    id: string;
    name: string;
    shortName: string;
    abbr: string;
    primary: string;
    secondary: string;
    /** Escudo (URL de imagem da mesma origem); sem ele, um escudo com a sigla. */
    badge?: string;
    city?: string;
    /** Estampa da camisa do clube (`teamKitPattern(seed, clubId)`); sem ela, a do visual do jogador. */
    kitPattern?: number;
  };
  origin: "peneira" | "transfer";
};

export type PresentationBeatId = "arrive" | "handover" | "reveal" | "pride" | "end";

export type PresentationBeat = { id: PresentationBeatId; start: number; end: number };

/**
 * Marcas do roteiro (s). O palco 3D e o 2D encenam em cima delas; nenhum dos
 * dois inventa tempo próprio.
 */
export const MARKS = {
  /** Ele entra andando pela frente do painel. */
  walkStart: 0.15,
  walkEnd: 2.45,
  /** O diretor estende a camisa; as mãos do jogador chegam nela; a camisa passa. */
  offer: 2.95,
  reach: 3.2,
  handoff: 3.55,
  handoffEnd: 4.0,
  /** O diretor solta e o jogador traz a camisa para junto do corpo. */
  release: 3.95,
  pull: 4.15,
  pullEnd: 4.7,
  /** Vira para as câmeras (o corte para a frente vem junto) e ergue a camisa. */
  turn: 5.2,
  cut: 5.25,
  raise: 5.7,
  /** Tempestade de flashes. */
  storm: 5.95,
  /** O diretor põe a mão no ombro dele para a foto, e solta antes da festa. */
  shoulder: 6.05,
  shoulderOff: 8.55,
  /** Festa: pula com a camisa no alto; entra o "Bem-vindo". */
  cheer: 8.8,
  title: 9.05,
} as const;

/** Fim do filme: depois disso, o cartão final (a cena continua respirando atrás). */
export const PRESENTATION_DURATION = 12.2;

// ------------------------------------------------------------- flashes

/** Fotógrafos de verdade no set (0..PHOTOGRAPHERS-1) e flashes de fundo da imprensa. */
export const PHOTOGRAPHERS = 8;
export const FAR_FLASHES = 10;
export const FLASH_UNITS = PHOTOGRAPHERS + FAR_FLASHES;
/** Depois do fim, os flashes se repetem num laço desse tamanho (atrás do cartão final). */
const FLASH_LOOP = 6;
/** Meia-vida visual de um flash (s): ~3 quadros a 60 Hz. */
export const FLASH_DECAY = 0.045;
/** Com movimento reduzido o flash é mais longo e bem mais fraco (sem piscar forte). */
export const FLASH_DECAY_CALM = 0.14;

export type FlashSchedule = {
  /** Instantes de disparo de cada unidade, em ordem. */
  times: Float64Array[];
  /** Todos os disparos (ordenados) e a unidade de cada um: o som toca um clique por disparo. */
  all: Float64Array;
  unitOf: Uint8Array;
};

function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Disparos por segundo (todas as unidades juntas) em cada trecho. */
function flashRate(time: number) {
  if (time < 0.6) return 0;
  if (time < MARKS.storm) return time < MARKS.turn ? 1.1 : 2.4;
  if (time < MARKS.cheer) return 13 - 4 * Math.min(1, (time - MARKS.storm) / 2.8);
  if (time < PRESENTATION_DURATION) return 7.5;
  return 1.6;
}

function buildFlashes(seed: number): FlashSchedule {
  const random = seededRandom(seed ^ 0xf1a5);
  const events: Array<[number, number]> = [];
  const pickUnit = () => (random() < 0.72 ? Math.floor(random() * PHOTOGRAPHERS) : PHOTOGRAPHERS + Math.floor(random() * FAR_FLASHES));
  // Processo de Poisson com taxa variável (afinamento): taxa máxima 13/s.
  const end = PRESENTATION_DURATION + FLASH_LOOP;
  for (let time = 0; time < end; ) {
    time += -Math.log(1 - random()) / 13;
    if (time >= end) break;
    if (random() * 13 < flashRate(time)) events.push([time, pickUnit()]);
  }
  // A camisa sobe: meia dúzia de fotógrafos dispara junto.
  for (let index = 0; index < 6; index += 1) events.push([MARKS.storm + 0.03 + index * 0.028 + random() * 0.02, index % PHOTOGRAPHERS]);
  for (let index = 0; index < 4; index += 1) events.push([MARKS.cheer + 0.05 + index * 0.05, (index * 3 + 1) % PHOTOGRAPHERS]);
  events.sort((a, b) => a[0] - b[0]);
  // Uma unidade não dispara duas vezes em menos de 0,25 s (o flash de verdade recarrega).
  const last = new Float64Array(FLASH_UNITS).fill(-1);
  const kept: Array<[number, number]> = [];
  for (const event of events) {
    if (event[0] - last[event[1]] < 0.25) continue;
    last[event[1]] = event[0];
    kept.push(event);
  }
  const perUnit: number[][] = Array.from({ length: FLASH_UNITS }, () => []);
  for (const [time, unit] of kept) perUnit[unit].push(time);
  return {
    times: perUnit.map((list) => Float64Array.from(list)),
    all: Float64Array.from(kept.map((event) => event[0])),
    unitOf: Uint8Array.from(kept.map((event) => event[1])),
  };
}

/** O relógio dos flashes: depois do fim, o laço de fundo se repete. */
export function flashClock(time: number) {
  if (time < PRESENTATION_DURATION + FLASH_LOOP) return time;
  return PRESENTATION_DURATION + ((time - PRESENTATION_DURATION) % FLASH_LOOP);
}

/** Último disparo ≤ t (busca binária: vale depois de qualquer salto). */
function lastBefore(times: Float64Array, time: number) {
  let low = 0;
  let high = times.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (times[middle] <= time) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found < 0 ? -Infinity : times[found];
}

/** Brilho (0..1) da unidade no instante. */
export function flashBrightness(schedule: FlashSchedule, unit: number, time: number, calm: boolean) {
  const clock = flashClock(time);
  const age = clock - lastBefore(schedule.times[unit], clock);
  const decay = calm ? FLASH_DECAY_CALM : FLASH_DECAY;
  if (!(age >= 0) || age > decay * 6) return 0;
  return calm ? 0.35 * Math.exp(-age / decay) : Math.exp(-age / decay);
}

/** Clarão total (fotógrafos pesam mais que a imprensa ao fundo), para a luz e o branco da tela. */
export function flashLevel(schedule: FlashSchedule, time: number, calm: boolean) {
  let total = 0;
  for (let unit = 0; unit < FLASH_UNITS; unit += 1) total += flashBrightness(schedule, unit, time, calm) * (unit < PHOTOGRAPHERS ? 1 : 0.3);
  return Math.min(1.6, total);
}

// -------------------------------------------------------------- textos

/** Clubes que pedem "à" ("bem-vindo à Chapecoense"); o resto leva "ao". */
const FEMININE_CLUBS = new Set([
  "chapecoense", "ponte preta", "portuguesa", "ferroviaria", "caldense", "inter de limeira", "juventus", "roma", "lazio",
  "fiorentina", "atalanta", "sampdoria", "udinese", "salernitana", "cremonese", "real sociedad", "lusa", "academica",
  "cabofriense", "aparecidense", "anapolina", "francana", "matonense", "portuguesa santista", "desportiva", "tuna luso",
]);

function plain(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Artigo do clube: "o Flamengo", "a Chapecoense". */
export function clubArticle(clubShortName: string): "o" | "a" {
  return FEMININE_CLUBS.has(plain(clubShortName)) ? "a" : "o";
}

/** "Bem-vindo ao Flamengo" / "Bem-vindo à Chapecoense". */
export function welcomePhrase(clubShortName: string) {
  return `Bem-vindo ${clubArticle(clubShortName) === "a" ? "à" : "ao"} ${clubShortName}`;
}

// -------------------------------------------------------------- elenco

/** O diretor que entrega a camisa: de terno, mais velho, sorrindo (o rosto sai da semente). */
export function directorAppearance(seed: number): PlayerAppearance {
  const pick = (list: readonly number[], salt: number) => list[(seed + salt * 7919) % list.length];
  return {
    ...DEFAULT_PLAYER_APPEARANCE,
    skin: pick([0, 1, 2, 4, 6, 7], 1),
    hairColor: pick([7, 7, 1, 2, 11], 2),
    hairStyle: pick([0, 25, 29, 12], 3),
    beard: pick([0, 4, 7, 1], 4),
    face: 2,
    brow: pick([0, 1, 4], 5),
    eyeColor: pick([0, 1, 4], 6),
  };
}

/** Matiz (graus) de uma cor; -1 para cinza. */
function hue(hex: string) {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.08) return -1;
  const h = 60 * (max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min));
  return h < 0 ? h + 360 : h;
}

/**
 * Roupa de chegada. Peneira: o colete do treino (laranja; verde-limão se o
 * clube já for laranja), liso. Contratação: terno escuro sem gravata.
 */
export function arrivalOutfit(input: SigningPresentationInput) {
  if (input.origin === "peneira") {
    const clubHue = hue(input.club.primary);
    return { kind: "kit" as const, primary: clubHue >= 12 && clubHue <= 52 ? "#b8f23a" : "#ff7a1a", secondary: "#1d2027" };
  }
  return { kind: "suit" as const, primary: "#161b26", secondary: "#f6f4ef" };
}

// ------------------------------------------------------------- roteiro

export type PresentationTimeline = {
  input: SigningPresentationInput;
  seed: number;
  duration: number;
  beats: PresentationBeat[];
  flashes: FlashSchedule;
  /** Estampa da camisa do clube. */
  kitPattern: number;
  /** "Bem-vindo ao Flamengo" (o título da TV vai em maiúsculas pelo CSS). */
  welcome: string;
  /** Linha de cima do "Bem-vindo" (peneira ou contratação). */
  kicker: string;
  /** Linha de baixo do "Bem-vindo". */
  sub: string;
};

export function buildPresentationTimeline(input: SigningPresentationInput): PresentationTimeline {
  const seed = hashString(`${input.player.name}|${input.club.id}|${input.player.number}|${input.origin}`);
  const duration = PRESENTATION_DURATION;
  const beats: PresentationBeat[] = [
    { id: "arrive", start: 0, end: 2.75 },
    { id: "handover", start: 2.75, end: MARKS.cut },
    { id: "reveal", start: MARKS.cut, end: MARKS.cheer },
    { id: "pride", start: MARKS.cheer, end: duration },
    { id: "end", start: duration, end: Infinity },
  ];
  const peneira = input.origin === "peneira";
  const pattern = input.club.kitPattern ?? input.player.appearance.kitPattern ?? 1;
  return {
    input,
    seed,
    duration,
    beats,
    flashes: buildFlashes(seed),
    kitPattern: Math.max(0, Math.min(11, Math.round(pattern))),
    welcome: welcomePhrase(input.club.shortName),
    kicker: peneira ? "APROVADO NA PENEIRA" : "REFORÇO CONFIRMADO",
    sub: `${input.player.name} · camisa ${input.player.number}`,
  };
}

export function beatAt(timeline: PresentationTimeline, time: number): PresentationBeat {
  for (const beat of timeline.beats) if (time < beat.end) return beat;
  return timeline.beats[timeline.beats.length - 1];
}

/** Lower-third da chegada (nome e camisa) na tela? */
export const lowerThirdAt = (time: number) => time >= 0.7 && time < 2.75;
/** Título do "Bem-vindo" na tela? */
export const titleAt = (time: number, duration: number) => time >= MARKS.title && time < duration;

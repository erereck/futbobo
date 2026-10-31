// Sorteio de times do Bobonline: nome de várzea, cores, uniforme, escudo e cinco jogadores.
//
// Tudo sai de `createRng`/`hashSeed` (app/botao/rng.ts), então a mesma seed dá o
// mesmo time em qualquer aparelho: é assim que os times da CPU batem entre o
// anfitrião e os convidados. O id aleatório de um time do usuário vem de
// `crypto.getRandomValues` no clique (`newTeamId`) e entra aqui como parâmetro.

import { createRng, hashSeed, type Rng } from "../../botao/rng";
import { CELEBRATION_OPTIONS, KIT_PATTERN_NAMES, randomPlayerAppearance } from "../../player-appearance";
import { BOB_TEAM_VERSION, type BobCrestShape, type BobPlayer, type BobTeam } from "../types";
import { BOB_SQUAD_SIZE, LIMITS, deriveAbbr, deriveShortName, foldAccents, teamAppearance, teamIdFromBytes, teamIdFromSeed, textLength } from "./model";
import { BR_FIRST_NAMES, BR_SURNAMES, FUN_TEAM_NAMES, NAME_PREPOSITIONS, TEAM_PLACES, TEAM_PREFIXES } from "./team-names";

export { randomNickname } from "./model";

/** 20 pares com contraste bom: [principal, secundária]. */
export const TEAM_COLOR_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["#0b6b45", "#f4c542"], ["#c8102e", "#ffffff"], ["#1d3c8f", "#ffd200"], ["#111111", "#f2f2f2"],
  ["#6b2fa3", "#f5f7f2"], ["#f2f2ee", "#0a4d2a"], ["#ff7a1a", "#14213d"], ["#0e7c86", "#ffffff"],
  ["#7a1f2b", "#f4c542"], ["#14213d", "#e63946"], ["#ffd23f", "#1b3a6b"], ["#1e88e5", "#ffffff"],
  ["#2e7d32", "#ffffff"], ["#e63946", "#111111"], ["#f5f5f0", "#c8102e"], ["#00a86b", "#111111"],
  ["#ff4fa3", "#1c1f26"], ["#8b5cf6", "#fde047"], ["#0b1d51", "#9ad1ff"], ["#b5121b", "#1d3c8f"],
];

/** Camisa 10 para o primeiro; o resto sai daqui, sem repetir. */
export const SQUAD_NUMBERS = [1, 9, 7, 11, 8, 5, 4, 3, 2, 6, 13, 14, 17, 19, 20, 21, 23, 77, 88, 99] as const;

const PREPOSITIONS = new Set<string>(NAME_PREPOSITIONS);
const MAX_NAME_DRAWS = 20;
const FUN_NAME_CHANCE = 0.1;
const MAX_PLAYER_NAME_DRAWS = 5;

/** Palavras que importam para comparar prefixo e lugar (sem acento, minúsculas, Y vira I). */
function stemWords(text: string): string[] {
  return foldAccents(text)
    .toLowerCase()
    .replace(/y/g, "i")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !PREPOSITIONS.has(word));
}

/** Mesmo radical: 5 primeiras letras iguais, ou uma palavra começa com a outra ("Real" e "Realengo"). */
function sameStem(a: string, b: string): boolean {
  if (a.slice(0, 5) === b.slice(0, 5)) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/** Regras do sorteio (§2.5): nada de nome cortado, palavra repetida ou "de do". */
export function isGoodTeamName(prefix: string, place: string): boolean {
  if (textLength(`${prefix} ${place}`) > LIMITS.teamName[1]) return false;
  const prefixWords = stemWords(prefix);
  const placeWords = stemWords(place);
  if (prefixWords.some((a) => placeWords.some((b) => sameStem(a, b)))) return false;
  const lastOfPrefix = prefix.trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";
  const firstOfPlace = place.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (["de", "da", "do"].includes(lastOfPrefix) && ["de", "da", "do", "dos", "das"].includes(firstOfPlace)) return false;
  return true;
}

function drawTeamName(rng: Rng): string {
  if (rng.chance(FUN_NAME_CHANCE)) return rng.pick(FUN_TEAM_NAMES);
  for (let draw = 0; draw < MAX_NAME_DRAWS; draw += 1) {
    const prefix = rng.pick(TEAM_PREFIXES);
    const place = rng.pick(TEAM_PLACES);
    if (isGoodTeamName(prefix, place)) return `${prefix} ${place}`;
  }
  return rng.pick(FUN_TEAM_NAMES);
}

function drawPlayerName(rng: Rng): string {
  let first = "";
  let surname = "";
  for (let draw = 0; draw < MAX_PLAYER_NAME_DRAWS; draw += 1) {
    first = rng.pick(BR_FIRST_NAMES);
    surname = rng.pick(BR_SURNAMES);
    if (textLength(`${first} ${surname}`) <= LIMITS.playerName[1]) return `${first} ${surname}`;
  }
  return `${first} ${surname[0]}.`;
}

function drawNumber(rng: Rng, index: number, taken: readonly number[]): number {
  if (index === 0 && !taken.includes(10)) return 10;
  const free = SQUAD_NUMBERS.filter((number) => !taken.includes(number));
  if (free.length > 0) return rng.pick(free);
  for (let number = 1; number <= 99; number += 1) if (!taken.includes(number)) return number;
  return 99;
}

/**
 * Um jogador sorteado: nome brasileiro, número livre, rosto e comemoração (inclusive
 * "Variada" e as novas, para elas aparecerem sem o usuário fazer nada).
 */
export function randomBobPlayer(seed: number, index: number, taken: number[], kitPattern = 1): BobPlayer {
  const rng = createRng(hashSeed(seed, "jogador", index));
  const name = drawPlayerName(rng);
  const number = drawNumber(rng, index, taken);
  const celebration = rng.int(0, CELEBRATION_OPTIONS.length - 1);
  const face = randomPlayerAppearance(hashSeed(seed, "face", index));
  return {
    id: `p${index}`,
    name,
    number,
    appearance: teamAppearance({ ...face, celebration }, kitPattern),
  };
}

/**
 * Time inteiro, determinístico por seed. `id`/`now` vêm de fora (clique do usuário);
 * sem eles o id sai da seed e as datas ficam em 0 (times da CPU, testes).
 */
export function randomBobTeam(seed: number, extras: { id?: string; now?: number } = {}): BobTeam {
  const rng = createRng(hashSeed(seed, "time"));
  const name = drawTeamName(rng);
  const [primary, secondary] = rng.pick(TEAM_COLOR_PAIRS);
  const kitPattern = rng.int(0, KIT_PATTERN_NAMES.length - 1);
  const crest = rng.int(0, 3) as BobCrestShape;
  const players: BobPlayer[] = [];
  for (let index = 0; index < BOB_SQUAD_SIZE; index += 1) {
    players.push(randomBobPlayer(seed, index, players.map((player) => player.number), kitPattern));
  }
  const now = extras.now ?? 0;
  return {
    version: BOB_TEAM_VERSION,
    id: extras.id ?? teamIdFromSeed(seed, "time"),
    name,
    shortName: deriveShortName(name),
    abbr: deriveAbbr(name),
    primary,
    secondary,
    kitPattern,
    crest,
    players,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Time da CPU de uma vaga: o mesmo em todos os aparelhos. SEM sufixo no nome (a interface põe o selo CPU).
 * `taken` = nomes curtos já na chave (minúsculos): repetido, sorteia de novo (até 8 vezes) para não ter "Madureira × Madureira".
 */
export function cpuTeamFor(roomSeed: number, slot: number, taken?: ReadonlySet<string>): BobTeam {
  let team = randomBobTeam(hashSeed(roomSeed, "cpu", slot));
  for (let attempt = 1; attempt < 8 && taken?.has(team.shortName.toLocaleLowerCase("pt-BR")); attempt += 1) {
    team = randomBobTeam(hashSeed(roomSeed, "cpu", slot, attempt));
  }
  return team;
}

/** Id novo de verdade ("bob-" + 10). Chamar só em evento (clique, importação), nunca no render. */
export function newTeamId(): string {
  const bytes = new Uint8Array(10);
  try {
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  return teamIdFromBytes(bytes);
}

/** Seed nova para um sorteio feito pelo usuário. Também só em evento. */
export function newSeed(): number {
  const bytes = new Uint32Array(1);
  try {
    globalThis.crypto.getRandomValues(bytes);
    return bytes[0] || 1;
  } catch {
    return Math.floor(Math.random() * 4294967295) + 1;
  }
}

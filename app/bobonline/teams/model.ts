// Modelo do time do Bobonline: saneamento, validação para o editor e hash.
//
// `sanitizeTeam` é tudo ou nada de propósito: o anfitrião roda ele em todo time
// que chega pela rede e nunca pode aceitar meio time. O editor, por isso, valida
// campo a campo (`validateTeamDraft`) e só grava rascunho que passa nos dois.
// Nada aqui importa a carreira nem `game-data.ts` (orçamento do bundle, §11.6).

import { createRng, hashSeed } from "../../botao/rng";
import { KIT_PATTERN_NAMES, normalizePlayerAppearance, type PlayerAppearance } from "../../player-appearance";
import { BOB_TEAM_VERSION, type BobCrestShape, type BobPlayer, type BobTeam } from "../types";
import { DEFAULT_NICKNAMES, NAME_PREPOSITIONS, TEAM_PREFIXES } from "./team-names";

export const LIMITS = { teamName: [2, 24], shortName: [2, 14], abbr: [2, 4], playerName: [2, 18], nickname: [2, 16], teamJsonChars: 6000 } as const;

export const BOB_SQUAD_SIZE = 5;
export const DEFAULT_PRIMARY = "#0b6b45";
export const DEFAULT_SECONDARY = "#f4c542";
export const CREST_SHAPE_COUNT = 4;

/** Ordem em que números repetidos (ou inválidos) ganham camisa nova. */
const FREE_NUMBER_POOL = [1, 10, 9, 8, 7, 11, 6, 4, 5, 3, 2, ...Array.from({ length: 88 }, (_, index) => index + 12)];
const TEAM_ID_PATTERN = /^bob-[a-z0-9]{10}$/;
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
// Espaços invisíveis viram espaço; controles, setas de direção (bidi) e "<>" somem.
const INVISIBLE_SPACES = /[\s\u00a0\u2028\u2029]+/g;
const STRIP_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff<>]/g;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PREPOSITIONS = new Set<string>(NAME_PREPOSITIONS);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tira metades de emoji soltas (surrogates sem par), que quebram o JSON de outro aparelho. */
function dropLoneSurrogates(text: string): string {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[index] + text[index + 1];
        index += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    out += text[index];
  }
  return out;
}

/** Quantidade de letras de verdade (um emoji conta 1). */
export function textLength(text: string): number {
  return Array.from(text).length;
}

/** Trim, NFC, sem controles nem "<>", espaços colapsados, cortado no máximo (por letra, sem partir emoji). */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const text = dropLoneSurrogates(raw.normalize("NFC"))
    .replace(INVISIBLE_SPACES, " ")
    .replace(STRIP_CHARS, "")
    .replace(/ {2,}/g, " ")
    .trim();
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join("").trim() : text;
}

/** Sem acento, para comparar e para a sigla ("Grêmio" → "Gremio"). */
export function foldAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Sigla crua: maiúsculas, só [A-Z0-9], no máximo 4 (acentos dobrados antes: "São" → "SAO"). */
export function abbrChars(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return foldAccents(raw).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, LIMITS.abbr[1]);
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

function hexColor(raw: unknown, fallback: string): string {
  return typeof raw === "string" && COLOR_PATTERN.test(raw) ? raw.toLowerCase() : fallback;
}

/** Palavras do nome sem acento e em maiúsculas, sem preposições. */
function meaningfulWords(name: string): string[] {
  return foldAccents(name)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word && !PREPOSITIONS.has(word.toLowerCase()));
}

/**
 * Sigla automática: iniciais (3+ palavras), inicial + duas letras do lugar (2 palavras;
 * "Bobo FC" vira "BFC") ou as três primeiras letras (uma palavra).
 */
export function deriveAbbr(name: string): string {
  const words = meaningfulWords(name);
  let abbr = "";
  if (words.length === 1) abbr = words[0].slice(0, 3);
  else if (words.length === 2) abbr = words[1].length <= 3 ? words[0][0] + words[1] : words[0][0] + words[1].slice(0, 2);
  else if (words.length > 2) abbr = words.slice(0, LIMITS.abbr[1]).map((word) => word[0]).join("");
  abbr = abbr.slice(0, LIMITS.abbr[1]);
  return abbr.length >= LIMITS.abbr[0] ? abbr : "BOB";
}

const SHORT_NAME_FILLERS = new Set(["fc", "ec", "sc", "ac", "clube", "club", "futebol", "esporte", "sport", "sociedade", "esportiva", "associacao", "atletico", "unidos"]);
const PREFIX_WORDS = [...TEAM_PREFIXES]
  .map((prefix) => foldAccents(prefix).toLowerCase().split(" "))
  .sort((a, b) => b.length - a.length);

function trimEdgePrepositions(words: string[]): string[] {
  let start = 0;
  let end = words.length;
  while (start < end && PREPOSITIONS.has(foldAccents(words[start]).toLowerCase())) start += 1;
  while (end > start && PREPOSITIONS.has(foldAccents(words[end - 1]).toLowerCase())) end -= 1;
  return words.slice(start, end);
}

function fitsShort(words: string[]): boolean {
  const length = textLength(words.join(" "));
  return length >= LIMITS.shortName[0] && length <= LIMITS.shortName[1];
}

/** Nome curto do placar: o lugar ("Esporte Clube Vila Nova" → "Vila Nova") ou a última palavra que importa. */
export function deriveShortName(name: string): string {
  const clean = cleanText(name, LIMITS.teamName[1]);
  const words = clean.split(" ").filter(Boolean);
  const folded = words.map((word) => foldAccents(word).toLowerCase());
  const max = LIMITS.shortName[1];
  for (const prefix of PREFIX_WORDS) {
    if (prefix.length >= words.length || !prefix.every((word, index) => folded[index] === word)) continue;
    const place = trimEdgePrepositions(words.slice(prefix.length));
    if (fitsShort(place)) return place.join(" ");
    break;
  }
  if (textLength(clean) <= max) return clean;
  const core = trimEdgePrepositions(words.filter((word) => !SHORT_NAME_FILLERS.has(foldAccents(word).toLowerCase())));
  if (fitsShort(core)) return core.join(" ");
  const tail: string[] = [];
  for (let index = core.length - 1; index >= 0; index -= 1) {
    if (textLength([core[index], ...tail].join(" ")) > max) break;
    tail.unshift(core[index]);
  }
  const picked = trimEdgePrepositions(tail);
  if (fitsShort(picked)) return picked.join(" ");
  const last = core.at(-1) ?? clean;
  return Array.from(last).slice(0, max).join("").trim() || Array.from(clean).slice(0, max).join("").trim();
}

/** Apelido padrão sorteado da lista divertida. */
export function randomNickname(seed: number): string {
  const rng = createRng(hashSeed(seed, "apelido"));
  return DEFAULT_NICKNAMES[rng.int(0, DEFAULT_NICKNAMES.length - 1)];
}

/** Apelido limpo ou null quando fica curto demais. */
export function cleanNickname(raw: unknown): string | null {
  const nickname = cleanText(raw, LIMITS.nickname[1]);
  return textLength(nickname) >= LIMITS.nickname[0] ? nickname : null;
}

/** Inválido → randomNickname(fallbackSeed). */
export function sanitizeNickname(raw: unknown, fallbackSeed: number): string {
  return cleanNickname(raw) ?? randomNickname(fallbackSeed);
}

/** "bob-" + 10 letras de um alfabeto sem 0/1/l/o. `bytes` vem de crypto.getRandomValues (ou do teste). */
export function teamIdFromBytes(bytes: ArrayLike<number>): string {
  let id = "bob-";
  for (let index = 0; index < 10; index += 1) id += ID_ALPHABET[(bytes[index] ?? 0) % ID_ALPHABET.length];
  return id;
}

/** Id determinístico (time da CPU, time recebido com id quebrado): os aparelhos chegam no mesmo. */
export function teamIdFromSeed(...parts: Array<string | number>): string {
  const rng = createRng(hashSeed("bob-id", ...parts));
  return teamIdFromBytes(Array.from({ length: 10 }, () => rng.int(0, 255)));
}

export function isTeamId(value: unknown): value is string {
  return typeof value === "string" && TEAM_ID_PATTERN.test(value);
}

/** Aparência normalizada, com a estampa do time e sem chaves vazias (o hash e o JSON ficam estáveis). */
export function teamAppearance(raw: unknown, kitPattern: number): PlayerAppearance {
  const normalized: PlayerAppearance = { ...normalizePlayerAppearance(isRecord(raw) ? (raw as Partial<PlayerAppearance>) : null), kitPattern };
  const clean = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(normalized)) if (value !== undefined) clean[key] = value;
  return clean as PlayerAppearance;
}

function sanitizePlayers(raw: unknown, kitPattern: number): BobPlayer[] | null {
  if (!Array.isArray(raw) || raw.length < BOB_SQUAD_SIZE) return null;
  const entries = raw.slice(0, BOB_SQUAD_SIZE);
  if (!entries.every(isRecord)) return null;
  const names = entries.map((player) => cleanText(player.name, LIMITS.playerName[1]));
  if (names.some((name) => textLength(name) < LIMITS.playerName[0])) return null;
  // Primeiro quem chegou com número válido e único; os repetidos pegam a próxima camisa livre.
  const wanted = entries.map((player) => (typeof player.number === "number" && Number.isFinite(player.number) ? clampInt(player.number, 1, 99, 1) : null));
  const used = new Set<number>();
  const numbers = wanted.map((number) => {
    if (number === null || used.has(number)) return null;
    used.add(number);
    return number;
  });
  const pool = FREE_NUMBER_POOL.filter((number) => !used.has(number));
  return entries.map((player, index) => ({
    id: `p${index}`,
    name: names[index],
    number: numbers[index] ?? (pool.shift() as number),
    appearance: teamAppearance(player.appearance, kitPattern),
  }));
}

/** Aceita lixo e devolve um time válido (sem chaves desconhecidas) ou null. */
export function sanitizeTeam(raw: unknown): BobTeam | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.version === "number" && raw.version > BOB_TEAM_VERSION) return null;
  const name = cleanText(raw.name, LIMITS.teamName[1]);
  const shortName = cleanText(raw.shortName, LIMITS.shortName[1]);
  if (textLength(name) < LIMITS.teamName[0] || textLength(shortName) < LIMITS.shortName[0]) return null;
  const typedAbbr = abbrChars(raw.abbr);
  const abbr = typedAbbr.length >= LIMITS.abbr[0] ? typedAbbr : deriveAbbr(name);
  const kitPattern = clampInt(raw.kitPattern, 0, KIT_PATTERN_NAMES.length - 1, 0);
  const crest = clampInt(raw.crest, 0, CREST_SHAPE_COUNT - 1, 0) as BobCrestShape;
  const players = sanitizePlayers(raw.players, kitPattern);
  if (!players) return null;
  const team: BobTeam = {
    version: BOB_TEAM_VERSION,
    id: isTeamId(raw.id) ? raw.id : teamIdFromSeed(typeof raw.id === "string" ? raw.id.slice(0, 64) : "", name),
    name,
    shortName,
    abbr,
    primary: hexColor(raw.primary, DEFAULT_PRIMARY),
    secondary: hexColor(raw.secondary, DEFAULT_SECONDARY),
    kitPattern,
    crest,
    players,
    createdAt: clampInt(raw.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    updatedAt: clampInt(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
  return JSON.stringify(team).length <= LIMITS.teamJsonChars ? team : null;
}

/** JSON canônico: chaves ordenadas, `undefined` fora (o mesmo texto em qualquer aparelho). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** FNV-1a de 32 bits em 8 hex (o mesmo hash de app/botao/rng.ts). */
export function fnv8(text: string): string {
  return hashSeed(text).toString(16).padStart(8, "0");
}

/** FNV-1a 8 hex do JSON canônico: a chave do time em RoomTeams. */
export function teamHash(team: BobTeam): string {
  return fnv8(canonicalJson(team));
}

export type TeamDraftIssue = { field: string; message: string };

/**
 * Erros do rascunho, na ordem da tela (mensagens pt-BR prontas para mostrar no campo).
 * Campos: "name", "shortName", "abbr", "players.<i>.name", "players.<i>.number".
 */
export function validateTeamDraft(draft: BobTeam): TeamDraftIssue[] {
  const issues: TeamDraftIssue[] = [];
  const minLetters = (min: number) => `Mínimo ${min} letras`;
  if (textLength(cleanText(draft.name, LIMITS.teamName[1])) < LIMITS.teamName[0]) issues.push({ field: "name", message: minLetters(LIMITS.teamName[0]) });
  if (textLength(cleanText(draft.shortName, LIMITS.shortName[1])) < LIMITS.shortName[0]) issues.push({ field: "shortName", message: minLetters(LIMITS.shortName[0]) });
  const abbr = abbrChars(draft.abbr);
  const rawAbbr = typeof draft.abbr === "string" ? foldAccents(draft.abbr).toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (abbr.length < LIMITS.abbr[0] || rawAbbr.length > LIMITS.abbr[1]) issues.push({ field: "abbr", message: "Use de 2 a 4 letras ou números" });
  const players = Array.isArray(draft.players) ? draft.players : [];
  const owners = new Map<number, string>();
  players.forEach((player, index) => {
    const name = cleanText(player?.name, LIMITS.playerName[1]);
    if (textLength(name) < LIMITS.playerName[0]) issues.push({ field: `players.${index}.name`, message: minLetters(LIMITS.playerName[0]) });
    const number = player?.number;
    if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > 99) {
      issues.push({ field: `players.${index}.number`, message: "Use um número de 1 a 99" });
      return;
    }
    const owner = owners.get(number);
    if (owner !== undefined) issues.push({ field: `players.${index}.number`, message: `Número já usado por ${owner}` });
    else owners.set(number, name || `#${number}`);
  });
  if (players.length !== BOB_SQUAD_SIZE) issues.push({ field: "players", message: "O time precisa de 5 jogadores" });
  return issues;
}

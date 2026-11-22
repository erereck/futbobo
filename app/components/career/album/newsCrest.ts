import { CLUBS, COUNTRIES } from "../../../game-data";
import type { Club, Country } from "../../../game-data";

// Mesma ordem de antes: nomes mais longos primeiro (o "Atlético Mineiro" vence o "Atlético").
const CLUB_NAMES = [...CLUBS]
  .filter((club) => club.shortName.length >= 3)
  .sort((a, b) => b.shortName.length - a.shortName.length)
  .map((club) => ({ club, name: club.shortName }));

const COUNTRY_NAMES = [...COUNTRIES]
  .sort((a, b) => b.name.length - a.name.length)
  .map((country) => ({ country, name: country.name }));

const LETTER = /\p{L}/u;

/** O caractere (ponto de código inteiro) que termina logo antes de `index`, e onde ele começa. */
function charBefore(text: string, index: number): { char: string; start: number } {
  const low = text.charCodeAt(index - 1);
  if (index >= 2 && low >= 0xdc00 && low <= 0xdfff) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return { char: text.slice(index - 2, index), start: index - 2 };
  }
  return { char: text[index - 1], start: index - 1 };
}

function charAt(text: string, index: number) {
  return String.fromCodePoint(text.codePointAt(index) ?? 0);
}

const isBoundary = (char: string, hyphen: boolean) => !LETTER.test(char) && !(hyphen && char === "-");

/**
 * Onde o nome aparece como palavra inteira (sem letra, nem hífen nos clubes, colada antes ou depois).
 * Devolve a mesma posição que o antigo `RegExp("(^|[^\p{L}-])Nome($|[^\p{L}-])", "u").exec()` dava em
 * `match.index` (o início do separador, ou 0 no começo do texto), ou -1. Sem montar ~1.000 regex Unicode.
 */
function boundedIndex(text: string, name: string, hyphen: boolean) {
  let from = 0;
  while (from <= text.length - name.length) {
    const at = text.indexOf(name, from);
    if (at < 0) return -1;
    const end = at + name.length;
    const before = at === 0 ? null : charBefore(text, at);
    const okBefore = !before || isBoundary(before.char, hyphen);
    const okAfter = end >= text.length || isBoundary(charAt(text, end), hyphen);
    if (okBefore && okAfter) return before ? before.start : 0;
    from = at + 1;
  }
  return -1;
}

// As manchetes se repetem a cada render (aba Carreira, aba Mundo): cada uma é resolvida uma vez só.
const CACHE_LIMIT = 400;
const cache = new Map<string, { club?: Club; country?: Country }>();

function resolveCrest(title: string): { club?: Club; country?: Country } {
  let found: { club: Club; index: number } | null = null;
  for (const { club, name } of CLUB_NAMES) {
    if (name.length > title.length) continue;
    const index = boundedIndex(title, name, true);
    if (index >= 0 && (!found || index < found.index)) found = { club, index };
  }
  if (found) return { club: found.club };
  const country = COUNTRY_NAMES.find(({ name }) => name.length <= title.length && boundedIndex(title, name, false) >= 0)?.country;
  return country ? { country } : {};
}

/** A manchete não diz de quem é: o escudo sai do primeiro clube (ou seleção) citado no texto. */
export function crestForHeadline(title: string): { club?: Club; country?: Country } {
  const cached = cache.get(title);
  if (cached) return cached;
  const crest = resolveCrest(title);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(title, crest);
  return crest;
}

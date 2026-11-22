import { CLUBS, COUNTRIES } from "../game-data";
import { worldClubRevision } from "./world-memo";

/**
 * Busca de clube/seleção pelo nome escrito nas tabelas de títulos históricos ("Al Ahly", "PSV").
 *
 * Antes cada rótulo normalizava o nome, o nome curto e a sigla dos ~1.000 clubes (NFD, regex e
 * `toLocaleLowerCase`): perto de um milhão de normalizações ao montar o arquivo do Mundo, o maior
 * custo da aba num celular antigo. Agora cada texto é normalizado uma vez e a busca é num índice.
 * O resultado é o mesmo do `find` antigo: o primeiro clube (na ordem de CLUBS) com nome, nome
 * curto ou sigla igual ao rótulo normalizado.
 */
const normalizedCache = new Map<string, string>();

export function normalizedLabel(value: string) {
  let result = normalizedCache.get(value);
  if (result === undefined) {
    result = value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    normalizedCache.set(value, result);
  }
  return result;
}

function firstMatchIndex<T extends { id: string }>(items: readonly T[], fields: (item: T) => string[]) {
  const index = new Map<string, string>();
  for (const item of items) {
    for (const field of fields(item)) {
      const key = normalizedLabel(field);
      if (!index.has(key)) index.set(key, item.id);
    }
  }
  return index;
}

let clubIndex: Map<string, string> | null = null;
let clubIndexKey = "";

/** Clubes entram (segunda divisão) ou mudam de nome (clubes personalizados): o índice é refeito. */
export function resolveClubIdByLabel(label: string) {
  const key = `${CLUBS.length}:${worldClubRevision()}`;
  if (!clubIndex || clubIndexKey !== key) {
    clubIndex = firstMatchIndex(CLUBS, (club) => [club.name, club.shortName, club.abbr]);
    clubIndexKey = key;
  }
  return clubIndex.get(normalizedLabel(label)) ?? "";
}

let countryIndex: Map<string, string> | null = null;
let countryIndexSize = -1;

export function resolveCountryIdByLabel(label: string) {
  if (!countryIndex || countryIndexSize !== COUNTRIES.length) {
    countryIndex = firstMatchIndex(COUNTRIES, (country) => [country.id, country.name, country.abbr]);
    countryIndexSize = COUNTRIES.length;
  }
  return countryIndex.get(normalizedLabel(label)) ?? "";
}

import { CLUBS, COUNTRIES } from "../../../game-data";
import type { Club, Country } from "../../../game-data";

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CLUB_MATCHERS = [...CLUBS]
  .filter((club) => club.shortName.length >= 3)
  .sort((a, b) => b.shortName.length - a.shortName.length)
  .map((club) => ({ club, re: new RegExp(`(^|[^\\p{L}\\-])${escape(club.shortName)}($|[^\\p{L}\\-])`, "u") }));

const COUNTRY_MATCHERS = [...COUNTRIES]
  .sort((a, b) => b.name.length - a.name.length)
  .map((country) => ({ country, re: new RegExp(`(^|[^\\p{L}])${escape(country.name)}($|[^\\p{L}])`, "u") }));

/** A manchete não diz de quem é: o escudo sai do primeiro clube (ou seleção) citado no texto. */
export function crestForHeadline(title: string): { club?: Club; country?: Country } {
  let found: { club: Club; index: number } | null = null;
  for (const { club, re } of CLUB_MATCHERS) {
    const match = re.exec(title);
    if (match && (!found || match.index < found.index)) found = { club, index: match.index };
  }
  if (found) return { club: found.club };
  const country = COUNTRY_MATCHERS.find(({ re }) => re.test(title))?.country;
  return country ? { country } : {};
}

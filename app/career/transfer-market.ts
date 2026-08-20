import { CLUBS, leagueById } from "../game-data";
import type { GameState } from "./model";
import { competitiveStrength, ensureEuropeanOffer, transferMarketProfile } from "./performance";
import type { TransferOfferOptions } from "./performance";
import { clamp, clubById, seeded } from "./shared";
import { clubConfederation, foreignEligible, isEuropeanClub, regionAffinity } from "./academy";

export const SECOND_DIVISION_LEAGUES = new Set(["brasileirao-b", "championship"]);

export function selectOffers(state: GameState, count: number, salt: number, opts: TransferOfferOptions = {}) {
  const current = state.currentClubId || state.academyClubId;
  const currentClub = clubById(current);
  const currentRep = current ? currentClub.reputation : 3;
  const originCountryId = currentClub.countryId;
  const targetRep = clamp(Math.round((state.overall - 56) / 6), 2, 5);
  let pool = CLUBS.filter((club) => club.id !== current);
  if (opts.forceForeign) {
    pool = pool.filter((club) => isEuropeanClub(club) && (foreignEligible(state, club, originCountryId) || club.reputation <= Math.max(3, currentRep - 1)));
  } else if (opts.forceDomestic) {
    const domesticCountryId = opts.domesticCountryId ?? originCountryId;
    pool = pool.filter((club) => club.countryId === domesticCountryId);
  } else if (!opts.includeForeign) {
    pool = pool.filter((club) => club.countryId === originCountryId);
  } else {
    pool = pool.filter((club) => club.countryId === originCountryId || foreignEligible(state, club, originCountryId));
  }
  const candidates = pool.sort((a, b) => {
    const scoreA = Math.abs(a.reputation - Math.max(currentRep, targetRep)) + seeded(state.seed, salt + CLUBS.indexOf(a)) + regionAffinity(originCountryId, a);
    const scoreB = Math.abs(b.reputation - Math.max(currentRep, targetRep)) + seeded(state.seed, salt + CLUBS.indexOf(b)) + regionAffinity(originCountryId, b);
    return scoreA - scoreB;
  });
  return candidates.slice(0, count).map((club) => club.id);
}

export function offersFromCountry(state: GameState, countryId: string, count: number, salt: number, excludedIds: string[] = []) {
  const current = clubById(state.currentClubId || state.academyClubId);
  const profile = transferMarketProfile(state);
  const targetStrength = clamp(
    competitiveStrength(current) + Math.round((profile.performanceScore - 55) / 12),
    58,
    92,
  );
  return CLUBS
    .filter((club) => club.countryId === countryId && club.id !== current.id && !excludedIds.includes(club.id))
    .sort((a, b) => {
      const scoreA = Math.abs(competitiveStrength(a) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(a)) * 5;
      const scoreB = Math.abs(competitiveStrength(b) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(b)) * 5;
      return scoreA - scoreB;
    })
    .slice(0, count)
    .map((club) => club.id);
}

export function prioritizeCurrentCountry(state: GameState, salt: number, offers: string[], desiredCount: number) {
  if (desiredCount <= 0) return offers;
  const current = clubById(state.currentClubId || state.academyClubId);
  const localOffers = [
    ...offers.filter((clubId) => clubById(clubId).countryId === current.countryId),
    ...offersFromCountry(state, current.countryId, desiredCount, salt, offers),
  ].slice(0, desiredCount);
  return Array.from(new Set([...localOffers, ...offers])).slice(0, Math.max(5, offers.length));
}

export function selectTransferOffers(state: GameState, salt: number, opts: TransferOfferOptions = {}) {
  const current = clubById(state.currentClubId || state.academyClubId);
  const sourceLeagueId = opts.sourceLeagueId ?? state.currentLeagueId ?? current.leagueId;
  if (SECOND_DIVISION_LEAGUES.has(sourceLeagueId)) {
    return offersFromCountry(state, current.countryId, 7, salt).slice(0, 7);
  }
  if (opts.forceDomestic) {
    const domesticCountryId = opts.domesticCountryId ?? current.countryId;
    return offersFromCountry(state, domesticCountryId, 7, salt).slice(0, 7);
  }
  let baseOffers = isEuropeanClub(current) && !opts.forceDomestic
    ? selectOffers(state, 5, salt, { ...opts, includeForeign: true, forceForeign: true })
    : selectOffers(state, 5, salt, opts);
  const desiredLocalOffers = opts.forceForeign && !isEuropeanClub(current)
    ? 0
    : state.age >= 34
      ? 3
      : 2;
  baseOffers = prioritizeCurrentCountry(state, salt + 919, baseOffers, desiredLocalOffers);
  baseOffers = ensureEuropeanOffer(state, salt + 941, baseOffers);
  const homeCountryId = state.academyCountryId;
  if (homeCountryId && current.countryId !== homeCountryId && !opts.forceForeign) {
    const homeReturnChance = state.age >= 34 ? 0.78 : state.age >= 30 ? 0.12 : 0.035;
    if (seeded(state.seed, salt + 887) < homeReturnChance) {
      const homeOfferCount = state.age >= 34 ? 2 : 1;
      const homeOffers = offersFromCountry(state, homeCountryId, homeOfferCount, salt + 907, baseOffers);
      baseOffers = Array.from(new Set([
        ...baseOffers.filter((clubId) => clubById(clubId).countryId === current.countryId).slice(0, desiredLocalOffers),
        ...homeOffers,
        ...baseOffers,
      ])).slice(0, 7);
    }
  }

  const profile = transferMarketProfile(state);
  if (!profile.extraMarketOffers) return baseOffers;

  const targetStrength = clamp(
    Math.round(competitiveStrength(current) + (profile.performanceScore - 62) / 10),
    66,
    92,
  );
  const performanceBoost = Math.floor(profile.performanceScore / 10);
  const foreignPool = CLUBS
    .filter((club) => {
      if (club.countryId === current.countryId || club.id === current.id || baseOffers.includes(club.id)) return false;
      const confederation = clubConfederation(club);
      if (isEuropeanClub(current) && confederation !== "EUROPE") return false;
      if (state.age > 38) return false;
      if (state.age > 33 && confederation === "EUROPE") return false;
      const league = leagueById(club.leagueId);
      let accessibleLevel = 58 + league.prestige * 3 + club.reputation * 2;
      if (confederation === "SOUTH_AMERICA") accessibleLevel -= 8;
      if (confederation === "NORTH_AMERICA") accessibleLevel -= state.age >= 29 ? 12 : 6;
      return state.overall + performanceBoost >= accessibleLevel;
    })
    .sort((a, b) => {
      const distanceA = Math.abs(competitiveStrength(a) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(a)) * 3 + regionAffinity(current.countryId, a);
      const distanceB = Math.abs(competitiveStrength(b) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(b)) * 3 + regionAffinity(current.countryId, b);
      return distanceA - distanceB;
    })
    .slice(0, profile.extraMarketOffers)
    .map((club) => club.id);

  const expandedOffers = Array.from(new Set([...baseOffers, ...foreignPool])).slice(0, 10);
  return ensureEuropeanOffer(
    state,
    salt + 977,
    prioritizeCurrentCountry(state, salt + 967, expandedOffers, desiredLocalOffers),
  );
}

export const ALTERNATIVE_EXILE_LEAGUES = new Set([
  "liga-uruguaia",
  "liga-chilena",
  "liga-colombiana",
  "liga-paraguaia",
  "liga-equatoriana",
  "liga-peruana",
  "liga-mx",
  "mls",
  "eredivisie",
  "primeira",
  "proleague",
  "superlig",
  "swiss-super-league",
  "austria-bundesliga",
  "premiership-sco",
  "saudi-pro-league",
  "j1-league",
  "k-league",
  "csl",
  "brasileirao-b",
  "championship",
  "botola-pro",
  "super-league-greece",
  "liga-boliviana",
  "liga-futve",
  "chance-liga",
]);

export function selectAlternativeExileOffers(state: GameState, salt: number) {
  const current = clubById(state.currentClubId || state.academyClubId);
  const targetStrength = clamp(competitiveStrength(current) - 8, 58, 78);
  return CLUBS
    .filter((club) =>
      club.id !== current.id &&
      club.countryId !== current.countryId &&
      ALTERNATIVE_EXILE_LEAGUES.has(club.leagueId) &&
      club.reputation <= 3,
    )
    .sort((a, b) => {
      const scoreA = Math.abs(competitiveStrength(a) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(a)) * 7;
      const scoreB = Math.abs(competitiveStrength(b) - targetStrength) + seeded(state.seed, salt + CLUBS.indexOf(b)) * 7;
      return scoreA - scoreB;
    })
    .slice(0, 6)
    .map((club) => club.id);
}

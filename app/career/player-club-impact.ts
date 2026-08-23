import type { Club } from "../game-data";

export const PLAYER_CLUB_FOUR_STAR_OVR = 80;
export const FOUR_STAR_MIN_REPUTATION = 4;
export const FOUR_STAR_MIN_STRENGTH = 80;

/**
 * Um craque 80+ eleva temporariamente um clube abaixo de quatro estrelas.
 * Não altera o cadastro global do clube: o boost só existe enquanto o
 * protagonista está naquele time e desaparece naturalmente quando ele sai
 * (ou cai abaixo de 80 OVR).
 */
export function clubWithPlayerImpact(club: Club, playerOverall: number): Club {
  if (playerOverall < PLAYER_CLUB_FOUR_STAR_OVR || club.reputation >= FOUR_STAR_MIN_REPUTATION) return club;
  return {
    ...club,
    reputation: FOUR_STAR_MIN_REPUTATION,
    strength: Math.max(club.strength, FOUR_STAR_MIN_STRENGTH),
  };
}

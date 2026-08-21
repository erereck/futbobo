import { clamp, seeded } from "./shared";

export type SeasonPhysicalLoadInput = {
  seed: number;
  season: number;
  startingFitness: number;
  age: number;
  stamina: number;
  lifeBalance: number;
  appearances: number;
  nationalAppearances: number;
  continentalCampaign: boolean;
  continentalChampion: boolean;
  clubWorldCampaign: boolean;
  titles: number;
  injuryMatchesMissed: number;
  suspensionMatches: number;
  ironLungs: boolean;
  injuryProne: boolean;
  twistFitness?: number;
};

export type SeasonPhysicalLoad = {
  load: number;
  recovery: number;
  strain: number;
  targetFitness: number;
  fitness: number;
};

/**
 * Modelo anual provisório de carga física. A API foi mantida separada da simulação
 * para o calendário completo poder trocar `appearances` por carga partida a partida
 * sem mudar o significado do `fitness` no restante da carreira.
 */
export function seasonFitnessAfterLoad(input: SeasonPhysicalLoadInput): SeasonPhysicalLoad {
  const agePenalty = Math.max(0, input.age - 29) * 1.7 + Math.max(0, input.age - 34) * 1.9;
  const baseClubLoad = input.appearances * 1.18;
  const internationalLoad = input.nationalAppearances * 2.25;
  const continentalLoad = input.continentalCampaign
    ? input.continentalChampion ? 10 : 5.5
    : 0;
  const worldLoad = input.clubWorldCampaign ? 5 : 0;
  const titleRunLoad = Math.max(0, input.titles - 1) * 1.6;
  const injuryStress = input.injuryMatchesMissed > 0
    ? 5 + Math.min(13, input.injuryMatchesMissed * 0.42)
    : 0;
  // Suspensão tira minutos das pernas, mas não é descanso perfeito.
  const suspensionRelief = Math.min(4, input.suspensionMatches * 0.75);
  const traitLoad = input.injuryProne ? 4.5 : 0;

  const load = Math.max(0,
    baseClubLoad +
    internationalLoad +
    continentalLoad +
    worldLoad +
    titleRunLoad +
    injuryStress +
    agePenalty +
    traitLoad -
    suspensionRelief,
  );

  const recovery =
    32 +
    input.stamina * 0.42 +
    input.lifeBalance * 0.13 +
    (input.ironLungs ? 8 : 0) -
    Math.max(0, input.age - 32) * 0.8;

  const strain = Math.max(0, load - recovery);
  const lowLoadRecovery = Math.max(0, recovery - load) * 0.12;
  const randomSwing = seeded(input.seed, input.season * 7103 + 41) * 6 - 3;
  const targetFitness = clamp(
    Math.round(
      91 +
      lowLoadRecovery -
      strain * 0.72 -
      (input.injuryMatchesMissed > 0 ? 5 : 0) +
      randomSwing,
    ),
    24,
    99,
  );

  const fitness = clamp(
    Math.round(
      input.startingFitness * 0.38 +
      targetFitness * 0.62 +
      (input.twistFitness ?? 0),
    ),
    24,
    99,
  );

  return {
    load: Number(load.toFixed(1)),
    recovery: Number(recovery.toFixed(1)),
    strain: Number(strain.toFixed(1)),
    targetFitness,
    fitness,
  };
}

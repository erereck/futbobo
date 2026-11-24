// Fim obrigatório da carreira: a partir dos 40, só quem ainda tem nível segue
// jogando. Com overall 78 ou mais a carreira continua, temporada a temporada.

export const VETERAN_AGE = 40;
export const VETERAN_MIN_OVERALL = 78;

/** A carreira acaba sozinha nesta virada de temporada? */
export function forcedRetirement(age: number, overall: number): boolean {
  return age >= VETERAN_AGE && overall < VETERAN_MIN_OVERALL;
}

/** Passou dos 40 e segue em campo porque ainda tem nível. */
export function playingPastForty(age: number, overall: number): boolean {
  return age >= VETERAN_AGE && overall >= VETERAN_MIN_OVERALL;
}

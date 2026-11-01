import type { GameState, YouthPlay, YouthPlayYear } from "./model";
import { SCOREBOBO_TRACK } from "./scorebobo-track";
import { clamp } from "./shared";

// A trilha mora em scorebobo-track.ts (o save só precisa dela); daqui segue exportada como antes.
export { SCOREBOBO_TRACK, isScoreboboTrackLevel, scoreboboTrackName } from "./scorebobo-track";

/**
 * "Jogar a base": um minigame do Scorebobo por ano de base (dos 12 até a revelação).
 * Tudo aqui é puro e determinístico; a tela só despacha estas transições e o save
 * grava o resultado a cada `setGame`. O caminho "Simular" (createYouthJourney e o
 * Monte Carlo) não passa por aqui.
 */

/** Jogadas inteiras por ano (cada uma com as bolas que a fase já tem). */
export const YOUTH_PLAY_CHANCES = 3;

/** Teto do bônus de potencial máximo da base inteira. */
export const YOUTH_PLAY_MAX_BONUS = 3;

/**
 * Fases dos anos da base, em ordem de dificuldade e espalhadas pela trilha:
 * o primeiro ano é "Primeiro toque" e o último (a revelação) é sempre a "Final da Copa".
 */
export function youthLevelIds(count: number): string[] {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return [];
  const last = SCOREBOBO_TRACK.length - 1;
  if (total === 1) return [SCOREBOBO_TRACK[last].id];
  return Array.from({ length: total }, (_, index) => SCOREBOBO_TRACK[Math.round(index * last / (total - 1))].id);
}

/** Estrelas de um ano para a média: pulado conta 0; sempre inteiro de 0 a 3. */
export function youthYearStars(year: YouthPlayYear) {
  return year.skipped ? 0 : clamp(Math.round(year.bestStars) || 0, 0, 3);
}

/** Bônus de potencial máximo: média das melhores estrelas por ano, arredondada, de 0 a 3. */
export function youthPotentialBonus(years: readonly YouthPlayYear[]) {
  if (!years.length) return 0;
  const total = years.reduce((sum, year) => sum + youthYearStars(year), 0);
  return clamp(Math.round(total / years.length), 0, YOUTH_PLAY_MAX_BONUS);
}

/** Estado da base simulada (desafio diário e quem escolhe "Simular"). */
export function simulatedYouthPlay(): YouthPlay {
  return { mode: "simulate", years: [], current: 0, bonus: null };
}

/** A base jogada ainda tem anos pela frente (e o bônus não foi aplicado). */
export function isYouthPlayActive(play: YouthPlay | null | undefined): play is YouthPlay {
  return Boolean(play && play.mode === "play" && play.bonus === null && play.current < play.years.length);
}

/** A escolha está feita e não há minigame pendente: simulada, ou jogada com o bônus aplicado. */
export function isYouthPlayFinished(play: YouthPlay | null | undefined) {
  return Boolean(play && (play.mode === "simulate" || play.bonus !== null));
}

/** O ano em jogo, ou null quando não há base jogada em andamento. */
export function currentYouthPlayYear(state: GameState): YouthPlayYear | null {
  const play = state.youthPlay;
  return isYouthPlayActive(play) ? play.years[play.current] ?? null : null;
}

export function youthYearChancesLeft(year: YouthPlayYear) {
  return Math.max(0, YOUTH_PLAY_CHANCES - year.chancesUsed);
}

/** O ano já não tem o que jogar: 3★, chances esgotadas ou pulado. */
export function isYouthYearDone(year: YouthPlayYear) {
  return Boolean(year.skipped) || year.bestStars >= 3 || year.chancesUsed >= YOUTH_PLAY_CHANCES;
}

function withCurrentYear(state: GameState, update: (year: YouthPlayYear) => YouthPlayYear | null): GameState {
  const play = state.youthPlay;
  if (!isYouthPlayActive(play)) return state;
  const year = play.years[play.current];
  if (!year) return state;
  const next = update(year);
  if (!next) return state;
  return {
    ...state,
    youthPlay: { ...play, years: play.years.map((item, index) => index === play.current ? next : item) },
  };
}

/**
 * Grava a escolha Simular × Jogar. Só vale uma vez: com a escolha feita, devolve o
 * estado igual. No desafio diário a base é sempre simulada. Jogar sem anos de base
 * fecha na hora com bônus 0.
 */
export function chooseYouthMode(state: GameState, mode: YouthPlay["mode"]): GameState {
  if (state.youthPlay) return state;
  if (mode === "simulate" || state.challengeId) return { ...state, youthPlay: simulatedYouthPlay() };
  const years = youthLevelIds(state.youthYears.length).map((levelId): YouthPlayYear => ({ levelId, chancesUsed: 0, bestStars: 0 }));
  const next: GameState = { ...state, youthPlay: { mode: "play", years, current: 0, bonus: null } };
  return years.length ? next : finishYouthPlay(next);
}

/**
 * A jogada começou de verdade (cena pronta): gasta uma chance do ano atual.
 * Nunca passa de 3 e não gasta em ano resolvido (3★).
 */
export function startYouthChance(state: GameState): GameState {
  return withCurrentYear(state, (year) => isYouthYearDone(year) ? null : { ...year, chancesUsed: year.chancesUsed + 1 });
}

/** Fim de uma jogada: guarda a melhor nota do ano. Sem chance gasta, não há nota a gravar. */
export function recordYouthStars(state: GameState, stars: number): GameState {
  const value = clamp(Math.round(Number(stars)) || 0, 0, 3);
  return withCurrentYear(state, (year) => year.chancesUsed > 0 && value > year.bestStars ? { ...year, bestStars: value } : null);
}

/** Devolve a chance de uma jogada que caiu (falha do 3D) antes de ter resultado. */
export function refundYouthChance(state: GameState): GameState {
  return withCurrentYear(state, (year) => year.chancesUsed > 0 ? { ...year, chancesUsed: year.chancesUsed - 1 } : null);
}

/**
 * Aceita a melhor nota e passa para o próximo ano; no último, aplica o bônus.
 * Exige ao menos uma chance gasta no ano: um segundo clique no mesmo "Continuar"
 * cai no ano novo (ainda sem chance) e não pula nada. Para desistir, `skipRemainingYouth`.
 */
export function advanceYouthYear(state: GameState): GameState {
  const play = state.youthPlay;
  if (!isYouthPlayActive(play)) return state;
  const year = play.years[play.current];
  if (!year || year.chancesUsed < 1) return state;
  const next: GameState = { ...state, youthPlay: { ...play, current: play.current + 1 } };
  return play.current + 1 >= play.years.length ? finishYouthPlay(next) : next;
}

/**
 * "Simular o resto": os anos que não tiveram jogada contam 0★ (pulados) e a base
 * fecha com o bônus. Um ano já jogado pela metade mantém a melhor nota que fez.
 */
export function skipRemainingYouth(state: GameState): GameState {
  const play = state.youthPlay;
  if (!play || play.mode !== "play" || play.bonus !== null) return state;
  const years = play.years.map((year, index) => index < play.current || year.chancesUsed > 0 ? year : { ...year, bestStars: 0, skipped: true });
  return finishYouthPlay({ ...state, youthPlay: { ...play, years, current: years.length } });
}

/**
 * Aplica o bônus de potencial máximo uma única vez, depois de tudo que a criação já
 * calculou (inclusive o clamp 58–97 da história): `potential + bônus`, teto 99.
 * Com o bônus gravado, chamar de novo não muda nada (o Voltar da revelação não reaplica).
 */
export function finishYouthPlay(state: GameState): GameState {
  const play = state.youthPlay;
  if (!play || play.mode !== "play" || play.bonus !== null) return state;
  if (play.current < play.years.length) return skipRemainingYouth(state);
  const bonus = youthPotentialBonus(play.years);
  return {
    ...state,
    potential: Math.max(state.potential, Math.min(99, state.potential + bonus)),
    youthPlay: { ...play, current: play.years.length, bonus },
  };
}

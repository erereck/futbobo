// Chave do Bobonline (X1, torneio de 4 e de 8): matemática pura, sem rede e sem relógio.
//
// Ids estáveis "r{rodada}m{jogo}"; os vencedores de r1m0 e r1m1 se encontram em
// r2m0, e assim por diante; a final é r{rodadas}m0. Quem decide QUANDO cada jogo
// começa (pronto, espera do resultado, W.O.) é o controlador da sala (B2): aqui
// só se monta a chave, se preenche o próximo jogo e se responde perguntas.
//
// Ordem de entrada: `entrants` chega na ordem de joinOrder (humanos) com as CPUs
// no fim. Essa ordem decide o mandante de um duelo quando o chamador não passa
// `joinOrderOf`. A chave guarda os entrantes nessa ordem (o sorteio só mexe nos lugares).

import { createRng, hashSeed } from "../../botao/rng";
import { canonicalJson, fnv8 } from "../teams/model";
import type { Bracket, BracketEntrant, BracketMatch, BracketMatchKind, BracketResult, BracketSide, RoomFormat } from "../types";

export type BracketSize = 2 | 4 | 8;
export type JoinOrderOf = (entrantId: string) => number;

export const FORMAT_SIZE: Record<RoomFormat, BracketSize> = { x1: 2, t4: 4, t8: 8 };

export function matchIdFor(round: number, index: number): string {
  return `r${round}m${index}`;
}

/** Hash do resultado (FNV-1a do JSON canônico, sem reportedBy/at): o que dois relatórios comparam. */
export function bracketResultHash(result: Omit<BracketResult, "resultHash" | "reportedBy" | "at"> & Partial<BracketResult>): string {
  const rest: Record<string, unknown> = { ...result };
  delete rest.resultHash;
  delete rest.reportedBy;
  delete rest.at;
  return fnv8(canonicalJson(rest));
}

/**
 * Lugares da rodada 1 na ordem de preenchimento: um lugar por jogo antes de
 * qualquer jogo receber o segundo (nunca folga contra folga), alternando as
 * metades da chave (dois humanos sozinhos só se cruzam na final).
 */
function seatOrder(size: number): number[] {
  const games = size / 2;
  const bits = Math.round(Math.log2(games));
  const spread = Array.from({ length: games }, (_, game) => {
    let reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) if (game & (1 << bit)) reversed |= 1 << (bits - 1 - bit);
    return reversed;
  });
  return [...spread.map((game) => game * 2), ...spread.map((game) => game * 2 + 1)];
}

function emptyMatch(round: number, index: number): BracketMatch {
  return {
    id: matchIdFor(round, index),
    round,
    index,
    home: null,
    away: null,
    kind: null,
    status: "waiting",
    authority: null,
    replay: 0,
    freeBy: [],
    holdUntil: null,
    readyBy: [],
    readyDeadline: null,
    startedAt: null,
    sealed: null,
    result: null,
  };
}

function entrantOf(bracket: Pick<Bracket, "entrants">, side: BracketSide): BracketEntrant | null {
  if (!side) return null;
  return bracket.entrants.find((entrant) => entrant.id === side.entrantId) ?? null;
}

function defaultJoinOrder(bracket: Pick<Bracket, "entrants">): JoinOrderOf {
  return (id) => {
    const index = bracket.entrants.findIndex((entrant) => entrant.id === id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
}

export function matchById(bracket: Bracket, bracketId: string): BracketMatch | null {
  return bracket.matches.find((match) => match.id === bracketId) ?? null;
}

/** Tipo do jogo pelos lados: folga só existe na rodada 1 (um lado vazio). */
export function matchKind(bracket: Bracket, match: BracketMatch): BracketMatchKind | null {
  if (match.kind === "bye") return "bye";
  const home = entrantOf(bracket, match.home);
  const away = entrantOf(bracket, match.away);
  if (!home && !away) return null;
  if (!home || !away) return match.round === 1 ? "bye" : null;
  if (home.kind === "human" && away.kind === "human") return "duel";
  if (home.kind === "cpu" && away.kind === "cpu") return "cpu-cpu";
  return "cpu-human";
}

/**
 * Quem roda a partida: o mandante humano num duelo (antes de o jogo ser orientado,
 * o de menor joinOrder), o humano num cpu-human, e ninguém (null) em cpu-cpu e folga.
 */
export function authorityFor(bracket: Bracket, match: BracketMatch, joinOrderOf: JoinOrderOf): string | null {
  const kind = matchKind(bracket, match);
  if (kind === "cpu-human") {
    const home = entrantOf(bracket, match.home);
    return home?.kind === "human" ? home.id : (match.away?.entrantId ?? null);
  }
  if (kind !== "duel" || !match.home || !match.away) return null;
  if (match.kind === "duel") return match.home.entrantId;
  return joinOrderOf(match.home.entrantId) <= joinOrderOf(match.away.entrantId) ? match.home.entrantId : match.away.entrantId;
}

/** Com os dois lados conhecidos: humano em casa contra a CPU, menor joinOrder em casa no duelo; define kind e autoridade. */
function orient(bracket: Pick<Bracket, "entrants">, match: BracketMatch, joinOrderOf: JoinOrderOf): BracketMatch {
  const home = entrantOf(bracket, match.home);
  const away = entrantOf(bracket, match.away);
  if (!home || !away) return match;
  let swap = false;
  if (home.kind === "cpu" && away.kind === "human") swap = true;
  else if (home.kind === "human" && away.kind === "human") swap = joinOrderOf(away.id) < joinOrderOf(home.id);
  const oriented: BracketMatch = swap ? { ...match, home: match.away, away: match.home } : { ...match };
  const first = swap ? away : home;
  const second = swap ? home : away;
  oriented.kind = first.kind === "human" && second.kind === "human" ? "duel" : first.kind === "cpu" && second.kind === "cpu" ? "cpu-cpu" : "cpu-human";
  oriented.authority = oriented.kind === "cpu-cpu" ? null : first.id;
  return oriented;
}

function byeResult(match: BracketMatch, now: number): BracketResult {
  const base = {
    matchId: `folga-${match.id}`,
    winner: "home" as const,
    homeGoals: 0,
    awayGoals: 0,
    homePens: null,
    awayPens: null,
    decision: "walkover" as const,
    walkover: "bye" as const,
  };
  return { ...base, resultHash: bracketResultHash(base), reportedBy: "host", at: now };
}

export function winnerOf(match: BracketMatch): string | null {
  if (!match.result) return null;
  return (match.result.winner === "home" ? match.home : match.away)?.entrantId ?? null;
}

export function loserOf(match: BracketMatch): string | null {
  if (!match.result || match.kind === "bye") return null;
  return (match.result.winner === "home" ? match.away : match.home)?.entrantId ?? null;
}

/** Os dois jogos que alimentam este (null na rodada 1). */
export function feedersOf(bracket: Bracket, match: BracketMatch): [BracketMatch | null, BracketMatch | null] {
  if (match.round <= 1) return [null, null];
  return [matchById(bracket, matchIdFor(match.round - 1, match.index * 2)), matchById(bracket, matchIdFor(match.round - 1, match.index * 2 + 1))];
}

/** Põe o vencedor no próximo jogo (no lado livre) e orienta quando os dois lados existem. Muta `matches`. */
function promote(bracket: Bracket, matches: BracketMatch[], from: BracketMatch, joinOrderOf: JoinOrderOf) {
  const winner = winnerOf(from);
  if (!winner || from.round >= bracket.rounds) return;
  const at = matches.findIndex((match) => match.id === matchIdFor(from.round + 1, Math.floor(from.index / 2)));
  if (at < 0) return;
  const next = { ...matches[at] };
  if (next.home?.entrantId === winner || next.away?.entrantId === winner) return;
  const side: BracketSide = { entrantId: winner };
  // Chave vazia: o de cima vai em casa. Se um lado já veio, ocupa o outro.
  if (!next.home && !next.away) {
    if (from.index % 2 === 0) next.home = side;
    else next.away = side;
  } else if (!next.home) next.home = side;
  else if (!next.away) next.away = side;
  else return;
  matches[at] = next.home && next.away ? orient(bracket, next, joinOrderOf) : next;
}

/**
 * Monta a chave. Tamanho pelo formato (2, 4, 8); com vagas sem CPU (folgas) e
 * menos da metade das vagas ocupadas, a chave encolhe (um torneio de 8 com 3
 * pessoas vira semifinal + final), porque senão haveria jogo de folga contra folga.
 * Folgas já nascem "done" (W.O. "bye") e o vencedor sobe na hora.
 * Os jogos com os dois lados ficam "waiting": o controlador põe a rodada 1 em "playing".
 */
export function createBracket(args: { format: RoomFormat; entrants: BracketEntrant[]; seed: number; now?: number; joinOrderOf?: JoinOrderOf }): Bracket {
  const formatSize = FORMAT_SIZE[args.format];
  if (!formatSize) throw new Error(`chave: formato desconhecido (${String(args.format)})`);
  if (args.entrants.length > formatSize) throw new Error(`chave: ${args.entrants.length} entrantes para ${formatSize} vagas`);
  let size: BracketSize = formatSize;
  while (size > 2 && args.entrants.length < size / 2) size = (size / 2) as BracketSize;
  const rounds = Math.round(Math.log2(size));
  const entrants = args.entrants.map((entrant) => ({ ...entrant }));
  const bracket: Bracket = { size, rounds, entrants, matches: [] };
  const joinOrderOf = args.joinOrderOf ?? defaultJoinOrder(bracket);

  // Sorteio, depois humanos primeiro: cada humano cai num jogo diferente antes de dois se cruzarem.
  const rng = createRng(hashSeed(args.seed, "chave"));
  const shuffled = [...entrants];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  const ordered = [...shuffled.filter((entrant) => entrant.kind === "human"), ...shuffled.filter((entrant) => entrant.kind !== "human")];
  const seats: Array<string | null> = Array.from({ length: size }, () => null);
  seatOrder(size).forEach((seat, at) => {
    seats[seat] = ordered[at]?.id ?? null;
  });

  const matches: BracketMatch[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (let index = 0; index < size / 2 ** round; index += 1) matches.push(emptyMatch(round, index));
  }
  const firstRound = matches.filter((match) => match.round === 1);
  for (const match of firstRound) {
    const homeId = seats[match.index * 2];
    const awayId = seats[match.index * 2 + 1];
    const at = matches.indexOf(match);
    if (homeId && awayId) {
      matches[at] = orient(bracket, { ...match, home: { entrantId: homeId }, away: { entrantId: awayId } }, joinOrderOf);
    } else if (homeId || awayId) {
      const bye: BracketMatch = { ...match, home: { entrantId: (homeId ?? awayId) as string }, away: null, kind: "bye", status: "done" };
      bye.result = byeResult(bye, args.now ?? 0);
      matches[at] = bye;
    }
  }
  for (const match of [...matches]) {
    if (match.round === 1 && match.status === "done") promote(bracket, matches, match, joinOrderOf);
  }
  bracket.matches = matches;
  return bracket;
}

/**
 * Registra o resultado de um jogo e sobe o vencedor (W.O. duplo também: o vencedor
 * do sorteio avança). Devolve uma chave nova; jogo inexistente, já encerrado ou
 * com lado vazio devolve a MESMA chave (um jogo "done" nunca volta nem é sobrescrito).
 */
export function advanceBracket(bracket: Bracket, bracketId: string, result: BracketResult, joinOrderOf?: JoinOrderOf): Bracket {
  const at = bracket.matches.findIndex((match) => match.id === bracketId);
  const match = bracket.matches[at];
  if (!match || match.status === "done" || !match.home || !match.away) return bracket;
  const matches = [...bracket.matches];
  const done: BracketMatch = { ...match, status: "done", result: { ...result } };
  matches[at] = done;
  const next: Bracket = { ...bracket, matches };
  promote(next, matches, done, joinOrderOf ?? defaultJoinOrder(bracket));
  return next;
}

/**
 * Revanche do X1: mesmo id, replay + 1, mandante e visitante trocados (quem era
 * visitante vira mandante e autoridade). Só para o X1 já encerrado num duelo.
 */
export function rematchMatch(bracket: Bracket, bracketId: string): Bracket {
  const at = bracket.matches.findIndex((match) => match.id === bracketId);
  const match = bracket.matches[at];
  if (!match || bracket.size !== 2 || match.status !== "done" || match.kind !== "duel" || !match.home || !match.away) return bracket;
  const swapped: BracketMatch = {
    ...emptyMatch(match.round, match.index),
    home: match.away,
    away: match.home,
    kind: "duel",
    authority: match.away.entrantId,
    replay: match.replay + 1,
  };
  const matches = [...bracket.matches];
  matches[at] = swapped;
  return { ...bracket, matches };
}

export function championOf(bracket: Bracket): string | null {
  const final = matchById(bracket, matchIdFor(bracket.rounds, 0));
  return final && final.status === "done" ? winnerOf(final) : null;
}

/** O próximo jogo ainda não encerrado em que o entrante já está escalado (null: caiu, campeão ou sem jogo). */
export function nextMatchFor(bracket: Bracket, entrantId: string): BracketMatch | null {
  const pending = bracket.matches
    .filter((match) => match.status !== "done" && (match.home?.entrantId === entrantId || match.away?.entrantId === entrantId))
    .sort((a, b) => a.round - b.round || a.index - b.index);
  return pending[0] ?? null;
}

/** O jogo anterior do entrante (o que o trouxe até `match`); serve para a espera da tela de resultado. */
export function previousMatchOf(bracket: Bracket, entrantId: string, match: BracketMatch): BracketMatch | null {
  for (const feeder of feedersOf(bracket, match)) {
    if (feeder && feeder.status === "done" && (feeder.home?.entrantId === entrantId || feeder.away?.entrantId === entrantId)) return feeder;
  }
  return null;
}

/** Onde o entrante caiu (null se ainda está vivo ou foi campeão). */
export function eliminatedIn(bracket: Bracket, entrantId: string): BracketMatch | null {
  return bracket.matches.find((match) => match.status === "done" && loserOf(match) === entrantId) ?? null;
}

export function roundName(size: 2 | 4 | 8, round: number): "Final" | "Semifinal" | "Quartas de final" | "X1" {
  if (size === 2) return "X1";
  const fromEnd = Math.round(Math.log2(size)) - round;
  if (fromEnd <= 0) return "Final";
  return fromEnd === 1 ? "Semifinal" : "Quartas de final";
}

export function roundPhrase(size: 2 | 4 | 8, round: number): "na final" | "na semifinal" | "nas quartas de final" {
  const name = roundName(size, round);
  if (name === "Semifinal") return "na semifinal";
  if (name === "Quartas de final") return "nas quartas de final";
  return "na final";
}

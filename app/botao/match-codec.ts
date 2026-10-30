// Codec da partida para o Bobonline: serializar, restaurar, sobrescrever no
// lugar e tirar o hash do estado do motor, mais o espelho do resultado.
//
// T0: só o contrato. Todas as assinaturas são as reais; os corpos entram no L1
// (B1), junto com a prova de identidade do motor. Nenhum modo atual importa isto.

import type { BotaoMatchState } from "./engine";
import type { BotaoMatchResult, BotaoMatchSetup, BotaoShot } from "./types";

export const BOTAO_ENGINE_REV = 1;   // sobe quando a física/regra muda (vai no hello e no net.json "current")

export type SerializedMatch = Omit<BotaoMatchState, "rng" | "setup"> & { codec: 1; rngCursor: number };

function pending(name: string, ...args: unknown[]): never {
  void args;
  throw new Error(`match-codec: ainda não implementado (${name})`);
}

/** JSON-safe: NaN→0 em keeper.vx, -0→0, posts sem mass. */
export function serializeMatch(state: BotaoMatchState): SerializedMatch {
  return pending("serializeMatch", state);
}

/** rng = createRng(hashSeed(seed, matchId)) + cursor × next(); posts mass = Infinity. */
export function restoreMatch(setup: BotaoMatchSetup, data: SerializedMatch): BotaoMatchState {
  return pending("restoreMatch", setup, data);
}

/** No lugar: mesmo objeto de estado, mesmo setup, e os MESMOS objetos de corpo (copia campo a campo por id; corpo novo só se o id não existir). */
export function overwriteMatch(target: BotaoMatchState, data: SerializedMatch): void {   // version = max(target.version, data.version) + 1
  pending("overwriteMatch", target, data);
}

/** FNV-1a 8 hex sobre bits float64 (DataView little-endian), -0→+0, NaN→NaN canônico. */
export function hashMatch(state: BotaoMatchState): string {
  return pending("hashMatch", state);
}

export function hashSetup(setup: BotaoMatchSetup): string {
  return pending("hashSetup", setup);
}

/** JSON canônico (chaves ordenadas). */
export function hashJson(value: unknown): string {
  return pending("hashJson", value);
}

/** `${turns}.${period}.${phase}.${turn}.${pen ? `${pen.turn}${pen.results.user.length}-${pen.results.cpu.length}` : "-"}` */
export function matchKey(state: BotaoMatchState): string {
  return pending("matchKey", state);
}

/** Necessário, não suficiente: o driver ainda exige "sem cobrança pendente de commit" (§5.3). */
export function isRestPoint(state: BotaoMatchState): boolean {
  return pending("isRestPoint", state);
}

export function validateRemoteShot(state: BotaoMatchState, shot: BotaoShot, kind: "open" | "penalty"): BotaoShot | null {
  return pending("validateRemoteShot", state, shot, kind);
}

/** Visão do lado "cpu": win↔loss, For↔Against, pênaltis e stats trocados, timeline[].side trocado e byUser = false. Replays NÃO mudam. */
export function mirrorResult(result: BotaoMatchResult): BotaoMatchResult {
  return pending("mirrorResult", result);
}

/** userTeam↔cpuTeam (só para textos/estatísticas do resultado). */
export function mirrorSetup(setup: BotaoMatchSetup): BotaoMatchSetup {
  return pending("mirrorSetup", setup);
}

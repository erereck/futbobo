// Ajustes de papel no elenco que vêm da história do jogador, não só do
// overall: quem vai emprestado vai para jogar, e o gigante europeu que te
// tirou da peneira confia em você antes de você chegar no nível do time.

import type { SquadRole } from "../career-systems";
import type { GameState } from "./model";
import { PENEIRA_GIANT_STARTER_MARGIN, peneiraGiantClubId } from "./peneira";
import { ensureClubSquadPlayers, worldPlayersAtClub } from "./world-players";

const ROLE_RANK: Record<SquadRole, number> = { reserva: 0, promessa: 1, rotacao: 2, titular: 3, estrela: 4 };

/** Sequência extra de quem está emprestado (somada à nota de minutos da temporada). */
export const LOAN_MINUTES_BONUS = 8;
/** Clube só pede emprestado quem jogaria lá: força do clube até overall + 3. */
export const LOAN_PLAY_MARGIN = 3;
/** E não manda para clube muito abaixo do seu nível (força ≥ overall − 12). */
export const LOAN_FLOOR_MARGIN = 12;

/** O empréstimo faz sentido para os dois lados: você jogaria lá e o clube não é pequeno demais para você. */
export function loanFits(overall: number, clubStrength: number): boolean {
  return clubStrength <= overall + LOAN_PLAY_MARGIN && clubStrength >= overall - LOAN_FLOOR_MARGIN;
}

export function isOnLoan(state: Pick<GameState, "activeLoan" | "loanParentClubId">): boolean {
  return Boolean(state.activeLoan || state.loanParentClubId);
}

/** Empréstimo existe para jogar: no clube que te pediu você é, no mínimo, titular. */
export function loanSquadRole(role: SquadRole): SquadRole {
  return ROLE_RANK[role] >= ROLE_RANK.titular ? role : "titular";
}

/**
 * Média dos cinco melhores do elenco (o time de botão da aba Time), sem você.
 * Usa o mesmo elenco determinístico que a aba Time monta.
 */
export function clubStarterAverage(state: Pick<GameState, "worldPlayers" | "season">, clubId: string): number {
  const universe = ensureClubSquadPlayers(state.worldPlayers, clubId, state.season, 14);
  const best = worldPlayersAtClub(universe, clubId).map((player) => player.overall).sort((a, b) => b - a).slice(0, 5);
  return best.length ? Math.round(best.reduce((sum, overall) => sum + overall, 0) / best.length) : 0;
}

/** No gigante da peneira, você é titular com até 3 de overall abaixo da média do time. */
export function peneiraGiantRole(
  state: Pick<GameState, "peneira" | "peneiraClubId" | "worldPlayers" | "season">,
  clubId: string,
  overall: number,
  role: SquadRole,
): SquadRole {
  if (!clubId || ROLE_RANK[role] >= ROLE_RANK.titular || clubId !== peneiraGiantClubId(state)) return role;
  return overall >= clubStarterAverage(state, clubId) - PENEIRA_GIANT_STARTER_MARGIN ? "titular" : role;
}

/** Papel final no clube atual: piso de titular emprestado; regra do gigante da peneira no clube dele. */
export function adjustedSquadRole(state: GameState, clubId: string, overall: number, role: SquadRole): SquadRole {
  if (isOnLoan(state) && clubId === state.currentClubId) return loanSquadRole(role);
  return peneiraGiantRole(state, clubId, overall, role);
}

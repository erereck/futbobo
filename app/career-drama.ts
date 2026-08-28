import type { GameEvent } from "./game-data";
import { CAREER_DRAMA_EVENTS as BASE_CAREER_DRAMA_EVENTS } from "./career-drama-base";
import { CAREER_DRAMA_EXTRA_EVENTS, careerDramaEventWithOverride } from "./career-drama-extra";

// Mantém todos os IDs antigos funcionando em saves existentes. Reescritas usam
// o mesmo ID e os eventos novos ficam separados para o catálogo continuar legível.
export const CAREER_DRAMA_EVENTS: GameEvent[] = [
  ...BASE_CAREER_DRAMA_EVENTS.map(careerDramaEventWithOverride),
  ...CAREER_DRAMA_EXTRA_EVENTS,
];

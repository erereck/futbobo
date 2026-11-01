/**
 * A trilha do Scorebobo vista pela carreira: só os ids e os nomes das 12 fases.
 * Mora num módulo próprio porque o save (`normalizeSave`, em state.ts) só precisa
 * validar ids; as transições da base jogada e do Treino especial ficam em
 * youth-play.ts e special-training.ts, que a interface carrega sob demanda.
 * Assim elas não entram no primeiro carregamento de "/".
 */

/**
 * As 12 fases do Scorebobo na ordem da trilha de dificuldade. Espelho de
 * `SCORE_LEVELS` (app/scorebobo/sim/levels.ts): a carreira não importa o Scorebobo
 * para não puxar os dados dele para o bundle de "/". Um teste confere ids e nomes.
 */
export const SCOREBOBO_TRACK: ReadonlyArray<{ readonly id: string; readonly name: string }> = [
  { id: "primeiro-toque", name: "Primeiro toque" },
  { id: "na-marca-da-cal", name: "Na marca da cal" },
  { id: "tabela-na-area", name: "Tabela na área" },
  { id: "cara-a-cara", name: "Cara a cara" },
  { id: "triangulacao", name: "Triangulação" },
  { id: "de-voleio", name: "De voleio" },
  { id: "pela-ponta", name: "Pela ponta" },
  { id: "falta-frontal", name: "Falta frontal" },
  { id: "contra-ataque", name: "Contra-ataque" },
  { id: "area-lotada", name: "Área lotada" },
  { id: "curva-no-angulo", name: "Curva no ângulo" },
  { id: "final-da-copa", name: "Final da Copa" },
];

export function isScoreboboTrackLevel(levelId: unknown): levelId is string {
  return typeof levelId === "string" && SCOREBOBO_TRACK.some((level) => level.id === levelId);
}

/** Nome da fase para a tela ("Primeiro toque"); id desconhecido volta o próprio id. */
export function scoreboboTrackName(levelId: string) {
  return SCOREBOBO_TRACK.find((level) => level.id === levelId)?.name ?? levelId;
}

// Contrato público do modo Futebol de Botão.
//
// Nada aqui importa o resto do Futbobo de propósito: o módulo é standalone e o
// encaixe na carreira acontece só em `adapter.ts`, que traduz GameState -> setup
// e resultado -> título. Se um dia o modo virar app separado, basta copiar a pasta.

export type BotaoPositionKey =
  | "GOL"
  | "LD"
  | "ZAG"
  | "LE"
  | "VOL"
  | "MC"
  | "MEI"
  | "MD"
  | "ME"
  | "PD"
  | "PE"
  | "CA";

/** Lado da mesa. `user` sempre defende embaixo na tela; `cpu` sempre ataca de cima. */
export type BotaoSide = "user" | "cpu";

/** 1 = amistoso de várzea, 5 = final de Champions contra time europeu. */
export type BotaoDifficulty = 1 | 2 | 3 | 4 | 5;

export type BotaoTeam = {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  primary: string;
  secondary: string;
  /** 60..92 na escala do Futbobo. Define potência dos botões e qualidade da CPU. */
  strength: number;
  /** Caminho do escudo (opcional). O módulo funciona sem nenhuma imagem. */
  badge?: string;
};

export type BotaoPlayer = {
  name: string;
  number: number;
  position: BotaoPositionKey;
  overall: number;
  /** Sobrescritas opcionais (0..100) derivadas dos atributos da carreira. */
  power?: number;
  control?: number;
};

export type BotaoRules = {
  /** Gols que encerram a partida na hora. 0 desliga a regra. */
  goalLimit: number;
  halfSeconds: number;
  halves: number;
  extraHalves: number;
  extraSeconds: number;
  penalties: boolean;
  penaltyRounds: number;
  /**
   * Segundos de jogo por segundo real. Em 1 o cronômetro da tela é literal:
   * o que está escrito é o tempo que falta de verdade.
   */
  clockScale: number;
};

/**
 * Tempo corrido e único. O relógio nunca para — nem para mirar, nem enquanto o
 * adversário pensa —, então o que está na tela é exatamente o que resta.
 */
export const DEFAULT_BOTAO_RULES: BotaoRules = {
  goalLimit: 3,
  halfSeconds: 120,
  halves: 1,
  extraHalves: 1,
  extraSeconds: 45,
  penalties: true,
  penaltyRounds: 5,
  clockScale: 1,
};

export type BotaoTimelineKind =
  | "goal"
  | "own-goal"
  | "post"
  | "period-end"
  | "penalty-goal"
  | "penalty-miss";

export type BotaoTimelineEntry = {
  period: number;
  clock: number;
  side: BotaoSide;
  kind: BotaoTimelineKind;
  scorer: string;
  assist: string | null;
  /** true quando foi o botão do próprio jogador da carreira. */
  byUser: boolean;
  /** Lance ocorrido antes de um jogador reserva entrar em campo. */
  beforePlayerEntry?: boolean;
  text: string;
};

export type BotaoMatchEntry = {
  role: "reserve";
  period: number;
  clock: number;
  score: { user: number; cpu: number };
  timeline: BotaoTimelineEntry[];
};

export type BotaoMatchSetup = {
  matchId: string;
  seed: number;
  competitionName: string;
  stageName: string;
  neutralVenue: boolean;
  userIsHost: boolean;
  player: BotaoPlayer;
  userTeam: BotaoTeam;
  cpuTeam: BotaoTeam;
  difficulty: BotaoDifficulty;
  rules: BotaoRules;
  /** Optional vector characters. Missing or disabled keeps classic shirt numbers. */
  visuals?: BotaoVisualRoster;
  /** Quando presente, a partida começa com o jogador saindo do banco. */
  entry?: BotaoMatchEntry;
};

export type BotaoDecision = "goal-limit" | "regulation" | "extra-time" | "penalties";

export type BotaoSideStats = {
  /** Toques dados (turnos gastos). */
  flicks: number;
  /** Vezes que um botão do lado encostou na bola. */
  touches: number;
  /** Bolas na trave. */
  posts: number;
};

export type BotaoReplayBody = {
  id: string;
  kind: "disc" | "ball";
  side: BotaoSide | null;
  number: number;
  radius: number;
  isUserPlayer: boolean;
};

/**
 * Um quadro guarda somente x/y, na mesma ordem de `bodies`.
 * A amostragem baixa evita vídeo, imagens e estados inteiros do motor no save.
 */
export type BotaoReplayFrame = {
  at: number;
  positions: number[];
};

export type BotaoGoalReplay = {
  timelineIndex: number;
  duration: number;
  /** Escala das coordenadas inteiras. 4 = precisão de um quarto de unidade. */
  coordinateScale?: number;
  /** Instante em que cada uma das até três jogadas começa no replay compacto. */
  turnStarts?: number[];
  bodies: BotaoReplayBody[];
  frames: BotaoReplayFrame[];
};

export type BotaoMatchResult = {
  matchId: string;
  /** true quando a final foi resolvida sem o jogador tocar em nada. */
  simulated: boolean;
  /** A partida foi abandonada ao fechar ou atualizar a página depois do início. */
  walkover?: boolean;
  outcome: "win" | "loss" | "draw";
  goalsFor: number;
  goalsAgainst: number;
  penaltyFor: number | null;
  penaltyAgainst: number | null;
  /** Gols e assistências marcados pelo botão do jogador — alimentam as estatísticas da carreira. */
  playerGoals: number;
  playerAssists: number;
  manOfTheMatch: boolean;
  decision: BotaoDecision;
  turns: number;
  stats: { user: BotaoSideStats; cpu: BotaoSideStats };
  timeline: BotaoTimelineEntry[];
  /** Clipes vetoriais de baixa frequência: apenas os segundos que antecedem cada gol. */
  replays?: BotaoGoalReplay[];
  /** Atalho para o Futbobo: venceu a decisão, logo é campeão. */
  champion: boolean;
};

export type BotaoShot = {
  bodyId: string;
  /** Velocidade inicial em unidades de campo por segundo. */
  vx: number;
  vy: number;
};
import type { BotaoVisualRoster } from "../player-appearance";

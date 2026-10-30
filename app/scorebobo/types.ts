// Scorebobo: o modo de "desenhar a jogada" (estilo Score! Hero) do Modo 3D.
//
// Com o tempo congelado, o jogador desenha com o mouse ou o dedo o caminho da
// bola: passe para um companheiro, bola no espaço, cruzamento ou chute. Ao
// soltar, o tempo volta e a jogada acontece — perto do que foi desenhado, não
// igual (pressa, distância e curva demais custam precisão).
//
// Este arquivo é o CONTRATO entre as três camadas, que não se conhecem:
//   sim/   simulação pura (sem three.js): física, leitura do traço, IA, fases,
//          replay. Implementa `ScoreboboGame`.
//   three/ cena 3D: estádio, bonecos, bola, rede, traço no gramado, câmeras.
//          Implementa `ScoreboboView`. Só LÊ o estado da simulação.
//   *.tsx  interface: rota /scorebobo, seleção de fases, HUD, entrada (ponteiro),
//          estrelas salvas, som. Liga as duas.
//
// Unidades: METROS e SEGUNDOS. Meio campo de ataque: x atravessa o campo
// (-34..34), z vai do meio-campo (0) até a linha do gol atacado
// (PITCH.goalLineZ = 52.5); y para cima. O time do jogador ataca para +z.
// Ângulos (yaw): 0 olha para +z, positivo gira de +z para +x.

import type { PlayerAppearance } from "../player-appearance";

export const PITCH = {
  halfWidth: 34,
  halfwayZ: 0,
  goalLineZ: 52.5,
  /** Metade da largura do gol (7,32 m) e altura do travessão. */
  goalHalfWidth: 3.66,
  goalHeight: 2.44,
  /** Profundidade da rede atrás da linha. */
  goalDepth: 2,
  postRadius: 0.06,
  boxHalfWidth: 20.16,
  boxDepth: 16.5,
  smallBoxHalfWidth: 9.16,
  smallBoxDepth: 5.5,
  penaltySpot: 11,
  arcRadius: 9.15,
  ballRadius: 0.11,
} as const;

export type Vec2 = { x: number; z: number };
export type Vec3 = { x: number; y: number; z: number };

// --------------------------------------------------------------- fases

export type ActorRole = "hero" | "mate" | "defender" | "keeper";

/** O que o boneco está fazendo (a cena traduz em intenção/ação do PlayerFigure). */
export type ActorPose =
  | "idle" // parado, respirando
  | "ready" // pronto, olhando a bola (zagueiro marcando, companheiro esperando)
  | "aim" // quem vai chutar, com o tempo congelado
  | "run" // correndo (vel diz para onde)
  | "kick" // chutando/passando (poseT 0..1)
  | "header" // cabeceando (salta)
  | "volley" // de primeira no ar
  | "receive" // dominando
  | "wall" // na barreira (mãos protegendo)
  | "jump" // barreira saltando / zagueiro disputando no alto
  | "keeperReady" // goleiro na base
  | "dive" // goleiro mergulhando (ver `dive`)
  | "keeperHold" // goleiro com a bola nas mãos
  | "celebrate" // comemorando (ver `celebration`)
  | "dejected"; // lamentando

export type Actor = {
  id: string;
  role: ActorRole;
  team: "home" | "away";
  name: string;
  number: number;
  appearance: PlayerAppearance;
  pos: Vec2;
  /** m/s no chão (para a passada e a inclinação do corpo). */
  vel: Vec2;
  /** Para onde o corpo olha (yaw). */
  facing: number;
  pose: ActorPose;
  /** Progresso 0..1 das poses com tempo (kick, header, volley, dive, receive). */
  poseT: number;
  /**
   * Goleiro: lado (-1 esquerda dele .. 1 direita) e altura 0..1 do mergulho.
   * O resto só descreve o mergulho para a cena (a simulação não lê): de onde
   * ele saiu (`fromX`, x do mundo), onde as mãos vão chegar no plano dele
   * (`handX` x do mundo, `handY` altura em m; mudam com o ajuste no ar) e quanto
   * dura (`dur`, s: o poseT vai de 0 a 1 nesse tempo). As mãos vão de
   * (fromX, 1,25 m) até lá pela curva `1 - (1 - poseT)²`.
   */
  dive?: { side: number; height: number; fromX?: number; handX?: number; handY?: number; dur?: number };
  /** Altura do salto agora (m), para cabeceio/barreira. */
  jump?: number;
  /** Comemoração da coreografia 3D (ids de CELEBRATION_OPTIONS / FigureAction). */
  celebration?: string;
  /** Para onde a cabeça olha (normalmente a bola). */
  look?: Vec3 | null;
  /** Companheiro na mira: o que ainda falta da corrida planejada (a cena desenha a seta). */
  run?: Vec2[] | null;
};

export type BallState = {
  pos: Vec3;
  vel: Vec3;
  /** rad/s; y = efeito lateral (curva), x = por cima/por baixo. Só para o giro desenhado. */
  spin: Vec3;
  /** Quem está com a bola nos pés/mãos (null = em jogo/no ar). */
  owner: string | null;
  inNet: boolean;
};

export type Phase =
  | "intro" // câmera apresentando a jogada, sem controle
  | "aim" // tempo congelado: o jogador desenha
  | "flight" // a jogada acontece
  | "outcome" // gol/defesa/fora/corte: câmera lenta e reação
  | "replay" // replay do gol (estado vem da gravação)
  | "done"; // fase encerrada (vitória ou sem tentativas)

export type KickKind = "ground" | "driven" | "lofted" | "chip" | "shot" | "header" | "volley";

/** O que o traço virou: o plano do chute, mostrado antes de soltar e executado ao soltar. */
export type KickPlan = {
  kind: KickKind;
  /** Chute a gol (true) ou passe/bola no espaço (false). */
  shot: boolean;
  /** Companheiro que vai receber (passe) ou null. */
  receiver: string | null;
  from: Vec3;
  /** Onde a bola deve chegar (no plano do gol para chutes). */
  target: Vec3;
  /** Curva: desvio lateral máximo (m) do meio do caminho; sinal = lado (+x à direita de quem olha +z). */
  curve: number;
  /** Altura máxima do voo (m). */
  apex: number;
  /** Velocidade inicial (m/s). */
  speed: number;
  /** 0..1: quão fiel ao traço o chute sai (1 = perfeito). */
  accuracy: number;
  /** Caminho previsto (sem o erro), para a cena desenhar a sombra do chute. */
  preview: Vec3[];
  /**
   * Trechos do `preview` (0..1 do voo) ao alcance de um zagueiro: a cena pinta de vermelho.
   * `contest`: só disputada na chegada (quem recebe também chega), não cortada no caminho.
   */
  danger?: Array<{ from: number; to: number; contest?: boolean }>;
  /** Passe na corrida: quão longe a força do traço ficou da ideal (0 = na medida). */
  timing?: number;
};

/** Um ponto do traço: tela (px do canvas, origem no canto de cima) + projeções que a cena calculou. */
export type StrokeSample = {
  screen: { x: number; y: number };
  /** ms (performance.now()). */
  t: number;
  /** Raio da câmera cruzando o gramado (null se aponta para o céu). */
  ground: Vec2 | null;
  /** Raio cruzando o plano da linha do gol (z = goalLineZ), se cruza perto do gol. */
  goal: Vec3 | null;
  /** Tamanho do canvas (px CSS): a força do traço é medida em "telas por segundo". Sem ele, vale 800 px de altura. */
  viewport?: { width: number; height: number };
  /** Bola no ar (cabeceio/voleio): o raio cruzando o plano horizontal na altura da bola. */
  air?: Vec2 | null;
};

export type SimEvent =
  | { t: number; type: "whistle" }
  | { t: number; type: "kick"; actor: string; kind: KickKind; power: number }
  | { t: number; type: "receive"; actor: string; aerial: boolean }
  | { t: number; type: "intercept"; actor: string }
  | { t: number; type: "save"; actor: string; caught: boolean }
  | { t: number; type: "post"; part: "post" | "bar" }
  | { t: number; type: "net"; point: Vec3; /** Velocidade da bola entrando na rede (m/s). */ speed?: number }
  | { t: number; type: "goal"; scorer: string; header: boolean; volley: boolean; curve: number; distance: number; topCorner: boolean; firstTime: boolean; passes: number; /** false = entrou, mas não valeu (faltou o requisito da fase). */ valid?: boolean }
  | { t: number; type: "miss"; reason: "wide" | "over" | "short" | "out" }
  | { t: number; type: "control"; actor: string }; // tempo congela: `actor` vira o novo herói

export type Outcome = {
  result: "goal" | "saved" | "miss" | "intercepted" | "post";
  /** Texto curto para o HUD ("GOLAÇO!", "Defendeu!"...). */
  label: string;
  /** Estrelas desta tentativa (0 se não cumpriu o objetivo). */
  stars: 0 | 1 | 2 | 3;
  /** Por que ganhou cada estrela / o que faltou. */
  notes: string[];
  /** Gol: quais regras foram cumpridas (objetivo, 2ª e 3ª estrela), na ordem da fase. */
  met?: [boolean, boolean, boolean];
};

export type GameState = {
  phase: Phase;
  /** Tempo de jogo (s), parado no "aim". */
  time: number;
  /** Fator de câmera lenta sugerido (1 normal, 0.3 no instante do gol...). */
  timeScale: number;
  actors: Actor[];
  ball: BallState;
  /** Quem desenha agora. */
  heroId: string;
  attempt: number;
  attemptsLeft: number;
  passes: number;
  /** Plano do traço em andamento (prévia) ou o executado. */
  plan: KickPlan | null;
  outcome: Outcome | null;
  /** Melhor resultado da fase nesta sessão. */
  bestStars: 0 | 1 | 2 | 3;
  /** No replay: 0..1 do avanço, e o ângulo sugerido de câmera (0, 1, 2...). */
  replay: { progress: number; angle: number } | null;
};

// --------------------------------------------------------------- fases (níveis)

export type StarRule =
  | { kind: "firstAttempt" }
  | { kind: "curve"; min: number } // gol com curva de pelo menos `min` m
  | { kind: "topCorner" }
  | { kind: "header" }
  | { kind: "volley" }
  | { kind: "firstTime" }
  | { kind: "outsideBox" }
  | { kind: "maxPasses"; max: number }
  | { kind: "minPasses"; min: number };

export type ScoreLevel = {
  id: string;
  /** Nome curto ("Curva no ângulo") e a situação ("Falta frontal, 25 m, barreira de quatro"). */
  name: string;
  situation: string;
  /** O objetivo como aparece no HUD ("Marque um gol"). */
  objective: string;
  /** Requisitos para contar como gol válido da fase. */
  require?: StarRule[];
  /** Regras da 2ª e da 3ª estrela (a 1ª é cumprir o objetivo). */
  stars: [StarRule, StarRule];
  attempts: number;
  sky: "day" | "sunset" | "night";
  /** Minuto do jogo no placar (só ambientação). */
  clock: string;
  score: { home: number; away: number };
  hero: { id: string; name: string; number: number; pos: Vec2; appearance?: PlayerAppearance };
  mates: Array<{ id: string; name: string; number: number; pos: Vec2; run?: Vec2[] }>;
  defenders: Array<{ id: string; name: string; number: number; pos: Vec2; behavior: "hold" | "press" | "wall" | "markNearest" }>;
  keeper: { name: string; number: number; skill: number; pos?: Vec2 };
  /** Fase de tutorial: o HUD mostra a mão desenhando. */
  tutorial?: { hint: string; demo: Vec2[] };
};

/** Cores dos dois times. */
export type ScoreTeams = {
  home: { name: string; primary: string; secondary: string };
  away: { name: string; primary: string; secondary: string };
};

// ------------------------------------------------------------- APIs das camadas

/** Implementado em `sim/game.ts`. */
export interface ScoreboboGameApi {
  readonly level: ScoreLevel;
  readonly state: GameState;
  /** Prévia: o que este traço faria (null = traço curto/inválido). */
  planKick(samples: StrokeSample[]): KickPlan | null;
  /** Executa o plano (sai do "aim" para o "flight"). */
  commitKick(plan: KickPlan): void;
  /** Avança `dt` segundos REAIS (a simulação aplica o próprio timeScale). Devolve eventos novos. */
  step(dt: number): SimEvent[];
  /** Pula intro/replay/reação. */
  skip(): void;
  /** Próxima tentativa (depois de um "outcome" sem vitória). */
  nextAttempt(): void;
  /** Recomeça a fase do zero. */
  restart(): void;
  /** Fase ganha e encerrada ("done") com o replay do gol ainda guardado: dá para ver de novo. Opcional. */
  readonly canReplay?: boolean;
  /** Passa o replay do gol de novo (do "done" para o "replay" e de volta ao "done"). Devolve se começou. Opcional. */
  replayAgain?(): boolean;
  /** Solta a gravação do replay e o resto da memória da fase (quem sai dela chama). Opcional. */
  dispose?(): void;
}

/** Implementado em `three/view.ts`. */
export interface ScoreboboViewApi {
  /** Monta a fase (bonecos, cores) e compila os shaders. */
  prepare(level: ScoreLevel, teams: ScoreTeams, state: GameState): Promise<void>;
  /**
   * Projeta um ponto do canvas (px CSS, origem no canto de cima) no gramado e no plano do gol.
   * Com `airY`, também no plano horizontal nessa altura (`air`: bola no ar, cabeceio/voleio).
   */
  project(x: number, y: number, airY?: number): { ground: Vec2 | null; goal: Vec3 | null; air?: Vec2 | null };
  /** O inverso: onde um ponto do mundo aparece no canvas (px CSS), ou null atrás da câmera. Serve para o traço começar na bola. */
  screenOf(point: Vec3): { x: number; y: number } | null;
  /** Traço do jogador sobre o gramado (null apaga) e a prévia do plano. */
  setStroke(points: Vec3[] | null, plan: KickPlan | null): void;
  /** Desenha um quadro. `events` = eventos novos desde o último quadro. */
  render(state: GameState, dt: number, events: SimEvent[]): void;
  dispose(): void;
  /** Mira parada: câmera assentada e nenhum fade em andamento (o laço pode desenhar menos quadros). Opcional. */
  readonly calm?: boolean;
  /** Números do último quadro (draw calls, triângulos, ms de CPU, resolução). Opcional. */
  stats?(): { calls: number; triangles: number; points: number; cpuMs: number; pixelRatio: number; width: number; height: number };
  /** Resolução adaptável: recebe o tempo real entre quadros desenhados (s). Opcional. */
  adaptResolution?(frameDt: number): void;
  /** A resolução adaptável já está no piso (não há mais o que baixar). Opcional. */
  readonly atResolutionFloor?: boolean;
  /** Baixar a resolução já não ajuda (no piso, ou desceu e não melhorou: gargalo de CPU). Opcional. */
  readonly resolutionExhausted?: boolean;
  /** Mira: o jogador gira a câmera para os lados em volta da bola (rad, soma ao giro atual; o limite fica com a cena). Opcional. */
  turnAim?(radians: number): void;
  /** Mira: volta a câmera ao enquadramento automático. Opcional. */
  resetAimTurn?(): void;
  /** Mira: quanto o jogador girou a câmera agora (rad; 0 = enquadramento automático). Opcional. */
  readonly aimTurn?: number;
}

// app/bobonline/types.ts
import type { PlayerAppearance } from "../player-appearance";
import type { BotaoDecision } from "../botao/types";

export const BOB_TEAM_VERSION = 1;
export const BOB_MAX_TEAMS = 6;

export type BobPlayer = {
  /** "p0".."p4": estável dentro do time; o setup prefixa com o lado. */
  id: string;
  name: string;          // 2..18
  number: number;        // 1..99, único no time
  appearance: PlayerAppearance; // normalizado; kitPattern é sobrescrito pelo do time
};

export type BobCrestShape = 0 | 1 | 2 | 3; // Clássico, Redondo, Diamante, Flâmula

export type BobTeam = {
  version: 1;
  id: string;            // "bob-" + 10 chars, nunca id de clube real
  name: string;          // 2..24
  shortName: string;     // 2..14
  abbr: string;          // 2..4 [A-Z0-9]
  primary: string;       // "#rrggbb"
  secondary: string;     // "#rrggbb"
  kitPattern: number;    // 0..11 (KIT_PATTERN_NAMES)
  crest: BobCrestShape;
  players: BobPlayer[];  // exatamente 5
  createdAt: number;
  updatedAt: number;
};

export type BobProfile = {
  version: 1;
  nickname: string;                         // 2..16
  hints: { leaveApp?: true };               // avisos de uma vez só já vistos
};

export type RoomFormat = "x1" | "t4" | "t8";
export type RulesPresetId = "flash" | "classic" | "marathon";
export type CpuLevel = 2 | 3 | 4;
export type PeerPresence = "online" | "unstable" | "away" | "offline";

export type RoomMember = {
  playerId: string;       // base32 de SHA-256(pub), 10 chars (§3.4)
  pub: string;            // chave pública ECDSA P-256 (raw, base64url): qualquer anfitrião verifica quem volta
  nickname: string;
  teamHash: string;       // chave em RoomTeams
  joinOrder: number;      // 0 = quem criou; nunca reaproveitado
  role: "player" | "spectator";
  ready: boolean;         // o anfitrião é sempre true
  presence: PeerPresence; // visão do anfitrião
  left: boolean;
  kicked?: boolean;
};

export type BracketEntrant = { id: string /* playerId ou "cpu:<i>" */; kind: "human" | "cpu"; teamHash: string };
export type BracketSide = { entrantId: string } | null;   // null = ainda não definido (ou folga, ver kind)
export type BracketMatchKind = "duel" | "cpu-human" | "cpu-cpu" | "bye";
export type BracketMatchStatus = "waiting" | "ready-check" | "playing" | "done";
export type WalkoverKind = "abandon" | "timeout" | "double" | "bye";

export type BracketResult = {
  matchId: string;               // id da partida do motor (sala-rodada-jogo-replay)
  winner: "home" | "away";
  homeGoals: number; awayGoals: number;
  homePens: number | null; awayPens: number | null;
  decision: BotaoDecision | "walkover";
  walkover?: WalkoverKind;
  resultHash: string;            // hashJson do resto do objeto (sem reportedBy/at)
  reportedBy: string;            // playerId ou "host"
  at: number;                    // relógio do anfitrião
};

/** Resultado de CPU × CPU calculado UMA vez e lacrado no snapshot; a interface esconde até revealAt. */
export type SealedCpuResult = {
  result: BracketResult;
  goals: Array<{ side: "home" | "away"; clock: number; period: number; text: string }>; // para o "ao vivo" virtual
  regulationSeconds: number;
  startedAt: number;             // relógio do anfitrião
  revealAt: number;              // relógio do anfitrião
};

export type BracketMatch = {
  id: string;                    // "r1m0", "r2m1", "f"... (estável)
  round: number;                 // 1..rounds
  index: number;
  home: BracketSide;             // lado "user" do motor
  away: BracketSide;             // lado "cpu" do motor
  kind: BracketMatchKind | null; // definido quando os dois lados existem
  status: BracketMatchStatus;
  authority: string | null;      // playerId que roda a partida (humano de casa, ou o humano no cpu-human)
  replay: number;                // 0; revanche do X1 incrementa
  freeBy: string[];              // humanos que já saíram da tela de resultado da partida anterior (§4.3)
  holdUntil: number | null;      // relógio do anfitrião: o pronto não começa antes disso (resultado anterior + 30 s)
  readyBy: string[];             // playerIds que apertaram "Estou pronto"
  readyDeadline: number | null;  // relógio do anfitrião
  startedAt: number | null;      // relógio do anfitrião
  sealed: SealedCpuResult | null;// só cpu-cpu
  result: BracketResult | null;
};

export type Bracket = { size: 2 | 4 | 8; rounds: number; entrants: BracketEntrant[]; matches: BracketMatch[] };

export type RoomSettings = {
  format: RoomFormat; rules: RulesPresetId; cpuLevel: CpuLevel;
  fillWithCpu: boolean; allowSpectators: boolean; locked: boolean;
};
export type RoomStage = "lobby" | "running" | "done";

export type RoomSnapshot = {
  v: 1;
  code: string;
  epoch: number;            // sobe a cada troca de anfitrião
  version: number;          // sobe a cada mudança publicada
  hostId: string;
  hostNow: number;          // Date.now() do anfitrião ao publicar
  seed: number;             // sorteio da chave e dos times da CPU
  settings: RoomSettings;
  passwordProof: string | null;   // para qualquer anfitrião novo conferir quem entra
  members: RoomMember[];    // ordem de joinOrder
  nextJoinOrder: number;
  banned: string[];         // playerIds removidos
  stage: RoomStage;
  bracket: Bracket | null;
  series: { home: number; away: number } | null;  // X1 com revanches (home = quem criou)
  rematch: { want: string[] } | null;             // X1: quem pediu revanche
  createdAt: number;
};

/** Times por hash (o snapshot só carrega o hash; o time vai uma vez por aparelho). */
export type RoomTeams = Record<string, BobTeam>;

export type LiveInfo = {
  matchId: string; bracketId: string;
  score: { home: number; away: number };
  pens: { home: number; away: number } | null;
  clock: number; period: number; phase: string;
  text: string | null;      // último lance da timeline
  // quem recebe usa a hora de chegada, nunca um relógio do remetente
};

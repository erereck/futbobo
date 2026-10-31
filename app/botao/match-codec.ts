// Codec da partida para o Bobonline: serializar, restaurar, sobrescrever no
// lugar e tirar o hash do estado do motor, mais o espelho do resultado.
//
// Só lê o motor; nenhuma função daqui muda física ou regra. Nenhum modo atual
// importa este arquivo.

import {
  canShoot,
  otherSide,
  penaltyShooter,
  shotSpeedForBody,
  type BotaoBody,
  type BotaoMatchState,
} from "./engine";
import { createRng, hashSeed, type Rng } from "./rng";
import type {
  BotaoMatchResult,
  BotaoMatchSetup,
  BotaoShot,
  BotaoSide,
} from "./types";

export const BOTAO_ENGINE_REV = 1;   // sobe quando a física/regra muda (vai no hello e no net.json "current")

/**
 * Estado sem `rng` e sem `setup`, seguro para JSON. Os quatro postes vão sem
 * `mass` (Infinity não existe em JSON); `restoreMatch` devolve o Infinity.
 */
export type SerializedMatch = Omit<BotaoMatchState, "rng" | "setup"> & { codec: 1; rngCursor: number };

/** Teto do cursor aceito na restauração: uma partida real fica na casa dos milhares. */
const MAX_RNG_CURSOR = 1_000_000;
const SIDES: readonly BotaoSide[] = ["user", "cpu"];

// ---------------------------------------------------------------------------
// Serializar e restaurar
// ---------------------------------------------------------------------------

/** O snapshot vem da rede: "__proto__" nunca vira chave de objeto do estado. */
const UNSAFE_KEY = "__proto__";

/** Cópia profunda que sobrevive a JSON: -0 vira 0, não finito vira 0 e `undefined` some, como no JSON. */
function jsonSafe(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? value + 0 : 0;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : jsonSafe(item)));
  const record = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    const item = record[key];
    if (item === undefined || typeof item === "function" || key === UNSAFE_KEY) continue;
    copy[key] = jsonSafe(item);
  }
  return copy;
}

function serializeBody(body: BotaoBody): BotaoBody {
  const copy = jsonSafe(body) as Partial<BotaoBody>;
  if (body.kind === "post") delete copy.mass;
  return copy as BotaoBody;
}

/** Corpo novo a partir do serializado. O poste ganha o `mass` de volta no lugar de sempre (logo depois de `radius`). */
function restoreBody(source: BotaoBody): BotaoBody {
  const record = source as unknown as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if ((source.kind === "post" && key === "mass") || key === UNSAFE_KEY) continue;
    body[key] = jsonSafe(record[key]);
    if (source.kind === "post" && key === "radius") body.mass = Number.POSITIVE_INFINITY;
  }
  if (source.kind === "post") body.mass = Number.POSITIVE_INFINITY;
  return body as BotaoBody;
}

/** Mesma rng de `createMatch`, avançada até o cursor. */
function rngAt(setup: BotaoMatchSetup, cursor: number): Rng {
  const rng = createRng(hashSeed(setup.seed, setup.matchId));
  for (let index = 0; index < cursor; index += 1) rng.next();
  return rng;
}

/** Chaves do serializado que não viram campo do estado (setup e rng nunca vêm de fora). */
const SKIPPED_ON_RESTORE = new Set(["codec", "rngCursor", "setup", "rng", UNSAFE_KEY]);

function assertSerialized(data: SerializedMatch) {
  if (!data || data.codec !== 1) throw new Error("match-codec: formato de partida desconhecido");
  if (!Number.isSafeInteger(data.rngCursor) || data.rngCursor < 0 || data.rngCursor > MAX_RNG_CURSOR) {
    throw new Error("match-codec: cursor da rng inválido");
  }
  if (!Array.isArray(data.bodies)) throw new Error("match-codec: partida sem corpos");
}

/** JSON-safe: NaN→0 em keeper.vx, -0→0, posts sem mass. Não compartilha nenhum objeto com o estado. */
export function serializeMatch(state: BotaoMatchState): SerializedMatch {
  const record = state as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (key === "rng" || key === "setup") continue;
    if (key === "bodies") data.bodies = state.bodies.map(serializeBody);
    else if (record[key] !== undefined) data[key] = jsonSafe(record[key]);
  }
  data.codec = 1;
  data.rngCursor = state.rng.cursor();
  return data as SerializedMatch;
}

/**
 * Estado novo a partir do serializado: rng = createRng(hashSeed(seed, matchId)) + cursor × next(); postes com
 * mass = Infinity. `setup` entra como veio (o mesmo objeto, como em `createMatch`); `data` não é alterado nem reaproveitado.
 */
export function restoreMatch(setup: BotaoMatchSetup, data: SerializedMatch): BotaoMatchState {
  assertSerialized(data);
  const record = data as unknown as Record<string, unknown>;
  const state: Record<string, unknown> = { setup, rng: rngAt(setup, data.rngCursor) };
  for (const key of Object.keys(record)) {
    if (SKIPPED_ON_RESTORE.has(key)) continue;
    state[key] = key === "bodies" ? data.bodies.map(restoreBody) : jsonSafe(record[key]);
  }
  return state as unknown as BotaoMatchState;
}

/** Copia os campos do corpo serializado para dentro do objeto que já existe. */
function copyBodyInto(target: BotaoBody, source: BotaoBody) {
  const into = target as unknown as Record<string, unknown>;
  const from = source as unknown as Record<string, unknown>;
  for (const key of Object.keys(into)) {
    if (!(key in from)) into[key] = undefined;
  }
  for (const key of Object.keys(from)) {
    if (key !== UNSAFE_KEY) into[key] = jsonSafe(from[key]);
  }
  if (target.kind === "post") target.mass = Number.POSITIVE_INFINITY;
}

/** No lugar: mesmo objeto de estado, mesmo setup, e os MESMOS objetos de corpo (copia campo a campo por id; corpo novo só se o id não existir). */
export function overwriteMatch(target: BotaoMatchState, data: SerializedMatch): void {   // version = max(target.version, data.version) + 1
  assertSerialized(data);
  const version = Math.max(target.version, data.version) + 1;

  // A rng é a mesma sequência (mesmo setup): anda para a frente no mesmo objeto, ou recomeça se precisar voltar.
  const cursor = target.rng.cursor();
  if (cursor < data.rngCursor) {
    for (let index = cursor; index < data.rngCursor; index += 1) target.rng.next();
  } else if (cursor > data.rngCursor) {
    target.rng = rngAt(target.setup, data.rngCursor);
  }

  // Corpos: a ordem é a do serializado (ela decide a ordem das colisões); objetos reaproveitados por id.
  const byId = new Map(target.bodies.map((body) => [body.id, body] as const));
  const used = new Set<BotaoBody>();
  const bodies = data.bodies.map((source) => {
    const existing = byId.get(source.id);
    if (!existing || used.has(existing)) return restoreBody(source);
    used.add(existing);
    copyBodyInto(existing, source);
    return existing;
  });
  target.bodies.length = 0;
  target.bodies.push(...bodies);

  const into = target as unknown as Record<string, unknown>;
  const from = data as unknown as Record<string, unknown>;
  for (const key of Object.keys(from)) {
    if (SKIPPED_ON_RESTORE.has(key) || key === "bodies" || key === "version") continue;
    into[key] = jsonSafe(from[key]);
  }
  for (const key of Object.keys(into)) {
    if (key === "setup" || key === "rng" || key === "bodies" || key === "version") continue;
    if (!(key in from)) into[key] = undefined;
  }
  target.version = version;
}

// ---------------------------------------------------------------------------
// Hashes
// ---------------------------------------------------------------------------

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const numberBytes = new DataView(new ArrayBuffer(8));

/** FNV-1a de 32 bits sobre bytes. */
class Fnv {
  private hash = FNV_OFFSET;

  byte(value: number) {
    this.hash = Math.imul(this.hash ^ (value & 0xff), FNV_PRIME);
  }

  /** Os 8 bytes do float64 (little-endian). -0 vira +0; todo NaN vira o mesmo NaN. */
  num(value: number) {
    if (Number.isNaN(value)) {
      // Bytes do NaN quieto canônico escritos à mão: o DataView pode gravar qualquer NaN.
      for (const byte of [0, 0, 0, 0, 0, 0, 0xf8, 0x7f]) this.byte(byte);
      return;
    }
    numberBytes.setFloat64(0, value === 0 ? 0 : value, true);
    for (let index = 0; index < 8; index += 1) this.byte(numberBytes.getUint8(index));
  }

  nums(...values: number[]) {
    for (const value of values) this.num(value);
  }

  /** Tamanho e depois cada unidade UTF-16 (dois bytes). */
  text(value: string) {
    this.num(value.length);
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      this.byte(code);
      this.byte(code >>> 8);
    }
  }

  /** Bytes UTF-8 do texto (pares substitutos viram um código; substituto solto vira 3 bytes). */
  utf8(value: string) {
    for (let index = 0; index < value.length; index += 1) {
      let code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
        const low = value.charCodeAt(index + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          index += 1;
        }
      }
      if (code < 0x80) {
        this.byte(code);
      } else if (code < 0x800) {
        this.byte(0xc0 | (code >> 6));
        this.byte(0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        this.byte(0xe0 | (code >> 12));
        this.byte(0x80 | ((code >> 6) & 0x3f));
        this.byte(0x80 | (code & 0x3f));
      } else {
        this.byte(0xf0 | (code >> 18));
        this.byte(0x80 | ((code >> 12) & 0x3f));
        this.byte(0x80 | ((code >> 6) & 0x3f));
        this.byte(0x80 | (code & 0x3f));
      }
    }
  }

  hex() {
    return (this.hash >>> 0).toString(16).padStart(8, "0");
  }
}

/**
 * FNV-1a 8 hex sobre bits float64 (DataView little-endian), -0→+0, NaN→NaN canônico.
 * Cobre fase, vez, relógio, placar, contadores, formações, cursor da rng, estatísticas, corpos (menos postes) e
 * pênaltis. Fica de fora `version`, `setup` e `result`. Só faz sentido em descanso (ver `isRestPoint`).
 */
export function hashMatch(state: BotaoMatchState): string {
  const fnv = new Fnv();
  fnv.text(`${state.phase}|${state.turn}`);
  fnv.nums(
    state.period,
    state.totalPeriods,
    state.clock,
    state.periodSeconds,
    state.score.user,
    state.score.cpu,
    state.turns,
    state.idleTurns,
    state.ballTouches,
    state.turnTouchMark,
  );
  fnv.nums(
    state.formationIndex.user,
    state.formationIndex.cpu,
    state.userSlot,
    state.rng.cursor(),
    state.timeline.length,
  );
  for (const side of SIDES) {
    const stats = state.stats[side];
    fnv.nums(stats.flicks, stats.touches, stats.posts);
  }
  fnv.nums(state.clockPausedForKickoff ? 1 : 0, state.finalShotGrace ? 1 : 0);
  fnv.text(state.lastGoal?.side ?? "-");
  fnv.num(state.touches.length);
  for (const touch of state.touches) fnv.text(touch.bodyId);
  for (const body of state.bodies) {
    if (body.kind === "post") continue;
    fnv.text(body.id);
    fnv.nums(body.x, body.y, body.vx, body.vy, body.stamina, body.slot, body.distanceActive);
  }
  const penalties = state.penalties;
  if (penalties) {
    fnv.text("pen");
    fnv.num(penalties.round);
    fnv.text(penalties.turn);
    fnv.nums(penalties.score.user, penalties.score.cpu);
    for (const side of SIDES) {
      const results = penalties.results[side];
      fnv.num(results.length);
      for (const result of results) fnv.num(result === null ? 2 : result ? 1 : 0);
    }
    for (const side of SIDES) {
      const order = penalties.order[side];
      fnv.num(order.length);
      for (const id of order) fnv.text(id);
    }
    fnv.nums(
      penalties.keeperDirection,
      penalties.keeperSpeed,
      penalties.shotInFlight ? 1 : 0,
      penalties.suddenDeath ? 1 : 0,
    );
  } else {
    fnv.text("-");
  }
  fnv.text(state.penaltyReason ?? "-");
  return fnv.hex();
}

/** JSON com chaves ordenadas; o resto segue o JSON comum (undefined some, NaN/Infinity viram null, -0 vira 0). */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item === undefined || typeof item === "function" || typeof item === "symbol") continue;
    parts.push(`${JSON.stringify(key)}:${canonicalJson(item)}`);
  }
  return `{${parts.join(",")}}`;
}

export function hashSetup(setup: BotaoMatchSetup): string {
  return hashJson(setup);
}

/** JSON canônico (chaves ordenadas), FNV-1a 8 hex sobre os bytes UTF-8. */
export function hashJson(value: unknown): string {
  const fnv = new Fnv();
  fnv.utf8(canonicalJson(value));
  return fnv.hex();
}

// ---------------------------------------------------------------------------
// Pontos de descanso e validação de toque remoto
// ---------------------------------------------------------------------------

/** `${turns}.${period}.${phase}.${turn}.${pen ? `${pen.turn}${pen.results.user.length}-${pen.results.cpu.length}` : "-"}` */
export function matchKey(state: BotaoMatchState): string {
  const pen = state.penalties;
  const penalty = pen ? `${pen.turn}${pen.results.user.length}-${pen.results.cpu.length}` : "-";
  return `${state.turns}.${state.period}.${state.phase}.${state.turn}.${penalty}`;
}

/**
 * Necessário, não suficiente: o driver ainda exige "sem cobrança pendente de commit" (§5.3).
 * "finished" é sempre descanso: a última cobrança da disputa encerra a partida com `shotInFlight` ainda true.
 */
export function isRestPoint(state: BotaoMatchState): boolean {
  if (state.phase === "finished") return true;
  return state.phase !== "resolving" && !state.penalties?.shotInFlight;
}

/**
 * Valida um toque que chegou pela rede.
 * - vx/vy não finitos, ou corpo que não é botão → null (o controlador transforma em `idle`/`pmiss`).
 * - Velocidade acima de `shotSpeedForBody` (com folga de 1e-9) é reduzida até o teto, na mesma direção.
 * - Lado e vez só dá para conferir no ponto exato da ação: passe `atKey` (o `k` da ação). Se `matchKey(state)`
 *   for igual, "open" exige `canShoot` e "penalty" exige a cobrança armada e o batedor da vez. Sem `atKey`, ou com o
 *   estado em outro ponto (a jogada anterior ainda rolando, ação na fila), essa parte fica com o motor na hora de
 *   aplicar (`beginShot`/`beginPenaltyShot` recusam), para nunca recusar um toque honesto que chegou cedo.
 * O teto usa o fôlego de agora; chamado de novo na hora de aplicar, ele é exato.
 * Devolve um toque novo só com `bodyId`, `vx` e `vy`, ou null.
 */
export function validateRemoteShot(
  state: BotaoMatchState,
  shot: BotaoShot,
  kind: "open" | "penalty",
  atKey?: string,
): BotaoShot | null {
  if (!shot || typeof shot.bodyId !== "string") return null;
  if (typeof shot.vx !== "number" || typeof shot.vy !== "number") return null;
  if (!Number.isFinite(shot.vx) || !Number.isFinite(shot.vy)) return null;
  const disc = state.bodies.find((body) => body.id === shot.bodyId);
  if (!disc || disc.kind !== "disc") return null;
  if (atKey !== undefined && atKey === matchKey(state)) {
    if (kind === "penalty") {
      const penalties = state.penalties;
      if (!penalties || penalties.shotInFlight || state.phase !== "penalties") return null;
      if (penaltyShooter(state).id !== shot.bodyId) return null;
    } else if (!canShoot(state, shot.bodyId)) {
      return null;
    }
  }
  const cap = shotSpeedForBody(disc);
  const speed = Math.hypot(shot.vx, shot.vy);
  if (speed <= cap * (1 + 1e-9)) return { bodyId: shot.bodyId, vx: shot.vx, vy: shot.vy };
  const scale = cap / speed;
  return { bodyId: shot.bodyId, vx: shot.vx * scale, vy: shot.vy * scale };
}

// ---------------------------------------------------------------------------
// Espelho (visão do lado "cpu")
// ---------------------------------------------------------------------------

/**
 * Visão do lado "cpu": win↔loss, For↔Against, pênaltis e stats trocados, timeline[].side trocado e byUser = false. Replays NÃO mudam.
 * O outro lado não tem protagonista da carreira: playerGoals/playerAssists 0, manOfTheMatch false, sem os campos de ex-clube;
 * `champion` acompanha o resultado espelhado. Não altera `result`.
 */
export function mirrorResult(result: BotaoMatchResult): BotaoMatchResult {
  const outcome = result.outcome === "win" ? "loss" : result.outcome === "loss" ? "win" : "draw";
  const mirrored: BotaoMatchResult = {
    ...result,
    outcome,
    goalsFor: result.goalsAgainst,
    goalsAgainst: result.goalsFor,
    penaltyFor: result.penaltyAgainst,
    penaltyAgainst: result.penaltyFor,
    playerGoals: 0,
    playerAssists: 0,
    manOfTheMatch: false,
    stats: { user: { ...result.stats.cpu }, cpu: { ...result.stats.user } },
    timeline: result.timeline.map((entry) => ({ ...entry, side: otherSide(entry.side), byUser: false })),
    champion: outcome === "win",
  };
  delete mirrored.formerClubCelebrations;
  delete mirrored.formerClubGoalCount;
  if (result.manager) {
    mirrored.manager = {
      ...result.manager,
      substitutions: result.manager.substitutions.map((item) => ({ ...item, side: otherSide(item.side) })),
    };
  }
  return mirrored;
}

/**
 * userTeam↔cpuTeam (só para textos/estatísticas do resultado). Troca junto tudo o que é por lado
 * (squads, visuals.user/cpu, managerRosters, formações escolhidas) e inverte `userIsHost`. Não altera `setup`.
 */
export function mirrorSetup(setup: BotaoMatchSetup): BotaoMatchSetup {
  const mirrored: BotaoMatchSetup = {
    ...setup,
    userIsHost: !setup.userIsHost,
    userTeam: setup.cpuTeam,
    cpuTeam: setup.userTeam,
  };
  if (setup.squads) mirrored.squads = { user: setup.squads.cpu, cpu: setup.squads.user };
  if (setup.visuals) mirrored.visuals = { ...setup.visuals, user: setup.visuals.cpu, cpu: setup.visuals.user };
  if (setup.managerRosters) mirrored.managerRosters = { user: setup.managerRosters.cpu, cpu: setup.managerRosters.user };
  delete mirrored.userFormationId;
  delete mirrored.cpuFormationId;
  if (setup.cpuFormationId !== undefined) mirrored.userFormationId = setup.cpuFormationId;
  if (setup.userFormationId !== undefined) mirrored.cpuFormationId = setup.userFormationId;
  return mirrored;
}

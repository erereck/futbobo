// Prova de identidade do motor do botão (Bobonline, design §6.3).
//
// Uso, sempre de uma cópia isolada do repo:
//   node scripts/engine-identity.mjs [--rev fafd053] [--runs 120] [--sims 200] [--repo <repo com .git>]
//                                    [--parts lockstep,sims,newpath] [--write-golden]
//
// - lockstep: o motor da revisão `--rev` (git show) e o do working tree rodam a mesma partida lado a lado.
//   Depois de CADA chamada ao motor compara o estado inteiro (campo a campo, -0 e NaN estritos), o cursor
//   da rng, `version` e o que a chamada devolveu. Variantes: normal, técnico, reserva, local e pênaltis;
//   cérebro da CPU na rng da partida ou separado; dt 1/120 ou 1/60.
// - sims: `simulateBotaoMatch` igual nos dois motores para `--sims` setups.
// - newpath: só no motor do working tree. Um aparelho "escritor" e um "receptor" jogam a mesma partida
//   do jeito do Bobonline (relógio remoto, demora dos dois lados, filas de pênalti, goleiro posto, codec
//   no meio) e precisam chegar ao mesmo estado em todo descanso.
// - --write-golden: grava tests/fixtures/botao-engine-golden.json com o motor do working tree e acrescenta
//   a revisão em tests/fixtures/botao-engine-revs.json. Rode antes de mexer no motor, ou depois de subir
//   BOTAO_ENGINE_REV quando a física mudar de propósito.
//
// O `git show` roda em `--repo` (padrão: a raiz deste script). A cópia isolada não tem .git, então passe o repo.
// Sai com código 1 na primeira diferença, mostrando seed, variante e chamada.
//
// Também é biblioteca: tests/botao-engine-identity.test.mjs importa daqui o roteiro do golden.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_FILES = ["engine", "types", "rng", "formations", "cpu", "simulate", "kits"];
const GOLDEN_PATH = join(ROOT, "tests", "fixtures", "botao-engine-golden.json");
const REVS_PATH = join(ROOT, "tests", "fixtures", "botao-engine-revs.json");

// ---------------------------------------------------------------------------
// Hash e JSON canônico (independentes do motor testado)
// ---------------------------------------------------------------------------

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/** FNV-1a sobre as unidades UTF-16 do texto (dois bytes por unidade). */
export function fnvText(hash, text) {
  let h = hash >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h = Math.imul(h ^ (code & 0xff), FNV_PRIME);
    h = Math.imul(h ^ (code >>> 8), FNV_PRIME);
  }
  return h >>> 0;
}

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** Mistura os bits do float64 no hash. -0 e +0 contam diferente; todo NaN conta igual. */
function fnvNumber(hash, value) {
  let h = hash >>> 0;
  if (Number.isNaN(value)) return Math.imul(h ^ 0x7ff8, FNV_PRIME) >>> 0;
  f64[0] = value;
  h = Math.imul(h ^ u32[0], FNV_PRIME);
  h = Math.imul(h ^ u32[1], FNV_PRIME);
  return h >>> 0;
}

export function hex8(hash) {
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** JSON com chaves ordenadas; -0, NaN e Infinity ficam explícitos (o JSON comum os apaga). */
export function canonicalJson(value) {
  if (value === null) return "null";
  switch (typeof value) {
    case "number":
      if (Number.isNaN(value)) return '"NaN"';
      if (!Number.isFinite(value)) return value > 0 ? '"Infinity"' : '"-Infinity"';
      return Object.is(value, -0) ? "-0" : JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((item) => (item === undefined || typeof item === "function" ? "null" : canonicalJson(item))).join(",")}]`;
      }
      return `{${Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined && typeof value[key] !== "function")
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
        .join(",")}}`;
    default:
      return "null";
  }
}

/** O estado inteiro como texto canônico: a rng entra pelo cursor. */
export function canonicalState(state) {
  return canonicalJson({ ...state, rng: state.rng.cursor() });
}

// ---------------------------------------------------------------------------
// rng do roteiro (fora do motor, para o roteiro não mudar quando o motor mudar)
// ---------------------------------------------------------------------------

/** Mesma forma do `Rng` do motor (serve de cérebro separado para a CPU). */
export function driverRng(seed) {
  let s = (Math.floor(Math.abs(seed)) || 1) >>> 0;
  let calls = 0;
  const next = () => {
    calls += 1;
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
    cursor: () => calls,
  };
}

export function seedOf(...parts) {
  return fnvText(FNV_OFFSET, parts.join("|"));
}

// ---------------------------------------------------------------------------
// Setups aleatórios dos modos que já existem (nunca squads: o golden vem do motor anterior)
// ---------------------------------------------------------------------------

const POSITIONS = ["GOL", "ZAG", "VOL", "MEI", "CA", "LD", "LE", "PD"];
export const LEGACY_VARIANTS = ["plain", "manager", "entry", "local", "pens"];

const DEFAULT_RULES = {
  goalLimit: 3,
  halfSeconds: 120,
  halves: 1,
  extraHalves: 1,
  extraSeconds: 45,
  penalties: true,
  penaltyRounds: 5,
  clockScale: 1,
};

/** Setup do modo `variant` ("pens" é um setup normal que começa direto nos pênaltis). */
export function legacySetup(seed, variant) {
  const r = driverRng(seedOf(seed, "setup", variant));
  const strength = () => 60 + r.int(0, 32);
  const setup = {
    matchId: `id-${variant}-${seed}`,
    seed,
    competitionName: "Teste",
    stageName: "Final",
    neutralVenue: true,
    userIsHost: r.chance(0.5),
    player: { name: "P1", number: 10, position: POSITIONS[r.int(0, 7)], overall: 55 + r.int(0, 40) },
    userTeam: { id: `a${r.int(0, 9)}`, name: "A", shortName: "A", abbr: "AA", primary: "#d01010", secondary: "#fff", strength: strength() },
    cpuTeam: { id: `b${r.int(0, 9)}`, name: "B", shortName: "B", abbr: "BB", primary: "#1030d0", secondary: "#fff", strength: strength() },
    difficulty: 1 + r.int(0, 4),
    rules: { ...DEFAULT_RULES },
  };
  if (r.chance(0.3)) {
    setup.rules = {
      ...setup.rules,
      goalLimit: r.int(0, 4),
      halfSeconds: 40 + r.int(0, 100),
      halves: 1 + r.int(0, 1),
      extraHalves: r.int(0, 1),
      extraSeconds: 20 + r.int(0, 30),
      penaltyRounds: 3 + r.int(0, 2),
    };
  }
  if (r.chance(0.2)) setup.player = { ...setup.player, power: 40 + r.int(0, 60), control: 40 + r.int(0, 60) };
  if (variant === "manager") {
    const roster = (side) => ({
      starters: Array.from({ length: 5 }, (_, index) => {
        const player = { id: `${side}-p${index}`, name: `${side}${index}`, number: index + 2, position: POSITIONS[(index + r.int(0, 3)) % 8], overall: 60 + r.int(0, 30) };
        if (r.chance(0.5)) player.power = 40 + r.int(0, 60);
        if (r.chance(0.5)) player.control = 40 + r.int(0, 60);
        return player;
      }),
      bench: Array.from({ length: 3 }, (_, index) => ({ id: `${side}-b${index}`, name: `${side}b${index}`, number: 20 + index, position: POSITIONS[index], overall: 60 + r.int(0, 30) })),
    });
    setup.managerMode = true;
    setup.managerRosters = { user: roster("u"), cpu: roster("c") };
  }
  if (variant === "entry") {
    setup.entry = { role: "reserve", period: 1, clock: 30 + r.int(0, 80), score: { user: r.int(0, 2), cpu: r.int(0, 2) }, timeline: [] };
  }
  if (variant === "local") setup.localControl = true;
  return setup;
}

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------
// Golden: roteiro barato de toques aleatórios (o teste rápido reexecuta isto)
// ---------------------------------------------------------------------------

export const GOLDEN_FORMAT = 1;
export const GOLDEN_SCENARIOS = 60;
export const GOLDEN_SIMS = 4;
const GOLDEN_CPU_FROM = 50; // os 10 últimos cenários jogam com a CPU no nível 1

export function goldenScenario(index) {
  const variant = LEGACY_VARIANTS[index % LEGACY_VARIANTS.length];
  const r = driverRng(seedOf("golden", index));
  const seed = 1000 + r.int(0, 899999);
  const cpu = index >= GOLDEN_CPU_FROM;
  return {
    id: `g${String(index).padStart(2, "0")}-${variant}${cpu ? "-cpu" : ""}`,
    variant,
    driverSeed: r.int(1, 2 ** 31 - 1),
    dtHz: r.chance(0.5) ? 120 : 60,
    cpuSkill: cpu ? 1 : 0,
    sharedBrain: cpu ? index % 2 === 0 : false,
    startInPenalties: variant === "pens",
    setup: cloneJson(legacySetup(seed, variant)),
  };
}

export function goldenSim(index) {
  const variant = LEGACY_VARIANTS[index % 4];
  return { id: `s${index}-${variant}`, setup: cloneJson(legacySetup(7000 + index * 31, variant)) };
}

/** Toque aleatório de humano: arraste em volta do botão, às vezes fraco demais (vira skipTurn). */
function randomOpenShot(E, state, drv) {
  const discs = E.discsOf(state, state.turn);
  const ball = E.ballOf(state);
  const disc = discs[drv.int(0, discs.length - 1)];
  let angle;
  if (drv.chance(0.65)) {
    angle = Math.atan2(ball.y - disc.y, ball.x - disc.x) + drv.range(-0.35, 0.35);
  } else {
    angle = drv.range(-Math.PI, Math.PI);
  }
  const pull = drv.range(2, 140);
  const aim = E.aimFromDrag(disc, disc.x - Math.cos(angle) * pull, disc.y - Math.sin(angle) * pull);
  return { bodyId: disc.id, vx: aim.vx, vy: aim.vy };
}

/** Cobrança aleatória: mira em algum ponto da linha do gol, com força variada. */
function randomPenaltyShot(E, state, drv) {
  const shooter = E.penaltyShooter(state);
  const ball = E.ballOf(state);
  const goalY = E.attackGoalY(state.penalties.turn);
  const targetX = drv.range(E.GOAL_LEFT - 30, E.GOAL_RIGHT + 30);
  const dx = targetX - shooter.x;
  const dy = goalY - shooter.y + (ball.y - shooter.y) * 0.1;
  const length = Math.hypot(dx, dy) || 1;
  const speed = E.shotSpeedForBody(shooter) * drv.range(0.04, 1);
  return { bodyId: shooter.id, vx: (dx / length) * speed, vy: (dy / length) * speed };
}

/** Mistura barata dos corpos a cada passo de física (sem JSON). */
function mixBodies(hash, state) {
  let h = hash;
  for (const body of state.bodies) {
    if (body.kind === "post") continue;
    h = fnvNumber(h, body.x);
    h = fnvNumber(h, body.y);
    h = fnvNumber(h, body.vx);
    h = fnvNumber(h, body.vy);
  }
  return h;
}

/**
 * Joga um cenário do golden e devolve o hash acumulado em cada checkpoint (depois de cada ação do
 * roteiro, com o estado canônico inteiro) e o hash do resultado. `engine` = { E, C } (engine.ts, cpu.ts).
 */
export function runGoldenScenario(engine, scenario) {
  const { E, C } = engine;
  const state = E.createMatch(cloneJson(scenario.setup));
  if (scenario.startInPenalties) E.jumpToPenalties(state);
  const drv = driverRng(scenario.driverSeed);
  const brain = scenario.cpuSkill && !scenario.sharedBrain ? driverRng(seedOf(scenario.driverSeed, "brain")) : null;
  const dt = 1 / scenario.dtHz;
  const labels = [];
  const checkpoints = [];
  let rolling = FNV_OFFSET;
  const check = (label, extra) => {
    rolling = fnvText(rolling, `${label}|${extra === undefined ? "" : canonicalJson(extra)}|${canonicalState(state)}`);
    labels.push(label);
    checkpoints.push(hex8(rolling));
  };
  check("create");
  for (let guard = 0; guard < 1500 && state.phase !== "finished"; guard += 1) {
    const phase = state.phase;
    if (phase === "aim" || phase === "kickoff") {
      if (drv.next() < 0.03 && state.turn === "user" && !state.finalShotGrace) {
        check("inactivity", E.awardInactivityPenalty(state));
        continue;
      }
      check("clock", E.advanceClock(state, drv.range(0.05, 4.5), drv.chance(0.25)));
      if (state.finalShotGrace && drv.chance(0.3)) {
        check("cancel", E.cancelFinalShotGrace(state));
        continue;
      }
      if (state.phase !== "aim" && state.phase !== "kickoff") continue;
      if (state.setup.managerMode && drv.chance(0.06)) {
        const side = state.turn;
        const roster = E.managerRosterFor(state, side);
        const discs = E.discsOf(state, side);
        const out = discs[drv.int(0, discs.length - 1)];
        const incoming = roster && roster.bench.length > 0 ? roster.bench[drv.int(0, roster.bench.length - 1)] : null;
        if (incoming) check("substitute", E.substitutePlayer(state, side, out.id, incoming.id));
      }
      if (drv.chance(0.02)) {
        check("skip", E.skipTurn(state));
        continue;
      }
      const shot = scenario.cpuSkill
        ? C.chooseCpuShot(state, scenario.cpuSkill, brain ?? state.rng, state.turn)
        : randomOpenShot(E, state, drv);
      if (!shot || !E.beginShot(state, shot)) {
        check("skip-invalid", E.skipTurn(state));
        continue;
      }
      let steps = 0;
      while (state.phase === "resolving" && steps < 5000) {
        E.stepMatch(state, dt);
        rolling = mixBodies(rolling, state);
        steps += 1;
      }
      check("rest", steps);
      continue;
    }
    if (phase === "goal") {
      check("resume", E.resumeAfterGoal(state));
      continue;
    }
    if (phase === "interval") {
      check("period", E.startNextPeriod(state));
      continue;
    }
    if (phase === "penalty-setup") {
      check("order", E.confirmPenaltyOrder(state, 1 + drv.int(0, 5)));
      continue;
    }
    if (phase === "penalties") {
      // dt 0 deixa keeper.vx = NaN, como no primeiro quadro da UI.
      E.stepPenaltyKeeper(state, drv.chance(0.1) ? 0 : drv.range(0, 0.6));
      if (drv.chance(0.04)) {
        check("pmiss", E.commitPenalty(state, false));
        continue;
      }
      const shot = scenario.cpuSkill
        ? C.chooseCpuPenaltyShot(state, E.penaltyShooter(state), E.penaltyKeeper(state), scenario.cpuSkill, brain ?? state.rng)
        : randomPenaltyShot(E, state, drv);
      if (!E.beginPenaltyShot(state, shot)) {
        check("pweak", E.commitPenalty(state, false));
        continue;
      }
      let outcome = null;
      let steps = 0;
      while (!outcome && steps < 4000) {
        outcome = E.stepPenalty(state, dt);
        rolling = mixBodies(rolling, state);
        steps += 1;
      }
      check("pcommit", E.commitPenalty(state, outcome ? outcome.scored : false));
      continue;
    }
    break;
  }
  const result = state.result ?? E.forceFinish(state);
  return { labels, checkpoints, result: hex8(fnvText(FNV_OFFSET, canonicalJson(result))) };
}

export function runGoldenSim(engine, sim) {
  return hex8(fnvText(FNV_OFFSET, canonicalJson(engine.S.simulateBotaoMatch(cloneJson(sim.setup)))));
}

/** FNV de todos os hashes do golden: o que a tabela de revisões guarda. */
export function goldenDigest(golden) {
  let h = FNV_OFFSET;
  for (const scenario of golden.scenarios) h = fnvText(h, `${scenario.id}:${scenario.checkpoints.join(",")}:${scenario.result};`);
  for (const sim of golden.sims) h = fnvText(h, `${sim.id}:${sim.result};`);
  return hex8(h);
}

// ---------------------------------------------------------------------------
// Comparação estrita entre dois estados (lockstep)
// ---------------------------------------------------------------------------

/**
 * Caminho da primeira diferença entre `a` e `b`, ou null. Números por Object.is; chaves na mesma ordem.
 * Com `loose`, chave com valor `undefined` conta como ausente (é o que o JSON do codec faz).
 */
export function firstDifference(a, b, path = "$", loose = false) {
  if (typeof a !== typeof b) return path;
  if (typeof a === "number") return Object.is(a, b) ? null : path;
  if (typeof a !== "object" || a === null || b === null) {
    if (typeof a === "function") return null;
    return a === b ? null : path;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}.length`;
    for (let index = 0; index < a.length; index += 1) {
      const diff = firstDifference(a[index], b[index], `${path}[${index}]`, loose);
      if (diff) return diff;
    }
    return null;
  }
  const keysA = Object.keys(a).filter((key) => !loose || a[key] !== undefined);
  const keysB = Object.keys(b).filter((key) => !loose || b[key] !== undefined);
  if (keysA.length !== keysB.length || keysA.some((key, index) => key !== keysB[index])) return `${path}{${keysA.join(",")}|${keysB.join(",")}}`;
  for (const key of keysA) {
    if (key === "rng") continue;
    const diff = firstDifference(a[key], b[key], `${path}.${key}`, loose);
    if (diff) return diff;
  }
  return null;
}

function valueAt(root, path) {
  const parts = path.replace(/^\$/, "").match(/\.[^.[{]+|\[\d+\]/g) ?? [];
  let value = root;
  for (const part of parts) {
    if (value === null || value === undefined) return value;
    value = part.startsWith("[") ? value[Number(part.slice(1, -1))] : value[part.slice(1)];
  }
  return value;
}

class Divergence extends Error {
  constructor(info) {
    super(`divergência: ${JSON.stringify(info)}`);
    this.info = info;
  }
}

/** Compara estados (e opcionalmente o retorno da chamada) e lança `Divergence` com o contexto. */
function makeComparer(ctx, { ignoreVersion = false, loose = false } = {}) {
  return (call, stateA, stateB, retA, retB) => {
    ctx.checks += 1;
    const where = { ...ctx.where, call, turn: stateA.turns, phase: stateA.phase };
    if (retA !== undefined || retB !== undefined) {
      const diff = firstDifference(retA, retB, "$ret", loose);
      if (diff) throw new Divergence({ ...where, path: diff, a: canonicalJson(valueAt({ ret: retA }, diff.replace("$ret", "$.ret"))), b: canonicalJson(valueAt({ ret: retB }, diff.replace("$ret", "$.ret"))) });
    }
    if (stateA.rng.cursor() !== stateB.rng.cursor()) throw new Divergence({ ...where, path: "rng.cursor()", a: stateA.rng.cursor(), b: stateB.rng.cursor() });
    if (!ignoreVersion && stateA.version !== stateB.version) throw new Divergence({ ...where, path: "version", a: stateA.version, b: stateB.version });
    const viewA = ignoreVersion ? { ...stateA, version: 0 } : stateA;
    const viewB = ignoreVersion ? { ...stateB, version: 0 } : stateB;
    const diff = firstDifference(viewA, viewB, "$", loose);
    if (diff) throw new Divergence({ ...where, path: diff, a: canonicalJson(valueAt(viewA, diff.split("{")[0])), b: canonicalJson(valueAt(viewB, diff.split("{")[0])) });
  };
}

// ---------------------------------------------------------------------------
// Lockstep: revisão base x working tree
// ---------------------------------------------------------------------------

function lockstepRun(BASE, WORK, seed, variant, sharedBrain, cover) {
  const setup = legacySetup(seed, variant);
  const ctx = { checks: 0, where: { seed, variant, sharedBrain } };
  const same = makeComparer(ctx);
  const A = BASE.E.createMatch(cloneJson(setup));
  const B = WORK.E.createMatch(cloneJson(setup));
  same("createMatch", A, B);
  if (variant === "pens") {
    BASE.E.jumpToPenalties(A);
    WORK.E.jumpToPenalties(B);
    same("jumpToPenalties", A, B);
  }
  const drv = driverRng(seedOf(seed, "driver", variant, sharedBrain ? "shared" : "own"));
  const brainA = sharedBrain ? null : BASE.R.createRng(BASE.R.hashSeed(seed, "brain"));
  const brainB = sharedBrain ? null : WORK.R.createRng(WORK.R.hashSeed(seed, "brain"));
  const brainCheck = (call) => {
    if (brainA && brainA.cursor() !== brainB.cursor()) throw new Divergence({ ...ctx.where, call, path: "brain.cursor()", a: brainA.cursor(), b: brainB.cursor() });
  };
  const dt = drv.chance(0.5) ? 1 / 120 : 1 / 60;
  const both = (call, fa, fb) => {
    const ra = fa();
    const rb = fb();
    same(call, A, B, ra, rb);
    return ra;
  };
  for (let guard = 0; guard < 1200 && A.phase !== "finished"; guard += 1) {
    const phase = A.phase;
    if (phase === "aim" || phase === "kickoff") {
      const roll = drv.next();
      if (roll < 0.04 && A.turn === "user" && !A.finalShotGrace) {
        // O padrão "user" do working tree tem que ser o corpo de sempre, com ou sem o argumento.
        const explicit = drv.chance(0.5);
        both("awardInactivityPenalty", () => BASE.E.awardInactivityPenalty(A), () => (explicit ? WORK.E.awardInactivityPenalty(B, "user") : WORK.E.awardInactivityPenalty(B)));
        cover.inactivity = (cover.inactivity ?? 0) + 1;
        continue;
      }
      const seconds = drv.range(0.05, 4.5);
      const hold = drv.chance(0.25);
      both("advanceClock", () => BASE.E.advanceClock(A, seconds, hold), () => WORK.E.advanceClock(B, seconds, hold));
      if (A.finalShotGrace) cover.grace = (cover.grace ?? 0) + 1;
      if (A.finalShotGrace && drv.chance(0.3)) {
        both("cancelFinalShotGrace", () => BASE.E.cancelFinalShotGrace(A), () => WORK.E.cancelFinalShotGrace(B));
        cover.cancel = (cover.cancel ?? 0) + 1;
        continue;
      }
      if (A.phase !== "aim" && A.phase !== "kickoff") continue;
      if (A.setup.managerMode) {
        both("chooseCpuSubstitution", () => BASE.C.chooseCpuSubstitution(A, A.turn, brainA ?? A.rng), () => WORK.C.chooseCpuSubstitution(B, B.turn, brainB ?? B.rng));
        brainCheck("chooseCpuSubstitution");
        if (A.managerSubstitutions.length > 0) cover.substitution = (cover.substitution ?? 0) + 1;
      }
      if (drv.chance(0.02)) {
        both("skipTurn", () => BASE.E.skipTurn(A), () => WORK.E.skipTurn(B));
        cover.skip = (cover.skip ?? 0) + 1;
        continue;
      }
      let shot;
      if (drv.chance(0.7)) {
        const skill = 1 + drv.next() * 4;
        shot = both("chooseCpuShot", () => BASE.C.chooseCpuShot(A, skill, brainA ?? A.rng, A.turn), () => WORK.C.chooseCpuShot(B, skill, brainB ?? B.rng, B.turn));
        brainCheck("chooseCpuShot");
      } else {
        shot = randomOpenShot(BASE.E, A, drv);
      }
      const started = shot ? both("beginShot", () => BASE.E.beginShot(A, shot), () => WORK.E.beginShot(B, shot)) : false;
      if (!started) {
        both("skipTurn", () => BASE.E.skipTurn(A), () => WORK.E.skipTurn(B));
        continue;
      }
      while (A.phase === "resolving") both("stepMatch", () => BASE.E.stepMatch(A, dt), () => WORK.E.stepMatch(B, dt));
      continue;
    }
    if (phase === "goal") {
      both("resumeAfterGoal", () => BASE.E.resumeAfterGoal(A), () => WORK.E.resumeAfterGoal(B));
      cover.goal = (cover.goal ?? 0) + 1;
      continue;
    }
    if (phase === "interval") {
      both("startNextPeriod", () => BASE.E.startNextPeriod(A), () => WORK.E.startNextPeriod(B));
      cover.interval = (cover.interval ?? 0) + 1;
      continue;
    }
    if (phase === "penalty-setup") {
      const round = 1 + drv.int(0, 5);
      both("confirmPenaltyOrder", () => BASE.E.confirmPenaltyOrder(A, round), () => WORK.E.confirmPenaltyOrder(B, round));
      cover.shootout = (cover.shootout ?? 0) + 1;
      continue;
    }
    if (phase === "penalties") {
      const keeperDt = drv.chance(0.1) ? 0 : drv.range(0, 0.6);
      both("stepPenaltyKeeper", () => BASE.E.stepPenaltyKeeper(A, keeperDt), () => WORK.E.stepPenaltyKeeper(B, keeperDt));
      if (drv.chance(0.04)) {
        both("commitPenalty", () => BASE.E.commitPenalty(A, false), () => WORK.E.commitPenalty(B, false));
        cover.pmiss = (cover.pmiss ?? 0) + 1;
        continue;
      }
      let shot;
      if (drv.chance(0.7)) {
        const skill = 1 + drv.next() * 4;
        shot = both(
          "chooseCpuPenaltyShot",
          () => BASE.C.chooseCpuPenaltyShot(A, BASE.E.penaltyShooter(A), BASE.E.penaltyKeeper(A), skill, brainA ?? A.rng),
          () => WORK.C.chooseCpuPenaltyShot(B, WORK.E.penaltyShooter(B), WORK.E.penaltyKeeper(B), skill, brainB ?? B.rng),
        );
        brainCheck("chooseCpuPenaltyShot");
      } else {
        shot = randomPenaltyShot(BASE.E, A, drv);
      }
      if (!both("beginPenaltyShot", () => BASE.E.beginPenaltyShot(A, shot), () => WORK.E.beginPenaltyShot(B, shot))) {
        both("commitPenalty", () => BASE.E.commitPenalty(A, false), () => WORK.E.commitPenalty(B, false));
        continue;
      }
      let outcome = null;
      for (let steps = 0; !outcome && steps < 4000; steps += 1) {
        outcome = both("stepPenalty", () => BASE.E.stepPenalty(A, dt), () => WORK.E.stepPenalty(B, dt));
      }
      const scored = outcome ? outcome.scored : false;
      const inactivity = A.penaltyReason === "inactivity";
      both("commitPenalty", () => BASE.E.commitPenalty(A, scored), () => WORK.E.commitPenalty(B, scored));
      cover[inactivity ? "inactivityCommit" : "penaltyCommit"] = (cover[inactivity ? "inactivityCommit" : "penaltyCommit"] ?? 0) + 1;
      continue;
    }
    break;
  }
  if (A.phase !== "finished") both("forceFinish", () => BASE.E.forceFinish(A), () => WORK.E.forceFinish(B));
  same("result", A, B, A.result, B.result);
  return { checks: ctx.checks, finished: A.phase === "finished" };
}

// ---------------------------------------------------------------------------
// Caminhos novos (Bobonline): escritor x receptor, só no motor do working tree
// ---------------------------------------------------------------------------

export const NEWPATH_VARIANTS = ["squads", "squads-pens", "plain"];

function newpathSetup(seed, variant) {
  const r = driverRng(seedOf(seed, "newpath", variant));
  const setup = legacySetup(seed, "plain");
  setup.matchId = `BOB-${variant}-${seed}`;
  if (variant !== "plain") {
    const squad = (side) =>
      Array.from({ length: 5 }, (_, index) => {
        const player = { id: `${side}:p${index}`, name: `${side === "user" ? "Zé" : "Tião"} ${index}`, number: [10, 7, 9, 4, 1][index], position: POSITIONS[r.int(0, 7)], overall: 70 };
        if (r.chance(0.7)) player.power = 40 + r.int(0, 60);
        if (r.chance(0.7)) player.control = 40 + r.int(0, 60);
        return player;
      });
    setup.squads = { user: squad("user"), cpu: squad("cpu") };
  }
  return setup;
}

function shuffled(items, drv) {
  const list = items.slice();
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = drv.int(0, index);
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

/**
 * Uma partida do jeito do Bobonline. W é o aparelho do dono da vez (gasta o relógio, anima o goleiro antes da
 * cobrança); V é o outro aparelho (não gasta relógio; anima o goleiro só para mostrar). Toda ação passa pelo mesmo
 * caminho nos dois (design §5.2) e os dois precisam ficar iguais em todo descanso (menos `version`). No meio, V às
 * vezes renasce de um snapshot (restoreMatch) ou adota o estado de W (overwriteMatch).
 */
function newpathRun(WORK, seed, variant, cover) {
  const { E, C, M } = WORK;
  const setup = newpathSetup(seed, variant);
  const ctx = { checks: 0, where: { part: "newpath", seed, variant } };
  // V pode ter renascido do JSON: `undefined` some (playerId, result.manager), o resto tem de ser idêntico.
  const same = makeComparer(ctx, { ignoreVersion: true, loose: true });
  const W = E.createMatch(cloneJson(setup));
  let V = E.createMatch(cloneJson(setup));
  if (variant === "squads-pens") {
    E.jumpToPenalties(W);
    E.jumpToPenalties(V);
  }
  const drv = driverRng(seedOf(seed, "newpath-driver", variant));
  // A CPU online nunca usa a rng da partida (design §5.1).
  const brain = WORK.R.createRng(WORK.R.hashSeed(seed, "cpu-brain"));
  const dt = drv.chance(0.5) ? 1 / 120 : 1 / 60;
  const count = (key) => (cover[key] = (cover[key] ?? 0) + 1);
  const both = (call, run) => {
    const ra = run(W);
    const rb = run(V);
    same(call, W, V, ra, rb);
    return ra;
  };
  const atRest = (call) => {
    same(call, W, V);
    const hw = M.hashMatch(W);
    const hv = M.hashMatch(V);
    if (hw !== hv) throw new Divergence({ ...ctx.where, call, path: "hashMatch", a: hw, b: hv });
    if (!M.isRestPoint(W)) throw new Divergence({ ...ctx.where, call, path: "isRestPoint", a: false, b: true });
    const roll = drv.next();
    if (roll < 0.08) {
      V = M.restoreMatch(V.setup, JSON.parse(JSON.stringify(M.serializeMatch(V))));
      same(`${call}+restoreMatch`, W, V);
      count("restore");
    } else if (roll < 0.16) {
      const before = new Map(V.bodies.map((body) => [body.id, body]));
      M.overwriteMatch(V, JSON.parse(JSON.stringify(M.serializeMatch(W))));
      same(`${call}+overwriteMatch`, W, V);
      for (const body of V.bodies) {
        if (before.has(body.id) && before.get(body.id) !== body) throw new Divergence({ ...ctx.where, call, path: `overwriteMatch trocou o objeto de ${body.id}` });
      }
      count("overwrite");
    }
  };
  const honest = (shot, kind) => {
    // No ponto exato (mesma matchKey do escritor) a checagem é completa; um toque honesto passa sem mudar nada.
    const checked = M.validateRemoteShot(V, shot, kind, M.matchKey(W));
    if (!checked || checked.vx !== shot.vx || checked.vy !== shot.vy || checked.bodyId !== shot.bodyId) {
      throw new Divergence({ ...ctx.where, call: "validateRemoteShot", path: kind, a: canonicalJson(shot), b: canonicalJson(checked) });
    }
  };
  atRest("createMatch");
  for (let guard = 0; guard < 1500 && W.phase !== "finished"; guard += 1) {
    const phase = W.phase;
    if (M.matchKey(W) !== M.matchKey(V)) throw new Divergence({ ...ctx.where, call: "matchKey", path: "matchKey", a: M.matchKey(W), b: M.matchKey(V) });
    if (phase === "aim" || phase === "kickoff") {
      // O dono mira: alguns quadros de relógio só no aparelho dele.
      const frames = drv.int(0, 6);
      const hold = drv.chance(0.3);
      for (let frame = 0; frame < frames && (W.phase === "aim" || W.phase === "kickoff"); frame += 1) {
        E.advanceClock(W, drv.range(0.02, 1.6), hold);
      }
      if (W.phase !== "aim" && W.phase !== "kickoff") {
        // O relógio do dono zerou sem botão seguro: ele escreve `expire`. No dono o tempo já acabou (os eventos
        // saíram no advanceClock dele), então só o estado precisa bater.
        for (const state of [W, V]) {
          if (state.finalShotGrace) E.cancelFinalShotGrace(state);
          else E.applyRemoteClock(state, 0, false);
        }
        same("expire(fim)", W, V);
        count("expire");
        atRest("expire");
        continue;
      }
      if (W.finalShotGrace) count("grace");
      if (W.finalShotGrace && drv.chance(0.3)) {
        both("expire(graça)", (state) => (state.finalShotGrace ? E.cancelFinalShotGrace(state) : E.applyRemoteClock(state, 0, false)));
        count("expire-grace");
        atRest("expire-grace");
        continue;
      }
      if (!W.finalShotGrace && drv.chance(0.06)) {
        const side = W.turn;
        const clock = W.clock;
        both("idle", (state) => {
          const events = E.applyRemoteClock(state, clock, false);
          return state.phase === "aim" || state.phase === "kickoff" ? events.concat(E.awardInactivityPenalty(state, side)) : events;
        });
        count(`idle-${side}`);
        atRest("idle");
        continue;
      }
      const clock = W.clock;
      const grace = W.finalShotGrace;
      let shot;
      if (drv.chance(0.3)) {
        shot = C.chooseCpuShot(W, 1 + drv.next() * 4, brain, W.turn);
      } else {
        const disc = E.discsOf(W, W.turn)[drv.int(0, 4)];
        const ball = E.ballOf(W);
        const angle = Math.atan2(ball.y - disc.y, ball.x - disc.x) + drv.range(-0.4, 0.4);
        const pull = drv.range(12, 140);
        const aim = E.aimFromDrag(disc, disc.x - Math.cos(angle) * pull, disc.y - Math.sin(angle) * pull);
        shot = { bodyId: disc.id, vx: aim.vx, vy: aim.vy };
      }
      if (!shot) continue;
      honest(shot, "open");
      const started = both("shot", (state) => {
        E.applyRemoteClock(state, clock, grace);
        return E.beginShot(state, shot);
      });
      if (grace) count("grace-shot");
      if (!started) {
        both("skipTurn", (state) => E.skipTurn(state));
        atRest("skip");
        continue;
      }
      for (let steps = 0; W.phase === "resolving" && steps < 5000; steps += 1) both("stepMatch", (state) => E.stepMatch(state, dt));
      count("shot");
      atRest("rest");
      continue;
    }
    if (phase === "goal") {
      both("resumeAfterGoal", (state) => E.resumeAfterGoal(state));
      count("goal");
      atRest("resume");
      continue;
    }
    if (phase === "interval") {
      both("startNextPeriod", (state) => E.startNextPeriod(state));
      atRest("period");
      continue;
    }
    if (phase === "penalty-setup") {
      const orders = {};
      for (const side of ["user", "cpu"]) {
        const ids = E.discsOf(W, side).map((disc) => disc.id);
        const roll = drv.next();
        if (roll < 0.6) orders[side] = shuffled(ids, drv);
        else if (roll < 0.8) orders[side] = [ids[0], ...ids.slice(0, 4)]; // repetido: fica a padrão
      }
      both("confirmPenaltyOrders", (state) => E.confirmPenaltyOrders(state, orders));
      count("porder");
      atRest("porder");
      continue;
    }
    if (phase === "penalties") {
      // O goleiro do descanso é o mesmo nos dois aparelhos; a animação antes do toque não é.
      const restKeeper = E.penaltyKeeper(W);
      const keeperAtRest = { x: restKeeper.x, dir: W.penalties.keeperDirection };
      for (let step = drv.int(0, 40); step > 0; step -= 1) E.stepPenaltyKeeper(W, drv.chance(0.05) ? 0 : dt);
      for (let step = drv.int(0, 40); step > 0; step -= 1) E.stepPenaltyKeeper(V, dt);
      const inactivity = W.penaltyReason === "inactivity";
      if (drv.chance(0.06)) {
        // `pmiss`: antes do commit cada aparelho volta o goleiro ao do descanso (a direção sobrevive ao setupPenaltyShot).
        both("pmiss", (state) => {
          E.placePenaltyKeeper(state, keeperAtRest.x, keeperAtRest.dir);
          return E.commitPenalty(state, false);
        });
        count("pmiss");
        atRest("pmiss");
        continue;
      }
      const keeper = E.penaltyKeeper(W);
      const keeperX = drv.chance(0.1) ? keeper.x + drv.range(-200, 200) : keeper.x;
      const keeperDir = W.penalties.keeperDirection;
      const shot = drv.chance(0.3)
        ? C.chooseCpuPenaltyShot(W, E.penaltyShooter(W), keeper, 1 + drv.next() * 4, brain)
        : randomPenaltyShot(E, W, drv);
      honest(shot, "penalty");
      const started = both("pshot", (state) => {
        E.placePenaltyKeeper(state, keeperX, keeperDir);
        return E.beginPenaltyShot(state, shot);
      });
      let outcome = null;
      for (let steps = 0; started && !outcome && steps < 4000; steps += 1) outcome = both("stepPenalty", (state) => E.stepPenalty(state, dt));
      both("commitPenalty", (state) => E.commitPenalty(state, outcome ? outcome.scored : false));
      count(inactivity ? `inactivity-kick-${W.lastGoal?.side ?? "miss"}` : "pshot");
      atRest("pcommit");
      continue;
    }
    break;
  }
  if (W.phase !== "finished") both("forceFinish", (state) => E.forceFinish(state));
  same("result", W, V, W.result, V.result);
  return { checks: ctx.checks, finished: W.phase === "finished" };
}

// ---------------------------------------------------------------------------
// Execução (CLI)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { rev: "fafd053", runs: 120, sims: 200, repo: ROOT, parts: "lockstep,sims,newpath", writeGolden: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-golden") args.writeGolden = true;
    else if (arg === "--rev") args.rev = argv[++index];
    else if (arg === "--runs") args.runs = Number(argv[++index]);
    else if (arg === "--sims") args.sims = Number(argv[++index]);
    else if (arg === "--repo") args.repo = resolve(argv[++index]);
    else if (arg === "--parts") args.parts = argv[++index];
    else throw new Error(`argumento desconhecido: ${arg}`);
  }
  return args;
}

/** Transpila os .ts do motor para CommonJS numa pasta temporária e carrega. */
function loadEngineCopy(dir, sources) {
  const require = createRequire(join(ROOT, "package.json"));
  const ts = require("typescript");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), '{ "type": "commonjs" }\n');
  for (const [name, source] of Object.entries(sources)) {
    const { outputText } = ts.transpileModule(source.replace(/\r\n/g, "\n"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: `${name}.ts`,
    });
    writeFileSync(join(dir, `${name}.js`), outputText);
  }
  const load = createRequire(join(dir, "index.js"));
  const copy = { E: load("./engine.js"), C: load("./cpu.js"), S: load("./simulate.js"), T: load("./types.js"), R: load("./rng.js") };
  if (sources["match-codec"]) copy.M = load("./match-codec.js");
  return copy;
}

function workingTreeSources(withCodec) {
  const sources = {};
  for (const name of ENGINE_FILES) sources[name] = readFileSync(join(ROOT, "app", "botao", `${name}.ts`), "utf8");
  const codecPath = join(ROOT, "app", "botao", "match-codec.ts");
  if (withCodec && existsSync(codecPath)) sources["match-codec"] = readFileSync(codecPath, "utf8");
  return sources;
}

function revisionSources(repo, rev) {
  const sources = {};
  for (const name of ENGINE_FILES) {
    try {
      sources[name] = execFileSync("git", ["show", `${rev}:app/botao/${name}.ts`], { cwd: repo, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      throw new Error(`git show ${rev}:app/botao/${name}.ts falhou em ${repo} (a cópia isolada não tem .git: passe --repo <repositório>): ${String(error.stderr ?? error.message).trim()}`);
    }
  }
  return sources;
}

function writeGolden(WORK, repo) {
  const engineRev = WORK.M?.BOTAO_ENGINE_REV;
  if (!Number.isInteger(engineRev)) throw new Error("BOTAO_ENGINE_REV não encontrado em app/botao/match-codec.ts");
  const started = Date.now();
  const scenarios = [];
  for (let index = 0; index < GOLDEN_SCENARIOS; index += 1) {
    const scenario = goldenScenario(index);
    const run = runGoldenScenario(WORK, scenario);
    scenarios.push({ ...scenario, checkpoints: run.checkpoints, result: run.result });
  }
  const sims = [];
  for (let index = 0; index < GOLDEN_SIMS; index += 1) {
    const sim = goldenSim(index);
    sims.push({ ...sim, result: runGoldenSim(WORK, sim) });
  }
  let writtenFrom = "working tree";
  try {
    const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    writtenFrom = `working tree sobre ${head}`;
  } catch {
    // sem git: fica só "working tree"
  }
  const golden = { format: GOLDEN_FORMAT, engineRev, writtenFrom, digest: "", scenarios, sims };
  golden.digest = goldenDigest(golden);
  const revs = existsSync(REVS_PATH) ? JSON.parse(readFileSync(REVS_PATH, "utf8")) : {};
  const known = revs[String(engineRev)];
  if (known && known !== golden.digest) {
    throw new Error(`a revisão ${engineRev} já tem o digest ${known} e este motor dá ${golden.digest}: a física mudou, suba BOTAO_ENGINE_REV antes de regravar`);
  }
  revs[String(engineRev)] = golden.digest;
  mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
  // Um cenário por linha: o diff de uma regravação mostra quais cenários mudaram.
  const { scenarios: allScenarios, sims: allSims, ...header } = golden;
  const lines = [
    `${JSON.stringify(header).slice(0, -1)},`,
    `"scenarios":[`,
    allScenarios.map((scenario) => JSON.stringify(scenario)).join(",\n"),
    `],"sims":[`,
    allSims.map((sim) => JSON.stringify(sim)).join(",\n"),
    "]}",
  ];
  writeFileSync(GOLDEN_PATH, `${lines.join("\n")}\n`);
  writeFileSync(REVS_PATH, `${JSON.stringify(revs, null, 2)}\n`);
  const checkpoints = scenarios.reduce((total, scenario) => total + scenario.checkpoints.length, 0);
  console.log(JSON.stringify({ golden: GOLDEN_PATH, engineRev, digest: golden.digest, scenarios: scenarios.length, sims: sims.length, checkpoints, ms: Date.now() - started }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const temp = mkdtempSync(join(tmpdir(), "engine-identity-"));
  try {
    const WORK = loadEngineCopy(join(temp, "work"), workingTreeSources(true));
    if (args.writeGolden) {
      writeGolden(WORK, args.repo);
      return;
    }
    const parts = new Set(args.parts.split(",").filter(Boolean));
    const summary = { rev: args.rev };
    const started = Date.now();
    if (parts.has("lockstep") || parts.has("sims")) {
      const BASE = loadEngineCopy(join(temp, "base"), revisionSources(args.repo, args.rev));
      if (parts.has("lockstep")) {
        const cover = {};
        let runs = 0;
        let finished = 0;
        let checks = 0;
        for (const variant of LEGACY_VARIANTS) {
          for (let seed = 1; seed <= args.runs; seed += 1) {
            for (const shared of [true, false]) {
              const result = lockstepRun(BASE, WORK, seed * 7919 + variant.length, variant, shared, cover);
              runs += 1;
              checks += result.checks;
              if (result.finished) finished += 1;
            }
          }
          console.error(`[lockstep] ${variant}: ok (${runs} partidas, ${Math.round((Date.now() - started) / 1000)}s)`);
        }
        summary.lockstep = { runs, finished, checks, coverage: cover };
      }
      if (parts.has("sims")) {
        for (let index = 0; index < args.sims; index += 1) {
          const variant = LEGACY_VARIANTS[index % 4];
          const setup = legacySetup(50000 + index, variant);
          const a = BASE.S.simulateBotaoMatch(cloneJson(setup));
          const b = WORK.S.simulateBotaoMatch(cloneJson(setup));
          const diff = firstDifference(a, b);
          if (diff) throw new Divergence({ seed: 50000 + index, variant, call: "simulateBotaoMatch", path: diff });
        }
        summary.sims = { runs: args.sims, ok: true };
        console.error(`[sims] ok (${args.sims}, ${Math.round((Date.now() - started) / 1000)}s)`);
      }
    }
    if (parts.has("newpath")) {
      if (!WORK.M) throw new Error("newpath precisa de app/botao/match-codec.ts");
      const cover = {};
      let runs = 0;
      let finished = 0;
      let checks = 0;
      for (const variant of NEWPATH_VARIANTS) {
        for (let seed = 1; seed <= args.runs; seed += 1) {
          const result = newpathRun(WORK, seed * 104729 + variant.length, variant, cover);
          runs += 1;
          checks += result.checks;
          if (result.finished) finished += 1;
        }
        console.error(`[newpath] ${variant}: ok (${runs} partidas, ${Math.round((Date.now() - started) / 1000)}s)`);
      }
      summary.newpath = { runs, finished, checks, coverage: cover };
    }
    summary.ms = Date.now() - started;
    summary.diffs = 0;
    console.log(JSON.stringify(summary));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    if (error instanceof Divergence) console.error(`DIFERENÇA ${JSON.stringify(error.info)}`);
    else console.error(error);
    process.exit(1);
  });
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTs } from "./helpers/ts-loader.mjs";

// Comemorações do Bobonline (design §8, §9): ids novos no fim, sorteio "Variada" de sempre intacto, pausa extra
// determinística, coreografia das 5 novas, ações (marcas de tempo), efeitos (esfera, raio, aura) e sons novos.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relPath) => readFileSync(join(ROOT, relPath), "utf8");
// O mesmo three (CJS) que os módulos carregados pelo ts-loader usam.
const THREE = createRequire(join(ROOT, "package.json"))("three");

// O boneco pinta rosto e camisa num canvas: no Node, um canvas 2D falso que aceita tudo e não desenha nada.
const fakeCanvasContext = () =>
  new Proxy(function () {}, {
    get: (target, key) => (key === Symbol.toPrimitive ? () => 0 : key === "data" ? new Uint8ClampedArray(4) : fakeCanvasContext()),
    set: () => true,
    apply: () => fakeCanvasContext(),
  });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => fakeCanvasContext() }) };

const { CELEBRATION_OPTIONS, celebrationIdOf, normalizePlayerAppearance } = loadTs("app/player-appearance.ts");
const choreo = loadTs("app/botao/three/choreography.ts");
const timing = loadTs("app/botao/celebration-timing.ts");
const character = loadTs("app/botao/three/character.ts");
const { Effects } = loadTs("app/botao/three/effects.ts");
const { CelebrationFx, beamRoom } = loadTs("app/botao/three/celebration-fx.ts");
const audio = loadTs("app/botao/audio.ts");
const signatureAudio = loadTs("app/botao/signature-audio.ts");

const { Choreographer, goalCelebrationOf, squadCelebrationFor, BOBONLINE_VARIADA, SIGNATURE_ONLY } = choreo;
const { PlayerFigure, idleIntent, KAME, FIGURE_HEIGHT, FIGURE_ACTION_INFO } = character;

const OLD_IDS = ["auto", "kneeSlide", "siuu", "cornerFlag", "backflip", "airplane", "crest", "heart", "shush", "armsCrossed", "cradle", "robot", "dance"];
const OLD_NAMES = ["Variada", "Carrinho de joelho", "Siuuu", "Bandeirinha", "Mortal", "Aviãozinho", "Beijo no escudo", "Coração", "Silêncio", "Braços cruzados", "Embala neném", "Robô", "Dancinha"];
const NEW_IDS = ["kamehameha", "superSaiyan", "meditate", "cupEar", "fingerGuns"];
const NEW_NAMES = ["Kamehameha", "Super Saiyajin", "Meditação", "Não tô ouvindo", "Pistoleiro"];
/** O sorteio "Variada" de todos os modos de antes, na ordem (mudar a ordem ou o tamanho trocaria a festa de cada gol). */
const OLD_POOL = ["kneeSlide", "siuu", "cornerFlag", "backflip", "airplane", "crest", "heart", "shush", "armsCrossed", "cradle", "robot", "dance"];
const DT = 1 / 60;
const KAME_COLOR = "#8fd8ff";
const SSJ_COLOR = "#ffd84a";

function fnv(text) {
  let h = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const assertFiniteArgs = (call) => {
  for (const value of call.args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${call.name}: argumento não finito ${call.args}`);
};

// ------------------------------------------------------------------ opções e sorteio

test("CELEBRATION_OPTIONS: 0-12 como sempre, 13-17 acrescentadas no fim", () => {
  assert.equal(CELEBRATION_OPTIONS.length, 18);
  assert.deepEqual(CELEBRATION_OPTIONS.slice(0, 13).map((option) => option.id), OLD_IDS);
  assert.deepEqual(CELEBRATION_OPTIONS.slice(0, 13).map((option) => option.name), OLD_NAMES);
  assert.deepEqual(CELEBRATION_OPTIONS.slice(13).map((option) => option.id), NEW_IDS);
  assert.deepEqual(CELEBRATION_OPTIONS.slice(13).map((option) => option.name), NEW_NAMES);
  NEW_IDS.forEach((id, index) => assert.equal(celebrationIdOf({ celebration: 13 + index }), id));
  assert.equal(celebrationIdOf({ celebration: 18 }), "auto", "índice fora da lista volta a ser Variada");
  assert.equal(celebrationIdOf(null), "auto");
  // O save guarda o índice: o 17 sobrevive à normalização e nada passa do fim.
  assert.equal(normalizePlayerAppearance({ version: 2, celebration: 17 }).celebration, 17);
  assert.ok(normalizePlayerAppearance({ version: 2, celebration: 99 }).celebration < 18);
});

test("goalCelebrationOf aceita todo id do criador menos o auto", () => {
  for (const { id } of CELEBRATION_OPTIONS) {
    if (id === "auto") assert.equal(goalCelebrationOf(id), null);
    else assert.equal(goalCelebrationOf(id), id, id);
  }
  assert.equal(goalCelebrationOf(null), null);
  assert.equal(goalCelebrationOf("crestKiss"), null);
});

test("fonte: GOAL_CELEBRATIONS continua com as 12 na mesma ordem; pool do Bobonline = 12 + 3 curtas", () => {
  const match = source("app/botao/three/choreography.ts").match(/const GOAL_CELEBRATIONS: GoalCelebration\[\] = \[([^\]]*)\]/);
  assert.ok(match, "GOAL_CELEBRATIONS sumiu");
  const ids = [...match[1].matchAll(/"([A-Za-z]+)"/g)].map((item) => item[1]);
  assert.deepEqual(ids, OLD_POOL);
  assert.deepEqual(BOBONLINE_VARIADA, [...OLD_POOL, "meditate", "cupEar", "fingerGuns"]);
  assert.deepEqual(SIGNATURE_ONLY, NEW_IDS);
});

test("squadCelebrationFor: a escolhida vale; Variada sorteia do pool do Bobonline, igual nos dois aparelhos", () => {
  for (const id of [...OLD_IDS.slice(1), ...NEW_IDS]) assert.equal(squadCelebrationFor(id, "user-3", 77), id);
  const seen = new Set();
  for (let seed = 0; seed < 120; seed += 1) {
    for (const scorer of ["user-0", "user-1", "user-2", "cpu-3", "cpu-4"]) {
      const kind = squadCelebrationFor("auto", scorer, seed);
      assert.equal(kind, BOBONLINE_VARIADA[fnv(`${seed}|${scorer}`) % BOBONLINE_VARIADA.length]);
      assert.equal(squadCelebrationFor("auto", scorer, seed), kind, "determinístico");
      seen.add(kind);
    }
  }
  assert.deepEqual([...seen].sort(), [...BOBONLINE_VARIADA].sort(), "todas as 15 aparecem");
  assert.ok(!seen.has("kamehameha") && !seen.has("superSaiyan"), "as longas só quando escolhidas");
});

test("fonte: SIGNATURES do palco tem todas as comemorações, e as novas usam as ações de verdade", () => {
  const text = source("app/botao/three/character-stage.ts");
  const block = text.slice(text.indexOf("const SIGNATURES"), text.indexOf("};", text.indexOf("const SIGNATURES")));
  const keys = [...block.matchAll(/^\s{2}([A-Za-z]+): \[/gm)].map((item) => item[1]);
  assert.deepEqual([...keys].sort(), [...OLD_IDS.slice(1), ...NEW_IDS].sort());
  for (const id of NEW_IDS) {
    const line = block.split("\n").find((row) => row.trimStart().startsWith(`${id}: [`));
    assert.match(line, new RegExp(`action: "${id}"`), `${id} ainda é a vitrine provisória`);
  }
});

// ------------------------------------------------------------------ pausa extra

function discBody(id, side, extra = {}) {
  return { id, kind: "disc", side, isUserPlayer: false, number: 7, x: 0, y: 0, vx: 0, vy: 0, radius: 13.5, ...extra };
}

function squadSetup(userCelebrations, cpuCelebrations, extra = {}) {
  const appearance = (celebration) => ({ ...normalizePlayerAppearance({ version: 2 }), celebration });
  const user = userCelebrations.map(appearance);
  const cpu = cpuCelebrations.map(appearance);
  const player = (side, index) => ({ id: `${side}:p${index}`, name: `Jogador ${index}`, number: index + 2, position: "MC", overall: 76 });
  return {
    squads: { user: user.map((_, index) => player("user", index)), cpu: cpu.map((_, index) => player("cpu", index)) },
    visuals: { enabled: true, player: user[0], user, cpu },
    ...extra,
  };
}

test("CELEBRATION_EXTENSION_MS: Kamehameha +1000, Super Saiyajin +400, o resto 0", () => {
  assert.deepEqual({ ...timing.CELEBRATION_EXTENSION_MS }, { kamehameha: 1000, superSaiyan: 400 });
});

test("goalCelebrationExtensionMs / goalSignatureOf", () => {
  const { goalCelebrationExtensionMs: ext, goalSignatureOf: sig } = timing;
  // Elenco nomeado: user-0 Kamehameha, user-1 Super Saiyajin, user-2 Meditação, user-3 Variada; cpu-0 Kamehameha.
  const setup = squadSetup([13, 14, 15, 0, 17], [13, 0, 0, 0, 0]);
  const state = { bodies: [0, 1, 2, 3, 4].flatMap((slot) => [discBody(`user-${slot}`, "user"), discBody(`cpu-${slot}`, "cpu")]) };
  const goal = (scorerId, ownGoal = false) => ({ scorerId, ownGoal });
  assert.equal(ext(setup, state, goal("user-0")), 1000);
  assert.equal(sig(setup, state, goal("user-0")), "kamehameha");
  assert.equal(ext(setup, state, goal("user-1")), 400);
  assert.equal(sig(setup, state, goal("user-1")), "superSaiyan");
  assert.equal(ext(setup, state, goal("cpu-0")), 1000, "vale para os dois lados no Bobonline");
  for (const scorer of ["user-2", "user-3", "user-4", "cpu-1"]) {
    assert.equal(ext(setup, state, goal(scorer)), 0, scorer);
    assert.equal(sig(setup, state, goal(scorer)), null, scorer);
  }
  // Gol contra, sem autor, autor que não existe: nada.
  assert.equal(ext(setup, state, goal("user-0", true)), 0);
  assert.equal(sig(setup, state, goal("user-0", true)), null);
  assert.equal(ext(setup, state, goal(null)), 0);
  assert.equal(sig(setup, state, goal(null)), null);
  assert.equal(ext(setup, state, goal("ninguem")), 0);
  // Modo técnico com elenco: não é partida de elenco nomeado.
  const manager = squadSetup([13, 13, 13, 13, 13], [13, 13, 13, 13, 13], { managerMode: true, managerRosters: { user: { starters: [], bench: [] }, cpu: { starters: [], bench: [] } } });
  assert.equal(ext(manager, state, goal("user-0")), 0);

  // Carreira (sem squads): só o botão do jogador vale; o companheiro com a mesma escolha não estica a pausa.
  const kame = { ...normalizePlayerAppearance({ version: 2 }), celebration: 13 };
  const career = { visuals: { enabled: true, player: kame, user: [kame, kame, kame, kame, kame], cpu: [kame, kame, kame, kame, kame] } };
  const careerState = { bodies: [discBody("user-0", "user", { isUserPlayer: true }), discBody("user-1", "user"), discBody("cpu-1", "cpu")] };
  assert.equal(ext(career, careerState, goal("user-1")), 0);
  assert.equal(ext(career, careerState, goal("cpu-1")), 0);
  assert.equal(ext(career, careerState, goal("user-0")), 1000);
  assert.equal(sig(career, careerState, goal("user-0")), "kamehameha");
  // Personagens desligados: o jogador ainda usa a aparência do criador (a mesma regra do 3D).
  const hidden = { visuals: { ...career.visuals, enabled: false } };
  assert.equal(ext(hidden, careerState, goal("user-0")), 1000);
  assert.equal(ext({}, careerState, goal("user-0")), 0);
});

test("fonte: celebration-timing não puxa three nem a coreografia (entra no pacote do 2D)", () => {
  const text = source("app/botao/celebration-timing.ts");
  const imports = [...text.matchAll(/from "([^"]+)"/g)].map((item) => item[1]);
  assert.ok(imports.length > 0);
  for (const path of imports) assert.ok(!/three|choreography/.test(path), path);
});

// ------------------------------------------------------------------ coreografia

// Mesmo roteiro do digest gravado com a coreografia do HEAD (fafd053): 12 comemorações × 2 câmeras, 4 sorteios e um gol contra.
function actors(variant) {
  const list = [];
  for (let i = 0; i < 5; i += 1) list.push({ id: `user-${i}`, side: "user", x: -110 + i * 52 + variant * 7, z: -150 + (i % 3) * 40, isUser: i === 2 });
  for (let i = 0; i < 5; i += 1) list.push({ id: `cpu-${i}`, side: "cpu", x: -100 + i * 50 - variant * 5, z: -120 + (i % 2) * 60 });
  list.push({ id: "keeper-cpu", side: "cpu", x: 0, z: -215, keeper: true });
  return list;
}
const r9 = (value) => (typeof value === "number" ? Math.round(value * 1e9) / 1e9 : value);
function digestRun(args, aspect) {
  const c = new Choreographer();
  c.startGoal(args);
  const rows = [c.kind, c.focus, c.side];
  for (let frame = 0; frame < 160; frame += 1) {
    const dt = frame % 7 === 3 ? 1 / 30 : 1 / 60;
    const directives = c.update(dt, { x: 4, z: -228 });
    const shot = aspect === undefined ? c.camera() : c.camera(aspect);
    rows.push(shot ? [r9(shot.x), r9(shot.z), r9(shot.zoom), r9(shot.pitch), r9(shot.orbit)] : null);
    for (const [id, v] of directives) rows.push([id, r9(v.x), r9(v.z), v.sliding, v.intent.state, v.intent.action, r9(v.intent.faceYaw), r9(v.intent.speed), r9(v.intent.heading)]);
  }
  return fnv(JSON.stringify(rows)).toString(16);
}
function digests(aspect) {
  const out = {};
  for (const kind of OLD_POOL) {
    for (const yaw of [0, Math.PI / 2]) {
      out[`${kind}|${yaw.toFixed(2)}`] = digestRun({ side: "user", scorerId: "user-2", ownGoalId: null, ball: { x: 6, z: -228 }, actors: actors(1), cameraYaw: yaw, seed: 12345, signature: kind }, aspect);
    }
  }
  for (const seed of [1, 7, 99, 4242]) {
    out[`random|${seed}`] = digestRun({ side: "cpu", scorerId: "cpu-3", ownGoalId: null, ball: { x: -8, z: 228 }, actors: actors(2), cameraYaw: Math.PI, seed, signature: null }, aspect);
  }
  out.own = digestRun({ side: "user", scorerId: null, ownGoalId: "cpu-1", ball: { x: 0, z: -228 }, actors: actors(0), cameraYaw: 0.3, seed: 5 }, aspect);
  return out;
}
/** Gravado da coreografia do HEAD fafd053 (antes do Bobonline). */
const HEAD_DIGESTS = {
  "kneeSlide|0.00": "44893db2", "kneeSlide|1.57": "e85dcf28", "siuu|0.00": "5cc2c26d", "siuu|1.57": "c344df17",
  "cornerFlag|0.00": "13d70f7d", "cornerFlag|1.57": "bb3b8311", "backflip|0.00": "37f98e", "backflip|1.57": "bf5469c",
  "airplane|0.00": "63ff9576", "airplane|1.57": "1747c84d", "crest|0.00": "6c3c4706", "crest|1.57": "4ff16cc9",
  "heart|0.00": "5eb83f4b", "heart|1.57": "36507c02", "shush|0.00": "c2bdc40c", "shush|1.57": "79f09c35",
  "armsCrossed|0.00": "55ef256c", "armsCrossed|1.57": "fb5b5bc6", "cradle|0.00": "4603ce48", "cradle|1.57": "9cfd5a65",
  "robot|0.00": "8b0ad474", "robot|1.57": "e2f92006", "dance|0.00": "32b4562d", "dance|1.57": "1ea35e2a",
  "random|1": "f5faf4d", "random|7": "74be2687", "random|99": "c70678d8", "random|4242": "7525be78", own: "5455d150",
};

test("Choreographer: as 12 de sempre (câmera e bonecos) iguais ao HEAD, com e sem aspect", () => {
  assert.deepEqual(digests(undefined), HEAD_DIGESTS, "camera() sem aspect");
  assert.deepEqual(digests(16 / 9), HEAD_DIGESTS, "aspect deitado");
  assert.deepEqual(digests(0.46), HEAD_DIGESTS, "aspect em pé só muda o Kamehameha");
});

const KIND_ACTION = { kamehameha: "kamehameha", superSaiyan: "superSaiyan", meditate: "meditate", cupEar: "cupEar", fingerGuns: "fingerGuns" };

/** Roda uma festa e devolve os quadros (diretivas e câmera). */
function playGoal(args, { seconds = 3.4, aspect } = {}) {
  const c = new Choreographer();
  c.startGoal(args);
  const frames = [];
  for (let t = 0; t < seconds; t += DT) {
    const directives = c.update(DT, args.ball);
    frames.push({ t: t + DT, directives, shot: c.camera(aspect) });
  }
  return { c, frames };
}

function goalArgs(extra = {}) {
  return { side: "user", scorerId: "user-2", ownGoalId: null, ball: { x: 6, z: -228 }, actors: actors(1), cameraYaw: 0, seed: 12345, ...extra };
}

test("as 5 novas têm o próprio case (nenhuma vira beijo no escudo) e fazem a própria ação", () => {
  for (const kind of NEW_IDS) {
    for (const cameraYaw of [0, Math.PI / 2]) {
      const { c, frames } = playGoal(goalArgs({ signature: kind, cameraYaw }));
      assert.equal(c.kind, kind);
      const actions = frames.map((frame) => frame.directives.get("user-2").intent.action);
      assert.equal(actions.at(-1), KIND_ACTION[kind], `${kind}: pose final`);
      assert.ok(!actions.includes("crestKiss"), `${kind} caiu no default`);
      for (const frame of frames) {
        for (const [, directive] of frame.directives) {
          assert.ok(finite(directive.x) && finite(directive.z), `${kind}: posição não finita`);
          assert.ok(directive.intent.faceYaw === null || finite(directive.intent.faceYaw), `${kind}: faceYaw ${directive.intent.faceYaw}`);
        }
      }
    }
  }
});

test("signatureFor substitui a regra do isUser; gol contra continua aviãozinho", () => {
  const asked = [];
  const signatureFor = (id) => {
    asked.push(id);
    return id === "user-1" ? "fingerGuns" : null;
  };
  // user-1 não é o jogador do usuário: com signatureFor, a escolha dele vale.
  let c = new Choreographer();
  c.startGoal(goalArgs({ scorerId: "user-1", signatureFor, signature: "kamehameha" }));
  assert.equal(c.kind, "fingerGuns");
  assert.deepEqual(asked, ["user-1"]);
  // null cai no sorteio de sempre (a assinatura do jogador do usuário não entra).
  c = new Choreographer();
  c.startGoal(goalArgs({ scorerId: "user-2", signatureFor, signature: "kamehameha" }));
  assert.equal(c.kind, OLD_POOL[fnv("12345|user-2") % OLD_POOL.length]);
  c = new Choreographer();
  c.startGoal(goalArgs({ scorerId: null, ownGoalId: "cpu-1", signatureFor: () => "kamehameha" }));
  assert.equal(c.kind, "airplane");
  // Sem signatureFor: a de sempre (só o isUser).
  c = new Choreographer();
  c.startGoal(goalArgs({ scorerId: "user-1", signature: "kamehameha" }));
  assert.notEqual(c.kind, "kamehameha");
  c = new Choreographer();
  c.startGoal(goalArgs({ scorerId: "user-2", signature: "kamehameha" }));
  assert.equal(c.kind, "kamehameha");
});

function kameActors(scorerX, extraRivals) {
  const list = [
    { id: "user-0", side: "user", x: scorerX, z: -150, isUser: true },
    { id: "user-1", side: "user", x: -40, z: -60 },
    { id: "user-2", side: "user", x: 20, z: 40 },
    { id: "cpu-0", side: "cpu", x: -120, z: 150 },
    ...extraRivals,
  ];
  return list;
}

test("Kamehameha: mira de três quartos (ângulo fechado), corredor do raio e câmera acompanhando", () => {
  for (const sx of [1, -1]) {
    for (const portrait of [false, true]) {
      const cameraYaw = 0.3;
      const beamYaw = cameraYaw + sx * 0.95;
      const finish = { x: sx * 60 + sx * 30, z: -150 + 25 };
      const along = { x: Math.sin(beamYaw), z: Math.cos(beamYaw) };
      const inside = { id: "cpu-1", side: "cpu", x: finish.x + along.x * 45, z: finish.z + along.z * 45 };
      const behind = { id: "cpu-2", side: "cpu", x: finish.x - along.x * 45, z: finish.z - along.z * 45 };
      const aspect = portrait ? 0.5 : 16 / 9;
      const { frames } = playGoal(
        { side: "user", scorerId: "user-0", ownGoalId: null, ball: { x: 0, z: -228 }, actors: kameActors(sx * 60, [inside, behind]), cameraYaw, seed: 3, signature: "kamehameha", aspect },
        { seconds: 3.6, aspect },
      );
      const scorer = frames.at(-1).directives.get("user-0");
      assert.equal(scorer.intent.action, "kamehameha");
      assert.ok(Math.abs(scorer.intent.faceYaw - beamYaw) < 1e-9, `faceYaw ${scorer.intent.faceYaw} != ${beamYaw}`);
      assert.ok(Math.hypot(scorer.x - finish.x, scorer.z - finish.z) < 1e-6, "parou no ponto da corrida curta");
      // Quem está no corredor cai sentado depois do disparo; quem está atrás não.
      const holdStart = frames.find((frame) => frame.directives.get("user-0").intent.action === "kamehameha").t;
      const sitAt = frames.find((frame) => frame.directives.get("cpu-1").intent.action === "sitDown")?.t;
      assert.ok(sitAt !== undefined, "o do corredor não caiu");
      assert.ok(sitAt - holdStart > KAME.FIRE && sitAt - holdStart < KAME.FIRE + 0.5, `caiu em ${sitAt - holdStart}`);
      assert.ok(!frames.some((frame) => frame.directives.get("cpu-2").intent.action === "sitDown"));
      assert.ok(!frames.some((frame) => frame.directives.get("cpu-0").intent.action === "sitDown"));
      // Câmera: na carga o close de sempre; a 0,25 s do disparo começa a andar 35 pelo raio e abrir (2,1 deitado, 1,7 em pé).
      const before = frames.find((frame) => frame.t >= holdStart + KAME.FIRE - 0.3).shot;
      assert.ok(Math.abs(before.zoom - 2.75) < 1e-6, `zoom antes ${before.zoom}`);
      const atFire = frames.find((frame) => frame.t >= holdStart + KAME.FIRE).shot;
      assert.ok(atFire.zoom < 2.75 - 0.15, `a câmera devia já estar abrindo no disparo (${atFire.zoom})`);
      const last = frames.at(-1);
      assert.ok(last.t > holdStart + KAME.FIRE + 0.5);
      assert.ok(Math.abs(last.shot.zoom - (portrait ? 1.7 : 2.1)) < 1e-6, `zoom ${last.shot.zoom}`);
      assert.ok(Math.abs(last.shot.x - (finish.x + along.x * 35)) < 1e-6 && Math.abs(last.shot.z - (finish.z + along.z * 35)) < 1e-6);
      // A órbita lenta gira para o lado do raio (fecha o ângulo com a câmera), do mesmo tamanho de sempre.
      assert.ok(frames.every((frame) => !frame.shot || frame.shot.orbit === 0 || Math.sign(frame.shot.orbit) === sx), "órbita para o lado errado");
      assert.ok(Math.abs(Math.abs(last.shot.orbit) - Math.min(0.42, last.t * 0.16)) < 1e-6, `órbita ${last.shot.orbit}`);
    }
  }
});

test("Kamehameha: a órbita volta ao sentido de sempre na festa seguinte (e no stop)", () => {
  const c = new Choreographer();
  c.startGoal({ side: "user", scorerId: "user-0", ownGoalId: null, ball: { x: 0, z: -228 }, actors: kameActors(-60, []), cameraYaw: 0, seed: 3, signature: "kamehameha", aspect: 0.5 });
  for (let t = 0; t < 1; t += DT) c.update(DT, { x: 0, z: -228 });
  assert.ok(c.camera().orbit < 0, "raio para -x: órbita negativa");
  c.startGoal({ side: "user", scorerId: "user-0", ownGoalId: null, ball: { x: 0, z: -228 }, actors: kameActors(-60, []), cameraYaw: 0, seed: 3, signature: "robot" });
  for (let t = 0; t < 1; t += DT) c.update(DT, { x: 0, z: -228 });
  assert.ok(c.camera().orbit > 0);
  c.startGoal({ side: "user", scorerId: "user-0", ownGoalId: null, ball: { x: 0, z: -228 }, actors: kameActors(-60, []), cameraYaw: 0, seed: 3, signature: "kamehameha", aspect: 0.5 });
  c.stop();
  c.startFinal({ winner: "user", actors: kameActors(-60, []), cameraYaw: 0 });
  for (let t = 0; t < 1; t += DT) c.update(DT, { x: 0, z: -228 });
  assert.ok(c.camera().orbit > 0, "apito final com a órbita de sempre");
});

test("Kamehameha: o corredor de quem cai para onde a ponta do raio para (no avental)", () => {
  // Limites: |x| = 150 + 38 e |z| = 230 + 55, na frente das duas arquibancadas.
  assert.ok(Math.abs(beamRoom(100, 0, 1, 0) - 88) < 1e-9);
  assert.ok(Math.abs(beamRoom(-100, 0, -1, 0) - 88) < 1e-9);
  assert.ok(Math.abs(beamRoom(0, 200, 0, 1) - 85) < 1e-9);
  assert.ok(Math.abs(beamRoom(0, -200, 0, -1) - 85) < 1e-9);
  assert.ok(Math.abs(beamRoom(100, 0, Math.SQRT1_2, Math.SQRT1_2) - 88 * Math.SQRT2) < 1e-9);
  assert.equal(beamRoom(0, 0, 0, 0), Infinity);
  // Quem marcou na beira do campo: o raio (em pé, 80) bateria na arquibancada; quem está depois da ponta não cai.
  const cameraYaw = 0;
  const beamYaw = cameraYaw + 0.95;
  const along = { x: Math.sin(beamYaw), z: Math.cos(beamYaw) };
  const finish = { x: 135, z: -125 };
  const room = beamRoom(finish.x, finish.z, along.x, along.z);
  assert.ok(room < 70, `sobra ${room}`);
  const at = (id, distance) => ({ id, side: "cpu", x: finish.x + along.x * distance, z: finish.z + along.z * distance });
  const { frames } = playGoal(
    { side: "user", scorerId: "user-0", ownGoalId: null, ball: { x: 0, z: -228 }, actors: kameActors(130, [at("cpu-1", room - 20), at("cpu-2", room + 12)]), cameraYaw, seed: 3, signature: "kamehameha", aspect: 0.5 },
    { seconds: 3.6, aspect: 0.5 },
  );
  const scorer = frames.at(-1).directives.get("user-0");
  assert.ok(Math.hypot(scorer.x - finish.x, scorer.z - finish.z) < 1e-6);
  assert.ok(frames.some((frame) => frame.directives.get("cpu-1").intent.action === "sitDown"), "o de antes da ponta cai");
  assert.ok(!frames.some((frame) => frame.directives.get("cpu-2").intent.action === "sitDown"), "o de depois da ponta não cai");
});

test("Kamehameha: sem aspect no startGoal vale o último que a câmera recebeu", () => {
  const c = new Choreographer();
  c.camera(0.5);
  c.startGoal({ side: "user", scorerId: "user-0", ownGoalId: null, ball: { x: 0, z: -228 }, actors: kameActors(60, []), cameraYaw: 0, seed: 3, signature: "kamehameha" });
  let last = null;
  for (let t = 0; t < 1; t += DT) last = c.update(DT, { x: 0, z: -228 });
  assert.ok(Math.abs(last.get("user-0").intent.faceYaw - 0.95) < 1e-9);
});

test("meditação: companheiros aplaudem (ninguém pula); Super Saiyajin: a roda abre 10", () => {
  const mates = (kind) => {
    const { frames } = playGoal(goalArgs({ signature: kind, actors: actors(1).map((actor) => ({ ...actor, z: actor.z + 120 })), ball: { x: 6, z: -228 } }), { seconds: 3.4 });
    const last = frames.at(-1).directives;
    const scorer = last.get("user-2");
    const ids = ["user-0", "user-1", "user-3", "user-4"];
    return {
      actions: frames.flatMap((frame) => ids.map((id) => frame.directives.get(id).intent.action)),
      distances: ids.map((id) => Math.hypot(last.get(id).x - scorer.x, last.get(id).z - scorer.z)),
    };
  };
  const zen = mates("meditate");
  assert.ok(!zen.actions.includes("jumpCheer"));
  assert.ok(zen.actions.includes("clap"));
  const robot = mates("robot");
  const ssj = mates("superSaiyan");
  assert.ok(robot.actions.includes("jumpCheer"), "a roda normal ainda pula");
  assert.ok(Math.min(...ssj.distances) > Math.min(...robot.distances) + 7, `${ssj.distances} vs ${robot.distances}`);
});

// ------------------------------------------------------------------ ações do boneco

let figureSeedRight = 0;
for (let seed = 1; seed < 40 && !figureSeedRight; seed += 1) {
  if (new PlayerFigure({ appearance: null, primary: "#c33", secondary: "#fff", number: 9, seed }).handedness > 0) figureSeedRight = seed;
}
function makeFigure(seed = figureSeedRight) {
  return new PlayerFigure({ appearance: null, primary: "#c33", secondary: "#fff", number: 9, seed });
}
const ACTION_STATE = { penaltyFocus: "ready", keeperTaunt: "keeper" };
const EXPECTED_CUES = {
  kamehameha: [["kame-charge", KAME.CHARGE], ["kame-fire", KAME.FIRE], ["kame-end", KAME.BEAM_END]],
  superSaiyan: [["ssj-start", 0.3], ["ssj-burst", 0.9]],
  meditate: [["zen", 0.8]],
  cupEar: [["ear", 0.1], ["ear", 1.7]],
  fingerGuns: [["bang", 0.35], ["bang", 0.78]],
  penaltyFocus: [],
  keeperTaunt: [],
};

function checkFigureFinite(figure, label) {
  figure.root.updateMatrixWorld(true);
  for (const bone of figure.skinnedMesh.skeleton.bones) for (const value of bone.matrixWorld.elements) assert.ok(Number.isFinite(value), `${label}: osso não finito`);
  const v = new THREE.Vector3();
  for (const side of ["left", "right"]) {
    figure.handAnchor(side).getWorldPosition(v);
    assert.ok(Number.isFinite(v.x + v.y + v.z), `${label}: mão não finita`);
  }
}

test("KAME e as 7 ações novas no catálogo (keeperTaunt é overlay)", () => {
  assert.deepEqual({ ...KAME }, { CHARGE: 0.25, FIRE: 1.05, BEAM_END: 1.8, FADE_END: 2.1 });
  for (const id of ["kamehameha", "superSaiyan", "meditate", "cupEar", "fingerGuns", "penaltyFocus"]) assert.ok(FIGURE_ACTION_INFO[id], id);
  assert.equal(FIGURE_ACTION_INFO.keeperTaunt, undefined);
  assert.equal(FIGURE_ACTION_INFO.cupEar.body, "upper");
  assert.equal(FIGURE_ACTION_INFO.kamehameha.body, "full");
});

test("ações novas: marcas de tempo na hora certa, takeCues reaproveita a lista, pose sempre finita", () => {
  for (const seed of [figureSeedRight, 7]) {
    for (const [action, expected] of Object.entries(EXPECTED_CUES)) {
      const figure = makeFigure(seed);
      const got = [];
      let list = null;
      let t = 0;
      for (let frame = 0; frame < 200; frame += 1) {
        figure.update(DT, idleIntent({ state: ACTION_STATE[action] ?? "celebrate", action, faceYaw: 0, shuffle: action === "keeperTaunt" ? 120 : 0 }));
        t += DT;
        const cues = figure.takeCues();
        if (list) assert.equal(cues, list, "a mesma lista a cada chamada");
        list = cues;
        for (const cue of cues) got.push([cue, t]);
        if (frame % 4 === 0) checkFigureFinite(figure, `${action}@${t.toFixed(2)}`);
      }
      assert.deepEqual(got.map((item) => item[0]), expected.map((item) => item[0]), action);
      got.forEach(([, at], index) => assert.ok(Math.abs(at - expected[index][1]) <= DT + 1e-9, `${action}: ${got[index][0]} em ${at}`));
    }
  }
});

test("takeCues esvazia na leitura seguinte e guarda no máximo 8 quando ninguém lê", () => {
  const figure = makeFigure();
  for (let frame = 0; frame < 80; frame += 1) figure.update(DT, idleIntent({ state: "celebrate", action: "kamehameha" }));
  const first = figure.takeCues();
  assert.deepEqual([...first], ["kame-charge", "kame-fire"]);
  assert.equal(figure.takeCues().length, 0);
  // Laço da vitrine sem leitor: 5 ciclos de 3 marcas, só as 8 últimas ficam.
  for (let cycle = 0; cycle < 5; cycle += 1) {
    for (let frame = 0; frame < 120; frame += 1) figure.update(DT, idleIntent({ state: "celebrate", action: "kamehameha" }));
    figure.update(DT, idleIntent({ state: "celebrate", action: null }));
  }
  assert.equal(figure.takeCues().length, 8);
});

test("Kamehameha: palmas juntas na carga, empurradas para a frente no disparo; pés no chão", () => {
  for (const seed of [figureSeedRight, 7]) {
    const figure = makeFigure(seed);
    const rest = makeFigure(seed);
    for (let frame = 0; frame < 30; frame += 1) rest.update(DT, idleIntent({ state: "celebrate", action: null, faceYaw: 0 }));
    rest.root.updateMatrixWorld(true);
    const bones = (fig) => fig.skinnedMesh.skeleton.bones;
    const ankleY = (fig, index) => new THREE.Vector3().setFromMatrixPosition(bones(fig)[index].matrixWorld).y;
    const restAnkle = (ankleY(rest, 10) + ankleY(rest, 11)) / 2;
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    const sample = {};
    let t = 0;
    for (let frame = 0; frame < 150; frame += 1) {
      figure.update(DT, idleIntent({ state: "celebrate", action: "kamehameha", faceYaw: 0 }));
      t += DT;
      figure.root.updateMatrixWorld(true);
      figure.handAnchor("left").getWorldPosition(left);
      figure.handAnchor("right").getWorldPosition(right);
      const mid = left.clone().add(right).multiplyScalar(0.5);
      if (Math.abs(t - 0.95) < DT / 2) sample.charge = { gap: left.distanceTo(right), mid };
      if (Math.abs(t - 1.5) < DT / 2) sample.push = { gap: left.distanceTo(right), mid };
      // Base larga e agachada: a chuteira fica plana no gramado (fora do tranco do disparo, que recua o corpo).
      if (t > 0.3 && (t < KAME.FIRE - 0.05 || t > KAME.FIRE + 0.6)) {
        const feet = (ankleY(figure, 10) + ankleY(figure, 11)) / 2;
        assert.ok(Math.abs(feet - restAnkle) < 1.3, `seed ${seed}: pé a ${feet - restAnkle} do chão em ${t.toFixed(2)}`);
      }
    }
    // Olhando para +z: na carga a esfera fica entre as palmas, na frente da barriga; no disparo as mãos vão à frente do peito.
    assert.ok(sample.charge.gap < 9, `palmas a ${sample.charge.gap}`);
    assert.ok(sample.charge.mid.z > 3, `esfera em z ${sample.charge.mid.z}`);
    assert.ok(sample.push.mid.z > sample.charge.mid.z + 3, "o empurrão leva as mãos para a frente");
    assert.ok(sample.push.mid.y > 16 && sample.push.mid.y < 36, `mãos a ${sample.push.mid.y} de altura`);
  }
});

test("keeperTaunt é overlay: as pernas do passinho do goleiro continuam, os braços abrem", () => {
  // O relógio interno do boneco nasce sorteado: os dois nascem com o mesmo.
  const random = Math.random;
  Math.random = () => 0.5;
  let plain;
  let taunt;
  try {
    plain = makeFigure(5);
    taunt = makeFigure(5);
  } finally {
    Math.random = random;
  }
  let armsDiffer = false;
  for (let frame = 0; frame < 120; frame += 1) {
    const shuffle = frame % 50 < 25 ? 140 : -140;
    plain.update(DT, idleIntent({ state: "keeper", shuffle, faceYaw: Math.PI }));
    taunt.update(DT, idleIntent({ state: "keeper", shuffle, faceYaw: Math.PI, action: "keeperTaunt" }));
    const a = plain.skinnedMesh.skeleton.bones;
    const b = taunt.skinnedMesh.skeleton.bones;
    for (let index = 6; index < 12; index += 1) assert.ok(a[index].quaternion.angleTo(b[index].quaternion) < 1e-6, `perna ${index} mudou no quadro ${frame}`);
    if (a[2].quaternion.angleTo(b[2].quaternion) > 0.5) armsDiffer = true;
  }
  assert.ok(armsDiffer, "os braços deviam abrir");
});

// ------------------------------------------------------------------ efeitos

function camera() {
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 1, 2000);
  cam.position.set(0, 120, 260);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}
const beamMeshOf = (effects) => effects.group.children.find((child) => child.material?.vertexShader?.includes("aBeam"));

test("Effects: o raio é um mesh do grupo (compila no prepare), invisível sem pedido, GLSL só ASCII", () => {
  const effects = new Effects({ surface: "grass" });
  const beam = beamMeshOf(effects);
  assert.ok(beam, "raio fora do grupo");
  assert.equal(effects.group.children.length, 5);
  assert.equal(beam.visible, false);
  assert.equal(beam.frustumCulled, false);
  assert.equal(beam.material.depthWrite, false);
  assert.equal(beam.material.blending, THREE.AdditiveBlending);
  assert.equal(beam.material.fog, true);
  for (const shader of [beam.material.vertexShader, beam.material.fragmentShader]) assert.match(shader, /^[\x00-\x7f]*$/);
  // Todo GLSL do arquivo (os templates /* glsl */) continua ASCII.
  for (const block of source("app/botao/three/effects.ts").matchAll(/\/\* glsl \*\/ `([^`]*)`/g)) assert.match(block[1], /^[\x00-\x7f]*$/);
  effects.prepare({ initTexture() {} });
  assert.equal(beam.visible, true, "quadro descartável do prepare desenha o raio");
  const cam = camera();
  effects.update(DT, cam);
  assert.equal(beam.visible, false);
  effects.beam(0, 25, 0, 0, -0.2, 1, 110, 7, KAME_COLOR, 1);
  effects.update(DT, cam);
  assert.equal(beam.visible, true);
  const u = beam.material.uniforms;
  assert.ok(Math.abs(u.uLength.value - 110) < 1e-9 && u.uWidth.value === 7);
  assert.ok(Math.abs(u.uDir.value.length() - 1) < 1e-6, "direção unitária");
  effects.update(DT, cam);
  assert.equal(beam.visible, false, "pedido vale um quadro só");
  effects.dispose();
});

test("Effects: no canvas transparente (palco) o aditivo não escreve alfa; na partida a mistura é a de sempre", () => {
  const additive = (effects) => effects.group.children.filter((child) => child.material.blending !== THREE.NormalBlending);
  const match = new Effects({ surface: "grass" });
  assert.ok(additive(match).length >= 4);
  for (const mesh of additive(match)) assert.equal(mesh.material.blending, THREE.AdditiveBlending);
  const stage = new Effects({ surface: "grass", overTransparent: true });
  for (const mesh of additive(stage)) {
    assert.equal(mesh.material.blending, THREE.CustomBlending);
    assert.equal(mesh.material.blendSrc, THREE.SrcAlphaFactor);
    assert.equal(mesh.material.blendDst, THREE.OneFactor);
    assert.equal(mesh.material.blendSrcAlpha, THREE.ZeroFactor);
    assert.equal(mesh.material.blendDstAlpha, THREE.OneFactor);
  }
  match.dispose();
  stage.dispose();
});

test("Effects: pedidos com NaN ou zero são ignorados e não envenenam o balde de partículas", () => {
  const effects = new Effects({ surface: "grass" });
  const cam = camera();
  effects.orb(Number.NaN, 0, 0, 5, "#ffffff", 1);
  effects.orb(0, 0, 0, Number.NaN, "#ffffff", 1);
  effects.orb(0, 0, 0, 5, "#ffffff", Number.POSITIVE_INFINITY);
  effects.beam(0, 0, 0, 0, 0, 0, 100, 7, "#ffffff", 1);
  effects.beam(Number.NaN, 0, 0, 1, 0, 0, 100, 7, "#ffffff", 1);
  effects.beam(0, 0, 0, 1, 0, 0, Number.NaN, 7, "#ffffff", 1);
  effects.beam(0, 0, 0, 1, 0, 0, 100, 7, "#ffffff", Number.NaN);
  effects.aura(0, 0, 40, "#ffffff", Number.NaN);
  effects.aura(Number.NaN, 0, 40, "#ffffff", 1);
  effects.converge(0, Number.NaN, 0, 10, "#ffffff", 20);
  effects.update(DT, cam);
  assert.equal(effects.glow.live, 0);
  assert.equal(effects.glow.mesh.visible, false);
  assert.equal(beamMeshOf(effects).visible, false);
  assert.ok(Number.isFinite(effects.tokens));
  effects.update(Number.NaN, cam);
  assert.ok(Number.isFinite(effects.tokens));
  for (let frame = 0; frame < 10; frame += 1) {
    effects.aura(0, 0, 40, SSJ_COLOR, 1);
    effects.update(DT, cam);
  }
  assert.ok(effects.glow.live > 0, "a aura válida ainda solta partículas");
  effects.dispose();
});

test("Effects: no máximo 4 esferas por quadro (3 quads cada, na folga do pool)", () => {
  const effects = new Effects({ surface: "grass", reducedMotion: true });
  const cam = camera();
  for (let index = 0; index < 6; index += 1) effects.orb(index * 10, 20, 0, 8, KAME_COLOR, 1);
  effects.update(DT, cam);
  assert.equal(effects.glow.geometry.instanceCount, 12);
  assert.equal(effects.glow.live, 0, "esfera não ocupa vaga de partícula");
  effects.update(DT, cam);
  assert.equal(effects.glow.geometry.instanceCount, 0);
  assert.equal(effects.glow.mesh.visible, false);
  effects.dispose();
});

test("Effects: carga + aura + raio cabem no balde de partículas (4 s)", () => {
  for (const options of [{ surface: "grass" }, { surface: "grass", performance: true }, { surface: "futsal", lowPower: true }]) {
    const effects = new Effects(options);
    const cam = camera();
    let spawned = 0;
    const spawn = effects.glow.spawn.bind(effects.glow);
    effects.glow.spawn = (spec) => {
      spawned += 1;
      spawn(spec);
    };
    const low = options.performance || options.lowPower;
    for (let frame = 0; frame < 240; frame += 1) {
      effects.converge(0, 25, 10, 20, KAME_COLOR, 120);
      effects.aura(0, 0, 45, SSJ_COLOR, 1);
      effects.beam(0, 25, 10, 0, -0.2, 1, 110, 7, KAME_COLOR, 1);
      effects.orb(0, 25, 10, 9, KAME_COLOR, 1.3);
      effects.update(DT, cam);
      assert.ok(effects.glow.geometry.instanceCount <= (low ? 192 : 384) + 28);
    }
    const rate = low ? 200 : 400;
    const burst = low ? 75 : 150;
    assert.ok(spawned > 0);
    assert.ok(spawned <= rate * 4 + burst, `${spawned} partículas em 4 s`);
    // Modo desempenho: sem a fita (um draw call a menos); os riscos fazem o corpo do raio.
    assert.equal(Boolean(beamMeshOf(effects)), !options.performance);
    effects.dispose();
  }
});

test("Effects: movimento reduzido não solta carga nem labareda", () => {
  const effects = new Effects({ surface: "grass", reducedMotion: true });
  const cam = camera();
  for (let frame = 0; frame < 60; frame += 1) {
    effects.converge(0, 25, 10, 20, KAME_COLOR, 120);
    effects.aura(0, 0, 45, SSJ_COLOR, 1);
    effects.update(DT, cam);
  }
  assert.equal(effects.glow.live, 0);
  effects.dispose();
});

// ------------------------------------------------------------------ CelebrationFx

const FX_METHODS = ["orb", "beam", "aura", "converge", "shockwave", "kickPuff", "impact", "sparkle"];
function recorder() {
  const calls = [];
  const effects = {};
  for (const name of FX_METHODS) effects[name] = (...args) => calls.push({ name, args });
  return { effects, calls };
}

/** Boneco de verdade fazendo a ação, efeitos gravados. */
function playFx(action, { seconds = 3, options = {}, aspect, side = "user", stadium = null, seed = figureSeedRight } = {}) {
  const figure = makeFigure(seed);
  const rec = recorder();
  const fx = new CelebrationFx(rec.effects, { lite: false, reducedMotion: false, ...options });
  fx.prepare();
  const frames = [];
  let t = 0;
  for (let frame = 0; frame < Math.round(seconds / DT); frame += 1) {
    figure.update(DT, idleIntent({ state: "celebrate", action, faceYaw: 0 }));
    t += DT;
    rec.calls.length = 0;
    const result = { ...fx.update(DT, { kind: action, focus: { figure, x: 0, z: 0, yaw: figure.yaw }, side, teamColor: "#cc3333", stadium, aspect }) };
    const end = fx.beamEnd();
    frames.push({ t, calls: [...rec.calls], result, beamEnd: end && { ...end } });
  }
  return { figure, fx, frames, rec };
}
const callsOf = (frames, name) => frames.flatMap((frame) => frame.calls.filter((call) => call.name === name).map((call) => ({ ...call, t: frame.t })));

test("CelebrationFx Kamehameha: esfera crescendo nas mãos, raio forte com tranco, luz e ponta no gramado", () => {
  for (const seed of [figureSeedRight, 7]) {
    const { frames } = playFx("kamehameha", { seconds: 3, seed });
    for (const frame of frames) frame.calls.forEach(assertFiniteArgs);
    const orbs = callsOf(frames, "orb");
    const firstOrb = orbs[0];
    assert.ok(Math.abs(firstOrb.t - KAME.CHARGE) <= DT + 1e-9, `esfera começou em ${firstOrb.t}`);
    assert.ok(firstOrb.args[3] > 3.5 && firstOrb.args[3] < 4.5, `tamanho inicial ${firstOrb.args[3]}`);
    assert.equal(firstOrb.args[4], KAME_COLOR);
    const lastCharge = orbs.filter((call) => call.t < KAME.FIRE).at(-1);
    assert.ok(lastCharge.args[3] > 8 && lastCharge.args[3] < 10, `tamanho no fim da carga ${lastCharge.args[3]}`);
    const converge = callsOf(frames, "converge");
    assert.ok(converge.length > 40 && converge.every((call) => call.args[5] === 20 && call.t < KAME.FIRE));
    // Disparo: tranco, onda no chão, poeira atrás, céu azul.
    const fire = frames.find((frame) => frame.calls.some((call) => call.name === "beam"));
    assert.ok(Math.abs(fire.t - KAME.FIRE) <= DT + 1e-9, `raio saiu em ${fire.t}`);
    assert.ok(fire.result.shake >= 0.6 && fire.result.glow === 1 && fire.result.glowColor === KAME_COLOR);
    const wave = fire.calls.find((call) => call.name === "shockwave");
    assert.deepEqual(wave.args, [0, 0, KAME_COLOR, 50]);
    const puff = fire.calls.find((call) => call.name === "kickPuff");
    assert.ok(puff.args[1] < 0, "poeira atrás dos pés (ele olha para +z)");
    // O raio: cresce até 110 em 0,12 s, largura 7, segura 0,75 s e apaga em 0,3 s.
    const beams = callsOf(frames, "beam");
    assert.equal(beams[0].args[8], KAME_COLOR);
    assert.equal(beams[0].args[7], 7);
    const full = beams.find((call) => call.args[6] > 109.99);
    assert.ok(full && full.t - fire.t <= 0.12 + DT + 1e-9, "comprimento todo em 0,12 s");
    assert.ok(beams.every((call) => call.args[6] <= 110 + 1e-9));
    assert.ok(beams.every((call) => call.args[5] > 0.9), "sai para a frente do boneco");
    const lastBeam = beams.at(-1);
    const duration = lastBeam.t - fire.t;
    assert.ok(duration > 0.75 + 0.2 && duration < 0.75 + 0.3 + DT * 2, `raio durou ${duration}`);
    // Ponta: encosta no gramado e explode lá (impacto forte uma vez, menores depois).
    const tipFrame = frames.find((frame) => frame.t >= full.t && frame.beamEnd);
    assert.ok(tipFrame.beamEnd.y < 9, `ponta a ${tipFrame.beamEnd.y} do chão`);
    assert.ok(tipFrame.beamEnd.z > 95, "ponta longe, na frente");
    const impacts = callsOf(frames, "impact");
    assert.equal(impacts[0].args[3], 1);
    assert.ok(impacts.length >= 3);
    // Depois de apagar, nada mais e beamEnd null.
    const after = frames.filter((frame) => frame.t > lastBeam.t + DT);
    assert.ok(after.length > 10 && after.every((frame) => frame.calls.length === 0 && frame.beamEnd === null && frame.result.shake === 0));
    // beamEnd só enquanto o raio aparece.
    assert.ok(frames.every((frame) => (frame.beamEnd !== null) === frame.calls.some((call) => call.name === "beam")));
  }
});

test("CelebrationFx Kamehameha: em pé o raio encurta para 80; movimento reduzido sem tremor e raio pela metade", () => {
  const portrait = playFx("kamehameha", { seconds: 2.4, aspect: 0.5 });
  assert.ok(Math.abs(Math.max(...callsOf(portrait.frames, "beam").map((call) => call.args[6])) - 80) < 1e-9);
  const calm = playFx("kamehameha", { seconds: 2.4, options: { reducedMotion: true } });
  assert.ok(calm.frames.every((frame) => frame.result.shake === 0));
  assert.ok(callsOf(calm.frames, "beam").every((call) => call.args[9] <= 0.5 + 1e-9));
  assert.ok(callsOf(calm.frames, "beam").length > 30);
});

test("CelebrationFx Kamehameha: perto da lateral ou do fundo a ponta para no avental e ainda encosta no chão", () => {
  // Boneco de verdade parado em (x, z) olhando para `yaw`; devolve o maior raio e as pontas.
  const fire = (x, z, yaw, aspect) => {
    const figure = makeFigure();
    figure.root.position.set(x, 0, z);
    const rec = recorder();
    const fx = new CelebrationFx(rec.effects, { lite: false, reducedMotion: false });
    const tips = [];
    let longest = 0;
    for (let frame = 0; frame < Math.round(2.4 / DT); frame += 1) {
      figure.update(DT, idleIntent({ state: "celebrate", action: "kamehameha", faceYaw: yaw }));
      rec.calls.length = 0;
      fx.update(DT, { kind: "kamehameha", focus: { figure, x, z, yaw: figure.yaw }, side: "user", teamColor: "#cc3333", stadium: null, aspect });
      rec.calls.forEach(assertFiniteArgs);
      for (const call of rec.calls) if (call.name === "beam") longest = Math.max(longest, call.args[6]);
      const end = fx.beamEnd();
      if (end) tips.push({ ...end });
    }
    assert.ok(tips.length > 30);
    return { longest, tips, last: tips.at(-1) };
  };
  // Na lateral (|x| até 188) e no fundo (|z| até 285), dos dois lados; a ponta toca o gramado (y baixo).
  for (const [x, z, yaw, aspect] of [[120, -100, Math.PI / 2, 0.5], [-120, 40, -Math.PI / 2, 16 / 9], [30, 215, 0, 16 / 9], [-30, -215, Math.PI, 0.5]]) {
    const { longest, tips, last } = fire(x, z, yaw, aspect);
    const label = `(${x}, ${z})`;
    assert.ok(longest < (aspect < 0.8 ? 80 : 110) - 5, `${label}: raio de ${longest} não encurtou`);
    assert.ok(longest >= 30);
    assert.ok(tips.every((tip) => Math.abs(tip.x) <= 188 + 1e-6 && Math.abs(tip.z) <= 285 + 1e-6), `${label}: ponta na arquibancada`);
    assert.ok(Math.abs(last.x) > 175 || Math.abs(last.z) > 270, `${label}: ponta parou cedo demais (${last.x}, ${last.z})`);
    assert.ok(last.y < 9, `${label}: ponta a ${last.y} do chão`);
  }
  // No meio do campo nada muda: comprimento todo.
  assert.ok(Math.abs(fire(0, 0, Math.PI / 2, 16 / 9).longest - 110) < 1e-9);
  assert.ok(Math.abs(fire(0, 0, 0, 0.5).longest - 80) < 1e-9);
});

// ------------------------------------------------------------------ enquadramento do raio

const { HALF_W, HALF_H, GOAL_HEIGHT } = loadTs("app/botao/three/stadium.ts");
const { FIELD } = loadTs("app/botao/engine.ts");

/**
 * Cópia da câmera da festa do Botao3DView (frameMoment, updateCamera com a partida
 * já em curso, fit e placeCamera, câmera lenta do gol) com Choreographer, PlayerFigure
 * e CelebrationFx de verdade; devolve o maior |ndc| da ponta do raio.
 */
function kameFraming({ aspect, baseYaw, side, scorerX, depth, reducedMotion = false }) {
  const camera = new THREE.PerspectiveCamera(aspect < 0.8 ? 32 : 28, aspect, 5, 5000);
  const fitPoints = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      fitPoints.push(new THREE.Vector3(sx * (HALF_W + 8), 0, sz * (HALF_H + FIELD.goalDepth + 6)));
      fitPoints.push(new THREE.Vector3(sx * HALF_W, FIGURE_HEIGHT * 0.8, sz * HALF_H));
    }
  }
  for (const sz of [-1, 1]) fitPoints.push(new THREE.Vector3(0, GOAL_HEIGHT, sz * HALF_H));
  let yaw = baseYaw;
  let pitch = 0.5;
  let focusZoom = 1;
  let focusZoomGoal = 1;
  let yawTarget = null;
  let pitchTarget = null;
  let fitDistance = 900;
  let showYawBase = null;
  const target = new THREE.Vector3();
  const targetGoal = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const place = (distance, at) => {
    const sinPitch = Math.sin(pitch);
    camera.position.set(Math.sin(yaw) * sinPitch * distance, Math.cos(pitch) * distance, Math.cos(yaw) * sinPitch * distance);
    if (at) camera.position.add(at);
    camera.up.set(0, 1, 0);
    camera.lookAt(at ?? new THREE.Vector3());
    camera.updateMatrixWorld();
  };
  const fit = () => {
    let distance = fitDistance;
    for (let iteration = 0; iteration < 6; iteration += 1) {
      place(distance);
      let extent = 0;
      for (const point of fitPoints) {
        projected.copy(point).project(camera);
        extent = Math.max(extent, Math.abs(projected.x), Math.abs(projected.y));
      }
      distance *= extent / 0.96;
    }
    fitDistance = distance;
    return distance;
  };
  const goalZ = side === "user" ? -HALF_H : HALF_H;
  const ids = ["s-0", "s-1", "s-2", "s-3", "s-4", "r-0", "r-1", "r-2", "r-3", "r-4"];
  const actorsList = ids.map((id, index) => ({
    id,
    side: index < 5 ? side : side === "user" ? "cpu" : "user",
    x: index === 0 ? scorerX : (index % 5) * 50 - 100,
    z: index === 0 ? goalZ - Math.sign(goalZ) * depth : Math.sign(goalZ) * (HALF_H - 60 - (index % 5) * 30) * (index < 5 ? 0.9 : 1.05),
    isUser: index === 0,
  }));
  const figures = new Map(ids.map((id, index) => [id, new PlayerFigure({ appearance: null, primary: "#c33", secondary: "#fff", number: 9, seed: 11 + index })]));
  const choreo = new Choreographer();
  choreo.startGoal({ side, scorerId: "s-0", ownGoalId: null, ball: { x: 0, z: goalZ }, actors: actorsList, cameraYaw: yaw, seed: 123, signature: "kamehameha", aspect });
  const nothing = () => {};
  const fx = new CelebrationFx(Object.fromEntries(FX_METHODS.map((name) => [name, nothing])), { lite: false, reducedMotion });
  let slowMo = reducedMotion ? -1 : 0;
  let worst = 0;
  let worstY = 0;
  let tipFrames = 0;
  for (let frame = 0; frame < 60 * 3.2; frame += 1) {
    let scale = 1;
    if (slowMo >= 0) {
      slowMo += DT;
      scale = slowMo < 0.22 ? 0.28 : Math.min(1, 0.28 + ((slowMo - 0.22) / 0.2) * 0.72);
      if (slowMo > 0.42) slowMo = -1;
    }
    const sceneDt = DT * scale;
    const directives = choreo.update(sceneDt, { x: 0, z: goalZ });
    for (const [id, directive] of directives) {
      const figure = figures.get(id);
      figure.root.position.set(directive.x, 0, directive.z);
      figure.update(sceneDt, directive.intent);
    }
    const shot = choreo.camera(aspect);
    const focus = figures.get(choreo.focus);
    const at = directives.get(choreo.focus);
    fx.update(sceneDt, { kind: choreo.kind, focus: { figure: focus, x: at.x, z: at.z, yaw: focus.yaw }, side, teamColor: "#c33", stadium: null, aspect });
    if (shot) {
      if (showYawBase === null) showYawBase = yaw;
      targetGoal.set(shot.x, 0, shot.z);
      focusZoomGoal = reducedMotion ? Math.min(1.7, shot.zoom) : shot.zoom;
      pitchTarget = shot.pitch;
      yawTarget = showYawBase + (reducedMotion ? 0 : shot.orbit);
    }
    const turn = 1 - Math.exp(-DT * 8);
    if (yawTarget !== null) yaw += character.angleDelta(yaw, yawTarget) * turn;
    if (pitchTarget !== null) pitch += (pitchTarget - pitch) * turn;
    const ease = 1 - Math.exp(-DT * 4.2);
    target.lerp(targetGoal, ease);
    focusZoom += (focusZoomGoal - focusZoom) * ease;
    place(fit() / focusZoom, target);
    const tip = fx.beamEnd();
    if (tip) {
      tipFrames += 1;
      projected.set(tip.x, tip.y, tip.z).project(camera);
      worst = Math.max(worst, Math.abs(projected.x));
      worstY = Math.max(worstY, Math.abs(projected.y));
    }
  }
  return { worst, worstY, tipFrames };
}

test("Kamehameha: a ponta do raio fica dentro do quadro (|ndc.x| < 0,9) em pé e no campo virado, dos dois lados", () => {
  // A mesa do 3D tem proporção fixa: 316/516 (celular, tablet, desktop) ou 516/316 ("Virar campo", yaw base π/2).
  const failures = [];
  let cases = 0;
  for (const [aspect, baseYaw] of [[316 / 516, 0], [516 / 316, Math.PI / 2]]) {
    for (const flip of [0, Math.PI]) {
      for (const side of ["user", "cpu"]) {
        for (const sx of [-1, 1]) {
          for (const xAbs of [25, 60, 130]) {
            for (const depth of [20, 120]) {
              const run = kameFraming({ aspect, baseYaw: baseYaw + flip, side, scorerX: sx * xAbs, depth });
              cases += 1;
              assert.ok(run.tipFrames > 30, "o raio não saiu");
              if (run.worst >= 0.9 || run.worstY >= 0.95) failures.push(`${aspect.toFixed(2)} ${flip ? "virado" : "anfitrião"} ${side} x=${sx * xAbs} fundo=${depth}: ${run.worst.toFixed(2)} / ${run.worstY.toFixed(2)}`);
            }
          }
        }
      }
    }
  }
  assert.equal(cases, 96);
  assert.deepEqual(failures, []);
  // Movimento reduzido (sem órbita) também.
  for (const sx of [-1, 1]) {
    for (const [aspect, baseYaw] of [[316 / 516, 0], [516 / 316, Math.PI / 2]]) {
      const run = kameFraming({ aspect, baseYaw, side: "user", scorerX: sx * 130, depth: 120, reducedMotion: true });
      assert.ok(run.worst < 0.9, `movimento reduzido ${aspect.toFixed(2)} x=${sx * 130}: ${run.worst.toFixed(2)}`);
    }
  }
});

test("CelebrationFx: stop() e troca de comemoração cortam tudo na hora", () => {
  const figure = makeFigure();
  const rec = recorder();
  const fx = new CelebrationFx(rec.effects, { lite: false, reducedMotion: false });
  fx.prepare();
  const ctx = (kind) => ({ kind, focus: { figure, x: 0, z: 0, yaw: 0 }, side: "user", teamColor: "#fff", stadium: null });
  for (let frame = 0; frame < 75; frame += 1) {
    figure.update(DT, idleIntent({ state: "celebrate", action: "kamehameha" }));
    fx.update(DT, ctx("kamehameha"));
  }
  assert.ok(fx.beamEnd(), "raio no ar");
  fx.stop();
  assert.equal(fx.beamEnd(), null);
  rec.calls.length = 0;
  for (let frame = 0; frame < 10; frame += 1) {
    figure.update(DT, idleIntent({ state: "celebrate", action: "kamehameha" }));
    const result = fx.update(DT, ctx(null));
    assert.deepEqual({ ...result }, { shake: 0, glow: 0, glowColor: null });
  }
  assert.equal(rec.calls.length, 0);
  assert.equal(fx.beamEnd(), null);
  fx.dispose();
});

test("CelebrationFx Super Saiyajin: aura dourada crescendo, explosão com onda, tremor e brilho", () => {
  const { frames } = playFx("superSaiyan", { seconds: 2.4 });
  const auras = callsOf(frames, "aura");
  assert.ok(Math.abs(auras[0].t - 0.3) <= DT + 1e-9);
  assert.ok(auras.every((call) => call.args[3] === SSJ_COLOR && Math.abs(call.args[2] - FIGURE_HEIGHT * 1.15) < 1e-9));
  assert.ok(auras[0].args[4] < auras.filter((call) => call.t < 0.9).at(-1).args[4], "força subindo");
  const burst = frames.find((frame) => frame.calls.some((call) => call.name === "shockwave"));
  assert.ok(Math.abs(burst.t - 0.9) <= DT + 1e-9);
  assert.deepEqual(burst.calls.find((call) => call.name === "shockwave").args, [0, 0, SSJ_COLOR, 45]);
  assert.ok(burst.result.shake >= 0.35 && burst.result.glow >= 0.8 && burst.result.glowColor === SSJ_COLOR);
  assert.ok(auras.filter((call) => call.t > 0.9).every((call) => call.args[4] >= 0.85));
  // A cabeça acende (headAnchor acompanha o agachamento e o pulinho).
  const heads = callsOf(frames, "orb");
  assert.equal(heads.length, auras.length);
  assert.ok(heads.every((call) => call.args[4] === "#ffb52e" && call.args[1] > FIGURE_HEIGHT * 0.7 && call.args[1] < FIGURE_HEIGHT * 1.6), "brilho fora da cabeça");
});

test("CelebrationFx meditação: luz macia por baixo e brilhos lentos a cada 0,5 s (nenhum no modo desempenho)", () => {
  const { frames } = playFx("meditate", { seconds: 3 });
  const orbs = callsOf(frames, "orb");
  assert.ok(Math.abs(orbs[0].t - 0.8) <= DT + 1e-9);
  assert.ok(orbs.every((call) => call.args[1] === 4 && call.args[4] === "#cfe8ff" && call.args[5] <= 0.35 + 1e-9));
  const sparkles = callsOf(frames, "sparkle");
  assert.ok(sparkles.length >= 4 && sparkles.every((call) => call.args[4] === 6));
  for (let index = 1; index < sparkles.length; index += 1) assert.ok(Math.abs(sparkles[index].t - sparkles[index - 1].t - 0.5) <= 2 * DT);
  const lite = playFx("meditate", { seconds: 3, options: { lite: true } });
  assert.equal(callsOf(lite.frames, "sparkle").length, 0);
  assert.ok(callsOf(lite.frames, "orb").length > 0);
});

test("CelebrationFx \"não tô ouvindo\": a torcida do time grita na marca", () => {
  const reactions = [];
  const stadium = { crowdReact: (...args) => reactions.push(args) };
  playFx("cupEar", { seconds: 0.5, stadium, side: "cpu" });
  assert.deepEqual(reactions, [["cheer", "cpu", null]]);
  reactions.length = 0;
  playFx("cupEar", { seconds: 0.5, stadium, side: null });
  assert.equal(reactions.length, 0);
});

test("CelebrationFx pistoleiro: um estalo por tiro, mão boa primeiro", () => {
  for (const seed of [figureSeedRight, 7]) {
    const { frames, figure } = playFx("fingerGuns", { seconds: 1.2, seed });
    const bangs = callsOf(frames, "impact");
    assert.equal(bangs.length, 2);
    assert.ok(Math.abs(bangs[0].t - 0.35) <= DT + 1e-9 && Math.abs(bangs[1].t - 0.78) <= DT + 1e-9);
    assert.ok(bangs.every((call) => call.args[3] === 0.25 && call.args[4] === "#ffe08a"));
    // +x do boneco é a esquerda dele: o destro atira primeiro do lado -x.
    assert.equal(Math.sign(bangs[0].args[0]), -figure.handedness, `seed ${seed}`);
    assert.equal(Math.sign(bangs[1].args[0]), figure.handedness);
  }
});

// ------------------------------------------------------------------ sons

function fakeAudio() {
  const log = { nodes: 0, ends: [], starts: [], errors: [] };
  const param = (initial) => {
    let last = -Infinity;
    const check = (value, time, kind) => {
      if (!Number.isFinite(value) || !Number.isFinite(time)) log.errors.push(`${kind}: não finito (${value}, ${time})`);
      if (time < last - 1e-9) log.errors.push(`${kind}: volta no tempo`);
      last = Math.max(last, time);
    };
    return {
      value: initial,
      setValueAtTime: (value, time) => check(value, time, "set"),
      exponentialRampToValueAtTime: (value, time) => {
        check(value, time, "exp");
        if (!(Math.abs(value) > 1.4e-45)) log.errors.push(`rampa exponencial até ${value}`);
      },
      linearRampToValueAtTime: (value, time) => check(value, time, "lin"),
    };
  };
  const node = (extra) => {
    log.nodes += 1;
    return { connect() {}, ...extra };
  };
  class FakeContext {
    currentTime = 0;
    sampleRate = 48000;
    state = "running";
    destination = {};
    createGain() {
      return node({ gain: param(1) });
    }
    createOscillator() {
      return node({ type: "sine", frequency: param(440), start: (time) => log.starts.push(time), stop: (time) => log.ends.push(time) });
    }
    createBiquadFilter() {
      return node({ type: "lowpass", frequency: param(350), Q: param(1) });
    }
    createBuffer(channels, frames, rate) {
      return { sampleRate: rate, duration: frames / rate, getChannelData: () => new Float32Array(frames) };
    }
    createBufferSource() {
      const source = node({
        buffer: null,
        loop: false,
        start: (time, offset = 0) => {
          log.starts.push(time);
          if (!(offset >= 0) || offset >= source.buffer.duration) log.errors.push(`início fora do buffer (${offset})`);
        },
        stop: (time) => log.ends.push(time),
      });
      return source;
    }
    resume() {
      return Promise.resolve();
    }
  }
  return { FakeContext, log };
}

test("sons novos: rampas válidas, durações certas, mudo não toca", () => {
  const { FakeContext, log } = fakeAudio();
  const hadWindow = "window" in globalThis;
  globalThis.window ??= {};
  globalThis.window.AudioContext = FakeContext;
  try {
    const play = (name, intensity) => {
      log.nodes = 0;
      log.ends.length = 0;
      log.starts.length = 0;
      log.errors.length = 0;
      signatureAudio.playSignatureSound(name, intensity);
      assert.deepEqual(log.errors, [], `${name} (${intensity})`);
      return { nodes: log.nodes, end: Math.max(...log.ends), starts: [...log.starts] };
    };
    const limits = { kameCharge: [0.8, 1], kameBeam: [0.9, 1.1], aura: [0.6, 0.8], bang: [0.08, 0.15], drumroll: [1.6, 2], tick: [0.03, 0.07] };
    for (const [name, [min, max]] of Object.entries(limits)) {
      for (const intensity of [0.35, 0, 1, -2, Number.NaN, 5]) {
        const sound = play(name, intensity);
        if (name === "drumroll" && !(intensity > 0)) {
          assert.equal(sound.nodes, 0, "rufar sem volume não toca");
          continue;
        }
        assert.ok(sound.nodes > 0, name);
        assert.ok(sound.end >= min && sound.end <= max, `${name}: termina em ${sound.end}`);
      }
    }
    // O rufar acaba num acento em 1,6 s (a hora da batida).
    const roll = play("drumroll", 0.35);
    assert.ok(roll.starts.some((at) => Math.abs(at - 1.6) < 1e-9));
    audio.setBotaoMuted(true);
    for (const name of Object.keys(limits)) assert.equal(play(name, 0.5).nodes, 0, `${name} tocou no mudo`);
    audio.setBotaoMuted(false);
  } finally {
    if (hadWindow) delete globalThis.window.AudioContext;
    else delete globalThis.window;
  }
});

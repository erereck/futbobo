// Camada de rede do Bobonline (B2): sessão sobre o transporte em memória com relógio virtual,
// identidade, códigos, net.json, escada de ciclo de vida, trava de aba (DESIGN §3, §11.1) e o ts-loader.
// Sem rede e sem timers de verdade: tudo anda por `hub.advance(ms)`.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

const storage = stubBrowser();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const protocol = loadTs("app/bobonline/protocol.ts");
const { T } = protocol;
const { createMemoryHub } = loadTs("app/bobonline/net/memory-transport.ts");
const { BobSession, splitChunkParts, utf8Bytes, localHelloInfo, RELAY_SILENT_MS } = loadTs("app/bobonline/net/session.ts");
const identityMod = loadTs("app/bobonline/net/identity.ts");
const { createIdentity, playerIdFor, verifySig } = identityMod;
const codes = loadTs("app/bobonline/net/codes.ts");
const netConfig = loadTs("app/bobonline/net/net-config.ts");
const { peekBobonlineSession, SAVED_SESSION_TTL_MS } = loadTs("app/bobonline/net/session-peek.ts");
const { BobLifecycle, reloadSafe } = loadTs("app/bobonline/net/lifecycle.ts");
const { acquireTabLock } = loadTs("app/bobonline/net/tab-lock.ts");
const { BOTAO_ENGINE_REV } = loadTs("app/botao/match-codec.ts");
const { CELEBRATION_OPTIONS } = loadTs("app/player-appearance.ts");

const CODE = "K7MPX3";
const HELLO = localHelloInfo();
const encoder = new TextEncoder();
const bytes = (text) => encoder.encode(text).length;

let incCounter = 100;
const identities = [];
for (let index = 0; index < 8; index += 1) identities.push(await createIdentity());

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

function node(hub, name, identity, options = {}) {
  const transport = hub.transport(name);
  const session = new BobSession({ identity, transport, hello: options.hello ?? HELLO, incarnation: options.inc ?? ++incCounter, now: options.now });
  const peer = { name, identity, session, transport, got: [], health: [], links: [], incompatible: [], superseded: 0, joinErrors: [] };
  session.onMessage = (from, kind, body) => peer.got.push({ from, kind, body });
  session.onHealth = (playerId, health) => peer.health.push({ playerId, health, at: hub.now() });
  session.onLink = (playerId, reason) => peer.links.push({ playerId, reason });
  session.onIncompatible = (playerId, info) => peer.incompatible.push({ playerId, info });
  session.onSuperseded = () => (peer.superseded += 1);
  session.onJoinError = (info) => peer.joinErrors.push(info);
  return peer;
}

/** Sala com N aparelhos ligados, roster montado em todos. */
async function room(names, { seed = 7, hub = createMemoryHub({ seed }), connectMs = 3000, roster = true } = {}) {
  const peers = {};
  names.forEach((name, index) => (peers[name] = node(hub, name, identities[index])));
  if (roster) {
    const members = names.map((name) => ({ playerId: peers[name].identity.playerId, pub: peers[name].identity.pub }));
    for (const name of names) peers[name].session.setRoster(members);
  }
  for (const name of names) peers[name].session.connect(CODE);
  await hub.advance(connectMs);
  return { hub, peers };
}

const idOf = (peer) => peer.identity.playerId;

async function waitFor(hub, predicate, maxMs, stepMs = 100) {
  const start = hub.now();
  while (!predicate()) {
    if (hub.now() - start >= maxMs) return null;
    await hub.advance(stepMs);
  }
  return hub.now() - start;
}

/** Transporte falso: o teste injeta quadros crus e lê o que a sessão mandou. */
class FakeTransport {
  kind = "memory";
  maxFrameBytes = T.MAX_FRAME_BYTES;
  onData = null;
  onPeerJoin = null;
  onPeerLeave = null;
  onJoinError = null;
  sent = [];
  linked = new Set();
  up = true;
  constructor(clock, id = "S") {
    this.clock = clock;
    this.id = id;
  }
  selfId() { return this.id; }
  open() {}
  async close() {}
  send(peer, data) { this.sent.push({ peer, data, frame: JSON.parse(data) }); }
  peers() { return [...this.linked]; }
  pauseSignaling() {}
  resumeSignaling() {}
  signalingUp() { return this.up; }
  async linkInfo() { return { candidate: "host", rttMs: null }; }
  join(peer) { this.linked.add(peer); this.onPeerJoin?.(peer); }
  leave(peer) { this.linked.delete(peer); this.onPeerLeave?.(peer); }
  deliver(peer, frame) { this.onData?.(peer, typeof frame === "string" ? frame : JSON.stringify(frame)); }
  to(peer, kind) { return this.sent.filter((entry) => entry.peer === peer && (!kind || entry.frame.k === kind)); }
}

/** Sessão real + transporte falso, para falar o protocolo do fio à mão. */
async function rawRig() {
  const hub = createMemoryHub();
  const fake = new FakeTransport(hub.clock);
  const self = await createIdentity();
  const session = new BobSession({ identity: self, transport: fake, hello: HELLO, incarnation: 50 });
  const rig = { hub, fake, session, self, got: [], links: [], incompatible: [], superseded: 0 };
  session.onMessage = (from, kind, body) => rig.got.push({ from, kind, body });
  session.onLink = (playerId, reason) => rig.links.push({ playerId, reason });
  session.onIncompatible = (playerId, info) => rig.incompatible.push({ playerId, info });
  session.onSuperseded = () => (rig.superseded += 1);
  session.connect(CODE);
  return rig;
}

/** Um par cru: hello assinado de verdade, quadros montados à mão. */
async function rawPeer(rig, { tp = "R1", inc = 7, identity, info = HELLO, sign = true } = {}) {
  identity ??= await createIdentity();
  rig.fake.join(tp);
  const text = `bobonline|hello|${CODE}|${identity.playerId}|${inc}|${rig.fake.selfId()}|${tp}`;
  const sig = sign ? await identity.sign(text) : "x";
  rig.fake.deliver(tp, { p: 1, k: "hello", f: identity.playerId, i: inc, ri: rig.session.incarnation, s: 0, a: 0, t: 0,
    b: { info, playerId: identity.playerId, inc, pub: identity.pub, sig } });
  await rig.hub.advance(0);
  const frame = (k, s, b, extra = {}) => ({ p: 1, k, f: identity.playerId, i: inc, ri: rig.session.incarnation, s, a: 0, t: rig.hub.now(), b, ...extra });
  return { identity, tp, inc, frame, send: (k, s, b, extra) => rig.fake.deliver(tp, frame(k, s, b, extra)) };
}

const lastAck = (rig, tp) => {
  const frames = rig.fake.to(tp).filter((entry) => entry.frame.ri !== 0);
  return frames.length ? frames[frames.length - 1].frame.a : null;
};

// ---------------------------------------------------------------------------
// Entrega confiável
// ---------------------------------------------------------------------------

describe("entrega confiável", () => {
  test("em ordem com 0–300 ms de latência, jitter e 5% de perda (os dois sentidos)", async () => {
    const { hub, peers } = await room(["A", "B"], { seed: 11 });
    const { A, B } = peers;
    hub.setLatency("A", "B", 150, 150);
    hub.setLoss("A", "B", 0.05);
    const total = 300;
    for (let index = 0; index < total; index += 1) {
      A.session.send(idOf(B), "x", { n: index, pad: "é".repeat(index % 40) });
      B.session.send(idOf(A), "y", { n: index });
      if (index % 10 === 9) await hub.advance(100);
    }
    const took = await waitFor(hub, () => B.got.filter((m) => m.kind === "x").length === total
      && A.got.filter((m) => m.kind === "y").length === total, 60_000);
    assert.notEqual(took, null, "tudo entregue");
    assert.deepEqual(B.got.filter((m) => m.kind === "x").map((m) => m.body.n), [...Array(total).keys()]);
    assert.deepEqual(A.got.filter((m) => m.kind === "y").map((m) => m.body.n), [...Array(total).keys()]);
    await waitFor(hub, () => A.session.pending(idOf(B)) === 0 && B.session.pending(idOf(A)) === 0, 20_000);
    assert.equal(A.session.pending(idOf(B)), 0, "outbox de A zerou (acks)");
    assert.equal(B.session.pending(idOf(A)), 0);
    assert.equal(hub.oversize(), 0);
  });

  test("ackloss.cjs: s=5 se perde no link direto que morre, s=6 vai pelo relay; 5 ainda chega, em ordem", async () => {
    const { hub, peers } = await room(["A", "X", "R"], { seed: 3 });
    const { A, X } = peers;
    for (let n = 1; n <= 4; n += 1) A.session.send(idOf(X), "m", { n });
    await hub.advance(500);
    assert.deepEqual(X.got.map((m) => m.body.n), [1, 2, 3, 4]);
    assert.equal(A.session.pending(idOf(X)), 0);
    // O link direto morre com o s=5 dentro.
    hub.partition("A", "X", true);
    A.session.send(idOf(X), "m", { n: 5 });
    // Depois de RELAY_AFTER_MS sem ouvir X direto, o tráfego novo vai por R (fwd).
    await hub.advance(T.RELAY_AFTER_MS + 300);
    A.session.send(idOf(X), "m", { n: 6 });
    await hub.advance(100);
    // O 6 chegou pelo relay antes do reenvio do 5: fica no buffer e o ack contíguo NÃO pula o buraco.
    assert.deepEqual(X.got.map((m) => m.body.n), [1, 2, 3, 4], "6 não é entregue antes do 5");
    assert.equal(A.session.pending(idOf(X)), 2, "5 e 6 continuam sem ack (ack contíguo = 4)");
    const took = await waitFor(hub, () => X.got.length === 6, 15_000);
    assert.notEqual(took, null, "o reenvio traz o 5 pelo caminho atual (relay)");
    assert.deepEqual(X.got.map((m) => m.body.n), [1, 2, 3, 4, 5, 6]);
    await waitFor(hub, () => A.session.pending(idOf(X)) === 0, 5000);
    assert.equal(A.session.pending(idOf(X)), 0);
    assert.equal(A.session.direct(idOf(X)), false);
    assert.equal(A.session.health(idOf(X)), "ok", "heartbeats repassados mantêm ok");
  });

  test("ack contíguo, duplicados, janela de reordenação e ri de outra incarnation", async () => {
    const rig = await rawRig();
    const peer = await rawPeer(rig);
    assert.deepEqual(rig.links, [{ playerId: peer.identity.playerId, reason: "new" }]);
    for (const s of [1, 2, 4, 5]) peer.send("x", s, { s });
    await rig.hub.advance(100);
    assert.deepEqual(rig.got.map((m) => m.body.s), [1, 2]);
    assert.equal(lastAck(rig, peer.tp), 2, "ack contíguo para em 2 com o 3 faltando");
    peer.send("x", 3, { s: 3 });
    await rig.hub.advance(100);
    assert.deepEqual(rig.got.map((m) => m.body.s), [1, 2, 3, 4, 5]);
    assert.equal(lastAck(rig, peer.tp), 5);
    // Duplicado: não entrega de novo, mas confirma de novo.
    const before = rig.fake.to(peer.tp).length;
    peer.send("x", 2, { s: 2 });
    await rig.hub.advance(100);
    assert.equal(rig.got.length, 5);
    assert.ok(rig.fake.to(peer.tp).length > before, "re-ack do duplicado");
    // Janela: next = 6; 7..69 entram no buffer (6 + 64 = 70 fica fora).
    for (let s = 7; s <= 70; s += 1) peer.send("x", s, { s });
    peer.send("x", 6, { s: 6 });
    await rig.hub.advance(100);
    assert.equal(rig.got.at(-1).body.s, 69, "entregou 6..69, o 70 caiu fora da janela");
    assert.equal(lastAck(rig, peer.tp), 69);
    peer.send("x", 70, { s: 70 });
    await rig.hub.advance(100);
    assert.equal(rig.got.at(-1).body.s, 70, "o reenvio do 70 entra");
    // ri de uma incarnation minha anterior: era para a página velha.
    rig.fake.deliver(peer.tp, peer.frame("x", 71, { s: 71 }, { ri: rig.session.incarnation - 1 }));
    await rig.hub.advance(100);
    assert.equal(rig.got.at(-1).body.s, 70, "ri velho descartado");
    assert.deepEqual(rig.got.map((m) => m.body.s), [...Array(70).keys()].map((n) => n + 1));
  });

  test("par recarrega: seq recomeça em 1 por incarnation, quadros da página velha caem", async () => {
    const rig = await rawRig();
    const peer = await rawPeer(rig, { inc: 7 });
    peer.send("x", 1, { v: "velho-1" });
    await rig.hub.advance(50);
    rig.session.send(peer.identity.playerId, "out", { n: 1 });
    rig.session.send(peer.identity.playerId, "out", { n: 2 });
    const oldOut = rig.fake.to(peer.tp, "out").map((e) => e.frame);
    assert.deepEqual(oldOut.map((f) => [f.s, f.ri]), [[1, 7], [2, 7]]);
    // Recarregou: id de transporte novo, incarnation maior.
    const reloaded = await rawPeer(rig, { tp: "R2", inc: 8, identity: peer.identity });
    assert.deepEqual(rig.links.at(-1), { playerId: peer.identity.playerId, reason: "restarted" });
    assert.equal(rig.session.pending(peer.identity.playerId), 0, "outbox da incarnation velha descartado");
    reloaded.send("x", 1, { v: "novo-1" });
    reloaded.send("x", 2, { v: "novo-2" });
    peer.send("x", 2, { v: "velho-2" }); // da aba velha ainda aberta: cai
    await rig.hub.advance(50);
    assert.deepEqual(rig.got.map((m) => m.body.v), ["velho-1", "novo-1", "novo-2"]);
    rig.session.send(peer.identity.playerId, "out", { n: 3 });
    const fresh = rig.fake.to("R2", "out").map((e) => e.frame);
    assert.deepEqual(fresh.map((f) => [f.s, f.ri]), [[1, 8]], "meu seq para a incarnation nova começa em 1");
  });

  test("rst depois de estourar o outbox (os dois lados)", async () => {
    const rig = await rawRig();
    const peer = await rawPeer(rig);
    const target = peer.identity.playerId;
    for (let n = 1; n <= T.OUTBOX_CAP; n += 1) rig.session.send(target, "o", { n });
    assert.equal(rig.session.pending(target), T.OUTBOX_CAP);
    assert.equal(rig.links.filter((l) => l.reason === "overflow").length, 0);
    rig.session.send(target, "o", { n: T.OUTBOX_CAP + 1 });
    assert.deepEqual(rig.links.at(-1), { playerId: target, reason: "overflow" });
    assert.equal(rig.session.pending(target), 1);
    await rig.hub.advance(1100);
    const rst = rig.fake.to(peer.tp, "rst");
    assert.ok(rst.length >= 1, "rst vai junto do heartbeat");
    assert.equal(rst.at(-1).frame.b.s, T.OUTBOX_CAP + 1);
    // Ele confirma tudo até s-1: o rst para de sair.
    peer.send("ack", 0, {}, { a: T.OUTBOX_CAP + 1 });
    await rig.hub.advance(50);
    const count = rig.fake.to(peer.tp, "rst").length;
    await rig.hub.advance(3000);
    assert.equal(rig.fake.to(peer.tp, "rst").length, count, "rst confirmado não sai mais");
    assert.equal(rig.session.pending(target), 0);
    // Recebendo um rst: next pula, buffer zera, onLink("overflow") local.
    peer.send("x", 1, { s: 1 });
    peer.send("x", 30, { s: 30 });
    await rig.hub.advance(50);
    peer.send("rst", 0, { s: 40 });
    await rig.hub.advance(50);
    assert.deepEqual(rig.links.at(-1), { playerId: target, reason: "overflow" });
    peer.send("x", 40, { s: 40 });
    await rig.hub.advance(50);
    assert.deepEqual(rig.got.map((m) => m.body.s), [1, 40], "o 30 do buffer velho não aparece");
  });

  test("rst ponta a ponta: partição longa estoura o outbox, a volta religa com onLink(overflow)", async () => {
    const { hub, peers } = await room(["A", "B"], { seed: 5 });
    const { A, B } = peers;
    hub.partition("A", "B", true);
    for (let n = 1; n <= T.OUTBOX_CAP + 40; n += 1) A.session.send(idOf(B), "o", { n });
    assert.ok(A.links.some((l) => l.reason === "overflow"));
    await hub.advance(2000);
    hub.partition("A", "B", false);
    const took = await waitFor(hub, () => B.links.some((l) => l.reason === "overflow") && B.got.length >= 40, 20_000);
    assert.notEqual(took, null);
    const got = B.got.map((m) => m.body.n);
    assert.deepEqual(got, got.slice().sort((a, b) => a - b), "em ordem");
    assert.equal(got.at(-1), T.OUTBOX_CAP + 40);
    assert.ok(got[0] > T.OUTBOX_CAP, "só o que veio depois do rst");
  });
});

// ---------------------------------------------------------------------------
// Pedaços (chunk) e tamanho de quadro
// ---------------------------------------------------------------------------

function matchStateFixture() {
  // Port do sizes.cjs: um estado real do motor no meio da partida (o m:rest viaja inteiro).
  const engine = loadTs("app/botao/engine.ts");
  const types = loadTs("app/botao/types.ts");
  const { createRng } = loadTs("app/botao/rng.ts");
  const cpu = loadTs("app/botao/cpu.ts");
  const team = (id, name, abbr) => ({ id, name, shortName: name.split(" ")[0], abbr, primary: "#0b6b45", secondary: "#f4c542", strength: 76 });
  const state = engine.createMatch({
    matchId: "K7MPX3-r1m0-0", seed: 42, competitionName: "Bobonline", stageName: "X1", neutralVenue: true, userIsHost: true,
    player: { name: "-", number: 99, position: "MC", overall: 76 },
    userTeam: team("bob-a", "Grêmio São João", "GSJ"), cpuTeam: team("bob-b", "Botão de Ouro EC", "BOE"),
    difficulty: 3, rules: { ...types.DEFAULT_BOTAO_RULES }, localControl: true,
  });
  const brain = createRng(7);
  let largest = "";
  for (let turn = 0; turn < 40; turn += 1) {
    if (state.phase === "aim" || state.phase === "kickoff") {
      engine.advanceClock(state, 2.4);
      if (state.phase !== "aim" && state.phase !== "kickoff") continue;
      const shot = cpu.chooseCpuShot(state, 1, brain, state.turn);
      if (!shot || !engine.beginShot(state, shot)) engine.skipTurn(state);
      for (let step = 0; step < 4000 && state.phase === "resolving"; step += 1) engine.stepMatch(state, 1 / 120);
    } else if (state.phase === "goal") engine.resumeAfterGoal(state);
    else if (state.phase === "interval") engine.startNextPeriod(state);
    else break;
    const { rng, setup, ...rest } = state;
    void setup;
    const body = JSON.stringify({ matchId: "K7MPX3-r1m0-0", n: turn, h: "deadbeef", match: { ...rest, codec: 1, rngCursor: rng.cursor() }, pres: null });
    if (body.length > largest.length) largest = body;
  }
  return JSON.parse(largest);
}

const APPEARANCE = { skin: 1, hair: 2, hairColor: 3, beard: 0, eyes: 1, brows: 2, mouth: 1, nose: 0, ears: 1, accessory: 0, boots: 2, celebration: 13, kitPattern: 3, height: 1, build: 2 };

/** Port do sizes.cjs: 8 times (≈ 11 mil caracteres) com acento ou emoji. */
function teamsFixture(emoji = false) {
  const team = {
    version: 1, id: "bob-AAAAAAAAAA", name: emoji ? "⚽".repeat(24) : "Associação Atlética São Bento", shortName: "São Bento", abbr: "AASB",
    primary: "#0b6b45", secondary: "#f4c542", kitPattern: 3, crest: 1,
    players: Array.from({ length: 5 }, (_, i) => ({ id: "p" + i, name: emoji ? "🔥".repeat(9) : "João Antônio Ébano", number: i + 1, appearance: { ...APPEARANCE } })),
    createdAt: 1, updatedAt: 2,
  };
  const teams = {};
  for (let i = 0; i < 8; i += 1) teams["h" + i] = { ...team, id: "bob-" + i };
  return { snapshot: {}, teams };
}

/** room:welcome de um torneio de 8 no limite: snapshot com 8 membros (pub de 87 caracteres) e 8 times com nomes longos. */
function welcomeFixture() {
  const members = Array.from({ length: 8 }, (_, i) => ({
    playerId: "abcdefghj" + i, pub: "B" + "x".repeat(86), nickname: "Zé \"Canhão\" " + i, teamHash: "h" + i, joinOrder: i,
    role: "player", ready: true, presence: "online", left: false,
  }));
  const snapshot = {
    v: 1, code: CODE, epoch: 0, version: 12, hostId: members[0].playerId, hostNow: 1_761_800_000_000, seed: 123456789,
    settings: { format: "t8", rules: "classic", cpuLevel: 3, fillWithCpu: true, allowSpectators: true, locked: false },
    passwordProof: "f".repeat(64), members, nextJoinOrder: 8, banned: [], stage: "lobby", bracket: null, series: null, rematch: null, createdAt: 1_761_800_000_000,
  };
  const teams = {};
  for (let i = 0; i < 8; i += 1) {
    teams["h" + i] = {
      version: 1, id: "bob-ÁÉÍÓÚçãõ" + i, name: "Grêmio Recreativo Ação " + i, shortName: "Ação Ébano " + i, abbr: "GRA" + i,
      primary: "#0b6b45", secondary: "#f4c542", kitPattern: 11, crest: 3,
      players: Array.from({ length: 5 }, (_, p) => ({ id: "p" + p, name: "Antônio Conceição" + p, number: 10 + p, appearance: { ...APPEARANCE } })),
      createdAt: 1_761_800_000_000, updatedAt: 1_761_800_000_000,
    };
  }
  return { snapshot, teams };
}

function bigBody(chars, seed) {
  const words = ["ação", "pênalti", "\"aspas\"", "barra\\invertida", "🔥", "⚽", "linha\nnova", "çãõéíú", "ok", " "];
  let text = "";
  let state = seed;
  while (text.length < chars) {
    state = (state * 1103515245 + 12345) >>> 0;
    text += words[state % words.length] + " ";
  }
  return { text: text.slice(0, chars), list: Array.from({ length: 50 }, (_, i) => ({ i, s: "\"" + "é".repeat(i) })) };
}

describe("pedaços e tamanho de quadro", () => {
  test("splitChunkParts: partes ≤ 6.000 bytes, juntas = original, sem partir par substituto, escape duplo cabe", () => {
    const samples = [
      JSON.stringify(bigBody(200_000, 1)),
      JSON.stringify({ q: "\"".repeat(30_000) }),
      JSON.stringify({ e: "😀".repeat(20_000) }),
      JSON.stringify(teamsFixture(true)),
    ];
    for (const json of samples) {
      const parts = splitChunkParts(json);
      assert.equal(parts.join(""), json);
      for (const part of parts) {
        assert.ok(bytes(part) <= T.CHUNK_PART_BYTES, `parte com ${bytes(part)} bytes`);
        const last = part.charCodeAt(part.length - 1);
        assert.ok(!(last >= 0xd800 && last <= 0xdbff), "não termina num surrogate alto");
        // JSON.stringify duas vezes soma 6 bytes de aspas (" de dentro escapadas + " de fora) ao conteúdo.
        assert.ok(bytes(JSON.stringify(JSON.stringify(part))) - 6 <= T.MAX_FRAME_BYTES - 1000, "parte escapada duas vezes cabe num fwd");
      }
    }
    assert.equal(utf8Bytes("ação 🔥 "), bytes("ação 🔥 "));
  });

  test("40 KB e 200 KB com acento e emoji, direto e pelo relay; todo quadro ≤ 16.000 bytes", async () => {
    const { hub, peers } = await room(["A", "B", "C"], { seed: 9 });
    const { A, B } = peers;
    let largest = 0;
    let frames = 0;
    hub.onFrame = (from, to, data) => {
      frames += 1;
      largest = Math.max(largest, bytes(data));
    };
    const body40 = bigBody(40_000, 2);
    const body200 = bigBody(200_000, 3);
    A.session.send(idOf(B), "big", body40);
    A.session.send(idOf(B), "big", body200);
    await waitFor(hub, () => B.got.length === 2, 10_000);
    assert.deepEqual(B.got.map((m) => m.body), [body40, body200]);
    // Agora sem link direto: tudo passa por C (quadro interno assinado, escapado dentro do fwd).
    hub.partition("A", "B", true);
    await hub.advance(T.RELAY_AFTER_MS + 1500);
    const relayBody = bigBody(200_000, 4);
    A.session.send(idOf(B), "big", relayBody);
    const took = await waitFor(hub, () => B.got.length === 3, 60_000, 250);
    assert.notEqual(took, null, "200 KB chegam pelo relay (teto de 64 KB/s por par)");
    assert.deepEqual(B.got[2].body, relayBody);
    assert.ok(frames > 100);
    assert.ok(largest <= T.MAX_FRAME_BYTES, `maior quadro: ${largest} bytes`);
    assert.equal(hub.oversize(), 0);
  });

  test("quadros do sizes.cjs: m:rest real e 8 times cabem inteiros; room:welcome de t8 vira pedaços; tudo ≤ 16.000", async () => {
    const { hub, peers } = await room(["A", "B", "C"], { seed: 13 });
    const { A, B } = peers;
    const sizes = [];
    hub.onFrame = (from, to, data) => sizes.push({ from, kind: JSON.parse(data).k, bytes: bytes(data) });
    const rest = matchStateFixture();
    const restChars = JSON.stringify(rest).length;
    assert.ok(restChars > 4000 && restChars < 14_000, `m:rest com ${restChars} caracteres`);
    A.session.send(idOf(B), "m:rest", rest);
    await waitFor(hub, () => B.got.length === 1, 2000);
    assert.deepEqual(B.got[0].body, rest);
    assert.ok(sizes.some((s) => s.kind === "m:rest"), "m:rest foi um quadro só");
    assert.ok(!sizes.some((s) => s.kind === "chunk"));
    // sizes.cjs: 8 times ≈ 11 mil caracteres (13 mil bytes escapados) ainda cabem num quadro, direto ou repassado.
    const teams = teamsFixture(false);
    const emoji = teamsFixture(true);
    const teamsChars = JSON.stringify(teams).length;
    assert.ok(teamsChars > 10_000 && teamsChars < 12_000, `times com ${teamsChars} caracteres`);
    A.session.send(idOf(B), "room:teams", teams);
    A.session.send(idOf(B), "room:teams", emoji);
    await waitFor(hub, () => B.got.length === 3, 3000);
    assert.deepEqual(B.got[1].body, teams);
    assert.deepEqual(B.got[2].body, emoji);
    assert.ok(!sizes.some((s) => s.kind === "chunk"), "8 times do sizes.cjs: um quadro cada");
    // room:welcome de t8 no limite: maior que um quadro, vai em pedaços (direto e pelo relay).
    const welcome = welcomeFixture();
    assert.ok(JSON.stringify(welcome).length > 12_000);
    assert.ok(bytes(JSON.stringify(JSON.stringify(welcome))) > T.MAX_FRAME_BYTES, "escapado (dentro de um fwd) não caberia");
    A.session.send(idOf(B), "room:welcome", welcome);
    await waitFor(hub, () => B.got.length === 4, 3000);
    assert.deepEqual(B.got[3].body, welcome);
    const directChunks = sizes.filter((s) => s.kind === "chunk").length;
    assert.ok(directChunks >= 2, `${directChunks} pedaços`);
    hub.partition("A", "B", true);
    await hub.advance(T.RELAY_AFTER_MS + 1500);
    A.session.send(idOf(B), "room:welcome", welcome);
    A.session.send(idOf(B), "room:teams", emoji);
    await waitFor(hub, () => B.got.length === 6, 10_000, 250);
    assert.deepEqual(B.got[4].body, welcome);
    assert.deepEqual(B.got[5].body, emoji);
    assert.ok(sizes.some((s) => s.kind === "fwd" && s.bytes > 12_000), "um fwd grande passou pelo C");
    assert.ok(Math.max(...sizes.map((s) => s.bytes)) <= T.MAX_FRAME_BYTES, `maior quadro: ${Math.max(...sizes.map((s) => s.bytes))}`);
    assert.equal(hub.oversize(), 0);
  });

  test("mensagem acima de MAX_MESSAGE_CHARS e quadro lossy grande demais lançam em dev; tipos de sessão são reservados", async () => {
    const { peers } = await room(["A", "B"]);
    const { A, B } = peers;
    assert.throws(() => A.session.send(idOf(B), "big", { s: "x".repeat(T.MAX_MESSAGE_CHARS) }), /grande demais/);
    assert.throws(() => A.session.sendLossy(idOf(B), "live", { s: "x".repeat(20_000) }), /grande demais/);
    assert.throws(() => A.session.send(idOf(B), "hb", {}), /reservado/);
  });
});

// ---------------------------------------------------------------------------
// Identidade, hello e autenticação
// ---------------------------------------------------------------------------

describe("hello assinado e autenticação", () => {
  test("f forjado num link direto é descartado; hello com assinatura errada não vincula", async () => {
    const rig = await rawRig();
    const peer = await rawPeer(rig);
    const other = await createIdentity();
    rig.fake.deliver(peer.tp, peer.frame("x", 1, { who: "forjado" }, { f: other.playerId }));
    rig.fake.deliver(peer.tp, peer.frame("x", 1, { who: "inc errado" }, { i: peer.inc + 5 }));
    await rig.hub.advance(50);
    assert.equal(rig.got.length, 0);
    peer.send("x", 1, { who: "certo" });
    await rig.hub.advance(50);
    assert.deepEqual(rig.got.map((m) => m.body.who), ["certo"]);
    // Hello mal assinado (ou assinado para outro par de ids de transporte): nunca vincula.
    const liar = await rawPeer(rig, { tp: "R9", sign: false });
    liar.send("x", 1, { who: "mentiroso" });
    await rig.hub.advance(50);
    assert.equal(rig.links.length, 1);
    assert.deepEqual(rig.got.map((m) => m.body.who), ["certo"]);
    const replay = await createIdentity();
    rig.fake.join("R8");
    const sig = await replay.sign(`bobonline|hello|${CODE}|${replay.playerId}|3|OUTRO|R8`);
    rig.fake.deliver("R8", { p: 1, k: "hello", f: replay.playerId, i: 3, ri: 0, s: 0, a: 0, t: 0, b: { info: HELLO, playerId: replay.playerId, inc: 3, pub: replay.pub, sig } });
    await rig.hub.advance(50);
    assert.equal(rig.links.length, 1, "hello assinado para outro destino (replay) não vincula");
  });

  test("id de transporte já vinculado não vira outra identidade (hello verificado de outro jogador cai); num transporte novo, vincula", async () => {
    const rig = await rawRig();
    const first = await rawPeer(rig, { tp: "R1" });
    assert.equal(rig.links.length, 1);
    // Outra identidade, hello assinado de verdade para o MESMO par de ids de transporte (R1 → eu).
    const other = await createIdentity();
    const inc = 9;
    const sig = await other.sign(`bobonline|hello|${CODE}|${other.playerId}|${inc}|${rig.fake.selfId()}|R1`);
    rig.fake.deliver("R1", { p: 1, k: "hello", f: other.playerId, i: inc, ri: rig.session.incarnation, s: 0, a: 0, t: 0,
      b: { info: HELLO, playerId: other.playerId, inc, pub: other.pub, sig } });
    await rig.hub.advance(50);
    rig.fake.deliver("R1", { p: 1, k: "x", f: other.playerId, i: inc, ri: rig.session.incarnation, s: 1, a: 0, t: 0, b: { who: "cunhado" } });
    await rig.hub.advance(50);
    assert.equal(rig.links.length, 1, "uma conexão só não cunha identidades");
    assert.equal(rig.session.pubOf(other.playerId), null);
    first.send("x", 1, { who: "primeiro" });
    await rig.hub.advance(50);
    assert.deepEqual(rig.got.map((m) => m.body.who), ["primeiro"], "o vínculo original segue");
    // A mesma identidade numa carga de página nova (outro id de transporte): vincula normalmente.
    const fresh = await rawPeer(rig, { tp: "R2", identity: other, inc });
    fresh.send("x", 1, { who: "novo" });
    await rig.hub.advance(50);
    assert.deepEqual(rig.links.map((l) => l.playerId), [first.identity.playerId, other.playerId]);
    assert.deepEqual(rig.got.map((m) => m.body.who), ["primeiro", "novo"]);
  });

  test("fwd: quadro interno sem assinatura ou com assinatura errada cai; o certo chega", async () => {
    const rig = await rawRig();
    const relay = await rawPeer(rig, { tp: "R1" });
    const origin = await createIdentity();
    const intruder = await createIdentity();
    rig.session.setRoster([{ playerId: origin.playerId, pub: origin.pub }, { playerId: relay.identity.playerId, pub: relay.identity.pub }]);
    const me = rig.session.playerId;
    const inner = (s, body) => `{"p":1,"k":"x","f":"${origin.playerId}","i":9,"ri":${rig.session.incarnation},"s":${s},"a":0,"t":0,"b":${JSON.stringify(body)},"to":"${me}"}`;
    const signed = async (text, key) => `${text.slice(0, -1)},"sig":${JSON.stringify(await key.sign(text))}}`;
    const fwd = (innerText) => relay.send("fwd", 0, innerText, { to: me });
    fwd(inner(1, { v: "sem assinatura" }));
    fwd(await signed(inner(1, { v: "chave errada" }), intruder));
    const tampered = (await signed(inner(1, { v: "original" }), origin)).replace("original", "trocado!");
    fwd(tampered);
    await rig.hub.advance(50);
    assert.equal(rig.got.length, 0);
    fwd(await signed(inner(1, { v: "certo" }), origin));
    await rig.hub.advance(50);
    assert.deepEqual(rig.got.map((m) => [m.from, m.body.v]), [[origin.playerId, "certo"]]);
    assert.deepEqual(rig.links.at(-1), { playerId: origin.playerId, reason: "new" });
    // Quadro interno endereçado a outro jogador (R desviando): cai.
    const elsewhere = `{"p":1,"k":"x","f":"${origin.playerId}","i":9,"ri":${rig.session.incarnation},"s":2,"a":0,"t":0,"b":{"v":"desviado"},"to":"zzzzzzzzzz"}`;
    fwd(await signed(elsewhere, origin));
    await rig.hub.advance(50);
    assert.equal(rig.got.length, 1);
  });

  test("hello de incarnation menor recebe bye \"outra-aba\"; a aba velha vira superseded", async () => {
    const rig = await rawRig();
    const shared = await createIdentity();
    await rawPeer(rig, { tp: "NEW", inc: 9, identity: shared });
    await rawPeer(rig, { tp: "OLD", inc: 8, identity: shared });
    const bye = rig.fake.to("OLD", "bye");
    assert.equal(bye.length, 1);
    const { sig, ...rest } = bye[0].frame.b;
    assert.deepEqual(rest, { reason: "outra-aba", playerId: shared.playerId, inc: 9, tp: "NEW" });
    // A prova é o hello que a aba nova assinou para mim (eu = S → ela = NEW).
    assert.ok(await verifySig(shared.pub, `bobonline|hello|${CODE}|${shared.playerId}|9|${rig.fake.selfId()}|NEW`, sig));
    assert.equal(rig.links.length, 1, "a aba velha não religa");

    // Ponta a ponta, sem link entre as duas abas (só o bye de B avisa a velha).
    const hub = createMemoryHub({ seed: 21 });
    const fresh = node(hub, "A2", identities[0], { inc: 600 });
    const other = node(hub, "B", identities[1], { inc: 10 });
    fresh.session.connect(CODE);
    other.session.connect(CODE);
    await hub.advance(2000);
    hub.joinError("A1", "A2");
    const stale = node(hub, "A1", identities[0], { inc: 599 });
    stale.session.connect(CODE);
    await hub.advance(3000);
    assert.equal(stale.superseded, 1, "bye de B → onSuperseded na aba velha");
    assert.equal(fresh.superseded, 0);
    assert.ok(!other.links.some((l) => l.reason === "restarted"));

    // A aba velha perdeu o primeiro bye: ao insistir no hello, recebe hello + bye de novo (no máximo a cada 2 s).
    const rig2 = await rawRig();
    const twin = await createIdentity();
    await rawPeer(rig2, { tp: "N", inc: 9, identity: twin });
    const oldTab = await rawPeer(rig2, { tp: "O", inc: 8, identity: twin });
    assert.equal(rig2.fake.to("O", "bye").length, 1);
    const helloAgain = () => rig2.fake.deliver("O", { p: 1, k: "hello", f: twin.playerId, i: 8, ri: 0, s: 0, a: 0, t: 0, b: { info: HELLO, playerId: twin.playerId, inc: 8, pub: twin.pub, sig: "x" } });
    helloAgain();
    await rig2.hub.advance(100);
    assert.equal(rig2.fake.to("O", "bye").length, 1, "rápido demais: espera");
    await rig2.hub.advance(2000);
    helloAgain();
    await rig2.hub.advance(100);
    assert.equal(rig2.fake.to("O", "bye").length, 2);
    assert.ok(rig2.fake.to("O", "hello").length >= 2, "o hello vai junto (a aba velha só aceita o bye de quem vinculou)");
    void oldTab;

    // Mesma identidade se encontrando direto: o boot maior fica.
    const hub2 = createMemoryHub({ seed: 22 });
    const older = node(hub2, "P1", identities[2], { inc: 40 });
    older.session.connect(CODE);
    await hub2.advance(500);
    const newer = node(hub2, "P2", identities[2], { inc: 41 });
    newer.session.connect(CODE);
    await hub2.advance(3000);
    assert.equal(older.superseded, 1);
    assert.equal(newer.superseded, 0);
  });

  test("bye forjado (sem prova, outra chave, outro destino, inc velho, outra sala, repassado) não derruba; só a prova certa", async () => {
    const rig = await rawRig();   // eu sou a aba "velha" (inc 50)
    const me = rig.session.playerId;
    const c = await rawPeer(rig, { tp: "C1" });
    const relay = await rawPeer(rig, { tp: "R1" });
    const helloOf = (key, inc, receiverTp, code = CODE) => key.sign(`bobonline|hello|${code}|${me}|${inc}|${receiverTp}|NOVA`);
    const proof = (inc, sig, extra = {}) => ({ reason: "outra-aba", playerId: me, inc, tp: "NOVA", sig, ...extra });
    const valid = proof(51, await helloOf(rig.self, 51, "C1"));
    const forged = [
      { reason: "outra-aba" },                                            // o ataque da revisão: qualquer par vinculado
      { reason: "outra-aba", playerId: me, inc: 51 },                     // o formato antigo, sem prova
      proof(51, await helloOf(c.identity, 51, "C1")),                     // assinado pela chave de C, não pela minha
      proof(51, await helloOf(rig.self, 51, "D1")),                       // hello verdadeiro, mas para outro par (D)
      proof(50, await helloOf(rig.self, 50, "C1")),                       // incarnation não maior que a minha
      proof(52, await helloOf(rig.self, 51, "C1")),                       // inc trocado depois de assinado
      proof(51, await helloOf(rig.self, 51, "C1", "OUTRA9")),             // hello de outra sala
      { ...valid, playerId: c.identity.playerId },                        // aba velha de outro jogador
      { ...valid, inc: "51" },
      { ...valid, inc: 2 ** 53 },
      { ...valid, tp: 7 },
      { ...valid, sig: null },
      { ...valid, reason: "x" },
      null,
      "outra-aba",
    ];
    for (const body of forged) {
      c.send("bye", 0, body);
      await rig.hub.advance(20);
    }
    // A prova certa (assinada para C) chegando por OUTRO par direto: o texto amarra C, cai.
    relay.send("bye", 0, valid);
    await rig.hub.advance(20);
    // Pelo relay (fwd de R com quadro interno assinado por C): bye só vale direto, cai.
    const inner = `{"p":1,"k":"bye","f":"${c.identity.playerId}","i":${c.inc},"ri":${rig.session.incarnation},"s":0,"a":0,"t":0,"b":${JSON.stringify(valid)},"to":"${me}"}`;
    relay.send("fwd", 0, `${inner.slice(0, -1)},"sig":${JSON.stringify(await c.identity.sign(inner))}}`, { to: me });
    await rig.hub.advance(50);
    assert.equal(rig.superseded, 0, "nada derrubou a sessão");
    // O mesmo bye vindo direto de C: a aba nova (minha chave, inc 51) existe de verdade.
    c.send("bye", 0, valid);
    await rig.hub.advance(20);
    assert.equal(rig.superseded, 1);
    c.send("bye", 0, valid);
    await rig.hub.advance(20);
    assert.equal(rig.superseded, 1, "uma vez só (a sessão saiu)");
  });

  test("incarnation nova só pelo relay: a aba velha ganha hello sem bye; depois do hello direto da nova, o bye leva a prova", async () => {
    const rig = await rawRig();   // eu sou o terceiro (C)
    const me = rig.session.playerId;
    const twin = await createIdentity();
    const relay = await rawPeer(rig, { tp: "R1" });
    await rawPeer(rig, { tp: "OLD", inc: 8, identity: twin });
    const hb = `{"p":1,"k":"hb","f":"${twin.playerId}","i":9,"ri":${rig.session.incarnation},"s":0,"a":0,"t":0,"b":{"now":0,"echo":null,"vis":"fg","ok":[],"m":null},"to":"${me}"}`;
    relay.send("fwd", 0, `${hb.slice(0, -1)},"sig":${JSON.stringify(await twin.sign(hb))}}`, { to: me });
    await rig.hub.advance(50);
    assert.deepEqual(rig.links.at(-1), { playerId: twin.playerId, reason: "restarted" });
    const helloAgain = () => rig.fake.deliver("OLD", { p: 1, k: "hello", f: twin.playerId, i: 8, ri: 0, s: 0, a: 0, t: 0, b: { info: HELLO, playerId: twin.playerId, inc: 8, pub: twin.pub, sig: "x" } });
    const hellos = rig.fake.to("OLD", "hello").length;
    await rig.hub.advance(2100);
    helloAgain();
    await rig.hub.advance(50);
    assert.ok(rig.fake.to("OLD", "hello").length > hellos, "a aba velha insistiu: ganha hello");
    assert.equal(rig.fake.to("OLD", "bye").length, 0, "sem hello direto da nova não há prova: sem bye");
    await rawPeer(rig, { tp: "NEW", inc: 9, identity: twin });
    await rig.hub.advance(2100);
    helloAgain();
    await rig.hub.advance(50);
    const bye = rig.fake.to("OLD", "bye");
    assert.equal(bye.length, 1);
    assert.equal(bye[0].frame.b.tp, "NEW");
    assert.equal(bye[0].frame.b.inc, 9);
    assert.ok(await verifySig(twin.pub, `bobonline|hello|${CODE}|${twin.playerId}|9|${rig.fake.selfId()}|NEW`, bye[0].frame.b.sig));
  });

  test("versão diferente → onIncompatible dos dois lados, sem vínculo", async () => {
    const hub = createMemoryHub({ seed: 4 });
    const a = node(hub, "A", identities[0]);
    const b = node(hub, "B", identities[1], { hello: { ...HELLO, proto: HELLO.proto + 1 } });
    const c = node(hub, "C", identities[2], { hello: { ...HELLO, celebrations: HELLO.celebrations - 1 } });
    for (const peer of [a, b, c]) peer.session.connect(CODE);
    await hub.advance(5000);
    assert.deepEqual(a.incompatible.map((x) => x.playerId).sort(), [idOf(b), idOf(c)].sort());
    assert.equal(a.incompatible.find((x) => x.playerId === idOf(b)).info.proto, HELLO.proto + 1);
    assert.ok(b.incompatible.some((x) => x.playerId === idOf(a) && x.info.proto === HELLO.proto));
    assert.equal(a.links.length, 0);
    a.session.send(idOf(b), "x", {});
    await hub.advance(2000);
    assert.equal(b.got.length, 0);
  });

  test("pubOf: só a chave do hello verificado e vinculado; roster, hello mal assinado e versão diferente dão null", async () => {
    const rig = await rawRig();
    const rostered = await createIdentity();
    rig.session.setRoster([{ playerId: rostered.playerId, pub: rostered.pub }]);
    assert.equal(rig.session.pubOf(rostered.playerId), null, "a chave do roster não é hello verificado");
    const peer = await rawPeer(rig, { tp: "R1" });
    const liar = await rawPeer(rig, { tp: "R2", sign: false });
    const old = await rawPeer(rig, { tp: "R3", info: { ...HELLO, proto: HELLO.proto + 1 } });
    await rig.hub.advance(50);
    assert.equal(rig.incompatible.length, 1);
    assert.equal(rig.session.pubOf(peer.identity.playerId), peer.identity.pub);
    assert.equal(rig.session.pubOf(liar.identity.playerId), null);
    assert.equal(rig.session.pubOf(old.identity.playerId), null, "incompatível não vincula");
    assert.equal(rig.session.pubOf(rig.session.playerId), null, "eu mesmo não sou par");
    assert.equal(rig.session.pubOf("zzzzzzzzzz"), null);
    // O par recarrega (incarnation maior, mesma identidade): a chave segue a mesma.
    await rawPeer(rig, { tp: "R4", inc: peer.inc + 1, identity: peer.identity });
    await rig.hub.advance(50);
    assert.deepEqual(rig.links.at(-1), { playerId: peer.identity.playerId, reason: "restarted" });
    assert.equal(rig.session.pubOf(peer.identity.playerId), peer.identity.pub);
  });
});

// ---------------------------------------------------------------------------
// Saúde, presença, repasse, relógio
// ---------------------------------------------------------------------------

describe("saúde e presença", () => {
  test("silêncio: unstable em 3 s, lost em 8 s; onPeerLeave sem relay = lost na hora", async () => {
    const { hub, peers } = await room(["A", "B"]);
    const { A, B } = peers;
    assert.equal(A.session.health(idOf(B)), "ok");
    hub.partition("A", "B", true);
    const cut = hub.now();
    await hub.advance(10_000);
    const timeline = A.health.filter((h) => h.playerId === idOf(B) && h.at >= cut);
    assert.deepEqual(timeline.map((h) => h.health), ["unstable", "lost"]);
    const lastHeard = cut - 1000; // o último hb chegou no máximo 1 s antes do corte
    assert.ok(timeline[0].at - lastHeard >= T.UNSTABLE_MS - 1000 && timeline[0].at - cut <= T.UNSTABLE_MS + 300);
    assert.ok(timeline[1].at - cut >= T.LOST_MS - 1000 && timeline[1].at - cut <= T.LOST_MS + 300);
    hub.partition("A", "B", false);
    await hub.advance(2000);
    assert.equal(A.session.health(idOf(B)), "ok");
    assert.ok(A.links.some((l) => l.playerId === idOf(B) && l.reason === "reconnected"), "voltou do lost → reconnected");
    B.transport.close();
    await hub.advance(10);
    assert.equal(A.session.health(idOf(B)), "lost", "saída limpa sem outro caminho: lost na hora");
  });

  test("away fica enquanto chegam hb com vis=bg; só back ou vis=fg limpam", async () => {
    const { hub, peers } = await room(["A", "B"]);
    const { A, B } = peers;
    B.session.setVisible(false);
    await hub.advance(200);
    assert.equal(A.session.health(idOf(B)), "away");
    for (let second = 0; second < 20; second += 1) {
      await hub.advance(1000);
      assert.equal(A.session.health(idOf(B)), "away", `ainda away aos ${second + 1} s (hb chegando com vis=bg)`);
    }
    assert.ok(A.session.progressOf(idOf(B)).at >= hub.now() - 1300, "B continua mandando hb");
    // Os dois "back" se perdem: o próximo hb com vis=fg limpa.
    hub.partition("A", "B", true);
    B.session.setVisible(true);
    await hub.advance(400);
    hub.partition("A", "B", false);
    assert.equal(A.session.health(idOf(B)), "away");
    await hub.advance(1200);
    assert.equal(A.session.health(idOf(B)), "ok");
    // Caminho rápido: back.
    B.session.setVisible(false);
    await hub.advance(100);
    assert.equal(A.session.health(idOf(B)), "away");
    B.session.setVisible(true);
    await hub.advance(100);
    assert.equal(A.session.health(idOf(B)), "ok");
    assert.equal(A.session.linked().includes(idOf(B)), true);
  });

  test("relay por um terceiro com A↔B partido; heartbeats repassados mantêm ok; o direto volta", async () => {
    const { hub, peers } = await room(["A", "B", "C"], { seed: 8 });
    const { A, B, C } = peers;
    hub.partition("A", "B", true);
    const cut = hub.now();
    await hub.advance(30_000);
    const states = A.health.filter((h) => h.playerId === idOf(B) && h.at >= cut).map((h) => h.health);
    assert.ok(!states.includes("lost"), `A nunca viu B lost: ${states.join(",")}`);
    assert.equal(A.session.health(idOf(B)), "ok");
    assert.equal(B.session.health(idOf(A)), "ok");
    assert.equal(A.session.direct(idOf(B)), false);
    assert.equal(A.session.heardBy(idOf(B)), true, "C lista B em ok");
    for (let n = 0; n < 20; n += 1) {
      A.session.send(idOf(B), "ab", { n });
      B.session.send(idOf(A), "ba", { n });
    }
    await waitFor(hub, () => B.got.length === 20 && A.got.length === 20, 10_000);
    assert.deepEqual(B.got.map((m) => m.body.n), [...Array(20).keys()]);
    assert.deepEqual(A.got.map((m) => m.body.n), [...Array(20).keys()]);
    assert.equal(C.got.length, 0, "o relay não entrega nada para si");
    assert.notEqual(A.session.rttOf(idOf(B)), null);
    hub.partition("A", "B", false);
    await hub.advance(3000);
    assert.equal(A.session.direct(idOf(B)), true, "o link direto volta a ser usado");
  });

  test("okListOf: a lista ok do último hb de cada par, direto ou pelo relay, em cópia", async () => {
    const { hub, peers } = await room(["A", "B", "C"], { seed: 9 });
    const { A, B, C } = peers;
    assert.deepEqual(A.session.okListOf(idOf(B)).sort(), [idOf(A), idOf(C)].sort());
    assert.equal(A.session.okListOf("zzzzzzzzzz"), null);
    hub.partition("A", "B", true);
    await hub.advance(10_000);
    assert.equal(A.session.direct(idOf(B)), false);
    assert.deepEqual(A.session.okListOf(idOf(C)).sort(), [idOf(A), idOf(B)].sort(), "C ouve os dois direto");
    assert.deepEqual(A.session.okListOf(idOf(B)), [idOf(C)], "o hb de B chega pelo C e não lista A");
    const copy = A.session.okListOf(idOf(C));
    copy.length = 0;
    assert.equal(A.session.okListOf(idOf(C)).length, 2, "mexer na cópia não muda a sessão");
    hub.partition("A", "B", false);
    await hub.advance(3000);
    assert.deepEqual(A.session.okListOf(idOf(B)).sort(), [idOf(A), idOf(C)].sort(), "o direto volta e B lista A de novo");
  });

  test("okListOf: só os ids (strings) do hb; null antes do primeiro e depois de o par recarregar", async () => {
    const rig = await rawRig();
    const peer = await rawPeer(rig, { tp: "R1", inc: 7 });
    await rig.hub.advance(50);
    assert.equal(rig.session.okListOf(peer.identity.playerId), null, "vinculado, mas ainda sem hb");
    peer.send("hb", 0, { now: 1, echo: null, vis: "fg", ok: ["AAAAAAAAAA", 5, null, "BBBBBBBBBB"], m: null });
    await rig.hub.advance(50);
    assert.deepEqual(rig.session.okListOf(peer.identity.playerId), ["AAAAAAAAAA", "BBBBBBBBBB"]);
    await rawPeer(rig, { tp: "R2", inc: 8, identity: peer.identity });
    await rig.hub.advance(50);
    assert.equal(rig.session.okListOf(peer.identity.playerId), null, "incarnation nova: a lista da página velha não vale");
  });

  test("par que nunca liga direto (ICE falha): onJoinError e tudo pelo relay", async () => {
    const hub = createMemoryHub({ seed: 12 });
    hub.joinError("A", "B");
    const { peers } = await room(["A", "B", "C"], { hub, connectMs: 1000 });
    const { A, B } = peers;
    assert.ok(A.joinErrors.length >= 1 && B.joinErrors.length >= 1);
    assert.equal(A.joinErrors[0].playerId, null, "id de transporte nunca vinculado");
    const took = await waitFor(hub, () => A.session.health(idOf(B)) === "ok" && B.session.health(idOf(A)) === "ok", 15_000);
    assert.notEqual(took, null);
    assert.ok(A.links.some((l) => l.playerId === idOf(B) && l.reason === "new"));
    A.session.send(idOf(B), "oi", { texto: "pelo C" });
    await waitFor(hub, () => B.got.length === 1, 5000);
    assert.equal(B.got[0].body.texto, "pelo C");
  });

  test("diferença de relógio estimada a ±50 ms com latência simétrica", async () => {
    const hub = createMemoryHub({ seed: 31 });
    const skewA = 1_000_000;
    const skewB = -180_000; // B com o relógio 3 min atrasado
    const a = node(hub, "A", identities[0], { now: () => 1_700_000_000_000 + hub.now() + skewA });
    const b = node(hub, "B", identities[1], { now: () => 1_700_000_000_000 + hub.now() + skewB });
    hub.setLatency("A", "B", 120, 40);
    a.session.connect(CODE);
    b.session.connect(CODE);
    await hub.advance(20_000);
    const expected = skewA - skewB;
    assert.ok(Math.abs(a.session.clockOffset(idOf(b)) - expected) <= 50, `A: ${a.session.clockOffset(idOf(b))} vs ${expected}`);
    assert.ok(Math.abs(b.session.clockOffset(idOf(a)) + expected) <= 50, `B: ${b.session.clockOffset(idOf(a))}`);
    assert.ok(Math.abs(a.session.rttOf(idOf(b)) - 240) <= 80);
  });

  test("progresso da partida viaja no hb; 8 aparelhos numa sala se ouvem", async () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const { hub, peers } = await room(names, { seed: 17 });
    const progress = { matchId: "K7MPX3-r1m0-0", n: 12, restN: 11, h: "abc", se: 0, opened: 12, own: { idleLeft: 5.5, kickLeft: null } };
    peers.A.session.setProgress(progress);
    for (const name of names) peers[name].session.broadcast("ola", { from: name });
    await hub.advance(2500);
    for (const name of names) {
      assert.equal(peers[name].session.linked().length, 7, `${name} liga com os 7`);
      assert.deepEqual(peers[name].got.map((m) => m.body.from).sort(), names.filter((n) => n !== name));
    }
    assert.deepEqual(peers.B.session.progressOf(idOf(peers.A)).p, progress);
    assert.ok(peers.B.session.heardBy(idOf(peers.A)));
    assert.equal(peers.B.session.online(), true);
  });

  test("rejoin é single-flight, mantém outbox e religa como reconnected", async () => {
    const { hub, peers } = await room(["A", "B"]);
    const { A, B } = peers;
    const first = A.session.rejoin();
    assert.equal(A.session.rejoin(), first);
    A.session.send(idOf(B), "durante", { n: 1 });
    await first;
    await hub.advance(3000);
    assert.ok(A.links.some((l) => l.playerId === idOf(B) && l.reason === "reconnected"));
    assert.ok(B.links.some((l) => l.playerId === idOf(A) && l.reason === "reconnected"));
    assert.deepEqual(B.got.map((m) => m.kind), ["durante"]);
    await A.session.leave();
    await hub.advance(10);
    assert.equal(B.session.health(idOf(A)), "lost");
  });

  test("queda silenciosa: relay aberto e calado deixa de valer em RELAY_SILENT_MS (online() cai com o par sumido); volta com o relay", async () => {
    const { hub, peers } = await room(["A", "B"]);
    const { A, B } = peers;
    const signals = [];
    A.session.onSignaling = (up) => signals.push({ up, at: hub.now() });
    assert.equal(A.session.signalingUp(), true);
    // O roteador de A perdeu a internet: o link com B morre, o socket do relay segue OPEN e nada chega.
    hub.partition("A", "B", true);
    hub.signaling("A", "silent");
    const cut = hub.now();
    await hub.advance(RELAY_SILENT_MS - 500);
    assert.equal(A.transport.signalingUp(), true, "o socket segue aberto");
    assert.equal(A.session.signalingUp(), true, "ainda dentro da janela");
    assert.equal(A.session.health(idOf(B)), "lost");
    assert.equal(A.session.online(), true, "dentro da janela, o relay ainda conta");
    await hub.advance(1000);
    assert.equal(A.session.signalingUp(), false);
    assert.equal(A.session.online(), false, "sem sinal do relay e sem par ok: fora da rede");
    const down = signals.find((entry) => !entry.up);
    assert.ok(down && down.at - cut >= RELAY_SILENT_MS && down.at - cut <= RELAY_SILENT_MS + 300, `onSignaling(false) em ${down && down.at - cut} ms`);
    // Do outro lado o relay fala: B segue na rede e vê A sumido.
    assert.equal(B.session.signalingUp(), true);
    assert.equal(B.session.online(), true);
    assert.equal(B.session.health(idOf(A)), "lost");
    // Socket aberto e calado também não traz ninguém novo: a rede volta, o relay fala, tudo religa.
    hub.signaling("A", true);
    hub.partition("A", "B", false);
    await hub.advance(500);
    assert.equal(A.session.signalingUp(), true);
    assert.equal(signals.at(-1).up, true);
    await hub.advance(3000);
    assert.equal(A.session.health(idOf(B)), "ok");
    assert.equal(A.session.online(), true);
  });
});

// ---------------------------------------------------------------------------
// Escada de ciclo de vida (eventos falsos)
// ---------------------------------------------------------------------------

function fakeLifecycleSession({ linked = [], health = {}, signalingUp = true } = {}) {
  const calls = { rejoin: 0, visible: [], pause: 0, resume: 0 };
  const session = {
    linked: () => session.state.linked,
    health: (playerId) => session.state.health[playerId] ?? "lost",
    rejoin: async () => { calls.rejoin += 1; },
    setVisible: (visible) => calls.visible.push(visible),
    pauseSignaling: () => (calls.pause += 1),
    resumeSignaling: () => (calls.resume += 1),
    signalingUp: () => session.state.signalingUp,
    state: { linked, health, signalingUp },
    calls,
  };
  return session;
}

function ladder(session, extra = {}) {
  const hub = createMemoryHub();
  const doc = new EventTarget();
  doc.hidden = false;
  const win = new EventTarget();
  const reloads = [];
  const lifecycle = new BobLifecycle({
    session, isRunning: () => true, reload: () => reloads.push(hub.now()), reloadSafe: async () => true,
    onLine: () => true, clock: hub.clock, doc, win, ...extra,
  });
  lifecycle.start();
  const fire = (target, type, hidden) => {
    if (hidden !== undefined) doc.hidden = hidden;
    target.dispatchEvent(new Event(type));
  };
  return { hub, doc, win, lifecycle, reloads, fire };
}

describe("escada de ciclo de vida", () => {
  test("sozinho no lobby: só rejoin, nunca reload", async () => {
    const session = fakeLifecycleSession({ linked: [], signalingUp: false });
    const { hub, doc, lifecycle, reloads, fire } = ladder(session, { isRunning: () => false });
    fire(doc, "visibilitychange", true);
    fire(doc, "pause");
    assert.deepEqual(session.calls.visible, [false]);
    assert.equal(session.calls.pause, 1);
    await hub.advance(60_000);
    fire(doc, "visibilitychange", false);
    fire(doc, "resume");
    await hub.advance(T.RESUME_SIGNALING_CHECK_MS + 100);
    assert.equal(session.calls.rejoin, 1);
    await hub.advance(200_000);
    assert.equal(session.calls.rejoin, 1);
    assert.equal(reloads.length, 0);
    // Rodando e sozinho (busca de sala), mesmo com tudo apontando para reload: nunca recarrega.
    const running = ladder(fakeLifecycleSession({ linked: [], signalingUp: false }));
    running.fire(running.doc, "visibilitychange", true);
    running.fire(running.doc, "visibilitychange", false);
    await running.hub.advance(200_000);
    assert.equal(running.reloads.length, 0);
    lifecycle.dispose();
  });

  test("relay de sinalização caído mas canal de dados ok: nunca reload (nem rejoin)", async () => {
    const session = fakeLifecycleSession({ linked: ["B"], health: { B: "ok" }, signalingUp: false });
    const { hub, doc, reloads, fire } = ladder(session);
    fire(doc, "visibilitychange", true);
    fire(doc, "visibilitychange", false);
    await hub.advance(120_000);
    assert.equal(session.calls.rejoin, 0);
    assert.equal(reloads.length, 0);
  });

  test("visibilitychange + resume duplicados → um rejoin só", async () => {
    const session = fakeLifecycleSession({ linked: ["B"], health: { B: "unstable" } });
    const { hub, doc, reloads, fire } = ladder(session, { isRunning: () => false });
    fire(doc, "visibilitychange", true);
    fire(doc, "pause");
    await hub.advance(30_000);
    fire(doc, "visibilitychange", false);
    await hub.advance(100);
    fire(doc, "resume");
    await hub.advance(T.REJOIN_AFTER_RESUME_MS + 1500);
    assert.equal(session.calls.rejoin, 1);
    assert.equal(session.calls.visible.filter((v) => v === false).length, 1, "away uma vez só");
    // Fora do running: continua só com rejoin a cada REJOIN_RETRY_MS.
    await hub.advance(T.REJOIN_RETRY_MS * 3);
    assert.equal(session.calls.rejoin, 4);
    assert.equal(reloads.length, 0);
  });

  test("reload só quando tudo vale; um par ok cancela a escada", async () => {
    // running, ninguém ok, rejoin falhou há 15 s, online, reloadSafe → reload.
    const session = fakeLifecycleSession({ linked: [], health: {} });
    const saves = [];
    const run = ladder(session, { beforeReload: () => saves.push("salvou") });
    session.state.linked = ["B"];
    session.state.health = { B: "unstable" };
    run.fire(run.doc, "visibilitychange", true);
    session.state.linked = [];
    run.fire(run.doc, "visibilitychange", false);
    await run.hub.advance(T.REJOIN_AFTER_RESUME_MS + T.RELOAD_AFTER_FAILED_REJOIN_MS + 2000);
    assert.equal(session.calls.rejoin, 1);
    assert.equal(run.reloads.length, 1);
    assert.deepEqual(saves, ["salvou"]);

    // Offline: nunca recarrega, só rejoin a cada 20 s.
    const offline = fakeLifecycleSession({ linked: ["B"], health: { B: "lost" } });
    const off = ladder(offline, { onLine: () => false });
    off.fire(off.doc, "visibilitychange", true);
    off.fire(off.doc, "visibilitychange", false);
    await off.hub.advance(70_000);
    assert.equal(off.reloads.length, 0);
    assert.ok(offline.calls.rejoin >= 3);

    // reloadSafe falso (deploy novo no ar): nunca recarrega.
    const unsafe = fakeLifecycleSession({ linked: ["B"], health: { B: "lost" } });
    const nope = ladder(unsafe, { reloadSafe: async () => false });
    nope.fire(nope.doc, "visibilitychange", true);
    nope.fire(nope.doc, "visibilitychange", false);
    await nope.hub.advance(70_000);
    assert.equal(nope.reloads.length, 0);

    // Um par volta a ficar ok depois do rejoin: a escada para.
    const healed = fakeLifecycleSession({ linked: ["B"], health: { B: "lost" } });
    const heal = ladder(healed);
    heal.fire(heal.doc, "visibilitychange", true);
    heal.fire(heal.doc, "visibilitychange", false);
    await heal.hub.advance(T.REJOIN_AFTER_RESUME_MS + 500);
    healed.state.health = { B: "ok" };
    await heal.hub.advance(5000);
    healed.state.health = { B: "lost" };
    await heal.hub.advance(60_000);
    assert.equal(healed.calls.rejoin, 1);
    assert.equal(heal.reloads.length, 0);
  });

  test("rede volta com a página escondida: religa sem mandar back e sem recarregar; o pause segura os relays", async () => {
    const session = fakeLifecycleSession({ linked: ["B"], health: { B: "unstable" } });
    const { hub, doc, win, reloads, fire } = ladder(session);
    fire(doc, "visibilitychange", true);
    fire(doc, "pause");
    session.state.linked = [];
    fire(win, "offline");
    await hub.advance(5000);
    fire(win, "online");
    assert.deepEqual(session.calls.visible, [false], "continua bg: nada de back");
    assert.equal(session.calls.resume, 0, "pausado: os relays esperam o resume");
    await hub.advance(T.REJOIN_AFTER_RESUME_MS + T.RELOAD_AFTER_FAILED_REJOIN_MS + T.REJOIN_RETRY_MS + 3000);
    assert.ok(session.calls.rejoin >= 2, "religa em segundo plano");
    assert.equal(reloads.length, 0, "escondida nunca recarrega");
    fire(doc, "visibilitychange", false);
    fire(doc, "resume");
    assert.equal(session.calls.visible[1], true);
    assert.ok(!session.calls.visible.slice(1).includes(false));
    assert.ok(session.calls.resume >= 1);
    await hub.advance(T.REJOIN_AFTER_RESUME_MS + T.RELOAD_AFTER_FAILED_REJOIN_MS + 2000);
    assert.equal(reloads.length, 1, "de volta ao primeiro plano, a escada pode chegar ao reload");
  });

  test("reloadSafe: falso com current diferente no net.json, falha ou HTTP ruim; APK sempre seguro", async () => {
    const asked = [];
    const answer = (body, ok = true) => async (url, init) => {
      asked.push({ url, cache: init?.cache });
      return { ok, json: async () => body };
    };
    const base = { nativeAndroid: () => false, href: "https://futbobo.top/bobonline/?sala=K7MPX3" };
    const current = { protocol: protocol.BOB_PROTOCOL, engineRev: BOTAO_ENGINE_REV, celebrations: CELEBRATION_OPTIONS.length };
    assert.equal(await reloadSafe({ ...base, fetch: answer({ current }) }), true);
    assert.deepEqual(asked[0], { url: "https://futbobo.top/bobonline/net.json", cache: "no-store" });
    await reloadSafe({ ...base, href: "https://futbobo.top/bobonline?sala=K7MPX3", fetch: answer({ current }) });
    await reloadSafe({ ...base, href: "https://html.itch.zone/html/123/bobonline/index.html", fetch: answer({ current }) });
    assert.deepEqual(asked.slice(1).map((a) => a.url), ["https://futbobo.top/bobonline/net.json", "https://html.itch.zone/html/123/bobonline/net.json"]);
    asked.length = 1;
    assert.equal(await reloadSafe({ ...base, fetch: answer({ current: { ...current, celebrations: current.celebrations + 1 } }) }), false);
    assert.equal(await reloadSafe({ ...base, fetch: answer({ current: { ...current, engineRev: current.engineRev + 1 } }) }), false);
    assert.equal(await reloadSafe({ ...base, fetch: answer({ current: { ...current, protocol: current.protocol + 1 } }) }), false);
    assert.equal(await reloadSafe({ ...base, fetch: answer({}) }), false);
    assert.equal(await reloadSafe({ ...base, fetch: answer({ current }, false) }), false);
    assert.equal(await reloadSafe({ ...base, fetch: async () => { throw new Error("offline"); } }), false);
    assert.equal(await reloadSafe({ nativeAndroid: () => true, fetch: async () => { throw new Error("não chama"); } }), true);
    // O net.json publicado deixa recarregar ESTE build.
    const published = JSON.parse(readFileSync(join(ROOT, "public/bobonline/net.json"), "utf8"));
    assert.equal(await reloadSafe({ ...base, fetch: answer(published) }), true);
  });
});

// ---------------------------------------------------------------------------
// net.json, identidade, códigos, sessão salva, trava de aba
// ---------------------------------------------------------------------------

describe("net.json e configuração", () => {
  test("net.json parseia, current = constantes, DEFAULT_NET_CONFIG = arquivo", () => {
    const file = JSON.parse(readFileSync(join(ROOT, "public/bobonline/net.json"), "utf8"));
    assert.equal(file.version, 1);
    assert.deepEqual(file.current, { protocol: protocol.BOB_PROTOCOL, engineRev: BOTAO_ENGINE_REV, celebrations: CELEBRATION_OPTIONS.length });
    assert.equal(file.notice, undefined, "o arquivo publicado não leva notice");
    assert.deepEqual(netConfig.DEFAULT_NET_CONFIG, file);
    assert.deepEqual(netConfig.sanitizeNetConfig(file), file, "o arquivo passa limpo pela validação");
    assert.ok(file.nostrRelays.length >= 5 && file.nostrRelays.every((url) => url.startsWith("wss://")));
    assert.ok(file.latestProtocol >= protocol.BOB_PROTOCOL);
    assert.deepEqual(file.turn ?? [], [...protocol.TURN_SERVERS], "TURN do arquivo = TURN embutido");
    assert.equal(netConfig.NET_CONFIG_URL, "https://futbobo.top/bobonline/net.json");
  });

  test("sanitizeNetConfig descarta lixo; loadNetConfig: rede → cache → padrão", async () => {
    assert.equal(netConfig.sanitizeNetConfig({ version: 2 }), null);
    assert.deepEqual(netConfig.sanitizeNetConfig({
      version: 1, nostrRelays: ["wss://ok", "http://nao", 3], redundancy: 99, turn: [{ urls: "turn:x:3478", username: "u", credential: "c" }, { urls: "http://x" }],
      minProtocol: 1, current: { protocol: 1, engineRev: "1", celebrations: 18 }, notice: "  Manutenção hoje  ", lixo: true,
    }), { version: 1, nostrRelays: ["wss://ok"], turn: [{ urls: "turn:x:3478", username: "u", credential: "c" }], minProtocol: 1, notice: "Manutenção hoje" });
    storage.clear();
    const remote = { version: 1, nostrRelays: ["wss://relay.exemplo"], latestProtocol: 3 };
    const got = await netConfig.loadNetConfig({ fresh: true, fetch: async (url, init) => {
      assert.equal(url, netConfig.NET_CONFIG_URL);
      assert.equal(init.cache, "no-cache");
      return { ok: true, json: async () => remote };
    } });
    assert.deepEqual(got, remote);
    const cached = await netConfig.loadNetConfig({ fresh: true, fetch: async () => { throw new Error("offline"); } });
    assert.deepEqual(cached, remote, "sem rede: a última boa do cache");
    const slow = await netConfig.loadNetConfig({ fresh: true, timeoutMs: 5, fetch: (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("abortado")));
    }) });
    assert.deepEqual(slow, remote, "timeout: cache");
    storage.clear();
    assert.deepEqual(await netConfig.loadNetConfig({ fresh: true, fetch: async () => ({ ok: false, json: async () => ({}) }) }), netConfig.DEFAULT_NET_CONFIG);
    const first = netConfig.loadNetConfig({ fetch: async () => ({ ok: true, json: async () => remote }) });
    assert.equal(netConfig.loadNetConfig(), first, "uma configuração por página");
    await first;
  });
});

describe("identidade e códigos", () => {
  test("playerId: 10 caracteres base32 Crockford de SHA-256(pub); assinatura confere", async () => {
    const identity = identities[0];
    assert.match(identity.playerId, /^[0-9abcdefghjkmnpqrstvwxyz]{10}$/);
    assert.equal(await playerIdFor(identity.pub), identity.playerId);
    const sig = await identity.sign("bobonline|teste");
    assert.equal(await verifySig(identity.pub, "bobonline|teste", sig), true);
    assert.equal(await verifySig(identity.pub, "bobonline|teste!", sig), false);
    assert.equal(await verifySig(identities[1].pub, "bobonline|teste", sig), false);
    assert.equal(await verifySig("lixo", "x", "y"), false);
    assert.equal(new Set(identities.map((i) => i.playerId)).size, identities.length);
    assert.equal(identityMod.cryptoAvailable(), true);
  });

  test("loadIdentity guarda e reaproveita; incarnation estritamente crescente", async () => {
    storage.clear();
    const first = await identityMod.loadIdentity();
    const again = await identityMod.loadIdentity();
    assert.equal(again.playerId, first.playerId);
    const stored = JSON.parse(storage.get("futbobo:bobonline-identity:v1"));
    assert.equal(stored.v, 1);
    assert.equal(stored.playerId, first.playerId);
    assert.equal(stored.pub, first.pub);
    assert.equal(stored.privJwk.kty, "EC");
    const sig = await first.sign("x");
    assert.equal(await verifySig(stored.pub, "x", sig), true);
    const incs = [identityMod.nextIncarnation(), identityMod.nextIncarnation(), identityMod.nextIncarnation()];
    assert.ok(incs[0] < incs[1] && incs[1] < incs[2]);
    assert.equal(JSON.parse(storage.get("futbobo:bobonline-boot:v1")), incs[2]);
  });

  test("sessão salva: validade de 30 min, peek só com storage.ts", () => {
    storage.clear();
    assert.equal(SAVED_SESSION_TTL_MS, T.SESSION_TTL_MS);
    const now = Date.now();
    identityMod.saveSession({ code: CODE, isHost: true, epoch: 2, savedAt: now - 1000, password: "abc" });
    assert.deepEqual(identityMod.loadSession(now), { code: CODE, isHost: true, epoch: 2, savedAt: now - 1000, password: "abc" });
    assert.deepEqual(peekBobonlineSession(now), { code: CODE, savedAt: now - 1000 });
    assert.equal(peekBobonlineSession(now + T.SESSION_TTL_MS), null);
    assert.equal(identityMod.loadSession(now + T.SESSION_TTL_MS), null);
    assert.equal(storage.has("futbobo:bobonline-session:v1"), false, "vencida é apagada");
    identityMod.saveSession({ code: "ABC1O0", isHost: false, epoch: 0, savedAt: now });
    assert.equal(peekBobonlineSession(now), null, "código inválido");
    identityMod.clearSession();
    assert.equal(peekBobonlineSession(now), null);
    const source = readFileSync(join(ROOT, "app/bobonline/net/session-peek.ts"), "utf8");
    assert.deepEqual([...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]), ["../storage"]);
  });

  test("código da sala, link, texto de compartilhar e prova da senha", async () => {
    for (let index = 0; index < 200; index += 1) assert.ok(codes.isValidRoomCode(codes.makeRoomCode()));
    assert.equal(codes.extractRoomCode("K7MPX3"), "K7MPX3");
    assert.equal(codes.extractRoomCode("k7m-px3"), "K7MPX3");
    assert.equal(codes.extractRoomCode("K7M PX3"), "K7MPX3");
    assert.equal(codes.extractRoomCode("K7M·PX3"), "K7MPX3");
    assert.equal(codes.extractRoomCode("https://futbobo.top/bobonline/?sala=k7mpx3&p=1"), "K7MPX3");
    assert.equal(codes.extractRoomCode(codes.shareText("K7MPX3")), "K7MPX3");
    assert.equal(codes.extractRoomCode("No app: Jogar → Bobonline → Entrar na sala → K7M·PX3"), "K7MPX3");
    assert.equal(codes.extractRoomCode("Entra na sala K7MPX3"), "K7MPX3", "o espaço juntaria \"A K7MPX3\"");
    assert.equal(codes.extractRoomCode("sala k7m-px3 valeu"), "K7MPX3");
    assert.equal(codes.extractRoomCode("K7MPX3 é a sala"), "K7MPX3");
    assert.equal(codes.extractRoomCode("ABC123"), null, "1 não é do alfabeto");
    assert.equal(codes.extractRoomCode("oi"), null);
    assert.equal(codes.extractRoomCode("?sala=ABC10O"), null);
    assert.equal(codes.formatRoomCode("K7MPX3"), "K7M·PX3");
    assert.equal(codes.roomLink("K7MPX3"), `https://futbobo.top/bobonline/?sala=K7MPX3&p=${protocol.BOB_PROTOCOL}`);
    assert.equal(codes.shareText("K7MPX3"),
      "Bora jogar botão no Futbobo? Entra na minha sala: https://futbobo.top/bobonline/?sala=K7MPX3&p=1\nNo app: Jogar → Bobonline → Entrar na sala → K7M·PX3");
    const { createHash } = await import("node:crypto");
    assert.equal(await codes.passwordProof("segredo", "K7MPX3"), createHash("sha256").update("senha:segredo:K7MPX3").digest("hex"));
    assert.equal(identityMod.extractRoomCode, codes.extractRoomCode, "identity.ts reexporta os códigos");
  });
});

describe("uma aba só", () => {
  function fakeLocks() {
    const held = new Map();
    return {
      request(name, options, callback) {
        const current = held.get(name);
        if (current && options.ifAvailable) return Promise.resolve(callback(null));
        if (current && options.steal) {
          held.delete(name);
          current.reject(Object.assign(new Error("roubada"), { name: "AbortError" }));
        }
        return new Promise((resolve, reject) => {
          held.set(name, { reject });
          Promise.resolve(callback({ name })).then(resolve, reject);
        });
      },
    };
  }

  test("Web Locks: a segunda aba não ganha; Usar aqui rouba e a primeira recebe onLost", async () => {
    const locks = fakeLocks();
    const first = await acquireTabLock({ locks, name: "futbobo-bobonline" });
    assert.equal(first.granted, true);
    let lost = 0;
    first.onLost = () => (lost += 1);
    const second = await acquireTabLock({ locks, name: "futbobo-bobonline" });
    assert.equal(second.granted, false);
    assert.equal(await second.steal(), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(second.granted, true);
    assert.equal(first.granted, false);
    assert.equal(lost, 1);
  });

  test("sem Web Locks: ping no BroadcastChannel (300 ms), Usar aqui avisa a outra", async () => {
    const hub = createMemoryHub();
    const channels = [];
    const open = (name) => {
      const channel = {
        name, onmessage: null, closed: false,
        postMessage(data) { for (const other of channels) if (other !== channel && other.name === name && !other.closed) queueMicrotask(() => other.onmessage?.({ data })); },
        close() { channel.closed = true; },
      };
      channels.push(channel);
      return channel;
    };
    const pending = acquireTabLock({ locks: null, channel: open, clock: hub.clock, name: "futbobo-bobonline" });
    await hub.advance(400);
    const first = await pending;
    assert.equal(first.granted, true);
    let lost = 0;
    first.onLost = () => (lost += 1);
    const secondPending = acquireTabLock({ locks: null, channel: open, clock: hub.clock, name: "futbobo-bobonline" });
    await hub.advance(400);
    const second = await secondPending;
    assert.equal(second.granted, false, "a outra respondeu o ping");
    await second.steal();
    await hub.advance(10);
    assert.equal(first.granted, false);
    assert.equal(lost, 1);
    assert.equal(second.granted, true);
  });
});

// ---------------------------------------------------------------------------
// Carregador dos testes
// ---------------------------------------------------------------------------

describe("transporte Trystero sem rede (sockets falsos)", () => {
  test("sinal de vida dos relays: ouvinte por socket, sonda só com o relay calado (no máximo uma rodada a cada 6 s), nunca a quem fechou a sonda; close tira os ouvintes", async () => {
    const { createTrysteroTransport } = loadTs("app/bobonline/net/trystero-transport.ts");
    let now = 1000;
    Object.defineProperty(performance, "now", { value: () => now, configurable: true, writable: true });
    try {
      class FakeSocket extends EventTarget {
        readyState = 0;
        sent = [];
        send(data) { this.sent.push(JSON.parse(data)); }
      }
      const message = (data) => Object.assign(new Event("message"), { data: JSON.stringify(data) });
      const a = new FakeSocket();
      const b = new FakeSocket();
      const transport = createTrysteroTransport({});
      // O módulo e a sala do Trystero no lugar (o open de verdade importaria o pacote e iria à rede).
      transport.mod = { getRelaySockets: () => ({ a, b }), subscribe: (sub, topic) => JSON.stringify(["REQ", sub, { "#x": [topic] }]) };
      transport.room = { leave: async () => {} };
      assert.equal(transport.signalingUp(), false, "conectando");
      assert.equal(transport.lastInboundAt(), null);
      a.readyState = 1;
      a.dispatchEvent(new Event("open"));
      assert.equal(transport.signalingUp(), true);
      assert.equal(transport.lastInboundAt(), 1000, "a abertura do socket é sinal de vida");
      now = 6500;
      transport.signalingUp();
      assert.equal(a.sent.length, 0, "relay ouvido há menos de 6 s: sem sonda");
      now = 7100;
      transport.signalingUp();
      assert.equal(a.sent.length, 1);
      assert.equal(b.sent.length, 0, "só os sockets abertos");
      const [kind, sub] = a.sent[0];
      assert.equal(kind, "REQ");
      assert.match(sub, /^bob-sonda-/);
      now = 9000;
      transport.signalingUp();
      assert.equal(a.sent.length, 1, "uma rodada por 6 s");
      a.dispatchEvent(message(["EOSE", sub]));
      assert.equal(transport.lastInboundAt(), 9000, "a resposta do relay renova");
      // b também abre (a rodada seguinte vai aos dois) e recusa a sonda: nunca mais é sondado.
      b.readyState = 1;
      now = 15_100;
      transport.signalingUp();
      assert.equal(a.sent.length, 2);
      assert.equal(b.sent.length, 1);
      b.dispatchEvent(message(["CLOSED", sub, "rate-limited: devagar"]));
      assert.equal(transport.lastInboundAt(), 15_100);
      now = 21_200;
      transport.signalingUp();
      assert.equal(a.sent.length, 3);
      assert.equal(b.sent.length, 1, "quem fechou a sonda não recebe outra");
      // Outro tráfego qualquer (anúncio de alguém) também conta e adia a sonda.
      now = 30_000;
      a.dispatchEvent(message(["EVENT", "x", { content: "{}" }]));
      now = 35_000;
      transport.signalingUp();
      assert.equal(a.sent.length, 3);
      assert.equal(transport.lastInboundAt(), 30_000);
      await transport.close();
      now = 40_000;
      a.dispatchEvent(message(["EOSE", sub]));
      assert.equal(transport.lastInboundAt(), 30_000, "fechado, o ouvinte saiu");
      assert.equal(transport.signalingUp(), false);
    } finally {
      delete performance.now;
    }
  });
});

describe("ts-loader", () => {
  test("import.meta.url vira a URL do arquivo; room/cpu-sim.ts (que cria Worker) carrega aqui e num worker_threads", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bob-loader-"));
    try {
      const file = join(dir, "aqui.ts");
      writeFileSync(file, "export const here: string = import.meta.url;\nexport const both = [import.meta.url, import.meta.url];\n");
      const mod = createRequire(file)(file);
      assert.equal(mod.here, pathToFileURL(file).href);
      assert.deepEqual(mod.both, [mod.here, mod.here]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(typeof loadTs("app/bobonline/room/cpu-sim.ts").simulateCpuMatch, "function");
    const loader = pathToFileURL(join(ROOT, "tests", "helpers", "ts-loader.mjs")).href;
    const worker = new Worker(
      `const { parentPort, workerData } = require("node:worker_threads");
      import(workerData.loader)
        .then(({ loadTs }) => parentPort.postMessage(typeof loadTs("app/bobonline/room/cpu-sim.ts").simulateCpuMatch))
        .catch((error) => parentPort.postMessage(String(error)));`,
      { eval: true, workerData: { loader } },
    );
    const answer = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    await worker.terminate();
    assert.equal(answer, "function");
  });
});

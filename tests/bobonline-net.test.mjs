// Rede do Bobonline, a parte de baixo (revisão de conexão de 2026-11-01): a estratégia Nostr vendorizada
// (relógio, since folgado, portão pré-EOSE, sockets com kick e vigia), o transporte Trystero por cima
// dela, o net.json (relays, desvio do relógio, TURN de reserva, nova busca com relays presos), a escada
// de ciclo de vida sozinho e o diagnóstico. Sem rede: WebSocket e RTCPeerConnection falsos.
// Nunca imprime usuário/senha do TURN: comparações com o TURN embutido são por referência.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { schnorr } from "@noble/secp256k1";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

const storage = stubBrowser();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// O core do Trystero liga beforeunload no global (navegador); no Node não existe.
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

// ---------------------------------------------------------------------------
// WebSocket falso (o global; a estratégia e o diagnóstico o pegam na hora de discar)
// ---------------------------------------------------------------------------

class FakeWS {
  static all = [];
  /** Diagnóstico: abre sozinho e responde EOSE a todo REQ. */
  static auto = false;
  constructor(url) {
    this.url = url.endsWith("/") ? url : `${url}/`;
    this.readyState = 0;
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    FakeWS.all.push(this);
    if (FakeWS.auto) setTimeout(() => this.open(), 1);
  }
  send(data) {
    if (this.readyState !== 1) throw new Error("socket não está aberto");
    const frame = JSON.parse(data);
    this.sent.push(frame);
    if (FakeWS.auto && frame[0] === "REQ") setTimeout(() => this.receive(["EOSE", frame[1]]), 1);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(frame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  /** Queda vinda do servidor/rede. */
  drop() {
    this.readyState = 3;
    this.onclose?.({});
  }
  of(type) {
    return this.sent.filter((frame) => frame[0] === type);
  }
}
globalThis.WebSocket = FakeWS;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, ms = 3000) {
  const end = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("esperou demais");
    await sleep(5);
  }
}

/** performance.now controlável (a estratégia, o transporte e o net-config leem a cada chamada). */
function fakeMono(start = 1_000_000) {
  const clock = { now: start };
  Object.defineProperty(performance, "now", { value: () => clock.now, configurable: true, writable: true });
  return { clock, restore: () => delete performance.now };
}

const strategy = loadTs("app/bobonline/net/nostr-strategy.ts");
const netConfig = loadTs("app/bobonline/net/net-config.ts");
const { createTrysteroTransport, trysteroConfig } = loadTs("app/bobonline/net/trystero-transport.ts");
const { BobLifecycle } = loadTs("app/bobonline/net/lifecycle.ts");
const { createMemoryHub } = loadTs("app/bobonline/net/memory-transport.ts");
const diagnostics = loadTs("app/bobonline/net/diagnostics.ts");

// ---------------------------------------------------------------------------
// Estratégia Nostr vendorizada
// ---------------------------------------------------------------------------

describe("estratégia Nostr: relógio e portão pré-EOSE", () => {
  test("passesReplayGate: antes do EOSE só o que é mais novo que o REQ − 10 s; depois do EOSE, tudo; o tempo sozinho não abre", () => {
    const { passesReplayGate, REPLAY_SLACK_S } = strategy;
    const gate = { subscribedAtSec: 1000, requestedAtMs: 50_000, pendingEose: 1, overdueSeen: false };
    assert.equal(passesReplayGate(1000 - REPLAY_SLACK_S, gate), true, "no limite passa");
    assert.equal(passesReplayGate(1000 - REPLAY_SLACK_S - 1, gate), false, "repetição guardada cai");
    assert.equal(passesReplayGate(990 - 600, gate), false, "oferta de 10 min atrás cai");
    assert.equal(passesReplayGate(undefined, gate), false, "sem created_at antes do EOSE cai");
    assert.equal(passesReplayGate(1300, gate), true, "remetente adiantado passa");
    assert.equal(passesReplayGate(100, { ...gate, pendingEose: 0 }), true, "depois do EOSE: ao vivo de qualquer relógio");
    assert.equal(passesReplayGate(100, undefined), true, "sem portão (assinatura desconhecida) não filtra");
    assert.equal(passesReplayGate.length, 2, "nada de relógio na hora do quadro");
  });

  test("EOSE implícito é do vigia: passo em dia 5 s depois do REQ abre; passo atrasado só marca e o seguinte abre", () => {
    const { passesReplayGate, settleOverdueGates, IMPLIED_EOSE_MS } = strategy;
    const fresh = () => ({ subscribedAtSec: 1000, requestedAtMs: 50_000, pendingEose: 1, overdueSeen: false });
    const stale = 1000 - 120;
    // (a) Página rodando normal: o passo em dia depois do prazo abre (relay que nunca manda EOSE).
    const a = fresh();
    settleOverdueGates([a], 50_000 + IMPLIED_EOSE_MS - 1, false);
    assert.equal(passesReplayGate(stale, a), false, "antes do prazo segue fechado");
    settleOverdueGates([a], 50_000 + IMPLIED_EOSE_MS, false);
    assert.equal(passesReplayGate(stale, a), true, "passo em dia no prazo: EOSE implícito");
    // (b) Logo depois de congelar (passo atrasado): só marca; o que estava no buffer ainda cai; o passo seguinte abre.
    const b = fresh();
    settleOverdueGates([b], 50_000 + 60_000, true);
    assert.equal(b.overdueSeen, true);
    assert.equal(passesReplayGate(stale, b), false, "repetição velha do buffer, processada depois do passo atrasado, cai");
    settleOverdueGates([b], 50_000 + 61_000, true);
    assert.equal(passesReplayGate(stale, b), true, "segundo passo (mesmo atrasado): abre");
    // (c) Sem passo nenhum (congelada), mesmo 30 s depois do REQ: cai.
    const c = fresh();
    assert.equal(passesReplayGate(stale, c), false);
    // Portão sem EOSE pendente não é tocado; REQ novo rearma a marca.
    const done = { ...fresh(), pendingEose: 0 };
    settleOverdueGates([done], 99_000_000, false);
    assert.deepEqual(done, { ...fresh(), pendingEose: 0 });
  });

  test("since = now − 900 e created_at descontam o desvio do relógio; o evento segue o formato do Trystero", async () => {
    const { subscribe, createEvent, setClockOffset, SINCE_SLACK_S } = strategy;
    try {
      const nowSec = () => Math.floor(Date.now() / 1000);
      let [type, sub, filter] = JSON.parse(subscribe("sub-1", "topico"));
      assert.equal(type, "REQ");
      assert.equal(sub, "sub-1");
      assert.ok(Math.abs(filter.since - (nowSec() - SINCE_SLACK_S)) <= 1);
      assert.deepEqual(filter["#x"], ["topico"]);
      assert.ok(filter.kinds[0] >= 20000 && filter.kinds[0] < 30000, "kind efêmero");
      setClockOffset(120_000); // este aparelho 2 min adiantado
      [, , filter] = JSON.parse(subscribe("sub-1", "topico"));
      assert.ok(Math.abs(filter.since - (nowSec() - 120 - SINCE_SLACK_S)) <= 1);
      const [msgType, event] = JSON.parse(await createEvent("topico", "{\"a\":1}"));
      assert.equal(msgType, "EVENT");
      assert.ok(Math.abs(event.created_at - (nowSec() - 120)) <= 1, "created_at na hora certa, não na do aparelho");
      assert.deepEqual(event.tags, [["x", "topico"]]);
      assert.equal(event.kind, filter.kinds[0]);
      assert.equal(event.content, "{\"a\":1}");
      // id = sha256 da serialização NIP-01; assinatura Schnorr confere (fio igual ao do Trystero sem patch).
      const serial = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
      const id = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serial)));
      const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      assert.equal(event.id, hex(id));
      const fromHex = (text) => Uint8Array.from(text.match(/../g).map((pair) => parseInt(pair, 16)));
      assert.equal(await schnorr.verifyAsync(fromHex(event.sig), id, fromHex(event.pubkey)), true);
    } finally {
      setClockOffset(0);
    }
  });
});

describe("estratégia Nostr: sockets (backoff, kick, pausa)", () => {
  test("queda espera random(0..período); kick religa já e zera o backoff; CONNECTING travado é rediscado; pausa segura até o resume", () => {
    const { makeRelaySocket, pauseRelayReconnection, resumeRelayReconnection, resetRelaysForTests } = strategy;
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    mock.method(Math, "random", () => 0.5);
    const mono = fakeMono();
    try {
      FakeWS.all = [];
      const frames = [];
      let reconnects = 0;
      const client = makeRelaySocket("wss://c.test", (data) => frames.push(data), () => (reconnects += 1));
      assert.equal(FakeWS.all.length, 1);
      assert.equal(client.lastInboundAt, null);
      FakeWS.all[0].open();
      assert.equal(client.lastInboundAt, mono.clock.now, "a abertura é sinal de vida");
      mono.clock.now += 500;
      FakeWS.all[0].receive(["NOTICE", "oi"]);
      assert.equal(client.lastInboundAt, mono.clock.now);
      assert.deepEqual(frames, [JSON.stringify(["NOTICE", "oi"])]);
      // Queda: espera 0,5 × 3333 ms.
      FakeWS.all[0].drop();
      mock.timers.tick(1600);
      assert.equal(FakeWS.all.length, 1);
      mock.timers.tick(100);
      assert.equal(FakeWS.all.length, 2, "religou no backoff");
      // Falha ao abrir: o período dobrou (6,6 s → espera 3,3 s), mas o kick não espera.
      FakeWS.all[1].drop();
      mock.timers.tick(1000);
      assert.equal(FakeWS.all.length, 2);
      client.kick(mono.clock.now);
      assert.equal(FakeWS.all.length, 3, "kick: disca já");
      mock.timers.tick(10_000);
      assert.equal(FakeWS.all.length, 3, "o timer antigo foi cancelado");
      FakeWS.all[2].open();
      assert.equal(reconnects, 1, "reabertura chama onReconnect");
      // Socket preso em CONNECTING: só depois de 12 s o kick rediscaria.
      FakeWS.all[2].drop();
      mock.timers.tick(2000); // período voltou a 3,3 s ao abrir: 1,67 s
      assert.equal(FakeWS.all.length, 4);
      client.kick(mono.clock.now + 5000);
      assert.equal(FakeWS.all.length, 4, "CONNECTING há pouco: deixa");
      client.kick(mono.clock.now + 12_000);
      assert.equal(FakeWS.all.length, 5, "CONNECTING há 12 s: larga e disca outro");
      assert.equal(FakeWS.all[3].onclose, null, "o largado não religa sozinho depois");
      FakeWS.all[4].open();
      // Pausa: a queda espera o resume (kick também), como a trava do core.
      pauseRelayReconnection();
      FakeWS.all[4].drop();
      mock.timers.tick(120_000);
      client.kick(mono.clock.now);
      assert.equal(FakeWS.all.length, 5, "pausado: nada disca");
      resumeRelayReconnection();
      assert.equal(FakeWS.all.length, 6, "resume disca já");
      FakeWS.all[5].open();
      // close (relay aposentado): nunca mais disca.
      client.close();
      mock.timers.tick(120_000);
      client.kick(mono.clock.now);
      assert.equal(FakeWS.all.length, 6);
      assert.equal(client.isClosed, true);
    } finally {
      resetRelaysForTests();
      mono.restore();
      mock.restoreAll();
      mock.timers.reset();
    }
  });

  test("kickRelays sonda os abertos (morto em 4 s sem resposta nenhuma); passo atrasado (página congelada) reenvia em vez de julgar", () => {
    const { makeRelaySocket, kickRelays, checkRelays, relayHealth, lastInboundAt, resetRelaysForTests, KICK_PROBE_TIMEOUT_MS } = strategy;
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const mono = fakeMono();
    try {
      FakeWS.all = [];
      const a = makeRelaySocket("wss://a.test", () => {});
      const b = makeRelaySocket("wss://b.test", () => {});
      FakeWS.all[0].open();
      FakeWS.all[1].open();
      assert.deepEqual(relayHealth(), { total: 2, open: 2, fresh: 2 });
      kickRelays();
      const probeA = FakeWS.all[0].of("REQ")[0];
      assert.ok(probeA, "sonda no a");
      assert.match(probeA[1], /^bob-sonda-/);
      assert.equal(FakeWS.all[1].of("REQ").length, 1);
      mono.clock.now += 300;
      FakeWS.all[1].receive(["EOSE", probeA[1]]); // b responde
      for (let step = 1; step <= 3; step += 1) {
        mono.clock.now += 1000;
        checkRelays(mono.clock.now);
      }
      assert.equal(FakeWS.all.length, 2, "dentro do prazo");
      mono.clock.now += KICK_PROBE_TIMEOUT_MS - 3300;
      checkRelays(mono.clock.now);
      assert.equal(FakeWS.all.length, 3, "a calado na sonda: largado e rediscado já");
      assert.equal(FakeWS.all[2].url, "wss://a.test/");
      assert.equal(a.socket, FakeWS.all[2]);
      assert.equal(b.socket, FakeWS.all[1], "b respondeu: fica");
      assert.deepEqual(relayHealth(), { total: 2, open: 1, fresh: 1 });
      FakeWS.all[2].open();
      assert.equal(lastInboundAt(), mono.clock.now);
      mono.clock.now += 100;
      // Página congelada: a sonda venceu, mas o passo veio 20 s atrasado → reenvia em vez de julgar.
      kickRelays();
      mono.clock.now += 20_000;
      checkRelays(mono.clock.now);
      assert.equal(FakeWS.all.length, 3, "passo atrasado não julga");
      assert.equal(FakeWS.all[2].of("REQ").length, 2, "sonda reenviada");
      // Fresco = recebeu algo em 20 s; os dois estão calados há 20 s.
      assert.deepEqual(relayHealth(mono.clock.now + 1), { total: 2, open: 2, fresh: 0 });
    } finally {
      resetRelaysForTests();
      mono.restore();
      mock.timers.reset();
    }
  });

  test("chute periódico (force: false) não zera o backoff: relay que segue falhando com chute a cada 10 s disca ~1 vez a cada 30–60 s; o forçado disca já", () => {
    const { makeRelaySocket, resetRelaysForTests } = strategy;
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    mock.method(Math, "random", () => 0.999); // o timer espera o período quase inteiro: quem adianta é o chute
    const mono = fakeMono();
    const failNew = () => FakeWS.all.filter((socket) => socket.readyState === 0).forEach((socket) => socket.drop());
    const dialsIn = (minutes, force) => {
      FakeWS.all = [];
      const client = makeRelaySocket("wss://r.test", () => {});
      failNew();
      for (let second = 10; second <= minutes * 60; second += 10) {
        mono.clock.now += 10_000;
        mock.timers.tick(10_000);
        failNew();
        client.kick(mono.clock.now, force);
        failNew();
      }
      const dials = FakeWS.all.length;
      client.close();
      return { client, dials };
    };
    try {
      const periodic = dialsIn(10, false);
      // Backoff original (3,3 s dobrando até 60 s, espera aleatória de até um período) em 10 min: ~15–25 discagens.
      assert.ok(periodic.dials <= 25, `chute periódico discou ${periodic.dials} vezes em 10 min`);
      assert.ok(periodic.dials >= 8, `o backoff parou de discar (${periodic.dials})`);
      const forced = dialsIn(10, true);
      assert.ok(forced.dials >= 60, `o chute forçado disca a cada chute (${forced.dials})`);
      // Forçado depois de um tempo só de periódicos: disca na hora.
      FakeWS.all = [];
      const client = makeRelaySocket("wss://s.test", () => {});
      failNew();
      mono.clock.now += 1000;
      client.kick(mono.clock.now, false);
      assert.equal(FakeWS.all.length, 1, "periódico 1 s depois da falha: espera o backoff");
      client.kick(mono.clock.now, true);
      assert.equal(FakeWS.all.length, 2, "forçado: disca já");
    } finally {
      resetRelaysForTests();
      mono.restore();
      mock.restoreAll();
      mock.timers.reset();
    }
  });
});

describe("estratégia Nostr: sala de verdade sobre sockets falsos", () => {
  test("REQ com since folgado; anúncio no formato do Trystero; portão pré-EOSE; sonda tratada em casa; vigia larga o calado; sinal de outro aparelho", async () => {
    const { joinRoom, kickRelays, checkRelays, relayHealth, lastPeerEventAt, SINCE_SLACK_S, SILENT_PROBE_MS, PROBE_TIMEOUT_MS, resetRelaysForTests } = strategy;
    const warnings = [];
    const warn = mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
    FakeWS.all = [];
    const config = { appId: "bob-net-teste", relayConfig: { urls: ["wss://a.test", "wss://b.test"], manualReconnection: true } };
    const room = joinRoom(config, "K7MPX3");
    try {
      assert.equal(FakeWS.all.length, 2);
      const [a, b] = FakeWS.all;
      a.open();
      b.open();
      await until(() => a.of("REQ").length > 0 && a.of("EVENT").length > 0);
      const [, subId, filter] = a.of("REQ")[0];
      const nowSec = Math.floor(Date.now() / 1000);
      assert.ok(Math.abs(filter.since - (nowSec - SINCE_SLACK_S)) <= 2, "since folgado");
      assert.equal(filter["#x"].length, 2, "tópico da sala e o próprio");
      const [topic] = filter["#x"];
      const [, announce] = a.of("EVENT")[0];
      assert.equal(announce.tags[0][0], "x");
      assert.ok(filter["#x"].includes(announce.tags[0][1]));
      assert.ok(Math.abs(announce.created_at - nowSec) <= 2);
      const body = JSON.parse(announce.content);
      assert.equal(typeof body.peerId, "string");
      assert.equal(typeof body.nonce, "string");
      const other = "f".repeat(64);
      const event = (createdAt, pubkey = other) => ["EVENT", subId, { content: "{}", tags: [["x", topic]], created_at: createdAt, pubkey, kind: filter.kinds[0] }];

      // Antes do EOSE: a repetição velha do relay cai.
      a.receive(event(nowSec - 120));
      assert.equal(lastPeerEventAt(), null, "repetição guardada não conta");
      a.receive(["EOSE", subId]);
      // Depois do EOSE: ao vivo de um aparelho 5 min atrasado passa.
      a.receive(event(nowSec - 300));
      const heard = lastPeerEventAt();
      assert.equal(typeof heard, "number", "evento de outro aparelho entregue");
      await sleep(3);
      a.receive(event(nowSec, announce.pubkey));
      assert.equal(lastPeerEventAt(), heard, "o eco do próprio anúncio não conta");

      // Sonda: EOSE → CLOSE; CLOSED (até "blocked:") não chega ao Trystero (nem aviso, nem aposentadoria).
      kickRelays();
      const probe = a.of("REQ").find((frame) => frame[1].startsWith("bob-sonda-"));
      assert.ok(probe);
      a.receive(["EOSE", probe[1]]);
      assert.deepEqual(a.of("CLOSE").at(-1), ["CLOSE", probe[1]]);
      b.receive(["CLOSED", probe[1], "blocked: kind não permitido"]);
      b.receive(["CLOSED", probe[1], "rate-limited: devagar"]);
      assert.deepEqual(warnings, [], "o tratamento de erro do relay não viu a sonda");
      assert.equal(relayHealth().open, 2, "nenhum relay aposentado pela sonda");
      // Um CLOSED de verdade (assinatura do Trystero) ainda vai para o Trystero.
      b.receive(["CLOSED", b.of("REQ")[0][1], "error: teste"]);
      assert.equal(warnings.length, 1);

      // Vigia: calados há 15 s com sala aberta → sonda; quem não responde em 5 s é largado e rediscado.
      const mono = fakeMono(performance.now());
      try {
        const t0 = mono.clock.now;
        mono.clock.now = t0 + SILENT_PROBE_MS + 10;
        checkRelays(mono.clock.now - 1000);
        checkRelays(mono.clock.now);
        const before = { a: a.of("REQ").length, b: b.of("REQ").length };
        assert.ok(before.a >= 2 && before.b >= 2, "sonda dos calados");
        mono.clock.now += 100;
        b.receive(["EOSE", "qualquer"]); // qualquer quadro depois da sonda vale como resposta
        for (let step = 1; step <= PROBE_TIMEOUT_MS / 1000; step += 1) checkRelays(mono.clock.now + step * 1000);
        assert.equal(FakeWS.all.length, 3, "a largado");
        const a2 = FakeWS.all[2];
        assert.equal(a2.url, "wss://a.test/");
        a2.open();
        // Reabriu: assina de novo (mesmo subId, since folgado) e repete o anúncio.
        await until(() => a2.of("REQ").length > 0 && a2.of("EVENT").length > 0);
        assert.equal(a2.of("REQ")[0][1], subId);
        // O portão do socket novo: repetição velha cai de novo até o EOSE.
        const heardBefore = lastPeerEventAt();
        a2.receive(event(nowSec - 120));
        assert.equal(lastPeerEventAt(), heardBefore);
        // Congelada logo depois do REQ: 30 s sem passo do vigia, e a repetição guardada que estava no
        // buffer chega antes do EOSE. O tempo vencido sozinho não abre o portão.
        mono.clock.now += 30_000;
        a2.receive(event(nowSec - 120));
        assert.equal(lastPeerEventAt(), heardBefore, "repetição velha passou 30 s depois do REQ sem EOSE");
        // O primeiro passo depois do congelamento está atrasado: só marca; o buffer ainda cai.
        checkRelays(mono.clock.now);
        a2.receive(event(nowSec - 120));
        assert.equal(lastPeerEventAt(), heardBefore, "passo atrasado abriu o portão");
        // O passo seguinte (em dia) abre: relay sem EOSE, ao vivo de qualquer relógio passa.
        mono.clock.now += 1000;
        checkRelays(mono.clock.now);
        a2.receive(event(nowSec - 120));
        assert.notEqual(lastPeerEventAt(), heardBefore, "o EOSE implícito não veio no passo em dia");
        // Na pausa (APK em segundo plano) ainda sonda, mas não larga ninguém: espera a volta.
        strategy.pauseRelayReconnection();
        const t1 = mono.clock.now + SILENT_PROBE_MS + 50;
        checkRelays(t1 - 1000);
        checkRelays(t1);
        assert.ok(a2.of("REQ").some((frame) => frame[1].startsWith("bob-sonda-")), "pausado: sonda");
        const sockets = FakeWS.all.length;
        for (let step = 1; step <= 6; step += 1) checkRelays(t1 + step * 1000);
        assert.equal(FakeWS.all.length, sockets, "pausado: não larga");
        strategy.resumeRelayReconnection();
      } finally {
        mono.restore();
      }
    } finally {
      await room.leave();
      warn.mock.restore();
      resetRelaysForTests();
    }
  });
});

// ---------------------------------------------------------------------------
// Transporte Trystero
// ---------------------------------------------------------------------------

describe("transporte Trystero", () => {
  const cfg = { version: 1, nostrRelays: ["wss://a.test"], turn: [{ urls: ["turn:t.exemplo:3478?transport=udp", "turn:t.exemplo:3478?transport=tcp"], username: "u", credential: "c" }] };

  test("trysteroConfig: só-relay mantém o STUN padrão e o TURN; sem TURN a política é ignorada; reconexão manual", () => {
    const plain = trysteroConfig(cfg, "K7MPX3");
    assert.equal(plain.rtcConfig, undefined, "sem rtcConfig: o Trystero usa STUN padrão + TURN");
    assert.deepEqual(plain.relayConfig, { urls: ["wss://a.test"], manualReconnection: true });
    assert.equal(plain.turnConfig, cfg.turn);
    assert.equal(plain.password, "K7MPX3");
    const relay = trysteroConfig(cfg, "K7MPX3", "relay");
    assert.deepEqual(relay.rtcConfig, { iceTransportPolicy: "relay" }, "sem iceServers: não substitui o padrão");
    assert.equal(relay.turnConfig, cfg.turn);
    const noTurn = trysteroConfig({ version: 1, nostrRelays: ["wss://a.test"] }, "K7MPX3", "relay");
    assert.equal(noTurn.rtcConfig, undefined, "só-relay sem TURN não teria candidato nenhum");
    const own = trysteroConfig({ ...cfg, iceServers: [{ urls: "stun:s.exemplo:3478" }] }, "K7MPX3", "relay");
    assert.deepEqual(own.rtcConfig, { iceServers: [{ urls: "stun:s.exemplo:3478" }], iceTransportPolicy: "relay" });
    assert.deepEqual(trysteroConfig({ version: 1, redundancy: 3 }, "K7MPX3").relayConfig, { redundancy: 3, manualReconnection: true });
  });

  test("signalingUp = algum relay fresco; peerSignalAt só desde o último open; kick e saúde passam pela estratégia", async () => {
    const transport = createTrysteroTransport(cfg);
    assert.deepEqual(transport.relayHealth(), { total: 1, open: 0, fresh: 0 }, "antes de carregar: só o total");
    assert.equal(transport.signalingUp(), false);
    const fake = {
      health: { total: 3, open: 2, fresh: 0 },
      inbound: 500,
      peerAt: null,
      kicks: 0,
      relayHealth: () => fake.health,
      lastInboundAt: () => fake.inbound,
      lastPeerEventAt: () => fake.peerAt,
      kickRelays: () => (fake.kicks += 1),
    };
    // O módulo e a sala no lugar (o open de verdade importaria a estratégia).
    transport.mod = fake;
    transport.room = { leave: async () => {}, getPeers: () => ({}) };
    transport.openedAt = 1000;
    assert.equal(transport.signalingUp(), false, "abertos mas nenhum fresco");
    fake.health = { total: 3, open: 2, fresh: 1 };
    assert.equal(transport.signalingUp(), true);
    assert.equal(transport.lastInboundAt(), 500);
    assert.deepEqual(transport.relayHealth(), { total: 3, open: 2, fresh: 1 });
    fake.peerAt = 900;
    assert.equal(transport.peerSignalAt(), null, "sinal de antes do open é de outra tentativa");
    fake.peerAt = 1500;
    assert.equal(transport.peerSignalAt(), 1500);
    transport.kickSignaling();
    assert.equal(fake.kicks, 1);
    transport.setIcePolicy("relay");
    assert.equal(transport.icePolicy, "relay", "vale no próximo open");
    await transport.close();
    assert.equal(transport.signalingUp(), false, "fechado");
  });

  test("linkInfo: o par passa pelo TURN se qualquer ponta é relay (o lado sem relay não diz 'direto')", async () => {
    const transport = createTrysteroTransport(cfg);
    const statsOf = (local, remote) => new Map([
      ["t", { type: "transport", selectedCandidatePairId: "p" }],
      ["p", { type: "candidate-pair", localCandidateId: "l", remoteCandidateId: "r", currentRoundTripTime: 0.4213 }],
      ["l", { type: "local-candidate", candidateType: local }],
      ["r", { type: "remote-candidate", candidateType: remote }],
    ]);
    let stats = statsOf("srflx", "relay");
    transport.room = { leave: async () => {}, getPeers: () => ({ par: { getStats: async () => stats } }) };
    assert.deepEqual(await transport.linkInfo("par"), { candidate: "relay", rttMs: 421 }, "local srflx, remoto no TURN");
    stats = statsOf("relay", "prflx");
    assert.deepEqual(await transport.linkInfo("par"), { candidate: "relay", rttMs: 421 });
    stats = statsOf("host", "prflx");
    assert.deepEqual(await transport.linkInfo("par"), { candidate: "host", rttMs: 421 });
    assert.deepEqual(await transport.linkInfo("outro"), { candidate: "unknown", rttMs: null });
  });

  test("a pausa da estratégia é da página: o transporte novo abre no estado dele e solta o relay que caiu na pausa da sala anterior", async () => {
    const { makeRelaySocket, resetRelaysForTests } = strategy;
    FakeWS.all = [];
    // (A sala anterior: busca que desistiu com o app em segundo plano; o relay caiu durante a pausa.)
    const client = makeRelaySocket("wss://p.test", () => {});
    FakeWS.all[0].open();
    const before = createTrysteroTransport(cfg);
    before.pauseSignaling(); // sem módulo carregado: só a marca; a estratégia pausa no open
    before.open({ code: "K7MPX3" });
    try {
      await until(() => before.mod !== null);
      FakeWS.all[0].drop();
      await sleep(20);
      assert.equal(FakeWS.all.length, 1, "pausado: espera o resume");
      await before.close();
      // "Tentar de novo": sessão e transporte novos, sem pausa.
      const next = createTrysteroTransport(cfg);
      next.open({ code: "K7MPX3" });
      await until(() => FakeWS.all.length === 2, 2000);
      assert.equal(FakeWS.all[1].url, "wss://p.test/", "o relay que caiu na pausa foi discado no open");
      await next.close();
      // E um transporte que abre já pausado (aba congelada) segura de novo.
      const paused = createTrysteroTransport(cfg);
      paused.pauseSignaling();
      paused.open({ code: "K7MPX3" });
      await until(() => paused.mod !== null);
      FakeWS.all[1].drop();
      await sleep(30);
      assert.equal(FakeWS.all.length, 2, "aberto pausado: nada disca");
      paused.resumeSignaling();
      assert.equal(FakeWS.all.length, 3);
      await paused.close();
      assert.equal(client.isClosed, false);
    } finally {
      resetRelaysForTests();
    }
  });
});

// ---------------------------------------------------------------------------
// net.json
// ---------------------------------------------------------------------------

describe("net.json: relays, relógio, TURN de reserva, nova busca", () => {
  test("lista de relays: arquivo = embutida, 11, sem relay.layer.systems, com os quatro novos", () => {
    const file = JSON.parse(readFileSync(join(ROOT, "public/bobonline/net.json"), "utf8"));
    assert.deepEqual(file.nostrRelays, netConfig.DEFAULT_NET_CONFIG.nostrRelays);
    assert.equal(file.nostrRelays.length, 11);
    assert.equal(new Set(file.nostrRelays).size, 11);
    assert.ok(!file.nostrRelays.includes("wss://relay.layer.systems"));
    for (const url of ["wss://relay.ditto.pub", "wss://relay.grigic.org", "wss://nostr-pub.wellorder.net", "wss://relay.primal.net"]) {
      assert.ok(file.nostrRelays.includes(url), url);
    }
    assert.ok(file.turn === undefined || Array.isArray(file.turn));
    assert.ok(netConfig.DEFAULT_NET_CONFIG.turn?.length, "TURN embutido presente");
  });

  test("clockOffsetFromDate: meio do pedido contra Date + 500 ms; sem Date legível, null", () => {
    const { clockOffsetFromDate } = netConfig;
    const date = new Date(Date.UTC(2026, 10, 1, 12, 0, 0)).toUTCString();
    const server = Date.UTC(2026, 10, 1, 12, 0, 0) + 500;
    assert.equal(clockOffsetFromDate(date, server - 100, server + 100), 0);
    assert.equal(clockOffsetFromDate(date, server + 29_900, server + 30_100), 30_000, "30 s adiantado");
    assert.equal(clockOffsetFromDate(date, server - 125_000, server - 115_000), -120_000, "2 min atrasado");
    assert.equal(clockOffsetFromDate(null, 0, 1), null);
    assert.equal(clockOffsetFromDate("lixo", 0, 1), null);
    assert.equal(clockOffsetFromDate(date, 10, 5), null, "resposta antes do pedido: relógio pulou");
  });

  test("loadNetConfig: mede o relógio, completa o TURN, busca de novo depois de 60 s com os relays presos e fica com a anterior se a nova falhar", async () => {
    const mono = fakeMono(5_000_000);
    // Date.now anda junto com o monotônico; `wall.jump` é a pessoa mexendo na hora do aparelho.
    const wall = { start: Date.now(), jump: 0 };
    const dateNow = mock.method(Date, "now", () => wall.start + (mono.clock.now - 5_000_000) + wall.jump);
    try {
      storage.clear();
      const answer = (body, { dateOffsetMs = null, ok = true } = {}) => async () => ({
        ok,
        headers: { get: (name) => (name.toLowerCase() === "date" && dateOffsetMs !== null ? new Date(Date.now() - dateOffsetMs).toUTCString() : null) },
        json: async () => body,
      });
      const never = async () => { throw new Error("não busca"); };
      assert.equal(netConfig.netClockOffsetMs(), null, "nada medido ainda");
      assert.equal(netConfig.netConfigSource(), null);
      // Sem TURN no arquivo (cache de antes do TURN existir): usa o embutido.
      const first = { version: 1, nostrRelays: ["wss://r1.test", "wss://r2.test"], latestProtocol: 1 };
      const got = await netConfig.loadNetConfig({ fetch: answer(first, { dateOffsetMs: 120_000 }) });
      assert.deepEqual(got.nostrRelays, first.nostrRelays);
      assert.ok(got.turn === netConfig.DEFAULT_NET_CONFIG.turn, "TURN embutido na falta");
      assert.equal(netConfig.netConfigSource(), "rede");
      const offset = netConfig.netClockOffsetMs();
      assert.ok(Math.abs(offset - 120_000) <= 1600, `relógio 2 min adiantado (${offset})`);
      // Relógio errado medido: a sala seguinte busca de novo mesmo antes de 60 s (a pessoa pode ter
      // acertado a hora). TURN novo chega; relays ficam os da primeira; sem Date legível, fica a medida.
      mono.clock.now += 10_000;
      const rotated = { version: 1, nostrRelays: ["wss://outro.test"], turn: [{ urls: "turn:novo.exemplo:3478" }] };
      const second = await netConfig.loadNetConfig({ fetch: answer(rotated) });
      assert.deepEqual(second.turn, rotated.turn);
      assert.deepEqual(second.nostrRelays, first.nostrRelays, "relays presos (o Trystero só lê os primeiros)");
      assert.ok(Math.abs(netConfig.netClockOffsetMs() - 120_000) <= 1600, "sem Date legível (APK): fica a medida anterior");
      // A pessoa ativa a hora automática (o relógio volta 2 min) e volta ao app: mede de novo, desvio some.
      mono.clock.now += 10_000;
      wall.jump -= 120_000;
      const fixed = await netConfig.loadNetConfig({ fetch: answer(rotated, { dateOffsetMs: 0 }) });
      assert.ok(Math.abs(netConfig.netClockOffsetMs()) < netConfig.CLOCK_FIX_MIN_MS, `desvio velho ficou (${netConfig.netClockOffsetMs()})`);
      // Relógio certo, antes de 60 s: a mesma.
      mono.clock.now += 30_000;
      assert.equal(netConfig.loadNetConfig({ fetch: never }), netConfig.loadNetConfig());
      assert.equal(await netConfig.loadNetConfig(), fixed);
      // A hora do aparelho pulou desde a medida (mexeram, ou o aparelho dormiu): mede de novo, mesmo antes de 60 s.
      let fetched = 0;
      const counted = (body, options) => {
        const inner = answer(body, options);
        return async (...args) => {
          fetched += 1;
          return inner(...args);
        };
      };
      await netConfig.loadNetConfig({ fetch: counted(rotated, { dateOffsetMs: 0 }) });
      assert.equal(fetched, 0, "sem pulo: a mesma");
      wall.jump += 5000;
      const jumped = await netConfig.loadNetConfig({ fetch: counted(rotated, { dateOffsetMs: 0 }) });
      assert.equal(fetched, 1, "pulo do relógio não buscou de novo");
      assert.equal(netConfig.loadNetConfig({ fetch: never }), netConfig.loadNetConfig(), "medido de novo: volta a valer por 60 s");
      // Depois de 60 s, a nova busca falha: fica com a anterior desta página (não o cache, nem o padrão).
      mono.clock.now += 61_000;
      const third = await netConfig.loadNetConfig({ fetch: async () => { throw new Error("offline"); } });
      assert.equal(third, jumped);
      // Cache sem TURN também ganha o embutido (página nova: fresh).
      storage.clear();
      await netConfig.loadNetConfig({ fresh: true, fetch: answer(first) });
      const cached = await netConfig.loadNetConfig({ fresh: true, fetch: async () => { throw new Error("offline"); } });
      assert.deepEqual(cached.nostrRelays, first.nostrRelays);
      assert.ok(cached.turn === netConfig.DEFAULT_NET_CONFIG.turn, "cache sem TURN: embutido");
      // iceServers (controle total) fica como veio.
      const own = await netConfig.loadNetConfig({ fresh: true, fetch: answer({ version: 1, iceServers: [{ urls: "stun:s.exemplo:3478" }] }) });
      assert.equal(own.turn, undefined);
    } finally {
      dateNow.mock.restore();
      mono.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Ciclo de vida sozinho
// ---------------------------------------------------------------------------

function aloneSession({ signalingUp = true, linked = [] } = {}) {
  const calls = { rejoin: 0, kick: 0, softKick: 0, visible: [], pause: 0, resume: 0 };
  const session = {
    state: { signalingUp, linked, peerAt: null },
    calls,
    linked: () => session.state.linked,
    health: () => "lost",
    rejoin: async () => { calls.rejoin += 1; },
    setVisible: (visible) => calls.visible.push(visible),
    pauseSignaling: () => (calls.pause += 1),
    resumeSignaling: () => (calls.resume += 1),
    signalingUp: () => session.state.signalingUp,
    kickSignaling: (force = true) => {
      calls.kick += 1;
      if (!force) calls.softKick += 1;
    },
    peerSignalAt: () => session.state.peerAt,
  };
  return session;
}

function rig(session, extra = {}) {
  const hub = createMemoryHub();
  const doc = new EventTarget();
  doc.hidden = false;
  const win = new EventTarget();
  const lifecycle = new BobLifecycle({ session, isRunning: () => false, reload: () => assert.fail("sozinho nunca recarrega"), reloadSafe: async () => true, onLine: () => true, clock: hub.clock, doc, win, ...extra });
  lifecycle.start();
  const fire = (target, type, hidden) => {
    if (hidden !== undefined) doc.hidden = hidden;
    target.dispatchEvent(new Event(type));
  };
  return { hub, doc, win, lifecycle, fire };
}

describe("ciclo de vida: sozinho, kick, B8", () => {
  test("volta de ≥ 5 s escondida: kick já e um rejoin (rajada nova) assim que a sinalização está no ar; evento duplicado não repete", async () => {
    const session = aloneSession();
    const { hub, doc, win, fire, lifecycle } = rig(session);
    fire(doc, "visibilitychange", true);
    await hub.advance(6000);
    fire(doc, "visibilitychange", false);
    assert.equal(session.calls.kick, 1, "kick na hora");
    assert.equal(session.calls.rejoin, 1, "rajada nova na hora");
    await hub.advance(100);
    fire(doc, "resume");
    assert.equal(session.calls.kick, 2);
    await hub.advance(60_000);
    assert.equal(session.calls.rejoin, 1, "sinalização no ar: nada mais");
    fire(win, "online");
    assert.equal(session.calls.kick, 3, "online também chuta");
    // Escondida por pouco: sem rajada.
    fire(doc, "visibilitychange", true);
    await hub.advance(3000);
    fire(doc, "visibilitychange", false);
    await hub.advance(30_000);
    assert.equal(session.calls.rejoin, 1);
    lifecycle.dispose();
  });

  test("sinalização volta depois: a rajada sai quando sobe; outro aparelho negociando (sinal < 26 s, o prazo do Trystero) segura a rajada", async () => {
    const session = aloneSession({ signalingUp: false });
    const { hub, doc, fire } = rig(session);
    fire(doc, "visibilitychange", true);
    await hub.advance(20_000);
    fire(doc, "visibilitychange", false);
    assert.equal(session.calls.rejoin, 0);
    await hub.advance(2500);
    session.state.signalingUp = true;
    await hub.advance(1000);
    assert.equal(session.calls.rejoin, 1, "subiu: rajada no passo seguinte");
    await hub.advance(30_000);
    assert.equal(session.calls.rejoin, 1);

    const busy = aloneSession();
    const other = rig(busy);
    other.fire(other.doc, "visibilitychange", true);
    await other.hub.advance(8000);
    busy.state.peerAt = other.hub.now() - 3000;
    other.fire(other.doc, "visibilitychange", false);
    await other.hub.advance(30_000);
    assert.equal(busy.calls.rejoin, 0, "negociação em andamento: não reabre");
    assert.equal(busy.calls.kick, 1);

    // Sinal de 20 s atrás: o ICE que vai falhar ainda não deu o erro (23,3 s); reabrir agora o calaria.
    const slow = aloneSession();
    const third = rig(slow);
    third.fire(third.doc, "visibilitychange", true);
    await third.hub.advance(8000);
    slow.state.peerAt = third.hub.now() - 20_000;
    third.fire(third.doc, "visibilitychange", false);
    await third.hub.advance(30_000);
    assert.equal(slow.calls.rejoin, 0, "sinal de 20 s atrás: a negociação pode estar viva");
  });

  test("visível e sozinho: confere a cada 5 s; fora, kick e rejoin (um a cada 10 s); alguém ligou, o laço para", async () => {
    const session = aloneSession({ signalingUp: true });
    const { hub, doc, fire } = rig(session);
    fire(doc, "visibilitychange", true);
    fire(doc, "visibilitychange", false); // escondida 0 s: sem rajada
    await hub.advance(12_000);
    assert.equal(session.calls.rejoin, 0);
    session.state.signalingUp = false;
    const kicks = session.calls.kick;
    await hub.advance(5000);
    assert.equal(session.calls.rejoin, 1);
    assert.ok(session.calls.kick > kicks, "fora: kick");
    assert.equal(session.calls.softKick, session.calls.kick - kicks, "o chute da conferida é periódico (respeita o backoff)");
    await hub.advance(5000);
    assert.equal(session.calls.rejoin, 1, "no máximo um a cada 10 s");
    await hub.advance(5000);
    assert.equal(session.calls.rejoin, 2);
    session.state.linked = ["B"];
    await hub.advance(60_000);
    assert.equal(session.calls.rejoin, 2, "alguém ligou: o laço de sozinho acaba");

    // Offline: a conferida nem chuta (o "online" chuta com tudo quando a rede voltar), mas o rejoin segue.
    const offline = aloneSession({ signalingUp: false });
    let online = false;
    const off = rig(offline, { onLine: () => online });
    off.fire(off.doc, "visibilitychange", true);
    off.fire(off.doc, "visibilitychange", false);
    const forced = offline.calls.kick;
    await off.hub.advance(12_000);
    assert.equal(offline.calls.kick, forced, "offline: chutou");
    assert.ok(offline.calls.rejoin >= 1);
    online = true;
    off.fire(off.win, "online");
    assert.equal(offline.calls.kick, forced + 1);
    assert.equal(offline.calls.softKick, 0, "o chute do 'online' é forçado");
  });

  test("B8: resume com a aba ainda escondida não volta a presença; só o freeze pausa; pause sem hidden espera o visibilitychange", async () => {
    const session = aloneSession({ signalingUp: false });
    const { doc, fire } = rig(session);
    fire(doc, "visibilitychange", true);
    fire(doc, "freeze");
    assert.equal(session.calls.pause, 1, "freeze pausa a reconexão");
    assert.deepEqual(session.calls.visible, [false]);
    fire(doc, "resume"); // o Chrome descongelou, aba ainda escondida
    assert.deepEqual(session.calls.visible, [false], "continua bg");
    assert.equal(session.calls.resume, 1, "a página roda de novo: solta os relays");
    assert.equal(session.calls.kick, 1);
    fire(doc, "visibilitychange", false);
    assert.deepEqual(session.calls.visible, [false, true]);

    // pause do Capacitor antes do visibilitychange: espera; o hidden que chega conta uma vez só.
    const app = aloneSession();
    const native = rig(app);
    native.fire(native.doc, "pause");
    assert.equal(app.calls.pause, 0, "o pause do Capacitor não pausa os relays (o JS segue rodando)");
    assert.deepEqual(app.calls.visible, [], "ainda à vista");
    await native.hub.advance(500);
    native.fire(native.doc, "visibilitychange", true);
    await native.hub.advance(5000);
    assert.deepEqual(app.calls.visible, [false]);
    // WebView que não avisa: depois de 2 s, conta como escondida.
    const quiet = aloneSession();
    const mute = rig(quiet);
    mute.fire(mute.doc, "pause");
    await mute.hub.advance(2100);
    assert.deepEqual(quiet.calls.visible, [false]);
    mute.fire(mute.doc, "resume");
    assert.deepEqual(quiet.calls.visible, [false, true]);
  });

  test("APK no WhatsApp: o pause não segura os relays (o que cai religa no backoff, o 'online' escondido chuta já); a escada descartada solta a pausa do freeze", async () => {
    const { makeRelaySocket, pauseRelayReconnection, resumeRelayReconnection, kickRelays, resetRelaysForTests } = strategy;
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    mock.method(Math, "random", () => 0.5);
    const mono = fakeMono();
    try {
      FakeWS.all = [];
      makeRelaySocket("wss://w.test", () => {});
      FakeWS.all[0].open();
      const session = aloneSession();
      session.pauseSignaling = () => {
        session.calls.pause += 1;
        pauseRelayReconnection();
      };
      session.resumeSignaling = () => {
        session.calls.resume += 1;
        resumeRelayReconnection();
      };
      session.kickSignaling = (force) => kickRelays(force);
      const { doc, win, fire, lifecycle } = rig(session);
      // "Mandar no WhatsApp": pause do Capacitor e a página escondida; o Wi-Fi troca para o 4G e o relay cai.
      fire(doc, "pause");
      fire(doc, "visibilitychange", true);
      assert.equal(session.calls.pause, 0);
      FakeWS.all[0].drop();
      mock.timers.tick(1700); // 0,5 × 3,3 s
      assert.equal(FakeWS.all.length, 2, "o relay que caiu no WhatsApp religou no backoff");
      FakeWS.all[1].drop(); // ainda sem rede: o período dobrou (espera 3,3 s)
      mock.timers.tick(500);
      assert.equal(FakeWS.all.length, 2);
      fire(win, "online");
      assert.equal(FakeWS.all.length, 3, "a rede voltou com a página escondida: chutou já");
      // Aba congelada (freeze): aí sim segura; a escada descartada (a busca desistiu) solta.
      FakeWS.all[2].open();
      fire(doc, "freeze");
      assert.equal(session.calls.pause, 1);
      FakeWS.all[2].drop();
      mock.timers.tick(120_000);
      assert.equal(FakeWS.all.length, 3, "congelada: espera");
      const resumes = session.calls.resume;
      lifecycle.dispose();
      assert.equal(session.calls.resume, resumes + 1, "dispose com a pausa ligada solta os relays");
      assert.equal(FakeWS.all.length, 4, "o que esperava o resume discou");
      lifecycle.dispose();
      assert.equal(session.calls.resume, resumes + 1, "um dispose só solta");
    } finally {
      resetRelaysForTests();
      mono.restore();
      mock.restoreAll();
      mock.timers.reset();
    }
  });
});

// ---------------------------------------------------------------------------
// Diagnóstico
// ---------------------------------------------------------------------------

describe("diagnóstico", () => {
  test("veredito: sem relay → sem-rede; NAT que exige apoio → apoio/sem-apoio pelo TURN; senão bom", () => {
    const { diagVerdict, DIAG_HEADLINES } = diagnostics;
    assert.equal(diagVerdict({ relaysOk: 0, nat: "aberta", turnUdp: true, turnTcp: true }), "sem-rede");
    assert.equal(diagVerdict({ relaysOk: 3, nat: "aberta", turnUdp: false, turnTcp: false }), "bom");
    assert.equal(diagVerdict({ relaysOk: 3, nat: "simetrica", turnUdp: false, turnTcp: true }), "apoio");
    assert.equal(diagVerdict({ relaysOk: 3, nat: "bloqueado", turnUdp: false, turnTcp: false }), "sem-apoio");
    assert.equal(diagVerdict({ relaysOk: 3, nat: "simetrica", turnUdp: false, turnTcp: false }), "sem-apoio");
    assert.equal(diagVerdict({ relaysOk: 1, nat: "desconhecido", turnUdp: false, turnTcp: false }), "bom");
    // Sem WebRTC nenhuma rede ajuda (nem com relay nenhum): é trocar de navegador, não de rede.
    assert.equal(diagVerdict({ relaysOk: 3, nat: "sem-webrtc", turnUdp: false, turnTcp: false }), "sem-webrtc");
    assert.equal(diagVerdict({ relaysOk: 0, nat: "sem-webrtc", turnUdp: false, turnTcp: false }), "sem-webrtc");
    assert.doesNotMatch(DIAG_HEADLINES["sem-webrtc"], /rede/);
    for (const verdict of ["bom", "apoio", "sem-apoio", "sem-rede", "sem-webrtc"]) {
      const line = DIAG_HEADLINES[verdict];
      assert.ok(line && line.length < 90 && line.endsWith("."), verdict);
    }
  });

  test("NAT pelos srflx; TURN por transporte; hosts sem credencial; relógio; agente curto", () => {
    const { natFromCandidates, parseCandidate, turnServersFor, turnHostsOf, clockCheck, shortUserAgent, turnDetail } = diagnostics;
    const srflx = (port, address = "177.0.0.1") => ({ type: "srflx", protocol: "udp", address, port });
    assert.equal(natFromCandidates([]), "bloqueado");
    assert.equal(natFromCandidates([srflx(5000)]), "aberta");
    assert.equal(natFromCandidates([srflx(5000), srflx(5000)]), "aberta");
    assert.equal(natFromCandidates([srflx(5000), srflx(5002)]), "simetrica");
    assert.equal(natFromCandidates([srflx(5000), srflx(6000, "2804::1")]), "aberta", "IPv4 e IPv6 não se comparam");
    assert.equal(natFromCandidates([{ ...srflx(5000), protocol: "tcp" }]), "bloqueado");
    assert.deepEqual(parseCandidate({ candidate: "candidate:1 1 udp 1677729535 177.0.0.9 51234 typ srflx raddr 0.0.0.0 rport 0" }),
      { type: "srflx", protocol: "udp", address: "177.0.0.9", port: 51234 });
    const cfg = { turn: [{ urls: ["turn:t.exemplo:3478?transport=udp", "turn:t.exemplo:3478?transport=tcp", "turns:t2.exemplo:443"], username: "usuario-x", credential: "senha-x" }] };
    assert.deepEqual(turnServersFor(cfg, "udp").map((server) => server.urls), [["turn:t.exemplo:3478?transport=udp"]]);
    assert.deepEqual(turnServersFor(cfg, "tcp").map((server) => server.urls), [["turn:t.exemplo:3478?transport=tcp", "turns:t2.exemplo:443"]]);
    assert.deepEqual(turnHostsOf(cfg), ["t.exemplo", "t2.exemplo"]);
    assert.deepEqual(turnServersFor({}, "udp"), []);
    assert.deepEqual(clockCheck(null).status, "pulado");
    assert.deepEqual(clockCheck(1200), { status: "ok", detail: "certo" });
    assert.deepEqual(clockCheck(-20_000), { status: "ok", detail: "20 s atrasado" });
    assert.equal(clockCheck(120_000).status, "aviso");
    assert.match(clockCheck(120_000).detail, /^2 min adiantado/);
    assert.equal(clockCheck(-3 * 3600_000).status, "falha");
    assert.equal(turnDetail({ ok: true, ms: 712, error: null }), "responde (0,7 s)");
    assert.equal(turnDetail({ ok: false, ms: null, error: 401 }), "senha recusada (401)");
    assert.match(turnDetail({ ok: false, ms: null, error: 701 }), /bloqueada/);
    assert.equal(shortUserAgent("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36"), "Android 14 · Chrome 141");
    assert.equal(shortUserAgent("Mozilla/5.0 (Linux; Android 13; SM-A135M) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36"), "Android 13 · Samsung Internet 28");
    assert.equal(shortUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"), "iOS 18 · Safari 18");
    assert.equal(shortUserAgent("Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36; wv)", true), "app Android 14 · WebView 141");
  });

  test("runDiagnostics: tudo em paralelo com falsos; texto sem usuário/senha do TURN; cancela", async () => {
    const realFetch = globalThis.fetch;
    const realPc = globalThis.RTCPeerConnection;
    const mono = fakeMono(9_000_000); // net-config busca de novo (passou de 60 s desde a última)
    const made = [];
    class FakePC {
      constructor(config) {
        this.config = config;
        made.push(this);
      }
      createDataChannel() { return {}; }
      async createOffer() { return { type: "offer", sdp: "" }; }
      async setLocalDescription() { setTimeout(() => this.emit(), 2); }
      emit() {
        if (this.closed) return;
        const urls = this.config.iceServers.flatMap((server) => [].concat(server.urls));
        if (this.config.iceTransportPolicy === "relay") {
          if (urls.some((url) => /transport=udp/.test(url))) this.onicecandidate?.({ candidate: { candidate: "candidate:9 1 udp 1 51.0.0.1 40000 typ relay raddr 0.0.0.0 rport 0" } });
          else {
            this.onicecandidateerror?.({ errorCode: 701 });
            this.onicecandidate?.({ candidate: null }); // coleta terminou sem relay
          }
          return;
        }
        this.onicecandidate?.({ candidate: { candidate: "candidate:2 1 udp 1 177.0.0.1 50000 typ srflx raddr 0.0.0.0 rport 0" } });
        this.onicecandidate?.({ candidate: { candidate: "candidate:3 1 udp 1 177.0.0.1 50002 typ srflx raddr 0.0.0.0 rport 0" } });
      }
      close() { this.closed = true; }
    }
    const secrets = { username: "usuario-teste-123", credential: "senha-teste-456" };
    globalThis.RTCPeerConnection = FakePC;
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ version: 1, nostrRelays: ["wss://zz.test"], turn: [{ urls: ["turn:t.exemplo:3478?transport=udp", "turn:t.exemplo:3478?transport=tcp"], ...secrets }] }),
    });
    FakeWS.auto = true;
    FakeWS.all = [];
    try {
      const progress = [];
      const report = await diagnostics.runDiagnostics({ lastError: `could not connect (${secrets.credential})`, onProgress: (checks) => progress.push(checks.map((check) => check.status).join(",")) });
      const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));
      assert.ok(progress.length >= 5, "progresso linha a linha");
      assert.ok(progress[0].includes("testando"));
      // Relays: os presos da primeira configuração desta página (teste do net.json acima), não os do arquivo novo.
      assert.equal(byId.relays.detail, "2 de 2 respondem");
      assert.equal(byId.relays.status, "ok");
      assert.equal(byId.nat.detail, "simétrica (precisa do servidor de apoio)");
      assert.equal(byId["apoio-udp"].status, "ok");
      assert.equal(byId["apoio-tcp"].status, "falha");
      assert.match(byId["apoio-tcp"].detail, /3478/);
      assert.equal(report.verdict, "apoio");
      assert.equal(report.headline, diagnostics.DIAG_HEADLINES.apoio);
      assert.deepEqual(report.turnHosts, ["t.exemplo"]);
      assert.equal(made.filter((pc) => pc.config.iceTransportPolicy === "relay").length, 2, "um teste só-relay por transporte");
      assert.ok(made.every((pc) => pc.closed), "fecha as conexões de teste");
      assert.ok(FakeWS.all.every((socket) => socket.readyState === 3), "fecha os sockets de teste");
      const text = diagnostics.diagnosticsText(report);
      assert.ok(!text.includes(secrets.credential) && !text.includes(secrets.username), "nada de credencial no texto");
      for (const server of netConfig.DEFAULT_NET_CONFIG.turn ?? []) {
        assert.ok(!text.includes(server.credential) && !text.includes(server.username), "nem a embutida");
      }
      assert.match(text, /^Futbobo · teste de conexão\n\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
      assert.match(text, /Servidores de encontro \(ok\): 2 de 2 respondem/);
      assert.match(text, /Último erro \(atenção\): could not connect \(\*\*\*\)/);
      assert.match(text, /apoio: t\.exemplo/);
      // Cancelar: rejeita com AbortError e solta tudo.
      const controller = new AbortController();
      const pending = diagnostics.runDiagnostics({ signal: controller.signal });
      setTimeout(() => controller.abort(), 0);
      await assert.rejects(pending, (error) => error.name === "AbortError");
    } finally {
      FakeWS.auto = false;
      globalThis.fetch = realFetch;
      globalThis.RTCPeerConnection = realPc;
      mono.restore();
    }
  });

  test("runDiagnostics sem WebRTC (modo de bloqueio do iPhone, navegador endurecido): culpa o navegador, não a rede nem o servidor de apoio", async () => {
    const realFetch = globalThis.fetch;
    const hadPc = "RTCPeerConnection" in globalThis;
    const realPc = globalThis.RTCPeerConnection;
    delete globalThis.RTCPeerConnection;
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ version: 1, nostrRelays: ["wss://zz.test"], turn: [{ urls: ["turn:t.exemplo:3478?transport=udp", "turn:t.exemplo:3478?transport=tcp"], username: "usuario-teste-123", credential: "senha-teste-456" }] }),
    });
    FakeWS.auto = true;
    FakeWS.all = [];
    try {
      const report = await diagnostics.runDiagnostics();
      const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));
      assert.equal(byId.relays.status, "ok", "os relays respondem");
      assert.equal(report.verdict, "sem-webrtc");
      assert.equal(report.headline, diagnostics.DIAG_HEADLINES["sem-webrtc"]);
      assert.equal(byId.nat.status, "falha");
      assert.equal(byId["apoio-udp"].status, "pulado");
      assert.equal(byId["apoio-tcp"].status, "pulado");
      assert.match(byId["apoio-udp"].detail, /WebRTC/);
      const text = diagnostics.diagnosticsText(report);
      assert.doesNotMatch(text, /bloqueia/);
      assert.doesNotMatch(text, /não respondeu/);
    } finally {
      FakeWS.auto = false;
      globalThis.fetch = realFetch;
      if (hadPc) globalThis.RTCPeerConnection = realPc;
    }
  });
});

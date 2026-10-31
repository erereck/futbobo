#!/usr/bin/env node
// E2E do Bobonline em vários "aparelhos" (design §11.3): uma Edge headless via CDP, cada
// jogador numa JANELA própria (aba de fundo fica "hidden" e a sessão trata como fora do app),
// todos no mesmo contexto e na mesma origem com ?perfil=X&bobnet=bc (BroadcastChannel:
// sem rede, determinístico). O cenário "real" usa o Trystero de verdade em duas origens.
//
// Rode DEPOIS de um `npx next build` num sandbox (nunca no repo raiz):
//   node scripts/bobonline-e2e.mjs --out out                 todos os cenários
//   node scripts/bobonline-e2e.mjs --out out --only 1,12,13  só alguns
//   node scripts/bobonline-e2e.mjs --list                    lista os cenários
//   node scripts/bobonline-e2e.mjs --out out --real          + fumaça real (relays públicos, 3 tentativas)
//   node scripts/bobonline-e2e.mjs --out out --only R --real --relay   a fumaça real só por TURN (net.json do build)
// Opções: --host 127.0.0.71 --port 47301 --cdp 9711 --edge <msedge.exe> --shots <pasta> --tmp <pasta>
//
// Ganchos usados (só existem com ?perfil num endereço local com porta):
//   window.__bobonline = { state(), room(), duel(), view(), simulateBackground(ms) }   (B6, página)
//   window.__botaoTrace / window.__botaoPilot (B4, app/botao/dev-trace.ts, ?botaotrace=1; o rastro ganha `t` daqui)
//   window.__botao3d?.projectBeamEnd() (B4, Botao3DView, ?botaotrace=1)
// Gancho ausente = o cenário falha com a mensagem dizendo qual (nada é "passado" sem medir).

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { tmpdir } from "node:os";

// ——— Opções ———
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith("--") ? argv[at + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const RUN = Date.now().toString(36);
const OUT_DIR = resolve(opt("out", "out"));
const HOST = opt("host", "127.0.0.71");
const PORT = Number(opt("port", "47301"));
const CDP_PORT = Number(opt("cdp", "9711"));
const EDGE = opt("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const TMP = resolve(opt("tmp", join(tmpdir(), "sbr3", "bob")));
const SHOTS = resolve(opt("shots", join(TMP, `e2e-shots-${RUN}`)));
const PROFILE = join(TMP, `e2e-prof-${RUN}`);
const REAL_HOSTS = ["127.0.0.72", "127.0.0.73"];
/** `--relay`: toda RTCPeerConnection nasce só com candidatos de TURN (sem TURN que preste, a fumaça real não conecta). */
const RELAY_ONLY = `(() => {
  const Native = window.RTCPeerConnection;
  const made = (window.__bobPcs = []);
  function RelayOnly(config = {}, ...rest) {
    const pc = new Native({ ...config, iceTransportPolicy: "relay" }, ...rest);
    made.push(pc);
    return pc;
  }
  RelayOnly.prototype = Native.prototype;
  Object.setPrototypeOf(RelayOnly, Native);
  window.RTCPeerConnection = RelayOnly;
})();`;
/** Par eleito (tipo local/remoto, pelo `transport`, que os dois lados têm) de cada conexão aberta; `states` = todas, para o diagnóstico. */
const PAIR_TYPES = `(async () => {
  const pairs = [];
  const states = [];
  for (const pc of window.__bobPcs ?? []) {
    states.push(pc.connectionState);
    if (pc.connectionState !== "connected") continue;
    const stats = await pc.getStats();
    stats.forEach((s) => {
      const pair = s.type === "transport" && s.selectedCandidatePairId ? stats.get(s.selectedCandidatePairId) : null;
      if (pair) pairs.push(stats.get(pair.localCandidateId)?.candidateType + "/" + stats.get(pair.remoteCandidateId)?.candidateType);
    });
  }
  return { pairs, states };
})()`;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
class Skip extends Error {}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ——— Servidor estático do export (trailingSlash) ———
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm" };
function serve(root, host, port) {
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^[\\/]+/, "");
      let file = join(root, path);
      const info = await stat(file).catch(() => null);
      if (info?.isDirectory()) file = join(file, "index.html");
      else if (!info) file = (await stat(`${file}.html`).catch(() => null)) ? `${file}.html` : join(root, "404.html");
      const body = await readFile(file);
      res.writeHead(file.endsWith("404.html") ? 404 : 200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => done(server));
  });
}

// ——— CDP (sem dependências): conexão do navegador com sessões "flatten" ———
class Cdp {
  static async connect(port) {
    let version = null;
    for (let i = 0; i < 100 && !version; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      } catch {
        await sleep(100);
      }
    }
    assert(version, `CDP não respondeu na porta ${port}`);
    const cdp = new Cdp(new WebSocket(version.webSocketDebuggerUrl));
    await new Promise((done, fail) => {
      cdp.ws.onopen = done;
      cdp.ws.onerror = fail;
    });
    return cdp;
  }
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id && this.pending.has(data.id)) {
        const { done, fail } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) fail(new Error(`${data.error.message} ${data.error.data ?? ""}`));
        else done(data.result);
      } else if (data.method) {
        for (const listener of this.listeners) listener(data);
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((done, fail) => {
      this.pending.set(id, { done, fail });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(listener) {
    this.listeners.push(listener);
  }
}

let cdp = null;
let edge = null;
/** Sufixo do perfil por cenário: perfis novos a cada cenário (a trava de aba do anterior pode demorar a soltar). */
let scenarioTag = "";
const peers = [];
const servers = [];

class Peer {
  constructor(name, perfil, targetId, sessionId, origin, contextId) {
    Object.assign(this, { name, perfil, targetId, sessionId, origin, contextId, errors: [] });
  }
  send(method, params) {
    return cdp.send(method, params, this.sessionId);
  }
  async eval(expression, timeout = 60000) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout });
    if (result.exceptionDetails) throw new Error(`[${this.name}] ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`.slice(0, 600));
    return result.result.value;
  }
  async waitFor(expression, label, timeout = 30000) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeout) {
      try {
        if (await this.eval(`Boolean(${expression})`)) return;
      } catch (error) {
        last = error;
      }
      await sleep(150);
    }
    throw new Error(`[${this.name}] esperando ${label} (${timeout} ms)${last ? `: ${last.message}` : ""}`);
  }
  screen() {
    return this.eval(`window.__bobonline?.state().screen ?? null`);
  }
  waitScreen(screen, timeout = 30000) {
    const list = Array.isArray(screen) ? screen : [screen];
    return this.waitFor(`${JSON.stringify(list)}.includes(window.__bobonline?.state().screen)`, `tela ${list.join("|")}`, timeout);
  }
  room() {
    return this.eval(`window.__bobonline?.room() ?? null`);
  }
  duel() {
    return this.eval(`window.__bobonline?.duel() ?? null`);
  }
  async click(testid) {
    await this.waitFor(`document.querySelector('[data-testid="${testid}"]:not([disabled])')`, `botão ${testid}`);
    await this.eval(`document.querySelector('[data-testid="${testid}"]').click()`);
  }
  async clickText(text, selector = "button") {
    await this.waitFor(`[...document.querySelectorAll(${JSON.stringify(selector)})].some((el) => el.textContent.trim() === ${JSON.stringify(text)})`, `"${text}"`);
    await this.eval(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.textContent.trim() === ${JSON.stringify(text)}).click()`);
  }
  async type(testid, text) {
    await this.waitFor(`document.querySelector('[data-testid="${testid}"]')`, `campo ${testid}`);
    await this.eval(`(() => {
      const el = document.querySelector('[data-testid="${testid}"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
  }
  text() {
    return this.eval(`document.body.innerText`);
  }
  async visible() {
    assert(await this.eval(`document.visibilityState === "visible"`), `[${this.name}] janela não está visível (aba de fundo?)`);
  }
  async viewport(width, height) {
    // Celular em pé ou deitado (812x375 também é celular): viewport móvel nos dois.
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: Math.min(width, height) < 600 });
  }
  async shot(name, wait = 400) {
    await sleep(wait);
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    const file = join(SHOTS, `${name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  }
  async reload() {
    await this.send("Page.reload", {});
    await sleep(300);
    await this.waitFor(`document.readyState === "complete" && window.__bobonline`, "recarregar");
  }
  async close() {
    await cdp.send("Target.closeTarget", { targetId: this.targetId }).catch(() => {});
    peers.splice(peers.indexOf(this), 1);
    // Espera a janela sumir de verdade: só então a trava de aba (Web Locks) daquele perfil fica livre.
    for (let i = 0; i < 50; i++) {
      const { targetInfos } = await cdp.send("Target.getTargets").catch(() => ({ targetInfos: [] }));
      if (!targetInfos.some((info) => info.targetId === this.targetId)) break;
      await sleep(100);
    }
    await sleep(300);
  }
}

/**
 * Um quadro pelo screencast, para fotos no meio de uma animação: não força um quadro novo como o
 * Page.captureScreenshot (que segura o 3D da Edge headless por mais de um segundo). null = nenhum quadro.
 */
function screencastFrame(peer, name, timeout = 4000) {
  return new Promise((done) => {
    let finished = false;
    const finish = (file) => {
      if (finished) return;
      finished = true;
      peer.send("Page.stopScreencast").catch(() => {});
      done(file);
    };
    cdp.on((event) => {
      if (finished || event.sessionId !== peer.sessionId || event.method !== "Page.screencastFrame") return;
      peer.send("Page.screencastFrameAck", { sessionId: event.params.sessionId }).catch(() => {});
      const file = join(SHOTS, `${name}.png`);
      writeFileSync(file, Buffer.from(event.params.data, "base64"));
      finish(file);
    });
    peer.send("Page.startScreencast", { format: "png", everyNthFrame: 1 }).catch(() => finish(null));
    setTimeout(() => finish(null), timeout);
  });
}

function urlFor(origin, perfil, extra = "") {
  return `${origin}/bobonline/?perfil=${perfil}&bobnet=bc&botaotrace=1${extra}`;
}

/** Uma janela nova (mesmo contexto, salvo `contextId`) já com foco emulado. */
async function openPeer(name, { view = null, extra = "", origin = `http://${HOST}:${PORT}`, contextId, path, width = 412, height = 860, bc = true, relay = false } = {}) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", newWindow: true, ...(contextId ? { browserContextId: contextId } : {}) });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const perfil = `${name}${scenarioTag}`;
  const peer = new Peer(name, perfil, targetId, sessionId, origin, contextId);
  peers.push(peer);
  cdp.on((event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === "Runtime.exceptionThrown") peer.errors.push(event.params.exceptionDetails?.exception?.description ?? event.params.exceptionDetails?.text);
    if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") peer.errors.push(event.params.args.map((arg) => arg.value ?? arg.description).join(" "));
    if (event.method === "Fetch.requestPaused") {
      readFile(join(OUT_DIR, "bobonline", "net.json"))
        .then((body) => peer.send("Fetch.fulfillRequest", {
          requestId: event.params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" }],
          body: body.toString("base64"),
        }))
        .catch((error) => peer.errors.push(`net.json local: ${error.message}`));
    }
  });
  await peer.send("Page.enable");
  await peer.send("Runtime.enable");
  await peer.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await peer.viewport(width, height);
  // O rastro do B4 anota quadros, não tempo: um array pronto com push carimbado dá o `t` (ms de parede) a cada entrada.
  await peer.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const list = []; const push = list.push.bind(list); list.push = (...items) => { for (const item of items) if (item && typeof item === "object") item.t = performance.now(); return push(...items); }; window.__botaoTrace = list; })();` });
  if (view) {
    // O visual de cada perfil na chave do próprio perfil (bobKey): A em 3D e B em 2D na mesma origem.
    await peer.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("futbobo:bobonline-view:v1:${perfil}", ${JSON.stringify(JSON.stringify(view))}); } catch {}` });
  }
  if (relay) {
    // O net.json publicado (URL absoluta) vira o do build: testa o TURN que vai subir, não o que está no ar.
    await peer.send("Page.addScriptToEvaluateOnNewDocument", { source: RELAY_ONLY });
    await peer.send("Fetch.enable", { patterns: [{ urlPattern: "*/bobonline/net.json*" }] });
  }
  const url = path ? `${origin}${path.replace("{perfil}", perfil)}` : bc ? urlFor(origin, perfil, extra) : `${origin}/bobonline/?perfil=${perfil}${extra}`;
  await peer.send("Page.navigate", { url });
  await peer.waitFor(`document.readyState === "complete"`, "carregar");
  if (!path) await peer.waitFor(`window.__bobonline && window.__bobonline.state().tab === "ok"`, "página e trava de aba");
  await peer.visible();
  return peer;
}

// ——— Passos de sala ———
async function createRoom(host, { format = "x1", rules = "flash", fill = true, cpuLevel = null } = {}) {
  await host.waitScreen("home");
  await host.click("bob-create");
  await host.click(`bob-format-${format}`);
  await host.click(`bob-rules-${rules}`);
  if (format !== "x1" && !fill) await host.click("bob-fill-cpu");
  if (format !== "x1" && cpuLevel) await host.clickText(cpuLevel);
  await host.click("bob-create-submit");
  await host.waitScreen("lobby", 30000);
  return host.eval(`window.__bobonline.room().snapshot.code`);
}

async function joinRoom(guest, code, { ready = true } = {}) {
  await guest.waitScreen("home");
  await guest.click("bob-join");
  await guest.type("bob-join-code", code);
  await guest.click("bob-join-submit");
  await guest.waitScreen(["lobby", "bracket"], 50000);
  if (ready) await guest.click("bob-ready");
}

async function startRoom(host) {
  await host.click("bob-start");
}

const IS_3D = `Boolean(window.__botao3d) || [...document.querySelectorAll("canvas")].some((canvas) => canvas.dataset.engine === "three" || canvas.closest(".botao-3d, .botao-three, .botao-view-3d"))`;

/**
 * Piloto automático do B4 (dev-trace: window.__botaoPilot = { seed, sides }) no lado DESTE aparelho:
 * toca pelos mesmos caminhos do dedo, sem Math.random. Espectador não pilota.
 */
async function pilot(peer, seed, extra = {}) {
  const result = await peer.eval(`(() => {
    const duel = window.__bobonline.duel();
    if (!duel) return { error: "sem partida" };
    if (duel.role === "spectator") return { side: null };
    const side = duel.perspective === "cpu" ? "cpu" : "user";
    window.__botaoPilot = { seed: ${seed}, sides: [side], ...${JSON.stringify(extra)} };
    return { side };
  })()`);
  if (result.error) throw new Error(`[${peer.name}] ${result.error}`);
  return result.side;
}

function stopPilot(peer) {
  return peer.eval(`void (window.__botaoPilot = undefined)`);
}

function trace(peer) {
  return peer.eval(`(window.__botaoTrace ?? null)`);
}

async function traceOrFail(peer) {
  const list = await trace(peer);
  assert(Array.isArray(list), `gancho ausente: window.__botaoTrace (B4, app/botao/dev-trace.ts com ?botaotrace=1) em ${peer.name}`);
  return list;
}

/** Toques resolvidos ("settled") que o aparelho já viu, dos dois lados. */
async function settledCount(peer) {
  return (await traceOrFail(peer)).filter((entry) => entry.k === "settled").length;
}

/** Os dois aparelhos pilotando até `turns` toques resolvidos (ou o apito final). */
async function playTurns(list, turns, timeout = 240000) {
  for (const [index, peer] of list.entries()) await pilot(peer, 1000 + index);
  const started = Date.now();
  const base = await Promise.all(list.map(settledCount));
  for (;;) {
    const counts = await Promise.all(list.map(settledCount));
    const done = Math.min(...counts.map((count, index) => count - base[index]));
    if (done >= turns) break;
    const screens = await Promise.all(list.map((peer) => peer.screen()));
    if (screens.some((screen) => screen === "result")) break;
    assert(Date.now() - started < timeout, `só ${done} de ${turns} toques em ${timeout} ms`);
    await sleep(300);
  }
  await Promise.all(list.map(stopPilot));
  return Math.min(...(await Promise.all(list.map(settledCount))));
}

/**
 * Os hashes de descanso ("hash") batem: sem recarga, a sequência comum é igual entrada a entrada;
 * com recarga, todo hash do rastro mais curto (que recomeçou) aparece no outro.
 */
async function assertSameRests(a, b) {
  const [ha, hb] = (await Promise.all([traceOrFail(a), traceOrFail(b)])).map((list) => list.filter((entry) => entry.k === "hash").map((entry) => entry.h));
  const [short, long] = ha.length <= hb.length ? [ha, hb] : [hb, ha];
  assert(short.length > 0, "nenhum descanso para comparar");
  if (long.slice(0, short.length).every((hash, index) => hash === short[index])) return short.length;
  const known = new Set(long);
  const missing = short.filter((hash) => !known.has(hash));
  assert(missing.length === 0, `descansos diferentes entre ${a.name} e ${b.name}: ${missing.slice(0, 3).join(", ")}`);
  return short.length;
}

/**
 * Pausa do gol em ms de parede (o rastro ganha `t` pelo script de início de documento): do gol até a
 * recolocação dos botões ("formation", o fim da pausa em cada aparelho). O primeiro toque da saída não
 * serve de fim: ele depende de quanto o botão anda até a bola. Um item por gol do rastro, na ordem
 * (`ms` null se a pausa ainda não acabou): o n-ésimo gol é o mesmo nos dois aparelhos.
 */
function goalPauseList(list) {
  const out = [];
  list.forEach((entry, index) => {
    if (entry.k !== "goal") return;
    // Gol que fecha o tempo ou a partida não volta para a saída: sem pausa para medir.
    const next = list.slice(index + 1).find((item) => item.k === "formation" || item.k === "touch" || item.k === "hit" || item.k === "period-end" || item.k === "match-end" || item.k === "finish");
    const resume = next?.k === "formation" ? next : null;
    const ms = resume && typeof resume.t === "number" && typeof entry.t === "number" ? resume.t - entry.t : null;
    out.push({ side: entry.side, ownGoal: Boolean(entry.ownGoal), ms });
  });
  return out;
}

/** Placar pelos gols do rastro (o lado do gol é quem ganhou o ponto, gol contra incluído). */
function tallyOf(list) {
  const goals = list.filter((entry) => entry.k === "goal");
  return { user: goals.filter((goal) => goal.side === "user").length, cpu: goals.filter((goal) => goal.side === "cpu").length };
}

/**
 * Grava cada aparição (ou troca de texto/tom) do flash da partida neste aparelho: `.botao-flash-{tom}`.
 * Some com uma recarga (cenário sem recarga).
 */
function recordFlashes(peer) {
  return peer.eval(`(() => {
    if (window.__flashes) return true;
    window.__flashes = [];
    const last = new WeakMap();
    const scan = () => {
      for (const el of document.querySelectorAll(".botao-flash")) {
        const key = el.className + "|" + el.textContent.trim();
        if (last.get(el) === key) continue;
        last.set(el, key);
        window.__flashes.push({ text: el.textContent.trim(), cls: el.className, t: performance.now() });
      }
    };
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    return true;
  })()`);
}

/** Revanche no X1: A pede, B aceita, os dois de volta na partida. */
async function rematch(A, B) {
  await A.click("bob-rematch");
  await B.click("bob-rematch-accept");
  await Promise.all([A.waitScreen("match", 40000), B.waitScreen("match", 40000)]);
}

// ——— Cenários ———
const SCENARIOS = {
  1: { title: "2 aparelhos, A em 3D e B em 2D: 10 toques, hashes, pausas, espelho e placar", run: scenarioTwoPeers },
  2: { title: "Navegação pelo menu: o visual do Bobonline vale, não o das configurações", run: scenarioClientNav },
  3: { title: "Recarregar B no meio da mira", run: scenarioReloadAim },
  4: { title: "Recarregar A (autoridade) no meio da jogada", run: scenarioReloadRoll },
  5: { title: "Os dois recarregam em 2 s", run: scenarioBothReload },
  6: { title: "Segundo plano: simulateBackground e página congelada", run: scenarioBackground },
  7: { title: "Tolerância esgotada: W.O. (?grace=10)", run: scenarioGrace },
  8: { title: "Torneio de 4 com CPU (2 humanos)", run: scenarioT4 },
  9: { title: "Torneio de 8 (3 humanos + 5 CPU) com troca de anfitrião", run: scenarioT8 },
  10: { title: "Espectador: eliminado assiste", run: scenarioSpectate },
  11: { title: "Kamehameha: pausa 3400 ms, 2D espera igual, raio no quadro", run: scenarioKamehameha },
  12: { title: "Layouts 375x812 e 812x375", run: scenarioLayouts },
  13: { title: "Trava de aba: outra janela, \"Usar aqui\"", run: scenarioTabLock },
};

async function duelPair({ viewA = "2d", viewB = "2d", format = "x1", rules = "flash", extra = "" } = {}) {
  const A = await openPeer("A", { view: viewA, extra });
  const B = await openPeer("B", { view: viewB, extra });
  const code = await createRoom(A, { format, rules });
  await joinRoom(B, code);
  await startRoom(A);
  await Promise.all([A.waitScreen("match", 40000), B.waitScreen("match", 40000)]);
  await Promise.all([A.visible(), B.visible()]);
  return { A, B, code };
}

async function scenarioTwoPeers() {
  const { A, B } = await duelPair({ viewA: "3d", viewB: "2d" });
  await A.waitFor(IS_3D, "A em 3D", 20000);
  assert(!(await B.eval(IS_3D)), "B deveria estar em 2D");
  await Promise.all([recordFlashes(A), recordFlashes(B)]);
  const shots = await playTurns([A, B], 10);
  await assertSameRests(A, B);
  // B joga de visitante: o próprio time (lado cpu) aparece EMBAIXO no 2D dele.
  const mirror = await B.eval(`(() => {
    const duel = window.__bobonline.duel();
    const canvas = [...document.querySelectorAll("canvas")].sort((x, y) => y.width * y.height - x.width * x.height)[0];
    const ctx = canvas?.getContext("2d");
    if (!ctx || !duel?.teams) return { error: "sem canvas 2D ou sem cores" };
    const hex = duel.teams.cpu.primary.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const count = (y0, y1) => {
      const data = ctx.getImageData(0, y0, canvas.width, y1 - y0).data;
      let hits = 0;
      for (let i = 0; i < data.length; i += 16) if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < 60) hits++;
      return hits;
    };
    const half = Math.floor(canvas.height / 2);
    return { top: count(0, half), bottom: count(half, canvas.height) };
  })()`);
  assert(!mirror.error, mirror.error);
  assert(mirror.bottom > mirror.top, `B não está espelhado: cor do time de B em cima ${mirror.top} × embaixo ${mirror.bottom}`);
  // Placar do ponto de vista de B: o time de B à esquerda.
  const order = await B.eval(`(() => {
    const duel = window.__bobonline.duel();
    const board = document.querySelector(".botao-scoreboard, .botao-score, [class*='scoreboard']");
    if (!board || !duel?.teams) return null;
    const text = board.textContent;
    return { mine: text.indexOf(duel.teams.cpu.shortName), theirs: text.indexOf(duel.teams.user.shortName) };
  })()`);
  assert(order && order.mine >= 0 && order.theirs >= 0, "placar sem os nomes dos times");
  assert(order.mine < order.theirs, "no aparelho de B o time de B deveria vir à esquerda");
  await A.shot("1-A-3d-partida");
  await B.shot("1-B-2d-partida");

  // Gols para medir a pausa e empate para chegar aos pênaltis: quem está atrás (sem gol ainda) vira
  // artilheiro, o outro bate fraco; com 1 × 1 os dois batem fraco até a disputa. Sem disputa: revanche.
  const ended = async () => (await Promise.all([A.screen(), B.screen()])).includes("result");
  const inShootout = () => B.eval(`Boolean(document.querySelector(".botao-penalty-track"))`);
  let rematches = 0;
  let config = "";
  const started = Date.now();
  for (;;) {
    assert(Date.now() - started < 20 * 60000, "nenhuma disputa de pênaltis em 20 min");
    if (await inShootout()) break;
    if (await ended()) {
      assert(rematches < 4, "quatro partidas sem disputa de pênaltis");
      rematches += 1;
      await rematch(A, B);
      config = "";
      continue;
    }
    const [listA, listB] = await Promise.all([traceOrFail(A), traceOrFail(B)]);
    // Placar da partida atual (o rastro segue pela revanche: conta depois do último "finish").
    const tally = tallyOf(listA.slice(listA.findLastIndex((entry) => entry.k === "finish") + 1));
    const measured = [listA, listB].every((list) => goalPauseList(list).some((goal) => goal.ms !== null));
    // 0 × 0 sem pausa medida: A artilheiro. Quem ficou atrás empata (1 × 1). Já medido e 0 × 0 (revanche): os dois fracos.
    const strikeA = tally.user < 1 && tally.user <= tally.cpu && !(measured && tally.cpu === 0);
    const strikeB = !strikeA && tally.cpu < 1 && tally.cpu < tally.user;
    const next = `${strikeA}|${strikeB}`;
    if (next !== config) {
      config = next;
      await pilot(A, 21, strikeA ? { striker: true } : { power: 0.2 });
      await pilot(B, 22, strikeB ? { striker: true } : { power: 0.2 });
    }
    await sleep(400);
  }
  // Disputa: A bate fraco (não entra) e B normal, até o fim. A trilha de B começa por B.
  await pilot(A, 23, { power: 0.15 });
  await pilot(B, 24);
  const rows = (peer) => peer.eval(`[...document.querySelectorAll(".botao-penalty-track .botao-penalty-row > span")].map((el) => el.textContent.trim())`);
  const [rowsA, rowsB] = await Promise.all([rows(A), rows(B)]);
  assert(rowsA.length === 2 && rowsB.length === 2, `trilha dos pênaltis incompleta: A ${rowsA.join(",")} × B ${rowsB.join(",")}`);
  assert(rowsB[0] === rowsA[1] && rowsB[1] === rowsA[0], `a trilha de B deveria começar pelo time de B: A ${rowsA.join(" / ")} × B ${rowsB.join(" / ")}`);
  await A.shot("1-A-3d-penaltis", 1200);
  await B.shot("1-B-2d-penaltis", 0);
  await Promise.all([A.waitScreen("result", 5 * 60000), B.waitScreen("result", 5 * 60000)]);
  await Promise.all([stopPilot(A), stopPilot(B)]);
  // Cobrança de A que não entrou: "PEGOU!" no tom do gol em B (bom para B) e no tom ruim em A.
  const [fa, fb] = await Promise.all([A.eval(`window.__flashes`), B.eval(`window.__flashes`)]);
  const missesA = (await traceOrFail(B)).filter((entry) => entry.k === "penalty" && entry.reason === "shootout" && entry.side === "user" && !entry.scored).length;
  assert(missesA > 0, "nenhuma cobrança de A parou no goleiro de B");
  assert(fb.some((flash) => flash.text === "PEGOU!" && /botao-flash-goal/.test(flash.cls)), `B não viu "PEGOU!" no tom do gol: ${JSON.stringify(fb.slice(-6))}`);
  assert(fa.some((flash) => flash.text === "PEGOU!" && /botao-flash-bad/.test(flash.cls)), `A deveria ver "PEGOU!" no tom ruim: ${JSON.stringify(fa.slice(-6))}`);
  // Chegou aos pênaltis sem gol nenhum (o artilheiro não marcou): revanche com A artilheiro até uma pausa medida.
  const anyMeasured = async () => (await Promise.all([traceOrFail(A), traceOrFail(B)])).every((list) => goalPauseList(list).some((goal) => goal.ms !== null));
  for (let extra = 0; !(await anyMeasured()); ) {
    if ((await A.screen()) === "result") {
      assert(extra < 2, "nenhum gol em três partidas");
      extra += 1;
      rematches += 1;
      await rematch(A, B);
      await pilot(A, 25 + extra, { striker: true });
      await pilot(B, 27 + extra, { power: 0.2 });
    }
    await sleep(400);
  }
  await Promise.all([stopPilot(A), stopPilot(B)]);
  // Pausas do gol nos dois aparelhos (o n-ésimo gol é o mesmo nos dois rastros).
  const [ga, gb] = (await Promise.all([traceOrFail(A), traceOrFail(B)])).map(goalPauseList);
  assert(ga.length === gb.length, `gols diferentes nos rastros: A ${ga.length} × B ${gb.length}`);
  const measured = [];
  for (let i = 0; i < ga.length; i++) {
    if (ga[i].ms === null || gb[i].ms === null) continue;
    assert(Math.abs(ga[i].ms - gb[i].ms) <= 150, `pausa do gol ${i + 1}: A ${Math.round(ga[i].ms)} ms × B ${Math.round(gb[i].ms)} ms`);
    measured.push(`${Math.round(ga[i].ms)}/${Math.round(gb[i].ms)}`);
  }
  assert(measured.length > 0, "nenhuma pausa de gol medida");
  const compared = await assertSameRests(A, B);
  await A.shot("1-A-3d-resultado");
  await B.shot("1-B-2d-resultado");
  return `toques ${shots}+, descansos comparados ${compared}, pausas de gol A/B ${measured.join(", ")} ms, trilha de B ${rowsB.join(" / ")}, ${missesA} cobrança(s) de A paradas (PEGOU! verde em B)${rematches ? `, ${rematches} revanche(s) até a disputa` : ""}`;
}

async function scenarioClientNav() {
  const results = [];
  for (const [view, globalMirror] of [["3d", "0"], ["2d", "1"]]) {
    const M = await openPeer(`M${view}`);
    const N = await openPeer(`N${view}`, { path: "/?perfil={perfil}" });
    // A preferência global diz o contrário do que o Bobonline vai escolher: futbobo:settings:v1 (pela
    // ponte do shell, no IndexedDB) e o espelho futbobo:botao3d.
    await N.waitFor(`window.__FUTBOBO_LARGE_STORAGE_BRIDGE__?.installed`, "ponte do shell instalada", 20000);
    await N.eval(`(() => {
      const settings = JSON.parse(localStorage.getItem("futbobo:settings:v1") || "{}");
      settings.botao3d = ${globalMirror === "1"};
      localStorage.setItem("futbobo:settings:v1", JSON.stringify(settings));
      localStorage.setItem("futbobo:botao3d", "${globalMirror}");
    })()`);
    await N.clickText("JOGAR", "button");
    await N.waitFor(`document.querySelector('a[href="/bobonline"], a[href="/bobonline/"]')`, "cartão Bobonline");
    await N.eval(`document.querySelector('a[href="/bobonline"], a[href="/bobonline/"]').click()`);
    await N.waitFor(`window.__bobonline && window.__bobonline.state().tab === "ok"`, "Bobonline pelo menu");
    assert(await N.eval(`JSON.parse(localStorage.getItem("futbobo:settings:v1") || "{}").botao3d === ${globalMirror === "1"}`), "futbobo:settings:v1 não ficou com o contrário");
    // O transporte de teste lê ?bobnet=bc do endereço: põe de volta sem recarregar (a navegação continua sendo do cliente).
    await N.eval(`history.replaceState(history.state, "", location.pathname + "?perfil=${N.perfil}&bobnet=bc&botaotrace=1")`);
    await N.click(`bob-view-${view}`);
    const code = await createRoom(M, { format: "x1" });
    await joinRoom(N, code);
    await startRoom(M);
    await N.waitScreen("match", 40000);
    if (view === "3d") await N.waitFor(IS_3D, "partida em 3D", 20000);
    else {
      await sleep(3000);
      assert(!(await N.eval(IS_3D)), "partida deveria estar em 2D");
    }
    results.push(`${view} ok`);
    await M.close();
    await N.close();
  }
  return results.join(", ");
}

/** Espera a vez deste aparelho (rodapé "Sua vez" da BotaoMatch) com os pilotos parados. */
async function ownTurnOf(peer, timeout = 60000) {
  await peer.waitFor(`/Sua vez/.test(document.querySelector(".botao-root, main")?.innerText ?? document.body.innerText)`, "a vez deste aparelho", timeout);
}

/** "SEU TEMPO" da BotaoMatch (segundos da mira, o número grande da faixa), quando aparece. */
function idleSeconds(peer) {
  return peer.eval(`(() => {
    const strip = [...document.querySelectorAll(".botao-inactivity-countdown:not(.botao-kick-limit)")].find((el) => /SEU TEMPO/.test(el.textContent));
    const value = Number(strip?.querySelector("strong")?.textContent);
    return strip && Number.isFinite(value) ? value : null;
  })()`);
}

async function scenarioReloadAim() {
  const { A, B } = await duelPair();
  await playTurns([A, B], 2);
  // Só A pilota até a vez de B abrir; B fica parado até o "SEU TEMPO" (os últimos 3 dos 7 s) e recarrega aí.
  await pilot(A, 41);
  await B.waitFor(`/SEU TEMPO/.test(document.body.innerText)`, "SEU TEMPO de B (a vez de B, parado)", 90000);
  await stopPilot(A);
  const idleBefore = await idleSeconds(B);
  assert(idleBefore !== null, "SEU TEMPO sem número em B");
  await B.reload();
  await A.waitFor(`/caiu|Esperando voltar/.test(document.body.innerText)`, "A mostra a espera", 15000);
  await B.waitScreen("match", 40000);
  await B.waitFor(`/Voltando em/.test(document.body.innerText)`, "contagem de volta em B", 20000);
  await B.waitFor(`!/Voltando em/.test(document.body.innerText)`, "fim da contagem de volta", 15000);
  // A mira reabre com o tempo que sobrou (piso de 3 s, §5.5): o "SEU TEMPO" aparece logo; 7 s cheios o esconderiam por 4 s.
  await B.waitFor(`/SEU TEMPO/.test(document.body.innerText)`, "SEU TEMPO logo na volta (o tempo da mira foi recarregado?)", 1500);
  const idleAfter = await idleSeconds(B);
  assert(idleAfter !== null && idleAfter <= Math.max(idleBefore, 3), `o tempo da mira foi recarregado: antes ${idleBefore}, depois ${idleAfter}`);
  // B toca já (sobrou pouco tempo) e os dois seguem.
  await pilot(B, 42, { minFrames: 1, maxFrames: 2 });
  await playTurns([A, B], 2);
  return `SEU TEMPO ${idleBefore} antes da recarga, ${idleAfter} na volta; descansos comparados ${await assertSameRests(A, B)}`;
}

async function scenarioReloadRoll() {
  const { A, B } = await duelPair();
  await playTurns([A, B], 1);
  // Só B pilota até a vez de A (com os dois parados, a vez de B virava pênalti por demora e A nunca tinha a vez).
  await pilot(B, 76);
  await ownTurnOf(A);
  await stopPilot(B);
  const before = (await traceOrFail(A)).length;
  await pilot(A, 77, { minFrames: 1, maxFrames: 2 });
  await A.waitFor(`(window.__botaoTrace ?? []).slice(${before}).some((entry) => entry.k === "touch" || entry.k === "hit")`, "A em plena jogada", 15000);
  await A.reload(); // no meio da jogada (resolving)
  await A.waitScreen("match", 40000);
  await playTurns([A, B], 3);
  // Toque repetido apareceria como dois descansos a mais em A do que em B.
  const [ha, hb] = (await Promise.all([traceOrFail(A), traceOrFail(B)])).map((list) => list.filter((entry) => entry.k === "hash").length);
  return `descansos comparados ${await assertSameRests(A, B)} (A ${ha} desde a recarga, B ${hb})`;
}

async function scenarioBothReload() {
  const { A, B, code } = await duelPair();
  await playTurns([A, B], 2);
  await Promise.all([A.reload(), sleep(1200).then(() => B.reload())]);
  await Promise.all([A.waitScreen("match", 60000), B.waitScreen("match", 60000)]);
  const [ra, rb] = await Promise.all([A.room(), B.room()]);
  assert(ra.snapshot.code === code && rb.snapshot.code === code, "sala trocou de código");
  assert(ra.isHost, "A deveria voltar como anfitrião");
  await playTurns([A, B], 2);
  return `descansos comparados ${await assertSameRests(A, B)}`;
}

async function scenarioBackground() {
  const { A, B } = await duelPair();
  await playTurns([A, B], 2);
  const has = await B.eval(`typeof window.__bobonline.simulateBackground === "function" && Boolean(window.__bobonline.room())`);
  assert(has, "gancho ausente: simulateBackground (página B6 → cliente B2 simulateBackground(ms))");
  await B.eval(`window.__bobonline.simulateBackground(20000)`);
  await A.waitFor(`/saiu do app/.test(document.body.innerText)`, "A vê 'saiu do app'", 8000);
  for (let second = 0; second < 14; second++) {
    assert(await A.eval(`/saiu do app/.test(document.body.innerText)`), `o aviso sumiu no segundo ${second} (heartbeat bg limpou?)`);
    await sleep(1000);
  }
  await B.waitFor(`/ainda tem 1:1\\d/.test(document.body.innerText)`, "flash de volta em B", 20000);
  const backText = await B.eval(`/Você ficou fora[^\\n]*/.exec(document.body.innerText)?.[0] ?? ""`);
  await playTurns([A, B], 1);
  // (b) página congelada de verdade. Com o foco emulado a Edge não congela a janela (fica "visible" e os
  // timers seguem): solta o foco, congela, e devolve o foco depois (a janela volta a "visible").
  await B.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await B.send("Page.setWebLifecycleState", { state: "frozen" });
  const frozenAt = Date.now();
  await A.waitFor(`/caiu/.test(document.body.innerText)`, "A vê 'caiu'", 20000);
  const lostAfter = Date.now() - frozenAt;
  await sleep(Math.max(0, 20000 - lostAfter));
  await B.send("Page.setWebLifecycleState", { state: "active" });
  await B.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await B.waitFor(`document.visibilityState === "visible"`, "B visível de novo", 5000);
  await A.waitFor(`!/caiu|saiu do app/.test(document.body.innerText)`, "A vê B de volta", 30000);
  await playTurns([A, B], 1, 60000);
  return `"saiu do app" em A por 14 s; B: "${backText}"; congelada: "caiu" em A depois de ${(lostAfter / 1000).toFixed(1)} s, voltou e seguiu`;
}

async function scenarioGrace() {
  const { A, B } = await duelPair({ extra: "&grace=10" });
  await playTurns([A, B], 1);
  const closedAt = Date.now();
  await B.close();
  // X1 sem terceiro: o anfitrião não tem com quem comparar a própria rede e só cobra a ausência
  // depois de 60 s sem o outro (LONE_CLAIM_MS); a reserva de 10 s vence antes. Em produção (90 s) vale a reserva.
  await A.waitScreen("result", 120000);
  const seconds = (Date.now() - closedAt) / 1000;
  assert(seconds >= 10, `W.O. antes da reserva de 10 s (${seconds.toFixed(1)} s)`);
  // A tela de resultado chega por import(): espera o texto dela.
  await A.waitFor(`/Vitória por W\\.O\\./.test(document.body.innerText)`, "A deveria vencer por W.O.", 15000);
  await A.shot("7-A-wo");
  return `W.O. em ${seconds.toFixed(0)} s depois de fechar B (reserva ?grace=10; piso de 60 s do anfitrião sozinho)`;
}

/**
 * Pilota (partida), sai do resultado e aperta "pronto" (chave) até todos estarem numa das telas.
 * `onTick(telas)` roda a cada volta; `keepResult(peer)` = true segura o aparelho na tela de resultado;
 * `pilotExtra` vai junto do piloto (ex.: { striker: true }).
 */
async function playUntilScreens(list, screens, timeout, { onTick = null, keepResult = null, pilotExtra = {} } = {}) {
  const started = Date.now();
  for (;;) {
    const now = await Promise.all(list.map((peer) => peer.screen()));
    if (onTick) await onTick(now);
    if (now.every((screen) => screens.includes(screen))) return;
    assert(Date.now() - started < timeout, `telas ${now.join(",")} depois de ${timeout} ms`);
    for (const [index, peer] of list.entries()) {
      if (now[index] === "match") await peer.eval(`window.__botaoPilot ?? (() => { const duel = window.__bobonline.duel(); if (duel && duel.role !== "spectator") window.__botaoPilot = { seed: ${index + 7}, sides: [duel.perspective === "cpu" ? "cpu" : "user"], ...${JSON.stringify(pilotExtra)} }; })()`);
      if (now[index] === "result" && !(keepResult && keepResult(peer))) await peer.eval(`document.querySelector('[data-testid="bob-see-bracket"]')?.click()`);
      if (now[index] === "bracket") await peer.eval(`document.querySelector('[data-testid="bob-next-ready"], [data-testid="bob-banner-ready"]')?.click()`);
    }
    await sleep(400);
  }
}

async function scenarioT4() {
  const A = await openPeer("A");
  const B = await openPeer("B");
  // CPU "Fácil" e humanos de artilheiro: para um humano chegar à final (sem ele não há "pronto?" na final).
  const code = await createRoom(A, { format: "t4", rules: "flash", fill: true, cpuLevel: "Fácil" });
  await joinRoom(B, code);
  const ids = { A: (await A.room()).me, B: (await B.room()).me };
  const finalOf = (bracket) => bracket?.matches.find((match) => match.round === bracket.rounds) ?? null;
  const semiOf = (bracket, entrantId) => bracket?.matches.find((match) => match.round === bracket.rounds - 1 && [match.home, match.away].some((side) => side?.entrantId === entrantId)) ?? null;
  let badge = null;
  let seen = null;
  let tournaments = 0;
  for (;;) {
    tournaments += 1;
    await startRoom(A);
    await A.waitFor(`window.__bobonline.room()?.snapshot?.bracket`, "chave sorteada", 30000);
    const room = await A.room();
    assert(room.snapshot.bracket.entrants.filter((entrant) => entrant.kind === "cpu").length === 2, "2 CPUs na chave");
    seen = { kinds: new Set(), finalStates: [], finalHumans: [], readyStartedAt: null, freeAtReady: [], keptSince: new Map(), bracket: null };
    await playUntilScreens([A, B], ["champion"], 30 * 60000, {
      pilotExtra: { striker: true },
      onTick: async (now) => {
        for (const [index, peer] of [A, B].entries()) {
          if (now[index] !== "bracket" || badge) continue;
          if (await peer.eval(`document.querySelectorAll(".bob-cpu-tag, .bob-crest-cpu").length > 0`)) {
            badge = peer.name;
            await peer.shot(`8-${peer.name}-chave-cpu`, 200);
          }
        }
        const bracket = (await A.room())?.snapshot?.bracket ?? seen.bracket;
        seen.bracket = bracket;
        for (const match of bracket?.matches ?? []) if (match.round === 1 && match.kind) seen.kinds.add(match.kind);
        const final = finalOf(bracket);
        if (!final) return;
        const state = final.status === "waiting" && final.holdUntil ? "waiting+hold" : final.status;
        if (seen.finalStates.at(-1) !== state) seen.finalStates.push(state);
        // Início do "pronto?" pelo relógio do anfitrião (prazo − READY_CHECK_S): vale mesmo se ele durar menos que uma volta.
        if (final.readyDeadline && seen.readyStartedAt === null) {
          seen.readyStartedAt = final.readyDeadline - 20000;
          seen.freeAtReady = [...final.freeBy];
        }
        seen.finalHumans = [final.home, final.away].map((side) => side?.entrantId).filter((id) => id && !id.startsWith("cpu:"));
      },
      // Finalista humano fica na tela de resultado da semi até o "pronto?" da final abrir (no máximo 60 s):
      // a final tem de esperar a pausa do resultado (RESULT_HOLD_S = 30 s) enquanto ele está lá.
      keepResult: (peer) => {
        const final = finalOf(seen.bracket);
        if (!final || ![final.home, final.away].some((side) => side?.entrantId === ids[peer.name])) return false;
        if (!seen.keptSince.has(peer.name)) seen.keptSince.set(peer.name, Date.now());
        return final.status !== "ready-check" && final.status !== "playing" && final.status !== "done" && Date.now() - seen.keptSince.get(peer.name) < 60000;
      },
    });
    if (seen.finalHumans.length > 0 || tournaments >= 3) break;
    // Final só de CPUs (os dois humanos caíram): não há "pronto?" na final. Novo torneio na mesma sala.
    await A.click("bob-new-tournament");
    await Promise.all([A.waitScreen("lobby", 30000), B.waitScreen("lobby", 30000)]);
    await B.click("bob-ready");
  }
  const [ca, cb] = await Promise.all([A.room(), B.room()]);
  assert(JSON.stringify(ca.snapshot.bracket) === JSON.stringify(cb.snapshot.bracket), "chaves diferentes no fim");
  assert(badge, "selo CPU nunca apareceu na chave");
  assert(seen.kinds.has("cpu-human") || seen.kinds.has("cpu-cpu"), `semis sem CPU: ${[...seen.kinds].join(",")}`);
  assert(seen.finalHumans.length > 0, `${tournaments} torneios sem humano na final: o "pronto?" da final não foi conferido`);
  const bracket = ca.snapshot.bracket;
  const final = finalOf(bracket);
  assert(final.status === "done" && final.result, "a final não terminou");
  assert(seen.readyStartedAt !== null, `final com humano sem "pronto?": ${seen.finalStates.join(" → ")}`);
  // Quem ficou na tela de resultado (sem match:free): o "pronto?" só abre 30 s depois do resultado da semi dele.
  const holds = [];
  for (const human of seen.finalHumans) {
    const semi = semiOf(bracket, human);
    if (!semi?.result || seen.freeAtReady.includes(human)) continue;
    const waited = seen.readyStartedAt - semi.result.at;
    assert(waited >= 30000 - 1500, `o "pronto?" da final abriu ${Math.round(waited / 1000)} s depois da semi, com o finalista ainda no resultado (espera de 30 s)`);
    holds.push(`${Math.round(waited / 1000)} s`);
  }
  await A.shot("8-A-campeao");
  await B.shot("8-B-campeao", 0);
  return `campeão definido${tournaments > 1 ? ` no ${tournaments}º torneio` : ""}; semis ${[...seen.kinds].join(" + ")}; final ${seen.finalStates.join(" → ")} com ${seen.finalHumans.length} humano(s), "pronto?" ${holds.length ? `depois de ${holds.join(", ")} do resultado da semi` : "depois de o finalista sair do resultado"}; selo CPU visto por ${badge}`;
}

async function scenarioT8() {
  const A = await openPeer("A");
  const B = await openPeer("B");
  const C = await openPeer("C");
  const code = await createRoom(A, { format: "t8", rules: "flash", fill: true });
  await joinRoom(B, code);
  await joinRoom(C, code);
  await startRoom(A);
  await B.waitScreen(["match", "bracket"], 30000);
  // 5 CPUs em 8 vagas: há CPU × CPU nas quartas; o resultado dela é lacrado pelo anfitrião (worker) logo no começo.
  await B.waitFor(`window.__bobonline.room()?.snapshot?.bracket?.matches.some((match) => match.sealed)`, "resultado lacrado de CPU × CPU antes da troca", 30000);
  const sealedBefore = (await B.room()).snapshot.bracket.matches.filter((match) => match.sealed).map((match) => [match.id, match.sealed.result.resultHash]);
  await sleep(4000);
  const oldHost = (await B.room()).snapshot.hostId;
  await A.close(); // o anfitrião some no meio das quartas
  // O aviso da troca: na tela, ou ainda na fila da sala (durante a própria partida ele espera o fim dela).
  const toastOf = (peer) => peer.eval(`(() => {
    const live = /[^\\n]*agora é o anfitrião[^\\n]*/.exec(document.body.innerText)?.[0];
    const queued = (window.__bobonline.room()?.toasts ?? []).find((toast) => /agora é o anfitrião/.test(toast.text))?.text;
    return live ?? queued ?? null;
  })()`);
  let toast = null;
  for (const started = Date.now(); !toast; await sleep(150)) {
    assert(Date.now() - started < 60000, "sem aviso de troca de anfitrião em B nem em C em 60 s");
    toast = (await toastOf(B)) ?? (await toastOf(C));
  }
  await B.waitFor(`window.__bobonline.room()?.snapshot?.hostId !== ${JSON.stringify(oldHost)}`, "troca de anfitrião", 30000);
  await B.shot("9-B-troca-anfitriao", 0);
  await playUntilScreens([B, C], ["champion", "bracket", "result"], 30 * 60000);
  const [rb, rc] = await Promise.all([B.room(), C.room()]);
  for (const [id, hash] of sealedBefore) {
    const after = rb.snapshot.bracket.matches.find((match) => match.id === id);
    // Lacrado antes: depois da troca continua lacrado com o mesmo resultado (ou já revelado com ele).
    const now = after.sealed?.result.resultHash ?? after.result?.resultHash ?? null;
    assert(now === hash, `resultado lacrado ${id} mudou depois da troca (${hash} → ${now})`);
  }
  assert(rb.snapshot.epoch === rc.snapshot.epoch && rb.snapshot.hostId === rc.snapshot.hostId, "B e C em linhagens diferentes");
  await playUntilScreens([B, C], ["champion"], 30 * 60000);
  const [fb, fc] = await Promise.all([B.room(), C.room()]);
  assert(JSON.stringify(fb.snapshot.bracket) === JSON.stringify(fc.snapshot.bracket), "chaves diferentes no fim");
  await B.shot("9-B-campeao");
  await C.shot("9-C-campeao", 0);
  return `campeão depois da troca (${toast ?? "anfitrião trocado sem aviso na tela"}; ${sealedBefore.length} resultado(s) lacrado(s) iguais; época ${fb.snapshot.epoch})`;
}

async function scenarioSpectate() {
  const A = await openPeer("A");
  const B = await openPeer("B");
  const C = await openPeer("C");
  const code = await createRoom(A, { format: "t4", rules: "flash", fill: false });
  await joinRoom(B, code);
  await joinRoom(C, code);
  await startRoom(A);
  // Quem cair primeiro assiste a quem ainda joga.
  const started = Date.now();
  let watcher = null;
  while (!watcher) {
    assert(Date.now() - started < 15 * 60000, "ninguém foi eliminado");
    for (const peer of [A, B, C]) {
      const room = await peer.room();
      const me = room?.me;
      const out = room?.snapshot?.bracket?.matches.some((match) => match.status === "done" && match.result && ((match.result.winner === "home" ? match.away : match.home)?.entrantId === me));
      const live = room?.snapshot?.bracket?.matches.some((match) => match.status === "playing" && match.kind === "duel");
      if (out && live) watcher = peer;
    }
    for (const peer of [A, B, C]) if ((await peer.screen()) === "match") await pilot(peer, 31).catch(() => {});
    for (const peer of [A, B, C]) await peer.eval(`document.querySelector('[data-testid="bob-see-bracket"]')?.click()`);
    await sleep(400);
  }
  await watcher.eval(`window.__bobonline.state().screen === "result" && document.querySelector('[data-testid="bob-see-bracket"]')?.click()`);
  await watcher.click("bob-watch");
  await watcher.waitScreen("spectate", 30000);
  const players = [A, B, C].filter((peer) => peer !== watcher);
  await playTurns(players, 4);
  const authority = await (async () => {
    for (const peer of players) if ((await peer.duel())?.role === "authority") return peer;
    return players[0];
  })();
  return `descansos comparados ${await assertSameRests(authority, watcher)}`;
}

async function scenarioKamehameha() {
  // Todo jogador do time de A com a comemoração 13 (Kamehameha), antes de a página ler os times.
  const kame = (perfil) => `try {
    const key = "futbobo:bobonline-teams:v1:${perfil}";
    const data = JSON.parse(localStorage.getItem(key) || "null");
    if (data) { for (const team of data.teams) for (const player of team.players) player.appearance.celebration = 13; localStorage.setItem(key, JSON.stringify(data)); }
  } catch {}`;
  const A = await openPeer("A", { view: "3d", width: 375, height: 812 });
  await A.send("Page.addScriptToEvaluateOnNewDocument", { source: kame(A.perfil) });
  await A.reload();
  const B = await openPeer("B", { view: "2d" });
  const code = await createRoom(A, { format: "x1" });
  await joinRoom(B, code);
  await startRoom(A);
  await Promise.all([A.waitScreen("match", 40000), B.waitScreen("match", 40000)]);
  // Pilotos com espera de 1 a 2 quadros. A joga de artilheiro e B bate fraco, para o gol (de um jogador
  // de A, não contra) sair logo; sem ele, revanche.
  const isKame = (entry) => entry.k === "goal" && entry.side === "user" && !entry.ownGoal;
  let rematches = 0;
  let goalIndex = -1;
  const started = Date.now();
  for (;;) {
    assert(Date.now() - started < 20 * 60000, "nenhum gol de A em 20 min");
    await pilot(A, 13 + rematches, { minFrames: 1, maxFrames: 2, striker: true });
    await pilot(B, 14 + rematches, { minFrames: 1, maxFrames: 2, power: 0.4 });
    const goals = (await traceOrFail(A)).filter((entry) => entry.k === "goal");
    goalIndex = goals.findIndex(isKame);
    if (goalIndex >= 0) break;
    if ((await A.screen()) === "result" || (await B.screen()) === "result") {
      assert(rematches < 4, "quatro partidas sem gol de A");
      rematches += 1;
      await rematch(A, B);
      continue;
    }
    await sleep(300);
  }
  // O raio só existe do disparo (~1,6 s depois do gol) até o fim do sumiço (~2,7 s): um amostrador por
  // quadro em A guarda o |ndc.x| máximo da ponta enquanto ele existir e para quando ele some.
  assert(await A.eval(`typeof window.__botao3d?.projectBeamEnd === "function"`), "gancho ausente: window.__botao3d.projectBeamEnd() (B4)");
  await A.eval(`(() => {
    window.__kame = { samples: 0, max: null, first: null, done: false };
    const loop = () => {
      const kame = window.__kame;
      const tip = window.__botao3d?.projectBeamEnd?.() ?? null;
      if (tip) {
        kame.samples += 1;
        kame.max = Math.max(kame.max ?? 0, Math.abs(tip.x));
        if (kame.first === null) kame.first = tip.x;
      } else if (kame.samples > 0) {
        kame.done = true;
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  })()`);
  await B.waitFor(`/KAMEHAMEHA! · /.test(document.body.innerText)`, "flash no 2D", 5000);
  const flash2d = await B.eval(`/KAMEHAMEHA! · [^\\n]*/.exec(document.body.innerText)?.[0] ?? ""`);
  await A.waitFor(`window.__kame.samples > 0`, "raio visível no 3D", 6000);
  // Fotos do raio sem travar a partida: um quadro do screencast (a captura comum segura o 3D por ~1,5 s
  // na Edge headless, e a pausa do gol anda pelo tempo dos quadros).
  await Promise.all([screencastFrame(A, "11-A-3d-raio"), screencastFrame(B, "11-B-2d-kamehameha")]);
  await A.waitFor(`window.__kame.done`, "fim do raio", 4000).catch(() => {});
  const beam = await A.eval(`({ ...window.__kame })`);
  // Lado da tela de quem fez o gol pelo sinal da primeira amostra (o enquadramento pode depender dele).
  const side = beam.first < 0 ? "esquerda" : "direita";
  assert(beam.max < 0.9, `raio fora do quadro em 375x812: |ndc.x| máximo ${beam.max.toFixed(3)} (${beam.samples} quadros, começou à ${side})`);
  // Gol → recolocação em cada aparelho: a pausa do 3D (A) e a do 2D (B), as duas com a extensão do Kamehameha.
  const pauseOf = async (peer) => goalPauseList(await traceOrFail(peer))[goalIndex]?.ms ?? null;
  for (const deadline = Date.now() + 10000; (await pauseOf(A)) === null || (await pauseOf(B)) === null; await sleep(200)) {
    assert(Date.now() < deadline, "pausa do gol não medida (sem a recolocação depois do gol, ou o rastro sem t)");
  }
  await Promise.all([stopPilot(A), stopPilot(B)]);
  const [pa, pb] = [await pauseOf(A), await pauseOf(B)];
  assert(Math.abs(pb - 3400) <= 150, `pausa no 2D ${Math.round(pb)} ms (esperado 3400, igual ao 3D; no 3D ${Math.round(pa)} ms)`);
  assert(Math.abs(pa - 3400) <= 150, `pausa no 3D ${Math.round(pa)} ms (esperado 3400; no 2D ${Math.round(pb)} ms)`);
  return `pausa ${Math.round(pa)} ms (3D) / ${Math.round(pb)} ms (2D), "${flash2d}" no 2D, raio |ndc.x| máx ${beam.max.toFixed(2)} em ${beam.samples} quadros (à ${side})${rematches ? `, ${rematches} revanche(s)` : ""}`;
}

async function scenarioLayouts() {
  const files = [];
  const A = await openPeer("A");
  const B = await openPeer("B");
  const C = await openPeer("C");
  const sizes = [[375, 812], [812, 375]];
  const noSideScroll = async (peer, tag) => {
    const overflow = await peer.eval(`document.documentElement.scrollWidth - innerWidth`);
    assert(overflow <= 0, `${tag} ${peer.name}: a página rola de lado (${overflow}px)`);
  };
  for (const [width, height] of sizes) {
    await A.viewport(width, height);
    await A.waitScreen("home");
    files.push(await A.shot(`12-${width}x${height}-home`));
    await noSideScroll(A, `${width}x${height}`);
  }
  const code = await createRoom(A, { format: "t4", rules: "flash", fill: true });
  await joinRoom(B, code, { ready: true });
  await joinRoom(C, code, { ready: false });
  for (const [width, height] of sizes) {
    for (const peer of [A, C]) await peer.viewport(width, height);
    const tag = `${width}x${height}`;
    await A.waitScreen("lobby");
    files.push(await A.shot(`12-${tag}-lobby-host`));
    files.push(await C.shot(`12-${tag}-lobby-guest`));
    await noSideScroll(A, tag);
    await noSideScroll(C, tag);
  }
  await C.click("bob-ready");
  await startRoom(A);
  // 3 humanos + 1 CPU: na 1ª rodada todo mundo joga (um duelo e um humano contra a CPU).
  await Promise.all([A, B, C].map((peer) => peer.waitScreen("match", 30000)));
  for (const [width, height] of sizes) {
    for (const peer of [A, B, C]) await peer.viewport(width, height);
    const tag = `${width}x${height}`;
    for (const peer of [A, B, C]) {
      files.push(await peer.shot(`12-${tag}-${peer.name}-partida`));
      await noSideScroll(peer, tag);
    }
  }
  const infos = await Promise.all([A, B, C].map((peer) => peer.duel()));
  const solo = [A, B, C].find((_, index) => infos[index]?.role === "solo");
  const pair = [A, B, C].filter((_, index) => infos[index] && infos[index].role !== "solo" && infos[index].role !== "spectator");
  assert(solo && pair.length === 2, `partidas inesperadas na 1ª rodada: ${infos.map((info) => info?.role ?? "nenhuma").join(", ")}`);

  // Chave: quem joga contra a CPU desiste (Desistir → resultado → Ver chave).
  await solo.waitFor(`document.querySelector(".botao-forfeit-toggle")`, "botão Desistir");
  await solo.eval(`document.querySelector(".botao-forfeit-toggle").click()`);
  await solo.waitFor(`document.querySelector(".botao-forfeit-confirm")`, "confirmar a desistência");
  await solo.eval(`document.querySelector(".botao-forfeit-confirm").click()`);
  await solo.waitScreen("result", 30000);
  await solo.click("bob-see-bracket");
  await solo.waitScreen("bracket", 20000);
  for (const [width, height] of sizes) {
    await solo.viewport(width, height);
    files.push(await solo.shot(`12-${width}x${height}-chave`));
    await noSideScroll(solo, `${width}x${height} chave`);
  }

  // Faixa online da partida (o adversário "sai do app"): aparece e não cobre o placar.
  const [P, Q] = pair;
  await Q.eval(`window.__bobonline.simulateBackground(25000)`);
  await P.waitFor(`document.querySelector(".botao-online-banner")`, "faixa online em quem ficou", 10000);
  for (const [width, height] of sizes) {
    const tag = `${width}x${height}`;
    await P.viewport(width, height);
    files.push(await P.shot(`12-${tag}-faixa-online`));
    const overlap = await P.eval(`(() => {
      const banner = document.querySelector(".botao-online-banner")?.getBoundingClientRect();
      const board = document.querySelector(".botao-scoreboard")?.getBoundingClientRect();
      if (!banner || !board) return null;
      return !(banner.bottom <= board.top || banner.top >= board.bottom || banner.right <= board.left || banner.left >= board.right);
    })()`);
    assert(overlap !== null, `${tag}: faixa online ou placar sumiu`);
    assert(!overlap, `${tag} ${P.name}: a faixa online cobre o placar`);
  }
  await P.waitFor(`!document.querySelector(".botao-online-banner-waiting")`, "o adversário de volta", 45000);

  // Seletor da ordem dos batedores: os dois batem fraco até os pênaltis (0 × 0); o piloto de P não confirma.
  await pilot(P, 61, { power: 0.2, buttons: false });
  await pilot(Q, 62, { power: 0.2 });
  const started = Date.now();
  while (!(await P.eval(`Boolean(document.querySelector(".botao-order-sheet .botao-primary"))`))) {
    assert(Date.now() - started < 12 * 60000, "o duelo não chegou à escolha dos batedores em 12 min");
    assert((await P.screen()) === "match", `o duelo acabou sem pênaltis (${(await P.text()).slice(0, 80).replace(/\s+/g, " ")})`);
    await sleep(250);
  }
  for (const [width, height] of sizes) {
    await P.viewport(width, height);
    files.push(await P.shot(`12-${width}x${height}-ordem-batedores`, 250));
    // Visível = dentro da tela sem rolar a página E sem nada por cima (o ponto do meio é o próprio botão).
    const visible = await P.eval(`(() => {
      const button = [...document.querySelectorAll("button")].find((el) => el.textContent.includes("Confirmar ordem"));
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      const inside = rect.bottom <= innerHeight && rect.top >= 0 && (document.scrollingElement?.scrollTop ?? 0) === 0;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { inside, covered: !(hit && button.contains(hit)), by: hit && !button.contains(hit) ? (hit.closest("[class]")?.className ?? hit.tagName) : null };
    })()`);
    assert(visible !== null, `${width}x${height}: a escolha dos batedores fechou antes da foto`);
    assert(visible.inside, `${width}x${height}: "Confirmar ordem ✓" fora da tela sem rolar a página`);
    assert(!visible.covered, `${width}x${height}: "Confirmar ordem ✓" tapado por ${visible.by}`);
  }
  await Promise.all([stopPilot(P), stopPilot(Q)]);
  return `${files.length} capturas (início, sala, partidas, chave, faixa online, ordem dos batedores) em ${SHOTS}`;
}

async function scenarioTabLock() {
  const A = await openPeer("A");
  await createRoom(A, { format: "t4" });
  // Mesma origem, mesmo perfil, outra janela do mesmo contexto.
  const A2 = await openPeer("A", { path: "/bobonline/?perfil={perfil}&bobnet=bc&botaotrace=1" });
  await A2.waitFor(`window.__bobonline?.state().screen === "other-tab"`, "tela outra aba", 15000);
  await A2.click("bob-use-here");
  await A2.waitFor(`window.__bobonline.state().tab === "ok"`, "trava tomada");
  await A.waitFor(`window.__bobonline.state().tab === "lost"`, "aba antiga avisada");
  await A2.waitScreen("lobby", 40000);
  return "sessão mudou de janela";
}

async function scenarioReal() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const contexts = [];
      for (let i = 0; i < 2; i++) contexts.push((await cdp.send("Target.createBrowserContext", {})).browserContextId);
      const relay = flag("relay");
      const A = await openPeer("RA", { origin: `http://${REAL_HOSTS[0]}:${PORT}`, contextId: contexts[0], bc: false, relay });
      const B = await openPeer("RB", { origin: `http://${REAL_HOSTS[1]}:${PORT}`, contextId: contexts[1], bc: false, relay });
      const code = await createRoom(A, { format: "x1" });
      await joinRoom(B, code);
      await A.waitFor(`window.__bobonline.room()?.snapshot?.members.filter((m) => !m.left).length === 2`, "os dois na sala", 60000);
      let pairs = "";
      if (relay) {
        const seen = { A: await A.eval(PAIR_TYPES), B: await B.eval(PAIR_TYPES) };
        const ok = Object.values(seen).every((side) => side.pairs.length > 0 && side.pairs.every((type) => type === "relay/relay"));
        assert(ok, `par eleito não é só TURN: ${JSON.stringify(seen)}`);
        pairs = ` (só TURN: A ${seen.A.pairs.join(", ")} · B ${seen.B.pairs.join(", ")})`;
      }
      await A.close();
      await B.close();
      for (const id of contexts) await cdp.send("Target.disposeBrowserContext", { browserContextId: id }).catch(() => {});
      return `ok na tentativa ${attempt}${pairs}`;
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(`  real: tentativa ${attempt} falhou (${error.message}); de novo`);
    }
  }
  return "?";
}

// ——— Execução ———
async function main() {
  if (flag("list")) {
    for (const [id, scenario] of Object.entries(SCENARIOS)) console.log(`${id.padStart(2)}  ${scenario.title}`);
    console.log(" R  Fumaça real: Trystero em duas origens (--real)");
    return 0;
  }
  const only = opt("only", null)?.split(",").map((item) => item.trim()) ?? Object.keys(SCENARIOS);
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(PROFILE, { recursive: true });
  await stat(join(OUT_DIR, "bobonline", "index.html")).catch(() => {
    throw new Error(`sem ${join(OUT_DIR, "bobonline", "index.html")}: rode \`npx next build\` no sandbox e passe --out`);
  });
  servers.push(await serve(OUT_DIR, HOST, PORT));
  if (flag("real")) for (const host of REAL_HOSTS) servers.push(await serve(OUT_DIR, host, PORT));
  edge = spawn(EDGE, [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--autoplay-policy=no-user-gesture-required", "--window-size=1280,900", "about:blank",
  ], { stdio: "ignore" });
  cdp = await Cdp.connect(CDP_PORT);

  const report = [];
  const list = [...only.filter((id) => SCENARIOS[id]).map((id) => [id, SCENARIOS[id]]), ...(flag("real") ? [["R", { title: "Fumaça real (Trystero)", run: scenarioReal }]] : [])];
  for (const [id, scenario] of list) {
    const started = Date.now();
    scenarioTag = `s${id}${RUN.slice(-3)}`;
    process.stdout.write(`[${id}] ${scenario.title}… `);
    let entry;
    try {
      const detail = await scenario.run();
      entry = { id, title: scenario.title, status: "ok", detail };
    } catch (error) {
      entry = { id, title: scenario.title, status: error instanceof Skip ? "pulado" : "falhou", detail: error.message };
      for (const peer of peers) {
        try {
          await peer.shot(`falha-${id}-${peer.name}`);
        } catch {}
      }
    }
    entry.ms = Date.now() - started;
    entry.consoleErrors = peers.flatMap((peer) => peer.errors.map((text) => `${peer.name}: ${text}`)).slice(0, 20);
    report.push(entry);
    console.log(`${entry.status} (${(entry.ms / 1000).toFixed(1)} s)${entry.detail ? ` — ${entry.detail}` : ""}`);
    for (const peer of [...peers]) await peer.close();
  }
  writeFileSync(join(SHOTS, "e2e-report.json"), JSON.stringify(report, null, 2));
  console.log(`relatório: ${join(SHOTS, "e2e-report.json")}`);
  return report.some((entry) => entry.status === "falhou") ? 1 : 0;
}

async function cleanup() {
  try {
    await cdp?.send("Browser.close");
  } catch {}
  await sleep(600);
  if (edge?.pid) {
    if (process.platform === "win32") spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" });
    else edge.kill("SIGKILL");
  }
  for (const server of servers) server.close();
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(800);
    try {
      rmSync(PROFILE, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
      return;
    } catch {
      // A Edge ainda está soltando os arquivos do perfil.
    }
  }
  console.error(`[bobonline-e2e] não consegui apagar ${PROFILE}: apague à mão`);
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(`[bobonline-e2e] ${error.message}`);
} finally {
  await cleanup();
}
process.exit(code);

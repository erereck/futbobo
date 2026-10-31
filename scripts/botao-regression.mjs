#!/usr/bin/env node
// Regressão dos modos que já existem (design §11.5): a mesma partida, jogada pelo
// mesmo piloto determinístico, na base (HEAD, padrão fafd053) e na árvore nova.
//
// Partidas no navegador não se repetem sozinhas (relógio do quadro, CPU em
// setTimeout, pulsos do 2D). Então:
// - as duas árvores recebem o mesmo gancho `app/botao/dev-trace.ts` (a base ganha
//   as mesmas linhas de chamada na BotaoMatch e o `__botao3d.kind` no 3D);
// - cada execução roda num Edge headless com tempo virtual do CDP
//   (`pauseIfNetworkFetchesPending`), requestAnimationFrame/performance.now em passos
//   fixos de 1/60 s, Math.random semeado e o shader paralelo desligado;
// - o piloto (`window.__botaoPilot`) toca sozinho pelos lados humanos.
// Compara o rastro (eventos do motor + hash do estado a cada descanso) e, no 2D,
// os pixels da mesa (hash do canvas) em instantes fixos. No 3D, depois da primeira
// cobrança da CPU só a rng gasta por cobrança vale (o drama muda o momento do chute, §9).
//
// Uso (de dentro de um sandbox com node_modules e o build novo):
//   node scripts/botao-regression.mjs --repo <repo com .git> [--rev fafd053]
//        [--new-out out] [--head-out <export já buildado da base>] [--work <pasta>]
//        [--modes botao,pens,x1,copa] [--views 2d,3d] [--host 127.0.0.84] [--ports 3630,3631]
//        [--cdp 9630] [--edge <msedge.exe>] [--report <json>] [--shots <pasta>] [--drama-runs 4]
// Saída 1 na primeira divergência (o relatório diz modo, visual e o índice do rastro).

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const ROOT = process.cwd();
const REPO = resolve(arg("repo", ROOT));
const REV = arg("rev", "fafd053");
const WORK = resolve(arg("work", join(tmpdir(), "botao-regression")));
const HOST = arg("host", "127.0.0.1");
const [PORT_HEAD, PORT_NEW] = arg("ports", "3630,3631").split(",").map(Number);
const CDP_PORT = Number(arg("cdp", "9630"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const MODES = arg("modes", "botao,pens,x1,copa").split(",").filter(Boolean);
const VIEWS = arg("views", "2d,3d").split(",").filter(Boolean);
const REPORT = resolve(arg("report", join(WORK, "report.json")));
const SHOTS = arg("shots", "") ? resolve(arg("shots", "")) : null;
const DRAMA_RUNS = Number(arg("drama-runs", "4"));
const NEW_OUT = resolve(arg("new-out", join(ROOT, "out")));
const HEAD_OUT_ARG = arg("head-out", "");
/** Instante inicial do relógio virtual (Date.now igual nas duas árvores). */
const INITIAL_VIRTUAL_TIME = 1_785_000_000;
const STEP_MS = 1000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
/** Promessa com prazo: devolve null se não resolver a tempo (foto com o tempo virtual parado, por exemplo). */
const withTimeout = (promise, ms) => Promise.race([promise.catch(() => null), sleep(ms).then(() => null)]);
const log = (...parts) => console.log("[regressao]", ...parts);

// ---------------------------------------------------------------------------
// Base (HEAD): cópia do rev, gancho e build
// ---------------------------------------------------------------------------

/**
 * As linhas do gancho, copiadas da árvore nova (a mesma coisa nos dois lados), nas âncoras do arquivo antigo.
 * Base: o bloco do traceRef + onPointerUpRef antes do laço, a linha do quadro, eventos, fim e a atribuição do ref.
 */
function patchBase(dir) {
  const fresh = readFileSync(join(ROOT, "app/botao/BotaoMatch.tsx"), "utf8").replace(/\r\n/g, "\n");
  const blockStart = fresh.indexOf("  /** O soltar do dedo, para o gancho de desenvolvimento");
  const blockEnd = fresh.indexOf("  // ------------------------------------------------------------- loop de jogo\n");
  if (blockStart < 0 || blockEnd < blockStart) throw new Error("bloco do gancho não achado na árvore nova");
  const block = fresh.slice(blockStart, blockEnd);
  const frameLine = fresh.split("\n").find((line) => line.includes("traceRef.current?.frame(state,"));
  if (!frameLine) throw new Error("linha do quadro do gancho não achada na árvore nova");
  const matchPath = join(dir, "app/botao/BotaoMatch.tsx");
  let match = readFileSync(matchPath, "utf8");
  const crlf = match.includes("\r\n");
  match = match.replace(/\r\n/g, "\n");
  const insert = (anchor, text, after = true) => {
    const parts = match.split(anchor);
    if (parts.length !== 2) throw new Error(`âncora da base não achada (${parts.length - 1}x): ${anchor.slice(0, 80)}`);
    match = parts.join(after ? anchor + text : text + anchor);
  };
  insert(`    (events: BotaoEvent[]) => {\n`, `      traceRef.current?.events(events, machine);\n`);
  insert(`  // ------------------------------------------------------------- loop de jogo\n`, block, false);
  insert(`      frameCountRef.current += 1;\n`, `${frameLine}\n`);
  insert(`  const onPointerMove = useCallback(\n`, `  onPointerUpRef.current = onPointerUp;\n`, false);
  insert(`      timersRef.current.finish = null;\n`, `      traceRef.current?.finish(state);\n`);
  writeFileSync(matchPath, crlf ? match.replace(/\n/g, "\r\n") : match);

  const viewPath = join(dir, "app/botao/three/Botao3DView.ts");
  let view = readFileSync(viewPath, "utf8");
  const viewCrlf = view.includes("\r\n");
  view = view.replace(/\r\n/g, "\n");
  const anchor = `    this.setLandscape(options.landscape);\n`;
  if (!view.includes(anchor)) throw new Error("âncora do 3D da base não achada");
  view = view.replace(`import { bodyAppearance, type BotaoRenderView } from "../render";\n`, `import { bodyAppearance, type BotaoRenderView } from "../render";\nimport { botaoTraceEnabled } from "../dev-trace";\n`);
  view = view.replace(anchor, `${anchor}    if (botaoTraceEnabled()) window.__botao3d = { projectBeamEnd: () => null, kind: () => (this.goalShowStarted || this.choreo.active ? this.choreo.kind : null) };\n`);
  writeFileSync(viewPath, viewCrlf ? view.replace(/\n/g, "\r\n") : view);
  cpSync(join(ROOT, "app/botao/dev-trace.ts"), join(dir, "app/botao/dev-trace.ts"));
}

function prepareBase() {
  if (HEAD_OUT_ARG) return resolve(HEAD_OUT_ARG);
  const dir = join(WORK, `base-${REV}`);
  const out = join(dir, "out");
  if (existsSync(join(out, "botao", "index.html"))) {
    log(`base já buildada em ${out}`);
    return out;
  }
  // Um node_modules ligado (junção) de uma tentativa antiga sai sozinho, sem tocar no alvo.
  const oldModules = join(dir, "node_modules");
  try {
    if (lstatSync(oldModules).isSymbolicLink()) rmdirSync(oldModules);
  } catch {
    /* não existia */
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  log(`copiando ${REV} de ${REPO}`);
  // Caminho relativo para o tar: o do Git Bash lê "C:" como host remoto.
  execFileSync("git", ["-C", REPO, "archive", "--format=tar", "-o", join(dir, "base.tar"), REV]);
  execFileSync("tar", ["-xf", "base.tar"], { cwd: dir });
  rmSync(join(dir, "base.tar"), { force: true });
  // node_modules da árvore nova (superconjunto: a base só não tinha o trystero). Cópia de verdade:
  // o Turbopack recusa um node_modules ligado para fora da raiz do projeto.
  log("copiando node_modules…");
  if (process.platform === "win32") {
    const copy = spawnSync("robocopy", [join(ROOT, "node_modules"), join(dir, "node_modules"), "/E", "/MT:16", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/R:1", "/W:1"], { stdio: "ignore" });
    if (copy.status === null || copy.status >= 8) throw new Error(`robocopy do node_modules falhou (${copy.status})`);
  } else {
    cpSync(join(ROOT, "node_modules"), join(dir, "node_modules"), { recursive: true, verbatimSymlinks: true });
  }
  patchBase(dir);
  const slot = acquireBuildSlot();
  try {
    log("build da base (next build)…");
    const build = spawnSync("npx", ["next", "build"], { cwd: dir, stdio: "inherit", shell: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
    if (build.status !== 0) throw new Error("build da base falhou");
  } finally {
    if (slot) rmSync(slot, { recursive: true, force: true });
  }
  return out;
}

/**
 * `--slots-dir <pasta> [--slots 2]`: máquina com pouca memória, builds em fila
 * (uma pasta build-slot-N com o pid de quem está usando). Sem a opção, builda direto.
 */
function acquireBuildSlot() {
  const root = arg("slots-dir", "");
  if (!root) return null;
  const slots = Number(arg("slots", "2"));
  mkdirSync(root, { recursive: true });
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let waited = 0; ; waited += 1) {
    for (let index = 1; index <= slots; index += 1) {
      const dir = join(root, `build-slot-${index}`);
      try {
        mkdirSync(dir);
        writeFileSync(join(dir, "pid"), String(process.pid));
        return dir;
      } catch {
        let pid = 0;
        try {
          pid = Number(readFileSync(join(dir, "pid"), "utf8"));
        } catch {
          /* sem pid ainda */
        }
        if (pid && !alive(pid)) rmSync(dir, { recursive: true, force: true });
      }
    }
    if (waited % 12 === 0) log("esperando uma vaga de build…");
    spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 5000)"]);
  }
}

// ---------------------------------------------------------------------------
// Servidor estático e Edge via CDP
// ---------------------------------------------------------------------------

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
function serve(root, port) {
  const server = createServer((request, response) => {
    try {
      const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^[\\/]+/, "");
      let file = join(root, path);
      if (existsSync(file) && !extname(file)) file = join(file, "index.html");
      else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
      if (!existsSync(file)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(readFileSync(file));
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });
  return new Promise((done) => server.listen(port, HOST, () => done(server)));
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.waiters = [];
    ws.onmessage = (raw) => {
      const message = JSON.parse(raw.data);
      if (message.id && this.pending.has(message.id)) {
        const { done, fail } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) fail(new Error(JSON.stringify(message.error)));
        else done(message.result);
        return;
      }
      if (!message.method) return;
      this.waiters = this.waiters.filter((waiter) => {
        if (waiter.method !== message.method || (waiter.sessionId && waiter.sessionId !== message.sessionId)) return true;
        waiter.done(message.params);
        return false;
      });
    };
  }
  send(method, params = {}, sessionId) {
    return new Promise((done, fail) => {
      const id = ++this.id;
      this.pending.set(id, { done, fail });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }
  once(method, sessionId, timeoutMs = 600_000) {
    return new Promise((done, fail) => {
      const waiter = { method, sessionId, done };
      this.waiters.push(waiter);
      setTimeout(() => {
        if (!this.waiters.includes(waiter)) return;
        this.waiters = this.waiters.filter((item) => item !== waiter);
        fail(new Error(`sem ${method} em ${timeoutMs} ms`));
      }, timeoutMs);
    });
  }
}

async function launchEdge() {
  const profile = join(WORK, `edge-profile-${CDP_PORT}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const proc = spawn(EDGE, [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--mute-audio",
    "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "about:blank",
  ], { stdio: "ignore" });
  let version = null;
  for (let attempt = 0; attempt < 150 && !version; attempt += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    } catch {
      await sleep(100);
    }
  }
  if (!version) throw new Error("o Edge não abriu a porta do CDP");
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    ws.onopen = done;
    ws.onerror = fail;
  });
  const cdp = new Cdp(ws);
  const close = async () => {
    try {
      await cdp.send("Browser.close");
    } catch {
      /* já fechou */
    }
    await sleep(600);
    try {
      ws.close();
    } catch {
      /* já fechou */
    }
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    else proc.kill("SIGKILL");
    // O Edge solta os arquivos do perfil alguns segundos depois de morrer.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        rmSync(profile, { recursive: true, force: true });
        return;
      } catch {
        await sleep(500);
      }
    }
    log(`aviso: o perfil ${profile} ficou para trás (apague à mão)`);
  };
  return { cdp, close };
}

// ---------------------------------------------------------------------------
// Página determinística
// ---------------------------------------------------------------------------

function initScript({ seed, view3d }) {
  return `(() => {
  let s = ${seed >>> 0} || 1;
  Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const later = window.setTimeout.bind(window);
  let frame = 0;
  let now = 0;
  let scheduled = false;
  let nextId = 1;
  const callbacks = new Map();
  const tick = () => {
    scheduled = false;
    frame += 1;
    now = frame * 1000 / 60;
    const list = [...callbacks.values()];
    callbacks.clear();
    for (const callback of list) { try { callback(now); } catch (error) { console.error(error); } }
  };
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    if (!scheduled) { scheduled = true; later(tick, frame % 3 === 2 ? 16 : 17); }
    return id;
  };
  window.cancelAnimationFrame = (id) => { callbacks.delete(id); };
  performance.now = () => now;
  window.__regressao = { frame: () => frame };
  // Shader paralelo do WebGL termina em tempo real: desligado para o compileAsync não depender da GPU.
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    const getExtension = proto.getExtension;
    proto.getExtension = function (name) { return name === "KHR_parallel_shader_compile" ? null : getExtension.call(this, name); };
    const supported = proto.getSupportedExtensions;
    proto.getSupportedExtensions = function () { return (supported.call(this) || []).filter((name) => name !== "KHR_parallel_shader_compile"); };
  }
  try {
    localStorage.setItem("futbobo:botao3d", ${view3d ? '"1"' : '"0"'});
    localStorage.setItem("futbobo:settings:v1", JSON.stringify({ botao3d: ${view3d}, botaoHalfSeconds: 90, botaoGoalLimit: 3, botaoExtraSeconds: 30, botaoPenaltyRounds: 3 }));
    localStorage.setItem("futbobo-settings", JSON.stringify({ botaoHalfSeconds: 90, botaoGoalLimit: 3, botaoExtraSeconds: 30, botaoPenaltyRounds: 3 }));
  } catch {}
})();`;
}

/** Clica no botão (ou link) cujo texto começa com `text`. */
const clickText = (text) => `(() => {
  const want = ${JSON.stringify(text)}.toLocaleLowerCase("pt-BR");
  const found = [...document.querySelectorAll("button, a")].find((element) => element.textContent.replace(/\\s+/g, " ").trim().toLocaleLowerCase("pt-BR").startsWith(want) && !element.disabled);
  if (found) found.click();
  return Boolean(found);
})()`;

const MODES_DEF = {
  // /botao: a final avulsa no Relâmpago (75 s, 2 gols), o humano é o lado "user".
  botao: { path: "/botao/", sides: ["user"], steps: [["click", "Relâmpago"], ["wait", 200], ["click", "Jogar a final"]], matches: 1 },
  // /botao, modo de teste "Ir direto para os pênaltis".
  pens: { path: "/botao/", sides: ["user"], steps: [["click", "Ir direto para os pênaltis"]], matches: 1 },
  // /x1: duelo local no Relâmpago, os dois lados no piloto.
  x1: { path: "/x1/", sides: ["user", "cpu"], steps: [["click", "Relâmpago"], ["wait", 200], ["click", "Começar o X1"]], matches: 1 },
  // /copa: fase de grupos (e o mata-mata se o piloto se classificar), 90 s por tempo.
  copa: { path: "/copa/", sides: ["user"], steps: [["click", "Começar a Copa do Mundo"], ["wait", 400], ["click", "Jogar partida"]], matches: 4, next: [["click", "Continuar a Copa"], ["wait", 400], ["click", "Jogar partida"]] },
};

async function runOnce(cdp, { base, mode, view3d, seed, pilotSeed, canvasEvery = 8, shot = null, dramaShot = null }) {
  const def = MODES_DEF[mode];
  const startedAt = Date.now();
  const { browserContextId } = await cdp.send("Target.createBrowserContext", { disposeOnDetach: true });
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params = {}) => cdp.send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 500));
    return result.result.value;
  };
  let virtualMs = 0;
  const advance = async (ms) => {
    const expired = cdp.once("Emulation.virtualTimeBudgetExpired", sessionId);
    await send("Emulation.setVirtualTimePolicy", { policy: "pauseIfNetworkFetchesPending", budget: ms });
    await expired;
    virtualMs += ms;
  };
  const canvases = [];
  /** As imagens (data URL) dos hashes acima, só para gravar o primeiro par diferente quando há --shots. */
  const canvasData = [];
  const errors = [];
  /** Foto da tela: o compositor só entrega quadro com o tempo andando, então o tempo virtual corre solto a partir daqui. */
  const capture = async (file) => {
    await send("Emulation.setVirtualTimePolicy", { policy: "advance" });
    await sleep(400);
    const image = await withTimeout(send("Page.captureScreenshot", { format: "png" }), 20_000);
    if (image) writeFileSync(file, Buffer.from(image.data, "base64"));
  };
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 860, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: initScript({ seed, view3d }) });
    await send("Emulation.setVirtualTimePolicy", { policy: "pause", initialVirtualTime: INITIAL_VIRTUAL_TIME });
    // Sem esperar o "load": com o tempo virtual parado ele pode nunca vir. As fetches pendentes já seguram o tempo.
    await send("Page.navigate", { url: `${base}${def.path}?botaotrace=1` });
    await advance(1500);
    await evaluate(`window.__botaoPilot = ${JSON.stringify({ seed: pilotSeed, sides: def.sides })}; true`);
    let matchesDone = 0;
    const runSteps = async (steps) => {
      for (const [kind, value] of steps) {
        if (kind === "wait") await advance(value);
        else if (kind === "click" && !(await evaluate(clickText(value)))) throw new Error(`botão "${value}" não achado`);
      }
    };
    await runSteps(def.steps);
    const limitMs = 25 * 60 * 1000;
    let finishes = 0;
    let lastDramaShot = false;
    for (let step = 0; virtualMs < limitMs; step += 1) {
      // Durante a caça da foto do drama o passo é curto (a contagem dura de 1,7 a 3,4 s).
      await advance(dramaShot && !lastDramaShot ? 250 : STEP_MS);
      const canvasExpr = step % canvasEvery === 0 ? 'c && c.width > 0 ? c.toDataURL("image/png") : null' : "null";
      const probe = await evaluate(`(() => { const t = window.__botaoTrace || []; const c = document.querySelector("canvas.botao-canvas:not(.botao-canvas-3d)"); return { finishes: t.filter((e) => e.k === "finish").length, length: t.length, canvas: ${canvasExpr} }; })()`);
      if (probe.canvas) {
        canvases.push({ step, hash: createHash("sha1").update(probe.canvas).digest("hex").slice(0, 16) });
        canvasData.push(probe.canvas);
      }
      if (dramaShot && !lastDramaShot) {
        // Drama: logo depois da cobrança do humano a vez é da CPU; meio segundo depois ela está no meio da contagem.
        const cpuTurn = await evaluate(`(() => { const t = window.__botaoTrace || []; let i = t.length - 1; while (i >= 0 && t[i].k !== "penalty" && t[i].k !== "kick") i -= 1; return Boolean(document.querySelector(".botao-root-3d")) && i >= 0 && t[i].k === "penalty" && t[i].side === "user" && !t.some((e, j) => j > i && e.k === "match-end"); })()`);
        if (cpuTurn) {
          await advance(450);
          await capture(dramaShot);
          // A foto solta o tempo virtual: esta execução serve só para ela.
          break;
        }
      }
      if (probe.finishes > finishes) {
        finishes = probe.finishes;
        matchesDone += 1;
        await advance(3000);
        // No 3D (SwiftShader, lento) a Copa para no primeiro jogo; o mata-mata fica com o 2D.
        if (matchesDone >= (view3d && mode === "copa" ? 1 : def.matches) || !def.next) break;
        const more = await evaluate(clickText("Continuar a Copa"));
        if (!more) break;
        await advance(400);
        if (!(await evaluate(clickText("Jogar partida")))) break;
      }
    }
    const trace = await evaluate("window.__botaoTrace || []");
    if (shot) await capture(shot);
    return { trace, canvases, canvasData, virtualMs, matchesDone, errors, realMs: Date.now() - startedAt };
  } finally {
    await cdp.send("Target.closeTarget", { targetId }).catch(() => undefined);
    await cdp.send("Target.disposeBrowserContext", { browserContextId }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Comparação
// ---------------------------------------------------------------------------

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Primeiro índice em que os rastros diferem (-1 = iguais). */
function firstDiff(a, b) {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) if (!same(a[index], b[index])) return index;
  return -1;
}

/** Cobranças da CPU: o drama do 3D muda o momento, não a rng gasta. */
const cpuKicks = (trace, sides) => trace.filter((entry) => entry.k === "kick" && entry.side && !sides.includes(entry.side));

function compare(mode, view, head, next) {
  const sides = MODES_DEF[mode].sides;
  const report = { mode, view, headEntries: head.trace.length, newEntries: next.trace.length, matches: [head.matchesDone, next.matchesDone] };
  const diff = firstDiff(head.trace, next.trace);
  const goals = head.trace.filter((entry) => entry.k === "goal").length;
  const shows = head.trace.filter((entry) => entry.k === "show").map((entry) => entry.kind);
  report.goals = goals;
  report.shows = shows;
  report.cpuKicks = cpuKicks(head.trace, sides).length;
  if (view === "3d" && report.cpuKicks > 0) {
    // Até a primeira cobrança da CPU tudo igual; dali em diante, a rng gasta por cobrança da CPU.
    const firstKick = head.trace.findIndex((entry) => entry.k === "kick" && entry.side && !sides.includes(entry.side));
    report.identicalUntil = firstKick;
    report.prefixEqual = firstDiff(head.trace.slice(0, firstKick), next.trace.slice(0, firstKick)) === -1;
    const a = cpuKicks(head.trace, sides).map((entry) => entry.d);
    const b = cpuKicks(next.trace, sides).map((entry) => entry.d);
    const count = Math.min(a.length, b.length);
    report.kickDeltas = { head: a, new: b };
    report.ok = report.prefixEqual && count > 0 && same(a.slice(0, count), b.slice(0, count));
  } else {
    report.firstDiff = diff;
    report.ok = diff === -1;
    if (diff >= 0) report.diffAt = { head: head.trace[diff] ?? null, new: next.trace[diff] ?? null, before: head.trace.slice(Math.max(0, diff - 3), diff) };
  }
  if (view === "2d") {
    const canvasDiff = head.canvases.findIndex((entry, index) => !same(entry, next.canvases[index]));
    report.canvasFrames = head.canvases.length;
    report.canvasEqual = canvasDiff === -1 && head.canvases.length === next.canvases.length;
    report.ok = report.ok && report.canvasEqual;
  }
  // Pausa do gol: do evento "goal" ao "formation" seguinte, em quadros (igual quando o rastro é igual).
  const pauses = [];
  head.trace.forEach((entry, index) => {
    if (entry.k !== "goal") return;
    const resume = head.trace.slice(index).find((other) => other.k === "formation");
    if (resume) pauses.push(Math.round(((resume.f - entry.f) * 1000) / 60));
  });
  report.goalPausesMs = pauses;
  return report;
}

/** §11.4: atraso da CPU no pênalti (do fechamento da cobrança anterior ao chute dela), em ms de jogo. */
function cpuKickDelays(trace, sides) {
  const delays = [];
  trace.forEach((entry, index) => {
    if (entry.k !== "kick" || !entry.side || sides.includes(entry.side)) return;
    const before = trace.slice(0, index).reverse().find((other) => other.k === "penalty" || other.k === "match-end");
    if (before) delays.push({ ms: Math.round(((entry.f - before.f) * 1000) / 60), d: entry.d });
  });
  return delays;
}

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(WORK, { recursive: true });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  if (!existsSync(join(NEW_OUT, "botao", "index.html"))) throw new Error(`export novo não achado em ${NEW_OUT} (rode next build ou passe --new-out)`);
  const headOut = prepareBase();
  const servers = [await serve(headOut, PORT_HEAD), await serve(NEW_OUT, PORT_NEW)];
  const bases = { head: `http://${HOST}:${PORT_HEAD}`, new: `http://${HOST}:${PORT_NEW}` };
  const edge = await launchEdge();
  const reports = [];
  let failed = false;
  try {
    for (const view of VIEWS) {
      for (const mode of MODES) {
        const seed = 4242 + mode.length * 31 + (view === "3d" ? 7 : 0);
        const options = { mode, view3d: view === "3d", seed, pilotSeed: seed * 3 + 1 };
        const started = Date.now();
        const head = await runOnce(edge.cdp, { ...options, base: bases.head });
        const next = await runOnce(edge.cdp, {
          ...options,
          base: bases.new,
          shot: SHOTS ? join(SHOTS, `${mode}-${view}-fim.png`) : null,
        });
        const report = compare(mode, view, head, next);
        // Pixels diferentes no 2D: a base roda de novo (até 2 vezes). Há quadros que nem a base repete (o goleiro
        // andando na abertura dos pênaltis fica preso ao instante em que o primeiro quadro chegou): o quadro novo
        // vale se for igual ao de alguma execução da base com o mesmo rastro.
        for (let extra = 0; extra < 2 && report.canvasEqual === false && report.firstDiff === -1; extra += 1) {
          const again = await runOnce(edge.cdp, { ...options, base: bases.head });
          if (!same(head.trace, again.trace) || again.canvases.length !== head.canvases.length || next.canvases.length !== head.canvases.length) break;
          const unstable = head.canvases.map((entry, at) => (same(entry, again.canvases[at]) ? -1 : at)).filter((at) => at >= 0);
          report.canvasUnstable = [...new Set([...(report.canvasUnstable ?? []), ...unstable.map((at) => head.canvases[at].step)])];
          report.canvasEqual = head.canvases.every((entry, at) => same(entry, next.canvases[at]) || same(again.canvases[at], next.canvases[at]));
          report.ok = report.canvasEqual;
          if (report.canvasEqual === false) head.canvases = head.canvases.map((entry, at) => (same(again.canvases[at], next.canvases[at]) ? again.canvases[at] : entry));
        }
        // Pixels diferentes no 2D: o primeiro par de quadros vai para a pasta das fotos (base × novo).
        if (SHOTS && report.canvasEqual === false) {
          const index = head.canvases.findIndex((entry, at) => !same(entry, next.canvases[at]));
          const save = (data, tree) => data && writeFileSync(join(SHOTS, `${mode}-${view}-quadro${index}-${tree}.png`), Buffer.from(data.split(",")[1], "base64"));
          if (index >= 0) {
            mkdirSync(SHOTS, { recursive: true });
            save(head.canvasData[index], "base");
            save(next.canvasData[index], "novo");
            report.canvasDiffAt = { index, step: head.canvases[index]?.step ?? null };
          }
        }
        // Rastros inteiros ao lado do relatório (para ver onde divergiu).
        writeFileSync(join(WORK, `trace-${mode}-${view}.json`), JSON.stringify({ head: head.trace, new: next.trace, virtualMs: [head.virtualMs, next.virtualMs] }));
        report.realSeconds = Math.round((Date.now() - started) / 1000);
        report.virtualSeconds = [Math.round(head.virtualMs / 1000), Math.round(next.virtualMs / 1000)];
        report.runSeconds = [Math.round(head.realMs / 1000), Math.round(next.realMs / 1000)];
        reports.push(report);
        writeFileSync(REPORT, JSON.stringify({ rev: REV, reports }, null, 2));
        log(`${mode} ${view}: ${report.ok ? "IGUAL" : "DIFERENTE"} · ${report.headEntries} entradas, ${report.goals} gols, cobranças da CPU ${report.cpuKicks}, ${report.realSeconds}s${report.canvasUnstable?.length ? ` · quadros que nem a base repete (passo ${report.canvasUnstable.join(", ")}) fora da conta` : ""}`);
        if (!report.ok) failed = true;
      }
    }
    // §11.4: drama do pênalti da CPU no 3D (só a árvore nova), contra o 2D da mesma partida.
    if (MODES.includes("pens") && DRAMA_RUNS > 0) {
      const drama = { runs: [] };
      for (let run = 0; run < DRAMA_RUNS; run += 1) {
        const seed = 9100 + run;
        const options = { mode: "pens", seed, pilotSeed: seed * 7 + 3, base: bases.new };
        const flat = await runOnce(edge.cdp, { ...options, view3d: false });
        const deep = await runOnce(edge.cdp, { ...options, view3d: true });
        drama.runs.push({ seed, flat: cpuKickDelays(flat.trace, ["user"]), deep: cpuKickDelays(deep.trace, ["user"]) });
      }
      if (SHOTS) {
        // Uma execução a mais só para a foto do meio da contagem (a foto solta o tempo virtual).
        await runOnce(edge.cdp, { mode: "pens", seed: 9100, pilotSeed: 9100 * 7 + 3, base: bases.new, view3d: true, dramaShot: join(SHOTS, "drama-3d.png") });
      }
      const flatDelays = drama.runs.flatMap((run) => run.flat);
      const deepDelays = drama.runs.flatMap((run) => run.deep);
      // Atraso medido em quadros de 1/60 s entre o fechamento da cobrança (timer) e o quadro do chute: ±1 quadro.
      drama.flatOk = flatDelays.every((entry) => entry.ms >= 430 - 17 && entry.ms <= 430 + 34);
      drama.deepOk = deepDelays.every((entry) => entry.ms >= 1730 - 17 && entry.ms <= 3430 + 34);
      drama.rngOk = drama.runs.every((run) => {
        const count = Math.min(run.flat.length, run.deep.length);
        return count > 0 && same(run.flat.slice(0, count).map((entry) => entry.d), run.deep.slice(0, count).map((entry) => entry.d));
      });
      drama.kicks = { flat: flatDelays.length, deep: deepDelays.length };
      drama.deepRangeMs = deepDelays.length ? [Math.min(...deepDelays.map((entry) => entry.ms)), Math.max(...deepDelays.map((entry) => entry.ms))] : null;
      drama.flatRangeMs = flatDelays.length ? [Math.min(...flatDelays.map((entry) => entry.ms)), Math.max(...flatDelays.map((entry) => entry.ms))] : null;
      reports.push({ drama });
      writeFileSync(REPORT, JSON.stringify({ rev: REV, reports }, null, 2));
      log(`drama: 3D ${drama.kicks.deep} chutes em ${JSON.stringify(drama.deepRangeMs)} ms, 2D ${drama.kicks.flat} em ${JSON.stringify(drama.flatRangeMs)} ms, rng ${drama.rngOk ? "igual" : "DIFERENTE"}`);
      if (!drama.flatOk || !drama.deepOk || !drama.rngOk) failed = true;
    }
  } finally {
    await edge.close();
    for (const server of servers) server.close();
  }
  log(`relatório: ${REPORT}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

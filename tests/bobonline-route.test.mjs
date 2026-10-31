import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

// Rota /bobonline (design §1, §1.10, §11.1): fontes, menu, sitemap, build e os textos do resultado.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
stubBrowser();

const copy = loadTs("app/bobonline/result-copy.ts");
const codes = loadTs("app/bobonline/net/codes.ts");
const room = loadTs("app/bobonline/use-room.ts");
const history = loadTs("app/bobonline/screen-history.ts");
const share = loadTs("app/bobonline/share.ts");
const { BOB_RULE_PRESETS } = loadTs("app/bobonline/teams/match-setup.ts");

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const SETUP = {
  matchId: "K7MPX3-r1m0-0",
  seed: 1,
  competitionName: "Bobonline",
  stageName: "X1",
  neutralVenue: true,
  userIsHost: true,
  player: { name: "Zé", number: 10, position: "MC", overall: 76 },
  userTeam: { id: "bob-aaaaaaaaaa", name: "Esporte Clube Vila Nova", shortName: "Vila Nova", abbr: "ECV", primary: "#0b6b45", secondary: "#f4c542", strength: 76 },
  cpuTeam: { id: "bob-bbbbbbbbbb", name: "Atlético Penha", shortName: "Penha", abbr: "ATP", primary: "#c8102e", secondary: "#ffffff", strength: 76 },
  difficulty: 3,
  rules: BOB_RULE_PRESETS.classic.rules,
  localControl: true,
};

const goal = (side, period, clock, text) => ({ period, clock, side, kind: "goal", scorer: "x", assist: null, byUser: false, text });

function result(overrides) {
  const empty = { flicks: 10, touches: 4, posts: 0 };
  return {
    matchId: SETUP.matchId, simulated: false, outcome: "win", goalsFor: 0, goalsAgainst: 0, penaltyFor: null, penaltyAgainst: null,
    playerGoals: 0, playerAssists: 0, manOfTheMatch: false, decision: "regulation", turns: 40,
    stats: { user: { ...empty }, cpu: { ...empty } }, timeline: [], champion: true, ...overrides,
  };
}

test("rota: página, telas, layout e textos principais", () => {
  const page = read("app/bobonline/page.tsx");
  assert.match(page, /^"use client";/);
  assert.match(page, /Bobonline/);
  // A página é a máquina de telas; os textos moram nas telas que ela importa.
  for (const screen of ["HomeScreen", "CreateRoomScreen", "JoinRoomScreen", "LobbyScreen", "BracketScreen", "MatchScreen", "ResultScreen", "ChampionScreen", "OtherTabScreen", "NextMatchBanner"]) {
    assert.match(page, new RegExp(`(from |import\\()"\\./screens/${screen}"`), screen);
  }
  const route = [page, ...readdirSync(join(ROOT, "app/bobonline/screens")).map((name) => read(`app/bobonline/screens/${name}`))].join("\n");
  for (const text of ["Bobonline", "Criar sala", "Entrar na sala", "X1", "Torneio de 4", "Torneio de 8", "Sair da sala?", "Estou pronto", "APITO FINAL", "Campeão do torneio", "O Bobonline já está aberto em outra aba."]) {
    assert.ok(route.includes(text), text);
  }
  const layout = read("app/bobonline/layout.tsx");
  assert.match(layout, /canonical: "\/bobonline\/"/);
  assert.match(layout, /title: "Bobonline: botão online com os amigos"/);
  assert.match(read("app/bobonline/bobonline.css"), /\.bob-shell \{/);
});

test("menu, sitemap, dependência e build estático", () => {
  const shell = read("app/components/shell/FutboboShell.tsx");
  assert.match(shell, /href="\/bobonline"/);
  assert.match(shell, /<small>ONLINE<\/small><strong>Bobonline<\/strong>/);
  assert.match(shell, /href="\/bobonline\/\?voltar=1"/);
  assert.match(shell, /peekBobonlineSession/);
  assert.match(shell, /online com a galera/);
  assert.match(read("app/components/shell/FutboboShell.module.css"), /\.modeList \{ min-height:0; grid-template-rows:repeat\(5,/);
  assert.match(read("app/sitemap.ts"), /https:\/\/futbobo\.top\/bobonline\//);
  assert.match(read("package.json"), /"trystero": "0\.26\.0"/);
  assert.ok(existsSync(join(ROOT, "out/bobonline/index.html")), "out/bobonline/index.html (rode o build antes)");
});

test("o driver online não entra no bundle das outras rotas", () => {
  const match = read("app/botao/BotaoMatch.tsx");
  const driverImports = match.split("\n").filter((line) => /from "\.\/online-driver"/.test(line));
  assert.ok(driverImports.length > 0);
  for (const line of driverImports) assert.match(line, /^import type /, line);
  assert.doesNotMatch(match, /import\(["']\.\/online-driver["']\)/);
});

test("nada do /bobonline puxa a carreira, o game-data, o adapter ou o result-story", () => {
  const forbidden = /from ["'][^"']*(result-story|\/adapter|game-data|\/career\/)[^"']*["']|import\(["'][^"']*(result-story|\/adapter|game-data|\/career\/)/;
  for (const file of filesUnder("app/bobonline")) {
    assert.doesNotMatch(read(file), forbidden, relative(ROOT, join(ROOT, file)));
  }
  // O menu só espia a sessão (session-peek importa só storage.ts).
  assert.deepEqual(
    [...read("app/bobonline/net/session-peek.ts").matchAll(/from "([^"]+)"/g)].map((match) => match[1]),
    ["../storage"],
  );
});

test("Android: plugin KeepAwake registrado na activity", () => {
  const plugin = read("android/app/src/main/java/com/futbobo/game/KeepAwakePlugin.java");
  assert.match(plugin, /@CapacitorPlugin\(name = "KeepAwake"\)/);
  assert.match(plugin, /FLAG_KEEP_SCREEN_ON/);
  const activity = read("android/app/src/main/java/com/futbobo/game/MainActivity.java");
  assert.match(activity, /registerPlugin\(KeepAwakePlugin\.class\);\s+super\.onCreate\(savedInstanceState\);/);
  assert.match(read("app/bobonline/wake-lock.ts"), /registerPlugin<KeepAwakePlugin>\("KeepAwake"\)/);
});

test("o /bobonline não divide ../android-app com o menu (pacote do \"/\", §11.6)", () => {
  // Dividido entre as duas rotas, o android-app sai do módulo do shell e o "/" passa do orçamento.
  for (const file of filesUnder("app/bobonline")) {
    assert.doesNotMatch(read(file), /from ["'](\.\.\/)+android-app["']|import\(["'](\.\.\/)+android-app["']\)/, file);
  }
  // A atualização do APK abre o mesmo arquivo que o menu baixa.
  const url = (source) => source.match(/ANDROID_APK_URL\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(url(read("app/android-app.ts")));
  assert.equal(url(read("app/bobonline/page.tsx")), url(read("app/android-app.ts")));
});

test("história do resultado: virada de qualquer lado, pênaltis e limite de gols", () => {
  const homeComeback = result({
    outcome: "win", goalsFor: 2, goalsAgainst: 1, decision: "regulation",
    timeline: [goal("cpu", 1, 100, "Gol de Beto"), goal("user", 1, 60, "Gol de Zé"), goal("user", 1, 30, "Gol de Caio")],
  });
  // Clássico: um tempo só de 120 s; faltando 30 s = minuto 68 da transmissão.
  assert.equal(copy.describeOnlineResult(homeComeback, SETUP, null), "Virada de Vila Nova. Último gol: Gol de Caio aos 68'.");

  // Virada do visitante, fechada na prorrogação (período 2 com um tempo só): o minuto leva " · PR".
  const awayComeback = result({
    outcome: "loss", goalsFor: 1, goalsAgainst: 2, champion: false, decision: "extra-time",
    timeline: [goal("user", 1, 100, "Gol de Zé"), goal("cpu", 1, 70, "Gol de Beto"), goal("cpu", 2, 10, "Gol de Duda")],
  });
  assert.match(copy.describeOnlineResult(awayComeback, SETUP, null), /^Virada de Penha\. Último gol: Gol de Duda aos \d+' · PR\.$/);

  const extra = result({ outcome: "win", goalsFor: 1, goalsAgainst: 0, decision: "extra-time", timeline: [goal("user", 2, 20, "Gol de Caio")] });
  assert.match(copy.describeOnlineResult(extra, SETUP, null), /^A prorrogação teve gol de caio aos \d+' · PR; Vila Nova ficou com a vitória\.$/);

  // Quem esteve na frente o tempo todo não tem virada.
  const steady = result({ outcome: "win", goalsFor: 2, goalsAgainst: 1, timeline: [goal("user", 1, 100, "Gol de Zé"), goal("cpu", 1, 50, "Gol de Beto"), goal("user", 1, 10, "Gol de Caio")] });
  assert.match(copy.describeOnlineResult(steady, SETUP, null), /^Último gol da partida: Gol de Caio/);

  const pens = result({ outcome: "loss", goalsFor: 2, goalsAgainst: 2, penaltyFor: 3, penaltyAgainst: 4, decision: "penalties", champion: false });
  assert.equal(copy.describeOnlineResult(pens, SETUP, null), "Depois de 2 × 2 no campo, Penha venceu nos pênaltis por 4 × 3.");

  const limit = result({ outcome: "win", goalsFor: 3, goalsAgainst: 0, decision: "goal-limit", timeline: [goal("user", 1, 100, "Gol de Zé"), goal("user", 1, 80, "Gol de Zé"), goal("user", 1, 20, "Gol de Caio")] });
  assert.match(copy.describeOnlineResult(limit, SETUP, null), /^Vila Nova chegou ao 3º gol e fechou a partida: Gol de Caio aos/);
  assert.equal(copy.describeOnlineResult(result({ outcome: "win" }), SETUP, null), "A partida terminou sem gols em campo.");
});

test("história do resultado: cada tipo de W.O. tem o seu texto (tempo nunca vira desistência)", () => {
  const bracket = (winner, walkover) => ({
    matchId: SETUP.matchId, winner, homeGoals: winner === "home" ? 3 : 0, awayGoals: winner === "home" ? 0 : 3,
    homePens: null, awayPens: null, decision: "walkover", walkover, resultHash: "x", reportedBy: "host", at: 0,
  });
  const timeout = copy.resultFromBracket(bracket("away", "timeout"));
  assert.equal(timeout.outcome, "loss");
  assert.equal(timeout.goalsAgainst, 3);
  assert.equal(timeout.walkover, true);
  assert.equal(copy.describeOnlineResult(timeout, SETUP, "timeout"), "Penha venceu por W.O.: Vila Nova não voltou a tempo.");
  assert.doesNotMatch(copy.describeOnlineResult(timeout, SETUP, "timeout"), /desist|abandon/i);
  assert.equal(copy.describeOnlineResult(copy.resultFromBracket(bracket("home", "abandon")), SETUP, "abandon"), "Vila Nova venceu por W.O.: Penha desistiu da partida.");
  assert.match(copy.describeOnlineResult(copy.resultFromBracket(bracket("home", "double")), SETUP, "double"), /sorteio deu a vitória para Vila Nova/);
  assert.equal(copy.describeOnlineResult(copy.resultFromBracket(bracket("away", "bye")), SETUP, "bye"), "Penha avançou de folga.");

  assert.equal(copy.resultHeadline({ won: true, walkover: null, opponent: "Fominha" }), "Você venceu!");
  assert.equal(copy.resultHeadline({ won: false, walkover: null, opponent: "Fominha" }), "Você perdeu");
  assert.equal(copy.resultHeadline({ won: true, walkover: "abandon", opponent: "Fominha" }), "Vitória por W.O.: Fominha desistiu");
  assert.equal(copy.resultHeadline({ won: true, walkover: "timeout", opponent: "Fominha" }), "Vitória por W.O.: Fominha não voltou a tempo");
  assert.equal(copy.resultHeadline({ won: false, walkover: "timeout", opponent: "Fominha" }), "Você não voltou a tempo: derrota por W.O.");
  assert.equal(copy.resultHeadline({ won: false, walkover: "abandon", opponent: "Fominha" }), "Você desistiu: derrota por W.O.");
  assert.equal(copy.resultHeadline({ won: true, walkover: "double", opponent: "a CPU" }), "Decidido no sorteio");
  assert.equal(copy.scoreLine(2, 2, { mine: 4, theirs: 3 }), "2 × 2 (pên. 4 × 3)");
  assert.equal(copy.scoreLine(1, 0, null), "1 × 0");
});

test("código da sala: link, mensagem inteira do WhatsApp, separadores e inválidos", () => {
  assert.equal(codes.extractRoomCode("https://futbobo.top/bobonline/?sala=K7MPX3&p=1"), "K7MPX3");
  assert.equal(codes.extractRoomCode(codes.shareText("K7MPX3")), "K7MPX3");
  assert.equal(codes.extractRoomCode("Bora jogar? Entra na sala K7MPX3"), "K7MPX3");
  assert.equal(codes.extractRoomCode("k7m-px3"), "K7MPX3");
  assert.equal(codes.extractRoomCode("K7M PX3"), "K7MPX3");
  assert.equal(codes.extractRoomCode("K7M·PX3"), "K7MPX3");
  assert.equal(codes.extractRoomCode("ABC123"), null); // 1 não existe no alfabeto
  assert.equal(codes.extractRoomCode("K7MPX"), null);
  assert.equal(codes.extractRoomCode(""), null);
  assert.equal(codes.formatRoomCode("K7MPX3"), "K7M·PX3");
  assert.equal(share.whatsappUrl("K7MPX3"), `https://wa.me/?text=${encodeURIComponent(codes.shareText("K7MPX3"))}`);
});

test("link com o id do anfitrião (&h=): sai no convite, volta do link colado (em qualquer caixa) e lixo não vira id", () => {
  const host = "7k2mx9qrtz";
  assert.equal(codes.roomLink("K7MPX3", host), `${codes.roomLink("K7MPX3")}&h=${host}`);
  assert.equal(codes.roomLink("K7MPX3", "nao-e-id"), codes.roomLink("K7MPX3"));
  assert.equal(codes.roomLink("K7MPX3", null), codes.roomLink("K7MPX3"));
  const text = codes.shareText("K7MPX3", host);
  assert.equal(codes.extractRoomCode(text), "K7MPX3");
  assert.equal(codes.extractLinkHost(text), host);
  // O campo do código põe o que foi colado em maiúsculas: o id volta em minúsculas.
  assert.equal(codes.extractLinkHost(text.toUpperCase()), host);
  assert.equal(codes.extractLinkHost(`?sala=K7MPX3&h=${host}z`), null, "11 símbolos");
  assert.equal(codes.extractLinkHost("?sala=K7MPX3&h=7k2mx9qrti"), null, "i não é do Crockford");
  assert.equal(codes.extractLinkHost("?sala=K7MPX3&p=1"), null);
  assert.equal(codes.extractLinkHost("K7MPX3"), null);
  assert.equal(codes.isPlayerIdLike(host), true);
  assert.equal(codes.isPlayerIdLike(host.toUpperCase()), false);
  assert.equal(share.whatsappUrl("K7MPX3", host), `https://wa.me/?text=${encodeURIComponent(text)}`);
  // Sem sala aberta nesta página, o convite sai sem o id.
  assert.equal(share.hostOfRoom("K7MPX3"), null);
});

test("textos compartilhados da sala", () => {
  assert.equal(room.settingsLine({ format: "t4", rules: "classic", cpuLevel: 3, fillWithCpu: true, allowSpectators: true, locked: false }), "Torneio de 4 · Clássico (3 gols · 2 minutos)");
  assert.equal(room.settingsLine({ format: "x1", rules: "flash", cpuLevel: 3, fillWithCpu: true, allowSpectators: true, locked: true }), "X1 · Relâmpago (2 gols · 90 segundos) · com senha");
  assert.equal(room.joinErrorText("iniciada", "x1"), "A partida já começou.");
  assert.equal(room.joinErrorText("iniciada", "t8"), "O torneio já começou.");
  assert.equal(room.joinErrorText("conexao"), "Não deu para conectar com a sala. Tente outra rede (Wi-Fi ↔ dados móveis).");
  assert.ok(room.RETRYABLE_ERRORS.has("nao-encontrada") && !room.RETRYABLE_ERRORS.has("cheia"));
  const info = (proto, engine) => ({ proto, engine, celebrations: 18, app: "v96" });
  assert.equal(room.versionDetail(info(1, 1), info(2, 1)), "(versão do online: você 1.1 · sala 2.1)");
  assert.equal(room.clockLabel(72), "1:12");
  assert.equal(room.clockLabel(-3), "0:00");
});

test("cliente da sala: criar, falhar, sair, largar e lembrar a última partida jogada", async () => {
  const calls = [];
  const listeners = new Set();
  let state = { phase: "connecting", joinStage: 0, error: null, incompatible: null, snapshot: null, teams: {}, me: "eu", isHost: true, health: {}, live: {}, duel: null, nextMatch: null, rematch: null, toasts: [] };
  const fake = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    leave: async () => void calls.push("leave"),
    close: async () => void calls.push("close"),
  };
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  let failWith = null;
  room.setRoomClientLoader(async () => ({
    create: async () => {
      if (failWith) throw failWith;
      return fake;
    },
    join: async () => {
      if (failWith) throw failWith;
      return fake;
    },
    resume: async () => fake,
  }));
  const args = { team: { id: "bob-x" }, nickname: "Fominha" };

  await room.createRoom({ ...args, settings: {} });
  assert.equal(room.getRoomView().attempt.kind, "create");
  assert.equal(room.getRoomView().loading, false);
  assert.equal(room.getRoomView().state.phase, "connecting");
  const duel = { bracketId: "r1m0", matchId: "K7MPX3-r1m0-0", role: "authority", launch: {} };
  set({ phase: "in-room", duel });
  assert.equal(room.getRoomView().lastPlayed, duel);
  set({ duel: { ...duel, matchId: "K7MPX3-r2m0-0", role: "spectator" } });
  assert.equal(room.getRoomView().lastPlayed, duel, "assistir não troca a última partida jogada");
  set({ duel: null });
  assert.equal(room.getRoomView().lastPlayed, duel);

  await room.leaveRoom();
  assert.deepEqual(calls, ["leave"]);
  assert.equal(room.getRoomView().state, null);
  assert.equal(room.roomClient(), null);

  failWith = "cheia";
  await room.joinRoom({ ...args, code: "K7MPX3" });
  assert.equal(room.getRoomView().failure, "cheia");
  failWith = new Error("boom");
  await room.createRoom({ ...args, settings: {} });
  assert.equal(room.getRoomView().failure, "abrir");
  await room.joinRoom({ ...args, code: "K7MPX3" });
  assert.equal(room.getRoomView().failure, "sem-rede");
  failWith = { code: "versao-nova" };
  await room.retryRoom();
  assert.equal(room.getRoomView().failure, "versao-nova");

  failWith = null;
  calls.length = 0;
  await room.resumeRoom({ code: "K7MPX3", isHost: false, epoch: 1, savedAt: 0 }, args);
  await room.cancelAttempt();
  assert.deepEqual(calls, ["close"], "cancelar a volta só larga a conexão (a sessão salva fica)");
  await room.joinRoom({ ...args, code: "K7MPX3" });
  await room.cancelAttempt();
  assert.deepEqual(calls, ["close", "leave"]);
});

test("histórico: entradas por tela, voltar só para trás", () => {
  const entries = [{ state: null }];
  let index = 0;
  const popListeners = new Set();
  globalThis.window.history = {
    pushState(state) {
      entries.splice(index + 1);
      entries.push({ state });
      index += 1;
    },
    replaceState(state) {
      entries[index] = { state };
    },
    go(delta) {
      index = Math.max(0, Math.min(entries.length - 1, index + delta));
      for (const listener of popListeners) listener({ state: entries[index].state });
    },
  };
  globalThis.window.addEventListener = (type, listener) => type === "popstate" && popListeners.add(listener);
  globalThis.window.removeEventListener = (type, listener) => type === "popstate" && popListeners.delete(listener);
  const backs = [];
  const stop = history.listenBack((event) => backs.push(event));
  history.markBaseEntry("home");
  history.pushScreen("create");
  history.pushScreen("lobby");
  assert.equal(history.historyDepth(), 2);
  window.history.go(-1);
  assert.deepEqual(backs, [{ screen: "create", depth: 1 }]);
  window.history.go(1); // avançar não é voltar
  assert.equal(backs.length, 1);
  assert.equal(history.historyDepth(), 2);
  assert.ok(history.ROOM_SCREENS.has("lobby") && !history.ROOM_SCREENS.has("home"));
  stop();
});

/** Histórico falso com entradas já existentes (`at` = a atual), como o navegador guarda entre montagens. */
function fakeHistory(states, at) {
  const entries = states.map((state) => ({ state }));
  let index = at;
  const popListeners = new Set();
  globalThis.window.history = {
    get state() {
      return entries[index].state;
    },
    pushState(state) {
      entries.splice(index + 1);
      entries.push({ state });
      index += 1;
    },
    replaceState(state) {
      entries[index] = { state };
    },
    go(delta) {
      index = Math.max(0, Math.min(entries.length - 1, index + delta));
      for (const listener of popListeners) listener({ state: entries[index].state });
    },
  };
  globalThis.window.addEventListener = (type, listener) => type === "popstate" && popListeners.add(listener);
  globalThis.window.removeEventListener = (type, listener) => type === "popstate" && popListeners.delete(listener);
  return { entries, index: () => index };
}

test("histórico: remontar numa entrada do Bobonline mantém a profundidade (o 1º voltar não some)", () => {
  // início(0) → entrar(1) → lobby(2), menu do FUTBOBO, voltar do navegador: a página monta de novo no lobby.
  const next = { __NA: true };
  const fake = fakeHistory([null, { ...next, bob: "home", bobN: 0 }, { ...next, bob: "join", bobN: 1 }, { ...next, bob: "lobby", bobN: 2 }, next], 3);
  const backs = [];
  const stop = history.listenBack((event) => backs.push(event));
  history.markBaseEntry("lobby");
  assert.equal(history.historyDepth(), 2);
  assert.equal(fake.entries[3].state.__NA, true, "o estado do Next vai junto");
  window.history.go(-1);
  assert.deepEqual(backs, [{ screen: "join", depth: 1 }], "o primeiro voltar chega na página");
  // Do início, sair do Bobonline cai na entrada de antes da profundidade 0.
  history.leaveBobonlineHistory(1);
  assert.equal(fake.index(), 0);
  stop();

  // Entrada nova (o menu empurrou /bobonline): base 0.
  fakeHistory([null, next], 1);
  history.markBaseEntry("home");
  assert.equal(history.historyDepth(), 0);
});

test("voltar: a tela aberta usa o voltar antes da página (folha, confirmação)", () => {
  assert.equal(history.runScreenBack(), false, "sem tela registrada a página decide");
  let sheetOpen = true;
  const release = history.claimBack(() => {
    if (!sheetOpen) return false;
    sheetOpen = false;
    return true;
  });
  assert.equal(history.runScreenBack(), true, "fecha a folha e a tela fica");
  assert.equal(history.runScreenBack(), false, "sem folha: a página troca de tela");
  const other = history.claimBack(() => {
    throw new Error("quebrou");
  });
  release(); // desregistrar um handler antigo não derruba o novo
  assert.equal(history.runScreenBack(), false, "erro na tela não prende o voltar");
  other();
  assert.equal(history.runScreenBack(), false);
  const page = read("app/bobonline/page.tsx");
  assert.match(page, /if \(runScreenBack\(\)\) \{\s+pushScreen\(current\);\s+return;\s+\}\s+blurFocused\(\);/);
});

test("cliente da sala: torneio novo esquece a partida do anterior; outra aba não regrava a sala", async () => {
  const calls = [];
  const listeners = new Set();
  const snap = (seed, extra = {}) => ({ code: "K7MPX3", seed, stage: "running", bracket: { matches: [] }, settings: { format: "t4" }, ...extra });
  let state = { phase: "in-room", joinStage: 0, error: null, incompatible: null, snapshot: snap(11), teams: {}, me: "eu", isHost: false, health: {}, live: {}, duel: null, nextMatch: null, rematch: null, toasts: [] };
  const fake = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    leave: async () => void calls.push("leave"),
    close: async () => void calls.push("close"),
  };
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  room.setRoomClientLoader(async () => ({ create: async () => fake, join: async () => fake, resume: async () => fake }));
  await room.joinRoom({ team: { id: "bob-x" }, nickname: "Fominha", code: "K7MPX3" });

  // A chave repete os ids em todo torneio: a final é sempre K7MPX3-r2m0-0.
  const final = { bracketId: "r2m0", matchId: "K7MPX3-r2m0-0", role: "follower", launch: {} };
  set({ duel: final });
  set({ duel: null, snapshot: snap(11, { stage: "done" }) });
  assert.equal(room.getRoomView().lastPlayed, final);
  // X1 de volta ao lobby (mesmo sorteio): o resultado continua na tela ("voltou para a sala").
  set({ snapshot: snap(11, { stage: "lobby", bracket: null, settings: { format: "x1" } }) });
  assert.equal(room.getRoomView().lastPlayed, final);
  // "Novo torneio com a mesma sala": sorteio novo, a partida velha sai.
  set({ snapshot: snap(22, { stage: "lobby", bracket: null }) });
  assert.equal(room.getRoomView().lastPlayed, null);
  assert.equal(room.roundKeyOf(snap(11)), "K7MPX3:11");
  assert.notEqual(room.roundKeyOf(snap(11)), room.roundKeyOf(snap(22)));
  assert.equal(room.roundKeyOf(null), null);

  // Outra aba tomou a sessão: largar o cliente não chama close() (gravaria a sala velha por cima da dela).
  set({ phase: "superseded" });
  await room.closeRoom();
  assert.deepEqual(calls, []);
  assert.equal(room.roomClient(), null);

  // A página reconhece a ressaca pelo estado (removido, outra aba, erro) e sabe o aviso do início.
  assert.equal(room.deadClientNotice(null), undefined);
  assert.equal(room.deadClientNotice({ phase: "in-room", error: null }), undefined);
  assert.equal(room.deadClientNotice({ phase: "connecting", error: null }), undefined);
  assert.equal(room.deadClientNotice({ phase: "superseded", error: null }), "Você entrou na sala em outra aba.");
  assert.equal(room.deadClientNotice({ phase: "error", error: "removido" }), "Você foi removido desta sala.");
  assert.equal(room.deadClientNotice({ phase: "error", error: "conexao" }), null);
  assert.equal(room.deadClientNotice({ phase: "left", error: null }), null);

  // A página: resultados e dispensas da rodada anterior saem quando a rodada muda; a montagem larga o cliente morto.
  const page = read("app/bobonline/page.tsx");
  assert.match(page, /const round = roundKeyOf\(snapshot\);\s+if \(round !== null && round !== seenRound\) \{[\s\S]{0,120}setFinished\(\{\}\);\s+setDismissed\(\[\]\);\s+setForced\(\[\]\);/);
  assert.match(page, /deadClientNotice\(leftover\.state\)/);
});

test("volta automática: o link de outra sala manda; ?voltar=1 sempre volta", () => {
  const session = { code: "K7MPX3", isHost: false, epoch: 1, savedAt: 1_000_000 };
  const recent = session.savedAt + 60_000;
  assert.equal(room.autoResumeAllowed(session, { now: recent, wanted: false, linkCode: null }), true);
  assert.equal(room.autoResumeAllowed(session, { now: recent, wanted: false, linkCode: "B4N9RT" }), false, "link de outra sala: fica na tela de entrar");
  assert.equal(room.autoResumeAllowed(session, { now: recent, wanted: false, linkCode: "K7MPX3" }), true, "link da mesma sala");
  assert.equal(room.autoResumeAllowed(session, { now: session.savedAt + room.AUTO_RESUME_MS, wanted: false, linkCode: null }), false);
  assert.equal(room.autoResumeAllowed(session, { now: session.savedAt + 10 * 60_000, wanted: true, linkCode: "B4N9RT" }), true);
  assert.equal(room.autoResumeAllowed({ ...session, savedAt: Date.now() }, { wanted: false, linkCode: null }), true, "sem now: o relógio de agora");
  assert.match(read("app/bobonline/page.tsx"), /autoResumeAllowed\(session, \{ wanted: resumeWantedRef\.current, linkCode: linkCodeRef\.current \}\)/);
});

test("faixa da próxima partida: um aviso por \"pronto?\" (torneio novo avisa de novo) e também assistindo", () => {
  const check = (seed, status = "ready-check", deadline = 5000) => ({
    me: "eu",
    snapshot: { code: "K7MPX3", seed, bracket: { matches: [{ id: "r2m0", replay: 0, status, readyDeadline: deadline }] } },
    nextMatch: { bracketId: "r2m0", opponent: "cpu", readyDeadlineLocal: 4000, holdUntilLocal: null },
  });
  assert.equal(room.readyCheckKey(check(1)), room.readyCheckKey(check(1)));
  assert.notEqual(room.readyCheckKey(check(1)), room.readyCheckKey(check(2)), "a mesma r2m0 no torneio seguinte");
  assert.notEqual(room.readyCheckKey(check(1)), room.readyCheckKey(check(1, "ready-check", 9000)), "outra checagem");
  assert.equal(room.readyCheckKey(check(1, "playing")), null);
  assert.equal(room.readyCheckKey({ ...check(1), nextMatch: null }), null);
  const banner = read("app/bobonline/screens/NextMatchBanner.tsx");
  assert.match(banner, /readyCheckKey\(state\)/);
  assert.doesNotMatch(banner, /announced\.has\(bracketId\)/);
  // Assistindo (tela "spectate") a faixa também aparece, por cima da mesa.
  assert.match(read("app/bobonline/page.tsx"), /duel\.role === "spectator" && \([\s\S]{0,160}<div className="bob-match-banner"><NextMatchBanner state=\{state\} \/><\/div>/);
  assert.match(read("app/bobonline/bobonline.css"), /\.bob-match-banner:empty \{ display: none; \}/);
});

test("E2E Kamehameha: o raio é amostrado por quadro do disparo até sumir", () => {
  const script = read("scripts/bobonline-e2e.mjs");
  const scenario = script.slice(script.indexOf("async function scenarioKamehameha"), script.indexOf("async function scenarioLayouts"));
  assert.match(scenario, /requestAnimationFrame\(loop\)/);
  assert.match(scenario, /waitFor\(`window\.__kame\.samples > 0`/);
  assert.doesNotMatch(scenario, /const beam = await A\.eval\(`window\.__botao3d\?\.projectBeamEnd/);
});

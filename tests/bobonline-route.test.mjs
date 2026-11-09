import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

// Rota /bobonline (design §1, §1.10, §11.1): fontes, menu, sitemap, build e os textos do resultado.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// CRLF vira LF: num checkout do Windows (core.autocrlf) as regex de várias linhas falhariam.
const read = (path) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
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
  // O menu é a primeira folha do álbum: o Bobonline é uma linha do índice.
  const home = read("app/components/career/album/menu/HomeSpread.tsx");
  assert.match(home, /href: "\/bobonline", title: "Bobonline"/);
  assert.match(home, /tag: "Online"/);
  assert.match(home, /href="\/bobonline\/\?voltar=1"/);
  assert.match(shell, /peekBobonlineSession/);
  assert.match(shell, /bobonlineRoom=\{bobonlineRoom\}/);
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
  // "ninguém respondeu" × "a sala respondeu e a ligação não fechou": cada um diz o seu (r-sim §4).
  assert.equal(room.joinErrorText("conexao"), "Achamos a sala, mas os aparelhos não conseguiram se conectar. Tente outra rede (Wi-Fi ↔ dados móveis).");
  assert.equal(room.joinErrorText("nao-encontrada"), "Não achamos a sala. Confira o código e peça para o anfitrião deixar a sala aberta na tela.");
  assert.ok(room.RETRYABLE_ERRORS.has("nao-encontrada") && !room.RETRYABLE_ERRORS.has("cheia"));
  const info = (proto, engine) => ({ proto, engine, celebrations: 18, app: "v96" });
  assert.equal(room.versionDetail(info(1, 1), info(2, 1)), "(versão do online: você 1.1 · sala 2.1)");
  assert.equal(room.clockLabel(72), "1:12");
  assert.equal(room.clockLabel(-3), "0:00");
});

test("cliente da sala: criar, falhar, sair, largar e lembrar a última partida jogada", async () => {
  const calls = [];
  const listeners = new Set();
  let state = { phase: "connecting", joinStage: 0, search: null, signaling: "ok", links: {}, netError: null, error: null, incompatible: null, snapshot: null, teams: {}, me: "eu", isHost: true, health: {}, live: {}, duel: null, nextMatch: null, rematch: null, toasts: [] };
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
  let state = { phase: "in-room", joinStage: 0, search: null, signaling: "ok", links: {}, netError: null, error: null, incompatible: null, snapshot: snap(11), teams: {}, me: "eu", isHost: false, health: {}, live: {}, duel: null, nextMatch: null, rematch: null, toasts: [] };
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
  // Quem estava na sala e ela acabou (convite velho de uma sala fechada, sem rede): o início diz por quê.
  const gone = (error, phase = "error") => ({ phase, error, snapshot: { code: "K7MPX3" } });
  assert.equal(room.deadClientNotice(gone("nao-encontrada")), "A sala K7M·PX3 não respondeu.");
  assert.equal(room.roomGoneNotice(gone("nao-encontrada")), "A sala K7M·PX3 não respondeu.");
  assert.equal(room.roomGoneNotice(gone("sem-rede")), room.joinErrorText("sem-rede"));
  assert.equal(room.roomGoneNotice(gone("conexao")), room.joinErrorText("conexao"));
  assert.equal(room.roomGoneNotice(gone("versao-nova")), room.joinErrorText("versao-nova"));
  assert.equal(room.roomGoneNotice(gone("removido")), "Você foi removido desta sala.");
  assert.equal(room.roomGoneNotice(gone("iniciada")), null, "recusa de quem entrava (cópia de prévia): a tela de entrar já disse");
  assert.equal(room.roomGoneNotice(gone(null, "left")), null, "saída pedida: calada");

  // A página: resultados e dispensas da rodada anterior saem quando a rodada muda; a montagem larga o cliente morto.
  const page = read("app/bobonline/page.tsx");
  assert.match(page, /const round = roundKeyOf\(snapshot\);\s+if \(round !== null && round !== seenRound\) \{[\s\S]{0,120}setFinished\(\{\}\);\s+setDismissed\(\[\]\);\s+setForced\(\[\]\);/);
  assert.match(page, /deadClientNotice\(leftover\.state\)/);
  // O cliente morreu na sala: o aviso sai de roomGoneNotice, e o cartão "Voltar para a sala" segue a sessão salva.
  assert.match(page, /const gone = getRoomView\(\)\.state;\s+const notice = gone \? roomGoneNotice\(gone\) : null;/);
  assert.match(page, /setSaved\(loadSession\(\)\);\s+setHomeNotice\(notice\);/);
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

test("volta automática: o próprio convite volta para a sala depois dos 2 min (dentro da validade)", () => {
  // O anfitrião manda o convite, fica no WhatsApp, e toca no próprio link 10 min depois (B4).
  const host = { code: "K7MPX3", isHost: true, epoch: 1, savedAt: 1_000_000 };
  const later = host.savedAt + 10 * 60_000;
  assert.equal(room.autoResumeAllowed(host, { now: later, wanted: false, linkCode: "K7MPX3" }), true, "link da própria sala");
  assert.equal(room.autoResumeAllowed(host, { now: later, wanted: false, linkCode: null }), false, "sem link continua só a sessão recente");
  assert.equal(room.autoResumeAllowed(host, { now: later, wanted: false, linkCode: "B4N9RT" }), false, "link de outra sala nunca volta");
  const ttl = host.savedAt + 30 * 60_000;
  assert.equal(room.autoResumeAllowed(host, { now: ttl, wanted: false, linkCode: "K7MPX3" }), true, "no limite da validade");
  assert.equal(room.autoResumeAllowed(host, { now: ttl + 1, wanted: false, linkCode: "K7MPX3" }), false, "sessão vencida não volta");
  // A página não manda o próprio link para a tela de entrar: o início mostra o "Voltando para a sala…".
  const page = read("app/bobonline/page.tsx");
  assert.match(page, /const ownLink = pending !== null && autoResumeAllowed\(pending, \{ wanted: wantsResume, linkCode: linkCodeRef\.current \}\);/);
  assert.match(page, /if \(!ownLink\) setNav\(\{ \.\.\.HOME, screen: "join" \}\);/);
});

test("busca: o texto sai do passo de verdade, não do relógio", () => {
  assert.deepEqual(room.searchCopy("rede", "K7MPX3", 0), { line: "Conectando…", hint: null });
  assert.deepEqual(room.searchCopy("procurando", "K7MPX3", 3000), { line: "Procurando a sala K7M·PX3…", hint: null });
  assert.deepEqual(room.searchCopy("procurando", "K7MPX3", room.SEARCH_HOST_HINT_MS), {
    line: "Procurando a sala K7M·PX3…", hint: "O anfitrião precisa estar com a sala aberta na tela.",
  });
  assert.equal(room.searchCopy("procurando", null, 0).line, "Procurando a sala…");
  assert.deepEqual(room.searchCopy("achou", "K7MPX3", 30_000), { line: "Sala encontrada. Conectando os aparelhos…", hint: null });
  assert.deepEqual(room.searchCopy("apoio", "K7MPX3", 30_000), { line: "A conexão direta não fechou. Tentando pelo servidor de apoio…", hint: null });
  // Nenhum texto promete progresso sem sinal dele ("Quase lá…" saiu).
  const join = read("app/bobonline/screens/JoinRoomScreen.tsx");
  assert.doesNotMatch(join, /Quase lá/);
  assert.match(join, /search\?\.step \?\? \(loading \? "rede" : "procurando"\)/);
  assert.match(join, /search\?\.deadlineLocal \?\? startedAt \+ T\.JOIN_TIMEOUT_MS/);

  // A barra vai até o prazo do controlador e nunca volta quando ele cresce (nova tentativa pelo apoio).
  const anchor = { deadline: 45_000, at: 0, from: 0 };
  assert.equal(room.searchBarAt(anchor, 0), 0);
  assert.equal(room.searchBarAt(anchor, 22_500), 0.5);
  assert.equal(room.searchBarAt(anchor, 90_000), 1);
  const moved = { deadline: 75_000, at: 22_500, from: room.searchBarAt(anchor, 22_500) };
  assert.equal(room.searchBarAt(moved, 22_500), 0.5, "o prazo novo não faz a barra voltar");
  assert.equal(room.searchBarAt(moved, 48_750), 0.75);
  assert.equal(room.searchBarAt({ deadline: 10, at: 10, from: 0.3 }, 10), 1, "prazo vencido: cheia");
  assert.match(join, /else if \(anchor\.deadline !== deadline\) \{/);
  // A reabertura volta o passo a "procurando": depois de "achou", a tela segue no texto de achou (sem a linha do anfitrião).
  assert.match(join, /else if \(step === "achou" && !found\.value\) setFound\(\{ startedAt, value: true \}\);/);
  assert.match(join, /const shown = found\.startedAt === startedAt && found\.value && step === "procurando" \? "achou" : step;/);
  assert.match(join, /const copy = searchCopy\(shown, /);
  assert.match(join, /data-step=\{step\}/, "o passo cru segue no DOM (e2e e diagnóstico)");
});

test("erro da busca: uma ação principal só, \"Testar conexão\" nos erros de rede e o relógio errado", () => {
  const join = read("app/bobonline/screens/JoinRoomScreen.tsx");
  // "Tentar de novo" é o próprio botão de entrar (o cartão não repete o botão: r-sim, recomendação 4).
  assert.doesNotMatch(join, />Tentar de novo<\/button>/);
  assert.match(join, /\{retry \? "Tentar de novo" : <>Entrar <span>→<\/span><\/>\}/);
  assert.match(join, /networkError && <button type="button" className="bob-ghost-button" data-testid="bob-diagnostics" onClick=\{onDiagnostics\}>Testar conexão<\/button>/);
  assert.match(join, /networkError && clockNote && <p className="bob-error-note">\{clockNote\}<\/p>/);
  const create = read("app/bobonline/screens/CreateRoomScreen.tsx");
  assert.doesNotMatch(create, />Tentar de novo<\/button>/);
  // O segundo toque de criar é o que abre a sala: não repete o "Criar sala" do início.
  assert.match(create, /busy \? "Abrindo a sala…" : networkError \? "Tentar de novo" : "Abrir sala"/);
  // O Enter do campo passa pelo mesmo submit do botão: abrindo, nada; Enter segurado ou do IME, nada.
  assert.match(create, /function submit\(\) \{\s+\/\/[^\n]*\n\s+if \(busy\) return;/);
  assert.match(create, /if \(event\.key !== "Enter" \|\| event\.repeat \|\| event\.nativeEvent\.isComposing\) return;/);

  assert.equal(room.clockSkewText(null), null);
  assert.equal(room.clockSkewText(59_000), null);
  assert.equal(room.clockSkewText(-59_999), null);
  assert.equal(room.clockSkewText(Number.NaN), null);
  assert.equal(room.clockSkewText(180_000), "O relógio do aparelho está 3 min adiantado. Ative data e hora automáticas.");
  assert.equal(room.clockSkewText(-60_000), "O relógio do aparelho está 1 min atrasado. Ative data e hora automáticas.");
  assert.equal(room.clockSkewText(-2.6 * 3_600_000), "O relógio do aparelho está 3 h atrasado. Ative data e hora automáticas.");
  assert.equal(room.clockSkewText(3 * 86_400_000), "O relógio do aparelho está 3 dias adiantado. Ative data e hora automáticas.");
  // O início também avisa, e só depois de medir (o relógio vem do net.json).
  const page = read("app/bobonline/page.tsx");
  assert.match(page, /const clockNote = netConfig \? clockSkewText\(netClockOffsetMs\(\)\) : null;/);
  assert.match(page, /if \(!clockWrong\) return;[\s\S]{0,400}document\.addEventListener\("visibilitychange", onVisible\);/);
  assert.match(page, /loadNetConfig\(\)\.then\(\(config\) => \{\s+if \(!disposed\) setNetConfig\(config\);/);
  assert.match(read("app/bobonline/screens/HomeScreen.tsx"), /\{clockNote && <p className="bob-hint bob-clock-note"/);
});

test("Testar conexão: a folha vem com a página (sem rede ela nunca derruba a tela); o diagnóstico só baixa quando abre", () => {
  const page = read("app/bobonline/page.tsx");
  // Estática: por lazy(), sem rede (ou depois de um deploy) o pedaço que não baixava caía no ScreensBoundary.
  assert.match(page, /^import DiagnosticsSheet from "\.\/screens\/DiagnosticsSheet";$/m);
  assert.doesNotMatch(page, /lazy\(\(\) => import\("\.\/screens\/DiagnosticsSheet"\)\)/);
  assert.doesNotMatch(page, /<Suspense[^>]*>\s*<DiagnosticsSheet/);
  assert.doesNotMatch(page, /["']\.\/net\/diagnostics["']/, "a página nunca puxa o diagnóstico");
  // Nenhum arquivo do /bobonline puxa o diagnóstico de forma estática (só tipos); a folha o importa ao abrir.
  for (const file of filesUnder("app/bobonline")) {
    for (const line of read(file).split("\n").filter((text) => /from ["'][./]*net\/diagnostics["']|from ["']\.\/diagnostics["']/.test(text))) {
      assert.match(line, /^import type /, `${file}: ${line}`);
    }
  }
  const sheet = read("app/bobonline/screens/DiagnosticsSheet.tsx");
  assert.match(sheet, /import\("\.\.\/net\/diagnostics"\)/);
  assert.match(sheet, /diagnostics\.diagnosticsText\(report\)/);
  assert.match(sheet, /copied \? "Copiado" : "Copiar diagnóstico"/);
  assert.match(sheet, /Testar de novo/);
  // O módulo que não baixou: "Recarregar" no lugar de "Testar de novo" (o import() repetido cairia na falha guardada).
  assert.match(sheet, /import\("\.\.\/net\/diagnostics"\)\.catch\(\(\) => \{\s+if \(alive\) setLoadFailed\(true\);\s+throw SKIP;/);
  assert.match(sheet, /O teste não abriu\. Recarregue a página\./);
  assert.match(sheet, /\{loadFailed \? \([\s\S]{0,260}window\.location\.reload\(\)\}>Recarregar<\/button>/);
  assert.match(sheet, /const running = !report && !broken && !loadFailed;/);
  assert.match(sheet, /"sem-webrtc": /, "a folha conhece todo veredito");
  // Aberta de um erro, leva o motivo técnico da sala; nunca as credenciais do TURN (a folha nem as conhece).
  assert.match(page, /setDiagnostics\(\{ lastError: getRoomView\(\)\.state\?\.netError \?\? null \}\)/);
  assert.doesNotMatch(sheet, /credential|username|TURN_SERVERS/);
});

test("lobby: minha vaga mostra a sinalização, as outras a rota; um dourado por vez", () => {
  const member = (playerId, presence = "online") => ({ playerId, presence, role: "player", left: false, nickname: playerId, ready: false, teamHash: "t" });
  const base = { me: "eu", isHost: true, health: {}, signaling: "ok", links: {}, snapshot: { hostId: "eu" } };
  assert.deepEqual(room.memberConnection(base, member("eu")), { text: "na sala", tone: "ok" });
  assert.deepEqual(room.memberConnection({ ...base, signaling: "reconectando" }, member("eu")), { text: "Reconectando…", tone: "reconectando" });
  assert.deepEqual(room.memberConnection(base, member("ze")), { text: "na sala", tone: "ok" }, "rota ainda não lida");
  const links = { ze: { route: "direto", rttMs: 39.6 }, bia: { route: "apoio", rttMs: 420 }, caio: { route: "?", rttMs: null } };
  assert.deepEqual(room.memberConnection({ ...base, links }, member("ze")), { text: "direto · 40 ms", tone: "ok" });
  assert.deepEqual(room.memberConnection({ ...base, links }, member("bia")), { text: "via apoio · 420 ms", tone: "ok" });
  assert.deepEqual(room.memberConnection({ ...base, links }, member("caio")), { text: "na sala", tone: "ok" });
  assert.deepEqual(room.memberConnection({ ...base, links }, member("ze", "away")), { text: "fora do app", tone: "fora do app" }, "presença ruim manda");
  // Visto por quem entrou, o anfitrião vem da saúde da minha sessão.
  const guest = { ...base, me: "ze", isHost: false, health: { eu: "unstable" }, links: { eu: { route: "direto", rttMs: 12 } } };
  assert.deepEqual(room.memberConnection(guest, member("eu")), { text: "instável", tone: "instável" });
  assert.deepEqual(room.memberConnection({ ...guest, health: {} }, member("eu")), { text: "direto · 12 ms", tone: "ok" });
  // Estado de antes do campo (sem links): não quebra.
  assert.deepEqual(room.memberConnection({ ...base, links: undefined }, member("ze")), { text: "na sala", tone: "ok" });
  assert.equal(room.linkRouteText({ route: "apoio", rttMs: null }), "via apoio");
  assert.equal(room.linkRouteText(null), null);

  const lobby = read("app/bobonline/screens/LobbyScreen.tsx");
  assert.match(lobby, /className=\{`\$\{alone \? "primary-button" : "secondary-button"\} bob-share-main`\}/);
  assert.match(lobby, /className=\{`\$\{alone \? "secondary-button" : "primary-button"\} bob-submit`\}/);
  // Uma dica só enquanto está sozinho (a do "Mandou? Volte para cá…" virou esta).
  assert.equal(lobby.match(/className="bob-hint"/g)?.length, 3, "sozinho, começar bloqueado, esperando o anfitrião");
  assert.match(lobby, /\{alone && <p className="bob-hint" data-testid="bob-alone-hint">Deixe esta tela aberta até seu amigo entrar\.<\/p>\}/);
  assert.doesNotMatch(lobby, /Mandou\? Volte para cá/);
  assert.match(lobby, /const startHint = alone \? null : blocked \?\? startError;/);
});

test("lobby: os avisos não tapam o código; no máximo 2; o \"Estou pronto\" aparece uma vez na chave", () => {
  const css = read("app/bobonline/bobonline.css");
  assert.match(css, /\.bob-shell\[data-screen="lobby"\] \.bob-top-stack > \.bob-toasts \{ position: fixed; top: auto; bottom:/);
  // ...e o "Código copiado"/"Link copiado" (mesmo pé, z-index acima) sai do topo no lobby, sem tapar o "X entrou".
  assert.match(read("app/bobonline/teams/teams.css"), /body:has\(\.bob-shell\[data-screen="lobby"\]\) \.bob-teams-toast-region \{ top: max\(16px, env\(safe-area-inset-top\)\); bottom: auto; \}/);
  const banner = read("app/bobonline/screens/NextMatchBanner.tsx");
  assert.match(banner, /const MAX_TOASTS = 2;/);
  assert.match(banner, /if \(quiet \|\| !visible/);
  assert.match(read("app/bobonline/page.tsx"), /<NextMatchBanner state=\{room\.state\} quiet=\{screen === "bracket"\} \/>/);
});

test("sair da sala: ficar é a ação principal; sair, a secundária discreta", () => {
  const sheet = read("app/bobonline/screens/BobSheet.tsx");
  assert.match(sheet, /className="bob-danger-button" data-testid="bob-leave-confirm" onClick=\{onLeave\}>Sair<\/button>/);
  assert.match(sheet, /className="primary-button" data-testid="bob-leave-stay" onClick=\{onStay\}>Ficar<\/button>/);
  assert.match(sheet, /onClose=\{onStay\}/, "tocar fora e Esc ficam");
  assert.match(read("app/bobonline/page.tsx"), /<LeaveSheet pending=\{pending\} entrant=\{entrant\}/);
  assert.match(read("app/bobonline/bobonline.css"), /\.bob-confirm\.bob-leave-sheet \.bob-danger-button \{[^}]*background: transparent;/);
});

test("WhatsApp: celular na web abre o app na mesma aba e só cai no wa.me se nada abriu", () => {
  const urls = { web: "https://wa.me/?text=x", app: "whatsapp://send?text=x" };
  const fakeEnv = (patch) => {
    const log = [];
    const timers = [];
    const leave = new Set();
    const env = {
      native: false, mobile: true, ios: false, visibleNow: true, focusedNow: true, popups: true,
      go: (url) => log.push(["go", url]),
      openTab: (url) => {
        log.push(["tab", url]);
        return env.popups;
      },
      later: (run, ms) => {
        timers.push({ run, ms });
      },
      visible: () => env.visibleNow,
      focused: () => env.focusedNow,
      onLeave: (listener) => {
        leave.add(listener);
        return () => leave.delete(listener);
      },
      ...patch,
    };
    // fire(): roda o timer mais antigo ainda pendente (a espera do app; depois, o fim da escuta).
    return { env, log, fire: () => timers.shift()?.run(), wait: () => timers[0]?.ms, leave: () => [...leave].forEach((listener) => listener()), listeners: () => leave.size };
  };

  // APK: o wa.me na própria WebView (o Capacitor entrega ao intent do WhatsApp).
  const apk = fakeEnv({ native: true });
  assert.equal(share.launchWhatsApp(urls, apk.env), "apk");
  assert.deepEqual(apk.log, [["go", urls.web]]);
  // Computador: wa.me numa aba nova, como antes.
  const desk = fakeEnv({ mobile: false });
  assert.equal(share.launchWhatsApp(urls, desk.env), "aba");
  assert.deepEqual(desk.log, [["tab", urls.web]]);
  // Celular com o app: esquema na mesma aba; a página saiu da frente, nada de aba nova (a volta cai no jogo).
  const phone = fakeEnv();
  assert.equal(share.launchWhatsApp(urls, phone.env), "app");
  assert.deepEqual(phone.log, [["go", urls.app]]);
  // Folgado: o Safari pergunta "Abrir no WhatsApp?" e o Android pode mostrar o seletor (os timers seguem correndo).
  assert.equal(phone.wait(), share.WHATSAPP_APP_WAIT_MS);
  assert.equal(share.WHATSAPP_APP_WAIT_MS, 2500);
  phone.leave();
  phone.fire();
  assert.deepEqual(phone.log, [["go", urls.app]]);
  assert.equal(phone.listeners(), 0, "saiu antes da espera: solta os ouvintes");
  // Celular sem o app: continua na frente e com o foco depois da espera → wa.me numa aba nova.
  const noApp = fakeEnv();
  let blocked = 0;
  share.launchWhatsApp(urls, noApp.env, { onBlocked: () => blocked++ });
  noApp.fire();
  assert.deepEqual(noApp.log, [["go", urls.app], ["tab", urls.web]]);
  assert.equal(blocked, 0);
  // ... e o navegador barra essa aba (o toque já foi gasto no esquema): a tela é avisada (oferece o link).
  const barred = fakeEnv({ popups: false });
  share.launchWhatsApp(urls, barred.env, { onBlocked: () => blocked++ });
  barred.fire();
  assert.equal(blocked, 1);
  const deskBarred = fakeEnv({ mobile: false, popups: false });
  share.launchWhatsApp(urls, deskBarred.env, { onBlocked: () => blocked++ });
  assert.equal(blocked, 2, "computador com pop-up barrado também avisa");
  // O app abriu depois da espera (toque lento no "Abrir", seletor demorado): a tela tira o link; os ouvintes saem.
  const slow = fakeEnv({ popups: false });
  let left = 0;
  share.launchWhatsApp(urls, slow.env, { onBlocked: () => blocked++, onLeft: () => left++ });
  slow.fire();
  assert.equal(blocked, 3);
  assert.equal(slow.listeners(), 1, "segue ouvindo a saída depois da espera");
  assert.equal(slow.wait(), share.WHATSAPP_LEAVE_WATCH_MS);
  slow.leave();
  assert.equal(left, 1);
  assert.equal(slow.listeners(), 0, "saiu: solta os ouvintes");
  // Ninguém saiu: a escuta acaba sozinha.
  const stays = fakeEnv({ popups: false });
  share.launchWhatsApp(urls, stays.env, { onLeft: () => left++ });
  stays.fire();
  stays.fire();
  assert.equal(stays.listeners(), 0, "fim da escuta: solta os ouvintes");
  stays.leave();
  assert.equal(left, 1);
  // iPhone/iPad: a espera nunca abre aba (barrada, ou o problema da aba do wa.me): o link para copiar vem direto.
  const iphone = fakeEnv({ ios: true });
  share.launchWhatsApp(urls, iphone.env, { onBlocked: () => blocked++ });
  iphone.fire();
  assert.deepEqual(iphone.log, [["go", urls.app]]);
  assert.equal(blocked, 4);
  // Sem o foco na hora da espera (o alerta do Safari ou o seletor ainda por cima): nem aba, nem aviso.
  const chooser = fakeEnv({ focusedNow: false });
  share.launchWhatsApp(urls, chooser.env, { onBlocked: () => blocked++ });
  chooser.fire();
  assert.deepEqual(chooser.log, [["go", urls.app]]);
  assert.equal(blocked, 4);
  // O window.open sem "noopener" nas opções (com ele volta null mesmo abrindo); o opener sai depois.
  const source = read("app/bobonline/share.ts");
  assert.match(source, /const opened = window\.open\(url, "_blank"\);\s+if \(!opened\) return false;/);
  const lobby = read("app/bobonline/screens/LobbyScreen.tsx");
  assert.match(lobby, /onBlocked: \(\) => setFallback\(\{ text: roomLink\(code, snapshot\?\.hostId\), focus: false \}\)/);
  assert.match(lobby, /onLeft: \(\) => setFallback\(null\)/);
  // O campo do WhatsApp não puxa o foco (pode aparecer por baixo do alerta do Safari); o da cópia recusada, sim.
  assert.match(lobby, /if \(!fallback\?\.focus\) return;/);
  assert.match(lobby, /setFallback\(\{ text: code, focus: true \}\)/);
  // Voltou escondida sem avisar (sem evento): também não abre a aba.
  const hidden = fakeEnv();
  share.launchWhatsApp(urls, hidden.env);
  hidden.env.visibleNow = false;
  hidden.fire();
  assert.deepEqual(hidden.log, [["go", urls.app]]);

  assert.equal(share.whatsappAppUrl("K7MPX3", null), `whatsapp://send?text=${encodeURIComponent(codes.shareText("K7MPX3"))}`);
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
  const iphoneUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  assert.equal(share.isMobileWeb(android), true);
  assert.equal(share.isMobileWeb(iphoneUa), true);
  assert.equal(share.isMobileWeb(ipad, 5), true, "iPadOS se diz Mac, mas tem toque");
  assert.equal(share.isMobileWeb(ipad, 0), false, "Mac de verdade");
  assert.equal(share.isMobileWeb(windows, 10), false, "notebook com tela de toque");
  assert.equal(share.isIosWeb(iphoneUa), true);
  assert.equal(share.isIosWeb(ipad, 5), true);
  assert.equal(share.isIosWeb(ipad, 0), false);
  assert.equal(share.isIosWeb(android), false);
});

test("WhatsApp: o esquema do app (e o wa.me do APK) dispara beforeunload e a página fica; o Trystero não sai das salas", () => {
  const source = read("app/bobonline/share.ts");
  // O ouvinte é do módulo (o /bobonline o carrega antes do Trystero ligar o dele), na window, sem capture.
  const guard = /^if \(typeof window !== "undefined" && typeof window\.addEventListener === "function"\) \{\n[\s\S]*?^\}$/m.exec(source)?.[0];
  assert.ok(guard, "o ouvinte do beforeunload não está no topo do módulo");
  assert.match(guard, /window\.addEventListener\("beforeunload", \(event\) => \{\s+if \(performance\.now\(\) < externalNavUntil\) event\.stopImmediatePropagation\(\);\s+\}\);/);
  assert.doesNotMatch(guard.replace(/\/\/[^\n]*/g, ""), /capture|preventDefault|returnValue/, "capture furaria a ordem; preventDefault/returnValue abririam o 'sair do site?'");
  // Armado logo antes de navegar para fora (go: esquema do app e wa.me do APK); a aba nova não dispara beforeunload aqui.
  assert.match(source, /go: \(url\) => \{\s+externalNavUntil = performance\.now\(\) \+ EXTERNAL_NAV_GRACE_MS;\s+window\.location\.assign\(url\);/);
  assert.match(source, /const EXTERNAL_NAV_GRACE_MS = 1500;/);
  assert.doesNotMatch(/openTab: \(url\) => \{[\s\S]*?\n {4}\},/.exec(source)?.[0] ?? "", /externalNavUntil/);
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

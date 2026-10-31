import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

// Times do Bobonline (design §2): modelo, sorteio, código, armazenamento e setup da partida.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
stubBrowser();
const model = loadTs("app/bobonline/teams/model.ts");
const generator = loadTs("app/bobonline/teams/generator.ts");
const names = loadTs("app/bobonline/teams/team-names.ts");
const codes = loadTs("app/bobonline/teams/codes.ts");
const store = loadTs("app/bobonline/teams/team-storage.ts");
const setupModule = loadTs("app/bobonline/teams/match-setup.ts");
const crest = loadTs("app/bobonline/teams/crest.ts");
const { kitDistance } = loadTs("app/botao/kits.ts");
const { hashSeed, createRng } = loadTs("app/botao/rng.ts");
const { usesSquads, createMatch } = loadTs("app/botao/engine.ts");
const { CELEBRATION_OPTIONS, KIT_PATTERN_NAMES, normalizePlayerAppearance } = loadTs("app/player-appearance.ts");

const TEAM_KEYS = ["abbr", "createdAt", "crest", "id", "kitPattern", "name", "players", "primary", "secondary", "shortName", "updatedAt", "version"];
const PLAYER_KEYS = ["appearance", "id", "name", "number"];
const BAD_TEXT = /[\u0000-\u001f\u007f-\u009f<>]/;
const plain = (value) => JSON.parse(JSON.stringify(value));
const team = (seed, id = "bob-abcdefghij", now = 1_700_000_000_000) => generator.randomBobTeam(seed, { id, now });
const letters = (text) => Array.from(text).length;

/** Tudo que um time saneado garante (§2.4). */
function assertValidTeam(result) {
  assert.deepEqual(Object.keys(result).sort(), TEAM_KEYS);
  assert.equal(result.version, 1);
  assert.match(result.id, /^bob-[a-z0-9]{10}$/);
  for (const [field, [min, max]] of [["name", model.LIMITS.teamName], ["shortName", model.LIMITS.shortName]]) {
    assert.ok(letters(result[field]) >= min && letters(result[field]) <= max, `${field}: ${result[field]}`);
    assert.ok(!BAD_TEXT.test(result[field]) && result[field] === result[field].trim() && !/\s{2}/.test(result[field]));
  }
  assert.match(result.abbr, /^[A-Z0-9]{2,4}$/);
  assert.match(result.primary, /^#[0-9a-f]{6}$/);
  assert.match(result.secondary, /^#[0-9a-f]{6}$/);
  assert.ok(Number.isInteger(result.kitPattern) && result.kitPattern >= 0 && result.kitPattern <= 11);
  assert.ok([0, 1, 2, 3].includes(result.crest));
  assert.equal(result.players.length, 5);
  assert.equal(new Set(result.players.map((player) => player.number)).size, 5);
  result.players.forEach((player, index) => {
    assert.deepEqual(Object.keys(player).sort(), PLAYER_KEYS);
    assert.equal(player.id, `p${index}`);
    assert.ok(letters(player.name) >= 2 && letters(player.name) <= 18 && !BAD_TEXT.test(player.name));
    assert.ok(Number.isInteger(player.number) && player.number >= 1 && player.number <= 99);
    assert.equal(player.appearance.kitPattern, result.kitPattern);
    assert.deepEqual(plain(normalizePlayerAppearance(player.appearance)), player.appearance);
    assert.ok(Object.values(player.appearance).every((value) => value !== undefined));
  });
  assert.ok(Number.isInteger(result.createdAt) && Number.isInteger(result.updatedAt));
  assert.ok(JSON.stringify(result).length <= model.LIMITS.teamJsonChars);
  // Idempotente: o anfitrião saneia de novo e chega no mesmo time (e no mesmo hash).
  assert.deepEqual(model.sanitizeTeam(plain(result)), result);
  assert.equal(model.teamHash(plain(result)), model.teamHash(result));
}

// ——— Lixo para o saneamento ———
const JUNK = [null, undefined, 0, -1, 1e308, Number.NaN, Infinity, "", " ", "x", "<script>alert(1)</script>", "\u0000\u0007", "\ud83d", "😀".repeat(40), [], [1, 2], {}, { length: 5 }, true, "#GGGGGG", "#abc", "12", "__proto__"];

function fuzzValue(rng) {
  return rng.pick(JUNK);
}

function fuzzText(rng, base) {
  const pieces = [base, "  ", "\n\t", "<b>", "</b>", "\u0000", "\u202e", "\ufeff", "😀", "\ud800", "Ç", "ã", "ﬁ", "e\u0301", "x".repeat(rng.int(1, 60)), "Zé", "  Nova  "];
  let text = "";
  for (let index = rng.int(0, 4); index >= 0; index -= 1) text += rng.pick(pieces);
  return text;
}

function fuzzTeam(seed) {
  const rng = createRng(hashSeed(seed, "fuzz"));
  if (rng.chance(0.08)) return fuzzValue(rng);
  const raw = plain(team(seed % 37));
  const mutations = rng.int(1, 7);
  for (let step = 0; step < mutations; step += 1) {
    const roll = rng.int(0, 15);
    if (roll === 0) raw.name = rng.chance(0.5) ? fuzzText(rng, raw.name) : fuzzValue(rng);
    else if (roll === 1) raw.shortName = rng.chance(0.5) ? fuzzText(rng, raw.shortName) : fuzzValue(rng);
    else if (roll === 2) raw.abbr = rng.chance(0.5) ? fuzzText(rng, raw.abbr) : fuzzValue(rng);
    else if (roll === 3) raw[rng.pick(["primary", "secondary"])] = rng.pick(["#ABCDEF", "red", "#12345", "#1234567", null, 7]);
    else if (roll === 4) raw.kitPattern = rng.pick([-3, 99, 4.6, "5", null, Number.NaN]);
    else if (roll === 5) raw.crest = rng.pick([-1, 7, 2.4, "1", null]);
    else if (roll >= 6 && roll <= 11 && (!Array.isArray(raw.players) || raw.players.length < 5 || !raw.players.every((player) => player && typeof player === "object"))) raw.players = plain(team(seed).players);
    else if (roll === 6) raw.players = rng.chance(0.4) ? raw.players.slice(0, rng.int(0, 4)) : [...raw.players, ...raw.players.slice(0, rng.int(1, 3))];
    else if (roll === 7) raw.players[rng.int(0, 4)].number = rng.pick([0, 100, -5, 10, 10, 1, 3.7, "7", null, Number.NaN, Infinity]);
    else if (roll === 8) raw.players[rng.int(0, 4)].name = rng.chance(0.6) ? fuzzText(rng, "Zé Carlos") : fuzzValue(rng);
    else if (roll === 9) raw.players[rng.int(0, 4)].appearance = rng.pick([null, {}, { skin: 99, celebration: 40, version: 2 }, { hairStyle: "x", customSkinColor: "red" }, [], "rosto", { version: 1, skin: 7 }]);
    else if (roll === 10) raw.players[rng.int(0, 4)] = fuzzValue(rng);
    else if (roll === 11) Object.assign(raw, { evil: "<img>", constructor: 3, players: raw.players.map((player) => ({ ...player, power: 100, control: 100, hack: true })) });
    else if (roll === 12) raw.id = rng.pick(["clube-real", "bob-ABCDEFGHIJ", "bob-short", "", null, 42, "bob-0123456789"]);
    else if (roll === 13) raw.version = rng.pick([0, 1, 2, "1", null]);
    else if (roll === 14) raw.createdAt = rng.pick([-1, 1.5, Number.NaN, "ontem", 1e20]);
    else delete raw[rng.pick(TEAM_KEYS)];
  }
  return raw;
}

test("sanitizeTeam: 200 casos de lixo devolvem null ou um time válido, sem chave desconhecida", () => {
  let valid = 0;
  let rejected = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const raw = fuzzTeam(seed);
    const result = model.sanitizeTeam(raw);
    if (result === null) {
      rejected += 1;
      continue;
    }
    valid += 1;
    assertValidTeam(result);
  }
  assert.ok(valid >= 60 && rejected >= 20, `válidos ${valid}, rejeitados ${rejected}`);
});

test("sanitizeTeam: regras uma a uma", () => {
  const base = plain(team(3));
  const fix = (patch) => model.sanitizeTeam({ ...plain(base), ...patch });

  assert.equal(fix({ name: "  Vila \n\t   Nova  " }).name, "Vila Nova");
  assert.equal(fix({ name: "<b>Bobo</b> FC" }).name, "bBobo/b FC");
  assert.equal(fix({ name: "x".repeat(60) }).name, "x".repeat(24));
  assert.equal(fix({ name: `${"😀".repeat(23)}ab` }).name, `${"😀".repeat(23)}a`);
  assert.equal(fix({ name: "Bola\ud800 FC" }).name, "Bola FC");
  assert.equal(fix({ name: "Sa\u0303o Paulo" }).name, "São Paulo");
  assert.equal(fix({ name: "A" }), null);
  assert.equal(fix({ name: "  \u0000 " }), null);
  assert.equal(fix({ shortName: "B" }), null);
  assert.equal(fix({ abbr: "vn" }).abbr, "VN");
  assert.equal(fix({ abbr: "São" }).abbr, "SAO");
  assert.equal(fix({ abbr: "ab-cd-ef" }).abbr, "ABCD");
  assert.equal(fix({ abbr: "!", name: "Esporte Clube Vila Nova" }).abbr, "ECVN");
  assert.equal(fix({ primary: "#ABCDEF" }).primary, "#abcdef");
  assert.equal(fix({ primary: "red", secondary: "#123" }).primary, "#0b6b45");
  assert.equal(fix({ primary: "red", secondary: "#123" }).secondary, "#f4c542");
  assert.equal(fix({ kitPattern: 99 }).kitPattern, 11);
  assert.equal(fix({ kitPattern: -3 }).kitPattern, 0);
  assert.equal(fix({ kitPattern: "5" }).kitPattern, 0);
  assert.equal(fix({ crest: 7 }).crest, 3);
  assert.equal(fix({ version: 2 }), null);
  assert.equal(fix({ id: "palmeiras" }).id, fix({ id: "palmeiras" }).id);
  assert.match(fix({ id: "palmeiras" }).id, /^bob-[a-z0-9]{10}$/);
  assert.equal(fix({ id: "bob-abcdefghij" }).id, "bob-abcdefghij");

  const numbers = (list) => fix({ players: base.players.map((player, index) => ({ ...player, number: list[index] })) }).players.map((player) => player.number);
  // Primeiro quem é válido e único; repetidos e inválidos pegam a próxima camisa livre de [1,10,9,8,7,11,…].
  assert.deepEqual(numbers([10, 10, 1, 0, 150]), [10, 9, 1, 8, 99]);
  assert.deepEqual(numbers(["7", null, 7, 7, 7]), [1, 10, 7, 9, 8]);
  assert.deepEqual(numbers([3.4, 3, 4, 5, 6]), [3, 1, 4, 5, 6]);

  assert.equal(fix({ players: base.players.slice(0, 4) }), null);
  assert.equal(fix({ players: [...base.players, base.players[0]] }).players.length, 5);
  assert.equal(fix({ players: base.players.map((player, index) => (index === 2 ? { ...player, name: "Z" } : player)) }), null);
  assert.equal(fix({ players: base.players.map((player, index) => (index === 2 ? null : player)) }), null);

  const withJunk = fix({ evil: 1, players: base.players.map((player) => ({ ...player, power: 100, control: 100, position: "CA" })) });
  assertValidTeam(withJunk);
  assert.equal("evil" in withJunk, false);
  assert.equal("power" in withJunk.players[0], false);

  const legacyFace = fix({ players: base.players.map((player, index) => (index === 0 ? { ...player, appearance: { skin: 99, celebration: 40, version: 2, extra: 1 } } : player)) });
  assert.equal(legacyFace.players[0].appearance.skin, 9);
  assert.equal(legacyFace.players[0].appearance.celebration, CELEBRATION_OPTIONS.length - 1);
  assert.equal("extra" in legacyFace.players[0].appearance, false);
  assert.equal(model.sanitizeTeam("time"), null);
  assert.equal(model.sanitizeTeam([base]), null);
});

test("validateTeamDraft: mensagens pt-BR por campo", () => {
  const draft = plain(team(5));
  assert.deepEqual(model.validateTeamDraft(draft), []);
  assert.deepEqual(model.validateTeamDraft({ ...draft, name: " A " }), [{ field: "name", message: "Mínimo 2 letras" }]);
  assert.deepEqual(model.validateTeamDraft({ ...draft, shortName: "" }), [{ field: "shortName", message: "Mínimo 2 letras" }]);
  assert.deepEqual(model.validateTeamDraft({ ...draft, abbr: "A" }), [{ field: "abbr", message: "Use de 2 a 4 letras ou números" }]);
  assert.deepEqual(model.validateTeamDraft({ ...draft, abbr: "ABCDE" }), [{ field: "abbr", message: "Use de 2 a 4 letras ou números" }]);
  const players = draft.players.map((player) => ({ ...player }));
  players[3].number = players[0].number;
  players[1].name = " ";
  players[4].number = 0;
  assert.deepEqual(model.validateTeamDraft({ ...draft, players }), [
    { field: "players.1.name", message: "Mínimo 2 letras" },
    { field: "players.3.number", message: `Número já usado por ${draft.players[0].name}` },
    { field: "players.4.number", message: "Use um número de 1 a 99" },
  ]);
  for (const bad of [Number.NaN, 100, 2.5, -1]) {
    assert.deepEqual(model.validateTeamDraft({ ...draft, players: draft.players.map((player, index) => (index === 2 ? { ...player, number: bad } : player)) }), [
      { field: "players.2.number", message: "Use um número de 1 a 99" },
    ]);
  }
  // O que passa no rascunho passa no saneamento (o editor só grava rascunho válido).
  for (let seed = 1; seed <= 40; seed += 1) assert.ok(model.sanitizeTeam(team(seed)));
});

test("limites, apelidos e textos", () => {
  assert.deepEqual(plain(model.LIMITS), { teamName: [2, 24], shortName: [2, 14], abbr: [2, 4], playerName: [2, 18], nickname: [2, 16], teamJsonChars: 6000 });
  assert.ok(names.DEFAULT_NICKNAMES.length >= 24);
  for (const nickname of names.DEFAULT_NICKNAMES) assert.ok(letters(nickname) >= 2 && letters(nickname) <= 16, nickname);
  assert.equal(model.sanitizeNickname("  Fominha   da  Mesa ", 1), "Fominha da Mesa");
  assert.equal(model.sanitizeNickname("x".repeat(30), 1), "x".repeat(16));
  for (const bad of ["", "A", null, 7, " <> "]) {
    const nickname = model.sanitizeNickname(bad, 99);
    assert.ok(names.DEFAULT_NICKNAMES.includes(nickname));
    assert.equal(nickname, model.sanitizeNickname(bad, 99));
  }
  for (let seed = 0; seed < 200; seed += 1) assert.ok(names.DEFAULT_NICKNAMES.includes(generator.randomNickname(seed)));
  assert.ok(names.TEAM_PREFIXES.length >= 24 && names.TEAM_PLACES.length >= 40 && names.FUN_TEAM_NAMES.length === 8);
  assert.equal(names.BR_FIRST_NAMES.length, 90);
  assert.equal(names.BR_SURNAMES.length, 90);
});

test("teamHash: 8 hex, estável com a ordem das chaves, muda com o conteúdo", () => {
  const base = team(77);
  const hash = model.teamHash(base);
  assert.match(hash, /^[0-9a-f]{8}$/);
  const shuffled = Object.fromEntries(Object.entries(plain(base)).reverse());
  shuffled.players = shuffled.players.map((player) => Object.fromEntries(Object.entries(player).reverse()));
  assert.equal(model.teamHash(shuffled), hash);
  assert.notEqual(model.teamHash({ ...base, name: `${base.name}!` }), hash);
  // Fixado: o mesmo time tem o mesmo hash em qualquer versão (é a chave em RoomTeams).
  assert.equal(model.teamHash(team(12345, "bob-fixo234567", 1)), "969e6852");
});

test("sorteio: determinístico, 5 jogadores, números únicos, nomes que cabem e sem repetição no nome do time", () => {
  const prefixes = [...names.TEAM_PREFIXES].sort((a, b) => b.length - a.length);
  let fun = 0;
  const celebrations = new Set();
  for (let seed = 1; seed <= 500; seed += 1) {
    const result = generator.randomBobTeam(seed);
    assert.deepEqual(generator.randomBobTeam(seed), result);
    assertValidTeam(result);
    assert.equal(result.createdAt, 0);
    assert.equal(result.players[0].number, 10);
    assert.ok(result.players.every((player) => letters(player.name) <= 18 && /^\S+ \S+\.?$|^\S+ \S\.$/.test(player.name)));
    for (const player of result.players) celebrations.add(player.appearance.celebration);
    assert.equal(result.shortName, model.deriveShortName(result.name));
    assert.equal(result.abbr, model.deriveAbbr(result.name));
    assert.ok(letters(result.name) <= 24);
    if (names.FUN_TEAM_NAMES.includes(result.name)) {
      fun += 1;
      continue;
    }
    // Nunca cortado: é exatamente prefixo + " " + lugar das listas, e passa nas regras.
    const prefix = prefixes.find((item) => result.name.startsWith(`${item} `) && names.TEAM_PLACES.includes(result.name.slice(item.length + 1)));
    assert.ok(prefix, result.name);
    assert.ok(generator.isGoodTeamName(prefix, result.name.slice(prefix.length + 1)), result.name);
  }
  assert.ok(fun >= 20 && fun <= 110, `nomes divertidos: ${fun}`);
  assert.equal(celebrations.size, CELEBRATION_OPTIONS.length, "todas as comemorações (inclusive as novas 13..17) saem no sorteio");
  assert.notDeepEqual(generator.randomBobTeam(1), generator.randomBobTeam(2));

  // As regras de rejeição (§2.5).
  assert.equal(generator.isGoodTeamName("Vila", "Vila Nova"), false);
  assert.equal(generator.isGoodTeamName("Ypiranga", "Ipiranga"), false);
  assert.equal(generator.isGoodTeamName("Paulista", "Paulista"), false);
  assert.equal(generator.isGoodTeamName("Unidos de", "do Morro"), false);
  assert.equal(generator.isGoodTeamName("Real", "Realengo"), false);
  assert.equal(generator.isGoodTeamName("Sociedade Esportiva", "Boa Esperança"), false);
  assert.equal(generator.isGoodTeamName("Esporte Clube", "Vila Nova"), true);
  assert.equal(generator.isGoodTeamName("Atlético", "do Morro"), true);

  // Nome curto e sigla automáticos.
  assert.equal(model.deriveShortName("Esporte Clube Vila Nova"), "Vila Nova");
  assert.equal(model.deriveShortName("Atlético do Morro"), "Morro");
  assert.equal(model.deriveShortName("Palheta Futebol Clube"), "Palheta");
  assert.equal(model.deriveShortName("Bobo FC"), "Bobo FC");
  assert.equal(model.deriveShortName("Sporting Dedinho"), "Dedinho");
  assert.equal(model.deriveAbbr("Esporte Clube Vila Nova"), "ECVN");
  assert.equal(model.deriveAbbr("Bobo FC"), "BFC");
  assert.equal(model.deriveAbbr("Atlético Madureira"), "AMA");
  assert.equal(model.deriveAbbr("Palmeirinha"), "PAL");
  assert.equal(model.deriveAbbr("!!"), "BOB");
});

test("sorteio: jogador avulso, time da CPU e nomes copiados da carreira", () => {
  const taken = [10, 1, 9, 7, 11, 8, 5, 4, 3, 2, 6, 13, 14, 17, 19];
  for (let seed = 1; seed <= 50; seed += 1) {
    const player = generator.randomBobPlayer(seed, 3, taken, 7);
    assert.ok(!taken.includes(player.number));
    assert.equal(player.id, "p3");
    assert.equal(player.appearance.kitPattern, 7);
    assert.deepEqual(generator.randomBobPlayer(seed, 3, taken, 7), player);
  }
  assert.equal(generator.randomBobPlayer(5, 0, []).number, 10);
  assert.notEqual(generator.randomBobPlayer(5, 0, [10]).number, 10);

  const cpu = generator.cpuTeamFor(987654, 2);
  assert.deepEqual(cpu, generator.cpuTeamFor(987654, 2));
  assert.deepEqual(cpu, generator.randomBobTeam(hashSeed(987654, "cpu", 2)));
  assert.notDeepEqual(cpu, generator.cpuTeamFor(987654, 3));
  assert.doesNotMatch(cpu.name, /CPU/);
  assertValidTeam(cpu);
  // Nome curto já na chave: sorteia outro, do mesmo jeito em qualquer aparelho; sem conflito, o time é o de sempre.
  assert.deepEqual(generator.cpuTeamFor(987654, 2, new Set(["outro"])), cpu);
  const avoided = generator.cpuTeamFor(987654, 2, new Set([cpu.shortName.toLocaleLowerCase("pt-BR")]));
  assert.notEqual(avoided.shortName.toLocaleLowerCase("pt-BR"), cpu.shortName.toLocaleLowerCase("pt-BR"));
  assert.deepEqual(avoided, generator.cpuTeamFor(987654, 2, new Set([cpu.shortName.toLocaleLowerCase("pt-BR")])));
  assertValidTeam(avoided);
  const slots = new Set();
  for (let slot = 0; slot < 7; slot += 1) slots.add(generator.cpuTeamFor(4242, slot, slots).shortName.toLocaleLowerCase("pt-BR"));
  assert.equal(slots.size, 7);

  assert.match(generator.newTeamId(), /^bob-[a-z0-9]{10}$/);
  assert.notEqual(generator.newTeamId(), generator.newTeamId());

  // BR_FIRST_NAMES / BR_SURNAMES são cópia exata de POOLS.brazil (a carreira não pode ser importada).
  const careerSource = readFileSync(join(ROOT, "app/career/world-player-name-pools.ts"), "utf8");
  const brazil = /brazil:\s*\{\s*first:\s*\[([\s\S]*?)\],\s*last:\s*\[([\s\S]*?)\],/.exec(careerSource);
  assert.ok(brazil, "POOLS.brazil não encontrado");
  const parse = (block) => [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...names.BR_FIRST_NAMES], parse(brazil[1]));
  assert.deepEqual([...names.BR_SURNAMES], parse(brazil[2]));
});

test("fonte: nada do Bobonline (times, chave) importa a carreira, game-data, adapter ou result-story", () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) files.push(path);
    }
  };
  walk(join(ROOT, "app/bobonline/teams"));
  walk(join(ROOT, "app/bobonline/tournament"));
  files.push(join(ROOT, "app/bobonline/types.ts"), join(ROOT, "app/bobonline/storage.ts"));
  assert.ok(files.length >= 15);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const imports = [...source.matchAll(/(?:import|export)[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] ?? match[2]);
    for (const specifier of imports) {
      assert.doesNotMatch(specifier, /career|game-data|adapter|result-story/, `${relative(ROOT, file)} importa ${specifier}`);
    }
  }
});

test("código do time: ida e volta em BOB1 (com CompressionStream)", { skip: typeof CompressionStream !== "function" && "sem CompressionStream neste Node" }, async () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const original = team(seed);
    const code = await codes.exportTeamCode(original);
    assert.match(code, /^BOB1-[A-Za-z0-9_-]+-[0-9a-f]{8}$/);
    assert.ok(code.length < 1600, `código grande: ${code.length}`);
    const back = await codes.importTeamCode(code, { id: "bob-copia23456", now: 42 });
    assert.equal(back.ok, true);
    assert.deepEqual(back.team, { ...original, id: "bob-copia23456", createdAt: 42, updatedAt: 42 });
  }
  const original = team(9);
  const code = await codes.exportTeamCode(original);
  // Mensageiro quebrou linha, com texto em volta: ainda importa.
  const wrapped = `Olha meu time:\n${code.slice(0, 30)}\n${code.slice(30, 70)} ${code.slice(70)}\nvaleu!`;
  assert.equal((await codes.importTeamCode(wrapped)).ok, true);
  const imported = await codes.importTeamCode(code);
  assert.equal(imported.ok, true);
  assert.notEqual(imported.team.id, original.id);
  assert.match(imported.team.id, /^bob-[a-z0-9]{10}$/);
});

test("código do time: BOB0 sem CompressionStream, e os erros", async () => {
  const original = team(21);
  const saved = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  let code;
  try {
    code = await codes.exportTeamCode(original);
  } finally {
    globalThis.CompressionStream = saved;
  }
  assert.match(code, /^BOB0-[A-Za-z0-9_-]+-[0-9a-f]{8}$/);
  const back = await codes.importTeamCode(code, { id: "bob-copia23456", now: 7 });
  assert.deepEqual(back, { ok: true, team: { ...original, id: "bob-copia23456", createdAt: 7, updatedAt: 7 } });

  const bob0 = (payload) => {
    const json = JSON.stringify(payload);
    return `BOB0-${Buffer.from(json, "utf8").toString("base64url")}-${model.fnv8(json)}`;
  };
  const payload = JSON.parse(Buffer.from(code.slice(5, -9), "base64url").toString("utf8"));
  assert.equal("id" in payload || "createdAt" in payload, false, "o código não leva id nem datas");
  assert.deepEqual(await codes.importTeamCode(bob0({ ...payload, version: 2 })), { ok: false, reason: "versao" });
  assert.deepEqual(await codes.importTeamCode(`BOB2-${code.slice(5)}`), { ok: false, reason: "versao" });
  assert.deepEqual(await codes.importTeamCode(bob0({ ...payload, name: "A" })), { ok: false, reason: "invalido" });
  assert.deepEqual(await codes.importTeamCode(`${code.slice(0, -1)}${code.at(-1) === "0" ? "1" : "0"}`), { ok: false, reason: "invalido" });
  assert.deepEqual(await codes.importTeamCode(code.slice(0, 40)), { ok: false, reason: "invalido" });
  assert.deepEqual(await codes.importTeamCode("oi, tudo bem?"), { ok: false, reason: "invalido" });
  assert.deepEqual(await codes.importTeamCode(""), { ok: false, reason: "invalido" });
  assert.deepEqual(await codes.importTeamCode(`BOB0-${"A".repeat(12_100)}-0000abcd`), { ok: false, reason: "invalido" });
  assert.deepEqual(await codes.importTeamCode(bob0([1, 2, 3])), { ok: false, reason: "invalido" });

  // BOB1 num navegador sem DecompressionStream não abre (cai em "inválido").
  if (typeof CompressionStream === "function") {
    const packed = await codes.exportTeamCode(original);
    const savedD = globalThis.DecompressionStream;
    globalThis.DecompressionStream = undefined;
    try {
      assert.deepEqual(await codes.importTeamCode(packed), { ok: false, reason: "invalido" });
    } finally {
      globalThis.DecompressionStream = savedD;
    }
  }
});

test("código do time: importação com teto (bomba de deflate e mil candidatos a checksum)", { skip: typeof DecompressionStream !== "function" && "sem DecompressionStream neste Node" }, async () => {
  assert.equal(codes.MAX_TEAM_JSON_BYTES, model.LIMITS.teamJsonChars * 4);
  assert.equal(codes.MAX_CHECKSUM_TRIES, 8);
  // Conta quantos infladores a importação abre e quantos bytes cada um chega a entregar.
  const Saved = globalThis.DecompressionStream;
  let created = 0;
  let produced = 0;
  globalThis.DecompressionStream = class {
    constructor(format) {
      created += 1;
      const inner = new Saved(format);
      const counter = new TransformStream({
        transform(chunk, controller) {
          produced += chunk.byteLength;
          controller.enqueue(chunk);
        },
      });
      this.writable = inner.writable;
      this.readable = inner.readable.pipeThrough(counter);
    }
  };
  const reset = () => {
    created = 0;
    produced = 0;
  };
  try {
    // 4 MB de espaços cabem em poucos KB de deflate.
    const spaces = " ".repeat(4 * 1024 * 1024);
    const bomb = deflateRawSync(Buffer.from(spaces), { level: 9 }).toString("base64url");
    assert.ok(bomb.length < 6000, `bomba grande: ${bomb.length}`);

    // Checksum certo: o inflador para no teto em vez de entregar os 4 MB.
    reset();
    assert.deepEqual(await codes.importTeamCode(`BOB1-${bomb}-${model.fnv8(spaces)}`), { ok: false, reason: "invalido" });
    assert.equal(created, 1);
    assert.ok(produced < 256 * 1024, `inflou ${produced} bytes`);

    // Mil "-aaaaaaaa" depois da bomba: só os primeiros MAX_CHECKSUM_TRIES candidatos são testados.
    let body = bomb;
    while (body.length + 9 <= codes.MAX_TEAM_CODE_CHARS) body += "-aaaaaaaa";
    reset();
    assert.deepEqual(await codes.importTeamCode(`BOB1-${body}`), { ok: false, reason: "invalido" });
    assert.ok(created >= 1 && created <= codes.MAX_CHECKSUM_TRIES, `${created} infladores`);
    assert.ok(produced < created * 256 * 1024, `inflou ${produced} bytes`);

    // Código de verdade: candidatos falsos colados depois, ou texto no fim, não atrapalham.
    const original = team(14);
    const code = await codes.exportTeamCode(original);
    reset();
    const glued = await codes.importTeamCode(`${code}${"-aaaaaaaa".repeat(20)}`, { id: "bob-copia23456", now: 3 });
    assert.deepEqual(glued, { ok: true, team: { ...original, id: "bob-copia23456", createdAt: 3, updatedAt: 3 } });
    assert.equal(created, 1);
    assert.equal((await codes.importTeamCode(`${code}obrigado, até mais!`)).ok, true);
    // Texto fora do base64url antes de qualquer checksum encerra a busca sem inflar nada.
    reset();
    assert.deepEqual(await codes.importTeamCode(`BOB1-ab:cd${code.slice(5)}`), { ok: false, reason: "invalido" });
    assert.equal(created, 0);
  } finally {
    globalThis.DecompressionStream = Saved;
  }
});

function freshStore(extra) {
  const values = stubBrowser();
  if (extra) extra(values);
  store.resetBobStore();
  return values;
}

test("armazenamento: primeiro acesso cria e grava um time; no máximo 6; activeId de reserva", async () => {
  const values = freshStore();
  const first = store.getBobStoreSnapshot();
  assert.equal(first.ready, true);
  assert.equal(first.firstRun, true);
  assert.equal(first.teams.length, 1);
  assertValidTeam(first.active);
  const saved = JSON.parse(values.get(store.TEAMS_KEY));
  assert.deepEqual(saved, { version: 1, activeId: first.active.id, teams: [first.active] });
  const profile = JSON.parse(values.get(store.PROFILE_KEY));
  assert.ok(names.DEFAULT_NICKNAMES.includes(profile.nickname));
  assert.deepEqual(profile.hints, {});
  // O aviso "Criamos um time…" sai uma vez só por página (a primeira tela que pedir).
  assert.equal(store.takeFirstRunNotice(), "Criamos um time para você. Edite à vontade!");
  assert.equal(store.takeFirstRunNotice(), null);

  // "Recarregar a página": mesmo time, sem firstRun.
  store.resetBobStore();
  const again = store.getBobStoreSnapshot();
  assert.equal(again.firstRun, false);
  assert.equal(store.takeFirstRunNotice(), null);
  assert.deepEqual(again.teams, first.teams);
  assert.equal(again.profile.nickname, profile.nickname);

  for (let count = 2; count <= 6; count += 1) assert.ok(store.createTeam());
  assert.equal(store.getBobStoreSnapshot().teams.length, 6);
  assert.equal(store.createTeam(), null);
  assert.deepEqual(await store.importTeam(await codes.exportTeamCode(team(1))), { ok: false, reason: "limite" });
  const extra = { ...team(2), id: "bob-novo234567" };
  assert.equal(store.saveTeam(extra), false, "o sétimo time não entra");

  const teams = store.getBobStoreSnapshot().teams;
  assert.ok(store.setActiveTeam(teams[3].id));
  assert.equal(store.getBobStoreSnapshot().active.id, teams[3].id);
  assert.equal(store.setActiveTeam("bob-naoexiste"), false);
  assert.ok(store.removeTeam(teams[3].id));
  assert.equal(store.getBobStoreSnapshot().active.id, teams[0].id, "excluir o time em uso passa para o primeiro");
  for (const item of store.getBobStoreSnapshot().teams.slice(1)) assert.ok(store.removeTeam(item.id));
  assert.equal(store.removeTeam(teams[0].id), false, "o último time não sai");
  assert.equal(store.getBobStoreSnapshot().teams.length, 1);
  assert.equal(JSON.parse(values.get(store.TEAMS_KEY)).teams.length, 1);

  // activeId apontando para o nada (ou time quebrado) cai no primeiro e o arquivo é consertado.
  const good = [team(31, "bob-aaaaaaaaaa"), team(32, "bob-bbbbbbbbbb")];
  freshStore((map) => map.set(store.TEAMS_KEY, JSON.stringify({ version: 1, activeId: "bob-sumiu23456", teams: [{ name: "x" }, ...good, good[0], ...Array.from({ length: 6 }, (_, index) => team(40 + index, `bob-cccccccc${"abcdef"[index]}${index + 2}`))] })));
  const repaired = store.getBobStoreSnapshot();
  assert.equal(repaired.firstRun, false);
  assert.equal(repaired.teams.length, 6, "lixo e repetido fora, corta em 6");
  assert.equal(repaired.active.id, "bob-aaaaaaaaaa");
  assert.equal(JSON.parse(globalThis.localStorage.getItem(store.TEAMS_KEY)).activeId, "bob-aaaaaaaaaa");

  // JSON quebrado = aparelho novo.
  freshStore((map) => map.set(store.TEAMS_KEY, "{quebrado"));
  assert.equal(store.getBobStoreSnapshot().firstRun, true);
  assert.equal(store.getBobStoreSnapshot().teams.length, 1);
});

test("armazenamento: salvar, importar, apelido, aviso e gravação recusada", async () => {
  freshStore();
  const listener = { calls: 0 };
  const unsubscribe = store.subscribeBobStore(() => {
    listener.calls += 1;
  });
  const active = store.getBobStoreSnapshot().active;
  assert.equal(store.saveTeam({ ...active, name: "A" }), false, "rascunho inválido não grava");
  assert.equal(store.getBobStoreSnapshot().active.name, active.name);
  assert.equal(store.saveTeam({ ...active, name: "  Real   Feltro " }), true);
  const updated = store.getBobStoreSnapshot().active;
  assert.equal(updated.name, "Real Feltro");
  assert.ok(updated.updatedAt >= active.updatedAt);
  assert.ok(listener.calls >= 1);

  const imported = await store.importTeam(await codes.exportTeamCode(team(8)));
  assert.equal(imported.ok, true);
  assert.equal(store.getBobStoreSnapshot().teams.length, 2);
  assert.equal(store.getBobStoreSnapshot().active.id, updated.id, "importar não troca o time em uso");
  assert.deepEqual(await store.importTeam("lixo"), { ok: false, reason: "invalido" });

  const before = store.getBobStoreSnapshot().profile.nickname;
  assert.equal(store.setNickname("A"), before, "curto demais mantém o anterior");
  assert.equal(store.setNickname("  Zé  da   Mesa "), "Zé da Mesa");
  assert.equal(JSON.parse(globalThis.localStorage.getItem(store.PROFILE_KEY)).nickname, "Zé da Mesa");
  store.markHint("leaveApp");
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(store.PROFILE_KEY)).hints, { leaveApp: true });

  // Cota cheia / modo privado: a sessão continua com o time em memória, mas avisa que não gravou.
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  try {
    assert.equal(store.saveTeam({ ...updated, name: "Bobo FC" }), false);
    assert.equal(store.getBobStoreSnapshot().active.name, "Bobo FC");
    assert.equal(store.getBobStoreSnapshot().persisted, false);
  } finally {
    globalThis.localStorage.setItem = original;
  }
  unsubscribe();

  const server = store.getBobServerSnapshot();
  assert.equal(server.ready, false);
  assertValidTeam(server.active);
});

test("armazenamento: perfil de teste (?perfil=B) separa as chaves", () => {
  const values = new Map();
  const localStorage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => void values.set(key, String(value)),
    removeItem: (key) => void values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  const previous = globalThis.window;
  globalThis.window = { localStorage, location: { hostname: "127.0.0.83", port: "3620", search: "?perfil=B" } };
  try {
    store.resetBobStore();
    store.getBobStoreSnapshot();
    assert.ok(values.has(`${store.TEAMS_KEY}:B`));
    assert.ok(values.has(`${store.PROFILE_KEY}:B`));
    assert.equal(values.has(store.TEAMS_KEY), false);
  } finally {
    globalThis.window = previous;
    store.resetBobStore();
  }
});

test("buildDuelSetup: ids com lado, visual por vaga, camisa reserva, 72/72 e determinístico", () => {
  const home = team(101, "bob-casa234567");
  const away = { ...team(102, "bob-fora234567"), primary: home.primary, secondary: home.secondary };
  const args = { matchId: "K7MPX3-r1m0-0", seed: hashSeed(5, "K7MPX3-r1m0-0"), home, away, rules: "classic", stageName: "X1" };
  const setup = setupModule.buildDuelSetup(args);
  assert.deepEqual(setupModule.buildDuelSetup(plain(args)), setup);
  assert.equal(JSON.stringify(setupModule.buildDuelSetup(args)), JSON.stringify(setup));

  assert.deepEqual(setup.squads.user.map((player) => player.id), ["user:p0", "user:p1", "user:p2", "user:p3", "user:p4"]);
  assert.deepEqual(setup.squads.cpu.map((player) => player.id), ["cpu:p0", "cpu:p1", "cpu:p2", "cpu:p3", "cpu:p4"]);
  for (const [side, source] of [["user", home], ["cpu", away]]) {
    setup.squads[side].forEach((player, index) => {
      assert.equal(player.name, source.players[index].name);
      assert.equal(player.number, source.players[index].number);
      assert.equal(player.position, "MC");
      assert.equal(player.overall, 76);
      assert.equal(player.power, 72);
      assert.equal(player.control, 72);
      assert.equal(player.appearance.kitPattern, source.kitPattern);
      assert.deepEqual(setup.visuals[side][index], player.appearance);
    });
  }
  assert.deepEqual(setup.visuals.player, setup.squads.user[0].appearance);
  assert.equal(setup.visuals.enabled, true);
  assert.equal(usesSquads(setup), true);

  // Cores iguais: o visitante cede (o mandante fica intacto).
  assert.equal(setup.userTeam.primary, home.primary);
  assert.ok(kitDistance(setup.userTeam.primary, setup.cpuTeam.primary) >= 92);
  for (let seed = 1; seed <= 30; seed += 1) {
    const a = team(seed);
    const b = team(seed + 1000);
    for (const pair of [[a, b], [a, a]]) {
      const built = setupModule.buildDuelSetup({ ...args, home: pair[0], away: pair[1] });
      assert.ok(kitDistance(built.userTeam.primary, built.cpuTeam.primary) >= 92);
    }
  }
  // Espelho do mesmo time: ids continuam únicos nos dois lados.
  const mirror = setupModule.buildDuelSetup({ ...args, away: home });
  const ids = [...mirror.squads.user, ...mirror.squads.cpu].map((player) => player.id);
  assert.equal(new Set(ids).size, 10);

  assert.equal(setup.userTeam.strength, 76);
  assert.equal(setup.cpuTeam.strength, 76);
  assert.equal(setup.difficulty, 3);
  assert.equal(setup.localControl, true);
  assert.equal(setup.neutralVenue, true);
  assert.equal(setup.competitionName, "Bobonline");
  assert.equal(setup.stageName, "X1");
  assert.deepEqual(setup.player, { name: home.players[0].name, number: home.players[0].number, position: "MC", overall: 76 });
  assert.equal(setup.userIsHost, (hashSeed(args.seed, "saida") & 1) === 0);
  const hosts = new Set(Array.from({ length: 20 }, (_, seed) => setupModule.buildDuelSetup({ ...args, seed }).userIsHost));
  assert.equal(hosts.size, 2);

  assert.deepEqual(setup.rules, setupModule.BOB_RULE_PRESETS.classic.rules);
  setup.rules.goalLimit = 99;
  assert.equal(setupModule.BOB_RULE_PRESETS.classic.rules.goalLimit, 3, "o setup não compartilha o objeto do preset");
  const presets = setupModule.BOB_RULE_PRESETS;
  assert.deepEqual([presets.flash.label, presets.flash.detail, presets.flash.rules.goalLimit, presets.flash.rules.halfSeconds, presets.flash.rules.extraSeconds, presets.flash.rules.penaltyRounds], ["Relâmpago", "2 gols · 90 segundos", 2, 90, 30, 3]);
  assert.deepEqual([presets.classic.label, presets.classic.rules.goalLimit, presets.classic.rules.halfSeconds, presets.classic.rules.extraSeconds, presets.classic.rules.penaltyRounds], ["Clássico", 3, 120, 45, 5]);
  assert.deepEqual([presets.marathon.label, presets.marathon.detail, presets.marathon.rules.goalLimit, presets.marathon.rules.halfSeconds, presets.marathon.rules.extraSeconds], ["Maratona", "5 gols · 3 minutos", 5, 180, 60]);
  assert.equal(setupModule.buildDuelSetup({ ...args, rules: "flash" }).rules.penaltyRounds, 3);

  // Escudo como data URL (TeamCrest mostra sem rede).
  assert.match(setup.userTeam.badge, /^data:image\/svg\+xml;utf8,/);
  const svg = decodeURIComponent(setup.userTeam.badge.slice("data:image/svg+xml;utf8,".length));
  assert.match(svg, new RegExp(`>${home.abbr}</text>`));
  assert.equal(setupModule.toBotaoTeam(home).id, home.id);
  assert.equal(setupModule.roundStageName(8, 1), "Quartas de final");
  assert.equal(setupModule.roundStageName(2, 1), "X1");

  // O motor monta a partida com esse setup.
  const state = createMatch(setup);
  assert.equal(state.bodies.filter((body) => body.side === "user").length, 5);
  assert.equal(state.bodies.filter((body) => body.side === "cpu").length, 5);
});

test("escudo e miniaturas: SVG saneado, 4 formas e 12 estampas diferentes", () => {
  const evil = { abbr: "<script>x</script>", primary: "red;background:url(x)", secondary: "#fff' onload='x", crest: 9 };
  const svg = crest.crestSvg(evil);
  assert.doesNotMatch(svg, /script|onload|url\(/);
  assert.match(svg, /fill='#0b6b45'/);
  assert.match(svg, />SCRI<\/text>/);
  const shapes = new Set([0, 1, 2, 3].map((shape) => crest.crestSvg({ abbr: "BOB", primary: "#111111", secondary: "#ffffff", crest: shape })));
  assert.equal(shapes.size, 4);
  const patterns = new Set(KIT_PATTERN_NAMES.map((_, pattern) => crest.kitSvg(pattern, "#111111", "#ffffff")));
  assert.equal(patterns.size, 12);
  assert.doesNotMatch(crest.kitSvg(0, "x'/><script>", "#fff"), /script/);
  assert.equal(crest.CREST_SHAPE_NAMES.join(","), "Clássico,Redondo,Diamante,Flâmula");
  assert.match(crest.crestDataUrl({ abbr: "VN", primary: "#c8102e", secondary: "#ffffff", crest: 1 }), /^data:image\/svg\+xml;utf8,%3Csvg/);
});

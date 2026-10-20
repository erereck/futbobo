import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";
import ts from "typescript";

const loadTs = createRequire(import.meta.url);

// Load the real TypeScript modules in Node without adding a test runtime dependency.
loadTs.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
const storage = loadTs("../app/career/save-system.ts");
const { SAVE_KEY } = loadTs("../app/career/state.ts");

beforeEach(() => {
  const values = new Map();
  global.window = {};
  global.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  storage.importCareerStorageSnapshot({ version: 2, index: [], slots: {}, achievements: [] });
});

function saveSlot(slot, name = "Jogador") {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 7, phase: "identity", name, season: 2027, position: "MEI" }));
  storage.syncActiveCareerSlot();
  return slot;
}

test("creates and round-trips more than 20 careers without dropping slots", async () => {
  const ids = [];
  for (let index = 0; index < 25; index += 1) {
    const slot = saveSlot(await storage.createCareerSlot(), `Jogador ${index}`);
    ids.push(slot.id);
  }
  assert.equal(storage.listCareerSaves().length, 25);
  const backup = storage.exportCareerStorageSnapshot();
  assert.equal(Object.keys(backup.slots).length, 25);
  assert.equal(storage.importCareerStorageSnapshot(backup).imported, true);
  for (const id of ids) assert.equal(await storage.activateCareerSlot(id), true);
});

test("requires four digits and preserves leading zeroes and protection after backup", async () => {
  for (const pin of ["123", "12345", "1a23", "１２３４", " 123"]) {
    await assert.rejects(storage.createCareerSlot("player", pin));
  }
  assert.equal(storage.listCareerSaves().length, 0);
  const slot = saveSlot(await storage.createCareerSlot("player", "0042"));
  assert.notEqual(slot.pin.hash, "0042");
  assert.equal(slot.pin.hash.length, 64);
  const backup = storage.exportCareerStorageSnapshot();
  storage.importCareerStorageSnapshot(backup);
  const otherSlot = saveSlot(await storage.createCareerSlot(), "Outra carreira");
  for (const pin of ["", "0041", "042", "00042", "abcd"]) {
    const activeBefore = localStorage.getItem(SAVE_KEY);
    assert.equal(await storage.activateCareerSlot(slot.id, pin), false);
    assert.equal(localStorage.getItem(SAVE_KEY), activeBefore);
    assert.equal(storage.getActiveCareerId(), otherSlot.id);
  }
  assert.equal(await storage.activateCareerSlot(slot.id, "0042"), true);
  assert.equal(storage.getActiveCareerId(), slot.id);
  assert.equal(JSON.parse(localStorage.getItem(SAVE_KEY)).name, "Jogador");
});

test("keeps unprotected saves compatible and salts the same PIN differently", async () => {
  const oldSlot = saveSlot(await storage.createCareerSlot());
  assert.equal(await storage.activateCareerSlot(oldSlot.id), true);
  const first = await storage.createCareerSlot("player", "1234");
  const second = await storage.createCareerSlot("player", "1234");
  assert.notEqual(first.pin.salt, second.pin.salt);
  assert.notEqual(first.pin.hash, second.pin.hash);
});

test("blocks new and imported manager careers while retaining their backup data", async () => {
  assert.equal(await storage.createCareerSlot("manager"), null);
  const slot = saveSlot(await storage.createCareerSlot());
  const backup = storage.exportCareerStorageSnapshot();
  backup.index.push({ ...slot, id: "old-manager", mode: "manager" });
  backup.slots["old-manager"] = { version: 1, mode: "manager", phase: "career", name: "Técnico", currentClubId: "santos" };
  assert.equal(storage.importCareerStorageSnapshot(backup).imported, true);
  assert.equal(await storage.activateCareerSlot("old-manager"), false);
  assert.equal(storage.exportCareerStorageSnapshot().slots["old-manager"].name, "Técnico");
});

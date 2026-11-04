import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CHAPTERS, newDemo, resolveDemo, restoreDemo } from "../app/conceitos/model.ts";

test("all 27 career paths finish, round-trip and keep bounded stats", () => {
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const start = newDemo("Marina do Gol");
    const result = [a, b, c].reduce(resolveDemo, start);
    assert.equal(start.chapter, 0, "resolving must not mutate an existing state");
    assert.equal(start.stats.overall, 72);
    assert.equal(result.chapter, 3);
    assert.equal(result.history.length, 3);
    assert.equal(result.club, a === 1 ? "Sport" : "Flamengo");
    assert.ok(Object.values(result.stats).every(v => v >= 0 && v <= 99));
    assert.deepEqual(restoreDemo(JSON.stringify(result)), result);
    assert.strictEqual(resolveDemo(result, 0), result, "a completed run cannot resolve again");
  }
});

test("invalid choices leave the run unchanged", () => {
  const state = newDemo();
  for (const value of [-1, 3, 99, 0.5, NaN]) assert.strictEqual(resolveDemo(state, value), state);
});

test("corrupted and untrusted storage recovers without touching game saves", () => {
  for (const raw of [null, "", "{", "null", "[]", JSON.stringify({ version: 1, chapter: 22 }), JSON.stringify({ ...newDemo(), stats: { overall: -20 } }), JSON.stringify({ ...newDemo(), chapter: 1, history: [{ chapter: 9, choice: 0 }] })]) {
    assert.deepEqual(restoreDemo(raw), newDemo());
  }
  const valid = resolveDemo(newDemo("Bia"), 1);
  const tampered = JSON.stringify({ ...valid, stats: { overall: 99, morale: 99, fitness: 99, trust: 99 }, club: "Fake", extra: "injected" });
  assert.deepEqual(restoreDemo(tampered), valid, "history is the source of truth");
  assert.equal(newDemo(" ").name, "Caio Silva");
  assert.equal(newDemo("a".repeat(100)).name.length, 28);
});

test("the exported gallery and six concepts have real routes and local art", async () => {
  const ids = ["holofote", "resenha", "primeira-pagina", "legado", "fita-98", "proximo-lance"];
  const gallery = await readFile(new URL("../out/conceitos/index.html", import.meta.url), "utf8");
  for (const id of ids) {
    assert.ok(gallery.includes(`/conceitos/${id}/`));
    const html = await readFile(new URL(`../out/conceitos/${id}/index.html`, import.meta.url), "utf8");
    assert.ok(html.includes("Menu inicial"));
    assert.ok(html.includes("Tela de escolhas"));
    assert.ok(html.includes("Caio Silva"));
    assert.ok(!html.includes('src="https://'), "core visuals must not depend on remote image hosts");
  }
  for (const art of ["stadium", "street", "legacy"]) assert.ok((await readFile(new URL(`../public/concept-art/${art}.webp`, import.meta.url))).length > 10_000);
  assert.equal(CHAPTERS.length, 3);
});

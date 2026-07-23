import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
}

test("exporta uma página estática pronta para o GitHub Pages", async () => {
  const html = await readFile(new URL("index.html", outputRoot), "utf8");
  assert.match(html, /<html lang="pt-BR"/);
  assert.match(html, /Futbobo/);
  assert.match(html, /Sua carreira começa na base/i);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /og-v3\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("inclui o conteúdo central do jogo no bundle", async () => {
  const files = await walk(outputRoot);
  const scripts = files.filter((file) => file.pathname.endsWith(".js"));
  const bundle = (await Promise.all(scripts.map((file) => readFile(file, "utf8")))).join("\n");

  for (const content of [
    "Athletico-PR",
    "Flamengo",
    "Palmeiras",
    "Remo",
    "Goleiro",
    "Centroavante",
    "Escolha sua base",
    "Brasileirão",
    "Copa do Brasil",
    "Libertadores",
    "Mundial de Clubes",
    "Pedir transferência",
    "CONSEQUÊNCIAS DA ESCOLHA",
    "Ver propostas profissionais",
  ]) {
    assert.match(bundle, new RegExp(content, "i"));
  }
});

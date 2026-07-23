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
  assert.match(html, /Sua carreira, seu legado/i);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /og-v5\.png/);
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
    "Premier League",
    "Real Madrid",
    "Champions League",
    "Europa League",
    "Conference League",
    "Copa do Mundo",
    "Copa América",
    "Eurocopa",
    "Jogos Olímpicos",
    "CENTRAL DA SELEÇÃO",
    "Pedir transferência",
    "Aposentar",
    "Pendurar as chuteiras agora",
    "DESTAQUE ABRIU ESTA PORTA",
    "VITRINE EUROPEIA",
    "CONSEQUÊNCIAS DA ESCOLHA",
    "Ver propostas profissionais",
    "META DO TREINADOR",
    "CONTRATO E ELENCO",
    "ÍNDICE DE LEGADO",
    "CONQUISTAS",
    "Fla-Flu",
  ]) {
    assert.match(bundle, new RegExp(content, "i"));
  }
});

test("mantém o novo equilíbrio de progressão, mercado e clubes brasileiros", async () => {
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const brazilBlock = gameData.slice(
    gameData.indexOf("const BRAZIL_CLUBS"),
    gameData.indexOf("const EUROPE_CLUBS"),
  );

  assert.equal((brazilBlock.match(/reputation: 5/g) ?? []).length, 2);
  assert.equal((brazilBlock.match(/strength: \d+/g) ?? []).length, 20);
  assert.match(page, /brasileirao: 0\.42/);
  assert.match(page, /cupLoadFactor/);
  assert.match(page, /continentalLoadFactor/);
  assert.match(page, /}, 5000\);/);
  assert.match(page, /overall - 1/);
  assert.match(page, /function selectTransferOffers/);
  assert.match(page, /extraEuropeanOffers/);
  assert.match(page, /europeanDevelopmentBonus/);
  assert.match(page, /retirement-confirm/);
});

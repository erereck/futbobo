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

test("mantém a carreira encaixada na tela mobile com ações fixas", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /mobile-action-dock/);
  assert.match(page, /career-phase-\$\{game\.phase\}/);
  assert.match(styles, /@media \(max-width: 540px\)/);
  assert.match(styles, /\.career-shell \{[\s\S]*height: 100%/);
  assert.match(styles, /\.mobile-action-dock \{[\s\S]*position: fixed/);
  assert.match(styles, /\.event-card \{[\s\S]*position: absolute/);
});

test("aplica o equilíbrio levemente mais favorável sem liberar títulos fáceis", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const systems = await readFile(new URL("../app/career-systems.ts", import.meta.url), "utf8");

  assert.match(page, /fateRoll < 0\.18/);
  assert.match(page, /roleScore >= 5 \? 33[\s\S]*roleScore >= -5 \? 19 : 11/);
  assert.match(page, /affected\.age <= 19\) development = growthRoll < 0\.32 \? 0/);
  assert.match(page, /seriousInjuryChance = 0\.038/);
  assert.match(page, /playerImpact \* 0\.36/);
  assert.match(page, /,\s*1,\s*27,/);
  assert.match(page, /,\s*1,\s*20\);/);
  assert.match(systems, /penalty: role === "promessa" \? 3 : 6/);
  assert.match(page, /Bola de Ouro/);
});

test("mantém o gramado contínuo atrás da meta do treinador", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /\.event-stage \{[\s\S]*repeating-linear-gradient/);
  assert.match(styles, /\.event-art \{[^}]*background: transparent/);
  assert.match(styles, /\.event-stage \.market-strip \{[^}]*background: rgba\(7,23,16,.9\)/);
});

test("prende a rolagem no resultado e deixa o imprevisto passar pelo rodapé", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /futbobo-viewport-locked/);
  assert.match(page, /window\.scrollTo\(0, 0\)/);
  assert.match(styles, /body\.futbobo-viewport-locked[\s\S]*position: fixed/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
  assert.match(styles, /\.result-stage \{[\s\S]*padding-bottom: calc\(env\(safe-area-inset-bottom\) \+ 150px\)/);
  assert.match(styles, /max\(9px, min\(env\(safe-area-inset-bottom\), 34px\)\)/);
});

test("protege o OVR jovem e permite explosões raras de talento", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /affected\.age <= 29\) development = growthRoll < 0\.58 \? 0/);
  assert.match(page, /rareEarlyDeclineChance = affected\.age <= 29 \? 0\.015 : 0\.04/);
  assert.match(page, /affected\.age <= 33\) development = growthRoll < 0\.08 \? -2/);
  assert.match(page, /const breakoutThreshold = isKeeper \? 70/);
  assert.match(page, /const breakoutChance = clamp\(12[\s\S]*12, 55\)/);
  assert.match(page, /hugeBreakout \? 5 : 3/);
  assert.match(page, /EXPLOSÃO DE TALENTO/);
  assert.match(styles, /\.breakout-result/);
  assert.match(styles, /@keyframes breakout-glow/);
});

test("prioriza clubes europeus quando a carreira já está na Europa", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /isAbroad\(current\) && !opts\.forceDomestic/);
  assert.match(page, /forceForeign: true/);
  assert.match(page, /brazilReturnChance = state\.age >= 34 \? 0\.16 : state\.age >= 30 \? 0\.09 : 0\.04/);
  assert.match(page, /Math\.max\(0, europeanOffers - 3\)/);
  assert.match(page, /MERCADO EUROPEU/);
  assert.match(page, /Retorno raro ao Brasil/);
  assert.match(styles, /\.european-market-card/);
  assert.match(styles, /\.offer-homecoming-tag/);
});

test("gera temporadas com mais gols e assistências sem igualar todas as posições", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");

  assert.match(page, /const productionMomentum = clamp\(/);
  assert.match(page, /roleProductionBonus/);
  assert.match(page, /position\.goals \* quality \* productionMomentum/);
  assert.match(page, /position\.assists \* quality \* productionMomentum/);
  assert.match(data, /key: "CA"[\s\S]*goals: 0\.43, assists: 0\.11/);
  assert.match(data, /key: "MEI"[\s\S]*goals: 0\.22, assists: 0\.3/);
  assert.match(data, /key: "PD"[\s\S]*goals: 0\.28, assists: 0\.22/);
});

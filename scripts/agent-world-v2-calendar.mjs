import fs from "node:fs";

function replaceOnce(path, search, replacement, label) {
  const source = fs.readFileSync(path, "utf8");
  if (source.includes(replacement)) return;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing marker: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous marker: ${label}`);
  fs.writeFileSync(path, source.slice(0, first) + replacement + source.slice(first + search.length));
}

replaceOnce(
  "app/components/career/CareerGame.tsx",
  "        season: current.season + revealAge - 12,",
  "        // A base é uma introdução sem calendário rígido; toda carreira nova entra no profissional em 2027.\n        season: 2027,",
  "professional start year",
);

replaceOnce(
  "app/career/world-memory.ts",
  "// Títulos reconhecidos até a Copa de 2026. O save diverge da realidade a partir\n// de 2034; a Copa de 2030 fica propositalmente fora do ledger para não criar um\n// fato mundial enquanto o jogador ainda está atravessando a base.",
  "// Títulos reconhecidos até a Copa de 2026. A partir de 2030 o universo de cada\n// save diverge da realidade e passa a registrar seu próprio campeão mundial.",
  "World Cup timeline comment",
);

replaceOnce(
  "app/career/world-memory.ts",
  "  for (let season = 2034; season <= latestCompletedSeason; season += 4) {",
  "  for (let season = 2030; season <= latestCompletedSeason; season += 4) {",
  "World Cup simulation start",
);

console.log("Applied World V2 calendar changes.");

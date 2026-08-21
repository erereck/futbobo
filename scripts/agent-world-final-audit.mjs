import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`Ambiguous ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

{
  const path = "app/career/world-club-competitions.ts";
  let source = fs.readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    'import type { GameState, SeasonRecord } from "./model";\n',
    'import type { GameState, SeasonRecord } from "./model";\nimport type { WorldPlayer } from "./world-player-model";\n',
    "WorldPlayer import",
  );
  source = replaceOnce(
    source,
    `function worldPlayerSquadBoost(state: GameState, clubId: string) {\n  return Object.values(state.worldPlayers?.players ?? {})\n    .filter((player) => player.status !== "retired" && player.currentClubId === clubId)\n    .sort((a, b) => b.overall - a.overall)\n    .slice(0, 4)\n    .reduce((total, player) => total + Math.max(0, player.overall - 76) * 1.45, 0);\n}`,
    `function worldPlayerWasAtClub(player: WorldPlayer, clubId: string, season: number) {\n  return player.clubHistory.some((spell) =>\n    spell.clubId === clubId &&\n    spell.joinedSeason <= season &&\n    (spell.leftSeason === null || spell.leftSeason >= season)\n  );\n}\n\nfunction worldPlayerSquadBoost(state: GameState, clubId: string, season: number) {\n  return Object.values(state.worldPlayers?.players ?? {})\n    .filter((player) => player.generatedSeason <= season && worldPlayerWasAtClub(player, clubId, season))\n    .sort((a, b) => b.potential - a.potential || a.id.localeCompare(b.id))\n    .slice(0, 4)\n    .reduce((total, player) => {\n      const honorsAtTheTime = player.honors.filter((honor) => honor.season <= season).length;\n      return total + Math.max(0, player.potential - 76) * 1.25 + Math.min(12, honorsAtTheTime * 1.5);\n    }, 0);\n}`,
    "stable club generation boost",
  );
  source = source.replaceAll("worldPlayerSquadBoost(state, club.id)", "worldPlayerSquadBoost(state, club.id, season)");
  source = replaceOnce(
    source,
    '      : pickWinner(state, config, season, titles, playerCompetition ? playerRecord?.clubId ?? "" : "");',
    '      : pickWinner(state, config, season, titles, playerRecord?.clubId ?? "");',
    "exclude protagonist club when absent or eliminated",
  );
  fs.writeFileSync(path, source);
}

{
  const path = "app/career/world-national-competitions.ts";
  let source = fs.readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    `  historyNames: string[];\n  historicTitles: Record<string, number>;`,
    `  historyNames: string[];\n  startSeason: number;\n  interval: number;\n  historicTitles: Record<string, number>;`,
    "national cadence fields",
  );
  const cadence = [
    ['historyNames: ["euro", "eurocopa", "campeonato europeu"],', 'historyNames: ["euro", "eurocopa", "campeonato europeu"],\n    startSeason: 2028,\n    interval: 4,'],
    ['historyNames: ["copa america", "copa américa"],', 'historyNames: ["copa america", "copa américa"],\n    startSeason: 2028,\n    interval: 4,'],
    ['historyNames: ["copa ouro", "gold cup"],', 'historyNames: ["copa ouro", "gold cup"],\n    startSeason: 2027,\n    interval: 2,'],
    ['historyNames: ["copa da asia", "copa da ásia", "asian cup"],', 'historyNames: ["copa da asia", "copa da ásia", "asian cup"],\n    startSeason: 2027,\n    interval: 4,'],
    ['historyNames: ["copa africana de nacoes", "copa africana de nações", "afcon"],', 'historyNames: ["copa africana de nacoes", "copa africana de nações", "afcon"],\n    startSeason: 2027,\n    interval: 2,'],
    ['historyNames: ["copa das nacoes da ofc", "copa das nações da ofc", "ofc nations cup"],', 'historyNames: ["copa das nacoes da ofc", "copa das nações da ofc", "ofc nations cup"],\n    startSeason: 2028,\n    interval: 4,'],
  ];
  for (const [from, to] of cadence) source = replaceOnce(source, from, to, `cadence ${from}`);
  source = replaceOnce(
    source,
    `function worldPlayerNationBoost(state: GameState, countryId: string) {\n  return Object.values(state.worldPlayers?.players ?? {})\n    .filter((player) => player.status !== "retired" && player.nationality === countryId)\n    .sort((a, b) => b.overall - a.overall)\n    .slice(0, 6)\n    .reduce((total, player) => total + Math.max(0, player.overall - 75) * 1.25, 0);\n}`,
    `function worldPlayerNationBoost(state: GameState, countryId: string, season: number) {\n  return Object.values(state.worldPlayers?.players ?? {})\n    .filter((player) => player.generatedSeason <= season && player.nationality === countryId)\n    .sort((a, b) => b.potential - a.potential || a.id.localeCompare(b.id))\n    .slice(0, 6)\n    .reduce((total, player) => {\n      const honorsAtTheTime = player.honors.filter((honor) => honor.season <= season).length;\n      return total + Math.max(0, player.potential - 75) * 1.1 + Math.min(10, honorsAtTheTime);\n    }, 0);\n}`,
    "stable national generation boost",
  );
  source = source.replaceAll("worldPlayerNationBoost(state, country.id)", "worldPlayerNationBoost(state, country.id, season)");
  source = replaceOnce(
    source,
    "    for (let season = 2028; season <= latestCompletedSeason; season += 4) {",
    "    for (let season = config.startSeason; season <= latestCompletedSeason; season += config.interval) {",
    "national cadence loop",
  );
  fs.writeFileSync(path, source);
}

{
  const path = "app/components/career/CareerWorld.tsx";
  let source = fs.readFileSync(path, "utf8");
  const from = "            {recentChampions.length > 0 && (";
  const to = "            {open && recentChampions.length > 0 && (";
  const count = source.split(from).length - 1;
  if (count === 2) source = source.replaceAll(from, to);
  else if (!source.includes(to)) throw new Error(`Expected 2 collapsed recent champion blocks, got ${count}`);
  fs.writeFileSync(path, source);
}

{
  const path = "app/career/simulation.ts";
  let source = fs.readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    "  const nextFitness = physicalLoad.fitness;",
    "  const nextFitness = clamp(physicalLoad.fitness, 24, 99);",
    "explicit fitness clamp",
  );
  fs.writeFileSync(path, source);
}

{
  const path = "app/career/shared.ts";
  let source = fs.readFileSync(path, "utf8");
  const helper = `\n// Mantém o contrato histórico de fitness 0–100 centralizado. O modelo de carga\n// calcula o valor bruto em fatigue.ts; qualquer consumidor pode normalizá-lo aqui.\nexport function clampFitness(value: number) {\n  const nextFitness = clamp(value, 24, 99);\n  return nextFitness;\n}\n`;
  source = source.replace(helper, "\n");
  fs.writeFileSync(path, source);
}

import fs from "node:fs";

function patch(path, transform) {
  const source = fs.readFileSync(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`No changes made to ${path}`);
  fs.writeFileSync(path, next);
}

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`Ambiguous ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

patch("app/career/official-football-records.ts", (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'import { clubById } from "./shared";\n',
    'import { clubById } from "./shared";\nimport { worldPlayerBallonDorLeaders, worldPlayerGenerationLeaders, worldPlayerStatLeaders, worldPlayerTransferLeaders } from "./world-player-world";\n',
    "World Player ranking imports",
  );
  source = replaceOnce(
    source,
    '    | "sudamericana-titles"\n    | "world-cup-goals";',
    '    | "sudamericana-titles"\n    | "world-cup-goals"\n    | "current-generation"\n    | "largest-world-transfers";',
    "ranking id union",
  );
  source = replaceOnce(
    source,
    `export function footballRankingsForState(state: GameState): OfficialFootballRanking[] {\n  const ballonWinners = ballonDorWinnersFromSave(state);\n  const worldCupGoals = playerWorldCupGoals(state);\n  const careerGoals = state.stats.goals;\n  const careerAssists = state.stats.assists;\n\n  return OFFICIAL_FOOTBALL_RANKINGS.map((board) => {`,
    `export function footballRankingsForState(state: GameState): OfficialFootballRanking[] {\n  const ballonWinners = ballonDorWinnersFromSave(state);\n  const worldCupGoals = playerWorldCupGoals(state);\n  const careerGoals = state.stats.goals;\n  const careerAssists = state.stats.assists;\n  const worldGoalLeaders = worldPlayerStatLeaders(state, "goals");\n  const worldAssistLeaders = worldPlayerStatLeaders(state, "assists");\n  const worldBallonLeaders = worldPlayerBallonDorLeaders(state);\n  const historicBallonNames = new Set([...ballonWinners.keys()].map(normalizedLabel));\n\n  const historicalBoards = OFFICIAL_FOOTBALL_RANKINGS.map((board) => {`,
    "ranking projection setup",
  );
  source = replaceOnce(
    source,
    `    if (board.id === "all-time-goals") addEntry(entries, state.name, careerGoals, true);\n    if (board.id === "all-time-assists") addEntry(entries, state.name, careerAssists, true);\n\n    if (board.id === "ballon-dor-wins") {\n      ballonWinners.forEach((count, name) => addEntry(entries, name, count, name === state.name));\n    }`,
    `    if (board.id === "all-time-goals") {\n      addEntry(entries, state.name, careerGoals, true);\n      worldGoalLeaders.forEach((entry) => addEntry(entries, entry.label, entry.value));\n    }\n    if (board.id === "all-time-assists") {\n      addEntry(entries, state.name, careerAssists, true);\n      worldAssistLeaders.forEach((entry) => addEntry(entries, entry.label, entry.value));\n    }\n\n    if (board.id === "ballon-dor-wins") {\n      ballonWinners.forEach((count, name) => addEntry(entries, name, count, name === state.name));\n      worldBallonLeaders.forEach((entry) => {\n        if (!historicBallonNames.has(normalizedLabel(entry.label))) addEntry(entries, entry.label, entry.value);\n      });\n    }`,
    "living ranking population",
  );
  source = replaceOnce(
    source,
    `    return { ...board, entries: sortRanking(entries) };\n  });\n}`,
    `    return { ...board, entries: sortRanking(entries) };\n  });\n\n  const generationEntries: OfficialFootballRankingEntry[] = worldPlayerGenerationLeaders(state).map((entry) => ({\n    label: entry.label,\n    value: entry.value,\n  }));\n  if (state.name && state.overall > 0) generationEntries.push({ label: state.name, value: state.overall, highlight: true });\n\n  const generationBoard: OfficialFootballRanking | null = generationEntries.length ? {\n    id: "current-generation",\n    eyebrow: "GERAÇÃO DO SAVE",\n    label: "Maiores nomes da geração",\n    unit: "OVR",\n    cutoff: \`Universo persistente · temporada \${state.season}\`,\n    living: true,\n    entries: sortRanking(generationEntries),\n  } : null;\n\n  const transferEntries = worldPlayerTransferLeaders(state).map((entry) => ({\n    label: entry.label,\n    value: entry.value,\n    highlight: entry.highlight,\n  }));\n  const transferBoard: OfficialFootballRanking | null = transferEntries.length ? {\n    id: "largest-world-transfers",\n    eyebrow: "MERCADO · SEU UNIVERSO",\n    label: "Maiores transferências do universo",\n    unit: "mi €",\n    cutoff: "Transferências registradas neste save",\n    living: true,\n    entries: sortRanking(transferEntries),\n  } : null;\n\n  return [\n    ...historicalBoards,\n    ...(generationBoard ? [generationBoard] : []),\n    ...(transferBoard ? [transferBoard] : []),\n  ];\n}`,
    "dynamic World Player boards",
  );
  return source;
});

patch("app/career/world-memory.ts", (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'import { clubById, seeded } from "./shared";\n',
    'import { clubById, seeded } from "./shared";\nimport { worldPlayerNewsForState } from "./world-player-world";\n',
    "World Player news import",
  );
  source = replaceOnce(
    source,
    `    ...nationalNews(state),\n    ...rivalNews(state),\n  ];`,
    `    ...nationalNews(state),\n    ...rivalNews(state),\n    ...worldPlayerNewsForState(state),\n  ];`,
    "World Player news feed",
  );
  return source;
});

patch("app/components/career/CareerWorld.tsx", (input) => replaceOnce(
  input,
  '<small>História real + sua carreira</small>',
  '<small>História real + seu universo</small>',
  "Arquivo Vivo subtitle",
));

console.log("World Players are now projected into Mundo.");

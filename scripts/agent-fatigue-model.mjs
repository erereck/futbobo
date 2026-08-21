import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

const path = "app/career/simulation.ts";
let source = fs.readFileSync(path, "utf8");
source = replaceOnce(
  source,
  'import { advanceWorldPlayerUniverse } from "./world-players";\n',
  'import { advanceWorldPlayerUniverse } from "./world-players";\nimport { seasonFitnessAfterLoad } from "./fatigue";\n',
  "fatigue import",
);
source = replaceOnce(
  source,
  `  const fitnessTarget =\n    91 -\n    Math.max(0, appearances - 30) * 0.55 -\n    Math.max(0, nextAge - 30) * 0.7 +\n    (objectiveResult.completed ? 2 : -1) +\n    (seeded(state.seed, state.season * 307) * 8 - 4);\n  const nextFitness = clamp(\n    Math.round(affected.fitness * 0.42 + fitnessTarget * 0.58 + twistFitness),\n    32,\n    98,\n  );`,
  `  const physicalLoad = seasonFitnessAfterLoad({\n    seed: state.seed,\n    season: affected.season,\n    startingFitness: affected.fitness,\n    age: nextAge,\n    stamina: affected.attributes.stamina,\n    lifeBalance: affected.lifeBalance,\n    appearances,\n    nationalAppearances: nationalHistoryAdd?.tournamentStats?.appearances ?? (calledUp ? 2 : 0),\n    continentalCampaign: Boolean(playsContinental),\n    continentalChampion,\n    clubWorldCampaign: playsWorld,\n    titles: titleCount,\n    injuryMatchesMissed: medicalRecord?.matchesMissed ?? 0,\n    suspensionMatches: affected.suspensionMatches,\n    ironLungs: hasTrait("iron-lungs"),\n    injuryProne: hasTrait("injury-prone"),\n    twistFitness,\n  });\n  const nextFitness = physicalLoad.fitness;`,
  "fitness target block",
);
fs.writeFileSync(path, source);

import fs from "node:fs";

function replaceOnce(path, search, replacement, label) {
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(replacement)) return;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing marker: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous marker: ${label}`);
  source = source.slice(0, first) + replacement + source.slice(first + search.length);
  fs.writeFileSync(path, source);
}

replaceOnce(
  "app/game-data.ts",
  "  fitness?: number;\n  reputation?: number;",
  "  fitness?: number;\n  physicalBoost?: number;\n  reputation?: number;",
  "Effect physicalBoost",
);
replaceOnce(
  "app/game-data.ts",
  "  needsRivalry?: boolean;\n  maxContractYears?: number;",
  "  needsRivalry?: boolean;\n  needsClubIds?: string[];\n  maxContractYears?: number;",
  "GameEvent needsClubIds",
);

replaceOnce(
  "app/career/state.ts",
  'import { GOALKEEPER_EVENTS } from "../goalkeeper-events";\n',
  'import { GOALKEEPER_EVENTS } from "../goalkeeper-events";\nimport { CLUB_SPECIFIC_EVENTS } from "./club-specific-events";\n',
  "club events import",
);
replaceOnce(
  "app/career/state.ts",
  "export const ALL_PRO_EVENTS = [...PRO_EVENTS, ...MEGA_EVENTS, ...CAREER_DRAMA_EVENTS, ...BACKSTAGE_EVENTS, ...FUTBOBO_MOMENTS, ...GOALKEEPER_EVENTS];",
  "export const ALL_PRO_EVENTS = [...PRO_EVENTS, ...MEGA_EVENTS, ...CAREER_DRAMA_EVENTS, ...BACKSTAGE_EVENTS, ...FUTBOBO_MOMENTS, ...GOALKEEPER_EVENTS, ...CLUB_SPECIFIC_EVENTS];",
  "ALL_PRO_EVENTS",
);

replaceOnce(
  "app/career/events.ts",
  "    if (event.needsRivalry && !RIVALRIES.some((rivalry) => rivalry.clubIds.includes(club.id))) return false;\n    if (event.maxContractYears !== undefined",
  "    if (event.needsRivalry && !RIVALRIES.some((rivalry) => rivalry.clubIds.includes(club.id))) return false;\n    if (event.needsClubIds && !event.needsClubIds.includes(club.id)) return false;\n    if (event.maxContractYears !== undefined",
  "eligible club IDs",
);
replaceOnce(
  "app/career/events.ts",
  "  return {\n    ...state,\n    overall,\n    attributes: shiftPlayerAttributes(state.attributes, effect.ovr ?? 0, state.position, state.seed + state.season),",
  "  const shiftedAttributes = shiftPlayerAttributes(state.attributes, effect.ovr ?? 0, state.position, state.seed + state.season);\n  const physicalBoost = effect.physicalBoost ?? 0;\n  const attributes = physicalBoost === 0\n    ? shiftedAttributes\n    : {\n        ...shiftedAttributes,\n        pace: clamp(shiftedAttributes.pace + physicalBoost, 15, 99),\n        acceleration: clamp(shiftedAttributes.acceleration + physicalBoost, 15, 99),\n        strength: clamp(shiftedAttributes.strength + physicalBoost, 15, 99),\n        stamina: clamp(shiftedAttributes.stamina + physicalBoost, 15, 99),\n      };\n  return {\n    ...state,\n    overall,\n    attributes,",
  "physical attribute boost",
);

replaceOnce(
  "app/career/world-memory.ts",
  "function weightedCountryPick(\n  state: GameState,\n  season: number,\n  salt: number,\n  titles: Record<string, number>,\n  excluded: Set<string>,\n) {\n  const candidates = COUNTRIES.filter((country) => !excluded.has(country.id));\n  const scored = candidates.map((country, index) => {\n    const historicPull = titles[country.id] ?? 0;\n    const weight = Math.max(0.75, country.strength * country.strength + historicPull * 1.45);\n    const roll = Math.max(0.000001, seeded(state.seed, season * 977 + salt + index * 43));\n    return { country, score: Math.pow(roll, 1 / weight) };\n  });\n  scored.sort((a, b) => b.score - a.score || b.country.strength - a.country.strength);\n  return scored[0]?.country.id ?? \"brasil\";\n}",
  "function weightedCountryPick(\n  state: GameState,\n  season: number,\n  salt: number,\n  titles: Record<string, number>,\n  excluded: Set<string>,\n  role: \"winner\" | \"runner-up\",\n) {\n  const available = COUNTRIES.filter((country) => !excluded.has(country.id));\n  const upsetRoll = seeded(state.seed, season * 2017 + salt * 13);\n  const elitePool = available.filter((country) => country.strength >= 4 || (titles[country.id] ?? 0) >= 2);\n  const strongPool = available.filter((country) => country.strength >= 3 || (titles[country.id] ?? 0) >= 1);\n  const candidates = role === \"winner\"\n    ? upsetRoll < 0.08 && strongPool.length ? strongPool : elitePool.length ? elitePool : strongPool.length ? strongPool : available\n    : strongPool.length ? strongPool : available;\n  const scored = candidates.map((country, index) => {\n    const historicPull = titles[country.id] ?? 0;\n    const weight = Math.max(1, country.strength ** 4 + historicPull * 10);\n    const roll = Math.max(0.000001, seeded(state.seed, season * 977 + salt + index * 43));\n    return { country, score: Math.pow(roll, 1 / weight) };\n  });\n  scored.sort((a, b) => b.score - a.score || b.country.strength - a.country.strength);\n  return scored[0]?.country.id ?? \"brasil\";\n}",
  "elite World Cup picker",
);
replaceOnce(
  "app/career/world-memory.ts",
  "  const winnerCountryId = weightedCountryPick(state, season, 31, titles, excluded);\n  const runnerUpCountryId = nationalRecord?.stage === \"Vice\"\n    ? state.nationality\n    : weightedCountryPick(state, season, 79, titles, new Set([...excluded, winnerCountryId]));",
  "  const winnerCountryId = weightedCountryPick(state, season, 31, titles, excluded, \"winner\");\n  const runnerUpCountryId = nationalRecord?.stage === \"Vice\"\n    ? state.nationality\n    : weightedCountryPick(state, season, 79, titles, new Set([...excluded, winnerCountryId]), \"runner-up\");",
  "World Cup picker calls",
);

console.log("Applied club-specific event support and stronger World Cup simulation.");

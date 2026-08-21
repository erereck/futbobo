import fs from "node:fs";

const path = "app/components/career/CareerGame.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (source.includes(to)) return;
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  'import { ROLE_LABELS, calculateLegacyScore, calculateSquadRole, createContract, createSeasonObjective, legacyTier } from "../../career-systems";\n',
  'import { ROLE_LABELS, calculateSquadRole, createContract, createSeasonObjective } from "../../career-systems";\nimport { legacyBreakdownForState, legacyTierV2 } from "../../career/legacy-prestige";\n',
  "legacy imports",
);

replaceOnce(
  '  const legacyStanding = useMemo(() => legacyTier(displayGame.legacyPoints), [displayGame.legacyPoints]);',
  '  const legacyStanding = useMemo(() => legacyTierV2(displayGame.legacyPoints), [displayGame.legacyPoints]);',
  "legacy standing",
);

replaceOnce(
`      return {\n        ...nextState,\n        legacyPoints: calculateLegacyScore({\n          appearances: nextState.stats.appearances,\n          goals: nextState.stats.goals,\n          assists: nextState.stats.assists,\n          cleanSheets: nextState.stats.cleanSheets,\n          trophies: nextState.trophies,\n          nationalTrophies: nextState.nationalTrophies,\n          awards: nextState.awards,\n          ballonDor: nextState.awardCabinet["Bola de Ouro"] ?? 0,\n          nationalCaps: nextState.nationalCaps,\n          peakOverall: Math.max(nextState.overall, ...nextState.history.map((item) => item.overall)),\n          setbacks: nextState.setbacks,\n        }),\n      };`,
`      return {\n        ...nextState,\n        legacyPoints: legacyBreakdownForState(nextState).total,\n      };`,
  "legacy calculation",
);

fs.writeFileSync(path, source);
console.log("Prestige legacy integrated into CareerGame.");

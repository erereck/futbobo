import fs from "node:fs";

function replaceOnce(path, search, replacement, label) {
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(replacement)) return;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing Sudamericana marker: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous Sudamericana marker: ${label}`);
  source = source.slice(0, first) + replacement + source.slice(first + search.length);
  fs.writeFileSync(path, source);
}

replaceOnce(
  "app/game-data.ts",
  'export type ContinentalSlot = "libertadores" | "champions" | "europa" | "conference" | "concacaf" | "asian" | "african";',
  'export type ContinentalSlot = "libertadores" | "sudamericana" | "champions" | "europa" | "conference" | "concacaf" | "asian" | "african";',
  "ContinentalSlot",
);

replaceOnce(
  "app/career/model.ts",
  '  | "libertadores"\n  | "recopaSudamericana"',
  '  | "libertadores"\n  | "sudamericana"\n  | "recopaSudamericana"',
  "CompetitionId",
);
replaceOnce(
  "app/career/model.ts",
  '  libertadores: number;\n  recopaSudamericana: number;',
  '  libertadores: number;\n  sudamericana: number;\n  recopaSudamericana: number;',
  "TrophyCabinet",
);

replaceOnce(
  "app/career/academy.ts",
  '  if (confederation === "SOUTH_AMERICA") return club.reputation >= 4 ? "libertadores" : null;',
  '  if (confederation === "SOUTH_AMERICA") return club.reputation >= 4 ? "libertadores" : club.reputation >= 3 ? "sudamericana" : null;',
  "initial South America slot",
);
replaceOnce(
  "app/career/academy.ts",
  '  if (confederation === "SOUTH_AMERICA") return leagueChampion || cupChampion || leaguePosition <= 6 ? "libertadores" : null;',
  '  if (confederation === "SOUTH_AMERICA") {\n    if (leagueChampion || cupChampion || leaguePosition <= 6) return "libertadores";\n    if (leaguePosition <= 12) return "sudamericana";\n    return null;\n  }',
  "season South America slot",
);

replaceOnce(
  "app/career/state.ts",
  '      libertadores: 0,\n      recopaSudamericana: 0,',
  '      libertadores: 0,\n      sudamericana: 0,\n      recopaSudamericana: 0,',
  "initial trophy cabinet",
);
replaceOnce(
  "app/career/state.ts",
  '      libertadores: saved.trophyCabinet?.libertadores ?? 0,\n      recopaSudamericana: saved.trophyCabinet?.recopaSudamericana ?? 0,',
  '      libertadores: saved.trophyCabinet?.libertadores ?? 0,\n      sudamericana: saved.trophyCabinet?.sudamericana ?? 0,\n      recopaSudamericana: saved.trophyCabinet?.recopaSudamericana ?? 0,',
  "normalized trophy cabinet",
);

replaceOnce(
  "app/career/simulation.ts",
  '    libertadores: { id: "libertadores", name: "Libertadores", icon: "LIB" },\n    champions:',
  '    libertadores: { id: "libertadores", name: "Libertadores", icon: "LIB" },\n    sudamericana: { id: "sudamericana", name: "Copa Sul-Americana", icon: "SULA" },\n    champions:',
  "continental name",
);
replaceOnce(
  "app/career/simulation.ts",
  '  const playsRecopaSudamericana = clubConfederation(club) === "SOUTH_AMERICA" && wonLastSeason(["libertadores"]);',
  '  const playsRecopaSudamericana = clubConfederation(club) === "SOUTH_AMERICA" && wonLastSeason(["libertadores", "sudamericana"]);',
  "Recopa eligibility",
);
replaceOnce(
  "app/career/simulation.ts",
  '      libertadores: 94,\n      concacafChampions: 90,',
  '      libertadores: 94,\n      sudamericana: 86,\n      concacafChampions: 90,',
  "button match priority",
);
replaceOnce(
  "app/career/simulation.ts",
  '  const nextContinentalSlot = continentalSlotAfterSeason(club, league, leagueChampion, cupChampion, leaguePosition);',
  '  const qualifiedBySudamericana = continentalChampion && playsContinental === "sudamericana";\n  const nextContinentalSlot = qualifiedBySudamericana\n    ? "libertadores"\n    : continentalSlotAfterSeason(club, league, leagueChampion, cupChampion, leaguePosition);',
  "Sudamericana winner to Libertadores",
);

replaceOnce(
  "app/components/career/CareerPrimitives.tsx",
  '  { id: "libertadores", label: "Libertadores", shortLabel: "LIB", group: "CONTINENTAIS", symbol: "L", imagePath: "/assets/competitions/libertadores.png" },\n  { id: "recopaSudamericana"',
  '  { id: "libertadores", label: "Libertadores", shortLabel: "LIB", group: "CONTINENTAIS", symbol: "L", imagePath: "/assets/competitions/libertadores.png" },\n  { id: "sudamericana", label: "Copa Sul-Americana", shortLabel: "SULA", group: "CONTINENTAIS", symbol: "S" },\n  { id: "recopaSudamericana"',
  "trophy presentation",
);

replaceOnce(
  "app/career/world-memory.ts",
  '  "libertadores",\n  "mundial",',
  '  "libertadores",\n  "sudamericana",\n  "mundial",',
  "World major competitions",
);

console.log("Applied Copa Sul-Americana support.");

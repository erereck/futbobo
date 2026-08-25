import { readFile, writeFile } from "node:fs/promises";

const file = "app/components/career/PlayerCreationV2.tsx";
let source = await readFile(file, "utf8");

source = source.replace(
  'import { defaultAcademyCountry } from "../../career/academy";',
  'import { defaultAcademyCountry, randomClubSelection } from "../../career/academy";',
);

const previous = `  const academyClubs = useMemo(() => {\n    const limit = 6;\n    const countryClubs = CLUBS\n      .filter((club) => club.countryId === academyCountry.id)\n      .sort((a, b) => a.reputation - b.reputation || a.strength - b.strength);\n    const divisions = LEAGUES\n      .filter((league) => league.countryId === academyCountry.id)\n      .sort((a, b) => b.prestige - a.prestige);\n\n    if (divisions.length < 2) return countryClubs.slice(0, limit);\n\n    const perDivision = Math.floor(limit / 2);\n    const selected = [\n      ...countryClubs.filter((club) => club.leagueId === divisions[0].id).slice(0, perDivision),\n      ...countryClubs.filter((club) => club.leagueId === divisions[1].id).slice(0, perDivision),\n    ];\n\n    if (selected.length < limit) {\n      const selectedIds = new Set(selected.map((club) => club.id));\n      selected.push(...countryClubs.filter((club) => !selectedIds.has(club.id)).slice(0, limit - selected.length));\n    }\n\n    return selected.slice(0, limit);\n  }, [academyCountry.id]);`;

const next = `  const academyClubs = useMemo(() => {\n    const limit = 6;\n    const countryClubs = CLUBS.filter((club) => club.countryId === academyCountry.id);\n    const divisions = LEAGUES\n      .filter((league) => league.countryId === academyCountry.id)\n      .sort((a, b) => b.prestige - a.prestige);\n    const countrySalt = [...academyCountry.id].reduce((total, char) => total + char.charCodeAt(0), 0);\n    const baseSalt = 3500 + countrySalt * 17;\n\n    if (divisions.length < 2) {\n      return randomClubSelection(countryClubs, limit, game.seed, baseSalt);\n    }\n\n    const perDivision = Math.floor(limit / 2);\n    const firstDivision = randomClubSelection(\n      countryClubs.filter((club) => club.leagueId === divisions[0].id),\n      perDivision,\n      game.seed,\n      baseSalt + 101,\n    );\n    const secondDivision = randomClubSelection(\n      countryClubs.filter((club) => club.leagueId === divisions[1].id),\n      perDivision,\n      game.seed,\n      baseSalt + 211,\n    );\n    const selected = [...firstDivision, ...secondDivision];\n\n    if (selected.length < limit) {\n      const selectedIds = new Set(selected.map((club) => club.id));\n      const fallbackPool = countryClubs.filter((club) => !selectedIds.has(club.id));\n      selected.push(...randomClubSelection(fallbackPool, limit - selected.length, game.seed, baseSalt + 307));\n    }\n\n    return selected.slice(0, limit);\n  }, [academyCountry.id, game.seed]);`;

if (!source.includes(previous)) {
  throw new Error("Bloco original de academyClubs não encontrado; abortando para não aplicar patch incorreto.");
}

source = source.replace(previous, next);
await writeFile(file, source, "utf8");
console.log("Opções iniciais de base agora são aleatórias e divididas 50/50 quando há segunda divisão.");

import fs from "node:fs";

const path = "app/career/simulation.ts";
let source = fs.readFileSync(path, "utf8");
const needle = `    titleCount,\n    majorClubTitleCount,\n    majorNationalTitle,`;
const replacement = `    titleCount,\n    majorClubTitleCount,\n    domesticCupChampion: cupChampion,\n    majorNationalTitle,`;

if (source.includes(replacement)) {
  console.log("Brazil Ballon input already materialized.");
  process.exit(0);
}
if (!source.includes(needle)) throw new Error("Ballon input block not found in simulation.ts");
source = source.replace(needle, replacement);
fs.writeFileSync(path, source);
console.log("Materialized domesticCupChampion into Ballon d'Or evaluation.");

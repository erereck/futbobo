import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const target = path.join(process.cwd(), "scripts", "sync-football-assets.mjs");
let source = await readFile(target, "utf8");

if (!source.includes('"wisla-plock": "https://a.espncdn.com/i/teamlogos/soccer/500/2700.png"')) {
  source = source.replace(
    "const EXTERNAL_CLUB_ASSETS = {",
    `const EXTERNAL_CLUB_ASSETS = {
  "wisla-plock": "https://a.espncdn.com/i/teamlogos/soccer/500/2700.png",
  "lokomotiva-zagreb": "https://a.espncdn.com/i/teamlogos/soccer/500/15707.png",
  "vukovar-1991": "https://hnk-vukovar1991.hr/wp-content/uploads/2024/07/grb-vukovar.png",
  "red-star-belgrade": "https://a.espncdn.com/i/teamlogos/soccer/500/2290.png",
  partizan: "https://a.espncdn.com/i/teamlogos/soccer/500/541.png",`,
  );
}

await writeFile(target, source, "utf8");
console.log("Added explicit badge fallbacks for the five unresolved clubs.");

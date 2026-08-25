import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const file = path.join(process.cwd(), "scripts", "sync-football-assets.mjs");
let source = await readFile(file, "utf8");
source = source
  .replace(
    '"wisla-plock": "https://a.espncdn.com/i/teamlogos/soccer/500/2700.png"',
    '"wisla-plock": "https://upload.wikimedia.org/wikipedia/commons/0/0e/Wisla_P%C5%82ock.png"',
  )
  .replace(
    '"lokomotiva-zagreb": "https://a.espncdn.com/i/teamlogos/soccer/500/15707.png"',
    '"lokomotiva-zagreb": "https://webp.vp.cdn.pxr.nl/tag/clubs/7nk3gfpmnuay3xe6v58zsvp0y.png?width=1200"',
  );
await writeFile(file, source, "utf8");

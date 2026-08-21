import fs from "node:fs";
import { pathToFileURL } from "node:url";

const sourcePath = "scripts/agent-ballon-fields-update.mjs";
const tempPath = "/tmp/agent-ballon-fields-update-fixed.mjs";
let source = fs.readFileSync(sourcePath, "utf8");

// O teste gerado precisa procurar literalmente `${leagueLabel}` no código do
// jogo. No materializador original dois backslashes escapavam a regex, mas não
// a interpolação do template string externo. O terceiro backslash resolve isso
// sem duplicar o materializador inteiro.
const needle = "\\".repeat(2) + "$" + "{leagueLabel}";
const replacement = "\\".repeat(3) + "$" + "{leagueLabel}";
if (!source.includes(needle)) throw new Error("Ballon test interpolation needle not found");
source = source.replace(needle, replacement);
fs.writeFileSync(tempPath, source);
await import(pathToFileURL(tempPath).href + `?v=${Date.now()}`);

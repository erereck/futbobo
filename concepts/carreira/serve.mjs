// Servidor estático mínimo para ver os concepts com os escudos reais do projeto.
// Uso: node concepts/carreira/serve.mjs  →  http://localhost:5178/concepts/carreira/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const port = Number(process.env.PORT ?? 5178);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root + sep) && path !== root) throw Object.assign(new Error("fora da raiz"), { code: "EACCES" });
    if ((await stat(path)).isDirectory()) path = join(path, "index.html");
    const body = await readFile(path);
    response.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  } catch (error) {
    response.writeHead(error?.code === "EACCES" ? 403 : 404, { "content-type": "text/plain; charset=utf-8" });
    response.end("não encontrado");
  }
}).listen(port, () => console.log(`Concepts em http://localhost:${port}/concepts/carreira/`));

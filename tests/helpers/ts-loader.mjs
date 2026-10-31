import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Carrega os módulos TypeScript reais no Node (o padrão de tests/career-storage.test.mjs), sem dependência nova de teste.
// Só instala ganchos de `require`, então também funciona dentro de um Worker de worker_threads.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(ROOT, "package.json"));

// `import.meta` não existe no CommonJS: `new Worker(new URL("./x.worker.ts", import.meta.url))` (o padrão que o
// bundler entende, ex.: room/cpu-sim.ts) nem compilaria. Vira a URL do próprio arquivo antes do transpile.
const IMPORT_META_URL = /\bimport\.meta\.url\b/g;
const FILE_URL = 'require("node:url").pathToFileURL(__filename).href';

if (!require.extensions[".ts"]) {
  const compile = (module, filename) => {
    const source = readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source.includes("import.meta") ? source.replace(IMPORT_META_URL, FILE_URL) : source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
  // A mesma marca do allowImportMeta() de duel-follower-worker.mjs: com ela ele não empilha outra troca.
  compile.importMetaPatched = true;
  require.extensions[".ts"] = compile;
  require.extensions[".tsx"] = compile;

  // O alias "@/..." do tsconfig aponta para a raiz do repo.
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    if (request.startsWith("@/")) request = join(ROOT, request.slice(2));
    return resolveFilename.call(this, request, parent, ...rest);
  };
}

/** Carrega um módulo .ts pelo caminho relativo à raiz do repo (ex.: "app/botao/engine.ts"). */
export function loadTs(relPath) {
  return require(join(ROOT, relPath));
}

/** `localStorage`, `window` e `crypto` falsos para módulos que esperam o navegador. Devolve o mapa do storage. */
export function stubBrowser() {
  const values = new Map();
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => void values.set(key, String(value)),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  globalThis.localStorage = storage;
  globalThis.window = globalThis.window ?? {};
  globalThis.window.localStorage = storage;
  if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;
  globalThis.window.crypto = globalThis.crypto;
  return values;
}

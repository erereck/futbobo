// Retratos 3D das figurinhas guardados no aparelho (IndexedDB), para o menu não precisar ligar o
// three.js e o WebGL toda vez que o app abre. Sem three.js aqui: só leitura e escrita de imagens.
//
// A chave leva a versão do jogo: quando o boneco 3D muda numa atualização, os retratos antigos
// deixam de ser usados (e saem na limpeza). Qualquer falha (aba anônima, cota cheia, banco
// bloqueado) vira "não tem": a figurinha só volta a ser fotografada pelo estúdio, como antes.

import { FUTBOBO_VERSION } from "../../version";

const DB_NAME = "futbobo-sticker-portraits";
const STORE = "portraits";
/** Mude junto com o visual do boneco 3D se a versão do jogo não mudar. */
const STORE_VERSION = `${FUTBOBO_VERSION}|1`;
/** Retratos guardados (≈ 15–40 KB cada em WebP). */
const LIMIT = 60;

type StoredPortrait = { blob: Blob; usedAt: number };

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const storedKey = (key: string) => `${STORE_VERSION}|${key}`;

/** Retrato guardado como canvas 2D pronto para desenhar, ou `null`. */
export async function readStoredPortrait(key: string): Promise<HTMLCanvasElement | null> {
  const db = await openDb();
  if (!db) return null;
  const entry = await new Promise<StoredPortrait | null>((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(storedKey(key));
      request.onsuccess = () => resolve((request.result as StoredPortrait | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  if (!entry?.blob) return null;
  try {
    const bitmap = await createImageBitmap(entry.blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    touch(db, key, entry);
    return canvas;
  } catch {
    return null;
  }
}

/** Marca o uso (a limpeza tira os menos usados), sem pressa. */
function touch(db: IDBDatabase, key: string, entry: StoredPortrait) {
  if (Date.now() - entry.usedAt < 60 * 60 * 1000) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put({ blob: entry.blob, usedAt: Date.now() }, storedKey(key));
  } catch {
    // Sem marcar: o retrato só sai antes na limpeza.
  }
}

function whenIdle(callback: () => void) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(callback, { timeout: 4000 });
  else setTimeout(callback, 300);
}

/** Guarda um retrato recém-fotografado (codifica e grava quando a página estiver parada). */
export function storePortrait(key: string, portrait: HTMLCanvasElement) {
  whenIdle(() => {
    try {
      portrait.toBlob((blob) => {
        if (!blob) return;
        void openDb().then((db) => {
          if (!db) return;
          try {
            const transaction = db.transaction(STORE, "readwrite");
            transaction.objectStore(STORE).put({ blob, usedAt: Date.now() } satisfies StoredPortrait, storedKey(key));
            transaction.oncomplete = () => prune(db);
          } catch {
            // Cota cheia ou banco fechado: fica só na memória.
          }
        });
      }, "image/webp", 0.9);
    } catch {
      // Canvas inválido: nada a guardar.
    }
  });
}

let pruning = false;

/** Tira retratos de versões antigas e, passando do limite, os usados há mais tempo. */
function prune(db: IDBDatabase) {
  if (pruning) return;
  pruning = true;
  try {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const keys = store.getAllKeys();
    const values = store.getAll();
    transaction.oncomplete = () => {
      pruning = false;
    };
    transaction.onerror = transaction.onabort = () => {
      pruning = false;
    };
    values.onsuccess = () => {
      const entries = (keys.result as IDBValidKey[]).map((key, index) => ({ key: String(key), usedAt: (values.result[index] as StoredPortrait | undefined)?.usedAt ?? 0 }));
      const current = entries.filter((entry) => entry.key.startsWith(`${STORE_VERSION}|`));
      const stale = entries.filter((entry) => !entry.key.startsWith(`${STORE_VERSION}|`));
      const excess = current.sort((a, b) => b.usedAt - a.usedAt).slice(LIMIT);
      for (const entry of [...stale, ...excess]) store.delete(entry.key);
    };
  } catch {
    pruning = false;
  }
}

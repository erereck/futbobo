const DB_NAME = "futbobo-storage";
const DB_VERSION = 2;
const LARGE_STORAGE_STORE = "large-local-storage";

const LARGE_EXACT_KEYS = new Set([
  "futbobo:career:v1",
  "futbobo:challenge-save:v1",
]);
const LARGE_KEY_PREFIXES = ["futbobo:career-slot:v2:"];
const PROBE_KEY = "__futbobo_storage_probe__";

function isLargeStorageKey(key: string) {
  return LARGE_EXACT_KEYS.has(key) || LARGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function openDatabase() {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponível neste navegador."));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LARGE_STORAGE_STORE)) {
        database.createObjectStore(LARGE_STORAGE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB bloqueado por outra aba do Futbobo."));
  });
}

function readAll(database: IDBDatabase) {
  return new Promise<Map<string, string>>((resolve, reject) => {
    const transaction = database.transaction(LARGE_STORAGE_STORE, "readonly");
    const store = transaction.objectStore(LARGE_STORAGE_STORE);
    const keyRequest = store.getAllKeys();
    const valueRequest = store.getAll();
    transaction.oncomplete = () => {
      const cache = new Map<string, string>();
      keyRequest.result.forEach((key, index) => {
        const value = valueRequest.result[index];
        if (typeof key === "string" && typeof value === "string" && isLargeStorageKey(key)) {
          cache.set(key, value);
        }
      });
      resolve(cache);
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao ler saves do IndexedDB."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Leitura dos saves foi abortada."));
  });
}

function put(database: IDBDatabase, key: string, value: string) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LARGE_STORAGE_STORE, "readwrite");
    transaction.objectStore(LARGE_STORAGE_STORE).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao gravar save no IndexedDB."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Gravação do save foi abortada."));
  });
}

function remove(database: IDBDatabase, key: string) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LARGE_STORAGE_STORE, "readwrite");
    transaction.objectStore(LARGE_STORAGE_STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao excluir save do IndexedDB."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Exclusão do save foi abortada."));
  });
}

function clear(database: IDBDatabase) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LARGE_STORAGE_STORE, "readwrite");
    transaction.objectStore(LARGE_STORAGE_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao limpar saves do IndexedDB."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Limpeza dos saves foi abortada."));
  });
}

type BridgeState = {
  installed: boolean;
  cache: Map<string, string>;
};

declare global {
  interface Window {
    __FUTBOBO_LARGE_STORAGE_BRIDGE__?: BridgeState;
  }
}

/**
 * Mantém a API síncrona de localStorage usada pelo jogo, mas desvia apenas os
 * payloads gigantes de carreira para IndexedDB. Assim o restante do código não
 * precisa saber que o backend mudou e saves antigos continuam compatíveis.
 */
export async function installLargeStorageBridge() {
  if (typeof window === "undefined") return false;
  if (window.__FUTBOBO_LARGE_STORAGE_BRIDGE__?.installed) return true;

  const storage = window.localStorage;
  const prototype = Storage.prototype;
  const nativeGetItem = prototype.getItem;
  const nativeSetItem = prototype.setItem;
  const nativeRemoveItem = prototype.removeItem;
  const nativeClear = prototype.clear;

  let database: IDBDatabase;
  try {
    database = await openDatabase();
    // Confirma escrita de verdade antes de tirar um único byte do localStorage.
    await put(database, PROBE_KEY, "ok");
    await remove(database, PROBE_KEY);
  } catch (error) {
    console.error("[Futbobo] IndexedDB indisponível; mantendo armazenamento legado.", error);
    return false;
  }

  const cache = await readAll(database);

  // O valor físico vence o IndexedDB durante a primeira migração porque é a
  // cópia mais recente produzida pelas versões antigas do jogo.
  const physicalEntries: Array<[string, string]> = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !isLargeStorageKey(key)) continue;
    const value = nativeGetItem.call(storage, key);
    if (value !== null) {
      cache.set(key, value);
      physicalEntries.push([key, value]);
    }
  }

  const state: BridgeState = { installed: true, cache };

  try {
    Object.defineProperties(prototype, {
      getItem: {
        configurable: true,
        writable: true,
        value(this: Storage, key: string) {
          const normalizedKey = String(key);
          if (this === storage && isLargeStorageKey(normalizedKey)) {
            return state.cache.get(normalizedKey) ?? null;
          }
          return nativeGetItem.call(this, normalizedKey);
        },
      },
      setItem: {
        configurable: true,
        writable: true,
        value(this: Storage, key: string, value: string) {
          const normalizedKey = String(key);
          const normalizedValue = String(value);
          if (this === storage && isLargeStorageKey(normalizedKey)) {
            state.cache.set(normalizedKey, normalizedValue);
            // A transação é aberta imediatamente; não criamos uma fila JS que
            // poderia ficar para trás em sessões longas com autosave frequente.
            void put(database, normalizedKey, normalizedValue).catch((error) => {
              console.error(`[Futbobo] Falha ao persistir ${normalizedKey} no IndexedDB.`, error);
            });
            return;
          }
          nativeSetItem.call(this, normalizedKey, normalizedValue);
        },
      },
      removeItem: {
        configurable: true,
        writable: true,
        value(this: Storage, key: string) {
          const normalizedKey = String(key);
          if (this === storage && isLargeStorageKey(normalizedKey)) {
            state.cache.delete(normalizedKey);
            void remove(database, normalizedKey).catch((error) => {
              console.error(`[Futbobo] Falha ao excluir ${normalizedKey} do IndexedDB.`, error);
            });
            return;
          }
          nativeRemoveItem.call(this, normalizedKey);
        },
      },
      clear: {
        configurable: true,
        writable: true,
        value(this: Storage) {
          if (this === storage) {
            state.cache.clear();
            nativeClear.call(this);
            void clear(database).catch((error) => {
              console.error("[Futbobo] Falha ao limpar saves do IndexedDB.", error);
            });
            return;
          }
          nativeClear.call(this);
        },
      },
    });
  } catch (error) {
    console.error("[Futbobo] Não foi possível instalar a ponte de armazenamento.", error);
    return false;
  }

  window.__FUTBOBO_LARGE_STORAGE_BRIDGE__ = state;

  // Agora que getItem/setItem já enxergam o cache virtual, podemos retirar as
  // cópias gigantes da cota de ~5 MiB sem nenhuma janela de perda de dados.
  for (const [key, value] of physicalEntries) {
    try {
      await put(database, key, value);
      nativeRemoveItem.call(storage, key);
    } catch (error) {
      console.error(`[Futbobo] Falha ao migrar ${key}; cópia local preservada.`, error);
    }
  }

  if (navigator.storage?.persist) {
    void navigator.storage.persist().catch(() => false);
  }

  return true;
}

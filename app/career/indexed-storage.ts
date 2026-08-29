const DB_NAME = "futbobo-storage";
const DB_VERSION = 1;
const CAREER_STORE = "career-slots";

let databasePromise: Promise<IDBDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function openDatabase() {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponível neste ambiente."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CAREER_STORE)) {
        database.createObjectStore(CAREER_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB bloqueado por outra aba do Futbobo."));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

export async function readCareerPayload(id: string) {
  const database = await openDatabase();
  return new Promise<string | null>((resolve, reject) => {
    const transaction = database.transaction(CAREER_STORE, "readonly");
    const request = transaction.objectStore(CAREER_STORE).get(id);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => reject(request.error ?? transaction.error ?? new Error("Falha ao ler save no IndexedDB."));
  });
}

function writeCareerPayloadNow(id: string, payload: string) {
  return openDatabase().then((database) => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CAREER_STORE, "readwrite");
    transaction.objectStore(CAREER_STORE).put(payload, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao gravar save no IndexedDB."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Gravação do save foi abortada."));
  }));
}

/**
 * Serializa escritas para impedir que um estado antigo termine depois de um
 * estado novo quando o React dispara várias persistências em sequência.
 */
export function writeCareerPayload(id: string, payload: string) {
  const operation = writeQueue
    .catch(() => undefined)
    .then(() => writeCareerPayloadNow(id, payload));
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function deleteCareerPayload(id: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CAREER_STORE, "readwrite");
    transaction.objectStore(CAREER_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao excluir save do IndexedDB."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Exclusão do save foi abortada."));
  });
}

export async function requestDurableCareerStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

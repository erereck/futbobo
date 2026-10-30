// app/bobonline/storage.ts (B3): leitura/escrita segura, com perfil de desenvolvimento.
//
// Tudo é localStorage físico: as chaves `futbobo:bobonline-*` não estão na lista
// da ponte IndexedDB da carreira (ela só casa chaves exatas e o prefixo
// `career-slot`), então passam direto. Toda chave do Bobonline passa por `bobKey`.
// Nada aqui importa @capacitor/core nem o resto do app (os testes em Node usam
// um window/localStorage falsos).

type CapacitorProbe = { Capacitor?: { isNativePlatform?: () => boolean } };

/** Só letras, números, "_" e "-": o perfil vira sufixo de chave. */
const PROFILE_PATTERN = /[^A-Za-z0-9_-]/g;
const PROFILE_MAX_CHARS = 16;

// Lido uma vez por página (por objeto window): se a tela trocar a URL depois
// (ex.: limpar ?sala=), o perfil não muda no meio da sessão.
let profileCache: { win: object; value: string | null } | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Perfil de teste (?perfil=A): simula aparelhos diferentes na mesma origem. Só vale quando
 * location.port !== "" E (hostname é 127.x.x.x OU "localhost") E não é o app nativo
 * (window.Capacitor?.isNativePlatform?.() !== true). O APK roda em https://localhost SEM porta,
 * então nunca liga ali. ".test" não vale (http em .test não é contexto seguro e o WebCrypto falha).
 */
export function devProfile(): string | null {
  if (typeof window === "undefined") return null;
  if (profileCache && profileCache.win === window) return profileCache.value;
  let value: string | null = null;
  try {
    const { hostname, port, search } = window.location;
    const loopback = hostname === "localhost" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
    const native = (window as unknown as CapacitorProbe).Capacitor?.isNativePlatform?.() === true;
    if (port !== "" && loopback && !native) {
      const raw = new URLSearchParams(search).get("perfil") ?? "";
      const clean = raw.trim().replace(PROFILE_PATTERN, "").slice(0, PROFILE_MAX_CHARS);
      value = clean || null;
    }
  } catch {
    value = null;
  }
  profileCache = { win: window, value };
  return value;
}

/** base + (perfil dev ? ":" + perfil : "") */
export function bobKey(base: string): string {
  const profile = devProfile();
  return profile ? `${base}:${profile}` : base;
}

/** try/catch, null em erro (chave ausente, JSON quebrado, storage bloqueado). */
export function readJson<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** false em cota/modo privado (ou sem storage). */
export function writeJson(key: string, value: unknown): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // Storage bloqueado: nada a remover.
  }
}

/** Para limpar checkpoints antigos. */
export function keysWithPrefix(prefix: string): string[] {
  const store = storage();
  if (!store) return [];
  const keys: string[] = [];
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys;
}

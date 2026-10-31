// Identidade do aparelho no Bobonline (§3.4): par ECDSA P-256, playerId derivado da chave pública,
// incarnation (contador de boot) e a sessão salva para voltar à sala depois de um reload.
//
// A chave privada fica num JWK no localStorage: serve para o modelo de ameaça (outros membros da
// sala, um relay que forja quadros), não para roubo do aparelho. Só quem tem a chave assina um
// hello por aquele playerId, e todo anfitrião conhece a `pub` de cada membro pelo snapshot.

import { bobKey, readJson, removeKey, writeJson } from "../storage";
import { SAVED_SESSION_KEY, SAVED_SESSION_TTL_MS } from "./session-peek";

export { extractRoomCode, formatRoomCode, isValidRoomCode, makeRoomCode, passwordProof, roomLink, shareText } from "./codes";

export type Identity = { playerId: string; pub: string; sign(data: string): Promise<string> };
export type SavedSession = { code: string; password?: string; isHost: boolean; epoch: number; savedAt: number };

type StoredIdentity = { v: 1; playerId: string; pub: string; privJwk: JsonWebKey };

const IDENTITY_KEY = "futbobo:bobonline-identity:v1";
const BOOT_KEY = "futbobo:bobonline-boot:v1";
const KEY_ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_ALGORITHM = { name: "ECDSA", hash: "SHA-256" } as const;
/** base32 Crockford minúsculo (sem i l o u). */
const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";
const PLAYER_ID_CHARS = 10; // 50 bits

// ---------------------------------------------------------------------------
// Rastreio do trabalho assíncrono de cripto. Os testes com relógio virtual esperam
// isto zerar antes de andar o relógio (WebCrypto no Node resolve fora das microtarefas).
// ---------------------------------------------------------------------------

let cryptoBusy = 0;

export function trackCrypto<T>(work: Promise<T>): Promise<T> {
  cryptoBusy += 1;
  return work.finally(() => {
    cryptoBusy -= 1;
  });
}

/** Operações de cripto ainda em andamento (sessão: assinar, verificar, derivar playerId). */
export function cryptoInFlight(): number {
  return cryptoBusy;
}

export function cryptoAvailable(): boolean {
  return !!globalThis.crypto?.subtle;
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error("WebCrypto indisponível");
  return api;
}

const textEncoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// ---------------------------------------------------------------------------
// playerId e verificação
// ---------------------------------------------------------------------------

const playerIdCache = new Map<string, Promise<string>>();
const verifyKeyCache = new Map<string, Promise<CryptoKey>>();

/** base32 Crockford minúsculo dos 50 primeiros bits de SHA-256(pub raw). 10 caracteres. */
export function playerIdFor(pub: string): Promise<string> {
  let cached = playerIdCache.get(pub);
  if (!cached) {
    cached = (async () => {
      const digest = new Uint8Array(await subtle().digest("SHA-256", fromBase64Url(pub)));
      let id = "";
      for (let index = 0; index < PLAYER_ID_CHARS; index += 1) {
        const bit = index * 5;
        const byte = bit >> 3;
        const window = ((digest[byte] << 8) | digest[byte + 1]) >> (11 - (bit & 7));
        id += CROCKFORD[window & 31];
      }
      return id;
    })();
    if (playerIdCache.size > 256) playerIdCache.clear();
    playerIdCache.set(pub, cached);
    cached.catch(() => playerIdCache.delete(pub));
  }
  return cached;
}

function verifyKey(pub: string): Promise<CryptoKey> {
  let cached = verifyKeyCache.get(pub);
  if (!cached) {
    cached = subtle().importKey("raw", fromBase64Url(pub), KEY_ALGORITHM, false, ["verify"]);
    if (verifyKeyCache.size > 256) verifyKeyCache.clear();
    verifyKeyCache.set(pub, cached);
    cached.catch(() => verifyKeyCache.delete(pub));
  }
  return cached;
}

/** Confere uma assinatura ECDSA P-256 (base64url, formato P1363). Nunca lança: erro = false. */
export async function verifySig(pub: string, data: string, sig: string): Promise<boolean> {
  try {
    const key = await verifyKey(pub);
    return await subtle().verify(SIGN_ALGORITHM, key, fromBase64Url(sig), textEncoder.encode(data));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Identidade
// ---------------------------------------------------------------------------

function isStoredIdentity(value: unknown): value is StoredIdentity {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<StoredIdentity>;
  return stored.v === 1 && typeof stored.playerId === "string" && typeof stored.pub === "string"
    && !!stored.privJwk && typeof stored.privJwk === "object";
}

async function identityFrom(stored: StoredIdentity): Promise<Identity> {
  const key = await subtle().importKey("jwk", stored.privJwk, KEY_ALGORITHM, false, ["sign"]);
  return {
    playerId: stored.playerId,
    pub: stored.pub,
    async sign(data: string) {
      const signature = await subtle().sign(SIGN_ALGORITHM, key, textEncoder.encode(data));
      return toBase64Url(new Uint8Array(signature));
    },
  };
}

async function generateStored(): Promise<StoredIdentity> {
  const pair = await subtle().generateKey(KEY_ALGORITHM, true, ["sign", "verify"]);
  const pub = toBase64Url(new Uint8Array(await subtle().exportKey("raw", pair.publicKey)));
  const privJwk = await subtle().exportKey("jwk", pair.privateKey);
  return { v: 1, playerId: await playerIdFor(pub), pub, privJwk };
}

/** Identidade nova que não é salva (testes e ferramentas). */
export async function createIdentity(): Promise<Identity> {
  return identityFrom(await generateStored());
}

const loading = new Map<string, Promise<Identity>>();

/** Cria uma vez: par ECDSA P-256 extraível; guarda { playerId, pub, privJwk }. */
export function loadIdentity(): Promise<Identity> {
  const key = bobKey(IDENTITY_KEY);
  let pending = loading.get(key);
  if (!pending) {
    pending = (async () => {
      const stored = readJson<unknown>(key);
      if (isStoredIdentity(stored)) {
        try {
          // O playerId é sempre derivado da pub: um save mexido à mão não cria outro jogador.
          const playerId = await playerIdFor(stored.pub);
          return await identityFrom({ ...stored, playerId });
        } catch {
          // Chave corrompida: gera outra (o aparelho vira um jogador novo).
        }
      }
      const fresh = await generateStored();
      writeJson(key, fresh);
      return identityFrom(fresh);
    })();
    loading.set(key, pending);
    pending.catch(() => loading.delete(key));
  }
  return pending;
}

/** Lê e grava futbobo:bobonline-boot:v1 + 1 (sem storage: Date.now()). Estritamente crescente por aparelho. */
export function nextIncarnation(): number {
  const key = bobKey(BOOT_KEY);
  const previous = readJson<unknown>(key);
  const base = typeof previous === "number" && Number.isFinite(previous) && previous >= 0 ? Math.floor(previous) : 0;
  const next = base + 1;
  if (writeJson(key, next)) return next;
  // Sem gravar, o próximo boot leria o mesmo número: o relógio de parede mantém a ordem.
  return Math.max(next, Date.now());
}

// ---------------------------------------------------------------------------
// Sessão salva (volta à sala depois de reload ou do app morto), validade de 30 min
// ---------------------------------------------------------------------------

export function saveSession(session: SavedSession): void {
  writeJson(bobKey(SAVED_SESSION_KEY), session);
}

export function loadSession(now: number = Date.now()): SavedSession | null {
  const saved = readJson<Partial<SavedSession>>(bobKey(SAVED_SESSION_KEY));
  if (!saved || typeof saved !== "object") return null;
  const valid = typeof saved.code === "string" && /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(saved.code)
    && typeof saved.isHost === "boolean" && typeof saved.epoch === "number" && Number.isFinite(saved.epoch)
    && typeof saved.savedAt === "number" && Number.isFinite(saved.savedAt)
    && (saved.password === undefined || typeof saved.password === "string");
  if (!valid || now - (saved.savedAt as number) > SAVED_SESSION_TTL_MS) {
    clearSession();
    return null;
  }
  return saved as SavedSession;
}

export function clearSession(): void {
  removeKey(bobKey(SAVED_SESSION_KEY));
}

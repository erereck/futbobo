// Espiada na sessão salva do Bobonline, para o cartão "Voltar para a sala" da home do shell (§1.10).
//
// Só importa storage.ts: o shell não pode puxar a rede nem o protocolo para o bundle da home.
// A chave e a validade são as mesmas de net/identity.ts (que importa as constantes daqui).

import { bobKey, readJson } from "../storage";

export const SAVED_SESSION_KEY = "futbobo:bobonline-session:v1";
/** Validade da sessão salva: igual a T.SESSION_TTL_MS (30 min); o teste confere. */
export const SAVED_SESSION_TTL_MS = 30 * 60_000;

// O mesmo alfabeto de ROOM_CODE_ALPHABET (sem 0 1 I L O), repetido para não importar protocol.ts.
const ROOM_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/** Sessão salva e ainda válida, ou null. Não apaga nada (quem limpa é net/identity.ts). */
export function peekBobonlineSession(now: number = Date.now()): { code: string; savedAt: number } | null {
  const saved = readJson<{ code?: unknown; savedAt?: unknown }>(bobKey(SAVED_SESSION_KEY));
  if (!saved || typeof saved !== "object") return null;
  const { code, savedAt } = saved;
  if (typeof code !== "string" || !ROOM_CODE.test(code)) return null;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (now - savedAt > SAVED_SESSION_TTL_MS) return null;
  return { code, savedAt };
}

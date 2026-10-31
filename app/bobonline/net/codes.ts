// Código da sala, link de convite, texto para compartilhar e prova da senha (§3.4).
//
// O código tem 6 símbolos do ROOM_CODE_ALPHABET (31 símbolos, sem 0 1 I L O): 31^6 ≈ 887 milhões.
// A senha do Trystero é sempre o código (cifra o SDP nos relays públicos); a senha da SALA é do app.

import { BOB_PROTOCOL, ROOM_CODE_ALPHABET } from "../protocol";

export const ROOM_CODE_LENGTH = 6;

/** Separadores que a pessoa costuma digitar ou colar dentro do código ("K7M PX3", "k7m-px3", "K7M·PX3"). */
const SEPARATORS = new Set([" ", "-", "·", "."]);
/** Os mesmos, menos o espaço (passo 3 do extractRoomCode: palavra por palavra). */
const WORD_SEPARATORS = new Set(["-", "·", "."]);

/** 6 símbolos com crypto.getRandomValues e amostragem por rejeição (sem viés de módulo). */
export function makeRoomCode(): string {
  const size = ROOM_CODE_ALPHABET.length;
  const limit = Math.floor(256 / size) * size; // 248: bytes acima disso são descartados
  let code = "";
  const bytes = new Uint8Array(16);
  while (code.length < ROOM_CODE_LENGTH) {
    globalThis.crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      code += ROOM_CODE_ALPHABET[byte % size];
      if (code.length === ROOM_CODE_LENGTH) break;
    }
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  if (typeof code !== "string" || code.length !== ROOM_CODE_LENGTH) return false;
  for (const char of code) if (!ROOM_CODE_ALPHABET.includes(char)) return false;
  return true;
}

/**
 * Acha o código no que a pessoa colou:
 * 1. o link (`?sala=K7MPX3`);
 * 2. senão, em maiúsculas, corta o texto em todo caractere que não é do alfabeto nem separador
 *    (espaço, `-`, `·`, `.`), tira os separadores de cada pedaço e fica com o primeiro de 6 símbolos;
 * 3. senão, a última palavra (separada por espaço) que vira 6 símbolos: "Entra na sala K7MPX3" junta
 *    "A K7MPX3" no passo 2 (o espaço é separador), e o código costuma vir no fim da frase;
 * 4. senão, null.
 */
export function extractRoomCode(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const link = /sala=([A-Za-z0-9]{6})/.exec(raw);
  if (link) {
    const code = link[1].toUpperCase();
    return isValidRoomCode(code) ? code : null;
  }
  const upper = raw.toUpperCase();
  const found = codePieces(upper, SEPARATORS).find((candidate) => candidate.length === ROOM_CODE_LENGTH);
  if (found) return found;
  const words = codePieces(upper, WORD_SEPARATORS).filter((candidate) => candidate.length === ROOM_CODE_LENGTH);
  return words.length ? words[words.length - 1] : null;
}

/** Corta em todo caractere fora do alfabeto que não é separador; tira os separadores de cada pedaço. */
function codePieces(text: string, separators: ReadonlySet<string>): string[] {
  let piece = "";
  const pieces: string[] = [];
  for (const char of text) {
    if (ROOM_CODE_ALPHABET.includes(char)) piece += char;
    else if (!separators.has(char)) {
      pieces.push(piece);
      piece = "";
    }
  }
  pieces.push(piece);
  return pieces;
}

/** "K7MPX3" → "K7M·PX3". */
export function formatRoomCode(code: string): string {
  return code.length === ROOM_CODE_LENGTH ? `${code.slice(0, 3)}·${code.slice(3)}` : code;
}

/** playerId (identity.ts): 10 símbolos do base32 Crockford em minúsculas. */
const PLAYER_ID = /^[0-9a-hjkmnp-tv-z]{10}$/;

export function isPlayerIdLike(value: unknown): value is string {
  return typeof value === "string" && PLAYER_ID.test(value);
}

/**
 * Link absoluto (nunca a partir de location.href, que no APK é https://localhost). Com `hostId`, o id do
 * anfitrião vai junto (&h=): procurando a sala, quem entra só aceita as boas-vindas e a recusa dele.
 */
export function roomLink(code: string, hostId?: string | null): string {
  const host = isPlayerIdLike(hostId) ? `&h=${hostId}` : "";
  return `https://futbobo.top/bobonline/?sala=${code}&p=${BOB_PROTOCOL}${host}`;
}

export function shareText(code: string, hostId?: string | null): string {
  return `Bora jogar botão no Futbobo? Entra na minha sala: ${roomLink(code, hostId)}\nNo app: Jogar → Bobonline → Entrar na sala → ${formatRoomCode(code)}`;
}

/** O id do anfitrião (`&h=`) de um link colado ou dos parâmetros do endereço; a caixa não importa (o campo do código põe tudo em maiúsculas). */
export function extractLinkHost(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const found = /[?&]h=([0-9a-z]{10})(?![0-9a-z])/i.exec(raw);
  const host = found ? found[1].toLowerCase() : null;
  return isPlayerIdLike(host) ? host : null;
}

/** SHA-256 em hex de `senha:${password}:${code}` (o convidado manda no room:join; o anfitrião compara). */
export async function passwordProof(password: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`senha:${password}:${code}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

// Código de exportação do time: leva o time para outro aparelho (web ↔ APK ↔ itch).
//
// Formato: "BOB1-" + base64url(deflate-raw(json)) + "-" + fnv8(json).
// Sem CompressionStream (ou sem "deflate-raw"): "BOB0-" + base64url(json) + "-" + fnv8(json).
// O JSON leva o time sem id e sem datas: importar é fazer uma cópia (id novo, createdAt = agora).

import { BOB_TEAM_VERSION, type BobTeam } from "../types";
import { fnv8, LIMITS, sanitizeTeam } from "./model";
import { newTeamId } from "./generator";

/** Maior código aceito na importação (um típico tem ~1,2 KB). */
export const MAX_TEAM_CODE_CHARS = 12000;
/** Teto do JSON inflado, em bytes: o time saneado tem até 6000 caracteres e cada um ocupa até 3 bytes em UTF-8. */
export const MAX_TEAM_JSON_BYTES = LIMITS.teamJsonChars * 4;
/** Quantos "-" + 8 hex a importação testa como checksum antes de desistir. */
export const MAX_CHECKSUM_TRIES = 8;
/** O inflador recebe o código em fatias: cada passo produz pouco (deflate infla até ~1000×) e o teto corta cedo. */
const INFLATE_SLICE = 512;

export type TeamCodeResult = { ok: true; team: BobTeam } | { ok: false; reason: "invalido" | "versao" };

const INVALID: TeamCodeResult = { ok: false, reason: "invalido" };
const NEWER: TeamCodeResult = { ok: false, reason: "versao" };
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CHECKSUM = /^[0-9a-f]{8}$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

async function pipeBytes(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const output = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/** O que viaja no código: o time saneado sem id nem datas. */
function codePayload(team: BobTeam) {
  const clean = sanitizeTeam(team) ?? team;
  return {
    version: clean.version,
    name: clean.name,
    shortName: clean.shortName,
    abbr: clean.abbr,
    primary: clean.primary,
    secondary: clean.secondary,
    kitPattern: clean.kitPattern,
    crest: clean.crest,
    players: clean.players,
  };
}

export async function exportTeamCode(team: BobTeam): Promise<string> {
  const json = JSON.stringify(codePayload(team));
  const checksum = fnv8(json);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === "function") {
    try {
      const packed = await pipeBytes(bytes, new CompressionStream("deflate-raw"));
      return `BOB1-${toBase64Url(packed)}-${checksum}`;
    } catch {
      // Navegador sem "deflate-raw": cai no formato sem compressão.
    }
  }
  return `BOB0-${toBase64Url(bytes)}-${checksum}`;
}

/**
 * Infla com teto: lê a saída aos pedaços e desiste (cancelando o fluxo) quando
 * ela passa de `MAX_TEAM_JSON_BYTES`. Um código colado com "bomba" de deflate
 * não segura a tela inflando megabytes.
 */
async function inflateCapped(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  let offset = 0;
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + INFLATE_SLICE));
      offset += INFLATE_SLICE;
    },
  });
  const reader = source.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_TEAM_JSON_BYTES) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    output.set(chunk, at);
    at += chunk.byteLength;
  }
  return output;
}

async function decodePayload(format: number, payload: string): Promise<string | null> {
  const bytes = fromBase64Url(payload);
  if (!bytes) return null;
  try {
    if (format === 0) return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (typeof DecompressionStream !== "function") return null;
    const unpacked = await inflateCapped(bytes);
    return unpacked && new TextDecoder("utf-8", { fatal: true }).decode(unpacked);
  } catch {
    return null;
  }
}

/**
 * Aceita o código com espaços e quebras de linha no meio (mensageiros quebram
 * linha) e até com texto em volta. Confere prefixo, checksum e versão, roda
 * `sanitizeTeam` e devolve uma CÓPIA: id novo e createdAt = agora.
 */
export async function importTeamCode(code: string, copy: { id?: string; now?: number } = {}): Promise<TeamCodeResult> {
  if (typeof code !== "string") return INVALID;
  const compact = code.replace(/\s+/g, "");
  if (!compact || compact.length > MAX_TEAM_CODE_CHARS + 64) return INVALID;
  const prefix = /BOB(\d+)-/.exec(compact);
  if (!prefix) return INVALID;
  const format = Number(prefix[1]);
  if (format > 1) return NEWER;
  const body = compact.slice(prefix.index + prefix[0].length);
  if (body.length > MAX_TEAM_CODE_CHARS) return INVALID;
  // O base64url também tem "-": testa os "-" seguidos de 8 hex até o checksum bater, mas só os
  // primeiros MAX_CHECKSUM_TRIES e só enquanto o trecho antes do "-" ainda é base64url (o texto
  // em volta, que vem colado depois do checksum, encerra a busca).
  const firstBad = body.search(/[^A-Za-z0-9_-]/);
  const payloadEnd = firstBad < 0 ? body.length : firstBad;
  let json: string | null = null;
  let tries = 0;
  for (let cut = body.indexOf("-"); cut > 0 && cut <= payloadEnd && json === null && tries < MAX_CHECKSUM_TRIES; cut = body.indexOf("-", cut + 1)) {
    const checksum = body.slice(cut + 1, cut + 9);
    if (!CHECKSUM.test(checksum) || cut % 4 === 1) continue;
    tries += 1;
    const text = await decodePayload(format, body.slice(0, cut));
    if (text !== null && fnv8(text) === checksum) json = text;
  }
  if (json === null) return INVALID;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return INVALID;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return INVALID;
  const version = (parsed as { version?: unknown }).version;
  if (typeof version === "number" && version > BOB_TEAM_VERSION) return NEWER;
  const now = copy.now ?? Date.now();
  const team = sanitizeTeam({ ...parsed, id: copy.id ?? newTeamId(), createdAt: now, updatedAt: now });
  return team ? { ok: true, team } : INVALID;
}

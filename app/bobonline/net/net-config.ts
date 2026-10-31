// Configuração de rede do Bobonline (§3.5): relays Nostr fixos, TURN e a versão que está no ar.
//
// O arquivo publicado (public/bobonline/net.json → https://futbobo.top/bobonline/net.json) deixa
// trocar relays e TURN sem lançar APK novo. A cópia embutida (DEFAULT_NET_CONFIG) é IGUAL ao
// arquivo publicado (sem `notice`); o teste confere. Regra de release: subir APP_ID exige subir
// BOB_PROTOCOL, minProtocol e latestProtocol no mesmo release.

import { TURN_SERVERS, type TurnServer } from "../protocol";
import { bobKey, readJson, writeJson } from "../storage";

export type NetConfig = {
  version: 1;
  nostrRelays?: string[];        // lista fixa; ausente = Trystero escolhe `redundancy` dos padrões
  redundancy?: number;
  turn?: TurnServer[];           // anexado ao STUN padrão
  iceServers?: RTCIceServer[];   // substitui tudo (só se o usuário quiser controle total)
  minProtocol?: number;          // maior que BOB_PROTOCOL => "atualize o Futbobo" antes de tentar
  latestProtocol?: number;       // protocolo mais novo publicado (explica uma busca que não acha a sala)
  current?: { protocol: number; engineRev: number; celebrations: number }; // o que ESTE deploy roda (reloadSafe)
  notice?: string;               // aviso opcional na home (ex.: manutenção)
};

export const NET_CONFIG_URL = "https://futbobo.top/bobonline/net.json"; // sempre absoluta para a config (itch e APK também)
const NET_CONFIG_KEY = "futbobo:bobonline-netcfg:v1";
const FETCH_TIMEOUT_MS = 2500;

/**
 * Embutida, igual ao arquivo publicado (sem notice). Relays medidos de novo em 2026-10-30
 * (ida e volta de um evento efêmero no formato do Trystero): cdn.satellite.earth passou a pedir
 * AUTH e falhar, então saiu para nostr.red5d.dev. `current` repete BOB_PROTOCOL,
 * BOTAO_ENGINE_REV e CELEBRATION_OPTIONS.length como literais para este arquivo não puxar o
 * motor; o teste confere com as constantes.
 */
export const DEFAULT_NET_CONFIG: NetConfig = {
  version: 1,
  nostrRelays: [
    "wss://nos.lol",
    "wss://relay.nostr.dev.br",
    "wss://nostr.red5d.dev",
    "wss://nostr.rblb.it",
    "wss://relay.layer.systems",
    "wss://relay.agentry.com",
    "wss://relay.piazza.today",
    "wss://0x-nostr-relay.fly.dev",
  ],
  ...(TURN_SERVERS.length
    ? { turn: TURN_SERVERS.map((server) => ({ ...server, urls: Array.isArray(server.urls) ? [...server.urls] : server.urls })) }
    : {}),
  latestProtocol: 1,
  current: { protocol: 1, engineRev: 1, celebrations: 18 },
};

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

function cleanUrls(value: unknown, pattern: RegExp): string | string[] | null {
  if (typeof value === "string") return pattern.test(value) ? value : null;
  if (!Array.isArray(value)) return null;
  const urls = value.filter((url): url is string => typeof url === "string" && pattern.test(url));
  return urls.length ? urls : null;
}

function cleanServers(value: unknown, pattern: RegExp): Array<{ urls: string | string[]; username?: string; credential?: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const servers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const urls = cleanUrls(raw.urls, pattern);
    if (!urls) continue;
    servers.push({
      urls,
      ...(typeof raw.username === "string" ? { username: raw.username } : {}),
      ...(typeof raw.credential === "string" ? { credential: raw.credential } : {}),
    });
  }
  return servers.length ? servers : undefined;
}

/** Valida e limpa um net.json (qualquer campo estranho some). `null` se não for a versão 1. */
export function sanitizeNetConfig(raw: unknown): NetConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (input.version !== 1) return null;
  const config: NetConfig = { version: 1 };
  if (Array.isArray(input.nostrRelays)) {
    const relays = input.nostrRelays.filter((url): url is string => typeof url === "string" && /^wss:\/\/[^\s]+$/.test(url));
    if (relays.length) config.nostrRelays = relays.slice(0, 16);
  }
  if (isInt(input.redundancy, 1, 16)) config.redundancy = input.redundancy;
  const turn = cleanServers(input.turn, /^turns?:[^\s]+$/);
  if (turn) config.turn = turn;
  const ice = cleanServers(input.iceServers, /^(stun|turns?):[^\s]+$/);
  if (ice) config.iceServers = ice;
  if (isInt(input.minProtocol, 0, 1_000_000)) config.minProtocol = input.minProtocol;
  if (isInt(input.latestProtocol, 0, 1_000_000)) config.latestProtocol = input.latestProtocol;
  const current = input.current as Record<string, unknown> | undefined;
  if (current && typeof current === "object"
    && isInt(current.protocol, 0, 1_000_000) && isInt(current.engineRev, 0, 1_000_000) && isInt(current.celebrations, 0, 1_000_000)) {
    config.current = { protocol: current.protocol, engineRev: current.engineRev, celebrations: current.celebrations };
  }
  if (typeof input.notice === "string" && input.notice.trim()) config.notice = input.notice.trim().slice(0, 240);
  return config;
}

let loaded: Promise<NetConfig> | null = null;

type LoadOptions = { fetch?: typeof fetch; url?: string; timeoutMs?: number; fresh?: boolean };

/**
 * fetch no-cache com timeout 2,5 s → cache local → DEFAULT. O resultado vale para a página
 * inteira: uma configuração de relays só por sessão do app (Trystero issue #207).
 * `fresh` (testes) ignora o resultado guardado.
 */
export function loadNetConfig(options: LoadOptions = {}): Promise<NetConfig> {
  if (loaded && !options.fresh) return loaded;
  const pending = fetchNetConfig(options);
  if (!options.fresh) loaded = pending;
  return pending;
}

async function fetchNetConfig(options: LoadOptions): Promise<NetConfig> {
  const key = bobKey(NET_CONFIG_KEY);
  const doFetch = options.fetch ?? (typeof fetch === "function" ? fetch : null);
  if (doFetch) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);
    try {
      const response = await doFetch(options.url ?? NET_CONFIG_URL, { cache: "no-cache", signal: controller?.signal });
      if (response.ok) {
        const config = sanitizeNetConfig(await response.json());
        if (config) {
          writeJson(key, config);
          return config;
        }
      }
    } catch {
      // Offline, timeout ou JSON quebrado: cai para o cache.
    } finally {
      clearTimeout(timer);
    }
  }
  return sanitizeNetConfig(readJson<unknown>(key)) ?? DEFAULT_NET_CONFIG;
}

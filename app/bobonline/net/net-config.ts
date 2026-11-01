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
 * Embutida, igual ao arquivo publicado (sem notice). Relays medidos de novo em 2026-11-01 (4 rodadas
 * de ida e volta de um evento efêmero no formato do Trystero, mais uma rajada de 12 eventos, que é o
 * que um aperto de mão manda por relay em ~5 s): relay.layer.systems saiu (limita o IP depois de ~7
 * eventos e depois bane por 40+ min com HTTP 429, e num CGNAT o IP é de muita gente); entraram
 * relay.ditto.pub, relay.grigic.org, nostr-pub.wellorder.net e relay.primal.net (4/4 rodadas, 12/12 na
 * rajada, sem AUTH, operadores e hospedagens diferentes). Em 2026-10-30 cdn.satellite.earth já tinha
 * saído (passou a pedir AUTH). Ficar de olho: nostr.red5d.dev atrasou a escrita para 10,7 s sem erro.
 * `current` repete BOB_PROTOCOL, BOTAO_ENGINE_REV e CELEBRATION_OPTIONS.length como literais para
 * este arquivo não puxar o motor; o teste confere com as constantes.
 */
export const DEFAULT_NET_CONFIG: NetConfig = {
  version: 1,
  nostrRelays: [
    "wss://nos.lol",
    "wss://relay.nostr.dev.br",
    "wss://nostr.red5d.dev",
    "wss://nostr.rblb.it",
    "wss://relay.agentry.com",
    "wss://relay.piazza.today",
    "wss://0x-nostr-relay.fly.dev",
    "wss://relay.ditto.pub",
    "wss://relay.grigic.org",
    "wss://nostr-pub.wellorder.net",
    "wss://relay.primal.net",
  ],
  ...(TURN_SERVERS.length
    ? { turn: TURN_SERVERS.map((server) => ({ ...server, urls: Array.isArray(server.urls) ? [...server.urls] : server.urls })) }
    : {}),
  latestProtocol: 1,
  current: { protocol: 1, engineRev: 2, celebrations: 18 },
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

/** Busca mais velha que isto: a próxima sala busca de novo (TURN trocado chega às abas que vivem dias). */
const REFETCH_AFTER_MS = 60_000;
/** Desvio de relógio menor que isto não vale a correção (o Date do HTTP tem resolução de 1 s). */
export const CLOCK_FIX_MIN_MS = 3000;
/**
 * O relógio de parede andou isto contra o monotônico desde a medida: a pessoa acertou a hora (ou o
 * aparelho dormiu; no Android o monotônico para no sono profundo). Só serve para medir de novo, nunca
 * para corrigir o desvio direto (o sono daria um "pulo" que não é do relógio).
 */
const WALL_JUMP_MS = 2000;

/** De onde veio a configuração em uso: do servidor agora, do cache local ou a embutida. */
export type NetConfigSource = "rede" | "cache" | "padrão";

let clockOffset: number | null = null;
/** Date.now() − monotônico na hora da medida do desvio (null: nunca medido). */
let wallBase: number | null = null;
let lastSource: NetConfigSource | null = null;
let loaded: Promise<NetConfig> | null = null;
let loadedAt = 0;
/** Relays da primeira configuração da página: o Trystero só os lê no primeiro joinRoom (issue #207). */
let pinnedRelays: Pick<NetConfig, "nostrRelays" | "redundancy"> | null = null;

const monotonicNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** O relógio de parede pulou desde a última medida do desvio (ver WALL_JUMP_MS). */
function wallJumped(): boolean {
  return wallBase !== null && Math.abs(Date.now() - monotonicNow() - wallBase) > WALL_JUMP_MS;
}

/**
 * Um desvio que vale a correção está medido: a busca seguinte mede de novo em vez de usar a de 60 s
 * atrás. A tela pede "ative data e hora automáticas"; quem obedece volta com o relógio certo, e o
 * desvio velho jogaria os eventos para o passado (relays recusam, clientes antigos descartam).
 */
function clockSuspect(): boolean {
  return clockOffset !== null && Math.abs(clockOffset) >= CLOCK_FIX_MIN_MS;
}

/**
 * Desvio do relógio local (ms; + adiantado) a partir do cabeçalho Date de uma resposta: o meio do
 * pedido no relógio local contra Date + 500 ms (o Date tem resolução de 1 s, truncado). null sem
 * Date legível (o APK busca de outra origem e o servidor não expõe o cabeçalho ao CORS).
 */
export function clockOffsetFromDate(date: string | null | undefined, sentAt: number, receivedAt: number): number | null {
  if (!date) return null;
  const server = Date.parse(date);
  if (!Number.isFinite(server) || !Number.isFinite(sentAt) || !Number.isFinite(receivedAt) || receivedAt < sentAt) return null;
  return Math.round((sentAt + receivedAt) / 2 - (server + 500));
}

/**
 * Quanto o relógio deste aparelho está adiantado (+) ou atrasado (−) em ms, medido pelo cabeçalho
 * Date da última busca do net.json que trouxe um; null quando nunca deu para ler (APK, offline, cache).
 * A estratégia Nostr desconta isto da hora que põe nos eventos e no since.
 */
export function netClockOffsetMs(): number | null {
  return clockOffset;
}

/** Origem da última configuração carregada nesta página (diagnóstico); null antes da primeira. */
export function netConfigSource(): NetConfigSource | null {
  return lastSource;
}

type LoadOptions = { fetch?: typeof fetch; url?: string; timeoutMs?: number; fresh?: boolean };

/**
 * fetch no-cache com timeout 2,5 s → cache local → DEFAULT. Uma busca vale por REFETCH_AFTER_MS: a
 * sala criada ou buscada depois disso busca de novo, para um TURN trocado chegar à aba aberta há dias
 * (o TURN é lido a cada joinRoom). Uma busca nova que falha fica com a anterior desta página (melhor
 * que o cache). Os relays ficam presos aos da primeira configuração da página: o Trystero só os lê no
 * primeiro joinRoom (issue #207), e trocar a lista no meio só desalinharia o diagnóstico.
 * Com o relógio do aparelho errado (ou mexido desde a medida), toda chamada busca de novo: é o que
 * mede o relógio, e a pessoa pode tê-lo acertado agora há pouco.
 * `fresh` (testes) busca sem tocar no estado da página.
 */
export function loadNetConfig(options: LoadOptions = {}): Promise<NetConfig> {
  if (options.fresh) return fetchNetConfig(options).then((result) => result.config);
  const at = monotonicNow();
  if (loaded && at - loadedAt < REFETCH_AFTER_MS && !clockSuspect() && !wallJumped()) return loaded;
  const previous = loaded;
  loadedAt = at;
  loaded = fetchNetConfig(options).then(({ config, source }) => {
    if (source !== "rede" && previous) return previous;
    lastSource = source;
    return pinRelays(config);
  });
  return loaded;
}

function pinRelays(config: NetConfig): NetConfig {
  if (!pinnedRelays) {
    pinnedRelays = { nostrRelays: config.nostrRelays, redundancy: config.redundancy };
    return config;
  }
  const next: NetConfig = { ...config };
  delete next.nostrRelays;
  delete next.redundancy;
  if (pinnedRelays.nostrRelays) next.nostrRelays = pinnedRelays.nostrRelays;
  if (pinnedRelays.redundancy !== undefined) next.redundancy = pinnedRelays.redundancy;
  return next;
}

/**
 * Configuração sem TURN (cache de antes do TURN existir, net.json mexido à mão) usa o embutido: sem
 * ele, dois celulares atrás de CGNAT simétrico não conectam nunca. Com `iceServers` (controle total)
 * fica como veio.
 */
function withTurnFallback(config: NetConfig): NetConfig {
  if (config.turn || config.iceServers || !DEFAULT_NET_CONFIG.turn) return config;
  return { ...config, turn: DEFAULT_NET_CONFIG.turn };
}

async function fetchNetConfig(options: LoadOptions): Promise<{ config: NetConfig; source: NetConfigSource }> {
  const key = bobKey(NET_CONFIG_KEY);
  const doFetch = options.fetch ?? (typeof fetch === "function" ? fetch : null);
  if (doFetch) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);
    try {
      const sentAt = Date.now();
      const response = await doFetch(options.url ?? NET_CONFIG_URL, { cache: "no-cache", signal: controller?.signal });
      const offset = clockOffsetFromDate(response.headers?.get?.("date"), sentAt, Date.now());
      // Sem Date legível (offline, timeout, APK de outra origem) fica a medida anterior: nada diz que o relógio mudou.
      if (offset !== null) {
        clockOffset = offset;
        wallBase = Date.now() - monotonicNow();
      }
      if (response.ok) {
        const config = sanitizeNetConfig(await response.json());
        if (config) {
          writeJson(key, config);
          return { config: withTurnFallback(config), source: "rede" };
        }
      }
    } catch {
      // Offline, timeout ou JSON quebrado: cai para o cache.
    } finally {
      clearTimeout(timer);
    }
  }
  const cached = sanitizeNetConfig(readJson<unknown>(key));
  return cached ? { config: withTurnFallback(cached), source: "cache" } : { config: DEFAULT_NET_CONFIG, source: "padrão" };
}

// "Testar conexão" do Bobonline: mede, deste aparelho, tudo de que uma partida online depende e
// monta um texto para o jogador mandar no WhatsApp quando não conecta.
//
// Tudo em paralelo, com teto de ~8 s e cancelável (AbortSignal: a folha fechou):
//   - versao: FUTBOBO_VERSION, protocolo online e revisão do motor (e se o net.json já anuncia outra);
//   - relays: um WebSocket curto próprio a cada relay configurado, um REQ no formato do Trystero num
//     tópico sem ninguém, espera o EOSE (4 s cada): "7 de 11 respondem";
//   - relogio: o desvio medido pelo Date do net.json (aviso acima de 30 s, falha acima de 10 min);
//   - nat: um RTCPeerConnection com dois STUN de empresas diferentes; a mesma porta pública nos dois
//     = NAT aberta, portas diferentes = simétrica (CGNAT de celular: só o servidor de apoio liga),
//     nenhum srflx = UDP bloqueado (r-research §5.6);
//   - apoio-udp / apoio-tcp: um RTCPeerConnection só-relay por transporte do TURN configurado; ok
//     quando aparece um candidato relay em 6 s; o icecandidateerror diz o porquê (701 inalcançável,
//     401 senha recusada);
//   - erro: o motivo técnico da última falha da sala, se houver.
// Nunca põe usuário/senha do TURN no relatório (só o host), e limpa os dois do texto do erro.
// Módulo leve de propósito (a folha o baixa com import()): só net-config, protocol e version.

import { FUTBOBO_VERSION } from "../../version";
import { BOB_PROTOCOL } from "../protocol";
import { DEFAULT_NET_CONFIG, loadNetConfig, netClockOffsetMs, netConfigSource, type NetConfig, type NetConfigSource } from "./net-config";

export type DiagId = "versao" | "relays" | "relogio" | "nat" | "apoio-udp" | "apoio-tcp" | "erro";
export type DiagStatus = "testando" | "ok" | "aviso" | "falha" | "pulado";
/** `label`: nome curto da linha ("Servidores de encontro"); `detail`: o resultado em uma frase ("7 de 11 respondem"). */
export type DiagCheck = { id: DiagId; status: DiagStatus; label: string; detail: string };
/**
 * - "bom": este aparelho conecta direto na maioria das redes;
 * - "apoio": a rede exige o servidor de apoio (CGNAT simétrico) e ele responde: conecta, com mais atraso;
 * - "sem-apoio": a rede exige o servidor de apoio e ele não responde daqui: só outra rede resolve;
 * - "sem-rede": nenhum servidor de encontro respondeu;
 * - "sem-webrtc": o navegador não tem WebRTC: só outro navegador resolve.
 */
export type DiagVerdict = "bom" | "apoio" | "sem-apoio" | "sem-rede" | "sem-webrtc";
export type DiagReport = {
  at: number;
  checks: DiagCheck[];
  verdict: DiagVerdict;
  headline: string;
  /** Hosts do servidor de apoio (TURN) testados, sem usuário nem senha. */
  turnHosts?: string[];
  /** Relays que não responderam (host). */
  relaysDown?: string[];
  /** De onde veio a configuração de rede usada. */
  source?: NetConfigSource | null;
  /** Aparelho e navegador, curto ("Android 14 · Chrome 141"). */
  device?: string;
};
export type DiagOptions = {
  signal?: AbortSignal;
  /** Motivo técnico da última falha da sala (RoomClientState.netError), se houver. */
  lastError?: string | null;
  /** Chamado a cada linha que muda (a tela mostra o progresso). */
  onProgress?: (checks: DiagCheck[]) => void;
};

/** O que o teste da NAT achou. "sem-webrtc": o navegador nem tem RTCPeerConnection. */
export type NatKind = "aberta" | "simetrica" | "bloqueado" | "sem-webrtc" | "desconhecido";
/** Os fatos que decidem o veredito (função pura: o teste cobre as regras). */
export type DiagFacts = { relaysOk: number; nat: NatKind; turnUdp: boolean; turnTcp: boolean };

/** Uma frase curta por veredito. */
export const DIAG_HEADLINES: Record<DiagVerdict, string> = {
  bom: "Conexão boa para jogar.",
  apoio: "Dá para jogar pelo servidor de apoio, com um pouco mais de atraso.",
  "sem-apoio": "Esta rede bloqueia o jogo online: tente outra (Wi-Fi ↔ dados móveis).",
  "sem-rede": "Nenhum servidor de encontro respondeu: confira a internet ou tente outra rede.",
  "sem-webrtc": "Este navegador não conecta o jogo: abra no Chrome.",
};

const LABELS: Record<DiagId, string> = {
  versao: "Versão",
  relays: "Servidores de encontro",
  relogio: "Relógio",
  nat: "Rede (NAT)",
  "apoio-udp": "Servidor de apoio (UDP)",
  "apoio-tcp": "Servidor de apoio (TCP)",
  erro: "Último erro",
};

/** Teto do teste inteiro; cada parte encolhe o próprio prazo para caber. */
const TOTAL_MS = 8000;
const RELAY_TIMEOUT_MS = 4000;
const NAT_TIMEOUT_MS = 5000;
/** Depois do primeiro srflx, espera tanto por um segundo (de porta diferente) antes de concluir. */
const NAT_SETTLE_MS = 1500;
const TURN_TIMEOUT_MS = 6000;
const CLOCK_WARN_MS = 30_000;
const CLOCK_FAIL_MS = 10 * 60_000;
/** Dois STUN de empresas diferentes: o mesmo servidor duas vezes não mostra NAT simétrica. */
const NAT_STUN: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }];

const monoNow = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

/**
 * Sem WebRTC: nenhuma rede ajuda (nem com zero relays), é trocar de navegador. Sem relay: sem rede. NAT
 * que exige o apoio: "apoio" se algum TURN responde, senão "sem-apoio". Senão "bom".
 */
export function diagVerdict(facts: DiagFacts): DiagVerdict {
  if (facts.nat === "sem-webrtc") return "sem-webrtc";
  if (facts.relaysOk <= 0) return "sem-rede";
  const needsApoio = facts.nat === "simetrica" || facts.nat === "bloqueado";
  if (!needsApoio) return "bom";
  return facts.turnUdp || facts.turnTcp ? "apoio" : "sem-apoio";
}

export type SrflxCandidate = { type?: string | null; protocol?: string | null; address?: string | null; port?: number | null };

/**
 * NAT pelos candidatos srflx UDP dos dois STUN: algum endereço público com portas diferentes =
 * simétrica (cada destino ganha uma porta: o par direto não fecha); um só, ou todos com a mesma
 * porta (o Chrome nem repete o candidato igual) = aberta; nenhum = UDP bloqueado.
 */
export function natFromCandidates(candidates: SrflxCandidate[]): NatKind {
  const ports = new Map<string, Set<number>>();
  for (const candidate of candidates) {
    if (candidate.type !== "srflx" || (candidate.protocol ?? "").toLowerCase() !== "udp") continue;
    if (!candidate.address || typeof candidate.port !== "number") continue;
    const set = ports.get(candidate.address) ?? new Set<number>();
    set.add(candidate.port);
    ports.set(candidate.address, set);
  }
  if (!ports.size) return "bloqueado";
  return [...ports.values()].some((set) => set.size > 1) ? "simetrica" : "aberta";
}

/** Lê tipo, protocolo, endereço e porta de um candidato (campos do RTCIceCandidate ou a linha SDP). */
export function parseCandidate(candidate: { candidate?: string; type?: string | null; protocol?: string | null; address?: string | null; port?: number | null }): SrflxCandidate {
  const parts = (candidate.candidate ?? "").trim().split(/\s+/);
  const typIndex = parts.indexOf("typ");
  const fromLine = {
    protocol: parts[2] ?? null,
    address: parts[4] ?? null,
    port: parts[5] !== undefined && /^\d+$/.test(parts[5]) ? Number(parts[5]) : null,
    type: typIndex >= 0 ? parts[typIndex + 1] ?? null : null,
  };
  return {
    type: candidate.type ?? fromLine.type,
    protocol: candidate.protocol ?? fromLine.protocol,
    address: candidate.address ?? fromLine.address,
    port: typeof candidate.port === "number" ? candidate.port : fromLine.port,
  };
}

type IceEntry = { urls: string | string[]; username?: string; credential?: string };

const urlsOf = (entry: IceEntry): string[] => (Array.isArray(entry.urls) ? entry.urls : [entry.urls]);

/** O TURN do config (turn e os turn: de iceServers), separado por transporte; turns: conta como TCP. */
export function turnServersFor(cfg: Pick<NetConfig, "turn" | "iceServers">, transport: "udp" | "tcp"): RTCIceServer[] {
  const entries = [...(cfg.turn ?? []), ...((cfg.iceServers ?? []) as IceEntry[])];
  const servers: RTCIceServer[] = [];
  for (const entry of entries) {
    const urls = urlsOf(entry).filter((url) => {
      const tcp = /[?&]transport=tcp\b/i.test(url);
      if (/^turns:/i.test(url)) return transport === "tcp";
      if (!/^turn:/i.test(url)) return false;
      return transport === "tcp" ? tcp : !tcp;
    });
    if (urls.length) servers.push({ urls, ...(entry.username ? { username: entry.username } : {}), ...(entry.credential ? { credential: entry.credential } : {}) });
  }
  return servers;
}

/** Só os hosts do TURN (sem usuário, senha, porta ou parâmetros). */
export function turnHostsOf(cfg: Pick<NetConfig, "turn" | "iceServers">): string[] {
  const hosts = new Set<string>();
  for (const server of [...turnServersFor(cfg, "udp"), ...turnServersFor(cfg, "tcp")]) {
    for (const url of urlsOf(server as IceEntry)) {
      const host = url.replace(/^turns?:/i, "").replace(/^[^@/]*@/, "").replace(/^\[([^\]]+)\].*$/, "$1").split(/[:?]/)[0];
      if (host) hosts.add(host);
    }
  }
  return [...hosts];
}

/** "Android 14 · Chrome 141", "iOS 18 · Safari 18", "app Android 14 · WebView 141". */
export function shortUserAgent(ua: string, nativeApp = false): string {
  const os = /Android (\d+)/.exec(ua)?.[1] !== undefined ? `Android ${/Android (\d+)/.exec(ua)?.[1]}`
    : /(?:iPhone|CPU) OS (\d+)/.exec(ua) ? `iOS ${/(?:iPhone|CPU) OS (\d+)/.exec(ua)?.[1]}`
    : /iPad/.test(ua) ? "iPadOS"
    : /Windows/.test(ua) ? "Windows"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux" : "";
  const version = (pattern: RegExp) => pattern.exec(ua)?.[1];
  const app = /FBAN|FBAV/.test(ua) ? " (no Facebook)" : /Instagram/.test(ua) ? " (no Instagram)" : "";
  const browser = version(/SamsungBrowser\/(\d+)/) ? `Samsung Internet ${version(/SamsungBrowser\/(\d+)/)}`
    : version(/EdgA?\/(\d+)/) ? `Edge ${version(/EdgA?\/(\d+)/)}`
    : version(/OPR\/(\d+)/) ? `Opera ${version(/OPR\/(\d+)/)}`
    : version(/(?:Firefox|FxiOS)\/(\d+)/) ? `Firefox ${version(/(?:Firefox|FxiOS)\/(\d+)/)}`
    : version(/CriOS\/(\d+)/) ? `Chrome ${version(/CriOS\/(\d+)/)}`
    : /; wv\)/.test(ua) && version(/Chrome\/(\d+)/) ? `WebView ${version(/Chrome\/(\d+)/)}`
    : version(/Chrome\/(\d+)/) ? `Chrome ${version(/Chrome\/(\d+)/)}`
    : version(/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/) ? `Safari ${version(/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/)}`
    : "";
  return [nativeApp ? `app ${os || "Android"}` : os, browser + app].filter(Boolean).join(" · ") || "navegador desconhecido";
}

/** "5 s", "3 min", "2 h", "4 dias". */
function amount(ms: number): string {
  const seconds = Math.round(Math.abs(ms) / 1000);
  if (seconds < 90) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} dias`;
}

/** Linha do relógio a partir do desvio (+ adiantado). */
export function clockCheck(offsetMs: number | null): Pick<DiagCheck, "status" | "detail"> {
  if (offsetMs === null || !Number.isFinite(offsetMs)) return { status: "pulado", detail: "não deu para medir neste aparelho" };
  const abs = Math.abs(offsetMs);
  if (abs < 3000) return { status: "ok", detail: "certo" };
  const side = offsetMs > 0 ? "adiantado" : "atrasado";
  if (abs <= CLOCK_WARN_MS) return { status: "ok", detail: `${amount(offsetMs)} ${side}` };
  return { status: abs > CLOCK_FAIL_MS ? "falha" : "aviso", detail: `${amount(offsetMs)} ${side}: ative data e hora automáticas` };
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

/** Resultado de um TURN em uma frase. */
export function turnDetail(result: { ok: boolean; ms: number | null; error: number | null }): string {
  if (result.ok) return result.ms === null ? "responde" : `responde (${seconds(result.ms)})`;
  if (result.error === 401) return "senha recusada (401)";
  if (result.error === 701) return "não alcança o servidor (porta 3478 bloqueada?)";
  if (result.error !== null) return `não respondeu (erro ${result.error})`;
  return "não respondeu";
}

// ---------------------------------------------------------------------------
// Medidas (cada uma resolve sempre; null/falha no prazo ou no abort)
// ---------------------------------------------------------------------------

const randomId = (): string => Math.random().toString(36).slice(2, 12);
const kindOf = (topic: string): number => (topic.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 1e4) + 2e4;

/** Um relay: abre, manda o REQ (o mesmo formato e a mesma folga de since do jogo), espera o EOSE. ms ou null. */
function probeRelay(url: string, timeoutMs: number, signal: AbortSignal): Promise<number | null> {
  return new Promise((resolve) => {
    const started = monoNow();
    const sub = `bob-diag-${randomId()}`;
    const topic = `bob-diag/${sub}`;
    let socket: WebSocket | null = null;
    let done = false;
    const finish = (ms: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      try {
        if (socket?.readyState === 1) socket.send(JSON.stringify(["CLOSE", sub]));
        socket?.close();
      } catch {
        // Fechando de qualquer jeito.
      }
      resolve(ms);
    };
    const onAbort = () => finish(null);
    const timer = setTimeout(() => finish(null), Math.max(0, timeoutMs));
    signal.addEventListener("abort", onAbort);
    if (signal.aborted || typeof WebSocket !== "function") {
      finish(null);
      return;
    }
    try {
      socket = new WebSocket(url);
    } catch {
      finish(null);
      return;
    }
    const ws = socket;
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(["REQ", sub, { kinds: [kindOf(topic)], since: Math.floor(Date.now() / 1000) - 900, "#x": [topic] }]));
      } catch {
        finish(null);
      }
    };
    ws.onmessage = (event) => {
      try {
        const [type, id] = JSON.parse(String(event.data)) as [unknown, unknown];
        if (type === "EOSE" && id === sub) finish(Math.round(monoNow() - started));
      } catch {
        // Quadro estranho: não é a resposta.
      }
    };
    ws.onclose = () => finish(null);
  });
}

type PcFactory = (config: RTCConfiguration) => RTCPeerConnection;

const defaultPc: PcFactory = (config) => new RTCPeerConnection(config);

/** Junta candidatos de um RTCPeerConnection de teste (canal de dados só para ter o que negociar). */
function gather(
  config: RTCConfiguration,
  timeoutMs: number,
  signal: AbortSignal,
  onCandidate: (candidate: RTCIceCandidate, finish: () => void, arm: (ms: number) => void) => void,
  onError?: (code: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    let pc: RTCPeerConnection | null = null;
    let done = false;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (settle !== null) clearTimeout(settle);
      signal.removeEventListener("abort", finish);
      try {
        pc?.close();
      } catch {
        // Já fechado.
      }
      resolve();
    };
    const arm = (ms: number) => {
      if (settle === null) settle = setTimeout(finish, ms);
    };
    const timer = setTimeout(finish, Math.max(0, timeoutMs));
    signal.addEventListener("abort", finish);
    if (signal.aborted) return finish();
    try {
      pc = defaultPc(config);
    } catch {
      return finish();
    }
    const connection = pc;
    connection.onicecandidate = (event) => {
      if (done) return;
      if (!event.candidate) return finish(); // coleta terminou
      onCandidate(event.candidate, finish, arm);
    };
    connection.onicecandidateerror = (event) => {
      const code = (event as RTCPeerConnectionIceErrorEvent).errorCode;
      if (typeof code === "number") onError?.(code);
    };
    try {
      connection.createDataChannel("x");
      void connection.createOffer().then((offer) => connection.setLocalDescription(offer)).catch(finish);
    } catch {
      finish();
    }
  });
}

async function natCheck(timeoutMs: number, signal: AbortSignal): Promise<NatKind> {
  if (typeof RTCPeerConnection !== "function") return "sem-webrtc";
  const seen: SrflxCandidate[] = [];
  await gather({ iceServers: NAT_STUN }, timeoutMs, signal, (candidate, finish, arm) => {
    const parsed = parseCandidate(candidate);
    if (parsed.type !== "srflx") return;
    seen.push(parsed);
    if (natFromCandidates(seen) === "simetrica") finish();
    else arm(NAT_SETTLE_MS);
  });
  return signal.aborted ? "desconhecido" : natFromCandidates(seen);
}

async function turnCheck(servers: RTCIceServer[], timeoutMs: number, signal: AbortSignal): Promise<{ ok: boolean; ms: number | null; error: number | null }> {
  if (typeof RTCPeerConnection !== "function") return { ok: false, ms: null, error: null };
  const started = monoNow();
  let ok = false;
  let ms: number | null = null;
  let error: number | null = null;
  await gather({ iceServers: servers, iceTransportPolicy: "relay" }, timeoutMs, signal, (candidate, finish) => {
    if (parseCandidate(candidate).type !== "relay") return;
    ok = true;
    ms = Math.round(monoNow() - started);
    finish();
  }, (code) => {
    // 401 (senha) explica mais que 701 (que também aparece à toa na busca IPv6 de um host sem AAAA).
    if (error === null || code === 401) error = code;
  });
  return { ok, ms, error };
}

// ---------------------------------------------------------------------------
// O teste
// ---------------------------------------------------------------------------

const hostOf = (url: string): string => url.replace(/^wss?:\/\//, "").replace(/\/.*$/, "");

function abortError(): Error {
  return typeof DOMException === "function" ? new DOMException("Teste cancelado", "AbortError") : Object.assign(new Error("Teste cancelado"), { name: "AbortError" });
}

/** Tira usuário e senha do TURN de um texto (o motivo de erro vem de fora; por via das dúvidas). */
function scrub(text: string, cfg: NetConfig): string {
  let clean = text;
  for (const entry of [...(cfg.turn ?? []), ...((cfg.iceServers ?? []) as IceEntry[])]) {
    for (const secret of [entry.username, entry.credential]) {
      if (typeof secret === "string" && secret.length >= 4) clean = clean.split(secret).join("***");
    }
  }
  return clean;
}

function nativeApp(): boolean {
  try {
    const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export async function runDiagnostics(options: DiagOptions = {}): Promise<DiagReport> {
  const outer = options.signal;
  if (outer?.aborted) throw abortError();
  const inner = new AbortController();
  const stop = () => inner.abort();
  outer?.addEventListener("abort", stop);
  const signal = inner.signal;
  const deadline = monoNow() + TOTAL_MS;
  const budget = (ms: number) => Math.max(0, Math.min(ms, deadline - monoNow()));

  const checks: DiagCheck[] = (["versao", "relays", "relogio", "nat", "apoio-udp", "apoio-tcp"] as DiagId[])
    .map((id) => ({ id, status: "testando" as DiagStatus, label: LABELS[id], detail: "testando…" }));
  const lastError = options.lastError?.trim();
  if (lastError) checks.push({ id: "erro", status: "aviso", label: LABELS.erro, detail: scrub(lastError, DEFAULT_NET_CONFIG).slice(0, 160) });
  const set = (id: DiagId, status: DiagStatus, detail: string) => {
    const check = checks.find((entry) => entry.id === id);
    if (!check || signal.aborted) return;
    check.status = status;
    check.detail = detail;
    options.onProgress?.(checks);
  };
  options.onProgress?.(checks);

  try {
    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) reject(abortError());
      signal.addEventListener("abort", () => reject(abortError()), { once: true });
    });
    aborted.catch(() => undefined);
    const race = <T,>(promise: Promise<T>) => Promise.race([promise, aborted]);

    // A NAT não depende do net.json: começa já.
    const natP = natCheck(budget(NAT_TIMEOUT_MS), signal).then((nat) => {
      const detail = nat === "aberta" ? "aberta" : nat === "simetrica" ? "simétrica (precisa do servidor de apoio)"
        : nat === "bloqueado" ? "UDP bloqueado" : nat === "sem-webrtc" ? "este navegador não tem WebRTC" : "não deu para testar";
      set("nat", nat === "aberta" ? "ok" : nat === "sem-webrtc" ? "falha" : nat === "desconhecido" ? "pulado" : "aviso", detail);
      return nat;
    });

    const cfg = await race(loadNetConfig().catch(() => DEFAULT_NET_CONFIG));
    const source = netConfigSource();

    const engineRev = DEFAULT_NET_CONFIG.current?.engineRev ?? 0;
    const newer = (cfg.latestProtocol ?? 0) > BOB_PROTOCOL
      || (!!cfg.current && (cfg.current.protocol > BOB_PROTOCOL || cfg.current.engineRev > engineRev));
    set("versao", newer ? "aviso" : "ok", `${FUTBOBO_VERSION} · online ${BOB_PROTOCOL}.${engineRev}${newer ? " · há versão nova do Futbobo" : ""}`);
    const clock = clockCheck(netClockOffsetMs());
    set("relogio", clock.status, clock.detail);

    const relayUrls = cfg.nostrRelays ?? [];
    const relaysP = Promise.all(relayUrls.map((url) => probeRelay(url, budget(RELAY_TIMEOUT_MS), signal))).then((times) => {
      const ok = times.filter((ms) => ms !== null).length;
      const total = relayUrls.length;
      set("relays", ok === 0 ? "falha" : ok * 2 < total ? "aviso" : "ok", total ? `${ok} de ${total} respondem` : "nenhum configurado");
      return { ok, down: relayUrls.filter((_, index) => times[index] === null).map(hostOf) };
    });

    const turnRow = (id: "apoio-udp" | "apoio-tcp", transport: "udp" | "tcp") => {
      const servers = turnServersFor(cfg, transport);
      if (!servers.length) {
        set(id, "pulado", `sem servidor de apoio ${transport.toUpperCase()}`);
        return Promise.resolve(false);
      }
      // Sem WebRTC não há o que testar: "falha - não respondeu" culparia o servidor de apoio.
      if (typeof RTCPeerConnection !== "function") {
        set(id, "pulado", "este navegador não tem WebRTC");
        return Promise.resolve(false);
      }
      return turnCheck(servers, budget(TURN_TIMEOUT_MS), signal).then((result) => {
        set(id, result.ok ? "ok" : "falha", turnDetail(result));
        return result.ok;
      });
    };
    const udpP = turnRow("apoio-udp", "udp");
    const tcpP = turnRow("apoio-tcp", "tcp");

    const [relays, nat, turnUdp, turnTcp] = await race(Promise.all([relaysP, natP, udpP, tcpP]));

    if (lastError) set("erro", "aviso", scrub(scrub(lastError, DEFAULT_NET_CONFIG), cfg).slice(0, 160));
    const verdict = diagVerdict({ relaysOk: relays.ok, nat, turnUdp, turnTcp });
    let device = "";
    try {
      device = shortUserAgent(typeof navigator !== "undefined" ? navigator.userAgent ?? "" : "", nativeApp());
    } catch {
      device = "";
    }
    options.onProgress?.(checks);
    return {
      at: Date.now(),
      checks,
      verdict,
      headline: DIAG_HEADLINES[verdict],
      turnHosts: turnHostsOf(cfg),
      relaysDown: relays.down,
      source,
      device,
    };
  } finally {
    outer?.removeEventListener("abort", stop);
    inner.abort(); // solta o que ainda estiver aberto (sockets e conexões de teste)
  }
}

const STATUS_WORD: Record<DiagStatus, string> = { testando: "testando", ok: "ok", aviso: "atenção", falha: "falhou", pulado: "pulado" };
const two = (value: number) => String(value).padStart(2, "0");

/** Texto puro para copiar e mandar no WhatsApp (uma linha por item; nunca usuário/senha do TURN). */
export function diagnosticsText(report: DiagReport): string {
  const when = new Date(report.at);
  const stamp = `${two(when.getDate())}/${two(when.getMonth() + 1)}/${when.getFullYear()} ${two(when.getHours())}:${two(when.getMinutes())}`;
  const lines = [
    "Futbobo · teste de conexão",
    [stamp, report.device].filter(Boolean).join(" · "),
    `Resultado: ${report.headline || DIAG_HEADLINES[report.verdict]}`,
  ];
  for (const check of report.checks) {
    const down = check.id === "relays" && report.relaysDown?.length ? ` (sem resposta: ${report.relaysDown.join(", ")})` : "";
    lines.push(`- ${check.label} (${STATUS_WORD[check.status]}): ${check.detail}${down}`);
  }
  const tail = [
    report.turnHosts?.length ? `apoio: ${report.turnHosts.join(", ")}` : "",
    report.source ? `config: ${report.source}` : "",
  ].filter(Boolean);
  if (tail.length) lines.push(tail.join(" · "));
  return lines.join("\n");
}

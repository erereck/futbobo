// Estratégia Nostr do Trystero 0.26.0, vendorizada para o Bobonline.
//
// Origem: @trystero-p2p/nostr 0.26.0 (dist/index.mjs), do Trystero de Dan Motzenbecker
// (https://github.com/dmotz/trystero). Licença MIT, reproduzida abaixo como ela pede:
//
//   Copyright (c) 2021 Dan Motzenbecker
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software
//   and associated documentation files (the "Software"), to deal in the Software without
//   restriction, including without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
//   Software is furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all copies or
//   substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
//   BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
//   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
//   DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// O FIO É O MESMO do Trystero 0.26 sem patch (formato do evento, kinds, tag "x", assinatura Schnorr,
// cifra do SDP no core): um cliente antigo do futbobo.top e este se acham e jogam juntos. O que
// mudou é só o que cada aparelho faz com o que recebe e com os próprios sockets:
//   a. Relógio: now() desconta um desvio ajustável (setClockOffset, medido pelo Date do net.json),
//      em created_at e no since.
//   b. since = now() − 900 nos dois montadores de REQ: os relays aplicam o since também aos eventos
//      AO VIVO, então um celular com o relógio 20 s errado nunca ouvia o outro (r-sim §h: 12/12
//      falhas; com −900, 10/10 entram em 1,5–2,7 s). Aceita quem está até 15 min atrasado.
//   c. Portão pré-EOSE: 4 dos relays guardam eventos "efêmeros" por ≥ 75 s e os repetem a quem pede
//      com since no passado; uma oferta velha repetida trava ofertas novas por 23 s (r-trystero
//      §9.3). Enquanto uma assinatura espera o EOSE (repetição do guardado), evento mais velho que a
//      hora do REQ − 10 s cai. Depois do EOSE (ou 5 s sem ele, dados pelo vigia num passo em dia,
//      nunca pelo relógio na hora do quadro) tudo passa.
//   d. Socket próprio (cópia do makeSocket do core, que não dá para dirigir de fora): mesmo formato
//      {isClosed, ready, socket, url, send, close}, sinal de vida por socket, kick() que religa já
//      sem esperar o backoff (o chute periódico respeita o backoff) e uma pausa própria no lugar da
//      trava global do core (o wrapper passa manualReconnection: true, então o watchOnline do core
//      não briga com a nossa pausa).
//   e. Vida dos sockets: com sala aberta, socket ABERTO calado há 15 s leva uma sonda (REQ num
//      tópico sem ninguém, tratada aqui: EOSE/CLOSED dela nunca chegam ao tratamento de erro do
//      relay, que podia dar backoff ou aposentar o relay por causa dela); sem resposta em 5 s, o
//      socket é largado e outro é discado já (r-sim §i: 2/2 entram em 1,4–2,9 s; antes, 4/4 falhas).
//   f. Último evento de OUTRO aparelho entregue a um tópico (peerSignalAt do transporte).
//   g. relayHealth(): total, abertos e frescos (com resposta nos últimos 20 s).

import { schnorr } from "@noble/secp256k1";
import {
  createRelayManager,
  createTopicStrategy,
  fromJson,
  genId,
  getRelays,
  hashWith,
  libName,
  selfId,
  strToNum,
  toHex,
  toJson,
  type JoinRoomConfig,
} from "@trystero-p2p/core";

// ---------------------------------------------------------------------------
// Constantes (as do Trystero ficam com os valores originais)
// ---------------------------------------------------------------------------

const defaultRedundancy = 5;
const tag = "x";
const eventMsgType = "EVENT";
const maxTopicsPerSubscription = 250;
const steadyAnnounceIntervalMs = 6e4;
const maxRelayBackoffMs = 9e5;
const subscriptionRetryMs = 5333;
/** Backoff de reconexão de um socket: começa aqui, dobra até MAX_RETRY_MS, volta ao início ao abrir (core/utils). */
const DEFAULT_RETRY_MS = 3333;
const MAX_RETRY_MS = 6e4;

/** (b) Folga do since: aceita ao vivo quem está até 15 min atrasado (relays rejeitam efêmeros mais velhos que isso de todo jeito). */
export const SINCE_SLACK_S = 900;
/** (c) Antes do EOSE, só passa o que é mais novo que a hora do REQ menos isto. */
export const REPLAY_SLACK_S = 10;
/**
 * (c) Relay que nunca manda EOSE: depois disto da última REQ, o vigia o dá como recebido (num passo em
 * dia; ver settleOverdueGates). Nunca pelo tempo medido na hora do quadro: depois de congelar, a
 * repetição velha que ficou no buffer chega antes do EOSE com o "tempo" já vencido.
 */
export const IMPLIED_EOSE_MS = 5000;
/** (e) Socket aberto calado há tanto tempo leva sonda. */
export const SILENT_PROBE_MS = 15_000;
/** (e) Sem resposta nenhuma à sonda neste prazo: socket morto (OPEN de mentira), larga e disca outro. */
export const PROBE_TIMEOUT_MS = 5000;
/** (e) kick(): a sonda da volta ao primeiro plano tem prazo mais curto. */
export const KICK_PROBE_TIMEOUT_MS = 4000;
/** (g) Socket aberto com algo recebido há no máximo isto conta como fresco. */
export const FRESH_MS = 20_000;
/** kick(): socket ainda CONNECTING há tanto tempo (rede trocou no meio) é largado e discado de novo. */
const CONNECT_STALL_MS = 12_000;
/** Passo do vigia dos sockets. */
const LIVENESS_TICK_MS = 1000;
/**
 * O passo do vigia rodou com este atraso (página congelada, timer estrangulado em segundo plano):
 * as respostas podem estar na fila ainda, então a sonda vencida é reenviada em vez de julgada.
 */
const LATE_TICK_MS = 3000;

const OPEN = 1;
const CONNECTING = 0;
const CLOSING = 2;

/** Sonda: uma assinatura por página num tópico sem ninguém (o relay só responde EOSE). */
const PROBE_SUB = `bob-sonda-${Math.random().toString(36).slice(2, 10)}`;
const PROBE_TOPIC = `bob-sonda/${PROBE_SUB}`;

const monoNow = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

// ---------------------------------------------------------------------------
// Relógio do Nostr (a)
// ---------------------------------------------------------------------------

let clockOffsetMs = 0;

/** Quanto o relógio deste aparelho está adiantado (+) ou atrasado (−), em ms; o now() do Nostr desconta. */
export function setClockOffset(aheadMs: number): void {
  clockOffsetMs = Number.isFinite(aheadMs) ? aheadMs : 0;
}

const now = (): number => Math.floor((Date.now() - clockOffsetMs) / 1000);

// ---------------------------------------------------------------------------
// Portão pré-EOSE (c)
// ---------------------------------------------------------------------------

/**
 * Estado de uma assinatura: hora do último REQ (segundos corrigidos e ms monotônicos), EOSEs que faltam e
 * se um passo atrasado do vigia já viu o prazo do EOSE implícito vencido (o passo seguinte abre).
 */
export type ReplayGate = { subscribedAtSec: number; requestedAtMs: number; pendingEose: number; overdueSeen: boolean };

/**
 * O evento passa? Sem portão, ou com todos os EOSE recebidos (ou dados como recebidos pelo vigia): sim
 * (ao vivo, de qualquer relógio dentro do since). Antes disso, só o que é mais novo que o REQ − 10 s:
 * o resto é a repetição do que o relay guardou (ofertas e anúncios de minutos atrás).
 */
export function passesReplayGate(createdAt: unknown, gate: ReplayGate | undefined): boolean {
  if (!gate || gate.pendingEose <= 0) return true;
  return typeof createdAt === "number" && createdAt >= gate.subscribedAtSec - REPLAY_SLACK_S;
}

/**
 * (c) EOSE implícito, decidido pelo vigia: portão com o prazo vencido abre num passo em dia (a página
 * rodou normal desde o REQ, o relay é que não manda EOSE). Num passo atrasado (logo depois de congelar,
 * timer estrangulado) só marca: os quadros que ficaram no buffer passam antes pelo portão fechado (ou
 * pelo EOSE de verdade), e o passo seguinte abre. Estrangulado de vez, custa um passo a mais.
 */
export function settleOverdueGates(gates: Iterable<ReplayGate>, nowMs: number, late: boolean): void {
  for (const gate of gates) {
    if (gate.pendingEose <= 0 || nowMs - gate.requestedAtMs < IMPLIED_EOSE_MS) continue;
    if (!late || gate.overdueSeen) gate.pendingEose = 0;
    else gate.overdueSeen = true;
  }
}

// ---------------------------------------------------------------------------
// Sockets dos relays (d, e)
// ---------------------------------------------------------------------------

/** O cliente de um relay: o formato do SocketClient do core mais o que o vigia usa. */
export type RelayClient = {
  socket: WebSocket;
  url: string;
  ready: Promise<RelayClient>;
  isClosed: boolean;
  send: (data: string) => void;
  close: () => void;
  /** Último quadro recebido (ou a abertura) deste relay, relógio monotônico; null = nunca abriu. */
  lastInboundAt: number | null;
  /** Quando o socket atual começou a conectar. */
  connectingSince: number;
  /** Sonda em voo (quando saiu) e o prazo para qualquer resposta. */
  probeSentAt: number | null;
  probeDeadline: number;
  /**
   * Aberto: sonda já. CONNECTING travado: disca de novo. Fechado esperando o backoff: `force` (a rede ou
   * a página voltou) religa já com o backoff zerado; sem `force` (os chutes periódicos de quem segue sem
   * sinalização) só adianta a discagem quando já passou meio período desde a última, e o período segue
   * dobrando até MAX_RETRY_MS: chute a cada 10 s não vira uma discagem a cada 10 s por relay.
   */
  kick: (nowMs: number, force?: boolean) => void;
  /** Socket morto: larga o atual sem esperar o fechamento (o handshake de close de um TCP morto leva até 60 s) e disca outro. */
  redial: () => void;
};

/** Todos os clientes desta página (um por relay, para sempre: o core nunca troca o registrado). */
const clients = new Set<RelayClient>();
/**
 * Pausa própria (pauseRelayReconnection): socket que fecha nela espera o resume, como a trava do core.
 * Global da página, como a do core: o transporte que abre uma sala a acerta para o estado dele.
 */
let paused = false;
const waitingForResume = new Set<() => void>();

export function pauseRelayReconnection(): void {
  paused = true;
}

export function resumeRelayReconnection(): void {
  paused = false;
  const waiting = [...waitingForResume];
  waitingForResume.clear();
  for (const dial of waiting) dial();
}

/**
 * Cópia do makeSocket do core (utils.mjs) com o mesmo comportamento de reconexão (onclose → espera
 * random(0..período), período 3,3 s dobrando até 60 s, zerado ao abrir; onReconnect a cada reabertura)
 * e os ganchos do vigia. Usa `WebSocket` global na hora (os testes trocam por um falso).
 */
export function makeRelaySocket(url: string, onMessage: (data: string) => void, onReconnect?: () => void): RelayClient {
  let didOpen = false;
  let reconnectPending = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryPeriod = DEFAULT_RETRY_MS;
  let resolveReady: (client: RelayClient) => void = () => {};
  const client = {
    isClosed: false,
    lastInboundAt: null,
    connectingSince: monoNow(),
    probeSentAt: null,
    probeDeadline: 0,
  } as unknown as RelayClient;
  client.ready = new Promise<RelayClient>((resolve) => (resolveReady = resolve));

  const init = (): void => {
    if (client.isClosed) return;
    retryTimer = undefined;
    reconnectPending = false;
    client.probeSentAt = null;
    client.connectingSince = monoNow();
    const socket = new WebSocket(url);
    socket.onclose = () => {
      if (client.socket !== socket || client.isClosed || reconnectPending) return;
      reconnectPending = true;
      if (paused) {
        waitingForResume.add(init);
        return;
      }
      retryTimer = setTimeout(init, Math.random() * retryPeriod);
      retryPeriod = Math.min(retryPeriod * 2, MAX_RETRY_MS);
    };
    socket.onmessage = (event) => {
      if (client.socket !== socket) return;
      client.lastInboundAt = monoNow();
      onMessage(String(event.data));
    };
    client.socket = socket;
    client.url = socket.url;
    socket.onopen = () => {
      if (client.socket !== socket) return;
      const isReconnect = didOpen;
      didOpen = true;
      client.lastInboundAt = monoNow();
      retryPeriod = DEFAULT_RETRY_MS;
      resolveReady(client);
      if (isReconnect) onReconnect?.();
      ensureLiveness();
    };
  };

  const redial = (): void => {
    if (client.isClosed) return;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    waitingForResume.delete(init);
    retryPeriod = DEFAULT_RETRY_MS;
    const old = client.socket;
    old.onopen = null;
    old.onmessage = null;
    old.onclose = null;
    try {
      old.close();
    } catch {
      // Já fechado: nada a largar.
    }
    if (paused) {
      reconnectPending = true;
      waitingForResume.add(init);
      return;
    }
    init();
  };

  client.send = (data: string) => {
    if (client.socket.readyState === OPEN) client.socket.send(data);
  };
  client.close = () => {
    client.isClosed = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    waitingForResume.delete(init);
    client.socket.close();
  };
  client.redial = redial;
  client.kick = (nowMs: number, force = true) => {
    if (client.isClosed) return;
    const state = client.socket.readyState;
    if (state === OPEN) {
      // Sonda nova (mesmo com uma em voo: a de antes de congelar pode ter a resposta perdida).
      client.probeSentAt = nowMs;
      client.probeDeadline = nowMs + KICK_PROBE_TIMEOUT_MS;
      client.send(subscribe(PROBE_SUB, PROBE_TOPIC));
      return;
    }
    if (state === CONNECTING) {
      if (nowMs - client.connectingSince >= CONNECT_STALL_MS) redial();
      return;
    }
    if (paused) return; // fechado na pausa: espera o resume, como o original
    if (retryTimer !== undefined) {
      // Chute periódico: o retryPeriod já dobrou no onclose; meio dele desde a última discagem é o
      // ritmo do backoff original. Antes disso, o timer decide.
      if (!force && nowMs - client.connectingSince < retryPeriod / 2) return;
      clearTimeout(retryTimer);
      retryTimer = undefined;
      if (force) retryPeriod = DEFAULT_RETRY_MS;
      init();
    } else if (state === CLOSING) redial();
  };

  clients.add(client);
  init();
  return client;
}

let livenessTimer: ReturnType<typeof setInterval> | null = null;
let lastCheckAt = 0;

const hasActiveRoom = (): boolean => Object.values(batchers).some((batcher) => batcher.topics.size > 0);

/** Liga o vigia (um setInterval de 1 s; desliga sozinho sem sala aberta e sem sonda em voo). */
function ensureLiveness(): void {
  if (livenessTimer !== null) return;
  lastCheckAt = monoNow();
  livenessTimer = setInterval(() => checkRelays(), LIVENESS_TICK_MS);
  (livenessTimer as unknown as { unref?: () => void }).unref?.();
}

function sendProbe(client: RelayClient, timeoutMs: number, nowMs: number): void {
  client.probeSentAt = nowMs;
  client.probeDeadline = nowMs + timeoutMs;
  client.send(subscribe(PROBE_SUB, PROBE_TOPIC));
}

/**
 * Um passo do vigia (exportado para os testes): sonda os abertos calados há SILENT_PROBE_MS com sala
 * aberta, e larga os que não responderam no prazo. Qualquer quadro recebido depois da sonda vale como
 * resposta (eco de anúncio, OK, EOSE). Também roda com a página escondida: o anfitrião que foi mandar
 * o link no WhatsApp é justamente quem precisa estar achável, e o socket que morreu nesse meio tempo
 * volta sem esperar ele voltar. Na pausa (aba congelada pelo Chrome: o JS nem roda, e o descongelar
 * solta) ainda sonda, mas não larga ninguém: quem não respondeu espera a volta (o kick sonda de novo e
 * aí julga). Também dá o EOSE implícito aos portões vencidos (settleOverdueGates).
 */
export function checkRelays(nowMs: number = monoNow()): void {
  const late = nowMs - lastCheckAt > LATE_TICK_MS;
  lastCheckAt = nowMs;
  for (const batcher of Object.values(batchers)) settleOverdueGates(batcher.gates.values(), nowMs, late);
  const active = hasActiveRoom();
  let inFlight = false;
  for (const client of clients) {
    if (client.isClosed || client.socket.readyState !== OPEN) {
      client.probeSentAt = null;
      continue;
    }
    if (client.probeSentAt !== null) {
      if (client.lastInboundAt !== null && client.lastInboundAt > client.probeSentAt) client.probeSentAt = null;
      else if (paused || nowMs < client.probeDeadline) {
        inFlight = true;
        continue;
      } else if (late) {
        sendProbe(client, PROBE_TIMEOUT_MS, nowMs);
        inFlight = true;
        continue;
      } else {
        client.redial();
        continue;
      }
    }
    if (active && nowMs - (client.lastInboundAt ?? nowMs) >= SILENT_PROBE_MS) {
      sendProbe(client, PROBE_TIMEOUT_MS, nowMs);
      inFlight = true;
    }
  }
  if (!active && !inFlight && livenessTimer !== null) {
    clearInterval(livenessTimer);
    livenessTimer = null;
  }
}

/**
 * Sonda já todo socket aberto e religa os fechados. `force` (padrão: volta ao primeiro plano, rede de
 * volta) religa sem backoff; sem ele (chute periódico de quem segue sem sinalização) o backoff segue
 * valendo (ver RelayClient.kick).
 */
export function kickRelays(force = true): void {
  const nowMs = monoNow();
  for (const client of clients) client.kick(nowMs, force);
  ensureLiveness();
  lastCheckAt = nowMs; // o passo seguinte julga as sondas novas no prazo, sem tomar este momento por atraso
}

/** (g) Saúde agora: total de relays desta página, abertos e frescos (algo recebido em FRESH_MS). */
export function relayHealth(nowMs: number = monoNow()): { total: number; open: number; fresh: number } {
  let open = 0;
  let fresh = 0;
  for (const client of clients) {
    if (client.isClosed || client.socket.readyState !== OPEN) continue;
    open += 1;
    if (client.lastInboundAt !== null && nowMs - client.lastInboundAt <= FRESH_MS) fresh += 1;
  }
  return { total: clients.size, open, fresh };
}

/** Último quadro recebido de qualquer relay aberto (relógio monotônico); null = nenhum. */
export function lastInboundAt(): number | null {
  let latest: number | null = null;
  for (const client of clients) {
    if (client.isClosed || client.socket.readyState !== OPEN || client.lastInboundAt === null) continue;
    if (latest === null || client.lastInboundAt > latest) latest = client.lastInboundAt;
  }
  return latest;
}

let lastPeerEvent: number | null = null;

/** (f) Último evento de OUTRO aparelho entregue a um tópico (relógio monotônico); null = nenhum. */
export function lastPeerEventAt(): number | null {
  return lastPeerEvent;
}

/** Só testes: esquece sockets, pausa, vigia e sinais (o core ainda guarda os clientes que registrou). */
export function resetRelaysForTests(): void {
  for (const client of clients) client.close();
  clients.clear();
  waitingForResume.clear();
  paused = false;
  if (livenessTimer !== null) clearInterval(livenessTimer);
  livenessTimer = null;
  lastPeerEvent = null;
}

// ---------------------------------------------------------------------------
// Estratégia (o resto é o original, só tipado)
// ---------------------------------------------------------------------------

type TopicHandler = (topic: string, data: string) => void;
type Batcher = {
  subIds: string[];
  topics: Map<string, TopicHandler>;
  updateTimer: ReturnType<typeof setTimeout> | null;
  flushWaiters: Set<() => void>;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryMs: number;
  pendingEose: Set<string>;
  requestedAt: number;
  /** (c) Portão por subId. */
  gates: Map<string, ReplayGate>;
};
type NostrEvent = { content?: unknown; tags?: unknown; created_at?: unknown; pubkey?: unknown };
type Announce = { nextAnnounceMs: number } | { stopAnnouncing: true };

const relayManager = createRelayManager<RelayClient>((client) => client.socket);
const { secretKey, publicKey } = schnorr.keygen();
const pubkey = toHex(publicKey);
const kindCache: Record<string, number> = {};
const relayBackoffs = new WeakMap<RelayClient, { delayMs: number; untilMs: number }>();
const announcementMessages = relayManager.scoped<string>();
const retiredRelays = new WeakSet<RelayClient>();
const batchers: Record<string, Batcher> = {};

const backoffRelay = (client: RelayClient): number => {
  const previous = relayBackoffs.get(client);
  const delayMs = Math.min(previous?.delayMs ? Math.max(steadyAnnounceIntervalMs, previous.delayMs * 2) : steadyAnnounceIntervalMs, maxRelayBackoffMs);
  relayBackoffs.set(client, { delayMs, untilMs: Date.now() + delayMs });
  return delayMs;
};

const getRelayBackoffMs = (client: RelayClient): number => {
  const state = relayBackoffs.get(client);
  if (!state) return 0;
  const remainingMs = state.untilMs - Date.now();
  return remainingMs > 0 ? remainingMs : 0;
};

const nextAnnounce = (nextAnnounceMs: number): Announce => ({ nextAnnounceMs });
const stopAnnouncing: Announce = { stopAnnouncing: true };

const retireRelay = (client: RelayClient): boolean => {
  if (retiredRelays.has(client)) return false;
  retiredRelays.add(client);
  relayBackoffs.delete(client);
  client.close();
  return true;
};

const topicToKind = (topic: string): number => (kindCache[topic] ??= strToNum(topic, 1e4) + 2e4);

export const createEvent = async (topic: string, content: string): Promise<string> => {
  const payload = { kind: topicToKind(topic), tags: [[tag, topic]], created_at: now(), content, pubkey };
  const id = await hashWith("SHA-256", toJson([0, payload.pubkey, payload.created_at, payload.kind, payload.tags, payload.content]));
  return toJson([eventMsgType, { ...payload, id: toHex(id), sig: toHex(await schnorr.signAsync(id, secretKey)) }]);
};

export const subscribe = (subId: string, topic: string): string =>
  toJson(["REQ", subId, { kinds: [topicToKind(topic)], since: now() - SINCE_SLACK_S, ["#x"]: [topic] }]);

const resolveBatchFlush = (batcher: Batcher): void => {
  batcher.flushWaiters.forEach((resolve) => resolve());
  batcher.flushWaiters.clear();
};

const batchAdd = (client: RelayClient, topic: string, handler: TopicHandler): void => {
  const batcher = (batchers[client.url] ??= {
    subIds: [],
    topics: new Map(),
    updateTimer: null,
    flushWaiters: new Set(),
    retryTimer: null,
    retryMs: subscriptionRetryMs,
    pendingEose: new Set(),
    requestedAt: 0,
    gates: new Map(),
  });
  batcher.topics.set(topic, handler);
  scheduleBatchFlush(client, batcher);
  ensureLiveness();
};

const batchRemove = (client: RelayClient, topic: string): void => {
  const batcher = batchers[client.url];
  if (!batcher) return;
  batcher.topics.delete(topic);
  delete announcementMessages.forRelay(client)[topic];
  if (batcher.topics.size === 0) {
    if (batcher.retryTimer !== null) clearTimeout(batcher.retryTimer);
    if (batcher.updateTimer !== null) {
      clearTimeout(batcher.updateTimer);
      batcher.updateTimer = null;
    }
    resolveBatchFlush(batcher);
    batcher.subIds.forEach((subId) => client.send(toJson(["CLOSE", subId])));
    delete batchers[client.url];
  } else scheduleBatchFlush(client, batcher);
};

const scheduleBatchFlush = (client: RelayClient, batcher: Batcher): void => {
  if (batcher.updateTimer !== null) return;
  batcher.updateTimer = setTimeout(() => {
    batcher.updateTimer = null;
    try {
      flushBatch(client);
    } finally {
      resolveBatchFlush(batcher);
    }
  }, 0);
};

const waitForBatchFlush = (client: RelayClient): Promise<void> => {
  const batcher = batchers[client.url];
  if (!batcher || batcher.updateTimer === null) return Promise.resolve();
  return new Promise((resolve) => batcher.flushWaiters.add(resolve));
};

const flushBatch = (client: RelayClient): void => {
  const batcher = batchers[client.url];
  if (!batcher || batcher.topics.size === 0) return;
  const topics = [...batcher.topics.keys()];
  const chunks: string[][] = [];
  const subscribedAtSec = now();
  const since = subscribedAtSec - SINCE_SLACK_S;
  for (let i = 0; i < topics.length; i += maxTopicsPerSubscription) chunks.push(topics.slice(i, i + maxTopicsPerSubscription));
  while (batcher.subIds.length > chunks.length) {
    const subId = batcher.subIds.pop();
    if (subId) {
      client.send(toJson(["CLOSE", subId]));
      batcher.gates.delete(subId);
    }
  }
  batcher.pendingEose.clear();
  batcher.requestedAt = Date.now();
  const requestedAtMs = monoNow();
  const live = client.socket.readyState === OPEN;
  chunks.forEach((chunk, i) => {
    const subId = (batcher.subIds[i] ??= genId(64));
    batcher.pendingEose.add(subId);
    // Cada REQ (mesmo subId repetido) espera o seu EOSE: contar evita que o EOSE do REQ anterior abra o portão do novo.
    if (live) {
      const gate = batcher.gates.get(subId) ?? { subscribedAtSec, requestedAtMs, pendingEose: 0, overdueSeen: false };
      gate.subscribedAtSec = subscribedAtSec;
      gate.requestedAtMs = requestedAtMs;
      gate.pendingEose += 1;
      gate.overdueSeen = false;
      batcher.gates.set(subId, gate);
    }
    client.send(toJson(["REQ", subId, { kinds: [...new Set(chunk.map(topicToKind))], since, ["#x"]: chunk }]));
  });
};

/** Socket novo: os REQs do anterior morreram com ele, e os EOSEs que faltavam nunca vêm. */
const resetGates = (client: RelayClient): void => {
  batchers[client.url]?.gates.clear();
};

const settleGate = (client: RelayClient, subId: string): void => {
  const gate = batchers[client.url]?.gates.get(subId);
  if (gate && gate.pendingEose > 0) gate.pendingEose -= 1;
};

const resubscribeOnReconnect = (client: RelayClient): void => {
  const batcher = batchers[client.url];
  if (batcher && batcher.topics.size > 0 && !client.isClosed) {
    if (getRelayBackoffMs(client) > 0) {
      retrySubscription(client, true);
      return;
    }
    if (batcher.retryTimer !== null) {
      clearTimeout(batcher.retryTimer);
      batcher.retryTimer = null;
    }
    flushBatch(client);
    replayAnnouncements(client);
  }
};

const replayAnnouncements = (client: RelayClient): void => {
  Object.entries(announcementMessages.forRelay(client)).forEach(([topic, payload]) => {
    void publishMessage(client, topic, payload, true);
  });
};

const publishMessage = async (client: RelayClient, topic: string, payload: string, isAnnouncement: boolean): Promise<Announce | undefined> => {
  if (retiredRelays.has(client) || client.isClosed) return isAnnouncement ? stopAnnouncing : undefined;
  const remaining = getRelayBackoffMs(client);
  if (remaining > 0 || client.socket.readyState !== OPEN) return isAnnouncement ? nextAnnounce(Math.max(steadyAnnounceIntervalMs, remaining)) : undefined;
  const event = await createEvent(topic, isAnnouncement ? toJson({ ...fromJson<Record<string, unknown>>(payload), nonce: genId(8) }) : payload);
  if (isAnnouncement && !batchers[client.url]?.topics.has(topic)) return nextAnnounce(steadyAnnounceIntervalMs);
  if (getRelayBackoffMs(client) > 0 || client.isClosed || client.socket.readyState !== OPEN) return isAnnouncement ? nextAnnounce(steadyAnnounceIntervalMs) : undefined;
  client.send(event);
  return isAnnouncement ? nextAnnounce(steadyAnnounceIntervalMs) : undefined;
};

const retrySubscription = (client: RelayClient, rateLimited: boolean): void => {
  const batcher = batchers[client.url];
  if (!batcher || (batcher.retryTimer !== null && !rateLimited)) return;
  if (batcher.retryTimer !== null) clearTimeout(batcher.retryTimer);
  const delay = rateLimited ? getRelayBackoffMs(client) : batcher.retryMs;
  batcher.retryMs = Math.min(batcher.retryMs * 2, steadyAnnounceIntervalMs);
  batcher.retryTimer = setTimeout(() => {
    batcher.retryTimer = null;
    resubscribeOnReconnect(client);
  }, Math.max(delay, subscriptionRetryMs));
};

/** Um quadro de um relay: a sonda é tratada aqui; o resto segue o original (mais o portão e o sinal de par). */
const handleRelayFrame = (client: RelayClient, config: JoinRoomConfig, data: string): void => {
  let frame: unknown;
  try {
    frame = fromJson(data);
  } catch {
    return; // JSON quebrado de um relay: o original estourava no onmessage; aqui só ignora
  }
  if (!Array.isArray(frame)) return;
  const [msgType, subId, payload, relayMsg] = frame as [unknown, unknown, unknown, unknown];
  if (subId === PROBE_SUB) {
    // (e) A sonda é nossa: a resposta já contou como sinal de vida no socket. Fecha a assinatura dela
    // depois do EOSE e nada disso chega ao tratamento de erro do relay (CLOSED daria backoff ou aposentaria).
    if (msgType === "EOSE") client.send(toJson(["CLOSE", PROBE_SUB]));
    return;
  }
  if (msgType !== eventMsgType) {
    if ((msgType === "EOSE" || msgType === "CLOSED") && typeof subId === "string") settleGate(client, subId);
    const prefix = `${libName}: relay failure from ${client.url} - `;
    const rejectionReason = msgType === "CLOSED" && typeof payload === "string" ? payload : typeof relayMsg === "string" ? relayMsg : undefined;
    const didRejectEvent = msgType === "OK" && payload === false;
    const isRateLimited = (didRejectEvent || msgType === "CLOSED") && !!rejectionReason?.startsWith("rate-limited:");
    const isDuplicate = didRejectEvent && !!rejectionReason?.startsWith("duplicate:");
    const isTerminalRejection = !!rejectionReason && /^(blocked|restricted|auth-required|pow):/.test(rejectionReason);
    if (msgType === "OK" && payload === true && getRelayBackoffMs(client) === 0) relayBackoffs.delete(client);
    if ((didRejectEvent || msgType === "CLOSED") && isTerminalRejection && !retireRelay(client)) return;
    if (isRateLimited) backoffRelay(client);
    else if (msgType === "EOSE") {
      const batcher = batchers[client.url];
      if (typeof subId === "string" && batcher?.pendingEose.delete(subId) && batcher.pendingEose.size === 0) {
        batcher.retryMs = subscriptionRetryMs;
        if (batcher.retryTimer !== null) {
          clearTimeout(batcher.retryTimer);
          batcher.retryTimer = null;
        }
        if (Date.now() - batcher.requestedAt >= 1e3) replayAnnouncements(client);
      }
    }
    if (msgType === "CLOSED" && !isTerminalRejection) retrySubscription(client, isRateLimited);
    if (!isDuplicate && config.relayConfig?.warnOnRelayFailure !== false) {
      if (msgType === "NOTICE") console.warn(prefix + String(subId));
      else if (didRejectEvent || msgType === "CLOSED") console.warn(prefix + String(rejectionReason));
    }
    return;
  }
  if (!payload || typeof payload !== "object" || !("content" in payload)) return;
  const event = payload as NostrEvent;
  const batcher = batchers[client.url];
  if (typeof subId !== "string" || !batcher?.subIds.includes(subId) || !Array.isArray(event.tags)) return;
  if (!passesReplayGate(event.created_at, batcher.gates.get(subId))) return;
  const topicTag = (event.tags as unknown[]).find((entry): entry is unknown[] => Array.isArray(entry) && entry[0] === tag);
  const topic = topicTag?.[1];
  if (typeof topic !== "string" || !topic || typeof event.content !== "string") return;
  const handler = batcher.topics.get(topic);
  if (!handler) return;
  // (f) Nossos próprios eventos voltam pelo eco do relay (mesma chave da página): não contam.
  if (event.pubkey !== pubkey) lastPeerEvent = monoNow();
  handler(topic, event.content);
};

export const defaultRelayUrls = [
  "0x-nostr-relay.fly.dev",
  "bendernostur.duckdns.org:8443",
  "cdn.satellite.earth",
  "nos.lol",
  "nostr.chaima.info",
  "nostr.christiansass.de",
  "nostr.rblb.it",
  "nostr.red5d.dev",
  "nostr.robosats.org",
  "nostr.stakey.net",
  "nostrcity-club.fly.dev",
  "relay-dev.gulugulu.moe",
  "relay.aarpia.com",
  "relay.agentry.com",
  "relay.bitmacro.cloud",
  "relay.bullishbounty.com",
  "relay.degmods.com",
  "relay.flashapp.me",
  "relay.grigic.org",
  "relay.hackshed.dev",
  "relay.kaleidoswap.com",
  "relay.layer.systems",
  "relay.nostr.blockhenge.com",
  "relay.nostr.dev.br",
  "relay.nostrmap.net",
  "relay.novospes.com",
  "relay.piazza.today",
  "relay.routstr.com",
  "testr.nymble.world",
].map((url) => "wss://" + url);

export const joinRoom = createTopicStrategy<RelayClient, JoinRoomConfig>({
  init: (config) =>
    getRelays(config, defaultRelayUrls, defaultRedundancy, true).map((url) => {
      const client: RelayClient = relayManager.register(url, () =>
        makeRelaySocket(url, (data) => handleRelayFrame(client, config, data), () => {
          resetGates(client);
          resubscribeOnReconnect(client);
        }),
      );
      return client.ready;
    }),
  subscribeTopic: (client, topic, onMessage, context) => {
    const handler: TopicHandler = (name, data) => void onMessage(name, data);
    batchAdd(client, topic, handler);
    const cleanup = () => {
      if (batchers[client.url]?.topics.get(topic) === handler) batchRemove(client, topic);
    };
    return context.kind === "root" ? waitForBatchFlush(client).then(() => cleanup) : cleanup;
  },
  publishTopic: (client, topic, msg, { kind }) => {
    const payload = typeof msg === "string" ? msg : toJson(msg);
    if (kind === "announce") announcementMessages.forRelay(client)[topic] = payload;
    return publishMessage(client, topic, payload, kind === "announce");
  },
  unpublishTopic: (client, topic) => {
    delete announcementMessages.forRelay(client)[topic];
  },
});

export const getRelaySockets: () => Record<string, WebSocket> = relayManager.getSockets;

export { selfId };

// Sessão do Bobonline (§3.3): mensagens confiáveis e ordenadas por destino em cima de um
// transporte de melhor esforço, com identidade assinada, presença e repasse por um terceiro.
//
// - Identidade: hello assinado (ECDSA P-256) amarra o id de transporte do outro lado ao playerId
//   e à incarnation dele. Quadros diretos depois disso são autenticados pelo canal (DTLS); só os
//   quadros repassados (`fwd`) levam assinatura própria.
// - Confiável: seq por par (minha incarnation → a dele), buffer de reordenação, ack contíguo,
//   reenvio com backoff pelo caminho atual, `rst` quando o outbox estoura, pedaços (`chunk`)
//   para mensagens maiores que um quadro.
// - Presença: heartbeat a cada 1 s com eco (RTT e diferença de relógio), visibilidade
//   (`vis`), lista de links diretos saudáveis (`ok`) e o progresso da partida (`m`).
// - Repasse: sem link direto há mais de RELAY_AFTER_MS, o quadro vai assinado por um par R que
//   ouve os dois; R só confere o destino e repassa (com teto de banda), sem ack.

import { BOTAO_ENGINE_REV } from "../../botao/match-codec";
import { CELEBRATION_OPTIONS } from "../../player-appearance";
import { FUTBOBO_VERSION } from "../../version";
import {
  BOB_PROTOCOL,
  SESSION_KINDS,
  T,
  WIRE_VERSION,
  type HelloInfo,
  type MatchProgress,
  type PeerHealth,
  type SessionBodies,
} from "../protocol";
import { type Identity, nextIncarnation, playerIdFor, trackCrypto, verifySig } from "./identity";
import { type BobTransport, type NetClock, realClock } from "./transport";

export type { HelloInfo, MatchProgress, PeerHealth } from "../protocol";

export type LinkReason = "new" | "reconnected" | "restarted" | "overflow";

/** O que este aparelho roda (vai no hello). */
export function localHelloInfo(): HelloInfo {
  return { proto: BOB_PROTOCOL, engine: BOTAO_ENGINE_REV, celebrations: CELEBRATION_OPTIONS.length, app: FUTBOBO_VERSION };
}

/** Quadro do fio: um objeto JSON por quadro do transporte (§3.3). */
type Wire = {
  p: number; k: string;
  f: string;        // playerId de quem escreveu
  i: number;        // incarnation de quem escreveu
  ri: number;       // incarnation do destinatário em que o remetente acredita (0 = desconhecida: só hello/lossy)
  s: number;        // seq confiável por (i → ri); 0 = lossy
  a: number;        // ack: maior seq CONTÍGUO recebido desse par
  t: number;        // Date.now() do remetente
  b: unknown;
  to?: string;      // só em fwd (externo e interno)
  sig?: string;     // só em quadros internos de fwd
};

type HbBody = SessionBodies["hb"];

/** Um id de transporte do outro lado (uma carga de página dele). */
type TransportPeer = {
  id: string;
  bound: { playerId: string; inc: number } | null;
  gotHello: boolean;
  nextHelloAt: number;
  lastHelloReplyAt: number;
  helloSig: Promise<string> | null;
  verifying: boolean;
  /** Quadros que chegaram antes do hello verificado (processados depois do vínculo). */
  pending: string[];
  incompatible: boolean;
  stale: boolean;
  /** Aba mais velha dessa identidade: ganha hello (e `bye`, se for de um terceiro) quando insistir no hello. */
  byeFor: string | null;
};

type OutFrame = { s: number; k: string; body: string; sentAt: number };

/** Um jogador (playerId), com tudo o que sobrevive a troca de link. */
type Peer = {
  playerId: string;
  inc: number;                 // 0 = ainda não sei
  pub: string | null;          // do hello verificado
  /** Hello verificado da incarnation atual (vai no `bye` para a aba velha dele): id de transporte e assinatura. */
  proof: { inc: number; tp: string; sig: string } | null;
  direct: string | null;       // id de transporte vinculado
  directGoneAt: number;        // desde quando não há link direto (monotônico)
  lastHeard: number;           // qualquer caminho
  lastHeardDirect: number;
  everHeard: boolean;
  forcedLost: boolean;         // onPeerLeave sem caminho por relay
  // recepção
  next: number;
  buffer: Map<number, Wire>;
  chunk: { id: string; n: number; kind: string; parts: string[]; chars: number } | null;
  ackTimer: unknown;
  // envio
  seq: number;
  outbox: OutFrame[];
  backoff: number;
  rst: number | null;
  overflowed: boolean;
  // presença
  away: boolean;
  visT: number;
  lastHb: { body: HbBody; at: number } | null;
  echo: { now: number; at: number } | null;
  rtts: number[];
  offsets: number[];
  health: PeerHealth;
  relay: string | null;
};

type Path = { tp: TransportPeer } | { relay: Peer };

const TICK_MS = 250;
const HELLO_RESEND_MS = 2000;
const HELLO_REPLY_GAP_MS = 500;
const ACK_DELAY_MS = 40;
const AWAY_REPEAT_MS = 150;
const PENDING_CAP = 64;
const SAMPLES = 8;
const NEVER = Number.NEGATIVE_INFINITY;
/** Cabeçalho mais assinatura e `to`, com folga, de um quadro repassado. */
const FRAME_OVERHEAD = 700;
/** Custo de uma parte de chunk escapada duas vezes (direto → interno → externo). */
const CHUNK_RELAY_BUDGET = T.MAX_FRAME_BYTES - 1000;
const MAX_INCOMING_CHARS = 64 * 1024;
/** Sem sinal de vida de nenhum relay há mais que isto, a sinalização conta como fora do ar (§4.5, N8). */
export const RELAY_SILENT_MS = 20_000;

const DEV = process.env.NODE_ENV !== "production";
const RESERVED = new Set<string>(SESSION_KINDS);

function refuse(message: string, kind: string): void {
  if (DEV) throw new Error(`[bobonline] ${message}: ${kind}`);
  console.error(`[bobonline] ${message}`, kind);
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function parseWire(raw: string): Wire | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const wire = value as Record<string, unknown>;
  if (wire.p !== WIRE_VERSION || typeof wire.k !== "string" || typeof wire.f !== "string") return null;
  if (!isCount(wire.i) || !isCount(wire.ri) || !isCount(wire.s) || !isCount(wire.a) || typeof wire.t !== "number") return null;
  if (wire.to !== undefined && typeof wire.to !== "string") return null;
  if (wire.sig !== undefined && typeof wire.sig !== "string") return null;
  return wire as Wire;
}

/** Bytes UTF-8 sem alocar (o mesmo que TextEncoder; surrogate solto conta 3, como U+FFFD). */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && (text.charCodeAt(index + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** Bytes de um texto depois de virar string JSON uma vez (sem as aspas de fora). */
function escapedBytes(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) bytes += 2;
    else if (code < 0x20) bytes += code === 8 || code === 9 || code === 10 || code === 12 || code === 13 ? 2 : 6;
    else if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && (text.charCodeAt(index + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** Cabe inteiro num quadro, direto ou repassado (o corpo vai escapado uma vez dentro do `fwd`). */
function fitsWhole(bodyJson: string): boolean {
  // JSON.stringify não deixa caractere de controle cru: cada unidade UTF-16 custa no máximo 3 bytes escapada.
  if (bodyJson.length * 3 + FRAME_OVERHEAD <= T.MAX_FRAME_BYTES) return true;
  return escapedBytes(bodyJson) + FRAME_OVERHEAD <= T.MAX_FRAME_BYTES;
}

/**
 * Corta o JSON do corpo em partes nas fronteiras de code point: cada parte tem no máximo
 * CHUNK_PART_BYTES bytes UTF-8 e, escapada duas vezes (pedaço repassado), no máximo CHUNK_RELAY_BUDGET.
 */
export function splitChunkParts(json: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let raw = 0;
  let twice = 0;
  for (let index = 0; index < json.length; ) {
    const code = json.charCodeAt(index);
    const pair = code >= 0xd800 && code <= 0xdbff && index + 1 < json.length && (json.charCodeAt(index + 1) & 0xfc00) === 0xdc00;
    const width = pair ? 2 : 1;
    let rawCost: number;
    let twiceCost: number;
    if (code === 0x22 || code === 0x5c) [rawCost, twiceCost] = [1, 4];
    else if (code < 0x20) [rawCost, twiceCost] = [1, code === 8 || code === 9 || code === 10 || code === 12 || code === 13 ? 3 : 7];
    else if (code < 0x80) [rawCost, twiceCost] = [1, 1];
    else if (code < 0x800) [rawCost, twiceCost] = [2, 2];
    else if (pair) [rawCost, twiceCost] = [4, 4];
    else [rawCost, twiceCost] = [3, 3];
    if (index > start && (raw + rawCost > T.CHUNK_PART_BYTES || twice + twiceCost > CHUNK_RELAY_BUDGET)) {
      parts.push(json.slice(start, index));
      start = index;
      raw = 0;
      twice = 0;
    }
    raw += rawCost;
    twice += twiceCost;
    index += width;
  }
  parts.push(json.slice(start));
  return parts;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pushSample(list: number[], value: number): void {
  list.push(value);
  if (list.length > SAMPLES) list.shift();
}

function sameInfo(a: HelloInfo, b: HelloInfo): boolean {
  return a.proto === b.proto && a.engine === b.engine && a.celebrations === b.celebrations;
}

function isHelloBody(value: unknown): value is SessionBodies["hello"] {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<SessionBodies["hello"]>;
  const info = body.info as Partial<HelloInfo> | undefined;
  return !!info && typeof info === "object" && typeof info.proto === "number" && typeof info.engine === "number"
    && typeof info.celebrations === "number" && typeof info.app === "string"
    && typeof body.playerId === "string" && isCount(body.inc) && typeof body.pub === "string" && typeof body.sig === "string";
}

function isHbBody(value: unknown): value is HbBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<HbBody>;
  if (typeof body.now !== "number" || (body.vis !== "fg" && body.vis !== "bg") || !Array.isArray(body.ok)) return false;
  const echo = body.echo;
  return echo === null || (!!echo && typeof echo.now === "number" && typeof echo.held === "number");
}

export class BobSession {
  readonly playerId: string;
  readonly incarnation: number;                         // contador de boot (monotônico por aparelho)

  onMessage: (from: string, kind: string, body: unknown) => void = () => {};
  onHealth: (playerId: string, health: PeerHealth) => void = () => {};
  onLink: (playerId: string, reason: LinkReason) => void = () => {};
  onIncompatible: (playerId: string | null, theirs: HelloInfo) => void = () => {};
  onSignaling: (up: boolean) => void = () => {};
  onJoinError: (info: { playerId: string | null; reason: string }) => void = () => {}; // playerId conhecido se esse id de transporte já foi vinculado
  onSuperseded: () => void = () => {};                  // outro aparelho/aba com a mesma identidade e boot maior

  private readonly identity: Identity;
  private readonly transport: BobTransport;
  private readonly hello: HelloInfo;
  private readonly clock: NetClock;
  private readonly wallNow: () => number;
  private readonly maxFrame: number;
  private code: string | null = null;
  private dead = false;
  private leaving: Promise<void> | null = null;
  private rejoining: Promise<void> | null = null;
  private readonly tps = new Map<string, TransportPeer>();
  private readonly peers = new Map<string, Peer>();
  private readonly roster = new Map<string, string>();
  private readonly tpHistory = new Map<string, string>();
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private progress: MatchProgress | null = null;
  private vis: "fg" | "bg" = "fg";
  private tickHandle: unknown = null;
  private lastHbAt = NEVER;
  private signalingWasUp: boolean | null = null;
  private chunkSeq = 0;
  private relayChain: Promise<void> = Promise.resolve();
  private verifyChain: Promise<void> = Promise.resolve();
  private byeCheck: Promise<void> | null = null;

  constructor(args: {
    identity: Identity;
    transport: BobTransport;
    hello: HelloInfo;
    now?: () => number;      /* testes: relógio de parede */
    clock?: NetClock;        /* testes: padrão = transport.clock ?? realClock */
    incarnation?: number;    /* testes: padrão = nextIncarnation() */
  }) {
    this.identity = args.identity;
    this.transport = args.transport;
    this.hello = args.hello;
    this.clock = args.clock ?? args.transport.clock ?? realClock;
    const clock = this.clock;
    this.wallNow = args.now ?? (clock === realClock ? () => Date.now() : () => clock.now());
    this.playerId = args.identity.playerId;
    this.incarnation = args.incarnation ?? nextIncarnation();
    this.maxFrame = Math.min(args.transport.maxFrameBytes, T.MAX_FRAME_BYTES);
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  connect(code: string): void {
    if (this.dead) throw new Error("BobSession: sessão encerrada");
    if (this.code !== null) throw new Error("BobSession: connect só uma vez (use rejoin)");
    this.code = code;
    const transport = this.transport;
    transport.onData = (peer, data) => this.receive(peer, data);
    transport.onPeerJoin = (peer) => this.peerJoined(peer);
    transport.onPeerLeave = (peer) => this.peerLeft(peer);
    transport.onJoinError = (info) => this.safe(() => this.onJoinError({ playerId: info.peer ? this.tpHistory.get(info.peer) ?? null : null, reason: info.reason }));
    transport.open({ code });
    this.scheduleTick();
  }

  /** Sai: para timers e fecha o transporte. Idempotente. */
  leave(): Promise<void> {
    if (this.leaving) return this.leaving;
    this.dead = true;
    if (this.tickHandle !== null) this.clock.clearTimeout(this.tickHandle);
    this.tickHandle = null;
    for (const peer of this.peers.values()) this.clearAck(peer);
    const transport = this.transport;
    transport.onData = null;
    transport.onPeerJoin = null;
    transport.onPeerLeave = null;
    transport.onJoinError = null;
    this.leaving = transport.close().catch(() => undefined);
    return this.leaving;
  }

  /** Single-flight: fecha e reabre o transporte, mantém outbox/seq. */
  rejoin(): Promise<void> {
    if (this.rejoining) return this.rejoining;
    if (this.dead || this.code === null) return Promise.resolve();
    const code = this.code;
    this.rejoining = (async () => {
      try {
        await this.transport.close();
      } catch {
        // Fechar mal não impede reabrir.
      }
      if (this.dead) return;
      const now = this.clock.now();
      for (const peer of this.peers.values()) {
        if (peer.direct !== null) {
          peer.direct = null;
          peer.directGoneAt = now;
        }
      }
      this.tps.clear();
      this.transport.open({ code });
    })().finally(() => {
      this.rejoining = null;
    });
    return this.rejoining;
  }

  /** Confiável, ordenado por destino, sobrevive a troca de link e ao caminho por relay; corpo JSON. */
  send(to: string, kind: string, body: unknown): void {
    if (this.dead || to === this.playerId) return;
    if (!this.appKind(kind)) return;
    const json = this.json(body, kind);
    if (json === null) return;
    if (json.length > T.MAX_MESSAGE_CHARS) {
      refuse("mensagem grande demais", kind);
      return;
    }
    const peer = this.ensurePeer(to);
    const now = this.clock.now();
    if (fitsWhole(json)) this.enqueue(peer, kind, json, now);
    else {
      const parts = splitChunkParts(json);
      const id = `${this.incarnation.toString(36)}.${(++this.chunkSeq).toString(36)}`;
      parts.forEach((part, index) => {
        this.enqueue(peer, "chunk", JSON.stringify({ id, i: index, n: parts.length, kind, part }), now);
      });
    }
    if (peer.overflowed) {
      peer.overflowed = false;
      this.emitLink(peer, "overflow");
    }
  }

  /** Não confiável (aim, hold, live): perde-se sem drama. */
  sendLossy(to: string | "all", kind: string, body: unknown): void {
    if (this.dead || to === this.playerId) return;
    if (!this.appKind(kind)) return;
    const json = this.json(body, kind);
    if (json === null) return;
    if (!fitsWhole(json)) {
      refuse("quadro grande demais", kind);
      return;
    }
    const now = this.clock.now();
    if (to === "all") {
      for (const peer of this.peers.values()) if (peer.everHeard && peer.health !== "lost") this.transmit(peer, kind, 0, json, now);
    } else {
      const peer = this.peers.get(to);
      if (peer) this.transmit(peer, kind, 0, json, now);
    }
  }

  /** Confiável para cada membro conhecido (roster ou já ouvido). */
  broadcast(kind: string, body: unknown, filter?: (playerId: string) => boolean): void {
    const targets = new Set<string>(this.roster.keys());
    for (const peer of this.peers.values()) if (peer.inc !== 0) targets.add(peer.playerId);
    for (const playerId of targets) if (playerId !== this.playerId && (!filter || filter(playerId))) this.send(playerId, kind, body);
  }

  /** Chaves dos membros (do snapshot) para verificar quadros repassados. */
  setRoster(members: Array<{ playerId: string; pub: string }>): void {
    this.roster.clear();
    for (const member of members) {
      if (member.playerId === this.playerId) continue;
      this.roster.set(member.playerId, member.pub);
      this.ensurePeer(member.playerId);
    }
  }

  /** Entra no próximo heartbeat. */
  setProgress(progress: MatchProgress | null): void {
    this.progress = progress;
  }

  /** Página visível ou não (visibilitychange, pause/resume do Capacitor): `away`/`back` duas vezes e `vis` no hb. */
  setVisible(visible: boolean): void {
    const vis = visible ? "fg" : "bg";
    if (this.vis === vis || this.dead) return;
    this.vis = vis;
    const kind = visible ? "back" : "away";
    this.lossyToAll(kind);
    this.clock.setTimeout(() => {
      if (this.vis === vis && !this.dead) this.lossyToAll(kind);
    }, AWAY_REPEAT_MS);
  }

  health(playerId: string): PeerHealth {
    return this.peers.get(playerId)?.health ?? "lost";
  }

  /** Link direto vivo (senão pode estar via relay). */
  direct(playerId: string): boolean {
    const peer = this.peers.get(playerId);
    return !!peer && this.directTp(peer) !== null && this.clock.now() - peer.lastHeardDirect <= T.UNSTABLE_MS;
  }

  /** Algum heartbeat fresco (direto ou repassado) de outro par lista esse jogador em ok. */
  heardBy(playerId: string, freshMs: number = T.HOST_VETO_FRESH_MS): boolean {
    const now = this.clock.now();
    for (const peer of this.peers.values()) {
      if (peer.playerId === playerId || !peer.lastHb || now - peer.lastHb.at > freshMs) continue;
      if (peer.lastHb.body.ok.includes(playerId)) return true;
    }
    return false;
  }

  progressOf(playerId: string): { p: MatchProgress | null; at: number } | null {
    const hb = this.peers.get(playerId)?.lastHb;
    return hb ? { p: hb.body.m ?? null, at: hb.at } : null;
  }

  /** Chave pública do hello VERIFICADO desse par; null antes do primeiro vínculo direto (a do roster não conta). */
  pubOf(playerId: string): string | null {
    return this.peers.get(playerId)?.pub ?? null;
  }

  /** Lista `ok` do último hb desse par (direto ou repassado), em cópia; null antes do primeiro e depois de ele recarregar. */
  okListOf(playerId: string): string[] | null {
    const hb = this.peers.get(playerId)?.lastHb;
    return hb ? hb.body.ok.filter((id) => typeof id === "string") : null;
  }

  /** playerIds ok/unstable (direto ou relay). */
  linked(): string[] {
    const list: string[] = [];
    for (const peer of this.peers.values()) if (peer.health === "ok" || peer.health === "unstable") list.push(peer.playerId);
    return list;
  }

  rttOf(playerId: string): number | null {
    const peer = this.peers.get(playerId);
    return peer ? median(peer.rtts) : null;
  }

  /** localNow − remoteNow estimado (mediana de 8), em hora de parede. */
  clockOffset(playerId: string): number | null {
    const peer = this.peers.get(playerId);
    return peer ? median(peer.offsets) : null;
  }

  /** signalingUp() && navigator.onLine !== false, ou algum par ok. */
  online(): boolean {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (this.signalingUp() && nav?.onLine !== false) return true;
    for (const peer of this.peers.values()) if (peer.health === "ok") return true;
    return false;
  }

  /** Mensagens confiáveis ainda sem ack para esse jogador (ex.: esperar o room:leave sair). */
  pending(playerId: string): number {
    return this.peers.get(playerId)?.outbox.length ?? 0;
  }

  pauseSignaling(): void {
    this.transport.pauseSignaling();
  }

  resumeSignaling(): void {
    this.transport.resumeSignaling();
  }

  /**
   * Algum relay aberto E com sinal de vida nos últimos RELAY_SILENT_MS (o transporte sonda os calados).
   * Numa queda silenciosa (o roteador perdeu a internet, o Wi-Fi segue) o socket fica OPEN por minutos:
   * sem isto o aparelho isolado se achava na rede, reivindicava a sala sozinho e se dava o W.O.
   */
  signalingUp(): boolean {
    if (!this.transport.signalingUp()) return false;
    const at = this.transport.lastInboundAt?.() ?? null;
    return at === null || this.clock.now() - at <= RELAY_SILENT_MS;
  }

  // -------------------------------------------------------------------------
  // Timers
  // -------------------------------------------------------------------------

  private scheduleTick(): void {
    this.tickHandle = this.clock.setTimeout(() => {
      this.tickHandle = null;
      if (this.dead) return;
      try {
        this.service();
      } catch (error) {
        console.error("[bobonline] sessão", error);
      }
      if (!this.dead) this.scheduleTick();
    }, TICK_MS);
  }

  private service(): void {
    const now = this.clock.now();
    const up = this.signalingUp();
    if (up !== this.signalingWasUp) {
      const first = this.signalingWasUp === null;
      this.signalingWasUp = up;
      if (!first || up) this.safe(() => this.onSignaling(up));
    }
    for (const tp of this.tps.values()) {
      if (!tp.gotHello && !tp.incompatible && !tp.stale && now >= tp.nextHelloAt) {
        tp.nextHelloAt = now + HELLO_RESEND_MS;
        this.sendHello(tp);
      }
    }
    const hbDue = now - this.lastHbAt >= T.HEARTBEAT_MS - TICK_MS / 2;
    const ok = hbDue ? this.okList(now) : [];
    if (hbDue) this.lastHbAt = now;
    for (const peer of this.peers.values()) {
      if (hbDue) this.heartbeat(peer, now, ok);
      this.retransmit(peer, now);
      this.updateHealth(peer, now);
    }
  }

  // -------------------------------------------------------------------------
  // Transporte → sessão
  // -------------------------------------------------------------------------

  private newTp(id: string): TransportPeer {
    const tp: TransportPeer = {
      id, bound: null, gotHello: false, nextHelloAt: 0, lastHelloReplyAt: NEVER, helloSig: null,
      verifying: false, pending: [], incompatible: false, stale: false, byeFor: null,
    };
    this.tps.set(id, tp);
    return tp;
  }

  private peerJoined(id: string): void {
    if (this.dead) return;
    const tp = this.newTp(id);
    tp.nextHelloAt = this.clock.now() + HELLO_RESEND_MS;
    this.sendHello(tp);
  }

  private peerLeft(id: string): void {
    const tp = this.tps.get(id);
    this.tps.delete(id);
    if (!tp?.bound || this.dead) return;
    const peer = this.peers.get(tp.bound.playerId);
    if (!peer || peer.direct !== id) return;
    const now = this.clock.now();
    peer.direct = null;
    peer.directGoneAt = now;
    // Reload ≠ desistência: só "lost". Com outro caminho (relay), o silêncio decide.
    if (!this.relayFor(peer, now)) peer.forcedLost = true;
    this.updateHealth(peer, now);
  }

  private receive(id: string, data: string): void {
    if (this.dead || typeof data !== "string" || data.length > MAX_INCOMING_CHARS) return;
    const wire = parseWire(data);
    if (!wire) return;
    const tp = this.tps.get(id) ?? this.newTp(id);
    if (tp.stale) {
      if (wire.k === "hello") this.answerStale(tp);
      return;
    }
    if (wire.k === "hello") {
      this.handleHello(tp, wire);
      return;
    }
    if (tp.incompatible) return;
    if (!tp.bound) {
      if (tp.pending.length < PENDING_CAP) tp.pending.push(data);
      return;
    }
    const peer = this.peers.get(tp.bound.playerId);
    if (!peer || wire.f !== tp.bound.playerId || wire.i !== tp.bound.inc || peer.inc !== tp.bound.inc) return;
    if (wire.k === "fwd") {
      this.handleFwd(peer, wire);
      return;
    }
    this.process(peer, wire, id, null);
  }

  // -------------------------------------------------------------------------
  // Hello e vínculo
  // -------------------------------------------------------------------------

  private helloText(playerId: string, inc: number, receiverTp: string, senderTp: string): string {
    return `bobonline|hello|${this.code ?? ""}|${playerId}|${inc}|${receiverTp}|${senderTp}`;
  }

  private sendHello(tp: TransportPeer): void {
    if (this.dead) return;
    tp.helloSig ??= trackCrypto(this.identity.sign(this.helloText(this.playerId, this.incarnation, tp.id, this.transport.selfId())));
    const signing = tp.helloSig;
    signing.then(
      (sig) => {
        if (this.dead || this.tps.get(tp.id) !== tp) return;
        const peer = tp.bound ? this.peers.get(tp.bound.playerId) ?? null : null;
        const body: SessionBodies["hello"] = { info: this.hello, playerId: this.playerId, inc: this.incarnation, pub: this.identity.pub, sig };
        this.emit(tp.id, this.frame(peer, "hello", 0, JSON.stringify(body)), "hello");
      },
      () => {
        tp.helloSig = null;
      },
    );
  }

  private handleHello(tp: TransportPeer, wire: Wire): void {
    const body = wire.b;
    if (!isHelloBody(body) || wire.f !== body.playerId || wire.i !== body.inc) return;
    // Um id de transporte é uma carga de página: vinculado a um jogador, não vira outro (uma conexão só
    // cunharia quantas identidades quisesse). Outra identidade precisa de um transporte novo.
    if (tp.bound && tp.bound.playerId !== body.playerId) return;
    tp.gotHello = true;
    const now = this.clock.now();
    // Ele ainda não conhece a minha incarnation: o meu hello se perdeu, mando de novo.
    if (wire.ri !== this.incarnation && now - tp.lastHelloReplyAt >= HELLO_REPLY_GAP_MS) {
      tp.lastHelloReplyAt = now;
      this.sendHello(tp);
    }
    if (!sameInfo(body.info, this.hello)) {
      if (!tp.incompatible) {
        tp.incompatible = true;
        tp.pending = [];
        void this.verifyHello(tp, body).then((verified) => {
          if (!this.dead) this.safe(() => this.onIncompatible(verified ? body.playerId : null, body.info));
        });
      }
      return;
    }
    if (tp.bound && tp.bound.playerId === body.playerId && tp.bound.inc === body.inc) return;
    if (tp.verifying) return;
    tp.verifying = true;
    void this.verifyHello(tp, body).then((verified) => {
      tp.verifying = false;
      if (this.dead || this.tps.get(tp.id) !== tp) return;
      if (!verified) {
        tp.pending = [];
        return;
      }
      if (tp.bound && tp.bound.playerId !== body.playerId) return;
      this.bind(tp, body);
    });
  }

  private async verifyHello(tp: TransportPeer, body: SessionBodies["hello"]): Promise<boolean> {
    try {
      const derived = await trackCrypto(playerIdFor(body.pub));
      if (derived !== body.playerId) return false;
      // O texto assinado amarra o hello a ESTE par de ids de transporte (aleatórios por carga de página).
      return await trackCrypto(verifySig(body.pub, this.helloText(body.playerId, body.inc, this.transport.selfId(), tp.id), body.sig));
    } catch {
      return false;
    }
  }

  private bind(tp: TransportPeer, body: SessionBodies["hello"]): void {
    if (body.playerId === this.playerId) {
      // A minha própria identidade em outra aba/aparelho: o boot maior fica.
      if (body.inc > this.incarnation) this.supersede();
      else if (body.inc < this.incarnation) this.sendBye(tp, this.playerId);
      tp.stale = true;
      tp.pending = [];
      return;
    }
    const peer = this.ensurePeer(body.playerId);
    const now = this.clock.now();
    if (body.inc < peer.inc) {
      // Aba mais velha da mesma identidade.
      this.sendBye(tp, body.playerId);
      tp.stale = true;
      tp.pending = [];
      return;
    }
    let reason: LinkReason;
    if (peer.inc === 0) {
      reason = peer.everHeard ? "reconnected" : "new";
      peer.inc = body.inc;
    } else if (body.inc > peer.inc) {
      this.restart(peer, body.inc, now);
      reason = "restarted";
    } else reason = "reconnected";
    if (peer.direct !== null && peer.direct !== tp.id) {
      const old = this.tps.get(peer.direct);
      if (old?.bound && old.bound.inc < body.inc) old.stale = true;
    }
    tp.bound = { playerId: body.playerId, inc: body.inc };
    peer.direct = tp.id;
    peer.pub = body.pub;
    peer.proof = { inc: body.inc, tp: tp.id, sig: body.sig };
    this.tpHistory.set(tp.id, body.playerId);
    this.heard(peer, true, now);
    this.flushOutbox(peer, now);
    this.emitLink(peer, reason);
    this.updateHealth(peer, now);
    const queued = tp.pending;
    tp.pending = [];
    for (const raw of queued) this.receive(tp.id, raw);
  }

  /**
   * Avisa a aba velha de `playerId` com a prova da incarnation nova: o hello que ela me assinou.
   * A minha própria aba velha não precisa (o meu hello assinado já a derruba no bind dela); sem
   * prova (a incarnation nova só chegou pelo relay) não vai bye: ela cai quando a nova a encontrar.
   */
  private sendBye(tp: TransportPeer, playerId: string): void {
    tp.byeFor = playerId;
    tp.lastHelloReplyAt = this.clock.now();
    if (playerId === this.playerId) return;
    const proof = this.peers.get(playerId)?.proof;
    if (!proof) return;
    const body: SessionBodies["bye"] = { reason: "outra-aba", playerId, inc: proof.inc, tp: proof.tp, sig: proof.sig };
    this.emit(tp.id, this.frame(null, "bye", 0, JSON.stringify(body)), "bye");
  }

  /**
   * A aba velha continua mandando hello (o meu hello ou o bye se perderam): ela só aceita o bye
   * depois de me vincular, então vão os dois de novo, no máximo a cada HELLO_RESEND_MS.
   */
  private answerStale(tp: TransportPeer): void {
    if (tp.byeFor === null || this.dead) return;
    const now = this.clock.now();
    if (now - tp.lastHelloReplyAt < HELLO_RESEND_MS) return;
    this.sendHello(tp);
    this.sendBye(tp, tp.byeFor);
  }

  /**
   * `bye "outra-aba"` de um par vinculado (direto). Só vale com a prova: o hello da minha própria
   * chave, incarnation maior que a minha, assinado para quem manda o bye (`senderTp`, o id de
   * transporte por onde ele chegou). Sem isso qualquer par da sala derrubaria a minha sessão.
   */
  private checkBye(senderTp: string, raw: unknown): void {
    if (this.byeCheck || this.dead || !raw || typeof raw !== "object") return;
    const body = raw as Partial<Record<keyof SessionBodies["bye"], unknown>>;
    if (body.reason !== "outra-aba" || body.playerId !== this.playerId) return;
    if (typeof body.inc !== "number" || !Number.isSafeInteger(body.inc) || body.inc <= this.incarnation) return;
    if (typeof body.tp !== "string" || typeof body.sig !== "string") return;
    const text = this.helloText(this.playerId, body.inc, senderTp, body.tp);
    // Uma conferência por vez: um par enchendo de bye falso não vira fila de cripto (o legítimo se repete).
    this.byeCheck = trackCrypto(verifySig(this.identity.pub, text, body.sig))
      .then((ok) => {
        if (ok) this.supersede();
      })
      .catch((error) => console.error("[bobonline] bye", error))
      .finally(() => {
        this.byeCheck = null;
      });
  }

  private supersede(): void {
    if (this.dead) return;
    this.safe(() => this.onSuperseded());
    void this.leave();
  }

  /** O par recarregou (incarnation maior): tudo do par antigo vai fora. */
  private restart(peer: Peer, inc: number, now: number): void {
    peer.inc = inc;
    peer.next = 1;
    peer.buffer.clear();
    peer.chunk = null;
    peer.seq = 1;
    peer.outbox = [];
    peer.rst = null;
    peer.backoff = 0;
    peer.overflowed = false;
    peer.away = false;
    peer.visT = NEVER;
    peer.lastHb = null;
    peer.echo = null;
    peer.proof = null;
    this.clearAck(peer);
    if (peer.direct !== null) {
      const old = this.tps.get(peer.direct);
      if (old) {
        // A página velha dele, se ainda estiver aberta (duas abas), recebe o bye quando insistir.
        old.stale = true;
        old.byeFor = peer.playerId;
      }
      peer.direct = null;
      peer.directGoneAt = now;
    }
  }

  // -------------------------------------------------------------------------
  // Repasse
  // -------------------------------------------------------------------------

  private handleFwd(from: Peer, wire: Wire): void {
    const now = this.clock.now();
    this.heard(from, true, now);
    if (wire.ri === this.incarnation) this.ack(from, wire.a);
    this.updateHealth(from, now);
    if (wire.s !== 0 || typeof wire.b !== "string" || typeof wire.to !== "string") return;
    const inner = wire.b;
    if (wire.to === this.playerId) {
      this.verifyChain = this.verifyChain.then(() => this.acceptRelayed(inner)).catch((error) => console.error("[bobonline] repasse", error));
      return;
    }
    // Sou o R: confiro só que o destino está ligado a mim e repasso o quadro interno sem mexer.
    const target = this.peers.get(wire.to);
    const tp = target ? this.directTp(target) : null;
    if (!target || !tp || target.inc === 0) return;
    if (!this.allowRelay(from.playerId, target.playerId, inner.length, now)) return;
    this.emit(tp.id, this.frame(target, "fwd", 0, JSON.stringify(inner), `,"to":${JSON.stringify(target.playerId)}`), "fwd");
  }

  private allowRelay(from: string, to: string, bytes: number, now: number): boolean {
    const key = `${from}>${to}`;
    const cap = T.RELAY_CAP_BYTES_PER_S;
    const bucket = this.buckets.get(key) ?? { tokens: cap, at: now };
    bucket.tokens = Math.min(cap, bucket.tokens + ((now - bucket.at) / 1000) * cap);
    bucket.at = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens < bytes) return false;
    bucket.tokens -= bytes;
    return true;
  }

  private async acceptRelayed(inner: string): Promise<void> {
    if (this.dead) return;
    const wire = parseWire(inner);
    if (!wire || typeof wire.sig !== "string" || wire.to !== this.playerId || wire.f === this.playerId) return;
    if (wire.k === "hello" || wire.k === "fwd") return;
    const suffix = `,"sig":${JSON.stringify(wire.sig)}}`;
    if (!inner.endsWith(suffix)) return;
    const signed = `${inner.slice(0, inner.length - suffix.length)}}`;
    const pub = this.roster.get(wire.f) ?? this.peers.get(wire.f)?.pub ?? null;
    if (!pub) return;
    const ok = await trackCrypto(verifySig(pub, signed, wire.sig));
    if (!ok || this.dead) return;
    const peer = this.ensurePeer(wire.f);
    if (wire.i < peer.inc) return;
    let reason: LinkReason | null = null;
    const now = this.clock.now();
    if (wire.i > peer.inc) {
      if (peer.inc === 0) {
        reason = peer.everHeard ? "reconnected" : "new";
        peer.inc = wire.i;
      } else {
        this.restart(peer, wire.i, now);
        reason = "restarted";
      }
    }
    this.process(peer, wire, null, reason);
  }

  private viaRelay(relay: Peer, target: Peer, kind: string, s: number, body: string): void {
    const unsigned = this.frame(target, kind, s, body, `,"to":${JSON.stringify(target.playerId)}`);
    this.relayChain = this.relayChain.then(async () => {
      if (this.dead) return;
      let sig: string;
      try {
        sig = await trackCrypto(this.identity.sign(unsigned));
      } catch {
        return;
      }
      const tp = this.directTp(relay);
      if (this.dead || !tp) return;
      const inner = `${unsigned.slice(0, -1)},"sig":${JSON.stringify(sig)}}`;
      this.emit(tp.id, this.frame(relay, "fwd", 0, JSON.stringify(inner), `,"to":${JSON.stringify(target.playerId)}`), kind);
    }).catch((error) => console.error("[bobonline] repasse", error));
  }

  // -------------------------------------------------------------------------
  // Recepção de um quadro já autenticado (direto ou repassado)
  // -------------------------------------------------------------------------

  /** `via`: id de transporte por onde o quadro chegou direto; null = repassado. */
  private process(peer: Peer, wire: Wire, via: string | null, linkReason: LinkReason | null): void {
    const now = this.clock.now();
    const wasLost = peer.everHeard && peer.health === "lost";
    this.heard(peer, via !== null, now);
    if (wire.ri === this.incarnation) this.ack(peer, wire.a);
    const reason = linkReason ?? (wasLost ? "reconnected" : null);
    if (reason) {
      this.flushOutbox(peer, now);
      this.emitLink(peer, reason);
    }
    if (wire.s === 0) this.lossy(peer, wire, via, now);
    else this.reliable(peer, wire);
    this.updateHealth(peer, now);
  }

  private heard(peer: Peer, direct: boolean, now: number): void {
    peer.lastHeard = now;
    if (direct) peer.lastHeardDirect = now;
    peer.everHeard = true;
    peer.forcedLost = false;
  }

  private lossy(peer: Peer, wire: Wire, via: string | null, now: number): void {
    const direct = via !== null;
    switch (wire.k) {
      case "hb": {
        if (!isHbBody(wire.b)) return;
        const body = wire.b;
        peer.lastHb = { body, at: now };
        if (!peer.echo || body.now > peer.echo.now) peer.echo = { now: body.now, at: now };
        // Cópia repassada de um hb que também veio direto: não vira amostra (o salto extra distorce).
        const sample = direct || this.directTp(peer) === null || now - peer.lastHeardDirect > T.UNSTABLE_MS;
        if (body.echo && sample) {
          const wall = this.wallNow();
          const rtt = wall - body.echo.now - body.echo.held;
          if (rtt >= 0 && rtt < 60_000) {
            pushSample(peer.rtts, rtt);
            pushSample(peer.offsets, wall - (body.now + rtt / 2));
          }
        }
        this.setVisibility(peer, wire.t, body.vis === "bg");
        return;
      }
      case "away":
        this.setVisibility(peer, wire.t, true);
        return;
      case "back":
        this.setVisibility(peer, wire.t, false);
        return;
      case "ack":
        return;
      case "rst": {
        const body = wire.b as { s?: unknown } | null;
        if (wire.ri !== this.incarnation || !body || !isCount(body.s) || body.s <= peer.next) return;
        peer.next = body.s;
        peer.buffer.clear();
        peer.chunk = null;
        this.emitLink(peer, "overflow");
        return;
      }
      case "bye":
        // Só direto: a prova amarra o hello da aba nova ao id de transporte de quem manda o bye.
        if (via !== null) this.checkBye(via, wire.b);
        return;
      case "chunk":
      case "hello":
      case "fwd":
        return;
      default:
        this.safe(() => this.onMessage(peer.playerId, wire.k, wire.b));
    }
  }

  /** `away`/`back`/`hb.vis` fora de ordem (jitter, relay) não desfazem um mais novo. */
  private setVisibility(peer: Peer, t: number, away: boolean): void {
    if (t < peer.visT && peer.visT - t < 60_000) return;
    peer.visT = t;
    peer.away = away;
  }

  private reliable(peer: Peer, wire: Wire): void {
    // Quadro de uma incarnation minha anterior: era para a página velha.
    if (wire.ri !== this.incarnation) return;
    this.scheduleAck(peer);
    if (wire.s < peer.next) return; // duplicado (o ack sai mesmo assim)
    if (wire.s >= peer.next + T.REORDER_WINDOW) return; // fora da janela: o reenvio traz de novo
    if (wire.s > peer.next) {
      if (!peer.buffer.has(wire.s)) peer.buffer.set(wire.s, wire);
      return;
    }
    this.deliver(peer, wire);
    peer.next += 1;
    for (let queued = peer.buffer.get(peer.next); queued; queued = peer.buffer.get(peer.next)) {
      peer.buffer.delete(peer.next);
      this.deliver(peer, queued);
      peer.next += 1;
    }
  }

  private deliver(peer: Peer, wire: Wire): void {
    if (this.dead) return;
    if (wire.k !== "chunk") {
      if (RESERVED.has(wire.k)) return;
      this.safe(() => this.onMessage(peer.playerId, wire.k, wire.b));
      return;
    }
    const body = wire.b as Partial<SessionBodies["chunk"]> | null;
    if (!body || typeof body.id !== "string" || !isCount(body.i) || !isCount(body.n) || body.n < 1
      || typeof body.kind !== "string" || typeof body.part !== "string") return;
    if (!peer.chunk || peer.chunk.id !== body.id) {
      if (body.i !== 0) return; // começo perdido (estouro do outbox): o app reenvia o snapshot
      peer.chunk = { id: body.id, n: body.n, kind: body.kind, parts: [], chars: 0 };
    }
    const chunk = peer.chunk;
    if (body.i !== chunk.parts.length || body.n !== chunk.n) {
      peer.chunk = null;
      return;
    }
    chunk.parts.push(body.part);
    chunk.chars += body.part.length;
    if (chunk.chars > T.MAX_MESSAGE_CHARS) {
      peer.chunk = null;
      return;
    }
    if (chunk.parts.length < chunk.n) return;
    peer.chunk = null;
    let message: unknown;
    try {
      message = JSON.parse(chunk.parts.join(""));
    } catch {
      return;
    }
    if (RESERVED.has(chunk.kind)) return;
    this.safe(() => this.onMessage(peer.playerId, chunk.kind, message));
  }

  // -------------------------------------------------------------------------
  // Envio
  // -------------------------------------------------------------------------

  private frame(peer: Peer | null, kind: string, s: number, body: string, extra = ""): string {
    const ri = peer ? peer.inc : 0;
    const a = peer ? peer.next - 1 : 0;
    return `{"p":${WIRE_VERSION},"k":${JSON.stringify(kind)},"f":${JSON.stringify(this.playerId)},"i":${this.incarnation},"ri":${ri},"s":${s},"a":${a},"t":${this.wallNow()},"b":${body}${extra}}`;
  }

  private emit(tpId: string, frame: string, kind: string): void {
    if (frame.length * 3 > this.maxFrame && utf8Bytes(frame) > this.maxFrame) {
      // Nunca entregue ao Trystero: ele trocaria para o caminho assíncrono e quadros menores passariam na frente.
      console.error("[bobonline] quadro grande demais", kind);
      return;
    }
    try {
      this.transport.send(tpId, frame);
    } catch {
      // Melhor esforço: o reenvio cuida.
    }
  }

  private directTp(peer: Peer): TransportPeer | null {
    if (peer.direct === null) return null;
    const tp = this.tps.get(peer.direct);
    return tp && !tp.stale && tp.bound?.playerId === peer.playerId && tp.bound.inc === peer.inc ? tp : null;
  }

  private relayNeeded(peer: Peer, now: number): boolean {
    return this.directTp(peer) ? now - peer.lastHeardDirect > T.RELAY_AFTER_MS : now - peer.directGoneAt > T.RELAY_AFTER_MS;
  }

  /** Um par R que eu ouço direto e cujo hb fresco lista o destino em `ok`. */
  private relayFor(peer: Peer, now: number): Peer | null {
    const valid = (relay: Peer) => relay !== peer && this.directTp(relay) !== null
      && now - relay.lastHeardDirect <= T.UNSTABLE_MS && !!relay.lastHb && now - relay.lastHb.at <= T.UNSTABLE_MS
      && relay.lastHb.body.ok.includes(peer.playerId);
    if (peer.relay) {
      const current = this.peers.get(peer.relay);
      if (current && valid(current)) return current;
    }
    let best: Peer | null = null;
    for (const candidate of this.peers.values()) {
      if (!valid(candidate)) continue;
      if (!best) best = candidate;
      else {
        const rank = (median(candidate.rtts) ?? 1e9) - (median(best.rtts) ?? 1e9);
        if (rank < 0 || (rank === 0 && candidate.playerId < best.playerId)) best = candidate;
      }
    }
    peer.relay = best?.playerId ?? null;
    return best;
  }

  /** Caminho atual: direto; sem direto há mais de RELAY_AFTER_MS, um relay; senão o direto que houver. */
  private pathFor(peer: Peer, now: number): Path | null {
    const tp = this.directTp(peer);
    if (!this.relayNeeded(peer, now)) return tp ? { tp } : null;
    const relay = this.relayFor(peer, now);
    if (relay) return { relay };
    return tp ? { tp } : null;
  }

  private transmit(peer: Peer, kind: string, s: number, body: string, now: number): boolean {
    if (s > 0 && peer.inc === 0) return false; // confiável precisa da incarnation dele (ri)
    const path = this.pathFor(peer, now);
    if (!path) return false;
    this.clearAck(peer);
    if ("tp" in path) this.emit(path.tp.id, this.frame(peer, kind, s, body), kind);
    else this.viaRelay(path.relay, peer, kind, s, body);
    return true;
  }

  private enqueue(peer: Peer, kind: string, body: string, now: number): void {
    if (peer.outbox.length >= T.OUTBOX_CAP) {
      // Par sumido há muito tempo: zera o outbox e manda `rst` até o ack; o app reenvia snapshots.
      peer.outbox = [];
      peer.rst = peer.seq;
      peer.backoff = 0;
      peer.overflowed = true;
    }
    const frame: OutFrame = { s: peer.seq, k: kind, body, sentAt: NEVER };
    peer.seq += 1;
    peer.outbox.push(frame);
    if (this.transmit(peer, frame.k, frame.s, frame.body, now)) frame.sentAt = now;
  }

  private flushOutbox(peer: Peer, now: number): void {
    if (!peer.outbox.length || peer.inc === 0) return;
    const path = this.pathFor(peer, now);
    if (!path) return;
    // Link novo: o outbox inteiro, em ordem (pelo relay, só uma rajada: o teto de banda cortaria o resto).
    const count = "tp" in path ? peer.outbox.length : Math.min(T.RETRANSMIT_BURST, peer.outbox.length);
    for (let index = 0; index < count; index += 1) {
      const frame = peer.outbox[index];
      if (this.transmit(peer, frame.k, frame.s, frame.body, now)) frame.sentAt = now;
    }
  }

  private retransmit(peer: Peer, now: number): void {
    if (!peer.outbox.length || peer.inc === 0) return;
    const oldest = peer.outbox[0];
    const never = oldest.sentAt === NEVER;
    if (!never) {
      const base = Math.max(T.RETRANSMIT_MIN_MS, 2 * (median(peer.rtts) ?? 0));
      const wait = Math.min(T.RETRANSMIT_MAX_MS, base * 2 ** peer.backoff);
      if (now - oldest.sentAt < wait) return;
    }
    let sent = false;
    const count = Math.min(T.RETRANSMIT_BURST, peer.outbox.length);
    for (let index = 0; index < count; index += 1) {
      const frame = peer.outbox[index];
      if (this.transmit(peer, frame.k, frame.s, frame.body, now)) {
        frame.sentAt = now;
        sent = true;
      }
    }
    if (sent && !never) peer.backoff = Math.min(peer.backoff + 1, 8);
  }

  private ack(peer: Peer, upTo: number): void {
    let removed = 0;
    while (peer.outbox.length && peer.outbox[0].s <= upTo) {
      peer.outbox.shift();
      removed += 1;
    }
    if (removed) peer.backoff = 0;
    if (peer.rst !== null && upTo >= peer.rst - 1) peer.rst = null;
  }

  private scheduleAck(peer: Peer): void {
    if (peer.ackTimer !== null) return;
    peer.ackTimer = this.clock.setTimeout(() => {
      peer.ackTimer = null;
      if (!this.dead && peer.inc !== 0) this.transmit(peer, "ack", 0, "{}", this.clock.now());
    }, ACK_DELAY_MS);
  }

  private clearAck(peer: Peer): void {
    if (peer.ackTimer === null) return;
    this.clock.clearTimeout(peer.ackTimer);
    peer.ackTimer = null;
  }

  private lossyToAll(kind: "away" | "back"): void {
    const now = this.clock.now();
    for (const peer of this.peers.values()) if (peer.everHeard) this.transmit(peer, kind, 0, "{}", now);
  }

  private okList(now: number): string[] {
    const ok: string[] = [];
    for (const peer of this.peers.values()) {
      if (this.directTp(peer) && now - peer.lastHeardDirect <= T.UNSTABLE_MS) ok.push(peer.playerId);
    }
    return ok;
  }

  /** hb direto quando há link, e também pelo relay quando o direto sumiu (assim o direto que voltar é notado). */
  private heartbeat(peer: Peer, now: number, ok: string[]): void {
    const tp = this.directTp(peer);
    const relay = this.relayNeeded(peer, now) && (this.roster.has(peer.playerId) || peer.everHeard) ? this.relayFor(peer, now) : null;
    if (!tp && !relay) return;
    const body: HbBody = {
      now: this.wallNow(),
      echo: peer.echo ? { now: peer.echo.now, held: Math.max(0, now - peer.echo.at) } : null,
      vis: this.vis,
      ok,
      m: this.progress,
    };
    const json = JSON.stringify(body);
    const rst = peer.rst !== null && peer.inc !== 0 ? JSON.stringify({ s: peer.rst }) : null;
    this.clearAck(peer);
    if (tp) {
      this.emit(tp.id, this.frame(peer, "hb", 0, json), "hb");
      if (rst) this.emit(tp.id, this.frame(peer, "rst", 0, rst), "rst");
    }
    if (relay) {
      this.viaRelay(relay, peer, "hb", 0, json);
      if (rst) this.viaRelay(relay, peer, "rst", 0, rst);
    }
  }

  // -------------------------------------------------------------------------
  // Saúde
  // -------------------------------------------------------------------------

  private computeHealth(peer: Peer, now: number): PeerHealth {
    if (!peer.everHeard) return "lost";
    const silence = now - peer.lastHeard;
    if (peer.forcedLost || silence > T.LOST_MS) return "lost";
    if (peer.away) return "away";
    if (silence > T.UNSTABLE_MS) return "unstable";
    return "ok";
  }

  private updateHealth(peer: Peer, now: number = this.clock.now()): void {
    const health = this.computeHealth(peer, now);
    if (health === peer.health) return;
    peer.health = health;
    if (health === "lost" && peer.direct === null) peer.relay = null;
    this.safe(() => this.onHealth(peer.playerId, health));
  }

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------

  private ensurePeer(playerId: string): Peer {
    let peer = this.peers.get(playerId);
    if (!peer) {
      const now = this.clock.now();
      peer = {
        playerId, inc: 0, pub: null, proof: null, direct: null, directGoneAt: now, lastHeard: NEVER, lastHeardDirect: NEVER,
        everHeard: false, forcedLost: false, next: 1, buffer: new Map(), chunk: null, ackTimer: null,
        seq: 1, outbox: [], backoff: 0, rst: null, overflowed: false,
        away: false, visT: NEVER, lastHb: null, echo: null, rtts: [], offsets: [], health: "lost", relay: null,
      };
      this.peers.set(playerId, peer);
    }
    return peer;
  }

  private emitLink(peer: Peer, reason: LinkReason): void {
    this.safe(() => this.onLink(peer.playerId, reason));
  }

  private appKind(kind: string): boolean {
    if (typeof kind === "string" && kind && !RESERVED.has(kind)) return true;
    refuse("tipo reservado da sessão", String(kind));
    return false;
  }

  private json(body: unknown, kind: string): string | null {
    try {
      return JSON.stringify(body) ?? "null";
    } catch {
      refuse("corpo não serializável", kind);
      return null;
    }
  }

  private safe(call: () => void): void {
    try {
      call();
    } catch (error) {
      console.error("[bobonline] callback da sessão", error);
    }
  }
}

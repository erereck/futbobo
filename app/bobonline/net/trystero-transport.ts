// Transporte de verdade: Trystero 0.26.0 (estratégia Nostr) com relays fixos e ICE do net.json.
//
// O módulo do Trystero só carrega com `await import("trystero")` no `open`, nunca no topo: fica
// fora do SSR, do prerender estático e do bundle inicial. A mesma configuração de relays vale
// para a página inteira (Trystero issue #207): `loadNetConfig` guarda a primeira.

import type { JoinRoomConfig, MessageAction, Room } from "trystero";
import { APP_ID, T } from "../protocol";
import type { NetConfig } from "./net-config";
import type { BobTransport, LinkCandidate } from "./transport";

type TrysteroModule = typeof import("trystero");

let modulePromise: Promise<TrysteroModule> | null = null;

function loadTrystero(): Promise<TrysteroModule> {
  modulePromise ??= import("trystero");
  modulePromise.catch(() => {
    modulePromise = null;
  });
  return modulePromise;
}

/** Configuração do joinRoom a partir do net.json (§3.1). */
export function trysteroConfig(cfg: NetConfig, code: string): JoinRoomConfig {
  return {
    appId: APP_ID,
    password: code, // cifra o SDP/ICE nos relays públicos (AES-GCM)
    relayConfig: cfg.nostrRelays ? { urls: cfg.nostrRelays } : { redundancy: cfg.redundancy ?? 5 },
    ...(cfg.iceServers ? { rtcConfig: { iceServers: cfg.iceServers } } : {}),
    ...(cfg.turn ? { turnConfig: cfg.turn } : {}),
  };
}

const CANDIDATES = new Set<LinkCandidate>(["host", "srflx", "prflx", "relay"]);

/**
 * Relay calado há tanto tempo: vai a sonda. O Trystero (Nostr) só anuncia a cada 60 s no regime, e um
 * socket "aberto" não prova nada (numa queda silenciosa o TCP segura o OPEN por minutos).
 */
const PROBE_AFTER_MS = 6000;
/** Sonda: um REQ do formato do próprio Trystero num tópico sem ninguém; o relay responde EOSE. Um por página. */
const PROBE_SUB = `bob-sonda-${Math.random().toString(36).slice(2, 10)}`;
const PROBE_TOPIC = `${APP_ID}/sonda/${PROBE_SUB}`;
/** Relays que fecharam a sonda (CLOSED: limite, regra do relay): nunca mais sondados (o tráfego normal segue valendo). */
const probeRefused = new WeakSet<WebSocket>();

/** O mesmo relógio da sessão (realClock em transport.ts, que importa este módulo). */
const monotonicNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

class TrysteroTransport implements BobTransport {
  readonly kind = "trystero" as const;
  readonly maxFrameBytes = T.MAX_FRAME_BYTES;
  onData: ((peer: string, data: string) => void) | null = null;
  onPeerJoin: ((peer: string) => void) | null = null;
  onPeerLeave: ((peer: string) => void) | null = null;
  onJoinError: ((info: { peer: string | null; reason: string }) => void) | null = null;

  private mod: TrysteroModule | null = null;
  private room: Room | null = null;
  private action: MessageAction<string> | null = null;
  private generation = 0;
  private signalingPaused = false;
  /** Último sinal de vida de algum relay (mensagem, abertura do socket); relógio monotônico. */
  private inboundAt: number | null = null;
  private probedAt = Number.NEGATIVE_INFINITY;
  /** Sockets dos relays com o ouvinte de entrada (o Trystero troca o socket a cada reconexão). */
  private readonly watched = new Set<WebSocket>();
  private readonly onInbound = (event: Event) => {
    this.inboundAt = monotonicNow();
    const data = (event as MessageEvent).data;
    if (typeof data === "string" && data.includes(PROBE_SUB) && /^\s*\[\s*"CLOSED"/.test(data)) probeRefused.add(event.target as WebSocket);
  };

  constructor(private readonly cfg: NetConfig) {}

  selfId(): string {
    return this.mod?.selfId ?? "";
  }

  open(room: { code: string }): void {
    const generation = ++this.generation;
    void this.connect(room.code, generation);
  }

  private async connect(code: string, generation: number): Promise<void> {
    let mod: TrysteroModule;
    try {
      mod = await loadTrystero();
    } catch (error) {
      console.error("[bobonline] não carregou o Trystero", error);
      if (generation === this.generation) this.onJoinError?.({ peer: null, reason: "carregar" });
      return;
    }
    if (generation !== this.generation) return;
    this.mod = mod;
    if (this.signalingPaused) mod.pauseRelayReconnection();
    const room = mod.joinRoom(trysteroConfig(this.cfg, code), code, {
      onJoinError: (details) => {
        if (generation === this.generation) this.onJoinError?.({ peer: details.peerId || null, reason: details.error });
      },
    });
    const action = room.makeAction<string>("bob");
    action.onMessage = (data, context) => {
      if (generation === this.generation && typeof data === "string") this.onData?.(context.peerId, data);
    };
    room.onPeerJoin = (peer) => {
      if (generation === this.generation) this.onPeerJoin?.(peer);
    };
    room.onPeerLeave = (peer) => {
      if (generation === this.generation) this.onPeerLeave?.(peer);
    };
    this.room = room;
    this.action = action;
  }

  async close(): Promise<void> {
    this.generation += 1;
    const room = this.room;
    this.room = null;
    this.action = null;
    for (const socket of this.watched) this.unwatch(socket);
    if (room) await room.leave().catch(() => undefined);
  }

  send(peer: string, data: string): void {
    // Nunca espera: send() resolve em silêncio para um par que sumiu e rejeita depois de 10 s
    // de contrapressão. A sessão reenvia.
    this.action?.send(data, { target: peer }).catch(() => undefined);
  }

  peers(): string[] {
    return this.room ? Object.keys(this.room.getPeers()) : [];
  }

  pauseSignaling(): void {
    this.signalingPaused = true;
    this.mod?.pauseRelayReconnection();
  }

  resumeSignaling(): void {
    this.signalingPaused = false;
    this.mod?.resumeRelayReconnection();
  }

  /** Algum relay com o socket aberto (a sessão ainda exige um sinal de vida recente: lastInboundAt). */
  signalingUp(): boolean {
    if (!this.mod || !this.room) return false;
    try {
      const sockets = Object.values(this.mod.getRelaySockets() as Record<string, WebSocket | undefined>)
        .filter((socket): socket is WebSocket => !!socket);
      this.watchRelays(sockets);
      return sockets.some((socket) => socket.readyState === 1);
    } catch {
      return false;
    }
  }

  lastInboundAt(): number | null {
    return this.inboundAt;
  }

  /**
   * Põe o ouvinte de entrada em cada socket novo e, com os relays calados há PROBE_AFTER_MS, manda a
   * sonda aos abertos (no máximo uma rodada por PROBE_AFTER_MS). Roda a cada chamada de signalingUp(),
   * que a sessão faz no tique dela (250 ms).
   */
  private watchRelays(sockets: WebSocket[]): void {
    const now = monotonicNow();
    for (const socket of this.watched) if (socket.readyState === 3 && !sockets.includes(socket)) this.unwatch(socket);
    for (const socket of sockets) {
      if (this.watched.has(socket)) continue;
      this.watched.add(socket);
      socket.addEventListener("message", this.onInbound);
      socket.addEventListener("open", this.onInbound);
      // Já aberto quando o vi (relay de uma sala anterior desta página): vale como sinal agora; a sonda confirma em PROBE_AFTER_MS.
      if (socket.readyState === 1) this.inboundAt ??= now;
    }
    if (!this.mod || (this.inboundAt !== null && now - this.inboundAt < PROBE_AFTER_MS) || now - this.probedAt < PROBE_AFTER_MS) return;
    const open = sockets.filter((socket) => socket.readyState === 1 && !probeRefused.has(socket));
    if (!open.length) return;
    this.probedAt = now;
    const probe = this.mod.subscribe(PROBE_SUB, PROBE_TOPIC);
    for (const socket of open) {
      try {
        socket.send(probe);
      } catch {
        // Fechou no meio: a próxima rodada vê.
      }
    }
  }

  private unwatch(socket: WebSocket): void {
    socket.removeEventListener("message", this.onInbound);
    socket.removeEventListener("open", this.onInbound);
    this.watched.delete(socket);
  }

  async linkInfo(peer: string): Promise<{ candidate: LinkCandidate; rttMs: number | null }> {
    const connection = this.room?.getPeers()[peer];
    if (!connection) return { candidate: "unknown", rttMs: null };
    try {
      const stats = await connection.getStats();
      let pairId: string | undefined;
      stats.forEach((report: { type?: string; selectedCandidatePairId?: string }) => {
        if (report.type === "transport" && report.selectedCandidatePairId) pairId = report.selectedCandidatePairId;
      });
      type Pair = { localCandidateId?: string; currentRoundTripTime?: number };
      let pair = pairId ? (stats.get(pairId) as Pair | undefined) : undefined;
      if (!pair) {
        // Firefox não traz selectedCandidatePairId: o par nomeado e bem-sucedido serve.
        stats.forEach((report: { type?: string; nominated?: boolean; state?: string }) => {
          if (!pair && report.type === "candidate-pair" && report.nominated && report.state === "succeeded") pair = report as Pair;
        });
      }
      const local = pair?.localCandidateId ? (stats.get(pair.localCandidateId) as { candidateType?: string } | undefined) : undefined;
      const type = local?.candidateType as LinkCandidate | undefined;
      const rtt = pair?.currentRoundTripTime;
      return { candidate: type && CANDIDATES.has(type) ? type : "unknown", rttMs: typeof rtt === "number" ? Math.round(rtt * 1000) : null };
    } catch {
      return { candidate: "unknown", rttMs: null };
    }
  }
}

export function createTrysteroTransport(cfg: NetConfig): BobTransport {
  return new TrysteroTransport(cfg);
}

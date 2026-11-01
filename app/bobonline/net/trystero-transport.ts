// Transporte de verdade: Trystero 0.26.0 (estratégia Nostr vendorizada em nostr-strategy.ts, com
// relógio corrigido, since folgado e vigia dos sockets) com relays fixos e ICE do net.json.
//
// O módulo da estratégia (core do Trystero e secp256k1 junto) só carrega com
// `await import("./nostr-strategy")` no `open`, nunca no topo: fica fora do SSR, do prerender
// estático e do bundle inicial. A mesma configuração de relays vale para a página inteira (Trystero
// issue #207): `loadNetConfig` fixa os relays da primeira.

import type { JoinRoomConfig, MessageAction, Room } from "@trystero-p2p/core";
import { APP_ID, T } from "../protocol";
import { CLOCK_FIX_MIN_MS, netClockOffsetMs, type NetConfig } from "./net-config";
import type { BobTransport, IcePolicy, LinkCandidate, RelayHealth } from "./transport";

type StrategyModule = typeof import("./nostr-strategy");

let modulePromise: Promise<StrategyModule> | null = null;

function loadStrategy(): Promise<StrategyModule> {
  modulePromise ??= import("./nostr-strategy");
  modulePromise.catch(() => {
    modulePromise = null;
  });
  return modulePromise;
}

/** Há algum TURN para a política "relay" usar? Sem ele, só-relay não teria candidato nenhum. */
function hasTurn(cfg: NetConfig): boolean {
  const urls = (servers: Array<{ urls: string | string[] }> | undefined) =>
    (servers ?? []).flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]));
  return [...urls(cfg.turn), ...urls(cfg.iceServers as Array<{ urls: string | string[] }> | undefined)].some((url) => /^turns?:/.test(url));
}

/**
 * Configuração do joinRoom a partir do net.json (§3.1). Com a política "relay", o rtcConfig leva só
 * `iceTransportPolicy`: o Trystero espalha o rtcConfig por cima de {iceServers: STUN padrão + TURN},
 * então o TURN continua lá (pôr iceServers aqui substituiria tudo). Sem TURN nenhum, "relay" é ignorada.
 */
export function trysteroConfig(cfg: NetConfig, code: string, policy: IcePolicy = "all"): JoinRoomConfig {
  const relayOnly = policy === "relay" && hasTurn(cfg);
  const rtcConfig: RTCConfiguration | null = cfg.iceServers || relayOnly
    ? { ...(cfg.iceServers ? { iceServers: cfg.iceServers } : {}), ...(relayOnly ? { iceTransportPolicy: "relay" as const } : {}) }
    : null;
  return {
    appId: APP_ID,
    password: code, // cifra o SDP/ICE nos relays públicos (AES-GCM)
    // manualReconnection: o watchOnline do core não mexe na pausa; os sockets são da nossa estratégia.
    relayConfig: cfg.nostrRelays ? { urls: cfg.nostrRelays, manualReconnection: true } : { redundancy: cfg.redundancy ?? 5, manualReconnection: true },
    ...(rtcConfig ? { rtcConfig } : {}),
    ...(cfg.turn ? { turnConfig: cfg.turn } : {}),
  };
}

const CANDIDATES = new Set<LinkCandidate>(["host", "srflx", "prflx", "relay"]);

/** O mesmo relógio da sessão (realClock em transport.ts) e da estratégia. */
const monotonicNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

class TrysteroTransport implements BobTransport {
  readonly kind = "trystero" as const;
  readonly maxFrameBytes = T.MAX_FRAME_BYTES;
  onData: ((peer: string, data: string) => void) | null = null;
  onPeerJoin: ((peer: string) => void) | null = null;
  onPeerLeave: ((peer: string) => void) | null = null;
  onJoinError: ((info: { peer: string | null; reason: string }) => void) | null = null;

  private mod: StrategyModule | null = null;
  private room: Room | null = null;
  private action: MessageAction<string> | null = null;
  private generation = 0;
  private signalingPaused = false;
  private icePolicy: IcePolicy = "all";
  /** Início do último open (relógio monotônico): sinais de par mais velhos são de outra tentativa. */
  private openedAt: number | null = null;

  constructor(private readonly cfg: NetConfig) {}

  selfId(): string {
    return this.mod?.selfId ?? "";
  }

  open(room: { code: string }): void {
    const generation = ++this.generation;
    this.openedAt = monotonicNow();
    void this.connect(room.code, generation);
  }

  private async connect(code: string, generation: number): Promise<void> {
    let mod: StrategyModule;
    try {
      mod = await loadStrategy();
    } catch (error) {
      console.error("[bobonline] não carregou o Trystero", error);
      if (generation === this.generation) this.onJoinError?.({ peer: null, reason: "carregar" });
      return;
    }
    if (generation !== this.generation) return;
    this.mod = mod;
    // Relógio medido pelo Date do net.json: desvio pequeno é ruído da medida (resolução de 1 s).
    const offset = netClockOffsetMs();
    mod.setClockOffset(offset !== null && Math.abs(offset) >= CLOCK_FIX_MIN_MS ? offset : 0);
    // A pausa da estratégia é global da página: o transporte novo começa no estado DELE, não no da sala
    // anterior (uma busca que desistiu com o app em segundo plano deixava os relays presos na pausa, e
    // todo "Tentar de novo" dava "sem-rede"). O resume também disca já os que esperavam por ele.
    if (this.signalingPaused) mod.pauseRelayReconnection();
    else mod.resumeRelayReconnection();
    const room = mod.joinRoom(trysteroConfig(this.cfg, code, this.icePolicy), code, {
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

  /** Algum relay aberto E fresco (respondeu nos últimos 20 s; a estratégia sonda os calados e larga os mortos). */
  signalingUp(): boolean {
    if (!this.mod || !this.room) return false;
    try {
      return this.mod.relayHealth().fresh > 0;
    } catch {
      return false;
    }
  }

  lastInboundAt(): number | null {
    return this.mod?.lastInboundAt() ?? null;
  }

  setIcePolicy(policy: IcePolicy): void {
    this.icePolicy = policy;
  }

  relayHealth(): RelayHealth {
    if (this.mod) return this.mod.relayHealth();
    return { total: this.cfg.nostrRelays?.length ?? 0, open: 0, fresh: 0 };
  }

  peerSignalAt(): number | null {
    const at = this.mod?.lastPeerEventAt() ?? null;
    return at !== null && this.openedAt !== null && at >= this.openedAt ? at : null;
  }

  kickSignaling(force = true): void {
    this.mod?.kickRelays(force);
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
      type Pair = { localCandidateId?: string; remoteCandidateId?: string; currentRoundTripTime?: number };
      let pair = pairId ? (stats.get(pairId) as Pair | undefined) : undefined;
      if (!pair) {
        // Firefox não traz selectedCandidatePairId: o par nomeado e bem-sucedido serve.
        stats.forEach((report: { type?: string; nominated?: boolean; state?: string }) => {
          if (!pair && report.type === "candidate-pair" && report.nominated && report.state === "succeeded") pair = report as Pair;
        });
      }
      const typeOf = (id: string | undefined) => (id ? (stats.get(id) as { candidateType?: string } | undefined)?.candidateType : undefined);
      // O caminho passa pelo TURN se QUALQUER ponta está nele: quem não usa o relay tem local srflx/prflx, e
      // a sala dizia "direto · 420 ms" de um lado e "via apoio" do outro (r-hostile, 1ª tentativa sem candidato).
      const type = (typeOf(pair?.remoteCandidateId) === "relay" ? "relay" : typeOf(pair?.localCandidateId)) as LinkCandidate | undefined;
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

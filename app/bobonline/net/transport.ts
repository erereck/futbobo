// Transporte do Bobonline (§3.1): entrega quadros (strings JSON) entre aparelhos de uma sala.
//
// Melhor esforço: a confiabilidade (seq, ack, reenvio, ordem) é da sessão (net/session.ts),
// então os três transportes (Trystero, memória, BroadcastChannel) são intercambiáveis.

import { devProfile } from "../storage";
import { createBroadcastTransport } from "./broadcast-transport";
import type { NetConfig } from "./net-config";
import { createTrysteroTransport } from "./trystero-transport";

export type LinkCandidate = "host" | "srflx" | "prflx" | "relay" | "unknown";

/**
 * Relógio da camada de rede. `now` é monotônico (ms) e serve para silêncio, reenvio e escada;
 * a hora de parede (`Date.now`) só vai no fio. O transporte de memória traz um relógio virtual,
 * que a sessão e a escada adotam sozinhas: os testes não têm timer de verdade.
 */
export type NetClock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

/** Relógio de verdade (navegador e Node). */
export const realClock: NetClock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface BobTransport {
  readonly kind: "trystero" | "memory" | "broadcast";
  /** Maior quadro que o transporte entrega inteiro e em ordem com os demais (Trystero: 16.348 bytes inline; usamos 16.000). */
  readonly maxFrameBytes: number;
  /** Relógio virtual (só o transporte de memória). Sem ele, a sessão usa `realClock`. */
  readonly clock?: NetClock;
  selfId(): string;                                     // id deste aparelho no transporte (Trystero `selfId`)
  open(room: { code: string }): void;
  close(): Promise<void>;
  send(peer: string, data: string): void;              // melhor esforço; confiabilidade é da sessão
  onData: ((peer: string, data: string) => void) | null;
  onPeerJoin: ((peer: string) => void) | null;
  onPeerLeave: ((peer: string) => void) | null;
  /** Trystero: SDP trocado e o ICE não fechou (ou TTL de 23,3 s). `peer` é o id de transporte do outro lado. */
  onJoinError: ((info: { peer: string | null; reason: string }) => void) | null;
  peers(): string[];
  pauseSignaling(): void;
  resumeSignaling(): void;
  signalingUp(): boolean;                               // algum relay aberto
  /**
   * Último sinal de vida dos relays (no relógio da sessão); null = nada ainda. Sem o método (BroadcastChannel),
   * o socket aberto basta. Com ele, a sessão só dá a sinalização como no ar com algo recente (RELAY_SILENT_MS).
   */
  lastInboundAt?(): number | null;
  linkInfo(peer: string): Promise<{ candidate: LinkCandidate; rttMs: number | null }>;
}
export type TransportFactory = (cfg: NetConfig) => BobTransport;

/**
 * Transporte da página: BroadcastChannel só com perfil de teste (`?perfil=A`) e `?bobnet=bc`
 * (E2E no navegador, sem rede); senão Trystero (o módulo do Trystero só carrega no `open`).
 */
export function defaultTransportFactory(): TransportFactory {
  if (devProfile() !== null) {
    try {
      if (new URLSearchParams(window.location.search).get("bobnet") === "bc") return createBroadcastTransport;
    } catch {
      // Sem location: fica no Trystero.
    }
  }
  return createTrysteroTransport;
}

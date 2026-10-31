// Transporte de desenvolvimento por BroadcastChannel (§3.1): só no E2E do navegador, com perfil
// de teste (`?perfil=A`) e `?bobnet=bc`. Cada perfil numa janela é um "aparelho" simulado; tudo
// fica na mesma origem e no mesmo contexto do navegador, sem rede nenhuma.
//
// Mensagens no canal `bobonline-dev-<código>`: hi (anúncio), here (resposta), ping (a cada 2 s,
// vivo), data (quadro para um id), bye (saída limpa, como o beforeunload do Trystero).
// Um par mudo por 10 s vira onPeerLeave (o Trystero leva ≈ 11,6 s numa morte abrupta).

import { T } from "../protocol";
import { devProfile } from "../storage";
import type { NetConfig } from "./net-config";
import type { BobTransport, LinkCandidate } from "./transport";

type DevMessage =
  | { t: "hi" | "ping" | "bye"; from: string }
  | { t: "here"; from: string; to: string }
  | { t: "data"; from: string; to: string; data: string };

const PING_MS = 2000;
const SILENT_LEAVE_MS = 10_000;

class BroadcastTransport implements BobTransport {
  readonly kind = "broadcast" as const;
  readonly maxFrameBytes = T.MAX_FRAME_BYTES;
  onData: ((peer: string, data: string) => void) | null = null;
  onPeerJoin: ((peer: string) => void) | null = null;
  onPeerLeave: ((peer: string) => void) | null = null;
  onJoinError: ((info: { peer: string | null; reason: string }) => void) | null = null;

  private readonly id = `${devProfile() ?? "dev"}-${Math.random().toString(36).slice(2, 8)}`;
  private channel: BroadcastChannel | null = null;
  private readonly lastSeen = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private readonly onPageHide = () => this.post({ t: "bye", from: this.id });

  selfId(): string {
    return this.id;
  }

  open(room: { code: string }): void {
    if (this.channel || typeof BroadcastChannel !== "function") return;
    const channel = new BroadcastChannel(`bobonline-dev-${room.code}`);
    channel.onmessage = (event: MessageEvent) => this.handle(event.data as DevMessage);
    this.channel = channel;
    this.post({ t: "hi", from: this.id });
    this.timer = setInterval(() => this.tick(), PING_MS);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
  }

  async close(): Promise<void> {
    if (!this.channel) return;
    this.post({ t: "bye", from: this.id });
    this.channel.close();
    this.channel = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
    this.lastSeen.clear();
  }

  send(peer: string, data: string): void {
    if (this.lastSeen.has(peer)) this.post({ t: "data", from: this.id, to: peer, data });
  }

  peers(): string[] {
    return [...this.lastSeen.keys()];
  }

  pauseSignaling(): void {
    this.paused = true;
  }

  resumeSignaling(): void {
    if (!this.paused) return;
    this.paused = false;
    this.post({ t: "hi", from: this.id });
  }

  signalingUp(): boolean {
    return this.channel !== null && !this.paused;
  }

  async linkInfo(peer: string): Promise<{ candidate: LinkCandidate; rttMs: number | null }> {
    return { candidate: this.lastSeen.has(peer) ? "host" : "unknown", rttMs: null };
  }

  private post(message: DevMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // Canal fechado no meio: melhor esforço.
    }
  }

  private join(peer: string): void {
    const known = this.lastSeen.has(peer);
    this.lastSeen.set(peer, Date.now());
    if (!known) this.onPeerJoin?.(peer);
  }

  private handle(message: DevMessage): void {
    if (!message || typeof message !== "object" || message.from === this.id) return;
    switch (message.t) {
      case "hi":
        // Pausado (pause do Capacitor) não responde a anúncios novos, como relays parados.
        if (this.paused) return;
        this.post({ t: "here", from: this.id, to: message.from });
        this.join(message.from);
        return;
      case "here":
        if (message.to === this.id && !this.paused) this.join(message.from);
        return;
      case "ping":
        if (this.lastSeen.has(message.from)) this.lastSeen.set(message.from, Date.now());
        else if (!this.paused) {
          this.post({ t: "here", from: this.id, to: message.from });
          this.join(message.from);
        }
        return;
      case "data":
        if (message.to !== this.id || !this.lastSeen.has(message.from)) return;
        this.lastSeen.set(message.from, Date.now());
        this.onData?.(message.from, message.data);
        return;
      case "bye":
        if (this.lastSeen.delete(message.from)) this.onPeerLeave?.(message.from);
        return;
    }
  }

  private tick(): void {
    this.post({ t: "ping", from: this.id });
    const now = Date.now();
    for (const [peer, seen] of [...this.lastSeen]) {
      if (now - seen > SILENT_LEAVE_MS) {
        this.lastSeen.delete(peer);
        this.onPeerLeave?.(peer);
      }
    }
  }
}

export function createBroadcastTransport(cfg: NetConfig): BobTransport {
  void cfg; // o canal local não usa relays nem ICE
  return new BroadcastTransport();
}

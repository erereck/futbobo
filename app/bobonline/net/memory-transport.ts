// Transporte em memória para os testes em Node (§3.1): vários "aparelhos" numa sala, com
// latência, jitter, perda, partição, erro de ICE, sinalização fora do ar, morte e volta.
// Também imita os métodos opcionais do Trystero que a sala usa na busca: política de ICE
// (só o servidor de apoio), sinal de outro aparelho desde o último open e saúde dos relays.
//
// Relógio virtual: nada anda sem `advance(ms)`, e a sessão/escada adotam `transport.clock`.
// `advance` é assíncrono porque a WebCrypto do Node resolve fora das microtarefas: entre um
// evento e outro ele espera a cripto pendente (identity.ts) zerar. Nunca entra no bundle do app.

import { T } from "../protocol";
import { cryptoInFlight } from "./identity";
import type { BobTransport, IcePolicy, LinkCandidate, NetClock, RelayHealth } from "./transport";

type HubOptions = {
  seed?: number;
  /** Atraso da sinalização até o onPeerJoin (ms). */
  signalMs?: number;
  /** Depois de `kill`, quanto até os outros receberem onPeerLeave (medido no Trystero: 11,6 s). */
  deathLeaveMs?: number;
};

type QueuedEvent = { at: number; order: number; run: () => void; cancelled: boolean };

type Device = {
  name: string;
  alive: boolean;
  signaling: boolean;
  /** Queda silenciosa: o socket do relay segue "aberto", mas nada chega (nem encontro novo). */
  silent: boolean;
  /** Último sinal de vida do relay enquanto ele está calado ou fora (no ar, é o relógio do hub). */
  inboundAt: number | null;
  loads: number;
  current: MemoryTransport | null;
  /** Saúde dos relays que `relayHealth()` relata (null: o transporte não tem o método, como sem relays). */
  relays: RelayHealth | null;
};

/** Erro de ICE entre dois aparelhos: "all" sempre; "direct" só sem o servidor de apoio (um lado em "relay" fecha). */
type JoinErrorMode = "all" | "direct";

export type MemoryHub = {
  /** Uma nova carga de página do aparelho `name` (selfId novo a cada chamada). */
  transport(name: string): BobTransport;
  setLatency(a: string, b: string, ms: number, jitterMs?: number): void;
  setLoss(a: string, b: string, p: number): void;
  /** Descarta em silêncio os quadros entre a e b, nos dois sentidos (como um link morrendo). */
  partition(a: string, b: string, on: boolean): void;
  /**
   * Daqui em diante a e b trocam SDP mas o ICE não fecha: onJoinError nos dois. "direct": só a conexão
   * direta falha (CGNAT dos dois lados); com um dos lados em política "relay" o link fecha pelo apoio.
   * `afterMs`: o erro chega calado depois disto, como no Trystero (23,3 s depois da troca de SDP); o lado
   * que fechou ou reabriu a sala antes disso não recebe nada (o room.leave cala o Trystero).
   */
  joinError(a: string, b: string, on?: boolean | "direct", afterMs?: number): void;
  /**
   * Sinalização do aparelho: no ar, fora (socket fechado) ou "silent" (queda silenciosa: o socket segue
   * aberto, mas o relógio de entrada para e ninguém novo se encontra; com `partition` é o aparelho isolado).
   */
  signaling(name: string, up: boolean | "silent"): void;
  /** A página do aparelho para (crash/congelada): sem quadros; os outros veem onPeerLeave depois de deathLeaveMs. */
  kill(name: string): void;
  /** A mesma página volta (descongelou): re-anuncia e religa com quem já tinha caído. */
  revive(name: string): void;
  /** Política de ICE em vigor na carga atual do aparelho (a do último open). */
  icePolicy(name: string): IcePolicy;
  /** Quantas vezes a carga atual do aparelho abriu a sala (connect + cada rejoin). */
  opens(name: string): number;
  /** Outro aparelho deu sinal agora nos tópicos da sala (uma negociação andando, sem fechar nem falhar). */
  touchSignal(name: string): void;
  /** Saúde dos relays do aparelho (null: sem o método `relayHealth`, o padrão em memória). */
  relays(name: string, health: RelayHealth | null): void;
  advance(ms: number): Promise<void>;
  /** Espera a cripto e as microtarefas pendentes, sem andar o relógio. */
  settle(): Promise<void>;
  now(): number;
  readonly clock: NetClock;
  /** Todo quadro entregue ao transporte (antes de perda/partição): para medir tamanhos. */
  onFrame: ((from: string, to: string, data: string) => void) | null;
  /** Quadros maiores que maxFrameBytes que algum aparelho tentou mandar. */
  oversize(): number;
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const waitTurn = () =>
  new Promise<void>((resolve) => {
    if (typeof setImmediate === "function") setImmediate(resolve);
    else setTimeout(resolve, 0);
  });

class MemoryTransport implements BobTransport {
  readonly kind = "memory" as const;
  readonly maxFrameBytes = T.MAX_FRAME_BYTES;
  readonly clock: NetClock;
  onData: ((peer: string, data: string) => void) | null = null;
  onPeerJoin: ((peer: string) => void) | null = null;
  onPeerLeave: ((peer: string) => void) | null = null;
  onJoinError: ((info: { peer: string | null; reason: string }) => void) | null = null;
  room: string | null = null;
  readonly linked = new Set<string>();
  /** A política em vigor (a do último open) e a que vale no próximo. */
  policy: IcePolicy = "all";
  private nextPolicy: IcePolicy = "all";
  /** Último encontro com outro aparelho desde o último open (relógio do hub). */
  signalAt: number | null = null;
  openCount = 0;
  kicks = 0;
  /** Dos kicks, os periódicos (force: false: o backoff dos relays seguiria valendo). */
  softKicks = 0;
  /** Só existe com `hub.relays(nome, saúde)`: sem ele a sessão relata null, como um transporte sem relays. */
  relayHealth?: () => RelayHealth;
  /** Pares que caíram enquanto esta página estava morta (recebe o onPeerLeave ao voltar). */
  readonly droppedWhileDead = new Set<string>();

  constructor(
    private readonly hub: HubImpl,
    readonly device: Device,
    readonly id: string,
  ) {
    this.clock = hub.clock;
  }

  selfId(): string {
    return this.id;
  }
  open(room: { code: string }): void {
    this.room = room.code;
    this.policy = this.nextPolicy;
    this.signalAt = null;
    this.openCount += 1;
    this.hub.announce(this);
  }
  async close(): Promise<void> {
    this.hub.leave(this);
    this.room = null;
  }
  send(peer: string, data: string): void {
    this.hub.send(this, peer, data);
  }
  peers(): string[] {
    return [...this.linked];
  }
  pauseSignaling(): void {
    // A sinalização em memória não reconecta sozinha: nada a pausar.
  }
  resumeSignaling(): void {
    // Idem.
  }
  signalingUp(): boolean {
    return this.room !== null && this.device.alive && this.device.signaling;
  }
  lastInboundAt(): number | null {
    const device = this.device;
    return device.alive && device.signaling && !device.silent ? this.hub.now() : device.inboundAt;
  }
  async linkInfo(peer: string): Promise<{ candidate: LinkCandidate; rttMs: number | null }> {
    const other = this.hub.byId.get(peer);
    if (!other || !this.linked.has(peer)) return { candidate: "unknown", rttMs: null };
    return { candidate: this.hub.routeOf(this.id, peer), rttMs: 2 * this.hub.latencyOf(this.device.name, other.device.name).ms };
  }
  setIcePolicy(policy: IcePolicy): void {
    this.nextPolicy = policy;
  }
  peerSignalAt(): number | null {
    return this.signalAt;
  }
  kickSignaling(force = true): void {
    this.kicks += 1;
    if (!force) this.softKicks += 1;
  }
}

class HubImpl implements MemoryHub {
  private time = 0;
  private order = 0;
  private readonly queue: QueuedEvent[] = [];
  private readonly random: () => number;
  private readonly signalMs: number;
  private readonly deathLeaveMs: number;
  private readonly devices = new Map<string, Device>();
  readonly byId = new Map<string, MemoryTransport>();
  private readonly latency = new Map<string, { ms: number; jitterMs: number }>();
  private readonly loss = new Map<string, number>();
  private readonly partitions = new Set<string>();
  private readonly joinErrors = new Map<string, { mode: JoinErrorMode; afterMs: number }>();
  /** Rota de cada link (par de ids de transporte): pelo apoio quando um lado só aceita relay ou o direto falha. */
  private readonly routes = new Map<string, "host" | "relay">();
  private oversized = 0;
  onFrame: ((from: string, to: string, data: string) => void) | null = null;

  readonly clock: NetClock = {
    now: () => this.time,
    setTimeout: (fn, ms) => this.schedule(Math.max(0, Number.isFinite(ms) ? ms : 0), fn),
    clearTimeout: (handle) => {
      if (handle && typeof handle === "object") (handle as QueuedEvent).cancelled = true;
    },
  };

  constructor(options: HubOptions) {
    this.random = mulberry32(options.seed ?? 1);
    this.signalMs = options.signalMs ?? 300;
    this.deathLeaveMs = options.deathLeaveMs ?? 11600;
  }

  now(): number {
    return this.time;
  }

  oversize(): number {
    return this.oversized;
  }

  schedule(delay: number, run: () => void): QueuedEvent {
    const event: QueuedEvent = { at: this.time + delay, order: this.order++, run, cancelled: false };
    // Inserção ordenada (at, order): filas pequenas nos testes.
    let index = this.queue.length;
    while (index > 0) {
      const previous = this.queue[index - 1];
      if (previous.at < event.at || (previous.at === event.at && previous.order < event.order)) break;
      index -= 1;
    }
    this.queue.splice(index, 0, event);
    return event;
  }

  private device(name: string): Device {
    let device = this.devices.get(name);
    if (!device) {
      device = { name, alive: true, signaling: true, silent: false, inboundAt: null, loads: 0, current: null, relays: null };
      this.devices.set(name, device);
    }
    return device;
  }

  transport(name: string): BobTransport {
    const device = this.device(name);
    device.loads += 1;
    const transport = new MemoryTransport(this, device, device.loads === 1 ? name : `${name}~${device.loads}`);
    const health = device.relays;
    if (health) transport.relayHealth = () => ({ ...health });
    device.current = transport;
    this.byId.set(transport.id, transport);
    return transport;
  }

  latencyOf(a: string, b: string): { ms: number; jitterMs: number } {
    return this.latency.get(pairKey(a, b)) ?? { ms: 0, jitterMs: 0 };
  }

  setLatency(a: string, b: string, ms: number, jitterMs = 0): void {
    this.latency.set(pairKey(a, b), { ms, jitterMs });
  }

  setLoss(a: string, b: string, p: number): void {
    this.loss.set(pairKey(a, b), p);
  }

  partition(a: string, b: string, on: boolean): void {
    if (on) this.partitions.add(pairKey(a, b));
    else this.partitions.delete(pairKey(a, b));
  }

  joinError(a: string, b: string, on: boolean | "direct" = true, afterMs = 0): void {
    if (on) this.joinErrors.set(pairKey(a, b), { mode: on === "direct" ? "direct" : "all", afterMs: Math.max(0, afterMs) });
    else this.joinErrors.delete(pairKey(a, b));
  }

  routeOf(a: string, b: string): "host" | "relay" {
    return this.routes.get(pairKey(a, b)) ?? "host";
  }

  icePolicy(name: string): IcePolicy {
    return this.device(name).current?.policy ?? "all";
  }

  opens(name: string): number {
    return this.device(name).current?.openCount ?? 0;
  }

  touchSignal(name: string): void {
    const current = this.device(name).current;
    if (current?.room) current.signalAt = this.time;
  }

  relays(name: string, health: RelayHealth | null): void {
    const device = this.device(name);
    device.relays = health;
    const current = device.current;
    if (!current) return;
    if (health) current.relayHealth = () => ({ ...health });
    else delete current.relayHealth;
  }

  signaling(name: string, up: boolean | "silent"): void {
    const device = this.device(name);
    // O relógio de entrada para onde estava (no ar, ele anda com o hub).
    if (device.alive && device.signaling && !device.silent) device.inboundAt = this.time;
    device.signaling = up !== false;
    device.silent = up === "silent";
    if (up === true) for (const transport of this.byId.values()) if (transport.device === device) this.announce(transport);
  }

  kill(name: string): void {
    const device = this.device(name);
    if (!device.alive) return;
    if (device.signaling && !device.silent) device.inboundAt = this.time;
    device.alive = false;
    this.schedule(this.deathLeaveMs, () => {
      if (device.alive) return;
      for (const transport of this.byId.values()) {
        if (transport.device !== device) continue;
        for (const peerId of [...transport.linked]) {
          const other = this.byId.get(peerId);
          transport.linked.delete(peerId);
          transport.droppedWhileDead.add(peerId);
          if (other) {
            other.linked.delete(transport.id);
            other.onPeerLeave?.(transport.id);
          }
        }
      }
    });
  }

  revive(name: string): void {
    const device = this.device(name);
    if (device.alive) return;
    device.alive = true;
    for (const transport of this.byId.values()) {
      if (transport.device !== device) continue;
      for (const peerId of transport.droppedWhileDead) transport.onPeerLeave?.(peerId);
      transport.droppedWhileDead.clear();
      this.announce(transport);
    }
  }

  /** Abre a sala: agenda o encontro com cada membro aberto que ainda não está ligado. */
  announce(transport: MemoryTransport): void {
    if (!transport.room) return;
    for (const other of this.byId.values()) {
      if (other === transport || other.room !== transport.room || transport.linked.has(other.id)) continue;
      this.schedule(this.signalMs + Math.floor(this.random() * 50), () => this.meet(transport, other));
    }
  }

  private meet(a: MemoryTransport, b: MemoryTransport): void {
    if (!a.room || a.room !== b.room || a.linked.has(b.id)) return;
    if (!a.device.alive || !b.device.alive || !a.device.signaling || !b.device.signaling || a.device.silent || b.device.silent) return;
    // Os dois se ouviram na sinalização (anúncio, oferta, resposta), feche ou não o ICE.
    a.signalAt = this.time;
    b.signalAt = this.time;
    const failure = this.joinErrors.get(pairKey(a.device.name, b.device.name));
    const mode = failure?.mode;
    const viaRelay = a.policy === "relay" || b.policy === "relay";
    if (failure && (mode === "all" || (mode === "direct" && !viaRelay))) {
      // Com afterMs, como o Trystero: calado até o prazo, e só para o lado que segue na mesma abertura da sala.
      const opens = [a.openCount, b.openCount];
      const report = () => {
        if (a.room !== null && a.openCount === opens[0]) a.onJoinError?.({ peer: b.id, reason: "ICE não fechou (simulado)" });
        if (b.room !== null && b.openCount === opens[1]) b.onJoinError?.({ peer: a.id, reason: "ICE não fechou (simulado)" });
      };
      if (failure.afterMs > 0) this.schedule(failure.afterMs, report);
      else report();
      return;
    }
    this.routes.set(pairKey(a.id, b.id), mode === "direct" || viaRelay ? "relay" : "host");
    a.linked.add(b.id);
    b.linked.add(a.id);
    a.onPeerJoin?.(b.id);
    b.onPeerJoin?.(a.id);
  }

  /** Saída limpa (beforeunload do Trystero): o outro lado recebe onPeerLeave na hora. */
  leave(transport: MemoryTransport): void {
    for (const peerId of [...transport.linked]) {
      const other = this.byId.get(peerId);
      transport.linked.delete(peerId);
      if (other && other.linked.delete(transport.id)) other.onPeerLeave?.(transport.id);
    }
  }

  send(from: MemoryTransport, to: string, data: string): void {
    this.onFrame?.(from.id, to, data);
    if (data.length * 3 > from.maxFrameBytes && new TextEncoder().encode(data).length > from.maxFrameBytes) this.oversized += 1;
    const target = this.byId.get(to);
    if (!target || !from.linked.has(to) || !from.device.alive || !target.device.alive) return;
    const pair = pairKey(from.device.name, target.device.name);
    if (this.partitions.has(pair)) return;
    const loss = this.loss.get(pair) ?? 0;
    if (loss > 0 && this.random() < loss) return;
    const { ms, jitterMs } = this.latencyOf(from.device.name, target.device.name);
    const delay = ms + (jitterMs > 0 ? (this.random() * 2 - 1) * jitterMs : 0);
    this.schedule(Math.max(0, delay), () => {
      if (!target.linked.has(from.id) || !from.device.alive || !target.device.alive) return;
      if (this.partitions.has(pair)) return;
      target.onData?.(from.id, data);
    });
  }

  async settle(): Promise<void> {
    for (let spins = 0; spins < 10_000; spins += 1) {
      await waitTurn();
      if (cryptoInFlight() === 0) {
        await waitTurn();
        if (cryptoInFlight() === 0) return;
      }
    }
    throw new Error("memory-transport: cripto pendente não terminou");
  }

  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    await this.settle();
    for (;;) {
      const next = this.queue[0];
      if (!next || next.at > end) break;
      this.queue.shift();
      if (next.cancelled) continue;
      this.time = next.at;
      next.run();
      await this.settle();
    }
    this.time = end;
    await this.settle();
  }
}

export function createMemoryHub(options: HubOptions = {}): MemoryHub {
  return new HubImpl(options);
}

// Figurinhas em 3D: com o Modo 3D ligado (e o modo desempenho desligado) o
// busto das figurinhas vira o boneco da partida. Este módulo é leve (sem
// three.js): decide o modo, guarda os retratos prontos e enfileira os pedidos.
// O estúdio WebGL (`sticker-portrait-studio`) só é baixado no primeiro pedido.
//
// Um renderer para todas as figurinhas (o navegador aceita poucos contextos
// WebGL): os retratos saem um a um, em fatias por quadro, e ficam em cache por
// aparência + cores + número + tamanho. Enquanto o retrato não chega (ou se o
// WebGL falhar), a figurinha mostra o busto 2D de sempre, no mesmo canvas.

import { useSyncExternalStore } from "react";
import { drawPlayerBust, type PlayerAppearance } from "../../player-appearance";
import { BOTAO3D_ENABLED_EVENT, BOTAO3D_PERFORMANCE_EVENT, readBotao3dPerformance, readBotao3dPreference, webglAvailable } from "../view-mode";
import type { PortraitShot, PortraitStudio } from "./sticker-portrait-studio";

export type BustLook = {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  /** Número no peito do boneco 3D; sem ele a camisa fica lisa. */
  number?: number | null;
};

// ------------------------------------------------------------------ modo

let pref3d = false;
let performanceOn = false;
let modeReadAt = Number.NEGATIVE_INFINITY;
const modeListeners = new Set<() => void>();

/** Lê o Modo 3D e o modo desempenho. Uma leitura serve a rajada de figurinhas que monta junto. */
function refreshMode(force: boolean) {
  const now = typeof performance === "undefined" ? Date.now() : performance.now();
  if (!force && now - modeReadAt < 1000) return;
  modeReadAt = now;
  const next3d = readBotao3dPreference();
  const nextPerformance = readBotao3dPerformance().enabled;
  if (next3d === pref3d && nextPerformance === performanceOn) return;
  pref3d = next3d;
  performanceOn = nextPerformance;
  for (const listener of [...modeListeners]) listener();
}

const onModeEvent = () => refreshMode(true);
/** Outra aba mexeu no ajuste (as chaves de view-mode.ts). */
const STORAGE_KEYS = new Set(["futbobo:settings:v1", "futbobo:botao3d", "futbobo:botao3d-performance"]);
const onStorage = (event: StorageEvent) => {
  if (event.key === null || STORAGE_KEYS.has(event.key)) refreshMode(true);
};

function subscribeMode(listener: () => void) {
  if (modeListeners.size === 0) {
    window.addEventListener(BOTAO3D_ENABLED_EVENT, onModeEvent);
    window.addEventListener(BOTAO3D_PERFORMANCE_EVENT, onModeEvent);
    window.addEventListener("storage", onStorage);
  }
  modeListeners.add(listener);
  // Cada figurinha que monta confere o ajuste (desligou o 3D nas configurações e voltou).
  refreshMode(false);
  return () => {
    modeListeners.delete(listener);
    if (modeListeners.size > 0) return;
    window.removeEventListener(BOTAO3D_ENABLED_EVENT, onModeEvent);
    window.removeEventListener(BOTAO3D_PERFORMANCE_EVENT, onModeEvent);
    window.removeEventListener("storage", onStorage);
  };
}

function readMode() {
  if (modeReadAt === Number.NEGATIVE_INFINITY) refreshMode(true);
}

const serverMode = () => false;

/** As figurinhas devem sair em 3D agora? Lê o ajuste na hora (para quem desenha fora do React, como o pôster). */
export function sticker3dEnabled(): boolean {
  if (typeof window === "undefined") return false;
  refreshMode(true);
  return pref3d && !performanceOn && !studioFailed;
}

/**
 * Mesmo valor como hook: `false` no servidor; acompanha os avisos do Modo 3D e
 * do modo desempenho. `view3d` troca o Modo 3D global por uma escolha própria
 * (o 2D/3D da home do Bobonline); o modo desempenho continua valendo.
 */
export function useSticker3d(view3d?: boolean): boolean {
  return useSyncExternalStore(subscribeMode, () => {
    readMode();
    return (view3d ?? pref3d) && !performanceOn;
  }, serverMode);
}

// --------------------------------------------------------------- retratos

type Job = {
  key: string;
  shot: PortraitShot;
  /** Figurinhas montadas esperando este retrato; zerou antes da vez, o pedido cai. */
  waiters: number;
  /** Pedido direto (pôster): sai mesmo sem figurinha esperando. */
  keep: boolean;
  promise: Promise<HTMLCanvasElement | null>;
  resolve: (portrait: HTMLCanvasElement | null) => void;
};

/** Retratos prontos, do mais antigo ao mais recente (LRU). 320² ≈ 400 KB cada. */
const ready = new Map<string, HTMLCanvasElement>();
const READY_LIMIT = 48;
const jobs = new Map<string, Job>();
const queue: Job[] = [];
/** Fatia de cada quadro para fotografar: o resto fica para a página respirar. */
const FRAME_BUDGET_MS = 10;
/** Sem pedidos por um tempo, o estúdio devolve o contexto WebGL (o cache fica). */
const IDLE_RELEASE_MS = 60000;

let studioPromise: Promise<PortraitStudio | null> | null = null;
let studioFailed = false;
let webglChecked = false;
let pumping = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Marcas de tempo no Performance do navegador (DevTools); nunca quebra o fluxo. */
function mark(name: string, start?: number) {
  try {
    if (start === undefined) performance.mark(name);
    else performance.measure(name, { start, end: performance.now() });
  } catch {
    // Navegador antigo sem a assinatura nova do measure.
  }
}

function portraitKey(look: BustLook, size: number) {
  return `${size}|${look.primary}|${look.secondary}|${look.number ?? "-"}|${JSON.stringify(look.appearance)}`;
}

function takeReady(key: string) {
  const portrait = ready.get(key);
  if (!portrait) return null;
  // Usado agora: vai para o fim da fila de descarte.
  ready.delete(key);
  ready.set(key, portrait);
  return portrait;
}

function remember(key: string, portrait: HTMLCanvasElement) {
  ready.set(key, portrait);
  while (ready.size > READY_LIMIT) {
    const oldest = ready.keys().next().value;
    if (oldest === undefined) break;
    ready.delete(oldest);
  }
}

function loadStudio(): Promise<PortraitStudio | null> {
  if (studioPromise) return studioPromise;
  if (!webglChecked) {
    webglChecked = true;
    // Sem WebGL nem baixa o three.js: as figurinhas ficam no 2D nesta sessão.
    if (!webglAvailable()) studioFailed = true;
  }
  if (studioFailed) return Promise.resolve(null);
  studioPromise = import("./sticker-portrait-studio")
    .then(async ({ PortraitStudio: Studio }) => {
      const studio = new Studio();
      await studio.warm();
      mark("sticker3d:studio-ready");
      return studio;
    })
    .catch(() => {
      // O contexto não veio (ou o pacote não baixou): as figurinhas ficam no 2D nesta sessão.
      studioFailed = true;
      return null;
    });
  return studioPromise;
}

function releaseStudioLater() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (pumping || queue.length > 0 || !studioPromise) return;
    const current = studioPromise;
    studioPromise = null;
    void current.then((studio) => studio?.dispose());
  }, IDLE_RELEASE_MS);
}

function settle(job: Job, portrait: HTMLCanvasElement | null) {
  jobs.delete(job.key);
  if (portrait) remember(job.key, portrait);
  job.resolve(portrait);
}

function schedulePump() {
  if (pumping) return;
  pumping = true;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  requestAnimationFrame(() => void pump());
}

async function pump() {
  let studio = await loadStudio();
  if (studio && !studio.alive) {
    // Contexto perdido (aba em segundo plano no celular, GPU reiniciada): monta outro.
    studio.dispose();
    studioPromise = null;
    studio = await loadStudio();
  }
  if (!studio) {
    for (const job of queue.splice(0)) settle(job, null);
    pumping = false;
    return;
  }
  const start = performance.now();
  while (queue.length > 0 && performance.now() - start < FRAME_BUDGET_MS) {
    const job = queue.shift()!;
    if (job.waiters <= 0 && !job.keep) {
      settle(job, null);
      continue;
    }
    let portrait: HTMLCanvasElement | null = null;
    const shotStart = performance.now();
    try {
      portrait = studio.shoot(job.shot);
    } catch {
      portrait = null;
    }
    mark("sticker3d:portrait", shotStart);
    settle(job, portrait);
  }
  if (queue.length > 0) {
    requestAnimationFrame(() => void pump());
    return;
  }
  pumping = false;
  releaseStudioLater();
}

function request(look: BustLook, size: number, keep: boolean): Job {
  const key = portraitKey(look, size);
  let job = jobs.get(key);
  if (!job) {
    let resolve!: (portrait: HTMLCanvasElement | null) => void;
    const promise = new Promise<HTMLCanvasElement | null>((done) => { resolve = done; });
    job = {
      key,
      shot: { appearance: look.appearance, primary: look.primary, secondary: look.secondary, number: look.number ?? null, size },
      waiters: 0,
      keep,
      promise,
      resolve,
    };
    jobs.set(key, job);
    queue.push(job);
    schedulePump();
  }
  if (keep) job.keep = true;
  return job;
}

/**
 * Retrato 3D avulso (pôster da carreira, compartilhamento): o mesmo enquadramento
 * do busto 2D num quadrado `size`×`size`, fundo transparente. Não olha o ajuste
 * do Modo 3D (veja `sticker3dEnabled`); `null` se o WebGL não estiver disponível.
 */
export async function renderStickerPortrait(
  appearance: PlayerAppearance,
  primary: string,
  secondary: string,
  options: { number?: number | null; size?: number } = {},
): Promise<HTMLCanvasElement | null> {
  if (typeof window === "undefined" || studioFailed) return null;
  const look: BustLook = { appearance, primary, secondary, number: options.number };
  const size = Math.round(options.size ?? 320);
  return takeReady(portraitKey(look, size)) ?? request(look, size, true).promise;
}

// ---------------------------------------------------------------- desenho

/** O que cada canvas mostra agora: com um retrato 3D na tela, a troca de visual espera o próximo 3D (sem piscar o 2D). */
const showing = new WeakMap<HTMLCanvasElement, "2d" | "3d">();

function drawFlat(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, look: BustLook) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height * 0.47);
  drawPlayerBust(context, look.appearance, look.primary, look.secondary, canvas.width * 0.43, 0, { cutout: true });
  context.restore();
  showing.set(canvas, "2d");
}

function drawPortrait(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, portrait: HTMLCanvasElement) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(portrait, 0, 0, canvas.width, canvas.height);
  showing.set(canvas, "3d");
}

const noop = () => {};

/**
 * Pinta o busto da figurinha no canvas: o retrato 3D se já estiver pronto; senão
 * o 2D na hora e, com `use3d`, troca pelo 3D quando ele chegar (mesmo canvas,
 * nada muda de lugar). No criador, cada escolha nova mantém o 3D anterior até o
 * novo sair. Devolve a limpeza para o `useEffect`.
 */
export function paintStickerBust(canvas: HTMLCanvasElement, look: BustLook, use3d: boolean): () => void {
  const context = canvas.getContext("2d");
  if (!context) return noop;
  const want3d = use3d && !studioFailed;
  if (!want3d) {
    drawFlat(context, canvas, look);
    return noop;
  }
  const key = portraitKey(look, canvas.width);
  const cached = takeReady(key);
  if (cached) {
    drawPortrait(context, canvas, cached);
    return noop;
  }
  if (showing.get(canvas) !== "3d") drawFlat(context, canvas, look);
  const job = request(look, canvas.width, false);
  job.waiters += 1;
  let alive = true;
  void job.promise.then((portrait) => {
    if (!alive) return;
    if (portrait) drawPortrait(context, canvas, portrait);
    else if (showing.get(canvas) === "3d") drawFlat(context, canvas, look);
  });
  return () => {
    alive = false;
    job.waiters -= 1;
  };
}

// Visual da partida do Bobonline (§1.1): 2D ou 3D, escolhido na home do modo.
//
// Lê `futbobo:bobonline-view:v1` (via bobKey, então cada ?perfil de teste tem o seu)
// e, sem escolha salva, cai na preferência global do 3D. Grava SÓ a chave própria:
// as configurações globais (`futbobo:settings:v1`) moram no IndexedDB do shell e
// não podem ser escritas daqui. A escolha vai para a BotaoMatch na prop `view`,
// então vale igual chegando por carregamento direto ou pelo <Link> do menu.

import { useSyncExternalStore } from "react";
import { readBotao3dPreference, webglAvailable } from "../botao/view-mode";
import { bobKey, writeJson } from "./storage";

export type BobView = "2d" | "3d";

export const VIEW_KEY = "futbobo:bobonline-view:v1";

let cached: BobView | null = null;
let webgl: boolean | null = null;
const listeners = new Set<() => void>();

function readStored(): BobView | null {
  try {
    const raw = window.localStorage.getItem(bobKey(VIEW_KEY));
    if (raw === null) return null;
    // Gravado como JSON ("3d"); aceita também o texto puro (3d) de quem preparou à mão.
    const value = raw.startsWith("\"") ? (JSON.parse(raw) as unknown) : raw;
    return value === "2d" || value === "3d" ? value : null;
  } catch {
    return null;
  }
}

/** O visual escolhido para o Bobonline (sem escolha: a preferência global do 3D). */
export function readViewPref(): BobView {
  if (typeof window === "undefined") return "2d";
  if (cached === null) cached = readStored() ?? (readBotao3dPreference() ? "3d" : "2d");
  return cached;
}

export function writeViewPref(view: BobView): void {
  cached = view;
  writeJson(bobKey(VIEW_KEY), view);
  for (const listener of [...listeners]) listener();
}

/** O aparelho desenha WebGL (uma vez por página: criar contexto custa). */
export function hasWebgl(): boolean {
  if (webgl === null) webgl = webglAvailable();
  return webgl;
}

/** O visual que a partida vai usar de fato: 3D só com WebGL. */
export function effectiveView(view: BobView): BobView {
  return view === "3d" && hasWebgl() ? "3d" : "2d";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== bobKey(VIEW_KEY)) return;
    cached = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const serverView = (): BobView => "2d";
const serverWebgl = () => true;
const subscribeNothing = () => () => {};

export function useViewPref(): BobView {
  return useSyncExternalStore(subscribe, readViewPref, serverView);
}

export function useWebglAvailable(): boolean {
  return useSyncExternalStore(subscribeNothing, hasWebgl, serverWebgl);
}

let prefetched3d = false;
let prefetchedDriver = false;

/** Baixa o pedaço do 3D antes da partida (ao entrar na sala com 3D escolhido); o resultado é ignorado. */
export function prefetch3d(): void {
  if (prefetched3d) return;
  prefetched3d = true;
  void import("../botao/three/Botao3DView").catch(() => {
    prefetched3d = false;
  });
}

/** Baixa o driver online antes da primeira partida (ao entrar na sala). */
export function prefetchDriver(): void {
  if (prefetchedDriver) return;
  prefetchedDriver = true;
  void import("../botao/online-driver").catch(() => {
    prefetchedDriver = false;
  });
}

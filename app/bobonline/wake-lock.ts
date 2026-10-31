// Tela acesa durante a sala inteira (§3.3 "Wake lock", decisão 26): da entrada
// na sala até sair dela.
//
// Web: Screen Wake Lock API. O navegador solta a trava sozinho quando a página
// some; ela volta no `visibilitychange` para visível. APK: o WebView do Android
// não tem essa API, então o plugin local `KeepAwake` (KeepAwakePlugin.java,
// registrado na MainActivity) liga FLAG_KEEP_SCREEN_ON na janela da activity.

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * O APK (WebView do Capacitor no Android). Fica aqui, e não em ../android-app: o Bobonline não
 * divide aquele módulo com o menu (dividido, ele sai do módulo do shell e pesa mais no "/").
 */
export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

type KeepAwakePlugin = { set(options: { on: boolean }): Promise<{ on: boolean }> };

let plugin: KeepAwakePlugin | null = null;
let wanted = false;
let sentinel: WakeLockSentinel | null = null;
let requesting = false;

function nativePlugin(): KeepAwakePlugin {
  if (!plugin) plugin = registerPlugin<KeepAwakePlugin>("KeepAwake");
  return plugin;
}

async function acquire(): Promise<void> {
  if (!wanted || sentinel || requesting) return;
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  if (document.visibilityState !== "visible") return;
  requesting = true;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (!wanted) {
      void lock.release().catch(() => {});
      return;
    }
    sentinel = lock;
    lock.addEventListener("release", () => {
      if (sentinel === lock) sentinel = null;
    });
  } catch {
    // Bateria fraca, política do navegador ou sem gesto: a tela só pode apagar.
  } finally {
    requesting = false;
  }
}

function onVisibility() {
  if (document.visibilityState === "visible") void acquire();
}

/** Liga (true) ou solta (false) a tela acesa. Chamadas repetidas com o mesmo valor não fazem nada. */
export function keepAwake(on: boolean): void {
  if (typeof window === "undefined" || on === wanted) return;
  wanted = on;
  if (isNativeAndroid()) {
    void nativePlugin().set({ on }).catch(() => {});
    return;
  }
  if (on) {
    document.addEventListener("visibilitychange", onVisibility);
    void acquire();
    return;
  }
  document.removeEventListener("visibilitychange", onVisibility);
  const lock = sentinel;
  sentinel = null;
  if (lock) void lock.release().catch(() => {});
}

/** Estado pedido (para o gancho de desenvolvimento). */
export function keepingAwake(): boolean {
  return wanted;
}

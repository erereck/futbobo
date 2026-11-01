// Convite da sala (§1.5): WhatsApp, compartilhar e copiar.
//
// O link sempre sai de roomLink (https://futbobo.top/...), nunca de location.href:
// no APK o endereço da página é https://localhost. O WebView do Android não tem
// navigator.share; lá o "Compartilhar link" copia o texto.

import { isNativeAndroid } from "./wake-lock";
import { roomLink, shareText } from "./net/codes";
import { getRoomView } from "./use-room";

/** O anfitrião atual da sala aberta com esse código: vai no link (&h=) para quem entra só aceitar a resposta dele. */
export function hostOfRoom(code: string): string | null {
  const snapshot = getRoomView().state?.snapshot;
  return snapshot && snapshot.code === code ? snapshot.hostId : null;
}

export function whatsappUrl(code: string, hostId: string | null = hostOfRoom(code)): string {
  return `https://wa.me/?text=${encodeURIComponent(shareText(code, hostId))}`;
}

/** O esquema do próprio app (sem passar por página nenhuma): só existe com o WhatsApp instalado. */
export function whatsappAppUrl(code: string, hostId: string | null = hostOfRoom(code)): string {
  return `whatsapp://send?text=${encodeURIComponent(shareText(code, hostId))}`;
}

/** Celular na web: Android, iPhone e iPad (o iPadOS se diz Mac, mas tem toque). */
export function isMobileWeb(userAgent: string, touchPoints = 0): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
}

/**
 * Por onde o convite vai:
 * - "apk": location.assign do wa.me. O Capacitor entrega hosts externos a um intent ACTION_VIEW,
 *   que abre o WhatsApp direto; a WebView do jogo fica onde estava.
 * - "app": celular na web. O esquema whatsapp:// na MESMA aba: o app abre por cima e, na volta, o
 *   navegador mostra a aba do jogo. Com o wa.me numa aba nova (o jeito antigo), quem voltava caía
 *   na aba do wa.me, achava que o jogo tinha fechado, e a sala ficava escondida enquanto o amigo
 *   procurava. Se o app não abriu (não instalado, navegador de dentro de outro app), o wa.me vai
 *   numa aba nova logo depois. Essa aba quase sempre é barrada (o navegador já gastou o toque no
 *   esquema): aí `onBlocked` avisa e a tela oferece o link para copiar. No iPhone/iPad nunca vai a
 *   aba (ou é barrada, ou é o mesmo problema da aba do wa.me): lá o link para copiar vem direto.
 * - "aba": computador. wa.me numa aba nova (o WhatsApp Web ou o app do desktop).
 */
export type WhatsAppPlan = "apk" | "app" | "aba";

export function whatsAppPlan(env: { native: boolean; mobile: boolean }): WhatsAppPlan {
  if (env.native) return "apk";
  return env.mobile ? "app" : "aba";
}

/**
 * Quanto esperar o app do WhatsApp tomar a tela antes de cair para o wa.me. Folgado: o Safari pergunta
 * "Abrir no WhatsApp?" (a página segue à vista e os timers correm) e o Android pode mostrar o seletor.
 */
export const WHATSAPP_APP_WAIT_MS = 2500;
/** Depois da espera, ainda ouve a saída por tanto tempo: o app pode abrir com um toque lento no "Abrir". */
export const WHATSAPP_LEAVE_WATCH_MS = 30_000;

/** iPhone, iPod e iPad (o iPadOS se diz Mac, mas tem toque): o mesmo teste do isMobileWeb. */
export function isIosWeb(userAgent: string, touchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
}

/** O que o envio usa do navegador (os testes passam um falso). */
export type WhatsAppEnv = {
  native: boolean;
  mobile: boolean;
  /** iPhone/iPad na web: a espera nunca abre aba (ver WhatsAppPlan). */
  ios: boolean;
  /** Navega ESTA aba (APK e esquema do app). */
  go(url: string): void;
  /** Abre uma aba nova; false quando o navegador barrou (bloqueio de pop-up). */
  openTab(url: string): boolean;
  later(run: () => void, ms: number): void;
  /** A página ainda está na frente. */
  visible(): boolean;
  /** A página tem o foco (sem o alerta do Safari ou o seletor de apps por cima). */
  focused(): boolean;
  /** Avisa quando a página sai da frente (o app abriu); devolve o desligar. */
  onLeave(listener: () => void): () => void;
};

/** O que a tela faz com o envio: `onBlocked` nada abriu (oferece o link); `onLeft` o app abriu depois disso. */
export type WhatsAppCallbacks = { onBlocked?: () => void; onLeft?: () => void };

/** Manda o convite pelo plano do aparelho (ver WhatsAppPlan). */
export function launchWhatsApp(urls: { web: string; app: string }, env: WhatsAppEnv, callbacks: WhatsAppCallbacks = {}): WhatsAppPlan {
  const { onBlocked, onLeft } = callbacks;
  const plan = whatsAppPlan(env);
  if (plan === "apk") env.go(urls.web);
  else if (plan === "aba") {
    if (!env.openTab(urls.web)) onBlocked?.();
  } else {
    let left = false;
    let waited = false;
    let stopped = false;
    let stop: () => void = () => {};
    const finish = () => {
      if (stopped) return;
      stopped = true;
      stop();
    };
    stop = env.onLeave(() => {
      left = true;
      // Saiu depois da espera: o app abriu (toque lento no "Abrir", seletor demorado); o link para copiar some.
      if (waited) {
        onLeft?.();
        finish();
      }
    });
    env.later(() => {
      waited = true;
      if (left) {
        finish();
        return;
      }
      // Ainda aqui, na frente e com o foco: o esquema não abriu nada (sem o app). Vai o wa.me (oferece
      // instalar ou o WhatsApp Web); no iPhone, o link para copiar. Sem o foco, um alerta ou o seletor
      // ainda está por cima: nada a fazer.
      if (env.visible() && env.focused()) {
        if (env.ios) onBlocked?.();
        else if (!env.openTab(urls.web)) onBlocked?.();
      }
      env.later(finish, WHATSAPP_LEAVE_WATCH_MS);
    }, WHATSAPP_APP_WAIT_MS);
    env.go(urls.app);
  }
  return plan;
}

/**
 * Até quando o beforeunload da página é engolido (performance.now). O esquema whatsapp:// (e o wa.me
 * que o Capacitor entrega ao intent) dispara beforeunload no Chromium e a página FICA: sem isto o
 * Trystero saía de todas as salas (o ouvinte dele roda no beforeunload) e o anfitrião sumia para quem
 * procura enquanto estava no WhatsApp, ou de vez se o app nem abriu.
 */
let externalNavUntil = 0;
/** Prazo do engolir depois de navegar para fora (o beforeunload vem logo em seguida). */
const EXTERNAL_NAV_GRACE_MS = 1500;

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  // Na carga do módulo (o /bobonline o puxa de cara): fica antes do ouvinte do Trystero, que só se liga
  // na primeira sala, e no mesmo alvo e fase dele (window, sem capture), então o stopImmediatePropagation
  // o pula. Nada de preventDefault nem returnValue: isso abriria o "sair do site?".
  window.addEventListener("beforeunload", (event) => {
    if (performance.now() < externalNavUntil) event.stopImmediatePropagation();
  });
}

function browserEnv(): WhatsAppEnv {
  let native = false;
  try {
    native = isNativeAndroid();
  } catch {
    native = false;
  }
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent ?? "" : "";
  const touchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints ?? 0 : 0;
  return {
    native,
    mobile: isMobileWeb(userAgent, touchPoints),
    ios: isIosWeb(userAgent, touchPoints),
    go: (url) => {
      externalNavUntil = performance.now() + EXTERNAL_NAV_GRACE_MS;
      window.location.assign(url);
    },
    openTab: (url) => {
      // Sem "noopener" nas opções: com ele o window.open devolve null mesmo abrindo, e não daria para
      // saber se o pop-up foi barrado. O opener sai à mão logo depois.
      const opened = window.open(url, "_blank");
      if (!opened) return false;
      try {
        opened.opener = null;
      } catch {
        // Outra origem já carregando: o opener não importa mais.
      }
      return true;
    },
    later: (run, ms) => {
      window.setTimeout(run, ms);
    },
    visible: () => document.visibilityState === "visible",
    focused: () => {
      try {
        return document.hasFocus();
      } catch {
        return true;
      }
    },
    onLeave: (listener) => {
      // Saiu da frente: o app tomou a tela (hidden), a página foi trocada (pagehide) ou outra janela pegou o foco (blur).
      const onVisibility = () => {
        if (document.visibilityState === "hidden") listener();
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pagehide", listener);
      window.addEventListener("blur", listener);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", listener);
        window.removeEventListener("blur", listener);
      };
    },
  };
}

/** Abre o WhatsApp com o convite (ver WhatsAppPlan e WhatsAppCallbacks). */
export function openWhatsApp(code: string, callbacks: WhatsAppCallbacks = {}, hostId: string | null = hostOfRoom(code)): WhatsAppPlan {
  return launchWhatsApp({ web: whatsappUrl(code, hostId), app: whatsappAppUrl(code, hostId) }, browserEnv(), callbacks);
}

/** O menu de compartilhar do sistema existe (nunca no WebView do Android). */
export function canNativeShare(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  try {
    return !isNativeAndroid();
  } catch {
    return true;
  }
}

/** Copia texto. false quando o navegador recusa (sem permissão, sem gesto, contexto inseguro). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/** "Compartilhar link": menu do sistema quando existe; senão copia o texto do convite. */
export async function shareRoomLink(code: string, hostId: string | null = hostOfRoom(code)): Promise<ShareOutcome> {
  if (canNativeShare()) {
    try {
      await navigator.share({ title: "Bobonline", text: shareText(code, hostId), url: roomLink(code, hostId) });
      return "shared";
    } catch (error) {
      // Fechou o menu sem escolher: não é erro e não copia nada por conta própria.
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(shareText(code, hostId))) ? "copied" : "failed";
}

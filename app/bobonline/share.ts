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

/**
 * Abre o WhatsApp com o convite. No APK, location.assign: o Capacitor entrega
 * hosts externos a um intent ACTION_VIEW, que abre o WhatsApp direto. Na web, aba nova.
 */
export function openWhatsApp(code: string, hostId: string | null = hostOfRoom(code)): void {
  const url = whatsappUrl(code, hostId);
  if (isNativeAndroid()) {
    window.location.assign(url);
    return;
  }
  window.open(url, "_blank", "noopener");
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

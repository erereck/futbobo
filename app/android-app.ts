import { Capacitor } from "@capacitor/core";

export const ANDROID_APP_VERSION = "1.0.0";
export const ANDROID_APK_URL =
  "https://github.com/erereck/futbobo/releases/latest/download/futbobo.apk";

const RELEASE_API = "https://api.github.com/repos/erereck/futbobo/releases/latest";

export type AndroidRelease = {
  version: string;
  url: string;
  notes: string;
};

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function isAndroidDevice() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

function versionParts(version: string) {
  return version.replace(/^android-v|^v/i, "").split(".").map((part) => Number(part) || 0);
}

export function isNewerVersion(candidate: string, current = ANDROID_APP_VERSION) {
  const next = versionParts(candidate);
  const installed = versionParts(current);
  const length = Math.max(next.length, installed.length);
  for (let index = 0; index < length; index += 1) {
    if ((next[index] ?? 0) > (installed[index] ?? 0)) return true;
    if ((next[index] ?? 0) < (installed[index] ?? 0)) return false;
  }
  return false;
}

export async function checkForAndroidUpdate(): Promise<AndroidRelease | null> {
  if (!isNativeAndroid() || typeof navigator === "undefined" || !navigator.onLine) return null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const release = await response.json() as {
      tag_name?: string;
      body?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };
    const version = release.tag_name?.replace(/^android-v|^v/i, "") ?? "";
    const apk = release.assets?.find((asset) => asset.name === "futbobo.apk");
    if (!version || !apk?.browser_download_url || !isNewerVersion(version)) return null;
    return {
      version,
      url: apk.browser_download_url,
      notes: release.body?.trim().slice(0, 240) || "Uma nova versão do Futbobo está disponível.",
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function openAndroidDownload(url = ANDROID_APK_URL) {
  if (isNativeAndroid()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.location.assign(url);
}

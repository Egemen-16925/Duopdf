import { useSyncExternalStore } from "react";

/** Cihaza özel arayüz tercihleri (öğrenme verisi değildir; eşitlenmez). */
export interface Prefs {
  /** Kalem modunda parmak da çizsin mi? Kapalıyken parmak kaydırır/yakınlaştırır, yalnızca kalem çizer. */
  fingerDraw: boolean;
  /** "Bir daha sorma" denmiş onaylar (ör. "deleteTerm"). */
  skipConfirm: Record<string, boolean>;
  /** Arayüz teması; "system" Windows'un ayarını izler. */
  theme: Theme;
}

export type Theme = "system" | "light" | "dark";

const KEY = "duopdf.prefs";
const DEFAULTS: Prefs = { fingerDraw: false, skipConfirm: {}, theme: "system" };

function read(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULTS, ...saved, skipConfirm: { ...saved.skipConfirm } };
  } catch {
    return DEFAULTS;
  }
}

let prefs = read();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return prefs;
}

/** Temayı sayfaya uygular (CSS `:root[data-theme]`). */
export function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  if (patch.theme) applyTheme(prefs.theme);
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // kaydedilemezse oturum boyunca geçerli kalır
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getPrefs,
  );
}

import { useSyncExternalStore } from "react";

/** Cihaza özel arayüz tercihleri (öğrenme verisi değildir; eşitlenmez). */
export interface Prefs {
  /** Kalem modunda parmak da çizsin mi? Kapalıyken parmak kaydırır/yakınlaştırır, yalnızca kalem çizer. */
  fingerDraw: boolean;
}

const KEY = "duopdf.prefs";
const DEFAULTS: Prefs = { fingerDraw: false };

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

let prefs = read();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return prefs;
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
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

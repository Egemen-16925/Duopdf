import { useSyncExternalStore } from "react";

/** Okuma (kelime seçme), kalem, geçici parlak kalem, silgi. */
export type InkTool = "select" | "pen" | "glow" | "eraser";

export const INK_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#111827"];

/** Kalınlıklar, sayfa genişliğine oranla. */
export const INK_SIZES = { ince: 0.0015, orta: 0.003, kalın: 0.006 } as const;
export type InkSize = keyof typeof INK_SIZES;

export interface InkTools {
  tool: InkTool;
  color: string;
  size: InkSize;
}

const KEY = "duopdf.inkTools";
const listeners = new Set<() => void>();

function read(): InkTools {
  const fallback: InkTools = { tool: "select", color: INK_COLORS[0], size: "orta" };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // Uygulama hep okuma modunda açılır; renk ve kalınlık hatırlanır.
    return { ...fallback, color: saved.color ?? fallback.color, size: saved.size in INK_SIZES ? saved.size : fallback.size };
  } catch {
    return fallback;
  }
}

let tools = read();

export function getInkTools(): InkTools {
  return tools;
}

export function setInkTools(patch: Partial<InkTools>) {
  tools = { ...tools, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify({ color: tools.color, size: tools.size }));
  } catch {
    // tercih kaydedilemezse sorun değil
  }
  listeners.forEach((l) => l());
}

export function subscribeInkTools(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInkTools(): InkTools {
  return useSyncExternalStore(subscribeInkTools, getInkTools);
}

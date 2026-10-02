import { useEffect, useReducer, useRef, type RefObject } from "react";
import { db, type StrokeRecord } from "../db/db";
import type { Pick } from "../learning/pick";
import type { TextMode } from "../learning/textMap";
import { attachGlow } from "./glow";
import { InkSurface } from "./surface";
import { getInkTools } from "./tools";

interface InkOptions {
  /** Kaydırılan kapsayıcı. */
  containerRef: RefObject<HTMLElement | null>;
  /** Verilmezse yalnızca parlak kalem çalışır (akan metin görünümü). */
  docHash?: string;
  view?: StrokeRecord["view"];
  rootSelector: string;
  mode: TextMode;
  /** Parlak kalemle metin seçilince. */
  onGlowPick(pick: Pick, root: Element): void;
}

export interface InkHandle {
  surface: InkSurface | null;
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Kelime tıklaması / seçimi şu an çalışmalı mı (kalem, silgi ve parlak kalem kendi işini yapar)? */
export function readingToolActive(hasSurface: boolean): boolean {
  const { tool } = getInkTools();
  if (tool === "glow") return false;
  return !hasSurface || tool === "select";
}

/** Görüntüleyiciye çizim yüzeyini, parlak kalemi ve Ctrl+Z / Ctrl+Y kısayollarını bağlar. */
export function useInk({ containerRef, docHash, view, rootSelector, mode, onGlowPick }: InkOptions): InkHandle {
  const surfaceRef = useRef<InkSurface | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const onGlowPickRef = useRef(onGlowPick);
  onGlowPickRef.current = onGlowPick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const surface =
      docHash && view ? new InkSurface({ db, docHash, view, scrollEl: container, onHistoryChange: rerender }) : null;
    surfaceRef.current = surface;
    const detachGlow = attachGlow({
      container,
      rootSelector,
      mode,
      onPick: (pick, root) => onGlowPickRef.current(pick, root),
    });
    const onKey = (e: KeyboardEvent) => {
      if (!surface || !(e.ctrlKey || e.metaKey) || e.altKey || isTyping()) return;
      // Yalnızca ekranda görünen görüntüleyici (gizli sekmeler ve görünümler değil).
      if (!container.checkVisibility({ visibilityProperty: true })) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        surface.undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        surface.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    rerender();
    return () => {
      window.removeEventListener("keydown", onKey);
      detachGlow();
      surface?.destroy();
      surfaceRef.current = null;
    };
  }, [docHash, view]);

  const surface = surfaceRef.current;
  return {
    surface,
    canUndo: surface?.history.canUndo ?? false,
    canRedo: surface?.history.canRedo ?? false,
    undo: () => surface?.undo(),
    redo: () => surface?.redo(),
  };
}

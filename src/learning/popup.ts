import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

/** Pencereyi hedefin altına (sığmazsa üstüne) yerleştirir; ekran dışına taşırmaz. */
export function usePopupPlacement(ref: RefObject<HTMLElement | null>, rect: DOMRect, width: number, deps: unknown[]) {
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 200;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    const below = rect.bottom + 8;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 8) : below;
    setPos({ left, top });
  }, [rect, width, ...deps]);
  return pos;
}

/** Dışarı tıklayınca, Esc'ye basınca veya belge kayınca kapatır. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const outside = (e: Event) => !ref.current?.contains(e.target as Node);
    const onDown = (e: MouseEvent) => outside(e) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = (e: Event) => outside(e) && onClose();
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);
}

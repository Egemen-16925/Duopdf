/** Akan metinde kaydırma konumu ↔ (bölüm, bölüm içi oran) dönüşümü. */

export interface SectionBox {
  top: number;
  height: number;
}

/** Görünümün üst kenarının düştüğü bölümü ve o bölümde ne kadar ilerlendiğini (0-1) bulur. */
export function locate(scrollTop: number, boxes: SectionBox[]): { index: number; offset: number } {
  if (boxes.length === 0) return { index: 0, offset: 0 };
  let index = 0;
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].top <= scrollTop + 1) index = i;
    else break;
  }
  const box = boxes[index];
  const offset = box.height > 0 ? (scrollTop - box.top) / box.height : 0;
  return { index, offset: Math.min(Math.max(offset, 0), 1) };
}

export function scrollTopFor(index: number, offset: number, boxes: SectionBox[]): number {
  const box = boxes[Math.min(Math.max(index, 0), boxes.length - 1)];
  return box ? box.top + offset * box.height : 0;
}

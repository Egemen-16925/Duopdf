/**
 * Yakınlaştırma hareketleri: touchpad'de iki parmakla sıkıştırma (tarayıcıya çok sayıda küçük
 * Ctrl+tekerlek olayı olarak gelir), fare tekerleği (Ctrl ile) ve dokunmatik ekranda iki parmak.
 */

/** Fare tekerleğinin bir tıkı bu kadar büyütür/küçültür. */
const NOTCH_FACTOR = 1.1;

/**
 * Ctrl+tekerlek olayının yakınlaştırma çarpanı. Büyük, tam adımlar (fare tekerleği) tek basamak;
 * küçük, kesirli adımlar (touchpad sıkıştırma) orantılı ve yumuşak.
 */
export function wheelZoomFactor(e: Pick<WheelEvent, "deltaY" | "deltaMode">): number {
  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 40; // satır → piksel
  else if (e.deltaMode === 2) delta *= 800; // sayfa → piksel
  if (delta === 0) return 1;
  if (Math.abs(delta) >= 50) return delta < 0 ? NOTCH_FACTOR : 1 / NOTCH_FACTOR;
  return Math.exp(-delta / 100);
}

/**
 * Küçük çarpanları biriktirir; ölçek yuvarlandığında değişmeyecek kadar küçük adımlar
 * kaybolmasın (pdf.js ölçeği iki basamağa yuvarlar).
 */
export class ZoomAccumulator {
  private factor = 1;

  /** Yeni çarpanı ekler; uygulanması gereken toplam çarpanı (yoksa null) döndürür. */
  add(factor: number, currentScale: number, round: (scale: number) => number = (s) => Math.round(s * 100) / 100): number | null {
    this.factor *= factor;
    if (round(currentScale * this.factor) === round(currentScale)) return null;
    const apply = this.factor;
    this.factor = 1;
    return apply;
  }

  reset() {
    this.factor = 1;
  }
}

/**
 * Dokunmatik ekranda iki parmakla sıkıştırma. Her harekette bir öncekine göre çarpanı ve
 * iki parmağın orta noktasını bildirir. Tek parmak ve kaydırma tarayıcıya bırakılır.
 */
export function attachPinch(el: HTMLElement, onZoom: (factor: number, cx: number, cy: number) => void): () => void {
  let last = 0;
  const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onStart = (e: TouchEvent) => {
    if (e.touches.length === 2) last = distance(e.touches);
  };
  const onMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || last === 0) return;
    e.preventDefault();
    const d = distance(e.touches);
    if (d > 0) {
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      onZoom(d / last, cx, cy);
      last = d;
    }
  };
  const onEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) last = 0;
  };
  el.addEventListener("touchstart", onStart, { passive: true });
  el.addEventListener("touchmove", onMove, { passive: false });
  el.addEventListener("touchend", onEnd);
  el.addEventListener("touchcancel", onEnd);
  return () => {
    el.removeEventListener("touchstart", onStart);
    el.removeEventListener("touchmove", onMove);
    el.removeEventListener("touchend", onEnd);
    el.removeEventListener("touchcancel", onEnd);
  };
}

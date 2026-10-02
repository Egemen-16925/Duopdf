/**
 * Çizim modunda parmakla dokunma: "parmakla çizim" kapalıyken tek parmak sayfayı kaydırır,
 * iki parmak yakınlaştırır. Çizim yüzeyi `touch-action: none` olduğu için tarayıcı bunu kendisi yapmaz
 * (kalem tarayıcıya göre de "dokunma" sayılır; aksi hâlde kalem çizmek yerine sayfayı kaydırırdı).
 */
export class TouchPanner {
  private pointers = new Map<number, { x: number; y: number }>();
  private lastDistance = 0;

  constructor(
    private scrollEl: HTMLElement,
    private onPinch?: (factor: number, cx: number, cy: number) => void,
  ) {}

  get active(): boolean {
    return this.pointers.size > 0;
  }

  down(e: PointerEvent) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.lastDistance = this.distance();
  }

  move(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    if (this.pointers.size === 1) {
      this.scrollEl.scrollBy(prev.x - e.clientX, prev.y - e.clientY);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = this.distance();
    if (this.lastDistance > 0 && d > 0 && this.onPinch) {
      const [a, b] = [...this.pointers.values()];
      this.onPinch(d / this.lastDistance, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    this.lastDistance = d;
  }

  up(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastDistance = 0;
  }

  private distance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

/** İşaretçiyi öğeye bağlar (öğenin dışına taşan çizgi de gelsin); işaretçi artık yoksa sessizce geçer. */
export function capture(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // işaretçi bu arada kalktıysa yakalama gerekmez
  }
}

/** Hızlı hareketlerde aradaki noktalar (tarayıcı desteklemiyorsa ya da boş dönerse olayın kendisi). */
export function coalesced(e: PointerEvent): PointerEvent[] {
  const events = e.getCoalescedEvents?.();
  return events && events.length > 0 ? events : [e];
}

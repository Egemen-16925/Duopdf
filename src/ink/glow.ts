import { caretFromPoint, pickAtPoint, pickFromRange, type Pick } from "../learning/pick";
import { NO_TEXT, type TextMode } from "../learning/textMap";
import { fingerDraws } from "./pen";
import { getInkTools, subscribeInkTools } from "./tools";
import { capture, coalesced, TouchPanner } from "./touchPan";

interface GlowOptions {
  /** Kaydırılan kapsayıcı; parlak kalem bunun içinde çalışır. */
  container: HTMLElement;
  rootSelector: string;
  mode: TextMode;
  onPick(pick: Pick, root: Element): void;
  onPinch?(factor: number, cx: number, cy: number): void;
}

const FADE_MS = 1000;
const INTERACTIVE = "a[href], button, input, select, textarea, label";

/**
 * Geçici parlak kalem: metnin üstünden geçince parlak bir iz bırakır, iz kısa sürede söner.
 * Bırakınca izin başladığı ve bittiği yer arasındaki metin seçilir (kısa → kelime penceresi,
 * uzun → cümle çevirisi). Hiçbir şey kaydedilmez.
 */
export function attachGlow(opts: GlowOptions): () => void {
  const { container } = opts;
  const panner = new TouchPanner(container, opts.onPinch);
  let canvas: HTMLCanvasElement | null = null;
  let points: { x: number; y: number }[] = [];
  let pointerId: number | null = null;
  let fadeFrame = 0;

  const active = () => getInkTools().tool === "glow";
  const sync = () => container.classList.toggle("glow-mode", active());
  sync();
  const unsubscribe = subscribeInkTools(sync);

  function overlay(): CanvasRenderingContext2D | null {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "glow-overlay";
      document.body.append(canvas);
    }
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function paint(alpha: number) {
    const ctx = overlay();
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (points.length === 0 || alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Yarı saydam sarı: beyaz sayfada fosforlu kalem gibi, renkli zeminde de yazı okunur kalır.
    ctx.strokeStyle = "rgba(255, 230, 0, 0.38)";
    ctx.shadowColor = "rgba(255, 215, 0, 0.7)";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    if (points.length === 1) ctx.lineTo(points[0].x + 0.1, points[0].y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function fadeOut() {
    const started = performance.now();
    const step = (now: number) => {
      const t = (now - started) / FADE_MS;
      if (t >= 1) {
        points = [];
        paint(0);
        return;
      }
      paint(1 - t);
      fadeFrame = requestAnimationFrame(step);
    };
    cancelAnimationFrame(fadeFrame);
    fadeFrame = requestAnimationFrame(step);
  }

  /** İmlecin bitiştiği harfin ekrandaki kutusu. */
  function charBox(node: Text, offset: number): DOMRect | null {
    if (node.length === 0) return null;
    const i = Math.min(Math.max(offset, 0), node.length - 1);
    const range = document.createRange();
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const box = range.getBoundingClientRect();
    return box.width > 0 || box.height > 0 ? box : null;
  }

  /**
   * İzin geçtiği metin konumları. Yalnızca uçlara bakmak yetmez: büyük başlıklarda iz çoğu zaman
   * yazının solundan başlayıp sağında biter, uçlar boş zemine düşer. Bu yüzden izin üzerindeki
   * noktalardan metnin üstüne (ya da hemen altına/üstüne) gelenler toplanır.
   */
  function textHits(): { node: Node; offset: number; root: Element; x: number; y: number }[] {
    const hits: { node: Node; offset: number; root: Element; x: number; y: number }[] = [];
    let last: { x: number; y: number } | null = null;
    for (const p of points) {
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 4) continue;
      last = p;
      const caret = caretFromPoint(p.x, p.y);
      if (!caret || caret.node.nodeType !== Node.TEXT_NODE) continue;
      const root = caret.node.parentElement?.closest(opts.rootSelector);
      if (!root || caret.node.parentElement?.closest(NO_TEXT)) continue;
      // İmleç en yakın yazıya "yapışır" (boş zeminde bile); nokta o harfin üstünde ya da çok yakınında mı?
      const box = charBox(caret.node as Text, caret.offset);
      if (!box) continue;
      const padX = Math.max(4, box.width);
      const padY = Math.max(6, box.height * 0.6);
      if (p.x < box.left - padX || p.x > box.right + padX || p.y < box.top - padY || p.y > box.bottom + padY) continue;
      hits.push({ node: caret.node, offset: caret.offset, root, x: p.x, y: p.y });
    }
    return hits;
  }

  function pick() {
    const hits = textHits();
    if (hits.length === 0) return;
    // En çok dokunulan metin kökü (sayfa / bölüm) seçilir.
    const counts = new Map<Element, number>();
    for (const h of hits) counts.set(h.root, (counts.get(h.root) ?? 0) + 1);
    const root = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const inRoot = hits.filter((h) => h.root === root);
    // Belge sırasına göre en baştaki ve en sondaki konum (sağdan sola çizim de olur).
    const probe = document.createRange();
    const before = (a: (typeof inRoot)[number], b: (typeof inRoot)[number]) => {
      probe.setStart(a.node, a.offset);
      probe.collapse(true);
      return probe.comparePoint(b.node, b.offset) > 0;
    };
    let first = inRoot[0];
    let last = inRoot[0];
    for (const h of inRoot) {
      if (before(h, first)) first = h;
      if (before(last, h)) last = h;
    }
    let result: ReturnType<typeof pickAtPoint> = null;
    if (first.node !== last.node || first.offset !== last.offset) {
      const range = document.createRange();
      range.setStart(first.node, first.offset);
      range.setEnd(last.node, last.offset);
      // Mavi "yanıp sönme" vurgusu metin seçimi gibi göründüğü için yok; açılan pencere yeterli.
      result = pickFromRange(range, opts.rootSelector, opts.mode);
    }
    // Tek noktaya dokunulduysa (ya da aralık kelime içermiyorsa) o noktadaki kelime.
    result ??= pickAtPoint(first.x, first.y, root, opts.mode);
    if (result) opts.onPick(result.pick, result.root);
  }

  const onDown = (e: PointerEvent) => {
    if (!active()) return;
    if (e.pointerType === "touch" && !fingerDraws()) {
      panner.down(e);
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Düğme ve bağlantılar (ör. "Yapay zekâ ile oku") fosforlu kalem açıkken de tıklanabilsin.
    if ((e.target as Element | null)?.closest?.(INTERACTIVE)) return;
    // Varsayılanı engelle: metin seçimi başlamasın, kelime tıklaması tetiklenmesin.
    e.preventDefault();
    e.stopPropagation();
    capture(container, e.pointerId);
    window.getSelection()?.removeAllRanges();
    pointerId = e.pointerId;
    cancelAnimationFrame(fadeFrame);
    points = [{ x: e.clientX, y: e.clientY }];
    paint(1);
  };

  const onMove = (e: PointerEvent) => {
    if (panner.active && e.pointerType === "touch") {
      panner.move(e);
      return;
    }
    if (e.pointerId !== pointerId) return;
    for (const ev of coalesced(e)) points.push({ x: ev.clientX, y: ev.clientY });
    paint(1);
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerType === "touch") panner.up(e);
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    pick();
    fadeOut();
  };

  // Chromium, pointerdown engellense de fareyle sürüklemede metin seçimine başlayabiliyor;
  // fosforlu kalem açıkken seçim hiç başlamasın.
  const noSelect = (e: Event) => {
    if (active() && !(e.target as Element | null)?.closest?.(INTERACTIVE)) e.preventDefault();
  };

  container.addEventListener("pointerdown", onDown, true);
  container.addEventListener("mousedown", noSelect, true);
  container.addEventListener("selectstart", noSelect, true);
  container.addEventListener("pointermove", onMove, true);
  container.addEventListener("pointerup", onUp, true);
  container.addEventListener("pointercancel", onUp, true);
  return () => {
    unsubscribe();
    cancelAnimationFrame(fadeFrame);
    container.classList.remove("glow-mode");
    container.removeEventListener("pointerdown", onDown, true);
    container.removeEventListener("mousedown", noSelect, true);
    container.removeEventListener("selectstart", noSelect, true);
    container.removeEventListener("pointermove", onMove, true);
    container.removeEventListener("pointerup", onUp, true);
    container.removeEventListener("pointercancel", onUp, true);
    canvas?.remove();
  };
}

import { flashRange } from "../learning/highlights";
import { caretFromPoint, pickAtPoint, pickFromRange, type Pick } from "../learning/pick";
import type { TextMode } from "../learning/textMap";
import { getPrefs } from "../settings/prefs";
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
    ctx.strokeStyle = "rgba(255, 214, 10, 0.55)";
    ctx.shadowColor = "rgba(255, 200, 0, 0.9)";
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

  function pick() {
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return;
    const a = caretFromPoint(first.x, first.y);
    const b = caretFromPoint(last.x, last.y);
    const rootA = a && (a.node.parentElement ?? null)?.closest(opts.rootSelector);
    const rootB = b && (b.node.parentElement ?? null)?.closest(opts.rootSelector);
    let result: ReturnType<typeof pickAtPoint> = null;
    if (a && b && rootA && rootA === rootB && !(a.node === b.node && a.offset === b.offset)) {
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      if (range.collapsed) {
        // Sağdan sola çizildiyse uçları değiştir.
        range.setStart(b.node, b.offset);
        range.setEnd(a.node, a.offset);
      }
      result = pickFromRange(range, opts.rootSelector, opts.mode);
      if (result) flashRange(range, 800);
    } else if (rootA) {
      result = pickAtPoint(first.x, first.y, rootA, opts.mode);
    }
    if (result) opts.onPick(result.pick, result.root);
  }

  const onDown = (e: PointerEvent) => {
    if (!active()) return;
    if (e.pointerType === "touch" && !getPrefs().fingerDraw) {
      panner.down(e);
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Varsayılanı engelle: metin seçimi başlamasın, kelime tıklaması tetiklenmesin.
    e.preventDefault();
    e.stopPropagation();
    capture(container, e.pointerId);
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

  container.addEventListener("pointerdown", onDown, true);
  container.addEventListener("pointermove", onMove, true);
  container.addEventListener("pointerup", onUp, true);
  container.addEventListener("pointercancel", onUp, true);
  return () => {
    unsubscribe();
    cancelAnimationFrame(fadeFrame);
    container.classList.remove("glow-mode");
    container.removeEventListener("pointerdown", onDown, true);
    container.removeEventListener("pointermove", onMove, true);
    container.removeEventListener("pointerup", onUp, true);
    container.removeEventListener("pointercancel", onUp, true);
    canvas?.remove();
  };
}

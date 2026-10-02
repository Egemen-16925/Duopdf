import type { DuopdfDB, StrokeRecord } from "../db/db";
import { getPrefs } from "../settings/prefs";
import { flatten, pointerWeight, simplify, strokeHits, type Point } from "./geometry";
import { drawStroke, fitCanvas } from "./render";
import { InkHistory, loadStrokes } from "./strokes";
import { getInkTools, INK_SIZES, subscribeInkTools } from "./tools";
import { TouchPanner } from "./touchPan";

interface SurfaceOptions {
  db: DuopdfDB;
  docHash: string;
  view: StrokeRecord["view"];
  /** Kaydırılan kapsayıcı (parmakla kaydırma için). */
  scrollEl: HTMLElement;
  /** İki parmakla yakınlaştırma (çizim modunda). */
  onPinch?(factor: number, cx: number, cy: number): void;
  /** Geri al / yinele durumu değişince. */
  onHistoryChange?(): void;
}

/** Silgi yarıçapı, sayfa genişliğine oranla. */
const ERASER_RADIUS = 0.012;

interface PageCanvas {
  canvas: HTMLCanvasElement;
  observer: ResizeObserver;
}

/**
 * Bir belgenin (bir görünümünün) çizimleri. Her sayfaya bir tuval takar, çizimi ve silmeyi yönetir.
 * pdf.js yakınlaştırmada sayfa içeriğini yeniden kurar; sayfa yeniden çizilince `attach` tekrar çağrılır.
 */
export class InkSurface {
  private byPage = new Map<number, StrokeRecord[]>();
  private canvases = new Map<number, PageCanvas>();
  readonly history: InkHistory;
  private loaded: Promise<void>;
  private panner: TouchPanner;
  private unsubscribe: () => void;
  private penDown = false;

  constructor(private opts: SurfaceOptions) {
    this.history = new InkHistory(opts.db);
    this.panner = new TouchPanner(opts.scrollEl, opts.onPinch);
    this.loaded = loadStrokes(opts.db, opts.docHash, opts.view).then((strokes) => {
      for (const s of strokes) this.byPage.set(s.page, [...(this.byPage.get(s.page) ?? []), s]);
      for (const page of this.canvases.keys()) this.redraw(page);
    });
    this.unsubscribe = subscribeInkTools(() => this.applyTool());
  }

  /** Sayfa öğesine çizim tuvalini takar (zaten takılıysa yeniler). */
  attach(page: number, pageEl: HTMLElement) {
    const existing = this.canvases.get(page);
    if (existing?.canvas.isConnected && existing.canvas.parentElement === pageEl) {
      this.redraw(page);
      return;
    }
    existing?.observer.disconnect();
    const canvas = document.createElement("canvas");
    canvas.className = "ink-layer";
    canvas.dataset.page = String(page);
    pageEl.append(canvas);
    const observer = new ResizeObserver(() => this.redraw(page));
    observer.observe(canvas);
    this.canvases.set(page, { canvas, observer });
    this.bindPointer(page, canvas);
    this.applyTool();
    this.loaded.then(() => this.redraw(page));
  }

  redraw(page: number) {
    const entry = this.canvases.get(page);
    if (!entry?.canvas.isConnected) return;
    const fitted = fitCanvas(entry.canvas);
    if (!fitted) return;
    for (const s of this.byPage.get(page) ?? []) drawStroke(fitted.ctx, s, fitted.w, fitted.h);
  }

  private applyTool() {
    const { tool } = getInkTools();
    const drawing = tool === "pen" || tool === "eraser";
    for (const { canvas } of this.canvases.values()) {
      canvas.classList.toggle("drawing", drawing);
      canvas.classList.toggle("erasing", tool === "eraser");
    }
  }

  private bindPointer(page: number, canvas: HTMLCanvasElement) {
    let points: Point[] = [];
    let erased: StrokeRecord[] = [];
    let drawingId: number | null = null;

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, aspect: r.height / r.width };
    };

    const eraseAt = (e: PointerEvent) => {
      const { x, y, aspect } = local(e);
      const strokes = this.byPage.get(page) ?? [];
      const hit = strokes.filter((s) => strokeHits(s.points, s.width, x, y, ERASER_RADIUS, aspect));
      if (hit.length === 0) return;
      erased.push(...hit);
      this.byPage.set(
        page,
        strokes.filter((s) => !hit.includes(s)),
      );
      this.redraw(page);
    };

    const drawLive = () => {
      const fitted = fitCanvas(canvas);
      if (!fitted) return;
      for (const s of this.byPage.get(page) ?? []) drawStroke(fitted.ctx, s, fitted.w, fitted.h);
      const { color, size } = getInkTools();
      drawStroke(fitted.ctx, { color, width: INK_SIZES[size], points: flatten(points) }, fitted.w, fitted.h);
    };

    canvas.addEventListener("pointerdown", (e) => {
      const { tool } = getInkTools();
      if (tool !== "pen" && tool !== "eraser") return;
      // Parmak: çizim kapalıysa kaydır/yakınlaştır; kalem değerken (avuç içi) yok say.
      if (e.pointerType === "touch" && (!getPrefs().fingerDraw || this.penDown)) {
        if (!this.penDown) this.panner.down(e);
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawingId = e.pointerId;
      if (e.pointerType === "pen") this.penDown = true;
      if (tool === "eraser") {
        erased = [];
        eraseAt(e);
      } else {
        const { x, y } = local(e);
        points = [[x, y, pointerWeight(e.pressure, e.pointerType)]];
        drawLive();
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      if (this.panner.active && e.pointerType === "touch") {
        this.panner.move(e);
        return;
      }
      if (e.pointerId !== drawingId) return;
      if (getInkTools().tool === "eraser") {
        eraseAt(e);
        return;
      }
      // Hızlı hareketlerde aradaki noktalar da gelsin (kalemde akıcı çizgi).
      for (const ev of e.getCoalescedEvents?.() ?? [e]) {
        const { x, y } = local(ev);
        points.push([x, y, pointerWeight(ev.pressure, ev.pointerType)]);
      }
      drawLive();
    });

    const finish = async (e: PointerEvent) => {
      if (e.pointerType === "touch" && this.panner.active) this.panner.up(e);
      if (e.pointerId !== drawingId) return;
      drawingId = null;
      if (e.pointerType === "pen") this.penDown = false;
      if (getInkTools().tool === "eraser") {
        const removed = erased;
        erased = [];
        if (removed.length) await this.history.erase(removed);
      } else if (points.length > 0) {
        const { color, size } = getInkTools();
        const { aspect } = local(e);
        const now = Date.now();
        const stroke: StrokeRecord = {
          id: crypto.randomUUID(),
          docHash: this.opts.docHash,
          view: this.opts.view,
          page,
          color,
          width: INK_SIZES[size],
          points: flatten(simplify(points, aspect)),
          createdAt: now,
          updatedAt: now,
        };
        points = [];
        this.byPage.set(page, [...(this.byPage.get(page) ?? []), stroke]);
        this.redraw(page);
        await this.history.add([stroke]);
      }
      this.opts.onHistoryChange?.();
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
  }

  async undo() {
    const pages = await this.history.undo();
    await this.reload(pages);
  }

  async redo() {
    const pages = await this.history.redo();
    await this.reload(pages);
  }

  private async reload(pages: number[]) {
    if (pages.length === 0) return;
    const strokes = await loadStrokes(this.opts.db, this.opts.docHash, this.opts.view);
    for (const page of pages) {
      this.byPage.set(
        page,
        strokes.filter((s) => s.page === page),
      );
      this.redraw(page);
    }
    this.opts.onHistoryChange?.();
  }

  /** Dışa aktarma için tüm çizimler. */
  async allStrokes(): Promise<StrokeRecord[]> {
    await this.loaded;
    return [...this.byPage.values()].flat();
  }

  destroy() {
    this.unsubscribe();
    for (const { canvas, observer } of this.canvases.values()) {
      observer.disconnect();
      canvas.remove();
    }
    this.canvases.clear();
  }
}

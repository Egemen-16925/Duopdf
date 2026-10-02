import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { db } from "../db/db";
import { trackRoot } from "../learning/highlights";
import { pdfjsLib } from "../reader/pdfjs";
import { ocrWithCache } from "./cache";
import { recognizeImage } from "./engine";
import { centerInside, renderOcrLayer } from "./layer";
import type { OcrResult } from "./result";

/** Sayfa üzerindeki kutu, 0-1 oranlarıyla (sol üst köşe başlangıç). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Matrix = [number, number, number, number, number, number];

/** Bundan küçük görseller (madde işareti, küçük simge) taranmaz. Birim: punto². */
const MIN_IMAGE_AREA = 2500;
/** OCR için sayfa bu genişlikte çizilir (piksel). */
const RENDER_WIDTH = 2000;

const OPS = pdfjsLib.OPS;
const IMAGE_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintInlineImageXObjectGroup,
]);

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Sayfadaki büyük görsellerin kapladığı bölgeleri bulur. Görseller birim kareye çizilir;
 * çizim komutlarındaki dönüşüm matrisi izlenerek her görselin sayfadaki yeri hesaplanır.
 */
export async function imageRegions(page: PDFPageProxy): Promise<Box[]> {
  const viewport = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const boxes: Box[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = pdfjsLib.Util.transform(ctm, args) as Matrix;
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (args?.[0]) ctm = pdfjsLib.Util.transform(ctm, args[0]) as Matrix;
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (IMAGE_OPS.has(fn)) {
      const area = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]);
      if (area < MIN_IMAGE_AREA) continue;
      const corners = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)].map(([x, y]) =>
        viewport.convertToViewportPoint(x, y),
      );
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const x0 = Math.max(0, Math.min(...xs) / viewport.width);
      const y0 = Math.max(0, Math.min(...ys) / viewport.height);
      const x1 = Math.min(1, Math.max(...xs) / viewport.width);
      const y1 = Math.min(1, Math.max(...ys) / viewport.height);
      if (x1 > x0 && y1 > y0) boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return boxes;
}

function union(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

async function recognizePage(page: PDFPageProxy, regions: Box[]): Promise<OcrResult> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(4, RENDER_WIDTH / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  // Yalnızca görsellerin bulunduğu bölge taranır (gerçek metni yeniden okumak boşa iş).
  const area = union(regions);
  const pad = 0.01;
  const rectangle = {
    left: Math.max(0, Math.floor((area.x - pad) * canvas.width)),
    top: Math.max(0, Math.floor((area.y - pad) * canvas.height)),
    width: Math.min(canvas.width, Math.ceil((area.w + 2 * pad) * canvas.width)),
    height: Math.min(canvas.height, Math.ceil((area.h + 2 * pad) * canvas.height)),
  };
  rectangle.width = Math.min(rectangle.width, canvas.width - rectangle.left);
  rectangle.height = Math.min(rectangle.height, canvas.height - rectangle.top);
  try {
    return await recognizeImage(canvas, rectangle);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/**
 * Bir PDF görüntüleyicisinin sayfalarındaki görsel yazılarını okur ve her sayfaya
 * görünmez bir OCR metin katmanı ekler. Sonuçlar sayfa başına önbelleğe alınır.
 */
export class PdfPageOcr {
  private results = new Map<number, Promise<OcrResult | null>>();
  pending = 0;

  constructor(
    private pdf: PDFDocumentProxy,
    /** Belgenin kimliği ve görünümü: "<hash>:<text|original>". */
    private key: string,
    private onPendingChange: (pending: number) => void,
  ) {}

  private result(pageNumber: number): Promise<OcrResult | null> {
    let job = this.results.get(pageNumber);
    if (!job) {
      job = (async () => {
        const page = await this.pdf.getPage(pageNumber);
        const regions = await imageRegions(page);
        if (regions.length === 0) return null;
        return ocrWithCache(db, `page:${this.key}:${pageNumber}`, async () => {
          this.onPendingChange(++this.pending);
          try {
            return await recognizePage(page, regions);
          } finally {
            this.onPendingChange(--this.pending);
          }
        });
      })();
      job.catch(() => this.results.delete(pageNumber));
      this.results.set(pageNumber, job);
    }
    return job;
  }

  /**
   * Sayfanın metin katmanı çizildikten sonra çağrılır; OCR katmanını (yeniden) kurar.
   * pdf.js yakınlaştırmada sayfayı yeniden kurarken bu katmanı siler; bu yüzden her seferinde eklenir.
   */
  async attach(pageNumber: number, pageDiv: HTMLElement, textLayer: HTMLElement): Promise<HTMLElement | null> {
    const result = await this.result(pageNumber);
    pageDiv.querySelector(":scope > .ocr-layer")?.remove();
    if (!result || !pageDiv.isConnected) return null;

    // Zaten seçilebilir olan gerçek metnin üstüne düşen OCR kelimeleri eklenmez.
    const base = textLayer.getBoundingClientRect();
    const realText: Box[] = [...textLayer.querySelectorAll("span")]
      .filter((s) => s.textContent?.trim())
      .map((s) => {
        const r = s.getBoundingClientRect();
        return { x: (r.left - base.left) / base.width, y: (r.top - base.top) / base.height, w: r.width / base.width, h: r.height / base.height };
      });

    const page = await this.pdf.getPage(pageNumber);
    const unit = page.getViewport({ scale: 1 });
    const layer = document.createElement("div");
    layer.className = "textLayer ocr-layer";
    const count = renderOcrLayer(layer, result, {
      unitWidth: unit.width,
      unitHeight: unit.height,
      skip: (word) => realText.some((box) => centerInside(word, box)),
    });
    if (count === 0) return null;
    pageDiv.append(layer);
    trackRoot(layer, "pdf");
    return layer;
  }
}

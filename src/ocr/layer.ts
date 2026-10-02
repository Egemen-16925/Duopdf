import { endsLine, type OcrResult, type OcrWord } from "./result";

/**
 * OCR kelimelerinden görünmez, seçilebilir bir metin katmanı kurar. pdf.js metin katmanıyla aynı
 * sınıfı (`textLayer`) ve CSS değişkenlerini (`--font-height`, `--scale-x`, ebeveyndeki
 * `--total-scale-factor`) kullanır; böylece yakınlaştırma, kelime seçme, vurgulama ve çeviri aynen çalışır.
 *
 * `unitWidth`/`unitHeight`: ölçek 1'deki sayfa boyutu (PDF'te punto, resimde piksel).
 */
export interface LayerOptions {
  unitWidth: number;
  unitHeight: number;
  /** true dönen kelimeler eklenmez (ör. PDF'te zaten seçilebilir olan metin). */
  skip?(word: OcrWord): boolean;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function measure(text: string, fontSize: number): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontSize * 0.5;
  measureCtx.font = `${fontSize}px sans-serif`;
  return measureCtx.measureText(text).width;
}

/** Görünmez satır/paragraf sonu: metin haritasında "\n" olur ve cümle orada biter. */
function lineBreak(): HTMLElement {
  const br = document.createElement("span");
  br.className = "ocr-break";
  br.textContent = "\n";
  return br;
}

/** Katmanı (yeniden) doldurur; eklenen kelime sayısını döndürür. */
export function renderOcrLayer(layer: HTMLElement, result: OcrResult, opts: LayerOptions): number {
  layer.replaceChildren();
  let count = 0;
  for (const lines of result.paragraphs) {
    let added = false;
    for (const [lineIndex, words] of lines.entries()) {
      // Başlık/etiket satırı bittiyse (bkz. endsLine) cümle bir sonraki satıra taşmasın.
      if (lineIndex > 0 && added && endsLine(lines[lineIndex - 1], words)) layer.append(lineBreak());
      // Satırdaki tüm kelimeler satırın üst kenarını ve yüksekliğini paylaşır. Kelime kutuları tek tek
      // kullanılırsa "cheap" (aşağı uzanan p) ile "are" arasındaki fark punto değişimi sanılır ve cümle bölünür.
      const lineTop = Math.min(...words.map((w) => w.y));
      const lineHeight = Math.max(...words.map((w) => w.y + w.h)) - lineTop;
      for (const word of words) {
        if (opts.skip?.(word)) continue;
        const fontHeight = lineHeight * opts.unitHeight;
        const width = word.w * opts.unitWidth;
        const span = document.createElement("span");
        span.textContent = word.text;
        span.style.left = `${word.x * 100}%`;
        span.style.top = `${lineTop * 100}%`;
        span.style.fontFamily = "sans-serif";
        span.style.setProperty("--font-height", `${fontHeight}px`);
        const natural = measure(word.text, fontHeight);
        if (natural > 0) span.style.setProperty("--scale-x", String(width / natural));
        layer.append(span);
        added = true;
        count++;
      }
    }
    // Paragraf sonu: cümleler paragraflar arasında birleşmesin.
    if (added) layer.append(lineBreak());
  }
  return count;
}

/** İki kutu (0-1 oranlarıyla) kesişiyor mu; kelimenin merkezi diğer kutudaysa yeter. */
export function centerInside(word: OcrWord, box: { x: number; y: number; w: number; h: number }): boolean {
  const cx = word.x + word.w / 2;
  const cy = word.y + word.h / 2;
  return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
}

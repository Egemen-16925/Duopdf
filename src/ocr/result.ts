/**
 * OCR sonucu, görsel boyutundan bağımsız (0-1 oranları) saklanır; böylece
 * yakınlaştırınca yeniden taranmaz ve aynı sonuç her ölçekte kullanılır.
 */
export interface OcrWord {
  text: string;
  /** Sol üst köşe ve boyut, görselin genişliğine/yüksekliğine oranla. */
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
}

export interface OcrResult {
  /** Taranan görselin piksel boyutu (en-boy oranı için). */
  width: number;
  height: number;
  /** Paragraflar → satırlar → kelimeler (okuma sırası). */
  paragraphs: OcrWord[][][];
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Tesseract'ın blok/paragraf/satır/kelime çıktısının ihtiyacımız olan kısmı. */
export interface TesseractPage {
  blocks: { paragraphs: { lines: { words: { text: string; confidence: number; bbox: Box }[] }[] }[] }[] | null;
}

/** Bu güvenin altındaki kelimeler genelde çizgi, simge veya gürültüdür. */
const MIN_CONFIDENCE = 55;

function isNoise(text: string, confidence: number): boolean {
  if (!/[\p{L}\p{N}]/u.test(text)) return true;
  return confidence < MIN_CONFIDENCE;
}

export function fromTesseract(page: TesseractPage, width: number, height: number): OcrResult {
  const paragraphs: OcrWord[][][] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      const lines: OcrWord[][] = [];
      for (const line of paragraph.lines) {
        const words = line.words
          .filter((w) => !isNoise(w.text.trim(), w.confidence))
          .map((w) => ({
            text: w.text.trim(),
            x: w.bbox.x0 / width,
            y: w.bbox.y0 / height,
            w: (w.bbox.x1 - w.bbox.x0) / width,
            h: (w.bbox.y1 - w.bbox.y0) / height,
            confidence: Math.round(w.confidence),
          }));
        if (words.length > 0) lines.push(words);
      }
      if (lines.length > 0) paragraphs.push(lines);
    }
  }
  return { width, height, paragraphs };
}

/**
 * Satır kendi başına mı (başlık, diyagram etiketi), yoksa cümle alt satırda mı sürüyor?
 * Noktalamasız biten satırdan sonra büyük harfle başlayan satır gelirse ayrı satır sayılır;
 * düz yazıda alt satır genelde küçük harfle sürer.
 */
export function endsLine(line: OcrWord[], next: OcrWord[] | undefined): boolean {
  if (!next || line.length === 0 || next.length === 0) return true;
  const last = line[line.length - 1].text;
  return !/[.!?:;,\-–—(]$/.test(last) && /^\p{Lu}/u.test(next[0].text);
}

/** Paragrafları düz metne çevirir: satırlar birleştirilir, satır sonu tirelemesi düzeltilir. */
export function ocrParagraphTexts(result: OcrResult): string[] {
  const texts: string[] = [];
  for (const lines of result.paragraphs) {
    let current: string[] = [];
    lines.forEach((words, i) => {
      current.push(words.map((w) => w.text).join(" "));
      if (endsLine(words, lines[i + 1])) {
        texts.push(current.join("\n").replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2").replace(/\n/g, " "));
        current = [];
      }
    });
  }
  return texts.filter((text) => text.trim().length > 0);
}

export function ocrWordCount(result: OcrResult): number {
  return result.paragraphs.reduce((n, lines) => n + lines.reduce((m, words) => m + words.length, 0), 0);
}

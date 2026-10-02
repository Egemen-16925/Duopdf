import type { PDFDocumentProxy } from "pdfjs-dist";

/** Örneklenen sayfalarda toplam bu kadar harf yoksa PDF taranmış sayılır. */
const MIN_TEXT_CHARS = 20;
const SAMPLE_PAGES = 5;

export function looksScanned(charCountsPerPage: number[]): boolean {
  return charCountsPerPage.reduce((a, b) => a + b, 0) < MIN_TEXT_CHARS;
}

/** İlk birkaç sayfanın metin katmanındaki boşluk dışı karakterleri sayar. */
export async function sampleTextChars(pdf: PDFDocumentProxy, pages = SAMPLE_PAGES): Promise<number[]> {
  const counts: number[] = [];
  for (let n = 1; n <= Math.min(pages, pdf.numPages); n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join("");
    counts.push(text.replace(/\s/g, "").length);
  }
  return counts;
}

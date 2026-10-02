const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/** PDF'ten gelen metni düzeltir: satır sonu tirelemesini birleştirir, boşlukları sadeleştirir. */
export function cleanText(text: string): string {
  return text
    .replace(/(\p{L})-\s*\n?\s+(\p{Ll})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** [start, end) aralığını içeren cümle(ler). */
export function sentenceAround(text: string, start: number, end = start): { start: number; end: number; text: string } {
  let from = 0;
  let to = text.length;
  for (const seg of segmenter.segment(text)) {
    const segEnd = seg.index + seg.segment.length;
    if (seg.index <= start && start < segEnd) from = seg.index;
    if (seg.index < end && end <= segEnd) {
      to = segEnd;
      break;
    }
  }
  return { start: from, end: to, text: cleanText(text.slice(from, to)) };
}

/** Kaydedilmiş cümleyi sayfa metninde arar (boşluk/tireleme farklarına dayanıklı). */
export function findSentence(text: string, sentence: string): { start: number; end: number } | null {
  const words = sentence.match(/\p{L}+/gu)?.slice(0, 8);
  if (!words || words.length === 0) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(escaped.join("[^\\p{L}]+"), "iu");
  const m = re.exec(text);
  if (!m) return null;
  return sentenceAround(text, m.index, m.index + m[0].length);
}

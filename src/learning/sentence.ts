const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/**
 * Intl.Segmenter bu kısaltmalardan sonra büyük harf gelince cümleyi böler ("e.g. Git", "Dr. Brown");
 * bunlarla biten parçalar sonraki parçayla birleştirilir.
 */
const ABBREVIATION =
  /(?:^|[\s(])(?:e\.g|i\.e|cf|vs|viz|approx|resp|al|fig|figs|eq|eqs|sec|ch|no|vol|pp|p|ref|refs|tab|dr|mr|mrs|ms|prof|inc|ltd|jr|sr|st|[A-Z])\.$/i;

export interface SentenceSpan {
  start: number;
  end: number;
}

/** PDF'ten gelen metni düzeltir: satır sonu tirelemesini birleştirir, boşlukları sadeleştirir. */
export function cleanText(text: string): string {
  return text
    .replace(/(\p{L})-\s*\n?\s+(\p{Ll})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Metni cümlelere böler (boşluk dahil konumlar; kısaltma düzeltmesiyle). */
export function segmentSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let pending: SentenceSpan | null = null;
  for (const seg of segmenter.segment(text)) {
    const span: SentenceSpan = { start: pending?.start ?? seg.index, end: seg.index + seg.segment.length };
    // Paragraf sonu (satır sonu) her zaman cümleyi bitirir; kısaltmada bitmez.
    if (!/\n\s*$/.test(seg.segment) && ABBREVIATION.test(seg.segment.trimEnd())) {
      pending = span;
      continue;
    }
    pending = null;
    spans.push(span);
  }
  if (pending) spans.push(pending);
  return spans;
}

/** [start, end) aralığını içeren cümle(ler). */
export function sentenceAround(text: string, start: number, end = start): { start: number; end: number; text: string } {
  const spans = segmentSentences(text);
  const first = spans.find((s) => start < s.end) ?? spans[spans.length - 1];
  const last = [...spans].reverse().find((s) => s.start < Math.max(end, start + 1)) ?? first;
  const from = first?.start ?? 0;
  const to = Math.max(last?.end ?? text.length, from);
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

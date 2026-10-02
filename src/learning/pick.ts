import { tokenize, type Token } from "./lemma";
import { sentenceAround } from "./sentence";
import { buildTextMap, offsetOf, rangeFor, type TextMap, type TextMode } from "./textMap";

/** Kullanıcının tıkladığı kelime ya da seçtiği kısa öbek. */
export interface WordPick {
  kind: "word";
  /** Belgede görünen hâli ("carried out"). */
  surface: string;
  tokens: Token[];
  sentence: string;
  /** Kelimenin geçtiği cümlenin sayfadaki aralığı ("Cümleyi çevir" için). */
  sentenceRange: Range | null;
  rect: DOMRect;
}

/** Çevrilecek cümle(ler): uzun seçim ya da Alt + tıklama. */
export interface SentencePick {
  kind: "sentence";
  text: string;
  range: Range | null;
  rect: DOMRect;
}

export type Pick = WordPick | SentencePick;

const MAX_WORDS = 6;
/** Tek seferde çevrilecek en uzun metin (birkaç cümle). */
export const MAX_SENTENCE_CHARS = 1200;

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
  };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function sentencePick(map: TextMap, start: number, end: number, rect?: DOMRect): SentencePick | null {
  const s = sentenceAround(map.text, start, end);
  if (!s.text) return null;
  const range = rangeFor(map, s.start, s.end);
  const box = rect ?? range?.getBoundingClientRect();
  return box ? { kind: "sentence", text: s.text, range, rect: box } : null;
}

function wordPick(map: TextMap, tokens: Token[], rect?: DOMRect): WordPick | null {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const box = rect ?? rangeFor(map, first.start, last.end)?.getBoundingClientRect();
  if (!box) return null;
  const s = sentenceAround(map.text, first.start, last.end);
  return {
    kind: "word",
    surface: map.text.slice(first.start, last.end).replace(/\s+/g, " "),
    tokens: tokenize(map.text.slice(first.start, last.end)),
    sentence: s.text,
    sentenceRange: rangeFor(map, s.start, s.end),
    rect: box,
  };
}

/**
 * Fare bırakıldığında:
 * - kısa seçim (en çok 6 kelime, tek cümle içinde) → kelime/öbek,
 * - daha uzun seçim → seçimi kapsayan cümle(ler),
 * - Alt + tıklama → tıklanan kelimenin cümlesi,
 * - tıklama → imlecin altındaki kelime.
 * `rootSelector` metin kökünü (PDF metin katmanı, akan metin bölümü) bulur.
 */
export function pickFromPointer(e: MouseEvent, rootSelector: string, mode: TextMode): { pick: Pick; root: Element } | null {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    return pickFromRange(selection.getRangeAt(0), rootSelector, mode);
  }
  const root = (e.target as Element | null)?.closest?.(rootSelector);
  if (!root) return null;
  return pickAtPoint(e.clientX, e.clientY, root, mode, e.altKey);
}

/** Bir metin aralığından seçim: kısa ve tek cümle içindeyse kelime/öbek, değilse cümle(ler). */
export function pickFromRange(range: Range, rootSelector: string, mode: TextMode): { pick: Pick; root: Element } | null {
  const root = (range.startContainer.parentElement ?? null)?.closest(rootSelector);
  if (!root || !root.contains(range.endContainer)) return null;
  const map = buildTextMap(root, mode);
  const start = offsetOf(map, range.startContainer, range.startOffset);
  const end = offsetOf(map, range.endContainer, range.endOffset);
  if (start == null || end == null || end <= start) return null;
  const tokens = tokenize(map.text).filter((t) => t.end > start && t.start < end);
  if (tokens.length === 0) return null;
  const crossesSentence = sentenceAround(map.text, start, end).text !== sentenceAround(map.text, start).text;
  const rect = range.getBoundingClientRect();
  const pick = tokens.length <= MAX_WORDS && !crossesSentence ? wordPick(map, tokens, rect) : sentencePick(map, start, end, rect);
  return pick ? { pick, root } : null;
}

/** Ekrandaki bir noktanın altındaki kelime (`sentence` ise o kelimenin cümlesi). */
export function pickAtPoint(x: number, y: number, root: Element, mode: TextMode, sentence = false): { pick: Pick; root: Element } | null {
  const caret = caretAt(x, y);
  if (!caret || !root.contains(caret.node)) return null;
  const map = buildTextMap(root, mode);
  const offset = offsetOf(map, caret.node, caret.offset);
  if (offset == null) return null;
  const token = tokenize(map.text).find((t) => t.start <= offset && offset <= t.end);
  if (!token) return null;
  const tokenRect = rangeFor(map, token.start, token.end)?.getBoundingClientRect();
  // Kelimenin uzağındaki boşluğa tıklandıysa sayma.
  const pad = 3;
  if (!tokenRect || x < tokenRect.left - pad || x > tokenRect.right + pad || y < tokenRect.top - pad || y > tokenRect.bottom + pad) {
    return null;
  }
  const pick = sentence ? sentencePick(map, token.start, token.end) : wordPick(map, [token], tokenRect);
  return pick ? { pick, root } : null;
}

/** Ekrandaki noktadaki metin konumu (parlak kalem için). */
export function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  return caretAt(x, y);
}

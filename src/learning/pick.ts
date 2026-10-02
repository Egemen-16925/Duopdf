import { tokenize, type Token } from "./lemma";
import { sentenceAround } from "./sentence";
import { buildTextMap, offsetOf, rangeFor, type TextMode } from "./textMap";

/** Kullanıcının tıkladığı kelime ya da seçtiği öbek. */
export interface WordPick {
  /** Belgede görünen hâli ("carried out"). */
  surface: string;
  tokens: Token[];
  sentence: string;
  rect: DOMRect;
}

const MAX_WORDS = 6;

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
  };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function build(root: Element, mode: TextMode, start: number, end: number, rectOverride?: DOMRect): WordPick | null {
  const map = buildTextMap(root, mode);
  const tokens = tokenize(map.text).filter((t) => t.end > start && t.start < end);
  if (tokens.length === 0 || tokens.length > MAX_WORDS) return null;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const rect = rectOverride ?? rangeFor(map, first.start, last.end)?.getBoundingClientRect();
  if (!rect) return null;
  return {
    surface: map.text.slice(first.start, last.end).replace(/\s+/g, " "),
    tokens: tokenize(map.text.slice(first.start, last.end)),
    sentence: sentenceAround(map.text, first.start, last.end).text,
    rect,
  };
}

/**
 * Fare bırakıldığında: seçim varsa seçilen öbeği, yoksa imlecin altındaki kelimeyi döndürür.
 * `rootSelector` metin kökünü (PDF metin katmanı, akan metin bölümü) bulur.
 */
export function pickFromPointer(e: MouseEvent, rootSelector: string, mode: TextMode): { pick: WordPick; root: Element } | null {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const root = (range.startContainer.parentElement ?? null)?.closest(rootSelector);
    if (!root || !root.contains(range.endContainer)) return null;
    const map = buildTextMap(root, mode);
    const start = offsetOf(map, range.startContainer, range.startOffset);
    const end = offsetOf(map, range.endContainer, range.endOffset);
    if (start == null || end == null || end <= start) return null;
    const pick = build(root, mode, start, end, range.getBoundingClientRect());
    return pick ? { pick, root } : null;
  }

  const root = (e.target as Element | null)?.closest?.(rootSelector);
  if (!root) return null;
  const caret = caretAt(e.clientX, e.clientY);
  if (!caret || !root.contains(caret.node)) return null;
  const map = buildTextMap(root, mode);
  const offset = offsetOf(map, caret.node, caret.offset);
  if (offset == null) return null;
  const token = tokenize(map.text).find((t) => t.start <= offset && offset <= t.end);
  if (!token) return null;
  const pick = build(root, mode, token.start, token.end);
  if (!pick) return null;
  // Kelimenin uzağındaki boşluğa tıklandıysa sayma.
  const r = pick.rect;
  const pad = 3;
  if (e.clientX < r.left - pad || e.clientX > r.right + pad || e.clientY < r.top - pad || e.clientY > r.bottom + pad) {
    return null;
  }
  return { pick, root };
}

import { tokenize } from "./lemma";
import { buildMatcher, type Matcher, type TermStatus } from "./matcher";
import { buildTextMap, rangeFor, type TextMode } from "./textMap";

/**
 * İşaretli kelimeleri CSS Custom Highlight API ile boyar. DOM'a öğe eklemediği için
 * PDF metin katmanının konumlarını ve metin seçimini bozmaz.
 */
const NAMES: Partial<Record<TermStatus, string>> = { unknown: "duo-unknown", learning: "duo-learning" };
const FLASH = "duo-flash";

const supported = typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

interface RootEntry {
  mode: TextMode;
  ranges: { status: TermStatus; range: Range }[];
}

const roots = new Map<Element, RootEntry>();
let matcher: Matcher = buildMatcher([]);
let publishScheduled = false;

function computeRanges(root: Element, mode: TextMode): RootEntry["ranges"] {
  const map = buildTextMap(root, mode);
  const tokens = tokenize(map.text);
  const ranges: RootEntry["ranges"] = [];
  for (const m of matcher.findAll(tokens)) {
    if (!NAMES[m.status]) continue;
    const range = rangeFor(map, tokens[m.first].start, tokens[m.last].end);
    if (range) ranges.push({ status: m.status, range });
  }
  return ranges;
}

function publish() {
  publishScheduled = false;
  if (!supported) return;
  const groups = new Map<string, Range[]>();
  for (const [root, entry] of roots) {
    if (!root.isConnected) {
      roots.delete(root);
      continue;
    }
    for (const { status, range } of entry.ranges) {
      const name = NAMES[status]!;
      groups.set(name, [...(groups.get(name) ?? []), range]);
    }
  }
  for (const name of Object.values(NAMES)) {
    CSS.highlights.set(name!, new Highlight(...(groups.get(name!) ?? [])));
  }
}

function schedulePublish() {
  if (publishScheduled) return;
  publishScheduled = true;
  queueMicrotask(publish);
}

/** Kök öğenin (PDF sayfası metin katmanı / akan metin bölümü) vurgularını hesaplar ve izlemeye alır. */
export function trackRoot(root: Element, mode: TextMode) {
  roots.set(root, { mode, ranges: computeRanges(root, mode) });
  schedulePublish();
}

export function untrackRoot(root: Element) {
  if (roots.delete(root)) schedulePublish();
}

export function setHighlightMatcher(next: Matcher) {
  matcher = next;
  for (const [root, entry] of roots) {
    if (root.isConnected) entry.ranges = computeRanges(root, entry.mode);
  }
  schedulePublish();
}

/** Çeviri penceresi açıkken çevrilen cümleyi gösterir (null: kaldır). */
export function setSentenceHighlight(range: Range | null) {
  if (!supported) return;
  if (range) CSS.highlights.set("duo-sentence", new Highlight(range));
  else CSS.highlights.delete("duo-sentence");
}

let flashTimer: number | undefined;

/** Bir aralığı kısa süre mavi yakar (kelime listesinden "cümleye git"). */
export function flashRange(range: Range, ms = 2500) {
  if (!supported) return;
  window.clearTimeout(flashTimer);
  CSS.highlights.set(FLASH, new Highlight(range));
  flashTimer = window.setTimeout(() => CSS.highlights.delete(FLASH), ms);
}

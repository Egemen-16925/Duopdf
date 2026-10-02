import { flashRange } from "./highlights";
import { findSentence } from "./sentence";
import { buildTextMap, rangeFor, type TextMode } from "./textMap";

/** Kelime listesinden "geçtiği cümleye git" isteği. `nonce` aynı yere tekrar gitmeyi sağlar. */
export interface Jump {
  page: number;
  sentence: string;
  nonce: number;
}

/** Cümleyi kökün içinde bulur, kısa süre yakar ve görünür alana kaydırır. */
export function flashSentence(root: Element, mode: TextMode, sentence: string): boolean {
  const map = buildTextMap(root, mode);
  const found = findSentence(map.text, sentence);
  const range = found && rangeFor(map, found.start, found.end);
  if (!range) return false;
  flashRange(range);
  range.startContainer.parentElement?.scrollIntoView({ block: "center" });
  return true;
}

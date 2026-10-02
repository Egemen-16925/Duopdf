import lemmatizer from "wink-lemmatizer";

export interface Token {
  /** Küçük harfe çevrilmiş, kesme işareti düzeltilmiş kelime. */
  word: string;
  start: number;
  end: number;
}

const WORD = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    tokens.push({ word: normalizeWord(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/’/g, "'");
}

const cache = new Map<string, string[]>();

/**
 * Kelimenin olası kök hâlleri (isim, fiil, sıfat okumaları ve kendisi).
 * "ran" → [ran, run], "data" → [data, datum], "studies" → [studies, study].
 */
export function lemmaCandidates(word: string): string[] {
  const w = normalizeWord(word);
  let result = cache.get(w);
  if (!result) {
    // İyelik ve kısaltma eklerini at: "compiler's" → "compiler".
    const base = w.replace(/'(s|re|ve|ll|d|t)$/, "");
    result = [...new Set([w, base, lemmatizer.noun(base), lemmatizer.verb(base), lemmatizer.adjective(base)])];
    cache.set(w, result);
  }
  return result;
}

/** Yapay zekâ yokken gösterilecek kök: kelimeden farklı olan ilk fiil/isim/sıfat okuması. */
export function bestLocalLemma(word: string): string {
  const w = normalizeWord(word).replace(/'(s|re|ve|ll|d|t)$/, "");
  for (const candidate of [lemmatizer.verb(w), lemmatizer.noun(w), lemmatizer.adjective(w)]) {
    if (candidate !== w) return candidate;
  }
  return w;
}

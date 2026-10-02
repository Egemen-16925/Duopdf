import { useSyncExternalStore } from "react";
import { db, type TermRecord } from "../db/db";
import { setHighlightMatcher } from "./highlights";
import { buildMatcher, type Matcher } from "./matcher";
import { listTerms } from "./terms";

/** İşaretli terimlerin uygulama genelindeki kopyası; değişince vurgular yeniden hesaplanır. */
let terms: TermRecord[] = [];
let matcher: Matcher = buildMatcher([]);
const listeners = new Set<() => void>();

export async function refreshTerms(): Promise<void> {
  terms = await listTerms(db);
  matcher = buildMatcher(terms);
  setHighlightMatcher(matcher);
  listeners.forEach((l) => l());
}

export function getMatcher(): Matcher {
  return matcher;
}

export function getTerms(): TermRecord[] {
  return terms;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTerms(): TermRecord[] {
  return useSyncExternalStore(subscribe, getTerms);
}

import type { DuopdfDB } from "../db/db";
import type { OcrResult } from "./result";

const inFlight = new Map<string, Promise<OcrResult>>();

/** OCR sonucunu önbellekten verir; yoksa hesaplar ve saklar. Aynı anahtar için iş tekrarlanmaz. */
export function ocrWithCache(db: DuopdfDB, key: string, compute: () => Promise<OcrResult>): Promise<OcrResult> {
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    const hit = await db.ocr.get(key);
    if (hit) return hit.result;
    const result = await compute();
    await db.ocr.put({ key, result, createdAt: Date.now() });
    return result;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

export async function imageKey(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return "img:" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function pageKey(documentHash: string, view: string, page: number): string {
  return `page:${documentHash}:${view}:${page}`;
}

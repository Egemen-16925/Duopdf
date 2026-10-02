import type { SentenceTranslation } from "../ai/schemas";
import type { DuopdfDB, SentenceRecord } from "../db/db";
import { cleanText } from "./sentence";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cümlenin cihazdan bağımsız anahtarı: temizlenmiş metnin özeti. */
export function sentenceKey(text: string): Promise<string> {
  return sha256(cleanText(text));
}

export async function getSentence(db: DuopdfDB, text: string): Promise<SentenceRecord | undefined> {
  return db.sentences.where("key").equals(await sentenceKey(text)).first();
}

export interface TranslateOptions {
  /** Kayıtlı çeviriyi yok sayıp yeniden çevir. */
  force?: boolean;
  source?: { documentHash: string; page: number };
  now?: number;
}

/**
 * Cümlenin çevirisini döndürür. Daha önce çevrildiyse kayıttan (internetsiz de çalışır);
 * değilse `translate` ile çevirir ve kaydeder. Kayıt anahtarında sağlayıcı/model yoktur.
 */
export async function translateSentence(
  db: DuopdfDB,
  text: string,
  translate: (sentence: string) => Promise<SentenceTranslation>,
  opts: TranslateOptions = {},
): Promise<{ record: SentenceRecord; fromCache: boolean }> {
  const clean = cleanText(text);
  const key = await sentenceKey(clean);
  const existing = await db.sentences.where("key").equals(key).first();
  if (existing && !opts.force) return { record: existing, fromCache: true };

  const result = await translate(clean);
  const now = opts.now ?? Date.now();
  const record = {
    ...(existing ?? { createdAt: now, documentHash: opts.source?.documentHash, page: opts.source?.page }),
    key,
    text: clean,
    translation: result.ceviri.trim(),
    grammarNote: result.dilbilgisiNotu.trim(),
    updatedAt: now,
  } as SentenceRecord;
  record.id = await db.sentences.put(record);
  return { record, fromCache: false };
}

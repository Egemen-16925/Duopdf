import type { DocFormat } from "../formats/types";
import type { DocumentRecord, DuopdfDB } from "./db";

export interface OpenedFile {
  name: string;
  filePath: string;
  hash: string;
  format: DocFormat;
  pageCount: number;
}

/**
 * Açılan dosyayı kaydeder. Aynı içerik (hash) daha önce açıldıysa
 * o kaydı kullanır: yolunu günceller, kaldığı yeri korur, listeye geri ekler.
 */
export async function registerOpened(db: DuopdfDB, file: OpenedFile, now = Date.now()): Promise<DocumentRecord> {
  return db.transaction("rw", db.documents, async () => {
    const existing = await db.documents.where("hash").equals(file.hash).first();
    if (existing) {
      const lastPage = Math.min(Math.max(existing.lastPage, 1), file.pageCount);
      const updated: DocumentRecord = {
        ...existing,
        ...file,
        lastPage,
        lastOffset: lastPage === existing.lastPage ? existing.lastOffset : 0,
        hiddenFromRecent: false,
        lastOpenedAt: now,
      };
      await db.documents.put(updated);
      return updated;
    }
    const record = { ...file, lastPage: 1, lastOffset: 0, hiddenFromRecent: false, addedAt: now, lastOpenedAt: now };
    const id = await db.documents.add(record as DocumentRecord);
    return { ...record, id };
  });
}

export async function savePosition(db: DuopdfDB, id: number, page: number, offset = 0): Promise<void> {
  await db.documents.update(id, { lastPage: page, lastOffset: offset });
}

export async function saveOriginalPage(db: DuopdfDB, id: number, page: number): Promise<void> {
  await db.documents.update(id, { originalPage: page });
}

export async function recentDocuments(db: DuopdfDB, limit = 20): Promise<DocumentRecord[]> {
  return db.documents
    .orderBy("lastOpenedAt")
    .reverse()
    .filter((d) => !d.hiddenFromRecent)
    .limit(limit)
    .toArray();
}

/** Belgeyi yalnızca listeden kaldırır; kaydı ve ona bağlı öğrenme verisi silinmez. */
export async function hideFromRecent(db: DuopdfDB, id: number): Promise<void> {
  await db.documents.update(id, { hiddenFromRecent: true });
}

export async function clearRecent(db: DuopdfDB): Promise<void> {
  await db.documents.toCollection().modify({ hiddenFromRecent: true });
}

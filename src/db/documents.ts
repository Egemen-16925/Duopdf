import type { DocumentRecord, DuopdfDB } from "./db";

export interface OpenedFile {
  name: string;
  filePath: string;
  hash: string;
  pageCount: number;
}

/**
 * Açılan dosyayı kaydeder. Aynı içerik (hash) daha önce açıldıysa
 * o kaydı kullanır: yolunu günceller, kaldığı sayfayı korur.
 */
export async function registerOpened(db: DuopdfDB, file: OpenedFile, now = Date.now()): Promise<DocumentRecord> {
  return db.transaction("rw", db.documents, async () => {
    const existing = await db.documents.where("hash").equals(file.hash).first();
    if (existing) {
      const updated: DocumentRecord = {
        ...existing,
        name: file.name,
        filePath: file.filePath,
        pageCount: file.pageCount,
        lastPage: Math.min(Math.max(existing.lastPage, 1), file.pageCount),
        lastOpenedAt: now,
      };
      await db.documents.put(updated);
      return updated;
    }
    const record = { ...file, lastPage: 1, addedAt: now, lastOpenedAt: now };
    const id = await db.documents.add(record as DocumentRecord);
    return { ...record, id };
  });
}

export async function saveLastPage(db: DuopdfDB, id: number, page: number): Promise<void> {
  await db.documents.update(id, { lastPage: page });
}

export async function recentDocuments(db: DuopdfDB, limit = 20): Promise<DocumentRecord[]> {
  return db.documents.orderBy("lastOpenedAt").reverse().limit(limit).toArray();
}

import { z } from "zod";
import type { DuopdfDB } from "../db/db";

/**
 * Öğrenme verisinin yedeği. Sağlayıcı ayarları (API anahtarı dahil) ayrı dosyada
 * durduğu için yedeğe hiç girmez.
 */
const BACKUP_FORMAT = "duopdf-backup";
const BACKUP_VERSION = 1;

const withId = z.object({ id: z.number().int() }).passthrough();

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  data: z.object({
    documents: z.array(withId.extend({ hash: z.string(), name: z.string() })),
    terms: z.array(withId.extend({ key: z.string(), status: z.enum(["unknown", "learning", "known"]) })),
    occurrences: z.array(withId.extend({ termId: z.number(), documentId: z.number() })),
    cache: z.array(z.object({ key: z.string() }).passthrough()),
  }),
});

export type BackupFile = z.infer<typeof backupSchema>;

export interface BackupSummary {
  documents: number;
  terms: number;
  occurrences: number;
}

export async function exportLearningData(db: DuopdfDB, now = new Date()): Promise<BackupFile> {
  const backup = await db.transaction("r", db.documents, db.terms, db.occurrences, db.cache, async () => ({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      documents: await db.documents.toArray(),
      terms: await db.terms.toArray(),
      occurrences: await db.occurrences.toArray(),
      cache: await db.cache.toArray(),
    },
  }));
  // Kayıt tipleri şemanın gevşek (passthrough) tipinden daha dar; yapı aynı.
  return backup as unknown as BackupFile;
}

export function summarize(backup: BackupFile): BackupSummary {
  return {
    documents: backup.data.documents.length,
    terms: backup.data.terms.length,
    occurrences: backup.data.occurrences.length,
  };
}

export function parseBackup(json: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Dosya okunamadı: geçerli bir JSON değil.");
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Bu dosya bir Duopdf yedeği değil ya da bozuk.");
  return parsed.data;
}

/** Mevcut öğrenme verisini yedektekiyle değiştirir (tek işlemde; yarıda kalmaz). */
export async function importLearningData(db: DuopdfDB, backup: BackupFile): Promise<BackupSummary> {
  await db.transaction("rw", db.documents, db.terms, db.occurrences, db.cache, async () => {
    await Promise.all([db.documents.clear(), db.terms.clear(), db.occurrences.clear(), db.cache.clear()]);
    await db.documents.bulkAdd(backup.data.documents as never[]);
    await db.terms.bulkAdd(backup.data.terms as never[]);
    await db.occurrences.bulkAdd(backup.data.occurrences as never[]);
    await db.cache.bulkAdd(backup.data.cache as never[]);
  });
  return summarize(backup);
}

export async function clearLearningData(db: DuopdfDB): Promise<void> {
  await db.transaction("rw", db.documents, db.terms, db.occurrences, db.cache, async () => {
    await Promise.all([db.documents.clear(), db.terms.clear(), db.occurrences.clear(), db.cache.clear()]);
  });
}

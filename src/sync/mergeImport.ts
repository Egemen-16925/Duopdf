import type { DuopdfDB } from "../db/db";
import { applySnapshot, mergeSnapshots, parseSnapshot, readSnapshot, sameSnapshot, type Snapshot } from "./snapshot";

/** Birleştirerek içe aktarmanın sonucu (terimler üzerinden). */
export interface MergeImportSummary {
  added: number;
  updated: number;
  /** Dosyadaki silme izlerinin sildiği kelimeler. */
  removed: number;
}

/**
 * Eşitleme biçimindeki dosyayı (Firelingo'nun dışa aktarması ya da Drive'daki dosya) okur.
 * JSON bozuksa ya da biçim tanınmıyorsa anlaşılır bir hata verir; veri değişmez.
 */
export function parseSyncFile(json: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Dosya okunamadı: geçerli bir JSON değil.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Bu dosya bir kelime listesi (eşitleme dosyası) değil.");
  let snap: Snapshot;
  try {
    snap = parseSnapshot(JSON.stringify(raw));
  } catch {
    // parseSnapshot'ın mesajı buluttaki dosyadan söz eder; burada kullanıcının seçtiği dosya var.
    throw new Error("Bu dosya tanınmadı: Duopdf ya da Firelingo kelime listesi değil (ya da başka bir sürümden).");
  }
  const lists = ["documents", "terms", "occurrences", "sentences", "strokes", "quizAttempts", "tombstones"] as const;
  if (lists.some((k) => !Array.isArray(snap[k]))) throw new Error("Eşitleme dosyası bozuk: listeler eksik ya da hatalı.");
  return snap;
}

/**
 * Dosyayı mevcut veriyi silmeden içe alır. Eşitlemeyle aynı kurallar: terim ve çeviride yeni
 * `updatedAt` kazanır, geçişler birleşir, silme izi yalnızca kayıttan yeniyse siler.
 * Belgeler, çizimler ve sınav geçmişi korunur (dosyada olanlar eklenir).
 */
export async function mergeImport(db: DuopdfDB, imported: Snapshot): Promise<MergeImportSummary> {
  const local = await readSnapshot(db);
  const merged = mergeSnapshots(local, imported);
  if (!sameSnapshot(merged, local)) await applySnapshot(db, merged);

  const before = new Map(local.terms.map((t) => [t.key, JSON.stringify(t)]));
  const after = new Map(merged.terms.map((t) => [t.key, JSON.stringify(t)]));
  let added = 0;
  let updated = 0;
  for (const [key, value] of after) {
    const old = before.get(key);
    if (old === undefined) added++;
    else if (old !== value) updated++;
  }
  const removed = [...before.keys()].filter((key) => !after.has(key)).length;
  return { added, updated, removed };
}

/** DuoPDF'in verisi eşitleme biçiminde (Firelingo içe alabilir). */
export function exportSnapshot(db: DuopdfDB): Promise<Snapshot> {
  return readSnapshot(db);
}

import type { DuopdfDB, OccurrenceRecord, TermRecord } from "../db/db";
import { normalizeWord } from "./lemma";
import { patternFor, type TermStatus } from "./matcher";

export interface MarkInput {
  /** Varsa güncellenecek terim (tıklanan kelime zaten işaretliyse). */
  termId?: number;
  /** Belgede görünen hâli: "ran", "carried out". */
  surface: string;
  /** Kök hâli (modelden ya da yerel kök bulucudan): "run", "carry out". */
  lemma: string;
  status: TermStatus;
  meaning?: string;
  explanation?: string;
  occurrence?: Omit<OccurrenceRecord, "id" | "termId" | "createdAt">;
}

export function termKey(lemma: string): string {
  return lemma.trim().split(/\s+/).map(normalizeWord).join(" ");
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

function mergePatterns(a: string[][], b: string[][]): string[][] {
  if (a.length !== b.length) return a;
  return a.map((keys, i) => [...new Set([...keys, ...b[i]])]);
}

export function newReview(now: number): TermRecord["review"] {
  return { intervalDays: 0, dueAt: now, streak: 0 };
}

/** Terimi oluşturur ya da günceller; varsa geçtiği yeri de kaydeder (aynı cümle iki kez yazılmaz). */
export async function markTerm(db: DuopdfDB, input: MarkInput, now = Date.now()): Promise<TermRecord> {
  return db.transaction("rw", db.terms, db.occurrences, async () => {
    const key = termKey(input.lemma);
    const pattern = patternFor(words(input.surface), words(input.lemma));
    const existing =
      (input.termId != null ? await db.terms.get(input.termId) : undefined) ??
      (await db.terms.where("key").equals(key).first());

    let term: TermRecord;
    if (existing) {
      term = {
        ...existing,
        status: input.status,
        pattern: mergePatterns(existing.pattern, pattern),
        meaning: input.meaning?.trim() || existing.meaning,
        explanation: input.explanation?.trim() || existing.explanation,
        updatedAt: now,
      };
      await db.terms.put(term);
    } else {
      const record = {
        key,
        lemma: input.lemma.trim(),
        surface: input.surface.trim(),
        pattern,
        status: input.status,
        meaning: input.meaning?.trim() ?? "",
        explanation: input.explanation?.trim() ?? "",
        note: "",
        createdAt: now,
        updatedAt: now,
        review: newReview(now),
      };
      const id = await db.terms.add(record as TermRecord);
      term = { ...record, id };
    }

    const occ = input.occurrence;
    if (occ && occ.sentence.trim()) {
      const duplicate = await db.occurrences
        .where("termId")
        .equals(term.id)
        .filter((o) => o.documentId === occ.documentId && o.sentence === occ.sentence)
        .first();
      if (!duplicate) await db.occurrences.add({ ...occ, termId: term.id, createdAt: now } as OccurrenceRecord);
    }
    return term;
  });
}

export async function setTermStatus(db: DuopdfDB, id: number, status: TermStatus, now = Date.now()): Promise<void> {
  await db.terms.update(id, { status, updatedAt: now });
}

export async function updateTermText(
  db: DuopdfDB,
  id: number,
  fields: Partial<Pick<TermRecord, "meaning" | "explanation" | "note">>,
  now = Date.now(),
): Promise<void> {
  await db.terms.update(id, { ...fields, updatedAt: now });
}

export async function deleteTerm(db: DuopdfDB, id: number): Promise<void> {
  await db.transaction("rw", db.terms, db.occurrences, async () => {
    await db.occurrences.where("termId").equals(id).delete();
    await db.terms.delete(id);
  });
}

export async function listTerms(db: DuopdfDB): Promise<TermRecord[]> {
  return db.terms.orderBy("createdAt").reverse().toArray();
}

export async function occurrencesOf(db: DuopdfDB, termId: number): Promise<OccurrenceRecord[]> {
  return db.occurrences.where("termId").equals(termId).sortBy("createdAt");
}

export async function occurrenceCounts(db: DuopdfDB): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  await db.occurrences.each((o) => counts.set(o.termId, (counts.get(o.termId) ?? 0) + 1));
  return counts;
}

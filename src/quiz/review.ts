import type { DuopdfDB, TermRecord } from "../db/db";
import type { TermStatus } from "../learning/matcher";

/**
 * Aralıklı tekrar. Her sınav cevabı kelimenin bir sonraki tekrar zamanını belirler:
 * doğru → aralık büyür (1, 3, 7 gün, sonra ×2,5); yanlış → kelime hemen yeniden sorulabilir.
 * Üst üste 3 doğru "biliyorum"a yükseltir.
 */
const DAY = 24 * 60 * 60 * 1000;
export const KNOWN_STREAK = 3;

export interface ReviewChange {
  before: TermStatus;
  after: TermStatus;
  review: TermRecord["review"];
}

export function nextInterval(streak: number, previousDays: number): number {
  if (streak <= 1) return 1;
  if (streak === 2) return 3;
  if (streak === 3) return 7;
  return Math.round(Math.max(previousDays, 7) * 2.5);
}

/** Cevaba göre yeni tekrar bilgisi ve durum. */
export function applyAnswer(term: Pick<TermRecord, "status" | "review">, correct: boolean, now: number): ReviewChange {
  const before = term.status;
  if (!correct) {
    return {
      before,
      // Bildiğini sandığın kelimeyi yanlış yaptıysan yeniden "az biliyorum"a iner.
      after: before === "known" ? "learning" : before,
      review: { streak: 0, intervalDays: 0, dueAt: now },
    };
  }
  const streak = term.review.streak + 1;
  const intervalDays = nextInterval(streak, term.review.intervalDays);
  const after: TermStatus = streak >= KNOWN_STREAK ? "known" : before === "unknown" ? "learning" : before;
  return { before, after, review: { streak, intervalDays, dueAt: now + intervalDays * DAY } };
}

/** Günün sonu (yerel saat): bugün içinde zamanı gelecek kelimeler de bugünkü tekrara girer. */
export function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function isDue(term: Pick<TermRecord, "review">, now: number): boolean {
  return term.review.dueAt <= endOfDay(now);
}

/** Bugünkü tekrar kuyruğu: zamanı en çok geçmiş olan önce. */
export function dueTerms(terms: TermRecord[], now: number): TermRecord[] {
  return terms.filter((t) => isDue(t, now)).sort((a, b) => a.review.dueAt - b.review.dueAt);
}

/** Cevabı kelimeye işler (tekrar zamanı ve durum). */
export async function recordReview(db: DuopdfDB, termKey: string, correct: boolean, now = Date.now()): Promise<ReviewChange | null> {
  return db.transaction("rw", db.terms, async () => {
    const term = await db.terms.where("key").equals(termKey).first();
    if (!term) return null;
    const change = applyAnswer(term, correct, now);
    await db.terms.update(term.id, { status: change.after, review: change.review, updatedAt: now });
    return change;
  });
}

/** "bugün", "yarın", "3 gün sonra". */
export function describeDue(dueAt: number, now: number): string {
  if (dueAt <= endOfDay(now)) return "bugün";
  const days = Math.round((endOfDay(dueAt) - endOfDay(now)) / DAY);
  return days === 1 ? "yarın" : `${days} gün sonra`;
}

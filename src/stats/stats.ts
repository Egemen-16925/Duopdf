import type { QuizAttemptRecord, TermRecord } from "../db/db";

/** Yerel saatle günün başlangıcı. */
export function startOfDay(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export interface DayCount {
  /** Günün başlangıcı (yerel saat). */
  day: number;
  total: number;
  correct: number;
}

/** Son `days` günün her biri için cevaplanan soru ve doğru sayısı (bugün dahil, eskiden yeniye). */
export function dailyCounts(attempts: Pick<QuizAttemptRecord, "createdAt" | "correct">[], now: number, days = 30): DayCount[] {
  const today = startOfDay(now);
  const out: DayCount[] = Array.from({ length: days }, (_, i) => ({ day: addDays(today, i - days + 1), total: 0, correct: 0 }));
  const index = new Map(out.map((d, i) => [d.day, i]));
  for (const a of attempts) {
    const i = index.get(startOfDay(a.createdAt));
    if (i === undefined) continue;
    out[i].total++;
    if (a.correct) out[i].correct++;
  }
  return out;
}

/**
 * Günlük seri: üst üste çalışılan gün sayısı (sınav cevabı ya da yeni işaretlenen kelime).
 * Bugün henüz çalışılmadıysa seri dünden sayılır (gün bitmeden bozulmuş sayılmaz).
 */
export function dailyStreak(activityTimes: number[], now: number): { days: number; today: boolean } {
  const active = new Set(activityTimes.map(startOfDay));
  const today = startOfDay(now);
  const studiedToday = active.has(today);
  let day = studiedToday ? today : addDays(today, -1);
  let days = 0;
  while (active.has(day)) {
    days++;
    day = addDays(day, -1);
  }
  return { days, today: studiedToday };
}

export interface WordMistakes {
  term: TermRecord;
  correct: number;
  wrong: number;
}

/** En çok yanlış yapılan kelimeler (en az bir yanlışı olanlar). */
export function mostMistaken(terms: TermRecord[], attempts: Pick<QuizAttemptRecord, "termKeys" | "correct">[], limit = 10): WordMistakes[] {
  const byKey = new Map(terms.map((t) => [t.key, { term: t, correct: 0, wrong: 0 }]));
  for (const a of attempts) {
    for (const key of a.termKeys) {
      const entry = byKey.get(key);
      if (!entry) continue;
      if (a.correct) entry.correct++;
      else entry.wrong++;
    }
  }
  return [...byKey.values()]
    .filter((w) => w.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.correct - b.correct || a.term.lemma.localeCompare(b.term.lemma))
    .slice(0, limit);
}

/** Bir dönemdeki doğru oranı (yüzde, cevap yoksa null). */
export function accuracy(days: DayCount[]): number | null {
  const total = days.reduce((n, d) => n + d.total, 0);
  if (total === 0) return null;
  return Math.round((days.reduce((n, d) => n + d.correct, 0) / total) * 100);
}

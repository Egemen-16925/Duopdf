import { generate } from "../ai/aiClient";
import { multipleChoicePrompt, type QuizDirection } from "../ai/prompts/multipleChoice";
import type { MultipleChoice } from "../ai/schemas";
import type { DuopdfDB, OccurrenceRecord, QuizAttemptRecord, TermRecord } from "../db/db";
import type { TermStatus } from "../learning/matcher";
import { cleanText } from "../learning/sentence";
import { sentenceKey } from "../learning/sentences";
import type { AiTarget } from "../settings/providers";

export type { QuizDirection };
/** Sınav ayarı: tek yön ya da karışık. */
export type QuizMode = QuizDirection | "mixed";

/** Sorulacak bir kelime. Cümleyi yapay zekâ her seferinde yeniden kurar. */
export interface QuizItem {
  term: TermRecord;
  direction: QuizDirection;
  /** Belgede geçtiği bir cümle (kelimenin anlamını belirlemek için; soruda gösterilmez). */
  context?: string;
}

export interface TermQuizStats {
  count: number;
  correct: number;
  wrong: number;
  lastAt: number;
}

/** Bağlam için kullanılabilecek cümle uzunlukları. */
const MIN_CONTEXT = 15;
const MAX_CONTEXT = 400;
/** Modele "bunlara benzeme" diye gönderilen önceki cümle sayısı. */
const AVOID_COUNT = 8;

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Sınav soruları: istenen durumlardaki kelimelerden, her kelimeye bir soru. Önce az sorulan,
 * sonra çok yanlış yapılan, sonra uzun süredir sorulmayan kelimeler gelir.
 */
export function pickQuizItems(
  terms: TermRecord[],
  occurrences: OccurrenceRecord[],
  stats: Map<string, TermQuizStats>,
  opts: { count: number; statuses: TermStatus[]; mode: QuizMode; random?: () => number },
): QuizItem[] {
  const random = opts.random ?? Math.random;
  const contexts = new Map<number, string[]>();
  for (const o of occurrences) {
    const sentence = cleanText(o.sentence);
    if (sentence.length >= MIN_CONTEXT && sentence.length <= MAX_CONTEXT) {
      contexts.set(o.termId, [...(contexts.get(o.termId) ?? []), sentence]);
    }
  }
  const candidates = terms
    .filter((t) => opts.statuses.includes(t.status))
    .map((term) => {
      const s = stats.get(term.key) ?? { count: 0, correct: 0, wrong: 0, lastAt: 0 };
      return { term, ...s, tie: random() };
    })
    .sort((a, b) => a.count - b.count || b.wrong - a.wrong || a.lastAt - b.lastAt || a.tie - b.tie)
    .slice(0, opts.count);

  return shuffle(
    candidates.map(({ term }, i): QuizItem => {
      const own = contexts.get(term.id) ?? [];
      // Karışık modda yönler yarı yarıya dağılır (sıra sonra karıştırılır).
      const direction: QuizDirection = opts.mode === "mixed" ? (i % 2 === 0 ? "en-tr" : "tr-en") : opts.mode;
      return { term, direction, ...(own.length > 0 ? { context: own[Math.floor(random() * own.length)] } : {}) };
    }),
    random,
  );
}

export function countEligible(terms: TermRecord[], statuses: TermStatus[]): number {
  return terms.filter((t) => statuses.includes(t.status)).length;
}

export interface QuizOption {
  text: string;
  correct: boolean;
  /** Yanlış şıkta: neden yanlış. */
  why?: string;
}

export interface QuizQuestion {
  direction: QuizDirection;
  /** Modelin kurduğu İngilizce cümle ve Türkçesi. */
  english: string;
  turkish: string;
  /** Hedef kelimenin İngilizce cümledeki yeri (vurgulamak için). */
  highlight: { start: number; end: number } | null;
  options: QuizOption[];
  correctIndex: number;
}

/** Doğru şık ile çeldiricileri karıştırır; doğru şıkkın yeri rastgeledir. */
export function buildQuestion(mc: MultipleChoice, direction: QuizDirection, random: () => number = Math.random): QuizQuestion {
  const english = mc.cumle.trim();
  const turkish = mc.turkce.trim();
  const options = shuffle(
    [
      { text: direction === "en-tr" ? turkish : english, correct: true },
      ...mc.celdiriciler.map((c) => ({ text: c.metin.trim(), correct: false, why: c.hata.trim() })),
    ],
    random,
  );
  const at = english.toLocaleLowerCase("en").indexOf(mc.hedef.trim().toLocaleLowerCase("en"));
  return {
    direction,
    english,
    turkish,
    highlight: at >= 0 ? { start: at, end: at + mc.hedef.trim().length } : null,
    options,
    correctIndex: options.findIndex((o) => o.correct),
  };
}

/** Bu kelime için en son sorulan cümleler (yeni soru bunlara benzememeli). */
export async function recentSentences(db: DuopdfDB, termKey: string, limit = AVOID_COUNT): Promise<string[]> {
  const attempts = await db.quizAttempts.where("termKeys").equals(termKey).toArray();
  return attempts
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((a) => a.sentence)
    .filter((s, i, all) => all.indexOf(s) === i)
    .slice(0, limit);
}

/**
 * Soruyu üretir (güçlü model, hata olursa yedek model). Önbellek yok: her sınavda kelime
 * yeni bir cümlede sorulur; önceki cümleler modele "bunlara benzeme" diye verilir.
 */
export async function makeQuestion(
  db: DuopdfDB,
  target: AiTarget,
  item: QuizItem,
  opts: { avoid?: string[]; random?: () => number } = {},
): Promise<QuizQuestion> {
  const avoid = [...new Set([...(opts.avoid ?? []), ...(await recentSentences(db, item.term.key))])].slice(0, AVOID_COUNT);
  const value = await generate(target, multipleChoicePrompt, {
    lemma: item.term.lemma,
    meaning: item.term.meaning,
    ...(item.context ? { context: item.context } : {}),
    direction: item.direction,
    avoid,
  });
  return buildQuestion(value, item.direction, opts.random);
}

/** Terim anahtarına göre kaç kez soruldu, kaç doğru/yanlış, en son ne zaman. */
export async function quizStats(db: DuopdfDB): Promise<Map<string, TermQuizStats>> {
  const stats = new Map<string, TermQuizStats>();
  await db.quizAttempts.each((a) => {
    for (const key of a.termKeys) {
      const s = stats.get(key) ?? { count: 0, correct: 0, wrong: 0, lastAt: 0 };
      stats.set(key, {
        count: s.count + 1,
        correct: s.correct + (a.correct ? 1 : 0),
        wrong: s.wrong + (a.correct ? 0 : 1),
        lastAt: Math.max(s.lastAt, a.createdAt),
      });
    }
  });
  return stats;
}

export async function recordAttempt(
  db: DuopdfDB,
  item: QuizItem,
  question: QuizQuestion,
  chosenIndex: number,
  now = Date.now(),
): Promise<QuizAttemptRecord> {
  const record: QuizAttemptRecord = {
    id: crypto.randomUUID(),
    kind: "mcq",
    direction: question.direction,
    sentence: question.english,
    translation: question.turkish,
    sentenceKey: await sentenceKey(question.english),
    termKeys: [item.term.key],
    options: question.options.map((o) => o.text),
    correctIndex: question.correctIndex,
    chosenIndex,
    correct: chosenIndex === question.correctIndex,
    createdAt: now,
    updatedAt: now,
  };
  await db.quizAttempts.put(record);
  return record;
}

import { generate } from "../ai/aiClient";
import { evaluateTranslationPrompt } from "../ai/prompts/evaluateTranslation";
import { multipleChoicePrompt, type QuizDirection, type QuizLevel } from "../ai/prompts/multipleChoice";
import { openQuestionPrompt } from "../ai/prompts/openQuestion";
import type { Evaluation, MultipleChoice } from "../ai/schemas";
import type { DuopdfDB, OccurrenceRecord, QuizAttemptRecord, TermRecord } from "../db/db";
import type { TermStatus } from "../learning/matcher";
import { cleanText } from "../learning/sentence";
import { sentenceKey } from "../learning/sentences";
import type { AiTarget } from "../settings/providers";
import { dueTerms, recordReview, type ReviewChange } from "./review";

export type { QuizDirection, QuizLevel };
/** Soru yönü ayarı: tek yön ya da karışık. */
export type QuizMode = QuizDirection | "mixed";
/** "mcq": çoktan seçmeli, "open": çeviriyi kullanıcı yazar. */
export type QuizKind = "mcq" | "open";
export type QuizKindMode = QuizKind | "mixed";

/** Sorulacak bir kelime. Cümleyi yapay zekâ her seferinde yeniden kurar. */
export interface QuizItem {
  term: TermRecord;
  kind: QuizKind;
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

interface ItemOptions {
  count: number;
  mode: QuizMode;
  /** Varsayılan çoktan seçmeli. */
  kind?: QuizKindMode;
  random?: () => number;
}

/** Sıralanmış kelimelerden soruları kurar: yön ve soru türü karışıksa eşit dağıtılır, sıra karıştırılır. */
function toItems(ordered: TermRecord[], occurrences: OccurrenceRecord[], opts: ItemOptions): QuizItem[] {
  const random = opts.random ?? Math.random;
  const contexts = new Map<number, string[]>();
  for (const o of occurrences) {
    const sentence = cleanText(o.sentence);
    if (sentence.length >= MIN_CONTEXT && sentence.length <= MAX_CONTEXT) {
      contexts.set(o.termId, [...(contexts.get(o.termId) ?? []), sentence]);
    }
  }
  return shuffle(
    ordered.slice(0, opts.count).map((term, i): QuizItem => {
      const own = contexts.get(term.id) ?? [];
      const direction: QuizDirection = opts.mode === "mixed" ? (i % 2 === 0 ? "en-tr" : "tr-en") : opts.mode;
      const kind: QuizKind = opts.kind === "mixed" ? (Math.floor(i / 2) % 2 === 0 ? "mcq" : "open") : (opts.kind ?? "mcq");
      return { term, kind, direction, ...(own.length > 0 ? { context: own[Math.floor(random() * own.length)] } : {}) };
    }),
    random,
  );
}

/**
 * Serbest sınav: istenen durumlardaki kelimelerden, her kelimeye bir soru. Önce az sorulan,
 * sonra çok yanlış yapılan, sonra uzun süredir sorulmayan kelimeler gelir.
 */
export function pickQuizItems(
  terms: TermRecord[],
  occurrences: OccurrenceRecord[],
  stats: Map<string, TermQuizStats>,
  opts: ItemOptions & { statuses: TermStatus[] },
): QuizItem[] {
  const random = opts.random ?? Math.random;
  const ordered = terms
    .filter((t) => opts.statuses.includes(t.status))
    .map((term) => ({ term, s: stats.get(term.key) ?? { count: 0, correct: 0, wrong: 0, lastAt: 0 }, tie: random() }))
    .sort((a, b) => a.s.count - b.s.count || b.s.wrong - a.s.wrong || a.s.lastAt - b.s.lastAt || a.tie - b.tie)
    .map((c) => c.term);
  return toItems(ordered, occurrences, opts);
}

/** Bugünkü tekrar: zamanı gelmiş kelimeler, en çok gecikmiş olan önce. */
export function pickReviewItems(terms: TermRecord[], occurrences: OccurrenceRecord[], now: number, opts: ItemOptions): QuizItem[] {
  return toItems(dueTerms(terms, now), occurrences, opts);
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

interface QuestionBase {
  direction: QuizDirection;
  /** Modelin kurduğu İngilizce cümle ve Türkçesi. */
  english: string;
  turkish: string;
  /** Hedef kelimenin İngilizce cümledeki yeri (vurgulamak için). */
  highlight: { start: number; end: number } | null;
}

export interface McqQuestion extends QuestionBase {
  kind: "mcq";
  options: QuizOption[];
  correctIndex: number;
}

export interface OpenTask extends QuestionBase {
  kind: "open";
}

export type QuizQuestion = McqQuestion | OpenTask;

function locate(english: string, target: string): QuestionBase["highlight"] {
  const at = english.toLocaleLowerCase("en").indexOf(target.trim().toLocaleLowerCase("en"));
  return at >= 0 ? { start: at, end: at + target.trim().length } : null;
}

/** Doğru şık ile çeldiricileri karıştırır; doğru şıkkın yeri rastgeledir. */
export function buildQuestion(mc: MultipleChoice, direction: QuizDirection, random: () => number = Math.random): McqQuestion {
  const english = mc.cumle.trim();
  const turkish = mc.turkce.trim();
  const options = shuffle(
    [
      { text: direction === "en-tr" ? turkish : english, correct: true },
      ...mc.celdiriciler.map((c) => ({ text: c.metin.trim(), correct: false, why: c.hata.trim() })),
    ],
    random,
  );
  return {
    kind: "mcq",
    direction,
    english,
    turkish,
    highlight: locate(english, mc.hedef),
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
 * Soruyu üretir (güçlü model, hata olursa yedek model). Önbellek yok: her seferinde kelime
 * yeni bir cümlede sorulur; önceki cümleler modele "bunlara benzeme" diye verilir.
 */
export async function makeQuestion(
  db: DuopdfDB,
  target: AiTarget,
  item: QuizItem,
  opts: { avoid?: string[]; level?: QuizLevel; random?: () => number } = {},
): Promise<QuizQuestion> {
  const avoid = [...new Set([...(opts.avoid ?? []), ...(await recentSentences(db, item.term.key))])].slice(0, AVOID_COUNT);
  const input = {
    lemma: item.term.lemma,
    meaning: item.term.meaning,
    ...(item.context ? { context: item.context } : {}),
    direction: item.direction,
    avoid,
    level: opts.level ?? "orta",
  };
  if (item.kind === "mcq") return buildQuestion(await generate(target, multipleChoicePrompt, input), item.direction, opts.random);
  const value = await generate(target, openQuestionPrompt, input);
  const english = value.cumle.trim();
  return { kind: "open", direction: item.direction, english, turkish: value.turkce.trim(), highlight: locate(english, value.hedef) };
}

/** Açık uçlu cevabı güçlü modele değerlendirtir (anlam üzerinden). */
export function evaluateAnswer(target: AiTarget, item: QuizItem, task: OpenTask, answer: string): Promise<Evaluation> {
  const toTurkish = task.direction === "en-tr";
  return generate(target, evaluateTranslationPrompt, {
    sentence: toTurkish ? task.english : task.turkish,
    userTranslation: answer.trim(),
    targetLemmas: [item.term.lemma],
    direction: task.direction,
    reference: toTurkish ? task.turkish : task.english,
  });
}

/** Hedef kelime doğru bilindi mi: modelin kelime değerlendirmesi, yoksa genel sonuç. */
export function wordUnderstood(evaluation: Evaluation, lemma: string): boolean {
  const own = evaluation.hedefKelimeler.find((h) => h.lemma.trim().toLowerCase() === lemma.trim().toLowerCase());
  if (own) return own.dogruAnlasildi && evaluation.sonuc !== "yanlis";
  return evaluation.sonuc === "dogru";
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

export interface RecordedAnswer {
  attempt: QuizAttemptRecord;
  /** Kelimenin tekrar zamanı ve durumundaki değişiklik. */
  change: ReviewChange | null;
}

async function save(db: DuopdfDB, item: QuizItem, record: QuizAttemptRecord): Promise<RecordedAnswer> {
  await db.quizAttempts.put(record);
  const change = await recordReview(db, item.term.key, record.correct, record.createdAt);
  return { attempt: record, change };
}

async function baseRecord(item: QuizItem, question: QuizQuestion, now: number) {
  return {
    id: crypto.randomUUID(),
    direction: question.direction,
    sentence: question.english,
    translation: question.turkish,
    sentenceKey: await sentenceKey(question.english),
    termKeys: [item.term.key],
    createdAt: now,
    updatedAt: now,
  };
}

/** Çoktan seçmeli cevabı kaydeder ve kelimenin tekrar zamanını günceller. */
export async function recordAttempt(
  db: DuopdfDB,
  item: QuizItem,
  question: McqQuestion,
  chosenIndex: number,
  now = Date.now(),
): Promise<RecordedAnswer> {
  return save(db, item, {
    ...(await baseRecord(item, question, now)),
    kind: "mcq",
    options: question.options.map((o) => o.text),
    correctIndex: question.correctIndex,
    chosenIndex,
    correct: chosenIndex === question.correctIndex,
  });
}

/** Açık uçlu cevabı ve değerlendirmesini kaydeder, kelimenin tekrar zamanını günceller. */
export async function recordOpenAttempt(
  db: DuopdfDB,
  item: QuizItem,
  task: OpenTask,
  answer: string,
  evaluation: Evaluation,
  now = Date.now(),
): Promise<RecordedAnswer> {
  return save(db, item, {
    ...(await baseRecord(item, task, now)),
    kind: "open",
    userAnswer: answer.trim(),
    result: evaluation.sonuc,
    score: evaluation.puan,
    feedback: evaluation,
    correct: wordUnderstood(evaluation, item.term.lemma),
  });
}

import { generate } from "../ai/aiClient";
import { multipleChoicePrompt, type MultipleChoiceInput } from "../ai/prompts/multipleChoice";
import type { MultipleChoice } from "../ai/schemas";
import type { DuopdfDB, OccurrenceRecord, QuizAttemptRecord, TermRecord } from "../db/db";
import { cached } from "../learning/cache";
import { tokenize } from "../learning/lemma";
import { buildMatcher, type TermStatus } from "../learning/matcher";
import { cleanText } from "../learning/sentence";
import { getSentence, sentenceKey } from "../learning/sentences";
import type { AiTarget } from "../settings/providers";

/** Sorulacak bir kelime ve onun geçtiği cümle. */
export interface QuizItem {
  term: TermRecord;
  sentence: string;
  /** Kelimenin cümledeki yeri (vurgulamak için) ve görünen hâli. */
  start: number;
  end: number;
  surface: string;
}

export interface TermQuizStats {
  count: number;
  lastAt: number;
}

/** Çok kısa ya da çok uzun cümleler soru olmaya uygun değil. */
const MIN_SENTENCE = 15;
const MAX_SENTENCE = 400;

/** Cümlede terimin geçtiği yer; terim cümlede bulunamazsa null. */
export function locateTerm(term: TermRecord, sentence: string): { start: number; end: number } | null {
  const tokens = tokenize(sentence);
  const match = buildMatcher([term]).findAll(tokens)[0];
  if (!match) return null;
  return { start: tokens[match.first].start, end: tokens[match.last].end };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Sınav soruları: istenen durumlardaki kelimelerden, her kelimeye bir soru.
 * Az sorulmuş (ve uzun süredir sorulmamış) kelimeler önce gelir; cümle, kelimenin geçtiği
 * cümlelerden rastgele seçilir.
 */
export function pickQuizItems(
  terms: TermRecord[],
  occurrences: OccurrenceRecord[],
  stats: Map<string, TermQuizStats>,
  opts: { count: number; statuses: TermStatus[]; random?: () => number },
): QuizItem[] {
  const random = opts.random ?? Math.random;
  const byTerm = new Map<number, OccurrenceRecord[]>();
  for (const o of occurrences) byTerm.set(o.termId, [...(byTerm.get(o.termId) ?? []), o]);

  const candidates: { item: QuizItem; count: number; lastAt: number; tie: number }[] = [];
  for (const term of terms) {
    if (!opts.statuses.includes(term.status)) continue;
    const usable: QuizItem[] = [];
    const seen = new Set<string>();
    for (const o of byTerm.get(term.id) ?? []) {
      const sentence = cleanText(o.sentence);
      if (sentence.length < MIN_SENTENCE || sentence.length > MAX_SENTENCE || seen.has(sentence)) continue;
      seen.add(sentence);
      const at = locateTerm(term, sentence);
      if (at) usable.push({ term, sentence, ...at, surface: sentence.slice(at.start, at.end) });
    }
    if (usable.length === 0) continue;
    const s = stats.get(term.key) ?? { count: 0, lastAt: 0 };
    candidates.push({ item: usable[Math.floor(random() * usable.length)], count: s.count, lastAt: s.lastAt, tie: random() });
  }
  candidates.sort((a, b) => a.count - b.count || a.lastAt - b.lastAt || a.tie - b.tie);
  return shuffle(
    candidates.slice(0, opts.count).map((c) => c.item),
    random,
  );
}

/** Seçilebilecek kelime sayısı (sınav ayar ekranı için). */
export function countEligible(terms: TermRecord[], occurrences: OccurrenceRecord[], statuses: TermStatus[]): number {
  return pickQuizItems(terms, occurrences, new Map(), { count: Infinity, statuses, random: () => 0 }).length;
}

export interface QuizOption {
  text: string;
  correct: boolean;
  /** Yanlış şıkta: neden yanlış. */
  why?: string;
}

export interface QuizQuestion {
  options: QuizOption[];
  correctIndex: number;
  /** Önbellekten mi geldi (yenile düğmesi için bilgi). */
  fromCache: boolean;
}

/** Doğru şık ile çeldiricileri karıştırır; doğru şıkkın yeri rastgeledir. */
export function buildOptions(mc: MultipleChoice, random: () => number = Math.random): { options: QuizOption[]; correctIndex: number } {
  const options = shuffle(
    [
      { text: mc.dogruCeviri.trim(), correct: true },
      ...mc.celdiriciler.map((c) => ({ text: c.metin.trim(), correct: false, why: c.hata.trim() })),
    ],
    random,
  );
  return { options, correctIndex: options.findIndex((o) => o.correct) };
}

/**
 * Soruyu üretir (güçlü model). Aynı cümle + kelime için önbellekten gelir; `force` ile yenilenir.
 * Okuyucuda bu cümle daha önce çevrildiyse o çeviri doğru şık olur.
 */
export async function makeQuestion(
  db: DuopdfDB,
  target: AiTarget,
  item: QuizItem,
  opts: { force?: boolean; random?: () => number } = {},
): Promise<QuizQuestion> {
  const translation = (await getSentence(db, item.sentence))?.translation;
  const input: MultipleChoiceInput = {
    sentence: item.sentence,
    targets: [{ lemma: item.term.lemma, surface: item.surface, meaning: item.term.meaning }],
    ...(translation ? { translation } : {}),
  };
  const { value, fromCache } = await cached(db, multipleChoicePrompt, input, () => generate(target, multipleChoicePrompt, input), {
    force: opts.force,
  });
  return { ...buildOptions(value, opts.random), fromCache };
}

/** Terim anahtarına göre kaç kez ve en son ne zaman sorulduğu. */
export async function quizStats(db: DuopdfDB): Promise<Map<string, TermQuizStats>> {
  const stats = new Map<string, TermQuizStats>();
  await db.quizAttempts.each((a) => {
    for (const key of a.termKeys) {
      const s = stats.get(key) ?? { count: 0, lastAt: 0 };
      stats.set(key, { count: s.count + 1, lastAt: Math.max(s.lastAt, a.createdAt) });
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
    sentence: item.sentence,
    sentenceKey: await sentenceKey(item.sentence),
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

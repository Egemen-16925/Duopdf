import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { multipleChoiceSchema } from "../ai/schemas";
import { DuopdfDB, type OccurrenceRecord, type TermRecord } from "../db/db";
import { patternFor } from "../learning/matcher";
import { buildOptions, countEligible, locateTerm, makeQuestion, pickQuizItems, quizStats, recordAttempt } from "./quiz";

function term(id: number, lemma: string, surface: string, status: TermRecord["status"] = "unknown"): TermRecord {
  return {
    id,
    key: lemma,
    lemma,
    surface,
    pattern: patternFor(surface.split(" "), lemma.split(" ")),
    status,
    meaning: "",
    explanation: "",
    note: "",
    createdAt: 0,
    updatedAt: 0,
    review: { intervalDays: 0, dueAt: 0, streak: 0 },
  };
}

let occId = 1;
function occ(termId: number, sentence: string): OccurrenceRecord {
  return { id: occId++, termId, documentId: 1, page: 1, view: "text", sentence, createdAt: 0 };
}

const run = term(1, "run", "ran");
const carry = term(2, "carry out", "carried out", "learning");
const known = term(3, "memory", "memory", "known");
const occurrences = [
  occ(1, "We ran the tests before the release."),
  occ(2, "The team carried out a careful review of the code."),
  occ(3, "The garbage collector frees unused memory."),
  occ(1, "Short."),
];

describe("locateTerm", () => {
  it("finds inflected and multi-word terms in the sentence", () => {
    const s = "The team carried out a careful review.";
    const at = locateTerm(carry, s)!;
    expect(s.slice(at.start, at.end)).toBe("carried out");
    expect(locateTerm(run, "Nothing here.")).toBeNull();
  });
});

describe("pickQuizItems", () => {
  it("asks only the chosen statuses, one usable sentence per term", () => {
    const items = pickQuizItems([run, carry, known], occurrences, new Map(), { count: 10, statuses: ["unknown", "learning"] });
    expect(items.map((i) => i.term.lemma).sort()).toEqual(["carry out", "run"]);
    const r = items.find((i) => i.term.lemma === "run")!;
    expect(r.sentence).toBe("We ran the tests before the release.");
    expect(r.surface).toBe("ran");
  });

  it("prefers words that were asked less", () => {
    const stats = new Map([["run", { count: 3, lastAt: 5 }]]);
    const items = pickQuizItems([run, carry], occurrences, stats, { count: 1, statuses: ["unknown", "learning"] });
    expect(items[0].term.lemma).toBe("carry out");
  });

  it("skips terms whose sentences are unusable", () => {
    const lonely = term(4, "commit", "commit");
    expect(countEligible([lonely], [occ(4, "commit")], ["unknown"])).toBe(0);
  });
});

const mc = {
  dogruCeviri: "Sürümden önce testleri çalıştırdık.",
  celdiriciler: [
    { metin: "Sürümden önce testlerden kaçtık.", hata: "run burada kaçmak değil." },
    { metin: "Sürümden sonra testleri çalıştırdık.", hata: "önce/sonra yanlış." },
    { metin: "Sürümden önce testleri yazdık.", hata: "run yazmak değil." },
  ],
};

describe("multipleChoiceSchema", () => {
  it("accepts four different options", () => {
    expect(multipleChoiceSchema.safeParse(mc).success).toBe(true);
  });

  it("rejects a distractor that equals the correct answer apart from punctuation and case", () => {
    const bad = { ...mc, celdiriciler: [{ metin: "sürümden önce testleri çalıştırdık", hata: "x" }, ...mc.celdiriciler.slice(1)] };
    expect(multipleChoiceSchema.safeParse(bad).success).toBe(false);
  });

  it("requires exactly three distractors", () => {
    expect(multipleChoiceSchema.safeParse({ ...mc, celdiriciler: mc.celdiriciler.slice(0, 2) }).success).toBe(false);
  });
});

describe("buildOptions", () => {
  it("keeps exactly one correct option and puts it in a random place", () => {
    const places = new Set<number>();
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const { options, correctIndex } = buildOptions(mc, () => r);
      expect(options).toHaveLength(4);
      expect(options.filter((o) => o.correct)).toHaveLength(1);
      expect(options[correctIndex].text).toBe(mc.dogruCeviri);
      places.add(correctIndex);
    }
    expect(places.size).toBeGreaterThan(1);
  });
});

describe("with the database", () => {
  let db: DuopdfDB;
  let n = 0;
  beforeEach(() => {
    db = new DuopdfDB(`quiz-${n++}`);
    fetchMock.mockReset();
  });
  afterEach(async () => {
    await db.delete();
  });

  const target = { profile: { id: "p", name: "T", baseUrl: "https://x.test/v1", apiKey: "k" }, model: "strong" };
  const completion = (content: string) => ({
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
    headers: new Headers(),
  });

  it("generates a question once and then serves it from the cache", async () => {
    fetchMock.mockResolvedValueOnce(completion(JSON.stringify(mc)));
    const [item] = pickQuizItems([run], occurrences, new Map(), { count: 1, statuses: ["unknown"] });
    const first = await makeQuestion(db, target, item);
    expect(first.fromCache).toBe(false);
    expect(first.options[first.correctIndex].text).toBe(mc.dogruCeviri);
    const second = await makeQuestion(db, target, item);
    expect(second.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tells the model to reuse the reader's saved translation", async () => {
    await db.sentences.add({
      key: await (await import("../learning/sentences")).sentenceKey("We ran the tests before the release."),
      text: "We ran the tests before the release.",
      translation: "Sürümden önce testleri çalıştırdık.",
      grammarNote: "",
      createdAt: 0,
      updatedAt: 0,
    } as never);
    fetchMock.mockResolvedValueOnce(completion(JSON.stringify(mc)));
    const [item] = pickQuizItems([run], occurrences, new Map(), { count: 1, statuses: ["unknown"] });
    await makeQuestion(db, target, item);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain("Doğru çeviri olarak bunu aynen kullan: Sürümden önce testleri çalıştırdık.");
  });

  it("records attempts with stable term keys and counts them", async () => {
    const [item] = pickQuizItems([run], occurrences, new Map(), { count: 1, statuses: ["unknown"] });
    const question = { ...buildOptions(mc, () => 0), fromCache: false };
    const wrong = (question.correctIndex + 1) % 4;
    const attempt = await recordAttempt(db, item, question, wrong, 1000);
    expect(attempt).toMatchObject({ kind: "mcq", termKeys: ["run"], correct: false, chosenIndex: wrong });
    await recordAttempt(db, item, question, question.correctIndex, 2000);
    expect((await quizStats(db)).get("run")).toEqual({ count: 2, lastAt: 2000 });
  });
});

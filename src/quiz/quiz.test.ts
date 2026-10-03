import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { multipleChoiceSchema } from "../ai/schemas";
import { DuopdfDB, type OccurrenceRecord, type TermRecord } from "../db/db";
import { patternFor } from "../learning/matcher";
import { buildQuestion, countEligible, makeQuestion, pickQuizItems, quizStats, recordAttempt } from "./quiz";

function term(id: number, lemma: string, surface: string, status: TermRecord["status"] = "unknown"): TermRecord {
  return {
    id,
    key: lemma,
    lemma,
    surface,
    pattern: patternFor(surface.split(" "), lemma.split(" ")),
    status,
    meaning: "çalıştırmak",
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
const lonely = term(4, "commit", "commit");
const occurrences = [occ(1, "We ran the tests before the release."), occ(2, "The team carried out a careful review."), occ(1, "Short.")];

describe("pickQuizItems", () => {
  it("asks only the chosen statuses, even words without a saved sentence", () => {
    const items = pickQuizItems([run, carry, known, lonely], occurrences, new Map(), {
      count: 10,
      statuses: ["unknown", "learning"],
      mode: "en-tr",
    });
    expect(items.map((i) => i.term.lemma).sort()).toEqual(["carry out", "commit", "run"]);
    expect(items.find((i) => i.term.lemma === "run")!.context).toBe("We ran the tests before the release.");
    expect(items.find((i) => i.term.lemma === "commit")!.context).toBeUndefined();
    expect(countEligible([run, carry, known, lonely], ["unknown"])).toBe(2);
  });

  it("prefers words asked less, then words with more mistakes", () => {
    const stats = new Map([
      ["run", { count: 2, correct: 0, wrong: 2, lastAt: 5 }],
      ["carry out", { count: 2, correct: 2, wrong: 0, lastAt: 1 }],
      ["commit", { count: 3, correct: 0, wrong: 3, lastAt: 1 }],
    ]);
    const items = pickQuizItems([run, carry, lonely], occurrences, stats, { count: 1, statuses: ["unknown", "learning"], mode: "en-tr" });
    expect(items[0].term.lemma).toBe("run");
  });

  it("mixes both directions in mixed mode", () => {
    const items = pickQuizItems([run, carry, lonely, term(5, "deploy", "deploy")], occurrences, new Map(), {
      count: 4,
      statuses: ["unknown", "learning"],
      mode: "mixed",
    });
    expect(items.filter((i) => i.direction === "en-tr")).toHaveLength(2);
    expect(items.filter((i) => i.direction === "tr-en")).toHaveLength(2);
  });
});

const mc = {
  cumle: "The nightly job ran without errors.",
  hedef: "ran",
  turkce: "Gece işi hatasız çalıştı.",
  celdiriciler: [
    { metin: "Gece işi hatasız kaçtı.", hata: "run burada kaçmak değil." },
    { metin: "Gece işi hatalarla çalıştı.", hata: "olumsuzluk yanlış." },
    { metin: "Gece işi hatasız yazıldı.", hata: "run yazmak değil." },
  ],
};

describe("multipleChoiceSchema", () => {
  it("accepts a new sentence with four different options", () => {
    expect(multipleChoiceSchema.safeParse(mc).success).toBe(true);
  });

  it("requires the target word to appear in the sentence", () => {
    expect(multipleChoiceSchema.safeParse({ ...mc, hedef: "runs" }).success).toBe(false);
  });

  it("rejects a distractor equal to the answer apart from punctuation and case", () => {
    const bad = { ...mc, celdiriciler: [{ metin: "gece işi hatasız çalıştı", hata: "x" }, ...mc.celdiriciler.slice(1)] };
    expect(multipleChoiceSchema.safeParse(bad).success).toBe(false);
  });
});

describe("buildQuestion", () => {
  it("uses Turkish options for en-tr and highlights the target word", () => {
    const q = buildQuestion(mc, "en-tr", () => 0.5);
    expect(q.options[q.correctIndex].text).toBe(mc.turkce);
    expect(q.options.filter((o) => o.correct)).toHaveLength(1);
    expect(q.english.slice(q.highlight!.start, q.highlight!.end)).toBe("ran");
  });

  it("uses the English sentence as the answer for tr-en", () => {
    const enMc = {
      ...mc,
      celdiriciler: [
        { metin: "The nightly job escaped without errors.", hata: "x" },
        { metin: "The nightly job ran with errors.", hata: "y" },
        { metin: "The nightly job was written without errors.", hata: "z" },
      ],
    };
    const q = buildQuestion(enMc, "tr-en", () => 0.1);
    expect(q.options[q.correctIndex].text).toBe(mc.cumle);
  });

  it("puts the correct option in different places", () => {
    const places = new Set([0, 0.3, 0.6, 0.99].map((r) => buildQuestion(mc, "en-tr", () => r).correctIndex));
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
  const item = { term: run, direction: "en-tr" as const, context: "We ran the tests before the release." };

  it("asks for a new sentence every time and tells the model which sentences to avoid", async () => {
    fetchMock.mockResolvedValue(completion(JSON.stringify(mc)));
    const first = await makeQuestion(db, target, item);
    await recordAttempt(db, item, first, first.correctIndex, 1000);
    await makeQuestion(db, target, item);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.temperature).toBe(0.9);
    expect(firstBody.messages[1].content).toContain("Belgede geçtiği cümle (yalnızca anlamı belirlemek için): We ran the tests");
    expect(firstBody.messages[1].content).not.toContain("Daha önce sorulan");
    expect(secondBody.messages[1].content).toContain("- The nightly job ran without errors.");
  });

  it("counts right and wrong answers per word", async () => {
    const question = buildQuestion(mc, "en-tr", () => 0);
    const wrong = (question.correctIndex + 1) % 4;
    const attempt = await recordAttempt(db, item, question, wrong, 1000);
    expect(attempt).toMatchObject({ kind: "mcq", direction: "en-tr", termKeys: ["run"], correct: false, sentence: mc.cumle, translation: mc.turkce });
    await recordAttempt(db, item, question, question.correctIndex, 2000);
    await recordAttempt(db, item, question, question.correctIndex, 3000);
    expect((await quizStats(db)).get("run")).toEqual({ count: 3, correct: 2, wrong: 1, lastAt: 3000 });
  });
});

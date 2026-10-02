import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuopdfDB } from "../db/db";
import { cached } from "./cache";
import { tokenize } from "./lemma";
import { buildMatcher } from "./matcher";
import { deleteTerm, listTerms, markTerm, occurrenceCounts, occurrencesOf, setTermStatus } from "./terms";

let db: DuopdfDB;
let counter = 0;

beforeEach(() => {
  db = new DuopdfDB(`terms-${counter++}`);
});

afterEach(async () => {
  await db.delete();
});

const occurrence = (sentence: string, documentId = 1) => ({ documentId, page: 3, view: "text" as const, sentence });

describe("markTerm", () => {
  it("creates a term with a pattern that covers other inflections", async () => {
    const term = await markTerm(db, {
      surface: "ran",
      lemma: "run",
      status: "unknown",
      meaning: "çalıştırmak",
      occurrence: occurrence("We ran the tests."),
    });
    expect(term).toMatchObject({ key: "run", lemma: "run", surface: "ran", status: "unknown", meaning: "çalıştırmak" });
    const matcher = buildMatcher([term]);
    expect(matcher.findExact(tokenize("running"))?.id).toBe(term.id);
    expect(await occurrencesOf(db, term.id)).toHaveLength(1);
  });

  it("puts a different inflection into the same record", async () => {
    const first = await markTerm(db, { surface: "running", lemma: "run", status: "unknown", occurrence: occurrence("A") });
    const second = await markTerm(db, { surface: "ran", lemma: "run", status: "learning", occurrence: occurrence("B") });
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("learning");
    expect(await db.terms.count()).toBe(1);
    expect(await occurrencesOf(db, first.id)).toHaveLength(2);
  });

  it("keeps the old meaning when no new meaning is given and skips duplicate sentences", async () => {
    const t = await markTerm(db, { surface: "commit", lemma: "commit", status: "unknown", meaning: "işlemek", occurrence: occurrence("S") });
    const again = await markTerm(db, { termId: t.id, surface: "commit", lemma: "commit", status: "known", occurrence: occurrence("S") });
    expect(again.meaning).toBe("işlemek");
    expect(await occurrencesOf(db, t.id)).toHaveLength(1);
  });

  it("stores multi-word terms", async () => {
    const t = await markTerm(db, { surface: "carried out", lemma: "carry out", status: "unknown" });
    expect(t.key).toBe("carry out");
    expect(buildMatcher([t]).findExact(tokenize("carries out"))?.id).toBe(t.id);
  });
});

describe("status, delete, listing", () => {
  it("changes status, counts occurrences and deletes with occurrences", async () => {
    const a = await markTerm(db, { surface: "a1", lemma: "alpha", status: "unknown", occurrence: occurrence("x") }, 1);
    const b = await markTerm(db, { surface: "b1", lemma: "beta", status: "unknown", occurrence: occurrence("y") }, 2);
    await markTerm(db, { termId: b.id, surface: "b1", lemma: "beta", status: "unknown", occurrence: occurrence("z", 2) }, 3);
    await setTermStatus(db, a.id, "known");
    expect((await db.terms.get(a.id))?.status).toBe("known");
    expect((await listTerms(db)).map((t) => t.lemma)).toEqual(["beta", "alpha"]);
    expect(Object.fromEntries(await occurrenceCounts(db))).toEqual({ [a.id]: 1, [b.id]: 2 });
    await deleteTerm(db, b.id);
    expect(await db.terms.count()).toBe(1);
    expect(await db.occurrences.count()).toBe(1);
  });
});

describe("cached", () => {
  it("computes once per input and recomputes when forced", async () => {
    const op = { id: "wordMeaning", version: 1 };
    const compute = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    expect(await cached(db, op, { w: "run" }, compute)).toEqual({ value: "first", fromCache: false });
    expect(await cached(db, op, { w: "run" }, compute)).toEqual({ value: "first", fromCache: true });
    expect(await cached(db, op, { w: "run" }, compute, { force: true })).toEqual({ value: "second", fromCache: false });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("separates prompt versions", async () => {
    await cached(db, { id: "x", version: 1 }, "in", async () => "v1");
    expect((await cached(db, { id: "x", version: 2 }, "in", async () => "v2")).value).toBe("v2");
  });
});

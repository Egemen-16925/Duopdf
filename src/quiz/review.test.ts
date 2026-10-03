import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DuopdfDB } from "../db/db";
import { markTerm } from "../learning/terms";
import { applyAnswer, describeDue, dueTerms, endOfDay, recordReview } from "./review";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 3, 12, 0).getTime();
const fresh = { status: "unknown" as const, review: { streak: 0, intervalDays: 0, dueAt: now } };

describe("applyAnswer", () => {
  it("grows the interval 1, 3, 7 days and promotes to known after three right answers in a row", () => {
    const a = applyAnswer(fresh, true, now);
    expect(a).toMatchObject({ before: "unknown", after: "learning", review: { streak: 1, intervalDays: 1, dueAt: now + DAY } });
    const b = applyAnswer({ status: a.after, review: a.review }, true, now);
    expect(b.review).toMatchObject({ streak: 2, intervalDays: 3 });
    expect(b.after).toBe("learning");
    const c = applyAnswer({ status: b.after, review: b.review }, true, now);
    expect(c).toMatchObject({ after: "known", review: { streak: 3, intervalDays: 7 } });
    const d = applyAnswer({ status: c.after, review: c.review }, true, now);
    expect(d.review.intervalDays).toBe(18);
  });

  it("makes a wrong word due again right away and resets the streak", () => {
    const wrong = applyAnswer({ status: "learning", review: { streak: 2, intervalDays: 3, dueAt: now } }, false, now);
    expect(wrong).toMatchObject({ after: "learning", review: { streak: 0, intervalDays: 0, dueAt: now } });
  });

  it("moves a known word back to learning when answered wrong", () => {
    expect(applyAnswer({ status: "known", review: { streak: 5, intervalDays: 40, dueAt: now } }, false, now).after).toBe("learning");
  });
});

describe("due queue", () => {
  const term = (key: string, dueAt: number) => ({ key, review: { streak: 0, intervalDays: 0, dueAt } }) as never;

  it("includes words due any time today, most overdue first", () => {
    const list = dueTerms([term("later", now + 2 * DAY), term("tonight", endOfDay(now) - 1), term("old", now - DAY)], now);
    expect(list.map((t: { key: string }) => t.key)).toEqual(["old", "tonight"]);
  });

  it("describes the next review in Turkish", () => {
    expect(describeDue(now, now)).toBe("bugün");
    expect(describeDue(now + DAY, now)).toBe("yarın");
    expect(describeDue(now + 3 * DAY, now)).toBe("3 gün sonra");
  });
});

describe("recordReview", () => {
  it("stores the new schedule and status on the term", async () => {
    const db = new DuopdfDB("review-1");
    await markTerm(db, { surface: "ran", lemma: "run", status: "unknown" }, now);
    const change = await recordReview(db, "run", true, now + 1000);
    expect(change?.after).toBe("learning");
    const saved = await db.terms.where("key").equals("run").first();
    expect(saved).toMatchObject({ status: "learning", review: { streak: 1, intervalDays: 1 }, updatedAt: now + 1000 });
    await db.delete();
  });
});

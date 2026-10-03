import { describe, expect, it } from "vitest";
import type { TermRecord } from "../db/db";
import { accuracy, dailyCounts, dailyStreak, mostMistaken, startOfDay } from "./stats";

const now = new Date(2026, 9, 3, 15, 0).getTime();
const daysAgo = (n: number, hour = 10) => {
  const d = new Date(2026, 9, 3 - n, hour, 0);
  return d.getTime();
};

describe("dailyCounts", () => {
  it("counts answers per local day for the last N days, oldest first", () => {
    const counts = dailyCounts(
      [
        { createdAt: daysAgo(0), correct: true },
        { createdAt: daysAgo(0, 23), correct: false },
        { createdAt: daysAgo(2), correct: true },
        { createdAt: daysAgo(40), correct: true },
      ],
      now,
      7,
    );
    expect(counts).toHaveLength(7);
    expect(counts[6]).toMatchObject({ day: startOfDay(now), total: 2, correct: 1 });
    expect(counts[4]).toMatchObject({ total: 1, correct: 1 });
    expect(counts.reduce((n, d) => n + d.total, 0)).toBe(3);
    expect(accuracy(counts)).toBe(67);
    expect(accuracy(dailyCounts([], now, 7))).toBeNull();
  });
});

describe("dailyStreak", () => {
  it("counts consecutive study days ending today", () => {
    expect(dailyStreak([daysAgo(0), daysAgo(1), daysAgo(2), daysAgo(4)], now)).toEqual({ days: 3, today: true });
  });

  it("keeps yesterday's streak alive until today ends", () => {
    expect(dailyStreak([daysAgo(1), daysAgo(2)], now)).toEqual({ days: 2, today: false });
  });

  it("is zero after a missed day", () => {
    expect(dailyStreak([daysAgo(2), daysAgo(3)], now)).toEqual({ days: 0, today: false });
  });
});

describe("mostMistaken", () => {
  const term = (key: string) => ({ key, lemma: key }) as TermRecord;
  it("orders words by mistakes and skips words never missed", () => {
    const list = mostMistaken(
      [term("run"), term("commit"), term("deploy")],
      [
        { termKeys: ["run"], correct: false },
        { termKeys: ["run"], correct: true },
        { termKeys: ["commit"], correct: false },
        { termKeys: ["commit"], correct: false },
        { termKeys: ["deploy"], correct: true },
        { termKeys: ["gone"], correct: false },
      ],
    );
    expect(list.map((w) => [w.term.key, w.wrong, w.correct])).toEqual([
      ["commit", 2, 0],
      ["run", 1, 1],
    ]);
  });
});

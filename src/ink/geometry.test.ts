import { describe, expect, it } from "vitest";
import { flatten, pointerWeight, simplify, strokeHits, toPoints, type Point } from "./geometry";
import { weightFactor } from "./render";

describe("points", () => {
  it("round-trips flat arrays with rounding", () => {
    const pts: Point[] = [
      [0.123456789, 0.5, 0.333],
      [0.2, 0.6, 1],
    ];
    expect(toPoints(flatten(pts))).toEqual([
      [0.12346, 0.5, 0.33],
      [0.2, 0.6, 1],
    ]);
  });
});

describe("pointerWeight", () => {
  it("uses a middle weight for mouse and touch", () => {
    expect(pointerWeight(0, "mouse")).toBe(0.5);
    expect(pointerWeight(1, "touch")).toBe(0.5);
  });

  it("uses real pen pressure, clamped", () => {
    expect(pointerWeight(0.2, "pen")).toBe(0.2);
    expect(pointerWeight(1.4, "pen")).toBe(1);
    expect(weightFactor(pointerWeight(0.9, "pen"))).toBeGreaterThan(weightFactor(pointerWeight(0.1, "pen")));
    expect(weightFactor(0.5)).toBeCloseTo(1);
  });
});

describe("simplify", () => {
  it("drops points closer than the step but keeps the ends", () => {
    const pts: Point[] = [
      [0, 0, 0.5],
      [0.0001, 0, 0.5],
      [0.0002, 0, 0.5],
      [0.01, 0, 0.5],
      [0.0101, 0, 0.5],
    ];
    expect(simplify(pts, 1).map((p) => p[0])).toEqual([0, 0.01, 0.0101]);
  });
});

describe("strokeHits", () => {
  // Yatay çizgi: (0.1, 0.5) → (0.5, 0.5)
  const flat = flatten([
    [0.1, 0.5, 0.5],
    [0.5, 0.5, 0.5],
  ]);

  it("hits near the line and misses far away", () => {
    expect(strokeHits(flat, 0.002, 0.3, 0.505, 0.01, 1)).toBe(true);
    expect(strokeHits(flat, 0.002, 0.3, 0.6, 0.01, 1)).toBe(false);
    expect(strokeHits(flat, 0.002, 0.7, 0.5, 0.01, 1)).toBe(false);
  });

  it("measures vertical distance in page proportions (tall pages)", () => {
    // Yükseklik genişliğin 1.3 katı: dikeyde 0.01 oran = 0.013 genişlik birimi.
    expect(strokeHits(flat, 0, 0.3, 0.51, 0.011, 1)).toBe(true);
    expect(strokeHits(flat, 0, 0.3, 0.51, 0.011, 1.3)).toBe(false);
  });

  it("handles single-point dots", () => {
    expect(strokeHits(flatten([[0.2, 0.2, 1]]), 0.004, 0.201, 0.2, 0.002, 1)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { flatten, pressureFactor, simplify, strokeHits, toPoints, type Point } from "./geometry";

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

describe("pressureFactor", () => {
  it("ignores pressure for mouse and touch", () => {
    expect(pressureFactor(0, "mouse")).toBe(1);
    expect(pressureFactor(0.5, "touch")).toBe(1);
  });

  it("maps pen pressure to thin..thick", () => {
    expect(pressureFactor(0, "pen")).toBeCloseTo(0.35);
    expect(pressureFactor(1, "pen")).toBeCloseTo(1.65);
    expect(pressureFactor(0.5, "pen")).toBeGreaterThan(pressureFactor(0.2, "pen"));
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

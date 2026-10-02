import { describe, expect, it } from "vitest";
import { wheelZoomFactor, ZoomAccumulator } from "./zoomGesture";

describe("wheelZoomFactor", () => {
  it("treats a mouse wheel notch as one step", () => {
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0 })).toBeCloseTo(1.1);
    expect(wheelZoomFactor({ deltaY: 120, deltaMode: 0 })).toBeCloseTo(1 / 1.1);
    expect(wheelZoomFactor({ deltaY: -3, deltaMode: 1 })).toBeCloseTo(1.1);
  });

  it("zooms smoothly and proportionally for touchpad pinch deltas", () => {
    const small = wheelZoomFactor({ deltaY: -2, deltaMode: 0 });
    const larger = wheelZoomFactor({ deltaY: -10, deltaMode: 0 });
    expect(small).toBeGreaterThan(1);
    expect(small).toBeLessThan(1.03);
    expect(larger).toBeGreaterThan(small);
    expect(wheelZoomFactor({ deltaY: 4, deltaMode: 0 })).toBeLessThan(1);
    expect(wheelZoomFactor({ deltaY: 0, deltaMode: 0 })).toBe(1);
  });

  it("is symmetric: pinching out then in returns to the start", () => {
    expect(wheelZoomFactor({ deltaY: -7, deltaMode: 0 }) * wheelZoomFactor({ deltaY: 7, deltaMode: 0 })).toBeCloseTo(1);
  });
});

describe("ZoomAccumulator", () => {
  it("keeps tiny factors until the rounded scale would change", () => {
    const acc = new ZoomAccumulator();
    expect(acc.add(1.002, 1)).toBeNull();
    expect(acc.add(1.002, 1)).toBeNull();
    const applied = acc.add(1.004, 1);
    expect(applied).toBeCloseTo(1.008);
    expect(acc.add(1.002, 1.01)).toBeNull();
  });

  it("applies a full notch immediately", () => {
    expect(new ZoomAccumulator().add(1.1, 1)).toBeCloseTo(1.1);
  });
});

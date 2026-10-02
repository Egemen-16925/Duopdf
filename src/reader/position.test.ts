import { describe, expect, it } from "vitest";
import { locate, scrollTopFor } from "./position";

const boxes = [
  { top: 0, height: 1000 },
  { top: 1000, height: 500 },
  { top: 1500, height: 2000 },
];

describe("locate", () => {
  it("finds the section under the top edge and the progress inside it", () => {
    expect(locate(0, boxes)).toEqual({ index: 0, offset: 0 });
    expect(locate(250, boxes)).toEqual({ index: 0, offset: 0.25 });
    expect(locate(1250, boxes)).toEqual({ index: 1, offset: 0.5 });
    expect(locate(3000, boxes)).toEqual({ index: 2, offset: 0.75 });
  });

  it("clamps beyond the end and handles empty input", () => {
    expect(locate(9000, boxes)).toEqual({ index: 2, offset: 1 });
    expect(locate(10, [])).toEqual({ index: 0, offset: 0 });
  });
});

describe("scrollTopFor", () => {
  it("is the inverse of locate", () => {
    for (const top of [0, 250, 1250, 3000]) {
      const { index, offset } = locate(top, boxes);
      expect(scrollTopFor(index, offset, boxes)).toBe(top);
    }
  });

  it("clamps out-of-range sections", () => {
    expect(scrollTopFor(7, 0, boxes)).toBe(1500);
    expect(scrollTopFor(0, 0, [])).toBe(0);
  });
});

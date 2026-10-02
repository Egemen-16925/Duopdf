import { describe, expect, it } from "vitest";
import { looksScanned } from "./textCheck";

describe("looksScanned", () => {
  it("flags pages without text", () => {
    expect(looksScanned([0, 0, 0])).toBe(true);
  });

  it("flags a few stray characters (e.g. page numbers only)", () => {
    expect(looksScanned([1, 1, 2, 1, 2])).toBe(true);
  });

  it("accepts a PDF with a text layer even if the cover is an image", () => {
    expect(looksScanned([0, 1200, 1500])).toBe(false);
  });
});

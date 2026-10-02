// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sentenceAround } from "../learning/sentence";
import { buildTextMap } from "../learning/textMap";
import { centerInside, renderOcrLayer } from "./layer";
import type { OcrResult, OcrWord } from "./result";

const w = (text: string, x: number, y: number, h: number): OcrWord => ({ text, x, y, w: 0.05, h, confidence: 90 });

const result: OcrResult = {
  width: 1000,
  height: 1000,
  paragraphs: [
    [[w("Lecture", 0.1, 0.05, 0.06), w("4", 0.2, 0.05, 0.06)]],
    [
      // Aşağı uzanan harfli kelimelerin kutusu daha uzun ("cheap", "copy").
      [w("Branches", 0.1, 0.2, 0.03), w("are", 0.2, 0.205, 0.02), w("cheap,", 0.3, 0.205, 0.03)],
      [w("so", 0.1, 0.25, 0.02), w("copy", 0.2, 0.25, 0.03), w("one.", 0.3, 0.25, 0.02)],
    ],
  ],
};

describe("renderOcrLayer", () => {
  it("gives every word in a line the line's top and height", () => {
    const layer = document.createElement("div");
    renderOcrLayer(layer, result, { unitWidth: 1000, unitHeight: 1000 });
    const spans = [...layer.querySelectorAll("span:not(.ocr-break)")] as HTMLElement[];
    const line = spans.filter((s) => ["Branches", "are", "cheap,"].includes(s.textContent!));
    expect(new Set(line.map((s) => s.style.top)).size).toBe(1);
    expect(new Set(line.map((s) => s.style.getPropertyValue("--font-height"))).size).toBe(1);
  });

  it("keeps a sentence together across lines but separates paragraphs", () => {
    const layer = document.createElement("div");
    document.body.append(layer);
    renderOcrLayer(layer, result, { unitWidth: 1000, unitHeight: 1000 });
    const text = buildTextMap(layer, "pdf").text;
    expect(sentenceAround(text, text.indexOf("cheap")).text).toBe("Branches are cheap, so copy one.");
    expect(sentenceAround(text, text.indexOf("Lecture")).text).toBe("Lecture 4");
  });

  it("skips words the caller already has as real text", () => {
    const layer = document.createElement("div");
    const count = renderOcrLayer(layer, result, { unitWidth: 1000, unitHeight: 1000, skip: (word) => word.text === "4" });
    expect(count).toBe(7);
  });
});

describe("centerInside", () => {
  it("checks the word's center against a box", () => {
    expect(centerInside(w("a", 0.1, 0.1, 0.02), { x: 0.05, y: 0.05, w: 0.2, h: 0.2 })).toBe(true);
    expect(centerInside(w("a", 0.5, 0.5, 0.02), { x: 0.05, y: 0.05, w: 0.2, h: 0.2 })).toBe(false);
  });
});

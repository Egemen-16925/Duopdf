import { describe, expect, it } from "vitest";
import { fromTesseract, ocrParagraphTexts, ocrWordCount, type TesseractPage } from "./result";

const word = (text: string, x0: number, y0: number, confidence = 90) => ({
  text,
  confidence,
  bbox: { x0, y0, x1: x0 + 50, y1: y0 + 20 },
});

const page: TesseractPage = {
  blocks: [
    {
      paragraphs: [
        {
          lines: [
            { words: [word("Version", 0, 0), word("control", 60, 0), word("~", 120, 0, 30), word("sys-", 140, 0)] },
            { words: [word("tems", 0, 30), word("record", 60, 30), word("changes.", 120, 30)] },
          ],
        },
        { lines: [{ words: [word("|", 0, 80, 20), word("—", 20, 80, 95)] }] },
        { lines: [{ words: [word("Figure", 0, 100), word("2", 60, 100, 70)] }] },
      ],
    },
  ],
};

describe("fromTesseract", () => {
  const result = fromTesseract(page, 200, 400);

  it("normalizes boxes to the image size", () => {
    expect(result.paragraphs[0][0][0]).toEqual({ text: "Version", x: 0, y: 0, w: 0.25, h: 0.05, confidence: 90 });
    expect(result.paragraphs[0][1][1]).toMatchObject({ x: 0.3, y: 0.075 });
  });

  it("drops low-confidence noise and symbol-only words, and empty paragraphs", () => {
    expect(result.paragraphs).toHaveLength(2);
    expect(result.paragraphs[0][0].map((w) => w.text)).toEqual(["Version", "control", "sys-"]);
    expect(ocrWordCount(result)).toBe(8);
  });

  it("turns paragraphs into text and joins hyphenated line breaks", () => {
    expect(ocrParagraphTexts(result)).toEqual(["Version control systems record changes.", "Figure 2"]);
  });

  it("keeps heading and label lines separate but joins wrapped prose", () => {
    const lines = (...rows: string[][]) =>
      rows.map((words, i) => ({ words: words.map((text, j) => word(text, j * 60, i * 30)) }));
    const diagram = fromTesseract(
      {
        blocks: [
          {
            paragraphs: [
              { lines: lines(["Figure", "1:", "Git", "workflow"], ["Working", "directory"], ["Staging", "area"]) },
              { lines: lines(["Developers", "should", "avoid"], ["holding", "large", "objects."], ["Then", "push."]) },
            ],
          },
        ],
      },
      600,
      600,
    );
    expect(ocrParagraphTexts(diagram)).toEqual([
      "Figure 1: Git workflow",
      "Working directory",
      "Staging area",
      "Developers should avoid holding large objects. Then push.",
    ]);
  });

  it("handles pages without blocks", () => {
    expect(fromTesseract({ blocks: null }, 10, 10).paragraphs).toEqual([]);
  });
});

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { StrokeRecord } from "../db/db";
import { inkedPdfFromPdf, toPdfPoint } from "./exportPdf";

const box = { x: 10, y: 20, width: 600, height: 800 };

describe("toPdfPoint", () => {
  it("maps the top-left of an unrotated page to the crop box's top-left", () => {
    expect(toPdfPoint(0, 0, box, 0)).toEqual({ x: 10, y: 820 });
    expect(toPdfPoint(1, 1, box, 0)).toEqual({ x: 610, y: 20 });
  });

  it("handles rotated pages", () => {
    // 90° saat yönünde: ekranın sol üstü, sayfanın sol altıdır.
    expect(toPdfPoint(0, 0, box, 90)).toEqual({ x: 10, y: 20 });
    expect(toPdfPoint(1, 0, box, 90)).toEqual({ x: 10, y: 820 });
    expect(toPdfPoint(0, 0, box, 180)).toEqual({ x: 610, y: 20 });
    expect(toPdfPoint(0, 0, box, 270)).toEqual({ x: 610, y: 820 });
    expect(toPdfPoint(0, 0, box, -90)).toEqual(toPdfPoint(0, 0, box, 270));
  });
});

describe("inkedPdfFromPdf", () => {
  it("adds drawings only to pages that have strokes and keeps the page count", async () => {
    const src = await PDFDocument.create();
    src.addPage([600, 800]);
    src.addPage([600, 800]);
    const bytes = await src.save();
    const stroke: StrokeRecord = {
      id: "a",
      docHash: "h",
      view: "text",
      page: 2,
      color: "#e11d48",
      width: 0.003,
      points: [0.1, 0.1, 0.5, 0.5, 0.5, 0.8],
      createdAt: 1,
      updatedAt: 1,
    };
    const out = await PDFDocument.load(await inkedPdfFromPdf(bytes, [stroke, { ...stroke, id: "b", page: 9 }]));
    expect(out.getPageCount()).toBe(2);
    const contents = (n: number) => out.getPage(n).node.Contents();
    expect(contents(0)).toBeUndefined();
    expect(contents(1)).toBeDefined();
  });
});

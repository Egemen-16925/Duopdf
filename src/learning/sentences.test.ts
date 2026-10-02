import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuopdfDB } from "../db/db";
import { getSentence, translateSentence } from "./sentences";
import { deleteTerm, markTerm } from "./terms";

let db: DuopdfDB;
let counter = 0;

beforeEach(() => {
  db = new DuopdfDB(`sentences-${counter++}`);
});

afterEach(async () => {
  await db.delete();
});

const sentence = "Developers commit their changes   before pushing them.";

describe("translateSentence", () => {
  it("translates once and serves the saved translation afterwards", async () => {
    const translate = vi.fn().mockResolvedValue({ ceviri: "Geliştiriciler değişikliklerini gönderir.", dilbilgisiNotu: "Geniş zaman." });
    const first = await translateSentence(db, sentence, translate, { source: { documentHash: "h", page: 3 } });
    expect(first.fromCache).toBe(false);
    expect(first.record).toMatchObject({ text: "Developers commit their changes before pushing them.", grammarNote: "Geniş zaman.", page: 3 });

    // Boşluk farkı aynı cümle sayılır.
    const second = await translateSentence(db, "Developers commit their changes before pushing them.", translate);
    expect(second.fromCache).toBe(true);
    expect(second.record.translation).toBe("Geliştiriciler değişikliklerini gönderir.");
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith("Developers commit their changes before pushing them.");
  });

  it("retranslates on request and replaces the saved translation", async () => {
    const translate = vi
      .fn()
      .mockResolvedValueOnce({ ceviri: "kötü", dilbilgisiNotu: "" })
      .mockResolvedValueOnce({ ceviri: "iyi", dilbilgisiNotu: "not" });
    await translateSentence(db, sentence, translate, { now: 1 });
    const again = await translateSentence(db, sentence, translate, { force: true, now: 2 });
    expect(again.record).toMatchObject({ translation: "iyi", createdAt: 1, updatedAt: 2 });
    expect(await db.sentences.count()).toBe(1);
    expect((await getSentence(db, sentence))?.translation).toBe("iyi");
  });

  it("does not save anything when translation fails", async () => {
    await expect(translateSentence(db, sentence, () => Promise.reject(new Error("429")))).rejects.toThrow("429");
    expect(await db.sentences.count()).toBe(0);
  });
});

describe("tombstones", () => {
  it("records a deleted term and clears the mark when it is marked again", async () => {
    const term = await markTerm(db, { surface: "ran", lemma: "run", status: "unknown" });
    await deleteTerm(db, term.id, 5);
    expect(await db.tombstones.get("term:run")).toEqual({ key: "term:run", deletedAt: 5 });
    await markTerm(db, { surface: "runs", lemma: "run", status: "learning" });
    expect(await db.tombstones.get("term:run")).toBeUndefined();
  });
});

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DuopdfDB } from "../db/db";
import { registerOpened } from "../db/documents";
import { clearLearningData, exportLearningData, importLearningData, parseBackup } from "./backup";
import { cached } from "./cache";
import { translateSentence } from "./sentences";
import { deleteTerm, markTerm } from "./terms";

let db: DuopdfDB;
let counter = 0;

beforeEach(() => {
  db = new DuopdfDB(`backup-${counter++}`);
});

afterEach(async () => {
  await db.delete();
});

async function seed() {
  const doc = await registerOpened(db, { name: "ders.pdf", filePath: "C:\\ders.pdf", hash: "h1", format: "pdf", pageCount: 9 });
  await markTerm(db, {
    surface: "ran",
    lemma: "run",
    status: "unknown",
    meaning: "koşmak",
    occurrence: { documentId: doc.id, page: 2, view: "text", sentence: "We ran it." },
  });
  await cached(db, { id: "wordMeaning", version: 1 }, { word: "ran" }, async () => ({ anlam: "koşmak" }));
  await translateSentence(db, "We ran it.", async () => ({ ceviri: "Onu çalıştırdık.", dilbilgisiNotu: "Geçmiş zaman." }));
  const gone = await markTerm(db, { surface: "old", lemma: "old", status: "known" });
  await deleteTerm(db, gone.id);
}

describe("backup", () => {
  it("round-trips all learning data through export, clear and import", async () => {
    await seed();
    const json = JSON.stringify(await exportLearningData(db));
    await clearLearningData(db);
    expect(await db.terms.count()).toBe(0);

    const summary = await importLearningData(db, parseBackup(json));
    expect(summary).toEqual({ documents: 1, terms: 1, occurrences: 1, sentences: 1, strokes: 0 });
    const [term] = await db.terms.toArray();
    expect(term).toMatchObject({ lemma: "run", meaning: "koşmak", status: "unknown" });
    const [occ] = await db.occurrences.toArray();
    expect(occ.termId).toBe(term.id);
    expect(await db.cache.count()).toBe(1);
    expect((await db.sentences.toArray())[0]).toMatchObject({ text: "We ran it.", translation: "Onu çalıştırdık." });
    expect(await db.tombstones.get("term:old")).toBeDefined();
  });

  it("still imports backups made before sentence translations existed", async () => {
    await seed();
    const backup = JSON.parse(JSON.stringify(await exportLearningData(db)));
    delete backup.data.sentences;
    delete backup.data.tombstones;
    const summary = await importLearningData(db, parseBackup(JSON.stringify(backup)));
    expect(summary.sentences).toBe(0);
    expect(await db.terms.count()).toBe(1);
  });

  it("never contains provider settings or API keys", async () => {
    await seed();
    const json = JSON.stringify(await exportLearningData(db));
    expect(json).not.toMatch(/apiKey|nvapi-|baseUrl/i);
  });

  it("rejects files that are not Duopdf backups", () => {
    expect(() => parseBackup("not json")).toThrow("JSON");
    expect(() => parseBackup(JSON.stringify({ format: "other" }))).toThrow("Duopdf");
  });

  it("leaves existing data untouched when the import fails midway", async () => {
    await seed();
    const backup = parseBackup(JSON.stringify(await exportLearningData(db)));
    // Aynı kimlikli iki terim: bulkAdd hata verir, işlem geri alınmalı.
    backup.data.terms.push({ ...backup.data.terms[0] });
    await expect(importLearningData(db, backup)).rejects.toThrow();
    expect(await db.terms.count()).toBe(1);
    expect(await db.documents.count()).toBe(1);
  });
});

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DuopdfDB } from "../db/db";
import { registerOpened } from "../db/documents";
import { markTerm } from "../learning/terms";
import { mergeImport, parseSyncFile } from "./mergeImport";
import { emptySnapshot, readSnapshot, type Snapshot, type SyncTerm } from "./snapshot";

let db: DuopdfDB;
let n = 0;

beforeEach(() => {
  db = new DuopdfDB(`merge-import-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

const doc = { name: "ders.pdf", filePath: "C:\\ders.pdf", hash: "h1", format: "pdf" as const, pageCount: 3 };

function term(key: string, updatedAt: number, meaning: string): SyncTerm {
  return {
    key,
    lemma: key,
    surface: key,
    pattern: [[key]],
    status: "unknown",
    meaning,
    createdAt: 1,
    updatedAt,
    review: { intervalDays: 0, dueAt: 1, streak: 0 },
  } as SyncTerm;
}

/** Firelingo'nun dışa aktardığı dosya: belge, çizim ve sınav cevabı yok; web geçişi, çeviri ve silme izi var. */
function firelingoFile(): Snapshot {
  return {
    ...emptySnapshot(),
    terms: [term("deploy", 50, "dağıtmak")],
    occurrences: [{ termKey: "deploy", sentence: "We deploy daily.", url: "https://example.com/a", title: "Article", createdAt: 50 }],
    sentences: [{ key: "s1", text: "We deploy daily.", translation: "Her gün dağıtırız.", grammarNote: "", createdAt: 50, updatedAt: 50 }],
    tombstones: [{ key: "term:merge", deletedAt: 500 }],
  } as Snapshot;
}

/** Belgesi, çizimi, sınav geçmişi ve iki kelimesi olan yerel veri. */
async function seed() {
  const d = await registerOpened(db, doc, 1);
  await markTerm(db, { surface: "ran", lemma: "run", status: "unknown", occurrence: { documentId: d.id, page: 2, view: "text", sentence: "We ran it." } }, 10);
  await markTerm(db, { surface: "merge", lemma: "merge", status: "learning" }, 20);
  await db.strokes.put({ id: "st1", docHash: "h1", view: "text", page: 1, color: "#f00", width: 0.01, points: [0, 0, 0.5], createdAt: 5, updatedAt: 5 });
  await db.quizAttempts.put({ id: "q1", kind: "mcq", sentence: "s", sentenceKey: "k", termKeys: ["run"], correct: true, createdAt: 5, updatedAt: 5 });
}

const untouched = async () => ({
  documents: await db.documents.toArray(),
  strokes: await db.strokes.toArray(),
  quizAttempts: await db.quizAttempts.toArray(),
});

describe("merge import (Firelingo file)", () => {
  it("adds words without touching documents, drawings or quiz history", async () => {
    await seed();
    const before = await untouched();

    const summary = await mergeImport(db, parseSyncFile(JSON.stringify(firelingoFile())));

    expect(await untouched()).toEqual(before);
    // "merge" dosyadaki silme izinden eski: silinir. "deploy" eklenir.
    expect(summary).toEqual({ added: 1, updated: 0, removed: 1 });
    expect((await db.terms.toArray()).map((t) => t.key).sort()).toEqual(["deploy", "run"]);
    const web = (await db.occurrences.toArray()).find((o) => o.url);
    expect(web).toMatchObject({ url: "https://example.com/a", title: "Article", sentence: "We deploy daily." });
    expect(await db.sentences.where("key").equals("s1").first()).toMatchObject({ translation: "Her gün dağıtırız." });
  });

  it("changes nothing when the same file is imported twice", async () => {
    await seed();
    const file = parseSyncFile(JSON.stringify(firelingoFile()));
    await mergeImport(db, file);
    const snapshot = await readSnapshot(db);
    const counts = { terms: await db.terms.count(), occurrences: await db.occurrences.count(), sentences: await db.sentences.count() };

    const summary = await mergeImport(db, file);

    expect(summary).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(await readSnapshot(db)).toEqual(snapshot);
    expect({ terms: await db.terms.count(), occurrences: await db.occurrences.count(), sentences: await db.sentences.count() }).toEqual(counts);
  });

  it("keeps the local word when the file's copy is older, takes the file's when newer", async () => {
    await markTerm(db, { surface: "run", lemma: "run", status: "unknown", meaning: "koşmak" }, 100);

    const older = await mergeImport(db, { ...emptySnapshot(), terms: [term("run", 50, "eski anlam")] });
    expect(older).toEqual({ added: 0, updated: 0, removed: 0 });
    expect((await db.terms.where("key").equals("run").first())!.meaning).toBe("koşmak");

    const newer = await mergeImport(db, { ...emptySnapshot(), terms: [term("run", 200, "çalıştırmak")] });
    expect(newer).toEqual({ added: 0, updated: 1, removed: 0 });
    expect((await db.terms.where("key").equals("run").first())!.meaning).toBe("çalıştırmak");
  });

  it("rejects unrecognized files with a readable error and leaves data unchanged", async () => {
    await seed();
    const before = await readSnapshot(db);

    expect(() => parseSyncFile("bu json değil")).toThrow("geçerli bir JSON değil");
    expect(() => parseSyncFile('{"format":"duopdf-backup","version":1}')).toThrow("tanınmadı");
    expect(() => parseSyncFile('{"format":"duopdf-sync","version":2}')).toThrow("tanınmadı");
    expect(() => parseSyncFile('{"format":"duopdf-sync","version":1,"terms":{}}')).toThrow("bozuk");
    expect(() => parseSyncFile("[]")).toThrow("eşitleme dosyası");

    expect(await readSnapshot(db)).toEqual(before);
  });
});

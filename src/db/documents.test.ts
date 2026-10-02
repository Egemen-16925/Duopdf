import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DuopdfDB } from "./db";
import { clearRecent, hideFromRecent, recentDocuments, registerOpened, saveOriginalPage, savePosition } from "./documents";

let db: DuopdfDB;
let counter = 0;

beforeEach(() => {
  db = new DuopdfDB(`test-${counter++}`);
});

afterEach(async () => {
  await db.delete();
});

const file = { name: "ders.pdf", filePath: "C:\\Ders\\ders.pdf", hash: "abc", format: "pdf" as const, pageCount: 40 };

describe("registerOpened", () => {
  it("creates a record starting at page 1", async () => {
    const doc = await registerOpened(db, file, 1000);
    expect(doc).toMatchObject({ ...file, lastPage: 1, lastOffset: 0, hiddenFromRecent: false, addedAt: 1000, lastOpenedAt: 1000 });
    expect(doc.id).toBeTypeOf("number");
  });

  it("reuses the record for the same content and keeps the position", async () => {
    const first = await registerOpened(db, file, 1000);
    await savePosition(db, first.id, 17, 0.4);
    const moved = await registerOpened(db, { ...file, filePath: "D:\\Yeni\\ders.pdf", name: "ders (1).pdf" }, 2000);
    expect(moved.id).toBe(first.id);
    expect(moved.lastPage).toBe(17);
    expect(moved.lastOffset).toBe(0.4);
    expect(moved.filePath).toBe("D:\\Yeni\\ders.pdf");
    expect(moved.lastOpenedAt).toBe(2000);
    expect(await db.documents.count()).toBe(1);
  });

  it("keeps the original-view page separately from the text position", async () => {
    const doc = await registerOpened(db, { ...file, format: "docx", pageCount: 3 }, 1000);
    await savePosition(db, doc.id, 2, 0.3);
    await saveOriginalPage(db, doc.id, 12);
    const again = await registerOpened(db, { ...file, format: "docx", pageCount: 3 }, 2000);
    expect(again).toMatchObject({ lastPage: 2, lastOffset: 0.3, originalPage: 12 });
  });

  it("clamps the last page when the page count shrinks", async () => {
    const first = await registerOpened(db, file, 1000);
    await savePosition(db, first.id, 39, 0.5);
    const again = await registerOpened(db, { ...file, pageCount: 10 }, 2000);
    expect(again.lastPage).toBe(10);
    expect(again.lastOffset).toBe(0);
  });
});

describe("recent list", () => {
  it("lists the most recently opened first", async () => {
    await registerOpened(db, { ...file, hash: "a", name: "a.pdf" }, 1000);
    await registerOpened(db, { ...file, hash: "b", name: "b.pdf" }, 3000);
    await registerOpened(db, { ...file, hash: "c", name: "c.pdf" }, 2000);
    expect((await recentDocuments(db)).map((d) => d.name)).toEqual(["b.pdf", "c.pdf", "a.pdf"]);
  });

  it("hides a single document without deleting it", async () => {
    const a = await registerOpened(db, { ...file, hash: "a", name: "a.pdf" }, 1000);
    await registerOpened(db, { ...file, hash: "b", name: "b.pdf" }, 2000);
    await hideFromRecent(db, a.id);
    expect((await recentDocuments(db)).map((d) => d.name)).toEqual(["b.pdf"]);
    expect(await db.documents.count()).toBe(2);
  });

  it("clears the list but keeps records, and reopening brings a document back", async () => {
    const a = await registerOpened(db, { ...file, hash: "a", name: "a.pdf" }, 1000);
    await savePosition(db, a.id, 5);
    await registerOpened(db, { ...file, hash: "b", name: "b.pdf" }, 2000);
    await clearRecent(db);
    expect(await recentDocuments(db)).toEqual([]);
    expect(await db.documents.count()).toBe(2);

    const reopened = await registerOpened(db, { ...file, hash: "a", name: "a.pdf" }, 3000);
    expect(reopened.lastPage).toBe(5);
    expect((await recentDocuments(db)).map((d) => d.name)).toEqual(["a.pdf"]);
  });
});

describe("migration", () => {
  it("upgrades version 1 records to PDF documents visible in the list", async () => {
    const name = `migrate-${counter++}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ documents: "++id, &hash, lastOpenedAt" });
    await v1.table("documents").add({ name: "old.pdf", filePath: "x", hash: "h", pageCount: 3, lastPage: 2, addedAt: 1, lastOpenedAt: 1 });
    v1.close();

    const upgraded = new DuopdfDB(name);
    const [doc] = await upgraded.documents.toArray();
    expect(doc).toMatchObject({ format: "pdf", lastOffset: 0, hiddenFromRecent: false, lastPage: 2 });
    expect((await recentDocuments(upgraded)).length).toBe(1);
    await upgraded.delete();
  });
});

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DuopdfDB } from "./db";
import { recentDocuments, registerOpened, saveLastPage } from "./documents";

let db: DuopdfDB;
let counter = 0;

beforeEach(() => {
  db = new DuopdfDB(`test-${counter++}`);
});

afterEach(async () => {
  await db.delete();
});

const file = { name: "ders.pdf", filePath: "C:\\Ders\\ders.pdf", hash: "abc", pageCount: 40 };

describe("registerOpened", () => {
  it("creates a record starting at page 1", async () => {
    const doc = await registerOpened(db, file, 1000);
    expect(doc).toMatchObject({ ...file, lastPage: 1, addedAt: 1000, lastOpenedAt: 1000 });
    expect(doc.id).toBeTypeOf("number");
  });

  it("reuses the record for the same content and keeps the last page", async () => {
    const first = await registerOpened(db, file, 1000);
    await saveLastPage(db, first.id, 17);
    const moved = await registerOpened(db, { ...file, filePath: "D:\\Yeni\\ders.pdf", name: "ders (1).pdf" }, 2000);
    expect(moved.id).toBe(first.id);
    expect(moved.lastPage).toBe(17);
    expect(moved.filePath).toBe("D:\\Yeni\\ders.pdf");
    expect(moved.lastOpenedAt).toBe(2000);
    expect(await db.documents.count()).toBe(1);
  });

  it("clamps the last page when the page count shrinks", async () => {
    const first = await registerOpened(db, file, 1000);
    await saveLastPage(db, first.id, 39);
    const again = await registerOpened(db, { ...file, pageCount: 10 }, 2000);
    expect(again.lastPage).toBe(10);
  });
});

describe("recentDocuments", () => {
  it("lists the most recently opened first", async () => {
    await registerOpened(db, { ...file, hash: "a", name: "a.pdf" }, 1000);
    await registerOpened(db, { ...file, hash: "b", name: "b.pdf" }, 3000);
    await registerOpened(db, { ...file, hash: "c", name: "c.pdf" }, 2000);
    expect((await recentDocuments(db)).map((d) => d.name)).toEqual(["b.pdf", "c.pdf", "a.pdf"]);
  });
});

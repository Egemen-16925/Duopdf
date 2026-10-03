import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DuopdfDB } from "../db/db";
import { registerOpened } from "../db/documents";
import { deleteTerm, markTerm, setTermStatus } from "../learning/terms";
import { applySnapshot, emptySnapshot, mergeSnapshots, parseSnapshot, readSnapshot, sameSnapshot, type Snapshot } from "./snapshot";

let n = 0;
let phone: DuopdfDB;
let laptop: DuopdfDB;

beforeEach(() => {
  phone = new DuopdfDB(`sync-a-${n}`);
  laptop = new DuopdfDB(`sync-b-${n++}`);
});

afterEach(async () => {
  await phone.delete();
  await laptop.delete();
});

/** İki cihaz arasında bir eşitleme turu: ikisi de birleşik veriye ulaşır. */
async function syncBoth(): Promise<Snapshot> {
  const merged = mergeSnapshots(await readSnapshot(phone), await readSnapshot(laptop));
  await applySnapshot(phone, merged);
  await applySnapshot(laptop, merged);
  return merged;
}

const doc = { name: "ders.pdf", filePath: "C:\\ders.pdf", hash: "h1", format: "pdf" as const, pageCount: 3 };

describe("sync merge", () => {
  it("brings words marked on each device to both, with their sentences", async () => {
    const d1 = await registerOpened(phone, doc, 1);
    await markTerm(phone, { surface: "ran", lemma: "run", status: "unknown", occurrence: { documentId: d1.id, page: 2, view: "text", sentence: "We ran it." } }, 10);
    await markTerm(laptop, { surface: "commit", lemma: "commit", status: "learning" }, 20);

    await syncBoth();

    for (const db of [phone, laptop]) {
      expect((await db.terms.toArray()).map((t) => t.key).sort()).toEqual(["commit", "run"]);
    }
    // Belge laptopta yoktu: adı ve hash'iyle eklenir, son açılanlarda görünmez, yolu bilinmez.
    const laptopDoc = await laptop.documents.where("hash").equals("h1").first();
    expect(laptopDoc).toMatchObject({ name: "ders.pdf", filePath: "", hiddenFromRecent: true });
    const [occ] = await laptop.occurrences.toArray();
    const run = await laptop.terms.where("key").equals("run").first();
    expect(occ).toMatchObject({ termId: run!.id, documentId: laptopDoc!.id, page: 2, sentence: "We ran it." });
  });

  it("keeps the newer change when the same word changed on both devices", async () => {
    await markTerm(phone, { surface: "run", lemma: "run", status: "unknown" }, 10);
    await markTerm(laptop, { surface: "run", lemma: "run", status: "unknown" }, 10);
    await syncBoth();
    const p = (await phone.terms.toArray())[0];
    const l = (await laptop.terms.toArray())[0];
    await setTermStatus(phone, p.id, "learning", 100);
    await setTermStatus(laptop, l.id, "known", 200);
    await syncBoth();
    expect((await phone.terms.toArray())[0].status).toBe("known");
    expect((await laptop.terms.toArray())[0].status).toBe("known");
  });

  it("does not bring a deleted word back from the other device", async () => {
    await markTerm(phone, { surface: "run", lemma: "run", status: "unknown" }, 10);
    await syncBoth();
    const p = (await phone.terms.toArray())[0];
    await deleteTerm(phone, p.id, 50);
    await syncBoth();
    expect(await phone.terms.count()).toBe(0);
    expect(await laptop.terms.count()).toBe(0);
    expect(await laptop.tombstones.get("term:run")).toBeDefined();
  });

  it("lets a word marked again after deletion win over the old deletion", async () => {
    await markTerm(phone, { surface: "run", lemma: "run", status: "unknown" }, 10);
    await syncBoth();
    await deleteTerm(phone, (await phone.terms.toArray())[0].id, 50);
    await syncBoth();
    await markTerm(laptop, { surface: "run", lemma: "run", status: "learning" }, 80);
    await syncBoth();
    expect((await phone.terms.toArray()).map((t) => t.status)).toEqual(["learning"]);
  });

  it("unions quiz answers and keeps device-only fields local", async () => {
    const d = await registerOpened(phone, doc, 1);
    await phone.documents.update(d.id, { lastPage: 3 });
    await laptop.quizAttempts.put({
      id: "q1",
      kind: "mcq",
      sentence: "s",
      sentenceKey: "k",
      termKeys: ["run"],
      correct: true,
      createdAt: 5,
      updatedAt: 5,
    });
    const merged = await syncBoth();
    expect(await phone.quizAttempts.get("q1")).toBeDefined();
    expect(JSON.stringify(merged)).not.toContain("filePath");
    expect(JSON.stringify(merged)).not.toContain("lastPage");
    expect((await phone.documents.get(d.id))!.lastPage).toBe(3);
  });

  it("is order independent and stable", async () => {
    await markTerm(phone, { surface: "run", lemma: "run", status: "unknown" }, 10);
    await markTerm(laptop, { surface: "deploy", lemma: "deploy", status: "unknown" }, 20);
    const a = await readSnapshot(phone);
    const b = await readSnapshot(laptop);
    const ab = mergeSnapshots(a, b);
    const ba = mergeSnapshots(b, a);
    expect(sameSnapshot(ab, ba)).toBe(true);
    expect(sameSnapshot(mergeSnapshots(ab, ab), ab)).toBe(true);
  });

  it("rejects files it does not understand", () => {
    expect(() => parseSnapshot('{"format":"other"}')).toThrow("tanınmadı");
    expect(parseSnapshot(JSON.stringify(emptySnapshot())).terms).toEqual([]);
  });
});

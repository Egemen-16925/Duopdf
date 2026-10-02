import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DuopdfDB, type StrokeRecord } from "../db/db";
import { exportLearningData, importLearningData, parseBackup } from "../learning/backup";
import { deleteStrokes, InkHistory, loadStrokes, putStrokes } from "./strokes";

let db: DuopdfDB;
let counter = 0;

beforeEach(() => {
  db = new DuopdfDB(`ink-${counter++}`);
});

afterEach(async () => {
  await db.delete();
});

const stroke = (id: string, page = 1, view: StrokeRecord["view"] = "text", docHash = "h1"): StrokeRecord => ({
  id,
  docHash,
  view,
  page,
  color: "#e11d48",
  width: 0.003,
  points: [0.1, 0.1, 0.5, 0.2, 0.2, 0.5],
  createdAt: 1,
  updatedAt: 1,
});

describe("stroke storage", () => {
  it("loads strokes per document and view", async () => {
    await putStrokes(db, [stroke("a"), stroke("b", 2), stroke("c", 1, "original"), stroke("d", 1, "text", "h2")]);
    expect((await loadStrokes(db, "h1", "text")).map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect((await loadStrokes(db, "h1", "original")).map((s) => s.id)).toEqual(["c"]);
  });

  it("leaves a tombstone on delete and clears it when the stroke comes back", async () => {
    await putStrokes(db, [stroke("a")]);
    await deleteStrokes(db, ["a"], 7);
    expect(await db.tombstones.get("stroke:a")).toEqual({ key: "stroke:a", deletedAt: 7 });
    await putStrokes(db, [stroke("a")]);
    expect(await db.tombstones.get("stroke:a")).toBeUndefined();
  });
});

describe("InkHistory", () => {
  it("undoes and redoes drawing and erasing", async () => {
    const history = new InkHistory(db);
    await history.add([stroke("a")]);
    await history.add([stroke("b", 3)]);
    await history.erase([stroke("a")]);
    expect((await loadStrokes(db, "h1", "text")).map((s) => s.id)).toEqual(["b"]);

    expect(await history.undo()).toEqual([1]); // silme geri alındı
    expect((await loadStrokes(db, "h1", "text")).map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(await history.undo()).toEqual([3]); // b'nin çizimi geri alındı
    expect((await loadStrokes(db, "h1", "text")).map((s) => s.id)).toEqual(["a"]);

    expect(await history.redo()).toEqual([3]);
    expect((await loadStrokes(db, "h1", "text")).map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(history.canRedo).toBe(true);
  });

  it("clears the redo stack after a new action", async () => {
    const history = new InkHistory(db);
    await history.add([stroke("a")]);
    await history.undo();
    await history.add([stroke("b")]);
    expect(history.canRedo).toBe(false);
    expect(await history.redo()).toEqual([]);
  });
});

describe("backup", () => {
  it("includes strokes", async () => {
    await putStrokes(db, [stroke("a")]);
    const json = JSON.stringify(await exportLearningData(db));
    await db.strokes.clear();
    const summary = await importLearningData(db, parseBackup(json));
    expect(summary.strokes).toBe(1);
    expect((await db.strokes.get("a"))?.points).toEqual([0.1, 0.1, 0.5, 0.2, 0.2, 0.5]);
  });
});

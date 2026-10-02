import type { DuopdfDB, StrokeRecord } from "../db/db";

const tombstoneKey = (id: string) => `stroke:${id}`;

export async function loadStrokes(db: DuopdfDB, docHash: string, view: StrokeRecord["view"]): Promise<StrokeRecord[]> {
  return db.strokes.where("[docHash+view]").equals([docHash, view]).toArray();
}

/** Çizgileri kaydeder (yeni ya da geri alınan silme); silme izleri kalkar. */
export async function putStrokes(db: DuopdfDB, strokes: StrokeRecord[]): Promise<void> {
  if (strokes.length === 0) return;
  await db.transaction("rw", db.strokes, db.tombstones, async () => {
    await db.strokes.bulkPut(strokes);
    await db.tombstones.bulkDelete(strokes.map((s) => tombstoneKey(s.id)));
  });
}

/** Çizgileri siler; eşitleme için silme izi bırakır. */
export async function deleteStrokes(db: DuopdfDB, ids: string[], now = Date.now()): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction("rw", db.strokes, db.tombstones, async () => {
    await db.strokes.bulkDelete(ids);
    await db.tombstones.bulkPut(ids.map((id) => ({ key: tombstoneKey(id), deletedAt: now })));
  });
}

type Action = { type: "add" | "erase"; strokes: StrokeRecord[] };

/**
 * Geri al / yinele. "add" geri alınınca çizgiler silinir; "erase" geri alınınca geri gelir.
 * Her işlem veritabanına yazılır; çağıran ardından ekranı yeniler.
 */
export class InkHistory {
  private undoStack: Action[] = [];
  private redoStack: Action[] = [];

  constructor(private db: DuopdfDB) {}

  async add(strokes: StrokeRecord[]) {
    await putStrokes(this.db, strokes);
    this.push({ type: "add", strokes });
  }

  async erase(strokes: StrokeRecord[]) {
    await deleteStrokes(
      this.db,
      strokes.map((s) => s.id),
    );
    this.push({ type: "erase", strokes });
  }

  private push(action: Action) {
    if (action.strokes.length === 0) return;
    this.undoStack.push(action);
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Geri alır; etkilenen sayfa numaralarını döndürür. */
  async undo(): Promise<number[]> {
    const action = this.undoStack.pop();
    if (!action) return [];
    await this.apply(action, true);
    this.redoStack.push(action);
    return pages(action);
  }

  async redo(): Promise<number[]> {
    const action = this.redoStack.pop();
    if (!action) return [];
    await this.apply(action, false);
    this.undoStack.push(action);
    return pages(action);
  }

  private async apply(action: Action, reverse: boolean) {
    const removing = (action.type === "add") === reverse;
    if (removing) {
      await deleteStrokes(
        this.db,
        action.strokes.map((s) => s.id),
      );
    } else {
      await putStrokes(this.db, action.strokes);
    }
  }
}

function pages(action: Action): number[] {
  return [...new Set(action.strokes.map((s) => s.page))];
}

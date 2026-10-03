import type {
  DocumentRecord,
  DuopdfDB,
  OccurrenceRecord,
  QuizAttemptRecord,
  SentenceRecord,
  StrokeRecord,
  TermRecord,
  TombstoneRecord,
} from "../db/db";

/**
 * Bulutta tutulan öğrenme verisi. Kayıtlar cihazdan bağımsız anahtarlarla tanınır
 * (belge: hash, terim: key, geçiş: terim + belge + yer + cümle); sayısal `id`'ler buraya girmez.
 * Cihaza özel alanlar (dosya yolu, son sayfa, son açılma) ve yeniden üretilebilen
 * önbellekler (yapay zekâ önbelleği, OCR) eşitlenmez. API anahtarı bu veride hiç yoktur.
 */
export const SNAPSHOT_FORMAT = "duopdf-sync";
export const SNAPSHOT_VERSION = 1;

export type SyncDocument = Pick<DocumentRecord, "hash" | "name" | "format" | "pageCount" | "addedAt">;
export type SyncTerm = Omit<TermRecord, "id">;
export interface SyncOccurrence extends Pick<OccurrenceRecord, "page" | "view" | "sentence" | "createdAt"> {
  termKey: string;
  docHash: string;
}
export type SyncSentence = Omit<SentenceRecord, "id">;

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  documents: SyncDocument[];
  terms: SyncTerm[];
  occurrences: SyncOccurrence[];
  sentences: SyncSentence[];
  strokes: StrokeRecord[];
  quizAttempts: QuizAttemptRecord[];
  tombstones: TombstoneRecord[];
}

export function emptySnapshot(): Snapshot {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    documents: [],
    terms: [],
    occurrences: [],
    sentences: [],
    strokes: [],
    quizAttempts: [],
    tombstones: [],
  };
}

export const occurrenceKey = (o: SyncOccurrence) => [o.termKey, o.docHash, o.view, o.page, o.sentence].join("\u0001");

/** Silme izi kaydı sildi mi: iz, kaydın son değişikliğinden yeni ya da aynı anda. */
function erased(tombstones: Map<string, number>, key: string, updatedAt: number): boolean {
  const deletedAt = tombstones.get(key);
  return deletedAt !== undefined && deletedAt >= updatedAt;
}

/** Aynı anahtarlı kayıtlardan en son değiştirileni (eşitse ilki) kalır. */
function newest<T>(a: T[], b: T[], key: (x: T) => string, time: (x: T) => number): Map<string, T> {
  const out = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const k = key(item);
    const existing = out.get(k);
    if (!existing || time(item) > time(existing)) out.set(k, item);
  }
  return out;
}

/** İki cihazın verisini kayıt kayıt birleştirir. Sıra önemsizdir: merge(a, b) ve merge(b, a) aynı veriyi verir. */
export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  const tombstones = new Map<string, number>();
  for (const t of [...a.tombstones, ...b.tombstones]) tombstones.set(t.key, Math.max(tombstones.get(t.key) ?? 0, t.deletedAt));

  const terms = [...newest(a.terms, b.terms, (t) => t.key, (t) => t.updatedAt).values()].filter(
    (t) => !erased(tombstones, `term:${t.key}`, t.updatedAt),
  );
  const termKeys = new Set(terms.map((t) => t.key));

  const documents = new Map<string, SyncDocument>();
  for (const d of [...a.documents, ...b.documents]) {
    const existing = documents.get(d.hash);
    documents.set(d.hash, existing ? { ...existing, addedAt: Math.min(existing.addedAt, d.addedAt) } : d);
  }

  const occurrences = new Map<string, SyncOccurrence>();
  for (const o of [...a.occurrences, ...b.occurrences]) {
    if (termKeys.has(o.termKey) && !occurrences.has(occurrenceKey(o))) occurrences.set(occurrenceKey(o), o);
  }

  const sentences = [...newest(a.sentences, b.sentences, (s) => s.key, (s) => s.updatedAt).values()].filter(
    (s) => !erased(tombstones, `sentence:${s.key}`, s.updatedAt),
  );
  const strokes = [...newest(a.strokes, b.strokes, (s) => s.id, (s) => s.updatedAt).values()].filter(
    (s) => !erased(tombstones, `stroke:${s.id}`, s.updatedAt),
  );
  const quizAttempts = [...newest(a.quizAttempts, b.quizAttempts, (q) => q.id, (q) => q.updatedAt).values()];

  const byKey = <T,>(items: T[], key: (x: T) => string) => items.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    documents: byKey([...documents.values()], (d) => d.hash),
    terms: byKey(terms, (t) => t.key),
    occurrences: byKey([...occurrences.values()], occurrenceKey),
    sentences: byKey(sentences, (s) => s.key),
    strokes: byKey(strokes, (s) => s.id),
    quizAttempts: byKey(quizAttempts, (q) => q.id),
    tombstones: byKey(
      [...tombstones].map(([key, deletedAt]) => ({ key, deletedAt })),
      (t) => t.key,
    ),
  };
}

/** Yerel veritabanından bulut biçimine. */
export async function readSnapshot(db: DuopdfDB): Promise<Snapshot> {
  return db.transaction(
    "r",
    [db.documents, db.terms, db.occurrences, db.sentences, db.strokes, db.quizAttempts, db.tombstones],
    async () => {
      const [documents, terms, occurrences, sentences, strokes, quizAttempts, tombstones] = await Promise.all([
        db.documents.toArray(),
        db.terms.toArray(),
        db.occurrences.toArray(),
        db.sentences.toArray(),
        db.strokes.toArray(),
        db.quizAttempts.toArray(),
        db.tombstones.toArray(),
      ]);
      const termKey = new Map(terms.map((t) => [t.id, t.key]));
      const docHash = new Map(documents.map((d) => [d.id, d.hash]));
      return {
        format: SNAPSHOT_FORMAT,
        version: SNAPSHOT_VERSION,
        documents: documents.map(({ hash, name, format, pageCount, addedAt }) => ({ hash, name, format, pageCount, addedAt })),
        terms: terms.map(({ id: _, ...rest }) => rest),
        occurrences: occurrences
          .filter((o) => termKey.has(o.termId) && docHash.has(o.documentId))
          .map((o) => ({
            termKey: termKey.get(o.termId)!,
            docHash: docHash.get(o.documentId)!,
            page: o.page,
            view: o.view,
            sentence: o.sentence,
            createdAt: o.createdAt,
          })),
        sentences: sentences.map(({ id: _, ...rest }) => rest),
        strokes,
        quizAttempts,
        tombstones,
      };
    },
  );
}

/**
 * Birleştirilmiş veriyi yerel veritabanına işler (tek işlemde). Yerel `id`'ler korunur;
 * birleşik veride olmayan (silinmiş) kayıtlar yerelden de silinir.
 */
export async function applySnapshot(db: DuopdfDB, snap: Snapshot): Promise<void> {
  await db.transaction(
    "rw",
    [db.documents, db.terms, db.occurrences, db.sentences, db.strokes, db.quizAttempts, db.tombstones],
    async () => {
      // Belgeler: yalnızca eksik olanlar eklenir (dosya yolu bu cihazda bilinmez; açılınca eşleşir).
      const localDocs = await db.documents.toArray();
      const docId = new Map(localDocs.map((d) => [d.hash, d.id]));
      for (const d of snap.documents) {
        if (docId.has(d.hash)) continue;
        const id = await db.documents.add({
          ...d,
          filePath: "",
          lastPage: 1,
          lastOffset: 0,
          hiddenFromRecent: true,
          lastOpenedAt: d.addedAt,
        } as DocumentRecord);
        docId.set(d.hash, id);
      }

      // Terimler: yenisi yazılır, birleşik veride olmayan silinir (geçişleriyle).
      const localTerms = await db.terms.toArray();
      const localByKey = new Map(localTerms.map((t) => [t.key, t]));
      const keep = new Set(snap.terms.map((t) => t.key));
      const removed = localTerms.filter((t) => !keep.has(t.key)).map((t) => t.id);
      if (removed.length) {
        await db.occurrences.where("termId").anyOf(removed).delete();
        await db.terms.bulkDelete(removed);
      }
      const termId = new Map<string, number>();
      for (const t of snap.terms) {
        const local = localByKey.get(t.key);
        if (!local) termId.set(t.key, await db.terms.add(t as TermRecord));
        else {
          termId.set(t.key, local.id);
          if (t.updatedAt > local.updatedAt) await db.terms.put({ ...t, id: local.id });
        }
      }

      // Geçişler: eksik olanlar eklenir.
      const keyOfTerm = new Map([...termId].map(([key, id]) => [id, key]));
      const hashOfDoc = new Map([...docId].map(([hash, id]) => [id, hash]));
      const existing = new Set(
        (await db.occurrences.toArray()).map((o) =>
          occurrenceKey({
            termKey: keyOfTerm.get(o.termId) ?? "",
            docHash: hashOfDoc.get(o.documentId) ?? "",
            page: o.page,
            view: o.view,
            sentence: o.sentence,
            createdAt: o.createdAt,
          }),
        ),
      );
      const newOccurrences = snap.occurrences
        .filter((o) => !existing.has(occurrenceKey(o)) && termId.has(o.termKey) && docId.has(o.docHash))
        .map(
          (o) =>
            ({
              termId: termId.get(o.termKey)!,
              documentId: docId.get(o.docHash)!,
              page: o.page,
              view: o.view,
              sentence: o.sentence,
              createdAt: o.createdAt,
            }) as OccurrenceRecord,
        );
      if (newOccurrences.length) await db.occurrences.bulkAdd(newOccurrences);

      // Çeviriler.
      const localSentences = new Map((await db.sentences.toArray()).map((s) => [s.key, s]));
      const keepSentences = new Set(snap.sentences.map((s) => s.key));
      const goneSentences = [...localSentences.values()].filter((s) => !keepSentences.has(s.key)).map((s) => s.id);
      if (goneSentences.length) await db.sentences.bulkDelete(goneSentences);
      for (const s of snap.sentences) {
        const local = localSentences.get(s.key);
        if (!local) await db.sentences.add(s as SentenceRecord);
        else if (s.updatedAt > local.updatedAt) await db.sentences.put({ ...s, id: local.id });
      }

      // Çizimler ve sınav cevapları (UUID ile).
      const keepStrokes = new Set(snap.strokes.map((s) => s.id));
      const goneStrokes = (await db.strokes.toCollection().primaryKeys()).filter((id) => !keepStrokes.has(id));
      if (goneStrokes.length) await db.strokes.bulkDelete(goneStrokes);
      const localStrokes = new Map((await db.strokes.toArray()).map((s) => [s.id, s.updatedAt]));
      await db.strokes.bulkPut(snap.strokes.filter((s) => (localStrokes.get(s.id) ?? -1) < s.updatedAt));

      const localAttempts = new Set(await db.quizAttempts.toCollection().primaryKeys());
      await db.quizAttempts.bulkPut(snap.quizAttempts.filter((q) => !localAttempts.has(q.id)));

      await db.tombstones.bulkPut(snap.tombstones);
    },
  );
}

/** Kaydedilen ve indirilen verinin karşılaştırılması (gereksiz yükleme olmasın). */
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Buluttan gelen JSON'u denetler; biçim tanınmıyorsa hata verir. */
export function parseSnapshot(json: string): Snapshot {
  const data = JSON.parse(json) as Partial<Snapshot>;
  if (data.format !== SNAPSHOT_FORMAT || data.version !== SNAPSHOT_VERSION) {
    throw new Error("Buluttaki eşitleme dosyası tanınmadı (başka bir sürümden olabilir).");
  }
  return { ...emptySnapshot(), ...data } as Snapshot;
}

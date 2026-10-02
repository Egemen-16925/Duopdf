import Dexie, { type EntityTable } from "dexie";

/**
 * Öğrenme verisi (IndexedDB). Sağlayıcı ayarlarından tamamen ayrıdır;
 * hiçbir tablo sağlayıcıya veya modele bağlı alan içermez.
 */
export interface DocumentRecord {
  id: number;
  name: string;
  /** Son bilinen konum. Dosya taşınırsa yeniden seçtirilir; eşleşme hash ile yapılır. */
  filePath: string;
  /** Dosya içeriğinin SHA-256 özeti. */
  hash: string;
  pageCount: number;
  lastPage: number;
  addedAt: number;
  lastOpenedAt: number;
}

export class DuopdfDB extends Dexie {
  documents!: EntityTable<DocumentRecord, "id">;

  constructor(name = "duopdf") {
    super(name);
    this.version(1).stores({
      documents: "++id, &hash, lastOpenedAt",
    });
  }
}

export const db = new DuopdfDB();

import Dexie, { type EntityTable } from "dexie";
import type { DocFormat } from "../formats/types";

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
  format: DocFormat;
  /** PDF'te sayfa, diğer biçimlerde bölüm sayısı. */
  pageCount: number;
  /** 1'den başlar: PDF'te sayfa, diğer biçimlerde bölüm. */
  lastPage: number;
  /** Akan metinde bölüm içindeki konum (0-1). PDF'te kullanılmaz. */
  lastOffset: number;
  /** DOCX/PPTX'in Office ile çevrilmiş "orijinal görünümünde" kalınan sayfa. */
  originalPage?: number;
  /** Son açılanlar listesinden kaldırıldı mı (kayıt ve öğrenme verisi durur). */
  hiddenFromRecent: boolean;
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
    this.version(2)
      .stores({ documents: "++id, &hash, lastOpenedAt" })
      .upgrade((tx) =>
        tx
          .table("documents")
          .toCollection()
          .modify((d) => {
            d.format ??= "pdf";
            d.lastOffset ??= 0;
            d.hiddenFromRecent ??= false;
          }),
      );
  }
}

export const db = new DuopdfDB();

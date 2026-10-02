import Dexie, { type EntityTable } from "dexie";
import type { DocFormat } from "../formats/types";
import type { TermStatus } from "../learning/matcher";

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

export interface TermRecord {
  id: number;
  /** Benzersiz anahtar: küçük harfli kök hâli ("run", "carry out"). */
  key: string;
  /** Gösterilen kök hâli. */
  lemma: string;
  /** İlk işaretlendiği hâli ("ran"). */
  surface: string;
  /** Eşleştirme kalıbı: her kelime konumu için kabul edilen kökler. */
  pattern: string[][];
  status: TermStatus;
  /** Türkçe anlam (son sorulan cümleye göre). */
  meaning: string;
  explanation: string;
  note: string;
  createdAt: number;
  updatedAt: number;
  /** Aralıklı tekrar alanları (Faz 6). */
  review: { intervalDays: number; dueAt: number; streak: number };
}

export interface OccurrenceRecord {
  id: number;
  termId: number;
  documentId: number;
  /** PDF'te sayfa, akan metinde bölüm (1'den başlar). */
  page: number;
  /** DOCX/PPTX'te hangi görünümde işaretlendiği (orijinal görünümde sayfalar farklıdır). */
  view: "text" | "original";
  sentence: string;
  createdAt: number;
}

export interface CacheRecord {
  key: string;
  value: unknown;
  createdAt: number;
}

export class DuopdfDB extends Dexie {
  documents!: EntityTable<DocumentRecord, "id">;
  terms!: EntityTable<TermRecord, "id">;
  occurrences!: EntityTable<OccurrenceRecord, "id">;
  cache!: EntityTable<CacheRecord, "key">;

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
    this.version(3).stores({
      documents: "++id, &hash, lastOpenedAt",
      terms: "++id, &key, status, createdAt",
      occurrences: "++id, termId, documentId",
      cache: "&key",
    });
  }
}

export const db = new DuopdfDB();

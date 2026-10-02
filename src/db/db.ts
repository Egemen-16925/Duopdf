import Dexie, { type EntityTable } from "dexie";
import type { DocFormat } from "../formats/types";
import type { TermStatus } from "../learning/matcher";
import type { OcrResult } from "../ocr/result";

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

/** Çevirisi istenmiş cümle. Aynı cümle hangi belgede olursa olsun bir kez çevrilir. */
export interface SentenceRecord {
  id: number;
  /** Temizlenmiş cümle metninin SHA-256 özeti (cihazdan bağımsız anahtar). */
  key: string;
  text: string;
  translation: string;
  grammarNote: string;
  /** İlk görüldüğü yer (bilgi amaçlı; belge hash'i cihazlar arasında aynıdır). */
  documentHash?: string;
  page?: number;
  createdAt: number;
  updatedAt: number;
}

/** Silinen kaydın izi; eşitlemede silinenin başka cihazdan geri gelmesini önler. */
export interface TombstoneRecord {
  /** "<tablo>:<kararlı anahtar>", ör. "term:run". */
  key: string;
  deletedAt: number;
}

/**
 * Kalemle çizilmiş tek bir çizgi. Belge dosyasına yazılmaz; belgeye hash ile bağlanır.
 * Koordinatlar sayfa boyutuna oranla (0-1) tutulur; yakınlaştırınca sayfayla ölçeklenir.
 */
export interface StrokeRecord {
  /** Cihazdan bağımsız kimlik (UUID). */
  id: string;
  docHash: string;
  /** DOCX/PPTX'te orijinal görünümün sayfaları farklıdır. */
  view: "text" | "original";
  page: number;
  color: string;
  /** Kalınlık, sayfa genişliğine oranla. */
  width: number;
  /** Düz dizi: x, y, basınç (0-1), x, y, basınç, … */
  points: number[];
  createdAt: number;
  updatedAt: number;
}

/** OCR sonucu (yeniden üretilebilir; yedeğe girmez). */
export interface OcrRecord {
  /** "img:<görsel baytlarının SHA-256'sı>" ya da "page:<belge hash>:<görünüm>:<sayfa>". */
  key: string;
  result: OcrResult;
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
  sentences!: EntityTable<SentenceRecord, "id">;
  tombstones!: EntityTable<TombstoneRecord, "key">;
  ocr!: EntityTable<OcrRecord, "key">;
  strokes!: EntityTable<StrokeRecord, "id">;

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
    this.version(4).stores({
      documents: "++id, &hash, lastOpenedAt",
      terms: "++id, &key, status, createdAt",
      occurrences: "++id, termId, documentId",
      cache: "&key",
      sentences: "++id, &key, updatedAt",
      tombstones: "&key",
    });
    this.version(5).stores({
      documents: "++id, &hash, lastOpenedAt",
      terms: "++id, &key, status, createdAt",
      occurrences: "++id, termId, documentId",
      cache: "&key",
      sentences: "++id, &key, updatedAt",
      tombstones: "&key",
      ocr: "&key",
    });
    this.version(6).stores({
      documents: "++id, &hash, lastOpenedAt",
      terms: "++id, &key, status, createdAt",
      occurrences: "++id, termId, documentId",
      cache: "&key",
      sentences: "++id, &key, updatedAt",
      tombstones: "&key",
      ocr: "&key",
      strokes: "&id, [docHash+view], updatedAt",
    });
  }
}

export const db = new DuopdfDB();

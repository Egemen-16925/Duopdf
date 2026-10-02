import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { db, type DocumentRecord } from "../db/db";
import { recentDocuments, registerOpened, saveLastPage } from "../db/documents";
import { fileName, FileNotFoundError, pickPdfFile, readPdfBytes, sha256Hex } from "../pdf/files";
import { loadDocument } from "../pdf/pdfjs";
import { looksScanned, sampleTextChars } from "../pdf/textCheck";
import { PdfViewer } from "./PdfViewer";

interface OpenDoc {
  record: DocumentRecord;
  pdf: PDFDocumentProxy;
  scanned: boolean;
}

type Notice = { kind: "info" | "error"; text: string; missing?: DocumentRecord } | null;

function openErrorText(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "PasswordException") return "Bu PDF şifreli. Şifreli PDF'ler şimdilik desteklenmiyor.";
  if (name === "InvalidPDFException") return "Bu dosya okunamadı: bozuk ya da geçerli bir PDF değil.";
  return `PDF açılamadı: ${e instanceof Error ? e.message : String(e)}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function ReaderPage() {
  const [current, setCurrent] = useState<OpenDoc | null>(null);
  const [recent, setRecent] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [dragging, setDragging] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingPage = useRef<{ id: number; page: number } | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  const refreshRecent = () => recentDocuments(db).then(setRecent);

  useEffect(() => {
    refreshRecent();
  }, []);

  /** Bekleyen "son sayfa" kaydını hemen yazar. */
  function flushPageSave(): Promise<void> {
    window.clearTimeout(saveTimer.current);
    const pending = pendingPage.current;
    pendingPage.current = null;
    return pending ? saveLastPage(db, pending.id, pending.page) : Promise.resolve();
  }

  async function openPath(path: string, expected?: DocumentRecord) {
    setLoading(true);
    setNotice(null);
    try {
      await flushPageSave();
      const bytes = await readPdfBytes(path);
      // Hash'i önce al: pdf.js baytları worker'a aktarınca dizi boşalır.
      const hash = await sha256Hex(bytes);
      const pdf = await loadDocument(bytes);
      const record = await registerOpened(db, {
        name: fileName(path),
        filePath: path,
        hash,
        pageCount: pdf.numPages,
      });
      const scanned = looksScanned(await sampleTextChars(pdf));
      await currentRef.current?.pdf.loadingTask.destroy();
      setCurrent({ record, pdf, scanned });
      if (expected && expected.hash !== hash) {
        setNotice({
          kind: "info",
          text: `Seçtiğin dosyanın içeriği "${expected.name}" ile aynı değil; ayrı bir belge olarak açıldı.`,
        });
      }
    } catch (e) {
      if (e instanceof FileNotFoundError && expected) {
        setNotice({
          kind: "error",
          text: `"${expected.name}" bulunamadı. Dosya taşınmış, adı değişmiş ya da silinmiş olabilir:\n${expected.filePath}`,
          missing: expected,
        });
      } else {
        setNotice({ kind: "error", text: openErrorText(e) });
      }
    } finally {
      setLoading(false);
      refreshRecent();
    }
  }

  async function pickAndOpen(expected?: DocumentRecord) {
    const path = await pickPdfFile();
    if (path) await openPath(path, expected);
  }

  async function close() {
    await flushPageSave();
    await current?.pdf.loadingTask.destroy();
    setCurrent(null);
    setNotice(null);
    refreshRecent();
  }

  function handlePageChange(page: number) {
    const id = current?.record.id;
    if (id == null) return;
    pendingPage.current = { id, page };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushPageSave, 400);
  }

  // Pencereye sürüklenip bırakılan ilk PDF'i aç.
  const openPathRef = useRef(openPath);
  openPathRef.current = openPath;
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === "enter" || type === "over") setDragging(true);
      else if (type === "leave") setDragging(false);
      else if (type === "drop") {
        setDragging(false);
        const pdfPath = event.payload.paths.find((p) => p.toLowerCase().endsWith(".pdf"));
        if (pdfPath) openPathRef.current(pdfPath);
        else setNotice({ kind: "error", text: "Yalnızca PDF dosyaları açılabilir." });
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="reader">
      {dragging && <div className="drop-overlay">PDF'i açmak için bırak</div>}

      {notice && (
        <div className={`msg ${notice.kind} reader-notice`}>
          <span>{notice.text}</span>
          {notice.missing && (
            <button className="secondary" onClick={() => pickAndOpen(notice.missing)}>
              Dosyayı yeniden seç
            </button>
          )}
          <button className="secondary" onClick={() => setNotice(null)} aria-label="Kapat">
            ×
          </button>
        </div>
      )}

      {current ? (
        <>
          <div className="reader-header">
            <button className="secondary" onClick={close}>
              ← Belgeler
            </button>
            <strong className="doc-title" title={current.record.filePath}>
              {current.record.name}
            </strong>
            <button className="secondary" onClick={() => pickAndOpen()} disabled={loading}>
              Başka PDF aç
            </button>
          </div>
          {current.scanned && (
            <div className="msg error reader-notice">
              Bu PDF taranmış görünüyor: sayfalarda seçilebilir metin yok. Kelime işaretleme ve çeviri bu belgede
              çalışmaz (OCR desteklenmiyor).
            </div>
          )}
          <PdfViewer
            key={current.record.id}
            pdf={current.pdf}
            initialPage={current.record.lastPage}
            onPageChange={handlePageChange}
          />
        </>
      ) : (
        <div className="library">
          <div className="drop-zone">
            <h1>Duopdf</h1>
            <p className="muted">Bir PDF'i buraya sürükle ya da seç.</p>
            <button onClick={() => pickAndOpen()} disabled={loading}>
              {loading ? "Açılıyor…" : "PDF aç"}
            </button>
          </div>

          {recent.length > 0 && (
            <section className="recent">
              <h2>Son açılanlar</h2>
              <ul>
                {recent.map((doc) => (
                  <li key={doc.id}>
                    <button className="recent-item" onClick={() => openPath(doc.filePath, doc)} disabled={loading}>
                      <span className="recent-name">{doc.name}</span>
                      <span className="muted">
                        Sayfa {doc.lastPage} / {doc.pageCount} · {formatDate(doc.lastOpenedAt)}
                      </span>
                      <span className="muted recent-path">{doc.filePath}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

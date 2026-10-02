import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useRef, useState } from "react";
import { db, type DocumentRecord } from "../db/db";
import { clearRecent, hideFromRecent, recentDocuments, registerOpened, savePosition } from "../db/documents";
import { formatFromPath } from "../formats/types";
import { fileName, FileNotFoundError, pickDocumentFiles, readDocumentBytes, sha256Hex } from "./files";
import { disposeContent, loadContent, openErrorText, pageCountOf, type LoadedContent } from "./loadContent";
import { PdfViewer } from "./PdfViewer";
import { ReflowViewer } from "./ReflowViewer";

interface Tab {
  record: DocumentRecord;
  content: LoadedContent;
}

type Notice = { kind: "info" | "error"; text: string; missing?: DocumentRecord } | null;

const FORMAT_LABELS: Record<string, string> = { pdf: "PDF", epub: "EPUB", docx: "DOCX", pptx: "PPTX", txt: "TXT" };

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function ReaderPage() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  /** Etkin sekmedeki belge kimliği; null ise belge listesi gösterilir. */
  const [activeId, setActiveId] = useState<number | null>(null);
  const [recent, setRecent] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [dragging, setDragging] = useState(false);

  const tabbarRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  /** Belge başına bekleyen konum kaydı (kaydırırken her olayda yazmamak için). */
  const pending = useRef(new Map<number, { page: number; offset: number; timer: number }>());

  const refreshRecent = () => recentDocuments(db).then(setRecent);

  useEffect(() => {
    refreshRecent();
  }, []);

  // Etkin sekme dar pencerede çubuğun dışında kalmasın.
  useEffect(() => {
    tabbarRef.current?.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  function flushPosition(id: number): Promise<void> {
    const entry = pending.current.get(id);
    if (!entry) return Promise.resolve();
    window.clearTimeout(entry.timer);
    pending.current.delete(id);
    return savePosition(db, id, entry.page, entry.offset);
  }

  function handlePosition(id: number, page: number, offset = 0) {
    const previous = pending.current.get(id);
    if (previous) window.clearTimeout(previous.timer);
    const timer = window.setTimeout(() => flushPosition(id), 400);
    pending.current.set(id, { page, offset, timer });
  }

  async function openPath(path: string, expected?: DocumentRecord) {
    const format = formatFromPath(path);
    if (!format) {
      setNotice({ kind: "error", text: `Bu dosya türü desteklenmiyor: ${fileName(path)}` });
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const bytes = await readDocumentBytes(path);
      // Hash'i önce al: pdf.js baytları worker'a aktarınca dizi boşalır.
      const hash = await sha256Hex(bytes);
      const alreadyOpen = tabsRef.current.find((t) => t.record.hash === hash);
      if (alreadyOpen) {
        setActiveId(alreadyOpen.record.id);
        return;
      }
      if (expected) await flushPosition(expected.id);
      const name = fileName(path);
      const content = await loadContent(format, bytes, name);
      const record = await registerOpened(db, { name, filePath: path, hash, format, pageCount: pageCountOf(content) });
      setTabs((prev) => [...prev, { record, content }]);
      setActiveId(record.id);
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
        setNotice({ kind: "error", text: `${fileName(path)}: ${openErrorText(e)}` });
      }
    } finally {
      setLoading(false);
      refreshRecent();
    }
  }

  async function openPaths(paths: string[]) {
    for (const path of paths) await openPath(path);
  }

  async function pickAndOpen(expected?: DocumentRecord) {
    const paths = await pickDocumentFiles(!expected);
    if (expected && paths[0]) await openPath(paths[0], expected);
    else await openPaths(paths);
  }

  async function closeTab(id: number) {
    const index = tabs.findIndex((t) => t.record.id === id);
    if (index === -1) return;
    await flushPosition(id);
    const remaining = tabs.filter((t) => t.record.id !== id);
    setTabs(remaining);
    if (activeId === id) setActiveId(remaining[Math.min(index, remaining.length - 1)]?.record.id ?? null);
    disposeContent(tabs[index].content);
    refreshRecent();
  }

  async function removeFromRecent(id: number) {
    await hideFromRecent(db, id);
    refreshRecent();
  }

  async function clearHistory() {
    if (!confirm("Son açılanlar listesi temizlensin mi? Belgeler ve öğrenme verilerin silinmez.")) return;
    await clearRecent(db);
    refreshRecent();
  }

  function showLibrary() {
    setActiveId(null);
    refreshRecent();
  }

  // Pencereye sürüklenip bırakılan belgeleri sekmelerde aç.
  const openPathsRef = useRef(openPaths);
  openPathsRef.current = openPaths;
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === "enter" || type === "over") setDragging(true);
      else if (type === "leave") setDragging(false);
      else if (type === "drop") {
        setDragging(false);
        const paths = event.payload.paths;
        const supported = paths.filter((p) => formatFromPath(p) != null);
        if (supported.length > 0) openPathsRef.current(supported);
        if (supported.length < paths.length) {
          setNotice({ kind: "error", text: "Desteklenmeyen dosyalar atlandı. Açılabilenler: PDF, EPUB, DOCX, PPTX, TXT, MD." });
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="reader">
      {dragging && <div className="drop-overlay">Açmak için bırak</div>}

      <div ref={tabbarRef} className="tabbar" role="tablist">
        <button
          className={activeId === null ? "tab home active" : "tab home"}
          onClick={showLibrary}
          role="tab"
          aria-selected={activeId === null}
        >
          Belgeler
        </button>
        {tabs.map((t) => (
          <div
            key={t.record.id}
            className={t.record.id === activeId ? "tab active" : "tab"}
            role="tab"
            aria-selected={t.record.id === activeId}
            title={t.record.filePath}
          >
            <button className="tab-label" onClick={() => setActiveId(t.record.id)}>
              {t.record.name}
            </button>
            <button className="tab-close" onClick={() => closeTab(t.record.id)} aria-label={`${t.record.name} kapat`}>
              ×
            </button>
          </div>
        ))}
        <button className="tab add" onClick={() => pickAndOpen()} disabled={loading} title="Belge aç" aria-label="Belge aç">
          +
        </button>
      </div>

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

      <div className="tab-stack">
        {/* Sekmeler gizlenince kaydırma konumu kaybolmasın diye hepsi yerinde kalır, yalnızca görünmez olur. */}
        {tabs.map((t) => (
          <div key={t.record.id} className={t.record.id === activeId ? "tab-pane" : "tab-pane inactive"}>
            {t.content.noText && (
              <div className="msg error reader-notice">
                {t.content.kind === "pdf"
                  ? "Bu PDF taranmış görünüyor: sayfalarda seçilebilir metin yok. Kelime işaretleme ve çeviri bu belgede çalışmaz (OCR desteklenmiyor)."
                  : "Bu belgede okunabilir metin bulunamadı."}
              </div>
            )}
            {t.content.kind === "pdf" ? (
              <PdfViewer
                pdf={t.content.pdf}
                initialPage={t.record.lastPage}
                onPageChange={(page) => handlePosition(t.record.id, page)}
              />
            ) : (
              <ReflowViewer
                doc={t.content.doc}
                initialSection={t.record.lastPage}
                initialOffset={t.record.lastOffset}
                onPositionChange={(section, offset) => handlePosition(t.record.id, section, offset)}
              />
            )}
          </div>
        ))}

        {activeId === null && (
          <div className="tab-pane library">
            <div className="drop-zone">
              <h1>Duopdf</h1>
              <p className="muted">Bir belgeyi buraya sürükle ya da seç. PDF, EPUB, DOCX, PPTX ve TXT açılabilir.</p>
              <button onClick={() => pickAndOpen()} disabled={loading}>
                {loading ? "Açılıyor…" : "Belge aç"}
              </button>
            </div>

            {recent.length > 0 && (
              <section className="recent">
                <div className="recent-header">
                  <h2>Son açılanlar</h2>
                  <button className="secondary" onClick={clearHistory}>
                    Geçmişi temizle
                  </button>
                </div>
                <ul>
                  {recent.map((doc) => (
                    <li key={doc.id} className="recent-row">
                      <button className="recent-item" onClick={() => openPath(doc.filePath, doc)} disabled={loading}>
                        <span className="recent-name">
                          {doc.name} <span className="badge">{FORMAT_LABELS[doc.format] ?? doc.format}</span>
                        </span>
                        <span className="muted">
                          {doc.format === "pdf" ? "Sayfa" : "Bölüm"} {doc.lastPage} / {doc.pageCount} ·{" "}
                          {formatDate(doc.lastOpenedAt)}
                        </span>
                        <span className="muted recent-path">{doc.filePath}</span>
                      </button>
                      <button
                        className="secondary recent-remove"
                        onClick={() => removeFromRecent(doc.id)}
                        title="Listeden kaldır"
                        aria-label={`${doc.name} listeden kaldır`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

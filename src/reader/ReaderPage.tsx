import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { db, type DocumentRecord, type OccurrenceRecord } from "../db/db";
import {
  clearRecent,
  hideFromRecent,
  recentDocuments,
  registerOpened,
  saveOriginalPage,
  savePosition,
} from "../db/documents";
import { formatFromPath } from "../formats/types";
import type { Jump } from "../learning/jump";
import type { Pick } from "../learning/pick";
import { SentencePopup } from "../learning/SentencePopup";
import { WordPopup, type PickLocation } from "../learning/WordPopup";
import type { ProviderProfile } from "../settings/providers";
import { fileName, FileNotFoundError, pickDocumentFiles, readDocumentBytes, sha256Hex } from "./files";
import { disposeContent, loadContent, openErrorText, pageCountOf, type LoadedContent } from "./loadContent";
import { convertWithOffice, officeAppFor, officeAvailability, type OfficeAvailability } from "./office";
import { loadDocument } from "./pdfjs";
import { ErrorBoundary } from "./ErrorBoundary";
import { ImageViewer } from "./ImageViewer";
import { PdfViewer } from "./PdfViewer";
import { ReflowViewer } from "./ReflowViewer";

interface Tab {
  record: DocumentRecord;
  content: LoadedContent;
  /** DOCX/PPTX: metin görünümü mü, Office ile çevrilmiş orijinal görünüm mü. */
  view: "text" | "original";
  original?: PDFDocumentProxy;
  converting?: boolean;
  /** Kelime listesinden gelen "cümleye git" (hangi görünüm için). */
  jump?: Jump & { view: "text" | "original" };
}

export interface ReaderHandle {
  /** Belgeyi açar (gerekirse) ve kelimenin geçtiği cümleye gider. */
  openAt(occurrence: OccurrenceRecord): Promise<void>;
}

interface Props {
  profile: ProviderProfile | null;
  ref?: Ref<ReaderHandle>;
}

type Notice = { kind: "info" | "error"; text: string; missing?: DocumentRecord } | null;

const FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF",
  epub: "EPUB",
  docx: "DOCX",
  pptx: "PPTX",
  txt: "TXT",
  image: "Resim",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function ReaderPage({ profile, ref }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  /** Etkin sekmedeki belge kimliği; null ise belge listesi gösterilir. */
  const [activeId, setActiveId] = useState<number | null>(null);
  const [recent, setRecent] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [dragging, setDragging] = useState(false);
  const [office, setOffice] = useState<OfficeAvailability>({ word: false, powerpoint: false });
  const [popup, setPopup] = useState<{ pick: Pick; location: PickLocation; documentHash: string } | null>(null);
  const closePopup = useCallback(() => setPopup(null), []);

  const tabbarRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  /** Belge başına bekleyen konum kaydı (kaydırırken her olayda yazmamak için). */
  const pending = useRef(new Map<number, { page: number; offset: number; timer: number }>());

  const refreshRecent = () => recentDocuments(db).then(setRecent);

  useEffect(() => {
    refreshRecent();
    officeAvailability().then(setOffice);
  }, []);

  function patchTab(id: number, patch: Partial<Tab>) {
    setTabs((prev) => prev.map((t) => (t.record.id === id ? { ...t, ...patch } : t)));
  }

  async function setView(tab: Tab, view: Tab["view"]) {
    const id = tab.record.id;
    if (view === "text" || tab.original) {
      patchTab(id, { view });
      return;
    }
    patchTab(id, { converting: true });
    setNotice(null);
    try {
      const pdfPath = await convertWithOffice(tab.record.filePath, tab.record.hash);
      const original = await loadDocument(await readDocumentBytes(pdfPath));
      // Dönüştürme sürerken sekme kapatıldıysa belgeyi bırak.
      if (!tabsRef.current.some((t) => t.record.id === id)) {
        await original.loadingTask.destroy();
        return;
      }
      patchTab(id, { original, view: "original", converting: false });
    } catch (e) {
      patchTab(id, { converting: false });
      const text =
        e instanceof FileNotFoundError
          ? `"${tab.record.name}" bulunamadı; orijinal görünüm için dosyanın yerinde olması gerekiyor.`
          : `Orijinal görünüm açılamadı: ${e instanceof Error ? e.message : String(e)}`;
      setNotice({ kind: "error", text });
    }
  }

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

  /** Belgeyi açar ve sekmesindeki belge kimliğini döndürür (açılamazsa null). */
  async function openPath(path: string, expected?: DocumentRecord): Promise<number | null> {
    const format = formatFromPath(path);
    if (!format) {
      setNotice({ kind: "error", text: `Bu dosya türü desteklenmiyor: ${fileName(path)}` });
      return null;
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
        return alreadyOpen.record.id;
      }
      if (expected) await flushPosition(expected.id);
      const name = fileName(path);
      const content = await loadContent(format, bytes, name);
      const record = await registerOpened(db, { name, filePath: path, hash, format, pageCount: pageCountOf(content) });
      setTabs((prev) => [...prev, { record, content, view: "text" }]);
      setActiveId(record.id);
      if (expected && expected.hash !== hash) {
        setNotice({
          kind: "info",
          text: `Seçtiğin dosyanın içeriği "${expected.name}" ile aynı değil; ayrı bir belge olarak açıldı.`,
        });
      }
      return record.id;
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
    return null;
  }

  useImperativeHandle(ref, () => ({
    async openAt(occ) {
      const record = await db.documents.get(occ.documentId);
      if (!record) {
        setNotice({ kind: "error", text: "Bu kelimenin geçtiği belgenin kaydı bulunamadı." });
        return;
      }
      const id = await openPath(record.filePath, record);
      if (id !== record.id) return;
      // Yeni açılan sekmenin durumu işlensin.
      await new Promise((r) => setTimeout(r));
      const tab = tabsRef.current.find((t) => t.record.id === id);
      if (!tab) return;
      if (occ.view === "original" && tab.view !== "original") await setView(tab, "original");
      patchTab(id, { jump: { page: occ.page, sentence: occ.sentence, view: occ.view, nonce: Date.now() } });
    },
  }));

  function handlePick(tab: Tab, view: "text" | "original", pick: Pick, page: number) {
    setPopup({ pick, location: { documentId: tab.record.id, page, view }, documentHash: tab.record.hash });
  }

  /** Kelime penceresinden "Cümleyi çevir": aynı yerde cümle penceresine geç. */
  const translateWordSentence = useCallback(() => {
    setPopup((p) =>
      p && p.pick.kind === "word"
        ? { ...p, pick: { kind: "sentence", text: p.pick.sentence, range: p.pick.sentenceRange, rect: p.pick.rect } }
        : p,
    );
  }, []);

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
    tabs[index].original?.loadingTask.destroy();
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
          setNotice({ kind: "error", text: "Desteklenmeyen dosyalar atlandı. Açılabilenler: PDF, EPUB, DOCX, PPTX, TXT, MD ve resimler (PNG, JPG, WEBP, BMP)." });
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
      {popup?.pick.kind === "word" && (
        <WordPopup
          pick={popup.pick}
          location={popup.location}
          profile={profile}
          onClose={closePopup}
          onTranslateSentence={translateWordSentence}
        />
      )}
      {popup?.pick.kind === "sentence" && (
        <SentencePopup
          pick={popup.pick}
          source={{ documentHash: popup.documentHash, page: popup.location.page }}
          profile={profile}
          onClose={closePopup}
        />
      )}

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
        {tabs.map((t) => {
          const officeApp = officeAppFor(t.record.format, office);
          return (
            <div key={t.record.id} className={t.record.id === activeId ? "tab-pane" : "tab-pane inactive"}>
              {officeApp && (
                <div className="view-switch" role="group" aria-label="Görünüm">
                  <button
                    className={t.view === "text" ? "active" : ""}
                    onClick={() => setView(t, "text")}
                    aria-pressed={t.view === "text"}
                  >
                    Metin görünümü
                  </button>
                  <button
                    className={t.view === "original" ? "active" : ""}
                    onClick={() => setView(t, "original")}
                    aria-pressed={t.view === "original"}
                    disabled={t.converting}
                  >
                    {t.converting ? `${officeApp} ile dönüştürülüyor…` : `Orijinal görünüm (${officeApp})`}
                  </button>
                </div>
              )}
              {t.view === "text" && t.content.noText && (
                <div className={t.content.kind === "pdf" ? "msg info reader-notice" : "msg error reader-notice"}>
                  {t.content.kind === "pdf"
                    ? "Bu PDF taranmış görünüyor. Sayfalardaki yazılar sayfa ekrana geldikçe OCR ile okunuyor (sayfa başına birkaç saniye); okunan metin kusurlu olabilir."
                    : "Bu belgede okunabilir metin bulunamadı."}
                </div>
              )}
              <div className="view-stack">
                {/* Görünümler arasında geçince konum kaybolmasın diye ikisi de yerinde kalır. */}
                <div className={t.view === "text" ? "view-layer" : "view-layer inactive"}>
                  <ErrorBoundary label="Belge görüntülenemedi">
                  {t.content.kind === "pdf" ? (
                    <PdfViewer
                      pdf={t.content.pdf}
                      ocrKey={`${t.record.hash}:text`}
                      initialPage={t.record.lastPage}
                      onPageChange={(page) => handlePosition(t.record.id, page)}
                      onPick={(pick, page) => handlePick(t, "text", pick, page)}
                      jump={t.jump?.view === "text" ? t.jump : undefined}
                    />
                  ) : t.content.kind === "image" ? (
                    <ImageViewer
                      image={t.content.image}
                      onPick={(pick, page) => handlePick(t, "text", pick, page)}
                      jump={t.jump?.view === "text" ? t.jump : undefined}
                    />
                  ) : (
                    <ReflowViewer
                      doc={t.content.doc}
                      initialSection={t.record.lastPage}
                      initialOffset={t.record.lastOffset}
                      onPositionChange={(section, offset) => handlePosition(t.record.id, section, offset)}
                      onPick={(pick, section) => handlePick(t, "text", pick, section)}
                      jump={t.jump?.view === "text" ? t.jump : undefined}
                    />
                  )}
                  </ErrorBoundary>
                </div>
                {t.original && (
                  <div className={t.view === "original" ? "view-layer" : "view-layer inactive"}>
                    <ErrorBoundary label="Orijinal görünüm gösterilemedi">
                    <PdfViewer
                      pdf={t.original}
                      ocrKey={`${t.record.hash}:original`}
                      initialPage={t.record.originalPage ?? 1}
                      onPageChange={(page) => saveOriginalPage(db, t.record.id, page)}
                      onPick={(pick, page) => handlePick(t, "original", pick, page)}
                      jump={t.jump?.view === "original" ? t.jump : undefined}
                    />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {activeId === null && (
          <div className="tab-pane library">
            <div className="drop-zone">
              <h1>Duopdf</h1>
              <p className="muted">Bir belgeyi buraya sürükle ya da seç. PDF, EPUB, DOCX, PPTX, TXT ve resim (PNG, JPG) açılabilir.</p>
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
                          {doc.format !== "image" &&
                            `${doc.format === "pdf" ? "Sayfa" : "Bölüm"} ${doc.lastPage} / ${doc.pageCount} · `}
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

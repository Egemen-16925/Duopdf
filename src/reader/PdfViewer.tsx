import "./pdfjs"; // pdf_viewer.mjs'ten önce yüklenmeli (globalThis.pdfjsLib)
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { useEffect, useRef, useState } from "react";
import { trackRoot, untrackRoot } from "../learning/highlights";
import { flashSentence, type Jump } from "../learning/jump";
import { pickFromPointer, type Pick } from "../learning/pick";
import { InkToolbar } from "../ink/InkToolbar";
import { readingToolActive, useInk } from "../ink/useInk";
import type { StrokeRecord } from "../db/db";
import { PdfPageOcr } from "../ocr/pdfPages";
import { attachPinch, wheelZoomFactor, ZoomAccumulator } from "./zoomGesture";

interface Props {
  pdf: PDFDocumentProxy;
  initialPage: number;
  onPageChange(page: number): void;
  /** Kelimeye tıklanınca ya da öbek seçilince (sayfa numarasıyla). */
  onPick?(pick: Pick, page: number): void;
  jump?: Jump;
  /** Verilirse sayfalardaki görseller OCR ile okunur: "<belge hash>:<görünüm>". */
  ocrKey?: string;
  /** "Sayfayı yapay zekâ ile oku" düğmesine basılınca (geçerli sayfa). */
  onAiRead?(page: number): void;
  /** Verilirse sayfalara çizilebilir: çizimler bu belgeye ve görünüme bağlı saklanır. */
  docHash?: string;
  inkView?: StrokeRecord["view"];
}

const ZOOM_PRESETS: { value: string; label: string }[] = [
  { value: "page-width", label: "Sayfa genişliği" },
  { value: "page-fit", label: "Tam sayfa" },
  { value: "0.75", label: "%75" },
  { value: "1", label: "%100" },
  { value: "1.25", label: "%125" },
  { value: "1.5", label: "%150" },
  { value: "2", label: "%200" },
];

export function PdfViewer({ pdf, initialPage, onPageChange, onPick, jump, ocrKey, onAiRead, docHash, inkView }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfViewer = useRef<PDFViewer | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  /** Sayfa ya da metin katmanı henüz hazır değilken gelen "cümleye git" isteği. */
  const pendingJump = useRef<Jump | null>(null);
  const ready = useRef(false);

  const [page, setPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [scale, setScale] = useState(1);
  const [scaleValue, setScaleValue] = useState("page-width");
  const [ocrPending, setOcrPending] = useState(0);

  const ink = useInk({
    containerRef,
    docHash,
    view: inkView,
    rootSelector: ".textLayer",
    mode: "pdf",
    onGlowPick: (pick, root) => {
      const page = Number(root.closest<HTMLElement>(".page")?.dataset.pageNumber);
      if (page) onPickRef.current?.(pick, page);
    },
  });
  const inkRef = useRef(ink);
  inkRef.current = ink;
  // Çizim yüzeyi sayfalar çizildikten sonra hazır olduysa, çizilmiş sayfalara hemen takılsın.
  useEffect(() => {
    containerRef.current?.querySelectorAll<HTMLElement>(".page[data-loaded]").forEach((pageDiv) => {
      const n = Number(pageDiv.dataset.pageNumber);
      if (n) ink.surface?.attach(n, pageDiv);
    });
  }, [ink.surface]);

  useEffect(() => {
    const container = containerRef.current!;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const viewer = new PDFViewer({ container, viewer: viewerRef.current!, eventBus, linkService });
    linkService.setViewer(viewer);
    pdfViewer.current = viewer;

    eventBus.on("pagesinit", () => {
      ready.current = true;
      viewer.currentScaleValue = "page-width";
      viewer.currentPageNumber = Math.min(Math.max(pendingJump.current?.page ?? initialPage, 1), pdf.numPages);
    });
    // Her sayfanın metin katmanı çizilince (ilk açılış, kaydırma, yakınlaştırma) vurguları hesapla.
    const textLayers = new Set<Element>();
    const tryPendingJump = (pageNumber: number, root: Element) => {
      const pending = pendingJump.current;
      if (pending && pending.page === pageNumber && flashSentence(root, "pdf", pending.sentence)) pendingJump.current = null;
    };
    // Görsellerdeki yazılar (taranmış sayfalar, şekiller) OCR ile okunur ve ayrı bir katman olarak eklenir.
    const ocr = ocrKey ? new PdfPageOcr(pdf, ocrKey, setOcrPending) : null;
    // Çizim tuvali sayfa öğesine takılır; pdf.js sayfayı yeniden kurunca yeniden takılır.
    const attachInk = (pageNumber: number, pageDiv: HTMLElement | null | undefined) => {
      if (pageDiv) inkRef.current.surface?.attach(pageNumber, pageDiv);
    };
    eventBus.on("pagerendered", (evt: { pageNumber: number; source: { div: HTMLElement } }) => attachInk(evt.pageNumber, evt.source.div));
    eventBus.on("textlayerrendered", (evt: { pageNumber: number; source: { textLayer?: { div: HTMLElement } } }) => {
      const div = evt.source.textLayer?.div;
      if (!div) return;
      attachInk(evt.pageNumber, div.closest<HTMLElement>(".page"));
      textLayers.add(div);
      trackRoot(div, "pdf");
      tryPendingJump(evt.pageNumber, div);
      const pageDiv = div.closest<HTMLElement>(".page");
      if (ocr && pageDiv) {
        ocr
          .attach(evt.pageNumber, pageDiv, div)
          .then((layer) => {
            if (!layer) return;
            textLayers.add(layer);
            tryPendingJump(evt.pageNumber, layer);
          })
          .catch((e) => console.warn("OCR:", e));
      }
    });
    eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      setPage(pageNumber);
      setPageInput(String(pageNumber));
      onPageChangeRef.current(pageNumber);
    });
    eventBus.on("scalechanging", ({ scale, presetValue }: { scale: number; presetValue?: string }) => {
      setScale(scale);
      setScaleValue(presetValue ?? String(scale));
    });

    viewer.setDocument(pdf);
    linkService.setDocument(pdf);

    // Ctrl + tekerlek ve touchpad'de iki parmakla sıkıştırma: imlecin olduğu yere göre, yumuşak.
    // (Dokunmatik ekranda sıkıştırmayı pdf.js kendisi yapar.)
    const zoomAcc = new ZoomAccumulator();
    const zoomBy = (factor: number, x: number, y: number) => {
      const apply = zoomAcc.add(factor, viewer.currentScale);
      if (apply) viewer.updateScale({ scaleFactor: apply, origin: [x, y], drawingDelay: 400 });
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(wheelZoomFactor(e), e.clientX, e.clientY);
    };
    // Dokunmatik ekranda iki parmakla sıkıştırma (kalem modunda da).
    const detachPinch = attachPinch(container, zoomBy);
    // PDF içindeki dış bağlantılar uygulamanın içinde açılmasın, tarayıcıda açılsın.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (link && /^https?:/i.test(link.href)) {
        e.preventDefault();
        openUrl(link.href);
      }
    };
    // Kelimeye tıklama / öbek seçme
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("a, button")) return;
      if (!readingToolActive(!!inkRef.current.surface)) return;
      const result = pickFromPointer(e, ".textLayer", "pdf");
      const page = Number(result?.root.closest<HTMLElement>(".page")?.dataset.pageNumber);
      if (result && page) onPickRef.current?.(result.pick, page);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("click", onClick);
    container.addEventListener("mouseup", onMouseUp);
    // Pencere boyutu değişince "sayfa genişliği" gibi hazır ayarlar yeniden hesaplansın.
    const resizeObserver = new ResizeObserver(() => {
      const value = viewer.currentScaleValue;
      if (value === "page-width" || value === "page-fit" || value === "auto") viewer.currentScaleValue = value;
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      detachPinch();
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("click", onClick);
      container.removeEventListener("mouseup", onMouseUp);
      textLayers.forEach(untrackRoot);
      ready.current = false;
      viewer.setDocument(null as unknown as PDFDocumentProxy);
      linkService.setDocument(null);
      pdfViewer.current = null;
    };
  }, [pdf]);

  // Kelime listesinden gelen "cümleye git": sayfaya git, metin katmanı hazırsa cümleyi yak.
  useEffect(() => {
    const viewer = pdfViewer.current;
    if (!jump || !viewer) return;
    pendingJump.current = jump;
    if (!ready.current) return; // pagesinit içinde uygulanacak
    viewer.currentPageNumber = Math.min(Math.max(jump.page, 1), pdf.numPages);
    // Cümle gerçek metinde ya da OCR katmanında olabilir.
    const roots = containerRef.current?.querySelectorAll(`.page[data-page-number="${jump.page}"] .textLayer`) ?? [];
    if ([...roots].some((root) => root.textContent && flashSentence(root, "pdf", jump.sentence))) pendingJump.current = null;
  }, [jump?.nonce]);

  function goToPage(value: string) {
    const n = Number.parseInt(value, 10);
    const viewer = pdfViewer.current;
    if (!viewer || !Number.isFinite(n)) {
      setPageInput(String(page));
      return;
    }
    viewer.currentPageNumber = Math.min(Math.max(n, 1), pdf.numPages);
    setPageInput(String(viewer.currentPageNumber));
  }

  function setZoom(value: string) {
    if (pdfViewer.current) pdfViewer.current.currentScaleValue = value;
  }

  const zoomLabel = `%${Math.round(scale * 100)}`;
  const isPreset = ZOOM_PRESETS.some((p) => p.value === scaleValue);

  return (
    <div className="pdf-viewer">
      <div className="reader-toolbar">
        <button className="secondary" onClick={() => goToPage(String(page - 1))} disabled={page <= 1} title="Önceki sayfa">
          ‹
        </button>
        <input
          className="page-input"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && goToPage(pageInput)}
          onBlur={() => goToPage(pageInput)}
          aria-label="Sayfa numarası"
        />
        <span className="muted">/ {pdf.numPages}</span>
        <button
          className="secondary"
          onClick={() => goToPage(String(page + 1))}
          disabled={page >= pdf.numPages}
          title="Sonraki sayfa"
        >
          ›
        </button>
        <span className="toolbar-sep" />
        <button className="secondary" onClick={() => pdfViewer.current?.updateScale({ steps: -1 })} title="Uzaklaştır">
          −
        </button>
        <select value={isPreset ? scaleValue : "custom"} onChange={(e) => setZoom(e.target.value)} aria-label="Yakınlaştırma">
          {!isPreset && <option value="custom">{zoomLabel}</option>}
          {ZOOM_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={() => pdfViewer.current?.updateScale({ steps: 1 })} title="Yakınlaştır">
          +
        </button>
        {ocrPending > 0 && (
          <>
            <span className="toolbar-sep" />
            <span className="ocr-status muted">Görsellerdeki yazılar okunuyor…</span>
          </>
        )}
        {onAiRead && (
          <>
            <span className="toolbar-sep" />
            <button className="secondary" onClick={() => onAiRead(page)} title="Bu sayfadaki görsel yazıları yapay zekâya okut">
              Sayfayı yapay zekâ ile oku
            </button>
          </>
        )}
        <span className="toolbar-sep" />
        <InkToolbar ink={ink} />
      </div>
      <div className="viewer-wrap">
        <div ref={containerRef} className="viewer-container">
          <div ref={viewerRef} className="pdfViewer" />
        </div>
      </div>
    </div>
  );
}

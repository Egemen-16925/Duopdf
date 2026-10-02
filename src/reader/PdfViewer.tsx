import "../pdf/pdfjs"; // pdf_viewer.mjs'ten önce yüklenmeli (globalThis.pdfjsLib)
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { useEffect, useRef, useState } from "react";

interface Props {
  pdf: PDFDocumentProxy;
  initialPage: number;
  onPageChange(page: number): void;
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

export function PdfViewer({ pdf, initialPage, onPageChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfViewer = useRef<PDFViewer | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const [page, setPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [scale, setScale] = useState(1);
  const [scaleValue, setScaleValue] = useState("page-width");

  useEffect(() => {
    const container = containerRef.current!;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const viewer = new PDFViewer({ container, viewer: viewerRef.current!, eventBus, linkService });
    linkService.setViewer(viewer);
    pdfViewer.current = viewer;

    eventBus.on("pagesinit", () => {
      viewer.currentScaleValue = "page-width";
      viewer.currentPageNumber = Math.min(Math.max(initialPage, 1), pdf.numPages);
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

    // Ctrl + tekerlek ile yakınlaştırma
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      viewer.updateScale({ steps: e.deltaY < 0 ? 1 : -1 });
    };
    // PDF içindeki dış bağlantılar uygulamanın içinde açılmasın, tarayıcıda açılsın.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (link && /^https?:/i.test(link.href)) {
        e.preventDefault();
        openUrl(link.href);
      }
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("click", onClick);

    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("click", onClick);
      viewer.setDocument(null as unknown as PDFDocumentProxy);
      linkService.setDocument(null);
      pdfViewer.current = null;
    };
  }, [pdf]);

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
      </div>
      <div className="viewer-wrap">
        <div ref={containerRef} className="viewer-container">
          <div ref={viewerRef} className="pdfViewer" />
        </div>
      </div>
    </div>
  );
}

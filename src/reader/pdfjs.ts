import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// pdf_viewer.mjs kütüphaneyi globalThis.pdfjsLib üzerinden bekler; bu modül ondan önce yüklenmeli.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
(globalThis as unknown as { pdfjsLib: typeof pdfjsLib }).pdfjsLib = pdfjsLib;

export { pdfjsLib };

/** Belgeyi yükler. Varlıklar vite derlemesinde public/pdfjs altına kopyalanır. */
export function loadDocument(data: Uint8Array) {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
  }).promise;
}

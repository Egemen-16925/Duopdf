import type { PDFDocumentProxy } from "pdfjs-dist";
import { docxToSections } from "../formats/docx";
import { epubToReflow } from "../formats/epub";
import { pptxToSections } from "../formats/pptx";
import { decodeText, textToSections } from "../formats/txt";
import type { DocFormat, ReflowDoc } from "../formats/types";
import { loadDocument } from "./pdfjs";
import { looksScanned, sampleTextChars } from "./textCheck";

export type LoadedContent =
  | { kind: "pdf"; pdf: PDFDocumentProxy; noText: boolean }
  | { kind: "reflow"; doc: ReflowDoc; noText: boolean };

function reflowHasText(doc: ReflowDoc): boolean {
  const text = doc.sections.map((s) => s.html.replace(/<[^>]*>/g, "")).join("");
  return text.replace(/\s/g, "").length >= 20;
}

export async function loadContent(format: DocFormat, bytes: Uint8Array, name: string): Promise<LoadedContent> {
  if (format === "pdf") {
    const pdf = await loadDocument(bytes);
    return { kind: "pdf", pdf, noText: looksScanned(await sampleTextChars(pdf)) };
  }
  let doc: ReflowDoc;
  if (format === "epub") doc = await epubToReflow(bytes);
  else if (format === "docx") doc = { sections: await docxToSections(bytes, name), objectUrls: [] };
  else if (format === "pptx") doc = { sections: await pptxToSections(bytes), objectUrls: [] };
  else doc = { sections: textToSections(decodeText(bytes), name), objectUrls: [] };
  if (doc.sections.length === 0) doc.sections.push({ title: name, html: "" });
  return { kind: "reflow", doc, noText: !reflowHasText(doc) };
}

export function pageCountOf(content: LoadedContent): number {
  return content.kind === "pdf" ? content.pdf.numPages : content.doc.sections.length;
}

export async function disposeContent(content: LoadedContent): Promise<void> {
  if (content.kind === "pdf") await content.pdf.loadingTask.destroy();
  else content.doc.objectUrls.forEach((url) => URL.revokeObjectURL(url));
}

export function openErrorText(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "PasswordException") return "Bu PDF şifreli. Şifreli PDF'ler şimdilik desteklenmiyor.";
  if (name === "InvalidPDFException") return "Bu dosya okunamadı: bozuk ya da geçerli bir PDF değil.";
  return `Belge açılamadı: ${e instanceof Error ? e.message : String(e)}`;
}

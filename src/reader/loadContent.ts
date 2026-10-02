import type { PDFDocumentProxy } from "pdfjs-dist";
import { docxToSections } from "../formats/docx";
import { epubToReflow } from "../formats/epub";
import { pptxToSections } from "../formats/pptx";
import { decodeText, textToSections } from "../formats/txt";
import { imageMimeType, type DocFormat, type ReflowDoc } from "../formats/types";
import { loadDocument } from "./pdfjs";
import { looksScanned, sampleTextChars } from "./textCheck";

export interface LoadedImage {
  blob: Blob;
  /** Görüntüleme için blob adresi (sekme kapanınca bırakılır). */
  url: string;
  /** EXIF yönü uygulanmış piksel boyutu. */
  width: number;
  height: number;
}

export type LoadedContent =
  | { kind: "pdf"; pdf: PDFDocumentProxy; noText: boolean }
  | { kind: "reflow"; doc: ReflowDoc; noText: boolean }
  | { kind: "image"; image: LoadedImage; noText: boolean };

function reflowHasText(doc: ReflowDoc): boolean {
  const text = doc.sections.map((s) => s.html.replace(/<[^>]*>/g, "")).join("");
  return text.replace(/\s/g, "").length >= 20;
}

async function loadImage(bytes: Uint8Array, name: string): Promise<LoadedImage> {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: imageMimeType(name) });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Resim açılamadı: bozuk ya da desteklenmeyen bir resim.");
  }
  const image = { blob, url: URL.createObjectURL(blob), width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return image;
}

export async function loadContent(format: DocFormat, bytes: Uint8Array, name: string): Promise<LoadedContent> {
  if (format === "pdf") {
    const pdf = await loadDocument(bytes);
    return { kind: "pdf", pdf, noText: looksScanned(await sampleTextChars(pdf)) };
  }
  // Resimdeki yazı açıldıktan sonra OCR ile okunur; baştan "metin yok" denmez.
  if (format === "image") return { kind: "image", image: await loadImage(bytes, name), noText: false };
  let doc: ReflowDoc;
  if (format === "epub") doc = await epubToReflow(bytes);
  else if (format === "docx") doc = { sections: await docxToSections(bytes, name), objectUrls: [] };
  else if (format === "pptx") doc = { sections: await pptxToSections(bytes), objectUrls: [] };
  else doc = { sections: textToSections(decodeText(bytes), name), objectUrls: [] };
  if (doc.sections.length === 0) doc.sections.push({ title: name, html: "" });
  return { kind: "reflow", doc, noText: !reflowHasText(doc) };
}

export function pageCountOf(content: LoadedContent): number {
  if (content.kind === "pdf") return content.pdf.numPages;
  if (content.kind === "image") return 1;
  return content.doc.sections.length;
}

export async function disposeContent(content: LoadedContent): Promise<void> {
  if (content.kind === "pdf") await content.pdf.loadingTask.destroy();
  else if (content.kind === "image") URL.revokeObjectURL(content.image.url);
  else content.doc.objectUrls.forEach((url) => URL.revokeObjectURL(url));
}

export function openErrorText(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "PasswordException") return "Bu PDF şifreli. Şifreli PDF'ler şimdilik desteklenmiyor.";
  if (name === "InvalidPDFException") return "Bu dosya okunamadı: bozuk ya da geçerli bir PDF değil.";
  return `Belge açılamadı: ${e instanceof Error ? e.message : String(e)}`;
}

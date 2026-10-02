export type DocFormat = "pdf" | "epub" | "docx" | "pptx" | "txt" | "image";

/** Uzantı → biçim. src-tauri/src/lib.rs içindeki SUPPORTED_EXTENSIONS ile aynı tutulmalı. */
const EXTENSIONS: Record<string, DocFormat> = {
  pdf: "pdf",
  epub: "epub",
  docx: "docx",
  pptx: "pptx",
  txt: "txt",
  md: "txt",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  bmp: "image",
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSIONS);
export const IMAGE_EXTENSIONS = SUPPORTED_EXTENSIONS.filter((ext) => EXTENSIONS[ext] === "image");

const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", bmp: "image/bmp" };

export function imageMimeType(path: string): string {
  return IMAGE_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "image/png";
}

export function formatFromPath(path: string): DocFormat | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSIONS[ext] ?? null;
}

/** PDF dışındaki biçimler akan metin olarak gösterilir. */
export interface ReflowSection {
  title: string;
  /** Temizlenmiş (güvenli) HTML. */
  html: string;
  /** Kitap içi bağlantıların hedeflediği kimlik (EPUB). Yoksa `s<sıra>` kullanılır. */
  anchor?: string;
}

export interface ReflowDoc {
  sections: ReflowSection[];
  /** Belge kapanınca serbest bırakılacak blob adresleri (EPUB resimleri). */
  objectUrls: string[];
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

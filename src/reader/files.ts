import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { IMAGE_EXTENSIONS, SUPPORTED_EXTENSIONS } from "../formats/types";
import { isAndroid } from "../platform";

/** Seçilen dosya: masaüstünde yol, Android'de `content://` adresi ve görünen adı. */
export interface PickedFile {
  path: string;
  name: string;
}

/** Android seçicisinde gösterilecek türler (bazı uygulamalar EPUB'u tanımadığı için octet-stream de var). */
const ANDROID_DOCUMENT_TYPES = [
  "application/pdf",
  "application/epub+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "application/octet-stream",
];

/** Android: sistem seçicisini açar; seçilen belgelere kalıcı okuma izni alınır. */
export async function pickAndroidFiles(mimeTypes: string[], multiple: boolean): Promise<PickedFile[]> {
  const files = await invoke<{ uri: string; name: string | null }[]>("pick_documents", { mimeTypes, multiple });
  return files.map((f) => ({ path: f.uri, name: f.name ?? fileName(decodeURIComponent(f.uri)) }));
}

/** Android: kaydedilecek yeri seçtirir; vazgeçilirse null. */
export async function createAndroidFile(name: string, mimeType: string): Promise<PickedFile | null> {
  const file = await invoke<{ uri: string | null; name: string | null }>("create_document", { name, mimeType });
  return file.uri ? { path: file.uri, name: file.name ?? name } : null;
}

/** Android: belge listeden kaldırılınca kalıcı okuma iznini bırakır. */
export async function releaseAndroidFile(path: string): Promise<void> {
  if (isAndroid && path.startsWith("content://")) await invoke("release_document", { uri: path }).catch(() => {});
}

export class FileNotFoundError extends Error {
  constructor(public path: string) {
    super(`Dosya bulunamadı: ${path}`);
    this.name = "FileNotFoundError";
  }
}

export async function readDocumentBytes(path: string): Promise<Uint8Array> {
  try {
    const buffer = await invoke<ArrayBuffer>("read_document", { path });
    return new Uint8Array(buffer);
  } catch (e) {
    if (e === "NOT_FOUND") throw new FileNotFoundError(path);
    throw new Error(String(e));
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pickDocumentFiles(multiple = true): Promise<PickedFile[]> {
  if (isAndroid) return pickAndroidFiles(ANDROID_DOCUMENT_TYPES, multiple);
  const selected = await open({
    multiple,
    directory: false,
    filters: [
      { name: "Belgeler (PDF, EPUB, DOCX, PPTX, TXT, resim)", extensions: SUPPORTED_EXTENSIONS },
      { name: "PDF", extensions: ["pdf"] },
      { name: "E-kitap (EPUB)", extensions: ["epub"] },
      { name: "Word (DOCX)", extensions: ["docx"] },
      { name: "PowerPoint (PPTX)", extensions: ["pptx"] },
      { name: "Metin (TXT, MD)", extensions: ["txt", "md"] },
      { name: "Resim (PNG, JPG, WEBP, BMP)", extensions: IMAGE_EXTENSIONS },
    ],
  });
  if (selected == null) return [];
  return (Array.isArray(selected) ? selected : [selected]).map((path) => ({ path, name: fileName(path) }));
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

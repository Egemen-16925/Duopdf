import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SUPPORTED_EXTENSIONS } from "../formats/types";

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

export async function pickDocumentFiles(multiple = true): Promise<string[]> {
  const selected = await open({
    multiple,
    directory: false,
    filters: [
      { name: "Belgeler (PDF, EPUB, DOCX, PPTX, TXT)", extensions: SUPPORTED_EXTENSIONS },
      { name: "PDF", extensions: ["pdf"] },
      { name: "E-kitap (EPUB)", extensions: ["epub"] },
      { name: "Word (DOCX)", extensions: ["docx"] },
      { name: "PowerPoint (PPTX)", extensions: ["pptx"] },
      { name: "Metin (TXT, MD)", extensions: ["txt", "md"] },
    ],
  });
  if (selected == null) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

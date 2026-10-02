import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export class FileNotFoundError extends Error {
  constructor(public path: string) {
    super(`Dosya bulunamadı: ${path}`);
    this.name = "FileNotFoundError";
  }
}

export async function readPdfBytes(path: string): Promise<Uint8Array> {
  try {
    const buffer = await invoke<ArrayBuffer>("read_pdf", { path });
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

export async function pickPdfFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

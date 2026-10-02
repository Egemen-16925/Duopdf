import { escapeHtml, type ReflowSection } from "./types";

/** UTF-8 dener; geçersizse Türkçe Windows kod sayfasına (1254) düşer. */
export function decodeText(bytes: Uint8Array): string {
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(hasBom ? bytes.subarray(3) : bytes);
  } catch {
    return new TextDecoder("windows-1254").decode(bytes);
  }
}

/** Boş satırlar paragrafı ayırır; paragraf içindeki tek satır sonları korunur. */
export function textToSections(text: string, title: string): ReflowSection[] {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\n+|\s+$/g, ""))
    .filter((p) => p.trim().length > 0);
  const html = paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n");
  return [{ title, html }];
}

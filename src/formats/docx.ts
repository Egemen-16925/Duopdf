import mammoth from "mammoth";
import { sanitizeHtml } from "./sanitize";
import type { ReflowSection } from "./types";

export async function docxToSections(bytes: Uint8Array, title: string): Promise<ReflowSection[]> {
  const arrayBuffer = bytes.slice().buffer;
  // Tarayıcı sürümü `arrayBuffer`, Node sürümü (testler) `buffer` bekler.
  const result = await mammoth.convertToHtml({ arrayBuffer, buffer: arrayBuffer } as unknown as { arrayBuffer: ArrayBuffer });
  return [{ title, html: sanitizeHtml(result.value) }];
}

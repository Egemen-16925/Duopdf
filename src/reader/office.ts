import { invoke } from "@tauri-apps/api/core";
import type { DocFormat } from "../formats/types";
import { FileNotFoundError } from "./files";

export interface OfficeAvailability {
  word: boolean;
  powerpoint: boolean;
}

let availability: Promise<OfficeAvailability> | null = null;

/** Kurulu Word/PowerPoint var mı (uygulama açıkken bir kez sorulur). */
export function officeAvailability(): Promise<OfficeAvailability> {
  availability ??= invoke<OfficeAvailability>("office_available").catch(() => ({ word: false, powerpoint: false }));
  return availability;
}

export function officeAppFor(format: DocFormat, office: OfficeAvailability): "Word" | "PowerPoint" | null {
  if (format === "docx" && office.word) return "Word";
  if (format === "pptx" && office.powerpoint) return "PowerPoint";
  return null;
}

/** Belgeyi Office ile PDF'e çevirir; önbellekteki PDF'in yolunu döndürür. */
export async function convertWithOffice(path: string, hash: string): Promise<string> {
  try {
    return await invoke<string>("convert_with_office", { path, hash });
  } catch (e) {
    if (e === "NOT_FOUND") throw new FileNotFoundError(path);
    throw new Error(String(e));
  }
}

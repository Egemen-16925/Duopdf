import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { db } from "../db/db";
import { isAndroid } from "../platform";
import { createAndroidFile, pickAndroidFiles } from "../reader/files";
import { exportSnapshot, parseSyncFile } from "../sync/mergeImport";
import type { Snapshot } from "../sync/snapshot";
import { exportLearningData, parseBackup, summarize, type BackupFile, type BackupSummary } from "./backup";

const FILTERS = [{ name: "Duopdf yedeği (JSON)", extensions: ["json"] }];
const SYNC_FILTERS = [{ name: "Kelime listesi (JSON)", extensions: ["json"] }];

const today = () => new Date().toISOString().slice(0, 10);

/** Kaydedilecek JSON dosyasının yerini sorar: `path` yazılacak yer, `shown` kullanıcıya gösterilecek ad. */
async function chooseSavePath(defaultName: string, filters: typeof FILTERS): Promise<{ path: string; shown: string } | null> {
  if (isAndroid) {
    const file = await createAndroidFile(defaultName, "application/json");
    return file ? { path: file.path, shown: file.name } : null;
  }
  const path = await save({ defaultPath: defaultName, filters });
  return path ? { path, shown: path } : null;
}

/** Bir JSON dosyası seçtirip içeriğini döndürür; vazgeçerse null. */
async function pickJsonText(filters: typeof FILTERS): Promise<string | null> {
  const path = isAndroid
    ? (await pickAndroidFiles(["application/json", "text/plain", "application/octet-stream"], false))[0]?.path
    : await open({ multiple: false, directory: false, filters });
  if (typeof path !== "string") return null;
  return invoke<string>("read_backup", { path });
}

/** Yedeği kullanıcının seçtiği yere yazar; vazgeçerse null döner. */
export async function exportToFile(): Promise<{ path: string; summary: BackupSummary } | null> {
  const target = await chooseSavePath(`duopdf-yedek-${today()}.json`, FILTERS);
  if (!target) return null;
  const backup = await exportLearningData(db);
  await invoke("write_backup", { path: target.path, contents: JSON.stringify(backup, null, 1) });
  return { path: target.shown, summary: summarize(backup) };
}

/** Yedek dosyasını seçtirir ve okur (henüz içe aktarmaz). */
export async function readBackupFile(): Promise<BackupFile | null> {
  const text = await pickJsonText(FILTERS);
  return text === null ? null : parseBackup(text);
}

/** Kelimeleri eşitleme biçiminde (Firelingo'nun içe alabildiği) dosyaya yazar. */
export async function exportSyncFile(): Promise<{ path: string; terms: number } | null> {
  const target = await chooseSavePath(`duopdf-kelimeler-${today()}.json`, SYNC_FILTERS);
  if (!target) return null;
  const snapshot = await exportSnapshot(db);
  await invoke("write_backup", { path: target.path, contents: JSON.stringify(snapshot, null, 1) });
  return { path: target.shown, terms: snapshot.terms.length };
}

/** Eşitleme biçimindeki dosyayı (ör. Firelingo'nun dışa aktarması) seçtirir ve okur. */
export async function readSyncFile(): Promise<Snapshot | null> {
  const text = await pickJsonText(SYNC_FILTERS);
  return text === null ? null : parseSyncFile(text);
}

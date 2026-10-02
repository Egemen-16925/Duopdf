import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { db } from "../db/db";
import { exportLearningData, parseBackup, summarize, type BackupFile, type BackupSummary } from "./backup";

const FILTERS = [{ name: "Duopdf yedeği (JSON)", extensions: ["json"] }];

/** Yedeği kullanıcının seçtiği yere yazar; vazgeçerse null döner. */
export async function exportToFile(): Promise<{ path: string; summary: BackupSummary } | null> {
  const date = new Date().toISOString().slice(0, 10);
  const path = await save({ defaultPath: `duopdf-yedek-${date}.json`, filters: FILTERS });
  if (!path) return null;
  const backup = await exportLearningData(db);
  await invoke("write_backup", { path, contents: JSON.stringify(backup, null, 1) });
  return { path, summary: summarize(backup) };
}

/** Yedek dosyasını seçtirir ve okur (henüz içe aktarmaz). */
export async function readBackupFile(): Promise<BackupFile | null> {
  const path = await open({ multiple: false, directory: false, filters: FILTERS });
  if (typeof path !== "string") return null;
  return parseBackup(await invoke<string>("read_backup", { path }));
}

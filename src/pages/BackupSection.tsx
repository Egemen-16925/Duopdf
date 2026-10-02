import { useState } from "react";
import { db } from "../db/db";
import { clearLearningData, importLearningData, summarize } from "../learning/backup";
import { exportToFile, readBackupFile } from "../learning/backupFiles";
import { refreshTerms } from "../learning/store";

type Status = { kind: "ok" | "error" | "info"; text: string } | null;

const describe = (s: { documents: number; terms: number; occurrences: number }) =>
  `${s.terms} kelime, ${s.occurrences} geçiş, ${s.documents} belge`;

export function BackupSection() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus(null);
    try {
      await action();
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const doExport = () =>
    run(async () => {
      const result = await exportToFile();
      if (result) setStatus({ kind: "ok", text: `Yedeklendi (${describe(result.summary)}):\n${result.path}` });
    });

  const doImport = () =>
    run(async () => {
      const backup = await readBackupFile();
      if (!backup) return;
      const summary = summarize(backup);
      if (!confirm(`Yedekte ${describe(summary)} var. Şu anki öğrenme verin bununla DEĞİŞTİRİLECEK. Devam edilsin mi?`)) return;
      await importLearningData(db, backup);
      await refreshTerms();
      setStatus({ kind: "ok", text: `İçe aktarıldı: ${describe(summary)}. Açık belgeleri kapatıp yeniden açman gerekebilir.` });
    });

  const doClear = () =>
    run(async () => {
      if (!confirm("Tüm öğrenme verisi (kelimeler, geçişler, son açılanlar, çeviri önbelleği) silinsin mi?")) return;
      if (!confirm("Bu işlem geri alınamaz. Önce yedek aldığından emin misin? Silmek için Tamam'a bas.")) return;
      await clearLearningData(db);
      await refreshTerms();
      setStatus({ kind: "info", text: "Öğrenme verisi silindi. Sağlayıcı ayarların duruyor." });
    });

  return (
    <section className="profile-form backup-section">
      <h2>Yedek</h2>
      <p className="muted">
        Kelimelerin, geçtikleri cümleler, son açılan belgeler ve çeviri önbelleği tek bir JSON dosyasına yedeklenir. API
        anahtarın yedeğe girmez. Geliştirme sürümü (<code>tauri dev</code>) ile kurulu uygulama verilerini ayrı tutar; aralarında
        taşımak için de yedeği kullan.
      </p>
      <div className="actions">
        <button onClick={doExport} disabled={busy}>
          Dışa aktar
        </button>
        <button className="secondary" onClick={doImport} disabled={busy}>
          İçe aktar
        </button>
        <button className="danger" onClick={doClear} disabled={busy}>
          Öğrenme verisini sil
        </button>
      </div>
      {status && <p className={`msg ${status.kind}`}>{status.text}</p>}
    </section>
  );
}

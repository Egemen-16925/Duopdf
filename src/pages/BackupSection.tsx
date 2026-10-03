import { askConfirm } from "../ui/confirm";
import { useState } from "react";
import { db } from "../db/db";
import { clearLearningData, importLearningData, summarize, type BackupSummary } from "../learning/backup";
import { exportToFile, readBackupFile } from "../learning/backupFiles";
import { refreshTerms } from "../learning/store";
import { deleteCloudData, getSyncState } from "../sync/manager";

type Status = { kind: "ok" | "error" | "info"; text: string } | null;

const describe = (s: BackupSummary) =>
  `${s.terms} kelime, ${s.occurrences} geçiş, ${s.sentences} çeviri, ${s.strokes} çizim, ${s.quizAttempts} sınav cevabı, ${s.documents} belge`;

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
      const ok = await askConfirm({
        title: "Yedek içe aktarılsın mı?",
        message: `Yedekte ${describe(summary)} var. Şu anki öğrenme verin bununla DEĞİŞTİRİLECEK.`,
        confirmLabel: "İçe aktar",
      });
      if (!ok) return;
      await importLearningData(db, backup);
      await refreshTerms();
      setStatus({ kind: "ok", text: `İçe aktarıldı: ${describe(summary)}. Açık belgeleri kapatıp yeniden açman gerekebilir.` });
    });

  const doClear = () =>
    run(async () => {
      const ok = await askConfirm({
        title: "Tüm öğrenme verisi silinsin mi?",
        message:
          "Kelimeler, geçişler, çeviriler, çizimler, son açılanlar ve yapay zekâ önbelleği silinir. Bu işlem geri alınamaz; önce yedek aldığından emin ol.",
        confirmLabel: "Hepsini sil",
      });
      if (!ok) return;
      // Eşitleme açıkken buluttaki kopya silinmezse veriler bir sonraki eşitlemede geri gelir.
      const cloud =
        getSyncState().connected &&
        (await askConfirm({
          title: "Google Drive'daki kopya da silinsin mi?",
          message: "Silinmezse bir sonraki eşitlemede veriler buluttan geri gelir.",
          confirmLabel: "Buluttan da sil",
        }));
      if (cloud) await deleteCloudData();
      await clearLearningData(db);
      await refreshTerms();
      setStatus({
        kind: "info",
        text: cloud
          ? "Öğrenme verisi bu bilgisayardan ve buluttan silindi. Sağlayıcı ayarların duruyor."
          : "Öğrenme verisi silindi. Sağlayıcı ayarların duruyor.",
      });
    });

  return (
    <section className="profile-form backup-section">
      <h2>Yedek</h2>
      <p className="muted">
        Kelimelerin, geçtikleri cümleler, cümle çevirilerin, kalem çizimlerin, son açılan belgeler ve yapay zekâ önbelleği tek bir JSON dosyasına yedeklenir. API
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

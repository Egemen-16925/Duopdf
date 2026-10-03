import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { connect, deleteCloudData, disconnect, setAutoSync, setClient, syncNow, useSyncState } from "../sync/manager";
import { askConfirm } from "../ui/confirm";

const CONSOLE_URL = "https://console.cloud.google.com/auth/clients";

function when(time?: number): string {
  if (!time) return "henüz yok";
  return new Date(time).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Ayarlar → Eşitleme (Google Drive). */
export function SyncSection() {
  const sync = useSyncState();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);

  async function run(action: () => Promise<void>, done?: string) {
    setMessage(null);
    try {
      await action();
      if (done) setMessage({ kind: "ok", text: done });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  const showClientForm = !sync.configured || editing;

  return (
    <section className="profile-form sync-section">
      <h2>Eşitleme (Google Drive)</h2>
      <p className="muted">
        Öğrenme verin (kelimeler, çeviriler, çizimler, sınav sonuçları) Google Drive'ındaki gizli uygulama klasörüne
        eşitlenir; başka bir bilgisayarda aynı hesapla bağlanınca hepsi gelir. Belge dosyaları ve API anahtarları gönderilmez.
        Uygulama Drive'daki diğer dosyalarını göremez.
      </p>

      {showClientForm && (
        <div className="sync-client">
          <p className="muted">
            Bir kez, Google Cloud'da ücretsiz bir proje açıp "Masaüstü uygulaması" türünde bir OAuth istemcisi oluştur ve
            kimliğini buraya gir.{" "}
            <button className="link-btn" onClick={() => openUrl(CONSOLE_URL)}>
              Google Cloud Console'u aç
            </button>
          </p>
          <label>
            İstemci kimliği (Client ID)
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="….apps.googleusercontent.com" />
          </label>
          <label>
            Gizli anahtar (Client secret)
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" />
            <small>Bu bilgisayarda şifreli saklanır; yedeğe ve eşitlemeye girmez.</small>
          </label>
          <div className="row">
            <button
              onClick={() =>
                run(async () => {
                  await setClient(clientId, secret);
                  setSecret("");
                  setEditing(false);
                }, "İstemci kaydedildi. Şimdi \"Google ile bağlan\"a bas.")
              }
              disabled={!clientId.trim() || !secret.trim()}
            >
              Kaydet
            </button>
            {editing && (
              <button className="secondary" onClick={() => setEditing(false)}>
                Vazgeç
              </button>
            )}
          </div>
        </div>
      )}

      {sync.configured && !editing && (
        <>
          {sync.connected ? (
            <div className="sync-status">
              <div>
                Bağlı hesap: <strong>{sync.email ?? "Google hesabı"}</strong>
              </div>
              <div className="muted">
                Son eşitleme: {sync.busy === "syncing" ? "eşitleniyor…" : when(sync.lastSyncAt)}
              </div>
              <label className="check-row">
                <input type="checkbox" checked={sync.autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
                <span>
                  Otomatik eşitle
                  <small>Açılışta, kapanırken ve uygulama açıkken 5 dakikada bir.</small>
                </span>
              </label>
              <div className="row">
                <button onClick={() => run(syncNow, "Eşitlendi.")} disabled={sync.busy !== "idle"}>
                  {sync.busy === "syncing" ? "Eşitleniyor…" : "Şimdi eşitle"}
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      const ok = await askConfirm({
                        title: "Google bağlantısı kesilsin mi?",
                        message: "Bu bilgisayardaki ve buluttaki veriler silinmez; yalnızca eşitleme durur.",
                        confirmLabel: "Bağlantıyı kes",
                      });
                      if (ok) await disconnect();
                    })
                  }
                  disabled={sync.busy !== "idle"}
                >
                  Bağlantıyı kes
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    run(async () => {
                      const ok = await askConfirm({
                        title: "Buluttaki veri silinsin mi?",
                        message:
                          "Google Drive'daki eşitleme dosyası silinir. Bu bilgisayardaki veri kalır; bir sonraki eşitlemede buluta yeniden yüklenir. Bağlantıyı da kesmek istiyorsan önce bunu, sonra \"Bağlantıyı kes\"i kullan.",
                        confirmLabel: "Buluttan sil",
                      });
                      if (!ok) return;
                      await setAutoSync(false);
                      await deleteCloudData();
                      setMessage({ kind: "info", text: "Buluttaki veri silindi. Otomatik eşitleme kapatıldı; açarsan veri yeniden yüklenir." });
                    })
                  }
                  disabled={sync.busy !== "idle"}
                >
                  Buluttaki veriyi sil
                </button>
              </div>
            </div>
          ) : (
            <div className="row">
              <button onClick={() => run(connect, "Bağlandı ve eşitlendi.")} disabled={sync.busy !== "idle"}>
                {sync.busy === "signing-in" ? "Tarayıcıda izin bekleniyor…" : "Google ile bağlan"}
              </button>
              <button className="link-btn" onClick={() => setEditing(true)}>
                İstemci bilgilerini değiştir
              </button>
            </div>
          )}
        </>
      )}

      {sync.lastError && !message && <p className="msg error">{sync.lastError}</p>}
      {message && <p className={`msg ${message.kind}`}>{message.text}</p>}
    </section>
  );
}

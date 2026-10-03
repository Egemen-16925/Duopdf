import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getPrefs, setPrefs } from "../settings/prefs";

/**
 * Uygulama içi onay penceresi. Tauri penceresinde tarayıcının `confirm()` penceresi
 * gösterilmiyor (doğrudan "evet" sayılıyor), bu yüzden silme gibi işlemler bunu kullanır.
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Onay düğmesinin yazısı (varsayılan "Sil"). */
  confirmLabel?: string;
  /** Kırmızı (geri alınamaz) düğme; varsayılan açık. */
  danger?: boolean;
  /** Verilirse "Bir daha sorma" kutusu gösterilir; işaretlenirse bu anahtarla bir daha sorulmaz. */
  dontAskKey?: string;
}

interface Pending extends ConfirmOptions {
  resolve(ok: boolean): void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Kullanıcıya sorar; onaylarsa true döner. "Bir daha sorma" seçilmişse sormadan true döner. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (options.dontAskKey && getPrefs().skipConfirm[options.dontAskKey]) return Promise.resolve(true);
  // Açık bir soru varsa onu vazgeçilmiş say.
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { ...options, resolve };
    notify();
  });
}

function close(ok: boolean, dontAsk: boolean) {
  const current = pending;
  if (!current) return;
  if (ok && dontAsk && current.dontAskKey) {
    setPrefs({ skipConfirm: { ...getPrefs().skipConfirm, [current.dontAskKey]: true } });
  }
  pending = null;
  notify();
  current.resolve(ok);
}

/** Uygulamanın kökünde bir kez bulunur. */
export function ConfirmHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
  );
  const [dontAsk, setDontAsk] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!current) return;
    setDontAsk(false);
    // Yanlışlıkla Enter'a basınca silinmesin: odak "Vazgeç"te başlar.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(false, false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [current]);

  if (!current) return null;
  const danger = current.danger ?? true;
  return (
    <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false, false)}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title">{current.title}</h3>
        {current.message && <p className="confirm-message">{current.message}</p>}
        {current.dontAskKey && (
          <label className="confirm-dont-ask">
            <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
            Bir daha sorma
          </label>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} className="secondary" onClick={() => close(false, false)}>
            Vazgeç
          </button>
          <button className={danger ? "danger" : ""} onClick={() => close(true, dontAsk)}>
            {current.confirmLabel ?? "Sil"}
          </button>
        </div>
      </div>
    </div>
  );
}

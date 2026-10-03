import { setPrefs, usePrefs } from "../settings/prefs";

/** Bu cihaza özel tercihler (yedeğe ve eşitlemeye girmez). */
export function PrefsSection() {
  const prefs = usePrefs();
  const skipped = Object.values(prefs.skipConfirm).filter(Boolean).length;
  return (
    <section className="profile-form">
      <h2>Tercihler</h2>
      <label className="check-row">
        <input type="checkbox" checked={prefs.fingerDraw} onChange={(e) => setPrefs({ fingerDraw: e.target.checked })} />
        <span>
          Parmakla çizim
          <small>
            Kapalıyken (önerilen) yalnızca kalem çizer; parmak sayfayı kaydırır ve iki parmakla yakınlaştırır, kalemle yazarken
            avuç içi dokunuşları yok sayılır. Kalemi olmayan dokunmatik ekranlarda açın.
          </small>
        </span>
      </label>
      <div className="prefs-row">
        <span>
          Onay soruları
          <small>{skipped > 0 ? `${skipped} soru için "Bir daha sorma" seçili.` : "Silmeden önce her zaman sorulur."}</small>
        </span>
        <button className="secondary" disabled={skipped === 0} onClick={() => setPrefs({ skipConfirm: {} })}>
          Yeniden sor
        </button>
      </div>
    </section>
  );
}

import { setPrefs, usePrefs, type Theme } from "../settings/prefs";

const THEMES: { theme: Theme; label: string }[] = [
  { theme: "system", label: "Sistem (Windows ayarı)" },
  { theme: "light", label: "Açık" },
  { theme: "dark", label: "Koyu" },
];

/** Bu cihaza özel tercihler (yedeğe ve eşitlemeye girmez). */
export function PrefsSection() {
  const prefs = usePrefs();
  const skipped = Object.values(prefs.skipConfirm).filter(Boolean).length;
  return (
    <section className="profile-form">
      <h2>Tercihler</h2>
      <div className="prefs-row prefs-first">
        <span>
          Tema
          <small>Belge sayfaları her temada beyaz kalır.</small>
        </span>
        <select value={prefs.theme} onChange={(e) => setPrefs({ theme: e.target.value as Theme })} aria-label="Tema">
          {THEMES.map((t) => (
            <option key={t.theme} value={t.theme}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
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

import { setPrefs, usePrefs, type Theme } from "../settings/prefs";
import { toggleSpeak, useEnglishVoices, useSpeechAvailable } from "../speech/speech";
import { isAndroid } from "../platform";

const RATES: { rate: number; label: string }[] = [
  { rate: 0.7, label: "Yavaş" },
  { rate: 0.9, label: "Normal" },
  { rate: 1.1, label: "Hızlı" },
];

const THEMES: { theme: Theme; label: string }[] = [
  { theme: "system", label: isAndroid ? "Sistem" : "Sistem (Windows ayarı)" },
  { theme: "light", label: "Açık" },
  { theme: "dark", label: "Koyu" },
];

/** Bu cihaza özel tercihler (yedeğe ve eşitlemeye girmez). */
export function PrefsSection() {
  const prefs = usePrefs();
  const skipped = Object.values(prefs.skipConfirm).filter(Boolean).length;
  const voices = useEnglishVoices();
  const speechOk = useSpeechAvailable();
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
      <div className="prefs-row prefs-first">
        <span>
          Sesli okuma
          <small>
            {!speechOk
              ? isAndroid
                ? "Cihazda İngilizce ses bulunamadı. Android Ayarlar → Sistem → Diller → Metin okuma'dan İngilizce ses verisini yükleyebilirsin."
                : "Bu sistemde sesli okuma desteklenmiyor."
              : isAndroid
                ? "Android'in metin okuma motoru (İngilizce) kullanılır."
                : voices.length === 0
                ? "Yüklü İngilizce ses bulunamadı. Windows Ayarlar → Zaman ve dil → Konuşma'dan İngilizce ses ekleyebilirsin."
                : "Windows'taki İngilizce sesler kullanılır; internet gerekmez."}
          </small>
        </span>
        <span className="prefs-controls">
          <select value={prefs.speechVoice} onChange={(e) => setPrefs({ speechVoice: e.target.value })} aria-label="Ses" hidden={isAndroid}>
            <option value="">Varsayılan ses</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          <select value={prefs.speechRate} onChange={(e) => setPrefs({ speechRate: Number(e.target.value) })} aria-label="Okuma hızı">
            {RATES.map((r) => (
              <option key={r.rate} value={r.rate}>
                {r.label}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={() => toggleSpeak("Version control systems record changes to a file over time.")} disabled={!speechOk}>
            Dene
          </button>
        </span>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={prefs.fingerDraw} onChange={(e) => setPrefs({ fingerDraw: e.target.checked })} />
        <span>
          Parmakla çizim
          <small>
            Kalem kullanılmadıkça parmak her zaman çizer. Kapalıyken (önerilen) kalem algılandığında yalnızca kalem çizer;
            parmak sayfayı kaydırır ve iki parmakla yakınlaştırır, kalemle yazarken avuç içi dokunuşları yok sayılır.
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

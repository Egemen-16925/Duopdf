import { setPrefs, usePrefs } from "../settings/prefs";

/** Kalem tercihleri (bu cihaza özel; yedeğe ve eşitlemeye girmez). */
export function PenSection() {
  const prefs = usePrefs();
  return (
    <section className="profile-form">
      <h2>Kalem</h2>
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
    </section>
  );
}

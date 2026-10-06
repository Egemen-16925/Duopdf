import { getPrefs } from "../settings/prefs";

// Bu oturumda kalem algılandı mı? Kalem ekrana yaklaşınca (hover) ya da dokununca öğrenilir.
let penSeen = false;
const notePen = (e: PointerEvent) => {
  if (e.pointerType === "pen") penSeen = true;
};
window.addEventListener("pointerover", notePen, { capture: true, passive: true });
window.addEventListener("pointerdown", notePen, { capture: true, passive: true });

/**
 * Parmak dokunuşu çizsin mi? Kalem hiç kullanılmadıysa (ör. telefon) evet; kalem algılandıysa yalnızca
 * "Parmakla çizim" açıkken. Kalem varken parmak sayfayı kaydırır, avuç içi çizgi bırakmaz.
 */
export function fingerDraws(): boolean {
  return !penSeen || getPrefs().fingerDraw;
}

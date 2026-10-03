import { useEffect } from "react";

const GROUPS: { title: string; items: [keys: string[], what: string][] }[] = [
  {
    title: "Genel",
    items: [
      [["F1"], "Bu listeyi aç / kapat"],
      [["Alt", "1–5"], "Okuyucu, Kelimeler, Sınav, İstatistik, Ayarlar"],
      [["Ctrl", "O"], "Belge aç"],
      [["Ctrl", "W"], "Açık belge sekmesini kapat"],
      [["Ctrl", "Tab"], "Sonraki sekme (Shift ile önceki)"],
      [["Esc"], "Açık pencereyi kapat"],
    ],
  },
  {
    title: "Okurken",
    items: [
      [["Tıkla"], "Kelimenin anlamı"],
      [["Seç"], "Kısa seçim: kelime öbeği · uzun seçim: cümle çevirisi"],
      [["Alt", "Tıkla"], "Tıklanan cümlenin çevirisi"],
      [["Ctrl", "Tekerlek"], "Yakınlaştır / uzaklaştır (touchpad'de iki parmakla sıkıştır)"],
      [["Ctrl", "Z"], "Çizimi geri al"],
      [["Ctrl", "Y"], "Çizimi yinele"],
    ],
  },
  {
    title: "Sınavda",
    items: [
      [["1–4"], "Şık seç (A–D tuşları da olur)"],
      [["Enter"], "Yazılı cevabı gönder · sonraki soru"],
      [["Shift", "Enter"], "Yazılı cevapta yeni satır"],
    ],
  },
];

/** Klavye kısayolları listesi (F1). */
export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm-dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <h3 id="shortcuts-title">Klavye kısayolları</h3>
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h4>{group.title}</h4>
            <table>
              <tbody>
                {group.items.map(([keys, what]) => (
                  <tr key={what}>
                    <td>
                      {keys.map((k, i) => (
                        <span key={k}>
                          {i > 0 && " + "}
                          <kbd>{k}</kbd>
                        </span>
                      ))}
                    </td>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <div className="confirm-actions">
          <button onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import "./App.css";
import type { OccurrenceRecord } from "./db/db";
import { refreshTerms } from "./learning/store";
import { ModelTestPage } from "./pages/ModelTestPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WordsPage } from "./pages/WordsPage";
import { ReaderPage, type ReaderHandle } from "./reader/ReaderPage";
import { activeProfile, loadProviderSettings, saveProviderSettings, type ProviderSettings } from "./settings/providers";

type Page = "reader" | "words" | "settings" | "modelTest";

const NAV: { id: Page; label: string }[] = [
  { id: "reader", label: "Okuyucu" },
  { id: "words", label: "Kelimeler" },
  { id: "settings", label: "Ayarlar" },
  { id: "modelTest", label: "Model testi" },
];

function App() {
  const [page, setPage] = useState<Page>("reader");
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Profil kimliğine göre çekilmiş model listeleri (oturum boyunca saklanır).
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const readerRef = useRef<ReaderHandle>(null);

  useEffect(() => {
    loadProviderSettings()
      .then(setSettings)
      .catch((e) => setLoadError(String(e)));
    refreshTerms();
  }, []);

  function goToOccurrence(occurrence: OccurrenceRecord) {
    setPage("reader");
    readerRef.current?.openAt(occurrence);
  }

  async function updateSettings(next: ProviderSettings) {
    await saveProviderSettings(next);
    setSettings(next);
  }

  function setModelList(profileId: string, models: string[]) {
    setModelLists((prev) => ({ ...prev, [profileId]: models }));
  }

  return (
    <div className="app">
      <nav className="topbar">
        <span className="brand">Duopdf</span>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={page === item.id ? "nav-btn active" : "nav-btn"}
            onClick={() => setPage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="page-stack">
        {/* Okuyucu sayfa değişince kapanmasın ve kaydırma konumu kaybolmasın diye yerinde kalır, yalnızca görünmez olur. */}
        <div className={page === "reader" ? "page-layer" : "page-layer inactive"}>
          <ReaderPage ref={readerRef} profile={settings ? activeProfile(settings) : null} />
        </div>
        {page !== "reader" && (
          <main className="content page-layer">
            {loadError && <p className="msg error">Ayarlar yüklenemedi: {loadError}</p>}
            {page === "words" && <WordsPage onGoTo={goToOccurrence} />}
            {settings && page === "settings" && (
              <SettingsPage
                settings={settings}
                onChange={updateSettings}
                modelLists={modelLists}
                onModelList={setModelList}
              />
            )}
            {settings && page === "modelTest" && (
              <ModelTestPage
                settings={settings}
                onChange={updateSettings}
                modelLists={modelLists}
                onModelList={setModelList}
              />
            )}
          </main>
        )}
      </div>
    </div>
  );
}

export default App;

import { useEffect, useRef, useState } from "react";
import "./App.css";
import type { OccurrenceRecord } from "./db/db";
import { refreshTerms } from "./learning/store";
import { ModelTestPage } from "./pages/ModelTestPage";
import { QuizPage } from "./pages/QuizPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WordsPage } from "./pages/WordsPage";
import { ReaderPage, type ReaderHandle } from "./reader/ReaderPage";
import { ConfirmHost } from "./ui/confirm";
import { allTargets, loadProviderSettings, saveProviderSettings, type ProviderSettings } from "./settings/providers";

type Page = "reader" | "words" | "quiz" | "settings" | "modelTest";

const NAV: { id: Page; label: string }[] = [
  { id: "reader", label: "Okuyucu" },
  { id: "words", label: "Kelimeler" },
  { id: "quiz", label: "Sınav" },
  { id: "settings", label: "Ayarlar" },
  { id: "modelTest", label: "Model testi" },
];

const NO_AI = { fast: null, strong: null, vision: null };

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
          <ReaderPage ref={readerRef} ai={settings ? allTargets(settings) : NO_AI} />
        </div>
        {/* Sınav da sayfa değişince kaybolmasın. */}
        <main className={page === "quiz" ? "content page-layer" : "content page-layer inactive"}>
          <QuizPage
            target={settings ? allTargets(settings).strong : null}
            fast={settings ? allTargets(settings).fast : null}
            active={page === "quiz"}
          />
        </main>
        {page !== "reader" && page !== "quiz" && (
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
      <ConfirmHost />
    </div>
  );
}

export default App;

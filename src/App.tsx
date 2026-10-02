import { useEffect, useState } from "react";
import "./App.css";
import { ModelTestPage } from "./pages/ModelTestPage";
import { ReaderPage } from "./reader/ReaderPage";
import { SettingsPage } from "./pages/SettingsPage";
import { loadProviderSettings, saveProviderSettings, type ProviderSettings } from "./settings/providers";

type Page = "reader" | "settings" | "modelTest";

const NAV: { id: Page; label: string }[] = [
  { id: "reader", label: "Okuyucu" },
  { id: "settings", label: "Ayarlar" },
  { id: "modelTest", label: "Model testi" },
];

function App() {
  const [page, setPage] = useState<Page>("reader");
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Profil kimliğine göre çekilmiş model listeleri (oturum boyunca saklanır).
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});

  useEffect(() => {
    loadProviderSettings()
      .then(setSettings)
      .catch((e) => setLoadError(String(e)));
  }, []);

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
      {/* Okuyucu sekme değişince kapanmasın diye hep bağlı kalır, yalnızca gizlenir. */}
      <div className="reader-slot" hidden={page !== "reader"}>
        <ReaderPage />
      </div>
      <main className="content" hidden={page === "reader"}>
        {loadError && <p className="msg error">Ayarlar yüklenemedi: {loadError}</p>}
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
    </div>
  );
}

export default App;

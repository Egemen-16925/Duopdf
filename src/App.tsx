import { useEffect, useRef, useState } from "react";
import "./App.css";
import type { OccurrenceRecord } from "./db/db";
import { refreshTerms } from "./learning/store";
import { ModelTestPage } from "./pages/ModelTestPage";
import { QuizPage } from "./pages/QuizPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { WordsPage } from "./pages/WordsPage";
import { ReaderPage, type ReaderHandle } from "./reader/ReaderPage";
import { ErrorBoundary } from "./reader/ErrorBoundary";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";
import { Icon, type IconName } from "./ui/icons";
import { initSync, startAutoSync, syncBeforeClose } from "./sync/manager";
import { ConfirmHost } from "./ui/confirm";
import { ShortcutsDialog } from "./ui/ShortcutsDialog";
import { allTargets, loadProviderSettings, saveProviderSettings, type ProviderSettings } from "./settings/providers";

type Page = "reader" | "words" | "quiz" | "stats" | "settings" | "modelTest";

const NAV: { id: Page; label: string }[] = [
  { id: "reader", label: "Okuyucu" },
  { id: "words", label: "Kelimeler" },
  { id: "quiz", label: "Sınav" },
  { id: "stats", label: "İstatistik" },
  { id: "settings", label: "Ayarlar" },
  { id: "modelTest", label: "Model testi" },
];

/** Android'in alt gezinme çubuğu (model testi Ayarlar'ın içinden açılır). */
const MOBILE_NAV: { id: Page; label: string; icon: IconName }[] = [
  { id: "reader", label: "Okuyucu", icon: "reader" },
  { id: "words", label: "Kelimeler", icon: "words" },
  { id: "quiz", label: "Sınav", icon: "quiz" },
  { id: "stats", label: "İstatistik", icon: "stats" },
  { id: "settings", label: "Ayarlar", icon: "settings" },
];

const TITLES: Record<Page, string> = {
  reader: "Okuyucu",
  words: "Kelimeler",
  quiz: "Sınav",
  stats: "İstatistik",
  settings: "Ayarlar",
  modelTest: "Model testi",
};

const NO_AI = { fast: null, strong: null, vision: null };

function App() {
  const [page, setPage] = useState<Page>("reader");
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Profil kimliğine göre çekilmiş model listeleri (oturum boyunca saklanır).
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const readerRef = useRef<ReaderHandle>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Uygulama geneli klavye kısayolları (liste: F1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      if (e.key === "F1" || (e.ctrlKey && (e.key === "/" || e.key === "?"))) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.altKey && !e.ctrlKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        setPage(NAV[Number(e.key) - 1].id);
        return;
      }
      if (!e.ctrlKey || e.altKey) return;
      if (key === "o" && !e.shiftKey) {
        e.preventDefault();
        setPage("reader");
        readerRef.current?.openFile();
      } else if (key === "w" && pageRef.current === "reader") {
        e.preventDefault();
        readerRef.current?.closeActiveTab();
      } else if (e.key === "Tab" && pageRef.current === "reader") {
        e.preventDefault();
        readerRef.current?.cycleTab(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    loadProviderSettings()
      .then(setSettings)
      .catch((e) => setLoadError(String(e)));
    refreshTerms();
  }, []);

  // Google Drive eşitlemesi: açılışta, birkaç dakikada bir ve kapanırken.
  useEffect(() => {
    let stopAuto: (() => void) | undefined;
    let cancelled = false;
    initSync()
      .then(() => {
        if (!cancelled) stopAuto = startAutoSync();
      })
      .catch((e) => console.warn("Eşitleme ayarları yüklenemedi:", e));
    let unlisten: (() => void) | undefined;
    try {
      // Pencere, işleyici bittikten sonra kapanır (en çok birkaç saniye beklenir).
      getCurrentWindow()
        .onCloseRequested(() => syncBeforeClose())
        .then((u) => (cancelled ? u() : (unlisten = u)))
        .catch(() => undefined);
    } catch {
      // Tauri dışında (test ortamı) pencere yok.
    }
    return () => {
      cancelled = true;
      stopAuto?.();
      unlisten?.();
    };
  }, []);

  // Android geri tuşu: açık pencereyi kapat → belge listesine / okuyucuya dön → uygulamayı arka plana al.
  useEffect(() => {
    if (!isAndroid) return;
    const listener = onBackButtonPress(() => {
      if (document.querySelector(".confirm-dialog")) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return;
      }
      const current = pageRef.current;
      if (current === "modelTest") setPage("settings");
      else if (current !== "reader") setPage("reader");
      else if (!readerRef.current?.back()) invoke("move_to_background").catch(() => undefined);
    });
    return () => {
      listener.then((l) => l.unregister()).catch(() => undefined);
    };
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
    <div className={isAndroid ? "app app-android" : "app"}>
      {isAndroid && page !== "reader" && (
        <header className="appbar">
          {page === "modelTest" && (
            <button className="appbar-back" onClick={() => setPage("settings")} aria-label="Geri">
              <Icon name="back" />
            </button>
          )}
          <h1>{TITLES[page]}</h1>
        </header>
      )}
      <nav className="topbar" hidden={isAndroid}>
        <span className="brand">Duopdf</span>
        {NAV.map((item, i) => (
          <button
            key={item.id}
            className={page === item.id ? "nav-btn active" : "nav-btn"}
            onClick={() => setPage(item.id)}
            title={i < 5 ? `Alt+${i + 1}` : undefined}
          >
            {item.label}
          </button>
        ))}
        <button className="nav-btn nav-help" onClick={() => setShowShortcuts(true)} title="Klavye kısayolları (F1)" aria-label="Klavye kısayolları">
          ?
        </button>
      </nav>
      <div className="page-stack">
        {/* Okuyucu sayfa değişince kapanmasın ve kaydırma konumu kaybolmasın diye yerinde kalır, yalnızca görünmez olur. */}
        <div className={page === "reader" ? "page-layer" : "page-layer inactive"}>
          <ReaderPage ref={readerRef} ai={settings ? allTargets(settings) : NO_AI} />
        </div>
        {/* Sınav da sayfa değişince kaybolmasın. */}
        <main className={page === "quiz" ? "content page-layer" : "content page-layer inactive"}>
          <ErrorBoundary label="Sınav sayfası gösterilemedi">
            <QuizPage
              target={settings ? allTargets(settings).strong : null}
              fast={settings ? allTargets(settings).fast : null}
              active={page === "quiz"}
            />
          </ErrorBoundary>
        </main>
        {page !== "reader" && page !== "quiz" && (
          <main className="content page-layer">
            {/* Bir sayfa çökerse uygulamanın geri kalanı (alt çubuk, okuyucu) çalışmaya devam etsin. */}
            <ErrorBoundary key={page} label="Sayfa gösterilemedi">
              {loadError && <p className="msg error">Ayarlar yüklenemedi: {loadError}</p>}
              {page === "words" && <WordsPage onGoTo={goToOccurrence} onGoReader={() => setPage("reader")} />}
              {page === "stats" && <StatsPage active onGo={setPage} />}
              {settings && page === "settings" && (
                <SettingsPage
                  settings={settings}
                  onChange={updateSettings}
                  modelLists={modelLists}
                  onModelList={setModelList}
                  onOpenModelTest={isAndroid ? () => setPage("modelTest") : undefined}
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
            </ErrorBoundary>
          </main>
        )}
      </div>
      {isAndroid && (
        <nav className="bottom-nav">
          {MOBILE_NAV.map((item) => {
            const active = page === item.id || (item.id === "settings" && page === "modelTest");
            return (
              <button
                key={item.id}
                className={active ? "bnav-item active" : "bnav-item"}
                onClick={() => setPage(item.id)}
                aria-current={active ? "page" : undefined}
              >
                <span className="bnav-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="bnav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
      <ConfirmHost />
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

export default App;

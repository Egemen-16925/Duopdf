import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, getPrefs } from "./settings/prefs";

// Seçili tema ilk çizimden önce uygulanır (açılışta yanıp sönmesin).
applyTheme(getPrefs().theme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

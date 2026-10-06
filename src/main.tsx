import "./zodConfig";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, getPrefs } from "./settings/prefs";
import { isAndroid } from "./platform";
import { installTouchSelection } from "./learning/touchSelection";

// Seçili tema ilk çizimden önce uygulanır (açılışta yanıp sönmesin).
applyTheme(getPrefs().theme);
if (isAndroid) {
  document.documentElement.classList.add("android");
  installTouchSelection();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import { cpSync, readdirSync, rmSync } from "node:fs";
import process from "node:process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
const host = process.env.TAURI_DEV_HOST;

// pdf.js'in yazı tipi, CMap ve wasm dosyalarını public/pdfjs altına kopyalar (git'e girmez).
function copyPdfjsAssets(): Plugin {
  return {
    name: "copy-pdfjs-assets",
    buildStart() {
      for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
        cpSync(`node_modules/pdfjs-dist/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
      }
    },
  };
}

// public/__harness (yalnızca bu bilgisayardaki test ortamının örnek belgeleri, git'e girmez) Vite tarafından
// dist'e kopyalanır; kurulum dosyasına girmesin diye derlemeden sonra silinir.
function dropHarnessFiles(): Plugin {
  return {
    name: "drop-harness-files",
    apply: "build",
    closeBundle() {
      rmSync("dist/__harness", { recursive: true, force: true });
    },
  };
}

// Tesseract.js (OCR) çalışma dosyası, çekirdek wasm ve İngilizce verisini public/tesseract altına kopyalar.
// İnternetsiz çalışması için hiçbir şey CDN'den indirilmez.
function copyTesseractAssets(): Plugin {
  return {
    name: "copy-tesseract-assets",
    buildStart() {
      cpSync("node_modules/tesseract.js/dist/worker.min.js", "public/tesseract/worker.min.js");
      for (const file of readdirSync("node_modules/tesseract.js-core")) {
        // Çalışma dosyası yalnızca gömülü wasm içeren ".wasm.js" sürümlerini yükler (LSTM, SIMD'li/SIMD'siz).
        if (/^tesseract-core.*lstm\.wasm\.js$/.test(file)) {
          cpSync(`node_modules/tesseract.js-core/${file}`, `public/tesseract/core/${file}`);
        }
      }
      cpSync(
        "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
        "public/tesseract/lang/eng.traineddata.gz",
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), copyPdfjsAssets(), copyTesseractAssets(), dropHarnessFiles()],
  // Masaüstü uygulaması dosyaları diskten yükler; pdf.js yüzünden büyüyen paket sorun değil.
  // Eski Android WebView sürümleri yeni sözdizimini (static blok, özel alan) çözemiyor.
  build: { chunkSizeWarningLimit: 2000, target: ["chrome87", "edge88", "safari14"] },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

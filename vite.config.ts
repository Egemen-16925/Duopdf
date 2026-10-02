import { cpSync } from "node:fs";
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

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), copyPdfjsAssets()],
  // Masaüstü uygulaması dosyaları diskten yükler; pdf.js yüzünden büyüyen paket sorun değil.
  build: { chunkSizeWarningLimit: 2000 },

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

// `npm run tauri dev` geliştirme sürümünü ayrı bir uygulama kimliğiyle (com.egemen.duopdf.dev) açar:
// ayarları (API anahtarları, eşitleme) ve öğrenme verisi kurulu uygulamanınkinden ayrı durur.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args[0] === "dev" && !args.includes("--config") && !args.includes("-c")) {
  args.push("--config", "src-tauri/tauri.dev.conf.json");
}
const result = spawnSync("tauri", args, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);

import { z } from "zod";

// Uygulamanın CSP'si `eval`e izin vermiyor; zod hızlandırma için `new Function` denemesin
// (yakalanan deneme bile CSP ihlali olarak raporlanıyor). Diğer modüllerden önce yüklenmeli.
z.config({ jitless: true });

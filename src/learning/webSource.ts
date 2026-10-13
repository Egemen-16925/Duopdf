/** Web geçişinin (Firelingo'da işaretlenen kelime) kaynağı. */
export interface WebSource {
  /** Listede gösterilecek ad: sayfa başlığı ve site adı. */
  label: string;
  /** Tarayıcıda açılabilecek adres; adres http(s) değilse yoktur. */
  href?: string;
}

/** Eşitlemeyle gelen adres güvenilmez veridir: yalnızca http ve https adresleri açılır. */
export function webSource(url: string, title?: string): WebSource {
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    // Geçersiz adres: yalnızca metin olarak gösterilir.
  }
  const safe = parsed && (parsed.protocol === "https:" || parsed.protocol === "http:") ? parsed : undefined;
  const site = safe?.hostname.replace(/^www\./, "");
  const label = [title?.trim(), site].filter(Boolean).join(" · ") || "web sayfası";
  return safe ? { label, href: safe.href } : { label };
}

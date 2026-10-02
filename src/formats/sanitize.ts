import DOMPurify from "dompurify";

/**
 * Belgeden gelen HTML'i güvenli hâle getirir: script, stil, form, gömülü içerik ve
 * satır içi stiller atılır (uygulamanın teması geçerli olsun diye).
 * `data-res` taşıyan resimlere temizlikten sonra `resources` içindeki adres verilir;
 * DOMPurify blob: adreslerine izin vermediği için bu iki adımda yapılır.
 */
export function sanitizeHtml(html: string, resources?: Map<string, string>): string {
  // Desteklenmeyen ortamda DOMPurify içeriği temizlemeden döndürebilir; göstermektense hata ver.
  if (!DOMPurify.isSupported) throw new Error("Belge içeriği güvenli hâle getirilemedi.");
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ["style", "link", "form", "input", "button", "textarea", "select", "iframe", "object", "embed", "video", "audio"],
    FORBID_ATTR: ["style", "srcset"],
  });
  for (const el of fragment.querySelectorAll("[data-res]")) {
    const url = resources?.get(el.getAttribute("data-res") ?? "");
    el.removeAttribute("data-res");
    if (!url) {
      el.remove();
    } else if (el.tagName.toLowerCase() === "img") {
      el.setAttribute("src", url);
    } else {
      el.setAttribute("href", url);
    }
  }
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
}

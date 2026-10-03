import { db } from "../db/db";
import { imageKey, ocrWithCache } from "./cache";
import { prepareImage, recognizeImage } from "./engine";
import { ocrParagraphTexts, type OcrResult } from "./result";

/** Bundan küçük görseller (simge, süs) taranmaz. Piksel². */
const MIN_PIXELS = 150 * 60;

async function ocrImageSource(src: string): Promise<{ paragraphs: string[]; small: boolean }> {
  const blob = await (await fetch(src)).blob();
  const key = await imageKey(blob);
  const result: OcrResult = await ocrWithCache(db, key, async () => {
    const canvas = await prepareImage(blob);
    if (canvas.width * canvas.height < MIN_PIXELS) return { width: canvas.width, height: canvas.height, paragraphs: [] };
    return recognizeImage(canvas);
  });
  return { paragraphs: ocrParagraphTexts(result), small: result.width * result.height < MIN_PIXELS };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), { className, textContent: text });
}

/**
 * Akan metin görünümünde resimleri gösterme; yerlerine içlerindeki yazıyı koy.
 * Resimler görünür alana yaklaştıkça taranır. Küçük süs görselleri kaldırılır.
 * `onTextAdded`, yeni metin eklenen bölüm için çağrılır (vurguları yenilemek için);
 * `onAiRead` verilirse her görselin yanına "Yapay zekâ ile oku" düğmesi konur.
 */
export function replaceImagesWithText(
  sections: HTMLElement[],
  scrollRoot: HTMLElement,
  onTextAdded: (section: HTMLElement) => void,
  onAiRead?: (src: string, section: HTMLElement) => void,
): () => void {
  const caption = (holder: HTMLElement, text: string) => {
    const line = el("span", "ocr-caption", text);
    // Arayüz yazısı: kelime seçmeye, vurgulamaya ve çeviriye girmez.
    line.dataset.noText = "";
    const section = holder.closest<HTMLElement>(".reflow-section");
    if (onAiRead && section) {
      const button = el("button", "link-btn ocr-ai", "Yapay zekâ ile oku");
      button.addEventListener("click", () => onAiRead(holder.dataset.src!, section));
      line.append(" · ", button);
    }
    return line;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const holder = entry.target as HTMLElement;
        observer.unobserve(holder);
        ocrImageSource(holder.dataset.src!)
          .then(({ paragraphs, small }) => {
            holder.classList.remove("pending");
            if (paragraphs.length === 0) {
              if (small) holder.remove();
              else holder.replaceChildren(caption(holder, "Görselde okunabilir yazı bulunamadı"));
              return;
            }
            holder.replaceChildren(caption(holder, "Görseldeki yazı"), ...paragraphs.map((text) => el("p", "", text)));
            const section = holder.closest<HTMLElement>(".reflow-section");
            if (section) onTextAdded(section);
          })
          .catch(() => {
            holder.classList.remove("pending");
            holder.replaceChildren(caption(holder, "Görsel okunamadı"));
          });
      }
    },
    { root: scrollRoot, rootMargin: "600px 0px" },
  );

  for (const section of sections) {
    for (const img of Array.from(section.querySelectorAll("img"))) {
      const src = img.getAttribute("src");
      if (!src) {
        img.remove();
        continue;
      }
      const holder = el("div", "ocr-text pending", "Görseldeki yazı okunuyor…");
      holder.dataset.src = src;
      img.replaceWith(holder);
    }
    // Önceki bir çalıştırmadan kalan (henüz okunmamış) yer tutucular da izlenir.
    section.querySelectorAll(".ocr-text.pending").forEach((holder) => observer.observe(holder));
  }
  return () => observer.disconnect();
}

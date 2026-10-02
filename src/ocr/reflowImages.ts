import { db } from "../db/db";
import { imageKey, ocrWithCache } from "./cache";
import { prepareImage, recognizeImage } from "./engine";
import { ocrParagraphTexts, type OcrResult } from "./result";

/** Bundan küçük görseller (simge, süs) taranmaz. Piksel². */
const MIN_PIXELS = 150 * 60;

const EMPTY: OcrResult = { width: 0, height: 0, paragraphs: [] };

async function ocrImageSource(src: string): Promise<string[]> {
  const blob = await (await fetch(src)).blob();
  const key = await imageKey(blob);
  const result = await ocrWithCache(db, key, async () => {
    const canvas = await prepareImage(blob);
    if (canvas.width * canvas.height < MIN_PIXELS) return { ...EMPTY, width: canvas.width, height: canvas.height };
    return recognizeImage(canvas);
  });
  return ocrParagraphTexts(result);
}

/**
 * Akan metin görünümünde resimleri gösterme; yerlerine içlerindeki yazıyı koy.
 * Resimler görünür alana yaklaştıkça taranır. Yazı çıkmazsa resim tamamen kaldırılır.
 * `onTextAdded`, yeni metin eklenen bölüm için çağrılır (vurguları yenilemek için).
 */
export function replaceImagesWithText(
  sections: HTMLElement[],
  scrollRoot: HTMLElement,
  onTextAdded: (section: HTMLElement) => void,
): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const holder = entry.target as HTMLElement;
        observer.unobserve(holder);
        const src = holder.dataset.src!;
        ocrImageSource(src)
          .then((paragraphs) => {
            if (paragraphs.length === 0) {
              holder.remove();
              return;
            }
            holder.replaceChildren(
              Object.assign(document.createElement("span"), { className: "ocr-caption", textContent: "Görseldeki yazı" }),
              ...paragraphs.map((text) => Object.assign(document.createElement("p"), { textContent: text })),
            );
            holder.classList.remove("pending");
            const section = holder.closest<HTMLElement>(".reflow-section");
            if (section) onTextAdded(section);
          })
          .catch(() => {
            holder.replaceChildren(
              Object.assign(document.createElement("span"), { className: "ocr-caption", textContent: "Görsel okunamadı" }),
            );
            holder.classList.remove("pending");
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
      const holder = document.createElement("div");
      holder.className = "ocr-text pending";
      holder.dataset.src = src;
      holder.textContent = "Görseldeki yazı okunuyor…";
      img.replaceWith(holder);
    }
    // Önceki bir çalıştırmadan kalan (henüz okunmamış) yer tutucular da izlenir.
    section.querySelectorAll(".ocr-text.pending").forEach((holder) => observer.observe(holder));
  }
  return () => observer.disconnect();
}

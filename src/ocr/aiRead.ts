import type { PDFDocumentProxy } from "pdfjs-dist";

/** Görsel modele gönderilecek en büyük kenar (piksel); büyük resimler hem yavaş hem pahalıdır. */
const AI_MAX_SIDE = 1600;

async function canvasToDataUrl(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Resim dosyasını/blob'u modele gönderilecek küçültülmüş JPEG veri adresine çevirir. */
export async function imageBlobToDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, AI_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToDataUrl(canvas);
}

export async function imageSourceToBlob(src: string): Promise<Blob> {
  return (await fetch(src)).blob();
}

/** PDF sayfasını modele gönderilecek JPEG veri adresine çevirir. */
export async function pdfPageToDataUrl(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: AI_MAX_SIDE / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Sayfa resme çevrilemedi."))), "image/jpeg", 0.85),
  );
  canvas.width = canvas.height = 0;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

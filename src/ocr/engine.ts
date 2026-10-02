import Tesseract from "tesseract.js";
import { fromTesseract, type OcrResult, type TesseractPage } from "./result";

/**
 * Yerel OCR (Tesseract.js, WASM). Dosyalar public/tesseract altından yüklenir; internet gerekmez.
 * Tek işçi vardır ve işler sırayla yapılır (aynı anda birden çok tarama tableti yorar).
 */
let workerPromise: Promise<Tesseract.Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getWorker(): Promise<Tesseract.Worker> {
  workerPromise ??= Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    langPath: "/tesseract/lang",
    gzip: true,
    cacheMethod: "none",
    workerBlobURL: false,
  }).catch((e) => {
    workerPromise = null;
    throw new Error(`OCR başlatılamadı: ${e instanceof Error ? e.message : String(e)}`);
  });
  return workerPromise;
}

export type OcrImage = Blob | HTMLCanvasElement | OffscreenCanvas;

async function sizeOf(image: OcrImage): Promise<{ width: number; height: number }> {
  if (image instanceof Blob) {
    const bitmap = await createImageBitmap(image);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  return { width: image.width, height: image.height };
}

/** Görseldeki yazıyı okur. İşler sıraya girer; biri hata verse de sıradakiler çalışır. */
export function recognizeImage(image: OcrImage): Promise<OcrResult> {
  const job = queue.then(async () => {
    const { width, height } = await sizeOf(image);
    const worker = await getWorker();
    const { data } = await worker.recognize(image as Tesseract.ImageLike, {}, { blocks: true, text: false });
    return fromTesseract(data as unknown as TesseractPage, width, height);
  });
  queue = job.catch(() => undefined);
  return job;
}

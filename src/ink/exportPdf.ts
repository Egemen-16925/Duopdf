import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { isAndroid } from "../platform";
import { createAndroidFile } from "../reader/files";
import { LineCapStyle, PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { StrokeRecord } from "../db/db";
import { toPoints } from "./geometry";
import { weightFactor } from "./render";

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Ekrandaki sayfada oransal nokta (u: soldan, v: üstten; döndürülmüş görünüme göre) → PDF koordinatı.
 * pdf.js sayfayı kırpma kutusuna (CropBox) ve sayfanın döndürme açısına göre gösterir.
 */
export function toPdfPoint(u: number, v: number, box: PageBox, rotation: number): { x: number; y: number } {
  // Döndürülmemiş sayfada soldan (a) ve üstten (b) oran.
  let a = u;
  let b = v;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      a = v;
      b = 1 - u;
      break;
    case 180:
      a = 1 - u;
      b = 1 - v;
      break;
    case 270:
      a = 1 - v;
      b = u;
      break;
  }
  return { x: box.x + a * box.width, y: box.y + (1 - b) * box.height };
}

function parseColor(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return rgb(0, 0, 0);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

/** Çizgileri sayfanın mevcut içeriğinin üstüne işler (ekrandaki çizimle aynı kalınlıklarla). */
function drawStrokes(page: PDFPage, strokes: StrokeRecord[]) {
  if (strokes.length === 0) return;
  // Sayfanın kendi içeriği grafik durumunu değiştirip bırakmış olabilir; çizimlerimiz etkilenmesin.
  page.translateContent(0, 0);
  const box = page.getCropBox();
  const rotation = page.getRotation().angle;
  const displayWidth = rotation % 180 === 0 ? box.width : box.height;
  for (const stroke of strokes) {
    const color = parseColor(stroke.color);
    const base = stroke.width * displayWidth;
    const points = toPoints(stroke.points).map(([u, v, w]) => ({ ...toPdfPoint(u, v, box, rotation), w }));
    if (points.length === 1) {
      const p = points[0];
      page.drawCircle({ x: p.x, y: p.y, size: (base * weightFactor(p.w)) / 2, color });
      continue;
    }
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      page.drawLine({
        start: { x: p0.x, y: p0.y },
        end: { x: p1.x, y: p1.y },
        thickness: Math.max(0.25, base * weightFactor((p0.w + p1.w) / 2)),
        color,
        lineCap: LineCapStyle.Round, // parçalar kesintisiz birleşir
      });
    }
  }
}

function byPage(strokes: StrokeRecord[]): Map<number, StrokeRecord[]> {
  const map = new Map<number, StrokeRecord[]>();
  for (const s of strokes) map.set(s.page, [...(map.get(s.page) ?? []), s]);
  return map;
}

/** Belgenin PDF'inin bir kopyasına çizimleri işler. Asıl dosyaya dokunulmaz. */
export async function inkedPdfFromPdf(source: Uint8Array, strokes: StrokeRecord[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const [pageNumber, list] of byPage(strokes)) {
    const page = pages[pageNumber - 1];
    if (page) drawStrokes(page, list);
  }
  return doc.save();
}

async function toPng(blob: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("Resim PDF'e dönüştürülemedi.");
  return new Uint8Array(await png.arrayBuffer());
}

/** Resmi tek sayfalık bir PDF'e koyup çizimleri üstüne işler. */
export async function inkedPdfFromImage(image: Blob, width: number, height: number, strokes: StrokeRecord[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const embedded =
    image.type === "image/jpeg"
      ? await doc.embedJpg(new Uint8Array(await image.arrayBuffer()))
      : await doc.embedPng(image.type === "image/png" ? new Uint8Array(await image.arrayBuffer()) : await toPng(image));
  const page = doc.addPage([width, height]);
  page.drawImage(embedded, { x: 0, y: 0, width, height });
  drawStrokes(
    page,
    strokes.filter((s) => s.page === 1),
  );
  return doc.save();
}

/** Kaydetme penceresini açar ve PDF'i yazar; vazgeçilirse null döner. */
export async function saveInkedPdf(docName: string, bytes: Uint8Array): Promise<string | null> {
  const base = docName.replace(/\.[^.]+$/, "");
  const defaultName = `${base} (notlu).pdf`;
  const target = isAndroid
    ? await createAndroidFile(defaultName, "application/pdf")
    : await save({ defaultPath: defaultName, filters: [{ name: "PDF", extensions: ["pdf"] }] }).then((p) => (p ? { path: p, name: p } : null));
  if (!target) return null;
  // Bayt dizisi JSON'a çevrilmeden gider; yol başlıkta (ASCII olmayan harfler için kodlanmış).
  await invoke("write_pdf", bytes, { headers: { path: encodeURIComponent(target.path) } });
  return target.name;
}

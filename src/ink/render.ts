import { toPoints } from "./geometry";

export interface Drawable {
  color: string;
  width: number;
  points: number[];
}

/** Ağırlık (0-1) → kalınlık çarpanı. Fare/parmak 0.5 kaydedilir (çarpan 1). */
export function weightFactor(weight: number): number {
  return 0.35 + 1.3 * weight;
}

/**
 * Çizgiyi tuvale çizer. `w`/`h`: tuvalin CSS piksel boyutu (bağlam dpr ile ölçeklenmiş olmalı).
 * Her parça kendi basıncına göre kalınlıkta çizilir; yuvarlak uçlar parçaları birleştirir.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Drawable, w: number, h: number) {
  const points = toPoints(stroke.points);
  if (points.length === 0) return;
  const base = stroke.width * w;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (points.length === 1) {
    const [x, y, p] = points[0];
    ctx.beginPath();
    ctx.arc(x * w, y * h, (base * weightFactor(p)) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < points.length; i++) {
    const [x0, y0, p0] = points[i - 1];
    const [x1, y1, p1] = points[i];
    ctx.lineWidth = Math.max(0.5, base * weightFactor((p0 + p1) / 2));
    ctx.beginPath();
    ctx.moveTo(x0 * w, y0 * h);
    ctx.lineTo(x1 * w, y1 * h);
    ctx.stroke();
  }
}

/** Tuvali CSS boyutuna ve ekran yoğunluğuna göre ayarlar; çizim bağlamını döndürür. */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return null;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

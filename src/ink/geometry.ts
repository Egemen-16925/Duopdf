/** Kalem çizgileri için saf geometri (DOM'suz, test edilebilir). */

export type Point = [x: number, y: number, pressure: number];

export function toPoints(flat: number[]): Point[] {
  const points: Point[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) points.push([flat[i], flat[i + 1], flat[i + 2]]);
  return points;
}

export function flatten(points: Point[]): number[] {
  return points.flatMap(([x, y, p]) => [round(x), round(y), Math.round(p * 100) / 100]);
}

function round(v: number): number {
  return Math.round(v * 100000) / 100000;
}

/**
 * Noktaya kaydedilecek ağırlık (0-1). Kalemde gerçek basınç; fare ve parmak basınç bildirmez
 * (0 ya da 0.5 gelir), onlar için orta değer. Çizerken kalınlık çarpanına çevrilir (render.ts).
 */
export function pointerWeight(pressure: number, pointerType: string): number {
  if (pointerType !== "pen") return 0.5;
  return Math.min(Math.max(pressure, 0), 1);
}

/**
 * Birbirine çok yakın noktaları atar (sayfa genişliğine oranla `minStep`); son nokta korunur.
 * `aspect` = sayfa yüksekliği / genişliği (oranları gerçek uzaklığa çevirmek için).
 */
export function simplify(points: Point[], aspect: number, minStep = 0.0015): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [lx, ly] = out[out.length - 1];
    if (Math.hypot(x - lx, (y - ly) * aspect) >= minStep) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Noktanın doğru parçasına uzaklığı (sayfa genişliği biriminde). */
function distanceToSegment(px: number, py: number, a: Point, b: Point, aspect: number): number {
  const ax = a[0];
  const ay = a[1] * aspect;
  const bx = b[0];
  const by = b[1] * aspect;
  const qy = py * aspect;
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (qy - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), qy - (ay + t * dy));
}

/** Silgi: (x, y) çevresindeki `radius` içinde çizginin bir parçası var mı? */
export function strokeHits(flat: number[], width: number, x: number, y: number, radius: number, aspect: number): boolean {
  const points = toPoints(flat);
  const reach = radius + width / 2;
  if (points.length === 1) return distanceToSegment(x, y, points[0], points[0], aspect) <= reach;
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(x, y, points[i - 1], points[i], aspect) <= reach) return true;
  }
  return false;
}

/** Uygulama Android'de mi çalışıyor (dosya seçme, eşitleme ve düzen buna göre değişir). */
export const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

/** Android'de belgeler dosya yolu yerine sistem seçicisinin verdiği `content://` adresiyle tutulur. */
export function isContentUri(path: string): boolean {
  return path.startsWith("content://");
}

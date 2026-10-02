import type { DuopdfDB } from "../db/db";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Önbellek anahtarı: işlem + istem sürümü + girdi özeti. Sağlayıcı veya model adı
 * içermez; model değişince eski sonuçlar geçerli kalır, kötü sonuç "yeniden sor" ile yenilenir.
 */
export async function cacheKey(op: { id: string; version: number }, input: unknown): Promise<string> {
  return `${op.id}@${op.version}:${await sha256(JSON.stringify(input))}`;
}

export async function cached<T>(
  db: DuopdfDB,
  op: { id: string; version: number },
  input: unknown,
  compute: () => Promise<T>,
  opts: { force?: boolean; now?: number } = {},
): Promise<{ value: T; fromCache: boolean }> {
  const key = await cacheKey(op, input);
  if (!opts.force) {
    const hit = await db.cache.get(key);
    if (hit) return { value: hit.value as T, fromCache: true };
  }
  const value = await compute();
  await db.cache.put({ key, value, createdAt: opts.now ?? Date.now() });
  return { value, fromCache: false };
}

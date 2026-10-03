import type { z } from "zod";

/** OpenAI uyumlu çok parçalı içerik (görsel destekli modeller için). */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

/**
 * Sürümlü istem şablonu. `id@version` önbellek anahtarına girer;
 * istem değişince sürümü artır ki eski önbellek kullanılmasın.
 */
export interface PromptTemplate<Input, Output> {
  id: string;
  version: number;
  role: "fast" | "strong";
  schema: z.ZodType<Output>;
  /** Çeşitlilik gereken istemlerde daha yüksek (varsayılan 0.2). */
  temperature?: number;
  /** Uzun JSON ya da düşünme çıktısı veren modeller için (varsayılan 1024). */
  maxTokens?: number;
  build(input: Input): ChatMessage[];
}

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
  build(input: Input): ChatMessage[];
}

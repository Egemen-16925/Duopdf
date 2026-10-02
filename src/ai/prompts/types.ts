import type { z } from "zod";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

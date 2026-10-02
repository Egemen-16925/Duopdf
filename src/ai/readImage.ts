import type { ProviderProfile } from "../settings/providers";
import { chat } from "./aiClient";
import { AiError } from "./errors";
import type { ChatMessage } from "./prompts/types";

/** Görselden yazı okuma istemi. Değişirse sürümü artır (önbellek anahtarına girer). */
export const readImagePrompt = { id: "readImage", version: 1 };

export function readImageMessages(imageDataUrl: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You transcribe text from images. Return only the text that appears in the image, in natural reading order, " +
        "one line per line of text or label. Do not translate, explain or add anything. If there is no text, return an empty answer.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Transcribe all text in this image." },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ];
}

/** Görseli görsel destekli modele okutur; düz metin döner. */
export async function readImageWithAi(profile: ProviderProfile, imageDataUrl: string): Promise<string> {
  const model = profile.visionModel?.trim();
  if (!model) throw new AiError("config", "Ayarlarda görsel model seçilmemiş.");
  const result = await chat(profile, {
    model,
    messages: readImageMessages(imageDataUrl),
    maxTokens: 2048,
    temperature: 0,
    timeoutMs: 120_000,
  });
  return result.text.trim();
}

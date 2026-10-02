import { sentenceTranslationSchema, type SentenceTranslation } from "../schemas";
import type { PromptTemplate } from "./types";

export interface TranslateSentenceInput {
  sentence: string;
}

export const translateSentencePrompt: PromptTemplate<TranslateSentenceInput, SentenceTranslation> = {
  id: "translateSentence",
  version: 1,
  role: "fast",
  schema: sentenceTranslationSchema,
  build: ({ sentence }) => [
    {
      role: "system",
      content: [
        "Sen İngilizce teknik metinleri Türkçeye çeviren bir çevirmensin.",
        "Çeviri doğal ve akıcı bir Türkçe olsun; yerleşik teknik terimleri (ör. commit, framework) gerekirse İngilizce bırak.",
        "Ayrıca cümledeki en dikkat çekici dilbilgisi yapısını tek kısa Türkçe cümleyle açıkla.",
        "Yalnızca şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
        '{"ceviri": "Türkçe çeviri", "dilbilgisiNotu": "kısa dilbilgisi notu"}',
      ].join("\n"),
    },
    { role: "user", content: sentence },
  ],
};

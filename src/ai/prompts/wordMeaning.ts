import { wordMeaningSchema, type WordMeaning } from "../schemas";
import type { PromptTemplate } from "./types";

export interface WordMeaningInput {
  word: string;
  sentence: string;
}

export const wordMeaningPrompt: PromptTemplate<WordMeaningInput, WordMeaning> = {
  id: "wordMeaning",
  version: 1,
  role: "fast",
  schema: wordMeaningSchema,
  build: ({ word, sentence }) => [
    {
      role: "system",
      content: [
        "Sen İngilizce öğrenen Türk bir üniversite öğrencisine yardım eden bir sözlüksün.",
        "Verilen kelimenin, verilen cümledeki anlamını Türkçe ver.",
        "Yalnızca şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
        '{"lemma": "kelimenin İngilizce sözlük (kök) hâli", "anlam": "bu cümledeki Türkçe karşılığı, 1-4 kelime", "aciklama": "cümledeki kullanımını anlatan tek kısa Türkçe cümle"}',
      ].join("\n"),
    },
    { role: "user", content: `Kelime: ${word}\nCümle: ${sentence}` },
  ],
};

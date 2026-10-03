import { openQuestionSchema, type OpenQuestion } from "../schemas";
import { sentenceRule, type QuizDirection, type QuizLevel } from "./multipleChoice";
import type { PromptTemplate } from "./types";

export interface OpenQuestionInput {
  lemma: string;
  meaning: string;
  /** Belgede geçtiği cümle: yalnızca anlamı belirlemek için, aynen kullanılmaz. */
  context?: string;
  direction: QuizDirection;
  /** Bu kelime için daha önce sorulmuş cümleler; yenisi bunlara benzememeli. */
  avoid: string[];
  level: QuizLevel;
}

/** Açık uçlu çeviri sorusu için cümle: kullanıcı bunu kendisi çevirecek. */
export const openQuestionPrompt: PromptTemplate<OpenQuestionInput, OpenQuestion> = {
  id: "openQuestion",
  version: 2,
  role: "strong",
  schema: openQuestionSchema,
  temperature: 0.9,
  maxTokens: 1536,
  build: ({ lemma, meaning, context, direction, avoid, level }) => [
    {
      role: "system",
      content: [
        "Sen İngilizce öğrenen Türk öğrenciler için çeviri alıştırması hazırlayan bir öğretmensin.",
        "Hedef kelimeyi YENİ bir İngilizce cümlede kullan. Öğrenci bu cümleyi kendisi çevirecek.",
        "Kurallar:",
        "- cumle: hedef kelimeyi verilen anlamda kullanan, doğal ve yeni bir İngilizce cümle. Belgedeki cümleyi ve kaçınılacak cümleleri tekrar etme; farklı bir konu ve bağlam seç.",
        sentenceRule(level),
        "- Cümle tek anlamlı olsun; çevirisi tartışmalı deyimlerden ve çok nadir kelimelerden kaçın.",
        "- hedef: hedef kelimenin cumle içinde geçtiği hâli, harfi harfine.",
        "- turkce: cumlenin doğal ve eksiksiz Türkçe çevirisi (örnek doğru cevap).",
        direction === "tr-en"
          ? "- Öğrenciye Türkçesi gösterilecek ve İngilizcesini yazması istenecek; Türkçe cümle hedef kelimenin anlamını açıkça içersin."
          : "- Öğrenciye İngilizcesi gösterilecek ve Türkçesini yazması istenecek.",
        "Yalnızca şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
        '{"cumle": "", "hedef": "", "turkce": ""}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Hedef kelime: ${lemma}`,
        ...(meaning ? [`Anlamı: ${meaning}`] : []),
        ...(context ? [`Belgede geçtiği cümle (yalnızca anlamı belirlemek için): ${context}`] : []),
        ...(avoid.length > 0 ? ["Daha önce sorulan cümleler (bunlara benzeme):", ...avoid.map((a) => `- ${a}`)] : []),
      ].join("\n"),
    },
  ],
};

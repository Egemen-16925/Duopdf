import { multipleChoiceSchema, type MultipleChoice } from "../schemas";
import type { PromptTemplate } from "./types";

/** "en-tr": İngilizce cümle, Türkçe şıklar. "tr-en": Türkçe cümle, İngilizce şıklar. */
export type QuizDirection = "en-tr" | "tr-en";

export interface MultipleChoiceInput {
  lemma: string;
  /** Kullanıcının kaydettiği Türkçe anlam (boş olabilir). */
  meaning: string;
  /** Belgede geçtiği cümle: yalnızca anlamı belirlemek için, aynen kullanılmaz. */
  context?: string;
  direction: QuizDirection;
  /** Bu kelime için daha önce sorulmuş cümleler; yenisi bunlara benzememeli. */
  avoid: string[];
}

const DISTRACTOR_RULES: Record<QuizDirection, string[]> = {
  "en-tr": [
    "- Soru: \"Bu cümlenin Türkçesi hangisidir?\" Şıklar Türkçe; doğru şık \"turkce\".",
    "- celdiriciler: \"turkce\"ye biçimce çok benzeyen (benzer uzunluk, aynı üslup ve kelimeler) 3 yanlış Türkçe çeviri.",
    "- En az ikisi hedef kelimeyi yanlış anlamla çevirsin: kelimenin başka bir anlamı, benzer görünen başka bir kelime ya da ters anlam gibi gerçekçi bir karışıklık.",
    "- Kalanında başka tek bir anlam hatası olsun: olumsuzluk, zaman, özne-nesne yer değişimi ya da sayı.",
  ],
  "tr-en": [
    "- Soru: \"Bu cümlenin İngilizcesi hangisidir?\" Şıklar İngilizce; doğru şık \"cumle\".",
    "- celdiriciler: \"cumle\"ye çok benzeyen 3 yanlış İngilizce cümle.",
    "- En az ikisinde hedef kelimenin yerine karıştırılabilecek ama anlamı farklı bir kelime kullan (benzer yazılış, yakın ama yanlış anlam, yanlış kalıp).",
    "- Kalanında başka tek bir anlam hatası olsun: olumsuzluk, zaman, özne-nesne yer değişimi ya da sayı.",
    "- Çeldiriciler dilbilgisi açısından düzgün İngilizce olsun; yanlışlık anlamda olsun.",
  ],
};

export const multipleChoicePrompt: PromptTemplate<MultipleChoiceInput, MultipleChoice> = {
  id: "multipleChoice",
  version: 2,
  role: "strong",
  schema: multipleChoiceSchema,
  // Her sınavda farklı cümleler çıksın.
  temperature: 0.9,
  maxTokens: 2048,
  build: ({ lemma, meaning, context, direction, avoid }) => [
    {
      role: "system",
      content: [
        "Sen İngilizce öğrenen Türk öğrenciler için çoktan seçmeli kelime sorusu hazırlayan bir öğretmensin.",
        "Görevin: hedef kelimeyi YENİ bir İngilizce cümlede kullanmak ve bu cümleyle 4 şıklı bir soru hazırlamak.",
        "Kurallar:",
        "- cumle: hedef kelimeyi verilen anlamda kullanan, 8-20 kelimelik, doğal ve yeni bir İngilizce cümle. Belgedeki cümleyi ve kaçınılacak cümleleri tekrar etme; farklı bir konu ve bağlam seç (yazılım, iş, bilim, günlük hayat…).",
        "- hedef: hedef kelimenin cumle içinde geçtiği hâli, harfi harfine (ör. \"ran\", \"carried out\").",
        "- turkce: cumlenin doğal, akıcı ve eksiksiz Türkçe çevirisi.",
        ...DISTRACTOR_RULES[direction],
        "- Yalnızca bir şık doğru olmalı. Hiçbir çeldirici doğru cevabın eş anlamlısı, başka bir doğru ifadesi ya da yalnızca kelime sırası değişmiş hâli olmasın.",
        "- Her çeldiricinin \"hata\" alanına neden yanlış olduğunu tek kısa Türkçe cümleyle yaz.",
        "Yalnızca şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
        '{"cumle": "", "hedef": "", "turkce": "", "celdiriciler": [{"metin": "", "hata": ""}, {"metin": "", "hata": ""}, {"metin": "", "hata": ""}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Hedef kelime: ${lemma}`,
        ...(meaning ? [`Anlamı: ${meaning}`] : []),
        ...(context ? [`Belgede geçtiği cümle (yalnızca anlamı belirlemek için): ${context}`] : []),
        `Soru yönü: ${direction === "en-tr" ? "İngilizce → Türkçe" : "Türkçe → İngilizce"}`,
        ...(avoid.length > 0 ? ["Daha önce sorulan cümleler (bunlara benzeme):", ...avoid.map((a) => `- ${a}`)] : []),
      ].join("\n"),
    },
  ],
};

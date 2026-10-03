import { evaluationSchema, type Evaluation } from "../schemas";
import type { QuizDirection } from "./multipleChoice";
import type { PromptTemplate } from "./types";

export interface EvaluateTranslationInput {
  /** Öğrenciye gösterilen cümle (en-tr'de İngilizce, tr-en'de Türkçe). */
  sentence: string;
  userTranslation: string;
  targetLemmas: string[];
  /** Varsayılan "en-tr": öğrenci Türkçeye çevirir. */
  direction?: QuizDirection;
  /** Örnek doğru çeviri (yalnızca yol göstermek için; tek doğru cevap değildir). */
  reference?: string;
}

export const evaluateTranslationPrompt: PromptTemplate<EvaluateTranslationInput, Evaluation> = {
  id: "evaluateTranslation",
  version: 2,
  role: "strong",
  schema: evaluationSchema,
  maxTokens: 2048,
  build: ({ sentence, userTranslation, targetLemmas, direction = "en-tr", reference }) => [
    {
      role: "system",
      content: [
        "Sen İngilizce öğrenen bir Türk öğrencinin çevirisini değerlendiren bir öğretmensin.",
        direction === "tr-en"
          ? "Öğrenci verilen Türkçe cümleyi İngilizceye çevirdi."
          : "Öğrenci verilen İngilizce cümleyi Türkçeye çevirdi.",
        "Değerlendirmeyi anlam üzerinden yap: farklı ama doğru bir ifadeyi, eş anlamlı kelimeleri ve farklı kelime sırasını cezalandırma.",
        "Örnek çeviri verildiyse yalnızca yol göstermek içindir; öğrencinin ondan farklı olması hata değildir.",
        "Yalnızca gerçek hataları listele; yazım hatası anlamı değiştirmiyorsa \"kelime\" türünde küçük bir hata olarak belirt. Açıklamalar Türkçe ve kısa olsun.",
        "sonuc: anlam tamamen doğruysa \"dogru\", küçük hatalar varsa ya da bir kısmı eksikse \"kismen\", ana anlam yanlışsa \"yanlis\".",
        "puan: 0-100 arası tam sayı.",
        "hatalar[].tur şunlardan biri olmalı: anlam, dilbilgisi, kelime, eksik, fazla. kullaniciIfadesi: öğrencinin yazdığı hatalı kısım.",
        "duzeltilmisCeviri: öğrencinin çevirisinin, onun ifadelerine olabildiğince sadık kalarak düzeltilmiş hâli.",
        "hedefKelimeler: verilen her hedef kelime için öğrencinin onu doğru anlayıp doğru karşılıkla çevirip çevirmediği.",
        "Yalnızca şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
        '{"sonuc": "dogru|kismen|yanlis", "puan": 0, "hatalar": [{"tur": "anlam", "kullaniciIfadesi": "", "aciklama": ""}], "duzeltilmisCeviri": "", "hedefKelimeler": [{"lemma": "", "dogruAnlasildi": true}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `${direction === "tr-en" ? "Türkçe" : "İngilizce"} cümle: ${sentence}`,
        `Öğrencinin çevirisi: ${userTranslation}`,
        `Hedef kelimeler: ${targetLemmas.join(", ")}`,
        ...(reference ? [`Örnek çeviri: ${reference}`] : []),
      ].join("\n"),
    },
  ],
};

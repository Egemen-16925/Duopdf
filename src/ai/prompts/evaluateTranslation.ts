import { evaluationSchema, type Evaluation } from "../schemas";
import type { PromptTemplate } from "./types";

export interface EvaluateTranslationInput {
  sentence: string;
  userTranslation: string;
  targetLemmas: string[];
}

export const evaluateTranslationPrompt: PromptTemplate<EvaluateTranslationInput, Evaluation> = {
  id: "evaluateTranslation",
  version: 1,
  role: "strong",
  schema: evaluationSchema,
  build: ({ sentence, userTranslation, targetLemmas }) => [
    {
      role: "system",
      content: [
        "Sen İngilizce öğrenen bir Türk öğrencinin çevirisini değerlendiren bir öğretmensin.",
        "Değerlendirmeyi anlam üzerinden yap: farklı ama doğru bir ifadeyi cezalandırma.",
        "Yalnızca gerçek hataları listele. Açıklamalar Türkçe ve kısa olsun.",
        "sonuc: anlam tamamen doğruysa \"dogru\", kısmen doğruysa \"kismen\", ana anlam yanlışsa \"yanlis\".",
        "puan: 0-100 arası tam sayı.",
        "hatalar[].tur şunlardan biri olmalı: anlam, dilbilgisi, kelime, eksik, fazla.",
        "hedefKelimeler: verilen her hedef kelime için öğrencinin onu doğru anlayıp anlamadığı.",
        "Yalnızca şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
        '{"sonuc": "dogru|kismen|yanlis", "puan": 0, "hatalar": [{"tur": "anlam", "kullaniciIfadesi": "", "aciklama": ""}], "duzeltilmisCeviri": "", "hedefKelimeler": [{"lemma": "", "dogruAnlasildi": true}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `İngilizce cümle: ${sentence}`,
        `Öğrencinin çevirisi: ${userTranslation}`,
        `Hedef kelimeler: ${targetLemmas.join(", ")}`,
      ].join("\n"),
    },
  ],
};

import { z } from "zod";

export const wordMeaningSchema = z.object({
  lemma: z.string().min(1),
  anlam: z.string().min(1),
  aciklama: z.string(),
});
export type WordMeaning = z.infer<typeof wordMeaningSchema>;

export const sentenceTranslationSchema = z.object({
  ceviri: z.string().min(1),
  dilbilgisiNotu: z.string(),
});
export type SentenceTranslation = z.infer<typeof sentenceTranslationSchema>;

export const evaluationSchema = z.object({
  sonuc: z.enum(["dogru", "kismen", "yanlis"]),
  puan: z.coerce.number().min(0).max(100),
  hatalar: z.array(
    z.object({
      tur: z.enum(["anlam", "dilbilgisi", "kelime", "eksik", "fazla"]),
      kullaniciIfadesi: z.string(),
      aciklama: z.string(),
    }),
  ),
  duzeltilmisCeviri: z.string().min(1),
  hedefKelimeler: z.array(z.object({ lemma: z.string(), dogruAnlasildi: z.boolean() })),
});
export type Evaluation = z.infer<typeof evaluationSchema>;

/** Şıkları karşılaştırmak için: büyük/küçük harf, noktalama ve boşluk farkı sayılmaz. */
export function normalizeOption(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[\s.,;:!?"'’“”()-]+/g, " ")
    .trim();
}

/**
 * Kelime sorusu: model hedef kelimeyi yeni bir İngilizce cümlede kullanır, Türkçesini ve
 * sorunun yönüne göre (Türkçe ya da İngilizce) 3 yanlış şık yazar.
 */
export const multipleChoiceSchema = z
  .object({
    cumle: z.string().min(1),
    hedef: z.string().min(1),
    turkce: z.string().min(1),
    celdiriciler: z.array(z.object({ metin: z.string().min(1), hata: z.string().min(1) })).length(3),
  })
  .superRefine((value, ctx) => {
    if (!value.cumle.toLocaleLowerCase("en").includes(value.hedef.toLocaleLowerCase("en"))) {
      ctx.addIssue({ code: "custom", message: `"hedef" (${value.hedef}) "cumle" içinde aynen geçmeli.` });
    }
    const all = [value.cumle, value.turkce, ...value.celdiriciler.map((c) => c.metin)].map(normalizeOption);
    if (new Set(all).size !== all.length) {
      ctx.addIssue({ code: "custom", message: "Şıklar birbirinden farklı olmalı; çeldiriciler doğru cevabın aynısı olamaz." });
    }
  });
export type MultipleChoice = z.infer<typeof multipleChoiceSchema>;

/** Açık uçlu soru: hedef kelimeyi kullanan yeni bir İngilizce cümle ve Türkçesi. */
export const openQuestionSchema = z
  .object({
    cumle: z.string().min(1),
    hedef: z.string().min(1),
    turkce: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (!value.cumle.toLocaleLowerCase("en").includes(value.hedef.toLocaleLowerCase("en"))) {
      ctx.addIssue({ code: "custom", message: `"hedef" (${value.hedef}) "cumle" içinde aynen geçmeli.` });
    }
  });
export type OpenQuestion = z.infer<typeof openQuestionSchema>;

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
  puan: z.number().min(0).max(100),
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

import { multipleChoiceSchema, type MultipleChoice } from "../schemas";
import type { PromptTemplate } from "./types";

export interface MultipleChoiceTarget {
  lemma: string;
  /** Cümlede geçtiği hâli. */
  surface: string;
  /** Kullanıcının kaydettiği Türkçe anlam (boş olabilir). */
  meaning: string;
}

export interface MultipleChoiceInput {
  sentence: string;
  targets: MultipleChoiceTarget[];
  /** Okuyucuda daha önce yapılmış çeviri; varsa doğru şık olarak aynen kullanılır. */
  translation?: string;
}

export const multipleChoicePrompt: PromptTemplate<MultipleChoiceInput, MultipleChoice> = {
  id: "multipleChoice",
  version: 1,
  role: "strong",
  schema: multipleChoiceSchema,
  build: ({ sentence, targets, translation }) => [
    {
      role: "system",
      content: [
        "Sen İngilizce öğrenen Türk öğrenciler için çoktan seçmeli çeviri sorusu hazırlayan bir öğretmensin.",
        "Soru: \"Bu cümlenin Türkçesi hangisidir?\" Verilen İngilizce cümlenin doğru Türkçe çevirisini ve 3 yanlış şık (çeldirici) yaz.",
        "Kurallar:",
        "- Doğru çeviri doğal, akıcı ve eksiksiz olsun.",
        "- Çeldiriciler doğru çeviriye biçimce çok benzesin (benzer uzunluk, aynı üslup ve kelimeler), ama anlamları açıkça yanlış olsun.",
        "- En az iki çeldirici hedef kelimeyi yanlış bir anlamla çevirsin: kelimenin başka bir anlamı, benzer görünen başka bir kelime ya da ters anlam gibi gerçekçi bir karışıklık.",
        "- Kalan çeldiricide başka tek bir anlam hatası olabilir: olumsuzluk, zaman, özne-nesne yer değişimi, sayı.",
        "- Hiçbir çeldirici doğru çevirinin eş anlamlısı, başka bir doğru ifadesi ya da yalnızca kelime sırası değişmiş hâli olmasın. Yalnızca bir şık doğru olmalı.",
        "- Her çeldiricinin \"hata\" alanına neden yanlış olduğunu tek kısa Türkçe cümleyle yaz.",
        "Yalnızca şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
        '{"dogruCeviri": "doğru Türkçe çeviri", "celdiriciler": [{"metin": "yanlış şık", "hata": "neden yanlış"}, {"metin": "", "hata": ""}, {"metin": "", "hata": ""}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `İngilizce cümle: ${sentence}`,
        `Hedef kelime(ler): ${targets
          .map((t) => `${t.lemma} (cümlede: "${t.surface}"${t.meaning ? `; anlamı: ${t.meaning}` : ""})`)
          .join(", ")}`,
        ...(translation ? [`Doğru çeviri olarak bunu aynen kullan: ${translation}`] : []),
      ].join("\n"),
    },
  ],
};

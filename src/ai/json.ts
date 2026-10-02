/** Düşünen modellerin <think>...</think> bloklarını çıkarır. */
export function stripThinking(text: string): { text: string; hadThinking: boolean } {
  const pattern = /<think>[\s\S]*?(<\/think>|$)/gi;
  const hadThinking = pattern.test(text);
  return { text: text.replace(pattern, "").trim(), hadThinking };
}

/**
 * Model yanıtından JSON nesnesini ayıklar: ```json çitlerini ve
 * nesnenin önündeki/arkasındaki açıklama metnini yok sayar.
 * Ayrıştırılamazsa SyntaxError fırlatır.
 */
export function extractJson(text: string): unknown {
  const cleaned = stripThinking(text).text;
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : cleaned;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) throw new SyntaxError("Yanıtta JSON nesnesi bulunamadı.");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { generate } from "../ai/aiClient";
import { AiError } from "../ai/errors";
import { wordMeaningPrompt } from "../ai/prompts/wordMeaning";
import type { WordMeaning } from "../ai/schemas";
import { db, type OccurrenceRecord, type TermRecord } from "../db/db";
import type { ProviderProfile } from "../settings/providers";
import { cached } from "./cache";
import { bestLocalLemma } from "./lemma";
import type { TermStatus } from "./matcher";
import type { WordPick } from "./pick";
import { getMatcher, refreshTerms, useTerms } from "./store";
import { deleteTerm, markTerm } from "./terms";

export type PickLocation = Omit<OccurrenceRecord, "id" | "termId" | "createdAt" | "sentence">;

interface Props {
  pick: WordPick;
  location: PickLocation;
  profile: ProviderProfile | null;
  onClose(): void;
}

export const STATUS_LABELS: Record<TermStatus, string> = {
  unknown: "Bilmiyorum",
  learning: "Az biliyorum",
  known: "Biliyorum",
};

type AiState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done"; data: WordMeaning; fromCache: boolean }
  | { state: "error"; message: string };

const WIDTH = 340;

export function WordPopup({ pick, location, profile, onClose }: Props) {
  const terms = useTerms();
  const existing = useMemo(() => getMatcher().findExact(pick.tokens) as TermRecord | undefined, [terms, pick]);
  const [ai, setAi] = useState<AiState>({ state: "idle" });
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const canAsk = Boolean(profile?.apiKey.trim() && profile.fastModel.trim());
  const input = { word: pick.surface, sentence: pick.sentence };

  async function ask(force = false) {
    if (!profile || !canAsk) return;
    setAi({ state: "loading" });
    try {
      const { value, fromCache } = await cached(db, wordMeaningPrompt, input, () => generate(profile, wordMeaningPrompt, input), {
        force,
      });
      setAi({ state: "done", data: value, fromCache });
    } catch (e) {
      setAi({ state: "error", message: e instanceof AiError ? e.message : String(e) });
    }
  }

  useEffect(() => {
    ask();
  }, [pick]);

  // Kelimenin altına (sığmazsa üstüne) yerleştir, pencere dışına taşmasın.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 200;
    const r = pick.rect;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
    const below = r.bottom + 8;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 8) : below;
    setPos({ left, top });
  }, [pick, ai, existing]);

  // Dışarı tıklayınca veya Esc ile kapat.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Belge kayınca pencere kelimeden kopmasın.
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const localLemma = pick.tokens.map((t) => bestLocalLemma(t.word)).join(" ");
  const aiData = ai.state === "done" ? ai.data : undefined;
  const lemma = aiData?.lemma ?? existing?.lemma ?? localLemma;
  const meaning = aiData?.anlam ?? existing?.meaning;
  const explanation = aiData?.aciklama ?? existing?.explanation;

  async function mark(status: TermStatus) {
    setSaving(true);
    try {
      await markTerm(db, {
        termId: existing?.id,
        surface: pick.surface,
        lemma,
        status,
        meaning: aiData?.anlam,
        explanation: aiData?.aciklama,
        occurrence: { ...location, sentence: pick.sentence },
      });
      await refreshTerms();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing || !confirm(`"${existing.lemma}" kelime listenden silinsin mi?`)) return;
    await deleteTerm(db, existing.id);
    await refreshTerms();
    onClose();
  }

  return (
    <div ref={ref} className="word-popup" style={{ left: pos.left, top: pos.top, width: WIDTH }} role="dialog" aria-label="Kelime">
      <div className="word-popup-head">
        <div>
          <div className="word-surface">{pick.surface}</div>
          {lemma.toLowerCase() !== pick.surface.toLowerCase() && <div className="muted">kök: {lemma}</div>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Kapat">
          ×
        </button>
      </div>

      <div className="word-popup-body">
        {ai.state === "loading" && <p className="muted">Anlamı soruluyor…</p>}
        {meaning && <p className="word-meaning">{meaning}</p>}
        {explanation && <p className="muted">{explanation}</p>}
        {ai.state === "error" && (
          <p className="msg error">
            {ai.message}
            {existing?.meaning ? " Kayıtlı anlam gösteriliyor." : ""}
          </p>
        )}
        {!canAsk && (
          <p className="muted">Anlam için Ayarlar'dan API anahtarı ve hızlı model seç. Kelimeyi yine de işaretleyebilirsin.</p>
        )}
      </div>

      <div className="status-buttons">
        {(Object.keys(STATUS_LABELS) as TermStatus[]).map((s) => (
          <button
            key={s}
            className={`status-btn ${s}${existing?.status === s ? " current" : ""}`}
            onClick={() => mark(s)}
            disabled={saving}
            aria-pressed={existing?.status === s}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="word-popup-foot">
        {canAsk && (
          <button className="link-btn" onClick={() => ask(true)} disabled={ai.state === "loading"}>
            Yeniden sor
          </button>
        )}
        {ai.state === "done" && ai.fromCache && <span className="muted">önbellekten</span>}
        <span className="spacer" />
        {existing && (
          <button className="link-btn danger-text" onClick={remove}>
            Listeden sil
          </button>
        )}
      </div>
    </div>
  );
}

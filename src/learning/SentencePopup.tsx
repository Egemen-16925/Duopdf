import { SpeakButton } from "../speech/SpeakButton";
import { useEffect, useRef, useState } from "react";
import { generate } from "../ai/aiClient";
import { describeAiError } from "../ai/errors";
import { translateSentencePrompt } from "../ai/prompts/translateSentence";
import { db, type SentenceRecord } from "../db/db";
import type { AiTarget } from "../settings/providers";
import { setSentenceHighlight } from "./highlights";
import { MAX_SENTENCE_CHARS, type SentencePick } from "./pick";
import { useDismiss, usePopupPlacement } from "./popup";
import { getSentence, translateSentence } from "./sentences";

interface Props {
  pick: SentencePick;
  /** Belgedeki yer (yoksa, ör. sınav cümlesinde, kaydedilmez). */
  source?: { documentHash: string; page: number };
  /** Hızlı model (yoksa yalnızca kayıtlı çeviriler gösterilir). */
  target: AiTarget | null;
  onClose(): void;
}

type State =
  | { state: "loading" }
  | { state: "done"; record: SentenceRecord; fromCache: boolean }
  | { state: "missing" }
  | { state: "error"; message: string; saved?: SentenceRecord };

const WIDTH = 440;

export function SentencePopup({ pick, source, target, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<State>({ state: "loading" });
  const [copied, setCopied] = useState(false);
  const canAsk = target != null;
  const tooLong = pick.text.length > MAX_SENTENCE_CHARS;

  async function run(force = false) {
    if (tooLong) return;
    setResult({ state: "loading" });
    const saved = await getSentence(db, pick.text);
    if (saved && !force) {
      setResult({ state: "done", record: saved, fromCache: true });
      return;
    }
    if (!target) {
      setResult({ state: "missing" });
      return;
    }
    try {
      const out = await translateSentence(db, pick.text, (s) => generate(target, translateSentencePrompt, { sentence: s }), {
        force,
        source,
      });
      setResult({ state: "done", ...out });
    } catch (e) {
      setResult({ state: "error", message: describeAiError(e), saved });
    }
  }

  useEffect(() => {
    run();
  }, [pick]);

  // Çevrilen cümle sayfada görünsün (sınırlar doğru mu, gözle kontrol).
  useEffect(() => {
    setSentenceHighlight(pick.range);
    return () => setSentenceHighlight(null);
  }, [pick]);

  useDismiss(ref, onClose);
  const pos = usePopupPlacement(ref, pick.rect, WIDTH, [result]);

  const record = result.state === "done" ? result.record : result.state === "error" ? result.saved : undefined;

  async function copy() {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(record.translation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // panoya yazılamazsa sessizce geç
    }
  }

  return (
    <div ref={ref} className="word-popup sentence-popup" style={{ left: pos.left, top: pos.top, width: WIDTH }} role="dialog" aria-label="Cümle çevirisi">
      <div className="word-popup-head">
        <div className="muted sentence-source">{pick.text}</div>
        <SpeakButton text={pick.text} label="Cümleyi sesli oku" />
        <button className="icon-btn" onClick={onClose} aria-label="Kapat">
          ×
        </button>
      </div>

      <div className="word-popup-body">
        {tooLong && <p className="msg info">Seçim çok uzun. Daha kısa bir bölüm seç (birkaç cümle).</p>}
        {result.state === "loading" && !tooLong && <p className="muted">Çevriliyor…</p>}
        {record && (
          <>
            <p className="translation">{record.translation}</p>
            {record.grammarNote && (
              <p className="grammar-note">
                <strong>Dilbilgisi: </strong>
                {record.grammarNote}
              </p>
            )}
          </>
        )}
        {result.state === "error" && (
          <p className="msg error">
            {result.message}
            {result.saved ? " Kayıtlı çeviri gösteriliyor." : ""}
          </p>
        )}
        {result.state === "missing" && (
          <p className="muted">Bu cümle henüz çevrilmedi. Çeviri için Ayarlar'da hızlı model için sağlayıcı ve model seç.</p>
        )}
      </div>

      <div className="word-popup-foot">
        {canAsk && !tooLong && (
          <button className="link-btn" onClick={() => run(true)} disabled={result.state === "loading"}>
            Yeniden çevir
          </button>
        )}
        {record && (
          <button className="link-btn" onClick={copy}>
            {copied ? "Kopyalandı" : "Kopyala"}
          </button>
        )}
        {result.state === "done" && result.fromCache && <span className="muted">kayıtlı çeviri</span>}
      </div>
    </div>
  );
}

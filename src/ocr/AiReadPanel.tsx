import { useEffect, useRef, useState } from "react";
import { AiError } from "../ai/errors";
import { readImagePrompt, readImageWithAi } from "../ai/readImage";
import { db } from "../db/db";
import { cached } from "../learning/cache";
import { trackRoot, untrackRoot } from "../learning/highlights";
import { pickFromPointer, type Pick } from "../learning/pick";
import type { AiTarget } from "../settings/providers";

export interface AiReadRequest {
  title: string;
  /** Önbellek için görselin kararlı kimliği (aynı görsel ikinci kez gönderilmez). */
  key(): Promise<string>;
  /** Modele gönderilecek görsel (JPEG veri adresi). */
  image(): Promise<string>;
}

interface Props {
  request: AiReadRequest;
  /** Görsel model. */
  target: AiTarget | null;
  onPick(pick: Pick): void;
  onClose(): void;
}

type State =
  | { state: "loading" }
  | { state: "done"; text: string; fromCache: boolean }
  | { state: "error"; message: string }
  | { state: "noModel" };

export function AiReadPanel({ request, target, onPick, onClose }: Props) {
  const [result, setResult] = useState<State>({ state: "loading" });
  const textRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  async function run(force = false) {
    if (!target) {
      setResult({ state: "noModel" });
      return;
    }
    setResult({ state: "loading" });
    try {
      const key = await request.key();
      const { value, fromCache } = await cached(
        db,
        readImagePrompt,
        { image: key },
        async () => readImageWithAi(target, await request.image()),
        { force },
      );
      setResult({ state: "done", text: value, fromCache });
    } catch (e) {
      setResult({ state: "error", message: e instanceof AiError ? e.message : e instanceof Error ? e.message : String(e) });
    }
  }

  useEffect(() => {
    run();
  }, [request]);

  // Okunan metindeki kelimeler de işaretlenebilir ve vurgulanır.
  useEffect(() => {
    const el = textRef.current;
    if (!el || result.state !== "done") return;
    trackRoot(el, "flow");
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const picked = pickFromPointer(e, ".ai-read-text", "flow");
      if (picked) onPickRef.current(picked.pick);
    };
    el.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("mouseup", onMouseUp);
      untrackRoot(el);
    };
  }, [result]);

  const lines = result.state === "done" ? result.text.split(/\n+/).filter((l) => l.trim()) : [];

  return (
    <aside className="ai-read-panel" role="dialog" aria-label="Yapay zekâ ile okunan yazı">
      <div className="ai-read-head">
        <strong>Yapay zekâ ile okunan yazı</strong>
        <span className="muted">{request.title}</span>
        <span className="spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Kapat">
          ×
        </button>
      </div>
      <div className="ai-read-body">
        {result.state === "loading" && <p className="muted">Görsel modele gönderildi, okunuyor…</p>}
        {result.state === "noModel" && (
          <p className="msg info">Bunun için Ayarlar'da "Görsel model" için sağlayıcı ve model seç (ör. meta/llama-3.2-90b-vision-instruct).</p>
        )}
        {result.state === "error" && <p className="msg error">{result.message}</p>}
        {result.state === "done" && lines.length === 0 && <p className="muted">Model görselde yazı bulamadı.</p>}
        <div ref={textRef} className="ai-read-text">
          {lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
      <div className="word-popup-foot">
        <button className="link-btn" onClick={() => run(true)} disabled={result.state === "loading"}>
          Yeniden oku
        </button>
        {result.state === "done" && (
          <button className="link-btn" onClick={() => navigator.clipboard.writeText(result.text).catch(() => undefined)}>
            Kopyala
          </button>
        )}
        {result.state === "done" && result.fromCache && <span className="muted">kayıtlı sonuç</span>}
      </div>
    </aside>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { db } from "../db/db";
import { trackRoot, untrackRoot } from "../learning/highlights";
import { flashSentence, type Jump } from "../learning/jump";
import { pickFromPointer, type Pick } from "../learning/pick";
import { imageKey, ocrWithCache } from "../ocr/cache";
import { prepareImage, recognizeImage } from "../ocr/engine";
import { renderOcrLayer } from "../ocr/layer";
import type { LoadedImage } from "./loadContent";
import { attachPinch, wheelZoomFactor } from "./zoomGesture";

interface Props {
  image: LoadedImage;
  onPick?(pick: Pick, page: number): void;
  jump?: Jump;
  /** "Yapay zekâ ile oku" düğmesine basılınca. */
  onAiRead?(): void;
}

export type OcrStatus = { state: "reading" } | { state: "done"; words: number } | { state: "error"; message: string };

export function ocrStatusText(status: OcrStatus): string {
  if (status.state === "reading") return "Yazılar okunuyor…";
  if (status.state === "error") return status.message;
  return status.words > 0 ? `${status.words} kelime okundu` : "Yazı bulunamadı";
}

const ZOOMS = [0.5, 0.75, 1, 1.5, 2];

export function ImageViewer({ image, onPick, jump, onAiRead }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [available, setAvailable] = useState(800);
  const [status, setStatus] = useState<OcrStatus>({ state: "reading" });

  // Görüntüleme alanının genişliği ("sığdır" için).
  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth));
    observer.observe(el);
    setAvailable(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const fitScale = Math.min(2, Math.max(0.1, (available - 32) / image.width));
  const scale = zoom === "fit" ? fitScale : zoom;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  /** Yakınlaştırmada imlecin altındaki noktanın ekrandaki yeri sabit kalsın. */
  const anchor = useRef<{ x: number; y: number; px: number; py: number; ratio: number } | null>(null);

  function zoomAt(factor: number, clientX: number, clientY: number) {
    const el = scrollRef.current!;
    const old = scaleRef.current;
    const next = Math.min(4, Math.max(0.1, old * factor));
    if (next === old) return;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    anchor.current = { x: el.scrollLeft + px, y: el.scrollTop + py, px, py, ratio: next / old };
    setZoom(next);
  }
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  useLayoutEffect(() => {
    const a = anchor.current;
    const el = scrollRef.current;
    if (!a || !el) return;
    anchor.current = null;
    el.scrollLeft = a.x * a.ratio - a.px;
    el.scrollTop = a.y * a.ratio - a.py;
  }, [scale]);

  // Resmi tara (önbellekte varsa anında) ve görünmez metin katmanını kur.
  useEffect(() => {
    const layer = layerRef.current!;
    let cancelled = false;
    setStatus({ state: "reading" });
    (async () => {
      const key = await imageKey(image.blob);
      const result = await ocrWithCache(db, key, async () => recognizeImage(await prepareImage(image.blob)));
      if (cancelled) return;
      const words = renderOcrLayer(layer, result, { unitWidth: image.width, unitHeight: image.height });
      trackRoot(layer, "pdf");
      setStatus({ state: "done", words });
    })().catch((e) => {
      if (!cancelled) setStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      cancelled = true;
      untrackRoot(layer);
    };
  }, [image]);

  useEffect(() => {
    const el = scrollRef.current!;
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const result = pickFromPointer(e, ".textLayer", "pdf");
      if (result) onPickRef.current?.(result.pick, 1);
    };
    // Ctrl + tekerlek, touchpad ve dokunmatik ekranda sıkıştırma: imlecin/parmakların olduğu yere göre.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAtRef.current(wheelZoomFactor(e), e.clientX, e.clientY);
    };
    const detachPinch = attachPinch(el, (factor, cx, cy) => zoomAtRef.current(factor, cx, cy));
    el.addEventListener("mouseup", onMouseUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("wheel", onWheel);
      detachPinch();
    };
  }, []);

  // Kelime listesinden "cümleye git" (OCR bitince de dene).
  useEffect(() => {
    if (jump && status.state === "done" && layerRef.current) flashSentence(layerRef.current, "pdf", jump.sentence);
  }, [jump?.nonce, status.state]);

  const zoomValue = zoom === "fit" ? "fit" : String(zoom);
  const pageStyle = {
    width: image.width * scale,
    height: image.height * scale,
    "--total-scale-factor": scale,
  } as CSSProperties;

  return (
    <div className="pdf-viewer">
      <div className="reader-toolbar">
        <button className="secondary" onClick={() => setZoom(Math.max(0.1, scale / 1.25))} title="Uzaklaştır">
          −
        </button>
        <select
          value={ZOOMS.includes(Number(zoomValue)) || zoomValue === "fit" ? zoomValue : "custom"}
          onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
          aria-label="Yakınlaştırma"
        >
          <option value="fit">Genişliğe sığdır</option>
          {!ZOOMS.includes(Number(zoomValue)) && zoomValue !== "fit" && <option value="custom">%{Math.round(scale * 100)}</option>}
          {ZOOMS.map((z) => (
            <option key={z} value={String(z)}>
              %{z * 100}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={() => setZoom(Math.min(4, scale * 1.25))} title="Yakınlaştır">
          +
        </button>
        <span className="toolbar-sep" />
        <span className={status.state === "error" ? "ocr-status error-text" : "ocr-status muted"}>{ocrStatusText(status)}</span>
        {onAiRead && (
          <button className="secondary" onClick={onAiRead} title="Yerel OCR okuyamadıysa görseli yapay zekâya okut">
            Yapay zekâ ile oku
          </button>
        )}
      </div>
      <div ref={scrollRef} className="image-scroll">
        <div className="image-page" style={pageStyle}>
          <img src={image.url} alt="" draggable={false} />
          <div ref={layerRef} className="textLayer ocr-layer" />
        </div>
      </div>
    </div>
  );
}

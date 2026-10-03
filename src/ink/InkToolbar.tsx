import { useEffect, useState } from "react";
import type { InkHandle } from "./useInk";
import { INK_COLORS, INK_SIZES, setInkTools, useInkTools, type InkSize, type InkTool } from "./tools";

interface Props {
  /** Çizim yüzeyi yoksa (akan metin) yalnızca okuma ve parlak kalem gösterilir. */
  ink: InkHandle;
  /** "Çizimli PDF": kaydedilen dosyanın yolunu döner, vazgeçilirse null. */
  onExport?(): Promise<string | null>;
}

type ExportStatus = { kind: "busy" } | { kind: "ok"; path: string } | { kind: "error"; text: string } | null;

const TOOLS: { tool: InkTool; label: string; title: string; drawing: boolean }[] = [
  { tool: "select", label: "Oku", title: "Kelimeye tıkla ya da metin seç", drawing: false },
  { tool: "glow", label: "Fosforlu", title: "Geçici fosforlu kalem: üstünden geçtiğin kelime ya da cümle açılır, iz kaybolur", drawing: false },
  { tool: "pen", label: "Kalem", title: "Sayfaya çiz (kalem basıncını algılar)", drawing: true },
  { tool: "eraser", label: "Silgi", title: "Dokunduğun çizgiyi sil", drawing: true },
];

const SIZE_LABELS: Record<InkSize, string> = { ince: "İnce", orta: "Orta", kalın: "Kalın" };

export function InkToolbar({ ink, onExport }: Props) {
  const { tool, color, size } = useInkTools();
  const [status, setStatus] = useState<ExportStatus>(null);

  // Sonuç birkaç saniye görünsün.
  useEffect(() => {
    if (status?.kind !== "ok" && status?.kind !== "error") return;
    const timer = window.setTimeout(() => setStatus(null), status.kind === "ok" ? 5000 : 10000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function runExport() {
    if (!onExport) return;
    setStatus({ kind: "busy" });
    try {
      const path = await onExport();
      setStatus(path ? { kind: "ok", path } : null);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  const canDraw = !!ink.surface;
  // Çizim yüzeyi olmayan görünümde kalem/silgi seçiliyse "Oku" gibi davranır.
  const current = !canDraw && (tool === "pen" || tool === "eraser") ? "select" : tool;

  return (
    <div className="ink-toolbar" role="toolbar" aria-label="Kalem araçları">
      {TOOLS.filter((t) => canDraw || !t.drawing).map((t) => (
        <button
          key={t.tool}
          className={current === t.tool ? "ink-tool active" : "ink-tool secondary"}
          aria-pressed={current === t.tool}
          title={t.title}
          onClick={() => setInkTools({ tool: t.tool })}
        >
          {t.label}
        </button>
      ))}
      {canDraw && current === "pen" && (
        <>
          <span className="toolbar-sep" />
          {INK_COLORS.map((c) => (
            <button
              key={c}
              className={c === color ? "ink-swatch active" : "ink-swatch"}
              style={{ background: c }}
              title="Renk"
              aria-label={`Renk ${c}`}
              aria-pressed={c === color}
              onClick={() => setInkTools({ color: c })}
            />
          ))}
          <select value={size} onChange={(e) => setInkTools({ size: e.target.value as InkSize })} aria-label="Kalınlık">
            {(Object.keys(INK_SIZES) as InkSize[]).map((s) => (
              <option key={s} value={s}>
                {SIZE_LABELS[s]}
              </option>
            ))}
          </select>
        </>
      )}
      {canDraw && (
        <>
          <span className="toolbar-sep" />
          <button className="secondary" onClick={ink.undo} disabled={!ink.canUndo} title="Geri al (Ctrl+Z)" aria-label="Geri al">
            ↶
          </button>
          <button className="secondary" onClick={ink.redo} disabled={!ink.canRedo} title="Yinele (Ctrl+Y)" aria-label="Yinele">
            ↷
          </button>
          {onExport && (
            <button
              className="secondary"
              onClick={runExport}
              disabled={status?.kind === "busy"}
              title="Çizimleri belgenin bir kopyasına işleyip PDF olarak kaydet (asıl dosya değişmez)"
            >
              {status?.kind === "busy" ? "Kaydediliyor…" : "Çizimli PDF"}
            </button>
          )}
          {status?.kind === "ok" && (
            <span className="ink-status muted" title={status.path}>
              Kaydedildi
            </span>
          )}
          {status?.kind === "error" && <span className="ink-status error-text">{status.text}</span>}
        </>
      )}
    </div>
  );
}

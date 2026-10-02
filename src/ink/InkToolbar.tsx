import type { InkHandle } from "./useInk";
import { INK_COLORS, INK_SIZES, setInkTools, useInkTools, type InkSize, type InkTool } from "./tools";

interface Props {
  /** Çizim yüzeyi yoksa (akan metin) yalnızca okuma ve parlak kalem gösterilir. */
  ink: InkHandle;
  /** "Çizimli PDF" dışa aktarma. */
  onExport?(): void;
  exporting?: boolean;
}

const TOOLS: { tool: InkTool; label: string; title: string; drawing: boolean }[] = [
  { tool: "select", label: "Oku", title: "Kelimeye tıkla ya da metin seç", drawing: false },
  { tool: "glow", label: "Fosforlu", title: "Geçici fosforlu kalem: üstünden geçtiğin kelime ya da cümle açılır, iz kaybolur", drawing: false },
  { tool: "pen", label: "Kalem", title: "Sayfaya çiz (kalem basıncını algılar)", drawing: true },
  { tool: "eraser", label: "Silgi", title: "Dokunduğun çizgiyi sil", drawing: true },
];

const SIZE_LABELS: Record<InkSize, string> = { ince: "İnce", orta: "Orta", kalın: "Kalın" };

export function InkToolbar({ ink, onExport, exporting }: Props) {
  const { tool, color, size } = useInkTools();
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
            <button className="secondary" onClick={onExport} disabled={exporting} title="Çizimleri belgenin üstüne işleyip PDF olarak kaydet">
              {exporting ? "Kaydediliyor…" : "Çizimli PDF"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

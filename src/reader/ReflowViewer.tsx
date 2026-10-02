import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReflowDoc } from "../formats/types";
import { locate, scrollTopFor, type SectionBox } from "./position";

interface Props {
  doc: ReflowDoc;
  initialSection: number;
  initialOffset: number;
  onPositionChange(section: number, offset: number): void;
}

const FONT_SIZES = [14, 16, 18, 20, 22, 26, 30];
const FONT_KEY = "duopdf.reflowFontSize";

function loadFontSize(): number {
  try {
    const saved = Number(localStorage.getItem(FONT_KEY));
    return FONT_SIZES.includes(saved) ? saved : 18;
  } catch {
    return 18;
  }
}

export function ReflowViewer({ doc, initialSection, initialOffset, onPositionChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const onPositionRef = useRef(onPositionChange);
  onPositionRef.current = onPositionChange;
  const position = useRef({ index: Math.max(initialSection - 1, 0), offset: initialOffset });
  const userScrolled = useRef(false);
  /** Programla ayarlanan son kaydırma konumu; bu konumdaki kaydırma olayı kullanıcıdan gelmez. */
  const programmaticTop = useRef<number | null>(null);

  const [section, setSection] = useState(position.current.index);
  const [fontSize, setFontSize] = useState(loadFontSize);

  const boxes = (): SectionBox[] =>
    sectionRefs.current.map((el) => ({ top: el?.offsetTop ?? 0, height: el?.offsetHeight ?? 0 }));

  function restore() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = scrollTopFor(position.current.index, position.current.offset, boxes());
    programmaticTop.current = el.scrollTop;
  }

  // İlk açılışta kaldığı yere git; resimler yüklenip düzen değişirse kullanıcı kaydırmadıysa tekrar konumlan.
  useLayoutEffect(() => {
    restore();
    const images = Array.from(scrollRef.current?.querySelectorAll("img") ?? []);
    Promise.all(images.map((img) => img.decode().catch(() => undefined))).then(() => {
      if (!userScrolled.current) restore();
    });
  }, [doc]);

  // Yazı boyutu değişince okunan yer kaymasın.
  useLayoutEffect(() => {
    restore();
    try {
      localStorage.setItem(FONT_KEY, String(fontSize));
    } catch {
      // tercih kaydedilemezse sorun değil
    }
  }, [fontSize]);

  useEffect(() => {
    const el = scrollRef.current!;
    let timer: number | undefined;
    const onScroll = () => {
      if (timer !== undefined) return;
      // En fazla 100 ms'de bir hesapla (requestAnimationFrame görünmeyen sayfada durur).
      timer = window.setTimeout(() => {
        timer = undefined;
        if (programmaticTop.current != null && Math.abs(el.scrollTop - programmaticTop.current) < 2) return;
        programmaticTop.current = null;
        userScrolled.current = true;
        const pos = locate(el.scrollTop, boxes());
        position.current = pos;
        setSection(pos.index);
        onPositionRef.current(pos.index + 1, pos.offset);
      }, 100);
    };
    // Bağlantılar uygulamanın içinde gezinmesin: kitap içi çapalara kaydır, dış adresleri tarayıcıda aç.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a");
      if (!link) return;
      e.preventDefault();
      const href = link.getAttribute("href") ?? "";
      if (/^https?:/i.test(href)) openUrl(href);
      else if (href.startsWith("#")) el.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("click", onClick);
    };
  }, []);

  function goToSection(index: number) {
    sectionRefs.current[index]?.scrollIntoView();
  }

  function changeFont(step: number) {
    const i = FONT_SIZES.indexOf(fontSize) + step;
    if (i >= 0 && i < FONT_SIZES.length) setFontSize(FONT_SIZES[i]);
  }

  const sections = doc.sections;

  return (
    <div className="pdf-viewer">
      <div className="reader-toolbar">
        {sections.length > 1 && (
          <>
            <button className="secondary" onClick={() => goToSection(section - 1)} disabled={section <= 0} title="Önceki bölüm">
              ‹
            </button>
            <select
              className="section-select"
              value={section}
              onChange={(e) => goToSection(Number(e.target.value))}
              aria-label="Bölüm"
            >
              {sections.map((s, i) => (
                <option key={i} value={i}>
                  {s.title}
                </option>
              ))}
            </select>
            <span className="muted">
              {section + 1} / {sections.length}
            </span>
            <button
              className="secondary"
              onClick={() => goToSection(section + 1)}
              disabled={section >= sections.length - 1}
              title="Sonraki bölüm"
            >
              ›
            </button>
            <span className="toolbar-sep" />
          </>
        )}
        <button className="secondary" onClick={() => changeFont(-1)} disabled={fontSize <= FONT_SIZES[0]} title="Yazıyı küçült">
          A−
        </button>
        <span className="muted">{fontSize} px</span>
        <button
          className="secondary"
          onClick={() => changeFont(1)}
          disabled={fontSize >= FONT_SIZES[FONT_SIZES.length - 1]}
          title="Yazıyı büyüt"
        >
          A+
        </button>
      </div>
      <div ref={scrollRef} className="reflow-scroll">
        <article className="reflow-content" style={{ fontSize }}>
          {sections.map((s, i) => (
            <section
              key={i}
              id={s.anchor ?? `s${i}`}
              ref={(el) => {
                sectionRefs.current[i] = el;
              }}
              className="reflow-section"
              dangerouslySetInnerHTML={{ __html: s.html }}
            />
          ))}
        </article>
      </div>
    </div>
  );
}

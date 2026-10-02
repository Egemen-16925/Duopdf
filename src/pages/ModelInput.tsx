import { useEffect, useId, useMemo, useRef, useState } from "react";

interface Props {
  value: string;
  options: string[];
  onChange(value: string): void;
  placeholder?: string;
  /** Liste açılırken (ör. model listesi henüz çekilmediyse çekmek için). */
  onOpen?(): void;
  onEnter?(): void;
  ariaLabel?: string;
}

const MAX_SHOWN = 200;

/**
 * Model kimliği girişi ve öneri listesi. Tarayıcının <datalist> listesi sayfa kayınca yerinde
 * kaldığı ve biçimlendirilemediği için liste sayfanın içinde çizilir ve sayfayla birlikte kayar.
 */
export function ModelInput({ value, options, onChange, placeholder, onOpen, onEnter, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, MAX_SHOWN);
  }, [options, filter]);

  // Liste açıldıktan sonra yüklenirse vurgu seçili modele gelsin.
  useEffect(() => {
    if (open && !filter) setActive(Math.max(0, options.indexOf(value)));
  }, [options]);

  // Vurgulanan seçenek listenin görünür kısmında kalsın.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openList() {
    if (!open) {
      setOpen(true);
      setFilter("");
      setActive(Math.max(0, options.indexOf(value)));
      onOpen?.();
    }
  }

  function choose(option: string) {
    onChange(option);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.min(Math.max(i + step, 0), Math.max(shown.length - 1, 0)));
    } else if (e.key === "Enter") {
      if (open && shown[active]) {
        e.preventDefault();
        choose(shown[active]);
      } else {
        onEnter?.();
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="model-input">
      <input
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        spellCheck={false}
        onFocus={openList}
        onClick={openList}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          // Yazarak açılınca da model listesi çekilsin.
          if (!open) onOpen?.();
          onChange(e.target.value);
          setFilter(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && shown.length > 0 && (
        <ul ref={listRef} id={listId} className="model-options" role="listbox">
          {shown.map((option, i) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              className={[i === active ? "active" : "", option === value ? "selected" : ""].join(" ")}
              // mousedown: giriş odağı kaybedip liste kapanmadan seçilsin.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

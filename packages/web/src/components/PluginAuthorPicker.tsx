import { useEffect, useRef, useState } from "react";
import { highlight as highlightMatch } from "./SearchBox";

export interface PickerItem {
  id: number;
  name: string;
  sub: string;
  // Optional, additive: callers that only pick a plain id (the badge/embed
  // builders) ignore this. A navigational search needs to know which kind
  // of page to go to, which onChange's second argument carries.
  kind?: string;
}

interface Props {
  items: PickerItem[];
  value: number | null;
  onChange: (id: number, item: PickerItem) => void;
  placeholder: string;
  loading?: boolean;
}

export function PluginAuthorPicker({ items, value, onChange, placeholder, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = items.find((i) => i.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q)) : items;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlightedIndex(0);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropUp(window.innerHeight - rect.bottom < 320);
  }, [open]);

  function pick(item: PickerItem) {
    onChange(item.id, item);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[highlightedIndex];
      if (item) pick(item);
    }
  }

  return (
    <div className="picker" ref={ref}>
      <button ref={triggerRef} type="button" className={`picker-trigger ${open ? "open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className="picker-trigger-label">{current ? current.name : loading ? "Loading…" : placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" className={`picker-chevron ${open ? "flipped" : ""}`}>
          <path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className={`picker-popover ${dropUp ? "drop-up" : ""}`} onKeyDown={onKeyDown}>
          <input
            ref={searchRef}
            type="text"
            className="picker-search"
            placeholder="Search…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
          />
          <div className="picker-list">
            {filtered.length === 0 && <div className="picker-empty">No matches</div>}
            {filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className="pp-search__row"
                aria-selected={i === highlightedIndex}
                onMouseEnter={() => setHighlightedIndex(i)}
                onClick={() => pick(item)}
              >
                <span className="pp-search__label">
                  <b>{highlightMatch(item.name, query)}</b> <span className="pp-search__sub">{item.sub}</span>
                </span>
                {item.id === value && <span className="picker-check">✓</span>}
              </button>
            ))}
          </div>
          <div className="picker-footer">
            <span>{filtered.length} results</span>
            <span>↑↓ · Enter · Esc</span>
          </div>
        </div>
      )}
    </div>
  );
}

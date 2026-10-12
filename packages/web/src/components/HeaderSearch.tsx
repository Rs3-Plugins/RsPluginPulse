import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { search as searchApi, type SearchAuthorRow, type SearchPluginRow } from "../api";
import { useGame } from "../context/GameContext";

interface FlatItem {
  href: string;
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

// Wraps the first case-insensitive occurrence of `query` inside `name` in
// <mark>, per the spec's "wrap the matched substring" instruction.
function highlight(name: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return name;
  const idx = name.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return name;
  return (
    <>
      {name.slice(0, idx)}
      <mark>{name.slice(idx, idx + q.length)}</mark>
      {name.slice(idx + q.length)}
    </>
  );
}

export function HeaderSearch() {
  const { game } = useGame();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ plugins: SearchPluginRow[]; authors: SearchAuthorRow[] } | null>(null);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const desktopInputRef = useRef<HTMLInputElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const isOpen = desktopOpen || paletteOpen;

  const runSearch = useCallback(
    (q: string) => {
      const id = ++requestIdRef.current;
      searchApi(q, game)
        .then((res) => {
          if (id === requestIdRef.current) setResult(res);
        })
        .catch(() => {
          if (id === requestIdRef.current) setResult({ plugins: [], authors: [] });
        });
    },
    [game],
  );

  // Debounced while typing; fetches immediately (trending) the moment
  // either presentation opens with an empty query.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => runSearch(query), query ? 200 : 0);
    return () => clearTimeout(t);
  }, [query, isOpen, runSearch]);

  useEffect(() => {
    setActiveIndex(0);
  }, [result]);

  // Scoped to whichever game it was fetched for -- drop stale cross-game
  // results if the game switches while a presentation is open.
  useEffect(() => {
    setResult(null);
  }, [game]);

  const flatItems = useMemo<FlatItem[]>(() => {
    if (!result) return [];
    return [
      ...result.plugins.map((p) => ({ href: `/plugin/${p.id}` })),
      ...result.authors.map((a) => ({ href: `/author/${a.id}` })),
    ];
  }, [result]);

  function closeDesktop() {
    setDesktopOpen(false);
  }

  function closePalette() {
    setPaletteOpen(false);
  }

  function pick(href: string) {
    navigate(href);
    setQuery("");
    setResult(null);
    closeDesktop();
    closePalette();
    desktopInputRef.current?.blur();
  }

  // Click-away for the desktop dropdown (the scrim covers the rest of the page).
  useEffect(() => {
    if (!desktopOpen) return;
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeDesktop();
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [desktopOpen]);

  // Lock body scroll + autofocus while the mobile/tablet popup is open.
  useEffect(() => {
    if (!paletteOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => paletteInputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [paletteOpen]);

  // "/" (unless focus is already in a text field) or Ctrl/Cmd+K opens
  // whichever presentation fits the current viewport width.
  useEffect(() => {
    function openForViewport() {
      if (window.matchMedia("(min-width: 1080px)").matches) {
        setDesktopOpen(true);
        setTimeout(() => desktopInputRef.current?.focus(), 0);
      } else {
        setPaletteOpen(true);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openForViewport();
        return;
      }
      if (e.key === "/") {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
        e.preventDefault();
        openForViewport();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function onKeyDownInput(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeDesktop();
      closePalette();
      e.currentTarget.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) pick(item.href);
    }
  }

  const trending = query.trim().length === 0;
  const pluginGroupLabel = trending ? "Trending plugins" : "Plugins";
  const authorGroupLabel = trending ? "Trending authors" : "Authors";
  const showEmpty = result !== null && flatItems.length === 0 && !trending;

  function renderRows(variant: "desktop" | "palette") {
    if (!result) return null;
    const rowClass = variant === "desktop" ? "pp-search__row" : "pp-palette__row";
    const groupClass = variant === "desktop" ? "pp-search__group" : "pp-palette__group";
    const subClass = variant === "desktop" ? "pp-search__sub" : "pp-palette__sub";
    const valClass = variant === "desktop" ? "pp-search__val" : "pp-palette__val";
    const emptyClass = variant === "desktop" ? "pp-search__empty" : "pp-palette__empty";

    let index = -1;
    const pluginRows = result.plugins.map((p) => {
      index += 1;
      const i = index;
      const href = `/plugin/${p.id}`;
      return (
        <a
          key={`plugin-${p.id}`}
          className={rowClass}
          role="option"
          aria-selected={i === activeIndex}
          href={href}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={(e) => {
            e.preventDefault();
            pick(href);
          }}
        >
          {variant === "desktop" ? (
            <span className="pp-search__label">
              <b>{highlight(p.name, query)}</b> <span className={subClass}>by {p.author}</span>
            </span>
          ) : (
            <span className="pp-palette__text">
              <span className="pp-palette__name">{highlight(p.name, query)}</span>
              <span className={subClass}>by {p.author}</span>
            </span>
          )}
          <span className={valClass}>{formatCompact(p.total)}</span>
        </a>
      );
    });

    const authorRows = result.authors.map((a) => {
      index += 1;
      const i = index;
      const href = `/author/${a.id}`;
      return (
        <a
          key={`author-${a.id}`}
          className={rowClass}
          role="option"
          aria-selected={i === activeIndex}
          href={href}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={(e) => {
            e.preventDefault();
            pick(href);
          }}
        >
          {variant === "desktop" ? (
            <span className="pp-search__label">
              <b>{highlight(a.name, query)}</b>{" "}
              <span className={subClass}>
                {a.pluginCount} plugin{a.pluginCount === 1 ? "" : "s"}
              </span>
            </span>
          ) : (
            <span className="pp-palette__text">
              <span className="pp-palette__name">{highlight(a.name, query)}</span>
              <span className={subClass}>
                {a.pluginCount} plugin{a.pluginCount === 1 ? "" : "s"}
              </span>
            </span>
          )}
          <span className={valClass}>{formatCompact(a.total)}</span>
        </a>
      );
    });

    return (
      <>
        {result.plugins.length > 0 && <div className={groupClass}>{pluginGroupLabel}</div>}
        {pluginRows}
        {result.authors.length > 0 && (
          <div className={`${groupClass} ${variant === "desktop" ? "pp-search__group--split" : ""}`}>{authorGroupLabel}</div>
        )}
        {authorRows}
        {showEmpty && <div className={emptyClass}>No plugins or authors match &ldquo;{query.trim()}&rdquo;.</div>}
      </>
    );
  }

  return (
    <>
      <div className="pp-search" data-open={desktopOpen ? "true" : "false"} ref={rootRef}>
        <SearchIcon className="pp-search__icon" size={14} />
        <input
          ref={desktopInputRef}
          className="pp-search__input"
          type="search"
          placeholder="Search plugins…"
          aria-label="Search plugins and authors"
          aria-expanded={desktopOpen}
          aria-controls="pp-search-results"
          autoComplete="off"
          value={query}
          onFocus={() => setDesktopOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDownInput}
        />
        {query && (
          <button
            type="button"
            className="pp-search__clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              desktopInputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}

        {desktopOpen && (
          <div className="pp-search__dd" id="pp-search-results" role="listbox" aria-label="Search results">
            <div className="pp-search__dd-head">
              <span className="pp-search__dd-title">Plugins &amp; authors</span>
              <span className="pp-search__dd-hint">Enter to open · Esc to close</span>
            </div>
            <div className="pp-search__dd-body">{renderRows("desktop")}</div>
          </div>
        )}
      </div>
      {desktopOpen && <div className="pp-search__scrim" onClick={closeDesktop} />}

      <button
        type="button"
        className="pp-search-btn"
        aria-label="Search plugins and authors"
        aria-haspopup="dialog"
        onClick={() => setPaletteOpen(true)}
      >
        <SearchIcon size={18} />
      </button>

      {paletteOpen && (
        <div className="pp-palette">
          <div className="pp-palette__backdrop" onClick={closePalette} />
          <div className="pp-palette__panel" role="dialog" aria-modal="true" aria-label="Search">
            <div className="pp-palette__bar">
              <SearchIcon className="pp-palette__icon" size={16} />
              <input
                ref={paletteInputRef}
                className="pp-palette__input"
                type="search"
                placeholder="Search plugins and authors"
                aria-label="Search plugins and authors"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDownInput}
              />
              <button type="button" className="pp-palette__close" aria-label="Close search" onClick={closePalette}>
                Esc
              </button>
            </div>
            <div className="pp-palette__body" role="listbox">
              {renderRows("palette")}
            </div>
            <div className="pp-palette__foot">
              <span>↑↓ to move</span>
              <span>Enter to open</span>
              <span>Esc to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

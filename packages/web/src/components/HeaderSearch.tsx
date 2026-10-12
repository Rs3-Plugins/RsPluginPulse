import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { search as searchApi, type SearchAuthorRow, type SearchPluginRow } from "../api";
import { useGame } from "../context/GameContext";
import { highlight, initials, SearchBox, type SearchBoxGroup, type SearchBoxItem } from "./SearchBox";

interface FlatItem {
  href: string;
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function PaletteAvatar({ name, url }: { name: string; url: string | null }) {
  return (
    <span className="pp-palette__avatar">
      {url ? (
        <img src={url} alt="" referrerPolicy="no-referrer" className="pp-palette__avatar-img" />
      ) : (
        <span className="pp-palette__avatar-fallback">{initials(name)}</span>
      )}
    </span>
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

  function closePalette() {
    setPaletteOpen(false);
  }

  function pick(href: string) {
    navigate(href);
    setQuery("");
    setResult(null);
    setDesktopOpen(false);
    closePalette();
    desktopInputRef.current?.blur();
  }

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
        desktopInputRef.current?.focus();
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

  function onPaletteKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
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
  const emptyMessage = trending ? "Nothing trending yet." : `No plugins or authors match "${query.trim()}".`;

  // No avatarUrl key on plugin items -- SearchBox only reserves an avatar
  // slot when the key is present at all, and plugin rows stay text-only.
  const groups = useMemo<SearchBoxGroup[]>(() => {
    if (!result) return [];
    const pluginItems: SearchBoxItem[] = result.plugins.map((p) => ({
      id: p.id,
      name: p.name,
      sub: `by ${p.author}`,
      value: formatCompact(p.total),
      href: `/plugin/${p.id}`,
    }));
    const authorItems: SearchBoxItem[] = result.authors.map((a) => ({
      id: a.id,
      name: a.name,
      sub: `${a.pluginCount} plugin${a.pluginCount === 1 ? "" : "s"}`,
      value: formatCompact(a.total),
      avatarUrl: a.avatarUrl,
      href: `/author/${a.id}`,
    }));
    return [
      { label: pluginGroupLabel, items: pluginItems },
      { label: authorGroupLabel, items: authorItems },
    ];
  }, [result, pluginGroupLabel, authorGroupLabel]);

  function renderPaletteRows() {
    if (!result) return null;
    let index = -1;
    const pluginRows = result.plugins.map((p) => {
      index += 1;
      const i = index;
      const href = `/plugin/${p.id}`;
      return (
        <a
          key={`plugin-${p.id}`}
          className="pp-palette__row"
          role="option"
          aria-selected={i === activeIndex}
          href={href}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={(e) => {
            e.preventDefault();
            pick(href);
          }}
        >
          <span className="pp-palette__text">
            <span className="pp-palette__name">{highlight(p.name, query)}</span>
            <span className="pp-palette__sub">by {p.author}</span>
          </span>
          <span className="pp-palette__val">{formatCompact(p.total)}</span>
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
          className="pp-palette__row"
          role="option"
          aria-selected={i === activeIndex}
          href={href}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={(e) => {
            e.preventDefault();
            pick(href);
          }}
        >
          <PaletteAvatar name={a.name} url={a.avatarUrl} />
          <span className="pp-palette__text">
            <span className="pp-palette__name">{highlight(a.name, query)}</span>
            <span className="pp-palette__sub">
              {a.pluginCount} plugin{a.pluginCount === 1 ? "" : "s"}
            </span>
          </span>
          <span className="pp-palette__val">{formatCompact(a.total)}</span>
        </a>
      );
    });

    return (
      <>
        {result.plugins.length > 0 && <div className="pp-palette__group">{pluginGroupLabel}</div>}
        {pluginRows}
        {result.authors.length > 0 && <div className="pp-palette__group">{authorGroupLabel}</div>}
        {authorRows}
        {showEmpty && <div className="pp-palette__empty">{emptyMessage}</div>}
      </>
    );
  }

  return (
    <>
      <SearchBox
        ref={desktopInputRef}
        className="pp-search--header"
        query={query}
        onQueryChange={setQuery}
        groups={groups}
        onPick={(item) => pick(item.href!)}
        onOpenChange={setDesktopOpen}
        placeholder="Search plugins…"
        loading={result === null}
        emptyMessage={emptyMessage}
      />

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
                onKeyDown={onPaletteKeyDown}
              />
              <button type="button" className="pp-palette__close" aria-label="Close search" onClick={closePalette}>
                Esc
              </button>
            </div>
            <div className="pp-palette__body" role="listbox">
              {renderPaletteRows()}
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

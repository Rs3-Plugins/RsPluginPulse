import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";

export interface SearchBoxItem {
  id: number;
  name: string;
  sub: string;
  // Omit entirely to render without a value column; omit avatarUrl entirely
  // (vs. passing null) to render without an avatar slot at all -- callers
  // without avatar data (Leaderboard, the API explorer picker) just don't
  // set it, rather than every item needing an explicit null.
  value?: string;
  avatarUrl?: string | null;
  // When set, the row renders as a real <a href> (so ctrl/middle-click to
  // open in a new tab works); omit it for pickers that only update local
  // state (the API explorer's badge/embed builder) rather than navigating.
  href?: string;
}

export interface SearchBoxGroup {
  label: string;
  items: SearchBoxItem[];
}

interface SearchBoxProps {
  query: string;
  onQueryChange: (q: string) => void;
  // Omit both entirely for a plain styled search input with no suggestions
  // dropdown at all (e.g. the Leaderboard's table filter, which already
  // shows every match in the table right below -- a dropdown on top of
  // that was just duplicating it). Pass groups (even as []) to opt into
  // the dropdown.
  groups?: SearchBoxGroup[];
  onPick?: (item: SearchBoxItem, group: SearchBoxGroup) => void;
  placeholder: string;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  // Which edge of the input the dropdown's edge lines up with, and how
  // wide it is at minimum (it still widens to match the input if that's
  // wider). Defaults match the header's own search; the API explorer's
  // narrower picker overrides both to fit its sidebar field instead.
  dropdownAnchor?: "left" | "right";
  dropdownMinWidth?: number;
  // Total rows shown across all groups combined, in group order -- a
  // safety cap so a caller passing a big unfiltered list (the API
  // explorer's picker with an empty query) doesn't render thousands of
  // DOM rows into a 380px-tall scroll box.
  maxResults?: number;
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

// Wraps the first case-insensitive occurrence of `query` inside `name` in
// <mark>, so the matched substring stands out in the results list.
export function highlight(name: string, query: string): ReactNode {
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

function Avatar({ name, url }: { name: string; url: string | null }) {
  return (
    <span className="pp-search__avatar">
      {url ? (
        <img src={url} alt="" referrerPolicy="no-referrer" className="pp-search__avatar-img" />
      ) : (
        <span className="pp-search__avatar-fallback">{initials(name)}</span>
      )}
    </span>
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

// The styled "pp-search" input + dropdown: a reusable typeahead shell for
// anywhere on the site that needs to search plugins/authors (or anything
// name+sub+value shaped) and act on a pick -- the header's desktop search,
// the leaderboard's table filter, and the API explorer's plugin/author
// picker all share this instead of each rolling their own list markup.
export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  {
    query,
    onQueryChange,
    groups,
    onPick,
    placeholder,
    loading,
    emptyMessage,
    className,
    onOpenChange,
    dropdownAnchor = "right",
    dropdownMinWidth = 340,
    maxResults = 30,
  },
  forwardedRef,
) {
  const suggest = groups !== undefined;
  const [open, setOpenState] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const innerInputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => innerInputRef.current as HTMLInputElement);

  function setOpen(next: boolean) {
    setOpenState(next);
    onOpenChange?.(next);
  }

  const cappedGroups = useMemo(() => {
    let remaining = maxResults;
    const capped: SearchBoxGroup[] = [];
    for (const g of groups ?? []) {
      if (remaining <= 0) break;
      const items = g.items.slice(0, remaining);
      remaining -= items.length;
      if (items.length > 0) capped.push({ ...g, items });
    }
    return capped;
  }, [groups, maxResults]);

  const flatItems = useMemo(() => cappedGroups.flatMap((g) => g.items.map((item) => ({ item, group: g }))), [cappedGroups]);
  const hasItems = flatItems.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [groups]);

  useEffect(() => {
    if (!suggest || !open) return;
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggest, open]);

  // Positioned via a portal to <body> and measured coordinates rather than
  // CSS position:absolute, so the dropdown isn't clipped by an ancestor
  // with overflow:hidden (e.g. the API explorer's rounded-corner .card) --
  // it's no longer a DOM descendant of whatever would've clipped it.
  useLayoutEffect(() => {
    if (!suggest || !open || !rootRef.current) {
      setRect(null);
      return;
    }
    function measure() {
      const box = rootRef.current!.getBoundingClientRect();
      const width = Math.max(dropdownMinWidth, box.width);
      const left = dropdownAnchor === "left" ? box.left : box.right - width;
      setRect({ top: box.bottom + 8, left, width });
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [suggest, open, dropdownAnchor, dropdownMinWidth]);

  function pick(entry: { item: SearchBoxItem; group: SearchBoxGroup }) {
    onPick?.(entry.item, entry.group);
    setOpen(false);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      e.currentTarget.blur();
    } else if (!suggest) {
      return;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = flatItems[activeIndex];
      if (entry) pick(entry);
    }
  }

  let rowIndex = -1;

  return (
    <div className={`pp-search ${className ?? ""}`} data-open={suggest && open ? "true" : "false"} ref={rootRef}>
      <SearchIcon className="pp-search__icon" size={14} />
      <input
        ref={innerInputRef}
        className="pp-search__input"
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        aria-expanded={suggest && open}
        autoComplete="off"
        value={query}
        onFocus={() => suggest && setOpen(true)}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {query && (
        <button
          type="button"
          className="pp-search__clear"
          aria-label="Clear search"
          onClick={() => {
            onQueryChange("");
            innerInputRef.current?.focus();
          }}
        >
          ×
        </button>
      )}

      {suggest && open && rect && createPortal(
        <div className="pp-search__dd" style={{ top: rect.top, left: rect.left, width: rect.width }} role="listbox" aria-label="Search results">
          <div className="pp-search__dd-body">
            {loading && <div className="pp-search__empty">Loading…</div>}
            {!loading &&
              cappedGroups.map((group, groupIndex) => {
                if (group.items.length === 0) return null;
                return (
                  <div key={group.label}>
                    <div className={`pp-search__group ${groupIndex > 0 ? "pp-search__group--split" : ""}`}>{group.label}</div>
                    {group.items.map((item) => {
                      rowIndex += 1;
                      const i = rowIndex;
                      const content = (
                        <>
                          {item.avatarUrl !== undefined && <Avatar name={item.name} url={item.avatarUrl} />}
                          <span className="pp-search__label">
                            <b>{highlight(item.name, query)}</b> <span className="pp-search__sub">{item.sub}</span>
                          </span>
                          {item.value !== undefined && <span className="pp-search__val">{item.value}</span>}
                        </>
                      );
                      return item.href ? (
                        <a
                          key={item.id}
                          className="pp-search__row"
                          role="option"
                          aria-selected={i === activeIndex}
                          href={item.href}
                          onMouseEnter={() => setActiveIndex(i)}
                          onClick={(e) => {
                            e.preventDefault();
                            pick({ item, group });
                          }}
                        >
                          {content}
                        </a>
                      ) : (
                        <button
                          key={item.id}
                          type="button"
                          className="pp-search__row"
                          role="option"
                          aria-selected={i === activeIndex}
                          onMouseEnter={() => setActiveIndex(i)}
                          onClick={() => pick({ item, group })}
                        >
                          {content}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            {!loading && !hasItems && <div className="pp-search__empty">{emptyMessage ?? "No results."}</div>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});

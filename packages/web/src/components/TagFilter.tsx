import { useEffect, useRef, useState } from "react";

export type TagState = Record<string, "in" | "out">;

const TAG_GROUPS: { title: string | null; tags: string[] }[] = [
  { title: null, tags: ["Jagex recommended"] },
  { title: "Gameplay", tags: ["Combat", "Skilling", "Questing"] },
  { title: "Theme", tags: ["Social", "Interface", "Utility", "Navigation", "Accessibility", "Items and Inventory"] },
  { title: "Technical", tags: ["Content helpers"] },
  { title: "Mobile", tags: ["Mobile UI friendly"] },
];

export function matchesTags(tags: string[], tagState: TagState): boolean {
  const entries = Object.entries(tagState);
  const included = entries.filter(([, v]) => v === "in").map(([k]) => k);
  const excluded = entries.filter(([, v]) => v === "out").map(([k]) => k);
  if (excluded.some((t) => tags.includes(t))) return false;
  if (included.length > 0 && !included.some((t) => tags.includes(t))) return false;
  return true;
}

interface Props {
  tagState: TagState;
  onChange: (next: TagState) => void;
  tagCounts: Record<string, number>;
  matchCount: number;
}

export function TagFilter({ tagState, onChange, tagCounts, matchCount }: Props) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const activeCount = Object.keys(tagState).length;

  function toggleGroup(title: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function setTag(tag: string, value: "in" | "out" | null) {
    const next = { ...tagState };
    if (value === null) delete next[tag];
    else next[tag] = value;
    onChange(next);
  }

  function toggleInclude(tag: string) {
    setTag(tag, tagState[tag] === "in" ? null : "in");
  }

  function toggleExclude(tag: string) {
    setTag(tag, tagState[tag] === "out" ? null : "out");
  }

  return (
    <div className="tag-filter" ref={ref}>
      <button
        className="filter-btn"
        aria-label="Filter by category"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16">
          <path d="M2 3H14L9.5 8.5V13L6.5 11.5V8.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {activeCount > 0 && <span className="filter-btn-badge">{activeCount}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Filter by category" className="tag-dropdown">
          <div className="tag-dropdown-head">
            <span>Filter by category</span>
            <button className="footer-link" onClick={() => onChange({})}>
              Clear
            </button>
          </div>
          <div className="tag-dropdown-list">
            {TAG_GROUPS.map((group, gi) => {
              const isCollapsed = group.title !== null && collapsed.has(group.title);
              return (
                <div key={gi}>
                  {group.title && (
                    <button className="tag-group-title" aria-expanded={!isCollapsed} onClick={() => toggleGroup(group.title!)}>
                      {group.title}
                      <span className={`tag-group-chevron ${isCollapsed ? "collapsed" : ""}`} />
                    </button>
                  )}
                  {!isCollapsed &&
                    group.tags.map((tag) => {
                      const state = tagState[tag];
                      return (
                        <div key={tag} className="tag-row">
                          <button className="tag-row-main" onClick={() => toggleInclude(tag)}>
                            <svg width="16" height="16" viewBox="0 0 16 16" className="tag-checkbox">
                              <rect
                                x="1"
                                y="1"
                                width="14"
                                height="14"
                                rx="3"
                                fill={state === "in" ? "var(--gold)" : "none"}
                                stroke={state === "in" ? "var(--gold)" : "var(--line2)"}
                                strokeWidth="1"
                              />
                              <path
                                d="M4 8.2L6.6 10.8L12 4.8"
                                fill="none"
                                stroke="var(--goldInk)"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={state === "in" ? 1 : 0}
                              />
                            </svg>
                            <span className={`tag-label ${state === "out" ? "excluded" : ""}`}>{tag}</span>
                          </button>
                          <span className="tag-count">{tagCounts[tag] ?? 0}</span>
                          <button
                            className={`tag-exclude ${state === "out" ? "active" : ""}`}
                            title={state === "out" ? "Remove exclusion" : "Exclude"}
                            onClick={() => toggleExclude(tag)}
                          >
                            −
                          </button>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
          <div className="tag-dropdown-foot">
            <span>✓ include · − exclude</span>
            <span>{matchCount} plugins match</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TagChips({ tagState, onChange }: { tagState: TagState; onChange: (next: TagState) => void }) {
  const entries = Object.entries(tagState);
  if (entries.length === 0) return null;

  return (
    <div className="tag-chips">
      {entries.map(([tag, mode]) => (
        <button
          key={tag}
          className={`tag-chip ${mode === "out" ? "excluded" : ""}`}
          onClick={() => {
            const next = { ...tagState };
            delete next[tag];
            onChange(next);
          }}
        >
          {mode === "out" ? `− ${tag}` : tag}
          <span style={{ opacity: 0.7 }}>×</span>
        </button>
      ))}
      <button className="footer-link" onClick={() => onChange({})}>
        Clear all
      </button>
    </div>
  );
}

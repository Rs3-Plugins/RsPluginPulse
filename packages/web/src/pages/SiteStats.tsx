import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  getCategoryStatsPage,
  getCompareData,
  getPluginReleasesBatch,
  getSpecialEvents,
  getStatsOverview,
  getTopAuthors,
  getTopPlugins,
  search,
  type AuthorLeaderboardRow,
  type CategoryStatsPage,
  type CompareItem,
  type CompareItemStats,
  type CompareMetric,
  type CompareRangeKey,
  type CompareResult,
  type CompareType,
  type PluginLeaderboardRow,
  type PluginRelease,
  type SpecialEvent,
  type StatsOverview,
} from "../api";
import { DailyChart, formatTooltipDate, type Win } from "../components/DailyChart";
import { resolveEvents, resolveReleases, type ResolvedRelease } from "../lib/trendAnnotations";
import { Pagination } from "../components/Pagination";
import { useGame, type Game } from "../context/GameContext";
import { authorHref, pluginHref } from "../lib/links";
import { usePageMeta } from "../hooks/usePageMeta";

type StatsTab = "overview" | "compare";

interface CandidateItem {
  key: number;
  label: string;
  sub: string;
  v: string;
  hay: string;
}

const COMPARE_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];

const ECO_RANGES: { key: 30 | 90 | 365; label: string }[] = [
  { key: 30, label: "30D" },
  { key: 90, label: "90D" },
  { key: 365, label: "1Y" },
];

const CMP_TYPES: { key: CompareType; label: string }[] = [
  { key: "plugin", label: "Plugins" },
  { key: "author", label: "Authors" },
];
function cmpMetrics(game: Game): { key: CompareMetric; label: string }[] {
  // RuneLite has no daily figure and subscribers === total, so "Daily" and
  // "Subscribers" would just duplicate "Total" with different labels.
  if (game === "runelite") return [{ key: "total", label: "Installs" }];
  return [
    { key: "total", label: "Total" },
    { key: "daily", label: "Daily" },
    { key: "subs", label: "Subscribers" },
  ];
}
const CMP_RANGES: { key: CompareRangeKey; label: string }[] = [
  { key: 30, label: "30D" },
  { key: 90, label: "90D" },
  { key: "all", label: "All" },
];

function parseIdsParam(v: string | null): number[] | null {
  if (v === null) return null;
  if (v === "") return [];
  return v
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .slice(0, 4);
}

export function SiteStats() {
  const { game } = useGame();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: StatsTab = tabParam === "overview" || tabParam === "compare" ? tabParam : location.pathname.startsWith("/compare") ? "compare" : "overview";

  function setTab(next: StatsTab) {
    const pathDefault: StatsTab = location.pathname.startsWith("/compare") ? "compare" : "overview";
    const params = new URLSearchParams(searchParams);
    if (next === pathDefault) params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  const isComparePath = location.pathname.startsWith("/compare");
  usePageMeta({
    title: isComparePath
      ? "Compare plugins & authors — RuneScape PluginPulse"
      : "Site stats — RuneScape PluginPulse",
    description: isComparePath
      ? "Put up to four RuneScape or RuneLite plugins or authors side by side and compare their download trends."
      : "Download totals, fastest-growing plugins and newest releases across the RuneScape and RuneLite catalog.",
    canonicalPath: game === "runescape" ? (isComparePath ? "/compare" : "/stats") : `${isComparePath ? "/compare" : "/stats"}?game=${game}`,
  });

  const cmpType: CompareType = searchParams.get("type") === "author" ? "author" : "plugin";
  const cmpMetric: CompareMetric = (["total", "daily", "subs"] as const).includes(searchParams.get("metric") as CompareMetric)
    ? (searchParams.get("metric") as CompareMetric)
    : "total";
  const rangeParam = searchParams.get("range");
  const cmpRange: CompareRangeKey = rangeParam === "30" ? 30 : rangeParam === "all" ? "all" : 90;

  function updateCompare(next: { type?: CompareType; metric?: CompareMetric; range?: CompareRangeKey; pids?: number[]; aids?: number[] }) {
    const params = new URLSearchParams(searchParams);
    if (next.type !== undefined) {
      if (next.type === "plugin") params.delete("type");
      else params.set("type", next.type);
    }
    if (next.metric !== undefined) {
      if (next.metric === "total") params.delete("metric");
      else params.set("metric", next.metric);
    }
    if (next.range !== undefined) {
      if (next.range === 90) params.delete("range");
      else params.set("range", String(next.range));
    }
    if (next.pids !== undefined) {
      params.set("pids", next.pids.join(","));
      params.delete("ids");
    }
    if (next.aids !== undefined) {
      params.set("aids", next.aids.join(","));
      params.delete("ids");
    }
    setSearchParams(params, { replace: true });
  }

  const [ecoRange, setEcoRange] = useState<30 | 90 | 365>(90);
  const [overview, setOverview] = useState<StatsOverview | null>(null);

  useEffect(() => {
    if (tab !== "overview") return;
    let cancelled = false;
    getStatsOverview(ecoRange, game).then((res) => {
      if (!cancelled) setOverview(res);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, ecoRange, game]);

  const [pluginCandidates, setPluginCandidates] = useState<PluginLeaderboardRow[] | null>(null);
  const [authorCandidates, setAuthorCandidates] = useState<AuthorLeaderboardRow[] | null>(null);

  useEffect(() => {
    setPluginCandidates(null);
    setAuthorCandidates(null);
    // Just feeds the compare-picker's client-side search -- same reasoning
    // as the API explorer's picker, no need for the full 10000-row catalog.
    getTopPlugins("alltime", game, 500).then((r) => setPluginCandidates(r.plugins));
    getTopAuthors("alltime", game, 500).then((r) => setAuthorCandidates(r.authors));
  }, [game]);

  const explicitIds =
    cmpType === "plugin" ? parseIdsParam(searchParams.get("pids") ?? searchParams.get("ids")) : parseIdsParam(searchParams.get("aids") ?? searchParams.get("ids"));
  const effectiveIds = explicitIds ?? [];
  const idsKey = effectiveIds.join(",");

  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);

  useEffect(() => {
    if (tab !== "compare" || effectiveIds.length === 0) {
      setCompareResult(null);
      return;
    }
    let cancelled = false;
    getCompareData(cmpType, effectiveIds, cmpMetric, cmpRange).then((res) => {
      if (!cancelled) setCompareResult(res);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, cmpType, idsKey, cmpMetric, cmpRange]);

  // Events are plain calendar facts for the current game, shared across every item in
  // the comparison -- fetched once per compare result's date range, same pattern as the
  // single-plugin trend page.
  const [cmpSpecialEvents, setCmpSpecialEvents] = useState<SpecialEvent[]>([]);
  const [showCmpEvents, setShowCmpEvents] = useState(true);
  const [showCmpReleases, setShowCmpReleases] = useState(true);

  useEffect(() => {
    if (!compareResult) {
      setCmpSpecialEvents([]);
      return;
    }
    let cancelled = false;
    getSpecialEvents(game, compareResult.from, compareResult.to).then((e) => {
      if (!cancelled) setCmpSpecialEvents(e.events);
    });
    return () => {
      cancelled = true;
    };
  }, [game, compareResult?.from, compareResult?.to]);

  // Real backfilled release history (see packages/ingest/src/backfill-releases.ts),
  // keyed by plugin id -- only meaningful for type "plugin" (effectiveIds are author
  // ids for type "author", which plugin_releases knows nothing about).
  const [cmpReleases, setCmpReleases] = useState<Record<number, PluginRelease[]>>({});

  useEffect(() => {
    if (cmpType !== "plugin" || effectiveIds.length === 0) {
      setCmpReleases({});
      return;
    }
    let cancelled = false;
    getPluginReleasesBatch(effectiveIds).then((r) => {
      if (!cancelled) setCmpReleases(r.releases);
    });
    return () => {
      cancelled = true;
    };
  }, [cmpType, idsKey]);

  // allCandidates is the capped local list, so a chip added from a remote
  // search result (see suggestions below) won't resolve its name/sub there
  // once the search box clears -- remembered here instead, same reasoning
  // as PluginAuthorPicker's pickedItem.
  const [resolvedNames, setResolvedNames] = useState<Record<number, { name: string; sub: string }>>({});

  function addItem(candidate: CandidateItem) {
    const next = [...effectiveIds, candidate.key];
    setResolvedNames((prev) => ({ ...prev, [candidate.key]: { name: candidate.label, sub: candidate.sub } }));
    if (cmpType === "plugin") updateCompare({ pids: next });
    else updateCompare({ aids: next });
  }
  function removeItem(key: number) {
    const next = effectiveIds.filter((id) => id !== key);
    if (cmpType === "plugin") updateCompare({ pids: next });
    else updateCompare({ aids: next });
  }

  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [focusId, setFocusId] = useState<number | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!suggestOpen) return;
    function onOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [suggestOpen]);

  const allCandidates: CandidateItem[] = useMemo(
    () =>
      cmpType === "plugin"
        ? (pluginCandidates ?? []).map((p) => ({ key: p.id, label: p.name, sub: `by ${p.authorName}`, v: compact(p.value), hay: `${p.name} ${p.authorName}`.toLowerCase() }))
        : (authorCandidates ?? []).map((a) => ({
            key: a.authorId,
            label: a.authorName,
            sub: `${a.pluginCount} ${a.pluginCount === 1 ? "plugin" : "plugins"}`,
            v: compact(a.value),
            hay: a.authorName.toLowerCase(),
          })),
    [cmpType, pluginCandidates, authorCandidates],
  );

  const ql = query.trim().toLowerCase();
  const localSuggestions = allCandidates.filter((c) => !effectiveIds.includes(c.key) && (!ql || c.hay.includes(ql)));

  // allCandidates is only the top 500 by downloads (same reasoning as the
  // API explorer's picker), so a query that doesn't match anything in it
  // falls back to the real /api/search endpoint -- otherwise anything
  // outside that top slice is unfindable here even though it exists.
  const [remoteSuggestions, setRemoteSuggestions] = useState<CandidateItem[]>([]);
  const searchSeq = useRef(0);
  useEffect(() => {
    if (!ql) {
      setRemoteSuggestions([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      search(query.trim(), game, 20)
        .then((r) => {
          if (searchSeq.current !== seq) return;
          setRemoteSuggestions(
            cmpType === "plugin"
              ? r.plugins.map((p) => ({ key: p.id, label: p.name, sub: `by ${p.author}`, v: compact(p.total), hay: `${p.name} ${p.author}`.toLowerCase() }))
              : r.authors.map((a) => ({
                  key: a.id,
                  label: a.name,
                  sub: `${a.pluginCount} ${a.pluginCount === 1 ? "plugin" : "plugins"}`,
                  v: compact(a.total),
                  hay: a.name.toLowerCase(),
                })),
          );
        })
        .catch(() => {
          if (searchSeq.current === seq) setRemoteSuggestions([]);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [ql, cmpType, game, query]);

  const suggestions = (() => {
    const localKeys = new Set(localSuggestions.map((c) => c.key));
    const merged = [...localSuggestions, ...remoteSuggestions.filter((c) => !localKeys.has(c.key) && !effectiveIds.includes(c.key))];
    return merged.slice(0, 6);
  })();
  const full = effectiveIds.length >= 4;

  function nameAndSubOf(id: number): { name: string; sub: string } | null {
    const candidate = allCandidates.find((c) => c.key === id);
    if (candidate) return { name: candidate.label, sub: candidate.sub };
    return resolvedNames[id] ?? null;
  }

  const chips = effectiveIds.map((id) => nameAndSubOf(id) ?? { name: `#${id}`, sub: "" }).map((c, i) => ({ ...c, key: effectiveIds[i] }));

  return (
    <div className="page">
      <div className="board-head">
        <h1>Stats</h1>
        <p className="subtitle subtitle-sm">
          {tab === "overview" ? "How RuneScape plugins on mod.io are doing as a whole." : "Put up to four plugins or authors side by side."}
        </p>
      </div>

      <div className="api-devtabs" role="tablist" aria-label="Stats">
        <button role="tab" aria-selected={tab === "overview"} className={`api-devtab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button role="tab" aria-selected={tab === "compare"} className={`api-devtab ${tab === "compare" ? "active" : ""}`} onClick={() => setTab("compare")}>
          Compare
        </button>
      </div>

      {tab === "overview" && (
        <OverviewTab overview={overview} ecoRange={ecoRange} onEcoRange={setEcoRange} onOpenPlugin={(nameId) => navigate(pluginHref(nameId, game))} />
      )}

      {tab === "compare" && (
        <div className="stats-stack">
          <div className="card cmp-controls-card">
            <div className="card-edge" />
            <div className="cmp-controls-body">
              <div className="cmp-controls-row">
                <div className="period-group" role="radiogroup" aria-label="Compare type">
                  {CMP_TYPES.map((t) => (
                    <button
                      key={t.key}
                      className={`period-btn ${cmpType === t.key ? "active" : ""}`}
                      onClick={() => updateCompare({ type: t.key })}
                    >
                      <span className="period-label">{t.label}</span>
                    </button>
                  ))}
                </div>
                <div className="cmp-search-wrap" ref={searchWrapRef}>
                  <svg width="16" height="16" viewBox="0 0 16 16" className="cmp-search-icon">
                    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <input
                    className="cmp-search-input"
                    value={query}
                    disabled={full}
                    placeholder={full ? "Remove one to add another (max 4)" : cmpType === "plugin" ? "Add a plugin to compare…" : "Add an author to compare…"}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSuggestOpen(true);
                      setHighlight(0);
                    }}
                    onFocus={() => setSuggestOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSuggestOpen(false);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSuggestOpen(true);
                        setHighlight((h) => Math.min(suggestions.length - 1, h + 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlight((h) => Math.max(0, h - 1));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const s = suggestions[highlight];
                        if (s && !full) {
                          addItem(s);
                          setQuery("");
                          setSuggestOpen(false);
                        }
                      }
                    }}
                  />
                  {suggestOpen && !full && (
                    <div className="cmp-suggest-panel" role="listbox">
                      {suggestions.length === 0 && <div className="cmp-suggest-empty">No matches</div>}
                      {suggestions.map((s, i) => (
                        <button
                          key={s.key}
                          type="button"
                          className={`cmp-suggest-row ${i === highlight ? "highlight" : ""}`}
                          onMouseEnter={() => setHighlight(i)}
                          onClick={() => {
                            addItem(s);
                            setQuery("");
                            setSuggestOpen(false);
                          }}
                        >
                          <span className="cmp-suggest-main">
                            <span className="cmp-suggest-name">{s.label}</span>
                            <span className="cmp-suggest-sub">{s.sub}</span>
                          </span>
                          <span className="cmp-suggest-value">{s.v}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="cmp-chips-row">
                {chips.map((c, i) => (
                  <span key={c.key} className="cmp-chip" onMouseEnter={() => setFocusId(c.key)} onMouseLeave={() => setFocusId(null)}>
                    <span className="cmp-chip-dot" style={{ background: COMPARE_COLORS[i] }} />
                    <span className="cmp-chip-name">{c.name}</span>
                    <button type="button" className="cmp-chip-remove" aria-label={`Remove ${c.name}`} onClick={() => removeItem(c.key)}>
                      ×
                    </button>
                  </span>
                ))}
                <span className="cmp-count-text">{effectiveIds.length} of 4</span>
              </div>
            </div>
          </div>

          {effectiveIds.length === 0 ? (
            <div className="empty-state cmp-empty-dashed">
              <img src="/logo/icon-2-hex-mono-gold.svg" alt="" />
              <div className="empty-title">Nothing to compare yet</div>
              <p style={{ margin: 0 }}>Add up to four using the search above.</p>
            </div>
          ) : (
            <CompareResults
              result={compareResult}
              itemCount={effectiveIds.length}
              type={cmpType}
              metric={cmpMetric}
              range={cmpRange}
              onMetric={(m) => updateCompare({ metric: m })}
              onRange={(r) => updateCompare({ range: r })}
              focusId={focusId}
              onOpen={(nameId) => navigate(cmpType === "plugin" ? pluginHref(nameId, game) : authorHref(nameId, game))}
              specialEvents={cmpSpecialEvents}
              releasesByPluginId={cmpReleases}
              showEvents={showCmpEvents}
              showReleases={showCmpReleases}
              onToggleEvents={() => setShowCmpEvents((v) => !v)}
              onToggleReleases={() => setShowCmpReleases((v) => !v)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function OverviewTab({
  overview,
  ecoRange,
  onEcoRange,
  onOpenPlugin,
}: {
  overview: StatsOverview | null;
  ecoRange: 30 | 90 | 365;
  onEcoRange: (r: 30 | 90 | 365) => void;
  onOpenPlugin: (nameId: string) => void;
}) {
  const { game } = useGame();
  const [catPage, setCatPage] = useState(1);
  const [catPageSize, setCatPageSize] = useState(10);
  const [catData, setCatData] = useState<CategoryStatsPage | null>(null);

  useEffect(() => {
    setCatPage(1);
  }, [game]);

  useEffect(() => {
    let cancelled = false;
    getCategoryStatsPage(catPage, catPageSize, game).then((res) => {
      if (!cancelled) setCatData(res);
    });
    return () => {
      cancelled = true;
    };
  }, [catPage, catPageSize, game]);

  if (!overview) {
    return (
      <div className="stats-stack">
        <div className="kpi-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="kpi-tile">
              <span className="skeleton-bar" style={{ width: "60%", height: 11 }} />
              <span className="skeleton-bar" style={{ width: "45%", height: 26 }} />
              <span className="skeleton-bar" style={{ width: "70%", height: 12 }} />
            </div>
          ))}
        </div>

        <div className="board-layout">
          <div className="stats-main stats-stack">
            <div className="card">
              <div className="card-edge" />
              <div className="chart-card-head">
                <span className="skeleton-bar" style={{ width: 140, height: 15 }} />
                <span className="skeleton-bar" style={{ width: 220, height: 30, borderRadius: 8 }} />
              </div>
              <div style={{ padding: "8px clamp(8px, 3vw, 20px) 14px" }}>
                <span className="skeleton-bar" style={{ width: "100%", height: 280, borderRadius: 8 }} />
              </div>
            </div>

            <div className="card">
              <div className="card-edge" />
              <div className="chart-card-head" style={{ paddingBottom: 12 }}>
                <span className="skeleton-bar" style={{ width: 100, height: 15 }} />
              </div>
              {Array.from({ length: 6 }, (_, i) => (
                <div className="cat-row" key={i}>
                  <span className="skeleton-bar" style={{ width: "60%" }} />
                  <span className="skeleton-bar" style={{ width: "100%" }} />
                  <span className="skeleton-bar" style={{ width: "60%", justifySelf: "end" }} />
                </div>
              ))}
            </div>
          </div>

          <aside className="board-aside">
            <div className="card">
              <div className="card-edge" />
              <div className="hot-card-head">
                <span className="skeleton-bar" style={{ width: 120, height: 14 }} />
              </div>
              {Array.from({ length: 6 }, (_, i) => (
                <div className="hot-row" key={i}>
                  <span className="skeleton-bar" style={{ width: 14, height: 12 }} />
                  <span className="hot-name-col">
                    <span className="skeleton-bar" style={{ width: "70%" }} />
                    <span className="skeleton-bar" style={{ width: "45%" }} />
                  </span>
                  <span className="skeleton-bar" style={{ width: 56, height: 14 }} />
                  <span className="skeleton-bar" style={{ width: 40, justifySelf: "end" }} />
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-edge" />
              <div className="hot-card-head">
                <span className="skeleton-bar" style={{ width: 100, height: 14 }} />
              </div>
              {Array.from({ length: 5 }, (_, i) => (
                <div className="new-release-row" key={i}>
                  <span className="hot-name-col">
                    <span className="skeleton-bar" style={{ width: "70%" }} />
                    <span className="skeleton-bar" style={{ width: "50%" }} />
                  </span>
                  <span className="skeleton-bar" style={{ width: 44, height: 14, justifySelf: "end" }} />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const pct = overview.totals.avg7Yesterday > 0 ? Math.round((overview.totals.downloadsToday / overview.totals.avg7Yesterday - 1) * 100) : 0;
  const maxCategory = Math.max(catData?.maxDownloads ?? 0, 1);
  const catTotal = catData?.total ?? 0;
  const catPageCount = Math.max(1, Math.ceil(catTotal / catPageSize));
  const pageCategories = catData?.categories ?? [];
  const dates = overview.daily.map((d) => d.date);
  const rangeLabel = dates.length ? `${formatDateMed(dates[0])} – ${formatDateMed(dates[dates.length - 1])}` : "";

  return (
    <div className="stats-stack">
      <div className="kpi-grid">
        {game === "runelite" ? (
          <KpiTile label="Total installs" value={overview.totals.downloadsTotal.toLocaleString()} sub={`+${overview.totals.downloadsWeek.toLocaleString()} this week`} />
        ) : (
          <>
            <KpiTile label="Total downloads" value={overview.totals.downloadsTotal.toLocaleString()} sub={`+${overview.totals.downloadsWeek.toLocaleString()} this week`} />
            <KpiTile
              label="Downloads today"
              value={overview.totals.downloadsToday.toLocaleString()}
              sub={`${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs 7-day average`}
            />
          </>
        )}
        <KpiTile label="Plugins tracked" value={overview.totals.plugins.toLocaleString()} sub={`${overview.totals.pluginsNew30d} new in the last 30 days`} />
        <KpiTile label="Authors" value={overview.totals.authors.toLocaleString()} sub={`${overview.totals.authorsReleased30d} released a plugin this month`} />
      </div>

      <div className="board-layout">
        <div className="stats-main stats-stack">
          {game !== "runelite" && (
          <div className="card">
            <div className="card-edge" />
            <div className="chart-card-head">
              <div className="chart-card-title">
                <span className="chart-metric-label">Downloads per day</span>
                <span className="chart-range-text">All RuneScape plugins · {rangeLabel}</span>
              </div>
              <div className="chart-controls">
                <div className="period-group" role="radiogroup" aria-label="Range">
                  {ECO_RANGES.map((r) => (
                    <button key={r.key} className={`range-btn ${ecoRange === r.key ? "active" : ""}`} onClick={() => onEcoRange(r.key)}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="period-group" role="group" aria-label="Export">
                  <button className="range-btn" onClick={() => exportOverview(overview, "csv")}>
                    Export CSV
                  </button>
                  <button className="range-btn" onClick={() => exportOverview(overview, "json")}>
                    Export JSON
                  </button>
                </div>
              </div>
            </div>
            <div className="chart-legend-row">
              <span className="chart-legend-item">
                <span className="chart-legend-swatch bar" />
                Daily downloads
              </span>
              <span className="chart-legend-item">
                <span className="chart-legend-swatch line" />
                7-day average
              </span>
            </div>
            <div style={{ padding: "8px clamp(8px, 3vw, 20px) 14px" }}>
              <DailyChart
                dates={dates}
                bars={overview.daily.map((d) => d.downloads)}
                lines={[{ id: "avg7", color: "var(--goldHi)", values: overview.daily.map((d) => d.avg7), width: 2 }]}
                zeroBased
                renderTooltip={(i, date) => (
                  <>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>{formatTooltipDate(date)}</div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)" }}>{overview.daily[i].downloads.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>downloads · 7-day avg {overview.daily[i].avg7.toLocaleString()}</div>
                  </>
                )}
              />
            </div>
          </div>
          )}

          <div className="card">
            <div className="card-edge" />
            <div className="chart-card-head" style={{ paddingBottom: 12 }}>
              <div className="chart-card-title">
                <span className="chart-metric-label">Categories</span>
                <span className="chart-range-text">
                  {game === "runelite" ? "Installs by category. Plugins can be in more than one." : "Lifetime downloads by mod.io category. Plugins can be in more than one."}
                </span>
              </div>
            </div>
            <div className="cat-head-row">
              <span>Category</span>
              <span>{game === "runelite" ? "Installs" : "Downloads"}</span>
              <span style={{ textAlign: "right" }}>This week</span>
            </div>
            {pageCategories.map((c) => (
              <Link key={c.name} to={`/?tag=${encodeURIComponent(c.name)}`} className="cat-row">
                <span className="cat-name-col">
                  <span className="cat-name">{c.name}</span>
                  <span className="cat-count">{c.pluginCount} {c.pluginCount === 1 ? "plugin" : "plugins"}</span>
                </span>
                <span className="cat-bar-col">
                  <span className="cat-bar-track">
                    <span className="cat-bar-fill" style={{ width: `${((c.downloadsTotal / maxCategory) * 100).toFixed(1)}%` }} />
                  </span>
                  <span className="cat-all">{compact(c.downloadsTotal)}</span>
                </span>
                <span className="cat-week">+{compact(c.weekGain)}</span>
              </Link>
            ))}
            {catTotal > catPageSize && (
              <Pagination
                page={catPage}
                pageCount={catPageCount}
                total={catTotal}
                pageSize={catPageSize}
                onPage={setCatPage}
                onPageSize={(size) => {
                  setCatPageSize(size);
                  setCatPage(1);
                }}
              />
            )}
            <div className="cat-foot">Select a category to see its plugins on the leaderboard.</div>
          </div>
        </div>

        <aside className="board-aside">
          <div className="card">
            <div className="card-edge" />
            <div className="hot-card-head">
              <span className="hot-card-title">
                <span className="hot-dot" />
                Fastest growing
              </span>
              <span className="chart-range-text">This week vs last week</span>
            </div>
            {overview.fastestGrowing.map((g, i) => (
              <div key={g.id} className="hot-row" onClick={() => onOpenPlugin(g.nameId)}>
                <span className="hot-rank">{i + 1}</span>
                <span className="hot-name-col">
                  <span className="hot-name">{g.name}</span>
                  <span className="hot-sub">{g.authorName}</span>
                </span>
                <svg width="56" height="22" viewBox="0 0 56 22" className="hot-spark">
                  <path d={sparklinePath(g.spark, 56, 22)} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                <span className="hot-value">+{g.growthPct}%</span>
              </div>
            ))}
            {overview.fastestGrowing.length === 0 && <p style={{ padding: "16px 18px", color: "var(--dim)", margin: 0 }}>Not enough history yet.</p>}
          </div>

          <div className="card">
            <div className="card-edge" />
            <div className="hot-card-head">
              <span className="hot-card-title">New releases</span>
              <span className="chart-range-text">Most recently published</span>
            </div>
            {overview.newReleases.map((r) => (
              <div key={r.id} className="new-release-row" onClick={() => onOpenPlugin(r.nameId)}>
                <span className="hot-name-col">
                  <span className="hot-name">{r.name}</span>
                  <span className="hot-sub">
                    {r.authorName} · {formatDateMed(r.dateAdded.slice(0, 10))}
                  </span>
                </span>
                <span className="new-release-value">
                  <span className="new-release-num">{compact(r.downloadsTotal)}</span>
                  <span className="new-release-label">{game === "runelite" ? "installs" : "downloads"}</span>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi-tile">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-sub">{sub}</span>
    </div>
  );
}

function CompareResults({
  result,
  itemCount,
  type,
  metric,
  range,
  onMetric,
  onRange,
  focusId,
  onOpen,
  specialEvents,
  releasesByPluginId,
  showEvents,
  showReleases,
  onToggleEvents,
  onToggleReleases,
}: {
  result: CompareResult | null;
  itemCount: number;
  type: CompareType;
  metric: CompareMetric;
  range: CompareRangeKey;
  onMetric: (m: CompareMetric) => void;
  onRange: (r: CompareRangeKey) => void;
  focusId: number | null;
  onOpen: (nameId: string) => void;
  specialEvents: SpecialEvent[];
  releasesByPluginId: Record<number, PluginRelease[]>;
  showEvents: boolean;
  showReleases: boolean;
  onToggleEvents: () => void;
  onToggleReleases: () => void;
}) {
  const { game } = useGame();
  // Computed unconditionally (not after the early return below) so this component calls
  // the same hooks on every render regardless of whether result is loaded yet.
  const dates = result ? dateRangeArray(result.from, result.to) : [];
  const resolvedEvents = useMemo(() => resolveEvents(dates, specialEvents), [dates, specialEvents]);
  // Real backfilled release history ("Plugin updates") -- each compared item tracks
  // its own releases independently, unlike events which are shared calendar facts for
  // the whole game.
  const releaseMapsByItem = useMemo(
    () => (result?.items ?? []).map((it) => resolveReleases(dates, releasesByPluginId[it.key])),
    [result, dates, releasesByPluginId],
  );
  const releaseDays = useMemo(() => {
    const set = new Set<number>();
    for (const m of releaseMapsByItem) for (const [d, r] of m) if (r.isInitial) set.add(d);
    return Array.from(set);
  }, [releaseMapsByItem]);
  const updateDays = useMemo(() => {
    const set = new Set<number>();
    for (const m of releaseMapsByItem) for (const [d, r] of m) if (!r.isInitial) set.add(d);
    return Array.from(set);
  }, [releaseMapsByItem]);
  // Zoom lives here (not inside DailyChart) so the Zoom buttons can sit in this
  // component's own header row, matching TrendChart's layout exactly.
  const [zoom, setZoom] = useState<Win | null>(null);
  useEffect(() => {
    setZoom(null);
  }, [result?.from, result?.to, metric]);
  const lastAll = Math.max(0, dates.length - 1);
  const zoomWin = zoom ?? { a: 0, b: lastAll };
  const MINW = 4;
  function zoomBy(factor: number) {
    const w = zoomWin.b - zoomWin.a;
    const nw = Math.max(MINW, Math.min(lastAll, Math.round(w * factor)));
    if (nw === w) return;
    const c = (zoomWin.a + zoomWin.b) / 2;
    let a = Math.round(c - ((c - zoomWin.a) * nw) / w);
    a = Math.max(0, Math.min(lastAll - nw, a));
    setZoom(nw >= lastAll ? null : { a, b: a + nw });
  }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    function onDown(e: MouseEvent) {
      if (settingsAnchorRef.current && !settingsAnchorRef.current.contains(e.target as Node)) setSettingsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  if (!result || result.items.length === 0) {
    const cols = cmpTableCols(itemCount);
    return (
      <>
        <div className="card">
          <div className="card-edge" />
          <div className="chart-card-head">
            <span className="skeleton-bar" style={{ width: 160, height: 15 }} />
            <span className="skeleton-bar" style={{ width: 220, height: 30, borderRadius: 8 }} />
          </div>
          <div style={{ padding: "8px clamp(8px, 3vw, 20px) 14px" }}>
            <span className="skeleton-bar" style={{ width: "100%", height: 280, borderRadius: 8 }} />
          </div>
        </div>
        <div className="card">
          <div className="card-edge" />
          <div className="cmp-head-row" style={{ gridTemplateColumns: cols }}>
            <span className="cmp-head-label">Side by side</span>
            {Array.from({ length: Math.max(1, itemCount) }, (_, i) => (
              <span key={i} className="skeleton-bar" style={{ width: "80%", height: 14, justifySelf: "end" }} />
            ))}
          </div>
          {Array.from({ length: 7 }, (_, row) => (
            <div className="cmp-row" key={row} style={{ gridTemplateColumns: cols }}>
              <span className="skeleton-bar" style={{ width: "70%" }} />
              {Array.from({ length: Math.max(1, itemCount) }, (_, i) => (
                <span key={i} className="skeleton-bar" style={{ width: "60%", justifySelf: "end" }} />
              ))}
            </div>
          ))}
        </div>
      </>
    );
  }

  const lines = result.items.map((it, i) => ({ id: it.key, color: COMPARE_COLORS[i], values: it.series }));
  const metricLabel =
    game === "runelite"
      ? "Total installs"
      : metric === "total"
        ? "Total downloads"
        : metric === "daily"
          ? "Downloads per day (7-day average)"
          : "Subscribers";
  const rangeLabel = dates.length ? `${formatDateMed(dates[0])} – ${formatDateMed(dates[dates.length - 1])}` : "";
  const rows = buildCompareRows(result.items, type, game);
  const items = result.items;
  function annotationLine(i: number): { label: string; text: string; color: string } | null {
    const ev = showEvents ? resolvedEvents.find((e) => i >= e.a && i <= e.b) : undefined;
    if (ev) return { label: "Event", text: ev.event.title, color: "var(--evText)" };
    if (showReleases) {
      const released: { it: (typeof items)[number]; release: ResolvedRelease }[] = [];
      for (const [idx, it] of items.entries()) {
        const release = releaseMapsByItem[idx]?.get(i);
        if (release) released.push({ it, release });
      }
      if (released.length) {
        const text = released.map(({ it, release }) => (release.version ? `${it.name} (v${release.version})` : it.name)).join(", ");
        return { label: "Plugin Update", text, color: "var(--rel)" };
      }
    }
    return null;
  }

  return (
    <>
      <section className="ppc" aria-label="Compare chart">
        <header className="ppc-head">
          <div className="ppc-heading">
            <span className="ppc-title">{metricLabel}</span>
            <span className="ppc-sub">{rangeLabel}</span>
          </div>
          <div className="ppc-controls">
            <div className="ppc-seg" role="radiogroup" aria-label="Metric">
              {cmpMetrics(game).map((m) => (
                <button key={m.key} type="button" role="radio" aria-checked={metric === m.key} onClick={() => onMetric(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="ppc-seg" role="radiogroup" aria-label="Range">
              {CMP_RANGES.map((r) => (
                <button key={String(r.key)} type="button" role="radio" aria-checked={range === r.key} onClick={() => onRange(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="ppc-seg" role="group" aria-label="Zoom">
              <button type="button" className="ppc-icon" aria-label="Zoom out" title="Zoom out" disabled={zoomWin.b - zoomWin.a >= lastAll} onClick={() => zoomBy(1 / 0.6)}>
                <ZoomOutIcon />
              </button>
              <button type="button" className="ppc-icon" aria-label="Zoom in" title="Zoom in" disabled={zoomWin.b - zoomWin.a <= MINW} onClick={() => zoomBy(0.6)}>
                <ZoomInIcon />
              </button>
              <button type="button" className="ppc-reset" aria-label="Reset zoom" disabled={!zoom} onClick={() => setZoom(null)}>
                Reset
              </button>
            </div>
            <div className="ppc-anchor" ref={settingsAnchorRef}>
              <button type="button" className="ppc-btn" aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((o) => !o)}>
                <SlidersIcon />
                Chart settings
                {(!showEvents || !showReleases) && <span className="ppc-badge">{[!showEvents, !showReleases].filter(Boolean).length} off</span>}
              </button>
              {settingsOpen && (
                <div className="ppc-pop ppc-pop--settings" role="dialog" aria-label="Chart settings">
                  <div className="ppc-sec ppc-sec--layers">
                    <span className="ppc-eyebrow">Annotations</span>
                    <label className="ppc-layer">
                      <span className="ppc-layer-ic">
                        <svg width={18} height={18} viewBox="0 0 18 18">
                          <rect x={1} y={1} width={16} height={16} rx={2} fill="rgba(127,176,214,.16)" />
                          <circle cx={9} cy={9} r={4} fill="var(--raise)" stroke="var(--ev)" strokeWidth={1.8} />
                        </svg>
                      </span>
                      <span className="ppc-layer-txt">
                        <span className="ppc-layer-label">Event periods</span>
                        <span className="ppc-small">Shading plus start and end markers</span>
                      </span>
                      <button type="button" className="ppc-switch" role="switch" aria-checked={showEvents} aria-label="Event periods" onClick={onToggleEvents} />
                    </label>
                    <label className="ppc-layer">
                      <span className="ppc-layer-ic">
                        <svg width={18} height={18} viewBox="0 0 18 18">
                          <rect x={5} y={5} width={8} height={8} rx={2} fill="var(--rel)" />
                        </svg>
                      </span>
                      <span className="ppc-layer-txt">
                        <span className="ppc-layer-label">Releases &amp; updates</span>
                        <span className="ppc-small">Each item's first release, and every one after it</span>
                      </span>
                      <button type="button" className="ppc-switch" role="switch" aria-checked={showReleases} aria-label="Releases and updates" onClick={onToggleReleases} />
                    </label>
                  </div>
                  <div className="ppc-sec">
                    <div className="ppc-row">
                      <span className="ppc-eyebrow">Export range</span>
                      <div className="ppc-actions">
                        <button type="button" className="ppc-ghost" onClick={() => exportCompare(result, dates, "csv")}>
                          CSV
                        </button>
                        <button type="button" className="ppc-ghost" onClick={() => exportCompare(result, dates, "json")}>
                          JSON
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="ppc-plotwrap">
          <DailyChart
            dates={dates}
            lines={lines}
            zeroBased={metric === "daily"}
            focusId={focusId}
            interactive
            events={resolvedEvents}
            releaseDays={releaseDays}
            updateDays={updateDays}
            showEvents={showEvents}
            showReleases={showReleases}
            zoom={zoom}
            onZoomChange={setZoom}
            renderTooltip={(i, date) => {
              const note = annotationLine(i);
              return (
                <>
                  <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 2 }}>{formatTooltipDate(date)}</div>
                  {note && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: note.color, marginBottom: 2 }}>
                      {note.label} · {note.text}
                    </div>
                  )}
                  {result.items
                    .map((it, idx) => ({ it, idx, v: it.series[i] }))
                    .sort((a, b) => b.v - a.v)
                    .map(({ it, idx, v }) => (
                      <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: COMPARE_COLORS[idx], flex: "none" }} />
                        <span style={{ flex: 1, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", color: "var(--muted)" }}>{it.name}</span>
                        <span style={{ fontWeight: 600, color: "var(--text)", paddingLeft: 10 }}>{v.toLocaleString()}</span>
                      </div>
                    ))}
                </>
              );
            }}
          />
        </div>
        <footer className="ppc-key" style={{ justifyContent: "center" }}>
          <div className="ppc-key-item ppc-key-item--warn">
            <WarningIcon />
            <span className="ppc-key-desc">
              Markers show date overlap only. A marked day lined up with an event or plugin update; it does not prove that caused the change.
            </span>
          </div>
        </footer>
      </section>

      <div className="card">
        <div className="card-edge" />
        <div className="cmp-table-scroll">
          <div className="cmp-head-row" style={{ gridTemplateColumns: cmpTableCols(result.items.length) }}>
            <span className="cmp-head-label">Side by side</span>
            {result.items.map((it, i) => (
              <button key={it.key} className="cmp-head-cell" onClick={() => onOpen(it.nameId)}>
                <span className="cmp-head-bar" style={{ background: COMPARE_COLORS[i] }} />
                <span className="cmp-head-name">{it.name}</span>
                <span className="cmp-head-sub">{it.sub}</span>
              </button>
            ))}
          </div>
          {rows.map((row) => (
            <div key={row.label} className="cmp-row" style={{ gridTemplateColumns: cmpTableCols(result.items.length) }}>
              <span className="cmp-row-label">{row.label}</span>
              {row.cells.map((cell, i) => (
                <span key={i} className={`cmp-cell ${cell.leader ? "leader" : ""}`}>
                  {cell.text}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="cat-foot">Leader in each row is shown in gold.</div>
      </div>
    </>
  );
}

function cmpTableCols(count: number): string {
  return `minmax(150px,1.1fr) repeat(${Math.max(1, count)}, minmax(130px,1fr))`;
}

function buildCompareRows(
  items: CompareItem[],
  type: CompareType,
  game: Game,
): { label: string; cells: { text: string; leader: boolean }[] }[] {
  const fmtN = (v: number) => v.toLocaleString();
  const fmtGain = (v: number) => `${v >= 0 ? "+" : ""}${v.toLocaleString()}`;
  const fmtRank = (v: number) => `#${v}`;

  type Def = { label: string; get: (s: CompareItemStats) => number | null; fmt: (v: number) => string; lowerWins?: boolean };

  // RuneLite has no daily-downloads figure (so "hot rank" is meaningless)
  // and subscribers === total installs, so those rows would just repeat
  // "Total installs" under a different name.
  const totalLabel = game === "runelite" ? "Total installs" : "Total downloads";
  const numericDefs: Def[] =
    type === "plugin"
      ? [
          { label: totalLabel, get: (s) => s.all, fmt: fmtN },
          ...(game === "runelite" ? [] : [{ label: "Downloads today", get: (s: CompareItemStats) => s.hot, fmt: fmtN }]),
          { label: "Gained this week", get: (s) => s.week, fmt: fmtGain },
          { label: "Gained last 30 days", get: (s) => s.month, fmt: fmtGain },
          ...(game === "runelite" ? [] : [{ label: "Subscribers", get: (s: CompareItemStats) => s.subs, fmt: fmtN }]),
          { label: "All-time rank", get: (s) => s.rank, fmt: fmtRank, lowerWins: true },
          ...(game === "runelite" ? [] : [{ label: "Hot rank today", get: (s: CompareItemStats) => s.hotRank, fmt: fmtRank, lowerWins: true }]),
        ]
      : [
          { label: totalLabel, get: (s) => s.all, fmt: fmtN },
          ...(game === "runelite" ? [] : [{ label: "Downloads today", get: (s: CompareItemStats) => s.hot, fmt: fmtN }]),
          { label: "Gained this week", get: (s) => s.week, fmt: fmtGain },
          { label: "Gained last 30 days", get: (s) => s.month, fmt: fmtGain },
          ...(game === "runelite" ? [] : [{ label: "Subscribers", get: (s: CompareItemStats) => s.subs, fmt: fmtN }]),
          { label: "Plugins", get: (s) => s.count, fmt: fmtN },
          { label: "All-time rank", get: (s) => s.rank, fmt: fmtRank, lowerWins: true },
        ];

  const rows = numericDefs.map((def) => {
    const values = items.map((it) => def.get(it.stats));
    let leaderIndex: number | null = null;
    if (items.length > 1 && values.every((v) => v !== null)) {
      const known = values as number[];
      const best = def.lowerWins ? Math.min(...known) : Math.max(...known);
      if (known.filter((v) => v === best).length === 1) leaderIndex = known.indexOf(best);
    }
    return {
      label: def.label,
      cells: values.map((v, i) => ({ text: v === null ? "—" : def.fmt(v), leader: i === leaderIndex })),
    };
  });

  rows.push({
    label: type === "plugin" ? "Released" : "Publishing since",
    cells: items.map((it) => ({ text: formatDateMed(it.stats.start.slice(0, 10)), leader: false })),
  });

  return rows;
}

function dateRangeArray(from: string, to: string): string[] {
  if (!from || !to) return [];
  const out: string[] = [];
  let d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvSafe(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportOverview(overview: StatsOverview, format: "csv" | "json") {
  if (format === "json") {
    triggerDownload("pluginpulse-stats-overview.json", JSON.stringify(overview.daily, null, 2), "application/json");
    return;
  }
  const rows = overview.daily.map((d) => `${d.date},${d.downloads},${d.avg7}`);
  triggerDownload("pluginpulse-stats-overview.csv", ["date,downloads,avg7", ...rows].join("\n"), "text/csv");
}

function exportCompare(result: CompareResult, dates: string[], format: "csv" | "json") {
  if (format === "json") {
    triggerDownload("pluginpulse-compare.json", JSON.stringify(result, null, 2), "application/json");
    return;
  }
  const header = ["date", ...result.items.map((it) => csvSafe(it.name))].join(",");
  const rows = dates.map((date, i) => [date, ...result.items.map((it) => it.series[i])].join(","));
  triggerDownload("pluginpulse-compare.csv", [header, ...rows].join("\n"), "text/csv");
}

function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatDateMed(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function compact(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(Math.round(v));
}

function SlidersIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M1.5 3.5H12.5M1.5 7H12.5M1.5 10.5H12.5" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={4.5} cy={3.5} r={1.6} fill="var(--raise)" stroke="currentColor" strokeWidth={1.3} />
      <circle cx={9.5} cy={7} r={1.6} fill="var(--raise)" stroke="currentColor" strokeWidth={1.3} />
      <circle cx={6} cy={10.5} r={1.6} fill="var(--raise)" stroke="currentColor" strokeWidth={1.3} />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx={6} cy={6} r={4.3} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <path d="M9.2 9.2L12.5 12.5M4 6H8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}
function ZoomInIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx={6} cy={6} r={4.3} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <path d="M9.2 9.2L12.5 12.5M4 6H8M6 4V8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1.3L13 11.8H1L7 1.3Z" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M7 5.3V8.3" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={7} cy={10.1} r={0.75} fill="currentColor" />
    </svg>
  );
}

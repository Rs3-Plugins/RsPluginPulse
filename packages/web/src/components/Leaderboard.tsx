import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getFastestGrowingPlugins,
  getNewestPlugins,
  getTopPlugins,
  type AuthorLeaderboardRow,
  type FastestGrowingPlugin,
  type NewestPluginRow,
  type Period,
  type PluginLeaderboardRow,
} from "../api";
import { HotCard } from "./HotCard";
import { TagChips, TagFilter, matchesTags, type TagState } from "./TagFilter";
import { Dropdown } from "./Dropdown";
import { Pagination, PAGE_SIZE_OPTIONS } from "./Pagination";
import { SearchBox } from "./SearchBox";
import { useGame, type Game } from "../context/GameContext";

type Entity = "plugins" | "authors" | "growth" | "new";
type GrowthView = "plugins" | "authors";

interface GrowthAuthor {
  authorId: number;
  authorName: string;
  pluginCount: number;
  downloadsTotal: number;
  subscribersTotal: number;
  downloadsGain: number;
  subscribersGain: number;
  avgGrowthPct: number;
  growthScore: number;
}

const GROWTH_WINDOWS: { value: string; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "custom", label: "Custom" },
];

function periods(game: Game): { key: Period; label: string; caption: string; dot?: boolean }[] {
  const noun = game === "runelite" ? "installs" : "downloads";
  return [
    { key: "alltime", label: "All-time", caption: `Lifetime ${noun}` },
    { key: "hot", label: "Hot now", caption: `${capitalize(noun)} today`, dot: true },
    { key: "weekly", label: "This week", caption: "Gain · last 7 days" },
    { key: "monthly", label: "Monthly", caption: "Gain · last 30 days" },
  ];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ENTITIES: Entity[] = ["plugins", "authors", "growth", "new"];
const PERIOD_KEYS: Period[] = ["alltime", "hot", "weekly", "monthly"];
const GROWTH_VIEWS: GrowthView[] = ["plugins", "authors"];
const GROWTH_WINDOW_KEYS = GROWTH_WINDOWS.map((w) => w.value);

function parseEntity(v: string | null): Entity {
  return (ENTITIES as string[]).includes(v ?? "") ? (v as Entity) : "plugins";
}
function parsePeriod(v: string | null): Period {
  return (PERIOD_KEYS as string[]).includes(v ?? "") ? (v as Period) : "alltime";
}
function parseGrowthView(v: string | null): GrowthView {
  return (GROWTH_VIEWS as string[]).includes(v ?? "") ? (v as GrowthView) : "plugins";
}
function parseGrowthWindow(v: string | null): string {
  return (GROWTH_WINDOW_KEYS as string[]).includes(v ?? "") ? (v as string) : "7";
}

export function Leaderboard() {
  const { game } = useGame();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the single source of truth for which tab/sub-tab is active,
  // so navigating to a bare "/" (e.g. the logo link) always lands back on
  // the default view with no stale state left over from before.
  const entity = parseEntity(searchParams.get("tab"));
  const growthView = parseGrowthView(searchParams.get("view"));
  const growthWindowKey = parseGrowthWindow(searchParams.get("window"));
  const customSinceDate = growthWindowKey === "custom" ? searchParams.get("since") ?? "" : "";
  const period = parsePeriod(searchParams.get("period"));

  function updateView(next: {
    entity?: Entity;
    period?: Period;
    growthView?: GrowthView;
    growthWindowKey?: string;
    customSinceDate?: string;
  }) {
    const nextEntity = next.entity ?? entity;
    const nextPeriod = next.period ?? period;
    const nextGrowthView = next.growthView ?? growthView;
    const nextGrowthWindowKey = next.growthWindowKey ?? growthWindowKey;
    const nextCustomSinceDate = next.customSinceDate ?? customSinceDate;

    const params = new URLSearchParams();
    if (nextEntity !== "plugins") params.set("tab", nextEntity);
    if (nextEntity === "growth") {
      if (nextGrowthView !== "plugins") params.set("view", nextGrowthView);
      if (nextGrowthWindowKey !== "7") params.set("window", nextGrowthWindowKey);
      if (nextGrowthWindowKey === "custom" && nextCustomSinceDate) params.set("since", nextCustomSinceDate);
    } else if ((nextEntity === "plugins" || nextEntity === "authors") && nextPeriod !== "alltime") {
      params.set("period", nextPeriod);
    }
    setSearchParams(params, { replace: true });
  }

  function setEntity(e: Entity) {
    updateView({ entity: e });
  }
  function setPeriod(p: Period) {
    updateView({ period: p });
  }
  function setGrowthView(v: GrowthView) {
    updateView({ growthView: v });
  }
  function setGrowthWindowKey(w: string) {
    updateView({ growthWindowKey: w, customSinceDate: w === "custom" ? customSinceDate : "" });
  }
  function setCustomSinceDate(since: string) {
    updateView({ customSinceDate: since });
  }

  const [plugins, setPlugins] = useState<PluginLeaderboardRow[] | null>(null);
  const [fastestGrowing, setFastestGrowing] = useState<FastestGrowingPlugin[] | null>(null);
  const [newestPlugins, setNewestPlugins] = useState<NewestPluginRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagState, setTagState] = useState<TagState>(() => {
    const tag = searchParams.get("tag");
    return tag ? { [tag]: "in" } : {};
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const growthDays = useMemo(() => {
    if (growthWindowKey === "custom" && customSinceDate) {
      const days = Math.round((Date.now() - new Date(customSinceDate).getTime()) / (24 * 60 * 60 * 1000));
      return Math.min(Math.max(days, 1), 365);
    }
    return Number(growthWindowKey) || 7;
  }, [growthWindowKey, customSinceDate]);

  useEffect(() => {
    setError(null);
    setLoading(true);
    getTopPlugins(period, game)
      .then((res) => setPlugins(res.plugins))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [period, game]);

  useEffect(() => {
    setFastestGrowing(null);
    getFastestGrowingPlugins(100, growthDays, game)
      .then((res) => setFastestGrowing(res.plugins))
      .catch(() => setFastestGrowing([]));
  }, [growthDays, game]);

  useEffect(() => {
    getNewestPlugins(100, game)
      .then((res) => setNewestPlugins(res.plugins))
      .catch(() => setNewestPlugins([]));
  }, [game]);

  useEffect(() => {
    setPage(1);
  }, [entity, growthView, growthWindowKey, customSinceDate, period, query, tagState, pageSize]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const tagFilteredPlugins = useMemo(() => {
    if (!plugins) return null;
    if (Object.keys(tagState).length === 0) return plugins;
    return plugins.filter((p) => matchesTags(p.tags, tagState));
  }, [plugins, tagState]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plugins ?? []) {
      for (const tag of p.tags) counts[tag] = (counts[tag] ?? 0) + 1;
    }
    return counts;
  }, [plugins]);

  const authors = useMemo(() => (tagFilteredPlugins ? aggregateAuthors(tagFilteredPlugins) : null), [tagFilteredPlugins]);

  const filteredPlugins = useMemo(() => {
    if (!tagFilteredPlugins) return null;
    const q = query.trim().toLowerCase();
    if (!q) return tagFilteredPlugins;
    return tagFilteredPlugins.filter((p) => p.name.toLowerCase().includes(q) || p.authorName.toLowerCase().includes(q));
  }, [tagFilteredPlugins, query]);

  const filteredAuthors = useMemo(() => {
    if (!authors) return null;
    const q = query.trim().toLowerCase();
    if (!q) return authors;
    return authors.filter((a) => a.authorName.toLowerCase().includes(q));
  }, [authors, query]);

  const filteredGrowth = useMemo(() => {
    if (!fastestGrowing) return null;
    const q = query.trim().toLowerCase();
    if (!q) return fastestGrowing;
    return fastestGrowing.filter((p) => p.name.toLowerCase().includes(q) || p.authorName.toLowerCase().includes(q));
  }, [fastestGrowing, query]);

  const growthAuthors = useMemo(() => (fastestGrowing ? aggregateGrowthAuthors(fastestGrowing) : null), [fastestGrowing]);

  const filteredGrowthAuthors = useMemo(() => {
    if (!growthAuthors) return null;
    const q = query.trim().toLowerCase();
    if (!q) return growthAuthors;
    return growthAuthors.filter((a) => a.authorName.toLowerCase().includes(q));
  }, [growthAuthors, query]);

  const tagFilteredNewest = useMemo(() => {
    if (!newestPlugins) return null;
    if (Object.keys(tagState).length === 0) return newestPlugins;
    return newestPlugins.filter((p) => matchesTags(p.tags, tagState));
  }, [newestPlugins, tagState]);

  const filteredNewest = useMemo(() => {
    if (!tagFilteredNewest) return null;
    const q = query.trim().toLowerCase();
    if (!q) return tagFilteredNewest;
    return tagFilteredNewest.filter((p) => p.name.toLowerCase().includes(q) || p.authorName.toLowerCase().includes(q));
  }, [tagFilteredNewest, query]);

  const isGrowthAuthors = entity === "growth" && growthView === "authors";

  const totalUnfiltered =
    entity === "plugins"
      ? tagFilteredPlugins?.length ?? 0
      : entity === "authors"
        ? authors?.length ?? 0
        : entity === "new"
          ? tagFilteredNewest?.length ?? 0
          : isGrowthAuthors
            ? growthAuthors?.length ?? 0
            : fastestGrowing?.length ?? 0;
  const rows =
    entity === "plugins"
      ? filteredPlugins
      : entity === "authors"
        ? filteredAuthors
        : entity === "new"
          ? filteredNewest
          : isGrowthAuthors
            ? filteredGrowthAuthors
            : filteredGrowth;
  const total = rows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pagePlugins = filteredPlugins?.slice(pageStart, pageStart + pageSize) ?? null;
  const pageAuthors = filteredAuthors?.slice(pageStart, pageStart + pageSize) ?? null;
  const pageGrowth = filteredGrowth?.slice(pageStart, pageStart + pageSize) ?? null;
  const pageGrowthAuthors = filteredGrowthAuthors?.slice(pageStart, pageStart + pageSize) ?? null;
  const pageNewest = filteredNewest?.slice(pageStart, pageStart + pageSize) ?? null;
  const showLoading = entity === "growth" ? fastestGrowing === null : entity === "new" ? newestPlugins === null : loading;

  function seeAll(nextEntity: Entity, nextPeriod: Period) {
    updateView({ entity: nextEntity, period: nextPeriod });
    setQuery("");
  }

  return (
    <div className="board-head">
      <h1>Leaderboard</h1>
      <p className="subtitle subtitle-sm">
        {game === "runelite" ? "RuneLite plugins, ranked by installs." : "RuneScape plugins on mod.io, ranked by downloads."}
      </p>

      <div className="board-layout">
        <div className="board-main">
          <div className="card">
            <div className="card-edge" />

            <div className="view-tabs" role="tablist">
              <button className={`view-tab ${entity === "plugins" ? "active" : ""}`} role="tab" onClick={() => setEntity("plugins")}>
                Top Plugins
                <span className="view-tab-chip">{plugins?.length ?? "…"}</span>
              </button>
              <button className={`view-tab ${entity === "authors" ? "active" : ""}`} role="tab" onClick={() => setEntity("authors")}>
                Top Authors
                <span className="view-tab-chip">{authors?.length ?? "…"}</span>
              </button>
              <button className={`view-tab ${entity === "growth" ? "active" : ""}`} role="tab" onClick={() => setEntity("growth")}>
                Fastest Growing
                <span className="view-tab-chip">{fastestGrowing?.length ?? "…"}</span>
              </button>
              <button className={`view-tab ${entity === "new" ? "active" : ""}`} role="tab" onClick={() => setEntity("new")}>
                New Releases
                <span className="view-tab-chip">{newestPlugins?.length ?? "…"}</span>
              </button>
            </div>

            <div className="toolbar">
              {entity === "new" ? null : entity === "growth" ? (
                <div className="period-group" role="radiogroup">
                  <button
                    className={`period-btn ${growthView === "plugins" ? "active" : ""}`}
                    title="Fastest-growing plugins"
                    onClick={() => setGrowthView("plugins")}
                  >
                    <span className="period-label">Plugins</span>
                    <span className="period-cap">Growth rate</span>
                  </button>
                  <button
                    className={`period-btn ${growthView === "authors" ? "active" : ""}`}
                    title="Fastest-growing authors"
                    onClick={() => setGrowthView("authors")}
                  >
                    <span className="period-label">Authors</span>
                    <span className="period-cap">Growth rate</span>
                  </button>
                </div>
              ) : (
                <div className="period-group" role="radiogroup">
                  {periods(game).map((p) => (
                    <button
                      key={p.key}
                      className={`period-btn ${period === p.key ? "active" : ""}`}
                      title={p.caption}
                      onClick={() => setPeriod(p.key)}
                    >
                      <span className="period-label">
                        {p.dot && <span className="period-dot" />}
                        {p.label}
                      </span>
                      <span className="period-cap">{p.caption}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="search-group">
                {entity === "growth" && (
                  <>
                    <Dropdown
                      value={growthWindowKey}
                      options={GROWTH_WINDOWS}
                      onChange={setGrowthWindowKey}
                      ariaLabel="Growth window"
                    />
                    {growthWindowKey === "custom" && (
                      <input
                        type="date"
                        className="date-input"
                        aria-label="Since date"
                        value={customSinceDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setCustomSinceDate(e.target.value)}
                      />
                    )}
                  </>
                )}

                <div className="search-box">
                  <SearchBox
                    ref={searchRef}
                    query={query}
                    onQueryChange={setQuery}
                    placeholder={entity === "authors" || isGrowthAuthors ? "Search authors…" : "Search plugins…"}
                  />
                  {entity !== "growth" && game !== "runelite" && (
                    <TagFilter
                      tagState={tagState}
                      onChange={setTagState}
                      tagCounts={tagCounts}
                      matchCount={(entity === "new" ? tagFilteredNewest : tagFilteredPlugins)?.length ?? 0}
                    />
                  )}
                </div>
              </div>
            </div>

            {entity !== "growth" && game !== "runelite" && <TagChips tagState={tagState} onChange={setTagState} />}

            <div className="desc-row">
              <span>
                {entity === "growth"
                  ? `Ranked by growth rate (${game === "runelite" ? "installs" : "downloads + subscribers"}) over the last 7 days.`
                  : entity === "new"
                    ? "Newest plugins first, so new releases get visibility before they've climbed the leaderboard."
                    : periodDescription(period, game)}
              </span>
              <span>{countText(total, totalUnfiltered, query, entity, isGrowthAuthors)}</span>
            </div>

            {error && <p style={{ padding: "0 20px 12px" }}>Failed to load: {error}</p>}

            <div className={`col-header-row ${entity === "growth" ? `growth-cols ${game === "runelite" ? "single-metric" : ""}` : ""}`}>
              <span>#</span>
              <span>{entity === "authors" || isGrowthAuthors ? "Author" : "Plugin"}</span>
              <span>{entity === "authors" || isGrowthAuthors ? "Plugins" : "Author"}</span>
              {entity === "growth" && <span className="value">{game === "runelite" ? "Installs" : "Downloads"}</span>}
              {entity === "growth" && game !== "runelite" && <span className="value">Subscribers</span>}
              <span className="value">{entity === "growth" ? "Growth" : entity === "new" ? "Added" : metricLabel(period, game)}</span>
            </div>

            <div className="row-list">
              {showLoading &&
                Array.from({ length: 8 }, (_, i) => (
                  <div className="skeleton-row" key={i}>
                    <span className="skeleton-bar" style={{ width: 18 }} />
                    <span className="skeleton-bar" style={{ width: "55%" }} />
                    <span className="skeleton-bar" style={{ width: "40%" }} />
                    <span className="skeleton-bar" style={{ width: 70, justifySelf: "end" }} />
                  </div>
                ))}

              {!showLoading && total === 0 && <EmptyState query={query} onClear={() => setQuery("")} />}

              {!showLoading &&
                entity === "plugins" &&
                pagePlugins?.map((row, i) => (
                  <div key={row.id} className="row-grid" onClick={() => navigate(`/plugin/${row.id}`)}>
                    <span className={`cell-rank ${pageStart + i < 3 ? "top" : ""}`}>{pageStart + i + 1}</span>
                    <Link to={`/plugin/${row.id}`} className="cell-name" onClick={(e) => e.stopPropagation()}>
                      {row.name}
                    </Link>
                    <Link to={`/author/${row.authorId}`} className="cell-sub" onClick={(e) => e.stopPropagation()}>
                      {row.authorName}
                    </Link>
                    <span className="cell-value">{formatValue(row.value, period)}</span>
                  </div>
                ))}

              {!showLoading &&
                entity === "authors" &&
                pageAuthors?.map((row, i) => (
                  <div key={row.authorId} className="row-grid" onClick={() => navigate(`/author/${row.authorId}`)}>
                    <span className={`cell-rank ${pageStart + i < 3 ? "top" : ""}`}>{pageStart + i + 1}</span>
                    <span className="cell-name">{row.authorName}</span>
                    <span className="cell-sub">{row.pluginCount}</span>
                    <span className="cell-value">{formatValue(row.value, period)}</span>
                  </div>
                ))}

              {!showLoading &&
                entity === "growth" &&
                !isGrowthAuthors &&
                pageGrowth?.map((row, i) => (
                  <div
                    key={row.id}
                    className={`row-grid growth-cols ${game === "runelite" ? "single-metric" : ""}`}
                    onClick={() => navigate(`/plugin/${row.id}`)}
                  >
                    <span className={`cell-rank ${pageStart + i < 3 ? "top" : ""}`}>{pageStart + i + 1}</span>
                    <Link to={`/plugin/${row.id}`} className="cell-name" onClick={(e) => e.stopPropagation()}>
                      {row.name}
                    </Link>
                    <Link to={`/author/${row.authorId}`} className="cell-sub" onClick={(e) => e.stopPropagation()}>
                      {row.authorName}
                    </Link>
                    <MetricCell current={row.downloadsTotal} change={row.downloadsGain} />
                    {game !== "runelite" && <MetricCell current={row.subscribersTotal} change={row.subscribersGain} />}
                    <span className="cell-value">+{Math.round(row.downloadsGrowthPct)}%</span>
                  </div>
                ))}

              {!showLoading &&
                isGrowthAuthors &&
                pageGrowthAuthors?.map((row, i) => (
                  <div
                    key={row.authorId}
                    className={`row-grid growth-cols ${game === "runelite" ? "single-metric" : ""}`}
                    onClick={() => navigate(`/author/${row.authorId}`)}
                  >
                    <span className={`cell-rank ${pageStart + i < 3 ? "top" : ""}`}>{pageStart + i + 1}</span>
                    <span className="cell-name">{row.authorName}</span>
                    <span className="cell-sub">{row.pluginCount}</span>
                    <MetricCell current={row.downloadsTotal} change={row.downloadsGain} />
                    {game !== "runelite" && <MetricCell current={row.subscribersTotal} change={row.subscribersGain} />}
                    <span className="cell-value">+{Math.round(row.avgGrowthPct)}%</span>
                  </div>
                ))}

              {!showLoading &&
                entity === "new" &&
                pageNewest?.map((row, i) => (
                  <div key={row.id} className="row-grid" onClick={() => navigate(`/plugin/${row.id}`)}>
                    <span className={`cell-rank ${pageStart + i < 3 ? "top" : ""}`}>{pageStart + i + 1}</span>
                    <Link to={`/plugin/${row.id}`} className="cell-name" onClick={(e) => e.stopPropagation()}>
                      {row.name}
                    </Link>
                    <Link to={`/author/${row.authorId}`} className="cell-sub" onClick={(e) => e.stopPropagation()}>
                      {row.authorName}
                    </Link>
                    <span className="cell-value">{formatDate(row.dateAdded)}</span>
                  </div>
                ))}
            </div>

            {!showLoading && total > 0 && (
              <Pagination
                page={currentPage}
                pageCount={pageCount}
                total={total}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
              />
            )}
          </div>
        </div>

        <aside className="board-aside">
          <HotCard title="Hot plugins" kind="plugins" onSeeAll={(p) => seeAll("plugins", p)} />
          <HotCard title="Hot authors" kind="authors" onSeeAll={(p) => seeAll("authors", p)} />
        </aside>
      </div>
    </div>
  );
}

function aggregateGrowthAuthors(plugins: FastestGrowingPlugin[]): GrowthAuthor[] {
  const byAuthor = new Map<number, GrowthAuthor>();
  for (const p of plugins) {
    const existing = byAuthor.get(p.authorId);
    if (existing) {
      existing.pluginCount += 1;
      existing.downloadsTotal += p.downloadsTotal;
      existing.subscribersTotal += p.subscribersTotal;
      existing.downloadsGain += p.downloadsGain;
      existing.subscribersGain += p.subscribersGain;
      existing.avgGrowthPct += p.downloadsGrowthPct;
      existing.growthScore += p.growthScore;
    } else {
      byAuthor.set(p.authorId, {
        authorId: p.authorId,
        authorName: p.authorName,
        pluginCount: 1,
        downloadsTotal: p.downloadsTotal,
        subscribersTotal: p.subscribersTotal,
        downloadsGain: p.downloadsGain,
        subscribersGain: p.subscribersGain,
        avgGrowthPct: p.downloadsGrowthPct,
        growthScore: p.growthScore,
      });
    }
  }
  const result = Array.from(byAuthor.values());
  for (const a of result) a.avgGrowthPct = a.avgGrowthPct / a.pluginCount;
  return result.sort((a, b) => b.growthScore - a.growthScore);
}

function aggregateAuthors(plugins: PluginLeaderboardRow[]): AuthorLeaderboardRow[] {
  const byAuthor = new Map<number, AuthorLeaderboardRow>();
  for (const plugin of plugins) {
    const existing = byAuthor.get(plugin.authorId);
    if (existing) {
      existing.value += plugin.value;
      existing.pluginCount += 1;
    } else {
      byAuthor.set(plugin.authorId, {
        authorId: plugin.authorId,
        authorName: plugin.authorName,
        pluginCount: 1,
        value: plugin.value,
      });
    }
  }
  return Array.from(byAuthor.values()).sort((a, b) => b.value - a.value);
}

function MetricCell({ current, change }: { current: number; change: number }) {
  return (
    <span className="cell-metric">
      <span className="cell-metric-current">{current.toLocaleString()}</span>
      <span className="cell-metric-change">
        {change >= 0 ? "+" : ""}
        {change.toLocaleString()}
      </span>
    </span>
  );
}

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="empty-state">
      <img src="/logo/icon-2a-hex.svg" alt="" />
      {query ? (
        <>
          <div className="empty-title">No matches for &ldquo;{query}&rdquo;</div>
          <p className="subtitle" style={{ margin: 0 }}>
            Try a different plugin or author name.
          </p>
          <button className="page-btn" onClick={onClear}>
            Clear search
          </button>
        </>
      ) : (
        <p style={{ margin: 0 }}>No matches for this filter.</p>
      )}
    </div>
  );
}

function metricLabel(period: Period, game: Game): string {
  const noun = game === "runelite" ? "Installs" : "Downloads";
  if (period === "alltime") return `${noun} (all-time)`;
  if (period === "hot") return `${noun} today`;
  if (period === "weekly") return "Gained this week";
  return "Gained last 30 days";
}

function formatValue(value: number, period: Period): string {
  const gain = period === "weekly" || period === "monthly";
  return gain ? `${value >= 0 ? "+" : ""}${value.toLocaleString()}` : value.toLocaleString();
}

function periodDescription(period: Period, game: Game): string {
  const noun = game === "runelite" ? "installs" : "downloads";
  if (period === "alltime") return `Lifetime ${noun} leaderboard.`;
  if (period === "hot") return `${capitalize(noun)} recorded today.`;
  if (period === "weekly") return `${capitalize(noun)} gained ${dateRangeLabel(7)}`;
  return `${capitalize(noun)} gained ${dateRangeLabel(30)}`;
}

function dateRangeLabel(days: number): string {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

function countText(filteredCount: number, totalCount: number, query: string, entity: Entity, isGrowthAuthors: boolean): string {
  const noun = entity === "growth" ? (isGrowthAuthors ? "authors" : "plugins") : entity === "new" ? "plugins" : entity;
  if (query) return `${filteredCount} of ${totalCount} ${noun}`;
  return `${totalCount} ${noun}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

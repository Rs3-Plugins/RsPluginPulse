import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getPluginTrend, getTopPlugins, type PluginLeaderboardRow, type PluginMeta, type PluginTrendPoint } from "../api";
import { TrendChart, trendMetrics, type ChartType, type TrendMetric } from "../components/TrendChart";
import { useGame } from "../context/GameContext";
import { AvatarImg } from "../components/AvatarImg";
import { slugifyTag } from "../lib/slug";

type RangePreset = "7d" | "30d" | "90d" | "all" | "custom";

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: "line", label: "Line" },
  { key: "bar", label: "Bar" },
];

const RANGE_PRESETS: { key: RangePreset; label: string; days: number | null }[] = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "all", label: "All", days: null },
];

const METRIC_KEYS: TrendMetric[] = ["downloadsTotal", "downloadsToday", "subscribersTotal"];
const CHART_TYPE_KEYS = CHART_TYPES.map((t) => t.key);
const RANGE_PRESET_KEYS = [...RANGE_PRESETS.map((p) => p.key), "custom"];

function parseMetric(v: string | null): TrendMetric {
  return (METRIC_KEYS as string[]).includes(v ?? "") ? (v as TrendMetric) : "downloadsTotal";
}
function parseChartType(v: string | null): ChartType {
  return (CHART_TYPE_KEYS as string[]).includes(v ?? "") ? (v as ChartType) : "line";
}
function parsePreset(v: string | null): RangePreset {
  return (RANGE_PRESET_KEYS as string[]).includes(v ?? "") ? (v as RangePreset) : "30d";
}

export function PluginTrend() {
  const { id } = useParams<{ id: string }>();
  const { setGame } = useGame();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plugin, setPlugin] = useState<PluginMeta | null>(null);
  const [points, setPoints] = useState<PluginTrendPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The URL is the single source of truth for metric/range/chart type,
  // same pattern as the leaderboard, so links to a specific view are shareable.
  const metric = parseMetric(searchParams.get("metric"));
  const chartType = parseChartType(searchParams.get("chart"));
  const preset = parsePreset(searchParams.get("range"));
  const customStart = preset === "custom" ? searchParams.get("from") ?? "" : "";
  const customEnd = preset === "custom" ? searchParams.get("to") ?? "" : "";

  function updateView(next: { metric?: TrendMetric; chartType?: ChartType; preset?: RangePreset; customStart?: string; customEnd?: string }) {
    const nextMetric = next.metric ?? metric;
    const nextChartType = next.chartType ?? chartType;
    const nextPreset = next.preset ?? preset;
    const nextCustomStart = next.customStart ?? customStart;
    const nextCustomEnd = next.customEnd ?? customEnd;

    const params = new URLSearchParams();
    if (nextMetric !== "downloadsTotal") params.set("metric", nextMetric);
    if (nextChartType !== "line") params.set("chart", nextChartType);
    if (nextPreset !== "30d") params.set("range", nextPreset);
    if (nextPreset === "custom" && nextCustomStart) params.set("from", nextCustomStart);
    if (nextPreset === "custom" && nextCustomEnd) params.set("to", nextCustomEnd);
    setSearchParams(params, { replace: true });
  }

  function setMetric(m: TrendMetric) {
    updateView({ metric: m });
  }
  function setChartType(c: ChartType) {
    updateView({ chartType: c });
  }

  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [hotRank, setHotRank] = useState<number | null>(null);
  const [hotPlugins, setHotPlugins] = useState<PluginLeaderboardRow[] | null>(null);
  const [allPlugins, setAllPlugins] = useState<PluginLeaderboardRow[] | null>(null);
  const [showSimilarModal, setShowSimilarModal] = useState(false);
  const [hoveredAuthorIndex, setHoveredAuthorIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    getPluginTrend(Number(id))
      .then((res) => {
        setPlugin(res.plugin);
        setPoints(res.trend);
        setGame(res.plugin.game);

        getTopPlugins("hot", res.plugin.game, 15)
          .then((hotRes) => {
            const rank = hotRes.plugins.findIndex((p) => p.id === Number(id));
            setHotRank(rank !== -1 && rank < 10 ? rank + 1 : null);
            setHotPlugins(hotRes.plugins);
          })
          .catch(() => {});

        getTopPlugins("alltime", res.plugin.game)
          .then((allRes) => setAllPlugins(allRes.plugins))
          .catch(() => setAllPlugins([]));
      })
      .catch((err) => setError(String(err)));
  }, [id, setGame]);

  const allTimeRank = useMemo(() => {
    if (!allPlugins || !plugin) return null;
    const index = allPlugins.findIndex((p) => p.id === plugin.id);
    return index === -1 ? null : index + 1;
  }, [allPlugins, plugin]);

  const similarPlugins = useMemo(() => {
    if (!allPlugins || !plugin) return [];
    return allPlugins
      .filter((p) => p.id !== plugin.id)
      .map((p) => ({ plugin: p, shared: p.tags.filter((t) => plugin.tags.includes(t)).length }))
      .filter((p) => p.shared > 0)
      .sort((a, b) => b.shared - a.shared || b.plugin.value - a.plugin.value)
      .slice(0, 4);
  }, [allPlugins, plugin]);

  function selectPreset(key: RangePreset) {
    if (key === "custom") {
      setDraftStart(customStart);
      setDraftEnd(customEnd);
      setCustomOpen(true);
      return;
    }
    updateView({ preset: key, customStart: "", customEnd: "" });
    setCustomOpen(false);
  }

  function applyCustom() {
    if (!draftStart || !draftEnd || draftStart > draftEnd) return;
    updateView({ preset: "custom", customStart: draftStart, customEnd: draftEnd });
    setCustomOpen(false);
  }

  const filteredPoints = useMemo(() => {
    if (!points) return points;

    let start: number | null = null;
    let end: number | null = null;

    if (preset === "custom" && customStart && customEnd) {
      start = new Date(customStart).getTime();
      end = new Date(customEnd).getTime() + 24 * 60 * 60 * 1000 - 1;
    } else {
      const activeDays = RANGE_PRESETS.find((p) => p.key === preset)?.days ?? null;
      if (activeDays !== null) start = Date.now() - activeDays * 24 * 60 * 60 * 1000;
    }

    return points.filter((p) => {
      const t = new Date(p.capturedAt).getTime();
      if (start !== null && t < start) return false;
      if (end !== null && t > end) return false;
      return true;
    });
  }, [points, preset, customStart, customEnd]);

  if (error) {
    return (
      <div className="page">
        <Link to="/" className="back-link">
          ← Back to leaderboard
        </Link>
        <p>Failed to load: {error}</p>
      </div>
    );
  }

  if (!plugin || !points) {
    return (
      <div className="page">
        <Link to="/" className="back-link">
          ← Back to leaderboard
        </Link>

        <div className="card plugin-profile-card">
          <div className="card-edge" />
          <div className="plugin-profile-head">
            <div className="plugin-logo-col">
              <div className="plugin-logo-frame">
                <div className="skeleton-bar" style={{ width: "100%", height: "100%", borderRadius: 7 }} />
              </div>
            </div>
            <div className="author-profile-info">
              <div className="author-profile-title">
                <span className="skeleton-bar" style={{ width: 220, height: 22 }} />
              </div>
              <span className="skeleton-bar" style={{ width: "90%", height: 14 }} />
              <div className="author-badges">
                <span className="skeleton-bar" style={{ width: 80, height: 20, borderRadius: 999 }} />
                <span className="skeleton-bar" style={{ width: 100, height: 20, borderRadius: 999 }} />
              </div>
            </div>
          </div>
        </div>

        <div className="metric-tiles">
          {Array.from({ length: 3 }, (_, i) => (
            <div className="metric-tile" key={i}>
              <span className="skeleton-bar" style={{ width: "50%", height: 11 }} />
              <span className="skeleton-bar" style={{ width: "40%", height: 26 }} />
              <span className="skeleton-bar" style={{ width: "60%", height: 12 }} />
            </div>
          ))}
        </div>

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
      </div>
    );
  }

  const metrics = trendMetrics(plugin.game);
  const activeMetric = metrics.find((m) => m.key === metric)!;
  const last = points[points.length - 1];
  const tiles = metrics.map((m) => ({ ...m, ...tileValueAndSub(points, m.key) }));
  const rangeLabel = describeRange(preset, customStart, customEnd, points);
  const customButtonLabel = preset === "custom" && customStart && customEnd ? formatCustomRangeLabel(customStart, customEnd) : null;
  const compareIds = [plugin.id, ...(hotPlugins ?? []).filter((p) => p.id !== plugin.id).slice(0, 2).map((p) => p.id)];
  const compact = plugin.game === "runelite";
  const authorEntries = plugin.coAuthors;
  const MAX_STACKED_AVATARS = 4;
  const actionButtons = (
    <div className={`plugin-profile-actions ${compact ? "horizontal" : ""}`}>
      <Link className="plugin-action-btn" to={`/compare?tab=compare&type=plugin&pids=${compareIds.join(",")}`}>
        Compare
      </Link>
      <Link className="plugin-action-btn" to={`/api?tab=badge&type=plugin&id=${plugin.id}`}>
        View badge
      </Link>
      <Link className="plugin-action-btn" to={`/api?tab=embed&type=plugin&id=${plugin.id}`}>
        View card
      </Link>
      {similarPlugins.length > 0 && (
        <button className="plugin-action-btn" onClick={() => setShowSimilarModal(true)}>
          Similar plugins →
        </button>
      )}
    </div>
  );

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Back to leaderboard
      </Link>

      <div className="card plugin-profile-card">
        <div className="card-edge" />
        <div className="plugin-profile-head">
          <div className={`plugin-logo-col ${compact ? "compact" : ""}`}>
            <div className={`plugin-logo-frame ${compact ? "compact" : ""}`}>
              {plugin.logoUrl ? (
                <img src={plugin.logoUrl} alt="" className="plugin-logo-img" />
              ) : (
                <div className="plugin-logo-fallback brand-font">{initials(plugin.name)}</div>
              )}
            </div>
            <div className="plugin-logo-meta">
              {authorEntries.length > 1 ? (
                <div className="plugin-author-chip">
                  <span className="plugin-author-avatar-stack">
                    {authorEntries.slice(0, MAX_STACKED_AVATARS).map((entry, i) => (
                      <span
                        key={i}
                        className={`plugin-author-avatar stacked ${hoveredAuthorIndex === i ? "highlighted" : ""} ${hoveredAuthorIndex !== null && hoveredAuthorIndex !== i ? "dimmed" : ""}`}
                      >
                        <AvatarImg
                          src={entry.avatarUrl}
                          fallbackText={initials(entry.name)}
                          imgClassName="plugin-author-avatar-img"
                          fallbackClassName="plugin-author-avatar-fallback brand-font"
                        />
                      </span>
                    ))}
                    {authorEntries.length > MAX_STACKED_AVATARS && (
                      <span className="plugin-author-avatar stacked plugin-author-avatar-overflow">
                        +{authorEntries.length - MAX_STACKED_AVATARS}
                      </span>
                    )}
                  </span>
                  <span className="plugin-author-name">
                    {authorEntries.map((entry, i) => (
                      <span
                        key={i}
                        onMouseEnter={() => setHoveredAuthorIndex(i)}
                        onMouseLeave={() => setHoveredAuthorIndex(null)}
                      >
                        {i > 0 && ", "}
                        <Link to={`/author/${entry.authorId}`} className="plugin-author-name-link">
                          {entry.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                </div>
              ) : (
                <Link to={`/author/${plugin.authorId}`} className="plugin-author-chip">
                  <span className="plugin-author-avatar">
                    {plugin.authorAvatarUrl ? (
                      <img src={plugin.authorAvatarUrl} alt="" className="plugin-author-avatar-img" />
                    ) : (
                      <span className="plugin-author-avatar-fallback brand-font">{initials(plugin.authorName)}</span>
                    )}
                  </span>
                  <span className="plugin-author-name">{plugin.authorName}</span>
                </Link>
              )}
              <div className="plugin-logo-meta-dates">
                <div className="plugin-logo-meta-row">
                  <span className="plugin-logo-meta-label">Added</span>
                  <span className="plugin-logo-meta-value">{formatDate(plugin.dateAdded)}</span>
                </div>
                <div className="plugin-logo-meta-row">
                  <span className="plugin-logo-meta-label">Updated</span>
                  <span className="plugin-logo-meta-value">{formatDate(plugin.dateUpdated)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="author-profile-info">
            <div className="author-profile-title">
              <h1 className="brand-font">{plugin.name}</h1>
              {allTimeRank !== null && <span className="rank-badge">#{allTimeRank} all-time</span>}
              {hotRank !== null && <span className="hot-now-badge">#{hotRank} HOT NOW</span>}
              <a href={plugin.profileUrl} target="_blank" rel="noopener" className="author-mod-link">
                {plugin.game === "runelite" ? "View on plugin hub ↗" : "View on mod.io ↗"}
              </a>
            </div>
            {plugin.summary && <p className="plugin-summary">{plugin.summary}</p>}
            {plugin.tags.length > 0 && (
              <div className="author-badges">
                {plugin.tags.map((tag) => (
                  <Link key={tag} to={`/tags/${slugifyTag(tag)}`} className="author-badge author-badge-link">
                    {tag}
                  </Link>
                ))}
              </div>
            )}
            {compact && actionButtons}
            {plugin.game !== "runelite" &&
              (plugin.ratingsTotal > 0 ? (
                <div className="plugin-rating">
                  <div className="plugin-rating-top">
                    <span className={`plugin-rating-label ${plugin.ratingsPercentagePositive < 40 ? "negative" : ""}`}>
                      {plugin.ratingsDisplayText}
                    </span>
                    <span className="plugin-rating-pct">{plugin.ratingsPercentagePositive}%</span>
                  </div>
                  <div className="plugin-rating-track">
                    <div
                      className={`plugin-rating-fill ${plugin.ratingsPercentagePositive < 40 ? "negative" : ""}`}
                      style={{ width: `${plugin.ratingsPercentagePositive}%` }}
                    />
                  </div>
                  <div className="plugin-rating-counts">
                    <span className="plugin-rating-count">
                      <ThumbUpIcon />
                      {plugin.ratingsPositive.toLocaleString()}
                    </span>
                    <span className="plugin-rating-count">
                      <ThumbDownIcon />
                      {plugin.ratingsNegative.toLocaleString()}
                    </span>
                    <span className="plugin-rating-total">{plugin.ratingsTotal.toLocaleString()} ratings</span>
                  </div>
                </div>
              ) : (
                <span className="plugin-rating-empty">No ratings yet</span>
              ))}
          </div>
          {!compact && actionButtons}
        </div>
      </div>

      <div className="metric-tiles" role="radiogroup" aria-label="Metric">
        {tiles.map((t) => (
          <button key={t.key} className={`metric-tile ${metric === t.key ? "active" : ""}`} onClick={() => setMetric(t.key)}>
            <span className="metric-tile-top">
              <span className="metric-tile-label">{t.label}</span>
              {metric === t.key ? (
                <span className="metric-tile-charted">
                  <span className="metric-tile-charted-swatch" />
                  Charted
                </span>
              ) : (
                <span className="metric-tile-hint">Show on chart →</span>
              )}
            </span>
            <span className="metric-tile-value">{last[t.key].toLocaleString()}</span>
            <span className="metric-tile-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-edge" />
        <div className="chart-card-head">
          <div className="chart-card-title">
            <span className="chart-metric-label">{activeMetric.label}</span>
            <span className="chart-range-text">{rangeLabel}</span>
          </div>
          <div className="chart-controls">
            <div className="period-group" role="radiogroup" aria-label="Range">
              {RANGE_PRESETS.map((p) => (
                <button key={p.key} className={`range-btn ${preset === p.key ? "active" : ""}`} onClick={() => selectPreset(p.key)}>
                  {p.label}
                </button>
              ))}
              <button className={`range-btn ${preset === "custom" ? "active" : ""}`} onClick={() => selectPreset("custom")}>
                <CalendarIcon />
                {customButtonLabel ?? "Custom"}
              </button>
            </div>
            <div className="period-group" role="radiogroup" aria-label="Chart type">
              {CHART_TYPES.map((t) => (
                <button key={t.key} className={`range-btn ${chartType === t.key ? "active" : ""}`} onClick={() => setChartType(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="period-group" role="group" aria-label="Export">
              <button className="range-btn" onClick={() => downloadTrend(filteredPoints ?? points, plugin.name, "csv")}>
                Export CSV
              </button>
              <button className="range-btn" onClick={() => downloadTrend(filteredPoints ?? points, plugin.name, "json")}>
                Export JSON
              </button>
            </div>
          </div>
        </div>

        {customOpen && (
          <div className="custom-range-panel">
            <label className="custom-range-field">
              <span className="custom-range-label">From</span>
              <input type="date" className="date-input" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} />
            </label>
            <span className="custom-range-arrow">→</span>
            <label className="custom-range-field">
              <span className="custom-range-label">To</span>
              <input type="date" className="date-input" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} />
            </label>
            <div className="custom-range-quick">
              <button
                className="quick-chip"
                onClick={() => {
                  setDraftStart(plugin.dateAdded.slice(0, 10));
                  setDraftEnd(new Date().toISOString().slice(0, 10));
                }}
              >
                Since release
              </button>
              <button
                className="quick-chip"
                onClick={() => {
                  setDraftStart(`${new Date().getFullYear()}-01-01`);
                  setDraftEnd(new Date().toISOString().slice(0, 10));
                }}
              >
                This year
              </button>
            </div>
            <div className="custom-range-actions">
              {draftStart && draftEnd && draftStart > draftEnd && <span className="custom-range-hint error">Start date must be before end date</span>}
              <button className="theme-toggle" onClick={() => setCustomOpen(false)}>
                Cancel
              </button>
              <button className="legal-ok" disabled={!draftStart || !draftEnd || draftStart > draftEnd} onClick={applyCustom}>
                Apply range
              </button>
            </div>
          </div>
        )}

        <div style={{ padding: "8px clamp(8px, 3vw, 20px) 14px" }}>
          {filteredPoints && <TrendChart points={filteredPoints} metric={metric} unit={activeMetric.unit} chartType={chartType} />}
        </div>
      </div>

      {showSimilarModal && (
        <div className="legal-overlay" onClick={() => setShowSimilarModal(false)}>
          <div role="dialog" aria-modal="true" className="legal-dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="card-edge" />
            <div className="legal-dialog-header">
              <h2>Similar plugins</h2>
              <button className="legal-close" aria-label="Close" onClick={() => setShowSimilarModal(false)}>
                ×
              </button>
            </div>
            <div className="legal-body similar-plugins-modal-body">
              {similarPlugins.map(({ plugin: p, shared }) => (
                <Link key={p.id} to={`/plugin/${p.id}`} className="similar-plugin-row" onClick={() => setShowSimilarModal(false)}>
                  <span className="similar-plugin-name">{p.name}</span>
                  <span className="similar-plugin-sub">
                    by {p.authorName} · {shared} shared tag{shared === 1 ? "" : "s"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function downloadTrend(points: PluginTrendPoint[], pluginName: string, format: "csv" | "json") {
  const slug = pluginName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  let blob: Blob;
  let filename: string;
  if (format === "json") {
    blob = new Blob([JSON.stringify(points, null, 2)], { type: "application/json" });
    filename = `${slug}-trend.json`;
  } else {
    const header = "captured_at,downloads_total,downloads_today,subscribers_total";
    const rows = points.map((p) => `${p.capturedAt},${p.downloadsTotal},${p.downloadsToday},${p.subscribersTotal}`);
    blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    filename = `${slug}-trend.csv`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14">
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 6H12.5M4.5 1V4M9.5 1V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M6 7V14H3.5C2.95 14 2.5 13.55 2.5 13V8C2.5 7.45 2.95 7 3.5 7H6ZM6 7L9 2.5C9.8 2.5 10.5 3.2 10.5 4V6H12.5C13.3 6 13.9 6.75 13.7 7.55L12.6 12.55C12.45 13.35 11.75 14 10.9 14H6" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M6 9V2H3.5C2.95 2 2.5 2.45 2.5 3V8C2.5 8.55 2.95 9 3.5 9H6ZM6 9L9 13.5C9.8 13.5 10.5 12.8 10.5 12V10H12.5C13.3 10 13.9 9.25 13.7 8.45L12.6 3.45C12.45 2.65 11.75 2 10.9 2H6" />
    </svg>
  );
}

function tileValueAndSub(points: PluginTrendPoint[], metric: TrendMetric): { sub: string } {
  const last = points[points.length - 1];

  if (metric === "downloadsTotal") {
    const gain = last.downloadsTotal - findPointNear(points, 7).downloadsTotal;
    return { sub: `${gain >= 0 ? "+" : ""}${gain.toLocaleString()} this week` };
  }
  if (metric === "downloadsToday") {
    const yesterday = findPointNear(points, 1).downloadsToday;
    return { sub: `${yesterday.toLocaleString()} yesterday` };
  }
  const gain = last.subscribersTotal - findPointNear(points, 30).subscribersTotal;
  return { sub: `${gain >= 0 ? "+" : ""}${gain.toLocaleString()} last 30 days` };
}

function findPointNear(points: PluginTrendPoint[], daysAgo: number): PluginTrendPoint {
  const cutoff = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  let candidate: PluginTrendPoint | null = null;
  for (const p of points) {
    if (new Date(p.capturedAt).getTime() <= cutoff) candidate = p;
  }
  return candidate ?? points[0];
}

function describeRange(preset: RangePreset, customStart: string, customEnd: string, points: PluginTrendPoint[]): string {
  if (preset === "custom" && customStart && customEnd) {
    return formatCustomRangeLabel(customStart, customEnd, true);
  }
  const first = new Date(points[0].capturedAt);
  const last = new Date(points[points.length - 1].capturedAt);
  const days = Math.max(1, Math.round((last.getTime() - first.getTime()) / (24 * 60 * 60 * 1000)));
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(first)} – ${fmt(last)} · ${days} days`;
}

function formatCustomRangeLabel(start: string, end: string, long = false): string {
  const fmt = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (!long) return `${fmt(start)} – ${fmt(end)}`;
  const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000)));
  return `${fmt(start)} – ${fmt(end)} · ${days} days`;
}

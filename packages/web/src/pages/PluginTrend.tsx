import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  API_BASE,
  getGameUpdates,
  getPluginReleases,
  getPluginTrend,
  getSpecialEvents,
  getTopPlugins,
  type GameUpdate,
  type PluginLeaderboardRow,
  type PluginMeta,
  type PluginRelease,
  type PluginTrendPoint,
  type SpecialEvent,
} from "../api";
import { TrendChart, trendMetrics, type TrendMetric } from "../components/TrendChart";
import { useGame } from "../context/GameContext";
import { AvatarImg } from "../components/AvatarImg";
import { slugifyTag } from "../lib/slug";
import { authorHref, pluginHref } from "../lib/links";
import { usePageMeta } from "../hooks/usePageMeta";

const METRIC_KEYS: TrendMetric[] = ["downloadsTotal", "downloadsToday", "subscribersTotal"];

function parseMetric(v: string | null): TrendMetric {
  return (METRIC_KEYS as string[]).includes(v ?? "") ? (v as TrendMetric) : "downloadsTotal";
}

export function PluginTrend() {
  const { id } = useParams<{ id: string }>();
  const { game, setGame } = useGame();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plugin, setPlugin] = useState<PluginMeta | null>(null);
  const [points, setPoints] = useState<PluginTrendPoint[] | null>(null);
  const [gameUpdates, setGameUpdates] = useState<GameUpdate[]>([]);
  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [releases, setReleases] = useState<PluginRelease[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Metric is the one piece of chart state this page still owns directly
  // (the tiles live outside the chart card) -- everything else (range,
  // zoom, chart type, annotation layers, sensitivity) is read once from
  // and reported back to this same URL by TrendChart itself.
  //
  // Both setMetric and handleChartParamsChange use setSearchParams's
  // functional-updater form (prev => next), not a `new URLSearchParams
  // (searchParams)` closing over the `searchParams` already in scope --
  // TrendChart's own URL-sync effect doesn't (and shouldn't) list this
  // callback in its dependency array, so a stale closure here would
  // otherwise silently roll back whichever param changed more recently
  // between a metric-tile click and a chart interaction.
  const metric = parseMetric(searchParams.get("metric"));
  function setMetric(m: TrendMetric) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (m !== "downloadsTotal") next.set("metric", m);
        else next.delete("metric");
        return next;
      },
      { replace: true },
    );
  }
  function handleChartParamsChange(patch: Record<string, string | null>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  const [hotRank, setHotRank] = useState<number | null>(null);
  const [hotPlugins, setHotPlugins] = useState<PluginLeaderboardRow[] | null>(null);
  const [allPlugins, setAllPlugins] = useState<PluginLeaderboardRow[] | null>(null);
  const [showSimilarModal, setShowSimilarModal] = useState(false);
  const [hoveredAuthorIndex, setHoveredAuthorIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    getPluginTrend(id, game)
      .then((res) => {
        setPlugin(res.plugin);
        setPoints(res.trend);
        setGame(res.plugin.game);

        getPluginReleases(res.pluginId, res.plugin.game)
          .then((releasesRes) => setReleases(releasesRes.releases))
          .catch(() => setReleases([]));

        if (res.trend.length > 0) {
          const from = res.trend[0].capturedAt.slice(0, 10);
          const to = res.trend[res.trend.length - 1].capturedAt.slice(0, 10);
          getGameUpdates(res.plugin.game, from, to)
            .then((updatesRes) => setGameUpdates(updatesRes.updates))
            .catch(() => setGameUpdates([]));
          getSpecialEvents(res.plugin.game, from, to)
            .then((eventsRes) => setSpecialEvents(eventsRes.events))
            .catch(() => setSpecialEvents([]));
        }

        getTopPlugins("hot", res.plugin.game, 15)
          .then((hotRes) => {
            const rank = hotRes.plugins.findIndex((p) => p.id === res.pluginId);
            setHotRank(rank !== -1 && rank < 10 ? rank + 1 : null);
            setHotPlugins(hotRes.plugins);
          })
          .catch(() => {});

        getTopPlugins("alltime", res.plugin.game)
          .then((allRes) => setAllPlugins(allRes.plugins))
          .catch(() => setAllPlugins([]));
      })
      .catch((err) => setError(String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, setGame]);

  const latestPoint = points && points.length > 0 ? points[points.length - 1] : null;
  usePageMeta({
    title: plugin ? `${plugin.name} by ${plugin.authorName} — RuneScape PluginPulse` : "RuneScape PluginPulse",
    description: plugin
      ? `${plugin.summary || "Download trends and stats"}${
          latestPoint ? ` — ${latestPoint.downloadsTotal.toLocaleString()} ${plugin.game === "runelite" ? "installs" : "downloads"}.` : "."
        }`
      : "Plugin download trends and stats on RuneScape PluginPulse.",
    canonicalPath: plugin ? (plugin.game === "runescape" ? `/plugin/${plugin.nameId}` : `/plugin/${plugin.nameId}?game=${plugin.game}`) : `/plugin/${id ?? ""}`,
    image: plugin ? `${API_BASE}/api/card/plugin/${plugin.id}.png` : undefined,
    jsonLd:
      plugin && latestPoint
        ? {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: plugin.name,
            author: { "@type": "Person", name: plugin.authorName },
            applicationCategory: "GameApplication",
            operatingSystem: plugin.game === "runelite" ? "RuneLite" : "RuneScape",
            description: plugin.summary || undefined,
            url: `https://rspluginpulse.com${pluginHref(plugin.nameId, plugin.game as "runescape" | "osrs" | "runelite")}`,
            interactionStatistic: {
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/InstallAction",
              userInteractionCount: latestPoint.downloadsTotal,
            },
          }
        : undefined,
  });

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
                        <Link to={authorHref(entry.nameId, game)} className="plugin-author-name-link">
                          {entry.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                </div>
              ) : (
                <Link to={authorHref(plugin.authorNameId, game)} className="plugin-author-chip">
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

      <TrendChart
        points={points}
        metric={metric}
        scoreMetric={plugin.game === "runelite" ? "downloadsTotal" : "downloadsToday"}
        metricLabel={activeMetric.label}
        unit={activeMetric.unit}
        pluginName={plugin.name}
        initialParams={searchParams}
        onParamsChange={handleChartParamsChange}
        gameUpdates={gameUpdates}
        specialEvents={specialEvents}
        releases={releases}
      />

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
                <Link key={p.id} to={pluginHref(p.nameId, game)} className="similar-plugin-row" onClick={() => setShowSimilarModal(false)}>
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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


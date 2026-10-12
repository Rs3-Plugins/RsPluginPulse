import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getAuthorProfile, getPluginTrend, type AuthorProfile } from "../api";
import { useGame, type Game } from "../context/GameContext";

type SortKey = "downloads" | "week" | "subs" | "newest";

function sorts(game: Game): { key: SortKey; label: string }[] {
  if (game === "runelite") {
    return [
      { key: "downloads", label: "Most installed" },
      { key: "week", label: "Hot this week" },
      { key: "newest", label: "Newest" },
    ];
  }
  return [
    { key: "downloads", label: "Most downloaded" },
    { key: "week", label: "Hot this week" },
    { key: "subs", label: "Subscribers" },
    { key: "newest", label: "Newest" },
  ];
}

const SORT_KEYS: SortKey[] = ["downloads", "week", "subs", "newest"];

function parseSort(v: string | null): SortKey {
  return (SORT_KEYS as string[]).includes(v ?? "") ? (v as SortKey) : "downloads";
}

export function AuthorPage() {
  const { id } = useParams<{ id: string }>();
  const { setGame } = useGame();
  const [searchParams, setSearchParams] = useSearchParams();
  const [author, setAuthor] = useState<AuthorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sort = parseSort(searchParams.get("sort"));
  const [sparklines, setSparklines] = useState<Record<number, string | null>>({});

  function setSort(next: SortKey) {
    const params = new URLSearchParams();
    if (next !== "downloads") params.set("sort", next);
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    if (!id) return;
    setAuthor(null);
    setError(null);
    getAuthorProfile(Number(id))
      .then((res) => {
        setAuthor(res);
        setGame(res.game);
      })
      .catch((err) => setError(String(err)));
  }, [id, setGame]);

  useEffect(() => {
    if (!author) return;
    let cancelled = false;
    Promise.all(
      author.plugins.map(async (p) => {
        try {
          const { trend } = await getPluginTrend(p.id);
          const points = trend.slice(-30).map((t) => t.downloadsTotal);
          return [p.id, points.length >= 2 ? sparklinePath(points, 84, 24) : null] as const;
        } catch {
          return [p.id, null] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setSparklines(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [author]);

  const sortedPlugins = useMemo(() => {
    if (!author) return [];
    const list = [...author.plugins];
    if (sort === "downloads") list.sort((a, b) => b.downloadsTotal - a.downloadsTotal);
    else if (sort === "week") list.sort((a, b) => b.weeklyGain - a.weeklyGain);
    else if (sort === "subs") list.sort((a, b) => b.subscribersTotal - a.subscribersTotal);
    else list.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
    return list;
  }, [author, sort]);

  if (error) {
    return (
      <div className="page">
        <Link to="/" className="back-link">
          ← Back to leaderboard
        </Link>
        <p>Failed to load author: {error}</p>
      </div>
    );
  }

  if (!author) {
    return (
      <div className="page">
        <Link to="/" className="back-link">
          ← Back to leaderboard
        </Link>

        <div className="card author-profile-card">
          <div className="card-edge" />
          <div className="author-profile-head">
            <div className="author-avatar-ring">
              <div className="skeleton-bar" style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
            </div>
            <div className="author-profile-info">
              <div className="author-profile-title">
                <span className="skeleton-bar" style={{ width: 160, height: 22 }} />
              </div>
              <div className="author-badges">
                <span className="skeleton-bar" style={{ width: 90, height: 20, borderRadius: 999 }} />
                <span className="skeleton-bar" style={{ width: 120, height: 20, borderRadius: 999 }} />
              </div>
            </div>
          </div>
          <div className="author-stats-strip">
            {Array.from({ length: 4 }, (_, i) => (
              <div className="author-stat" key={i}>
                <span className="skeleton-bar" style={{ width: 90, height: 11 }} />
                <span className="skeleton-bar" style={{ width: 70, height: 22 }} />
              </div>
            ))}
          </div>
        </div>

        <div className="card author-plugins-card">
          <div className="author-col-header">
            <span>#</span>
            <span>Plugin</span>
            <span>30 days</span>
            <span className="value">Downloads</span>
            <span className="value">This week</span>
            <span className="value">Subscribers</span>
            <span>Share</span>
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div className="author-plugin-row" key={i}>
              <span className="skeleton-bar" style={{ width: 14 }} />
              <span className="skeleton-bar" style={{ width: "70%" }} />
              <span className="skeleton-bar" style={{ width: "100%" }} />
              <span className="skeleton-bar" style={{ width: "60%", justifySelf: "end" }} />
              <span className="skeleton-bar" style={{ width: "60%", justifySelf: "end" }} />
              <span className="skeleton-bar" style={{ width: "60%", justifySelf: "end" }} />
              <span className="skeleton-bar" style={{ width: "100%" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const badges = buildBadges(author);
  const maxDownloads = Math.max(...author.plugins.map((p) => p.downloadsTotal), 1);

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Back to leaderboard
      </Link>

      <div className="card author-profile-card">
        <div className="card-edge" />
        <div className="author-profile-head">
          <div className="author-avatar-ring">
            {author.authorAvatarUrl ? (
              <img src={author.authorAvatarUrl} alt="" className="author-avatar-img" />
            ) : (
              <div className="author-avatar-fallback brand-font">{initials(author.authorName)}</div>
            )}
          </div>
          <div className="author-profile-info">
            <div className="author-profile-title">
              <h1 className="brand-font">{author.authorName}</h1>
              {author.ranks.allTime !== null && <span className="rank-badge">#{author.ranks.allTime} all-time</span>}
              <a href={author.authorProfileUrl} target="_blank" rel="noopener" className="author-mod-link">
                {author.game === "runelite" ? "View GitHub profile ↗" : "View mod.io profile ↗"}
              </a>
            </div>
            <div className="author-badges">
              {badges.map((b) => (
                <span key={b.label} className={`author-badge ${b.ember ? "ember" : ""}`}>
                  {b.dot && <span className="period-dot" />}
                  {b.label}
                </span>
              ))}
            </div>
          </div>
          <div className="plugin-profile-actions">
            <Link className="plugin-action-btn" to={`/api?tab=badge&type=author&id=${author.authorId}`}>
              View badge
            </Link>
            <Link className="plugin-action-btn" to={`/api?tab=embed&type=author&id=${author.authorId}`}>
              View card
            </Link>
          </div>
        </div>
        <div className="author-stats-strip">
          {author.game === "runelite" ? (
            <>
              <Stat label="Total installs" value={author.totals.downloadsTotal.toLocaleString()} />
              <Stat label="Gained this week" value={`+${author.totals.weeklyGain.toLocaleString()}`} />
            </>
          ) : (
            <>
              <Stat label="Total downloads" value={author.totals.downloadsTotal.toLocaleString()} />
              <Stat label="Gained this week" value={`+${author.totals.weeklyGain.toLocaleString()}`} />
              <Stat label="Downloads today" value={author.totals.downloadsToday.toLocaleString()} />
              <Stat label="Subscribers" value={author.totals.subscribersTotal.toLocaleString()} />
            </>
          )}
        </div>
      </div>

      <div className="card author-plugins-card">
        <div className="author-plugins-head">
          <div>
            <span className="author-plugins-title">Plugins by {author.authorName}</span>
            <span className="desc-row-caption">Click a plugin to see its charts</span>
          </div>
          <div className="period-group" role="radiogroup" aria-label="Sort">
            {sorts(author.game).map((s) => (
              <button key={s.key} className={`period-btn sort-btn ${sort === s.key ? "active" : ""}`} onClick={() => setSort(s.key)}>
                <span className="period-label">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={`author-col-header ${author.game === "runelite" ? "single-metric" : ""}`}>
          <span>#</span>
          <span>Plugin</span>
          <span>30 days</span>
          <span className="value">{author.game === "runelite" ? "Installs" : "Downloads"}</span>
          <span className="value">This week</span>
          {author.game !== "runelite" && <span className="value">Subscribers</span>}
          <span>Share</span>
        </div>

        {sortedPlugins.map((p, i) => (
          <Link key={p.id} to={`/plugin/${p.id}`} className={`author-plugin-row ${author.game === "runelite" ? "single-metric" : ""}`}>
            <span className="cell-rank">{i + 1}</span>
            <span className="author-plugin-name-col">
              <span className="author-plugin-name-row">
                <span className="cell-name">{p.name}</span>
                {p.hot && <span className="hot-tag">HOT</span>}
              </span>
              <span className="hot-sub">
                since {new Date(p.dateAdded).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </span>
            <svg width="84" height="24" viewBox="0 0 84 24" preserveAspectRatio="none" className="hot-spark">
              {sparklines[p.id] && (
                <path d={sparklines[p.id]!} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinejoin="round" />
              )}
            </svg>
            <span className="cell-value">{p.downloadsTotal.toLocaleString()}</span>
            <span className="cell-value muted">
              {p.weeklyGain >= 0 ? "+" : ""}
              {p.weeklyGain.toLocaleString()}
            </span>
            {author.game !== "runelite" && <span className="cell-value muted">{p.subscribersTotal.toLocaleString()}</span>}
            <span className="author-share">
              <span className="author-share-track">
                <span className="author-share-fill" style={{ width: `${(p.downloadsTotal / maxDownloads) * 100}%` }} />
              </span>
              <span className="author-share-pct">{Math.round((p.downloadsTotal / author.totals.downloadsTotal) * 100)}%</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="author-stat">
      <span className="author-stat-label">{label}</span>
      <span className="author-stat-value">{value}</span>
    </div>
  );
}

function buildBadges(author: AuthorProfile): { label: string; ember?: boolean; dot?: boolean }[] {
  const badges: { label: string; ember?: boolean; dot?: boolean }[] = [
    { label: `${author.pluginCount} plugin${author.pluginCount === 1 ? "" : "s"}` },
  ];

  if (author.ranks.hotWeek === 1) badges.push({ label: "Hot author of the week", ember: true, dot: true });
  else if (author.ranks.hotWeek !== null && author.ranks.hotWeek <= 5) badges.push({ label: `#${author.ranks.hotWeek} hot this week`, ember: true });

  if (author.ranks.allTime !== null && author.ranks.allTime <= 3) badges.push({ label: `#${author.ranks.allTime} all-time author` });

  if (author.ranks.hotToday !== null && author.ranks.hotToday <= 3) badges.push({ label: "Trending today", ember: true, dot: true });

  if (author.plugins.some((p) => p.hot)) badges.push({ label: "Has a hot plugin" });

  badges.push({
    label: `Publishing since ${new Date(author.publishingSince).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`,
  });

  return badges;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function sparklinePath(values: number[], width: number, height: number): string {
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

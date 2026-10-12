import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getTopPlugins, type PluginLeaderboardRow } from "../api";
import { useGame } from "../context/GameContext";
import { slugifyTag } from "../lib/slug";

export function TagPage() {
  const { slug } = useParams<{ slug: string }>();
  const { game } = useGame();
  const navigate = useNavigate();
  const [plugins, setPlugins] = useState<PluginLeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlugins(null);
    getTopPlugins("alltime", game)
      .then((r) => setPlugins(r.plugins))
      .catch((err) => setError(String(err)));
  }, [game]);

  const tagName = useMemo(() => {
    if (!plugins || !slug) return null;
    for (const p of plugins) {
      const match = p.tags.find((t) => slugifyTag(t) === slug);
      if (match) return match;
    }
    return null;
  }, [plugins, slug]);

  const matches = useMemo(() => {
    if (!plugins || !tagName) return [];
    return plugins.filter((p) => p.tags.includes(tagName)).sort((a, b) => b.value - a.value);
  }, [plugins, tagName]);

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

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Back to leaderboard
      </Link>

      <div className="board-head">
        <h1>{tagName ?? "Loading…"}</h1>
        <p className="subtitle subtitle-sm">{plugins ? `${matches.length} plugin${matches.length === 1 ? "" : "s"} tagged ${tagName ?? ""}` : "Loading…"}</p>
      </div>

      <div className="card">
        <div className="card-edge" />
        <div className="col-header-row">
          <span>#</span>
          <span>Plugin</span>
          <span>Author</span>
          <span className="value">Downloads</span>
        </div>
        <div className="row-list">
          {plugins === null &&
            Array.from({ length: 8 }, (_, i) => (
              <div className="skeleton-row" key={i}>
                <span className="skeleton-bar" style={{ width: 18 }} />
                <span className="skeleton-bar" style={{ width: "55%" }} />
                <span className="skeleton-bar" style={{ width: "40%" }} />
                <span className="skeleton-bar" style={{ width: 70, justifySelf: "end" }} />
              </div>
            ))}
          {plugins && tagName === null && (
            <div className="empty-state">
              <p style={{ margin: 0 }}>No plugins found for this category.</p>
            </div>
          )}
          {matches.map((p, i) => (
            <div key={p.id} className="row-grid" onClick={() => navigate(`/plugin/${p.id}`)}>
              <span className={`cell-rank ${i < 3 ? "top" : ""}`}>{i + 1}</span>
              <Link to={`/plugin/${p.id}`} className="cell-name" onClick={(e) => e.stopPropagation()}>
                {p.name}
              </Link>
              <Link to={`/author/${p.authorId}`} className="cell-sub" onClick={(e) => e.stopPropagation()}>
                {p.authorName}
              </Link>
              <span className="cell-value">{p.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

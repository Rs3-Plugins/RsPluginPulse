import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

export function NotFound() {
  usePageMeta({
    title: "Page not found — RuneScape PluginPulse",
    description: "This page doesn't exist on RuneScape PluginPulse.",
    canonicalPath: "/404",
  });

  return (
    <div className="page">
      <div className="board-head">
        <h1>Page not found</h1>
        <p className="subtitle subtitle-sm">There's nothing here. The plugin or author may have moved, or the link's just wrong.</p>
      </div>
      <Link to="/" className="back-link">
        ← Back to the leaderboard
      </Link>
    </div>
  );
}

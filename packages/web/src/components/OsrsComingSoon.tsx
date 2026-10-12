import { useGame } from "../context/GameContext";

export function OsrsComingSoon() {
  const { setGame } = useGame();

  return (
    <div className="card osrs-card">
      <div className="card-edge" />
      <div className="osrs-card-body">
        <span className="osrs-soon-badge">NOT AVAILABLE</span>
        <h1 className="brand-font osrs-title">Old School RuneScape support isn't available yet</h1>
        <p className="osrs-copy">
          PluginPulse tracks RuneScape plugins on mod.io today. OSRS plugin leaderboards, trend charts and author pages aren't
          live here yet.
        </p>
        <div className="osrs-actions">
          <a href="https://discord.gg/gHN7c9B5FU" target="_blank" rel="noopener" className="cta-pill">
            Get notified on Discord ↗
          </a>
          <button className="theme-toggle" onClick={() => setGame("rs3")}>
            Back to RuneScape
          </button>
        </div>
      </div>
    </div>
  );
}

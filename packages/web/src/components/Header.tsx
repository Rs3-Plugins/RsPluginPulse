import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useGame, type Game } from "../context/GameContext";
import { getRandomPlugin, getStatus } from "../api";
import { GameSwitcher, VISIBLE_GAMES } from "./GameSwitcher";

type Theme = "dark" | "light";

function readStoredTheme(): Theme {
  const stored = localStorage.getItem("theme");
  return stored === "light" ? "light" : "dark";
}

const NAV_LINKS: { to: string; label: string; match: (path: string) => boolean }[] = [
  { to: "/", label: "Leaderboard", match: (p) => p === "/" },
  { to: "/stats", label: "Stats", match: (p) => p.startsWith("/stats") },
  { to: "/compare", label: "Compare", match: (p) => p.startsWith("/compare") },
  { to: "/api", label: "API", match: (p) => p.startsWith("/api") },
];

export function Header() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const { game, setGame } = useGame();
  const navigate = useNavigate();
  const location = useLocation();
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function handleRandomize() {
    if (rolling) return;
    setRolling(true);
    const [result] = await Promise.all([
      getRandomPlugin(game).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 650)),
    ]);
    setRolling(false);
    if (result) navigate(`/plugin/${result.id}`);
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    let updatedAt: number | null = null;
    setUpdatedLabel(null);
    function tick() {
      if (updatedAt === null) return;
      setUpdatedLabel(formatMinutesAgo(updatedAt));
    }
    getStatus(game)
      .then((res) => {
        if (!res.updatedAt) return;
        updatedAt = new Date(res.updatedAt).getTime();
        tick();
      })
      .catch(() => {});
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [game]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="site-header" ref={menuRef}>
      <div className="site-header-inner">
        <div className="brand-group">
          <Link to="/" className="brand-link">
            <img src="/logo/icon-2a-hex.svg" alt="" className="brand-icon" />
            <span className="brand-text brand-font">
              <span className="brand-eyebrow">{brandEyebrow(game)}</span>
              <span className="brand-name">
                Plugin<span className="brand-pulse">Pulse</span>
              </span>
            </span>
          </Link>

          <nav className="primary-nav" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className={`primary-nav-link ${link.match(location.pathname) ? "active" : ""}`}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="header-controls">
          <button className="theme-toggle randomizer-btn" onClick={handleRandomize} disabled={rolling}>
            <DiceIcon rolling={rolling} />
            {rolling ? "Rolling…" : "Randomizer"}
          </button>

          <div className="header-controls-desktop">
            <GameSwitcher updatedLabel={updatedLabel} sourceLabel={dataSourceLabel(game)} />

            <button
              className="theme-icon-btn"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              <ThemeIcon theme={theme} />
            </button>
          </div>

          <button
            className="theme-icon-btn menu-toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      <div className="rune-band" />

      {menuOpen && (
        <div className="mobile-menu">
          <nav className="mobile-nav" aria-label="Primary">
            {NAV_LINKS.map((link) => {
              const active = link.match(location.pathname);
              return (
                <Link key={link.to} to={link.to} className={`mobile-nav-link ${active ? "active" : ""}`}>
                  {link.label}
                  {active && <span className="mobile-nav-dot" />}
                </Link>
              );
            })}
          </nav>

          <div className="mobile-menu-section">
            <span className="mobile-menu-label">Game</span>
            <div className="mobile-game-grid">
              {VISIBLE_GAMES.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`mobile-game-card ${game === g.key ? "active" : ""} ${g.soon ? "disabled" : ""}`}
                  aria-disabled={g.soon}
                  disabled={g.soon}
                  onClick={() => {
                    if (g.soon) return;
                    setGame(g.key);
                    navigate("/");
                    setMenuOpen(false);
                  }}
                >
                  <img src={g.icon} alt="" referrerPolicy="no-referrer" className="game-icon" />
                  <span>{g.shortName}</span>
                  {g.soon && <span className="soon-tag">NOT AVAILABLE</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="mobile-menu-footer">
            {updatedLabel && (
              <span className="mobile-menu-updated">
                {dataSourceLabel(game)} · {updatedLabel}
              </span>
            )}
            <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function DiceIcon({ rolling }: { rolling: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className={`dice-icon ${rolling ? "rolling" : ""}`}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="5" r="1.1" fill="currentColor" />
      <circle cx="11" cy="5" r="1.1" fill="currentColor" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
      <circle cx="5" cy="11" r="1.1" fill="currentColor" />
      <circle cx="11" cy="11" r="1.1" fill="currentColor" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "dark") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.8 9.9A5.8 5.8 0 116.1 2.2a4.6 4.6 0 107.7 7.7Z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M2 4.5h12M2 8h12M2 11.5h12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

function brandEyebrow(game: Game): string {
  if (game === "osrs") return "OLD SCHOOL";
  if (game === "runelite") return "RUNELITE";
  return "RUNESCAPE";
}

function dataSourceLabel(game: Game): string {
  if (game === "runelite") return "RuneLite data";
  return "mod.io data";
}

function formatMinutesAgo(timestampMs: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestampMs) / 60_000));
  if (minutes < 1) return "updated just now";
  if (minutes === 1) return "updated 1 min ago";
  if (minutes < 60) return `updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "updated 1 hour ago" : `updated ${hours} hours ago`;
}

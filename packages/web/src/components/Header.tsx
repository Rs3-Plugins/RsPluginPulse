import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useGame, type Game } from "../context/GameContext";
import { getRandomPlugin, getStatus } from "../api";
import { GameSwitcher, VISIBLE_GAMES } from "./GameSwitcher";
import { HeaderSearch } from "./HeaderSearch";
import { pluginHref } from "../lib/links";

type Theme = "dark" | "light";

function readStoredTheme(): Theme {
  const stored = localStorage.getItem("theme");
  return stored === "light" ? "light" : "dark";
}

const NAV_LINKS: { to: string; label: string; match: (path: string) => boolean }[] = [
  { to: "/", label: "Leaderboard", match: (p) => p === "/" },
  { to: "/compare", label: "Compare", match: (p) => p.startsWith("/compare") },
  { to: "/stats", label: "Stats", match: (p) => p.startsWith("/stats") },
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
    if (result) navigate(pluginHref(result.nameId, game));
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
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
    <header className="pp-hdr" ref={menuRef}>
      <div className="pp-hdr__row">
        <Link to="/" className="pp-brand">
          <img src="/logo/icon-2a-hex.svg" alt="" width={34} height={34} className="pp-brand__icon" />
          <span className="pp-brand__text brand-font">
            <span className="pp-brand__eyebrow">{brandEyebrow(game)}</span>
            <span className="pp-brand__name">
              Plugin<span>Pulse</span>
            </span>
          </span>
        </Link>

        <nav className="pp-nav" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="pp-nav__tab" aria-current={link.match(location.pathname) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="pp-actions">
          <a
            className="pp-discord"
            href="https://discord.gg/gHN7c9B5FU"
            target="_blank"
            rel="noopener"
            title="Join the PluginPulse Discord"
            aria-label="Join the PluginPulse Discord"
          >
            <PlusIcon />
            <span className="pp-discord__long">Join Discord</span>
            <span className="pp-discord__short">Discord</span>
          </a>
          <span className="pp-divider" aria-hidden="true" />

          <HeaderSearch />

          <GameSwitcher updatedLabel={updatedLabel} sourceLabel={dataSourceLabel(game)} />

          <button
            className="pp-ghost pp-ghost--icon"
            onClick={handleRandomize}
            disabled={rolling}
            title="Open a random plugin"
            aria-label="Open a random plugin"
          >
            <DiceIcon rolling={rolling} />
          </button>

          <a
            className="pp-ghost pp-ghost--icon"
            href="https://ko-fi.com/mark7625"
            target="_blank"
            rel="noopener"
            title="Buy me a coffee"
            aria-label="Support PluginPulse — buy me a coffee"
          >
            <CoffeeIcon />
          </a>

          <button
            className="pp-ghost pp-ghost--icon"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>

        <div className="pp-mobile">
          <HeaderSearch />

          <button className="pp-round pp-round--label" onClick={handleRandomize} disabled={rolling} aria-label="Open a random plugin">
            <DiceIcon rolling={rolling} />
            <span>Randomizer</span>
          </button>

          <button
            className="pp-round"
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
        <div className="pp-drawer">
          <nav className="pp-drawer__nav" aria-label="Main">
            {NAV_LINKS.map((link) => {
              const active = link.match(location.pathname);
              return (
                <Link key={link.to} to={link.to} className="pp-drawer__item" aria-current={active ? "page" : undefined}>
                  {link.label}
                  {active && <span className="pp-dot" />}
                </Link>
              );
            })}
            <a className="pp-drawer__discord" href="https://discord.gg/gHN7c9B5FU" target="_blank" rel="noopener">
              <span className="pp-drawer__plus">
                <PlusIcon />
              </span>
              <span>
                <b>Join Discord</b>
                <small>Chat with the PluginPulse community</small>
              </span>
            </a>
            <a className="pp-drawer__discord pp-drawer__coffee" href="https://ko-fi.com/mark7625" target="_blank" rel="noopener">
              <span className="pp-drawer__plus">
                <CoffeeIcon />
              </span>
              <span>
                <b>Buy me a coffee</b>
                <small>Help keep PluginPulse running</small>
              </span>
            </a>
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
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CoffeeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5h9v3.5a3 3 0 01-3 3h-3a3 3 0 01-3-3V6.5Z" />
      <path d="M11.5 7h1a1.8 1.8 0 010 3.6h-1" />
      <path d="M5.2 4.3c-.4-.5-.4-1 0-1.6M7.8 4.3c-.4-.5-.4-1 0-1.6" />
    </svg>
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
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5h12M3 9h12M3 13h12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
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

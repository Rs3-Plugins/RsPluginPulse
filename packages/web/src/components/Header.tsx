import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useGame, type Game } from "../context/GameContext";
import { getRandomPlugin, getStatus } from "../api";
import { useDiscordAuth } from "../discord/DiscordAuthContext";
import { ProfileMenu } from "../discord/ProfileMenu";
import { useTheme } from "../hooks/useTheme";
import { GameSwitcher, VISIBLE_GAMES } from "./GameSwitcher";
import { HeaderSearch } from "./HeaderSearch";
import { CloseIcon, CoffeeIcon, DiceIcon, MenuIcon, ThemeIcon } from "./icons";
import { pluginHref } from "../lib/links";

const NAV_LINKS: { to: string; label: string; match: (path: string) => boolean }[] = [
  { to: "/", label: "Leaderboard", match: (p) => p === "/" },
  { to: "/compare", label: "Compare", match: (p) => p.startsWith("/compare") },
  { to: "/stats", label: "Stats", match: (p) => p.startsWith("/stats") },
  { to: "/api", label: "API", match: (p) => p.startsWith("/api") },
];

export function Header() {
  const [theme, toggleTheme] = useTheme();
  const { signedIn, user, logOut } = useDiscordAuth();
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
          {signedIn && user ? (
            <ProfileMenu user={user} />
          ) : (
            <Link
              className="pp-discord pp-tip"
              to="/discord"
              data-tooltip="Add the PluginPulse bot to your Discord server"
              aria-label="Add the PluginPulse bot to your Discord server"
            >
              <img src="/icons/game-controller.svg" alt="" width={15} height={15} />
              Add to Discord
            </Link>
          )}
          <span className="pp-divider" aria-hidden="true" />

          <HeaderSearch />

          <GameSwitcher updatedLabel={updatedLabel} sourceLabel={dataSourceLabel(game)} />

          <button
            className="pp-ghost pp-ghost--icon pp-tip"
            onClick={handleRandomize}
            disabled={rolling}
            data-tooltip="Open a random plugin"
            aria-label="Open a random plugin"
          >
            <DiceIcon rolling={rolling} />
          </button>

          <a
            className="pp-ghost pp-ghost--icon pp-tip"
            href="https://ko-fi.com/mark7625"
            target="_blank"
            rel="noopener"
            data-tooltip="Buy me a coffee"
            aria-label="Support PluginPulse — buy me a coffee"
          >
            <CoffeeIcon />
          </a>

          <button
            className="pp-ghost pp-ghost--icon pp-tip"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            data-tooltip={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
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
            {signedIn && user ? (
              <>
                <Link className="pp-drawer__discord" to="/discord/servers">
                  <img src={user.avatarUrl} alt="" className="pp-drawer__plus dc-hdr__avatar" width={32} height={32} />
                  <span>
                    <b>{user.username}</b>
                    <small>View your servers</small>
                  </span>
                </Link>
                <button
                  type="button"
                  className="pp-drawer__item"
                  onClick={() => {
                    logOut();
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <Link className="pp-drawer__discord" to="/discord">
                <span className="pp-drawer__plus">
                  <img src="/icons/game-controller.svg" alt="" width={18} height={18} />
                </span>
                <span>
                  <b>Add to Discord</b>
                  <small>Add the PluginPulse bot to your server</small>
                </span>
              </Link>
            )}
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

export function brandEyebrow(game: Game): string {
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

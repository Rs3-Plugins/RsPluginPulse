import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useGame } from "../context/GameContext";
import { Footer } from "../components/Footer";
import { brandEyebrow } from "../components/Header";
import { CloseIcon, CoffeeIcon, MenuIcon, ThemeIcon } from "../components/icons";
import { useTheme } from "../hooks/useTheme";
import { useDiscordAuth } from "./DiscordAuthContext";
import { ProfileMenu } from "./ProfileMenu";

// The main site's <Header>, copied 1:1, minus Compare/Stats/API (no
// Discord-section equivalent), Search, the game switcher, and the plugin
// randomizer (none apply here -- Discord isn't scoped to one game's
// catalog) -- and with "Add to Discord" swapped for the sign-in/profile
// area, since you're already here. Same pp-hdr/pp-nav/pp-actions/
// pp-drawer classes as the main header, not a parallel dc-* copy, so any
// future tweak to the main header's layout doesn't need to be re-applied
// here by hand.
export function DiscordLayout() {
  const { signedIn, user, logIn, logOut } = useDiscordAuth();
  const { game } = useGame();
  const [theme, toggleTheme] = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div className="dc-shell">
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
            <span className="dc-brand__badge">for Discord</span>
          </Link>

          <nav className="pp-nav" aria-label="Main">
            <Link to="/" className="pp-nav__tab">
              Leaderboards
            </Link>
          </nav>

          <div className="pp-actions">
            {signedIn && user ? (
              <ProfileMenu user={user} />
            ) : (
              <button type="button" className="dc-pill-outline dc-pill-outline--sm" onClick={logIn}>
                Log in with Discord
              </button>
            )}
            <span className="pp-divider" aria-hidden="true" />

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
              <Link to="/" className="pp-drawer__item">
                Leaderboards
              </Link>

              {signedIn && user ? (
                <>
                  <button type="button" className="pp-drawer__discord" onClick={() => navigate("/discord/servers")}>
                    <img src={user.avatarUrl} alt="" className="pp-drawer__plus dc-hdr__avatar" width={32} height={32} />
                    <span>
                      <b>{user.username}</b>
                      <small>View your servers</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pp-drawer__item"
                    onClick={() => {
                      logOut();
                      navigate("/discord");
                    }}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <button type="button" className="pp-drawer__discord" onClick={logIn}>
                  <span className="pp-drawer__plus">
                    <img src="/icons/game-controller.svg" alt="" width={18} height={18} />
                  </span>
                  <span>
                    <b>Log in with Discord</b>
                    <small>Manage your server's settings</small>
                  </span>
                </button>
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

            <div className="mobile-menu-footer">
              <button className="theme-toggle" onClick={toggleTheme}>
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="dc-main">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}

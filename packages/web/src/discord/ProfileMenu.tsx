import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDiscordGuilds, type DiscordUserInfo, type ManageableGuild } from "../api";
import { useDiscordAuth } from "./DiscordAuthContext";

// Signed-in profile dropdown, shared between the main site's <Header> and
// the Discord section's own header -- same dropdown/dropdown-trigger/
// dropdown-list classes as the filter dropdowns elsewhere (see
// components/Dropdown.tsx), just with the guild list + actions instead of
// value options. Guilds are fetched lazily on first open, not on mount --
// this renders on every page via the main site's header, so there's no
// reason to hit /api/discord/guilds before anyone's actually looked.
export function ProfileMenu({ user }: { user: DiscordUserInfo }) {
  const { logOut } = useDiscordAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [guilds, setGuilds] = useState<ManageableGuild[] | null>(null);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Only ones the bot's actually in -- a guild you can manage but haven't
  // added the bot to shows up on /discord/servers instead, with an Invite
  // button, not here (there's nothing to click into yet for those).
  const installedGuilds = guilds?.filter((g) => g.botInstalled) ?? null;

  useEffect(() => {
    if (!open || guilds !== null || error) return;
    getDiscordGuilds()
      .then((res) => setGuilds(res.guilds))
      .catch(() => setError(true));
  }, [open, guilds, error]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className="dropdown-trigger dc-hdr__profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <img src={user.avatarUrl} alt="" className="dc-hdr__avatar" width={32} height={32} />
        <span>{user.username}</span>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul role="menu" aria-label="Account" className="dropdown-list dropdown-list--profile">
          {guilds === null && !error && (
            <li role="none">
              <span className="dropdown-option dropdown-option--static">Loading servers…</span>
            </li>
          )}
          {error && (
            <li role="none">
              <span className="dropdown-option dropdown-option--static">Couldn&rsquo;t load servers</span>
            </li>
          )}
          {installedGuilds?.map((g) => (
            <li role="none" key={g.id}>
              <button
                type="button"
                role="menuitem"
                className="dropdown-option dropdown-option--guild"
                onClick={() => {
                  setOpen(false);
                  navigate(`/discord/servers/${g.id}`);
                }}
              >
                {g.iconUrl ? (
                  <img src={g.iconUrl} alt="" className="dropdown-option__icon" />
                ) : (
                  <span className="dropdown-option__icon dropdown-option__icon--fallback">{initials(g.name)}</span>
                )}
                <span>{g.name}</span>
              </button>
            </li>
          ))}

          <li role="none" className="dropdown-divider" aria-hidden="true" />

          <li role="none">
            <Link to="/discord/servers" role="menuitem" className="dropdown-option" onClick={() => setOpen(false)}>
              + Add to more servers
            </Link>
          </li>

          {user.isSiteAdmin && (
            <>
              <li role="none" className="dropdown-divider" aria-hidden="true" />
              <li role="none">
                <Link to="/discord/admin" role="menuitem" className="dropdown-option" onClick={() => setOpen(false)}>
                  Admin Management
                </Link>
              </li>
            </>
          )}

          <li role="none" className="dropdown-divider" aria-hidden="true" />

          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="dropdown-option"
              onClick={() => {
                setOpen(false);
                logOut();
                navigate("/discord");
              }}
            >
              Log out
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { discordInstallUrl, getDiscordGuilds, type ManageableGuild } from "../api";
import { LoadingState } from "../components/LoadingState";
import { usePageMeta } from "../hooks/usePageMeta";
import { useDiscordAuth } from "./DiscordAuthContext";

export function DiscordServers() {
  usePageMeta({
    title: "Your servers · PluginPulse for Discord",
    description: "Servers where you have Manage Server permission.",
    canonicalPath: "/discord/servers",
  });

  const navigate = useNavigate();
  const { loading: authLoading, signedIn, logIn } = useDiscordAuth();
  const [guilds, setGuilds] = useState<ManageableGuild[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !signedIn) return;
    let cancelled = false;
    setGuilds(null);
    setError(null);
    getDiscordGuilds()
      .then((res) => {
        if (!cancelled) setGuilds(res.guilds);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, signedIn]);

  return (
    <section className="dc-servers">
      <div className="dc-page-head">
        <h1 className="dc-h2 brand-font">Your servers</h1>
        <span className="dc-muted">Servers where you have Manage Server permission.</span>
      </div>

      {!authLoading && !signedIn && (
        <div className="dc-empty">
          <p>Log in with Discord to see your servers.</p>
          <button type="button" className="dc-pill-primary" onClick={logIn}>
            Log in with Discord
          </button>
        </div>
      )}

      {(authLoading || (signedIn && guilds === null && !error)) && <LoadingState message="Loading your servers…" />}

      {error && <p className="dc-warn">Couldn&rsquo;t load your servers: {error}</p>}

      {signedIn && guilds !== null && (
        <>
          {guilds.length === 0 ? (
            <div className="dc-empty">No servers found where you have Manage Server permission.</div>
          ) : (
            <div className="dc-guild-grid">
              {guilds.map((g) => (
                <div key={g.id} className="dc-guild-card">
                  <div className="dc-guild-card__head">
                    {g.iconUrl ? <img src={g.iconUrl} alt="" className="dc-guild-icon" /> : <span className="dc-guild-icon">{initials(g.name)}</span>}
                    <div className="dc-guild-card__meta">
                      <b>{g.name}</b>
                      <span>
                        {g.owner ? "Owner" : "Manage Server"} · {g.botInstalled ? "Bot added" : "Bot not added"}
                      </span>
                    </div>
                  </div>
                  {g.botInstalled ? (
                    <button type="button" className="dc-pill-primary dc-pill-primary--block" onClick={() => navigate(`/discord/servers/${g.id}`)}>
                      Manage
                    </button>
                  ) : (
                    // A real top-level navigation, not a fetch -- same
                    // reasoning as logIn/the landing page's Add to Discord.
                    <button
                      type="button"
                      className="dc-pill-outline dc-pill-outline--block dc-pill-invite"
                      onClick={() => {
                        window.location.href = discordInstallUrl(g.id);
                      }}
                    >
                      Invite
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <span className="dc-note">Don&rsquo;t see a server? You need Manage Server there.</span>
        </>
      )}
    </section>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

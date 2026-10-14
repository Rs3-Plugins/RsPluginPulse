import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { DiscordApiError, discordInstallUrl, getDiscordGuildAdmins, getDiscordGuildSettings, type DiscordGuildSettingsResponse } from "../api";
import { LoadingState } from "../components/LoadingState";
import { usePageMeta } from "../hooks/usePageMeta";
import { useDiscordAuth } from "./DiscordAuthContext";
import { fmt } from "./mockData";
import { WatchlistTab, type Watch } from "./tabs/WatchlistTab";
import { ChannelTopicsTab } from "./tabs/ChannelTopicsTab";
import { AnnouncementsTab } from "./tabs/AnnouncementsTab";
import { AdvancedSettingsTab } from "./tabs/AdvancedSettingsTab";
import { EmbedDesignTab } from "./tabs/EmbedDesignTab";
import { CommandsTab } from "./tabs/CommandsTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { LinkedAuthorsTab } from "./tabs/LinkedAuthorsTab";

const TABS = [
  { key: "general", label: "General" },
  { key: "watch", label: "Watchlist" },
  { key: "topics", label: "Channel topics" },
  { key: "announce", label: "Announcements" },
  { key: "embed", label: "Embed design" },
  { key: "commands", label: "Commands" },
  { key: "links", label: "Linked authors" },
] as const;
const ADVANCED_TAB = { key: "advanced", label: "Advanced Settings" } as const;
type TabKey = (typeof TABS)[number]["key"] | typeof ADVANCED_TAB.key;

const DEFAULT_WATCHES: Watch[] = [
  { ent: "p1", ch: "plugin-alerts", up: 15, dn: 15, last: "Rose 18% · 3h ago", hot: 1 },
  { ent: "p4", ch: "plugin-alerts", up: 20, dn: 10, last: "Quiet · 6 days", hot: 0 },
  { ent: "a1", ch: "general", up: 15, dn: 15, last: "Quiet · 2 days", hot: 0 },
  { ent: "p6", ch: "plugin-alerts", up: 15, dn: 15, last: "Fell 16% · 1h ago", hot: -1 },
];

// Owns just the state every tab's sidebar count badge needs (watches,
// topics, enabled announcements) -- everything else (embed design,
// commands, the watch/topic editor forms) is local to its own tab, there's
// nothing elsewhere that needs to react to it.
export function DiscordServer() {
  const { guildId } = useParams<{ guildId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as TabKey) ?? "general";
  const { logIn } = useDiscordAuth();

  const [data, setData] = useState<DiscordGuildSettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [watches, setWatches] = useState<Watch[]>(DEFAULT_WATCHES);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!guildId) return;
    let cancelled = false;
    setData(null);
    setLoadError(null);
    getDiscordGuildSettings(guildId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  // Whether the Advanced Settings tab even shows up at all -- gated by
  // owner-or-guild-admin, not by subscription (the tab itself shows a
  // locked upsell when unsubscribed, see AdvancedSettingsTab.tsx). A 403
  // here just means "not an admin of this guild", not a real error, so
  // it's swallowed rather than surfaced like loadError above.
  useEffect(() => {
    if (!guildId) return;
    let cancelled = false;
    setIsAdmin(false);
    getDiscordGuildAdmins(guildId)
      .then(() => {
        if (!cancelled) setIsAdmin(true);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  usePageMeta({
    title: data ? `${data.guild.name} · PluginPulse for Discord` : "PluginPulse for Discord",
    description: `Manage the PluginPulse bot's watchlist, channel topics, announcements and embeds${data ? ` for ${data.guild.name}` : ""}.`,
    canonicalPath: `/discord/servers/${guildId ?? ""}`,
  });

  function setTab(key: TabKey) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (key === "general") next.delete("tab");
      else next.set("tab", key);
      return next;
    });
  }

  const counts: Record<TabKey, string> = {
    general: "",
    watch: String(watches.length),
    topics: "",
    announce: "",
    embed: "",
    commands: "",
    links: "",
    advanced: "",
  };
  const tabs = isAdmin ? [...TABS, ADVANCED_TAB] : TABS;

  if (loadError) {
    const code = loadError instanceof DiscordApiError ? loadError.code : null;
    return (
      <section className="dc-server">
        <div className="dc-breadcrumb">
          <Link to="/discord/servers" className="dc-breadcrumb__link">
            Servers
          </Link>
        </div>
        {code === "not_signed_in" ? (
          <div className="dc-empty">
            <p>Your session&rsquo;s expired. Log in with Discord to manage this server.</p>
            <button type="button" className="dc-pill-primary" onClick={logIn}>
              Log in with Discord
            </button>
          </div>
        ) : code === "forbidden" ? (
          <p className="dc-warn">You need Manage Server permission on this server to see its settings.</p>
        ) : code === "bot_not_installed" ? (
          <div className="dc-empty">
            <p>The bot isn&rsquo;t in this server yet.</p>
            <button type="button" className="dc-pill-outline dc-pill-invite" onClick={() => (window.location.href = discordInstallUrl(guildId))}>
              Invite the bot
            </button>
          </div>
        ) : (
          <p className="dc-warn">Couldn&rsquo;t load this server: {loadError instanceof Error ? loadError.message : String(loadError)}</p>
        )}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="dc-server">
        <LoadingState message="Loading server…" />
      </section>
    );
  }

  const { guild, settings } = data;

  return (
    <section className="dc-server">
      <div className="dc-breadcrumb">
        <Link to="/discord/servers" className="dc-breadcrumb__link">
          Servers
        </Link>
        <span>/</span>
        <span className="dc-muted">{guild.name}</span>
      </div>

      <div className="dc-guild-head">
        <div className="dc-guild-head__id">
          {guild.iconUrl ? <img src={guild.iconUrl} alt="" className="dc-guild-icon dc-guild-icon--lg" /> : <span className="dc-guild-icon dc-guild-icon--lg">{initials(guild.name)}</span>}
          <div>
            <h1 className="dc-h3 brand-font">{guild.name}</h1>
            <span className="dc-dim">
              {guild.memberCount !== null ? `${fmt(guild.memberCount)} members · ` : ""}Bot added {formatShortDate(guild.botAddedAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="dc-server-shell">
        <nav aria-label="Server settings" className="dc-tabs">
          {tabs.map((t) => (
            <button key={t.key} type="button" className={`dc-tab ${tab === t.key ? "active" : ""}`} aria-current={tab === t.key ? "page" : undefined} onClick={() => setTab(t.key)}>
              <span>{t.label}</span>
              {counts[t.key] && <span className="dc-tab__count">{counts[t.key]}</span>}
            </button>
          ))}
        </nav>

        <div className="dc-tab-content">
          {tab === "general" && (
            <GeneralTab guildId={guild.id} settings={settings} onSettingsChange={(next) => setData((prev) => (prev ? { ...prev, settings: next } : prev))} />
          )}
          {tab === "watch" && (
            <div className="dc-coming-soon">
              <div className="dc-coming-soon__content">
                <WatchlistTab watches={watches} onWatchesChange={setWatches} />
              </div>
              <div className="dc-coming-soon__badge">
                <b>Coming soon</b>
                <p>Threshold-based watch alerts are still being built.</p>
              </div>
            </div>
          )}
          {tab === "topics" && <ChannelTopicsTab guildId={guild.id} />}
          {tab === "announce" && <AnnouncementsTab guildId={guild.id} />}
          {tab === "embed" && <EmbedDesignTab />}
          {tab === "commands" && <CommandsTab guildId={guild.id} />}
          {tab === "links" && <LinkedAuthorsTab guildId={guild.id} />}
          {tab === "advanced" && isAdmin && <AdvancedSettingsTab guildId={guild.id} />}
        </div>
      </div>
    </section>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

import { useEffect, useState } from "react";
import {
  DiscordApiError,
  deleteDiscordChannelTopic,
  getAuthorProfile,
  getDiscordChannelTopics,
  getDiscordGuildChannels,
  getPluginInfo,
  refreshDiscordChannelTopic,
  saveDiscordChannelTopic,
  search,
  setDiscordChannelTopicInterval,
  type AuthorProfile,
  type DiscordChannelTopic,
  type DiscordChannelTopicsResponse,
  type DiscordGuildChannel,
  type DiscordTopicEntityKind,
  type PluginInfo,
  type SearchAuthorRow,
  type SearchPluginRow,
} from "../../api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { GAMES } from "../../components/GameSwitcher";
import { LockIcon, RefreshIcon } from "../../components/icons";
import { LoadingState } from "../../components/LoadingState";
import { initials } from "../../components/SearchBox";
import type { Game } from "../../context/GameContext";
import { MissingPermissionsNotice } from "../MissingPermissionsNotice";
import { SubscribeModal } from "../SubscribeModal";

const CHAR_LIMIT = 1024; // Discord's own channel topic character limit
// Always show at least this many rows in the bindings list (bound ones,
// then "Empty" up to the plan's limit, then "Locked" past it) so there's
// a real sense of "here's your loadout" rather than a list that's just
// one or two rows tall -- matches PAID_TOPIC_BINDING_LIMIT in
// packages/api/src/lib/subscriptions.ts so the slot list shows the full
// paid "loadout" by default without an unused extra row. Grows past this
// if someone genuinely has more bindings than that so a real binding
// never gets hidden.
const MIN_SLOTS = 8;
const PLACEHOLDERS: Record<DiscordTopicEntityKind, string[]> = {
  plugin: ["{name}", "{author}", "{installs}", "{today}", "{subscribers}", "{rank}", "{rating}", "{updated}", "{game}"],
  author: ["{name}", "{plugins}", "{installs}", "{today}", "{weekly}", "{rank}", "{since}", "{game}"],
};
const PLACEHOLDER_HELP: Record<DiscordTopicEntityKind, Record<string, string>> = {
  plugin: {
    "{name}": "The plugin's name",
    "{author}": "The plugin's primary author",
    "{installs}": "Total installs",
    "{today}": "Installs/downloads today",
    "{subscribers}": "Subscriber count",
    "{rank}": "Current leaderboard rank, with a # already in front (e.g. #4)",
    "{rating}": "mod.io rating label (RuneScape only -- blank/\"Unrated\" for RuneLite)",
    "{updated}": "Date of its last release",
    "{game}": "RuneScape or RuneLite",
  },
  author: {
    "{name}": "The author's name",
    "{plugins}": "How many plugins they've published",
    "{installs}": "Total installs across all their plugins",
    "{today}": "Installs/downloads today across all their plugins",
    "{weekly}": "Install change over the last 7 days, with a +/- sign",
    "{rank}": "Current leaderboard rank, with a # already in front (e.g. #4)",
    "{since}": "Date they published their first plugin",
    "{game}": "RuneScape or RuneLite",
  },
};
// {rank} already renders with its own leading "#" ("#180") -- no literal
// "#" needed in front of it here, see channelTopicRender.ts's own comment
// on the same thing (that's the real renderer; this default is just what
// a new binding starts out with).
const DEFAULT_TEMPLATE = "{name}: {installs} installs · {rank} on the leaderboard";

function fmtCompact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(n);
}

function fmtSigned(n: number): string {
  if (n > 0) return `+${fmtCompact(n)}`;
  if (n < 0) return `-${fmtCompact(Math.abs(n))}`;
  return "0";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Mirrors packages/discord-bot/src/channelTopics.ts's renderTopic exactly
// -- this is a preview of what the hourly worker will actually push, so
// the placeholder vocabulary and formatting have to match it, not just
// look similar.
function placeholderValues(kind: DiscordTopicEntityKind, entity: PluginInfo | AuthorProfile): Record<string, string> {
  if (kind === "plugin") {
    const p = entity as PluginInfo;
    return {
      name: p.name,
      author: p.authorName,
      installs: fmtCompact(p.downloadsTotal),
      today: fmtCompact(p.downloadsToday),
      subscribers: fmtCompact(p.subscribersTotal),
      rank: p.popularityRankPosition ? `#${p.popularityRankPosition}` : "—",
      rating: p.ratingsDisplayText || "Unrated",
      updated: fmtDate(p.dateUpdated),
      game: p.game,
    };
  }
  const a = entity as AuthorProfile;
  return {
    name: a.authorName,
    plugins: String(a.pluginCount),
    installs: fmtCompact(a.totals.downloadsTotal),
    today: fmtCompact(a.totals.downloadsToday),
    weekly: fmtSigned(a.totals.weeklyGain),
    rank: a.ranks.allTime ? `#${a.ranks.allTime}` : "—",
    since: fmtDate(a.publishingSince),
    game: a.game,
  };
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Not pushed yet";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "Live · just now";
  if (minutes < 60) return `Live · ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Live · ${hours}h ago`;
}

// The soonest any *active* binding (within the current plan's limit --
// anything past it is frozen, see guildTopicBindingLimit) becomes due for
// a re-render, given this guild's configured interval. The worker itself
// only ticks hourly (packages/discord-bot's CHANNEL_TOPICS_INTERVAL_MS),
// so this is "due", not a guaranteed push time -- worded that way rather
// than promising a push the next tick might still be a while off from.
function nextUpdateLabel(activeTopics: DiscordChannelTopic[], intervalHours: number, now: number): string {
  if (activeTopics.length === 0) return "No bindings yet";
  let soonest = Infinity;
  for (const t of activeTopics) {
    const due = t.lastRenderedAt ? new Date(t.lastRenderedAt).getTime() + intervalHours * 60 * 60 * 1000 : now;
    if (due < soonest) soonest = due;
  }
  const diffMinutes = Math.ceil((soonest - now) / 60_000);
  if (diffMinutes <= 0) return "Next check due now";
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `Next check due in ${hours > 0 ? `${hours}h ` : ""}${minutes}m`;
}

type PickedEntity = { id: number; name: string };

export function ChannelTopicsTab({ guildId }: { guildId: string }) {
  const [channels, setChannels] = useState<DiscordGuildChannel[] | null>(null);
  const [meta, setMeta] = useState<DiscordChannelTopicsResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [intervalSaving, setIntervalSaving] = useState(false);

  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [formChannelId, setFormChannelId] = useState("");
  const [channelQuery, setChannelQuery] = useState("");
  const [channelSearchOpen, setChannelSearchOpen] = useState(false);
  const [formKind, setFormKind] = useState<DiscordTopicEntityKind>("plugin");
  const [formGame, setFormGame] = useState<Game>("runescape");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PickedEntity | null>(null);
  const [matches, setMatches] = useState<(SearchPluginRow | SearchAuthorRow)[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const [savePushWarning, setSavePushWarning] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<DiscordChannelTopic | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());

  // Drives the "Next check due in …" countdown -- 30s is plenty granular
  // for a timer measured in minutes/hours, no need for anything faster.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  function load() {
    setLoadError(null);
    Promise.all([getDiscordGuildChannels(guildId), getDiscordChannelTopics(guildId)])
      .then(([ch, tp]) => {
        setChannels(ch.channels);
        setMeta(tp);
      })
      .catch((err) => setLoadError(err));
  }

  useEffect(() => {
    setChannels(null);
    setMeta(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  async function changeInterval(hours: number) {
    if (!meta || hours === meta.intervalHours) return;
    if (!meta.allowedIntervals.includes(hours)) {
      setSubscribeOpen(true);
      return;
    }
    setIntervalSaving(true);
    try {
      await setDiscordChannelTopicInterval(guildId, hours);
      setMeta((prev) => (prev ? { ...prev, intervalHours: hours } : prev));
    } catch {
      // Transient failure -- the picker just stays on the old value, nothing more to do here.
    } finally {
      setIntervalSaving(false);
    }
  }

  // Debounced search against the real catalog -- runs as soon as the
  // dropdown opens (empty query = trending, same as the site's own header
  // search) and clears once something's picked so re-typing starts a
  // fresh search instead of re-matching the name that's just sitting in
  // the box.
  useEffect(() => {
    if (!searchOpen || picked) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(
      () => {
        search(query, formGame, 6)
          .then((res) => {
            if (!cancelled) setMatches(formKind === "plugin" ? res.plugins : res.authors);
          })
          .catch(() => {
            if (!cancelled) setMatches([]);
          });
      },
      query ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, formGame, formKind, picked, searchOpen]);

  // Live preview against the entity's *current* stats, same placeholder
  // logic the hourly worker uses -- refetches whenever the picked entity
  // or template text changes.
  useEffect(() => {
    if (!picked) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const fetchEntity = formKind === "plugin" ? getPluginInfo(picked.id, formGame) : getAuthorProfile(picked.id, formGame);
    fetchEntity
      .then((entity) => {
        if (!cancelled) setPreview(fillTemplate(template, placeholderValues(formKind, entity)));
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [picked, formKind, formGame, template]);

  function resetForm() {
    setEditingChannelId(null);
    setFormChannelId("");
    setChannelQuery("");
    setFormKind("plugin");
    setFormGame("runescape");
    setQuery("");
    setPicked(null);
    setMatches([]);
    setTemplate(DEFAULT_TEMPLATE);
    setFormError(null);
  }

  function startEdit(t: DiscordChannelTopic) {
    setEditingChannelId(t.channelId);
    setFormChannelId(t.channelId);
    setChannelQuery(t.channelName);
    setFormKind(t.entityKind);
    setFormGame("runescape"); // only used to route the preview fetch -- numeric ids resolve the same regardless
    setQuery(t.entityName);
    setPicked({ id: t.entityId, name: t.entityName });
    setTemplate(t.template);
    setFormError(null);
  }

  async function save() {
    if (!formChannelId || !picked) return;
    setSaving(true);
    setFormError(null);
    setSavePushWarning(false);
    try {
      const { pushError } = await saveDiscordChannelTopic(guildId, formChannelId, { entityKind: formKind, entityId: picked.id, template: template.trim() });
      setSavePushWarning(pushError === "missing_permissions");
      resetForm();
      load();
    } catch (err) {
      setFormError(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(channelId: string) {
    await deleteDiscordChannelTopic(guildId, channelId);
    if (editingChannelId === channelId) resetForm();
    load();
  }

  // Admin-only escape hatch (see the Refresh button below) -- pushes this
  // one binding right now instead of waiting for the hourly worker tick.
  async function refreshNow(channelId: string) {
    setRefreshingId(channelId);
    setRefreshError(null);
    try {
      const { topic } = await refreshDiscordChannelTopic(guildId, channelId);
      setMeta((prev) => (prev ? { ...prev, topics: prev.topics.map((t) => (t.channelId === channelId ? topic : t)) } : prev));
    } catch (err) {
      setRefreshError(err);
    } finally {
      setRefreshingId(null);
    }
  }

  if (loadError) {
    return <p className="dc-warn">Couldn&rsquo;t load channel topics: {loadError instanceof Error ? loadError.message : String(loadError)}</p>;
  }
  if (!channels || !meta) {
    return <LoadingState message="Loading channel topics…" />;
  }

  const topics = meta.topics;
  const boundChannelIds = new Set(topics.filter((t) => t.channelId !== editingChannelId).map((t) => t.channelId));
  const outLength = preview?.length ?? 0;
  const overLimit = outLength > CHAR_LIMIT;
  const atLimit = !editingChannelId && topics.length >= meta.maxBindings;
  const canSave = formChannelId !== "" && picked !== null && template.trim() !== "" && !overLimit && !atLimit;

  return (
    <>
      <div className="dc-tab-head">
        <h2 className="dc-h4">Channel topics</h2>
        <span className="dc-muted">Bind a channel&rsquo;s topic to one plugin or author. Unchanged topics are skipped on refresh.</span>
      </div>

      <div className="dc-card dc-card--pad dc-card--row">
        <div>
          <b className="dc-card__title">Refresh frequency</b>
          <div className="dc-dim">How often bound channels re-check their stats and push topic updates.</div>
        </div>
        <div className="dc-seg">
          {[5, 1].map((hours) => (
            <button
              key={hours}
              type="button"
              className={meta.intervalHours === hours ? "active" : ""}
              disabled={intervalSaving}
              onClick={() => changeInterval(hours)}
            >
              Every {hours}h{!meta.allowedIntervals.includes(hours) ? " (subscribers)" : ""}
            </button>
          ))}
        </div>
        <span className="dc-next-update">{nextUpdateLabel(topics.slice(0, meta.maxBindings), meta.intervalHours, now)}</span>
      </div>

      <div className="dc-embed-grid dc-topic-cards-grid">
      <div className="dc-card dc-list dc-topic-list-card">
        <div className="dc-topic-count">
          <span className="dc-dim">
            {topics.length} of {meta.maxBindings} bindings used
          </span>
        </div>
        {refreshError ? (
          refreshError instanceof DiscordApiError && refreshError.code === "missing_permissions" ? (
            <MissingPermissionsNotice guildId={guildId} action="push channel topics" />
          ) : (
            <p className="dc-warn">Refresh failed: {refreshError instanceof Error ? refreshError.message : String(refreshError)}</p>
          )
        ) : null}
        {savePushWarning && <MissingPermissionsNotice guildId={guildId} action="push channel topics" />}
        {Array.from({ length: Math.max(MIN_SLOTS, topics.length) }, (_, i) => topics[i] ?? null).map((t, i) => {
          if (t) {
            return (
              <div key={t.channelId} className="dc-list__row dc-topic-row">
                <div className="dc-topic-row__id">
                  <div className="dc-topic-row__head">
                    <b>#{t.channelName}</b>
                    {channels.find((c) => c.id === t.channelId)?.categoryName && (
                      <span className="dc-dim">{channels.find((c) => c.id === t.channelId)?.categoryName}</span>
                    )}
                    <span className="dc-dim">
                      {t.entityName} · {t.entityKind}
                    </span>
                  </div>
                  <span className="dc-topic-row__out">{t.lastRenderedTopic ?? t.template}</span>
                </div>
                <span className="dc-dim dc-topic-row__status">{timeAgo(t.lastRenderedAt)}</span>
                <div className="dc-topic-row__actions">
                  {((meta.isAdmin && meta.isSubscribed) || meta.isSiteAdmin) && (
                    <button
                      type="button"
                      className="dc-pill-outline dc-pill-outline--sm"
                      disabled={refreshingId === t.channelId}
                      title="Push this topic to Discord right now"
                      onClick={() => refreshNow(t.channelId)}
                    >
                      <RefreshIcon /> {refreshingId === t.channelId ? "Refreshing…" : "Refresh"}
                    </button>
                  )}
                  <button type="button" className="dc-pill-outline dc-pill-outline--sm" onClick={() => startEdit(t)}>
                    Edit
                  </button>
                  <button type="button" className="dc-pill-outline dc-pill-outline--sm dc-pill-outline--danger" onClick={() => setConfirmRemove(t)}>
                    Remove
                  </button>
                </div>
              </div>
            );
          }

          const locked = i >= meta.maxBindings;
          return (
            <div key={`slot-${i}`} className={`dc-list__row dc-topic-row dc-topic-row--${locked ? "locked" : "empty"}`}>
              {locked ? (
                <>
                  <div className="dc-topic-row__id">
                    <div className="dc-topic-row__head">
                      <LockIcon size={13} />
                      <span className="dc-dim">Locked</span>
                    </div>
                    <span className="dc-topic-row__out">Subscribe to unlock more bindings.</span>
                  </div>
                  <button type="button" className="dc-chip-btn" onClick={() => setSubscribeOpen(true)}>
                    Subscribe
                  </button>
                </>
              ) : (
                <div className="dc-topic-row__id">
                  <span className="dc-dim">Empty</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="dc-card dc-card--pad">
        <b className="dc-card__title">{editingChannelId ? `Edit #${channels.find((c) => c.id === editingChannelId)?.name ?? ""}` : "Bind a channel"}</b>
        {atLimit && (
          <div className="dc-form-row dc-form-row--end">
            <span className="dc-warn">You&rsquo;ve used all {meta.maxBindings} bindings on the free tier.</span>
            <button type="button" className="dc-chip-btn" onClick={() => setSubscribeOpen(true)}>
              Subscribe for more
            </button>
          </div>
        )}

        <div className="dc-embed-grid">
          <div className="dc-topic-form-fields">
            <label className="dc-field">
              <span>Type</span>
              <div className="dc-seg">
                {(["plugin", "author"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={formKind === k ? "active" : ""}
                    onClick={() => {
                      setFormKind(k);
                      setQuery("");
                      setPicked(null);
                    }}
                  >
                    {k === "plugin" ? "Plugin" : "Author"}
                  </button>
                ))}
              </div>
            </label>

            <div className="dc-form-row">
              <label className="dc-field dc-field--grow">
                <span>Channel</span>
                <div className="cmp-search-wrap dc-plugin-search">
                  <svg width="16" height="16" viewBox="0 0 16 16" className="cmp-search-icon">
                    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <input
                    value={channelQuery}
                    onChange={(e) => {
                      setChannelQuery(e.target.value);
                      setFormChannelId("");
                    }}
                    onFocus={() => setChannelSearchOpen(true)}
                    onBlur={() => setTimeout(() => setChannelSearchOpen(false), 150)}
                    placeholder="Search channels…"
                    className="cmp-search-input"
                  />
                  {channelSearchOpen && (
                    <div className="cmp-suggest-panel">
                      {channels
                        .filter((c) => c.name.toLowerCase().includes(channelQuery.trim().toLowerCase()))
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="cmp-suggest-row"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setFormChannelId(c.id);
                              setChannelQuery(c.name);
                              setChannelSearchOpen(false);
                            }}
                          >
                            <span className="cmp-suggest-main">
                              <span className="cmp-suggest-name">#{c.name}</span>
                              {c.categoryName && <span className="cmp-suggest-sub">{c.categoryName}</span>}
                            </span>
                            {boundChannelIds.has(c.id) && <span className="cmp-suggest-value">already bound</span>}
                          </button>
                        ))}
                      {channels.filter((c) => c.name.toLowerCase().includes(channelQuery.trim().toLowerCase())).length === 0 && (
                        <div className="cmp-suggest-empty">No channels match.</div>
                      )}
                    </div>
                  )}
                </div>
              </label>

              <label className="dc-field dc-field--grow">
                <span>{formKind === "plugin" ? "Plugin" : "Author"}</span>
                <div className="cmp-search-wrap dc-plugin-search">
                  <svg width="16" height="16" viewBox="0 0 16 16" className="cmp-search-icon">
                    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPicked(null);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                    placeholder={formKind === "plugin" ? "Search plugins…" : "Search authors…"}
                    className="cmp-search-input"
                  />
                  {searchOpen && !picked && (
                    <div className="cmp-suggest-panel">
                      <div className="dc-autocomplete__tabs">
                        {(["runescape", "runelite"] as const).map((g) => {
                          const option = GAMES.find((o) => o.key === g)!;
                          return (
                            <button
                              key={g}
                              type="button"
                              className={formGame === g ? "active" : ""}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => setFormGame(g)}
                            >
                              <img src={option.icon} alt="" referrerPolicy="no-referrer" />
                              {option.shortName}
                            </button>
                          );
                        })}
                      </div>
                      {matches.length > 0 ? (
                        matches.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="cmp-suggest-row"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setQuery(m.name);
                              setPicked({ id: m.id, name: m.name });
                              setMatches([]);
                              setSearchOpen(false);
                            }}
                          >
                            {"avatarUrl" in m && (
                              <span className="pp-palette__avatar">
                                {m.avatarUrl ? (
                                  <img src={m.avatarUrl} alt="" referrerPolicy="no-referrer" className="pp-palette__avatar-img" />
                                ) : (
                                  <span className="pp-palette__avatar-fallback">{initials(m.name)}</span>
                                )}
                              </span>
                            )}
                            <span className="cmp-suggest-main">
                              <span className="cmp-suggest-name">{m.name}</span>
                              <span className="cmp-suggest-sub">{"author" in m ? `by ${m.author}` : `${m.pluginCount} plugins`}</span>
                            </span>
                            <span className="cmp-suggest-value">{fmtCompact(m.total)}</span>
                          </button>
                        ))
                      ) : (
                        <div className="cmp-suggest-empty">{query.trim() ? "No matches" : "Nothing trending yet."}</div>
                      )}
                    </div>
                  )}
                </div>
              </label>
            </div>

          </div>

          <div className="dc-embed-preview">
            <div className="dc-embed-preview__head">
              <span className="dc-dim">Preview</span>
            </div>
            {picked ? (
              <div className="dc-channel-preview">
                <div className="dc-channel-preview__bar">
                  <span className="dc-channel-preview__hash">#</span>
                  <span className="dc-channel-preview__name">{channels.find((c) => c.id === formChannelId)?.name ?? "channel"}</span>
                  {channels.find((c) => c.id === formChannelId)?.categoryName && (
                    <span className="dc-channel-preview__category">{channels.find((c) => c.id === formChannelId)?.categoryName}</span>
                  )}
                </div>
                <span className="dc-channel-preview__topic">{preview ?? "Loading preview…"}</span>
                <span className={`dc-channel-preview__count ${overLimit ? "is-over" : ""}`}>
                  {outLength} / {CHAR_LIMIT}
                </span>
              </div>
            ) : (
              <div className="dc-empty">Pick a plugin or author to preview the topic.</div>
            )}
          </div>
        </div>

        <label className="dc-field">
          <span>Template</span>
          <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={2} className="dc-textarea dc-mono" />
        </label>
        <div className="dc-chip-row">
          <span className="dc-dim">Insert</span>
          {PLACEHOLDERS[formKind].map((p) => (
            <button
              key={p}
              type="button"
              className="dc-chip-btn dc-mono pp-tip"
              data-tooltip={PLACEHOLDER_HELP[formKind][p]}
              onClick={() => setTemplate((prev) => (prev && !/\s$/.test(prev) ? prev + " " : prev) + p)}
            >
              {p}
            </button>
          ))}
        </div>

        {formError ? <p className="dc-warn">{formError instanceof Error ? formError.message : String(formError)}</p> : null}

        <div className="dc-form-actions dc-form-actions--center">
          {editingChannelId && (
            <button type="button" className="dc-pill-outline" onClick={resetForm}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="dc-pill-primary"
            disabled={!canSave || saving}
            onClick={() => (boundChannelIds.has(formChannelId) ? setConfirmOverwrite(true) : save())}
          >
            {saving ? "Saving…" : editingChannelId ? "Save changes" : "Bind channel"}
          </button>
        </div>
      </div>
      </div>

      {subscribeOpen && <SubscribeModal onClose={() => setSubscribeOpen(false)} />}

      {confirmRemove && (
        <ConfirmDialog
          title="Remove channel topic?"
          message={`#${confirmRemove.channelName} will stop updating and go back to whatever topic it had before.`}
          confirmLabel="Remove"
          onConfirm={() => {
            remove(confirmRemove.channelId);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {confirmOverwrite && (
        <ConfirmDialog
          title="Replace existing binding?"
          message={`#${channels.find((c) => c.id === formChannelId)?.name ?? "This channel"} is already bound to ${
            topics.find((t) => t.channelId === formChannelId)?.entityName ?? "another entity"
          }. Saving will replace it.`}
          confirmLabel="Replace"
          onConfirm={() => {
            setConfirmOverwrite(false);
            save();
          }}
          onCancel={() => setConfirmOverwrite(false)}
        />
      )}
    </>
  );
}

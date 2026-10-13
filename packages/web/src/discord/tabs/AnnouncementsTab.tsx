import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createDiscordAnnouncementWatch,
  DiscordApiError,
  deleteDiscordAnnouncementWatch,
  deleteDiscordEntityAnnouncement,
  getDiscordAnnouncementEmbed,
  getDiscordAnnouncementWatches,
  getDiscordEntityAnnouncements,
  getDiscordGuildChannels,
  getDiscordGuildRoles,
  saveDiscordEntityAnnouncement,
  search,
  setDiscordAnnouncementEmbed,
  testDiscordAnnouncementWatch,
  testDiscordEntityAnnouncement,
  updateDiscordAnnouncementWatch,
  type DiscordAnnouncementKind,
  type DiscordAnnouncementWatch,
  type DiscordAnnouncementWatchInput,
  type DiscordEntityAnnouncement,
  type DiscordEntityAnnouncementInput,
  type DiscordEntityAnnouncementKind,
  type DiscordGuildAnnouncementEmbed,
  type DiscordGuildChannel,
  type DiscordGuildRole,
  type DiscordPing,
  type DiscordTopicEntityKind,
  type SearchAuthorRow,
  type SearchPluginRow,
} from "../../api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { LockIcon } from "../../components/icons";
import { LoadingState } from "../../components/LoadingState";
import { GAMES } from "../../components/GameSwitcher";
import { initials } from "../../components/SearchBox";
import type { Game } from "../../context/GameContext";
import { MissingPermissionsNotice } from "../MissingPermissionsNotice";
import { SubscribeModal } from "../SubscribeModal";

const SUB_TABS = [
  { key: "global", label: "Global" },
  { key: "plugins", label: "Per plugin/author" },
  { key: "embed", label: "Embed builder" },
] as const;
type SubTabKey = (typeof SUB_TABS)[number]["key"];

const ALL_GAMES = ["runescape", "runelite"] as const;

function gameLabel(g: string): string {
  return g === "runescape" ? "RuneScape" : "RuneLite";
}

function siteLabel(g: string): string {
  return g === "runescape" ? "mod.io" : "RuneLite Plugin Hub";
}

function fmtCompact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(n);
}

function pingSummary(ping: DiscordPing): string {
  const parts: string[] = [];
  if (ping.pingEveryone) parts.push("@everyone");
  else if (ping.pingHere) parts.push("@here");
  parts.push(...ping.pingRoleNames.map((n) => `@${n}`));
  return parts.length > 0 ? parts.join(", ") : "No ping";
}

export function AnnouncementsTab({ guildId }: { guildId: string }) {
  const [sub, setSub] = useState<SubTabKey>("global");

  return (
    <>
      <div className="dc-tab-head">
        <h2 className="dc-h4">Announcements</h2>
        <span className="dc-muted">Post new plugins and updates to a channel &mdash; globally, or for specific plugins/authors.</span>
      </div>

      <div className="dc-seg dc-seg--inline" style={{ alignSelf: "flex-start" }}>
        {SUB_TABS.map((t) => (
          <button key={t.key} type="button" className={sub === t.key ? "active" : ""} onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === "global" && <GlobalWatchesPanel guildId={guildId} />}
      {sub === "plugins" && <PerEntityPanel guildId={guildId} />}
      {sub === "embed" && <EmbedBuilderPanel guildId={guildId} />}
    </>
  );
}

// ---------- Shared: channel search ----------

function ChannelSearchField({
  channels,
  value,
  onChange,
}: {
  channels: DiscordGuildChannel[];
  value: { id: string; name: string } | null;
  onChange: (channel: { id: string; name: string } | null) => void;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value]);

  const matches = channels.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <label className="dc-field dc-field--grow">
      <span>Channel</span>
      <div className="cmp-search-wrap dc-plugin-search">
        <svg width="16" height="16" viewBox="0 0 16 16" className="cmp-search-icon">
          <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search channels…"
          className="cmp-search-input"
        />
        {open && (
          <div className="cmp-suggest-panel">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                className="cmp-suggest-row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ id: c.id, name: c.name });
                  setQuery(c.name);
                  setOpen(false);
                }}
              >
                <span className="cmp-suggest-main">
                  <span className="cmp-suggest-name">#{c.name}</span>
                  {c.categoryName && <span className="cmp-suggest-sub">{c.categoryName}</span>}
                </span>
              </button>
            ))}
            {matches.length === 0 && <div className="cmp-suggest-empty">No channels match.</div>}
          </div>
        )}
      </div>
    </label>
  );
}

// ---------- Shared: ping type + multi-role picker ----------

// Single multi-select dropdown for the whole ping choice -- @everyone and
// @here sit at the top as special entries alongside every real server
// role, all independently toggleable (picking @here plus two roles in
// the same post is a normal combination, not a special case -- Discord's
// own allowedMentions model supports it natively). @everyone and @here
// are mutually exclusive with *each other* (picking one clears the
// other) since there's no point pinging both, but neither is exclusive
// with roles. Every role is selectable regardless of its own
// "mentionable" toggle (Discord: Server Settings -> Roles -> a role's own
// "allow anyone to @mention this role" switch) -- that toggle only
// limits regular members; the bot's own "Mention @everyone, @here, and
// All Roles" permission (already requested in its invite set, see
// buildBotInstallUrl in packages/api/src/lib/discordAuth.ts) lets it ping
// *any* role regardless of that flag.
function PingField({
  roles,
  pingHere,
  pingEveryone,
  roleIds,
  onChange,
}: {
  roles: DiscordGuildRole[];
  pingHere: boolean;
  pingEveryone: boolean;
  roleIds: string[];
  onChange: (next: { pingHere: boolean; pingEveryone: boolean; roleIds: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function toggleSpecial(type: "here" | "everyone") {
    if (type === "everyone") onChange({ pingHere: false, pingEveryone: !pingEveryone, roleIds });
    else onChange({ pingHere: !pingHere, pingEveryone: false, roleIds });
  }

  function toggleRole(id: string) {
    const nextIds = roleIds.includes(id) ? roleIds.filter((x) => x !== id) : [...roleIds, id];
    onChange({ pingHere, pingEveryone, roleIds: nextIds });
  }

  const selectedRoleNames = roles.filter((r) => roleIds.includes(r.id)).map((r) => r.name);
  const specialLabels = [pingEveryone && "@everyone", pingHere && "@here"].filter(Boolean) as string[];
  const triggerLabel = [...specialLabels, ...selectedRoleNames.map((n) => `@${n}`)].join(", ") || "No ping";

  return (
    <div className="dc-field">
      <span>Ping</span>
      <div className="dropdown" ref={ref}>
        <button type="button" className="dropdown-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span>{triggerLabel}</span>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <ul role="listbox" aria-multiselectable="true" aria-label="Ping" className="dropdown-list">
            <li role="option" aria-selected={pingEveryone}>
              <button type="button" className={`dropdown-option ${pingEveryone ? "active" : ""}`} onClick={() => toggleSpecial("everyone")}>
                <span className="dc-role-check">{pingEveryone ? "✓" : ""}</span>@everyone
              </button>
            </li>
            <li role="option" aria-selected={pingHere}>
              <button type="button" className={`dropdown-option ${pingHere ? "active" : ""}`} onClick={() => toggleSpecial("here")}>
                <span className="dc-role-check">{pingHere ? "✓" : ""}</span>@here
              </button>
            </li>
            <li role="none" className="dropdown-divider" aria-hidden="true" />
            {roles.length === 0 && (
              <li role="none">
                <span className="dropdown-option dropdown-option--static">No roles found.</span>
              </li>
            )}
            {roles.map((r) => {
              const on = roleIds.includes(r.id);
              return (
                <li key={r.id} role="option" aria-selected={on}>
                  <button type="button" className={`dropdown-option ${on ? "active" : ""}`} onClick={() => toggleRole(r.id)}>
                    <span className="dc-role-check">{on ? "✓" : ""}</span>@{r.name}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {(pingHere || pingEveryone) && (
        <span className="dc-warn dc-warn--loud">
          {pingEveryone ? "@everyone notifies every member of the server, including offline members." : "@here notifies every online member of the server."}
        </span>
      )}
    </div>
  );
}

// ---------- Global tab ----------

function GlobalWatchesPanel({ guildId }: { guildId: string }) {
  const [channels, setChannels] = useState<DiscordGuildChannel[] | null>(null);
  const [roles, setRoles] = useState<DiscordGuildRole[] | null>(null);
  const [watches, setWatches] = useState<DiscordAnnouncementWatch[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [channel, setChannel] = useState<{ id: string; name: string } | null>(null);
  const [kind, setKind] = useState<DiscordAnnouncementKind>("release");
  const [games, setGames] = useState<string[]>(["runescape", "runelite"]);
  const [pingHere, setPingHere] = useState(false);
  const [pingEveryone, setPingEveryone] = useState(false);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [showThumbnail, setShowThumbnail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const [confirmRemove, setConfirmRemove] = useState<DiscordAnnouncementWatch | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; error: unknown } | { id: number; ok: true } | null>(null);

  function load() {
    setLoadError(null);
    Promise.all([getDiscordGuildChannels(guildId), getDiscordGuildRoles(guildId), getDiscordAnnouncementWatches(guildId)])
      .then(([ch, rl, w]) => {
        setChannels(ch.channels);
        setRoles(rl.roles);
        setWatches(w.watches);
      })
      .catch((err) => setLoadError(err));
  }

  useEffect(() => {
    setChannels(null);
    setRoles(null);
    setWatches(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  function resetForm() {
    setEditingId(null);
    setChannel(null);
    setKind("release");
    setGames(["runescape", "runelite"]);
    setPingHere(false);
    setPingEveryone(false);
    setRoleIds([]);
    setShowThumbnail(true);
    setFormError(null);
  }

  function startEdit(w: DiscordAnnouncementWatch) {
    setEditingId(w.id);
    setChannel({ id: w.channelId, name: w.channelName });
    setKind(w.kind);
    setGames(w.games);
    setPingHere(w.pingHere);
    setPingEveryone(w.pingEveryone);
    setRoleIds(w.pingRoleIds);
    setShowThumbnail(w.showThumbnail);
    setFormError(null);
  }

  async function save() {
    if (!channel || games.length === 0) return;
    setSaving(true);
    setFormError(null);
    const input: DiscordAnnouncementWatchInput = { channelId: channel.id, kind, games, pingHere, pingEveryone, pingRoleIds: roleIds, showThumbnail };
    try {
      if (editingId) await updateDiscordAnnouncementWatch(guildId, editingId, input);
      else await createDiscordAnnouncementWatch(guildId, input);
      resetForm();
      load();
    } catch (err) {
      setFormError(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    await deleteDiscordAnnouncementWatch(guildId, id);
    if (editingId === id) resetForm();
    load();
  }

  async function test(id: number) {
    setTestingId(id);
    setTestResult(null);
    try {
      await testDiscordAnnouncementWatch(guildId, id);
      setTestResult({ id, ok: true });
      const w = watches?.find((w) => w.id === id);
      toast.success(w ? `Test sent to #${w.channelName}.` : "Test sent.");
    } catch (err) {
      setTestResult({ id, error: err });
      toast.error(
        err instanceof DiscordApiError && err.code === "missing_permissions"
          ? "The bot is missing permissions to post in that channel."
          : err instanceof Error
            ? err.message
            : "Test failed.",
      );
    } finally {
      setTestingId(null);
    }
  }

  if (loadError) {
    return <p className="dc-warn">Couldn&rsquo;t load Announcements: {loadError instanceof Error ? loadError.message : String(loadError)}</p>;
  }
  if (!channels || !roles || !watches) {
    return <LoadingState message="Loading announcements…" />;
  }

  const canSave = channel !== null && games.length > 0;

  return (
    <div className="dc-embed-grid">
      <div className="dc-card dc-list">
        {watches.length === 0 && <div className="dc-empty">No global watches yet. Add one on the right.</div>}
        {watches.map((w) => (
          <div key={w.id} className="dc-topic-row-wrap">
            <div className="dc-list__row dc-topic-row">
              <div className="dc-topic-row__id">
                <div className="dc-topic-row__head">
                  <b>#{w.channelName}</b>
                  <span className="dc-dim">{w.kind === "release" ? "New releases" : "Updates"}</span>
                </div>
                <span className="dc-topic-row__out">
                  {w.games.map(gameLabel).join(" + ")} &middot; {pingSummary(w)} &middot; {w.showThumbnail ? "Thumbnail on" : "No thumbnail"}
                </span>
              </div>
              <div className="dc-topic-row__actions">
                <button type="button" className="dc-pill-outline dc-pill-outline--sm" disabled={testingId === w.id} onClick={() => test(w.id)}>
                  {testingId === w.id ? "Sending…" : "Test"}
                </button>
                <button type="button" className="dc-pill-outline dc-pill-outline--sm" onClick={() => startEdit(w)}>
                  Edit
                </button>
                <button type="button" className="dc-pill-outline dc-pill-outline--sm dc-pill-outline--danger" onClick={() => setConfirmRemove(w)}>
                  Remove
                </button>
              </div>
            </div>
            {testResult && testResult.id === w.id && (
              <div className="dc-topic-test-result">
                {"ok" in testResult ? (
                  <span className="dc-dim">Test sent to #{w.channelName}.</span>
                ) : testResult.error instanceof DiscordApiError && testResult.error.code === "missing_permissions" ? (
                  <MissingPermissionsNotice guildId={guildId} action="post in this channel" />
                ) : (
                  <p className="dc-warn">Test failed: {testResult.error instanceof Error ? testResult.error.message : String(testResult.error)}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="dc-card dc-card--pad">
        <b className="dc-card__title">{editingId ? "Edit watch" : "Add a global watch"}</b>

        <div className="dc-form-row">
          <ChannelSearchField channels={channels} value={channel} onChange={setChannel} />

          <label className="dc-field">
            <span>Event</span>
            <div className="dc-seg">
              {(["release", "update"] as const).map((k) => (
                <button key={k} type="button" className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
                  {k === "release" ? "New releases" : "Updates"}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="dc-field">
          <span>Games</span>
          <div className="dc-chip-wrap">
            {ALL_GAMES.map((g) => (
              <button
                key={g}
                type="button"
                className={`dc-toggle-chip ${games.includes(g) ? "on" : ""}`}
                aria-pressed={games.includes(g)}
                onClick={() => setGames((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))}
              >
                <span>{games.includes(g) ? "✓" : "+"}</span>
                {gameLabel(g)}
              </button>
            ))}
          </div>
          {games.length === 0 && <span className="dc-warn">Pick at least one game.</span>}
        </div>

        <PingField
          roles={roles}
          pingHere={pingHere}
          pingEveryone={pingEveryone}
          roleIds={roleIds}
          onChange={(n) => {
            setPingHere(n.pingHere);
            setPingEveryone(n.pingEveryone);
            setRoleIds(n.roleIds);
          }}
        />

        <label className="dc-field dc-field--row">
          <button type="button" role="switch" aria-checked={showThumbnail} className={`dc-switch ${showThumbnail ? "on" : ""}`} onClick={() => setShowThumbnail((v) => !v)}>
            <span className="dc-switch__knob" />
          </button>
          <span>Show plugin thumbnail</span>
        </label>

        {formError ? <p className="dc-warn">{formError instanceof Error ? formError.message : String(formError)}</p> : null}

        <div className="dc-form-actions dc-form-actions--center">
          {editingId && (
            <button type="button" className="dc-pill-outline" onClick={resetForm}>
              Cancel
            </button>
          )}
          <button type="button" className="dc-pill-primary" disabled={!canSave || saving} onClick={save}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Add watch"}
          </button>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove watch?"
          message={`#${confirmRemove.channelName} will stop getting ${confirmRemove.kind === "release" ? "new release" : "update"} announcements from this rule.`}
          confirmLabel="Remove"
          onConfirm={() => {
            remove(confirmRemove.id);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

// ---------- Per plugin/author tab ----------

type PickedEntity = { id: number; name: string };

function PerEntityPanel({ guildId }: { guildId: string }) {
  const [channels, setChannels] = useState<DiscordGuildChannel[] | null>(null);
  const [roles, setRoles] = useState<DiscordGuildRole[] | null>(null);
  const [bindings, setBindings] = useState<DiscordEntityAnnouncement[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [channel, setChannel] = useState<{ id: string; name: string } | null>(null);
  const [entityKind, setEntityKind] = useState<DiscordTopicEntityKind>("plugin");
  const [query, setQuery] = useState("");
  const [entityGame, setEntityGame] = useState<Game>("runescape");
  const [picked, setPicked] = useState<PickedEntity | null>(null);
  const [matches, setMatches] = useState<(SearchPluginRow | SearchAuthorRow)[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [kind, setKind] = useState<DiscordEntityAnnouncementKind>("both");
  const [pingHere, setPingHere] = useState(false);
  const [pingEveryone, setPingEveryone] = useState(false);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [showThumbnail, setShowThumbnail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const [confirmRemove, setConfirmRemove] = useState<DiscordEntityAnnouncement | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; error: unknown } | { id: number; ok: true } | null>(null);

  function load() {
    setLoadError(null);
    Promise.all([getDiscordGuildChannels(guildId), getDiscordGuildRoles(guildId), getDiscordEntityAnnouncements(guildId)])
      .then(([ch, rl, b]) => {
        setChannels(ch.channels);
        setRoles(rl.roles);
        setBindings(b.bindings);
      })
      .catch((err) => setLoadError(err));
  }

  useEffect(() => {
    setChannels(null);
    setRoles(null);
    setBindings(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  useEffect(() => {
    if (!searchOpen || picked) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(
      () => {
        search(query, entityGame, 6)
          .then((res) => {
            if (!cancelled) setMatches(entityKind === "plugin" ? res.plugins : res.authors);
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
  }, [query, entityGame, entityKind, picked, searchOpen]);

  function resetForm() {
    setChannel(null);
    setEntityKind("plugin");
    setQuery("");
    setPicked(null);
    setMatches([]);
    setKind("both");
    setPingHere(false);
    setPingEveryone(false);
    setRoleIds([]);
    setShowThumbnail(true);
    setFormError(null);
  }

  async function save() {
    if (!channel || !picked) return;
    setSaving(true);
    setFormError(null);
    const input: DiscordEntityAnnouncementInput = { channelId: channel.id, entityKind, entityId: picked.id, kind, pingHere, pingEveryone, pingRoleIds: roleIds, showThumbnail };
    try {
      await saveDiscordEntityAnnouncement(guildId, input);
      resetForm();
      load();
    } catch (err) {
      setFormError(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    await deleteDiscordEntityAnnouncement(guildId, id);
    load();
  }

  async function test(id: number) {
    setTestingId(id);
    setTestResult(null);
    try {
      await testDiscordEntityAnnouncement(guildId, id);
      setTestResult({ id, ok: true });
      const b = bindings?.find((b) => b.id === id);
      toast.success(b ? `Test sent to #${b.channelName}.` : "Test sent.");
    } catch (err) {
      setTestResult({ id, error: err });
      toast.error(
        err instanceof DiscordApiError && err.code === "missing_permissions"
          ? "The bot is missing permissions to post in that channel."
          : err instanceof Error
            ? err.message
            : "Test failed.",
      );
    } finally {
      setTestingId(null);
    }
  }

  if (loadError) {
    return <p className="dc-warn">Couldn&rsquo;t load Announcements: {loadError instanceof Error ? loadError.message : String(loadError)}</p>;
  }
  if (!channels || !roles || !bindings) {
    return <LoadingState message="Loading announcements…" />;
  }

  const canSave = channel !== null && picked !== null;

  return (
    <div className="dc-embed-grid">
      <div className="dc-card dc-list">
        {bindings.length === 0 && <div className="dc-empty">No per-plugin/author bindings yet. These post in addition to any Global watch that also matches.</div>}
        {bindings.map((b) => (
          <div key={b.id} className="dc-topic-row-wrap">
            <div className="dc-list__row dc-topic-row">
              <div className="dc-topic-row__id">
                <div className="dc-topic-row__head">
                  <b>#{b.channelName}</b>
                  <span className="dc-dim">
                    {b.entityName} &middot; {b.entityKind}
                  </span>
                </div>
                <span className="dc-topic-row__out">
                  {b.kind === "both" ? "Releases + updates" : b.kind === "release" ? "New release only" : "Updates only"} &middot; {pingSummary(b)} &middot;{" "}
                  {b.showThumbnail ? "Thumbnail on" : "No thumbnail"}
                </span>
              </div>
              <div className="dc-topic-row__actions">
                <button type="button" className="dc-pill-outline dc-pill-outline--sm" disabled={testingId === b.id} onClick={() => test(b.id)}>
                  {testingId === b.id ? "Sending…" : "Test"}
                </button>
                <button type="button" className="dc-pill-outline dc-pill-outline--sm dc-pill-outline--danger" onClick={() => setConfirmRemove(b)}>
                  Remove
                </button>
              </div>
            </div>
            {testResult && testResult.id === b.id && (
              <div className="dc-topic-test-result">
                {"ok" in testResult ? (
                  <span className="dc-dim">Test sent to #{b.channelName}.</span>
                ) : testResult.error instanceof DiscordApiError && testResult.error.code === "missing_permissions" ? (
                  <MissingPermissionsNotice guildId={guildId} action="post in this channel" />
                ) : (
                  <p className="dc-warn">Test failed: {testResult.error instanceof Error ? testResult.error.message : String(testResult.error)}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="dc-card dc-card--pad">
        <b className="dc-card__title">Add a plugin/author binding</b>

        <div className="dc-form-row">
          <ChannelSearchField channels={channels} value={channel} onChange={setChannel} />

          <label className="dc-field">
            <span>Type</span>
            <div className="dc-seg">
              {(["plugin", "author"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={entityKind === k ? "active" : ""}
                  onClick={() => {
                    setEntityKind(k);
                    setQuery("");
                    setPicked(null);
                  }}
                >
                  {k === "plugin" ? "Plugin" : "Author"}
                </button>
              ))}
            </div>
          </label>
        </div>

        <label className="dc-field">
          <span>{entityKind === "plugin" ? "Plugin" : "Author"}</span>
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
              placeholder={entityKind === "plugin" ? "Search plugins…" : "Search authors…"}
              className="cmp-search-input"
            />
            {searchOpen && !picked && (
              <div className="cmp-suggest-panel">
                <div className="dc-autocomplete__tabs">
                  {(["runescape", "runelite"] as const).map((g) => {
                    const option = GAMES.find((o) => o.key === g)!;
                    return (
                      <button key={g} type="button" className={entityGame === g ? "active" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => setEntityGame(g)}>
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

        <label className="dc-field">
          <span>Announce</span>
          <div className="dc-seg dc-seg--inline">
            {(["both", "release", "update"] as const).map((k) => (
              <button key={k} type="button" className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
                {k === "both" ? "Release + updates" : k === "release" ? "Release only" : "Updates only"}
              </button>
            ))}
          </div>
        </label>

        <PingField
          roles={roles}
          pingHere={pingHere}
          pingEveryone={pingEveryone}
          roleIds={roleIds}
          onChange={(n) => {
            setPingHere(n.pingHere);
            setPingEveryone(n.pingEveryone);
            setRoleIds(n.roleIds);
          }}
        />

        <label className="dc-field dc-field--row">
          <button type="button" role="switch" aria-checked={showThumbnail} className={`dc-switch ${showThumbnail ? "on" : ""}`} onClick={() => setShowThumbnail((v) => !v)}>
            <span className="dc-switch__knob" />
          </button>
          <span>Show plugin thumbnail</span>
        </label>

        {formError ? <p className="dc-warn">{formError instanceof Error ? formError.message : String(formError)}</p> : null}

        <div className="dc-form-actions dc-form-actions--center">
          <button type="button" className="dc-pill-primary" disabled={!canSave || saving} onClick={save}>
            {saving ? "Saving…" : "Add binding"}
          </button>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove binding?"
          message={`${confirmRemove.entityName} will stop being specifically announced in #${confirmRemove.channelName}.`}
          confirmLabel="Remove"
          onConfirm={() => {
            remove(confirmRemove.id);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

// ---------- Embed builder tab ----------

function EmbedBuilderPanel({ guildId }: { guildId: string }) {
  const [data, setData] = useState<{ embed: DiscordGuildAnnouncementEmbed; isSubscribed: boolean } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [form, setForm] = useState<DiscordGuildAnnouncementEmbed | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  useEffect(() => {
    setData(null);
    setLoadError(null);
    getDiscordAnnouncementEmbed(guildId)
      .then((res) => {
        setData(res);
        setForm(res.embed);
      })
      .catch((err) => setLoadError(err));
  }, [guildId]);

  if (loadError) {
    return <p className="dc-warn">Couldn&rsquo;t load the embed builder: {loadError instanceof Error ? loadError.message : String(loadError)}</p>;
  }
  if (!data || !form) {
    return <LoadingState message="Loading embed builder…" />;
  }

  const previewGame = "runescape";
  const previewValues = {
    name: "Quest Helper",
    author: "JosTheFarmer",
    game: gameLabel(previewGame),
    site: siteLabel(previewGame),
    version: "1.4.2",
    verb: "New plugin",
    verb_lower: "was just published",
  };
  function fill(template: string): string {
    return template.replace(/\{(\w+)\}/g, (m, key: string) => (previewValues as Record<string, string>)[key] ?? m);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await setDiscordAnnouncementEmbed(guildId, {
        color: form.color,
        titleTemplate: form.titleTemplate,
        descriptionTemplate: form.descriptionTemplate,
        footerTemplate: form.footerTemplate,
        showThumbnail: form.showThumbnail,
      });
      setForm(res.embed);
      setSaved(true);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dc-embed-grid">
      {data.isSubscribed ? (
        <div className="dc-card dc-card--pad">
          <label className="dc-field">
            <span>Colour</span>
            <input
              type="color"
              value={form.color}
              onChange={(e) => {
                setForm({ ...form, color: e.target.value });
                setSaved(false);
              }}
              className="dc-input dc-input--xs"
            />
          </label>
          <label className="dc-field">
            <span>Title</span>
            <input
              value={form.titleTemplate}
              onChange={(e) => {
                setForm({ ...form, titleTemplate: e.target.value });
                setSaved(false);
              }}
              className="dc-input dc-mono"
            />
          </label>
          <label className="dc-field">
            <span>Description</span>
            <textarea
              value={form.descriptionTemplate}
              onChange={(e) => {
                setForm({ ...form, descriptionTemplate: e.target.value });
                setSaved(false);
              }}
              rows={2}
              className="dc-textarea dc-mono"
            />
          </label>
          <label className="dc-field">
            <span>Footer</span>
            <input
              value={form.footerTemplate}
              onChange={(e) => {
                setForm({ ...form, footerTemplate: e.target.value });
                setSaved(false);
              }}
              placeholder="(none)"
              className="dc-input"
            />
          </label>
          <label className="dc-field dc-field--row">
            <button
              type="button"
              role="switch"
              aria-checked={form.showThumbnail}
              className={`dc-switch ${form.showThumbnail ? "on" : ""}`}
              onClick={() => {
                setForm({ ...form, showThumbnail: !form.showThumbnail });
                setSaved(false);
              }}
            >
              <span className="dc-switch__knob" />
            </button>
            <span>Show plugin thumbnail by default</span>
          </label>
          <div className="dc-chip-row">
            <span className="dc-dim">Placeholders</span>
            {["{name}", "{author}", "{game}", "{site}", "{version}", "{verb}", "{verb_lower}"].map((p) => (
              <span key={p} className="dc-ph-chip dc-mono">
                {p}
              </span>
            ))}
          </div>

          {saveError ? <p className="dc-warn">{saveError instanceof Error ? saveError.message : String(saveError)}</p> : null}
          <div className="dc-form-actions">
            {saved && <span className="dc-dim">Saved.</span>}
            <button type="button" className="dc-pill-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : (
        <div className="dc-card dc-card--pad dc-locked-feature">
          <span className="dc-locked-feature__icon">
            <LockIcon size={18} />
          </span>
          <b className="dc-locked-feature__title">The embed builder is a subscriber feature</b>
          <p className="dc-locked-feature__desc">
            The preview on the right is how your announcements look right now, with the defaults. Subscribe to customize the colour, title, description, footer, and thumbnail.
          </p>
          <button type="button" className="dc-pill-primary" onClick={() => setSubscribeOpen(true)}>
            Subscribe
          </button>
          {subscribeOpen && <SubscribeModal onClose={() => setSubscribeOpen(false)} />}
        </div>
      )}

      <div className="dc-embed-preview">
        <div className="dc-embed-preview__head">
          <span className="dc-dim">Preview{data.isSubscribed ? "" : " (default)"}</span>
        </div>
        <div className="dc-discord-msg">
          <img src="/logo/icon-2a-hex.svg" alt="" className="dc-discord-msg__avatar dc-discord-msg__avatar--app" />
          <div className="dc-discord-msg__body">
            <div className="dc-discord-msg__head">
              <b>PluginPulse</b>
              <span className="dc-discord-tag dc-discord-tag--app">APP</span>
              <span className="dc-discord-msg__time">Today at 14:02</span>
            </div>
            <div className="dc-embed" style={{ borderLeftColor: form.color }}>
              <span className="dc-embed__by">{`by ${previewValues.author} · ${previewValues.site}`}</span>
              <div className="dc-embed-pv__top">
                <div className="dc-embed-pv__text">
                  <span className="dc-embed__linktitle">{fill(form.titleTemplate)}</span>
                  <span className="dc-embed__body">{fill(form.descriptionTemplate)}</span>
                </div>
                {form.showThumbnail && <img src="/logo/icon-2a-hex.svg" alt="" className="dc-embed-pv__thumb" />}
              </div>
              {form.footerTemplate && <span className="dc-embed__foot">{fill(form.footerTemplate)}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

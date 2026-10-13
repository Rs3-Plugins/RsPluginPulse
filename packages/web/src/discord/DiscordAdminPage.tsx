import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDiscordSiteMod,
  getDiscordAdminPanel,
  grantDiscordGuildSubscriptionGlobal,
  removeDiscordSiteMod,
  revokeDiscordGuildSubscriptionGlobal,
  type DiscordAdminPanelResponse,
  type SiteAdmin,
} from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LoadingState } from "../components/LoadingState";
import { usePageMeta } from "../hooks/usePageMeta";

// Matches the API's own validation in admin/mods/[discordUserId]/route.ts.
const SNOWFLAKE = /^\d{17,20}$/;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Site-wide admin panel -- global, not scoped to any one guild (see
// /api/discord/admin). Reached from ProfileMenu.tsx's "Admin Management"
// entry, which only shows up at all once DiscordAuthContext's user.isSiteAdmin
// is true -- there's no separate "am I allowed" check here beyond the
// load call itself 403ing.
export function DiscordAdminPage() {
  const [data, setData] = useState<DiscordAdminPanelResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [newModId, setNewModId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<unknown>(null);
  const [removeError, setRemoveError] = useState<unknown>(null);
  const [confirmRemove, setConfirmRemove] = useState<SiteAdmin | null>(null);
  const [savingGuildId, setSavingGuildId] = useState<string | null>(null);

  usePageMeta({
    title: "Admin Management · PluginPulse for Discord",
    description: "Manage site-wide mods and every server's subscription.",
    canonicalPath: "/discord/admin",
  });

  function load() {
    setLoadError(null);
    getDiscordAdminPanel()
      .then(setData)
      .catch((err) => setLoadError(err));
  }

  useEffect(() => {
    load();
  }, []);

  async function addMod() {
    const id = newModId.trim();
    if (!SNOWFLAKE.test(id)) {
      setAddError(new Error("That doesn't look like a Discord user ID (17-20 digits)."));
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await addDiscordSiteMod(id);
      setNewModId("");
      load();
    } catch (err) {
      setAddError(err);
    } finally {
      setAdding(false);
    }
  }

  async function removeMod(discordUserId: string) {
    setRemoveError(null);
    try {
      await removeDiscordSiteMod(discordUserId);
      load();
    } catch (err) {
      setRemoveError(err);
    }
  }

  async function toggleGuildSubscription(guildId: string, next: boolean) {
    setSavingGuildId(guildId);
    try {
      if (next) await grantDiscordGuildSubscriptionGlobal(guildId);
      else await revokeDiscordGuildSubscriptionGlobal(guildId);
      load();
    } finally {
      setSavingGuildId(null);
    }
  }

  if (loadError) {
    return (
      <section className="dc-server">
        <p className="dc-warn">Couldn&rsquo;t load the admin panel: {loadError instanceof Error ? loadError.message : String(loadError)}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="dc-server">
        <LoadingState message="Loading admin panel…" />
      </section>
    );
  }

  function userLabel(id: string): { name: string; avatarUrl: string | null } {
    const user = data!.users[id];
    return user ? { name: user.username, avatarUrl: user.avatarUrl } : { name: id, avatarUrl: null };
  }

  return (
    <section className="dc-server">
      <div className="dc-tab-head">
        <h2 className="dc-h4">Admin Management</h2>
        <span className="dc-muted">Site-wide: manage mods and every server&rsquo;s subscription, independent of any one server&rsquo;s own admins.</span>
      </div>

      <div className="dc-card dc-card--pad dc-list">
        <b className="dc-card__title">Mods</b>
        <div className="dc-dim">Site-wide mods can grant or revoke any server&rsquo;s subscription from the list below.</div>

        {data.mods.length === 0 && <div className="dc-empty">No extra mods yet.</div>}
        {data.mods.map((mod) => {
          const user = userLabel(mod.discordUserId);
          const addedBy = userLabel(mod.addedBy);
          return (
            <div key={mod.id} className="dc-list__row">
              <div className="dc-topic-row__id">
                <div className="dc-topic-row__head">
                  {user.avatarUrl && <img src={user.avatarUrl} alt="" className="dc-admin-avatar" referrerPolicy="no-referrer" />}
                  <b>{user.name}</b>
                  <span className="dc-dim">{mod.discordUserId}</span>
                </div>
                <span className="dc-dim">
                  Added by {addedBy.name} &middot; {formatDate(mod.createdAt)}
                </span>
              </div>
              <button type="button" className="dc-pill-outline dc-pill-outline--sm dc-pill-outline--danger" onClick={() => setConfirmRemove(mod)}>
                Remove
              </button>
            </div>
          );
        })}
        {removeError ? <p className="dc-warn">{removeError instanceof Error ? removeError.message : String(removeError)}</p> : null}

        <div className="dc-form-row">
          <label className="dc-field dc-field--grow">
            <span>Add mod (Discord user ID)</span>
            <input
              value={newModId}
              onChange={(e) => {
                setNewModId(e.target.value);
                setAddError(null);
              }}
              placeholder="e.g. 724620008658829363"
              className="dc-input dc-mono"
            />
          </label>
          <button type="button" className="dc-pill-primary" disabled={adding || newModId.trim() === ""} onClick={addMod}>
            {adding ? "Adding…" : "Add mod"}
          </button>
        </div>
        {addError ? <p className="dc-warn">{addError instanceof Error ? addError.message : String(addError)}</p> : null}
      </div>

      <div className="dc-card dc-card--pad dc-list">
        <b className="dc-card__title">Servers</b>
        <div className="dc-dim">Every server the bot&rsquo;s in, with its subscription status and how many channel-topic bindings it has.</div>

        {data.guilds.length === 0 && <div className="dc-empty">The bot isn&rsquo;t in any servers yet.</div>}
        {data.guilds.map((g) => (
          <div key={g.id} className="dc-list__row">
            <div className="dc-topic-row__id">
              <div className="dc-topic-row__head">
                {g.iconUrl && <img src={g.iconUrl} alt="" className="dc-admin-avatar" referrerPolicy="no-referrer" />}
                <b>{g.name}</b>
                <span className="dc-dim">
                  {g.bindingCount} binding{g.bindingCount === 1 ? "" : "s"}
                </span>
              </div>
              <span className="dc-dim">
                {g.subscribed && g.subscription
                  ? `Subscribed since ${formatDate(g.subscription.createdAt)} · granted by ${userLabel(g.subscription.grantedBy).name}`
                  : "Free tier"}
              </span>
            </div>
            <div className="dc-topic-row__actions">
              <Link to={`/discord/servers/${g.id}?tab=topics`} className="dc-pill-outline dc-pill-outline--sm">
                Manage
              </Link>
              <button
                type="button"
                className={g.subscribed ? "dc-pill-outline dc-pill-outline--sm dc-pill-outline--danger" : "dc-pill-primary"}
                disabled={savingGuildId === g.id}
                onClick={() => toggleGuildSubscription(g.id, !g.subscribed)}
              >
                {savingGuildId === g.id ? "Saving…" : g.subscribed ? "Revoke" : "Grant subscription"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove mod?"
          message={`${userLabel(confirmRemove.discordUserId).name} will lose site-wide admin access.`}
          confirmLabel="Remove"
          onConfirm={() => {
            removeMod(confirmRemove.discordUserId);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </section>
  );
}

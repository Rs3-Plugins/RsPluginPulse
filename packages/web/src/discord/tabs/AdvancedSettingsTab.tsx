import { useEffect, useState } from "react";
import {
  addDiscordGuildAdmin,
  getDiscordGuildAdmins,
  removeDiscordGuildAdmin,
  type DiscordGuildAdmin,
  type DiscordGuildAdminsResponse,
} from "../../api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { LockIcon } from "../../components/icons";
import { LoadingState } from "../../components/LoadingState";
import { SubscribeModal } from "../SubscribeModal";

// Matches the API's own validation in admins/[discordUserId]/route.ts --
// checked here too so a typo shows up immediately instead of round
// tripping to the server first.
const SNOWFLAKE = /^\d{17,20}$/;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Only rendered by DiscordServer.tsx once it already knows the signed-in
// user is this guild's owner or an already-promoted admin (it has to ask
// the same /admins endpoint this tab loads from anyway, to decide
// whether to even show the tab) -- there's no separate "am I allowed to
// see this" check here. Subscribing/unsubscribing this guild is *not*
// done from here -- that's the site-wide admin panel's job
// (ProfileMenu.tsx's "Admin Management", for a site mod/the site owner)
// -- this tab only ever reads the subscription status, to decide whether
// to show the real content below or a locked upsell.
export function AdvancedSettingsTab({ guildId }: { guildId: string }) {
  const [data, setData] = useState<DiscordGuildAdminsResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [newAdminId, setNewAdminId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<unknown>(null);
  const [confirmRemove, setConfirmRemove] = useState<DiscordGuildAdmin | null>(null);
  const [removeError, setRemoveError] = useState<unknown>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  function load() {
    setLoadError(null);
    getDiscordGuildAdmins(guildId)
      .then(setData)
      .catch((err) => setLoadError(err));
  }

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  async function addAdmin() {
    const id = newAdminId.trim();
    if (!SNOWFLAKE.test(id)) {
      setAddError(new Error("That doesn't look like a Discord user ID (17-20 digits)."));
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await addDiscordGuildAdmin(guildId, id);
      setNewAdminId("");
      load();
    } catch (err) {
      setAddError(err);
    } finally {
      setAdding(false);
    }
  }

  async function removeAdmin(discordUserId: string) {
    setRemoveError(null);
    try {
      await removeDiscordGuildAdmin(guildId, discordUserId);
      load();
    } catch (err) {
      setRemoveError(err);
    }
  }

  if (loadError) {
    return <p className="dc-warn">Couldn&rsquo;t load Advanced Settings: {loadError instanceof Error ? loadError.message : String(loadError)}</p>;
  }
  if (!data) {
    return <LoadingState message="Loading Advanced Settings…" />;
  }

  function userLabel(id: string): { name: string; avatarUrl: string | null } {
    const user = data!.users[id];
    return user ? { name: user.username, avatarUrl: user.avatarUrl } : { name: id, avatarUrl: null };
  }

  return (
    <>
      <div className="dc-tab-head">
        <h2 className="dc-h4">Advanced Settings</h2>
        <span className="dc-muted">Add trusted Discord users who can edit this bot&rsquo;s settings here, without giving them Manage Server on the actual server.</span>
      </div>

      {!data.subscribed ? (
        <div className="dc-card dc-card--pad dc-locked-feature">
          <span className="dc-locked-feature__icon">
            <LockIcon size={18} />
          </span>
          <b className="dc-locked-feature__title">Advanced Settings is a subscriber feature</b>
          <p className="dc-locked-feature__desc">Subscribe to let trusted people manage bindings and other bot settings without full Discord permissions.</p>
          <button type="button" className="dc-pill-primary" onClick={() => setSubscribeOpen(true)}>
            Subscribe
          </button>
        </div>
      ) : (
        <div className="dc-card dc-card--pad dc-list">
          <b className="dc-card__title">Trusted editors</b>
          <div className="dc-dim">
            Subscribed since {data.subscription ? formatDate(data.subscription.createdAt) : "—"}. The server owner always has access. Anyone added here gets
            the same dashboard access -- editing bindings, the embed, nicknames, etc. -- whether or not they have Manage Server on the actual Discord server.
          </div>

          {data.admins.length === 0 && <div className="dc-empty">No extra editors yet.</div>}
          {data.admins.map((admin) => {
            const user = userLabel(admin.discordUserId);
            const addedBy = userLabel(admin.addedBy);
            return (
              <div key={admin.id} className="dc-list__row">
                <div className="dc-topic-row__id">
                  <div className="dc-topic-row__head">
                    {user.avatarUrl && <img src={user.avatarUrl} alt="" className="dc-admin-avatar" referrerPolicy="no-referrer" />}
                    <b>{user.name}</b>
                    <span className="dc-dim">{admin.discordUserId}</span>
                  </div>
                  <span className="dc-dim">
                    Added by {addedBy.name} &middot; {formatDate(admin.createdAt)}
                  </span>
                </div>
                <button type="button" className="dc-pill-outline dc-pill-outline--sm dc-pill-outline--danger" onClick={() => setConfirmRemove(admin)}>
                  Remove
                </button>
              </div>
            );
          })}
          {removeError ? <p className="dc-warn">{removeError instanceof Error ? removeError.message : String(removeError)}</p> : null}

          <div className="dc-form-row">
            <label className="dc-field dc-field--grow">
              <span>Add trusted editor (Discord user ID)</span>
              <input
                value={newAdminId}
                onChange={(e) => {
                  setNewAdminId(e.target.value);
                  setAddError(null);
                }}
                placeholder="e.g. 724620008658829363"
                className="dc-input dc-mono"
              />
            </label>
            <button type="button" className="dc-pill-primary" disabled={adding || newAdminId.trim() === ""} onClick={addAdmin}>
              {adding ? "Adding…" : "Add editor"}
            </button>
          </div>
          {addError ? <p className="dc-warn">{addError instanceof Error ? addError.message : String(addError)}</p> : null}
        </div>
      )}

      {subscribeOpen && <SubscribeModal onClose={() => setSubscribeOpen(false)} />}

      {confirmRemove && (
        <ConfirmDialog
          title="Remove editor?"
          message={`${userLabel(confirmRemove.discordUserId).name} will lose access to this server's dashboard.`}
          confirmLabel="Remove"
          onConfirm={() => {
            removeAdmin(confirmRemove.discordUserId);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </>
  );
}

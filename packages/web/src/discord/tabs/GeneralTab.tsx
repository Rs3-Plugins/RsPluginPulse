import { useState } from "react";
import { DiscordApiError, updateDiscordGuildSettings, type DiscordGuildSettings } from "../../api";
import { EditIcon, ResetIcon } from "../../components/icons";
import { AvatarPickerModal } from "../AvatarPickerModal";
import { MissingPermissionsNotice } from "../MissingPermissionsNotice";

const MAX_NICKNAME_LENGTH = 32;

// A staged-but-unsaved avatar change: a data URL for a newly picked image,
// "RESET" to clear back to the bot's global avatar on save, or null for
// "no avatar change pending".
type PendingAvatar = string | "RESET" | null;

export function GeneralTab({
  guildId,
  settings,
  onSettingsChange,
}: {
  guildId: string;
  settings: DiscordGuildSettings;
  onSettingsChange: (next: DiscordGuildSettings) => void;
}) {
  const [nickname, setNickname] = useState(settings.nickname ?? "");
  const [pendingAvatar, setPendingAvatar] = useState<PendingAvatar>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const previewUrl = pendingAvatar === "RESET" ? null : pendingAvatar ?? settings.avatarUrl;
  const showAvatarReset = pendingAvatar !== "RESET" && (settings.hasCustomAvatar || pendingAvatar !== null);
  const dirty = nickname !== (settings.nickname ?? "") || pendingAvatar !== null;

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const patch: { nickname?: string | null; avatarDataUrl?: string | null } = {};
      if (nickname !== (settings.nickname ?? "")) patch.nickname = nickname.trim() === "" ? null : nickname.trim();
      if (pendingAvatar === "RESET") patch.avatarDataUrl = null;
      else if (pendingAvatar) patch.avatarDataUrl = pendingAvatar;

      const res = await updateDiscordGuildSettings(guildId, patch);
      onSettingsChange(res.settings);
      setNickname(res.settings.nickname ?? "");
      setPendingAvatar(null);
      setSaved(true);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="dc-tab-head">
        <h2 className="dc-h4">General</h2>
        <span className="dc-muted">How the bot shows up in this server — its nickname and a per-server avatar.</span>
      </div>

      <div className="dc-embed-grid">
        <div className="dc-card dc-card--pad">
          <b className="dc-card__title">Bot identity</b>

          <div className="dc-field">
            <span>Avatar</span>
            <div className="dc-avatar-picker">
              <div className="dc-avatar-picker__btn">
                {previewUrl ? <img src={previewUrl} alt="" /> : <span className="dc-avatar-picker__placeholder">?</span>}
                <div className="dc-avatar-picker__overlay">
                  <button type="button" aria-label="Change bot avatar" onClick={() => setPickerOpen(true)}>
                    <EditIcon size={16} />
                  </button>
                  <button type="button" aria-label="Reset avatar to default" disabled={!showAvatarReset} onClick={() => setPendingAvatar("RESET")}>
                    <ResetIcon size={16} />
                  </button>
                </div>
              </div>
              <div className="dc-avatar-picker__meta">
                <span className="dc-dim">Pick a preset or upload and frame your own. Only shows up in this server.</span>
              </div>
            </div>
          </div>

          <label className="dc-field">
            <span>Bot name</span>
            <div className="dc-form-row dc-form-row--end">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, MAX_NICKNAME_LENGTH))}
                placeholder="PluginPulse"
                className="dc-input dc-field--grow"
              />
              {nickname !== "" && (
                <button type="button" className="dc-chip-btn dc-chip-btn--danger" onClick={() => setNickname("")}>
                  Reset
                </button>
              )}
            </div>
            <span className="dc-dim">
              {nickname.length}/{MAX_NICKNAME_LENGTH} — blank uses the bot&rsquo;s default name.
            </span>
          </label>
        </div>

        <div className="dc-embed-preview">
          <div className="dc-embed-preview__head">
            <span className="dc-dim">Preview</span>
          </div>
          <div className="dc-discord-msg">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="dc-discord-msg__avatar dc-discord-msg__avatar--app" />
            ) : (
              <img src="/logo/icon-2a-hex.svg" alt="" className="dc-discord-msg__avatar dc-discord-msg__avatar--app" />
            )}
            <div className="dc-discord-msg__body">
              <div className="dc-discord-msg__head">
                <b>{nickname || "PluginPulse"}</b>
                <span className="dc-discord-tag dc-discord-tag--bot">BOT</span>
                <span className="dc-discord-msg__time">Today at 14:02</span>
              </div>
              <span className="dc-embed__body">/plugin ground markers</span>
            </div>
          </div>
          <span className="dc-note">This is how the bot&rsquo;s name and avatar will look on its messages in this server.</span>
        </div>
      </div>

      <div className="dc-form-actions">
        {saveError ? (
          saveError instanceof DiscordApiError && saveError.code === "missing_permissions" ? (
            <MissingPermissionsNotice guildId={guildId} action="change its nickname/avatar" />
          ) : (
            <p className="dc-warn">{describeSaveError(saveError)}</p>
          )
        ) : null}
        {saved && !dirty && <span className="dc-dim">Saved.</span>}
        <button type="button" className="dc-pill-primary" disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {pickerOpen && (
        <AvatarPickerModal
          onClose={() => setPickerOpen(false)}
          onSelect={(dataUrl) => {
            setPendingAvatar(dataUrl);
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}

function describeSaveError(error: unknown): string {
  if (error instanceof DiscordApiError && error.code === "avatar_rate_limited") {
    return "Avatar changed too recently — Discord limits this. Try again in a few minutes.";
  }
  return error instanceof Error ? error.message : String(error);
}

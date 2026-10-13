import { discordInstallUrl } from "../api";

// Shown wherever a Discord call can fail with "missing_permissions" (see
// isMissingPermissionsError in packages/api/src/lib/discordAuth.ts) --
// the bot's requested invite permissions (buildBotInstallUrl) have grown
// over time as features were added, so a server that installed it early
// is often just missing something new rather than having actually denied
// anything. Re-inviting with guildId pre-selects this exact server in
// Discord's own picker (adding scope only ever grants more, never
// revokes what's already there), so it's a one-click fix rather than a
// "go figure out which permission" support question.
export function MissingPermissionsNotice({ guildId, action }: { guildId: string; action: string }) {
  return (
    <p className="dc-perm-warn">
      The bot doesn&rsquo;t have permission to {action}.{" "}
      <a href={discordInstallUrl(guildId)} className="dc-perm-warn__link">
        Re-invite the bot with updated permissions
      </a>
    </p>
  );
}

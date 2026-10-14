import { useEffect, useState } from "react";
import { DiscordApiError, getDiscordGuildCommands, setDiscordCommandEnabled } from "../../api";
import { LoadingState } from "../../components/LoadingState";

interface CommandDef {
  name: string;
  desc: string;
  locked?: boolean;
}
interface CommandGroup {
  label: string;
  items: CommandDef[];
}

// Mirrors packages/discord-bot/src/commands/index.ts's registry -- kept
// in sync by hand, same trade-off as the API's own TOGGLEABLE_COMMANDS
// (packages/api/src/lib/discordCommands.ts). "help" is locked on for the
// same reason it's excluded there: a server with everything else off
// still needs a way to see that's intentional.
const GROUPS: CommandGroup[] = [
  {
    label: "Lookups",
    items: [
      { name: "plugin", desc: "Look up a plugin" },
      { name: "author", desc: "Look up an author" },
      { name: "rank", desc: "Current leaderboard position" },
      { name: "leaderboard", desc: "Top plugins or authors for a period" },
      { name: "status", desc: "When the data last updated" },
    ],
  },
  {
    label: "Personal",
    items: [
      { name: "mystats", desc: "Stats for your linked author account" },
      { name: "link", desc: "Link your author account" },
      { name: "unlink", desc: "Remove a linked account" },
    ],
  },
  {
    label: "Always on",
    items: [{ name: "help", desc: "List everything this bot can do", locked: true }],
  },
];

export function CommandsTab({ guildId }: { guildId: string }) {
  const [disabled, setDisabled] = useState<Set<string> | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setDisabled(null);
    setLoadError(null);
    getDiscordGuildCommands(guildId)
      .then((res) => {
        if (!cancelled) setDisabled(new Set(res.disabled));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  // Optimistic: flips the switch immediately, reverts (and surfaces the
  // error) if the write fails, rather than waiting on a round trip before
  // the UI reacts at all.
  async function toggle(name: string, nextOn: boolean) {
    if (!disabled) return;
    const prev = disabled;
    const next = new Set(disabled);
    if (nextOn) next.delete(name);
    else next.add(name);
    setDisabled(next);
    setPending(name);
    setToggleError(null);
    try {
      await setDiscordCommandEnabled(guildId, name, nextOn);
    } catch (err) {
      setDisabled(prev);
      setToggleError(err);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="dc-tab-head">
        <h2 className="dc-h4">Commands</h2>
        <span className="dc-muted">Turned-off commands still appear in Discord but reply &ldquo;This command is disabled on this server.&rdquo;</span>
      </div>

      {loadError ? (
        <p className="dc-warn">Couldn&rsquo;t load commands: {loadError instanceof DiscordApiError ? loadError.code : loadError instanceof Error ? loadError.message : String(loadError)}</p>
      ) : !disabled ? (
        <LoadingState message="Loading commands…" />
      ) : (
        <>
          {toggleError && <p className="dc-warn">Couldn&rsquo;t update that command: {toggleError instanceof Error ? toggleError.message : String(toggleError)}</p>}
          {GROUPS.map((group) => (
            <div key={group.label} className="dc-card">
              <div className="dc-cmd-group__label">{group.label}</div>
              {group.items.map((c) => {
                const on = c.locked ? true : !disabled.has(c.name);
                return (
                  <div key={c.name} className="dc-cmd-row">
                    <div className="dc-cmd-row__id">
                      <span className="dc-mono">/{c.name}</span>
                      <span className="dc-dim">{c.desc}</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={c.name}
                      disabled={c.locked || pending === c.name}
                      className={`dc-switch ${on ? "on" : ""} ${c.locked ? "locked" : ""}`}
                      onClick={() => toggle(c.name, !on)}
                    >
                      <span className="dc-switch__knob" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </>
  );
}

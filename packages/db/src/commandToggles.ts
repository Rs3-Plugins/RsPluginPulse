// Per-server slash command toggles -- see schema.sql's comment on
// discord_command_toggles. Read by packages/discord-bot's interaction
// handler before running a command, written by the dashboard's Commands
// tab (packages/api's guilds/[guildId]/commands routes).
import { getPool } from "./client";

export async function listDisabledCommands(guildId: string): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT command_name FROM discord_command_toggles WHERE guild_id = $1`, [guildId]);
  return rows.map((r) => r.command_name as string);
}

// Used by the bot's own interaction handler -- one small indexed lookup
// per command invocation, not worth caching at this scale (see
// discord_command_toggles' own "missing = on" comment for why this stays
// a single-row existence check rather than reading a wider toggle map).
export async function isCommandDisabled(guildId: string, commandName: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT 1 FROM discord_command_toggles WHERE guild_id = $1 AND command_name = $2`, [guildId, commandName]);
  return rows.length > 0;
}

// enabled=true deletes the "disabled" row (back to the default-on state);
// enabled=false inserts one. ON CONFLICT DO NOTHING rather than an
// upsert since the row has no other columns to update -- it either
// exists or it doesn't.
export async function setCommandEnabled(guildId: string, commandName: string, enabled: boolean): Promise<void> {
  const pool = getPool();
  if (enabled) {
    await pool.query(`DELETE FROM discord_command_toggles WHERE guild_id = $1 AND command_name = $2`, [guildId, commandName]);
  } else {
    await pool.query(
      `INSERT INTO discord_command_toggles (guild_id, command_name) VALUES ($1, $2) ON CONFLICT (guild_id, command_name) DO NOTHING`,
      [guildId, commandName],
    );
  }
}

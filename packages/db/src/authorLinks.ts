// Discord-account-to-author links -- see schema.sql's comment on
// discord_author_links. Used by packages/discord-bot's /link, /unlink,
// /mystats slash commands (the only write path -- there's no dashboard
// write route, this is deliberately self-service only, see
// docs/discord-bot.md's "Account linking" section) and by the dashboard's
// read-only "Linked authors" tab (packages/api's linked-authors route).
import { getPool } from "./client";
import type { DiscordAuthorLink, DiscordLinkGame } from "./types";

function toLink(r: { id: number; discord_user_id: string; game: DiscordLinkGame; author_id: number; author_name: string; linked_at: Date }): DiscordAuthorLink {
  return {
    id: r.id,
    discordUserId: r.discord_user_id,
    game: r.game,
    authorId: r.author_id,
    authorName: r.author_name,
    linkedAt: r.linked_at.toISOString(),
  };
}

export async function getAuthorLinksForUser(discordUserId: string): Promise<DiscordAuthorLink[]> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM discord_author_links WHERE discord_user_id = $1 ORDER BY game`, [discordUserId]);
  return rows.map(toLink);
}

// Whole table -- used by the "Linked authors" tab, which then filters
// down to the viewing guild's own members live via the Discord API (see
// schema.sql's comment on why this table has no guild_id of its own).
// Fine to read in full at this feature's current scale; revisit if the
// table ever grows large enough for that filtering to get expensive.
export async function getAllAuthorLinks(): Promise<DiscordAuthorLink[]> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM discord_author_links ORDER BY discord_user_id, game`);
  return rows.map(toLink);
}

export async function upsertAuthorLink(discordUserId: string, game: DiscordLinkGame, authorId: number, authorName: string): Promise<DiscordAuthorLink> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO discord_author_links (discord_user_id, game, author_id, author_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_user_id, game) DO UPDATE SET author_id = $3, author_name = $4, linked_at = now()
     RETURNING *`,
    [discordUserId, game, authorId, authorName],
  );
  return toLink(rows[0]);
}

// Returns whether a row actually existed to remove -- /unlink uses this to
// tell "removed" from "you didn't have one linked" apart.
export async function deleteAuthorLink(discordUserId: string, game: DiscordLinkGame): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(`DELETE FROM discord_author_links WHERE discord_user_id = $1 AND game = $2`, [discordUserId, game]);
  return (rowCount ?? 0) > 0;
}

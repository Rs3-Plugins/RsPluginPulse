// Until the admin panel existed, there was no real billing/entitlement
// system at all -- SubscribeModal.tsx's own Subscribe button is still a
// disabled placeholder (no Stripe integration). Now there's a real, if
// manual, one: an admin (see schema.sql's discord_guild_admins) flips a
// guild in/out of the paid tier themselves via discord_guild_subscriptions
// instead of it coming from a payment webhook. Everything else is already
// written in terms of isGuildSubscribed rather than hardcoding "false"
// separately at each call site, so swapping in real Stripe billing later
// (if ever) only means changing this one function. Lives in packages/db
// (not packages/api's own lib) specifically so packages/discord-bot's
// hourly worker can import the exact same limits the dashboard enforces on
// write -- see memory (project_discord_avatar_picker_paid_tier).
import { getGuildSubscription, isGuildAdminRow, isSiteAdminRow } from "./queries";

// A guild's entitlement, not a user's -- a subscription attaches to
// whoever's guild it is, not to whichever Discord user happens to be
// looking at the dashboard or clicking "save" on a binding.
export async function isGuildSubscribed(guildId: string): Promise<boolean> {
  return (await getGuildSubscription(guildId)) !== null;
}

export const FREE_TOPIC_BINDING_LIMIT = 3;
export const PAID_TOPIC_BINDING_LIMIT = 8;

// Faster than the default means packages/discord-bot's hourly worker reads
// getPluginInfo/getAuthorProfile that much more often for this guild's
// bindings -- gated behind a subscription for the same reason the binding
// count is, not an arbitrary restriction.
export const FREE_TOPIC_INTERVAL_HOURS = 5;
export const PAID_TOPIC_INTERVAL_HOURS = 1;

// Enforced on write (the dashboard's PUT /channel-topics/[channelId]
// route) and again at render time in the worker (selectActiveBindings in
// packages/discord-bot/src/channelTopics.ts) -- same question either way,
// now that both are guild-keyed.
export async function guildTopicBindingLimit(guildId: string): Promise<number> {
  return (await isGuildSubscribed(guildId)) ? PAID_TOPIC_BINDING_LIMIT : FREE_TOPIC_BINDING_LIMIT;
}

export async function allowedGuildTopicIntervalHours(guildId: string): Promise<number[]> {
  return (await isGuildSubscribed(guildId)) ? [PAID_TOPIC_INTERVAL_HOURS, FREE_TOPIC_INTERVAL_HOURS] : [FREE_TOPIC_INTERVAL_HOURS];
}

// An *explicitly promoted* admin of this one guild's dashboard -- doesn't
// cover the guild's own Discord owner, who's always implicitly an admin
// via Discord's own `owner` flag (checked in packages/api's
// authorizeGuildAdminRequest, not here, since this module has no way to
// ask Discord anything).
export function isGuildAdmin(guildId: string, discordUserId: string): Promise<boolean> {
  return isGuildAdminRow(guildId, discordUserId);
}

// A site-wide mod -- a different, higher tier than isGuildAdmin above:
// that's scoped to one guild and granted by that guild's own owner; this
// is global, granted by the site owner (see authorizeSiteAdminRequest's
// SITE_OWNER_DISCORD_IDS bootstrap in discordAuth.ts, which this doesn't
// cover on its own, same reasoning as isGuildAdmin not covering the
// guild's Discord owner).
export function isSiteAdmin(discordUserId: string): Promise<boolean> {
  return isSiteAdminRow(discordUserId);
}

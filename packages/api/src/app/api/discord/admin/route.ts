import { countChannelTopicsByGuild, getAllGuildSubscriptions, listSiteAdmins } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeSiteAdminRequest, discordCorsOptions, fetchBotGuilds, fetchDiscordUserById, jsonWithDiscordCors } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Site-wide admin panel's read side -- global, not scoped to any one
// guild (see authorizeSiteAdminRequest). Every guild the bot's actually
// in (from Discord's own bot-token guild list, since there's no "guilds"
// table of our own), each tagged with its subscription status and
// binding count -- the "see data about the discords" half of the ask.
// Also lists the site-wide mods themselves, with every involved
// discord_user_id resolved to a username/avatar the same way the
// per-guild admin panel does.
export async function GET(request: Request) {
  const auth = await authorizeSiteAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const [mods, botGuilds, subscriptions, bindingCounts] = await Promise.all([
    listSiteAdmins(),
    fetchBotGuilds(),
    getAllGuildSubscriptions(),
    countChannelTopicsByGuild(),
  ]);

  const subscriptionByGuild = new Map(subscriptions.map((s) => [s.guildId, s] as const));
  const guilds = botGuilds.map((g) => ({
    id: g.id,
    name: g.name,
    iconUrl: g.iconUrl,
    subscribed: subscriptionByGuild.has(g.id),
    subscription: subscriptionByGuild.get(g.id) ?? null,
    bindingCount: bindingCounts.get(g.id) ?? 0,
  }));

  const userIds = new Set<string>();
  for (const mod of mods) {
    userIds.add(mod.discordUserId);
    userIds.add(mod.addedBy);
  }
  for (const sub of subscriptions) userIds.add(sub.grantedBy);

  const resolved = await Promise.all([...userIds].map(async (id) => [id, await fetchDiscordUserById(id).catch(() => null)] as const));
  const users = Object.fromEntries(resolved);

  return jsonWithDiscordCors(request, { mods, guilds, users });
}

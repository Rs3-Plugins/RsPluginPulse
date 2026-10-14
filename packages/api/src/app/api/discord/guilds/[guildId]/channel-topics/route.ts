import { allowedGuildTopicIntervalHours, getGuildTopicIntervalHours, guildTopicBindingLimit, isGuildAdmin, isGuildSubscribed, listChannelTopics } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, isCallerSiteAdmin, jsonWithDiscordCors } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Every channel-topic binding for this guild, plus the settings the tab
// needs to render its interval picker and binding-count UI -- see
// schema.sql's discord_channel_topics/discord_guild_topic_settings
// comments. Creating/editing/removing one binding is PUT/DELETE on
// channel-topics/[channelId]; changing the interval is PUT on
// channel-topics/settings. isAdmin/isSubscribed together, or isSiteAdmin
// alone, tell the tab whether to show the per-binding "Refresh now"
// button (see .../[channelId]/refresh) -- kept as two separate flags
// rather than one combined boolean because a site-wide mod gets the
// refresh button on *every* guild regardless of that guild's own
// subscription, while an ordinary guild owner/admin only gets it once
// their guild is actually subscribed.
export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const [topics, intervalHours, subscribed, maxBindings, allowedIntervals, admin, siteAdmin] = await Promise.all([
    listChannelTopics(guildId),
    getGuildTopicIntervalHours(guildId),
    isGuildSubscribed(guildId),
    guildTopicBindingLimit(guildId),
    allowedGuildTopicIntervalHours(guildId),
    auth.isOwner ? Promise.resolve(true) : isGuildAdmin(guildId, auth.session.discordUserId),
    isCallerSiteAdmin(auth.session),
  ]);

  return jsonWithDiscordCors(request, {
    topics,
    intervalHours,
    isSubscribed: subscribed,
    maxBindings,
    allowedIntervals,
    isAdmin: admin,
    isSiteAdmin: siteAdmin,
  });
}

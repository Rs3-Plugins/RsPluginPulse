import { isGuildAdmin, isGuildSubscribed, listChannelTopics } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, isCallerSiteAdmin, jsonWithDiscordCors } from "@/lib/discordAuth";
import { ChannelTopicPushError, pushChannelTopicNow } from "@/lib/channelTopicPush";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// An escape hatch that pushes one binding's current render to Discord
// right away, instead of waiting for packages/discord-bot's next hourly
// tick (or for its own refresh-interval gate to elapse). Two ways in:
// this guild's own owner/admin, but only once the guild's subscribed
// (Advanced Settings is a subscriber perk) -- OR a site-wide admin-panel
// mod/owner, who can force-refresh *any* guild's bindings regardless of
// that guild's own subscription status, same as their reach everywhere
// else in the site-wide panel.
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string; channelId: string }> }) {
  const { guildId, channelId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  if (!(await isCallerSiteAdmin(auth.session))) {
    const guildAdmin = auth.isOwner || (await isGuildAdmin(guildId, auth.session.discordUserId));
    if (!guildAdmin) return jsonWithDiscordCors(request, { error: "forbidden" }, { status: 403 });
    if (!(await isGuildSubscribed(guildId))) return jsonWithDiscordCors(request, { error: "subscription_required" }, { status: 403 });
  }

  const topics = await listChannelTopics(guildId);
  const binding = topics.find((t) => t.channelId === channelId);
  if (!binding) return jsonWithDiscordCors(request, { error: "not_found" }, { status: 404 });

  try {
    const topic = await pushChannelTopicNow(binding);
    return jsonWithDiscordCors(request, { topic });
  } catch (error) {
    if (error instanceof ChannelTopicPushError) {
      const status = error.reason === "entity_missing" ? 409 : error.reason === "missing_permissions" ? 403 : 502;
      return jsonWithDiscordCors(request, { error: error.reason }, { status });
    }
    console.error(`Manual channel-topic refresh failed for ${guildId}/${channelId}:`, error);
    return jsonWithDiscordCors(request, { error: "discord_error" }, { status: 502 });
  }
}

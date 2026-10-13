import { getGuildAnnouncementEmbed, listAnnouncementWatches, renderAnnouncementEmbed } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, isMissingPermissionsError, jsonWithDiscordCors, postChannelMessage, DiscordApiError } from "@/lib/discordAuth";
import { buildTestCandidate, buildTestMessageContent } from "@/lib/announcements";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Open to any user with normal dashboard access to this guild -- not
// admin-gated, unlike the per-guild Advanced Settings refresh button.
// This is a sanity check for a channel/embed-style setup someone's
// already allowed to edit ("does the bot actually have permission to
// post here, does the embed look right"), not a privileged power.
// Doesn't touch last_announced_at -- it's not a real announcement, just a
// one-off post using a real catalog plugin as sample data (see
// buildTestCandidate).
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string; id: string }> }) {
  const { guildId, id } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const watchId = Number(id);
  if (!Number.isInteger(watchId)) return jsonWithDiscordCors(request, { error: "invalid id" }, { status: 400 });

  const watches = await listAnnouncementWatches(guildId);
  const watch = watches.find((w) => w.id === watchId);
  if (!watch) return jsonWithDiscordCors(request, { error: "not_found" }, { status: 404 });

  const embedConfig = await getGuildAnnouncementEmbed(guildId);
  const candidate = await buildTestCandidate(watch.games[0] ?? "runescape", watch.kind);
  const payload = renderAnnouncementEmbed(candidate, embedConfig, watch.showThumbnail);
  const { content, allowedMentions } = buildTestMessageContent(watch);

  try {
    await postChannelMessage(watch.channelId, {
      content,
      allowed_mentions: allowedMentions,
      embeds: [
        {
          title: payload.title.slice(0, 256),
          description: payload.description.slice(0, 4096), // Discord's own embed description limit
          url: payload.url,
          color: payload.color,
          thumbnail: payload.thumbnailUrl ? { url: payload.thumbnailUrl } : undefined,
          footer: payload.footer ? { text: payload.footer.slice(0, 2048) } : undefined,
          author: payload.authorAvatarUrl ? { name: payload.authorName.slice(0, 256), icon_url: payload.authorAvatarUrl } : { name: payload.authorName.slice(0, 256) },
        },
      ],
    });
  } catch (error) {
    if (error instanceof DiscordApiError && isMissingPermissionsError(error.body)) {
      return jsonWithDiscordCors(request, { error: "missing_permissions" }, { status: 403 });
    }
    console.error(`Test announcement failed for watch ${watchId} (guild ${guildId}):`, error);
    return jsonWithDiscordCors(request, { error: "discord_error" }, { status: 502 });
  }

  return jsonWithDiscordCors(request, { ok: true });
}

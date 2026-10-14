import { getGuildAnnouncementEmbed, listEntityAnnouncements, renderAnnouncementEmbed } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, isMissingPermissionsError, jsonWithDiscordCors, postChannelMessage, DiscordApiError } from "@/lib/discordAuth";
import { buildTestCandidate, buildTestMessageContent } from "@/lib/announcements";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Same as the Global watches' own test route -- open to any user with
// normal dashboard access, not admin-gated. Uses the binding's own real
// entityName (a real plugin or author name, since Per-plugin/author
// bindings always know one) so the test reads as "yours" rather than a
// fully generic placeholder.
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string; id: string }> }) {
  const { guildId, id } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const bindingId = Number(id);
  if (!Number.isInteger(bindingId)) return jsonWithDiscordCors(request, { error: "invalid id" }, { status: 400 });

  const bindings = await listEntityAnnouncements(guildId);
  const binding = bindings.find((b) => b.id === bindingId);
  if (!binding) return jsonWithDiscordCors(request, { error: "not_found" }, { status: 404 });

  const testKind = binding.kind === "update" ? "update" : "release";
  const embedConfig = await getGuildAnnouncementEmbed(guildId);
  const candidate = await buildTestCandidate("runescape", testKind, { kind: binding.entityKind, id: binding.entityId, name: binding.entityName });
  const payload = renderAnnouncementEmbed(candidate, embedConfig, binding.showThumbnail);
  const { content, allowedMentions } = buildTestMessageContent(binding);

  try {
    await postChannelMessage(binding.channelId, {
      content,
      allowed_mentions: allowedMentions,
      embeds: [
        {
          title: payload.title.slice(0, 256),
          description: payload.description.slice(0, 4096),
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
    console.error(`Test announcement failed for binding ${bindingId} (guild ${guildId}):`, error);
    return jsonWithDiscordCors(request, { error: "discord_error" }, { status: 502 });
  }

  return jsonWithDiscordCors(request, { ok: true });
}

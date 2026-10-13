import { deleteChannelTopic, getAuthorProfile, getPluginInfo, guildTopicBindingLimit, listChannelTopics, upsertChannelTopic } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, fetchGuildChannels, jsonWithDiscordCors } from "@/lib/discordAuth";
import { ChannelTopicPushError, pushChannelTopicNow } from "@/lib/channelTopicPush";
import { isInt4 } from "@/lib/validate";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

const MAX_TEMPLATE_LENGTH = 300;

// Binds one channel to a plugin/author + template. Replaces whatever was
// previously bound to this channel, if anything (see schema.sql's
// UNIQUE(channel_id) on discord_channel_topics). Pushes the rendered
// topic to Discord immediately after saving (pushChannelTopicNow, the
// same renderer/pusher the manual refresh route and the hourly worker
// both use) rather than leaving it sitting at "Not pushed yet" until
// packages/discord-bot's next tick -- a failed push here (missing
// permissions, Discord down, the bound entity briefly not resolving,
// etc.) doesn't fail the save itself, it just falls back to that next
// tick the same as it always did.
export async function PUT(request: Request, { params }: { params: Promise<{ guildId: string; channelId: string }> }) {
  const { guildId, channelId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonWithDiscordCors(request, { error: "invalid body" }, { status: 400 });

  const { entityKind, entityId, template } = body as { entityKind?: string; entityId?: number; template?: string };

  if (entityKind !== "plugin" && entityKind !== "author") {
    return jsonWithDiscordCors(request, { error: "entityKind must be 'plugin' or 'author'" }, { status: 400 });
  }
  if (typeof entityId !== "number" || !isInt4(entityId)) {
    return jsonWithDiscordCors(request, { error: "entityId must be an integer" }, { status: 400 });
  }
  if (typeof template !== "string" || template.trim() === "" || template.length > MAX_TEMPLATE_LENGTH) {
    return jsonWithDiscordCors(request, { error: `template must be 1-${MAX_TEMPLATE_LENGTH} characters` }, { status: 400 });
  }

  try {
    // The channel has to actually belong to this guild -- channelId comes
    // from the URL, not re-derived from the (already permission-checked)
    // guildId, so without this a request could bind a channel in a guild
    // the caller doesn't manage.
    const channels = await fetchGuildChannels(guildId);
    const channel = channels.find((c) => c.id === channelId);
    if (!channel) return jsonWithDiscordCors(request, { error: "channel not found in this guild" }, { status: 404 });

    // The limit only applies to genuinely *new* bindings -- editing one
    // that already exists (same channelId already bound) doesn't add to
    // the count, so free-tier users can still freely tweak their existing
    // 2 without getting blocked by their own limit.
    const existing = await listChannelTopics(guildId);
    const isNewBinding = !existing.some((t) => t.channelId === channelId);
    if (isNewBinding) {
      const limit = await guildTopicBindingLimit(guildId);
      if (existing.length >= limit) {
        return jsonWithDiscordCors(request, { error: "topic_limit_reached", limit }, { status: 403 });
      }
    }

    let entityName: string;
    if (entityKind === "plugin") {
      const info = await getPluginInfo(entityId);
      if (!info) return jsonWithDiscordCors(request, { error: "plugin not found" }, { status: 404 });
      entityName = info.name;
    } else {
      const profile = await getAuthorProfile(entityId);
      if (!profile) return jsonWithDiscordCors(request, { error: "author not found" }, { status: 404 });
      entityName = profile.authorName;
    }

    const saved = await upsertChannelTopic({
      guildId,
      channelId,
      channelName: channel.name,
      entityKind,
      entityId,
      entityName,
      template: template.trim(),
    });

    // pushError rides along as a soft signal, not a failure -- the save
    // already succeeded above regardless of whether the push did. The
    // dashboard uses it to show a small "couldn't push yet" note (and a
    // re-invite prompt specifically for missing_permissions) rather than
    // silently leaving the binding at "Not pushed yet" with no
    // explanation.
    let pushError: "entity_missing" | "missing_permissions" | "discord_error" | null = null;
    const topic = await pushChannelTopicNow(saved).catch((error) => {
      console.error(`Immediate push failed for new/edited channel topic ${guildId}/${channelId}:`, error);
      pushError = error instanceof ChannelTopicPushError ? error.reason : "discord_error";
      return saved;
    });
    return jsonWithDiscordCors(request, { topic, pushError });
  } catch (error) {
    console.error(`Failed to save channel topic for ${guildId}/${channelId}:`, error);
    return jsonWithDiscordCors(request, { error: "discord_error" }, { status: 502 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ guildId: string; channelId: string }> }) {
  const { guildId, channelId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  await deleteChannelTopic(guildId, channelId);
  return jsonWithDiscordCors(request, { ok: true });
}

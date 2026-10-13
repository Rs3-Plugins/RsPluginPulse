// Shared by the save route (channel-topics/[channelId] PUT -- pushes a new
// or edited binding immediately instead of leaving it showing "Not pushed
// yet" until packages/discord-bot's next hourly tick) and the manual
// refresh route (channel-topics/[channelId]/refresh POST). Reuses the
// exact same renderChannelTopicText the worker uses, so this can never
// produce a different topic than the next real tick would have.
import { markChannelTopicRendered, renderChannelTopicText, type DiscordChannelTopic } from "@rspluginpulse/db";
import { DiscordApiError, isMissingPermissionsError, updateChannelTopic } from "./discordAuth";

const MAX_TOPIC_LENGTH = 1024; // Discord's own channel topic character limit

export class ChannelTopicPushError extends Error {
  constructor(
    message: string,
    public reason: "entity_missing" | "missing_permissions" | "discord_error",
  ) {
    super(message);
    this.name = "ChannelTopicPushError";
  }
}

export async function pushChannelTopicNow(binding: DiscordChannelTopic): Promise<DiscordChannelTopic> {
  const rendered = await renderChannelTopicText(binding);
  if (rendered === null) throw new ChannelTopicPushError("bound entity no longer exists", "entity_missing");

  const topic = rendered.slice(0, MAX_TOPIC_LENGTH);
  try {
    await updateChannelTopic(binding.channelId, topic);
  } catch (error) {
    // Distinguished from any other Discord failure so the dashboard can
    // prompt a re-invite (the bot needs Manage Channels on this specific
    // channel/category, which a server that installed the bot before
    // that permission was requested won't have) instead of a generic
    // "something went wrong".
    if (error instanceof DiscordApiError && isMissingPermissionsError(error.body)) {
      throw new ChannelTopicPushError("the bot doesn't have permission to edit this channel", "missing_permissions");
    }
    throw new ChannelTopicPushError(error instanceof Error ? error.message : String(error), "discord_error");
  }
  await markChannelTopicRendered(binding.id, topic);
  return { ...binding, lastRenderedTopic: topic, lastRenderedAt: new Date() };
}

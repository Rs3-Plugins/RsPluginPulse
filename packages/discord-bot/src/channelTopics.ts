// Hourly channel-topic refresh (docs/discord-bot.md's "Channel description
// templates") -- bindings are created from the dashboard's Channel topics
// tab (packages/web/src/discord/tabs/ChannelTopicsTab.tsx) and saved via
// upsertChannelTopic, but nothing actually pushes them to Discord until
// this runs. Reuses the already-open Gateway client's own REST methods
// (channel.setTopic) rather than hand-rolled fetch calls, since this
// process already holds a live discord.js Client.
import { ChannelType, type Client } from "discord.js";
import {
  DEFAULT_TOPIC_REFRESH_INTERVAL_HOURS,
  getAllGuildTopicIntervalHours,
  guildTopicBindingLimit,
  listAllChannelTopics,
  markChannelTopicRendered,
  renderChannelTopicText,
  type DiscordChannelTopic,
} from "@rspluginpulse/db";

const MAX_TOPIC_LENGTH = 1024; // Discord's own channel topic character limit
// Spreads updates out across a tick instead of firing every channel's PATCH
// back to back -- docs/discord-bot.md calls out Discord's ~2-edits-per-10-min
// per-channel limit specifically, but this also just avoids bursting the
// bot's overall REST rate budget when there are a lot of bindings at once.
const DELAY_BETWEEN_CHANNELS_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Groups bindings by guild and keeps only the oldest guildTopicBindingLimit
// of them per guild (listAllChannelTopics already orders by id, i.e.
// creation order) -- the rest are left out of this tick entirely. This is
// what makes a downgrade safe: nothing ever gets deleted when a guild
// drops from a subscription back to the free limit, the bindings past
// that limit just stop being actively refreshed (frozen at whatever topic
// they last had) until the guild's limit goes back up.
async function selectActiveBindings(bindings: DiscordChannelTopic[]): Promise<DiscordChannelTopic[]> {
  const byGuild = new Map<string, DiscordChannelTopic[]>();
  for (const binding of bindings) {
    const list = byGuild.get(binding.guildId);
    if (list) list.push(binding);
    else byGuild.set(binding.guildId, [binding]);
  }

  const active: DiscordChannelTopic[] = [];
  for (const [guildId, guildBindings] of byGuild) {
    const limit = await guildTopicBindingLimit(guildId);
    active.push(...guildBindings.slice(0, limit));
  }
  return active;
}

// The tick itself still runs every hour (see index.ts's
// CHANNEL_TOPICS_INTERVAL_MS) -- that's the finest interval anyone can
// configure (the paid 1h option), so it's checked here per-binding
// instead of varying the tick itself, which would mean either running
// every free-tier guild's tick too often or under-serving paid ones.
export async function refreshChannelTopics(client: Client<true>): Promise<void> {
  const [allBindings, intervals] = await Promise.all([listAllChannelTopics(), getAllGuildTopicIntervalHours()]);
  if (allBindings.length === 0) return;
  const bindings = await selectActiveBindings(allBindings);

  for (const binding of bindings) {
    try {
      if (binding.lastRenderedAt) {
        const intervalHours = intervals.get(binding.guildId) ?? DEFAULT_TOPIC_REFRESH_INTERVAL_HOURS;
        const hoursSinceRender = (Date.now() - binding.lastRenderedAt.getTime()) / (60 * 60 * 1000);
        if (hoursSinceRender < intervalHours) continue; // not due yet
      }

      const rendered = await renderChannelTopicText(binding);
      if (rendered === null) {
        console.warn(`Channel topic skipped for #${binding.channelName} (${binding.channelId}): ${binding.entityKind} ${binding.entityId} no longer exists`);
        continue;
      }
      const topic = rendered.slice(0, MAX_TOPIC_LENGTH);
      if (topic === binding.lastRenderedTopic) continue; // unchanged -- don't burn a rate-limited edit for nothing

      const channel = await client.channels.fetch(binding.channelId).catch(() => null);
      if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        console.warn(`Channel topic skipped for #${binding.channelName} (${binding.channelId}): channel missing or no longer text/announcement`);
        continue;
      }
      await channel.setTopic(topic);
      await markChannelTopicRendered(binding.id, topic);
      console.log(`[${new Date().toISOString()}] Channel topic updated for #${binding.channelName}: "${topic}"`);
    } catch (error) {
      console.error(`Failed to update channel topic for #${binding.channelName} (${binding.channelId}):`, error);
    }
    await sleep(DELAY_BETWEEN_CHANNELS_MS);
  }
}

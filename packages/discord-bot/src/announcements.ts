// Announcements posting tick (docs/discord-bot.md's "Notifications"
// section, now built): finds new plugins/releases since each Global
// watch row's or Per-plugin/author binding's own last_announced_at
// cursor (see schema.sql's discord_announcement_watches/
// discord_entity_announcements comments), posts one message per
// candidate, then advances the cursor. Per-plugin/author bindings are
// additive to Global watches, not a replacement -- a plugin matching
// both gets posted to both channels independently, each with its own
// cursor. An 'author' binding means "any plugin by this author", not a
// literal author-profile event -- it just widens the candidate filter
// from one plugin id to one author id.
import { type Client, type MessageMentionOptions } from "discord.js";
import {
  getGuildAnnouncementEmbed,
  getNewPluginCandidates,
  getPluginUpdateCandidates,
  listAllAnnouncementWatches,
  listAllEntityAnnouncements,
  markAnnouncementWatchAnnounced,
  markEntityAnnouncementAnnounced,
  renderAnnouncementEmbed,
  type AnnouncementCandidate,
  type AnnouncementCandidateFilter,
  type DiscordGuildAnnouncementEmbed,
  type DiscordPing,
} from "@rspluginpulse/db";

// Spreads posts out across a tick instead of firing every channel's
// message back to back -- same reasoning as channelTopics.ts's own
// DELAY_BETWEEN_CHANNELS_MS, just for Discord's general message-send
// rate limit rather than the channel-edit one.
const DELAY_BETWEEN_POSTS_MS = 2000;
const ALL_GAMES = ["runescape", "runelite"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Discord only actually *notifies* a role/@here/@everyone mention in
// content if allowed_mentions explicitly opts into it -- otherwise it
// renders as inert plain text. "everyone" as a parse type covers both
// literal @everyone and @here (same flag on Discord's side). pingHere/
// pingEveryone and pingRoleIds are independent (see schema.sql's comment
// on discord_announcement_watches), so this builds up content from
// whichever combination is actually set -- "@here <@&id1> <@&id2>" is a
// perfectly valid single message.
function pingContentAndMentions(ping: DiscordPing): { content: string | undefined; allowedMentions: MessageMentionOptions } {
  const parts: string[] = [];
  if (ping.pingEveryone) parts.push("@everyone");
  else if (ping.pingHere) parts.push("@here");
  parts.push(...ping.pingRoleIds.map((id) => `<@&${id}>`));

  if (parts.length === 0) return { content: undefined, allowedMentions: { parse: [] } };
  return {
    content: parts.join(" "),
    allowedMentions: {
      parse: ping.pingEveryone || ping.pingHere ? ["everyone"] : [],
      roles: ping.pingRoleIds,
    },
  };
}

async function postAnnouncement(
  client: Client<true>,
  channelId: string,
  candidate: AnnouncementCandidate,
  embedConfig: DiscordGuildAnnouncementEmbed,
  showThumbnail: boolean,
  ping: DiscordPing,
): Promise<boolean> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    console.warn(`Announcement skipped for channel ${channelId}: missing or not a postable text channel`);
    return false;
  }

  const payload = renderAnnouncementEmbed(candidate, embedConfig, showThumbnail);
  const { content, allowedMentions } = pingContentAndMentions(ping);

  try {
    await channel.send({
      content,
      allowedMentions,
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
    console.log(`[${new Date().toISOString()}] Announced ${candidate.kind} for ${candidate.pluginName} in #${channelId}`);
    return true;
  } catch (error) {
    console.error(`Failed to post announcement for ${candidate.pluginName} in channel ${channelId}:`, error);
    return false;
  }
}

export async function runAnnouncements(client: Client<true>): Promise<void> {
  const [watches, bindings] = await Promise.all([listAllAnnouncementWatches(), listAllEntityAnnouncements()]);
  if (watches.length === 0 && bindings.length === 0) return;

  // One getGuildAnnouncementEmbed call per guild per tick, not per row --
  // several watches/bindings commonly share the same guild.
  const embedCache = new Map<string, DiscordGuildAnnouncementEmbed>();
  async function embedFor(guildId: string): Promise<DiscordGuildAnnouncementEmbed> {
    const cached = embedCache.get(guildId);
    if (cached) return cached;
    const embed = await getGuildAnnouncementEmbed(guildId);
    embedCache.set(guildId, embed);
    return embed;
  }

  for (const watch of watches) {
    try {
      const candidates = watch.kind === "release" ? await getNewPluginCandidates(watch.lastAnnouncedAt, watch.games) : await getPluginUpdateCandidates(watch.lastAnnouncedAt, watch.games);
      if (candidates.length === 0) continue;

      const embedConfig = await embedFor(watch.guildId);
      for (const candidate of candidates) {
        const posted = await postAnnouncement(client, watch.channelId, candidate, embedConfig, watch.showThumbnail, watch);
        // Advanced after *every* successful post, not batched until the
        // whole candidate list is done -- a crash/restart partway through
        // a big batch (a slow tick, a process getting killed) would
        // otherwise leave the cursor at its old value and re-post
        // everything already sent next time around. Only skipped on an
        // outright post failure, so a genuinely failed one gets retried
        // next tick instead of silently skipped.
        if (posted) await markAnnouncementWatchAnnounced(watch.id, candidate.occurredAt);
        await sleep(DELAY_BETWEEN_POSTS_MS);
      }
    } catch (error) {
      console.error(`Failed to process announcement watch ${watch.id} (guild ${watch.guildId}):`, error);
    }
  }

  for (const binding of bindings) {
    try {
      const filter: AnnouncementCandidateFilter = binding.entityKind === "plugin" ? { pluginId: binding.entityId } : { authorId: binding.entityId };
      const wantRelease = binding.kind === "release" || binding.kind === "both";
      const wantUpdate = binding.kind === "update" || binding.kind === "both";
      const [releaseCandidates, updateCandidates] = await Promise.all([
        wantRelease ? getNewPluginCandidates(binding.lastAnnouncedAt, ALL_GAMES, filter) : Promise.resolve([]),
        wantUpdate ? getPluginUpdateCandidates(binding.lastAnnouncedAt, ALL_GAMES, filter) : Promise.resolve([]),
      ]);
      const candidates = [...releaseCandidates, ...updateCandidates].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      if (candidates.length === 0) continue;

      const embedConfig = await embedFor(binding.guildId);
      for (const candidate of candidates) {
        const posted = await postAnnouncement(client, binding.channelId, candidate, embedConfig, binding.showThumbnail, binding);
        if (posted) await markEntityAnnouncementAnnounced(binding.id, candidate.occurredAt);
        await sleep(DELAY_BETWEEN_POSTS_MS);
      }
    } catch (error) {
      console.error(`Failed to process entity announcement ${binding.id} (guild ${binding.guildId}):`, error);
    }
  }
}

// Shared by packages/discord-bot's announcement posting tick and the
// dashboard's own live preview (packages/web/src/discord/tabs/
// AnnouncementsTab.tsx) -- both need to turn an AnnouncementCandidate +
// a guild's embed config into the exact same embed payload, so this
// lives here rather than being duplicated between the two. Mirrors
// channelTopicRender.ts's own fillTemplate pattern.
import type { AnnouncementCandidate, DiscordGuildAnnouncementEmbed } from "./types";

export interface AnnouncementEmbedPayload {
  title: string;
  description: string;
  url: string;
  color: number; // decimal 0xRRGGBB, discord.js/REST embed color field
  thumbnailUrl: string | null;
  footer: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
}

function siteLabel(game: string): string {
  return game === "runescape" ? "mod.io" : "RuneLite Plugin Hub";
}

function gameLabel(game: string): string {
  return game === "runescape" ? "RuneScape" : "RuneLite";
}

function fillAnnouncementTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function parseColor(hex: string): number {
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? 0xcaa44d : parsed;
}

// showThumbnail is the *caller's* decision (the watch/binding row's own
// toggle) -- embed.showThumbnail is only ever read by the frontend as a
// prefill default for a newly created row, not re-checked here, so a
// row that explicitly turned its thumbnail on/off always wins regardless
// of what the guild's embed config currently defaults to.
export function renderAnnouncementEmbed(candidate: AnnouncementCandidate, embed: DiscordGuildAnnouncementEmbed, showThumbnail: boolean): AnnouncementEmbedPayload {
  const values: Record<string, string> = {
    name: candidate.pluginName,
    author: candidate.authorName,
    game: gameLabel(candidate.game),
    site: siteLabel(candidate.game),
    version: candidate.version ?? "",
    verb: candidate.kind === "release" ? "New plugin" : "Updated",
    verb_lower: candidate.kind === "release" ? "was just published" : candidate.version ? `updated to ${candidate.version}` : "was updated",
  };
  return {
    title: fillAnnouncementTemplate(embed.titleTemplate, values),
    description: fillAnnouncementTemplate(embed.descriptionTemplate, values),
    url: candidate.releaseUrl ?? candidate.profileUrl,
    color: parseColor(embed.color),
    thumbnailUrl: showThumbnail ? candidate.logoUrl : null,
    footer: embed.footerTemplate.trim() ? fillAnnouncementTemplate(embed.footerTemplate, values) : null,
    authorName: candidate.authorName,
    authorAvatarUrl: candidate.authorAvatarUrl,
  };
}

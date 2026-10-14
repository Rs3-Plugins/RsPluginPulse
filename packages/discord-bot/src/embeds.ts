// Shared embed builders used by more than one command -- buildAuthorEmbed
// is author.ts's own render, pulled out so mystats.ts (which can post up
// to two of these at once, one per linked game) doesn't duplicate it.
import { EmbedBuilder } from "discord.js";
import type { AuthorProfile } from "@rspluginpulse/db";
import { BRAND_COLOR, cardImageUrl, compact, downloadsUnit, siteUrl } from "./format";

export function buildAuthorEmbed(profile: AuthorProfile): EmbedBuilder {
  const topPlugins = profile.plugins
    .slice()
    .sort((a, b) => b.downloadsTotal - a.downloadsTotal)
    .slice(0, 5)
    .map((p) => `• [${p.name}](${siteUrl(`/plugin/${p.id}`)}) — ${compact(p.downloadsTotal)}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(profile.authorName)
    .setURL(siteUrl(`/author/${profile.authorId}`))
    .addFields(
      { name: "Plugins", value: String(profile.pluginCount), inline: true },
      { name: downloadsUnit(profile.game), value: compact(profile.totals.downloadsTotal), inline: true },
      { name: "Subscribers", value: compact(profile.totals.subscribersTotal), inline: true },
      { name: "All-time rank", value: profile.ranks.allTime ? `#${profile.ranks.allTime}` : "—", inline: true },
    )
    // The author's own visual stats card as the embed's main image,
    // reusing the existing /api/card renderer (see cardImageUrl's own
    // comment) -- always available, since an AuthorProfile can't exist
    // without at least one plugin row behind it.
    .setImage(cardImageUrl("author", profile.authorId));
  if (profile.authorAvatarUrl) embed.setThumbnail(profile.authorAvatarUrl);
  if (topPlugins) embed.addFields({ name: "Top plugins", value: topPlugins });
  return embed;
}

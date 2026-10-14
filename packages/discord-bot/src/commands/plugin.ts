import { EmbedBuilder, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from "discord.js";
import { getPluginInfo, searchPluginsAndAuthors } from "@rspluginpulse/db";
import { BRAND_COLOR, cardImageUrl, compact, downloadsUnit, GAME_CHOICES, siteUrl } from "../format";
import { resolvePluginId } from "../resolve";

export const data = new SlashCommandBuilder()
  .setName("plugin")
  .setDescription("Look up a plugin's stats")
  .addStringOption((o) => o.setName("name").setDescription("Plugin name").setRequired(true).setAutocomplete(true))
  .addStringOption((o) => o.setName("game").setDescription("Game (defaults to RuneScape)").addChoices(...GAME_CHOICES))
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const raw = interaction.options.getString("name", true);
  const game = interaction.options.getString("game") ?? "runescape";
  await interaction.deferReply();

  const id = await resolvePluginId(game, raw);
  if (id === null) {
    await interaction.editReply(`No plugin found matching "${raw}".`);
    return;
  }
  const info = await getPluginInfo(id);
  if (!info) {
    await interaction.editReply("That plugin no longer exists.");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(info.name)
    .setURL(siteUrl(`/plugin/${info.id}`))
    .setAuthor({ name: info.authorName, url: siteUrl(`/author/${info.authorId}`), iconURL: info.authorAvatarUrl ?? undefined })
    .addFields(
      { name: downloadsUnit(info.game), value: compact(info.downloadsTotal), inline: true },
      { name: "Subscribers", value: compact(info.subscribersTotal), inline: true },
      { name: "Rank", value: info.popularityRankPosition ? `#${info.popularityRankPosition}` : "—", inline: true },
    )
    // The plugin's own visual stats card, reusing the existing /api/card
    // renderer (see cardImageUrl's own comment and buildAuthorEmbed's
    // matching use for /author).
    .setImage(cardImageUrl("plugin", info.id));
  if (info.summary) embed.setDescription(info.summary.slice(0, 300));
  if (info.logoUrl) embed.setThumbnail(info.logoUrl);

  await interaction.editReply({ embeds: [embed] });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const game = interaction.options.getString("game") ?? "runescape";
  const focused = interaction.options.getFocused();
  const result = await searchPluginsAndAuthors(game, focused, 25, 0);
  await interaction.respond(result.plugins.map((p) => ({ name: `${p.name} — by ${p.author}`.slice(0, 100), value: String(p.id) })));
}

import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getSiteStats } from "@rspluginpulse/db";
import { BRAND_COLOR, compact, downloadsUnit, GAME_CHOICES, gameLabel } from "../format";

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show PluginPulse's current catalog stats")
  .addStringOption((o) => o.setName("game").setDescription("Game (defaults to RuneScape)").addChoices(...GAME_CHOICES))
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const game = interaction.options.getString("game") ?? "runescape";
  await interaction.deferReply();

  const stats = await getSiteStats(game);
  const updated = stats.updatedAt ? `<t:${Math.floor(new Date(stats.updatedAt).getTime() / 1000)}:R>` : "unknown";

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`PluginPulse — ${gameLabel(game)}`)
    .addFields(
      { name: "Plugins", value: compact(stats.pluginCount), inline: true },
      { name: "Authors", value: compact(stats.authorCount), inline: true },
      { name: downloadsUnit(game), value: compact(stats.downloadsTotal), inline: true },
      { name: "Subscribers", value: compact(stats.subscribersTotal), inline: true },
      { name: "Data last updated", value: updated, inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}

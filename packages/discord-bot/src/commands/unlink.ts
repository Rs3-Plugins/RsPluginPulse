import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { deleteAuthorLink, type DiscordLinkGame } from "@rspluginpulse/db";
import { BRAND_COLOR, GAME_CHOICES, gameLabel } from "../format";

export const data = new SlashCommandBuilder()
  .setName("unlink")
  .setDescription("Remove your linked author account for a game")
  .addStringOption((o) => o.setName("game").setDescription("Which linked catalog to remove").setRequired(true).addChoices(...GAME_CHOICES))
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const game = interaction.options.getString("game", true) as DiscordLinkGame;
  await interaction.deferReply({ ephemeral: true });

  const removed = await deleteAuthorLink(interaction.user.id, game);
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setDescription(removed ? `Removed your linked ${gameLabel(game)} author account.` : `You don't have a ${gameLabel(game)} author account linked.`);
  await interaction.editReply({ embeds: [embed] });
}

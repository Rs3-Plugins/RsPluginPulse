import { SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from "discord.js";
import { getAuthorProfile, searchPluginsAndAuthors } from "@rspluginpulse/db";
import { GAME_CHOICES } from "../format";
import { buildAuthorEmbed } from "../embeds";
import { resolveAuthorId } from "../resolve";

export const data = new SlashCommandBuilder()
  .setName("author")
  .setDescription("Look up an author's stats")
  .addStringOption((o) => o.setName("name").setDescription("Author name").setRequired(true).setAutocomplete(true))
  .addStringOption((o) => o.setName("game").setDescription("Game (defaults to RuneScape)").addChoices(...GAME_CHOICES))
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const raw = interaction.options.getString("name", true);
  const game = interaction.options.getString("game") ?? "runescape";
  await interaction.deferReply();

  const id = await resolveAuthorId(game, raw);
  if (id === null) {
    await interaction.editReply(`No author found matching "${raw}".`);
    return;
  }
  const profile = await getAuthorProfile(id);
  if (!profile) {
    await interaction.editReply("That author no longer exists.");
    return;
  }

  await interaction.editReply({ embeds: [buildAuthorEmbed(profile)] });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const game = interaction.options.getString("game") ?? "runescape";
  const focused = interaction.options.getFocused();
  const result = await searchPluginsAndAuthors(game, focused, 0, 25);
  await interaction.respond(result.authors.map((a) => ({ name: `${a.name} (${a.pluginCount} plugins)`.slice(0, 100), value: String(a.id) })));
}

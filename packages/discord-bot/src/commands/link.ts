// Trust-based linking (docs/discord-bot.md's "Account linking" section,
// low-friction option) -- takes the claimed author identity on trust with
// no verification step, since this only grants /mystats read access to
// stats that are already public via /author. One row per Discord user per
// game (discord_author_links' own UNIQUE constraint), so linking a second
// time for the same game just overwrites the first (upsertAuthorLink is
// an upsert, not an insert-only).
import { EmbedBuilder, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from "discord.js";
import { getAuthorProfile, searchPluginsAndAuthors, upsertAuthorLink, type DiscordLinkGame } from "@rspluginpulse/db";
import { BRAND_COLOR, cardImageUrl, GAME_CHOICES, gameLabel } from "../format";
import { resolveAuthorId } from "../resolve";

export const data = new SlashCommandBuilder()
  .setName("link")
  .setDescription("Link your author account so /mystats can find it")
  .addStringOption((o) => o.setName("game").setDescription("Which catalog this author identity is on").setRequired(true).addChoices(...GAME_CHOICES))
  .addStringOption((o) => o.setName("name").setDescription("Your author name").setRequired(true).setAutocomplete(true))
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const game = interaction.options.getString("game", true) as DiscordLinkGame;
  const raw = interaction.options.getString("name", true);
  await interaction.deferReply({ ephemeral: true });

  const id = await resolveAuthorId(game, raw);
  if (id === null) {
    await interaction.editReply(`No ${gameLabel(game)} author found matching "${raw}".`);
    return;
  }
  const profile = await getAuthorProfile(id);
  if (!profile) {
    await interaction.editReply("That author no longer exists.");
    return;
  }

  await upsertAuthorLink(interaction.user.id, game, profile.authorId, profile.authorName);

  // Their own visual stats card, same as /mystats and /author show -- a
  // little proof-of-link payoff beyond the plain text confirmation.
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setDescription(`Linked your ${gameLabel(game)} identity to **${profile.authorName}**. Run \`/mystats\` any time to check your stats, or \`/unlink game:${game}\` to remove this.`)
    .setImage(cardImageUrl("author", profile.authorId));
  await interaction.editReply({ embeds: [embed] });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const game = interaction.options.getString("game") ?? "runescape";
  const focused = interaction.options.getFocused();
  const result = await searchPluginsAndAuthors(game, focused, 0, 25);
  await interaction.respond(result.authors.map((a) => ({ name: `${a.name} (${a.pluginCount} plugins)`.slice(0, 100), value: String(a.id) })));
}

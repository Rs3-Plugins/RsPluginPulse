import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getAuthorLinksForUser, getAuthorProfile, type AuthorProfile } from "@rspluginpulse/db";
import { GAME_CHOICES } from "../format";
import { buildAuthorEmbed } from "../embeds";

export const data = new SlashCommandBuilder()
  .setName("mystats")
  .setDescription("Show the stats for your own linked author account(s)")
  .addStringOption((o) => o.setName("game").setDescription("Show just one game (defaults to every game you've linked)").addChoices(...GAME_CHOICES))
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const game = interaction.options.getString("game");
  // Deferred public (this posts the author's own stats same as /author
  // would), but the "nothing to show" cases below are a personal nudge,
  // not something the rest of the channel needs to see -- those delete
  // the public placeholder and follow up ephemerally instead of editing
  // it in place, since a deferred reply's ephemeral flag is fixed at
  // defer time and can't be switched after the fact.
  await interaction.deferReply();

  const links = await getAuthorLinksForUser(interaction.user.id);
  const filtered = game ? links.filter((l) => l.game === game) : links;
  if (filtered.length === 0) {
    await interaction.deleteReply();
    await interaction.followUp({
      content: game
        ? `You haven't linked a ${game} author account yet — run \`/link game:${game} name:<your author name>\` first.`
        : "You haven't linked an author account yet — run `/link` first.",
      ephemeral: true,
    });
    return;
  }

  const profiles = await Promise.all(filtered.map((l) => getAuthorProfile(l.authorId)));
  const embeds = profiles.filter((p): p is AuthorProfile => p !== null).map((p) => buildAuthorEmbed(p));
  if (embeds.length === 0) {
    await interaction.deleteReply();
    await interaction.followUp({ content: "The author account(s) you linked no longer exist.", ephemeral: true });
    return;
  }
  await interaction.editReply({ embeds });
}

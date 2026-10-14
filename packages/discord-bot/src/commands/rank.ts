import { EmbedBuilder, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from "discord.js";
import { getAuthorProfile, getAuthorRanks, getPlugin, getPluginRanks, searchPluginsAndAuthors } from "@rspluginpulse/db";
import { BRAND_COLOR, GAME_CHOICES, siteUrl } from "../format";
import { resolveAuthorId, resolvePluginId } from "../resolve";

// getPluginRanks only supports "alltime"/"hot" (no weekly/monthly) -- kept
// to that same pair here for both entity kinds rather than exposing a
// wider period option that would only work for authors.
const RANK_PERIOD_CHOICES = [
  { name: "All-time", value: "alltime" },
  { name: "Hot (today)", value: "hot" },
] as const;

export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Show a plugin or author's current leaderboard rank")
  .addStringOption((o) => o.setName("entity").setDescription("Plugin or author").setRequired(true).addChoices({ name: "Plugin", value: "plugin" }, { name: "Author", value: "author" }))
  .addStringOption((o) => o.setName("name").setDescription("Name to look up").setRequired(true).setAutocomplete(true))
  .addStringOption((o) => o.setName("period").setDescription("Ranking period (defaults to all-time)").addChoices(...RANK_PERIOD_CHOICES))
  .addStringOption((o) => o.setName("game").setDescription("Game (defaults to RuneScape)").addChoices(...GAME_CHOICES))
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const entity = interaction.options.getString("entity", true) as "plugin" | "author";
  const raw = interaction.options.getString("name", true);
  const period = (interaction.options.getString("period") ?? "alltime") as "alltime" | "hot";
  const game = interaction.options.getString("game") ?? "runescape";
  const periodLabel = period === "hot" ? "Hot" : "All-time";
  await interaction.deferReply();

  if (entity === "plugin") {
    const id = await resolvePluginId(game, raw);
    if (id === null) {
      await interaction.editReply(`No plugin found matching "${raw}".`);
      return;
    }
    const plugin = await getPlugin(id);
    if (!plugin) {
      await interaction.editReply("That plugin no longer exists.");
      return;
    }
    const ranks = await getPluginRanks([plugin.id], period, plugin.game);
    const rank = ranks.get(plugin.id);
    const embed = new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle(plugin.name)
      .setURL(siteUrl(`/plugin/${plugin.id}`))
      .setDescription(rank ? `**#${rank}** · ${periodLabel} rank` : "Not ranked yet.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

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
  const ranks = await getAuthorRanks([profile.authorId], period, profile.game);
  const rank = ranks.get(profile.authorId);
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(profile.authorName)
    .setURL(siteUrl(`/author/${profile.authorId}`))
    .setDescription(rank ? `**#${rank}** · ${periodLabel} rank` : "Not ranked yet.");
  await interaction.editReply({ embeds: [embed] });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const entity = interaction.options.getString("entity") ?? "plugin";
  const game = interaction.options.getString("game") ?? "runescape";
  const focused = interaction.options.getFocused();
  const result = await searchPluginsAndAuthors(game, focused, entity === "plugin" ? 25 : 0, entity === "author" ? 25 : 0);
  const choices =
    entity === "plugin"
      ? result.plugins.map((p) => ({ name: `${p.name} — by ${p.author}`.slice(0, 100), value: String(p.id) }))
      : result.authors.map((a) => ({ name: `${a.name} (${a.pluginCount} plugins)`.slice(0, 100), value: String(a.id) }));
  await interaction.respond(choices);
}

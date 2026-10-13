import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getTopAuthors, getTopPlugins, type Period } from "@rspluginpulse/db";
import { BRAND_COLOR, compact, GAME_CHOICES, gameLabel, siteUrl } from "../format";

const PERIOD_CHOICES = [
  { name: "All-time", value: "alltime" },
  { name: "Hot (today)", value: "hot" },
  { name: "Weekly", value: "weekly" },
  { name: "Monthly", value: "monthly" },
] as const;

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show the top plugins or authors")
  .addStringOption((o) => o.setName("type").setDescription("Plugins or authors").setRequired(true).addChoices({ name: "Plugins", value: "plugins" }, { name: "Authors", value: "authors" }))
  .addStringOption((o) => o.setName("period").setDescription("Ranking period (defaults to all-time)").addChoices(...PERIOD_CHOICES))
  .addIntegerOption((o) => o.setName("limit").setDescription("How many to show (default 10, max 20)").setMinValue(1).setMaxValue(20))
  .addStringOption((o) => o.setName("game").setDescription("Game (defaults to RuneScape)").addChoices(...GAME_CHOICES))
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const type = interaction.options.getString("type", true) as "plugins" | "authors";
  const period = (interaction.options.getString("period") ?? "alltime") as Period;
  const limit = interaction.options.getInteger("limit") ?? 10;
  const game = interaction.options.getString("game") ?? "runescape";
  await interaction.deferReply();

  const periodLabel = PERIOD_CHOICES.find((p) => p.value === period)?.name ?? period;

  const lines =
    type === "plugins"
      ? (await getTopPlugins(period, limit, game)).map((p, i) => `**${i + 1}.** [${p.name}](${siteUrl(`/plugin/${p.id}`)}) — ${compact(p.value)} · by ${p.authorName}`)
      : (await getTopAuthors(period, limit, game)).map((a, i) => `**${i + 1}.** [${a.authorName}](${siteUrl(`/author/${a.authorId}`)}) — ${compact(a.value)} · ${a.pluginCount} plugins`);

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`${type === "plugins" ? "Top Plugins" : "Top Authors"} — ${periodLabel} (${gameLabel(game)})`)
    .setDescription(lines.length ? lines.join("\n") : "No data yet.");

  await interaction.editReply({ embeds: [embed] });
}

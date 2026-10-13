import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BRAND_COLOR } from "../format";

// Hardcoded rather than built from the other command modules' own
// data/description -- that would need commands/index.ts (which builds the
// full command list, including this one) imported back into this file,
// a circular dependency. Five other commands is little enough that
// keeping this list in sync by hand is simpler than breaking the cycle.
const COMMAND_HELP = [
  { usage: "/plugin name:<name> [game]", description: "Look up a plugin's stats." },
  { usage: "/author name:<name> [game]", description: "Look up an author's stats." },
  { usage: "/rank entity:<plugin|author> name:<name> [period] [game]", description: "Just the current leaderboard rank, terser than the full lookup." },
  { usage: "/leaderboard type:<plugins|authors> [period] [limit] [game]", description: "Show the top plugins or authors." },
  { usage: "/status [game]", description: "Show the catalog's current totals and when the data last updated." },
  { usage: "/mystats [game]", description: "Show the stats for your own linked author account(s)." },
  { usage: "/link game:<runescape|runelite> name:<name>", description: "Link your author account so /mystats can find it." },
  { usage: "/unlink game:<runescape|runelite>", description: "Remove a linked author account." },
  { usage: "/help", description: "Show this message." },
];

export const data = new SlashCommandBuilder().setName("help").setDescription("List everything this bot can do").toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const description = COMMAND_HELP.map((c) => `**\`${c.usage}\`**\n${c.description}`).join("\n\n");
  const embed = new EmbedBuilder().setColor(BRAND_COLOR).setTitle("PluginPulse Bot Commands").setDescription(description).setFooter({ text: "rspluginpulse.com" });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

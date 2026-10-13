// Persistent Gateway connection so the bot shows up Online with a status
// summarizing the catalog ("Watching Plugins: N RuneScape, M RuneLite"),
// plus the read-only slash commands in ./commands (/plugin, /author,
// /rank, /leaderboard, /status, /help). Discord presence only exists for
// the duration of an open Gateway session (there's no REST endpoint for
// it), so this has to stay connected rather than running as a periodic
// oneshot the way ingest does -- see deploy/configure.sh's
// rspluginpulse-discord-bot systemd service (Type=simple/Restart=always,
// not the ingest timer's Type=oneshot).
import { ActivityType, Client, GatewayIntentBits } from "discord.js";
import { getPluginCountsByGame, isCommandDisabled } from "@rspluginpulse/db";
import { runAnnouncements } from "./announcements";
import { refreshChannelTopics } from "./channelTopics";
import { commands, commandsByName } from "./commands";
import { startInternalServer } from "./internalServer";

// /help is deliberately not toggleable -- a server that's turned every
// other command off still needs a way to see that's intentional (and
// what's still available) rather than every command going silently
// unresponsive with no explanation. Mirrors the dashboard Commands tab's
// own "help" row, which renders locked-on for the same reason.
const ALWAYS_ENABLED_COMMAND = "help";

const PRESENCE_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Matches ingest's own cadence (deploy/configure.sh's INGEST_INTERVAL) --
// no point re-rendering channel topics faster than the underlying plugin
// stats actually change. Kept at exactly 1h (not given the same slack as
// ANNOUNCEMENTS_TICK_INTERVAL_MS below) because the paid tier's own
// "Every 1h" channel-topics option (see packages/db/src/subscriptions.ts)
// promises that cadence -- a slower tick here would quietly cap every
// paid guild's real-world refresh rate below what they're actually paying
// for, which the per-binding "is it due yet" check alone can't make up
// for (it only fires as often as this tick does).
const CHANNEL_TOPICS_INTERVAL_MS = 60 * 60 * 1000;
// Deliberately *longer* than ingest's hourly cadence, not equal to it:
// this process's setInterval and ingest's systemd timer start
// independently (whenever each last restarted), so there's no guaranteed
// phase alignment between them. The extra 20 minutes is slack so that by
// the time this tick runs, the hourly ingest + ingest:releases-hourly
// steps (which actually populate the fresh plugins/plugin_releases rows
// this reads) have almost certainly already finished that cycle, rather
// than racing them. No paid-tier promise to protect here (unlike channel
// topics above), so there's no downside to the extra slack.
const ANNOUNCEMENTS_TICK_INTERVAL_MS = (60 + 20) * 60 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function buildStatusText(): Promise<string> {
  const counts = await getPluginCountsByGame();
  const runescape = counts.runescape ?? 0;
  const runelite = counts.runelite ?? 0;
  return `Plugins: ${runescape} RuneScape, ${runelite} RuneLite`;
}

async function updatePresence(client: Client<true>): Promise<void> {
  const text = await buildStatusText();
  client.user.setPresence({ activities: [{ name: text, type: ActivityType.Watching }], status: "online" });
  console.log(`[${new Date().toISOString()}] Presence set: Watching ${text}`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  startInternalServer(readyClient);

  // Global registration (as opposed to per-guild) -- can take up to an hour
  // to propagate to every server on first deploy, but means a newly
  // installed guild gets every command immediately with no separate
  // per-guild registration step. .set() replaces the whole command list,
  // so this alone is enough to add/remove/update commands on redeploy.
  await readyClient.application.commands
    .set(commands.map((c) => c.data))
    .then((registered) => console.log(`Registered ${registered.size} slash commands`))
    .catch((error) => console.error("Failed to register slash commands:", error));

  await updatePresence(readyClient).catch((error) => console.error("Failed to set initial presence:", error));
  setInterval(() => {
    updatePresence(readyClient).catch((error) => console.error("Failed to update presence:", error));
  }, PRESENCE_INTERVAL_MS);

  await refreshChannelTopics(readyClient).catch((error) => console.error("Failed to refresh channel topics:", error));
  setInterval(() => {
    refreshChannelTopics(readyClient).catch((error) => console.error("Failed to refresh channel topics:", error));
  }, CHANNEL_TOPICS_INTERVAL_MS);

  await runAnnouncements(readyClient).catch((error) => console.error("Failed to run announcements:", error));
  setInterval(() => {
    runAnnouncements(readyClient).catch((error) => console.error("Failed to run announcements:", error));
  }, ANNOUNCEMENTS_TICK_INTERVAL_MS);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commandsByName.get(interaction.commandName);
    if (!command) return;
    try {
      // Checked here, not registered as a per-guild Discord-side command
      // permission -- simplest correct approach per docs/discord-bot.md's
      // "Per-server command toggles" section, since it means every
      // command still registers normally and a disabled one just replies
      // with an explanation instead of silently disappearing. No check in
      // DMs (interaction.guildId is null there) since toggles are
      // per-guild and DMs have no guild to look one up for.
      if (interaction.guildId && interaction.commandName !== ALWAYS_ENABLED_COMMAND && (await isCommandDisabled(interaction.guildId, interaction.commandName))) {
        await interaction.reply({ content: "This command is disabled on this server.", ephemeral: true });
        return;
      }
      await command.execute(interaction);
    } catch (error) {
      console.error(`Slash command /${interaction.commandName} failed:`, error);
      const reply = { content: "Something went wrong running that command.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
  } else if (interaction.isAutocomplete()) {
    const command = commandsByName.get(interaction.commandName);
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(`Autocomplete for /${interaction.commandName} failed:`, error);
    }
  }
});

client.on("error", (error) => console.error("Discord client error:", error));

client.login(requiredEnv("DISCORD_BOT_TOKEN"));

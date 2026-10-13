// Kept in sync by hand with packages/discord-bot/src/commands/index.ts's
// own registry -- same trade-off the bot's own help.ts makes (see its
// comment) rather than pulling in the bot package (a discord.js consumer,
// not meant to be imported from here) just for this list. /help is
// deliberately excluded -- see ALWAYS_ENABLED_COMMAND's own comment in
// the bot's index.ts.
export const TOGGLEABLE_COMMANDS = new Set(["plugin", "author", "rank", "leaderboard", "status", "mystats", "link", "unlink"]);

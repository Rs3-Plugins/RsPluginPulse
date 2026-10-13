import { getPool, upsertGameUpdates } from "@rspluginpulse/db";
import { notifyIngestFailure } from "./discordNotify";
import { fetchGameUpdates } from "./wikiUpdates";

// Matches the "since 2024" backfill scope decided for this feature --
// ongoing Monday/Wednesday runs (see weekly-wiki-updates.yml) just pick up
// anything newer than this that wasn't already upserted.
const SINCE = "2024-01-01";

async function main() {
  console.log(`fetching game updates since ${SINCE}...`);
  // "oldschool" (not "runelite") -- RuneLite and OSRS-via-mod.io are the
  // same game, so both read this same set of scraped OSRS wiki updates.
  const [runescape, oldschool] = await Promise.all([
    fetchGameUpdates("runescape.wiki", "runescape", SINCE),
    fetchGameUpdates("oldschool.runescape.wiki", "oldschool", SINCE),
  ]);
  console.log(`fetched ${runescape.length} runescape.wiki + ${oldschool.length} oldschool.runescape.wiki updates`);
  const count = await upsertGameUpdates([...runescape, ...oldschool]);
  console.log(`upserted ${count} game updates`);
  await getPool().end();
}

main().catch(async (error) => {
  console.error(error);
  await notifyIngestFailure("wiki game updates", error);
  process.exit(1);
});

import { getPool, upsertGameUpdates } from "@rspluginpulse/db";
import { notifyIngestFailure } from "./discordNotify";
import { fetchGameUpdates } from "./wikiUpdates";

// OSRS has had RuneLite plugins for years, so its backfill scope goes back
// to 2024. RS3 only got third-party plugin support with the Plugin Beta
// (see special-events.json) -- anything on runescape.wiki before that date
// can't correlate with any plugin release/install data, so there's no
// point scraping it.
const RUNESCAPE_SINCE = "2026-10-06"; // Plugin Beta start
const OLDSCHOOL_SINCE = "2024-01-01";

async function main() {
  console.log(`fetching game updates since ${RUNESCAPE_SINCE} (runescape.wiki) / ${OLDSCHOOL_SINCE} (oldschool.runescape.wiki)...`);
  // "oldschool" (not "runelite") -- RuneLite and OSRS-via-mod.io are the
  // same game, so both read this same set of scraped OSRS wiki updates.
  const [runescape, oldschool] = await Promise.all([
    fetchGameUpdates("runescape.wiki", "runescape", RUNESCAPE_SINCE),
    fetchGameUpdates("oldschool.runescape.wiki", "oldschool", OLDSCHOOL_SINCE),
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

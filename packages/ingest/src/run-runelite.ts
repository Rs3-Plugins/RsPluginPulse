import { getPool, upsertPluginsAndSnapshot } from "@rspluginpulse/db";
import { notifyIngestFailure } from "./discordNotify";
import { fetchAllRuneLitePlugins } from "./runelite";

async function main() {
  const capturedAt = new Date();
  console.log(`fetching plugins from the RuneLite plugin hub...`);
  const mods = await fetchAllRuneLitePlugins();
  console.log(`fetched ${mods.length} plugins, writing snapshot at ${capturedAt.toISOString()}`);
  await upsertPluginsAndSnapshot(mods, capturedAt);
  console.log("done");
  await getPool().end();
}

main().catch(async (error) => {
  console.error(error);
  await notifyIngestFailure("RuneLite", error);
  process.exit(1);
});

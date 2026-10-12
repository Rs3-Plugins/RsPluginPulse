import { getPool, upsertPluginsAndSnapshot } from "@rspluginpulse/db";
import { notifyIngestFailure } from "./discordNotify";
import { fetchAllMods } from "./modio";

async function main() {
  const capturedAt = new Date();
  console.log(`fetching mods from mod.io...`);
  const mods = await fetchAllMods();
  console.log(`fetched ${mods.length} mods, writing snapshot at ${capturedAt.toISOString()}`);
  await upsertPluginsAndSnapshot(mods, capturedAt);
  console.log("done");
  await getPool().end();
}

main().catch(async (error) => {
  console.error(error);
  await notifyIngestFailure("mod.io (RS3)", error);
  process.exit(1);
});

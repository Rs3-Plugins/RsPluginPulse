// Targeted counterpart to run-release-ingest.ts (the weekly full-catalog
// scan): instead of re-checking every plugin's release history, this only
// fetches details for plugins listPluginsNeedingReleaseCheck flags as
// "date_updated has moved past the latest release we've recorded" --
// normally just a handful per hour, not the full 2,600+ RuneLite catalog,
// which is what makes running this hourly actually safe against GitHub's
// API rate limit (the weekly job's whole reason for being weekly in the
// first place -- see its own comment). Feeds packages/discord-bot's
// Announcements posting tick, which reads plugin_releases this writes to
// via getPluginUpdateCandidates/getNewPluginCandidates.
//
// Run hourly, right after the regular snapshot ingest (same systemd
// timer -- see deploy/configure.sh) so date_updated is already fresh by
// the time this checks it. Safe to re-run/safe if it fails partway:
// upsertPluginReleases is keyed on (plugin_id, source, source_key), and
// a plugin that still looks "needing a check" next hour just gets
// re-attempted then.
import { getPool, listPluginsNeedingReleaseCheck, upsertPluginReleases } from "@rspluginpulse/db";
import { notifyIngestFailure } from "./discordNotify";
import { withFirstSeenRelease } from "./firstSeenRelease";
import { fetchModioReleases } from "./modioReleases";
import { fetchPluginHubReleases } from "./pluginHubReleases";

const GITHUB_TOKEN = process.env.PLUGIN_HUB_TOKEN;
const SINCE = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();

async function main() {
  const modioPlugins = await listPluginsNeedingReleaseCheck("runescape");
  let modioReleaseCount = 0;
  for (const p of modioPlugins) {
    try {
      const releases = withFirstSeenRelease(p.id, "modio", p.dateAdded, await fetchModioReleases(p.id, SINCE));
      modioReleaseCount += await upsertPluginReleases(releases);
    } catch (error) {
      console.error(`  ${p.nameId}: FAILED -- ${(error as Error).message}`);
    }
  }
  if (modioPlugins.length > 0) console.log(`mod.io: ${modioReleaseCount} release(s) upserted across ${modioPlugins.length} plugin(s) needing a check`);

  const hubPlugins = await listPluginsNeedingReleaseCheck("runelite");
  let hubReleaseCount = 0;
  let hubFailures = 0;
  if (hubPlugins.length > 0 && !GITHUB_TOKEN) {
    console.warn(`WARNING: ${hubPlugins.length} RuneLite plugin(s) need a release check but no PLUGIN_HUB_TOKEN is set -- skipping, the weekly full scan will still catch them.`);
  } else {
    for (const p of hubPlugins) {
      try {
        const releases = withFirstSeenRelease(p.id, "plugin-hub", p.dateAdded, await fetchPluginHubReleases(p.id, p.nameId, GITHUB_TOKEN, SINCE));
        hubReleaseCount += await upsertPluginReleases(releases);
      } catch (error) {
        hubFailures++;
        console.error(`  ${p.nameId}: FAILED -- ${(error as Error).message}`);
      }
    }
    if (hubPlugins.length > 0) console.log(`plugin-hub: ${hubReleaseCount} release(s) upserted across ${hubPlugins.length} plugin(s) needing a check (${hubFailures} failed)`);
  }

  await getPool().end();
}

main().catch(async (error) => {
  console.error(error);
  await notifyIngestFailure("hourly release ingest", error);
  process.exit(1);
});

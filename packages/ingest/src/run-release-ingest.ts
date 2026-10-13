// Recurring release ingest: unlike backfill-releases.ts (a one-time full
// historical walk), this only checks for releases from the last ~9 days --
// a few days of slack past the weekly cadence so a missed/failed run never
// permanently drops a release, while keeping the GitHub call volume the
// same every week regardless of how far back history goes. Safe to re-run:
// upsertPluginReleases is keyed on (plugin_id, source, source_key), so
// anything already seen is just updated in place, not duplicated.
//
// Run weekly via .github/workflows/weekly-release-ingest.yml, which passes
// its own ephemeral per-run github.token in as PLUGIN_HUB_TOKEN -- no
// long-lived PAT needs to sit on the server for the scheduled job (manual
// runs of backfill-releases.ts still need one of your own though, since
// there's no Actions run backing those; see that file for why
// PLUGIN_HUB_TOKEN, not GITHUB_TOKEN, is the name either way).
import { getPool, listPluginIdsForGame, upsertPluginReleases } from "@rspluginpulse/db";
import { notifyIngestFailure } from "./discordNotify";
import { withFirstSeenRelease } from "./firstSeenRelease";
import { fetchModioReleases } from "./modioReleases";
import { fetchPluginHubReleases } from "./pluginHubReleases";

const GITHUB_TOKEN = process.env.PLUGIN_HUB_TOKEN;
const SINCE = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();

async function main() {
  if (!GITHUB_TOKEN) {
    console.warn(
      "WARNING: no PLUGIN_HUB_TOKEN set. Unauthenticated GitHub API calls are capped at 60/hour, and this " +
        "run needs one call per RuneLite plugin (2,600+) -- it will likely fail partway through. Set " +
        "PLUGIN_HUB_TOKEN directly in /srv/rspluginpulse/shared/.env on the server.",
    );
  }

  const modioPlugins = await listPluginIdsForGame("runescape");
  let modioReleaseCount = 0;
  for (const p of modioPlugins) {
    try {
      const releases = withFirstSeenRelease(p.id, "modio", p.dateAdded, await fetchModioReleases(p.id, SINCE));
      modioReleaseCount += await upsertPluginReleases(releases);
    } catch (error) {
      console.error(`  ${p.nameId}: FAILED -- ${(error as Error).message}`);
    }
  }
  console.log(`mod.io: ${modioReleaseCount} release(s) upserted across ${modioPlugins.length} plugins`);

  const hubPlugins = await listPluginIdsForGame("runelite");
  let hubReleaseCount = 0;
  let hubFailures = 0;
  for (let i = 0; i < hubPlugins.length; i++) {
    const p = hubPlugins[i];
    try {
      const releases = withFirstSeenRelease(p.id, "plugin-hub", p.dateAdded, await fetchPluginHubReleases(p.id, p.nameId, GITHUB_TOKEN, SINCE));
      hubReleaseCount += await upsertPluginReleases(releases);
    } catch (error) {
      hubFailures++;
      console.error(`  [${i + 1}/${hubPlugins.length}] ${p.nameId}: FAILED -- ${(error as Error).message}`);
    }
  }
  console.log(`plugin-hub: ${hubReleaseCount} release(s) upserted across ${hubPlugins.length} plugins (${hubFailures} failed)`);

  if (hubFailures > hubPlugins.length / 2) {
    throw new Error(`too many plugin-hub failures (${hubFailures}/${hubPlugins.length}) -- likely rate-limited or PLUGIN_HUB_TOKEN missing/invalid`);
  }

  await getPool().end();
}

main().catch(async (error) => {
  console.error(error);
  await notifyIngestFailure("release ingest", error);
  process.exit(1);
});

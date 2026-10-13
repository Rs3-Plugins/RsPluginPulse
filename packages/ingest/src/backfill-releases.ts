// ONE-TIME backfill: populates plugin_releases from each game's real
// upstream release history (mod.io file uploads for 'runescape', plugin-hub
// commits for 'runelite'). Not wired into any cron -- run manually:
//   PLUGIN_HUB_TOKEN=... npm run backfill:releases --workspace=@rspluginpulse/ingest
// Safe to re-run: upsertPluginReleases is keyed on (plugin_id, source,
// source_key), so anything already seen is just updated in place, not
// duplicated. A later recurring job can reuse the same two fetchers to pick
// up only new releases going forward.
//
// Named PLUGIN_HUB_TOKEN, not GITHUB_TOKEN -- deploy/render-env.mjs
// deliberately strips any key starting with GITHUB_/SSH_/ACTIONS_/RUNNER_
// (GitHub Actions' own CI plumbing) out of the rendered server .env, so a
// var actually called GITHUB_TOKEN would silently vanish on deploy even
// with the secret set.
import { getPool, listPluginIdsForGame, upsertPluginReleases } from "@rspluginpulse/db";
import { notifyIngestFailure } from "./discordNotify";
import { withFirstSeenRelease } from "./firstSeenRelease";
import { fetchModioReleases } from "./modioReleases";
import { fetchPluginHubReleases } from "./pluginHubReleases";

const GITHUB_TOKEN = process.env.PLUGIN_HUB_TOKEN;

// Matches plugin_snapshots' actual earliest data (2024-04-19) -- release
// history older than that isn't useful for anything on-site (no download
// trend data exists that far back to correlate it against anyway), and
// skipping it cuts the GitHub call volume/pagination considerably.
const SINCE = "2024-04-19T00:00:00.000Z";

async function main() {
  if (!GITHUB_TOKEN) {
    console.warn(
      "WARNING: no PLUGIN_HUB_TOKEN set. Unauthenticated GitHub API calls are capped at 60/hour, and this " +
        "backfill needs at least one call per RuneLite plugin (2,600+) plus extra calls for any plugin with " +
        "more than 100 hub commits -- this will take many hours and will likely fail partway through. Set " +
        "PLUGIN_HUB_TOKEN in .env (a plain classic personal access token with no scopes is enough for public " +
        "repo reads) and re-run. Continuing anyway in 10s...",
    );
    await new Promise((r) => setTimeout(r, 10_000));
  }

  console.log("backfilling mod.io (runescape) plugin releases...");
  const modioPlugins = await listPluginIdsForGame("runescape");
  let modioReleaseCount = 0;
  for (const p of modioPlugins) {
    try {
      const releases = withFirstSeenRelease(p.id, "modio", p.dateAdded, await fetchModioReleases(p.id, SINCE));
      modioReleaseCount += await upsertPluginReleases(releases);
      console.log(`  ${p.nameId}: ${releases.length} release(s)`);
    } catch (error) {
      console.error(`  ${p.nameId}: FAILED -- ${(error as Error).message}`);
    }
  }
  console.log(`mod.io done: ${modioReleaseCount} release(s) upserted across ${modioPlugins.length} plugins\n`);

  console.log("backfilling plugin-hub (runelite) plugin releases...");
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
    if ((i + 1) % 50 === 0 || i === hubPlugins.length - 1) {
      console.log(`  [${i + 1}/${hubPlugins.length}] ${hubReleaseCount} release(s) so far, ${hubFailures} plugin(s) failed`);
    }
  }
  console.log(`plugin-hub done: ${hubReleaseCount} release(s) upserted across ${hubPlugins.length} plugins (${hubFailures} failed)\n`);

  await getPool().end();
}

main().catch(async (error) => {
  console.error(error);
  await notifyIngestFailure("plugin releases backfill", error);
  process.exit(1);
});

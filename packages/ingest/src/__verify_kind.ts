import { getPool, upsertPluginReleases } from "@rspluginpulse/db";
import { fetchPluginHubReleases } from "./pluginHubReleases";

(async () => {
  const releases = await fetchPluginHubReleases(900000006, "117hd", process.env.PLUGIN_HUB_TOKEN, "2020-01-01T00:00:00.000Z");
  const flagged = releases.filter((r) => r.kind === "unavailable");
  console.log("flagged as unavailable:", flagged.length);
  console.log(flagged.map((r) => ({ changelog: r.changelog, releasedAt: r.releasedAt })));
  await upsertPluginReleases(releases);
  await getPool().end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

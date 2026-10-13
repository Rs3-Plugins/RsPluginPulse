import type { PluginReleaseInput } from "@rspluginpulse/db";

// If a plugin's real tracked release history starts meaningfully *after* when
// it was actually first published upstream (plugins.date_added) -- most
// commonly a RuneLite plugin added to the hub before the release backfill's
// GitHub `since` cutoff, whose genuine "add" commit can never be fetched --
// this synthesizes a release anchored at date_added so the chart's "Release"
// (the plugin's first version) tag lands on its true origin instead of
// misattributing it to whatever later update happened to be the earliest one
// actually reachable.
//
// Idempotent and safe to run on every plugin on every ingest, not just newly
// discovered ones: sourceKey is a fixed "first-seen" per plugin, so repeat
// runs just upsert the same row in place rather than duplicating it, and a
// plugin whose real history already reaches back to (or past) date_added
// gets left alone entirely.
const GAP_THRESHOLD_MS = 24 * 60 * 60 * 1000; // a day of slack before bothering

export function withFirstSeenRelease(
  pluginId: number,
  source: "modio" | "plugin-hub",
  dateAdded: string,
  releases: PluginReleaseInput[],
): PluginReleaseInput[] {
  const real = releases.filter((r) => r.kind === "update");
  const earliest = real.length === 0 ? null : real.reduce((min, r) => (r.releasedAt < min ? r.releasedAt : min), real[0].releasedAt);
  const addedMs = new Date(dateAdded).getTime();
  if (earliest !== null && new Date(earliest).getTime() - addedMs <= GAP_THRESHOLD_MS) {
    return releases; // real history already reaches back far enough
  }
  return [
    ...releases,
    {
      pluginId,
      source,
      sourceKey: "first-seen",
      kind: "update",
      releasedAt: dateAdded,
      version: null,
      changelog: null,
      url: null,
    },
  ];
}

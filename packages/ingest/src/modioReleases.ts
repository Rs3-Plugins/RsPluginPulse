import type { PluginReleaseInput } from "@rspluginpulse/db";

// Same unauthenticated web endpoint as modio.ts -- mod.io's RuneScape game
// has API key access disabled, so this is the only way in either way.
const API_BASE = "https://mod.io/v1";
const GAME_NAME_ID = "runescape";
const PAGE_SIZE = 100;

// mod.io mod ids are used directly as plugins.id for game='runescape' (see
// schema.sql), so the plugin id doubles as the mod id here. mod.io's /files
// endpoint has no server-side date filter and these catalogs are tiny (a
// handful of uploads per plugin), so `since` (ISO date) is just applied
// client-side after fetching everything.
export async function fetchModioReleases(pluginId: number, since: string): Promise<PluginReleaseInput[]> {
  const releases: PluginReleaseInput[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getFilesPage(pluginId, offset);
    for (const file of page.data) {
      releases.push({
        pluginId,
        source: "modio",
        sourceKey: String(file.id),
        kind: "update",
        releasedAt: new Date(file.date_added * 1000).toISOString(),
        version: file.version ?? null,
        changelog: file.changelog ?? null,
        url: null,
      });
    }
    if (releases.length >= page.result_total || page.result_count === 0) break;
  }
  return releases.filter((r) => r.releasedAt >= since);
}

async function getFilesPage(modId: number, offset: number): Promise<any> {
  const url = new URL(`${API_BASE}/games/@${GAME_NAME_ID}/mods/${modId}/files`);
  url.searchParams.set("_limit", String(PAGE_SIZE));
  url.searchParams.set("_offset", String(offset));
  const response = await fetch(url, {
    headers: { Accept: "application/json", "x-modio-origin": "web" },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} -> HTTP ${response.status}`);
  }
  return response.json();
}

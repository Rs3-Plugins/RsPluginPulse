import { getLatestSnapshotTime, getPluginIdByNameId, getPluginInfo } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

// Basic info for one plugin -- metadata plus its current stats (installs/
// downloads, subscribers, today) with no trend history, for callers that
// just want "what are this plugin's numbers right now" without paying for
// the full snapshot history /trend returns.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  // Same id/slug/game resolution as /trend -- see that route for why.
  const freshness = (await rememberBriefly("freshness:global", () => getLatestSnapshotTime())) ?? "none";

  async function loadPlugin(pluginId: number) {
    return remember(`plugin-info:${pluginId}`, CACHE_CEILING.ENTITY, freshness, () => getPluginInfo(pluginId));
  }

  let plugin = Number.isInteger(Number(id)) ? await loadPlugin(Number(id)) : null;
  if (!plugin) {
    const slugId = await getPluginIdByNameId(id, game);
    if (slugId !== null) plugin = await loadPlugin(slugId);
  }
  if (!plugin) {
    return jsonWithCors({ error: "plugin not found" }, { status: 404 });
  }

  return jsonWithCors(plugin, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } });
}

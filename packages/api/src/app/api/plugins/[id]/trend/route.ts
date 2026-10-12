import { getLatestSnapshotTime, getPlugin, getPluginIdByNameId, getPluginTrend } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  // Numeric ids are globally unique and need no game to disambiguate (the
  // original API contract, kept working unchanged); a pretty slug like
  // "117hd" is only unique per game, so that path needs `game` to resolve.
  // A plugin whose name_id happens to be all-digits makes the two
  // ambiguous -- if the numeric id doesn't resolve to a real plugin, fall
  // back to slug resolution before giving up.
  const freshness = (await rememberBriefly("freshness:global", () => getLatestSnapshotTime())) ?? "none";

  async function loadPlugin(pluginId: number) {
    return remember(`plugin-trend:${pluginId}`, CACHE_CEILING.ENTITY, freshness, async () => {
      const plugin = await getPlugin(pluginId);
      if (!plugin) return null;
      const trend = await getPluginTrend(pluginId);
      return { pluginId, plugin, trend };
    });
  }

  let result = Number.isInteger(Number(id)) ? await loadPlugin(Number(id)) : null;
  if (!result) {
    const slugId = await getPluginIdByNameId(id, game);
    if (slugId !== null) result = await loadPlugin(slugId);
  }
  if (!result) {
    return jsonWithCors({ error: "plugin not found" }, { status: 404 });
  }

  return jsonWithCors(result, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } });
}

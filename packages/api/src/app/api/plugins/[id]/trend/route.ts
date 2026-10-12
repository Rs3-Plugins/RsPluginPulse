import { getLatestSnapshotTime, getPlugin, getPluginTrend } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";
import { resolvePlugin } from "@/lib/resolveEntity";

export const OPTIONS = corsOptions;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  const freshness = (await rememberBriefly("freshness:global", () => getLatestSnapshotTime())) ?? "none";
  const result = await resolvePlugin(id, game, (pluginId) =>
    remember(`plugin-trend:${pluginId}`, CACHE_CEILING.ENTITY, freshness, async () => {
      const plugin = await getPlugin(pluginId);
      if (!plugin) return null;
      const trend = await getPluginTrend(pluginId);
      return { pluginId, plugin, trend };
    }),
  );
  if (!result) {
    return jsonWithCors({ error: "plugin not found" }, { status: 404 });
  }

  return jsonWithCors(result, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } });
}

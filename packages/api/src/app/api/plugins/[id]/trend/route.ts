import { getLatestSnapshotTime, getPlugin, getPluginTrend } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";

export const OPTIONS = corsOptions;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pluginId = Number(id);
  if (!Number.isInteger(pluginId)) {
    return jsonWithCors({ error: "invalid plugin id" }, { status: 400 });
  }

  // The plugin's game isn't known until getPlugin resolves it, so this
  // uses the global freshness signal rather than paying for a lookup just
  // to pick a cache key.
  const freshness = (await rememberBriefly("freshness:global", () => getLatestSnapshotTime())) ?? "none";
  const result = await remember(`plugin-trend:${pluginId}`, CACHE_CEILING.ENTITY, freshness, async () => {
    const plugin = await getPlugin(pluginId);
    if (!plugin) return null;
    const trend = await getPluginTrend(pluginId);
    return { pluginId, plugin, trend };
  });
  if (!result) {
    return jsonWithCors({ error: "plugin not found" }, { status: 404 });
  }

  return jsonWithCors(result);
}

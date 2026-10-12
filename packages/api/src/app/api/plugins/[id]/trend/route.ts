import { getPlugin, getPluginTrend } from "@rspluginpulse/db";
import { CACHE_TTL, remember } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";

export const OPTIONS = corsOptions;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pluginId = Number(id);
  if (!Number.isInteger(pluginId)) {
    return jsonWithCors({ error: "invalid plugin id" }, { status: 400 });
  }

  const result = await remember(`plugin-trend:${pluginId}`, CACHE_TTL.ENTITY, async () => {
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

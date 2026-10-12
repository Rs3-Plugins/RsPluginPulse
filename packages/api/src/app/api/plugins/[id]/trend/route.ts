import { getPlugin, getPluginTrend } from "@rspluginpulse/db";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";

export const OPTIONS = corsOptions;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pluginId = Number(id);
  if (!Number.isInteger(pluginId)) {
    return jsonWithCors({ error: "invalid plugin id" }, { status: 400 });
  }

  const plugin = await getPlugin(pluginId);
  if (!plugin) {
    return jsonWithCors({ error: "plugin not found" }, { status: 404 });
  }

  const trend = await getPluginTrend(pluginId);
  return jsonWithCors({ pluginId, plugin, trend });
}

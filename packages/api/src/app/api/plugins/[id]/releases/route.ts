import { getPluginReleases } from "@rspluginpulse/db";
import { CACHE_CEILING, remember } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";
import { resolvePlugin } from "@/lib/resolveEntity";

export const OPTIONS = corsOptions;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  const result = await resolvePlugin(id, game, (pluginId) =>
    remember(`plugin-releases:${pluginId}`, CACHE_CEILING.ENTITY, "releases", () => getPluginReleases(pluginId)),
  );
  if (!result) {
    return jsonWithCors({ error: "plugin not found" }, { status: 404 });
  }

  return jsonWithCors({ releases: result }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
}

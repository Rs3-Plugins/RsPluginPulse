import { getPluginReleasesForIds } from "@rspluginpulse/db";
import { CACHE_CEILING, remember } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";

export const OPTIONS = corsOptions;

// Batch form of /api/plugins/{id}/releases, for the Compare page (up to 4
// plugins at once) -- same `ids` convention as /api/compare's `keys` param.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const idsParam = searchParams.get("ids");
  if (!idsParam) {
    return jsonWithCors({ error: { status: 400, message: "ids is required" } }, { status: 400 });
  }
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));
  if (ids.length === 0) {
    return jsonWithCors({ error: { status: 400, message: "ids must be a comma-separated list of ids" } }, { status: 400 });
  }
  if (ids.length > 4) {
    return jsonWithCors({ error: { status: 400, message: "ids accepts at most 4 ids" } }, { status: 400 });
  }

  const key = `plugin-releases-batch:${[...ids].sort((a, b) => a - b).join(",")}`;
  const releases = await remember(key, CACHE_CEILING.ENTITY, "releases", async () => {
    const map = await getPluginReleasesForIds(ids);
    return Object.fromEntries(map);
  });

  return jsonWithCors({ releases }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
}

import { getLatestSnapshotTime, getPluginSparklines } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";
import { isInt4 } from "@/lib/validate";

export const OPTIONS = corsOptions;

const MAX_IDS = 50;
const MAX_DAYS = 90;

// Batch form for the author page's plugin-list sparklines -- one request
// for every plugin an author has at once, instead of a separate
// /api/plugins/{id}/trend call per plugin (that endpoint returns the whole
// snapshot history, not just the last `days` points this actually needs).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 20, 1), MAX_DAYS);

  const idsParam = searchParams.get("ids");
  if (!idsParam) {
    return jsonWithCors({ error: { status: 400, message: "ids is required" } }, { status: 400 });
  }
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => isInt4(n));
  if (ids.length === 0) {
    return jsonWithCors({ error: { status: 400, message: "ids must be a comma-separated list of ids" } }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return jsonWithCors({ error: { status: 400, message: `ids accepts at most ${MAX_IDS} ids` } }, { status: 400 });
  }

  const freshness = (await rememberBriefly(`freshness:${game}`, () => getLatestSnapshotTime(game))) ?? "none";
  const key = `plugin-sparklines:${game}:${days}:${[...ids].sort((a, b) => a - b).join(",")}`;
  const sparklines = await remember(key, CACHE_CEILING.ENTITY, freshness, async () => {
    const map = await getPluginSparklines(ids, game, days);
    return Object.fromEntries(map);
  });

  return jsonWithCors({ sparklines }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
}

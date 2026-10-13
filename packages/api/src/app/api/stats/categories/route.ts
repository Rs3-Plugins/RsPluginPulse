import { getCategoryStatsPage, getLatestSnapshotTime } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";
import { parseBoundedInt } from "@/lib/limit";

export const OPTIONS = corsOptions;

const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = parseBoundedInt(searchParams.get("pageSize"), 10, 1, MAX_PAGE_SIZE);

  const freshness = (await rememberBriefly(`freshness:${game}`, () => getLatestSnapshotTime(game))) ?? "none";
  const result = await remember(`stats:categories:${game}:${page}:${pageSize}`, CACHE_CEILING.LEADERBOARD, freshness, () =>
    getCategoryStatsPage(game, page, pageSize),
  );
  return jsonWithCors(result, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
}

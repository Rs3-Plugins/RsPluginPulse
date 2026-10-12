import { getCategoryStatsPage, getLatestSnapshotTime } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page")) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(searchParams.get("pageSize")) || 10)));

  const freshness = (await rememberBriefly(`freshness:${game}`, () => getLatestSnapshotTime(game))) ?? "none";
  const result = await remember(`stats:categories:${game}:${page}:${pageSize}`, CACHE_CEILING.LEADERBOARD, freshness, () =>
    getCategoryStatsPage(game, page, pageSize),
  );
  return jsonWithCors(result, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
}

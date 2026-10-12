import { getLatestSnapshotTime, getTopAuthors } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";
import { parsePeriod } from "@/lib/period";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = parsePeriod(searchParams.get("period")) ?? "alltime";
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 10000);
  const game = parseGame(searchParams.get("game"));

  const freshness = (await rememberBriefly(`freshness:${game}`, () => getLatestSnapshotTime(game))) ?? "none";
  const authors = await remember(`leaderboard:authors:${period}:${limit}:${game}`, CACHE_CEILING.LEADERBOARD, freshness, () =>
    getTopAuthors(period, limit, game),
  );
  return jsonWithCors({ period, authors });
}

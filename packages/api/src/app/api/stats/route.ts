import { getLatestSnapshotTime, getSiteStats } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  const freshness = (await rememberBriefly(`freshness:${game}`, () => getLatestSnapshotTime(game))) ?? "none";
  const stats = await remember(`stats:${game}`, CACHE_CEILING.LEADERBOARD, freshness, () => getSiteStats(game));
  return jsonWithCors(stats);
}

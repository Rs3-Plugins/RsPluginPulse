import { getLatestSnapshotTime, getNewestPlugins } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 10000);
  const game = parseGame(searchParams.get("game"));

  const freshness = (await rememberBriefly(`freshness:${game}`, () => getLatestSnapshotTime(game))) ?? "none";
  const plugins = await remember(`leaderboard:newest:${limit}:${game}`, CACHE_CEILING.LEADERBOARD, freshness, () =>
    getNewestPlugins(limit, game),
  );
  return jsonWithCors({ plugins });
}

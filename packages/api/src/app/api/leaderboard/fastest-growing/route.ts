import { getFastestGrowingPlugins, getLatestSnapshotTime } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 5) || 5, 100);
  const days = Math.min(Math.max(Number(searchParams.get("days") ?? 7) || 7, 1), 365);
  const game = parseGame(searchParams.get("game"));

  const freshness = (await rememberBriefly(`freshness:${game}`, () => getLatestSnapshotTime(game))) ?? "none";
  const plugins = await remember(`leaderboard:fastest-growing:${limit}:${days}:${game}`, CACHE_CEILING.LEADERBOARD, freshness, () =>
    getFastestGrowingPlugins(limit, days, game),
  );
  return jsonWithCors({ plugins });
}

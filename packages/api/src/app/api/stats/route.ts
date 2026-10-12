import { getSiteStats } from "@rspluginpulse/db";
import { CACHE_TTL, remember } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  const stats = await remember(`stats:${game}`, CACHE_TTL.LEADERBOARD, () => getSiteStats(game));
  return jsonWithCors(stats);
}

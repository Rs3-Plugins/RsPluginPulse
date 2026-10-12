import { getStatsOverview } from "@rspluginpulse/db";
import { CACHE_TTL, remember } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

const RANGES = [30, 90, 365] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("range") ?? 90);
  const range = (RANGES as readonly number[]).includes(requested) ? (requested as 30 | 90 | 365) : 90;
  const game = parseGame(searchParams.get("game"));

  const overview = await remember(`stats:overview:${range}:${game}`, CACHE_TTL.LEADERBOARD, () => getStatsOverview(range, game));
  return jsonWithCors(overview);
}

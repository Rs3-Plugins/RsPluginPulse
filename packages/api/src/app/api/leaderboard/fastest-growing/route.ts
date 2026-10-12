import { getFastestGrowingPlugins } from "@rspluginpulse/db";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 5) || 5, 100);
  const days = Math.min(Math.max(Number(searchParams.get("days") ?? 7) || 7, 1), 365);
  const game = parseGame(searchParams.get("game"));

  const plugins = await getFastestGrowingPlugins(limit, days, game);
  return jsonWithCors({ plugins });
}

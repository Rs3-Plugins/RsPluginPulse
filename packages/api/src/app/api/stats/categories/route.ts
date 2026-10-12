import { getCategoryStatsPage } from "@rspluginpulse/db";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page")) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(searchParams.get("pageSize")) || 10)));

  const result = await getCategoryStatsPage(game, page, pageSize);
  return jsonWithCors(result);
}

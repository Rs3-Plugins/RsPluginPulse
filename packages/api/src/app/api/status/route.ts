import { getLatestSnapshotTime } from "@rspluginpulse/db";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameParam = searchParams.get("game");
  const game = gameParam ? parseGame(gameParam) : undefined;

  const updatedAt = await getLatestSnapshotTime(game);
  return jsonWithCors({ updatedAt });
}

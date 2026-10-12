import { getLatestSnapshotTime } from "@rspluginpulse/db";
import { rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameParam = searchParams.get("game");
  const game = gameParam ? parseGame(gameParam) : undefined;

  // Filtering by game turns this into a join + seq scan across every
  // snapshot row (no game column on plugin_snapshots itself) -- ~100-200ms
  // on this dataset. Header.tsx calls this on every page/game switch, so
  // it's worth the same short memoize the other routes' freshness probes
  // use rather than paying that on every request.
  const updatedAt = await rememberBriefly(`freshness:${game ?? "global"}`, () => getLatestSnapshotTime(game));
  return jsonWithCors({ updatedAt });
}

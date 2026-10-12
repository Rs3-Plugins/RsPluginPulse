import { getLatestSnapshotTime } from "@rspluginpulse/db";
import { rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameParam = searchParams.get("game");
  const game = gameParam ? parseGame(gameParam) : undefined;

  // Reuses the same short memoize the other routes' freshness probes use
  // (same cache key) -- Header.tsx calls this on every page/game switch,
  // so even the now-fast indexed lookup is worth skipping on repeat hits.
  const updatedAt = await rememberBriefly(`freshness:${game ?? "global"}`, () => getLatestSnapshotTime(game));
  return jsonWithCors({ updatedAt }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
}

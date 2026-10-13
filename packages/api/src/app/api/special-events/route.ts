import { getSpecialEvents } from "@rspluginpulse/db";
import { CACHE_CEILING, remember } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !DATE_RE.test(from)) {
    return jsonWithCors({ error: { status: 400, message: "from is required and must be YYYY-MM-DD" } }, { status: 400 });
  }
  if (!to || !DATE_RE.test(to)) {
    return jsonWithCors({ error: { status: 400, message: "to is required and must be YYYY-MM-DD" } }, { status: 400 });
  }

  // These only change when someone hand-edits special-events.json, so (same
  // as game-updates) a once-a-day recompute per (game, range) is plenty.
  const today = new Date().toISOString().slice(0, 10);
  const events = await remember(`special-events:${game}:${from}:${to}`, CACHE_CEILING.ENTITY, today, () => getSpecialEvents(game, from, to));

  return jsonWithCors({ events }, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600" } });
}

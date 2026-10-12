import { searchPluginsAndAuthors } from "@rspluginpulse/db";
import { CACHE_TTL, remember } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const game = parseGame(searchParams.get("game"));
  const rawLimit = searchParams.get("limit");
  const pluginLimit = rawLimit ? Math.min(Math.max(Number(rawLimit) || 6, 1), 20) : undefined;
  const authorLimit = pluginLimit ? Math.max(1, Math.round(pluginLimit * (4 / 6))) : undefined;

  // Only the empty-query "trending" view is worth caching -- it's the one
  // response every header-search open with no typing hits, where every
  // other query is arbitrary user text with too much cardinality to reuse.
  const result = q.trim()
    ? await searchPluginsAndAuthors(game, q, pluginLimit, authorLimit)
    : await remember(`search:trending:${game}:${pluginLimit}:${authorLimit}`, CACHE_TTL.SEARCH_TRENDING, () =>
        searchPluginsAndAuthors(game, q, pluginLimit, authorLimit),
      );
  return jsonWithCors(result);
}

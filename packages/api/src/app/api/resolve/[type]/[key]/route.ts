import { getAuthorProfile, getPlugin } from "@rspluginpulse/db";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";
import { resolveAuthor, resolvePlugin } from "@/lib/resolveEntity";

export const OPTIONS = corsOptions;

// Resolves a plugin/author's pretty-URL slug (e.g. "117hd") to its numeric
// id -- useful for anything that only knows an entity by its slug (say,
// pulled from a page URL) but needs the id for an older integration or a
// bulk operation keyed by id. A numeric id passed in resolves straight
// through unchanged (after confirming it's real), so this also doubles as
// a plain existence check.
export async function GET(request: Request, { params }: { params: Promise<{ type: string; key: string }> }) {
  const { type, key } = await params;
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  if (type !== "plugin" && type !== "author") {
    return jsonWithCors({ error: { status: 400, message: "type must be one of: plugin, author" } }, { status: 400 });
  }

  const id =
    type === "plugin"
      ? await resolvePlugin(key, game, async (pluginId) => ((await getPlugin(pluginId)) ? pluginId : null))
      : await resolveAuthor(key, game, async (authorId) => ((await getAuthorProfile(authorId)) ? authorId : null));

  if (id === null) {
    return jsonWithCors({ error: { status: 404, message: `No ${type} found for "${key}"` } }, { status: 404 });
  }

  // Ids never change and a plugin/author's slug essentially never does
  // either, so this is safe to cache hard at the HTTP layer -- no need for
  // the server-side freshness-validated cache the stats endpoints use.
  return jsonWithCors({ id }, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}

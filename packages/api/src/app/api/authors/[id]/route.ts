import { getAuthorIdBySlug, getAuthorProfile, getLatestSnapshotTime } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  // Numeric ids are globally unique and need no game to disambiguate (the
  // original API contract, kept working unchanged); a pretty slug (derived
  // from the author's name, authors have no stored slug of their own) is
  // only unique per game, so that path needs `game` to resolve. An author
  // whose actual display name is itself all-digits (e.g. "117") makes the
  // two ambiguous -- if the numeric id doesn't resolve to a real author,
  // fall back to slug resolution before giving up, rather than assuming
  // digits-only always means "numeric id".
  const freshness = (await rememberBriefly("freshness:global", () => getLatestSnapshotTime())) ?? "none";

  async function loadAuthor(authorId: number) {
    return remember(`author:${authorId}`, CACHE_CEILING.ENTITY, freshness, () => getAuthorProfile(authorId));
  }

  let author = Number.isInteger(Number(id)) ? await loadAuthor(Number(id)) : null;
  if (!author) {
    const slugId = await getAuthorIdBySlug(id, game);
    if (slugId !== null) author = await loadAuthor(slugId);
  }
  if (!author) {
    return jsonWithCors({ error: "author not found" }, { status: 404 });
  }

  return jsonWithCors(author, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } });
}

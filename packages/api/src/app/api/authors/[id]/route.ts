import { getAuthorProfile, getLatestSnapshotTime } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";
import { resolveAuthor } from "@/lib/resolveEntity";

export const OPTIONS = corsOptions;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  const freshness = (await rememberBriefly("freshness:global", () => getLatestSnapshotTime())) ?? "none";
  const author = await resolveAuthor(id, game, (authorId) =>
    remember(`author:${authorId}`, CACHE_CEILING.ENTITY, freshness, () => getAuthorProfile(authorId)),
  );
  if (!author) {
    return jsonWithCors({ error: "author not found" }, { status: 404 });
  }

  return jsonWithCors(author, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } });
}
